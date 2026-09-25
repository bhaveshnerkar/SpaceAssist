"""Motion-aware experiment state machine with explicit retry/error states."""
from datetime import datetime
from app.experiment.catalog import BUILTIN_EXPERIMENTS

HIGH_CONFIDENCE_THRESHOLD = 80.0
LOW_CONFIDENCE_THRESHOLD = 50.0
STABILITY_FRAMES = 3

def _default_steps():
    return [{"name": s["name"], "motion": s.get("motion")} for s in BUILTIN_EXPERIMENTS["object-picking"]["steps"]]

class ExperimentStateMachine:
    def __init__(self, stability_frames=STABILITY_FRAMES, high_conf=HIGH_CONFIDENCE_THRESHOLD, low_conf=LOW_CONFIDENCE_THRESHOLD):
        self.stability_frames = stability_frames
        self.high_conf = high_conf
        self.low_conf = low_conf
        self.reset()

    def reset(self):
        self.step_defs = _default_steps(); self.current_index = 0
        self.status = "NOT_STARTED"; self.started = False; self.completed = False
        self._buffer = []; self.last_step_status = None; self.last_feedback = ""
        self.name = "Object Picking Experiment"; self.mode = "CAMERA"

    @property
    def expected_activity(self):
        return self.step_defs[self.current_index].get("motion") if self.current_index < len(self.step_defs) else None
    @property
    def expected_step_name(self):
        return self.step_defs[self.current_index]["name"] if self.current_index < len(self.step_defs) else None

    def start(self, steps=None, name="Object Picking Experiment", mode="CAMERA"):
        self.reset(); self.step_defs = steps or _default_steps(); self.name=name; self.mode=mode
        self.status="IN_PROGRESS"; self.started=True; self.last_step_status="IN_PROGRESS"

    def process(self, activity, confidence):
        timestamp=datetime.utcnow()
        if not self.started: return self._result("NOT_STARTED", activity, confidence, "Start the experiment first.", timestamp)
        if self.completed: return self._result("COMPLETED", activity, confidence, "Experiment already completed.", timestamp)
        expected=self.expected_activity; step_name=self.expected_step_name
        if expected is None:
            self.last_step_status="RETRY"; self.last_feedback=f"No automatic motion mapping is available for {step_name}."
            return self._result("MANUAL_REQUIRED", activity, confidence, self.last_feedback, timestamp)
        if confidence < self.low_conf:
            self._buffer.clear(); self.last_step_status="RETRY"
            self.last_feedback=f"I could not confirm {step_name}. Keep your full body visible and perform the motion clearly."
            return self._result("LOW_CONFIDENCE", activity, confidence, self.last_feedback, timestamp)
        if activity in (None, "Unknown_Action", "AI_MODEL_NOT_TRAINED"):
            self._buffer.clear(); self.last_step_status="RETRY"
            self.last_feedback=f"Motion not recognized. Expected {expected} for step: {step_name}."
            return self._result("UNKNOWN_ACTION", activity, confidence, self.last_feedback, timestamp)
        if activity != expected:
            self._buffer.clear(); self.last_step_status="RETRY"
            self.last_feedback=f"Wrong motion. Expected {expected} ({step_name}), but detected {activity}. Repeat the current step."
            return self._result("SEQUENCE_ERROR", activity, confidence, self.last_feedback, timestamp)

        self.last_step_status="IN_PROGRESS"; self._buffer.append(activity); self._buffer=self._buffer[-self.stability_frames:]
        if len(self._buffer) < self.stability_frames:
            return self._result("PENDING", activity, confidence, f"Correct: {expected}. Hold the motion briefly to confirm step {self.current_index+1}.", timestamp)
        self._buffer.clear(); completed_name=step_name; completed_motion=expected
        self.current_index += 1; self.last_step_status="CORRECT"; self.last_feedback=f"Step complete: {completed_name}. Moving to the next step."
        if self.current_index >= len(self.step_defs):
            self.completed=True; self.status="COMPLETED"; self.last_step_status="CORRECT"
            return self._result("COMPLETED", activity, confidence, "Experiment completed successfully. All steps were confirmed.", timestamp, completed_name, completed_motion)
        return self._result("CORRECT", activity, confidence, self.last_feedback, timestamp, completed_name, completed_motion)

    def manual_advance(self):
        timestamp=datetime.utcnow()
        if not self.started: return self._result("NOT_STARTED", None, 100.0, "Start the experiment first.", timestamp)
        if self.completed: return self._result("COMPLETED", None, 100.0, "Experiment already completed.", timestamp)
        name=self.expected_step_name; motion=self.expected_activity
        self.current_index += 1; self.last_step_status="CORRECT"
        if self.current_index >= len(self.step_defs):
            self.completed=True; self.status="COMPLETED"; return self._result("COMPLETED", motion, 100.0, "Experiment completed successfully.", timestamp, name, motion)
        return self._result("CORRECT", motion, 100.0, f"Step '{name}' marked complete. Moving to the next step.", timestamp, name, motion)

    def _result(self,status,detected,confidence,message,timestamp,expected_step=None,expected_motion=None):
        idx=self.current_index; step=self.step_defs[idx] if idx < len(self.step_defs) else None
        return {"status":status,"expected":expected_motion if expected_motion is not None else (step.get("motion") if step else None),"expected_step":expected_step or (step.get("name") if step else None),"detected":detected or "—","confidence":confidence,"current_step_index":self.current_index,"progress":f"{self.current_index}/{len(self.step_defs)}","completed":self.completed,"message":message,"timestamp":timestamp}

    def get_state(self):
        steps=[]
        for i,step in enumerate(self.step_defs):
            if i < self.current_index: status="CORRECT"
            elif i == self.current_index and self.started and not self.completed: status=self.last_step_status or "IN_PROGRESS"
            else: status="PENDING"
            steps.append({"step_index":i,"step_name":step["name"],"motion":step.get("motion"),"ai_trackable":bool(step.get("motion")),"status":status})
        return {"status":self.status,"is_custom":self.mode=="CUSTOM","name":self.name,"mode":self.mode,"current_step_index":self.current_index,"total_steps":len(self.step_defs),"progress":f"{self.current_index}/{len(self.step_defs)}","steps":steps,"last_step_status":self.last_step_status,"last_feedback":self.last_feedback}
