// Serves the PRODUCTION build (dist/) with the exact headers from vercel.json and proxies /api to the API — so a strict
// CSP is tested against the real bundle. Test-only: it adds the local stand-in auth origin to connect-src.
import { createServer } from 'node:http'
import { readFileSync, existsSync, statSync } from 'node:fs'
import { extname, join, normalize } from 'node:path'

const cfg = JSON.parse(readFileSync('vercel.json', 'utf8'))
const headers = Object.fromEntries(cfg.headers.find((h) => h.source === '/(.*)').headers.map((h) => [h.key, h.value]))
headers['Content-Security-Policy'] = headers['Content-Security-Policy'].replace("connect-src 'self'", "connect-src 'self' http://127.0.0.1:54321")
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' }
const PORT = 5173
createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x')
  if (url.pathname.startsWith('/api/')) {
    const chunks = []; for await (const c of req) chunks.push(c)
    const r = await fetch(`http://127.0.0.1:8000${url.pathname}${url.search}`, { method: req.method, headers: { ...req.headers, host: '127.0.0.1:8000' }, body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks) })
    res.writeHead(r.status, Object.fromEntries(r.headers)); return res.end(Buffer.from(await r.arrayBuffer()))
  }
  let file = join('dist', normalize(url.pathname))
  if (!existsSync(file) || statSync(file).isDirectory()) file = join('dist', 'index.html')
  res.writeHead(200, { ...headers, 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' }); res.end(readFileSync(file))
}).listen(PORT, '127.0.0.1', () => console.log(`csp server on ${PORT}`))
