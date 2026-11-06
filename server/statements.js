/* Financial records: PDF receipts, loan statements, transaction statements,
   settlement statements and signed loan agreements — all generated from the
   central database, all scoped to the owning customer. */
import { q, q1, run, audit } from './db.js';
import { HttpError } from './http.js';
import { requireAuth } from './auth.js';
import { PDF } from './pdf.js';
import GFS from '../shared/core.mjs';
import { settlementQuote, accrueInterest } from './finance.js';
import { company } from './catalog.js';
import { json } from './db.js';

const C = company();
const FOOT = `${C.legal} · ${C.address} · ${C.email} · ${C.phone} · Generated from customer-portal records. Sandbox documents are demonstrations, not proof of a real transaction.`;

function sendPDF(ctx, pdf, filename) {
  const buf = pdf.build();
  audit('customer', ctx.user.id, 'document.generated', 'pdf', filename, null, { bytes: buf.length }, ctx.ip, ctx.ua);
  ctx.res.writeHead(200, {
    'Content-Type': 'application/pdf',
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Content-Length': buf.length, 'Cache-Control': 'no-store'
  });
  ctx.res.end(buf);
}

/* ---------------- payment receipt ---------------- */
export async function receiptPDF(ctx) {
  const u = requireAuth(ctx);
  const r = q1(`SELECT r.*, l.ref loan_ref, l.product_id FROM receipts r LEFT JOIN loans l ON l.id = r.loan_id WHERE r.id = ? AND r.customer_id = ?`, Number(ctx.params.id), u.id);
  if (!r) throw new HttpError(404, 'Receipt not found.');
  const t = q1(`SELECT * FROM transactions WHERE id = ?`, r.transaction_id);
  const l = r.loan_id ? q1(`SELECT * FROM loans WHERE id = ?`, r.loan_id) : null;
  const alloc = (() => { try { return JSON.parse(t.allocation); } catch { return {}; } })();
  const pdf = new PDF({ title: `Receipt ${r.ref}` });
  pdf.header(C.name, 'Payment Receipt', r.ref);
  pdf.text('PAYMENT RECEIPT', { size: 16, bold: true, color: [0.02, 0.3, 0.22] }).space(6);
  pdf.kv('Receipt no.', r.ref);
  pdf.kv('Transaction ref.', t.ref);
  pdf.kv('Date', GFS.fmtDateTime(r.created_at));
  pdf.kv('Customer', `${u.first_name} ${u.last_name} (${u.customer_no})`);
  pdf.kv('Loan', r.loan_ref || '—');
  pdf.kv('Payment method', (GFS.PAYMENT_METHODS.find(m => m.id === r.method) || {}).name || r.method || '—');
  pdf.kv('Provider reference', t.provider_ref || '—');
  pdf.kv('Status', t.environment === 'sandbox' ? 'SANDBOX VERIFIED — NO REAL MONEY MOVED' : 'VERIFIED');
  pdf.space(6).line();
  pdf.kv('AMOUNT RECEIVED', GFS.mk2(r.amount), { size: 14 });
  pdf.space(6).line();
  if (alloc && (alloc.principal || alloc.interest)) {
    pdf.text('Allocation of this payment', { size: 11, bold: true }).space(2);
    pdf.kv('Penalties', GFS.mk2(alloc.penalties || 0));
    pdf.kv('Fees', GFS.mk2(alloc.fees || 0));
    pdf.kv('Interest', GFS.mk2(alloc.interest || 0));
    pdf.kv('Principal', GFS.mk2(alloc.principal || 0));
    if (alloc.advance) pdf.kv('Advance credit', GFS.mk2(alloc.advance));
    pdf.space(4).line();
  }
  if (l) {
    pdf.kv('Remaining principal', GFS.mk2(l.outstanding_principal));
    pdf.kv('Remaining total balance', GFS.mk2(l.outstanding_principal + l.accrued_interest + l.fees_outstanding + l.penalties));
    pdf.kv('Loan status', l.status.toUpperCase());
  }
  pdf.space(10);
  pdf.text('Thank you for your payment. Keep this receipt for your records. Every payment is allocated to penalties, fees, interest and principal in that order.', { size: 9, color: [0.35, 0.4, 0.47] });
  pdf.footer(FOOT);
  sendPDF(ctx, pdf, `${r.ref}.pdf`);
}

