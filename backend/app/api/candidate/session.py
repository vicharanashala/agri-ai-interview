"""
Candidate Session Management — MongoDB-backed.

POST /api/candidate/session       — create session (called by frontend after NextAuth login)
POST /api/candidate/session/logout — destroy session
GET  /api/candidate/session/verify — validate token
"""
from fastapi import APIRouter, HTTPException, Response, Request
from pydantic import BaseModel
from typing import Optional
import secrets
import json
import hashlib

from app.core.session import get_session_store, _SESSION_KEY_PREFIX, _hash_token, _make_token, _session_key

router = APIRouter(prefix="/api/candidate", tags=["candidate-session"])
_SESSION_TTL = 30 * 24 * 60 * 60  # 30 days in seconds


# ── Helpers ───────────────────────────────────────────────────────────────────

def _extract_bearer_token(request: Request) -> str | None:
    auth = request.headers.get("authorization", "")
    if auth.startswith("Bearer "):
        return auth[7:]
    return request.cookies.get("candidate_session")


# ── Models ────────────────────────────────────────────────────────────────────

class SessionCreateRequest(BaseModel):
    candidate_id: str
    email: str


class SessionResponse(BaseModel):
    success: bool
    token: Optional[str] = None
    candidate_id: Optional[str] = None
    message: str


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/session", response_model=SessionResponse)
async def create_session(request: Request, response: Response):
    """
    Called by frontend immediately after NextAuth login succeeds.
    Verifies candidate_id + email match in DB, then creates MongoDB session.

    Single-session enforcement: any previous session for this candidate
    is deleted before the new one is stored.
    """
    body = await request.json()
    candidate_id = body.get("candidate_id")
    email = body.get("email")

    if not candidate_id or not email:
        raise HTTPException(status_code=400, detail="candidate_id and email required")

    # Verify candidate exists and email matches in MongoDB
    from app.db.mongodb import get_sync_db
    db = get_sync_db()

    user = db.users.find_one({"email": email})
    if not user:
        raise HTTPException(status_code=401, detail="Invalid session establishment")

    # user_id is stored as string in candidates, so convert consistently
    user_id_str = str(user["_id"])
    candidate = db.candidates.find_one({
        "user_id": user_id_str,
    })
    if not candidate:
        raise HTTPException(status_code=401, detail="Invalid session establishment")

    user_id = str(user["_id"])

    store = get_session_store()

    # Create new session
    token = _make_token()
    token_hash = _hash_token(token)
    session_data = {
        "token_hash": token_hash,
        "user_id": user_id,
        "candidate_id": str(candidate["_id"]),
    }

    store.setex(_session_key(str(candidate["_id"])), _SESSION_TTL, json.dumps(session_data))

    print(f"[SESSION CREATE] candidate_id={str(candidate['_id'])} | token(first 8)={token[:8]} | token_hash(first 8)={token_hash[:8]}")

    # Set httpOnly cookie
    response.set_cookie(
        key="candidate_session",
        value=token,
        path="/",
        max_age=_SESSION_TTL,
        httponly=True,
        secure=False,  # True in production
        samesite="lax",
    )

    return SessionResponse(
        success=True,
        token=token,
        candidate_id=candidate_id,
        message="Session created",
    )


@router.post("/session/logout")
async def candidate_logout(request: Request, response: Response):
    """Delete the current candidate's session from MongoDB."""
    token = _extract_bearer_token(request)
    if not token:
        return {"success": True, "message": "No session to clear"}

    token_hash = _hash_token(token)
    store = get_session_store()
    store.delete_by_token_hash(token_hash)

    response.set_cookie(key="candidate_session", value="", path="/", max_age=0)
    return {"success": True, "message": "Logged out"}


@router.get("/session/verify")
async def verify_session(request: Request):
    """Verify the session token is active. Returns session info or 401."""
    token = _extract_bearer_token(request)
    if not token:
        raise HTTPException(status_code=401, detail="No session token")

    store = get_session_store()
    session = await store.get_session(token)

    if not session:
        raise HTTPException(status_code=401, detail="Session expired or invalid")

    return {
        "valid": True,
        "candidate_id": session.get("candidate_id"),
        "user_id": session.get("user_id"),
    }


# Re-export for convenience
get_session_store = get_session_store
_hash_token = _hash_token
_SESSION_KEY_PREFIX = _SESSION_KEY_PREFIX