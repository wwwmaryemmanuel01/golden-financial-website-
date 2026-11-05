/* ============================================================
   LINK TO THE GOLDEN LOAN SERVICES ADMIN SYSTEM
   (github.com/wwwmaryemmanuel01/golden-loan-services)

   Three connection paths, one contract:
   1. Shared configuration  — the back-office owns system settings
      (products, rates, fees, company details). Customers can READ
      them here but can never write them.
   2. Server-to-server sync — authenticated with an integration key:
      the admin system pulls applications/payments and pushes
      decisions and settings back.
   3. GitHub Pages bridge   — on the shared github.io origin the
      website and admin pages share localStorage keys
      (gls_agreement_v1, gls_apply_draft_v1, gls_applications_v1).
   ============================================================ */
import { q, q1, run, getSetting, setSetting, audit, json } from './db.js';
import { HttpError } from './http.js';
import { clean } from './security.js';
import { INTEGRATION_KEY, PUBLIC_BASE_URL } from './config.js';
import GFS from '../shared/core.mjs';

const ADMIN = GFS.COMPANY.adminSystem;

export function linkedSystemInfo() {
  return {
    name: 'Golden Loan Services — Admin System',
    repo: GFS.COMPANY.adminRepo,
    url: ADMIN,
    modules: ['applications.html', 'clients.html', 'payments.html', 'repayments.html', 'statements.html', 'settings.html', 'website.html'],
    bridgeKeys: ['gls_agreement_v1', 'gls_apply_draft_v1', 'gls_applications_v1'],
    syncEndpoint: '/api/integration/export',
    settingsEndpoint: '/api/integration/settings',
    decisionEndpoint: '/api/integration/decision',
    auth: 'X-GFS-Integration-Key header (server-to-server secret)',
    lastSync: getSetting('integration_last_sync', null),
    configVersion: getSetting('config_version', 1)
  };
}

/* Public: system status + read-only configuration for the website */
export async function status(ctx) {
  return {
    platform: 'Golden Financial Services',
    currency: GFS.CURRENCY,
    backend: 'connected',
    mode: process.env.NODE_ENV || 'development',
    linkedSystem: linkedSystemInfo(),
    rules: GFS.RULES,
    time: new Date().toISOString()
  };
}
export async function publicConfig(ctx) {
  return {
    currency: GFS.CURRENCY,
    company: getSetting('company', GFS.COMPANY),
    products: getSetting('products', GFS.PRODUCTS),
    paymentMethods: getSetting('payment_methods', GFS.PAYMENT_METHODS),
    branches: getSetting('branches', GFS.BRANCHES),
    rules: GFS.RULES,
    theme: getSetting('theme', { gold: '#C9A227', emerald: '#0E9F6E', emeraldDeep: '#064E3B', ink: '#0F1115' }),
    announcements: q(`SELECT id, title, body, category, pinned, published_at FROM announcements ORDER BY pinned DESC, id DESC LIMIT 10`),
    linkedSystem: { name: 'Golden Loan Services', url: ADMIN },
    readOnlyForCustomers: true
  };
}

/* ---------------- server-to-server guard ---------------- */
function requireIntegrationKey(ctx) {
  const key = ctx.req.headers['x-gfs-integration-key'] || '';
  if (!INTEGRATION_KEY) throw new HttpError(503, 'Integration key not configured on this server. Set GFS_INTEGRATION_KEY to enable back-office sync.');
  if (key !== INTEGRATION_KEY) {
    audit('system', null, 'integration.unauthorized', 'integration', null, null, { ip: ctx.ip }, ctx.ip, null);
    throw new HttpError(401, 'Invalid integration key.');
  }
}

