/* Payment methods & integrations: TNM Mpamba, Airtel Money, bank transfer, cash.
   Sandbox provider adapter for walkthroughs + signed webhook endpoint for live
   provider callbacks. Verified payments update loan balances automatically and
   issue a unique receipt. Idempotent by key. */
import { q, q1, run, tx, audit, activity, json, getSetting } from './db.js';
import { HttpError, readBody } from './http.js';
import { clean, cleanNum, verifyWebhookSignature, randomToken } from './security.js';
import { notify } from './notifications.js';
import { requireAuth } from './auth.js';
import { applyRepayment, settleLoan, recomputeLoan, serializeLoan, serializeTxn } from './loans.js';
import GFS from '../shared/core.mjs';
import { IS_PROD } from './config.js';

const r2 = GFS.round2;
const methodName = id => (GFS.PAYMENT_METHODS.find(m => m.id === id) || {}).name || id;

export async function paymentMethods(ctx) {
  return { methods: GFS.PAYMENT_METHODS, currency: GFS.CURRENCY, sandbox: !IS_PROD };
}

/* ---------------- initiate a repayment ---------------- */
export async function initiatePayment(ctx) {
  const u = requireAuth(ctx);
  const b = ctx.body;
  const loan = q1(`SELECT * FROM loans WHERE id = ? AND customer_id = ?`, Number(b.loanId), u.id);
  if (!loan) throw new HttpError(404, 'Loan not found.');
  if (loan.status !== 'active') throw new HttpError(400, 'This loan is not active.');
  const method = GFS.PAYMENT_METHODS.find(m => m.id === b.method);
  if (!method) throw new HttpError(400, 'Choose a valid payment method.');
  let amount = cleanNum(b.amount);
  const settle = !!b.settle;
  if (settle) {
    const quote = GFS.settlementQuote(loan);
    amount = quote.total;
  }
  if (!(amount > 0)) throw new HttpError(400, 'Enter an amount greater than zero.');
  const outstanding = r2(loan.outstanding_principal + loan.accrued_interest + loan.fees_outstanding + loan.penalties);
  if (!settle && amount > outstanding + loan.installment) throw new HttpError(400, `Amount is too large. Outstanding balance is ${GFS.mk(outstanding)}.`);
  const idem = clean(b.idempotencyKey, 80) || null;
  if (idem) {
    const existing = q1(`SELECT * FROM transactions WHERE idempotency_key = ? AND customer_id = ?`, idem, u.id);
    if (existing) return { payment: serializeTxn(existing), duplicate: true };
  }
  const account = clean(b.account || u.phone, 60);
  if (method.type === 'mobile' && !GFS.isPhoneMW(account)) throw new HttpError(400, 'Enter the mobile money number to debit (e.g. 0999 123 456).');
  const ref = GFS.refs.transaction();
  const providerRef = `${method.id.toUpperCase()}-${randomToken(6).toUpperCase()}`;
  const id = tx(() => {
    const r = run(`INSERT INTO transactions(ref, customer_id, loan_id, type, method, provider, provider_ref, amount, status, idempotency_key, meta)
      VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
      ref, u.id, loan.id, settle ? 'settlement' : 'repayment', method.id, methodName(method.id), providerRef, r2(amount), 'pending', idem,
      JSON.stringify({ account, settle, sandbox: !IS_PROD, instructions: method.instructions }));
    return Number(r.lastInsertRowid);
  });
  activity(u.id, 'Payment initiated', `${ref} · ${GFS.mk(amount)} · ${method.name}`, ctx.ip, ctx.ua);
  audit('customer', u.id, 'payment.initiated', 'transaction', id, null, { ref, amount: r2(amount), method: method.id }, ctx.ip, ctx.ua);
  const instructions = method.type === 'mobile'
    ? `A ${method.name} prompt has been sent to ${account}. Approve it with your PIN to complete the payment of ${GFS.mk(amount)}. Reference: ${ref}.`
    : method.type === 'bank'
      ? `Transfer ${GFS.mk(amount)} to Golden Financial Services Ltd (FDH Bank 1000234567). Use reference ${ref}. Then confirm below once sent.`
      : `Pay ${GFS.mk(amount)} at any branch quoting reference ${ref}, then confirm below once the cashier issues your receipt.`;
  return {
    payment: serializeTxn(q1(`SELECT * FROM transactions WHERE id = ?`, id)),
    instructions, providerRef, sandbox: !IS_PROD,
    ...(settle ? { settlement: GFS.settlementQuote(loan) } : {})
  };
}

/* ---------------- verification (shared by sandbox confirm + webhook) ---------------- */
export function verifyAndApply(txnId, { providerRef, source }) {
  return tx(() => {
    const t = q1(`SELECT * FROM transactions WHERE id = ?`, txnId);
    if (!t) throw new HttpError(404, 'Transaction not found.');
    if (t.status === 'verified') return { transaction: t, alreadyVerified: true };
    if (t.status !== 'pending') throw new HttpError(400, `Transaction is ${t.status} and cannot be verified.`);
    const loan = q1(`SELECT * FROM loans WHERE id = ?`, t.loan_id);
    const result = t.type === 'settlement' ? settleLoan(loan.id, t.amount) : applyRepayment(loan.id, t.amount, t.ref);
    // receipt with unique reference
    const receiptRef = GFS.refs.receipt();
    const rr = run(`INSERT INTO receipts(ref, transaction_id, customer_id, loan_id, amount, method) VALUES(?,?,?,?,?,?)`,
      receiptRef, t.id, t.customer_id, loan.id, t.amount, t.method);
    const receiptId = Number(rr.lastInsertRowid);
    run(`UPDATE transactions SET status = 'verified', verified_at = datetime('now'), receipt_id = ?, provider_ref = COALESCE(?, provider_ref),
         allocation = ?, meta = json_set(meta, '$.verifiedVia', ?) WHERE id = ?`,
      receiptId, providerRef || null, JSON.stringify(result.allocation), source, t.id);
    const updated = q1(`SELECT * FROM loans WHERE id = ?`, loan.id);
    const remaining = r2(updated.outstanding_principal + updated.accrued_interest + updated.fees_outstanding + updated.penalties);
    notify(t.customer_id, {
      category: 'payment', title: t.type === 'settlement' ? 'Settlement payment received' : 'Payment received ✓',
      body: `${GFS.mk(t.amount)} received via ${methodName(t.method)} for loan ${loan.ref}. Receipt ${receiptRef}. ${updated.status === 'closed' ? 'Your loan is now fully settled — congratulations!' : `New balance: ${GFS.mk(remaining)}.`}`,
      channels: ['inapp', 'sms', 'email'], meta: { receiptRef, transactionRef: t.ref }
    });
    audit('system', null, 'payment.verified', 'transaction', t.id, null, { ref: t.ref, amount: t.amount, allocation: result.allocation, source }, null, null);
    activity(t.customer_id, 'Payment verified', `${t.ref} · ${GFS.mk(t.amount)} · receipt ${receiptRef}`, null, null);
    return { transaction: q1(`SELECT * FROM transactions WHERE id = ?`, t.id), receipt: q1(`SELECT * FROM receipts WHERE id = ?`, receiptId), loan: updated, allocation: result.allocation };
  });
}

/* Sandbox confirm: simulates the provider callback after the customer approves
   the mobile-money prompt / sends the transfer. Disabled in production. */
export async function confirmPayment(ctx) {
  const u = requireAuth(ctx);
  if (IS_PROD) throw new HttpError(403, 'In production, payments are confirmed only by the provider webhook.');
  const t = q1(`SELECT * FROM transactions WHERE id = ? AND customer_id = ?`, Number(ctx.params.id), u.id);
  if (!t) throw new HttpError(404, 'Transaction not found.');
  const outcome = ctx.body.outcome === 'failure' ? 'failure' : 'success';
  if (outcome === 'failure') {
    run(`UPDATE transactions SET status = 'failed', failure_reason = ? WHERE id = ?`, clean(ctx.body.reason, 200) || 'Payment was not completed (insufficient funds or cancelled).', t.id);
    notify(u.id, { category: 'payment', title: 'Payment failed', body: `Your payment ${t.ref} of ${GFS.mk(t.amount)} via ${methodName(t.method)} did not go through. No money was deducted. Please try again or use another method.`, channels: ['inapp', 'sms'] });
    audit('customer', u.id, 'payment.failed', 'transaction', t.id, null, null, ctx.ip, ctx.ua);
    return { payment: serializeTxn(q1(`SELECT * FROM transactions WHERE id = ?`, t.id)), failed: true };
  }
  const result = verifyAndApply(t.id, { providerRef: t.provider_ref, source: 'sandbox' });
  return {
    payment: serializeTxn(result.transaction),
    receipt: { id: result.receipt.id, ref: result.receipt.ref, amount: result.receipt.amount },
    loan: serializeLoan(result.loan), allocation: result.allocation
  };
}

/* ---------------- live provider webhook (HMAC-signed) ---------------- */
export async function providerWebhook(ctx) {
  const provider = ctx.params.provider;
  const secret = process.env[`GFS_${provider.toUpperCase()}_WEBHOOK_SECRET`] || getSetting(`webhook_secret_${provider}`, '');
  const raw = await readBody(ctx.req, 1024 * 1024);
  const sig = ctx.req.headers['x-gfs-signature'] || ctx.req.headers['x-signature'] || '';
  if (!secret || !verifyWebhookSignature(raw, sig, secret)) {
    audit('system', null, 'webhook.rejected', 'provider', provider, null, { reason: 'bad signature' }, ctx.ip, null);
    throw new HttpError(401, 'Invalid webhook signature.');
  }
  let payload;
  try { payload = JSON.parse(raw.toString('utf8')); } catch { throw new HttpError(400, 'Invalid JSON.'); }
  const t = q1(`SELECT * FROM transactions WHERE provider_ref = ?`, clean(payload.providerRef || payload.reference, 80));
  if (!t) throw new HttpError(404, 'Unknown transaction reference.');
  if (payload.status === 'failed' || payload.status === 'cancelled') {
    run(`UPDATE transactions SET status = 'failed', failure_reason = ? WHERE id = ?`, clean(payload.reason, 200) || 'Provider reported failure.', t.id);
    notify(t.customer_id, { category: 'payment', title: 'Payment failed', body: `Payment ${t.ref} failed: ${payload.reason || 'provider reported failure.'}`, channels: ['inapp', 'sms'] });
    return { ok: true, status: 'failed' };
  }
  if (Math.abs(cleanNum(payload.amount) - t.amount) > 0.01) {
    audit('system', null, 'webhook.amount_mismatch', 'transaction', t.id, { expected: t.amount }, { received: payload.amount }, ctx.ip, null);
    throw new HttpError(400, 'Amount mismatch — flagged for reconciliation.');
  }
  const result = verifyAndApply(t.id, { providerRef: payload.providerRef, source: `webhook:${provider}` });
  return { ok: true, status: 'verified', receipt: result.receipt.ref };
}

/* ---------------- history & receipts ---------------- */
export async function listTransactions(ctx) {
  const u = requireAuth(ctx);
  const { type, status, loanId } = Object.fromEntries(ctx.url.searchParams);
  let sql = `SELECT t.*, l.ref loan_ref FROM transactions t LEFT JOIN loans l ON l.id = t.loan_id WHERE t.customer_id = ?`;
  const params = [u.id];
  if (type) { sql += ` AND t.type = ?`; params.push(type); }
  if (status) { sql += ` AND t.status = ?`; params.push(status); }
  if (loanId) { sql += ` AND t.loan_id = ?`; params.push(Number(loanId)); }
  sql += ` ORDER BY t.id DESC LIMIT 300`;
  return { transactions: q(sql, ...params).map(t => ({ ...serializeTxn(t), loanRef: t.loan_ref })) };
}
export async function listReceipts(ctx) {
  const u = requireAuth(ctx);
  return {
    receipts: q(`SELECT r.*, l.ref loan_ref FROM receipts r LEFT JOIN loans l ON l.id = r.loan_id WHERE r.customer_id = ? ORDER BY r.id DESC`, u.id)
      .map(r => ({ id: r.id, ref: r.ref, transactionId: r.transaction_id, loanId: r.loan_id, loanRef: r.loan_ref, amount: r.amount, method: r.method, createdAt: r.created_at }))
  };
}
export async function getReceipt(ctx) {
  const u = requireAuth(ctx);
  const r = q1(`SELECT r.*, l.ref loan_ref, l.product_id FROM receipts r LEFT JOIN loans l ON l.id = r.loan_id WHERE r.id = ? AND r.customer_id = ?`, Number(ctx.params.id), u.id);
  if (!r) throw new HttpError(404, 'Receipt not found.');
  const t = q1(`SELECT * FROM transactions WHERE id = ?`, r.transaction_id);
  return { receipt: { ...r, loanRef: r.loan_ref }, transaction: serializeTxn(t) };
}
