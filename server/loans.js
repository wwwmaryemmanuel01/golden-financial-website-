/* Loan products, calculator, eligibility, applications (automated pipeline),
   agreements, disbursement, live balances, schedules and loan requests.
   Balances update automatically after verified repayments. */
import { q, q1, run, tx, nextSeq, audit, activity, json } from './db.js';
import { HttpError } from './http.js';
import { clean, cleanNum } from './security.js';
import { notify } from './notifications.js';
import { requireAuth, publicUser } from './auth.js';
import GFS from '../shared/core.mjs';

const r2 = GFS.round2;
const today = () => new Date().toISOString().slice(0, 10);

/* ---------------- public: calculator & eligibility ---------------- */
export async function calculator(ctx) {
  const b = { ...Object.fromEntries(ctx.url.searchParams), ...ctx.body };
  const product = GFS.productById(b.productId || b.product) || GFS.PRODUCTS[0];
  const amount = Math.max(0, cleanNum(b.amount, product.min));
  const term = Number(b.term || b.termMonths || product.terms[0]);
  const freq = ['monthly', 'fortnightly', 'weekly', 'daily'].includes(b.freq) ? b.freq : product.freqs[0];
  const rate = b.rate !== undefined && b.rate !== '' ? cleanNum(b.rate, product.rate) : product.rate;
  const feePct = b.feePct !== undefined && b.feePct !== '' ? cleanNum(b.feePct, product.fee) : product.fee;
  const startDate = b.startDate ? new Date(b.startDate) : new Date();
  const schedule = GFS.amortize({ amount, monthlyPct: rate, termMonths: term, freq, feePct, startDate });
  return { product: { id: product.id, name: product.name, rate: product.rate, fee: product.fee }, inputs: { amount, term, freq, rate, feePct, startDate: GFS.iso(startDate) }, schedule };
}

export async function eligibility(ctx) {
  const b = ctx.body;
  const u = ctx.user;
  const product = GFS.productById(b.productId || b.product);
  if (!product) throw new HttpError(400, 'Choose a loan product.');
  const income = cleanNum(b.income ?? (u ? u.monthly_income : 0));
  const expenses = cleanNum(b.expenses ?? (u ? u.monthly_expenses : 0));
  let activeLoans = 0, exposure = 0, obligations = 0;
  if (u) {
    const ls = q(`SELECT * FROM loans WHERE customer_id = ? AND status = 'active'`, u.id);
    activeLoans = ls.length;
    exposure = ls.reduce((s, l) => s + l.outstanding_principal, 0);
    obligations = ls.reduce((s, l) => s + (l.installment * (GFS.RULES.periodsPerYear[l.freq] || 12) / 12), 0);
  }
  const guarantors = cleanNum(b.guarantors, product.guarantors);
  const collateralValue = cleanNum(b.collateralValue, 0);
  const age = b.dob ? Math.floor((Date.now() - new Date(b.dob)) / 31557600000) : (u && u.dob ? Math.floor((Date.now() - new Date(u.dob)) / 31557600000) : 30);
  const result = GFS.assess({
    product, amount: cleanNum(b.amount, product.min), termMonths: Number(b.term || product.terms[0]),
    freq: b.freq || product.freqs[0], income, expenses, existingObligations: obligations,
    activeLoans, exposure, age, kycVerified: u ? u.kyc_status === 'verified' : !!b.kycVerified,
    guarantors, collateralValue
  });
  return { product: { id: product.id, name: product.name }, ...result };
}

/* ---------------- application pipeline ---------------- */
function pushTimeline(app, stage, note) {
  const tl = json(app.timeline, []);
  tl.push({ stage, note, at: new Date().toISOString() });
  run(`UPDATE applications SET timeline = ?, updated_at = datetime('now') WHERE id = ?`, JSON.stringify(tl), app.id);
  return tl;
}

function customerContext(u) {
  const ls = q(`SELECT * FROM loans WHERE customer_id = ? AND status = 'active'`, u.id);
  return {
    activeLoans: ls.length,
    exposure: ls.reduce((s, l) => s + l.outstanding_principal, 0),
    obligations: ls.reduce((s, l) => s + l.installment * (GFS.RULES.periodsPerYear[l.freq] || 12) / 12, 0)
  };
}

