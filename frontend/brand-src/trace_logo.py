"""Trace the supplied NIRMAAN logo reference (nirmaan-logo-reference.png) into vector geometry + fitted gradients.

    ../../backend/venv/bin/python trace_logo.py          ->  build/brand.json  (+ build/debug_*.png)

The reference raster is the SOURCE OF TRUTH: every shape below is extracted from its pixels, nothing is redrawn by hand.
  * mark      - the folded-ribbon N. Its colour field is smooth except two sharp FOLD edges, which split it into three faces
                (left stem / arc+diagonal / right stem). Silhouette and faces are traced; each face gets a multi-stop linear
                gradient fitted to the source colours.
  * wordmark  - NIRMAAN letters (white), plus the small teal triangle inside the second A.
  * tagline   - "Discover | Validate | Build".     * divider - the thin vertical rule.
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

import vectorize as V

HERE = Path(__file__).parent
SRC = HERE / "nirmaan-logo-reference.png"
OUT = HERE / "build"; OUT.mkdir(exist_ok=True)

rgb = np.asarray(Image.open(SRC).convert("RGB"), dtype=float)
H, W, _ = rgb.shape
BG = np.median(rgb[150:335, 30:180].reshape(-1, 3), axis=0)           # the flat dark backdrop beside the mark
hexc = lambda c: "#%02x%02x%02x" % tuple(int(round(v)) for v in np.clip(c, 0, 255))


def two_color_cover(box, fg=None, exclude=None):
    """Alpha of a solid-colour shape on BG (exact for 2-colour anti-aliasing). Returns (cover, fg, (x0,y0))."""
    x0, y0, x1, y1 = box
    p = rgb[y0:y1, x0:x1] - BG
    dist = np.linalg.norm(p, axis=2)
    if fg is None:
        top = dist >= np.percentile(dist, 99.5) * 0.92
        fg = np.median(rgb[y0:y1, x0:x1][top], axis=0)
    d = fg - BG
    alpha = np.clip((p @ d) / (d @ d), 0, 1)
    return alpha, fg, (x0, y0)


# ── 1. the mark ─────────────────────────────────────────────────────────────────────────────────────
MX0, MY0, MX1, MY1 = 215, 155, 375, 330
m = rgb[MY0:MY1, MX0:MX1]
dist = np.linalg.norm(m - BG, axis=2)
# Edge coverage: distance from the backdrop, normalised by the local maximum (smooth, sub-pixel-accurate outlines)...
cover = np.clip(dist / np.maximum(ndi.maximum_filter(dist, size=5), 40.0), 0, 1)
cover[dist < 9] = 0                                                     # backdrop noise / vignette
inside = cover > 0.5

# fold edges = the only strong colour gradients inside the silhouette
g = np.sqrt(sum(ndi.sobel(ndi.gaussian_filter(m[..., c], 1.0), 0) ** 2 + ndi.sobel(ndi.gaussian_filter(m[..., c], 1.0), 1) ** 2 for c in range(3)))
inside0 = cover > 0.5
closed = ndi.binary_closing(inside0, structure=np.ones((3, 3)), iterations=2)
# Locating the fold RIDGES only needs a generous mask (they are erosion-limited near the silhouette)...
permissive = inside0 | (closed & (dist > 14))
core_in = ndi.binary_erosion(permissive, iterations=3)
band = (g > 0.35 * np.percentile(g[core_in], 99.5)) & core_in
# ...while the OUTLINE must stay exact. The dark fold shadows sit right beside the bright fold edge, which depresses their local-max-
# normalised coverage and leaves thin gaps along the folds. Measured on the source: the darkest genuine shadow pixel is 50 from the backdrop
# colour (5th percentile 66), the soft halo mostly <18. So repair gaps only (a) inside a 2px zone around the fold bands and (b) where the
# pixel is >38 from the backdrop; everything else (outer edges, background V-notches) keeps its anti-aliased coverage untouched.
cover[closed & ~inside0 & (dist > 38) & ndi.binary_dilation(band, iterations=2)] = 1.0
blobs, nblobs = ndi.label(ndi.binary_dilation(cover > 0.5, iterations=2))
cover[blobs != 1 + int(np.argmax(ndi.sum(cover > 0.5, blobs, range(1, nblobs + 1))))] = 0     # drop disconnected specks
inside = cover > 0.5
band_lab, nb = ndi.label(ndi.binary_dilation(band, iterations=1))
bsz = ndi.sum(band, band_lab, range(1, nb + 1))
folds_lab = [1 + i for i in np.argsort(bsz)[::-1][:2]]
assert len(folds_lab) == 2 and min(bsz[np.array(folds_lab) - 1]) > 60, f"expected 2 fold edges, got {sorted(bsz)[-4:]}"
folds_lab.sort(key=lambda k: ndi.center_of_mass(band_lab == k)[1])       # left fold first


def fit_fold(lbl):
    """Smooth curve y = f(x) through the ridge of one fold edge (gradient-weighted centroid per column)."""
    ys, xs = np.nonzero((band_lab == lbl) & band)
    cols = np.unique(xs)
    cx = np.array([c + 0.5 for c in cols]); cy = np.array([((ys[xs == c] + 0.5) * g[ys[xs == c], c]).sum() / g[ys[xs == c], c].sum() for c in cols])
    poly = np.polyfit(cx, cy, 3)
    return poly, cx.min(), cx.max(), float(np.sqrt(np.mean((np.polyval(poly, cx) - cy) ** 2)))


core = inside & ~ndi.binary_dilation(band, iterations=3)
lab_c, n_c = ndi.label(core)
c_lab = 1 + int(np.argmin([ndi.center_of_mass(lab_c == k)[0] if (lab_c == k).sum() > 300 else 1e9 for k in range(1, n_c + 1)]))   # top-most big component = right stem (+ its arrow flag)
poly1, f1x0, f1x1, e1 = fit_fold(folds_lab[0]); poly2, f2x0, f2x1, e2 = fit_fold(folds_lab[1])
# Where each stem ends sideways, measured on the silhouette well away from the fold (not from the fold band's extent). On these rows the
# diagonal ribbon can also cross, so take the contiguous run that belongs to the stem itself.
def run_bounds(row_mask, anchor_x):
    x = int(anchor_x)
    assert row_mask[x], "anchor pixel is not inside the stem"
    lo = x
    while lo > 0 and row_mask[lo - 1]: lo -= 1
    hi = x
    while hi < len(row_mask) - 1 and row_mask[hi + 1]: hi += 1
    return lo, hi + 1


row_a = int(np.polyval(poly1, f1x0 + 10) + 40)
f1x1 = float(run_bounds(inside[row_a], f1x0 + 10)[1])                   # right edge of the left stem (starts inside it, walks to its edge)
row_c = int(np.polyval(poly2, f2x1 - 10) - 40)
f2x0 = float(run_bounds(inside[row_c], f2x1 - 10)[0])                   # left edge of the right stem
print(f"fold 1: x {f1x0:.0f}..{f1x1:.0f}  fit err {e1:.2f}px | fold 2: x {f2x0:.0f}..{f2x1:.0f}  fit err {e2:.2f}px")


flag_mask = (lab_c == c_lab) & (np.meshgrid(np.arange(cover.shape[1]) + 0.5, np.arange(cover.shape[0]) + 0.5)[0] < f2x0 - 0.5)   # arrow tip that overhangs the stem on the left
flag_up = ndi.gaussian_filter(np.kron(ndi.binary_dilation(flag_mask, iterations=1).astype(float), np.ones((V.UP, V.UP))), 1.5)


def face_fields(xs, ys, grow=1.4):
    """Analytic, sub-pixel face indicators at crop coordinates (xs, ys): A left stem, C right stem, B everything else (grown under A and C)."""
    ramp = lambda v: np.clip(0.5 + v, 0, 1)
    a = ramp(ys - np.polyval(poly1, xs)) * ramp((f1x1 + 0.5) - xs)
    c = ramp(np.polyval(poly2, xs) - ys) * ramp(xs - (f2x0 - 0.5))
    a_g = ramp(ys - np.polyval(poly1, xs) - grow) * ramp((f1x1 + 0.5) - grow - xs)
    c_g = ramp(np.polyval(poly2, xs) - ys - grow) * ramp(xs - (f2x0 - 0.5) - grow)
    if xs.shape == flag_up.shape:                                          # only on the upsampled grid
        c = np.maximum(c, flag_up); c_g = np.maximum(c_g, flag_up)
    return {"A": a, "C": c, "B": 1 - np.maximum(a_g, c_g)}, {"A": a, "C": c, "B": 1 - np.maximum(a, c)}


hh, ww = cover.shape
gx, gy = np.meshgrid((np.arange(ww * V.UP) + 0.5) / V.UP, (np.arange(hh * V.UP) + 0.5) / V.UP)
up_fields = face_fields(gx, gy)[0]
px_, py_ = np.meshgrid(np.arange(ww) + 0.5, np.arange(hh) + 0.5)
face_ind = {k: (v > 0.5) & inside for k, v in face_fields(px_, py_)[1].items()}
face_ind["C"] = face_ind["C"] | (flag_mask & inside); face_ind["B"] = face_ind["B"] & ~face_ind["C"]
dbg = np.zeros((*cover.shape, 3), np.uint8)
for nm, col in zip("ABC", ((230, 80, 80), (80, 200, 120), (90, 120, 240))): dbg[face_ind[nm]] = col
Image.fromarray(dbg).resize((dbg.shape[1] * 4, dbg.shape[0] * 4), Image.NEAREST).save(OUT / "debug_faces.png")

MARK_KW = dict(err=0.45, corner_deg=30, line_tol=0.90, min_seg=3.0, regularize=True)
MARK_SIGMA = 2.2
UP_COVER = V.upsample(cover, MARK_SIGMA)


def path_from_up(cov_up, origin, **kw):
    parts = []
    for L in V.marching_squares(cov_up, 0.5):
        P = V.to_source(L, origin)
        area = 0.5 * abs(np.dot(P[:, 0], np.roll(P[:, 1], 1)) - np.dot(P[:, 1], np.roll(P[:, 0], 1)))
        if area > 25: parts.append(V.loop_to_path(P, **kw))            # ignore specks (real mark pieces are hundreds of px^2)
    return "".join(parts)


ORIGIN = (MX0, MY0)
mark_paths = {
    "silhouette": V.mask_to_path(cover, ORIGIN, sigma=MARK_SIGMA, **MARK_KW),
    **{k: path_from_up(up_fields[k] * UP_COVER, ORIGIN, **MARK_KW) for k in "ABC"},
}


def fit_gradient(ind, n_bins=12):
    """Best linear-gradient axis for a face, with stops = median source colour per position along that axis."""
    ys, xs = np.nonzero(ndi.binary_erosion(ind & ~band, iterations=2))
    cols = m[ys, xs]; px = xs + MX0 + 0.5; py = ys + MY0 + 0.5
    best = None
    for th in np.arange(0, 180, 2.0):
        u = np.array([np.cos(np.radians(th)), np.sin(np.radians(th))]); t = px * u[0] + py * u[1]
        order = np.argsort(t); edges = np.array_split(order, n_bins)
        med = np.array([np.median(cols[e], axis=0) for e in edges])
        res = sum(((cols[e] - mm) ** 2).sum() for e, mm in zip(edges, med))
        if best is None or res < best[0]: best = (res, th, u, t, edges, med)
    res, th, u, t, edges, med = best
    tmin, tmax = np.percentile(t, 0.5), np.percentile(t, 99.5)
    tc = np.array([np.median(t[e]) for e in edges])
    # extend the first/last stop to the gradient ends so clipping to the face never shows a flat band
    offs = np.clip((tc - tmin) / (tmax - tmin), 0, 1)
    stops = [(0.0, med[0])] + [(float(o), c) for o, c in zip(offs, med)] + [(1.0, med[-1])]
    clean, last = [], -1
    for o, c in stops:
        if o > last - 1e-9: clean.append((round(o, 4), hexc(c))); last = o
    return {"x1": float(u[0] * tmin), "y1": float(u[1] * tmin), "x2": float(u[0] * tmax), "y2": float(u[1] * tmax), "stops": clean,
            "angle": float(th), "rmse": float(np.sqrt(res / (3 * len(t))))}


mark_grads = {k: fit_gradient(face_ind[k]) for k in "ABC"}
for k, gr in mark_grads.items(): print(f"face {k}: axis {gr['angle']:.0f}deg  rmse {gr['rmse']:.2f}  stops {len(gr['stops'])}")

# ── 2. wordmark (+ teal triangle), tagline, divider ─────────────────────────────────────────────────
WX0, WY0, WX1, WY1 = 408, 196, 822, 262
wp = rgb[WY0:WY1, WX0:WX1] - BG
wd = np.linalg.norm(wp, axis=2)
white = np.median(rgb[WY0:WY1, WX0:WX1][wd >= np.percentile(wd, 99.0) * 0.95], axis=0)
tri_box = (712, 232, 740, 258)                                           # the teal triangle lives in here only
tx0, ty0, tx1, ty1 = tri_box
teal_px = rgb[ty0:ty1, tx0:tx1]
tdist = np.linalg.norm(teal_px - BG, axis=2)
is_t = (teal_px[..., 1] - teal_px[..., 0] > 60) & (tdist > 120)            # genuinely teal pixels only (the box also touches the A's white legs)
teal = np.median(teal_px[is_t], axis=0)


def alpha_for(colour, p):
    d = colour - BG
    a = np.clip((p @ d) / (d @ d), 0, 1)
    resid = np.linalg.norm(p - a[..., None] * d, axis=-1)
    return a, resid


aw, rw = alpha_for(white, wp); at, rt = alpha_for(teal, wp)
is_teal = (rt < rw) & (wd > 14)
is_teal[:, :tri_box[0] - WX0] = False; is_teal[:, tri_box[2] - WX0:] = False; is_teal[:tri_box[1] - WY0, :] = False   # only near the triangle
word_cover = np.where(is_teal, 0, aw); tri_cover = np.where(is_teal, at, 0)
word_path = V.mask_to_path(word_cover, (WX0, WY0), sigma=1.5, err=0.26, corner_deg=30, line_tol=0.24)
tri_path = V.mask_to_path(tri_cover, (WX0, WY0), min_area=3, sigma=1.1, err=0.22, corner_deg=30, line_tol=0.20)

TX0, TY0, TX1, TY1 = 412, 268, 822, 302
tag_cov, tag_col, _ = two_color_cover((TX0, TY0, TX1, TY1))
tag_path = V.mask_to_path(tag_cov, (TX0, TY0), min_area=1.2, sigma=1.0, err=0.14, corner_deg=40, corner_window=6, line_tol=0.15)

DX0, DY0, DX1, DY1 = 384, 176, 398, 312
dv, dcol, _ = two_color_cover((DX0, DY0, DX1, DY1))
prof_x = dv.max(axis=0); prof_y = dv.max(axis=1)
xs = np.arange(DX0, DX1) + 0.5
cx = (prof_x * xs).sum() / prof_x.sum(); wd_line = dv.max(axis=0).sum()
ys_ = np.nonzero(prof_y > 0.5)[0]
divider = {"x": float(cx - wd_line / 2), "w": float(wd_line), "y0": float(DY0 + ys_.min() + (1 - prof_y[ys_.min()]) * 0 ), "y1": float(DY0 + ys_.max() + 1), "color": hexc(dcol)}

out = {
    "source": {"w": W, "h": H, "bg": hexc(BG)},
    "mark": {"paths": mark_paths, "grads": mark_grads, "bbox": None},
    "wordmark": {"path": word_path, "color": hexc(white)},
    "triangle": {"path": tri_path, "color": hexc(teal)},
    "tagline": {"path": tag_path, "color": hexc(tag_col)},
    "divider": divider,
}
(OUT / "brand.json").write_text(json.dumps(out, indent=1))
print("wordmark", hexc(white), "| teal", hexc(teal), "| tagline", hexc(tag_col), "| divider", divider)
print("path sizes (chars):", {k: len(v) for k, v in mark_paths.items()}, len(word_path), len(tri_path), len(tag_path))
