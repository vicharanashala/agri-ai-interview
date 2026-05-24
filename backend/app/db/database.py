"""
Database configuration and session management.
"""
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import os

# Use Prisma's dev.db directly so onboarding data is immediately visible to admin
import pathlib
_frontend_root = pathlib.Path(__file__).parent.parent.parent.parent
DATABASE_URL = f"sqlite:///{_frontend_root}/frontend/prisma/dev.db"

# Handle SQLite URL format
if DATABASE_URL.startswith("sqlite"):
    connect_args = {"check_same_thread": False}
    engine = create_engine(DATABASE_URL, connect_args=connect_args)
else:
    engine = create_engine(DATABASE_URL)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    """Get database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """Initialize database tables."""
    from app.db.models import candidate, settings
    Base.metadata.create_all(bind=engine)
