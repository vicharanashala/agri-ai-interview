"""
LLM Service for direct API calls to MiniMax using OpenAI SDK.
"""
import os
import httpx
from typing import List, Dict, Any, Optional, Union
from openai import AsyncOpenAI
from app.core.config import settings
from app.services.settings_service import get_evaluation_system


class LLMService:
    """Service for making direct API calls to MiniMax LLM."""

    def __init__(self):
        self.base_url = settings.LLM_BASE_URL
        self.api_key = settings.LLM_API_KEY
        self.model = settings.LLM_MODEL
        self.timeout = 120.0  # 2 minutes for longer responses
        self._client = None

    def _get_client(self) -> AsyncOpenAI:
        if self._client is None:
            self._client = AsyncOpenAI(
                base_url=self.base_url,
                api_key=self.api_key,
                timeout=self.timeout,
                max_retries=0,
            )
        return self._client

    async def chat_completion(
        self,
        messages: List[Dict[str, str]],
        temperature: float = 0.7,
        max_tokens: int = 2000,
        system_prompt: Optional[str] = None,
        require_ending_punctuation: bool = False,
    ) -> str:
        """
        Make a chat completion request to MiniMax API.

        Args:
            messages: List of message dictionaries with 'role' and 'content'
            temperature: Sampling temperature (0.0 to 1.0)
            max_tokens: Maximum tokens in response
            system_prompt: Optional system prompt to prepend
            require_ending_punctuation: If True, discard response if it doesn't end with . ! ?
                                        Use for question generation (must be complete sentences).
                                        Use False for evaluation (returns raw JSON ending in }).

        Returns:
            The LLM's response text
        """
        final_messages = []
        if system_prompt:
            final_messages.append({"role": "system", "content": system_prompt})
        final_messages.extend(messages)

        client = self._get_client()
        response = await client.chat.completions.create(
            model=self.model,
            messages=final_messages,
            temperature=temperature,
            max_tokens=max_tokens,
            extra_body={"reasoning_split": True},
        )

        message = response.choices[0].message
        content = message.content or ""

        # Fall back to reasoning_details if content is empty
        try:
            reasoning_details = getattr(message, "reasoning_details", None)
            if not content and reasoning_details:
                if isinstance(reasoning_details, list) and len(reasoning_details) > 0:
                    content = reasoning_details[0].get("text", "") if isinstance(reasoning_details[0], dict) else str(reasoning_details[0])
        except Exception:
            pass  # Ignore reasoning extraction errors

        # Only apply truncation guard when explicitly required (question generation).
        # Evaluation responses are raw JSON ending in } — this check would discard them.
        if require_ending_punctuation and content and content[-1] not in '.!?':
            content = ""

        return content or "(No response)"

    async def generate_interview_question(
        self,
        candidate_data: Dict[str, Any],
        conversation_history: List[Dict[str, str]],
        question_guidelines: str
    ) -> str:
        """
        Generate the next interview question based on candidate profile and conversation.
        """
        system_prompt = f"""You are an expert agricultural interviewer.

## Guidelines for Questions:
{question_guidelines}

Keep your responses SHORT and CONCISE:
- Ask ONE question at a time, max 1-2 lines
- No long greetings or introductions
- Go straight to the question
- Questions MUST be about farming/agriculture"""

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
        """
        system_prompt = f"""You are an expert agricultural interviewer.

## Guidelines for Questions:
{question_guidelines}

After the candidate answers:
- Brief acknowledgment (1 sentence max)
- Ask ONE follow-up question about farming/agriculture (1-2 lines) OR transition to next topic

