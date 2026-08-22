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
    # ── General ─────────────────────────────────────────────────────────────
    {
        "id": "gen-1",
        "category": "General",
        "question": "What is Anveshan?",
        "answer": "Anveshan is Annam/ACE's online platform for finding, assessing, and onboarding people to work on agricultural AI and farmer-support projects. It handles the entire journey — from application to joining.",
    },
    {
        "id": "gen-2",
        "category": "General",
        "question": "What are the two ways to join?",
        "answer": "You can join as a Young Professional (YP), a full-time role for candidates with an approved agriculture qualification, or as an Agri Intern, a structured internship mainly for students. You don't need to choose — the platform decides your initial category based on the qualification you enter.",
    },
    {
        "id": "gen-3",
        "category": "General",
        "question": "Do I need to decide myself whether I'm a YP or an Intern?",
        "answer": "No. As soon as you select your qualification on the platform, it automatically shows you the category (YP or Intern) you qualify for, along with the stipend. This is only an initial indication — your final eligibility still depends on verification and the selection process.",
    },

    # ── Eligibility & Category ──────────────────────────────────────────────
    {
        "id": "elig-1",
        "category": "Eligibility & Category",
        "question": "Which qualifications make me eligible for the Young Professional category?",
        "answer": "You are placed in the Young Professional category if you hold one of the following qualifications:\n• B.Sc. (Hons.) Agriculture\n• M.Sc. Agronomy\n• M.Sc. Soil Science & Agricultural Chemistry\n• M.Sc. Horticulture (with a B.Sc. Agriculture background)\n• M.Sc. Entomology\n• M.Sc. Plant Pathology\n• M.Sc. Agrometeorology\n• M.Sc. Post-Harvest Technology\n• M.Sc. Extension & Communication\n• M.Sc. Genetics & Plant Breeding\n• M.Sc. Seed Science & Technology\n• Diploma in Agriculture (treated the same as the qualifications above)",
    },
    {
        "id": "elig-2",
        "category": "Eligibility & Category",
        "question": "I'm still studying — can I apply?",
        "answer": "Yes. Students currently pursuing an eligible qualification can apply as Agri Interns. This also includes students who have completed three years of their course and are entering the fourth year.",
    },
    {
        "id": "elig-3",
        "category": "Eligibility & Category",
        "question": "My qualification isn't on the Young Professional list. Can I still apply?",
        "answer": "Yes. You will be placed in the Agri Intern category instead, with a stipend of ₹5,000/month. If your exact qualification isn't listed, select \"Other,\" type it in, and it will be verified before your application can proceed.",
    },
    {
        "id": "elig-4",
        "category": "Eligibility & Category",
        "question": "Is there an age limit for Agri Interns?",
        "answer": "No specific age limit applies to Agri Interns, as long as academic, NOC, and other eligibility requirements are met.",
    },
    {
        "id": "elig-5",
        "category": "Eligibility & Category",
        "question": "Can I apply from anywhere in India?",
        "answer": "Yes, candidates from anywhere in India can apply, subject to eligibility and project requirements.",
    },
    {
        "id": "elig-6",
        "category": "Eligibility & Category",
        "question": "Does being shown a category and stipend mean I'm selected?",
        "answer": "No. This is only an initial, system-generated indication based on your qualification. Final eligibility and selection depend on verification and the complete selection process.",
    },

    # ── No-Objection Certificate (NOC) ──────────────────────────────────────
    {
        "id": "noc-1",
        "category": "No-Objection Certificate (NOC)",
        "question": "Do I need an NOC to apply as an Agri Intern?",
        "answer": "Yes, if you are currently studying. A valid NOC from your institution is mandatory, no matter which year of study you're in.",
    },
    {
        "id": "noc-2",
        "category": "No-Objection Certificate (NOC)",
        "question": "What happens if my NOC expires during the internship?",
        "answer": "You will need to submit a renewed, valid NOC to continue the internship. The organisation may also directly verify your NOC's authenticity with your institution.",
    },

    # ── Stipend & Duration ──────────────────────────────────────────────────
    {
        "id": "stip-1",
        "category": "Stipend & Duration",
        "question": "How much is the stipend?",
        "answer": "Young Professionals receive ₹20,000 per month. Agri Interns receive ₹5,000 per month.",
    },
    {
        "id": "stip-2",
        "category": "Stipend & Duration",
        "question": "How long does the engagement last?",
        "answer": "• For Young Professionals: The initial engagement is 2 months, and it may be extended up to 6 months after a performance review, subject to project needs and organisational approval.\n• For Agri Interns: The minimum period is 3 months, and it may be extended up to the completion of your academic degree, depending on performance, project needs, and approval.",
    },
    {
        "id": "stip-3",
        "category": "Stipend & Duration",
        "question": "Is the stipend guaranteed regardless of attendance or performance?",
        "answer": "No. The stipend is subject to meeting the required attendance, working hours, and performance standards, as set out in your Letter of Engagement (LOE).",
    },
    {
        "id": "stip-4",
        "category": "Stipend & Duration",
        "question": "What document will I receive at the end?",
        "answer": "Agri Interns receive an Internship Completion Certificate (no separate Experience Letter is issued). Young Professionals may receive an Experience Letter as per the organisation's standard process.",
    },

    # ── Work Model, Hours & Schedule ────────────────────────────────────────
    {
        "id": "work-1",
        "category": "Work Model, Hours & Schedule",
        "question": "Is the internship remote or in-office?",
        "answer": "The Agri Intern role is mainly remote. Regular office attendance is not generally required. On-site work happens only occasionally, when a specific project needs it.",
    },
    {
        "id": "work-2",
        "category": "Work Model, Hours & Schedule",
        "question": "What do I need to arrange myself as an Agri Intern?",
        "answer": "You will need to arrange the following yourself:\n• A laptop or desktop computer\n• A reliable internet connection\n• A suitable, quiet place to work",
    },
    {
        "id": "work-3",
        "category": "Work Model, Hours & Schedule",
        "question": "How many hours do I need to work as an Agri Intern?",
        "answer": "A minimum of 3 hours on each working day. You choose your working time from the slots the organisation makes available on the Resource Allocation Platform — you cannot set arbitrary hours of your own choosing.",
    },
    {
        "id": "work-4",
        "category": "Work Model, Hours & Schedule",
        "question": "How far in advance can I book my work slots?",
        "answer": "You can book a slot for the next day, for a full week ahead, or for a full month ahead — based on what the organisation has made available. Not booking a slot in advance may be treated as an absence.",
    },
    {
        "id": "work-5",
        "category": "Work Model, Hours & Schedule",
        "question": "Can I change a slot I've already confirmed?",
        "answer": "Yes, but you need prior approval from your reporting manager before making any change.",
    },
    {
        "id": "work-6",
        "category": "Work Model, Hours & Schedule",
        "question": "What are the working days for Agri Interns?",
        "answer": "The normal working week is Monday to Saturday. Your weekly off can be noted as a preference on the Resource Allocation Platform, but the organisation makes the final decision.",
    },
    {
        "id": "work-7",
        "category": "Work Model, Hours & Schedule",
        "question": "What are the working hours/shifts for Young Professionals?",
        "answer": "YPs work on a defined shift roster:\n• Morning shift: 6:00 AM – 3:00 PM\n• Evening shift: 3:00 PM – 12:00 AM\nThere is no YP shift between 12:00 AM and 6:00 AM, as farmer calls are not received during this window under the current model.",
    },
    {
        "id": "work-8",
        "category": "Work Model, Hours & Schedule",
        "question": "Do Young Professionals work weekends?",
        "answer": "Saturdays, Sundays, and even public holidays can be working days for YPs, as required. Weekly offs are given on a rotational basis as per the roster.",
    },
    {
        "id": "work-9",
        "category": "Work Model, Hours & Schedule",
        "question": "Can I adjust my schedule around exams or academic commitments?",
        "answer": "Yes, for Agri Interns. Exams and mandatory academic commitments may allow a temporary schedule adjustment, but any change still needs prior approval, and the minimum working-hour requirement still applies unless specifically waived.",
    },

    # ── Performance Reviews ─────────────────────────────────────────────────
    {
        "id": "perf-1",
        "category": "Performance Reviews",
        "question": "How often is my performance reviewed?",
        "answer": "Agri Interns are reviewed every 15 days (fortnightly). Young Professionals are reviewed as per the organisation's standard performance process, including a formal review at the end of the initial 2-month period.",
    },
    {
        "id": "perf-2",
        "category": "Performance Reviews",
        "question": "What happens if my performance isn't up to the mark?",
        "answer": "The process generally follows these steps:\n1. You receive feedback and a chance to improve.\n2. For serious or repeated concerns, a formal Performance Improvement Period (PIP) may be used.\n3. If there's still no improvement, your engagement may be ended in line with your Letter of Engagement and organisational policy.",
    },

    # ── Selection Process ───────────────────────────────────────────────────
    {
        "id": "sel-1",
        "category": "Selection Process",
        "question": "What are the steps in the selection process?",
        "answer": "Application → Eligibility Verification → AI Interview → VIBE Course → Document Scrutiny → Final Selection. Every candidate, whether YP or Intern, goes through this same overall process.",
    },
    {
        "id": "sel-2",
        "category": "Selection Process",
        "question": "What does the AI Interview assess?",
        "answer": "It looks at the following:\n• Communication skills\n• Suitability for the role\n• Problem-solving ability\n• Relevant knowledge and skills\n• Fluency in English and an Indian/regional language\n\nThe AI supports this assessment, but it does not make the final hiring decision on its own — that is done by the organisation's selection team.",
    },
    {
        "id": "sel-3",
        "category": "Selection Process",
        "question": "Do I need to know more than one language?",
        "answer": "Yes. Both YPs and Interns need to be proficient in English and at least one Indian/regional language. You'll declare this yourself when applying, and it will be checked during the AI Interview.",
    },
    {
        "id": "sel-4",
        "category": "Selection Process",
        "question": "What is the VIBE Course, and is it compulsory?",
        "answer": "The VIBE Course is a mandatory course for both YPs and Interns. You have 7 days from your VIBE registration date to complete it, and you can make multiple attempts within that window. If you don't complete it in time, you cannot move to the next stage of selection.",
    },
    {
        "id": "sel-5",
        "category": "Selection Process",
        "question": "What documents will I need to submit?",
        "answer": "Typically, you'll need to provide:\n• Educational certificates and mark sheets\n• NOC (if you're currently studying)\n• Government-issued ID, where required\n• Any other document the organisation may request\n\nIf any required document is missing, your application will be placed On Hold, and you'll be given a deadline to submit it.",
    },
    {
        "id": "sel-6",
        "category": "Selection Process",
        "question": "Will the organisation verify my information?",
        "answer": "Yes. The organisation may carry out due diligence, including verifying your NOC with your institution and checking other information you've provided. Your consent for this is collected during the AI Interview.",
    },
    {
        "id": "sel-7",
        "category": "Selection Process",
        "question": "How long does it take to get a final decision?",
        "answer": "You will be informed of the final outcome within 15 days of completing the selection process, subject to document verification and other requirements.",
    },
    {
        "id": "sel-8",
        "category": "Selection Process",
        "question": "If I'm selected, how soon do I need to join?",
        "answer": "You're expected to join within 7 days of receiving your selection communication. In special cases, the organisation may approve an extension. Your offer remains valid for 15 days from the date it's communicated.",
    },
    {
        "id": "sel-9",
        "category": "Selection Process",
        "question": "Can an offer be withdrawn?",
        "answer": "Yes, the organisation may withdraw or cancel an offer based on organisational needs, verification findings, project changes, or other valid circumstances.",
    },

    # ── Application Status & Results ────────────────────────────────────────
    {
        "id": "stat-1",
        "category": "Application Status & Results",
        "question": "How can I check my application status?",
        "answer": "You can track your status on your Anveshan dashboard at any time. The stages shown are:\n• Applied\n• Eligibility Verification\n• AI Interview\n• VIBE Course\n• Document Scrutiny\n• Selected / Not Selected\n• On Hold (only if required information or documents are pending)",
    },
    {
        "id": "stat-2",
        "category": "Application Status & Results",
        "question": "Will I be notified at every stage?",
        "answer": "Currently, notifications are sent only for the final outcome — Selected or Not Selected. For status updates at earlier stages, please check your dashboard.",
    },
    {
        "id": "stat-3",
        "category": "Application Status & Results",
        "question": "If I'm not selected, will I be told why?",
        "answer": "The platform will show \"Not Selected\" without detailed reasons. If you were disqualified specifically at the first stage (Level 1) based on your AI Interview score, you may be eligible for the Request Revaluation option.",
    },

    # ── Revaluation ─────────────────────────────────────────────────────────
    {
        "id": "rev-1",
        "category": "Revaluation",
        "question": "What is revaluation, and who can request it?",
        "answer": "Revaluation is a specific option only for candidates disqualified at the first stage (Level 1) based on their AI Interview score. It is separate from the general support ticketing system, and is not available for later-stage decisions.",
    },
    {
        "id": "rev-2",
        "category": "Revaluation",
        "question": "How do I request a revaluation?",
        "answer": "If you're eligible, you'll see a \"Request Revaluation\" button directly on your application — you don't need to raise a support ticket. You can only submit this request once per application.",
    },
    {
        "id": "rev-3",
        "category": "Revaluation",
        "question": "How long does revaluation take?",
        "answer": "In most cases, the AI revaluation runs automatically and immediately after you submit your request. If it can't be completed automatically, a manual revaluation is done within 7 days.",
    },
    {
        "id": "rev-4",
        "category": "Revaluation",
        "question": "Is the revaluation result final?",
        "answer": "The AI-generated result is advisory, and the organisation's team may still review it. If the revaluation is successful, you'll receive instructions for the next stage. If it's unsuccessful, the result — \"Revaluation Completed – Not Selected\" — is final for that application.",
    },

    # ── Support & Reapplying ────────────────────────────────────────────────
    {
        "id": "sup-1",
        "category": "Support & Reapplying",
        "question": "Who do I contact if I face an issue with my application?",
        "answer": "You can raise a ticket through Anveshan's Ticketing System for issues like document submission problems, later-stage queries, or any other application-related question. (For a Level 1 AI Interview revaluation specifically, use the Request Revaluation button instead of a ticket.)",
    },
    {
        "id": "sup-2",
        "category": "Support & Reapplying",
        "question": "Can I withdraw my application?",
        "answer": "Yes, you can withdraw your application at any point before joining.",
    },
    {
        "id": "sup-3",
        "category": "Support & Reapplying",
        "question": "Can I reapply if I wasn't selected?",
        "answer": "Yes, you can reapply once a new, relevant opportunity becomes available. Note that the platform prevents duplicate applications for the same opportunity.",
    },
    {
        "id": "sup-4",
        "category": "Support & Reapplying",
        "question": "Can I reuse my existing profile for a new application?",
        "answer": "Yes, if you already have an Anveshan profile, you can reuse it for a new opportunity instead of creating a new account.",
    },

    # ── Conduct, Confidentiality & Data ─────────────────────────────────────
    {
        "id": "conf-1",
        "category": "Conduct, Confidentiality & Data",
        "question": "What confidentiality rules do I need to follow?",
        "answer": "You must maintain strict confidentiality at all times. Farmer data, personal data, and restricted organisational data must never be copied, downloaded, shared, or disclosed, except as needed for your authorised work. Confidentiality/NDA terms apply as specified by the organisation.",
    },
    {
        "id": "conf-2",
        "category": "Conduct, Confidentiality & Data",
        "question": "Can I use external AI tools for my work?",
        "answer": "You must not upload or share organisational data, farmer data, personal data, or confidential information with any external AI tool or platform unless it has been explicitly authorised.",
    },
    {
        "id": "conf-3",
        "category": "Conduct, Confidentiality & Data",
        "question": "Who owns the work I create during my internship or engagement?",
        "answer": "All work you create as part of your role — including content, data, documentation, code, models, and test results — belongs to the organisation, subject to your LOE/NDA and applicable law.",
    },
    {
        "id": "conf-4",
        "category": "Conduct, Confidentiality & Data",
        "question": "Can I showcase my work on my CV, portfolio, or LinkedIn?",
        "answer": "You may mention your association with Annam/Anveshan and describe your experience in general, non-confidential terms. However, you must not publicly share screenshots, internal documents, data, code, system details, farmer information, or other internal material.",
    },
    {
        "id": "conf-5",
        "category": "Conduct, Confidentiality & Data",
        "question": "What happens if I misuse my access to systems or data?",
        "answer": "This is reviewed case-by-case and, depending on severity, may lead to your access being revoked, disciplinary action, or your internship/engagement being ended.",
    },

    # ── Terms & Consent ─────────────────────────────────────────────────────
    {
        "id": "terms-1",
        "category": "Terms & Consent",
        "question": "Do I need to accept any terms before applying?",
        "answer": "Yes. You must review the complete Terms & Conditions applicable to your category (YP or Intern) and confirm you understand them before your application can proceed.",
    },
    {
        "id": "terms-2",
        "category": "Terms & Consent",
        "question": "Do I need to give consent for my data to be used?",
        "answer": "Yes, a mandatory consent checkbox must be ticked before you submit your application, allowing your information to be used for recruitment and selection purposes. If you wish to withdraw this consent later, this is handled case-by-case.",
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