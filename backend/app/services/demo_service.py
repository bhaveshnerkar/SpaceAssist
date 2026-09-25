"""
Demo Mode Runner

This is what makes "Start Demo" actually demonstrate the full
hackathon scenario from the spec without anyone touching a webcam or
/docs: it feeds a scripted, realistic sequence of (activity,
confidence) predictions into the SAME state machine and SAME
persistence layer that Camera Mode will use in Phase 6.

The script deliberately includes one wrong action so the sequence-error
warning path gets exercised automatically, exactly like:

    Pick Container -> Open Container -> Add Sample -> WRONG ACTION ->
    Warning -> Correct Action -> Close Container -> Place in Analyzer ->
    Record Result -> EXPERIMENT COMPLETED

IMPORTANT: this is explicitly simulated data, not a real AI model.
The dashboard's Mode pill always reads "DEMO" while this runs, and
`ai_status` still correctly reports AI_MODEL_NOT_TRAINED — this
module never claims to be doing real activity recognition.
"""

import asyncio
import logging
from app.database.db import SessionLocal
from app.services.experiment_service import experiment_service
from app.services.ws_manager import manager

logger = logging.getLogger("spaceassist")

# Each step needs 3 consecutive stable, matching predictions to advance
# (see STABILITY_FRAMES in state_machine.py). The single Place_Analyzer
# entry in the middle is the intentional wrong action.
DEMO_SCRIPT = [
    ("Stand", 91), ("Stand", 94), ("Stand", 96),
    ("Reach", 90), ("Reach", 93), ("Reach", 96),
    ("Pick", 91), ("Pick", 94), ("Pick", 97),
    ("Walk", 90), ("Walk", 93), ("Walk", 95),
    ("Reach", 88),  # intentional wrong action for Place
    ("Place", 91), ("Place", 94), ("Place", 97),
]

STEP_DELAY_SECONDS = 0.9


class DemoRunner:
    """Runs DEMO_SCRIPT as a background asyncio task."""

    def __init__(self):
        self._task = None
        self._running = False

    def is_running(self) -> bool:
        return self._running

    async def _run(self):
        self._running = True
        db = SessionLocal()
        try:
            from app.experiment.catalog import BUILTIN_EXPERIMENTS
            state = experiment_service.start(db, mode="DEMO", definition=BUILTIN_EXPERIMENTS["object-picking"])
            await manager.broadcast({"event": "demo_started", "state": state})
            await asyncio.sleep(STEP_DELAY_SECONDS)

            for activity, confidence in DEMO_SCRIPT:
                if not self._running:
                    break
                result = experiment_service.predict(db, activity, confidence)
                await manager.broadcast({
                    "event": "prediction",
                    "result": result,
                    "state": experiment_service.get_state(),
                })
                await asyncio.sleep(STEP_DELAY_SECONDS)

            if self._running:
                await manager.broadcast({"event": "demo_finished", "state": experiment_service.get_state()})
        except Exception as exc:
            # A mid-run failure (e.g. a database error) should never
            # just vanish silently — log it server-side and tell any
            # connected dashboard so the person isn't left wondering
            # why the demo stopped partway through.
            logger.exception("Demo run failed unexpectedly")
            try:
                db.rollback()
            except Exception:
                pass
            await manager.broadcast({
                "event": "demo_error",
                "message": f"Demo run stopped due to an unexpected error: {exc}",
            })
        finally:
            self._running = False
            db.close()

    def start(self) -> bool:
        """Returns False if a demo run is already in progress."""
        if self._running:
            return False
        self._task = asyncio.create_task(self._run())
        return True

    def stop(self):
        """Signals the loop to stop after its current prediction."""
        self._running = False


demo_runner = DemoRunner()
