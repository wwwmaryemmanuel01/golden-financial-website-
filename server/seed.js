/* Seed: system settings + a rich demo customer so every portal module is
   immediately walkable. Demo sign-in: demo@goldenfinancial.mw / Demo@1234 */
import fs from 'node:fs';
import path from 'node:path';
import { db, q, q1, run, tx, nextSeq, setSetting, getSetting, audit } from './db.js';
import { hashPassword, encrypt } from './security.js';
import { notify } from './notifications.js';
import { applyRepayment, recomputeLoan } from './loans.js';
import { UPLOAD_DIR } from './config.js';
import GFS from '../shared/core.mjs';

const DEMO = { email: 'demo@goldenfinancial.mw', password: 'Demo@1234', phone: '+265999123456' };

function seedSettings() {
  if (!getSetting('company')) setSetting('company', GFS.COMPANY);
  if (!getSetting('products')) setSetting('products', GFS.PRODUCTS);
  if (!getSetting('payment_methods')) setSetting('payment_methods', GFS.PAYMENT_METHODS);
  if (!getSetting('branches')) setSetting('branches', GFS.BRANCHES);
  if (!getSetting('theme')) setSetting('theme', { gold: '#C9A227', emerald: '#0E9F6E', emeraldDeep: '#064E3B', ink: '#0F1115' });
  if (!getSetting('config_version')) setSetting('config_version', 1);
}

function fakeDoc(customerId, kind, filename, status = 'verified') {
  const ref = GFS.refs.document();
  const p = path.join(UPLOAD_DIR, ref + '.enc');
  const content = Buffer.from(`GOLDEN FINANCIAL SERVICES — sample ${kind} document for demo purposes.\nFile: ${filename}\nThis is a placeholder used to demonstrate secure encrypted storage.`);
  fs.writeFileSync(p, encrypt(content), { mode: 0o600 });
  const r = run(`INSERT INTO documents(ref, customer_id, kind, filename, mime, size, storage_path, status, verified_at) VALUES(?,?,?,?,?,?,?,?,datetime('now'))`,
    ref, customerId, kind, filename, 'application/pdf', content.length, p, status);
  return Number(r.lastInsertRowid);
}

function backdate(table, id, daysAgo) {
  run(`UPDATE ${table} SET created_at = datetime('now', ?) WHERE id = ?`, `-${daysAgo} days`, id);
}

export function seedIfEmpty() {
  seedSettings();
  if (q1(`SELECT COUNT(*) n FROM customers`).n > 0) return false;
  seedDemo();
  return true;
}

