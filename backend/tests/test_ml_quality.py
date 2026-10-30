"""Regression guard for the originality engine's quality (real MiniLM, labelled set in fixtures/originality_eval.json).
If someone swaps the model or moves a threshold, these fail with numbers — see docs/EVALUATION.md."""
import pytest

from app.core.config import get_settings
from app.engines import originality as eng

pytestmark = pytest.mark.model


@pytest.fixture(scope="module")
def report():
    if not eng.embedding_available():
        pytest.skip("MiniLM weights not available")
    from eval.originality_eval import run
    return run()


def test_semantic_retrieval_beats_keyword_search_where_wording_differs(report):
    h = report["hard"]
    assert h["recall_at_1"]["minilm_pgvector"] >= 0.75
    assert h["recall_at_1"]["minilm_pgvector"] - h["recall_at_1"]["keyword_baseline"] >= 0.40      # the reason this engine exists


def test_easy_paraphrases_are_always_retrieved(report):
    assert report["recall_at_1"]["minilm_pgvector"] >= 0.95


def test_shipped_related_threshold_is_calibrated(report):
    thr = get_settings().similarity_related_threshold
    row = min(report["thresholds"], key=lambda r: abs(r["threshold"] - thr))
    assert abs(row["threshold"] - thr) <= 0.03
    assert row["falsePositiveRate"] <= 0.10 and row["recall"] >= 0.95
    assert report["hard"]["flagged_as_related_or_above"]["minilm_pgvector"] >= 0.75              # heavily reworded ideas are still flagged


def test_unrelated_ideas_stay_below_the_review_threshold(report):
    assert report["similarity"]["unrelated_max"] < get_settings().similarity_review_threshold - 0.2


def test_sections_of_long_ideas_fit_the_embedding_models_window():
    """The reason chunk_idea exists: anything beyond max_seq_length is silently ignored by the model."""
    if not eng.embedding_available():
        pytest.skip("MiniLM weights not available")
    model = eng.get_embedder()._load()
    long_desc = " ".join(f"Sensors tell farmers number {i} when irrigation of their crops is needed, saving water and money." for i in range(45))
    texts, cov = eng.chunk_idea("Farm water saver", long_desc, eng.token_budget(eng.get_embedder()))
    assert cov["sections"] > 1 and cov["complete"] is True and cov["verified"] == "tokenizer"
    assert len(model.tokenizer(texts[0])["input_ids"]) > model.max_seq_length                  # the whole-idea text really is truncated…
    assert all(len(model.tokenizer(t)["input_ids"]) <= model.max_seq_length for t in texts[1:])  # …and no section is


def test_wording_signals_have_no_false_positives_and_never_change_the_shipped_threshold_metrics(report):
    w = report["wording"]
    assert w["unrelated"]["wording_flagged"] == 0 and w["common_terms_unrelated"]["wording_flagged"] == 0 and w["hard_paraphrases"]["wording_flagged"] == 0
    assert w["common_terms_unrelated"]["queued_for_review"] == 0 and w["unrelated"]["queued_for_review"] == 0
    assert w["exact_duplicates"]["exact"] == w["exact_duplicates"]["n"] and w["exact_duplicates"]["queued_for_review"] == w["exact_duplicates"]["n"]
    assert w["minor_edits"]["wording_flagged"] == w["minor_edits"]["n"]
    # thresholds untouched: identical to the recorded baseline (docs/EVALUATION.md)
    assert report["shipped"]["related"]["falsePositiveRate"] == pytest.approx(0.042, abs=0.001) and report["shipped"]["related"]["recall"] == 1.0
    assert report["shipped"]["review"]["recall"] == pytest.approx(0.667, abs=0.001) and report["shipped"]["review"]["falsePositiveRate"] == 0.0


# ── coverage reporting, against the model's real tokenizer ─────────────────────────────────────
import random

_rng = random.Random(7)
SAMPLES = {
    "english": " ".join(f"Sensor {i} tells farmers when to irrigate their crops today." for i in range(40)),
    "devanagari": " ".join(f"किसानों के लिए सेंसर {i} सिंचाई का समय बताता है।" for i in range(60)),
    "arabic": "نظام ري ذكي للمزارعين يوفر المياه ويزيد المحصول. " * 50,
    "chinese": "这是一个用于农业的智能灌溉系统的想法。" * 60,
    "japanese": "これは農家のための賢い灌漑システムのアイデアです。" * 50,
    "korean": "스마트 관개 시스템으로 농부들이 물을 절약합니다. " * 60,
    "thai_unspaced": "ระบบรดน้ำอัจฉริยะสำหรับเกษตรกร" * 100,
    "urls": " ".join(f"see https://example.com/api/v1/items/{i}?id={i}&k=abc_def_ghi snake_case_name_{i}() ok." for i in range(40)),
    "code": "def f(x): return [i**2 for i in range(x) if i%3==0]  # comment\n" * 40,
    "identifiers": " ".join(f"token a1b2c3d4e5f6{i} session x9y8z7w6v5u4{i} trace q1w2e3r4t5y6{i} end." for i in range(40)),
    "hashes": " ".join("%032x" % _rng.getrandbits(128) for _ in range(60)),
    "emoji": "🌱🔥💧 smart farm 🚜 " * 120,
    "no_spaces_ascii": "a" * 4000,
}


