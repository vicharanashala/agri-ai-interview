"""
FAQ Service — in-memory TF-IDF style similarity search.
No external vector DB needed; uses sklearn TfidfVectorizer for relevance matching.
"""
from typing import List, Dict, Any
import re
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from app.llm.service import llm_service


# Seeded FAQ knowledge base
FAQ_KB: List[Dict[str, Any]] = [
    {
        "id": "f1",
        "category": "Internship",
        "question": "What internships are available at Annam?",
        "answer": "Annam offers internships in agricultural field operations, agronomy research, supply chain management, digital marketing, and software development. Check the careers page or ask your hiring coordinator for current openings.",
    },
    {
        "id": "f2",
        "category": "Internship",
        "question": "How long do internships last?",
        "answer": "Internship durations vary by role — typically 3 to 6 months. Some positions may extend based on performance and business need.",
    },
    {
        "id": "f3",
        "category": "Documents",
        "question": "What documents do I need to submit?",
        "answer": "You will need to submit: (1) A valid government-issued ID (Aadhaar/PAN/voter ID), (2) Educational certificates, (3) Any relevant experience or skill certificates, (4) Your updated resume. All documents should be in PDF or image format.",
    },
    {
        "id": "f4",
        "category": "Documents",
        "question": "How do I upload my documents?",
        "answer": "After registering and logging in, go to your profile section. You will find an option to upload documents. Supported formats are PDF, JPG, and PNG. Each file must be under 10MB.",
    },
    {
        "id": "f5",
        "category": "Eligibility",
        "question": "What is the eligibility criteria for internships?",
        "answer": "Eligibility varies by role. Generally, you need to be currently enrolled in or recently graduated from a relevant educational program (agriculture, engineering, business, etc.). Some roles require prior farming experience or specific language skills.",
    },
    {
        "id": "f6",
        "category": "Eligibility",
        "question": "Is there an age limit to apply?",
        "answer": "There is no strict age limit. We evaluate all candidates based on skills, experience, and fit for the role. If you have relevant experience and the right attitude, we encourage you to apply.",
    },
    {
        "id": "f7",
        "category": "Salary",
        "question": "Are the internships paid?",
        "answer": "Most internships at Annam come with a stipend. The amount depends on the role, your experience level, and the duration. Stipends are paid monthly upon successful completion of each month. Details are shared during the offer stage.",
    },
    {
        "id": "f8",
        "category": "Salary",
        "question": "When will I receive my salary or stipend?",
        "answer": "Stipends are processed at the end of each month. You will receive it in your registered bank account via NEFT/IMPS. Make sure your bank details are updated in your profile.",
    },
    {
        "id": "f9",
        "category": "Process",
        "question": "How does the interview process work?",
        "answer": "The process has 5 phases: (1) Warm-up — introduction and motivation questions, (2) Technical — agricultural knowledge and farming practices, (3) Problem Solving — scenario-based questions, (4) Behavioral — situational questions, (5) Closing — you can ask questions. The interview has 10 questions and takes 20-35 minutes.",
    },
    {
        "id": "f10",
        "category": "General",
        "question": "Who do I contact for support?",
        "answer": "For any issues, email support@annam.com or call our helpline. For interview-specific queries, reach out to your hiring coordinator directly. We typically respond within 24 hours on business days.",
    },
]


def _tokenize(text: str) -> List[str]:
    """Simple word tokenization."""
    return re.findall(r"\b\w+\b", text.lower())


def _score(query: str, doc_text: str) -> float:
    """Compute a simple TF-IDF-like relevance score."""
    query_tokens = set(_tokenize(query))
    doc_tokens = _tokenize(doc_text)
    if not query_tokens:
        return 0.0
    matches = sum(1 for t in query_tokens if t in doc_text.lower())
    # Frequency score
    freq = sum(1 for t in doc_tokens if t in query_tokens)
    # Length normalization penalty
    norm = 1.0 / (len(doc_tokens) + 1)
    return matches * 0.6 + freq * norm * 10


async def search_faqs(query: str, top_k: int = 5, category: str = None) -> List[Dict[str, Any]]:
    """
    Search FAQs using simple TF-IDF-like matching.
    Falls back to keyword matching if TF-IDF fails.
    """
    docs = FAQ_KB
    if category:
        docs = [d for d in docs if d["category"].lower() == category.lower()]

    scored = []
    for doc in docs:
        # Combine question and answer for matching
        text = f"{doc['question']} {doc['answer']}"
        score = _score(query, text)
        # Bonus for exact question word match
        if any(w.lower() in doc["question"].lower() for w in _tokenize(query)):
            score += 1.0
        scored.append((score, doc))

    scored.sort(key=lambda x: x[0], reverse=True)
    return [
        {
            "id": doc["id"],
            "category": doc["category"],
            "question": doc["question"],
            "answer": doc["answer"],
            "relevance_score": round(score, 2),
        }
        for score, doc in scored[:top_k]
        if score > 0
    ]


def get_categories() -> List[str]:
    """Return all FAQ categories."""
    return sorted(set(d["category"] for d in FAQ_KB))


async def answer_faq_question(user_question: str) -> Dict[str, Any]:
    """
    Find similar FAQs, then use the LLM to craft a short, human-centric answer
    as if a student is asking the question.
    """
    # Find top-5 similar FAQs to use as context
    matches = await search_faqs(user_question, top_k=5)

    # Build context string from matched FAQs
    faq_context = "\n".join(
        f"Q: {m['question']}\nA: {m['answer']}"
        for m in matches
    )

    prompt = f"""You are a friendly, helpful assistant for students applying to internships at Annam, an AI-powered agricultural interview platform.

Below are the most relevant Q&A pairs from our FAQ knowledge base:

{faq_context}

Now a student is asking: "{user_question}"

Instructions:
- Answer in 2-4 short sentences maximum
- Be warm, friendly, and encouraging — like talking to a curious student
- If the matched FAQs partially answer the question, combine and simplify the info
- If no FAQ matches well, give a helpful general answer based on the context above
- Do NOT sound corporate or robotic
- Answer in English
- Do not mention the FAQ database or that you're using reference material

Student's question: "{user_question}"
Your answer:"""

    try:
        answer = await llm_service.chat_completion(
            messages=[{"role": "user", "content": prompt}],
            temperature=0.7,
            max_tokens=300,
        )
    except Exception as e:
        answer = f"I'm sorry, I couldn't process your question right now. Please try again or email support@annam.com."

    return {
        "answer": answer.strip(),
        "matched_faqs": matches,
    }


def get_all_faqs() -> List[Dict[str, Any]]:
    """Return all FAQs grouped by category."""
    cats = {}
    for d in FAQ_KB:
        cats.setdefault(d["category"], []).append({
            "id": d["id"],
            "question": d["question"],
            "answer": d["answer"],
        })
    return [{"category": cat, "faqs": items} for cat, items in cats.items()]