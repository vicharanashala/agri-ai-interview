"""
ViBe LMS integration client.
Used to verify Foundation Course completion status for candidates.
"""
import httpx
from typing import List

from app.core.config import settings

# ViBe's leaderboard sets completedAt to this sentinel for unfinished learners.
VIBE_NOT_COMPLETED = "Not completed yet"


class VibeResponseError(ValueError):
    """Raised when ViBe returns a response that is not in the expected format."""


def _is_completed_row(row: dict) -> bool:
    """A leaderboard row counts as completed at 100% completion percentage."""
    percentage = row.get("completionPercentage")
    return (
        isinstance(percentage, (int, float))
        and not isinstance(percentage, bool)
        and percentage >= 100
    )


async def get_course_completions() -> List[dict]:
    """
    Fetch all leaderboard rows that represent a completed Foundation Course.

    Calls: GET /users/progress/courses/{course_id}/versions/{version_id}/leaderboard/no-auth
    Auth:  none

    Returns only rows with completionPercentage == 100. Raises VibeResponseError if the 
    response is not an object with a `data` list of objects, so an invalid response is 
    never mistaken for an empty completion list.
    """
    url = (
        f"{settings.VIBE_API_URL.rstrip('/')}/users/progress/courses/{settings.VIBE_COURSE_ID}"
        f"/versions/{settings.VIBE_COURSE_VERSION_ID}/leaderboard/no-auth"
    )

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.get(url, headers={"Accept": "application/json"})
        response.raise_for_status()
        try:
            data = response.json()
        except ValueError as exc:
            raise VibeResponseError("ViBe leaderboard response is not valid JSON") from exc

    if not isinstance(data, dict) or not isinstance(data.get("data"), list):
        raise VibeResponseError("Unexpected ViBe leaderboard response shape: expected object with 'data' list")

    rows = data["data"]
    if not all(isinstance(row, dict) for row in rows):
        raise VibeResponseError("Unexpected ViBe leaderboard response shape: 'data' must contain objects")

    return [row for row in rows if _is_completed_row(row)]


def is_email_in_completions(email: str, completions: List[dict]) -> bool:
    """
    Check if a candidate's email is present in the ViBe completion list.
    Comparison is case-insensitive and ignores surrounding whitespace.
    A candidate with multiple rows is completed if any matching row is completed.
    """
    email_lower = email.strip().lower()
    for completion in completions:
        completion_email = completion.get("email")
        if not isinstance(completion_email, str):
            continue
        if completion_email.strip().lower() == email_lower and _is_completed_row(completion):
            return True
    return False
