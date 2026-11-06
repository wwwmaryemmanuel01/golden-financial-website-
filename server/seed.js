/* Explicit sandbox fixture. Never seeded into a production customer database. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { q, q1, run, tx, nextSeq, setSetting, getSetting, audit } from './db.js';
import { hashPassword, encrypt } from './security.js';
import { applyRepayment, recomputeLoan, accrueInterest, settlementQuote, postLedger } from './finance.js';
import { UPLOAD_DIR, DEMO_MODE } from './config.js';
import GFS from '../shared/core.mjs';
import CONTENT from '../shared/content.mjs';
const DEMO = { email: 'demo@goldenfinancial.mw', password: 'Demo@1234', phone: '+265999123456' };
const past = days => new Date(Date.now() - days * 86400000);
export function seedSettings() {
  for (const [k, v] of Object.entries({ company: GFS.COMPANY, products: GFS.PRODUCTS, payment_methods: GFS.PAYMENT_METHODS, branches: GFS.BRANCHES, rules: GFS.RULES, theme: { gold: '#C9A227', emerald: '#0E9F6E', emeraldDeep: '#064E3B', header: '#0F1115', headerSurface: '#171A21', headerBorder: '#23262E', headerGold: '#E4C264' }, blog_posts: CONTENT.BLOG_POSTS, config_version: 1 })) if (!getSetting(k)) setSetting(k, v);
}
function sampleDoc(cid, kind, filename) {
  const ref = GFS.refs.document(), content = Buffer.from(`%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n% Sample ${kind}: ${filename}. SANDBOX ONLY.\n%%EOF\n`);
  fs.writeFileSync(path.join(UPLOAD_DIR, `${ref}.enc`), encrypt(content), { mode: 0o600 });
  return Number(run(`INSERT INTO documents(ref,customer_id,kind,filename,mime,size,storage_path,status,checksum,verified_at) VALUES(?,?,?,?,?,?,?,?,?,datetime('now'))`, ref, cid, kind, filename, 'application/pdf', content.length, `${ref}.enc`, 'verified', crypto.createHash('sha256').update(content).digest('hex')).lastInsertRowid);
}
function makeLoan(cid, appId, productId, amount, term, daysAgo) {
  const p = GFS.productById(productId), start = past(daysAgo), sched = GFS.amortize({ amount, monthlyPct: p.rate, termMonths: term, feePct: p.fee, startDate: start });
  const ref = GFS.refs.loan(nextSeq('loan'), start.getFullYear()), method = productId === 'BL' ? 'airtel' : 'mpamba';
  const id = Number(run(`INSERT INTO loans(ref,customer_id,application_id,product_id,principal,rate_monthly,fee_pct,fee_amount,term_months,freq,installment,status,disbursed_at,disbursement_ref,disbursement_method,net_disbursed,outstanding_principal,future_interest,fees_outstanding,total_fees_paid,next_due_date,next_due_amount,interest_accrued_through,environment,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, ref, cid, appId, productId, amount, p.rate, p.fee, sched.fee, term, 'monthly', sched.installment, 'active', start.toISOString(), `SANDBOX-DSB-${appId}`, method, sched.netDisbursement, amount, sched.totalInterest, 0, sched.fee, sched.rows[0].dueDate, sched.rows[0].installment, GFS.iso(start), 'sandbox', start.toISOString()).lastInsertRowid);
  const loan = q1(`SELECT * FROM loans WHERE id=?`, id);
  for (const r of sched.rows) run(`INSERT INTO schedule(loan_id,no,due_date,opening,installment,principal_part,interest_part,closing) VALUES(?,?,?,?,?,?,?,?)`, id, r.no, r.dueDate, r.opening, r.installment, r.principal, r.interest, r.closing);
  const tid = Number(run(`INSERT INTO transactions(ref,customer_id,loan_id,type,method,provider,provider_ref,amount,status,verified_at,meta,environment,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`, `SANDBOX-TXN-DSB-${id}`, cid, id, 'disbursement', method, 'Sandbox', `SANDBOX-DSB-${appId}`, sched.netDisbursement, 'verified', start.toISOString(), JSON.stringify({ gross: amount, fee: sched.fee, loanRef: ref, sandbox: true }), 'sandbox', start.toISOString()).lastInsertRowid);
  postLedger(loan, 'principal', amount, 'Sandbox principal disbursed', tid, `SANDBOX-LEDGER-P-${id}`);
  postLedger(loan, 'fees', sched.fee, 'Sandbox arrangement fee deducted', tid, `SANDBOX-LEDGER-F-${id}`);
  return loan;
}
function repay(cid, loanId, amount, daysAgo, index, settle = false) {
  const date = past(daysAgo), method = index % 2 ? 'airtel' : 'mpamba';
  const tid = Number(run(`INSERT INTO transactions(ref,customer_id,loan_id,type,method,provider,provider_ref,amount,status,verified_at,meta,environment,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`, `SANDBOX-TXN-${loanId}-${index}`, cid, loanId, settle ? 'settlement' : 'repayment', method, 'Sandbox', `SANDBOX-PAY-${loanId}-${index}`, amount, 'verified', date.toISOString(), JSON.stringify({ sandbox: true, settle }), 'sandbox', date.toISOString()).lastInsertRowid);
  const result = applyRepayment(loanId, amount, tid, { settle, asOf: date });
  const rid = Number(run(`INSERT INTO receipts(ref,transaction_id,customer_id,loan_id,amount,method,created_at) VALUES(?,?,?,?,?,?,?)`, `SANDBOX-RCT-${loanId}-${index}`, tid, cid, loanId, amount, method, date.toISOString()).lastInsertRowid);
  run(`UPDATE transactions SET receipt_id=?,allocation=? WHERE id=?`, rid, JSON.stringify(result.allocation), tid);
}
export function seedIfEmpty() { seedSettings(); if (!DEMO_MODE || q1(`SELECT COUNT(*) n FROM customers`).n) return false; seedDemo(); return true; }
export function seedDemo() {
  seedSettings();
  const customerNo = GFS.refs.customer(nextSeq('customer'));
  const cid = Number(run(`INSERT INTO customers(customer_no,email,phone,password_hash,first_name,last_name,dob,gender,marital_status,national_id_enc,id_type,district,city,area,address_line,employment,business,monthly_income,monthly_expenses,other_income,next_of_kin,kyc_status,email_verified,phone_verified,prefs) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, customerNo, DEMO.email, DEMO.phone, hashPassword(DEMO.password), 'Mary', 'Emmanuel', '1992-04-18', 'Female', 'Married', encrypt('SANDBOX-ID').toString('base64'), 'national_id', 'Lilongwe', 'Lilongwe', 'Area 47', 'Sample address, Lilongwe', JSON.stringify({ status: 'Self-employed', employer: 'Golden Grace Trading', position: 'Proprietor', employedSince: '2020-01-01', payDay: '28' }), JSON.stringify({ name: 'Golden Grace Trading', type: 'Retail & wholesale', registrationNo: 'SAMPLE-ONLY', started: '2020', location: 'Lilongwe' }), 950000, 420000, 80000, JSON.stringify({ name: 'James Emmanuel', relationship: 'Spouse', phone: '+265888555123', address: 'Sample address, Lilongwe' }), 'verified', 1, 1, JSON.stringify({ sms: true, email: true, reminders: true, marketing: false })).lastInsertRowid);
  for (const [kind, name] of [['national_id', 'sample-national-id.pdf'], ['bank_statement', 'sample-bank-statement.pdf'], ['business_statement', 'sample-trading-statements.pdf'], ['proof_of_address', 'sample-proof-of-address.pdf']]) sampleDoc(cid, kind, name);
  function application(productId, amount, term, purpose, status, daysAgo, offer = null) {
    const ref = GFS.refs.application(nextSeq('application'));
    const id = Number(run(`INSERT INTO applications(ref,customer_id,product_id,amount,term_months,freq,purpose,status,stage,income,expenses,offer,review_source,decision_reason,agreement_accepted_at,agreement_signature,agreement_name,disbursement_method,disbursement_account,timeline,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, ref, cid, productId, amount, term, 'monthly', purpose, status, status === 'approved' ? 'offer' : 'complete', 950000, 420000, offer ? JSON.stringify(offer) : null, 'sandbox', 'Sandbox demonstration record — not a real credit decision.', status === 'approved' ? null : past(daysAgo - 1).toISOString(), status === 'approved' ? null : 'Mary Emmanuel', 'Mary Emmanuel', 'mpamba', DEMO.phone, JSON.stringify([{ stage: 'intake', note: 'Sandbox application received.', at: past(daysAgo).toISOString() }, { stage: 'decision', note: status === 'approved' ? 'Sandbox offer ready for review.' : 'Sandbox loan activated; no real funds sent.', at: past(daysAgo - 1).toISOString() }]), past(daysAgo).toISOString()).lastInsertRowid);
    return { id, ref };
  }
  const closedApp = application('PL', 300000, 6, 'Sample school-fees financing', 'disbursed', 400);
  const closed = makeLoan(cid, closedApp.id, 'PL', 300000, 6, 400);
  const rows = q(`SELECT * FROM schedule WHERE loan_id=? ORDER BY no`, closed.id);
  rows.forEach((r, i) => { const daysAgo = 370 - i * 30; const final = i === rows.length - 1; accrueInterest(closed.id, past(daysAgo)); const amount = final ? settlementQuote(q1(`SELECT * FROM loans WHERE id=?`, closed.id), past(daysAgo)).total : r.installment; repay(cid, closed.id, amount, daysAgo, i, final); });
  accrueInterest(closed.id); recomputeLoan(closed.id);
  const activeApp = application('BL', 1500000, 12, 'Sample business stock and equipment finance', 'disbursed', 124);
  const active = makeLoan(cid, activeApp.id, 'BL', 1500000, 12, 124);
  run(`INSERT INTO guarantors(customer_id,application_id,loan_id,name,phone,relationship,employer,consent,consent_at,status,consent_evidence) VALUES(?,?,?,?,?,?,?,1,datetime('now'),'verified',?)`, cid, activeApp.id, active.id, 'Grace Banda', '+265991777222', 'Sister', 'Sample employer', 'SANDBOX sample consent');
  run(`INSERT INTO collateral(customer_id,application_id,loan_id,type,description,estimated_value,valued_amount,valued_by,valuation_date,status) VALUES(?,?,?,?,?,?,?,?,date('now'),'verified')`, cid, activeApp.id, active.id, 'vehicle', 'Sample delivery vehicle — sandbox record', 4500000, 4200000, 'Sandbox valuer');
  q(`SELECT * FROM schedule WHERE loan_id=? ORDER BY no LIMIT 4`, active.id).forEach((r, i) => repay(cid, active.id, r.installment, 94 - i * 30, i));
  accrueInterest(active.id); recomputeLoan(active.id);
  const quote = GFS.amortize({ amount: 250000, monthlyPct: 2.5, termMonths: 3, feePct: 1.5 });
  const offer = { amount: 250000, rate: 2.5, feePct: 1.5, fee: quote.fee, termMonths: 3, freq: 'monthly', installment: quote.installment, monthlyEquivalent: quote.installment, totalInterest: quote.totalInterest, totalRepayable: quote.totalRepayable, netDisbursement: quote.netDisbursement, validUntil: GFS.iso(GFS.addDays(new Date(), 14)), version: 1, environment: 'sandbox' };
  const pending = application('SA', 250000, 3, 'Sample salary advance for stock purchase', 'approved', 1, offer);
  for (const [title, body, days] of [['Welcome to your sandbox portal', `Hello Mary, account ${customerNo} contains sample records for exploring the website.`, 30], ['Sandbox offer ready', `Application ${pending.ref} has a simulated offer. Review the agreement to test the workflow.`, 1], ['Security reminder', 'Never share your password, OTP or mobile-money PIN. Golden staff will not ask for them.', 2]]) for (const channel of ['inapp', 'sms', 'email']) run(`INSERT INTO notifications(customer_id,channel,category,title,body,delivery_status,created_at) VALUES(?,?,?,?,?,?,datetime('now',?))`, cid, channel, 'general', title, body, channel === 'inapp' ? 'delivered' : 'not_configured', `-${days} days`);
  const ticket = Number(run(`INSERT INTO tickets(ref,customer_id,subject,category,status) VALUES(?,?,?,?,?)`, GFS.refs.ticket(nextSeq('ticket')), cid, 'Sandbox: question about partial repayments', 'payment', 'open').lastInsertRowid);
  run(`INSERT INTO ticket_messages(ticket_id,sender,sender_name,body) VALUES(?,?,?,?)`, ticket, 'customer', 'Mary Emmanuel', 'Can I split an instalment into two payments?');
  run(`INSERT INTO ticket_messages(ticket_id,sender,sender_name,body) VALUES(?,?,?,?)`, ticket, 'bot', 'Automated acknowledgement', 'This sample ticket is queued for review. Partial payments are supported; only verified payments change the balance.');
  run(`INSERT INTO chat_messages(customer_id,sender,body) VALUES(?,?,?)`, cid, 'bot', 'Hello Mary. I’m the automated Golden assistant. Ask about your sample balance, products, rates or repayments. Choose Human support to open a tracked ticket.');
  for (const [slug, title, body, category, pinned, linkUrl, linkLabel] of [['welcome-portal','Explore the new customer portal', 'This demonstration includes applications, encrypted documents, repayment schedules, statements and support. Sandbox actions do not move real money.', 'service', 1, '/portal', 'Open the portal'], ['security-first','Your security comes first', 'Never share your password, OTP or mobile-money PIN. Report suspicious requests through the support page.', 'security', 1, '/security-centre', 'Read the security centre'], ['plan-before-borrowing','Plan before you borrow', 'Compare the five loan categories and use the calculator and eligibility check. Offers remain subject to identity, affordability and credit review.', 'general', 0, '/calculator', 'Open the calculator']]) run(`INSERT INTO announcements(slug,title,body,category,pinned,link_url,link_label,status,source,updated_at) VALUES(?,?,?,?,?,?,?,'published','seed',datetime('now'))`, slug, title, body, category, pinned, linkUrl, linkLabel);
  audit('sandbox', null, 'system.seeded', 'system', null, null, { demoCustomer: customerNo }, null, null);
  console.log(`[seed] SANDBOX customer: ${DEMO.email} / ${DEMO.password} (${customerNo})`);
  return { email: DEMO.email, password: DEMO.password, customerNo };
}
if (process.argv[1] && process.argv[1].endsWith('seed.js')) {
  const { migrate } = await import('./migrations.js'); migrate();
  if (!DEMO_MODE) throw new Error('Demo seeding is disabled. Enable GFS_DEMO_MODE explicitly.');
  if (process.argv.includes('--force')) { if (q1(`SELECT id FROM customers WHERE email=?`, DEMO.email)) console.log('[seed] Demo already exists; no data changed.'); else seedDemo(); } else seedIfEmpty();
}
