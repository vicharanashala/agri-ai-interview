"""
Shared Redis client for the backend.

Uses a plain redis.Redis (not async) for simplicity, configured via the
REDIS_URL environment variable (defaults to the Docker internal URL).
"""
import os
from functools import lru_cache
import redis

_redis_client: redis.Redis | None = None


def get_redis_client() -> redis.Redis:
    """
    Return a singleton Redis client.
    Connection is lazy — no connection is made until the first command.
    """
    global _redis_client
    if _redis_client is None:
        redis_url = os.getenv("REDIS_URL", "redis://redis:6379/0")
        _redis_client = redis.from_url(redis_url, decode_responses=True)
    return _redis_client