/* ---------------- loan statement ---------------- */
export async function loanStatementPDF(ctx) {
  const u = requireAuth(ctx);
  const l = q1(`SELECT * FROM loans WHERE id = ? AND customer_id = ?`, Number(ctx.params.id), u.id);
  if (!l) throw new HttpError(404, 'Loan not found.');
  const product = GFS.productById(l.product_id, true);
  const rows = q(`SELECT * FROM schedule WHERE loan_id = ? ORDER BY no`, l.id);
  const txns = q(`SELECT * FROM transactions WHERE loan_id = ? AND status = 'verified' ORDER BY id ASC`, l.id);
  const ref = GFS.refs.statement();
  const pdf = new PDF({ title: `Statement ${l.ref}` });
  pdf.header(C.name, 'Loan Account Statement', ref);
  if (l.environment === 'sandbox') pdf.text('SANDBOX DEMONSTRATION — NOT A REAL FINANCIAL STATEMENT', { size: 10, bold: true, color: [0.7, 0.2, 0.1] });
  pdf.text('LOAN STATEMENT', { size: 16, bold: true, color: [0.02, 0.3, 0.22] }).space(4);
  pdf.kv('Customer', `${u.first_name} ${u.last_name} (${u.customer_no})`);
  pdf.kv('Loan account', l.ref);
  pdf.kv('Product', product ? product.name : l.product_id);
  pdf.kv('Statement date', GFS.fmtDate(new Date()));
  pdf.kv('Disbursed', `${GFS.fmtDate(l.disbursed_at)} · net ${GFS.mk2(l.net_disbursed || 0)}`);
  pdf.kv('Terms', `${GFS.mk2(l.principal)} · ${l.rate_monthly}%/month declining · ${l.term_months} months · ${l.freq}`);
  pdf.space(4).line();
  pdf.kv('Total borrowed (principal)', GFS.mk2(l.principal));
  pdf.kv('Arrangement fee', GFS.mk2(l.fee_amount));
  pdf.kv('Total repaid to date', GFS.mk2(l.total_repaid));
  pdf.kv('  of which interest', GFS.mk2(l.total_interest_paid));
  pdf.kv('Outstanding principal', GFS.mk2(l.outstanding_principal));
  pdf.kv('Accrued interest due', GFS.mk2(l.accrued_interest));
  pdf.kv('Fees / penalties due', GFS.mk2(l.fees_outstanding + l.penalties));
  pdf.kv('TOTAL OUTSTANDING', GFS.mk2(l.outstanding_principal + l.accrued_interest + l.fees_outstanding + l.penalties), { size: 12 });
  pdf.kv('Next instalment', l.next_due_date ? `${GFS.mk2(l.next_due_amount || 0)} due ${l.next_due_date}` : '—');
  pdf.kv('Status', l.status.toUpperCase());
  pdf.space(8);
  pdf.text('Repayment schedule', { size: 12, bold: true, color: [0.02, 0.3, 0.22] }).space(2);
  pdf.table(
    ['#', 'Due date', 'Opening', 'Instalment', 'Principal', 'Interest', 'Closing', 'Status'],
    rows.map(r => [r.no, r.due_date, GFS.num(r.opening), GFS.num(r.installment), GFS.num(r.principal_part), GFS.num(r.interest_part), GFS.num(r.closing), r.status]),
    [0.04, 0.13, 0.14, 0.14, 0.14, 0.13, 0.14, 0.14]
  );
  pdf.space(6);
  pdf.text('Verified transactions', { size: 12, bold: true, color: [0.02, 0.3, 0.22] }).space(2);
  pdf.table(
    ['Date', 'Reference', 'Type', 'Method', 'Amount'],
    txns.map(t => [String(t.created_at).slice(0, 10), t.ref, t.type, t.method || '—', GFS.num(t.amount)]),
    [0.14, 0.30, 0.16, 0.18, 0.22]
  );
  pdf.footer(FOOT);
  sendPDF(ctx, pdf, `statement-${l.ref}.pdf`);
}

