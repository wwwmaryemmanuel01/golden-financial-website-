/* Payment intents, reconciliation and receipts. A customer confirmation is
   never proof of payment. Only the explicitly enabled sandbox or a signed
   provider callback can post money to the immutable financial ledger. */
import crypto from 'node:crypto';
import { q, q1, run, tx, audit, activity, json } from './db.js';
import { HttpError, readBody } from './http.js';
import { clean, verifyWebhookSignature } from './security.js';
import { notify } from './notifications.js';
import { requireAuth } from './auth.js';
import { applyRepayment, serializeLoan } from './loans.js';
import { settlementQuote, accrueInterest, cents, money } from './finance.js';
import * as catalog from './catalog.js';
import { DEMO_MODE } from './config.js';
import GFS from '../shared/core.mjs';
const providerConfig = id => {
  const prefix = id === 'mpamba' ? 'MPAMBA' : id === 'airtel' ? 'AIRTEL' : '';
  return { url: process.env[`GFS_${prefix}_COLLECTION_URL`] || '', key: process.env[`GFS_${prefix}_API_KEY`] || '', secret: process.env[`GFS_${prefix}_WEBHOOK_SECRET`] || '' };
};
export const serializeTxn = t => t ? { id: t.id, ref: t.ref, loanId: t.loan_id, type: t.type, method: t.method, provider: t.provider, providerRef: t.provider_ref, amount: t.amount, status: t.status,
  allocation: json(t.allocation), receiptId: t.receipt_id, failureReason: t.failure_reason, meta: json(t.meta), createdAt: t.created_at, verifiedAt: t.verified_at, environment: t.environment } : null;
