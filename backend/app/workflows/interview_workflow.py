"""
Interview Workflow - Simple conversational interview without real-time evaluation.
"""
from typing import Dict, Any, List, Optional
from datetime import datetime

from app.llm.service import llm_service


class InterviewState:
    """Manages the state of an ongoing interview session."""
    
    def __init__(self, interview_id: str, candidate_data: Dict[str, Any]):
        self.interview_id = interview_id
        self.candidate_data = candidate_data
        self.messages: List[Dict[str, Any]] = []  # conversation history
        self.question_count = 0
        self.max_questions = 10
        self.status = "active"
        self.created_at = datetime.now()
    
    def add_message(self, role: str, content: str):
        """Add a message to the conversation history."""
        self.messages.append({
            "role": role,
            "content": content,
            "timestamp": datetime.now().isoformat()
        })
    
    def get_conversation_context(self) -> str:
        """Build conversation context for generating next question."""
        context = []
        for msg in self.messages:
            if msg.get("role") == "user":
                context.append(f"CANDIDATE: {msg['content']}")
            elif msg.get("role") == "assistant":
                context.append(f"INTERVIEWER: {msg['content']}")
        return "\n\n".join(context)
    
    def is_complete(self) -> bool:
        """Check if interview should end."""
        return self.question_count >= self.max_questions


# Global state storage
_interviews: Dict[str, InterviewState] = {}


class InterviewWorkflow:
    """Main interview workflow orchestrator."""
    
    async def initialize_interview(self, interview_id: str, candidate_data: Dict[str, Any]) -> str:
        """Initialize a new interview and return the first question."""
        state = InterviewState(interview_id, candidate_data)
        _interviews[interview_id] = state
        
        # Fixed first question
        first_question = "Hi, Welcome to the Interview. Please tell me about yourself"
        
        # Store the first question
        state.add_message("assistant", first_question)
        
        return first_question
    
    async def process_answer(self, interview_id: str, user_answer: str) -> Dict[str, Any]:
        """Process a candidate's answer and return the next question."""
        state = _interviews.get(interview_id)
        if not state:
            raise ValueError(f"Interview {interview_id} not found")
        
        # Add the user's answer to history
        state.add_message("user", user_answer)
        state.question_count += 1
        
        # Check if interview is complete
        if state.is_complete():
            state.status = "completed"
            return {
                "response": "Thank you for completing the interview. Your responses have been recorded.",
                "is_complete": True,
                "messages": state.messages
            }
        
        # Generate next question using LLM with candidate data and conversation
        next_question = await self._generate_next_question(state)
        
        # Store the next question
        state.add_message("assistant", next_question)
        
        return {
            "response": next_question,
            "is_complete": False,
            "messages": state.messages
        }
    
    async def _generate_next_question(self, state: InterviewState) -> str:
        """Generate the next interview question using LLM."""
        
        # Build the prompt with candidate data and conversation history
        candidate_data = state.candidate_data
        
        # Get question guidelines
        guidelines = self._get_question_guidelines()
        
        # Build conversation history
        conversation = state.get_conversation_context()
        
        prompt = f"""
You are conducting an interview. Based on the candidate's response, generate the next relevant interview question.

CANDIDATE INFORMATION:
- Name: {candidate_data.get('name', 'Unknown')}
- Position: {candidate_data.get('position', 'Not specified')}
- Experience: {candidate_data.get('experience', 'Not specified')}
- Skills: {candidate_data.get('skills', 'Not specified')}
- Resume: {candidate_data.get('resume_text', 'No resume available')}

CONVERSATION HISTORY:
{conversation}

{guidelines}

Generate a single, focused interview question that:
1. Builds on what the candidate just said
2. Is relevant to their background and the position
3. Helps assess their qualifications

Return ONLY the question, nothing else.
"""
        
        try:
            question = await llm_service.generate_text(prompt, max_tokens=300)
            return question.strip()
        except Exception as e:
            print(f"Question generation error: {e}")
            return "Can you tell me more about your experience with the key requirements of this role?"
    
    def _get_question_guidelines(self) -> str:
        """Get question generation guidelines."""
        return """
QUESTION GUIDELINES:
- Questions should be relevant to the position and candidate's background
- Vary question types: behavioral, technical, situational
- Focus on understanding their experience, problem-solving, and communication skills
- Don't ask yes/no questions; ask open-ended questions
- One question at a time
"""
    
    def get_conversation_history(self, interview_id: str) -> Optional[List[Dict[str, Any]]]:
        """Get the full conversation history."""
        state = _interviews.get(interview_id)
        if not state:
            return None
        return state.messages
    
    def get_status(self, interview_id: str) -> Optional[Dict[str, Any]]:
        """Get interview status."""
        state = _interviews.get(interview_id)
        if not state:
            return None
        return {
            "status": state.status,
            "messages_count": len(state.messages)
        }
    
    def end_interview(self, interview_id: str) -> bool:
        """End an interview session."""
        state = _interviews.get(interview_id)
        if not state:
            return False
        state.status = "ended"
        return True


# Singleton instance
interview_workflow = InterviewWorkflow()