/* ---------------- full transaction statement ---------------- */
export async function transactionStatementPDF(ctx) {
  const u = requireAuth(ctx);
  const txns = q(`SELECT t.*, l.ref loan_ref FROM transactions t LEFT JOIN loans l ON l.id = t.loan_id WHERE t.customer_id = ? ORDER BY t.id ASC`, u.id);
  const ref = GFS.refs.statement();
  const pdf = new PDF({ title: `Transaction statement ${ref}` });
  pdf.header(C.name, 'Full Transaction History', ref);
  pdf.text('TRANSACTION STATEMENT', { size: 16, bold: true, color: [0.02, 0.3, 0.22] }).space(4);
  pdf.kv('Customer', `${u.first_name} ${u.last_name} (${u.customer_no})`);
  pdf.kv('Statement date', GFS.fmtDate(new Date()));
  pdf.kv('Records', String(txns.length));
  const totalIn = txns.filter(t => ['repayment', 'settlement'].includes(t.type) && t.status === 'verified').reduce((s, t) => s + t.amount, 0);
  const disb = txns.filter(t => t.type === 'disbursement' && t.status === 'verified').reduce((s, t) => s + t.amount, 0);
  pdf.kv('Total disbursed to you', GFS.mk2(disb));
  pdf.kv('Total repaid by you', GFS.mk2(totalIn));
  pdf.space(6).line().space(4);
  pdf.table(
    ['Date', 'Reference', 'Loan', 'Type', 'Method', 'Amount', 'Status'],
    txns.map(t => [String(t.created_at).slice(0, 10), t.ref, t.loan_ref || '—', t.type, t.method || '—', GFS.num(t.amount), t.status]),
    [0.11, 0.24, 0.13, 0.13, 0.12, 0.15, 0.12]
  );
  pdf.footer(FOOT);
  sendPDF(ctx, pdf, `transactions-${u.customer_no}.pdf`);
}

/* ---------------- settlement statement ---------------- */
export async function settlementStatementPDF(ctx) {
  const u = requireAuth(ctx);
  const l = q1(`SELECT * FROM loans WHERE id = ? AND customer_id = ?`, Number(ctx.params.id), u.id);
  if (!l) throw new HttpError(404, 'Loan not found.');
  accrueInterest(l.id);
  const current = q1(`SELECT * FROM loans WHERE id=?`, l.id);
  const quote = settlementQuote(current);
  const ref = GFS.refs.statement();
  const pdf = new PDF({ title: `Settlement statement ${l.ref}` });
  pdf.header(C.name, 'Early Settlement Statement', ref);
  if (l.environment === 'sandbox') pdf.text('SANDBOX DEMONSTRATION — NO REAL MONEY MOVES', { size: 10, bold: true, color: [0.7, 0.2, 0.1] });
  pdf.text('SETTLEMENT STATEMENT', { size: 16, bold: true, color: [0.02, 0.3, 0.22] }).space(4);
  pdf.kv('Customer', `${u.first_name} ${u.last_name} (${u.customer_no})`);
  pdf.kv('Loan account', l.ref);
  pdf.kv('Quote date', GFS.fmtDate(new Date()));
  pdf.kv('Valid for', 'Today only; interest accrues daily');
  pdf.space(4).line();
  pdf.kv('Outstanding principal', GFS.mk2(quote.principal));
  pdf.kv('Accrued interest to date', GFS.mk2(quote.accruedInterest));
  pdf.kv('Fees due', GFS.mk2(quote.fees));
  pdf.kv('Penalties due', GFS.mk2(quote.penalties));
  pdf.kv('TOTAL TO SETTLE TODAY', GFS.mk2(quote.total), { size: 13 });
  pdf.kv('Future interest waived', GFS.mk2(quote.futureInterestWaived));
  pdf.space(8);
  pdf.text('Pay this amount from your portal (Loans → Settle loan) or at any branch quoting the loan reference. On verification of the exact full amount the loan is settled and a confirmation is issued. Security release requires a separate authorised release record.', { size: 9.5 });
  pdf.footer(FOOT);
  sendPDF(ctx, pdf, `settlement-${l.ref}.pdf`);
}

