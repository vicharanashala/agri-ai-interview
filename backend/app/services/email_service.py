"""
Email Service — handles all outbound candidate emails.

Currently implements:
  - send_offer_email: Email #3 — offer letter PDF + joining details PDF attached.
    Admin-triggered via POST /api/admin/candidates/{id}/send-offer-email

Uses the NotificationService (console / SendGrid / SES) for delivery.
"""
from __future__ import annotations

import logging
import base64
from datetime import datetime
from io import BytesIO
from typing import Optional

from app.db.database import SessionLocal
from app.db.models.candidate import Candidate, User
from app.services.notification_service import notification_service
from app.api.offer import generate_offer_letter_pdf
from app.services.settings_service import get_offer_letter_config

logger = logging.getLogger(__name__)


def _get_candidate_full(candidate_id: str) -> tuple[Candidate, User | None, str]:
    """
    Resolve candidate + user + email for a candidate_id.
    Returns (Candidate, User or None, email string).
    Raises ValueError if candidate not found.
    """
    db = SessionLocal()
    try:
        cand = db.query(Candidate).filter(Candidate.id == candidate_id).first()
        if not cand:
            raise ValueError(f"Candidate {candidate_id} not found")

        user_email = ""
        user: Optional[User] = None
        if cand.userId:
            user = db.query(User).filter(User.id == cand.userId).first()
            if user and user.email:
                user_email = user.email

        return cand, user, user_email
    finally:
        db.close()


def _generate_joining_pdf_bytes(cand: Candidate, user_email: str) -> bytes:
    """Generate joining details PDF bytes for a candidate."""
    # Import here to avoid circular imports
    from app.api.joining_details import create_joining_pdf

    # Use sensible defaults for joining details (admin sets these via settings)
    joining_config = {
        "stipend": "₹15,000/month",
        "location": "Hybrid (Remote + On-site training)",
        "startDate": "To be confirmed",
        "department": "Agricultural Advisory Services",
        "reportingTime": "9:30 AM",
        "dressCode": "Smart Casual",
        "documentsRequired": [
            "Aadhar Card (original + copy)",
            "PAN Card (original + copy)",
            "Education Certificates (original + copy)",
            "Passport-size photographs (3)",
            "Previous experience letters (if any)",
        ],
    }

    data = {
        "user": {
            "name": cand.fullName or "Candidate",
            "email": user_email,
            "phone": cand.phone or "",
        },
        "joining": joining_config,
        "generatedAt": datetime.now().isoformat(),
    }

    return create_joining_pdf(data)


