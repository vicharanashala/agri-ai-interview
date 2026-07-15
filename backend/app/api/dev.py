"""
Dev-only utility endpoints — NOT for production use.
Wipes MongoDB collections for a fresh test session.
"""
from fastapi import APIRouter, HTTPException
from app.db.mongodb import get_sync_db

router = APIRouter(prefix="/api/dev", tags=["dev"])


@router.post("/reset")
def reset_all_data():
    """
    Wipes ALL records from the main MongoDB collections.
    Use this to start a fresh test session.
    """
    db = get_sync_db()

    collections = [
        "users", "candidates", "interview_sessions", "interview_queue",
        "candidate_documents", "resume_files", "signed_offer_letters",
        "anti_cheat_events", "admin_sessions", "settings",
    ]

    result = {}
    for coll in collections:
        res = db[coll].delete_many({})
        result[coll] = res.deleted_count

    # Also reset in-memory interview state
    try:
        from app.workflows.interview_workflow import _interviews, _completed_interviews
        _interviews.clear()
        _completed_interviews.clear()
    except Exception:
        pass

    return {"success": True, "deleted": result}


@router.post("/reset-candidate")
def reset_candidate_data(body: dict):
    """
    Wipes all records for a specific candidate email.
    Also clears in-memory interview state for that candidate.
    Use: POST /api/dev/reset-candidate  {"email": "..."}
    """
    email = body.get("email")
    if not email:
        raise HTTPException(status_code=400, detail="email required")

    db = get_sync_db()

    # Find candidate
    candidate = db.candidates.find_one({"email": email})
    deleted = {}

    if candidate:
        candidate_id = candidate.get("_id")
        for coll in ["candidates", "interview_sessions", "candidate_documents",
                     "resume_files", "signed_offer_letters", "anti_cheat_events"]:
            res = db[coll].delete_many({"candidate_id": candidate_id})
            deleted[coll] = res.deleted_count

        # Delete user
        res = db.users.delete_many({"email": email})
        deleted["users"] = res.deleted_count
    else:
        return {"success": False, "message": "Candidate not found"}

    # Clear in-memory interview state
    try:
        from app.workflows.interview_workflow import _interviews, _completed_interviews
        to_remove = [
            iid for iid, state in _interviews.items()
            if state.get("candidate_id") == email or state.get("candidate_id") == candidate_id
        ]
        for iid in to_remove:
            _interviews.pop(iid, None)
        to_remove_completed = [
            iid for iid, state in _completed_interviews.items()
            if state.get("candidate_id") == email or state.get("candidate_id") == candidate_id
        ]
        for iid in to_remove_completed:
            _completed_interviews.pop(iid, None)
    except Exception:
        pass

    return {"success": True, "email": email, "deleted": deleted}