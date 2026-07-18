"""
Pluggable document storage — local filesystem or GCS.

Usage:
    from app.core.storage import get_storage, StorageBackend

    storage = get_storage()
    await storage.write(path="candidates/{cid}/resume/resume.pdf", data=bytes)
    data = await storage.read(path="candidates/{cid}/resume/resume.pdf")
    await storage.delete(path="candidates/{cid}/resume/resume.pdf")
    urls = await storage.get_urls(paths=[...], bucket_name=..., signed_expiry=...)

Backend is selected via STORAGE_BACKEND env var:
    local  → LocalFileStorage  (STORAGE_LOCAL_PATH / candidates / {cid} / ...)
    gcs    → GCSStorage        (GCS_BUCKET_NAME / GCS_BASE_PREFIX / candidates / {cid} / ...)
"""

from __future__ import annotations

import os
import shutil
import uuid
from abc import ABC, abstractmethod
from dataclasses import dataclass
from enum import Enum
from typing import BinaryIO, List, Optional

from app.core.config import settings


# ── Enums ─────────────────────────────────────────────────────────────────────

class StorageBackend(str, Enum):
    LOCAL = "local"
    GCS   = "gcs"


# ── Dataclass ─────────────────────────────────────────────────────────────────

@dataclass
class UploadResult:
    path: str           # stored path (relative, e.g. "candidates/abc123/resume/resume.pdf")
    url: Optional[str]  # GCS signed URL when bucket_name + signed_expiry provided, else None


# ── Abstract interface ────────────────────────────────────────────────────────

class Storage(ABC):
    """Abstract storage interface — implemented by LocalFileStorage and GCSStorage."""

    @abstractmethod
    async def write(self, path: str, data: bytes, content_type: str = "application/octet-stream") -> UploadResult:
        """Write a file. Returns the path and optional URL."""
        ...

    @abstractmethod
    async def read(self, path: str) -> bytes:
        """Read a file. Raises FileNotFoundError if not found."""
        ...

    @abstractmethod
    async def delete(self, path: str) -> None:
        """Delete a file. Raises FileNotFoundError if not found."""
        ...

    @abstractmethod
    async def exists(self, path: str) -> bool:
        """Check if a file exists."""
        ...

    @abstractmethod
    async def get_urls(
        self,
        paths: List[str],
        bucket_name: Optional[str] = None,
        signed_expiry: int = 3600,
    ) -> List[Optional[str]]:
        """Return signed/download URLs for the given paths. Returns None for unavailable URLs."""
        ...


# ── Local filesystem implementation ───────────────────────────────────────────

class LocalFileStorage(Storage):
    """
    Stores files on the local filesystem under STORAGE_LOCAL_PATH.
    """

    def __init__(self):
        self.base_path = os.path.abspath(settings.STORAGE_LOCAL_PATH)

    def _full_path(self, path: str) -> str:
        # Prevent path traversal
        safe = os.path.normpath(path).lstrip(os.sep)
        return os.path.join(self.base_path, safe)

    async def write(self, path: str, data: bytes, content_type: str = "application/octet-stream") -> UploadResult:
        full = self._full_path(path)
        os.makedirs(os.path.dirname(full), exist_ok=True)
        with open(full, "wb") as f:
            f.write(data)
        return UploadResult(path=path, url=None)

    async def read(self, path: str) -> bytes:
        full = self._full_path(path)
        if not os.path.exists(full):
            raise FileNotFoundError(f"File not found: {path}")
        with open(full, "rb") as f:
            return f.read()

    async def delete(self, path: str) -> None:
        full = self._full_path(path)
        if not os.path.exists(full):
            raise FileNotFoundError(f"File not found: {path}")
        os.remove(full)

    async def exists(self, path: str) -> bool:
        return os.path.exists(self._full_path(path))

    async def get_urls(
        self,
        paths: List[str],
        bucket_name: Optional[str] = None,
        signed_expiry: int = 3600,
    ) -> List[Optional[str]]:
        # Local storage — return None (URLs are served via backend routes, not direct file access)
        return [None] * len(paths)


