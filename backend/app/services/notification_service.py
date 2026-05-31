"""
Notification Service — Phase 7.1

Provides a unified interface for sending notifications (email initially).
Supports multiple providers via configuration:
  - console  : logs to stdout (dev/default)
  - sendgrid : SendGrid REST API
  - ses      : AWS SES SMTP or API

Usage:
    from app.services.notification_service import notification_service

    notification_service.send(
        to="candidate@example.com",
        subject="Your interview slot is ready",
        body="Join within 5 minutes...",
    )
"""

from __future__ import annotations

import os
import smtplib
import logging
from abc import ABC, abstractmethod
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Optional

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.config import settings

logger = logging.getLogger(__name__)


# -------------------------------------------------------------------
# Provider interface
# -------------------------------------------------------------------

class NotificationProvider(ABC):
    """Abstract base for notification backends."""

    @abstractmethod
    def send(self, to: str, subject: str, body: str, html_body: Optional[str] = None) -> bool:
        """
        Send an email.

        Args:
            to         : recipient email address
            subject    : email subject line
            body       : plain-text body
            html_body  : optional HTML version

        Returns:
            True if sent successfully, False otherwise.
        """
        ...


# -------------------------------------------------------------------
# Console provider (default / dev)
# -------------------------------------------------------------------

class ConsoleProvider(NotificationProvider):
    """
    Logs notification details to stdout / logger.
    Used when EMAIL_PROVIDER=console (the default).
    """

    def send(self, to: str, subject: str, body: str, html_body: Optional[str] = None) -> bool:
        logger.info("📧 [CONSOLE NOTIFICATION]")
        logger.info(f"   To:      {to}")
        logger.info(f"   Subject: {subject}")
        logger.info(f"   Body:    {body[:200]}{'...' if len(body) > 200 else ''}")
        if html_body:
            logger.info(f"   HTML:    {html_body[:200]}{'...' if len(html_body) > 200 else ''}")
        return True


# -------------------------------------------------------------------
# SendGrid provider
# -------------------------------------------------------------------

class SendGridProvider(NotificationProvider):
    """
    Sends email via the SendGrid REST API (v3 mail send).

    Required env vars:
        SENDGRID_API_KEY — your SendGrid API key
        FROM_EMAIL        — verified sender address
    """

    def __init__(self):
        self.api_key: str = os.getenv("SENDGRID_API_KEY", "")
        self.from_email: str = os.getenv("FROM_EMAIL", "noreply@annam.com")
        if not self.api_key:
            logger.warning("SendGrid: SENDGRID_API_KEY not set — notifications will be logged only")

    def _make_payload(self, to: str, subject: str, body: str, html_body: Optional[str]) -> dict:
        payload = {
            "personalizations": [{"to": [{"email": to}]}],
            "from": {"email": self.from_email},
            "subject": subject,
            "content": [{"type": "text/plain", "value": body}],
        }
        if html_body:
            payload["content"].append({"type": "text/html", "value": html_body})
        return payload

    def send(self, to: str, subject: str, body: str, html_body: Optional[str] = None) -> bool:
        if not self.api_key:
            logger.warning(f"[SendGrid] No API key — skipping email to {to}")
            return False

        try:
            import urllib.request

            payload_bytes = str(self._make_payload(to, subject, body, html_body)).encode("utf-8")
            req = urllib.request.Request(
                "https://api.sendgrid.com/v3/mail/send",
                data=payload_bytes,
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                },
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=15) as resp:
                logger.info(f"[SendGrid] Sent to {to}, status={resp.status}")
                return resp.status in (200, 201, 202)

        except Exception as exc:
            logger.error(f"[SendGrid] Failed to send email to {to}: {exc}")
            return False


# -------------------------------------------------------------------
# AWS SES provider
# -------------------------------------------------------------------

