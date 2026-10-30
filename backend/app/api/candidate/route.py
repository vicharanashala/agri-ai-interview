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


def _get_id_variants(val) -> list:
    if not val:
        return []
    variants = [val, str(val)]
    try:
        if isinstance(val, str):
            variants.append(ObjectId(val))
    except Exception:
        pass
    return list(set(variants))
import bcrypt
import uuid

router = APIRouter(prefix="/api/candidate", tags=["candidate"])

_PHASE_MAP = {1: "onboarding", 2: "interview", 3: "summary", 4: "foundation", 5: "module", 6: "documents"}


# ── Auth helper ───────────────────────────────────────────────────────────────

def _get_candidate_id_from_request(request: Request) -> str:
    """Helper that extracts candidate ID, falling back to X-User-Email when token is missing or expired."""
    return _get_candidate_id_with_email_fallback(request)


def _get_candidate_id_with_email_fallback(request: Request) -> str:
    """
    Returns candidate_id from candidate session token if present and valid.
    If token is expired, invalid, or missing, falls back to X-User-Email header
    to look up the user + candidate in MongoDB directly.
    """
    auth = request.headers.get("authorization", "")
    token = auth[7:] if auth.startswith("Bearer ") else request.cookies.get("candidate_session")
    if token:
        try:
            store = get_session_store()
            session = store.find_by_token_hash(_hash_token(token))
            if session:
                candidate_id = session.get("candidate_id")
                if candidate_id:
                    return str(candidate_id)
        except Exception:
            pass
    # Fallback: verified NextAuth user via X-User-Email header
    email = request.headers.get("x-user-email")
    if not email:
        raise HTTPException(status_code=401, detail="Authentication required")
    db = get_sync_db()
    user = db.users.find_one({"email": email.lower().strip()})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    user_id_str = str(user["_id"])
    candidate = db.candidates.find_one({
        "user_id": {"$in": [user_id_str, user["_id"]]},
        "$or": [{"isdeleted": {"$ne": True}}, {"is_deleted": {"$ne": True}}]
    })
    if not candidate:
        candidate = db.candidates.find_one({
            "email": email.lower().strip(),
            "$or": [{"isdeleted": {"$ne": True}}, {"is_deleted": {"$ne": True}}]
        })
    if not candidate:
        candidate = db.candidates.find_one({"user_id": {"$in": [user_id_str, user["_id"]]}})
    if not candidate:
        # New user — create candidate record first
        from bson import ObjectId
        result = db.candidates.insert_one({
            "user_id": user_id_str,
            "email": email.lower().strip(),
            "current_phase": "onboarding",
            "isdeleted": False,
            "is_deleted": False,
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
    fullName: Optional[str] = None
    phone: Optional[str] = None
    state: Optional[str] = None
    district: Optional[str] = None
    districtCustom: Optional[str] = None
    pincode: Optional[str] = None
    address: Optional[str] = None
    currentRole: Optional[str] = None
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
    cropsGrown: Optional[str] = None
    farmSize: Optional[str] = None
    primaryExpertise: Optional[str] = None
    eligibleRole: Optional[str] = None


# OnboardingRequest field -> candidates field (education is converted separately)
_ONBOARDING_FIELDS = {
    "fullName": "full_name",
    "phone": "phone",
    "state": "state",
    "district": "district",
    "districtCustom": "district_custom",
    "pincode": "pincode",
    "address": "address",
    "currentRole": "current_role",
    "yearsOfExperience": "years_of_experience",
    "highestEducation": "highest_education",
    "institution": "institution",
    "educationStatus": "education_status",
    "discipline": "discipline",
    "disciplineOther": "discipline_other",
    "nonAgriConsent": "non_agri_consent",
    "isInternshipConsent": "is_internship_consent",
    "farmingBackground": "farming_background",
    "cropsGrown": "crops_grown",
    "farmSize": "farm_size",
    "primaryExpertise": "primary_expertise",
    "eligibleRole": "eligible_role",
}


class CandidateProfileResponse(BaseModel):
    id: str
    email: str
    fullName: Optional[str] = None
    phone: Optional[str] = None
    state: Optional[str] = None
    district: Optional[str] = None
    districtCustom: Optional[str] = None
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
    foundationVideoCompleted: Optional[bool] = False
    moduleCompleted: Optional[bool] = False
    passedAndVisitedSummary: Optional[bool] = False
    documentsSubmitted: Optional[bool] = False
    documentsSubmittedAt: Optional[str] = None
    consentAccepted: Optional[bool] = False
    consentTimestamp: Optional[str] = None
    consentWithdrawn: Optional[bool] = False
    consentWithdrawnAt: Optional[str] = None
    consentHistory: Optional[list[dict]] = None
    declarationAccepted: Optional[bool] = False
    declarations: Optional[dict] = None
    profileCompleted: Optional[bool] = False
    profileCompletedAt: Optional[str] = None
    celebratedPhases: Optional[list[int]] = []
    isdeleted: Optional[bool] = False
    is_deleted: Optional[bool] = False


class CandidatePatchRequest(BaseModel):
    phase: Optional[int] = None
    offerLetterViewed: Optional[bool] = None
    passedAndVisitedSummary: Optional[bool] = None
    joiningDetailsVisited: Optional[bool] = None
    documentsSubmitted: Optional[bool] = None
    foundationCourseCompleted: Optional[bool] = None
    foundationVideoCompleted: Optional[bool] = None
    moduleCompleted: Optional[bool] = None
    celebratedPhases: Optional[list[int]] = None
    declarationAccepted: Optional[bool] = None
    declarations: Optional[dict] = None


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
    user = db.users.find_one({"email": email.lower().strip()})
    if not user or not user.get("password"):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    # Reject unverified email+password users — they must verify email first
    if not user.get("isVerified", False):
        raise HTTPException(
            status_code=403,
            detail="Please verify your email before signing in. "
                   "Check your inbox for the verification code, or request a new one.",
        )

    if user.get("isdeleted") or user.get("is_deleted"):
        raise HTTPException(
            status_code=403,
            detail="This account has been deactivated because its phone number was registered to another account."
        )

    if not bcrypt.checkpw(password.encode("utf-8"), user["password"].encode("utf-8")):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    user_name = user.get("name") or user.get("fullName") or user.get("full_name") or ""
    return {"id": str(user["_id"]), "email": user["email"], "name": user_name}


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

    # Write only the fields the client actually sent. Omitted Optional fields default to None on the model,
    # so writing them all would null e.g. eligible_role and the consent flags, which the profile page omits.
    provided = body.model_fields_set
    updates = {
        mongo_key: getattr(body, api_key)
        for api_key, mongo_key in _ONBOARDING_FIELDS.items()
        if api_key in provided
    }
    if "education" in provided:
        updates["education"] = [e.model_dump() for e in body.education] if body.education else []
    updates["updated_at"] = datetime.now(timezone.utc)

    # Safely get ObjectId variant
    id_variants = _get_id_variants(candidate_id)

    cand = db.candidates.find_one({"_id": {"$in": id_variants}})
    if not cand:
        raise HTTPException(status_code=404, detail="Candidate not found")

    # Automatically synchronize eligible_role if education/experience was updated or if missing
    if "education" in updates or "years_of_experience" in updates or not cand.get("eligible_role"):
        try:
            from app.api.admin.candidates import compute_eligible_role
            merged_cand = dict(cand)
            merged_cand.update(updates)
            calc_role = compute_eligible_role(merged_cand)
            if calc_role:
                updates["eligible_role"] = calc_role
        except Exception as e:
            logger.warning(f"[upsert_candidate] failed to auto-sync eligible role: {e}")

    # Keep user name synchronized if full_name was updated
    if "full_name" in updates and updates["full_name"] and cand.get("user_id"):
        try:
            db.users.update_one(
                {"_id": {"$in": _get_id_variants(cand["user_id"])}},
                {"$set": {"name": updates["full_name"], "fullName": updates["full_name"], "updated_at": datetime.now(timezone.utc)}}
            )
        except Exception:
            pass

    if not cand.get("profile_completed_at"):
        updates["profile_completed_at"] = datetime.now(timezone.utc)

    # Phone duplicate check: If another account already has this phone number,
    # mark that account as isdeleted: True and allow this new account to use the phone.
    phone = updates.get("phone")
    if phone:
        phone = str(phone).strip()
        updates["phone"] = phone
        now_dt = datetime.now(timezone.utc)
        now_iso = now_dt.isoformat()

        old_cands = list(db.candidates.find(
            {
                "phone": phone,
                "_id": {"$nin": id_variants},
                "$or": [
                    {"isdeleted": {"$ne": True}},
                    {"is_deleted": {"$ne": True}},
                ]
            },
            {"_id": 1, "user_id": 1}
        ))

        if old_cands:
            old_cand_ids = [c["_id"] for c in old_cands]
            db.candidates.update_many(
                {"_id": {"$in": old_cand_ids}},
                {"$set": {
                    "isdeleted": True,
                    "is_deleted": True,
                    "deleted_at": now_iso,
                    "deleted_reason": "phone_claimed_by_new_account",
                    "updated_at": now_dt
                }}
            )

            old_user_ids = [c["user_id"] for c in old_cands if c.get("user_id")]
            if old_user_ids:
                all_uids = []
                for uid in old_user_ids:
                    all_uids.extend(_get_id_variants(uid))
                db.users.update_many(
                    {"_id": {"$in": list(set(all_uids))}},
                    {"$set": {
                        "isdeleted": True,
                        "is_deleted": True,
                        "deleted_at": now_iso,
                        "updated_at": now_dt
                    }}
                )

            # Invalidate active sessions for deleted candidate(s)
            try:
                cand_id_strs = [str(cid) for cid in old_cand_ids]
                db.sessions.delete_many({"candidate_id": {"$in": cand_id_strs}})
            except Exception:
                pass

        updates["isdeleted"] = False
        updates["is_deleted"] = False

    try:
        from pymongo.errors import DuplicateKeyError
        db.candidates.update_one(
            {"_id": {"$in": id_variants}},
            {"$set": updates},
        )
    except DuplicateKeyError:
        raise HTTPException(
            status_code=400,
            detail="Phone number is already in use by another candidate."
        )

    return {"success": True, "message": "Candidate data saved", "id": str(cand["_id"])}


def mark_declarations_withdrawn(decls: dict, withdrawn_at: Optional[str]) -> dict:
    """Marks all slide declarations as accepted=False and adds withdrawnAt timestamp."""
    res = {}
    if isinstance(decls, dict):
        for k, v in decls.items():
            if isinstance(v, dict):
                s = dict(v)
                s["accepted"] = False
                if withdrawn_at and not s.get("withdrawnAt"):
                    s["withdrawnAt"] = withdrawn_at
                res[k] = s
            else:
                res[k] = v
    return res


def normalize_consent_cycles(
    raw_history: Optional[list],
    fallback_decls: Optional[dict] = None,
    fallback_accepted_at: Optional[str] = None,
    fallback_withdrawn_at: Optional[str] = None,
    fallback_is_withdrawn: bool = False,
) -> list[dict]:
    """
    Normalizes any consent history (whether legacy event format or cycle format)
    into a clean list of consent cycles. Each cycle represents a distinct consent granting
    and its subsequent withdrawal (if any). If a cycle is withdrawn, its nested declarations
    have accepted=False and all_accepted=False.
    """
    if not isinstance(raw_history, list):
        raw_history = []

    cycles: list[dict] = []
    current_cycle: Optional[dict] = None

    for item in raw_history:
        if not isinstance(item, dict):
            continue

        # If already a cycle object (has 'cycle' or 'all_accepted' or 'withdrawn' boolean)
        if "cycle" in item or ("withdrawn" in item and ("declarations" in item or "granted_at" in item or "accepted_at" in item)):
            c = dict(item)
            c["cycle"] = c.get("cycle") or (len(cycles) + 1)
            c["granted_at"] = c.get("granted_at") or c.get("accepted_at") or c.get("declarationAcceptedAt") or c.get("timestamp")
            c["withdrawn"] = bool(c.get("withdrawn", False))
            c["withdrawn_at"] = c.get("withdrawn_at") or c.get("withdrawnAt")
            c["status"] = "withdrawn" if c["withdrawn"] else "granted"
            raw_c_decls = c.get("declarations") or {}
            if c["withdrawn"]:
                c["all_accepted"] = False
                c["declarations"] = mark_declarations_withdrawn(raw_c_decls, c["withdrawn_at"])
            else:
                c["all_accepted"] = bool(c.get("all_accepted", True))
                c["declarations"] = raw_c_decls
            cycles.append(c)
            current_cycle = c
            continue

        # Otherwise it's a legacy event object ('event': 'granted' or 'event': 'withdrawn')
        evt = item.get("event") or item.get("action") or item.get("status")

        if evt == "granted":
            current_cycle = {
                "cycle": len(cycles) + 1,
                "status": "granted",
                "all_accepted": True,
                "granted_at": item.get("timestamp") or item.get("granted_at") or item.get("grantedAt"),
                "declarations": item.get("declarations") or {},
                "withdrawn": False,
                "withdrawn_at": None,
            }
            cycles.append(current_cycle)

        elif evt == "withdrawn":
            w_ts = item.get("timestamp") or item.get("withdrawn_at") or item.get("withdrawnAt")
            prev_d = item.get("previous_declarations") or item.get("declarations") or {}
            withdrawn_d = mark_declarations_withdrawn(prev_d, w_ts)
            if current_cycle:
                current_cycle["status"] = "withdrawn"
                current_cycle["all_accepted"] = False
                current_cycle["withdrawn"] = True
                current_cycle["withdrawn_at"] = w_ts
                current_cycle["reason"] = item.get("reason", "Candidate voluntarily withdrew consent via profile")
                current_cycle["declarations"] = mark_declarations_withdrawn(current_cycle.get("declarations") or prev_d, w_ts)
            else:
                current_cycle = {
                    "cycle": len(cycles) + 1,
                    "status": "withdrawn",
                    "all_accepted": False,
                    "granted_at": item.get("timestamp") or w_ts,
                    "declarations": withdrawn_d,
                    "withdrawn": True,
                    "withdrawn_at": w_ts,
                    "reason": item.get("reason", "Candidate voluntarily withdrew consent via profile"),
                }
                cycles.append(current_cycle)

    # Fallback if raw_history was completely empty but we have fallback declarations or withdrawal info
    if not cycles and (fallback_decls or fallback_accepted_at or fallback_withdrawn_at):
        f_decls = mark_declarations_withdrawn(fallback_decls, fallback_withdrawn_at) if fallback_is_withdrawn else (fallback_decls or {})
        cycles.append({
            "cycle": 1,
            "status": "withdrawn" if fallback_is_withdrawn else "granted",
            "all_accepted": False if fallback_is_withdrawn else True,
            "granted_at": fallback_accepted_at or fallback_withdrawn_at,
            "declarations": f_decls,
            "withdrawn": fallback_is_withdrawn,
            "withdrawn_at": fallback_withdrawn_at if fallback_is_withdrawn else None,
        })

    return cycles


def check_all_declarations_accepted(user: Optional[dict] = None, cand: Optional[dict] = None) -> bool:
    """
    Returns True if and only if the candidate has consented to all 4 declaration forms:
    1. slide1_aiAssessment
    2. slide2_vibePlatform
    3. slide3_groundTruthModule
    4. slide4_documentVerificationDPDP
    """
    if cand and cand.get("consent_withdrawn"):
        return False
    if user and user.get("consent_withdrawn"):
        return False
    if cand and cand.get("declaration_accepted") is False:
        return False
    if user and user.get("declarationAccepted") is False:
        return False

    user_decls = (user.get("declarations") if user else None) or (cand.get("declarations") if cand else None) or {}
    if not isinstance(user_decls, dict):
        return False
    s1 = user_decls.get("slide1_aiAssessment", {}).get("accepted", False)
    s2 = user_decls.get("slide2_vibePlatform", {}).get("accepted", False)
    s3 = user_decls.get("slide3_groundTruthModule", {}).get("accepted", False)
    s4 = user_decls.get("slide4_documentVerificationDPDP", {}).get("accepted", False)
    return bool(s1 and s2 and s3 and s4)


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

    cand = db.candidates.find_one({
        "user_id": {"$in": [str(user["_id"]), user["_id"]]},
        "$or": [{"isdeleted": {"$ne": True}}, {"is_deleted": {"$ne": True}}]
    })
    if not cand:
        cand = db.candidates.find_one({
            "email": email.lower().strip(),
            "$or": [{"isdeleted": {"$ne": True}}, {"is_deleted": {"$ne": True}}]
        })
    if not cand:
        cand = db.candidates.find_one({"user_id": {"$in": [str(user["_id"]), user["_id"]]}})
    if not cand:
        cand = db.candidates.find_one({"email": email.lower().strip()})

    has_all_declarations = check_all_declarations_accepted(user, cand)
    declarations_dict = user.get("declarations") or (cand.get("declarations") if cand else {}) or {}

    # Resolve full name and email across candidate & user records
    user_name = user.get("name") or user.get("fullName") or user.get("full_name") or ""
    cand_name = (cand.get("full_name") or cand.get("fullName")) if cand else None
    resolved_full_name = cand_name or user_name or ""

    resolved_email = (
        (cand.get("email") if cand else None)
        or user.get("email")
        or email
    )

    if not cand:
        return CandidateProfileResponse(
            id="",
            email=resolved_email,
            fullName=resolved_full_name,
            declarationAccepted=has_all_declarations,
            declarations=declarations_dict,
            consentHistory=user.get("consent_history", []) if user else [],
        )

    # Sync full_name / email / declaration data to candidate document if missing
    updates_to_cand = {}
    if resolved_full_name and not cand.get("full_name"):
        updates_to_cand["full_name"] = resolved_full_name
    if resolved_email and not cand.get("email"):
        updates_to_cand["email"] = resolved_email
    if has_all_declarations and not cand.get("declaration_accepted"):
        decl_time = user.get("declarationAcceptedAt") or datetime.now(timezone.utc).isoformat()
        updates_to_cand["declaration_accepted"] = True
        updates_to_cand["declaration_accepted_at"] = decl_time
        updates_to_cand["declarations"] = declarations_dict

        updates_to_cand["consent_status"] = "granted"
    if updates_to_cand:
        db.candidates.update_one({"_id": cand["_id"]}, {"$set": updates_to_cand})

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

    # Normalize consent history and auto-repair if DB had legacy separate events or unwithdrawn nested declarations
    raw_history = cand.get("consent_history") or (user.get("consent_history") if user else None)
    is_withdrawn = bool(cand.get("consent_withdrawn") or (user and user.get("consent_withdrawn")))
    withdrawn_at = cand.get("consent_withdrawn_at") or (user.get("consent_withdrawn_at") if user else None)
    accepted_at = cand.get("declaration_accepted_at") or (user.get("declarationAcceptedAt") if user else None) or cand.get("consent_timestamp")
    cleaned_history = normalize_consent_cycles(
        raw_history,
        fallback_decls=declarations_dict,
        fallback_accepted_at=accepted_at,
        fallback_withdrawn_at=withdrawn_at,
        fallback_is_withdrawn=is_withdrawn,
    )
    if is_withdrawn:
        declarations_dict = mark_declarations_withdrawn(declarations_dict, withdrawn_at)

    if cand:
        cand_update_fields = {}
        if cand.get("consent_history") != cleaned_history:
            cand_update_fields["consent_history"] = cleaned_history
        if is_withdrawn and cand.get("declarations") != declarations_dict:
            cand_update_fields["declarations"] = declarations_dict
        if cand_update_fields:
            db.candidates.update_one({"_id": cand["_id"]}, {"$set": cand_update_fields})

    if user:
        user_update_fields = {}
        if user.get("consent_history") != cleaned_history:
            user_update_fields["consent_history"] = cleaned_history
        if is_withdrawn and user.get("declarations") != declarations_dict:
            user_update_fields["declarations"] = declarations_dict
        if user_update_fields:
            db.users.update_one({"_id": user["_id"]}, {"$set": user_update_fields})

    # Check if onboarding profile has truly been completed
    profile_completed_val = cand.get("profile_completed_at")
    profile_completed_iso = (
        profile_completed_val.isoformat()
        if isinstance(profile_completed_val, datetime)
        else (str(profile_completed_val) if profile_completed_val else None)
    )
    is_profile_completed = bool(
        profile_completed_val
        or (cand.get("current_phase") and cand.get("current_phase") != "onboarding")
        or (cand.get("phone") and cand.get("address"))
    )

    return CandidateProfileResponse(
        id=str(cand["_id"]),
        email=resolved_email,
        fullName=resolved_full_name,
        phone=cand.get("phone"),
        state=cand.get("state"),
        district=cand.get("district"),
        districtCustom=cand.get("district_custom") or cand.get("districtCustom"),
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
        foundationVideoCompleted=cand.get("foundation_video_completed", False),
        moduleCompleted=cand.get("module_completed", False),
        passedAndVisitedSummary=cand.get("passed_and_visited_summary", False),
        documentsSubmitted=cand.get("documents_submitted", False),
        documentsSubmittedAt=cand.get("documents_submitted_at"),
        consentAccepted=(
            False if cand.get("consent_withdrawn", False)
            else bool(has_all_declarations)
        ),
        consentTimestamp=(
            cand.get("consent_timestamp")
            or (declarations_dict.get("slide4_documentVerificationDPDP", {}).get("acceptedAt") if isinstance(declarations_dict, dict) else None)
            or cand.get("declaration_accepted_at")
        ),
        consentWithdrawn=cand.get("consent_withdrawn", False),
        consentWithdrawnAt=cand.get("consent_withdrawn_at"),
        consentHistory=cleaned_history,
        declarationAccepted=has_all_declarations,
        declarations=declarations_dict,
        profileCompleted=is_profile_completed,
        profileCompletedAt=profile_completed_iso,
        celebratedPhases=cand.get("celebrated_phases", []),
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
    try:
        candidate_id = _get_candidate_id_with_email_fallback(request)
    except Exception:
        candidate_id = _get_candidate_id_from_request(request)

    db = get_sync_db()
    cand = db.candidates.find_one({"_id": _to_objectid(candidate_id)})
    if not cand:
        raise HTTPException(status_code=404, detail="Candidate not found")

    user = None
    if cand.get("user_id"):
        user = db.users.find_one({"_id": _to_objectid(cand["user_id"])})
    if not user and cand.get("email"):
        user = db.users.find_one({"email": cand["email"].lower().strip()})

    now = datetime.now(timezone.utc)
    now_iso = now.isoformat()

    prev_declarations = cand.get("declarations") or (user.get("declarations") if user else None) or {}
    prev_accepted_at = cand.get("declaration_accepted_at") or (user.get("declarationAcceptedAt") if user else None) or cand.get("consent_timestamp")
    prev_withdrawn_at = cand.get("consent_withdrawn_at") or (user.get("consent_withdrawn_at") if user else None)

    withdrawn_declarations = mark_declarations_withdrawn(prev_declarations, now_iso)

    raw_history = cand.get("consent_history") or (user.get("consent_history") if user else None)
    cycles = normalize_consent_cycles(
        raw_history,
        fallback_decls=withdrawn_declarations,
        fallback_accepted_at=prev_accepted_at,
        fallback_withdrawn_at=now_iso,
        fallback_is_withdrawn=True,
    )
    if cycles:
        cycles[-1]["status"] = "withdrawn"
        cycles[-1]["all_accepted"] = False
        cycles[-1]["withdrawn"] = True
        cycles[-1]["withdrawn_at"] = now_iso
        cycles[-1]["reason"] = "Candidate voluntarily withdrew consent via profile"
        cycles[-1]["declarations"] = withdrawn_declarations
    else:
        cycles = [{
            "cycle": 1,
            "status": "withdrawn",
            "all_accepted": False,
            "granted_at": prev_accepted_at or now_iso,
            "declarations": withdrawn_declarations,
            "withdrawn": True,
            "withdrawn_at": now_iso,
            "reason": "Candidate voluntarily withdrew consent via profile",
        }]
    updated_history = cycles

    # Delete all documents uploaded in doc upload phase (candidate_documents)
    id_variants = _get_id_variants(candidate_id)
    if cand.get("_id"):
        id_variants.extend(_get_id_variants(cand["_id"]))
    id_variants = list(set(id_variants))

    docs = list(db.candidate_documents.find({"candidate_id": {"$in": id_variants}}))
    if docs:
        from app.core.storage import get_storage
        storage = get_storage()
        for doc in docs:
            storage_path = doc.get("storage_path", "")
            if storage_path:
                try:
                    await storage.delete(storage_path)
                except FileNotFoundError:
                    pass
                except Exception as ex:
                    pass
        db.candidate_documents.delete_many({"candidate_id": {"$in": id_variants}})

    had_submitted_docs = bool(cand.get("documents_submitted"))

    cand_update = {
        "consent_withdrawn": True,
        "consent_withdrawn_at": now_iso,
        "consent_status": "withdrawn",
        "declaration_accepted": False,
        "declaration_accepted_at": None,
        "declarations": withdrawn_declarations,
        "consent_history": updated_history,
        "updated_at": now,
    }

    if had_submitted_docs or cand.get("current_phase") == "documents" or len(docs) > 0:
        cand_update["documents_submitted"] = False
        cand_update["documents_submitted_at"] = None
        cand_update["current_phase"] = "documents"
        cand_update["had_documents_submitted_before_withdraw"] = True

    db.candidates.update_one({"_id": cand["_id"]}, {"$set": cand_update, "$unset": {"consent_accepted": "", "allDeclarationsAccepted": ""}})

    if user:
        user_update = {
            "declarationAccepted": False,
            "declarationAcceptedAt": None,
            "declarations": withdrawn_declarations,
            "consent_withdrawn": True,
            "consent_withdrawn_at": now_iso,
            "consent_history": updated_history,
            "updated_at": now,
        }
        db.users.update_one({"_id": user["_id"]}, {"$set": user_update, "$unset": {"consent_accepted": "", "allDeclarationsAccepted": ""}})

    return {
        "success": True,
        "message": "Consent has been successfully withdrawn.",
        "redirectTo": "/declaration",
    }


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
    candidate_id = _get_candidate_id_with_email_fallback(request)

    updates = {}
    if body.phase is not None:
        phase_str = _PHASE_MAP.get(body.phase)
        if not phase_str:
            raise HTTPException(status_code=400, detail=f"Invalid phase: {body.phase}")
        # Guard against accidental downgrade if candidate has already progressed to foundation or later
        if phase_str == "summary":
            cand_check = db.candidates.find_one({"_id": {"$in": _get_id_variants(candidate_id)}})
            if cand_check and cand_check.get("current_phase") in ["foundation", "module", "documents"]:
                phase_str = cand_check.get("current_phase")
        updates["current_phase"] = phase_str

    if body.offerLetterViewed is not None:
        updates["offer_letter_viewed"] = body.offerLetterViewed
    if body.passedAndVisitedSummary is not None:
        updates["passed_and_visited_summary"] = body.passedAndVisitedSummary
    if body.joiningDetailsVisited is not None:
        updates["joining_details_visited"] = body.joiningDetailsVisited
    if body.documentsSubmitted is not None:
        updates["documents_submitted"] = body.documentsSubmitted
        if body.documentsSubmitted:
            updates["documents_submitted_at"] = datetime.now(timezone.utc).isoformat()
    if body.foundationCourseCompleted is not None:
        updates["foundation_course_completed"] = body.foundationCourseCompleted
    if body.foundationVideoCompleted is not None:
        updates["foundation_video_completed"] = body.foundationVideoCompleted
    if body.moduleCompleted is not None:
        updates["module_completed"] = body.moduleCompleted

    if body.declarationAccepted is not None:
        updates["declarationAccepted"] = body.declarationAccepted

    mongo_ops = {}
    if updates:
        updates["updated_at"] = datetime.now(timezone.utc)
        mongo_ops["$set"] = updates

    from app.db.mongodb import get_sync_db
    db = get_sync_db()

    if body.celebratedPhases is not None:
        db.candidates.update_one(
            {"_id": _to_objectid(candidate_id), "celebrated_phases": None},
            {"$set": {"celebrated_phases": []}}
        )
        mongo_ops["$addToSet"] = {"celebrated_phases": {"$each": body.celebratedPhases}}

    if not mongo_ops:
        raise HTTPException(status_code=400, detail="No fields to update")
    result = db.candidates.update_one({"_id": _to_objectid(candidate_id)}, mongo_ops)

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
class DeclarationRequest(BaseModel):
    declarationAccepted: bool
    consents: Optional[dict] = None
    aiAssessmentConsent: Optional[dict] = None
    vibeConsent: Optional[dict] = None
    groundTruthConsent: Optional[dict] = None
    documentPrivacyConsent: Optional[dict] = None

@router.post('/declaration', response_model=dict)
async def accept_declaration(request: Request, body: DeclarationRequest):
    email = request.headers.get('x-user-email')
    db = get_sync_db()
    if not email:
        try:
            cand_id = _get_candidate_id_from_request(request)
            if cand_id:
                cand = db.candidates.find_one({"_id": _to_objectid(cand_id)})
                if cand and cand.get("user_id"):
                    u = db.users.find_one({"_id": _to_objectid(cand["user_id"])})
                    if u:
                        email = u.get("email")
        except Exception:
            pass
    if not email:
        raise HTTPException(401, 'Unauthorized')

    user = db.users.find_one({'email': email.lower().strip()})
    if not user:
        raise HTTPException(404, 'User not found')

    now_iso = datetime.now(timezone.utc).isoformat()
    consents_data = body.consents or {}
    if body.aiAssessmentConsent:
        consents_data["slide1_aiAssessment"] = body.aiAssessmentConsent
    if body.vibeConsent:
        consents_data["slide2_vibePlatform"] = body.vibeConsent
    if body.groundTruthConsent:
        consents_data["slide3_groundTruthModule"] = body.groundTruthConsent
    if body.documentPrivacyConsent:
        consents_data["slide4_documentVerificationDPDP"] = body.documentPrivacyConsent

    has_all = check_all_declarations_accepted({'declarations': consents_data})

    # Look up existing candidate document if already created
    cand = db.candidates.find_one({'user_id': {'$in': [str(user['_id']), user['_id']]}})
    if not cand:
        cand = db.candidates.find_one({'email': email.lower().strip()})

    raw_history = cand.get("consent_history") if cand else None
    if not raw_history and user:
        raw_history = user.get("consent_history")

    prev_accepted_at = (cand.get("declaration_accepted_at") if cand else None) or user.get("declarationAcceptedAt") or (cand.get("consent_timestamp") if cand else None)
    prev_withdrawn_at = (cand.get("consent_withdrawn_at") if cand else None) or user.get("consent_withdrawn_at")
    prev_decls = (cand.get("declarations") if cand else None) or user.get("declarations") or {}

    cycles = normalize_consent_cycles(
        raw_history,
        fallback_decls=prev_decls,
        fallback_accepted_at=prev_accepted_at,
        fallback_withdrawn_at=prev_withdrawn_at,
        fallback_is_withdrawn=bool(cand.get("consent_withdrawn") if cand else (user.get("consent_withdrawn") if user else False)),
    )

    if cycles and cycles[-1].get("withdrawn"):
        # Previous consent was withdrawn. Candidate is now granting consent again — append Cycle 2!
        new_cycle = {
            "cycle": len(cycles) + 1,
            "status": "granted",
            "all_accepted": has_all,
            "granted_at": now_iso,
            "declarations": consents_data,
            "withdrawn": False,
            "withdrawn_at": None,
        }
        cycles.append(new_cycle)
    elif cycles:
        # Candidate is updating current active consent
        cycles[-1]["status"] = "granted"
        cycles[-1]["all_accepted"] = has_all
        cycles[-1]["granted_at"] = now_iso
        cycles[-1]["declarations"] = consents_data
        cycles[-1]["withdrawn"] = False
        cycles[-1]["withdrawn_at"] = None
    else:
        # First consent ever!
        cycles = [{
            "cycle": 1,
            "status": "granted",
            "all_accepted": has_all,
            "granted_at": now_iso,
            "declarations": consents_data,
            "withdrawn": False,
            "withdrawn_at": None,
        }]
    updated_history = cycles

    now_dt = datetime.now(timezone.utc)
    user_update = {
        'declarationAccepted': has_all,
        'declarationAcceptedAt': now_iso,
        'declarations': consents_data,
        'consent_withdrawn': False,
        'consent_withdrawn_at': None,
        'consent_history': updated_history,
        'updated_at': now_dt,
    }
    db.users.update_one(
        {'_id': user['_id']},
        {
            '$set': user_update,
            '$unset': {'allDeclarationsAccepted': '', 'consent_accepted': ''}
        }
    )

    if cand:
        cand_update = {
            'declaration_accepted': has_all,
            'declaration_accepted_at': now_iso,
            'declarations': consents_data,
            'consent_withdrawn': False,
            'consent_withdrawn_at': None,
            'consent_status': 'granted',
            'consent_history': updated_history,
            'updated_at': now_dt,
        }
        if cand.get("had_documents_submitted_before_withdraw") or cand.get("current_phase") == "documents":
            cand_update["current_phase"] = "documents"
            cand_update["documents_submitted"] = False
            cand_update["had_documents_submitted_before_withdraw"] = False

        db.candidates.update_one(
            {'_id': cand['_id']},
            {
                '$set': cand_update,
                '$unset': {
                    'allDeclarationsAccepted': '',
                    'consent_accepted': '',
                }
            }
        )
    else:
        cand_doc = {
            '_id': ObjectId(),
            'user_id': str(user['_id']),
            'email': email.lower().strip(),
            'full_name': user.get('name') or user.get('fullName') or user.get('full_name') or '',
            'current_phase': 'onboarding',
            'declaration_accepted': has_all,
            'declaration_accepted_at': now_iso,
            'declarations': consents_data,
            'consent_withdrawn': False,
            'consent_withdrawn_at': None,
            'consent_status': 'granted',
            'consent_history': updated_history,
            'isdeleted': False,
            'is_deleted': False,
            'created_at': now_dt,
            'updated_at': now_dt,
        }
        db.candidates.insert_one(cand_doc)

    return {'success': True, 'declarationAccepted': has_all}
