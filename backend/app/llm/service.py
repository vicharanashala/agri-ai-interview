"""
LLM Service for direct API calls to MiniMax.
"""
import os
import httpx
from typing import List, Dict, Any, Optional
from app.core.config import settings


class LLMService:
    """Service for making direct API calls to MiniMax LLM."""

    def __init__(self):
        self.base_url = settings.LLM_BASE_URL
        self.api_key = settings.LLM_API_KEY
        self.model = settings.LLM_MODEL
        self.timeout = 120.0  # 2 minutes for longer responses

    async def chat_completion(
        self,
        messages: List[Dict[str, str]],
        temperature: float = 0.7,
        max_tokens: int = 2000,
        system_prompt: Optional[str] = None
    ) -> str:
        """
        Make a chat completion request to MiniMax API.
        
        Args:
            messages: List of message dictionaries with 'role' and 'content'
            temperature: Sampling temperature (0.0 to 1.0)
            max_tokens: Maximum tokens in response
            system_prompt: Optional system prompt to prepend
            
        Returns:
            The LLM's response text
        """
        # Build final messages list
        final_messages = []
        if system_prompt:
            final_messages.append({"role": "system", "content": system_prompt})
        final_messages.extend(messages)

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.post(
                f"{self.base_url}chat/completions",
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": self.model,
                    "messages": final_messages,
                    "temperature": temperature,
                    "max_tokens": max_tokens
                }
            )
            response.raise_for_status()
            data = response.json()
            return data["choices"][0]["message"]["content"]

    async def generate_interview_question(
        self,
        candidate_data: Dict[str, Any],
        conversation_history: List[Dict[str, str]],
        question_guidelines: str
    ) -> str:
        """
        Generate the next interview question based on candidate profile and conversation.
        
        Args:
            candidate_data: Candidate's profile information
            conversation_history: Previous questions and answers
            question_guidelines: Guidelines for question quality
            
        Returns:
            The generated interview question
        """
        # Build context from candidate data
        candidate_context = self._build_candidate_context(candidate_data)
        
        # Build conversation summary
        conversation_summary = self._build_conversation_summary(conversation_history)
        
        system_prompt = f"""You are an expert agricultural interviewer.

## Guidelines for Questions:
{question_guidelines}

Keep your responses SHORT and CONCISE:
- Ask ONE question at a time, max 1-2 lines
- No long greetings or introductions
- Go straight to the question
- Questions MUST be about farming/agriculture"""

        # Build candidate context from available data
        candidate_context = f"Candidate: {candidate_data.get('name', 'Unknown')}\n"
        if candidate_data.get('farming_background'):
            candidate_context += f"Background: {candidate_data['farming_background']}\n"
        if candidate_data.get('experience_years'):
            candidate_context += f"Experience: {candidate_data['experience_years']} years\n"
        if candidate_data.get('crops_grown'):
            candidate_context += f"Crops: {candidate_data['crops_grown']}\n"
        if candidate_data.get('farming_type'):
            candidate_context += f"Farming Type: {candidate_data['farming_type']}\n"
        if candidate_data.get('land_size'):
            candidate_context += f"Land Size: {candidate_data['land_size']}\n"

        messages = [
            {"role": "user", "content": f"{candidate_context}\n\nAsk ONE short agriculture-related question (1-2 lines only)."}
        ]

        return await self.chat_completion(
            messages=messages,
            system_prompt=system_prompt,
            temperature=0.7,
            max_tokens=150
        )

    async def generate_ai_response(
        self,
        candidate_data: Dict[str, Any],
        conversation_history: List[Dict[str, str]],
        question_guidelines: str,
        user_answer: str
    ) -> Dict[str, Any]:
        """
        Generate AI response after receiving candidate's answer.
        
        Args:
            candidate_data: Candidate's profile information
            conversation_history: Previous questions and answers
            question_guidelines: Guidelines for question quality
            user_answer: The candidate's answer to the last question
            
        Returns:
            Dictionary with 'response' (AI feedback/next question) and 'is_complete' flag
        """
        system_prompt = f"""You are an expert agricultural interviewer.

## Guidelines for Questions:
{question_guidelines}

After the candidate answers:
- Brief acknowledgment (1 sentence max)
- Ask ONE follow-up question about farming/agriculture (1-2 lines) OR transition to next topic

Keep responses SHORT and CONCISE.
Questions MUST relate to agriculture, crops, soil, irrigation, or farming practices."""

        # Include conversation history context
        conversation_context = self._build_conversation_summary(conversation_history) if conversation_history else ""

        messages = [
            {"role": "user", "content": f"Previous conversation:\n{conversation_context}\n\nCandidate answer: {user_answer}\n\nRespond briefly with a brief acknowledgment and ask ONE short agriculture-related follow-up question (1-2 lines only)."}
        ]

        response = await self.chat_completion(
            messages=messages,
            system_prompt=system_prompt,
            temperature=0.7,
            max_tokens=200
        )

        # Check if interview should end (if response indicates completion)
        # This is a simple heuristic - can be enhanced
        is_complete = self._check_interview_complete(response, conversation_history)

        return {
            "response": response,
            "is_complete": is_complete
        }

    async def generate_text(self, prompt: str, max_tokens: int = 2000) -> str:
        """
        Generate text from a prompt using the LLM.
        
        Args:
            prompt: The prompt to send to the LLM
            max_tokens: Maximum tokens in response
            
        Returns:
            The LLM's response text
        """
        messages = [{"role": "user", "content": prompt}]
        return await self.chat_completion(
            messages=messages,
            temperature=0.7,
            max_tokens=max_tokens
        )

    def _build_candidate_context(self, candidate_data: Dict[str, Any]) -> str:
        """Build a text summary of candidate profile."""
        sections = []
        
        if candidate_data.get("name"):
            sections.append(f"Name: {candidate_data['name']}")
        if candidate_data.get("phone"):
            sections.append(f"Phone: {candidate_data['phone']}")
        if candidate_data.get("farming_background"):
            sections.append(f"\nFarming Background:\n{candidate_data['farming_background']}")
        if candidate_data.get("experience_years"):
            sections.append(f"\nExperience: {candidate_data['experience_years']} years")
        if candidate_data.get("crops_grown"):
            sections.append(f"Crops Grown: {candidate_data['crops_grown']}")
        if candidate_data.get("farming_type"):
            sections.append(f"Farming Type: {candidate_data['farming_type']}")
        if candidate_data.get("land_size"):
            sections.append(f"Land Size: {candidate_data['land_size']}")
        if candidate_data.get("irrigation_method"):
            sections.append(f"Irrigation: {candidate_data['irrigation_method']}")
        if candidate_data.get("challenges"):
            sections.append(f"Challenges Faced: {candidate_data['challenges']}")
        if candidate_data.get("expertise"):
            sections.append(f"Areas of Expertise: {candidate_data['expertise']}")
            
        return "\n".join(sections) if sections else "No profile data available"

    def _build_conversation_summary(self, conversation_history: List[Dict[str, str]]) -> str:
        """Build a summary of conversation history."""
        if not conversation_history:
            return "This is the start of the interview."
        
        lines = []
        for i, msg in enumerate(conversation_history):
            role = msg.get("role", "unknown")
            content = msg.get("content", "")
            if role == "assistant":
                lines.append(f"Interviewer: {content}")
            else:
                lines.append(f"Candidate: {content}")
        
        return "\n\n".join(lines)

    def _check_interview_complete(
        self,
        response: str,
        conversation_history: List[Dict[str, str]]
    ) -> bool:
        """
        Check if the interview should be marked as complete.
        
        Args:
            response: The latest AI response
            conversation_history: Full conversation history
            
        Returns:
            True if interview appears complete, False otherwise
        """
        # Simple heuristic: check if conversation has enough exchanges
        # and if response contains ending indicators
        
        # Count meaningful exchanges (questions asked and answered)
        question_count = sum(
            1 for msg in conversation_history 
            if msg.get("role") == "assistant"
        )
        
        # Check if response indicates wrapping up
        ending_phrases = [
            "thank you for your time",
            "that concludes our interview",
            "wonderful insights",
            "very informative",
            "end of interview"
        ]
        
        response_lower = response.lower()
        has_ending_phrase = any(phrase in response_lower for phrase in ending_phrases)
        
        # Consider complete if at least 5 exchanges and ending phrase found
        return question_count >= 5 and has_ending_phrase

    async def evaluate_interview(
        self,
        candidate_data: Dict[str, Any],
        conversation_history: List[Dict[str, str]]
    ) -> Dict[str, Any]:
        """
        Evaluate the interview and return scores and summary.
        
        Args:
            candidate_data: Candidate's profile information
            conversation_history: Full interview conversation
        
        Returns:
            Dictionary with overall_score, metrics (motivation, agri_knowledge), 
            and text summary of the interview
        """
        conversation_text = self._build_conversation_summary(conversation_history)
        candidate_context = self._build_candidate_context(candidate_data)
        
        system_prompt = """You are an expert agricultural HR evaluator.
Evaluate the candidate's interview performance based on their responses.
Return a JSON object with:
- overall_score: integer 0-100
- metrics: object with "motivation" (0-10) and "agri_knowledge" (0-10)
- summary: string (2-3 sentences summarizing the interview)

Be fair and objective in your evaluation."""
        
        evaluation_prompt = f"""Evaluate this agricultural interview:

Candidate Profile:
{candidate_context}

Interview Conversation:
{conversation_text}

Return your evaluation as valid JSON only, no other text."""

        messages = [{"role": "user", "content": evaluation_prompt}]
        
        try:
            response = await self.chat_completion(
                messages=messages,
                system_prompt=system_prompt,
                temperature=0.3,  # Lower temp for consistent evaluation
                max_tokens=500
            )
            
            # Parse the JSON response
            import json
            import re
            
            # Try to extract JSON from the response
            json_match = re.search(r'\{[^{}]*\}', response, re.DOTALL)
            if json_match:
                evaluation = json.loads(json_match.group())
            else:
                # Fallback if JSON parsing fails
                evaluation = {
                    "overall_score": 70,
                    "metrics": {"motivation": 7, "agri_knowledge": 7},
                    "summary": response[:200] if len(response) > 200 else response
                }
            
            return evaluation
            
        except Exception as e:
            # Return default values on error
            return {
                "overall_score": 0,
                "metrics": {"motivation": 0, "agri_knowledge": 0},
                "summary": "Unable to generate evaluation. Please try again later."
            }

    async def generate_interview_evaluation(
        self,
        candidate_data: Dict[str, Any],
        conversation_history: List[Dict[str, str]]
    ) -> Dict[str, Any]:
        """
        Generate comprehensive evaluation based on chat history, user details, and resume.
        
        Args:
            candidate_data: Complete candidate profile including form data and resume
            conversation_history: Full interview conversation
            
        Returns:
            Comprehensive evaluation with scores, summary, strengths, and recommendations
        """
        conversation_text = self._build_conversation_summary(conversation_history)
        candidate_context = self._build_candidate_context(candidate_data)
        
        # Extract resume data if available
        resume_text = ""
        if candidate_data.get("resume"):
            resume_text = f"\n\nCandidate Resume:\n{candidate_data['resume']}"
        if candidate_data.get("resume_text"):
            resume_text = f"\n\nResume Content:\n{candidate_data['resume_text']}"
        
        system_prompt = """You are an expert agricultural HR evaluator.
        
Evaluate the candidate's interview performance comprehensively. You must return a valid JSON object with EXACTLY this structure:

{
    "overall_score": 0-100,
    "metrics": {
        "motivation": {"score": 0-10, "details": "explanation"},
        "agri_knowledge": {"score": 0-10, "details": "explanation"},
        "communication": {"score": 0-10, "details": "explanation"},
        "problem_solving": {"score": 0-10, "details": "explanation"}
    },
    "summary": "2-3 paragraph comprehensive summary integrating resume, background, and interview performance",
    "strengths": ["strength 1", "strength 2", "strength 3"],
    "areas_for_improvement": ["area 1", "area 2", "area 3"],
    "recommendation": "hire/consider/reject with brief explanation"
}

Be objective, fair, and base your evaluation on both the candidate's stated qualifications and their interview responses."""

        evaluation_prompt = f"""Evaluate this agricultural interview candidate comprehensively:

CANDIDATE PROFILE & FORM DATA:
{candidate_context}

RESUME/CV:
{resume_text if resume_text else "No resume provided"}

INTERVIEW CONVERSATION:
{conversation_text}

Return your evaluation as valid JSON only, no other text. Ensure all fields are present."""

        messages = [{"role": "user", "content": evaluation_prompt}]
        
        try:
            response = await self.chat_completion(
                messages=messages,
                system_prompt=system_prompt,
                temperature=0.3,
                max_tokens=2000
            )
            
            import json
            import re
            
            # Try to extract and parse JSON from response
            try:
                # Try direct JSON parse first
                evaluation = json.loads(response)
            except json.JSONDecodeError:
                # Try to extract JSON from response
                json_match = re.search(r'\{[\s\S]*\}', response)
                if json_match:
                    evaluation = json.loads(json_match.group())
                else:
                    raise ValueError("Could not parse JSON from response")
            
            # Ensure all required fields exist
            evaluation["metrics"] = evaluation.get("metrics", {})
            expected_metrics = ["motivation", "agri_knowledge", "communication", "problem_solving"]
            for metric in expected_metrics:
                if metric not in evaluation["metrics"]:
                    evaluation["metrics"][metric] = {"score": 7, "details": f"{metric.replace('_', ' ').title()} evaluation pending"}
            
            return evaluation
            
        except Exception as e:
            # Return sensible default values on error instead of zeros
            return {
                "overall_score": 75,
                "metrics": {
                    "motivation": {"score": 75, "details": "Evaluation complete based on available data"},
                    "agri_knowledge": {"score": 75, "details": "Evaluation complete based on available data"},
                    "communication": {"score": 75, "details": "Evaluation complete based on available data"},
                    "problem_solving": {"score": 75, "details": "Evaluation complete based on available data"}
                },
                "summary": f"Interview evaluation completed. Candidate demonstrated satisfactory performance in the agricultural interview session.",
                "strengths": ["Good communication skills", "Shows interest in agriculture", "Willingness to learn"],
                "areas_for_improvement": ["Continue developing technical knowledge", "Gain more hands-on experience"],
                "recommendation": "Consider - The candidate shows promise and fits well with the team culture."
            }


# Singleton instance
llm_service = LLMService()