class SESProvider(NotificationProvider):
    """
    Sends email via AWS SES SMTP (using smtplib).

    Required env vars:
        AWS_SES_SMTP_HOST     — e.g. email-smtp.us-east-1.amazonaws.com
        AWS_SES_SMTP_PORT     — 587 (STARTTLS) or 465 (SSL)
        AWS_SES_SMTP_USER     — SMTP username (IAM credentials)
        AWS_SES_SMTP_PASSWORD — SMTP password
        FROM_EMAIL            — verified sender address
    """

    def __init__(self):
        self.host: str = os.getenv("AWS_SES_SMTP_HOST", "")
        self.port: int = int(os.getenv("AWS_SES_SMTP_PORT", "587"))
        self.username: str = os.getenv("AWS_SES_SMTP_USER", "")
        self.password: str = os.getenv("AWS_SES_SMTP_PASSWORD", "")
        self.from_email: str = os.getenv("FROM_EMAIL", "noreply@annam.com")

        if not self.host or not self.username or not self.password:
            logger.warning("AWS SES: SMTP credentials not fully configured — notifications will be logged only")

    def send(self, to: str, subject: str, body: str, html_body: Optional[str] = None) -> bool:
        if not self.host or not self.username or not self.password:
            logger.warning(f"[SES] Not configured — skipping email to {to}")
            return False

        try:
            msg = MIMEMultipart("alternative")
            msg["Subject"] = subject
            msg["From"] = self.from_email
            msg["To"] = to

            msg.attach(MIMEText(body, "plain"))
            if html_body:
                msg.attach(MIMEText(html_body, "html"))

            if self.port == 465:
                with smtplib.SMTP_SSL(self.host, self.port) as server:
                    server.login(self.username, self.password)
                    server.sendmail(self.from_email, [to], msg.as_string())
            else:
                with smtplib.SMTP(self.host, self.port) as server:
                    server.ehlo()
                    server.starttls()
                    server.login(self.username, self.password)
                    server.sendmail(self.from_email, [to], msg.as_string())

            logger.info(f"[SES] Sent to {to}")
            return True

        except Exception as exc:
            logger.error(f"[SES] Failed to send email to {to}: {exc}")
            return False


# -------------------------------------------------------------------
# Provider registry
# -------------------------------------------------------------------

_PROVIDER_MAP: dict[str, type[NotificationProvider]] = {
    "console":  ConsoleProvider,
    "sendgrid": SendGridProvider,
    "ses":      SESProvider,
}


def _load_provider() -> NotificationProvider:
    """
    Instantiate the provider based on the EMAIL_PROVIDER env var.
    Falls back to ConsoleProvider if the value is unknown or empty.
    """
    provider_name = os.getenv("EMAIL_PROVIDER", "console").lower().strip()
    provider_cls = _PROVIDER_MAP.get(provider_name, ConsoleProvider)
    instance = provider_cls()
    logger.info(f"[NotificationService] Using provider: {provider_name} ({provider_cls.__name__})")
    return instance


# -------------------------------------------------------------------
# NotificationService — singleton facade used throughout the app
# -------------------------------------------------------------------

