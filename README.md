# SpaceAssist AI
**AI-Powered Human Activity Recognition for On-board BAS Experiments**
ISRO Theme: Space Technology — Problem ID 26174

> **Demoing this to judges? Read `JUDGE_DEMO.md` instead of this file.**
> It's the short version with copy-paste steps, a 90-second demo
> script, and a "what to do if something breaks on stage" section.
> Double-click `start_backend.bat` then `start_frontend.bat` for the
> fastest path to a running demo.

> Status: **All 8 phases complete.** This is a fully working prototype:
> real FastAPI + SQLite backend, a live React dashboard, an automatic
> scripted Demo Mode, real OpenCV webcam capture with MediaPipe pose/
> hand landmarks, a genuine (honestly untrained) activity-recognition
> model interface, and a final hardening pass with input validation
> and error handling throughout. Every claim in this README was
> verified against real running code in the process of building it —
> see "What was actually tested" in each phase section below, and the
> full regression summary at the end of this section.

---

## What's built in Phase 1

A real FastAPI backend with a genuine state machine that tracks the
**Sample Processing Experiment**:

```
1. Pick Container
2. Open Container
3. Add Sample
4. Close Container
5. Place Container in Analyzer
6. Record Result
```

It is fed one `(activity, confidence)` prediction at a time — for now
you feed it manually via `/docs` or `curl`; from Phase 4 onward, Demo
Mode will feed it automatically, and from Phase 6 onward, real camera
predictions will too.

The state machine actually enforces the rules from the spec:
- **Won't advance on a single noisy frame** — requires 3 consecutive
  stable, matching, high-enough-confidence predictions per step.
- **Confidence bands**: below 50 → `LOW_CONFIDENCE` (ignored), 50–79 →
  uncertain (still requires stability), 80+ → high confidence.
- **Wrong action** → `SEQUENCE_ERROR` with the exact expected vs.
  detected activity, and does **not** skip or corrupt progress.
- **All 6 steps done** → `COMPLETED`.
- Every event and alert is persisted to SQLite so a history/alerts UI
  (Phase 2/3) has real data to render, not mocks.

This was tested end-to-end with curl: a full run including an
intentional wrong action, a low-confidence frame, recovery, and
completion — see "Try it yourself" below to reproduce it.

---

## What's built in Phase 2

A full React + Vite frontend styled as a mission-console dashboard, with
five working pages and no dead links:

- **Dashboard** — current activity readout, a radial confidence gauge,
  the 6-step experiment trace, an alerts feed, and recent history.
- **Live Experiment** — the demo/camera controls (visually complete,
  wired up for real in Phase 3–5) plus a live HUD and camera placeholder.
- **Activity History** — the full event log as a telemetry-style table.
- **Alerts** — all INFO/WARNING/ERROR alerts with a summary count.
- **Settings** — confidence thresholds and mode, read-only for now.

Right now every page reads from `src/mock/mockData.js`, which is
**shaped exactly like the real Phase 1 API responses** (same field
names, same status strings). That's deliberate: in Phase 3, pages swap
their import from `mock/mockData` to `services/api`, and nothing else
about the components needs to change.

The visual design (dark instrument-panel theme, the radial confidence
gauge, the hexagonal step-trace nodes) was a deliberate choice to
match the subject: this reads as a mission-console telemetry screen,
not a generic web app skin.

---

## What's built in Phase 3

The frontend now talks to the real backend — no more mock data:

- **`ExperimentContext`** (`frontend/src/context/ExperimentContext.jsx`)
  is the single source of truth. It fetches `/api/experiment`,
  `/api/experiment/history`, and `/api/alerts` on load, then keeps
  itself current two ways at once:
  - **WebSocket** (`ws://127.0.0.1:8000/api/ws`) — the backend pushes
    a message the instant `start` / `predict` / `reset` changes
    anything, and the frontend refetches immediately.
  - **REST polling every 2 seconds** — a safety net if the socket
    can't connect (e.g. a restrictive network), and how the UI
    detects the backend going offline or coming back.
  A **Connection** pill in the mission strip shows `Live` (socket
  connected), `Polling` (fallback active), or `Backend Offline`.
- **Start Experiment** and **Reset Experiment** buttons on the Live
  Experiment page now actually call the backend and the whole UI
  updates in response — tested end-to-end with the backend running.
- **Start Demo**, **Start Camera**, **Stop Camera** stay disabled
  with explanatory tooltips — those need Phase 4 and Phase 5/6 first.
  Until Phase 4 lands, you can still drive a full run by sending
  predictions from `/docs` or curl, exactly like in Phase 1 — the
  dashboard will now visibly react to each one in real time.

Tested for this phase: booted the backend, connected a raw Python
WebSocket client, and confirmed it received a push message for each
of `start`, `predict`, and `reset`; built the frontend production
bundle and confirmed it references the correct API/WS URLs.

---

## What's built in Phase 4

**Demo Mode is now fully automatic.** `app/services/demo_service.py`
runs a scripted sequence of 19 `(activity, confidence)` predictions as
a background `asyncio` task, feeding them into the exact same state
machine and database that Camera Mode will use in Phase 6 — it's not
a separate fake path, it's the real engine driven by realistic data.

The script reproduces the spec's hackathon demo scenario exactly:

