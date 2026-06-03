"""
Interview Workflow - Simple conversational interview without real-time evaluation.
"""
from typing import Dict, Any, List, Optional
from datetime import datetime

from app.llm.service import llm_service
from app.services.settings_service import get_question_guidelines, get_interview_system, get_interview_settings

# Completed interviews — persists after end for evaluation retrieval
_completed_interviews: Dict[str, Any] = {}


class InterviewState:
    """Manages the state of an ongoing interview session."""
    
    def __init__(self, interview_id: str, candidate_data: Dict[str, Any], resume_parsed: Optional[Dict[str, Any]] = None):
        self.interview_id = interview_id
        self.candidate_data = candidate_data
        self.resume_parsed = resume_parsed
        self.messages: List[Dict[str, Any]] = []  # conversation history
        self.question_count = 0
        self.max_questions = get_interview_settings()["max_questions"]
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
        """Generate the next interview question using LLM with DB-sourced guidelines."""
        candidate_data = state.candidate_data
        conversation_history = [
            {"role": m["role"], "content": m["content"]}
            for m in state.messages
            if m.get("role") and m.get("content")
        ]
        guidelines = self._get_question_guidelines()
        system_prompt = get_interview_system()

        prompt = f"Candidate: {candidate_data.get('name', 'Unknown')}\n"
        if candidate_data.get('farming_background'):
            prompt += f"Background: {candidate_data['farming_background']}\n"
        if candidate_data.get('experience_years'):
            prompt += f"Experience: {candidate_data['experience_years']} years\n"
        if candidate_data.get('crops_grown'):
            prompt += f"Crops: {candidate_data['crops_grown']}\n"
        if candidate_data.get('farming_type'):
            prompt += f"Farming Type: {candidate_data['farming_type']}\n"
        if candidate_data.get('land_size'):
            prompt += f"Land Size: {candidate_data['land_size']}\n"
        prompt += (
            f"\nCONVERSATION: {state.get_conversation_context()}\n\n"
            f"Based on the conversation, ask ONE short agriculture-related follow-up question (1-2 lines only). Return ONLY the question."
        )

        try:
            question = await llm_service.chat_completion(
                messages=[{"role": "user", "content": prompt}],
                system_prompt=system_prompt,
                temperature=0.7,
                max_tokens=200,
            )
            if question is None:
                print("WARN: chat_completion returned None")
                return self._fallback_question(state)
            return question.strip()
        except Exception as e:
            import traceback
            traceback.print_exc()
            return self._fallback_question(state)

    FALLBACK_QUESTIONS = [
        "What challenges have you faced with pest management in your crops?",
        "How do you decide which crops to grow each season?",
        "What irrigation methods do you use and why?",
        "How do you manage soil health throughout the year?",
        "What role does weather play in your farming decisions?",
        "How do you handle market fluctuations for your produce?",
        "What sustainable practices do you follow on your farm?",
        "How has your farming approach evolved over the years?",
        "What are the biggest costs in your farming operation?",
        "How do you store and preserve your harvest?",
        "What pests or diseases have been most problematic for you?",
        "How do you select seeds and planting material?",
        "What role does government support play in your farming?",
        "How do you manage labour on your farm?",
        "What new techniques or technologies are you using?",
    ]

    # Crop-specific fallback question sets — cycling prevents same question repeat
    CROP_FALLBACKS = {
        "tomato": [
            "How do you manage tomato blight and fruit rot in your fields?",
            "What quality standards do buyers expect for tomatoes at the market?",
            "How do you handle the seasonal glut when tomato prices crash?",
        ],
        "wheat": [
            "What challenges do you face during wheat harvest?",
            "How do you manage wheat rust and other common diseases?",
        ],
        "rice": [
            "How do you manage water for your paddy fields?",
            "What challenges do you face with rice straw management after harvest?",
        ],
    }

    def _fallback_question(self, state: "InterviewState") -> str:
        """
        Return a contextually-chosen fallback question when the LLM is unavailable.
        Cycles through questions so the same one is not repeated across fallback calls.
        """
        idx = len(state.messages) % len(self.FALLBACK_QUESTIONS)
        base = self.FALLBACK_QUESTIONS[idx]

        # Personalise with candidate data — also cycle through crop-specific questions
        crops = state.candidate_data.get("crops_grown", "") or ""
        farming_bg = str(state.candidate_data.get("farming_background", "")).lower()
        region = state.candidate_data.get("state", "") or ""

        # Try crop-specific cycle first
        for crop_key, questions in self.CROP_FALLBACKS.items():
            if crop_key in crops.lower():
                crop_idx = len(state.messages) % len(questions)
                return questions[crop_idx]

        if "vegetable" in farming_bg:
            veg_idx = len(state.messages) % len(self.FALLBACK_QUESTIONS)
            return self.FALLBACK_QUESTIONS[veg_idx]
        if region:
            return f"What farming challenges are most pressing in {region} right now?"

        return base
    
    def _get_question_guidelines(self) -> str:
        """Get question generation guidelines from DB (or defaults)."""
        return get_question_guidelines()
    
    def get_conversation_history(self, interview_id: str) -> Optional[List[Dict[str, Any]]]:
        """Get the full conversation history."""
        state = _interviews.get(interview_id)
        if not state:
            return None
        return state.messages
    
    def get_status(self, interview_id: str) -> Optional[Dict[str, Any]]:
        """Get interview status from active or completed store."""
        state = _interviews.get(interview_id) or _completed_interviews.get(interview_id)
        if not state:
            return None
        return {
            "status": state.status,
            "messages_count": len(state.messages)
        }
    
    def end_interview(self, interview_id: str) -> bool:
        """
        End an interview session.
        Moves the state to _completed_interviews before deletion so evaluation
        can still retrieve the conversation history.
        """
        if interview_id in _interviews:
            state = _interviews.pop(interview_id)
            state.status = "completed"
            # Preserve for evaluation — candidate_data and messages survive the end
            _completed_interviews[interview_id] = state
            return True
        return False

    def get_completed_interview(self, interview_id: str) -> Optional[Any]:
        """Retrieve a completed interview's state for evaluation."""
        return _completed_interviews.get(interview_id)

    def get_conversation_history(self, interview_id: str) -> Optional[List[Dict[str, Any]]]:
        """Get the full conversation history from either active or completed store."""
        # Check active first
        state = _interviews.get(interview_id)
        if state:
            return state.messages
        # Fall back to completed (post-end)
        state = _completed_interviews.get(interview_id)
        if state:
            return state.messages
        return None


# Singleton instance
interview_workflow = InterviewWorkflow()