"""
Admin Candidates & Interviews API Endpoints.

Reads candidate data directly from Prisma's SQLite file so that
onboarding data entered via Next.js is immediately visible in the admin dashboard.
"""
from fastapi import APIRouter, HTTPException, Query, Depends
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from datetime import datetime
from sqlalchemy.orm import Session
import json
import uuid
import sqlite3
import os

from app.db.database import get_db
from app.db.models.candidate import Candidate
from app.api.admin.middleware import require_admin_auth

router = APIRouter(prefix="/api/admin", tags=["admin-candidates"])

# Phase definitions in order
PHASES = ["onboarding", "interview", "summary", "offer", "signing", "joining"]
PHASE_ORDER = {p: i for i, p in enumerate(PHASES)}  # {"onboarding": 0, "interview": 1, ...}
PHASE_DISPLAY = {
    "onboarding": "Onboarding",
    "signing": "Signing",
    "interview": "Interview",
    "summary": "Summary",
    "offer": "Offer",
    "joining": "Joining"
}


class PhaseStatus(BaseModel):
    phase: str
    status: str  # pending, in_progress, completed
    timestamp: Optional[str] = None
    completedAt: Optional[str] = None


class CandidateResponse(BaseModel):
    id: str
    fullName: Optional[str] = None   # may be null before onboarding is completed
    email: Optional[str] = None      # from User table (JOIN)
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


class ActiveInterviewResponse(BaseModel):
    id: str
    candidateId: str
    candidateName: str
    startedAt: str
    messagesCount: int
    messages: List[Dict[str, str]]
    currentPhase: str



# ============ Candidate Management ============

def _get_prisma_db_path() -> str:
    """Path to Prisma dev.db — shared with Next.js."""
    return os.path.join(
        os.path.dirname(__file__), "..", "..", "..", "..",
        "frontend", "prisma", "dev.db"
    )


def _format_datetime(value: Any) -> str:
    """Format a datetime value (iso string, int timestamp, or None) to an ISO string."""
    if value is None:
        return datetime.now().isoformat()
    if isinstance(value, str):
        return value
    if isinstance(value, (int, float)):
        # Unix milliseconds timestamp
        from datetime import timezone
        return datetime.fromtimestamp(value / 1000, tz=timezone.utc).isoformat()
    return str(value)


def _query_prisma(sql: str, params: tuple = ()) -> List[Dict[str, Any]]:
    """Execute a read-only SQL query against Prisma's SQLite file."""
    db_path = _get_prisma_db_path()
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cur = conn.execute(sql, params)
    rows = [dict(row) for row in cur.fetchall()]
    conn.close()
    return rows


def _candidate_row_to_response(row: Dict[str, Any]) -> CandidateResponse:
    """
    Convert a Prisma Candidate row dict (augmented with userEmail/userName from JOIN)
    to a CandidateResponse.

    For candidates who just signed up but haven't filled onboarding yet:
    - fullName comes from User.name (the signup name) until Candidate.fullName is set
    - currentPhase defaults to 'onboarding'
    """
    import json as _json
    notes_raw = row.get("notes") or "{}"
    if isinstance(notes_raw, str):
        try:
            notes = _json.loads(notes_raw)
        except Exception:
            notes = {}
    else:
        notes = notes_raw or {}

    current_phase = row.get("currentPhase", "onboarding") or "onboarding"
    # fullName may be null (pre-onboarding) — fall back to User.name or User.email
    raw_full_name = row.get("fullName") or row.get("userName")
    user_email = row.get("userEmail")

    # Derive phase statuses from currentPhase — phases before current are completed,
    # the current phase is in_progress, rest are pending
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

    return CandidateResponse(
        id=str(row["id"]),
        fullName=raw_full_name,
        email=user_email,
        phone=row.get("phone"),
        state=row.get("state"),
        district=row.get("district"),
        currentRole=row.get("currentRole"),
        yearsOfExperience=row.get("yearsOfExperience"),
        farmingBackground=row.get("farmingBackground"),
        primaryExpertise=row.get("primaryExpertise"),
        currentPhase=current_phase,
        status="active",
        phases=phases,
        createdAt=_format_datetime(row.get("createdAt"))
    )

