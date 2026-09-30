"""Raster -> clean vector geometry. numpy/scipy/Pillow only (no potrace / OpenCV needed).

  coverage map (0..1, anti-aliased)  ->  sub-pixel contours (marching squares at 0.5 on a 4x bicubic upsample)
                                     ->  corner detection  ->  straight-line fits + Schneider cubic Bezier fits
                                     ->  crisp corners (adjacent straight edges are snapped to their exact intersection)

Nothing here knows about NIRMAAN; trace_logo.py drives it.
"""
from __future__ import annotations

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

UP = 4  # upsample factor used before contouring


# ── contours ────────────────────────────────────────────────────────────────────────────────
def upsample(field: np.ndarray, sigma: float = 0.55) -> np.ndarray:
    h, w = field.shape
    im = Image.fromarray(field.astype(np.float32), mode="F").resize((w * UP, h * UP), Image.BICUBIC)
    return ndi.gaussian_filter(np.asarray(im, dtype=np.float64), sigma)


def marching_squares(F: np.ndarray, level: float = 0.5) -> list[np.ndarray]:
    """Closed contours of F == level as (N,2) arrays of (x, y) in F's index space."""
    F = np.pad(F, 1, constant_values=0.0)            # guarantees every contour closes
    H, W = F.shape
    a, b = F[:-1, :-1] >= level, F[:-1, 1:] >= level
    c, d = F[1:, 1:] >= level, F[1:, :-1] >= level   # corners: a=TL b=TR c=BR d=BL
    case = a * 8 + b * 4 + c * 2 + d * 1
    rows, cols = np.nonzero((case != 0) & (case != 15))

    def interp(p0, p1, v0, v1):
        t = (level - v0) / (v1 - v0) if v1 != v0 else 0.5
        return (p0[0] + t * (p1[0] - p0[0]), p0[1] + t * (p1[1] - p0[1]))

    # edge ids:  top ('h', r, c)  bottom ('h', r+1, c)  left ('v', r, c)  right ('v', r, c+1)
    segs: list[tuple[tuple, tuple]] = []
    pts: dict[tuple, tuple[float, float]] = {}
    for r, cc in zip(rows, cols):
        v = {"a": F[r, cc], "b": F[r, cc + 1], "c": F[r + 1, cc + 1], "d": F[r + 1, cc]}
        P = {"a": (cc, r), "b": (cc + 1, r), "c": (cc + 1, r + 1), "d": (cc, r + 1)}
        top, right, bottom, left = ("h", r, cc), ("v", r, cc + 1), ("h", r + 1, cc), ("v", r, cc)
        pts[top] = interp(P["a"], P["b"], v["a"], v["b"]); pts[right] = interp(P["b"], P["c"], v["b"], v["c"])
        pts[bottom] = interp(P["d"], P["c"], v["d"], v["c"]); pts[left] = interp(P["a"], P["d"], v["a"], v["d"])
        k = int(case[r, cc])
        table = {1: [(left, bottom)], 2: [(bottom, right)], 3: [(left, right)], 4: [(top, right)], 6: [(top, bottom)], 7: [(left, top)],
                 8: [(left, top)], 9: [(top, bottom)], 11: [(top, right)], 12: [(left, right)], 13: [(bottom, right)], 14: [(left, bottom)]}
        if k in (5, 10):                                   # saddle: decide by the cell centre
            centre = (v["a"] + v["b"] + v["c"] + v["d"]) / 4 >= level
            # centre inside => the two inside corners are joined, so the contour wraps each OUTSIDE corner (and vice versa)
            if k == 5: segs += [(left, top), (bottom, right)] if centre else [(left, bottom), (top, right)]
            else:      segs += [(left, bottom), (top, right)] if centre else [(left, top), (bottom, right)]
        else:
            segs += table[k]
    adj: dict[tuple, list[tuple]] = {}
    for s, e in segs:
        adj.setdefault(s, []).append(e); adj.setdefault(e, []).append(s)
    seen: set[tuple] = set(); loops: list[np.ndarray] = []
    for start in adj:
        if start in seen: continue
        loop, prev, cur = [], None, start
        while True:
            seen.add(cur); loop.append(pts[cur])
            nxt = [n for n in adj[cur] if n != prev and n not in seen] or [n for n in adj[cur] if n == start and n != prev]
            if not nxt: break
            prev, cur = cur, nxt[0]
            if cur == start: break
        if len(loop) > 8:
            arr = np.array(loop) - 1.0                     # undo the padding
            loops.append(arr)
    return loops


