"""
Candidate session middleware — validates bearer tokens against Redis.

Usage at router level (all routes in router are protected):
    from app.middleware.candidate_auth import get_candidate_session
    router = APIRouter(dependencies=[Depends(get_candidate_session)])

Usage per-route:
    from app.middleware.candidate_auth import get_candidate_session
    @router.post("/thing", dependencies=[Depends(get_candidate_session)])

Public paths (skipped automatically):
    GET  /api/auth/login          — creates session
    POST /api/auth/verify         — checks session
    POST /api/auth/logout         — destroys session
    GET  /api/faq/all             — public FAQ
    POST /api/faq/answer          — public FAQ
    /api/auth/register            — registration
    /api/auth/[...nextauth]       — NextAuth handlers
    /api/admin/*                  — admin auth (separate system)
    /health                       — health check
"""
from fastapi import HTTPException, Request, Depends
from fastapi.security import HTTPBearer
import json
import hashlib

from app.core.redis import get_redis_client

_SESSION_KEY_PREFIX = "candidate:session:"

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
    if path.startswith("/api/auth/"):  # NextAuth + our auth endpoints
        return False
    if path.startswith("/api/admin/"):  # admin uses separate auth
        return False
    if path.startswith("/api/faq/"):  # FAQ is public
        return False
    return True


# ── Token helpers ──────────────────────────────────────────────────────────────

def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _extract_token(request: Request) -> str | None:
    """Extract bearer token from Authorization header or candidate_session cookie."""
    auth = request.headers.get("authorization", "")
    if auth.startswith("Bearer "):
        token = auth[7:]
        print(f"[AUTH DEBUG] Path={request.url.path} | Auth header found (first 8 chars): {token[:8]}...")
        return token
    cookie = request.cookies.get("candidate_session")
    if cookie:
        print(f"[AUTH DEBUG] Path={request.url.path} | Cookie found (first 8 chars): {cookie[:8]}...")
    else:
        print(f"[AUTH DEBUG] Path={request.url.path} | No auth header and no cookie")
    return cookie


# ── Core validation ───────────────────────────────────────────────────────────

def _validate_token(token: str) -> dict | None:
    """
    Check token against Redis. Returns session dict if found, None if not.
    Scans candidate:* keys — acceptable for small user counts.
    """
    redis = get_redis_client()
    token_hash = _hash_token(token)
    print(f"[AUTH DEBUG] _validate_token: hashed token (first 8 chars): {token_hash[:8]}...")
    cursor = 0

    while True:
        cursor, keys = redis.scan(cursor, match=f"{_SESSION_KEY_PREFIX}*", count=100)
        for key in keys:
            raw = redis.get(key)
            if raw:
                session = json.loads(raw)
                stored_hash = session.get("token_hash", "")
                match = stored_hash == token_hash
                print(f"[AUTH DEBUG] _validate_token: key={key} | stored_hash(first 8)={stored_hash[:8]}... | match={match}")
                if match:
                    print(f"[AUTH DEBUG] _validate_token: SESSION FOUND for candidate_id={session.get('candidate_id')}")
                    return session
        if cursor == 0:
            break
    print(f"[AUTH DEBUG] _validate_token: SESSION NOT FOUND for hashed token {token_hash[:8]}...")
    return None


# ── FastAPI dependency (used with Depends()) ──────────────────────────────────

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

    print(f"[AUTH DEBUG] ===== get_candidate_session called for path={path} =====")
    token = _extract_token(request)
    if not token:
        print(f"[AUTH DEBUG] No token extracted for {path} → 401")
        raise HTTPException(
            status_code=401,
            detail="Session required — please log in",
        )

    session = _validate_token(token)
    if not session:
        print(f"[AUTH DEBUG] Session invalid/expired for {path} → 401")
        raise HTTPException(
            status_code=401,
            detail="Session expired — please log in again",
        )

    print(f"[AUTH DEBUG] Auth SUCCESS for {path} → candidate_id={session.get('candidate_id')}")
    return session