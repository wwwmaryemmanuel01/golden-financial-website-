# GOLDEN FINANCIAL SERVICES — Website + Customer Portal + Secure Backend

**Currency: Malawi Kwacha (MWK)** · **Public website + customer portal + secure backend**
**Linked to the [Golden Loan Services](https://github.com/wwwmaryemmanuel01/golden-loan-services) admin system** · **No admin portal here (excluded by design)**

This rebuild is a functional lending platform, not a visual mockup. Customers can
register, verify contact details, apply, receive assessments, sign agreements
electronically, track disbursements, repay, request settlements/renewals/top-ups,
download PDF records, and manage profile/documents/security. Every module reads
and writes **one central SQLite database** when the backend is running. Verified
payments update balances through an append-only ledger, every financial movement
has a unique reference, and actions are audited. **Customers can never change
system settings.**

The public site offers exactly five loan categories: **Personal, Business, Salary
Advance, Agriculture and Emergency**. The header matches the dark admin theme:
**charcoal `#0F1115`, panels `#171A21` / `#1B1F27`, gold `#C9A227` / `#E8C860`**.
Brand emerald remains in supporting calls to action.

---

## Quick start

Requires **Node.js ≥ 22.5** (built-in SQLite). The runtime has **zero production
dependencies**. `npm install` is only needed for the optional browser smoke test
(`jsdom` dev dependency).

```bash
npm start                 # → http://localhost:3000
# isolated sandbox instance:
GFS_DATA_DIR=/tmp/gfs-demo GFS_DEMO_MODE=true PORT=3000 node server/index.js
```

On first boot the server creates the database, encrypts a server key, seeds
settings and a sandbox demo customer, and starts reminder/outbox/backup jobs.

**Sandbox sign-in:** `demo@goldenfinancial.mw` / `Demo@1234`

```bash
npm test                  # 57-assertion backend end-to-end test (mutates target DB)
npm run test:browser      # jsdom smoke: 37 public + 21 portal routes, server + static modes
npm run test:pages        # 11 GitHub Pages packaging/content checks
npm run test:catalog      # 13 non-destructive catalogue migration checks
npm run backup            # encrypted SQLite + document backup with SHA-256 manifest
npm run seed              # add the demo customer if missing
```

Run tests against an isolated instance, for example:

```bash
GFS_DATA_DIR=/tmp/gfs-test GFS_DEMO_MODE=true PORT=3100 node server/index.js
GFS_TEST_URL=http://127.0.0.1:3100 npm test
GFS_TEST_URL=http://127.0.0.1:3100 npm run test:browser
```

---

## GitHub Pages publishing

The website is **`public/index.html`**, not the repository README. The deployment
workflow packages **only `public/`**, checks its scripts/styles/assets, and uploads
that folder as the Pages artifact. The preferred repository setting is
**Settings → Pages → Build and deployment → Source: GitHub Actions**.

The current branch-root Pages configuration is also supported: root `index.html`
opens `public/` and preserves deep links, while root `.nojekyll` disables Jekyll
processing. This prevents the repository README from appearing instead of the
website. No source code or database is included in the Actions website artifact.

```bash
npm run test:pages   # checks both publishing layouts and offline-shell assets
```

After a publishing change, allow the deployment to finish and refresh the page.
GitHub Pages can briefly cache the previous homepage.

## Modes — read this before deploying

| Mode | When | What is true |
|---|---|---|
| **Secure backend** | `node server/index.js` reachable | Central SQLite DB, scrypt passwords, hashed challenge-bound OTPs, sessions/idle logout/lockout, encrypted documents, append-only ledger, signed webhooks, PDF records, audit trail. |
| **Sandbox** | `GFS_DEMO_MODE=true` (default outside production) | Same backend, but application review, disbursement and mobile-money confirmation are **explicitly simulated** and labelled. No real money or external identity checks. |
| **GitHub Pages / static** | No backend configured | The same UI runs against a **device-local sandbox** (`gfs_sandbox_v2`). It is clearly badged, stores documents as metadata only, and is **not** a shared database or secure sync. |
| **Configured backend outage** | `runtime-config.json` points to a backend that fails | The UI shows a connection error. It **never silently falls back** to demo storage. |

The frontend detects the backend via `GET /api/health`. Static Pages mode is only
entered on `*.github.io`, `file:`, or an explicit `data-static-demo` flag.

### Loan catalogue and historical records

New applications and public discovery use only `PL`, `BL`, `SA`, `AL` and `EL`.
Retired definitions are kept internally so old loans/applications/statements remain
readable. The migration normalises persisted settings without deleting financial
records; pending retired-product applications are held for support rather than
automatically approved or disbursed. Unknown/retired calculator product IDs are
rejected instead of silently falling back to Personal.

### Journal and resource pages

`/blog` and `/blog/:slug` provide an interactive educational journal: search,
topic filters, device-local bookmarks, share/print, text size, reading progress,
contents navigation and previous/next articles. The backend can publish validated
`blog_posts` through the signed connector and labels responses as published; the
static sandbox labels its bundled library as device-local. It is not a fabricated
news wire. `/guides`, `/security-centre`, `/borrowing-checklist`, `/complaints`
and `/accessibility` add practical tools. Motion can be set to Full, Gentle or Off
and respects reduced-motion preferences.

### External services are not assumed live

- **TNM Mpamba / Airtel Money:** production mobile payments require a configured
  HTTPS gateway URL/key/secret. Without them the API returns `503`; the UI says
  setup is needed. The generic adapter is not a claim of official provider
  certification.
- **Bank transfer / cash:** customer-submitted references are claims only. They
  enter reconciliation and do **not** change balances until an authorised
  system/webhook verifies them.
- **SMS/email:** delivery requires configured gateways. Otherwise histories are
  recorded as `not_configured`; sandbox codes are shown only in demo mode.
- **AI assistant:** replies are labelled automated. Optional external AI requires
  an HTTPS endpoint/key and explicit consent; otherwise a deterministic
  record-based assistant is used. Human support is via tracked tickets.

---

## Linked admin system

This customer site is linked to
[`wwwmaryemmanuel01/golden-loan-services`](https://github.com/wwwmaryemmanuel01/golden-loan-services).
The admin repository currently contains **sample/browser-local data**; a GitHub
link or shared `localStorage` is **not** database synchronisation. The backend
exposes a signed, timestamped, replay-protected connector (`/api/integration/*`)
and outbox events for a deployed authenticated adapter. Until that adapter is
configured and successful, `/api/integration/status` reports `connected: false`.

---

## Architecture

```
index.html               Root-Pages entrypoint → public/ (preserves deep links)
.nojekyll                Disable Jekyll for branch-root publishing
public/                  Static frontend (no build step) — GitHub Pages compatible
  index.html             SPA shell
  css/theme.css          Base design tokens/components
  css/rebuild.css        Rebuilt responsive interface layer
  css/experience.css     Dark admin-matching header + journal/resource styles
  js/core.js             Shared financial engine (five products, archived lookups,
                           amortisation, eligibility, allocation, references)
  js/content.js          Structured educational article/checklist defaults
  js/blog.js             Journal list/detail, bookmarks, reader and motion controls
  js/resources.js        Guides, security centre, checklist, complaints, accessibility
  js/app.js              Hash router, shells, search, idle logout
  js/api.js              Transport with explicit server/local/unavailable boundary
  js/local.js            Device-local sandbox adapter (no admin bridge)
  js/public-pages.js     Public website routes
  js/auth-pages.js       Register / verify / login / 2FA / reset
  js/portal*.js          Dashboard, loans, applications, payments, account, support,
                           payments workspace, insights
  assets/                Company logo, favicons, PWA icons
  sw.js, manifest        Network-first PWA shell (never caches API traffic)
server/                  Zero-runtime-dependency Node backend
  index.js               HTTP server, CSRF/origin guards, rate limit, jobs
  config.js              Environment, data dirs, server key, demo/production mode
  db.js                  Central SQLite schema, WAL, audit helpers, immutable triggers
  migrations.js          Idempotent schema migrations
  catalog.js             Settings-backed five-product catalogue, rules, methods,
                           validated blog publication (customer read-only)
  content.js             Public read-only blog list/detail API
  finance.js             Accrual, penalties, settlement quotes, repayment allocation
  auth.js                scrypt, sessions, OTP challenges, 2FA, lockout, profile
  loans.js               Applications, simulated/manual review, agreements,
                           disbursement, balances, schedules, requests
  payments.js            Idempotent initiation, sandbox confirm, reconciliation,
                           signed provider webhooks, receipts
  documents.js           AES-256-GCM encrypted uploads, magic-byte validation,
                           ownership checks, guarantors, collateral
  notifications.js       In-app authority + queued SMS/email with delivery status
  support.js             Automated assistant, tickets, complaints, announcements
  statements.js / pdf.js PDF receipts, statements, agreements, settlement records
  integration.js         Signed system connector, public config, truthful status
  backup.js              SQLite backup API + encrypted docs + manifest
  seed.js                Sandbox demo data
shared/core.mjs          Backend loader for the shared financial engine
shared/content.mjs       Backend loader for the editorial library
tests/run.js             Backend end-to-end assertions (isolated DB recommended)
tests/browser-smoke.cjs  jsdom route/interaction smoke for server + static modes
tests/catalog-migration.js  Isolated catalogue migration preservation checks
tests/pages-entrypoint.js   GitHub Pages packaging and content checks
docs/                    API / integration / security notes
integration/             Example connector configuration
```

---

## Security highlights

- Passwords: scrypt. Sessions: hashed tokens, expiry, idle timeout, revocation.
- OTPs: HMAC-hashed, challenge-bound, TTL and attempt-limited. Reset codes are
  consumed exactly once by the final reset endpoint.
- Documents: encrypted at rest, SHA-256 integrity, magic-byte validation,
  owner-only access. Uploading a document never verifies KYC by itself.
- Financial ledger: integer-cent accounting, append-only triggers, allocation
  penalties → fees → interest → principal, early settlement waives unaccrued
  future interest.
- Payments: idempotency keys with fingerprint mismatch detection; sandbox
  confirmation requires `simulate: true` and demo mode; live verification requires
  signed callbacks or authorised reconciliation.
- Customers cannot write system settings; integration endpoints require signed
  system authentication.

## Known limitations / next work

- Independent guarantor consent currently relies on uploaded consent documents
  and system review; a dedicated guarantor-facing consent/OTP flow is still to be
  added.
- Live mobile-money gateways, SMS/email providers and the admin connector must be
  configured and verified before production use.
- GitHub Pages mode is a local demonstration, not multi-device sync.
