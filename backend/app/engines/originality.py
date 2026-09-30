"""
Originality Checker — semantic similarity screening against a prior-idea corpus.

Pipeline: idea text -> embedding -> FAISS nearest-neighbour search -> novelty score

Embedding model fallback chain (documented, not silent):
1. Sentence-BERT (`all-MiniLM-L6-v2`) if sentence-transformers + model weights
   are available (needs one-time internet access to huggingface.co).
2. TF-IDF vectors as a semantic-similarity-lite fallback, so the pipeline
   still runs end-to-end offline. Swap step (1) back in by installing
   sentence-transformers on a machine with internet — no other code changes.

Vector search: FAISS `IndexFlatIP` over L2-normalized vectors — inner product
on unit vectors is mathematically equivalent to cosine similarity, so this is
a genuine nearest-neighbour search via FAISS, not just a label. Flat (exact,
brute-force) index is the right choice at this corpus size; swap for an
IVF/HNSW index only if the corpus grows into the tens of thousands.

IMPORTANT: similarity is a screening signal, not proof of plagiarism.
High-similarity cases are routed to human-in-the-loop review before any
flag reaches the student (see routers/idea.py).
"""
import numpy as np
import faiss
from typing import List, Dict
from sklearn.feature_extraction.text import TfidfVectorizer

try:
    from sentence_transformers import SentenceTransformer
    _MODEL = SentenceTransformer("all-MiniLM-L6-v2")
    EMBEDDING_MODE = "sentence-bert"
except Exception:
    _MODEL = None
    EMBEDDING_MODE = "tfidf-fallback"

HIGH_SIMILARITY_THRESHOLD = 0.55  # above this -> human-in-the-loop review


def _embed_all(texts: List[str]) -> np.ndarray:
    if EMBEDDING_MODE == "sentence-bert":
        vecs = _MODEL.encode(texts, convert_to_numpy=True, normalize_embeddings=True)
        vecs = np.ascontiguousarray(vecs.astype("float32"))
    else:
        # TF-IDF fallback: fit on the full corpus so the query and corpus share a vocabulary
        vec = TfidfVectorizer()
        vecs = vec.fit_transform(texts).toarray()
        vecs = np.ascontiguousarray(vecs.astype("float32"))
        faiss.normalize_L2(vecs)  # so inner product == cosine similarity here too
    return vecs


def check_originality(idea_title: str, idea_description: str, corpus: List) -> Dict:
    idea_text = f"{idea_title}. {idea_description}"

    if not corpus:
        return {
            "noveltyScore": 100.0,
            "topSimilarity": 0.0,
            "status": "novel",
            "matches": [],
            "embeddingMode": EMBEDDING_MODE,
            "searchBackend": "faiss",
        }

    corpus_texts = [f"{c.title}. {c.description}" for c in corpus]
    all_texts = [idea_text] + corpus_texts
    vectors = _embed_all(all_texts)

    query_vec = vectors[0:1]
    corpus_vecs = vectors[1:]

    # Real FAISS nearest-neighbour search — not a brute-force sklearn fallback.
    dim = corpus_vecs.shape[1]
    index = faiss.IndexFlatIP(dim)
    index.add(corpus_vecs)
    k = min(5, corpus_vecs.shape[0])
    sims, idxs = index.search(query_vec, k)
    sims, idxs = sims[0], idxs[0]

    matches = []
    for score, i in zip(sims, idxs):
        matches.append({
            "id": corpus[i].id,
            "title": corpus[i].title,
            "description": corpus[i].description[:200],
            "similarity": round(float(score) * 100, 1),
            "source": corpus[i].source,
        })

    top_similarity = float(sims[0]) if len(sims) else 0.0
    novelty_score = round((1 - top_similarity) * 100, 1)

    if top_similarity >= HIGH_SIMILARITY_THRESHOLD:
        status = "needs_review"
    elif top_similarity >= 0.35:
        status = "worth_reviewing"
    else:
        status = "novel"

    return {
        "noveltyScore": novelty_score,
        "topSimilarity": round(top_similarity * 100, 1),
        "status": status,
        "matches": matches,
        "embeddingMode": EMBEDDING_MODE,
        "searchBackend": "faiss",
    }
