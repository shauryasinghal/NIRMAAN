# Originality checker: Gemini deep analysis (stage 3)

The originality checker is a multi-stage pipeline. Stages 1–2 are the existing, deterministic semantic check (MiniLM-L6-v2 embeddings,
pgvector HNSW cosine search, wording-overlap signals, calibrated thresholds). Stage 3 adds an **optional, explainable, qualitative** reading
of the retrieved matches by Google Gemini. Stage 3 never changes a score, a verdict or the review queue; it adds explanation and suggestions
next to them.

```
React form ─► POST /api/originality/check ─► validation ─► MiniLM embedding ─► pgvector search ─► verdict + matches saved (stages 1–2, unchanged)
                                                                                                      │
React ◄──────────────────────────────────────────────────────────────────────────────────────────────┘ 201 result (aiAnalysis.status = pending | disabled)
  │
  └─► POST /api/ideas/{id}/ai-analysis ─► load own idea + reference matches ─► hardened prompt ─► Gemini (JSON schema) ─► validate + cap ─► analysis.ai saved
React ◄───────────────────────────────────────────────────────────────────────────────────────────────── 200 envelope (completed | unavailable | skipped | disabled)
```

## Stages

| Stage | What happens | Where |
|---|---|---|
| 1 Input understanding | Title, description and optional structured sections (problem statement, objectives, proposed solution, technologies, additional context). Control characters are removed and whitespace trimmed; nothing is paraphrased. Sections are appended to the description under plain labels for comparison and stored in `ideas.analysis -> 'input'`. The `description` column holds exactly what the student typed. | `schemas/originality.py` (`OriginalityCheckIn`, `compose_comparison_text`) |
| 2 Semantic similarity | Unchanged: 384-d MiniLM embedding (sectioned for long ideas), `private.match_reference_ideas` / `match_submission_overlaps` over the HNSW index, wording signals, `classify()` with the 0.75 / 0.45 thresholds. | `engines/originality.py`, `services/ideas.py` |
| 3 Gemini deep analysis | The student's idea and up to 5 **reference** matches are sent to Gemini with a schema-constrained JSON response. Gemini assesses problem, solution, functional, target-user and technical-approach similarity, common features, features unique to the submission, meaningful differences and potentially reused concepts, and picks one relationship per match. | `services/originality_ai.py`, `integrations/gemini_originality.py` |
| 4 Originality report | The validated report is stored in `ideas.analysis -> 'ai'` and returned with the idea (`aiAnalysis`). Measured embedding similarity (with its screening band and thresholds) is returned in a separate `embedding` object, clearly apart from Gemini's qualitative levels. | `schemas/originality.py` (`normalise_report`, `AIReport`) |
| 5 Improvement engine | Part of the same Gemini call: practical suggestions (new features, technical approaches, target users, implementation, use cases, problem approach) with a rationale each. The student's idea is never modified. | same |

## Decision logic (unchanged)

| Cosine similarity | Band | Existing verdict |
|---|---|---|
| < 0.45 | Low semantic similarity | `no_significant_match` |
| 0.45 – < 0.75 | Moderate semantic similarity | `related_work` |
| ≥ 0.75 | High semantic similarity | `high_overlap` → human review queue |

Bands and verdicts come from `engines/originality.py` only. Gemini's output is words (`low` / `moderate` / `high`, a relationship label, explanations);
it is **not** combined with the percentage into an "originality score", and nothing in the system says "100% original" or "copied".

## Configuration

| Variable | Default | Meaning |
|---|---|---|
| `GEMINI_API_KEY` | empty | The Google AI Studio key. Backend only, read from the environment / `backend/.env`, held as a `SecretStr`, redacted from logs. Shared with the chat assistant when `CHAT_PROVIDER=gemini`. |
| `ORIGINALITY_AI_ENABLED` | `false` | Switch for stage 3. Production refuses to start when `true` without a key. Off = the stage reports `disabled`; everything else works as before. |
| `ORIGINALITY_AI_MODEL` | `gemini-3.5-flash-lite` | Any current Gemini text model with structured output. Checked against the models page on 2026-11-14: `gemini-3.5-flash-lite` is stable and recommended for new projects; `gemini-2.5-*` models are deprecated. |
| `ORIGINALITY_AI_TIMEOUT_SECONDS` | `45` | Timeout of one request to Gemini. |
| `ORIGINALITY_AI_ATTEMPTS` | `3` | Total tries. 429, 5xx, timeouts, transport errors and unparseable JSON are retried with exponential backoff (0.6 s, 1.2 s, … capped at 8 s, with jitter). 401/403 (key), 404 (model) and other 4xx are not retried. |
| `ORIGINALITY_AI_MAX_OUTPUT_TOKENS` | `4096` | Output budget. A truncated document is treated as malformed. |
| `ORIGINALITY_AI_MAX_MATCHES` | `5` | Reference matches sent per analysis. |
| `ORIGINALITY_AI_RATE_LIMIT_PER_MINUTE` / `ORIGINALITY_AI_DAILY_LIMIT` | `4` / `40` | Per-student limits for the stage-3 endpoint (in addition to the existing 12/min on the check endpoint and the global per-IP limit). |