export function runPipeline(appId) {
  const app = q1(`SELECT * FROM applications WHERE id = ?`, appId);
  const u = q1(`SELECT * FROM customers WHERE id = ?`, app.customer_id);
  const product = GFS.productById(app.product_id);
  const cc = customerContext(u);
  const docs = q(`SELECT * FROM documents WHERE customer_id = ? AND (application_id = ? OR application_id IS NULL)`, u.id, app.id);
  const idDoc = docs.find(d => ['national_id', 'passport', 'driving_licence'].includes(d.kind));
  const incomeDoc = docs.find(d => ['payslip', 'bank_statement', 'business_statement'].includes(d.kind));
  const guarantors = q(`SELECT * FROM guarantors WHERE application_id = ?`, app.id);
  const collateral = q(`SELECT * FROM collateral WHERE application_id = ?`, app.id);
  const collateralValue = collateral.reduce((s, c) => s + (c.estimated_value || 0), 0);

  pushTimeline(app, 'intake', `Application ${app.ref} received. Automated review started.`);
  run(`UPDATE applications SET status = 'under_review', stage = 'verification' WHERE id = ?`, app.id);
  pushTimeline(app, 'verification', 'Checking identity, contact and documents.');

  const missing = [];
  if (!u.phone_verified) missing.push('phone verification');
  if (!u.email_verified) missing.push('email verification');
  if (!idDoc) missing.push('identity document (national ID, passport or driving licence)');
  if (!incomeDoc && product.id !== 'GL') missing.push('proof of income (payslip or bank statement)');

  pushTimeline(app, 'credit_assessment', 'Computing affordability, exposure and credit score.');
  const age = u.dob ? Math.floor((Date.now() - new Date(u.dob)) / 31557600000) : 30;
  const assessment = GFS.assess({
    product, amount: app.amount, termMonths: app.term_months, freq: app.freq,
    income: app.income || u.monthly_income, expenses: app.expenses || u.monthly_expenses,
    existingObligations: cc.obligations, activeLoans: cc.activeLoans, exposure: cc.exposure,
    age, kycVerified: u.kyc_status === 'verified',
    guarantors: guarantors.filter(g => g.consent).length, collateralValue
  });

  pushTimeline(app, 'guarantor_verification', `${guarantors.filter(g => g.consent).length} of ${product.guarantors} required guarantor consent(s) on file.`);
  if (product.collateral && app.amount > 2000000) pushTimeline(app, 'collateral_verification', `Collateral valued at ${GFS.mk(collateralValue)} against required ${GFS.mk(app.amount * 0.8)}.`);

  run(`UPDATE applications SET assessment = ? WHERE id = ?`, JSON.stringify(assessment), app.id);

  if (missing.length) {
    run(`UPDATE applications SET status = 'pending_documents', stage = 'verification', decision_reason = ? WHERE id = ?`,
      'Additional documents required: ' + missing.join('; ') + '.', app.id);
    pushTimeline(app, 'decision', 'Paused — additional documents required.');
    notify(u.id, { category: 'application', title: 'Action needed on your application', body: `Application ${app.ref} needs: ${missing.join('; ')}. Upload them in your portal to continue the review.`, channels: ['inapp', 'sms', 'email'], meta: { applicationRef: app.ref } });
    return q1(`SELECT * FROM applications WHERE id = ?`, app.id);
  }

  if (!assessment.eligible) {
    run(`UPDATE applications SET status = 'rejected', stage = 'decision', decision_reason = ? WHERE id = ?`, assessment.reasons.join(' '), app.id);
    pushTimeline(app, 'decision', 'Declined: ' + assessment.reasons.join(' '));
    notify(u.id, { category: 'application', title: 'Application decision', body: `Application ${app.ref} was not approved. Reason: ${assessment.reasons[0]} You may adjust the amount or term and apply again.`, channels: ['inapp', 'sms', 'email'], meta: { applicationRef: app.ref } });
    audit('system', null, 'application.rejected', 'application', app.id, null, { reasons: assessment.reasons }, null, null);
    return q1(`SELECT * FROM applications WHERE id = ?`, app.id);
  }

  // Approved — build the offer
  const quote = assessment.quote;
  const offer = {
    amount: app.amount, rate: product.rate, feePct: product.fee, fee: quote.fee,
    termMonths: app.term_months, freq: app.freq, installment: quote.installment,
    monthlyEquivalent: quote.equivalents.monthly, totalInterest: quote.totalInterest,
    totalRepayable: quote.totalRepayable, netDisbursement: quote.netDisbursement,
    startDate: quote.startDate, endDate: quote.endDate,
    validUntil: GFS.iso(GFS.addDays(new Date(), 14)),
    score: assessment.score, risk: assessment.risk
  };
  run(`UPDATE applications SET status = 'approved', stage = 'offer', offer = ?, decision_reason = ? WHERE id = ?`,
    JSON.stringify(offer), `Approved. Credit score ${assessment.score}/100 (${assessment.risk} risk).`, app.id);
  pushTimeline(app, 'decision', `Approved — score ${assessment.score}/100, ${assessment.risk} risk.`);
  pushTimeline(app, 'offer', `Offer issued: ${GFS.mk(app.amount)} over ${app.term_months} months at ${product.rate}%/month. Accept the agreement to receive funds.`);
  run(`UPDATE customers SET kyc_status = 'verified' WHERE id = ? AND kyc_status != 'verified'`, u.id);
  notify(u.id, { category: 'application', title: 'Loan approved 🎉', body: `Congratulations! Application ${app.ref} is approved for ${GFS.mk(app.amount)}. Review and accept your loan agreement in the portal to receive disbursement. Offer valid until ${offer.validUntil}.`, channels: ['inapp', 'sms', 'email'], meta: { applicationRef: app.ref } });
  audit('system', null, 'application.approved', 'application', app.id, null, { offer }, null, null);
  return q1(`SELECT * FROM applications WHERE id = ?`, app.id);
}

