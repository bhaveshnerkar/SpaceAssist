"""
Database configuration for SpaceAssist AI.

Uses SQLite (file-based, no external DB server needed) so the
prototype runs out of the box on a laptop with zero extra setup.
The .db file is created under the project's /data folder.
"""

import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

# backend/app/database/db.py -> go up 3 levels to reach backend/, then up once more to project root
BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
PROJECT_ROOT = os.path.dirname(BACKEND_DIR)
DATA_DIR = os.path.join(PROJECT_ROOT, "data")
os.makedirs(DATA_DIR, exist_ok=True)

DATABASE_URL = f"sqlite:///{os.path.join(DATA_DIR, 'spaceassist.db')}"

# check_same_thread=False is required because FastAPI can serve
# a single SQLite connection from different worker threads.
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    """FastAPI dependency that yields a DB session and always closes it."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
