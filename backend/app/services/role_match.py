"""
Role for the admin Match feature only.

Separate from the eligible-role calculation: nothing here is stored, nothing changes `eligible_role`, and the existing
eligibility functions are only called, never changed.

- Candidate has an eligible role (stored or calculated, as shown on the profile): Match returns that same role and
  explains it with the profile's education entries and years of experience.
- Eligible role Not Available (typically older profiles): Match suggests a role from the latest parsed resume's
  education (structured fields from the current parser, or a strict reading of older parses' degree/year text) and
  the profile's years of experience, using the same eligibility rules.
- Completion status: explicit wording first ("completed", "pursuing", "present", "expected" ...). Otherwise, only
  for this feature, a clearly identified end year (the end of a start–end range, or the only year written) decides
  it, recorded as inferred: up to and including the current year is Completed, a later (upcoming) year is ongoing.
  Several unrelated years, a reversed range or no year at all stays Unknown.
- A qualification whose status stays Unknown is left out of the calculation when other qualifications have a known
  status (e.g. a completed B.Sc. still counts when the M.Sc.'s status is unknown); it is marked as not counted.
- Anything missing, unrecognised or ambiguous gives "cannot_be_checked" with the reasons. Nothing else is guessed.
"""
import json
import re
from datetime import date
from typing import Any, Dict, List, Optional, Tuple

from app.api.admin.candidates import _calculated_role, _effective_role, _eligibility_breakdown, _role_source
from app.services.resume_llm_parser import NA, education_terms, term_key

SCHOOL = re.compile(
    r"\b(10th|12th|x|xii|ssc|hsc|sslc|secondary|higher secondary|intermediate|matriculation|matric|class|cbse|icse|"
    r"school|puc)\b", re.I)
PURSUING_WORDS = re.compile(
    r"\b(pursuing|ongoing|currently|present|expected|appearing|in progress|till date|till now|to date)\b", re.I)
COMPLETED_WORDS = re.compile(r"\b(completed|graduated|passed|awarded|conferred)\b", re.I)
YEAR = re.compile(r"\b(?:19|20)\d{2}\b")
# A start–end range: "2018 - 2022", "2018–2022", "2018 to 2022", "Jul 2018 – May 2022"
RANGE = re.compile(r"\b((?:19|20)\d{2})\b[^0-9]{0,15}?(?:-|–|—|\bto\b)[^0-9]{0,15}?\b((?:19|20)\d{2})\b", re.I)
# Words that may surround a discipline in degree text without changing it ("Bachelor of Science in Agriculture",
# "M.Sc. (Agri) Agronomy"). Any other leftover word means the discipline is something else, e.g. "Agribusiness
# Management" is not the generic "Management".
FILLER_WORDS = {
    "in", "of", "&", "with", "the", "hons", "honours", "honors", "degree", "specialisation", "specialization",
    "major", "programme", "program", "course", "bachelor", "bachelors", "master", "masters", "science", "sciences",
    "arts", "technology", "agri", "ag", "dual", "full", "time", "regular",
}
GENERIC_DISCIPLINES = {"Engineering"}  # "Computer Science & Engineering" names Computer Science, not two disciplines
# Fellowships, awards and similar notes beside a qualification ("ICAR Fellow", "JRF", "Gold Medal"): not a discipline
DETAIL_WORDS = re.compile(
    r"\b(fellow|fellowship|scholar|scholarship|medal|medallist|medalist|rank|ranker|topper|award|awardee|jrf|srf|"
    r"net|gate|distinction|merit|dean'?s list)\b", re.I)
# Where a specialisation starts: "M.Sc. (Horticulture) - Fruit Science", "…: Fruit Science", "… specialisation in …"
SPECIALISATION_SPLIT = re.compile(
    r"\s+[-–—|]\s+|\s*:\s+|,?\s*\b(?:speciali[sz]ation|speciali[sz]ing|major(?:ing)?)\b\s*(?:in\b|:)?\s*", re.I)


