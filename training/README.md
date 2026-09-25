# SpaceAssist AI — Training Pipeline

This trains a real activity-recognition model on YOUR OWN recorded
footage of the 6 experiment steps, and connects it to the main
SpaceAssist AI app's live experiment tracker.

**Easiest way to run everything:** double-click `train.bat` for a
simple numbered menu. The step-by-step instructions below explain
what each option does and how to do it manually if you prefer typing
commands yourself.

---

## What this does, in plain terms

1. **You record video of yourself** doing each of the 6 activities.
2. The computer looks at your body position in each recorded frame
   and turns it into numbers (this is what MediaPipe Pose does).
3. A small neural network learns to tell those 6 activities apart
   based on those numbers.
4. You can then point your webcam at yourself live, and it will guess
   which activity you're doing, with a confidence score.
5. Those live guesses get sent to the main SpaceAssist AI backend,
   which tracks whether you're doing the experiment steps in the
   right order — using the exact same tracking logic already built
   and tested in the rest of this project.

---

## 1. Install Python packages

Open PowerShell in the `training` folder and run:

```powershell
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
```

This installs OpenCV, MediaPipe, PyTorch, pandas, scikit-learn, and
requests. It can take a few minutes the first time.

---

## 2. Collect training data

```powershell
python collect_data.py
```

A webcam window opens. Controls:
- Press **1** through **6** to select which activity you're about to perform (shown on screen)
- Press **r** to start recording — it saves frames automatically while on
- Press **r** again to stop
- Press **q** to quit

**How many samples per activity?** Aim for **at least 50–100 saved
images per activity** (ideally more, like 150+), recorded from a few
different angles and with slightly different framing each time. Fewer
than ~20 per activity is not enough — `train_model.py` will warn you
plainly if your data is too thin instead of pretending the model is
good.

Practical tip: for each activity, actually perform the motion slowly
and repeatedly in front of the camera while recording — pauses,
different arm positions, and slightly different angles all help the
model generalize instead of just memorizing one exact pose.

---

## 3. Extract features

```powershell
python extract_features.py
```

This reads every image you recorded, finds your body pose in it using
MediaPipe, and converts it into a row of 48 numbers (12 body joints x
4 values each). Saves everything to `dataset/features.csv`.

Images where no person could be detected (bad lighting, out of frame,
etc.) are safely skipped — the script tells you exactly how many were
skipped per activity so you know if you need to re-record anything.

---

## 4. Train the model

```powershell
python train_model.py
```

This will:
- Split your data 80% training / 20% testing
- Train a small neural network for 60 epochs, printing progress
- Print a full accuracy report and confusion matrix
- Save the trained model to `../models/activity_model.pth`

**If you see a warning about insufficient data**, believe it — the
accuracy number printed afterward is not trustworthy in that case, and
the script says so explicitly. Go back to Step 2 and record more
footage for whichever activities were flagged.

---

## 5. Check accuracy

```powershell
python test_model.py
```

Shows you a line-by-line breakdown: for each test sample, what the
model predicted, how confident it was, and what the actual activity
really was — so you can see exactly where it's strong or weak, not
just one summary number.

---

## 6. Run live webcam prediction

```powershell
python predict.py
```

Opens your webcam and shows live predictions with confidence scores.
If confidence is below 50%, it honestly shows "Unknown" instead of
guessing. Press **q** to quit.

If you haven't trained a model yet, this still runs — it clearly
prints **DEMO MODE / AI MODEL TRAINED: NO** and just shows your pose
landmarks on screen without pretending to recognize activities.

---

## 7. Connect it to the main app (FastAPI backend)

**Before** running `predict.py`, start the main backend in a separate
terminal:

```powershell
cd ..\backend
venv\Scripts\activate
uvicorn main:app --reload
```

Now when you run `predict.py`, every high-confidence prediction is
automatically sent to `POST /api/ai/predict` on that backend — the
same endpoint Demo Mode uses. Open the dashboard
(`http://localhost:5173`, with the frontend running too — see the
main project README) and watch the Live Experiment page update in
real time as you physically perform the steps in front of your webcam.

If the backend isn't running, `predict.py` still works fine on its
own — it just can't forward predictions anywhere.

---

## 8. Run everything in VS Code

1. Open the whole `spaceassist-ai` folder in VS Code (the top-level one).
2. Open a terminal (`` Ctrl+` ``), then:
   ```
   cd training
   python -m venv venv
   venv\Scripts\activate
   pip install -r requirements.txt
   ```
3. `Ctrl+Shift+P` → "Python: Select Interpreter" → pick `training\venv\Scripts\python.exe`.
4. Run any script by opening it and pressing the ▷ "Run" button in the
   top-right, or just type `python collect_data.py` (etc.) in the terminal.

---

## Honesty checklist (why this pipeline is built this way)

- `extract_features.py` **skips** images with no detectable pose
  instead of inserting fake zero-data — bad data poisons training
  silently, so this refuses to guess.
- `train_model.py` **warns you explicitly** if any activity has fewer
  than 20 samples, and reminds you again after training that the
  accuracy number isn't trustworthy in that case.
- `predict.py` **never claims a model is trained when it isn't** — no
  model file means DEMO MODE, printed plainly, every time.
- Confidence below 50% is always shown as **"Unknown"**, never a
  guessed label dressed up as a real answer.
- Predictions are sent to the *existing, already-tested* backend
  sequence tracker rather than re-implementing (and potentially
  getting subtly wrong) the CORRECT / SEQUENCE_ERROR / LOW_CONFIDENCE
  logic a second time in this pipeline.
