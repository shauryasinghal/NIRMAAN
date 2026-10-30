"""End-to-end behaviour of the improved originality checker: wording signals, long ideas, weak-match display, validation and
self-resubmission. Uses the real MiniLM model and the 50-idea demo corpus (skipped when the weights are unavailable)."""
import pytest

EXACT = {"title": "Lab equipment booking system", "description": "A scheduling system for students to reserve shared lab equipment slots."}
MINOR = {"title": "Expense splitting app for flatmates", "description": "A mobile app to track and split shared expenses among flatmates."}
PARAPHRASE = {"title": "Find collaborators for coding contests", "description": "Pairs people entering coding competitions with partners whose abilities fill the gaps in their own, so every squad covers the full range of needed expertise."}
COMMON_TERMS = {"title": "Campus bird-watching club log", "description": "An app where students log bird sightings, nesting sites and migration dates on campus."}
BOILERPLATE = {"title": "Wildfire risk scorer", "description": "A tool that scores satellite images against burn history using keyword and semantic matching."}
SEAWEED = {"title": "Seaweed based edible packaging", "description": "Packaging film made from farmed seaweed that dissolves in warm water and can be eaten, replacing single use plastic sachets."}
UNRELATED = {"title": "Tide pool biodiversity logger", "description": "Waterproof cameras and salinity probes placed in coastal tide pools, logging species counts so marine biologists can track seasonal change and pollution events."}
WEAK = {"title": "Glacier melt early warning network", "description": "Pressure and temperature probes drilled into mountain glaciers, sending meltwater levels to valley villages so they can prepare for flash floods."}


def check(client, u, body):
    return client.post("/api/originality/check", headers=u.h, json=body)


def test_exact_copy_is_labelled_exact_and_reviewed(client, student, reference_corpus):
    d = check(client, student, EXACT).json()
    top = d["matches"][0]
    assert top["title"] == EXACT["title"] and top["overlap"]["wording"]["signal"] == "exact" and top["overlap"]["wording"]["jaccard"] == 1.0
    assert d["duplicateSignal"] == "exact" and d["verdict"]["level"] == "high_overlap" and d["verdict"]["needsReview"] is True and d["review"]["state"] == "pending"
    assert "not proof of plagiarism" in d["verdict"]["message"]


def test_minor_edit_is_near_duplicate_not_exact(client, student, reference_corpus):
    d = check(client, student, MINOR).json()
    top = d["matches"][0]
    assert top["title"] == "Expense splitting app for roommates"
    assert top["overlap"]["wording"]["signal"] == "near_duplicate" and d["duplicateSignal"] in ("near_duplicate", "exact")    # "exact" only if another student already submitted these very words
    assert top["overlap"]["sharedPhrases"] and all(t == t.lower() for t in top["overlap"]["sharedTerms"])


def test_paraphrase_is_semantically_flagged_without_a_wording_claim(client, student, reference_corpus):
    d = check(client, student, PARAPHRASE).json()
    assert d["matches"][0]["title"] == "Skill-based hackathon teammate finder" and d["verdict"]["level"] in ("related_work", "high_overlap")
    assert d["matches"][0]["overlap"]["wording"]["signal"] is None and d["duplicateSignal"] is None


@pytest.mark.parametrize("body", [COMMON_TERMS, BOILERPLATE, UNRELATED])
def test_unrelated_ideas_sharing_common_terminology_are_not_called_duplicates(client, student, reference_corpus, body):
    d = check(client, student, body).json()
    assert d["duplicateSignal"] is None and d["verdict"]["needsReview"] is False and d["review"] is None and d["status"] != "needs_review"
    assert all(m["overlap"]["wording"]["signal"] is None for m in d["matches"])


def test_long_idea_is_analysed_in_sections_without_duplicate_matches(client, student, reference_corpus):
    filler = " ".join(f"Kiln firing log number {i} records clay body and glaze temperature for the pottery studio." for i in range(25))
    d = check(client, student, {"title": "Pottery studio handbook", "description": filler}).json()
    assert d["coverage"]["sections"] > 1 and d["coverage"]["complete"] is True and d["coverage"]["words"] > 170
    ids = [m["id"] for m in d["matches"]]
    assert len(ids) == len(set(ids)) and len(ids) <= 5


