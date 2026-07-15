"""
Interview API Endpoints — MongoDB.
"""
from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel, Field
from typing import Dict, Any, List, Optional
import uuid
import json
import logging
from datetime import datetime, timezone

from app.workflows.interview_graph import interview_graph_manager
from app.llm import llm_service
from app.workflows.interview_workflow import interview_workflow
from app.services.queue_manager import slot_manager
from app.services.settings_service import get_evaluation_settings
from app.db.mongodb import get_sync_db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/interview", tags=["interview"])


# ── Request / Response models ─────────────────────────────────────────────────

class StartInterviewRequest(BaseModel):
    candidate_data: Dict[str, Any]
    candidate_id: Optional[str] = None


class EndInterviewRequest(BaseModel):
    end_reason: Optional[str] = None


class StartInterviewResponse(BaseModel):
    interview_id: str = Field(alias="interviewId")
    first_question: str = Field(alias="question")
    status: str = ""

    class Config:
        populate_by_name = True


class MessageRequest(BaseModel):
    interview_id: str
    message: str


class MessageResponse(BaseModel):
    response: str
    is_complete: bool
    interview_id: str
    end_reason: Optional[str] = None
    evaluation: Optional[Dict[str, Any]] = None
    cumulative_evaluation: Optional[Dict[str, Any]] = None
    next_difficulty: Optional[str] = None


class StatusResponse(BaseModel):
    interview_id: str
    status: str
    conversation_length: int
    time_remaining_seconds: int = 0


class StatusCheckResponse(BaseModel):
    has_completed_interview: bool
    status: str
    message: str


class EvaluateRequest(BaseModel):
    interview_id: str
    candidate_data: Optional[Dict[str, Any]] = None
    conversation_history: Optional[List[Dict[str, Any]]] = None


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_candidate_id_from_session(interview_id: str) -> str:
    db = get_sync_db()
    session = db.interview_sessions.find_one({"_id": interview_id})
    if session:
        return session.get("candidate_id", "")
    return ""


