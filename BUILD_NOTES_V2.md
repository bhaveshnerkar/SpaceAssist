# SpaceAssist AI v2 — What was implemented

This build keeps the existing mission-console UI and turns the prototype into a motion-aware experiment platform.

## Implemented
- Real FastAPI + SQLite experiment lifecycle.
- Built-in experiments:
  - Simple Motion Experiment
  - Object Picking Experiment
  - Simple Yoga Monitoring
- Motion vocabulary: Stand, Walk, Reach, Pick, Open, Pour, Close, Place, Sit, Idle, Mix, Bend, Stretch.
- Camera pipeline with OpenCV.
- MediaPipe Tasks API for pose + hand landmarks, compatible with the project's Python 3.13 target.
- Official MediaPipe pose/hand task models are downloaded automatically on first backend startup when Camera Mode initializes.
- Live body skeleton and hand landmarks.
- Trainable PyTorch motion classifier using the same 48-landmark feature format as the training pipeline.
- Honest geometry baseline when a trained model checkpoint does not yet exist.
- 3-frame stability check before a correct step advances.
- Wrong-motion detection with expected vs detected feedback.
- TXT experiment upload and natural-language motion mapping.
- Manual confirmation for TXT steps that cannot be mapped safely to a known motion.
- Motion command visualization in the Live Experiment page.
- Auto-labeled camera training recorder.
- Updated training collector/extractor for the 13 motion classes.
- Detailed experiment TXT report with timeline, confidence, errors, corrections, accuracy, completed/incomplete/skipped/repeated steps, and summary.
- Existing JSON/PDF camera activity reports retained.
- One-click Windows launch scripts updated to install the full backend dependencies.

## Training
The app does not pretend a model is trained when no labeled dataset exists. Use the recorder or `training/collect_data.py`, extract features, and run `training/train_model.py`. Once `models/activity_model.pth` exists, restart/reload the backend and the Live page reports ML MODEL ONLINE.

## First run
1. Run `START_HERE.bat` on Windows 11.
2. Let the backend finish dependency installation.
3. Open the dashboard.
4. Choose a built-in experiment or upload a `.txt` procedure.
5. Start the camera and keep your full body visible.
6. Use the training recorder to collect labeled examples before relying on the trained classifier.
