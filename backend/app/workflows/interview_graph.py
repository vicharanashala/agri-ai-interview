"""
Interview Graph - Manages interview state using the simplified workflow.
"""
from typing import Dict, Any, List, Optional
from app.workflows.interview_workflow import interview_workflow


class InterviewGraphManager:
    """Manages interview sessions using the workflow."""
    
    def __init__(self):
        self.workflow = interview_workflow
    
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
    
    async def get_evaluation(self, interview_id: str) -> Optional[Dict[str, Any]]:
        """Get evaluation for a completed interview by generating it from conversation history."""
        from app.llm import llm_service

        messages = self.workflow.get_conversation_history(interview_id)
        if not messages:
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
            import logging
            logging.error(f"[InterviewGraph] Evaluation failed for {interview_id}: {e}")
            return None
    
    def clear_interview(self, interview_id: str) -> bool:
        """Clear a specific interview."""
        return True
    
    def clear_all(self) -> bool:
        """Clear all interviews."""
        return True


# Singleton instance
interview_graph_manager = InterviewGraphManager()