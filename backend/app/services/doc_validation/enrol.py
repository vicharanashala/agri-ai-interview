import argparse
import json
import re
import unicodedata
from pathlib import Path
import numpy as np
from typing import List, Dict

from .ocr import load_as_image, ocr_transcript
from .embed import embed

SUPPORTED = {".jpg", ".jpeg", ".png", ".pdf", ".tif", ".tiff", ".webp"}

SENSITIVE_WORDS = {
    "satya", "prakash", "harsh", "saini", "dharmwati", "veerpur", "fatehullahpur", "mevla", "kalan", 
    "burhan", "moradabad", "arvind", "roy", "shriganga", "niwas", "kailash", "puri", "kahara", "saharsa", 
    "mukhdeo", "yadav", "madhuri", "rpcau", "pusa", "samastipur", "balwan", "singh", "pinki", "rani", 
    "hmt", "pinjore", "kalka", "panchkula", "haryana", "malek", "faizan", "manjurahmed", "manjurahmad", 
    "abdulhamid", "amresh", "kumar", "bindu", "devi", "ujjwal", "chandraiya", "dalpat", "vishunpur", "pach", 
    "pokari", "dhaka", "champaran", "anurag", "raj", "om", "kumari", "pritam", "manoj", "sah", "vishal", 
    "bhatti", "muskan", "tembhare", "yogesh", "yogeshwari", "shiv", "shakti", "nagar", "raipura", "dharsiwa", 
    "raipur", "chhattisgarh", "deepanwita", "sadhukhan", "gobinda", "hari", "prasanna", "ambikabathi", 
    "nagaraj", "thanha", "mariyam", "shahida", "abdul", "gafoor", "karanam", "valappil", "paravanna", 
    "malappuram", "kerala", "tirur", "bihar", "uttar", "pradesh"
}

def normalise_text(text: str) -> str:
    text = unicodedata.normalize("NFKC", text)
    text = text.lower()
    text = re.sub(r"\d+", " ", text)
    text = re.sub(r"[^\w\s]+", " ", text, flags=re.UNICODE)
    
    # Strip all manually defined sensitive words (names, addresses)
    words = text.split()
    words = [w for w in words if w not in SENSITIVE_WORDS]
    return " ".join(words)

def enrol_references(references_dir: str, out_path: str, ocr_lang: str = "hin"):
    root = Path(references_dir)
    vectors: List[np.ndarray] = []
    labels: List[str] = []
    manifest: List[Dict] = []

    print(f"Starting enrolment from directory: {root.absolute()}")
    if not root.exists():
        print(f"ERROR: Directory '{root}' does not exist!")
        return

    total_processed = 0

    for type_dir in sorted(p for p in root.iterdir() if p.is_dir()):
        doc_type = type_dir.name
        samples = sorted(p for p in type_dir.iterdir() if p.suffix.lower() in SUPPORTED)
        if not samples:
            print(f"Skipping '{doc_type}' (no supported images found)")
            continue

        for sample in samples:
            print(f"Processing {doc_type} -> {sample.name}...", end=" ", flush=True)
            img = load_as_image(sample.read_bytes(), sample.name)
            raw = ocr_transcript(img, ocr_lang)
            text = normalise_text(raw)

            if len(text) < 20:
                print("FAILED (Not enough readable text)")
                continue

            vectors.append(embed(text))
            labels.append(doc_type)
            manifest.append({
                "doc_type": doc_type,
                "file": str(sample),
                "chars": len(text),
                "transcript": raw,
            })
            print(f"OK ({len(text)} chars)")
            total_processed += 1

    if vectors:
        print(f"\nSaving {total_processed} enrolled documents to {out_path}...")
        np.savez_compressed(
            out_path,
            vectors=np.asarray(vectors, dtype=np.float32),
            labels=np.asarray(labels),
        )
        Path(out_path).with_suffix(".manifest.json").write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        print("Success! Enrolment complete.")
    else:
        print("\nWARNING: No valid documents were found or successfully processed. No .npz file was created.")
