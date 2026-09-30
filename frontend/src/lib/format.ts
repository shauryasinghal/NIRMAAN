import type { Urgency } from '../types'

export const titleCase = (s: string) => s.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

export function formatDate(iso: string | null | undefined, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }) {
  if (!iso) return 'Not listed'
  const d = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T00:00:00`) : new Date(iso)
  return Number.isNaN(d.getTime()) ? 'Not listed' : d.toLocaleDateString(undefined, opts)
}

export function timeAgo(iso: string, now = Date.now()) {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000))
  if (s < 60) return 'just now'
  const units: [number, string][] = [[86400 * 30, 'mo'], [86400 * 7, 'w'], [86400, 'd'], [3600, 'h'], [60, 'm']]
  for (const [n, u] of units) if (s >= n) return `${Math.floor(s / n)}${u} ago`
  return 'just now'
}

export function deadlineLabel(days: number | null, urgency: Urgency) {
  if (days === null || urgency === 'unknown') return 'No deadline listed'
  if (days < 0) return `Closed ${Math.abs(days)}d ago`
  if (days === 0) return 'Closes today'
  if (days === 1) return 'Closes tomorrow'
  return `${days} days left`
}

export const urgencyTone = (u: Urgency): 'danger' | 'warning' | 'neutral' | 'success' => (u === 'critical' || u === 'expired' ? 'danger' : u === 'soon' ? 'warning' : u === 'open' ? 'success' : 'neutral')

export function money(amount: number | null, currency: string | null) {
  if (amount === null) return null
  try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: currency || 'INR', maximumFractionDigits: 0 }).format(amount) } catch { return `${amount} ${currency ?? ''}`.trim() }
}

export function fitTone(score: number): 'success' | 'warning' | 'danger' { return score >= 65 ? 'success' : score >= 40 ? 'warning' : 'danger' }
