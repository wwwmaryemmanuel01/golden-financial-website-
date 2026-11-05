# Linking to the Golden Loan Services system

This website + customer portal is the **customer-facing half** of the Golden
Financial Services platform. The back-office half lives in
[`wwwmaryemmanuel01/golden-loan-services`](https://github.com/wwwmaryemmanuel01/golden-loan-services)
(the admin portal: applications, clients, payments, repayments, statements,
settings, website management). The two are linked three ways.

```
┌────────────────────────────┐        ┌──────────────────────────────┐
│  golden-financial-website- │        │   golden-loan-services        │
│  (THIS REPO)               │        │   (admin / back-office)       │
│                            │        │                               │
│  Public website            │        │  applications.html            │
│  Customer portal           │◄──────►│  clients.html                 │
│  Secure Node backend       │  sync  │  payments.html                │
│  Central SQLite database   │        │  settings.html  ◄── owns      │
│                            │        │  website.html       settings  │
└────────────────────────────┘        └──────────────────────────────┘
```

## 1. Shared configuration (back-office owns settings)

System settings — company details, loan products, rates, fees, payment methods,
branches, theme — are **owned by the admin system** and pushed to this backend.
Customers can read them (`GET /api/config`, `GET /api/settings/system`) but can
never write them. Any customer attempt to `POST/PUT /api/settings*` returns
**403 `SETTINGS_READ_ONLY`** and is written to the audit log.

The admin pushes settings with the server-to-server key:

```bash
curl -X POST https://your-backend.example/api/integration/settings \
  -H "Content-Type: application/json" \
  -H "X-GFS-Integration-Key: $GFS_INTEGRATION_KEY" \
  -d '{"products":[...], "company":{...}, "payment_methods":[...]}'
```

Defaults are seeded from `public/js/core.js` (the shared financial core), which
mirrors the admin's `PRODUCTS` table (Personal 3.0%, Business 3.5%, Agricultural
3.0%, Salary Advance 2.5%, etc.), the 40% affordability cap, the 2% late penalty,
and the `GLS-APP-nnnnnn` / `GF-nnnnnn` reference formats.

## 2. Server-to-server sync (central database feed)

Set `GFS_INTEGRATION_KEY` on the backend to enable the sync endpoints. The admin
system (or a connector) authenticates with the `X-GFS-Integration-Key` header.

| Endpoint | Direction | Purpose |
|---|---|---|
| `GET /api/integration/export?since=ISO` | admin ← website | Pull customers, applications, loans, transactions, receipts from the central database |
| `POST /api/integration/settings` | admin → website | Push system settings (the only way settings change) |
| `POST /api/integration/decision` | admin → website | Override an automated decision: `{applicationRef, decision, reason}` |
| `GET /api/health` | admin ← website | Connection health probe for the admin `website.html` monitor |
| `GET /api/integration/status` | public | Linked-system info, bridge keys, last sync, config version |

Example — pull the feed:

```bash
curl -H "X-GFS-Integration-Key: $GFS_INTEGRATION_KEY" \
  "https://your-backend.example/api/integration/export?since=2026-11-01T00:00:00"
```

Example — push a manual decision:

```bash
curl -X POST https://your-backend.example/api/integration/decision \
  -H "Content-Type: application/json" -H "X-GFS-Integration-Key: $GFS_INTEGRATION_KEY" \
  -d '{"applicationRef":"GLS-APP-000003","decision":"approved","reason":"Manual review passed"}'
```

## 3. GitHub Pages localStorage bridge (same origin)

Both repos publish to the **same origin** (`wwwmaryemmanuel01.github.io`), so
their pages share `localStorage`. The admin's customer pages use three keys
(documented in its README):

- `gls_agreement_v1` — the agreement acceptance record
- `gls_apply_draft_v1` — the in-progress application draft
- `gls_applications_v1` — the last 25 submitted applications (`GLS-APP-…`)

When this site runs on GitHub Pages (device-local mode), it **writes submitted
applications into `gls_applications_v1`** in the admin's format, so they appear
in the admin `apply.html` history on the same browser. The portal's
**Settings → Linked system** card shows the bridge status (shared origin,
agreement accepted, bridged application count).

## Reference formats (kept identical to the admin)

| Entity | Format | Example |
|---|---|---|
| Customer | `GF-nnnnnn` | `GF-000001` |
| Application | `GLS-APP-nnnnnn` | `GLS-APP-000003` |
| Loan | `LN-YYYY-nnnn` | `LN-2026-0002` |
| Transaction | `TXN-YYYYMMDD-XXXXXX` | `TXN-20261105-A1B2C3` |
| Receipt | `RCT-YYYYMMDD-XXXXXX` | `RCT-20261105-D4E5F6` |
| Disbursement | `DSB-YYYYMMDD-XXXXXX` | `DSB-20261105-G7H8J9` |
| Ticket | `TKT-nnnnnn` | `TKT-000001` |
| Request | `RQ-nnnnnn` | `RQ-000001` |

## Payment rails (mirrors the admin payments module)

TNM Mpamba, Airtel Money, FDH Bank / Standard Bank transfer, cash at branch, and
the PayChangu gateway pattern. In development a **sandbox adapter** simulates the
provider prompt and confirmation. In production, disable the sandbox confirm
endpoint (it is already refused when `NODE_ENV=production`) and point providers
at the signed webhook:

```
POST /api/webhooks/{mpamba|airtel|bank|paychangu}
Header: X-GFS-Signature: sha256=HMAC_SHA256(rawBody, GFS_<PROVIDER>_WEBHOOK_SECRET)
Body:   {"providerRef":"…","amount":12345,"status":"success"}
```

The webhook verifies the HMAC, matches the provider reference, checks the amount
(mismatches are flagged for reconciliation), then applies the payment, updates
the balance, issues a receipt and notifies the customer — exactly the same code
path as the sandbox confirm.
