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
      App.unread = d.stats.unreadNotifications;
      const s = d.stats, u = d.user;
      const hour = new Date().getHours();
      const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
      const kycDone = d.kyc.status === 'verified' && d.kyc.phoneVerified && d.kyc.emailVerified;
      return `
      ${portalHead(`${greet}, ${esc(u.firstName)} 👋`, `Customer ${esc(u.customerNo)} · ${GFS.fmtDate(new Date())}`, `<a href="#/portal/apply" class="btn btn-gold">+ New Loan Application</a>`)}
      ${!kycDone ? `<div class="alert alert-warn">🪪 <div><b>Complete your verification.</b> ${!d.kyc.phoneVerified ? 'Verify your phone. ' : ''}${!d.kyc.emailVerified ? 'Verify your email. ' : ''}${d.kyc.status !== 'verified' ? 'Upload your ID and proof of income. ' : ''}<a href="#/portal/documents">Finish KYC →</a></div></div>` : ''}
      ${API.mode === 'local' ? `<div class="alert alert-info small">ℹ Device-local demo mode — data is stored on this device. The live portal uses the secure central database.</div>` : ''}
      <div class="kpis">
        <div class="kpi"><div class="k-label">Total Borrowed</div><div class="k-value">${GFS.mk(s.totalBorrowed)}</div><div class="k-sub">All loans to date</div></div>
        <div class="kpi emerald"><div class="k-label">Active Loans</div><div class="k-value">${s.activeLoans}</div><div class="k-sub">${s.pendingApplications} pending application(s)</div></div>
        <div class="kpi red"><div class="k-label">Outstanding Balance</div><div class="k-value">${GFS.mk(s.outstanding)}</div><div class="k-sub">Principal + interest + fees</div></div>
        <div class="kpi blue"><div class="k-label">Total Repaid</div><div class="k-value">${GFS.mk(s.totalRepaid)}</div><div class="k-sub">Thank you for paying on time</div></div>
      </div>
      ${s.nextRepaymentDate ? `<div class="card card-accent mt-2"><div class="flex-between"><div><h3 class="mb-0">⏰ Next repayment</h3><div class="muted small">${esc(s.nextRepaymentLoan)} · due ${GFS.fmtDate(s.nextRepaymentDate)}</div></div><div class="right"><div style="font:800 24px var(--font);color:var(--emerald-deep)">${GFS.mk(s.nextRepaymentAmount)}</div><button class="btn btn-gold btn-sm mt-1" id="pay-next">Pay now →</button></div></div></div>` : ''}
      <div class="grid grid-2 mt-2" style="align-items:start">
        <div>
          <div class="card"><div class="flex-between"><h3 class="mb-0">💰 Active loans</h3><a href="#/portal/loans" class="small">View all →</a></div>
            ${d.loans.length ? d.loans.map(l => `<div class="mt-2" style="border:1.5px solid var(--line);border-radius:12px;padding:15px">
              <div class="flex-between"><div><b>${esc(l.productName)}</b> <span class="mono tiny muted">${esc(l.ref)}</span><div class="tiny muted">${GFS.mk(l.principal)} · ${l.rateMonthly}%/mo · ${l.termMonths} months</div></div>${UI.badge(l.status)}</div>
              <div class="flex-between mt-1 small"><span class="muted">Outstanding</span><b>${GFS.mk(l.outstanding)}</b></div>
              <div class="mt-1">${UI.progressBar(l.progress)}<div class="tiny muted mt-1">${l.installmentsPaid}/${l.installmentsTotal} instalments paid · next ${l.nextDueDate ? GFS.fmtDate(l.nextDueDate) : '—'}</div></div>
              <div class="flex mt-1"><a href="#/portal/loans/${l.id}" class="btn btn-ghost btn-sm">Manage</a><button class="btn btn-emerald btn-sm" data-pay="${l.id}">Make payment</button></div>
            </div>`).join('') : UI.empty('💰', 'No active loans', 'Apply for your first loan to get started.', '<a class="btn btn-gold btn-sm" href="#/portal/apply">Apply now</a>')}
          </div>
          <div class="card"><div class="flex-between"><h3 class="mb-0">📋 Recent applications</h3><a href="#/portal/applications" class="small">View all →</a></div>
            ${d.applications.length ? UI.table(['Reference', 'Product', 'Amount', 'Status'], d.applications.map(a => [`<a href="#/portal/applications/${a.id}" class="mono small">${esc(a.ref)}</a>`, esc(a.productName), GFS.mk(a.amount), UI.badge(a.status)])) : UI.empty('📋', 'No applications yet')}
          </div>
        </div>
        <div>
          <div class="card"><h3>⚡ Quick actions</h3><div class="grid grid-2" style="gap:10px">
            ${[['#/portal/apply', '📝', 'Apply for loan'], ['#/portal/loans', '💳', 'Make a payment'], ['#/portal/statements', '📑', 'Get statement'], ['#/portal/documents', '🪪', 'Upload documents'], ['#/portal/chat', '💬', 'Live chat'], ['#/portal/requests', '📨', 'Loan requests']].map(([h, i, l]) => `<a href="${h}" class="btn btn-ghost btn-sm" style="justify-content:flex-start">${i} ${l}</a>`).join('')}
          </div></div>
          <div class="card"><div class="flex-between"><h3 class="mb-0">🕘 Recent transactions</h3><a href="#/portal/transactions" class="small">All →</a></div>
            ${d.recentTransactions.length ? d.recentTransactions.slice(0, 5).map(t => `<div class="flex-between" style="padding:9px 0;border-bottom:1px solid var(--line-2)"><div><div class="small"><b>${esc(t.type)}</b> ${UI.badge(t.status)}</div><div class="tiny muted mono">${esc(t.ref)}</div></div><div class="right"><b class="small">${GFS.mk(t.amount)}</b><div class="tiny muted">${GFS.fmtDate(t.createdAt)}</div></div></div>`).join('') : '<p class="muted small">No transactions yet.</p>'}
          </div>
          <div class="card"><h3>📢 Announcements</h3>${(d.announcements || []).slice(0, 3).map(a => `<div style="padding:8px 0;border-bottom:1px solid var(--line-2)"><b class="small">${a.pinned ? '📌 ' : ''}${esc(a.title)}</b><div class="tiny muted">${esc(a.body).slice(0, 110)}…</div></div>`).join('')}</div>
          <div class="card" style="background:var(--emerald-50)"><h3>🛡️ Your security</h3><p class="small muted mb-1">KYC: ${UI.badge(d.kyc.status)} · Phone ${d.kyc.phoneVerified ? '✓' : '✗'} · Email ${d.kyc.emailVerified ? '✓' : '✗'}</p><a href="#/portal/security" class="small">Security settings →</a></div>
        </div>
      </div>`;
    },
    mount: async el => {
      const d = await API.get('/api/dashboard');
      const payNext = el.querySelector('#pay-next');
      if (payNext) payNext.onclick = () => { const l = d.loans.find(x => x.ref === d.stats.nextRepaymentLoan); if (l) Money.paymentModal(l); };
      el.querySelectorAll('[data-pay]').forEach(b => b.onclick = async () => { const ld = await API.get('/api/loans/' + b.dataset.pay); Money.paymentModal(ld.loan); });
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
              <div><div class="tiny muted">Outstanding</div><b style="color:var(--red)">${GFS.mk(l.outstanding)}</b></div>
              <div><div class="tiny muted">Repaid</div><b style="color:var(--emerald-700)">${GFS.mk(l.totalRepaid)}</b></div>
            </div>
            <div class="mt-2">${UI.progressBar(l.progress)}<div class="tiny muted mt-1">${l.installmentsPaid}/${l.installmentsTotal} paid · ${l.freq} · ${l.rateMonthly}%/mo</div></div>
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
        <div class="kpi"><div class="k-label">Outstanding Balance</div><div class="k-value">${GFS.mk(l.outstanding)}</div><div class="k-sub">Principal ${GFS.mk(l.outstandingPrincipal)}</div></div>
        <div class="kpi emerald"><div class="k-label">Next Instalment</div><div class="k-value">${l.nextDueAmount ? GFS.mk(l.nextDueAmount) : '—'}</div><div class="k-sub">${l.nextDueDate ? 'due ' + GFS.fmtDate(l.nextDueDate) : 'No pending instalments'}</div></div>
        <div class="kpi blue"><div class="k-label">Total Repaid</div><div class="k-value">${GFS.mk(l.totalRepaid)}</div><div class="k-sub">Interest paid ${GFS.mk(l.totalInterestPaid)}</div></div>
        <div class="kpi"><div class="k-label">Progress</div><div class="k-value">${l.progress}%</div><div class="k-sub">${l.installmentsPaid}/${l.installmentsTotal} instalments</div></div>
      </div>
      ${l.status === 'active' ? `<div class="card card-accent mt-2"><div class="flex-between wrap"><div><h3 class="mb-0">💳 Repay this loan</h3><div class="muted small">Mpamba · Airtel Money · Bank · Cash — balance updates instantly on verification</div></div>
        <div class="flex wrap"><button class="btn btn-gold" id="pay-btn">Make a payment</button><button class="btn btn-emerald" id="settle-btn">Settle in full (${GFS.mk(l.settlement.total)})</button></div></div>
        <div class="tiny muted mt-1">Early settlement waives ${GFS.mk(l.settlement.futureInterestWaived)} of future interest. <a href="#" id="settlement-pdf">Download settlement statement</a></div></div>` : `<div class="alert alert-success mt-2">🎉 This loan is fully settled. ${l.closedAt ? 'Closed ' + GFS.fmtDate(l.closedAt) + '.' : ''} Security released.</div>`}
      <div class="grid grid-2 mt-2" style="align-items:start">
        <div class="card"><h3>📋 Loan terms</h3>
          ${UI.table(['Item', 'Detail'], [['Principal', GFS.mk(l.principal)], ['Interest rate', l.rateMonthly + '% per month (declining)'], ['Arrangement fee', `${l.feePct}% (${GFS.mk(l.feeAmount)})`], ['Net disbursed', GFS.mk(l.netDisbursed)], ['Term', `${l.termMonths} months · ${l.freq}`], ['Instalment', GFS.mk(l.installment)], ['Disbursement ref', `<span class="mono tiny">${esc(l.disbursementRef || '—')}</span>`], ['Disbursement method', esc(l.disbursementMethod || '—')], ['Status', UI.badge(l.status)]], { numCols: [] })}
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
            ${a.status === 'approved' ? `<a href="#/portal/applications/${a.id}" class="btn btn-gold btn-sm">✍️ Accept agreement & receive funds</a>` : ''}
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
        <div class="flex wrap"><button class="btn btn-gold btn-lg" id="accept-btn">✍️ Review & Accept Agreement</button><button class="btn btn-ghost" id="agr-pdf">📄 Download agreement (draft)</button><button class="btn btn-danger btn-sm" id="cancel-btn">Cancel application</button></div>
      </div>` : ''}
      ${a.status === 'pending_documents' ? `<div class="card mt-2"><h3>📄 Documents needed</h3><p class="muted small">${esc(a.decisionReason || '')}</p><div class="flex"><a href="#/portal/documents" class="btn btn-emerald">Upload documents</a><button class="btn btn-ghost" id="reassess-btn">Re-run assessment</button></div></div>` : ''}
      ${a.status === 'rejected' ? `<div class="card mt-2"><h3>What you can do</h3><p class="muted small">Adjust the amount or term to fit affordability, clear existing obligations, or add collateral — then apply again.</p><div class="flex"><a href="#/portal/apply?product=${a.productId}" class="btn btn-gold">Adjust & re-apply</a><button class="btn btn-ghost" id="reassess-btn">Re-run assessment</button></div></div>` : ''}
      ${a.status === 'disbursed' ? `<div class="alert alert-success mt-2">💰 Disbursed! ${a.agreementAcceptedAt ? 'Agreement signed ' + GFS.fmtDateTime(a.agreementAcceptedAt) + '.' : ''} <a href="#/portal/loans">View your loan →</a></div>` : ''}
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
        const u = App.user;
        const m = UI.modal(`
          <h3>✍️ Loan Agreement — ${esc(app.ref)}</h3>
          <div class="alert alert-info small">Read the agreement below. By signing you accept the offer of <b>${GFS.mk(app.offer.amount)}</b> at <b>${app.offer.rate}%/month</b> over <b>${app.offer.termMonths} months</b>, instalment <b>${GFS.mk(app.offer.installment)}</b>, total repayable <b>${GFS.mk(app.offer.totalRepayable)}</b>.</div>
          <div style="max-height:260px;overflow-y:auto;border:1.5px solid var(--line);border-radius:10px;padding:16px;background:var(--canvas)">
            ${GFS.AGREEMENT_CLAUSES.map(c => `<h4 style="font-size:13px;margin:10px 0 4px;color:var(--emerald-deep)">${esc(c.t)}</h4><p style="font-size:12px;margin:0 0 8px" class="muted">${esc(c.b)}</p>`).join('')}
          </div>
          <form id="sig-form" class="mt-2">
            <div class="form-grid">
              ${UI.field('Full name (as registered)', UI.input('name', `required value="${esc(u.name)}" readonly`))}
              ${UI.field('National ID / passport number', UI.input('idNumber', 'required placeholder="e.g. 123456/78/9"'))}
            </div>
            ${UI.field('Draw your signature', '<canvas class="sig-pad" id="sig-canvas"></canvas><div class="flex mt-1"><button type="button" class="btn-link" id="sig-clear">Clear</button><span class="tiny muted">or type it below</span></div>')}
            ${UI.field('Typed signature (alternative)', UI.input('typedSig', 'placeholder="Type your full name"'))}
            <label class="check"><input type="checkbox" name="accept" required> I have read and accept the loan agreement and the offer. My electronic signature is binding.</label>
            <div class="m-actions"><button type="button" class="btn btn-ghost" data-close>Not yet</button><button type="submit" class="btn btn-gold">Sign & Receive Funds →</button></div>
          </form>`, { wide: true });
        const pad = UI.signaturePad(m.el.querySelector('#sig-canvas'));
        m.el.querySelector('#sig-clear').onclick = () => pad.clear();
        UI.bindForm(m.el.querySelector('#sig-form'), async data => {
          const signature = !pad.isEmpty() ? pad.dataURL() : (data.typedSig ? data.typedSig + ' (typed)' : '');
          if (!signature) throw new Error('Draw or type your signature to continue.');
          const r = await API.post(`/api/applications/${app.id}/accept-agreement`, { accept: true, name: data.name, idNumber: data.idNumber, signature });
          m.close();
          UI.modal(`<div class="center"><div style="font-size:48px">🎉</div><h2>Loan disbursed!</h2><p class="muted">${GFS.mk(r.loan.netDisbursed)} has been sent to your ${esc(r.loan.disbursementMethod)} account.</p>
            <div class="card" style="text-align:left">${UI.table(['Item', 'Detail'], [['Loan account', `<b class="mono">${esc(r.loan.ref)}</b>`], ['Disbursement ref', `<span class="mono tiny">${esc(r.loan.disbursementRef)}</span>`], ['First instalment', GFS.mk(r.loan.installment)], ['First due date', GFS.fmtDate(r.loan.nextDueDate)]])}</div>
            <div class="m-actions" style="justify-content:center"><button class="btn btn-ghost" data-close>Close</button><a class="btn btn-gold" href="#/portal/loans/${r.loan.id}">View my loan →</a></div></div>`);
          App.refreshUser();
        });
      }
    }
  });

  /* ---------------- APPLY (guided multi-step) ---------------- */
  App.route('/portal/apply', {
    title: 'Apply for a Loan', layout: 'portal', auth: true, render: async () => {
      const u = App.user;
      const pre = App.query().product || 'PL';
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
        const p = GFS.productById(prodSel.value);
        form.elements.term.innerHTML = p.terms.map(t => `<option value="${t}">${t} months</option>`).join('');
        form.elements.freq.innerHTML = p.freqs.map(f => `<option value="${f}">${f[0].toUpperCase() + f.slice(1)}</option>`).join('');
        form.elements.amount.min = p.min; form.elements.amount.max = p.max;
        if (!form.elements.amount.value || Number(form.elements.amount.value) < p.min || Number(form.elements.amount.value) > p.max) form.elements.amount.value = Math.round((p.min + Math.min(p.max, p.min * 5)) / 2);
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
        const body = {
          productId: data.productId, amount: Number(data.amount), term: Number(data.term), freq: data.freq, purpose: data.purpose,
          income: Number(data.income), expenses: Number(data.expenses || 0), acceptTerms: data.acceptTerms,
          disbursementMethod: data.disbursementMethod, disbursementAccount: data.disbursementAccount,
          guarantors: data.gName ? [{ name: data.gName, phone: data.gPhone, relationship: data.gRelationship, employer: data.gEmployer, consent: !!data.gConsent }] : [],
          collateral: data.cType ? { type: data.cType, value: Number(data.cValue || 0), description: data.cDesc } : null
        };
        const r = await API.post('/api/applications', body);
        const a = r.application;
        UI.modal(`<div class="center"><div style="font-size:46px">${a.status === 'approved' ? '🎉' : a.status === 'rejected' ? '📋' : '📨'}</div>
          <h2>Application ${esc(r.reference)}</h2>
          <p>${UI.badge(a.status)}</p>
          <p class="muted small">${esc(a.decisionReason || 'Your application was received and is being reviewed.')}</p>
          <div class="m-actions" style="justify-content:center"><a class="btn btn-ghost" href="#/portal/applications">All applications</a><a class="btn btn-gold" href="#/portal/applications/${a.id}">${a.status === 'approved' ? 'Accept offer →' : 'Track application →'}</a></div></div>`);
        App.refreshUser();
      }, { confirmText: 'Submit this loan application? A credit assessment will run immediately.' });
    }
  });
})();