@pytest.fixture(scope="module")
def tok():
    if not eng.embedding_available():
        pytest.skip("MiniLM weights not available")
    return eng.get_embedder()._load()


def real_len(tok, text):
    return len(tok.tokenizer(text, add_special_tokens=True, truncation=False, verbose=False)["input_ids"])


@pytest.mark.parametrize("name", list(SAMPLES))
def test_every_section_fits_the_model_window_whatever_the_script(tok, name):
    desc = SAMPLES[name][:5000]                       # the API's own length limit
    texts, cov = eng.chunk_idea("Farm idea", desc, eng.token_budget(eng.get_embedder()))
    assert cov["verified"] == "tokenizer" and cov["limit"] == tok.max_seq_length
    for t in (texts[:1] if cov["sections"] == 1 and cov["tokens"] <= cov["limit"] else texts[1:]):
        assert real_len(tok, t) <= tok.max_seq_length, (name, real_len(tok, t))      # title prefix and special tokens included
    assert cov["complete"] is (cov["sectionsNeeded"] <= eng.MAX_SECTIONS)
    assert cov["tokens"] == real_len(tok, texts[0])


@pytest.mark.parametrize("name", list(SAMPLES))
def test_complete_is_only_claimed_when_the_whole_text_is_actually_inside_the_sections(tok, name):
    desc = SAMPLES[name][:5000]
    texts, cov = eng.chunk_idea("Farm idea", desc, eng.token_budget(eng.get_embedder()))
    if cov["tokens"] <= cov["limit"]:
        assert cov["complete"] is True and texts == [eng.idea_text("Farm idea", desc)]         # fits whole; nothing left out
        return
    body = "".join(t.split(". ", 1)[1] for t in texts[1:]).replace(" ", "")
    flat = "".join(desc.split())
    if cov["complete"]:
        assert body.startswith(flat[:15]) and body.endswith(flat[-15:]) and len(body) >= len(flat), name   # first and last text are really covered, nothing dropped
    else:
        assert cov["sectionsNeeded"] > eng.MAX_SECTIONS and cov["sections"] == eng.MAX_SECTIONS         # incomplete only because the cap was hit, and it says so


@pytest.mark.parametrize("name", list(SAMPLES))
def test_the_fallback_estimate_is_never_below_the_real_token_count(tok, name):
    desc = SAMPLES[name][:5000]
    assert eng.estimate_tokens(desc) >= real_len(tok, desc), name


@pytest.mark.parametrize("name", list(SAMPLES))
def test_estimate_mode_still_produces_sections_that_fit_and_never_claims_completeness(tok, name):
    desc = SAMPLES[name][:5000]
    texts, cov = eng.chunk_idea("Farm idea", desc, eng.TokenBudget(eng.estimate_tokens, tok.max_seq_length, False))
    assert cov["complete"] is False and cov["verified"] == "estimate"
    for t in (texts[1:] if len(texts) > 1 else texts):
        if cov["sections"] > 1:
            assert real_len(tok, t) <= tok.max_seq_length, (name, real_len(tok, t))


def test_a_short_idea_made_of_urls_is_not_mistaken_for_a_short_idea(tok):
    """~120 words but >1,000 tokens: the old word-count rule embedded it whole, silently dropping most of it and calling it complete."""
    desc = SAMPLES["urls"][:900]
    assert len(desc.split()) < 170 and real_len(tok, desc) > tok.max_seq_length
    texts, cov = eng.chunk_idea("Links", desc, eng.token_budget(eng.get_embedder()))
    assert cov["sections"] > 1 and cov["complete"] is True


def test_unspaced_chinese_is_not_mistaken_for_a_two_word_idea(tok):
    desc = SAMPLES["chinese"][:1200]
    texts, cov = eng.chunk_idea("农业灌溉", desc, eng.token_budget(eng.get_embedder()))
    assert len(desc.split()) == 1 and cov["sections"] > 1 and cov["complete"] is True


def test_near_duplicate_detection_uses_the_same_tokens_for_chinese_and_hindi_as_for_english():
    a = "这是一个用于农业的智能灌溉系统的想法，帮助农民节约用水并提高产量，同时降低成本。"
    assert eng.wording_overlap(a, a.replace("农民", "农户"))["signal"] == "near_duplicate"
