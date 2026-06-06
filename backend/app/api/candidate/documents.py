"""
Candidate Document Upload & List Endpoints.

POST /api/candidate/documents         — upload one or more documents
GET  /api/candidate/documents         — list all submitted documents for current candidate
GET  /api/candidate/documents/{fieldName} — download a specific document
DELETE /api/candidate/documents/{fieldName} — delete all documents for a field
"""
from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Depends, Request
from fastapi.responses import Response
from pydantic import BaseModel
from typing import Optional, List
import base64

from sqlalchemy.orm import Session
from app.db.database import get_db
from app.db.models.candidate import CandidateDocument, Candidate
from app.api.candidate.route import _get_candidate_id_from_request

router = APIRouter(prefix="/api/candidate", tags=["candidate-documents"])

# Allowed file types per spec
ALLOWED_CONTENT_TYPES = {
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}

# Per-field max sizes (in bytes)
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
    "aadhaar": 5 * 1024 * 1024,
    "pan": 5 * 1024 * 1024,
    "bank_details": 5 * 1024 * 1024,
    "other_docs": 5 * 1024 * 1024,
    "noc": 5 * 1024 * 1024,
}

# Required fields for submission
REQUIRED_FIELDS = {"updated_resume", "marksheet_10", "marksheet_12", "aadhaar", "pan", "bank_details"}


# ── Helpers ────────────────────────────────────────────────────────────────────

def _guess_file_type(filename: str) -> str:
    ext = filename.lower().split(".")[-1]
    if ext in ("doc", "docx"):
        return "docx" if ext == "docx" else "doc"
    return "pdf"


def _validate_file(file: UploadFile, field_name: str) -> bytes:
    """Validate file type and size. Returns file bytes."""
    content_type = file.content_type or ""
    if content_type not in ALLOWED_CONTENT_TYPES and not file.filename.lower().endswith((".pdf", ".doc", ".docx")):
        raise HTTPException(status_code=400, detail=f"Only PDF and DOCX files are allowed for {field_name}")

    file_bytes = file.file.read()
    max_size = MAX_SIZES.get(field_name, 5 * 1024 * 1024)
    if len(file_bytes) > max_size:
        max_mb = max_size // (1024 * 1024)
        raise HTTPException(status_code=400, detail=f"File exceeds {max_mb}MB limit for {field_name}")

    return file_bytes


def _get_next_file_index(db: Session, candidate_id: str, field_name: str) -> int:
    """Return the next fileIndex for a given candidate+field (1-based)."""
    existing = db.query(CandidateDocument).filter(
        CandidateDocument.candidateId == candidate_id,
        CandidateDocument.fieldName == field_name,
    ).order_by(CandidateDocument.fileIndex.desc()).first()

    return (existing.fileIndex + 1) if existing else 1


# ── Response models ────────────────────────────────────────────────────────────

class DocumentInfo(BaseModel):
    fieldName: str
    fileIndex: int
    fileName: str
    fileType: str
    createdAt: str


class DocumentsListResponse(BaseModel):
    documents: List[DocumentInfo]


class DocumentsUploadResponse(BaseModel):
    success: bool
    message: str
    documents: List[DocumentInfo]


