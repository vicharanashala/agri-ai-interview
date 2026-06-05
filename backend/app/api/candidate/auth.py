"""
Candidate Authentication — NextAuth callback proxy.

Forwards NextAuth credential-login callbacks to the NextAuth handler
running in the Next.js frontend (http://localhost:3000).
Keeps all NextAuth logic on the frontend side; this module just
proxies the request so the backend can issue a session cookie.
"""
from fastapi import APIRouter, HTTPException, Response, Request
from pydantic import BaseModel
import httpx

router = APIRouter(prefix="/api/auth", tags=["candidate-auth"])

NEXTAUTH_URL = "http://localhost:3000"
NEXTAUTH_SECRET = "annam-secret-key-123"  # must match NEXTAUTH_SECRET env


# ── NextAuth callback proxy ───────────────────────────────────────────────────

class AuthCallbackRequest(BaseModel):
    callbackUrl: str = "http://localhost:3000/api/auth/callback"
    csrfToken: str
    credentials: dict  # { email, password }


@router.post("/callback/{provider}")
async def auth_callback(provider: str, request: Request):
    """
    Proxy POST /api/auth/callback/{provider} to the Next.js NextAuth handler.
    Provider: credentials, google, etc.
    """
    body = await request.json()
    async with httpx.AsyncClient(timeout=30) as client:
        try:
            r = await client.post(
                f"{NEXTAUTH_URL}/api/auth/callback/{provider}",
                json=body,
                headers={"Content-Type": "application/json"},
            )
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"NextAuth unreachable: {e}")

    if r.status_code == 200:
        # Copy Set-Cookie header from NextAuth response to our response
        response = Response(content=r.text, status_code=r.status_code)
        for cookie in r.headers.getlist("set-cookie") or []:
            response.headers.append("set-cookie", cookie)
        return response

    raise HTTPException(status_code=r.status_code, detail=r.text)


@router.get("/session")
async def get_session(request: Request):
    """Proxy GET /api/auth/session to Next.js NextAuth."""
    async with httpx.AsyncClient(timeout=10) as client:
        try:
            r = await client.get(
                f"{NEXTAUTH_URL}/api/auth/session",
                cookies=dict(request.cookies),
            )
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"NextAuth unreachable: {e}")

    return r.json()


@router.post("/signout")
async def signout(request: Request):
    """Proxy POST /api/auth/signout to Next.js NextAuth."""
    async with httpx.AsyncClient(timeout=10) as client:
        try:
            r = await client.post(
                f"{NEXTAUTH_URL}/api/auth/signout",
                json=await request.json(),
                headers={"Content-Type": "application/json"},
            )
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"NextAuth unreachable: {e}")

    return r.json()