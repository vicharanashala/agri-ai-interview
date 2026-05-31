"""
Candidate database model — mirrors the Prisma schema (same SQLite file).
"""
from sqlalchemy import Column, String, Integer, DateTime, JSON, Boolean, Text
from datetime import datetime, timezone
from app.db.database import Base


def _utcnow() -> datetime:
    """Return timezone-aware UTC datetime.

    On macOS with TZ=Asia/Kolkata, datetime.utcnow() incorrectly returns
    local IST labeled as UTC. Always use this helper instead.
    """
    return datetime.now(timezone.utc)


class Candidate(Base):
    """Candidate model — mirrors frontend/prisma/schema.prisma Candidate table."""

    __tablename__ = "Candidate"  # Prisma uses singular table name

    id = Column(String, primary_key=True)          # cuid() string
    userId = Column(String, unique=True, nullable=False)  # FK to User
    fullName = Column(String, nullable=False)      # was "name" in old model
    phone = Column(String, nullable=True)
    state = Column(String, nullable=True)
    district = Column(String, nullable=True)
    pincode = Column(String, nullable=True)
    address = Column(String, nullable=True)
    currentRole = Column(String, nullable=True)
    yearsOfExperience = Column(Integer, nullable=True)
    highestEducation = Column(String, nullable=True)
    institution = Column(String, nullable=True)
    farmingBackground = Column(String, nullable=True)
    cropsGrown = Column(String, nullable=True)
    farmSize = Column(String, nullable=True)
    primaryExpertise = Column(String, nullable=True)
    # Phase tracking — stored in notes JSON on Prisma side
    # Status reflects overall candidate status
    # Maps to Prisma fields; interviewSessions/phaseHistory are relations we skip here
    createdAt = Column(DateTime, default=_utcnow)
    updatedAt = Column(DateTime, default=_utcnow, onupdate=_utcnow)


class ActiveInterviewCount(Base):
    """Singleton table — persists active_interview_count across restarts.
    Single row with id='singleton'. Always re-derived on startup.
    """
    __tablename__ = "ActiveInterviewCount"
    id = Column(String, primary_key=True)
    count = Column(Integer, default=0)
    updatedAt = Column(DateTime, default=_utcnow, onupdate=_utcnow)


class InterviewQueueEntry(Base):
    """Interview queue entry — manages FIFO queue for interview slots.
    Mirrors frontend/prisma/schema.prisma InterviewQueueEntry table.
    """

    __tablename__ = "InterviewQueueEntry"

    id = Column(String, primary_key=True)
    candidateId = Column(String, unique=True, nullable=False)
    status = Column(String, default="queued")  # queued | ready | interviewing | paused | cancelled | skipped | completed
    position = Column(Integer, nullable=True)
    scheduledAt = Column(DateTime, nullable=True)
    joinedAt = Column(DateTime, nullable=True)
    startedAt = Column(DateTime, nullable=True)
    completedAt = Column(DateTime, nullable=True)
    cancelledAt = Column(DateTime, nullable=True)
    skippedAt = Column(DateTime, nullable=True)
    cooldownUntil = Column(DateTime, nullable=True)
    skipCount = Column(Integer, default=0)
    createdAt = Column(DateTime, default=_utcnow)
    updatedAt = Column(DateTime, default=_utcnow, onupdate=_utcnow)


class InterviewStateSnapshot(Base):
    """Persisted interview state for resume functionality.
    Mirrors frontend/prisma/schema.prisma InterviewStateSnapshot table.
    """

    __tablename__ = "InterviewStateSnapshot"

    id = Column(String, primary_key=True)
    candidateId = Column(String, nullable=False)
    queueEntryId = Column(String, nullable=False)
    questionCount = Column(Integer, nullable=False)
    conversationHistory = Column(Text, nullable=False)  # JSON string
    createdAt = Column(DateTime, default=_utcnow)


class InterviewSession(Base):
    """Interview session — mirrors frontend/prisma/schema.prisma InterviewSession table."""

    __tablename__ = "InterviewSession"

    id = Column(String, primary_key=True)
    candidateId = Column(String, nullable=False)
    queueEntryId = Column(String, nullable=True)
    startedViaQueue = Column(Boolean, default=False)
    status = Column(String, default="active")
    currentPhase = Column(String, default="interview")
    interviewData = Column(String, nullable=True)  # JSON string
    startedAt = Column(DateTime, default=_utcnow)
    completedAt = Column(DateTime, nullable=True)
    createdAt = Column(DateTime, default=_utcnow)
    updatedAt = Column(DateTime, default=_utcnow, onupdate=_utcnow)