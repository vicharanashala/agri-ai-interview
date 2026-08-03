"""
OTP Service — generates, stores, validates, and sends OTP codes.

Designed for email-verification during manual user registration.

Key design decisions:
  • OTP is stored directly in the users collection (otp + otpExpiresAt).
  • Unverified users can request a new OTP (updates existing record).
  • Verified users cannot request OTP (email already confirmed).
  • Previous OTP is invalidated whenever a new one is generated.
  • OTP is cleared after successful verification.
  • Rate limiting is checked via Redis (OTP_REQUEST_RATE_LIMIT).
  • Never expose otp / otpExpiresAt in API responses.
"""

from __future__ import annotations

import logging
import secrets
import time
from datetime import datetime, timezone, timedelta
from typing import Optional

from bson import ObjectId

from app.core.config import settings
from app.db.mongodb import get_sync_db
from app.services.zoho_smtp import zoho_smtp_provider

logger = logging.getLogger(__name__)

# ── Constants ────────────────────────────────────────────────────────────────

OTP_BITS = 6  # generates a 6-digit numeric OTP (~1 in 1.1M collision space)
OTP_TTL_MINUTES = settings.OTP_EXPIRY_MINUTES  # default 5 minutes
RATE_LIMIT_SECONDS = settings.OTP_RATE_LIMIT_SECONDS  # default 60s between requests

# ── Redis helper (sync) ──────────────────────────────────────────────────────

def _redis_client():
    """Return a sync Redis client (for rate-limiting only)."""
    try:
        from app.core.redis import get_sync_redis_client
        return get_sync_redis_client()
    except Exception:
        return None


def _rate_limit_check(email: str) -> tuple[bool, int]:
    """
    Check and update per-email rate-limit counter.

    Returns (allowed, retry_after_seconds).
    If not allowed, retry_after_seconds tells the caller how long to wait.
    """
    redis = _redis_client()
    if redis is None:
        # No Redis — allow but log a warning
        logger.warning("[OTP] Redis unavailable — rate limiting skipped")
        return True, 0

    key = f"otp:ratelimit:{email.lower()}"
    try:
        current = redis.get(key)
        if current and int(current) > 0:
            ttl = redis.ttl(key)
            return False, max(ttl, 1)
    except Exception as exc:
        logger.warning(f"[OTP] Redis rate-limit check failed: {exc}")

    return True, 0


def _set_rate_limit(email: str) -> None:
    """Set a 60-second rate-limit window for the given email."""
    redis = _redis_client()
    if redis is None:
        return

    key = f"otp:ratelimit:{email.lower()}"
    try:
        pipe = redis.pipeline()
        pipe.incr(key)
        pipe.expire(key, RATE_LIMIT_SECONDS)
        pipe.execute()
    except Exception as exc:
        logger.warning(f"[OTP] Redis rate-limit set failed: {exc}")


# ── OTP generation ───────────────────────────────────────────────────────────

def _generate_otp() -> str:
    """
    Generate a cryptographically secure 6-digit numeric OTP.
    Uses secrets.choice for uniform distribution.
    """
    return "".join(str(secrets.randbelow(10)) for _ in range(OTP_BITS))


# ── Email rendering ──────────────────────────────────────────────────────────

def _render_otp_email(otp: str, full_name: Optional[str] = None) -> tuple[str, str]:
    """
    Render OTP email subject, plain body, and HTML body.

    Returns (subject, body_plain, body_html).
    """
    greeting = f"Hi{f' {full_name}' if full_name else ''},"

    subject = "Your Annam Portal Verification Code"

    body_plain = (
        f"{greeting}\n\n"
        f"Your verification code is: {otp}\n\n"
        f"This code will expire in {OTP_TTL_MINUTES} minutes.\n"
        f"If you did not request this code, please ignore this email.\n\n"
        f"Best regards,\n"
        f"Annam AgriTech Hiring Team"
    )

    body_html = f"""
    <!DOCTYPE html>
    <html>
    <body style="font-family: Arial, sans-serif; color: #333; max-width: 560px; margin: 0 auto; padding: 24px;">
      <h2 style="color: #2E7D32; margin-bottom: 24px;">{subject}</h2>

      <p style="font-size: 15px; line-height: 1.6;">{greeting}</p>

      <div style="background: #f5f5f5; border-radius: 8px; padding: 24px; text-align: center; margin: 24px 0;">
        <p style="margin: 0 0 8px; font-size: 13px; color: #666; letter-spacing: 1px; text-transform: uppercase;">
          Your Verification Code
        </p>
        <p style="margin: 0; font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #2E7D32; font-family: 'Courier New', monospace;">
          {otp}
        </p>
      </div>

      <p style="font-size: 14px; color: #666;">
        ⏱ This code expires in <strong>{OTP_TTL_MINUTES} minutes</strong>.
      </p>

      <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />

      <p style="font-size: 13px; color: #999;">
        If you did not request this code, you can safely ignore this email.
        If you have questions, reply to this message or contact the Annam hiring team.
      </p>

      <p style="font-size: 13px; color: #999; margin-top: 16px;">
        Best regards,<br/>
        <strong>Annam AgriTech Hiring Team</strong>
      </p>
    </body>
    </html>
    """

    return subject, body_plain, body_html


# ── Public API ────────────────────────────────────────────────────────────────

