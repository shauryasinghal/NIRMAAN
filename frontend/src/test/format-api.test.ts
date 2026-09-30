import { describe, expect, it } from 'vitest'
import { AxiosError } from 'axios'
import { ApiError, toApiError } from '../lib/api'
import { deadlineLabel, fitTone, formatDate, money, timeAgo, titleCase } from '../lib/format'

describe('formatting never invents data', () => {
  it('labels deadlines', () => {
    expect(deadlineLabel(null, 'unknown')).toBe('No deadline listed'); expect(deadlineLabel(0, 'critical')).toBe('Closes today'); expect(deadlineLabel(1, 'critical')).toBe('Closes tomorrow')
    expect(deadlineLabel(12, 'open')).toBe('12 days left'); expect(deadlineLabel(-3, 'expired')).toBe('Closed 3d ago')
  })
  it('treats missing values as "Not listed", not as today or zero', () => { expect(formatDate(null)).toBe('Not listed'); expect(formatDate('nonsense')).toBe('Not listed'); expect(money(null, 'INR')).toBeNull() })
  it('parses date-only strings in local time (no off-by-one)', () => { expect(new Date('2026-12-01T00:00:00').getDate()).toBe(1); expect(formatDate('2026-12-01', { day: 'numeric' })).toBe('1') })
  it('misc helpers', () => { expect(titleCase('changes_requested')).toBe('Changes Requested'); expect(fitTone(80)).toBe('success'); expect(fitTone(50)).toBe('warning'); expect(fitTone(10)).toBe('danger'); expect(timeAgo(new Date(Date.now() - 3 * 3600_000).toISOString())).toBe('3h ago') })
})

describe('API error contract', () => {
  const axiosErr = (status: number, data: unknown) => Object.assign(new AxiosError('x'), { response: { status, data } })
  it('unwraps {error:{code,message,details,requestId}}', () => {
    const e = toApiError(axiosErr(422, { error: { code: 'validation_error', message: 'The request was invalid', requestId: 'r1', details: { fields: [{ field: 'title', message: 'too short' }] } } }))
    expect(e).toBeInstanceOf(ApiError); expect(e.status).toBe(422); expect(e.code).toBe('validation_error'); expect(e.requestId).toBe('r1'); expect(e.fields).toEqual({ title: 'too short' })
  })
  it('never leaks raw server bodies for malformed errors', () => { const e = toApiError(axiosErr(500, '<html>Traceback…</html>')); expect(e.code).toBe('server_error'); expect(e.message).not.toMatch(/Traceback|html/) })
  it('maps network failures to a friendly message', () => { const e = toApiError(new AxiosError('Network Error')); expect(e.code).toBe('network_error'); expect(e.message).toMatch(/couldn't reach/i) })
  it('maps timeouts', () => { const e = toApiError(Object.assign(new AxiosError('t'), { code: 'ECONNABORTED' })); expect(e.code).toBe('timeout') })
})
