"""
test_model.py — Step 4 of the training pipeline.

Loads the trained model from ../models/activity_model.pth and
evaluates it again, showing per-sample predictions (predicted
activity, confidence, and actual activity) so you can see exactly
where it gets things right or wrong — not just a single accuracy
number.

USAGE (from the training/ folder, with your venv activated):
    python test_model.py

Uses the SAME train/test split (random_state=42) as train_model.py,
so the "test" samples shown here are genuinely ones the model didn't
train on.
"""

import os
import json
import pickle

import numpy as np
import pandas as pd
import torch
from sklearn.model_selection import train_test_split

from train_model import ActivityClassifier  # reuse the exact same architecture

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATASET_CSV = os.path.join(PROJECT_ROOT, "dataset", "features.csv")
MODELS_DIR = os.path.join(PROJECT_ROOT, "models")


def main():
    model_path = os.path.join(MODELS_DIR, "activity_model.pth")
    labels_path = os.path.join(MODELS_DIR, "activity_model_labels.json")
    scaler_path = os.path.join(MODELS_DIR, "activity_model_scaler.pkl")

    for path in (model_path, labels_path, scaler_path):
        if not os.path.isfile(path):
            print(f"ERROR: {path} not found.")
            print("Run train_model.py first to produce a trained model.")
            return

    if not os.path.isfile(DATASET_CSV):
        print(f"ERROR: {DATASET_CSV} not found.")
        return

    checkpoint = torch.load(model_path, map_location="cpu")
    with open(labels_path) as f:
        classes = json.load(f)
    with open(scaler_path, "rb") as f:
        scaler = pickle.load(f)

    model = ActivityClassifier(input_size=checkpoint["input_size"], num_classes=checkpoint["num_classes"])
    model.load_state_dict(checkpoint["state_dict"])
    model.eval()

    df = pd.read_csv(DATASET_CSV)
    df = df[df["label"].isin(classes)]
    label_to_index = {name: i for i, name in enumerate(classes)}

    X = df.drop(columns=["label"]).values.astype(np.float32)
    y = df["label"].map(label_to_index).values.astype(np.int64)

    stratify = y if min(np.bincount(y)) >= 2 else None
    _, X_test, _, y_test = train_test_split(X, y, test_size=0.2, random_state=42, stratify=stratify)

    X_test_scaled = scaler.transform(X_test)
    X_test_t = torch.tensor(X_test_scaled, dtype=torch.float32)

    with torch.no_grad():
        outputs = model(X_test_t)
        probs = torch.softmax(outputs, dim=1)
        confidences, predictions = torch.max(probs, dim=1)

    print("=" * 70)
    print(f" {'#':<4}{'Predicted':<20}{'Confidence':<14}{'Actual':<20}{'Result'}")
    print("=" * 70)
    correct = 0
    for i in range(len(y_test)):
        predicted_label = classes[predictions[i].item()]
        actual_label = classes[y_test[i]]
        confidence = confidences[i].item() * 100
        is_correct = predicted_label == actual_label
        correct += int(is_correct)
        mark = "OK" if is_correct else "WRONG"
        print(f" {i:<4}{predicted_label:<20}{confidence:>6.1f}%       {actual_label:<20}{mark}")

    print("=" * 70)
    print(f" Accuracy on this test set: {correct}/{len(y_test)} ({correct/len(y_test)*100:.1f}%)")
    print("=" * 70)


if __name__ == "__main__":
    main()
