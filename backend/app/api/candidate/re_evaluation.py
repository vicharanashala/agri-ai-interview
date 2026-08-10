"""
Candidate Re-evaluation Request Endpoints — MongoDB.

POST /api/candidate/re-evaluation-request  — Submit a re-evaluation request for an interview session
GET  /api/candidate/re-evaluation-status   — Check re-evaluation request status for an interview session
"""
from fastapi import APIRouter, HTTPException, Request, Query
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone
from bson import ObjectId

from app.db.mongodb import get_sync_db
from app.api.candidate.route import _get_candidate_id_with_email_fallback, _to_objectid
from app.api.admin.candidates import _get_id_variants

router = APIRouter(prefix="/api/candidate", tags=["candidate-re-evaluation"])


def _format_iso(dt) -> Optional[str]:
    if not dt:
        return None
    if isinstance(dt, str):
        return dt
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()


class ReEvaluationRequestPayload(BaseModel):
    interview_id: Optional[str] = None
    reason: str


@router.post("/re-evaluation-request")
async def submit_re_evaluation_request(payload: ReEvaluationRequestPayload, request: Request):
    candidate_id = _get_candidate_id_with_email_fallback(request)
    db = get_sync_db()

    reason = (payload.reason or "").strip()
    if len(reason) < 5:
        raise HTTPException(status_code=400, detail="Please provide a valid reason (at least 5 characters).")

    # Locate interview session
    cand_variants = _get_id_variants(candidate_id)
    if payload.interview_id:
        session = db.interview_sessions.find_one({
            "_id": payload.interview_id,
            "candidate_id": {"$in": cand_variants},
        })
        if not session:
            try:
                session = db.interview_sessions.find_one({
                    "_id": ObjectId(payload.interview_id),
                    "candidate_id": {"$in": cand_variants},
                })
            except Exception:
                pass
    else:
        # Latest completed session for this candidate
        session = db.interview_sessions.find_one(
            {"candidate_id": {"$in": cand_variants}, "status": "completed"},
            sort=[("started_at", -1)],
        )

    if not session:
        raise HTTPException(status_code=404, detail="No completed interview session found to re-evaluate.")

    session_id_str = str(session["_id"])

    # Check if request already submitted
    existing = db.re_evaluation_requests.find_one({"interview_id": session_id_str})
    if existing:
        return {
            "success": True,
            "already_requested": True,
            "message": "Re-evaluation request has already been submitted for this session.",
            "requestedAt": _format_iso(existing.get("requested_at")),
            "reason": existing.get("reason"),
        }

    now = datetime.now(timezone.utc)
    doc = {
        "_id": str(ObjectId()),
        "interview_id": session_id_str,
        "candidate_id": str(candidate_id),
        "reason": reason,
        "requested_at": now,
        "status": "pending",
        "updated_at": now,
    }
    db.re_evaluation_requests.insert_one(doc)

    return {
        "success": True,
        "message": "Re-evaluation request submitted successfully.",
        "requestedAt": _format_iso(now),
        "reason": reason,
    }


@router.get("/re-evaluation-status")
async def get_re_evaluation_status(request: Request, interview_id: Optional[str] = Query(None)):
    candidate_id = _get_candidate_id_with_email_fallback(request)
    db = get_sync_db()

    cand_variants = _get_id_variants(candidate_id)
    existing = None

    if interview_id:
        existing = db.re_evaluation_requests.find_one({"interview_id": str(interview_id)})

    if not existing:
        # Fallback to latest re-evaluation request for this candidate across all attempts
        existing = db.re_evaluation_requests.find_one(
            {"candidate_id": {"$in": cand_variants}},
            sort=[("requested_at", -1)],
        )

    if not existing:
        return {"requested": False}

    target_interview_id = str(existing.get("interview_id"))
    session = db.interview_sessions.find_one({"_id": target_interview_id})
    if not session:
        try:
            session = db.interview_sessions.find_one({"_id": ObjectId(target_interview_id)})
        except Exception:
            pass

    attempt_num = 1
    if session and session.get("candidate_id"):
        attempt_num = db.interview_sessions.count_documents({
            "candidate_id": {"$in": _get_id_variants(session.get("candidate_id"))},
            "status": "completed",
            "result": {"$in": ["PASS", "FAIL", "WITHDRAWN"]},
            "started_at": {"$lte": session.get("started_at")},
        }) or 1

    return {
        "requested": True,
        "interviewId": target_interview_id,
        "attempt": attempt_num,
        "reason": existing.get("reason"),
        "requestedAt": _format_iso(existing.get("requested_at")),
        "status": existing.get("status", "pending"),
        "scoreAfter": existing.get("score_after"),
        "resultAfter": existing.get("result_after"),
        "completedAt": _format_iso(existing.get("completed_at")),
    }


@router.get("/attempts-history")
async def get_candidate_attempts_history(request: Request):
    candidate_id = _get_candidate_id_with_email_fallback(request)
    db = get_sync_db()

    cand_variants = _get_id_variants(candidate_id)
    sessions = list(db.interview_sessions.find(
        {"candidate_id": {"$in": cand_variants}, "status": "completed"},
        sort=[("started_at", 1)],
    ))

    history = []
    for idx, s in enumerate(sessions, 1):
        session_id_str = str(s["_id"])
        re_req = db.re_evaluation_requests.find_one({"interview_id": session_id_str})

        re_eval_data = None
        if re_req:
            re_eval_data = {
                "requested": True,
                "reason": re_req.get("reason"),
                "requestedAt": _format_iso(re_req.get("requested_at")),
                "status": re_req.get("status", "pending"),
                "scoreAfter": re_req.get("score_after"),
                "resultAfter": re_req.get("result_after"),
                "completedAt": _format_iso(re_req.get("completed_at")),
            }
        else:
            re_eval_data = {"requested": False}

        score_val = s.get("overall_score")
        if score_val is None:
            score_val = s.get("score")
        if score_val is None and s.get("evaluation"):
            score_val = s.get("evaluation", {}).get("overall_score")

        history.append({
            "interviewId": session_id_str,
            "attempt": idx,
            "startedAt": _format_iso(s.get("started_at")),
            "completedAt": _format_iso(s.get("completed_at") or s.get("started_at")),
            "result": s.get("result"),
            "score": score_val,
            "endReason": s.get("end_reason"),
            "reEvaluation": re_eval_data,
        })

    return {"attempts": history}
