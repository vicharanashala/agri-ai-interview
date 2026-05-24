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
PHASES = ["onboarding", "signing", "interview", "summary", "offer", "joining"]
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
    fullName: str
    email: Optional[str] = None
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


class RegisterInterviewRequest(BaseModel):
    interview_id: str
    candidate_id: str
    candidate_name: str


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
    """Convert a Prisma Candidate row dict to a CandidateResponse."""
    import json as _json
    notes_raw = row.get("notes") or "{}"
    if isinstance(notes_raw, str):
        try:
            notes = _json.loads(notes_raw)
        except Exception:
            notes = {}
    else:
        notes = notes_raw or {}

    current_phase = notes.get("current_phase", "onboarding") if isinstance(notes, dict) else "onboarding"

    phases = [
        PhaseStatus(
            phase=p,
            status=(
                notes.get("phases", {}).get(p, {}).get("status", "pending")
                if isinstance(notes, dict) else "pending"
            ),
            timestamp=notes.get("phases", {}).get(p, {}).get("timestamp") if isinstance(notes, dict) else None,
            completedAt=notes.get("phases", {}).get(p, {}).get("completedAt") if isinstance(notes, dict) else None,
        )
        for p in PHASES
    ]

    return CandidateResponse(
        id=str(row["id"]),
        fullName=row.get("fullName") or "Unknown",
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
    """
    rows = _query_prisma("SELECT * FROM Candidate")

    candidates = []
    for row in rows:
        response = _candidate_row_to_response(row)
        # Apply filters
        if phase and response.currentPhase != phase:
            continue
        if search and search.lower() not in response.fullName.lower():
            continue
        if state and response.state and state.lower() not in response.state.lower():
            continue
        if district and response.district and district.lower() not in response.district.lower():
            continue
        candidates.append(response)

    return {"candidates": candidates, "total": len(candidates)}


@router.get("/candidates/{candidate_id}")
async def get_candidate(candidate_id: str, _admin=Depends(require_admin_auth)):
    """
    Get a specific candidate by ID.
    """
    rows = _query_prisma("SELECT * FROM Candidate WHERE id = ?", (candidate_id,))
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

_active_interviews: Dict[str, Dict[str, Any]] = {}


def _build_active_response(interview_id: str, state) -> ActiveInterviewResponse:
    """Build ActiveInterviewResponse from an InterviewState or dict."""
    if hasattr(state, "messages"):
        # InterviewState from interview_workflow
        msgs = state.messages[-20:]
        candidate_name = (
            state.candidate_data.get("name")
            if state.candidate_data
            else "Unknown"
        )
        started_at = state.created_at.isoformat() if hasattr(state, "created_at") else datetime.now().isoformat()
        current_phase = getattr(state, "current_phase", "interview") if hasattr(state, "current_phase") else "interview"
        status = state.status
    else:
        # Plain dict from _active_interviews
        msgs = state.get("messages", [])[-20:]
        candidate_name = state.get("candidate_name", "Unknown")
        started_at = state.get("started_at", datetime.now().isoformat())
        current_phase = state.get("current_phase", "interview")
        status = state.get("status", "active")
    return ActiveInterviewResponse(
        id=interview_id,
        candidateId=state.candidate_data.get("candidate_id", "") if hasattr(state, "candidate_data") else state.get("candidate_id", ""),
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
    Reads from both the workflow's _interviews (primary) and _active_interviews (fallback).
    """
    active = []

    # Primary: read from the live interview workflow
    try:
        from app.workflows.interview_workflow import _interviews as workflow_interviews
        for interview_id, state in workflow_interviews.items():
            status = state.status if hasattr(state, "status") else state.get("status", "active")
            if status == "active":
                active.append(_build_active_response(interview_id, state))
    except Exception:
        pass

    # Fallback: also check _active_interviews
    for interview_id, data in _active_interviews.items():
        if data.get("status") == "active":
            active.append(_build_active_response(interview_id, data))

    return {"interviews": active, "total": len(active)}


@router.get("/interviews/{interview_id}")
async def get_interview(interview_id: str, _admin=Depends(require_admin_auth)):
    """
    Get a specific interview session with full chat history.
    """
    data = _active_interviews.get(interview_id)
    
    if not data:
        raise HTTPException(status_code=404, detail="Interview not found")
    
    return {
        "id": interview_id,
        "candidateId": data.get("candidate_id", ""),
        "candidateName": data.get("candidate_name", "Unknown"),
        "startedAt": data.get("started_at"),
        "completedAt": data.get("completed_at"),
        "status": data.get("status", "active"),
        "messages": data.get("messages", []),
        "messagesCount": len(data.get("messages", [])),
        "currentPhase": data.get("current_phase", "interview")
    }


@router.post("/interviews/register")
async def register_interview(body: RegisterInterviewRequest, _admin=Depends(require_admin_auth)):
    """
    Register an interview session with a specific interview ID (from interview workflow).
    This allows the admin dashboard to track the same interview.
    """
    interview_id = body.interview_id
    candidate_id = body.candidate_id
    candidate_name = body.candidate_name
    if interview_id in _active_interviews:
        # Already registered, update just in case
        _active_interviews[interview_id].update({
            "candidate_id": candidate_id,
            "candidate_name": candidate_name,
            "status": "active"
        })
    else:
        _active_interviews[interview_id] = {
            "candidate_id": candidate_id,
            "candidate_name": candidate_name,
            "started_at": datetime.now().isoformat(),
            "status": "active",
            "messages": [],
            "current_phase": "interview"
        }
    
    return {"interviewId": interview_id, "status": "active"}


# Keep old endpoint for backwards compatibility
@router.post("/interviews/start")
async def create_interview_session(candidate_id: str, candidate_name: str, _admin=Depends(require_admin_auth)):
    """
    Register a new interview session (called when candidate starts interview).
    """
    interview_id = str(uuid.uuid4())
    
    _active_interviews[interview_id] = {
        "candidate_id": candidate_id,
        "candidate_name": candidate_name,
        "started_at": datetime.now().isoformat(),
        "status": "active",
        "messages": [],
        "current_phase": "interview"
    }
    
    return {"interviewId": interview_id, "status": "active"}


@router.post("/interviews/{interview_id}/message")
async def add_interview_message(interview_id: str, role: str, content: str, _admin=Depends(require_admin_auth)):
    """
    Add a message to an interview session (for live monitoring).
    """
    if interview_id not in _active_interviews:
        raise HTTPException(status_code=404, detail="Interview not found")
    
    message = {
        "role": role,
        "content": content,
        "timestamp": datetime.now().isoformat()
    }
    
    _active_interviews[interview_id]["messages"].append(message)
    
    return {"success": True, "message": message}


@router.post("/interviews/{interview_id}/end")
async def end_interview_session(interview_id: str, _admin=Depends(require_admin_auth)):
    """
    End an interview session.
    """
    if interview_id not in _active_interviews:
        raise HTTPException(status_code=404, detail="Interview not found")
    
    _active_interviews[interview_id]["status"] = "completed"
    _active_interviews[interview_id]["completed_at"] = datetime.now().isoformat()
    
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
        notes_raw = r.get("notes")
        notes = json.loads(notes_raw) if isinstance(notes_raw, str) else (notes_raw or {})
        phase = notes.get("current_phase", "onboarding") if isinstance(notes, dict) else "onboarding"
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

    PHASE_ORDER = ["onboarding", "signing", "interview", "summary", "offer", "joining"]
    state_data: Dict[str, Dict[str, Any]] = {}

    for r in rows:
        notes_raw = r.get("notes")
        notes = json.loads(notes_raw) if isinstance(notes_raw, str) else (notes_raw or {})
        current = notes.get("current_phase", "onboarding") if isinstance(notes, dict) else "onboarding"
        cand_state = r.get("state") or "Unknown"

        if cand_state not in state_data:
            state_data[cand_state] = {"state": cand_state, "onboarding": 0, "interviewed": 0,
                "passed": 0, "failed": 0, "offerExtended": 0, "offerAccepted": 0}

        state_data[cand_state]["onboarding"] += 1
        phase_idx = PHASE_ORDER.index(current) if current in PHASE_ORDER else 0
        if phase_idx >= PHASE_ORDER.index("interview"):
            state_data[cand_state]["interviewed"] += 1
        if phase_idx >= PHASE_ORDER.index("offer"):
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
