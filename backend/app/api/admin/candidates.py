"""
Admin Candidates & Interviews API Endpoints — MongoDB.
"""
import json
from bson import ObjectId
from fastapi import APIRouter, HTTPException, Query, Depends
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone, timedelta
import uuid

from app.db.mongodb import get_sync_db
from app.api.admin.middleware import require_admin_auth

router = APIRouter(prefix="/api/admin", tags=["admin-candidates"])

PHASES = ["onboarding", "interview", "summary", "foundation", "module", "documents"]
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
    yearsOfExperience: Optional[float] = None
    farmingBackground: Optional[str] = None
    primaryExpertise: Optional[str] = None
    currentPhase: str
    status: str
    phases: List[PhaseStatus]
    createdAt: Optional[str] = None
    documentsSubmitted: bool = False
    attemptsDone: int = 0
    maxAttempts: int = 3
    foundationCourseCompleted: bool = False
    foundationCourseStatus: Optional[str] = "not_started"
    moduleCompleted: bool = False
    moduleStatus: Optional[str] = "not_started"
    interviewStatus: Optional[str] = "not_attended"
    isSelected: bool = False
    isNotJoined: bool = False
    consentAccepted: Optional[bool] = False
    consentWithdrawn: Optional[bool] = False
    consentStatus: Optional[str] = "pending"
    consentTimestamp: Optional[str] = None
    consentWithdrawnAt: Optional[str] = None


def _get_id_variants(val: Any) -> List[Any]:
    if not val:
        return []
    variants = [val, str(val)]
    try:
        if isinstance(val, str):
            variants.append(ObjectId(val))
    except Exception:
        pass
    return list(set(variants))


def _format_iso(dt: Any) -> Optional[str]:
    if not dt:
        return None
    if isinstance(dt, str):
        return dt
    if hasattr(dt, 'tzinfo') and dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()


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
        "candidate_id": {"$in": _get_id_variants(cand["_id"])},
        "status": "completed",
        "result": {"$in": ["PASS", "FAIL", "WITHDRAWN"]},
    })

    latest_session = db.interview_sessions.find_one(
        {
            "candidate_id": {"$in": _get_id_variants(cand["_id"])},
            "status": "completed",
            "result": {"$in": ["PASS", "FAIL"]}
        },
        sort=[("started_at", -1)]
    )

    interview_status = "not_attended"
    if latest_session:
        result = latest_session.get("result")
        if result == "PASS":
            interview_status = "pass"
        elif result == "FAIL":
            re_req = db.re_evaluation_requests.find_one({"interview_id": str(latest_session["_id"])})
            if re_req and re_req.get("status") == "pending":
                interview_status = "requested_revaluation"
            else:
                interview_status = "fail"

    foundation_completed = cand.get("foundation_course_completed", False)
    foundation_status = cand.get("foundation_course_status", "completed" if foundation_completed else "not_started")
    module_completed = cand.get("module_completed", False)
    module_status = cand.get("module_status", "completed" if module_completed else "not_started")

    consent_withdrawn = bool(cand.get("consent_withdrawn", False))
    consent_accepted = bool(cand.get("consent_accepted", False) or (cand.get("documents_submitted") and not consent_withdrawn))
    if consent_withdrawn:
        consent_status = "withdrawn"
    elif consent_accepted:
        consent_status = "granted"
    else:
        consent_status = "pending"

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
        createdAt=cand.get("created_at").isoformat() + "Z" if cand.get("created_at") else datetime.now(timezone.utc).isoformat() + "Z",
        documentsSubmitted=cand.get("documents_submitted", False),
        attemptsDone=attempts_done,
        maxAttempts=3,
        foundationCourseCompleted=foundation_completed,
        foundationCourseStatus=foundation_status,
        moduleCompleted=module_completed,
        moduleStatus=module_status,
        interviewStatus=interview_status,
        consentAccepted=consent_accepted,
        consentWithdrawn=consent_withdrawn,
        consentStatus=consent_status,
            isSelected=cand.get("is_selected", False),
            isNotJoined=cand.get("is_not_joined", False),
        consentTimestamp=_format_iso(cand.get("consent_timestamp")),
        consentWithdrawnAt=_format_iso(cand.get("consent_withdrawn_at")),
    )


# ── Candidates ─────────────────────────────────────────────────────────────────

