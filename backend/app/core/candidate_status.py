"""
Candidate account status — respects the Admin Trash Bin soft delete.

The Admin Trash Bin sets ``candidates.is_deleted = True`` (restore sets it back to
False); the phone-claim flow sets both ``is_deleted`` and ``isdeleted``. Either flag
being True marks a candidate record as deleted.

Candidate authentication paths use these helpers so that a candidate in the Trash
Bin cannot log in or use protected APIs, and regains access as soon as an admin
restores them (the status is read from the database on every check).
"""
from typing import Any, Optional

from bson import ObjectId
from fastapi import HTTPException

ACCOUNT_DEACTIVATED_CODE = "ACCOUNT_DEACTIVATED"
ACCOUNT_DEACTIVATED_MESSAGE = "Your account has been deactivated. Please contact the administrator."

STATE_ACTIVE = "active"
STATE_DELETED = "deleted"
STATE_MISSING = "missing"

# Both flags must be not-True for a record to count as active.
NOT_DELETED_FILTER = {"is_deleted": {"$ne": True}, "isdeleted": {"$ne": True}}


def is_record_deleted(doc: Optional[dict]) -> bool:
    """True when either deletion flag on the record is True."""
    if not doc:
        return False
    return doc.get("is_deleted") is True or doc.get("isdeleted") is True


def id_variants(value: Any) -> list:
    """The stored forms of an ID: as given, as a string and, when valid, as an ObjectId."""
    variants = [value, str(value)]
    if ObjectId.is_valid(str(value)):
        variants.append(ObjectId(str(value)))
    unique = []
    for v in variants:
        if v not in unique:
            unique.append(v)
    return unique


def resolve_candidate_account(
    db, user: Optional[dict] = None, email: Optional[str] = None
) -> tuple[str, Optional[dict]]:
    """
    Classify the candidate account linked to a user (by ``user_id``) and/or an email.

    Returns ``(STATE_ACTIVE, record)`` when at least one matching record is active
    (records linked by ``user_id`` are preferred), ``(STATE_DELETED, record)`` when
    matching records exist and all of them are deleted, and ``(STATE_MISSING, None)``
    when no candidate record matches.
    """
    norm_email = (email or (user or {}).get("email") or "").lower().strip() or None

    lookups = []
    if user is not None and user.get("_id") is not None:
        lookups.append({"user_id": {"$in": id_variants(user["_id"])}})
    if norm_email:
        lookups.append({"email": norm_email})

    for query in lookups:
        active = db.candidates.find_one({**query, **NOT_DELETED_FILTER})
        if active:
            return STATE_ACTIVE, active

    for query in lookups:
        record = db.candidates.find_one(query)
        if record:
            return STATE_DELETED, record

    return STATE_MISSING, None


def is_candidate_id_deleted(db, candidate_id: Any) -> bool:
    """True when the candidate record with this ID exists and is deleted."""
    if not candidate_id:
        return False
    record = db.candidates.find_one(
        {"_id": {"$in": id_variants(candidate_id)}},
        {"is_deleted": 1, "isdeleted": 1},
    )
    return is_record_deleted(record)


def account_deactivated_exception() -> HTTPException:
    """HTTP 403 with the structured ACCOUNT_DEACTIVATED body the frontend recognises."""
    return HTTPException(
        status_code=403,
        detail={"code": ACCOUNT_DEACTIVATED_CODE, "message": ACCOUNT_DEACTIVATED_MESSAGE},
    )


def ensure_candidate_id_not_deleted(db, candidate_id: Any) -> None:
    """Raise ACCOUNT_DEACTIVATED when the candidate record with this ID is deleted."""
    if is_candidate_id_deleted(db, candidate_id):
        raise account_deactivated_exception()
