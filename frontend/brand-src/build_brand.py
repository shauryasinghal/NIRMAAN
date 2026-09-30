"""build/brand.json (from trace_logo.py)  ->  every brand asset the app ships.

    ../../backend/venv/bin/python build_brand.py            # writes public/brand/*.svg, src/components/brand/brandData.ts
    node render_icons.mjs                                   # writes the PNGs (favicon, apple-touch, app icons, social preview)

One geometry, many outputs, so the React component and the static files cannot drift apart.
Layouts (all in the reference's own pixel coordinates, tight viewBoxes):
  full     mark | divider | NIRMAAN / Discover | Validate | Build     (the reference lockup, exactly as supplied)
  compact  mark + NIRMAAN (no divider, no tagline), wordmark centred on the mark at the reference scale
  mark     the N alone
"""
import json
import re
from pathlib import Path

import numpy as np

HERE = Path(__file__).parent
ROOT = HERE.parent
B = json.loads((HERE / "build" / "brand.json").read_text())
DARK_INK, LIGHT_INK = "#fafafa", "#0b1220"


# ── geometry helpers ───────────────────────────────────────────────────────────────────────
def path_bounds(d: str):
    """Exact bounds of an M/L/C/Z path (Beziers sampled, not just their control points)."""
    toks = re.findall(r"[MLCZ]|-?\d+\.?\d*", d)
    pts, cur, cmd, i = [], None, None, 0
    xs, ys = [], []
    while i < len(toks):
        t = toks[i]
        if t in "MLCZ": cmd = t; i += 1; continue
        if cmd in "ML":
            cur = np.array([float(toks[i]), float(toks[i + 1])]); i += 2; xs.append(cur[0]); ys.append(cur[1])
        elif cmd == "C":
            c1, c2, p = (np.array([float(toks[i + k]), float(toks[i + k + 1])]) for k in (0, 2, 4)); i += 6
            u = np.linspace(0, 1, 24)[:, None]
            q = (1 - u) ** 3 * cur + 3 * (1 - u) ** 2 * u * c1 + 3 * (1 - u) * u ** 2 * c2 + u ** 3 * p
            xs += list(q[:, 0]); ys += list(q[:, 1]); cur = p
        else: i += 1
    return min(xs), min(ys), max(xs), max(ys)


def union(*bs):
    return min(b[0] for b in bs), min(b[1] for b in bs), max(b[2] for b in bs), max(b[3] for b in bs)


def vb(b, pad=0.0):
    return f"{b[0]-pad:.2f} {b[1]-pad:.2f} {b[2]-b[0]+2*pad:.2f} {b[3]-b[1]+2*pad:.2f}"


P = B["mark"]["paths"]; G = B["mark"]["grads"]
MARK_B = path_bounds(P["silhouette"])
WORD_B = union(path_bounds(B["wordmark"]["path"]), path_bounds(B["triangle"]["path"]))
TAG_B = path_bounds(B["tagline"]["path"])
D = B["divider"]; DIV_B = (D["x"], D["y0"], D["x"] + D["w"], D["y1"])
FULL_B = union(MARK_B, WORD_B, TAG_B, DIV_B)

# compact: same wordmark scale as the reference, centred on the mark's vertical centre, a clear gap after the mark
GAP = 46.0
dx = (MARK_B[2] + GAP) - WORD_B[0]; dy = ((MARK_B[1] + MARK_B[3]) - (WORD_B[1] + WORD_B[3])) / 2
WORD_C = (WORD_B[0] + dx, WORD_B[1] + dy, WORD_B[2] + dx, WORD_B[3] + dy)
COMPACT_B = union(MARK_B, WORD_C)
WORD_T = f"translate({dx:.2f} {dy:.2f})"


# ── svg fragments ──────────────────────────────────────────────────────────────────────────
def grad(id_, g):
    st = "".join(f'<stop offset="{o}" stop-color="{c}"/>' for o, c in g["stops"])
    return f'<linearGradient id="{id_}" gradientUnits="userSpaceOnUse" x1="{g["x1"]:.2f}" y1="{g["y1"]:.2f}" x2="{g["x2"]:.2f}" y2="{g["y2"]:.2f}">{st}</linearGradient>'


def mark_frag(uid="nm"):
    return (f'<defs>{grad(uid+"-a", G["A"])}{grad(uid+"-b", G["B"])}{grad(uid+"-c", G["C"])}</defs>'
            f'<path fill="url(#{uid}-b)" d="{P["B"]}"/><path fill="url(#{uid}-a)" d="{P["A"]}"/><path fill="url(#{uid}-c)" d="{P["C"]}"/>')


