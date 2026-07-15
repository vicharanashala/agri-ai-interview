"""
Admin authentication middleware — MongoDB-backed sessions.
"""
from fastapi import Header, HTTPException, Cookie
from typing import Optional
import os
import json
from datetime import datetime, timezone

_INTERNAL_SERVICE_TOKEN = os.environ.get("INTERNAL_SERVICE_TOKEN", "")
_ADMIN_COOKIE_NAME = "admin_session"


def _mongo_get(token: str) -> Optional[dict]:
    """Return session dict for a token from MongoDB admin_sessions, or None if not found/expired."""
    if not token:
        return None
    from app.db.mongodb import get_sync_db
    db = get_sync_db()
    doc = db.admin_sessions.find_one({"token": token})
    if not doc:
        return None
    if doc.get("expires_at"):
        expires_at = doc["expires_at"]
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if expires_at < datetime.now(timezone.utc):
            db.admin_sessions.delete_one({"token": token})
            return None
    return {"admin_id": doc.get("admin_id"), "email": doc.get("email")}


def require_admin_auth(
    x_admin_token: Optional[str] = Header(None),
    admin_session: Optional[str] = Cookie(None),
) -> dict:
    """
    FastAPI dependency — rejects request if no valid admin token is present.
    Returns session payload (admin_id, email) on success.
    Accepts: X-Admin-Token header, admin_session cookie, or INTERNAL_SERVICE_TOKEN env var.
    """
    if _INTERNAL_SERVICE_TOKEN and x_admin_token == _INTERNAL_SERVICE_TOKEN:
        return {"admin_id": "internal_service", "email": "internal@annam.com"}

    token = x_admin_token or admin_session
    if not token:
        raise HTTPException(
            status_code=401,
            detail="Missing admin authentication — provide X-Admin-Token header or have admin_session cookie",
        )

    session = _mongo_get(token)
    if not session:
        raise HTTPException(status_code=401, detail="Invalid or expired admin token")

    return session