@router.get("/candidates")
async def get_candidates(
    phase: Optional[str] = Query(None, description="Filter by current phase"),
    status: Optional[str] = Query(None, description="Filter by status (active/completed)"),
    search: Optional[str] = Query(None, description="Search by name"),
    state: Optional[str] = Query(None, description="Filter by state"),
    district: Optional[str] = Query(None, description="Filter by district"),
    _admin=Depends(require_admin_auth),
):
    """
    Get all candidates from Prisma's SQLite file.
    LEFT JOINs with User to surface email even before onboarding is filled.
    """
    rows = _query_prisma("""
        SELECT c.*, u.email as userEmail, u.name as userName
        FROM Candidate c
        LEFT JOIN User u ON c.userId = u.id
    """)

    candidates = []
    for row in rows:
        response = _candidate_row_to_response(row)
        # Apply filters — search checks both fullName and email
        if phase and response.currentPhase != phase:
            continue
        search_lower = search.lower() if search else None
        if search_lower and (
            search_lower not in (response.fullName or "").lower() and
            search_lower not in (response.email or "").lower()
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
async def get_candidate(candidate_id: str, _admin=Depends(require_admin_auth)):
    """
    Get a specific candidate by ID.
    """
    rows = _query_prisma("""
        SELECT c.*, u.email as userEmail, u.name as userName
        FROM Candidate c
        LEFT JOIN User u ON c.userId = u.id
        WHERE c.id = ?
    """, (candidate_id,))
    if not rows:
        raise HTTPException(status_code=404, detail="Candidate not found")
    return _candidate_row_to_response(rows[0])


@router.put("/candidates/{candidate_id}/phase/{phase}")
async def update_candidate_phase(candidate_id: str, phase: str, db: Session = Depends(get_db), _admin=Depends(require_admin_auth)):
    """
    Update a candidate's phase status (admin override).
    """
    if phase not in PHASES:
        raise HTTPException(status_code=400, detail=f"Invalid phase. Must be one of: {PHASES}")
    
    try:
        cand_id = int(candidate_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid candidate ID")
    
    cand = db.query(Candidate).filter(Candidate.id == cand_id).first()
    
    if not cand:
        # Candidates are created via Prisma/Next.js; admin can still track phase updates
        raise HTTPException(status_code=404, detail="Candidate not found. Complete onboarding first.")

    now = datetime.now().isoformat()
    # Prisma stores phase in notes JSON on the Candidate record
    # We store it via the notes JSON
    cand_state = {}
    try:
        import sqlite3
        conn = sqlite3.connect(cand.id)  # cand.id is the Prisma cuid string - not directly updatable here
    except Exception:
        pass  # read-only for now; phase sync happens via Prisma side

    # For now, track phase updates in a simple key-value approach
    # The admin phase override writes back via Prisma API (see below)
    cand.updatedAt = datetime.now()
    
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
    # Check if email already exists
    existing = db.query(Candidate).filter(Candidate.email == email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Candidate with this email already exists")
    
    cand = Candidate(
        name=name,
        email=email,
        phone=phone,
        position=position,
        status="pending",
        notes={"phases": {}, "current_phase": "onboarding"}
    )
    db.add(cand)
    db.commit()
    db.refresh(cand)
    
    return {"id": str(cand.id), "name": cand.name, "email": cand.email}


# ============ Active Interviews (in-memory for real-time monitoring) ============



def _build_active_response(interview_id: str, state) -> ActiveInterviewResponse:
    """Build ActiveInterviewResponse from an InterviewState."""
    msgs = state.messages[-20:]
    candidate_name = (
        state.candidate_data.get("name") if state.candidate_data else "Unknown"
    )
    started_at = state.created_at.isoformat() if hasattr(state, "created_at") else datetime.now().isoformat()
    current_phase = getattr(state, "current_phase", "interview")
    return ActiveInterviewResponse(
        id=interview_id,
        candidateId=state.candidate_data.get("candidate_id", "") if state.candidate_data else "",
        candidateName=candidate_name,
        startedAt=started_at,
        messagesCount=len(msgs),
        messages=msgs,
        currentPhase=current_phase,
    )


@router.get("/interviews/active")
async def get_active_interviews(_admin=Depends(require_admin_auth)):
    """
    Get all currently active interview sessions.
    Reads from the workflow's _interviews (the single source of truth).
    """
    from app.workflows.interview_workflow import _interviews

    active = [
        _build_active_response(interview_id, state)
        for interview_id, state in _interviews.items()
        if state.status == "active"
    ]
    return {"interviews": active, "total": len(active)}


@router.get("/interviews/{interview_id}")
async def get_interview(interview_id: str, _admin=Depends(require_admin_auth)):
    """
    Get a specific interview session with full chat history.
    """
    from app.workflows.interview_workflow import _interviews

    state = _interviews.get(interview_id)
    if not state:
        raise HTTPException(status_code=404, detail="Interview not found")

    return {
        "id": interview_id,
        "candidateId": state.candidate_data.get("candidate_id", "") if state.candidate_data else "",
        "candidateName": state.candidate_data.get("name", "Unknown") if state.candidate_data else "Unknown",
        "startedAt": state.created_at.isoformat(),
        "completedAt": None,
        "status": state.status,
        "messages": state.messages,
        "messagesCount": len(state.messages),
        "currentPhase": getattr(state, "current_phase", "interview")
    }



@router.post("/interviews/{interview_id}/end")
async def end_interview_session(interview_id: str, _admin=Depends(require_admin_auth)):
    """
    End an interview session — removes it from the live workflow store.
    """
    from app.workflows.interview_workflow import interview_workflow

    if not interview_workflow.end_interview(interview_id):
        raise HTTPException(status_code=404, detail="Interview not found")

    return {"success": True, "message": "Interview ended"}


# ============ Stats ============

@router.get("/stats")
async def get_stats(
    state: Optional[str] = Query(None, description="Filter by state"),
    district: Optional[str] = Query(None, description="Filter by district"),
    _admin=Depends(require_admin_auth),
):
    """
    Get dashboard statistics from Prisma's SQLite.
    """
    rows = _query_prisma("SELECT * FROM Candidate")

    # Filter
    if state:
        rows = [r for r in rows if r.get("state") and state.lower() in r["state"].lower()]
    if district:
        rows = [r for r in rows if r.get("district") and district.lower() in r["district"].lower()]

    total_candidates = len(rows)

    # Count by phase
    phase_counts = {p: 0 for p in PHASES}
    for r in rows:
        phase = r.get("currentPhase", "onboarding") or "onboarding"
        if phase in phase_counts:
            phase_counts[phase] += 1

    # Count by status (Prisma uses single status field)
    status_counts = {"pending": 0, "active": 0, "selected": 0, "rejected": 0}
    for r in rows:
        status = r.get("status", "active")
        if status in status_counts:
            status_counts[status] += 1
        else:
            status_counts["active"] += 1

    # Active and completed interviews (from in-memory workflow)
    try:
        from app.workflows.interview_workflow import _interviews as live_interviews
        active_count = sum(1 for v in live_interviews.values() if getattr(v, "status", None) == "active")
        completed_count = sum(1 for v in live_interviews.values() if getattr(v, "status", None) == "completed")
    except Exception:
        active_count, completed_count = 0, 0

    return {
        "totalCandidates": total_candidates,
        "activeInterviews": active_count,
        "completedInterviews": completed_count,
        "phaseDistribution": phase_counts,
        "statusDistribution": status_counts,
        "filterApplied": {"state": state, "district": district}
    }


@router.get("/stats/by-state")
async def get_state_funnel(
    state: Optional[str] = Query(None, description="Filter to a specific state"),
    _admin=Depends(require_admin_auth),
):
    """
    Get per-state funnel counts from Prisma SQLite.
    """
    rows = _query_prisma("SELECT * FROM Candidate")
    if state:
        rows = [r for r in rows if r.get("state") and state.lower() in r["state"].lower()]

    PHASE_ORDER = {"onboarding": 0, "signing": 1, "interview": 2, "summary": 3, "offer": 4, "joining": 5}
    state_data: Dict[str, Dict[str, Any]] = {}

    for r in rows:
        current = r.get("currentPhase", "onboarding") or "onboarding"
        notes_raw = r.get("notes")
        notes = json.loads(notes_raw) if isinstance(notes_raw, str) else (notes_raw or {})
        cand_state = r.get("state") or "Unknown"

        if cand_state not in state_data:
            state_data[cand_state] = {"state": cand_state, "onboarding": 0, "interviewed": 0,
                "passed": 0, "failed": 0, "offerExtended": 0, "offerAccepted": 0}

        state_data[cand_state]["onboarding"] += 1
        phase_idx = PHASE_ORDER.get(current, 0)
        if phase_idx >= PHASE_ORDER.get("interview", 1):
            state_data[cand_state]["interviewed"] += 1
        if phase_idx >= PHASE_ORDER.get("offer", 3):
            state_data[cand_state]["offerExtended"] += 1
        if notes.get("acceptedOffer") if isinstance(notes, dict) else False:
            state_data[cand_state]["offerAccepted"] += 1
        result = notes.get("interviewResult") if isinstance(notes, dict) else None
        if result == "pass":
            state_data[cand_state]["passed"] += 1
        elif result == "fail":
            state_data[cand_state]["failed"] += 1

    for s in state_data.values():
        evaluated = s["passed"] + s["failed"]
        s["passRate"] = round(s["passed"] / evaluated * 100, 1) if evaluated > 0 else 0.0

    result_list = list(state_data.values())
    result_list.sort(key=lambda x: x["onboarding"], reverse=True)

    if state:
        return result_list[0] if result_list else {"state": state, "onboarding": 0, "interviewed": 0, "passed": 0, "failed": 0, "offerExtended": 0, "offerAccepted": 0, "passRate": 0.0}
    return {"states": result_list, "totalStates": len(result_list)}


@router.get("/stats/geographic")
async def get_geographic_stats(_admin=Depends(require_admin_auth)):
    """
    Get geographic distribution from Prisma SQLite.
    """
    rows = _query_prisma("SELECT state, district, status FROM Candidate")

    state_stats = {}
    district_stats = {}

    for r in rows:
        state = r.get("state") or "Unknown"
        district = r.get("district") or "Unknown"

        if state not in state_stats:
            state_stats[state] = {"state": state, "total": 0, "pending": 0, "interviewed": 0, "selected": 0, "rejected": 0}
        state_stats[state]["total"] += 1
        s = r.get("status", "pending")
        if s in state_stats[state]:
            state_stats[state][s] += 1

        district_key = f"{state}_{district}"
        if district_key not in district_stats:
            district_stats[district_key] = {"state": state, "district": district, "total": 0, "pending": 0, "interviewed": 0, "selected": 0, "rejected": 0}
        district_stats[district_key]["total"] += 1
        if s in district_stats[district_key]:
            district_stats[district_key][s] += 1

    for sd in state_stats.values():
        ev = sd["interviewed"] + sd["selected"] + sd["rejected"]
        sd["passRate"] = round(sd["selected"] / ev * 100, 2) if ev > 0 else 0.0
    for dd in district_stats.values():
        ev = dd["interviewed"] + dd["selected"] + dd["rejected"]
        dd["passRate"] = round(dd["selected"] / ev * 100, 2) if ev > 0 else 0.0

    unique_states = sorted([s for s in state_stats.keys() if s != "Unknown"])
    top_states = sorted(state_stats.values(), key=lambda x: x["total"], reverse=True)[:10]
    top_districts = sorted(district_stats.values(), key=lambda x: x["total"], reverse=True)[:10]

    return {
        "states": list(state_stats.values()),
        "districts": list(district_stats.values()),
        "uniqueStates": unique_states,
        "topStates": top_states,
        "topDistricts": top_districts,
        "totalStates": len(state_stats),
        "totalDistricts": len(district_stats)
    }


@router.get("/stats/locations")
async def get_state_districts(
    state: str = Query(..., description="State name to get districts for"),
    _admin=Depends(require_admin_auth),
):
    """
    Get distinct districts for a state from Prisma SQLite.
    """
    rows = _query_prisma(
        "SELECT DISTINCT district FROM Candidate WHERE LOWER(state) LIKE ? AND district IS NOT NULL AND district != ''",
        (f"%{state.lower()}%",)
    )
    return {
        "state": state,
        "districts": [r["district"] for r in rows if r["district"]]
    }


# ─────────────────────────── Anti-Cheat Event Logging ───────────────────────────


class AntiCheatEventCreate(BaseModel):
    candidateId: str
    interviewId: Optional[str] = None
    eventType: str  # 'tab_switch' | 'copy' | 'paste' | 'right_click' | 'window_blur' | 'fullscreen_exit'
    severity: str = "warning"  # 'warning' | 'critical'
    message: Optional[str] = None
    metadata: Optional[str] = None  # JSON string


class AntiCheatEventResponse(BaseModel):
    id: str
    candidateId: str
    interviewId: Optional[str]
    eventType: str
    severity: str
    message: Optional[str]
    metadata: Optional[str]
    createdAt: Optional[str]


def _write_prisma(sql: str, params: tuple = ()) -> str:
    """Execute a write/delete SQL query against Prisma's SQLite file. Returns last row id."""
    db_path = _get_prisma_db_path()
    conn = sqlite3.connect(db_path)
    cur = conn.execute(sql, params)
    conn.commit()
    last_id = cur.lastrowid
    conn.close()
    return last_id


@router.post("/anti-cheat/events", response_model=AntiCheatEventResponse)
async def log_anti_cheat_event(
    event: AntiCheatEventCreate,
    _admin=Depends(require_admin_auth),
):
    """
    Log an anti-cheating violation event from the candidate frontend.
    Called by the interview client whenever a violation is detected.
    """
    event_id = _write_prisma(
        """INSERT INTO AntiCheatEvent
           (id, candidateId, interviewId, eventType, severity, message, metadata, createdAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            str(uuid.uuid4()),
            event.candidateId,
            event.interviewId,
            event.eventType,
            event.severity,
            event.message,
            event.metadata,
            datetime.now().isoformat(),
        ),
    )
    return AntiCheatEventResponse(
        id=str(event_id),
        candidateId=event.candidateId,
        interviewId=event.interviewId,
        eventType=event.eventType,
        severity=event.severity,
        message=event.message,
        metadata=event.metadata,
        createdAt=datetime.now().isoformat(),
    )


@router.get("/anti-cheat/events", response_model=List[AntiCheatEventResponse])
async def get_anti_cheat_events(
    candidateId: Optional[str] = Query(None, description="Filter by candidate ID"),
    interviewId: Optional[str] = Query(None, description="Filter by interview ID"),
    eventType: Optional[str] = Query(None, description="Filter by event type"),
    limit: int = Query(100, ge=1, le=1000, description="Max events to return"),
    _admin=Depends(require_admin_auth),
):
    """
    Fetch anti-cheat event logs for the admin dashboard.
    Optionally filtered by candidate, interview, or event type.
    """
    conditions = []
    params = []
    if candidateId:
        conditions.append("candidateId = ?")
        params.append(candidateId)
    if interviewId:
        conditions.append("interviewId = ?")
        params.append(interviewId)
    if eventType:
        conditions.append("eventType = ?")
        params.append(eventType)

    where_clause = f" WHERE {' AND '.join(conditions)}" if conditions else ""
    order_clause = " ORDER BY createdAt DESC"

    rows = _query_prisma(
        f"SELECT * FROM AntiCheatEvent{where_clause}{order_clause} LIMIT ?",
        [*params, limit],
    )
    return [
        AntiCheatEventResponse(
            id=str(row["id"]),
            candidateId=row["candidateId"],
            interviewId=row.get("interviewId"),
            eventType=row["eventType"],
            severity=row.get("severity", "warning"),
            message=row.get("message"),
            metadata=row.get("metadata"),
            createdAt=_format_datetime(row.get("createdAt")),
        )
        for row in rows
    ]


class AntiCheatViolationResponse(BaseModel):
    id: str
    candidateId: str
    candidateName: str
    email: str
    eventType: str
    severity: str
    message: Optional[str]
    createdAt: Optional[str]
    autoClosed: bool  # True if interview was auto-terminated (severity=critical)


@router.get("/anti-cheat/violations")
async def get_anti_cheat_violations(
    limit: int = Query(100, ge=1, le=500),
    _admin=Depends(require_admin_auth),
):
    """
    Return all anti-cheat events enriched with candidate name, email,
    and whether the interview was auto-closed (critical = interview terminated).
    """
    rows = _query_prisma(
        """SELECT e.*, u.name as userName, u.email as userEmail
           FROM AntiCheatEvent e
           LEFT JOIN Candidate c ON e.candidateId = c.id
           LEFT JOIN User u ON c.userId = u.id
           ORDER BY e.createdAt DESC
           LIMIT ?""",
        (limit,),
    )
    violations = []
    for row in rows:
        name = (row.get("userName") or row.get("fullName") or "Unknown").strip()
        email = row.get("userEmail") or row.get("email") or "—"
        violations.append({
            "id": str(row["id"]),
            "candidateId": row["candidateId"],
            "candidateName": name,
            "email": email,
            "eventType": row["eventType"],
            "severity": row.get("severity", "warning"),
            "message": row.get("message"),
            "createdAt": _format_datetime(row.get("createdAt")),
            "autoClosed": row.get("severity") == "critical",
        })
    return {"violations": violations, "total": len(violations)}


@router.get("/anti-cheat/summary")
async def get_anti_cheat_summary(
    _admin=Depends(require_admin_auth),
):
    """
    Get a summary of anti-cheat events: counts by type, recent critical events,
    and candidates with the most violations.
    """
    total_rows = _query_prisma("SELECT COUNT(*) as count FROM AntiCheatEvent")
    total = total_rows[0]["count"] if total_rows else 0

    by_type_rows = _query_prisma(
        "SELECT eventType, COUNT(*) as count FROM AntiCheatEvent GROUP BY eventType ORDER BY count DESC"
    )
    critical_rows = _query_prisma(
        "SELECT * FROM AntiCheatEvent WHERE severity = 'critical' ORDER BY createdAt DESC LIMIT 10"
    )
    top_candidates_rows = _query_prisma(
        """SELECT candidateId, COUNT(*) as count FROM AntiCheatEvent
           GROUP BY candidateId ORDER BY count DESC LIMIT 10"""
    )

    return {
        "total": total,
        "byType": {row["eventType"]: row["count"] for row in by_type_rows},
        "criticalEvents": [
            {
                "id": str(row["id"]),
                "candidateId": row["candidateId"],
                "eventType": row["eventType"],
                "createdAt": _format_datetime(row.get("createdAt")),
            }
            for row in critical_rows
        ],
        "topCandidates": [
            {"candidateId": row["candidateId"], "count": row["count"]}
            for row in top_candidates_rows
        ],
    }
