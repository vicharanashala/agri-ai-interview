"""
Candidate interview attempts + cooldown endpoint.
"""
from fastapi import APIRouter, HTTPException, Request, Query
from app.db.mongodb import get_sync_db
from app.core.session import session_store, _hash_token
from datetime import datetime, timezone, timedelta

router = APIRouter(prefix="/api/candidate", tags=["candidate-attempts"])


def _candidate_by_email(db, email: str):
    """Return (candidate_doc, user_email) or (None, None)."""
    user = db.users.find_one({"email": email})
    if not user:
        return None, None
    candidate = db.candidates.find_one({"user_id": str(user["_id"])})
    return candidate, user.get("email")




def _token_candidate_id(request: Request) -> str | None:
    """Extract candidate_id from bearer token if valid."""
    auth = request.headers.get("authorization", "")
    token = auth[7:] if auth.startswith("Bearer ") else request.cookies.get("candidate_session")
    if not token:
        return None
    session = session_store.find_by_token_hash(_hash_token(token))
    return session.get("candidate_id") if session else None


@router.get("/attempts")
async def get_attempts(request: Request, email: str = Query(default=None)):
    """
    GET /api/candidate/attempts?email=... (fallback without session)

    Returns:
      - attempts: list of completed interview sessions (id, status, score, result, timestamps)
      - cooldownUntil: ISO timestamp if currently in cooldown, else null
      - cooldownDays: the admin-configured cooldown period
    """
    db = get_sync_db()
    candidate_id = _token_candidate_id(request)

    # Fallback: resolve by email if no valid session token
    if not candidate_id and email:
        candidate, _ = _candidate_by_email(db, email)
        if candidate:
            candidate_id = str(candidate["_id"])

    if not candidate_id:
        raise HTTPException(status_code=401, detail="Authentication required")

    candidate_role = None
    if candidate_id:
        try:
            from bson import ObjectId
            cand = db.candidates.find_one({"_id": ObjectId(candidate_id)})
        except:
            cand = db.candidates.find_one({"_id": str(candidate_id)})
        if cand:
            candidate_role = cand.get("eligible_role")

    from app.services.settings_service import get_cooldown_days
    cooldown_days = get_cooldown_days(candidate_role)

    # Get all completed sessions for this candidate
    sessions = list(db.interview_sessions.find({
        "candidate_id": candidate_id,
        "status": "completed",
    }).sort("started_at", -1))

    # Find latest failed session for cooldown computation (sessions already DESC = newest first)
    latest_failed = None
    for s in sessions:
        if s.get("result") == "FAIL":
            latest_failed = s
            break

    cooldown_until = None
    if latest_failed and latest_failed.get("completed_at"):
        failed_ms = latest_failed["completed_at"].timestamp() * 1000
        deadline_ms = failed_ms + cooldown_days * 24 * 60 * 60 * 1000
        if deadline_ms > datetime.now(timezone.utc).timestamp() * 1000:
            from datetime import timedelta  # noqa: F401
            deadline = datetime.fromtimestamp(deadline_ms / 1000, tz=timezone.utc)
            cooldown_until = deadline.isoformat() + "Z"

    attempts = [
        {
            "id": str(s["_id"]),
            "status": s.get("status"),
            "overall_score": s.get("overall_score"),
            "result": s.get("result"),
            "completedAt": s.get("completed_at").isoformat() + "Z" if s.get("completed_at") else None,
            "startedAt": s.get("started_at").isoformat() + "Z" if s.get("started_at") else None,
        }
        for s in sessions
    ]

    return {"attempts": attempts, "cooldownUntil": cooldown_until, "cooldownDays": cooldown_days}


@router.get("/session-summary")
async def get_latest_session_summary(request: Request):
    """
    GET /api/candidate/session-summary

    Returns summary data for the candidate's latest completed interview session.
    """
    from app.api.candidate.route import _get_candidate_id_with_email_fallback
    from app.api.candidate.re_evaluation import _get_id_variants
    candidate_id = _get_candidate_id_with_email_fallback(request)
    db = get_sync_db()

    cand_variants = _get_id_variants(candidate_id)
    session = db.interview_sessions.find_one(
        {"candidate_id": {"$in": cand_variants}, "status": "completed"},
        sort=[("started_at", -1)],
    )

    if not session:
        return {
            "result": None,
            "score": None,
            "end_reason": None,
            "cooldown_remaining_seconds": None,
            "interview_id": None,
        }

    candidate_role = None
    try:
        from bson import ObjectId
        cand = db.candidates.find_one({"_id": ObjectId(candidate_id)})
    except:
        cand = db.candidates.find_one({"_id": str(candidate_id)})
    if cand:
        candidate_role = cand.get("eligible_role")

    from app.services.settings_service import get_cooldown_days
    cooldown_days = get_cooldown_days(candidate_role)
    cooldown_rem = None

    if session.get("result") == "FAIL" and session.get("completed_at"):
        failed_ms = session["completed_at"].timestamp() * 1000
        deadline_ms = failed_ms + cooldown_days * 24 * 60 * 60 * 1000
        now_ms = datetime.now(timezone.utc).timestamp() * 1000
        if deadline_ms > now_ms:
            cooldown_rem = max(0, int((deadline_ms - now_ms) / 1000))

    score_val = session.get("overall_score")
    if score_val is None:
        score_val = session.get("score")

    return {
        "result": session.get("result"),
        "score": score_val,
        "end_reason": session.get("end_reason"),
        "cooldown_remaining_seconds": cooldown_rem,
        "interview_id": str(session["_id"]),
    }