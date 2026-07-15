"""
Candidate Registration — MongoDB.

POST /api/auth/register  — create user + candidate record (called from Next.js signup)
"""
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import Optional
import bcrypt
import uuid
from datetime import datetime, timezone

router = APIRouter(prefix="/api/auth", tags=["auth"])

class RegisterRequest(BaseModel):
    name: str
    email: str
    password: str


@router.post("/register")
async def register(request: Request, body: RegisterRequest):
    """
    Create a new user and candidate record.
    Used by the Next.js signup flow when email+password is chosen.
    """
    if len(body.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")

    db = get_sync_db()
    existing = db.users.find_one({"email": body.email})
    if existing:
        raise HTTPException(status_code=409, detail="An account with this email already exists")

    password_hash = bcrypt.hashpw(body.password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

    user_id = str(uuid.uuid4())
    candidate_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)

    db.users.insert_one({
        "_id": user_id,
        "name": body.name,
        "email": body.email,
        "password": password_hash,
        "created_at": now,
        "updated_at": now,
    })

    db.candidates.insert_one({
        "_id": candidate_id,
        "user_id": user_id,
        "email": body.email,
        "current_phase": "onboarding",
        "created_at": now,
        "updated_at": now,
    })

    return {"id": user_id, "name": body.name, "email": body.email, "message": "Account created successfully"}


def get_sync_db():
    from app.db.mongodb import get_sync_db as _g
    return _g()