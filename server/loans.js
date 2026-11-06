/* Customer loan lifecycle. No customer endpoint can approve an application,
   verify KYC, or move real money. Decisions arrive through the authenticated
   system connector; an explicitly enabled sandbox may simulate that workflow. */
import { q, q1, run, tx, nextSeq, audit, activity, json } from './db.js';
import { HttpError } from './http.js';
import { clean, cleanNum, sha256, encryptText } from './security.js';
import { DEMO_MODE } from './config.js';
import { notify } from './notifications.js';
import { requireAuth } from './auth.js';
import * as catalog from './catalog.js';
import { accrueInterest, applyRepayment, applyLatePenalty, recomputeLoan, settlementQuote, postLedger, dateOnly, cents, money } from './finance.js';
import { enqueue } from './events.js';
import GFS from '../shared/core.mjs';
export { applyRepayment, recomputeLoan, settlementQuote } from './finance.js';
const ageAt = dob => { const d = new Date(dob), n = new Date(); return n.getUTCFullYear() - d.getUTCFullYear() - (n.getUTCMonth() < d.getUTCMonth() || (n.getUTCMonth() === d.getUTCMonth() && n.getUTCDate() < d.getUTCDate()) ? 1 : 0); };
function customerContext(u) {
  const ls = q(`SELECT * FROM loans WHERE customer_id=? AND status='active'`, u.id);
  return { activeLoans: ls.length, exposure: ls.reduce((s, l) => s + l.outstanding_principal, 0), obligations: ls.reduce((s, l) => s + l.installment * catalog.rules().periodsPerYear[l.freq] / 12, 0) };
}
function assessmentFor(app, u, product) {
  const cc = customerContext(u);
  const guarantors = q(`SELECT * FROM guarantors WHERE application_id=? AND status='verified'`, app.id).length;
  const collateralValue = q(`SELECT COALESCE(SUM(valued_amount),0) v FROM collateral WHERE application_id=? AND status='verified'`, app.id).v;
  return GFS.assess({ product, amount: app.amount, termMonths: app.term_months, freq: app.freq, income: app.income || u.monthly_income, expenses: app.expenses || u.monthly_expenses,
    existingObligations: cc.obligations, activeLoans: cc.activeLoans, exposure: cc.exposure, age: u.dob ? ageAt(u.dob) : 30, kycVerified: u.kyc_status === 'verified', guarantors, collateralValue }, { rules: catalog.rules(), product });
}
export async function calculator(ctx) {
  const b = { ...Object.fromEntries(ctx.url.searchParams), ...ctx.body };
  const requestedProduct = b.productId || b.product;
  const p = requestedProduct ? catalog.product(requestedProduct) : catalog.products()[0];
  if (!p) throw new HttpError(400, 'This loan category is not available. Choose one of the five published products.');
  const amount = cleanNum(b.amount, p.min), term = Number(b.term || b.termMonths || p.terms[0]);
  const freq = b.freq || p.freqs[0];
  if (amount < p.min || amount > p.max || !p.terms.includes(term) || !p.freqs.includes(freq)) throw new HttpError(400, 'Choose an amount, term and frequency within this product’s published limits.');
  const schedule = GFS.amortize({ amount, monthlyPct: p.rate, termMonths: term, freq, feePct: p.fee });
  return { product: { id: p.id, name: p.name, rate: p.rate, fee: p.fee }, inputs: { amount, term, freq }, schedule, note: 'Illustrative scheduled-interest estimate. Actual interest accrues daily on unpaid principal; early repayment reduces future interest.' };
}
export async function eligibility(ctx) {
  const b = ctx.body, u = ctx.user, p = catalog.product(b.productId || b.product);
  if (!p) throw new HttpError(400, 'Choose a loan product.');
  const cc = u ? customerContext(u) : { activeLoans: 0, exposure: 0, obligations: cleanNum(b.existingObligations) };
  const income = cleanNum(b.income ?? u?.monthly_income), expenses = cleanNum(b.expenses ?? u?.monthly_expenses);
  const dob = b.dob || u?.dob;
  if (income < 0 || expenses < 0) throw new HttpError(400, 'Income and expenses cannot be negative.');
  const result = GFS.assess({ product: p, amount: cleanNum(b.amount, p.min), termMonths: Number(b.term || p.terms[0]), freq: b.freq || p.freqs[0], income, expenses,
    existingObligations: cc.obligations, activeLoans: cc.activeLoans, exposure: cc.exposure, age: dob ? ageAt(dob) : 30,
    kycVerified: u?.kyc_status === 'verified', guarantors: cleanNum(b.guarantors), collateralValue: cleanNum(b.collateralValue) }, { rules: catalog.rules(), product: p });
  return { product: { id: p.id, name: p.name }, ...result, preliminary: true };
}
function timeline(app, stage, note) {
  const entries = json(app.timeline, []); entries.push({ stage, note, at: new Date().toISOString() });
  run(`UPDATE applications SET timeline=?,updated_at=datetime('now') WHERE id=?`, JSON.stringify(entries), app.id);
}
export function runPipeline(appId, { source = 'sandbox' } = {}) {
  return tx(() => {
    const app = q1(`SELECT * FROM applications WHERE id=?`, appId);
    if (!app || !['submitted', 'pending_documents', 'under_review'].includes(app.status)) throw new HttpError(409, 'This application is not awaiting review.');
    const u = q1(`SELECT * FROM customers WHERE id=?`, app.customer_id), p = catalog.product(app.product_id);
    if (!p) throw new HttpError(409, 'This product has been retired. Contact support; the historical application is retained.');
    const docs = q(`SELECT * FROM documents WHERE customer_id=? AND (application_id=? OR application_id IS NULL)`, u.id, app.id);
    if (source === 'sandbox' && DEMO_MODE) {
      // Explicitly simulated review: never used in backend/production mode.
      run(`UPDATE documents SET status='verified',notes='Sandbox simulation only — no external identity check.',verified_at=datetime('now') WHERE customer_id=? AND status='pending'`, u.id);
      run(`UPDATE guarantors SET status='verified',consent_evidence='Sandbox customer assertion — not independently verified' WHERE application_id=? AND consent=1`, app.id);
      run(`UPDATE collateral SET status='verified',valued_amount=estimated_value,valued_by='Sandbox estimate',valuation_date=date('now') WHERE application_id=? AND status='awaiting_valuation'`, app.id);
      if (u.phone_verified && u.email_verified && docs.some(d => ['national_id','passport','driving_licence'].includes(d.kind))) { run(`UPDATE customers SET kyc_status='verified' WHERE id=?`, u.id); u.kyc_status = 'verified'; }
      audit('sandbox', null, 'application.simulated_review', 'application', app.id, null, { notice: 'No external identity, guarantor or valuation checks performed.' }, null, null);
    }
    const missing = [];
    if (!u.phone_verified) missing.push('phone verification');
    if (!u.email_verified) missing.push('email verification');
    if (!docs.some(d => ['national_id', 'passport', 'driving_licence'].includes(d.kind))) missing.push('identity document');
    if (!docs.some(d => ['payslip', 'bank_statement', 'business_statement'].includes(d.kind))) missing.push('proof of income');
    if (u.kyc_status !== 'verified') missing.push('independent identity verification');
    const assessment = assessmentFor(app, u, p);
    run(`UPDATE applications SET assessment=?,review_source=? WHERE id=?`, JSON.stringify(assessment), source, app.id);
    timeline(app, 'credit_assessment', `${source === 'sandbox' ? 'Sandbox' : 'System'} affordability check completed. Uploaded documents do not constitute verified identity.`);
    if (missing.length) {
      const reason = 'Still required: ' + missing.join('; ') + '.';
      run(`UPDATE applications SET status='pending_documents',stage='verification',decision_reason=? WHERE id=?`, reason, app.id);
      timeline(app, 'verification', reason);
      notify(u.id, { category: 'application', title: 'Action needed on your application', body: `${app.ref}: ${reason}`, meta: { applicationId: app.id } });
    } else if (!assessment.eligible) {
      decideApplication(app.id, { approved: false, reason: assessment.reasons.join(' '), source });
    } else if (source === 'sandbox' && DEMO_MODE) {
      decideApplication(app.id, { approved: true, reason: 'Sandbox demonstration approval only. No real credit decision or funds transfer.', source });
    } else {
      run(`UPDATE applications SET status='under_review',stage='credit_assessment',decision_reason='Documents received; awaiting an authorised credit decision.' WHERE id=?`, app.id);
      timeline(app, 'credit_assessment', 'Submitted to the credit officer. An approval is not automatic.');
      enqueue('application', app.id, { type: 'application.review_requested', applicationId: app.id, reference: app.ref, customerId: u.id });
    }
    return q1(`SELECT * FROM applications WHERE id=?`, app.id);
  });
}
export function decideApplication(appId, { approved, reason, source = 'system', offerOverrides = {} }) {
  return tx(() => {
    const app = q1(`SELECT * FROM applications WHERE id=?`, appId);
    if (!app || !['submitted', 'pending_documents', 'under_review'].includes(app.status)) throw new HttpError(409, 'A decision has already been recorded or the application was cancelled.');
    const u = q1(`SELECT * FROM customers WHERE id=?`, app.customer_id), p = catalog.product(app.product_id);
    if (approved && !p) throw new HttpError(409, 'Retired products cannot receive new approvals.');
    const reasonText = clean(reason, 2000);
    if (!reasonText) throw new HttpError(400, 'A decision reason is required.');
    if (approved) {
      if (u.kyc_status !== 'verified') throw new HttpError(409, 'Independent identity verification must be completed before approval.');
      const assessment = assessmentFor(app, u, p);
      if (!assessment.eligible) throw new HttpError(409, assessment.reasons.join(' '));
      const quote = assessment.quote;
      const offer = { amount: app.amount, rate: p.rate, feePct: p.fee, fee: quote.fee, termMonths: app.term_months, freq: app.freq, installment: quote.installment,
        monthlyEquivalent: quote.equivalents.monthly, totalInterest: quote.totalInterest, totalRepayable: quote.totalRepayable, netDisbursement: quote.netDisbursement,
        validUntil: dateOnly(GFS.addDays(new Date(), 14)), version: app.offer_version + 1, environment: source, ...offerOverrides };
      run(`UPDATE applications SET status='approved',stage='offer',offer=?,offer_version=?,decision_reason=?,review_source=?,updated_at=datetime('now') WHERE id=?`, JSON.stringify(offer), offer.version, reasonText, source, app.id);
      timeline(app, 'decision', `${source === 'sandbox' ? 'Sandbox approval' : 'Approved by the credit system'}: ${reasonText}`);
      notify(u.id, { category: 'application', title: source === 'sandbox' ? 'Sandbox offer ready' : 'Your loan offer is ready', body: `${app.ref}: ${reasonText} Review the agreement before accepting.`, meta: { applicationId: app.id } });
    } else {
      run(`UPDATE applications SET status='rejected',stage='decision',decision_reason=?,review_source=?,updated_at=datetime('now') WHERE id=?`, reasonText, source, app.id);
      timeline(app, 'decision', reasonText);
      notify(u.id, { category: 'application', title: 'Application decision', body: `${app.ref}: ${reasonText}`, meta: { applicationId: app.id } });
    }
    audit(source === 'sandbox' ? 'sandbox' : 'system', null, approved ? 'application.approved' : 'application.rejected', 'application', app.id, null, { reason: reasonText, source }, null, null);
    return q1(`SELECT * FROM applications WHERE id=?`, app.id);
  });
}
export async function submitApplication(ctx) {
  const u = requireAuth(ctx), b = ctx.body, p = catalog.product(b.productId || b.product);
  if (!p) throw new HttpError(400, 'Choose a valid loan product.');
  const amount = money(b.amount), term = Number(b.term || b.termMonths), freq = b.freq || p.freqs[0];
  if (amount < p.min || amount > p.max || !p.terms.includes(term) || !p.freqs.includes(freq)) throw new HttpError(400, 'Amount, term or repayment frequency is outside the published product limits.');
  if (!clean(b.purpose, 2000) || clean(b.purpose, 2000).length < 10) throw new HttpError(400, 'Describe the loan purpose in at least 10 characters.');
  if (!catalog.method(b.disbursementMethod)) throw new HttpError(400, 'Choose an enabled disbursement method.');
  if (!clean(b.disbursementAccount, 120)) throw new HttpError(400, 'Enter the destination account or phone number.');
  if (!b.consent) throw new HttpError(400, 'Consent to the stated credit checks is required.');
  const appId = tx(() => {
    const ref = GFS.refs.application(nextSeq('application'));
    const id = Number(run(`INSERT INTO applications(ref,customer_id,product_id,amount,term_months,freq,purpose,income,expenses,disbursement_method,disbursement_account,status,stage,timeline) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      ref, u.id, p.id, amount, term, freq, clean(b.purpose, 2000), Math.max(0, cleanNum(b.income, u.monthly_income)), Math.max(0, cleanNum(b.expenses, u.monthly_expenses)), b.disbursementMethod, clean(b.disbursementAccount, 120), 'submitted', 'intake', '[]').lastInsertRowid);
    run(`UPDATE documents SET application_id=? WHERE customer_id=? AND application_id IS NULL AND kind!='avatar'`, id, u.id);
    for (const gid of Array.isArray(b.guarantorIds) ? b.guarantorIds.slice(0, 3) : []) {
      const g = q1(`SELECT * FROM guarantors WHERE id=? AND customer_id=?`, Number(gid), u.id);
      if (!g) throw new HttpError(400, 'A selected guarantor does not belong to your account.');
      if (g.application_id && g.application_id !== id) throw new HttpError(409, 'A selected guarantor is already attached to another application.');
      run(`UPDATE guarantors SET application_id=? WHERE id=?`, id, g.id);
    }
    for (const cid of Array.isArray(b.collateralIds) ? b.collateralIds.slice(0, 10) : []) {
      const c = q1(`SELECT * FROM collateral WHERE id=? AND customer_id=?`, Number(cid), u.id);
      if (!c || (c.application_id && c.application_id !== id)) throw new HttpError(400, 'Invalid collateral selection.');
      run(`UPDATE collateral SET application_id=? WHERE id=?`, id, c.id);
    }
    const app = q1(`SELECT * FROM applications WHERE id=?`, id);
    timeline(app, 'intake', `Application received. ${DEMO_MODE ? 'Sandbox workflow enabled.' : 'Awaiting document and credit review.'}`);
    enqueue('application', id, { type: 'application.submitted', applicationId: id, reference: ref, customerId: u.id, product: p.id, amount, termMonths: term });
    return id;
  });
  audit('customer', u.id, 'application.submitted', 'application', appId, null, { product: p.id, amount, term }, ctx.ip, ctx.ua);
  activity(u.id, 'Loan application submitted', `${p.name} · ${GFS.mk(amount)}`, ctx.ip, ctx.ua);
  const app = runPipeline(appId, { source: DEMO_MODE ? 'sandbox' : 'system' });
  return { application: serializeApp(app), reference: app.ref };
}
export function serializeApp(a) {
  if (!a) return null;
  const p = catalog.recordProduct(a.product_id);
  return { id: a.id, ref: a.ref, productId: a.product_id, productName: p?.label || p?.name || a.product_id, amount: a.amount, termMonths: a.term_months, freq: a.freq, purpose: a.purpose,
    status: a.status, stage: a.stage, decisionReason: a.decision_reason, assessment: json(a.assessment), offer: json(a.offer, null), income: a.income, expenses: a.expenses,
    agreementAcceptedAt: a.agreement_accepted_at, agreementSignature: !!a.agreement_signature, reviewSource: a.review_source, environment: json(a.offer, {}).environment || a.review_source || 'system',
    disbursementMethod: a.disbursement_method, disbursementAccount: a.disbursement_account, timeline: json(a.timeline, []), createdAt: a.created_at, updatedAt: a.updated_at,
    guarantors: q(`SELECT id,name,phone,relationship,employer,consent,status FROM guarantors WHERE application_id=?`, a.id),
    collateral: q(`SELECT id,type,description,estimated_value,valued_amount,status FROM collateral WHERE application_id=?`, a.id),
    documents: q(`SELECT id,ref,kind,filename,status,uploaded_at FROM documents WHERE application_id=?`, a.id) };
}
const ownApp = ctx => { const u = requireAuth(ctx); const a = q1(`SELECT * FROM applications WHERE id=? AND customer_id=?`, Number(ctx.params.id), u.id); if (!a) throw new HttpError(404, 'Application not found.'); return { u, a }; };
export async function listApplications(ctx) { const u = requireAuth(ctx); return { applications: q(`SELECT * FROM applications WHERE customer_id=? ORDER BY id DESC`, u.id).map(serializeApp) }; }
export async function getApplication(ctx) { return { application: serializeApp(ownApp(ctx).a) }; }
export async function rerunAssessment(ctx) { const { u, a } = ownApp(ctx); if (!['pending_documents', 'rejected'].includes(a.status)) throw new HttpError(409, 'This application cannot be re-assessed.'); const updated = runPipeline(a.id, { source: DEMO_MODE ? 'sandbox' : 'system' }); audit('customer', u.id, 'application.reassessed', 'application', a.id, null, null, ctx.ip, ctx.ua); return { application: serializeApp(updated) }; }
export async function cancelApplication(ctx) {
  const { u, a } = ownApp(ctx);
  if (['disbursed', 'closed', 'cancelled'].includes(a.status)) throw new HttpError(409, 'This application cannot be cancelled.');
  tx(() => { run(`UPDATE applications SET status='cancelled',stage='closed',decision_reason='Cancelled by customer.',updated_at=datetime('now') WHERE id=?`, a.id); timeline(a, 'closed', 'Cancelled at your request.'); enqueue('application', a.id, { type: 'application.cancelled', applicationId: a.id, reference: a.ref }); });
  audit('customer', u.id, 'application.cancelled', 'application', a.id, null, null, ctx.ip, ctx.ua);
  return { application: serializeApp(q1(`SELECT * FROM applications WHERE id=?`, a.id)) };
}
export async function acceptAgreement(ctx) {
  const { u, a } = ownApp(ctx), b = ctx.body;
  if (a.status !== 'approved') throw new HttpError(409, 'Only a current approved offer can be accepted.');
  if (!catalog.product(a.product_id)) throw new HttpError(409, 'This product has been retired. Contact support before taking any further action.');
  const offer = json(a.offer, null);
  if (!offer || offer.validUntil < dateOnly()) throw new HttpError(409, 'This offer has expired. Request a new assessment.');
  if (Number(b.offerVersion) !== offer.version) throw new HttpError(409, 'The offer changed. Review the latest terms.');
  const name = clean(b.name, 120);
  if (name.toLowerCase() !== `${u.first_name} ${u.last_name}`.toLowerCase() || !b.accept || !b.termsConsent) throw new HttpError(400, 'Confirm the terms and type your registered full name to sign.');
  const signature = String(b.signature || '');
  const drawn = /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(signature);
  if ((drawn && signature.length > 150000) || (!drawn && (signature.length < 3 || signature.length > 120 || signature.toLowerCase() !== name.toLowerCase()))) throw new HttpError(400, 'Provide a valid typed or drawn signature.');
  const terms = { applicationRef: a.ref, product: catalog.product(a.product_id).name, offer, clauses: GFS.AGREEMENT_CLAUSES, interestBasis: 'Actual days / 365 on unpaid principal; scheduled interest is illustrative.', signedName: name };
  const termsJson = JSON.stringify(terms), hash = sha256(termsJson);
  tx(() => {
    run(`INSERT INTO agreement_acceptances(application_id,customer_id,terms_json,terms_hash,signature_enc,signature_kind,ip,user_agent) VALUES(?,?,?,?,?,?,?,?)`, a.id, u.id, termsJson, hash, encryptText(signature), drawn ? 'drawn' : 'typed', ctx.ip, ctx.ua);
    run(`UPDATE applications SET agreement_accepted_at=datetime('now'),agreement_signature=?,agreement_name=?,status='agreement_accepted',stage='disbursement',updated_at=datetime('now') WHERE id=?`, drawn ? '[drawn signature encrypted on file]' : signature, name, a.id);
    timeline(a, 'agreement', `Terms ${hash.slice(0, 12)} accepted electronically by ${name}.`);
    enqueue('application', a.id, { type: 'agreement.accepted', applicationId: a.id, reference: a.ref, termsHash: hash });
  });
  audit('customer', u.id, 'agreement.accepted', 'application', a.id, null, { termsHash: hash }, ctx.ip, ctx.ua);
  let loan = null;
  if (DEMO_MODE && offer.environment === 'sandbox') loan = createDisbursement(a.id, { source: 'sandbox', providerRef: `SANDBOX-${a.ref}` });
  else notify(u.id, { category: 'application', title: 'Agreement received', body: `Your signed agreement for ${a.ref} is awaiting authorised disbursement. No money has been sent yet.`, meta: { applicationId: a.id } });
  return { application: serializeApp(q1(`SELECT * FROM applications WHERE id=?`, a.id)), loan, sandbox: DEMO_MODE && offer.environment === 'sandbox' };
}
export function createDisbursement(appId, { source = 'system', providerRef }) {
  return tx(() => {
    const existing = q1(`SELECT * FROM loans WHERE application_id=?`, appId);
    if (existing) { if (existing.disbursement_ref === providerRef) return serializeLoan(existing); throw new HttpError(409, 'This application has already been disbursed.'); }
    const a = q1(`SELECT * FROM applications WHERE id=?`, appId);
    if (!a || a.status !== 'agreement_accepted' || !a.agreement_accepted_at) throw new HttpError(409, 'A signed, current offer is required before disbursement.');
    if (source === 'sandbox' && !DEMO_MODE) throw new HttpError(403, 'Sandbox disbursement is disabled.');
    const o = json(a.offer), p = catalog.product(a.product_id);
    if (!p) throw new HttpError(409, 'This product has been retired. The record is retained, but no new disbursement can be made.');
    const start = new Date(), sched = GFS.amortize({ amount: o.amount, monthlyPct: o.rate, termMonths: o.termMonths, freq: o.freq, feePct: o.feePct, startDate: start });
    const ref = GFS.refs.loan(nextSeq('loan'));
    const id = Number(run(`INSERT INTO loans(ref,customer_id,application_id,product_id,principal,rate_monthly,fee_pct,fee_amount,term_months,freq,installment,status,disbursed_at,disbursement_ref,disbursement_method,net_disbursed,outstanding_principal,future_interest,fees_outstanding,next_due_date,next_due_amount,interest_accrued_through,environment) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'),?,?,?,?,?,?,?,?,?,?)`,
      ref, a.customer_id, a.id, p.id, o.amount, o.rate, o.feePct, sched.fee, o.termMonths, o.freq, sched.installment, 'active', providerRef || GFS.refs.disbursement(), a.disbursement_method, sched.netDisbursement, o.amount, sched.totalInterest, 0, sched.rows[0].dueDate, sched.rows[0].installment, dateOnly(start), source).lastInsertRowid);
    const loan = q1(`SELECT * FROM loans WHERE id=?`, id);
    for (const r of sched.rows) run(`INSERT INTO schedule(loan_id,no,due_date,opening,installment,principal_part,interest_part,closing) VALUES(?,?,?,?,?,?,?,?)`, id, r.no, r.dueDate, r.opening, r.installment, r.principal, r.interest, r.closing);
    run(`UPDATE guarantors SET loan_id=? WHERE application_id=?`, id, a.id);
    run(`UPDATE collateral SET loan_id=? WHERE application_id=?`, id, a.id);
    const tid = Number(run(`INSERT INTO transactions(ref,customer_id,loan_id,type,method,provider,provider_ref,amount,status,verified_at,meta,environment) VALUES(?,?,?,?,?,?,?,?,?,datetime('now'),?,?)`, GFS.refs.disbursement(), a.customer_id, id, 'disbursement', a.disbursement_method, source === 'sandbox' ? 'Sandbox' : 'Back-office system', providerRef, sched.netDisbursement, 'verified', JSON.stringify({ gross: o.amount, fee: sched.fee, loanRef: ref, sandbox: source === 'sandbox' }), source).lastInsertRowid);
    postLedger(loan, 'principal', o.amount, 'Loan principal disbursed', tid);
    postLedger(loan, 'fees', sched.fee, 'Arrangement fee deducted from disbursement', tid);
    run(`UPDATE loans SET total_fees_paid=?,fees_outstanding=0 WHERE id=?`, sched.fee, id);
    run(`UPDATE applications SET status='disbursed',stage='complete',updated_at=datetime('now') WHERE id=?`, a.id);
    timeline(a, 'disbursement', `${source === 'sandbox' ? 'SIMULATED — no real funds sent' : 'Provider-confirmed disbursement'}: ${GFS.mk(sched.netDisbursement)}. Loan ${ref}.`);
    audit(source === 'sandbox' ? 'sandbox' : 'system', null, 'loan.disbursed', 'loan', id, null, { ref, net: sched.netDisbursement, providerRef }, null, null);
    notify(a.customer_id, { category: 'disbursement', title: source === 'sandbox' ? 'Sandbox loan activated' : 'Loan disbursement confirmed', body: `${source === 'sandbox' ? 'Demonstration only; no real money was sent. ' : ''}${ref}: net ${GFS.mk(sched.netDisbursement)}. Your schedule is available in the portal.`, meta: { loanId: id } });
    return serializeLoan(q1(`SELECT * FROM loans WHERE id=?`, id));
  });
}
export function serializeLoan(l) {
  if (!l) return null;
  const rows = q(`SELECT * FROM schedule WHERE loan_id=? ORDER BY no`, l.id);
  const p = catalog.recordProduct(l.product_id);
  return { id: l.id, ref: l.ref, productId: l.product_id, productName: p?.label || p?.name || l.product_id, principal: l.principal, rate: l.rate_monthly, feePct: l.fee_pct, fee: l.fee_amount,
    termMonths: l.term_months, freq: l.freq, installment: l.installment, status: l.status, disbursedAt: l.disbursed_at, closedAt: l.closed_at, disbursementRef: l.disbursement_ref,
    disbursementMethod: l.disbursement_method, netDisbursed: l.net_disbursed, outstandingPrincipal: l.outstanding_principal, accruedInterest: l.accrued_interest,
    futureInterest: l.future_interest, feesOutstanding: l.fees_outstanding, penalties: l.penalties, creditBalance: l.credit_balance, totalRepaid: l.total_repaid,
    totalInterestPaid: l.total_interest_paid, totalPrincipalPaid: l.total_principal_paid, nextDueDate: l.next_due_date, nextDueAmount: l.next_due_amount,
    totalOutstanding: money(cents(l.outstanding_principal) + cents(l.accrued_interest) + cents(l.fees_outstanding) + cents(l.penalties) - cents(l.credit_balance)) / 100,
    outstanding: money(cents(l.outstanding_principal) + cents(l.accrued_interest) + cents(l.fees_outstanding) + cents(l.penalties)) / 100,
    rateMonthly: l.rate_monthly, installmentsPaid: rows.filter(r => ['paid','settled'].includes(r.status)).length, installmentsTotal: rows.length,
    environment: l.environment, interestAccruedThrough: l.interest_accrued_through, applicationId: l.application_id,
    progress: l.principal ? Math.min(100, Math.round(l.total_principal_paid / l.principal * 100)) : 0,
    schedule: rows.map(r => ({ no: r.no, dueDate: r.due_date, opening: r.opening, installment: r.installment, principal: r.principal_part, interest: r.interest_part, closing: r.closing, paid: r.paid, principalPaid: r.principal_paid, interestPaid: r.interest_paid, waived: r.waived, status: r.status, paidAt: r.paid_at })),
    transactions: q(`SELECT * FROM transactions WHERE loan_id=? ORDER BY id DESC`, l.id).map(t => ({ id: t.id, ref: t.ref, type: t.type, amount: t.amount, status: t.status, method: t.method, createdAt: t.created_at, environment: t.environment })) };
}
const ownLoan = ctx => { const u = requireAuth(ctx); const l = q1(`SELECT * FROM loans WHERE id=? AND customer_id=?`, Number(ctx.params.id), u.id); if (!l) throw new HttpError(404, 'Loan not found.'); return l; };
export async function listLoans(ctx) { const u = requireAuth(ctx); return { loans: q(`SELECT * FROM loans WHERE customer_id=? ORDER BY id DESC`, u.id).map(serializeLoan) }; }
export async function getLoan(ctx) { const l = ownLoan(ctx); if (l.status === 'active') { accrueInterest(l.id); applyLatePenalty(l.id); } return { loan: serializeLoan(q1(`SELECT * FROM loans WHERE id=?`, l.id)), settlement: settlementQuote(q1(`SELECT * FROM loans WHERE id=?`, l.id)) }; }
export async function dashboard(ctx) {
  const u = requireAuth(ctx), ls = q(`SELECT * FROM loans WHERE customer_id=? ORDER BY id DESC`, u.id);
  for (const l of ls) if (l.status === 'active') { accrueInterest(l.id); applyLatePenalty(l.id); }
  const loans = q(`SELECT * FROM loans WHERE customer_id=? ORDER BY id DESC`, u.id).map(serializeLoan);
  const active = loans.filter(l => l.status === 'active'), applications = q(`SELECT * FROM applications WHERE customer_id=? ORDER BY id DESC`, u.id).map(serializeApp);
  const txns = q(`SELECT * FROM transactions WHERE customer_id=? AND status='verified' ORDER BY id DESC LIMIT 100`, u.id);
  const sum = (arr, key) => money(arr.reduce((s, x) => s + cents(x[key]), 0) / 100) / 100;
  const next = active.filter(l => l.nextDueDate).sort((a, b) => a.nextDueDate.localeCompare(b.nextDueDate))[0];
  const documents = q(`SELECT kind,status FROM documents WHERE customer_id=? AND kind!='avatar'`, u.id);
  return { user: { firstName: u.first_name, customerNo: u.customer_no, kycStatus: u.kyc_status },
    totals: { borrowed: sum(loans, 'principal'), outstanding: sum(active, 'totalOutstanding'), repaid: sum(loans, 'totalRepaid'), activeLoans: active.length, totalLoans: loans.length, pendingApplications: applications.filter(a => !['rejected', 'cancelled', 'disbursed', 'closed'].includes(a.status)).length },
    nextPayment: next ? { loanId: next.id, loanRef: next.ref, amount: next.nextDueAmount, dueDate: next.nextDueDate, overdue: next.nextDueDate < dateOnly() } : null,
    loans, applications, transactions: txns.slice(0, 6).map(t => ({ id: t.id, ref: t.ref, type: t.type, amount: t.amount, status: t.status, createdAt: t.created_at, environment: t.environment })),
    analytics: { repaymentHistory: q(`SELECT substr(created_at,1,7) month,SUM(amount) amount FROM transactions WHERE customer_id=? AND type='repayment' AND status='verified' GROUP BY month ORDER BY month`, u.id), principalProgress: sum(loans, 'totalPrincipalPaid'), principalBorrowed: sum(loans, 'principal') },
    checklist: { phone: !!u.phone_verified, email: !!u.email_verified, identityDocument: documents.some(d => ['national_id', 'passport', 'driving_licence'].includes(d.kind)), incomeDocument: documents.some(d => ['payslip', 'bank_statement', 'business_statement'].includes(d.kind)), identityVerified: u.kyc_status === 'verified', twoFactor: !!u.twofa_enabled },
    environment: DEMO_MODE ? 'sandbox' : 'backend' };
}
export async function getSettlement(ctx) { const l = ownLoan(ctx); accrueInterest(l.id); applyLatePenalty(l.id); return { quote: settlementQuote(q1(`SELECT * FROM loans WHERE id=?`, l.id)) }; }
export async function createRequest(ctx) {
  const u = requireAuth(ctx), b = ctx.body, type = clean(b.type, 30);
  if (!['settlement', 'renewal', 'topup', 'refinance', 'restructure', 'collateral_release', 'document_request'].includes(type)) throw new HttpError(400, 'Unsupported request type.');
  const l = b.loanId ? q1(`SELECT * FROM loans WHERE id=? AND customer_id=?`, Number(b.loanId), u.id) : null;
  if (b.loanId && !l) throw new HttpError(404, 'Loan not found.');
  if (type !== 'document_request' && (!l || !['active', 'closed', 'settled'].includes(l.status))) throw new HttpError(400, 'Select an eligible loan.');
  if (['settlement', 'topup', 'restructure'].includes(type) && l.status !== 'active') throw new HttpError(409, 'This loan is not active.');
  const payload = { reason: clean(b.reason, 2000), amount: ['topup', 'refinance'].includes(type) ? Math.max(0, money(b.amount)) : undefined, termMonths: ['renewal', 'refinance', 'restructure'].includes(type) ? Number(b.termMonths) : undefined };
  if (payload.termMonths !== undefined && (!Number.isInteger(payload.termMonths) || payload.termMonths < 1 || payload.termMonths > 360)) throw new HttpError(400, 'Choose a term from 1 to 360 months.');
  const quote = type === 'settlement' ? settlementQuote(l) : null;
  const id = tx(() => { const ref = GFS.refs.request(nextSeq('request')); const id = Number(run(`INSERT INTO requests(ref,customer_id,loan_id,type,payload,status,response) VALUES(?,?,?,?,?,?,?)`, ref, u.id, l?.id || null, type, JSON.stringify({ ...payload, quote }), 'under_review', 'Request recorded. A credit officer must review it; no loan terms or balances have changed.').lastInsertRowid); enqueue('request', id, { type: 'request.created', requestId: id, reference: ref, requestType: type, customerId: u.id, loanId: l?.id, ...payload }); return id; });
  audit('customer', u.id, `request.${type}`, 'request', id, null, payload, ctx.ip, ctx.ua);
  notify(u.id, { category: 'request', title: 'Request received', body: `Your ${type.replaceAll('_', ' ')} request is awaiting review.`, channels: ['inapp'] });
  return { request: { id, type, status: 'under_review', quote }, quote };
}
export async function listRequests(ctx) { const u = requireAuth(ctx); return { requests: q(`SELECT r.*,l.ref loan_ref FROM requests r LEFT JOIN loans l ON l.id=r.loan_id WHERE r.customer_id=? ORDER BY r.id DESC`, u.id).map(r => ({ id: r.id, ref: r.ref, type: r.type, loanId: r.loan_id, loanRef: r.loan_ref, status: r.status, response: r.response, payload: json(r.payload), createdAt: r.created_at })) }; }
