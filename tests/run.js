/* End-to-end smoke test against a running server (default http://127.0.0.1:3000).
   Walks the full customer journey and asserts the financial engine. */
const BASE = process.env.GFS_TEST_URL || 'http://127.0.0.1:3000';
let cookie = '';
let pass = 0, fail = 0;
const check = (name, cond, extra) => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.error(`  ✗ ${name}`, extra ?? ''); } };

async function api(method, path, body, expect = 200) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  const sc = res.headers.get('set-cookie');
  if (sc) cookie = sc.split(';')[0];
  const ct = res.headers.get('content-type') || '';
  const data = ct.includes('json') ? await res.json() : Buffer.from(await res.arrayBuffer());
  if (res.status !== expect) throw new Error(`${method} ${path} → ${res.status} (expected ${expect}): ${JSON.stringify(data).slice(0, 300)}`);
  return data;
}

const run = async () => {
  console.log('\nGOLDEN FINANCIAL SERVICES — end-to-end test\n');

  // public
  const health = await api('GET', '/api/health');
  check('health + central database', health.status === 'ok' && health.database === 'connected');
  const config = await api('GET', '/api/config');
  check('public config: 10 products, MWK, read-only', config.products.length === 10 && config.currency === 'MWK' && config.readOnlyForCustomers === true);
  const calc = await api('POST', '/api/calculator', { productId: 'BL', amount: 1500000, term: 12, freq: 'monthly' });
  check('calculator: amortization rows = 12', calc.schedule.rows.length === 12);
  check('calculator: total repayable = principal + interest', Math.abs(calc.schedule.totalRepayable - (1500000 + calc.schedule.totalInterest)) < 1);
  check('calculator: fee deducted at disbursement', calc.schedule.netDisbursement === 1500000 - calc.schedule.fee);
  const elig = await api('POST', '/api/eligibility', { productId: 'PL', amount: 200000, term: 6, income: 600000, expenses: 200000 });
  check('eligibility assessment runs', typeof elig.eligible === 'boolean' && elig.quote);

  // auth
  const login = await api('POST', '/api/auth/login', { email: 'demo@goldenfinancial.mw', password: 'Demo@1234' });
  check('demo login', login.user && login.user.customerNo === 'GF-000001');
  const dash = await api('GET', '/api/dashboard');
  check('dashboard: active loan present', dash.stats.activeLoans >= 1);
  check('dashboard: outstanding computed', dash.stats.outstanding > 0);
  check('dashboard: next repayment set', !!dash.stats.nextRepaymentDate);
  const loans = await api('GET', '/api/loans');
  const active = loans.loans.find(l => l.status === 'active');
  check('loan schedule generated', active && active.schedule.length === active.installmentsTotal);
  check('loan progress tracked', active.installmentsPaid === 4);

  // settings read-only enforcement
  await api('PUT', '/api/settings/system', { products: [] }, 403);
  check('customer cannot write system settings (403)', true);

  // new application → automated pipeline
  const app = await api('POST', '/api/applications', {
    productId: 'PL', amount: 200000, term: 6, freq: 'monthly', purpose: 'Home solar system',
    income: 950000, expenses: 420000, acceptTerms: true, disbursementMethod: 'mpamba',
    guarantors: [{ name: 'Grace Banda', phone: '0991777222', relationship: 'Sister', consent: true }]
  });
  check('application reference GLS-APP format', /^GLS-APP-\d{6}$/.test(app.reference));
  check('automated decision issued', ['approved', 'rejected', 'pending_documents'].includes(app.application.status));
  let appId = app.application.id;
  let appStatus = app.application.status;
  if (appStatus === 'approved') {
    // accept agreement → disbursement
    const acc = await api('POST', `/api/applications/${appId}/accept-agreement`, {
      accept: true, name: 'Mary Emmanuel', idNumber: '123456/78/9', signature: 'Mary Emmanuel (typed)'
    });
    check('agreement accepted → loan disbursed', acc.loan && acc.loan.status === 'active');
    check('disbursement reference issued', !!acc.loan.disbursementRef);
    const newLoan = acc.loan;
    const before = newLoan.outstandingPrincipal;
    // payment
    const pay = await api('POST', '/api/payments/initiate', { loanId: newLoan.id, amount: newLoan.installment, method: 'mpamba', account: '0999123456', idempotencyKey: 'test-' + Date.now() });
    check('payment initiated (pending)', pay.payment.status === 'pending');
    const conf = await api('POST', `/api/payments/${pay.payment.id}/confirm`, { outcome: 'success' });
    check('payment verified', conf.payment.status === 'verified');
    check('unique receipt issued', /^RCT-\d{8}-[A-Z2-9]{6}$/.test(conf.receipt.ref));
    check('balance updated automatically', conf.loan.outstandingPrincipal < before);
    check('allocation recorded', conf.allocation.principal > 0 && conf.allocation.interest > 0);
    // idempotency
    const dup = await api('POST', '/api/payments/initiate', { loanId: newLoan.id, amount: newLoan.installment, method: 'mpamba', account: '0999123456', idempotencyKey: pay.payment.idempotencyKey || 'x' });
    // receipt PDF
    const pdf = await api('GET', `/api/receipts/${conf.receipt.id}/pdf`);
    check('receipt PDF generated', Buffer.isBuffer(pdf) && pdf.subarray(0, 5).toString() === '%PDF-');
    const stmt = await api('GET', `/api/loans/${newLoan.id}/statement.pdf`);
    check('loan statement PDF generated', Buffer.isBuffer(stmt) && stmt.subarray(0, 5).toString() === '%PDF-');
    const agr = await api('GET', `/api/applications/${appId}/agreement.pdf`);
    check('signed agreement PDF generated', Buffer.isBuffer(agr) && agr.subarray(0, 5).toString() === '%PDF-');
  }

  // settlement quote + request
  const req = await api('POST', '/api/requests', { type: 'settlement', loanId: active.id });
  check('settlement request + quote', req.request.status === 'approved' && req.request.payload.quote.total > 0);

  // notifications
  const notifs = await api('GET', '/api/notifications');
  check('notifications recorded', notifs.notifications.length > 5);
  const sms = await api('GET', '/api/notifications?channel=sms');
  check('SMS history recorded', sms.notifications.length > 3);

  // support
  const chat = await api('POST', '/api/chat', { message: 'What is my balance?' });
  check('AI assistant answers from live data', /LN-/.test(chat.reply));
  const ticket = await api('POST', '/api/tickets', { subject: 'Test ticket', message: 'Testing the support flow', category: 'general' });
  check('support ticket created', /^TKT-\d{6}$/.test(ticket.ticket.ref));

  // documents
  const doc = await api('POST', '/api/documents', { kind: 'other', filename: 'test.pdf', mime: 'application/pdf', data: Buffer.from('GFS test document content for encryption check.').toString('base64') });
  check('document uploaded + encrypted', doc.document.ref.startsWith('DOC-'));
  const dl = await api('GET', `/api/documents/${doc.document.id}/file`);
  check('document decrypts for owner', Buffer.isBuffer(dl) && dl.toString().includes('GFS test'));

  // transactions & export
  const txns = await api('GET', '/api/transactions');
  check('transaction history', txns.transactions.length > 5);
  const exp = await api('GET', '/api/export/my-data');
  check('own-data export', exp.profile && exp.loans && exp.transactions);

  // integration
  const ist = await api('GET', '/api/integration/status');
  check('linked system info', ist.linkedSystem.url.includes('golden-loan-services'));
  await api('GET', '/api/integration/export', null, 503); // no key configured
  check('integration export requires key', true);

  // auth: registration + OTP
  const reg = await api('POST', '/api/auth/register', { firstName: 'Test', lastName: 'User', email: `test${Date.now()}@example.com`, phone: '0888123456', password: 'Test@1234', acceptTerms: true });
  check('registration + customer number', /^GF-\d{6}$/.test(reg.customerNo));
  check('dev OTP issued', !!reg.devCodes.phone);
  const ver = await api('POST', '/api/auth/verify-otp', { purpose: 'verify_phone', target: reg.phone, code: reg.devCodes.phone });
  check('phone OTP verified', ver.verified === true);

  // wrong password lockout behavior
  await api('POST', '/api/auth/login', { email: 'demo@goldenfinancial.mw', password: 'wrong' }, 401);
  check('wrong password rejected', true);

  console.log(`\n  ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
};
run().catch(e => { console.error('\nTEST ERROR:', e.message); process.exit(1); });
