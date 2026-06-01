"""
Admin authentication middleware.
Protects backend routes by verifying admin session tokens.

Accepts tokens from either:
- X-Admin-Token header (e.g. from server-side API calls)
- admin_session cookie (set by /api/admin/auth/login, scoped to /admin)
"""
from fastapi import Header, HTTPException, Cookie
from typing import Optional
import os

# Internal service token for trusted internal clients (Next.js frontend)
_INTERNAL_SERVICE_TOKEN = os.environ.get("INTERNAL_SERVICE_TOKEN", "")

_ADMIN_COOKIE_NAME = "admin_session"


def get_auth_token_store() -> dict[str, dict]:
    """Lazily access the token store from auth.py to avoid circular imports."""
    from app.api.admin import auth as auth_module
    return auth_module._active_tokens


def require_admin_auth(
    x_admin_token: Optional[str] = Header(None),
    admin_session: Optional[str] = Cookie(None),
) -> dict:
    """
    FastAPI dependency — rejects request if no valid admin token is present.
    Returns the session payload (admin_id, email) on success.

    Accepts either:
    - X-Admin-Token header (e.g. server-to-server calls)
    - admin_session cookie (set by /api/admin/auth/login)
    - INTERNAL_SERVICE_TOKEN env var (trusted internal services)
    """
    # Internal service token — bypasses session check
    if _INTERNAL_SERVICE_TOKEN and x_admin_token == _INTERNAL_SERVICE_TOKEN:
        return {"admin_id": "internal_service", "email": "internal@annam.com"}

    # Prefer header token, fall back to cookie
    token = x_admin_token or admin_session

    if not token:
        raise HTTPException(
            status_code=401,
            detail="Missing admin authentication — provide X-Admin-Token header or have admin_session cookie",
        )

    store = get_auth_token_store()
    session = store.get(token)

    if not session:
        raise HTTPException(
            status_code=401,
            detail="Invalid or expired admin token",
        )

    return session