# SpaceAssist AI — Judge Demo Quickstart

This is the short version. For full details, see `README.md`.

## Before the demo (do this once, ahead of time — not on stage)

**Option A — double-click (easiest):**
1. Double-click `start_backend.bat`. Wait until you see:
   `Uvicorn running on http://127.0.0.1:8000`
2. Double-click `start_frontend.bat`. Wait until you see:
   `Local: http://localhost:5173`
3. Open `http://localhost:5173` in your browser.

**Option B — manual (if you prefer typing commands):**
```
cd spaceassist-ai\backend
python -m venv venv
venv\Scripts\activate
pip install fastapi uvicorn[standard] sqlalchemy pydantic python-multipart websockets
uvicorn main:app --reload
```
In a **second** terminal:
```
cd spaceassist-ai\frontend
npm install
npm run dev
```
Then open `http://localhost:5173`.

**Do a dry run at least once before judges arrive.** First-time
`npm install` and Python package install need internet and take a
minute or two — don't do this for the first time on stage.

---

## The 90-second demo script

1. **Open the Dashboard.** Point out the mission strip: Mission,
   Mode, AI Status, and the **Connection: Live** pill — that's a real
   WebSocket, not a fake indicator.
2. **Go to Live Experiment. Click "Start Demo."**
3. Narrate as it plays out (~17 seconds, fully automatic):
   - "It's tracking a 6-step lab procedure: Pick Container, Open
     Container, Add Sample, Close Container, Place in Analyzer,
     Record Result."
   - Steps 1–3 confirm in green.
   - **A red Sequence Error alert fires** — "Here it caught an
     out-of-order action — it expected Close Container but detected
     Place in Analyzer — and it correctly did NOT let the experiment
     continue until it saw the right action."
   - It recovers, finishes, shows **EXPERIMENT COMPLETED**.
4. **Click "Activity History"** — show the full timestamped log,
   including the sequence error row.
5. **Click "Alerts"** — show the INFO / WARNING / ERROR trail.
6. **If you have a webcam and installed the extra packages** (see
   below), click **"Start Camera"** on Live Experiment to show real
   OpenCV + MediaPipe pose/hand landmarks live on your own body. Be
   upfront that activity *recognition* from the camera isn't trained
   yet — the dashboard says so honestly (`AI_MODEL_NOT_TRAINED`) —
   this is Camera Mode proving the input pipeline works, with Demo
   Mode proving the recognition/logic pipeline works.

**Recommended: lead with Demo Mode.** It's the reliable, zero-hardware,
fully-tested path. Camera Mode is a strong bonus if your webcam
cooperates, but don't let it be the thing your demo depends on.

---

## If something goes wrong on stage

- **"Start Demo" button does nothing / page won't load** → Check both
  terminal windows are still open and didn't crash. Refresh the
  browser tab.
- **Dashboard shows "Backend Offline"** → The backend terminal window
  closed or crashed. Re-run `start_backend.bat` (or the manual
  command) and refresh the browser.
- **Camera won't start** → This is expected if `opencv-python` /
  `mediapipe` aren't installed, or no webcam is available — the app
  says so honestly instead of hanging. Just stick with Demo Mode; it
  doesn't need a camera at all.
- **Totally stuck** → Close both terminal windows, reopen
  `start_backend.bat` then `start_frontend.bat`, and refresh the browser.
  Every button (Start Experiment, Start Demo, Reset) is safe to click
  repeatedly — nothing here can get "stuck" in a bad state that a
  refresh won't fix.

---

## What to say if judges ask "is this really working, or is it faked?"

- The 6-step tracking, the sequence-error detection, the confidence
  thresholds, the database logging — all real, running code. Not a
  slideshow.
- Demo Mode is **clearly labeled as simulated input** feeding a real
  decision engine — that's an intentional, honest design choice (the
  spec for this problem explicitly asks for this), not a limitation
  being hidden.
- The camera pipeline (OpenCV capture, MediaPipe pose detection) is
  real and live if you demo it. The one piece that's honestly
  **not** trained yet is the final activity-recognition model — the
  dashboard says so plainly (`AI_MODEL_NOT_TRAINED`) rather than
  faking a result, which is exactly what the problem statement itself
  asks for.
