/* Golden Financial Services — secure backend entry point.
   Zero external dependencies: Node 22 built-ins only (http, crypto, sqlite). */
import http from 'node:http';
import { PORT, HOST, IS_PROD } from './config.js';
import { router } from './api.js';
import { sessionUser } from './auth.js';
import { readJSON, sendJSON, serveStatic, clientIp, HttpError, securityHeaders } from './http.js';
import { runReminderJob } from './notifications.js';
import { seedIfEmpty } from './seed.js';
import { runBackup } from './backup.js';
import { db } from './db.js';

seedIfEmpty();

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;
  const ip = clientIp(req);
  const ua = String(req.headers['user-agent'] || '').slice(0, 300);

  // Basic hardening for state-changing requests: JSON content type + same-origin.
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && pathname.startsWith('/api/') && !pathname.startsWith('/api/webhooks/')) {
    const ct = String(req.headers['content-type'] || '');
    if (!ct.includes('application/json')) return sendJSON(res, 415, { error: 'API requests must use Content-Type: application/json.' });
    const origin = req.headers.origin;
    if (origin) {
      try {
        const o = new URL(origin);
        const host = String(req.headers.host || '').split(':')[0];
        const allowed = o.hostname === host || o.hostname === 'localhost' || o.hostname === '127.0.0.1' || o.hostname.endsWith('.e2b.app');
        if (!allowed) {
          return sendJSON(res, 403, { error: 'Cross-origin request refused.' });
        }
      } catch { return sendJSON(res, 403, { error: 'Invalid origin.' }); }
    }
  }

  if (pathname.startsWith('/api/')) {
    const match = router.match(req.method, pathname);
    if (!match) return sendJSON(res, 404, { error: `No such endpoint: ${req.method} ${pathname}` });
    try {
      const user = sessionUser(req);
      const body = ['POST', 'PUT', 'PATCH'].includes(req.method) && !pathname.startsWith('/api/webhooks/') ? await readJSON(req) : {};
      const ctx = { req, res, url, params: match.params, body, user, ip, ua };
      const result = await match.handler(ctx);
      if (result !== undefined && !res.writableEnded) ok(res, result);
    } catch (e) {
      if (res.writableEnded) return;
      if (e instanceof HttpError) return sendJSON(res, e.status, { error: e.message, code: e.code });
      console.error(`[api] ${req.method} ${pathname}:`, e);
      sendJSON(res, 500, { error: IS_PROD ? 'Something went wrong. Please try again.' : `Server error: ${e.message}` });
    }
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') return sendJSON(res, 405, { error: 'Method not allowed.' });
  serveStatic(req, res, pathname);
});

function ok(res, data) { sendJSON(res, 200, data); }

server.listen(PORT, HOST, () => {
  console.log(`\n  GOLDEN FINANCIAL SERVICES — customer platform`);
  console.log(`  ▸ Website + portal + API listening on http://${HOST}:${PORT}`);
  console.log(`  ▸ Mode: ${IS_PROD ? 'PRODUCTION' : 'development (sandbox payments, dev OTP codes)'}`);
  console.log(`  ▸ Central database: SQLite (WAL) · documents encrypted at rest`);
  console.log(`  ▸ Linked system: golden-loan-services (see /api/integration/status)\n`);
  try { const r = runReminderJob(); if (r.reminders || r.penalties) console.log(`  ▸ Reminder job: ${r.reminders} reminders, ${r.penalties} penalties`); } catch (e) { console.error('reminder job:', e.message); }
});

/* Scheduled jobs */
setInterval(() => { try { runReminderJob(); } catch (e) { console.error('reminder job:', e.message); } }, 6 * 3600 * 1000).unref();
setInterval(() => { try { runBackup(); } catch (e) { console.error('backup:', e.message); } }, 24 * 3600 * 1000).unref();
setTimeout(() => { try { runBackup(); } catch {} }, 5000).unref();

process.on('SIGTERM', () => { server.close(); try { db.close(); } catch {} process.exit(0); });
process.on('SIGINT', () => { server.close(); try { db.close(); } catch {} process.exit(0); });
