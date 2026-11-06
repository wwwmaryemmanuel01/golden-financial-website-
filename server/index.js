/* Golden Financial Services — customer website + authoritative backend. */
import http from 'node:http';
import { PORT, HOST, IS_PROD, DEMO_MODE, ALLOWED_ORIGINS } from './config.js';
import { router } from './api.js';
import { sessionUser } from './auth.js';
import { readBody, sendJSON, serveStatic, clientIp, HttpError } from './http.js';
import { runReminderJob } from './notifications.js';
import { flushOutbox } from './events.js';
import { seedIfEmpty, seedSettings } from './seed.js';
import { runBackup } from './backup.js';
import { db } from './db.js';
import { migrate } from './migrations.js';
import { rateLimit } from './security.js';
seedSettings();
migrate();
if (DEMO_MODE) seedIfEmpty();
const signedPath = path => path.startsWith('/api/webhooks/') || path.startsWith('/api/integration/');
const server = http.createServer(async (req, res) => {
  let url;
  try { url = new URL(req.url, `http://${req.headers.host || 'localhost'}`); } catch { return sendJSON(res, 400, { error: 'Invalid request URL.' }); }
  const pathname = url.pathname, ip = clientIp(req), ua = String(req.headers['user-agent'] || '').slice(0, 300);
  const origin = String(req.headers.origin || '');
  let originAllowed = !origin;
  if (origin) { try { const o = new URL(origin); originAllowed = ['http:', 'https:'].includes(o.protocol) && (o.host === req.headers.host || ALLOWED_ORIGINS.includes(o.origin)); } catch {} }
  if (pathname.startsWith('/api/') && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-GFS-Request, Idempotency-Key');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  }
  if (req.method === 'OPTIONS') { res.writeHead(originAllowed ? 204 : 403); return res.end(); }
  if (pathname.startsWith('/api/')) {
    const mutation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);
    if (mutation && !signedPath(pathname)) {
      if (!originAllowed) return sendJSON(res, 403, { error: 'Cross-origin request refused.', code: 'ORIGIN_REFUSED' });
      if (req.headers['x-gfs-request'] !== 'website') return sendJSON(res, 403, { error: 'Missing website request header.', code: 'CSRF_REFUSED' });
      if (!String(req.headers['content-type'] || '').includes('application/json')) return sendJSON(res, 415, { error: 'API requests must use application/json.' });
    }
    const limit = rateLimit(`api:${ip}`, 600, 60000);
    if (!limit.ok) return sendJSON(res, 429, { error: 'Too many requests. Please wait a moment.' }, { 'Retry-After': String(limit.retryAfter) });
    const match = router.match(req.method, pathname);
    if (!match) return sendJSON(res, 404, { error: 'Endpoint not found.' });
    try {
      const user = sessionUser(req);
      let body = {}, rawBody = Buffer.alloc(0);
      if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
        rawBody = await readBody(req, signedPath(pathname) ? 1024 * 1024 : 12 * 1024 * 1024);
        // Signed handlers verify the HMAC over rawBody before trusting parsed JSON.
        try { body = rawBody.length ? JSON.parse(rawBody.toString('utf8')) : {}; } catch { throw new HttpError(400, 'Invalid JSON body.'); }
        if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'Expected a JSON object.');
      }
      const ctx = { req, res, url, params: match.params, body, rawBody, user, ip, ua };
      const result = await match.handler(ctx);
      if (result !== undefined && !res.writableEnded) sendJSON(res, 200, result);
    } catch (e) {
      if (res.writableEnded) return;
      if (e instanceof HttpError) return sendJSON(res, e.status, { error: e.message, code: e.code });
      console.error(`[api] ${req.method} ${pathname}:`, e.message);
      sendJSON(res, 500, { error: IS_PROD ? 'Something went wrong. Please try again.' : `Server error: ${e.message}`, code: 'INTERNAL_ERROR' });
    }
    return;
  }
  if (!['GET', 'HEAD'].includes(req.method)) return sendJSON(res, 405, { error: 'Method not allowed.' });
  serveStatic(req, res, pathname);
});
server.requestTimeout = 30000;
server.headersTimeout = 15000;
server.listen(PORT, HOST, () => {
  console.log(`\n  GOLDEN FINANCIAL SERVICES — customer platform v2`);
  console.log(`  Website + portal + API: http://${HOST}:${PORT}`);
  console.log(`  Mode: ${DEMO_MODE ? 'SANDBOX — no real money or external identity checks' : 'BACKEND — external services require configuration'}`);
  console.log(`  Database: SQLite WAL · append-only ledger · encrypted documents\n`);
  try { runReminderJob(); } catch (e) { console.error('reminder job:', e.message); }
});
setInterval(() => { try { runReminderJob(); } catch (e) { console.error('reminder job:', e.message); } }, 6 * 3600 * 1000).unref();
setInterval(() => { flushOutbox().catch(e => console.error('system connector:', e.message)); }, 60000).unref();
setInterval(() => { runBackup().catch(e => console.error('backup:', e.message)); }, 24 * 3600 * 1000).unref();
process.on('SIGTERM', () => server.close(() => { db.close(); process.exit(0); }));
process.on('SIGINT', () => server.close(() => { db.close(); process.exit(0); }));
