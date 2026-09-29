"""
Candidate Document Upload, List & Download Endpoints — Storage + MongoDB metadata.
"""
from fastapi import APIRouter, HTTPException, UploadFile, File, Depends, Request, Response
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
    "image/jpg",
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
    allowed_exts = (".pdf", ".doc", ".docx", ".jpg", ".jpeg", ".png")
    if content_type not in ALLOWED_CONTENT_TYPES and not file.filename.lower().endswith(allowed_exts):
        raise HTTPException(status_code=400, detail=f"Only PDF, DOCX, JPG, and PNG files are allowed for {field_name}")

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


class DocumentsListResponse(BaseModel):
    documents: List[DocumentInfo]


class DocumentsUploadResponse(BaseModel):
    success: bool
    message: str
    documents: List[DocumentInfo]


# ── Endpoints ──────────────────────────────────────────────────────────────────

import httpx
import base64
from fastapi import Form

@router.post("/validate-single")
async def validate_single_document(file: UploadFile = File(...), field_name: str = Form(...)):
    file_bytes = await file.read()
    mime_type = file.content_type if file.content_type else "image/jpeg"
    
    # If the file is a PDF, convert the first page to an image for the Vision AI
    if mime_type == "application/pdf" or file.filename.lower().endswith(".pdf"):
        try:
            import io
            from pdf2image import convert_from_bytes
            images = convert_from_bytes(file_bytes, first_page=1, last_page=1)
            if images:
                img_byte_arr = io.BytesIO()
                images[0].save(img_byte_arr, format='JPEG')
                file_bytes = img_byte_arr.getvalue()
                mime_type = "image/jpeg"
        except Exception as e:
            print(f"Failed to convert PDF to image: {e}")
            return {"success": False, "reason": "System missing PDF libraries. Please upload a .jpg or .png image instead."}
            
    # Convert to base64 for the OpenAI Vision payload
    base64_file = base64.b64encode(file_bytes).decode('utf-8')
    
    # Define field-specific rules to act as few-shot guides
    field_rules = {
        "Aadhaar Card (Front side)": "Checklist: 1) Has a PORTRAIT PHOTO of a face. 2) Has the word 'Aadhaar'. 3) Has the person's Name. CRITICAL RULE: If there is NO portrait photo of a face, it is the back side, so you MUST REJECT IT.",
        "Aadhaar Card (Back side)": "Checklist: 1) Has an ADDRESS block. 2) Has a Barcode or QR Code. CRITICAL RULE: If you see a large portrait photo of a person's face, it is the front side, so you MUST REJECT IT.",
        "PAN Card (Front side)": "Checklist: 1) Has 'INCOME TAX DEPARTMENT'. 2) Has a portrait photo. 3) Has a 10-character alphanumeric PAN. CRITICAL RULE: If you see the word Aadhaar or an address block, REJECT IT.",
        "10th Class Marksheet": "Checklist: 1) Says 'Secondary School', 'Class X', '10th', or 'Matriculation'. CRITICAL RULE: If it says 'Class XII', '12th', or 'Senior Secondary', REJECT IT.",
        "12th Class Marksheet": "Checklist: 1) Says 'Senior Secondary', 'Class XII', '12th', or 'Intermediate'. CRITICAL RULE: If it says 'Class X', '10th', or 'Matriculation', REJECT IT.",
        "Bank Proof": "Checklist: 1) Has a Bank Logo or Name. 2) Has an Account Number. 3) Has an IFSC code. CRITICAL RULE: Do NOT accept PAN or Aadhaar cards here."
    }
    
    specific_rule = field_rules.get(field_name, f"Verify that the document clearly matches the category: {field_name}.")
    
    prompt_text = (
        f"You are an expert document classification AI.\n"
        f"The candidate uploaded this image for the '{field_name}' field.\n\n"
        f"Specific Rules for this field:\n{specific_rule}\n\n"
        f"General Rules:\n"
        f"1. Read the text on the document. If it is the wrong document entirely (e.g., uploading Aadhaar for PAN, or 10th for 12th), you MUST reject it.\n"
        f"2. Do NOT reject the document for being slightly blurry, low quality, or a sample/template. If it looks like the correct type of document, accept it.\n\n"
        f"Reply strictly with a JSON object exactly like this: {{\"is_valid\": true or false, \"reason\": \"Short explanation of exactly what you saw.\"}}"
    )
    
    # Standard OpenAI/vLLM Vision Payload
    vm_payload = {
        "model": "google/gemma-4-26B-A4B-it",
        "messages": [
            {
                "role": "user",
                "content": [
                    {
                        "type": "text", 
                        "text": prompt_text
                    },
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:{mime_type};base64,{base64_file}"
                        }
                    }
                ]
            }
        ],
        "temperature": 0.1,
        "max_tokens": 150
    }
    
    try:
        import json
        import os
        
        # We detect if the Tailscale entrypoint script is running by checking the env var it sets.
        # If it is running, we MUST send our request through the local HTTP proxy on port 1056.
        ts_proxy = "http://127.0.0.1:1056" if os.environ.get("TS_DEBUG_ALWAYS_USE_DERP") else None
        
        # Pass the proxy to the HTTPX client!
        async with httpx.AsyncClient(proxy=ts_proxy) as client:
            response = await client.post("http://100.100.108.44:8013/v1/chat/completions", json=vm_payload, timeout=45.0)
            
            if response.status_code == 200:
                ai_data = response.json()
                
                # Extract the text reply from OpenAI format
                ai_text = ai_data["choices"][0]["message"]["content"]
                
                try:
                    # Clean markdown formatting in case the AI wraps it in ```json
                    clean_text = ai_text.strip("`").replace("json\n", "")
                    result = json.loads(clean_text)
                    
                    if result.get("is_valid"):
                        return {"success": True}
                    else:
                        return {"success": False, "reason": result.get("reason", "AI rejected this document.")}
                except json.JSONDecodeError:
                    # Fallback if AI doesn't return perfect JSON
                    print("Failed to parse AI JSON:", ai_text)
                    return {"success": True, "reason": "Could not parse AI response, bypassing."}
            else:
                # Get the exact error message from vLLM so we stop guessing!
                error_body = response.text
                print(f"vLLM Error (Status {response.status_code}): {error_body}")
                return {"success": True, "reason": f"VM returned {response.status_code}: {error_body}"}
                
    except Exception as e:
        print(f"AI Validation connection failed: {e}")
        return {"success": False, "reason": "AI Validation service is temporarily unavailable. Please try again."}


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