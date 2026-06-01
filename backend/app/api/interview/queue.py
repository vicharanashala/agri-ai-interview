"""
Interview Queue API — Simplified slot manager.

No queue, no positions, no wait times.
Candidates either get a slot immediately or are told to try later.
"""

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import Optional

from sqlalchemy.orm import Session
from app.db.database import get_db
from app.db.models.candidate import Candidate
from app.services.queue_manager import slot_manager, MAX_CONCURRENT_INTERVIEWS


def _fetch_candidate_data(candidate_id: str, db: Session) -> dict:
    """
    Fetch candidate profile data from PostgreSQL to pass to the interview.
    This ensures the LLM has candidate context (name, farming background, etc.).
    """
    cand = db.query(Candidate).filter(Candidate.id == candidate_id).first()
    if not cand:
        return {}

    return {
        "name": cand.fullName or "Candidate",
        "phone": cand.phone,
        "state": cand.state,
        "district": cand.district,
        "current_role": cand.currentRole,
        "experience_years": cand.yearsOfExperience,
        "education": cand.highestEducation,
        "institution": cand.institution,
        "farming_background": cand.farmingBackground,
        "crops_grown": cand.cropsGrown,
        "farm_size": cand.farmSize,
        "primary_expertise": cand.primaryExpertise,
        "candidate_id": candidate_id,
    }

router = APIRouter(prefix="/api/interview/queue", tags=["interview-queue"])


# ---------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------

class SlotRequest(BaseModel):
    candidate_id: str


class StartResponse(BaseModel):
    result: str           # started | no_slot | already_active
    interview_id: Optional[str] = None
    first_question: Optional[str] = None
    message: Optional[str] = None
    active_interview_count: Optional[int] = None
    max_concurrent: Optional[int] = None


class StatsResponse(BaseModel):
    active_interview_count: int
    max_concurrent: int
    slots_available: int


# ---------------------------------------------------------------------------
# POST /api/interview/queue/request  — request a slot and start interview
# ---------------------------------------------------------------------------

@router.post("/request", response_model=StartResponse)
async def queue_request(request: SlotRequest, db: Session = Depends(get_db)):
    """
    Candidate requests an interview slot.

    If a slot is available (active < MAX_CONCURRENT), the interview starts
    immediately. Otherwise returns "All slots are full, please try after sometime".
    """
    candidate_data = _fetch_candidate_data(request.candidate_id, db)
    result = await slot_manager.start_interview(
        candidate_id=request.candidate_id,
        candidate_data=candidate_data,
    )
    return StartResponse(**result)


# ---------------------------------------------------------------------------
# GET /api/interview/queue/stats — current slot usage
# ---------------------------------------------------------------------------

@router.get("/stats", response_model=StatsResponse)
async def queue_stats():
    """
    Current interview slot usage.
    """
    stats = slot_manager.get_stats()
    return StatsResponse(**stats)


# ---------------------------------------------------------------------------
# DEPRECATED — kept as stubs that return "not supported" for backwards compat
# ---------------------------------------------------------------------------

class NotSupportedResponse(BaseModel):
    result: str
    message: str


@router.post("/join")
async def deprecated_join(request: SlotRequest):
    """Queue system removed — interviews start directly via /request."""
    return {"result": "not_supported", "message": "No queue. Use POST /api/interview/queue/request to start an interview."}


@router.get("/status/{candidate_id}")
async def deprecated_status(candidate_id: str):
    return {"result": "not_supported", "message": "Queue status no longer tracked separately."}


@router.delete("/cancel")
async def deprecated_cancel(request: SlotRequest):
    return {"result": "not_supported", "message": "Use POST /api/interview/end instead."}


@router.post("/skip/{candidate_id}")
async def deprecated_skip(candidate_id: str):
    return {"result": "not_supported", "message": "No queue — skip not applicable."}


@router.get("/wait-time/{candidate_id}")
async def deprecated_wait_time(candidate_id: str):
    return {"result": "not_supported", "message": "No queue — no wait times."}