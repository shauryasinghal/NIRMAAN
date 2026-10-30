"""Wording overlap, chunking, explanation ranking, request validation and title-vector caching for the originality checker.
Pure logic — no database and no embedding weights."""
import pytest
from pydantic import ValidationError

from app.engines import originality as eng
from app.engines.originality import (chunk_idea, classify, duplicate_signal, idea_text, merge_matches, shared_phrases, shared_terms, word_count, wording_overlap)
from app.routers.ideas import CheckIn

BASE = idea_text("Expense splitting app for roommates", "A mobile app to track and split shared expenses among roommates.")


# ── wording overlap ───────────────────────────────────────────────────────────────────────────
def test_exact_after_case_and_punctuation_normalisation():
    assert wording_overlap(BASE, BASE.upper() + "!!")["signal"] == "exact"
    assert wording_overlap(BASE, "  " + BASE.replace(".", " ,  ") + "\n")["signal"] == "exact"


def test_minor_edits_are_near_duplicates_but_not_exact():
    one_word = BASE.replace("roommates.", "flatmates.")
    padded = BASE + " Includes monthly summaries and email reminders for everyone."
    for edited in (one_word, padded):
        w = wording_overlap(BASE, edited)
        assert w["signal"] == "near_duplicate" and w["jaccard"] < 1.0 and (w["jaccard"] >= 0.5 or w["containment"] >= 0.8)


def test_paraphrase_and_unrelated_text_are_not_flagged():
    paraphrase = idea_text("Shared bills manager", "Housemates log what they pay for and the app works out who owes whom.")
    assert wording_overlap(BASE, paraphrase)["signal"] is None
    assert wording_overlap(BASE, idea_text("Hive monitor", "Acoustic sensors inside beehives stream colony health to beekeepers."))["signal"] is None


def test_shared_boilerplate_is_not_a_near_duplicate():
    a = idea_text("Resume scorer", "A tool that scores resumes against a job description using keyword and semantic matching.")
    b = idea_text("Wildfire risk scorer", "A tool that scores satellite images against burn history using keyword and semantic matching.")
    w = wording_overlap(a, b)
    assert w["signal"] is None and 0 < w["jaccard"] < 0.35


def test_texts_too_short_for_statistics_never_get_a_wording_signal():
    assert wording_overlap("solar cooker", "solar cooker for rural homes")["signal"] is None
    assert wording_overlap("solar cooker", "Solar Cooker!")["signal"] is None         # identical, but two words are not evidence of anything
    assert wording_overlap("rooftop solar water heater", "Rooftop Solar Water-Heater!")["signal"] == "exact"


def test_wording_alone_never_decides_anything():
    # a near-duplicate wording signal on a match that is NOT semantically related is ignored
    assert duplicate_signal([(0.20, "near_duplicate"), (0.30, "exact")], 0.45) is None
    assert duplicate_signal([(0.50, "near_duplicate"), (0.30, "exact")], 0.45) == "near_duplicate"
    assert duplicate_signal([(0.50, "near_duplicate"), (0.90, "exact")], 0.45) == "exact"
    assert duplicate_signal([], 0.45) is None


def test_classify_wording_only_lifts_semantically_related_results():
    base = classify(0.60, 50, 0.75, 0.45)
    assert base["level"] == "related_work" and base["needsReview"] is False
    lifted = classify(0.60, 50, 0.75, 0.45, "near_duplicate")
    assert lifted["level"] == "high_overlap" and lifted["needsReview"] is True and "wording" in lifted["message"] and "not proof of plagiarism" in lifted["message"]
    assert "identical" in classify(0.60, 50, 0.75, 0.45, "exact")["message"]
    # below the related threshold the signal is ignored, and thresholds themselves are untouched
    assert classify(0.30, 50, 0.75, 0.45, "exact")["level"] == "no_significant_match"
    assert classify(None, 0, 0.75, 0.45, "exact")["level"] == "no_corpus"
    assert classify(0.80, 50, 0.75, 0.45)["level"] == "high_overlap" and classify(0.80, 50, 0.75, 0.45, "exact")["level"] == "high_overlap"
    for sig in (None, "exact", "near_duplicate"):
        m = classify(0.9, 50, 0.75, 0.45, sig)["message"]
        assert "100%" not in m and "plagiar" in m


