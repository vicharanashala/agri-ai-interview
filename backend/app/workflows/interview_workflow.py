"""
Interview Workflow - Simple conversational interview without real-time evaluation.
"""
import logging
from typing import Dict, Any, List, Optional, Tuple
from datetime import datetime, timedelta, timezone

from app.llm.service import llm_service
from app.services.settings_service import get_question_guidelines, get_interview_system, get_first_question, get_interview_settings
from app.services.question_similarity import is_duplicate_or_similar
from app.services.rapid_fire_service import rapid_fire_service

logger = logging.getLogger(__name__)

DEFAULT_MAX_DURATION_MINUTES = 30

# Completed interviews — persists after end for evaluation retrieval
_completed_interviews: Dict[str, Any] = {}


class InterviewState:
    """Manages the state of an ongoing interview session."""
    
    CORE_QUESTIONS_COUNT = 13  # Q1 greeting + 12 core technical questions (2 per topic across 6 topics)
    RAPID_FIRE_QUESTIONS_COUNT = 12  # Q14-Q25: 12 MCQs (includes 3 image identification questions)
    TOTAL_QUESTIONS = 25

    def __init__(
        self,
        interview_id: str,
        candidate_data: Dict[str, Any],
        resume_parsed: Optional[Dict[str, Any]] = None,
        past_questions: Optional[List[str]] = None,
        attempt_number: int = 1,
    ):
        self.interview_id = interview_id
        self.candidate_data = candidate_data
        self.resume_parsed = resume_parsed
        self.attempt_number = attempt_number or 1
        self.messages: List[Dict[str, Any]] = []  # conversation history
        self.question_count = 0
        role = self.candidate_data.get("eligible_role")
        # Ensure structured assessment runs the full 13 core + 12 rapid-fire questions (25 total)
        settings_max = get_interview_settings(role).get("max_questions", self.TOTAL_QUESTIONS)
        self.max_questions = max(self.TOTAL_QUESTIONS, int(settings_max)) if settings_max else self.TOTAL_QUESTIONS
        self.core_questions_count = self.CORE_QUESTIONS_COUNT
        self.rapid_fire_questions_count = self.RAPID_FIRE_QUESTIONS_COUNT
        self.rapid_fire_timeouts_count = 0
        self.max_duration_minutes = self._get_max_duration_minutes(role)
        self.status = "active"
        self.start_time = datetime.utcnow()
        self.qa_pairs: List[Dict[str, Any]] = []  # [{question, answer, topic, phase, options, image_url}]
        self._pending_question: Dict[str, Any] = {}  # {question, topic, phase, options, image_url} awaiting answer
        self._recent_questions: List[str] = []  # all question texts asked in this session

        # Resolve past questions from previous attempts if not explicitly supplied
        if past_questions is None:
            cid = candidate_data.get("candidate_id") or candidate_data.get("id") or candidate_data.get("_id")
            if cid:
                try:
                    from app.db.mongodb import get_sync_db
                    from app.services.past_questions_service import get_candidate_attempt_info
                    self.attempt_number, self.past_questions = get_candidate_attempt_info(
                        get_sync_db(), str(cid), current_interview_id=interview_id
                    )
                except Exception:
                    self.past_questions = []
            else:
                self.past_questions = []
        else:
            self.past_questions = list(past_questions)

    def _get_max_duration_minutes(self, role: str = None) -> int:
        """Load max interview duration in minutes from DB settings, falling back to default."""
        try:
            from app.services.settings_service import get_interview_settings
            return get_interview_settings(role).get("max_duration_minutes", DEFAULT_MAX_DURATION_MINUTES)
        except Exception:
            pass
        return DEFAULT_MAX_DURATION_MINUTES
    
    def get_phase(self, q_num: int) -> str:
        """Return 'core' for questions 1-13, 'rapid_fire' for questions 14-25."""
        return "core" if q_num <= self.core_questions_count else "rapid_fire"

    def get_topic_for_question(self, q_num: int) -> str:
        """Return the designated agriculture topic for question q_num (1-indexed)."""
        if q_num == 1:
            return InterviewWorkflow.TOPIC_LABELS[0]
        elif q_num <= self.core_questions_count:
            # Questions 2 to 13: Exactly 2 questions from each of the 6 mandatory topics
            topic_idx = (q_num - 2) // 2
            idx = min(max(0, topic_idx), len(InterviewWorkflow.TOPIC_LABELS) - 1)
            return InterviewWorkflow.TOPIC_LABELS[idx]
        else:
            # Questions 14 to 25: 12 rapid-fire questions across 6 topics (2 questions per topic)
            rf_idx = q_num - self.core_questions_count - 1
            topic_idx = (rf_idx // 2) % len(InterviewWorkflow.TOPIC_LABELS)
            return InterviewWorkflow.TOPIC_LABELS[topic_idx]

    def get_time_limit_seconds(self, q_num: int) -> int:
        """Core questions have 120s (2 mins); Rapid-fire questions have 30s."""
        return 120 if q_num <= self.core_questions_count else 30

    def add_message(
        self,
        role: str,
        content: str,
        topic: Optional[str] = None,
        phase: Optional[str] = None,
        options: Optional[List[str]] = None,
        image_url: Optional[str] = None,
    ):
        """Add a message to the conversation history."""
        entry: Dict[str, Any] = {
            "role": role,
            "content": content,
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
        if topic:
            entry["topic"] = topic
        if phase:
            entry["phase"] = phase
        if options:
            entry["options"] = list(options)
        if image_url:
            entry["image_url"] = image_url
        self.messages.append(entry)

    def is_duplicate_or_similar(self, question: str) -> Tuple[bool, Optional[str], float]:
        """
        Check if question is duplicate or closely similar to:
        1. Any question asked in previous attempts (self.past_questions)
        2. Any question already asked in the current interview (self._recent_questions)
        """
        all_excluded = self.past_questions + self._recent_questions
        return is_duplicate_or_similar(question, all_excluded, threshold=0.60)

    def _is_duplicate(self, question: str) -> bool:
        """Backwards compatibility helper."""
        is_dup, _, _ = self.is_duplicate_or_similar(question)
        return is_dup

    def add_question(self, question: str):
        """Record a question in the session questions list."""
        if question and question not in self._recent_questions:
            self._recent_questions.append(question)

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
        elapsed = datetime.utcnow() - self.start_time
        if elapsed >= timedelta(minutes=self.max_duration_minutes):
            return True
        return False

    def time_remaining_seconds(self) -> int:
        """Seconds left before time limit is reached. Returns 0 if already expired."""
        elapsed = datetime.utcnow() - self.start_time
        remaining = int(self.max_duration_minutes * 60 - elapsed.total_seconds())
        return max(0, remaining)


# Global state storage
_interviews: Dict[str, InterviewState] = {}


class InterviewWorkflow:
    """Main interview workflow orchestrator."""
    
    # Ordered list of 6 topic labels — must match evaluation_system exactly
    TOPIC_LABELS = [
        "agricultural_concepts",
        "crop_management_practices",
        "pest_and_disease_management",
        "nutrient_deficiencies",
        "weather_related_advisories",
        "field_level_technical_issues",
    ]

    async def initialize_interview(
        self,
        interview_id: str,
        candidate_data: Dict[str, Any],
        resume_parsed: Optional[Dict[str, Any]] = None,
        past_questions: Optional[List[str]] = None,
        attempt_number: Optional[int] = None,
    ) -> str:
        """Initialize a new interview and return the first question."""
        attempt_num = attempt_number or 1
        state = InterviewState(
            interview_id,
            candidate_data,
            resume_parsed=resume_parsed,
            past_questions=past_questions,
            attempt_number=attempt_num,
        )
        _interviews[interview_id] = state

        # First question — Core Question 1 of 18 (Topic: agricultural_concepts)
        candidate_name = candidate_data.get("name", "") if isinstance(candidate_data, dict) else ""
        first_question = get_first_question(candidate_name=candidate_name, attempt_number=state.attempt_number)
        first_topic = self.TOPIC_LABELS[0]

        if not first_question or not first_question.strip():
            candidate_greeting = f"Hello {candidate_name}, welcome to your interview assessment. " if candidate_name else "Hello, welcome to your interview assessment. "
            default_q = self.TOPIC_FALLBACKS.get(first_topic, ["How do you assess soil texture and organic matter content in a farm field?"])[0]
            first_question = f"{candidate_greeting}{default_q}"

        state.add_question(first_question)
        state.add_message("assistant", first_question, topic=first_topic, phase="core", options=None)
        state._pending_question = {
            "question": first_question,
            "topic": first_topic,
            "phase": "core",
            "options": None,
            "time_limit_seconds": 120,
        }

        return first_question
    
    async def process_answer(self, interview_id: str, user_answer: str) -> Dict[str, Any]:
        """Process a candidate's answer and return the next question."""
        state = _interviews.get(interview_id)
        if not state:
            # Reconstruct in-memory state from MongoDB session doc if available
            try:
                from app.db.mongodb import get_sync_db
                db = get_sync_db()
                session = db.interview_sessions.find_one({"_id": interview_id})
                if session:
                    cand_data = (session.get("interview_data") or {}).get("candidate_data", {})
                    from app.services.queue_manager import slot_manager
                    slot_manager._resume_workflow_from_session(session, cand_data)
                    state = _interviews.get(interview_id)
            except Exception as restore_err:
                logger.error(f"[InterviewWorkflow] Failed to restore session {interview_id}: {restore_err}")

        if not state:
            raise ValueError(f"Interview {interview_id} not found")
        
        pending = state._pending_question or {}
        pending_phase = pending.get("phase", "core")

        # Anti-cheating signal: track if a rapid-fire question expired without choosing an answer
        if pending_phase == "rapid_fire":
            ans_str = (user_answer or "").strip().lower()
            if not ans_str or "no answer" in ans_str or "time expired" in ans_str or "timeout" in ans_str:
                state.rapid_fire_timeouts_count += 1
                logger.info(
                    f"[InterviewWorkflow] Interview {interview_id}: Rapid-fire question expired without answer "
                    f"(cumulative timeouts={state.rapid_fire_timeouts_count})"
                )

        # Add the user's answer to history
        state.add_message("user", user_answer, topic=pending.get("topic"))
        state.question_count += 1

        # Record the Q&A pair with phase & options metadata for evaluation
        if pending.get("question"):
            state.qa_pairs.append({
                "question": pending["question"],
                "answer": user_answer,
                "topic": pending.get("topic", "unknown"),
                "phase": pending_phase,
                "options": pending.get("options"),
                "image_url": pending.get("image_url"),
                "correct_option": pending.get("correct_option"),
                "explanation": pending.get("explanation"),
            })

        # Check if interview is complete (all 30 questions completed or duration expired)
        if state.is_complete():
            state.status = "completed"
            if state.question_count >= state.max_questions:
                end_reason = "question_limit"
            else:
                end_reason = "time_limit"
            return {
                "response": "Thank you for completing the assessment. Your responses across the core and rapid-fire sections have been recorded.",
                "is_complete": True,
                "end_reason": end_reason,
                "phase": "completed",
                "messages": state.messages,
                "qa_pairs": state.qa_pairs,
                "rapid_fire_timeouts_count": state.rapid_fire_timeouts_count,
            }

        # Next question index: 1-indexed (2 to 25)
        next_q_num = state.question_count + 1
        next_phase = state.get_phase(next_q_num)
        next_topic = state.get_topic_for_question(next_q_num)
        time_limit = state.get_time_limit_seconds(next_q_num)
        image_url = None

        if next_phase == "core":
            next_q = await self._generate_core_question(state, next_q_num, next_topic)
            next_question = next_q["question"]
            next_topic = next_q.get("topic", next_topic)
            options = None
            image_url = None
        else:
            # Rapid-fire 4-option MCQ (30s)
            # Questions 18, 19, 20 are the designated 3 image identification MCQs!
            is_image = False
            image_slot = 0
            if next_q_num == 18:
                is_image = True
                image_slot = 0
            elif next_q_num == 19:
                is_image = True
                image_slot = 1
            elif next_q_num == 20:
                is_image = True
                image_slot = 2

            excluded = state.past_questions + state._recent_questions
            cand_data_copy = dict(state.candidate_data or {})
            if not cand_data_copy.get("crops_grown"):
                for m in state.messages:
                    if m.get("role") == "user":
                        cand_data_copy["crops_grown"] = m.get("content", "").strip()
                        break

            rf_data = await rapid_fire_service.get_rapid_fire_question(
                topic=next_topic,
                excluded_questions=excluded,
                candidate_data=cand_data_copy,
                attempt_number=state.attempt_number,
                is_image_question=is_image,
                image_slot_index=image_slot,
            )
            next_question = rf_data["question"]
            options = rf_data.get("options")
            image_url = rf_data.get("image_url")
            state.add_question(next_question)

        # Store the next question in state with phase, options & image_url metadata
        state.add_message("assistant", next_question, topic=next_topic, phase=next_phase, options=options, image_url=image_url)
        state._pending_question = {
            "question": next_question,
            "topic": next_topic,
            "phase": next_phase,
            "options": options,
            "time_limit_seconds": time_limit,
            "image_url": image_url,
            "correct_option": rf_data.get("correct_option") if next_phase == "rapid_fire" else None,
            "explanation": rf_data.get("explanation") if next_phase == "rapid_fire" else None,
        }

        return {
            "response": next_question,
            "is_complete": False,
            "phase": next_phase,
            "time_limit_seconds": time_limit,
            "options": options,
            "image_url": image_url,
            "question_number": next_q_num,
            "total_questions": state.max_questions,
            "topic": next_topic,
            "messages": state.messages,
            "qa_pairs": state.qa_pairs,
            "rapid_fire_timeouts_count": state.rapid_fire_timeouts_count,
        }
    
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

    TOPIC_FALLBACKS: Dict[str, List[str]] = {
        "agricultural_concepts": [
            # Attempt 1 (Questions 1 & 2)
            "How do you assess soil texture and organic matter content in a farm field?",
            "What factors do you consider when designing a crop rotation plan across seasons?",
            # Attempt 2 (Questions 3 & 4)
            "How do you prepare the seedbed to ensure optimal germination and seedling emergence?",
            "What are the primary differences between C3 and C4 crop physiological pathways in terms of water and light use efficiency?",
            # Attempt 3 (Questions 5 & 6)
            "How does soil cation exchange capacity (CEC) influence nutrient retention and leaching losses in sandy vs. clayey soils?",
            "What agronomic principles guide the selection and management of green manure crops prior to main season sowing?",
        ],
        "crop_management_practices": [
            # Attempt 1
            "What criteria do you use to schedule irrigation across critical growth stages of your crops?",
            "How do you decide optimal plant spacing and seed rate to achieve target plant populations?",
            # Attempt 2
            "What integrated weed management practices do you recommend during early crop establishment?",
            "How do you manage fertigation scheduling in drip-irrigated commercial vegetable crops?",
            # Attempt 3
            "What maturity indices do you monitor to determine the optimal harvest window for grain vs. perishable horticultural crops?",
            "How does intercropping with short-duration pulses improve land equivalent ratio (LER) and resource utilization?",
        ],
        "pest_and_disease_management": [
            # Attempt 1
            "How do you monitor insect pest economic threshold levels (ETL) before deciding to apply chemical or biological controls?",
            "What preventive cultural and chemical measures do you use against fungal foliar blights and rusts?",
            # Attempt 2
            "How do you manage pesticide resistance and rotation of modes of action (MoA) when dealing with persistent sucking pests?",
            "What biological control agents and bio-pesticides do you integrate for managing lepidopteran borer larvae?",
            # Attempt 3
            "How do you establish early quarantine and rogueing protocols to arrest viral disease transmission by insect vectors?",
            "What seed treatment fungicides and bio-priming methods are most effective against soil-borne damping-off and root rot pathogens?",
        ],
        "nutrient_deficiencies": [
            # Attempt 1
            "How do you diagnose and correct zinc or iron chlorosis in standing crops?",
            "What is your approach to calculating balanced N-P-K doses based on soil test recommendations?",
            # Attempt 2
            "How do you differentiate nitrogen deficiency symptoms from drought stress on older leaves?",
            "What visual symptoms distinguish calcium deficiency at apical growing tips from boron deficiency in fruit setting?",
            # Attempt 3
            "How do foliar micronutrient sprays compare with soil basal application in calcareous or high pH soils?",
            "What are the telltale symptoms of magnesium deficiency in broadleaf crops, and what corrective foliar treatment do you recommend?",
        ],
        "weather_related_advisories": [
            # Attempt 1
            "What contingency management steps do you take when facing prolonged dry spells during the monsoon?",
            "How do you protect fruit and vegetable crops from unseasonal frost or sudden heavy rain?",
            # Attempt 2
            "How do you advise farmers to adjust sowing dates based on medium-range weather forecasts?",
            "What field drainage and foliar nutrition steps should be taken immediately following severe storm waterlogging?",
            # Attempt 3
            "How do high temperature heatwaves during flowering or grain filling affect yield, and what mitigation practices do you advise?",
            "What shelterbelt, windbreak, and mulching strategies do you advise to minimize soil moisture evaporation during arid summer spells?",
        ],
        "field_level_technical_issues": [
            # Attempt 1
            "How do you reclaim sodic or saline soil patches with poor infiltration?",
            "What post-harvest handling and godown storage practices do you use to prevent moisture and pest losses in stored grain?",
            # Attempt 2
            "What agronomic and mechanical measures do you take to prevent crop lodging in high-yielding cereal crops near harvest?",
            "How do you identify and mitigate subsoil hardpan compaction caused by repeated shallow tillage?",
            # Attempt 3
            "How do you resolve localized field drainage bottlenecks and salinity buildup caused by long-term canal over-irrigation?",
            "What cold chain handling and pre-cooling techniques are essential to maintain shelf-life for export-grade vegetables?",
        ],
    }

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
        if not text or len(text.strip()) < 15:
            return False
        t = text.strip().lower()
        if "no response" in t or "(no response)" in t or "error" in t:
            return False
        if "?" not in text:
            return False
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

    async def _generate_core_question(self, state: InterviewState, q_num: int, target_topic: str) -> Dict[str, str]:
        """Generate a core agriculture question for the structured assessment (Questions 1-18)."""
        candidate_data = state.candidate_data
        resume_parsed = state.resume_parsed or {}
        guidelines = self._get_question_guidelines()
        system_prompt = get_interview_system()

        # Questions 2 to 13: 2 questions per topic across 6 topics
        q_within_topic = ((q_num - 2) % 2) + 1
        target_topic_readable = target_topic.replace("_", " ").title()

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

        # ── 3. Question number context & Topic Steering ─────────────────────
        prompt += f"\n=== CORE ASSESSMENT QUESTION {q_num} of {state.core_questions_count} (Topic: {target_topic_readable} - Question {q_within_topic} of 2) ===\n"
        prompt += "You are conducting Part 1 of the structured agriculture assessment (Core Questions, 2-minute time limit per question).\n"
        prompt += f"CRITICAL INSTRUCTION: You MUST ask Question {q_within_topic} of 2 specifically about '{target_topic_readable}'. "
        prompt += "Focus on practical, real-world field situations and candidate depth of knowledge.\n"
        prompt += "Ask ONE short, focused question (1-2 lines) requiring an open-ended practical explanation. Return ONLY the question, no preamble.\n"

        # ── 3b. Mandatory Crop-Specific Personalization Rule ────────────────
        crops_context = candidate_data.get("crops_grown") or ""
        if not crops_context and resume_parsed:
            crops_context = resume_parsed.get("crops_grown") or resume_parsed.get("crops") or ""

        greeting_user_msg = ""
        for m in state.messages:
            if m.get("role") == "user":
                greeting_user_msg = m.get("content", "").strip()
                break

        has_crop_context = False
        crop_info_lines = []
        if crops_context:
            crop_info_lines.append(f"Candidate's Stated Crops: {crops_context}")
            has_crop_context = True
        if greeting_user_msg:
            crop_info_lines.append(f"Candidate's Stated Background & Crops (from Question 1 intro): \"{greeting_user_msg}\"")
            has_crop_context = True

        if has_crop_context:
            prompt += "\n=== CROP-SPECIFIC PERSONALIZATION RULE (MANDATORY) ===\n"
            for line in crop_info_lines:
                prompt += f"{line}\n"
            prompt += (
                f"MANDATORY PERSONALIZATION: Frame your question on '{target_topic_readable}' around the specific crops "
                "or crop categories the candidate has hands-on experience in (e.g., if they cultivated tomato, chilli, vegetables, or spices, "
                "contextualize your question to those crops or related horticultural varieties; if they cultivated rice, cotton, or sugarcane, "
                "contextualize to those crop systems). "
                f"Your question MUST remain strictly within the '{target_topic_readable}' topic, but must test their knowledge through their stated crops "
                "rather than asking about unrelated generic crops.\n"
            )

        # ── 4. Question guidelines ──────────────────────────────────────────
        prompt += f"\n=== QUESTION GUIDELINES ===\n{guidelines}\n"

        # ── 4b. Anti-Cheating Cross-Attempt Deduplication Rule ──────────────
        all_excluded = state.past_questions + state._recent_questions
        if all_excluded:
            prompt += f"\n=== ANTI-CHEAT QUESTION DEDUPLICATION RULE (ATTEMPT #{state.attempt_number}) ===\n"
            prompt += "To prevent candidates from memorising questions across attempts, you MUST NOT ask questions already encountered.\n"
            if state.past_questions:
                prompt += "Questions already asked in PREVIOUS ATTEMPTS (DO NOT REPEAT):\n"
                for idx, pq in enumerate(state.past_questions[:15], 1):
                    prompt += f"  {idx}. {pq}\n"
            if state._recent_questions:
                prompt += "Questions already asked in THIS INTERVIEW SESSION (DO NOT REPEAT):\n"
                for idx, rq in enumerate(state._recent_questions, 1):
                    prompt += f"  - {rq}\n"
            prompt += (
                "CRITICAL DEDUPLICATION INSTRUCTION: You MUST NOT repeat any of the above questions, nor close rewordings, "
                "paraphrases, or superficial variations of them. "
                "You MUST generate a completely NOVEL question exploring a different scenario, crop parameter, or technique.\n"
            )

        # ── 5. Chat history ────────────────────────────────────────────────
        prompt += f"\n=== CONVERSATION HISTORY ===\n{state.get_conversation_context()}\n"

        # ── 6. Strict Language Constraint ──────────────────────────────────
        prompt += "\nCRITICAL LANGUAGE RULE: This interview MUST be conducted STRICTLY in English. "
        prompt += "If the candidate answers in Hinglish, Hindi, or any other language, you MUST politely remind them to use English, and ask your next question in English. "
        prompt += "NEVER generate your question or response in Hinglish or Hindi.\n"

        prompt += "\nAsk the next question based on the above context:"

        # Try up to 3 times to get a novel, valid question; fall back on failure
        question_text = None
        current_prompt = prompt
        for attempt_idx in range(3):
            try:
                raw = await llm_service.chat_completion(
                    messages=[{"role": "user", "content": current_prompt}],
                    system_prompt=system_prompt,
                    temperature=0.7 + (attempt_idx * 0.1),
                    max_tokens=600,
                    require_ending_punctuation=True,
                )
                candidate_q = raw.strip() if raw else ""
                if candidate_q and self._is_valid_question(candidate_q):
                    is_dup, matched_q, score = state.is_duplicate_or_similar(candidate_q)
                    if is_dup:
                        logger.warning(
                            f"[InterviewWorkflow] Generated question rejected (similarity={score:.2f} >= 0.60): "
                            f"Generated: '{candidate_q}' | Matched: '{matched_q}'"
                        )
                        current_prompt = prompt + (
                            f"\n\nRETRY INSTRUCTION: Your previous suggested question '{candidate_q}' was REJECTED because it was "
                            f"too similar to an existing question: '{matched_q}'. Generate a COMPLETELY DIFFERENT question."
                        )
                        continue
                    state.add_question(candidate_q)
                    question_text = candidate_q
                    break
            except Exception as e:
                logger.error(f"[InterviewWorkflow] Core question generation attempt {attempt_idx+1} failed: {e}")
                break

        if not question_text or not self._is_valid_question(question_text):
            question_text = self._fallback_core_question(state, target_topic, q_within_topic)
            state.add_question(question_text)

        return {"question": question_text, "topic": target_topic}

    def _fallback_core_question(self, state: InterviewState, topic: str, q_within_topic: int = 1) -> str:
        """Return a topic-matched fallback core question avoiding past and recent questions.
        Partitions candidates across attempts so Attempt 1 gets [0,1], Attempt 2 [2,3], Attempt 3 [4,5].
        """
        candidates = list(self.TOPIC_FALLBACKS.get(topic, []))
        if not candidates:
            candidates = list(self.FALLBACK_QUESTIONS)

        att = min(max(1, state.attempt_number), 3)
        base_offset = (att - 1) * 2
        pref_idx = (base_offset + (q_within_topic - 1)) % len(candidates)
        preferred = candidates[pref_idx]
        is_dup, _, _ = state.is_duplicate_or_similar(preferred)
        if not is_dup:
            return preferred

        for cand in candidates:
            is_dup, _, _ = state.is_duplicate_or_similar(cand)
            if not is_dup:
                return cand

        return self._fallback_question(state)

    async def _generate_next_question(self, state: InterviewState) -> Dict[str, str]:
        """Backwards compatibility wrapper for generating questions."""
        q_num = state.question_count + 1
        topic = state.get_topic_for_question(q_num)
        return await self._generate_core_question(state, q_num, topic)

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
        """Return an unused, contextually-chosen fallback question string avoiding past and recent questions."""
        crops = state.candidate_data.get("crops_grown", "") or ""
        farming_bg = str(state.candidate_data.get("farming_background", "")).lower()
        region = state.candidate_data.get("state", "") or ""

        candidates: List[str] = []
        for crop_key, questions in self.CROP_FALLBACKS.items():
            if crop_key in crops.lower():
                candidates.extend(questions)
        if "vegetable" in farming_bg:
            candidates.extend(self.FALLBACK_QUESTIONS)
        if region:
            candidates.append(f"What farming challenges are most pressing in {region} right now?")
        candidates.extend(self.FALLBACK_QUESTIONS)

        # Select the first candidate that is NOT similar to past or recent questions
        for cand in candidates:
            is_dup, _, _ = state.is_duplicate_or_similar(cand)
            if not is_dup:
                return cand

        # Fallback index offset if all are somehow exhausted
        idx = (len(state.messages) + state.attempt_number * 3) % len(self.FALLBACK_QUESTIONS)
        return self.FALLBACK_QUESTIONS[idx]
    
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
        
        # DB fallback: reconstruct a lightweight state-like object from MongoDB
        from app.db.mongodb import get_sync_db
        import json
        db = get_sync_db()
        try:
            session = db.interview_sessions.find_one({"_id": interview_id})
            interview_data = session.get("interview_data") if session else None
            if interview_data:
                try:
                    data = interview_data if isinstance(interview_data, dict) else json.loads(interview_data)
                    from types import SimpleNamespace
                    ns = SimpleNamespace(
                        candidate_data=data.get("candidate_data", {}),
                        qa_pairs=data.get("qa_pairs", []),
                    )
                    return ns
                except Exception:
                    pass
        finally:
            pass
        
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
        
        # 3. DB fallback: different worker or after restart — MongoDB interview_sessions
        from app.db.mongodb import get_sync_db
        import json
        db = get_sync_db()
        try:
            session = db.interview_sessions.find_one({"_id": interview_id})
            if session:
                interview_data = session.get("interview_data")
                if interview_data:
                    try:
                        data = interview_data if isinstance(interview_data, dict) else json.loads(interview_data)
                        return data.get("messages", [])
                    except Exception:
                        pass
        finally:
            pass
        
        return None


# Singleton instance
interview_workflow = InterviewWorkflow()