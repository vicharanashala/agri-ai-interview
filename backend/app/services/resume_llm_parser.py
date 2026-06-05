"""
LLM-based resume parser — uses Gemini to extract structured data from raw resume text.
Called asynchronously after a resume is uploaded.
"""

import json
import os
import re
from typing import Dict, Any, Optional

# Load skills taxonomy for normalization
_TAXONOMY_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "skills_taxonomy.json")
_SKILL_TAXONOMY: Dict[str, Any] = {}
if os.path.exists(_TAXONOMY_PATH):
    with open(_TAXONOMY_PATH) as f:
        _SKILL_TAXONOMY = json.load(f)

# Build flat lookup for fuzzy matching
_ALL_SKILLS: list[str] = []
_CATEGORY_MAP: Dict[str, str] = {}
for category_key, category_data in _SKILL_TAXONOMY.get("categories", {}).items():
    label = category_data.get("label", category_key)
    for skill in category_data.get("skills", []):
        _ALL_SKILLS.append(skill)
        _CATEGORY_MAP[skill.lower()] = label


# ── Prompt Templates ──────────────────────────────────────────────────────────

RESUME_PARSE_SYSTEM_PROMPT = """You are an expert resume parser and career analyst.
Given raw resume text, extract structured information and return ONLY a valid JSON object.
Be precise — use the exact field names specified.
IMPORTANT: If a field cannot be determined from the text, use the string "Not Available" — NEVER use null, empty string, or a guess. The skills array may be an empty list if no skills are found.
Do not add any explanatory text. Return ONLY the JSON object."""

RESUME_PARSE_USER_PROMPT = """Extract structured information from this resume text.

Return a JSON object with EXACTLY this structure:
{{
  "name": "Full name (string or null)",
  "email": "Email address (string or null)",
  "phone": "Phone number (string or null)",
  "skills": ["normalised skill 1", "skill 2", ...],
  "experience": [
    {{
      "company": "Company name",
      "title": "Job title",
      "duration": "e.g. 'Jan 2020 - Mar 2023' or '2 years'",
      "highlights": ["key achievement or responsibility 1", "..."]
    }}
  ],
  "education": [
    {{
      "institution": "University/School name",
      "degree": "Degree or qualification",
      "year": "Year or year range"
    }}
  ],
  "summary": "2-3 sentence summary of the candidate's profile",
  "confidence_score": 0.0
}}

IMPORTANT:
- "skills" must be industry-standard tech/role keywords (normalise Python → Python, react.js → React, etc.)
- "confidence_score" is 0.0 to 1.0 — estimate how confident you are in the extraction quality
- "experience[].highlights" — extract 1-3 concrete achievements/responsibilities per role
- If any field cannot be determined from the resume text, use the string "Not Available" — NEVER use null or an empty string
- Return ONLY the JSON object, no markdown fences, no commentary

RESUME TEXT:
---
{raw_text}
---"""


# ── Core parsing ──────────────────────────────────────────────────────────────

async def parse_resume_with_llm(raw_text: str) -> Dict[str, Any]:
    """
    Call the LLM to extract structured data from raw resume text.
    Uses the existing LLMService for API calls.
    Returns the parsed dictionary or a best-effort partial result on error.
    """
    # Import here to avoid circular imports at module load time
    from app.llm.service import llm_service

    if not raw_text or not raw_text.strip():
        return _empty_result()

    user_prompt = RESUME_PARSE_USER_PROMPT.format(raw_text=raw_text[:8000])  # safety cap

    try:
        response = await llm_service.chat_completion(
            messages=[{"role": "user", "content": user_prompt}],
            system_prompt=RESUME_PARSE_SYSTEM_PROMPT,
            temperature=0.2,
            max_tokens=2500,
        )

        # Parse JSON from response
        parsed = _extract_json(response)
        if parsed:
            # Normalize skills against taxonomy
            parsed["skills"] = _normalize_skills(parsed.get("skills", []))
            parsed["confidence_score"] = _clamp_confidence(
                float(parsed["confidence_score"]) if parsed.get("confidence_score") else 0.5
            )
            return parsed
        else:
            return _error_result("Could not parse JSON from LLM response")

    except Exception as e:
        return _error_result(str(e))


def _extract_json(text: str) -> Optional[Dict[str, Any]]:
    """Extract JSON object from LLM text response."""
    import json

    # Try direct parse
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # Try extracting from markdown fences
    match = re.search(r"\{[\s\S]*\}", text)
    if match:
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            pass
    return None


def _normalize_skills(raw_skills: list) -> list[str]:
    """Normalize skills against the taxonomy — fuzzy match + category label deduplication."""
    normalized = []
    for skill in raw_skills:
        if not skill or not isinstance(skill, str):
            continue
        skill_lower = skill.strip().lower()
        if skill_lower in _CATEGORY_MAP:
            normalized.append(skill.strip())
        else:
            # Partial match — check if any taxonomy skill is contained in the raw skill
            for known_skill in _ALL_SKILLS:
                if known_skill.lower() in skill_lower or skill_lower in known_skill.lower():
                    normalized.append(skill.strip())
                    break
            else:
                # Unknown skill — keep it but don't over-normalize
                normalized.append(skill.strip())
    # Deduplicate while preserving order
    seen = set()
    result = []
    for s in normalized:
        if s.lower() not in seen:
            seen.add(s.lower())
            result.append(s)
    return result


def _clamp_confidence(score: float) -> float:
    return max(0.0, min(1.0, score))


def _empty_result() -> Dict[str, Any]:
    """
    Returned when raw_text is empty/unreadable — e.g. scanned PDF or corrupt file.
    All string fields use "Not Available" so downstream JSON consumers never
    receive null and don't need defensive null-checks on every field access.
    confidence_score = 0.0 signals that no real parsing happened.
    """
    return {
        "name": "Not Available",
        "email": "Not Available",
        "phone": "Not Available",
        "skills": [],
        "experience": [],
        "education": [],
        "summary": "No resume content could be extracted. The uploaded file may be a scanned image, password-protected, or in an unsupported format. Candidate details were not parsed.",
        "confidence_score": 0.0,
    }


def _error_result(reason: str) -> Dict[str, Any]:
    """
    Returned when the LLM call itself fails (network, API error, etc.).
    Same "Not Available" pattern as _empty_result — downstream code gets
    consistent string values regardless of why parsing failed.
    confidence_score = 0.0 signals a failed parse.
    """
    return {
        "name": "Not Available",
        "email": "Not Available",
        "phone": "Not Available",
        "skills": [],
        "experience": [],
        "education": [],
        "summary": f"Resume parsing failed: {reason}. Candidate details could not be extracted from the uploaded file.",
        "confidence_score": 0.0,
    }


# ── DB helpers ────────────────────────────────────────────────────────────────

def save_parsed_data(resume_id: str, parsed_data: Dict[str, Any]) -> bool:
    """Write parsed JSON to the Resume record in PostgreSQL."""
    from app.db.database import SessionLocal
    from app.db.models.candidate import Resume

    db = SessionLocal()
    try:
        resume = db.query(Resume).filter(Resume.id == resume_id).first()
        if resume:
            resume.parsedData = json.dumps(parsed_data)
            resume.status = "parsed"
            db.commit()
            return True
        else:
            print(f"[resume_parser] Resume {resume_id} not found")
            return False
    except Exception as e:
        print(f"[resume_parser] Failed to save parsed data: {e}")
        db.rollback()
        return False
    finally:
        db.close()