"""
Candidate database model — mirrors the Prisma schema (same SQLite file).
"""
from sqlalchemy import Column, String, Integer, DateTime, JSON
from datetime import datetime
from app.db.database import Base


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
    createdAt = Column(DateTime, default=datetime.utcnow)
    updatedAt = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)