"""
Pydantic schemas used for request validation and response typing.
"""

from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, field_validator

# The only activity labels the recognizer (real or Demo Mode) is
# allowed to report. Anything else is a malformed request, not a
# valid "the AI saw something weird" case — that's what
# Unknown_Action is for.
VALID_ACTIVITIES = {
    "Stand", "Walk", "Reach", "Pick", "Open", "Pour", "Close",
    "Place", "Sit", "Idle", "Mix", "Bend", "Stretch", "Unknown_Action",
}


class PredictRequest(BaseModel):
    activity: str
    confidence: float

    @field_validator("activity")
    @classmethod
    def activity_must_be_known(cls, v):
        if v not in VALID_ACTIVITIES:
            raise ValueError(f"activity must be one of {sorted(VALID_ACTIVITIES)}, got {v!r}")
        return v

    @field_validator("confidence")
    @classmethod
    def confidence_must_be_a_percentage(cls, v):
        if not (0 <= v <= 100):
            raise ValueError(f"confidence must be between 0 and 100, got {v}")
        return v


class CustomStep(BaseModel):
    name: str
    motion: Optional[str] = None
    needs_manual_confirmation: bool = False

class CustomExperimentRequest(BaseModel):
    name: str
    steps: List[CustomStep]

    @field_validator("name")
    @classmethod
    def name_not_blank(cls, v):
        v = v.strip()
        if not v:
            raise ValueError("name cannot be blank")
        if len(v) > 120:
            raise ValueError("name must be 120 characters or fewer")
        return v

    @field_validator("steps")
    @classmethod
    def steps_are_reasonable(cls, v):
        cleaned = [s for s in v if s.name.strip()]
        if len(cleaned) < 1: raise ValueError("at least one step is required")
        if len(cleaned) > 40: raise ValueError("40 steps maximum")
        for step in cleaned:
            if len(step.name) > 200: raise ValueError("each step must be 200 characters or fewer")
        return cleaned


class PredictResponse(BaseModel):
    status: str
    expected: Optional[str] = None
    detected: str
    confidence: float
    current_step_index: int
    progress: str
    completed: bool
    message: Optional[str] = None


class StepInfo(BaseModel):
    step_index: int
    step_name: str
    status: str


class ExperimentState(BaseModel):
    experiment_id: Optional[int] = None
    name: str
    mode: str
    status: str
    current_step_index: int
    total_steps: int
    progress: str
    steps: List[StepInfo]
    ai_status: str


class ActivityEventOut(BaseModel):
    timestamp: datetime
    expected: str
    detected: str
    confidence: float
    status: str

    class Config:
        from_attributes = True


class AlertOut(BaseModel):
    timestamp: datetime
    level: str
    message: str

    class Config:
        from_attributes = True