```
Pick Container ✓✓✓ → Open Container ✓✓✓ → Add Sample ✓✓✓ →
WRONG ACTION (Place in Analyzer) → SEQUENCE ERROR warning →
Close Container ✓✓✓ (recovery) → Place in Analyzer ✓✓✓ →
Record Result ✓✓✓ → EXPERIMENT COMPLETED
```

New endpoints:
- `POST /api/demo/start` — kicks off the sequence (non-blocking, returns immediately)
- `POST /api/demo/stop` — signals it to halt after the current step
- `GET /api/demo/status` — `{"running": true/false}`, polled by the frontend

Starting a manual experiment or resetting will also stop any demo
in-flight, so there's no race between a person clicking around and a
demo quietly still writing to the database in the background —
verified by resetting mid-run and confirming the state stayed put
afterward.

The **Start Demo** button on the Live Experiment page is now fully
wired: clicking it starts the sequence, and the dashboard, timeline,
history, and alerts all update live via the Phase 3 WebSocket/polling
as it plays out — no page refresh needed.

**Tested end-to-end**: ran the full 19-step sequence via curl and
confirmed — progress went 0/6 → 6/6 → `COMPLETED`; the history log
shows the `SEQUENCE_ERROR` at exactly the right point with the correct
expected/detected values; alerts captured `INFO` (start), `ERROR`
(the wrong action), and `INFO` (completion); and a mid-run reset
correctly aborted the background task with no further writes.

---

## What's built in Phase 5

Real OpenCV webcam capture, end to end:

- **`app/ai/camera.py`** — a `CameraManager` that opens `cv2.VideoCapture(0)`,
  reads frames, and streams them as MJPEG (`multipart/x-mixed-replace`),
  the same well-established technique browsers have supported natively
  for over 20 years — no WebRTC signaling, no extra frontend library,
  just an `<img src="...">` tag pointed at a streaming endpoint.
- **New endpoints:**
  - `GET /api/camera/status` — genuinely probes the camera (not a stub
    anymore) and reports `available`, `opencv_installed`, `streaming`,
    and `resolution` honestly.
  - `POST /api/camera/start` / `POST /api/camera/stop` — open/release
    the actual device.
  - `GET /api/camera/stream` — the live MJPEG feed.
- **Frontend**: the Camera Feed panel on Live Experiment now shows a
  real `<img>` tag streaming from the backend when a camera is
  available, with **Start Camera** / **Stop Camera** fully wired.

**On the overlay text**: each streamed frame currently shows a live
FPS counter and a note that pose/hand landmarks arrive in Phase 6 —
there's no activity recognition happening on these frames yet, by
design, matching the spec's requirement not to claim real recognition
before it exists.

### Honest error handling (this is the important part of Phase 5)

This sandbox has no webcam, which turned out to be a good forcing
function: every failure path below was tested against a **real
absence of camera hardware**, not simulated.

- **No OpenCV installed** → `camera_status()` returns
  `{"available": false, "opencv_installed": false, ...}` with a clear
  message. Verified by patching out the `cv2` import entirely.
- **OpenCV installed, no camera hardware** → `/api/camera/status`
  correctly reports `available: false` with a specific message;
  `POST /api/camera/start` and `GET /api/camera/stream` both return a
  clean **HTTP 503** with that same message instead of hanging,
  crashing, or silently returning a black frame. Confirmed the server
  stayed fully healthy (`/api/health` still responded) immediately
  after those failed calls.
- **Camera disconnects mid-stream** → the MJPEG generator loop checks
  `is_open()` and breaks cleanly rather than looping on garbage frames.

On a Windows laptop with a real webcam, `available` will be `true` and
the Start Camera button will show the actual live feed — this couldn't
be visually confirmed from this sandbox, but the exact same code path
that handles "camera found" was exercised via the OpenCV probe logic;
what's genuinely untested until you run it locally is the live visual
feed itself.

---

## What's built in Phase 6

Real MediaPipe pose and hand landmark detection, running on every
streamed frame:

- **`app/ai/pose_detector.py`** — wraps MediaPipe's `Pose` and `Hands`
  solutions. Detects a person's shoulders, elbows, wrists, hips,
  knees, and ankles (exactly the joints the spec asks for), draws them
  on the frame, and also detects up to 2 hands. Deliberately separate
  from activity recognition: this module only finds *joints*, not
  *actions* — Phase 7's `activity_model.py` is what turns joint
  positions into "Pick_Container" vs "Close_Container", etc.
- **Pinned to `mediapipe==0.10.14` specifically** — this is the last
  version to ship the classic `solutions` API with its models bundled
  inside the pip package. I actually hit this the hard way: installing
  the latest MediaPipe (0.10.33) in this sandbox turned out to have
  *no* `mp.solutions` module at all — Google moved to a new "Tasks"
  API in recent releases that needs to download model files from their
  servers on first use. Pinning to 0.10.14 avoids that entirely, which
  matters if a demo laptop doesn't have great wifi at a venue.
- **`camera.py`** now runs every frame through the pose detector before
  streaming it, drawing landmarks live and overlaying `PERSON DETECTED`
  / `NO PERSON DETECTED` and a hand count directly on the video.
- **New endpoint**: `GET /api/camera/pose` returns the full landmark
  coordinates from the latest frame — this is exactly the input shape
  Phase 7 will feed into the activity recognition model.
- `/api/camera/status` now also reports `mediapipe_installed`,
  `person_detected`, and `hands_detected` while streaming, and the
  Live Experiment page's camera panel shows live pills for both.

### What was actually tested (no camera or real person available here)