@router.get("/candidates")
async def get_candidates(
    phase: Optional[str] = Query(None),
    phases: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    state: Optional[str] = Query(None),
    district: Optional[str] = Query(None),
    interviewStatus: Optional[str] = Query(None),
    limit: int = Query(10, ge=1, le=100000),
    offset: int = Query(0, ge=0),
    _admin=Depends(require_admin_auth),
):
    db = get_sync_db()

    query: Dict[str, Any] = {}

    if status == "trash":

        query["is_deleted"] = True

    else:

        query["is_deleted"] = {"$ne": True}


    if phase:
        query["current_phase"] = phase
    if phases:
        phase_list = [p.strip() for p in phases.split(",")]
        query["$or"] = [
            {"current_phase": {"$in": phase_list}},
            {"foundation_course_completed": True},
        ]
    if state:
        query["state"] = {"$regex": state, "$options": "i"}
    if district:
        query["district"] = {"$regex": district, "$options": "i"}

    if search:
        sl = search.lower()
        matched_users = list(db.users.find({"email": {"$regex": search, "$options": "i"}}, {"_id": 1}))
        matched_user_ids = [u["_id"] for u in matched_users]
        
        search_or = [
            {"full_name": {"$regex": search, "$options": "i"}},
            {"user_id": {"$in": matched_user_ids}}
        ]
        
        # Merge with existing $or if it exists (from phases)
        if "$or" in query:
            query["$and"] = [{"$or": query.pop("$or")}, {"$or": search_or}]
        else:
            query["$or"] = search_or

    cursor = db.candidates.find(query).sort("created_at", -1)
    all_candidates = list(cursor)

    # Bulk fetch users
    user_ids = [c.get("user_id") for c in all_candidates if c.get("user_id")]
    users = list(db.users.find({"_id": {"$in": user_ids}}))
    user_map = {str(u["_id"]): u.get("email") for u in users}

    # Bulk fetch interview sessions
    cand_id_variants = []
    for c in all_candidates:
        cand_id_variants.extend(_get_id_variants(c["_id"]))
    
    sessions = list(db.interview_sessions.find({
        "candidate_id": {"$in": cand_id_variants},
        "status": "completed",
        "result": {"$in": ["PASS", "FAIL", "WITHDRAWN"]}
    }))

    # Group sessions by candidate_id
    sessions_by_cand = {}
    for sess in sessions:
        cid = str(sess["candidate_id"])
        if cid not in sessions_by_cand:
            sessions_by_cand[cid] = []
        sessions_by_cand[cid].append(sess)

    # Bulk fetch re-eval requests
    session_ids = [str(sess["_id"]) for sess in sessions]
    re_reqs = list(db.re_evaluation_requests.find({"interview_id": {"$in": session_ids}}))
    re_req_map = {req["interview_id"]: req for req in re_reqs}

    results = []
    for cand in all_candidates:
        cand_id_str = str(cand["_id"])
        user_email = None
        if cand.get("user_id"):
            user_email = user_map.get(str(cand["user_id"]))
            
        raw_full_name = cand.get("full_name") or user_email or "Unknown"
        current_phase = cand.get("current_phase", "onboarding")

        # Gather variants for this candidate to match sessions
        c_variants = {str(v) for v in _get_id_variants(cand["_id"])}  # set: ObjectId and str forms stringify to the same key
        
        cand_sessions = []
        for cv in c_variants:
            cand_sessions.extend(sessions_by_cand.get(cv, []))
            
        attempts_done = len(cand_sessions)
        
        # Latest session with PASS or FAIL
        pf_sessions = [s for s in cand_sessions if s.get("result") in ["PASS", "FAIL"]]
        pf_sessions.sort(key=lambda x: x.get("started_at"), reverse=True)
        latest_session = pf_sessions[0] if pf_sessions else None

        # Determine interview status
        c_interview_status = "not_attended"
        if latest_session:
            res = latest_session.get("result")
            if res == "PASS":
                c_interview_status = "pass"
            elif res == "FAIL":
                re_req = re_req_map.get(str(latest_session["_id"]))
                if re_req and re_req.get("status") == "pending":
                    c_interview_status = "requested_revaluation"
                else:
                    c_interview_status = "fail"
                    
        # Apply interviewStatus filter early if possible
        if interviewStatus and c_interview_status != interviewStatus:
            continue

        foundation_completed = cand.get("foundation_course_completed", False)
        foundation_status = cand.get("foundation_course_status", "completed" if foundation_completed else "not_started")
        module_completed = cand.get("module_completed", False)
        module_status = cand.get("module_status", "completed" if module_completed else "not_started")

        consent_withdrawn = bool(cand.get("consent_withdrawn", False))
        consent_accepted = bool(cand.get("consent_accepted", False) or (cand.get("documents_submitted") and not consent_withdrawn))
        if consent_withdrawn:
            consent_status = "withdrawn"
        elif consent_accepted:
            consent_status = "granted"
        else:
            consent_status = "pending"

        response = CandidateResponse(
            id=cand_id_str,
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
            createdAt=cand.get("created_at").isoformat() + "Z" if cand.get("created_at") else datetime.now(timezone.utc).isoformat() + "Z",
            documentsSubmitted=cand.get("documents_submitted", False),
            attemptsDone=attempts_done,
            maxAttempts=3,
            foundationCourseCompleted=foundation_completed,
        foundationCourseStatus=foundation_status,
        moduleCompleted=module_completed,
        moduleStatus=module_status,
            interviewStatus=c_interview_status,
            consentAccepted=consent_accepted,
            consentWithdrawn=consent_withdrawn,
            consentStatus=consent_status,
            isSelected=cand.get("is_selected", False),
            isNotJoined=cand.get("is_not_joined", False),
            consentTimestamp=_format_iso(cand.get("consent_timestamp")),
            consentWithdrawnAt=_format_iso(cand.get("consent_withdrawn_at")),
        )

        results.append(response)

    total = len(results)
    paginated_results = results[offset : offset + limit]

    return {"candidates": paginated_results, "total": total}


