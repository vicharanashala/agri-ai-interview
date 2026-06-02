"""
Settings Service — reads LLM guidelines from the DB, with fallback to defaults.

Allows the admin dashboard to update guidelines that are actually used by the
interview workflow and LLM evaluation.
"""
from typing import Optional
from sqlalchemy.orm import Session
from app.db.database import SessionLocal
from app.db.models.settings import Settings


# -------------------------------------------------------------------
# Interview configuration defaults
# -------------------------------------------------------------------
DEFAULT_MAX_QUESTIONS = 10


# -------------------------------------------------------------------
# Default guideline content (must match backend/app/api/admin/settings.py)
# -------------------------------------------------------------------
DEFAULT_GUIDELINES = {
    "question_guidelines": """# Question Generation Guidelines

## Core Principles
1. Ask one question at a time
2. Start with basic questions and gradually increase complexity
3. Use clear, simple language
4. Focus on practical agricultural knowledge

## Question Types
- Technical: Farming techniques, crop management, soil health
- Practical: Real-world scenarios and problem-solving
- Behavioral: Past experiences and decision-making
- Situational: How they would handle specific situations

## Guidelines
- Avoid leading questions
- Allow candidates to explain their answers
- Provide hints when struggling
- Maintain professional tone""",

    "evaluation_system": """# Evaluation System Guidelines

## Scoring Criteria
1. Technical Knowledge (Weight: 30%)
   - Understanding of farming practices
   - Knowledge of modern agricultural techniques

2. Problem-Solving (Weight: 25%)
   - Analytical thinking
   - Decision-making abilities

3. Communication (Weight: 20%)
   - Clarity of expression
   - Listening skills

4. Experience Relevance (Weight: 15%)
   - Practical experience
   - Achievement history

5. Cultural Fit (Weight: 10%)
   - Teamwork potential
   - Adaptability""",

    "interview_system": """# Interview System Prompt

You are an AI interviewer for Annam, a company focused on agricultural development.
Your role is to conduct professional interviews with candidates.

## Your Responsibilities
1. Welcome candidates warmly
2. Explain the interview process
3. Ask relevant questions based on candidate profile
4. Take notes on responses
5. Provide feedback at the end

## Tone and Approach
- Professional yet friendly
- Patient and understanding
- Fair and unbiased
- Focused on candidate growth""",

    "faq_system": """# FAQ Assistant Guidelines

## Purpose
Answer candidate questions about the company, role, and process.

## Response Guidelines
1. Be informative but concise
2. Stick to verified information
3. Escalate to human support when needed
4. Maintain confidentiality

## Common Topics
- Company background and mission
- Role responsibilities
- Interview process
- Next steps after interview
- Benefits and culture""",
}


def _get_db():
    """Get a bare DB session (no FastAPI Depends, so usable anywhere)."""
    db = SessionLocal()
    try:
        return db
    except Exception:
        db.close()
        raise


def get_guideline(key: str) -> str:
    """
    Load a single guideline from the DB, falling back to the default if
    not found or if the DB is unavailable.
    """
    default = DEFAULT_GUIDELINES.get(key, "")

    try:
        db = _get_db()
        try:
            setting: Optional[Settings] = db.query(Settings).filter(Settings.key == key).first()
            if setting and setting.value:
                return setting.value
        finally:
            db.close()
    except Exception:
        # DB not available — use default
        pass

    return default


def get_all_guidelines() -> dict:
    """Load all guidelines from DB (or defaults if not set)."""
    return {key: get_guideline(key) for key in DEFAULT_GUIDELINES}


# Convenience helpers so callers don't have to import DEFAULT_GUIDELINES
def get_question_guidelines() -> str:
    return get_guideline("question_guidelines")


def get_evaluation_system() -> str:
    return get_guideline("evaluation_system")


def get_interview_system() -> str:
    return get_guideline("interview_system")


def get_faq_system() -> str:
    return get_guideline("faq_system")


# -------------------------------------------------------------------
# Interview configuration
# -------------------------------------------------------------------
def get_interview_settings() -> dict:
    """
    Load interview configuration from the DB, falling back to defaults.
    Returns {"max_questions": int}.
    """
    try:
        db = _get_db()
        try:
            setting: Optional[Settings] = db.query(Settings).filter(
                Settings.key == "interview_max_questions"
            ).first()
            if setting and setting.value:
                return {"max_questions": int(setting.value)}
        finally:
            db.close()
    except Exception:
        pass

    return {"max_questions": DEFAULT_MAX_QUESTIONS}