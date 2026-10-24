"""
Candidate Document Upload, List & Download Endpoints — Storage + MongoDB metadata.
"""
from fastapi import APIRouter, HTTPException, UploadFile, File, Depends, Request, Response
from pydantic import BaseModel
from typing import Optional, List, Any
from datetime import datetime, timezone
import base64
import hashlib
import hmac
import io
import json
import os
import re
import time
import uuid

from app.db.mongodb import get_sync_db
from app.api.candidate.route import _get_candidate_id_from_request
from bson import ObjectId
from app.core.config import settings

router = APIRouter(prefix="/api/candidate", tags=["candidate-documents"])

MAX_SIZES = {
    "updated_resume": 5 * 1024 * 1024,
    "marksheet_10": 10 * 1024 * 1024,
    "marksheet_12": 10 * 1024 * 1024,
    "grad_marksheets": 10 * 1024 * 1024,
    "grad_certificate": 10 * 1024 * 1024,
    "pg_marksheets": 10 * 1024 * 1024,
    "pg_certificate": 10 * 1024 * 1024,
    "experience_letter": 5 * 1024 * 1024,
    "salary_slips": 5 * 1024 * 1024,
    "aadhaar_front": 5 * 1024 * 1024,
    "aadhaar_back": 5 * 1024 * 1024,
    "pan_front": 5 * 1024 * 1024,
    "pan_back": 5 * 1024 * 1024,
    "bank_details": 5 * 1024 * 1024,
    "other_docs": 5 * 1024 * 1024,
    "noc": 5 * 1024 * 1024,
}

REQUIRED_FIELDS = {
    "updated_resume",
    "marksheet_10",
    "marksheet_12",
    "grad_marksheets",
    "aadhaar_front",
    "aadhaar_back",
    "pan_front",
    "pan_back",
    "bank_details",
}

FIELD_NAMES_MAP = {
    "aadhaar_front": "Aadhaar Card (Front side)",
    "aadhaar_back": "Aadhaar Card (Back side)",
    "pan_front": "PAN Card (Front side)",
    "pan_back": "PAN Card (Back side)",
    "bank_details": "Bank Proof",
    "updated_resume": "Resume / Curriculum Vitae",
    "marksheet_10": "10th Class Marksheet",
    "marksheet_12": "12th Class Marksheet",
    "grad_marksheets": "Graduation Marksheet / Degree Certificate",
    "grad_certificate": "Graduation Degree Certificate",
    "pg_marksheets": "Post-Graduation Marksheet / Degree Certificate",
    "pg_certificate": "Post-Graduation Degree Certificate",
    "noc": "NOC (No Objection Certificate)",
    "experience_letter": "Offer Letter / Experience Letter",
    "salary_slips": "Salary Slips",
    "other_docs": "Supporting Document",
}

_CONTENT_TYPES = {
    "pdf": "application/pdf",
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "png": "image/png",
}


def _guess_file_type(filename: str) -> str:
    ext = filename.lower().split(".")[-1]
    if ext in ["jpg", "jpeg"]: return "jpg"
    if ext == "png": return "png"
    return "pdf"


def _validate_file_bytes(filename: str, content_type: str, field_name: str, file_bytes: bytes) -> None:
    filename = filename or ""
    content_type = content_type or ""
    extension = "." + filename.lower().rsplit(".", 1)[-1] if "." in filename else ""
    allowed_exts = {".pdf", ".jpg", ".jpeg", ".png"}
    if extension not in allowed_exts:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid format for {field_name}. Please upload .jpg, .jpeg, .png, or .pdf only.",
        )

    if not file_bytes:
        raise HTTPException(status_code=400, detail=f"The file for {field_name} is empty.")

    max_size = MAX_SIZES.get(field_name, 5 * 1024 * 1024)
    if len(file_bytes) > max_size:
        raise HTTPException(status_code=400, detail=f"File exceeds {max_size // (1024 * 1024)}MB limit for {field_name}")

    is_pdf = file_bytes.startswith(b"%PDF-")
    is_jpeg = file_bytes.startswith(b"\xff\xd8\xff")
    is_png = file_bytes.startswith(b"\x89PNG\r\n\x1a\n")
    expected_content_types = {
        ".pdf": {"application/pdf"},
        ".jpg": {"image/jpeg", "image/jpg"},
        ".jpeg": {"image/jpeg", "image/jpg"},
        ".png": {"image/png"},
    }
    content_type_matches = content_type in expected_content_types[extension] or content_type in {
        "",
        "application/octet-stream",
    }
    signature_matches = (
        (extension == ".pdf" and is_pdf)
        or (extension in {".jpg", ".jpeg"} and is_jpeg)
        or (extension == ".png" and is_png)
    )
    expected_matches = content_type_matches and signature_matches
    if not expected_matches:
        raise HTTPException(
            status_code=400,
            detail=f"The file contents do not match the declared format for {field_name}.",
        )

    if not is_pdf:
        try:
            from PIL import Image
            with Image.open(io.BytesIO(file_bytes)) as image:
                image.verify()
        except Exception:
            raise HTTPException(status_code=400, detail=f"The image for {field_name} is corrupt or unreadable.")