export async function submitApplication(ctx) {
  const u = requireAuth(ctx);
  const b = ctx.body;
  const product = GFS.productById(b.productId || b.product);
  if (!product) throw new HttpError(400, 'Choose a valid loan product.');
  const amount = cleanNum(b.amount);
  const term = Number(b.term || b.termMonths);
  const freq = product.freqs.includes(b.freq) ? b.freq : product.freqs[0];
  if (amount < product.min || amount > product.max) throw new HttpError(400, `Amount must be between ${GFS.mk(product.min)} and ${GFS.mk(product.max)}.`);
  if (!product.terms.includes(term)) throw new HttpError(400, `Choose a standard term: ${product.terms.join(', ')} months.`);
  if (!clean(b.purpose, 500)) throw new HttpError(400, 'Tell us what the loan is for.');
  if (!b.acceptTerms) throw new HttpError(400, 'You must accept the loan agreement terms to apply.');
  const method = ['mpamba', 'airtel', 'bank'].includes(b.disbursementMethod) ? b.disbursementMethod : 'mpamba';
  const account = clean(b.disbursementAccount || u.phone, 60);
  const ref = GFS.refs.application(nextSeq('application'));
  const appId = tx(() => {
    const r = run(`INSERT INTO applications(ref, customer_id, product_id, amount, term_months, freq, purpose, income, expenses, disbursement_method, disbursement_account)
      VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
      ref, u.id, product.id, amount, term, freq, clean(b.purpose, 500),
      cleanNum(b.income, u.monthly_income), cleanNum(b.expenses, u.monthly_expenses), method, account);
    const id = Number(r.lastInsertRowid);
    // guarantors submitted with the application
    const gs = Array.isArray(b.guarantors) ? b.guarantors.slice(0, 3) : [];
    for (const g of gs) {
      if (!g.name || !g.phone) continue;
      run(`INSERT INTO guarantors(customer_id, application_id, name, phone, relationship, employer, address, consent, consent_at, status)
        VALUES(?,?,?,?,?,?,?,?,datetime('now'),?)`,
        u.id, id, clean(g.name, 80), GFS.normPhone(g.phone), clean(g.relationship, 40), clean(g.employer, 80), clean(g.address, 120),
        g.consent ? 1 : 0, g.consent ? 'verified' : 'pending');
    }
    if (b.collateral && b.collateral.type) {
      run(`INSERT INTO collateral(customer_id, application_id, type, description, estimated_value, status) VALUES(?,?,?,?,?,?)`,
        u.id, id, clean(b.collateral.type, 40), clean(b.collateral.description, 300), cleanNum(b.collateral.value), 'pending');
    }
    return id;
  });
  activity(u.id, 'Loan application submitted', `${ref} · ${product.name} · ${GFS.mk(amount)}`, ctx.ip, ctx.ua);
  audit('customer', u.id, 'application.submitted', 'application', appId, null, { ref, product: product.id, amount, term }, ctx.ip, ctx.ua);
  notify(u.id, { category: 'application', title: 'Application received', body: `We received your ${product.name} application ${ref} for ${GFS.mk(amount)}. Track its progress in your portal — reference ${ref}.`, channels: ['inapp', 'sms', 'email'], meta: { applicationRef: ref } });
  const app = runPipeline(appId);
  return { application: serializeApp(app), reference: ref };
}

export function serializeApp(a) {
  if (!a) return null;
  const product = GFS.productById(a.product_id);
  return {
    id: a.id, ref: a.ref, productId: a.product_id, productName: product ? product.name : a.product_id,
    amount: a.amount, termMonths: a.term_months, freq: a.freq, purpose: a.purpose,
    status: a.status, stage: a.stage, decisionReason: a.decision_reason,
    assessment: json(a.assessment), offer: json(a.offer, null),
    income: a.income, expenses: a.expenses,
    agreementAcceptedAt: a.agreement_accepted_at, agreementSignature: a.agreement_signature ? true : false,
    disbursementMethod: a.disbursement_method, disbursementAccount: a.disbursement_account,
    timeline: json(a.timeline, []), createdAt: a.created_at, updatedAt: a.updated_at,
    guarantors: q(`SELECT id, name, phone, relationship, employer, consent, status FROM guarantors WHERE application_id = ?`, a.id),
    collateral: q(`SELECT id, type, description, estimated_value, status FROM collateral WHERE application_id = ?`, a.id),
    documents: q(`SELECT id, ref, kind, filename, status, uploaded_at FROM documents WHERE application_id = ?`, a.id)
  };
}

export async function listApplications(ctx) {
  const u = requireAuth(ctx);
  return { applications: q(`SELECT * FROM applications WHERE customer_id = ? ORDER BY id DESC`, u.id).map(serializeApp) };
}
export async function getApplication(ctx) {
  const u = requireAuth(ctx);
  const a = q1(`SELECT * FROM applications WHERE id = ? AND customer_id = ?`, Number(ctx.params.id), u.id);
  if (!a) throw new HttpError(404, 'Application not found.');
  return { application: serializeApp(a) };
}
export async function rerunAssessment(ctx) {
  const u = requireAuth(ctx);
  const a = q1(`SELECT * FROM applications WHERE id = ? AND customer_id = ?`, Number(ctx.params.id), u.id);
  if (!a) throw new HttpError(404, 'Application not found.');
  if (!['pending_documents', 'rejected'].includes(a.status)) throw new HttpError(400, 'This application cannot be re-assessed right now.');
  const updated = runPipeline(a.id);
  audit('customer', u.id, 'application.reassessed', 'application', a.id, null, null, ctx.ip, ctx.ua);
  return { application: serializeApp(updated) };
}
export async function cancelApplication(ctx) {
  const u = requireAuth(ctx);
  const a = q1(`SELECT * FROM applications WHERE id = ? AND customer_id = ?`, Number(ctx.params.id), u.id);
  if (!a) throw new HttpError(404, 'Application not found.');
  if (['disbursed', 'closed'].includes(a.status)) throw new HttpError(400, 'This application has already been disbursed.');
  run(`UPDATE applications SET status = 'cancelled', stage = 'closed', decision_reason = 'Cancelled by customer.', updated_at = datetime('now') WHERE id = ?`, a.id);
  pushTimeline(a, 'closed', 'Cancelled by customer.');
  notify(u.id, { category: 'application', title: 'Application cancelled', body: `Application ${a.ref} was cancelled at your request.`, channels: ['inapp', 'sms'] });
  audit('customer', u.id, 'application.cancelled', 'application', a.id, null, null, ctx.ip, ctx.ua);
  return { application: serializeApp(q1(`SELECT * FROM applications WHERE id = ?`, a.id)) };
}

/* ---------------- agreement acceptance + disbursement ---------------- */
export async function acceptAgreement(ctx) {
  const u = requireAuth(ctx);
  const b = ctx.body;
  const a = q1(`SELECT * FROM applications WHERE id = ? AND customer_id = ?`, Number(ctx.params.id), u.id);
  if (!a) throw new HttpError(404, 'Application not found.');
  if (a.status !== 'approved') throw new HttpError(400, 'Only approved offers can be accepted.');
  const offer = json(a.offer, null);
  if (!offer) throw new HttpError(400, 'No offer on file.');
  if (new Date(offer.validUntil) < new Date()) throw new HttpError(400, 'This offer has expired. Request a re-assessment.');
  if (!b.accept) throw new HttpError(400, 'Tick the acceptance box to confirm.');
  const name = clean(b.name, 80);
  if (name.toLowerCase() !== `${u.first_name} ${u.last_name}`.toLowerCase()) throw new HttpError(400, 'Type your full name exactly as registered to sign.');
  if (!clean(b.idNumber, 40)) throw new HttpError(400, 'Enter your ID number to sign.');
  if (!b.signature || String(b.signature).length < 3) throw new HttpError(400, 'Provide your signature (draw or type).');
  const product = GFS.productById(a.product_id);

  const result = tx(() => {
    run(`UPDATE applications SET agreement_accepted_at = datetime('now'), agreement_signature = ?, agreement_name = ?, agreement_id_number = ?, status = 'disbursed', stage = 'complete', updated_at = datetime('now') WHERE id = ?`,
      String(b.signature).slice(0, 8000), name, clean(b.idNumber, 40), a.id);
    // create the loan
    const loanRef = GFS.refs.loan(nextSeq('loan'));
    const sched = GFS.amortize({ amount: a.amount, monthlyPct: product.rate, termMonths: a.term_months, freq: a.freq, feePct: product.fee, startDate: new Date() });
    const lr = run(`INSERT INTO loans(ref, customer_id, application_id, product_id, principal, rate_monthly, fee_pct, fee_amount, term_months, freq, installment,
      status, disbursed_at, disbursement_ref, disbursement_method, net_disbursed, outstanding_principal, future_interest, next_due_date, next_due_amount)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'),?,?,?,?,?,?,?)`,
      loanRef, u.id, a.id, product.id, a.amount, product.rate, product.fee, sched.fee, a.term_months, a.freq, sched.installment,
      'active', GFS.refs.disbursement(), a.disbursement_method, sched.netDisbursement, a.amount, sched.totalInterest,
      sched.rows[0].dueDate, sched.rows[0].installment);
    const loanId = Number(lr.lastInsertRowid);
    for (const row of sched.rows) {
      run(`INSERT INTO schedule(loan_id, no, due_date, opening, installment, principal_part, interest_part, closing) VALUES(?,?,?,?,?,?,?,?)`,
        loanId, row.no, row.dueDate, row.opening, row.installment, row.principal, row.interest, row.closing);
    }
    // link guarantors & collateral to the loan
    run(`UPDATE guarantors SET loan_id = ?, status = 'verified' WHERE application_id = ?`, loanId, a.id);
    run(`UPDATE collateral SET loan_id = ?, status = 'verified' WHERE application_id = ?`, loanId, a.id);
    // disbursement transaction (verified — simulated provider rail)
    const disRef = GFS.refs.transaction();
    run(`INSERT INTO transactions(ref, customer_id, loan_id, type, method, provider, amount, status, verified_at, meta)
      VALUES(?,?,?,?,?,?,?,?,datetime('now'),?)`,
      disRef, u.id, loanId, 'disbursement', a.disbursement_method, providerName(a.disbursement_method), sched.netDisbursement, 'verified',
      JSON.stringify({ gross: a.amount, fee: sched.fee, loanRef }));
    // arrangement fee record
    run(`INSERT INTO transactions(ref, customer_id, loan_id, type, amount, status, verified_at, meta) VALUES(?,?,?,?,?,?,datetime('now'),?)`,
      GFS.refs.transaction(), u.id, loanId, 'fee', sched.fee, 'verified', JSON.stringify({ kind: 'arrangement', loanRef }));
    return { loanId, loanRef, sched };
  });
  pushTimeline(a, 'agreement', `Agreement signed electronically by ${name}.`);
  pushTimeline(a, 'disbursement', `${GFS.mk(result.sched.netDisbursement)} sent via ${providerName(a.disbursement_method)} (fee ${GFS.mk(result.sched.fee)} deducted). Loan ${result.loanRef} is active.`);
  recomputeLoan(result.loanId);
  notify(u.id, { category: 'disbursement', title: 'Loan disbursed 💰', body: `${GFS.mk(result.sched.netDisbursement)} has been sent to your ${providerName(a.disbursement_method)} account. Loan ${result.loanRef}: first instalment ${GFS.mk(result.sched.installment)} due ${result.sched.rows[0].dueDate}. Your repayment schedule is in the portal.`, channels: ['inapp', 'sms', 'email'], meta: { loanRef: result.loanRef } });
  audit('customer', u.id, 'agreement.accepted', 'application', a.id, null, { loanRef: result.loanRef }, ctx.ip, ctx.ua);
  audit('system', null, 'loan.disbursed', 'loan', result.loanId, null, { ref: result.loanRef, net: result.sched.netDisbursement }, null, null);
  activity(u.id, 'Loan agreement signed & disbursed', result.loanRef, ctx.ip, ctx.ua);
  return { application: serializeApp(q1(`SELECT * FROM applications WHERE id = ?`, a.id)), loan: serializeLoan(q1(`SELECT * FROM loans WHERE id = ?`, result.loanId)) };
}
const providerName = id => (GFS.PAYMENT_METHODS.find(m => m.id === id) || {}).name || id;