def to_source(loop_up: np.ndarray, origin=(0.0, 0.0)) -> np.ndarray:
    """upsampled index space -> source continuous coordinates (pixel i covers [i, i+1])."""
    return (loop_up + 0.5) / UP + np.array(origin)


# ── geometry helpers ───────────────────────────────────────────────────────────────────────
def _unit(v):
    n = np.linalg.norm(v); return v / n if n > 1e-12 else v


def _corners(P: np.ndarray, w: int, thresh_deg: float) -> list[int]:
    n = len(P); idx = np.arange(n)
    v1 = P[idx] - P[(idx - w) % n]; v2 = P[(idx + w) % n] - P[idx]
    ang = np.degrees(np.arccos(np.clip((v1 * v2).sum(1) / (np.linalg.norm(v1, axis=1) * np.linalg.norm(v2, axis=1) + 1e-12), -1, 1)))
    out = []
    for i in range(n):
        if ang[i] >= thresh_deg and ang[i] == ang[[(i + k) % n for k in range(-w, w + 1)]].max():
            if not out or (i - out[-1]) > w: out.append(i)
    if len(out) > 1 and (out[0] + n - out[-1]) <= w: out.pop()
    return out


def _line_fit(pts: np.ndarray):
    c = pts.mean(0); u, s, vt = np.linalg.svd(pts - c); d = vt[0]
    resid = np.abs((pts - c) @ np.array([-d[1], d[0]]))
    return c, d, resid.max()


def _intersect(c1, d1, c2, d2):
    A = np.array([d1, -d2]).T
    if abs(np.linalg.det(A)) < 1e-6: return None
    t = np.linalg.solve(A, c2 - c1)
    return c1 + t[0] * d1


# ── Schneider cubic Bezier fitting ─────────────────────────────────────────────────────────
def _bez(c, t):
    t = np.asarray(t)[:, None]; mt = 1 - t
    return mt ** 3 * c[0] + 3 * mt ** 2 * t * c[1] + 3 * mt * t ** 2 * c[2] + t ** 3 * c[3]


def _bez_d1(c, t):
    t = np.asarray(t)[:, None]; mt = 1 - t
    return 3 * mt ** 2 * (c[1] - c[0]) + 6 * mt * t * (c[2] - c[1]) + 3 * t ** 2 * (c[3] - c[2])


def _bez_d2(c, t):
    t = np.asarray(t)[:, None]
    return 6 * (1 - t) * (c[2] - 2 * c[1] + c[0]) + 6 * t * (c[3] - 2 * c[2] + c[1])


def _fit_cubic(P, t1, t2, err):
    if len(P) == 2:
        d = np.linalg.norm(P[1] - P[0]) / 3
        return [np.array([P[0], P[0] + t1 * d, P[1] + t2 * d, P[1]])]
    u = np.r_[0, np.cumsum(np.linalg.norm(np.diff(P, axis=0), axis=1))]; u /= u[-1]
    c = _generate(P, u, t1, t2)
    for _ in range(6):
        e, split = _max_err(P, c, u)
        if e < err: return [c]
        u = _reparam(P, c, u); c = _generate(P, u, t1, t2)
    e, split = _max_err(P, c, u)
    if e < err: return [c]
    split = min(max(split, 1), len(P) - 2)
    tc = _unit(P[split - 1] - P[split + 1])
    return _fit_cubic(P[: split + 1], t1, tc, err) + _fit_cubic(P[split:], -tc, t2, err)


