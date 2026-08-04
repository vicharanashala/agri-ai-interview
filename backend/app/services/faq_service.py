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
        "category": "Eligibility",
        "question": "Who is eligible to apply for internships on Anveshan?",
        "answer": "Eligibility varies depending on the internship. Each opportunity specifies the required educational qualifications, skills, experience (if any), and other eligibility criteria. Please review the job description carefully before applying.",
    },
    {
        "id": "f2",
        "category": "Documents",
        "question": "How do I upload or update my resume and other documents?",
        "answer": "Log in to your Anveshan account and navigate to your profile or application section. You can upload or update your resume and supporting documents before submitting your application.",
    },
    {
        "id": "f3",
        "category": "Process",
        "question": "How does the AI interview process work?",
        "answer": "Once your application is submitted and shortlisted, you will be invited to complete an AI-powered interview. The interview is conducted in a chat-based format, where you respond to a series of role-specific questions. Your responses are evaluated using AI-assisted assessment, and may also be reviewed by the hiring team.",
    },
    {
        "id": "f4",
        "category": "Process",
        "question": "How long does the interview take?",
        "answer": "Each interview session lasts 30 minutes. However, if you have completed all your responses and are satisfied with your submissions, you may end the interview before the allotted time.",
    },
    {
        "id": "f5",
        "category": "Process",
        "question": "Can I pause and resume my interview later?",
        "answer": "No. Once you start your interview, it must be completed in a single uninterrupted session within the allotted 30 minutes.",
    },
    {
        "id": "f6",
        "category": "Process",
        "question": "Can I retake my interview?",
        "answer": "Yes. Each candidate is provided with up to three attempts to successfully complete the interview. The best valid submission will be considered for evaluation.",
    },
    {
        "id": "f7",
        "category": "Process",
        "question": "How is my interview evaluated?",
        "answer": "Your interview is evaluated using AI-assisted assessment based on criteria such as technical knowledge, problem-solving ability, communication skills, and the relevance of your responses. In addition, the review team may evaluate your interview before making the final selection decision.",
    },
    {
        "id": "f8",
        "category": "Process",
        "question": "What are the anti-cheat guidelines?",
        "answer": "To ensure a fair evaluation for all candidates, the interview must be taken in fullscreen mode and without any of the following actions: switching tabs or leaving the interview window, exiting fullscreen, copying or pasting content, using right-click, selecting text, using multiple monitors, or remaining idle for an extended period. The first occurrence of any of these triggers results in a warning. A second occurrence of the same trigger immediately ends the interview. Each trigger is tracked independently — triggering two different violations counts as two separate warnings.",
    },
    {
        "id": "f9",
        "category": "Process",
        "question": "When and how will I receive my interview results?",
        "answer": "Your interview score and feedback will be available instantly on the Anveshan platform after you complete your interview.",
    },
    {
        "id": "f10",
        "category": "Salary",
        "question": "Are the internships paid?",
        "answer": "Yes. The internships offered through this recruitment drive are paid. Details regarding the stipend and other benefits are provided in the respective Job Description (JD) for the Young Professional role.",
    },
    {
        "id": "f11",
        "category": "Process",
        "question": "What is the Foundation Course? Is it mandatory to complete it?",
        "answer": "The Foundation Course is a prerequisite learning module hosted on the ViBe platform designed to familiarize candidates with important concepts and the skills required for the role. Yes, completing the Foundation Course is mandatory before proceeding with the internship selection process. Candidates who successfully complete the course become eligible for the subsequent stages of recruitment.",
    },
    {
        "id": "f12",
        "category": "Privacy",
        "question": "How is my personal data and interview recording protected?",
        "answer": "Anveshan securely stores and processes your personal information and interview recordings. They are used solely for recruitment purposes and are accessible only to authorized personnel, in accordance with our privacy and data protection policies.",
    },
    {
        "id": "f13",
        "category": "Support",
        "question": "Who should I contact if I face technical issues or need support?",
        "answer": "If you experience any technical issues during registration, application, or the interview, please contact our support team at annam.ajrasakha@gmail.com. Our team will assist you as soon as possible.",
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