def _validate_file(file: UploadFile, field_name: str) -> bytes:
    file_bytes = file.file.read()
    _validate_file_bytes(file.filename or "", file.content_type or "", field_name, file_bytes)
    return file_bytes


def _validation_secret() -> bytes:
    secret = settings.DOCUMENT_VALIDATION_SECRET or settings.JWT_SECRET
    return secret.encode("utf-8")


def _issue_validation_token(candidate_id: str, field_name: str, file_bytes: bytes) -> str:
    expires_at = int(time.time()) + settings.DOCUMENT_VALIDATION_TOKEN_TTL_SECONDS
    digest = hashlib.sha256(file_bytes).hexdigest()
    payload = f"{candidate_id}:{field_name}:{digest}:{expires_at}"
    signature = hmac.new(_validation_secret(), payload.encode("utf-8"), hashlib.sha256).hexdigest()
    return base64.urlsafe_b64encode(f"{payload}:{signature}".encode("utf-8")).decode("ascii")


def _verify_validation_token(
    token: str | None,
    candidate_id: str,
    field_name: str,
    file_bytes: bytes,
) -> bool:
    if not token:
        return False
    try:
        decoded = base64.urlsafe_b64decode(token.encode("ascii")).decode("utf-8")
        token_candidate, token_field, token_digest, expires_text, signature = decoded.rsplit(":", 4)
        payload = f"{token_candidate}:{token_field}:{token_digest}:{expires_text}"
        expected = hmac.new(_validation_secret(), payload.encode("utf-8"), hashlib.sha256).hexdigest()
        return (
            hmac.compare_digest(signature, expected)
            and token_candidate == candidate_id
            and token_field == field_name
            and token_digest == hashlib.sha256(file_bytes).hexdigest()
            and int(expires_text) >= int(time.time())
        )
    except (ValueError, UnicodeError, base64.binascii.Error):
        return False


# ── Response models ────────────────────────────────────────────────────────────

class DocumentInfo(BaseModel):
    fieldName: str
    fileIndex: int
    fileName: str
    fileType: str
    storagePath: str
    createdAt: str


class DocumentsListResponse(BaseModel):
    documents: List[DocumentInfo]


class DocumentsUploadResponse(BaseModel):
    success: bool
    message: str
    documents: List[DocumentInfo]


# ── Endpoints ──────────────────────────────────────────────────────────────────

import httpx
from fastapi import Form


class DocumentValidationUnavailable(Exception):
    """Raised when the vision service cannot produce a trustworthy result."""


FIELD_RULES = {
    "aadhaar_front": "Require an Aadhaar FRONT: portrait, identity details, and Aadhaar/Government of India evidence. Reject a back side or any image containing another document.",
    "aadhaar_back": "Require an Aadhaar BACK: address plus Aadhaar or QR evidence. Reject a front side or any image containing another document.",
    "pan_front": "Require a PAN FRONT: Income Tax Department evidence, portrait, and a PAN matching five letters, four digits, one letter. Reject Aadhaar or mixed documents.",
    "pan_back": "Require a PAN BACK with positive PAN-card back-side evidence. Reject Aadhaar front/back, unrelated card backs, and images containing more than one document.",
    "bank_details": "Require genuine bank proof containing a bank name plus account details (account number and/or IFSC). Passbooks and cancelled cheques are valid.",
    "updated_resume": "Require a resume/CV containing a person's education, skills, or work history.",
    "marksheet_10": "Require a Class 10/X/SSLC/Matriculation marksheet with student details and marks/grades. Reject Class 12/XII/HSC documents.",
    "marksheet_12": "Require a Class 12/XII/HSC/Senior Secondary marksheet with student details and marks/grades. Reject Class 10/X/SSLC documents.",
    "grad_marksheets": "Require a graduation marksheet or awarded degree certificate with student details. A letter merely issued by a university is not sufficient.",
    "grad_certificate": "Require an awarded graduation degree certificate with student details and a degree-award statement.",
    "pg_marksheets": "Require a post-graduation marksheet or awarded degree certificate with student details.",
    "pg_certificate": "Require an awarded post-graduation degree certificate with student details and a degree-award statement.",
    "noc": "Require a No Objection Certificate that identifies the candidate, issuer, and permission/no-objection statement.",
    "experience_letter": "Require an offer, experience, or relieving letter with employer and candidate details.",
    "salary_slips": "Require a salary slip/payslip with employer, employee, pay-period, and earnings evidence.",
    "other_docs": "Require a real, legible supporting document. Reject blank, unrelated, placeholder, or mixed-document images.",
}