# ── explanations ──────────────────────────────────────────────────────────────────────────────
A = "Smart irrigation scheduler for small farms. Soil moisture sensors tell farmers when to water crops, saving water."
B = "Drip irrigation scheduler for farms. Soil moisture sensors tell the farmer when to water crops."


def test_shared_phrases_are_informative_longest_first_and_do_not_cross_punctuation():
    p = shared_phrases(A, B)
    assert p[0] == "soil moisture sensors tell" and "irrigation scheduler" in p
    assert all("farms soil" not in x for x in p)                       # "farms. Soil" spans a sentence boundary
    assert not any(x.split()[0] in eng._GENERIC or x.split()[-1] in eng._GENERIC for x in p)
    assert not any(a != b and a in b for a in p for b in p)             # no phrase inside a longer one


def test_shared_terms_rank_topic_words_first_not_alphabetically():
    a = "campus app: farm farm farm sensors for irrigation, a quick idea about data"
    b = "farm sensors and irrigation on the farm; also a new idea about data"
    t = shared_terms(a, b)
    assert t[0] == "farm" and "data" not in t and "idea" not in t       # repeated topic word first; generic words dropped
    assert t.index("irrigation") < t.index("sensors")                   # same count → longer (more specific) word first, not alphabetical
    assert t == shared_terms(a, b)                                      # deterministic


def test_shared_terms_skip_words_already_inside_a_shown_phrase():
    p = shared_phrases(A, B)
    t = shared_terms(A, B, exclude_phrases=p)
    assert not set(t) & {w for x in p for w in x.split()} and "farms" in t


def test_common_vocabulary_without_common_wording_yields_terms_but_no_phrases_or_signal():
    a = idea_text("Campus beekeeping club", "An app where students log hive inspections on campus.")
    b = idea_text("Campus lost-and-found tracker", "A web app where students can report and search for lost items on campus.")
    assert wording_overlap(a, b)["signal"] is None
    d = eng.overlap_dimensions("Campus beekeeping club", "An app where students log hive inspections on campus.", None,
                               {"similarity": 0.3, "title": "Campus lost-and-found tracker", "description": "A web app where students can report and search for lost items on campus."}, 0.2)
    assert d["wording"]["signal"] is None and d["sharedPhrases"] == []


# ── chunking (token-driven) ───────────────────────────────────────────────────────────────────
def word_budget(limit=190, verified=True):
    """A deterministic stand-in tokenizer: one token per whitespace-separated word plus two special tokens."""
    return eng.TokenBudget(lambda t: len(t.split()) + 2, limit, verified)


def test_ideas_that_fit_are_embedded_exactly_as_before():
    texts, cov = chunk_idea("Lost and found", "A web app where students report and search for lost items on campus.", word_budget())
    assert texts == [idea_text("Lost and found", "A web app where students report and search for lost items on campus.")]
    assert cov["sections"] == 1 and cov["complete"] is True and cov["verified"] == "tokenizer" and cov["tokens"] == 18


def test_coverage_is_never_complete_without_a_verified_token_count():
    short = ("Lost and found", "A web app where students report and search for lost items on campus.")
    assert chunk_idea(*short)[1]["complete"] is False and chunk_idea(*short)[1]["verified"] == "estimate"           # no budget given
    assert chunk_idea(*short, word_budget(verified=False))[1]["complete"] is False                                  # estimate only
    assert chunk_idea(*short, eng.TokenBudget(eng.estimate_tokens, 256, False))[1]["complete"] is False


