"""Threshold sweep for the originality 'related' flag: recall on easy / hard paraphrases vs false-positive rate on unrelated ideas.
    python -m eval.threshold_sweep"""
import json

import numpy as np

from app.engines import originality as eng
from eval.originality_eval import FX


def main() -> None:
    ref = json.loads((FX / "ideas.reference.dev.json").read_text())
    ev = json.loads((FX / "originality_eval.json").read_text())
    emb = eng.get_embedder()
    rv = np.array(emb.encode([eng.idea_text(r["title"], r["description"]) for r in ref]))
    top = lambda t, d: float((rv @ np.array(emb.encode([eng.idea_text(t, d)])[0])).max())
    easy = np.array([top(t, d) for _, t, d in ev["paraphrases"]])
    hard = np.array([top(t, d) for _, t, d in ev["hard_paraphrases"]])
    neg = np.array([top(t, d) for t, d in ev["unrelated"]])
    print("thr   easy_recall hard_recall unrelated_FPR")
    for t in (0.40, 0.42, 0.45, 0.48, 0.50, 0.52, 0.55):
        print(f"{t:.2f}  {np.mean(easy >= t):.2f}        {np.mean(hard >= t):.2f}        {np.mean(neg >= t):.3f}")
    print("hard sims sorted:", np.round(np.sort(hard), 2))
    print("unrelated top-5 :", np.round(np.sort(neg)[-5:], 2))


if __name__ == "__main__":
    main()
