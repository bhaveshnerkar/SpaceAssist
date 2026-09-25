"""Experiment lifecycle, persistence and motion validation."""
from datetime import datetime
from sqlalchemy.orm import Session
from app.experiment.state_machine import ExperimentStateMachine
from app.models.models import Experiment, ExperimentStep, ActivityEvent, Alert
from app.ai.activity_model import activity_model
from app.experiment.catalog import BUILTIN_EXPERIMENTS

DEFAULT_EXPERIMENT_NAME = BUILTIN_EXPERIMENTS["object-picking"]["name"]

class ExperimentService:
    def __init__(self):
        self.machine = ExperimentStateMachine()
        self.experiment_id = None
        self.mode = "CAMERA"
        self.name = DEFAULT_EXPERIMENT_NAME

    def start(self, db: Session, mode="CAMERA", definition=None):
        definition = definition or BUILTIN_EXPERIMENTS["object-picking"]
        self.machine.start(definition["steps"], definition["name"], mode)
        self.mode = mode
        self.name = definition["name"]
        experiment = Experiment(name=self.name, mode=mode, status="IN_PROGRESS", current_step_index=0, started_at=datetime.utcnow())
        db.add(experiment); db.commit(); db.refresh(experiment)
        for i, step in enumerate(definition["steps"]):
            db.add(ExperimentStep(experiment_id=experiment.id, step_index=i, step_name=step["name"], status="IN_PROGRESS" if i == 0 else "PENDING"))
        db.commit()
        self.experiment_id = experiment.id
        self._log_alert(db, "INFO", f"Experiment '{self.name}' started in {mode} mode.")
        return self.get_state()

    def start_custom(self, db, name, steps):
        self.machine.start(steps, name, "CUSTOM")
        self.mode, self.name = "CUSTOM", name
        experiment = Experiment(name=name, mode="CUSTOM", status="IN_PROGRESS", current_step_index=0, started_at=datetime.utcnow())
        db.add(experiment); db.commit(); db.refresh(experiment)
        for i, step in enumerate(steps):
            db.add(ExperimentStep(experiment_id=experiment.id, step_index=i, step_name=step["name"], status="IN_PROGRESS" if i == 0 else "PENDING"))
        db.commit(); self.experiment_id = experiment.id
        self._log_alert(db, "INFO", f"Custom experiment '{name}' started with {len(steps)} steps.")
        return self.get_state()

    def reset(self, db):
        self.machine.reset(); self.experiment_id = None; self.mode = "CAMERA"; self.name = DEFAULT_EXPERIMENT_NAME
        return self.get_state()

    def predict(self, db, activity, confidence):
        result = self.machine.process(activity, confidence)
        return self._apply_result(db, result, confidence)

    def advance(self, db):
        result = self.machine.manual_advance()
        return self._apply_result(db, result, 100.0)

    def _apply_result(self, db, result, confidence):
        if self.experiment_id is not None and result.get("expected_step") is not None:
            event = ActivityEvent(
                experiment_id=self.experiment_id, timestamp=result["timestamp"],
                expected=result.get("expected") or "—",
                expected_step=result.get("expected_step") or "—",
                detected=str(result.get("detected") or "—"), confidence=confidence, status=result["status"]
            )
            db.add(event)
            exp = db.query(Experiment).filter(Experiment.id == self.experiment_id).first()
            if exp:
                exp.current_step_index = self.machine.current_index
                if result["status"] in ("CORRECT", "COMPLETED"):
                    for i, step in enumerate(self.machine.step_defs):
                        db_step = db.query(ExperimentStep).filter(ExperimentStep.experiment_id == self.experiment_id, ExperimentStep.step_index == i).first()
                        if db_step:
                            db_step.status = "CORRECT" if i < self.machine.current_index else "IN_PROGRESS" if i == self.machine.current_index and not self.machine.completed else "PENDING"
                    if result["status"] == "COMPLETED":
                        exp.status = "COMPLETED"; exp.completed_at = datetime.utcnow()
                        self._log_alert(db, "INFO", "Experiment completed successfully.")
                elif result["status"] == "SEQUENCE_ERROR": self._log_alert(db, "ERROR", result["message"])
                elif result["status"] in ("LOW_CONFIDENCE", "UNKNOWN_ACTION", "MANUAL_REQUIRED"): self._log_alert(db, "WARNING", result["message"])
            db.commit()
        out = dict(result); out["timestamp"] = result["timestamp"].isoformat(); return out

    def _log_alert(self, db, level, message):
        db.add(Alert(experiment_id=self.experiment_id, timestamp=datetime.utcnow(), level=level, message=message)); db.commit()

    def get_state(self):
        state = self.machine.get_state()
        return {"experiment_id": self.experiment_id, "name": self.name, "mode": self.mode, "ai_status": "ONLINE" if activity_model.is_trained() else "BASELINE_ONLINE", **state}

experiment_service = ExperimentService()
