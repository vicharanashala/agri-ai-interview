"""
Admin Document Management Endpoints — MongoDB.
"""
from fastapi import APIRouter, HTTPException, Depends, Response
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, timezone
import base64
import io
import zipfile

from app.db.mongodb import get_sync_db
from app.api.admin.middleware import require_admin_auth

router = APIRouter(prefix="/api/admin", tags=["admin-documents"])


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


def _get_candidate_with_docs(candidate_id: str) -> tuple:
    """Returns (candidate_doc, user_email). Raises HTTPException if not found."""
    db = get_sync_db()
    cand = db.candidates.find_one({"_id": candidate_id})
    if not cand:
        raise HTTPException(status_code=404, detail="Candidate not found")

    user_email = None
    user_id = cand.get("user_id")
    if user_id:
        user = db.users.find_one({"_id": user_id})
        if user:
            user_email = user.get("email")

    return cand, user_email


@router.get("/candidates/{candidate_id}/documents", response_model=CandidateDocumentsResponse)
async def list_candidate_documents(
    candidate_id: str,
    _admin=Depends(require_admin_auth),
):
    cand, user_email = _get_candidate_with_docs(candidate_id)

    db = get_sync_db()
    cursor = db.candidate_documents.find({
        "candidate_id": candidate_id,
    }).sort("created_at", 1)

    docs = [
        DocumentDetail(
            id=str(doc["_id"]),
            fieldName=doc.get("field_name", ""),
            fileName=doc.get("file_name", ""),
            fileType=doc.get("file_type", ""),
            createdAt=doc.get("created_at", "").isoformat() if doc.get("created_at") else "",
        )
        for doc in cursor
    ]

    return CandidateDocumentsResponse(
        candidateId=cand["_id"],
        candidateName=cand.get("full_name") or user_email or "Unknown",
        email=user_email,
        documentsSubmitted=cand.get("documents_submitted", False),
        documents=docs,
    )


@router.get("/candidates/{candidate_id}/documents/zip")
async def download_documents_zip(
    candidate_id: str,
    _admin=Depends(require_admin_auth),
):
    cand, user_email = _get_candidate_with_docs(candidate_id)

    db = get_sync_db()
    docs = list(db.candidate_documents.find({"candidate_id": candidate_id}))

    if not docs:
        raise HTTPException(status_code=404, detail="No documents found for this candidate")

    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        for doc in docs:
            file_bytes = base64.b64decode(doc.get("file_data", "").encode("utf-8"))
            zf.writestr(f"{doc.get('field_name', '')}/{doc.get('file_name', '')}", file_bytes)

    buffer.seek(0)
    zip_name = f"{cand.get('full_name') or candidate_id}_documents.zip"

    return StreamingResponse(
        iter([buffer.getvalue()]),
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{zip_name}"'},
    )


@router.get("/candidates/{candidate_id}/documents/{field_name}")
async def download_single_document(
    candidate_id: str,
    field_name: str,
    _admin=Depends(require_admin_auth),
):
    db = get_sync_db()
    doc = db.candidate_documents.find_one({
        "candidate_id": candidate_id,
        "field_name": field_name,
    })

    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    file_bytes = base64.b64decode(doc.get("file_data", "").encode("utf-8"))

    media_types = {
        "pdf": "application/pdf",
        "doc": "application/msword",
        "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    }
    media_type = media_types.get(doc.get("file_type", ""), "application/octet-stream")

    return Response(
        content=file_bytes,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{doc.get("file_name", "")}"'},
    )


@router.delete("/candidates/{candidate_id}/documents/{field_name}")
async def delete_candidate_document(
    candidate_id: str,
    field_name: str,
    _admin=Depends(require_admin_auth),
):
    db = get_sync_db()
    result = db.candidate_documents.delete_one({
        "candidate_id": candidate_id,
        "field_name": field_name,
    })
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Document not found")

    # Reset documents_submitted flag so candidate must re-upload
    db.candidates.update_one(
        {"_id": candidate_id},
        {"$set": {"documents_submitted": False, "updated_at": datetime.now(timezone.utc)}},
    )

    return {"success": True, "message": f"Document '{field_name}' deleted"}


@router.patch("/candidates/{candidate_id}/documents/reset")
async def reset_candidate_documents(
    candidate_id: str,
    _admin=Depends(require_admin_auth),
):
    cand, _ = _get_candidate_with_docs(candidate_id)

    db = get_sync_db()
    db.candidate_documents.delete_many({"candidate_id": candidate_id})

    db.candidates.update_one(
        {"_id": candidate_id},
        {"$set": {
            "documents_submitted": False,
            "current_phase": "documents",
            "updated_at": datetime.now(timezone.utc),
        }},
    )

    return {"success": True, "message": "Documents reset — candidate can re-upload"}


@router.post("/candidates/{candidate_id}/send-offer-email")
async def send_offer_email(candidate_id: str, _admin=Depends(require_admin_auth)):
    from app.services.email_service import send_offer_email as _send

    cand, user_email = _get_candidate_with_docs(candidate_id)

    if not user_email:
        raise HTTPException(status_code=400, detail="Candidate has no email on file")

    try:
        result = await _send(cand["_id"], user_email, cand.get("full_name") or "Candidate")
        return {"success": True, "message": "Email sent successfully", "details": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to send email: {str(e)}")