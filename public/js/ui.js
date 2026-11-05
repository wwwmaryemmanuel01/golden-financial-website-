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

  /* ---- toasts ---- */
  function toast(msg, type = 'ok', ms = 4200) {
    const icons = { ok: '✓', err: '⚠', warn: '⚠', info: 'ℹ' };
    const t = document.createElement('div');
    t.className = 'toast ' + (type === 'ok' ? '' : type);
    t.innerHTML = `<span class="t-ico">${icons[type] || '✓'}</span><div>${esc(msg)}</div>`;
    document.getElementById('toasts').appendChild(t);
    setTimeout(() => { t.style.transition = '.3s'; t.style.opacity = '0'; t.style.transform = 'translateX(20px)'; setTimeout(() => t.remove(), 320); }, ms);
  }

  /* ---- modal ---- */
  let modalClose = null;
  function modal(html, { wide = false, onClose } = {}) {
    const root = document.getElementById('modal-root');
    root.innerHTML = `<div class="modal-back"><div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true">${html}</div></div>`;
    const back = root.firstElementChild;
    const close = () => { root.innerHTML = ''; modalClose = null; if (onClose) onClose(); };
    modalClose = close;
    back.addEventListener('click', e => { if (e.target === back) close(); });
    document.addEventListener('keydown', function h(e) { if (e.key === 'Escape' && modalClose === close) { close(); document.removeEventListener('keydown', h); } });
    back.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', close));
    return { el: back.querySelector('.modal'), close };
  }
  function confirmDialog(title, message, { confirmText = 'Confirm', danger = false } = {}) {
    return new Promise(resolve => {
      const m = modal(`<h3>${esc(title)}</h3><p class="muted">${esc(message)}</p>
        <div class="m-actions"><button class="btn btn-ghost" data-close>Cancel</button>
        <button class="btn ${danger ? 'btn-danger' : 'btn-emerald'}" id="cf-yes">${esc(confirmText)}</button></div>`);
      m.el.querySelector('#cf-yes').addEventListener('click', () => { m.close(); resolve(true); });
      m.el.addEventListener('click', e => { if (e.target.closest('[data-close]')) resolve(false); });
    });
  }

  /* ---- badges ---- */
  const STATUS_MAP = {
    active: ['badge-green', 'Active'], closed: ['badge-grey', 'Closed'], settled: ['badge-green', 'Settled'],
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
      const orig = btn ? btn.innerHTML : '';
      if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner" style="width:16px;height:16px;border-width:2px;margin:0"></span> Working…'; }
      try { await handler(data, form); }
      catch (err) { toast(err.message || 'Something went wrong.', 'err'); }
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
    canvas.addEventListener('mousedown', start); canvas.addEventListener('mousemove', move); window.addEventListener('mouseup', end);
    canvas.addEventListener('touchstart', start, { passive: false }); canvas.addEventListener('touchmove', move, { passive: false }); canvas.addEventListener('touchend', end);
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
  const productIcon = id => ({ PL: '👤', BL: '💼', EL: '🚨', SA: '💷', AL: '🌾', ED: '🎓', ML: '🏥', AF: '🚗', GL: '🤝', MG: '🏠' }[id] || '💰');
  const notifIcon = cat => ({ payment: '💳', disbursement: '💰', application: '📋', reminder: '⏰', overdue: '⚠️', security: '🔐', kyc: '🪪', welcome: '👋', settlement: '🎉', support: '🎧', request: '📨' }[cat] || '🔔');

  return { esc, mk, mk2, date, datetime, toast, modal, confirmDialog, badge, table, empty, loading, skeleton, field, input, select, formData, bindForm, signaturePad, initials, progressBar, copy, download, stageTrack, productIcon, notifIcon };
})();
