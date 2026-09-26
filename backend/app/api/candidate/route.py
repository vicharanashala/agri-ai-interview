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
from bson import ObjectId

from app.core.session import get_session_store, _hash_token
from app.db.mongodb import get_sync_db


def _to_objectid(id_value) -> ObjectId:
    """Convert string or ObjectId to ObjectId. Pass through if already ObjectId."""
    if isinstance(id_value, ObjectId):
        return id_value
    return ObjectId(id_value)
import bcrypt
import uuid

router = APIRouter(prefix="/api/candidate", tags=["candidate"])

_PHASE_MAP = {1: "onboarding", 2: "interview", 3: "summary", 4: "foundation", 5: "module", 6: "documents"}


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


def _get_candidate_id_with_email_fallback(request: Request) -> str:
    """
    Returns candidate_id from candidate session token if present.
    For new users without a session token, falls back to X-User-Email header
    to look up the user + candidate in MongoDB directly.
    """
    auth = request.headers.get("authorization", "")
    token = auth[7:] if auth.startswith("Bearer ") else request.cookies.get("candidate_session")
    if token:
        store = get_session_store()
        session = store.find_by_token_hash(_hash_token(token))
        if session:
            candidate_id = session.get("candidate_id")
            if candidate_id:
                return candidate_id
    # Fallback: new user without candidate session — use X-User-Email header
    email = request.headers.get("x-user-email")
    if not email:
        raise HTTPException(status_code=401, detail="Authentication required")
    db = get_sync_db()
    user = db.users.find_one({"email": email.lower().strip()})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    user_id_str = str(user["_id"])
    candidate = db.candidates.find_one({"user_id": user_id_str})
    if not candidate:
        # New user — create candidate record first
        from bson import ObjectId
        result = db.candidates.insert_one({
            "user_id": user_id_str,
            "current_phase": "onboarding",
            "created_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc),
        })
        return str(result.inserted_id)
    return str(candidate["_id"])


# ── Request/Response models ───────────────────────────────────────────────────

class EducationItem(BaseModel):
    level: Optional[str] = None
    levelOther: Optional[str] = None
    discipline: Optional[str] = None
    disciplineOther: Optional[str] = None
    status: Optional[str] = None
    institution: Optional[str] = None
    yearOfCompletion: Optional[str] = None


class OnboardingRequest(BaseModel):
    fullName: str
    phone: str
    state: str
    district: str
    pincode: str
    address: str
    currentRole: str
    yearsOfExperience: Optional[float] = None
    highestEducation: Optional[str] = None
    institution: Optional[str] = None
    education: Optional[list[EducationItem]] = None
    educationStatus: Optional[str] = None
    discipline: Optional[str] = None
    disciplineOther: Optional[str] = None
    nonAgriConsent: Optional[bool] = None
    isInternshipConsent: Optional[bool] = None
    farmingBackground: Optional[str] = None
    cropsGrown: str
    farmSize: Optional[str] = None
    primaryExpertise: str
    eligibleRole: Optional[str] = None


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
    yearsOfExperience: Optional[float] = None
    highestEducation: Optional[str] = None
    institution: Optional[str] = None
    education: Optional[list[dict]] = None
    educationStatus: Optional[str] = None
    discipline: Optional[str] = None
    disciplineOther: Optional[str] = None
    nonAgriConsent: Optional[bool] = None
    isInternshipConsent: Optional[bool] = None
    farmingBackground: Optional[str] = None
    cropsGrown: Optional[str] = None
    farmSize: Optional[str] = None
    primaryExpertise: Optional[str] = None
    eligibleRole: Optional[str] = None
    currentPhase: str = "onboarding"
    userId: Optional[str] = None
    resumeName: Optional[str] = None
    resumeId: Optional[str] = None
    resumeStatus: Optional[str] = None
    foundationCourseCompleted: Optional[bool] = False
    moduleCompleted: Optional[bool] = False
    passedAndVisitedSummary: Optional[bool] = False
    documentsSubmitted: Optional[bool] = False
    consentAccepted: Optional[bool] = False
    consentTimestamp: Optional[str] = None
    consentWithdrawn: Optional[bool] = False
    consentWithdrawnAt: Optional[str] = None