Keep responses SHORT and CONCISE.
Questions MUST relate to agriculture, crops, soil, irrigation, or farming practices."""

        conversation_context = self._build_conversation_summary(conversation_history) if conversation_history else ""

        messages = [
            {"role": "user", "content": f"Previous conversation:\n{conversation_context}\n\nCandidate answer: {user_answer}\n\nRespond briefly with a brief acknowledgment and ask ONE short agriculture-related follow-up question (1-2 lines only)."}
        ]

        response = await self.chat_completion(
            messages=messages,
            system_prompt=system_prompt,
            temperature=0.7,
            max_tokens=400
        )

        is_complete = self._check_interview_complete(response, conversation_history)

        return {
            "response": response,
            "is_complete": is_complete
        }

    async def generate_text(self, prompt: str, max_tokens: int = 2000) -> str:
        messages = [{"role": "user", "content": prompt}]
        return await self.chat_completion(
            messages=messages,
            temperature=0.7,
            max_tokens=max_tokens
        )

    def _build_candidate_context(self, candidate_data: Dict[str, Any]) -> str:
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
        if not conversation_history:
            return "This is the start of the interview."

        lines = []
        for msg in conversation_history:
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
        question_count = sum(
            1 for msg in conversation_history
            if msg.get("role") == "assistant"
        )

        ending_phrases = [
            "thank you for your time",
            "that concludes our interview",
            "wonderful insights",
            "very informative",
            "end of interview"
        ]

        response_lower = response.lower()
        has_ending_phrase = any(phrase in response_lower for phrase in ending_phrases)

        return question_count >= 5 and has_ending_phrase

    async def generate_interview_evaluation(
        self,
        candidate_data: Dict[str, Any],
        conversation_history: List[Dict[str, str]],
        qa_pairs: List[Dict[str, Any]] = None,
        resume_text: str = ""
    ) -> Dict[str, Any]:
        """
        Evaluate the interview and return scores and summary.
        """
        evaluation_system = get_evaluation_system()
        conversation_text = self._build_conversation_summary(conversation_history)
        candidate_context = self._build_candidate_context(candidate_data)

        # Build Q&A text from qa_pairs if available
        qa_text = ""
        if qa_pairs:
            qa_lines = []
            for qa in qa_pairs:
                qa_lines.append(f"Q: {qa.get('question', '')}")
                qa_lines.append(f"A: {qa.get('answer', '')}\n")
            qa_text = "\n".join(qa_lines)

        system_prompt = (
            "You are an expert agricultural HR evaluator.\n"
            + evaluation_system
            + "\nEvaluate the candidate's interview performance. Return a JSON object with:\n"
            + "- overall_score: integer 0-100\n"
            + '- topic_scores: {\n'
            + '    "agricultural_concepts": {"score": 0-10, "details": "brief explanation"},\n'
            + '    "crop_management_practices": {"score": 0-10, "details": "brief explanation"},\n'
            + '    "pest_and_disease_management": {"score": 0-10, "details": "brief explanation"},\n'
            + '    "nutrient_deficiencies": {"score": 0-10, "details": "brief explanation"},\n'
            + '    "weather_related_advisories": {"score": 0-10, "details": "brief explanation"},\n'
            + '    "field_level_technical_issues": {"score": 0-10, "details": "brief explanation"}\n'
            + "},\n"
            + '"summary": "2-3 paragraph comprehensive summary",\n'
            + '"strengths": ["strength 1", "strength 2", "strength 3"],\n'
            + '"areas_for_improvement": ["area 1", "area 2"],\n'
            + '"recommendation": "pass/consider/reject with brief explanation"\n'
            + "}\n\n"
            + "Score each topic on a scale of 0-10. Topics with no questions get 0. "
            + "Compute overall_score as: (sum of 6 topic scores / 6) * 10."
        )

        evaluation_prompt = f"""Evaluate this agricultural interview candidate comprehensively:

CANDIDATE PROFILE & FORM DATA:
{candidate_context}

RESUME/CV:
{resume_text if resume_text else "No resume provided"}

INTERVIEW CONVERSATION:
{conversation_text}
{qa_text}

Return your evaluation as valid JSON only, no other text. Ensure all fields are present."""

        messages = [{"role": "user", "content": evaluation_prompt}]

        required_topics = [
            "agricultural_concepts",
            "crop_management_practices",
            "pest_and_disease_management",
            "nutrient_deficiencies",
            "weather_related_advisories",
            "field_level_technical_issues",
        ]

        try:
            response = await self.chat_completion(
                messages=messages,
                system_prompt=system_prompt,
                temperature=0.0,
                max_tokens=2000
            )

            import json
            import re

            try:
                evaluation = json.loads(response)
            except json.JSONDecodeError:
                json_match = re.search(r'\{[\s\S]*\}', response)
                if json_match:
                    evaluation = json.loads(json_match.group())
                else:
                    raise ValueError("Could not parse JSON from response")

            evaluation["topic_scores"] = evaluation.get("topic_scores", {})
            for topic in required_topics:
                if topic not in evaluation["topic_scores"]:
                    evaluation["topic_scores"][topic] = {"score": 0, "details": f"{topic} evaluation pending"}

            ts = evaluation["topic_scores"]
            topic_sum = sum(ts[t].get("score", 0) for t in required_topics)
            evaluation["overall_score"] = int((topic_sum / len(required_topics)) * 10)

            return evaluation

        except Exception as e:
            return {
                "overall_score": 0,
                "topic_scores": {
                    t: {"score": 0, "details": "Evaluation could not be completed"}
                    for t in required_topics
                },
                "summary": "Evaluation could not be completed. Please contact support.",
                "strengths": [],
                "areas_for_improvement": [],
                "recommendation": "Unable to evaluate - please retry or contact support."
            }


llm_service = LLMService()