def test_copy_buried_after_a_long_introduction_is_surfaced_as_the_closest_match(client, student, reference_corpus):
    """MiniLM only reads the first ~190 words, so the whole-idea vector never sees this copy; the section containing it does.
    Known limit: the surrounding text dilutes the semantic score, so this stays below the 'related' threshold and does not change the verdict —
    the evidence is shown (closest match + word-for-word wording overlap) for a human to judge."""
    intro = " ".join(f"Mirror polishing pass {i} logs abrasive grade and surface error for the observatory workshop." for i in range(22))
    body = {"title": "Observatory workshop suite", "description": f"{intro} Also: {EXACT['description']}"}
    d = check(client, student, body).json()
    assert d["coverage"]["sections"] > 1
    top = d["matches"][0]
    assert top["title"] == EXACT["title"] and top["similarity"] > 25
    assert top["overlap"]["wording"]["containment"] == 1.0 and top["overlap"]["wording"]["signal"] == "near_duplicate"
    assert d["duplicateSignal"] is None and d["verdict"]["needsReview"] is False       # wording alone never escalates


def test_short_idea_reports_single_section_coverage(client, student, reference_corpus):
    d = check(client, student, UNRELATED).json()
    assert d["coverage"]["sections"] == 1 and d["coverage"]["complete"] is True and d["coverage"]["verified"] == "tokenizer"


def test_weak_matches_are_hidden_from_the_student_but_kept_for_reviewers(client, make_user, reference_corpus, svc):
    student, reviewer = make_user("student", "Weak Match Owner"), make_user("reviewer", "Weak Match Reviewer")
    d = check(client, student, WEAK).json()
    floor = d["display"]["floor"] * 100
    shown = d["matches"]
    assert shown and all(m["similarity"] >= floor for m in shown[1:])                    # the closest match always stays, as the headline's explanation
    total = svc.val("select count(*) from public.idea_matches m join public.ideas x on x.id = m.matched_idea_id where m.idea_id = cast(:i as uuid) and x.kind = 'reference'", i=d["id"])
    assert len(shown) + d["display"]["hiddenWeakMatches"] == total == 5
    assert d["display"]["hiddenWeakMatches"] > 0 and floor == pytest.approx(30)
    svc.run("insert into public.reviews (idea_id) values (cast(:i as uuid)) on conflict do nothing", i=d["id"])
    rid = svc.val("select id::text from public.reviews where idea_id = cast(:i as uuid)", i=d["id"])
    ev = client.get(f"/api/reviewer/reviews/{rid}", headers=reviewer.h).json()
    assert len([m for m in ev["matches"] if m["kind"] == "reference"]) == 5 and any(m["shownToSubmitter"] is False for m in ev["matches"])


def test_floor_does_not_hide_matches_that_matter(client, student, reference_corpus):
    """A heavily reworded idea whose true source scores low (but above the floor) must still be listed."""
    d = check(client, student, {"title": "Shared bills manager", "description": "Housemates log what they each pay for and the app works out who owes whom at the end of the month."}).json()
    assert "Expense splitting app for roommates" in [m["title"] for m in d["matches"]]


# ── validation ────────────────────────────────────────────────────────────────────────────────
@pytest.mark.parametrize("body", [{"title": "   ", "description": "x" * 5 + " words here that are long enough"}, {"title": "Fine title", "description": " " * 40},
                                  {"title": "Fine title", "description": "!!!! ???? .... ---- ####"}, {"title": "\n\t ", "description": "A real description with plenty of words in it."}])
def test_whitespace_only_input_is_a_clean_422_and_saves_nothing(client, student, svc, body):
    r = check(client, student, body)
    assert r.status_code == 422 and r.json()["error"]["code"] == "validation_error"
    assert svc.val("select count(*) from public.ideas where owner_id = cast(:u as uuid)", u=student.id) == 0


def test_nul_bytes_do_not_crash_the_check(client, student, reference_corpus):
    r = check(client, student, {"title": "Solar\x00 cooker", "description": "A low cost parabolic solar cooker\x00 for rural kitchens with a foldable frame."})
    assert r.status_code == 201 and "\x00" not in r.text


def test_padded_input_is_trimmed_before_storage(client, student, reference_corpus):
    d = check(client, student, {"title": "  Solar water heater  ", "description": "\n  A rooftop solar water heater built from recycled bottles and pipes for hostels.  \n"}).json()
    assert d["title"] == "Solar water heater" and not d["description"].startswith(("\n", " ")) and not d["description"].endswith(("\n", " "))


# ── self-resubmission ─────────────────────────────────────────────────────────────────────────
def test_resubmitting_links_to_the_owners_earlier_check_without_changing_it(client, student, reference_corpus):
    first = check(client, student, MINOR).json()
    assert first["previousChecks"] == []
    before = client.get(f"/api/ideas/{first['id']}", headers=student.h).json()
    second = check(client, student, MINOR).json()
    assert [p["id"] for p in second["previousChecks"]] == [first["id"]] and second["previousChecks"][0]["wording"] == "exact"
    assert first["id"] not in {m["id"] for m in second["matches"]}                          # a link to history, not a corpus match
    assert second["topSimilarity"] == first["topSimilarity"] and second["verdict"]["level"] == first["verdict"]["level"]     # the earlier check does not alter the verdict
    assert client.get(f"/api/ideas/{first['id']}", headers=student.h).json() == before         # history preserved exactly
    assert {i["id"] for i in client.get("/api/ideas", headers=student.h).json()["items"]} == {first["id"], second["id"]}