def _normalise_image(image: Any, crop_card: bool = False, max_dimension: int = 2200) -> bytes:
    from PIL import Image, ImageChops, ImageOps

    image = ImageOps.exif_transpose(image).convert("RGB")
    if crop_card:
        background = Image.new("RGB", image.size, (255, 255, 255))
        diff = ImageChops.difference(image, background)
        diff = ImageChops.add(diff, diff, 2.0, -10)
        bbox = diff.getbbox()
        if bbox:
            width, height = image.size
            x0, y0, x1, y1 = bbox
            if (x1 - x0) < width * 0.90 or (y1 - y0) < height * 0.90:
                image = image.crop((max(0, x0 - 30), max(0, y0 - 30), min(width, x1 + 30), min(height, y1 + 30)))

    image.thumbnail((max_dimension, max_dimension))
    output = io.BytesIO()
    image.save(output, format="JPEG", quality=92)
    return output.getvalue()


def _prepare_vision_images(file_bytes: bytes, filename: str, field_name: str) -> List[str]:
    from PIL import Image

    crop_card = field_name in {"aadhaar_front", "aadhaar_back", "pan_front", "pan_back"}
    school_marksheet = field_name in {"marksheet_10", "marksheet_12"}
    render_dpi = 200 if school_marksheet else 150
    max_dimension = 2600 if school_marksheet else 2200
    if filename.lower().endswith(".pdf"):
        try:
            from pdf2image import convert_from_bytes
            pages = convert_from_bytes(
                file_bytes,
                dpi=render_dpi,
                first_page=1,
                last_page=settings.DOCUMENT_PDF_MAX_PAGES,
            )
        except Exception as exc:
            raise DocumentValidationUnavailable(f"PDF rendering failed: {exc}") from exc
        if not pages:
            raise DocumentValidationUnavailable("The PDF has no renderable pages.")
        images = [
            _normalise_image(page, crop_card=crop_card, max_dimension=max_dimension)
            for page in pages
        ]
    else:
        try:
            with Image.open(io.BytesIO(file_bytes)) as image:
                images = [
                    _normalise_image(image, crop_card=crop_card, max_dimension=max_dimension)
                ]
        except Exception as exc:
            raise DocumentValidationUnavailable(f"Image decoding failed: {exc}") from exc

    return [f"data:image/jpeg;base64,{base64.b64encode(image).decode('ascii')}" for image in images]


def _build_prompt(field_name: str, page_count: int) -> str:
    canonical_name = FIELD_NAMES_MAP[field_name]
    return f"""
You verify uploaded recruitment documents using visible evidence only.
Requested field: {canonical_name}
Number of supplied pages/images: {page_count}

Document-specific rule:
{FIELD_RULES[field_name]}

Reject when the upload is blank, illegible, the wrong document/side, or contains multiple different documents in one image. Inspect every supplied page. For multi-page marksheets, classify the document from the pages collectively. Do not call a genuine document a template merely because it is pale, watermarked, scanned, or has blank margins. Set blank_or_template=true only when explicit dummy/sample/placeholder content is visible or identifying content is absent.

Return ONLY one JSON object with this shape:
{{
  "is_valid": true,
  "detected_document_type": "one concise type",
  "checks": {{
    "document_present": true,
    "image_verifiable": true,
    "multiple_documents_present": false,
    "wrong_document_or_side": false,
    "blank_or_template": false,
    "required_text_present": true,
    "portrait_photo_present": false,
    "address_block_present": false,
    "qr_code_present": false,
    "pan_format_present": false,
    "pan_back_evidence": false,
    "bank_name_present": false,
    "account_details_present": false,
    "student_details_present": false,
    "marks_or_grades_present": false,
    "class_10_evidence": false,
    "class_12_evidence": false,
    "graduation_evidence": false,
    "post_graduation_evidence": false,
    "degree_award_statement_present": false,
    "resume_evidence": false,
    "noc_evidence": false,
    "employment_letter_evidence": false,
    "salary_slip_evidence": false
  }},
  "failed_rules": [],
  "reason": "Short factual explanation"
}}

Use these detected_document_type values where applicable: aadhaar_front, aadhaar_back, pan_front, pan_back, bank_proof, resume, class_10_marksheet, class_12_marksheet, graduation_marksheet, graduation_degree_certificate, post_graduation_marksheet, post_graduation_degree_certificate, noc, offer_letter, experience_letter, relieving_letter, salary_slip, supporting_document, university_letter, unknown, mixed_documents.
""".strip()