/* ---------------- loan balances ---------------- */
export function recomputeLoan(loanId) {
  const rows = q(`SELECT * FROM schedule WHERE loan_id = ? ORDER BY no`, loanId);
  const t = today();
  let outPrincipal = 0, accrued = 0, future = 0;
  let nextDate = null, nextAmount = null;
  for (const r of rows) {
    const paidPrincipal = Math.max(0, Math.min(r.principal_part, r.paid - r.interest_part));
    const unpaidPrincipal = r2(r.principal_part - paidPrincipal);
    const unpaidInterest = r2(r.interest_part - Math.min(r.paid, r.interest_part));
    outPrincipal = r2(outPrincipal + unpaidPrincipal);
    if (r.due_date <= t) accrued = r2(accrued + unpaidInterest); else future = r2(future + unpaidInterest);
    if (r.paid < r.installment - 0.005 && !nextDate) { nextDate = r.due_date; nextAmount = r2(r.installment - r.paid); }
  }
  const l = q1(`SELECT * FROM loans WHERE id = ?`, loanId);
  const status = outPrincipal <= 0.005 && l.penalties <= 0.005 && l.fees_outstanding <= 0.005 ? 'closed' : l.status === 'closed' ? 'closed' : 'active';
  run(`UPDATE loans SET outstanding_principal = ?, accrued_interest = ?, future_interest = ?, next_due_date = ?, next_due_amount = ?,
       status = ?, closed_at = ${status === 'closed' ? "COALESCE(closed_at, datetime('now'))" : 'NULL'}, updated_at = datetime('now') WHERE id = ?`,
    outPrincipal, accrued, future, nextDate, nextAmount, status, loanId);
  if (status === 'closed' && l.status !== 'closed') {
    run(`UPDATE collateral SET status = 'released', released_at = datetime('now') WHERE loan_id = ?`, loanId);
    const loan = q1(`SELECT * FROM loans WHERE id = ?`, loanId);
    notify(loan.customer_id, { category: 'settlement', title: 'Loan fully settled 🎉', body: `Congratulations! Loan ${loan.ref} is fully repaid. Any security has been released and a settlement confirmation is in your records. Thank you for borrowing with Golden Financial Services.`, channels: ['inapp', 'sms', 'email'] });
    audit('system', null, 'loan.closed', 'loan', loanId, null, null, null, null);
  }
  return q1(`SELECT * FROM loans WHERE id = ?`, loanId);
}

