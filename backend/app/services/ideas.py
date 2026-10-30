"""Originality check: embed → pgvector cosine search → explainable verdict → (maybe) reviewer queue."""
from __future__ import annotations

import json
import threading
from collections import OrderedDict

from ..core.config import get_settings
from ..core.errors import not_found, unavailable
from ..db.session import Db, vector_literal
from ..engines import originality as eng
from . import notifications
from .activity import log_activity
from . import events

METHOD = "MiniLM-L6-v2 (384-d) embeddings · pgvector HNSW cosine similarity"


def _pct(x: float) -> float:
    return round(max(0.0, min(1.0, x)) * 100, 1)


_TITLE_VECS: "OrderedDict[tuple[str, str], list[float]]" = OrderedDict()   # reference titles never change, so their vectors are computed once per process
_TITLE_VECS_MAX, _title_lock = 4096, threading.Lock()


def _title_vectors(emb, titles: list[str]) -> list[list[float]]:
    with _title_lock:
        have = {t: _TITLE_VECS[(emb.name, t)] for t in titles if (emb.name, t) in _TITLE_VECS}
    missing = list(dict.fromkeys(t for t in titles if t not in have))
    if missing:                                    # one batched encode for everything not seen before
        have.update(zip(missing, emb.encode(missing)))
        with _title_lock:
            for t in missing:
                _TITLE_VECS[(emb.name, t)] = have[t]
            while len(_TITLE_VECS) > _TITLE_VECS_MAX:
                _TITLE_VECS.popitem(last=False)
    return [have[t] for t in titles]


def _own_previous(db: Db, user_id: str, model: str, vecs: list[list[float]], related: float) -> list[dict]:
    """The caller's OWN earlier checks that resemble this one. Exact (not HNSW) ordering — the per-owner set is small and a filtered ANN
    scan could return too few rows. Filtered by owner_id explicitly; the result is only ever shown to that owner and reviewers."""
    out = []
    for v in vecs:
        out.append(db.all("""select i.id::text as idea_id, i.title, i.description, i.status::text as status, i.created_at,
                                    greatest(0::double precision, 1 - (e.embedding operator(extensions.<=>) cast(:v as extensions.vector))) as similarity
                               from public.idea_embeddings e join public.ideas i on i.id = e.idea_id
                              where i.owner_id = cast(:u as uuid) and i.kind = 'submission' and e.model = :m
                              order by (e.embedding operator(extensions.<=>) cast(:v as extensions.vector)) + 0 limit 3""", v=vector_literal(v), u=user_id, m=model))
    return [r for r in eng.merge_matches(out, 3) if r["similarity"] >= related]



