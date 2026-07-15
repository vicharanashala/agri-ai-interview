"""
Interview Queue API — Simplified slot manager — MongoDB.

No queue, no positions, no wait times.
Candidates either get a slot immediately or are told to try later.
"""
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import Optional

from app.db.mongodb import get_sync_db
from app.services.queue_manager import slot_manager, MAX_CONCURRENT_INTERVIEWS

router = APIRouter(prefix="/api/interview/queue", tags=["interview-queue"])


def _fetch_candidate_data(candidate_id: str) -> dict:
    """Fetch candidate profile data from MongoDB to pass to the interview."""
    db = get_sync_db()
    cand = db.candidates.find_one({"_id": candidate_id})
    if not cand:
        return {}

    return {
        "name": cand.get("full_name") or "Candidate",
        "phone": cand.get("phone"),
        "state": cand.get("state"),
        "district": cand.get("district"),
        "current_role": cand.get("current_role"),
        "experience_years": cand.get("years_of_experience"),
        "education": cand.get("highest_education"),
        "institution": cand.get("institution"),
        "farming_background": cand.get("farming_background"),
        "crops_grown": cand.get("crops_grown"),
        "primary_expertise": cand.get("primary_expertise"),
        "candidate_id": candidate_id,
    }


# ── Request / response models ─────────────────────────────────────────────────

class SlotRequest(BaseModel):
    candidate_id: str


class StartResponse(BaseModel):
    result: str
    interview_id: Optional[str] = None
    first_question: Optional[str] = None
    message: Optional[str] = None
    active_interview_count: Optional[int] = None
    max_concurrent: Optional[int] = None
    attempts_count: Optional[int] = None
    max_attempts: Optional[int] = None
    cooldown_until: Optional[str] = None


class StatsResponse(BaseModel):
    active_interview_count: int
    max_concurrent: int
    slots_available: int


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.post("/request", response_model=StartResponse)
async def queue_request(request: SlotRequest):
    """
    Candidate requests an interview slot.

    If a slot is available (active < MAX_CONCURRENT), the interview starts
    immediately. Otherwise returns "All slots are full, please try after sometime".
    """
    candidate_data = _fetch_candidate_data(request.candidate_id)
    result = await slot_manager.start_interview(
        candidate_id=request.candidate_id,
        candidate_data=candidate_data,
    )
    return StartResponse(**result)


@router.get("/stats", response_model=StatsResponse)
async def queue_stats():
    stats = slot_manager.get_stats()
    return StatsResponse(**stats)


# ── Deprecated stubs ──────────────────────────────────────────────────────────

@router.post("/join")
async def deprecated_join(request: SlotRequest):
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