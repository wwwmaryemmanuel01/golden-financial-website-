/* App shell + hash router. Layouts: public website, customer portal, auth.
   Page modules register routes with App.route(). */
'use strict';
const App = (() => {
  const routes = [];
  let user = null, config = null, current = null, unread = 0;
  const $ = sel => document.querySelector(sel);
  const app = () => document.getElementById('app');

  function route(pattern, def) { routes.push({ pattern, keys: (pattern.match(/:[^/]+/g) || []).map(k => k.slice(1)), ...def }); }
  function match(path) {
    for (const r of routes) {
      const rx = new RegExp('^' + r.pattern.replace(/:[^/]+/g, '([^/]+)') + '$');
      const m = path.match(rx);
      if (m) { const params = {}; r.keys.forEach((k, i) => params[k] = decodeURIComponent(m[i + 1])); return { r, params }; }
    }
    return null;
  }
  const go = path => { location.hash = '#' + path; };
  const path = () => (location.hash || '#/').slice(1).split('?')[0] || '/';
  const query = () => Object.fromEntries(new URLSearchParams((location.hash.split('?')[1] || '')));

  /* ---------------- shells ---------------- */
  function publicHeader(active) {
    const nav = [
      ['/', 'Home'], ['/about', 'About'], ['/services', 'Services'], ['/loans', 'Loan Products'],
      ['/calculator', 'Calculator'], ['/how-it-works', 'How It Works'], ['/contact', 'Contact']
    ];
    const loanLinks = (config ? config.products : GFS.PRODUCTS).map(p => `<a href="#/loans/${p.id}">${UI.productIcon(p.id)} ${UI.esc(p.name)}</a>`).join('');
    return `<header class="pub-header"><div class="container bar">
      <a class="brand" href="#/"><img src="assets/logo.png" alt="Golden Financial Services logo"><span><span class="b-name">GOLDEN FINANCIAL</span><br><span class="b-sub">Services · Malawi</span></span></a>
      <button class="nav-toggle" id="nav-toggle" aria-label="Menu">☰</button>
      <nav class="pub-nav" id="pub-nav" aria-label="Main">
        ${nav.map(([h, l]) => `<a href="#${h}" class="${active === h ? 'active' : ''}">${l}</a>`).join('')}
        <div class="dropdown" id="loans-dd"><a href="#/loans" id="loans-dd-btn">More ▾</a>
          <div class="dropdown-menu"><div class="dm-head">Loan products</div>${loanLinks}
          <div class="dm-head">Tools & help</div><a href="#/eligibility">✅ Eligibility Checker</a><a href="#/requirements">📄 Loan Requirements</a><a href="#/rates">📊 Interest Rates & Fees</a><a href="#/repayment-methods">💳 Repayment Methods</a><a href="#/faq">❓ FAQs</a><a href="#/branches">📍 Branch Locations</a><a href="#/testimonials">⭐ Testimonials</a><a href="#/announcements">📢 Announcements</a></div>
        </div>
        ${user ? `<a href="#/portal" class="btn btn-emerald btn-sm" style="color:#fff">My Portal</a>` : `<a href="#/login" class="btn btn-ghost btn-sm">Sign In</a><a href="#/apply" class="btn btn-gold btn-sm">Apply Now</a>`}
      </nav></div></header>`;
  }
  function publicFooter() {
    const c = (config && config.company) || GFS.COMPANY;
    return `<footer class="pub-footer"><div class="container">
      <div class="cols">
        <div class="f-brand"><img src="assets/logo.png" alt="Golden Financial Services"><p style="font-size:13px;max-width:34ch">${UI.esc(c.tagline)}. Licensed lending in Malawi Kwacha, regulated by the ${UI.esc(c.regulator)}.</p>
          <p style="font-size:12px">🔗 <a href="${c.adminSystem}" target="_blank" rel="noopener">Golden Loan Services system</a></p></div>
        <div><h4>Loans</h4>${(config ? config.products : GFS.PRODUCTS).slice(0, 6).map(p => `<a href="#/loans/${p.id}">${UI.esc(p.name)}</a>`).join('')}<a href="#/loans">All products →</a></div>
        <div><h4>Company</h4><a href="#/about">About Us</a><a href="#/services">Our Services</a><a href="#/branches">Branches</a><a href="#/announcements">Announcements</a><a href="#/testimonials">Testimonials</a><a href="#/contact">Contact</a></div>
        <div><h4>Help & Legal</h4><a href="#/faq">FAQs</a><a href="#/requirements">Loan Requirements</a><a href="#/rates">Rates & Fees</a><a href="#/terms">Terms & Conditions</a><a href="#/privacy">Privacy Policy</a>
          <p style="font-size:12.5px;margin-top:10px">📞 ${UI.esc(c.phone)}<br>✉️ ${UI.esc(c.email)}<br>📍 ${UI.esc(c.address)}</p></div>
      </div>
      <div class="f-bottom"><span>© ${new Date().getFullYear()} ${UI.esc(c.legal)}. All rights reserved.</span><span>Currency: Malawi Kwacha (MWK) · <a href="#/portal">Customer Portal</a></span></div>
    </div></footer>`;
  }
  function sidebar(active) {
    const groups = [
      ['Overview', [['/portal', '📊', 'Dashboard']]],
      ['Borrowing', [['/portal/loans', '💰', 'My Loans'], ['/portal/applications', '📋', 'Applications'], ['/portal/apply', '📝', 'Apply for a Loan'], ['/portal/requests', '📨', 'Loan Requests']]],
      ['Payments & Records', [['/portal/transactions', '💳', 'Transactions'], ['/portal/receipts', '🧾', 'Receipts'], ['/portal/statements', '📑', 'Statements']]],
      ['My Account', [['/portal/profile', '👤', 'Profile'], ['/portal/documents', '🪪', 'Documents & KYC'], ['/portal/guarantors', '🤝', 'Guarantors'], ['/portal/collateral', '🏠', 'Collateral'], ['/portal/security', '🔐', 'Security'], ['/portal/settings', '⚙️', 'Settings'], ['/portal/activity', '🕘', 'Activity History']]],
      ['Support', [['/portal/chat', '💬', 'Live Chat'], ['/portal/support', '🎧', 'Tickets & Complaints'], ['/portal/notifications', '🔔', 'Notifications', unread]]]
    ];
    const avatar = user && user.avatarDocId ? `<img src="api/documents/${user.avatarDocId}/file" alt="">` : UI.initials(user && user.firstName, user && user.lastName);
    return `<div class="sidebar-back" id="sidebar-back"></div>
    <aside class="sidebar" id="sidebar">
      <div class="s-brand"><img src="assets/logo.png" alt="GFS logo"><span><span class="n">GOLDEN FINANCIAL</span><br><span class="t">Customer Portal</span></span></div>
      <div class="s-user"><div class="avatar">${avatar}</div><div><div class="u-name">${UI.esc(user ? user.name : '')}</div><div class="u-no">${UI.esc(user ? user.customerNo : '')}</div></div></div>
      <nav class="s-nav" aria-label="Portal">${groups.map(([head, items]) => `<div class="sn-head">${head}</div>${items.map(([h, ico, label, cnt]) => `<a href="#${h}" class="${active === h || (h !== '/portal' && active.startsWith(h + '/')) ? 'active' : ''}"><span class="ico">${ico}</span>${label}${cnt ? `<span class="cnt">${cnt}</span>` : ''}</a>`).join('')}`).join('')}
        <div class="sn-head">Website</div><a href="#/"><span class="ico">🌐</span>Public Website</a><a href="${GFS.COMPANY.adminSystem}" target="_blank" rel="noopener"><span class="ico">🔗</span>Linked Admin System</a>
      </nav>
      <div class="s-foot">Signed in as ${UI.esc(user ? user.email : '')}<br><button class="btn-link" id="logout-btn" style="color:#F3D67A">Sign out →</button></div>
    </aside>`;
  }
  function topbar(title) {
    return `<div class="topbar">
      <button class="icon-btn menu-btn" id="menu-btn" aria-label="Open menu">☰</button>
      <div><div class="page-title">${UI.esc(title)}</div><div class="crumb">Customer Portal · ${API.mode === 'local' ? 'Device-local demo' : 'Secure backend'}</div></div>
      <div class="spacer"></div>
      ${API.mode === 'local' ? '<span class="badge badge-amber" title="Running on GitHub Pages without the backend. Data stays on this device.">Demo mode</span>' : '<span class="badge badge-green">● Live</span>'}
      <button class="icon-btn" id="notif-btn" aria-label="Notifications">🔔${unread ? `<span class="dot">${unread > 9 ? '9+' : unread}</span>` : ''}</button>
      <button class="icon-btn" id="logout-top" aria-label="Sign out" title="Sign out">⏻</button>
    </div>`;
  }

  /* ---------------- render ---------------- */
  async function render() {
    const p = path();
    const m = match(p);
    const root = app();
    if (!m) { root.innerHTML = publicHeader('') + `<div class="container section">${UI.empty('🧭', 'Page not found', 'The page you are looking for does not exist.', '<a class="btn btn-gold" href="#/">Go home</a>')}</div>` + publicFooter(); bindShell(); return; }
    const { r, params } = m;
    if (r.auth && !user) { go('/login?next=' + encodeURIComponent(p)); return; }
    current = { r, params };
    document.title = (r.title ? r.title + ' — ' : '') + 'Golden Financial Services';
    const layout = r.layout || 'public';
    if (layout === 'portal') root.innerHTML = `<div class="portal">${sidebar(p)}<div class="portal-main">${topbar(r.title || '')}<main class="portal-content" id="page">${UI.loading()}</main></div></div>`;
    else if (layout === 'auth') root.innerHTML = `<main id="page">${UI.loading()}</main>`;
    else root.innerHTML = publicHeader(r.nav || p) + `<main id="page">${UI.loading()}</main>` + publicFooter();
    bindShell();
    window.scrollTo(0, 0);
    try {
      const out = await r.render(params, query());
      const page = $('#page');
      if (!page) return;
      page.innerHTML = typeof out === 'string' ? out : out.html;
      if (r.mount) await r.mount(page, params, query());
      if (typeof out === 'object' && out.mount) await out.mount(page, params);
    } catch (e) {
      const page = $('#page');
      if (page) page.innerHTML = `<div class="container section"><div class="alert alert-error">⚠ ${UI.esc(e.message || 'Could not load this page.')}</div><a class="btn btn-ghost" href="#/portal">Back to dashboard</a></div>`;
    }
  }

  function bindShell() {
    const nt = $('#nav-toggle'); if (nt) nt.onclick = () => $('#pub-nav').classList.toggle('open');
    const dd = $('#loans-dd-btn'); if (dd) dd.onclick = e => { e.preventDefault(); $('#loans-dd').classList.toggle('open'); };
    document.addEventListener('click', e => { const d = $('#loans-dd'); if (d && !d.contains(e.target)) d.classList.remove('open'); });
    const mb = $('#menu-btn'); if (mb) mb.onclick = () => { $('#sidebar').classList.add('open'); $('#sidebar-back').classList.add('show'); };
    const sb = $('#sidebar-back'); if (sb) sb.onclick = () => { $('#sidebar').classList.remove('open'); sb.classList.remove('show'); };
    const nb = $('#notif-btn'); if (nb) nb.onclick = () => go('/portal/notifications');
    const doLogout = async () => {
      if (!(await UI.confirmDialog('Sign out?', 'You will be signed out of the customer portal.', { confirmText: 'Sign out' }))) return;
      try { await API.post('/api/auth/logout'); } catch {}
      API.setToken(''); user = null;
      // Logo during logout, as required
      app().innerHTML = `<div class="auth-wrap"><div class="center" style="color:#fff"><img src="assets/logo.png" alt="Golden Financial Services" style="height:110px;margin-bottom:18px"><h2 style="color:#fff">Signing you out…</h2><p style="color:#CFE8DD">Thank you for banking with Golden Financial Services.</p><div class="spinner" style="margin-top:16px"></div></div></div>`;
      setTimeout(() => go('/'), 1100);
    };
    const lb = $('#logout-btn'); if (lb) lb.onclick = doLogout;
    const lt = $('#logout-top'); if (lt) lt.onclick = doLogout;
  }

  async function refreshUser() {
    try { const d = await API.get('/api/me'); user = d.user; } catch { user = null; }
    if (user) { try { const n = await API.get('/api/notifications'); unread = n.unread || 0; } catch {} }
    return user;
  }
  async function boot() {
    await API.init();
    try { config = await API.get('/api/config'); } catch { config = null; }
    await refreshUser();
    API.onUnauthorized(() => { user = null; if (path().startsWith('/portal')) go('/login'); });
    window.addEventListener('hashchange', render);
    if (!location.hash) location.hash = '#/';
    await render();
    if ('serviceWorker' in navigator && API.mode === 'server') navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  return { route, go, render, boot, refreshUser, get user() { return user; }, set user(u) { user = u; }, get config() { return config; }, get unread() { return unread; }, set unread(n) { unread = n; }, path, query };
})();
window.addEventListener('DOMContentLoaded', App.boot);
