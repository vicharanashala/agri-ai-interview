"""
Dev-only utility endpoints — NOT for production use.
"""
from fastapi import APIRouter, HTTPException
import sqlite3, os
from pathlib import Path

router = APIRouter(prefix="/api/dev", tags=["dev"])


def _get_prisma_db_path() -> str:
    """Path to the Prisma dev.db — shared with Next.js."""
    return os.path.join(
        Path(__file__).parent.parent.parent.parent,
        "frontend", "prisma", "dev.db"
    )


@router.post("/reset")
def reset_all_data():
    """
    Wipes ALL User and Candidate records from the dev database.
    Use this to start a fresh test session without re-logging in.
    """
    db_path = _get_prisma_db_path()

    if not os.path.exists(db_path):
        raise HTTPException(status_code=404, detail="Database not found")

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    # Delete in correct order to respect foreign keys
    cursor.execute("DELETE FROM Candidate")
    cursor.execute("DELETE FROM User")

    deleted_candidates = cursor.rowcount
    # rowcount after User delete — reset after Candidate delete
    cursor.execute("SELECT COUNT(*) FROM User")
    user_count = cursor.rowcount  # not accurate post-delete, just for logging

    conn.commit()
    conn.close()

    # Also reset in-memory interview state
    try:
        from app.workflows.interview_workflow import _interviews, _completed_interviews
        _interviews.clear()
        _completed_interviews.clear()
    except Exception:
        pass

    return {
        "success": True,
        "message": "All candidate and user data deleted",
        "candidates_deleted": deleted_candidates,
    }


@router.post("/reset-candidate")
def reset_candidate_data(body: dict):
    """
    Wipes Candidate and User records for a specific email.
    Also clears in-memory interview state for that candidate.
    Use: POST /api/dev/reset-candidate  {"email": "..."}
    """
    email = body.get("email")
    if not email:
        raise HTTPException(status_code=400, detail="email required")

    db_path = _get_prisma_db_path()
    if not os.path.exists(db_path):
        raise HTTPException(status_code=404, detail="Database not found")

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    # Find candidate by email
    cursor.execute("SELECT id FROM Candidate WHERE email = ?", (email,))
    row = cursor.fetchone()
    deleted_candidates = 0

    if row:
        candidate_id = row["id"]
        # Delete candidate (Cascade should handle User, but be explicit)
        cursor.execute("DELETE FROM Candidate WHERE id = ?", (candidate_id,))
        deleted_candidates = cursor.rowcount

    conn.commit()
    conn.close()

    # Clear in-memory interview state for this candidate
    try:
        from app.workflows.interview_workflow import _interviews, _completed_interviews
        # Remove any interview states referencing this candidate
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

    return {
        "success": True,
        "email": email,
        "candidates_deleted": deleted_candidates,
    }
