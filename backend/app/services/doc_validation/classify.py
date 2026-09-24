import re
from dataclasses import dataclass, field
from pathlib import Path
import numpy as np
from typing import Optional, Dict

from .ocr import load_as_image, ocr_transcript
from .embed import embed
from .enrol import normalise_text

ACCEPT = 0.78
MARGIN = 0.015
MIN_CHARS = 20

ANCHORS = {
    # Anchors disabled: We want to strictly enforce Front vs Back using Embeddings.
    # Simple regex keywords (like "UIDAI") cannot tell if it's the front or back of the card.
}

@dataclass
class Result:
    doc_type: Optional[str]
    confidence: float
    method: str
    scores: Dict[str, float] = field(default_factory=dict)
    transcript: str = ""
    reason: str = ""

class Classifier:
    def __init__(self, store_path: str = "references.npz"):
        self.ready = False
        try:
            blob = np.load(store_path, allow_pickle=False)
            self.R = blob["vectors"]
            self.labels = [str(x) for x in blob["labels"]]
            self.types = sorted(set(self.labels))
            self.rows = {t: np.array([i for i, l in enumerate(self.labels) if l == t])
                         for t in self.types}
            self.ready = True
        except Exception:
            pass

    def _anchor_match(self, raw_text: str) -> Optional[str]:
        low = raw_text.lower()
        hits = [t for t, pats in ANCHORS.items()
                if any(re.search(p, low) for p in pats)]
        return hits[0] if len(hits) == 1 else None

    def _embedding_scores(self, text: str) -> Dict[str, float]:
        q = embed(text)
        if not self.ready or q.sum() == 0:
            return {}
        sims = self.R @ q
        return {t: float(sims[idx].max()) for t, idx in self.rows.items()}

    def classify(self, data: bytes, filename: str, ocr_lang: str = "hin") -> Result:
        try:
            img = load_as_image(data, filename)
        except Exception as e:
            return Result(None, 0.0, "unreadable", reason=f"Could not load image: {e}")
            
        raw = ocr_transcript(img, ocr_lang)
        text = normalise_text(raw)
        
        # Log the cleaned text to the console so we can verify what the AI actually sees
        print(f"\n[AI Validation Debug] Text after OCR and Normalization (Sent to Embedding):\n{text}\n" + "-"*60 + "\n")

        if len(text) < MIN_CHARS:
            return Result(None, 0.0, "unreadable", transcript=raw,
                          reason=f"OCR produced only {len(text)} usable characters")

        hit = self._anchor_match(raw)
        if hit:
            return Result(hit, 1.0, "anchor", transcript=raw,
                          reason="unambiguous printed anchor text")

        scores = self._embedding_scores(text)
        if not scores:
            return Result(None, 0.0, "unreadable", transcript=raw, reason="No reference scores available")
            
        ranked = sorted(scores.items(), key=lambda kv: kv[1], reverse=True)
        
        # Log the calculated scores so we can see why it accepted or rejected
        print(f"\n[AI Validation Debug] Semantic Scores: {ranked}\n")

        (top_type, top), (_, second) = ranked[0], (ranked[1] if len(ranked) > 1 else ("", 0.0))

        if top < ACCEPT:
            return Result(None, top, "embedding", scores, raw,
                          f"best match {top_type} at {top:.4f} is below ACCEPT={ACCEPT}")
        if top - second < MARGIN:
            return Result(None, top, "embedding", scores, raw,
                          f"ambiguous: {ranked[0][0]} {top:.4f} vs "
                          f"{ranked[1][0]} {second:.4f}, margin < {MARGIN}")

        return Result(top_type, top, "embedding", scores, raw, "clear nearest neighbour")
