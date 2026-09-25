"""Built-in experiments and motion vocabulary for SpaceAssist AI."""

MOTIONS = [
    "Stand", "Walk", "Reach", "Pick", "Open", "Pour", "Close",
    "Place", "Sit", "Idle", "Mix", "Bend", "Stretch",
]

MOTION_ALIASES = {
    "stand": "Stand", "standing": "Stand", "stand still": "Stand",
    "walk": "Walk", "walking": "Walk", "move forward": "Walk", "move back": "Walk",
    "reach": "Reach", "reach for": "Reach", "extend hand": "Reach", "extend arm": "Reach",
    "pick": "Pick", "pick up": "Pick", "grab": "Pick", "take": "Pick", "lift": "Pick",
    "open": "Open", "unlock": "Open", "open container": "Open",
    "pour": "Pour", "pour into": "Pour", "pour material": "Pour",
    "close": "Close", "shut": "Close", "seal": "Close",
    "place": "Place", "put down": "Place", "put": "Place", "set down": "Place",
    "sit": "Sit", "sitting": "Sit", "sit down": "Sit",
    "idle": "Idle", "wait": "Idle", "pause": "Idle", "rest": "Idle",
    "mix": "Mix", "stir": "Mix", "stirring": "Mix",
    "bend": "Bend", "bend down": "Bend", "squat": "Bend",
    "stretch": "Stretch", "stretch arms": "Stretch", "stretching": "Stretch",
}

BUILTIN_EXPERIMENTS = {
    "simple-motion": {
        "name": "Simple Motion Experiment",
        "description": "Basic full-body motion sequence for calibration.",
        "steps": [
            {"name": "Stand still", "motion": "Stand"},
            {"name": "Walk forward", "motion": "Walk"},
            {"name": "Reach forward", "motion": "Reach"},
            {"name": "Return to standing", "motion": "Stand"},
            {"name": "Sit down", "motion": "Sit"},
        ],
    },
    "object-picking": {
        "name": "Object Picking Experiment",
        "description": "Reach, pick, move and place an object safely.",
        "steps": [
            {"name": "Stand beside the object", "motion": "Stand"},
            {"name": "Reach toward the object", "motion": "Reach"},
            {"name": "Pick up the object", "motion": "Pick"},
            {"name": "Walk to the target area", "motion": "Walk"},
            {"name": "Place the object down", "motion": "Place"},
        ],
    },
    "yoga-monitoring": {
        "name": "Simple Yoga Monitoring",
        "description": "A small sequence for posture and movement monitoring.",
        "steps": [
            {"name": "Stand in starting position", "motion": "Stand"},
            {"name": "Stretch both arms", "motion": "Stretch"},
            {"name": "Bend down slowly", "motion": "Bend"},
            {"name": "Return to standing", "motion": "Stand"},
            {"name": "Sit for recovery", "motion": "Sit"},
        ],
    },
}


def normalize_motion(text: str):
    """Map natural-language step text to a known motion when possible."""
    t = " ".join(text.lower().strip().split())
    if not t:
        return None
    # Longest aliases first avoids matching 'put' before 'put down'.
    for alias in sorted(MOTION_ALIASES, key=len, reverse=True):
        if alias in t:
            return MOTION_ALIASES[alias]
    return None


def parse_txt_experiment(content: str, filename: str = "experiment.txt") -> dict:
    """Parse a simple human-authored TXT procedure into editable steps."""
    lines = []
    name = filename.rsplit(".", 1)[0].replace("_", " ").strip() or "Custom Experiment"
    for raw in content.splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or line.startswith("//"):
            continue
        lower = line.lower()
        if lower.startswith("experiment:") or lower.startswith("name:") or lower.startswith("title:"):
            name = line.split(":", 1)[1].strip() or name
            continue
        # Remove common numbered/bulleted prefixes.
        import re
        line = re.sub(r"^(?:[-*•]|\d+[.)])\s*", "", line).strip()
        if line:
            lines.append(line)
    if not lines:
        raise ValueError("The TXT file does not contain any experiment steps.")
    steps = [
        {"name": text, "motion": normalize_motion(text), "needs_manual_confirmation": normalize_motion(text) is None}
        for text in lines[:40]
    ]
    return {"name": name[:120], "steps": steps, "filename": filename, "total_steps": len(steps)}
