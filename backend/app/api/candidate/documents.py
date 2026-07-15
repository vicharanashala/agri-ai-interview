"""
Candidate Document Upload & List Endpoints — MongoDB.
"""
from fastapi import APIRouter, HTTPException, UploadFile, File, Depends, Request, Response
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone
import base64
import uuid

from app.db.mongodb import get_sync_db
from app.api.candidate.route import _get_candidate_id_from_request

router = APIRouter(prefix="/api/candidate", tags=["candidate-documents"])

ALLOWED_CONTENT_TYPES = {
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}

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


def _guess_file_type(filename: str) -> str:
    ext = filename.lower().split(".")[-1]
    return "docx" if ext == "docx" else ("doc" if ext == "doc" else "pdf")


def _validate_file(file: UploadFile, field_name: str) -> bytes:
    content_type = file.content_type or ""
    if content_type not in ALLOWED_CONTENT_TYPES and not file.filename.lower().endswith((".pdf", ".doc", ".docx")):
        raise HTTPException(status_code=400, detail=f"Only PDF and DOCX files are allowed for {field_name}")

    file_bytes = file.file.read()
    max_size = MAX_SIZES.get(field_name, 5 * 1024 * 1024)
    if len(file_bytes) > max_size:
        raise HTTPException(status_code=400, detail=f"File exceeds {max_size // (1024 * 1024)}MB limit for {field_name}")
    return file_bytes


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
):
    candidate_id = _get_candidate_id_from_request(request)
    db = get_sync_db()

    # Verify candidate exists
    if not db.candidates.find_one({"_id": candidate_id}):
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
    now = datetime.now(timezone.utc)

    for field_name, file in files_to_save.items():
        if file is None:
            continue

        try:
            file_bytes = _validate_file(file, field_name)
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Invalid file for {field_name}: {str(e)}")

        file_type = _guess_file_type(file.filename)

        # Get next fileIndex for this field
        existing_count = db.candidate_documents.count_documents({
            "candidate_id": candidate_id,
            "field_name": field_name,
        })
        file_index = existing_count + 1

        doc_id = str(uuid.uuid4())
        doc = {
            "_id": doc_id,
            "candidate_id": candidate_id,
            "field_name": field_name,
            "file_index": file_index,
            "file_name": file.filename,
            "file_type": file_type,
            "file_data": base64.b64encode(file_bytes).decode("utf-8"),
            "created_at": now,
        }
        db.candidate_documents.insert_one(doc)

        uploaded.append(DocumentInfo(
            fieldName=field_name,
            fileIndex=file_index,
            fileName=file.filename,
            fileType=file_type,
            createdAt=now.isoformat(),
        ))

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
            createdAt=doc.get("created_at", "").isoformat() if doc.get("created_at") else "",
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

    # Multiple files
    return {
        "fieldName": field_name,
        "files": [
            {
                "fileIndex": d.get("file_index"),
                "fileName": d.get("file_name"),
                "fileType": d.get("file_type"),
                "createdAt": d.get("created_at", "").isoformat() if d.get("created_at") else "",
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

    result = db.candidate_documents.delete_many(query)

    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="No documents found to delete")

    return {"success": True, "deleted": result.deleted_count}