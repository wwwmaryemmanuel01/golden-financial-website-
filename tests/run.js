/* End-to-end smoke test against a running SANDBOX server.
   Run with an isolated database, e.g.
   GFS_DATA_DIR=/tmp/gfs-test GFS_DEMO_MODE=true PORT=3100 node server/index.js
   GFS_TEST_URL=http://127.0.0.1:3100 node tests/run.js */
import crypto from 'node:crypto';
const BASE = process.env.GFS_TEST_URL || 'http://127.0.0.1:3000';
let cookie = '';
let pass = 0, fail = 0;
const check = (name, cond, extra) => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.error(`  ✗ ${name}`, extra ?? ''); } };
async function api(method, path, body, expect = 200) {
  const res = await fetch(BASE + path, { method, headers: { 'Content-Type': 'application/json', 'X-GFS-Request': 'website', ...(cookie ? { Cookie: cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const sc = res.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
  const ct = res.headers.get('content-type') || '';
  const data = ct.includes('json') ? await res.json() : Buffer.from(await res.arrayBuffer());
  if (res.status !== expect) throw new Error(`${method} ${path} → ${res.status} (expected ${expect}): ${JSON.stringify(data).slice(0, 300)}`);
  return data;
}
const pdfBuffer = label => Buffer.from(`%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n% ${label}\n%%EOF`);
const upload = (kind, label) => api('POST', '/api/documents', { kind, filename: `${label}.pdf`, mime: 'application/pdf', data: pdfBuffer(label).toString('base64') });
const run = async () => {
  console.log('\nGOLDEN FINANCIAL SERVICES — rebuild end-to-end test\n');
  const health = await api('GET', '/api/health');
  check('health identifies customer API', health.status === 'ok' && health.service === 'golden-financial-customer-api' && health.currency === 'MWK');
  const config = await api('GET', '/api/config');
  check('public config: exactly five supported categories, MWK, customer read-only', JSON.stringify(config.products.map(p => [p.id, p.name])) === JSON.stringify([['PL', 'Personal'], ['BL', 'Business'], ['SA', 'Salary Advance'], ['AL', 'Agriculture'], ['EL', 'Emergency']]) && config.currency === 'MWK' && config.readOnlyForCustomers === true);
  check('dark admin header palette is published', config.theme.header === '#0F1115' && config.theme.headerGold === '#E4C264');
  const blog = await api('GET', '/api/blog/posts');
  check('published blog library is readable and labelled', blog.source === 'backend' && blog.posts.length >= 6 && blog.posts.every(p => p.slug && p.sections === undefined));
  const article = await api('GET', '/api/blog/posts/' + blog.posts[0].slug);
  check('blog detail includes sections and reading metadata', article.post.sections.length >= 3 && article.post.readMinutes >= 2 && article.source === 'backend');
  await api('GET', '/api/blog/posts/missing-article', null, 404);
  await api('POST', '/api/calculator', { productId: 'ED', amount: 100000, term: 12 }, 400);
  await api('POST', '/api/calculator', { productId: 'UNKNOWN', amount: 100000, term: 12 }, 400);
  check('retired and unknown calculator products are rejected', true);
  const methods = await api('GET', '/api/payment-methods');
  check('payment methods expose sandbox mode', methods.sandbox === true && methods.methods.length >= 4 && methods.methods.every(m => m.mode === 'sandbox'));
  const csrf = await fetch(BASE + '/api/calculator', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  check('mutation without website header refused', csrf.status === 403);
  const calc = await api('POST', '/api/calculator', { productId: 'BL', amount: 1500000, term: 12, freq: 'monthly' });
  check('calculator schedule rows', calc.schedule.rows.length === 12);
  check('calculator total = principal + interest', Math.abs(calc.schedule.totalRepayable - (1500000 + calc.schedule.totalInterest)) < 1);
  const elig = await api('POST', '/api/eligibility', { productId: 'PL', amount: 200000, term: 6, income: 600000, expenses: 200000 });
  check('eligibility assessment runs', typeof elig.eligible === 'boolean' && !!elig.quote);

  const login = await api('POST', '/api/auth/login', { email: 'demo@goldenfinancial.mw', password: 'Demo@1234' });
  check('sandbox login', login.user?.customerNo === 'GF-000001' && !!login.token);
  const dash = await api('GET', '/api/dashboard');
  check('dashboard totals + checklist', dash.totals.activeLoans >= 1 && dash.totals.outstanding > 0 && typeof dash.checklist.phone === 'boolean');
  const loans = await api('GET', '/api/loans');
  const active = loans.loans.find(l => l.status === 'active');
  check('loan aliases + schedule', active && active.outstanding > 0 && active.schedule.length === active.installmentsTotal);
  await api('PUT', '/api/settings/system', { products: [] }, 403);
  await api('PUT', '/api/settings/system', { blog_posts: [] }, 403);
  check('customer cannot write system settings or publish articles', true);
  await api('POST', '/api/applications', { productId: 'ED', amount: 100000, term: 12, purpose: 'Retired product test', consent: true, disbursementMethod: 'mpamba', disbursementAccount: '0999123456' }, 400);
  check('retired products cannot receive new applications', true);
  await api('GET', '/api/integration/customers', null, 401);
  check('integration export requires signed system auth', true);
  const ist = await api('GET', '/api/integration/status');
  check('linked system status is truthful', ist.repository.includes('golden-loan-services') && ist.connected === false);

  const idDoc = await upload('national_id', 'identity');
  const incomeDoc = await upload('payslip', 'income');
  check('documents stored pending, not auto-verified', idDoc.document.status === 'pending' && incomeDoc.document.status === 'pending');
  const consentDoc = await upload('guarantor_consent', 'guarantor-consent');
  const g = await api('POST', '/api/guarantors', { name: 'Grace Banda', phone: '0991777222', relationship: 'Sister', consentDocumentId: consentDoc.document.id });
  check('guarantor consent document recorded', g.guarantor.consent === 1 && g.guarantor.status === 'consent_document_received');
  const c = await api('POST', '/api/collateral', { type: 'Vehicle', description: 'Toyota Hiace 2018', estimatedValue: 9000000 });
  check('collateral awaits valuation', c.collateral.status === 'awaiting_valuation' && c.collateral.valued_amount == null);
  const app = await api('POST', '/api/applications', { productId: 'PL', amount: 200000, term: 6, freq: 'monthly', purpose: 'Home solar system installation', income: 950000, expenses: 420000, consent: true, disbursementMethod: 'mpamba', disbursementAccount: '0999123456', guarantorIds: [g.guarantor.id], collateralIds: [c.collateral.id] });
  check('application reference', /^GLS-APP-\d{6}$/.test(app.reference));
  check('sandbox simulated review approved', app.application.status === 'approved' && app.application.reviewSource === 'sandbox');
  const appId = app.application.id, offer = app.application.offer;
  const acc = await api('POST', `/api/applications/${appId}/accept-agreement`, { accept: true, termsConsent: true, offerVersion: offer.version, name: 'Mary Emmanuel', signature: 'Mary Emmanuel' });
  check('agreement accepted → sandbox disbursement', acc.loan?.status === 'active' && acc.sandbox === true);
  const loan = acc.loan;
  const key = crypto.randomUUID();
  const pay = await api('POST', '/api/payments/initiate', { loanId: loan.id, amount: 50000, method: 'mpamba', account: '0999123456', idempotencyKey: key });
  check('payment initiated pending sandbox', pay.payment.status === 'pending' && pay.sandbox === true);
  await api('POST', `/api/payments/${pay.payment.id}/confirm`, { outcome: 'success' }, 400);
  check('sandbox confirmation requires explicit simulate flag', true);
  const conf = await api('POST', `/api/payments/${pay.payment.id}/confirm`, { outcome: 'success', simulate: true });
  check('sandbox payment verified + receipt', conf.payment.status === 'verified' && /^RCT-/.test(conf.receipt.ref));
  check('balance reduced + allocation recorded', conf.loan.totalOutstanding < loan.totalOutstanding && conf.allocation.principal + conf.allocation.interest > 0);
  const dup = await api('POST', '/api/payments/initiate', { loanId: loan.id, amount: 50000, method: 'mpamba', account: '0999123456', idempotencyKey: key });
  check('idempotent replay returns same payment', dup.duplicate === true && dup.payment.id === pay.payment.id);
  await api('POST', '/api/payments/initiate', { loanId: loan.id, amount: 60000, method: 'mpamba', account: '0999123456', idempotencyKey: key }, 409);
  check('idempotency key reuse with different amount refused', true);
  const failPay = await api('POST', '/api/payments/initiate', { loanId: loan.id, amount: 10000, method: 'airtel', account: '0888123456', idempotencyKey: crypto.randomUUID() });
  const failed = await api('POST', `/api/payments/${failPay.payment.id}/confirm`, { outcome: 'failure', simulate: true, reason: 'Sandbox cancellation' });
  check('sandbox failure recorded', failed.payment.status === 'failed');
  const bank = await api('POST', '/api/payments/initiate', { loanId: loan.id, amount: 10000, method: 'bank', idempotencyKey: crypto.randomUUID() });
  check('bank transfer awaits reconciliation', bank.payment.status === 'awaiting_verification');
  const beforeProof = (await api('GET', `/api/loans/${loan.id}`)).loan.totalOutstanding;
  const proof = await api('POST', `/api/payments/${bank.payment.id}/proof`, { providerReference: 'BANK-REF-123456' });
  const afterProof = (await api('GET', `/api/loans/${loan.id}`)).loan.totalOutstanding;
  check('customer proof does not change balance', proof.message.includes('has not changed') && beforeProof === afterProof);
  const settleReq = await api('POST', '/api/requests', { type: 'settlement', loanId: loan.id });
  check('settlement request records quote for review', settleReq.request.status === 'under_review' && settleReq.quote.total > 0);
  const topup = await api('POST', '/api/requests', { type: 'topup', loanId: loan.id, amount: 50000, reason: 'Additional working capital' });
  check('top-up request recorded without changing terms', topup.request.status === 'under_review');
  const quote = (await api('GET', `/api/loans/${loan.id}/settlement`)).quote;
  const settle = await api('POST', '/api/payments/initiate', { loanId: loan.id, settle: true, quoteDate: quote.asOf, method: 'mpamba', account: '0999123456', idempotencyKey: crypto.randomUUID() });
  const settled = await api('POST', `/api/payments/${settle.payment.id}/confirm`, { outcome: 'success', simulate: true });
  check('early settlement closes loan', settled.loan.status === 'closed' && settled.loan.totalOutstanding === 0);
  const renewal = await api('POST', '/api/requests', { type: 'renewal', loanId: loan.id, termMonths: 6, reason: 'Renew after settlement' });
  check('renewal request on closed loan recorded', renewal.request.status === 'under_review');

  for (const [name, path] of [['receipt', `/api/receipts/${conf.receipt.id}/pdf`], ['statement', `/api/loans/${loan.id}/statement.pdf`], ['settlement statement', `/api/loans/${loan.id}/settlement.pdf`], ['disbursement', `/api/loans/${loan.id}/disbursement.pdf`], ['agreement', `/api/applications/${appId}/agreement.pdf`]]) {
    const pdf = await api('GET', path); check(`${name} PDF generated`, Buffer.isBuffer(pdf) && pdf.subarray(0, 5).toString() === '%PDF-');
  }
  const notifs = await api('GET', '/api/notifications');
  check('notification history recorded', notifs.notifications.length > 5);
  const sms = await api('GET', '/api/notifications?channel=sms');
  check('SMS history labelled with delivery status', sms.notifications.length > 0 && sms.notifications.every(n => n.channel === 'sms'));
  const chat = await api('POST', '/api/chat', { message: 'What is my balance?' });
  check('assistant answers from records', typeof chat.reply === 'string' && chat.reply.length > 10);
  const ticket = await api('POST', '/api/tickets', { subject: 'Test ticket', message: 'Testing the support flow', category: 'general' });
  check('support ticket created', ticket.ticket.ref.startsWith('TKT-'));
  const dl = await api('GET', `/api/documents/${idDoc.document.id}/file`);
  check('document decrypts for owner', Buffer.isBuffer(dl) && dl.toString().includes('identity'));
  const txns = await api('GET', '/api/transactions');
  check('transaction history', txns.transactions.length > 5);
  const exp = await api('GET', '/api/export/my-data');
  check('own-data export', !!exp.profile && Array.isArray(exp.loans) && Array.isArray(exp.accountActivity));

  /* Professional follow-up: shared calculator, managed notices and activity engine. */
  const defaults = await api('POST', '/api/calculator', {});
  check('calculator defaults: 1%, 5%, one month, annual frequency', defaults.schedule.ratePct === 1 && defaults.schedule.feePct === 5 && defaults.schedule.termMonths === 1 && defaults.schedule.paymentFrequency === 'annually' && defaults.schedule.rows.length === 1);
  check('one-month annual-frequency loan matures once without extending the term', defaults.schedule.totalInterest === defaults.schedule.principal * .01 && defaults.schedule.endDate === new Date(new Date(defaults.schedule.startDate).setMonth(new Date(defaults.schedule.startDate).getMonth() + 1)).toISOString().slice(0,10));
  const flat = await api('POST', '/api/calculator', { amount:120000, ratePct:1, feePct:5, termMonths:12, paymentFrequency:'monthly', method:'flat', startDate:'2026-01-15' });
  const reducing = await api('POST', '/api/calculator', { amount:120000, ratePct:1, feePct:5, termMonths:12, paymentFrequency:'monthly', method:'reducing', startDate:'2026-01-15' });
  check('flat and reducing formulas produce distinct correct interest', flat.schedule.totalInterest === 14400 && reducing.schedule.totalInterest < flat.schedule.totalInterest && reducing.schedule.rows.at(-1).closing === 0);
  check('result sheet separates repayment from upfront processing fee', flat.schedule.totalFees === 6000 && flat.schedule.totalRepayable === 134400 && flat.schedule.netDisbursement === 114000 && flat.schedule.rows.every(r => /^\d{4}-\d{2}-\d{2}$/.test(r.dueDate)));
  const integrationKey = process.env.GFS_TEST_INTEGRATION_KEY;
const runId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  if (!integrationKey) throw new Error('Set GFS_TEST_INTEGRATION_KEY to the isolated test server’s GFS_INTEGRATION_KEY.');
  const signed = async (path, body, expect = 200) => {
    const raw = JSON.stringify(body), timestamp = String(Math.floor(Date.now()/1000));
    const signature = crypto.createHmac('sha256', integrationKey).update(`${timestamp}.${raw}`).digest('hex');
    const res = await fetch(BASE + path, { method:'POST', headers:{ 'Content-Type':'application/json', 'X-GFS-Timestamp':timestamp, 'X-GFS-Signature':`sha256=${signature}` }, body:raw });
    const data = await res.json(); if (res.status !== expect) throw new Error(`signed ${path} → ${res.status}: ${JSON.stringify(data)}`); return data;
  };
  const notice = { id:'test-service-notice', title:'Scheduled maintenance notice', body:'The customer portal will be briefly unavailable during scheduled maintenance.', category:'maintenance', pinned:true, linkUrl:'/portal', linkLabel:'Open the portal' };
  await signed('/api/integration/settings', { announcements:[notice] });
  let feed = await api('GET', '/api/announcements');
  check('administration can publish a linked announcement to the public feed', feed.announcements.some(a => a.slug === notice.id && a.linkUrl === '/portal' && a.source === 'system') && feed.publishingConfigured === true && feed.adminSettingsUrl.includes('website.html#s3'));
  await signed('/api/integration/settings', { announcements:[{ ...notice, linkUrl:'javascript:alert(1)' }] }, 400);
  check('announcement publishing rejects script links', true);
  await signed('/api/integration/settings', { announcements:[{ ...notice, id:'future-notice', startsAt:new Date(Date.now()+86400000).toISOString() }, { ...notice, id:'expired-notice', expiresAt:new Date(Date.now()-86400000).toISOString() }] });
  feed = await api('GET', '/api/announcements');
  check('scheduled and expired notices are hidden from the public feed', !feed.announcements.some(a => ['future-notice','expired-notice'].includes(a.slug)));
  await signed('/api/integration/settings', { announcements:[] });
  feed = await api('GET', '/api/announcements');
  check('administration can withdraw notices without deleting history', feed.announcements.length === 0);
  const customerId = login.user.id;
  for (const [activity, reference, amount] of [['deposit','DEP-TEST-001',25000],['savings_deposit','SAV-TEST-001',10000],['withdrawal','WDR-TEST-001',5000]]) {
    await signed('/api/integration/events', { eventId:`evt-${reference}-${runId}`, type:'account.activity', customerId, activity, reference, amount, status:'completed', occurredAt:new Date().toISOString() });
  }
  await signed('/api/integration/events', { eventId:`evt-recommendation-${runId}`, type:'customer.recommendation', customerId, reference:'REC-TEST-001', title:'Consider a salary advance', message:'Based on your published profile, a salary advance may fit your next pay cycle.', productId:'SA' });
  const account = await api('GET', '/api/account-activity');
  check('signed deposits, savings and withdrawals appear in own-account history', account.activities.length === 3 && account.activities.every(a => a.status === 'completed'));
  const notices = await api('GET', '/api/notifications');
  const categories = new Set(notices.notifications.map(n => n.category));
  check('notification engine covers repayment, disbursement, decisions, deposits, savings, withdrawals and recommendations', ['payment','disbursement','application','deposit','savings','withdrawal','recommendation'].every(c => categories.has(c)));
  check('activity notifications link to real portal records', notices.notifications.filter(n => ['deposit','savings','withdrawal'].includes(n.category)).every(n => JSON.parse(n.meta).link === '/portal/account-activity'));
  const beforeReplay = notices.unread;
  await signed('/api/integration/events', { eventId:`evt-replay-${runId}`, type:'account.activity', customerId, activity:'deposit', reference:'DEP-TEST-001', amount:25000, status:'completed', occurredAt:account.activities.find(a => a.reference === 'DEP-TEST-001').occurredAt });
  const afterReplay = await api('GET', '/api/notifications');
  check('replayed activity does not duplicate notifications', afterReplay.unread === beforeReplay && afterReplay.notifications.length === notices.notifications.length);

  const email = `test${Date.now()}@example.com`;
  const reg = await api('POST', '/api/auth/register', { firstName: 'Test', lastName: 'User', email, phone: '0888123456', password: 'Test@1234', acceptTerms: true });
  check('registration issues separate challenges', /^GF-\d{6}$/.test(reg.customerNo) && !!reg.challenges.phone && !!reg.challenges.email && !!reg.devCodes.phone);
  await api('POST', '/api/auth/verify-otp', { purpose: 'verify_phone', challenge: reg.challenges.phone, code: reg.devCodes.phone });
  await api('POST', '/api/auth/verify-otp', { purpose: 'verify_email', challenge: reg.challenges.email, code: reg.devCodes.email });
  check('phone + email OTP verification', true);
  await api('POST', '/api/auth/verify-otp', { purpose: 'reset', challenge: reg.challenges.phone, code: reg.devCodes.phone }, 400);
  check('reset codes are not consumed by verify-otp', true);
  const forgot = await api('POST', '/api/auth/forgot-password', { email });
  check('forgot password issues sandbox reset challenge', !!forgot.challenge && !!forgot.devCode);
  await api('POST', '/api/auth/reset-password', { challenge: forgot.challenge, code: forgot.devCode, password: 'NewPass@1234' });
  const relogin = await api('POST', '/api/auth/login', { email, password: 'NewPass@1234' });
  check('password reset consumed once and works', relogin.user.email === email);
  const ch = await api('POST', '/api/auth/verification-challenge', { purpose: 'login_2fa' });
  await api('PUT', '/api/security/2fa', { enabled: true, password: 'NewPass@1234', challenge: ch.challenge, code: ch.devCode });
  await api('POST', '/api/auth/logout');
  const twofa = await api('POST', '/api/auth/login', { email, password: 'NewPass@1234' });
  check('2FA login challenge issued', twofa.twofaRequired === true && !!twofa.loginChallenge);
  const verified = await api('POST', '/api/auth/verify-otp', { purpose: 'login_2fa', challenge: twofa.challenge, loginChallenge: twofa.loginChallenge, code: twofa.devCode });
  check('2FA verification signs in', verified.verified === true && !!verified.token);
  await api('POST', '/api/auth/login', { email, password: 'wrong' }, 401);
  check('wrong password rejected', true);

  console.log(`\n  ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
};
run().catch(e => { console.error('\nTEST ERROR:', e.message); process.exit(1); });