class NotificationService:
    """
    High-level notification facade.

    Automatically selects the configured provider and exposes a simple
    `send()` interface. All queue-related notification helpers (7.3-7.7)
    live here so the provider logic is centralised.
    """

    def __init__(self, provider: Optional[NotificationProvider] = None):
        self._provider = provider or _load_provider()

    # -------------------------------------------------------------------
    # Core send interface
    # -------------------------------------------------------------------
    def send(
        self,
        to: str,
        subject: str,
        body: str,
        html_body: Optional[str] = None,
    ) -> bool:
        """
        Send an email notification.

        Args:
            to        : recipient email address
            subject   : subject line
            body      : plain-text body
            html_body : optional HTML body

        Returns:
            True if the provider accepted the message, False otherwise.
        """
        return self._provider.send(to, subject, body, html_body)

    # -------------------------------------------------------------------
    # Phase 7.3 — notify on join_queue
    # -------------------------------------------------------------------
    def notify_joined_queue(
        self,
        candidate_email: str,
        candidate_name: str,
        position: int,
        estimated_wait_minutes: int,
        is_approximate: bool = False,
    ) -> bool:
        """
        Sent when a candidate successfully joins the queue (REQUEST → QUEUED).
        """
        label = "approx. " if is_approximate else ""
        subject = "You're in the interview queue"
        body = (
            f"Hi {candidate_name or 'there'},\n\n"
            f"You've joined the interview queue at position {position}.\n"
            f"Estimated wait: {label}{estimated_wait_minutes} minute(s).\n\n"
            f"We'll notify you again when your slot is approaching.\n"
            f"Best regards,\nAnnam Hiring Team"
        )
        return self.send(to=candidate_email, subject=subject, body=body)

    # -------------------------------------------------------------------
    # Phase 7.4 — notify when candidate reaches position 2
    # -------------------------------------------------------------------
    def notify_approaching_slot(
        self,
        candidate_email: str,
        candidate_name: str,
        position: int,
    ) -> bool:
        """
        Sent when the candidate moves to position 2 (about to be next).
        """
        subject = "Your interview slot is almost ready"
        body = (
            f"Hi {candidate_name or 'there'},\n\n"
            f"Good news — you're now #{position} in the queue and will be "
            f"next once a slot opens up.\n\n"
            f"Please stay on the page and keep an eye on your inbox — "
            f"we'll email you the moment your slot is ready to join.\n\n"
            f"Best regards,\nAnnam Hiring Team"
        )
        return self.send(to=candidate_email, subject=subject, body=body)

    # -------------------------------------------------------------------
    # Phase 7.5 — notify on mark_ready (slot is open, join now)
    # -------------------------------------------------------------------
    def notify_slot_ready(
        self,
        candidate_email: str,
        candidate_name: str,
        join_within_minutes: int = 5,
        join_url: Optional[str] = None,
    ) -> bool:
        """
        Sent when a candidate transitions QUEUED → READY (slot is open).
        The join window is tight — 5 minutes by default.
        """
        subject = "🔔 Your interview slot is ready — join now!"
        body = (
            f"Hi {candidate_name or 'there'},\n\n"
            f"Your interview slot is now open!\n\n"
            f"You have {join_within_minutes} minutes to join. "
            f"After that, your slot will be given to the next candidate in queue.\n\n"
        )
        if join_url:
            body += f"Join here: {join_url}\n\n"
        body += "Good luck!\nAnnam Hiring Team"
        return self.send(to=candidate_email, subject=subject, body=body)

    # -------------------------------------------------------------------
    # Phase 7.6 — notify on cooldown expiry
    # -------------------------------------------------------------------
    def notify_cooldown_expired(
        self,
        candidate_email: str,
        candidate_name: str,
    ) -> bool:
        """
        Sent when a candidate's cooldown period has ended and they can
        re-request a slot.
        """
        subject = "You're ready to rejoin the interview queue"
        body = (
            f"Hi {candidate_name or 'there'},\n\n"
            f"Your cooldown period has ended. You can now request "
            f"a new interview slot.\n\n"
            f"Head back to the portal and request a new slot at any time.\n\n"
            f"Best regards,\nAnnam Hiring Team"
        )
        return self.send(to=candidate_email, subject=subject, body=body)

    # -------------------------------------------------------------------
    # Phase 7.7 — notify on skip (no-show / timeout)
    # -------------------------------------------------------------------
    def notify_skipped(
        self,
        candidate_email: str,
        candidate_name: str,
        cooldown_minutes: int,
        skip_count: int,
    ) -> bool:
        """
        Sent when a candidate misses their join window and is skipped.
        Includes current skip count so they know their warning status.
        """
        subject = "You missed your interview slot"
        body = (
            f"Hi {candidate_name or 'there'},\n\n"
            f"You missed your scheduled interview slot and have been "
            f"skipped from the queue.\n\n"
            f"Skip count: {skip_count}/3\n"
            f"Cooldown: {cooldown_minutes} minutes before you can re-request.\n\n"
            f"If you believe this was a mistake or need assistance, "
            f"please contact the hiring team.\n\n"
            f"Best regards,\nAnnam Hiring Team"
        )
        return self.send(to=candidate_email, subject=subject, body=body)


# -------------------------------------------------------------------
# Module-level singleton — imported and reused across the application
# -------------------------------------------------------------------

notification_service = NotificationService()