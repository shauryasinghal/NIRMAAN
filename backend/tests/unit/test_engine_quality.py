"""Head-to-head quality guards for the team builder and recommender (no model or DB needed). See docs/EVALUATION.md."""
from eval.engines_eval import determinism_check, recommender_eval, team_eval


def test_team_builder_beats_random_teams_on_coverage_and_balance():
    r = team_eval(draws=150)
    assert r["coverage"]["nirmaan"] >= 0.90 and r["coverage"]["nirmaan"] - r["coverage"]["random"] >= 0.20
    assert r["fully_covered_share"]["nirmaan"] >= 0.80 and r["fully_covered_share"]["nirmaan"] > 2 * r["fully_covered_share"]["random"]
    assert r["balance_score"]["nirmaan"] > r["balance_score"]["random"] + 0.10
    assert r["avg_team_size"] < r["team_size_max"]          # stops when nobody adds anything — never pads to hit a size


def test_recommender_ranks_on_profile_items_first_and_is_deterministic():
    r = recommender_eval()["mean"]
    assert r["NDCG@10"]["nirmaan"] >= 0.75 and r["NDCG@10"]["nirmaan"] > 5 * max(r["NDCG@10"]["recency"], r["NDCG@10"]["random"])
    assert r["P@10"]["nirmaan"] > 4 * max(r["P@10"]["recency"], r["P@10"]["random"])
    assert determinism_check()
