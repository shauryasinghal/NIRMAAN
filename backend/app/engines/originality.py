"""Originality analysis: idea → 384-d MiniLM embedding → pgvector cosine search → explainable verdict.

This module is the model + the decision logic. Vector search itself is a pgvector query (see
services/originality.py). There is no keyword/TF-IDF stand-in: if the embedding model cannot load, the
feature reports itself unavailable rather than inventing a score.

Semantic similarity is a screening signal, NOT proof of plagiarism, and "no match" only ever means no
significant match *in the current comparison corpus* — the wording below never claims an idea is "100% original".
"""
from __future__ import annotations

import math
import re
import threading
import unicodedata
from dataclasses import dataclass
from typing import Callable, Protocol

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

    @property
    def max_tokens(self) -> int:
        return int(self._load().max_seq_length)

    def count_tokens(self, text: str) -> int:
        """Word-pieces the model would see for `text`, including its special tokens — exactly what max_seq_length is measured against."""
        return len(self._load().tokenizer(text, add_special_tokens=True, truncation=False, verbose=False)["input_ids"])

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
# Words that appear in most ideas: shown last (or not at all) so shared *topic* words and phrases lead the explanation.
_GENERIC = _STOP | set("idea ideas new smart simple easy help helps allow allows provide provides solution solutions users user data real time make makes can will may also more most such than then them they these those what when where which while who you have has".split())
_UNSPACED = ("CJK", "HIRAGANA", "KATAKANA", "THAI", "LAO", "KHMER", "MYANMAR", "TIBETAN")   # scripts written without spaces between words
_CLAUSE_BREAK = re.compile(r"[.!?;:,()\n。！？；：，、（）]+")


def _is_unspaced(ch: str) -> bool:
    try:
        return unicodedata.name(ch).startswith(_UNSPACED)
    except ValueError:
        return False


def _walk(text: str, joiners: str = "") -> tuple[list[str], int]:
    """Unicode-aware tokeniser. Letters, digits and combining marks (matras, accents, Thai vowel signs) build tokens; everything else separates them;
    invisible format characters (zero-width joiners, direction marks) are ignored. Text is NFKC-normalised and case-folded first, so é/é,
    full-width forms and Straße/STRASSE compare equal. Scripts written without spaces (Han, kana, Thai, …) yield one token per character,
    which makes word n-grams over them character n-grams. Returns (tokens, how many of them are such single characters)."""
    tokens: list[str] = []
    cur: list[str] = []
    singles = 0
    for ch in unicodedata.normalize("NFKC", text).casefold():
        cat = unicodedata.category(ch)
        if cat == "Cf":
            continue
        if cat[0] in "LN" and _is_unspaced(ch):
            if cur: tokens.append("".join(cur)); cur = []
            tokens.append(ch); singles += 1
        elif cat[0] == "M" and not cur and tokens and len(tokens[-1]) == 1 and _is_unspaced(tokens[-1]):
            tokens[-1] += ch                                  # a Thai vowel/tone mark stays with its consonant
        elif cat[0] in "LNM" or (cur and ch in joiners):
            cur.append(ch)
        elif cur:
            tokens.append("".join(cur)); cur = []
    if cur:
        tokens.append("".join(cur))
    return tokens, singles


def _words(text: str) -> list[str]:
    return _walk(text)[0]


def word_count(text: str) -> int:
    """Meaningful tokens in `text` (0 for punctuation-, emoji- or zero-width-only input). Used for input validation: a Chinese sentence has many
    tokens, a run of one repeated letter has one."""
    return len(_walk(text)[0])


def _terms(t: str) -> list[str]:
    toks, _ = _walk(t, joiners="+#-")
    return [t for t in (w.strip("-") for w in toks) if len(t) >= 3 and t not in _STOP]


