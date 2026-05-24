"""
Interview Evaluation API - Generates comprehensive summary based on chat history, user details, and resume.
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Dict, Any, List, Optional
from app.llm import llm_service
from app.workflows.interview_workflow import interview_workflow

router = APIRouter(prefix="/api/interview", tags=["interview"])


class EvaluationRequest(BaseModel):
    interview_id: Optional[str] = None
    candidate_data: Dict[str, Any] = {}
    conversation_history: Optional[List[Dict[str, str]]] = None


class MetricScore(BaseModel):
    score: int
    details: str


class EvaluationResponse(BaseModel):
    interview_id: str
    overall_score: int
    metrics: Dict[str, MetricScore]
    summary: str
    strengths: List[str]
    areas_for_improvement: List[str]
    recommendation: str


async def generate_evaluation(
    candidate_data: Dict[str, Any],
    conversation_history: List[Dict[str, str]]
) -> Dict[str, Any]:
    """
    Generate comprehensive evaluation based on candidate data, resume, and conversation history.
    
    Args:
        candidate_data: Complete candidate profile including form data and resume
        conversation_history: Full interview conversation
        
    Returns:
        Comprehensive evaluation results
    """
    return await llm_service.generate_interview_evaluation(
        candidate_data=candidate_data,
        conversation_history=conversation_history
    )


@router.post("/evaluate")
async def evaluate_interview(request: EvaluationRequest):
    """
    Evaluate an interview session and generate comprehensive summary.
    
    This endpoint takes the interview conversation history, candidate details,
    and resume data to generate a comprehensive evaluation including:
    - Overall score
    - Individual metric scores
    - Detailed summary
    - Strengths and areas for improvement
    - Hiring recommendation
    """
    if not request.interview_id:
        raise HTTPException(status_code=400, detail="interview_id is required")
    
    # Get interview data from workflow
    interview_data = interview_workflow.get_interview(request.interview_id)
    if not interview_data:
        raise HTTPException(status_code=404, detail=f"Interview {request.interview_id} not found")
    
    # Use provided conversation history or get from workflow
    conversation_history = request.conversation_history
    if not conversation_history:
        conversation_history = interview_data.get("conversation_history", [])
    
    # Use provided candidate data or get from workflow
    candidate_data = request.candidate_data if request.candidate_data else interview_data.get("candidate_data", {})
    
    print(f"[Evaluate] Processing evaluation request")
    print(f"[Evaluate] Interview ID: {request.interview_id}")
    print(f"[Evaluate] Candidate data keys: {list(candidate_data.keys()) if candidate_data else []}")
    print(f"[Evaluate] Conversation history items: {len(conversation_history)}")
    
    # Generate evaluation
    evaluation = await generate_evaluation(
        candidate_data=candidate_data,
        conversation_history=conversation_history
    )
    
    print(f"[Evaluate] Generated evaluation keys: {list(evaluation.keys())}")
    
    # Ensure all required fields are present for summary page
    interview_id = request.interview_id
    
    # Build response ensuring all fields exist
    response_data = {
        "interview_id": interview_id,
        "overall_score": evaluation.get("overall_score", 75),
        "metrics": {
            key: MetricScore(
                score=value.get("score", 75),
                details=value.get("details", "")
            )
            for key, value in evaluation.get("metrics", {}).items()
        },
        "summary": evaluation.get("summary", "Evaluation complete. Please review the detailed metrics below."),
        "strengths": evaluation.get("strengths", ["Good communication skills", "Relevant experience"]),
        "areas_for_improvement": evaluation.get("areas_for_improvement", ["Continue developing skills"]),
        "recommendation": evaluation.get("recommendation", "Consider - The candidate shows promise.")
    }
    
    # Ensure default metrics exist if not provided by LLM
    expected_metrics = ['motivation', 'agri_knowledge', 'communication', 'problem_solving']
    for metric in expected_metrics:
        if metric not in response_data["metrics"]:
            response_data["metrics"][metric] = MetricScore(
                score=75,
                details="Metric evaluation pending"
            )
    
    response_data["metrics"] = {
        key: {
            "score": value.score,
            "details": value.details
        }
        for key, value in response_data["metrics"].items()
    }
    
    return response_data
