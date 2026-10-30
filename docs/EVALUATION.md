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

### 1b. Wording signals, long ideas, weak-match cutoff (added to the checker above)

**Wording overlap** is word-3-gram overlap (Unicode-aware: text is NFKC-normalised and case-folded, accents and Indic vowel signs stay inside their words, invisible format characters are ignored; Chinese, Japanese and Thai, which have no spaces, use 6-character runs) between the idea and each match (whole idea and description alone, the stronger counts). It is reported as `exact` (same words after case/punctuation normalisation) or `near_duplicate` (≥ 0.5 Jaccard, or ≥ 0.8 of the shorter text contained in the longer, with at least 5 shingles). It **cannot create a result on its own**: it only lifts a match to human review when that match is also semantically related (≥ 0.45). Thresholds 0.45 / 0.75 are unchanged and the recorded metrics above are reproduced exactly.

| Set (n) | wording flagged | queued for review | related or above | max top similarity |
|---|---|---|---|---|
| Exact copies (4) | 4 (all `exact`) | 4 | 4 | 1.00 |
| Minor edits, 1–3 words changed or a sentence appended (6) | 6 | 6 | 6 | 1.00 |
| Paraphrases (24) | 3 (2 reuse the source description verbatim under a new title, 1 changes about a quarter of it) | 16 | 24 | 0.93 |
| Hard paraphrases (12) | 0 | 0 | 10 | 0.62 |
| Unrelated (24) | **0** | 0 | 1 | 0.48 |
| Unrelated but sharing common vocabulary (8) | **0** | 0 | **5** | **0.68** |

* No wording false positives in 32 unrelated ideas. Shared boilerplate ("a tool that scores … using keyword and semantic matching") shares some 3-grams but stays below both cut-offs.
* On this corpus the wording signal changes no review decisions: every exact copy and minor edit already scores ≥ 0.75 semantically. Its value here is explainability ("identical wording", shared phrases) and catching a copied description under a changed title; it can lift a 0.45–0.75 match to review in other corpora.
* **New finding:** the 8 vocabulary-sharing ideas were not in the original labelled set. 5 of 8 reach "related work" (soft flag, shows the matches) and one reaches 0.68, close to the 0.75 review line. Semantic similarity alone is therefore not robust to shared domain vocabulary ("campus", "students", "app"). Not fixed here: 8 items is too few to justify moving a threshold. Grow the set before changing anything.
* Near-duplicate detection is wording-based, so rewording more than ~2 words of a short idea (or any paraphrase) is not a near-duplicate; that case is the semantic score's job. Very short texts (< 7 words) get no `near_duplicate`, and `exact` needs at least 4 tokens and 12 letters/digits, so a two-word title is never "identical wording". Phrase and shared-term explanations are not produced for unspaced scripts.
* **Privacy:** wording against another student's private submission is recorded for reviewers only. It never reaches the submitter's `duplicateSignal`, verdict message or per-match data, and it does not escalate a check by itself.

**Long inputs.** MiniLM reads at most 256 word-pieces and silently ignores the rest. Lengths are measured in the model's own tokens (never words: a 120-word idea full of URLs is ~1,200 tokens, an unspaced Chinese paragraph is one "word"). An idea that does not fit is additionally searched as sentence-packed sections (title repeated, one short sentence of overlap, long sentences cut to fit, at most 10 sections); each existing idea appears once at its best section, so overlapping sections cannot create duplicate matches. Every section is checked against the real tokenizer, special tokens included.

* `coverage.complete` is `true` only when the model's tokenizer verified that every part of the text is inside a text that fits. It is `false` when more than 10 sections would be needed (the tail is not compared; `sectionsNeeded` says how many) and whenever the tokenizer was unavailable and only a pessimistic estimate was used (`verified: "estimate"`). Checked against the real tokenizer on English, Devanagari, Arabic, Chinese, Japanese, Korean, Thai, emoji, URLs, code, hashes and identifier-like strings: all sections fit, and the estimate is never below the real count. Scripts not on that list are unchecked.
* A copied sentence placed after ~200 words of unrelated text (two filler topics tried): on the whole-idea vector alone the source ranked 6th (0.19) and 11th (0.05), i.e. outside the top 5 and invisible; with sections it ranked 1st (0.38 and 0.32) and shows `near_duplicate` wording. It stays **below the 0.45 related threshold** (surrounding text dilutes the score), so it does not change the verdict; it is surfaced as the closest match for a human to judge.
* Existing corpus ideas are still embedded once from their first ~190 words (re-embedding the corpus was out of scope). Corpus ideas longer than that are only partly comparable. Each section is searched separately (up to 10 sections × reference, peer and own-history searches per check).

**Display cutoff (0.30).** Measured before adding: the true source of every labelled paraphrase scores ≥ 0.40 (hard set: 0.40, ranked 1st–5th); 80% of the top-5 matches of unrelated ideas score < 0.30. Matches below 0.30 are stored for reviewers but not shown to the student, except the closest match, so the headline percentage always has an explanation. No labelled true source is hidden. A real source below 0.30 would be hidden from the student (reviewers still see it); the UI says how many were hidden.

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
