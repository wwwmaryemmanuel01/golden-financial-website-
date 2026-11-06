# Linking to the Golden Loan Services system

This website + customer portal is the **customer-facing half** of the Golden
Financial Services platform. The back-office half lives in
[`wwwmaryemmanuel01/golden-loan-services`](https://github.com/wwwmaryemmanuel01/golden-loan-services).
The public admin repository is a static prototype; it is **not** a live shared
database with this customer site.

```
┌────────────────────────────┐        ┌──────────────────────────────┐
│  golden-financial-website- │        │   golden-loan-services        │
│  Public website + journal  │        │   admin / back-office         │
│  Customer portal           │◄──────►│   deployed adapter required   │
│  Secure Node backend       │ signed │   settings / decisions / feed │
│  Central SQLite database   │  API   │                               │
└────────────────────────────┘        └──────────────────────────────┘
```

## 1. Published settings and editorial content

System settings — company details, the five loan categories, rates, fees,
payment methods, branches, dark header theme and `blog_posts` — are owned by the
admin/back-office and pushed to this backend through the signed connector.
Customers can read published settings (`GET /api/config`,
`GET /api/settings/system`) but can never write them. Customer attempts to
`POST/PUT /api/settings*` return **403 `SETTINGS_READ_ONLY`**.

The public catalogue contains exactly:

1. Personal (`PL`)
2. Business (`BL`)
3. Salary Advance (`SA`)
4. Agriculture (`AL`)
5. Emergency (`EL`)

Retired definitions (`ED`, `ML`, `AF`, `GL`, `MG`) are kept only for historical
record rendering. They are not public offerings and cannot receive new
applications, approvals or disbursements. The migration normalises persisted
catalogues without deleting customer, application, loan or transaction records.

```bash
curl -X POST https://your-backend.example/api/integration/settings \
  -H "Content-Type: application/json" \
  -H "X-GFS-Integration-Key: $GFS_INTEGRATION_KEY" \
  -d '{"products":[...five categories...], "theme":{"header":"#0F1115"}, "blog_posts":[...]}'
```

`blog_posts` is validated as plain structured text: unique slugs, known
categories, valid dates, allowed illustration keys and bounded sections. Public
read endpoints are:

- `GET /api/blog/posts` — summaries, category/search filtering, source label
- `GET /api/blog/posts/:slug` — article, previous/next and related summaries

The backend labels these responses `source: "backend"`. The GitHub Pages
device-local sandbox labels its bundled library `source: "device"` and does not
claim live publication. Bookmarks, checklist progress and motion preferences are
device-local only.

## 2. Server-to-server sync

Set `GFS_INTEGRATION_KEY` on the backend to enable the sync endpoints. The admin
system or a deployed connector authenticates with `X-GFS-Integration-Key`.

| Endpoint | Direction | Purpose |
|---|---|---|
| `GET /api/integration/export?since=ISO` | admin ← website | Pull customers, applications, loans, transactions and receipts |
| `POST /api/integration/settings` | admin → website | Push validated system settings and editorial content |
| `POST /api/integration/decision` | admin → website | Record an authorised decision: `{applicationRef, decision, reason}` |
| `GET /api/health` | admin ← website | Connection health probe |
| `GET /api/integration/status` | public | Truthful connector configuration/last-success state |

```bash
curl -H "X-GFS-Integration-Key: $GFS_INTEGRATION_KEY" \
  "https://your-backend.example/api/integration/export?since=2026-11-01T00:00:00"
```

Until a deployed adapter is configured and successful, `/api/integration/status`
reports `connectorConfigured`/`connected` truthfully (normally `false` in the
sandbox). A repository link, shared GitHub Pages origin or browser localStorage
is not synchronisation.

## 3. GitHub Pages boundary

GitHub Pages hosts the frontend sandbox only. It does not run the Node backend,
SQLite database, payment providers or signed admin connector. The static adapter
uses `gfs_sandbox_v2` for sample workflow data and never writes admin localStorage
keys. Use sample details only; no real money, messages or identity checks occur.

## Reference formats

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

## Payment rails

TNM Mpamba, Airtel Money, bank transfer, cash at branch and the PayChangu gateway
pattern. In development a sandbox adapter simulates provider prompts and
confirmation. In production, sandbox confirmation is refused and live
verification requires signed provider callbacks or authorised reconciliation:

```
POST /api/webhooks/{mpamba|airtel|bank|paychangu}
Header: X-GFS-Signature: sha256=HMAC_SHA256(rawBody, GFS_<PROVIDER>_WEBHOOK_SECRET)
Body:   {"providerRef":"…","amount":12345,"status":"success"}
```

A customer-submitted bank/cash reference is a claim awaiting verification; it does
not change the balance by itself.
