/* ============================================================
   GitHub Pages device-local adapter.
   When the secure backend is not reachable (e.g. the site is served
   as static GitHub Pages), the SAME customer portal runs against a
   browser-local database so every feature stays walkable. It is
   clearly badged as device-local demo mode. On the shared
   wwwmaryemmanuel01.github.io origin it also bridges the admin
   system's localStorage keys (gls_agreement_v1, gls_applications_v1).
   All money math uses the shared GFS core — identical to the server.
   ============================================================ */
'use strict';
const LocalAPI = (() => {
  const KEY = 'gfs_local_db_v1';
  const TOKEN_KEY = 'gfs_local_token';
  let db = null;
  const now = () => new Date().toISOString();
  const today = () => now().slice(0, 10);
  const r2 = GFS.round2;
  const uid = () => Math.random().toString(36).slice(2, 10);

  /* ---------------- store ---------------- */
  function blank() {
    return {
      seq: { customer: 0, application: 0, loan: 0, ticket: 0, request: 0 },
      customers: [], applications: [], loans: [], transactions: [], receipts: [],
      documents: [], guarantors: [], collateral: [], notifications: [], tickets: [],
      ticketMessages: [], chat: [], requests: [], activity: [], otps: [],
      announcements: [
        { id: 1, title: 'New: instant salary advance decisions', body: 'Salary advance applications from confirmed employees are now decided automatically within minutes.', category: 'product', pinned: 1, published_at: now() },
        { id: 2, title: 'Beware of fraud — we never ask for your PIN', body: 'Golden Financial Services will NEVER ask for your mobile money PIN, password or OTP by phone or SMS.', category: 'security', pinned: 1, published_at: now() },
        { id: 3, title: 'Festive season business top-ups', body: 'Existing business customers in good standing can request a top-up of up to 50% of their original principal.', category: 'product', pinned: 0, published_at: now() }
      ]
    };
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { console.warn('local storage full', e); } }
  function load() { try { db = JSON.parse(localStorage.getItem(KEY)) || blank(); } catch { db = blank(); } }
  const nextSeq = n => ++db.seq[n];

  /* ---------------- demo seed (mirrors server seed) ---------------- */
  function seed() {
    if (db.customers.length) return;
    const c = {
      id: 1, customerNo: GFS.refs.customer(nextSeq('customer')), email: 'demo@goldenfinancial.mw', phone: '+265999123456',
      password: 'Demo@1234', firstName: 'Mary', lastName: 'Emmanuel', dob: '1992-04-18', gender: 'Female', maritalStatus: 'Married',
      idType: 'national_id', nationalId: '123456/78/9', district: 'Lilongwe', city: 'Lilongwe', area: 'Area 47', addressLine: 'House 12, Road 47/2',
      employment: { status: 'Self-employed', employer: 'Golden Grace Trading', role: 'Proprietor', years: 6, payDay: 28 },
      business: { name: 'Golden Grace Trading', type: 'Retail & wholesale', registered: true, regNo: 'BL-2020-4471', years: 6 },
      monthlyIncome: 950000, monthlyExpenses: 420000, otherIncome: 80000,
      nextOfKin: { name: 'James Emmanuel', relationship: 'Spouse', phone: '+265888555123' },
      kycStatus: 'verified', emailVerified: true, phoneVerified: true, twofaEnabled: false,
      prefs: { sms: true, email: true, reminders: true, marketing: false }, status: 'active', createdAt: now(), lastLoginAt: now()
    };
    db.customers.push(c);
    addNotif(1, 'welcome', 'Welcome to Golden Financial Services', `Hello Mary, your customer account ${c.customerNo} is ready.`, ['inapp', 'sms', 'email']);
    // active business loan, 4 of 12 paid
    const app = mkApplication(c, 'BL', 1500000, 12, 'monthly', 'Restock shop for the festive season', 'disbursed', 125);
    const loan = mkLoan(c, app, 124);
    db.guarantors.push({ id: uid(), customerId: 1, applicationId: app.id, loanId: loan.id, name: 'Grace Banda', phone: '+265991777222', relationship: 'Sister', employer: 'Lilongwe City Council', consent: true, status: 'verified', createdAt: now() });
    db.collateral.push({ id: uid(), customerId: 1, applicationId: app.id, loanId: loan.id, type: 'vehicle', description: 'Toyota Hiace minibus, reg BL 4821', estimated_value: 4500000, status: 'verified', createdAt: now() });
    loan.schedule.slice(0, 4).forEach((row, i) => {
      const t = mkTxn(c, loan, 'repayment', row.installment, i % 2 ? 'airtel' : 'mpamba', 'verified');
      applyLocal(loan, row.installment, t);
    });
    // closed personal loan
    const app2 = mkApplication(c, 'PL', 300000, 6, 'monthly', 'School fees', 'disbursed', 400);
    const loan2 = mkLoan(c, app2, 400);
    loan2.schedule.forEach(row => { const t = mkTxn(c, loan2, 'repayment', row.installment, 'mpamba', 'verified'); applyLocal(loan2, row.installment, t); });
    // approved offer awaiting signature
    mkApplication(c, 'SA', 250000, 3, 'monthly', 'Mid-month stock purchase', 'approved', 1);
    addNotif(1, 'application', 'Loan approved 🎉', 'Your Salary Advance application is approved. Accept your agreement to receive funds.', ['inapp', 'sms', 'email']);
    addNotif(1, 'reminder', 'Upcoming repayment', `Your next instalment on ${loan.ref} is due soon.`, ['inapp', 'sms']);
    db.documents.push(
      { id: uid(), ref: GFS.refs.document(), customerId: 1, kind: 'national_id', filename: 'mary-emmanuel-national-id.pdf', mime: 'application/pdf', size: 24000, status: 'verified', uploadedAt: now(), data: null },
      { id: uid(), ref: GFS.refs.document(), customerId: 1, kind: 'payslip', filename: 'golden-grace-bank-statement.pdf', mime: 'application/pdf', size: 31000, status: 'verified', uploadedAt: now(), data: null }
    );
    const tk = { id: uid(), ref: GFS.refs.ticket(nextSeq('ticket')), customerId: 1, subject: 'Receipt for March instalment', category: 'payment', priority: 'normal', status: 'resolved', createdAt: now(), updatedAt: now() };
    db.tickets.push(tk);
    db.ticketMessages.push({ id: uid(), ticketId: tk.id, sender: 'customer', sender_name: 'Mary Emmanuel', body: 'I paid via Mpamba but did not get the SMS receipt.', createdAt: now() });
    db.ticketMessages.push({ id: uid(), ticketId: tk.id, sender: 'agent', sender_name: 'GFS Customer Care', body: 'Your payment was received and allocated correctly. The receipt is in your portal under Receipts.', createdAt: now() });
    db.chat.push({ id: uid(), customerId: 1, sender: 'bot', body: 'Hello Mary! 👋 I am the Golden Financial Services assistant. Ask me about your balance, next payment or rates.', createdAt: now() });
    save();
  }

  function mkApplication(c, productId, amount, term, freq, purpose, status, daysAgo) {
    const p = GFS.productById(productId);
    const q = GFS.amortize({ amount, monthlyPct: p.rate, termMonths: term, freq, feePct: p.fee, startDate: new Date(Date.now() - daysAgo * 86400000) });
    const app = {
      id: uid(), ref: GFS.refs.application(nextSeq('application')), customerId: c.id, productId, amount, termMonths: term, freq, purpose,
      status, stage: status === 'approved' ? 'offer' : status === 'disbursed' ? 'complete' : 'intake',
      decisionReason: status === 'approved' ? 'Approved. Credit score 90/100 (Low risk).' : null,
      assessment: { score: 90, risk: 'Low' },
      offer: status === 'approved' || status === 'disbursed' ? { amount, rate: p.rate, feePct: p.fee, fee: q.fee, termMonths: term, freq, installment: q.installment, totalInterest: q.totalInterest, totalRepayable: q.totalRepayable, netDisbursement: q.netDisbursement, validUntil: GFS.iso(GFS.addDays(new Date(), 14)), score: 90, risk: 'Low' } : null,
      income: c.monthlyIncome, expenses: c.monthlyExpenses, disbursementMethod: 'mpamba', disbursementAccount: c.phone,
      timeline: [{ stage: 'intake', note: 'Application received.', at: now() }, { stage: 'decision', note: status === 'approved' ? 'Approved.' : 'Processed.', at: now() }],
      agreementAcceptedAt: status === 'disbursed' ? now() : null, createdAt: new Date(Date.now() - daysAgo * 86400000).toISOString(), updatedAt: now()
    };
    db.applications.push(app);
    return app;
  }
  function mkLoan(c, app, daysAgo) {
    const p = GFS.productById(app.productId);
    const q = GFS.amortize({ amount: app.amount, monthlyPct: p.rate, termMonths: app.termMonths, freq: app.freq, feePct: p.fee, startDate: new Date(Date.now() - daysAgo * 86400000) });
    const loan = {
      id: uid(), ref: GFS.refs.loan(nextSeq('loan')), customerId: c.id, applicationId: app.id, productId: p.id,
      principal: app.amount, rateMonthly: p.rate, feePct: p.fee, feeAmount: q.fee, termMonths: app.termMonths, freq: app.freq, installment: q.installment,
      status: 'active', disbursedAt: new Date(Date.now() - daysAgo * 86400000).toISOString(), disbursementRef: GFS.refs.disbursement(), disbursementMethod: app.disbursementMethod, netDisbursed: q.netDisbursement,
      penalties: 0, feesOutstanding: 0, creditBalance: 0, totalRepaid: 0, totalInterestPaid: 0,
      schedule: q.rows.map(r => ({ ...r, paid: 0, status: 'pending' })), createdAt: now()
    };
    db.loans.push(loan);
    mkTxn(c, loan, 'disbursement', q.netDisbursement, app.disbursementMethod, 'verified');
    recompute(loan);
    return loan;
  }
  function mkTxn(c, loan, type, amount, method, status) {
    const t = { id: uid(), ref: GFS.refs.transaction(), customerId: c.id, loanId: loan ? loan.id : null, type, method, provider: (GFS.PAYMENT_METHODS.find(m => m.id === method) || {}).name || method, providerRef: method ? method.toUpperCase() + '-' + uid().toUpperCase() : null, amount: r2(amount), status, allocation: {}, createdAt: now(), verifiedAt: status === 'verified' ? now() : null, meta: { sandbox: true } };
    db.transactions.push(t);
    return t;
  }
  function recompute(loan) {
    const t = today();
    let outP = 0, accrued = 0, future = 0, nextDate = null, nextAmount = null;
    for (const r of loan.schedule) {
      const paidP = Math.max(0, Math.min(r.principal, r.paid - r.interest));
      outP = r2(outP + r.principal - paidP);
      const unpaidInt = r2(r.interest - Math.min(r.paid, r.interest));
      if (r.dueDate <= t) accrued = r2(accrued + unpaidInt); else future = r2(future + unpaidInt);
      if (r.paid < r.installment - 0.005 && !nextDate) { nextDate = r.dueDate; nextAmount = r2(r.installment - r.paid); }
    }
    loan.outstandingPrincipal = outP; loan.accruedInterest = accrued; loan.futureInterest = future;
    loan.nextDueDate = nextDate; loan.nextDueAmount = nextAmount;
    loan.outstanding = r2(outP + accrued + loan.feesOutstanding + loan.penalties);
    loan.status = outP <= 0.005 && loan.penalties <= 0.005 && loan.feesOutstanding <= 0.005 ? 'closed' : 'active';
    if (loan.status === 'closed' && !loan.closedAt) { loan.closedAt = now(); db.collateral.filter(x => x.loanId === loan.id).forEach(x => { x.status = 'released'; x.releasedAt = now(); }); }
    const paidCount = loan.schedule.filter(r => r.status === 'paid').length;
    loan.installmentsPaid = paidCount; loan.installmentsTotal = loan.schedule.length;
    loan.progress = loan.schedule.length ? Math.round(paidCount / loan.schedule.length * 100) : 0;
    return loan;
  }
  function applyLocal(loan, amount, txn) {
    let left = r2(amount);
    const alloc = { penalties: 0, fees: 0, interest: 0, principal: 0, advance: 0 };
    const tp = Math.min(left, loan.penalties); alloc.penalties = r2(tp); left = r2(left - tp); loan.penalties = r2(loan.penalties - tp);
    const tf = Math.min(left, loan.feesOutstanding); alloc.fees = r2(tf); left = r2(left - tf); loan.feesOutstanding = r2(loan.feesOutstanding - tf);
    for (const r of loan.schedule) {
      if (left <= 0) break;
      if (r.paid >= r.installment - 0.005) continue;
      const take = Math.min(left, r2(r.installment - r.paid));
      const intPart = Math.min(take, r2(r.interest - Math.min(r.paid, r.interest)));
      alloc.interest = r2(alloc.interest + intPart); alloc.principal = r2(alloc.principal + take - intPart);
      r.paid = r2(r.paid + take); r.status = r.paid >= r.installment - 0.005 ? 'paid' : 'partial'; if (r.status === 'paid') r.paidAt = now();
      left = r2(left - take);
    }
    if (left > 0) { alloc.advance = left; loan.creditBalance = r2(loan.creditBalance + left); }
    loan.totalRepaid = r2(loan.totalRepaid + amount); loan.totalInterestPaid = r2(loan.totalInterestPaid + alloc.interest);
    if (txn) txn.allocation = alloc;
    recompute(loan);
    return alloc;
  }
  function addNotif(cid, category, title, body, channels = ['inapp']) {
    for (const ch of channels) db.notifications.push({ id: uid(), customerId: cid, channel: ch, category, title, body, readAt: null, createdAt: now(), meta: {} });
  }

  /* ---------------- auth helpers ---------------- */
  const curUser = () => { const t = sessionStorage.getItem(TOKEN_KEY); return t ? db.customers.find(c => c.id === Number(t)) : null; };
  const pub = c => c ? { id: c.id, customerNo: c.customerNo, email: c.email, phone: c.phone, firstName: c.firstName, lastName: c.lastName, name: c.firstName + ' ' + c.lastName, dob: c.dob, gender: c.gender, maritalStatus: c.maritalStatus, idType: c.idType, nationalId: c.nationalId ? c.nationalId.slice(0, 2) + '••••' + c.nationalId.slice(-2) : '', district: c.district, city: c.city, area: c.area, addressLine: c.addressLine, employment: c.employment, business: c.business, monthlyIncome: c.monthlyIncome, monthlyExpenses: c.monthlyExpenses, otherIncome: c.otherIncome, nextOfKin: c.nextOfKin, kycStatus: c.kycStatus, emailVerified: c.emailVerified, phoneVerified: c.phoneVerified, twofaEnabled: c.twofaEnabled, prefs: c.prefs, status: c.status, lastLoginAt: c.lastLoginAt, createdAt: c.createdAt, role: 'customer' } : null;
  const err = (msg, status = 400) => { const e = new Error(msg); e.status = status; throw e; };
  const requireUser = () => curUser() || err('Please sign in to continue.', 401);
  const myLoans = u => db.loans.filter(l => l.customerId === u.id);
  const myApps = u => db.applications.filter(a => a.customerId === u.id);
  const serLoan = l => ({ ...l, productName: (GFS.productById(l.productId) || {}).name, settlement: GFS.settlementQuote({ outstanding_principal: l.outstandingPrincipal, accrued_interest: l.accruedInterest, fees_outstanding: l.feesOutstanding, penalties: l.penalties, future_interest: l.futureInterest }) });
  const serApp = a => ({ ...a, productName: (GFS.productById(a.productId) || {}).name, agreementSignature: !!a.agreementAcceptedAt, guarantors: db.guarantors.filter(g => g.applicationId === a.id), collateral: db.collateral.filter(c => c.applicationId === a.id), documents: db.documents.filter(d => d.applicationId === a.id) });
  const serTxn = t => ({ ...t, loanRef: (db.loans.find(l => l.id === t.loanId) || {}).ref });

  /* ---------------- application pipeline (same rules as server) ---------------- */
  function pipeline(app) {
    const u = db.customers.find(c => c.id === app.customerId);
    const p = GFS.productById(app.productId);
    const ls = myLoans(u).filter(l => l.status === 'active');
    const docs = db.documents.filter(d => d.customerId === u.id);
    const idDoc = docs.find(d => ['national_id', 'passport', 'driving_licence'].includes(d.kind));
    const incomeDoc = docs.find(d => ['payslip', 'bank_statement', 'business_statement'].includes(d.kind));
    const gs = db.guarantors.filter(g => g.applicationId === app.id && g.consent);
    const coll = db.collateral.filter(c => c.applicationId === app.id);
    const missing = [];
    if (!u.phoneVerified) missing.push('phone verification');
    if (!u.emailVerified) missing.push('email verification');
    if (!idDoc) missing.push('identity document');
    if (!incomeDoc && p.id !== 'GL') missing.push('proof of income');
    const assessment = GFS.assess({ product: p, amount: app.amount, termMonths: app.termMonths, freq: app.freq, income: app.income || u.monthlyIncome, expenses: app.expenses || u.monthlyExpenses, existingObligations: ls.reduce((s, l) => s + l.installment, 0), activeLoans: ls.length, exposure: ls.reduce((s, l) => s + l.outstandingPrincipal, 0), age: u.dob ? Math.floor((Date.now() - new Date(u.dob)) / 31557600000) : 30, kycVerified: u.kycStatus === 'verified', guarantors: gs.length, collateralValue: coll.reduce((s, c) => s + (c.estimated_value || 0), 0) });
    app.assessment = assessment;
    app.timeline.push({ stage: 'verification', note: 'Identity, contact and documents checked.', at: now() });
    app.timeline.push({ stage: 'credit_assessment', note: `Affordability checked — score ${assessment.score}/100.`, at: now() });
    if (missing.length) { app.status = 'pending_documents'; app.stage = 'verification'; app.decisionReason = 'Additional documents required: ' + missing.join('; ') + '.'; addNotif(u.id, 'application', 'Action needed on your application', app.decisionReason, ['inapp', 'sms']); return app; }
    if (!assessment.eligible) { app.status = 'rejected'; app.stage = 'decision'; app.decisionReason = assessment.reasons.join(' '); addNotif(u.id, 'application', 'Application decision', `Application ${app.ref} was not approved. ${assessment.reasons[0]}`, ['inapp', 'sms', 'email']); return app; }
    const q = assessment.quote;
    app.offer = { amount: app.amount, rate: p.rate, feePct: p.fee, fee: q.fee, termMonths: app.termMonths, freq: app.freq, installment: q.installment, monthlyEquivalent: q.equivalents.monthly, totalInterest: q.totalInterest, totalRepayable: q.totalRepayable, netDisbursement: q.netDisbursement, startDate: q.startDate, endDate: q.endDate, validUntil: GFS.iso(GFS.addDays(new Date(), 14)), score: assessment.score, risk: assessment.risk };
    app.status = 'approved'; app.stage = 'offer'; app.decisionReason = `Approved. Credit score ${assessment.score}/100 (${assessment.risk} risk).`;
    app.timeline.push({ stage: 'decision', note: app.decisionReason, at: now() });
    app.timeline.push({ stage: 'offer', note: 'Offer issued. Accept the agreement to receive funds.', at: now() });
    u.kycStatus = 'verified';
    addNotif(u.id, 'application', 'Loan approved 🎉', `Application ${app.ref} is approved for ${GFS.mk(app.amount)}. Accept your agreement in the portal.`, ['inapp', 'sms', 'email']);
    return app;
  }

  /* ---------------- GLS admin bridge (shared github.io origin) ---------------- */
  function bridgePush(app) {
    try {
      const key = 'gls_applications_v1';
      const list = JSON.parse(localStorage.getItem(key) || '[]');
      list.unshift({ no: app.ref, product: (GFS.productById(app.productId) || {}).name, amount: app.amount, term: app.termMonths, freq: app.freq, purpose: app.purpose, date: today(), status: app.status, source: 'golden-financial-website' });
      localStorage.setItem(key, JSON.stringify(list.slice(0, 25)));
    } catch {}
  }
  function bridgeStatus() {
    let agreement = null, apps = 0;
    try { agreement = JSON.parse(localStorage.getItem('gls_agreement_v1') || 'null'); apps = (JSON.parse(localStorage.getItem('gls_applications_v1') || '[]')).length; } catch {}
    return { origin: location.origin, sharedOrigin: location.hostname.endsWith('github.io'), agreementAccepted: !!agreement, bridgedApplications: apps, keys: ['gls_agreement_v1', 'gls_apply_draft_v1', 'gls_applications_v1'] };
  }

  /* ---------------- printable documents (PDF fallback on Pages) ---------------- */
  function printDocument(path) {
    const u = requireUser();
    const w = window.open('', '_blank');
    if (!w) { UI.toast('Allow pop-ups to print documents.', 'warn'); return; }
    let title = 'Document', body = '';
    const head = `<div style="border-bottom:3px solid #C9A227;padding-bottom:10px;margin-bottom:18px"><h1 style="color:#064E3B;margin:0;font-size:22px">GOLDEN FINANCIAL SERVICES</h1><div style="color:#666;font-size:12px">${GFS.COMPANY.address} · ${GFS.COMPANY.email}</div></div>`;
    const row = (k, v) => `<tr><td style="padding:6px 10px;color:#555">${k}</td><td style="padding:6px 10px;text-align:right;font-weight:700">${v}</td></tr>`;
    let m;
    if ((m = path.match(/receipts\/(\w+)\/pdf/))) {
      const r = db.receipts.find(x => x.id === m[1] && x.customerId === u.id); if (!r) err('Receipt not found.', 404);
      const t = db.transactions.find(x => x.id === r.transactionId); const l = db.loans.find(x => x.id === r.loanId);
      title = 'Receipt ' + r.ref;
      body = `<h2>PAYMENT RECEIPT</h2><table style="width:100%;border-collapse:collapse">${row('Receipt no.', r.ref)}${row('Transaction', t ? t.ref : '—')}${row('Date', GFS.fmtDateTime(r.createdAt))}${row('Customer', u.name + ' (' + u.customerNo + ')')}${row('Loan', l ? l.ref : '—')}${row('Method', r.method)}${row('Status', 'VERIFIED')}${row('AMOUNT RECEIVED', GFS.mk2(r.amount))}${l ? row('Remaining balance', GFS.mk2(l.outstanding)) : ''}</table>`;
    } else if ((m = path.match(/loans\/(\w+)\/statement\.pdf/))) {
      const l = db.loans.find(x => x.id === m[1] && x.customerId === u.id); if (!l) err('Loan not found.', 404);
      title = 'Statement ' + l.ref;
      body = `<h2>LOAN STATEMENT — ${l.ref}</h2><table style="width:100%;border-collapse:collapse">${row('Customer', u.name)}${row('Product', (GFS.productById(l.productId) || {}).name)}${row('Principal', GFS.mk2(l.principal))}${row('Total repaid', GFS.mk2(l.totalRepaid))}${row('Outstanding', GFS.mk2(l.outstanding))}${row('Next instalment', (l.nextDueAmount ? GFS.mk2(l.nextDueAmount) + ' due ' + l.nextDueDate : '—'))}</table><h3>Repayment schedule</h3><table border="1" cellspacing="0" cellpadding="6" style="width:100%;border-collapse:collapse;font-size:12px"><tr style="background:#D9F2E8"><th>#</th><th>Due</th><th>Instalment</th><th>Principal</th><th>Interest</th><th>Status</th></tr>${l.schedule.map(r => `<tr><td>${r.no}</td><td>${r.dueDate}</td><td>${GFS.num(r.installment)}</td><td>${GFS.num(r.principal)}</td><td>${GFS.num(r.interest)}</td><td>${r.status}</td></tr>`).join('')}</table>`;
    } else if ((m = path.match(/loans\/(\w+)\/(settlement|disbursement)\.pdf/))) {
      const l = db.loans.find(x => x.id === m[1] && x.customerId === u.id); if (!l) err('Loan not found.', 404);
      if (m[2] === 'settlement') { const q = serLoan(l).settlement; title = 'Settlement ' + l.ref; body = `<h2>SETTLEMENT STATEMENT — ${l.ref}</h2><table style="width:100%;border-collapse:collapse">${row('Principal', GFS.mk2(q.principal))}${row('Accrued interest', GFS.mk2(q.accruedInterest))}${row('Fees', GFS.mk2(q.fees))}${row('Penalties', GFS.mk2(q.penalties))}${row('TOTAL TO SETTLE', GFS.mk2(q.total))}${row('Future interest waived', GFS.mk2(q.futureInterestWaived))}</table>`; }
      else { title = 'Disbursement ' + l.ref; body = `<h2>DISBURSEMENT CONFIRMATION — ${l.ref}</h2><table style="width:100%;border-collapse:collapse">${row('Reference', l.disbursementRef)}${row('Gross principal', GFS.mk2(l.principal))}${row('Fee deducted', GFS.mk2(l.feeAmount))}${row('NET DISBURSED', GFS.mk2(l.netDisbursed))}${row('Method', l.disbursementMethod)}</table>`; }
    } else if ((m = path.match(/applications\/(\w+)\/agreement\.pdf/))) {
      const a = db.applications.find(x => x.id === m[1] && x.customerId === u.id); if (!a) err('Application not found.', 404);
      title = 'Agreement ' + a.ref;
      body = `<h2>LOAN AGREEMENT — ${a.ref}</h2><table style="width:100%;border-collapse:collapse">${row('Borrower', u.name)}${a.offer ? row('Principal', GFS.mk2(a.offer.amount)) + row('Rate', a.offer.rate + '%/month') + row('Instalment', GFS.mk2(a.offer.installment)) + row('Total repayable', GFS.mk2(a.offer.totalRepayable)) : ''}</table>` + GFS.AGREEMENT_CLAUSES.map(c => `<h4 style="margin:12px 0 4px;color:#064E3B">${c.t}</h4><p style="font-size:12px;margin:0">${c.b}</p>`).join('') + (a.agreementAcceptedAt ? `<p style="margin-top:16px"><b>Signed electronically by ${u.name} on ${GFS.fmtDateTime(a.agreementAcceptedAt)}.</b></p>` : '<p><b>DRAFT — not yet accepted.</b></p>');
    } else if (path.includes('transactions/statement.pdf')) {
      const ts = db.transactions.filter(t => t.customerId === u.id);
      title = 'Transaction statement';
      body = `<h2>TRANSACTION STATEMENT</h2><table border="1" cellspacing="0" cellpadding="6" style="width:100%;border-collapse:collapse;font-size:12px"><tr style="background:#D9F2E8"><th>Date</th><th>Reference</th><th>Type</th><th>Amount</th><th>Status</th></tr>${ts.map(t => `<tr><td>${String(t.createdAt).slice(0, 10)}</td><td>${t.ref}</td><td>${t.type}</td><td>${GFS.num(t.amount)}</td><td>${t.status}</td></tr>`).join('')}</table>`;
    } else { err('Document not available in device-local mode.', 404); }
    w.document.write(`<!DOCTYPE html><html><head><title>${title}</title><style>body{font-family:Segoe UI,Arial,sans-serif;color:#1D2430;max-width:800px;margin:30px auto;padding:0 20px}h2{color:#064E3B}@media print{.no-print{display:none}}</style></head><body>${head}${body}<p style="margin-top:26px;font-size:11px;color:#777">${GFS.COMPANY.legal} · Generated ${GFS.fmtDateTime(now())} · Device-local demo document. Connect the secure backend for official PDF records.</p><div class="no-print" style="margin-top:20px"><button onclick="window.print()" style="background:#C9A227;border:none;padding:12px 24px;font-weight:700;border-radius:8px;cursor:pointer">Print / Save as PDF</button></div></body></html>`);
    w.document.close();
  }
  function fileURL(path) {
    const m = path.match(/documents\/([\w-]+)\/file/);
    const d = m && db.documents.find(x => x.id === m[1]);
    if (d && d.data) return Promise.resolve(d.data);
    return Promise.reject(new Error('This sample document has no file content in device-local mode.'));
  }

  /* ---------------- router ---------------- */
  async function request(method, path, body = {}) {
    await new Promise(r => setTimeout(r, 120)); // gentle latency for realistic loading states
    const p = path.replace(/^\//, '').split('?')[0];
    const query = Object.fromEntries(new URLSearchParams(path.split('?')[1] || ''));
    const seg = p.split('/');
    const u = curUser();

    // public
    if (p === 'api/health') return { status: 'ok', service: 'gfs-local-adapter', database: 'device-local', counts: { customers: db.customers.length, loans: db.loans.length } };
    if (p === 'api/config') return { currency: GFS.CURRENCY, company: GFS.COMPANY, products: GFS.PRODUCTS, paymentMethods: GFS.PAYMENT_METHODS, branches: GFS.BRANCHES, rules: GFS.RULES, theme: { gold: '#C9A227', emerald: '#0E9F6E' }, announcements: db.announcements, linkedSystem: { name: 'Golden Loan Services', url: GFS.COMPANY.adminSystem }, readOnlyForCustomers: true, deviceLocal: true };
    if (p === 'api/products') return { products: GFS.PRODUCTS };
    if (p === 'api/branches') return { branches: GFS.BRANCHES };
    if (p === 'api/faqs') return { faqs: GFS.FAQS };
    if (p === 'api/testimonials') return { testimonials: GFS.TESTIMONIALS };
    if (p === 'api/announcements') return { announcements: db.announcements };
    if (p === 'api/agreement-clauses') return { clauses: GFS.AGREEMENT_CLAUSES };
    if (p === 'api/payment-methods') return { methods: GFS.PAYMENT_METHODS, currency: GFS.CURRENCY, sandbox: true };
    if (p === 'api/integration/status') return { platform: 'Golden Financial Services', currency: GFS.CURRENCY, backend: 'device-local', mode: 'pages', linkedSystem: { name: 'Golden Loan Services — Admin System', url: GFS.COMPANY.adminSystem, repo: GFS.COMPANY.adminRepo, bridgeKeys: ['gls_agreement_v1', 'gls_apply_draft_v1', 'gls_applications_v1'], bridge: bridgeStatus() }, rules: GFS.RULES };
    if (p === 'api/calculator') {
      const prod = GFS.productById(body.productId || query.productId) || GFS.PRODUCTS[0];
      const amount = Number(body.amount || query.amount || prod.min), term = Number(body.term || query.term || prod.terms[0]);
      const freq = body.freq || query.freq || prod.freqs[0];
      const rate = body.rate !== undefined && body.rate !== '' ? Number(body.rate) : prod.rate;
      const feePct = body.feePct !== undefined && body.feePct !== '' ? Number(body.feePct) : prod.fee;
      return { product: { id: prod.id, name: prod.name, rate: prod.rate, fee: prod.fee }, inputs: { amount, term, freq, rate, feePct }, schedule: GFS.amortize({ amount, monthlyPct: rate, termMonths: term, freq, feePct, startDate: body.startDate ? new Date(body.startDate) : new Date() }) };
    }
    if (p === 'api/eligibility') {
      const prod = GFS.productById(body.productId); if (!prod) err('Choose a loan product.');
      const ls = u ? myLoans(u).filter(l => l.status === 'active') : [];
      const res = GFS.assess({ product: prod, amount: Number(body.amount || prod.min), termMonths: Number(body.term || prod.terms[0]), freq: body.freq || prod.freqs[0], income: Number(body.income ?? (u ? u.monthlyIncome : 0)), expenses: Number(body.expenses ?? (u ? u.monthlyExpenses : 0)), existingObligations: ls.reduce((s, l) => s + l.installment, 0), activeLoans: ls.length, exposure: ls.reduce((s, l) => s + l.outstandingPrincipal, 0), age: 30, kycVerified: u ? u.kycStatus === 'verified' : !!body.kycVerified, guarantors: Number(body.guarantors ?? prod.guarantors), collateralValue: Number(body.collateralValue || 0) });
      return { product: { id: prod.id, name: prod.name }, ...res };
    }

    // auth
    if (p === 'api/auth/register' && method === 'POST') {
      if (!GFS.isEmail(body.email)) err('Enter a valid email address.');
      if (!GFS.isPhoneMW(body.phone || '')) err('Enter a valid Malawi mobile number.');
      const iss = GFS.passwordIssues(body.password); if (iss.length) err('Password needs ' + iss.join(', ') + '.');
      if (!body.acceptTerms) err('You must accept the Terms and Privacy Policy.');
      const email = String(body.email).toLowerCase(), phone = GFS.normPhone(body.phone);
      if (db.customers.find(c => c.email === email)) err('An account with this email already exists.', 409);
      const c = { id: db.customers.length + 1, customerNo: GFS.refs.customer(nextSeq('customer')), email, phone, password: body.password, firstName: body.firstName, lastName: body.lastName, dob: body.dob || '', gender: body.gender || '', district: body.district || '', employment: {}, business: {}, monthlyIncome: 0, monthlyExpenses: 0, otherIncome: 0, nextOfKin: {}, kycStatus: 'pending', emailVerified: false, phoneVerified: false, twofaEnabled: false, prefs: { sms: true, email: true, reminders: true }, status: 'active', createdAt: now() };
      db.customers.push(c);
      const pc = GFS.refs.otp(), ec = GFS.refs.otp();
      db.otps.push({ target: phone, purpose: 'verify_phone', code: pc, customerId: c.id }, { target: email, purpose: 'verify_email', code: ec, customerId: c.id });
      addNotif(c.id, 'welcome', 'Welcome to Golden Financial Services', `Hello ${c.firstName}, your account ${c.customerNo} is ready.`, ['inapp', 'sms', 'email']);
      addNotif(c.id, 'security', 'Verification code', `Your phone verification code is ${pc}.`, ['sms']);
      addNotif(c.id, 'security', 'Verification code', `Your email verification code is ${ec}.`, ['email']);
      save();
      return { customerId: c.id, customerNo: c.customerNo, phone, email, verificationRequired: true, devCodes: { phone: pc, email: ec }, note: 'Device-local mode: codes are shown here and in Notifications.' };
    }
    if (p === 'api/auth/verify-otp' && method === 'POST') {
      const target = body.purpose === 'verify_email' || body.purpose === 'reset' ? String(body.target).toLowerCase() : GFS.normPhone(body.target);
      const o = db.otps.find(x => x.target === target && x.purpose === body.purpose && x.code === String(body.code));
      if (!o) err('Incorrect or expired code.');
      db.otps = db.otps.filter(x => x !== o);
      const c = db.customers.find(x => x.id === o.customerId);
      if (body.purpose === 'verify_phone') c.phoneVerified = true;
      if (body.purpose === 'verify_email') c.emailVerified = true;
      if (body.purpose === 'login_2fa') { sessionStorage.setItem(TOKEN_KEY, String(c.id)); c.lastLoginAt = now(); save(); return { verified: true, token: String(c.id), user: pub(c) }; }
      save(); return { verified: true, purpose: body.purpose, user: pub(c) };
    }
    if (p === 'api/auth/resend-otp' && method === 'POST') {
      const target = body.purpose === 'verify_email' ? String(body.target).toLowerCase() : GFS.normPhone(body.target);
      const c = db.customers.find(x => x.email === target || x.phone === target); if (!c) err('Account not found.', 404);
      const code = GFS.refs.otp(); db.otps.push({ target, purpose: body.purpose, code, customerId: c.id });
      addNotif(c.id, 'security', 'Verification code', `Your code is ${code}.`, [body.purpose === 'verify_email' ? 'email' : 'sms']); save();
      return { sent: true, devCode: code };
    }
    if (p === 'api/auth/login' && method === 'POST') {
      const id = String(body.email || body.identifier || '').toLowerCase();
      const c = db.customers.find(x => x.email === id || x.phone === GFS.normPhone(id));
      if (!c || c.password !== body.password) err('Email/phone or password is incorrect.', 401);
      if (c.twofaEnabled) { const code = GFS.refs.otp(); db.otps.push({ target: c.phone, purpose: 'login_2fa', code, customerId: c.id }); addNotif(c.id, 'security', 'Sign-in code', `Your sign-in code is ${code}.`, ['sms']); save(); return { twofaRequired: true, target: c.phone, devCode: code }; }
      sessionStorage.setItem(TOKEN_KEY, String(c.id)); c.lastLoginAt = now();
      db.activity.push({ id: uid(), customerId: c.id, action: 'Signed in', createdAt: now() }); save();
      return { token: String(c.id), user: pub(c) };
    }
    if (p === 'api/auth/logout') { sessionStorage.removeItem(TOKEN_KEY); return { ok: true }; }
    if (p === 'api/auth/forgot-password' && method === 'POST') {
      const id = String(body.email || body.target || '').toLowerCase();
      const c = db.customers.find(x => x.email === id || x.phone === GFS.normPhone(id));
      if (c) { const code = GFS.refs.otp(); db.otps.push({ target: c.email, purpose: 'reset', code, customerId: c.id }); addNotif(c.id, 'security', 'Password reset code', `Your reset code is ${code}.`, ['email']); save(); return { sent: true, target: c.email, devCode: code }; }
      return { sent: true };
    }
    if (p === 'api/auth/reset-password' && method === 'POST') {
      const id = String(body.email || body.target || '').toLowerCase();
      const c = db.customers.find(x => x.email === id); if (!c) err('Invalid reset request.');
      const o = db.otps.find(x => x.customerId === c.id && x.purpose === 'reset' && x.code === String(body.code)); if (!o) err('Incorrect or expired code.');
      const iss = GFS.passwordIssues(body.password); if (iss.length) err('Password needs ' + iss.join(', ') + '.');
      c.password = body.password; db.otps = db.otps.filter(x => x !== o); addNotif(c.id, 'security', 'Password changed', 'Your password was reset.', ['inapp', 'sms', 'email']); save(); return { ok: true };
    }
    if (p === 'api/auth/change-password' && method === 'POST') { const cu = requireUser(); if (cu.password !== body.currentPassword) err('Current password is incorrect.'); const iss = GFS.passwordIssues(body.newPassword); if (iss.length) err('Password needs ' + iss.join(', ') + '.'); cu.password = body.newPassword; save(); return { ok: true }; }
    if (p === 'api/me') return { user: pub(u) };

    // profile & security
    if (p === 'api/profile' && method === 'PUT') { const cu = requireUser(); Object.assign(cu, { firstName: body.firstName ?? cu.firstName, lastName: body.lastName ?? cu.lastName, dob: body.dob ?? cu.dob, gender: body.gender ?? cu.gender, maritalStatus: body.maritalStatus ?? cu.maritalStatus, district: body.district ?? cu.district, city: body.city ?? cu.city, area: body.area ?? cu.area, addressLine: body.addressLine ?? cu.addressLine, monthlyIncome: body.monthlyIncome !== undefined ? Number(body.monthlyIncome) : cu.monthlyIncome, monthlyExpenses: body.monthlyExpenses !== undefined ? Number(body.monthlyExpenses) : cu.monthlyExpenses, otherIncome: body.otherIncome !== undefined ? Number(body.otherIncome) : cu.otherIncome }); if (body.nationalId && !body.nationalId.includes('•')) { cu.nationalId = body.nationalId; cu.idType = body.idType || cu.idType; } if (body.employment) cu.employment = body.employment; if (body.business) cu.business = body.business; if (body.nextOfKin) cu.nextOfKin = body.nextOfKin; save(); return { user: pub(cu) }; }
    if (p === 'api/prefs' && method === 'PUT') { const cu = requireUser(); cu.prefs = { ...cu.prefs, ...body }; save(); return { prefs: cu.prefs }; }
    if (p === 'api/security/2fa' && method === 'PUT') { const cu = requireUser(); if (body.enabled && !cu.phoneVerified) err('Verify your phone first.'); cu.twofaEnabled = !!body.enabled; save(); return { twofaEnabled: cu.twofaEnabled }; }
    if (p === 'api/security/sessions') return { sessions: [{ id: 1, ip: 'this device', user_agent: navigator.userAgent, created_at: u ? u.lastLoginAt : now(), last_seen: now(), current: true }] };
    if (p === 'api/security/activity') { const cu = requireUser(); return { activity: db.activity.filter(a => a.customerId === cu.id).reverse() }; }

    // dashboard & loans
    if (p === 'api/dashboard') {
      const cu = requireUser();
      const ls = myLoans(cu), active = ls.filter(l => l.status === 'active'), apps = myApps(cu);
      const next = active.filter(l => l.nextDueDate).sort((a, b) => a.nextDueDate.localeCompare(b.nextDueDate))[0];
      return {
        user: pub(cu),
        stats: { totalBorrowed: ls.reduce((s, l) => s + l.principal, 0), activeLoans: active.length, outstanding: r2(active.reduce((s, l) => s + l.outstanding, 0)), totalRepaid: ls.reduce((s, l) => s + l.totalRepaid, 0), nextRepaymentAmount: next ? next.nextDueAmount : null, nextRepaymentDate: next ? next.nextDueDate : null, nextRepaymentLoan: next ? next.ref : null, pendingApplications: apps.filter(a => ['submitted', 'under_review', 'pending_documents'].includes(a.status)).length, approvedApplications: apps.filter(a => a.status === 'approved').length, rejectedApplications: apps.filter(a => a.status === 'rejected').length, unreadNotifications: db.notifications.filter(n => n.customerId === cu.id && n.channel === 'inapp' && !n.readAt).length },
        loans: active.map(serLoan), applications: apps.slice(-5).reverse().map(serApp),
        recentTransactions: db.transactions.filter(t => t.customerId === cu.id).slice(-8).reverse().map(serTxn),
        kyc: { status: cu.kycStatus, emailVerified: cu.emailVerified, phoneVerified: cu.phoneVerified, documents: db.documents.filter(d => d.customerId === cu.id) },
        announcements: db.announcements
      };
    }
    if (p === 'api/loans' && seg.length === 2) { const cu = requireUser(); return { loans: myLoans(cu).slice().reverse().map(serLoan) }; }
    if (p.startsWith('api/loans/') && seg.length === 3) { const cu = requireUser(); const l = db.loans.find(x => x.id === seg[2] && x.customerId === cu.id); if (!l) err('Loan not found.', 404); return { loan: serLoan(l), transactions: db.transactions.filter(t => t.loanId === l.id).reverse().map(serTxn) }; }
    if (p === 'api/applications' && method === 'GET') { const cu = requireUser(); return { applications: myApps(cu).slice().reverse().map(serApp) }; }
    if (p === 'api/applications' && method === 'POST') {
      const cu = requireUser(); const prod = GFS.productById(body.productId); if (!prod) err('Choose a valid loan product.');
      const amount = Number(body.amount), term = Number(body.term || body.termMonths);
      if (amount < prod.min || amount > prod.max) err(`Amount must be between ${GFS.mk(prod.min)} and ${GFS.mk(prod.max)}.`);
      if (!prod.terms.includes(term)) err('Choose a standard term.');
      if (!body.purpose) err('Tell us what the loan is for.');
      if (!body.acceptTerms) err('You must accept the loan agreement terms.');
      const app = { id: uid(), ref: GFS.refs.application(nextSeq('application')), customerId: cu.id, productId: prod.id, amount, termMonths: term, freq: prod.freqs.includes(body.freq) ? body.freq : prod.freqs[0], purpose: body.purpose, status: 'submitted', stage: 'intake', income: Number(body.income || cu.monthlyIncome), expenses: Number(body.expenses || cu.monthlyExpenses), disbursementMethod: body.disbursementMethod || 'mpamba', disbursementAccount: body.disbursementAccount || cu.phone, timeline: [{ stage: 'intake', note: 'Application received.', at: now() }], createdAt: now(), updatedAt: now() };
      db.applications.push(app);
      (body.guarantors || []).forEach(g => { if (g.name && g.phone) db.guarantors.push({ id: uid(), customerId: cu.id, applicationId: app.id, name: g.name, phone: GFS.normPhone(g.phone), relationship: g.relationship || '', employer: g.employer || '', consent: !!g.consent, status: g.consent ? 'verified' : 'pending', createdAt: now() }); });
      if (body.collateral && body.collateral.type) db.collateral.push({ id: uid(), customerId: cu.id, applicationId: app.id, type: body.collateral.type, description: body.collateral.description || '', estimated_value: Number(body.collateral.value || 0), status: 'pending', createdAt: now() });
      pipeline(app); bridgePush(app);
      addNotif(cu.id, 'application', 'Application received', `We received your ${prod.name} application ${app.ref}.`, ['inapp', 'sms', 'email']);
      db.activity.push({ id: uid(), customerId: cu.id, action: 'Loan application submitted', detail: app.ref, createdAt: now() });
      save(); return { application: serApp(app), reference: app.ref };
    }
    if (seg[1] === 'applications' && seg.length === 3) { const cu = requireUser(); const a = db.applications.find(x => x.id === seg[2] && x.customerId === cu.id); if (!a) err('Application not found.', 404); return { application: serApp(a) }; }
    if (seg[1] === 'applications' && seg[3] === 'reassess') { const cu = requireUser(); const a = db.applications.find(x => x.id === seg[2] && x.customerId === cu.id); if (!a) err('Application not found.', 404); pipeline(a); save(); return { application: serApp(a) }; }
    if (seg[1] === 'applications' && seg[3] === 'cancel') { const cu = requireUser(); const a = db.applications.find(x => x.id === seg[2] && x.customerId === cu.id); if (!a) err('Application not found.', 404); a.status = 'cancelled'; a.stage = 'closed'; save(); return { application: serApp(a) }; }
    if (seg[1] === 'applications' && seg[3] === 'accept-agreement') {
      const cu = requireUser(); const a = db.applications.find(x => x.id === seg[2] && x.customerId === cu.id); if (!a) err('Application not found.', 404);
      if (a.status !== 'approved') err('Only approved offers can be accepted.');
      if (!body.accept) err('Tick the acceptance box.');
      if (String(body.name || '').toLowerCase() !== (cu.firstName + ' ' + cu.lastName).toLowerCase()) err('Type your full name exactly as registered.');
      if (!body.idNumber) err('Enter your ID number.');
      if (!body.signature) err('Provide your signature.');
      a.agreementAcceptedAt = now(); a.status = 'disbursed'; a.stage = 'complete';
      a.timeline.push({ stage: 'agreement', note: 'Agreement signed electronically.', at: now() }, { stage: 'disbursement', note: 'Funds disbursed.', at: now() });
      const loan = mkLoan(cu, a, 0);
      addNotif(cu.id, 'disbursement', 'Loan disbursed 💰', `${GFS.mk(loan.netDisbursed)} sent via ${loan.disbursementMethod}. Loan ${loan.ref} is active.`, ['inapp', 'sms', 'email']);
      db.activity.push({ id: uid(), customerId: cu.id, action: 'Loan agreement signed & disbursed', detail: loan.ref, createdAt: now() });
      save(); return { application: serApp(a), loan: serLoan(loan) };
    }

    // requests
    if (p === 'api/requests' && method === 'GET') { const cu = requireUser(); return { requests: db.requests.filter(r => r.customerId === cu.id).reverse().map(r => ({ ...r, loanRef: (db.loans.find(l => l.id === r.loanId) || {}).ref, payload: r.payload || {} })) }; }
    if (p === 'api/requests' && method === 'POST') {
      const cu = requireUser(); const type = body.type; const loan = body.loanId ? db.loans.find(l => l.id === body.loanId && l.customerId === cu.id) : null;
      const ref = GFS.refs.request(nextSeq('request')); let response = '', status = 'approved', payload = body.payload || {};
      if (type === 'settlement' && loan) { payload.quote = serLoan(loan).settlement; response = `Settlement statement ${ref}: pay ${GFS.mk(payload.quote.total)} to settle ${loan.ref} in full. Future interest is waived.`; }
      else if (type === 'topup' && loan) { const p = GFS.productById(loan.productId); const maxTop = Math.max(0, Math.min(p.max - loan.principal, loan.principal * 0.5)); payload = { amount: Math.min(Number(body.amount || maxTop), maxTop), maxTop, baseLoan: loan.ref }; response = `Top-up of ${GFS.mk(payload.amount)} pre-assessed against ${loan.ref}.`; }
      else if (type === 'renewal') response = 'Renewal noted. Once the current loan is settled, a renewal application will be fast-tracked.';
      else if (type === 'restructure' || type === 'refinance') { response = `${type} proposal recorded. A credit officer will confirm within 2 working days.`; status = 'under_review'; }
      const rq = { id: uid(), ref, customerId: cu.id, loanId: loan ? loan.id : null, type, payload, status, response, createdAt: now() };
      db.requests.push(rq); addNotif(cu.id, 'request', `${type} request ${ref}`, response, ['inapp', 'sms']); save();
      return { request: rq };
    }

    // payments
    if (p === 'api/payments/initiate' && method === 'POST') {
      const cu = requireUser(); const loan = db.loans.find(l => l.id === body.loanId && l.customerId === cu.id); if (!loan) err('Loan not found.', 404);
      if (loan.status !== 'active') err('This loan is not active.');
      const method = GFS.PAYMENT_METHODS.find(m => m.id === body.method); if (!method) err('Choose a valid payment method.');
      let amount = body.settle ? serLoan(loan).settlement.total : Number(body.amount);
      if (!(amount > 0)) err('Enter an amount greater than zero.');
      if (body.idempotencyKey) { const ex = db.transactions.find(t => t.idempotencyKey === body.idempotencyKey && t.customerId === cu.id); if (ex) return { payment: serTxn(ex), duplicate: true }; }
      const t = mkTxn(cu, loan, body.settle ? 'settlement' : 'repayment', amount, method.id, 'pending');
      t.idempotencyKey = body.idempotencyKey || null; t.meta = { account: body.account || cu.phone, settle: !!body.settle, sandbox: true };
      save();
      return { payment: serTxn(t), instructions: method.type === 'mobile' ? `A ${method.name} prompt has been sent to ${body.account || cu.phone}. Approve it with your PIN. Reference ${t.ref}.` : `Pay ${GFS.mk(amount)} quoting reference ${t.ref}, then confirm below.`, sandbox: true };
    }
    if (seg[1] === 'payments' && seg[3] === 'confirm') {
      const cu = requireUser(); const t = db.transactions.find(x => x.id === seg[2] && x.customerId === cu.id); if (!t) err('Transaction not found.', 404);
      if (body.outcome === 'failure') { t.status = 'failed'; t.failureReason = body.reason || 'Payment was not completed.'; addNotif(cu.id, 'payment', 'Payment failed', `Payment ${t.ref} did not go through. No money was deducted.`, ['inapp', 'sms']); save(); return { payment: serTxn(t), failed: true }; }
      if (t.status === 'verified') return { payment: serTxn(t), alreadyVerified: true };
      const loan = db.loans.find(l => l.id === t.loanId);
      const alloc = applyLocal(loan, t.amount, t);
      t.status = 'verified'; t.verifiedAt = now();
      const receipt = { id: uid(), ref: GFS.refs.receipt(), transactionId: t.id, customerId: cu.id, loanId: loan.id, amount: t.amount, method: t.method, createdAt: now() };
      db.receipts.push(receipt); t.receiptId = receipt.id;
      addNotif(cu.id, 'payment', 'Payment received ✓', `${GFS.mk(t.amount)} received for loan ${loan.ref}. Receipt ${receipt.ref}. ${loan.status === 'closed' ? 'Loan fully settled!' : 'New balance: ' + GFS.mk(loan.outstanding) + '.'}`, ['inapp', 'sms', 'email']);
      db.activity.push({ id: uid(), customerId: cu.id, action: 'Payment verified', detail: `${t.ref} · receipt ${receipt.ref}`, createdAt: now() });
      save(); return { payment: serTxn(t), receipt: { id: receipt.id, ref: receipt.ref, amount: receipt.amount }, loan: serLoan(loan), allocation: alloc };
    }
    if (p === 'api/transactions') { const cu = requireUser(); let ts = db.transactions.filter(t => t.customerId === cu.id); if (query.type) ts = ts.filter(t => t.type === query.type); if (query.status) ts = ts.filter(t => t.status === query.status); if (query.loanId) ts = ts.filter(t => t.loanId === query.loanId); return { transactions: ts.slice().reverse().map(serTxn) }; }
    if (p === 'api/receipts' && seg.length === 2) { const cu = requireUser(); return { receipts: db.receipts.filter(r => r.customerId === cu.id).slice().reverse().map(r => ({ ...r, loanRef: (db.loans.find(l => l.id === r.loanId) || {}).ref })) }; }
    if (seg[1] === 'receipts' && seg.length === 3) { const cu = requireUser(); const r = db.receipts.find(x => x.id === seg[2] && x.customerId === cu.id); if (!r) err('Receipt not found.', 404); return { receipt: r, transaction: serTxn(db.transactions.find(t => t.id === r.transactionId)) }; }

    // documents / guarantors / collateral
    if (p === 'api/documents' && method === 'GET') { const cu = requireUser(); return { documents: db.documents.filter(d => d.customerId === cu.id).reverse(), kycStatus: cu.kycStatus }; }
    if (p === 'api/documents' && method === 'POST') {
      const cu = requireUser();
      if (!['image/png', 'image/jpeg', 'image/webp', 'application/pdf'].includes(body.mime)) err('Only PNG, JPG, WEBP or PDF files are accepted.');
      if (body.data && body.data.length > 2 * 1024 * 1024) err('Device-local mode limits files to 1.5 MB. Connect the backend for larger files.');
      const d = { id: uid(), ref: GFS.refs.document(), customerId: cu.id, applicationId: body.applicationId || null, kind: body.kind || 'other', filename: body.filename, mime: body.mime, size: body.data ? Math.round(body.data.length * 0.75) : 0, status: 'verified', uploadedAt: now(), verifiedAt: now(), data: body.data ? `data:${body.mime};base64,${body.data}` : null, notes: 'Device-local demo storage.' };
      db.documents.push(d);
      if (d.kind === 'avatar') cu.avatarDocId = d.id;
      const hasId = db.documents.some(x => x.customerId === cu.id && ['national_id', 'passport', 'driving_licence'].includes(x.kind));
      if (hasId && cu.phoneVerified && cu.emailVerified) cu.kycStatus = 'verified';
      save(); return { document: d };
    }
    if (seg[1] === 'documents' && seg[3] === 'file') { const cu = requireUser(); const d = db.documents.find(x => x.id === seg[2] && x.customerId === cu.id); if (!d) err('Document not found.', 404); return { ok: true }; }
    if (seg[1] === 'documents' && method === 'DELETE') { const cu = requireUser(); db.documents = db.documents.filter(x => !(x.id === seg[2] && x.customerId === cu.id)); save(); return { ok: true }; }
    if (p === 'api/guarantors' && method === 'GET') { const cu = requireUser(); return { guarantors: db.guarantors.filter(g => g.customerId === cu.id).reverse() }; }
    if (p === 'api/guarantors' && method === 'POST') { const cu = requireUser(); if (!body.name || !GFS.isPhoneMW(body.phone || '')) err('Guarantor name and valid phone are required.'); if (!body.consent) err('The guarantor must consent.'); const g = { id: uid(), customerId: cu.id, applicationId: body.applicationId || null, loanId: body.loanId || null, name: body.name, phone: GFS.normPhone(body.phone), relationship: body.relationship || '', employer: body.employer || '', consent: true, status: 'verified', createdAt: now() }; db.guarantors.push(g); save(); return { guarantor: g }; }
    if (p === 'api/collateral' && method === 'GET') { const cu = requireUser(); return { collateral: db.collateral.filter(c => c.customerId === cu.id).reverse() }; }
    if (p === 'api/collateral' && method === 'POST') { const cu = requireUser(); const c = { id: uid(), customerId: cu.id, applicationId: body.applicationId || null, loanId: body.loanId || null, type: body.type, description: body.description || '', estimated_value: Number(body.estimatedValue || 0), status: 'pending', createdAt: now() }; db.collateral.push(c); save(); return { collateral: c }; }

    // notifications
    if (p === 'api/notifications' && method === 'GET') { const cu = requireUser(); let ns = db.notifications.filter(n => n.customerId === cu.id); if (query.channel) ns = ns.filter(n => n.channel === query.channel); return { notifications: ns.slice().reverse(), unread: ns.filter(n => n.channel === 'inapp' && !n.readAt).length }; }
    if (seg[1] === 'notifications' && seg[2] === 'read-all') { const cu = requireUser(); db.notifications.forEach(n => { if (n.customerId === cu.id) n.readAt = now(); }); save(); return { ok: true }; }
    if (seg[1] === 'notifications' && seg[3] === 'read') { const cu = requireUser(); const n = db.notifications.find(x => x.id === seg[2] && x.customerId === cu.id); if (n) n.readAt = now(); save(); return { ok: true }; }

    // support
    if (p === 'api/chat' && method === 'GET') { const cu = requireUser(); return { messages: db.chat.filter(m => m.customerId === cu.id) }; }
    if (p === 'api/chat' && method === 'POST') {
      const cu = requireUser(); const msg = String(body.message || ''); db.chat.push({ id: uid(), customerId: cu.id, sender: 'customer', body: msg, createdAt: now() });
      const ls = myLoans(cu).filter(l => l.status === 'active'); const m = msg.toLowerCase();
      let reply;
      if (/balance|owe|outstanding/.test(m)) reply = ls.length ? ls.map(l => `Loan ${l.ref}: outstanding ${GFS.mk(l.outstanding)}, next instalment ${GFS.mk(l.nextDueAmount || 0)} due ${l.nextDueDate || '—'}.`).join('\n') : 'You have no active loans. Would you like to apply?';
      else if (/rate|interest/.test(m)) reply = 'Monthly rates (declining balance): ' + GFS.PRODUCTS.map(p => `${p.name} ${p.rate}%`).join(', ') + '. Use the Loan Calculator for an exact quote.';
      else if (/repay|pay|mpamba|airtel/.test(m)) reply = 'Repay from your portal with TNM Mpamba, Airtel Money, bank transfer or cash at a branch. Every verified payment updates your balance instantly and issues a receipt.';
      else if (/settle|early/.test(m)) reply = 'You can settle early anytime — pay outstanding principal plus accrued interest only; future interest is waived. Open your loan and choose Settle loan.';
      else if (/hello|hi|hey/.test(m)) reply = `Hello ${cu.firstName}! 👋 Ask me about your balance, next payment, rates, applying or repaying.`;
      else reply = 'I can help with your balance, next payment, products and rates, applying, repaying, early settlement, documents and top-ups. Try "What is my balance?" or open a support ticket for a human agent.';
      db.chat.push({ id: uid(), customerId: cu.id, sender: 'bot', body: reply, createdAt: now() }); save();
      return { reply, sender: 'bot' };
    }
    if (p === 'api/tickets' && method === 'GET') { const cu = requireUser(); return { tickets: db.tickets.filter(t => t.customerId === cu.id).slice().reverse() }; }
    if (p === 'api/tickets' && method === 'POST') {
      const cu = requireUser(); if (!body.subject || !body.message) err('Subject and message are required.');
      const t = { id: uid(), ref: GFS.refs.ticket(nextSeq('ticket')), customerId: cu.id, subject: body.subject, category: body.category || 'general', priority: body.category === 'complaint' ? 'high' : 'normal', status: 'open', createdAt: now(), updatedAt: now() };
      db.tickets.push(t);
      db.ticketMessages.push({ id: uid(), ticketId: t.id, sender: 'customer', sender_name: cu.firstName + ' ' + cu.lastName, body: body.message, createdAt: now() });
      const ack = `Thank you, ${cu.firstName}. Ticket ${t.ref} is open. Our support team will respond shortly.`;
      db.ticketMessages.push({ id: uid(), ticketId: t.id, sender: 'agent', sender_name: 'GFS Customer Care', body: ack, createdAt: now() });
      addNotif(cu.id, 'support', `Ticket ${t.ref} opened`, ack, ['inapp', 'sms']); save(); return { ticket: t };
    }
    if (seg[1] === 'tickets' && seg.length === 3) { const cu = requireUser(); const t = db.tickets.find(x => x.id === seg[2] && x.customerId === cu.id); if (!t) err('Ticket not found.', 404); return { ticket: t, messages: db.ticketMessages.filter(m => m.ticketId === t.id) }; }
    if (seg[1] === 'tickets' && seg[3] === 'reply') { const cu = requireUser(); const t = db.tickets.find(x => x.id === seg[2] && x.customerId === cu.id); if (!t) err('Ticket not found.', 404); db.ticketMessages.push({ id: uid(), ticketId: t.id, sender: 'customer', sender_name: cu.firstName + ' ' + cu.lastName, body: body.message, createdAt: now() }); const auto = `Thanks — your update was added to ticket ${t.ref}. An agent will respond.`; db.ticketMessages.push({ id: uid(), ticketId: t.id, sender: 'agent', sender_name: 'GFS Customer Care', body: auto, createdAt: now() }); save(); return { ok: true, reply: auto }; }
    if (seg[1] === 'tickets' && seg[3] === 'close') { const cu = requireUser(); const t = db.tickets.find(x => x.id === seg[2] && x.customerId === cu.id); if (t) t.status = 'closed'; save(); return { ok: true }; }

    // statements / settings / export
    if (p === 'api/statements') { const cu = requireUser(); return { loans: myLoans(cu).map(l => ({ id: l.id, ref: l.ref, productId: l.productId, status: l.status, principal: l.principal, outstanding: l.outstanding, disbursedAt: l.disbursedAt })), receipts: db.receipts.filter(r => r.customerId === cu.id).reverse(), types: ['Loan statements', 'Repayment statements', 'Payment transaction statements', 'Outstanding balance statements', 'Settlement statements', 'Disbursement confirmations', 'Signed agreements'] }; }
    if (p === 'api/settings/system') { const cu = requireUser(); return { readOnly: true, ownedBy: 'Golden Loan Services back-office system', company: GFS.COMPANY, products: GFS.PRODUCTS, paymentMethods: GFS.PAYMENT_METHODS, branches: GFS.BRANCHES, rules: GFS.RULES, theme: { gold: '#C9A227', emerald: '#0E9F6E' }, currency: GFS.CURRENCY, note: 'System settings are managed in the Golden Loan Services admin system. Customers cannot change them.' }; }
    if ((p === 'api/settings/system' || p === 'api/settings') && (method === 'POST' || method === 'PUT')) err('System settings are managed by the back-office and cannot be changed from a customer account.', 403);
    if (p === 'api/export/my-data') { const cu = requireUser(); return { exportedAt: now(), profile: pub(cu), applications: myApps(cu), loans: myLoans(cu), transactions: db.transactions.filter(t => t.customerId === cu.id), receipts: db.receipts.filter(r => r.customerId === cu.id), notifications: db.notifications.filter(n => n.customerId === cu.id), documents: db.documents.filter(d => d.customerId === cu.id).map(({ data, ...rest }) => rest), activity: db.activity.filter(a => a.customerId === cu.id) }; }
    if (p.startsWith('api/integration/')) return { ok: true, deviceLocal: true, bridge: bridgeStatus() };

    err(`Not available in device-local mode: ${method} ${p}`, 404);
  }

  function init() { load(); seed(); }
  return { init, request, printDocument, fileURL, bridgeStatus, reset() { localStorage.removeItem(KEY); load(); seed(); } };
})();
