import torch
torch.set_num_threads(1)
from sentence_transformers import SentenceTransformer

_model = None

def get_model():
    global _model
    if _model is None:
        try:
            _model = SentenceTransformer("intfloat/multilingual-e5-base", device="cpu")
        except Exception:
            _model = None
    return _model

def embed(text: str):
    model = get_model()
    if not model:
        import numpy as np
        return np.zeros(768, dtype=np.float32)
    return model.encode(
        f"passage: {text}" if text else "passage: ",
        convert_to_numpy=True,
        normalize_embeddings=True,
    )
