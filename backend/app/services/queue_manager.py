"""
Slot Manager — simplified interview slot management.

No queue, no positions, no wait times. Just a max-concurrent threshold.

When a candidate requests an interview:
  - If active_interviews < MAX_CONCURRENT → start immediately
  - Otherwise → reject with "All slots are full, please try after sometime"
"""

import json
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional, Tuple

from sqlalchemy.orm import Session

from app.db.database import SessionLocal
from app.db.models.candidate import ActiveInterviewCount, InterviewSession

# -------------------------------------------------------------------
# Config
# -------------------------------------------------------------------
MAX_CONCURRENT_INTERVIEWS = 10


# -------------------------------------------------------------------
# Helpers
# -------------------------------------------------------------------

def _get_db() -> Session:
    db = SessionLocal()
    try:
        return db
    except Exception:
        db.close()
        raise


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _compute_active_count(db: Session) -> int:
    return int(
        db.query(InterviewSession)
        .filter(InterviewSession.status.in_(["active", "interviewing", "paused"]))
        .count()
    )


class SlotManager:
    """
    Simple slot-based interview starter.

    No queue — candidates either get a slot immediately or are told to try later.
    """

    def __init__(self):
        db = _get_db()
        try:
            stats = db.query(ActiveInterviewCount).filter_by(id="singleton").first()
            if not stats:
                stats = ActiveInterviewCount(id="singleton", count=0)
                db.add(stats)
                db.commit()

            self._active_count = _compute_active_count(db)
            stats.count = self._active_count
            db.commit()
        finally:
            db.close()

    # -------------------------------------------------------------------
    # Accessors
    # -------------------------------------------------------------------

    @property
    def active_interview_count(self) -> int:
        return self._active_count

    @property
    def has_open_slot(self) -> bool:
        return self._active_count < MAX_CONCURRENT_INTERVIEWS

    @property
    def slots_available(self) -> int:
        return max(0, MAX_CONCURRENT_INTERVIEWS - self._active_count)

    # -------------------------------------------------------------------
    # Persistence helpers
    # -------------------------------------------------------------------

    def _sync_active_count(self, db: Session) -> None:
        self._active_count = _compute_active_count(db)

    def _resume_workflow_from_session(
        self, session: "InterviewSession", candidate_data: dict
    ) -> None:
        """
        Reconstruct in-memory workflow state from a DB InterviewSession record
        and load it into _interviews so the /message endpoint can route to it.

        Called when a candidate tries to start but already has an active session
        in the DB (e.g. after a backend container restart).
        """
        from app.workflows.interview_workflow import (
            interview_workflow,
            _interviews,
            InterviewState,
        )
        import json

        interview_id = session.id

        # Skip if already loaded in memory
        if interview_id in _interviews:
            return

        # Parse stored messages from interviewData or InterviewStateSnapshot
        messages = []
        interview_data_raw = session.interviewData
        if interview_data_raw:
            try:
                data = json.loads(interview_data_raw)
                messages = data.get("messages", [])
            except Exception:
                pass

        # Also try InterviewStateSnapshot if available
        if not messages:
            try:
                db = _get_db()
                try:
                    from app.db.models.interview_session import InterviewStateSnapshot
                    snap = (
                        db.query(InterviewStateSnapshot)
                        .filter(InterviewStateSnapshot.interviewId == interview_id)
                        .first()
                    )
                    if snap:
                        try:
                            snap_data = json.loads(snap.stateJson)
                            messages = snap_data.get("messages", [])
                        except Exception:
                            pass
                finally:
                    db.close()
            except Exception:
                pass

        # Build the InterviewState and add to _interviews
        state = InterviewState(interview_id, candidate_data)
        for msg in messages:
            role = msg.get("role")
            content = msg.get("content")
            if role and content:
                state.messages.append({"role": role, "content": content, "timestamp": msg.get("timestamp", "")})
        state.status = session.status or "active"
        _interviews[interview_id] = state

        # Also push through interview_graph_manager for consistency
        from app.workflows.interview_graph import interview_graph_manager
        try:
            interview_graph_manager.workflow._interviews[interview_id] = state
        except Exception:
            pass
        stats = db.query(ActiveInterviewCount).filter_by(id="singleton").first()
        if stats:
            stats.count = self._active_count
            stats.updatedAt = _now()
        # Caller is responsible for db.commit()

    # -------------------------------------------------------------------
    # Start interview
    # -------------------------------------------------------------------

    async def start_interview(self, candidate_id: str, candidate_data: dict) -> dict:
        """
        Start an interview if a slot is available.

        Returns:
            no_slot    — all slots are currently in use
            started    — interview started, returns interview_id + first_question
            already_active — candidate already has an active session
        """
        db = _get_db()
        try:
            # Check for existing active session for this candidate
            existing_session = (
                db.query(InterviewSession)
                .filter(
                    InterviewSession.candidateId == candidate_id,
                    InterviewSession.status.in_(["active", "interviewing"]),
                )
                .first()
            )
            if existing_session:
                # Rehydrate the in-memory workflow state from the DB session
                # so subsequent /message calls can find the interview in _interviews
                interview_data = {}
                if existing_session.interviewData:
                    try:
                        interview_data = json.loads(existing_session.interviewData)
                    except Exception:
                        pass

                candidate_data = interview_data.get("candidate_data", {})
                self._resume_workflow_from_session(existing_session, candidate_data)

                return {
                    "result": "already_active",
                    "interview_id": existing_session.id,
                }

            # Check if any slot is available
            if not self.has_open_slot:
                return {
                    "result": "no_slot",
                    "message": "All slots are full, please try after sometime",
                    "active_interview_count": self._active_count,
                    "max_concurrent": MAX_CONCURRENT_INTERVIEWS,
                }

            # Create new InterviewSession
            interview_id = str(uuid.uuid4())
            now = _now()

            session = InterviewSession(
                id=interview_id,
                candidateId=candidate_id,
                startedViaQueue=False,
                status="active",
                startedAt=now,
                interviewData=json.dumps({"candidate_data": candidate_data}),
            )
            db.add(session)
            db.commit()

            # Initialize langgraph workflow
            from app.workflows.interview_graph import interview_graph_manager

            first_question = await interview_graph_manager.initialize_interview(
                interview_id=interview_id,
                candidate_data=candidate_data,
            )

            self._sync_active_count(db)
            db.commit()

            return {
                "result": "started",
                "interview_id": interview_id,
                "first_question": first_question,
            }
        finally:
            db.close()

    # -------------------------------------------------------------------
    # Complete interview
    # -------------------------------------------------------------------

    def complete_interview(self, candidate_id: str, interview_id: str) -> dict:
        """
        Mark an interview as completed and free the slot.
        """
        db = _get_db()
        try:
            session = (
                db.query(InterviewSession)
                .filter(
                    InterviewSession.id == interview_id,
                    InterviewSession.candidateId == candidate_id,
                )
                .first()
            )
            if session:
                session.status = "completed"
                session.completedAt = _now()

            db.commit()
            self._sync_active_count(db)
            db.commit()

            return {
                "result": "completed",
                "completed_at": session.completedAt if session else None,
            }
        finally:
            db.close()

    # -------------------------------------------------------------------
    # Pause interview
    # -------------------------------------------------------------------

    async def pause_interview(self, candidate_id: str, interview_id: str) -> dict:
        """
        Pause an active interview (connection interrupted).
        """
        db = _get_db()
        try:
            session = (
                db.query(InterviewSession)
                .filter(
                    InterviewSession.id == interview_id,
                    InterviewSession.candidateId == candidate_id,
                    InterviewSession.status == "active",
                )
                .first()
            )
            if not session:
                return {"result": "not_found"}

            session.status = "paused"

            from app.workflows.interview_graph import interview_graph_manager
            history = interview_graph_manager.get_conversation_history(interview_id)
            status_info = interview_graph_manager.get_status(interview_id)
            question_count = (status_info or {}).get("messages_count", 0) // 2

            import uuid as uuid_mod
            from app.db.models.candidate import InterviewStateSnapshot

            snapshot_data = json.dumps({
                "messages": history or [],
                "question_count": question_count,
            })

            existing_snapshot = (
                db.query(InterviewStateSnapshot)
                .filter(InterviewStateSnapshot.candidateId == candidate_id)
                .first()
            )
            if existing_snapshot:
                existing_snapshot.conversationHistory = snapshot_data
                existing_snapshot.questionCount = question_count
            else:
                snapshot = InterviewStateSnapshot(
                    id=f"snap_{uuid_mod.uuid4().hex[:12]}",
                    candidateId=candidate_id,
                    queueEntryId=session.queueEntryId or "",
                    questionCount=question_count,
                    conversationHistory=snapshot_data,
                )
                db.add(snapshot)

            db.commit()

            return {"result": "paused", "interview_id": interview_id}
        finally:
            db.close()

    # -------------------------------------------------------------------
    # Resume interview
    # -------------------------------------------------------------------

    async def resume_interview(self, candidate_id: str) -> dict:
        """
        Resume a paused interview from the saved snapshot.
        """
        db = _get_db()
        try:
            snapshot = (
                db.query(InterviewStateSnapshot)
                .filter(InterviewStateSnapshot.candidateId == candidate_id)
                .first()
            )
            if not snapshot:
                return {"result": "no_snapshot"}

            session = (
                db.query(InterviewSession)
                .filter(
                    InterviewSession.candidateId == candidate_id,
                    InterviewSession.status == "paused",
                )
                .first()
            )
            if not session:
                return {"result": "session_not_paused"}

            snapshot_data = json.loads(snapshot.conversationHistory or "{}")
            messages = snapshot_data.get("messages", [])

            session_data = {}
            if session.interviewData:
                session_data = json.loads(session.interviewData)
            candidate_data = session_data.get("candidate_data", {})

            next_question = await self._rehydrate_workflow(session.id, messages, candidate_data)

            session.status = "active"
            db.delete(snapshot)
            db.commit()

            return {
                "result": "resumed",
                "interview_id": session.id,
                "next_question": next_question,
                "question_count": snapshot.questionCount,
            }
        finally:
            db.close()

    async def _rehydrate_workflow(
        self, interview_id: str, messages: list, candidate_data: dict
    ) -> str:
        last_question = next(
            (m["content"] for m in reversed(messages) if m.get("role") == "assistant"),
            "Please continue from where you left off.",
        )

        from app.workflows import interview_workflow
        if interview_id in interview_workflow._interviews:
            state = interview_workflow._interviews[interview_id]
            state.messages = [m for m in messages if m.get("role") in ("user", "assistant")]
            state.question_count = len([m for m in state.messages if m.get("role") == "user"])
        else:
            from app.workflows.interview_workflow import InterviewState
            state = InterviewState(interview_id, candidate_data)
            state.messages = [m for m in messages if m.get("role") in ("user", "assistant")]
            state.question_count = len([m for m in state.messages if m.get("role") == "user"])
            interview_workflow._interviews[interview_id] = state

        return last_question

    # -------------------------------------------------------------------
    # Stats
    # -------------------------------------------------------------------

    def get_stats(self) -> dict:
        """
        Return current slot stats. Always re-derives from DB.
        """
        db = _get_db()
        try:
            active_count = _compute_active_count(db)
            self._active_count = active_count
            return {
                "active_interview_count": active_count,
                "max_concurrent": MAX_CONCURRENT_INTERVIEWS,
                "slots_available": max(0, MAX_CONCURRENT_INTERVIEWS - active_count),
            }
        finally:
            db.close()


# Module-level singleton
slot_manager = SlotManager()