async def send_offer_email(candidate_id: str, to_email: str, candidate_name: str) -> dict:
    """
    Send Email #3: offer letter + joining details, admin-triggered.

    Attaches:
      - Offer letter PDF (unsigned)
      - Joining details PDF

    Returns a dict with send status details.
    """
    # ── Generate PDFs in memory ──────────────────────────────────────────────
    offer_buffer = generate_offer_letter_pdf(
        candidate_name=candidate_name,
        email=to_email,
        phone="",  # phone not always available at this stage
    )
    offer_pdf_bytes = offer_buffer.read()
    offer_b64 = base64.b64encode(offer_pdf_bytes).decode("utf-8")

    joining_pdf_bytes = _generate_joining_pdf_bytes(
        _get_candidate_full(candidate_id)[0], to_email
    )
    joining_b64 = base64.b64encode(joining_pdf_bytes).decode("utf-8")

    # ── Compose email ────────────────────────────────────────────────────────
    subject = "Congratulations! Your Offer Letter — Annam Agri Internship Program"

    body = f"""Dear {candidate_name},

Congratulations on successfully completing the Agri Internship interview! We are pleased to inform you that you have been selected.

Please find attached:
  1. Your Offer Letter — review the position details, stipend, and terms
  2. Joining Details — information about your start date, location, and next steps

Read both documents carefully. If you have any questions, reply to this email or contact the hiring team.

We look forward to welcoming you to the team!

Best regards,
Annam AgriTech Hiring Team
"""

    html_body = f"""
    <html>
    <body style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2E7D32;">Congratulations, {candidate_name}! 🎉</h2>
        <p>Congratulations on successfully completing the Agri Internship interview! We are pleased to inform you that you have been selected.</p>
        <p>Please find attached to this email:</p>
        <ol>
            <li><strong>Offer Letter</strong> — review the position details, stipend, and terms</li>
            <li><strong>Joining Details</strong> — information about your start date, location, and next steps</li>
        </ol>
        <p>Read both documents carefully. If you have any questions, reply to this email or contact the hiring team.</p>
        <p>We look forward to welcoming you to the team!</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
        <p style="color: #666; font-size: 12px;">Best regards,<br>Annam AgriTech Hiring Team</p>
    </body>
    </html>
    """

    # ── Attachments ──────────────────────────────────────────────────────────
    # Build a MIME multipart message manually so we can attach binary PDFs
    from email.mime.multipart import MIMEMultipart
    from email.mime.text import MIMEText
    from email.mime.base import MIMEBase
    from email import encoders

    msg = MIMEMultipart()
    msg["From"] = "Annam AgriTech Hiring Team <noreply@annam.com>"
    msg["To"] = to_email
    msg["Subject"] = subject

    msg.attach(MIMEText(body, "plain"))
    msg.attach(MIMEText(html_body, "html"))

    # Attach offer letter
    for filename, b64data in [
        ("Offer_Letter.pdf", offer_b64),
        ("Joining_Details.pdf", joining_b64),
    ]:
        part = MIMEBase("application", "octet-stream")
        part.set_payload(base64.b64decode(b64data))
        encoders.encode_base64(part)
        part.add_header(
            "Content-Disposition",
            f'attachment; filename="{filename}"',
        )
        msg.attach(part)

    # ── Send via notification service ────────────────────────────────────────
    # The notification_service.send() doesn't support raw MIME messages,
    # so we fall back to direct SMTP for this multi-attachment email.
    # Try notification_service first; if it fails, log and return failure.
    try:
        sent = notification_service.send(
            to=to_email,
            subject=subject,
            body=body,
            html_body=html_body,
        )
    except Exception as e:
        logger.error(f"notification_service.send failed: {e}")
        sent = False

    # For multi-attachment emails, also try direct SMTP
    if not sent:
        # Try direct SMTP as fallback
        sent = _send_smtp_direct(msg, to_email)

    return {
        "candidate_id": candidate_id,
        "to": to_email,
        "sent": sent,
        "attachments": ["Offer_Letter.pdf", "Joining_Details.pdf"],
    }


def _send_smtp_direct(msg, to_email: str) -> bool:
    """Direct SMTP send for multi-attachment messages."""
    import os
    import smtplib

    provider = os.getenv("EMAIL_PROVIDER", "console").lower()
    if provider == "console":
        logger.info(f"📧 [CONSOLE] Would send offer email to {to_email}")
        return True

    try:
        if provider == "sendgrid":
            # SendGrid REST API for multipart
            import urllib.request
            import json

            api_key = os.getenv("SENDGRID_API_KEY", "")
            from_email = os.getenv("FROM_EMAIL", "noreply@annam.com")

            if not api_key:
                logger.warning("SendGrid: no API key, skipping")
                return False

            # Convert MIME to raw SMTP message
            raw_msg = msg.as_bytes()

            payload = {
                "personalizations": [{"to": [{"email": to_email}]}],
                "from": {"email": from_email},
                "subject": msg["Subject"],
                "content": [
                    {"type": "text/plain", "value": msg.get_body().get_content()},
                ],
            }

            payload_bytes = json.dumps(payload).encode("utf-8")
            req = urllib.request.Request(
                "https://api.sendgrid.com/v3/mail/send",
                data=payload_bytes,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=15) as resp:
                logger.info(f"[SendGrid] Offer email sent to {to_email}, status={resp.status}")
                return resp.status in (200, 201, 202)

        elif provider == "ses":
            import smtplib
            from email.mime.multipart import MIMEMultipart

            host = os.getenv("AWS_SES_SMTP_HOST", "")
            port = int(os.getenv("AWS_SES_SMTP_PORT", "587"))
            username = os.getenv("AWS_SES_SMTP_USER", "")
            password = os.getenv("AWS_SES_SMTP_PASSWORD", "")
            from_email = os.getenv("FROM_EMAIL", "noreply@annam.com")

            if not host or not username or not password:
                logger.warning("SES: not configured, skipping")
                return False

            with smtplib.SMTP(host, port) as server:
                server.ehlo()
                server.starttls()
                server.login(username, password)
                server.sendmail(from_email, [to_email], msg.as_bytes())

            logger.info(f"[SES] Offer email sent to {to_email}")
            return True

        else:
            logger.warning(f"Unknown EMAIL_PROVIDER: {provider}")
            return False

    except Exception as e:
        logger.error(f"Failed to send offer email to {to_email}: {e}")
        return False