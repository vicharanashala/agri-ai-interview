"""
Admin Candidate Feedbacks API Endpoints — MongoDB.
Lists and views feedback submitted by candidates with pagination, search, and rating filters.
"""
from fastapi import APIRouter, HTTPException, Query, Depends
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone
import re
from bson import ObjectId

from app.db.mongodb import get_sync_db
from app.api.admin.middleware import require_admin_auth
from app.api.admin.candidates import _get_id_variants, _format_iso

router = APIRouter(prefix="/api/admin", tags=["admin-feedbacks"])


@router.get("/feedbacks")
def list_feedbacks(
    search: Optional[str] = Query(None, description="Search by candidate name, email, or feedback text"),
    rating: Optional[int] = Query(None, ge=1, le=5, description="Filter by star rating (1-5)"),
    limit: int = Query(10, ge=1, le=100, description="Items per page"),
    offset: int = Query(0, ge=0, description="Offset for pagination"),
    admin: dict = Depends(require_admin_auth),
):
    """
    List candidate feedbacks with pagination and search.
    Supports searching across candidate name, email, phone, and feedback text.
    """
    db = get_sync_db()

    query: Dict[str, Any] = {}

    if rating is not None:
        query["overall_rating"] = rating

    search_term = (search or "").strip()
    if search_term:
        search_escaped = re.escape(search_term)
        search_regex = {"$regex": search_escaped, "$options": "i"}

        matched_candidate_ids = set()

        # 1. Search candidate records by name, email, or phone
        cand_matches = list(
            db.candidates.find(
                {
                    "$or": [
                        {"full_name": search_regex},
                        {"name": search_regex},
                        {"email": search_regex},
                        {"phone": search_regex},
                    ]
                },
                {"_id": 1},
            )
        )
        for c in cand_matches:
            matched_candidate_ids.add(str(c["_id"]))

        # 2. Search users collection by email or name, then find their candidate record
        user_matches = list(
            db.users.find(
                {
                    "$or": [
                        {"email": search_regex},
                        {"name": search_regex},
                    ]
                },
                {"_id": 1},
            )
        )
        if user_matches:
            user_ids = []
            for u in user_matches:
                user_ids.append(u["_id"])
                user_ids.append(str(u["_id"]))
            cands_from_users = list(db.candidates.find({"user_id": {"$in": user_ids}}, {"_id": 1}))
            for c in cands_from_users:
                matched_candidate_ids.add(str(c["_id"]))

        # Build candidate_id search variants
        cand_id_variants: List[Any] = []
        for cid in matched_candidate_ids:
            cand_id_variants.extend(_get_id_variants(cid))
            cand_id_variants.append(cid)

        # Candidate feedback documents match either the written feedback text OR the candidate
        or_clauses: List[Dict[str, Any]] = [
            {"additional_comments": search_regex}
        ]
        if cand_id_variants:
            or_clauses.append({"candidate_id": {"$in": cand_id_variants}})

        query["$or"] = or_clauses

    # Overall rating stats (Average Rating & Breakdown across all candidate feedback)
    breakdown_pipeline = [
        {"$group": {"_id": "$overall_rating", "count": {"$sum": 1}}}
    ]
    raw_breakdown = list(db.candidate_feedback.aggregate(breakdown_pipeline))
    breakdown_map = {1: 0, 2: 0, 3: 0, 4: 0, 5: 0}
    total_responses = 0
    total_rating_sum = 0
    for b in raw_breakdown:
        r = b.get("_id")
        cnt = b.get("count", 0)
        try:
            r_int = int(r)
            if 1 <= r_int <= 5:
                breakdown_map[r_int] += cnt
                total_responses += cnt
                total_rating_sum += r_int * cnt
        except (ValueError, TypeError):
            pass

    avg_rating = round(total_rating_sum / total_responses, 1) if total_responses > 0 else 0.0

    stats = {
        "averageRating": avg_rating,
        "totalResponses": total_responses,
        "breakdown": breakdown_map,
    }

    total = db.candidate_feedback.count_documents(query)

    feedback_cursor = (
        db.candidate_feedback.find(query)
        .sort("submitted_at", -1)
        .skip(offset)
        .limit(limit)
    )
    feedback_docs = list(feedback_cursor)

    if not feedback_docs:
        return {
            "success": True,
            "stats": stats,
            "feedbacks": [],
            "total": total,
            "limit": limit,
            "offset": offset,
        }

    # Bulk lookup candidates
    cand_ids = [f.get("candidate_id") for f in feedback_docs if f.get("candidate_id")]
    all_cand_variants: List[Any] = []
    for cid in cand_ids:
        all_cand_variants.extend(_get_id_variants(str(cid)))
        all_cand_variants.append(str(cid))

    cands = list(
        db.candidates.find(
            {"_id": {"$in": all_cand_variants}},
            {
                "full_name": 1,
                "name": 1,
                "email": 1,
                "phone": 1,
                "user_id": 1,
                "current_phase": 1,
                "current_role": 1,
                "state": 1,
                "district": 1,
            },
        )
    )

    cand_map: Dict[str, dict] = {}
    user_ids_to_fetch: List[Any] = []
    for c in cands:
        cand_map[str(c["_id"])] = c
        if c.get("user_id"):
            user_ids_to_fetch.append(c["user_id"])

    user_map: Dict[str, dict] = {}
    if user_ids_to_fetch:
        users = list(db.users.find({"_id": {"$in": user_ids_to_fetch}}, {"email": 1, "name": 1}))
        for u in users:
            user_map[str(u["_id"])] = u

    results = []
    for f in feedback_docs:
        cid = str(f.get("candidate_id", ""))
        cand = cand_map.get(cid, {})
        user_info = user_map.get(str(cand.get("user_id")), {}) if cand.get("user_id") else {}

        name = (
            cand.get("full_name")
            or cand.get("name")
            or user_info.get("name")
            or "Unknown Candidate"
        )
        email = cand.get("email") or user_info.get("email") or ""
        phone = cand.get("phone") or ""
        phase = cand.get("current_phase") or f.get("candidate_phase") or ""
        role = cand.get("current_role") or ""
        state = cand.get("state") or ""
        district = cand.get("district") or ""

        submitted_at = f.get("submitted_at")
        submitted_at_iso = _format_iso(submitted_at) if submitted_at else None

        results.append(
            {
                "id": str(f["_id"]),
                "candidateId": cid,
                "candidateName": name,
                "candidateEmail": email,
                "candidatePhone": phone,
                "candidatePhase": phase,
                "candidateRole": role,
                "candidateState": state,
                "candidateDistrict": district,
                "overallRating": f.get("overall_rating", 0),
                "additionalComments": f.get("additional_comments") or "",
                "submittedAt": submitted_at_iso,
            }
        )

    return {
        "success": True,
        "stats": stats,
        "feedbacks": results,
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@router.get("/feedbacks/{feedback_id}")
def get_feedback_detail(
    feedback_id: str,
    admin: dict = Depends(require_admin_auth),
):
    """Get single feedback detail by feedback id."""
    db = get_sync_db()

    fb = db.candidate_feedback.find_one({"_id": {"$in": _get_id_variants(feedback_id)}})
    if not fb:
        raise HTTPException(status_code=404, detail="Feedback not found")

    cid = str(fb.get("candidate_id", ""))
    cand = db.candidates.find_one({"_id": {"$in": _get_id_variants(cid)}}) or {}

    user_info = {}
    if cand.get("user_id"):
        user = db.users.find_one({"_id": {"$in": _get_id_variants(cand["user_id"])}})
        if user:
            user_info = user

    name = cand.get("full_name") or cand.get("name") or user_info.get("name") or "Unknown Candidate"
    email = cand.get("email") or user_info.get("email") or ""
    phone = cand.get("phone") or ""
    phase = cand.get("current_phase") or fb.get("candidate_phase") or ""

    return {
        "success": True,
        "feedback": {
            "id": str(fb["_id"]),
            "candidateId": cid,
            "candidateName": name,
            "candidateEmail": email,
            "candidatePhone": phone,
            "candidatePhase": phase,
            "candidateRole": cand.get("current_role") or "",
            "candidateState": cand.get("state") or "",
            "candidateDistrict": cand.get("district") or "",
            "overallRating": fb.get("overall_rating", 0),
            "additionalComments": fb.get("additional_comments") or "",
            "submittedAt": _format_iso(fb.get("submitted_at")),
        },
    }
