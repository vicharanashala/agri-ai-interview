"""
Candidate session middleware — validates bearer tokens against MongoDB sessions.
"""
from fastapi import HTTPException, Request, Depends
import hashlib

from app.core.session import get_session_store, _hash_token

# ── Public paths ───────────────────────────────────────────────────────────────

_PUBLIC_PATHS = frozenset([
    "/",
    "/health",
    "/api/auth/login",
    "/api/auth/verify",
    "/api/auth/logout",
    "/api/auth/logout-all",
    "/api/auth/register",
    "/api/faq/all",
    "/api/faq/answer",
])


def _is_protected_path(path: str) -> bool:
    """True if the path needs candidate auth."""
    if path in _PUBLIC_PATHS:
        return False
    if path.startswith("/api/auth/"):
        return False
    if path.startswith("/api/admin/"):
        return False
    if path.startswith("/api/faq/"):
        return False
    return True


# ── Token helpers ──────────────────────────────────────────────────────────────

def _extract_token(request: Request) -> str | None:
    """Extract bearer token from Authorization header or candidate_session cookie."""
    auth = request.headers.get("authorization", "")
    if auth.startswith("Bearer "):
        return auth[7:]
    return request.cookies.get("candidate_session")


# ── Core validation ───────────────────────────────────────────────────────────

async def _validate_token(token: str) -> dict | None:
    """
    Check token against MongoDB. Returns session dict if found, None if not.
    """
    store = get_session_store()
    return await store.get_session(token)


# ── FastAPI dependency ─────────────────────────────────────────────────────────

async def get_candidate_session(request: Request) -> dict:
    """
    FastAPI dependency — validates candidate session.

    Skips validation for public paths.
    Returns session dict: {"candidate_id": "...", "user_id": "..."}

    Raises HTTPException(401) if session is invalid or missing on protected paths.
    """
    path = request.url.path

    if not _is_protected_path(path):
        return {"valid": True, "candidate_id": None, "user_id": None}

    token = _extract_token(request)
    if not token:
        raise HTTPException(
            status_code=401,
            detail="Session required — please log in",
        )

    session = await _validate_token(token)
    if not session:
        raise HTTPException(
            status_code=401,
            detail="Session expired — please log in again",
        )

    return session