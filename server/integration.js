/*Authenticated back-office connector. The public GitHub admin repository is
  currently a static prototype; this contract is not a claimed live connection. */
import crypto from 'node:crypto';
import { q, q1, run, tx, audit, getSetting, setSetting } from './db.js';
import { HttpError, readBody } from './http.js';
import { clean, verifyWebhookSignature } from './security.js';
import { INTEGRATION_KEY, SYSTEM_URL, SYSTEM_API_URL, DEMO_MODE, SMS_WEBHOOK, EMAIL_WEBHOOK, NOTIFICATION_KEY, AI_API_URL } from './config.js';
import * as catalog from './catalog.js';
import { requireAuth } from './auth.js';
import { decideApplication, createDisbursement, serializeApp } from './loans.js';
import { verifyAndApply } from './payments.js';
import { notify } from './notifications.js';
import { cents } from './finance.js';
import GFS from '../shared/core.mjs';
export async function health() { q1(`SELECT 1 x`); return { status: 'ok', service: 'golden-financial-customer-api', version: '2.0.0', currency: 'MWK', database: 'sqlite', mode: DEMO_MODE ? 'sandbox' : 'backend', time: new Date().toISOString() }; }
export async function publicConfig() {
  return { company: catalog.company(), products: catalog.products(), rules: catalog.rules(), branches: getSetting('branches', GFS.BRANCHES), paymentMethods: catalog.methods(),
    theme: getSetting('theme', {}), currency: 'MWK', readOnlyForCustomers: true, mode: DEMO_MODE ? 'sandbox' : 'backend', configVersion: getSetting('config_version', 1),
    features: { applications: true, statements: true, encryptedDocuments: true, immutableLedger: true, sandboxPayments: DEMO_MODE, automatedAssistant: true, aiConfigured: !!AI_API_URL,
      smsConfigured: !!SMS_WEBHOOK && !!NOTIFICATION_KEY, emailConfigured: !!EMAIL_WEBHOOK && !!NOTIFICATION_KEY },
    system: { name: 'Golden Loan Services', repository: 'https://github.com/wwwmaryemmanuel01/golden-loan-services', url: SYSTEM_URL, connectorConfigured: !!INTEGRATION_KEY && !!SYSTEM_API_URL },
    notice: DEMO_MODE ? 'Sandbox demonstration. Approvals, disbursements and payment confirmations are simulated; no real money moves.' : 'Live backend mode. External services operate only where explicitly configured.' };
}
export async function status() {
  const lastSuccess = getSetting('last_success', null) || q1(`SELECT value FROM integration_state WHERE key='last_success'`)?.value || null;
  return { name: 'Golden Loan Services', repository: 'https://github.com/wwwmaryemmanuel01/golden-loan-services', url: SYSTEM_URL,
    connectorConfigured: !!INTEGRATION_KEY && !!SYSTEM_API_URL, connected: !!lastSuccess, lastSuccess,
    pendingEvents: q1(`SELECT COUNT(*) n FROM integration_outbox WHERE status IN ('pending','retry')`).n,
    failedEvents: q1(`SELECT COUNT(*) n FROM integration_outbox WHERE status='failed'`).n,
    note: 'The public admin repository currently uses sample/browser-local data. A deployed authenticated adapter is required for central synchronisation. A link alone does not connect databases.' };
}
function requireSystem(ctx) {
  const timestamp = String(ctx.req.headers['x-gfs-timestamp'] || ''), signature = String(ctx.req.headers['x-gfs-signature'] || '');
  if (!INTEGRATION_KEY || INTEGRATION_KEY.length < 32 || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300 || !verifyWebhookSignature(`${timestamp}.${ctx.rawBody.toString('utf8')}`, signature, INTEGRATION_KEY)) throw new HttpError(401, 'Invalid or expired system signature.', 'SYSTEM_AUTH_REQUIRED');
}
export async function pushSettings(ctx) {
  requireSystem(ctx); const patch = catalog.validateSettingsPatch(ctx.body);
  tx(() => { for (const [k, v] of Object.entries(patch)) setSetting(k, v); setSetting('config_version', getSetting('config_version', 1) + 1); audit('system', null, 'settings.published', 'settings', 'system', null, { keys: Object.keys(patch), version: getSetting('config_version') }, ctx.ip, ctx.ua); });
  return { ok: true, configVersion: getSetting('config_version') };
}
const requireId = (value, label) => { const n = Number(value); if (!Number.isSafeInteger(n) || n <= 0) throw new HttpError(400, `${label} must be a positive integer.`); return n; };
function processEvent(p) {
  const customerId = requireId(p.customerId, 'customerId'), u = q1(`SELECT * FROM customers WHERE id=?`, customerId);
  if (!u) throw new HttpError(404, 'Customer not found.');
  switch (p.type) {
    case 'customer.kyc': {
      if (typeof p.verified !== 'boolean' || !clean(p.reason, 1000)) throw new HttpError(400, 'KYC decision and reason are required.');
      const status = p.verified ? 'verified' : 'rejected';
      run(`UPDATE customers SET kyc_status=?,updated_at=datetime('now') WHERE id=?`, status, customerId);
      notify(customerId, { category: 'kyc', title: `Identity review ${status}`, body: clean(p.reason, 1000), channels: ['inapp'] });
      return { customerId, status };
    }
    case 'document.review': {
      const id = requireId(p.documentId, 'documentId'), d = q1(`SELECT * FROM documents WHERE id=? AND customer_id=?`, id, customerId);
      if (!d || typeof p.verified !== 'boolean') throw new HttpError(400, 'Invalid document review.');
      run(`UPDATE documents SET status=?,notes=?,verified_at=CASE WHEN ? THEN datetime('now') ELSE NULL END WHERE id=?`, p.verified ? 'verified' : 'rejected', clean(p.reason, 1000), p.verified ? 1 : 0, id);
      notify(customerId, { category: 'document', title: `Document ${p.verified ? 'verified' : 'needs attention'}`, body: `${d.filename}: ${clean(p.reason, 1000)}`, channels: ['inapp'] });
      return { documentId: id };
    }
    case 'guarantor.review': {
      const id = requireId(p.guarantorId, 'guarantorId'); if (!q1(`SELECT id FROM guarantors WHERE id=? AND customer_id=?`, id, customerId)) throw new HttpError(404, 'Guarantor not found.');
      if (typeof p.consentVerified !== 'boolean' || typeof p.identityVerified !== 'boolean') throw new HttpError(400, 'Consent and identity decisions are required.');
      const verified = p.consentVerified && p.identityVerified;
      run(`UPDATE guarantors SET status=?,consent=?,consent_evidence=? WHERE id=?`, verified ? 'verified' : 'rejected', p.consentVerified ? 1 : 0, clean(p.evidenceReference, 200), id);
      return { guarantorId: id, verified };
    }
    case 'collateral.valuation': {
      const id = requireId(p.collateralId, 'collateralId'); if (!q1(`SELECT id FROM collateral WHERE id=? AND customer_id=?`, id, customerId)) throw new HttpError(404, 'Collateral not found.');
      const value = Number(p.value); if (!Number.isFinite(value) || value <= 0 || !clean(p.valuedBy, 120)) throw new HttpError(400, 'Professional valuation and valuer are required.');
      run(`UPDATE collateral SET valued_amount=?,valued_by=?,valuation_date=date('now'),status='verified' WHERE id=?`, value, clean(p.valuedBy, 120), id); return { collateralId: id, value };
    }
    case 'collateral.release': {
      const id = requireId(p.collateralId, 'collateralId'), c = q1(`SELECT c.*,l.status loan_status FROM collateral c LEFT JOIN loans l ON l.id=c.loan_id WHERE c.id=? AND c.customer_id=?`, id, customerId);
      if (!c || (c.loan_id && !['closed', 'settled'].includes(c.loan_status))) throw new HttpError(409, 'Security can be released only after the secured loan is settled.');
      run(`UPDATE collateral SET status='released',released_at=datetime('now') WHERE id=?`, id); return { collateralId: id };
    }
    case 'application.decision': {
      const id = requireId(p.applicationId, 'applicationId'); if (!q1(`SELECT id FROM applications WHERE id=? AND customer_id=?`, id, customerId)) throw new HttpError(404, 'Application not found.');
      if (typeof p.approved !== 'boolean') throw new HttpError(400, 'approved must be boolean.');
      const a = decideApplication(id, { approved: p.approved, reason: p.reason, source: 'system' }); return { applicationId: id, status: a.status };
    }
    case 'loan.disbursement': {
      const id = requireId(p.applicationId, 'applicationId'), a = q1(`SELECT * FROM applications WHERE id=? AND customer_id=?`, id, customerId);
      if (!a) throw new HttpError(404, 'Application not found.');
      const offer = JSON.parse(a.offer || '{}'); if (cents(p.netAmount) !== cents(offer.netDisbursement) || !clean(p.providerRef, 150)) throw new HttpError(409, 'Disbursement amount/reference does not match the signed offer.');
      const loan = createDisbursement(id, { source: 'system', providerRef: clean(p.providerRef, 150) }); return { loanId: loan.id, reference: loan.ref };
    }
    case 'payment.reconciled': {
      const id = requireId(p.transactionId, 'transactionId'), t = q1(`SELECT * FROM transactions WHERE id=? AND customer_id=?`, id, customerId);
      if (!t || cents(p.amount) !== cents(t.amount) || !clean(p.providerRef, 150)) throw new HttpError(409, 'Reconciliation does not match the payment intent.');
      const r = verifyAndApply(id, { providerRef: clean(p.providerRef, 150), source: 'back-office-reconciliation' }); return { transactionId: id, receipt: r.receipt.ref };
    }
    case 'request.decision': {
      const id = requireId(p.requestId, 'requestId'); if (!q1(`SELECT id FROM requests WHERE id=? AND customer_id=?`, id, customerId)) throw new HttpError(404, 'Request not found.');
      if (!['approved', 'rejected', 'completed'].includes(p.status) || !clean(p.response, 2000)) throw new HttpError(400, 'Valid request decision and response are required.');
      run(`UPDATE requests SET status=?,response=?,updated_at=datetime('now') WHERE id=?`, p.status, clean(p.response, 2000), id);
      notify(customerId, { category: 'request', title: 'Request updated', body: clean(p.response, 2000), channels: ['inapp'] }); return { requestId: id };
    }
    case 'support.reply': {
      const id = requireId(p.ticketId, 'ticketId'); if (!q1(`SELECT id FROM tickets WHERE id=? AND customer_id=?`, id, customerId)) throw new HttpError(404, 'Ticket not found.');
      const message = clean(p.message, 5000); if (!message) throw new HttpError(400, 'Reply message is required.');
      run(`INSERT INTO ticket_messages(ticket_id,sender,sender_name,body,source) VALUES(?,?,?,?,?)`, id,  'agent', clean(p.agentName, 80) || 'Credit officer', message, 'human');
      run(`UPDATE tickets SET status='answered',updated_at=datetime('now') WHERE id=?`, id);
      notify(customerId, { category: 'support', title: 'Support replied', body: message, channels: ['inapp'], meta: { ticketId: id } }); return { ticketId: id };
    }
    default: throw new HttpError(400, `Unsupported system event: ${clean(p.type, 80)}`);
  }
}
export async function ingest(ctx) {
  requireSystem(ctx); const p = ctx.body, eventId = clean(p.eventId, 100);
  if (!eventId || typeof p.type !== 'string') throw new HttpError(400, 'eventId and type are required.');
  const hash = crypto.createHash('sha256').update(ctx.rawBody).digest('hex'), key = `system:${eventId}`;
  const prior = q1(`SELECT * FROM integration_events WHERE id=?`, key);
  if (prior) { if (prior.payload_hash !== hash) throw new HttpError(409, 'Event ID reused with different content.'); return { ok: true, duplicate: true, result: JSON.parse(prior.result) }; }
  return tx(() => { const result = processEvent(p); run(`INSERT INTO integration_events(id,payload_hash,event_type,result) VALUES(?,?,?,?)`, key, hash, p.type, JSON.stringify(result)); setSetting('last_success', new Date().toISOString()); audit('system', null, `integration.${p.type}`, 'integration', eventId, null, result, ctx.ip, ctx.ua); return { ok: true, result }; });
}
export async function exportCustomers(ctx) { requireSystem(ctx); return { exportedAt: new Date().toISOString(), customers: q(`SELECT id,customer_no,first_name,last_name,email,phone,kyc_status,status,created_at FROM customers ORDER BY id`).map(c => ({ id: c.id, customerNo: c.customer_no, firstName: c.first_name, lastName: c.last_name, email: c.email, phone: c.phone, kycStatus: c.kyc_status, status: c.status, createdAt: c.created_at })) }; }
export async function exportApplications(ctx) { requireSystem(ctx); return { applications: q(`SELECT * FROM applications ORDER BY id`).map(serializeApp) }; }
export async function customerSettings(ctx) { const u = requireAuth(ctx); const s = await status(); return { readOnly: true, ownedBy: 'Golden Loan Services back-office system', company: catalog.company(), products: catalog.products(), paymentMethods: catalog.methods(), branches: getSetting('branches', GFS.BRANCHES), rules: catalog.rules(), theme: getSetting('theme', {}), currency: 'MWK', connection: s, note: 'Customers can read published settings but cannot change them. The public admin prototype is not a live shared database.' }; }
