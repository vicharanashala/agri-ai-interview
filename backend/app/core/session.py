"""
MongoDB-backed candidate session store — replaces Redis.

Stores candidate sessions with:
  - token_hash (SHA256 of session token) as unique key
  - candidate_id for single-session enforcement
  - TTL via MongoDB expires_at field (TTL index)
"""

import json
import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

from app.db.mongodb import get_sync_db

_SESSION_TTL_DAYS = 30
_SESSION_KEY_PREFIX = "candidate:session:"


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _make_token() -> str:
    return secrets.token_urlsafe(48)


def _session_key(candidate_id: str) -> str:
    return f"{_SESSION_KEY_PREFIX}{candidate_id}"


class MongoSessionStore:
    """Sync MongoDB session store matching the Redis interface."""

    def get(self, key: str) -> Optional[str]:
        """
        Get raw JSON string value by key.
        Used for legacy scan-based lookups.
        """
        db = get_sync_db()
        doc = db.sessions.find_one({"candidate_id": key.replace(_SESSION_KEY_PREFIX, "")})
        if doc:
            return json.dumps({
                "token_hash": doc.get("token_hash"),
                "user_id": doc.get("user_id"),
                "candidate_id": doc.get("candidate_id"),
            })
        return None

    def setex(self, key: str, ttl_seconds: int, value: str) -> None:
        """
        Set a session by candidate_id key.
        Single-session: delete any existing session for this candidate first.
        """
        db = get_sync_db()
        candidate_id = key.replace(_SESSION_KEY_PREFIX, "")
        data = json.loads(value)

        # Delete old sessions for this candidate (single-session enforcement)
        db.sessions.delete_many({"candidate_id": candidate_id})

        expires_at = datetime.now(timezone.utc) + timedelta(seconds=ttl_seconds)
        doc = {
            "candidate_id": candidate_id,
            "token_hash": data.get("token_hash"),
            "user_id": data.get("user_id"),
            "created_at": datetime.now(timezone.utc),
            "expires_at": expires_at,
        }
        db.sessions.insert_one(doc)

        # Also store by token_hash as key for direct lookup
        token_hash = data.get("token_hash")
        if token_hash:
            db.sessions.delete_many({"token_hash": token_hash})
            db.sessions.insert_one({**doc, "_id": f"token:{token_hash}"})

    def delete(self, key: str) -> None:
        """Delete session by candidate_id key."""
        db = get_sync_db()
        candidate_id = key.replace(_SESSION_KEY_PREFIX, "")
        db.sessions.delete_many({"candidate_id": candidate_id})

    def scan(self, match: str, count: int = 100):
        """
        Generator yielding (cursor, [keys]).
        For backward compat with legacy scan-based token lookup.
        Yields MongoDB cursor so callers can iterate.
        """
        db = get_sync_db()
        pattern = match.replace("*", "")
        cursor = db.sessions.find({"candidate_id": {"$regex": f"^{pattern}"}})
        return cursor


    # ── Async get_session (used by candidate_auth middleware) ─────────────────

    async def get_session(self, token: str) -> Optional[dict]:
        """
        Async wrapper — hash token then lookup via find_by_token_hash.
        Used by get_candidate_session FastAPI dependency.
        """
        token_hash = _hash_token(token)
        return self.find_by_token_hash(token_hash)


# ── Token-indexed lookup (primary method for auth) ───────────────────────────

    def find_by_token_hash(self, token_hash: str) -> Optional[dict]:
        """
        Fast single-document lookup by token_hash.
        Returns session dict or None.
        """
        db = get_sync_db()
        doc = db.sessions.find_one({"token_hash": token_hash})
        if doc:
            return {
                "candidate_id": doc.get("candidate_id"),
                "user_id": doc.get("user_id"),
                "token_hash": doc.get("token_hash"),
            }
        return None

    def delete_by_token_hash(self, token_hash: str) -> None:
        """Delete session by token_hash."""
        db = get_sync_db()
        db.sessions.delete_many({"token_hash": token_hash})


# Singleton instance
session_store = MongoSessionStore()


def get_session_store() -> MongoSessionStore:
    return session_store