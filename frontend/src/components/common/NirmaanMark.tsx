import { useId } from 'react'
import clsx from 'clsx'
import { BRAND } from '../brand/brandData'

/**
 * THE NIRMAAN brand. One geometry (traced from the supplied logo reference, see frontend/brand-src/), three layouts:
 *   full     mark | rule | NIRMAAN / Discover | Validate | Build   — the reference lockup, for places with room to show the tagline
 *   compact  mark + NIRMAAN                                        — app chrome, headers, onboarding
 *   mark     the N alone                                           — collapsed sidebar, icons, loaders
 *   auto     picks one of the above from the width its parent gives it (CSS container queries — no JS, no layout shift)
 *
 * The wordmark, rule and tagline are `currentColor`, so the lockup follows the surrounding text colour (white on the always-dark sidebar,
 * navy on light pages, white in dark mode). The mark keeps its own gradient in every theme. Inline SVG, so it is crisp at any size and
 * needs no request (CSP-safe). Meaningful uses are announced as "NIRMAAN"; pass `decorative` when the brand name is already adjacent.
 */
type Variant = 'full' | 'compact' | 'mark'

function Faces({ uid }: { uid: string }) {
  return (
    <>
      <defs>
        {BRAND.mark.faces.map((f) => (
          <linearGradient key={f.id} id={`${uid}-${f.id}`} gradientUnits="userSpaceOnUse" x1={f.grad.x1} y1={f.grad.y1} x2={f.grad.x2} y2={f.grad.y2}>
            {f.grad.stops.map(([o, c], i) => <stop key={i} offset={o} stopColor={c} />)}
          </linearGradient>
        ))}
      </defs>
      {BRAND.mark.faces.map((f) => <path key={f.id} d={f.d} fill={`url(#${uid}-${f.id})`} />)}
    </>
  )
}

function Word({ transform }: { transform?: string }) {
  return (
    <g transform={transform}>
      <path d={BRAND.wordmark.d} fill="currentColor" fillRule="evenodd" />
      <path d={BRAND.wordmark.triangleD} fill={BRAND.wordmark.triangleFill} />
    </g>
  )
}

function Glyphs({ variant, uid }: { variant: Variant; uid: string }) {
  return (
    <>
      <Faces uid={uid} />
      {variant === 'full' && (
        <>
          <rect x={BRAND.divider.x} y={BRAND.divider.y} width={BRAND.divider.w} height={BRAND.divider.h} fill="currentColor" fillOpacity={0.45} />
          <path d={BRAND.tagline.d} fill="currentColor" fillOpacity={0.68} fillRule="evenodd" />
        </>
      )}
      {variant === 'full' && <Word />}
      {variant === 'compact' && <Word transform={BRAND.layout.compact.wordTransform} />}
    </>
  )
}

interface SvgProps { variant: Variant; size?: number; className?: string; decorative?: boolean; title?: string }

function BrandSvg({ variant, size, className, decorative, title = 'NIRMAAN' }: SvgProps) {
  const uid = `nm${useId().replace(/[^a-zA-Z0-9]/g, '')}${variant}`
  return (
    <svg
      viewBox={BRAND.layout[variant].viewBox} xmlns="http://www.w3.org/2000/svg" focusable="false"
      role={decorative ? undefined : 'img'} aria-label={decorative ? undefined : title} aria-hidden={decorative ? true : undefined}
      className={clsx('block shrink-0 max-w-full', className)}
      // Sized by HEIGHT (width follows from the aspect ratio) when `size` is given; otherwise the caller owns the width via className
      // (a base `w-auto` class here would win the cascade over the caller's width utility and silently ignore it).
      style={size ? { height: size, width: 'auto', aspectRatio: String(BRAND.ratio[variant]) } : { aspectRatio: String(BRAND.ratio[variant]) }}
    >
      <Glyphs variant={variant} uid={uid} />
    </svg>
  )
}

/** The N alone. Decorative by default (it almost always sits next to the word NIRMAAN); give it a `title` to announce it. */
export function NirmaanMark({ size = 24, className, title }: { size?: number; className?: string; title?: string }) {
  return <BrandSvg variant="mark" size={size} className={className} decorative={!title} title={title} />
}

/**
 * `size` is the logo's HEIGHT in px (omit it to size with CSS, e.g. `className="w-72"` for the full lockup).
 * variant="auto" shows the full lockup in a roomy parent (>= 24rem), the compact one from 9rem, and the mark below that.
 */
export function NirmaanLogo({ variant = 'compact', size, className, decorative }: { variant?: Variant | 'auto'; size?: number; className?: string; decorative?: boolean }) {
  // compact/mark default to a 28px height; the full lockup is sized by the caller's width (className) unless a height is given
  if (variant !== 'auto') return <BrandSvg variant={variant} size={size ?? (variant === 'full' ? undefined : 28)} className={className} decorative={decorative} />
  size ??= 28
  return (
    <span className={clsx('@container block w-full min-w-0', className)}>
      <BrandSvg variant="full" decorative={decorative} className="hidden @min-[24rem]:block w-full max-w-[22rem] h-auto" />
      <BrandSvg variant="compact" size={size} decorative={decorative} className="hidden @min-[9rem]:block @min-[24rem]:hidden" />
      <BrandSvg variant="mark" size={size} decorative={decorative} className="block @min-[9rem]:hidden" />
    </span>
  )
}

/** Branded loading state: the mark, gently pulsing (motion-safe). */
export function BrandLoader({ label = 'Loading…', size = 44 }: { label?: string; size?: number }) {
  return (
    <div className="flex flex-col items-center gap-3" role="status" aria-live="polite">
      <NirmaanMark size={size} className="motion-safe:animate-pulse" />
      <span className="sr-only">{label}</span>
    </div>
  )
}
