# NIRMAAN — AI engine evaluation

Reproduce everything here from `backend/`:

```bash
source venv/bin/activate
python -m eval.originality_eval      # originality: labelled set + keyword baseline
python -m eval.threshold_sweep       # originality: threshold trade-off
python -m eval.engines_eval          # team builder vs random teams, recommender vs baselines
python -m pytest tests/test_ml_quality.py tests/unit/test_engine_quality.py   # the same numbers as regression tests
```

Numbers below are from the run recorded with this commit. **Read the limits sections** — they matter more than the headline figures.

## 1. Originality engine (MiniLM-L6-v2, 384-d, pgvector cosine)

Labelled set (`fixtures/originality_eval.json`) against the 50-idea demo reference corpus:

| Set | n | What it tests |
|---|---|---|
| Paraphrases | 24 | rewrites of corpus ideas (should be retrieved and flagged) |
| **Hard paraphrases** | 12 | rewrites that deliberately avoid the source's vocabulary |
| Unrelated ideas | 24 | genuinely different ideas (should not be flagged) |

**Retrieval (does the true source come back as the #1 match?)**

| | MiniLM + pgvector | keyword-overlap baseline |
|---|---|---|
| Paraphrases | 100% | 100% |
| **Hard paraphrases** | **83%** | **25%** |

The easy set does not separate the two methods (the paraphrases share words with their sources). The hard set does — that is the case the engine exists for.

**Thresholds.** Cosine similarity — paraphrase min 0.55 / mean 0.78; unrelated max 0.48 / mean 0.30.

| Flag threshold | Paraphrase recall | Hard-paraphrase recall | False-positive rate (unrelated) |
|---|---|---|---|
| 0.55 (previous default) | 100% | 25% | 0% |
| **0.45 (shipped "related")** | **100%** | **83%** | **4%** (1 of 24) |
| 0.40 | 100% | 92% | 12.5% |
| 0.75 (shipped "review") | 67% | — | 0% |

*Decision:* "related work" is set to **0.45** because it is a soft flag (it only says "compare these matches") and missing heavily reworded ideas was the larger risk. "Human review" stays at **0.75** because a false positive there consumes a reviewer's time; the 33% of paraphrases below 0.75 still surface as "related work" with their matches shown.

**Limits.** Small labelled set (60 ideas), an *illustrative demo corpus* of 50 ideas, and thin margin between the highest unrelated score (0.48) and the lowest paraphrase (0.55) — thresholds should be re-calibrated whenever the corpus changes materially. Similarity is a screening signal, never proof of plagiarism, and "no match" only means nothing similar exists in *this* corpus.

## 2. Team Builder vs random teams

Same 24 demo candidates, same 34 team-based demo opportunities (≥3 required skills), owner chosen at random, teams of up to 4; random baseline = 300 random draws per opportunity.

| | NIRMAAN | random |
|---|---|---|
| Required-skill coverage | **97%** | 69% |
| Teams covering *every* required skill | **91%** | 40% |
| Balance score (0.40 coverage + 0.25 role diversity + 0.25 complementarity + 0.10 non-redundancy) | **0.91** | 0.71 |
| Average team size | 2.2 | 4 |

The builder stops once coverage is complete and nobody adds anything, so its teams are *smaller* — it does not pad to reach a size. "Diversity" here is capability diversity only; no demographic attribute is used anywhere.

**Limits.** The candidate pool is synthetic archetypes (frontend, backend, ML, …); real coverage depends on who opts in. Balance is a documented heuristic, not a validated predictor of team success.

## 3. Recommender (explainable fit)

Five synthetic personas ranked over the 64-item demo catalog; relevance = on-domain and ≥2 shared required skills (or ≥3 shared skills).

| Mean over personas | NIRMAAN | recency | random |
|---|---|---|---|
| NDCG@10 | **0.91** | 0.08 | 0.07 |
| Precision@10 | **0.58** | 0.06 | 0.08 |

Precision@10 is capped by how many relevant items exist (5–13 per persona), so NDCG is the fairer figure. Scores are **deterministic** (asserted on every catalog item).

**Limits — important.** There is no real interaction data yet, so "relevance" is defined from the same profile signals the ranker uses. This is a **consistency check** (does it put clearly on-profile items first, and beat trivial baselines?), *not* evidence of real-world relevance. Real precision/NDCG needs users' applies, saves and dismissals; the behavioural signal (13% of the score) is switched off until a user has 5 actions and is fully visible and resettable in Settings.

## 4. Other properties verified elsewhere

- Unknown inputs are excluded, not guessed; sparse profiles get low confidence and a capped score (unit tests).
- Skill inference never silently becomes a confirmed skill (API + E2E).
- Every originality result carries method, corpus size, thresholds, confidence and the "not proof of plagiarism" disclaimer; nothing is ever labelled "100% original".
