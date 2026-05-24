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

router = APIRouter(prefix="/api/admin/settings", tags=["admin-settings"])

# Default guidelines content
DEFAULT_GUIDELINES = {
    "question_guidelines": """# Question Generation Guidelines

## Core Principles
1. Ask one question at a time
2. Start with basic questions and gradually increase complexity
3. Use clear, simple language
4. Focus on practical agricultural knowledge

## Question Types
- Technical: Farming techniques, crop management, soil health
- Practical: Real-world scenarios and problem-solving
- Behavioral: Past experiences and decision-making
- Situational: How they would handle specific situations

## Guidelines
- Avoid leading questions
- Allow candidates to explain their answers
- Provide hints when struggling
- Maintain professional tone""",
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

You are an AI interviewer for Annam, a company focused on agricultural development.
Your role is to conduct professional interviews with candidates.

## Your Responsibilities
1. Welcome candidates warmly
2. Explain the interview process
3. Ask relevant questions based on candidate profile
4. Take notes on responses
5. Provide feedback at the end

## Tone and Approach
- Professional yet friendly
- Patient and understanding
- Fair and unbiased
- Focused on candidate growth""",
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
        setting.updated_at = datetime.now().isoformat()
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
        setting.updated_at = datetime.now().isoformat()
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