"""
SpaceAssist AI — Backend Entry Point
AI-Powered Human Activity Recognition for On-board BAS Experiments
ISRO Problem Statement ID: 26174

Run with:
    uvicorn main:app --reload

Then open:
    http://127.0.0.1:8000/docs   (interactive API docs)
"""

import logging

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.database.db import Base, engine
from app.api.routes import router as api_router

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("spaceassist")

# Create all tables on startup if they don't exist yet (SQLite file lives in /data)
Base.metadata.create_all(bind=engine)

# Lightweight SQLite migration for existing installations created by older
# SpaceAssist versions. This keeps the new TXT report field available without
# asking the user to delete their experiment history.
try:
    from sqlalchemy import text
    with engine.begin() as conn:
        cols = [row[1] for row in conn.execute(text("PRAGMA table_info(activity_events)"))]
        if "expected_step" not in cols:
            conn.execute(text("ALTER TABLE activity_events ADD COLUMN expected_step VARCHAR"))
except Exception:
    logger.exception("Could not apply activity_events migration")

app = FastAPI(
    title="SpaceAssist AI",
    description="AI-Powered Human Activity Recognition for On-board BAS Experiments (ISRO Problem 26174)",
    version="0.8.0-phase8",
)

# Allow the Vite dev server to call this API
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    """
    Last-resort safety net (spec section 20: "Python errors"). Any
    exception that wasn't already caught and turned into a clean
    HTTPException by a route gets logged server-side and turned into a
    plain JSON error instead of an HTML stack-trace page — so the
    frontend always gets something it can parse and display, and the
    server keeps running for the next request either way.
    """
    logger.exception(f"Unhandled error on {request.method} {request.url.path}")
    return JSONResponse(
        status_code=500,
        content={"detail": "An unexpected server error occurred. Check the backend terminal for details."},
    )


app.include_router(api_router, prefix="/api")


@app.on_event("startup")
async def log_startup_diagnostics():
    """
    Prints a quick capability summary to the terminal on boot, so
    it's obvious at a glance which optional pieces (OpenCV, MediaPipe,
    PyTorch) are actually available in this environment, without
    having to hit every /api/camera/* endpoint by hand first.
    """
    from app.ai.camera import OPENCV_AVAILABLE
    from app.ai.pose_detector import MEDIAPIPE_AVAILABLE
    from app.ai.activity_model import TORCH_AVAILABLE, activity_model

    logger.info("=" * 60)
    logger.info("SpaceAssist AI backend starting up")
    logger.info(f"  OpenCV (Camera Mode) available:      {OPENCV_AVAILABLE}")
    logger.info(f"  MediaPipe (pose/hand landmarks):      {MEDIAPIPE_AVAILABLE}")
    logger.info(f"  PyTorch (activity model interface):   {TORCH_AVAILABLE}")
    logger.info(f"  Trained activity model found:         {activity_model.is_trained()}")
    logger.info("  Demo Mode is always available regardless of the above.")
    logger.info("=" * 60)


@app.get("/")
def root():
    return {
        "message": "SpaceAssist AI backend is running.",
        "docs": "/docs",
        "phase": "8 - Final polish and full end-to-end testing",
    }
