/* Zero-dependency HTTP layer: router, JSON bodies, cookies, static files,
   security headers. No external packages — Node built-ins only. */
import fs from 'node:fs';
import path from 'node:path';
import { PUBLIC_DIR, IS_PROD, ALLOWED_ORIGINS } from './config.js';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.pdf': 'application/pdf', '.webp': 'image/webp'
};

export class HttpError extends Error {
  constructor(status, message, code) { super(message); this.status = status; this.code = code || undefined; }
}

export function sendJSON(res, status, data, headers = {}) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    ...securityHeaders(), ...headers
  });
  res.end(body);
}
export const ok = (res, data = {}) => sendJSON(res, 200, data);
export const created = (res, data = {}) => sendJSON(res, 201, data);
export const bad = (res, msg, code) => sendJSON(res, 400, { error: msg, code });
export const unauth = (res, msg = 'Please sign in to continue.') => sendJSON(res, 401, { error: msg, code: 'AUTH_REQUIRED' });
export const forbidden = (res, msg = 'You do not have permission to do that.') => sendJSON(res, 403, { error: msg, code: 'FORBIDDEN' });
export const notFound = (res, msg = 'Not found.') => sendJSON(res, 404, { error: msg });

export function securityHeaders() {
  return {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' " + ALLOWED_ORIGINS.join(' ') + "; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'",
    ...(IS_PROD ? { 'Strict-Transport-Security': 'max-age=31536000; includeSubDomains' } : {})
  };
}

export function readBody(req, limit = 12 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', c => {
      size += c.length;
      if (size > limit) { reject(new HttpError(413, 'Request body too large.')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
export async function readJSON(req) {
  const buf = await readBody(req);
  if (!buf.length) return {};
  try { return JSON.parse(buf.toString('utf8')); }
  catch { throw new HttpError(400, 'Invalid JSON body.'); }
}

export function parseCookies(req) {
  const out = {};
  const h = req.headers.cookie || '';
  for (const part of h.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}
export function setCookie(res, name, value, { maxAge, httpOnly = true, sameSite = 'Lax', path = '/' } = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${path}`, `SameSite=${sameSite}`];
  if (httpOnly) parts.push('HttpOnly');
  if (maxAge != null) parts.push(`Max-Age=${maxAge}`);
  if (IS_PROD) parts.push('Secure');
  const prev = res.getHeader('Set-Cookie');
  res.setHeader('Set-Cookie', [...(prev ? [].concat(prev) : []), parts.join('; ')]);
}
export function clearCookie(res, name) { setCookie(res, name, '', { maxAge: 0 }); }

export const clientIp = req => (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || 'unknown';

/* ---------------- router ---------------- */
export class Router {
  constructor() { this.routes = []; }
  add(method, pattern, handler) {
    const keys = [];
    const rx = new RegExp('^' + pattern.replace(/:[^/]+/g, m => { keys.push(m.slice(1)); return '([^/]+)'; }) + '$');
    this.routes.push({ method, rx, keys, handler });
    return this;
  }
  get(p, h) { return this.add('GET', p, h); }
  post(p, h) { return this.add('POST', p, h); }
  put(p, h) { return this.add('PUT', p, h); }
  patch(p, h) { return this.add('PATCH', p, h); }
  delete(p, h) { return this.add('DELETE', p, h); }
  match(method, pathname) {
    for (const r of this.routes) {
      if (r.method !== method) continue;
      const m = pathname.match(r.rx);
      if (m) { const params = {}; r.keys.forEach((k, i) => params[k] = decodeURIComponent(m[i + 1])); return { handler: r.handler, params }; }
    }
    return null;
  }
}

/* ---------------- static files (public/ only, traversal-safe) ---------------- */
export function serveStatic(req, res, pathname) {
  let rel; try { rel = decodeURIComponent(pathname); } catch { return bad(res, 'Invalid path.'); }
  if (rel === '/' || rel === '') rel = '/index.html';
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (file !== PUBLIC_DIR && !file.startsWith(PUBLIC_DIR + path.sep)) return notFound(res);
  let target = file;
  try {
    const st = fs.statSync(target);
    if (st.isDirectory()) target = path.join(target, 'index.html');
  } catch {
    // SPA fallback for unknown non-asset paths
    if (!path.extname(rel)) target = path.join(PUBLIC_DIR, 'index.html');
    else return notFound(res);
  }
  let data;
  try { data = fs.readFileSync(target); } catch { return notFound(res); }
  const ext = path.extname(target).toLowerCase();
  const isAsset = /(\.css|\.js|\.png|\.jpg|\.ico|\.woff2|\.webmanifest)$/.test(ext);
  res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Content-Length': data.length,
    'Cache-Control': ext === '.html' ? 'no-cache' : (isAsset ? 'public, max-age=3600' : 'no-cache'),
    ...securityHeaders()
  });
  res.end(data);
}
