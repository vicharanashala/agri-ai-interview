"""
Admin Authentication API Endpoints.

Completely separate from the NextAuth candidate session.
Uses an httpOnly cookie scoped to /admin so signing out from
either flow does not affect the other.
"""
from fastapi import APIRouter, HTTPException, Response, Cookie, Header
import os
from pydantic import BaseModel
from typing import Optional
import bcrypt
import secrets

# In-memory admin store (replace with DB-backed store in production)
# bcrypt hash of "admin123" — pre-computed with rounds=12 so it's stable across restarts
_ADMINS = {
    "admin@annam.com": {
        "id": "admin_001",
        "email": "admin@annam.com",
        "password_hash": "$2b$12$4EaNEEoTHM0JX/Qu0y8c1uamVc3Kpt7MOMtAUI6EEqPxqViRdM9Xq",
        "name": "Admin User",
    }
}

# Active session tokens: token → {admin_id, email}
_active_tokens: dict[str, dict] = {}

# Cookie-based session constants
# path=/api/admin matches the FastAPI origin (localhost:8000/api/admin/*)
# so the browser sends the cookie with every admin API call.
# The cookie is NOT sent to other origins or paths, keeping it isolated.
_ADMIN_COOKIE_NAME = "admin_session"
_ADMIN_COOKIE_PATH = "/api/admin"
_ADMIN_COOKIE_MAX_AGE = 60 * 60 * 24 * 7  # 7 days

router = APIRouter(prefix="/api/admin/auth", tags=["admin-auth"])


def hash_password(password: str) -> str:
    """Hash a plain-text password using bcrypt."""
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(plain_password: str, password_hash: str) -> bool:
    """Verify a plain-text password against its bcrypt hash."""
    return bcrypt.checkpw(plain_password.encode("utf-8"), password_hash.encode("utf-8"))


def create_token() -> str:
    """Generate a secure random session token."""
    return secrets.token_urlsafe(32)


class AdminLoginRequest(BaseModel):
    email: str
    password: str


class AdminLoginResponse(BaseModel):
    success: bool
    token: Optional[str] = None
    admin: Optional[dict] = None
    message: str


@router.post("/login", response_model=AdminLoginResponse)
async def admin_login(request: AdminLoginRequest, response: Response):
    """
    Authenticate an admin user and issue a session token.
    Stores the token in an httpOnly cookie scoped to /api/admin so it is
    completely independent of the NextAuth session used by the candidate flow.
    """
    admin = _ADMINS.get(request.email)

    if not admin:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    if not verify_password(request.password, admin["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    token = create_token()
    _active_tokens[token] = {
        "admin_id": admin["id"],
        "email": admin["email"],
    }

    # secure=True only when running in production (HTTPS) — prevents cookie
    # being silently ignored on HTTP dev URLs (e.g. localhost:3000).
    is_production = os.environ.get("APP_ENV") == "production"
    response.set_cookie(
        key=_ADMIN_COOKIE_NAME,
        value=token,
        path=_ADMIN_COOKIE_PATH,
        max_age=_ADMIN_COOKIE_MAX_AGE,
        httponly=True,
        secure=is_production,
        samesite="lax",
    )

    return AdminLoginResponse(
        success=True,
        token=token,
        admin={
            "id": admin["id"],
            "email": admin["email"],
            "name": admin["name"],
        },
        message="Login successful",
    )


@router.post("/logout")
async def admin_logout(response: Response, admin_session: Optional[str] = Cookie(None)):
    """
    Revoke the admin session identified by the admin_session cookie and
    clear the cookie.  Only the admin_session cookie is touched — the
    candidate NextAuth session is not affected.
    """
    if admin_session and admin_session in _active_tokens:
        del _active_tokens[admin_session]

    response.set_cookie(
        key=_ADMIN_COOKIE_NAME,
        value="",
        path=_ADMIN_COOKIE_PATH,
        max_age=0,
        httponly=True,
        secure=True,
        samesite="lax",
    )
    return {"success": True, "message": "Logged out successfully"}


@router.get("/session")
async def get_admin_session(
    x_admin_token: Optional[str] = Header(None),
    admin_session: Optional[str] = Cookie(None),
):
    """
    Check whether the request has a valid admin_session cookie or X-Admin-Token
    header and return session info.  Used by the frontend admin dashboard to
    verify auth on mount.
    """
    # Accept X-Admin-Token header (preferred for cross-origin / programmatic calls)
    token = x_admin_token or admin_session
    if not token or token not in _active_tokens:
        raise HTTPException(status_code=401, detail="Not authenticated")

    session = _active_tokens[token]
    return {
        "valid": True,
        "admin_id": session["admin_id"],
        "email": session["email"],
    }


@router.get("/verify")
async def verify_token(admin_session: Optional[str] = Cookie(None)):
    """Check whether an admin session cookie is valid and return session info."""
    if not admin_session or admin_session not in _active_tokens:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    session = _active_tokens[admin_session]
    return {
        "valid": True,
        "admin_id": session["admin_id"],
        "email": session["email"],
    }