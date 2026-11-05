/* Security primitives: scrypt password hashing, HMAC session tokens,
   AES-256-GCM field/document encryption, rate limiting, audit trail. */
import crypto from 'node:crypto';
import { SERVER_KEY } from './config.js';

export const sha256 = s => crypto.createHash('sha256').update(s).digest('hex');
export const hmac = s => crypto.createHmac('sha256', SERVER_KEY).update(s).digest('hex');
export const randomToken = (n = 32) => crypto.randomBytes(n).toString('hex');
export const randomCode = () => String(crypto.randomInt(100000, 1000000));

/* ---- passwords: scrypt with per-password salt ---- */
export function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(pw), salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}
export function verifyPassword(pw, stored) {
  try {
    const [alg, salt, hash] = String(stored).split('$');
    if (alg !== 'scrypt') return false;
    const test = crypto.scryptSync(String(pw), salt, 64);
    return crypto.timingSafeEqual(test, Buffer.from(hash, 'hex'));
  } catch { return false; }
}

/* ---- session tokens: random secret, only its hash is stored ---- */
export function newSessionToken() {
  const secret = randomToken(32);
  return { secret, hash: sha256(secret) };
}

/* ---- AES-256-GCM encryption at rest (documents, national IDs) ---- */
export function encrypt(plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', SERVER_KEY, iv);
  const data = Buffer.isBuffer(plain) ? plain : Buffer.from(String(plain), 'utf8');
  const enc = Buffer.concat([cipher.update(data), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]); // 12 + 16 + n
}
export function decrypt(buf) {
  const iv = buf.subarray(0, 12), tag = buf.subarray(12, 28), enc = buf.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', SERVER_KEY, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]);
}
export const encryptText = s => encrypt(s).toString('base64');
export function decryptText(b64) { try { return decrypt(Buffer.from(b64, 'base64')).toString('utf8'); } catch { return null; } }

/* ---- webhook signature verification (provider callbacks) ---- */
export function verifyWebhookSignature(rawBody, signature, secret) {
  if (!signature || !secret) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  try { return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(String(signature).replace(/^sha256=/, ''))); }
  catch { return false; }
}

/* ---- in-memory rate limiter / login attempt lockout ---- */
const buckets = new Map();
export function rateLimit(key, max, windowMs) {
  const now = Date.now();
  const b = buckets.get(key) || { count: 0, reset: now + windowMs };
  if (now > b.reset) { b.count = 0; b.reset = now + windowMs; }
  b.count++;
  buckets.set(key, b);
  if (buckets.size > 20000) for (const [k, v] of buckets) if (now > v.reset) buckets.delete(k);
  return { ok: b.count <= max, remaining: Math.max(0, max - b.count), retryAfter: Math.ceil((b.reset - now) / 1000) };
}

/* ---- input sanitisation ---- */
export const clean = (s, max = 5000) => String(s == null ? '' : s).slice(0, max).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim();
export const cleanNum = (v, def = 0) => { const n = Number(v); return Number.isFinite(n) ? n : def; };
export const pick = (obj, keys) => { const o = {}; for (const k of keys) if (obj[k] !== undefined) o[k] = obj[k]; return o; };
