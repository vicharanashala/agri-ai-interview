"""
Admin Candidates & Interviews API Endpoints — MongoDB.
"""
import json
from bson import ObjectId
from fastapi import APIRouter, HTTPException, Query, Depends
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone
import uuid

from app.db.mongodb import get_sync_db
from app.api.admin.middleware import require_admin_auth

router = APIRouter(prefix="/api/admin", tags=["admin-candidates"])

PHASES = ["onboarding", "interview", "summary", "documents"]
PHASE_ORDER = {p: i for i, p in enumerate(PHASES)}


class PhaseStatus(BaseModel):
    phase: str
    status: str
    timestamp: Optional[str] = None
    completedAt: Optional[str] = None


class CandidateResponse(BaseModel):
    id: str
    fullName: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    state: Optional[str] = None
    district: Optional[str] = None
    currentRole: Optional[str] = None
    yearsOfExperience: Optional[int] = None
    farmingBackground: Optional[str] = None
    primaryExpertise: Optional[str] = None
    currentPhase: str
    status: str
    phases: List[PhaseStatus]
    createdAt: Optional[str] = None
    documentsSubmitted: bool = False
    attemptsDone: int = 0
    maxAttempts: int = 3


def _build_phases(current_phase: str) -> List[PhaseStatus]:
    current_idx = PHASE_ORDER.get(current_phase, 0)
    return [
        PhaseStatus(
            phase=p,
            status="completed" if i < current_idx else ("in_progress" if i == current_idx else "pending"),
        )
        for i, p in enumerate(PHASES)
    ]


def _candidate_to_response(cand: dict, user_email: Optional[str]) -> CandidateResponse:
    raw_full_name = cand.get("full_name") or user_email or "Unknown"
    current_phase = cand.get("current_phase", "onboarding")

    db = get_sync_db()
    attempts_done = db.interview_sessions.count_documents({
        "candidate_id": cand["_id"],
        "status": "completed",
        "result": {"$in": ["PASS", "FAIL", "WITHDRAWN"]},
    })

    return CandidateResponse(
        id=str(cand["_id"]),
        fullName=raw_full_name,
        email=user_email,
        phone=cand.get("phone"),
        state=cand.get("state"),
        district=cand.get("district"),
        currentRole=cand.get("current_role"),
        yearsOfExperience=cand.get("years_of_experience"),
        farmingBackground=cand.get("farming_background"),
        primaryExpertise=cand.get("primary_expertise"),
        currentPhase=current_phase,
        status="active",
        phases=_build_phases(current_phase),
        createdAt=cand.get("created_at", "").isoformat() if cand.get("created_at") else datetime.now(timezone.utc).isoformat(),
        documentsSubmitted=cand.get("documents_submitted", False),
        attemptsDone=attempts_done,
        maxAttempts=3,
    )


# ── Candidates ─────────────────────────────────────────────────────────────────

@router.get("/candidates")
async def get_candidates(
    phase: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    state: Optional[str] = Query(None),
    district: Optional[str] = Query(None),
    _admin=Depends(require_admin_auth),
):
    db = get_sync_db()

    query: Dict[str, Any] = {}
    if phase:
        query["current_phase"] = phase
    if state:
        query["state"] = {"$regex": state, "$options": "i"}
    if district:
        query["district"] = {"$regex": district, "$options": "i"}

    cursor = db.candidates.find(query).sort("created_at", -1)
    all_candidates = list(cursor)

    results = []
    for cand in all_candidates:
        user_email = None
        user_id = cand.get("user_id")
        if user_id:
            user = db.users.find_one({"_id": user_id})
            if user:
                user_email = user.get("email")

        response = _candidate_to_response(cand, user_email)

        if search:
            sl = search.lower()
            if sl not in (response.fullName or "").lower() and sl not in (response.email or "").lower():
                continue

        results.append(response)

    return {"candidates": results, "total": len(results)}


@router.get("/candidates/{candidate_id}")
async def get_candidate(candidate_id: str, _admin=Depends(require_admin_auth)):
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

    return _candidate_to_response(cand, user_email)


