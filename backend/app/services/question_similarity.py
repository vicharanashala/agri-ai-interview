"""
Question Similarity and Deduplication Engine for AI Interview.

Prevents candidates from receiving duplicate questions or close rewordings
when they retake an assessment or across multiple interview attempts.
"""
import re
import difflib
from typing import Set, Tuple, List, Optional, Dict

# Synonym groups common in interview questions (maps variants to a canonical concept token)
SYNONYM_MAP: Dict[str, str] = {
    # Problems / Challenges
    "challenge": "challenge", "challenges": "challenge",
    "difficulty": "challenge", "difficulties": "challenge",
    "problem": "challenge", "problems": "challenge",
    "issue": "challenge", "issues": "challenge",
    "obstacle": "challenge", "obstacles": "challenge",
    
    # Practices / Methods
    "practice": "method", "practices": "method",
    "method": "method", "methods": "method",
    "technique": "method", "techniques": "method",
    "strategy": "method", "strategies": "method",
    "step": "method", "steps": "method",
    "measure": "method", "measures": "method",
    "approach": "method", "approaches": "method",
    "way": "method", "ways": "method",
    "system": "method", "systems": "method",

    # Actions
    "manage": "manage", "management": "manage", "managing": "manage",
    "control": "manage", "controlling": "manage",
    "handle": "manage", "handling": "manage",
    "treat": "manage", "treatment": "manage",
    "prevent": "prevent", "prevention": "prevent", "preventing": "prevent",
    "curb": "manage", "tackle": "manage", "combat": "manage",

    # Agricultural domains
    "farm": "farm", "farming": "farm", "farmer": "farm",
    "field": "farm", "fields": "farm", "land": "farm",
    "crop": "crop", "crops": "crop", "produce": "crop", "plant": "crop", "plants": "crop",
    "water": "irrigate", "watering": "irrigate", "irrigation": "irrigate", "irrigate": "irrigate",
    "fertilizer": "nutrient", "fertilizers": "nutrient", "fertiliser": "nutrient", "fertilisers": "nutrient",
    "fertilization": "nutrient", "nutrient": "nutrient", "nutrients": "nutrient",
    "disease": "disease", "diseases": "disease", "blight": "disease", "fungus": "disease",
    "insect": "pest", "insects": "pest", "pest": "pest", "pests": "pest",
    "yield": "harvest", "harvest": "harvest", "harvesting": "harvest",
}

# Generic conversational / interview boilerplate phrases
BOILERPLATE_PATTERNS = [
    r"^hello\b.*?[,.]\s*",
    r"^welcome\b.*?[,.]\s*",
    r"^(?:could|can) you (?:please )?(?:tell|explain|describe|share|walk me through|discuss|outline)\b.*?\b(?:about|regarding|on)?\s*",
    r"^please (?:tell|explain|describe|share|walk me through|discuss|outline)\b.*?\b(?:about|regarding|on)?\s*",
    r"^tell (?:me|us) (?:about|regarding)?\s*",
    r"^what (?:steps|methods|measures|strategies|practices|techniques|ways) do you (?:take|use|employ|follow|apply) (?:to|for)?\s*",
    r"^how do you (?:handle|manage|control|deal with|approach|tackle|address)\b\s*",
    r"^what (?:challenges|difficulties|problems|issues) do you (?:face|encounter|experience)\b.*?\b(?:with|in|when|regarding)?\s*",
    r"^what challenges have you faced (?:with|in|regarding)?\s*",
    r"^in your (?:opinion|experience|view|words)\b[, ]*",
    r"\b(?:in|on) your (?:farm|fields|land|crops|area|region)\b",
    r"\b(?:throughout|across|during) the (?:year|season)\b",
    r"\band why\??$",
]

STOP_WORDS = {
    "a", "about", "above", "after", "again", "against", "all", "am", "an", "and", "any", "are",
    "as", "at", "be", "because", "been", "before", "being", "below", "between", "both", "but",
    "by", "can", "could", "did", "do", "does", "doing", "down", "during", "each", "few", "for",
    "from", "further", "had", "has", "have", "having", "he", "her", "here", "hers", "herself",
    "him", "himself", "his", "how", "i", "if", "in", "into", "is", "it", "its", "itself", "just",
    "me", "more", "most", "my", "myself", "no", "nor", "not", "of", "off", "on", "once", "only",
    "or", "other", "our", "ours", "ourselves", "out", "over", "own", "s", "same", "she", "should",
    "so", "some", "such", "than", "that", "the", "their", "theirs", "them", "themselves", "then",
    "there", "these", "they", "this", "those", "through", "to", "too", "under", "until", "up",
    "very", "was", "we", "were", "what", "when", "where", "which", "while", "who", "whom", "why",
    "will", "with", "would", "you", "your", "yours", "yourself", "yourselves",
    # Interview fillers
    "tell", "describe", "explain", "share", "discuss", "mention", "briefly", "please",
    "encounter", "faced", "facing", "take", "using", "used", "use", "apply", "give", "example",
    "follow", "following", "followed", "employ", "employed", "employing",
}

STEM_SUFFIXES = [
    ("ational", "ate"), ("tional", "tion"), ("enci", "ence"), ("anci", "ance"),
    ("izer", "ize"), ("bli", "ble"), ("alli", "al"), ("entli", "ent"),
    ("eli", "e"), ("ousli", "ous"), ("ization", "ize"), ("ation", "ate"),
    ("ator", "ate"), ("alism", "al"), ("iveness", "ive"), ("fulness", "ful"),
    ("ousness", "ous"), ("aliti", "al"), ("iviti", "ive"), ("biliti", "ble"),
    ("ing", ""), ("ed", ""), ("es", ""), ("s", ""),
]

