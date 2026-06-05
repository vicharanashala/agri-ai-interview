"""
FastAPI Resume Upload & Download Endpoints.

POST /api/resume/upload  — save file + extract raw text, store in PostgreSQL
GET  /api/resume/{id}    — serve the original file for download
GET  /api/admin/resumes  — list resumes for a given candidate (for admin table)
"""

from fastapi import APIRouter, HTTPException, UploadFile, File, Form, BackgroundTasks, Query, Depends
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Optional, List
import os
import json
import uuid

from sqlalchemy.orm import Session
from app.db.database import get_db
from app.db.models.candidate import Resume
from app.services.resume_parser import extract_raw_text

router = APIRouter(prefix="/api", tags=["resume"])

UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "..", "uploads", "resumes")


# ── Helpers ────────────────────────────────────────────────────────────────────

def _ensure_upload_dir():
    os.makedirs(UPLOAD_DIR, exist_ok=True)


def _guess_file_type(filename: str) -> str:
    ext = filename.lower().split(".")[-1]
    if ext == "pdf":
        return "pdf"
    if ext in ("doc", "docx"):
        return "docx"
    return "pdf"  # default


# ── Request / Response models ──────────────────────────────────────────────────

class ResumeUploadResponse(BaseModel):
    resumeId: str
    fileName: str
    fileType: str
    status: str


class ResumeInfo(BaseModel):
    id: str
    candidateId: str
    fileName: str
    fileType: str
    rawText: Optional[str]
    parsedData: Optional[dict]
    status: str
    createdAt: str


# ── Background task ────────────────────────────────────────────────────────────

def _run_llm_parse(resume_id: str, raw_text: str):
    import asyncio
    from app.services.resume_llm_parser import parse_resume_with_llm, save_parsed_data

    async def _async():
        parsed = await parse_resume_with_llm(raw_text)
        save_parsed_data(resume_id, parsed)

    asyncio.run(_async())


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.post("/resume/upload", response_model=ResumeUploadResponse)
async def upload_resume(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    candidateId: str = Form(...),
    db: Session = Depends(get_db),
):
    """
    Save uploaded resume to disk and record in PostgreSQL.
    Extracts raw text for admin preview (parsing is server-side async).
    """
    _ensure_upload_dir()

    allowed = {"application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"}
    content_type = file.content_type or ""
    if content_type not in allowed and not file.filename.lower().endswith((".pdf", ".docx")):
        raise HTTPException(status_code=400, detail="Only PDF or DOCX files are allowed")

    file_bytes = await file.read()

    if len(file_bytes) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File size must be less than 5MB")

    file_type = _guess_file_type(file.filename)
    resume_id = str(uuid.uuid4())
    safe_filename = f"{resume_id}_{file.filename}"
    file_path = os.path.join(UPLOAD_DIR, safe_filename)

    with open(file_path, "wb") as f:
        f.write(file_bytes)

    raw_text = extract_raw_text(file_bytes, file_type)

    resume = Resume(
        id=resume_id,
        candidateId=candidateId,
        fileName=file.filename,
        fileType=file_type,
        rawText=raw_text,
        status="uploaded",
    )
    db.add(resume)
    db.commit()

    # Always trigger LLM parsing — even if raw_text is empty (unreadable PDF/DOCX),
    # the parser will return "Not Available" for all fields so downstream uses
    # have consistent, non-null data and don't need defensive null-checks everywhere.
    background_tasks.add_task(_run_llm_parse, resume_id, raw_text or "")

    return ResumeUploadResponse(
        resumeId=resume_id,
        fileName=file.filename,
        fileType=file_type,
        status="uploaded",
    )


@router.get("/resume/{resume_id}")
async def download_resume(resume_id: str, db: Session = Depends(get_db)):
    """
    Serve the original resume file for download.
    Looks up the file by resumeId and returns it as an attachment.
    """
    resume = db.query(Resume).filter(Resume.id == resume_id).first()
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")

    safe_filename = f"{resume_id}_{resume.fileName}"
    file_path = os.path.join(UPLOAD_DIR, safe_filename)

    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Resume file not found on disk")

    return FileResponse(
        path=file_path,
        filename=resume.fileName,
        media_type="application/octet-stream",
    )