@router.put("/candidates/{candidate_id}/phase/{phase}")
async def update_candidate_phase(candidate_id: str, phase: str, _admin=Depends(require_admin_auth)):
    if phase not in PHASES:
        raise HTTPException(status_code=400, detail=f"Invalid phase. Must be one of: {PHASES}")

    db = get_sync_db()
    result = db.candidates.update_one(
        {"_id": candidate_id},
        {"$set": {"current_phase": phase, "updated_at": datetime.now(timezone.utc)}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Candidate not found")

    return {"success": True, "message": f"Phase updated to {phase}"}


@router.post("/candidates")
async def create_candidate(
    name: str,
    email: str,
    phone: Optional[str] = None,
    position: Optional[str] = None,
    _admin=Depends(require_admin_auth),
):
    db = get_sync_db()

    existing_user = db.users.find_one({"email": email})
    if existing_user:
        existing_cand = db.candidates.find_one({"user_id": str(existing_user["_id"])})
        if existing_cand:
            raise HTTPException(status_code=400, detail="Candidate with this email already exists")
        user_id = str(existing_user["_id"])
    else:
        user_id = ObjectId()
        db.users.insert_one({
            "_id": str(user_id),
            "name": name,
            "email": email,
            "created_at": datetime.now(timezone.utc),
        })
        user_id = str(user_id)

    candidate_id = ObjectId()
    now = datetime.now(timezone.utc)
    db.candidates.insert_one({
        "_id": candidate_id,
        "user_id": user_id,
        "full_name": name,
        "phone": phone,
        "current_phase": "onboarding",
        "offer_letter_viewed": False,
        "passed_and_visited_summary": False,
        "joining_details_visited": False,
        "documents_submitted": False,
        "created_at": now,
        "updated_at": now,
    })

    return {"id": candidate_id, "name": name, "email": email}


# ── Reset Cooldown ─────────────────────────────────────────────────────────────

@router.post("/candidates/{candidate_id}/reset-cooldown")
async def reset_candidate_cooldown(candidate_id: str, _admin=Depends(require_admin_auth)):
    db = get_sync_db()
    now = datetime.now(timezone.utc)

    # Clear completedAt on latest FAIL session
    db.interview_sessions.find_one_and_update(
        {"candidate_id": candidate_id, "status": "completed", "result": "FAIL"},
        {"$set": {"completed_at": None}},
        sort=[("started_at", -1)],
    )

    # Clear cooldownUntil on queue entry
    db.queue_entries.update_one(
        {"candidate_id": candidate_id},
        {"$set": {"cooldown_until": None, "updated_at": now}},
    )

    # Move candidate back to interview phase, reset flags
    db.candidates.update_one(
        {"_id": ObjectId(candidate_id)},
        {"$set": {
            "current_phase": "interview",
            "passed_and_visited_summary": False,
            "offer_letter_viewed": False,
            "joining_details_visited": False,
            "documents_submitted": False,
            "updated_at": now,
        }},
    )

    return {"success": True, "message": "Cooldown reset successfully. Candidate can now start a new interview."}


# ── Active Interviews ─────────────────────────────────────────────────────────

@router.get("/interviews/active")
async def get_active_interviews(_admin=Depends(require_admin_auth)):
    from bson import ObjectId

    db = get_sync_db()
    sessions = list(db.interview_sessions.find(
        {"status": {"$in": ["active", "interviewing", "paused"]}}
    ).sort("started_at", -1).limit(100))

    interviews = []
    for s in sessions:
        interview_data = s.get("interview_data") or {}
        if isinstance(interview_data, str):
            try:
                interview_data = json.loads(interview_data)
            except Exception:
                interview_data = {}

        messages = interview_data.get("messages", [])
        if not isinstance(messages, list):
            messages = []

        cid = s.get("candidate_id")
        candidate = db.candidates.find_one({"_id": ObjectId(cid)}) if cid else None
        user = db.users.find_one({"_id": ObjectId(candidate.get("user_id"))}) if candidate and candidate.get("user_id") else None

        candidate_name = (candidate.get("full_name") or user.get("name") or "").strip() if candidate else ""

        interviews.append({
            "id": s["_id"],
            "candidateId": s.get("candidate_id", ""),
            "candidateName": candidate_name,
            "startedAt": s.get("started_at", ""),
            "messagesCount": len(messages),
            "messages": messages[-50:] if len(messages) > 50 else messages,
            "currentPhase": s.get("current_phase", "interview"),
        })

    return {"interviews": interviews}


# ── Re-evaluate Interview ──────────────────────────────────────────────────────

@router.post("/interviews/{interview_id}/reevaluate")
async def reevaluate_interview(interview_id: str, _admin=Depends(require_admin_auth)):
    import json
    from app.llm import llm_service
    from app.services.settings_service import get_evaluation_settings

    db = get_sync_db()
    session = db.interview_sessions.find_one({"_id": interview_id})
    if not session:
        raise HTTPException(status_code=404, detail="Interview session not found")

    if session.get("status") != "completed":
        raise HTTPException(status_code=400, detail="Only completed interviews can be re-evaluated")

    try:
        interview_data = session.get("interview_data", {}) if isinstance(session.get("interview_data"), dict) else {}
    except Exception:
        raise HTTPException(status_code=500, detail="Corrupted interview data")

    messages = interview_data.get("messages", [])
    candidate_data = interview_data.get("candidate_data", {})
    qa_pairs = interview_data.get("qa_pairs", [])

    if not messages:
        raise HTTPException(status_code=400, detail="No chat history found for this interview")

    conversation_history = [
        {"role": m.get("role"), "content": m.get("content")}
        for m in messages
        if m.get("role") and m.get("content")
    ]

    try:
        evaluation = await llm_service.generate_interview_evaluation(
            candidate_data=candidate_data,
            conversation_history=conversation_history,
            qa_pairs=qa_pairs,
        )
    except Exception as e:
        import logging
        logging.error(f"[Re-evaluate] LLM evaluation failed for {interview_id}: {e}")
        raise HTTPException(status_code=502, detail="Evaluation service failed. Please try again.")

    threshold = get_evaluation_settings().get("pass_threshold", 60)
    overall_score = evaluation.get("overall_score") or 0
    new_result = "PASS" if overall_score >= threshold else "FAIL"

    interview_data["evaluation"] = evaluation
    now = datetime.now(timezone.utc)

    db.interview_sessions.update_one(
        {"_id": interview_id},
        {"$set": {
            "score": overall_score,
            "result": new_result,
            "interview_data": interview_data,
            "updated_at": now,
        }},
    )

    if new_result == "PASS":
        db.queue_entries.update_one(
            {"candidate_id": session["candidate_id"]},
            {"$set": {"cooldown_until": None, "updated_at": now}},
        )
        db.candidates.update_one(
            {"_id": session["candidate_id"]},
            {"$set": {
                "current_phase": "documents",
                "passed_and_visited_summary": True,
                "documents_submitted": False,
                "updated_at": now,
            }},
        )
    else:
        db.interview_sessions.update_one(
            {"_id": interview_id},
            {"$set": {"completed_at": now}},
        )
        db.candidates.update_one(
            {"_id": session["candidate_id"]},
            {"$set": {
                "current_phase": "interview",
                "passed_and_visited_summary": False,
                "updated_at": now,
            }},
        )

    return {
        "success": True,
        "new_score": overall_score,
        "new_result": new_result,
        "evaluation": evaluation,
    }


# ── Dashboard Stats ────────────────────────────────────────────────────────────

@router.get("/stats/overview")
async def get_overview_stats(_admin=Depends(require_admin_auth)):
    db = get_sync_db()

    total = db.candidates.count_documents({})
    by_phase = {}
    for phase in PHASES:
        by_phase[phase] = db.candidates.count_documents({"current_phase": phase})

    active_interviews = db.interview_sessions.count_documents({
        "status": {"$in": ["active", "interviewing", "paused"]}
    })

    total_completed = db.interview_sessions.count_documents({
        "status": "completed",
        "result": {"$in": ["PASS", "FAIL"]},
    })
    total_pass = db.interview_sessions.count_documents({"status": "completed", "result": "PASS"})
    total_fail = db.interview_sessions.count_documents({"status": "completed", "result": "FAIL"})

    return {
        "totalCandidates": total,
        "byPhase": by_phase,
        "activeInterviews": active_interviews,
        "totalCompleted": total_completed,
        "totalPass": total_pass,
        "totalFail": total_fail,
    }


@router.get("/stats/states")
async def get_state_stats(state: str = Query(None), _admin=Depends(require_admin_auth)):
    db = get_sync_db()

    # Aggregate candidates by state and phase
    pipeline = []
    if state:
        pipeline.append({"$match": {"state": state}})
    pipeline.append({
        "$group": {
            "_id": {"state": "$state", "phase": "$current_phase"},
            "count": {"$sum": 1},
        }
    })

    rows = list(db.candidates.aggregate(pipeline))

    # Get pass/fail per state via Python-side join
    sessions = db.interview_sessions.find(
        {"status": "completed", "result": {"$in": ["PASS", "FAIL"]}},
        {"candidate_id": 1, "result": 1},
    )
    pf_map: dict = {}
    for sess in sessions:
        cid = sess.get("candidate_id")
        if not cid:
            continue
        try:
            cand = db.candidates.find_one({"_id": ObjectId(cid)}, {"state": 1})
        except Exception:
            continue
        if not cand:
            continue
        s = cand.get("state") or "Unknown"
        if s not in pf_map:
            pf_map[s] = {"PASS": 0, "FAIL": 0}
        pf_map[s][sess["result"]] += 1

    state_data: dict = {}
    for row in rows:
        s = row["_id"].get("state") or "Unknown"
        if s not in state_data:
            state_data[s] = {"state": s, "onboarding": 0, "interviewed": 0, "passed": 0, "failed": 0, "passRate": 0, "offerExtended": 0, "offerAccepted": 0}
        phase = row["_id"]["phase"] or "onboarding"
        if phase == "onboarding":
            state_data[s]["onboarding"] += row["count"]
        elif phase in ("interview", "summary", "documents"):
            state_data[s]["interviewed"] += row["count"]

    for s, data in state_data.items():
        pf = pf_map.get(s, {"PASS": 0, "FAIL": 0})
        data["passed"] = pf["PASS"]
        data["failed"] = pf["FAIL"]
        total = pf["PASS"] + pf["FAIL"]
        data["passRate"] = round(pf["PASS"] / total * 100) if total > 0 else 0

    result = list(state_data.values())
    result.sort(key=lambda x: x["onboarding"] + x["interviewed"], reverse=True)
    return {"states": result, "totalStates": len(result)}


# ── Anti-Cheat ─────────────────────────────────────────────────────────────────

@router.get("/anti-cheat/violations")
async def get_anti_cheat_violations(
    limit: int = Query(100, ge=1, le=500),
    _admin=Depends(require_admin_auth),
):
    from bson import ObjectId

    db = get_sync_db()
    cursor = db.anti_cheat_events.find().sort("created_at", -1).limit(limit)
    violations = []
    for event in cursor:
        cid = event.get("candidate_id")
        cand = db.candidates.find_one({"_id": ObjectId(cid)}) if cid else None
        user = db.users.find_one({"_id": ObjectId(cand.get("user_id"))}) if cand and cand.get("user_id") else None
        name = (cand.get("full_name") if cand else None) or (user.get("name") if user else None) or "Unknown"
        email = (user.get("email") if user else None) or "—"
        violations.append({
            "id": event.get("_id"),
            "candidateId": event.get("candidate_id"),
            "candidateName": name,
            "email": email,
            "eventType": event.get("event_type"),
            "severity": event.get("severity"),
            "message": event.get("message"),
            "createdAt": event.get("created_at", "").isoformat() if event.get("created_at") else "",
            "autoClosed": event.get("severity") == "critical",
        })
    return {"violations": violations, "total": len(violations)}


# ── Update a single candidate field ───────────────────────────────────────────

@router.patch("/candidates/{candidate_id}")
async def update_candidate(
    candidate_id: str,
    updates: Dict[str, Any],
    _admin=Depends(require_admin_auth),
):
    """Partial update — only provided fields are changed."""
    db = get_sync_db()
    updates["updated_at"] = datetime.now(timezone.utc)

    # Map snake_case keys to MongoDB snake_case (already snake_case from body)
    result = db.candidates.update_one({"_id": candidate_id}, {"$set": updates})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Candidate not found")

    return {"success": True}


# ── Backfill missing completed_at (one-time migration) ─────────────────────────

@router.post("/evaluations/backfill-completed-at")
async def backfill_completed_at(_admin=Depends(require_admin_auth)):
    """One-time migration: set completed_at = started_at for sessions where it's missing."""
    db = get_sync_db()
    result = db.interview_sessions.update_many(
        {"completed_at": None, "started_at": {"$ne": None}},
        [{"$set": {"completed_at": "$started_at"}}],
    )
    return {
        "success": True,
        "matched": result.matched_count,
        "modified": result.modified_count,
        "message": "completed_at backfilled from started_at for sessions where missing.",
    }


# ── Get all evaluations (admin view) ──────────────────────────────────────────

@router.get("/evaluations")
async def get_all_evaluations(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0),
    result: str = Query(None),
    search: str = Query(None),
    _admin=Depends(require_admin_auth),
):
    from bson import ObjectId

    db = get_sync_db()

    query: dict = {"status": "completed", "result": {"$in": ["PASS", "FAIL"]}}
    if result:
        query["result"] = result

    total = db.interview_sessions.count_documents(query)

    cursor = db.interview_sessions.find(query).sort("started_at", -1).skip(offset).limit(limit)

    evals = []
    for s in cursor:
        interview_data = s.get("interview_data") or {}
        if isinstance(interview_data, str):
            try:
                interview_data = json.loads(interview_data)
            except Exception:
                interview_data = {}

        candidate_id = s.get("candidate_id")
        # candidate_id stored as string; candidates._id is ObjectId
        candidate = db.candidates.find_one({"_id": ObjectId(candidate_id)}) if candidate_id else None
        user = db.users.find_one({"_id": ObjectId(candidate.get("user_id"))}) if candidate and candidate.get("user_id") else None

        if candidate:
            candidate_name = (candidate.get("full_name") or user.get("name") or "").strip()
            if not candidate_name:
                candidate_name = user.get("email", "")
            candidate_email = user.get("email") if user else None
        else:
            candidate_name = ""
            candidate_email = None

        messages = interview_data.get("messages", [])
        if not isinstance(messages, list):
            messages = []

        # Determine the 1-indexed attempt number for this session.
        # Count how many completed sessions for this candidate started BEFORE or AT the same time.
        # Sessions are ordered by started_at ASC; this gives each session its distinct attempt number.
        if candidate_id:
            attempt_num = db.interview_sessions.count_documents({
                "candidate_id": candidate_id,
                "status": "completed",
                "result": {"$in": ["PASS", "FAIL"]},
                "started_at": {"$lte": s.get("started_at")},
            })
        else:
            attempt_num = 1

        eval_data = interview_data.get("evaluation") or {}
        raw_score = s.get("score")
        score = raw_score if raw_score is not None else eval_data.get("overall_score")

        evals.append({
            "id": s.get("_id"),
            "candidateId": candidate_id,
            "candidateName": candidate_name,
            "email": candidate_email,
            "result": s.get("result"),
            "endReason": s.get("end_reason"),
            "score": score,
            "startedAt": s.get("started_at", "").isoformat() if s.get("started_at") else None,
            "completedAt": (
                s.get("completed_at", "").isoformat() if s.get("completed_at") else
                s.get("started_at", "").isoformat() if s.get("started_at") else
                None
            ),
            "messages": messages,
            "evaluation": interview_data.get("evaluation"),
            "attempt": attempt_num,
        })

    return {"evaluations": evals, "total": total}


# ── Geo Stats ─────────────────────────────────────────────────────────────────

@router.get("/geo/stats")
async def get_geo_stats(_admin=Depends(require_admin_auth)):
    db = get_sync_db()

    # States summary — group by state and phase
    state_pipeline = [
        {
            "$group": {
                "_id": {
                    "state": "$state",
                    "phase": "$current_phase",
                },
                "count": {"$sum": 1},
            }
        }
    ]
    state_rows = list(db.candidates.aggregate(state_pipeline))

    states_map: dict = {}
    for row in state_rows:
        s = row["_id"].get("state") or "Unknown"
        if s not in states_map:
            states_map[s] = {"state": s, "total": 0, "pending": 0, "interviewed": 0, "selected": 0, "rejected": 0}
        states_map[s]["total"] += row["count"]
        phase = row["_id"]["phase"] or "onboarding"
        if phase == "onboarding":
            states_map[s]["pending"] += row["count"]
        elif phase in ("interview", "summary", "documents"):
            states_map[s]["interviewed"] += row["count"]

    # Get pass/fail per state — Python-side join
    sessions = list(db.interview_sessions.find(
        {"status": "completed", "result": {"$in": ["PASS", "FAIL"]}},
        {"candidate_id": 1, "result": 1},
    ))
    pf_map: dict = {}
    for sess in sessions:
        cid = sess.get("candidate_id")
        if not cid:
            continue
        try:
            cand = db.candidates.find_one({"_id": ObjectId(cid)}, {"state": 1})
        except Exception:
            continue
        if not cand:
            continue
        s = cand.get("state") or "Unknown"
        if s not in pf_map:
            pf_map[s] = {"PASS": 0, "FAIL": 0}
        pf_map[s][sess["result"]] += 1

    for s_data in states_map.values():
        pf = pf_map.get(s_data["state"], {"PASS": 0, "FAIL": 0})
        s_data["selected"] = pf["PASS"]
        s_data["rejected"] = pf["FAIL"]
        total = pf["PASS"] + pf["FAIL"]
        s_data["passRate"] = round(pf["PASS"] / total * 100) if total > 0 else 0

    states_list = list(states_map.values())
    states_list.sort(key=lambda x: x["total"], reverse=True)

    # Districts summary (top 100)
    district_pipeline = [
        {
            "$group": {
                "_id": {"state": "$state", "district": "$district"},
                "total": {"$sum": 1},
            }
        },
        {"$sort": {"total": -1}},
        {"$limit": 100},
    ]
    district_rows = list(db.candidates.aggregate(district_pipeline))

    # Get pass/fail per district — Python-side join
    d_pf_map: dict = {}
    for sess in sessions:
        cid = sess.get("candidate_id")
        if not cid:
            continue
        try:
            cand = db.candidates.find_one({"_id": ObjectId(cid)}, {"state": 1, "district": 1})
        except Exception:
            continue
        if not cand:
            continue
        key = (cand.get("state") or "Unknown", cand.get("district") or "Unknown")
        if key not in d_pf_map:
            d_pf_map[key] = {"PASS": 0, "FAIL": 0}
        d_pf_map[key][sess["result"]] += 1

    districts_list = []
    for row in district_rows:
        d_state = row["_id"].get("state") or "Unknown"
        d_district = row["_id"].get("district") or "Unknown"
        key = (d_state, d_district)
        pf = d_pf_map.get(key, {"PASS": 0, "FAIL": 0})
        selected = pf["PASS"]
        rejected = pf["FAIL"]
        total = selected + rejected
        pass_rate = round(selected / total * 100) if total > 0 else 0
        districts_list.append({
            "state": d_state,
            "district": d_district,
            "total": row["total"],
            "pending": row["total"],
            "selected": selected,
            "rejected": rejected,
            "passRate": pass_rate,
        })

    return {
        "states": states_list,
        "districts": districts_list,
        "uniqueStates": [s["state"] for s in states_list],
        "stateDistribution": {s["state"]: s["total"] for s in states_list[:10]},
        "topStates": states_list[:8],
        "topDistricts": districts_list[:8],
    }


# ── Stats / Locations ─────────────────────────────────────────────────────────

@router.get("/stats/locations")
async def get_locations(state: str = Query(...), _admin=Depends(require_admin_auth)):
    db = get_sync_db()
    cursor = db.candidates.find(
        {"state": state},
        {"district": 1},
    )
    districts_map: dict = {}
    for doc in cursor:
        d = doc.get("district") or "Unknown"
        if d not in districts_map:
            districts_map[d] = 0
        districts_map[d] += 1

    districts = [{"district": k, "count": v} for k, v in sorted(districts_map.items(), key=lambda x: x[1], reverse=True)]
    return {"districts": districts}