"""
Admin Candidates & Interviews API Endpoints.

Queries PostgreSQL via SQLAlchemy (the same database the backend already uses
for all other operations). No SQLite dependency.
"""
from fastapi import APIRouter, HTTPException, Query, Depends
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from datetime import datetime
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func

from app.db.database import get_db
from app.db.models.candidate import Candidate, User, InterviewSession, AntiCheatEvent
from app.api.admin.middleware import require_admin_auth

router = APIRouter(prefix="/api/admin", tags=["admin-candidates"])

# Phase definitions in order
PHASES = ["onboarding", "interview", "summary", "documents"]
PHASE_ORDER = {p: i for i, p in enumerate(PHASES)}  # {"onboarding": 0, "interview": 1, ...}


class PhaseStatus(BaseModel):
    phase: str
    status: str  # pending, in_progress, completed
    timestamp: Optional[str] = None
    completedAt: Optional[str] = None


class CandidateResponse(BaseModel):
    id: str
    fullName: Optional[str] = None   # may be null before onboarding is completed
    email: Optional[str] = None      # from User table
    phone: Optional[str] = None
    # Geographic location
    state: Optional[str] = None
    district: Optional[str] = None
    # Professional / ag background
    currentRole: Optional[str] = None
    yearsOfExperience: Optional[int] = None
    farmingBackground: Optional[str] = None
    primaryExpertise: Optional[str] = None
    # Status and phase
    currentPhase: str
    status: str
    phases: List[PhaseStatus]
    createdAt: Optional[str] = None
    documentsSubmitted: bool = False
    attemptsDone: int = 0
    maxAttempts: int = 3


def _build_phases(current_phase: str) -> List[PhaseStatus]:
    """Derive phase statuses from currentPhase."""
    current_idx = PHASE_ORDER.get(current_phase, 0)
    phases = []
    for i, p in enumerate(PHASES):
        if i < current_idx:
            status = "completed"
        elif i == current_idx:
            status = "in_progress"
        else:
            status = "pending"
        phases.append(PhaseStatus(
            phase=p,
            status=status,
            timestamp=None,
            completedAt=None,
        ))
    return phases


def _candidate_to_response(cand: Candidate, user_email: Optional[str], db: Session) -> CandidateResponse:
    """
    Convert a SQLAlchemy Candidate model (optionally joined with User)
    to a CandidateResponse.
    """
    # fullName may be null (pre-onboarding) — fall back to user email
    raw_full_name = cand.fullName or user_email or "Unknown"
    current_phase = cand.currentPhase or "onboarding"

    # Count completed interview attempts (same logic as queue_manager.py)
    attempts_done = (
        db.query(InterviewSession)
        .filter(
            InterviewSession.candidateId == cand.id,
            InterviewSession.status == "completed",
            InterviewSession.result.in_(["PASS", "FAIL", "WITHDRAWN"]),
        )
        .count()
    )

    return CandidateResponse(
        id=cand.id,
        fullName=raw_full_name,
        email=user_email,
        phone=cand.phone,
        state=cand.state,
        district=cand.district,
        currentRole=cand.currentRole,
        yearsOfExperience=cand.yearsOfExperience,
        farmingBackground=cand.farmingBackground,
        primaryExpertise=cand.primaryExpertise,
        currentPhase=current_phase,
        status="active",
        phases=_build_phases(current_phase),
        createdAt=cand.createdAt.isoformat() if cand.createdAt else datetime.now().isoformat(),
        documentsSubmitted=cand.documentsSubmitted,
        attemptsDone=attempts_done,
        maxAttempts=3,
    )


# ============ Candidate Management ============

@router.get("/candidates")
async def get_candidates(
    phase: Optional[str] = Query(None, description="Filter by current phase"),
    status: Optional[str] = Query(None, description="Filter by status (active/completed)"),
    search: Optional[str] = Query(None, description="Search by name or email"),
    state: Optional[str] = Query(None, description="Filter by state"),
    district: Optional[str] = Query(None, description="Filter by district"),
    db: Session = Depends(get_db),
    _admin=Depends(require_admin_auth),
):
    """
    Get all candidates from PostgreSQL via SQLAlchemy.
    LEFT JOINs with User to surface email even before onboarding is filled.
    """
    # Query with join to User table to get email
    query = (
        db.query(Candidate, User.email.label("user_email"))
        .outerjoin(User, Candidate.userId == User.id)
        .order_by(Candidate.createdAt.desc())
    )

    rows = query.all()

    candidates = []
    for cand, user_email in rows:
        response = _candidate_to_response(cand, user_email, db)

        # Apply filters
        if phase and response.currentPhase != phase:
            continue
        search_lower = search.lower() if search else None
        if search_lower and (
            search_lower not in (response.fullName or "").lower()
            and search_lower not in (response.email or "").lower()
        ):
            continue
        if state:
            if not response.state or state.lower() not in response.state.lower():
                continue
        if district:
            if not response.district or district.lower() not in response.district.lower():
                continue

        candidates.append(response)

    return {"candidates": candidates, "total": len(candidates)}


