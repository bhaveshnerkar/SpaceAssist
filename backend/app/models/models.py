"""
SQLAlchemy ORM models.

Tables:
- experiments       : one row per experiment run (Demo or Camera mode)
- experiment_steps  : the 6 expected steps for that run, with their status
- activity_events   : every prediction the state machine processed
- alerts            : INFO / WARNING / ERROR messages generated during a run
"""

from datetime import datetime
from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey
from sqlalchemy.orm import relationship

from app.database.db import Base


class Experiment(Base):
    __tablename__ = "experiments"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, default="Sample Processing Experiment")
    mode = Column(String, default="DEMO")  # DEMO or CAMERA
    status = Column(String, default="NOT_STARTED")
    current_step_index = Column(Integer, default=0)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)

    steps = relationship("ExperimentStep", back_populates="experiment", cascade="all, delete-orphan")
    events = relationship("ActivityEvent", back_populates="experiment", cascade="all, delete-orphan")
    alerts = relationship("Alert", back_populates="experiment", cascade="all, delete-orphan")


class ExperimentStep(Base):
    __tablename__ = "experiment_steps"

    id = Column(Integer, primary_key=True, index=True)
    experiment_id = Column(Integer, ForeignKey("experiments.id"))
    step_index = Column(Integer)
    step_name = Column(String)
    status = Column(String, default="PENDING")  # PENDING, IN_PROGRESS, CORRECT
    completed_at = Column(DateTime, nullable=True)

    experiment = relationship("Experiment", back_populates="steps")


class ActivityEvent(Base):
    __tablename__ = "activity_events"

    id = Column(Integer, primary_key=True, index=True)
    experiment_id = Column(Integer, ForeignKey("experiments.id"))
    timestamp = Column(DateTime, default=datetime.utcnow)
    expected = Column(String)
    expected_step = Column(String, nullable=True)
    detected = Column(String)
    confidence = Column(Float)
    status = Column(String)  # CORRECT, SEQUENCE_ERROR, LOW_CONFIDENCE, UNKNOWN_ACTION, PENDING, COMPLETED

    experiment = relationship("Experiment", back_populates="events")


class Alert(Base):
    __tablename__ = "alerts"

    id = Column(Integer, primary_key=True, index=True)
    experiment_id = Column(Integer, ForeignKey("experiments.id"))
    timestamp = Column(DateTime, default=datetime.utcnow)
    level = Column(String)  # INFO, WARNING, ERROR
    message = Column(String)

    experiment = relationship("Experiment", back_populates="alerts")
