"""Deterministic checks on facts the vision model extracts from an uploaded document."""
import re
from typing import Any, Dict, Optional, Tuple

EDUCATION_LEVELS = {
    "marksheet_10": "10",
    "marksheet_12": "12",
    "grad_marksheets": "graduation",
    "grad_certificate": "graduation",
    "pg_marksheets": "postgraduation",
    "pg_certificate": "postgraduation",
}

LEVEL_NAMES = {
    "10": "Class 10",
    "12": "Class 12",
    "graduation": "graduation",
    "postgraduation": "post-graduation",
}

NAME_CHECKED_FIELDS = {"aadhaar_front", "pan_front"}
SINGLE_SIDE_FIELDS = {"aadhaar_front", "aadhaar_back", "pan_front"}

EXTRACTION_PROMPT = """Look at the supplied document image(s) and report what is visible. Do not judge acceptability.

Return ONLY one JSON object with exactly these keys:
{
  "document_category": "aadhaar | pan | marksheet | degree_certificate | bank_document | other | not_a_document",
  "document_title": "the main printed title of the exam/degree/document exactly as written, or null",
  "education_level": "10 | 12 | graduation | postgraduation | other | null",
  "sides_visible": "front | back | both | unknown",
  "document_count": number of separate physical documents or cards visible,
  "holder_name": "name of the person the document was issued to, in Latin letters as printed, or null",
  "image_verifiable": true or false,
  "blank_or_template": true or false
}

Guidance:
- Slight tilt, blur, glare or cropped edges are normal. Set image_verifiable=false only if you cannot tell what the document is.
- education_level comes from the EXAM TITLE, never from the board name. A board name such as
  "Board of Secondary and Higher Secondary Education" contains both words and says nothing about the level.
  "Secondary School Certificate", SSC, SSLC, Class X, Matriculation => "10".
  "Higher Secondary Certificate", HSC, Senior Secondary, Class XII, Intermediate => "12".
  Bachelor's degree documents => "graduation". Master's / post-graduate documents => "postgraduation".
- sides_visible: "both" when one image shows the front AND the back of the same card.
- holder_name is the holder only, not a parent or institution. Copy surname-first names as printed.
"""

_LEVEL_PATTERNS = [
    ("postgraduation", r"post[\s\-]?graduat|\bmaster|\bm\.?\s?(?:sc|tech|a|com|ed|phil)\b|\bmba\b|\bmca\b|\bpg\s+diploma"),
    ("graduation", r"\bbachelor|\bb\.?\s?(?:sc|tech|a|com|ed|e)\b|\bbba\b|\bbca\b|\bgraduat|\bdegree\b|\bhonou?rs\b"),
    ("12", r"higher\s+secondary\s+(?:school\s+)?cert|senior\s+secondary|senior\s+school\s+cert|\bclass\s*(?:xii|12)\b|\b(?:xii|12th)\b|\bintermediate\b|\bhsc\b|\+\s?2\b|\baissce\b|pre[\s\-]?university"),
    ("10", r"secondary\s+school\s+cert|\bs\.?s\.?c\.?\b|\bsslc\b|\bclass\s*(?:x|10)\b|\b10th\b|matriculation|high\s+school"),
]

_TITLES = {"mr", "mrs", "ms", "miss", "dr", "shri", "smt", "sri", "kumari", "late"}


def classify_education_level(text: Optional[str]) -> Optional[str]:
    if not text:
        return None
    t = " ".join(str(text).lower().split())
    for level, pattern in _LEVEL_PATTERNS:
        if level == "10":
            # "Higher Secondary ..." must not be read as "Secondary ..."
            t = re.sub(r"(?:higher|senior)\s+secondary", " ", t)
        if re.search(pattern, t):
            return level
    return None


def _tokens(name: Optional[str]):
    cleaned = re.sub(r"[^a-z\s]", " ", (name or "").lower())
    return [t for t in cleaned.split() if t and t not in _TITLES]


def _edit_distance(a: str, b: str) -> int:
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb)))
        prev = cur
    return prev[-1]


def _token_match(a: str, b: str) -> bool:
    if a == b:
        return True
    if len(a) == 1 or len(b) == 1:
        return a[0] == b[0]
    shortest = min(len(a), len(b))
    if shortest >= 9:
        return _edit_distance(a, b) <= 2
    if shortest >= 5:
        return _edit_distance(a, b) <= 1
    return False


def names_match(profile_name: str, document_name: Optional[str]) -> bool:
    """Order-insensitive: every word of the shorter name must appear in the longer one."""
    a, b = _tokens(profile_name), _tokens(document_name)
    if not a or not b:
        return False
    small, large = (a, b) if len(a) <= len(b) else (b, a)
    remaining = list(large)
    for tok in small:
        hit = next((i for i, cand in enumerate(remaining) if _token_match(tok, cand)), None)
        if hit is None:
            return False
        remaining.pop(hit)
    return True


def _flag(value: Any) -> bool:
    if isinstance(value, str):
        return value.strip().lower() in ("true", "yes", "1")
    return bool(value)


def _count(extraction: Dict[str, Any]) -> int:
    try:
        return int(extraction.get("document_count") or 1)
    except (TypeError, ValueError):
        return 1


def evaluate_education(field_name: str, extraction: Dict[str, Any]) -> Tuple[bool, Optional[str]]:
    wanted = EDUCATION_LEVELS[field_name]
    category = str(extraction.get("document_category") or "").lower()

    if category == "not_a_document" or _flag(extraction.get("blank_or_template")):
        return False, "This does not look like a real document. Please upload the actual document."
    if category not in ("marksheet", "degree_certificate"):
        return False, f"This does not look like a marksheet or certificate for the {LEVEL_NAMES[wanted]} field."

    level = classify_education_level(extraction.get("document_title")) or str(extraction.get("education_level") or "").lower()
    if level == wanted:
        return True, None
    if level in LEVEL_NAMES:
        return False, (f"This looks like a {LEVEL_NAMES[level]} document, but this field needs the "
                       f"{LEVEL_NAMES[wanted]} marksheet/certificate.")
    if not _flag(extraction.get("image_verifiable", True)):
        return False, "The document is not clear enough to verify. Please upload a clearer photo or scan."
    return False, (f"Could not confirm this is a {LEVEL_NAMES[wanted]} document. "
                   "Please upload a clearer, complete photo or scan.")


def evaluate_identity(field_name: str, extraction: Dict[str, Any], applicant_name: Optional[str]) -> Tuple[bool, Optional[str]]:
    if field_name in SINGLE_SIDE_FIELDS:
        if str(extraction.get("sides_visible") or "").lower() == "both" or _count(extraction) >= 2:
            return False, "This image shows more than one card or side. Please upload only the requested side."

    if applicant_name and _tokens(applicant_name):
        doc_name = extraction.get("holder_name")
        if _tokens(doc_name):
            if not names_match(applicant_name, doc_name):
                return False, (f"The name on this document ({str(doc_name).strip()}) does not match "
                               f"your registered name ({applicant_name.strip()}).")
        elif field_name in NAME_CHECKED_FIELDS:
            return False, ("Could not read the name on this document. "
                           "Please upload a clearer image so it can be matched with your profile.")
    return True, None