def _generate(P, u, t1, t2):
    p0, p3 = P[0], P[-1]
    b0, b1, b2, b3 = (1 - u) ** 3, 3 * u * (1 - u) ** 2, 3 * u ** 2 * (1 - u), u ** 3
    A1 = t1[None, :] * b1[:, None]; A2 = t2[None, :] * b2[:, None]
    C = np.array([[(A1 * A1).sum(), (A1 * A2).sum()], [(A1 * A2).sum(), (A2 * A2).sum()]])
    tmp = P - (np.outer(b0 + b1, p0) + np.outer(b2 + b3, p3))
    X = np.array([(A1 * tmp).sum(), (A2 * tmp).sum()])
    det = C[0, 0] * C[1, 1] - C[0, 1] ** 2
    seg = np.linalg.norm(p3 - p0)
    if abs(det) > 1e-12:
        al = (X[0] * C[1, 1] - X[1] * C[0, 1]) / det; ar = (C[0, 0] * X[1] - C[0, 1] * X[0]) / det
    else:
        al = ar = 0
    if al < 1e-6 * seg or ar < 1e-6 * seg: al = ar = seg / 3
    return np.array([p0, p0 + t1 * al, p3 + t2 * ar, p3])


def _max_err(P, c, u):
    d = np.linalg.norm(_bez(c, u) - P, axis=1); i = int(d.argmax()); return d[i], i


def _reparam(P, c, u):
    d1, d2, q = _bez_d1(c, u), _bez_d2(c, u), _bez(c, u) - P
    num = (q * d1).sum(1); den = (d1 * d1).sum(1) + (q * d2).sum(1)
    return np.clip(np.where(np.abs(den) > 1e-12, u - num / den, u), 0, 1)


def straight_runs(seg: np.ndarray, min_run: float = 18.0, win: float = 12.0, tol: float = 0.22, trim: float = 6.0) -> list[tuple[int, int]]:
    """Index ranges of `seg` that are straight (to within `tol` px) over at least `min_run` px — e.g. the long diagonal of the N, which flows
    tangentially out of an arc and therefore has no corner for the corner detector to split on."""
    n = len(seg); s = np.r_[0, np.cumsum(np.linalg.norm(np.diff(seg, axis=0), axis=1))]
    flags = np.zeros(n, bool)
    for i in range(0, n, 3):
        j = int(np.searchsorted(s, s[i] + win))
        if j >= n or s[j] - s[i] < win * 0.9: break
        if _line_fit(seg[i: j + 1])[2] < tol: flags[i: j + 1] = True
    runs, i = [], 0
    while i < n:
        if flags[i]:
            j = i
            while j + 1 < n and flags[j + 1]: j += 1
            if s[j] - s[i] >= min_run:
                ti = int(np.searchsorted(s, s[i] + trim)); tj = int(np.searchsorted(s, s[j] - trim))   # leave the ends to the curves so they blend in
                if tj > ti and s[tj] - s[ti] >= min_run * 0.6: runs.append((ti, tj))
            i = j + 1
        else: i += 1
    return runs