export function seedDemo() {
  seedSettings();
  const customerNo = GFS.refs.customer(nextSeq('customer'));
  const cid = tx(() => {
    const r = run(`INSERT INTO customers(customer_no, email, phone, password_hash, first_name, last_name, dob, gender, marital_status,
      national_id_enc, id_type, district, city, area, address_line, employment, business, monthly_income, monthly_expenses, other_income,
      next_of_kin, kyc_status, email_verified, phone_verified, twofa_enabled, prefs, last_login_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now','-1 day'))`,
      customerNo, DEMO.email, DEMO.phone, hashPassword(DEMO.password), 'Mary', 'Emmanuel', '1992-04-18', 'Female', 'Married',
      encrypt('123456/78/9').toString('base64'), 'national_id', 'Lilongwe', 'Lilongwe', 'Area 47', 'House 12, Road 47/2',
      JSON.stringify({ status: 'Self-employed', employer: 'Golden Grace Trading', role: 'Proprietor', years: 6, payDay: 28 }),
      JSON.stringify({ name: 'Golden Grace Trading', type: 'Retail & wholesale', registered: true, regNo: 'BL-2020-4471', years: 6, sector: 'General trading' }),
      950000, 420000, 80000,
      JSON.stringify({ name: 'James Emmanuel', relationship: 'Spouse', phone: '+265888555123', address: 'House 12, Road 47/2, Lilongwe' }),
      'verified', 1, 1, 0, JSON.stringify({ sms: true, email: true, reminders: true, marketing: false, theme: 'light' }));
    return Number(r.lastInsertRowid);
  });
  fakeDoc(cid, 'national_id', 'mary-emmanuel-national-id.pdf');
  fakeDoc(cid, 'payslip', 'golden-grace-bank-statement.pdf');
  fakeDoc(cid, 'business_statement', 'golden-grace-trading-statements.pdf');
  fakeDoc(cid, 'proof_of_address', 'lilongwe-city-utility-bill.pdf');

  /* ---- closed personal loan (last year, fully repaid) ---- */
  const closedAppRef = GFS.refs.application(nextSeq('application'));
  const closedAppId = tx(() => {
    const r = run(`INSERT INTO applications(ref, customer_id, product_id, amount, term_months, freq, purpose, status, stage, income, expenses,
      agreement_accepted_at, agreement_signature, agreement_name, agreement_id_number, disbursement_method, disbursement_account, created_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now','-400 days'))`,
      closedAppRef, cid, 'PL', 300000, 6, 'monthly', 'School fees for two children', 'disbursed', 'complete', 700000, 350000,
      new Date(Date.now() - 399 * 86400000).toISOString(), 'Mary Emmanuel (typed)', 'Mary Emmanuel', '123456/78/9', 'mpamba', DEMO.phone);
    return Number(r.lastInsertRowid);
  });
  const closedLoan = makeLoan(cid, closedAppId, 'PL', 300000, 6, 'monthly', 400);
  // repay all 6 instalments
  const closedRows = q(`SELECT * FROM schedule WHERE loan_id = ? ORDER BY no`, closedLoan.id);
  closedRows.forEach((row, i) => {
    const tid = recordRepayment(cid, closedLoan.id, row.installment, 'mpamba', 370 - i * 30);
    applyRepayment(closedLoan.id, row.installment, tid);
  });
  recomputeLoan(closedLoan.id);

  /* ---- active business loan, 4 of 12 instalments paid ---- */
  const activeAppRef = GFS.refs.application(nextSeq('application'));
  const activeAppId = tx(() => {
    const r = run(`INSERT INTO applications(ref, customer_id, product_id, amount, term_months, freq, purpose, status, stage, income, expenses,
      assessment, offer, agreement_accepted_at, agreement_signature, agreement_name, agreement_id_number, disbursement_method, disbursement_account, created_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now','-125 days'))`,
      activeAppRef, cid, 'BL', 1500000, 12, 'monthly', 'Restock shop for the festive season and buy a delivery freezer', 'disbursed', 'complete', 950000, 420000,
      JSON.stringify({ score: 88, risk: 'Low', dti: 16.2 }), JSON.stringify({ amount: 1500000, rate: 3.5, feePct: 2.5 }),
      new Date(Date.now() - 124 * 86400000).toISOString(), 'Mary Emmanuel (typed)', 'Mary Emmanuel', '123456/78/9', 'airtel', DEMO.phone);
    return Number(r.lastInsertRowid);
  });
  const activeLoan = makeLoan(cid, activeAppId, 'BL', 1500000, 12, 'monthly', 124);
  const gId = run(`INSERT INTO guarantors(customer_id, application_id, loan_id, name, phone, relationship, employer, address, consent, consent_at, status, created_at)
    VALUES(?,?,?,?,?,?,?,?,1,datetime('now','-125 days'),'verified',datetime('now','-125 days'))`,
    cid, activeAppId, activeLoan.id, 'Grace Banda', '+265991777222', 'Sister', 'Lilongwe City Council', 'Area 18, Lilongwe').lastInsertRowid;
  run(`INSERT INTO collateral(customer_id, application_id, loan_id, type, description, estimated_value, valued_by, valuation_date, status, created_at)
    VALUES(?,?,?,?,?,?,?,?, 'verified', datetime('now','-125 days'))`,
    cid, activeAppId, activeLoan.id, 'vehicle', 'Toyota Hiace minibus, reg BL 4821, used for deliveries', 4500000, 'AutoValue Malawi', new Date(Date.now() - 130 * 86400000).toISOString().slice(0, 10));
  const activeRows = q(`SELECT * FROM schedule WHERE loan_id = ? ORDER BY no`, activeLoan.id);
  activeRows.slice(0, 4).forEach((row, i) => {
    const method = i % 2 ? 'airtel' : 'mpamba';
    const tid = recordRepayment(cid, activeLoan.id, row.installment, method, 94 - i * 30);
    applyRepayment(activeLoan.id, row.installment, tid);
  });
  recomputeLoan(activeLoan.id);

  /* ---- an approved offer awaiting the customer's signature ---- */
  const offerRef = GFS.refs.application(nextSeq('application'));
  const offerQuote = GFS.amortize({ amount: 250000, monthlyPct: 2.5, termMonths: 3, freq: 'monthly', feePct: 1.5 });
  const offer = { amount: 250000, rate: 2.5, feePct: 1.5, fee: offerQuote.fee, termMonths: 3, freq: 'monthly', installment: offerQuote.installment,
    monthlyEquivalent: offerQuote.installment, totalInterest: offerQuote.totalInterest, totalRepayable: offerQuote.totalRepayable,
    netDisbursement: offerQuote.netDisbursement, startDate: offerQuote.startDate, endDate: offerQuote.endDate,
    validUntil: GFS.iso(GFS.addDays(new Date(), 14)), score: 90, risk: 'Low' };
  run(`INSERT INTO applications(ref, customer_id, product_id, amount, term_months, freq, purpose, status, stage, income, expenses, assessment, offer,
    disbursement_method, disbursement_account, timeline, created_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now','-1 day'))`,
    offerRef, cid, 'SA', 250000, 3, 'monthly', 'Mid-month stock purchase before payday', 'approved', 'offer', 950000, 420000,
    JSON.stringify({ score: 90, risk: 'Low', dti: 9.1 }), JSON.stringify(offer), 'mpamba', DEMO.phone,
    JSON.stringify([
      { stage: 'intake', note: `Application ${offerRef} received.`, at: new Date(Date.now() - 86400000).toISOString() },
      { stage: 'verification', note: 'Identity, contact and documents verified.', at: new Date(Date.now() - 86000000).toISOString() },
      { stage: 'credit_assessment', note: 'Affordability and exposure checked — score 90/100.', at: new Date(Date.now() - 85000000).toISOString() },
      { stage: 'decision', note: 'Approved — Low risk.', at: new Date(Date.now() - 84000000).toISOString() },
      { stage: 'offer', note: 'Offer issued. Accept the agreement to receive funds.', at: new Date(Date.now() - 83000000).toISOString() }
    ]));

  /* ---- notifications & SMS history ---- */
  const notifs = [
    ['welcome', 'Welcome to Golden Financial Services', `Hello Mary, your customer account ${customerNo} is ready.`, 400],
    ['disbursement', 'Loan disbursed 💰', `MK 292,500 sent via TNM Mpamba. Loan ${closedLoan.ref} is active.`, 399],
    ['payment', 'Payment received ✓', `Instalment received for ${closedLoan.ref}. Receipt issued.`, 340],
    ['settlement', 'Loan fully settled 🎉', `Loan ${closedLoan.ref} is fully repaid. Thank you!`, 220],
    ['application', 'Application received', `Business loan application ${activeAppRef} received.`, 125],
    ['disbursement', 'Loan disbursed 💰', `MK 1,462,500 sent via Airtel Money. Loan ${activeLoan.ref} is active. First instalment due in 30 days.`, 124],
    ['payment', 'Payment received ✓', `Instalment 4 received for ${activeLoan.ref}. New balance updated.`, 4],
    ['reminder', 'Upcoming repayment', `Your next instalment on ${activeLoan.ref} is due soon. Pay from your portal.`, 1],
    ['application', 'Loan approved 🎉', `Application ${offerRef} (Salary Advance, MK 250,000) is approved. Accept your agreement to receive funds.`, 1]
  ];
  for (const [cat, title, body, days] of notifs) {
    for (const ch of ['inapp', 'sms', 'email']) {
      const r = run(`INSERT INTO notifications(customer_id, channel, category, title, body, read_at, created_at) VALUES(?,?,?,?,?,?,datetime('now',?))`,
        cid, ch, cat, title, body, ch === 'inapp' && days > 2 ? new Date().toISOString() : null, `-${days} days`);
    }
  }

  /* ---- support tickets ---- */
  const t1 = run(`INSERT INTO tickets(ref, customer_id, subject, category, priority, status, created_at, updated_at) VALUES(?,?,?,?,?,?,datetime('now','-20 days'),datetime('now','-18 days'))`,
    GFS.refs.ticket(nextSeq('ticket')), cid, 'Receipt for March instalment not received by SMS', 'payment', 'normal', 'resolved').lastInsertRowid;
  run(`INSERT INTO ticket_messages(ticket_id, sender, sender_name, body, created_at) VALUES(?,?,?,?,datetime('now','-20 days'))`, t1, 'customer', 'Mary Emmanuel', 'I paid my March instalment via Mpamba but did not get the SMS receipt. Please confirm the payment was recorded.');
  run(`INSERT INTO ticket_messages(ticket_id, sender, sender_name, body, created_at) VALUES(?,?,?,?,datetime('now','-18 days'))`, t1, 'agent', 'Esther Mwale — Customer Care', 'Hello Mary, your payment was received and allocated correctly. The SMS gateway had a delay that day. We have re-sent the receipt and it is also in your portal under Receipts. Sorry for the worry!');
  const t2 = run(`INSERT INTO tickets(ref, customer_id, subject, category, priority, status, created_at, updated_at) VALUES(?,?,?,?,?,?,datetime('now','-3 days'),datetime('now','-2 days'))`,
    GFS.refs.ticket(nextSeq('ticket')), cid, 'Request to increase mobile money payment limit', 'general', 'normal', 'open').lastInsertRowid;
  run(`INSERT INTO ticket_messages(ticket_id, sender, sender_name, body, created_at) VALUES(?,?,?,?,datetime('now','-3 days'))`, t2, 'customer', 'Mary Emmanuel', 'My Airtel Money daily limit is below my instalment. Can I split the payment across two days without a penalty?');
  run(`INSERT INTO ticket_messages(ticket_id, sender, sender_name, body, created_at) VALUES(?,?,?,?,datetime('now','-2 days'))`, t2, 'agent', 'GFS Customer Care', 'Hello Mary, yes — partial payments are welcome and no penalty applies as long as the full instalment clears by the due date plus the 3-day grace period. You can make two payments from the portal.');

  /* ---- live chat welcome ---- */
  run(`INSERT INTO chat_messages(customer_id, sender, body, created_at) VALUES(?,?,?,datetime('now','-2 days'))`, cid, 'bot',
    `Hello Mary! 👋 I'm the Golden Financial Services assistant. Ask me about your balance, next payment, rates, or anything else.`);

  /* ---- announcements ---- */
  const anns = [
    ['New: instant salary advance decisions', 'Salary advance applications from confirmed employees are now decided automatically within minutes. Apply from your portal and accept your offer the same day.', 'product', 1],
    ['Festive season business top-ups', 'Existing business customers in good standing can request a top-up of up to 50% of their original principal, subject to affordability. Requests are pre-assessed instantly in the portal.', 'product', 0],
    ['Scheduled maintenance — Sunday 02:00–04:00', 'The customer portal will be briefly unavailable during scheduled maintenance on Sunday between 02:00 and 04:00. Payments made during this window are queued and confirmed automatically.', 'service', 0],
    ['Beware of fraud — we never ask for your PIN', 'Golden Financial Services will NEVER ask for your mobile money PIN, password or OTP by phone or SMS. Report suspicious calls to +265 1 770 100 immediately.', 'security', 1]
  ];
  anns.forEach(([title, body, cat, pinned], i) => run(`INSERT INTO announcements(title, body, category, pinned, published_at) VALUES(?,?,?,?,datetime('now',?))`, title, body, cat, pinned, `-${i * 7 + 1} days`));

  /* ---- a settlement request on record ---- */
  run(`INSERT INTO requests(ref, customer_id, loan_id, type, payload, status, response, created_at) VALUES(?,?,?,?,?,?,?,datetime('now','-6 days'))`,
    GFS.refs.request(nextSeq('request')), cid, activeLoan.id, 'settlement', '{}', 'approved',
    `Settlement statement issued. Pay the quoted amount to settle ${activeLoan.ref} in full; future interest is waived.`);

  audit('system', null, 'system.seeded', 'system', null, null, { demoCustomer: customerNo }, null, null);
  console.log(`[seed] Demo customer created: ${DEMO.email} / ${DEMO.password} (${customerNo})`);
  console.log(`[seed] Active loan ${activeLoan.ref} · closed loan ${closedLoan.ref} · approved offer ${offerRef}`);
  return { email: DEMO.email, password: DEMO.password, customerNo };
}

