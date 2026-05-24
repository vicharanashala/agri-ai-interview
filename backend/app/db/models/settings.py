"""
Settings database model.
"""
from sqlalchemy import Column, Integer, String, Text, JSON
from datetime import datetime
from app.db.database import Base


class Settings(Base):
    """Settings model for storing application settings."""
    
    __tablename__ = "settings"
    
    id = Column(Integer, primary_key=True, index=True)
    key = Column(String(255), unique=True, index=True, nullable=False)
    value = Column(Text)
    description = Column(Text)
    category = Column(String(100), default="general")  # general, interview, evaluation, notification
    created_at = Column(String, default=datetime.utcnow().isoformat)
    updated_at = Column(String, default=datetime.utcnow().isoformat)