"""
Zoho SMTP Email Service — Python smtplib implementation.

Connects to smtp.zoho.in on port 465 with SSL/TLS.
Authenticates using EMAIL_SMTP_USER and EMAIL_SMTP_PASSWORD env vars.
Sends HTML emails; reusable for OTP, password reset, notifications, etc.

Env vars required (set in .env or infrastructure):
    EMAIL_SMTP_HOST     = smtp.zoho.in
    EMAIL_SMTP_PORT     = 465
    EMAIL_SMTP_USER     = your@zoho.email
    EMAIL_SMTP_PASSWORD = your_app_password
    EMAIL_FROM_ADDRESS  = noreply@annam.com
    EMAIL_FROM_NAME     = Annam AgriTech
    EMAIL_PROVIDER      = zoho   (used by notification_service registry)
"""

from __future__ import annotations

import logging
import smtplib
import os
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Optional

from app.core.config import settings

logger = logging.getLogger(__name__)


class ZohoSMTPProvider:
    """
    Sends email via Zoho's SMTP server (smtp.zoho.in, port 465, SSL).

    Falls back gracefully when credentials are not configured — logs a warning
    and returns False so callers can handle failures gracefully.
    """

    def __init__(self):
        self.host: str = settings.EMAIL_SMTP_HOST or os.getenv("EMAIL_SMTP_HOST", "smtp.zoho.in")
        self.port: int = settings.EMAIL_SMTP_PORT or int(os.getenv("EMAIL_SMTP_PORT", "465"))
        self.username: str = settings.EMAIL_SMTP_USER or os.getenv("EMAIL_SMTP_USER", "")
        self.password: str = settings.EMAIL_SMTP_PASSWORD or os.getenv("EMAIL_SMTP_PASSWORD", "")
        self.from_addr: str = settings.EMAIL_FROM_ADDRESS or os.getenv("EMAIL_FROM_ADDRESS", "noreply@annam.com")
        self.from_name: str = settings.EMAIL_FROM_NAME or os.getenv("EMAIL_FROM_NAME", "Annam AgriTech")

        self._configured = bool(self.username and self.password)
        if not self._configured:
            logger.warning(
                "[ZohoSMTP] EMAIL_SMTP_USER / EMAIL_SMTP_PASSWORD not set — "
                "emails will be logged to console only"
            )

    # ── Public interface ─────────────────────────────────────────────────────

    def send(
        self,
        to: str,
        subject: str,
        body: str,
        html_body: Optional[str] = None,
    ) -> bool:
        """
        Send an email.

        Args:
            to        : recipient email address
            subject   : subject line
            body      : plain-text body (required)
            html_body : optional HTML body

        Returns:
            True if sent successfully, False otherwise.
        """
        if not self._configured:
            logger.info(f"📧 [ZOHO SKIP — not configured] To: {to} | Subject: {subject}")
            logger.info(f"   Body: {body[:300]}")
            # Print OTP directly to stdout so developers can copy it
            import re
            otp_match = re.search(r'\b(\d{6})\b', body)
            if otp_match:
                logger.info(f"   🔐 DEV OTP: {otp_match.group(1)}")
            return False

        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = f"{self.from_name} <{self.from_addr}>"
        msg["To"] = to

        # Always attach plain-text body
        msg.attach(MIMEText(body, "plain", "utf-8"))

        # Attach HTML body if provided
        if html_body:
            msg.attach(MIMEText(html_body, "html", "utf-8"))

        try:
            with smtplib.SMTP_SSL(self.host, self.port) as server:
                server.login(self.username, self.password)
                server.sendmail(self.from_addr, [to], msg.as_string())

            logger.info(f"[ZohoSMTP] ✅ Sent to {to} | Subject: {subject}")
            return True

        except smtplib.SMTPAuthenticationError as exc:
            logger.error(f"[ZohoSMTP] Auth error — check EMAIL_SMTP_USER/PASSWORD: {exc}")
            return False

        except smtplib.SMTPException as exc:
            logger.error(f"[ZohoSMTP] SMTP error sending to {to}: {exc}")
            return False

        except Exception as exc:
            logger.error(f"[ZohoSMTP] Unexpected error sending to {to}: {exc}")
            return False

    # ── Convenience helpers ───────────────────────────────────────────────────

    def send_html(
        self,
        to: str,
        subject: str,
        html_body: str,
        plain_text_fallback: Optional[str] = None,
    ) -> bool:
        """
        Send a plain-HTML email (no explicit plain-text part unless provided).
        """
        body = plain_text_fallback or (
            "You are receiving this email. "
            "If you can see this message, please enable HTML email."
        )
        return self.send(to, subject, body, html_body)


# ── Module-level singleton ────────────────────────────────────────────────────

zoho_smtp_provider = ZohoSMTPProvider()