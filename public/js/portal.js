/* Customer portal: dashboard, loans, applications, apply, agreement signing. */
'use strict';
(() => {
  const esc = UI.esc;
  const P = () => (App.config && App.config.products) || GFS.PRODUCTS;
  const portalHead = (title, sub, actions = '') => `<div class="page-head"><div><h1>${title}</h1>${sub ? `<div class="sub">${sub}</div>` : ''}</div><div class="flex wrap">${actions}</div></div>`;

  /* ---------------- DASHBOARD ---------------- */
  App.route('/portal', {
    title: 'Dashboard', layout: 'portal', auth: true, render: async () => {
      const d = await API.get('/api/dashboard');
      const t = d.totals, c = d.checklist, u = App.user;
      const hour = new Date().getHours(), greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
      const active = d.loans.filter(l => l.status === 'active');
      const checklist = [['Phone verified', c.phone, '/portal/profile'], ['Email verified', c.email, '/portal/profile'], ['Identity document', c.identityDocument, '/portal/documents'], ['Income evidence', c.incomeDocument, '/portal/documents'], ['Identity review', c.identityVerified, '/portal/documents'], ['Two-factor sign-in', c.twoFactor, '/portal/security']];
      const done = checklist.filter(x => x[1]).length;
      return `<div class="dashboard-welcome"><div><span class="eyebrow">${GFS.fmtDate(new Date())}</span><h1>${greet}, ${esc(u?.firstName || d.user?.firstName || '')}</h1><p>Here’s your financial overview${d.environment === 'sandbox' ? ' · sandbox records' : ''}.</p></div><a href="#/portal/apply" class="btn btn-gold">${UI.icon('plus')} New application</a></div>
      ${d.environment === 'sandbox' ? `<div class="sandbox-banner inline">${UI.icon('flask')}<div><b>Sandbox environment.</b> Approvals, disbursements and payments are simulated. No real money moves.</div></div>` : ''}
      <div class="dashboard-kpis">${[['Total borrowed', GFS.mk(t.borrowed), 'All disbursed principal', 'wallet', ''], ['Outstanding', GFS.mk(t.outstanding), 'Principal + accrued charges', 'chart', 'gold'], ['Total repaid', GFS.mk(t.repaid), 'Verified payments only', 'check', 'green'], ['Active loans', t.activeLoans, `${t.pendingApplications} application(s) in progress`, 'file', 'blue']].map(([label, value, sub, icon, tone]) => `<article class="dash-kpi ${tone}"><span class="dash-kpi-icon">${UI.icon(icon)}</span><div><small>${label}</small><strong>${value}</strong><span>${sub}</span></div></article>`).join('')}</div>
      <div class="dashboard-main-grid"><div class="dashboard-primary">
        ${d.nextPayment ? `<article class="next-payment-card"><div><span class="eyebrow light">Next repayment</span><h2>${GFS.mk2(d.nextPayment.amount)}</h2><p>${esc(d.nextPayment.loanRef)} · due ${GFS.fmtDate(d.nextPayment.dueDate)} ${d.nextPayment.overdue ? '<b class="overdue-label">Overdue</b>' : ''}</p></div><button class="btn btn-gold" id="pay-next">Make a payment ${UI.icon('arrow')}</button></article>` : `<article class="next-payment-card empty-next"><div><span class="eyebrow light">No payment due</span><h2>You’re all caught up</h2><p>When a loan is active, its next instalment appears here.</p></div><a href="#/portal/loans" class="btn btn-hero-ghost">View loans</a></article>`}
        <article class="card"><div class="card-title-row"><div><h3>Active loans</h3><p>Balances and principal progress</p></div><a href="#/portal/loans" class="text-link">View all ${UI.icon('arrow')}</a></div>
          ${active.length ? active.map(l => `<div class="loan-summary-row"><span class="loan-summary-icon">${UI.productIcon(l.productId)}</span><div class="loan-summary-info"><div class="flex-between"><b>${esc(l.productName)}</b>${UI.badge(l.status)}</div><span class="mono tiny muted">${esc(l.ref)}</span><div class="loan-progress-line">${UI.progressBar(l.progress || 0)}<span>${l.progress || 0}% principal repaid</span></div><div class="loan-summary-numbers"><span>Outstanding <b>${GFS.mk(l.totalOutstanding ?? l.outstanding ?? 0)}</b></span><span>Next <b>${l.nextDueDate ? GFS.fmtDate(l.nextDueDate) : '—'}</b></span></div></div><div class="loan-summary-actions"><a href="#/portal/loans/${l.id}" class="btn btn-ghost btn-sm">Manage</a><button class="btn btn-emerald btn-sm" data-pay="${l.id}">Pay</button></div></div>`).join('') : UI.empty(UI.icon('wallet'), 'No active loans', 'Apply for financing when you’re ready.', '<a class="btn btn-gold btn-sm" href="#/portal/apply">Apply now</a>')}
        </article>
        <article class="card"><div class="card-title-row"><div><h3>Recent applications</h3><p>Decisions, conditions and next steps</p></div><a href="#/portal/applications" class="text-link">View all ${UI.icon('arrow')}</a></div>${d.applications.length ? UI.table(['Reference', 'Product', 'Amount', 'Status', ''], d.applications.slice(0, 5).map(a => [`<a href="#/portal/applications/${a.id}" class="mono small">${esc(a.ref)}</a>`, esc(a.productName), GFS.mk(a.amount), UI.badge(a.status), `<a href="#/portal/applications/${a.id}" class="btn btn-ghost btn-sm">Open</a>`])) : UI.empty(UI.icon('file'), 'No applications yet', 'Start a guided application.', '<a class="btn btn-gold btn-sm" href="#/portal/apply">Apply</a>')}</article>
      </div><aside class="dashboard-secondary">
        <article class="card"><h3>Quick actions</h3><div class="quick-actions">${[['/portal/apply', 'plus', 'Apply'], ['/portal/payments', 'card', 'Pay'], ['/portal/statements', 'download', 'Statements'], ['/portal/documents', 'upload', 'Documents'], ['/portal/chat', 'chat', 'Assistant'], ['/portal/requests', 'inbox', 'Requests']].map(([h, i, l]) => `<a href="#${h}">${UI.icon(i)}<span>${l}</span></a>`).join('')}</div></article>
        <article class="card setup-card"><div class="card-title-row"><h3>Account readiness</h3><span class="setup-score">${done}/${checklist.length}</span></div>${UI.progressBar(Math.round(done / checklist.length * 100))}<ul class="setup-list">${checklist.map(([label, ok, h]) => `<li class="${ok ? 'done' : ''}">${UI.icon(ok ? 'check' : 'clock')}<a href="#${h}">${label}</a></li>`).join('')}</ul></article>
        <article class="card"><div class="card-title-row"><h3>Recent activity</h3><a href="#/portal/transactions" class="text-link">All</a></div>${(d.transactions || []).length ? d.transactions.slice(0, 5).map(t => `<div class="activity-row"><span class="activity-icon">${UI.icon(t.type === 'disbursement' ? 'wallet' : 'card')}</span><div><b>${esc(t.type.replaceAll('_', ' '))}</b><span>${esc(t.ref)}</span></div><div class="right"><b>${GFS.mk(t.amount)}</b><span>${GFS.fmtDate(t.createdAt)}</span></div></div>`).join('') : '<p class="muted small">No transactions yet.</p>'}</article>
        <article class="card help-card"><span class="service-icon">${UI.icon('headset')}</span><h3>Need a hand?</h3><p>Ask the automated assistant or open a tracked support ticket.</p><a href="#/portal/support" class="btn btn-ghost btn-sm">Get support</a></article>
      </aside></div>`;
    },
    mount: async el => {
      const d = await API.get('/api/dashboard');
      el.querySelector('#pay-next')?.addEventListener('click', () => { const l = d.loans.find(x => x.id === d.nextPayment?.loanId); if (l) Money.paymentModal(l); });
      el.querySelectorAll('[data-pay]').forEach(b => b.addEventListener('click', async () => { const ld = await API.get('/api/loans/' + b.dataset.pay); Money.paymentModal(ld.loan); }));
    }
  });

  /* ---------------- MY LOANS ---------------- */
  App.route('/portal/loans', {
    title: 'My Loans', layout: 'portal', auth: true, render: async () => {
      const d = await API.get('/api/loans');
      return portalHead('My Loans', 'Every loan, its balance, schedule and history', '<a href="#/portal/apply" class="btn btn-gold">+ Request another loan</a>') +
        (d.loans.length ? `<div class="grid grid-2">${d.loans.map(l => `
          <div class="card loan-card" style="border-left-color:${l.status === 'active' ? 'var(--emerald)' : 'var(--muted-2)'}">
            <div class="flex-between"><div><h3 class="mb-0">${UI.productIcon(l.productId)} ${esc(l.productName)}</h3><div class="mono tiny muted">${esc(l.ref)}</div></div>${UI.badge(l.status)}</div>
            <div class="stat-row mt-2" style="grid-template-columns:1fr 1fr 1fr">
              <div><div class="tiny muted">Principal</div><b>${GFS.mk(l.principal)}</b></div>
              <div><div class="tiny muted">Outstanding</div><b style="color:var(--red)">${GFS.mk(l.outstanding ?? l.totalOutstanding ?? 0)}</b></div>
              <div><div class="tiny muted">Repaid</div><b style="color:var(--emerald-700)">${GFS.mk(l.totalRepaid)}</b></div>
            </div>
            <div class="mt-2">${UI.progressBar(l.progress)}<div class="tiny muted mt-1">${l.installmentsPaid ?? l.schedule?.filter(r => r.status === 'paid').length ?? 0}/${l.installmentsTotal ?? l.schedule?.length ?? 0} paid · ${l.freq} · ${(l.rateMonthly ?? l.rate ?? 0)}%/mo</div></div>
            ${l.status === 'active' ? `<div class="flex-between mt-2 small"><span class="muted">Next: <b>${GFS.mk(l.nextDueAmount || 0)}</b> due ${l.nextDueDate ? GFS.fmtDate(l.nextDueDate) : '—'}</span></div>` : `<div class="tiny muted mt-2">Closed ${l.closedAt ? GFS.fmtDate(l.closedAt) : ''}</div>`}
            <div class="flex mt-2"><a href="#/portal/loans/${l.id}" class="btn btn-ghost btn-sm">Details & schedule</a>${l.status === 'active' ? `<button class="btn btn-emerald btn-sm" data-pay="${l.id}">Pay</button>` : ''}</div>
          </div>`).join('')}</div>` : UI.empty('💰', 'No loans yet', 'Your loans will appear here once disbursed.', '<a class="btn btn-gold" href="#/portal/apply">Apply for a loan</a>'));
    },
    mount: async el => { el.querySelectorAll('[data-pay]').forEach(b => b.onclick = async () => { const d = await API.get('/api/loans/' + b.dataset.pay); Money.paymentModal(d.loan); }); }
  });

  /* ---------------- LOAN DETAIL ---------------- */
  App.route('/portal/loans/:id', {
    title: 'Loan Details', layout: 'portal', auth: true, render: async ({ id }) => {
      const d = await API.get('/api/loans/' + id);
      const l = d.loan;
      const overdue = l.nextDueDate && l.nextDueDate < GFS.iso(new Date()) && l.status === 'active';
      return portalHead(`${UI.productIcon(l.productId)} ${esc(l.productName)}`, `<span class="mono">${esc(l.ref)}</span> · disbursed ${GFS.fmtDate(l.disbursedAt)}`,
        `<a href="#/portal/loans" class="btn btn-ghost btn-sm">← All loans</a>`) + `
      ${overdue ? `<div class="alert alert-error">⚠ A payment is overdue. Late penalties of 2% per month apply after the 3-day grace period. Please pay or contact support.</div>` : ''}
      ${l.penalties > 0 ? `<div class="alert alert-warn">Late penalties outstanding: <b>${GFS.mk(l.penalties)}</b></div>` : ''}
      <div class="kpis">
        <div class="kpi"><div class="k-label">Outstanding Balance</div><div class="k-value">${GFS.mk(l.outstanding ?? l.totalOutstanding ?? 0)}</div><div class="k-sub">Principal ${GFS.mk(l.outstandingPrincipal)}</div></div>
        <div class="kpi emerald"><div class="k-label">Next Instalment</div><div class="k-value">${l.nextDueAmount ? GFS.mk(l.nextDueAmount) : '—'}</div><div class="k-sub">${l.nextDueDate ? 'due ' + GFS.fmtDate(l.nextDueDate) : 'No pending instalments'}</div></div>
        <div class="kpi blue"><div class="k-label">Total Repaid</div><div class="k-value">${GFS.mk(l.totalRepaid)}</div><div class="k-sub">Interest paid ${GFS.mk(l.totalInterestPaid)}</div></div>
        <div class="kpi"><div class="k-label">Progress</div><div class="k-value">${l.progress}%</div><div class="k-sub">${l.installmentsPaid}/${l.installmentsTotal} instalments</div></div>
      </div>
      ${l.status === 'active' ? `<div class="card card-accent mt-2"><div class="flex-between wrap"><div><h3 class="mb-0">💳 Repay this loan</h3><div class="muted small">Mpamba · Airtel Money · Bank · Cash — balance updates instantly on verification</div></div>
        <div class="flex wrap"><button class="btn btn-gold" id="pay-btn">Make a payment</button><button class="btn btn-emerald" id="settle-btn">Settle in full (${GFS.mk(l.settlement.total)})</button></div></div>
        <div class="tiny muted mt-1">Early settlement waives ${GFS.mk(l.settlement.futureInterestWaived)} of future interest. <a href="#" id="settlement-pdf">Download settlement statement</a></div></div>` : `<div class="alert alert-success mt-2">🎉 This loan is fully settled. ${l.closedAt ? 'Closed ' + GFS.fmtDate(l.closedAt) + '.' : ''} Security released.</div>`}
      <div class="grid grid-2 mt-2" style="align-items:start">
        <div class="card"><h3>📋 Loan terms</h3>
          ${UI.table(['Item', 'Detail'], [['Principal', GFS.mk(l.principal)], ['Interest rate', (l.rateMonthly ?? l.rate ?? 0) + '% per month (declining)'], ['Arrangement fee', `${l.feePct}% (${GFS.mk(l.feeAmount)})`], ['Net disbursed', GFS.mk(l.netDisbursed)], ['Term', `${l.termMonths} months · ${l.freq}`], ['Instalment', GFS.mk(l.installment)], ['Disbursement ref', `<span class="mono tiny">${esc(l.disbursementRef || '—')}</span>`], ['Disbursement method', esc(l.disbursementMethod || '—')], ['Status', UI.badge(l.status)]], { numCols: [] })}
          <div class="flex wrap mt-2">
            <button class="btn btn-ghost btn-sm" id="stmt-pdf">📑 Loan statement PDF</button>
            <button class="btn btn-ghost btn-sm" id="disb-pdf">💰 Disbursement receipt</button>
            ${l.status === 'active' ? `<button class="btn btn-ghost btn-sm" id="topup-btn">⬆️ Request top-up</button><button class="btn btn-ghost btn-sm" id="restructure-btn">🔁 Restructure</button>` : `<button class="btn btn-ghost btn-sm" id="renew-btn">🔄 Request renewal</button>`}
          </div>
        </div>
        <div class="card"><h3>🕘 Loan transactions</h3>
          ${d.transactions.length ? UI.table(['Date', 'Type', 'Amount', 'Status'], d.transactions.slice(0, 10).map(t => [GFS.fmtDate(t.createdAt), esc(t.type), GFS.mk(t.amount), UI.badge(t.status)]), { numCols: [2] }) : '<p class="muted small">No transactions.</p>'}
          <a href="#/portal/transactions?loanId=${l.id}" class="small">Full history →</a>
        </div>
      </div>
      <div class="card mt-2"><div class="flex-between"><h3 class="mb-0">📅 Repayment schedule</h3><span class="tiny muted">Penalties → fees → interest → principal allocation</span></div>
        ${UI.table(['#', 'Due date', 'Opening', 'Instalment', 'Principal', 'Interest', 'Closing', 'Paid', 'Status'], l.schedule.map(r => {
          const od = r.status !== 'paid' && r.dueDate < GFS.iso(new Date());
          return [r.no, GFS.fmtDate(r.dueDate), GFS.mk(r.opening), GFS.mk(r.installment), GFS.mk(r.principal), GFS.mk(r.interest), GFS.mk(r.closing), GFS.mk(r.paid), od ? UI.badge('overdue') : UI.badge(r.status)];
        }), { numCols: [2, 3, 4, 5, 6, 7] })}
      </div>`;
    },
    mount: async (el, { id }) => {
      const d = await API.get('/api/loans/' + id); const l = d.loan;
      const pay = el.querySelector('#pay-btn'); if (pay) pay.onclick = () => Money.paymentModal(l);
      const settle = el.querySelector('#settle-btn'); if (settle) settle.onclick = () => Money.paymentModal(l, { settle: true });
      const dl = (sel, path, name) => { const b = el.querySelector(sel); if (b) b.onclick = async e => { e.preventDefault(); try { await API.download(path, name); UI.toast('Document downloaded.'); } catch (err) { UI.toast(err.message, 'err'); } }; };
      dl('#stmt-pdf', `/api/loans/${id}/statement.pdf`, `statement-${l.ref}.pdf`);
      dl('#disb-pdf', `/api/loans/${id}/disbursement.pdf`, `disbursement-${l.ref}.pdf`);
      dl('#settlement-pdf', `/api/loans/${id}/settlement.pdf`, `settlement-${l.ref}.pdf`);
      const req = (sel, type) => { const b = el.querySelector(sel); if (b) b.onclick = async () => { try { const r = await API.post('/api/requests', { type, loanId: id }); UI.toast(r.request.response || 'Request submitted.'); App.go('/portal/requests'); } catch (e) { UI.toast(e.message, 'err'); } }; };
      req('#topup-btn', 'topup'); req('#restructure-btn', 'restructure'); req('#renew-btn', 'renewal');
    }
  });

  /* ---------------- APPLICATIONS ---------------- */
  App.route('/portal/applications', {
    title: 'Applications', layout: 'portal', auth: true, render: async () => {
      const d = await API.get('/api/applications');
      return portalHead('Loan Applications', 'Track every application from intake to disbursement', '<a href="#/portal/apply" class="btn btn-gold">+ New application</a>') +
        (d.applications.length ? d.applications.map(a => `
          <div class="card">
            <div class="flex-between wrap"><div><h3 class="mb-0">${UI.productIcon(a.productId)} ${esc(a.productName)} — ${GFS.mk(a.amount)}</h3><div class="mono tiny muted">${esc(a.ref)} · ${a.termMonths} months · ${esc(a.freq)} · submitted ${GFS.fmtDate(a.createdAt)}</div></div>${UI.badge(a.status)}</div>
            ${UI.stageTrack(a.stage, a.status)}
            ${a.decisionReason ? `<div class="alert ${a.status === 'rejected' ? 'alert-error' : a.status === 'approved' ? 'alert-success' : 'alert-info'} small">${esc(a.decisionReason)}</div>` : ''}
            <div class="flex wrap"><a href="#/portal/applications/${a.id}" class="btn btn-ghost btn-sm">View details & timeline</a>
            ${a.status === 'approved' ? `<a href="#/portal/applications/${a.id}" class="btn btn-gold btn-sm">✍️ Review & sign agreement</a>` : ''}
            ${a.status === 'pending_documents' ? `<a href="#/portal/documents" class="btn btn-emerald btn-sm">Upload documents</a>` : ''}</div>
          </div>`).join('') : UI.empty('📋', 'No applications yet', 'Start your first application — it takes a few minutes.', '<a class="btn btn-gold" href="#/portal/apply">Apply now</a>'));
    }
  });

  /* ---------------- APPLICATION DETAIL + AGREEMENT ---------------- */
  App.route('/portal/applications/:id', {
    title: 'Application', layout: 'portal', auth: true, render: async ({ id }) => {
      const d = await API.get('/api/applications/' + id);
      const a = d.application;
      return portalHead(`${UI.productIcon(a.productId)} ${esc(a.productName)} Application`, `<span class="mono">${esc(a.ref)}</span>`, `<a href="#/portal/applications" class="btn btn-ghost btn-sm">← All applications</a>`) + `
      <div class="card">${UI.stageTrack(a.stage, a.status)}
        <div class="flex-between wrap"><div>${UI.badge(a.status)} <span class="muted small">Stage: ${esc(a.stage.replace(/_/g, ' '))}</span></div><div class="small muted">Submitted ${GFS.fmtDateTime(a.createdAt)}</div></div>
        ${a.decisionReason ? `<div class="alert ${a.status === 'rejected' ? 'alert-error' : a.status === 'approved' || a.status === 'disbursed' ? 'alert-success' : 'alert-warn'} mt-2">${esc(a.decisionReason)}</div>` : ''}
      </div>
      ${a.status === 'approved' && a.offer ? `
      <div class="card card-accent mt-2"><h3>🎉 Your loan offer</h3>
        <div class="kpis" style="grid-template-columns:repeat(4,1fr)">
          <div class="kpi emerald"><div class="k-label">Amount</div><div class="k-value">${GFS.mk(a.offer.amount)}</div></div>
          <div class="kpi"><div class="k-label">Instalment (${a.offer.freq})</div><div class="k-value">${GFS.mk(a.offer.installment)}</div></div>
          <div class="kpi"><div class="k-label">Total repayable</div><div class="k-value">${GFS.mk(a.offer.totalRepayable)}</div></div>
          <div class="kpi"><div class="k-label">You receive</div><div class="k-value">${GFS.mk(a.offer.netDisbursement)}</div><div class="k-sub">after ${GFS.mk(a.offer.fee)} fee</div></div>
        </div>
        <p class="small muted mt-2">${a.offer.rate}%/month declining balance · ${a.offer.termMonths} months · total interest ${GFS.mk(a.offer.totalInterest)} · offer valid until ${GFS.fmtDate(a.offer.validUntil)} · credit score ${a.offer.score}/100 (${a.offer.risk} risk)</p>
        <div class="flex wrap"><button class="btn btn-gold btn-lg" id="accept-btn">Review & sign agreement</button><button class="btn btn-ghost" id="agr-pdf">📄 Download agreement (draft)</button><button class="btn btn-danger btn-sm" id="cancel-btn">Cancel application</button></div>
      </div>` : ''}
      ${a.status === 'pending_documents' ? `<div class="card mt-2"><h3>📄 Documents needed</h3><p class="muted small">${esc(a.decisionReason || '')}</p><div class="flex"><a href="#/portal/documents" class="btn btn-emerald">Upload documents</a><button class="btn btn-ghost" id="reassess-btn">Re-run assessment</button></div></div>` : ''}
      ${a.status === 'rejected' ? `<div class="card mt-2"><h3>What you can do</h3><p class="muted small">Adjust the amount or term to fit affordability, clear existing obligations, or add collateral — then apply again.</p><div class="flex"><a href="#/portal/apply?product=${a.productId}" class="btn btn-gold">Adjust & re-apply</a><button class="btn btn-ghost" id="reassess-btn">Re-run assessment</button></div></div>` : ''}
      ${a.status === 'disbursed' ? `<div class="alert alert-success mt-2">${UI.icon('check')}<div>${a.environment === 'sandbox' ? 'Sandbox loan activated — no real funds sent.' : 'Disbursement recorded.'} ${a.agreementAcceptedAt ? 'Agreement signed ' + GFS.fmtDateTime(a.agreementAcceptedAt) + '.' : ''} <a href="#/portal/loans">View your loan →</a></div></div>` : ''}
      ${a.status === 'agreement_accepted' ? `<div class="alert alert-info mt-2">${UI.icon('clock')}<div>Agreement received. Awaiting authorised disbursement; no money has been sent yet.</div></div>` : ''}
      <div class="grid grid-2 mt-2" style="align-items:start">
        <div class="card"><h3>📋 Application details</h3>
          ${UI.table(['Item', 'Detail'], [['Amount requested', GFS.mk(a.amount)], ['Term', a.termMonths + ' months · ' + a.freq], ['Purpose', esc(a.purpose || '—')], ['Monthly income', GFS.mk(a.income)], ['Monthly expenses', GFS.mk(a.expenses)], ['Disbursement to', `${esc(a.disbursementMethod || '—')} · ${esc(a.disbursementAccount || '')}`], ['Credit score', a.assessment && a.assessment.score != null ? a.assessment.score + '/100 (' + (a.assessment.risk || '') + ')' : '—']])}
          ${a.guarantors.length ? `<h3 class="mt-2">🤝 Guarantors</h3>${UI.table(['Name', 'Phone', 'Consent', 'Status'], a.guarantors.map(g => [esc(g.name), esc(g.phone), g.consent ? '✓' : '✗', UI.badge(g.status)]))}` : ''}
          ${a.collateral.length ? `<h3 class="mt-2">🏠 Collateral</h3>${UI.table(['Type', 'Description', 'Value', 'Status'], a.collateral.map(c => [esc(c.type), esc(c.description || '—'), GFS.mk(c.estimated_value), UI.badge(c.status)]))}` : ''}
          <div class="flex mt-2"><button class="btn btn-ghost btn-sm" id="agr-pdf2">📄 Agreement PDF</button>${['pending_documents', 'rejected', 'submitted', 'under_review'].includes(a.status) ? `<button class="btn btn-danger btn-sm" id="cancel-btn2">Cancel</button>` : ''}</div>
        </div>
        <div class="card"><h3>🕘 Review timeline</h3><ul class="timeline">${a.timeline.map(t => `<li class="done"><div class="tl-title">${esc((t.stage || '').replace(/_/g, ' '))}</div><div class="tl-note">${esc(t.note || '')}</div><div class="tl-time">${GFS.fmtDateTime(t.at)}</div></li>`).join('')}</ul></div>
      </div>`;
    },
    mount: async (el, { id }) => {
      const d = await API.get('/api/applications/' + id); const a = d.application;
      const dlAgr = async () => { try { await API.download(`/api/applications/${id}/agreement.pdf`, `agreement-${a.ref}.pdf`); } catch (e) { UI.toast(e.message, 'err'); } };
      ['#agr-pdf', '#agr-pdf2'].forEach(s => { const b = el.querySelector(s); if (b) b.onclick = dlAgr; });
      const cancel = async () => { if (await UI.confirmDialog('Cancel application?', `Application ${a.ref} will be cancelled. This cannot be undone.`, { confirmText: 'Cancel application', danger: true })) { await API.post(`/api/applications/${id}/cancel`); UI.toast('Application cancelled.'); App.render(); } };
      ['#cancel-btn', '#cancel-btn2'].forEach(s => { const b = el.querySelector(s); if (b) b.onclick = cancel; });
      const re = el.querySelector('#reassess-btn'); if (re) re.onclick = async () => { try { const r = await API.post(`/api/applications/${id}/reassess`); UI.toast('Assessment re-run: ' + r.application.status.replace(/_/g, ' ')); App.render(); } catch (e) { UI.toast(e.message, 'err'); } };
      const acc = el.querySelector('#accept-btn'); if (acc) acc.onclick = () => agreementModal(a);

      function agreementModal(app) {
        const u = App.user, fullName = `${u.firstName} ${u.lastName}`;
        const m = UI.modal(`<h3>Loan agreement — ${esc(app.ref)}</h3>
          ${app.offer.environment === 'sandbox' ? `<div class="sandbox-note">${UI.icon('flask')} Sandbox agreement. Signing simulates acceptance; no real credit contract or funds transfer is created.</div>` : ''}
          <div class="alert alert-info small">Principal <b>${GFS.mk(app.offer.amount)}</b> · ${app.offer.rate}%/month · ${app.offer.termMonths} months · instalment <b>${GFS.mk(app.offer.installment)}</b> · total repayable <b>${GFS.mk(app.offer.totalRepayable)}</b>. Actual interest accrues daily on unpaid principal.</div>
          <div class="agreement-scroll">${GFS.AGREEMENT_CLAUSES.map(c => `<h4>${esc(c.t)}</h4><p>${esc(c.b)}</p>`).join('')}</div>
          <form id="sig-form" class="mt-2">${UI.field('Full name (as registered)', UI.input('name', `required value="${esc(fullName)}" readonly`))}
            ${UI.field('Draw your signature', '<canvas class="sig-pad" id="sig-canvas"></canvas><div class="flex mt-1"><button type="button" class="btn-link" id="sig-clear">Clear</button><span class="tiny muted">or type your full name below</span></div>')}
            ${UI.field('Typed signature (alternative)', UI.input('typedSig', `placeholder="${esc(fullName)}"`))}
            <label class="check"><input type="checkbox" name="accept" required><span>I have read and accept this offer and agreement.</span></label>
            <label class="check"><input type="checkbox" name="termsConsent" required><span>I consent to electronic signing and understand ${app.offer.environment === 'sandbox' ? 'this is a sandbox demonstration' : 'disbursement requires authorised provider confirmation'}.</span></label>
            <div class="m-actions"><button type="button" class="btn btn-ghost" data-close>Not yet</button><button type="submit" class="btn btn-gold">Sign agreement ${UI.icon('check')}</button></div></form>`, { wide: true });
        const pad = UI.signaturePad(m.el.querySelector('#sig-canvas')); m.el.querySelector('#sig-clear').onclick = () => pad.clear();
        UI.bindForm(m.el.querySelector('#sig-form'), async data => {
          const signature = !pad.isEmpty() ? pad.dataURL() : (data.typedSig || '');
          if (!signature) throw new Error('Draw or type your signature to continue.');
          const r = await API.post(`/api/applications/${app.id}/accept-agreement`, { accept: true, termsConsent: true, name: data.name, signature, offerVersion: app.offer.version });
          m.close();
          if (r.loan) UI.modal(`<div class="center"><span class="result-icon success">${UI.icon('check')}</span><h2>${r.sandbox ? 'Sandbox loan activated' : 'Loan disbursed'}</h2><p class="muted">${r.sandbox ? 'No real money was sent. ' : ''}${GFS.mk(r.loan.netDisbursed)} recorded for ${esc(r.loan.ref)}.</p><div class="m-actions" style="justify-content:center"><button class="btn btn-ghost" data-close>Close</button><a class="btn btn-gold" href="#/portal/loans/${r.loan.id}">View loan ${UI.icon('arrow')}</a></div></div>`);
          else UI.toast('Agreement received. Awaiting authorised disbursement.');
          App.render();
        });
      }
    }
  });

  /* ---------------- APPLY (guided multi-step) ---------------- */
  App.route('/portal/apply', {
    title: 'Apply for a Loan', layout: 'portal', auth: true, render: async () => {
      const u = App.user;
      const pre = App.query().product || 'PL'; const q0 = App.query();
      return portalHead('Apply for a Loan', 'A guided application — your profile details are pre-filled') + `
      <div class="grid grid-2" style="align-items:start">
        <div class="card card-accent">
          <form id="apply-form">
            <fieldset><legend>1 · Choose your loan</legend>
              ${UI.field('Loan product', UI.select('productId', P().map(p => [p.id, `${p.name} · ${p.rate}%/mo · ${GFS.mk(p.min)}–${GFS.mk(p.max)}`]), pre))}
              <div id="prod-info" class="alert alert-info small"></div>
              <div class="form-grid">
                ${UI.field('Amount (MWK)', UI.input('amount', 'type="number" required min="10000" step="5000"'))}
                ${UI.field('Term', UI.select('term', []))}
                ${UI.field('Repayment frequency', UI.select('freq', []))}
                ${UI.field('What is it for?', UI.input('purpose', 'required maxlength="300" placeholder="e.g. Restock my shop"'))}
              </div>
            </fieldset>
            <fieldset><legend>2 · Affordability</legend>
              <div class="form-grid">
                ${UI.field('Gross monthly income (MWK)', UI.input('income', `type="number" min="0" value="${u.monthlyIncome || ''}" required`))}
                ${UI.field('Monthly expenses (MWK)', UI.input('expenses', `type="number" min="0" value="${u.monthlyExpenses || ''}"`))}
              </div>
              <div id="apply-quote"></div>
            </fieldset>
            <fieldset><legend>3 · Disbursement account</legend>
              ${UI.field('Receive money via', UI.select('disbursementMethod', [['mpamba', 'TNM Mpamba'], ['airtel', 'Airtel Money'], ['bank', 'Bank transfer']], 'mpamba'))}
              ${UI.field('Account / mobile number', UI.input('disbursementAccount', `value="${esc(u.phone || '')}" placeholder="0999 123 456 or bank account"`))}
            </fieldset>
            <fieldset><legend>4 · Guarantor</legend>
              <p class="tiny muted">Most products need one guarantor who consents. Salary advance needs none; group loans need two.</p>
              <div class="form-grid">
                ${UI.field('Guarantor full name', UI.input('gName', 'maxlength="80" placeholder="Full name"'))}
                ${UI.field('Guarantor phone', UI.input('gPhone', 'placeholder="0999…"'))}
                ${UI.field('Relationship', UI.input('gRelationship', 'placeholder="e.g. Sister, colleague"'))}
                ${UI.field('Employer', UI.input('gEmployer', 'placeholder="Employer name"'))}
              </div>
              <label class="check"><input type="checkbox" name="gConsent"> My guarantor has agreed to guarantee this loan and to be contacted.</label>
            </fieldset>
            <fieldset id="collateral-fs" style="display:none"><legend>5 · Collateral (secured products)</legend>
              <div class="form-grid">
                ${UI.field('Collateral type', UI.select('cType', [['', 'None'], ['land', 'Land'], ['house', 'House'], ['vehicle', 'Vehicle'], ['household_property', 'Household property'], ['livestock', 'Livestock'], ['equipment', 'Equipment']], ''))}
                ${UI.field('Estimated value (MWK)', UI.input('cValue', 'type="number" min="0" value="0"'))}
              </div>
              ${UI.field('Description', UI.input('cDesc', 'placeholder="e.g. Toyota Hiace, reg BL 4821"'))}
            </fieldset>
            <fieldset><legend>6 · Documents & declaration</legend>
              <div class="alert alert-info small">📎 Make sure your ID and proof of income are uploaded in <a href="#/portal/documents" target="_blank">Documents & KYC</a>. Missing documents will pause the review, not reject it.</div>
              <label class="check"><input type="checkbox" name="acceptTerms" required> I confirm the information is true, I accept the <a href="#/terms" target="_blank">Terms</a> and the loan agreement terms, and I consent to credit checks.</label>
              <button class="btn btn-gold btn-block btn-lg" type="submit">Submit Application →</button>
            </fieldset>
          </form>
        </div>
        <div style="position:sticky;top:84px">
          <div class="card"><h3>📊 Live quote</h3><div id="side-quote">${UI.empty('🧮', 'Choose a product and amount', 'Your instalment and total cost appear here as you type.')}</div></div>
          <div class="card"><h3>💡 Tips for approval</h3><ul class="small muted" style="padding-left:18px;margin:0"><li>Keep the instalment under 40% of your net income.</li><li>Upload clear ID and income documents first.</li><li>Use a guarantor who consents and answers their phone.</li><li>Match the term to your cash flow — longer terms, smaller instalments.</li></ul></div>
        </div>
      </div>`;
    },
    mount: async el => {
      const form = el.querySelector('#apply-form');
      const prodSel = form.elements.productId;
      const syncProduct = () => {
        const p = P().find(x => x.id === prodSel.value);
        form.elements.term.innerHTML = p.terms.map(t => `<option value="${t}">${t} months</option>`).join('');
        form.elements.freq.innerHTML = p.freqs.map(f => `<option value="${f}">${f[0].toUpperCase() + f.slice(1)}</option>`).join('');
        form.elements.amount.min = p.min; form.elements.amount.max = p.max;
        if (!form.elements.amount.value || Number(form.elements.amount.value) < p.min || Number(form.elements.amount.value) > p.max) form.elements.amount.value = q0.amount && Number(q0.amount) >= p.min && Number(q0.amount) <= p.max ? Number(q0.amount) : Math.round((p.min + Math.min(p.max, p.min * 5)) / 2);
        el.querySelector('#prod-info').innerHTML = `${UI.productIcon(p.id)} <b>${esc(p.name)}</b>: ${GFS.mk(p.min)}–${GFS.mk(p.max)} · ${p.rate}%/month · ${p.fee}% fee · ${p.guarantors} guarantor(s) · ${p.collateral ? 'collateral may be required' : 'no collateral'}.`;
        el.querySelector('#collateral-fs').style.display = p.collateral ? '' : 'none';
      };
      async function quote() {
        const data = UI.formData(form);
        if (!data.amount) return;
        try {
          const d = await API.post('/api/calculator', { productId: data.productId, amount: Number(data.amount), term: Number(data.term), freq: data.freq });
          const s = d.schedule;
          const html = UI.table(['Quote', 'Amount'], [['Instalment (' + s.freq + ')', `<b>${GFS.mk(s.installment)}</b>`], ['Total interest', GFS.mk(s.totalInterest)], ['Arrangement fee', GFS.mk(s.fee)], ['You receive', GFS.mk(s.netDisbursement)], ['Total repayable', `<b>${GFS.mk(s.totalRepayable)}</b>`], ['First due', GFS.fmtDate(s.rows[0].dueDate)], ['Last due', GFS.fmtDate(s.endDate)]], { numCols: [1] });
          el.querySelector('#side-quote').innerHTML = html;
          el.querySelector('#apply-quote').innerHTML = `<div class="alert alert-success small">✓ Estimated instalment <b>${GFS.mk(s.installment)}</b> ${s.freq} · total repayable ${GFS.mk(s.totalRepayable)}.</div>`;
        } catch {}
      }
      prodSel.addEventListener('change', () => { syncProduct(); quote(); });
      form.addEventListener('input', () => { clearTimeout(form._t); form._t = setTimeout(quote, 350); });
      syncProduct(); quote();
      UI.bindForm(form, async data => {
        const guarantorIds = [], collateralIds = [];
        if (data.gName) { const g = await API.post('/api/guarantors', { name: data.gName, phone: data.gPhone, relationship: data.gRelationship, employer: data.gEmployer, consent: !!data.gConsent }); guarantorIds.push(g.guarantor.id); }
        if (data.cType) { const c = await API.post('/api/collateral', { type: data.cType, estimatedValue: Number(data.cValue || 0), description: data.cDesc }); collateralIds.push(c.collateral.id); }
        const body = { productId: data.productId, amount: Number(data.amount), term: Number(data.term), freq: data.freq, purpose: data.purpose,
          income: Number(data.income), expenses: Number(data.expenses || 0), consent: data.acceptTerms,
          disbursementMethod: data.disbursementMethod, disbursementAccount: data.disbursementAccount, guarantorIds, collateralIds };
        const r = await API.post('/api/applications', body);
        const a = r.application;
        UI.modal(`<div class="center"><div style="font-size:46px">${UI.icon(a.status === 'approved' ? 'check' : 'file')}</div>
          <h2>Application ${esc(r.reference)}</h2>
          <p>${UI.badge(a.status)}</p>
          <p class="muted small">${esc(a.decisionReason || 'Your application was received and is being reviewed.')}</p>
          <div class="m-actions" style="justify-content:center"><a class="btn btn-ghost" href="#/portal/applications">All applications</a><a class="btn btn-gold" href="#/portal/applications/${a.id}">${a.status === 'approved' ? 'Review offer →' : 'Track application →'}</a></div></div>`);
        App.refreshUser();
      }, { confirmText: 'Submit this loan application? It will enter document and credit review. Sandbox mode may simulate a decision.' });
    }
  });
})();
