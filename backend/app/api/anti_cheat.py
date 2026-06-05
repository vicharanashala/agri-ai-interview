"""
Anti-Cheat Logging API — POST /api/anti-cheat/log

Candidate-facing fire-and-forget endpoint to record anti-cheat violation events.
Called by the frontend's anti-cheat hook during live interviews.
"""
from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from typing import Optional
import uuid
import traceback

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
    Log an anti-cheat violation event to the AntiCheatEvent table.
    This is a fire-and-forget endpoint — failures are silently ignored by the frontend.
    """
    import uuid
    from app.db.database import get_db
    from app.db.models.candidate import AntiCheatEvent

    try:
        db = next(get_db())
        candidate_id = body.candidateId or session.get("candidate_id")
        event = AntiCheatEvent(
            id=str(uuid.uuid4()),
            candidateId=candidate_id,
            interviewId=body.interviewId,
            eventType=body.eventType,
            severity=body.severity,
            message=body.message,
            event_metadata=body.metadata,
        )
        db.add(event)
        db.commit()
        return {"success": True, "eventId": event.id}
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"[anti_cheat] Failed to log event: {e}")
        return {"success": False, "error": str(e)}
    finally:
        try:
            db.close()
        except Exception:
            pass