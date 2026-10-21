"""
Admin Candidate Profile — read-only, admin-authenticated view of one candidate.

Endpoints (all require require_admin_auth):
  GET /api/admin/candidates/{candidate_id}/profile
  GET /api/admin/candidates/{candidate_id}/interviews/{interview_id}
  GET /api/admin/candidates/{candidate_id}/resumes/{resume_id}/download
  GET /api/admin/candidates/{candidate_id}/document-files/{document_id}/download
  GET /api/admin/candidates/{candidate_id}/signed-offer-letter/download

Every lookup of a related record (resume, document, interview, offer letter) is scoped to the candidate in the
URL, so a record belonging to another candidate is reported as not found. Nothing here logs candidate PII,
signatures, resume contents or transcripts.
"""
import base64
import binascii
import json
from typing import Any, Dict, List, Optional
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response

from app.db.mongodb import get_sync_db
from app.api.admin.middleware import require_admin_auth
from app.api.admin.candidates import (
    VALID_ROLES,
    _calculated_role,
    _candidate_to_response,
    _effective_role,
    _format_iso,
    _get_id_variants,
    _role_source,
)

router = APIRouter(prefix="/api/admin", tags=["admin-candidate-profile"])

# Declaration slides, in the order the candidate signs them (see frontend/app/declaration/page.tsx).
DECLARATION_SLIDES = [
    ("slide1_aiAssessment", "AI-Based Interview & Assessment Process Declaration"),
    ("slide2_vibePlatform", "ViBe Platform Candidate Consent"),
    ("slide3_groundTruthModule", "Ground Truth Module Consent"),
    ("slide4_documentVerificationDPDP", "Document Verification & DPDP Consent"),
]
_DECLARATION_CORE_FIELDS = {"consentName", "accepted", "acceptedAt", "fullName", "signature"}

_RESUME_CONTENT_TYPES = {
    "pdf": "application/pdf",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}
_DOCUMENT_CONTENT_TYPES = {
    "pdf": "application/pdf",
    "doc": "application/msword",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}

_EDUCATION_KEYS = ("level", "levelOther", "discipline", "disciplineOther", "status", "institution", "yearOfCompletion")


# ── Helpers ───────────────────────────────────────────────────────────────────

def _find_candidate(db, candidate_id: str) -> dict:
    cand = db.candidates.find_one({"_id": {"$in": _get_id_variants(candidate_id)}})
    if not cand:
        raise HTTPException(status_code=404, detail="Candidate not found")
    return cand


def _str_variants(cand: dict) -> List[str]:
    """Related collections (resumes, documents, offer letters) store candidate_id as a string."""
    return [str(cand["_id"])]


def _find_user(db, cand: dict) -> Optional[dict]:
    user_id = cand.get("user_id")
    if not user_id:
        return None
    return db.users.find_one({"_id": {"$in": _get_id_variants(user_id)}})


def _content_disposition(filename: Optional[str], fallback: str) -> str:
    """attachment header that keeps the original (possibly non-ASCII) filename and cannot break the header."""
    name = (filename or "").replace("\r", "").replace("\n", "").replace('"', "").strip() or fallback
    ascii_name = name.encode("ascii", "ignore").decode("ascii").strip() or fallback
    return f"attachment; filename=\"{ascii_name}\"; filename*=UTF-8''{quote(name, safe='')}"


def _parse_json_field(value: Any) -> Any:
    if isinstance(value, str):
        try:
            return json.loads(value)
        except (ValueError, TypeError):
            return None
    return value


def _education_entries(cand: dict) -> List[dict]:
    education = cand.get("education")
    if not isinstance(education, list):
        return []
    return [{k: e.get(k) for k in _EDUCATION_KEYS} for e in education if isinstance(e, dict)]


