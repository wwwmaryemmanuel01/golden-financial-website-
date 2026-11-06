# API Reference

Base URL: the server origin (e.g. `http://localhost:3000`). All endpoints return
JSON unless noted (PDF). Authenticated endpoints use the session cookie or
`Authorization: Bearer <token>`. Errors: `{ "error": "message", "code": "…" }`.

## Public — content & tools
| Method | Path | Description |
|---|---|---|
| GET | `/api/health` | Service + database health, record counts |
| GET | `/api/config` | Company, products, rates, payment methods, branches, theme, announcements (read-only) |
| GET | `/api/products` · `/api/branches` · `/api/faqs` · `/api/testimonials` · `/api/announcements` · `/api/agreement-clauses` | Public content; products are exactly the five active categories |
| GET | `/api/blog/posts` | Published article summaries; optional `search` and `category`; source label |
| GET | `/api/blog/posts/:slug` | Article detail, previous/next and related summaries |
| GET/POST | `/api/calculator` | Amortisation: `{productId, amount, term, freq}`. Explicit unknown/retired product IDs return 400; omitting productId defaults to the first active category. |
| POST | `/api/eligibility` | Affordability assessment: `{productId, amount, term, income, expenses, guarantors?, collateralValue?}` |
| GET | `/api/payment-methods` | Rails + instructions |
| GET | `/api/integration/status` | Linked-system info |

## Authentication
| Method | Path | Description |
|---|---|---|
| POST | `/api/auth/register` | `{firstName, lastName, email, phone, password, acceptTerms, dob?, gender?, district?}` → customerNo + OTP |
| POST | `/api/auth/login` | `{email, password}` → token + user, or `{twofaRequired}` |
| POST | `/api/auth/verify-otp` | `{purpose, target, code}` (verify_phone / verify_email / login_2fa / reset) |
| POST | `/api/auth/resend-otp` | `{purpose, target}` |
| POST | `/api/auth/forgot-password` · `/api/auth/reset-password` | OTP reset flow |
| POST | `/api/auth/change-password` | `{currentPassword, newPassword}` |
| POST | `/api/auth/logout` | Revoke session |
| GET | `/api/me` | Current user |

## Profile & security
`PUT /api/profile` · `PUT /api/prefs` · `PUT /api/security/2fa` ·
`GET /api/security/sessions` · `DELETE /api/security/sessions/:id` ·
`GET /api/security/activity`

## Loans & applications
| Method | Path | Description |
|---|---|---|
| GET | `/api/dashboard` | Stats, active loans, applications, recent transactions, KYC, announcements |
| GET | `/api/loans` · `/api/loans/:id` | Loans with schedule, settlement quote, transactions |
| GET/POST | `/api/applications` | List / submit (runs automated pipeline) |
| GET | `/api/applications/:id` | Detail + timeline + offer |
| POST | `/api/applications/:id/reassess` · `/cancel` · `/accept-agreement` | Re-assess, cancel, sign & disburse |
| GET/POST | `/api/requests` | Settlement / top-up / renewal / restructure / refinance |

## Payments
| Method | Path | Description |
|---|---|---|
| POST | `/api/payments/initiate` | `{loanId, amount, method, account, settle?, idempotencyKey?}` |
| POST | `/api/payments/:id/confirm` | Sandbox confirm `{outcome}` (disabled in production) |
| POST | `/api/webhooks/:provider` | Signed provider callback (HMAC) |
| GET | `/api/transactions` | History (`?type=&status=&loanId=`) |
| GET | `/api/receipts` · `/api/receipts/:id` | Receipts |

## Documents, guarantors, collateral
`GET/POST /api/documents` · `GET /api/documents/:id/file` · `DELETE /api/documents/:id` ·
`GET/POST /api/guarantors` · `GET/POST /api/collateral`

Upload body: `{kind, filename, mime, data(base64), applicationId?}`. Kinds include
national_id, passport, driving_licence, payslip, bank_statement, business_statement,
proof_of_address, admission_letter, medical_report, quotation, land_document,
house_document, vehicle_document, livestock_document, guarantor_id, avatar, other.

## Notifications & support
`GET /api/notifications?channel=inapp|sms|email` · `POST /api/notifications/:id/read` ·
`POST /api/notifications/read-all` · `GET/POST /api/chat` · `GET/POST /api/tickets` ·
`GET /api/tickets/:id` · `POST /api/tickets/:id/reply` · `POST /api/tickets/:id/close`

## PDF financial records (download)
`GET /api/receipts/:id/pdf` · `/api/loans/:id/statement.pdf` ·
`/api/loans/:id/settlement.pdf` · `/api/loans/:id/disbursement.pdf` ·
`/api/transactions/statement.pdf` · `/api/applications/:id/agreement.pdf`

## Records & settings
`GET /api/statements` · `GET /api/export/my-data` · `GET /api/settings/system` (read-only) ·
`POST/PUT /api/settings*` → **403 for customers**

## Back-office integration (requires `X-GFS-Integration-Key`)
`GET /api/integration/export?since=` · `POST /api/integration/settings` ·
`POST /api/integration/decision`
