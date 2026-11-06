/* UI kit: escaping, formatting, toasts, modals, confirms, tables, forms,
   loading states, signature pad, icons. No dependencies. */
'use strict';
const UI = (() => {
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const mk = v => GFS.mk(v);
  const mk2 = v => GFS.mk2(v);
  const date = d => GFS.fmtDate(d);
  const datetime = d => GFS.fmtDateTime(d);
  const G = () => window.GFS;

  const ICONS = {
    search:'<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>', menu:'<path d="M4 7h16M4 12h16M4 17h16"/>', close:'<path d="m6 6 12 12M18 6 6 18"/>', chevron:'<path d="m6 9 6 6 6-6"/>', arrow:'<path d="M5 12h14m-6-6 6 6-6 6"/>', external:'<path d="M14 5h5v5M19 5l-9 9"/><path d="M17 13v6H5V7h6"/>',
    phone:'<path d="M7 4h3l1 4-2 1c1 3 3 5 6 6l1-2 4 1v3c0 1-1 2-2 2C10 19 5 14 5 6c0-1 1-2 2-2"/>', mail:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>', pin:'<path d="M12 21s7-7 7-12a7 7 0 0 0-14 0c0 5 7 12 7 12Z"/><circle cx="12" cy="9" r="2"/>',
    shield:'<path d="M12 3 5 6v5c0 5 3 8 7 10 4-2 7-5 7-10V6l-7-3Z"/><path d="m9 12 2 2 4-4"/>', grid:'<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/>',
    chart:'<path d="M4 20V10m8 10V4m8 16v-7"/>', wallet:'<rect x="3" y="6" width="18" height="14" rx="2"/><path d="M3 9h18M16 14h3"/>', file:'<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v5h5M10 12h5M10 16h5"/>', plus:'<path d="M12 5v14M5 12h14"/>', inbox:'<path d="M4 5h16v14H4z"/><path d="M4 13h5l2 3h2l2-3h5"/>',
    card:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h4"/>', list:'<path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/>', receipt:'<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>', documents:'<path d="M8 3h8l3 3v13H8z"/><path d="M5 7v14h11M16 3v4h4"/>',
    user:'<circle cx="12" cy="8" r="4"/><path d="M4 21c1-5 4-7 8-7s7 2 8 7"/>', users:'<circle cx="9" cy="8" r="3"/><path d="M3 20c1-4 3-6 6-6s5 2 6 6M16 5a3 3 0 0 1 0 6M18 14c2 1 3 3 3 6"/>', id:'<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8" cy="11" r="2"/><path d="M5 16c1-2 5-2 6 0M14 9h4M14 13h4"/>',
    home:'<path d="m3 11 9-8 9 8"/><path d="M5 10v11h14V10M10 21v-7h4v7"/>', settings:'<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/>', clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    chat:'<path d="M4 5h16v11H9l-5 4z"/><path d="M8 9h8M8 12h5"/>', headset:'<path d="M4 13v-2a8 8 0 0 1 16 0v2"/><rect x="3" y="12" width="4" height="7" rx="2"/><rect x="17" y="12" width="4" height="7" rx="2"/><path d="M19 19c0 2-3 2-5 2"/>', bell:'<path d="M6 16V10a6 6 0 0 1 12 0v6l2 2H4zM10 21h4"/>', globe:'<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c4 5 4 13 0 18M12 3c-4 5-4 13 0 18"/>',
    logout:'<path d="M10 5H5v14h5M14 8l4 4-4 4M8 12h10"/>', link:'<path d="M10 14a4 4 0 0 0 6 0l3-3a4 4 0 0 0-6-6l-1 1M14 10a4 4 0 0 0-6 0l-3 3a4 4 0 0 0 6 6l1-1"/>', flask:'<path d="M9 3h6M10 3v6l-5 9c-1 2 0 3 2 3h10c2 0 3-1 2-3l-5-9V3"/><path d="M8 15h8"/>', alert:'<path d="M12 3 2 21h20z"/><path d="M12 9v5M12 17v1"/>', compass:'<circle cx="12" cy="12" r="9"/><path d="m15 9-2 5-5 2 2-5z"/>',
    check:'<path d="m5 12 4 4L19 6"/>', download:'<path d="M12 3v12m-5-5 5 5 5-5M5 20h14"/>', upload:'<path d="M12 16V4m-5 5 5-5 5 5M5 20h14"/>', lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>', leaf:'<path d="M20 4C10 4 4 9 4 16c0 2 1 4 3 4 7 0 12-6 13-16Z"/><path d="M4 20 15 9"/>', briefcase:'<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V4h6v3M3 12h18"/>', heart:'<path d="M12 20S4 15 4 9a4 4 0 0 1 8-1 4 4 0 0 1 8 1c0 6-8 11-8 11Z"/>', graduation:'<path d="m2 9 10-5 10 5-10 5zM6 11v6c4 3 8 3 12 0v-6"/>', car:'<path d="m5 11 2-6h10l2 6M3 11h18v7H3zM6 18v2M18 18v2"/><circle cx="7" cy="14" r="1"/><circle cx="17" cy="14" r="1"/>', bolt:'<path d="m13 2-8 12h7l-1 8 8-12h-7z"/>'
  };
  const icon = (name, cls = '') => `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ICONS.file}</svg>`;

  /* ---- toasts ---- */
  function toast(msg, type = 'ok', ms = 4200) {
    const icons = { ok: '✓', err: '⚠', warn: '⚠', info: 'ℹ' };
    const t = document.createElement('div');
    t.className = 'toast ' + (type === 'ok' ? '' : type);
    t.innerHTML = `<span class="t-ico">${icon(type === 'ok' ? 'check' : type === 'err' ? 'alert' : 'bell')}</span><div>${esc(msg)}</div>`; t.setAttribute('role', type === 'err' ? 'alert' : 'status');
    document.getElementById('toasts').appendChild(t);
    setTimeout(() => { t.style.transition = '.3s'; t.style.opacity = '0'; t.style.transform = 'translateX(20px)'; setTimeout(() => t.remove(), 320); }, ms);
  }

  /* ---- modal ---- */
  let modalClose = null;
  function modal(html, { wide = false, onClose } = {}) {
    const root = document.getElementById('modal-root'); const previousFocus = document.activeElement;
    root.innerHTML = `<div class="modal-back"><div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true">${html}</div></div>`;
    const back = root.firstElementChild;
    const close = () => { root.innerHTML = ''; modalClose = null; document.body.classList.remove('modal-open'); if (previousFocus?.focus) previousFocus.focus(); if (onClose) onClose(); }; document.body.classList.add('modal-open');
    modalClose = close;
    back.addEventListener('click', e => { if (e.target === back) close(); });
    document.addEventListener('keydown', function h(e) { if (e.key === 'Escape' && modalClose === close) { close(); document.removeEventListener('keydown', h); } });
    back.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', close));
    back.addEventListener('keydown', e => { if (e.key !== 'Tab') return; const nodes = [...back.querySelectorAll('a[href],button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]')].filter(n => n.offsetParent !== null); if (!nodes.length) return; const first = nodes[0], last = nodes[nodes.length - 1]; if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); } });
    setTimeout(() => (back.querySelector('input,select,textarea,button') || back).focus(), 30);
    return { el: back.querySelector('.modal'), close };
  }
  function confirmDialog(title, message, { confirmText = 'Confirm', danger = false } = {}) {
    return new Promise(resolve => {
      let settled = false; const done = value => { if (!settled) { settled = true; resolve(value); } };
      const m = modal(`<h3>${esc(title)}</h3><p class="muted">${esc(message)}</p>
        <div class="m-actions"><button class="btn btn-ghost" data-close>Cancel</button>
        <button class="btn ${danger ? 'btn-danger' : 'btn-emerald'}" id="cf-yes">${esc(confirmText)}</button></div>`);
      m.el.querySelector('#cf-yes').addEventListener('click', () => { done(true); m.close(); });
      m.el.addEventListener('click', e => { if (e.target.closest('[data-close]')) done(false); });
      const originalClose = m.close; m.close = () => { done(false); originalClose(); };
    });
  }

  /* ---- badges ---- */
  const STATUS_MAP = {
    agreement_accepted: ['badge-blue', 'Agreement signed'], awaiting_verification: ['badge-amber', 'Awaiting verification'], reconciliation: ['badge-amber', 'Reconciliation'], awaiting_consent: ['badge-amber', 'Awaiting consent'], awaiting_valuation: ['badge-amber', 'Awaiting valuation'], consent_document_received: ['badge-blue', 'Consent received'], stored: ['badge-grey', 'Stored'], answered: ['badge-green', 'Answered'], active: ['badge-green', 'Active'], closed: ['badge-grey', 'Closed'], settled: ['badge-green', 'Settled'],
    approved: ['badge-green', 'Approved'], rejected: ['badge-red', 'Rejected'],
    submitted: ['badge-blue', 'Submitted'], under_review: ['badge-blue', 'Under review'],
    pending_documents: ['badge-amber', 'Documents needed'], disbursed: ['badge-green', 'Disbursed'],
    cancelled: ['badge-grey', 'Cancelled'], pending: ['badge-amber', 'Pending'],
    verified: ['badge-green', 'Verified'], failed: ['badge-red', 'Failed'], reversed: ['badge-grey', 'Reversed'],
    open: ['badge-blue', 'Open'], resolved: ['badge-green', 'Resolved'], in_review: ['badge-amber', 'In review'],
    paid: ['badge-green', 'Paid'], partial: ['badge-amber', 'Partial'], overdue: ['badge-red', 'Overdue'],
    released: ['badge-green', 'Released'], high: ['badge-red', 'High'], urgent: ['badge-red', 'Urgent'],
    normal: ['badge-grey', 'Normal'], low: ['badge-grey', 'Low'], approved_offer: ['badge-gold', 'Offer ready']
  };
  function badge(status) {
    const m = STATUS_MAP[String(status || '').toLowerCase()] || ['badge-grey', String(status || '—').replace(/_/g, ' ')];
    return `<span class="badge ${m[0]}">${esc(m[1])}</span>`;
  }

  /* ---- tables ---- */
  function table(headers, rows, { numCols = [], foot = null } = {}) {
    if (!rows.length) return '';
    return `<div class="table-wrap"><table class="tbl"><thead><tr>${headers.map((h, i) => `<th class="${numCols.includes(i) ? 'num' : ''}">${esc(h)}</th>`).join('')}</tr></thead>
      <tbody>${rows.map(r => `<tr>${r.map((c, i) => `<td class="${numCols.includes(i) ? 'num' : ''}">${c == null ? '' : c}</td>`).join('')}</tr>`).join('')}</tbody>
      ${foot ? `<tfoot><tr>${foot.map((c, i) => `<td class="${numCols.includes(i) ? 'num' : ''}">${c}</td>`).join('')}</tr></tfoot>` : ''}</table></div>`;
  }
  const empty = (icon, title, sub = '', action = '') => `<div class="empty"><div class="e-ico">${icon}</div><h3>${esc(title)}</h3><p class="muted small">${esc(sub)}</p>${action}</div>`;
  const loading = (label = 'Loading…') => `<div class="loading-page"><div class="spinner"></div><p style="margin-top:14px;font-weight:600">${esc(label)}</p></div>`;
  const skeleton = (n = 3) => Array.from({ length: n }, () => `<div class="skel" style="height:74px;margin-bottom:14px"></div>`).join('');

  /* ---- forms ---- */
  function field(label, inputHtml, hint = '') {
    return `<div class="field"><label>${esc(label)}</label>${inputHtml}${hint ? `<span class="hint">${esc(hint)}</span>` : ''}</div>`;
  }
  const input = (name, attrs = '') => `<input name="${name}" ${attrs}>`;
  const select = (name, options, selected = '', attrs = '') =>
    `<select name="${name}" ${attrs}>${options.map(o => { const [v, l] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(v)}" ${String(v) === String(selected) ? 'selected' : ''}>${esc(l)}</option>`; }).join('')}</select>`;
  function formData(form) {
    const out = {};
    new FormData(form).forEach((v, k) => {
      if (k.endsWith('[]')) { const kk = k.slice(0, -2); (out[kk] = out[kk] || []).push(v); }
      else out[k] = v;
    });
    form.querySelectorAll('input[type=checkbox]').forEach(c => { out[c.name] = c.checked; });
    return out;
  }
  function bindForm(form, handler, { confirmText } = {}) {
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const btn = form.querySelector('[type=submit]');
      const data = formData(form);
      if (confirmText && !(await confirmDialog('Please confirm', confirmText))) return;
      form.querySelector('.form-error')?.remove(); const orig = btn ? btn.innerHTML : '';
      if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner" style="width:16px;height:16px;border-width:2px;margin:0"></span> Working…'; }
      try { await handler(data, form); }
      catch (err) { let box = form.querySelector('.form-error'); if (!box) { box = document.createElement('div'); box.className = 'alert alert-error form-error'; box.setAttribute('role', 'alert'); form.prepend(box); } box.textContent = err.message || 'Something went wrong.'; box.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); toast(err.message || 'Something went wrong.', 'err'); }
      finally { if (btn) { btn.disabled = false; btn.innerHTML = orig; } }
    });
  }

  /* ---- signature pad ---- */
  function signaturePad(canvas) {
    const ctx = canvas.getContext('2d');
    let drawing = false, has = false;
    const resize = () => { const r = canvas.getBoundingClientRect(); canvas.width = r.width * 2; canvas.height = r.height * 2; ctx.scale(2, 2); ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.strokeStyle = '#12305A'; };
    resize();
    const pos = e => { const r = canvas.getBoundingClientRect(); const t = e.touches ? e.touches[0] : e; return { x: t.clientX - r.left, y: t.clientY - r.top }; };
    const start = e => { drawing = true; has = true; const p = pos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); e.preventDefault(); };
    const move = e => { if (!drawing) return; const p = pos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); e.preventDefault(); };
    const end = () => { drawing = false; };
    canvas.style.touchAction = 'none';
    canvas.addEventListener('pointerdown', e => { canvas.setPointerCapture(e.pointerId); start(e); });
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end);
    return {
      clear() { ctx.clearRect(0, 0, canvas.width, canvas.height); has = false; },
      isEmpty() { return !has; },
      dataURL() { return canvas.toDataURL('image/png'); }
    };
  }

  /* ---- misc ---- */
  const initials = (f, l) => ((f || ' ')[0] + (l || ' ')[0]).toUpperCase();
  const progressBar = pct => `<div class="progress" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><div style="width:${Math.min(100, Math.max(0, pct))}%"></div></div>`;
  const copy = async text => { try { await navigator.clipboard.writeText(text); toast('Copied to clipboard.'); } catch { toast('Copy not available in this browser.', 'warn'); } };
  function download(path, filename) { const a = document.createElement('a'); a.href = path; a.download = filename || ''; document.body.appendChild(a); a.click(); a.remove(); }
  const stageNames = { intake: 'Intake', verification: 'Verification', credit_assessment: 'Assessment', guarantor_verification: 'Guarantors', collateral_verification: 'Collateral', decision: 'Decision', offer: 'Offer', agreement: 'Agreement', disbursement: 'Disbursement', complete: 'Complete', closed: 'Closed' };
  function stageTrack(current, status) {
    const stages = ['intake', 'verification', 'credit_assessment', 'decision', 'offer', 'agreement', 'disbursement', 'complete'];
    let idx = stages.indexOf(current);
    if (status === 'disbursed') idx = stages.length;
    if (status === 'rejected' || status === 'cancelled') idx = Math.max(idx, 3);
    return `<div class="stage-track">${stages.map((s, i) => `<div class="stage ${i < idx ? 'done' : i === idx ? 'current' : ''}">${stageNames[s] || s}</div>`).join('')}</div>`;
  }
  const productIcon = id => icon({ PL: 'user', BL: 'briefcase', EL: 'bolt', SA: 'wallet', AL: 'leaf', ED: 'graduation', ML: 'heart', AF: 'car', GL: 'users', MG: 'home' }[id] || 'wallet');
  const notifIcon = cat => icon({ payment: 'card', disbursement: 'wallet', application: 'file', reminder: 'clock', overdue: 'alert', security: 'shield', kyc: 'id', welcome: 'user', settlement: 'check', support: 'headset', request: 'inbox' }[cat] || 'bell');

  const productLabel = p => typeof p === 'string' ? (GFS.productById(p, true)?.label || GFS.productById(p, true)?.name || p) : (p?.label || p?.name || '');
  return { productLabel, icon, esc, mk, mk2, date, datetime, toast, modal, confirmDialog, badge, table, empty, loading, skeleton, field, input, select, formData, bindForm, signaturePad, initials, progressBar, copy, download, stageTrack, productIcon, notifIcon };
})();
