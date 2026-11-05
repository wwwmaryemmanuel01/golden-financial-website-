/* Authoritative, auditable reducing-balance accounting.
   Money is rounded to ngwee at each posting; immutable ledger deltas use integer cents.
   Scheduled interest is an estimate. Actual interest accrues daily on unpaid principal,
   so an early repayment saves future interest instead of merely creating a credit balance. */
import { q, q1, run, tx, audit } from './db.js';
import { HttpError } from './http.js';
import GFS from '../shared/core.mjs';
import { rules } from './catalog.js';
export const cents = n => Math.round((Number(n) + Number.EPSILON) * 100);
export const money = n => cents(n) / 100;
export const dateOnly = d => (d instanceof Date ? d.toISOString() : String(d || new Date().toISOString())).slice(0, 10);
const dayNumber = d => Date.parse(`${dateOnly(d)}T00:00:00Z`) / 86400000;
export function postLedger(loan, bucket, delta, description, transactionId = null, ref = GFS.refs.transaction()) {
  const value = cents(delta);
  if (!Number.isSafeInteger(value) || !['principal', 'interest', 'fees', 'penalties', 'interest_waiver'].includes(bucket)) throw new Error('Invalid ledger posting.');
  if (!value) return;
  run(`INSERT INTO ledger_entries(ref,customer_id,loan_id,transaction_id,bucket,delta_cents,description) VALUES(?,?,?,?,?,?,?)`, ref, loan.customer_id, loan.id, transactionId, bucket, value, description);
}
export function accrueInterest(loanId, asOf = new Date()) {
  return tx(() => {
    const l = q1(`SELECT * FROM loans WHERE id = ?`, loanId);
    if (!l || l.status !== 'active') return 0;
    const to = dateOnly(asOf);
    const from = l.interest_accrued_through || dateOnly(l.disbursed_at);
    const days = Math.max(0, dayNumber(to) - dayNumber(from));
    if (!days || to < from) return 0;
    // Annual equivalent = published monthly declining rate × 12; actual days / 365.
    const interest = money(l.outstanding_principal * (l.rate_monthly * 12 / 100) * days / 365);
    run(`UPDATE loans SET interest_accrued_total = ?, accrued_interest = ?, interest_accrued_through = ?, updated_at = datetime('now') WHERE id = ?`, money(l.interest_accrued_total + interest), money(l.accrued_interest + interest), to, l.id);
    postLedger(l, 'interest', interest, `Daily reducing-balance interest: ${days} day(s) to ${to}`);
    return interest;
  });
}
export function recomputeLoan(loanId) {
  const rows = q(`SELECT * FROM schedule WHERE loan_id = ? ORDER BY no`, loanId);
  const l = q1(`SELECT * FROM loans WHERE id = ?`, loanId);
  const principal = money(rows.reduce((s, r) => s + cents(r.principal_part) - cents(r.principal_paid), 0) / 100);
  const future = Math.max(0, money(rows.reduce((s, r) => s + Math.max(0, cents(r.interest_part) - cents(r.interest_paid) - cents(r.waived)), 0) / 100 - l.accrued_interest));
  const next = rows.find(r => cents(r.principal_paid) + cents(r.interest_paid) + cents(r.waived) < cents(r.installment));
  const closed = cents(principal) <= 0 && cents(l.accrued_interest) <= 0 && cents(l.fees_outstanding) <= 0 && cents(l.penalties) <= 0;
  run(`UPDATE loans SET outstanding_principal=?,future_interest=?,next_due_date=?,next_due_amount=?,status=?,closed_at=CASE WHEN ? THEN COALESCE(closed_at,datetime('now')) ELSE NULL END,updated_at=datetime('now') WHERE id=?`,
    Math.max(0, principal), future, closed ? null : next?.due_date || null, closed ? 0 : next ? money(cents(next.installment) - cents(next.principal_paid) - cents(next.interest_paid)) / 100 : 0,
    closed ? 'closed' : l.status === 'settled' ? 'settled' : 'active', closed ? 1 : 0, loanId);
  return q1(`SELECT * FROM loans WHERE id = ?`, loanId);
}
export function applyRepayment(loanId, amount, transactionId, { settle = false, asOf = new Date() } = {}) {
  return tx(() => {
    accrueInterest(loanId, asOf);
    const l = q1(`SELECT * FROM loans WHERE id = ?`, loanId);
    const value = cents(amount);
    if (!Number.isSafeInteger(value) || value <= 0) throw new HttpError(400, 'Payment must be a positive amount.');
    const payoff = cents(l.outstanding_principal) + cents(l.accrued_interest) + cents(l.fees_outstanding) + cents(l.penalties);
    if (settle && value !== payoff) throw new HttpError(409, 'The settlement balance changed. Request a new quote and confirm the exact amount.');
    if (!settle && value > payoff) throw new HttpError(400, 'This exceeds the current payoff balance. Use early settlement; unaccrued future interest is not charged.');
    const allocation = GFS.allocate(value / 100, { penalties: l.penalties, fees: l.fees_outstanding, interest: l.accrued_interest, principal: l.outstanding_principal });
    if (cents(allocation.unallocated)) throw new HttpError(409, 'Payment could not be fully allocated. Refresh the balance.');
    for (const bucket of rules().allocationOrder) if (cents(allocation[bucket])) postLedger(l, bucket, -allocation[bucket], 'Verified repayment allocation', transactionId);
    let remainingPrincipal = cents(allocation.principal), remainingInterest = cents(allocation.interest);
    for (const r of q(`SELECT * FROM schedule WHERE loan_id = ? ORDER BY no`, loanId)) {
      const p = Math.min(remainingPrincipal, Math.max(0, cents(r.principal_part) - cents(r.principal_paid)));
      const i = Math.min(remainingInterest, Math.max(0, cents(r.interest_part) - cents(r.interest_paid)));
      remainingPrincipal -= p; remainingInterest -= i;
      const waived = settle ? Math.max(0, cents(r.interest_part) - cents(r.interest_paid) - i) : 0;
      if (p || i || waived) run(`UPDATE schedule SET principal_paid=?,interest_paid=?,paid=?,waived=?,status=?,paid_at=CASE WHEN ? THEN datetime('now') ELSE paid_at END WHERE id=?`,
        money(cents(r.principal_paid) + p) / 100, money(cents(r.interest_paid) + i) / 100, money(cents(r.principal_paid) + p + cents(r.interest_paid) + i) / 100, money(cents(r.waived) + waived) / 100,
        waived ? 'settled' : cents(r.principal_paid) + p >= cents(r.principal_part) && cents(r.interest_paid) + i >= cents(r.interest_part) ? 'paid' : 'partial', p || i ? 1 : 0, r.id);
      if (waived) postLedger(l, 'interest_waiver', -waived / 100, 'Unaccrued interest waived on early settlement', transactionId);
    }
    run(`UPDATE loans SET penalties=?,fees_outstanding=?,accrued_interest=?,credit_balance=0,total_repaid=?,total_interest_paid=?,total_principal_paid=?,total_fees_paid=?,total_penalties_paid=?,updated_at=datetime('now') WHERE id=?`,
      money(cents(l.penalties) - cents(allocation.penalties)) / 100, money(cents(l.fees_outstanding) - cents(allocation.fees)) / 100, money(cents(l.accrued_interest) - cents(allocation.interest)) / 100,
      money(cents(l.total_repaid) + value) / 100, money(cents(l.total_interest_paid) + cents(allocation.interest)) / 100, money(cents(l.total_principal_paid) + cents(allocation.principal)) / 100,
      money(cents(l.total_fees_paid) + cents(allocation.fees)) / 100, money(cents(l.total_penalties_paid) + cents(allocation.penalties)) / 100, loanId);
    if (settle) run(`UPDATE loans SET status='settled' WHERE id=?`, loanId);
    const updated = recomputeLoan(loanId);
    audit('system', null, settle ? 'loan.settled' : 'loan.repayment_posted', 'loan', loanId, null, { amount: value / 100, allocation, transactionId }, null, null);
    return { allocation, loan: updated };
  });
}
export function settlementQuote(l, asOf = new Date()) {
  const date = dateOnly(asOf);
  const days = Math.max(0, dayNumber(date) - dayNumber(l.interest_accrued_through || l.disbursed_at));
  const extra = l.status === 'active' ? money(l.outstanding_principal * l.rate_monthly * 12 / 100 * days / 365) : 0;
  const principal = money(l.outstanding_principal), accruedInterest = money(l.accrued_interest + extra);
  const fees = money(l.fees_outstanding), penalties = money(l.penalties);
  return { asOf: date, principal, accruedInterest, fees, penalties, total: money(cents(principal) + cents(accruedInterest) + cents(fees) + cents(penalties)) / 100,
    futureInterestWaived: money(Math.max(0, l.future_interest - extra)), interestBasis: 'Published monthly rate × 12 / 365, on unpaid principal. Future unaccrued interest is waived.',
    expiresAt: `${date}T23:59:59Z`, note: 'Valid for today only; interest accrues daily. No early-settlement penalty.' };
}
export function applyLatePenalty(loanId) {
  return tx(() => {
    accrueInterest(loanId);
    const l = q1(`SELECT * FROM loans WHERE id=?`, loanId);
    if (l.status !== 'active') return 0;
    const cutoff = new Date(Date.now() - rules().graceDays * 86400000).toISOString().slice(0, 10);
    let total = 0;
    for (const r of q(`SELECT * FROM schedule WHERE loan_id=? AND due_date < ? ORDER BY no`, loanId, cutoff)) {
      const remaining = cents(r.installment) - cents(r.principal_paid) - cents(r.interest_paid);
      const ref = `PEN-${loanId}-${r.no}`;
      if (remaining <= 0 || q1(`SELECT 1 x FROM ledger_entries WHERE ref=?`, ref)) continue;
      const penalty = money(remaining * rules().latePenaltyPct / 100);
      if (!cents(penalty)) continue;
      postLedger(l, 'penalties', penalty, `Late penalty on instalment ${r.no}`, null, ref);
      run(`UPDATE loans SET penalties=? WHERE id=?`, money(cents(l.penalties) + total * 100 + cents(penalty)) / 100, loanId);
      total = money(total + penalty);
    }
    return total;
  });
}
