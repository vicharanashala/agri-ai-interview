"""
Interview Workflow - Simple conversational interview without real-time evaluation.
"""
from typing import Dict, Any, List, Optional
from datetime import datetime, timedelta

from app.llm.service import llm_service
from app.services.settings_service import get_question_guidelines, get_interview_system, get_first_question, get_interview_settings

DEFAULT_MAX_DURATION_MINUTES = 30

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
        self.max_duration_minutes = self._get_max_duration_minutes()
        self.status = "active"
        self.start_time = datetime.now()
        self.qa_pairs: List[Dict[str, Any]] = []  # [{question, answer, topic}] populated per turn
        self._pending_question: Dict[str, str] = {}  # {question, topic} awaiting the next answer
        self._recent_questions: List[str] = []  # sliding window of last N question texts for dedup

    def _get_max_duration_minutes(self) -> int:
        """Load max interview duration in minutes from DB settings, falling back to default."""
        try:
            from app.services.settings_service import _get_db, Settings
            db = _get_db()
            try:
                setting = db.query(Settings).filter(
                    Settings.key == "interview_max_duration_minutes"
                ).first()
                if setting and setting.value:
                    return int(setting.value)
            finally:
                db.close()
        except Exception:
            pass
        return DEFAULT_MAX_DURATION_MINUTES
    
    def add_message(self, role: str, content: str, topic: Optional[str] = None):
        """Add a message to the conversation history."""
        entry: Dict[str, Any] = {
            "role": role,
            "content": content,
            "timestamp": datetime.now().isoformat(),
        }
        if topic:
            entry["topic"] = topic
        self.messages.append(entry)

    def _is_duplicate(self, question: str) -> bool:
        """Return True if question is the same as or >70% overlapping with a recently-asked question."""
        q = question.lower().strip()
        for recent in self._recent_questions:
            r = recent.lower().strip()
            if q == r:
                return True
            q_words = set(q.split())
            r_words = set(r.split())
            if q_words and r_words:
                overlap = len(q_words & r_words) / max(len(q_words), len(r_words))
                if overlap > 0.7:
                    return True
        return False

    def add_question(self, question: str):
        """Record a question in the recent-questions sliding window."""
        self._recent_questions.append(question)
        if len(self._recent_questions) > 5:
            self._recent_questions.pop(0)

    def get_conversation_context(self) -> str:
        """Build conversation context for generating next question."""
        context = []
        for msg in self.messages:
            if msg.get("role") == "user":
                context.append(f"Answer: {msg['content']}")
            elif msg.get("role") == "assistant":
                context.append(f"Question: {msg['content']}")
        return "\n\n".join(context)
    
    def is_complete(self) -> bool:
        """Check if interview should end (question limit OR time limit reached)."""
        if self.question_count >= self.max_questions:
            return True
        elapsed = datetime.now() - self.start_time
        if elapsed >= timedelta(minutes=self.max_duration_minutes):
            return True
        return False

    def time_remaining_seconds(self) -> int:
        """Seconds left before time limit is reached. Returns 0 if already expired."""
        elapsed = datetime.now() - self.start_time
        remaining = int(self.max_duration_minutes * 60 - elapsed.total_seconds())
        return max(0, remaining)


# Global state storage
_interviews: Dict[str, InterviewState] = {}