def long_description(n=40):
    return " ".join(f"Sentence number {i} explains how sensors help farmers schedule irrigation for their crops." for i in range(n))


def test_long_ideas_are_split_into_title_prefixed_sections_that_fit_and_cover_every_sentence():
    b = word_budget()
    desc = long_description()
    texts, cov = chunk_idea("Farm idea", desc, b)
    assert texts[0] == idea_text("Farm idea", desc) and len(texts) == cov["sections"] + 1 and cov["sections"] > 1 and cov["complete"] is True
    assert all(t.startswith("Farm idea. ") for t in texts[1:]) and all(b.count(t) <= b.limit for t in texts[1:])     # title prefix and specials included
    joined = " ".join(texts[1:])
    assert all(f"Sentence number {i} " in joined for i in range(40))   # nothing in the middle or at the tail is lost


def test_sections_overlap_by_at_most_one_sentence():
    texts, _ = chunk_idea("Farm idea", long_description(), word_budget())
    for prev, nxt in zip(texts[1:], texts[2:]):
        shared = [i for i in range(40) if f"Sentence number {i} " in prev and f"Sentence number {i} " in nxt]
        assert len(shared) <= 1


def test_unpunctuated_walls_of_text_and_unspaced_scripts_are_cut_to_fit():
    b = word_budget()
    wall = " ".join(f"word{i}" for i in range(500))
    texts, cov = chunk_idea("Wall", wall, b)
    assert cov["sections"] > 1 and all(b.count(t) <= b.limit for t in texts[1:]) and cov["complete"] is True
    assert all(f"word{i}" in " ".join(texts[1:]) for i in (0, 249, 499))
    # no spaces at all (Chinese, long identifiers): cut by characters, still every section fits
    char_budget = eng.TokenBudget(lambda t: len(t) + 2, 120, True)
    cjk = "这是一个用于农业的智能灌溉系统的想法" * 30
    texts, cov = chunk_idea("农业", cjk, char_budget)
    assert cov["sections"] > 1 and all(char_budget.count(t) <= 120 for t in texts[1:])
    body = "".join(t.split(". ", 1)[1] for t in texts[1:]).replace(" ", "")
    assert body.startswith(cjk[:20]) and body.endswith(cjk[-20:]) and len(body) >= len(cjk)


def test_input_needing_more_than_the_maximum_sections_is_reported_incomplete():
    b = word_budget(limit=40)
    texts, cov = chunk_idea("Big", " ".join(f"Sentence {i} is here today." for i in range(200)), b)
    assert cov["sectionsNeeded"] > eng.MAX_SECTIONS and cov["sections"] == eng.MAX_SECTIONS == len(texts) - 1
    assert cov["complete"] is False                                                           # honest: the tail was not compared
    assert all(b.count(t) <= b.limit for t in texts[1:])


def test_enormous_title_cannot_crowd_out_the_body():
    b = word_budget(limit=60)
    texts, cov = chunk_idea("long " * 100, long_description(10), b)
    assert all(b.count(t) <= 60 for t in texts[1:]) and cov["sections"] >= 1 and "Sentence number 9 " in " ".join(texts[1:])


def test_a_miscounting_tokenizer_cannot_produce_an_oversized_section():
    # additive costs are approximate; the final per-section check must still hold
    odd = eng.TokenBudget(lambda t: len(t.split()) + 2 + t.count("irrigation"), 100, True)
    texts, cov = chunk_idea("Farm idea", long_description(30), odd)
    assert all(odd.count(t) <= 100 for t in texts[1:])


def test_estimate_is_pessimistic_by_design():
    assert eng.estimate_tokens("a1b2c3d4e5f6") >= 12 and eng.estimate_tokens("https://example.com/a?b=1") >= 15
    assert eng.estimate_tokens("한국어") >= 9 and eng.estimate_tokens("这是一个测试") >= 6
    assert eng.token_budget(object()).verified is False      # an embedder with no tokenizer falls back to the estimate


