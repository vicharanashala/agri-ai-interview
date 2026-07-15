"""
Slot Manager — MongoDB-backed interview slot management.

No queue, no positions, no wait times. Just a max-concurrent threshold.
"""
import json
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from app.db.mongodb import get_sync_db
from app.services.settings_service import get_cooldown_days

# ── Config ────────────────────────────────────────────────────────────────────
MAX_CONCURRENT_INTERVIEWS = 20


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _compute_active_count(db) -> int:
    return db.interview_sessions.count_documents({
        "status": {"$in": ["active", "interviewing", "paused"]}
    })


# ── SlotManager ───────────────────────────────────────────────────────────────

class SlotManager:
    """
    Simple slot-based interview starter.
    """

    def __init__(self):
        db = get_sync_db()

        # Ensure singleton counter doc exists
        if db.counters.find_one({"_id": "active_interview_count"}) is None:
            db.counters.insert_one({"_id": "active_interview_count", "count": 0})

        self._active_count = _compute_active_count(db)
        db.counters.update_one({"_id": "active_interview_count"}, {"$set": {"count": self._active_count}})

    # ── Accessors ─────────────────────────────────────────────────────────────

    @property
    def active_interview_count(self) -> int:
        return self._active_count

    @property
    def has_open_slot(self) -> bool:
        return self._active_count < MAX_CONCURRENT_INTERVIEWS

    @property
    def slots_available(self) -> int:
        return max(0, MAX_CONCURRENT_INTERVIEWS - self._active_count)

    def _sync_active_count(self) -> None:
        db = get_sync_db()
        self._active_count = _compute_active_count(db)
        db.counters.update_one({"_id": "active_interview_count"}, {"$set": {"count": self._active_count}})

    # ── Start interview ───────────────────────────────────────────────────────

    async def start_interview(self, candidate_id: str, candidate_data: dict) -> dict:
        db = get_sync_db()

        try:
            # 1. Attempts check
            completed_count = db.interview_sessions.count_documents({
                "candidate_id": candidate_id,
                "status": "completed",
                "result": {"$in": ["PASS", "FAIL", "WITHDRAWN"]},
            })
            if completed_count >= 3:
                return {
                    "result": "attempts_exhausted",
                    "attempts_count": completed_count,
                    "max_attempts": 3,
                }

            # 2. Cooldown check
            latest_failed = db.interview_sessions.find_one(
                {
                    "candidate_id": candidate_id,
                    "status": "completed",
                    "result": "FAIL",
                },
                sort=[("completed_at", -1)],
            )
            if latest_failed and latest_failed.get("completed_at"):
                cooldown_days = get_cooldown_days()
                deadline = latest_failed["completed_at"] + timedelta(days=cooldown_days)
                if _now() < deadline:
                    return {
                        "result": "cooldown",
                        "message": f"You are in cooldown. Try again after {deadline.strftime('%Y-%m-%d %H:%M')} UTC.",
                        "cooldown_until": deadline.isoformat(),
                    }

            # 3. Existing active session
            existing = db.interview_sessions.find_one({
                "candidate_id": candidate_id,
                "status": {"$in": ["active", "interviewing"]},
            })
            if existing:
                self._resume_workflow_from_session(existing, candidate_data)
                return {
                    "result": "already_active",
                    "interview_id": existing["_id"],
                }

            # 4. Slot check
            if not self.has_open_slot:
                return {
                    "result": "no_slot",
                    "message": "All slots are full, please try after sometime",
                    "active_interview_count": self._active_count,
                    "max_concurrent": MAX_CONCURRENT_INTERVIEWS,
                }

            # ── Create new interview ─────────────────────────────────────────
            interview_id = str(uuid.uuid4())
            now = _now()

            resume_parsed = None
            resume = db.resumes.find_one({"candidate_id": candidate_id})
            if resume and resume.get("parsed_data"):
                try:
                    resume_parsed = json.loads(resume["parsed_data"])
                except Exception:
                    pass

            session_doc = {
                "_id": interview_id,
                "candidate_id": candidate_id,
                "started_via_queue": False,
                "status": "active",
                "result": None,
                "end_reason": None,
                "score": None,
                "current_phase": "interview",
                "interview_data": {
                    "candidate_data": candidate_data,
                },
                "started_at": now,
                "completed_at": None,
                "created_at": now,
                "updated_at": now,
            }
            db.interview_sessions.insert_one(session_doc)

            # Ensure queue entry exists
            existing_q = db.queue_entries.find_one({"candidate_id": candidate_id})
            if not existing_q:
                db.queue_entries.insert_one({
                    "_id": str(uuid.uuid4()),
                    "candidate_id": candidate_id,
                    "status": "interviewing",
                    "position": None,
                    "scheduled_at": None,
                    "joined_at": now,
                    "started_at": now,
                    "completed_at": None,
                    "cancelled_at": None,
                    "skipped_at": None,
                    "skip_count": 0,
                    "cooldown_until": None,
                    "created_at": now,
                    "updated_at": now,
                })

            # Initialize langgraph workflow
            from app.workflows.interview_graph import interview_graph_manager
            first_question = await interview_graph_manager.initialize_interview(
                interview_id=interview_id,
                candidate_data=candidate_data,
                resume_parsed=resume_parsed,
            )

            # Update with first_question
            db.interview_sessions.update_one(
                {"_id": interview_id},
                {"$set": {
                    "interview_data": {
                        "candidate_data": candidate_data,
                        "first_question": first_question,
                    },
                    "updated_at": _now(),
                }}
            )

            self._sync_active_count()

            return {
                "result": "started",
                "interview_id": interview_id,
                "first_question": first_question,
            }
        finally:
            pass

    def _resume_workflow_from_session(self, session: dict, candidate_data: dict) -> None:
        """Reconstruct in-memory workflow state from a MongoDB session doc."""
        from app.workflows.interview_workflow import _interviews, InterviewState

        interview_id = session["_id"]
        if interview_id in _interviews:
            return

        messages = []
        interview_data = session.get("interview_data", {})
        if interview_data:
            messages = interview_data.get("messages", [])

        resume_parsed = None
        resume = get_sync_db().resumes.find_one({"candidate_id": session["candidate_id"]})
        if resume and resume.get("parsed_data"):
            try:
                resume_parsed = json.loads(resume["parsed_data"])
            except Exception:
                pass

        state = InterviewState(interview_id, candidate_data, resume_parsed=resume_parsed)
        for msg in messages:
            role = msg.get("role")
            content = msg.get("content")
            if role and content:
                state.messages.append({"role": role, "content": content, "timestamp": msg.get("timestamp", "")})
        state.status = session.get("status", "active")
        _interviews[interview_id] = state

        try:
            from app.workflows.interview_graph import interview_graph_manager
            interview_graph_manager.workflow._interviews[interview_id] = state
        except Exception:
            pass

    # ── Complete interview ────────────────────────────────────────────────────

    def complete_interview(
        self,
        candidate_id: str,
        interview_id: str,
        result: Optional[str] = None,
        end_reason: Optional[str] = None,
        overall_score: Optional[float] = None,
        evaluation: Optional[dict] = None,
    ) -> dict:
        """Mark interview as completed and free the slot."""
        db = get_sync_db()
        now = _now()

        session = db.interview_sessions.find_one({"_id": interview_id, "candidate_id": candidate_id})
        if session:
            messages = []
            try:
                from app.workflows.interview_graph import interview_graph_manager
                messages = interview_graph_manager.get_conversation_history(interview_id) or []
            except Exception:
                pass

            update = {
                "status": "completed",
                "completed_at": now,
                "updated_at": now,
            }
            if result:
                update["result"] = result
            if end_reason:
                update["end_reason"] = end_reason
            if overall_score is not None:
                update["score"] = overall_score

            interview_data = dict(session.get("interview_data", {}))
            interview_data["messages"] = messages
            if evaluation:
                interview_data["evaluation"] = evaluation
            update["interview_data"] = interview_data

            db.interview_sessions.update_one({"_id": interview_id}, {"$set": update})

        self._sync_active_count()

        return {
            "result": "completed",
            "completed_at": now,
        }

    # ── Pause / Resume ────────────────────────────────────────────────────────

    async def pause_interview(self, candidate_id: str, interview_id: str) -> dict:
        db = get_sync_db()

        session = db.interview_sessions.find_one({
            "_id": interview_id,
            "candidate_id": candidate_id,
            "status": "active",
        })
        if not session:
            return {"result": "not_found"}

        history = []
        question_count = 0
        try:
            from app.workflows.interview_graph import interview_graph_manager
            history = interview_graph_manager.get_conversation_history(interview_id) or []
            status_info = interview_graph_manager.get_status(interview_id)
            question_count = (status_info or {}).get("messages_count", 0) // 2
        except Exception:
            pass

        snapshot_data = {
            "messages": history,
            "question_count": question_count,
        }

        existing = db.state_snapshots.find_one({"candidate_id": candidate_id})
        if existing:
            db.state_snapshots.update_one(
                {"candidate_id": candidate_id},
                {"$set": {
                    "queue_entry_id": session.get("queue_entry_id", ""),
                    "question_count": question_count,
                    "conversation_history": json.dumps(snapshot_data),
                }}
            )
        else:
            db.state_snapshots.insert_one({
                "_id": f"snap_{uuid.uuid4().hex[:12]}",
                "candidate_id": candidate_id,
                "queue_entry_id": session.get("queue_entry_id", ""),
                "question_count": question_count,
                "conversation_history": json.dumps(snapshot_data),
                "created_at": _now(),
            })

        db.interview_sessions.update_one(
            {"_id": interview_id},
            {"$set": {"status": "paused", "updated_at": _now()}}
        )

        return {"result": "paused", "interview_id": interview_id}

    async def resume_interview(self, candidate_id: str) -> dict:
        db = get_sync_db()

        snapshot = db.state_snapshots.find_one({"candidate_id": candidate_id})
        if not snapshot:
            return {"result": "no_snapshot"}

        session = db.interview_sessions.find_one({
            "candidate_id": candidate_id,
            "status": "paused",
        })
        if not session:
            return {"result": "session_not_paused"}

        snapshot_data = json.loads(snapshot.get("conversation_history", "{}"))
        messages = snapshot_data.get("messages", [])

        interview_data = session.get("interview_data", {})
        candidate_data = interview_data.get("candidate_data", {})

        next_question = await self._rehydrate_workflow(session["_id"], messages, candidate_data)

        db.interview_sessions.update_one(
            {"_id": session["_id"]},
            {"$set": {"status": "active", "updated_at": _now()}}
        )
        db.state_snapshots.delete_one({"_id": snapshot["_id"]})

        return {
            "result": "resumed",
            "interview_id": session["_id"],
            "next_question": next_question,
            "question_count": snapshot.get("question_count", 0),
        }

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
            state = InterviewState(interview_id, candidate_data, resume_parsed=None)
            state.messages = [m for m in messages if m.get("role") in ("user", "assistant")]
            state.question_count = len([m for m in state.messages if m.get("role") == "user"])
            interview_workflow._interviews[interview_id] = state

        return last_question

    # ── Stats ─────────────────────────────────────────────────────────────────

    def get_stats(self) -> dict:
        self._sync_active_count()
        return {
            "active_interview_count": self._active_count,
            "max_concurrent": MAX_CONCURRENT_INTERVIEWS,
            "slots_available": max(0, MAX_CONCURRENT_INTERVIEWS - self._active_count),
        }


# Module-level singleton
slot_manager = SlotManager()