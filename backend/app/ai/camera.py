"""
Camera Module — Phase 5: OpenCV Webcam Capture

This module owns the actual webcam. Pose/hand landmark overlays are
added on top of these frames in Phase 6 (pose_detector.py) — this
file's only job is: open the camera if one exists, read frames from
it, and stream them as MJPEG.

Defensive by design, per the spec's error-handling requirements:
  - If OpenCV isn't installed, every method reports that clearly
    instead of raising an ImportError that crashes the whole backend.
  - If no camera hardware is found (wrong index, unplugged, or in use
    by another app), status/start report a clear message so the
    frontend can fall back to Demo Mode instead of hanging.
  - The MJPEG generator stops cleanly the moment the camera is closed
    or a frame read fails, rather than looping forever on garbage.
"""

import threading
import time
from collections import deque
from datetime import datetime

try:
    import cv2
    OPENCV_AVAILABLE = True
except ImportError:
    cv2 = None
    OPENCV_AVAILABLE = False

from app.ai.pose_detector import pose_detector, _TRACKED_JOINTS
from app.ai.activity_model import activity_model, SEQUENCE_LENGTH
from app.ai.activity_reporter import activity_reporter

CAMERA_INDEX = 0
JPEG_QUALITY = 80

# How often (in seconds) a new line is added to the observation log
# while the camera is streaming. Every frame would be far too noisy
# for a human-readable log; once a second is enough to see the story
# of what happened during a run.
OBSERVATION_LOG_INTERVAL_SECONDS = 1.0
MAX_OBSERVATION_LOG_ENTRIES = 2000

# Same cap for the auto-labeled training recorder, for the same reason.
MAX_RECORDING_ROWS = 5000