@router.get("/candidates/{candidate_id}")
async def get_candidate(candidate_id: str, db: Session = Depends(get_db), _admin=Depends(require_admin_auth)):
    """
    Get a specific candidate by ID.
    """
    row = (
        db.query(Candidate, User.email.label("user_email"))
        .outerjoin(User, Candidate.userId == User.id)
        .filter(Candidate.id == candidate_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Candidate not found")
    cand, user_email = row
    return _candidate_to_response(cand, user_email, db)


@router.put("/candidates/{candidate_id}/phase/{phase}")
async def update_candidate_phase(
    candidate_id: str,
    phase: str,
    db: Session = Depends(get_db),
    _admin=Depends(require_admin_auth),
):
    """
    Update a candidate's phase status (admin override).
    """
    if phase not in PHASES:
        raise HTTPException(status_code=400, detail=f"Invalid phase. Must be one of: {PHASES}")

    cand = db.query(Candidate).filter(Candidate.id == candidate_id).first()
    if not cand:
        raise HTTPException(status_code=404, detail="Candidate not found")

    cand.currentPhase = phase
    cand.updatedAt = datetime.utcnow()
    db.commit()

    return {"success": True, "message": f"Phase updated to {phase}"}


@router.post("/candidates")
async def create_candidate(
    name: str,
    email: str,
    phone: Optional[str] = None,
    position: Optional[str] = None,
    db: Session = Depends(get_db),
    _admin=Depends(require_admin_auth),
):
    """
    Create a new candidate.
    """
    # Check if email already exists via User
    existing_user = db.query(User).filter(User.email == email).first()
    if existing_user:
        existing_cand = db.query(Candidate).filter(Candidate.userId == existing_user.id).first()
        if existing_cand:
            raise HTTPException(status_code=400, detail="Candidate with this email already exists")

    # Create user
    user = User(name=name, email=email)
    db.add(user)
    db.flush()

    # Create candidate
    cand = Candidate(
        userId=user.id,
        fullName=name,
        phone=phone,
        currentPhase="onboarding",
    )
    db.add(cand)
    db.commit()
    db.refresh(cand)

    return {"id": cand.id, "name": cand.fullName, "email": email}


# ============ Active Interviews (in-memory for real-time monitoring) ============


def _build_active_response(interview_id: str, state) -> Dict[str, Any]:
    """Build a dict from an InterviewState for the active interviews endpoint."""
    msgs = state.messages[-20:]
    candidate_name = (
        state.candidate_data.get("name") if state.candidate_data else "Unknown"
    )
    started_at = state.created_at.isoformat() if hasattr(state, "created_at") else datetime.now().isoformat()
    current_phase = getattr(state, "current_phase", "interview")
    return {
        "id": interview_id,
        "candidateId": state.candidate_data.get("candidate_id", "") if state.candidate_data else "",
        "candidateName": candidate_name,
        "startedAt": started_at,
        "messagesCount": len(msgs),
        "messages": msgs,
        "currentPhase": current_phase,
    }


@router.get("/interviews/active")
async def get_active_interviews(db: Session = Depends(get_db), _admin=Depends(require_admin_auth)):
    """
    Get all currently active interview sessions.

    Always checks the DB to avoid stale in-memory entries.
    An interview is truly live only if:
      1. It exists in the workflow's _interviews dict with status='active', AND
      2. It has a matching InterviewSession row in the DB with status='active'
    """
    from app.workflows.interview_workflow import _interviews

    # Get all interview_ids that have an active DB record
    active_db_ids = {
        row.id
        for row in db.query(InterviewSession.id).filter(InterviewSession.status == "active").all()
    }

    active = [
        _build_active_response(interview_id, state)
        for interview_id, state in _interviews.items()
        if state.status == "active" and interview_id in active_db_ids
    ]
    return {"interviews": active, "total": len(active)}


# ============ Interview Evaluations ============


class EvaluationMetrics(BaseModel):
    score: int
    details: str


class InterviewEvaluationRow(BaseModel):
    id: str
    candidateId: str
    candidateName: str
    email: Optional[str]
    result: Optional[str]
    endReason: Optional[str]
    score: Optional[float]
    startedAt: Optional[str]
    completedAt: Optional[str]
    messages: List[Dict[str, str]]
    evaluation: Optional[Dict[str, Any]]
    attempt: int


@router.get("/interviews/evaluations")
async def get_interview_evaluations(
    candidateId: Optional[str] = Query(None),
    result: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    _admin=Depends(require_admin_auth),
):
    import json

    query = (
        db.query(InterviewSession)
        .filter(InterviewSession.status == "completed")
        .order_by(InterviewSession.completedAt.desc())
    )
    if candidateId:
        query = query.filter(InterviewSession.candidateId == candidateId)
    if result:
        query = query.filter(InterviewSession.result == result)

    total = query.count()
    rows = query.offset(offset).limit(limit).all()

    if not rows:
        return {"evaluations": [], "total": 0, "limit": limit, "offset": offset}

    cand_ids = list({r.candidateId for r in rows if r.candidateId})

    cand_map: Dict[str, Dict[str, Any]] = {}
    if cand_ids:
        rows2 = (
            db.query(Candidate, User)
            .outerjoin(User, Candidate.userId == User.id)
            .filter(Candidate.id.in_(cand_ids))
            .all()
        )
        for cand, user in rows2:
            cand_map[cand.id] = {
                "candidateName": cand.fullName or (user.name if user else None) or "Unknown",
                "email": user.email if user else None,
            }

    attempt_counts: Dict[str, int] = {}
    for r in rows:
        if r.candidateId:
            attempt_counts[r.candidateId] = attempt_counts.get(r.candidateId, 0) + 1

    evaluations: List[Dict[str, Any]] = []
    for row in rows:
        messages: List[Dict[str, str]] = []
        evaluation_data: Optional[Dict[str, Any]] = None
        if row.interviewData:
            try:
                data = json.loads(row.interviewData)
                messages = data.get("messages", [])
                evaluation_data = data.get("evaluation") or data.get("llm_evaluation")
            except Exception:
                pass

        cand_total = attempt_counts.get(row.candidateId, 1)
        evaluations.append(
            InterviewEvaluationRow(
                id=row.id,
                candidateId=row.candidateId or "",
                candidateName=cand_map.get(row.candidateId, {}).get("candidateName", "Unknown"),
                email=cand_map.get(row.candidateId, {}).get("email"),
                result=row.result,
                endReason=row.endReason,
                score=row.score,
                startedAt=row.startedAt.isoformat() if row.startedAt else None,
                completedAt=row.completedAt.isoformat() if row.completedAt else None,
                messages=messages,
                evaluation=evaluation_data,
                attempt=cand_total,
            ).model_dump()
        )
        if row.candidateId:
            attempt_counts[row.candidateId] -= 1

    return {"evaluations": evaluations, "total": total, "limit": limit, "offset": offset}


@router.get("/interviews/evaluations/{interview_id}")
async def get_interview_evaluation(
    interview_id: str,
    db: Session = Depends(get_db),
    _admin=Depends(require_admin_auth),
):
    import json

    row = db.query(InterviewSession).filter(InterviewSession.id == interview_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Interview session not found")

    cand_name = "Unknown"
    email: Optional[str] = None
    if row.candidateId:
        res = (
            db.query(Candidate, User)
            .outerjoin(User, Candidate.userId == User.id)
            .filter(Candidate.id == row.candidateId)
            .first()
        )
        if res:
            cand, user = res
            cand_name = cand.fullName or (user.name if user else None) or "Unknown"
            email = user.email if user else None

    messages: List[Dict[str, str]] = []
    evaluation_data: Optional[Dict[str, Any]] = None
    if row.interviewData:
        try:
            data = json.loads(row.interviewData)
            messages = data.get("messages", [])
            evaluation_data = data.get("evaluation") or data.get("llm_evaluation")
        except Exception:
            pass

    return InterviewEvaluationRow(
        id=row.id,
        candidateId=row.candidateId or "",
        candidateName=cand_name,
        email=email,
        result=row.result,
        endReason=row.endReason,
        score=row.score,
        startedAt=row.startedAt.isoformat() if row.startedAt else None,
        completedAt=row.completedAt.isoformat() if row.completedAt else None,
        messages=messages,
        evaluation=evaluation_data,
        attempt=1,
    ).model_dump()


@router.get("/interviews/{interview_id}")
async def get_interview(interview_id: str, db: Session = Depends(get_db), _admin=Depends(require_admin_auth)):
    """
    Get a specific interview session with full chat history.
    Validates the session exists in DB with an active status before returning.
    """
    from app.workflows.interview_workflow import _interviews

    session = db.query(InterviewSession).filter(
        InterviewSession.id == interview_id,
        InterviewSession.status == "active"
    ).first()

    if not session:
        raise HTTPException(status_code=404, detail="Interview not found or not active")

    # Fetch live state from in-memory dict if available
    if interview_id in _interviews:
        state = _interviews[interview_id]
        return _build_active_response(interview_id, state)

    # Fall back to DB record
    return {
        "id": session.id,
        "candidateId": session.candidateId or "",
        "candidateName": "Unknown",
        "startedAt": session.startedAt.isoformat() if session.startedAt else "",
        "messagesCount": 0,
        "messages": [],
        "currentPhase": session.currentPhase,
    }


# ============ Stats ============

@router.get("/stats")
async def get_stats(db: Session = Depends(get_db), _admin=Depends(require_admin_auth)):
    """
    Return aggregate stats about candidates and interview activity.
    """
    total = db.query(func.count(Candidate.id)).scalar() or 0

    # Phase distribution
    phase_counts = (
        db.query(Candidate.currentPhase, func.count(Candidate.id))
        .group_by(Candidate.currentPhase)
        .all()
    )
    phase_distribution = {phase: count for phase, count in phase_counts}

    # Status distribution (active = not completed)
    active_count = db.query(func.count(Candidate.id)).filter(
        Candidate.currentPhase.notin_(["documents", "completed"])
    ).scalar() or 0
    completed_count = total - active_count

    # Interview stats
    active_interviews = db.query(func.count(InterviewSession.id)).filter(
        InterviewSession.status == "active"
    ).scalar() or 0

    return {
        "totalCandidates": total,
        "activeInterviews": active_interviews,
        "completedInterviews": completed_count,
        "phaseDistribution": phase_distribution,
        "statusDistribution": {
            "active": active_count,
            "completed": completed_count,
        },
    }


# ============ Geo Stats ============

@router.get("/geo/stats")
async def get_geo_stats(db: Session = Depends(get_db), _admin=Depends(require_admin_auth)):
    """
    Return geographic distribution of candidates: states, districts, top states, top districts.
    """
    # State-level aggregation
    state_rows = (
        db.query(
            Candidate.state,
            func.count(Candidate.id).label("total"),
        )
        .filter(Candidate.state.isnot(None))
        .group_by(Candidate.state)
        .all()
    )

    states = [
        {"state": row.state, "total": row.total}
        for row in state_rows
    ]

    # District-level aggregation
    district_rows = (
        db.query(
            Candidate.state,
            Candidate.district,
            func.count(Candidate.id).label("total"),
        )
        .filter(Candidate.district.isnot(None))
        .group_by(Candidate.state, Candidate.district)
        .all()
    )

    districts = [
        {
            "state": row.state,
            "district": row.district,
            "total": row.total,
            "pending": 0,      # TODO: wire up if needed
            "selected": 0,
            "rejected": 0,
            "passRate": 0,
        }
        for row in district_rows
    ]

    # Sort states by total descending
    states.sort(key=lambda x: x["total"], reverse=True)

    return {
        "states": states,
        "districts": districts,
        "topStates": states[:10],
        "topDistricts": districts[:10],
    }


@router.get("/geo/funnel")
async def get_state_funnel(
    state: Optional[str] = Query(None, description="Filter by state name"),
    db: Session = Depends(get_db),
    _admin=Depends(require_admin_auth),
):
    """
    Phase funnel broken down by state (or all states if no filter).
    Returns candidates per phase for the given state(s).
    """
    query = db.query(
        Candidate.state,
        Candidate.currentPhase,
        func.count(Candidate.id).label("count"),
    ).filter(Candidate.state.isnot(None))

    if state:
        query = query.filter(Candidate.state.ilike(f"%{state}%"))

    rows = query.group_by(Candidate.state, Candidate.currentPhase).all()

    # Build funnel data
    state_data: Dict[str, Dict[str, int]] = {}
    total_states = set()

    for row in rows:
        s = row.state
        phase = row.currentPhase or "onboarding"
        total_states.add(s)
        if s not in state_data:
            state_data[s] = {p: 0 for p in PHASES}
        state_data[s][phase] = row.count

    # Flatten for response
    result = []
    for s, phases in state_data.items():
        row_data = {"state": s}
        row_data.update(phases)
        result.append(row_data)

    result.sort(key=lambda x: sum(PHASE_ORDER.get(p, 0) * x.get(p, 0) for p in PHASES), reverse=True)

    return {"states": result, "totalStates": len(total_states)}


# ============ Stats By State ============

@router.get("/stats/by-state")
async def get_stats_by_state(
    state: Optional[str] = Query(None, description="Filter to a specific state"),
    db: Session = Depends(get_db),
    _admin=Depends(require_admin_auth),
):
    """
    Per-state candidate counts broken down by phase.
    Used by the admin analytics tab funnel chart.
    """
    query = db.query(
        Candidate.state,
        Candidate.currentPhase,
        func.count(Candidate.id).label("count"),
    ).filter(Candidate.state.isnot(None))

    if state:
        query = query.filter(Candidate.state.ilike(f"%{state}%"))

    rows = query.group_by(Candidate.state, Candidate.currentPhase).all()

    # Aggregate into state buckets
    state_data: Dict[str, Dict[str, int]] = {}
    for row in rows:
        s = row.state
        phase = row.currentPhase or "onboarding"
        if s not in state_data:
            state_data[s] = {"state": s, **{p: 0 for p in PHASES}}
        if phase in state_data[s]:
            state_data[s][phase] += row.count

    result = list(state_data.values())
    result.sort(key=lambda x: sum(x[p] for p in PHASES), reverse=True)
    return {"states": result, "totalStates": len(result)}


# ============ Anti-Cheat Settings ============

from app.db.models.settings import Settings as DbSettings
from app.services.settings_service import get_anti_cheat_settings


class AntiCheatSettingsResponse(BaseModel):
    idle_threshold_ms: int
    platform_idle_ms: int


@router.get("/anti-cheat", response_model=AntiCheatSettingsResponse)
async def get_anti_cheat_settings_endpoint(_admin=Depends(require_admin_auth)):
    """
    Get current anti-cheat thresholds.
    """
    config = get_anti_cheat_settings()
    return AntiCheatSettingsResponse(
        idle_threshold_ms=config["idle_threshold_ms"],
        platform_idle_ms=config["platform_idle_ms"],
    )


class UpdateAntiCheatSettingsRequest(BaseModel):
    idle_threshold_ms: Optional[int] = None
    platform_idle_ms: Optional[int] = None


@router.put("/anti-cheat")
async def update_anti_cheat_settings(
    request: UpdateAntiCheatSettingsRequest,
    db: Session = Depends(get_db),
    _admin=Depends(require_admin_auth),
):
    """
    Update anti-cheat thresholds (idle timeout and platform inactivity timeout).
    """
    if request.idle_threshold_ms is not None:
        if request.idle_threshold_ms < 5000:
            raise HTTPException(status_code=400, detail="idle_threshold_ms must be at least 5000")
        _upsert_setting(db, "anti_cheat_idle_threshold_ms", str(request.idle_threshold_ms), "anti-cheat")

    if request.platform_idle_ms is not None:
        if request.platform_idle_ms < 60000:
            raise HTTPException(status_code=400, detail="platform_idle_ms must be at least 60000")
        _upsert_setting(db, "anti_cheat_platform_idle_ms", str(request.platform_idle_ms), "anti-cheat")

    return {"success": True, "message": "Anti-cheat settings updated"}


def _upsert_setting(db: Session, key: str, value: str, category: str) -> None:
    """Insert or update a Settings row."""
    now = datetime.utcnow()
    row = db.query(DbSettings).filter(DbSettings.key == key).first()
    if row:
        row.value = value
        row.updated_at = now
    else:
        row = DbSettings(key=key, value=value, category=category, description=key)
        db.add(row)
    db.commit()


# ============ Anti-Cheat Violations ============

@router.get("/anti-cheat/violations")
async def get_anti_cheat_violations(
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
    _admin=Depends(require_admin_auth),
):
    """
    Return all anti-cheat violations, enriched with candidate name and email.
    """
    rows = (
        db.query(AntiCheatEvent, Candidate, User)
        .outerjoin(Candidate, AntiCheatEvent.candidateId == Candidate.id)
        .outerjoin(User, Candidate.userId == User.id)
        .order_by(AntiCheatEvent.createdAt.desc())
        .limit(limit)
        .all()
    )

    violations = []
    for event, cand, user in rows:
        name = (cand.fullName if cand else None) or (user.name if user else None) or "Unknown"
        email = (user.email if user else None) or "—"
        violations.append({
            "id": event.id,
            "candidateId": event.candidateId,
            "candidateName": name,
            "email": email,
            "eventType": event.eventType,
            "severity": event.severity,
            "message": event.message,
            "createdAt": event.createdAt.isoformat() if event.createdAt else datetime.utcnow().isoformat(),
            "autoClosed": event.severity == "critical",
        })

    return {"violations": violations, "total": len(violations)}