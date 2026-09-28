#!/usr/bin/env python3
"""
Pre-download MediaPipe models during Render build.
This script runs during Render's build phase to cache models in /tmp,
so they're available immediately when the container starts.

Run this as part of build: python backend/download_models.py
"""

import os
import urllib.request
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("download_models")

# Use /tmp for Render ephemeral storage
MODEL_DIR = "/tmp/spaceassist_models"
POSE_MODEL = os.path.join(MODEL_DIR, "pose_landmarker_full.task")
HAND_MODEL = os.path.join(MODEL_DIR, "hand_landmarker.task")

POSE_URL = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task"
HAND_URL = "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task"

def download_model(name, path, url):
    """Download a model if it doesn't exist."""
    if os.path.exists(path):
        logger.info(f"✓ {name} already exists at {path}")
        return True
    
    try:
        logger.info(f"⬇ Downloading {name} from {url}")
        os.makedirs(MODEL_DIR, exist_ok=True)
        urllib.request.urlretrieve(url, path)
        
        size_mb = os.path.getsize(path) / (1024 * 1024)
        logger.info(f"✓ {name} downloaded successfully ({size_mb:.1f} MB) to {path}")
        return True
    except Exception as e:
        logger.error(f"✗ Failed to download {name}: {e}")
        return False

if __name__ == "__main__":
    logger.info("Starting MediaPipe model download for Render deployment...")
    logger.info(f"Target directory: {MODEL_DIR}")
    
    success = True
    success &= download_model("Pose Landmarker", POSE_MODEL, POSE_URL)
    success &= download_model("Hand Landmarker", HAND_MODEL, HAND_URL)
    
    if success:
        logger.info("\n✓ All models downloaded successfully!")
        exit(0)
    else:
        logger.warning("\n✗ Some models failed to download. App will try to download on first run.")
        exit(0)  # Don't fail the build, the app can download on demand