def _phrases(a: str, b: str) -> list[str]:
    """Contiguous 2–4 word phrases present in both texts (stop-words may sit inside, not at the edges), longest first. Not produced for
    unspaced scripts (single characters are not informative phrases)."""
    segs = lambda t: [_words(x) for x in _CLAUSE_BREAK.split(t)]     # phrases never span punctuation
    grams = lambda t, n: {tuple(ws[i:i + n]) for ws in segs(t) for i in range(len(ws) - n + 1)}
    found: list[tuple[str, ...]] = []
    for n in (4, 3, 2):
        for g in sorted(grams(a, n) & grams(b, n)):
            if g[0] in _GENERIC or g[-1] in _GENERIC or sum(w not in _GENERIC and len(w) > 2 for w in g) < 2:
                continue
            if not any(set(zip(g, g[1:])) <= set(zip(f, f[1:])) and len(f) > len(g) for f in found):   # drop phrases inside a longer one
                found.append(g)
    return [" ".join(g) for g in sorted(found, key=lambda g: (-len(g), -sum(map(len, g)), g))]


def shared_phrases(a: str, b: str, n: int = 3) -> list[str]:
    return _phrases(a, b)[:n]


def shared_terms(a: str, b: str, n: int = 6, exclude_phrases: list[str] | None = None) -> list[str]:
    """Words both texts use, most informative first: topic words repeated in both texts, then longer (more specific) words, generic words are dropped.
    Words already shown as part of a shared phrase are skipped."""
    ca, cb = {}, {}
    for w in _terms(a): ca[w] = ca.get(w, 0) + 1
    for w in _terms(b): cb[w] = cb.get(w, 0) + 1
    covered = {w for p in (exclude_phrases or []) for w in p.split()}
    common = [w for w in ca.keys() & cb.keys() if w not in covered and w not in _GENERIC]
    return sorted(common, key=lambda w: (-min(ca[w], cb[w]), -len(w), w))[:n]


# ── Wording (lexical) overlap — an interpretable companion to the semantic score, never a verdict on its own ──────────────
SHINGLE = 3             # word 3-grams: two unrelated ideas rarely share them even when they share vocabulary
SHINGLE_UNSPACED = 6    # …and 6-character runs for text written without spaces (Chinese, Japanese, Thai)
MIN_SHINGLES = 5        # shorter texts are too small for overlap statistics to mean anything
NEAR_JACCARD = 0.5      # ≥ half of all shingles shared (a handful of edited words in a short idea)
NEAR_CONTAINMENT = 0.8  # almost all of the shorter text is contained in the longer one (copy plus padding)
MIN_EXACT_TOKENS = 4    # "identical wording" needs real content: ≥ 4 tokens and ≥ 12 letters/digits. Two-word titles are not evidence of anything.
MIN_EXACT_CHARS = 12


def wording_overlap(a: str, b: str) -> dict:
    """Word-sequence overlap between two texts (Unicode-aware, see _walk). `signal` is "exact" (same tokens after normalisation, and enough of
    them to mean something), "near_duplicate", or None. Always a supporting signal: callers must also require semantic relatedness."""
    (wa, sa), (wb, sb) = _walk(a), _walk(b)
    n = SHINGLE_UNSPACED if max(sa / max(len(wa), 1), sb / max(len(wb), 1)) > 0.5 else SHINGLE
    sh = lambda ws: {tuple(ws[i:i + n]) for i in range(len(ws) - n + 1)}
    A, B = sh(wa), sh(wb)
    inter = len(A & B)
    jac = inter / len(A | B) if A | B else 0.0
    con = inter / min(len(A), len(B)) if A and B else 0.0
    if wa and wa == wb and len(wa) >= MIN_EXACT_TOKENS and sum(map(len, wa)) >= MIN_EXACT_CHARS:
        signal = "exact"
    elif min(len(A), len(B)) >= MIN_SHINGLES and (jac >= NEAR_JACCARD or con >= NEAR_CONTAINMENT):
        signal = "near_duplicate"
    else:
        signal = None
    return {"jaccard": round(jac, 3), "containment": round(con, 3), "signal": signal}


def best_wording(title_a: str, desc_a: str, title_b: str, desc_b: str) -> dict:
    """Wording overlap of the whole idea AND of the description alone (a copied description under a new title is the obvious disguise); the stronger wins."""
    rank = {"exact": 2, "near_duplicate": 1, None: 0}
    whole = {**wording_overlap(idea_text(title_a, desc_a), idea_text(title_b, desc_b)), "scope": "title and description"}
    desc = {**wording_overlap(desc_a, desc_b), "scope": "description"}
    return max(whole, desc, key=lambda w: (rank[w["signal"]], w["jaccard"], w["containment"]))


