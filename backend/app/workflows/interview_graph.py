"""
Interview Graph - Manages interview state using the simplified workflow.
"""
import asyncio
import json
import logging
from typing import Dict, Any, List, Optional

from app.workflows.interview_workflow import interview_workflow

logger = logging.getLogger(__name__)


class InterviewGraphManager:
    """Manages interview sessions using the workflow."""

    def __init__(self):
        self.workflow = interview_workflow
        # Track evaluation state for each interview
        # interview_id -> {"status": "pending"|"ready"|"error", "evaluation": {...}|None}
        self._evaluation_status: Dict[str, Dict[str, Any]] = {}

    async def initialize_interview(
        self,
        interview_id: str,
        candidate_data: Dict[str, Any],
        resume_parsed: Optional[Dict[str, Any]] = None,
    ) -> str:
        """Start a new interview and return the first question."""
        return await self.workflow.initialize_interview(
            interview_id,
            candidate_data,
            resume_parsed=resume_parsed,
        )

    async def process_answer(self, interview_id: str, user_answer: str) -> Dict[str, Any]:
        """Process an answer and get the next question."""
        return await self.workflow.process_answer(interview_id, user_answer)

    def get_status(self, interview_id: str) -> Optional[Dict[str, Any]]:
        """Get interview status."""
        return self.workflow.get_status(interview_id)

    def get_conversation_history(self, interview_id: str) -> Optional[list]:
        """Get conversation history."""
        return self.workflow.get_conversation_history(interview_id)

    def end_interview(self, interview_id: str) -> bool:
        """End an interview."""
        return self.workflow.end_interview(interview_id)

    # ── Evaluation helpers ────────────────────────────────────────────────

    def get_evaluation_status(self, interview_id: str) -> Dict[str, Any]:
        """
        Return current evaluation state for an interview.
        Used by the polling endpoint GET /interview/evaluation/{interview_id}.
        Returns: {"status": "pending"|"ready"|"error", "evaluation": {...}|None}
        """
        return self._evaluation_status.get(interview_id, {
            "status": "pending",
            "evaluation": None,
        })

    def trigger_evaluation(self, interview_id: str) -> None:
        """
        Trigger background evaluation for a completed interview.
        Stores result (or error) in _evaluation_status so the polling endpoint can return it.
        Run as: asyncio.create_task(manager.trigger_evaluation(id))
        """
        async def _run():
            logger.info(f"[InterviewGraph] {interview_id}: background evaluation started")
            evaluation = await self._generate_evaluation(interview_id)

            # Store the result
            if evaluation:
                self._evaluation_status[interview_id] = {
                    "status": "ready",
                    "evaluation": evaluation,
                }
                logger.info(f"[InterviewGraph] {interview_id}: background evaluation complete (score={evaluation.get('overall_score')})")
            else:
                self._evaluation_status[interview_id] = {
                    "status": "error",
                    "evaluation": None,
                }
                logger.error(f"[InterviewGraph] {interview_id}: background evaluation returned None")

            # Persist to DB so it survives restarts
            self._persist_evaluation_sync(interview_id, evaluation)

        asyncio.create_task(_run())

    async def _generate_evaluation(self, interview_id: str) -> Optional[Dict[str, Any]]:
        """
        Generate evaluation via LLM. Called in background — no artificial timeout.
        If it fails, returns None (caller stores "error" status).
        """
        from app.llm import llm_service

        messages = self.workflow.get_conversation_history(interview_id)
        if not messages:
            logger.warning(f"[InterviewGraph] {interview_id}: no messages found for evaluation")
            return None

        state = self.workflow.get_completed_interview(interview_id)
        candidate_data = {}
        if state and hasattr(state, 'candidate_data'):
            candidate_data = state.candidate_data

        conversation_history = [
            {"role": m.get("role"), "content": m.get("content")}
            for m in messages
            if m.get("role") and m.get("content")
        ]

        qa_pairs: List[Dict[str, Any]] = []
        if state and hasattr(state, 'qa_pairs'):
            qa_pairs = state.qa_pairs

        try:
            evaluation = await llm_service.generate_interview_evaluation(
                candidate_data=candidate_data,
                conversation_history=conversation_history,
                qa_pairs=qa_pairs,
            )
            return evaluation
        except Exception as e:
            logger.error(f"[InterviewGraph] {interview_id}: LLM evaluation failed: {type(e).__name__}: {e}")
            return None

    def _persist_evaluation_sync(self, interview_id: str, evaluation: Optional[Dict[str, Any]]) -> None:
        """Persist evaluation to MongoDB interview_sessions — interview_data + score/result columns.

        Runs synchronously (no await needed) using the sync MongoDB driver.
        """
        try:
            from app.db.mongodb import get_sync_db
            from app.services.settings_service import get_evaluation_settings
            db = get_sync_db()
            try:
                session = db.interview_sessions.find_one({"_id": interview_id})
                if session:
                    interview_data = session.get("interview_data") or {}
                    if isinstance(interview_data, str):
                        try:
                            interview_data = json.loads(interview_data)
                        except Exception:
                            interview_data = {}
                    interview_data["evaluation"] = evaluation

                    update = {"interview_data": interview_data}

                    # Also write score + result to document root fields (used for cooldown computation)
                    if evaluation and evaluation.get("overall_score") is not None:
                        threshold = get_evaluation_settings()["pass_threshold"]
                        score = evaluation["overall_score"]
                        update["overall_score"] = score
                        update["result"] = "PASS" if score >= threshold else "FAIL"
                        logger.info(f"[InterviewGraph] {interview_id}: writing result={update['result']} score={score} (threshold={threshold})")

                    db.interview_sessions.update_one({"_id": interview_id}, {"$set": update})
                    logger.info(f"[InterviewGraph] {interview_id}: evaluation persisted to MongoDB (score={evaluation.get('overall_score') if evaluation else None})")
                else:
                    logger.warning(f"[InterviewGraph] {interview_id}: session not found in MongoDB for persistence")
            finally:
                pass
        except Exception as e:
            logger.error(f"[InterviewGraph] {interview_id}: failed to persist evaluation: {e}")

    # ── Convenience: get full evaluation (from cache, DB, or LLM) ────────

    async def get_evaluation(self, interview_id: str) -> Optional[Dict[str, Any]]:
        """
        Get evaluation — from memory cache first, then DB, then generate via LLM.
        Used as a fallback for /end (sync path). For the decoupled flow use
        trigger_evaluation + get_evaluation_status instead.
        """
        # 1. Memory cache (from background evaluation that already ran)
        cached = self._evaluation_status.get(interview_id)
        if cached and cached.get("status") == "ready" and cached.get("evaluation"):
            logger.info(f"[InterviewGraph] {interview_id}: returning cached evaluation")
            return cached["evaluation"]

        # 2. MongoDB
        try:
            from app.db.mongodb import get_sync_db
            db = get_sync_db()
            try:
                session = db.interview_sessions.find_one({"_id": interview_id})
                if session:
                    interview_data = session.get("interview_data") or {}
                    if isinstance(interview_data, str):
                        try:
                            interview_data = json.loads(interview_data)
                        except Exception:
                            interview_data = {}
                    existing = interview_data.get("evaluation")
                    if existing and existing.get("overall_score", 0) > 0:
                        logger.info(f"[InterviewGraph] {interview_id}: using cached evaluation from MongoDB")
                        return existing
            finally:
                pass
        except Exception as e:
            logger.warning(f"[InterviewGraph] {interview_id}: could not check DB: {e}")

        # 3. Generate (fallback for sync /end path)
        logger.info(f"[InterviewGraph] {interview_id}: generating evaluation synchronously")
        return await self._generate_evaluation(interview_id)

    def clear_interview(self, interview_id: str) -> bool:
        """Clear a specific interview."""
        self._evaluation_status.pop(interview_id, None)
        return True

    def clear_all(self) -> bool:
        """Clear all interviews."""
        self._evaluation_status.clear()
        return True


# Singleton instance
interview_graph_manager = InterviewGraphManager()