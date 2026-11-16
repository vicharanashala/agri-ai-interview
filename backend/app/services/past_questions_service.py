"""
Candidate past questions collection and cross-attempt query utilities.
"""
import json
import logging
from typing import List, Optional, Tuple, Set, Dict, Any

logger = logging.getLogger(__name__)

# Messages from the assistant that are not real questions (e.g. system closings)
NON_QUESTION_ASSISTANT_PHRASES = [
    "thank you for completing",
    "responses have been recorded",
    "interview has ended",
    "evaluating your responses",
    "please wait while",
    "welcome back! please continue",
]

def _get_id_variants(val: Any) -> list:
    """Return both string and ObjectId representations for robust MongoDB querying."""
    if not val:
        return []
    variants = [str(val)]
    try:
        from bson import ObjectId
        if ObjectId.is_valid(str(val)):
            variants.append(ObjectId(str(val)))
    except Exception:
        pass
    return variants

def _is_real_question(text: str) -> bool:
    """Check if the text is a real question rather than a greeting or system notification."""
    if not text or len(text.strip()) < 8:
        return False
    lower = text.lower().strip()
    for phrase in NON_QUESTION_ASSISTANT_PHRASES:
        if phrase in lower:
            return False
    return True

def extract_questions_from_interview_session(session: Dict[str, Any]) -> List[str]:
    """
    Extract all questions asked in an interview session document.
    Inspects qa_pairs, messages, first_question, and questions collections.
    """
    if not isinstance(session, dict):
        return []

    questions: List[str] = []
    seen: Set[str] = set()

    def add_q(q_str: Any):
        if not q_str or not isinstance(q_str, str):
            return
        cleaned = q_str.strip()
        if _is_real_question(cleaned):
            norm = cleaned.lower()
            if norm not in seen:
                seen.add(norm)
                questions.append(cleaned)

    # 1. Inspect interview_data
    interview_data = session.get("interview_data")
    if isinstance(interview_data, str):
        try:
            interview_data = json.loads(interview_data)
        except Exception:
            interview_data = {}
    elif not isinstance(interview_data, dict):
        interview_data = {}

    # From qa_pairs
    qa_pairs = interview_data.get("qa_pairs") or session.get("qa_pairs") or []
    if isinstance(qa_pairs, list):
        for qa in qa_pairs:
            if isinstance(qa, dict):
                add_q(qa.get("question"))

    # From messages
    messages = interview_data.get("messages") or session.get("messages") or []
    if isinstance(messages, list):
        for msg in messages:
            if isinstance(msg, dict):
                role = msg.get("role")
                if role in ("assistant", "ai"):
                    add_q(msg.get("content"))

    # From first_question
    add_q(interview_data.get("first_question"))
    add_q(session.get("first_question"))

    # From legacy questions field if present
    raw_questions = session.get("questions") or interview_data.get("questions") or []
    if isinstance(raw_questions, list):
        for q in raw_questions:
            if isinstance(q, str):
                add_q(q)
            elif isinstance(q, dict):
                add_q(q.get("text") or q.get("question"))

    return questions

def get_candidate_past_questions(
    db,
    candidate_id: str,
    exclude_interview_id: Optional[str] = None
) -> List[str]:
    """
    Query MongoDB for all questions previously asked to a candidate in past interview sessions.
    """
    if not candidate_id:
        return []

    variants = _get_id_variants(candidate_id)
    query: Dict[str, Any] = {"candidate_id": {"$in": variants}}
    if exclude_interview_id:
        query["_id"] = {"$ne": exclude_interview_id}

    try:
        sessions = list(db.interview_sessions.find(query).sort("started_at", 1))
    except Exception as e:
        logger.error(f"[get_candidate_past_questions] Failed to query sessions: {e}")
        return []

    all_questions: List[str] = []
    seen: Set[str] = set()

    for s in sessions:
        session_questions = extract_questions_from_interview_session(s)
        for q in session_questions:
            norm = q.lower().strip()
            if norm not in seen:
                seen.add(norm)
                all_questions.append(q)

    return all_questions

def get_candidate_attempt_info(
    db,
    candidate_id: str,
    current_interview_id: Optional[str] = None
) -> Tuple[int, List[str]]:
    """
    Return (attempt_number, past_questions) for the candidate.
    Attempt number is 1-based (past sessions + 1).
    """
    if not candidate_id:
        return 1, []

    variants = _get_id_variants(candidate_id)
    query: Dict[str, Any] = {
        "candidate_id": {"$in": variants},
        "status": "completed",
    }
    if current_interview_id:
        query["_id"] = {"$ne": current_interview_id}

    try:
        completed_count = db.interview_sessions.count_documents(query)
    except Exception:
        completed_count = 0

    past_questions = get_candidate_past_questions(db, candidate_id, exclude_interview_id=current_interview_id)
    attempt_number = max(1, completed_count + 1)

    return attempt_number, past_questions