def check(db: Db, user_id: str, title: str, description: str, domain: str | None, opportunity_id: str | None) -> dict:
    s = get_settings()
    emb = eng.get_embedder()
    title, description = title.strip(), description.strip()
    texts, coverage = eng.chunk_idea(title, description, eng.token_budget(emb))
    try:
        encoded = emb.encode(texts + [title])
    except eng.EmbeddingUnavailable:
        raise unavailable("Originality analysis is temporarily unavailable on this server. Your idea was not scored and nothing was saved.")
    vecs, title_vec = encoded[:-1], encoded[-1]
    vec = vecs[0]                                  # the whole-idea vector is what gets stored, exactly as before

    with db.service():
        corpus = int(db.val("select count(*) from public.idea_embeddings e join public.ideas i on i.id = e.idea_id where e.model = :m and i.kind = 'reference'", m=emb.name))
        v = vector_literal(vec)
        # every section is searched; each existing idea is kept once, at its best-matching section (no duplicate matches from overlapping sections)
        refs = eng.merge_matches([db.all("select idea_id::text as idea_id, title, description, source, similarity from private.match_reference_ideas(cast(:v as extensions.vector), :m, 5)", v=vector_literal(x), m=emb.name) for x in vecs], 5)
        peers = eng.merge_matches([db.all("select idea_id::text as idea_id, title, similarity from private.match_submission_overlaps(cast(:v as extensions.vector), :m, cast(:o as uuid), 3)", v=vector_literal(x), m=emb.name, o=user_id) for x in vecs], 3)
        own = _own_previous(db, user_id, emb.name, vecs, s.similarity_related_threshold)
        peer_text = {r["id"]: r["description"] for r in db.all("select id::text as id, description from public.ideas where id = any(cast(:ids as uuid[]))", ids=[p["idea_id"] for p in peers])} if peers else {}
        domain_id = db.val("select id::text from public.interests where lower(name) = lower(:d) or slug = lower(:d)", d=domain) if domain else None

        ref_title_vecs = _title_vectors(emb, [r["title"] for r in refs])
        matches = []
        for r, tv in zip(refs, ref_title_vecs):
            tsim = sum(a * b for a, b in zip(title_vec, tv))
            matches.append({"id": r["idea_id"], "title": r["title"], "description": r["description"][:240], "source": r["source"], "similarity": _pct(r["similarity"]), "section": r["section"],
                            "overlap": eng.overlap_dimensions(title, description, domain, {"similarity": r["similarity"], "title": r["title"], "description": r["description"], "domain": None}, tsim)})
        # Wording signals that reach the submitter, the verdict and the review queue come from the reference corpus ONLY. Another student's private
        # submission is never described to this owner — not even as "identical wording". Peer wording is recorded below for reviewers.
        wording = eng.duplicate_signal([(r["similarity"], m["overlap"]["wording"]["signal"]) for r, m in zip(refs, matches)], s.similarity_related_threshold)
        peer_wording = [eng.best_wording(title, description, p["title"], peer_text.get(p["idea_id"], ""))["signal"] for p in peers]
        top_ref = refs[0]["similarity"] if refs else None
        top_peer = peers[0]["similarity"] if peers else None
        candidates = [x for x in (top_ref, top_peer) if x is not None]
        top = max(candidates) if candidates else None
        verdict = eng.classify(top, corpus, s.similarity_review_threshold, s.similarity_related_threshold, wording)
        status = {"high_overlap": "needs_review", "related_work": "worth_reviewing"}.get(verdict["level"], "novel")
        analysis = {**verdict, "method": METHOD, "corpusSize": corpus, "peerOverlaps": len(peers), "disclaimer": eng.DISCLAIMER, "coverage": coverage, "duplicateSignal": wording,
                    "thresholds": {"review": s.similarity_review_threshold, "related": s.similarity_related_threshold}, "displayFloor": s.similarity_display_floor}
        idea_id = db.val("""insert into public.ideas (owner_id, kind, title, description, domain_id, status, novelty_score, top_similarity, embedding_model, search_backend,
                                                     analysis, confidence, opportunity_id)
                            values (cast(:o as uuid), 'submission', :t, :d, cast(:dom as uuid), cast(:st as public.idea_status), :nov, :top, :m, 'pgvector-hnsw-cosine',
                                    cast(:a as jsonb), :c, cast(:opp as uuid)) returning id::text""",
                         o=user_id, t=title, d=description, dom=domain_id, st=status, nov=None if top is None else min(99.0, _pct(1 - top)),
                         top=None if top is None else _pct(top), m=emb.name, a=json.dumps(analysis), c=verdict["confidence"], opp=opportunity_id)
        db.run("insert into public.idea_embeddings (idea_id, model, embedding) values (cast(:i as uuid), :m, cast(:v as extensions.vector))", i=idea_id, m=emb.name, v=v)
        rank = 0
        for m in matches:
            rank += 1
            # weak matches are kept for reviewers but not shown to the submitter — except the closest one, so the headline percentage always has its explanation
            shown = rank == 1 or m["similarity"] >= s.similarity_display_floor * 100
            db.run("""insert into public.idea_matches (idea_id, matched_idea_id, similarity, rank, visible_to_owner, overlap) values (cast(:i as uuid), cast(:m as uuid), :s, :r, :vis, cast(:ov as jsonb))
                      on conflict do nothing""", i=idea_id, m=m["id"], s=m["similarity"], r=rank, vis=shown, ov=json.dumps(m["overlap"]))
        for p, sig in zip(peers, peer_wording):     # other students' submissions: recorded for reviewers, never shown to the owner
            rank += 1
            db.run("""insert into public.idea_matches (idea_id, matched_idea_id, similarity, rank, visible_to_owner, overlap) values (cast(:i as uuid), cast(:m as uuid), :s, :r, false, cast(:ov as jsonb))
                      on conflict do nothing""", i=idea_id, m=p["idea_id"], s=_pct(p["similarity"]), r=rank, ov=json.dumps({"wording": {"signal": sig}}))
        for o in own:          # the owner's own earlier checks: history is untouched, this only links to it. Never affects the verdict or the review queue.
            rank += 1
            ov = {"relation": "own_previous", "semantic": round(o["similarity"], 3), "wording": eng.best_wording(title, description, o["title"], o["description"])}
            db.run("""insert into public.idea_matches (idea_id, matched_idea_id, similarity, rank, visible_to_owner, overlap) values (cast(:i as uuid), cast(:m as uuid), :s, :r, true, cast(:ov as jsonb))
                      on conflict do nothing""", i=idea_id, m=o["idea_id"], s=_pct(o["similarity"]), r=rank, ov=json.dumps(ov))
        if verdict["needsReview"]:
            db.run("insert into public.reviews (idea_id) values (cast(:i as uuid))", i=idea_id)
            notifications.notify(db, user_id, "originality_review", "Your idea was queued for human review",
                                 f"“{title[:120]}” is semantically close to existing work, so a reviewer will take a look.", "/originality/history", f"idea-review:{idea_id}")
    events.record(db, user_id, "idea_submit", opportunity_id, {"ideaId": idea_id, "level": verdict["level"]})
    log_activity(db, user_id, "idea_checked", f"Checked originality of “{title[:100]}”", "/originality/history")
    return get_idea(db, user_id, idea_id)


