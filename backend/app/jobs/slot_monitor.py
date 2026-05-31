"""
Slot Monitor — simplified cleanup job.

Periodically cleans up abandoned paused sessions.
No queue logic — just free slots when sessions are abandoned.
"""

import logging
from datetime import datetime, timedelta, timezone

from app.db.database import SessionLocal
from app.db.models.candidate import InterviewStateSnapshot, InterviewSession
from app.services.queue_manager import slot_manager

logger = logging.getLogger(__name__)

STALE_PAUSED_HOURS = 24
BATCH_SIZE = 50


def run_slot_monitor() -> dict:
    """
    Expire stale paused sessions and free their slots.
    """
    db = SessionLocal()
    stats = {"checked": 0, "expired": 0, "snapshots_cleared": 0, "errors": 0}

    try:
        now = datetime.now(timezone.utc)
        stale_threshold = now - timedelta(hours=STALE_PAUSED_HOURS)

        stale_sessions = (
            db.query(InterviewSession)
            .filter(
                InterviewSession.status == "paused",
                InterviewSession.updatedAt < stale_threshold,
            )
            .limit(BATCH_SIZE)
            .all()
        )

        stats["checked"] = len(stale_sessions)

        for session in stale_sessions:
            try:
                candidate_id = session.candidateId

                # Clear snapshot
                snapshot = (
                    db.query(InterviewStateSnapshot)
                    .filter(InterviewStateSnapshot.candidateId == candidate_id)
                    .first()
                )
                if snapshot:
                    db.delete(snapshot)
                    stats["snapshots_cleared"] += 1

                # Mark session as expired
                session.status = "cancelled_expired"
                session.completedAt = now

                db.commit()
                slot_manager._sync_active_count(db)
                db.commit()

                logger.info(
                    "[slot_monitor] expired stale PAUSED candidate_id=%s session_id=%s",
                    candidate_id,
                    session.id,
                )
                stats["expired"] += 1

            except Exception as e:
                logger.error(
                    "[slot_monitor] error expiring paused session candidate_id=%s: %s",
                    session.candidateId,
                    str(e),
                )
                stats["errors"] += 1
                db.rollback()

    finally:
        db.close()

    logger.info("[slot_monitor] run_slot_monitor stats=%s", stats)
    return stats