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
