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
async function waitApp(window, ms = 8000) { const t = Date.now(); while (Date.now() - t < ms) { if (window.eval('typeof App') !== 'undefined' && window.document.querySelector('#app') && !window.document.querySelector('#app .loading-page')) return; await sleep(100); } throw new Error('App did not boot: ' + (window.document.querySelector('#app')?.innerHTML || '').slice(0,500) + ' App=' + window.eval('typeof App')); }
async function nav(window, hash) { window.location.hash = hash; await sleep(450); const html = window.document.querySelector('#app').innerHTML; if (html.includes('We couldn’t open') || html.includes('Something went wrong') || html.includes('Backend connection needed')) throw new Error('error screen at ' + hash + ': ' + html.slice(0, 300)); return html.length; }
(async () => {
  const vc = new VirtualConsole(); vc.on('jsdomError', e => errors.push('jsdom: ' + e.message)); vc.on('error', (...a) => errors.push('console.error: ' + a.join(' ')));
  const dom = await JSDOM.fromURL(BASE + '/', { runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, virtualConsole: vc, beforeParse: w => patch(w, BASE + '/') });
  const w = dom.window; await waitApp(w);
  const publicRoutes = ['/', '/about', '/services', '/products', '/products/PL', '/calculator', '/eligibility', '/process', '/requirements', '/rates', '/repayment-methods', '/faq', '/contact', '/testimonials', '/branches', '/announcements', '/terms', '/privacy', '/apply', '/register', '/login', '/forgot-password', '/reset-password'];
  for (const r of publicRoutes) await nav(w, '#' + r);
  const login = await w.eval("API").post('/api/auth/login', { email: 'demo@goldenfinancial.mw', password: 'Demo@1234' });
  w.eval("API").setToken(login.token); w.eval("App").user = login.user; await w.eval("App").refreshUser();
  const portalRoutes = ['/portal', '/portal/loans', '/portal/applications', '/portal/apply', '/portal/transactions', '/portal/receipts', '/portal/statements', '/portal/requests', '/portal/profile', '/portal/documents', '/portal/guarantors', '/portal/collateral', '/portal/security', '/portal/settings', '/portal/chat', '/portal/support', '/portal/notifications', '/portal/payments', '/portal/analytics'];
  for (const r of portalRoutes) await nav(w, '#' + r);
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
  for (const r of ['/', '/products', '/calculator', '/login', '/register']) await nav(w2, '#' + r);
  const reg = await w2.eval("API").post('/api/auth/register', { firstName: 'Static', lastName: 'Smoke', email: 'static@example.com', phone: '0991234567', password: 'Static@1234', acceptTerms: true });
  await w2.eval("API").post('/api/auth/verify-otp', { purpose: 'verify_phone', challenge: reg.challenges.phone, code: reg.devCodes.phone });
  await w2.eval("API").post('/api/auth/verify-otp', { purpose: 'verify_email', challenge: reg.challenges.email, code: reg.devCodes.email });
  const li = await w2.eval("API").post('/api/auth/login', { email: 'static@example.com', password: 'Static@1234' });
  w2.eval("API").setToken(li.token); w2.eval("App").user = li.user; await w2.eval("App").refreshUser();
  for (const r of ['/portal', '/portal/apply', '/portal/payments', '/portal/analytics', '/portal/profile', '/portal/documents', '/portal/security']) await nav(w2, '#' + r);
  console.log('STATIC_SMOKE_OK', { mode: w2.eval("API").mode, errors });
  if (errors.length) { console.error(errors); process.exit(1); }
  console.log('ALL_SMOKE_OK'); process.exit(0);
})().catch(e => { console.error('SMOKE_FAIL', e); console.error(errors); process.exit(1); });