def _declarations(cand: dict, user: Optional[dict]) -> Dict[str, Any]:
    """
    Same precedence as check_all_declarations_accepted(): the user's declarations (always written by
    POST /declaration), else the candidate's copy.
    """
    raw = (user.get("declarations") if user else None) or cand.get("declarations") or {}
    if not isinstance(raw, dict):
        raw = {}

    records = []
    for key, default_label in DECLARATION_SLIDES:
        slide = raw.get(key)
        if not isinstance(slide, dict):
            records.append({"key": key, "label": default_label, "present": False})
            continue
        extra = {
            k: v for k, v in slide.items()
            if k not in _DECLARATION_CORE_FIELDS and isinstance(v, (str, int, float, bool)) and v != ""
        }
        records.append({
            "key": key,
            "label": default_label,
            "present": True,
            "consentName": slide.get("consentName"),
            "accepted": bool(slide.get("accepted", False)),
            "acceptedAt": _format_iso(slide.get("acceptedAt")),
            "fullName": slide.get("fullName"),
            "signature": slide.get("signature"),
            "extra": extra,
        })

    accepted_at = cand.get("declaration_accepted_at") or (user.get("declarationAcceptedAt") if user else None)
    return {
        "allAccepted": all(r.get("accepted") for r in records),
        "declarationAcceptedAt": _format_iso(accepted_at),
        "source": "user" if (user and user.get("declarations")) else ("candidate" if cand.get("declarations") else None),
        "records": records,
    }


def _interview_sessions(db, cand: dict) -> List[dict]:
    # No projection on interview_data.messages: interview_data may be stored as a JSON string, and a
    # sub-path projection would drop it. Transcripts are simply not copied into the summaries.
    return list(db.interview_sessions.find(
        {"candidate_id": {"$in": _get_id_variants(cand["_id"])}},
    ).sort("started_at", 1))


def _counts_as_attempt(s: dict) -> bool:
    # Same definition as attemptsDone in the candidates list
    return s.get("status") == "completed" and s.get("result") in ("PASS", "FAIL", "WITHDRAWN")


def _re_evaluation(req: Optional[dict]) -> Optional[dict]:
    if not req:
        return None
    return {
        "status": req.get("status"),
        "reason": req.get("reason"),
        "requestedAt": _format_iso(req.get("requested_at")),
        "completedAt": _format_iso(req.get("completed_at")),
        "scoreAfter": req.get("score_after"),
        "resultAfter": req.get("result_after"),
    }


def _interview_summaries(db, cand: dict) -> List[dict]:
    sessions = _interview_sessions(db, cand)
    session_ids = [str(s["_id"]) for s in sessions]
    re_reqs = list(db.re_evaluation_requests.find({"interview_id": {"$in": session_ids}}).sort("requested_at", 1))
    re_req_map = {r["interview_id"]: r for r in re_reqs}  # latest request per interview wins

    results = []
    attempt = 0
    for s in sessions:
        counted = _counts_as_attempt(s)
        if counted:
            attempt += 1
        interview_data = _parse_json_field(s.get("interview_data")) or {}
        evaluation = interview_data.get("evaluation") if isinstance(interview_data, dict) else None
        score = s.get("score")
        if score is None and isinstance(evaluation, dict):
            score = evaluation.get("overall_score")
        results.append({
            "id": str(s["_id"]),
            "status": s.get("status"),
            "result": s.get("result"),
            "score": score,
            "startedAt": _format_iso(s.get("started_at")),
            "completedAt": _format_iso(s.get("completed_at")),
            "endReason": s.get("end_reason"),
            "attempt": attempt if counted else None,
            "hasEvaluation": isinstance(evaluation, dict) and bool(evaluation),
            "reEvaluation": _re_evaluation(re_req_map.get(str(s["_id"]))),
        })
    results.reverse()  # newest first
    return results


def _resumes(db, cand: dict) -> List[dict]:
    result = []
    for r in db.resumes.find({"candidate_id": {"$in": _str_variants(cand)}}).sort("created_at", -1):
        parsed = _parse_json_field(r.get("parsed_data")) if r.get("status") == "parsed" else None
        result.append({
            "id": str(r["_id"]),
            "fileName": r.get("file_name") or "",
            "fileType": r.get("file_type") or "",
            "status": r.get("status") or "unknown",
            "createdAt": _format_iso(r.get("created_at")),
            "parsedData": parsed if isinstance(parsed, dict) else None,
            "rawText": r.get("raw_text"),
        })
    return result


