"""
Activity Reporter — Camera -> Motion Detection -> Activity Recognition -> Text Report

This module is the missing link between the continuous, per-frame pose
data camera.py already produces and a human-readable narrative report
like:

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

It works by watching two things over time, sampled once per second
(reusing the same cadence as the observation log in camera.py):

  1. Presence transitions — person_detected flipping True/False
     produces "entered" / "left" events.
  2. Horizontal movement — tracking a body centroid (average of the
     hips, falling back to shoulders) across a short rolling window
     to detect "moved left to right", "moved right to left", and
     "stopped" once movement settles down again.

DESIGN NOTE on YOLO: the request that inspired this module listed
YOLO as a technology option for person/object detection. This project
already has MediaPipe Pose doing exactly that job — reliably, and
already integrated end-to-end. Adding YOLO on top would be a second,
heavier, redundant dependency for the same job (see how much trouble
pinning the right MediaPipe/PyTorch versions already caused earlier
in this project). If multi-object detection beyond "is there a
person" is ever needed, YOLO would be the right tool then — but not
for this.

Honesty note, consistent with the rest of this project: this detects
real motion and real presence transitions from the real MediaPipe
pose stream — it does not claim to recognize which EXPERIMENT STEP
is happening (that's activity_model.py's job, and it's honest about
not being trained yet). "Person moved left to right" is a genuine,
literal description of tracked motion, not a guess dressed up as more
than it is.
"""

import json
from collections import deque
from datetime import datetime

MOVEMENT_THRESHOLD = 0.12   # normalized x-coordinate delta (0-1 scale) counted as "moved"
STOP_THRESHOLD = 0.03       # delta below this counts as "stopped" after having moved
POSITION_WINDOW = 5         # how many samples make up the rolling movement window
MAX_EVENTS = 500            # cap so a long-running session doesn't grow unbounded


