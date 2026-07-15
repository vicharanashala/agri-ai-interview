"""
Slot Monitor — MongoDB cleanup job for stale paused sessions.
"""
import logging
from datetime import datetime, timedelta, timezone

from app.db.mongodb import get_sync_db
from app.services.queue_manager import slot_manager

logger = logging.getLogger(__name__)

STALE_PAUSED_HOURS = 24
BATCH_SIZE = 50


def run_slot_monitor() -> dict:
    """
    Expire stale paused sessions and free their slots.
    """
    db = get_sync_db()
    stats = {"checked": 0, "expired": 0, "snapshots_cleared": 0, "errors": 0}

    try:
        stale_threshold = datetime.now(timezone.utc) - timedelta(hours=STALE_PAUSED_HOURS)

        cursor = db.interview_sessions.find({
            "status": "paused",
            "updated_at": {"$lt": stale_threshold},
        }).limit(BATCH_SIZE)

        for session in cursor:
            stats["checked"] += 1
            candidate_id = session.get("candidate_id")
            session_id = str(session["_id"])

            try:
                # Clear snapshots for this candidate
                snap_result = db.state_snapshots.delete_many({"candidate_id": candidate_id})
                stats["snapshots_cleared"] += snap_result.deleted_count

                # Mark session as expired
                db.interview_sessions.update_one(
                    {"_id": session["_id"]},
                    {"$set": {"status": "cancelled_expired", "completed_at": datetime.now(timezone.utc), "updated_at": datetime.now(timezone.utc)}},
                )

                slot_manager._sync_active_count(db)

                logger.info(
                    "[slot_monitor] expired stale PAUSED candidate_id=%s session_id=%s",
                    candidate_id, session_id,
                )
                stats["expired"] += 1

            except Exception as e:
                logger.error(
                    "[slot_monitor] error expiring paused session candidate_id=%s: %s",
                    candidate_id, str(e),
                )
                stats["errors"] += 1

    except Exception as e:
        logger.error("[slot_monitor] run_slot_monitor error: %s", e)

    logger.info("[slot_monitor] run_slot_monitor stats=%s", stats)
    return stats