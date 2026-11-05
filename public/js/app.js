/* Rebuilt application shell: accessible public site, customer portal,
   command/search palette, responsive navigation and honest mode labels. */
'use strict';
const App = (() => {
  const routes = []; let user = null, config = null, unread = 0, renderVersion = 0, idleTimer;
  const $ = s => document.querySelector(s), app = () => $('#app');
  const products = () => config?.products || GFS.PRODUCTS;
  const company = () => config?.company || GFS.COMPANY;
  const modeLabel = () => API.mode === 'local' ? 'Device sandbox' : config?.mode === 'sandbox' ? 'Sandbox backend' : 'Secure backend';
  function route(pattern, def) { routes.push({ pattern, keys: (pattern.match(/:[^/]+/g) || []).map(k => k.slice(1)), ...def }); }
  function match(path) { for (const r of routes) { const m = path.match(new RegExp('^' + r.pattern.replace(/:[^/]+/g, '([^/]+)') + '$')); if (m) { const params = {}; r.keys.forEach((k, i) => params[k] = decodeURIComponent(m[i + 1])); return { r, params }; } } return null; }
  const go = path => { if (location.hash === '#' + path) render(); else location.hash = '#' + path; };
  const path = () => (location.hash || '#/').slice(1).split('?')[0] || '/';
  const query = () => Object.fromEntries(new URLSearchParams((location.hash.split('?')[1] || '')));
  const brand = (dark = false) => `<a class="brand" href="#/" aria-label="Golden Financial Services home"><img src="assets/${dark ? 'logo-dark.png' : 'logo.png'}" alt="Golden Financial Services"><span class="brand-wordmark">GOLDEN<span>FINANCIAL SERVICES</span></span></a>`;
  function publicHeader(active) {
    const c = company();
    return `<a class="skip-link" href="#page">Skip to content</a><div class="utility-bar"><div class="container utility-inner"><span>${UI.icon('pin')} Malawi · Malawi Kwacha (MWK)</span><span class="utility-contact"><a href="tel:${UI.esc(c.phone)}">${UI.icon('phone')} ${UI.esc(c.phone)}</a><a href="mailto:${UI.esc(c.email)}">${UI.icon('mail')} ${UI.esc(c.email)}</a></span></div></div>
    <header class="site-header"><div class="container site-header-inner">${brand()}
      <nav class="site-nav" id="site-nav" aria-label="Main navigation">
        <a href="#/" class="${active === '/' ? 'active' : ''}">Home</a>
        <div class="nav-drop"><button class="nav-drop-btn ${active.startsWith('/loans') ? 'active' : ''}" aria-expanded="false" data-drop="loans-menu">Loans ${UI.icon('chevron')}</button><div class="mega-menu" id="loans-menu"><div class="mega-intro"><span class="eyebrow">Ten ways to grow</span><h3>Find the right financing</h3><p>Clear amounts, terms and pricing before you apply.</p><a href="#/loans" class="text-link">Compare all products ${UI.icon('arrow')}</a></div><div class="mega-products">${products().map(p => `<a href="#/loans/${p.id}"><span class="mini-product-icon">${UI.productIcon(p.id)}</span><span><b>${UI.esc(p.name)}</b><small>${GFS.mk(p.min)} – ${GFS.mk(p.max)}</small></span></a>`).join('')}</div></div></div>
        <div class="nav-drop"><button class="nav-drop-btn" aria-expanded="false" data-drop="tools-menu">Tools & help ${UI.icon('chevron')}</button><div class="small-menu" id="tools-menu">${[['/calculator', 'Loan calculator'], ['/eligibility', 'Eligibility check'], ['/requirements', 'Requirements'], ['/rates', 'Rates & fees'], ['/repayment-methods', 'Repayment methods'], ['/how-it-works', 'Application process'], ['/faq', 'FAQs'], ['/branches', 'Branches'], ['/announcements', 'Announcements'], ['/testimonials', 'Customer stories']].map(([h, l]) => `<a href="#${h}">${l}</a>`).join('')}</div></div>
        <a href="#/about" class="${active === '/about' ? 'active' : ''}">About</a><a href="#/contact" class="${active === '/contact' ? 'active' : ''}">Contact</a>
      </nav>
      <div class="header-actions"><button class="icon-btn search-trigger" id="search-open" aria-label="Search website">${UI.icon('search')}</button>${user ? '<a href="#/portal" class="btn btn-emerald btn-sm">My portal</a>' : '<a href="#/login" class="header-login">Sign in</a><a href="#/apply" class="btn btn-gold btn-sm">Apply now</a>'}<button class="icon-btn mobile-menu-btn" id="mobile-menu" aria-label="Open menu" aria-expanded="false">${UI.icon('menu')}</button></div>
    </div></header>`;
  }
  function publicFooter() {
    const c = company();
    return `<footer class="site-footer"><div class="container"><div class="footer-grid"><div class="footer-brand">${brand(true)}<p>${UI.esc(c.tagline)}. Responsible lending in Malawi Kwacha, with clear terms and a secure customer portal.</p><div class="footer-mode">${UI.icon('shield')} ${modeLabel()} · ${API.mode === 'local' || config?.mode === 'sandbox' ? 'No real money moves' : 'Provider services require configuration'}</div></div>
      <div><h4>Loan products</h4>${products().slice(0, 6).map(p => `<a href="#/loans/${p.id}">${UI.esc(p.name)}</a>`).join('')}<a href="#/loans">All ten products →</a></div>
      <div><h4>Customer tools</h4>${[['/calculator', 'Calculator'], ['/eligibility', 'Eligibility'], ['/apply', 'Apply for a loan'], ['/portal', 'Customer portal'], ['/requirements', 'Requirements'], ['/repayment-methods', 'Repayment methods']].map(([h, l]) => `<a href="#${h}">${l}</a>`).join('')}</div>
      <div><h4>Company & help</h4>${[['/about', 'About us'], ['/services', 'Services'], ['/branches', 'Branches'], ['/contact', 'Contact'], ['/faq', 'FAQs'], ['/announcements', 'Announcements'], ['/terms', 'Terms'], ['/privacy', 'Privacy']].map(([h, l]) => `<a href="#${h}">${l}</a>`).join('')}</div></div>
      <div class="footer-system"><div>${UI.icon('link')} <b>Golden Loan Services</b><span>Separate administration repository. The public version is a static prototype, not a live shared database.</span></div><a href="${UI.esc(c.adminRepo)}" target="_blank" rel="noopener" class="btn btn-ghost btn-sm">View repository ${UI.icon('external')}</a></div>
      <div class="footer-bottom"><span>© ${new Date().getFullYear()} ${UI.esc(c.legal || c.name)}. All rights reserved.</span><span>MWK · <a href="#/privacy">Privacy</a> · <a href="#/terms">Terms</a></span></div></div></footer>`;
  }
  function sidebar(active) {
    const groups = [
      ['Overview', [['/portal', 'grid', 'Dashboard'], ['/portal/analytics', 'chart', 'Insights']]],
      ['Borrowing', [['/portal/loans', 'wallet', 'My loans'], ['/portal/applications', 'file', 'Applications'], ['/portal/apply', 'plus', 'Apply for a loan'], ['/portal/requests', 'inbox', 'Loan requests']]],
      ['Money & records', [['/portal/payments', 'card', 'Payments'], ['/portal/transactions', 'list', 'Transactions'], ['/portal/receipts', 'receipt', 'Receipts'], ['/portal/statements', 'documents', 'Statements']]],
      ['Account', [['/portal/profile', 'user', 'Profile'], ['/portal/documents', 'id', 'Documents & KYC'], ['/portal/guarantors', 'users', 'Guarantors'], ['/portal/collateral', 'home', 'Collateral'], ['/portal/security', 'shield', 'Security'], ['/portal/settings', 'settings', 'Settings'], ['/portal/activity', 'clock', 'Activity']]],
      ['Help', [['/portal/chat', 'chat', 'Assistant'], ['/portal/support', 'headset', 'Support & complaints'], ['/portal/notifications', 'bell', 'Notifications', unread]]]
    ];
    const name = user ? `${user.firstName || ''} ${user.lastName || ''}` : '';
    return `<div class="sidebar-back" id="sidebar-back"></div><aside class="sidebar" id="sidebar" aria-label="Customer portal navigation"><div class="sidebar-brand">${brand(true)}<button class="icon-btn sidebar-close" id="sidebar-close" aria-label="Close menu">${UI.icon('close')}</button></div>
      <div class="sidebar-user"><div class="avatar" id="sidebar-avatar">${UI.initials(user?.firstName, user?.lastName)}</div><div><b>${UI.esc(name)}</b><span>${UI.esc(user?.customerNo || '')}</span></div></div>
      <nav class="s-nav">${groups.map(([head, items]) => `<div class="sn-head">${head}</div>${items.map(([h, icon, label, count]) => `<a href="#${h}" class="${active === h || (h !== '/portal' && active.startsWith(h + '/')) ? 'active' : ''}">${UI.icon(icon)}<span>${label}</span>${count ? `<em>${count > 99 ? '99+' : count}</em>` : ''}</a>`).join('')}`).join('')}<div class="sn-head">Website</div><a href="#/">${UI.icon('globe')}<span>Public website</span></a></nav>
      <div class="sidebar-foot"><span>${UI.esc(user?.email || '')}</span><button class="btn-link" id="logout-btn">Sign out ${UI.icon('arrow')}</button></div></aside>`;
  }
  function topbar(title) {
    return `<header class="topbar"><button class="icon-btn menu-btn" id="menu-btn" aria-label="Open portal menu">${UI.icon('menu')}</button><div class="topbar-title"><h1>${UI.esc(title)}</h1><span>Customer portal · ${modeLabel()}</span></div><div class="spacer"></div><button class="icon-btn search-trigger" id="search-open" aria-label="Search">${UI.icon('search')}</button><span class="mode-chip ${API.mode === 'local' || config?.mode === 'sandbox' ? 'sandbox' : ''}">${UI.icon(API.mode === 'local' || config?.mode === 'sandbox' ? 'flask' : 'shield')} ${modeLabel()}</span><button class="icon-btn notif-trigger" id="notif-btn" aria-label="${unread} unread notifications">${UI.icon('bell')}${unread ? `<span class="dot">${unread > 9 ? '9+' : unread}</span>` : ''}</button><button class="icon-btn" id="logout-top" aria-label="Sign out">${UI.icon('logout')}</button></header>`;
  }
  async function render() {
    const version = ++renderVersion, p = path(), m = match(p), root = app();
    if (API.mode === 'unavailable') { root.innerHTML = `<main class="connection-screen"><div class="card">${brand()}<h1>Backend connection needed</h1><p>${UI.esc(API.connectionError)}</p><button class="btn btn-gold" id="retry-connection">Retry connection</button></div></main>`; $('#retry-connection').onclick = async () => { await API.init(); if (API.mode !== 'unavailable') location.reload(); else render(); }; return; }
    if (!m) { root.innerHTML = publicHeader('') + `<main id="page" tabindex="-1"><div class="container section">${UI.empty(UI.icon('compass'), 'Page not found', 'The page you requested does not exist.', '<a class="btn btn-gold" href="#/">Go home</a>')}</div></main>` + publicFooter(); bindShell(); return; }
    const { r, params } = m;
    if (r.auth && !user) { go('/login?next=' + encodeURIComponent(p + (location.hash.includes('?') ? '?' + location.hash.split('?')[1] : ''))); return; }
    document.title = (r.title ? r.title + ' — ' : '') + 'Golden Financial Services';
    const layout = r.layout || 'public';
    if (layout === 'portal') root.innerHTML = `<a class="skip-link" href="#page">Skip to content</a><div class="portal">${sidebar(p)}<div class="portal-main">${topbar(r.title || '')}<main class="portal-content" id="page" tabindex="-1">${UI.loading()}</main></div></div>`;
    else if (layout === 'auth') root.innerHTML = `<main id="page" tabindex="-1">${UI.loading()}</main>`;
    else root.innerHTML = publicHeader(r.nav || p) + `<main id="page" tabindex="-1">${UI.loading()}</main>` + publicFooter();
    bindShell(); window.scrollTo(0, 0);
    try {
      const out = await r.render(params, query());
      if (version !== renderVersion) return;
      const page = $('#page'); if (!page) return;
      page.innerHTML = typeof out === 'string' ? out : out.html;
      if (r.mount) await r.mount(page, params, query());
      if (typeof out === 'object' && out.mount) await out.mount(page, params);
      if (version === renderVersion) page.focus({ preventScroll: true });
    } catch (e) {
      if (version !== renderVersion) return;
      const page = $('#page'); if (page) page.innerHTML = `<div class="container section"><div class="alert alert-error">${UI.icon('alert')}<div><b>We couldn’t load this page.</b><br>${UI.esc(e.message || 'Please try again.')}</div></div><button class="btn btn-ghost" id="page-retry">Try again</button> <a class="btn btn-emerald" href="#/portal">Back to dashboard</a></div>`, $('#page-retry').onclick = render;
    }
  }
  function searchPalette() {
    const entries = [['Home', '/'], ['About us', '/about'], ['Services', '/services'], ['Loan products', '/loans'], ['Calculator', '/calculator'], ['Eligibility check', '/eligibility'], ['Application process', '/how-it-works'], ['Requirements', '/requirements'], ['Rates & fees', '/rates'], ['Repayment methods', '/repayment-methods'], ['FAQs', '/faq'], ['Contact', '/contact'], ['Branches', '/branches'], ['Announcements', '/announcements'], ['Testimonials', '/testimonials'], ['Apply for a loan', '/apply'], ['Customer portal', '/portal'], ...products().map(p => [p.name, '/loans/' + p.id]), ...(user ? [['Dashboard', '/portal'], ['My loans', '/portal/loans'], ['Applications', '/portal/applications'], ['Payments', '/portal/payments'], ['Documents & KYC', '/portal/documents'], ['Support', '/portal/support'], ['Settings', '/portal/settings']] : [['Sign in', '/login'], ['Create account', '/register']])];
    const m = UI.modal(`<div class="search-modal-head">${UI.icon('search')}<input id="global-search" type="search" placeholder="Search pages, products and portal…" aria-label="Search website" autocomplete="off"><kbd>Esc</kbd></div><div id="search-results" class="search-results"></div>`, { wide: true });
    const input = m.el.querySelector('#global-search'), results = m.el.querySelector('#search-results');
    const draw = () => { const q = input.value.toLowerCase().trim(), found = entries.filter(([label]) => label.toLowerCase().includes(q)).slice(0, 12); results.innerHTML = found.length ? found.map(([label, h]) => `<a href="#${h}" data-search-link>${UI.icon('arrow')}<span>${UI.esc(label)}</span><small>${h.startsWith('/portal') ? 'Portal' : h.startsWith('/loans/') ? 'Product' : 'Page'}</small></a>`).join('') : '<p class="muted center">No matching pages. Try “calculator”, “business” or “documents”.</p>'; results.querySelectorAll('[data-search-link]').forEach(a => a.addEventListener('click', () => m.close())); };
    input.addEventListener('input', draw); draw(); setTimeout(() => input.focus(), 30);
  }
  function bindShell() {
    $('#mobile-menu')?.addEventListener('click', e => { const nav = $('#site-nav'), open = nav.classList.toggle('open'); e.currentTarget.setAttribute('aria-expanded', String(open)); });
    document.querySelectorAll('[data-drop]').forEach(btn => btn.addEventListener('click', e => { e.stopPropagation(); const menu = $('#' + btn.dataset.drop), open = menu.classList.toggle('open'); btn.setAttribute('aria-expanded', String(open)); document.querySelectorAll('.mega-menu.open,.small-menu.open').forEach(x => { if (x !== menu) x.classList.remove('open'); }); }));
    document.addEventListener('click', e => { if (!e.target.closest('.nav-drop')) document.querySelectorAll('.mega-menu.open,.small-menu.open').forEach(x => x.classList.remove('open')); });
    $('#search-open')?.addEventListener('click', searchPalette);
    const openSidebar = () => { $('#sidebar')?.classList.add('open'); $('#sidebar-back')?.classList.add('show'); };
    const closeSidebar = () => { $('#sidebar')?.classList.remove('open'); $('#sidebar-back')?.classList.remove('show'); };
    $('#menu-btn')?.addEventListener('click', openSidebar); $('#sidebar-close')?.addEventListener('click', closeSidebar); $('#sidebar-back')?.addEventListener('click', closeSidebar);
    $('#notif-btn')?.addEventListener('click', () => go('/portal/notifications'));
    const logout = async () => { if (!(await UI.confirmDialog('Sign out?', 'You will be signed out of the customer portal.', { confirmText: 'Sign out' }))) return; try { await API.post('/api/auth/logout'); } catch {} API.setToken(''); user = null; unread = 0; app().innerHTML = `<div class="logout-splash"><img src="assets/logo.png" alt="Golden Financial Services"><h2>Signing you out…</h2><p>Thank you for choosing Golden Financial Services.</p><div class="spinner"></div></div>`; setTimeout(() => go('/'), 900); };
    $('#logout-btn')?.addEventListener('click', logout); $('#logout-top')?.addEventListener('click', logout);
    if (user?.avatarDocId && API.mode === 'server') API.fileURL(`/api/documents/${user.avatarDocId}/file`).then(url => { const a = $('#sidebar-avatar'); if (a) a.innerHTML = `<img src="${url}" alt="">`; }).catch(() => {});
  }
  async function refreshUser() { try { user = (await API.get('/api/me')).user; } catch { user = null; } if (user) { try { unread = (await API.get('/api/notifications')).unread || 0; } catch {} } return user; }
  function resetIdle() { clearTimeout(idleTimer); if (!user) return; const minutes = config?.rules?.idleTimeoutMinutes || 20; idleTimer = setTimeout(async () => { if (!user) return; try { await API.post('/api/auth/logout'); } catch {} API.setToken(''); user = null; UI.toast('You were signed out after inactivity.', 'info'); go('/login'); }, minutes * 60000); }
  async function boot() {
    await API.init();
    if (API.mode !== 'unavailable') { try { config = await API.get('/api/config'); } catch { config = null; } try { config.announcements = (await API.get('/api/announcements')).announcements; } catch {} await refreshUser(); }
    API.onUnauthorized(() => { user = null; if (path().startsWith('/portal')) go('/login'); });
    window.addEventListener('hashchange', render);
    document.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); searchPalette(); } });
    ['pointerdown', 'keydown', 'scroll'].forEach(ev => document.addEventListener(ev, resetIdle, { passive: true })); resetIdle();
    if (!location.hash) history.replaceState(null, '', '#/');
    await render();
    if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  return { route, go, render, boot, refreshUser, searchPalette, get user() { return user; }, set user(u) { user = u; resetIdle(); }, get config() { return config; }, get unread() { return unread; }, set unread(n) { unread = n; }, path, query, products, company, modeLabel };
})();
window.addEventListener('DOMContentLoaded', App.boot);
