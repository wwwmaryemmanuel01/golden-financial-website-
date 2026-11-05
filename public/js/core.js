/* ============================================================
   GOLDEN FINANCIAL SERVICES — shared financial core
   Isomorphic module: the SAME rules run in the secure backend
   (server/) and in the GitHub Pages device-local adapter
   (public/js/local.js). One source of truth for money.
   Currency: Malawi Kwacha (MWK).
   Rates/fees/ranges mirror the golden-loan-services admin system.
   ============================================================ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GFS = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const CURRENCY = 'MWK';
  const DAY = 86400000;

  /* ---------------- loan products (mirrors admin PRODUCTS) ---------------- */
  const PRODUCTS = [
    { id: 'PL', name: 'Personal Loans',        min: 50000,   max: 1000000,   rate: 3.0, fee: 2.0, terms: [1, 3, 6, 12],            freqs: ['monthly', 'fortnightly'],            collateral: false, guarantors: 1, colour: '#C9A227',
      tagline: 'Flexible cash for life’s plans', blurb: 'Unsecured personal financing for school fees, home improvements, weddings, travel and everyday goals. Fast decisions, clear terms.',
      uses: ['School fees', 'Home improvements', 'Weddings & events', 'Debt consolidation', 'Travel'],
      eligibility: ['Malawian citizen or resident aged 18+', 'National ID, passport or driving licence', 'Proof of income (payslip or bank statement)', 'One guarantor with a valid ID', 'Active mobile money number'] },
    { id: 'BL', name: 'Business Loans',        min: 100000,  max: 10000000,  rate: 3.5, fee: 2.5, terms: [6, 9, 12, 18, 24, 36],   freqs: ['monthly', 'fortnightly', 'weekly'],  collateral: true,  guarantors: 1, colour: '#0E9F6E',
      tagline: 'Grow your business with confidence', blurb: 'Working capital and expansion finance for SMEs, traders and enterprises. Stock, equipment, premises and cash-flow support.',
      uses: ['Working capital', 'Stock purchase', 'Equipment', 'Business expansion', 'Premises'],
      eligibility: ['Registered business or verifiable trading activity', '6+ months of trading history', 'Business bank or mobile money statements', 'Collateral for amounts above MK 2,000,000', 'One guarantor'] },
    { id: 'EL', name: 'Emergency Loans',       min: 20000,   max: 500000,    rate: 4.0, fee: 2.0, terms: [1, 2, 3],                freqs: ['monthly', 'weekly', 'daily'],        collateral: false, guarantors: 1, colour: '#D97706',
      tagline: 'Help when you need it most', blurb: 'Same-day short-term credit for urgent, unexpected needs — funerals, urgent travel, emergency repairs.',
      uses: ['Funeral expenses', 'Urgent travel', 'Emergency repairs', 'Unexpected bills'],
      eligibility: ['Valid national ID', 'Verifiable income or repayment source', 'Active mobile money number', 'One guarantor'] },
    { id: 'SA', name: 'Salary Advance Loans',  min: 50000,   max: 800000,    rate: 2.5, fee: 1.5, terms: [1, 3, 6],                freqs: ['monthly'],                           collateral: false, guarantors: 0, colour: '#2F6FED',
      tagline: 'Bridge the gap to payday', blurb: 'Advance against your next salary for confirmed employees. Repayments align with your pay date.',
      uses: ['Mid-month cash flow', 'School fees', 'Medical bills', 'Family commitments'],
      eligibility: ['Confirmed employee (3+ months in post)', 'Latest payslip', 'Employer confirmation letter', 'Salary paid through a bank or mobile money'] },
    { id: 'AL', name: 'Agricultural Loans',    min: 40000,   max: 1500000,   rate: 3.0, fee: 2.0, terms: [3, 6, 9, 12],            freqs: ['monthly'],                           collateral: false, guarantors: 1, colour: '#7C5CF0',
      tagline: 'Finance the season, harvest the return', blurb: 'Input and equipment finance for farmers and agri-businesses, with repayment plans shaped around the harvest.',
      uses: ['Seed & fertiliser', 'Irrigation', 'Farm equipment', 'Livestock', 'Post-harvest storage'],
      eligibility: ['Verifiable farming activity or land access', 'Season plan and budget', 'Group or extension-worker reference', 'One guarantor'] },
    { id: 'ED', name: 'Education Loans',       min: 50000,   max: 3000000,   rate: 2.0, fee: 1.5, terms: [6, 12, 18, 24],          freqs: ['monthly'],                           collateral: false, guarantors: 1, colour: '#0891B2',
      tagline: 'Invest in learning', blurb: 'Tuition and study finance for students, parents and professionals — school fees, university, college and certification.',
      uses: ['School & university fees', 'Boarding', 'Books & equipment', 'Professional courses'],
      eligibility: ['Admission or enrolment letter', 'Fee structure from the institution', 'Parent/guardian or sponsor income proof', 'One guarantor'] },
    { id: 'ML', name: 'Medical Loans',         min: 30000,   max: 2000000,   rate: 2.5, fee: 1.5, terms: [3, 6, 9, 12],            freqs: ['monthly'],                           collateral: false, guarantors: 1, colour: '#DC2626',
      tagline: 'Care now, pay in instalments', blurb: 'Treatment finance paid directly to hospitals and clinics where possible, so care is never delayed.',
      uses: ['Hospital bills', 'Surgery', 'Maternity', 'Chronic care', 'Medical travel'],
      eligibility: ['Medical report or quotation from a recognised facility', 'Valid national ID', 'Proof of income', 'One guarantor'] },
    { id: 'AF', name: 'Asset Financing',       min: 200000,  max: 15000000,  rate: 2.8, fee: 2.0, terms: [12, 18, 24, 36, 48],     freqs: ['monthly'],                           collateral: true,  guarantors: 1, colour: '#475569',
      tagline: 'Own the asset, spread the cost', blurb: 'Finance vehicles, machinery, solar systems and equipment. The asset secures the loan until the final instalment.',
      uses: ['Vehicles', 'Machinery', 'Solar & power', 'Office equipment', 'Refrigeration'],
      eligibility: ['Supplier quotation or invoice', '30% deposit may apply', 'Comprehensive insurance where relevant', 'Asset registered as security'] },
    { id: 'GL', name: 'Group Loans',           min: 30000,   max: 1000000,   rate: 2.5, fee: 1.5, terms: [3, 6, 9, 12],            freqs: ['monthly', 'fortnightly', 'weekly'],  collateral: false, guarantors: 2, colour: '#DB2777',
      tagline: 'Together we borrow, together we grow', blurb: 'Joint-liability lending for village banks, cooperatives and savings groups. Members guarantee one another.',
      uses: ['Small trading', 'Input purchase', 'Group enterprise', 'Income smoothing'],
      eligibility: ['Group of 4+ members with a constitution', 'Group savings history', 'Joint liability agreement', 'Two member guarantors per borrower'] },
    { id: 'MG', name: 'Mortgage Loans',        min: 2000000, max: 80000000,  rate: 1.8, fee: 1.0, terms: [36, 60, 120, 180, 240],  freqs: ['monthly'],                           collateral: true,  guarantors: 1, colour: '#065F46',
      tagline: 'A home of your own', blurb: 'Long-term property finance for purchase, construction and renovation, secured on the property itself.',
      uses: ['Home purchase', 'Construction', 'Renovation', 'Land purchase with title'],
      eligibility: ['Titled property or registered sale agreement', 'Professional valuation', '30% deposit or equity', 'Verifiable stable income', 'Property insurance'] }
  ];
  const productById = id => PRODUCTS.find(p => p.id === id) || null;
  const productByName = n => PRODUCTS.find(p => p.name === n) || null;

  /* ---------------- system rules (read-only for customers) ---------------- */
  const RULES = {
    currency: CURRENCY,
    affordabilityCap: 0.40,          // instalment ≤ 40% of net monthly income (admin rule)
    latePenaltyPct: 2.0,             // % of overdue instalment, per month overdue
    graceDays: 3,
    maxActiveLoans: 2,
    maxExposure: 20000000,
    settlementDiscountPct: 0,        // future interest already waived on settlement
    minAge: 18, maxAge: 65,
    otpTtlMinutes: 10,
    sessionHours: 12,
    idleTimeoutMinutes: 20,
    maxLoginAttempts: 5,
    lockoutMinutes: 15,
    allocationOrder: ['penalties', 'fees', 'interest', 'principal'],
    periodsPerYear: { monthly: 12, fortnightly: 26, weekly: 52, daily: 365 }
  };

  const GFS_DEFAULT_RULES = Object.freeze({ ...RULES });

  /* ---------------- money & numbers ---------------- */
  const round2 = v => Math.round((Number(v) + Number.EPSILON) * 100) / 100;
  const mk = v => 'MK ' + (Number(v) || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });
  const mk2 = v => 'MK ' + (Number(v) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const num = v => (Number(v) || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });

  /* ---------------- dates ---------------- */
  const iso = d => new Date(d).toISOString().slice(0, 10);
  const addMonths = (d, n) => { const x = new Date(d); const day = x.getDate(); x.setMonth(x.getMonth() + n); if (x.getDate() < day) x.setDate(0); return x; };
  const addDays = (d, n) => new Date(new Date(d).getTime() + n * DAY);
  const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / DAY);
  const fmtDate = d => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
  const fmtDateTime = d => d ? new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

  /* ---------------- repayment engine ----------------
     Declining-balance (reducing) interest, equal instalments (annuity).
     Period rate = nominal monthly rate × 12 ÷ periods per year.
     Arrangement fee is a % of principal, deducted at disbursement. */
  function periodRate(monthlyPct, freq, config = RULES) {
    const ppy = config.periodsPerYear[freq] || 12;
    return (monthlyPct / 100) * 12 / ppy;
  }
  function periodsFor(termMonths, freq, config = RULES) {
    const ppy = config.periodsPerYear[freq] || 12;
    return Math.max(1, Math.round(termMonths * ppy / 12));
  }
  function instalmentFor(principal, monthlyPct, termMonths, freq, config = RULES) {
    const r = periodRate(monthlyPct, freq, config), n = periodsFor(termMonths, freq, config);
    if (r === 0) return round2(principal / n);
    return round2(principal * r / (1 - Math.pow(1 + r, -n)));
  }
  function nextDueDate(start, freq, i) {
    const s = new Date(start);
    if (freq === 'monthly') return addMonths(s, i + 1);
    if (freq === 'fortnightly') return addDays(s, 14 * (i + 1));
    if (freq === 'weekly') return addDays(s, 7 * (i + 1));
    return addDays(s, i + 1); // daily
  }
  /* Full amortisation schedule. Returns rows + summary. */
  function amortize({ amount, monthlyPct, termMonths, freq = 'monthly', feePct = 0, startDate = new Date(), rules = RULES }) {
    const P = Number(amount), r = periodRate(monthlyPct, freq, rules), n = periodsFor(termMonths, freq, rules);
    const inst = instalmentFor(P, monthlyPct, termMonths, freq, rules);
    const fee = round2(P * feePct / 100);
    let bal = P, totalInt = 0;
    const rows = [];
    for (let i = 0; i < n; i++) {
      const interest = round2(bal * r);
      let principal = round2(inst - interest);
      let payment = inst;
      if (i === n - 1) { principal = round2(bal); payment = round2(principal + interest); } // final row clears rounding
      const opening = round2(bal);
      bal = round2(bal - principal);
      totalInt = round2(totalInt + interest);
      rows.push({
        no: i + 1, dueDate: iso(nextDueDate(startDate, freq, i)), opening,
        installment: payment, principal, interest, closing: Math.max(0, bal), status: 'pending', paid: 0
      });
    }
    const totalRepay = round2(P + totalInt);
    return {
      principal: P, monthlyPct, freq, termMonths, periods: n, installment: inst,
      fee, netDisbursement: round2(P - fee), totalInterest: totalInt, totalRepayable: totalRepay,
      totalCost: round2(totalInt + fee), startDate: iso(startDate), endDate: rows.length ? rows[rows.length - 1].dueDate : iso(startDate),
      equivalents: {
        monthly: round2(inst * (rules.periodsPerYear[freq] || 12) / 12),
        weekly: round2(inst * (rules.periodsPerYear[freq] || 12) / 52),
        daily: round2(inst * (rules.periodsPerYear[freq] || 12) / 365)
      },
      rows
    };
  }

  /* ---------------- eligibility (automated assessment) ---------------- */
  function assess({ product, amount, termMonths, freq = 'monthly', income = 0, expenses = 0, existingObligations = 0, activeLoans = 0, exposure = 0, age = 30, kycVerified = false, guarantors = 0, collateralValue = 0 }, options = {}) {
    const RULES = { ...GFS_DEFAULT_RULES, ...(options.rules || {}) };
    const p = options.product || (typeof product === 'string' ? productById(product) : product);
    const reasons = [], warnings = [];
    if (!p) return { eligible: false, score: 0, reasons: ['Unknown loan product.'], warnings };
    if (amount < p.min) reasons.push(`Amount is below the ${p.name} minimum of ${mk(p.min)}.`);
    if (amount > p.max) reasons.push(`Amount is above the ${p.name} maximum of ${mk(p.max)}.`);
    if (!p.terms.includes(Number(termMonths))) warnings.push(`Requested term is outside the standard ${p.name} terms (${p.terms.join(', ')} months).`);
    if (age < RULES.minAge) reasons.push(`Applicant must be at least ${RULES.minAge} years old.`);
    if (age > RULES.maxAge) warnings.push(`Applicants above ${RULES.maxAge} are referred for manual review.`);
    if (activeLoans >= RULES.maxActiveLoans) reasons.push(`Maximum of ${RULES.maxActiveLoans} active loans per customer reached.`);
    if (exposure + amount > RULES.maxExposure) reasons.push(`Total exposure would exceed the ${mk(RULES.maxExposure)} customer limit.`);
    if (guarantors < p.guarantors) reasons.push(`${p.name} requires ${p.guarantors} guarantor(s); ${guarantors} provided.`);
    if (p.collateral && amount > 2000000 && collateralValue < amount * 0.8) reasons.push(`Collateral valued at ≥ 80% of the amount is required above MK 2,000,000 (provided ${mk(collateralValue)}).`);
    const q = amortize({ amount, monthlyPct: p.rate, termMonths, freq, feePct: p.fee, rules: RULES });
    const monthlyInst = q.equivalents.monthly;
    const net = Math.max(0, income - expenses);
    const capacity = round2(net * RULES.affordabilityCap - existingObligations);
    const dti = income > 0 ? round2((monthlyInst + existingObligations) / income * 100) : 100;
    if (income <= 0) reasons.push('Monthly income is required for the affordability assessment.');
    else if (monthlyInst > capacity) reasons.push(`Instalment ${mk(monthlyInst)}/month exceeds your affordability capacity of ${mk(Math.max(0, capacity))} (${Math.round(RULES.affordabilityCap * 100)}% of net income less existing obligations).`);
    if (!kycVerified) warnings.push('Identity verification (KYC) is not complete — approval is conditional on document verification.');
    let score = 100;
    score -= reasons.length * 25;
    score -= warnings.length * 8;
    if (dti > 35) score -= 10;
    if (income > 0 && monthlyInst / income < 0.15) score += 5;
    score = Math.max(0, Math.min(100, Math.round(score)));
    const risk = score >= 80 ? 'Low' : score >= 55 ? 'Medium' : 'High';
    return { eligible: reasons.length === 0, score, risk, reasons, warnings, quote: q, monthlyInst, capacity, dti, netIncome: net };
  }

  /* ---------------- payment allocation (admin order) ---------------- */
  function allocate(amount, outstanding) {
    let left = round2(amount);
    const out = { penalties: 0, fees: 0, interest: 0, principal: 0 };
    for (const bucket of RULES.allocationOrder) {
      const due = round2(outstanding[bucket] || 0);
      const take = Math.min(left, due);
      out[bucket] = round2(take);
      left = round2(left - take);
      if (left <= 0) break;
    }
    out.unallocated = left; // advance payment / credit balance
    return out;
  }

  /* ---------------- settlement quote ---------------- */
  function settlementQuote(loan, asOf = new Date()) {
    const principal = round2(loan.outstanding_principal || 0);
    const interest = round2(loan.accrued_interest || 0);
    const fees = round2(loan.fees_outstanding || 0);
    const penalties = round2(loan.penalties || 0);
    const futureInterestWaived = round2(loan.future_interest || 0);
    return {
      asOf: iso(asOf), principal, accruedInterest: interest, fees, penalties,
      total: round2(principal + interest + fees + penalties),
      futureInterestWaived,
      note: 'Settling today stops all future interest. The quote is valid for 7 days.'
    };
  }

  /* ---------------- references ---------------- */
  const pad = (n, w) => String(n).padStart(w, '0');
  const rand = (n) => { const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let s = ''; const b = (typeof crypto !== 'undefined' && crypto.getRandomValues) ? crypto.getRandomValues(new Uint8Array(n)) : Array.from({ length: n }, () => Math.floor(Math.random() * 256)); for (let i = 0; i < n; i++) s += a[b[i] % a.length]; return s; };
  const stamp = (d = new Date()) => iso(d).replace(/-/g, '');
  const refs = {
    customer: seq => 'GF-' + pad(seq, 6),
    application: seq => 'GLS-APP-' + pad(seq, 6),
    loan: (seq, y = new Date().getFullYear()) => `LN-${y}-${pad(seq, 4)}`,
    transaction: (d = new Date()) => `TXN-${stamp(d)}-${rand(6)}`,
    receipt: (d = new Date()) => `RCT-${stamp(d)}-${rand(6)}`,
    disbursement: (d = new Date()) => `DSB-${stamp(d)}-${rand(6)}`,
    ticket: seq => 'TKT-' + pad(seq, 6),
    request: seq => 'RQ-' + pad(seq, 6),
    statement: (d = new Date()) => `STM-${stamp(d)}-${rand(4)}`,
    document: () => 'DOC-' + rand(8),
    otp: () => String(Math.floor(100000 + Math.random() * 900000))
  };

  /* ---------------- validation helpers ---------------- */
  const isEmail = s => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(s || '').trim());
  const isPhoneMW = s => /^(\+?265|0)?[89]\d{8}$/.test(String(s || '').replace(/[\s-]/g, ''));
  const normPhone = s => { let p = String(s || '').replace(/[\s-]/g, ''); if (p.startsWith('0')) p = '+265' + p.slice(1); else if (p.startsWith('265')) p = '+' + p; else if (!p.startsWith('+')) p = '+265' + p; return p; };
  const passwordIssues = pw => {
    const s = String(pw || ''); const issues = [];
    if (s.length < 8) issues.push('at least 8 characters');
    if (!/[A-Z]/.test(s)) issues.push('an uppercase letter');
    if (!/[a-z]/.test(s)) issues.push('a lowercase letter');
    if (!/\d/.test(s)) issues.push('a number');
    return issues;
  };

  /* ---------------- payment rails (mirrors admin payments module) ---------------- */
  const PAYMENT_METHODS = [
    { id: 'mpamba',  name: 'TNM Mpamba',     type: 'mobile',  merchant: '', instructions: 'Use the TNM Mpamba pay-bill details confirmed by your branch or the payment request in your portal. Always quote your unique payment reference.', icon: '📱', colour: '#0E9F6E' },
    { id: 'airtel',  name: 'Airtel Money',   type: 'mobile',  merchant: '', instructions: 'Use the Airtel Money merchant details confirmed by your branch or the payment request in your portal. Always quote your unique payment reference.', icon: '📲', colour: '#DC2626' },
    { id: 'bank',    name: 'Bank Transfer',  type: 'bank',    merchant: '', instructions: 'Request verified bank account details from your branch before transferring. Use your unique payment reference and submit the transfer reference for reconciliation.', icon: '🏦', colour: '#2F6FED' },
    { id: 'cash',    name: 'Cash at Branch', type: 'cash',    merchant: 'Any GFS branch', instructions: 'Pay at any branch cashier and quote your loan reference. A printed receipt is issued immediately.', icon: '💵', colour: '#C9A227' }
  ];

  const BRANCHES = [
    { city: 'Lilongwe',  address: 'City Centre, Independence Drive, Lilongwe', phone: '+265 1 770 100', hours: 'Mon–Fri 08:00–17:00 · Sat 08:00–12:00', type: 'Head Office' },
    { city: 'Blantyre',  address: 'Ginnery Corner, Victoria Avenue, Blantyre', phone: '+265 1 820 200', hours: 'Mon–Fri 08:00–17:00 · Sat 08:00–12:00', type: 'Branch' },
    { city: 'Mzuzu',     address: 'Orton Chirwa Avenue, Mzuzu', phone: '+265 1 310 300', hours: 'Mon–Fri 08:00–17:00', type: 'Branch' },
    { city: 'Zomba',     address: 'Kamuzu Highway, Zomba', phone: '+265 1 520 400', hours: 'Mon–Fri 08:00–17:00', type: 'Branch' }
  ];

  const COMPANY = {
    name: 'Golden Financial Services',
    legal: 'Golden Financial Services Limited',
    tagline: 'Your trusted partner in financial growth',
    email: 'info@goldenfinancial.mw',
    support: 'support@goldenfinancial.mw',
    phone: '+265 1 770 100',
    whatsapp: '+265 999 770 100',
    address: 'City Centre, Independence Drive, P.O. Box 1234, Lilongwe, Malawi',
    website: 'https://wwwmaryemmanuel01.github.io/golden-financial-website-/',
    adminSystem: 'https://wwwmaryemmanuel01.github.io/golden-loan-services/',
    adminRepo: 'https://github.com/wwwmaryemmanuel01/golden-loan-services',
    websiteRepo: 'https://github.com/wwwmaryemmanuel01/golden-financial-website-',
    currency: CURRENCY,
    regulator: 'Reserve Bank of Malawi',
    founded: 2018
  };

  /* Loan agreement — 13 clauses, mirrors admin agreement.html */
  const AGREEMENT_CLAUSES = [
    { t: '1. Parties', b: 'This agreement is between Golden Financial Services Limited (“the Lender”), a company registered in Malawi, and the customer named in the offer (“the Borrower”). Guarantors named in the application accept joint responsibility as set out in clause 5.' },
    { t: '2. The offer', b: 'The Lender offers the principal amount, term, interest rate and fees shown in the loan offer accepted by the Borrower in the customer portal. The offer forms part of this agreement.' },
    { t: '3. Amount, interest and fees', b: 'Interest is charged on the declining (reducing) balance at the monthly rate stated in the offer, applied per repayment period. The arrangement fee stated in the offer is deducted from the disbursement. The total repayable is the principal plus interest; fees are shown separately.' },
    { t: '4. Repayment and late payment', b: 'The Borrower shall repay by the instalments and dates in the repayment schedule. Payments are allocated to penalties, fees, interest and then principal. A late penalty of 2% of the overdue instalment applies per month (or part month) overdue after a 3-day grace period.' },
    { t: '5. Guarantors and security', b: 'Guarantors consent to being contacted and to joint liability for the debt. Where collateral is pledged, the Borrower warrants ownership and agrees not to dispose of it while the loan is outstanding. Security is released on full settlement.' },
    { t: '6. Borrower duties', b: 'The Borrower shall provide true information, keep contact details current, use the loan for the stated purpose, and notify the Lender of any change affecting repayment ability within 7 days.' },
    { t: '7. Lender duties', b: 'The Lender shall disburse as agreed, issue receipts and statements, apply payments correctly, protect the Borrower’s data, and give notice before enforcement action.' },
    { t: '8. Default and enforcement', b: 'Failure to pay an instalment within 30 days of its due date, false information, or disposal of security constitutes default. The Lender may demand the full outstanding balance, enforce security and report to credit reference bureaus, after written notice.' },
    { t: '9. Early settlement', b: 'The Borrower may settle early at any time. The settlement amount is the outstanding principal plus accrued interest, fees and penalties to the settlement date; future interest is waived. A settlement statement is issued on request.' },
    { t: '10. Data and credit bureaus', b: 'The Borrower consents to the processing of personal data for this loan, to identity and credit checks, and to reporting of repayment conduct to licensed credit reference bureaus, in line with the Privacy Policy.' },
    { t: '11. Complaints', b: 'Complaints may be lodged through the portal, by email or at any branch. The Lender will acknowledge within 2 working days and resolve within 14 working days. Unresolved complaints may be referred to the Reserve Bank of Malawi.' },
    { t: '12. Changes', b: 'The Lender may vary this agreement only as permitted by law and with notice to the Borrower. No variation increases the rate or fees on an existing loan without the Borrower’s written consent.' },
    { t: '13. Declarations', b: 'By accepting, the Borrower declares that the information given is true, that they have read and understood this agreement and the offer, that they accept the repayment schedule, and that their electronic signature is as binding as a handwritten one.' }
  ];

  const FAQS = [
    { q: 'How do I apply for a loan?', a: 'Register on this website, verify your phone and email, complete your profile and KYC, then use Apply for a Loan. You will receive a reference number (GLS-APP-…) and can track every stage in your portal.' },
    { q: 'How long does approval take?', a: 'Complete applications with verified documents are assessed automatically and most decisions are issued within 24 hours. Manual referrals may take up to 3 working days.' },
    { q: 'What interest rate will I pay?', a: 'Rates depend on the product: from 1.8% per month (mortgages) to 4.0% (emergency loans), charged on the declining balance. Your exact rate is shown in the calculator and in your offer before you accept.' },
    { q: 'What fees are charged?', a: 'A one-off arrangement fee of 1.0%–2.5% of the principal (by product) is deducted at disbursement. Late payments attract 2% of the overdue instalment per month after a 3-day grace period. There are no hidden charges.' },
    { q: 'How do I repay?', a: 'Pay from your portal with TNM Mpamba, Airtel Money, bank transfer or cash at any branch using verified provider details. Every verified payment updates your balance immediately and issues a receipt.' },
    { q: 'Can I repay early?', a: 'Yes. Request a settlement statement in your portal — you pay only the outstanding principal plus interest accrued to that date. All future interest is waived.' },
    { q: 'What documents do I need?', a: 'A national ID, passport or driving licence; proof of income (payslip or statements); and product-specific documents such as a quotation, admission letter or medical report. Upload them securely in your portal.' },
    { q: 'Do I need a guarantor or collateral?', a: 'Most products need one guarantor. Business loans above MK 2,000,000, asset financing and mortgages require security. Salary advance loans need no guarantor.' },
    { q: 'Is my information safe?', a: 'Yes. Passwords are hashed, documents are encrypted at rest, sessions expire automatically, and you can only ever see your own records. Every action is written to an audit trail.' },
    { q: 'What happens if I miss a payment?', a: 'After a 3-day grace period a 2% late penalty applies to the overdue instalment. You will receive reminders by SMS and in the portal. Contact us early — we can discuss restructuring.' },
    { q: 'Can I borrow again while I have a loan?', a: 'Yes, up to 2 active loans and a total exposure of MK 20,000,000, subject to affordability. You can also request a top-up, renewal or refinancing from your portal.' },
    { q: 'How is this website linked to the Golden Loan Services system?', a: 'This website and customer portal share the company’s central loan records with the Golden Loan Services back-office system. Applications, payments and statements stay in sync, and system settings (rates, fees, products) are managed there — never by customers.' }
  ];

  const TESTIMONIALS = [
    { name: 'Chisomo K.', place: 'Blantyre', product: 'Business Loan', text: 'The MK 1,200,000 business loan restocked my shop before the festive season. I applied on my phone on Tuesday and the money was in my Airtel Money by Thursday.', rating: 5 },
    { name: 'Memory P.', place: 'Lilongwe', product: 'Salary Advance', text: 'School fees were due before payday. The salary advance was approved the same morning and the repayment matched my pay date exactly.', rating: 5 },
    { name: 'Tadala M.', place: 'Mangochi', product: 'Agricultural Loan', text: 'They understood the farming season. My fertiliser loan repayment starts after harvest — that is why I came back for a second season.', rating: 5 },
    { name: 'Agnes C.', place: 'Zomba', product: 'Group Loan', text: 'Our village bank of twelve women borrowed together. The portal shows each of us our balance and receipts — no arguments, no confusion.', rating: 5 },
    { name: 'Kondwani M.', place: 'Mzuzu', product: 'Asset Financing', text: 'I financed my minibus through GFS. The instalments were clear from the calculator, and I got the logbook released the week I finished paying.', rating: 4 },
    { name: 'Thoko N.', place: 'Lilongwe', product: 'Medical Loan', text: 'When my mother needed surgery, the medical loan was paid straight to the hospital. I will never forget how fast they moved.', rating: 5 }
  ];

  return {
    CURRENCY, RULES, PRODUCTS, PAYMENT_METHODS, BRANCHES, COMPANY, AGREEMENT_CLAUSES, FAQS, TESTIMONIALS,
    productById, productByName, periodRate, periodsFor, instalmentFor, amortize, assess, allocate, settlementQuote,
    round2, mk, mk2, num, iso, addMonths, addDays, daysBetween, fmtDate, fmtDateTime, refs,
    isEmail, isPhoneMW, normPhone, passwordIssues
  };
});