@router.get("/candidates/{candidate_id}")
async def get_candidate(candidate_id: str, _admin=Depends(require_admin_auth)):
    db = get_sync_db()
    cand = db.candidates.find_one({"_id": {"$in": _get_id_variants(candidate_id)}})
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
        {"_id": {"$in": _get_id_variants(candidate_id)}},
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
        {"candidate_id": {"$in": _get_id_variants(candidate_id)}, "status": "completed", "result": "FAIL"},
        {"$set": {"completed_at": None}},
        sort=[("started_at", -1)],
    )

    # Clear cooldownUntil on queue entry
    db.queue_entries.update_one(
        {"candidate_id": {"$in": _get_id_variants(candidate_id)}},
        {"$set": {"cooldown_until": None, "updated_at": now}},
    )

    # Move candidate back to interview phase, reset flags
    db.candidates.update_one(
        {"_id": {"$in": _get_id_variants(candidate_id)}},
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

    cand_ids = [s.get("candidate_id") for s in sessions if s.get("candidate_id")]
    cand_vars = []
    for cid in cand_ids: cand_vars.extend(_get_id_variants(cid))
    candidates = list(db.candidates.find({"_id": {"$in": cand_vars}}))
    cand_map = {str(c["_id"]): c for c in candidates}

    user_ids = [c.get("user_id") for c in candidates if c.get("user_id")]
    user_vars = []
    for uid in user_ids: user_vars.extend(_get_id_variants(uid))
    users = list(db.users.find({"_id": {"$in": user_vars}}))
    user_map = {str(u["_id"]): u for u in users}

    interviews = []
    for s in sessions:
        interview_data = s.get("interview_data") or {}
        if isinstance(interview_data, str):
            try:
                import json
                interview_data = json.loads(interview_data)
            except Exception:
                interview_data = {}

        messages = interview_data.get("messages", [])
        if not isinstance(messages, list):
            messages = []

        cid = s.get("candidate_id")
        candidate = cand_map.get(str(cid)) if cid else None
        
        # Skip stale/mock sessions that don't have an associated candidate profile in the database
        if not candidate:
            continue
        
        user = None
        if candidate.get("user_id"):
            user = user_map.get(str(candidate.get("user_id")))

        candidate_name = ""
        candidate_name = candidate.get("full_name") or ""
        if not candidate_name and user:
            candidate_name = user.get("name") or ""
        candidate_name = candidate_name.strip()

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

    role = candidate_data.get("eligible_role")
    threshold = get_evaluation_settings(role).get("pass_threshold", 60)
    overall_score = evaluation.get("overall_score") or 0
    
    if session.get("end_reason") == "voluntary_withdrawal":
        new_result = "WITHDRAWN"
    else:
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

    # Update re-evaluation request status if present
    db.re_evaluation_requests.update_many(
        {"interview_id": str(interview_id)},
        {"$set": {
            "status": "completed",
            "score_after": overall_score,
            "result_after": new_result,
            "completed_at": now,
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
        "overall_score": overall_score,
        "result": new_result,
        "evaluation": evaluation,
    }


# ── KPI Funnel (Analytics overview cards) ──────────────────────────────────────

# Required onboarding fields written only by the candidate profile form (POST /api/candidate),
# so their presence means the profile was submitted, whatever the candidate's current_phase is.
_PROFILE_FIELDS = ("primary_expertise", "crops_grown", "current_role")

# A session is an interview attempt exactly when the attempt limit counts it (queue_manager.start_interview).
_ATTEMPT_RESULTS = ["PASS", "FAIL", "WITHDRAWN"]

# Pipeline order of current_phase values. "module" is the Ground Truth Module phase (feat/module-phase on main);
# offer/signing/joining are legacy post-documents phases the Documents tab still lists.
_FUNNEL_PHASE_ORDER = {
    "onboarding": 0, "interview": 1, "summary": 2, "foundation": 3, "module": 4,
    "documents": 5, "offer": 6, "signing": 6, "joining": 6,
}

# kpi-details keys for the funnel cards, mapped to the funnel flag each one lists
FUNNEL_KPIS = {
    "registered": "registered",
    "profileCompleted": "profile_completed",
    "attendedInterview": "attended_interview",
    "passedInterview": "passed_interview",
    "failedInterview": "failed_interview",
    "reattempted": "reattempted",
    "foundationPhase": "foundation_phase",
    "foundationInProgress": "foundation_in_progress",
    "foundationNotStarted": "foundation_not_started",
    "foundationCompleted": "foundation_completed",
    "groundTruthModule": "ground_truth_module",
    "groundTruthInProgress": "ground_truth_in_progress",
    "groundTruthNotStarted": "ground_truth_not_started",
    "groundTruthCompleted": "ground_truth_completed",
    "documentsPhase": "documents_phase",
    "documentsSubmitted": "documents_submitted",
    "selectedOnboarded": "selected_onboarded",
    "notSelectedOnboarded": "not_selected_onboarded",
    "notReadyToJoin": "not_ready_to_join",
}


def _created_at_range(start_date: Optional[str], end_date: Optional[str]) -> Optional[dict]:
    """Registration-date bounds shared by the Detailed Candidate Report and the KPI funnel.

    created_at is stored as a BSON Date, so bounds must be datetimes (a string never matches a Date).
    Naive datetimes are treated as UTC by pymongo, matching how created_at is stored.
    """
    if not start_date and not end_date:
        return None
    try:
        date_query = {}
        if start_date:
            date_query["$gte"] = datetime.strptime(start_date, "%Y-%m-%d")
        if end_date:
            # Exclusive upper bound at the next midnight so the whole end date is included
            date_query["$lt"] = datetime.strptime(end_date, "%Y-%m-%d") + timedelta(days=1)
    except ValueError:
        raise HTTPException(400, "start_date and end_date must be in YYYY-MM-DD format")
    return date_query


def _in_created_at_range(created_at: Any, date_query: dict) -> bool:
    """Python-side twin of the Mongo created_at range match, for checks that run after merging duplicate docs."""
    if not isinstance(created_at, datetime):
        return False  # a Mongo Date range never matches a missing or non-Date value
    if created_at.tzinfo is not None:
        created_at = created_at.astimezone(timezone.utc).replace(tzinfo=None)
    if "$gte" in date_query and created_at < date_query["$gte"]:
        return False
    if "$lt" in date_query and created_at >= date_query["$lt"]:
        return False
    return True


def _candidate_funnel(
    db,
    state: Optional[str] = None,
    district: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    role: Optional[str] = None,
) -> List[dict]:
    """One entry per registered person with historical funnel flags, newest first.

    Candidate docs sharing a user_id are merged (the email-fallback path in candidate/route.py looks up
    user_id as a string, so a user registered with an ObjectId user_id can get a second stub doc), and
    sessions are matched on every ObjectId/str id variant, so nobody is counted twice.
    start_date/end_date filter on registration date (the person's earliest created_at), as the report does.
    """
    date_query = _created_at_range(start_date, end_date)
    cands = list(db.candidates.find({"is_deleted": {"$ne": True}}).sort("created_at", -1))
    users = list(db.users.find())

    groups: Dict[str, List[dict]] = {}
    for c in cands:
        groups.setdefault(str(c.get("user_id") or c["_id"]), []).append(c)

    for u in users:
        uid = str(u["_id"])
        if uid not in groups:
            groups[uid] = [{
                "_id": u["_id"],
                "user_id": u["_id"],
                "email": u.get("email"),
                "created_at": u.get("created_at"),
                "name": u.get("name"),
            }]

    def has_profile(c: dict) -> bool:
        return any(c.get(f) for f in _PROFILE_FIELDS)

    entries = []
    for docs in groups.values():
        # Representative doc: the one holding the submitted profile (and so the state/district); ties keep the newest
        rep = max(docs, key=lambda d: (has_profile(d), bool(d.get("state"))))
        if state and state != "All" and rep.get("state") != state:
            continue
        if district and district != "All" and (rep.get("district") or "Unknown") != district:
            continue
        if role and role != "All" and rep.get("eligible_role") != role:
            continue
        if date_query is not None:
            registered_at = min((d["created_at"] for d in docs if isinstance(d.get("created_at"), datetime)), default=None)
            if not _in_created_at_range(registered_at, date_query):
                continue
        entries.append({"rep": rep, "docs": docs, "profile": any(has_profile(d) for d in docs)})

    id_variants = []
    for e in entries:
        for d in e["docs"]:
            id_variants.extend(_get_id_variants(d["_id"]))
    attempts_by_cand: Dict[str, List[dict]] = {}
    for sess in db.interview_sessions.find(
        {"candidate_id": {"$in": id_variants}, "status": "completed", "result": {"$in": _ATTEMPT_RESULTS}},
        {"candidate_id": 1, "started_at": 1, "result": 1, "score": 1, "overall_score": 1},
    ):
        attempts_by_cand.setdefault(str(sess["candidate_id"]), []).append(sess)

    for e in entries:
        attempts = {}
        for d in e["docs"]:
            for sess in attempts_by_cand.get(str(d["_id"]), []):
                attempts[str(sess["_id"])] = sess
        e["attempts"] = sorted(attempts.values(), key=lambda s: _format_iso(s.get("started_at")) or "")

        results = {s.get("result") for s in e["attempts"]}
        attended = len(e["attempts"]) > 0
        e["registered"] = True
        # Attending an interview implies the profile was submitted, which keeps every stage a subset of the previous one
        e["profile_completed"] = e["profile"] or attended
        e["attended_interview"] = attended
        e["passed_interview"] = "PASS" in results
        # Failed = attended and never passed, so a later PASS moves a candidate out of Failed
        e["failed_interview"] = "FAIL" in results and "PASS" not in results
        e["reattempted"] = len(e["attempts"]) >= 2

        # Post-interview stages. No phase history is stored, so a stage counts as reached when current_phase is at or
        # past it, its status was ever set, or a later stage was reached; a stage counts as completed when its
        # completion field is set or a later stage was reached (as the admin bypass actions also mark it completed).
        # Each stage is intersected with the previous one, so every card is a subset of its denominator.
        c = e["rep"]
        phase_idx = _FUNNEL_PHASE_ORDER.get(c.get("current_phase") or "onboarding", 0)
        fc_status, gt_status = c.get("foundation_course_status"), c.get("module_status")
        docs_submitted = c.get("documents_submitted") is True
        reached_documents = phase_idx >= _FUNNEL_PHASE_ORDER["documents"] or docs_submitted
        reached_module = (
            phase_idx >= _FUNNEL_PHASE_ORDER["module"] or gt_status not in (None, "not_started")
            or c.get("module_completed") is True or reached_documents
        )
        reached_foundation = (
            phase_idx >= _FUNNEL_PHASE_ORDER["foundation"] or fc_status not in (None, "not_started")
            or c.get("foundation_course_completed") is True or reached_module
        )

        e["foundation_phase"] = e["passed_interview"] and reached_foundation
        e["foundation_completed"] = e["foundation_phase"] and (
            c.get("foundation_course_completed") is True or fc_status == "completed" or reached_module
        )
        # Stored status only (set by Launch Course); someone already counted as completed is not also in progress
        e["foundation_in_progress"] = e["foundation_phase"] and fc_status == "in_progress" and not e["foundation_completed"]
        # The rest of the phase: status missing (the admin API's "not_started" default) or explicitly "not_started".
        # Any unrecognised legacy value (e.g. "incomplete") also lands here, so In Progress + Not Started + Completed
        # always partition the phase.
        e["foundation_not_started"] = e["foundation_phase"] and not e["foundation_completed"] and not e["foundation_in_progress"]

        e["ground_truth_module"] = e["foundation_completed"] and reached_module
        e["ground_truth_completed"] = e["ground_truth_module"] and (
            c.get("module_completed") is True or gt_status == "completed" or reached_documents
        )
        e["ground_truth_in_progress"] = e["ground_truth_module"] and gt_status == "in_progress" and not e["ground_truth_completed"]
        # Same partition as Foundation: missing or "not_started" module_status (plus any unrecognised legacy value)
        e["ground_truth_not_started"] = (
            e["ground_truth_module"] and not e["ground_truth_completed"] and not e["ground_truth_in_progress"]
        )

        e["documents_phase"] = e["ground_truth_completed"] and reached_documents
        # Same flag the admin Documents tab shows as "Submitted" and gates "Mark Selected" on
        e["documents_submitted"] = e["documents_phase"] and docs_submitted
        e["not_ready_to_join"] = e["documents_submitted"] and c.get("is_not_joined") is True
        e["selected_onboarded"] = e["documents_submitted"] and c.get("is_selected") is True and not e["not_ready_to_join"]
        e["not_selected_onboarded"] = e["documents_submitted"] and not c.get("is_selected") and not e["not_ready_to_join"]
    return entries


def _funnel_counts(entries: List[dict]) -> Dict[str, int]:
    return {kpi: sum(1 for e in entries if e[flag]) for kpi, flag in FUNNEL_KPIS.items()}


def _funnel_kpi_candidates(
    db,
    kpi: str,
    state: Optional[str],
    district: Optional[str],
    role: Optional[str],
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
) -> List[dict]:
    flag = FUNNEL_KPIS[kpi]
    entries = [e for e in _candidate_funnel(db, state, district, start_date, end_date, role) if e[flag]]

    user_ids = []
    for e in entries:
        user_ids.extend(_get_id_variants(e["rep"].get("user_id")))
    user_map = {str(u["_id"]): u.get("email") for u in db.users.find({"_id": {"$in": user_ids}}, {"email": 1})}

    results = []
    for e in entries:
        c = e["rep"]
        user_email = user_map.get(str(c.get("user_id")))
        results.append({
            "id": str(c["_id"]),
            "fullName": c.get("full_name") or c.get("name") or user_email or "",
            "email": c.get("email") or user_email or "",
            "phone": c.get("phone") or "",
            "state": c.get("state") or "",
            "district": c.get("district") or "",
            "current_phase": c.get("current_phase") or "onboarding",
            "is_selected": c.get("is_selected", False),
            "created_at": c.get("created_at"),
            "documents_submitted_at": c.get("consent_timestamp") or c.get("updated_at"),
            "attempts": [
                {
                    "date": s.get("started_at"),
                    "result": s.get("result"),
                    "score": s.get("score") or s.get("overall_score") or 0,
                }
                for s in e["attempts"]
            ],
            "total_attempts": len(e["attempts"]),
        })
    return results


# ── Dashboard Stats ────────────────────────────────────────────────────────────

@router.get("/stats/overview")
async def get_overview_stats(
    state: str = Query(None),
    district: str = Query(None),
    start_date: str = Query(None),
    end_date: str = Query(None),
    role: str = Query(None),
    _admin=Depends(require_admin_auth),
):
    db = get_sync_db()

    cand_query = {"is_deleted": {"$ne": True}}
    if state and state != "All":
        cand_query["state"] = state
    if district and district != "All":
        cand_query["district"] = district
    if role and role != "All":
        cand_query["eligible_role"] = role

    total = db.candidates.count_documents(cand_query)
    by_phase = {}
    for phase in PHASES:
        q = cand_query.copy()
        q["current_phase"] = phase
        by_phase[phase] = db.candidates.count_documents(q)

    if cand_query:
        cands = list(db.candidates.find(cand_query, {"_id": 1}))
        cand_ids = [c["_id"] for c in cands]
        
        cand_vars = []
        for cid in cand_ids:
            cand_vars.extend(_get_id_variants(cid))
            
        sess_query_base = {"candidate_id": {"$in": cand_vars}}
    else:
        sess_query_base = {}

    active_query = sess_query_base.copy()
    active_query["status"] = {"$in": ["active", "interviewing", "paused"]}
    active_interviews = db.interview_sessions.count_documents(active_query)

    completed_query = sess_query_base.copy()
    completed_query["status"] = "completed"
    completed_query["result"] = {"$in": ["PASS", "FAIL"]}
    total_completed = db.interview_sessions.count_documents(completed_query)

    pass_query = sess_query_base.copy()
    pass_query["status"] = "completed"
    pass_query["result"] = "PASS"
    total_pass = db.interview_sessions.count_documents(pass_query)

    fail_query = sess_query_base.copy()
    fail_query["status"] = "completed"
    fail_query["result"] = "FAIL"
    total_fail = db.interview_sessions.count_documents(fail_query)

    selected_query = cand_query.copy()
    selected_query["is_selected"] = True
    total_selected = db.candidates.count_documents(selected_query)

    return {
        "totalCandidates": total,
        "byPhase": by_phase,
        "activeInterviews": active_interviews,
        "totalCompleted": total_completed,
        "totalPass": total_pass,
        "totalFail": total_fail,
        "totalSelected": total_selected,
        # Only the KPI funnel is narrowed by registration date; the other fields keep their existing meaning
        "funnel": _funnel_counts(_candidate_funnel(db, state, district, start_date, end_date, role)),
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
        elif phase in ("interview", "summary", "foundation", "module", "documents"):
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
    limit: int = Query(10, ge=1, le=100000),
    offset: int = Query(0, ge=0),
    _admin=Depends(require_admin_auth),
):
    from bson import ObjectId

    db = get_sync_db()
    total = db.anti_cheat_events.count_documents({})
    cursor = db.anti_cheat_events.find().sort("created_at", -1).skip(offset).limit(limit)
    events = list(cursor)

    cand_ids = [e.get("candidate_id") for e in events if e.get("candidate_id")]
    cand_vars = []
    for cid in cand_ids: cand_vars.extend(_get_id_variants(cid))
    candidates = list(db.candidates.find({"_id": {"$in": cand_vars}}))
    cand_map = {str(c["_id"]): c for c in candidates}

    user_ids = [c.get("user_id") for c in candidates if c.get("user_id")]
    user_vars = []
    for uid in user_ids: user_vars.extend(_get_id_variants(uid))
    users = list(db.users.find({"_id": {"$in": user_vars}}))
    user_map = {str(u["_id"]): u for u in users}

    violations = []
    for event in events:
        cid = event.get("candidate_id")
        cand = cand_map.get(str(cid)) if cid else None
        user = user_map.get(str(cand.get("user_id"))) if cand and cand.get("user_id") else None
        
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
            "createdAt": event.get("created_at").isoformat() + "Z" if event.get("created_at") else "",
            "autoClosed": event.get("severity") == "critical",
        })
    return {"violations": violations, "total": total}


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
    result = db.candidates.update_one({"_id": {"$in": _get_id_variants(candidate_id)}}, {"$set": updates})
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

def compute_eligible_role(candidate: dict) -> str:
    education = candidate.get("education", [])
    if not isinstance(education, list):
        education = []
    
    # If no valid education items
    if not any(e.get("level") and e.get("discipline") and e.get("status") for e in education):
        return "Intern"

    if any(e.get("status") == "Pursuing" for e in education):
        return "Intern"

    standalone_msc_disciplines = [
        'Agriculture', 'Agronomy', 'Soil Science', 'Entomology', 'Plant Pathology',
        'Agrometeorology', 'Food Technology', 'Agricultural Extension', 
        'Genetics & Plant Breeding', 'Seed Science & Technology'
    ]

    has_diploma_agri = any(e.get("level") == "Diploma" and e.get("discipline") == "Agriculture" and e.get("status") == "Completed" for e in education)
    has_bsc_agri = any(e.get("level") in ["B.Sc.", "B.Sc. (Hons.)"] and e.get("discipline") == "Agriculture" and e.get("status") == "Completed" for e in education)
    has_msc_hort = any(e.get("level") in ["M.Sc.", "Ph.D."] and e.get("discipline") == "Horticulture" and e.get("status") == "Completed" for e in education)
    has_bsc_diploma_bg = any(e.get("level") in ["B.Sc.", "B.Sc. (Hons.)", "Diploma"] and e.get("discipline") == "Agriculture" and e.get("status") == "Completed" for e in education)
    has_msc_agri = any(e.get("level") in ["M.Sc.", "Ph.D."] and e.get("discipline") in standalone_msc_disciplines and e.get("status") == "Completed" for e in education)

    has_completed_qualifying = has_diploma_agri or has_bsc_agri or (has_msc_hort and has_bsc_diploma_bg) or has_msc_agri

    if not has_completed_qualifying:
        return "Intern"

    max_role = "YP"
    has_advanced_agri = any(e.get("level") in ["M.Sc.", "Ph.D.", "Postdoctoral"] and e.get("discipline") in standalone_msc_disciplines and e.get("status") == "Completed" for e in education) or (has_msc_hort and has_bsc_diploma_bg)
    
    if has_advanced_agri:
        max_role = "Senior"
    elif has_bsc_agri:
        max_role = "Agri"
    else:
        max_role = "YP"

    try:
        exp = float(candidate.get("years_of_experience") or 0)
    except (ValueError, TypeError):
        exp = 0

    if exp < 2:
        raw_role = "YP"
    elif 2 <= exp < 3:
        raw_role = "Junior"
    elif 3 <= exp < 5:
        raw_role = "Agri"
    else:
        raw_role = "Senior"

    role_levels = {'Intern': 0, 'YP': 1, 'Junior': 2, 'Agri': 3, 'Senior': 4}
    
    if role_levels.get(raw_role, 0) > role_levels.get(max_role, 0):
        return max_role
    return raw_role

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

    query: dict = {"status": "completed"}
    if result and result == "RE_EVALUATION_REQUESTED":
        reqs = list(db.re_evaluation_requests.find())
        req_interview_ids = [r.get("interview_id") for r in reqs if r.get("interview_id")]
        query["_id"] = {"$in": [ObjectId(id) if ObjectId.is_valid(id) else id for id in req_interview_ids]}
    elif result:
        query["result"] = result
    else:
        query["result"] = {"$in": ["PASS", "FAIL"]}

    if search:
        sl = search.lower()
        matched_users = list(db.users.find({"email": {"$regex": search, "$options": "i"}}, {"_id": 1}))
        matched_user_ids = [u["_id"] for u in matched_users]
        cand_query = {"$or": [
            {"full_name": {"$regex": search, "$options": "i"}},
            {"user_id": {"$in": matched_user_ids}}
        ]}
        matched_cands = list(db.candidates.find(cand_query, {"_id": 1}))
        matched_cand_ids = [c["_id"] for c in matched_cands]
        # Also, string versions of object ids
        matched_cand_ids_str = [str(i) for i in matched_cand_ids]
        matched_cand_ids.extend(matched_cand_ids_str)
        query["candidate_id"] = {"$in": matched_cand_ids}

    total = db.interview_sessions.count_documents(query)
    cursor = db.interview_sessions.find(query).sort("started_at", -1).skip(offset).limit(limit)
    sessions = list(cursor)

    # Bulk fetches
    cand_ids = []
    for s in sessions:
        if s.get("candidate_id"):
            cand_ids.extend(_get_id_variants(s.get("candidate_id")))
    
    candidates = list(db.candidates.find({"_id": {"$in": cand_ids}}))
    cand_map = {str(c["_id"]): c for c in candidates}

    user_ids = []
    for c in candidates:
        if c.get("user_id"):
            user_ids.extend(_get_id_variants(c.get("user_id")))
    users = list(db.users.find({"_id": {"$in": user_ids}}))
    user_map = {str(u["_id"]): u for u in users}

    session_ids_str = [str(s.get("_id")) for s in sessions]
    re_reqs = list(db.re_evaluation_requests.find({"interview_id": {"$in": session_ids_str}}))
    re_req_map = {r["interview_id"]: r for r in re_reqs}

    # For attempts
    all_cand_sessions = list(db.interview_sessions.find({
        "candidate_id": {"$in": cand_ids},
        "status": "completed",
        "result": {"$in": ["PASS", "FAIL", "WITHDRAWN"]}
    }))
    sess_by_cand = {}
    for cs in all_cand_sessions:
        cid = str(cs.get("candidate_id"))
        if cid not in sess_by_cand:
            sess_by_cand[cid] = []
        sess_by_cand[cid].append(cs)

    evals = []
    for s in sessions:
        interview_data = s.get("interview_data") or {}
        if isinstance(interview_data, str):
            try:
                import json
                interview_data = json.loads(interview_data)
            except Exception:
                interview_data = {}

        candidate_id = s.get("candidate_id")
        candidate = cand_map.get(str(candidate_id)) if candidate_id else None
        
        user = None
        if candidate and candidate.get("user_id"):
            user = user_map.get(str(candidate.get("user_id")))

        if candidate:
            candidate_name = candidate.get("full_name") or ""
            if not candidate_name and user:
                candidate_name = user.get("name") or ""
            candidate_name = candidate_name.strip()
            if not candidate_name and user:
                candidate_name = user.get("email", "")
            candidate_email = user.get("email") if user else None
        else:
            candidate_name = ""
            candidate_email = None

        if search:
            sl = search.lower()
            if sl not in candidate_name.lower() and sl not in (candidate_email or "").lower():
                continue

        messages = interview_data.get("messages", [])
        if not isinstance(messages, list):
            messages = []

        if candidate_id:
            c_sessions = sess_by_cand.get(str(candidate_id), [])
            started_at = s.get("started_at")
            attempt_num = sum(1 for cs in c_sessions if cs.get("started_at") and started_at and cs.get("started_at") <= started_at)
            if attempt_num == 0: attempt_num = 1
        else:
            attempt_num = 1

        eval_data = interview_data.get("evaluation") or {}
        raw_score = s.get("score")
        score = raw_score if raw_score is not None else eval_data.get("overall_score")

        session_id_str = str(s.get("_id"))
        re_req = re_req_map.get(session_id_str)

        level = None
        if candidate:
            level = candidate.get("eligible_role")
            if not level:
                level = compute_eligible_role(candidate)
        
        from app.services.settings_service import get_evaluation_settings
        eval_settings = get_evaluation_settings(level)
        pass_threshold = eval_settings.get("pass_threshold", 60)

        evals.append({
            "id": s.get("_id"),
            "candidateId": candidate_id,
            "candidateName": candidate_name,
            "email": candidate_email,
            "phone": candidate.get("phone") if candidate else None,
            "result": s.get("result"),
            "endReason": s.get("end_reason"),
            "score": score,
            "startedAt": s.get("started_at").isoformat() + "Z" if s.get("started_at") else None,
            "completedAt": (
                s.get("completed_at").isoformat() + "Z" if s.get("completed_at") else
                s.get("started_at").isoformat() + "Z" if s.get("started_at") else
                None
            ),
            "messages": messages,
            "evaluation": interview_data.get("evaluation"),
            "attempt": attempt_num,
            "reEvaluationRequested": re_req is not None and re_req.get("status") == "pending",
            "reEvaluationStatus": re_req.get("status") if re_req else None,
            "reEvaluationReason": re_req.get("reason") if re_req else None,
            "reEvaluationRequestedAt": _format_iso(re_req.get("requested_at")) if re_req else None,
            "level": level,
            "passThreshold": pass_threshold,
        })


    paginated_evals = evals

    return {"evaluations": paginated_evals, "total": total}


# ── Get all re-evaluation requests (admin view) ──────────────────────────────

@router.get("/re-evaluations")
async def get_all_re_evaluations(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0),
    search: str = Query(None),
    _admin=Depends(require_admin_auth),
):
    from bson import ObjectId
    import json

    db = get_sync_db()

    req_cursor = db.re_evaluation_requests.find().sort("requested_at", -1)
    all_requests = list(req_cursor)

    # Bulk fetches
    interview_ids = [r.get("interview_id") for r in all_requests if r.get("interview_id")]
    interview_ids_vars = []
    for iid in interview_ids:
        interview_ids_vars.extend(_get_id_variants(iid))
        
    sessions = list(db.interview_sessions.find({"_id": {"$in": interview_ids_vars}}))
    session_map = {str(s["_id"]): s for s in sessions}

    cand_ids = [s.get("candidate_id") for s in sessions if s.get("candidate_id")]
    cand_ids_vars = []
    for cid in cand_ids:
        cand_ids_vars.extend(_get_id_variants(cid))
        
    candidates = list(db.candidates.find({"_id": {"$in": cand_ids_vars}}))
    cand_map = {str(c["_id"]): c for c in candidates}

    user_ids = [c.get("user_id") for c in candidates if c.get("user_id")]
    user_ids_vars = []
    for uid in user_ids:
        user_ids_vars.extend(_get_id_variants(uid))
        
    users = list(db.users.find({"_id": {"$in": user_ids_vars}}))
    user_map = {str(u["_id"]): u for u in users}

    # Attempts bulk
    all_cand_sessions = list(db.interview_sessions.find({
        "candidate_id": {"$in": cand_ids_vars},
        "status": "completed",
        "result": {"$in": ["PASS", "FAIL", "WITHDRAWN"]}
    }))
    sess_by_cand = {}
    for cs in all_cand_sessions:
        cid = str(cs.get("candidate_id"))
        if cid not in sess_by_cand:
            sess_by_cand[cid] = []
        sess_by_cand[cid].append(cs)

    items = []
    for req_doc in all_requests:
        interview_id = str(req_doc.get("interview_id"))
        session = session_map.get(interview_id)
        
        if not session:
            continue

        interview_data = session.get("interview_data") or {}
        if isinstance(interview_data, str):
            try:
                interview_data = json.loads(interview_data)
            except Exception:
                interview_data = {}

        candidate_id = session.get("candidate_id")
        candidate = cand_map.get(str(candidate_id)) if candidate_id else None
        
        user = None
        if candidate and candidate.get("user_id"):
            user = user_map.get(str(candidate.get("user_id")))

        candidate_name = ""
        if candidate:
            candidate_name = candidate.get("full_name") or ""
        if not candidate_name and user:
            candidate_name = user.get("name") or ""
        candidate_name = candidate_name.strip()
        if not candidate_name and user:
            candidate_name = user.get("email", "")

        candidate_email = (user.get("email") if user else (candidate.get("email") if candidate else None)) or ""

        if search:
            sl = search.lower()
            if sl not in candidate_name.lower() and sl not in candidate_email.lower():
                continue

        messages = interview_data.get("messages", [])
        if not isinstance(messages, list):
            messages = []

        if candidate_id:
            c_sessions = sess_by_cand.get(str(candidate_id), [])
            started_at = session.get("started_at")
            attempt_num = sum(1 for cs in c_sessions if cs.get("started_at") and started_at and cs.get("started_at") <= started_at)
            if attempt_num == 0: attempt_num = 1
        else:
            attempt_num = 1

        eval_data = interview_data.get("evaluation") or {}
        raw_score = session.get("score")
        score = raw_score if raw_score is not None else eval_data.get("overall_score")

        items.append({
            "id": req_doc.get("_id"),
            "interviewId": str(session.get("_id")),
            "candidateId": candidate_id,
            "candidateName": candidate_name or "Unknown Candidate",
            "email": candidate_email,
            "phone": candidate.get("phone") if candidate else None,
            "result": session.get("result"),
            "endReason": session.get("end_reason"),
            "score": score,
            "attempt": attempt_num,
            "requestedAt": _format_iso(req_doc.get("requested_at")),
            "completedAt": (
                session.get("completed_at").isoformat() + "Z" if session.get("completed_at") else
                session.get("started_at").isoformat() + "Z" if session.get("started_at") else
                None
            ),
            "reason": req_doc.get("reason", ""),
            "status": req_doc.get("status", "pending"),
            "scoreAfter": req_doc.get("score_after"),
            "resultAfter": req_doc.get("result_after"),
            "reEvalCompletedAt": _format_iso(req_doc.get("completed_at")),
            "messages": messages,
            "evaluation": interview_data.get("evaluation"),
        })

    paginated_items = items[offset:offset + limit]
    pending_count = db.re_evaluation_requests.count_documents({"status": "pending"})
    return {"reEvaluations": paginated_items, "total": len(items), "pendingCount": pending_count}


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
        elif phase in ("interview", "summary", "foundation", "module", "documents"):
            states_map[s]["interviewed"] += row["count"]

    # Get pass/fail per state
    sessions = list(db.interview_sessions.find(
        {"status": "completed", "result": {"$in": ["PASS", "FAIL"]}},
        {"candidate_id": 1, "result": 1},
    ))
    
    cand_ids = [s.get("candidate_id") for s in sessions if s.get("candidate_id")]
    cand_vars = []
    for cid in cand_ids: cand_vars.extend(_get_id_variants(cid))
    candidates = list(db.candidates.find({"_id": {"$in": cand_vars}}, {"state": 1, "district": 1}))
    cand_map = {str(c["_id"]): c for c in candidates}

    pf_map: dict = {}
    d_pf_map: dict = {}
    for sess in sessions:
        cid = str(sess.get("candidate_id"))
        cand = cand_map.get(cid)
        if not cand: continue
        
        s = cand.get("state") or "Unknown"
        if s not in pf_map: pf_map[s] = {"PASS": 0, "FAIL": 0}
        pf_map[s][sess["result"]] += 1
        
        key = (s, cand.get("district") or "Unknown")
        if key not in d_pf_map: d_pf_map[key] = {"PASS": 0, "FAIL": 0}
        d_pf_map[key][sess["result"]] += 1

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
                "_id": {
                    "state": "$state",
                    "district": "$district",
                    "phase": "$current_phase",
                },
                "count": {"$sum": 1},
            }
        }
    ]
    district_rows = list(db.candidates.aggregate(district_pipeline))

    districts_map: dict = {}
    for row in district_rows:
        d_state = row["_id"].get("state") or "Unknown"
        d_district = row["_id"].get("district") or "Unknown"
        key = (d_state, d_district)
        if key not in districts_map:
            districts_map[key] = {"state": d_state, "district": d_district, "total": 0, "pending": 0, "interviewed": 0}
        
        districts_map[key]["total"] += row["count"]
        phase = row["_id"].get("phase") or "onboarding"
        if phase == "onboarding":
            districts_map[key]["pending"] += row["count"]
        elif phase in ("interview", "summary", "foundation", "module", "documents"):
            districts_map[key]["interviewed"] += row["count"]

    districts_list = []
    for key, d_info in districts_map.items():
        pf = d_pf_map.get(key, {"PASS": 0, "FAIL": 0})
        selected = pf["PASS"]
        rejected = pf["FAIL"]
        total_pf = selected + rejected
        pass_rate = round(selected / total_pf * 100) if total_pf > 0 else 0
        districts_list.append({
            "state": d_info["state"],
            "district": d_info["district"],
            "total": d_info["total"],
            "pending": d_info["pending"],
            "interviewed": d_info["interviewed"],
            "selected": selected,
            "rejected": rejected,
            "passRate": pass_rate,
        })
    
    districts_list.sort(key=lambda x: x["total"], reverse=True)
    districts_list = districts_list[:100]

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