def duplicate_signal(pairs: list[tuple[float, str | None]], related_thr: float) -> str | None:
    """Strongest wording signal among matches that are ALSO semantically related. Wording alone is never enough:
    shared boilerplate with no semantic closeness is ignored."""
    sigs = [sig for sim, sig in pairs if sig and sim >= related_thr]
    return "exact" if "exact" in sigs else ("near_duplicate" if sigs else None)


# ── Long inputs: the model silently ignores everything past max_seq_length word-pieces (256 for MiniLM) ───────────────────
# Lengths are measured in the model's own tokens, never in words: a 120-word idea full of URLs is ~1,200 tokens and an unspaced Chinese
# paragraph has one "word". When the real tokenizer is unavailable a deliberately pessimistic estimate is used and the result is never
# reported as verified-complete.
MAX_SECTIONS = 10


@dataclass(frozen=True)
class TokenBudget:
    count: Callable[[str], int]     # tokens the model would see, special tokens included
    limit: int                      # the model's max sequence length
    verified: bool                  # True only when `count` is the model's own tokenizer


def estimate_tokens(text: str) -> int:
    """Pessimistic token estimate for when the real tokenizer is unavailable. Over-counts ordinary English (~1.5–2×) on purpose; letters-and-digits
    runs (ids, hashes, versions) and every punctuation or non-ASCII character cost about a token each, as the real tokenizer's word-pieces do.
    Checked against the real tokenizer on English, Devanagari, Arabic, Chinese, Japanese, Korean, emoji, URLs, code and identifier-like strings (see tests); scripts not listed are unchecked."""
    est = 0.0
    for run in re.findall(r"[A-Za-z0-9]+|\S", text):
        if run.isascii() and run.isalnum():
            est += len(run) * (0.4 if run.isalpha() else 1.0)
        elif run.isascii():
            est += 1.0
        else:
            est += 3.0 if "\uac00" <= run <= "\ud7a3" else 1.25        # the model's tokenizer splits each Hangul syllable into its jamo
    return math.ceil(est) + 2


def token_budget(embedder) -> TokenBudget:
    try:
        counter, limit = getattr(embedder, "count_tokens", None), getattr(embedder, "max_tokens", None)
        if counter and limit:
            counter("probe")
            return TokenBudget(counter, int(limit), True)
    except Exception:                                   # weights missing etc. — the caller's encode() reports that; here we just fall back
        pass
    return TokenBudget(estimate_tokens, 256, False)


