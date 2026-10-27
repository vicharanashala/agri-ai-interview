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
      "degree": "Degree or qualification, as written",
      "year": "Year or year range, as written",
      "level": "One of the LEVELS below",
      "discipline": "One of the DISCIPLINES below",
      "status": "Completed, Pursuing or Unknown",
      "status_evidence": "The exact words from the resume that state the status",
      "start_year": "Start year as 4 digits",
      "end_year": "End or completion year as 4 digits"
    }}
  ],
  "summary": "2-3 sentence summary of the candidate's profile",
  "confidence_score": 0.0
}}

IMPORTANT:
- "skills" must be industry-standard tech/role keywords (normalise Python → Python, react.js → React, etc.)
- "confidence_score" is 0.0 to 1.0 — estimate how confident you are in the extraction quality
- "experience[].highlights" — extract 1-3 concrete achievements/responsibilities per role
- "education[].level": exactly one of LEVELS. Map wording to it (e.g. "Bachelor of Science" → "B.Sc."). Use "School" for
  10th/12th/secondary/intermediate, "Other" if none fits, "Not Available" if not stated.
- "education[].discipline": exactly one of DISCIPLINES (e.g. "B.Sc. Agriculture" → "Agriculture"). Use "Other" if none
  fits, "Not Available" if not stated or for school entries.
- "education[].status": "Completed" ONLY if the resume explicitly says so (e.g. completed, graduated, passed, degree
  awarded); "Pursuing" ONLY if it explicitly says so (e.g. pursuing, ongoing, currently studying, present, expected).
  Otherwise "Unknown". NEVER decide the status from dates alone.
- "education[].status_evidence": copy the exact words from the resume that state the status; "Not Available" when the
  status is "Unknown".
- "education[].start_year" / "end_year": only years written in the resume for that qualification; a single year is the
  end_year. Use "Not Available" when not written.
- If any field cannot be determined from the resume text, use the string "Not Available" — NEVER use null or an empty string
- Return ONLY the JSON object, no markdown fences, no commentary

LEVELS: {levels}

DISCIPLINES: {disciplines}

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

    levels, disciplines = _education_vocabulary()
    user_prompt = RESUME_PARSE_USER_PROMPT.format(
        raw_text=raw_text[:8000],  # safety cap
        levels=", ".join(sorted(levels)),
        disciplines=", ".join(sorted(disciplines)),
    )

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
            parsed["education"] = _normalize_education(parsed.get("education"), raw_text)
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


# ── Structured education fields ───────────────────────────────────────────────

NA = "Not Available"
EDU_STATUSES = ("Completed", "Pursuing", "Unknown")


def _education_vocabulary() -> tuple[set[str], set[str]]:
    """Levels and disciplines the eligibility rules understand (read-only reuse; "Other…" values excluded)."""
    from app.api.admin.candidates import _EDU_DISCIPLINES, _EDU_LEVELS, _EDU_OTHER_LEVELS

    return {l for l in _EDU_LEVELS if l not in _EDU_OTHER_LEVELS}, {d for d in _EDU_DISCIPLINES if d != "Other"}


