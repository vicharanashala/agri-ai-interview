"""
Admin Authentication API Endpoints — MongoDB session store.
"""
from fastapi import APIRouter, HTTPException, Response, Cookie, Header
import os
import json
from pydantic import BaseModel
from typing import Optional
import bcrypt
import secrets
from datetime import datetime, timezone

_ADMINS = {
    "admin@annam.com": {
        "id": "admin_001",
        "email": "admin@annam.com",
        "password_hash": "$2b$12$4EaNEEoTHM0JX/Qu0y8c1uamVc3Kpt7MOMtAUI6EEqPxqViRdM9Xq",
        "name": "Admin User",
    }
}

_ADMIN_SESSION_PREFIX = "admin_session:"
_ADMIN_SESSION_TTL = 60 * 60 * 24 * 7  # 7 days
_ADMIN_COOKIE_NAME = "admin_session"
_ADMIN_COOKIE_PATH = "/api/admin"
_ADMIN_COOKIE_MAX_AGE = _ADMIN_SESSION_TTL


def _get_admin_sessions():
    """Return the admin_sessions collection."""
    from app.db.mongodb import get_sync_db
    return get_sync_db().admin_sessions


def _mongo_get(token: str) -> Optional[dict]:
    doc = _get_admin_sessions().find_one({"token": token})
    if not doc:
        return None
    if doc.get("expires_at"):
        expires_at = doc["expires_at"]
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if expires_at < datetime.now(timezone.utc):
            _get_admin_sessions().delete_one({"token": token})
            return None
    return doc


def _mongo_set(token: str, session: dict) -> None:
    db = _get_admin_sessions()
    db.delete_one({"token": token})
    db.insert_one({
        "token": token,
        "admin_id": session["admin_id"],
        "email": session["email"],
        "expires_at": datetime.fromtimestamp(
            datetime.now(timezone.utc).timestamp() + _ADMIN_SESSION_TTL,
            tz=timezone.utc,
        ),
        "created_at": datetime.now(timezone.utc),
    })


def _mongo_delete(token: str) -> None:
    _get_admin_sessions().delete_one({"token": token})


router = APIRouter(prefix="/api/admin/auth", tags=["admin-auth"])


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(plain_password: str, password_hash: str) -> bool:
    return bcrypt.checkpw(plain_password.encode("utf-8"), password_hash.encode("utf-8"))


def create_token() -> str:
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
    admin = _ADMINS.get(request.email)
    if not admin:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    if not verify_password(request.password, admin["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    token = create_token()
    _mongo_set(token, {"admin_id": admin["id"], "email": admin["email"]})

    is_production = os.environ.get("APP_ENV") == "production"
    response.set_cookie(
        key=_ADMIN_COOKIE_NAME, value=token, path=_ADMIN_COOKIE_PATH,
        max_age=_ADMIN_COOKIE_MAX_AGE, httponly=True,
        secure=is_production, samesite="lax",
    )

    return AdminLoginResponse(
        success=True, token=token,
        admin={"id": admin["id"], "email": admin["email"], "name": admin["name"]},
        message="Login successful",
    )


@router.post("/logout")
async def admin_logout(response: Response, admin_session: Optional[str] = Cookie(None)):
    if admin_session:
        _mongo_delete(admin_session)
    response.set_cookie(
        key=_ADMIN_COOKIE_NAME, value="", path=_ADMIN_COOKIE_PATH,
        max_age=0, httponly=True, secure=True, samesite="lax",
    )
    return {"success": True, "message": "Logged out successfully"}


@router.get("/session")
async def get_admin_session(
    x_admin_token: Optional[str] = Header(None),
    admin_session: Optional[str] = Cookie(None),
):
    token = x_admin_token or admin_session
    session = _mongo_get(token) if token else None
    if not session:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return {"valid": True, "admin_id": session["admin_id"], "email": session["email"]}


@router.get("/verify")
async def verify_token(admin_session: Optional[str] = Cookie(None)):
    session = _mongo_get(admin_session) if admin_session else None
    if not session:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return {"valid": True, "admin_id": session["admin_id"], "email": session["email"]}