function makeLoan(cid, appId, productId, amount, term, freq, daysAgo) {
  const p = GFS.productById(productId);
  const sched = GFS.amortize({ amount, monthlyPct: p.rate, termMonths: term, freq, feePct: p.fee, startDate: new Date(Date.now() - daysAgo * 86400000) });
  const ref = GFS.refs.loan(nextSeq('loan'), new Date(Date.now() - daysAgo * 86400000).getFullYear());
  const disbRef = GFS.refs.disbursement(new Date(Date.now() - daysAgo * 86400000));
  const r = run(`INSERT INTO loans(ref, customer_id, application_id, product_id, principal, rate_monthly, fee_pct, fee_amount, term_months, freq, installment,
    status, disbursed_at, disbursement_ref, disbursement_method, net_disbursed, outstanding_principal, future_interest, next_due_date, next_due_amount, created_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now',?))`,
    ref, cid, appId, productId, amount, p.rate, p.fee, sched.fee, term, freq, sched.installment,
    'active', new Date(Date.now() - daysAgo * 86400000).toISOString(), disbRef, productId === 'BL' ? 'airtel' : 'mpamba', sched.netDisbursement,
    amount, sched.totalInterest, sched.rows[0].dueDate, sched.rows[0].installment, `-${daysAgo} days`);
  const loanId = Number(r.lastInsertRowid);
  for (const row of sched.rows) {
    run(`INSERT INTO schedule(loan_id, no, due_date, opening, installment, principal_part, interest_part, closing) VALUES(?,?,?,?,?,?,?,?)`,
      loanId, row.no, row.dueDate, row.opening, row.installment, row.principal, row.interest, row.closing);
  }
  const dt = run(`INSERT INTO transactions(ref, customer_id, loan_id, type, method, provider, amount, status, verified_at, meta, created_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,datetime('now',?))`,
    GFS.refs.transaction(new Date(Date.now() - daysAgo * 86400000)), cid, loanId, 'disbursement', productId === 'BL' ? 'airtel' : 'mpamba',
    productId === 'BL' ? 'Airtel Money' : 'TNM Mpamba', sched.netDisbursement, 'verified', new Date(Date.now() - daysAgo * 86400000).toISOString(),
    JSON.stringify({ gross: amount, fee: sched.fee, loanRef: ref }), `-${daysAgo} days`).lastInsertRowid;
  run(`INSERT INTO transactions(ref, customer_id, loan_id, type, amount, status, verified_at, meta, created_at) VALUES(?,?,?,?,?,?,?, ?, datetime('now',?))`,
    GFS.refs.transaction(new Date(Date.now() - daysAgo * 86400000)), cid, loanId, 'fee', sched.fee, 'verified', new Date(Date.now() - daysAgo * 86400000).toISOString(),
    JSON.stringify({ kind: 'arrangement', loanRef: ref }), `-${daysAgo} days`);
  return q1(`SELECT * FROM loans WHERE id = ?`, loanId);
}