# ── Endpoints ──────────────────────────────────────────────────────────────────

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
    aadhaar: Optional[UploadFile] = File(None),
    pan: Optional[UploadFile] = File(None),
    bank_details: Optional[UploadFile] = File(None),
    other_docs: Optional[UploadFile] = File(None),
    noc: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db),
):
    """
    Upload one or more candidate documents.
    Multiple files per field are supported (e.g., semester marksheets, payslips).
    Each file is stored as Base64-encoded bytes in CandidateDocument table.
    """
    candidate_id = _get_candidate_id_from_request(request)

    # Check candidate exists
    cand = db.query(Candidate).filter(Candidate.id == candidate_id).first()
    if not cand:
        raise HTTPException(status_code=404, detail="Candidate not found")

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
        "aadhaar": aadhaar,
        "pan": pan,
        "bank_details": bank_details,
        "other_docs": other_docs,
        "noc": noc,
    }

    uploaded: List[DocumentInfo] = []

    for field_name, file in files_to_save.items():
        if file is None:
            continue

        # Validate
        try:
            file_bytes = _validate_file(file, field_name)
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Invalid file for {field_name}: {str(e)}")

        file_type = _guess_file_type(file.filename)
        file_index = _get_next_file_index(db, candidate_id, field_name)

        # Upsert new doc (no delete — append for multi-file fields)
        import uuid
        doc = CandidateDocument(
            id=str(uuid.uuid4()),
            candidateId=candidate_id,
            fieldName=field_name,
            fileIndex=file_index,
            fileName=file.filename,
            fileType=file_type,
            fileData=base64.b64encode(file_bytes).decode("utf-8"),
        )
        db.add(doc)
        uploaded.append(DocumentInfo(
            fieldName=field_name,
            fileIndex=file_index,
            fileName=file.filename,
            fileType=file_type,
            createdAt=doc.createdAt.isoformat() if doc.createdAt else "",
        ))

    if not uploaded:
        raise HTTPException(status_code=400, detail="No files provided")

    db.commit()
    return DocumentsUploadResponse(
        success=True,
        message="Documents uploaded successfully",
        documents=uploaded,
    )


@router.get("/documents", response_model=DocumentsListResponse)
async def list_documents(request: Request, db: Session = Depends(get_db)):
    """List all documents submitted by the current candidate."""
    candidate_id = _get_candidate_id_from_request(request)

    docs = db.query(CandidateDocument).filter(
        CandidateDocument.candidateId == candidate_id
    ).order_by(CandidateDocument.createdAt.asc()).all()

    return DocumentsListResponse(documents=[
        DocumentInfo(
            fieldName=d.fieldName,
            fileIndex=d.fileIndex,
            fileName=d.fileName,
            fileType=d.fileType,
            createdAt=d.createdAt.isoformat() if d.createdAt else "",
        )
        for d in docs
    ])


@router.get("/documents/{field_name}")
async def download_document(field_name: str, request: Request, db: Session = Depends(get_db)):
    """Download all documents for a field, or a specific one via ?index=N."""
    import urllib.parse
    parsed = urllib.parse.urlparse(f"/{field_name}")
    # field_name from path param
    idx_param = request.query_params.get("index")

    candidate_id = _get_candidate_id_from_request(request)

    q = db.query(CandidateDocument).filter(
        CandidateDocument.candidateId == candidate_id,
        CandidateDocument.fieldName == field_name,
    )
    if idx_param:
        q = q.filter(CandidateDocument.fileIndex == int(idx_param))

    docs = q.order_by(CandidateDocument.fileIndex.asc()).all()
    if not docs:
        raise HTTPException(status_code=404, detail="Document not found")

    # If single file, return it directly
    if len(docs) == 1:
        doc = docs[0]
        file_bytes = base64.b64decode(doc.fileData.encode("utf-8"))
        media_types = {
            "pdf": "application/pdf",
            "doc": "application/msword",
            "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        }
        media_type = media_types.get(doc.fileType, "application/octet-stream")
        return Response(
            content=file_bytes,
            media_type=media_type,
            headers={"Content-Disposition": f'attachment; filename="{doc.fileName}"'},
        )

    # Multiple files — return JSON with metadata (frontend will handle multi-download)
    return {
        "fieldName": field_name,
        "files": [
            {
                "fileIndex": d.fileIndex,
                "fileName": d.fileName,
                "fileType": d.fileType,
                "createdAt": d.createdAt.isoformat() if d.createdAt else "",
            }
            for d in docs
        ],
    }


@router.delete("/documents/{field_name}")
async def delete_documents(field_name: str, request: Request, db: Session = Depends(get_db)):
    """Delete all documents for a field, or a specific one via ?index=N."""
    candidate_id = _get_candidate_id_from_request(request)

    idx_param = request.query_params.get("index")
    q = db.query(CandidateDocument).filter(
        CandidateDocument.candidateId == candidate_id,
        CandidateDocument.fieldName == field_name,
    )
    if idx_param:
        q = q.filter(CandidateDocument.fileIndex == int(idx_param))

    deleted = q.all()
    if not deleted:
        raise HTTPException(status_code=404, detail="No documents found to delete")

    for doc in deleted:
        db.delete(doc)

    db.commit()
    return {"success": True, "deleted": len(deleted)}