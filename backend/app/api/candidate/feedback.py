"""
Candidate Feedback Endpoints — MongoDB.

POST /api/candidate/feedback  — Submit platform feedback (one submission per candidate)
GET  /api/candidate/feedback  — Check whether the candidate has already submitted feedback
"""
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field, field_validator
from typing import Optional
from datetime import datetime, timezone
from bson import ObjectId
from pymongo.errors import DuplicateKeyError

from app.core.session import get_session_store, _hash_token
from app.core.candidate_status import (
    STATE_DELETED,
    account_deactivated_exception,
    ensure_candidate_id_not_deleted,
    resolve_candidate_account,
)
from app.db.mongodb import get_sync_db
from app.api.admin.candidates import _get_id_variants, _format_iso

router = APIRouter(prefix="/api/candidate", tags=["candidate-feedback"])

MAX_TEXT_LENGTH = 2000

_NOT_DELETED = {"isdeleted": {"$ne": True}, "is_deleted": {"$ne": True}}


def _get_existing_candidate(request: Request) -> dict:
    """
    Resolve the authenticated candidate without ever creating a record.

    Uses the candidate session token first, then the X-User-Email header set by
    the Next.js proxy from the NextAuth session. Raises 401 if neither resolves
    to an existing, non-deleted candidate.
    """
    db = get_sync_db()

    auth = request.headers.get("authorization", "")
    token = auth[7:] if auth.startswith("Bearer ") else request.cookies.get("candidate_session")
    if token:
        try:
            session = get_session_store().find_by_token_hash(_hash_token(token))
        except Exception:
            session = None
        candidate_id = session.get("candidate_id") if session else None
        if candidate_id:
            ensure_candidate_id_not_deleted(db, candidate_id)
            candidate = db.candidates.find_one({"_id": {"$in": _get_id_variants(str(candidate_id))}, **_NOT_DELETED})
            if candidate:
                return candidate

    email = (request.headers.get("x-user-email") or "").lower().strip()
    if email:
        user = db.users.find_one({"email": email})
        if user:
            state, candidate = resolve_candidate_account(db, user=user, email=email)
            if state == STATE_DELETED:
                raise account_deactivated_exception()
            if candidate:
                return candidate

    raise HTTPException(status_code=401, detail="Authentication required")


class FeedbackPayload(BaseModel):
    overall_rating: int = Field(..., ge=1, le=5)
    additional_comments: Optional[str] = Field(None, max_length=MAX_TEXT_LENGTH)

    @field_validator("additional_comments")
    @classmethod
    def _strip_text(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        v = v.strip()
        return v or None


def _already_submitted_response(existing: dict) -> dict:
    return {
        "success": True,
        "already_submitted": True,
        "message": "You have already submitted your feedback. Thank you!",
        "submittedAt": _format_iso(existing.get("submitted_at")),
    }


@router.get("/feedback")
async def get_feedback_status(request: Request):
    candidate = _get_existing_candidate(request)
    db = get_sync_db()

    existing = db.candidate_feedback.find_one({"candidate_id": str(candidate["_id"])})
    if not existing:
        return {"submitted": False}

    return {
        "submitted": True,
        "submittedAt": _format_iso(existing.get("submitted_at")),
    }


@router.post("/feedback")
async def submit_feedback(payload: FeedbackPayload, request: Request):
    candidate = _get_existing_candidate(request)
    candidate_id = str(candidate["_id"])
    db = get_sync_db()

    existing = db.candidate_feedback.find_one({"candidate_id": candidate_id})
    if existing:
        return _already_submitted_response(existing)

    now = datetime.now(timezone.utc)
    doc = {
        "_id": str(ObjectId()),
        "candidate_id": candidate_id,
        "overall_rating": payload.overall_rating,
        "additional_comments": payload.additional_comments,
        "candidate_phase": candidate.get("current_phase"),
        "submitted_at": now,
    }
    try:
        db.candidate_feedback.insert_one(doc)
    except DuplicateKeyError:
        # Concurrent submission won the race on the unique candidate_id index
        existing = db.candidate_feedback.find_one({"candidate_id": candidate_id}) or {}
        return _already_submitted_response(existing)

    return {
        "success": True,
        "message": "Thank you for your feedback!",
        "submittedAt": _format_iso(now),
    }
