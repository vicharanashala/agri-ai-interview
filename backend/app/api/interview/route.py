"""
Interview API Endpoints.
"""
from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel, Field
from typing import Dict, Any, List, Optional
import uuid

from app.workflows.interview_graph import interview_graph_manager
from app.llm import llm_service
from app.workflows.interview_workflow import interview_workflow
from app.services.queue_manager import slot_manager

router = APIRouter(prefix="/api/interview", tags=["interview"])


class StartInterviewRequest(BaseModel):
    """Request to start a new interview."""
    candidate_data: Dict[str, Any]
    candidate_id: Optional[str] = None


class StartInterviewResponse(BaseModel):
    """Response after starting an interview."""
    interview_id: str = Field(alias="interviewId")
    first_question: str = Field(alias="question")
    status: str = ""
    
    class Config:
        populate_by_name = True


class MessageRequest(BaseModel):
    """Request to send a message/answer."""
    interview_id: str
    message: str


class MessageResponse(BaseModel):
    """Response after sending a message."""
    response: str
    is_complete: bool
    interview_id: str
    evaluation: Optional[Dict[str, Any]] = None
    cumulative_evaluation: Optional[Dict[str, Any]] = None
    next_difficulty: Optional[str] = None


class StatusResponse(BaseModel):
    """Response for interview status."""
    interview_id: str
    status: str
    conversation_length: int


class StatusCheckResponse(BaseModel):
    """Response for checking if any interview has been completed."""
    has_completed_interview: bool
    status: str
    message: str


