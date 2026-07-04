import json

import numpy as np

from .catalog import load_catalog
from .paths import EMBEDDING_IDS_JSON, EMBEDDINGS_NPY, EXCERPTS_DIR

MODEL = "intfloat/multilingual-e5-small"


def doc_text(book: dict, excerpt: str) -> str:
    subjects = "; ".join(book.get("subjects", [])[:8])
    return f"passage: {book['title']}. {subjects}. {excerpt[:6000]}"


def run() -> None:
    if EMBEDDINGS_NPY.exists():
        print("embeddings cached, skipping")
        return
    from sentence_transformers import SentenceTransformer

    books = load_catalog()
    texts, ids = [], []
    for b in books:
        f = EXCERPTS_DIR / f"{b['id']}.txt"
        texts.append(doc_text(b, f.read_text() if f.exists() else ""))
        ids.append(b["id"])
    model = SentenceTransformer(MODEL)
    emb = model.encode(texts, batch_size=32, show_progress_bar=True,
                       normalize_embeddings=True)
    np.save(EMBEDDINGS_NPY, emb.astype(np.float32))
    EMBEDDING_IDS_JSON.write_text(json.dumps(ids))