class CandidatePatchRequest(BaseModel):
    phase: Optional[int] = None
    offerLetterViewed: Optional[bool] = None
    passedAndVisitedSummary: Optional[bool] = None
    joiningDetailsVisited: Optional[bool] = None
    documentsSubmitted: Optional[bool] = None
    foundationCourseCompleted: Optional[bool] = None
    moduleCompleted: Optional[bool] = None
    consentAccepted: Optional[bool] = None
    consentTimestamp: Optional[str] = None
    consentWithdrawn: Optional[bool] = None
    consentWithdrawnAt: Optional[str] = None


class CandidatePatchResponse(BaseModel):
    success: bool
    currentPhase: Optional[str] = None
    message: str


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/verify-password")
async def verify_password(request: Request, body: dict):
    """
    Used by NextAuth credentials provider to verify email+password.
    Returns user dict (id, email, name) on success.

    Unverified users (email+password flow) are rejected with a clear message
    directing them to verify their email first.
    Google Sign-In users have isVerified=True set at account creation.
    """
    email = body.get("email")
    password = body.get("password")
    if not email or not password:
        raise HTTPException(status_code=400, detail="email and password required")

    db = get_sync_db()
    user = db.users.find_one({"email": email})
    if not user or not user.get("password"):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    # Reject unverified email+password users — they must verify email first
    if not user.get("isVerified", False):
        raise HTTPException(
            status_code=403,
            detail="Please verify your email before signing in. "
                   "Check your inbox for the verification code, or request a new one.",
        )

    if not bcrypt.checkpw(password.encode("utf-8"), user["password"].encode("utf-8")):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    return {"id": str(user["_id"]), "email": user["email"], "name": user.get("name", "")}


@router.post("", response_model=dict)
async def upsert_candidate(request: Request, body: OnboardingRequest):
    """
    Create or update candidate onboarding data.
    Authenticated via candidate_session cookie/Bearer token, or X-User-Email header
    (for new users who haven't completed onboarding yet and have no candidate session).
    """
    candidate_id = _get_candidate_id_with_email_fallback(request)

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
        "education": [e.model_dump() for e in body.education] if body.education else [],
        "education_status": body.educationStatus,
        "discipline": body.discipline,
        "discipline_other": body.disciplineOther,
        "non_agri_consent": body.nonAgriConsent,
        "is_internship_consent": body.isInternshipConsent,
        "farming_background": body.farmingBackground,
        "crops_grown": body.cropsGrown,
        "farm_size": body.farmSize,
        "primary_expertise": body.primaryExpertise,
        "eligible_role": body.eligibleRole,
        "updated_at": datetime.now(timezone.utc),
    }

    # Safely get ObjectId variant
    id_variants = [candidate_id]
    try:
        from bson.errors import InvalidId
        if not isinstance(candidate_id, ObjectId):
            id_variants.append(ObjectId(candidate_id))
    except Exception:
        pass

    db.candidates.update_one(
        {"_id": {"$in": id_variants}},
        {"$set": updates},
    )

    cand = db.candidates.find_one({"_id": {"$in": id_variants}})
    if not cand:
        raise HTTPException(status_code=404, detail="Candidate not found")

    return {"success": True, "message": "Candidate data saved", "id": str(cand["_id"])}


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

    user = db.users.find_one({"email": email.lower().strip()})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    cand = db.candidates.find_one({"user_id": str(user["_id"])})
    if not cand:
        raise HTTPException(status_code=404, detail="Candidate not found")

    # Fetch latest resume for this candidate.
    # candidates._id is stored as ObjectId; resumes.candidate_id is stored as
    # string. Query by string form to match both old and new data.
    cand_id_str = str(cand["_id"])
    resume = db.resumes.find_one(
        {"candidate_id": cand_id_str},
        sort=[("created_at", -1)]
    )
    resume_name = None
    resume_id = None
    resume_status = None
    if resume:
        resume_name = resume.get("file_name")
        resume_id = str(resume["_id"])
        resume_status = resume.get("status")

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
        education=cand.get("education"),
        educationStatus=cand.get("education_status"),
        discipline=cand.get("discipline"),
        disciplineOther=cand.get("discipline_other"),
        nonAgriConsent=cand.get("non_agri_consent"),
        isInternshipConsent=cand.get("is_internship_consent"),
        farmingBackground=cand.get("farming_background"),
        cropsGrown=cand.get("crops_grown"),
        farmSize=cand.get("farm_size"),
        primaryExpertise=cand.get("primary_expertise"),
        eligibleRole=cand.get("eligible_role"),
        currentPhase=cand.get("current_phase", "onboarding"),
        userId=str(user["_id"]),
        resumeName=resume_name,
        resumeId=resume_id,
        resumeStatus=resume_status,
        foundationCourseCompleted=cand.get("foundation_course_completed", False),
        moduleCompleted=cand.get("module_completed", False),
        passedAndVisitedSummary=cand.get("passed_and_visited_summary", False),
        documentsSubmitted=cand.get("documents_submitted", False),
        consentAccepted=cand.get("consent_accepted", False),
        consentTimestamp=cand.get("consent_timestamp"),
        consentWithdrawn=cand.get("consent_withdrawn", False),
        consentWithdrawnAt=cand.get("consent_withdrawn_at"),
    )