/* Apply a verified repayment: penalties → fees → schedule rows → advance credit. */
export function applyRepayment(loanId, amount, txnRef) {
  return tx(() => {
    let l = q1(`SELECT * FROM loans WHERE id = ?`, loanId);
    let left = r2(amount);
    const alloc = { penalties: 0, fees: 0, interest: 0, principal: 0, advance: 0 };
    const takePen = Math.min(left, l.penalties); alloc.penalties = r2(takePen); left = r2(left - takePen);
    const takeFee = Math.min(left, l.fees_outstanding); alloc.fees = r2(takeFee); left = r2(left - takeFee);
    run(`UPDATE loans SET penalties = penalties - ?, fees_outstanding = fees_outstanding - ?, total_penalties_paid = total_penalties_paid + ?, total_fees_paid = total_fees_paid + ? WHERE id = ?`,
      alloc.penalties, alloc.fees, alloc.penalties, alloc.fees, loanId);
    const rows = q(`SELECT * FROM schedule WHERE loan_id = ? AND paid < installment - 0.005 ORDER BY no`, loanId);
    for (const r of rows) {
      if (left <= 0) break;
      const need = r2(r.installment - r.paid);
      const take = Math.min(left, need);
      const intPart = Math.min(take, r2(r.interest_part - Math.min(r.paid, r.interest_part)));
      const prinPart = r2(take - intPart);
      alloc.interest = r2(alloc.interest + intPart);
      alloc.principal = r2(alloc.principal + prinPart);
      const newPaid = r2(r.paid + take);
      run(`UPDATE schedule SET paid = ?, status = ?, paid_at = ${newPaid >= r.installment - 0.005 ? "datetime('now')" : 'paid_at'} WHERE id = ?`,
        newPaid, newPaid >= r.installment - 0.005 ? 'paid' : 'partial', r.id);
      left = r2(left - take);
    }
    if (left > 0) { alloc.advance = left; run(`UPDATE loans SET credit_balance = credit_balance + ? WHERE id = ?`, left, loanId); }
    run(`UPDATE loans SET total_repaid = total_repaid + ?, total_interest_paid = total_interest_paid + ? WHERE id = ?`, r2(amount), alloc.interest, loanId);
    l = recomputeLoan(loanId);
    return { allocation: alloc, loan: l };
  });
}

