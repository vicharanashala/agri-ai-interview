"""
Onboarding Photo + Identity Verification Endpoints.

POST /api/candidate/photo               — save onboarding photo (webcam capture)
GET  /api/candidate/photo               — get photo URL / base64 for current candidate

POST /api/candidate/photo/verify        — verify fresh photo against onboarding photo (face match)
GET  /api/candidate/presence/check      — periodic presence check during interview

Face matching is done client-side using face-api.js (browser-based).
The backend only stores/returns the base64 image data; comparison is a frontend concern.
"""
from fastapi import APIRouter, HTTPException, Depends, Request
from fastapi.responses import Response
from pydantic import BaseModel
from typing import Optional
import base64
import os
import uuid
from datetime import datetime, timezone

from sqlalchemy.orm import Session
from app.db.database import get_db
from app.db.models.candidate import Candidate
from app.api.candidate.route import _get_candidate_id_from_request

router = APIRouter(prefix="/api/candidate", tags=["candidate-photo"])


# ── Constants ─────────────────────────────────────────────────────────────────

PHOTO_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "..", "..", "uploads", "photos")
os.makedirs(PHOTO_DIR, exist_ok=True)


# ── Helpers ────────────────────────────────────────────────────────────────────

def _utcnow():
    return datetime.now(timezone.utc)


def _get_candidate_id(request: Request) -> str:
    """Shorthand — reuse shared auth helper."""
    return _get_candidate_id_from_request(request)


def _candidate_photo_path(candidate_id: str) -> str:
    return os.path.join(PHOTO_DIR, f"{candidate_id}_onboarding.jpg")


def _verification_photo_path(candidate_id: str, attempt: int = 1) -> str:
    return os.path.join(PHOTO_DIR, f"{candidate_id}_verify_{attempt}.jpg")


# ── Response models ────────────────────────────────────────────────────────────

class PhotoUploadResponse(BaseModel):
    success: bool
    photoUrl: Optional[str] = None
    message: str


class PhotoGetResponse(BaseModel):
    success: bool
    photoData: Optional[str] = None   # base64 data URL
    hasPhoto: bool


class VerifyIdentityRequest(BaseModel):
    photoData: str        # base64 data URL of the freshly captured verification photo
    verificationId: Optional[str] = None   # frontend-generated unique ID for this verify attempt


class VerifyIdentityResponse(BaseModel):
    success: bool
    matchScore: Optional[float] = None   # 0.0–1.0 (set by frontend; backend just acknowledges)
    passed: bool
    message: str


class PresenceCheckRequest(BaseModel):
    photoData: str     # base64 frame from live camera
    interviewId: Optional[str] = None


class PresenceCheckResponse(BaseModel):
    success: bool
    matchScore: Optional[float] = None
    present: bool
    message: str


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.post("/photo", response_model=PhotoUploadResponse)
async def upload_onboarding_photo(request: Request, db: Session = Depends(get_db)):
    """
    Save the candidate's onboarding photo (captured via webcam).
    Body: JSON { photoData: "data:image/jpeg;base64,..." }
    Overwrites any previous onboarding photo.
    """
    candidate_id = _get_candidate_id(request)

    body = await request.json()
    photo_data: str = body.get("photoData", "")

    if not photo_data:
        raise HTTPException(status_code=400, detail="photoData is required")

    # Strip data URL prefix if present
    if "," in photo_data:
        photo_data = photo_data.split(",", 1)[1]

    try:
        image_bytes = base64.b64decode(photo_data)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid base64 image data")

    if len(image_bytes) < 1_000:
        raise HTTPException(status_code=400, detail="Image too small — likely invalid capture")

    # Save to disk
    photo_path = _candidate_photo_path(candidate_id)
    with open(photo_path, "wb") as f:
        f.write(image_bytes)

    # Update DB record
    cand = db.query(Candidate).filter(Candidate.id == candidate_id).first()
    if not cand:
        raise HTTPException(status_code=404, detail="Candidate not found")

    cand.onboardingPhoto = photo_path
    cand.onboardingPhotoUploadedAt = _utcnow()
    db.commit()

    photo_url = f"/api/candidate/photo?_t={_utcnow().timestamp()}"
    return PhotoUploadResponse(
        success=True,
        photoUrl=photo_url,
        message="Onboarding photo saved",
    )


