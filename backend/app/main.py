"""
AI Interview Platform — FastAPI Backend
Main application entry point with all route registrations.
"""
from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi import Request

from app.core.config import settings as app_settings
from app.api.admin import auth, candidates, settings as admin_settings
from app.api.candidate import auth as candidate_auth
from app.api.candidate.session import router as candidate_session_router
from app.api.candidate.route import router as candidate_router
from app.api.anti_cheat import router as anti_cheat_router
from app.api import interview, joining_details, offer
from app.api.interview.queue import router as interview_queue_router
from app.api.faq.route import router as faq_router
from app.api.dev import router as dev_router
from app.api.resume.route import router as resume_router
from app.db.database import init_db

app = FastAPI(
    title="AI Interview Platform",
    description="Backend API for Annam AI Interview Platform — handles authentication, "
                "candidate management, AI interviews, evaluations, and offer generation.",
    version="1.0.0",
)

# ── CORS ──────────────────────────────────────────────────────────────────────
# Allow frontend (Next.js) to communicate with backend
# CORS_ORIGINS is a comma-separated string of allowed origins
cors_origins = [origin.strip() for origin in app_settings.CORS_ORIGINS.split(",")]
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Database initialization ───────────────────────────────────────────────────
@app.on_event("startup")
async def startup_event():
    init_db()


# ── Health check ──────────────────────────────────────────────────────────────
@app.get("/health")
async def health():
    return {"status": "ok", "service": "ai-interview-platform"}


@app.post("/debug-headers")
async def debug_headers(request: Request):
    return dict(request.headers)


# ── Admin routes ──────────────────────────────────────────────────────────────
app.include_router(auth.router)
app.include_router(candidates.router)
app.include_router(admin_settings.router)


from app.middleware.candidate_auth import get_candidate_session

# ── Interview routes ──────────────────────────────────────────────────────────
# All interview + queue routes require a valid candidate session (Redis-backed)
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
app.include_router(anti_cheat_router)