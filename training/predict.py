"""
predict.py — Steps 5, 6, 7 and 8 of the training pipeline, combined.

Runs your trained model live on the webcam:

    Camera -> MediaPipe -> Feature Extraction -> Neural Network -> Activity -> Confidence

For each frame, it shows "Activity: X | Confidence: Y%" on screen. If
confidence is below 50%, it shows "Activity: Unknown" instead of
guessing.

INTEGRATION WITH THE BACKEND (Step 6/7):
Rather than re-implementing sequence validation (CORRECT /
SEQUENCE_ERROR / LOW_CONFIDENCE tracking, current step, completed
steps, timestamps) a second time here, this script sends every
prediction straight to the SpaceAssist AI backend's existing
POST /api/ai/predict endpoint — which already does exactly that,
tested extensively across earlier phases of this project. Run
backend/main.py first (uvicorn main:app --reload) so this can reach
it; if the backend isn't running, this script still shows live
predictions on screen, it just can't feed the sequence tracker.

DEMO MODE (Step 8):
If no trained model is found at ../models/activity_model.pth, this
does NOT pretend to have one. It clearly prints:
    DEMO MODE
    AI MODEL TRAINED: NO
and just shows the camera with pose landmarks drawn on it — no fake
predictions.

USAGE (from the training/ folder, with your venv activated):
    python predict.py
"""

import os
import json
import pickle

import cv2
import mediapipe as mp
import numpy as np
import torch

try:
    import requests
    REQUESTS_AVAILABLE = True
except ImportError:
    REQUESTS_AVAILABLE = False

from train_model import ActivityClassifier

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODELS_DIR = os.path.join(PROJECT_ROOT, "models")
MODEL_PATH = os.path.join(MODELS_DIR, "activity_model.pth")
LABELS_PATH = os.path.join(MODELS_DIR, "activity_model_labels.json")
SCALER_PATH = os.path.join(MODELS_DIR, "activity_model_scaler.pkl")

BACKEND_PREDICT_URL = "http://127.0.0.1:8000/api/ai/predict"
CONFIDENCE_THRESHOLD = 50.0  # below this, report "Unknown" rather than guessing

TRACKED_JOINTS = [
    "left_shoulder", "right_shoulder",
    "left_elbow", "right_elbow",
    "left_wrist", "right_wrist",
    "left_hip", "right_hip",
    "left_knee", "right_knee",
    "left_ankle", "right_ankle",
]

mp_pose = mp.solutions.pose
mp_drawing = mp.solutions.drawing_utils


def try_load_model():
    """Returns (model, classes, scaler) or (None, None, None) if no trained model exists."""
    if not (os.path.isfile(MODEL_PATH) and os.path.isfile(LABELS_PATH) and os.path.isfile(SCALER_PATH)):
        return None, None, None
    try:
        checkpoint = torch.load(MODEL_PATH, map_location="cpu")
        with open(LABELS_PATH) as f:
            classes = json.load(f)
        with open(SCALER_PATH, "rb") as f:
            scaler = pickle.load(f)
        model = ActivityClassifier(input_size=checkpoint["input_size"], num_classes=checkpoint["num_classes"])
        model.load_state_dict(checkpoint["state_dict"])
        model.eval()
        return model, classes, scaler
    except Exception as exc:
        print(f"WARNING: Found model files but couldn't load them ({exc}). Falling back to DEMO MODE.")
        return None, None, None


def extract_feature_vector(pose_landmarks):
    landmark_enum = mp_pose.PoseLandmark
    row = []
    for joint_name in TRACKED_JOINTS:
        enum_member = landmark_enum[joint_name.upper()]
        lm = pose_landmarks.landmark[enum_member]
        row.extend([lm.x, lm.y, lm.z, lm.visibility])
    return np.array(row, dtype=np.float32).reshape(1, -1)


def send_to_backend(activity: str, confidence_percent: float):
    """Feeds this prediction into the backend's real, tested sequence
    tracker. Silently no-ops if the backend isn't reachable or the
    activity isn't one of the 6 real steps (e.g. "Unknown")."""
    if not REQUESTS_AVAILABLE:
        return
    valid_backend_activities = {
        "Pick_Container", "Open_Container", "Add_Sample",
        "Close_Container", "Place_Analyzer", "Record_Result",
    }
    if activity not in valid_backend_activities:
        return
    try:
        requests.post(
            BACKEND_PREDICT_URL,
            json={"activity": activity, "confidence": confidence_percent},
            timeout=0.5,
        )
    except Exception:
        pass  # backend not running — live predictions still show on screen


def main():
    model, classes, scaler = try_load_model()
    demo_mode = model is None

    print("=" * 60)
    print(" SpaceAssist AI - Live Prediction")
    print("=" * 60)
    if demo_mode:
        print(" DEMO MODE")
        print(" AI MODEL TRAINED: NO")
        print(" No trained model found at:", MODEL_PATH)
        print(" Showing camera + pose landmarks only. Run collect_data.py,")
        print(" extract_features.py, and train_model.py first for real predictions.")
    else:
        print(" AI MODEL TRAINED: YES")
        print(f" Classes: {classes}")
    if not REQUESTS_AVAILABLE:
        print(" NOTE: 'requests' package not installed — predictions won't be")
        print(" forwarded to the backend. Run: pip install requests")
    print("=" * 60)
    print("Press 'q' to quit.")

    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        print("ERROR: Could not open the webcam.")
        return

    pose = mp_pose.Pose(min_detection_confidence=0.5, min_tracking_confidence=0.5)

    while True:
        ok, frame = cap.read()
        if not ok:
            print("WARNING: Failed to read a frame. Stopping.")
            break

        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        result = pose.process(rgb)

        activity_text = "Unknown"
        confidence_percent = 0.0

        if result.pose_landmarks is not None:
            mp_drawing.draw_landmarks(frame, result.pose_landmarks, mp_pose.POSE_CONNECTIONS)

            if not demo_mode:
                features = extract_feature_vector(result.pose_landmarks)
                features_scaled = scaler.transform(features)
                with torch.no_grad():
                    logits = model(torch.tensor(features_scaled, dtype=torch.float32))
                    probs = torch.softmax(logits, dim=1)
                    confidence, predicted_idx = torch.max(probs, dim=1)

                confidence_percent = confidence.item() * 100
                predicted_activity = classes[predicted_idx.item()]

                if confidence_percent >= CONFIDENCE_THRESHOLD:
                    activity_text = predicted_activity
                    send_to_backend(activity_text, confidence_percent)
                else:
                    activity_text = "Unknown"

        mode_label = "DEMO MODE - AI MODEL TRAINED: NO" if demo_mode else "AI MODEL TRAINED: YES"
        cv2.putText(frame, mode_label, (12, 26), cv2.FONT_HERSHEY_SIMPLEX, 0.55,
                    (0, 200, 255) if demo_mode else (0, 255, 0), 2)
        cv2.putText(frame, f"Activity: {activity_text}", (12, 58),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.65, (255, 255, 255), 2)
        if not demo_mode:
            cv2.putText(frame, f"Confidence: {confidence_percent:.0f}%", (12, 86),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 255), 2)

        cv2.imshow("SpaceAssist AI - Live Prediction", frame)
        if cv2.waitKey(1) & 0xFF == ord('q'):
            break

    pose.close()
    cap.release()
    cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
