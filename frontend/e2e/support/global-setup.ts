import { mkdirSync, writeFileSync } from 'node:fs'

/** Logs each seeded account in through the (stand-in) Auth API and saves a browser storage state, so most specs start
 *  already signed in. The tests that exercise signing in/up/out use the real UI instead. */
const AUTH = 'http://127.0.0.1:54321'
export const PASSWORD = 'E2e-pass-123'
export const ACCOUNTS = { student: 'e2e-student@nirmaan.test', onboarded: 'e2e-onboarded@nirmaan.test', other: 'e2e-other@nirmaan.test', reviewer: 'e2e-reviewer@nirmaan.test', admin: 'e2e-admin@nirmaan.test' } as const

export default async function globalSetup() {
  mkdirSync('e2e/.auth', { recursive: true })
  for (const [name, email] of Object.entries(ACCOUNTS)) {
    const r = await fetch(`${AUTH}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: 'x' }, body: JSON.stringify({ email, password: PASSWORD }) })
    if (!r.ok) throw new Error(`could not sign in ${email}: ${r.status} ${await r.text()}`)
    const session = await r.json()
    const state = { cookies: [], origins: [{ origin: 'http://127.0.0.1:5173', localStorage: [{ name: 'sb-127-auth-token', value: JSON.stringify(session) }] }] }
    writeFileSync(`e2e/.auth/${name}.json`, JSON.stringify(state))
  }
}