def test_a_lightly_edited_resubmission_is_linked_and_an_unrelated_one_is_not(client, student, reference_corpus):
    first = check(client, student, MINOR).json()
    edited = check(client, student, {**MINOR, "description": MINOR["description"] + " It also sends reminders."}).json()
    assert edited["previousChecks"][0]["id"] == first["id"] and edited["previousChecks"][0]["wording"] == "near_duplicate"
    assert check(client, student, WEAK).json()["previousChecks"] == []


def test_self_resubmission_does_not_create_a_second_review_for_the_earlier_idea_or_leak_to_others(client, make_user, reference_corpus, svc):
    a, b = make_user("student", "Self A"), make_user("student", "Other B")
    first = check(client, a, SEAWEED).json()
    again = check(client, a, SEAWEED).json()
    assert again["previousChecks"][0]["id"] == first["id"]
    assert svc.val("select count(*) from public.reviews where idea_id = cast(:i as uuid)", i=first["id"]) == 0 and first["review"] is None
    # another student with identical text: sees only that something overlaps — never A's ideas, titles or ids
    theirs = check(client, b, SEAWEED).json()
    assert theirs["previousChecks"] == [] and theirs["peerOverlapsExist"] is True
    blob = str(theirs)
    assert first["id"] not in blob and again["id"] not in blob
    assert client.get(f"/api/ideas/{first['id']}", headers=b.h).status_code == 404
    assert client.get(f"/api/ideas/{again['id']}", headers=b.h).status_code == 404


def test_deleting_the_earlier_check_removes_only_the_link(client, student, reference_corpus):
    first = check(client, student, MINOR).json()
    second = check(client, student, MINOR).json()
    assert client.delete(f"/api/ideas/{first['id']}", headers=student.h).status_code == 204
    after = client.get(f"/api/ideas/{second['id']}", headers=student.h).json()
    assert after["previousChecks"] == [] and after["title"] == second["title"] and after["matches"]


def test_reviewer_sees_the_owners_earlier_check_labelled_as_such(client, make_user, reference_corpus, svc):
    owner, rev = make_user("student", "Resubmitter"), make_user("reviewer", "Label Reviewer")
    first = check(client, owner, EXACT).json()
    second = check(client, owner, EXACT).json()
    rid = svc.val("select id::text from public.reviews where idea_id = cast(:i as uuid)", i=second["id"])
    ev = client.get(f"/api/reviewer/reviews/{rid}", headers=rev.h).json()
    kinds = {m["id"]: m["kind"] for m in ev["matches"]}
    assert kinds[first["id"]] == "owner's earlier check"
    assert ev["similarity"]["level"] == "high_overlap"


# ── M1: another student's private submission is never described to the owner ──────────────────
TANKS = {"title": "Rainwater tank sizing planner", "description": "A planner that sizes rooftop rainwater tanks for hostels from roof area, monthly rainfall records and the daily water demand of residents."}
KILNS = {"title": "Kiln schedule optimiser", "description": "Optimises ceramic kiln firing schedules for community pottery studios using clay type, glaze chemistry and electricity tariff windows to cut energy cost."}


def _peer_matches(client, svc, reviewer, idea_id):
    rid = svc.val("select id::text from public.reviews where idea_id = cast(:i as uuid)", i=idea_id)
    ev = client.get(f"/api/reviewer/reviews/{rid}", headers=reviewer.h).json()
    return ev, [m for m in ev["matches"] if m["kind"] == "peer submission"]


def _assert_owner_learns_nothing_about_the_peer(d, peer_idea, peer_title):
    assert d["duplicateSignal"] is None
    low = d["verdict"]["message"].lower()
    assert "wording" not in low and "identical" not in low and d["verdict"]["message"].startswith("This idea is semantically very close to existing work")
    assert all(m["overlap"]["wording"]["signal"] is None for m in d["matches"]) and d["previousChecks"] == []
    blob = str(d)
    assert peer_idea["id"] not in blob and peer_title not in blob      # (the description is not checked: the copier legitimately sees their own text)
    assert d["peerOverlapsExist"] is True             # the existing, coarse "something similar exists" notice is unchanged


