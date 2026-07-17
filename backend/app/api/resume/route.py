"""
Resume Upload, Download & Parse Endpoints — MongoDB.
"""
from fastapi import APIRouter, HTTPException, UploadFile, File, Form, BackgroundTasks, Query, Depends, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Optional, List
import os
import json
import uuid

from app.db.mongodb import get_sync_db
from app.services.resume_parser import extract_raw_text

router = APIRouter(prefix="/api", tags=["resume"])


def _guess_file_type(filename: str) -> str:
    ext = filename.lower().split(".")[-1]
    if ext == "pdf":
        return "pdf"
    if ext in ("doc", "docx"):
        return "docx"
    return "pdf"


# ── Background task ────────────────────────────────────────────────────────────

def _run_llm_parse(resume_id: str, raw_text: str):
    import asyncio
    from app.services.resume_llm_parser import parse_resume_with_llm, save_parsed_data

    async def _async():
        parsed = await parse_resume_with_llm(raw_text)
        save_parsed_data(resume_id, parsed)

    asyncio.run(_async())


# ── Response models ────────────────────────────────────────────────────────────

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


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.post("/resume/upload", response_model=ResumeUploadResponse)
async def upload_resume(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    candidateId: str = Form(...),
):
    """
    Save uploaded resume to disk and record in MongoDB resumes collection.
    Triggers async LLM parsing in background.
    """
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

    # Store file via pluggable storage (local or GCS)
    from app.core.storage import get_storage, candidate_resume_path
    storage = get_storage()
    storage_path = candidate_resume_path(candidateId, safe_filename)
    content_type_str = "application/pdf" if file_type == "pdf" else "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    await storage.write(storage_path, file_bytes, content_type=content_type_str)

    raw_text = extract_raw_text(file_bytes, file_type)

    db = get_sync_db()
    db.resumes.insert_one({
        "_id": resume_id,
        "candidate_id": candidateId,
        "file_name": file.filename,
        "file_type": file_type,
        "raw_text": raw_text,
        "parsed_data": None,
        "status": "uploaded",
        "storage_path": storage_path,
        "created_at": datetime.now(timezone.utc),
    })

    background_tasks.add_task(_run_llm_parse, resume_id, raw_text or "")

    return ResumeUploadResponse(
        resumeId=resume_id,
        fileName=file.filename,
        fileType=file_type,
        status="uploaded",
    )


from datetime import datetime, timezone


@router.get("/resume/{resume_id}")
async def download_resume(resume_id: str):
    db = get_sync_db()
    resume = db.resumes.find_one({"_id": resume_id})
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")

    storage_path = resume.get("storage_path", "")
    if not storage_path:
        raise HTTPException(status_code=404, detail="Resume file path not found")

    from app.core.storage import get_storage
    storage = get_storage()
    try:
        file_bytes = await storage.read(storage_path)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Resume file not found")

    content_type = "application/pdf" if resume.get("file_type") == "pdf" else "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    from fastapi.responses import Response
    return Response(
        content=file_bytes,
        headers={"Content-Disposition": f"attachment; filename=\"{resume.get('file_name', 'resume.pdf')}\""},
        media_type=content_type,
    )


@router.post("/resume/parse/{resume_id}", response_model=ResumeInfo)
async def trigger_resume_parse(resume_id: str, background_tasks: BackgroundTasks):
    db = get_sync_db()
    resume = db.resumes.find_one({"_id": resume_id})
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")

    raw_text = resume.get("raw_text") or ""
    if not raw_text.strip():
        raise HTTPException(status_code=400, detail="No raw text available — upload a file first")

    db.resumes.update_one({"_id": resume_id}, {"$set": {"status": "parsing"}})

    background_tasks.add_task(_run_llm_parse, resume_id, raw_text)

    return ResumeInfo(
        id=resume["_id"],
        candidateId=resume.get("candidate_id", ""),
        fileName=resume.get("file_name", ""),
        fileType=resume.get("file_type", ""),
        rawText=resume.get("raw_text"),
        parsedData=None,
        status="parsing",
        createdAt=resume.get("created_at", "").isoformat() if resume.get("created_at") else "",
    )


@router.get("/candidate/resume")
async def get_my_resume(request: Request):
    """Get the latest resume for the authenticated candidate."""
    from app.db.mongodb import get_sync_db

    token = request.cookies.get("candidate_session") or request.headers.get("authorization", "").replace("Bearer ", "")
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    from app.core.session import _hash_token
    token_hash = _hash_token(token)
    session = db.sessions.find_one({"token_hash": token_hash})
    if not session:
        raise HTTPException(status_code=401, detail="Invalid session")

    candidate_id = session.get("candidate_id")
    resume = db.resumes.find_one({"candidate_id": candidate_id}, sort=[("created_at", -1)])
    if not resume:
        return {"exists": False}

    return {
        "exists": True,
        "resumeId": str(resume["_id"]),
        "fileName": resume.get("file_name", ""),
        "fileType": resume.get("file_type", ""),
        "status": resume.get("status", "unknown"),
        "createdAt": resume.get("created_at", "").isoformat() if resume.get("created_at") else "",
    }


@router.get("/admin/resumes", response_model=List[ResumeInfo])
async def list_candidate_resumes(candidateId: str):
    db = get_sync_db()
    cursor = db.resumes.find({"candidate_id": candidateId}).sort("created_at", -1)

    result = []
    for r in cursor:
        parsed_data = None
        if r.get("status") == "parsed" and r.get("parsed_data"):
            try:
                parsed_data = json.loads(r["parsed_data"]) if isinstance(r["parsed_data"], str) else r["parsed_data"]
            except Exception:
                pass

        result.append(ResumeInfo(
            id=str(r["_id"]),
            candidateId=r.get("candidate_id", ""),
            fileName=r.get("file_name", ""),
            fileType=r.get("file_type", ""),
            rawText=r.get("raw_text"),
            parsedData=parsed_data,
            status=r.get("status", "unknown"),
            createdAt=r.get("created_at", "").isoformat() if r.get("created_at") else "",
        ))
    return result


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
async def get_skill_match(candidateId: str = Query(...), role: str = Query(...)):
    role_path = os.path.join(os.path.dirname(__file__), "..", "..", "..", "app", "data", "role_requirements.json")
    with open(role_path) as f:
        roles_data = json.load(f)

    roles = roles_data.get("roles", {})
    if role not in roles:
        raise HTTPException(status_code=400, detail=f"Unknown role: {role}. Available: {list(roles.keys())}")

    role_info = roles[role]
    required = set(s.lower() for s in role_info["required"])
    preferred = set(s.lower() for s in role_info["preferred"])

    db = get_sync_db()
    resume = db.resumes.find_one({
        "candidate_id": candidateId,
        "status": "parsed",
    }, sort=[("created_at", -1)])

    if not resume or not resume.get("parsed_data"):
        raise HTTPException(status_code=404, detail="No parsed resume found for this candidate. Resume may still be parsing.")

    try:
        parsed = resume["parsed_data"] if isinstance(resume["parsed_data"], dict) else json.loads(resume["parsed_data"])
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
        requiredMatched=sorted(required & candidate_skills),
        requiredMissing=sorted(required - candidate_skills),
        preferredMatched=sorted(preferred & candidate_skills),
        preferredMissing=sorted(preferred - candidate_skills),
        summary=summary,
    )