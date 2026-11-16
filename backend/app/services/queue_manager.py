"""
Slot Manager — MongoDB-backed interview slot management.

No queue, no positions, no wait times. Just a max-concurrent threshold.
"""
import json
import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from app.db.mongodb import get_sync_db
from app.services.settings_service import get_cooldown_days, get_interview_settings

logger = logging.getLogger(__name__)

# ── Config ────────────────────────────────────────────────────────────────────
# Cached value; refreshed once when the module loads.
_MAX_CONCURRENT_INTERVIEWS: int | None = None


def _get_max_concurrent() -> int:
    global _MAX_CONCURRENT_INTERVIEWS
    if _MAX_CONCURRENT_INTERVIEWS is None:
        settings = get_interview_settings()
        _MAX_CONCURRENT_INTERVIEWS = settings.get("max_concurrent_interviews", 20)
    return _MAX_CONCURRENT_INTERVIEWS


def _reload_max_concurrent() -> None:
    """Called by the settings API after an admin updates the value."""
    global _MAX_CONCURRENT_INTERVIEWS
    settings = get_interview_settings()
    _MAX_CONCURRENT_INTERVIEWS = settings.get("max_concurrent_interviews", 20)


# Backwards-compatible alias
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
        return self._active_count < _get_max_concurrent()

    @property
    def slots_available(self) -> int:
        return max(0, _get_max_concurrent() - self._active_count)

    def _sync_active_count(self) -> None:
        db = get_sync_db()
        self._active_count = _compute_active_count(db)
        db.counters.update_one({"_id": "active_interview_count"}, {"$set": {"count": self._active_count}})

    # ── Start interview ───────────────────────────────────────────────────────

    async def start_interview(self, candidate_id: str, candidate_data: dict) -> dict:
        db = get_sync_db()
        
        # Merge candidate data from DB so we have eligible_role and other real attributes
        from bson import ObjectId
        try:
            cand = db.candidates.find_one({"_id": ObjectId(candidate_id)})
        except Exception:
            cand = db.candidates.find_one({"_id": candidate_id})
            
        if cand:
            candidate_data["eligible_role"] = cand.get("eligible_role")
            if not candidate_data.get("name"):
                candidate_data["name"] = cand.get("full_name") or cand.get("name")
            
        role = candidate_data.get("eligible_role")

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
                cooldown_days = get_cooldown_days(role)
                completed_at = latest_failed["completed_at"]
                if completed_at.tzinfo is None:
                    completed_at = completed_at.replace(tzinfo=timezone.utc)
                deadline = completed_at + timedelta(days=cooldown_days)
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
                interview_id = existing["_id"]
                current_q = None
                curr_phase = "core"
                curr_limit = 120
                curr_options = None
                curr_q_num = 1
                curr_topic = "agricultural_concepts"

                from app.workflows.interview_workflow import _interviews
                state = _interviews.get(interview_id)
                if state and getattr(state, "_pending_question", None):
                    current_q = state._pending_question.get("question")
                    curr_phase = state._pending_question.get("phase", "core")
                    curr_limit = state._pending_question.get("time_limit_seconds", 120)
                    curr_options = state._pending_question.get("options")
                    curr_topic = state._pending_question.get("topic", "agricultural_concepts")
                    curr_q_num = state.question_count + 1
                elif state and getattr(state, "messages", None):
                    for m in reversed(state.messages):
                        if m.get("role") in ("assistant", "ai"):
                            current_q = m.get("content")
                            curr_phase = m.get("phase", "core")
                            curr_options = m.get("options")
                            curr_topic = m.get("topic", "agricultural_concepts")
                            break
                    curr_q_num = state.question_count + 1

                if not current_q:
                    int_data = existing.get("interview_data", {})
                    current_q = int_data.get("first_question")

                if not current_q:
                    cand_name = (candidate_data or {}).get("name", "")
                    current_q = get_first_question(candidate_name=cand_name, attempt_number=existing.get("attempt_number", 1))

                return {
                    "result": "already_active",
                    "interview_id": interview_id,
                    "first_question": current_q,
                    "phase": curr_phase,
                    "time_limit_seconds": curr_limit,
                    "options": curr_options,
                    "question_number": curr_q_num,
                    "total_questions": 25,
                    "topic": curr_topic,
                    "image_url": None,
                }

            # 4. Slot check
            if not self.has_open_slot:
                return {
                    "result": "no_slot",
                    "message": "All slots are full, please try after sometime",
                    "active_interview_count": self._active_count,
                    "max_concurrent": _get_max_concurrent(),
                }

            # ── Create new interview ─────────────────────────────────────────
            interview_id = str(uuid.uuid4())
            now = _now()

            # Retrieve past questions & attempt number for cross-attempt deduplication
            from app.services.past_questions_service import get_candidate_attempt_info
            attempt_number, past_questions = get_candidate_attempt_info(
                db, candidate_id, current_interview_id=interview_id
            )
            logger.info(
                f"[queue_manager] Starting interview {interview_id} for candidate {candidate_id} "
                f"(Attempt #{attempt_number}, {len(past_questions)} past questions collected for deduplication)"
            )

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
                "attempt_number": attempt_number,
                "interview_data": {
                    "candidate_data": candidate_data,
                    "attempt_number": attempt_number,
                    "past_questions": past_questions,
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
                past_questions=past_questions,
                attempt_number=attempt_number,
            )

            # Get the initial messages from workflow (e.g. the first question message)
            messages = interview_graph_manager.get_conversation_history(interview_id) or []

            # Update with first_question and messages
            db.interview_sessions.update_one(
                {"_id": interview_id},
                {"$set": {
                    "interview_data": {
                        "candidate_data": candidate_data,
                        "first_question": first_question,
                        "messages": messages,
                        "attempt_number": attempt_number,
                        "past_questions": past_questions,
                    },
                    "updated_at": _now(),
                }}
            )

            self._sync_active_count()

            return {
                "result": "started",
                "interview_id": interview_id,
                "first_question": first_question,
                "phase": "core",
                "time_limit_seconds": 120,
                "options": None,
                "question_number": 1,
                "total_questions": 25,
                "topic": "agricultural_concepts",
                "image_url": None,
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
        qa_pairs = []
        interview_data = session.get("interview_data", {})
        if interview_data:
            messages = interview_data.get("messages", [])
            qa_pairs = interview_data.get("qa_pairs", [])

        resume_parsed = None
        resume = get_sync_db().resumes.find_one({"candidate_id": session["candidate_id"]})
        if resume and resume.get("parsed_data"):
            try:
                resume_parsed = json.loads(resume["parsed_data"])
            except Exception:
                pass

        past_questions = interview_data.get("past_questions", []) if interview_data else []
        attempt_number = (interview_data.get("attempt_number") if interview_data else None) or session.get("attempt_number", 1)

        state = InterviewState(
            interview_id,
            candidate_data,
            resume_parsed=resume_parsed,
            past_questions=past_questions,
            attempt_number=attempt_number,
        )
        for msg in messages:
            role = msg.get("role")
            content = msg.get("content")
            if role and content:
                state.messages.append({"role": role, "content": content, "timestamp": msg.get("timestamp", "")})
        state.status = session.get("status", "active")
        state.qa_pairs = list(qa_pairs) if qa_pairs else []
        state.question_count = len(state.qa_pairs)

        # Restore recent and pending question from messages or first_question
        for msg in messages:
            if msg.get("role") in ("assistant", "ai"):
                q_text = msg.get("content", "")
                if q_text:
                    state.add_question(q_text)
                    q_num = state.question_count + 1
                    phase = msg.get("phase") or state.get_phase(q_num)
                    topic = msg.get("topic") or state.get_topic_for_question(q_num)
                    limit = state.get_time_limit_seconds(q_num)
                    options = msg.get("options")
                    state._pending_question = {
                        "question": q_text,
                        "topic": topic,
                        "phase": phase,
                        "options": options,
                        "time_limit_seconds": limit,
                    }

        if not state._pending_question:
            first_q = (interview_data.get("first_question") or "").strip()
            if first_q:
                state.add_question(first_q)
                state._pending_question = {
                    "question": first_q,
                    "topic": state.get_topic_for_question(1),
                    "phase": "core",
                    "options": None,
                    "time_limit_seconds": 120,
                }

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
            
            try:
                state = self.workflow.get_active_interview(interview_id)
                if state and hasattr(state, 'qa_pairs') and state.qa_pairs:
                    interview_data["qa_pairs"] = state.qa_pairs
            except Exception:
                pass

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
        qa_pairs = interview_data.get("qa_pairs", [])

        next_question = await self._rehydrate_workflow(session["_id"], messages, candidate_data, qa_pairs)

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
        self, interview_id: str, messages: list, candidate_data: dict, qa_pairs: list = None
    ) -> str:
        qa_pairs = qa_pairs or []
        last_question = next(
            (m["content"] for m in reversed(messages) if m.get("role") == "assistant"),
            "Please continue from where you left off.",
        )

        from app.workflows import interview_workflow
        if interview_id in interview_workflow._interviews:
            state = interview_workflow._interviews[interview_id]
            state.messages = [m for m in messages if m.get("role") in ("user", "assistant")]
            state.qa_pairs = qa_pairs
            state.question_count = len([m for m in state.messages if m.get("role") == "user"])
        else:
            from app.workflows.interview_workflow import InterviewState
            state = InterviewState(interview_id, candidate_data, resume_parsed=None)
            state.messages = [m for m in messages if m.get("role") in ("user", "assistant")]
            state.qa_pairs = qa_pairs
            state.question_count = len([m for m in state.messages if m.get("role") == "user"])
            interview_workflow._interviews[interview_id] = state

        return last_question

    # ── Stats ─────────────────────────────────────────────────────────────────

    def get_stats(self) -> dict:
        self._sync_active_count()
        return {
            "active_interview_count": self._active_count,
            "max_concurrent": _get_max_concurrent(),
            "slots_available": max(0, _get_max_concurrent() - self._active_count),
        }


# Module-level singleton
slot_manager = SlotManager()