@router.get("/photo", response_model=PhotoGetResponse)
async def get_onboarding_photo(request: Request, db: Session = Depends(get_db)):
    """
    Return the candidate's stored onboarding photo as base64.
    Used by the face verification flow.
    """
    candidate_id = _get_candidate_id(request)

    cand = db.query(Candidate).filter(Candidate.id == candidate_id).first()
    if not cand:
        raise HTTPException(status_code=404, detail="Candidate not found")

    photo_path = cand.onboardingPhoto
    if not photo_path or not os.path.exists(photo_path):
        return PhotoGetResponse(success=True, hasPhoto=False, photoData=None)

    with open(photo_path, "rb") as f:
        image_bytes = f.read()

    b64 = base64.b64encode(image_bytes).decode("utf-8")
    photo_data = f"data:image/jpeg;base64,{b64}"

    return PhotoGetResponse(success=True, hasPhoto=True, photoData=photo_data)


@router.post("/photo/verify", response_model=VerifyIdentityResponse)
async def verify_identity(request: Request, db: Session = Depends(get_db)):
    """
    Called by frontend AFTER face-api.js has done the client-side comparison.
    Body: { photoData, verificationId }

    Backend stores the verification photo for audit purposes.
    matchScore is computed client-side; backend just logs & persists it.
    """
    candidate_id = _get_candidate_id(request)

    body = await request.json()
    photo_data: str = body.get("photoData", "")
    verification_id: str = body.get("verificationId", str(uuid.uuid4()))
    match_score: Optional[float] = body.get("matchScore")

    if not photo_data:
        raise HTTPException(status_code=400, detail="photoData is required")

    # Strip prefix
    if "," in photo_data:
        photo_data = photo_data.split(",", 1)[1]

    try:
        image_bytes = base64.b64decode(photo_data)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid base64 image data")

    # Count existing verify photos to avoid collisions
    existing_count = sum(
        1
        for f in os.listdir(PHOTO_DIR)
        if f.startswith(f"{candidate_id}_verify_") and f.endswith(".jpg")
    )
    verify_path = _verification_photo_path(candidate_id, existing_count + 1)
    with open(verify_path, "wb") as f:
        f.write(image_bytes)

    passed = match_score is not None and match_score >= 0.45  # configurable threshold

    return VerifyIdentityResponse(
        success=True,
        matchScore=match_score,
        passed=passed,
        message="Identity verified" if passed else "Identity could not be verified",
    )


@router.post("/presence/check", response_model=PresenceCheckResponse)
async def presence_check(request: Request, db: Session = Depends(get_db)):
    """
    Periodic presence check during interview.
    Frontend sends a frame from the live camera; backend stores it for audit.
    matchScore is computed client-side by face-api.js.

    Body: { photoData, interviewId }
    """
    candidate_id = _get_candidate_id(request)

    body = await request.json()
    photo_data: str = body.get("photoData", "")
    interview_id: Optional[str] = body.get("interviewId")
    match_score: Optional[float] = body.get("matchScore")

    if not photo_data:
        raise HTTPException(status_code=400, detail="photoData is required")

    # Store frame for audit (not overwrite — keep all frames)
    if "," in photo_data:
        photo_data = photo_data.split(",", 1)[1]

    try:
        image_bytes = base64.b64decode(photo_data)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid base64 image data")

    # Keep last 30 frames max to avoid unbounded storage growth
    FRAME_DIR = os.path.join(PHOTO_DIR, "presence_frames", candidate_id)
    os.makedirs(FRAME_DIR, exist_ok=True)

    import time
    frame_name = f"frame_{int(time.time())}_{interview_id or 'no_session'}.jpg"
    frame_path = os.path.join(FRAME_DIR, frame_name)
    with open(frame_path, "wb") as f:
        f.write(image_bytes)

    # Prune old frames — keep only last 30
    frames = sorted(os.listdir(FRAME_DIR))
    for old_frame in frames[:-30]:
        try:
            os.remove(os.path.join(FRAME_DIR, old_frame))
        except OSError:
            pass

    present = match_score is not None and match_score >= 0.35  # lower threshold for ongoing checks

    return PresenceCheckResponse(
        success=True,
        matchScore=match_score,
        present=present,
        message="Present" if present else "Presence check failed",
    )