def clean_text(text: str) -> str:
    """Normalize text: lowercase, strip punctuation, normalize whitespace."""
    if not text:
        return ""
    t = text.lower().strip()
    t = re.sub(r"[^\w\s]", " ", t)
    t = re.sub(r"\s+", " ", t).strip()
    return t

def strip_boilerplate(text: str) -> str:
    """Strip common interview opening/closing boilerplate phrases."""
    t = text.lower().strip()
    for pattern in BOILERPLATE_PATTERNS:
        t = re.sub(pattern, "", t, flags=re.IGNORECASE).strip()
    return t

def stem_word(w: str) -> str:
    """Lightweight rule-based stemmer."""
    if len(w) <= 3:
        return w
    for suff, repl in STEM_SUFFIXES:
        if w.endswith(suff) and len(w) - len(suff) >= 3:
            return w[:-len(suff)] + repl
    return w

def canonicalize_token(token: str) -> str:
    """Map token through synonym map or stemmer."""
    w = token.lower()
    if w in SYNONYM_MAP:
        return SYNONYM_MAP[w]
    stemmed = stem_word(w)
    if stemmed in SYNONYM_MAP:
        return SYNONYM_MAP[stemmed]
    return stemmed

def extract_content_words(text: str) -> Set[str]:
    """Extract canonical content concepts from a question."""
    cleaned = clean_text(strip_boilerplate(text))
    words = cleaned.split()
    content = set()
    for w in words:
        if w not in STOP_WORDS and len(w) > 2:
            canon = canonicalize_token(w)
            if canon not in STOP_WORDS:
                content.add(canon)
    return content

def char_trigrams(text: str) -> Set[str]:
    """Extract character trigrams."""
    clean = re.sub(r"[^\w]", "", text.lower())
    if len(clean) < 3:
        return {clean}
    return {clean[i:i+3] for i in range(len(clean) - 2)}

def jaccard_similarity(set_a: Set[str], set_b: Set[str]) -> float:
    if not set_a or not set_b:
        return 0.0
    return len(set_a & set_b) / len(set_a | set_b)

def calculate_question_similarity(q1: str, q2: str) -> float:
    """
    Compute a composite similarity score between two questions in [0.0, 1.0].
    
    Takes into account:
    - Exact match / boilerplate-stripped exact match
    - Canonical content concept Jaccard & containment
    - Character trigram similarity
    - SequenceMatcher string alignment
    - Token-sort alignment
    """
    if not q1 or not q2:
        return 0.0
    
    clean1 = clean_text(q1)
    clean2 = clean_text(q2)
    if clean1 == clean2:
        return 1.0

    stripped1 = clean_text(strip_boilerplate(q1))
    stripped2 = clean_text(strip_boilerplate(q2))
    if stripped1 and stripped2 and stripped1 == stripped2:
        return 0.98

    content1 = extract_content_words(q1)
    content2 = extract_content_words(q2)
    
    content_jaccard = jaccard_similarity(content1, content2)
    
    content_containment = 0.0
    if content1 and content2:
        min_len = min(len(content1), len(content2))
        content_containment = len(content1 & content2) / min_len

    seq_ratio = difflib.SequenceMatcher(None, stripped1 or clean1, stripped2 or clean2).ratio()
    
    tri1 = char_trigrams(stripped1 or clean1)
    tri2 = char_trigrams(stripped2 or clean2)
    tri_jaccard = jaccard_similarity(tri1, tri2)
    
    tokens1 = sorted((stripped1 or clean1).split())
    tokens2 = sorted((stripped2 or clean2).split())
    token_sort_ratio = difflib.SequenceMatcher(None, " ".join(tokens1), " ".join(tokens2)).ratio()

    # Composite weighted score
    composite = (
        0.40 * content_jaccard +
        0.25 * content_containment +
        0.15 * seq_ratio +
        0.10 * tri_jaccard +
        0.10 * token_sort_ratio
    )
    
    # Strong boost if core concepts are heavily overlapping
    if content_containment >= 0.70 and len(content1 & content2) >= 2:
        composite = max(composite, 0.75)
    elif content_containment >= 0.60 and content_jaccard >= 0.40 and len(content1 & content2) >= 2:
        composite = max(composite, 0.70)
        
    return min(1.0, composite)

DEFAULT_SIMILARITY_THRESHOLD = 0.60

def is_duplicate_or_similar(
    candidate_question: str,
    target_questions: List[str],
    threshold: float = DEFAULT_SIMILARITY_THRESHOLD
) -> Tuple[bool, Optional[str], float]:
    """
    Check if candidate_question is duplicate or closely similar to any question in target_questions.
    
    Returns:
        (is_similar: bool, matched_target_question: Optional[str], score: float)
    """
    if not candidate_question or not target_questions:
        return False, None, 0.0
    
    highest_score = 0.0
    matched_q = None
    
    for target in target_questions:
        score = calculate_question_similarity(candidate_question, target)
        if score > highest_score:
            highest_score = score
            matched_q = target
        if score >= threshold:
            return True, target, score
            
    return (highest_score >= threshold), matched_q, highest_score
