"""
Candidate Onboarding & Phase Sync — MongoDB.

POST /api/candidate        — create/update onboarding data
GET  /api/candidate        — get candidate profile (by email query param, for NextAuth)
PATCH /api/candidate       — update phase and milestones (session auth)
"""
from fastapi import APIRouter, HTTPException, Request, Query
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone
import uuid

from app.core.session import get_session_store, _hash_token
from app.db.mongodb import get_sync_db
import bcrypt
import uuid

router = APIRouter(prefix="/api/candidate", tags=["candidate"])

_PHASE_MAP = {1: "onboarding", 2: "interview", 3: "summary", 4: "documents"}


# ── Auth helper ───────────────────────────────────────────────────────────────

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


# ── Request/Response models ───────────────────────────────────────────────────

class OnboardingRequest(BaseModel):
    fullName: str
    phone: str
    state: str
    district: str
    pincode: str
    address: str
    currentRole: str
    yearsOfExperience: Optional[int] = None
    highestEducation: str
    institution: str
    farmingBackground: bool
    cropsGrown: str
    farmSize: str
    primaryExpertise: str


class CandidateProfileResponse(BaseModel):
    id: str
    email: str
    fullName: Optional[str] = None
    phone: Optional[str] = None
    state: Optional[str] = None
    district: Optional[str] = None
    pincode: Optional[str] = None
    address: Optional[str] = None
    currentRole: Optional[str] = None
    yearsOfExperience: Optional[int] = None
    highestEducation: Optional[str] = None
    institution: Optional[str] = None
    farmingBackground: Optional[bool] = None
    cropsGrown: Optional[str] = None
    farmSize: Optional[str] = None
    primaryExpertise: Optional[str] = None
    currentPhase: str = "onboarding"
    userId: Optional[str] = None


class CandidatePatchRequest(BaseModel):
    phase: Optional[int] = None
    offerLetterViewed: Optional[bool] = None
    passedAndVisitedSummary: Optional[bool] = None
    joiningDetailsVisited: Optional[bool] = None
    documentsSubmitted: Optional[bool] = None


class CandidatePatchResponse(BaseModel):
    success: bool
    currentPhase: Optional[str] = None
    message: str


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/verify-password")
async def verify_password(request: Request, body: dict):
    """
    Used by NextAuth credentials provider to verify email+password.
    Returns user dict (id, email, name) on success, 401 on failure.
    """
    email = body.get("email")
    password = body.get("password")
    if not email or not password:
        raise HTTPException(status_code=400, detail="email and password required")

    db = get_sync_db()
    user = db.users.find_one({"email": email})
    if not user or not user.get("password"):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    if not bcrypt.checkpw(password.encode("utf-8"), user["password"].encode("utf-8")):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    return {"id": str(user["_id"]), "email": user["email"], "name": user.get("name", "")}


@router.post("", response_model=dict)
async def upsert_candidate(request: Request, body: OnboardingRequest):
    """
    Create or update candidate onboarding data.
    Authenticated via candidate_session cookie or Bearer token.
    """
    candidate_id = _get_candidate_id_from_request(request)

    from app.db.mongodb import get_sync_db
    db = get_sync_db()

    updates = {
        "full_name": body.fullName,
        "phone": body.phone,
        "state": body.state,
        "district": body.district,
        "pincode": body.pincode,
        "address": body.address,
        "current_role": body.currentRole,
        "years_of_experience": body.yearsOfExperience,
        "highest_education": body.highestEducation,
        "institution": body.institution,
        "farming_background": body.farmingBackground,
        "crops_grown": body.cropsGrown,
        "farm_size": body.farmSize,
        "primary_expertise": body.primaryExpertise,
        "updated_at": datetime.now(timezone.utc),
    }

    db.candidates.update_one(
        {"_id": candidate_id},
        {"$set": updates},
    )

    cand = db.candidates.find_one({"_id": candidate_id})
    if not cand:
        raise HTTPException(status_code=404, detail="Candidate not found")

    return {"success": True, "message": "Candidate data saved"}


@router.get("", response_model=CandidateProfileResponse)
async def get_candidate_profile(email: Optional[str] = Query(None)):
    """
    Get candidate profile by email (used by NextAuth to look up candidateId on login).
    No session required — called during auth flow before session exists.
    """
    if not email:
        raise HTTPException(status_code=400, detail="email query param required")

    from app.db.mongodb import get_sync_db
    db = get_sync_db()

    user = db.users.find_one({"email": email})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    cand = db.candidates.find_one({"user_id": str(user["_id"])})
    if not cand:
        raise HTTPException(status_code=404, detail="Candidate not found")

    return CandidateProfileResponse(
        id=str(cand["_id"]),
        email=email,
        fullName=cand.get("full_name"),
        phone=cand.get("phone"),
        state=cand.get("state"),
        district=cand.get("district"),
        pincode=cand.get("pincode"),
        address=cand.get("address"),
        currentRole=cand.get("current_role"),
        yearsOfExperience=cand.get("years_of_experience"),
        highestEducation=cand.get("highest_education"),
        institution=cand.get("institution"),
        farmingBackground=cand.get("farming_background"),
        cropsGrown=cand.get("crops_grown"),
        farmSize=cand.get("farm_size"),
        primaryExpertise=cand.get("primary_expertise"),
        currentPhase=cand.get("current_phase", "onboarding"),
        userId=str(user["_id"]),
    )


@router.delete("")
async def delete_candidate(request: Request):
    """Delete the current candidate's profile (used during onboarding reset)."""
    candidate_id = _get_candidate_id_from_request(request)
    db = get_sync_db()
    # Also delete the user and all related data
    user_id = db.candidates.find_one({"_id": candidate_id}, {"user_id": 1})
    if user_id:
        db.candidates.delete_one({"_id": candidate_id})
        db.users.delete_one({"_id": user_id["user_id"]})
    return {"success": True, "message": "Candidate deleted"}


@router.patch("", response_model=CandidatePatchResponse)
async def patch_candidate(request: Request, body: CandidatePatchRequest):
    """
    Update the candidate's currentPhase and/or milestone flags.
    phase values: 1=onboarding, 2=interview, 3=summary, 4=documents
    """
    candidate_id = _get_candidate_id_from_request(request)

    updates = {}
    if body.phase is not None:
        phase_str = _PHASE_MAP.get(body.phase)
        if not phase_str:
            raise HTTPException(status_code=400, detail=f"Invalid phase: {body.phase}")
        updates["current_phase"] = phase_str

    if body.offerLetterViewed is not None:
        updates["offer_letter_viewed"] = body.offerLetterViewed
    if body.passedAndVisitedSummary is not None:
        updates["passed_and_visited_summary"] = body.passedAndVisitedSummary
    if body.joiningDetailsVisited is not None:
        updates["joining_details_visited"] = body.joiningDetailsVisited
    if body.documentsSubmitted is not None:
        updates["documents_submitted"] = body.documentsSubmitted

    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    updates["updated_at"] = datetime.now(timezone.utc)

    from app.db.mongodb import get_sync_db
    db = get_sync_db()
    result = db.candidates.update_one({"_id": candidate_id}, {"$set": updates})

    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Candidate not found")

    updated_cand = db.candidates.find_one({"_id": candidate_id})
    current_phase = updated_cand.get("current_phase", "onboarding") if updated_cand else None

    return CandidatePatchResponse(success=True, currentPhase=current_phase, message="Candidate updated")