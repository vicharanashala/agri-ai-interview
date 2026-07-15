"""
Anti-Cheat Logging API — POST /api/anti-cheat/log — MongoDB.
"""
from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from typing import Optional
import uuid
import traceback
from datetime import datetime, timezone

from app.db.mongodb import get_sync_db
from app.middleware.candidate_auth import get_candidate_session

router = APIRouter(prefix="/api/anti-cheat", tags=["anti-cheat"])


class AntiCheatLogRequest(BaseModel):
    candidateId: Optional[str] = None
    interviewId: Optional[str] = None
    eventType: str
    severity: str = "warning"
    message: Optional[str] = None
    metadata: Optional[str] = None


@router.post("/log", status_code=201)
async def log_anti_cheat_event(
    body: AntiCheatLogRequest,
    session: dict = Depends(get_candidate_session),
):
    """
    Log an anti-cheat violation event to MongoDB anti_cheat_events collection.
    Fire-and-forget — failures are silently ignored by the frontend.
    """
    try:
        candidate_id = body.candidateId or session.get("candidate_id")
        event_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc)

        db = get_sync_db()
        db.anti_cheat_events.insert_one({
            "_id": event_id,
            "candidate_id": candidate_id,
            "interview_id": body.interviewId,
            "event_type": body.eventType,
            "severity": body.severity,
            "message": body.message,
            "metadata": body.metadata,
            "created_at": now,
        })
        return {"success": True, "eventId": event_id}
    except Exception as e:
        traceback.print_exc()
        print(f"[anti_cheat] Failed to log event: {e}")
        return {"success": False, "error": str(e)}