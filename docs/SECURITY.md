# Security & Data Protection

The backend is built from Node 22 built-ins only (`node:http`, `node:crypto`,
`node:sqlite`) — no third-party packages, so the attack surface and supply-chain
risk are minimal.

## Authentication & sessions
- **Passwords**: scrypt (64-byte key, per-password 16-byte salt), constant-time
  comparison. Never stored or logged in plain text.
- **Sessions**: 256-bit random token; only its SHA-256 hash is stored. Delivered
  as an `HttpOnly`, `SameSite=Lax` cookie (plus `Secure` in production) and
  optionally as a Bearer token. 12-hour absolute expiry + **20-minute idle
  auto-logout**. Sessions are listable and revocable by the customer.
- **Login attempt restrictions**: 5 failures → 15-minute account lockout, with an
  SMS/email security alert. IP rate limiting on login, registration and OTP.
- **OTP**: 6-digit codes, SHA-256 hashed at rest, 10-minute TTL, single use,
  5-attempt limit. Used for phone verification, email verification, password
  reset and optional **two-factor authentication** at sign-in.
- **Password reset**: emailed OTP, single use; all other sessions revoked on reset.

## Access control (RBAC)
- The portal is **customer-only**. Every data query is scoped to the signed-in
  customer's id — a customer can never read or modify another customer's records.
- **System settings are read-only for customers.** Writes to `/api/settings*`
  return 403 and are audited. Only the back-office integration key can change
  settings (`/api/integration/settings`).
- Server-to-server sync requires `X-GFS-Integration-Key`; failures are audited.

## Data protection
- **Documents**: encrypted at rest with **AES-256-GCM** (random 12-byte IV, auth
  tag), stored outside the web root in `data/documents/*.enc`, mode `0600`.
  Decrypted only for the owning customer, streamed with `no-store`.
- **National ID numbers**: encrypted at rest; shown masked in the API/UI.
- **Server key**: 256-bit, generated on first boot into `data/.server-key`
  (mode 0600) or supplied via `GFS_SERVER_KEY`. Rotating it requires re-encrypting
  stored documents.
- **Transport**: set `NODE_ENV=production` behind TLS for HSTS + Secure cookies.

## HTTP hardening
- Security headers: `X-Content-Type-Options: nosniff`, `X-Frame-Options:
  SAMEORIGIN`, `Referrer-Policy`, `Permissions-Policy`, COOP, HSTS (prod).
- State-changing API requests must be `application/json` and same-origin
  (cross-origin JSON is refused; no CORS headers are emitted).
- Static serving is traversal-safe and confined to `public/`.
- Request body size limits (12 MB JSON, 5 MB documents, 1 MB webhooks).

## Financial integrity & audit
- **Every mutation** (registration, login, profile, application, decision,
  agreement, disbursement, payment, document, request, settings) is written to
  `audit_log` with actor, action, entity, before/after, IP and user agent.
- A customer-facing `activity_log` powers **Account Activity History**.
- **Unique references** for every transaction, receipt, disbursement, loan,
  application, ticket and request (DB sequences + cryptographic random suffix).
- **Idempotent payments** via `idempotencyKey` — retries never double-charge.
- **Atomic transactions**: payment verification, allocation, balance update,
  receipt and notification commit together (SQLite transaction, re-entrant).
- **Allocation order**: penalties → fees → interest → principal → advance credit.
- **Webhook security**: HMAC-SHA256 signature verification, provider-reference
  matching, amount-mismatch flagging for reconciliation.

## Fraud & suspicious activity
- Login lockout + alerts on repeated failures and on password/2FA changes.
- Webhook amount mismatches and unauthorized integration attempts are flagged
  and audited.
- Documents are validated by type and size; only the owner can decrypt them.

## Backups & recovery
- WAL checkpoint + consistent file copy to `data/backups/` daily (and on boot),
  retaining 14 days. Manual: `npm run backup`.
- **Recovery**: stop the server, copy a backup over `data/gfs.sqlite`, restart.
  The schema is created idempotently on boot.

## Production checklist
1. `NODE_ENV=production`, run behind TLS (reverse proxy).
2. Set `GFS_SERVER_KEY` (stable, secret) and `GFS_INTEGRATION_KEY`.
3. Set `GFS_SMS_WEBHOOK` / `GFS_EMAIL_WEBHOOK` to real provider gateways; dev OTP
   codes are only returned when not in production.
4. Set `GFS_<PROVIDER>_WEBHOOK_SECRET` for each payment provider and disable the
   sandbox confirm (automatic in production).
5. Restrict filesystem access to `data/`; keep backups off-box.
6. Point the admin system's `website.html` backend connection at this server's
   `/api/health` and configure the integration key.
