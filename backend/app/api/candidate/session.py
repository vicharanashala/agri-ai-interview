"""
Candidate Redis Session Management — single-session-per-account.

POST /api/candidate/session  — create Redis session (called by frontend after NextAuth login)
POST /api/candidate/session/logout — destroy Redis session
GET  /api/candidate/session/verify — validate token
"""
from fastapi import APIRouter, HTTPException, Response, Request
from pydantic import BaseModel
from typing import Optional
from sqlalchemy import text
import secrets
import json
import hashlib

# ── Redis ─────────────────────────────────────────────────────────────────────

def get_redis():
    from app.core.redis import get_redis_client
    return get_redis_client()

# ── Constants ─────────────────────────────────────────────────────────────────

router = APIRouter(prefix="/api/candidate", tags=["candidate-session"])
_SESSION_TTL = 30 * 24 * 60 * 60  # 30 days
_SESSION_KEY_PREFIX = "candidate:session:"

# ── Helpers ───────────────────────────────────────────────────────────────────

def _make_token() -> str:
    return secrets.token_urlsafe(48)


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _session_key(candidate_id: str) -> str:
    return f"{_SESSION_KEY_PREFIX}{candidate_id}"


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
    Verifies candidate_id + email match in DB, then creates Redis session.

    Single-session enforcement: any previous session for this candidate
    is deleted before the new one is stored.
    """
    body = await request.json()
    candidate_id = body.get("candidate_id")
    email = body.get("email")

    if not candidate_id or not email:
        raise HTTPException(status_code=400, detail="candidate_id and email required")

    # Verify candidate exists and email matches in DB
    from app.db.database import get_db
    db = next(get_db())
    try:
        row = db.execute(
            text("""
                SELECT c.id, u.id as user_id, u.email
                FROM "Candidate" c
                JOIN "User" u ON u.id = c."userId"
                WHERE c.id = :candidate_id AND u.email = :email
            """),
            {"candidate_id": candidate_id, "email": email}
        ).fetchone()

        if not row:
            raise HTTPException(status_code=401, detail="Invalid session establishment")

        # Row is a plain tuple; access by index: (id=0, user_id=1, email=2)
        user_id = row[1]
    finally:
        db.close()

    redis = get_redis()

    # Single-session: delete old session if exists
    old_key = _session_key(candidate_id)
    redis.delete(old_key)

    # Create new session
    token = _make_token()
    token_hash = _hash_token(token)
    session_data = {
        "token_hash": token_hash,
        "user_id": user_id,
        "candidate_id": candidate_id,
    }
    redis.setex(old_key, _SESSION_TTL, json.dumps(session_data))
    print(f"[SESSION DEBUG] Created session: key={old_key} | token_hash(first 8)={token_hash[:8]}... | candidate_id={candidate_id}")

    # Fallback httpOnly cookie (same-origin)
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
    """Delete the current candidate's session from Redis."""
    token = _extract_bearer_token(request)
    if not token:
        return {"success": True, "message": "No session to clear"}

    redis = get_redis()
    token_hash = _hash_token(token)
    cursor = 0

    while True:
        cursor, keys = redis.scan(cursor, match=f"{_SESSION_KEY_PREFIX}*", count=100)
        for key in keys:
            raw = redis.get(key)
            if raw:
                session = json.loads(raw)
                if session.get("token_hash") == token_hash:
                    redis.delete(key)
                    break
        if cursor == 0:
            break

    response.set_cookie(key="candidate_session", value="", path="/", max_age=0)
    return {"success": True, "message": "Logged out"}


@router.get("/session/verify")
async def verify_session(request: Request):
    """Verify the session token is active. Returns session info or 401."""
    token = _extract_bearer_token(request)
    if not token:
        raise HTTPException(status_code=401, detail="No session token")

    redis = get_redis()
    token_hash = _hash_token(token)
    cursor = 0

    while True:
        cursor, keys = redis.scan(cursor, match=f"{_SESSION_KEY_PREFIX}*", count=100)
        for key in keys:
            raw = redis.get(key)
            if raw:
                session = json.loads(raw)
                if session.get("token_hash") == token_hash:
                    return {
                        "valid": True,
                        "candidate_id": session["candidate_id"],
                        "user_id": session["user_id"],
                    }
        if cursor == 0:
            break

    raise HTTPException(status_code=401, detail="Session expired or invalid")