@router.post("/start", response_model=StartInterviewResponse)
async def start_interview(request: StartInterviewRequest):
    """
    Start a new interview session.

    Directly starts the interview if a slot is available, or returns
    "no_slot" if all slots are in use.
    """
    try:
        candidate_id = request.candidate_id

        if not candidate_id:
            raise HTTPException(status_code=400, detail="candidate_id is required")

        result = await slot_manager.start_interview(candidate_id, request.candidate_data)

        if result["result"] == "no_slot":
            raise HTTPException(
                status_code=503,
                detail={
                    "message": result["message"],
                    "active_interview_count": result["active_interview_count"],
                    "max_concurrent": result["max_concurrent"],
                }
            )

        if result["result"] == "already_active":
            return StartInterviewResponse(
                interview_id=result["interview_id"],
                first_question="",
                status="resumed"
            )

        return StartInterviewResponse(
            interview_id=result["interview_id"],
            first_question=result["first_question"],
            status="active"
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/message", response_model=MessageResponse)
async def send_message(request: MessageRequest):
    """
    Send a message/answer in an ongoing interview.
    
    Processes the candidate's answer and returns the AI's response
    (which may include a follow-up question or completion message).
    """
    try:
        result = await interview_graph_manager.process_answer(
            interview_id=request.interview_id,
            user_answer=request.message
        )
        
        return MessageResponse(
            response=result["response"],
            is_complete=result["is_complete"],
            interview_id=request.interview_id,
            evaluation=result.get("evaluation"),
            cumulative_evaluation=result.get("cumulative_evaluation"),
            next_difficulty=result.get("cumulative_evaluation", {}).get("difficulty_level")
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/status/check", response_model=StatusCheckResponse)
async def check_interview_status():
    """
    Check if any interview has been completed.
    This endpoint checks the backend memory for any completed interview.
    """
    try:
        from app.workflows.interview_workflow import _interviews

        for interview_id, state in _interviews.items():
            if state.status == "completed":
                return StatusCheckResponse(
                    has_completed_interview=True,
                    status="completed",
                    message="An interview has already been completed"
                )
    except ImportError:
        pass

    return StatusCheckResponse(
        has_completed_interview=False,
        status="not_started",
        message="No completed interview found"
    )


@router.get("/status/{interview_id}", response_model=StatusResponse)
async def get_status(interview_id: str):
    """
    Get the current status of an interview.
    """
    status = interview_graph_manager.get_status(interview_id)

    if not status:
        raise HTTPException(status_code=404, detail="Interview not found")

    return StatusResponse(
        interview_id=interview_id,
        status=status["status"],
        conversation_length=status["messages_count"]
    )


@router.get("/history/{interview_id}")
async def get_history(interview_id: str):
    """
    Get the full conversation history for an interview.
    """
    history = interview_graph_manager.get_conversation_history(interview_id)

    if not history:
        raise HTTPException(status_code=404, detail="Interview not found")

    return {"interview_id": interview_id, "history": history}


@router.post("/end/{interview_id}")
async def end_interview(interview_id: str):
    """
    Manually end an interview session and get evaluation.
    """
    success = interview_graph_manager.end_interview(interview_id)

    if not success:
        raise HTTPException(status_code=404, detail="Interview not found")

    # Get the evaluation from langgraph
    evaluation = interview_graph_manager.get_evaluation(interview_id)

    # Free the slot
    state = interview_workflow.get_completed_interview(interview_id)
    candidate_id = state.candidate_id if state and hasattr(state, 'candidate_id') else ""
    if candidate_id:
        slot_manager.complete_interview(candidate_id, interview_id)

    return {
        "message": "Interview ended successfully",
        "interview_id": interview_id,
        "evaluation": evaluation
    }


class PauseRequest(BaseModel):
    candidate_id: str
    interview_id: str


class ResumeRequest(BaseModel):
    candidate_id: str


@router.post("/pause")
async def pause_interview(request: PauseRequest):
    """
    Save a state snapshot when a candidate's connection is interrupted.
    """
    result = await slot_manager.pause_interview(request.candidate_id, request.interview_id)
    return result


@router.post("/resume")
async def resume_interview(request: ResumeRequest):
    """
    Resume a paused interview from the saved state snapshot.
    """
    result = await slot_manager.resume_interview(request.candidate_id)
    return result


@router.delete("/reset")
async def reset_interviews():
    """
    Reset all interview sessions and clear memory state.
    This is called when the user wants to restart the interview process.
    """
    try:
        success = interview_graph_manager.clear_all()
        
        if success:
            return {
                "message": "All interview sessions cleared successfully",
                "status": "reset"
            }
        else:
            raise HTTPException(status_code=500, detail="Failed to clear interview sessions")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/reset/{interview_id}")
async def reset_specific_interview(interview_id: str):
    """
    Reset a specific interview session by interview_id.
    This is called when retaking an interview.
    """
    try:
        success = interview_graph_manager.clear_interview(interview_id)
        
        if success:
            return {
                "message": f"Interview {interview_id} cleared successfully",
                "status": "reset",
                "interview_id": interview_id
            }
        else:
            raise HTTPException(status_code=500, detail="Failed to clear interview session")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class EvaluateRequest(BaseModel):
    """Request to evaluate an interview."""
    interview_id: str
    candidate_data: Optional[Dict[str, Any]] = None
    conversation_history: Optional[List[Dict[str, Any]]] = None


class EvaluationData(BaseModel):
    """Individual metric evaluation."""
    score: int
    details: str


class EvaluateResponse(BaseModel):
    """Response with interview evaluation."""
    interview_id: str
    overall_score: int
    metrics: Dict[str, Any]
    summary: str
    strengths: list
    areas_for_improvement: list
    recommendation: str
    status: str


@router.post("/evaluate", response_model=EvaluateResponse)
async def evaluate_interview(request: EvaluateRequest):
    """
    Evaluate an interview session and return comprehensive evaluation.
    
    Uses the LLM to analyze conversation history and generate detailed evaluation.
    """
    try:
        # Get conversation history from workflow (checks both active and completed)
        messages = interview_workflow.get_conversation_history(request.interview_id)
        if not messages:
            raise HTTPException(status_code=404, detail="Interview not found or not completed")
        
        # Get candidate data from completed store (state moves there on end_interview)
        state = interview_workflow.get_completed_interview(request.interview_id)
        candidate_data = request.candidate_data or {}
        if state and hasattr(state, 'candidate_data'):
            candidate_data = state.candidate_data
        
        candidate_data = request.candidate_data or {}
        if state and hasattr(state, 'candidate_data'):
            candidate_data = state.candidate_data
        
        # Convert messages to conversation_history format (role, content)
        conversation_history = [
            {"role": m.get("role"), "content": m.get("content")}
            for m in messages
            if m.get("role") and m.get("content")
        ]
        
        # Generate evaluation via LLM
        evaluation = await llm_service.generate_interview_evaluation(
            candidate_data=candidate_data,
            conversation_history=conversation_history
        )
        
        # Build response with proper defaults
        metrics = {}
        for key, value in evaluation.get("metrics", {}).items():
            if isinstance(value, dict):
                metrics[key] = {
                    "score": value.get("score", 75),
                    "details": value.get("details", "")
                }
            else:
                metrics[key] = {"score": value, "details": ""}
        
        # Default metrics if LLM didn't provide all
        for default_metric in ["motivation", "agri_knowledge", "communication", "problem_solving"]:
            if default_metric not in metrics:
                metrics[default_metric] = {"score": 75, "details": "Metric pending"}
        
        return EvaluateResponse(
            interview_id=request.interview_id,
            overall_score=evaluation.get("overall_score", 75),
            metrics=metrics,
            summary=evaluation.get("summary", "Evaluation complete."),
            strengths=evaluation.get("strengths", []),
            areas_for_improvement=evaluation.get("areas_for_improvement", []),
            recommendation=evaluation.get("recommendation", "Consider - needs review."),
            status="evaluated"
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/evaluate/{interview_id}", response_model=EvaluateResponse)
async def get_evaluation(interview_id: str):
    """
    Retrieve evaluation for a completed interview.
    """
    try:
        messages = interview_workflow.get_conversation_history(interview_id)
        if not messages:
            raise HTTPException(status_code=404, detail="Interview not found")

        state = interview_workflow.get_completed_interview(interview_id)
        candidate_data = {}
        if state and hasattr(state, 'candidate_data'):
            candidate_data = state.candidate_data

        conversation_history = [
            {"role": m.get("role"), "content": m.get("content")}
            for m in messages
            if m.get("role") and m.get("content")
        ]

        evaluation = await llm_service.generate_interview_evaluation(
            candidate_data=candidate_data,
            conversation_history=conversation_history
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

        return EvaluateResponse(
            interview_id=interview_id,
            overall_score=evaluation.get("overall_score", 75),
            metrics=metrics,
            summary=evaluation.get("summary", "Evaluation complete."),
            strengths=evaluation.get("strengths", []),
            areas_for_improvement=evaluation.get("areas_for_improvement", []),
            recommendation=evaluation.get("recommendation", "Consider - needs review."),
            status="evaluated"
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


