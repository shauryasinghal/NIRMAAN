"""Originality analysis: idea → 384-d MiniLM embedding → pgvector cosine search → explainable verdict.

This module is the model + the decision logic. Vector search itself is a pgvector query (see
services/originality.py). There is no keyword/TF-IDF stand-in: if the embedding model cannot load, the
feature reports itself unavailable rather than inventing a score.

Semantic similarity is a screening signal, NOT proof of plagiarism, and "no match" only ever means no
significant match *in the current comparison corpus* — the wording below never claims an idea is "100% original".
"""
from __future__ import annotations

import re
import threading
from typing import Protocol

from ..core.logging import get_logger

log = get_logger("originality")
MODEL_TAG = "all-MiniLM-L6-v2"
DISCLAIMER = "Semantic similarity is a screening signal, not proof of plagiarism."


class EmbeddingUnavailable(RuntimeError):
    pass


class Embedder(Protocol):
    name: str
    dim: int
    def encode(self, texts: list[str]) -> list[list[float]]: ...


class MiniLMEmbedder:
    """Loaded once per process (lazily, thread-safe) — never per request."""
    name, dim = MODEL_TAG, 384

    def __init__(self, model_id: str = "sentence-transformers/all-MiniLM-L6-v2"):
        self.model_id, self._model, self._lock = model_id, None, threading.Lock()

    def _load(self):
        if self._model is None:
            with self._lock:
                if self._model is None:
                    try:
                        from sentence_transformers import SentenceTransformer
                        self._model = SentenceTransformer(self.model_id)
                        log.info("embedding model loaded", extra={"event": "model_loaded", "source": self.model_id})
                    except Exception as exc:  # missing package, no weights, no network …
                        log.error("embedding model failed to load", extra={"event": "model_load_failed", "code": type(exc).__name__})
                        raise EmbeddingUnavailable("The embedding model is not available on this server.") from exc
        return self._model

    def encode(self, texts: list[str]) -> list[list[float]]:
        vecs = self._load().encode(texts, normalize_embeddings=True, convert_to_numpy=True, show_progress_bar=False)
        return [v.tolist() for v in vecs]


_embedder: Embedder | None = None


def get_embedder() -> Embedder:
    global _embedder
    if _embedder is None:
        from ..core.config import get_settings
        _embedder = MiniLMEmbedder(get_settings().embedding_model)
    return _embedder


def set_embedder(e: Embedder | None) -> None:   # tests / alternative backends
    global _embedder
    _embedder = e


def embedding_available() -> bool:
    e = get_embedder()
    try:
        if isinstance(e, MiniLMEmbedder):
            e._load()
        return True
    except EmbeddingUnavailable:
        return False


def idea_text(title: str, description: str) -> str:
    return f"{title.strip()}. {description.strip()}"


_STOP = set("a an the and or of to in on for with by from at as is are be this that it its into your our their using use based app platform system tool web mobile students student campus".split())


def shared_terms(a: str, b: str, n: int = 6) -> list[str]:
    tok = lambda t: {w for w in re.findall(r"[a-z][a-z0-9+#\-]{2,}", t.lower()) if w not in _STOP}
    return sorted(tok(a) & tok(b))[:n]


def classify(top: float | None, corpus_size: int, review_thr: float, related_thr: float) -> dict:
    """Level, user-facing message and confidence — all derived from the top cosine similarity and corpus size."""
    if top is None or corpus_size == 0:
        return {"level": "no_corpus", "needsReview": False, "confidence": "low",
                "label": "No comparison corpus available",
                "message": "There is nothing to compare against yet, so no originality signal can be given. " + DISCLAIMER}
    if top >= review_thr:
        level, label, needs = "high_overlap", "Substantial semantic overlap", True
        msg = "This idea is semantically very close to existing work and has been queued for human review."
    elif top >= related_thr:
        level, label, needs = "related_work", "Related prior work found", False
        msg = "Related ideas exist in the corpus. A similar topic does not make an idea unoriginal — compare the matches below."
    else:
        level, label, needs = "no_significant_match", "No significant match found", False
        msg = "No significant semantic match found in the current comparison corpus."
    if corpus_size < 20:
        confidence = "low"
    elif top >= review_thr + 0.1 or top <= related_thr - 0.15:
        confidence = "high"
    else:
        confidence = "medium"
    return {"level": level, "needsReview": needs, "confidence": confidence, "label": label, "message": f"{msg} {DISCLAIMER}"}


def overlap_dimensions(title: str, description: str, domain: str | None, match: dict, title_similarity: float | None) -> dict:
    return {
        "semantic": round(match["similarity"], 3),
        "title": None if title_similarity is None else round(title_similarity, 3),
        "sameDomain": (domain == match.get("domain")) if domain and match.get("domain") else None,
        "sharedTerms": shared_terms(f"{title} {description}", f"{match['title']} {match['description']}"),
    }
