"""
Admin Settings API Endpoints — MongoDB.
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone
import json

from app.db.mongodb import get_sync_db
from app.api.admin.middleware import require_admin_auth
from app.services.settings_service import (
    get_interview_settings,
    get_first_question,
    get_anti_cheat_settings,
    get_offer_letter_config,
    save_offer_letter_config,
)

router = APIRouter(prefix="/api/admin/settings", tags=["admin-settings"])

PHASES = ["onboarding", "interview", "summary", "documents"]


def _get_setting(db, key: str) -> Optional[str]:
    doc = db.settings.find_one({"key": key})
    return doc.get("value") if doc else None


def _set_setting(db, key: str, value: str, category: str = "general") -> None:
    now = datetime.now(timezone.utc)
    db.settings.update_one(
        {"key": key},
        {"$set": {"value": value, "category": category, "updated_at": now},
         "$setOnInsert": {"created_at": now}},
        upsert=True,
    )


# ── Guidelines ────────────────────────────────────────────────────────────────

@router.get("/guidelines")
async def get_guidelines(_admin=Depends(require_admin_auth)):
    """Return all admin-managed guidelines."""
    from app.services.settings_service import get_all_guidelines
    raw = get_all_guidelines()
    return {
        "guidelines": [{"key": k, "content": v} for k, v in raw.items()]
    }


@router.put("/guidelines/{key}")
async def update_guideline(key: str, request: Dict[str, Any], _admin=Depends(require_admin_auth)):
    """Update a single guideline by key."""
    if "content" not in request:
        raise HTTPException(status_code=400, detail="'content' field required")

    db = get_sync_db()
    _set_setting(db, key, request["content"], category="guidelines")
    return {"success": True, "key": key}


# ── Interview Settings ────────────────────────────────────────────────────────

@router.get("/interview")
async def get_interview_config(_admin=Depends(require_admin_auth)):
    return get_interview_settings()


@router.put("/interview")
async def update_interview_config(request: Dict[str, Any], _admin=Depends(require_admin_auth)):
    db = get_sync_db()
    if "max_questions" in request:
        _set_setting(db, "interview_max_questions", str(request["max_questions"]), "interview")
    if "max_duration_minutes" in request:
        _set_setting(db, "interview_max_duration_minutes", str(request["max_duration_minutes"]), "interview")
    if "cooldown_days" in request:
        _set_setting(db, "interview_cooldown_days", str(request["cooldown_days"]), "interview")
    if "pass_threshold" in request:
        _set_setting(db, "evaluation_pass_threshold", str(request["pass_threshold"]), "evaluation")
    # Return the full saved config so the frontend can update its state
    return get_interview_settings()


@router.get("/interview/first-question")
async def get_first_question_endpoint(_admin=Depends(require_admin_auth)):
    val = _get_setting(get_sync_db(), "interview_first_question")
    return {"value": val or "Hello {name}, Welcome to the interview, please tell me about yourself."}


@router.put("/interview/first-question")
async def update_first_question(request: Dict[str, Any], _admin=Depends(require_admin_auth)):
    if "value" not in request:
        raise HTTPException(status_code=400, detail="'value' field required")
    db = get_sync_db()
    _set_setting(db, "interview_first_question", request["value"], "interview")
    return {"success": True}


# ── Anti-Cheat ─────────────────────────────────────────────────────────────────

class AntiCheatSettingsResponse(BaseModel):
    idle_threshold_ms: int
    platform_idle_ms: int


@router.get("/anti-cheat", response_model=AntiCheatSettingsResponse)
async def get_anti_cheat(_admin=Depends(require_admin_auth)):
    cfg = get_anti_cheat_settings()
    return AntiCheatSettingsResponse(**cfg)


@router.put("/anti-cheat")
async def update_anti_cheat(request: Dict[str, Any], _admin=Depends(require_admin_auth)):
    db = get_sync_db()
    if "idle_threshold_ms" in request:
        if request["idle_threshold_ms"] < 5000:
            raise HTTPException(status_code=400, detail="idle_threshold_ms must be at least 5000")
        _set_setting(db, "anti_cheat_idle_threshold_ms", str(request["idle_threshold_ms"]), "anti-cheat")
    if "platform_idle_ms" in request:
        if request["platform_idle_ms"] < 60000:
            raise HTTPException(status_code=400, detail="platform_idle_ms must be at least 60000")
        _set_setting(db, "anti_cheat_platform_idle_ms", str(request["platform_idle_ms"]), "anti-cheat")
    return {"success": True}


# ── Evaluation ────────────────────────────────────────────────────────────────

@router.get("/evaluation")
async def get_evaluation_config(_admin=Depends(require_admin_auth)):
    from app.services.settings_service import get_evaluation_settings, get_evaluation_criteria
    return {
        **get_evaluation_settings(),
        "criteria": get_evaluation_criteria(),
    }


@router.put("/evaluation")
async def update_evaluation_config(request: Dict[str, Any], _admin=Depends(require_admin_auth)):
    db = get_sync_db()
    if "pass_threshold" in request:
        _set_setting(db, "evaluation_pass_threshold", str(request["pass_threshold"]), "evaluation")
    if "criteria" in request:
        _set_setting(db, "evaluation_criteria", json.dumps(request["criteria"]), "evaluation")
    return {"success": True}


# ── Offer Letter ──────────────────────────────────────────────────────────────

@router.get("/offer-letter/preview")
async def preview_offer_letter(_admin=Depends(require_admin_auth)):
    return get_offer_letter_config()


@router.put("/offer-letter")
async def update_offer_letter(request: Dict[str, Any], _admin=Depends(require_admin_auth)):
    save_offer_letter_config(request.get("config", {}))
    return {"success": True}


# ── Joining Details ───────────────────────────────────────────────────────────

@router.get("/joining-details/preview")
async def preview_joining_details(_admin=Depends(require_admin_auth)):
    val = _get_setting(get_sync_db(), "joining_details_config")
    if val:
        return json.loads(val)
    return {}


@router.put("/joining-details")
async def update_joining_details(request: Dict[str, Any], _admin=Depends(require_admin_auth)):
    db = get_sync_db()
    _set_setting(db, "joining_details_config", json.dumps(request), "joining")
    return {"success": True}


# ── Email Settings ─────────────────────────────────────────────────────────────

@router.get("/email")
async def get_email_settings(_admin=Depends(require_admin_auth)):
    val = _get_setting(get_sync_db(), "email_from_address")
    return {"from_address": val or "noreply@annam.com"}


@router.put("/email")
async def update_email_settings(request: Dict[str, Any], _admin=Depends(require_admin_auth)):
    if "from_address" in request:
        db = get_sync_db()
        _set_setting(db, "email_from_address", request["from_address"], "email")
    return {"success": True}


# ── Cooldown ──────────────────────────────────────────────────────────────────

@router.get("/cooldown")
async def get_cooldown(_admin=Depends(require_admin_auth)):
    from app.services.settings_service import get_cooldown_days
    return {"cooldown_days": get_cooldown_days()}


@router.put("/cooldown")
async def update_cooldown(request: Dict[str, Any], _admin=Depends(require_admin_auth)):
    if "cooldown_days" not in request:
        raise HTTPException(status_code=400, detail="'cooldown_days' required")
    days = int(request["cooldown_days"])
    if days < 0:
        raise HTTPException(status_code=400, detail="cooldown_days cannot be negative")
    db = get_sync_db()
    _set_setting(db, "interview_cooldown_days", str(days), "interview")
    return {"success": True}