def _squash(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip().lower()


def term_key(text: str) -> str:
    """Case/punctuation-insensitive form used to compare degree names: "B.Tech" == "B.Tech." == "b tech"."""
    text = re.sub(r"\band\b", "&", text.lower())
    return re.sub(r"[^a-z0-9&]+", " ", text).strip()


# Common ways resumes write the rules' own values (keys in term_key form). They only map to values the eligibility
# rules already know; a value missing from the rules' lists is ignored.
LEVEL_ALIASES = {
    "btech": "B.Tech.", "bachelor of technology": "B.Tech.", "bachelors of technology": "B.Tech.",
    "be": "B.E.", "bachelor of engineering": "B.E.", "bachelors of engineering": "B.E.",
    "bsc": "B.Sc.", "bachelor of science": "B.Sc.", "bachelors of science": "B.Sc.", "bachelor in science": "B.Sc.",
    "bsc hons": "B.Sc. (Hons.)", "b sc hons": "B.Sc. (Hons.)", "bachelor of science hons": "B.Sc. (Hons.)",
    "bachelor of science honours": "B.Sc. (Hons.)", "bsc honours": "B.Sc. (Hons.)", "b sc honours": "B.Sc. (Hons.)",
    "msc": "M.Sc.", "master of science": "M.Sc.", "masters of science": "M.Sc.", "master in science": "M.Sc.",
    "mtech": "M.Tech.", "master of technology": "M.Tech.", "masters of technology": "M.Tech.",
    "me": "M.E.", "master of engineering": "M.E.",
    "phd": "Ph.D.", "doctor of philosophy": "Ph.D.",
    "ba": "B.A.", "bachelor of arts": "B.A.", "ma": "M.A.", "master of arts": "M.A.",
    "bcom": "B.Com.", "bachelor of commerce": "B.Com.", "mcom": "M.Com.", "master of commerce": "M.Com.",
    "bachelor of computer applications": "BCA", "master of computer applications": "MCA",
    "bachelor of business administration": "BBA", "master of business administration": "MBA",
    "bvsc": "B.V.Sc. & A.H.", "bvsc & ah": "B.V.Sc. & A.H.", "bfsc": "B.F.Sc.", "mvsc": "M.V.Sc.", "mfsc": "M.F.Sc.",
    "bpharm": "B.Pharm.", "mpharm": "M.Pharm.", "diploma": "Diploma", "polytechnic diploma": "Diploma",
}
DISCIPLINE_ALIASES = {
    "computer science & engineering": "Computer Science", "cse": "Computer Science", "cs": "Computer Science",
    "computer science & technology": "Computer Science",
    "electronics & communication engineering": "Electronics & Communication", "ece": "Electronics & Communication",
    "electronics & communications": "Electronics & Communication",
    "information technology & engineering": "Information Technology",
    "business administration": "Business Administration / Management",
    "agricultural sciences": "Agriculture", "agricultural science": "Agriculture",
}


def education_terms() -> tuple[Dict[str, str], Dict[str, str]]:
    """term_key → rules value, for levels and for disciplines (the rules' values plus the aliases above)."""
    levels, disciplines = _education_vocabulary()
    level_keys = {term_key(v): v for v in levels}
    level_keys.update({k: v for k, v in LEVEL_ALIASES.items() if v in levels})
    discipline_keys = {term_key(v): v for v in disciplines}
    discipline_keys.update({k: v for k, v in DISCIPLINE_ALIASES.items() if v in disciplines})
    return level_keys, discipline_keys


def _canonical(value: Any, keys: Dict[str, str], extra: tuple[str, ...]) -> str:
    """The rules value a whole field names (punctuation/aliases allowed) or one of `extra`; else "Other"/Not Available."""
    if not isinstance(value, str) or _squash(value) in ("", NA.lower(), "n/a", "na", "none", "null"):
        return NA
    by_key = {**keys, **{term_key(v): v for v in extra}}
    return by_key.get(term_key(value), "Other")


def _year(value: Any, text_years: set[int]) -> Any:
    """A plausible 4-digit year that also appears in the resume text; otherwise Not Available."""
    try:
        year = int(str(value).strip()[:4])
    except (TypeError, ValueError):
        return NA
    from datetime import date
    return year if 1950 <= year <= date.today().year + 8 and year in text_years else NA


def _normalize_education(entries: Any, raw_text: str) -> list:
    """
    Keeps the original keys (institution, degree, year) and validates the structured ones the model returned:
    level/discipline must be values the eligibility rules know; status needs evidence quoted from the resume text,
    otherwise it becomes "Unknown"; years must appear in the text and be ordered. Nothing is inferred from dates.
    """
    level_keys, discipline_keys = education_terms()
    text = _squash(raw_text or "")
    text_years = {int(y) for y in re.findall(r"\b(?:19|20)\d{2}\b", raw_text or "")}
    result = []
    for entry in entries if isinstance(entries, list) else []:
        if not isinstance(entry, dict):
            continue
        level = _canonical(entry.get("level"), level_keys, ("School",))
        discipline = _canonical(entry.get("discipline"), discipline_keys, ())
        status = entry.get("status") if entry.get("status") in EDU_STATUSES else "Unknown"
        evidence = entry.get("status_evidence")
        evidence = evidence.strip()[:120] if isinstance(evidence, str) and _squash(evidence) not in ("", NA.lower()) else NA
        if status != "Unknown" and (evidence == NA or _squash(evidence) not in text):
            status, evidence = "Unknown", NA  # a status the resume does not visibly state is not trusted
        if status == "Unknown":
            evidence = NA
        start, end = _year(entry.get("start_year"), text_years), _year(entry.get("end_year"), text_years)
        if isinstance(start, int) and isinstance(end, int) and end < start:
            start, end = NA, NA
        result.append({
            **entry,
            "level": level,
            "discipline": NA if level == "School" else discipline,
            "status": status,
            "status_evidence": evidence,
            "start_year": start,
            "end_year": end,
        })
    return result


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
    """Write parsed JSON to the Resume record in MongoDB."""
    from app.db.mongodb import get_sync_db
    db = get_sync_db()
    try:
        result = db.resumes.update_one(
            {"_id": resume_id},
            {"$set": {"parsed_data": parsed_data, "status": "parsed"}},
        )
        if result.matched_count == 0:
            print(f"[resume_parser] Resume {resume_id} not found")
            return False
        return True
    except Exception as e:
        print(f"[resume_parser] Failed to save parsed data: {e}")
        return False