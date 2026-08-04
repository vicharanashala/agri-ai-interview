"""
Candidate Registration — MongoDB.

POST /api/auth/register  — complete account creation for email+password users
  Request body: { name, email, password }

Pre-condition: user record must exist AND be isVerified == True.
  (The stub user is created by /send-otp; verification sets isVerified.)
  This prevents completing registration without first verifying the email.

Logic:
  1. Find user by email — must exist and must be verified.
  2. Name + password are required.
  3. Hash and store password; set name.
  4. Create candidate record if not present.
  5. Return success.

Google Sign-In users bypass OTP entirely (isVerified=True is set at account creation
by the OAuth callback), so this endpoint works for them too.
"""

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
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
    Complete candidate account creation.

    Users must first verify their email via OTP (/send-otp → /verify-otp)
    before they can call this endpoint.
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

    # 1. User must exist and must be verified
    user = db.users.find_one({"email": email})

    if not user:
        raise HTTPException(
            status_code=404,
            detail="No verified account found for this email. "
                   "Please verify your email first.",
        )

    if not user.get("isVerified", False):
        raise HTTPException(
            status_code=403,
            detail="Please verify your email before completing registration. "
                   "Check your inbox for the verification code.",
        )

    # 2. Update existing verified stub (or overwrite for Google users re-using email)
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
    user_id = user["_id"]

    # 3. Create candidate record (if not already present)
    existing_candidate = db.candidates.find_one({"user_id": user_id})
    if not existing_candidate:
        db.candidates.insert_one({
            "_id": ObjectId(),
            "user_id": user_id,
            "email": email,
            "current_phase": "onboarding",
            "created_at": now,
            "updated_at": now,
        })

    return {
        "id": str(user_id),
        "name": name,
        "email": email,
        "message": "Account created successfully",
    }