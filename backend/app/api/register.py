"""
Candidate Registration — MongoDB.

POST /api/auth/register  — complete signup for verified email
  Request body: { name, email, password }
  The email must already be verified (isVerified=true on the user document).

Logic:
  1. Find user by email — must exist and isVerified must be True.
  2. Password must not already be set (prevents re-registration).
  3. Hash and store password; set name.
  4. Create candidate record.
  5. Return success.

Why a separate register call?
  The OTP verification step creates an unverified stub user (no password).
  After email is verified, the client calls /register with the password.
  This keeps the OTP flow stateless and resumable.
"""

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import Optional
import bcrypt
from datetime import datetime, timezone
from bson import ObjectId

from app.db.mongodb import get_sync_db

router = APIRouter(prefix="/api/auth", tags=["auth"])


class RegisterRequest(BaseModel):
    name: str
    email: str
    password: str


@router.post("/register")
async def register(request: Request, body: RegisterRequest):
    """
    Complete user registration for a verified email address.

    Email must already be verified via OTP before calling this endpoint.
    Creates the candidate record and sets the password.
    """
    if len(body.password) < 6:
        raise HTTPException(
            status_code=400,
            detail="Password must be at least 6 characters",
        )

    email = body.email.strip().lower()
    name = body.name.strip()

    if not name:
        raise HTTPException(status_code=400, detail="Name is required.")

    db = get_sync_db()
    now = datetime.now(timezone.utc)

    # 1. Find existing user
    user = db.users.find_one({"email": email})
    if not user:
        raise HTTPException(
            status_code=404,
            detail="No verified account found for this email. Please sign up first.",
        )

    # 2. Must be verified
    if not user.get("isVerified", False):
        raise HTTPException(
            status_code=403,
            detail="Your email has not been verified yet. Please verify your email before signing up.",
        )

    # 3. Password must not already be set (already registered)
    if user.get("password") and user["password"].startswith("$2"):
        raise HTTPException(
            status_code=409,
            detail="An account with this email already exists. Please sign in instead.",
        )

    # 4. Hash password and update user
    password_hash = bcrypt.hashpw(body.password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    db.users.update_one(
        {"_id": user["_id"]},
        {
            "$set": {
                "name": name,
                "password": password_hash,
                "updated_at": now,
            }
        },
    )

    # 5. Create candidate record (if not already present)
    existing_candidate = db.candidates.find_one({"user_id": user["_id"]})
    if not existing_candidate:
        candidate_id = ObjectId()
        db.candidates.insert_one({
            "_id": candidate_id,
            "user_id": user["_id"],
            "email": email,
            "current_phase": "onboarding",
            "created_at": now,
            "updated_at": now,
        })

    return {
        "id": user["_id"],
        "name": name,
        "email": email,
        "message": "Account created successfully",
    }


def get_sync_db():
    from app.db.mongodb import get_sync_db as _g
    return _g()