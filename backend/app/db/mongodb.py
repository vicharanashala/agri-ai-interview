"""
MongoDB client — Motor (async) + PyMongo (sync).

Used throughout the app to access MongoDB collections.
"""

from pymongo import MongoClient, ASCENDING, DESCENDING
from motor.motor_asyncio import AsyncIOMotorClient
from app.core.config import settings

# ── Async Motor client (for FastAPI route handlers) ──────────────────────────

_async_client: AsyncIOMotorClient | None = None
_async_db = None


def get_async_client() -> AsyncIOMotorClient:
    global _async_client
    if _async_client is None:
        _async_client = AsyncIOMotorClient(settings.MONGO_URI)
    return _async_client


def get_async_db():
    global _async_db
    if _async_db is None:
        _async_db = get_async_client()[settings.MONGO_DB_NAME]
    return _async_db


# ── Sync PyMongo client (for settings_service, email_service, etc.) ──────────

_sync_client: MongoClient | None = None
_sync_db = None


def get_sync_client() -> MongoClient:
    global _sync_client
    if _sync_client is None:
        _sync_client = MongoClient(settings.MONGO_URI)
    return _sync_client


def get_sync_db():
    global _sync_client, _sync_db
    if _sync_db is None:
        _sync_db = get_sync_client()[settings.MONGO_DB_NAME]
    return _sync_db


# ── Collection shortcuts ──────────────────────────────────────────────────────

def get_collection(name: str):
    """Get a collection by name from the async db."""
    return get_async_db()[name]


# ── Index setup ───────────────────────────────────────────────────────────────

def setup_indexes():
    """Call once at startup to ensure all indexes exist."""
    db = get_sync_db()

    db.users.create_index("email", unique=True)

    db.candidates.create_index("user_id")
    db.candidates.create_index("current_phase")
    db.candidates.create_index([("state", ASCENDING), ("district", ASCENDING)])

    db.interview_sessions.create_index("candidate_id")
    db.interview_sessions.create_index("status")
    db.interview_sessions.create_index([("started_at", DESCENDING)])

    db.anti_cheat_events.create_index("candidate_id")
    db.anti_cheat_events.create_index("interview_id")

    db.settings.create_index("key", unique=True)

    db.resumes.create_index("candidate_id")

    db.candidate_documents.create_index([
        ("candidate_id", ASCENDING),
        ("field_name", ASCENDING),
        ("file_index", ASCENDING),
    ])

    db.signed_offer_letters.create_index("candidate_id")

    db.queue_entries.create_index("candidate_id")
    db.queue_entries.create_index("status")

    # TTL index on sessions (expires automatically)
    db.sessions.create_index("expires_at", expireAfterSeconds=0, background=True)
    db.sessions.create_index("token_hash", unique=True, background=True)
    db.sessions.create_index("candidate_id", background=True)