/* Full early settlement: penalties + fees + due interest + all principal; future interest waived. */
export function settleLoan(loanId, amount) {
  return tx(() => {
    const l = q1(`SELECT * FROM loans WHERE id = ?`, loanId);
    let left = r2(amount);
    const alloc = { penalties: 0, fees: 0, interest: 0, principal: 0, advance: 0 };
    const takePen = Math.min(left, l.penalties); alloc.penalties = r2(takePen); left = r2(left - takePen);
    const takeFee = Math.min(left, l.fees_outstanding); alloc.fees = r2(takeFee); left = r2(left - takeFee);
    run(`UPDATE loans SET penalties = penalties - ?, fees_outstanding = fees_outstanding - ?, total_penalties_paid = total_penalties_paid + ?, total_fees_paid = total_fees_paid + ? WHERE id = ?`, alloc.penalties, alloc.fees, alloc.penalties, alloc.fees, loanId);
    const t = today();
    const rows = q(`SELECT * FROM schedule WHERE loan_id = ? ORDER BY no`, loanId);
    for (const r of rows) {
      if (left <= 0) break;
      const unpaidInt = r.due_date <= t ? r2(r.interest_part - Math.min(r.paid, r.interest_part)) : 0;
      const paidPrincipal = Math.max(0, Math.min(r.principal_part, r.paid - r.interest_part));
      const unpaidPrin = r2(r.principal_part - paidPrincipal);
      const need = r2(unpaidInt + unpaidPrin);
      const take = Math.min(left, need);
      const intPart = Math.min(take, unpaidInt);
      const prinPart = r2(take - intPart);
      alloc.interest = r2(alloc.interest + intPart); alloc.principal = r2(alloc.principal + prinPart);
      run(`UPDATE schedule SET paid = installment, status = 'paid', paid_at = datetime('now') WHERE id = ?`, r.id);
      left = r2(left - take);
    }
    if (left > 0) { alloc.advance = left; run(`UPDATE loans SET credit_balance = credit_balance + ? WHERE id = ?`, left, loanId); }
    run(`UPDATE loans SET total_repaid = total_repaid + ?, total_interest_paid = total_interest_paid + ? WHERE id = ?`, r2(amount), alloc.interest, loanId);
    const updated = recomputeLoan(loanId);
    return { allocation: alloc, loan: updated };
  });
}

