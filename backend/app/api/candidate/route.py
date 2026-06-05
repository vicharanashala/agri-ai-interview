"""
Candidate Phase & Milestone Sync — PATCH /api/candidate

Called by the frontend's phaseSync.ts after major milestones:
- Phase transitions (interview → summary → offer → signing → joining)
- Milestone flags (offerLetterViewed, passedAndVisitedSummary, joiningDetailsVisited)

Auth: bearer token from the candidate's Redis session.
"""
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import Optional

from app.api.candidate.session import _extract_bearer_token, _hash_token, _SESSION_KEY_PREFIX, get_redis

router = APIRouter(prefix="/api/candidate", tags=["candidate"])


# ── Phase number → DB string ──────────────────────────────────────────────────

_PHASE_MAP = {
    1: "onboarding",
    2: "interview",
    3: "summary",
    4: "offer",
    5: "signing",
    6: "joining",
}


# ── Request / Response models ─────────────────────────────────────────────────

class CandidatePatchRequest(BaseModel):
    phase: Optional[int] = None          # 1-6
    offerLetterViewed: Optional[bool] = None
    passedAndVisitedSummary: Optional[bool] = None
    joiningDetailsVisited: Optional[bool] = None


class CandidatePatchResponse(BaseModel):
    success: bool
    currentPhase: Optional[str] = None
    message: str


# ── Auth helper ───────────────────────────────────────────────────────────────

def _get_candidate_id_from_request(request: Request) -> str:
    """Extract candidate_id from the Redis session token."""
    token = _extract_bearer_token(request)
    if not token:
        raise HTTPException(status_code=401, detail="Authentication required")

    redis = get_redis()
    token_hash = _hash_token(token)

    cursor = 0
    while True:
        cursor, keys = redis.scan(cursor, match=f"{_SESSION_KEY_PREFIX}*", count=100)
        for key in keys:
            raw = redis.get(key)
            if raw:
                import json
                session = json.loads(raw)
                if session.get("token_hash") == token_hash:
                    candidate_id = session.get("candidate_id")
                    if not candidate_id:
                        raise HTTPException(status_code=401, detail="Invalid session")
                    return candidate_id
        if cursor == 0:
            break

    raise HTTPException(status_code=401, detail="Session expired or invalid")


# ── Endpoint ──────────────────────────────────────────────────────────────────

@router.patch("", response_model=CandidatePatchResponse)
async def patch_candidate(request: Request, body: CandidatePatchRequest):
    """
    Update the candidate's currentPhase and/or milestone flags in PostgreSQL.

    phase values: 1=onboarding, 2=interview, 3=summary, 4=offer, 5=signing, 6=joining
    """
    candidate_id = _get_candidate_id_from_request(request)

    # Build update dict
    updates: dict = {}
    if body.phase is not None:
        phase_str = _PHASE_MAP.get(body.phase)
        if not phase_str:
            raise HTTPException(status_code=400, detail=f"Invalid phase: {body.phase}")
        updates["currentPhase"] = phase_str

    if body.offerLetterViewed is not None:
        updates["offerLetterViewed"] = body.offerLetterViewed

    if body.passedAndVisitedSummary is not None:
        updates["passedAndVisitedSummary"] = body.passedAndVisitedSummary

    if body.joiningDetailsVisited is not None:
        updates["joiningDetailsVisited"] = body.joiningDetailsVisited

    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    # Write to PostgreSQL
    from app.db.database import get_db
    from app.db.models.candidate import Candidate

    db = next(get_db())
    try:
        cand = db.query(Candidate).filter(Candidate.id == candidate_id).first()
        if not cand:
            raise HTTPException(status_code=404, detail="Candidate not found")

        for key, value in updates.items():
            setattr(cand, key, value)

        db.commit()

        return CandidatePatchResponse(
            success=True,
            currentPhase=cand.currentPhase,
            message="Candidate updated",
        )
    finally:
        db.close()