/* ---------------- signed loan agreement ---------------- */
export async function agreementPDF(ctx) {
  const u = requireAuth(ctx);
  const a = q1(`SELECT * FROM applications WHERE id = ? AND customer_id = ?`, Number(ctx.params.id), u.id);
  if (!a) throw new HttpError(404, 'Application not found.');
  const acceptance = q1(`SELECT * FROM agreement_acceptances WHERE application_id=?`, a.id);
  const signedTerms = acceptance ? json(acceptance.terms_json) : null;
  const offer = signedTerms?.offer || json(a.offer, null);
  const clauses = signedTerms?.clauses || GFS.AGREEMENT_CLAUSES;
  const product = GFS.productById(a.product_id, true);
  const pdf = new PDF({ title: `Loan agreement ${a.ref}` });
  pdf.header(C.name, 'Loan Agreement', a.ref);
  if (offer?.environment === 'sandbox') pdf.text('SANDBOX DEMONSTRATION — NOT A LIVE CREDIT CONTRACT', { size: 10, bold: true, color: [0.7, 0.2, 0.1] });
  pdf.text('LOAN AGREEMENT', { size: 16, bold: true, color: [0.02, 0.3, 0.22] }).space(4);
  pdf.kv('Borrower', `${u.first_name} ${u.last_name} (${u.customer_no})`);
  pdf.kv('Application', a.ref);
  pdf.kv('Product', product ? product.name : a.product_id);
  if (offer) {
    pdf.kv('Principal', GFS.mk2(offer.amount));
    pdf.kv('Interest', `${offer.rate}% per month, declining balance`);
    pdf.kv('Arrangement fee', `${offer.feePct}% (${GFS.mk2(offer.fee)})`);
    pdf.kv('Term', `${offer.termMonths} months · ${offer.freq}`);
    pdf.kv('Instalment', GFS.mk2(offer.installment));
    pdf.kv('Total repayable', GFS.mk2(offer.totalRepayable));
    pdf.kv('Net disbursement', GFS.mk2(offer.netDisbursement));
  }
  pdf.space(4).line().space(4);
  for (const c of clauses) {
    pdf.text(c.t, { size: 10.5, bold: true, color: [0.02, 0.3, 0.22], gap: 2 });
    pdf.text(c.b, { size: 9, gap: 3 });
    pdf.space(4);
  }
  pdf.space(4).line();
  if (a.agreement_accepted_at) {
    pdf.text('ELECTRONIC ACCEPTANCE', { size: 11, bold: true, color: [0.02, 0.3, 0.22] }).space(2);
    pdf.kv('Signed by', a.agreement_name || `${u.first_name} ${u.last_name}`);
    pdf.kv('Terms hash', acceptance?.terms_hash || 'Not yet signed');
    pdf.kv('Signed at', GFS.fmtDateTime(a.agreement_accepted_at));
    pdf.kv('Signature', a.agreement_signature && a.agreement_signature.startsWith('data:') ? '[drawn signature on file]' : (a.agreement_signature || '—'));
    pdf.text('Electronic acceptance is retained with a terms hash, timestamp and encrypted signature. Sandbox acceptance is a demonstration, not a live credit contract.', { size: 8.5, color: [0.35, 0.4, 0.47] });
  } else {
    pdf.text('NOT YET ACCEPTED — this is a draft offer for review.', { size: 10, bold: true, color: [0.7, 0.2, 0.1] });
  }
  pdf.footer(FOOT);
  sendPDF(ctx, pdf, `agreement-${a.ref}.pdf`);
}

/* ---------------- disbursement receipt ---------------- */
export async function disbursementPDF(ctx) {
  const u = requireAuth(ctx);
  const l = q1(`SELECT * FROM loans WHERE id = ? AND customer_id = ?`, Number(ctx.params.id), u.id);
  if (!l) throw new HttpError(404, 'Loan not found.');
  const pdf = new PDF({ title: `Disbursement ${l.disbursement_ref}` });
  pdf.header(C.name, 'Disbursement Confirmation', l.disbursement_ref || l.ref);
  pdf.text('DISBURSEMENT CONFIRMATION', { size: 16, bold: true, color: [0.02, 0.3, 0.22] }).space(4);
  pdf.kv('Customer', `${u.first_name} ${u.last_name} (${u.customer_no})`);
  pdf.kv('Loan account', l.ref);
  pdf.kv('Disbursement reference', l.disbursement_ref || '—');
  pdf.kv('Date', GFS.fmtDateTime(l.disbursed_at));
  pdf.kv('Method', (GFS.PAYMENT_METHODS.find(m => m.id === l.disbursement_method) || {}).name || l.disbursement_method || '—');
  pdf.space(4).line();
  pdf.kv('Gross principal', GFS.mk2(l.principal));
  pdf.kv('Arrangement fee deducted', GFS.mk2(l.fee_amount));
  pdf.kv('NET AMOUNT DISBURSED', GFS.mk2(l.net_disbursed || 0), { size: 13 });
  pdf.space(4).line();
  pdf.kv('First instalment', GFS.mk2(l.installment));
  pdf.kv('Repayment frequency', l.freq);
  pdf.kv('Term', `${l.term_months} months`);
  pdf.space(8);
  pdf.text(l.environment === 'sandbox' ? 'SANDBOX ONLY: no real funds were sent. This record demonstrates the disbursement workflow.' : 'Disbursement confirmed by the back-office/provider record. Your repayment schedule is available in the customer portal.', { size: 9.5 });
  pdf.footer(FOOT);
  sendPDF(ctx, pdf, `disbursement-${l.ref}.pdf`);
}
