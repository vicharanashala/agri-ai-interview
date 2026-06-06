"""
Admin Document Management Endpoints.

GET  /api/admin/candidates/{candidate_id}/documents         — list candidate's docs
GET  /api/admin/candidates/{candidate_id}/documents/zip     — download all as ZIP
GET  /api/admin/candidates/{candidate_id}/documents/{fieldName} — download single doc
DELETE /api/admin/candidates/{candidate_id}/documents/{fieldName} — delete single doc
POST /api/admin/candidates/{candidate_id}/send-offer-email  — send Email #3
PATCH /api/admin/candidates/{candidate_id}/documents/reset  — reset docs (allow re-upload)
"""
from fastapi import APIRouter, HTTPException, Depends, Response
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
import base64
import io
import zipfile

from sqlalchemy.orm import Session
from app.db.database import get_db
from app.db.models.candidate import Candidate, CandidateDocument, User
from app.api.admin.middleware import require_admin_auth

router = APIRouter(prefix="/api/admin", tags=["admin-documents"])

# ── Response models ────────────────────────────────────────────────────────────

class DocumentDetail(BaseModel):
    id: str
    fieldName: str
    fileName: str
    fileType: str
    createdAt: str


class CandidateDocumentsResponse(BaseModel):
    candidateId: str
    candidateName: str
    email: Optional[str]
    documentsSubmitted: bool
    documents: List[DocumentDetail]


# ── Helpers ────────────────────────────────────────────────────────────────────

def _get_candidate_with_docs(db: Session, candidate_id: str):
    """Load candidate + their documents. Raises HTTPException if not found."""
    row = (
        db.query(Candidate, User.email.label("user_email"))
        .outerjoin(User, Candidate.userId == User.id)
        .filter(Candidate.id == candidate_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Candidate not found")
    cand, user_email = row
    return cand, user_email


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.get("/candidates/{candidate_id}/documents", response_model=CandidateDocumentsResponse)
async def list_candidate_documents(
    candidate_id: str,
    db: Session = Depends(get_db),
    _admin=Depends(require_admin_auth),
):
    """
    List all documents submitted by a candidate.
    """
    cand, user_email = _get_candidate_with_docs(db, candidate_id)

    docs = db.query(CandidateDocument).filter(
        CandidateDocument.candidateId == candidate_id
    ).order_by(CandidateDocument.createdAt.asc()).all()

    return CandidateDocumentsResponse(
        candidateId=cand.id,
        candidateName=cand.fullName or user_email or "Unknown",
        email=user_email,
        documentsSubmitted=cand.documentsSubmitted,
        documents=[
            DocumentDetail(
                id=d.id,
                fieldName=d.fieldName,
                fileName=d.fileName,
                fileType=d.fileType,
                createdAt=d.createdAt.isoformat() if d.createdAt else "",
            )
            for d in docs
        ],
    )


@router.get("/candidates/{candidate_id}/documents/zip")
async def download_documents_zip(
    candidate_id: str,
    db: Session = Depends(get_db),
    _admin=Depends(require_admin_auth),
):
    """
    Download all documents for a candidate as a single ZIP file.
    """
    cand, user_email = _get_candidate_with_docs(db, candidate_id)

    docs = db.query(CandidateDocument).filter(
        CandidateDocument.candidateId == candidate_id
    ).all()

    if not docs:
        raise HTTPException(status_code=404, detail="No documents found for this candidate")

    # Build ZIP in memory
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        for doc in docs:
            file_bytes = base64.b64decode(doc.fileData.encode("utf-8"))
            # Use field name as folder, file name as filename
            zf.writestr(f"{doc.fieldName}/{doc.fileName}", file_bytes)

    buffer.seek(0)
    zip_name = f"{cand.fullName or candidate_id}_documents.zip"

    return StreamingResponse(
        iter([buffer.getvalue()]),
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{zip_name}"'},
    )


@router.get("/candidates/{candidate_id}/documents/{field_name}")
async def download_single_document(
    candidate_id: str,
    field_name: str,
    db: Session = Depends(get_db),
    _admin=Depends(require_admin_auth),
):
    """
    Download a single document by field name.
    """
    doc = db.query(CandidateDocument).filter(
        CandidateDocument.candidateId == candidate_id,
        CandidateDocument.fieldName == field_name,
    ).first()

    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

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


@router.delete("/candidates/{candidate_id}/documents/{field_name}")
async def delete_candidate_document(
    candidate_id: str,
    field_name: str,
    db: Session = Depends(get_db),
    _admin=Depends(require_admin_auth),
):
    """
    Delete a single document for a candidate.
    Allows admin to remove and ask candidate to re-upload.
    """
    doc = db.query(CandidateDocument).filter(
        CandidateDocument.candidateId == candidate_id,
        CandidateDocument.fieldName == field_name,
    ).first()

    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    db.delete(doc)
    db.commit()

    return {"success": True, "message": f"Document '{field_name}' deleted"}


@router.patch("/candidates/{candidate_id}/documents/reset")
async def reset_candidate_documents(
    candidate_id: str,
    db: Session = Depends(get_db),
    _admin=Depends(require_admin_auth),
):
    """
    Reset all documents for a candidate — deletes all CandidateDocument rows
    and sets documentsSubmitted=false. Candidate can re-upload from scratch.
    """
    cand, _ = _get_candidate_with_docs(db, candidate_id)

    db.query(CandidateDocument).filter(
        CandidateDocument.candidateId == candidate_id
    ).delete()

    cand.documentsSubmitted = False
    cand.currentPhase = "documents"
    cand.updatedAt = datetime.utcnow()
    db.commit()

    return {"success": True, "message": "Documents reset — candidate can re-upload"}


# ── Send Offer Email (Email #3) ────────────────────────────────────────────────

@router.post("/candidates/{candidate_id}/send-offer-email")
async def send_offer_email(
    candidate_id: str,
    db: Session = Depends(get_db),
    _admin=Depends(require_admin_auth),
):
    """
    Send Email #3 to a candidate: offer letter PDF + joining details PDF attached.
    This is admin-triggered, not automatic.
    """
    from app.services.email_service import send_offer_email as _send_offer_email

    cand, user_email = _get_candidate_with_docs(db, candidate_id)

    if not user_email:
        raise HTTPException(status_code=400, detail="Candidate has no email on file")

    try:
        result = await _send_offer_email(cand.id, user_email, cand.fullName)
        return {"success": True, "message": "Email sent successfully", "details": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to send email: {str(e)}")