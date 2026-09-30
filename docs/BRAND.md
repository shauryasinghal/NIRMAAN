# NIRMAAN brand identity

**NIRMAAN — Discover | Validate | Build.** One logo, traced from the supplied reference (`frontend/brand-src/nirmaan-logo-reference.png`) —
never redrawn, never replaced by a generic mark, and never embedded as a screenshot. Every shape below comes from that image's own pixels.

## Variants

| Variant | What | Used for |
|---|---|---|
| **full** | N mark │ NIRMAAN / *Discover \| Validate \| Build* (the reference lockup) | landing hero + footer, login/register, 404, social preview |
| **compact** | N mark + NIRMAAN | sidebar, mobile header, landing navbar, onboarding |
| **mark** | the N alone | collapsed sidebar, favicon/app icons, loaders, error pages |
| **auto** | one of the above, chosen from the width its parent gives it (CSS container queries: full ≥ 24rem, compact ≥ 9rem, else mark) | the sidebar — it becomes the mark when collapsed, with no JavaScript and no layout shift |

The tagline is only shown where it can be read (the full lockup); headers and chrome use the compact lockup.

## In the app

```tsx
import { NirmaanLogo, NirmaanMark, BrandLoader } from '../components/common/NirmaanMark'

<NirmaanLogo variant="compact" size={30} />                       // height in px; width follows the aspect ratio
<NirmaanLogo variant="full" className="w-72 text-navy-900 dark:text-white" />   // the full lockup is sized by the caller's width
<NirmaanLogo variant="auto" size={32} decorative />               // picks the layout from available space
<NirmaanMark size={40} />  <BrandLoader />                        // the N alone; a branded, motion-safe loading state
```

* **Theme:** the wordmark, rule and tagline are `currentColor` — set the text colour (`text-white` on the always-dark sidebar, `text-navy-900 dark:text-white`
  on pages). The mark keeps its own gradient in every theme. Contrast is asserted (≥ 4.5:1) in both themes by `e2e/brand.spec.ts`.
* **Accessibility:** a standalone logo is announced as `NIRMAAN` (`role="img"`). When it sits inside a link/label that already carries the name
  (e.g. `aria-label="NIRMAAN — home"`), pass `decorative` so it is not announced twice. The link is always the navigation, never the logo alone.
* **Sizing rule:** never set a width *and* a height that disagree — the SVG keeps its aspect ratio (asserted undistorted at 5 widths).

## Files (`frontend/public/`)

`brand/nirmaan-logo.svg` (full, for dark backgrounds) · `brand/nirmaan-logo-light.svg` (full, for light backgrounds) ·
`brand/nirmaan-logo-compact[-light].svg` · `brand/nirmaan-mark.svg` · `brand/og-image.png` (1200×630) · `favicon.svg` · `favicon-16/32.png` ·
`apple-touch-icon.png` (180) · `icon-192.png` / `icon-512.png` · `site.webmanifest`.
`index.html` carries the title (`NIRMAAN — Discover, Validate, Build`), description, icon links and Open Graph/Twitter tags.
**Before launch:** crawlers need an *absolute* `og:image` URL — prefix `/brand/og-image.png` with the production origin in `index.html`.

## How the logo was vectorised (and how to change it)

`frontend/brand-src/` is a small, reproducible pipeline (Python: numpy/scipy/Pillow; Chromium via Playwright for the PNGs). It is not shipped.

```bash
cd frontend
../backend/venv/bin/python brand-src/trace_logo.py     # reference PNG  ->  brand-src/build/brand.json  (+ debug images)
../backend/venv/bin/python brand-src/build_brand.py    # -> public/brand/*.svg, public/favicon.svg, src/components/brand/brandData.ts
node brand-src/render_icons.mjs                        # -> favicon/app-icon/social PNGs
../backend/venv/bin/python brand-src/compare.py 215 155 375 330 /tmp/mark.png   # source (top) vs vector (bottom), same scale
```

* **Mark:** a folded ribbon whose colour field is smooth except for two sharp fold edges. The silhouette is traced at sub-pixel precision; the two folds are
  located from the gradient ridge and fitted with smooth curves, splitting the ribbon into three faces; each face gets a multi-stop linear gradient fitted to
  the source colours (per-channel RMSE 2.4–5.4 / 255). Straight runs are snapped to true lines, corners to their exact intersections.
* **Wordmark / tagline / rule / teal triangle:** traced with straight-edge and curve fitting; colours sampled from the source.
* **Measured fidelity** against the reference at its own scale: interior colour error **2.2 / 255**, overall mean 6.8 / 255 (the edge band differs only because
  the reference is a blurred screenshot and the vector is perfectly sharp).
* **If the original vector artwork (AI/SVG) becomes available**, replace the geometry in `trace_logo.py`'s output (or `build_brand.py`'s inputs) and re-run the
  generator — the component, assets and tests all derive from that one geometry.
