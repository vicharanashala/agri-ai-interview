"""
Candidate Document Upload, List & Download Endpoints — Storage + MongoDB metadata.
"""
from fastapi import APIRouter, HTTPException, UploadFile, File, Depends, Request, Response, BackgroundTasks
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone
import uuid

from app.db.mongodb import get_sync_db
from app.api.candidate.route import _get_candidate_id_from_request
from bson import ObjectId
from app.core.config import settings

router = APIRouter(prefix="/api/candidate", tags=["candidate-documents"])

ALLOWED_CONTENT_TYPES = {
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "image/jpeg",
    "image/png",
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

_CONTENT_TYPES = {
    "pdf": "application/pdf",
    "doc": "application/msword",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "png": "image/png",
}


def _guess_file_type(filename: str) -> str:
    ext = filename.lower().split(".")[-1]
    if ext in ["jpg", "jpeg"]: return "jpg"
    if ext == "png": return "png"
    return "docx" if ext == "docx" else ("doc" if ext == "doc" else "pdf")


def _validate_file(file: UploadFile, field_name: str) -> bytes:
    content_type = file.content_type or ""
    if content_type not in ALLOWED_CONTENT_TYPES and not file.filename.lower().endswith((".pdf", ".doc", ".docx", ".jpg", ".jpeg", ".png")):
        raise HTTPException(status_code=400, detail=f"Only PDF, DOCX, and Image files are allowed for {field_name}")

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
    storagePath: str
    createdAt: str
    aiValidation: Optional[dict] = None


class DocumentsListResponse(BaseModel):
    documents: List[DocumentInfo]


class DocumentsUploadResponse(BaseModel):
    success: bool
    message: str
    documents: List[DocumentInfo]


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.post("/documents/validate")
async def validate_document(
    request: Request,
    field_name: str,
    file: UploadFile = File(...)
):
    """
    Lightweight endpoint to instantly validate a single document using AI
    without saving it to the database or cloud storage.
    """
    file_bytes = await file.read()
    
    # 1. Basic format validation
    content_type = file.content_type or ""
    if content_type not in ALLOWED_CONTENT_TYPES and not file.filename.lower().endswith((".pdf", ".doc", ".docx", ".jpg", ".jpeg", ".png")):
        raise HTTPException(status_code=400, detail="Invalid file type")

    max_size = MAX_SIZES.get(field_name, 5 * 1024 * 1024)
    if len(file_bytes) > max_size:
        raise HTTPException(status_code=400, detail=f"File exceeds {max_size // (1024 * 1024)}MB limit")

    # 2. AI Validation
    try:
        from app.services.doc_validation.task import get_classifier
        classifier = get_classifier()
        
        expected_type = None
        field_mapping = {
            'aadhaar_front': 'aadhaar_front',
            'aadhaar_back': 'aadhaar_back',
            'pan_front': 'pan_front',
            'pan_back': 'pan_back',
            'marksheet_10': 'marksheet_10',
            'marksheet_12': 'marksheet_12',
            'grad_marksheets': 'degree_certificate',
            'grad_certificate': 'degree_certificate',
            'pg_marksheets': 'degree_certificate',
            'pg_certificate': 'degree_certificate',
            'bank_details': 'bank_proof'
        }
        
        if field_name in field_mapping:
            expected_type = field_mapping[field_name]

        try:
            result = classifier.classify(file_bytes, file.filename)
        except Exception as e:
            import traceback
            traceback.print_exc()
            raise HTTPException(status_code=400, detail=f"The AI engine could not process this specific file format or it was corrupted. Please try taking a screenshot of the document and uploading the image instead. (Error: {str(e)})")
            
        if expected_type:
            is_valid_match = (result.doc_type == expected_type)
            education_docs = ['marksheet_10', 'marksheet_12', 'degree_certificate']
            identity_aadhaar = ['aadhaar_front', 'aadhaar_back']
            identity_pan = ['pan_front', 'pan_back']
            
            if expected_type in education_docs and result.doc_type in education_docs:
                is_valid_match = True
            elif expected_type in identity_aadhaar and result.doc_type in identity_aadhaar:
                is_valid_match = True
            elif expected_type in identity_pan and result.doc_type in identity_pan:
                is_valid_match = True
                
            if not is_valid_match:
                display_names = {
                    'aadhaar_front': 'Aadhaar Card (Front side)',
                    'aadhaar_back': 'Aadhaar Card (Back side)',
                    'pan_front': 'PAN Card (Front side)',
                    'pan_back': 'PAN Card (Back side)',
                    'marksheet_10': '10th Class Marksheet',
                    'marksheet_12': '12th Class Marksheet',
                    'degree_certificate': 'Degree Certificate or Marksheet',
                    'bank_proof': 'Bank Account Document'
                }
                display_expected = display_names.get(expected_type, expected_type.replace('_', ' ').title())
                
                raise HTTPException(status_code=400, detail=f"The uploaded file is not a valid {display_expected}.")
                    
    except ImportError:
        pass
        
    return {"valid": True, "message": "Document passed AI validation"}

@router.post("/documents", response_model=DocumentsUploadResponse)
async def upload_documents(
    request: Request,
    skip_ai: bool = False,
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

            file_type = _guess_file_type(file.filename)

            # Get next fileIndex for this field
            existing_count = db.candidate_documents.count_documents({
                "candidate_id": candidate_id,
                "field_name": field_name,
            })
            file_index = existing_count + 1

            # --- AI Validation Check (Synchronous) ---
            ai_val_status = "pending"
            
            if skip_ai:
                ai_validation_data = {"status": "skipped_due_to_frontend_pre_validation"}
            else:
                try:
                    from app.services.doc_validation.task import get_classifier
                    classifier = get_classifier()
                    
                    # Determine what document type we expect based on the field name
                    expected_type = None
                    
                    # Map exact field names to expected document categories
                    field_mapping = {
                        'aadhaar_front': 'aadhaar_front',
                        'aadhaar_back': 'aadhaar_back',
                        'pan_front': 'pan_front',
                        'pan_back': 'pan_back',
                        'marksheet_10': 'marksheet_10',
                        'marksheet_12': 'marksheet_12',
                        'grad_marksheets': 'degree_certificate',
                        'grad_certificate': 'degree_certificate',
                        'pg_marksheets': 'degree_certificate',
                        'pg_certificate': 'degree_certificate',
                        'bank_details': 'bank_proof'
                    }
                    
                    if field_name in field_mapping:
                        expected_type = field_mapping[field_name]

                    result = classifier.classify(file_bytes, file.filename)
                    
                    if expected_type:
                        is_valid_match = (result.doc_type == expected_type)
                        education_docs = ['marksheet_10', 'marksheet_12', 'degree_certificate']
                        identity_aadhaar = ['aadhaar_front', 'aadhaar_back']
                        identity_pan = ['pan_front', 'pan_back']
                        
                        if expected_type in education_docs and result.doc_type in education_docs:
                            is_valid_match = True
                        elif expected_type in identity_aadhaar and result.doc_type in identity_aadhaar:
                            is_valid_match = True
                        elif expected_type in identity_pan and result.doc_type in identity_pan:
                            is_valid_match = True
                            
                        if is_valid_match:
                            ai_val_status = "valid"
                        else:
                            display_names = {
                                'aadhaar_front': 'Aadhaar Card (Front side)',
                                'aadhaar_back': 'Aadhaar Card (Back side)',
                                'pan_front': 'PAN Card (Front side)',
                                'pan_back': 'PAN Card (Back side)',
                                'marksheet_10': '10th Class Marksheet',
                                'marksheet_12': '12th Class Marksheet',
                                'degree_certificate': 'Degree Certificate or Marksheet',
                                'bank_proof': 'Bank Account Document'
                            }
                            display_expected = display_names.get(expected_type, expected_type.replace('_', ' ').title())
                            
                            raise HTTPException(
                                status_code=400,
                                detail=f"The uploaded file is not a valid {display_expected}."
                            )
                    else:
                        ai_val_status = "matched_other" if result.doc_type else "unknown"
                        
                    ai_validation_data = {
                        "doc_type": result.doc_type,
                        "confidence": round(result.confidence, 4) if result else 0,
                        "method": result.method if result else "none",
                        "status": ai_val_status
                    }
                except ImportError:
                    print("[Warning] AI validation dependencies not found. Skipping validation.")
                    ai_validation_data = {"status": "skipped"}
            # -----------------------------------------

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
                "ai_validation": ai_validation_data
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
            aiValidation=doc.get("ai_validation")
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