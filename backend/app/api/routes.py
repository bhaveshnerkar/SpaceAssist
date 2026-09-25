"""
API routes for SpaceAssist AI.

Phase 3 adds a WebSocket channel: every state-changing call
(start / predict / reset) broadcasts the fresh snapshot to every
connected browser tab, so the dashboard updates instantly instead of
waiting for its next poll. Polling is kept as a fallback in the
frontend in case a network blocks WebSocket upgrades.

Camera-related endpoints are still stubbed here and become real in
Phase 5/6 once OpenCV + MediaPipe are wired in.
"""

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect, UploadFile, File
from fastapi.responses import StreamingResponse, Response, JSONResponse
from sqlalchemy.orm import Session
from sqlalchemy import desc
from datetime import datetime

from app.database.db import get_db
from app.models.models import ActivityEvent, Alert
from app.schemas.schemas import PredictRequest, CustomExperimentRequest
from app.services.experiment_service import experiment_service
from app.experiment.catalog import BUILTIN_EXPERIMENTS, MOTIONS, parse_txt_experiment
from app.reports.experiment_report import build_experiment_report, report_text
from app.services.ws_manager import manager
from app.services.demo_service import demo_runner
from app.ai.camera import camera_manager
from app.ai.activity_reporter import activity_reporter

router = APIRouter()


@router.get("/health")
def health():
    return {"status": "ok", "service": "SpaceAssist AI backend", "phase": 8}


@router.get("/experiment")
def get_experiment():
    """Current experiment snapshot — used to render the dashboard."""
    return experiment_service.get_state()


VALID_MODES = {"DEMO", "CAMERA"}


@router.post("/experiment/start")
async def start_experiment(mode: str = "CAMERA", template: str = "object-picking", db: Session = Depends(get_db)):
    """Start a fresh run. mode is 'DEMO' or 'CAMERA'."""
    mode = mode.upper()
    if mode not in VALID_MODES:
        raise HTTPException(status_code=400, detail=f"mode must be one of {sorted(VALID_MODES)}, got {mode!r}")
    if template not in BUILTIN_EXPERIMENTS:
        raise HTTPException(status_code=400, detail=f"Unknown experiment template: {template}")
    demo_runner.stop()  # a manual start should override any running auto-demo
    try:
        result = experiment_service.start(db, mode=mode, definition=BUILTIN_EXPERIMENTS[template])
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to start experiment: {exc}")
    await manager.broadcast({"event": "experiment_updated", "state": result})
    return result


@router.post("/experiment/reset")
async def reset_experiment(db: Session = Depends(get_db)):
    demo_runner.stop()  # abort any in-flight demo so it doesn't keep writing after reset
    try:
        result = experiment_service.reset(db)
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to reset experiment: {exc}")
    await manager.broadcast({"event": "experiment_updated", "state": result})
    return result


@router.post("/experiment/custom")
async def start_custom_experiment(payload: CustomExperimentRequest, db: Session = Depends(get_db)):
    """
    Start a user-defined science experiment: any procedure, typed in
    as a name plus an ordered list of steps. The app then guides an
    astronaut through it one step at a time via POST /experiment/advance
    — the same tracking, logging, and alerting the built-in experiment
    gets, just driven by manual confirmation instead of a confidence
    score, since there's no trained model that could recognize a
    freshly-typed, arbitrary procedure from a camera.
    """
    demo_runner.stop()
    try:
        result = experiment_service.start_custom(db, payload.name, [step.model_dump() for step in payload.steps])
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to start custom experiment: {exc}")
    await manager.broadcast({"event": "experiment_updated", "state": result})
    return result


@router.post("/experiment/advance")
async def advance_experiment(db: Session = Depends(get_db)):
    """
    Manually mark the current step complete and move to the next one.
    This is the primary way custom (typed-in) experiments are guided;
    it also works on the built-in experiment for manual testing.
    """
    try:
        result = experiment_service.advance(db)
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to advance experiment: {exc}")
    await manager.broadcast({"event": "prediction", "result": result, "state": experiment_service.get_state()})
    return result


@router.post("/demo/start")
async def start_demo():
    """
    Kick off the automatic, scripted Demo Mode sequence in the
    background. Returns immediately; the frontend watches progress via
    polling and/or the WebSocket channel.
    """
    started = demo_runner.start()
    return {
        "started": started,
        "message": "Demo sequence started." if started else "A demo run is already in progress.",
    }


@router.post("/demo/stop")
async def stop_demo():
    demo_runner.stop()
    return {"stopped": True}


@router.get("/demo/status")
def demo_status():
    return {"running": demo_runner.is_running()}


