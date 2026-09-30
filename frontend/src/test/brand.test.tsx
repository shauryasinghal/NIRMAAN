import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BRAND } from '../components/brand/brandData'
import { BrandLoader, NirmaanLogo, NirmaanMark } from '../components/common/NirmaanMark'

const vbRatio = (vb: string) => { const [, , w, h] = vb.split(' ').map(Number); return w / h }

describe('brand data (traced from the supplied logo reference)', () => {
  it('ships real geometry for every part of the lockup', () => {
    expect(BRAND.mark.faces.map((f) => f.id)).toEqual(['b', 'a', 'c'])            // painted back-to-front: diagonal, left stem, right stem
    for (const f of BRAND.mark.faces) expect(f.d.length).toBeGreaterThan(100)
    expect(BRAND.wordmark.d.length).toBeGreaterThan(500); expect(BRAND.tagline.d.length).toBeGreaterThan(2000); expect(BRAND.wordmark.triangleFill).toMatch(/^#[0-9a-f]{6}$/)
  })
  it('gradients are well-formed: ascending offsets inside 0..1, valid colours, a real axis', () => {
    for (const { grad } of BRAND.mark.faces) {
      expect(grad.stops.length).toBeGreaterThanOrEqual(6)
      const offs = grad.stops.map(([o]) => o); expect([...offs].sort((a, b) => a - b)).toEqual([...offs])
      expect(offs[0]).toBeGreaterThanOrEqual(0); expect(offs.at(-1)).toBeLessThanOrEqual(1)
      for (const [, c] of grad.stops) expect(c).toMatch(/^#[0-9a-f]{6}$/)
      expect(Math.hypot(grad.x2 - grad.x1, grad.y2 - grad.y1)).toBeGreaterThan(10)
    }
  })
  it('the declared aspect ratios match the viewBoxes (no distortion)', () => {
    for (const k of ['full', 'compact', 'mark'] as const) expect(BRAND.ratio[k]).toBeCloseTo(vbRatio(BRAND.layout[k].viewBox), 2)
    expect(BRAND.ratio.full).toBeGreaterThan(3.5); expect(BRAND.ratio.mark).toBeLessThan(1)   // wide lockup, tall N
  })
})

describe('NirmaanLogo / NirmaanMark', () => {
  it.each(['full', 'compact', 'mark'] as const)('%s: announced once as "NIRMAAN", with its own viewBox and aspect ratio', (variant) => {
    const { container } = render(<NirmaanLogo variant={variant} />)
    const svg = screen.getByRole('img', { name: 'NIRMAAN' })
    expect(svg.getAttribute('viewBox')).toBe(BRAND.layout[variant].viewBox)
    expect(parseFloat(svg.style.aspectRatio)).toBeCloseTo(BRAND.ratio[variant], 3)        // (jsdom serialises it as "0.8754 / 1")
    expect(container.querySelectorAll('svg')).toHaveLength(1)
  })
  it('sizes compact/mark by a default height, and the full lockup by the caller (width) unless a height is given', () => {
    const { rerender } = render(<NirmaanLogo variant="compact" />); expect(screen.getByRole('img').style.height).toBe('28px')
    rerender(<NirmaanLogo variant="full" />); expect(screen.getByRole('img').style.height).toBe('')
    rerender(<NirmaanLogo variant="full" size={90} />); expect(screen.getByRole('img').style.height).toBe('90px')
  })
  it('decorative logos are hidden from assistive tech (the adjacent link/label carries the name)', () => {
    render(<a href="/" aria-label="NIRMAAN — home"><NirmaanLogo decorative /></a>)
    expect(screen.queryByRole('img', { name: 'NIRMAAN' })).toBeNull()
    expect(screen.getByRole('link', { name: 'NIRMAAN — home' }).querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })
  it('the mark alone is decorative unless given a title', () => {
    const { rerender } = render(<NirmaanMark />); expect(screen.queryByRole('img')).toBeNull()
    rerender(<NirmaanMark title="NIRMAAN mark" />); expect(screen.getByRole('img', { name: 'NIRMAAN mark' })).toBeInTheDocument()
  })
  it('auto renders all three layouts (CSS container queries choose one) and never reuses a gradient id', () => {
    const { container } = render(<><NirmaanLogo variant="auto" /><NirmaanLogo variant="auto" /><NirmaanMark /></>)
    const svgs = [...container.querySelectorAll('svg')]; expect(svgs).toHaveLength(7)
    const ids = [...container.querySelectorAll('linearGradient')].map((g) => g.id)
    expect(ids).toHaveLength(21); expect(new Set(ids).size).toBe(21)                        // otherwise one logo's gradient would paint another
    for (const p of container.querySelectorAll('path[fill^="url(#"]')) {
      const id = p.getAttribute('fill')!.slice(5, -1); expect(container.querySelector(`#${CSS.escape(id)}`)).not.toBeNull()
    }
  })
  it('wordmark follows the surrounding text colour, so it is legible on light and dark surfaces', () => {
    const { container } = render(<NirmaanLogo variant="full" />)
    const fills = [...container.querySelectorAll('path[fill-rule="evenodd"], rect')].map((e) => e.getAttribute('fill'))
    expect(fills.every((f) => f === 'currentColor')).toBe(true)
  })
})

describe('BrandLoader', () => {
  it('is a polite status region with an accessible label and a motion-safe pulse', () => {
    const { container } = render(<BrandLoader label="Loading your workspace…" />)
    expect(screen.getByRole('status')).toHaveTextContent('Loading your workspace…')
    expect(container.querySelector('svg')?.getAttribute('class')).toContain('motion-safe:animate-pulse')
  })
})