# ── Bypass Foundation Course ─────────────────────────────────────────────────

@router.post("/candidates/{candidate_id}/bypass-course")
async def bypass_candidate_course(candidate_id: str, _admin=Depends(require_admin_auth)):
    db = get_sync_db()
    from datetime import datetime, timezone
    
    cand = db.candidates.find_one({"_id": {"$in": _get_id_variants(candidate_id)}})
    if not cand:
        raise HTTPException(status_code=404, detail="Candidate not found")
        
    now = datetime.now(timezone.utc)
    current_phase = cand.get("current_phase", "onboarding")
    new_phase = current_phase
    if current_phase in ["onboarding", "interview", "summary", "foundation"]:
        new_phase = "module"
        
    db.candidates.update_one(
        {"_id": {"$in": _get_id_variants(candidate_id)}},
        {"$set": {
            "foundation_course_completed": True,
            "foundation_course_status": "completed",
            "current_phase": new_phase,
            "updated_at": now
        }}
    )
    return {"success": True, "message": "Candidate course bypassed successfully."}

@router.post("/candidates/{candidate_id}/bypass-module")
async def bypass_candidate_module(candidate_id: str, _admin=Depends(require_admin_auth)):
    db = get_sync_db()
    from datetime import datetime, timezone
    
    cand = db.candidates.find_one({"_id": {"$in": _get_id_variants(candidate_id)}})
    if not cand:
        raise HTTPException(status_code=404, detail="Candidate not found")
        
    now = datetime.now(timezone.utc)
    current_phase = cand.get("current_phase", "onboarding")
    new_phase = current_phase
    if current_phase in ["onboarding", "interview", "summary", "foundation", "module"]:
        new_phase = "documents"
        
    db.candidates.update_one(
        {"_id": {"$in": _get_id_variants(candidate_id)}},
        {"$set": {
            "module_completed": True,
            "module_status": "completed",
            "current_phase": new_phase,
            "updated_at": now
        }}
    )
    return {"success": True, "message": "Candidate module bypassed successfully."}
