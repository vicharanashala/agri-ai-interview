"""
Foundation Course completion verification — ViBe LMS integration.

GET /api/candidate/foundation-course/completion-check
  → Short-circuits with { completed: true, alreadyVerified: true } if DB already
    has foundation_course_completed=True (avoids unnecessary ViBe API call).
  → Otherwise calls ViBe and compares the candidate's email against the
    completion list.
  → Marks foundation_course_completed=True in DB on first successful verification.
  → Never marks incomplete or overwrites an existing completion on ViBe errors.
"""
from fastapi import APIRouter, HTTPException, Request

from app.services.vibe_client import get_course_completions, is_email_in_completions
from app.core.session import get_session_store, _hash_token
from bson import ObjectId

router = APIRouter(prefix="/api/candidate", tags=["candidate"])


def _get_candidate_id_from_request(request: Request) -> str:
    """Extract and validate candidate session token."""
    auth = request.headers.get("authorization", "")
    token = auth[7:] if auth.startswith("Bearer ") else request.cookies.get("candidate_session")
    if not token:
        raise HTTPException(status_code=401, detail="Authentication required")

    store = get_session_store()
    session = store.find_by_token_hash(_hash_token(token))
    if not session:
        raise HTTPException(status_code=401, detail="Session expired or invalid")

    candidate_id = session.get("candidate_id")
    if not candidate_id:
        raise HTTPException(status_code=401, detail="Invalid session")
    return candidate_id


def _get_candidate_email_from_db(candidate_id: str) -> str:
    """Fetch candidate email from MongoDB via their user_id."""
    from app.db.mongodb import get_sync_db
    db = get_sync_db()
    cand = db.candidates.find_one({"_id": ObjectId(candidate_id)}, {"user_id": 1})
    if not cand:
        raise HTTPException(status_code=404, detail="Candidate not found")
    user = db.users.find_one({"_id": ObjectId(cand["user_id"])}, {"email": 1})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user["email"]


def _mark_completed(candidate_id: str) -> None:
    """Persist foundation_course_completed=True in the DB."""
    from datetime import datetime, timezone
    from app.db.mongodb import get_sync_db
    db = get_sync_db()
    db.candidates.update_one(
        {"_id": ObjectId(candidate_id)},
        {"$set": {
            "foundation_course_completed": True,
            "foundation_course_status": "completed",
            "updated_at": datetime.now(timezone.utc)
        }},
    )


@router.get("/foundation-course/completion-check")
async def check_foundation_course_completion(request: Request):
    """
    Verify if the authenticated candidate has completed the Foundation Course.

    Flow:
    1. Extract candidate from session token.
    2. If DB already has foundation_course_completed=True → return immediately
       (no ViBe call needed).
    3. Otherwise call ViBe and check if the candidate's email is in the list.
    4. If found → persist to DB and return completed.
    5. If ViBe is unreachable → return 200 with completed=false but NOT persist
       anything (existing completion state is preserved).
    """
    candidate_id = _get_candidate_id_from_request(request)

    # ── Step 1: short-circuit if already verified in our DB ──────────────────
    from app.db.mongodb import get_sync_db
    db = get_sync_db()
    cand = db.candidates.find_one({"_id": ObjectId(candidate_id)}, {"foundation_course_completed": 1})
    if cand and cand.get("foundation_course_completed") is True:
        return {"completed": True, "alreadyVerified": True}

    # ── Step 2: call ViBe ────────────────────────────────────────────────────
    candidate_email = _get_candidate_email_from_db(candidate_id)

    try:
        completions = await get_course_completions()
    except Exception:
        # ViBe is down or returned an unexpected response.
        # Do NOT mark incomplete; preserve whatever state exists in the DB.
        return {"completed": False, "vibeError": True}

    # ── Step 3: check if candidate is in the completion list ────────────────
    completed = is_email_in_completions(candidate_email, completions)

    if completed:
        _mark_completed(candidate_id)

    return {"completed": completed}


@router.post("/foundation-course/launch")
async def launch_foundation_course(request: Request):
    """Notify backend that candidate has clicked Launch Course."""
    candidate_id = _get_candidate_id_from_request(request)
    from app.db.mongodb import get_sync_db
    from datetime import datetime, timezone
    db = get_sync_db()
    
    # Only update status to in_progress if course is not already completed
    cand = db.candidates.find_one({"_id": ObjectId(candidate_id)}, {"foundation_course_completed": 1, "foundation_course_status": 1})
    if cand:
        is_completed = cand.get("foundation_course_completed", False)
        current_status = cand.get("foundation_course_status")
        
        if not is_completed and current_status != "completed" and current_status != "in_progress":
            db.candidates.update_one(
                {"_id": ObjectId(candidate_id)},
                {"$set": {
                    "foundation_course_status": "in_progress",
                    "updated_at": datetime.now(timezone.utc)
                }}
            )
            
    return {"success": True}