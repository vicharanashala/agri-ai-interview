"""
Admin authentication middleware.
Protects backend routes by verifying admin session tokens.
"""
from fastapi import Header, HTTPException
from typing import Optional

# Token store is imported from auth.py (shared singleton at runtime)
# We re-import it so this module is self-contained.
_auth_token_store: dict[str, dict] = {}


def get_auth_token_store() -> dict[str, dict]:
    """ Lazily access the token store from auth.py. """
    # Avoid circular import by doing the import inside the function
    from app.api.admin import auth as auth_module
    return auth_module._active_tokens


def require_admin_auth(x_admin_token: Optional[str] = Header(None)) -> dict:
    """
    FastAPI dependency — rejects request if no valid admin token is present.
    Returns the session payload (admin_id, email) on success.
    """
    if not x_admin_token:
        raise HTTPException(
            status_code=401,
            detail="Missing X-Admin-Token header — admin authentication required",
        )

    store = get_auth_token_store()
    session = store.get(x_admin_token)

    if not session:
        raise HTTPException(
            status_code=401,
            detail="Invalid or expired admin token",
        )

    return session