@router.delete("/candidates/{candidate_id}")
def delete_candidate(candidate_id: str, db=Depends(get_sync_db), admin=Depends(require_admin_auth)):
    try:
        cand = db.candidates.find_one({"_id": {"$in": _get_id_variants(candidate_id)}})
        if not cand:
            raise HTTPException(status_code=404, detail="Candidate not found")
        
        db.candidates.update_one(
            {"_id": cand["_id"]},
            {"$set": {"is_deleted": True, "deleted_at": datetime.now(timezone.utc).isoformat()}}
        )
        return {"success": True, "message": "Candidate moved to trash"}
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/candidates/{candidate_id}/restore")
def restore_candidate(candidate_id: str, db=Depends(get_sync_db), admin=Depends(require_admin_auth)):
    try:
        cand = db.candidates.find_one({"_id": {"$in": _get_id_variants(candidate_id)}})
        if not cand:
            raise HTTPException(status_code=404, detail="Candidate not found")
        
        db.candidates.update_one(
            {"_id": cand["_id"]},
            {"$set": {"is_deleted": False}, "$unset": {"deleted_at": ""}}
        )
        return {"success": True, "message": "Candidate restored successfully"}
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/candidates/{candidate_id}/mark-selected")
def mark_candidate_selected(candidate_id: str, db=Depends(get_sync_db), admin=Depends(require_admin_auth)):
    try:
        cand = db.candidates.find_one({"_id": {"$in": _get_id_variants(candidate_id)}})
        if not cand:
            raise HTTPException(status_code=404, detail="Candidate not found")
        
        current_status = cand.get("is_selected", False)
        new_status = not current_status
        
        db.candidates.update_one(
            {"_id": cand["_id"]},
            {"$set": {"is_selected": new_status}}
        )
        return {"success": True, "message": "Candidate selected status updated", "is_selected": new_status}
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/candidates/{candidate_id}/mark-not-joined")
def mark_candidate_not_joined(candidate_id: str, db=Depends(get_sync_db), admin=Depends(require_admin_auth)):
    try:
        cand = db.candidates.find_one({"_id": {"$in": _get_id_variants(candidate_id)}})
        if not cand:
            raise HTTPException(status_code=404, detail="Candidate not found")
        
        current_status = cand.get("is_not_joined", False)
        new_status = not current_status
        
        db.candidates.update_one(
            {"_id": cand["_id"]},
            {"$set": {"is_not_joined": new_status}}
        )
        return {"success": True, "message": "Candidate not joined status updated", "is_not_joined": new_status}
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/stats/kpi-details")
    kpi: str = Query(...),
    state: str = Query(None),
    district: str = Query(None),
    role: str = Query(None),
    start_date: str = Query(None),
    end_date: str = Query(None),
    db=Depends(get_sync_db),
    admin=Depends(require_admin_auth),
):
    if kpi in FUNNEL_KPIS:
        return {"candidates": _funnel_kpi_candidates(db, kpi, state, district, role, start_date, end_date)}

    cand_query = {"is_deleted": {"$ne": True}}
    if state and state != "All": cand_query["state"] = state
    if district and district != "All": cand_query["district"] = district

    sessions = []
    if kpi == "totalCandidates":
        pass # cand_query is already correct
    elif kpi == "totalSelected":
        cand_query["is_selected"] = True
    elif kpi in ["activeInterviews", "totalCompleted", "totalPass", "totalFail"]:
        # We need to find candidate IDs from interview_sessions
        sess_query = {}
        if kpi == "activeInterviews":
            sess_query["status"] = {"$in": ["active", "interviewing", "paused"]}
        elif kpi == "totalCompleted":
            sess_query["status"] = "completed"
            sess_query["result"] = {"$in": ["PASS", "FAIL"]}
        elif kpi == "totalPass":
            sess_query["status"] = "completed"
            sess_query["result"] = "PASS"
        elif kpi == "totalFail":
            sess_query["status"] = "completed"
            sess_query["result"] = "FAIL"
            
        sessions = list(db.interview_sessions.find(sess_query, {"candidate_id": 1, "started_at": 1, "result": 1, "score": 1, "overall_score": 1}))

        cand_ids = []
        for s in sessions:
            if s.get("candidate_id"):
                cand_ids.extend(_get_id_variants(s["candidate_id"]))
                
        if cand_query:
            cand_query["_id"] = {"$in": cand_ids}
        else:
            cand_query = {"_id": {"$in": cand_ids}, "is_deleted": {"$ne": True}}
    else:
        raise HTTPException(400, "Unknown KPI")

    candidates = list(db.candidates.find(cand_query).sort("created_at", -1))
    
    user_ids = [c["user_id"] for c in candidates if c.get("user_id")]
    user_map = {str(u["_id"]): u.get("email") for u in db.users.find({"_id": {"$in": user_ids}})}
    
    sessions_by_cand = {}

    # Only fetch all sessions if we are on a KPI that requires them
    if kpi in ["activeInterviews", "totalCompleted", "totalPass", "totalFail"]:
        c_vars = []
        for c in candidates:
            c_vars.extend(_get_id_variants(c["_id"]))
        all_sess = list(db.interview_sessions.find({"candidate_id": {"$in": c_vars}}))
        for sess in all_sess:
            cid = str(sess["candidate_id"])
            if cid not in sessions_by_cand:
                sessions_by_cand[cid] = []
            sessions_by_cand[cid].append(sess)

    results = []
    for c in candidates:
        cid = str(c["_id"])
        user_email = user_map.get(str(c.get("user_id")))
        
        c_variants = {str(v) for v in _get_id_variants(c["_id"])}  # set: ObjectId and str forms stringify to the same key
        cand_sessions = []
        for cv in c_variants:
            cand_sessions.extend(sessions_by_cand.get(cv, []))
            
        cand_sessions.sort(key=lambda x: x.get("started_at") or "")
        
        attempt_details = []
        for sess in cand_sessions:
            attempt_details.append({
                "date": sess.get("started_at"),
                "result": sess.get("result", "PENDING"),
                "score": sess.get("score") or sess.get("overall_score") or 0
            })

        results.append({
            "id": cid,
            "fullName": c.get("full_name") or c.get("name") or user_email or "",
            "email": c.get("email") or user_email or "",
            "phone": c.get("phone") or "",
            "state": c.get("state") or "",
            "district": c.get("district") or "",
            "current_phase": c.get("current_phase") or "onboarding",
            "is_selected": c.get("is_selected", False),
            "created_at": c.get("created_at"),
            "documents_submitted_at": c.get("consent_timestamp") or c.get("updated_at"),
            "attempts": attempt_details,
            "total_attempts": len(cand_sessions)
        })
        
    return {"candidates": results}

