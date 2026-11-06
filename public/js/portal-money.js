/* Portal money modules: payment modal (mobile money/bank/cash), transactions,
   receipts, statements, loan requests (settlement/top-up/renewal/restructure). */
'use strict';
const Money = (() => {
  const esc = UI.esc;

  /* ---------------- payment modal ---------------- */
  async function paymentModal(loan, { settle = false } = {}) {
    const [md, fresh] = await Promise.all([API.get('/api/payment-methods'), API.get('/api/loans/' + loan.id)]);
    loan = fresh.loan;
    const q = settle ? (fresh.settlement || loan.settlement) : null;
    const methods = md.methods.filter(m => m.available !== false);
    const amount = settle ? q.total : (loan.nextDueAmount || loan.installment);
    const requestKey = (crypto.randomUUID ? crypto.randomUUID() : 'pay-' + Date.now() + '-' + Math.random().toString(36).slice(2));
    const m = UI.modal(`<h3>${settle ? 'Settle loan in full' : 'Make a payment'} — ${esc(loan.ref)}</h3>
      ${md.sandbox ? `<div class="sandbox-note">${UI.icon('flask')} Sandbox payment. No real money will move; you can simulate success or failure.</div>` : ''}
      <div class="stat-row payment-modal-stats"><div class="kpi"><div class="k-label">Outstanding</div><div class="k-value">${GFS.mk(loan.totalOutstanding ?? loan.outstanding ?? 0)}</div></div><div class="kpi emerald"><div class="k-label">${settle ? 'Settlement today' : 'Next instalment'}</div><div class="k-value">${GFS.mk2(amount)}</div></div><div class="kpi blue"><div class="k-label">${settle ? 'Future interest waived' : 'Loan status'}</div><div class="k-value">${settle ? GFS.mk(q.futureInterestWaived) : esc(loan.status)}</div></div></div>
      ${settle ? `<div class="alert alert-info small mt-2">Quote valid today only (${esc(q.asOf || GFS.iso(new Date()))}). Interest accrues daily; future unaccrued interest is waived. No early-settlement penalty.</div>` : ''}
      <form id="pay-form" class="mt-2">${!settle ? UI.field('Amount (MWK)', UI.input('amount', `type="number" min="1" step="0.01" value="${amount}" required`), 'Partial and advance payments are accepted. Amounts above the payoff require early settlement.') : `<input type="hidden" name="amount" value="${amount}">`}
        ${UI.field('Payment method', `<div class="payment-options">${methods.map((mm, i) => `<label class="payment-option"><input type="radio" name="method" value="${mm.id}" ${i === 0 ? 'checked' : ''} ${mm.available === false ? 'disabled' : ''}><span class="po-icon">${UI.icon(mm.type === 'mobile' ? 'phone' : mm.type === 'bank' ? 'home' : 'wallet')}</span><span><b>${esc(mm.name)}</b><small>${mm.mode === 'sandbox' ? 'Sandbox simulation' : mm.mode === 'gateway' ? 'Provider gateway' : mm.type === 'bank' ? 'Transfer + reconciliation' : 'Branch cashier record'}</small></span></label>`).join('')}</div>`)}
        ${UI.field('Mobile number / account', UI.input('account', `value="${esc(App.user.phone || '')}" placeholder="0999 123 456"`))}
        <div class="m-actions"><button type="button" class="btn btn-ghost" data-close>Cancel</button><button type="submit" class="btn btn-gold">${settle ? 'Create settlement payment' : 'Continue to payment'} ${UI.icon('arrow')}</button></div></form>`, { wide: true });
    UI.bindForm(m.el.querySelector('#pay-form'), async data => {
      const r = await API.post('/api/payments/initiate', { loanId: loan.id, amount: Number(data.amount), method: data.method, account: data.account, settle, quoteDate: q?.asOf, idempotencyKey: requestKey });
      const t = r.payment, mm = methods.find(x => x.id === data.method);
      m.el.innerHTML = `<h3>${r.sandbox ? 'Sandbox payment ready' : 'Payment reference created'}</h3><div class="alert ${r.sandbox ? 'alert-warn' : 'alert-info'}">${esc(r.instructions || 'Keep this reference. Your balance changes only after verification.')}</div>
        ${UI.table(['Item', 'Detail'], [['Reference', `<span class="mono">${esc(t.ref)}</span>`], ['Amount', `<b>${GFS.mk2(t.amount)}</b>`], ['Method', esc(mm?.name || t.method)], ['Status', UI.badge(t.status)]])}
        ${!r.sandbox && ['bank', 'cash'].includes(t.method) ? `<form id="proof-form" class="mt-2">${UI.field('Bank transfer / cashier receipt reference', UI.input('providerReference', 'required maxlength="150" placeholder="Reference from your bank or cashier'))}<button class="btn btn-ghost btn-sm" type="submit">Submit for reconciliation</button><p class="hint">Submitting a claim does not verify payment or change your balance.</p></form>` : ''}
        <div class="m-actions"><button class="btn btn-ghost" data-close>Close</button>${r.sandbox ? `<button class="btn btn-danger" id="sim-fail">Simulate failure</button><button class="btn btn-emerald" id="sim-ok">Simulate successful payment</button>` : `<button class="btn btn-emerald" id="check-status">Check status</button>`}</div>`;
      const proof = m.el.querySelector('#proof-form'); if (proof) UI.bindForm(proof, async d => { const pr = await API.post(`/api/payments/${t.id}/proof`, d); UI.toast(pr.message); });
      const finish = async outcome => {
        const c = await API.post(`/api/payments/${t.id}/confirm`, { outcome, simulate: true });
        if (c.failed) { m.el.innerHTML = `<div class="center"><span class="result-icon error">${UI.icon('alert')}</span><h3>Payment not completed</h3><p class="muted">${esc(c.payment.failureReason || 'Sandbox payment cancelled. No money moved.')}</p><div class="m-actions" style="justify-content:center"><button class="btn btn-ghost" data-close>Close</button><button class="btn btn-gold" id="retry">Try again</button></div></div>`; m.el.querySelector('#retry').onclick = () => { m.close(); paymentModal(loan, { settle }); }; return; }
        m.el.innerHTML = `<div class="center"><span class="result-icon success">${UI.icon('check')}</span><h2>${c.sandbox ? 'Sandbox payment verified' : 'Payment verified'}</h2><p class="muted">${c.sandbox ? 'No real money moved. ' : ''}${GFS.mk2(c.payment.amount)} recorded via ${esc(mm?.name || t.method)}.</p><div class="card left">${UI.table(['Item', 'Detail'], [['Receipt', `<b class="mono">${esc(c.receipt.ref)}</b>`], ['Principal paid', GFS.mk2(c.allocation.principal)], ['Interest paid', GFS.mk2(c.allocation.interest)], ['New outstanding', `<b>${GFS.mk2(c.loan.totalOutstanding ?? c.loan.outstanding ?? 0)}</b>`], ['Loan status', UI.badge(c.loan.status)]])}</div><div class="m-actions" style="justify-content:center"><button class="btn btn-ghost" id="rcpt">${UI.icon('download')} Receipt</button><button class="btn btn-gold" data-close>Done</button></div></div>`;
        m.el.querySelector('#rcpt').onclick = () => API.download(`/api/receipts/${c.receipt.id}/pdf`, `${c.receipt.ref}.pdf`).catch(e => UI.toast(e.message, 'err'));
        UI.toast('Balance updated and receipt issued.'); await App.refreshUser(); setTimeout(() => App.render(), 500);
      };
      m.el.querySelector('#sim-ok')?.addEventListener('click', () => finish('success')); m.el.querySelector('#sim-fail')?.addEventListener('click', () => finish('failure'));
      m.el.querySelector('#check-status')?.addEventListener('click', async () => { const d = await API.get('/api/transactions'); const t2 = d.transactions.find(x => x.id === t.id); UI.toast('Status: ' + (t2?.status || 'unknown')); });
    });
  }

  /* ---------------- transactions ---------------- */
  App.route('/portal/transactions', {
    title: 'Transactions', layout: 'portal', auth: true, render: async () => {
      const d = await API.get('/api/transactions');
      const q = App.query();
      const ts = q.loanId ? d.transactions.filter(t => String(t.loanId) === q.loanId) : d.transactions;
      const verified = ts.filter(t => t.status === 'verified');
      const paid = verified.filter(t => ['repayment', 'settlement'].includes(t.type)).reduce((s, t) => s + t.amount, 0);
      const received = verified.filter(t => t.type === 'disbursement').reduce((s, t) => s + t.amount, 0);
      return `<div class="page-head"><div><h1>Transaction History</h1><div class="sub">Every disbursement, payment, fee and penalty — with unique references</div></div>
        <div class="flex"><button class="btn btn-ghost" id="tx-pdf">📑 Download statement PDF</button></div></div>
        <div class="kpis" style="grid-template-columns:repeat(3,1fr)">
          <div class="kpi emerald"><div class="k-label">Total received (disbursements)</div><div class="k-value">${GFS.mk(received)}</div></div>
          <div class="kpi"><div class="k-label">Total repaid</div><div class="k-value">${GFS.mk(paid)}</div></div>
          <div class="kpi blue"><div class="k-label">Records</div><div class="k-value">${ts.length}</div></div>
        </div>
        <div class="card mt-2">
          <div class="flex wrap mb-2">
            <select id="tx-type" style="max-width:180px"><option value="">All types</option><option value="repayment">Repayments</option><option value="settlement">Settlements</option><option value="disbursement">Disbursements</option><option value="fee">Fees</option><option value="penalty">Penalties</option></select>
            <select id="tx-status" style="max-width:180px"><option value="">All statuses</option><option value="verified">Verified</option><option value="pending">Pending</option><option value="failed">Failed</option></select>
            <input id="tx-search" placeholder="Search reference…" style="max-width:220px">
          </div>
          <div id="tx-table">${txTable(ts)}</div>
        </div>`;
    },
    mount: async el => {
      const d = await API.get('/api/transactions');
      const render = () => {
        const ty = el.querySelector('#tx-type').value, st = el.querySelector('#tx-status').value, s = el.querySelector('#tx-search').value.toLowerCase();
        let ts = d.transactions;
        if (ty) ts = ts.filter(t => t.type === ty);
        if (st) ts = ts.filter(t => t.status === st);
        if (s) ts = ts.filter(t => (t.ref + ' ' + (t.providerRef || '') + ' ' + (t.loanRef || '')).toLowerCase().includes(s));
        el.querySelector('#tx-table').innerHTML = txTable(ts) || UI.empty('🔍', 'No matching transactions');
      };
      ['#tx-type', '#tx-status'].forEach(s => el.querySelector(s).addEventListener('change', render));
      el.querySelector('#tx-search').addEventListener('input', render);
      el.querySelector('#tx-pdf').onclick = () => API.download('/api/transactions/statement.pdf', 'transaction-statement.pdf').catch(e => UI.toast(e.message, 'err'));
    }
  });
  function txTable(ts) {
    if (!ts.length) return '';
    return UI.table(['Date', 'Reference', 'Loan', 'Type', 'Method', 'Amount', 'Status', 'Receipt'], ts.map(t => [
      GFS.fmtDateTime(t.createdAt), `<span class="mono tiny">${esc(t.ref)}</span>`, t.loanRef ? `<a href="#/portal/loans/${t.loanId}" class="mono tiny">${esc(t.loanRef)}</a>` : '—',
      esc(t.type), esc(t.provider || t.method || '—'), `<b>${GFS.mk(t.amount)}</b>`, UI.badge(t.status),
      t.receiptId ? `<button class="btn btn-ghost btn-sm" data-rcpt="${t.receiptId}">🧾</button>` : '—'
    ]), { numCols: [5] });
  }
  document.addEventListener('click', e => { const b = e.target.closest('[data-rcpt]'); if (b) API.download(`/api/receipts/${b.dataset.rcpt}/pdf`, 'receipt.pdf').catch(err => UI.toast(err.message, 'err')); });

  /* ---------------- receipts ---------------- */
  App.route('/portal/receipts', {
    title: 'Receipts', layout: 'portal', auth: true, render: async () => {
      const d = await API.get('/api/receipts');
      const total = d.receipts.reduce((s, r) => s + r.amount, 0);
      return `<div class="page-head"><div><h1>Payment Receipts</h1><div class="sub">Every verified payment has a unique, downloadable receipt</div></div></div>
        <div class="kpis" style="grid-template-columns:1fr 1fr"><div class="kpi emerald"><div class="k-label">Receipts issued</div><div class="k-value">${d.receipts.length}</div></div><div class="kpi"><div class="k-label">Total receipted</div><div class="k-value">${GFS.mk(total)}</div></div></div>
        <div class="card mt-2">${d.receipts.length ? UI.table(['Receipt no.', 'Date', 'Loan', 'Method', 'Amount', ''], d.receipts.map(r => [`<span class="mono small">${esc(r.ref)}</span>`, GFS.fmtDateTime(r.createdAt), r.loanRef ? `<span class="mono tiny">${esc(r.loanRef)}</span>` : '—', esc((GFS.PAYMENT_METHODS.find(m => m.id === r.method) || {}).name || r.method || '—'), `<b>${GFS.mk(r.amount)}</b>`, `<button class="btn btn-ghost btn-sm" data-rcpt="${r.id}">🧾 PDF</button>`]), { numCols: [4] }) : UI.empty('🧾', 'No receipts yet', 'Receipts appear here after your first verified payment.')}</div>`;
    }
  });

  /* ---------------- statements ---------------- */
  App.route('/portal/statements', {
    title: 'Statements', layout: 'portal', auth: true, render: async () => {
      const d = await API.get('/api/statements');
      return `<div class="page-head"><div><h1>Financial Statements & Records</h1><div class="sub">Download PDF statements, receipts and agreements — generated from your central record</div></div>
        <button class="btn btn-gold" id="all-tx-pdf">📑 Full transaction statement</button></div>
        <div class="grid grid-3 mb-2">${[['📑', 'Loan statements', 'Full terms, schedule and transactions per loan'], ['🧾', 'Payment receipts', 'Unique receipt for every verified payment'], ['🎯', 'Settlement statements', 'Early-settlement quote with future interest waived'], ['wallet', 'Disbursement confirmations', 'Recorded net disbursement; sandbox records are labelled'], ['✍️', 'Signed agreements', 'Your electronically signed loan agreement'], ['📊', 'Transaction statements', 'Complete money-in / money-out history']].map(([i, t, b]) => `<div class="card"><div style="font-size:24px">${i}</div><h3 style="font-size:15px">${t}</h3><p class="tiny muted mb-0">${b}</p></div>`).join('')}</div>
        <div class="card"><h3>💰 Per-loan documents</h3>
          ${d.loans.length ? UI.table(['Loan', 'Product', 'Status', 'Outstanding', 'Documents'], d.loans.map(l => [`<span class="mono small">${esc(l.ref)}</span>`, esc((GFS.productById(l.productId, true) || {}).name || l.productId), UI.badge(l.status), GFS.mk(l.outstanding),
            `<div class="flex wrap"><button class="btn btn-ghost btn-sm" data-stmt="${l.id}">📑 Statement</button><button class="btn btn-ghost btn-sm" data-settle-pdf="${l.id}">🎯 Settlement</button><button class="btn btn-ghost btn-sm" data-disb="${l.id}">💰 Disbursement</button></div>`]), { numCols: [3] }) : UI.empty('📑', 'No loans yet')}
        </div>
        <div class="card"><h3>🧾 Recent receipts</h3>${d.receipts.length ? UI.table(['Receipt', 'Date', 'Amount', ''], d.receipts.slice(0, 10).map(r => [`<span class="mono small">${esc(r.ref)}</span>`, GFS.fmtDate(r.createdAt), GFS.mk(r.amount), `<button class="btn btn-ghost btn-sm" data-rcpt="${r.id}">PDF</button>`]), { numCols: [2] }) : '<p class="muted small">No receipts yet.</p>'}</div>
        <div class="alert alert-info mt-2">🖨️ You can also print any statement from your browser (Ctrl/Cmd+P). All documents carry your customer number and unique references.</div>`;
    },
    mount: async el => {
      el.querySelector('#all-tx-pdf').onclick = () => API.download('/api/transactions/statement.pdf', 'transaction-statement.pdf').catch(e => UI.toast(e.message, 'err'));
      el.querySelectorAll('[data-stmt]').forEach(b => b.onclick = () => API.download(`/api/loans/${b.dataset.stmt}/statement.pdf`, 'loan-statement.pdf').catch(e => UI.toast(e.message, 'err')));
      el.querySelectorAll('[data-settle-pdf]').forEach(b => b.onclick = () => API.download(`/api/loans/${b.dataset.settlePdf}/settlement.pdf`, 'settlement.pdf').catch(e => UI.toast(e.message, 'err')));
      el.querySelectorAll('[data-disb]').forEach(b => b.onclick = () => API.download(`/api/loans/${b.dataset.disb}/disbursement.pdf`, 'disbursement.pdf').catch(e => UI.toast(e.message, 'err')));
    }
  });

  /* ---------------- loan requests ---------------- */
  App.route('/portal/requests', {
    title: 'Loan Requests', layout: 'portal', auth: true, render: async () => {
      const [rd, ld] = await Promise.all([API.get('/api/requests'), API.get('/api/loans')]);
      const active = ld.loans.filter(l => l.status === 'active');
      return `<div class="page-head"><div><h1>Loan Requests</h1><div class="sub">Settlement, top-up, renewal, restructuring and refinancing</div></div></div>
        <div class="grid grid-2" style="align-items:start">
          <div class="card card-accent"><h3>📨 New request</h3>
            <form id="req-form">
              ${UI.field('Request type', UI.select('type', [['settlement', '🎯 Settlement statement'], ['topup', '⬆️ Loan top-up'], ['renewal', '🔄 Loan renewal'], ['restructure', '🔁 Restructure (extend term)'], ['refinance', '💱 Refinance']], 'settlement'))}
              ${UI.field('Loan', UI.select('loanId', active.map(l => [l.id, `${l.ref} · ${l.productName} · outstanding ${GFS.mk(l.outstanding)}`]), active[0] ? active[0].id : ''))}
              <div id="topup-amt" style="display:none">${UI.field('Top-up amount (MWK)', UI.input('amount', 'type="number" min="0"'))}</div>
              <div id="req-info" class="alert alert-info small"></div>
              <button class="btn btn-gold btn-block" type="submit">Submit Request</button>
            </form>
          </div>
          <div class="card"><h3>🕘 Request history</h3>
            ${rd.requests.length ? rd.requests.map(r => `<div style="border:1.5px solid var(--line);border-radius:10px;padding:13px;margin-bottom:10px"><div class="flex-between"><b class="small">${esc(r.type[0].toUpperCase() + r.type.slice(1))} · <span class="mono tiny">${esc(r.ref)}</span></b>${UI.badge(r.status)}</div>${r.loanRef ? `<div class="tiny muted mono">${esc(r.loanRef)}</div>` : ''}<p class="small muted mt-1 mb-0">${esc(r.response || '')}</p><div class="tiny muted mt-1">${GFS.fmtDateTime(r.createdAt)}</div></div>`).join('') : UI.empty('📨', 'No requests yet')}
          </div>
        </div>`;
    },
    mount: async el => {
      const f = el.querySelector('#req-form');
      const info = { settlement: 'Get a settlement quote — pay principal + accrued interest only; future interest is waived.', topup: 'Borrow extra against an active loan in good standing (up to 50% of original principal, within product limits).', renewal: 'Fast-track a new loan at the same terms once the current one is settled.', restructure: 'Extend the term to reduce your instalment. A credit officer must review and confirm any new terms.', refinance: 'Replace the loan with new terms. Subject to assessment.' };
      const sync = () => { el.querySelector('#req-info').textContent = info[f.elements.type.value] || ''; el.querySelector('#topup-amt').style.display = f.elements.type.value === 'topup' ? '' : 'none'; };
      f.elements.type.addEventListener('change', sync); sync();
      UI.bindForm(f, async data => {
        const r = await API.post('/api/requests', { type: data.type, loanId: data.loanId, amount: data.amount ? Number(data.amount) : undefined });
        UI.toast(r.request.response || 'Request submitted.'); App.render();
      });
    }
  });

  return { paymentModal };
})();