class CameraManager:
    """Owns a single VideoCapture device for this single-laptop prototype."""

    def __init__(self):
        self._capture = None
        self._lock = threading.Lock()
        self._last_pose_result = {
            "available": pose_detector.is_available(),
            "person_detected": False,
            "hands_detected": 0,
            "landmarks": {},
        }
        self._landmark_buffer = deque(maxlen=SEQUENCE_LENGTH)
        self._last_activity_prediction = {"activity": "Idle", "confidence": 0.0, "trained": False, "source": "waiting"}
        self._last_machine_prediction = {"activity": None, "sent_at": 0.0}
        self._last_person_seen = 0.0
        self._last_prediction_result = None
        self._observation_log = deque(maxlen=MAX_OBSERVATION_LOG_ENTRIES)
        self._last_log_time = 0.0

        # Auto-labeled training data recorder: while active, every
        # frame with a detected person gets its landmarks saved with
        # whatever step the experiment currently expects as the label
        # — real training data captured just by performing the actual
        # procedure, in the exact CSV shape train_model.py already
        # reads (see training/extract_features.py).
        self._recording = False
        self._recording_rows = deque(maxlen=MAX_RECORDING_ROWS)
        self._recording_last_label = None

    def is_open(self) -> bool:
        return self._capture is not None and self._capture.isOpened()

    def open(self):
        """Attempt to open the webcam. Returns (success: bool, message: str)."""
        if not OPENCV_AVAILABLE:
            return False, "OpenCV is not installed in this environment."

        with self._lock:
            if self.is_open():
                return True, "Camera already open."
            cap = cv2.VideoCapture(CAMERA_INDEX)
            if not cap.isOpened():
                cap.release()
                return False, (
                    f"No camera device detected at index {CAMERA_INDEX}. "
                    "Check that a webcam is connected, not already in use by "
                    "another application, and that camera permission is granted."
                )
            self._capture = cap
            return True, "Camera opened successfully."

    def close(self):
        with self._lock:
            if self._capture is not None:
                self._capture.release()
                self._capture = None

    def read_frame(self):
        """Returns (success: bool, frame) — frame is a BGR numpy array or None."""
        if not self.is_open():
            return False, None
        with self._lock:
            ok, frame = self._capture.read()
        return (True, frame) if ok else (False, None)

    def _log_observation(self, pose_result: dict, activity_prediction: dict):
        """Appends one human-readable text line describing this moment."""
        timestamp = datetime.utcnow()
        if pose_result["person_detected"]:
            description = (
                f"Person detected | Hands visible: {pose_result['hands_detected']} | "
                f"AI activity: {activity_prediction['activity']}"
            )
        elif pose_result["available"]:
            description = "No person detected in frame"
        else:
            description = "MediaPipe not installed — raw video only, no detection possible"

        entry = {
            "timestamp": timestamp.isoformat(),
            "text": description,
            "person_detected": pose_result["person_detected"],
            "hands_detected": pose_result["hands_detected"],
            "ai_activity": activity_prediction["activity"],
            # The raw landmark coordinates are kept too, not just the
            # human-readable summary — this is the same shape
            # extract_features.py in the training pipeline works with,
            # so a real future step could be exporting this log
            # alongside saved frames as genuine training data.
            "landmarks": pose_result.get("landmarks", {}),
        }
        self._observation_log.append(entry)

    def get_observation_log(self) -> list:
        """Returns the full in-memory observation log as a list of dicts."""
        return list(self._observation_log)

    def get_observation_log_text(self) -> str:
        """Formats the observation log as a plain-text file, newest entries last."""
        header = [
            "SpaceAssist AI — Camera Observation Log",
            f"Generated: {datetime.utcnow().isoformat()}",
            f"Total entries: {len(self._observation_log)}",
            "=" * 60,
            "",
        ]
        lines = [f"{entry['timestamp']}  {entry['text']}" for entry in self._observation_log]
        return "\n".join(header + lines) + "\n"

    def clear_observation_log(self):
        self._observation_log.clear()

    # ---- Auto-labeled training data recorder ----

    def start_recording(self):
        """Returns (success, message). Requires the camera to already be open."""
        if not self.is_open():
            return False, "Start the camera before starting a recording session."
        self._recording = True
        self._recording_rows.clear()
        self._recording_last_label = None
        return True, "Recording session started. Perform the experiment steps in front of the camera."

    def stop_recording(self):
        self._recording = False
        return {"stopped": True, "frames_recorded": len(self._recording_rows)}

    def clear_recording(self):
        self._recording_rows.clear()
        self._recording_last_label = None

    def get_recording_status(self) -> dict:
        label_counts = {}
        for row in self._recording_rows:
            label_counts[row["label"]] = label_counts.get(row["label"], 0) + 1
        return {
            "recording": self._recording,
            "frames_recorded": len(self._recording_rows),
            "current_label": self._recording_last_label,
            "label_counts": label_counts,
        }

    def get_recording_csv_text(self) -> str:
        """
        Formats recorded rows as CSV text in EXACTLY the same shape
        training/extract_features.py produces — same header, same
        joint order — so this can be saved as (or appended to)
        dataset/features.csv and fed straight into train_model.py.
        """
        header = ["label"] + [f"{joint}_{axis}" for joint in _TRACKED_JOINTS for axis in ("x", "y", "z", "v")]
        lines = [",".join(header)]
        for row in self._recording_rows:
            values = [row["label"]] + [f"{v:.6f}" for v in row["features"]]
            lines.append(",".join(values))
        return "\n".join(lines) + "\n"

    def _record_frame_if_active(self, pose_result: dict):
        """Called once per processed frame from generate_mjpeg(). Only
        records when: recording is on, a person was detected, and the
        live experiment currently expects a real step (not idle/done)."""
        if not self._recording or not pose_result["person_detected"]:
            self._recording_last_label = None
            return

        # Local import avoids a circular import at module load time
        # (experiment_service doesn't import camera.py, so this is
        # safe, but importing lazily here keeps the dependency
        # one-directional and easy to reason about).
        from app.services.experiment_service import experiment_service

        machine = experiment_service.machine
        if not machine.started or machine.completed:
            self._recording_last_label = None
            return

        expected_key = machine.expected_activity
        if expected_key is None:
            self._recording_last_label = None
            return

        # IMPORTANT: the label written to the CSV must be the raw
        # internal step key (e.g. "Pick_Container"), NOT the
        # human-readable display name ("Pick Container") — that's
        # what train_model.py's CLASSES list and
        # extract_features.py's folder names actually match against.
        # Using the display name here would silently produce a CSV
        # that trains on zero rows, since nothing would match.
        label = expected_key
        self._recording_last_label = machine.display_names.get(expected_key, expected_key)

        landmarks = pose_result.get("landmarks", {})
        features = []
        for joint in _TRACKED_JOINTS:
            point = landmarks.get(joint, {"x": 0.0, "y": 0.0, "z": 0.0, "visibility": 0.0})
            features.extend([point["x"], point["y"], point["z"], point["visibility"]])

        self._recording_rows.append({"label": label, "features": features})

    def get_pose_result(self) -> dict:
        """Full landmark data from the most recent frame — this is what
        Phase 7's activity_model.py consumes as its input features."""
        result = dict(self._last_pose_result)
        result["activity_prediction"] = self._last_activity_prediction
        result["experiment_result"] = self._last_prediction_result
        return result

    def get_status(self) -> dict:
        if not OPENCV_AVAILABLE:
            return {
                "available": False,
                "opencv_installed": False,
                "streaming": False,
                "mediapipe_installed": pose_detector.is_available(),
                "message": (
                    "OpenCV is not installed. Run `pip install opencv-python` "
                    "in the backend virtual environment, or continue using Demo Mode."
                ),
            }

        if self.is_open():
            width = int(self._capture.get(cv2.CAP_PROP_FRAME_WIDTH))
            height = int(self._capture.get(cv2.CAP_PROP_FRAME_HEIGHT))
            return {
                "available": True,
                "opencv_installed": True,
                "streaming": True,
                "resolution": f"{width}x{height}",
                "message": "Camera is open and streaming.",
                "mediapipe_installed": pose_detector.is_available(),
                "mediapipe_error": pose_detector.pose_error,
                "hand_tracking": pose_detector._hands is not None,
                "person_detected": self._last_pose_result["person_detected"],
                "hands_detected": self._last_pose_result["hands_detected"],
                "ai_activity": self._last_activity_prediction["activity"],
                "ai_confidence": self._last_activity_prediction.get("confidence", 0),
                "ai_source": self._last_activity_prediction.get("source", "camera"),
                "model_trained": self._last_activity_prediction["trained"],
            }

        # Not currently open — probe once, briefly, to give an honest
        # answer without leaving a background capture handle open.
        cap = cv2.VideoCapture(CAMERA_INDEX)
        opened = cap.isOpened()
        resolution = None
        if opened:
            width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
            height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
            resolution = f"{width}x{height}"
        cap.release()

        if opened:
            return {
                "available": True,
                "opencv_installed": True,
                "streaming": False,
                "resolution": resolution,
                "mediapipe_installed": pose_detector.is_available(),
                "mediapipe_error": pose_detector.pose_error,
                "hand_tracking": pose_detector._hands is not None,
                "message": "Camera detected. Click Start Camera to begin streaming.",
            }

        return {
            "available": False,
            "opencv_installed": True,
            "streaming": False,
            "mediapipe_installed": pose_detector.is_available(),
            "mediapipe_error": pose_detector.pose_error,
            "hand_tracking": pose_detector._hands is not None,
            "message": (
                f"No camera device detected at index {CAMERA_INDEX}. "
                "Check the connection and permissions, or continue using Demo Mode."
            ),
        }

    def generate_mjpeg(self):
        """Stream camera frames, run MediaPipe, classify motion and feed the
        active experiment state machine.  The browser only needs to display
        this stream; recognition is performed server-side on every frame.
        """
        frame_count = 0
        start_time = time.time()
        while self.is_open():
            ok, frame = self.read_frame()
            if not ok:
                break

            frame, pose_result = pose_detector.process(frame)
            self._last_pose_result = pose_result

            if pose_result["person_detected"]:
                self._last_person_seen = time.time()
                self._landmark_buffer.append(pose_result["landmarks"])
                expected = None
                try:
                    from app.services.experiment_service import experiment_service
                    machine = experiment_service.machine
                    expected = machine.expected_activity if machine.started and not machine.completed else None
                except Exception:
                    pass
                self._last_activity_prediction = activity_model.predict(
                    list(self._landmark_buffer), pose_result, expected
                )

                now = time.time()
                pred = self._last_activity_prediction
                previous = self._last_machine_prediction
                # Avoid flooding the database while still feeding enough
                # stable frames for the state machine to confirm a step.
                if pred.get("activity") and pred.get("confidence", 0) >= 50 and (
                    pred["activity"] != previous["activity"] or now - previous["sent_at"] >= 0.42
                ):
                    try:
                        from app.database.db import SessionLocal
                        from app.services.experiment_service import experiment_service
                        db = SessionLocal()
                        try:
                            self._last_prediction_result = experiment_service.predict(
                                db, pred["activity"], float(pred.get("confidence", 0))
                            )
                        finally:
                            db.close()
                        self._last_machine_prediction = {"activity": pred["activity"], "sent_at": now}
                    except Exception as exc:
                        # Recognition must continue even if persistence fails.
                        self._last_prediction_result = {
                            "status": "AI_ERROR",
                            "detected": pred.get("activity", "Unknown_Action"),
                            "confidence": pred.get("confidence", 0),
                            "message": f"Motion detected but experiment update failed: {exc}",
                        }
            else:
                self._landmark_buffer.clear()
                self._last_activity_prediction = {
                    "activity": "No Person", "confidence": 0.0,
                    "trained": False, "source": "camera"
                }

            self._record_frame_if_active(pose_result)
            frame_count += 1
            elapsed = time.time() - start_time
            fps = frame_count / elapsed if elapsed > 0 else 0.0

            now = time.time()
            if now - self._last_log_time >= OBSERVATION_LOG_INTERVAL_SECONDS:
                self._last_log_time = now
                self._log_observation(pose_result, self._last_activity_prediction)
                activity_reporter.record_frame(pose_result)

            # HUD: skeleton + numbered landmarks + live recognition state.
            cv2.putText(frame, "SPACEASSIST AI - LIVE POSE", (12, 26),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.6, (240, 198, 67), 2)
            cv2.putText(frame, f"FPS: {fps:.1f}", (12, frame.shape[0] - 16),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, (137, 217, 46), 1)

            if pose_result["person_detected"]:
                cv2.putText(frame, "PERSON DETECTED", (12, frame.shape[0] - 42),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.48, (137, 217, 46), 2)
            else:
                cv2.putText(frame, "MOVE INTO CAMERA VIEW", (12, frame.shape[0] - 42),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.48, (32, 176, 255), 2)

            motion = self._last_activity_prediction.get("activity", "Waiting")
            conf = float(self._last_activity_prediction.get("confidence", 0))
            cv2.rectangle(frame, (frame.shape[1]-300, 12), (frame.shape[1]-12, 92), (20,25,32), -1)
            cv2.putText(frame, "DETECTED MOTION", (frame.shape[1]-285, 34),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.42, (190,200,210), 1)
            cv2.putText(frame, motion, (frame.shape[1]-285, 60),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.72, (70,240,170), 2)
            cv2.putText(frame, f"Confidence {conf:.0f}%", (frame.shape[1]-285, 82),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.38, (210,210,220), 1)

            if self._recording:
                label_text = self._recording_last_label or "waiting for step..."
                cv2.putText(frame, f"REC ({len(self._recording_rows)}) -> {label_text}", (12, frame.shape[0] - 64),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 0, 255), 2)

            ok, buffer = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), JPEG_QUALITY])
            if not ok:
                continue
            yield b"--frame\r\nContent-Type: image/jpeg\r\n\r\n" + buffer.tobytes() + b"\r\n"


# Single shared instance — one webcam, one prototype, one laptop.
camera_manager = CameraManager()