def _documents(db, cand: dict) -> List[dict]:
    cursor = db.candidate_documents.find(
        {"candidate_id": {"$in": _get_id_variants(cand["_id"])}},
        {"storage_path": 0},
    ).sort([("field_name", 1), ("file_index", 1), ("created_at", 1)])
    return [
        {
            "id": str(d["_id"]),
            "fieldName": d.get("field_name") or "",
            "fileIndex": d.get("file_index"),
            "fileName": d.get("file_name") or "",
            "fileType": d.get("file_type") or "",
            "createdAt": _format_iso(d.get("created_at")),
        }
        for d in cursor
    ]


def _signed_offer_letters(db, cand: dict) -> List[dict]:
    # pdf_data (base64 PDF) is never returned here; use the download endpoint.
    cursor = db.signed_offer_letters.find(
        {"candidate_id": {"$in": _get_id_variants(cand["_id"])}},
        {"pdf_data": 0},
    ).sort("created_at", -1)
    return [
        {
            "id": str(o["_id"]),
            "signatureName": o.get("signature_name"),
            "signedAt": _format_iso(o.get("signed_at")),
            "createdAt": _format_iso(o.get("created_at")),
        }
        for o in cursor
    ]


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/candidates/{candidate_id}/profile")
async def get_candidate_profile(candidate_id: str, _admin=Depends(require_admin_auth)):
    db = get_sync_db()
    cand = _find_candidate(db, candidate_id)
    user = _find_user(db, cand)
    user_email = user.get("email") if user else None

    # Same overview fields (phases, attempts, interview/consent status) as the All Candidates table
    overview = _candidate_to_response(cand, user_email).model_dump()

    stored_role = cand.get("eligible_role")
    level = _effective_role(cand)
    pass_threshold = None
    if level:
        from app.services.settings_service import get_evaluation_settings
        pass_threshold = get_evaluation_settings(level).get("pass_threshold")

    consent_withdrawn = bool(cand.get("consent_withdrawn", False))
    return {
        **overview,
        # Genuine completion time only: the list view falls back to updated_at, which is not a completion time.
        # Ground Truth (module) completion has no stored timestamp at all.
        "foundationCompletedAt": _format_iso(cand.get("foundation_completed_at")),
        "userName": user.get("name") if user else None,
        "address": cand.get("address"),
        "pincode": cand.get("pincode"),
        "updatedAt": _format_iso(cand.get("updated_at")),
        "isDeleted": bool(cand.get("is_deleted", False)),
        "deletedAt": _format_iso(cand.get("deleted_at")),
        "profile": {
            "currentRole": cand.get("current_role"),
            "yearsOfExperience": cand.get("years_of_experience"),
            "farmingBackground": cand.get("farming_background"),
            "primaryExpertise": cand.get("primary_expertise"),
            "cropsGrown": cand.get("crops_grown"),
            "farmSize": cand.get("farm_size"),
            "nonAgriConsent": cand.get("non_agri_consent"),
            "isInternshipConsent": cand.get("is_internship_consent"),
        },
        "education": _education_entries(cand),
        # Legacy single-qualification fields (profiles created before education[])
        "legacyEducation": {
            "highestEducation": cand.get("highest_education"),
            "institution": cand.get("institution"),
            "discipline": cand.get("discipline"),
            "disciplineOther": cand.get("discipline_other"),
            "educationStatus": cand.get("education_status"),
        },
        "role": {
            "stored": stored_role if stored_role in VALID_ROLES else None,
            "storedInvalid": stored_role if (stored_role and stored_role not in VALID_ROLES) else None,
            "calculated": _calculated_role(cand),
            "effective": level,
            "source": _role_source(cand),
            "passThreshold": pass_threshold,
        },
        "consent": {
            "status": overview["consentStatus"],
            "accepted": overview["consentAccepted"],
            # True when consent_accepted is not set but is implied by documents_submitted (list-view rule)
            "inferredFromDocuments": bool(
                not cand.get("consent_accepted") and cand.get("documents_submitted") and not consent_withdrawn
            ),
            "timestamp": overview["consentTimestamp"],
            "withdrawn": consent_withdrawn,
            "withdrawnAt": overview["consentWithdrawnAt"],
        },
        "declarations": _declarations(cand, user),
        "resumes": _resumes(db, cand),
        "interviews": _interview_summaries(db, cand),
        "documents": _documents(db, cand),
        "offer": {
            "offerSigned": bool(cand.get("offer_signed", False)),
            "signedLetters": _signed_offer_letters(db, cand),
        },
    }


