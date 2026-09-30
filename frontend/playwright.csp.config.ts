import { defineConfig } from '@playwright/test'
import base from './playwright.config'

// Same stack as the main E2E run, but the frontend is the PRODUCTION build served with the real vercel.json headers.
export default defineConfig({
  ...base, testDir: './e2e', testIgnore: [], testMatch: /csp\.spec\.ts/, reporter: [['list']],
  webServer: [
    ...(base.webServer as { url: string }[]).slice(0, 2),
    { command: 'npm run build && node e2e/support/csp-server.mjs', url: 'http://127.0.0.1:5173', timeout: 180_000, reuseExistingServer: false,
      env: { VITE_SUPABASE_URL: 'http://127.0.0.1:54321', VITE_SUPABASE_ANON_KEY: 'e2e-anon-key-not-a-secret' } },
  ] as never,
})
