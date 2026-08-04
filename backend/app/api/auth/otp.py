"""
OTP Authentication — send, verify, and resend OTP codes.

POST /api/auth/send-otp    — request a new OTP for email verification
POST /api/auth/verify-otp  — submit an OTP for verification
POST /api/auth/resend-otp  — alias for send-otp (same logic, different UX name)

Registration flow:
  1. User submits email  → POST /send-otp  → OTP emailed, stub user created
  2. User submits OTP    → POST /verify-otp → user.isVerified = True, OTP cleared
  3. User submits full form (name + password) → POST /register → account completed

Rate limiting is handled by otp_service (Redis-backed).
Never exposes otp / otpExpiresAt in responses.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, EmailStr

from app.services.otp_service import send_otp, verify_otp

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/auth", tags=["auth-otp"])


# ── Request / Response models ────────────────────────────────────────────────

class SendOtpRequest(BaseModel):
    email: EmailStr
    name: str | None = None   # optional — shown in email greeting


class VerifyOtpRequest(BaseModel):
    email: EmailStr
    otp: str                   # 6-digit numeric code


class ResendOtpRequest(BaseModel):
    email: EmailStr


# ── Endpoints ────────────────────────────────────────────────────────────────

@router.post("/send-otp")
async def auth_send_otp(body: SendOtpRequest):
    """
    Generate and email a 6-digit OTP to the given address.

    Errors:
      409 — email already registered and verified
      429 — rate limited (too many requests)
    """
    result = send_otp(email=body.email, full_name=body.name)

    if "error" in result:
        code = result.get("code", "")

        if code == "ALREADY_VERIFIED":
            raise HTTPException(
                status_code=409,
                detail="This email is already registered. Please sign in instead.",
            )

        if code == "RATE_LIMITED":
            raise HTTPException(
                status_code=429,
                detail=result["error"],
            )

        # Unexpected error — treat as 500
        logger.error(f"[send-otp] Unexpected error: {result}")
        raise HTTPException(status_code=500, detail=result["error"])

    return {
        "message": result["message"],
        "expiresInMinutes": result.get("expiresInMinutes", 5),
    }


@router.post("/verify-otp")
async def auth_verify_otp(body: VerifyOtpRequest):
    """
    Validate an OTP and mark the user's email as verified.

    On success the user record is updated:
      - isVerified → True
      - otp / otpExpiresAt → cleared (cannot be reused)

    Errors:
      400 — invalid OTP (wrong code)
      400 — expired OTP (too old)
      404 — no pending verification found
    """
    result = verify_otp(email=body.email, otp=body.otp)

    if "error" in result:
        code = result.get("code", "")

        if code == "NOT_FOUND":
            raise HTTPException(
                status_code=404,
                detail="No pending verification found for this email. Please request a new OTP.",
            )

        if code == "EXPIRED_OTP":
            raise HTTPException(
                status_code=400,
                detail="Your OTP has expired. Please request a new OTP.",
            )

        if code == "INVALID_OTP":
            raise HTTPException(
                status_code=400,
                detail="The OTP you entered is incorrect.",
            )

        if code == "ALREADY_VERIFIED":
            raise HTTPException(
                status_code=409,
                detail="This email is already verified. Please sign in instead.",
            )

        logger.error(f"[verify-otp] Unexpected error: {result}")
        raise HTTPException(status_code=500, detail=result["error"])

    logger.info(f"[verify-otp] ✅ Verified: {body.email}")
    return {
        "success": True,
        "message": "Email verified successfully. You can now complete your registration.",
        "email": body.email,
    }


@router.post("/resend-otp")
async def auth_resend_otp(body: ResendOtpRequest):
    """
    Resend an OTP to the given email.
    Identical logic to send-otp — the new OTP invalidates the previous one.
    """
    result = send_otp(email=body.email)

    if "error" in result:
        code = result.get("code", "")

        if code == "ALREADY_VERIFIED":
            raise HTTPException(
                status_code=409,
                detail="This email is already registered. Please sign in instead.",
            )

        if code == "RATE_LIMITED":
            raise HTTPException(
                status_code=429,
                detail=result["error"],
            )

        logger.error(f"[resend-otp] Unexpected error: {result}")
        raise HTTPException(status_code=500, detail=result["error"])

    return {
        "message": result["message"],
        "expiresInMinutes": result.get("expiresInMinutes", 5),
    }