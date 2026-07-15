"""
Redis compatibility shim — now backed by MongoDB.

All code that previously used app.core.redis.get_redis_client()
should use app.core.session.get_session_store() instead.
This shim is kept only for any lingering imports.
"""
from app.core.session import get_session_store

# For backward compat only — do not use in new code
def get_redis_client():
    """Deprecated: returns session store. Use get_session_store() instead."""
    return get_session_store()