function recordRepayment(cid, loanId, amount, method, daysAgo) {
  const ref = GFS.refs.transaction(new Date(Date.now() - daysAgo * 86400000));
  const r = run(`INSERT INTO transactions(ref, customer_id, loan_id, type, method, provider, provider_ref, amount, status, verified_at, created_at, meta)
    VALUES(?,?,?,?,?,?,?,?,?,?,datetime('now',?),?)`,
    ref, cid, loanId, 'repayment', method, method === 'airtel' ? 'Airtel Money' : 'TNM Mpamba',
    `${method.toUpperCase()}-SEED${Math.floor(Math.random() * 90000 + 10000)}`, amount, 'verified',
    new Date(Date.now() - daysAgo * 86400000).toISOString(), `-${daysAgo} days`, JSON.stringify({ sandbox: true }));
  const tid = Number(r.lastInsertRowid);
  const rr = run(`INSERT INTO receipts(ref, transaction_id, customer_id, loan_id, amount, method, created_at) VALUES(?,?,?,?,?,?,datetime('now',?))`,
    GFS.refs.receipt(new Date(Date.now() - daysAgo * 86400000)), tid, cid, loanId, amount, method, `-${daysAgo} days`);
  run(`UPDATE transactions SET receipt_id = ? WHERE id = ?`, Number(rr.lastInsertRowid), tid);
  return ref;
}

if (process.argv[1] && process.argv[1].endsWith('seed.js')) {
  if (process.argv.includes('--force')) {
    const existing = q1(`SELECT id FROM customers WHERE email = ?`, DEMO.email);
    if (existing) console.log('[seed] Demo customer already exists — nothing to do.');
    else seedDemo();
  } else seedIfEmpty();
}
