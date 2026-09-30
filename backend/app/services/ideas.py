"""Originality check: embed → pgvector cosine search → explainable verdict → (maybe) reviewer queue."""
from __future__ import annotations

import json

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


def check(db: Db, user_id: str, title: str, description: str, domain: str | None, opportunity_id: str | None) -> dict:
    s = get_settings()
    emb = eng.get_embedder()
    try:
        vec, title_vec = emb.encode([eng.idea_text(title, description), title])
    except eng.EmbeddingUnavailable:
        raise unavailable("Originality analysis is temporarily unavailable on this server. Your idea was not scored and nothing was saved.")

    with db.service():
        corpus = int(db.val("select count(*) from public.idea_embeddings e join public.ideas i on i.id = e.idea_id where e.model = :m and i.kind = 'reference'", m=emb.name))
        v = vector_literal(vec)
        refs = db.all("select idea_id::text as idea_id, title, description, source, similarity from private.match_reference_ideas(cast(:v as extensions.vector), :m, 5)", v=v, m=emb.name)
        peers = db.all("select idea_id::text as idea_id, title, similarity from private.match_submission_overlaps(cast(:v as extensions.vector), :m, cast(:o as uuid), 3)", v=v, m=emb.name, o=user_id)
        domain_id = db.val("select id::text from public.interests where lower(name) = lower(:d) or slug = lower(:d)", d=domain) if domain else None

        ref_title_vecs = emb.encode([r["title"] for r in refs]) if refs else []
        matches = []
        for r, tv in zip(refs, ref_title_vecs):
            tsim = sum(a * b for a, b in zip(title_vec, tv))
            matches.append({"id": r["idea_id"], "title": r["title"], "description": r["description"][:240], "source": r["source"], "similarity": _pct(r["similarity"]),
                            "overlap": eng.overlap_dimensions(title, description, domain, {"similarity": r["similarity"], "title": r["title"], "description": r["description"], "domain": None}, tsim)})
        top_ref = refs[0]["similarity"] if refs else None
        top_peer = peers[0]["similarity"] if peers else None
        candidates = [x for x in (top_ref, top_peer) if x is not None]
        top = max(candidates) if candidates else None
        verdict = eng.classify(top, corpus, s.similarity_review_threshold, s.similarity_related_threshold)
        status = {"high_overlap": "needs_review", "related_work": "worth_reviewing"}.get(verdict["level"], "novel")
        analysis = {**verdict, "method": METHOD, "corpusSize": corpus, "peerOverlaps": len(peers), "disclaimer": eng.DISCLAIMER,
                    "thresholds": {"review": s.similarity_review_threshold, "related": s.similarity_related_threshold}}
        idea_id = db.val("""insert into public.ideas (owner_id, kind, title, description, domain_id, status, novelty_score, top_similarity, embedding_model, search_backend,
                                                     analysis, confidence, opportunity_id)
                            values (cast(:o as uuid), 'submission', :t, :d, cast(:dom as uuid), cast(:st as public.idea_status), :nov, :top, :m, 'pgvector-hnsw-cosine',
                                    cast(:a as jsonb), :c, cast(:opp as uuid)) returning id::text""",
                         o=user_id, t=title.strip(), d=description.strip(), dom=domain_id, st=status, nov=None if top is None else min(99.0, _pct(1 - top)),
                         top=None if top is None else _pct(top), m=emb.name, a=json.dumps(analysis), c=verdict["confidence"], opp=opportunity_id)
        db.run("insert into public.idea_embeddings (idea_id, model, embedding) values (cast(:i as uuid), :m, cast(:v as extensions.vector))", i=idea_id, m=emb.name, v=v)
        rank = 0
        for m in matches:
            rank += 1
            db.run("""insert into public.idea_matches (idea_id, matched_idea_id, similarity, rank, visible_to_owner, overlap) values (cast(:i as uuid), cast(:m as uuid), :s, :r, true, cast(:ov as jsonb))
                      on conflict do nothing""", i=idea_id, m=m["id"], s=m["similarity"], r=rank, ov=json.dumps(m["overlap"]))
        for p in peers:          # other students' submissions: recorded for reviewers, never shown to the owner
            rank += 1
            db.run("""insert into public.idea_matches (idea_id, matched_idea_id, similarity, rank, visible_to_owner, overlap) values (cast(:i as uuid), cast(:m as uuid), :s, :r, false, '{}'::jsonb)
                      on conflict do nothing""", i=idea_id, m=p["idea_id"], s=_pct(p["similarity"]), r=rank)
        if verdict["needsReview"]:
            db.run("insert into public.reviews (idea_id) values (cast(:i as uuid))", i=idea_id)
            notifications.notify(db, user_id, "originality_review", "Your idea was queued for human review",
                                 f"“{title.strip()[:120]}” is semantically close to existing work, so a reviewer will take a look.", "/originality/history", f"idea-review:{idea_id}")
    events.record(db, user_id, "idea_submit", opportunity_id, {"ideaId": idea_id, "level": verdict["level"]})
    log_activity(db, user_id, "idea_checked", f"Checked originality of “{title.strip()[:100]}”", "/originality/history")
    return get_idea(db, user_id, idea_id)


def get_idea(db: Db, user_id: str, idea_id: str) -> dict | None:
    r = db.one("""select i.id::text as id, i.title, i.description, i.status::text as status, i.top_similarity::float as top, i.novelty_score::float as novelty, i.confidence, i.analysis,
                         i.embedding_model, i.search_backend, i.created_at, i.opportunity_id::text as opp_id, o.title as opp_title, d.name as domain
                    from public.ideas i left join public.opportunities o on o.id = i.opportunity_id left join public.interests d on d.id = i.domain_id
                   where i.id = cast(:i as uuid) and i.owner_id = cast(:u as uuid)""", i=idea_id, u=user_id)
    if not r:
        return None
    matches = db.all("""select m.matched_idea_id::text as id, m.similarity::float as similarity, m.rank, m.overlap, x.title, left(x.description, 240) as description, x.source
                          from public.idea_matches m join public.ideas x on x.id = m.matched_idea_id where m.idea_id = cast(:i as uuid) and m.visible_to_owner order by m.rank""", i=idea_id)
    with db.service():
        review = db.one("select id::text as id, state::text as state, decided_at from public.reviews where idea_id = cast(:i as uuid)", i=idea_id)
        decisions = db.all("select decision::text as decision, note, created_at from public.review_decisions where review_id = cast(:r as uuid) order by created_at", r=review["id"]) if review else []
    a = r["analysis"] or {}
    return {"id": r["id"], "title": r["title"], "description": r["description"], "domain": r["domain"], "status": r["status"], "createdAt": r["created_at"],
            "topSimilarity": r["top"], "confidence": r["confidence"], "verdict": {k: a.get(k) for k in ("level", "label", "message", "needsReview")},
            "method": {"description": a.get("method"), "model": r["embedding_model"], "search": r["search_backend"], "corpusSize": a.get("corpusSize"), "thresholds": a.get("thresholds")},
            "disclaimer": a.get("disclaimer", eng.DISCLAIMER), "peerOverlapsExist": bool(a.get("peerOverlaps")),
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