@router.post("/ai/predict")
async def predict(payload: PredictRequest, db: Session = Depends(get_db)):
    """
    Feed one (activity, confidence) prediction into the state machine.
    Demo Mode (Phase 4) and Camera Mode (Phase 6) both call this
    automatically; it can also be called directly via /docs or curl.
    Pydantic already rejects unknown activity names and out-of-range
    confidence values before this function ever runs.
    """
    try:
        result = experiment_service.predict(db, payload.activity, payload.confidence)
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to process prediction: {exc}")
    await manager.broadcast({"event": "prediction", "result": result, "state": experiment_service.get_state()})
    return result


@router.get("/experiments/catalog")
def experiment_catalog():
    return {"motions": MOTIONS, "experiments": [{"id": k, **v} for k, v in BUILTIN_EXPERIMENTS.items()]}

@router.post("/experiments/parse-txt")
async def parse_experiment_txt(file: UploadFile = File(...)):
    if not file.filename or not file.filename.lower().endswith(".txt"):
        raise HTTPException(status_code=400, detail="Please upload a .txt experiment file.")
    raw = await file.read()
    if len(raw) > 200_000:
        raise HTTPException(status_code=413, detail="TXT file is too large. Maximum 200 KB.")
    try:
        return parse_txt_experiment(raw.decode("utf-8-sig"), file.filename)
    except UnicodeDecodeError:
        raise HTTPException(status_code=400, detail="The TXT file must be UTF-8 encoded.")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

@router.get("/experiment/report")
def experiment_report(db: Session = Depends(get_db)):
    return build_experiment_report(experiment_service, db)

@router.get("/experiment/report/download/txt")
def download_experiment_report(db: Session = Depends(get_db)):
    text = report_text(build_experiment_report(experiment_service, db))
    filename = f"spaceassist-experiment-report-{datetime.utcnow().strftime('%Y%m%d-%H%M%S')}.txt"
    return Response(content=text, media_type="text/plain", headers={"Content-Disposition": f'attachment; filename="{filename}"'})

@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """
    Live-update channel. The frontend connects here and refetches its
    data whenever a message arrives, rather than trusting the payload
    shape directly — keeps the client resilient to future message
    format changes.
    """
    await manager.connect(websocket)
    try:
        while True:
            # We don't expect the client to send anything meaningful;
            # this just keeps the connection open and detects drops.
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)


@router.get("/experiment/history")
def get_history(db: Session = Depends(get_db)):
    exp_id = experiment_service.experiment_id
    if exp_id is None:
        return []
    events = (
        db.query(ActivityEvent)
        .filter(ActivityEvent.experiment_id == exp_id)
        .order_by(ActivityEvent.timestamp.asc())
        .all()
    )
    return [
        {
            "timestamp": e.timestamp.isoformat(),
            "expected": e.expected,
            "detected": e.detected,
            "confidence": e.confidence,
            "status": e.status,
        }
        for e in events
    ]


@router.get("/alerts")
def get_alerts(db: Session = Depends(get_db)):
    exp_id = experiment_service.experiment_id
    if exp_id is None:
        return []
    alerts = (
        db.query(Alert)
        .filter(Alert.experiment_id == exp_id)
        .order_by(desc(Alert.timestamp))
        .all()
    )
    return [
        {"timestamp": a.timestamp.isoformat(), "level": a.level, "message": a.message}
        for a in alerts
    ]


@router.get("/system/diagnostics")
def system_diagnostics():
    from app.ai.camera import OPENCV_AVAILABLE, camera_manager
    from app.ai.pose_detector import MEDIAPIPE_AVAILABLE, pose_detector
    from app.ai.activity_model import TORCH_AVAILABLE, activity_model
    return {
        "backend": "online",
        "opencv": OPENCV_AVAILABLE,
        "mediapipe_package": MEDIAPIPE_AVAILABLE,
        "pose_tracking": pose_detector.is_available(),
        "pose_error": pose_detector.pose_error,
        "hand_tracking": pose_detector._hands is not None,
        "hand_error": pose_detector.hand_error,
        "torch": TORCH_AVAILABLE,
        "trained_model": activity_model.is_trained(),
        "camera_open": camera_manager.is_open(),
    }

@router.get("/camera/status")
def camera_status():
    """Real check now: OpenCV installed? Camera hardware present? Currently streaming?"""
    return camera_manager.get_status()


@router.post("/camera/start")
def camera_start():
    success, message = camera_manager.open()
    if not success:
        raise HTTPException(status_code=503, detail=message)
    status = camera_manager.get_status()
    return {
        "success": True,
        "message": message,
        "mediapipe_installed": status.get("mediapipe_installed", False),
        "mediapipe_error": status.get("mediapipe_error"),
        "pose_tracking": status.get("mediapipe_installed", False),
    }


