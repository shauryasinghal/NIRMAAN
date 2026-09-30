import { defineConfig, devices } from '@playwright/test'

// Full-stack E2E: real frontend + real FastAPI + real Postgres schema. Only the Supabase Auth HTTP endpoints are
// stood in for by backend/e2e/fake_gotrue.py (no Docker on the dev machine) — see that file for what is not covered.
const SECRET = 'e2e-only-secret-that-is-long-enough-for-hs256-1234567890'
const DB = 'postgresql:///nirmaan_e2e'
const AUTH = 'http://127.0.0.1:54321'
const PY = '../backend/venv/bin/python'

export default defineConfig({
  testDir: './e2e',
  testIgnore: /csp\.spec\.ts/,                      // runs under playwright.csp.config.ts (production build + real headers)
  globalSetup: './e2e/support/global-setup.ts',
  fullyParallel: false, workers: 1, retries: 0, timeout: 60_000, expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: { baseURL: 'http://127.0.0.1:5173', trace: 'retain-on-failure', screenshot: 'only-on-failure', video: 'off' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    { command: `bash -c "cd ../backend && ${PY.replace('../backend/', './')} -m e2e.seed && ${PY.replace('../backend/', './')} -m e2e.fake_gotrue"`, url: `${AUTH}/auth/v1/settings`, timeout: 300_000, reuseExistingServer: false,
      env: { DATABASE_URL: DB, SUPABASE_JWT_SECRET: SECRET, NIRMAAN_ENV: 'development', LOG_LEVEL: 'ERROR' } },
    { command: 'cd ../backend && ./venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000', url: 'http://127.0.0.1:8000/health', timeout: 120_000, reuseExistingServer: false,
      env: { DATABASE_URL: DB, SUPABASE_JWT_SECRET: SECRET, SUPABASE_URL: AUTH, NIRMAAN_ENV: 'development', CORS_ORIGINS: 'http://127.0.0.1:5173,http://localhost:5173', RATE_LIMIT_PER_MINUTE: '100000', SESSION_CACHE_SECONDS: '0', LOG_LEVEL: 'ERROR', LOG_JSON: 'false', CRON_SECRET: 'e2e-cron' } },
    { command: 'npm run dev -- --host 127.0.0.1 --port 5173 --strictPort', url: 'http://127.0.0.1:5173', timeout: 120_000, reuseExistingServer: false,
      env: { VITE_SUPABASE_URL: AUTH, VITE_SUPABASE_ANON_KEY: 'e2e-anon-key-not-a-secret' } },
  ],
})