# ── GCS implementation ────────────────────────────────────────────────────────

class GCSStorage(Storage):
    """
    Stores files in Google Cloud Storage.
    Requires GOOGLE_APPLICATION_CREDENTIALS and GCS_BUCKET_NAME to be set.
    """

    def _get_bucket(self):
        from google.cloud import storage
        creds_path = settings.GOOGLE_APPLICATION_CREDENTIALS
        if not creds_path or not os.path.exists(creds_path):
            raise RuntimeError(
                "GCSStorage requires GOOGLE_APPLICATION_CREDENTIALS to be set to a valid "
                "service-account JSON file path."
            )
        client = storage.Client.from_service_account_json(creds_path)
        return client.bucket(settings.GCS_BUCKET_NAME)

    async def write(self, path: str, data: bytes, content_type: str = "application/octet-stream") -> UploadResult:
        bucket = self._get_bucket()
        blob = bucket.blob(path)
        blob.upload_from_string(data, content_type=content_type)
        return UploadResult(path=path, url=None)

    async def read(self, path: str) -> bytes:
        bucket = self._get_bucket()
        blob = bucket.blob(path)
        if not blob.exists():
            raise FileNotFoundError(f"File not found in GCS: {path}")
        return blob.download_as_bytes()

    async def delete(self, path: str) -> None:
        bucket = self._get_bucket()
        blob = bucket.blob(path)
        if not blob.exists():
            raise FileNotFoundError(f"File not found in GCS: {path}")
        blob.delete()

    async def exists(self, path: str) -> bool:
        bucket = self._get_bucket()
        return bucket.blob(path).exists()

    async def get_urls(
        self,
        paths: List[str],
        bucket_name: Optional[str] = None,
        signed_expiry: int = 3600,
    ) -> List[Optional[str]]:
        bucket = self._get_bucket()
        urls = []
        for path in paths:
            blob = bucket.blob(path)
            if blob.exists():
                try:
                    url = blob.generate_signed_url(
                        version="v4",
                        expiration_seconds=signed_expiry,
                        method="GET",
                    )
                    urls.append(url)
                except Exception:
                    urls.append(None)
            else:
                urls.append(None)
        return urls


# ── Factory ────────────────────────────────────────────────────────────────────

_storage_instance: Optional[Storage] = None


def get_storage() -> Storage:
    """
    Return the configured Storage instance (singleton).
    STORAGE_BACKEND=local  → LocalFileStorage
    STORAGE_BACKEND=gcs    → GCSStorage
    """
    global _storage_instance
    if _storage_instance is not None:
        return _storage_instance

    backend = settings.STORAGE_BACKEND.lower()

    if backend == StorageBackend.GCS.value:
        _storage_instance = GCSStorage()
    else:
        # Default to local
        _storage_instance = LocalFileStorage()

    return _storage_instance


def reset_storage() -> None:
    """Reset the singleton — useful for testing or when config changes."""
    global _storage_instance
    _storage_instance = None


# ── Path helpers ───────────────────────────────────────────────────────────────

def _prefix_path(path: str) -> str:
    """Prepend GCS_BASE_PREFIX to a storage path when using GCS."""
    prefix = settings.GCS_BASE_PREFIX.strip("/")
    if not prefix:
        return path
    return f"{prefix}/{path}"


def candidate_docs_path(candidate_id: str, field_name: str, filename: str) -> str:
    """
    Build a storage path for a candidate document.
    e.g. agri-interview-platform/staging/candidates/abc123/updated_resume/resume.pdf
    """
    raw = f"candidates/{candidate_id}/{field_name}/{filename}"
    if settings.STORAGE_BACKEND == StorageBackend.GCS.value:
        return _prefix_path(raw)
    return raw


def candidate_resume_path(candidate_id: str, filename: str) -> str:
    """
    Build a storage path for a candidate's resume.
    e.g. agri-interview-platform/staging/candidates/abc123/resume/resume.pdf
    """
    raw = f"candidates/{candidate_id}/resume/{filename}"
    if settings.STORAGE_BACKEND == StorageBackend.GCS.value:
        return _prefix_path(raw)
    return raw