def get_idea(db: Db, user_id: str, idea_id: str) -> dict | None:
    r = db.one("""select i.id::text as id, i.title, i.description, i.status::text as status, i.top_similarity::float as top, i.novelty_score::float as novelty, i.confidence, i.analysis,
                         i.embedding_model, i.search_backend, i.created_at, i.opportunity_id::text as opp_id, o.title as opp_title, d.name as domain
                    from public.ideas i left join public.opportunities o on o.id = i.opportunity_id left join public.interests d on d.id = i.domain_id
                   where i.id = cast(:i as uuid) and i.owner_id = cast(:u as uuid)""", i=idea_id, u=user_id)
    if not r:
        return None
    rows = db.all("""select m.matched_idea_id::text as id, m.similarity::float as similarity, m.rank, m.overlap, x.title, left(x.description, 240) as description, x.source, x.kind::text as kind,
                            x.status::text as status, x.created_at
                       from public.idea_matches m join public.ideas x on x.id = m.matched_idea_id where m.idea_id = cast(:i as uuid) and m.visible_to_owner order by m.rank""", i=idea_id)
    matches = [m for m in rows if (m["overlap"] or {}).get("relation") != "own_previous"]
    previous = [m for m in rows if (m["overlap"] or {}).get("relation") == "own_previous"]
    with db.service():     # RLS hides these rows from the owner by design; only their COUNT is exposed
        hidden = int(db.val("""select count(*) from public.idea_matches m join public.ideas x on x.id = m.matched_idea_id
                                where m.idea_id = cast(:i as uuid) and not m.visible_to_owner and x.kind = 'reference'""", i=idea_id) or 0)
    with db.service():
        review = db.one("select id::text as id, state::text as state, decided_at from public.reviews where idea_id = cast(:i as uuid)", i=idea_id)
        decisions = db.all("select decision::text as decision, note, created_at from public.review_decisions where review_id = cast(:r as uuid) order by created_at", r=review["id"]) if review else []
    a = r["analysis"] or {}
    return {"id": r["id"], "title": r["title"], "description": r["description"], "domain": r["domain"], "status": r["status"], "createdAt": r["created_at"],
            "topSimilarity": r["top"], "confidence": r["confidence"], "verdict": {k: a.get(k) for k in ("level", "label", "message", "needsReview")},
            "method": {"description": a.get("method"), "model": r["embedding_model"], "search": r["search_backend"], "corpusSize": a.get("corpusSize"), "thresholds": a.get("thresholds")},
            "disclaimer": a.get("disclaimer", eng.DISCLAIMER), "peerOverlapsExist": bool(a.get("peerOverlaps")),
            "coverage": a.get("coverage"), "duplicateSignal": a.get("duplicateSignal"),
            "display": {"floor": a.get("displayFloor"), "hiddenWeakMatches": hidden},
            "previousChecks": [{"id": m["id"], "title": m["title"], "status": m["status"], "checkedAt": m["created_at"], "similarity": m["similarity"], "wording": m["overlap"].get("wording", {}).get("signal")} for m in previous],
            "matches": [{"id": m["id"], "title": m["title"], "description": m["description"], "source": m["source"], "similarity": m["similarity"], "overlap": m["overlap"]} for m in matches],
            "opportunity": {"id": r["opp_id"], "title": r["opp_title"]} if r["opp_id"] else None,
            "review": None if not review else {"state": review["state"], "decidedAt": review["decided_at"],
                                                "decisions": [{"decision": d["decision"], "note": d["note"], "at": d["created_at"]} for d in decisions]}}


def history(db: Db, user_id: str) -> list[dict]:
    rows = db.all("""select i.id::text as id, i.title, i.status::text as status, i.top_similarity::float as top, i.analysis ->> 'level' as level, i.created_at,
                            (select state::text from public.reviews r where r.idea_id = i.id) as review_state
                       from public.ideas i where i.owner_id = cast(:u as uuid) and i.kind = 'submission' order by i.created_at desc""", u=user_id)
    return [{"id": r["id"], "title": r["title"], "status": r["status"], "topSimilarity": r["top"], "level": r["level"], "createdAt": r["created_at"], "reviewState": r["review_state"]} for r in rows]


def delete_idea(db: Db, user_id: str, idea_id: str) -> bool:
    if not db.val("select 1 from public.ideas where id = cast(:i as uuid) and owner_id = cast(:u as uuid)", i=idea_id, u=user_id):
        return False
    with db.service():
        db.run("delete from public.ideas where id = cast(:i as uuid) and owner_id = cast(:u as uuid)", i=idea_id, u=user_id)
    return True
