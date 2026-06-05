"""
Admin Guidelines & Evaluation Criteria API Endpoints.
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
from sqlalchemy.orm import Session
import uuid

from app.db.database import get_db
from app.db.models.settings import Settings
from app.api.admin.middleware import require_admin_auth
from app.services.settings_service import get_interview_settings, get_first_question, get_anti_cheat_settings, get_offer_letter_config, save_offer_letter_config

router = APIRouter(prefix="/api/admin/settings", tags=["admin-settings"])

# Default guidelines content
DEFAULT_GUIDELINES = {
    "question_guidelines": """# Question Quality Standards

## Rules (always follow)
1. ONE question per turn — never two
2. 1-2 lines maximum — concise, no filler
3. Agriculture-specific — about farming, crops, soil, water, pests, markets, livestock, or government schemes
4. No leading questions (e.g., \"You use drip irrigation, right?\" is bad)
5. No yes/no questions — ask open-ended questions that require explanation
6. If the candidate gave a short or vague answer, ask a follow-up on the SAME topic before moving on

## Question Direction
- Probe specifics: \"What challenges did you face with X?\" \"How do you decide Y?\" \"Can you give an example of Z?\"
- Use candidate's own words and experiences as anchors for follow-up questions
- If a resume highlight mentions something (e.g., commercial tomato farming), ask about it naturally in the flow
- After 2-3 exchanges on one topic, naturally transition to a new agriculture topic

## Topic Coverage
The interview covers these areas organically — no strict order enforced:
- Farming background and experience
- Crop selection and seed management
- Soil health and fertilisation
- Irrigation and water management
- Pest and disease management
- Post-harvest and storage
- Market access and pricing
- Government scheme awareness
- Sustainable and modern farming practices

## Red Lines
- Do NOT greet the candidate warmly each time — keep it professional and direct
- Do NOT explain the interview process to the candidate
- Do NOT give feedback or evaluation during the interview
- Do NOT ask about personal matters unrelated to agriculture""",
    "evaluation_system": """# Evaluation System Guidelines

## Scoring Criteria
1. Technical Knowledge (Weight: 30%)
   - Understanding of farming practices
   - Knowledge of modern agricultural techniques

2. Problem-Solving (Weight: 25%)
   - Analytical thinking
   - Decision-making abilities

3. Communication (Weight: 20%)
   - Clarity of expression
   - Listening skills

4. Experience Relevance (Weight: 15%)
   - Practical experience
   - Achievement history

5. Cultural Fit (Weight: 10%)
   - Teamwork potential
   - Adaptability""",
    "interview_system": """# Interview System Prompt

You are an expert agricultural interviewer for Annam, a company focused on agricultural development.
Your role is to conduct a professional, focused interview by asking ONE agriculture-related question at a time.

## Your Behavior
- Ask short, precise questions (1-2 lines max)
- Go straight to the question — no greetings, no preamble
- Questions must be specific to farming, crops, soil, irrigation, livestock, market access, or government schemes
- If a candidate answer relates to a topic you've already asked about, ask a deeper follow-up on that topic
- Adapt questions to the candidate's background, farming type, and crops they grow
- If a candidate shares a specific experience (e.g., \"I grew tomatoes for 3 years\"), probe it: challenges faced, scale, methods used
- Never ask two questions in one turn
- Stay on agriculture — if candidate goes off-topic, gently redirect

## Your Tone
- Professional but approachable
- Curious, not interrogative
- Patient with candidates who may have limited formal education""",
    "faq_system": """# FAQ Assistant Guidelines

## Purpose
Answer candidate questions about the company, role, and process.

## Response Guidelines
1. Be informative but concise
2. Stick to verified information
3. Escalate to human support when needed
4. Maintain confidentiality

## Common Topics
- Company background and mission
- Role responsibilities
- Interview process
- Next steps after interview
- Benefits and culture"""
}

DEFAULT_CRITERIA = [
    {
        "id": "crit_001",
        "name": "Technical Knowledge",
        "description": "Understanding of agricultural practices, modern farming techniques, and domain expertise",
        "weight": 30,
        "order": 1,
        "isActive": True
    },
    {
        "id": "crit_002",
        "name": "Problem-Solving",
        "description": "Ability to analyze situations, make decisions, and find solutions to challenges",
        "weight": 25,
        "order": 2,
        "isActive": True
    },
    {
        "id": "crit_003",
        "name": "Communication Skills",
        "description": "Clarity in expression, listening ability, and professional communication",
        "weight": 20,
        "order": 3,
        "isActive": True
    },
    {
        "id": "crit_004",
        "name": "Practical Experience",
        "description": "Relevant work experience, achievements, and hands-on skills",
        "weight": 15,
        "order": 4,
        "isActive": True
    },
    {
        "id": "crit_005",
        "name": "Cultural Fit",
        "description": "Alignment with company values, teamwork, and adaptability",
        "weight": 10,
        "order": 5,
        "isActive": True
    }
]


class GuidelinesResponse(BaseModel):
    key: str
    content: str
    updatedAt: Optional[str] = None


class EvaluationCriteriaResponse(BaseModel):
    id: str
    name: str
    description: Optional[str]
    weight: int
    order: int
    isActive: bool


class UpdateGuidelinesRequest(BaseModel):
    content: str


class UpdateCriteriaRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    weight: Optional[int] = None
    order: Optional[int] = None
    isActive: Optional[bool] = None


# ============ Guidelines Endpoints ============

@router.get("/guidelines")
async def get_all_guidelines(db: Session = Depends(get_db), _admin=Depends(require_admin_auth)):
    """
    Get all system guidelines.
    """
    guidelines = []
    for key, content in DEFAULT_GUIDELINES.items():
        setting = db.query(Settings).filter(Settings.key == key).first()
        guidelines.append({
            "key": key,
            "content": setting.value if setting else content,
            "updatedAt": setting.updated_at if setting else datetime.now().isoformat()
        })
    
    return {"guidelines": guidelines}


@router.get("/guidelines/{key}")
async def get_guidelines(key: str, db: Session = Depends(get_db), _admin=Depends(require_admin_auth)):
    """
    Get a specific guideline by key.
    """
    if key not in DEFAULT_GUIDELINES:
        raise HTTPException(status_code=404, detail=f"Guidelines '{key}' not found")
    
    setting = db.query(Settings).filter(Settings.key == key).first()
    
    return {
        "key": key,
        "content": setting.value if setting else DEFAULT_GUIDELINES[key],
        "updatedAt": setting.updated_at if setting else datetime.now().isoformat()
    }


@router.put("/guidelines/{key}")
async def update_guidelines(key: str, request: UpdateGuidelinesRequest, db: Session = Depends(get_db), _admin=Depends(require_admin_auth)):
    """
    Update a specific guideline.
    """
    if key not in DEFAULT_GUIDELINES:
        raise HTTPException(status_code=404, detail=f"Guidelines '{key}' not found")
    
    setting = db.query(Settings).filter(Settings.key == key).first()
    
    if setting:
        setting.value = request.content
        setting.updated_at = datetime.now()
    else:
        setting = Settings(
            key=key,
            value=request.content,
            category="guidelines",
            description=f"System guidelines for {key}"
        )
        db.add(setting)
    
    db.commit()
    
    return {
        "success": True,
        "message": f"Guidelines '{key}' updated successfully",
        "key": key
    }


# ============ Evaluation Criteria Endpoints ============

@router.get("/evaluation-criteria")
async def get_evaluation_criteria(db: Session = Depends(get_db), _admin=Depends(require_admin_auth)):
    """
    Get all evaluation criteria.
    """
    criteria = []
    for crit in DEFAULT_CRITERIA:
        setting_key = f"criteria_{crit['id']}"
        setting = db.query(Settings).filter(Settings.key == setting_key).first()
        
        if setting and setting.value:
            import json
            try:
                criteria_data = json.loads(setting.value)
                criteria.append(criteria_data)
            except:
                criteria.append(crit)
        else:
            criteria.append(crit)
    
    # Sort by order
    sorted_criteria = sorted(criteria, key=lambda x: x["order"])
    return {
        "criteria": sorted_criteria,
        "total": len(sorted_criteria)
    }


@router.get("/evaluation-criteria/{criteria_id}")
async def get_criteria(criteria_id: str, db: Session = Depends(get_db), _admin=Depends(require_admin_auth)):
    """
    Get a specific evaluation criteria.
    """
    setting_key = f"criteria_{criteria_id}"
    setting = db.query(Settings).filter(Settings.key == setting_key).first()
    
    if setting and setting.value:
        import json
        try:
            return json.loads(setting.value)
        except:
            pass
    
    # Fall back to default
    for crit in DEFAULT_CRITERIA:
        if crit["id"] == criteria_id:
            return crit
    
    raise HTTPException(status_code=404, detail="Criteria not found")


@router.post("/evaluation-criteria")
async def create_criteria(
    name: str,
    description: Optional[str] = None,
    weight: int = 10,
    order: Optional[int] = None,
    db: Session = Depends(get_db),
    _admin=Depends(require_admin_auth),
):
    """
    Create a new evaluation criteria.
    """
    criteria_id = f"crit_{uuid.uuid4().hex[:6]}"
    
    # Determine order
    if order is None:
        order = len(DEFAULT_CRITERIA) + 1
    
    new_criteria = {
        "id": criteria_id,
        "name": name,
        "description": description,
        "weight": weight,
        "order": order,
        "isActive": True
    }
    
    # Save to database
    import json
    setting = Settings(
        key=f"criteria_{criteria_id}",
        value=json.dumps(new_criteria),
        category="evaluation",
        description=f"Evaluation criteria: {name}"
    )
    db.add(setting)
    db.commit()
    
    return {
        "success": True,
        "criteria": new_criteria
    }


@router.put("/evaluation-criteria/{criteria_id}")
async def update_criteria(criteria_id: str, request: UpdateCriteriaRequest, db: Session = Depends(get_db), _admin=Depends(require_admin_auth)):
    """
    Update an evaluation criteria.
    """
    setting_key = f"criteria_{criteria_id}"
    setting = db.query(Settings).filter(Settings.key == setting_key).first()
    
    # Find or create criteria
    if setting and setting.value:
        import json
        try:
            criteria = json.loads(setting.value)
        except:
            criteria = None
    else:
        criteria = None
    
    # Find in defaults if not in database
    if not criteria:
        for crit in DEFAULT_CRITERIA:
            if crit["id"] == criteria_id:
                criteria = crit.copy()
                break
    
    if not criteria:
        raise HTTPException(status_code=404, detail="Criteria not found")
    
    # Apply updates
    if request.name is not None:
        criteria["name"] = request.name
    if request.description is not None:
        criteria["description"] = request.description
    if request.weight is not None:
        criteria["weight"] = request.weight
    if request.order is not None:
        criteria["order"] = request.order
    if request.isActive is not None:
        criteria["isActive"] = request.isActive
    
    # Save to database
    import json
    if setting:
        setting.value = json.dumps(criteria)
        setting.updated_at = datetime.now()
    else:
        setting = Settings(
            key=setting_key,
            value=json.dumps(criteria),
            category="evaluation",
            description=f"Evaluation criteria: {criteria['name']}"
        )
        db.add(setting)
    
    db.commit()
    
    return {
        "success": True,
        "criteria": criteria
    }


@router.delete("/evaluation-criteria/{criteria_id}")
async def delete_criteria(criteria_id: str, db: Session = Depends(get_db), _admin=Depends(require_admin_auth)):
    """
    Delete an evaluation criteria.
    """
    setting_key = f"criteria_{criteria_id}"
    setting = db.query(Settings).filter(Settings.key == setting_key).first()
    
    if setting:
        db.delete(setting)
        db.commit()
    
    return {
        "success": True,
        "message": "Criteria deleted"
    }


# ============ Interview Configuration Endpoints ============

class InterviewConfigResponse(BaseModel):
    max_questions: int
    max_duration_minutes: int
    cooldown_days: int
    pass_threshold: int


class UpdateInterviewConfigRequest(BaseModel):
    max_questions: Optional[int] = None
    max_duration_minutes: Optional[int] = None
    cooldown_days: Optional[int] = None
    pass_threshold: Optional[int] = None


@router.get("/interview-config", response_model=InterviewConfigResponse)
async def get_interview_config(_admin=Depends(require_admin_auth)):
    """
    Get current interview configuration: max questions, max duration, and cooldown days.
    """
    from app.services.settings_service import get_cooldown_days, get_evaluation_settings
    config = get_interview_settings()
    threshold_config = get_evaluation_settings()
    return InterviewConfigResponse(
        max_questions=config["max_questions"],
        max_duration_minutes=config["max_duration_minutes"],
        cooldown_days=get_cooldown_days(),
        pass_threshold=threshold_config["pass_threshold"],
    )


@router.put("/interview-config")
async def update_interview_config(request: UpdateInterviewConfigRequest, db: Session = Depends(get_db), _admin=Depends(require_admin_auth)):
    """
    Update interview configuration: max questions, max duration (minutes), and cooldown days.
    """
    now = datetime.now()

    if request.max_questions is not None:
        if request.max_questions < 1:
            raise HTTPException(status_code=400, detail="max_questions must be at least 1")
        setting = db.query(Settings).filter(Settings.key == "interview_max_questions").first()
        if setting:
            setting.value = str(request.max_questions)
            setting.updated_at = now
        else:
            setting = Settings(
                key="interview_max_questions",
                value=str(request.max_questions),
                category="interview",
                description="Maximum number of questions per interview session",
            )
            db.add(setting)

    if request.max_duration_minutes is not None:
        if request.max_duration_minutes < 5:
            raise HTTPException(status_code=400, detail="max_duration_minutes must be at least 5")
        setting = db.query(Settings).filter(Settings.key == "interview_max_duration_minutes").first()
        if setting:
            setting.value = str(request.max_duration_minutes)
            setting.updated_at = now
        else:
            setting = Settings(
                key="interview_max_duration_minutes",
                value=str(request.max_duration_minutes),
                category="interview",
                description="Maximum interview duration in minutes",
            )
            db.add(setting)

    if request.cooldown_days is not None:
        if request.cooldown_days < 0:
            raise HTTPException(status_code=400, detail="cooldown_days cannot be negative")
        setting = db.query(Settings).filter(Settings.key == "interview_cooldown_days").first()
        if setting:
            setting.value = str(request.cooldown_days)
            setting.updated_at = now
        else:
            setting = Settings(
                key="interview_cooldown_days",
                value=str(request.cooldown_days),
                category="interview",
                description="Cooldown period in days after FAIL or WITHDRAWN",
            )
            db.add(setting)

    if request.pass_threshold is not None:
        if request.pass_threshold < 0 or request.pass_threshold > 100:
            raise HTTPException(status_code=400, detail="pass_threshold must be between 0 and 100")
        setting = db.query(Settings).filter(Settings.key == "evaluation_pass_threshold").first()
        if setting:
            setting.value = str(request.pass_threshold)
            setting.updated_at = now
        else:
            setting = Settings(
                key="evaluation_pass_threshold",
                value=str(request.pass_threshold),
                category="evaluation",
                description="Minimum score (out of 100) required to PASS an interview",
            )
            db.add(setting)

    db.commit()

    return {
        "success": True,
        "max_questions": request.max_questions,
        "max_duration_minutes": request.max_duration_minutes,
        "cooldown_days": request.cooldown_days,
        "pass_threshold": request.pass_threshold,
    }


# ============ First Question Endpoints ============

class FirstQuestionResponse(BaseModel):
    first_question: str


class UpdateFirstQuestionRequest(BaseModel):
    first_question: str


@router.get("/first-question", response_model=FirstQuestionResponse)
async def get_first_question_config(_admin=Depends(require_admin_auth)):
    """
    Get the first question shown to all candidates at the start of an interview.
    """
    return FirstQuestionResponse(first_question=get_first_question())


@router.put("/first-question")
async def update_first_question(
    request: UpdateFirstQuestionRequest,
    db: Session = Depends(get_db),
    _admin=Depends(require_admin_auth),
):
    """
    Update the first question shown to all candidates.
    """
    if not request.first_question or not request.first_question.strip():
        raise HTTPException(status_code=400, detail="first_question cannot be empty")

    setting = db.query(Settings).filter(Settings.key == "interview_first_question").first()
    now = datetime.now()
    if setting:
        setting.value = request.first_question.strip()
        setting.updated_at = now
    else:
        setting = Settings(
            key="interview_first_question",
            value=request.first_question.strip(),
            category="interview",
            description="First question shown to candidates at interview start",
        )
        db.add(setting)

    db.commit()

    return {"success": True, "first_question": request.first_question.strip()}


# ============ Anti-Cheat Settings Endpoints ============

class AntiCheatConfigResponse(BaseModel):
    idle_threshold_ms: int
    platform_idle_ms: int


class UpdateAntiCheatConfigRequest(BaseModel):
    idle_threshold_ms: Optional[int] = None
    platform_idle_ms: Optional[int] = None


@router.get("/anti-cheat-config", response_model=AntiCheatConfigResponse)
async def get_anti_cheat_config(_admin=Depends(require_admin_auth)):
    """
    Get anti-cheat settings: idle threshold (interview) and platform idle timeout.
    """
    settings = get_anti_cheat_settings()
    return AntiCheatConfigResponse(**settings)


@router.put("/anti-cheat-config")
async def update_anti_cheat_config(request: UpdateAntiCheatConfigRequest, db: Session = Depends(get_db), _admin=Depends(require_admin_auth)):
    """
    Update anti-cheat settings.
    """
    idle_threshold_ms = request.idle_threshold_ms
    platform_idle_ms = request.platform_idle_ms

    if idle_threshold_ms is not None and idle_threshold_ms < 1000:
        raise HTTPException(status_code=400, detail="idle_threshold_ms must be at least 1000")
    if platform_idle_ms is not None and platform_idle_ms < 60_000:
        raise HTTPException(status_code=400, detail="platform_idle_ms must be at least 60000")

    now = datetime.now()

    if idle_threshold_ms is not None:
        setting = db.query(Settings).filter(Settings.key == "anti_cheat_idle_threshold_ms").first()
        if setting:
            setting.value = str(idle_threshold_ms)
            setting.updated_at = now
        else:
            setting = Settings(
                key="anti_cheat_idle_threshold_ms",
                value=str(idle_threshold_ms),
                category="anti_cheat",
                description="Interview idle threshold in milliseconds"
            )
            db.add(setting)

    if platform_idle_ms is not None:
        setting = db.query(Settings).filter(Settings.key == "anti_cheat_platform_idle_ms").first()
        if setting:
            setting.value = str(platform_idle_ms)
            setting.updated_at = now
        else:
            setting = Settings(
                key="anti_cheat_platform_idle_ms",
                value=str(platform_idle_ms),
                category="anti_cheat",
                description="Platform-wide idle timeout in milliseconds"
            )
            db.add(setting)

    db.commit()

    return {
        "success": True,
        **get_anti_cheat_settings()
    }


# ============ Anti-Cheat Settings Endpoints ============

class AntiCheatConfigResponse(BaseModel):
    idle_threshold_ms: int
    platform_idle_ms: int


class UpdateAntiCheatConfigRequest(BaseModel):
    idle_threshold_ms: Optional[int] = None
    platform_idle_ms: Optional[int] = None


@router.get("/anti-cheat-config", response_model=AntiCheatConfigResponse)
async def get_anti_cheat_config(_admin=Depends(require_admin_auth)):
    """
    Get anti-cheat configuration: idle threshold (interview) and platform idle timeout.
    """
    config = get_anti_cheat_settings()
    return AntiCheatConfigResponse(**config)


@router.put("/anti-cheat-config")
async def update_anti_cheat_config(
    request: UpdateAntiCheatConfigRequest,
    db: Session = Depends(get_db),
    _admin=Depends(require_admin_auth),
):
    """
    Update anti-cheat configuration.
    - idle_threshold_ms: seconds of inactivity during interview before warning (default 15000)
    - platform_idle_ms: seconds of inactivity on the platform before forced re-login (default 900000)
    """
    updates = []

    if request.idle_threshold_ms is not None:
        if request.idle_threshold_ms < 5000:
            raise HTTPException(status_code=400, detail="idle_threshold_ms must be at least 5000")
        _upsert_setting(
            db,
            "anti_cheat_idle_threshold_ms",
            str(request.idle_threshold_ms),
            "anti_cheat",
            "Idle threshold (ms) during live interview before warning is shown",
        )
        updates.append("idle_threshold_ms")

    if request.platform_idle_ms is not None:
        if request.platform_idle_ms < 60000:
            raise HTTPException(status_code=400, detail="platform_idle_ms must be at least 60000")
        _upsert_setting(
            db,
            "anti_cheat_platform_idle_ms",
            str(request.platform_idle_ms),
            "anti_cheat",
            "Platform-wide idle timeout (ms) before forced re-login",
        )
        updates.append("platform_idle_ms")

    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    db.commit()
    config = get_anti_cheat_settings()
    return {"success": True, **config}


def _upsert_setting(
    db: Session,
    key: str,
    value: str,
    category: str,
    description: str,
) -> None:
    """Insert or update a single Settings row."""
    setting = db.query(Settings).filter(Settings.key == key).first()
    if setting:
        setting.value = value
        setting.updated_at = datetime.now()
    else:
        setting = Settings(
            key=key,
            value=value,
            category=category,
            description=description,
        )
        db.add(setting)


# ---------------------------------------------------------------------------
# Offer Letter Configuration
# ---------------------------------------------------------------------------

class OfferLetterConfigUpdate(BaseModel):
    companyName: Optional[str] = None
    companyTagline: Optional[str] = None
    companyWebsite: Optional[str] = None
    position: Optional[str] = None
    department: Optional[str] = None
    duration: Optional[str] = None
    stipend: Optional[str] = None
    location: Optional[str] = None
    startDateNote: Optional[str] = None
    responsibilities: Optional[list[str]] = None
    terms: Optional[list[str]] = None
    acceptByDays: Optional[int] = None
    footerText: Optional[str] = None
    signatureLabel: Optional[str] = None
    template: Optional[str] = None


class OfferLetterPreviewRequest(BaseModel):
    name: str = "Test Candidate"
    email: str = "test@example.com"
    phone: str = "+91 9876543210"


@router.get("/offer-letter-config")
async def get_offer_letter_config_endpoint(_admin=Depends(require_admin_auth)):
    """Fetch the current offer letter configuration (template + field values)."""
    config = get_offer_letter_config()
    return {"config": config}


@router.put("/offer-letter-config")
async def update_offer_letter_config(
    request: OfferLetterConfigUpdate,
    _admin=Depends(require_admin_auth),
):
    """
    Update offer letter configuration. Only provided fields are updated;
    omitted fields retain their current values.
    """
    current = get_offer_letter_config()
    payload = request.model_dump(exclude_unset=True)
    updated = {**current, **payload}
    save_offer_letter_config(updated)
    return {"success": True, "config": updated}


@router.post("/offer-letter-preview")
async def preview_offer_letter(
    request: OfferLetterPreviewRequest,
    _admin=Depends(require_admin_auth),
):
    """
    Generate a preview PDF for a test candidate using the current
    offer-letter config. Returns the PDF as a base64-encoded data URL
    so the admin UI can display it in an iframe.
    """
    from fastapi.responses import StreamingResponse
    from io import BytesIO
    from app.api.offer import generate_offer_letter_pdf

    pdf_buffer = generate_offer_letter_pdf(
        candidate_name=request.name,
        email=request.email,
        phone=request.phone,
    )
    import base64
    pdf_bytes = pdf_buffer.getvalue()
    b64 = base64.b64encode(pdf_bytes).decode("utf-8")
    return {"pdf": f"data:application/pdf;base64,{b64}"}