@router.post("/camera/stop")
def camera_stop():
    camera_manager.close()
    return {"success": True, "message": "Camera released."}


@router.get("/camera/pose")
def camera_pose():
    """
    Full landmark data from the most recent processed frame — the raw
    joint coordinates that Phase 7's activity recognition model will
    consume. Separate from /camera/status, which only summarizes counts.
    """
    return camera_manager.get_pose_result()


@router.get("/camera/observations")
def camera_observations():
    """
    The running text log of what the camera has observed, one entry
    per second of streaming: person detected, hands visible, and the
    (honestly reported) AI activity reading. This is a persistent
    record independent of the experiment state machine's own event
    log — useful as an audit trail, and each entry carries the raw
    landmark coordinates too, in case it's ever repurposed as
    real training data alongside the training/ pipeline.
    """
    log = camera_manager.get_observation_log()
    return {"count": len(log), "entries": log}


@router.get("/camera/observations/download")
def download_camera_observations():
    """Download the observation log as a plain-text file."""
    text = camera_manager.get_observation_log_text()
    filename = f"camera-observations-{datetime.utcnow().strftime('%Y%m%d-%H%M%S')}.txt"
    return Response(
        content=text,
        media_type="text/plain",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/camera/observations/clear")
def clear_camera_observations():
    camera_manager.clear_observation_log()
    return {"cleared": True}


@router.post("/camera/recording/start")
def start_camera_recording():
    """
    Starts auto-labeled training data collection: while active, every
    frame with a detected person is saved with whatever step the live
    experiment currently expects as its label — real training data
    from actually performing the procedure, not a separate manual
    per-activity recording session like training/collect_data.py.
    Requires an experiment to be running (Start Experiment or Start
    Demo first) and the camera to already be open.
    """
    success, message = camera_manager.start_recording()
    if not success:
        raise HTTPException(status_code=409, detail=message)
    return {"started": True, "message": message}


@router.post("/camera/recording/stop")
def stop_camera_recording():
    return camera_manager.stop_recording()


@router.post("/camera/recording/clear")
def clear_camera_recording():
    camera_manager.clear_recording()
    return {"cleared": True}


@router.get("/camera/recording/status")
def camera_recording_status():
    return camera_manager.get_recording_status()


@router.get("/camera/recording/download")
def download_camera_recording():
    """
    Downloads the recorded session as a CSV in EXACTLY the same shape
    training/extract_features.py produces — drop this file at
    dataset/features.csv (or merge it with an existing one) and
    training/train_model.py can train on it directly.
    """
    text = camera_manager.get_recording_csv_text()
    filename = f"recorded-session-{datetime.utcnow().strftime('%Y%m%d-%H%M%S')}.csv"
    return Response(
        content=text,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/camera/report/status")
def camera_report_status():
    """Live summary of the current activity-report session: how many
    discrete events (entered/moved/stopped/left) have been detected so far."""
    return activity_reporter.get_status()


@router.get("/camera/report")
def camera_report_json():
    """The full structured report as JSON, without triggering a download."""
    return JSONResponse(content=activity_reporter.generate_report())


@router.post("/camera/report/reset")
def reset_camera_report():
    activity_reporter.reset()
    return {"reset": True}


@router.get("/camera/report/download/txt")
def download_camera_report_txt():
    text = activity_reporter.report_as_text()
    filename = f"activity-report-{datetime.utcnow().strftime('%Y%m%d-%H%M%S')}.txt"
    return Response(
        content=text,
        media_type="text/plain",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/camera/report/download/json")
def download_camera_report_json():
    text = activity_reporter.report_as_json()
    filename = f"activity-report-{datetime.utcnow().strftime('%Y%m%d-%H%M%S')}.json"
    return Response(
        content=text,
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/camera/report/download/pdf")
def download_camera_report_pdf():
    pdf_bytes = activity_reporter.report_as_pdf_bytes()
    filename = f"activity-report-{datetime.utcnow().strftime('%Y%m%d-%H%M%S')}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/camera/stream")
def camera_stream():
    """
    MJPEG live feed. If the camera isn't already open, this tries to
    open it on demand; if that fails (no hardware, permission denied,
    OpenCV missing), it returns a clear 503 instead of hanging or
    crashing, so the frontend can fall back to the Demo Mode message.
    """
    if not camera_manager.is_open():
        opened, message = camera_manager.open()
        if not opened:
            raise HTTPException(status_code=503, detail=message)
    return StreamingResponse(
        camera_manager.generate_mjpeg(),
        media_type="multipart/x-mixed-replace; boundary=frame",
    )
