import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// Vendor libraries change rarely, so they get their own long-cached chunks instead of bloating the entry bundle.
const VENDOR: [string, RegExp][] = [
  ['vendor-supabase', /node_modules\/(@supabase|iceberg-js|tslib)\//],
  ['vendor-motion', /node_modules\/(framer-motion|motion-dom|motion-utils)\//],
  ['vendor-query', /node_modules\/(@tanstack|axios)\//],
  ['vendor-forms', /node_modules\/(react-hook-form|@hookform|zod)\//],
  ['vendor-react', /node_modules\/(react|react-dom|react-router|react-router-dom|scheduler|@remix-run)\//],
]

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: { output: { manualChunks: (id: string) => VENDOR.find(([, re]) => re.test(id))?.[0] } },
    chunkSizeWarningLimit: 350,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:8000', changeOrigin: true },
      '/health': { target: 'http://localhost:8000', changeOrigin: true },
    },
  },
})
