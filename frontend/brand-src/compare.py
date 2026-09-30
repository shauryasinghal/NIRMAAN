"""Side-by-side: source crop (top) vs traced-SVG render (bottom) at the same scale.   python compare.py x0 y0 x1 y1 out.png"""
import sys, json, subprocess, re
from pathlib import Path
from PIL import Image
HERE = Path(__file__).parent
x0, y0, x1, y1 = map(int, sys.argv[1:5]); out = sys.argv[5]; S = 4
svg = (HERE.parent / "public" / "brand" / "nirmaan-logo.svg").read_text()
vb = [float(v) for v in re.search(r'viewBox="([^"]+)"', svg).group(1).split()]
subprocess.run(["node", str(HERE / "render_svg.mjs"), str(HERE.parent / "public" / "brand" / "nirmaan-logo.svg"), "/tmp/_full.png", str(int(vb[2] * S)), "#0a0f1c"], cwd=HERE.parent, check=True)
full = Image.open("/tmp/_full.png").convert("RGB")
ref = Image.open(HERE / "nirmaan-logo-reference.png").convert("RGB").crop((x0, y0, x1, y1)).resize(((x1 - x0) * S, (y1 - y0) * S), Image.LANCZOS)
ren = full.crop((int((x0 - vb[0]) * S), int((y0 - vb[1]) * S), int((x1 - vb[0]) * S), int((y1 - vb[1]) * S)))
canvas = Image.new("RGB", (ref.width, ref.height * 2 + 6), (255, 0, 255)); canvas.paste(ref, (0, 0)); canvas.paste(ren, (0, ref.height + 6)); canvas.save(out)
