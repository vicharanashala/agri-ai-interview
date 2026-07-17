"""
AI Interview Platform — FastAPI Backend
Main application entry point with all route registrations.
"""
from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi import Request

from app.core.config import settings as app_settings
from app.api.admin import auth, candidates, settings as admin_settings, documents as admin_documents
from app.api.register import router as register_router
from app.api.candidate import auth as candidate_auth
from app.api.candidate.session import router as candidate_session_router
from app.api.candidate.route import router as candidate_router
from app.api.candidate.documents import router as candidate_documents_router
from app.api.candidate.attempts import router as candidate_attempts_router
from app.api.anti_cheat import router as anti_cheat_router
from app.api import interview, joining_details, offer
from app.api.interview.queue import router as interview_queue_router
from app.api.faq.route import router as faq_router
from app.api.dev import router as dev_router
from app.api.resume.route import router as resume_router
from app.db.mongodb import setup_indexes

app = FastAPI(
    title="AI Interview Platform",
    description="Backend API for Annam AI Interview Platform — handles authentication, "
                "candidate management, AI interviews, evaluations, and offer generation.",
    version="1.0.0",
)

# ── CORS ──────────────────────────────────────────────────────────────────────
cors_origins = [origin.strip() for origin in app_settings.CORS_ORIGINS.split(",")]
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Startup ───────────────────────────────────────────────────────────────────
@app.on_event("startup")
async def startup_event():
    setup_indexes()


# ── Health check ──────────────────────────────────────────────────────────────
@app.get("/health")
async def health():
    return {"status": "ok", "service": "ai-interview-platform"}


@app.post("/debug-headers")
async def debug_headers(request: Request):
    return dict(request.headers)


@app.get("/debug-session")
async def debug_session(request: Request):
    """Debug session lookup using MongoDB session store."""
    from app.api.candidate.session import _extract_bearer_token, _hash_token, get_session_store
    import json

    token = _extract_bearer_token(request)
    if not token:
        return {"error": "No token found", "auth_header": request.headers.get('authorization', '(none)'), "cookie": request.cookies.get('candidate_session', '(none)')}

    store = get_session_store()
    token_hash = _hash_token(token)
    session = store.find_by_token_hash(token_hash)

    return {
        "token_first_8": token[:8],
        "token_hash_first_8": token_hash[:8],
        "session_found": session is not None,
        "session": session,
    }


# ── Admin routes ──────────────────────────────────────────────────────────────
app.include_router(auth.router)
app.include_router(candidates.router)
app.include_router(admin_settings.router)
app.include_router(admin_documents.router)
app.include_router(register_router)


from app.middleware.candidate_auth import get_candidate_session

# ── Interview routes ──────────────────────────────────────────────────────────
app.include_router(interview.router, dependencies=[Depends(get_candidate_session)])
app.include_router(interview_queue_router, dependencies=[Depends(get_candidate_session)])
app.include_router(joining_details.router)
app.include_router(offer.router)
app.include_router(faq_router)
app.include_router(dev_router)

# ── Resume routes ─────────────────────────────────────────────────────────────
app.include_router(resume_router)

# ── Candidate auth routes (login/logout/verify) ───────────────────────────────
app.include_router(candidate_auth.router)
app.include_router(candidate_session_router)
app.include_router(candidate_router)
app.include_router(candidate_documents_router)
app.include_router(candidate_attempts_router)
app.include_router(anti_cheat_router)