def _build_school_level_prompt(page_count: int) -> str:
    return f"""
Classify the school marksheet level using only text visibly present in the supplied document.
Number of supplied pages/images: {page_count}

This is an independent classification. You are not told which upload field the user selected.

Classification rules:
- class_10: explicit evidence such as Class 10, 10th, Class X, Standard X, SSC, SSLC, Matriculation, Secondary School Examination, or an equivalent board examination clearly denoting grade 10.
- class_12: explicit evidence such as Class 12, 12th, Class XII, Standard XII, HSC, Higher Secondary, Senior Secondary, Senior School Certificate Examination, Intermediate, PUC/PU II, or an equivalent board examination clearly denoting grade 12.
- other: visibly a different education level or not a school marksheet.
- unknown: a marksheet may be visible, but its level cannot be established from readable evidence.

Do not infer the level from the candidate's age, examination year, subject names, marks, layout, or filename. Do not guess. The evidence must copy a short visible phrase from the document exactly, without paraphrasing. Pay special attention to the difference between the Roman numerals X and XII and between Secondary School Examination and Senior School Certificate Examination. Inspect all supplied pages collectively.

Return ONLY one JSON object:
{{
  "document_level": "class_10 | class_12 | other | unknown",
  "explicit_level_evidence": ["short visible phrase"],
  "confidence": "high | medium | low"
}}
""".strip()


def _extract_json_object(ai_text: str) -> dict:
    first_brace = ai_text.find("{")
    last_brace = ai_text.rfind("}")
    if first_brace == -1 or last_brace <= first_brace:
        raise DocumentValidationUnavailable("Vision service returned no JSON object.")
    try:
        result = json.loads(ai_text[first_brace:last_brace + 1])
    except json.JSONDecodeError as exc:
        raise DocumentValidationUnavailable("Vision service returned malformed JSON.") from exc
    if not isinstance(result, dict):
        raise DocumentValidationUnavailable("Vision service returned an incomplete result.")
    return result


def _parse_ai_response(ai_text: str) -> dict:
    result = _extract_json_object(ai_text)
    if not isinstance(result, dict) or not isinstance(result.get("checks"), dict):
        raise DocumentValidationUnavailable("Vision service returned an incomplete result.")
    return result