Set the key and the switch in `backend/.env` (never in the frontend, never in Git):

```
GEMINI_API_KEY=AIza...            # Google AI Studio → Get API key
ORIGINALITY_AI_ENABLED=true
```

`GET /ready` reports `originalityAI: {status, model}` and `GET /api/originality/status` tells the UI whether the stage exists. Neither exposes the key.

## Security and privacy

- **Key handling.** The key is passed to the SDK explicitly from settings; the SDK's own environment lookup is not relied on. Logs redact Google-style keys by pattern and the configured value exactly. Error bodies from Google are never logged or returned — only the HTTP status and the status enum.
- **Who may call stage 3.** Only a signed-in student, only for an idea they own (RLS plus an explicit `owner_id` filter). Anyone else gets 404. Reviewers see a stored report as evidence on the review page but cannot trigger one.
- **What is sent to Google.** The student's own idea text (title, description, provided sections) and the matched **reference** ideas with their measured similarity. Not sent: user id, name, email, opportunity, other students' submissions (peer overlaps), the owner's earlier checks. The envelope records `inputs.peerSubmissionsSent: 0`.
- **Prompt injection.** Every text goes into a block whose tag carries a per-request random nonce; `<` and `>` in the text are replaced with look-alike characters, control characters are removed, lengths are capped. The system instruction states that block contents are data, never instructions. The response is constrained to a JSON schema by the API, validated again with Pydantic, and then every string is cleaned and capped and every `match_id` must name a match that was actually sent (others are dropped; skipped matches are listed as "not assessed", never filled in). The browser renders everything as text.
- **No DB connection while waiting on Gemini.** The endpoint loads in one short transaction, calls the model with no connection held, and saves in another.
- **Failure is reported, not hidden.** Any failure is stored and returned as `status: "unavailable"` with a safe code (`invalid_key`, `model_unavailable`, `busy`, `timeout`, `unavailable`, `blocked`, `malformed`, `rejected`, `server_error`) and message; the stage can be retried. The semantic result is unaffected.

## Data-use note

On Google's free tier, content sent to the Gemini API may be used to improve Google's products; on the paid tier it is not (see Google's pricing / terms).
NIRMAAN cannot tell which tier a key is on. Decide this before enabling the stage for real students, and keep the UI's disclosure (shown under the form) accurate.

## Tests

- `backend/tests/unit/test_originality_ai_client.py` — request shape (explicit key, JSON mime type, schema, timeout in ms, no tools, no SDK retries), key/model/4xx errors not retried, 429/5xx/timeouts retried with backoff, malformed / truncated / blocked output, provider text never leaking.
- `backend/tests/unit/test_originality_ai_pipeline.py` — structured input validation, comparison text, prompt hardening (nonce tags, injection neutralised, no identifiers), report normalisation, similarity bands and the unchanged thresholds.
- `backend/tests/api/test_originality_ai_api.py` — the full flow with real MiniLM + pgvector and a fake Gemini client: structured sections stored and compared, enabled/disabled states, stored report, reuse vs `force`, peer submissions never sent, every provider failure reported as unavailable, authentication, authorisation (owner only), user isolation, reviewer evidence, rate limits, `/ready`.
- `frontend/src/test/ai-analysis.test.tsx`, `frontend/src/test/originality-page.test.tsx` — the report view (measured vs AI, side-by-side, unavailable + retry, compact reviewer mode) and the two-stage page flow (auto-run, structured fields, failure handling, disabled server).

## Limitations

- Gemini sees only the texts: the student's description and the first part of each reference idea (stored descriptions, up to 3,000 characters each). It has not seen code, repositories, the wider internet or any idea outside the comparison corpus. A reassuring report does not mean the idea is new.
- Qualitative levels are the model's judgement and vary between runs (temperature 0.2). They are not measurements and are not comparable across ideas the way embedding similarity is.
- The stage is only as good as the retrieved matches. If stage 2 missed the relevant prior work, stage 3 cannot find it.
- Long submitted descriptions are capped at 6,000 characters for the prompt; the semantic stage compares the full text in sections as before.
- Rate limits are per API instance (in-process), as for the rest of the API.
- Reports are stored with the idea and shown in history; re-running (`force=true`) replaces the stored report.