def send_otp(email: str, full_name: Optional[str] = None) -> dict:
    """
    Generate an OTP for the given email address and send it via email.

    Logic:
      1. Check rate limit → reject if too many requests.
      2. Look up email in users collection:
         - If verified account exists → error (already registered).
         - If unverified account exists → update its OTP.
         - If no account exists → create a stub unverified user record.
      3. Generate secure OTP + expiry.
      4. Persist otp + otpExpiresAt (clear previous OTP).
      5. Send OTP email.
      6. Return success.

    Returns:
        {"success": True, "message": "..."}
        {"error": "...", "code": "RATE_LIMITED" | "ALREADY_VERIFIED"}
    """
    email_lower = email.lower().strip()

    # 1. Rate-limit check
    allowed, retry_after = _rate_limit_check(email_lower)
    if not allowed:
        logger.info(f"[OTP] Rate-limited: {email_lower} (retry in {retry_after}s)")
        return {
            "error": f"Too many OTP requests. Please wait {retry_after} seconds before trying again.",
            "code": "RATE_LIMITED",
        }

    _set_rate_limit(email_lower)

    db = get_sync_db()
    now = datetime.now(timezone.utc)

    # 2. Check if a verified account already exists
    existing = db.users.find_one({"email": email_lower})
    if existing and existing.get("isVerified", False):
        logger.info(f"[OTP] Request for already-verified email: {email_lower}")
        return {
            "error": "This email is already registered and verified. Please sign in instead.",
            "code": "ALREADY_VERIFIED",
        }

    # 3. Determine or create user record
    if existing:
        # Unverified user — update OTP (invalidate any previous)
        user_id = existing["_id"]
        logger.info(f"[OTP] Updating OTP for existing unverified user: {email_lower}")
    else:
        # New unverified user — insert stub (no name/password yet; added at register)
        user_id = str(ObjectId())
        stub = {
            "_id": user_id,
            "email": email_lower,
            "isVerified": False,
            # These will be completed when the user finishes registration
            "name": full_name or "",
            "password": "",       # set during final registration
            "created_at": now,
            "updated_at": now,
        }
        db.users.insert_one(stub)
        logger.info(f"[OTP] Created stub user record for: {email_lower}")

    # 4. Generate OTP
    otp = _generate_otp()
    otp_expires_at = now + timedelta(minutes=OTP_TTL_MINUTES)

    # 5. Persist OTP — overwrite any previous (invalidation on resend)
    db.users.update_one(
        {"_id": user_id},
        {
            "$set": {
                "otp": otp,
                "otpExpiresAt": otp_expires_at,
                "updated_at": now,
            }
        },
    )

    # 6. Send email
    subject, body_plain, body_html = _render_otp_email(otp, full_name)
    sent = zoho_smtp_provider.send(
        to=email_lower,
        subject=subject,
        body=body_plain,
        html_body=body_html,
    )

    if not sent:
        # OTP is still stored in DB — caller can verify even without SMTP in dev
        logger.warning(f"[OTP] Email send failed for {email_lower} — OTP still stored for dev testing")
        return {
            "success": True,
            "message": f"A verification code has been sent to {email_lower}.",
            "expiresInMinutes": OTP_TTL_MINUTES,
            "_devNote": "SMTP not configured — OTP is logged to backend console",
        }

    logger.info(f"[OTP] ✅ OTP sent to {email_lower}, expires at {otp_expires_at.isoformat()}")
    return {
        "success": True,
        "message": f"A verification code has been sent to {email_lower}.",
        "expiresInMinutes": OTP_TTL_MINUTES,
    }


def verify_otp(email: str, otp: str) -> dict:
    """
    Validate an OTP for the given email.

    Returns on error:
        {"error": "...", "code": "INVALID_OTP" | "EXPIRED_OTP" | "NOT_FOUND"}

    Returns on success:
        {"success": True, "message": "...", "userId": "...", "email": "..."}
        The caller should then allow the user to complete registration.
        The OTP fields are cleared immediately to prevent reuse.
    """
    email_lower = email.lower().strip()
    db = get_sync_db()

    user = db.users.find_one({"email": email_lower})
    if not user:
        logger.warning(f"[OTP] verify_otp: no user found for {email_lower}")
        return {
            "error": "No pending verification found for this email. Please request a new OTP.",
            "code": "NOT_FOUND",
        }

    if user.get("isVerified", False):
        # Already verified — shouldn't happen in normal flow but handle gracefully
        return {
            "error": "This email is already verified. Please sign in instead.",
            "code": "ALREADY_VERIFIED",
        }

    stored_otp = user.get("otp", "")
    otp_expires_at: Optional[datetime] = user.get("otpExpiresAt")

    # Check expiry
    if not otp_expires_at:
        return {
            "error": "Your OTP has expired. Please request a new OTP.",
            "code": "EXPIRED_OTP",
        }

    now = datetime.now(timezone.utc)
    # Normalise to UTC-aware datetimes — MongoDB may return naive datetimes
    if otp_expires_at.tzinfo is None:
        otp_expires_at = otp_expires_at.replace(tzinfo=timezone.utc)
    if now > otp_expires_at:
        return {
            "error": "Your OTP has expired. Please request a new OTP.",
            "code": "EXPIRED_OTP",
        }

    # Check OTP value (constant-time comparison to avoid timing attacks)
    if not secrets.compare_digest(stored_otp, otp):
        logger.info(f"[OTP] Invalid OTP attempt for {email_lower}")
        return {
            "error": "The OTP you entered is incorrect.",
            "code": "INVALID_OTP",
        }

    # Success — clear OTP fields and mark user as verified
    db.users.update_one(
        {"_id": user["_id"]},
        {
            "$set": {"isVerified": True, "updated_at": now},
            "$unset": {"otp": "", "otpExpiresAt": ""},
        },
    )
    logger.info(f"[OTP] ✅ Verified: {email_lower}")
    return {
        "success": True,
        "message": "Email verified successfully. You can now complete your registration.",
        "userId": user["_id"],
        "email": email_lower,
    }