def word_frag(ink, transform=None):
    body = f'<path fill="{ink}" fill-rule="evenodd" d="{B["wordmark"]["path"]}"/><path fill="{B["triangle"]["color"]}" d="{B["triangle"]["path"]}"/>'
    return f'<g transform="{transform}">{body}</g>' if transform else body


def tag_frag(ink, rule):
    return (f'<rect x="{D["x"]:.2f}" y="{D["y0"]:.2f}" width="{D["w"]:.2f}" height="{D["y1"]-D["y0"]:.2f}" fill="{rule}"/>'
            f'<path fill="{ink}" fill-rule="evenodd" d="{B["tagline"]["path"]}"/>')


def svg(viewbox, body, label="NIRMAAN"):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{viewbox}" role="img" aria-label="{label}"><title>{label}</title>{body}</svg>\n')


def write(path: Path, text: str):
    path.parent.mkdir(parents=True, exist_ok=True); path.write_text(text); print(f"  {path.relative_to(ROOT)}  {len(text.encode()):,} B")


def build():
    out = ROOT / "public" / "brand"
    # Files for DARK backgrounds (white wordmark) and LIGHT backgrounds (navy wordmark). Tagline/divider are the ink at reduced strength.
    variants = {
        "": dict(ink=DARK_INK, tag=B["tagline"]["color"], rule=B["divider"]["color"]),
        "-light": dict(ink=LIGHT_INK, tag="#56607a", rule="#8b93a7"),
    }
    pad = 6.0
    for suf, c in variants.items():
        write(out / f"nirmaan-logo{suf}.svg", svg(vb(FULL_B, pad), mark_frag() + tag_frag(c["tag"], c["rule"]) + word_frag(c["ink"]), "NIRMAAN — Discover | Validate | Build"))
        write(out / f"nirmaan-logo-compact{suf}.svg", svg(vb(COMPACT_B, pad), mark_frag() + word_frag(c["ink"], WORD_T)))
    write(out / "nirmaan-mark.svg", svg(vb(MARK_B, 4.0), mark_frag()))
    # favicon: the mark, centred in a square with breathing room so it never touches the tab edge
    side = max(MARK_B[2] - MARK_B[0], MARK_B[3] - MARK_B[1]) * 1.12
    cx, cy = (MARK_B[0] + MARK_B[2]) / 2, (MARK_B[1] + MARK_B[3]) / 2
    sq = (cx - side / 2, cy - side / 2, cx + side / 2, cy + side / 2)
    write(ROOT / "public" / "favicon.svg", svg(vb(sq), mark_frag()))
    (HERE / "build" / "square_viewbox.txt").write_text(vb(sq))

    # data module for React (same geometry; wordmark colour comes from currentColor there so it follows the theme)
    def grad_ts(g): return {"x1": round(g["x1"], 2), "y1": round(g["y1"], 2), "x2": round(g["x2"], 2), "y2": round(g["y2"], 2), "stops": g["stops"]}
    data = {
        "mark": {"viewBox": vb(MARK_B), "faces": [{"id": k.lower(), "d": P[k], "grad": grad_ts(G[k])} for k in "BAC"]},
        "wordmark": {"d": B["wordmark"]["path"], "triangleD": B["triangle"]["path"], "triangleFill": B["triangle"]["color"]},
        "tagline": {"d": B["tagline"]["path"]},
        "divider": {"x": round(D["x"], 2), "y": round(D["y0"], 2), "w": round(D["w"], 2), "h": round(D["y1"] - D["y0"], 2)},
        "layout": {
            "full": {"viewBox": vb(FULL_B)},
            "compact": {"viewBox": vb(COMPACT_B), "wordTransform": WORD_T},
            "mark": {"viewBox": vb(MARK_B)},
        },
        "ratio": {k: round((b[2] - b[0]) / (b[3] - b[1]), 4) for k, b in (("full", FULL_B), ("compact", COMPACT_B), ("mark", MARK_B))},
    }
    ts = ("// GENERATED by frontend/brand-src/build_brand.py from the traced logo reference — do not edit by hand.\n"
          "// Re-run the generator to change the brand geometry; every asset in public/brand/ comes from the same data.\n"
          f"export const BRAND = {json.dumps(data, indent=2)} as const\n")
    write(ROOT / "src" / "components" / "brand" / "brandData.ts", ts)
    print("ratios (w/h):", data["ratio"])


if __name__ == "__main__":
    build()