def _current_year() -> int:
    return date.today().year


def _parsed(resume: Optional[dict]) -> Optional[dict]:
    value = resume.get("parsed_data") if resume else None
    if isinstance(value, str):
        try:
            value = json.loads(value)
        except ValueError:
            return None
    return value if isinstance(value, dict) else None


def _usable_years(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and value >= 0


def _text(value: Any) -> str:
    return value.strip() if isinstance(value, str) and value.strip().lower() not in ("", NA.lower(), "n/a", "na") else ""


def _find(text: str, keys: Dict[str, str]) -> List[Tuple[int, int, str]]:
    """(start, end, value) of keys named as whole words in `text`; a match inside a longer match is dropped."""
    spans = []
    for key, value in keys.items():
        for m in re.finditer(r"(?<![a-z0-9])" + re.escape(key) + r"(?![a-z0-9])", text):
            spans.append((m.start(), m.end(), value))
    return [s for s in spans if not any(o[0] <= s[0] and s[1] <= o[1] and (o[1] - o[0]) > (s[1] - s[0]) for o in spans)]


def _cut(text: str, spans) -> str:
    for start, end, _ in sorted(spans, reverse=True):
        text = text[:start] + " " + text[end:]
    return text


def _scan_keys(keys: Dict[str, str]) -> Dict[str, str]:
    """Keys safe to look for inside free text: very short single-token aliases ("be", "ma", "cs") are left out."""
    return {k: v for k, v in keys.items() if " " in k or len(k) > 2}


def _status(degree: str, year_text: str, start: Any, end: Any) -> Tuple[str, str, str]:
    """(status, basis, evidence). basis: "stated", "inferred from end year" or "not determined"."""
    words = f"{degree} {year_text}"
    pursuing, completed = PURSUING_WORDS.search(words), COMPLETED_WORDS.search(words)
    if pursuing and completed:
        return "Ambiguous", "not determined", f"both {completed.group()!r} and {pursuing.group()!r} are stated"
    if pursuing:
        return "Pursuing", "stated", pursuing.group()
    if completed:
        return "Completed", "stated", completed.group()
    if isinstance(start, int) and isinstance(end, int):  # a clearly identified end year (second year of a range)
        return _from_end_year(end, f"{start}–{end}: end year {end}")
    if isinstance(end, int):  # one clearly identified year (the only year written), taken as the completion year
        return _from_end_year(end, f"single year {end} (taken as the completion year)")
    return "Unknown", "not determined", NA


def _from_end_year(end: int, what: str) -> Tuple[str, str, str]:
    """End year up to and including the current year: Completed; a later (upcoming) year: ongoing. Both inferred."""
    current = _current_year()
    if end <= current:
        return "Completed", "inferred from end year", f"{what} is not later than {current}"
    return "Pursuing", "inferred from end year", f"{what} is later than {current}, so it is treated as ongoing"


def _years(year_text: str) -> Tuple[Any, Any]:
    """(start, end) from a single start–end range; a lone year or several unrelated years give (NA, year/NA)."""
    ranges = {(int(a), int(b)) for a, b in RANGE.findall(year_text)}
    if len(ranges) == 1:
        start, end = ranges.pop()
        if start < end and len(set(YEAR.findall(year_text))) == 2:
            return start, end
    found = sorted({int(y) for y in YEAR.findall(year_text)})
    return NA, (found[0] if len(found) == 1 else NA)


def _discipline_in(key_text: str, discipline_keys: Dict[str, str]) -> str:
    """The one known discipline `key_text` names, "Ambiguous" for two, else NA (also when other words remain)."""
    spans = _find(key_text, _scan_keys(discipline_keys))
    found = {v for _, _, v in spans}
    if len(found) > 1 and found - GENERIC_DISCIPLINES:
        found -= GENERIC_DISCIPLINES
    if len(found) != 1:
        return "Ambiguous" if found else NA
    leftover = set(_cut(key_text, spans).split())
    if leftover - FILLER_WORDS - {w for w in leftover if w.isdigit()}:
        return NA  # the degree names more than the known discipline, so it is not that discipline
    return found.pop()


def _clean(text: str) -> str:
    return text.strip(" -–—:|,.")


def _split_specialisation(degree: str, level_keys: Dict[str, str], discipline_keys: Dict[str, str]):
    """
    (main text, text after a separator, bracketed specialisations, additional details).

    - After a separator (" - ", "–", ":", "specialisation in"): "M.Sc. (Horticulture) - Fruit Science".
    - Brackets: filler only ("(Hons.)", "(Agri)") or naming a level stay in the main text; unknown wording is a
      specialisation ("M.Sc. Horticulture (Fruit Science)"); a known discipline is a specialisation only when the text
      outside the brackets already names a discipline ("M.Sc. Agriculture (Microbiology)"), otherwise it is the
      discipline itself ("Master of Science (Horticulture)").
    - Fellowships, awards and similar ("ICAR Fellow", "JRF", "Gold Medal") are additional details, not disciplines.
    """
    parts = SPECIALISATION_SPLIT.split(degree, maxsplit=1)
    main, after = parts[0], _clean(parts[1]) if len(parts) > 1 else ""
    details: List[str] = []
    if after and DETAIL_WORDS.search(after):
        details.append(after)
        after = ""
    groups = re.findall(r"\(([^()]*)\)", main)
    outside = term_key(re.sub(r"\([^()]*\)", " ", main))
    outside_names_discipline = bool(_find(outside, _scan_keys(discipline_keys)))
    specs: List[str] = []
    for group in groups:
        key = term_key(group)
        if not key or not set(key.split()) - FILLER_WORDS or _find(key, _scan_keys(level_keys)):
            continue  # stays in the main text
        if DETAIL_WORDS.search(group):
            details.append(_clean(group))
        elif _find(key, _scan_keys(discipline_keys)) and not outside_names_discipline:
            continue  # the bracket holds the discipline itself
        else:
            specs.append(_clean(group))
        main = main.replace(f"({group})", " ")
    return main, after, specs, details


def _from_degree_text(entry: dict, level_keys: Dict[str, str], discipline_keys: Dict[str, str]) -> dict:
    """
    Older parses only have free text (degree, year). Strict reading: exactly one known level and one known discipline
    named in the degree text (common spellings allowed), and years only as written.
    """
    degree, year_text = _text(entry.get("degree")), _text(entry.get("year"))
    base = {"degree": degree or NA, "from": "resume (degree text)"}
    if SCHOOL.search(degree):
        return {**base, "level": "School", "discipline": NA, "specialisation": NA, "details": NA, "status": "Unknown", "statusBasis": "not determined",
                "statusEvidence": NA, "startYear": NA, "endYear": NA}
    level_spans = _find(term_key(degree), _scan_keys(level_keys))
    levels = {v for _, _, v in level_spans}
    level = levels.pop() if len(levels) == 1 else ("Ambiguous" if levels else NA)
    main, after, specs, details = _split_specialisation(degree, level_keys, discipline_keys)
    main_key = term_key(main)
    if level not in (NA, "Ambiguous"):
        main_key = _cut(main_key, _find(main_key, _scan_keys(level_keys)))
    discipline = _discipline_in(main_key, discipline_keys)
    if after:
        after_key = term_key(after)
        if discipline == NA:
            discipline = _discipline_in(after_key, discipline_keys)  # "B.Sc. - Agriculture"
        elif discipline != "Ambiguous":
            others = {v for _, _, v in _find(after_key, _scan_keys(discipline_keys))} - {discipline} - GENERIC_DISCIPLINES
            if others:
                discipline = "Ambiguous"  # e.g. "M.Sc. Horticulture - Agronomy": two different known disciplines
            specs.append(after)
    start, end = _years(year_text)
    status, basis, evidence = _status(degree, year_text, start, end)
    return {**base, "level": level, "discipline": discipline, "specialisation": ", ".join(specs) or NA,
            "details": ", ".join(details) or NA, "status": status, "statusBasis": basis, "statusEvidence": evidence,
            "startYear": start, "endYear": end}


def _from_parsed_fields(e: dict) -> dict:
    """Current parser: structured fields (validated at parse time). Unknown status may still come from a clear range."""
    start, end = e.get("start_year", NA), e.get("end_year", NA)
    status, basis, evidence = e.get("status"), "stated", e.get("status_evidence", NA)
    if status not in ("Completed", "Pursuing"):
        if isinstance(start, int) and isinstance(end, int) and start < end:
            status, basis, evidence = _status("", "", start, end)
        else:
            status, basis, evidence = _status("", "", NA, end if isinstance(end, int) else NA)
    return {"degree": _text(e.get("degree")) or NA, "from": "resume (parsed fields)", "level": e.get("level"),
            "discipline": e.get("discipline"), "specialisation": NA, "details": NA, "status": status, "statusBasis": basis, "statusEvidence": evidence,
            "startYear": start, "endYear": end}


def _resume_entries(parsed: dict) -> List[dict]:
    level_keys, discipline_keys = education_terms()
    entries = []
    for e in parsed.get("education") or []:
        if not isinstance(e, dict) or not (_text(e.get("degree")) or _text(e.get("level"))):
            continue
        entries.append(_from_parsed_fields(e) if "level" in e and "status" in e
                       else _from_degree_text(e, level_keys, discipline_keys))
    return entries


def _profile_entries(cand: dict) -> List[dict]:
    return [
        {"degree": NA, "from": "profile", "level": e.get("level") or NA, "discipline": e.get("discipline") or NA, "specialisation": NA, "details": NA,
         "status": e.get("status") or NA, "statusBasis": "profile", "statusEvidence": NA,
         "startYear": NA, "endYear": e.get("yearOfCompletion") or NA}
        for e in cand.get("education") or [] if isinstance(e, dict)
    ]


def _label(e: dict) -> str:
    if e["level"] not in (NA, "Ambiguous", "Other") and e["discipline"] not in (NA, "Ambiguous", "Other"):
        return f"{e['level']} in {e['discipline']}"
    return repr(e["degree"]) if e["degree"] != NA else "a qualification"


def match_role_from_resume(parsed: Optional[dict], years_of_experience: Any) -> Dict[str, Any]:
    """Suggested role from a parsed resume; `issues` lists what is missing when no role can be given."""
    if not parsed or not (isinstance(parsed.get("confidence_score"), (int, float)) and parsed["confidence_score"] > 0):
        return {"role": None, "issues": ["No usable parsed resume (missing, empty or failed parse)."], "education": [],
                "breakdown": None, "notes": []}
    level_keys, discipline_keys = education_terms()
    levels, disciplines = set(level_keys.values()), set(discipline_keys.values())
    education = _resume_entries(parsed)
    college = [e for e in education if e["level"] != "School"]
    known = [e for e in college if e["status"] in ("Completed", "Pursuing", "Ambiguous")]
    # Unknown-status qualifications are left out when others have a known status; alone they cannot be checked.
    unknown = [e for e in college if e not in known]
    counted = known if known else college
    for e in education:
        e["counted"] = e in counted
    issues: List[str] = []
    for e in counted:
        label = repr(e["degree"]) if e["degree"] != NA else "a qualification"
        if e["level"] == "Ambiguous":
            issues.append(f"More than one degree level is named in {label}.")
        elif e["level"] not in levels:
            issues.append(f"Degree level not recognised in {label}.")
        if e["discipline"] == "Ambiguous":
            issues.append(f"More than one discipline is named in {label}.")
        elif e["discipline"] not in disciplines:
            issues.append(f"Discipline not recognised in {label}.")
        if e["status"] == "Ambiguous":
            issues.append(f"The resume states both completed and ongoing for {label}.")
        elif e["status"] not in ("Completed", "Pursuing"):
            detail = "" if e["statusEvidence"] == NA else f" ({e['statusEvidence']})"
            issues.append(f"Completion status is not stated and cannot be inferred for {label}{detail}.")
    if not college:
        issues.append("No college-level qualification in the parsed resume (school entries are not used).")
    if not _usable_years(years_of_experience):
        issues.append("Years of experience are missing in the candidate profile.")
    if issues:
        return {"role": None, "issues": issues, "education": education, "breakdown": None, "notes": []}
    synthetic = {
        "education": [{"level": e["level"], "discipline": e["discipline"], "status": e["status"]} for e in counted],
        "years_of_experience": years_of_experience,
    }
    role = _calculated_role(synthetic)  # existing rules and reliability guards, unchanged
    if role is None:
        return {"role": None, "issues": ["The eligibility rules cannot calculate a role from these details."],
                "education": education, "breakdown": None, "notes": []}
    breakdown = _eligibility_breakdown(synthetic)
    notes = []
    if breakdown.get("internReason") == "no_qualifying_degree":
        notes.append("None of these is a qualifying agricultural qualification under the eligibility rules: "
                     + ", ".join(_label(e) for e in counted) + ". The rules therefore give Intern.")
    elif breakdown.get("internReason") == "pursuing":
        notes.append("A qualification is still being pursued ("
                     + ", ".join(_label(e) for e in counted if e["status"] == "Pursuing")
                     + "), so the rules give Intern.")
    if any(e["statusBasis"] == "inferred from end year" for e in counted):
        notes.append("Completion of at least one qualification is inferred from its end year, not stated in the resume.")
    if unknown:
        notes.append("Not counted because the completion status is not stated: "
                     + ", ".join(_label(e) for e in unknown) + ".")
    return {"role": role, "issues": [], "education": education, "breakdown": breakdown, "notes": notes}


def match_role(cand: dict, latest_resume: Optional[dict]) -> Dict[str, Any]:
    """
    outcome: "eligible_role" (the profile's eligible role, explained), "suggested" (from the resume; not stored) or
    "cannot_be_checked" (with issues). Never stored; never changes the candidate.
    """
    years = cand.get("years_of_experience")
    years_out = years if _usable_years(years) else None
    effective = _effective_role(cand)
    if effective:
        calculated = _calculated_role(cand)
        source = _role_source(cand)
        notes = []
        if source == "stored" and calculated is None:
            notes.append("This role was stored at onboarding. The profile's education or experience details are "
                         "incomplete, so the calculation steps cannot be shown.")
        elif source == "stored" and calculated != effective:
            notes.append(f"This role was stored at onboarding. A calculation from the current profile details gives "
                         f"{calculated}.")
        return {
            "outcome": "eligible_role", "role": effective, "roleSource": source, "yearsOfExperience": years_out,
            "education": _profile_entries(cand), "breakdown": _eligibility_breakdown(cand) if calculated else None,
            "issues": [], "notes": notes,
        }
    from_resume = match_role_from_resume(_parsed(latest_resume), years)
    notes = from_resume["notes"]
    if from_resume["role"]:
        notes = ["Suggested from the latest parsed resume. It is not saved and does not change the eligible role.", *notes]
    return {
        "outcome": "suggested" if from_resume["role"] else "cannot_be_checked",
        "role": from_resume["role"], "roleSource": "resume" if from_resume["role"] else None,
        "yearsOfExperience": years_out, "education": from_resume["education"], "breakdown": from_resume["breakdown"],
        "issues": from_resume["issues"], "notes": notes,
    }