class ActivityReporter:
    """Tracks one camera session's worth of discrete activity events."""

    def __init__(self):
        self.reset()

    def reset(self):
        self.events = deque(maxlen=MAX_EVENTS)
        self.was_person_detected = False
        self.ever_detected_person = False
        self.position_history = deque(maxlen=POSITION_WINDOW)
        self.movement_state = "idle"  # idle | moving_right | moving_left | stopped
        self.session_started_at = datetime.utcnow()

    def _add_event(self, description: str):
        self.events.append({
            "timestamp": datetime.utcnow().isoformat(),
            "description": description,
        })

    def _centroid_x(self, landmarks: dict):
        """Average horizontal position of the hips (falls back to
        shoulders if hips aren't confidently visible) — a stable,
        simple stand-in for "where the person's body is" left-to-right."""
        for pair in (("left_hip", "right_hip"), ("left_shoulder", "right_shoulder")):
            left, right = landmarks.get(pair[0]), landmarks.get(pair[1])
            if left and right and left.get("visibility", 0) > 0.3 and right.get("visibility", 0) > 0.3:
                return (left["x"] + right["x"]) / 2
        return None

    def record_frame(self, pose_result: dict):
        """
        Call once per sampled frame (camera.py calls this at the same
        once-per-second cadence as its observation log — every raw
        frame would be far too noisy for discrete event detection).
        """
        person_detected = pose_result.get("person_detected", False)

        if person_detected and not self.was_person_detected:
            self._add_event("Person entered the camera view")
            self.position_history.clear()
            self.movement_state = "idle"
        elif not person_detected and self.was_person_detected:
            self._add_event("Person left the camera view")
            self.position_history.clear()
            self.movement_state = "idle"

        self.was_person_detected = person_detected
        if person_detected:
            self.ever_detected_person = True
            x = self._centroid_x(pose_result.get("landmarks", {}))
            if x is not None:
                self.position_history.append(x)
                if len(self.position_history) >= 3:
                    # Movement uses the full rolling window (more
                    # samples = more confident about a real trend).
                    move_delta = self.position_history[-1] - self.position_history[0]
                    # Stopping uses only the most recent samples —
                    # using the same wide window here would mean
                    # "stopped" couldn't fire until the older, still-
                    # moving samples fully aged out, delaying it
                    # well after the person had actually settled.
                    recent = list(self.position_history)[-3:]
                    stop_spread = max(recent) - min(recent)

                    if move_delta > MOVEMENT_THRESHOLD and self.movement_state != "moving_right":
                        self._add_event("Person moved from left to right")
                        self.movement_state = "moving_right"
                    elif move_delta < -MOVEMENT_THRESHOLD and self.movement_state != "moving_left":
                        self._add_event("Person moved from right to left")
                        self.movement_state = "moving_left"
                    elif stop_spread < STOP_THRESHOLD and self.movement_state in ("moving_right", "moving_left"):
                        self._add_event("Person stopped")
                        self.movement_state = "stopped"

    def get_status(self) -> dict:
        return {
            "total_activity_events": len(self.events),
            "person_currently_detected": self.was_person_detected,
            "recent_events": list(self.events)[-5:],
        }

    def generate_report(self) -> dict:
        now = datetime.utcnow()
        motion_events = [e for e in self.events if "moved" in e["description"] or "stopped" in e["description"]]
        return {
            "date": now.strftime("%d-%m-%Y"),
            "time": now.strftime("%H:%M"),
            "person_detected": "Yes" if self.ever_detected_person else "No",
            "detected_activities": [e["description"] for e in self.events],
            "motion_status": "Detected" if motion_events else "Not Detected",
            "total_activity_events": len(self.events),
            "session_started_at": self.session_started_at.isoformat(),
            "report_generated_at": now.isoformat(),
            "raw_events": list(self.events),
        }

    def report_as_text(self) -> str:
        report = self.generate_report()
        lines = [
            "ACTIVITY REPORT",
            "-" * 28,
            f"Date: {report['date']}",
            f"Time: {report['time']}",
            f"Person Detected: {report['person_detected']}",
            "Detected Activities:",
        ]
        if report["detected_activities"]:
            for i, activity in enumerate(report["detected_activities"], start=1):
                lines.append(f"{i}. {activity}")
        else:
            lines.append("(none recorded this session)")
        lines.append(f"Motion Status: {report['motion_status']}")
        lines.append(f"Total Activity Events: {report['total_activity_events']}")
        return "\n".join(lines) + "\n"

    def report_as_json(self) -> str:
        return json.dumps(self.generate_report(), indent=2)

    def report_as_pdf_bytes(self) -> bytes:
        """Renders the same report as a one-page PDF using reportlab."""
        import io
        from reportlab.lib.pagesizes import letter
        from reportlab.lib.styles import getSampleStyleSheet
        from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, ListFlowable, ListItem

        report = self.generate_report()
        buffer = io.BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=letter, title="SpaceAssist AI Activity Report")
        styles = getSampleStyleSheet()
        story = []

        story.append(Paragraph("Activity Report", styles["Title"]))
        story.append(Paragraph("SpaceAssist AI - Camera Session Summary", styles["Normal"]))
        story.append(Spacer(1, 16))

        for label, value in [
            ("Date", report["date"]),
            ("Time", report["time"]),
            ("Person Detected", report["person_detected"]),
            ("Motion Status", report["motion_status"]),
            ("Total Activity Events", str(report["total_activity_events"])),
        ]:
            story.append(Paragraph(f"<b>{label}:</b> {value}", styles["Normal"]))

        story.append(Spacer(1, 16))
        story.append(Paragraph("Detected Activities", styles["Heading2"]))

        if report["detected_activities"]:
            items = [ListItem(Paragraph(activity, styles["Normal"])) for activity in report["detected_activities"]]
            story.append(ListFlowable(items, bulletType="1"))
        else:
            story.append(Paragraph("(none recorded this session)", styles["Normal"]))

        doc.build(story)
        return buffer.getvalue()


# Single shared instance - one camera, one active report session, one prototype.
activity_reporter = ActivityReporter()