# ── merging section results ───────────────────────────────────────────────────────────────────
def test_merge_keeps_each_existing_idea_once_at_its_best_section():
    s0 = [{"idea_id": "a", "similarity": 0.5}, {"idea_id": "b", "similarity": 0.4}]
    s1 = [{"idea_id": "a", "similarity": 0.8}, {"idea_id": "c", "similarity": 0.4}]
    out = merge_matches([s0, s1], 5)
    assert [r["idea_id"] for r in out] == ["a", "b", "c"] and out[0]["similarity"] == 0.8 and out[0]["section"] == 1
    assert [r["idea_id"] for r in merge_matches([s0, s1], 2)] == ["a", "b"]           # ties broken by id → deterministic
    assert merge_matches([], 5) == []


# ── title vector cache (service) ──────────────────────────────────────────────────────────────
class CountingEmbedder:
    name, dim = "counting", 2

    def __init__(self): self.calls = []
    def encode(self, texts): self.calls.append(list(texts)); return [[float(len(t)), 1.0] for t in texts]


def test_reference_titles_are_encoded_once_and_in_one_batch():
    from app.services import ideas as svc
    svc._TITLE_VECS.clear()
    e = CountingEmbedder()
    first = svc._title_vectors(e, ["Alpha idea", "Beta idea", "Alpha idea"])
    assert e.calls == [["Alpha idea", "Beta idea"]] and first[0] == first[2]
    again = svc._title_vectors(e, ["Beta idea", "Alpha idea"])
    assert len(e.calls) == 1 and again == [first[1], first[0]]                         # served from cache, no new model call
    svc._title_vectors(e, ["Gamma idea"])
    assert e.calls[-1] == ["Gamma idea"]
    svc._TITLE_VECS.clear()


# ── request validation ────────────────────────────────────────────────────────────────────────
GOOD = {"title": "Rooftop solar planner", "description": "A tool that helps hostel residents plan rooftop solar panels and estimate savings."}


def test_valid_request_is_trimmed():
    m = CheckIn(**{**GOOD, "title": "  Rooftop solar planner \n", "domain": "  "})
    assert m.title == "Rooftop solar planner" and m.domain is None


@pytest.mark.parametrize("field,value", [("title", "   "), ("title", "\t\n"), ("description", " " * 40), ("description", "\n" * 30),
                                         ("description", "!!! ??? ... --- !!! ??? ... --- ###"), ("title", "---"), ("title", "\x00\x00\x00"), ("description", "short words")])
def test_blank_or_wordless_text_is_rejected(field, value):
    with pytest.raises(ValidationError):
        CheckIn(**{**GOOD, field: value})


@pytest.mark.parametrize("title,description", [
    ("农业灌溉系统", "这是一个用于农业的智能灌溉系统的想法，帮助农民节约用水并提高产量。"),                                  # Chinese: no spaces between words
    ("スマート灌漑", "これは農家のための賢い灌漑システムのアイデアで、水を節約し収穫量を増やします。"),                               # Japanese
    ("किसान सिंचाई", "किसानों के लिए एक स्मार्ट सिंचाई प्रणाली जो पानी बचाती है"),                                          # Hindi
    ("ري ذكي", "نظام ري ذكي للمزارعين يوفر المياه ويزيد المحصول بشكل كبير"),                                              # Arabic
    ("ระบบรดน้ำ", "ระบบรดน้ำอัจฉริยะสำหรับเกษตรกรที่ช่วยประหยัดน้ำและเพิ่มผลผลิต"),                                         # Thai (no spaces)
    ("Café résumé", "Une application qui aide les agriculteurs à planifier l’irrigation de leurs cultures."),
    ("Умный полив", "Приложение, которое помогает фермерам планировать полив своих полей."),
])
def test_legitimate_text_in_any_script_is_accepted_unchanged(title, description):
    m = CheckIn(title=title, description=description)
    assert m.title == title and m.description == description


