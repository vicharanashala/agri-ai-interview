"""
Question Collection module completion verification.

GET /api/candidate/question-collection/completion-check
"""
import httpx
from fastapi import APIRouter, HTTPException, Request
from bson import ObjectId

from app.core.config import settings
from app.core.session import get_session_store, _hash_token

router = APIRouter(prefix="/api/candidate/question-collection", tags=["candidate", "question-collection"])

def _get_candidate_id_from_request(request: Request) -> str:
    auth = request.headers.get("authorization", "")
    token = auth[7:] if auth.startswith("Bearer ") else request.cookies.get("candidate_session")
    if not token:
        raise HTTPException(status_code=401, detail="Authentication required")

    store = get_session_store()
    session = store.find_by_token_hash(_hash_token(token))
    if not session:
        raise HTTPException(status_code=401, detail="Session expired or invalid")

    candidate_id = session.get("candidate_id")
    if not candidate_id:
        raise HTTPException(status_code=401, detail="Invalid session")
    return candidate_id

def _get_candidate_mobile_from_db(candidate_id: str) -> str:
    from app.db.mongodb import get_sync_db
    db = get_sync_db()
    cand = db.candidates.find_one({"_id": ObjectId(candidate_id)}, {"phone": 1})
    if not cand or not cand.get("phone"):
        if cand and cand.get("user_id"):
            user = db.users.find_one({"_id": ObjectId(cand["user_id"])}, {"phone": 1})
            if user and user.get("phone"):
                return user["phone"]
        raise HTTPException(status_code=404, detail="Candidate phone number not found")
    return cand["phone"]

def _mark_completed(candidate_id: str) -> None:
    from datetime import datetime, timezone
    from app.db.mongodb import get_sync_db
    db = get_sync_db()
    db.candidates.update_one(
        {"_id": ObjectId(candidate_id)},
        {"$set": {
            "module_completed": True,
            "module_status": "completed",
            "updated_at": datetime.now(timezone.utc)
        }},
    )

@router.get("/completion-check")
async def check_qc_completion(request: Request):
    candidate_id = _get_candidate_id_from_request(request)

    from app.db.mongodb import get_sync_db
    db = get_sync_db()
    cand = db.candidates.find_one({"_id": ObjectId(candidate_id)}, {"module_completed": 1})
    if cand and cand.get("module_completed") is True:
        return {"completed": True, "alreadyVerified": True}

    mobile_number = _get_candidate_mobile_from_db(candidate_id)
    url = f"{settings.QC_API_URL.strip()}/api/v1/users/{mobile_number}/anveshan/check-completion"
    headers = {"x-api-key": settings.ANVESHAN_ANNADATHA_AUTH_KEY.strip()}

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(url, headers=headers)
            if response.status_code == 404:
                # The QC team returns 404 if the user hasn't started the module yet
                return {"completed": False, "apiError": False}
            response.raise_for_status()
            data = response.json()
    except Exception as e:
        return {"completed": False, "apiError": True, "details": repr(e)}

    is_completed = data.get("isCompleted", False)
    
    if is_completed:
        _mark_completed(candidate_id)

    return {
        "completed": is_completed,
        "requirements": data.get("requirements")
    }

@router.post("/launch")
async def launch_qc_module(request: Request):
    candidate_id = _get_candidate_id_from_request(request)
    from app.db.mongodb import get_sync_db
    from datetime import datetime, timezone
    db = get_sync_db()
    
    cand = db.candidates.find_one({"_id": ObjectId(candidate_id)}, {"module_completed": 1, "module_status": 1})
    if cand:
        is_completed = cand.get("module_completed", False)
        current_status = cand.get("module_status")
        
        if not is_completed and current_status != "completed" and current_status != "in_progress":
            db.candidates.update_one(
                {"_id": ObjectId(candidate_id)},
                {"$set": {
                    "module_status": "in_progress",
                    "updated_at": datetime.now(timezone.utc)
                }}
            )
            
    return {"success": True}
