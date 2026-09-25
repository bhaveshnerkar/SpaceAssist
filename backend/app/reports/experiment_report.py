"""Detailed experiment TXT reporting."""
from collections import Counter


def build_experiment_report(service, db):
    exp_id = service.experiment_id
    state = service.get_state()
    if not exp_id:
        return {"experiment": state, "events": [], "summary": {}}
    from app.models.models import Experiment, ActivityEvent
    exp = db.query(Experiment).filter(Experiment.id == exp_id).first()
    events = db.query(ActivityEvent).filter(ActivityEvent.experiment_id == exp_id).order_by(ActivityEvent.timestamp.asc()).all()
    errors = sum(1 for e in events if e.status == "SEQUENCE_ERROR")
    uncertain = sum(1 for e in events if e.status in ("LOW_CONFIDENCE", "UNKNOWN_ACTION", "PENDING"))
    completed_steps = state.get("current_step_index", 0)
    total = state.get("total_steps", 0)
    accuracy = round((completed_steps / total) * 100, 2) if total else 0
    event_rows = []
    for e in events:
        expected_motion = e.expected or "—"
        event_rows.append({
            "timestamp": e.timestamp.isoformat(),
            "expected": expected_motion,
            "expected_step": getattr(e, "expected_step", None) or expected_motion,
            "detected": e.detected,
            "detected_motion": e.detected,
            "confidence": e.confidence,
            "status": e.status,
            "reason": _reason(e.status, expected_motion, e.detected),
            "correction": _correction(e.status, expected_motion),
        })
    return {
        "experiment": {"id": exp_id, "name": state.get("name"), "mode": state.get("mode"), "status": state.get("status"), "started_at": exp.started_at.isoformat() if exp and exp.started_at else None, "completed_at": exp.completed_at.isoformat() if exp and exp.completed_at else None},
        "events": event_rows,
        "steps": state.get("steps", []),
        "summary": {"total_steps": total, "completed_steps": completed_steps, "incomplete_steps": max(0, total-completed_steps), "final_accuracy": accuracy, "total_errors": errors, "uncertain_events": uncertain, "skipped_steps": [], "repeated_steps": _repeated(events)},
    }


def _reason(status, expected, detected):
    if status == "SEQUENCE_ERROR": return f"Expected {expected}, but detected {detected}."
    if status == "LOW_CONFIDENCE": return "The prediction confidence was below the configured threshold."
    if status == "UNKNOWN_ACTION": return "No reliable motion class was available."
    return ""


def _correction(status, expected):
    if status in ("SEQUENCE_ERROR", "LOW_CONFIDENCE", "UNKNOWN_ACTION"):
        return f"Repeat the expected motion: {expected}. Keep the full body visible and perform the motion clearly."
    return ""


def _repeated(events):
    counts = Counter((e.expected, e.detected) for e in events if e.expected == e.detected)
    return [{"step": k[0], "count": v} for k, v in counts.items() if v > 3]


def report_text(report):
    exp = report["experiment"]
    s = report["summary"]
    lines = [
        "SPACEASSIST AI — DETAILED EXPERIMENT REPORT", "=" * 58,
        f"Experiment: {exp.get('name')}", f"Mode: {exp.get('mode')}", f"Status: {exp.get('status')}",
        f"Date/Time Started: {exp.get('started_at') or 'N/A'}", f"Date/Time Completed: {exp.get('completed_at') or 'N/A'}",
        f"Total steps: {s['total_steps']}", "", "STEP-BY-STEP TIMELINE", "-" * 58,
    ]
    for i, step in enumerate(report.get("steps", []), 1):
        lines += [f"Step {i}: {step['step_name']}", f"  Expected motion: {step.get('motion') or 'Manual confirmation required'}", f"  Status: {step['status']}"]
    lines += ["", "EVENT TIMELINE", "-" * 58]
    for e in report["events"]:
        lines += [f"{e['timestamp']} | {e['status']}", f"  Expected step: {e.get('expected_step', e['expected'])}", f"  Expected motion: {e['expected']}", f"  Detected motion: {e.get('detected_motion', e['detected'])}", f"  Confidence: {e['confidence']:.1f}%"]
        if e["reason"]: lines.append(f"  Reason for error: {e['reason']}")
        if e["correction"]: lines.append(f"  Correction/feedback: {e['correction']}")
    lines += ["", "SUMMARY", "-" * 58, f"Final accuracy: {s['final_accuracy']:.2f}%", f"Total errors: {s['total_errors']}", f"Completed steps: {s['completed_steps']}", f"Incomplete steps: {s['incomplete_steps']}", f"Skipped steps: {s['skipped_steps'] or 'None'}", f"Repeated steps: {s['repeated_steps'] or 'None'}", "", "Overall summary: SpaceAssist compared the detected motion stream with the expected experiment sequence and recorded correct progress, errors, confidence, and feedback. Continue collecting labeled samples to improve the trained model over time."]
    return "\n".join(lines) + "\n"
