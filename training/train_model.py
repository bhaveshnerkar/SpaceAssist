"""
train_model.py — Step 3 of the training pipeline.

Loads dataset/features.csv, splits it 80/20 into train/test sets,
normalizes the features, and trains a small PyTorch neural network to
classify the 6 experiment activities. Prints accuracy, loss, a full
classification report, and a confusion matrix — then saves the
trained model, the feature scaler, and the label mapping.

USAGE (from the training/ folder, with your venv activated):
    python train_model.py

OUTPUT:
    ../models/activity_model.pth        (trained PyTorch weights)
    ../models/activity_model_labels.json  (class name <-> index mapping)
    ../models/activity_model_scaler.pkl   (feature normalization, needed at inference time)

IMPORTANT: if there isn't enough data to train a meaningful model,
this script says so plainly instead of printing a fake high accuracy
number. Do not trust an accuracy score printed here if the warnings
above it say your dataset is too small.
"""

import os
import json
import pickle

import numpy as np
import pandas as pd
import torch
import torch.nn as nn
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import classification_report, confusion_matrix, accuracy_score

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATASET_CSV = os.path.join(PROJECT_ROOT, "dataset", "features.csv")
MODELS_DIR = os.path.join(PROJECT_ROOT, "models")

CLASSES = [
    "Stand", "Walk", "Reach", "Pick", "Open", "Pour", "Close",
    "Place", "Sit", "Idle", "Mix", "Bend", "Stretch",
]

MIN_SAMPLES_PER_CLASS = 20  # below this, a trained model can't be trusted
EPOCHS = 60
LEARNING_RATE = 0.001
HIDDEN_SIZE_1 = 64
HIDDEN_SIZE_2 = 32


class ActivityClassifier(nn.Module):
    """A small feed-forward network — this classifies a SINGLE frame's
    landmarks, unlike the sequence-based LSTM in the backend
    (app/ai/activity_model.py). Simpler, and a good fit for the
    per-image dataset this pipeline collects."""

    def __init__(self, input_size: int, num_classes: int):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(input_size, HIDDEN_SIZE_1),
            nn.ReLU(),
            nn.Dropout(0.2),
            nn.Linear(HIDDEN_SIZE_1, HIDDEN_SIZE_2),
            nn.ReLU(),
            nn.Linear(HIDDEN_SIZE_2, num_classes),
        )

    def forward(self, x):
        return self.net(x)


def main():
    if not os.path.isfile(DATASET_CSV):
        print(f"ERROR: {DATASET_CSV} not found.")
        print("Run collect_data.py then extract_features.py first.")
        return

    df = pd.read_csv(DATASET_CSV)
    if df.empty:
        print("ERROR: features.csv is empty. Collect more data and re-run extract_features.py.")
        return

    print("=" * 60)
    print(" Dataset summary")
    print("=" * 60)
    counts = df["label"].value_counts()
    insufficient = []
    for activity in CLASSES:
        n = int(counts.get(activity, 0))
        print(f"   {activity:<20} {n} samples")
        if n < MIN_SAMPLES_PER_CLASS:
            insufficient.append((activity, n))

    if insufficient:
        print()
        print("WARNING: Insufficient training data for a trustworthy model.")
        print(f"Each activity should have at least {MIN_SAMPLES_PER_CLASS} samples:")
        for activity, n in insufficient:
            print(f"   - {activity}: only {n} samples")
        print()
        print("Training will still proceed below so you can see the pipeline")
        print("work end-to-end, but DO NOT trust the resulting accuracy number")
        print("as a real measure of how well this model recognizes activities.")
        print("Collect more data and re-run this script before relying on it.")
    print("=" * 60)
    print()

    # Only train on classes we actually have data for, in a fixed order.
    present_classes = [c for c in CLASSES if c in counts.index]
    label_to_index = {name: i for i, name in enumerate(present_classes)}

    df = df[df["label"].isin(present_classes)]
    X = df.drop(columns=["label"]).values.astype(np.float32)
    y = df["label"].map(label_to_index).values.astype(np.int64)

    if len(present_classes) < 2:
        print("ERROR: Need at least 2 different activities with data to train a classifier.")
        return

    stratify = y if min(np.bincount(y)) >= 2 else None
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=stratify
    )

    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    X_test_scaled = scaler.transform(X_test)

    X_train_t = torch.tensor(X_train_scaled, dtype=torch.float32)
    y_train_t = torch.tensor(y_train, dtype=torch.long)
    X_test_t = torch.tensor(X_test_scaled, dtype=torch.float32)
    y_test_t = torch.tensor(y_test, dtype=torch.long)

    model = ActivityClassifier(input_size=X.shape[1], num_classes=len(present_classes))
    criterion = nn.CrossEntropyLoss()
    optimizer = torch.optim.Adam(model.parameters(), lr=LEARNING_RATE)

    print("Training...")
    model.train()
    for epoch in range(1, EPOCHS + 1):
        optimizer.zero_grad()
        outputs = model(X_train_t)
        loss = criterion(outputs, y_train_t)
        loss.backward()
        optimizer.step()

        if epoch % 10 == 0 or epoch == 1:
            with torch.no_grad():
                train_preds = outputs.argmax(dim=1)
                train_acc = (train_preds == y_train_t).float().mean().item()
            print(f"  Epoch {epoch:>3}/{EPOCHS}  loss={loss.item():.4f}  train_acc={train_acc*100:.1f}%")

    model.eval()
    with torch.no_grad():
        test_outputs = model(X_test_t)
        test_preds = test_outputs.argmax(dim=1).numpy()

    test_acc = accuracy_score(y_test, test_preds)

    print()
    print("=" * 60)
    print(f" FINAL TEST ACCURACY: {test_acc*100:.1f}%")
    print("=" * 60)
    print()
    print("Classification report:")
    print(classification_report(y_test, test_preds, target_names=present_classes, zero_division=0))
    print("Confusion matrix (rows = actual, columns = predicted):")
    print("  Classes in order:", present_classes)
    print(confusion_matrix(y_test, test_preds))

    if insufficient:
        print()
        print("REMINDER: the accuracy above is NOT trustworthy — see the data")
        print("warnings printed earlier. Collect more samples before relying on this model.")

    os.makedirs(MODELS_DIR, exist_ok=True)
    model_path = os.path.join(MODELS_DIR, "activity_model.pth")
    labels_path = os.path.join(MODELS_DIR, "activity_model_labels.json")
    scaler_path = os.path.join(MODELS_DIR, "activity_model_scaler.pkl")

    torch.save({
        "state_dict": model.state_dict(),
        "input_size": X.shape[1],
        "num_classes": len(present_classes),
    }, model_path)

    with open(labels_path, "w") as f:
        json.dump(present_classes, f, indent=2)

    with open(scaler_path, "wb") as f:
        pickle.dump(scaler, f)

    print()
    print("=" * 60)
    print(" Saved:")
    print(f"   {model_path}")
    print(f"   {labels_path}")
    print(f"   {scaler_path}")
    print("=" * 60)


if __name__ == "__main__":
    main()