@router.get("/stats/report")
def get_candidate_report(
    start_date: str = Query(None),
    end_date: str = Query(None),
    status_filter: str = Query(None),
    db=Depends(get_sync_db),
    admin=Depends(require_admin_auth)
):
    query = {"is_deleted": {"$ne": True}}
    
    date_query = _created_at_range(start_date, end_date)
    if date_query is not None:
        query["created_at"] = date_query
        
    if status_filter == "onboarded":
        query["is_selected"] = True
    elif status_filter == "interviewing" or status_filter == "attended_interview":
        pass # We will filter this based on actual sessions later
    elif status_filter == "docs_not_selected":
        query["documents_submitted"] = True
        query["is_selected"] = {"$ne": True}
        
    candidates = list(db.candidates.find(query).sort("created_at", -1))
    
    # Pre-fetch user emails if needed
    user_ids = [c["user_id"] for c in candidates if c.get("user_id")]
    user_map = {str(u["_id"]): u.get("email") for u in db.users.find({"_id": {"$in": user_ids}})}
    
    # Pre-fetch all sessions for these candidates to build attempt details

    cand_id_variants = []
    for c in candidates:
        cand_id_variants.extend(_get_id_variants(c["_id"]))
        
    sessions = list(db.interview_sessions.find({"candidate_id": {"$in": cand_id_variants}}).sort("started_at", 1))
    sessions_by_cand = {}
    for sess in sessions:
        cid = str(sess["candidate_id"])
        if cid not in sessions_by_cand:
            sessions_by_cand[cid] = []
        sessions_by_cand[cid].append(sess)
        
    results = []
    for c in candidates:
        cid = str(c["_id"])
        c_variants = {str(v) for v in _get_id_variants(c["_id"])}  # set: ObjectId and str forms stringify to the same key
        
        cand_sessions = []
        for cv in c_variants:
            cand_sessions.extend(sessions_by_cand.get(cv, []))
            
        cand_sessions.sort(key=lambda x: x.get("started_at") or "")
        
        # If filtering by attended_interview, skip candidates with no sessions
        if status_filter in ["interviewing", "attended_interview"] and not cand_sessions:
            continue
            
        attempt_details = []
        for sess in cand_sessions:
            attempt_details.append({
                "date": sess.get("started_at"),
                "result": sess.get("result", "PENDING"),
                "score": sess.get("score") or sess.get("overall_score") or 0
            })
            
        user_email = user_map.get(str(c.get("user_id")))
        results.append({
            "id": cid,
            "fullName": c.get("full_name") or c.get("name") or user_email or "",
            "email": c.get("email") or user_email or "",
            "phone": c.get("phone") or "",
            "current_phase": c.get("current_phase") or "onboarding",
            "is_selected": c.get("is_selected", False),
            "created_at": c.get("created_at"),
            "documents_submitted_at": c.get("consent_timestamp") or c.get("updated_at"), # best approximation
            "attempts": attempt_details,
            "total_attempts": len(cand_sessions)
        })
        
    return {"report": results}
