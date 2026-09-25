import os
from app.db.mongodb import get_sync_db
from .classify import Classifier
from app.core.config import settings

# Global singleton
_classifier = None

def get_classifier():
    global _classifier
    if _classifier is None:
        # Expected path in docker container
        store_path = os.environ.get("DOC_REFERENCES_PATH", "/app/references.npz")
        if not os.path.exists(store_path):
            store_path = os.path.join(os.path.dirname(__file__), "references.npz")
        _classifier = Classifier(store_path)
    return _classifier

def validate_document_background(doc_id: str, field_name: str, file_bytes: bytes, filename: str):
    """
    Background task to run AI document validation and update DB.
    """
    try:
        classifier = get_classifier()
        # Only Aadhaar and PAN are configured with anchors for now, but embeddings can handle others if enrolled.
        # Check if the field_name maps to a known type (e.g., 'aadhaar_front' -> 'aadhaar')
        expected_type = None
        if 'aadhaar' in field_name.lower():
            expected_type = 'aadhaar'
        elif 'pan' in field_name.lower():
            expected_type = 'pan'

        result = classifier.classify(file_bytes, filename)
        
        # Determine status
        is_valid = False
        status = "unknown"
        if result.doc_type:
            if expected_type and result.doc_type == expected_type:
                is_valid = True
                status = "valid"
            elif expected_type and result.doc_type != expected_type:
                is_valid = False
                status = "invalid"
            else:
                # If we don't have an expected type for this field but it matched something
                status = "matched_other"
        
        db = get_sync_db()
        db.candidate_documents.update_one(
            {"_id": doc_id},
            {"$set": {
                "ai_validation": {
                    "doc_type": result.doc_type,
                    "confidence": round(result.confidence, 4),
                    "method": result.method,
                    "reason": result.reason,
                    "is_valid": is_valid,
                    "status": status
                }
            }}
        )
    except Exception as e:
        import traceback
        traceback.print_exc()
        db = get_sync_db()
        db.candidate_documents.update_one(
            {"_id": doc_id},
            {"$set": {
                "ai_validation": {
                    "status": "error",
                    "reason": str(e)
                }
            }}
        )