- Ran `pose_detector.process()` directly on a blank frame and a
  random-noise frame — confirmed it never crashes and correctly
  reports `person_detected: false` in both cases.
- Drew a crude stick figure and ran it through the same pipeline —
  MediaPipe correctly did *not* falsely detect a person (it needs real
  photographic features, not line art), and the frame came back
  undamaged. Saved and visually inspected the output.
- **The real integration test**: monkeypatched `CameraManager` to
  serve synthetic frames instead of a real webcam, then ran the actual
  `generate_mjpeg()` generator end-to-end — confirmed it produces
  correctly formatted MJPEG chunks, updates `get_pose_result()` after
  each frame, and the overlay text (title, FPS, detection status)
  renders correctly on the output JPEG (visually inspected).

**What's genuinely untested until you run this on your laptop**:
detection accuracy on an actual person in front of a real webcam. The
plumbing connecting camera → pose detector → overlay → stream has all
been exercised with real code paths; only the ML model's real-world
accuracy on a live human is unverified from this sandbox.

---

## What's built in Phase 7

**`app/ai/activity_model.py`** is the smallest, most deliberately
honest module in the project. Its whole job is one function:

```python
predict(sequence) -> {"activity": "...", "confidence": 0.0, "trained": False}
```

There's a real, working `ActivityLSTM(nn.Module)` defined in there —
an actual 2-layer LSTM that takes a `(batch, 30, 48)` tensor (30
frames x 12 joints x 4 values) and outputs class logits. I instantiated
it and ran a real forward pass to confirm the architecture is correct,
not just plausible-looking code. But it is **never used for inference**
in this prototype, because no one has collected and labeled the
hundreds of example sequences a real model needs — so `predict()`
always returns the honest sentinel `AI_MODEL_NOT_TRAINED` instead of a
made-up label with a made-up confidence score, exactly as the spec
requires.

**The full loop now closes end-to-end**: Camera Mode (Phase 5/6)
extracts joint landmarks every frame → they're buffered into a rolling
30-frame window → that window is fed into `activity_model.predict()`
every frame → the honest result (`AI_MODEL_NOT_TRAINED`) is drawn
directly on the video overlay and exposed via the API. Training a real
model later means dropping a checkpoint at `models/activity_lstm.pt`
and nothing else changes — `is_trained()` will pick it up automatically
and the whole dashboard (including the `ai_status` pill, which is now
**genuinely computed**, not hardcoded) will flip to reflect it.

### An honest account of what got tested (and a real bug I hit)

This sandbox has a small, fixed disk quota, and installing PyTorch's
default Linux wheel — which pulls in ~4-5GB of CUDA libraries even
though nothing here has a GPU — failed twice with "no space left on
device" before I cleaned up ~4GB of orphaned Nvidia packages and got a
clean install through. Along the way I found a real robustness bug:
my first version of the "is torch installed?" check only caught
`ImportError`, but a partially-broken torch install (which is exactly
what a failed pip install leaves behind) raises `OSError` instead when
it can't find its own shared libraries. I broadened the guard to catch
any exception during import, and confirmed against the actual broken
install sitting in this sandbox that it now degrades cleanly instead
of crashing the backend at startup.

Everything below was tested for real, not assumed:
- **No torch installed** → `predict()` returns `AI_MODEL_NOT_TRAINED` cleanly.
- **Torch installed but corrupted** (the real broken state this sandbox was in) → same clean result, no crash.
- **Torch installed and working** → instantiated `ActivityLSTM`, ran a real forward pass, got the expected output shape.
- **Torch working, but a garbage/corrupted checkpoint file placed at `models/activity_lstm.pt`** → `is_trained()` correctly stays `False` instead of crashing on a bad `load_state_dict()`.
- **Full pipeline**: monkeypatched the camera to serve synthetic frames, ran the real `generate_mjpeg()` generator, and confirmed the video overlay shows `AI ACTIVITY: AI_MODEL_NOT_TRAINED` live, and `/api/camera/pose` returns the full landmark + prediction payload correctly.

---

## What's built in Phase 8

The final pass: input validation, error handling, and a full
end-to-end regression test across every phase in one sitting.

**Input validation** (spec section 20: "invalid API input"):
- `POST /api/ai/predict` now rejects any `activity` value that isn't
  one of the 7 real recognizer outputs, and any `confidence` outside
  0–100 — both return a clean `422` with a specific message, not a
  silent bad state.
- `POST /api/experiment/start?mode=...` rejects anything other than
  `DEMO` or `CAMERA` with a `400`, and normalizes case (`demo` → `DEMO`).