@router.get("/candidates/{candidate_id}/interviews/{interview_id}")
async def get_candidate_interview_detail(candidate_id: str, interview_id: str, _admin=Depends(require_admin_auth)):
    """Full transcript + evaluation for one interview of this candidate (loaded on demand)."""
    db = get_sync_db()
    cand = _find_candidate(db, candidate_id)
    session = db.interview_sessions.find_one({
        "_id": {"$in": _get_id_variants(interview_id)},
        "candidate_id": {"$in": _get_id_variants(cand["_id"])},
    })
    if not session:
        raise HTTPException(status_code=404, detail="Interview not found for this candidate")

    interview_data = _parse_json_field(session.get("interview_data")) or {}
    if not isinstance(interview_data, dict):
        interview_data = {}
    messages = interview_data.get("messages")
    evaluation = interview_data.get("evaluation")
    return {
        "id": str(session["_id"]),
        "messages": messages if isinstance(messages, list) else [],
        "evaluation": evaluation if isinstance(evaluation, dict) else None,
    }


@router.get("/candidates/{candidate_id}/resumes/{resume_id}/download")
async def download_candidate_resume(candidate_id: str, resume_id: str, _admin=Depends(require_admin_auth)):
    db = get_sync_db()
    cand = _find_candidate(db, candidate_id)
    resume = db.resumes.find_one({"_id": resume_id, "candidate_id": {"$in": _str_variants(cand)}})
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found for this candidate")

    storage_path = resume.get("storage_path")
    if not storage_path:
        raise HTTPException(status_code=404, detail="Resume file not found")

    from app.core.storage import get_storage
    try:
        file_bytes = await get_storage().read(storage_path)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Resume file not found")

    return Response(
        content=file_bytes,
        media_type=_RESUME_CONTENT_TYPES.get(resume.get("file_type"), "application/octet-stream"),
        headers={"Content-Disposition": _content_disposition(resume.get("file_name"), "resume")},
    )


@router.get("/candidates/{candidate_id}/document-files/{document_id}/download")
async def download_candidate_document_file(candidate_id: str, document_id: str, _admin=Depends(require_admin_auth)):
    """Download one specific uploaded document (fields can hold several files)."""
    db = get_sync_db()
    cand = _find_candidate(db, candidate_id)
    doc = db.candidate_documents.find_one({
        "_id": {"$in": _get_id_variants(document_id)},
        "candidate_id": {"$in": _get_id_variants(cand["_id"])},
    })
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found for this candidate")

    storage_path = doc.get("storage_path")
    if not storage_path:
        raise HTTPException(status_code=404, detail="Document file not found")

    from app.core.storage import get_storage
    try:
        file_bytes = await get_storage().read(storage_path)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Document file not found")

    return Response(
        content=file_bytes,
        media_type=_DOCUMENT_CONTENT_TYPES.get(doc.get("file_type"), "application/octet-stream"),
        headers={"Content-Disposition": _content_disposition(doc.get("file_name"), "document")},
    )


@router.get("/candidates/{candidate_id}/signed-offer-letter/download")
async def download_candidate_signed_offer_letter(candidate_id: str, _admin=Depends(require_admin_auth)):
    db = get_sync_db()
    cand = _find_candidate(db, candidate_id)
    record = db.signed_offer_letters.find_one(
        {"candidate_id": {"$in": _get_id_variants(cand["_id"])}},
        sort=[("created_at", -1)],
    )
    if not record or not record.get("pdf_data"):
        raise HTTPException(status_code=404, detail="Signed offer letter not found")

    try:
        pdf_bytes = base64.b64decode(record["pdf_data"].encode("utf-8"), validate=True)
    except (binascii.Error, ValueError, AttributeError):
        raise HTTPException(status_code=500, detail="Stored offer letter is unreadable")

    sig_name = (record.get("signature_name") or "candidate").replace(" ", "_")
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": _content_disposition(f"Signed_Offer_Letter_{sig_name}.pdf", "Signed_Offer_Letter.pdf")},
    )