/* ---------------- loan views ---------------- */
export function serializeLoan(l) {
  if (!l) return null;
  const product = GFS.productById(l.product_id);
  const rows = q(`SELECT * FROM schedule WHERE loan_id = ? ORDER BY no`, l.id);
  const paidCount = rows.filter(r => r.status === 'paid').length;
  return {
    id: l.id, ref: l.ref, productId: l.product_id, productName: product ? product.name : l.product_id,
    principal: l.principal, rateMonthly: l.rate_monthly, feePct: l.fee_pct, feeAmount: l.fee_amount,
    termMonths: l.term_months, freq: l.freq, installment: l.installment, status: l.status,
    disbursedAt: l.disbursed_at, disbursementRef: l.disbursement_ref, disbursementMethod: l.disbursement_method, netDisbursed: l.net_disbursed,
    outstandingPrincipal: l.outstanding_principal, accruedInterest: l.accrued_interest, feesOutstanding: l.fees_outstanding,
    penalties: l.penalties, creditBalance: l.credit_balance,
    outstanding: r2(l.outstanding_principal + l.accrued_interest + l.fees_outstanding + l.penalties),
    totalRepaid: l.total_repaid, totalInterestPaid: l.total_interest_paid, totalFeesPaid: l.total_fees_paid, totalPenaltiesPaid: l.total_penalties_paid,
    nextDueDate: l.next_due_date, nextDueAmount: l.next_due_amount, futureInterest: l.future_interest,
    closedAt: l.closed_at, createdAt: l.created_at,
    progress: rows.length ? Math.round(paidCount / rows.length * 100) : 0,
    installmentsPaid: paidCount, installmentsTotal: rows.length,
    schedule: rows.map(r => ({ no: r.no, dueDate: r.due_date, opening: r.opening, installment: r.installment, principal: r.principal_part, interest: r.interest_part, closing: r.closing, paid: r.paid, status: r.status, paidAt: r.paid_at })),
    settlement: GFS.settlementQuote(l)
  };
}
export async function listLoans(ctx) {
  const u = requireAuth(ctx);
  return { loans: q(`SELECT * FROM loans WHERE customer_id = ? ORDER BY id DESC`, u.id).map(serializeLoan) };
}
export async function getLoan(ctx) {
  const u = requireAuth(ctx);
  const l = q1(`SELECT * FROM loans WHERE id = ? AND customer_id = ?`, Number(ctx.params.id), u.id);
  if (!l) throw new HttpError(404, 'Loan not found.');
  const txns = q(`SELECT * FROM transactions WHERE loan_id = ? AND customer_id = ? ORDER BY id DESC`, l.id, u.id).map(serializeTxn);
  return { loan: serializeLoan(l), transactions: txns };
}
export function serializeTxn(t) {
  return {
    id: t.id, ref: t.ref, loanId: t.loan_id, type: t.type, method: t.method, provider: t.provider, providerRef: t.provider_ref,
    amount: t.amount, allocation: json(t.allocation), status: t.status, receiptId: t.receipt_id,
    failureReason: t.failure_reason, meta: json(t.meta), createdAt: t.created_at, verifiedAt: t.verified_at
  };
}

/* ---------------- dashboard ---------------- */
export async function dashboard(ctx) {
  const u = requireAuth(ctx);
  const loans = q(`SELECT * FROM loans WHERE customer_id = ?`, u.id);
  const active = loans.filter(l => l.status === 'active');
  const apps = q(`SELECT * FROM applications WHERE customer_id = ? ORDER BY id DESC`, u.id);
  const totalBorrowed = loans.reduce((s, l) => s + l.principal, 0);
  const outstanding = active.reduce((s, l) => s + l.outstanding_principal + l.accrued_interest + l.fees_outstanding + l.penalties, 0);
  const totalRepaid = loans.reduce((s, l) => s + l.total_repaid, 0);
  const next = active.filter(l => l.next_due_date).sort((a, b) => a.next_due_date.localeCompare(b.next_due_date))[0];
  const recentTx = q(`SELECT * FROM transactions WHERE customer_id = ? ORDER BY id DESC LIMIT 8`, u.id).map(serializeTxn);
  const unread = q1(`SELECT COUNT(*) n FROM notifications WHERE customer_id = ? AND channel = 'inapp' AND read_at IS NULL`, u.id).n;
  const kycDocs = q(`SELECT kind, status FROM documents WHERE customer_id = ?`, u.id);
  return {
    user: publicUser(u),
    stats: {
      totalBorrowed: r2(totalBorrowed), activeLoans: active.length, outstanding: r2(outstanding), totalRepaid: r2(totalRepaid),
      nextRepaymentAmount: next ? next.next_due_amount : null, nextRepaymentDate: next ? next.next_due_date : null,
      nextRepaymentLoan: next ? next.ref : null,
      pendingApplications: apps.filter(a => ['submitted', 'under_review', 'pending_documents'].includes(a.status)).length,
      approvedApplications: apps.filter(a => a.status === 'approved').length,
      rejectedApplications: apps.filter(a => a.status === 'rejected').length,
      unreadNotifications: unread
    },
    loans: active.map(serializeLoan),
    applications: apps.slice(0, 5).map(serializeApp),
    recentTransactions: recentTx,
    kyc: { status: u.kyc_status, emailVerified: !!u.email_verified, phoneVerified: !!u.phone_verified, documents: kycDocs },
    announcements: q(`SELECT * FROM announcements ORDER BY pinned DESC, id DESC LIMIT 5`)
  };
}