export async function paymentMethods() {
  return { methods: catalog.methods().map(m => ({ ...m, available: DEMO_MODE || m.type !== 'mobile' || !!(providerConfig(m.id).url && providerConfig(m.id).key && providerConfig(m.id).secret), mode: DEMO_MODE ? 'sandbox' : m.type === 'mobile' ? providerConfig(m.id).url ? 'gateway' : 'not_configured' : 'reconciliation' })), currency: 'MWK', sandbox: DEMO_MODE };
}
export async function initiatePayment(ctx) {
  const u = requireAuth(ctx), b = ctx.body;
  const loan = q1(`SELECT * FROM loans WHERE id=? AND customer_id=?`, Number(b.loanId), u.id);
  if (!loan) throw new HttpError(404, 'Loan not found.');
  if (loan.status !== 'active') throw new HttpError(409, 'This loan is not active.');
  const method = catalog.method(b.method);
  if (!method) throw new HttpError(400, 'Choose an enabled payment method.');
  const key = clean(b.idempotencyKey || ctx.req.headers['idempotency-key'], 100);
  if (!/^[a-zA-Z0-9_-]{16,100}$/.test(key)) throw new HttpError(400, 'A unique payment request key (16–100 characters) is required.');
  const settle = !!b.settle;
  accrueInterest(loan.id);
  const current = q1(`SELECT * FROM loans WHERE id=?`, loan.id);
  const quote = settlementQuote(current);
  const amount = settle ? quote.total : money(b.amount);
  if (!Number.isFinite(amount) || cents(amount) <= 0) throw new HttpError(400, 'Enter an amount greater than zero.');
  if (settle && b.quoteDate && b.quoteDate !== quote.asOf) throw new HttpError(409, 'The settlement quote has expired. Request today’s quote.');
  const fingerprint = GFS.refs.transaction ? JSON.stringify({ loanId: loan.id, amount: cents(amount), method: method.id, settle, quoteDate: settle ? quote.asOf : null }) : '';
  const existing = q1(`SELECT * FROM transactions WHERE idempotency_key=?`, key);
  if (existing) {
    if (existing.customer_id !== u.id || existing.request_hash !== fingerprint) throw new HttpError(409, 'This payment request key was already used for different details.');
    return { payment: serializeTxn(existing), duplicate: true, instructions: json(existing.meta).instructions, sandbox: existing.environment === 'sandbox' };
  }
  if (!settle && cents(amount) > cents(quote.total)) throw new HttpError(400, 'Amount exceeds the current payoff. Choose early settlement to avoid unaccrued interest.');
  const account = clean(b.account || u.phone, 80);
  if (method.type === 'mobile' && !GFS.isPhoneMW(account)) throw new HttpError(400, 'Enter a valid Malawi mobile-money number.');
  const config = providerConfig(method.id);
  const liveMobile = method.type === 'mobile' && !DEMO_MODE;
  if (liveMobile && (!config.url || !config.key || !config.secret)) throw new HttpError(503, `${method.name} is awaiting merchant-provider setup. Choose bank transfer or a branch, or contact support.`, 'PROVIDER_NOT_CONFIGURED');
  const ref = GFS.refs.transaction(), providerRef = `GFS-${crypto.randomUUID()}`;
  const instructions = DEMO_MODE ? `Sandbox only: no money will move. Simulate a successful or failed ${method.name} payment to test the receipt and balance workflow.` : method.type === 'mobile' ? `Approve the ${method.name} request on your phone. Your balance updates only after the provider confirms it.` : method.type === 'bank' ? `${method.instructions || 'Obtain verified account details from your branch.'} Quote ${ref}. A reconciliation officer must verify the transfer.` : `Visit a branch and quote ${ref}. Only a verified cashier record updates your balance.`;
  const id = Number(run(`INSERT INTO transactions(ref,customer_id,loan_id,type,method,provider,provider_ref,amount,status,idempotency_key,request_hash,meta,environment) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ref, u.id, loan.id, settle ? 'settlement' : 'repayment', method.id, method.name, providerRef, amount, liveMobile ? 'submitting' : method.type === 'mobile' ? 'pending' : 'awaiting_verification', key, fingerprint, JSON.stringify({ account, settle, quote: settle ? quote : null, instructions, sandbox: DEMO_MODE }), DEMO_MODE ? 'sandbox' : 'production').lastInsertRowid);
  audit('customer', u.id, 'payment.initiated', 'transaction', id, null, { ref, amount, method: method.id }, ctx.ip, ctx.ua);
  activity(u.id, 'Payment request created', `${ref} · ${GFS.mk(amount)}`, ctx.ip, ctx.ua);
  if (liveMobile) {
    try {
      const url = new URL(config.url); if (url.protocol !== 'https:') throw new Error('HTTPS required');
      const response = await fetch(url, { method: 'POST', redirect: 'error', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.key}`, 'Idempotency-Key': key }, body: JSON.stringify({ reference: providerRef, amount, currency: 'MWK', phone: GFS.normPhone(account), description: `Loan ${loan.ref}` }), signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error(`Gateway HTTP ${response.status}`);
      const result = await response.json();
      if (result.status !== 'pending' || typeof result.providerRef !== 'string') throw new Error('Invalid gateway acknowledgement');
      run(`UPDATE transactions SET status='pending',provider_ref=?,meta=json_set(meta,'$.gatewayAcknowledged',1) WHERE id=?`, result.providerRef.slice(0, 150), id);
    } catch (e) {
      // A timeout may still have reached the provider: reconciliation is required.
      run(`UPDATE transactions SET status='reconciliation',failure_reason=? WHERE id=?`, 'Gateway acknowledgement uncertain. Do not pay again; contact support with your reference.', id);
    }
  }
  const t = q1(`SELECT * FROM transactions WHERE id=?`, id);
  return { payment: serializeTxn(t), instructions, providerRef: t.provider_ref, sandbox: DEMO_MODE, settlement: settle ? quote : undefined };
}
export function verifyAndApply(txnId, { providerRef, source }) {
  return tx(() => {
    const t = q1(`SELECT * FROM transactions WHERE id=?`, txnId);
    if (!t) throw new HttpError(404, 'Transaction not found.');
    if (t.status === 'verified') return { transaction: t, receipt: q1(`SELECT * FROM receipts WHERE id=?`, t.receipt_id), loan: q1(`SELECT * FROM loans WHERE id=?`, t.loan_id), alreadyVerified: true };
    if (!['pending', 'awaiting_verification', 'reconciliation'].includes(t.status)) throw new HttpError(409, `Transaction is ${t.status} and cannot be posted.`);
    const meta = json(t.meta), result = applyRepayment(t.loan_id, t.amount, t.id, { settle: !!meta.settle });
    const receiptRef = GFS.refs.receipt();
    const receiptId = Number(run(`INSERT INTO receipts(ref,transaction_id,customer_id,loan_id,amount,method) VALUES(?,?,?,?,?,?)`, receiptRef, t.id, t.customer_id, t.loan_id, t.amount, t.method).lastInsertRowid);
    run(`UPDATE transactions SET status='verified',verified_at=datetime('now'),receipt_id=?,provider_ref=?,allocation=?,meta=json_set(meta,'$.verifiedVia',?) WHERE id=?`, receiptId, providerRef, JSON.stringify(result.allocation), source, t.id);
    notify(t.customer_id, { category: 'payment', title: t.type === 'settlement' ? 'Settlement confirmed' : 'Payment confirmed', body: `${t.environment === 'sandbox' ? 'Sandbox only — no real money moved. ' : ''}${GFS.mk(t.amount)} recorded for ${result.loan.ref}. Receipt ${receiptRef}. Outstanding ${GFS.mk(result.loan.outstanding_principal + result.loan.accrued_interest + result.loan.fees_outstanding + result.loan.penalties)}.`, meta: { receiptId, transactionId: t.id } });
    audit(source === 'sandbox' ? 'sandbox' : 'system', null, 'payment.verified', 'transaction', t.id, null, { ref: t.ref, amount: t.amount, allocation: result.allocation, source }, null, null);
    activity(t.customer_id, 'Payment verified', `${t.ref} · ${receiptRef}`, null, null);
    return { transaction: q1(`SELECT * FROM transactions WHERE id=?`, t.id), receipt: q1(`SELECT * FROM receipts WHERE id=?`, receiptId), loan: result.loan, allocation: result.allocation };
  });
}
export async function confirmPayment(ctx) {
  const u = requireAuth(ctx);
  if (!DEMO_MODE) throw new HttpError(403, 'Only a signed provider callback or authorised reconciliation can verify a live payment.', 'SANDBOX_DISABLED');
  const t = q1(`SELECT * FROM transactions WHERE id=? AND customer_id=?`, Number(ctx.params.id), u.id);
  if (!t) throw new HttpError(404, 'Transaction not found.');
  if (ctx.body.simulate !== true) throw new HttpError(400, 'Explicitly confirm this is a sandbox simulation.');
  if (ctx.body.outcome === 'failure') {
    if (t.status === 'verified') throw new HttpError(409, 'A verified payment cannot be reversed here.');
    if (t.status === 'failed') return { payment: serializeTxn(t), failed: true, sandbox: true };
    run(`UPDATE transactions SET status='failed',failure_reason=? WHERE id=?`, clean(ctx.body.reason, 200) || 'Sandbox payment cancelled.', t.id);
    audit('sandbox', u.id, 'payment.simulated_failure', 'transaction', t.id, null, null, ctx.ip, ctx.ua);
    return { payment: serializeTxn(q1(`SELECT * FROM transactions WHERE id=?`, t.id)), failed: true, sandbox: true };
  }
  const r = verifyAndApply(t.id, { providerRef: `SANDBOX-${t.ref}`, source: 'sandbox' });
  return { payment: serializeTxn(r.transaction), receipt: { id: r.receipt.id, ref: r.receipt.ref, amount: r.receipt.amount }, loan: serializeLoan(r.loan), allocation: r.allocation, sandbox: true };
}
export async function submitPaymentProof(ctx) {
  const u = requireAuth(ctx), t = q1(`SELECT * FROM transactions WHERE id=? AND customer_id=?`, Number(ctx.params.id), u.id);
  if (!t) throw new HttpError(404, 'Payment not found.');
  if (!['awaiting_verification', 'reconciliation'].includes(t.status) || !['bank', 'cash'].includes(t.method)) throw new HttpError(409, 'This payment cannot accept a transfer claim.');
  const reference = clean(ctx.body.providerReference, 150);
  if (reference.length < 3) throw new HttpError(400, 'Enter the bank transfer or cashier receipt reference.');
  run(`UPDATE transactions SET meta=json_set(meta,'$.customerClaimedReference',?,'$.claimedAt',datetime('now')) WHERE id=?`, reference, t.id);
  audit('customer', u.id, 'payment.proof_submitted', 'transaction', t.id, null, { reference }, ctx.ip, ctx.ua);
  return { payment: serializeTxn(q1(`SELECT * FROM transactions WHERE id=?`, t.id)), message: 'Reference submitted for reconciliation. Your balance has not changed.' };
}
export async function providerWebhook(ctx) {
  const provider = clean(ctx.params.provider, 30), config = providerConfig(provider);
  if (!['mpamba', 'airtel', 'bank', 'cash'].includes(provider)) throw new HttpError(404, 'Unknown provider.');
  const secret = config.secret || process.env[`GFS_${provider.toUpperCase()}_WEBHOOK_SECRET`] || '';
  const raw = await readBody(ctx.req, 1024 * 1024), timestamp = String(ctx.req.headers['x-gfs-timestamp'] || ''), signature = String(ctx.req.headers['x-gfs-signature'] || '');
  if (!secret || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300 || !verifyWebhookSignature(`${timestamp}.${raw.toString('utf8')}`, signature, secret)) throw new HttpError(401, 'Invalid or expired webhook signature.');
  let p; try { p = JSON.parse(raw.toString('utf8')); } catch { throw new HttpError(400, 'Invalid JSON.'); }
  const eventId = clean(p.eventId, 100), hash = GFS.refs.transaction && crypto.createHash('sha256').update(raw).digest('hex');
  if (!eventId) throw new HttpError(400, 'eventId is required.');
  const prior = q1(`SELECT * FROM integration_events WHERE id=?`, `${provider}:${eventId}`);
  if (prior) { if (prior.payload_hash !== hash) throw new HttpError(409, 'Event ID reused with a different payload.'); return { ok: true, duplicate: true }; }
  const t = q1(`SELECT * FROM transactions WHERE provider_ref=? AND environment='production'`, clean(p.providerRef || p.reference, 150));
  if (!t) throw new HttpError(404, 'Unknown payment reference.');
  if (p.currency !== 'MWK' || cents(p.amount) !== cents(t.amount)) {
    run(`UPDATE transactions SET status='reconciliation',failure_reason='Provider amount or currency mismatch.' WHERE id=? AND status!='verified'`, t.id);
    audit('system', null, 'payment.reconciliation_required', 'transaction', t.id, { amount: t.amount }, { amount: p.amount, currency: p.currency }, ctx.ip, null);
    throw new HttpError(409, 'Amount/currency mismatch flagged for reconciliation.');
  }
  return tx(() => {
    if (p.status === 'failed' || p.status === 'cancelled') {
      if (t.status === 'verified') throw new HttpError(409, 'A verified payment requires a separate reversal workflow.');
      run(`UPDATE transactions SET status='failed',failure_reason=? WHERE id=?`, clean(p.reason, 200) || 'Provider reported failure.', t.id);
    } else if (p.status === 'success' || p.status === 'verified') verifyAndApply(t.id, { providerRef: clean(p.providerTransactionId || p.providerRef, 150), source: `provider:${provider}` });
    else throw new HttpError(400, 'Unsupported payment status.');
    run(`INSERT INTO integration_events(id,payload_hash,event_type,result) VALUES(?,?,?,?)`, `${provider}:${eventId}`, hash, `payment.${p.status}`, 'processed');
    return { ok: true };
  });
}
export async function listTransactions(ctx) {
  const u = requireAuth(ctx), { type, status, loanId, search } = Object.fromEntries(ctx.url.searchParams);
  let sql = `SELECT t.*,l.ref loan_ref FROM transactions t LEFT JOIN loans l ON l.id=t.loan_id WHERE t.customer_id=?`; const params = [u.id];
  if (type) { sql += ` AND t.type=?`; params.push(type); } if (status) { sql += ` AND t.status=?`; params.push(status); } if (loanId) { sql += ` AND t.loan_id=?`; params.push(Number(loanId)); }
  if (search) { sql += ` AND t.ref LIKE ?`; params.push(`%${clean(search, 80)}%`); }
  return { transactions: q(sql + ` ORDER BY t.id DESC LIMIT 300`, ...params).map(t => ({ ...serializeTxn(t), loanRef: t.loan_ref })) };
}
export async function listReceipts(ctx) { const u = requireAuth(ctx); return { receipts: q(`SELECT r.*,l.ref loan_ref,t.environment FROM receipts r LEFT JOIN loans l ON l.id=r.loan_id JOIN transactions t ON t.id=r.transaction_id WHERE r.customer_id=? ORDER BY r.id DESC`, u.id).map(r => ({ id: r.id, ref: r.ref, transactionId: r.transaction_id, loanId: r.loan_id, loanRef: r.loan_ref, amount: r.amount, method: r.method, createdAt: r.created_at, environment: r.environment })) }; }
export async function getReceipt(ctx) { const u = requireAuth(ctx); const r = q1(`SELECT r.*,l.ref loan_ref,l.product_id,t.environment FROM receipts r LEFT JOIN loans l ON l.id=r.loan_id JOIN transactions t ON t.id=r.transaction_id WHERE r.id=? AND r.customer_id=?`, Number(ctx.params.id), u.id); if (!r) throw new HttpError(404, 'Receipt not found.'); return { receipt: { ...r, loanRef: r.loan_ref }, transaction: serializeTxn(q1(`SELECT * FROM transactions WHERE id=?`, r.transaction_id)) }; }
