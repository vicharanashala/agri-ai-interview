"""
OTP Auth Endpoints — FastAPI routes for email verification.

POST /api/auth/send-otp  — generate and send OTP to email
POST /api/auth/verify-otp — validate OTP, mark user as verified
"""

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, EmailStr
from typing import Optional

from app.services.otp_service import send_otp, verify_otp

router = APIRouter(prefix="/api/auth", tags=["auth-otp"])


# ── Request / Response models ────────────────────────────────────────────────

class SendOtpRequest(BaseModel):
    email: str
    name: Optional[str] = ""


class VerifyOtpRequest(BaseModel):
    email: str
    otp: str


# ── POST /api/auth/send-otp ──────────────────────────────────────────────────

@router.post("/send-otp")
async def api_send_otp(body: SendOtpRequest, request: Request):
    """
    Generate a 6-digit OTP and send it to the provided email address.

    Behaviour:
      • Rate-limited to 1 request per 60 seconds per email.
      • If email belongs to an already-verified account → error.
      • If email has a pending (unverified) registration → updates OTP.
      • If email is new → creates an unverified stub user record.
    """
    if not body.email or not body.email.strip():
        raise HTTPException(status_code=400, detail="Email is required.")

    email = body.email.strip().lower()
    name = body.name.strip() if body.name else None

    result = send_otp(email=email, full_name=name)

    if "error" in result:
        code = result.get("code", "ERROR")
        if code == "ALREADY_VERIFIED":
            raise HTTPException(status_code=409, detail=result["error"])
        if code == "RATE_LIMITED":
            raise HTTPException(status_code=429, detail=result["error"])
        if code == "SEND_FAILED":
            raise HTTPException(status_code=503, detail=result["error"])
        # Generic server error
        raise HTTPException(status_code=500, detail=result["error"])

    return result


# ── POST /api/auth/verify-otp ────────────────────────────────────────────────

@router.post("/verify-otp")
async def api_verify_otp(body: VerifyOtpRequest, request: Request):
    """
    Validate the OTP submitted by the user.

    On success:
      • isVerified is set to True in the database.
      • OTP and otpExpiresAt fields are cleared.
      • Returns the userId so the frontend can proceed with registration.

    Error codes:
      INVALID_OTP  — wrong OTP value
      EXPIRED_OTP  — OTP has expired
      NOT_FOUND    — no pending verification for this email
    """
    if not body.email or not body.email.strip():
        raise HTTPException(status_code=400, detail="Email is required.")
    if not body.otp or not body.otp.strip():
        raise HTTPException(status_code=400, detail="OTP is required.")

    email = body.email.strip().lower()
    otp = body.otp.strip()

    result = verify_otp(email=email, otp=otp)

    if "error" in result:
        code = result.get("code", "ERROR")
        if code == "INVALID_OTP":
            raise HTTPException(status_code=400, detail=result["error"])
        if code == "EXPIRED_OTP":
            raise HTTPException(status_code=400, detail=result["error"])
        if code == "NOT_FOUND":
            raise HTTPException(status_code=404, detail=result["error"])
        if code == "ALREADY_VERIFIED":
            raise HTTPException(status_code=409, detail=result["error"])
        raise HTTPException(status_code=500, detail=result["error"])

    return result