@router.delete("")
async def delete_candidate(request: Request):
    """Delete the current candidate's profile (used during onboarding reset)."""
    candidate_id = _get_candidate_id_from_request(request)
    db = get_sync_db()
    # Also delete the user and all related data
    user_id = db.candidates.find_one({"_id": _to_objectid(candidate_id)}, {"user_id": 1})
    if user_id:
        db.candidates.delete_one({"_id": _to_objectid(candidate_id)})
        db.users.delete_one({"_id": user_id["user_id"]})
    return {"success": True, "message": "Candidate deleted"}


@router.post("/consent/withdraw")
async def withdraw_consent(request: Request):
    """Withdraw candidate data access and document verification consent (DPDP Act)."""
    candidate_id = _get_candidate_id_from_request(request)
    db = get_sync_db()
    now = datetime.now(timezone.utc)
    res = db.candidates.update_one(
        {"_id": _to_objectid(candidate_id)},
        {
            "$set": {
                "consent_withdrawn": True,
                "consent_withdrawn_at": now.isoformat(),
                "consent_accepted": False,
                "consent_status": "withdrawn",
                "updated_at": now,
            }
        }
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Candidate not found")
    return {"success": True, "message": "Consent has been successfully withdrawn."}


@router.post("/consent/grant")
async def grant_consent(request: Request):
    """Re-grant candidate data access and document verification consent."""
    candidate_id = _get_candidate_id_from_request(request)
    db = get_sync_db()
    now = datetime.now(timezone.utc)
    res = db.candidates.update_one(
        {"_id": _to_objectid(candidate_id)},
        {
            "$set": {
                "consent_accepted": True,
                "consent_timestamp": now.isoformat(),
                "consent_withdrawn": False,
                "consent_withdrawn_at": None,
                "consent_status": "granted",
                "updated_at": now,
            }
        }
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Candidate not found")
    return {"success": True, "message": "Consent has been successfully granted."}


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
    if body.foundationCourseCompleted is not None:
        updates["foundation_course_completed"] = body.foundationCourseCompleted
    if body.moduleCompleted is not None:
        updates["module_completed"] = body.moduleCompleted
    if body.consentAccepted is not None:
        updates["consent_accepted"] = body.consentAccepted
        if body.consentAccepted:
            updates["consent_withdrawn"] = False
            updates["consent_status"] = "granted"
    if body.consentTimestamp is not None:
        updates["consent_timestamp"] = body.consentTimestamp
    if body.consentWithdrawn is not None:
        updates["consent_withdrawn"] = body.consentWithdrawn
        if body.consentWithdrawn:
            updates["consent_accepted"] = False
            updates["consent_status"] = "withdrawn"
    if body.consentWithdrawnAt is not None:
        updates["consent_withdrawn_at"] = body.consentWithdrawnAt

    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    updates["updated_at"] = datetime.now(timezone.utc)

    from app.db.mongodb import get_sync_db
    db = get_sync_db()
    result = db.candidates.update_one({"_id": _to_objectid(candidate_id)}, {"$set": updates})

    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Candidate not found")

    updated_cand = db.candidates.find_one({"_id": _to_objectid(candidate_id)})
    current_phase = updated_cand.get("current_phase", "onboarding") if updated_cand else None

    return CandidatePatchResponse(success=True, currentPhase=current_phase, message="Candidate updated")

# ── Password Reset ────────────────────────────────────────────────────────────

class ForgotPasswordRequest(BaseModel):
    email: str

class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str

@router.post("/forgot-password")
async def forgot_password(body: ForgotPasswordRequest):
    email = body.email.lower().strip()
    db = get_sync_db()
    user = db.users.find_one({"email": email})
    
    # We return success regardless to prevent email enumeration
    if not user:
        return {"success": True, "message": "Your password reset link has been sent."}
    
    import secrets
    import hashlib
    import os
    from datetime import timedelta
    from app.services.zoho_smtp import zoho_smtp_provider
    from app.core.config import settings

    # Generate token
    raw_token = secrets.token_hex(32)
    hashed_token = hashlib.sha256(raw_token.encode()).hexdigest()
    expires_at = datetime.now(timezone.utc) + timedelta(hours=1)

    # Save to user
    db.users.update_one(
        {"_id": user["_id"]},
        {
            "$set": {
                "reset_password_token": hashed_token,
                "reset_password_expires": expires_at,
                "updated_at": datetime.now(timezone.utc)
            }
        }
    )

    # Email
    reset_url = f"{os.getenv('NEXTAUTH_URL', 'http://localhost:3003')}/reset-password?token={raw_token}"
    subject = "Password Reset Request"
    body_text = f"You requested a password reset. Click here to reset: {reset_url}\nThis link expires in 1 hour."
    body_html = f"""
    <p>You requested a password reset.</p>
    <p><a href="{reset_url}">Click here to reset your password</a></p>
    <p>This link expires in 1 hour.</p>
    """
    
    zoho_smtp_provider.send(
        to=email,
        subject=subject,
        body=body_text,
        html_body=body_html
    )

    return {"success": True, "message": "Your password reset link has been sent."}

@router.post("/reset-password")
async def reset_password(body: ResetPasswordRequest):
    import hashlib
    import bcrypt
    
    raw_token = body.token
    new_password = body.new_password
    
    if len(new_password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters.")

    hashed_token = hashlib.sha256(raw_token.encode()).hexdigest()
    
    db = get_sync_db()
    user = db.users.find_one({
        "reset_password_token": hashed_token,
        "reset_password_expires": {"$gt": datetime.now(timezone.utc)}
    })

    if not user:
        raise HTTPException(status_code=400, detail="Invalid or expired reset token.")

    # Hash new password
    salt = bcrypt.gensalt()
    hashed_pw = bcrypt.hashpw(new_password.encode('utf-8'), salt).decode('utf-8')

    db.users.update_one(
        {"_id": user["_id"]},
        {
            "$set": {
                "password": hashed_pw,
                "updated_at": datetime.now(timezone.utc)
            },
            "$unset": {
                "reset_password_token": "",
                "reset_password_expires": ""
            }
        }
    )

    return {"success": True, "message": "Password reset successfully."}