# GOLDEN FINANCIAL SERVICES — Website + Customer Portal + Secure Backend

**Currency: Malawi Kwacha (MWK)** · **Public website + customer portal + secure backend**
**Linked to the [Golden Loan Services](https://github.com/wwwmaryemmanuel01/golden-loan-services) admin system** · **No admin portal here (excluded by design)**

A complete, fully functional lending platform — not a visual mockup. Customers
register, verify, apply, get assessed, sign agreements electronically, receive
disbursements, repay with mobile money, and download real PDF statements and
receipts. Every module reads and writes **one central database**, balances update
automatically after verified payments, every transaction has a unique reference,
and every action is audited. **Customers can never change system settings.**

The theme is drawn from the company logo: **gold `#C9A227` on emerald**, matching
the admin system's surface language.

---

## Quick start

Requires **Node.js ≥ 22.5** (uses the built-in SQLite — no `npm install`, zero dependencies).

```bash
node server/index.js          # → http://localhost:3000
# or
npm start
```

On first boot the server creates the central database, encrypts a server key,
seeds system settings and a rich demo customer, and starts reminder + backup jobs.

**Demo sign-in:** `demo@goldenfinancial.mw` / `Demo@1234`
The demo account has an active business loan (4/12 instalments paid), a closed
personal loan, an approved salary-advance offer awaiting signature, documents,
guarantors, collateral, receipts, notifications and support tickets — so every
portal module is immediately walkable.

```bash
npm test        # 40-assertion end-to-end test against the running server
npm run backup  # manual database backup
npm run seed    # add the demo customer if missing
```

### Two deployment modes (one codebase)

| Mode | When | What happens |
|---|---|---|
| **Secure backend** | `node server/index.js` reachable | Full platform: central SQLite DB, scrypt auth, encrypted documents, signed payment webhooks, PDF generation, audit trail. |
| **GitHub Pages (device-local)** | Static hosting, no backend | The *same* portal runs against a browser-local database (clearly badged “Demo mode”), using the identical financial engine, and bridges to the admin pages via shared `localStorage`. |

The frontend auto-detects the backend (`GET /api/health`) and picks the mode.

---

## Architecture

```
public/                  Static frontend (no build step) — deployable to GitHub Pages
  index.html             SPA shell
  css/theme.css          Gold + emerald design system (from the logo)
  js/core.js             ★ Shared financial engine (products, amortisation, eligibility,
                           allocation, references) — used by BOTH browser and backend
  js/app.js              Hash router + public/portal/auth shells
  js/api.js              Transport: secure backend ⇄ device-local adapter
  js/local.js            GitHub Pages adapter (same API, browser storage, GLS bridge)
  js/public-pages.js     All 30 public pages
  js/auth-pages.js       Register / login / OTP / 2FA / reset
  js/portal*.js          Dashboard, loans, applications, payments, account, support
  assets/                Company logo + favicons (from the admin system)
  sw.js, manifest        Progressive Web App
server/                  Zero-dependency Node backend
  index.js               HTTP server, security middleware, scheduled jobs
  db.js                  Central SQLite schema (20+ tables) + audit helpers
  auth.js                scrypt, sessions, OTP, 2FA, lockout, profile, RBAC
  loans.js               Calculator, eligibility, application pipeline, agreements,
                           disbursement, live balances, schedules, loan requests
  payments.js            Mpamba/Airtel/bank/cash, sandbox + signed webhooks, receipts
  documents.js           AES-256-GCM encrypted storage, KYC, guarantors, collateral
  support.js             AI assistant, live chat, tickets, complaints
  statements.js          PDF receipts, statements, agreements, settlement letters
  pdf.js                 Hand-built valid PDF writer (no libraries)
  notifications.js       In-app + SMS/email outbox, reminders, overdue penalties
  integration.js         Link to golden-loan-services (config, sync, decisions)
  security.js            Crypto, rate limiting, webhook verification
  backup.js              Daily WAL-safe backups (14-day retention)
shared/core.mjs          ESM bridge loading the shared engine for the backend
tests/run.js             End-to-end smoke test (40 assertions)
docs/                    INTEGRATION.md · API.md · SECURITY.md
```

**One source of truth for money:** `public/js/core.js` is loaded by the browser
as a plain script and by the backend through `shared/core.mjs`. The calculator,
eligibility rules, amortisation, allocation order and reference formats are
identical in both modes and mirror the admin system's configuration.

---

## Feature coverage

### 1. Public website (30 pages)
Home · About Us · Our Services · Loan Products · Personal · Business · Emergency ·
Salary Advance · Agricultural · Education · Medical · Asset Financing · Group ·
Mortgage · Loan Calculator · Eligibility Checker · How It Works · Loan
Requirements · Interest Rates & Fees · Repayment Methods · FAQs · Contact Us ·
Testimonials · Branch Locations · Announcements · Terms & Conditions · Privacy
Policy · Online Loan Application · Customer Registration · Customer Login.

### 2. Registration & account management
Registration · login · forgot/reset password · email & phone verification · OTP ·
two-factor authentication · profile · profile picture upload · personal info ·
residential address · employment · business · monthly income · next of kin ·
guarantor info · national ID / passport / driving licence verification · document
uploads · KYC status · account activity history · change password · security settings.

### 3. Customer portal & dashboard
Welcome message · profile overview · total borrowed · active loans · outstanding
balance · total repaid · next repayment amount & date · application status ·
approved/rejected (with reasons)/pending · repayment history · receipts ·
transaction history · loan statements · repayment schedules · downloadable
statements & receipts · notifications · live chat · complaints · request another
loan · update personal info · settlement / renewal / top-up requests · announcements.

### 4. Loan products & management
All 10 products with min/max, rates, processing fees, terms, late penalties,
collateral & guarantor requirements, repayment frequency, eligibility · renewal ·
refinancing · restructuring · top-up · cancellation · application tracking.

### 5. Loan calculator
Amount · type · rate · duration · monthly/total interest · processing fee · total
repayment · monthly/weekly/daily repayment · start & end dates · outstanding
balance · full amortisation schedule.

### 6. Online loan application
Product · amount · duration · personal/employment/income/business details ·
ID & supporting document uploads · guarantor · collateral · accept agreement ·
submit · reference number (`GLS-APP-…`) · track status · confirmation · additional
document requests · application history · approval/rejection reasons.

### 7. Approval & disbursement (customer view)
Review/verification/credit-assessment/guarantor/collateral status · approval ·
rejection reasons · offer · agreement · accept · disbursement status & reference ·
confirmation · download agreement & disbursement receipt.

### 8. Repayment management
Outstanding balance · amount · due date · schedule · make payments · partial ·
full settlement · early · advance · daily/weekly/monthly · overdue · late
penalties · reminders · confirmation · receipts · history · updated balance ·
settlement statement.

### 9. Payment methods & integrations
TNM Mpamba · Airtel Money · bank transfers (FDH / Standard Bank) · mobile money
merchant payments · cash records · payment references · automated verification ·
transaction status tracking · confirmation · receipts · history · reconciliation ·
failure notifications · secure processing (signed webhooks, idempotency).

### 10. Notifications & SMS
Welcome · registration · OTP · application confirmation · approval · rejection ·
disbursement · repayment confirmation · upcoming reminders · overdue alerts ·
settlement confirmation · password reset · in-app · email · SMS history ·
transaction alerts · company announcements.

### 11. Support & live chat
Live chat · AI chatbot · human handoff · customer↔support messaging · chat
history · file attachments (via documents) · support tickets · complaint
submission & tracking · ticket status · FAQs · feedback · response notifications.

### 12. Financial records
Personal/business loan statements · repayment statements · transaction statements ·
outstanding balance statements · interest/fee/penalty records · disbursement
records · full transaction history · **download PDF statements & receipts** ·
print financial statements.

### 13. Guarantors & collateral
Add guarantor · ID & contact details · verification status · consent · view ·
add collateral · land/house/vehicle/household/livestock documentation · valuation ·
verification status · release on settlement.

### 14. Security & data protection
Secure login · scrypt hashing · RBAC · 2FA · database security · encrypted
document storage · AES-256-GCM · session management · automatic logout · login
attempt restrictions · activity history · backups · recovery · fraud controls ·
suspicious-transaction flags · secure API integration · data privacy · account
protection. See [docs/SECURITY.md](docs/SECURITY.md).

### 15. Advanced customer features
AI loan assistant · AI support · automated eligibility · automated reminders ·
smart recommendations · automated statements · repayment progress tracking ·
digital agreements · **electronic signatures (drawn + typed)** · financial
analytics (dashboard KPIs) · overdue alerts · mobile-friendly portal · **PWA** ·
document management · online renewal / top-up / settlement requests.

### 16. Website & account settings
Company logo/branding · contact info · address · email · social links · theme ·
**MWK currency** · product/rate/repayment/payment info · SMS & email preferences ·
profile/password/privacy/security settings. **System settings are read-only for
customers** — owned by the back-office and synced; write attempts return 403.

### 17. Customer experience & accessibility
Responsive design · mobile/tablet/desktop · easy navigation · fast loading ·
loading animations · **logo during login and logout** · dashboard loading
indicators · form validation · error/success messages · confirmation dialogs ·
search (transactions/records) · customer-friendly UI · accessible markup ·
clear financial information.

---

## Linking to the Golden Loan Services system

See **[docs/INTEGRATION.md](docs/INTEGRATION.md)** for the full contract. In brief:

1. **Shared configuration** — the admin owns products/rates/fees/company settings
   and pushes them via `POST /api/integration/settings` (integration key).
   Customers read them; they can never write them.
2. **Server-to-server sync** — `GET /api/integration/export` feeds the central
   database to the back-office; `POST /api/integration/decision` lets the
   back-office override automated decisions.
3. **GitHub Pages bridge** — on the shared `github.io` origin the site writes
   submitted applications into the admin's `gls_applications_v1` localStorage key
   and reads `gls_agreement_v1`, so the two customer surfaces stay in step.

Reference formats (`GF-…`, `GLS-APP-…`, `LN-YYYY-…`), the product/rate table, the
40% affordability cap, the 2% late penalty and the payment rails all match the
admin system.

---

## Deploying

### GitHub Pages (static, device-local demo mode)
Push to `main`; the included workflow (`.github/workflows/deploy-pages.yml`)
publishes `public/`. Enable **Settings → Pages → Source: GitHub Actions**. The
site runs fully in the browser and links to the admin pages on the same origin.

### Full secure backend (production)
```bash
NODE_ENV=production \
GFS_SERVER_KEY=<64-hex> \
GFS_INTEGRATION_KEY=<secret> \
GFS_SMS_WEBHOOK=https://your-sms-gateway/send \
GFS_EMAIL_WEBHOOK=https://your-email-gateway/send \
GFS_MPAMBA_WEBHOOK_SECRET=<secret> \
GFS_AIRTEL_WEBHOOK_SECRET=<secret> \
PORT=3000 node server/index.js
```
Run behind TLS (reverse proxy). The frontend served by this server auto-connects
to the secure backend. Point the admin `website.html` backend monitor at
`/api/health`. See [docs/SECURITY.md](docs/SECURITY.md) for the full checklist.

---

## Development notes
- **Zero dependencies.** Node 22 built-ins only (`node:sqlite` is flagged
  experimental by Node but is stable for this use). No `npm install` required.
- **Sandbox payments & dev OTP codes** are active when `NODE_ENV != production`.
  In production, payments confirm only via signed provider webhooks and OTP codes
  are delivered by the configured SMS/email gateways (never returned in responses).
- The automated application pipeline stands in for the back-office review queue
  so the full customer lifecycle is walkable without the admin portal; decisions
  can be overridden from the admin via the integration endpoint.
- Data lives in `data/` (gitignored): `gfs.sqlite`, encrypted `documents/`,
  `backups/`, and the `.server-key`.

## License
Proprietary — Golden Financial Services Limited. All rights reserved.
