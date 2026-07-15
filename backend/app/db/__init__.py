"""Database package — MongoDB only."""
from app.db.mongodb import get_async_db, get_sync_db

__all__ = ["get_async_db", "get_sync_db"]