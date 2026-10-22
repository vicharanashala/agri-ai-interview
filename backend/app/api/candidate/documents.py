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
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "png": "image/png",
}


def _guess_file_type(filename: str) -> str:
    ext = filename.lower().split(".")[-1]
    if ext in ["jpg", "jpeg"]: return "jpg"
    if ext == "png": return "png"
    return "pdf"


def _validate_file(file: UploadFile, field_name: str) -> bytes:
    content_type = file.content_type or ""
    allowed_exts = (".pdf", ".jpg", ".jpeg", ".png")
    if content_type not in ALLOWED_CONTENT_TYPES and not file.filename.lower().endswith(allowed_exts):
        raise HTTPException(status_code=400, detail=f"Invalid format for {field_name}. Please upload .jpg, .jpeg, .png, or .pdf only.")

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
    # Immediately block unsupported extensions like HEIC
    allowed_exts = (".pdf", ".jpg", ".jpeg", ".png")
    if not file.filename.lower().endswith(allowed_exts):
        return {"success": False, "reason": "Invalid file format. Please upload .jpg, .jpeg, .png, or .pdf only."}

    # Only mandatory fields (except updated_resume) undergo AI Vision validation
    AI_VALIDATED_FIELDS = {
        "aadhaar_front",
        "aadhaar_back",
        "pan_front",
        "pan_back",
        "bank_details",
        "marksheet_10",
        "marksheet_12",
        "grad_marksheets",
        "Aadhaar Card (Front side)",
        "Aadhaar Card (Back side)",
        "PAN Card (Front side)",
        "PAN Card (Back side)",
        "Bank Proof",
        "10th Class Marksheet",
        "12th Class Marksheet",
        "Graduation Marksheet / Degree Certificate",
    }

    # Accept updated_resume and optional fields directly without AI validation.
    if field_name == "updated_resume" or field_name not in AI_VALIDATED_FIELDS:
        return {"success": True}

    file_bytes = await file.read()
    mime_type = file.content_type if file.content_type else "image/jpeg"
    
    # If the file is a PDF, convert the first page to an image for the Vision AI
    if mime_type == "application/pdf" or file.filename.lower().endswith(".pdf"):
        try:
            import io
            from pdf2image import convert_from_bytes
            from PIL import Image, ImageChops
            images = convert_from_bytes(file_bytes, first_page=1, last_page=1)
            if images:
                img = images[0]
                # Auto-crop excessive white/blank scanner margins (e.g. small ID card on full A4 page)
                try:
                    if img.mode != 'RGB':
                        img = img.convert('RGB')
                    bg = Image.new('RGB', img.size, (255, 255, 255))
                    diff = ImageChops.difference(img, bg)
                    diff = ImageChops.add(diff, diff, 2.0, -10)
                    bbox = diff.getbbox()
                    if bbox:
                        w, h = img.size
                        x0 = max(0, bbox[0] - 30)
                        y0 = max(0, bbox[1] - 30)
                        x1 = min(w, bbox[2] + 30)
                        y1 = min(h, bbox[3] + 30)
                        if (x1 - x0) < w * 0.90 or (y1 - y0) < h * 0.90:
                            img = img.crop((x0, y0, x1, y1))
                except Exception as crop_err:
                    print(f"Auto-crop skipped: {crop_err}")

                img_byte_arr = io.BytesIO()
                img.save(img_byte_arr, format='JPEG', quality=95)
                file_bytes = img_byte_arr.getvalue()
                mime_type = "image/jpeg"
        except Exception as e:
            print(f"Failed to convert PDF to image: {e}")
            return {"success": False, "reason": "System missing PDF libraries. Please upload a .jpg or .png image instead."}
            
    # Convert to base64 for the OpenAI Vision payload
    base64_file = base64.b64encode(file_bytes).decode('utf-8')
    
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
    
    canonical_name = FIELD_NAMES_MAP.get(field_name, field_name)
    
    field_rules = {
        "Aadhaar Card (Front side)": (
            "Rule 1: MUST clearly contain the exact word 'Aadhaar' or the Government of India emblem.\n"
            "Rule 2: MUST contain a clearly visible PORTRAIT PHOTO of a face.\n"
            "Rule 3: MUST NOT have a large address block. If there is a full address block, it is the BACK side -> REJECT.\n"
            "Rule 4: CRITICAL: Reject blank forms or sample templates with no real person's photo. If a real person's photo, name, and legitimate Aadhaar digits are present, it is VALID."
        ),

        "Aadhaar Card (Back side)": (
            "Rule 1: MUST contain an ADDRESS block.\n"
            "Rule 2: MUST NOT contain a large portrait photo of a face. If there is a face photo, it is the FRONT side -> REJECT.\n"
            "Rule 3: Should contain the word 'Aadhaar' or a QR code."
        ),

        "PAN Card (Front side)": (
            "Rule 1: MUST clearly say 'INCOME TAX DEPARTMENT'.\n"
            "Rule 2: MUST contain a portrait photo of a face.\n"
            "Rule 3: MUST contain a 10-character alphanumeric PAN number.\n"
            "Rule 4: CRITICAL: Reject Aadhaar cards or anything without a photo."
        ),

        "PAN Card (Back side)": (
            "Rule 1: MUST be the back side of a PAN Card.\n"
            "Rule 2: CRITICAL: Reject Aadhaar card front with a face photo."
        ),

        "10th Class Marksheet": (
            "Rule 1: MUST contain words like 'Secondary School', 'Class X', '10th', 'Matriculation', or 'SSLC'.\n"
            "Rule 2: CRITICAL: If it clearly says 'Class XII', '12th', 'Senior Secondary', or 'HSC', REJECT IT immediately."
        ),

        "12th Class Marksheet": (
            "Rule 1: MUST contain words like 'Senior Secondary', 'Class XII', '12th', 'Intermediate', or 'HSC'.\n"
            "Rule 2: CRITICAL: If it clearly says 'Class X', '10th', or 'Matriculation', REJECT IT immediately."
        ),

        "Bank Proof": (
            "Rule 1: MUST contain a Bank Logo/Name, Passbook, Cheque, Account Number, or IFSC code.\n"
            "Rule 2: CRITICAL: Reject PAN cards, Aadhaar cards, or blank images."
        ),

        "Resume / Curriculum Vitae": (
            "Rule 1: MUST be a Resume, CV, or Curriculum Vitae listing candidate background, education, or experience.\n"
            "Rule 2: CRITICAL: Reject Aadhaar cards, PAN cards, or blank images."
        ),

        "Graduation Marksheet / Degree Certificate": (
            "Rule 1: MUST be a university degree certificate or semester marksheets (e.g., B.Tech, B.Sc, B.Com, BA, Degree).\n"
            "Rule 2: CRITICAL: Reject Aadhaar cards, PAN cards, or blank images."
        ),

        "Post-Graduation Marksheet / Degree Certificate": (
            "Rule 1: MUST be a post-graduate degree certificate or university marksheets (e.g., M.Tech, MBA, MCA, M.Sc).\n"
            "Rule 2: CRITICAL: Reject Aadhaar cards, PAN cards, or blank images."
        ),

        "Offer Letter / Experience Letter": (
            "Rule 1: MUST be an offer letter, experience certificate, or relieving letter from an employer.\n"
            "Rule 2: CRITICAL: Reject Aadhaar cards, PAN cards, or blank images."
        ),

        "Salary Slips": (
            "Rule 1: MUST be a salary slip or payslip showing salary/earnings or company details.\n"
            "Rule 2: CRITICAL: Reject Aadhaar cards, PAN cards, or blank images."
        )
    }

    specific_rule = field_rules.get(
        canonical_name,
        f"Verify that the document matches the category: {canonical_name}."
    )

    prompt_text = f"""
You are a strict document verification AI.

The candidate uploaded an image for the following document field:

DOCUMENT TYPE: "{canonical_name}"

Your task is to determine whether the uploaded image satisfies the requirements for this
specific document type.

IMPORTANT:
Do NOT make the final decision based only on general visual similarity.
First inspect the image and explicitly determine the presence or absence of every
important visual/textual feature required by the rules.

SPECIFIC RULES:
{specific_rule}

GENERAL RULES:

1. EMPTY OR ILLEGIBLE
- If a document card (e.g. Aadhaar or PAN) is scanned on a white paper page, focus inspection ONLY on the card itself, ignoring any blank surrounding paper.
- If the image is completely blank, solid color, or so blurry that the required
  document cannot be verified, mark it invalid.
- Do NOT reject merely because the image is slightly blurry or low quality.
- If important evidence is still visible, continue verification.

2. DOCUMENT PRESENCE
- Determine whether an actual document is present.
- Reject blank images, unrelated images, screenshots of unrelated content,
  or obvious non-document images.

3. WRONG DOCUMENT / WRONG SIDE
- Carefully check whether the image belongs to the requested document type.
- For Aadhaar, distinguish FRONT from BACK using the presence of a portrait photo
  and address block.
- For 10th and 12th marksheets, carefully distinguish Class X from Class XII.
- Do not assume the requested document is correct merely because some matching
  words are present.

4. TEMPLATE / FAKE / PLACEHOLDER
- Reject obvious blank templates with no real photo, or dummy documents.
- If an actual person's photo and legitimate name/details are present, it is NOT a placeholder. Do NOT hallucinate placeholder values unless actual placeholder digits like '0000 0000 0000' are explicitly printed.
- A real document contains actual identifying/document information.

5. TEXT VERIFICATION
- Look carefully for the required words, numbers, labels, and document features.
- If text is unclear, do not invent or guess what it says.
- If you cannot verify a required feature from the image, mark that feature as false
  or uncertain.

6. VISUAL FEATURES
- Check for portrait photos, address blocks, QR codes, logos, document headings,
  tables, and other relevant visual features.
- Do not assume that a visually similar document satisfies the requirements.

7. EVIDENCE-BASED DECISION
- Your final decision MUST be based on the individual checks below.
- Do not use hidden reasoning or chain-of-thought.
- Return only the requested JSON object.

Before deciding, perform these checks internally:

A. Is an actual document visible?
B. Is the image sufficiently clear to verify the required features?
C. What relevant text is actually visible?
D. What relevant visual features are actually visible?
E. Which specific rules are satisfied?
F. Which specific rules are violated?
G. Is there evidence that this is the wrong document or wrong side?
H. Is there evidence that this is a blank/template/placeholder document?

OUTPUT FORMAT:

Return ONLY valid JSON.

{{
  "is_valid": true,
  "checks": {{
    "document_present": true,
    "image_verifiable": true,
    "required_text_present": true,
    "portrait_photo_present": false,
    "address_block_present": false,
    "qr_code_present": false,
    "logo_or_emblem_present": true,
    "wrong_document_or_side": false,
    "blank_or_template": false,
    "placeholder_values": false
  }},
  "detected_text": [
    "Sample Heading",
    "Sample Keyword"
  ],
  "failed_rules": [],
  "reason": "Short explanation based only on visible evidence."
}}

IMPORTANT OUTPUT RULES:

- Set a check to true ONLY when the corresponding feature is visibly present.
- Set a check to false when the feature is visibly absent.
- Do NOT invent text, numbers, photos, logos, QR codes, or other features.
- If something cannot be verified because of image quality, treat it as not verified
  rather than guessing.
- "detected_text" must contain at most 3 to 5 key identifying words or headings (do NOT transcribe the whole document).
- "failed_rules" must list the specific rules that are violated.
- "reason" must be short and factual.
- Do NOT provide chain-of-thought or hidden reasoning.
- Return ONLY the JSON object.
"""
    
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
        "max_tokens": 800
    }
    
    try:
        import json
        import os
        import re
        
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
                    # Robust JSON extraction: find first '{' and last '}'
                    first_brace = ai_text.find("{")
                    last_brace = ai_text.rfind("}")
                    if first_brace != -1 and last_brace != -1 and last_brace > first_brace:
                        clean_text = ai_text[first_brace:last_brace + 1]
                    else:
                        clean_text = ai_text.strip("`").replace("json\n", "")
                        
                    result = json.loads(clean_text)
                    
                    if result.get("is_valid"):
                        return {"success": True}
                    else:
                        return {"success": False, "reason": result.get("reason", "AI rejected this document.")}
                except json.JSONDecodeError:
                    # Robust regex fallback if JSON was slightly truncated or had unescaped quotes
                    valid_match = re.search(r'"is_valid"\s*:\s*(true|false)', ai_text, re.IGNORECASE)
                    if valid_match:
                        is_valid = valid_match.group(1).lower() == 'true'
                        if is_valid:
                            return {"success": True}
                        else:
                            reason_match = re.search(r'"reason"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"', ai_text)
                            reason = reason_match.group(1) if reason_match else "AI rejected this document."
                            return {"success": False, "reason": reason}

                    # Fallback if AI doesn't return parseable output
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