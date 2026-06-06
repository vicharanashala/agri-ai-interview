"""
Candidate database model — mirrors the Prisma schema (same PostgreSQL database).
"""
from sqlalchemy import Column, String, Integer, DateTime, JSON, Boolean, Text, Float
from datetime import datetime, timezone
from app.db.database import Base


def _utcnow() -> datetime:
    """Return timezone-aware UTC datetime.

    On macOS with TZ=Asia/Kolkata, datetime.utcnow() incorrectly returns
    local IST labeled as UTC. Always use this helper instead.
    """
    return datetime.now(timezone.utc)


class User(Base):
    """User model — mirrors frontend/prisma/schema.prisma User table."""

    __tablename__ = "User"

    id = Column(String, primary_key=True)
    name = Column(String, nullable=True)
    email = Column(String, unique=True, nullable=True)
    emailVerified = Column(DateTime, nullable=True)
    image = Column(String, nullable=True)
    password = Column(String, nullable=True)
    createdAt = Column(DateTime, default=_utcnow)
    updatedAt = Column(DateTime, default=_utcnow, onupdate=_utcnow)


class Candidate(Base):
    """Candidate model — mirrors frontend/prisma/schema.prisma Candidate table."""

    __tablename__ = "Candidate"  # Prisma uses singular table name

    id = Column(String, primary_key=True)          # cuid() string
    userId = Column(String, unique=True, nullable=False)  # FK to User
    fullName = Column(String, nullable=True)
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
    # Phase tracking
    currentPhase = Column(String, default="onboarding")  # onboarding | interview | summary | offer | signing | joining
    # Flags that unlock pipeline phases — persisted so they survive logout/login
    offerLetterViewed = Column(Boolean, default=False)
    passedAndVisitedSummary = Column(Boolean, default=False)
    joiningDetailsVisited = Column(Boolean, default=False)
    documentsSubmitted = Column(Boolean, default=False)

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
    candidateId = Column(String, nullable=True)
    queueEntryId = Column(String, nullable=True)
    startedViaQueue = Column(Boolean, default=False)
    status = Column(String, default="active")
    result = Column(String, nullable=True)  # PASS | FAIL
    endReason = Column(String, nullable=True)  # anti_cheat | withdrawn | question_limit | time_limit
    score = Column(Float, nullable=True)  # 0–100 from LLM evaluation
    currentPhase = Column(String, default="interview")
    interviewData = Column(String, nullable=True)  # JSON string
    startedAt = Column(DateTime, default=_utcnow)
    completedAt = Column(DateTime, nullable=True)
    createdAt = Column(DateTime, default=_utcnow)
    updatedAt = Column(DateTime, default=_utcnow, onupdate=_utcnow)


class AntiCheatEvent(Base):
    """Anti-cheat event — mirrors frontend/prisma/schema.prisma AntiCheatEvent table."""

    __tablename__ = "AntiCheatEvent"

    id = Column(String, primary_key=True)
    candidateId = Column(String, nullable=False)
    interviewId = Column(String, nullable=True)
    eventType = Column(String, nullable=False)  # DB col: eventType (Prisma naming)
    severity = Column(String, default="warning")
    message = Column(String, nullable=True)
    event_metadata = Column("metadata", String, nullable=True)  # DB col: metadata (name event_metadata avoids SQLAlchemy reserved word)
    createdAt = Column(DateTime, default=_utcnow)


class Resume(Base):
    """Resume model — mirrors frontend/prisma/schema.prisma Resume table."""

    __tablename__ = "Resume"

    id = Column(String, primary_key=True)
    candidateId = Column(String, nullable=False)
    fileName = Column(String, nullable=False)
    fileType = Column(String, nullable=False)
    rawText = Column(Text, nullable=True)
    parsedData = Column(Text, nullable=True)  # JSON string — structured parsed output
    status = Column(String, default="pending")  # pending | uploaded | parsed | failed
    # Fields extracted from parsedData for direct Python access
    # (parsedData is a JSON string; these columns are updated alongside it)
    skills = Column(Text, nullable=True)       # JSON list string — normalised skills
    summary = Column(Text, nullable=True)      # 2-3 sentence profile summary
    createdAt = Column(DateTime, default=_utcnow)
    updatedAt = Column(DateTime, default=_utcnow, onupdate=_utcnow)


class SignedOfferLetter(Base):
    """Signed offer letter — mirrors frontend/prisma/schema.prisma SignedOfferLetter table."""

    __tablename__ = "signed_offer_letters"

    id = Column(String, primary_key=True)
    candidateId = Column(String, unique=True, nullable=False)
    pdfData = Column(Text, nullable=False)     # Base64-encoded PDF bytes
    signatureName = Column(String, nullable=False)
    signedAt = Column(DateTime, nullable=False, default=_utcnow)
    createdAt = Column(DateTime, default=_utcnow)


class CandidateDocument(Base):
    """Candidate document — mirrors frontend/prisma/schema.prisma CandidateDocument table."""

    __tablename__ = "CandidateDocument"

    id = Column(String, primary_key=True)
    candidateId = Column(String, nullable=False)
    fieldName = Column(String, nullable=False)  # field key from DOCUMENT_FIELDS
    fileIndex = Column(Integer, nullable=False, default=1)  # multiple files per field
    fileName = Column(String, nullable=False)
    fileType = Column(String, nullable=False)   # 'pdf' | 'docx' | 'doc'
    fileData = Column(Text, nullable=False)     # Base64-encoded file bytes
    createdAt = Column(DateTime, default=_utcnow)
    updatedAt = Column(DateTime, default=_utcnow, onupdate=_utcnow)