/* Browser smoke test (jsdom). Requires a running sandbox server.
   GFS_TEST_URL=http://127.0.0.1:3100 npm run test:browser */
const { JSDOM, VirtualConsole } = require('jsdom');
const { webcrypto } = require('crypto');
const BASE = process.env.GFS_TEST_URL || 'http://127.0.0.1:3000';
const errors = [];
function patch(window, base) {
  window.fetch = (input, init) => { const u = new URL(typeof input === 'string' ? input : input.url, base); return fetch(u, init); };
  Object.defineProperty(window, 'crypto', { value: webcrypto, configurable: true });
  window.TextEncoder = TextEncoder; window.TextDecoder = TextDecoder;
  window.URL.createObjectURL = () => 'blob:mock'; window.URL.revokeObjectURL = () => {};
  window.HTMLElement.prototype.scrollIntoView = () => {}; window.scrollTo = () => {};
  window.HTMLCanvasElement.prototype.getContext = () => ({ clearRect(){}, beginPath(){}, moveTo(){}, lineTo(){}, stroke(){}, set lineCap(v){}, set strokeStyle(v){}, set lineWidth(v){} });
  window.matchMedia = window.matchMedia || (() => ({ matches: false, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){} }));
  window.addEventListener('error', e => errors.push('window: ' + e.message));
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitApp(window, ms = 10000) { const t = Date.now(); while (Date.now() - t < ms) { if (window.eval('typeof App') !== 'undefined' && window.document.querySelector('#app') && !window.document.querySelector('#app .loading-page')) return; await sleep(100); } throw new Error('App did not boot: ' + (window.document.querySelector('#app')?.innerHTML || '').slice(0,500) + ' App=' + window.eval('typeof App')); }
async function nav(window, hash) {
  if (window.location.hash !== hash) window.location.hash = hash; else window.eval('App.render()');
  await sleep(150); // allow hashchange/render to replace the previous route before polling
  const deadline = Date.now() + 8000;
  let page;
  while (Date.now() < deadline) {
    page = window.document.querySelector('#page');
    if (page && !page.querySelector('.loading-page') && page.innerHTML.length > 100) break;
    await sleep(80);
  }
  const html = window.document.querySelector('#app').innerHTML;
  const failures = ['We couldn’t open', 'We couldn’t load this page', 'Something went wrong', 'Backend connection needed', 'Page not found'];
  const failure = failures.find(text => html.includes(text));
  if (failure) throw new Error(`${failure} at ${hash}: ` + html.slice(0, 400));
  if (!page || page.querySelector('.loading-page')) throw new Error('Route did not finish rendering: ' + hash);
  return page.innerHTML.length;
}
const assert = (condition, message) => { if (!condition) throw new Error(message); };
async function exercisePublic(window, label) {
  const d = window.document;
  await nav(window, '#/blog');
  const total = d.querySelectorAll('#blog-results .journal-card').length;
  assert(total >= 6, label + ': blog cards missing');
  const search = d.querySelector('#blog-search'); search.value = 'salary'; search.dispatchEvent(new window.Event('input', { bubbles: true }));
  const filtered = d.querySelectorAll('#blog-results .journal-card').length;
  assert(filtered > 0 && filtered < total, label + ': blog search did not filter');
  d.querySelector('#blog-clear').click();
  assert(d.querySelectorAll('#blog-results .journal-card').length === total, label + ': clear filters failed');
  const bookmark = d.querySelector('#blog-results [data-bookmark]'); const slug = bookmark.dataset.bookmark; bookmark.click();
  assert(JSON.parse(window.localStorage.getItem('gfs_blog_bookmarks_v1')).includes(slug), label + ': bookmark not persisted');
  d.querySelector('#blog-saved').click();
  assert(d.querySelectorAll('#blog-results .journal-card').length === 1, label + ': saved filter failed');
  d.querySelector('#blog-clear').click();
  const motion = d.querySelector('[data-motion-select]'); motion.value = 'off'; motion.dispatchEvent(new window.Event('change', { bubbles: true }));
  assert(d.documentElement.dataset.motion === 'off', label + ': motion preference failed');
  await nav(window, '#/blog/choose-the-right-loan');
  assert(d.querySelectorAll('.article-section').length >= 3, label + ': article sections missing');
  const size = d.querySelector('#reader-size'); size.value = 'large'; size.dispatchEvent(new window.Event('change', { bubbles: true }));
  assert(d.querySelector('.article-reading-shell').dataset.textSize === 'large', label + ': reader text size failed');
  assert(d.querySelector('#article-updated'), label + ': article revision metadata missing');
  await nav(window, '#/borrowing-checklist');
  const box = d.querySelector('.checklist-item input'); box.checked = true; box.dispatchEvent(new window.Event('change', { bubbles: true }));
  assert(d.querySelector('#checklist-count').textContent.includes('1 of 10'), label + ': checklist progress failed');
  await nav(window, '#/guides'); await nav(window, '#/borrowing-checklist');
  assert(d.querySelector('.checklist-item input').checked, label + ': checklist did not persist across routes');
  await nav(window, '#/security-centre');
  d.querySelector('.quiz-answer[data-answer="0"]').click();
  assert(!d.querySelector('.quiz-feedback').hidden, label + ': security quiz feedback missing');
  await nav(window, '#/calculator');
  const cf = d.querySelector('#calc-form');
  assert(cf.elements.ratePct.value === '1' && cf.elements.feePct.value === '5' && cf.elements.termMonths.value === '1' && cf.elements.paymentFrequency.value === 'annually', label + ': calculator defaults missing');
  await nav(window, '#/announcements');
  assert(d.querySelector('.notice-card a[href^="#/announcements/"]'), label + ': announcement detail link missing');
  assert(d.querySelector('.notice-source a[href*="website.html#s3"]'), label + ': admin publishing settings link missing');
  await nav(window, '#/');
  const drop = d.querySelector('[data-drop="loans-menu"]'); drop.click();
  assert(drop.getAttribute('aria-expanded') === 'true', label + ': dropdown did not open');
  d.body.click();
  assert(drop.getAttribute('aria-expanded') === 'false', label + ': outside click did not close dropdown');
  const mobile = d.querySelector('#mobile-menu'); mobile.click();
  assert(d.querySelector('#site-nav').classList.contains('open'), label + ': mobile menu did not open');
  d.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert(!d.querySelector('#site-nav').classList.contains('open'), label + ': Escape did not close mobile menu');
}
(async () => {
  const vc = new VirtualConsole(); vc.on('jsdomError', e => errors.push('jsdom: ' + e.message)); vc.on('error', (...a) => errors.push('console.error: ' + a.join(' ')));
  const dom = await JSDOM.fromURL(BASE + '/', { runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, virtualConsole: vc, beforeParse: w => patch(w, BASE + '/') });
  const w = dom.window; await waitApp(w);
  const publicRoutes = ['/', '/about', '/services', '/loans', '/loans/SA', '/products', '/products/PL', '/products/BL', '/calculator', '/eligibility', '/process', '/requirements', '/rates', '/repayment-methods', '/faq', '/contact', '/testimonials', '/branches', '/announcements', '/terms', '/privacy', '/apply', '/register', '/login', '/forgot-password', '/reset-password', '/blog', '/blog/choose-the-right-loan', '/guides', '/security-centre', '/borrowing-checklist', '/complaints', '/accessibility', '/loans/ED', '/calculator?product=ED', '/eligibility?product=ED', '/apply?product=ED'];
  for (const r of publicRoutes) await nav(w, '#' + r);
  await nav(w, '#/calculator?product=ED');
  assert(!w.document.querySelector('#calc-form'), 'retired calculator URL must not silently fall back to a form');
  assert(w.document.querySelector('#page').textContent.includes('unavailable'), 'retired calculator URL needs a clear unavailable message');
  await exercisePublic(w, 'server');
  const login = await w.eval("API").post('/api/auth/login', { email: 'demo@goldenfinancial.mw', password: 'Demo@1234' });
  w.eval("API").setToken(login.token); w.eval("App").user = login.user; await w.eval("App").refreshUser();
  const portalRoutes = ['/portal', '/portal/loans', '/portal/applications', '/portal/apply', '/portal/transactions', '/portal/receipts', '/portal/statements', '/portal/requests', '/portal/profile', '/portal/documents', '/portal/guarantors', '/portal/collateral', '/portal/security', '/portal/settings', '/portal/chat', '/portal/support', '/portal/notifications', '/portal/payments', '/portal/analytics', '/portal/account-activity', '/portal/activity'];
  for (const r of portalRoutes) await nav(w, '#' + r);
  await nav(w, '#/portal/apply');
  assert(w.document.querySelectorAll('#apply-form select[name="productId"] option').length === 5, 'portal application must offer exactly five products');
  assert(w.document.querySelector('.topbar.admin-topbar'), 'portal dark topbar missing');
  assert(w.document.querySelector('.portal-footer nav a[href="#/portal/notifications"]'), 'portal footer navigation missing');
  assert(w.document.querySelector('#notif-btn'), 'notification bell missing');
  const loan = (await w.eval("API").get('/api/loans')).loans.find(l => l.status === 'active');
  if (loan) await nav(w, '#/portal/loans/' + loan.id);
  const app = (await w.eval("API").get('/api/applications')).applications[0];
  if (app) await nav(w, '#/portal/applications/' + app.id);
  console.log('SERVER_SMOKE_OK', { publicRoutes: publicRoutes.length, portalRoutes: portalRoutes.length + 2, errors });
  w.close();
  // Static sandbox smoke (GitHub Pages origin, no backend)
  const vc2 = new VirtualConsole(); vc2.on('jsdomError', e => errors.push('static jsdom: ' + e.message));
  const html = await (await fetch(BASE + '/')).text();
  const fs = require('fs'), path = require('path');
  const dom2 = new JSDOM(html, { url: 'https://wwwmaryemmanuel01.github.io/golden-financial-website-/', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc2, beforeParse: w => { patch(w, 'https://wwwmaryemmanuel01.github.io/golden-financial-website-/'); w.fetch = async (input) => { const u = new URL(String(input), 'https://wwwmaryemmanuel01.github.io/golden-financial-website-/'); if (u.pathname.endsWith('runtime-config.json') || u.pathname.endsWith('/api/health')) return new Response('{}', { status: 404 }); throw new Error('network disabled in static smoke'); }; } });
  const w2 = dom2.window;
  for (const tag of [...w2.document.querySelectorAll('script[src]')]) { const src = tag.getAttribute('src'); const code = fs.readFileSync(path.join(process.cwd(), 'public', src), 'utf8'); const el = w2.document.createElement('script'); el.textContent = code; w2.document.body.appendChild(el); }
  w2.eval('App.boot()');
  await waitApp(w2);
  if (w2.eval("API").mode !== 'local') throw new Error('static mode expected local, got ' + w2.eval("API").mode);
  for (const r of ['/', '/products', '/calculator', '/login', '/register', '/blog', '/guides', '/security-centre', '/borrowing-checklist', '/complaints', '/accessibility']) await nav(w2, '#' + r);
  await exercisePublic(w2, 'static');
  await nav(w2, '#/blog');
  assert(w2.document.querySelector('#blog-update-status').textContent.includes('Device library'), 'static blog must label device source');
  let retiredRejected = false; try { await w2.eval("API").post('/api/calculator', { productId: 'ED', amount: 100000, term: 12 }); } catch { retiredRejected = true; }
  assert(retiredRejected, 'static calculator accepted retired product');
  const reg = await w2.eval("API").post('/api/auth/register', { firstName: 'Static', lastName: 'Smoke', email: 'static@example.com', phone: '0991234567', password: 'Static@1234', acceptTerms: true });
  await w2.eval("API").post('/api/auth/verify-otp', { purpose: 'verify_phone', challenge: reg.challenges.phone, code: reg.devCodes.phone });
  await w2.eval("API").post('/api/auth/verify-otp', { purpose: 'verify_email', challenge: reg.challenges.email, code: reg.devCodes.email });
  const li = await w2.eval("API").post('/api/auth/login', { email: 'static@example.com', password: 'Static@1234' });
  w2.eval("API").setToken(li.token); w2.eval("App").user = li.user; await w2.eval("App").refreshUser();
  for (const r of ['/portal', '/portal/apply', '/portal/payments', '/portal/analytics', '/portal/profile', '/portal/documents', '/portal/security', '/portal/account-activity', '/portal/notifications', '/portal/settings']) await nav(w2, '#' + r);
  await nav(w2, '#/portal/apply');
  assert(w2.document.querySelectorAll('#apply-form select[name="productId"] option').length === 5, 'static portal application must offer exactly five products');
  console.log('STATIC_SMOKE_OK', { mode: w2.eval("API").mode, errors });
  if (errors.length) { console.error(errors); process.exit(1); }
  console.log('ALL_SMOKE_OK'); process.exit(0);
})().catch(e => { console.error('SMOKE_FAIL', e); console.error(errors); process.exit(1); });