/* Admin pulls customer-facing records (the central database feed). */
export async function exportFeed(ctx) {
  requireIntegrationKey(ctx);
  const since = clean(ctx.url.searchParams.get('since') || '', 30);
  const where = since ? `WHERE created_at >= ?` : '';
  const p = since ? [since] : [];
  const customers = q(`SELECT id, customer_no, first_name, last_name, email, phone, district, kyc_status, monthly_income, status, created_at FROM customers ${where} ORDER BY id`, ...p)
    .map(c => ({ ...c, national_id: '[encrypted at rest — request via secure channel]' }));
  const applications = q(`SELECT * FROM applications ${where} ORDER BY id`, ...p);
  const loans = q(`SELECT * FROM loans ${where} ORDER BY id`, ...p);
  const transactions = q(`SELECT * FROM transactions ${where} ORDER BY id`, ...p);
  const receipts = q(`SELECT * FROM receipts ${where} ORDER BY id`, ...p);
  setSetting('integration_last_sync', new Date().toISOString());
  audit('system', null, 'integration.export', 'integration', null, null, { since, counts: { customers: customers.length, applications: applications.length, loans: loans.length, transactions: transactions.length } }, ctx.ip, null);
  return { source: 'golden-financial-website', generatedAt: new Date().toISOString(), since: since || null, customers, applications, loans, transactions, receipts };
}

/* Admin pushes system settings — the ONLY way settings change.
   Customers have no route to this handler. */
export async function pushSettings(ctx) {
  requireIntegrationKey(ctx);
  const b = ctx.body || {};
  const allowed = ['company', 'products', 'payment_methods', 'branches', 'theme'];
  const changed = [];
  for (const k of allowed) {
    if (b[k] !== undefined) {
      const before = getSetting(k, null);
      setSetting(k, b[k]);
      changed.push(k);
      audit('system', null, 'integration.settings_updated', 'settings', k, before, b[k], ctx.ip, null);
    }
  }
  if (changed.length) setSetting('config_version', (getSetting('config_version', 1) || 1) + 1);
  return { ok: true, changed, configVersion: getSetting('config_version', 1), note: 'Settings are owned by the back-office system. Customers have read-only access.' };
}

/* Admin pushes a manual decision on an application (overrides the automated one). */
export async function pushDecision(ctx) {
  requireIntegrationKey(ctx);
  const b = ctx.body || {};
  const app = q1(`SELECT * FROM applications WHERE ref = ?`, clean(b.applicationRef, 30));
  if (!app) throw new HttpError(404, 'Application not found.');
  const decision = ['approved', 'rejected', 'pending_documents'].includes(b.decision) ? b.decision : null;
  if (!decision) throw new HttpError(400, 'decision must be approved, rejected or pending_documents.');
  run(`UPDATE applications SET status = ?, stage = 'decision', decision_reason = ?, updated_at = datetime('now') WHERE id = ?`,
    decision, clean(b.reason, 1000) || 'Decision received from the back-office system.', app.id);
  const tl = json(app.timeline, []);
  tl.push({ stage: 'decision', note: `Back-office decision: ${decision}. ${b.reason || ''}`, at: new Date().toISOString() });
  run(`UPDATE applications SET timeline = ? WHERE id = ?`, JSON.stringify(tl), app.id);
  audit('system', null, 'integration.decision', 'application', app.id, { status: app.status }, { status: decision, reason: b.reason }, ctx.ip, null);
  return { ok: true, applicationRef: app.ref, status: decision };
}

/* Health probe used by the admin website.html connection monitor. */
export async function health(ctx) {
  const counts = {
    customers: q1(`SELECT COUNT(*) n FROM customers`).n,
    applications: q1(`SELECT COUNT(*) n FROM applications`).n,
    loans: q1(`SELECT COUNT(*) n FROM loans`).n,
    transactions: q1(`SELECT COUNT(*) n FROM transactions`).n
  };
  return { status: 'ok', service: 'gfs-customer-backend', database: 'connected', counts, uptimeSeconds: Math.round(process.uptime()), time: new Date().toISOString() };
}