@pytest.mark.parametrize("value", ["\u200b" * 40, "\u200b\u200d\ufeff" * 15, "🌱🌱🌱🌱🌱🌱🌱🌱🌱🌱🌱🌱🌱🌱🌱🌱🌱🌱🌱🌱🌱🌱", "。。。。。。。。。。。。。。。。。。。。。。", "…… ,,,, ---- ????? !!!!!", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"])
def test_meaningless_descriptions_are_still_rejected(value):
    with pytest.raises(ValidationError):
        CheckIn(**{**GOOD, "description": value})


def test_control_characters_are_removed_not_stored():
    m = CheckIn(**{**GOOD, "description": GOOD["description"] + "\x00\x07 end"})
    assert "\x00" not in m.description and "\x07" not in m.description and m.description.endswith("end")
    assert "\n" in CheckIn(**{**GOOD, "description": "line one is here\nline two is here too"}).description      # ordinary newlines survive


def test_unknown_fields_and_overlong_text_are_still_rejected():
    with pytest.raises(ValidationError):
        CheckIn(**GOOD, owner_id="x")
    with pytest.raises(ValidationError):
        CheckIn(**{**GOOD, "description": "word " * 1200})


# ── a copied description under a new title ────────────────────────────────────────────────────
def test_changed_title_does_not_hide_a_copied_description():
    desc = "A scheduling system for students to reserve shared lab equipment slots."
    w = eng.best_wording("Booking tool for science labs", desc, "Lab equipment booking system", desc)
    assert w["signal"] == "exact" and w["scope"] == "description"
    same_title = eng.best_wording("Lab equipment booking system", desc, "Lab equipment booking system", desc)
    assert same_title["signal"] == "exact"
    d = eng.overlap_dimensions("Booking tool for science labs", desc, None, {"similarity": 0.8, "title": "Lab equipment booking system", "description": desc}, 0.3)
    assert d["wording"]["signal"] == "exact" and d["sharedPhrases"]


def test_different_titles_and_descriptions_stay_unflagged():
    w = eng.best_wording("Hive monitor", "Acoustic sensors inside beehives stream colony health.", "Lab equipment booking system", "A scheduling system for students to reserve shared lab equipment slots.")
    assert w["signal"] is None


# ── Unicode-aware wording analysis ────────────────────────────────────────────────────────────
HINDI = "किसानों के लिए एक स्मार्ट सिंचाई प्रणाली जो मिट्टी की नमी बताती है"
RUSSIAN = "Приложение помогает фермерам планировать полив полей по данным датчиков влажности"


def test_tokeniser_keeps_accented_indic_and_cyrillic_words_whole():
    assert eng._words("Résumé café naïve") == ["résumé", "café", "naïve"]
    assert eng._words(HINDI)[:3] == ["किसानों", "के", "लिए"] and len(eng._words(HINDI)) == 13     # matras are not word breaks
    assert eng._words("Умный ПОЛИВ, учёта") == ["умный", "полив", "учёта"]
    assert eng._words("这是一个，测试。") == list("这是一个测试")                                       # unspaced scripts: one token per character
    assert eng._words("a​b ‍﻿") == ["ab"]                                               # invisible format characters never split or create words
    assert word_count("!!! ... 🌱🌱 ​") == 0 and word_count("aaaa") == 1


def test_normalisation_makes_equivalent_spellings_identical():
    nfc, nfd = "Café menu planner for the campus canteen", "Café MENU planner for the campus canteen!"
    assert wording_overlap(nfc, nfd)["signal"] == "exact"
    assert wording_overlap("Straße Karte für Bauern jetzt hier", "STRASSE karte FÜR bauern jetzt hier")["signal"] == "exact"
    assert wording_overlap("ＳＭＡＲＴ ｆａｒｍ ｄａｔａ ｔｏｏｌ", "smart farm data tool")["signal"] == "exact"      # full-width forms


def test_genuinely_identical_multilingual_text_is_exact_and_different_text_is_not():
    for text in (HINDI, RUSSIAN, "这是一个用于农业的智能灌溉系统的想法", "これは農家のための賢い灌漑システムです"):
        assert wording_overlap(text, text.upper())["signal"] == "exact", text
    assert wording_overlap(HINDI, "छात्रों के लिए एक स्मार्ट ट्यूशन मंच जो शिक्षक खोजने में मदद करता है")["signal"] is None
    assert wording_overlap(RUSSIAN, "Платформа соединяет студентов с наставниками для подготовки к экзаменам")["signal"] is None
    assert wording_overlap("这是一个用于农业的智能灌溉系统的想法", "这是一个用于教育的在线辅导平台的想法")["signal"] is None


def test_non_ascii_text_no_longer_collapses_into_a_false_exact():
    """Before: every non-ASCII letter was discarded, so these two different ideas both reduced to 'for farms app with sensors'."""
    a, b = "Умный полив for farms app with sensors", "Система учёта for farms app with sensors"
    assert wording_overlap(a, b)["signal"] is None
    assert wording_overlap("café ☕ ☕ ☕ ☕ ☕", "résumé ✓ ✓ ✓ ✓ ✓")["signal"] is None      # symbols/emoji carry no wording
    assert wording_overlap("🌱🌱🌱 🌱🌱🌱 🌱🌱🌱 🌱🌱🌱", "🌱🌱🌱 🌱🌱🌱 🌱🌱🌱 🌱🌱🌱")["signal"] is None
    assert wording_overlap("किसान ऐप सिंचाई", "किसान ऐप सिंचाई")["signal"] is None             # 3 tokens: below the minimum content for 'exact'


def test_mixed_script_ideas_compare_on_every_script():
    a = "Smart सिंचाई scheduler for किसान farms using soil sensors and weather data"
    assert wording_overlap(a, a)["signal"] == "exact"
    assert wording_overlap(a, a.replace("किसान", "छात्र"))["signal"] == "near_duplicate"       # one word edited → shared sequences remain
    assert wording_overlap(a, a.replace("सिंचाई", "पानी").replace("किसान", "छात्र"))["signal"] in ("near_duplicate", None)


def test_unspaced_scripts_use_character_runs_and_minor_edits_are_near_duplicates():
    a = "这是一个用于农业的智能灌溉系统的想法，帮助农民节约用水并提高产量，同时降低成本。"
    assert wording_overlap(a, a.replace("农民", "农户"))["signal"] == "near_duplicate"
    assert wording_overlap(a, a + "该系统还提供天气预报。")["signal"] == "near_duplicate"        # copy plus padding
    assert wording_overlap(a, "这是一个面向大学生的在线辅导平台，连接学生与导师，提供课程答疑和考试辅导服务。")["signal"] is None


def test_explanations_work_on_non_ascii_text_and_never_invent_overlap():
    a = "Приложение для фермеров: датчики влажности почвы подсказывают время полива."
    b = "Система для садоводов: датчики влажности почвы показывают время полива."
    p = shared_phrases(a, b)
    assert "датчики влажности почвы" in p
    assert "влажности" not in shared_terms(a, b, exclude_phrases=p)
    assert shared_phrases("这是一个测试想法", "这是一个测试方案") == [] and shared_terms("这是一个测试想法", "这是一个测试方案") == []
    assert set(shared_terms("C++ and C# tooling for lost-and-found", "tooling in C++ for lost-and-found desks")) == {"c++", "tooling", "lost-and-found"}


def test_wording_still_cannot_decide_anything_for_non_ascii_text():
    sig = wording_overlap(HINDI, HINDI)["signal"]
    assert sig == "exact"
    assert duplicate_signal([(0.30, sig)], 0.45) is None and classify(0.30, 50, 0.75, 0.45, duplicate_signal([(0.30, sig)], 0.45))["level"] == "no_significant_match"