def _infer_school_level_from_evidence(evidence: Any) -> str:
    if not isinstance(evidence, list):
        return "unknown"
    text = " ".join(item for item in evidence if isinstance(item, str)).casefold()
    text = re.sub(r"[-_/]+", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    if not text:
        return "unknown"

    class_12_patterns = (
        r"\bclass\s*(?:12|xii)\b",
        r"\bstandard\s*(?:12|xii)\b",
        r"\b12th\b",
        r"\bsenior\s+(?:secondary|school\s+certificate)\b",
        r"\bhigher\s+secondary\b",
        r"\bhsc\b",
        r"\bintermediate\s+(?:examination|certificate)?\b",
        r"\b(?:pre\s+university|puc|pu\s*ii)\b",
        r"\ball\s+india\s+senior\s+school\s+certificate\b",
    )
    class_10_patterns = (
        r"\bclass\s*(?:10|x)\b",
        r"\bstandard\s*(?:10|x)\b",
        r"\b10th\b",
        r"\bsslc\b",
        r"\bssc\b",
        r"\bmatric(?:ulation)?\b",
        r"(?<!senior )\bsecondary\s+school\s+(?:examination|certificate)\b",
        r"\ball\s+india\s+secondary\s+school\s+examination\b",
    )
    has_class_12 = any(re.search(pattern, text) for pattern in class_12_patterns)
    has_class_10 = any(re.search(pattern, text) for pattern in class_10_patterns)
    if has_class_12 == has_class_10:
        return "unknown"
    return "class_12" if has_class_12 else "class_10"


def _evaluate_school_level(field_name: str, result: dict) -> tuple[bool, str]:
    expected_level = {
        "marksheet_10": "class_10",
        "marksheet_12": "class_12",
    }[field_name]
    detected_level = result.get("document_level")
    evidence = result.get("explicit_level_evidence")
    confidence = result.get("confidence")

    if detected_level not in {"class_10", "class_12", "other", "unknown"}:
        raise DocumentValidationUnavailable("Vision service returned an invalid school-level classification.")
    if detected_level != expected_level:
        expected_label = "Class 10" if expected_level == "class_10" else "Class 12"
        detected_label = {
            "class_10": "Class 10",
            "class_12": "Class 12",
            "other": "a different education level",
            "unknown": "an unclear education level",
        }[detected_level]
        return False, f"This appears to be {detected_label}, not {expected_label}."
    if confidence not in {"high", "medium"}:
        return False, "The marksheet level could not be verified with enough confidence."
    if not isinstance(evidence, list) or not any(isinstance(item, str) and item.strip() for item in evidence):
        return False, "No explicit Class 10/Class 12 evidence was visible on the marksheet."
    evidence_level = _infer_school_level_from_evidence(evidence)
    print(
        "[DocumentValidation] school-level "
        f"field={field_name} model={detected_level} evidence={evidence_level} confidence={confidence}"
    )
    if evidence_level != expected_level:
        if evidence_level in {"class_10", "class_12"}:
            evidence_label = "Class 10" if evidence_level == "class_10" else "Class 12"
            expected_label = "Class 10" if expected_level == "class_10" else "Class 12"
            return False, f"Visible examination text indicates {evidence_label}, not {expected_label}."
        return False, "The marksheet does not contain unambiguous Class 10/Class 12 examination text."
    return True, "The school marksheet level matches the selected field."


def _evaluate_ai_result(field_name: str, result: dict) -> tuple[bool, str]:
    checks = result.get("checks", {})
    reason = str(result.get("reason") or "The document did not satisfy the required checks.")

    if result.get("is_valid") is not True:
        return False, reason
    if checks.get("document_present") is not True or checks.get("image_verifiable") is not True:
        return False, "The document is empty, unreadable, or cannot be verified."
    if checks.get("multiple_documents_present") is True:
        return False, "Upload only one document and the requested side in this field."
    if checks.get("wrong_document_or_side") is True:
        return False, "The uploaded document type or side does not match this field."

    detected = result.get("detected_document_type")
    expected_types = {
        "aadhaar_front": {"aadhaar_front"},
        "aadhaar_back": {"aadhaar_back"},
        "pan_front": {"pan_front"},
        "pan_back": {"pan_back"},
        "bank_details": {"bank_proof"},
        "updated_resume": {"resume"},
        "marksheet_10": {"class_10_marksheet"},
        "marksheet_12": {"class_12_marksheet"},
        "grad_marksheets": {"graduation_marksheet", "graduation_degree_certificate"},
        "grad_certificate": {"graduation_degree_certificate"},
        "pg_marksheets": {"post_graduation_marksheet", "post_graduation_degree_certificate"},
        "pg_certificate": {"post_graduation_degree_certificate"},
        "noc": {"noc"},
        "experience_letter": {"offer_letter", "experience_letter", "relieving_letter"},
        "salary_slips": {"salary_slip"},
        "other_docs": {"supporting_document"},
    }
    if field_name == "other_docs" and detected in {None, "unknown", "mixed_documents"}:
        return False, "The supporting document type could not be verified."
    if field_name != "other_docs" and detected not in expected_types[field_name]:
        return False, f"Detected {detected or 'an unknown document'}, not {FIELD_NAMES_MAP[field_name]}."

    required_checks = {
        "aadhaar_front": ("required_text_present", "portrait_photo_present"),
        "aadhaar_back": ("address_block_present",),
        "pan_front": ("required_text_present", "portrait_photo_present", "pan_format_present"),
        "pan_back": ("pan_back_evidence",),
        "bank_details": ("bank_name_present", "account_details_present"),
        "updated_resume": ("resume_evidence",),
        "marksheet_10": ("student_details_present", "marks_or_grades_present", "class_10_evidence"),
        "marksheet_12": ("student_details_present", "marks_or_grades_present", "class_12_evidence"),
        "grad_certificate": ("student_details_present", "graduation_evidence", "degree_award_statement_present"),
        "pg_certificate": ("student_details_present", "post_graduation_evidence", "degree_award_statement_present"),
        "noc": ("noc_evidence",),
        "experience_letter": ("employment_letter_evidence",),
        "salary_slips": ("salary_slip_evidence",),
    }
    for check_name in required_checks.get(field_name, ()):
        if checks.get(check_name) is not True:
            return False, f"Required evidence is missing: {check_name.replace('_', ' ')}."

    if field_name == "marksheet_10" and checks.get("class_12_evidence") is True:
        return False, "This appears to be a Class 12 marksheet, not Class 10."
    if field_name == "marksheet_12" and checks.get("class_10_evidence") is True:
        return False, "This appears to be a Class 10 marksheet, not Class 12."
    if field_name == "aadhaar_back" and not (
        checks.get("required_text_present") is True or checks.get("qr_code_present") is True
    ):
        return False, "The Aadhaar back lacks Aadhaar text or QR evidence."
    if field_name in {"grad_marksheets", "pg_marksheets"}:
        level_check = "graduation_evidence" if field_name == "grad_marksheets" else "post_graduation_evidence"
        has_content = checks.get("marks_or_grades_present") is True or checks.get("degree_award_statement_present") is True
        if checks.get("student_details_present") is not True or checks.get(level_check) is not True or not has_content:
            return False, "The upload lacks student details and marks/degree-award evidence."

    strong_personalised_evidence = checks.get("student_details_present") is True and (
        checks.get("marks_or_grades_present") is True or checks.get("degree_award_statement_present") is True
    )
    if checks.get("blank_or_template") is True and not strong_personalised_evidence:
        return False, "The upload appears blank, dummy, or template-only."
    return True, reason


def _vision_content(prompt: str, vision_images: List[str]) -> List[dict]:
    content: List[dict] = [{"type": "text", "text": prompt}]
    for index, image_url in enumerate(vision_images, start=1):
        content.append({"type": "text", "text": f"Page/image {index}"})
        content.append({"type": "image_url", "image_url": {"url": image_url}})
    return content


async def _call_vision(content: List[dict], max_tokens: int) -> str:
    payload = {
        "model": settings.DOCUMENT_VISION_MODEL,
        "messages": [{"role": "user", "content": content}],
        "temperature": 0,
        "max_tokens": max_tokens,
    }
    proxy = "http://127.0.0.1:1056" if os.environ.get("TS_DEBUG_ALWAYS_USE_DERP") else None
    try:
        async with httpx.AsyncClient(proxy=proxy) as client:
            response = await client.post(
                settings.DOCUMENT_VISION_URL,
                json=payload,
                timeout=settings.DOCUMENT_VISION_TIMEOUT_SECONDS,
            )
    except Exception as exc:
        raise DocumentValidationUnavailable("AI validation service is temporarily unavailable.") from exc

    if response.status_code != 200:
        print(f"Document vision error {response.status_code}: {response.text[:500]}")
        raise DocumentValidationUnavailable("AI validation service is temporarily unavailable.")
    try:
        ai_text = response.json()["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError, ValueError) as exc:
        raise DocumentValidationUnavailable("Vision service returned an invalid response envelope.") from exc
    if not isinstance(ai_text, str):
        raise DocumentValidationUnavailable("Vision service returned non-text output.")
    return ai_text


async def _run_ai_validation(file_bytes: bytes, filename: str, field_name: str) -> tuple[bool, str]:
    vision_images = _prepare_vision_images(file_bytes, filename, field_name)

    if field_name in {"marksheet_10", "marksheet_12"}:
        level_content = _vision_content(_build_school_level_prompt(len(vision_images)), vision_images)
        level_text = await _call_vision(level_content, max_tokens=300)
        level_valid, level_reason = _evaluate_school_level(field_name, _extract_json_object(level_text))
        if not level_valid:
            return False, level_reason

    content = _vision_content(_build_prompt(field_name, len(vision_images)), vision_images)
    ai_text = await _call_vision(content, max_tokens=1000)
    return _evaluate_ai_result(field_name, _parse_ai_response(ai_text))


@router.post("/validate-single")
async def validate_single_document(
    request: Request,
    file: UploadFile = File(...),
    field_name: str = Form(...),
):
    candidate_id = _get_candidate_id_from_request(request)
    if field_name not in FIELD_NAMES_MAP:
        return {"success": False, "reason": "Unknown document field."}

    file_bytes = await file.read()
    try:
        _validate_file_bytes(file.filename or "", file.content_type or "", field_name, file_bytes)

        # Bypass AI Vision validation for updated_resume to prevent memory spikes (pdf2image rasterization)
        # and Cloud Run 503 Service Unavailable errors. Issue validation receipt token directly.
        if field_name == "updated_resume":
            return {
                "success": True,
                "validation_token": _issue_validation_token(candidate_id, field_name, file_bytes),
            }

        is_valid, reason = await _run_ai_validation(file_bytes, file.filename or "", field_name)
    except HTTPException as exc:
        return {"success": False, "reason": exc.detail}
    except DocumentValidationUnavailable as exc:
        return {"success": False, "reason": str(exc)}

    if not is_valid:
        return {"success": False, "reason": reason}
    return {
        "success": True,
        "validation_token": _issue_validation_token(candidate_id, field_name, file_bytes),
    }


@router.post("/documents", response_model=DocumentsUploadResponse)
async def upload_documents(
    request: Request,
    updated_resume: Optional[UploadFile] = File(None),
    marksheet_10: Optional[UploadFile] = File(None),
    marksheet_12: Optional[UploadFile] = File(None),
    grad_marksheets: Optional[UploadFile] = File(None),
    grad_certificate: Optional[UploadFile] = File(None),
    pg_marksheets: Optional[UploadFile] = File(None),
    pg_certificate: Optional[UploadFile] = File(None),
    experience_letter: Optional[UploadFile] = File(None),
    salary_slips: Optional[UploadFile] = File(None),
    aadhaar_front: Optional[UploadFile] = File(None),
    aadhaar_back: Optional[UploadFile] = File(None),
    pan_front: Optional[UploadFile] = File(None),
    pan_back: Optional[UploadFile] = File(None),
    bank_details: Optional[UploadFile] = File(None),
    other_docs: Optional[UploadFile] = File(None),
    noc: Optional[UploadFile] = File(None),
    updated_resume_validation_token: Optional[str] = Form(None),
    marksheet_10_validation_token: Optional[str] = Form(None),
    marksheet_12_validation_token: Optional[str] = Form(None),
    grad_marksheets_validation_token: Optional[str] = Form(None),
    grad_certificate_validation_token: Optional[str] = Form(None),
    pg_marksheets_validation_token: Optional[str] = Form(None),
    pg_certificate_validation_token: Optional[str] = Form(None),
    experience_letter_validation_token: Optional[str] = Form(None),
    salary_slips_validation_token: Optional[str] = Form(None),
    aadhaar_front_validation_token: Optional[str] = Form(None),
    aadhaar_back_validation_token: Optional[str] = Form(None),
    pan_front_validation_token: Optional[str] = Form(None),
    pan_back_validation_token: Optional[str] = Form(None),
    bank_details_validation_token: Optional[str] = Form(None),
    other_docs_validation_token: Optional[str] = Form(None),
    noc_validation_token: Optional[str] = Form(None),
):
    candidate_id = _get_candidate_id_from_request(request)
    db = get_sync_db()

    # Verify candidate exists — handle both ObjectId and string IDs consistently
    try:
        cand = db.candidates.find_one({"_id": ObjectId(candidate_id)})
    except Exception:
        cand = db.candidates.find_one({"_id": candidate_id})
    if not cand:
        raise HTTPException(status_code=404, detail="Candidate not found")

    # Block document upload until Foundation Course is verified
    if not cand.get("foundation_course_completed"):
        raise HTTPException(
            status_code=403,
            detail="Foundation Course must be completed before uploading documents.",
        )

    files_to_save = {
        "updated_resume": updated_resume,
        "marksheet_10": marksheet_10,
        "marksheet_12": marksheet_12,
        "grad_marksheets": grad_marksheets,
        "grad_certificate": grad_certificate,
        "pg_marksheets": pg_marksheets,
        "pg_certificate": pg_certificate,
        "experience_letter": experience_letter,
        "salary_slips": salary_slips,
        "aadhaar_front": aadhaar_front,
        "aadhaar_back": aadhaar_back,
        "pan_front": pan_front,
        "pan_back": pan_back,
        "bank_details": bank_details,
        "other_docs": other_docs,
        "noc": noc,
    }
    validation_tokens = {
        "updated_resume": updated_resume_validation_token,
        "marksheet_10": marksheet_10_validation_token,
        "marksheet_12": marksheet_12_validation_token,
        "grad_marksheets": grad_marksheets_validation_token,
        "grad_certificate": grad_certificate_validation_token,
        "pg_marksheets": pg_marksheets_validation_token,
        "pg_certificate": pg_certificate_validation_token,
        "experience_letter": experience_letter_validation_token,
        "salary_slips": salary_slips_validation_token,
        "aadhaar_front": aadhaar_front_validation_token,
        "aadhaar_back": aadhaar_back_validation_token,
        "pan_front": pan_front_validation_token,
        "pan_back": pan_back_validation_token,
        "bank_details": bank_details_validation_token,
        "other_docs": other_docs_validation_token,
        "noc": noc_validation_token,
    }

    missing_fields = sorted(field_name for field_name in REQUIRED_FIELDS if files_to_save.get(field_name) is None)
    if missing_fields:
        raise HTTPException(
            status_code=400,
            detail=f"Missing required documents: {', '.join(missing_fields)}",
        )

    from app.core.storage import get_storage, candidate_docs_path

    uploaded: List[DocumentInfo] = []
    saved_docs = []
    now = datetime.now(timezone.utc)

    try:
        for field_name, file in files_to_save.items():
            if file is None:
                continue

            try:
                file_bytes = _validate_file(file, field_name)
            except HTTPException:
                raise
            except Exception as e:
                raise HTTPException(status_code=400, detail=f"Invalid file for {field_name}: {str(e)}")

            if not _verify_validation_token(
                validation_tokens.get(field_name),
                candidate_id,
                field_name,
                file_bytes,
            ):
                raise HTTPException(
                    status_code=400,
                    detail=f"{FIELD_NAMES_MAP[field_name]} was not validated, changed after validation, or its validation expired. Please choose the file again.",
                )

            file_type = _guess_file_type(file.filename)

            # Get next fileIndex for this field
            existing_count = db.candidate_documents.count_documents({
                "candidate_id": candidate_id,
                "field_name": field_name,
            })
            file_index = existing_count + 1

            # Write to storage
            storage = get_storage()
            safe_filename = f"{uuid.uuid4()}_{file.filename}"
            storage_path = candidate_docs_path(candidate_id, field_name, safe_filename)
            content_type_str = _CONTENT_TYPES.get(file_type, "application/octet-stream")
            try:
                await storage.write(storage_path, file_bytes, content_type=content_type_str)
            except Exception as e:
                import traceback
                tb = traceback.format_exc()
                print(f"[DocumentUploadError] Failed to write file to {settings.STORAGE_BACKEND}: {str(e)}\n{tb}")
                raise HTTPException(
                    status_code=500,
                    detail=f"Storage backend ({settings.STORAGE_BACKEND}) write failed for {file.filename}: {str(e)}. Bucket: '{settings.GCS_BUCKET_NAME}'."
                )

            doc_id = str(uuid.uuid4())
            doc = {
                "_id": doc_id,
                "candidate_id": candidate_id,
                "field_name": field_name,
                "file_index": file_index,
                "file_name": file.filename,
                "file_type": file_type,
                "storage_path": storage_path,
                "created_at": now,
            }
            db.candidate_documents.insert_one(doc)
            saved_docs.append(doc)

            uploaded.append(DocumentInfo(
                fieldName=field_name,
                fileIndex=file_index,
                fileName=file.filename,
                fileType=file_type,
                storagePath=storage_path,
                createdAt=now.isoformat(),
            ))
    except Exception as e:
        # Rollback: delete already saved documents in this request
        storage = get_storage()
        for doc in saved_docs:
            try:
                await storage.delete(doc["storage_path"])
            except Exception:
                pass
            db.candidate_documents.delete_one({"_id": doc["_id"]})
        raise e

    if not uploaded:
        raise HTTPException(status_code=400, detail="No files provided")

    return DocumentsUploadResponse(
        success=True,
        message="Documents uploaded successfully",
        documents=uploaded,
    )


@router.get("/documents", response_model=DocumentsListResponse)
async def list_documents(request: Request):
    candidate_id = _get_candidate_id_from_request(request)
    db = get_sync_db()

    cursor = db.candidate_documents.find({"candidate_id": candidate_id}).sort("created_at", 1)

    return DocumentsListResponse(documents=[
        DocumentInfo(
            fieldName=doc.get("field_name", ""),
            fileIndex=doc.get("file_index", 1),
            fileName=doc.get("file_name", ""),
            fileType=doc.get("file_type", ""),
            storagePath=doc.get("storage_path", ""),
            createdAt=doc.get("created_at").isoformat() + "Z" if doc.get("created_at") else "",
        )
        for doc in cursor
    ])


@router.get("/documents/{field_name}")
async def download_document(field_name: str, request: Request):
    candidate_id = _get_candidate_id_from_request(request)
    db = get_sync_db()

    idx_param = request.query_params.get("index")

    query = {"candidate_id": candidate_id, "field_name": field_name}
    if idx_param:
        query["file_index"] = int(idx_param)

    docs = list(db.candidate_documents.find(query).sort("file_index", 1))

    if not docs:
        raise HTTPException(status_code=404, detail="Document not found")

    if len(docs) == 1:
        doc = docs[0]
        storage_path = doc.get("storage_path", "")
        if not storage_path:
            raise HTTPException(status_code=404, detail="Document storage path not found")

        from app.core.storage import get_storage
        storage = get_storage()
        try:
            file_bytes = await storage.read(storage_path)
        except FileNotFoundError:
            raise HTTPException(status_code=404, detail="Document file not found in storage")

        media_type = _CONTENT_TYPES.get(doc.get("file_type", ""), "application/octet-stream")
        return Response(
            content=file_bytes,
            media_type=media_type,
            headers={"Content-Disposition": f'attachment; filename="{doc.get("file_name", "")}"'},
        )

    # Multiple files — return list
    return {
        "fieldName": field_name,
        "files": [
            {
                "fileIndex": d.get("file_index"),
                "fileName": d.get("file_name"),
                "fileType": d.get("file_type"),
                "createdAt": d.get("created_at").isoformat() + "Z" if d.get("created_at") else "",
            }
            for d in docs
        ],
    }


@router.delete("/documents/{field_name}")
async def delete_documents(field_name: str, request: Request):
    candidate_id = _get_candidate_id_from_request(request)
    db = get_sync_db()

    idx_param = request.query_params.get("index")
    query = {"candidate_id": candidate_id, "field_name": field_name}
    if idx_param:
        query["file_index"] = int(idx_param)

    docs = list(db.candidate_documents.find(query))
    if not docs:
        raise HTTPException(status_code=404, detail="No documents found to delete")

    # Delete files from storage
    from app.core.storage import get_storage
    storage = get_storage()
    for doc in docs:
        storage_path = doc.get("storage_path", "")
        if storage_path:
            try:
                await storage.delete(storage_path)
            except FileNotFoundError:
                pass  # Already gone, fine

    db.candidate_documents.delete_many(query)

    return {"success": True, "deleted": len(docs)}
