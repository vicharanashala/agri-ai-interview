"""
AI Interview Platform — FastAPI Backend
Main application entry point with all route registrations.
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi import Request

from app.api.admin import auth, candidates, settings
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
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        # Add production origins here
    ],
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
app.include_router(settings.router)


# ── Interview routes ──────────────────────────────────────────────────────────
app.include_router(interview.router)
app.include_router(interview_queue_router)
app.include_router(joining_details.router)
app.include_router(offer.router)
app.include_router(faq_router)
app.include_router(dev_router)

# ── Resume routes ─────────────────────────────────────────────────────────────
app.include_router(resume_router)