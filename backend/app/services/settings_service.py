"""
Settings Service — reads guidelines from MongoDB, with fallback to defaults.
"""
import json
from datetime import datetime, timezone
from typing import Optional

from app.db.mongodb import get_sync_db


# ── Defaults ──────────────────────────────────────────────────────────────────

DEFAULT_MAX_QUESTIONS = 10

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

    "evaluation_system": """# Evaluation System Guidelines — Agricultural Internship

You are evaluating an AGRICULTURE INTERNSHIP candidate.
This is a STUDENT — they may have theoretical knowledge from coursework but likely have limited or no real farm experience.
Do NOT penalise lack of personal farming experience. Focus on academic understanding, conceptual clarity, and eagerness to learn.

---

## Scoring Dimensions

Evaluate the candidate across these 6 topic areas. Each is scored 0-10.
Topics with no questions asked receive a score of 0.

### 1. Agricultural Concepts
- Soil types, crop cycles, seasons, land preparation
- Seed selection criteria, crop rotation, nursery management
- Transplanting techniques, pruning, mulching
Score: 0 = no understanding, 5 = basic theory correct, 10 = deep conceptual clarity with scientific reasoning

### 2. Crop Management Practices
- Sowing methods, plant spacing, population density
- Irrigation scheduling, water management
- Fertilisation timing and methods, weed management
- Harvesting indices, post-harvest handling
Score: 0 = no understanding, 5 = knows textbook steps, 10 = explains why and when, with real-field context

### 3. Pest and Disease Management
- Common pests and diseases for major crops
- Identification, life cycle, damage symptoms
- IPM principles, chemical vs. organic control
- Resistance management, pesticide safety
Score: 0 = no understanding, 5 = knows major pests/controls, 10 = deep understanding of IPM logic and integrated approach

### 4. Nutrient Deficiencies
- Macronutrients and micronutrients — roles and functions
- Visual symptom identification (leaf colour, stunting, necrosis)
- NPK deficiency symptoms, corrective measures
- Soil testing importance, balanced fertilisation
Score: 0 = no understanding, 5 = knows NPK basics, 10 = can identify specific deficiency from symptoms and explain mechanism

### 5. Weather-Related Advisories
- Monsoon planning, rainfall patterns, waterlogging
- Drought response, irrigation adjustments
- Frost and heat stress management
- Seasonal advisories, weather-based decision making
Score: 0 = no awareness, 5 = knows general weather challenges, 10 = connects weather patterns to specific crop management decisions

### 6. Field-Level Technical Issues
- Drainage and waterlogging management
- Soil salinisation, erosion control
- Pre-harvest and post-harvest losses
- Storage best practices, quality maintenance
Score: 0 = no understanding, 5 = knows general issues, 10 = understands cause-effect and practical solutions

---

## Overall Score Calculation
Formula: overall_score = (sum of topic scores / 6) * 10
All 6 topics are included in the average. Topics with no questions asked score 0.

---

## Evaluation Criteria for Each Topic

Score 0-3: Poor — fundamental gaps, confused concepts, or memorised responses with no understanding
Score 4-6: Average — knows textbook definitions, can repeat theory, limited depth
Score 7-8: Good — explains why and when, references academic sources, understands mechanisms
Score 9-10: Excellent — connects theory to application, shows scientific reasoning, references specific crops/conditions correctly

---

## What to Look For in Strong Answers (any topic)

- Names specific crops, pests, nutrients, or diseases correctly
- Explains the MECHANISM or REASON behind a practice (not just what to do)
- References coursework, practicals, field visits, or textbook knowledge
- Can describe cause and effect (e.g., iron deficiency causes interveinal chlorosis because iron is immobile in phloem)
- Shows awareness of trade-offs or conditions (e.g., drip irrigation is best for row crops but expensive initially)

## Red Flags (any topic)

- Cannot distinguish between related concepts (e.g., pest vs. disease, N vs. P deficiency)
- Memorised answers with no ability to explain beyond the textbook definition
- Claims field experience they cannot back up with specifics
- No reference to any coursework, practical, or academic source
- Guesses wildly without logical reasoning""",

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
- Benefits and culture""",
}


# ── Low-level MongoDB read/write ──────────────────────────────────────────────

def _get_setting(db, key: str) -> Optional[str]:
    doc = db.settings.find_one({"key": key})
    return doc.get("value") if doc else None


def _set_setting(db, key: str, value: str, category: str = "general") -> None:
    now = datetime.now(timezone.utc)
    db.settings.update_one(
        {"key": key},
        {
            "$set": {
                "value": value,
                "category": category,
                "updated_at": now,
            },
            "$setOnInsert": {
                "created_at": now,
            }
        },
        upsert=True,
    )


# ── Guideline accessors ───────────────────────────────────────────────────────

def get_guideline(key: str) -> str:
    default = DEFAULT_GUIDELINES.get(key, "")
    try:
        db = get_sync_db()
        val = _get_setting(db, key)
        return val if val else default
    except Exception:
        return default


def get_all_guidelines() -> dict:
    return {key: get_guideline(key) for key in DEFAULT_GUIDELINES}


def get_question_guidelines() -> str:
    return get_guideline("question_guidelines")


def get_evaluation_system() -> str:
    return get_guideline("evaluation_system")


def get_interview_system() -> str:
    return get_guideline("interview_system")


def get_faq_system() -> str:
    return get_guideline("faq_system")


# ── Interview settings ────────────────────────────────────────────────────────

def get_interview_settings() -> dict:
    defaults = {
        "max_questions": DEFAULT_MAX_QUESTIONS,
        "max_duration_minutes": 30,
        "cooldown_days": 3,
        "pass_threshold": 60,
    }
    try:
        db = get_sync_db()
        q_val = _get_setting(db, "interview_max_questions")
        d_val = _get_setting(db, "interview_max_duration_minutes")
        c_val = _get_setting(db, "interview_cooldown_days")
        t_val = _get_setting(db, "evaluation_pass_threshold")
        if q_val:
            defaults["max_questions"] = int(q_val)
        if d_val:
            defaults["max_duration_minutes"] = int(d_val)
        if c_val:
            defaults["cooldown_days"] = int(c_val)
        if t_val:
            defaults["pass_threshold"] = int(t_val)
    except Exception:
        pass
    return defaults


# ── First question ────────────────────────────────────────────────────────────

def get_first_question(candidate_name: str = "") -> str:
    base = "Hello {name}, Welcome to the interview, please tell me about yourself."
    try:
        db = get_sync_db()
        val = _get_setting(db, "interview_first_question")
        if val:
            base = val
    except Exception:
        pass

    if candidate_name:
        base = base.replace("{name}", candidate_name)
    else:
        base = base.replace("{name}", "there")
    return base


# ── Anti-cheat settings ───────────────────────────────────────────────────────

def get_anti_cheat_settings() -> dict:
    defaults = {"idle_threshold_ms": 15000, "platform_idle_ms": 900000}
    try:
        db = get_sync_db()
        idle = _get_setting(db, "anti_cheat_idle_threshold_ms")
        platform = _get_setting(db, "anti_cheat_platform_idle_ms")
        if idle:
            defaults["idle_threshold_ms"] = int(idle)
        if platform:
            defaults["platform_idle_ms"] = int(platform)
    except Exception:
        pass
    return defaults


# ── Cooldown ──────────────────────────────────────────────────────────────────

def get_cooldown_days() -> int:
    try:
        db = get_sync_db()
        val = _get_setting(db, "interview_cooldown_days")
        if val:
            return int(val)
    except Exception:
        pass
    return 3


# ── Evaluation settings ───────────────────────────────────────────────────────

def get_evaluation_settings() -> dict:
    try:
        db = get_sync_db()
        val = _get_setting(db, "evaluation_pass_threshold")
        if val:
            return {"pass_threshold": int(val)}
    except Exception:
        pass
    return {"pass_threshold": 60}


def get_evaluation_criteria() -> list:
    try:
        db = get_sync_db()
        val = _get_setting(db, "evaluation_criteria")
        if val:
            criteria = json.loads(val)
            if isinstance(criteria, list):
                return criteria
    except Exception:
        pass
    return []


# ── Offer letter config ───────────────────────────────────────────────────────

OFFER_LETTER_DEFAULTS = {
    "companyName": "ANNAM AGRITECH",
    "companyTagline": "Empowering Agriculture Through Technology",
    "companyWebsite": "www.annamagritech.com",
    "position": "Agri Expert Intern",
    "department": "Agricultural Advisory Services",
    "duration": "6 months (extendable based on performance)",
    "stipend": "₹15,000/month",
    "location": "Hybrid (Remote + On-site training)",
    "startDateNote": "To be confirmed upon acceptance",
    "responsibilities": [
        "Provide expert consultation on crop management and agricultural practices",
        "Assist in developing technology solutions for farming challenges",
        "Conduct research on modern agricultural techniques and trends",
        "Support farmers with data-driven insights for improved yield",
        "Collaborate with the tech team to translate agricultural expertise into scalable solutions",
    ],
    "terms": [
        "This internship offer is contingent upon successful completion of any pending documentation.",
        "The intern agrees to maintain confidentiality regarding company information and proprietary data.",
        "Performance will be evaluated periodically, and continuation of the internship depends on satisfactory performance.",
        "The intern must comply with all company policies and agricultural safety guidelines.",
        "This offer letter must be signed and returned within 7 days of receipt.",
    ],
    "acceptByDays": 7,
    "footerText": "Annam AgriTech | Agricultural Innovation Hub | www.annmagritech.com",
    "signatureLabel": "Candidate Signature",
    "template": (
        "{{companyHeader}}\n\n"
        "Date: {{date}}\n\n"
        "Subject: Offer Letter for {{position}}\n\n"
        "Dear {{candidate_name}},\n\n"
        "We are pleased to inform you that after careful consideration of your application and interview performance, "
        "we are delighted to offer you the position of <b>{{position}}</b> at {{companyName}}. This internship "
        "program is designed to provide hands-on experience in agricultural consulting and technology solutions.\n\n"
        "<b>Internship Details:</b>\n"
        "Position: {{position}}\n"
        "Department: {{department}}\n"
        "Duration: {{duration}}\n"
        "Stipend: {{stipend}}\n"
        "Location: {{location}}\n"
        "Start Date: {{startDateNote}}\n\n"
        "<b>Key Responsibilities:</b>\n"
        "{{responsibilities}}\n\n"
        "<b>Terms and Conditions:</b>\n"
        "{{terms}}\n\n"
        "<b>Your Information:</b>\n"
        "Name: {{candidate_name}}\n"
        "Email: {{email}}\n"
        "Phone: {{phone}}\n\n"
        "We are excited about the prospect of you joining our team and believe you will be a valuable addition "
        "to {{companyName}}. If you have any questions or need further clarification, please do not hesitate to contact us.\n\n"
        "<b>Acceptance of Offer:</b>\n"
        "I, _________________________ (Candidate Name), accept the offer of {{position}} "
        "at {{companyName}} on the terms and conditions mentioned above.\n\n"
        "_________________________\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0_________________________\n"
        "{{signatureLabel}}\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0Date\n\n"
        "{{footerText}}"
    ),
}


def get_offer_letter_config() -> dict:
    defaults = OFFER_LETTER_DEFAULTS
    try:
        db = get_sync_db()
        val = _get_setting(db, "offer_letter_config")
        if val:
            cfg = json.loads(val)
            return {**defaults, **cfg}
    except Exception:
        pass
    return defaults


def save_offer_letter_config(config: dict) -> None:
    try:
        db = get_sync_db()
        payload = json.dumps(config)
        _set_setting(db, "offer_letter_config", payload, category="offer_letter")
    except Exception:
        pass