"""
Admin Authentication API Endpoints.
"""
from fastapi import APIRouter, HTTPException
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
async def admin_login(request: AdminLoginRequest):
    """
    Authenticate an admin user and issue a session token.
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
async def admin_logout(token: str):
    """Revoke an admin session token."""
    if token in _active_tokens:
        del _active_tokens[token]
    return {"success": True, "message": "Logged out successfully"}


@router.get("/verify")
async def verify_token(token: str):
    """Check whether an admin token is valid and return session info."""
    session = _active_tokens.get(token)

    if not session:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    return {
        "valid": True,
        "admin_id": session["admin_id"],
        "email": session["email"],
    }