/* ---------------- loan requests: settlement / top-up / renewal / restructure ---------------- */
export async function createRequest(ctx) {
  const u = requireAuth(ctx);
  const b = ctx.body;
  const type = ['settlement', 'topup', 'renewal', 'restructure', 'refinance', 'cancel'].includes(b.type) ? b.type : null;
  if (!type) throw new HttpError(400, 'Unknown request type.');
  let loan = null;
  if (b.loanId) {
    loan = q1(`SELECT * FROM loans WHERE id = ? AND customer_id = ?`, Number(b.loanId), u.id);
    if (!loan) throw new HttpError(404, 'Loan not found.');
  }
  if (['settlement', 'topup', 'restructure', 'refinance'].includes(type) && !loan) throw new HttpError(400, 'Choose a loan.');
  const ref = GFS.refs.request(nextSeq('request'));
  let response = null, status = 'pending', payload = b.payload || {};
  if (type === 'settlement') {
    const quote = GFS.settlementQuote(loan);
    payload = { ...payload, quote };
    response = `Settlement statement ${ref}: pay ${GFS.mk(quote.total)} to settle ${loan.ref} in full. Future interest of ${GFS.mk(quote.futureInterest)} is waived. Use “Settle loan” on the loan page to pay this amount now.`;
    status = 'approved';
  } else if (type === 'topup') {
    if (loan.status !== 'active') throw new HttpError(400, 'Only active loans can be topped up.');
    if (loan.penalties > 0) throw new HttpError(400, 'Clear overdue penalties before requesting a top-up.');
    const product = GFS.productById(loan.product_id);
    const maxTop = Math.max(0, Math.min(product.max - loan.principal, loan.principal * 0.5));
    const amount = Math.min(cleanNum(b.amount, maxTop), maxTop);
    if (amount < product.min * 0.2) throw new HttpError(400, `Top-up available is below the minimum. Maximum top-up now: ${GFS.mk(maxTop)}.`);
    payload = { ...payload, amount, maxTop, baseLoan: loan.ref };
    response = `Top-up of ${GFS.mk(amount)} pre-assessed against ${loan.ref}. Submit the pre-filled application to complete credit checks.`;
    status = 'approved';
  } else if (type === 'renewal') {
    response = `Renewal noted for ${loan ? loan.ref : 'your loan'}. Once the current loan is settled, a renewal application at the same product terms will be fast-tracked.`;
    status = 'approved';
  } else if (type === 'restructure' || type === 'refinance') {
    const product = loan ? GFS.productById(loan.product_id) : GFS.PRODUCTS[0];
    const newTerm = Math.min((loan ? loan.term_months : 6) + 6, Math.max(...product.terms));
    const newInst = loan ? GFS.instalmentFor(loan.outstanding_principal, product.rate, newTerm, loan.freq) : 0;
    payload = { ...payload, proposedTerm: newTerm, proposedInstalment: newInst };
    response = `${type === 'restructure' ? 'Restructuring' : 'Refinancing'} proposal for ${loan.ref}: extend to ${newTerm} months, new instalment ≈ ${GFS.mk(newInst)}. A credit officer will confirm within 2 working days.`;
    status = 'under_review';
  }
  const id = tx(() => {
    const r = run(`INSERT INTO requests(ref, customer_id, loan_id, type, payload, status, response) VALUES(?,?,?,?,?,?,?)`,
      ref, u.id, loan ? loan.id : null, type, JSON.stringify(payload), status, response);
    return Number(r.lastInsertRowid);
  });
  notify(u.id, { category: 'request', title: `${type[0].toUpperCase() + type.slice(1)} request ${ref}`, body: response || 'Your request was received and is being reviewed.', channels: ['inapp', 'sms', 'email'] });
  audit('customer', u.id, `request.${type}`, 'request', id, null, { ref, loan: loan ? loan.ref : null }, ctx.ip, ctx.ua);
  return { request: { id, ref, type, status, response, payload, createdAt: new Date().toISOString() } };
}
export async function listRequests(ctx) {
  const u = requireAuth(ctx);
  return {
    requests: q(`SELECT r.*, l.ref loan_ref FROM requests r LEFT JOIN loans l ON l.id = r.loan_id WHERE r.customer_id = ? ORDER BY r.id DESC`, u.id)
      .map(r => ({ id: r.id, ref: r.ref, type: r.type, loanId: r.loan_id, loanRef: r.loan_ref, status: r.status, response: r.response, payload: json(r.payload), createdAt: r.created_at }))
  };
}