def _emit_curve(pts, t1, t2, err, f, out):
    sub = pts[:: max(1, len(pts) // 400)]
    if np.linalg.norm(sub[-1] - pts[-1]) > 0: sub = np.vstack([sub, pts[-1]])
    if len(sub) < 2 or np.linalg.norm(pts[-1] - pts[0]) < 0.05: return
    for c in _fit_cubic(sub, t1, t2, err):
        chord = np.linalg.norm(c[3] - c[0]); arm = max(np.linalg.norm(c[1] - c[0]), np.linalg.norm(c[2] - c[3]))
        if not np.isfinite(c).all() or arm > 2.5 * chord + 1.5: out.append(f"L{f(c[3])}")      # degenerate fit on a tiny segment: a straight edge is the safe reading
        else: out.append(f"C{f(c[1])} {f(c[2])} {f(c[3])}")


def _emit_chain(seg, runs, t1, t2, err, f, out):
    """Smooth segment -> alternating true lines (for the straight runs) and Bezier curves, joined with matching tangents."""
    cur_idx, cur_pt, cur_t = 0, seg[0], t1
    for i, j in runs:
        c, d, _ = _line_fit(seg[i: j + 1])
        if np.dot(seg[j] - seg[i], d) < 0: d = -d
        a = c + d * np.dot(seg[i] - c, d); b = c + d * np.dot(seg[j] - c, d)
        if i - cur_idx >= 3:
            pts = seg[cur_idx: i + 1].copy(); pts[0], pts[-1] = cur_pt, a
            _emit_curve(pts, cur_t, -d, err, f, out)
        elif np.linalg.norm(cur_pt - a) > 0.05: out.append(f"L{f(a)}")
        out.append(f"L{f(b)}"); cur_idx, cur_pt, cur_t = j, b, d
    pts = seg[cur_idx:].copy(); pts[0] = cur_pt
    _emit_curve(pts, cur_t, t2, err, f, out)


# ── public: loop -> SVG path data ──────────────────────────────────────────────────────────
def loop_to_path(P: np.ndarray, err: float = 0.12, corner_deg: float = 38.0, corner_window: int = 7, line_tol: float = 0.10,
                 snap: bool = True, nd: int = 2, min_seg: float = 0.0, regularize: bool = False) -> str:
    """Closed dense polyline (source px) -> compact path: straight edges become L, curves become C, corners are exact."""
    n = len(P)
    cs = _corners(P, corner_window * UP // 4 + 2, corner_deg)
    if min_seg > 0 and len(cs) > 3:                        # corners closer than any real feature are noise: keep the first of each cluster
        kept = [cs[0]]
        for c in cs[1:]:
            if np.linalg.norm(P[c] - P[kept[-1]]) >= min_seg: kept.append(c)
        if len(kept) > 3 and np.linalg.norm(P[kept[-1]] - P[kept[0]]) < min_seg: kept.pop()
        cs = kept
    if len(cs) < 2:                                        # smooth loop (e.g. a dot): split in two to fit
        cs = [0, n // 2]; smooth_loop = True
    else: smooth_loop = False
    pieces = []
    for k in range(len(cs)):
        i, j = cs[k], cs[(k + 1) % len(cs)]
        seg = P[i: j + 1] if j > i else np.vstack([P[i:], P[: j + 1]])
        pieces.append(seg)
    segs = []                                              # each: dict(kind, pts/c,d)
    trim = max(4, int(1.3 * UP))
    for seg in pieces:
        core = seg[trim:-trim] if len(seg) > 2 * trim + 6 else seg
        c, d, dev = _line_fit(core)
        straight = (not smooth_loop) and dev < line_tol and np.linalg.norm(seg[-1] - seg[0]) > 1.0
        segs.append({"seg": seg, "line": (c, d) if straight else None})
    # corner vertices: exact intersection where both neighbours are straight, else the traced point
    verts = []
    for k in range(len(segs)):
        a, b = segs[k - 1], segs[k]
        v = b["seg"][0].copy()
        if snap and a["line"] is not None and b["line"] is not None and not smooth_loop:
            x = _intersect(*a["line"], *b["line"])
            if x is not None and np.linalg.norm(x - v) < 1.6: v = x
        elif snap and b["line"] is not None and a["line"] is None and not smooth_loop:
            c, d = b["line"]; v = c + d * np.dot(v - c, d)            # slide onto the straight edge
        elif snap and a["line"] is not None and b["line"] is None and not smooth_loop:
            c, d = a["line"]; v = c + d * np.dot(v - c, d)
        verts.append(v)
    f = lambda p: f"{p[0]:.{nd}f} {p[1]:.{nd}f}".replace("-0.00", "0.00")
    out = [f"M{f(verts[0])}"]
    for k, s in enumerate(segs):
        v0, v1 = verts[k], verts[(k + 1) % len(segs)]
        if s["line"] is not None:
            out.append(f"L{f(v1)}")
        else:
            seg = s["seg"].copy(); seg[0], seg[-1] = v0, v1
            t1 = _unit(seg[min(5, len(seg) - 1)] - seg[0]); t2 = _unit(seg[max(-6, -len(seg))] - seg[-1])
            _emit_chain(seg, straight_runs(seg) if regularize else [], t1, t2, err, f, out)
    out.append("Z")
    return "".join(out)


def mask_to_path(cover: np.ndarray, origin=(0.0, 0.0), min_area: float = 1.5, sigma: float = 0.55, **kw) -> str:
    """Coverage map (source resolution) -> one path (even-odd: outer contours + holes)."""
    loops = marching_squares(upsample(cover, sigma), 0.5)
    parts = []
    for L in loops:
        P = to_source(L, origin)
        area = 0.5 * abs(np.dot(P[:, 0], np.roll(P[:, 1], 1)) - np.dot(P[:, 1], np.roll(P[:, 0], 1)))
        if area >= min_area: parts.append(loop_to_path(P, **kw))
    return "".join(parts)