def _save_chat_to_db(interview_id: str, messages: list, end_reason: str, evaluation: dict = None):
    """Persist chat history + end_reason to MongoDB immediately."""
    db = get_sync_db()
    existing = db.interview_sessions.find_one({"_id": interview_id}) or {}

    update = {
        "status": "completed",
        "end_reason": end_reason,
        "updated_at": datetime.now(timezone.utc),
    }
    # Merge messages into interview_data.messages (don't overwrite other fields)
    interview_data = existing.get("interview_data") or {}
    if isinstance(interview_data, str):
        try:
            interview_data = json.loads(interview_data)
        except Exception:
            interview_data = {}
    interview_data["messages"] = messages
    interview_data["end_reason"] = end_reason
    if evaluation:
        interview_data["evaluation"] = evaluation

    update["interview_data"] = interview_data
    db.interview_sessions.update_one({"_id": interview_id}, {"$set": update})


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.post("/start", response_model=StartInterviewResponse)
async def start_interview(request: StartInterviewRequest):
    try:
        candidate_id = request.candidate_id
        if not candidate_id:
            raise HTTPException(status_code=400, detail="candidate_id is required")

        result = await slot_manager.start_interview(candidate_id, request.candidate_data)

        if result["result"] == "no_slot":
            raise HTTPException(status_code=503, detail={
                "message": result["message"],
                "active_interview_count": result["active_interview_count"],
                "max_concurrent": result["max_concurrent"],
            })

        if result["result"] == "attempts_exhausted":
            raise HTTPException(status_code=403, detail={
                "message": "You have exhausted all 3 interview attempts. No more interviews available.",
                "attempts_count": result["attempts_count"],
                "max_attempts": result["max_attempts"],
            })

        if result["result"] == "already_active":
            return StartInterviewResponse(
                interview_id=result["interview_id"],
                first_question="",
                status="resumed",
            )

        return StartInterviewResponse(
            interview_id=result["interview_id"],
            first_question=result["first_question"],
            status="active",
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/message", response_model=MessageResponse)
async def send_message(request: MessageRequest):
    try:
        result = await interview_graph_manager.process_answer(
            interview_id=request.interview_id,
            user_answer=request.message,
        )
        return MessageResponse(
            response=result["response"],
            is_complete=result["is_complete"],
            interview_id=request.interview_id,
            end_reason=result.get("end_reason"),
            evaluation=result.get("evaluation"),
            cumulative_evaluation=result.get("cumulative_evaluation"),
            next_difficulty=result.get("cumulative_evaluation", {}).get("difficulty_level"),
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/status/check", response_model=StatusCheckResponse)
async def check_interview_status(candidate_id: Optional[str] = None):
    if candidate_id:
        db = get_sync_db()
        session = db.interview_sessions.find_one({
            "candidate_id": candidate_id,
            "status": "completed",
            "result": "PASS",
        })
        if session:
            return StatusCheckResponse(
                has_completed_interview=True,
                status="completed",
                message="An interview has already been completed",
            )

    return StatusCheckResponse(
        has_completed_interview=False,
        status="not_started",
        message="No completed interview found",
    )


@router.get("/status/{interview_id}", response_model=StatusResponse)
async def get_status(interview_id: str):
    status = interview_graph_manager.get_status(interview_id)
    if not status:
        raise HTTPException(status_code=404, detail="Interview not found")

    return StatusResponse(
        interview_id=interview_id,
        status=status["status"],
        conversation_length=status["messages_count"],
        time_remaining_seconds=status.get("time_remaining_seconds", 0),
    )


@router.get("/history/{interview_id}")
async def get_history(interview_id: str):
    history = interview_graph_manager.get_conversation_history(interview_id)
    if not history:
        raise HTTPException(status_code=404, detail="Interview not found")
    return {"interview_id": interview_id, "history": history}


@router.post("/end/{interview_id}")
async def end_interview(interview_id: str, request: Optional[EndInterviewRequest] = None):
    end_reason = (request.end_reason or "time_limit") if request else "time_limit"

    # 1. Mark interview ended in workflow
    interview_graph_manager.end_interview(interview_id)

    # 2. Persist chat to MongoDB NOW
    messages = interview_graph_manager.get_conversation_history(interview_id) or []
    _save_chat_to_db(interview_id, messages, end_reason)

    # 3. Trigger background LLM evaluation
    interview_graph_manager.trigger_evaluation(interview_id)

    logger.info(f"[end] {interview_id}: chat saved to DB, background evaluation started")
    return {"message": "Interview ended", "interview_id": interview_id}


class PauseRequest(BaseModel):
    candidate_id: str
    interview_id: str


class ResumeRequest(BaseModel):
    candidate_id: str


@router.post("/pause")
async def pause_interview(request: PauseRequest):
    result = await slot_manager.pause_interview(request.candidate_id, request.interview_id)
    return result


@router.post("/resume")
async def resume_interview(request: ResumeRequest):
    result = await slot_manager.resume_interview(request.candidate_id)
    return result


@router.delete("/reset")
async def reset_interviews():
    try:
        success = interview_graph_manager.clear_all()
        if success:
            return {"message": "All interview sessions cleared successfully", "status": "reset"}
        else:
            raise HTTPException(status_code=500, detail="Failed to clear interview sessions")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/reset/{interview_id}")
async def reset_specific_interview(interview_id: str):
    try:
        success = interview_graph_manager.clear_interview(interview_id)
        if success:
            return {"message": f"Interview {interview_id} cleared successfully", "status": "reset", "interview_id": interview_id}
        else:
            raise HTTPException(status_code=500, detail="Failed to clear interview session")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class EvaluationData(BaseModel):
    score: int
    details: str


class EvaluateResponse(BaseModel):
    interview_id: str
    overall_score: int
    result: str
    metrics: Dict[str, Any]
    topic_scores: Dict[str, Any]
    summary: str
    strengths: list
    areas_for_improvement: list
    recommendation: str
    status: str


async def _build_evaluate_response(interview_id: str, candidate_data: dict, qa_pairs: List[Dict[str, Any]], messages: list) -> EvaluateResponse:
    conversation_history = [
        {"role": m.get("role"), "content": m.get("content")}
        for m in messages
        if m.get("role") and m.get("content")
    ]

    evaluation = await llm_service.generate_interview_evaluation(
        candidate_data=candidate_data,
        conversation_history=conversation_history,
        qa_pairs=qa_pairs,
    )

    metrics = {}
    for key, value in evaluation.get("metrics", {}).items():
        if isinstance(value, dict):
            metrics[key] = {"score": value.get("score", 75), "details": value.get("details", "")}
        else:
            metrics[key] = {"score": value, "details": ""}

    for default_metric in ["motivation", "agri_knowledge", "communication", "problem_solving"]:
        if default_metric not in metrics:
            metrics[default_metric] = {"score": 75, "details": "Metric pending"}

    threshold = get_evaluation_settings()["pass_threshold"]
    overall_score = evaluation.get("overall_score", 75)
    result = "PASS" if overall_score >= threshold else "FAIL"

    return EvaluateResponse(
        interview_id=interview_id,
        overall_score=overall_score,
        result=result,
        metrics=metrics,
        topic_scores=evaluation.get("topic_scores", {}),
        summary=evaluation.get("summary", "Evaluation complete."),
        strengths=evaluation.get("strengths", []),
        areas_for_improvement=evaluation.get("areas_for_improvement", []),
        recommendation=evaluation.get("recommendation", "Consider — needs review."),
        status="evaluated",
    )


@router.post("/evaluate", response_model=EvaluateResponse)
async def evaluate_interview(request: EvaluateRequest):
    try:
        messages = interview_workflow.get_conversation_history(request.interview_id)
        if not messages:
            raise HTTPException(status_code=404, detail="Interview not found or not completed")

        state = interview_workflow.get_completed_interview(request.interview_id)
        candidate_data = request.candidate_data or {}
        if state and hasattr(state, "candidate_data"):
            candidate_data = state.candidate_data

        qa_pairs: List[Dict[str, Any]] = []
        if state and hasattr(state, "qa_pairs"):
            qa_pairs = state.qa_pairs

        return await _build_evaluate_response(request.interview_id, candidate_data, qa_pairs, messages)

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/evaluate/{interview_id}", response_model=EvaluateResponse)
async def get_evaluation(interview_id: str):
    try:
        messages = interview_workflow.get_conversation_history(interview_id)
        if not messages:
            raise HTTPException(status_code=404, detail="Interview not found")

        state = interview_workflow.get_completed_interview(interview_id)
        candidate_data = {}
        if state and hasattr(state, "candidate_data"):
            candidate_data = state.candidate_data

        qa_pairs: List[Dict[str, Any]] = []
        if state and hasattr(state, "qa_pairs"):
            qa_pairs = state.qa_pairs

        return await _build_evaluate_response(interview_id, candidate_data, qa_pairs, messages)

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/evaluation/{interview_id}")
async def get_interview_evaluation(interview_id: str):
    """
    Poll for evaluation results. Reads directly from MongoDB — no in-memory cache.
    Returns: pending | ready | error
    """
    db = get_sync_db()
    session = db.interview_sessions.find_one({"_id": interview_id})
    if not session:
        return {"status": "error", "result": None, "overall_score": None, "evaluation": None}

    interview_data = session.get("interview_data") or {}
    if isinstance(interview_data, str):
        try:
            interview_data = json.loads(interview_data)
        except Exception:
            interview_data = {}

    evaluation = interview_data.get("evaluation")
    end_reason_db = interview_data.get("end_reason")
    score = session.get("overall_score")

    if evaluation and score is not None:
        threshold = get_evaluation_settings()["pass_threshold"]
        result = session.get("result") or ("PASS" if score >= threshold else "FAIL")
        logger.info(f"[evaluation/{interview_id}] status=ready, score={score}, result={result}")
        return {
            "status": "ready",
            "result": result,
            "overall_score": score,
            "end_reason": end_reason_db,
            "evaluation": evaluation,
        }

    return {"status": "pending", "result": None, "overall_score": None, "evaluation": None}