/* Read-only deposit, savings and withdrawal history from the signed connector. */
'use strict';
(() => {
  const esc = UI.esc;
  const TYPES = [['','All activity'],['deposit','Deposits'],['withdrawal','Withdrawals'],['savings_deposit','Savings deposits'],['savings_withdrawal','Savings withdrawals'],['savings_interest','Savings interest']];
  App.route('/portal/account-activity', { title:'Account activity', layout:'portal', auth:true, render:async () => {
    const d = await API.get('/api/account-activity');
    return `<div class="page-head"><div><h1>Deposits, savings & withdrawals</h1><div class="sub">Read-only activity reported by Golden Loan Services administration</div></div><a href="#/portal/notifications" class="btn btn-ghost btn-sm">${UI.icon('bell')} Notifications</a></div>
    ${d.sandbox || API.mode === 'local' ? `<div class="sandbox-banner inline">${UI.icon('flask')}<div><b>Sandbox records.</b> No real money moves in this environment.</div></div>` : ''}
    <div class="card"><div class="activity-filter-bar"><label class="search-field">${UI.icon('search')}<input id="activity-search" type="search" placeholder="Search reference or description…" aria-label="Search account activity"></label><label class="journal-sort">Activity type<select id="activity-type">${TYPES.map(([v,l]) => `<option value="${v}">${l}</option>`).join('')}</select></label><label class="journal-sort">Status<select id="activity-status"><option value="">All statuses</option><option value="completed">Completed</option><option value="pending">Pending</option><option value="rejected">Rejected</option></select></label></div>
    <div class="alert alert-info small mt-2">${UI.icon('info')}<div>${esc(d.note || 'Pending or rejected items do not confirm a balance change. This page cannot initiate deposits or withdrawals.')}</div></div>
    <div id="activity-results" class="mt-2">${table(d.activities)}</div></div>`;
  }, mount: el => {
    let rows = [];
    const paint = async () => { const box = el.querySelector('#activity-results'); box.setAttribute('aria-busy','true'); try { const params = new URLSearchParams(); const type = el.querySelector('#activity-type').value, status = el.querySelector('#activity-status').value; if (type) params.set('type',type); if (status) params.set('status',status); const d = await API.get('/api/account-activity' + (params.size ? '?' + params : '')); rows = d.activities; filter(); } catch (e) { box.innerHTML = `<div class="alert alert-warn">${esc(e.message)}</div>`; } finally { box.setAttribute('aria-busy','false'); } };
    const filter = () => { const q = el.querySelector('#activity-search').value.toLowerCase(); el.querySelector('#activity-results').innerHTML = table(rows.filter(a => `${a.reference} ${a.description || ''} ${a.accountRef || ''}`.toLowerCase().includes(q))); };
    el.querySelector('#activity-search').addEventListener('input', filter); el.querySelector('#activity-type').addEventListener('change', paint); el.querySelector('#activity-status').addEventListener('change', paint);
  } });
  function table(rows) {
    if (!rows.length) return UI.empty(UI.icon('wallet'), 'No matching account activity', 'Verified deposits, savings and withdrawals appear here after the administration connector reports them. Nothing is invented in this portal.');
    return UI.table(['Date', 'Activity', 'Reference', 'Amount', 'Status', 'Reported balance'], rows.map(a => [GFS.fmtDateTime(a.occurredAt || a.occurred_at), `<b>${esc(a.label || a.type)}</b>${a.description ? `<div class="tiny muted">${esc(a.description)}</div>` : ''}`, `<span class="mono tiny">${esc(a.reference)}</span>`, GFS.mk2(a.amount), UI.badge(a.status), a.balanceAfter == null ? '<span class="muted">Not reported</span>' : GFS.mk2(a.balanceAfter)]), { numCols:[3,5] });
  }
})();