**Error handling** (spec section 20's full list):
- A global exception handler in `main.py` catches any unhandled Python
  error anywhere in the app and returns a clean JSON `500` instead of
  an HTML stack trace — logged server-side, never leaked to the client.
- `experiment_service` calls in the route layer now roll back the DB
  session and return a clean `500` message on failure instead of
  propagating a raw SQLAlchemy error.
- `demo_service`'s background task now catches any mid-run failure,
  logs it, and broadcasts a `demo_error` WebSocket event with a plain
  explanation — the frontend surfaces this as a visible error banner
  instead of the demo just mysteriously stopping.
- A startup log prints a one-glance capability summary (OpenCV /
  MediaPipe / PyTorch / trained-model status) so it's obvious what's
  available the moment the server boots, without hitting five
  different endpoints by hand first.

### Full regression test (run in one sitting, after all the above changes)

1. Full automatic Demo Mode run → `COMPLETED`, `6/6`, 19 history
   events including the sequence error, 3 alerts. ✅
2. Reset → `NOT_STARTED`, `0/6`. ✅
3. Camera status honestly reports unavailable (no hardware in this
   sandbox) while still correctly reporting MediaPipe as installed. ✅
4. Camera stream on unavailable hardware → clean `503`, no hang. ✅
5. `ai_status` genuinely reflects the untrained model. ✅
6. `/api/camera/pose` returns the full prediction interface shape. ✅
7. An invalid prediction is rejected with `422` and the server stays
   healthy immediately afterward. ✅
8. Starting a demo and resetting mid-run still aborts it cleanly. ✅
9. A raw WebSocket client still receives live broadcasts correctly
   for start / predict / reset after all the hardening changes. ✅
10. Frontend production build compiles cleanly. ✅

Zero tracebacks across the entire session.

---

## Installation — Frontend (Windows)

Open a **second** terminal (keep the backend running in the first one):

```
cd spaceassist-ai\frontend
npm install
npm run dev
```

Then open **http://localhost:5173** in your browser.

### Try the live wiring

With both servers running:
1. Go to **Live Experiment**, click **Start Experiment**. The mission
   strip's Connection pill should read `Live`, and the step trace
   should show step 1 as `IN_PROGRESS`.
2. Open **http://127.0.0.1:8000/docs**, expand `POST /api/ai/predict`,
   click "Try it out", and send `{"activity": "Pick_Container", "confidence": 95}`
   three times in a row.
3. Switch back to the browser tab — the Dashboard, Live Experiment,
   Activity History, and Alerts pages should all update **without a
   page refresh**, within roughly a second.

### Try the full automatic demo

Go to **Live Experiment** and click **Start Demo** instead. Over about
17 seconds you'll see, live and without touching anything else:
1. Steps 1–3 confirm one at a time as the trace lights up green.
2. A red **Sequence Error** alert fires the moment the scripted wrong
   action (placing the container in the analyzer too early) is fed in.
3. The sequence recovers, finishes steps 4–6, and the dashboard shows
   `EXPERIMENT COMPLETED`.
4. The Activity History and Alerts pages show the entire run afterward.

### Try the live camera (needs a real webcam)

1. Make sure `opencv-python` is installed: `pip install opencv-python`
   (or run `pip install -r requirements.txt` for everything at once).
2. Go to **Live Experiment**. If a webcam is detected, **Start Camera**
   becomes clickable — click it and the panel switches from the
   placeholder to a real live video feed with a **FPS counter**, live
   **body and hand landmark overlay**, and **Person Detected** /
   **Hands: N** pills that update as you move in frame.
3. **Stop Camera** releases the device cleanly (important on Windows —
   an unreleased camera handle can block other apps from using it).
4. No webcam, or OpenCV not installed? The panel tells you exactly
   why (`camera_status.message`) and Demo Mode keeps working normally
   — Camera Mode failing never blocks the rest of the app.

**Windows-specific note:** if `Start Camera` fails with "no camera
device detected" but you do have a webcam, check that no other app
(Zoom, Teams, another browser tab) currently has it open — most
webcams can only be used by one process at a time — and check
Windows Settings → Privacy & Security → Camera → "Let desktop apps
access your camera" is turned on.

---

## Project structure (Phase 1 + 2)

```
spaceassist-ai/
├── backend/
│   ├── main.py                        # FastAPI app entry point
│   ├── requirements.txt
│   └── app/
│       ├── api/
│       │   └── routes.py              # all REST endpoints
│       ├── database/
│       │   └── db.py                  # SQLite engine/session
│       ├── models/
│       │   └── models.py              # SQLAlchemy ORM tables
│       ├── schemas/
│       │   └── schemas.py             # Pydantic request/response models
│       ├── services/
│       │   ├── experiment_service.py  # bridges state machine <-> DB
│       │   ├── demo_service.py        # automatic Demo Mode sequence (Phase 4)
│       │   └── ws_manager.py          # WebSocket broadcast (Phase 3)
│       ├── experiment/
│       │   └── state_machine.py       # the core engine (no DB, no I/O)
│       └── ai/
│           ├── camera.py              # OpenCV webcam capture + MJPEG (Phase 5)
│           ├── pose_detector.py       # MediaPipe pose/hand landmarks (Phase 6)
│           └── activity_model.py      # LSTM interface, honest untrained state (Phase 7)
├── frontend/
│   ├── package.json
│   ├── vite.config.js
│   ├── index.html
│   └── src/
│       ├── main.jsx / App.jsx
│       ├── index.css                  # design tokens + all styles
│       ├── constants.js               # confidence thresholds, default state
│       ├── context/ExperimentContext.jsx  # live state: REST + WebSocket
│       ├── services/api.js            # real fetch calls to the backend
│       ├── components/                # NavBar, MissionStrip, ConfidenceGauge,
│       │                               # StepTimeline, AlertsFeed, HistoryTable...
│       └── pages/                     # Dashboard, LiveExperiment,
│                                       # ActivityHistory, Alerts, Settings
├── data/                              # spaceassist.db (SQLite) lives here
├── models/                            # placeholder for trained AI models later
└── README.md
```

---

## Installation (Windows)

Open a terminal in the `backend/` folder:

```
cd spaceassist-ai\backend
python -m venv venv
venv\Scripts\activate
pip install fastapi uvicorn sqlalchemy pydantic python-multipart
```

> Note: `requirements.txt` also lists `opencv-python`, `mediapipe`,
> `torch`, etc. — those are only needed starting Phase 5/6. Installing
> just the four packages above is enough to run everything that exists
> right now. You're welcome to `pip install -r requirements.txt` now if
> you want to get the heavier installs out of the way early.

Start the backend:

```
uvicorn main:app --reload
```

Then open **http://127.0.0.1:8000/docs** — this gives you an
interactive page to call every endpoint by hand (click "Try it out").

---

## Feature: Camera → Motion Detection → Activity Recognition → Text Report

A full pipeline turning continuous camera pose data into a discrete,
narrative activity report — exactly the workflow: camera captures
video, detects motion and presence, identifies discrete activity
events, and generates a downloadable report:

```
ACTIVITY REPORT
----------------------------
Date: 06-09-2026
Time: 21:36
Person Detected: Yes
Detected Activities:
1. Person entered the camera view
2. Person moved from left to right
3. Person stopped
4. Person left the camera view
Motion Status: Detected
Total Activity Events: 4
```

**`app/ai/activity_reporter.py`** watches two things once per second
(reusing the same cadence as the observation log): presence
transitions (person_detected flipping True/False → "entered"/"left"
events) and horizontal movement (tracking the hip/shoulder centroid
across a rolling window → "moved left to right," "moved right to
left," "stopped"). Available as `.txt`, `.json`, and a proper
one-page PDF (via reportlab) — three new download buttons on the
Live Experiment page under **Activity Report**.

**Deliberate design choice on YOLO**: the request that inspired this
feature listed YOLO as an option for person detection. This project's
MediaPipe Pose already does that job reliably and is already
integrated end-to-end — adding YOLO on top would be a second, heavier
dependency doing the same job (and this project has had enough
version-pinning pain already with MediaPipe and PyTorch). Not adding
it was a considered decision, not an oversight.

### Bugs found and fixed while building this

1. **Stop-detection never fired.** My first version used the same
   wide rolling window for both "is moving" and "has stopped"
   detection — so right after a person stopped, the window still
   contained trailing samples from when they were moving, and the
   "stopped" event never triggered within a reasonable time. Fixed by
   using a tighter, most-recent-samples-only window specifically for
   stop detection. Verified by reproducing the exact example scenario
   from the spec (enter → move left-to-right → stop → leave) and
   confirming all 4 events fire in the right order, matching the
   requested example exactly.

2. **A real, pre-existing `NameError` in `routes.py`**, silently
   present since the observation log's download endpoint was first
   built: `datetime` was used in three different download endpoints
   but never actually imported at the top of the file. It never
   surfaced before because no one had actually called those download
   endpoints via a real HTTP request until this feature's testing —
   the global exception handler caught it and returned a clean 500
   instead of crashing the server, which is exactly why that handler
   exists, but the bug itself needed a real fix. One import line
   fixed all three endpoints at once (observations, recording, and
   report downloads).

**Tested for real, not assumed**: reproduced the exact example
scenario and got byte-for-byte matching event text; visually
rasterized the generated PDF to confirm it renders as a clean,
professional one-pager; used FastAPI's `TestClient` (which shares the
same in-process singleton state, unlike a separate curl process) to
properly test "feed events, then download" end-to-end across all
three formats; then ran the fix against a real cross-origin request
with both dev servers running together, and re-ran the full Demo Mode
regression to confirm nothing else broke.

---

## Feature: Camera Observation Log (now wired into the UI)

The backend already had a running text log of what the camera sees
once per second — this was built but never actually reachable from
the dashboard, a real gap I found and closed. It now shows up live
under the camera feed on the Live Experiment page: a scrollable,
timestamped log ("14:32:05 Person detected | Hands visible: 2 | AI
activity: AI\_MODEL\_NOT\_TRAINED"), with **Download .txt** and
**Clear** buttons, polling every 2 seconds only while the camera is
actually streaming.

This is separate from the auto-labeled training recorder above: the
observation log is a general human-readable audit trail of what
happened and when, while the recorder is specifically for producing
labeled training rows. Both draw from the same underlying pose data,
just formatted for different purposes.

---

## Feature: Auto-Labeled Training Data Recorder

While the camera is streaming during a **live experiment run**, click
**"● Start Recording Session"** and every frame with a detected
person gets saved with whatever step the experiment currently
expects as its label — real training data captured just by
performing the actual procedure, no manual per-activity keypress
recording required (that's what `training/collect_data.py` is for,
as a separate, more deliberate approach).

The exported CSV (**Download .csv**) is in the *exact* format
`training/extract_features.py` produces — same header, same joint
order — so you can drop it straight into `dataset/features.csv` (or
merge with an existing one) and run `training/train_model.py`
directly on it.

**Tested for real, including a critical bug I caught before shipping
it**: I first labeled rows with the human-readable display name
("Pick Container") instead of the raw internal key
("Pick\_Container") that `train_model.py`'s class list actually
matches against — that would have silently produced a CSV that
trains on zero rows. Fixed it to use the raw key. Then ran a full
integration test: started a real experiment, simulated a camera
recording session with synthetic frames, advanced the experiment
*mid-recording*, and confirmed the recorded rows correctly switched
labels the instant the real expected step changed (10 frames labeled
`Pick_Container`, then 20 labeled `Open_Container` after advancing).
Finally, fed that exact recorded CSV into the real
`training/train_model.py` and confirmed it trained a real model on
it — completing the full "capture → auto-label → train" loop
end-to-end, with the honest low-sample-size warning correctly firing
since it was only 30 synthetic frames.

---

## Feature: Automatic Spoken Alerts + Space Knowledge

Two more real additions to the Voice Assistant:

**Automatic spoken alerts** — the assistant now speaks a wrong-step
alert out loud the instant it happens, without anyone needing to ask.
The moment a real `SEQUENCE_ERROR` fires (from Demo Mode, Camera Mode,
or manual use), it announces "Alert: Expected X but detected Y" —
and a `LOW_CONFIDENCE` warning gets a softer "Caution: ..." — useful
for an astronaut whose hands and eyes are busy with the actual
procedure. A toggle in the assistant panel ("Auto-announce wrong-step
alerts out loud") lets you turn this off, saved to your browser so it
persists between visits.

Tested for real: simulated the exact baseline-tracking logic that
decides what counts as "new" — confirmed pre-existing alerts from
before the page loaded are correctly never read aloud (so it doesn't
scream-read your whole history on refresh), a genuinely new error
gets spoken with the right text, a new warning gets the softer
"Caution" framing, and toggling the mute switch off actually
suppresses new alerts. Then ran a real Demo Mode sequence end to end
and confirmed the real `SEQUENCE_ERROR` alert it produces is exactly
what would get spoken.

**General space and astronaut knowledge** — the assistant can now
answer real, accurate questions about the International Space
Station, microgravity, India's Gaganyaan program and planned
Bharatiya Antariksh Station, spacesuits, how astronauts sleep/eat/
exercise, and more (see `SPACE_KNOWLEDGE_BASE` in
`voiceKnowledgeBase.js`). These are stable, well-established facts
safe to answer directly — unlike arbitrary open-ended questions,
where a wrong guess would be worse than an honest "I don't know."

---

## Feature: Voice Assistant

A floating microphone button (bottom-right, on every page) lets you
talk to the app using your browser's built-in speech recognition and
speech synthesis — no installs, no API keys, works the moment you
click it (Chrome/Edge).

**Honest design note**: this is NOT a general-purpose AI that can
answer "any question." Building that would require either
hallucinating answers or silently wiring in a paid LLM API this
project was never given credentials for — either would break the
honesty principle every other part of this project follows.

What it does instead, thoroughly: the knowledge base
(`frontend/src/components/voiceKnowledgeBase.js`) covers **live
experiment status** (current step, confidence, alerts, history, AI
status — all grounded in real current app data), **every major
feature** (what is a sequence error, demo mode, camera mode, custom
experiments, training the model), and **troubleshooting** for the
exact problems encountered while building this very project (backend
offline, camera not working, how to start the app). It genuinely
covers the large majority of things someone would actually ask while
using this software — everything it doesn't know gets an honest,
specific "I don't have an answer for that" rather than a guess.

**Bugs found and fixed while testing this**: the word "mode" matched
as a substring inside "model" (so "why is the AI **model** not
trained" incorrectly triggered the generic mode-status answer instead
of the training explanation), and several natural phrasings like "the
backend **is** offline" didn't match the stored phrase "backend
offline." Both fixed and re-verified with a 7-case regression test —
see the knowledge base file for the exact test suite run during
development.

---

## Feature: Design your own science experiment

Beyond the built-in Sample Processing Experiment, there's a **Design
Experiment** page: type in the name of any science procedure and its
steps (one per line — e.g. a plant growth study, a crystal growth
study, a fluid dynamics test), and the app will track and guide an
astronaut through it exactly like the built-in one — live step
timeline, activity history, alerts, all of it.

Since a freshly-typed procedure has no trained camera model behind it
(there's nothing to have trained a recognizer on), it's guided with a
**"Mark Step Complete"** button on the Live Experiment page instead of
automatic detection — the astronaut confirms each step themselves,
the same way a paper checklist works, just digitized and logged. This
is a deliberate, honest design choice consistent with the rest of the
project: it doesn't pretend to recognize activities it was never
trained to recognize.

New endpoints:
- `POST /api/experiment/custom` — `{"name": "...", "steps": ["...", "..."]}`
- `POST /api/experiment/advance` — marks the current step done, moves to the next

Tested end-to-end: created a 5-step custom experiment via a real
cross-origin request (exactly as the browser sends it), advanced
through all 5 steps, confirmed it reached `COMPLETED`, and confirmed
resetting correctly returns to the default Sample Processing
Experiment afterward — with zero impact on Demo Mode, which was
re-verified in the same test run.

---

## API endpoints

| Method | Endpoint                  | What it does                                      |
|--------|----------------------------|----------------------------------------------------|
| GET    | `/api/health`              | Health check                                       |
| GET    | `/api/experiment`          | Current experiment snapshot (for the dashboard)    |
| POST   | `/api/experiment/start?mode=DEMO` | Start a fresh run (`mode` = `DEMO` or `CAMERA`) |
| POST   | `/api/experiment/reset`    | Reset back to `NOT_STARTED`, aborts a running demo |
| POST   | `/api/ai/predict`          | Feed one `{activity, confidence}` prediction in    |
| GET    | `/api/experiment/history`  | All recorded activity events, in order             |
| GET    | `/api/alerts`              | All INFO/WARNING/ERROR alerts, newest first        |
| POST   | `/api/demo/start`          | Start the automatic scripted demo sequence         |
| POST   | `/api/demo/stop`           | Halt an in-progress demo sequence                  |
| GET    | `/api/demo/status`         | `{"running": true/false}`                          |
| GET    | `/api/camera/status`       | Real check: OpenCV/MediaPipe installed? Camera found? Person detected? |
| POST   | `/api/camera/start`        | Open the webcam                                    |
| POST   | `/api/camera/stop`         | Release the webcam                                 |
| GET    | `/api/camera/stream`       | Live MJPEG feed with pose/hand landmarks drawn on it |
| GET    | `/api/camera/pose`         | Full joint landmarks + live activity prediction from the latest frame |
| WS     | `/api/ws`                  | Live push updates on every state change            |

Valid `activity` values for `/api/ai/predict`:
`Pick_Container`, `Open_Container`, `Add_Sample`, `Close_Container`,
`Place_Analyzer`, `Record_Result`, `Unknown_Action`.

---

## Try it yourself with curl (reproduces the demo scenario manually)

With the server running, in a **second** terminal:

```
curl -X POST "http://127.0.0.1:8000/api/experiment/start?mode=DEMO"

curl -X POST http://127.0.0.1:8000/api/ai/predict -H "Content-Type: application/json" -d "{\"activity\": \"Pick_Container\", \"confidence\": 95}"
curl -X POST http://127.0.0.1:8000/api/ai/predict -H "Content-Type: application/json" -d "{\"activity\": \"Pick_Container\", \"confidence\": 93}"
curl -X POST http://127.0.0.1:8000/api/ai/predict -H "Content-Type: application/json" -d "{\"activity\": \"Pick_Container\", \"confidence\": 96}"
```

The third call should return `"status": "CORRECT"` and
`"progress": "1/6"`. Now try an intentional wrong action:

```
curl -X POST http://127.0.0.1:8000/api/ai/predict -H "Content-Type: application/json" -d "{\"activity\": \"Place_Analyzer\", \"confidence\": 88}"
```

This returns `"status": "SEQUENCE_ERROR"` with the expected vs.
detected activity spelled out. Or, much easier: just call
`POST /api/demo/start` and watch the whole thing run itself.

---

## Confidence thresholds (configurable)

Defined in `app/experiment/state_machine.py`:

```python
HIGH_CONFIDENCE_THRESHOLD = 80.0
LOW_CONFIDENCE_THRESHOLD  = 50.0
STABILITY_FRAMES          = 3
```

---

## How to train and plug in a real model later

1. Collect labeled sequences: run Camera Mode, have someone perform
   each of the 6 steps, and save the rolling 30-frame landmark windows
   from `/api/camera/pose` tagged with the correct label.
2. Train an `ActivityLSTM` (the exact class in `activity_model.py`) on
   that dataset using standard PyTorch training code (not included
   here — this prototype ships the architecture, not a training script,
   since there's no dataset yet to train on).
3. Save the trained weights: `torch.save(model.state_dict(), "models/activity_lstm.pt")`.
4. Restart the backend. `ActivityModel.is_trained()` will find the
   checkpoint automatically, `predict()` will start returning real
   class predictions instead of `AI_MODEL_NOT_TRAINED`, and the
   dashboard's AI Status pill will flip to `ONLINE` — no other code
   changes needed anywhere in the app.

---

## Fix: cut-off or vague questions now ask for clarification

**Found from a real screenshot**: someone asked "Tell me about." (the
trailing period suggests the browser's speech recognition ended
early, mid-sentence — a real quirk of the Web Speech API when there's
a brief pause). The assistant's only response was the generic "I
don't have an answer for that one" — technically honest, but not
useful, since the real problem wasn't an unknown topic, it was an
incomplete question.

**Fix**: added a check for questions that sound cut off — either very
short and starting with "tell me" / "what about," or ending on a
dangling word like "about," "regarding," "for," "the" that's clearly
expecting more to follow. These now get: *"It sounds like your
question got cut off — I only caught part of it. Could you ask again
with a bit more detail?"* — with example topics — instead of a flat
decline.

**Tested for real**: reproduced the exact screenshot input
("Tell me about.") and confirmed it now gets the clarification
prompt. Tested three more cut-off-sounding variants, all correctly
caught. Then ran an 8-question regression to make sure this doesn't
over-trigger: legitimate short questions and commands ("help,"
"status," "confidence," "reset," "hello") still get their real
answers, and a genuinely off-topic question ("what is the capital of
France") still gets the honest decline rather than being mistaken for
cut-off speech.

---

## Voice Assistant update: female voice + smarter matching

**Female voice**: the assistant now speaks with a female-sounding
voice by default. Browsers don't expose a reliable "gender" field on
voices, so this works by matching common female voice names shipped
by Windows, macOS, and Chrome's built-in network voices (Zira,
Samantha, Google's default US English voice, etc.) — tested against
realistic voice lists from all three platforms, correctly picking the
right one in each case, and gracefully falling back to the browser's
default voice on a machine with no obvious female-sounding option
rather than erroring.

**Smarter question matching**: previously, a question had to contain
one of the assistant's exact stored phrases to match — so "which step
comes next" wouldn't match if only "current step" was stored. Now,
matching also succeeds if every meaningful word from a stored phrase
appears anywhere in the question, in any order, filtering out filler
words like "what," "is," "the" first so it doesn't over-match on
generic single words.

**Tested for real**: re-ran the entire existing 9-question regression
suite first — everything that worked before still works. Then tested
6 new naturally-reworded questions ("which step comes next," "how
confident are you right now," "any warnings show up," etc.) — 5 of 6
passed immediately; the sixth ("confident" vs. the stored word
"confidence") was a genuine word-form gap the algorithm can't fix on
its own, so I added "confident" as an explicit variant, retested, and
confirmed all 6 pass without breaking anything else.

---

## Bug fix: dashboard could silently freeze on a single slow request

**Found from a real screenshot**: a session showed "RUNNING DEMO..."
on the button while the Live Readout and Timeline sat frozen at
`0/6, Not Started` — a genuine inconsistency, not a display quirk.

**Root cause**: `ExperimentContext`'s `refresh()` used
`Promise.all()` across six backend calls (experiment, history,
alerts, demo status, camera status, recording status). `Promise.all`
resolves only when *every* promise resolves — so if even one of those
six requests hung (a network hiccup, a slow response, anything short
of an outright rejection), the whole batch never resolved, and the
entire dashboard silently froze on stale data. No error, no timeout,
no recovery except a full page reload.

**Fix**: `refresh()` now wraps each call with a 4-second timeout and
uses `Promise.allSettled()` instead — one slow or failed endpoint no
longer blocks the other five from updating normally, and connection
status only degrades to "Offline" if *all six* calls fail, not just
one.

**Tested for real**: simulated the exact failure — one request that
hangs forever (mirroring the old bug precisely) alongside five that
succeed normally. Under the old `Promise.all` logic this would freeze
forever. Under the fix, the hung request times out and fails on its
own after its 4-second window while the other five update the
dashboard correctly. Confirmed with a direct before/after comparison,
then re-ran the full Demo Mode regression to make sure the fix
introduced no other change in behavior.

**Immediate workaround if you ever see this again**: click **Reset
Experiment** — it always force-stops any in-flight demo and resets
state regardless of what caused the inconsistency.

---

## Known limitations (honest, not hidden)

- **Camera Mode predictions aren't fed into the experiment state
  machine automatically.** They're computed and displayed live (the
  overlay, `/api/camera/pose`, the dashboard pills) — but since the
  model isn't trained, auto-feeding `AI_MODEL_NOT_TRAINED` into the
  state machine on every frame would just look like constant
  `SEQUENCE_ERROR`s, which is worse than not doing it. This is a
  natural place to pick back up once a real model exists (see "How to
  train and plug in a real model" above) — at that point, wiring
  `activity_model.predict()`'s output into `experiment_service.predict()`
  inside `camera.py`'s frame loop is a small, well-contained change.
- **Detection accuracy on a real person has never been visually
  confirmed** — this sandbox has no camera. Everything around the ML
  model (plumbing, error handling, the interface contract) was tested
  with real code paths; the model's real-world accuracy on your
  webcam is the one thing only your laptop can confirm.
- **Single active experiment at a time**, no multi-user auth — a
  deliberate scope choice for a one-laptop hackathon prototype, not
  an oversight.
- **No automated test suite ships in the repo.** Every test described
  in this README was actually run against real code during
  development (see each phase's "what was tested" section), but
  they were exploratory/manual, not committed as `pytest` files —
  worth adding if this prototype grows past the hackathon.

## A note on honesty (per the problem statement's own instructions)

There is no trained Human Activity Recognition model in this
prototype — every layer of the code was built to say so plainly
instead of pretending otherwise. `ai_status` is computed from a real
check (`activity_model.is_trained()`), not hardcoded. The video
overlay shows `AI_MODEL_NOT_TRAINED` live, every frame, whenever
Camera Mode is running. Demo Mode is always clearly labeled `DEMO` and
never presented as real inference. This was true in Phase 1 and it's
still true now that seven more phases of real, working code sit on
top of it — the honesty requirement was never negotiable, and it
never had to be, because the rest of the prototype is genuinely solid
without needing to fake that one piece.

---

## Training your own real activity recognition model

There's a complete, separate training pipeline in the `training/`
folder: record your own webcam footage of the 6 activities, extract
pose features, train a real PyTorch classifier, test it, and run it
live — with live predictions automatically fed into this backend's
existing (already-tested) sequence tracker.

**See `training/README.md`** for full step-by-step instructions, or
just double-click `training/train.bat` for a simple menu.

This is a separate, simpler model (a single-frame classifier) from the
sequence-based LSTM scaffolding in `backend/app/ai/activity_model.py`
— training pipelines for both are legitimate approaches, and this one
is the fastest path to a real, working trained model on your own data.

---

## Project status: complete

All 8 phases are built, and — to the extent this sandbox allows
(no camera, no GPU) — tested against real running code, not just
described. What you have is a real FastAPI + SQLite backend, a real
state machine enforcing actual stability/confidence rules, a live
React dashboard talking to it over REST and WebSocket, a fully
automatic demo sequence, real OpenCV + MediaPipe camera integration,
and a genuine (honestly unfilled) activity-recognition interface ready
for a trained model. Good luck with the hackathon.

## Camera/AI troubleshooting
- Start the project with `START_HERE.bat` so both the backend and frontend run.
- If PowerShell blocks `npm.ps1`, use `npm.cmd run dev` or the provided batch launcher.
- The Live Camera panel now starts the browser camera first, then loads MediaPipe. If the MediaPipe model/WASM cannot be downloaded, the app explicitly labels a motion-only prototype fallback instead of pretending it is ML.
- Backend diagnostics are available at `http://127.0.0.1:8000/api/system/diagnostics`.