@router.post("/resume/parse/{resume_id}", response_model=ResumeInfo)
async def trigger_resume_parse(
    resume_id: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """
    Re-trigger LLM parsing for an existing resume.
    Useful when rawText was empty during upload or parsing failed.
    """
    resume = db.query(Resume).filter(Resume.id == resume_id).first()
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")

    raw_text = resume.rawText or ""
    if not raw_text.strip():
        raise HTTPException(status_code=400, detail="No raw text available — upload a file first")

    resume.status = "parsing"
    db.commit()

    background_tasks.add_task(_run_llm_parse, resume_id, raw_text)

    return ResumeInfo(
        id=resume.id,
        candidateId=resume.candidateId,
        fileName=resume.fileName,
        fileType=resume.fileType,
        rawText=resume.rawText,
        parsedData=None,
        status="parsing",
        createdAt=resume.createdAt.isoformat() if resume.createdAt else "",
    )


@router.get("/admin/resumes", response_model=List[ResumeInfo])
async def list_candidate_resumes(candidateId: str, db: Session = Depends(get_db)):
    """
    Return all resumes for a given candidate (newest first).
    Used by the admin dashboard to show resume status in the candidates table.
    """
    resumes = (
        db.query(Resume)
        .filter(Resume.candidateId == candidateId)
        .order_by(Resume.createdAt.desc())
        .all()
    )

    result = []
    for r in resumes:
        parsed_data = None
        if r.status == "parsed" and r.parsedData:
            try:
                parsed_data = json.loads(r.parsedData)
            except Exception:
                pass

        result.append(ResumeInfo(
            id=r.id,
            candidateId=r.candidateId,
            fileName=r.fileName,
            fileType=r.fileType,
            rawText=r.rawText,
            parsedData=parsed_data,
            status=r.status,
            createdAt=r.createdAt.isoformat() if r.createdAt else "",
        ))
    return result


# ── Skills Match ──────────────────────────────────────────────────────────────

class SkillMatchResponse(BaseModel):
    candidateId: str
    role: str
    roleLabel: str
    overallScore: float
    requiredMatch: float
    preferredMatch: float
    requiredMatched: List[str]
    requiredMissing: List[str]
    preferredMatched: List[str]
    preferredMissing: List[str]
    summary: str


@router.get("/admin/resume/match", response_model=SkillMatchResponse)
async def get_skill_match(
    candidateId: str = Query(...),
    role: str = Query(...),
    db: Session = Depends(get_db),
):
    """
    Compare a candidate's parsed resume skills against a role's requirements.
    Returns match percentage + breakdown of matched/missing required & preferred skills.
    """
    role_path = os.path.join(os.path.dirname(__file__), "..", "..", "..", "app", "data", "role_requirements.json")
    with open(role_path) as f:
        roles_data = json.load(f)

    roles = roles_data.get("roles", {})
    if role not in roles:
        raise HTTPException(status_code=400, detail=f"Unknown role: {role}. Available: {list(roles.keys())}")

    role_info = roles[role]
    required = set(s.lower() for s in role_info["required"])
    preferred = set(s.lower() for s in role_info["preferred"])

    resume = (
        db.query(Resume)
        .filter(Resume.candidateId == candidateId, Resume.status == "parsed")
        .order_by(Resume.createdAt.desc())
        .first()
    )

    if not resume or not resume.parsedData:
        raise HTTPException(status_code=404, detail="No parsed resume found for this candidate. Resume may still be parsing.")

    try:
        parsed = json.loads(resume.parsedData)
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to parse resume data.")

    candidate_skills = set(s.lower() for s in parsed.get("skills", []))

    req_matched = required & candidate_skills
    req_missing = required - candidate_skills
    pref_matched = preferred & candidate_skills
    pref_missing = preferred - candidate_skills

    required_score = len(req_matched) / len(required) if required else 1.0
    preferred_score = len(pref_matched) / len(preferred) if preferred else 1.0
    overall = (required_score * 0.7) + (preferred_score * 0.3)

    if overall >= 0.8:
        summary = "Strong match — candidate meets most required skills."
    elif overall >= 0.5:
        summary = "Partial match — candidate meets some required skills. Consider interview."
    else:
        summary = "Weak match — significant skill gaps for this role."

    return SkillMatchResponse(
        candidateId=candidateId,
        role=role,
        roleLabel=role_info["label"],
        overallScore=round(overall, 2),
        requiredMatch=round(required_score, 2),
        preferredMatch=round(preferred_score, 2),
        requiredMatched=sorted(required & candidate_skills, key=lambda s: s),
        requiredMissing=sorted(required - candidate_skills, key=lambda s: s),
        preferredMatched=sorted(preferred & candidate_skills, key=lambda s: s),
        preferredMissing=sorted(preferred - candidate_skills, key=lambda s: s),
        summary=summary,
    )