def test_exact_peer_wording_is_hidden_from_the_owner_but_recorded_for_reviewers(client, make_user, reference_corpus, svc):
    a, b, rev = make_user("student", "Peer Src"), make_user("student", "Peer Copier"), make_user("reviewer", "Peer Wording Reviewer")
    original = check(client, a, TANKS).json()
    copy = check(client, b, {**TANKS, "title": "Hostel water storage calculator"}).json()       # same description, different title
    _assert_owner_learns_nothing_about_the_peer(copy, original, TANKS["title"])
    assert copy["verdict"]["needsReview"] is True and copy["review"]["state"] == "pending"        # review still happens, on the semantic score as before
    ev, peers = _peer_matches(client, svc, rev, copy["id"])
    assert peers and peers[0]["id"] == original["id"] and peers[0]["overlap"]["wording"]["signal"] == "exact" and peers[0]["shownToSubmitter"] is False
    assert ev["canDecide"] is True and ev["idea"]["id"] == copy["id"]          # reviewer workflow intact


def test_near_duplicate_peer_wording_is_hidden_from_the_owner_but_recorded_for_reviewers(client, make_user, reference_corpus, svc):
    a, b, rev = make_user("student", "Near Src"), make_user("student", "Near Copier"), make_user("reviewer", "Near Wording Reviewer")
    original = check(client, a, KILNS).json()
    edited = check(client, b, {"title": "Pottery firing planner", "description": KILNS["description"].replace("cut energy cost", "lower energy bills") + " It also exports reports."}).json()
    _assert_owner_learns_nothing_about_the_peer(edited, original, KILNS["title"])
    _, peers = _peer_matches(client, svc, rev, edited["id"])
    assert peers and peers[0]["overlap"]["wording"]["signal"] in ("near_duplicate", "exact")


def test_peer_wording_does_not_leak_through_the_history_endpoints_either(client, make_user, reference_corpus):
    a, b = make_user("student", "Hist Src"), make_user("student", "Hist Copier")
    original = check(client, a, {"title": "Bamboo scaffold load estimator", "description": "Estimates safe working loads for bamboo scaffolding from pole diameter, joint type and span, with photos of each joint attached to the report."}).json()
    copy = check(client, b, {"title": "Scaffold safety helper", "description": original["description"]}).json()
    hist = client.get("/api/ideas", headers=b.h).json()
    detail = client.get(f"/api/ideas/{copy['id']}", headers=b.h).json()
    for blob in (str(hist), str(detail)):
        assert original["id"] not in blob and "Bamboo scaffold load estimator" not in blob
    assert detail["duplicateSignal"] is None and "identical" not in detail["verdict"]["message"].lower()


# ── M2/M3/L1 at the API: other scripts, long and awkward inputs ────────────────────────────────
def test_chinese_and_japanese_ideas_are_accepted_checked_and_stored_unchanged(client, student, reference_corpus):
    for body in ({"title": "农业灌溉系统", "description": "这是一个用于农业的智能灌溉系统的想法，帮助农民节约用水并提高产量，同时降低成本。"},
                 {"title": "スマート灌漑システム", "description": "これは農家のための賢い灌漑システムのアイデアで、水を節約し収穫量を増やします。"}):
        r = check(client, student, body)
        assert r.status_code == 201, r.text
        d = r.json()
        assert d["title"] == body["title"] and d["description"] == body["description"] and d["coverage"]["verified"] == "tokenizer"


def test_zero_width_and_emoji_only_descriptions_are_still_rejected(client, student):
    for desc in ("​" * 40, "🌱" * 30, "。" * 30):
        r = check(client, student, {"title": "Fine title", "description": desc})
        assert r.status_code == 422 and r.json()["error"]["code"] == "validation_error"


def test_a_short_idea_full_of_urls_is_analysed_in_sections_and_says_so(client, student, reference_corpus):
    desc = " ".join(f"See https://example.com/api/v1/items/{i}?id={i}&k=abc_def_ghi for the sensor feed." for i in range(11))
    assert len(desc.split()) < 170
    d = check(client, student, {"title": "Sensor feed links", "description": desc}).json()
    assert d["coverage"]["sections"] > 1 and d["coverage"]["complete"] is True and d["coverage"]["verified"] == "tokenizer" and d["coverage"]["tokens"] > d["coverage"]["limit"]


def test_text_too_long_to_cover_is_reported_incomplete_not_complete(client, student, reference_corpus):
    desc = " ".join(f"k{i}z{i * 7}q{i % 13}" for i in range(900))[:4990]            # ~5,000 characters of identifier-like tokens
    d = check(client, student, {"title": "Identifier dump", "description": desc}).json()
    cov = d["coverage"]
    assert cov["complete"] is False and cov["sectionsNeeded"] > cov["sections"] > 1 and cov["verified"] == "tokenizer"


def test_short_ideas_report_verified_complete_coverage(client, student, reference_corpus):
    d = check(client, student, WEAK).json()
    assert d["coverage"]["sections"] == 1 and d["coverage"]["complete"] is True and d["coverage"]["verified"] == "tokenizer" and d["coverage"]["tokens"] <= d["coverage"]["limit"]
