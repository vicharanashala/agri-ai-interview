"""
ViBe LMS integration client.
Used to verify Foundation Course completion status for candidates.
"""
import httpx
from typing import List, Optional

from app.core.config import settings


async def get_course_completions() -> List[dict]:
    """
    Fetch all candidates who have completed the Foundation Course from ViBe.

    Calls: GET /integrations/courses/{course_id}/completions

    Returns a list of completion records, each containing candidate info
    (email, name, etc.) from the ViBe platform.
    """
    url = f"{settings.VIBE_API_URL}/integrations/courses/{settings.VIBE_COURSE_ID}/completions"

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.get(url)
        response.raise_for_status()
        data = response.json()

    # ViBe returns a list of completion records
    if isinstance(data, dict) and "completions" in data:
        return data["completions"]
    if isinstance(data, list):
        return data
    return []


def is_email_in_completions(email: str, completions: List[dict]) -> bool:
    """
    Check if a candidate's email is present in the ViBe completion list.
    Comparison is case-insensitive.
    """
    email_lower = email.lower()
    for completion in completions:
        # ViBe completion records may have 'email', 'user_email', or similar fields
        completion_email = (
            completion.get("email")
            or completion.get("user_email")
            or completion.get("candidate_email")
            or ""
        ).lower()
        if completion_email == email_lower:
            return True
    return False