"""Originality engine evaluation on a labelled set.

  positives  : 24 paraphrases of ideas that ARE in the corpus (each should retrieve its source)
  negatives  : 24 genuinely unrelated ideas (nothing in the corpus should match)
  hard set   : 12 paraphrases that deliberately avoid the source's wording (where semantic search must beat keywords)
  baseline   : keyword-overlap (Jaccard) retrieval — the "fake originality" approach this engine replaces

Reports recall@1, false-positive rate, and precision/recall/F1 across thresholds so the shipped defaults
(related ≥ 0.55, review ≥ 0.75) are justified by data rather than asserted.   python -m eval.originality_eval
"""
from __future__ import annotations

import json
import re
from pathlib import Path

import numpy as np

from app.core.config import get_settings
from app.engines import originality as eng

FX = Path(__file__).resolve().parents[1] / "fixtures"
STOP = set("a an the and or of to in on for with by from at as is are be this that it its into your our their using use based app platform system tool students student campus".split())


def tokens(t: str) -> set[str]:
    return {w for w in re.findall(r"[a-z][a-z0-9]{2,}", t.lower()) if w not in STOP}


def run() -> dict:
    ref = json.loads((FX / "ideas.reference.dev.json").read_text())
    ev = json.loads((FX / "originality_eval.json").read_text())
    emb = eng.get_embedder()
    ref_vecs = np.array(emb.encode([eng.idea_text(r["title"], r["description"]) for r in ref]))
    ref_tok = [tokens(r["title"] + " " + r["description"]) for r in ref]
    ref_index = {r["title"]: i for i, r in enumerate(ref)}

    def query(title: str, desc: str):
        v = np.array(emb.encode([eng.idea_text(title, desc)])[0])
        sims = ref_vecs @ v
        t = tokens(title + " " + desc)
        jac = np.array([len(t & rt) / max(len(t | rt), 1) for rt in ref_tok])
        return sims, jac

    pos = [(ref_index[src], *query(t, d)) for src, t, d in ev["paraphrases"]]
    hard = [(ref_index[src], *query(t, d)) for src, t, d in ev["hard_paraphrases"]]
    neg = [query(t, d) for t, d in ev["unrelated"]]
    r1_emb = float(np.mean([int(np.argmax(s)) == i for i, s, _ in pos]))
    r1_jac = float(np.mean([int(np.argmax(j)) == i for i, _, j in pos]))
    top_pos = np.array([s.max() for _, s, _ in pos]); top_neg = np.array([s.max() for s, _ in neg])
    jpos = np.array([j.max() for _, _, j in pos]); jneg = np.array([j.max() for _, j in neg])

    def prf(p, n, thr):
        tp, fn, fp = int((p >= thr).sum()), int((p < thr).sum()), int((n >= thr).sum())
        prec = tp / (tp + fp) if tp + fp else 1.0; rec = tp / (tp + fn)
        return {"threshold": round(float(thr), 2), "precision": round(prec, 3), "recall": round(rec, 3), "f1": round(2 * prec * rec / (prec + rec), 3) if prec + rec else 0.0,
                "falsePositiveRate": round(fp / len(n), 3)}

    table = [prf(top_pos, top_neg, t) for t in np.arange(0.35, 0.86, 0.05)]
    best_j = max((prf(jpos, jneg, t) for t in np.arange(0.05, 0.6, 0.025)), key=lambda x: x["f1"])
    hs = np.array([s.max() for _, s, _ in hard]); hj = np.array([j.max() for _, _, j in hard])
    hard_report = {"n": len(hard), "recall_at_1": {"minilm_pgvector": float(np.mean([int(np.argmax(s)) == i for i, s, _ in hard])), "keyword_baseline": float(np.mean([int(np.argmax(j)) == i for i, _, j in hard]))},
                   "flagged_as_related_or_above": {"threshold": get_settings().similarity_related_threshold, "minilm_pgvector": float((hs >= get_settings().similarity_related_threshold).mean()), "keyword_baseline_at_best_threshold": float((hj >= best_j["threshold"]).mean())},
                   "mean_top_similarity": float(hs.mean()), "keyword_mean_top_jaccard": float(hj.mean()), "shared_word_note": "hard paraphrases deliberately avoid the source's vocabulary"}
    return {"hard": hard_report, "n_positive": len(pos), "n_negative": len(neg), "recall_at_1": {"minilm_pgvector": r1_emb, "keyword_baseline": r1_jac},
            "similarity": {"paraphrase_mean": float(top_pos.mean()), "paraphrase_min": float(top_pos.min()), "unrelated_mean": float(top_neg.mean()), "unrelated_max": float(top_neg.max())},
            "thresholds": table, "shipped": {"related": prf(top_pos, top_neg, get_settings().similarity_related_threshold), "review": prf(top_pos, top_neg, get_settings().similarity_review_threshold)}, "keyword_baseline_best": best_j,
            "separation_gap": float(top_pos.min() - top_neg.max())}


if __name__ == "__main__":
    print(json.dumps(run(), indent=2))
