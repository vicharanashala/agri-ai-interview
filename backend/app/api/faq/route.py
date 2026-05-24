"""
FAQ API Routes — candidate-facing FAQ assistant.
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List

from app.services.faq_service import search_faqs, get_categories, get_all_faqs, answer_faq_question


router = APIRouter(prefix="/api/faq", tags=["FAQ"])


class FAQQueryRequest(BaseModel):
    query: str
    top_k: Optional[int] = 5
    category: Optional[str] = None


class FAQItem(BaseModel):
    id: str
    category: str
    question: str
    answer: str
    relevance_score: Optional[float] = None


class FAQSearchResponse(BaseModel):
    results: List[FAQItem]
    total: int
    query: str


@router.get("/categories", response_model=List[str])
async def list_categories():
    """Return all available FAQ categories."""
    return get_categories()


@router.get("/all")
async def list_all_faqs():
    """Return all FAQs grouped by category."""
    return get_all_faqs()


@router.post("/query", response_model=FAQSearchResponse)
async def query_faq(request: FAQQueryRequest):
    """
    Search FAQs by natural language query.
    Returns top-k most relevant FAQ items.
    """
    if not request.query or len(request.query.strip()) < 2:
        raise HTTPException(status_code=400, detail="Query must be at least 2 characters")

    results = await search_faqs(
        query=request.query.strip(),
        top_k=request.top_k or 5,
        category=request.category,
    )

    return FAQSearchResponse(
        results=results,
        total=len(results),
        query=request.query,
    )


@router.get("/by-category/{category}")
async def get_faqs_by_category(category: str):
    """Return all FAQs for a specific category."""
    results = await search_faqs(query=" " + category, top_k=20, category=category)
    return {"category": category, "faqs": results}


class FAQAnswerRequest(BaseModel):
    question: str


@router.post("/answer")
async def answer_question(request: FAQAnswerRequest):
    """
    Find similar FAQs, then use the LLM to answer in a short,
    human-centric way as if a student is asking.
    """
    if not request.question or len(request.question.strip()) < 2:
        raise HTTPException(status_code=400, detail="Question must be at least 2 characters")

    result = await answer_faq_question(request.question.strip())
    return result