def chunk_idea(title: str, description: str, budget: TokenBudget | None = None) -> tuple[list[str], dict]:
    """Texts to embed for one idea: the whole idea first (unchanged behaviour for ideas that fit), then — only when it does not fit the model's
    window — sentence-packed sections of the description, each prefixed with the title (shortened if the title itself is huge) and each
    verified to fit. One short sentence overlaps between neighbouring sections; matches are merged per existing idea (see merge_matches), so
    the overlap cannot produce duplicate matches.

    Coverage: `complete` is True only if the model's own tokenizer verified that every part of the idea is inside some text that fits the window.
    It is False when the idea needs more than MAX_SECTIONS sections (the rest is not compared) and whenever only the estimate was available."""
    budget = budget or TokenBudget(estimate_tokens, 256, False)
    count, limit = budget.count, budget.limit
    title, description = title.strip(), description.strip()
    full = idea_text(title, description)
    total = count(full)
    cov = {"words": word_count(full), "tokens": total, "limit": limit, "verified": "tokenizer" if budget.verified else "estimate"}
    if total <= limit:
        return [full], {**cov, "sections": 1, "sectionsNeeded": 1, "complete": budget.verified}

    head = title
    while len(head) > 1 and count(head + ". ") > limit // 3:      # an enormous title must not crowd the body out of every section
        head = head[:max(1, int(len(head) * 0.8))].rstrip()
    prefix = f"{head}. "
    room = limit - count(prefix)

    def split_fit(piece: str) -> list[str]:
        if count(prefix + piece) <= limit or len(piece) <= 1:
            return [piece]
        words = piece.split()
        if len(words) > 1:
            m = len(words) // 2
            a, b = " ".join(words[:m]), " ".join(words[m:])
        else:                                            # no spaces to cut at (Chinese, Japanese, long identifiers, URLs)
            a, b = piece[:len(piece) // 2], piece[len(piece) // 2:]
        return split_fit(a) + split_fit(b)

    units: list[tuple[str, int]] = []
    for sent in re.split(r"(?<=[.!?])\s+|(?<=[。！？])|\n+", description):
        if sent.strip():
            units += [(u, max(count(u) - 2, 1)) for u in split_fit(sent.strip())]

    sections: list[list[tuple[str, int]]] = []
    cur: list[tuple[str, int]] = []
    used = 0
    for u in units:
        if cur and used + u[1] > room:
            sections.append(cur)
            tail = cur[-1]
            cur, used = ([tail], tail[1]) if tail[1] <= room // 4 else ([], 0)      # carry one short sentence over
            if used + u[1] > room:
                cur, used = [], 0
        cur.append(u); used += u[1]
    if cur:
        sections.append(cur)

    texts: list[str] = []
    for sec in sections:
        text = prefix + " ".join(t for t, _ in sec)
        # additive costs can be off by a token at joins; the real count has the last word, and single units are already known to fit
        texts += [text] if count(text) <= limit else [prefix + t for t, _ in sec]
    needed = len(texts)
    texts = texts[:MAX_SECTIONS]
    return [full] + texts, {**cov, "sections": len(texts), "sectionsNeeded": needed, "complete": budget.verified and needed <= MAX_SECTIONS}


def merge_matches(result_lists: list[list[dict]], limit: int) -> list[dict]:
    """Merge per-section search results into one list with each existing idea at most once (its best section wins). Deterministic order."""
    best: dict[str, dict] = {}
    for section, rows in enumerate(result_lists):
        for r in rows:
            if r["idea_id"] not in best or r["similarity"] > best[r["idea_id"]]["similarity"]:
                best[r["idea_id"]] = {**r, "section": section}
    return sorted(best.values(), key=lambda r: (-r["similarity"], r["idea_id"]))[:limit]


def classify(top: float | None, corpus_size: int, review_thr: float, related_thr: float, wording: str | None = None) -> dict:
    """Level, user-facing message and confidence — derived from the top cosine similarity and corpus size. `wording` (see duplicate_signal)
    can only lift a result that is already semantically related to human review; it never creates a signal by itself."""
    if top is None or corpus_size == 0:
        return {"level": "no_corpus", "needsReview": False, "confidence": "low",
                "label": "No comparison corpus available",
                "message": "There is nothing to compare against yet, so no originality signal can be given. " + DISCLAIMER}
    if top >= review_thr:
        level, label, needs = "high_overlap", "Substantial semantic overlap", True
        msg = "This idea is semantically very close to existing work and has been queued for human review."
        if wording:
            msg = ("The wording is identical to an existing idea and it is semantically very close, so it has been queued for human review." if wording == "exact"
                   else "The wording closely follows an existing idea and it is semantically very close, so it has been queued for human review.")
    elif wording and top >= related_thr:
        level, label, needs = "high_overlap", "Substantial semantic overlap", True
        msg = ("The wording is identical to an existing idea that is also semantically related, so it has been queued for human review." if wording == "exact"
               else "The wording closely follows an existing idea that is also semantically related, so it has been queued for human review.")
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
    mine, theirs = f"{title} {description}", f"{match['title']} {match['description']}"
    phrases = shared_phrases(mine, theirs)
    return {
        "semantic": round(match["similarity"], 3),
        "title": None if title_similarity is None else round(title_similarity, 3),
        "sameDomain": (domain == match.get("domain")) if domain and match.get("domain") else None,
        "sharedTerms": shared_terms(mine, theirs, exclude_phrases=phrases),
        "sharedPhrases": phrases,
        "wording": best_wording(title, description, match["title"], match["description"]),
    }