class InterviewWorkflow:
    """Main interview workflow orchestrator."""
    
    async def initialize_interview(self, interview_id: str, candidate_data: Dict[str, Any], resume_parsed: Optional[Dict[str, Any]] = None) -> str:
        """Initialize a new interview and return the first question."""
        state = InterviewState(interview_id, candidate_data, resume_parsed=resume_parsed)
        _interviews[interview_id] = state

        # First question — from DB settings (admin-configurable), personalised with candidate name
        candidate_name = candidate_data.get("name", "") if isinstance(candidate_data, dict) else ""
        first_question = get_first_question(candidate_name=candidate_name)

        # First question has no topic (it's the opening question)
        state.add_message("assistant", first_question, topic=None)
        state._pending_question = {"question": first_question, "topic": "opening"}

        return first_question
    
    async def process_answer(self, interview_id: str, user_answer: str) -> Dict[str, Any]:
        """Process a candidate's answer and return the next question."""
        state = _interviews.get(interview_id)
        if not state:
            raise ValueError(f"Interview {interview_id} not found")
        
        # Add the user's answer to history (pair it with the pending question's topic)
        pending = state._pending_question
        state.add_message("user", user_answer, topic=pending.get("topic"))
        state.question_count += 1

        # Record the Q&A pair so evaluation can score per topic
        if pending.get("question"):
            state.qa_pairs.append({
                "question": pending["question"],
                "answer": user_answer,
                "topic": pending.get("topic", "unknown"),
            })

        # Check if interview is complete
        if state.is_complete():
            state.status = "completed"
            if state.question_count >= state.max_questions:
                end_reason = "question_limit"
            else:
                end_reason = "time_limit"
            return {
                "response": "Thank you for completing the interview. Your responses have been recorded.",
                "is_complete": True,
                "end_reason": end_reason,
                "messages": state.messages,
                "qa_pairs": state.qa_pairs,
            }

        # Generate next question using LLM with candidate data and conversation
        next_q = await self._generate_next_question(state)
        next_question = next_q["question"]
        next_topic   = next_q["topic"]

        # Store the next question — tag it with its topic (used when the answer arrives next turn)
        state.add_message("assistant", next_question, topic=next_topic)
        # Remember pending question so next turn we can pair it with the answer
        state._pending_question = {"question": next_question, "topic": next_topic}

        return {
            "response": next_question,
            "is_complete": False,
            "messages": state.messages,
            "qa_pairs": state.qa_pairs,
        }
    
    # Ordered list of 6 topic labels — must match evaluation_system exactly
    TOPIC_LABELS = [
        "agricultural_concepts",
        "crop_management_practices",
        "pest_and_disease_management",
        "nutrient_deficiencies",
        "weather_related_advisories",
        "field_level_technical_issues",
    ]

    # Keyword → topic label mapping (order-sensitive, checked in sequence)
    TOPIC_KEYWORDS = [
        ("agricultural_concepts", [
            "soil type", "soil health", "crop cycle", "season", "land preparation",
            "seed selection", "crop rotation", "pruning", "mulching", "nursery",
            "transplanting", "fallow", "landholding",
        ]),
        ("crop_management_practices", [
            "sowing", "spacing", "plant population", "irrigation", "drip", "sprinkler",
            "fertiliser", "fertilization", "weed", "herbicide", "harvest", "harvesting",
            "post-harvest", "yield", "intercropping", "mixed cropping",
        ]),
        ("pest_and_disease_management", [
            "pest", "disease", "insect", "fungus", "bacterial", "blight", "rust",
            "mildew", "IPM", "pesticide", "insecticide", "biological control",
            "organic control", "resistance", " Bt ", "maruca", "fruit borer",
        ]),
        ("nutrient_deficiencies", [
            "nitrogen", "phosphorus", "potassium", "NPK", "deficiency",
            "micronutrient", "iron chlorosis", "zinc", "magnesium", "calcium",
            "soil test", "yellowing", "stunting", "necrosis",
        ]),
        ("weather_related_advisories", [
            "monsoon", "rainfall", "drought", "frost", "heat stress",
            "waterlogging", "climate", "weather", "rain", "dry spell",
            "irrigation scheduling", "climate change",
        ]),
        ("field_level_technical_issues", [
            "drainage", "salinisation", "salinity", "erosion", "soil erosion",
            "lodging", "lodging", "storage", "godown", "warehouse", "cold storage",
            "post-harvest loss", "grading", "quality",
        ]),
    ]

    def _infer_topic(self, question_text: str) -> str:
        """Infer the topic label from question text using keyword matching."""
        q_lower = question_text.lower()
        for topic_label, keywords in self.TOPIC_KEYWORDS:
            for kw in keywords:
                if kw.lower() in q_lower:
                    return topic_label
        # Default to agricultural_concepts if no keyword matches
        return "agricultural_concepts"

    # Phrases that indicate the LLM produced analysis/summary instead of a question
    _INVALID_QUESTION_STARTERS = [
        "the candidate", "looking at", "given their", "based on their",
        "the interview", "we've covered", "since this is",
        "let me ask", "a good follow-up", "asking about", "question about",
        "a follow-up question", "let me ask a",
    ]

    def _is_valid_question(self, text: str) -> bool:
        """Return True if text looks like an interview question, False if it's analysis/summary."""
        if not text or len(text.strip()) < 10:
            return False
        t = text.strip().lower()
        # Reject if it starts with known analysis/summary phrases
        for starter in self._INVALID_QUESTION_STARTERS:
            if t.startswith(starter):
                return False
        # Reject if it starts with "you" and continues with statement (not a question)
        if t.startswith("you ") and "?" not in text:
            return False
        # Reject if it starts with a long running sentence about the conversation
        if len(text) > 300:
            return False
        return True

    async def _generate_next_question(self, state: InterviewState) -> Dict[str, str]:
        """Generate the next interview question using LLM with full context.

        Returns:
            {"question": str, "topic": str}
        """
        candidate_data = state.candidate_data
        resume_parsed = state.resume_parsed or {}
        guidelines = self._get_question_guidelines()
        system_prompt = get_interview_system()

        current_q = state.question_count + 1
        max_q = state.max_questions

        # ── 1. Candidate profile from onboarding form ──────────────────────
        prompt = "=== CANDIDATE PROFILE ===\n"
        prompt += f"Name: {candidate_data.get('name', 'Unknown')}\n"
        for field in [
            ("Phone", "phone"),
            ("State", "state"),
            ("District", "district"),
            ("Current Role", "current_role"),
            ("Experience (years)", "experience_years"),
            ("Education", "education"),
            ("Institution", "institution"),
            ("Farming Background", "farming_background"),
            ("Crops Grown", "crops_grown"),
            ("Primary Expertise", "primary_expertise"),
        ]:
            label, key = field
            val = candidate_data.get(key)
            if val:
                prompt += f"{label}: {val}\n"

        # ── 2. Resume parsed data ───────────────────────────────────────────
        if resume_parsed:
            prompt += "\n=== RESUME DATA ===\n"
            for key, val in resume_parsed.items():
                if val not in (None, "", []):
                    if isinstance(val, list):
                        prompt += f"{key}: {', '.join(str(v) for v in val)}\n"
                    else:
                        prompt += f"{key}: {val}\n"

        # ── 3. Question number context ──────────────────────────────────────
        prompt += f"\n=== QUESTION {current_q} of {max_q} ===\n"
        prompt += "You are conducting an agriculture internship interview. "
        prompt += "Ask ONE short, focused follow-up question (1-2 lines). "
        prompt += "Return ONLY the question, no preamble.\n"

        # ── 4. Question guidelines ──────────────────────────────────────────
        prompt += f"\n=== QUESTION GUIDELINES ===\n{guidelines}\n"

        # ── 5. Chat history ────────────────────────────────────────────────
        prompt += f"\n=== CONVERSATION HISTORY ===\n{state.get_conversation_context()}\n"

        prompt += "\nAsk the next question based on the above context:"

        # Try up to 2 times to get a valid question; fall back on failure
        question_text = None
        for attempt in range(2):
            try:
                raw = await llm_service.chat_completion(
                    messages=[{"role": "user", "content": prompt}],
                    system_prompt=system_prompt,
                    temperature=0.7,
                    max_tokens=600,
                    require_ending_punctuation=True,
                )
                if raw:
                    question_text = raw.strip()
                if question_text and self._is_valid_question(question_text):
                    # Reject if this exact/near-duplicate question was asked recently
                    if state._is_duplicate(question_text):
                        question_text = None
                        continue  # retry
                    state.add_question(question_text)
                    break  # good question, exit retry loop
            except Exception:
                import traceback
                traceback.print_exc()
                break  # don't retry on exception

        if not question_text or not self._is_valid_question(question_text):
            question_text = self._fallback_question(state)

        # Infer topic from question text
        topic = self._infer_topic(question_text)
        return {"question": question_text, "topic": topic}

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
        """Return a contextually-chosen fallback question string (no topic)."""
        idx = len(state.messages) % len(self.FALLBACK_QUESTIONS)
        base = self.FALLBACK_QUESTIONS[idx]
        crops = state.candidate_data.get("crops_grown", "") or ""
        farming_bg = str(state.candidate_data.get("farming_background", "")).lower()
        region = state.candidate_data.get("state", "") or ""
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
    
    def get_status(self, interview_id: str) -> Optional[Dict[str, Any]]:
        """Get interview status from active or completed store."""
        state = _interviews.get(interview_id) or _completed_interviews.get(interview_id)
        if not state:
            return None
        return {
            "status": state.status,
            "messages_count": len(state.messages),
            "time_remaining_seconds": state.time_remaining_seconds(),
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
        """Retrieve a completed interview's state for evaluation.
        
        Tries in-memory first, then reconstructs from DB InterviewSession if needed.
        """
        state = _completed_interviews.get(interview_id)
        if state:
            return state
        
        # DB fallback: reconstruct a lightweight state-like object from DB
        from app.db.database import SessionLocal
        from app.db.models.candidate import InterviewSession
        import json
        db = SessionLocal()
        try:
            session = db.query(InterviewSession).filter(
                InterviewSession.id == interview_id
            ).first()
            if session and session.interviewData:
                try:
                    data = json.loads(session.interviewData)
                    # Use a SimpleNamespace so callers can access .candidate_data / .qa_pairs
                    # via attribute access (same as the real InterviewState object)
                    from types import SimpleNamespace
                    ns = SimpleNamespace(
                        candidate_data=data.get("candidate_data", {}),
                        qa_pairs=data.get("qa_pairs", []),
                    )
                    return ns
                except Exception:
                    pass
        finally:
            db.close()
        
        return None

    def get_conversation_history(self, interview_id: str) -> Optional[List[Dict[str, Any]]]:
        """Get the full conversation history from in-memory or DB.
        
        Tries in-memory first (current worker), then falls back to PostgreSQL
        (any worker — handles multi-worker deployments where the end-interview
        request may land on a different worker than the one that ran the interview).
        """
        # 1. In-memory: active interviews
        state = _interviews.get(interview_id)
        if state:
            return state.messages
        
        # 2. In-memory: completed interviews (post-end)
        state = _completed_interviews.get(interview_id)
        if state:
            return state.messages
        
        # 3. DB fallback: different worker or after restart — InterviewSession.interviewData
        from app.db.database import SessionLocal
        from app.db.models.candidate import InterviewSession
        import json
        db = SessionLocal()
        try:
            session = db.query(InterviewSession).filter(
                InterviewSession.id == interview_id
            ).first()
            if session and session.interviewData:
                try:
                    data = json.loads(session.interviewData)
                    return data.get("messages", [])
                except Exception:
                    pass
        finally:
            db.close()
        
        return None


# Singleton instance
interview_workflow = InterviewWorkflow()