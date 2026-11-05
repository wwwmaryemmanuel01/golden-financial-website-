/* Portal support: live chat (AI + human handoff), tickets & complaints,
   notifications centre with SMS / email history. */
'use strict';
(() => {
  const esc = UI.esc;
  const head = (t, s, a = '') => `<div class="page-head"><div><h1>${t}</h1>${s ? `<div class="sub">${s}</div>` : ''}</div><div class="flex wrap">${a}</div></div>`;

  /* ---------------- LIVE CHAT ---------------- */
  App.route('/portal/chat', {
    title: 'Assistant', layout: 'portal', auth: true, render: async () => {
      const d = await API.get('/api/chat');
      return head('Golden Assistant', 'Automated guidance from your records · tracked human support when you need it', '<a href="#/portal/support" class="btn btn-ghost btn-sm">🎧 Open a ticket</a>') + `
      <div class="grid grid-2" style="align-items:start">
        <div class="card" style="padding:0;overflow:hidden">
          <div class="chat-box">
            <div class="chat-log" id="chat-log">${d.messages.map(msgHtml).join('') || `<div class="msg bot"><div class="m-who">GFS Assistant</div>Hello ${esc(App.user.firstName)}! 👋 Ask me about your balance, next payment, rates, applying or repaying.</div>`}</div>
            <div class="quick-chips">${['What is my balance?', 'When is my next payment?', 'Tell me about business loans', 'How do I repay?', 'Can I settle early?'].map(q => `<button data-q="${esc(q)}">${esc(q)}</button>`).join('')}</div>
            <form class="chat-input" id="chat-form"><input name="message" placeholder="Type your message…" autocomplete="off" required maxlength="2000"><button class="btn btn-gold" type="submit">Send ➤</button></form>
          </div>
        </div>
        <div>
          <div class="card"><h3>What the automated assistant can do</h3><ul class="small muted" style="padding-left:18px;margin:0">
            <li>Answer from your portal records — balances, due dates, schedules</li><li>Explain products, rates, fees and requirements</li><li>Guide you through applying, repaying and settling</li><li>Open a tracked ticket for human review (type “create ticket”)</li></ul></div>
          <div class="card"><h3>🎧 Need a human?</h3><p class="small muted">Open a tracked ticket for human review. Automated acknowledgements are labelled as such. For urgent matters call <b>${GFS.COMPANY.phone}</b>.</p><a href="#/portal/support" class="btn btn-emerald btn-sm">Open a ticket →</a></div>
          <div class="card" style="background:var(--emerald-50)"><h3>🕘 Chat history</h3><p class="small muted mb-0">Your conversation is saved to your account and visible only to you and support staff.</p></div>
        </div>
      </div>`;
    },
    mount: async el => {
      const log = el.querySelector('#chat-log');
      const scroll = () => { log.scrollTop = log.scrollHeight; };
      scroll();
      const send = async text => {
        log.insertAdjacentHTML('beforeend', msgHtml({ sender: 'customer', body: text, createdAt: new Date().toISOString() }));
        log.insertAdjacentHTML('beforeend', `<div class="msg bot" id="typing"><div class="m-who">GFS Assistant</div><span class="muted">typing…</span></div>`);
        scroll();
        try { const d = await API.post('/api/chat', { message: text }); const t = el.querySelector('#typing'); if (t) t.remove(); log.insertAdjacentHTML('beforeend', msgHtml({ sender: 'bot', body: d.reply, createdAt: new Date().toISOString() })); scroll(); }
        catch (e) { const t = el.querySelector('#typing'); if (t) t.remove(); UI.toast(e.message, 'err'); }
      };
      UI.bindForm(el.querySelector('#chat-form'), async (data, form) => { const msg = data.message; form.elements.message.value = ''; await send(msg); });
      el.querySelectorAll('[data-q]').forEach(b => b.onclick = () => send(b.dataset.q));
    }
  });
  function msgHtml(m) {
    const who = m.sender === 'customer' ? 'You' : m.sender === 'bot' ? 'Automated assistant' : (m.sender_name || 'Support agent');
    return `<div class="msg ${m.sender}"><div class="m-who">${esc(who)} · ${GFS.fmtDateTime(m.createdAt || m.created_at)}</div>${esc(m.body)}</div>`;
  }

  /* ---------------- TICKETS & COMPLAINTS ---------------- */
  App.route('/portal/support', {
    title: 'Support & Complaints', layout: 'portal', auth: true, render: async () => {
      const d = await API.get('/api/tickets');
      return head('Support Tickets & Complaints', 'Track questions, payment issues, complaints and feedback', '<button class="btn btn-gold" id="new-ticket">+ New ticket / complaint</button>') + `
      <div class="grid grid-3 mb-2">
        <div class="kpi blue"><div class="k-label">Open</div><div class="k-value">${d.tickets.filter(t => t.status === 'open').length}</div></div>
        <div class="kpi emerald"><div class="k-label">Resolved</div><div class="k-value">${d.tickets.filter(t => ['resolved', 'closed'].includes(t.status)).length}</div></div>
        <div class="kpi"><div class="k-label">Total</div><div class="k-value">${d.tickets.length}</div></div>
      </div>
      <div id="ticket-list">${d.tickets.length ? d.tickets.map(ticketCard).join('') : UI.empty('🎧', 'No tickets yet', 'Open a ticket for any question, payment issue or complaint.', '<button class="btn btn-gold" id="new-ticket-2">+ New ticket</button>')}</div>
      <div id="ticket-detail"></div>`;
    },
    mount: async el => {
      const openNew = () => {
        const m = UI.modal(`<h3>🎧 New support ticket</h3>
          <form id="ticket-form">
            ${UI.field('Subject', UI.input('subject', 'required maxlength="150" placeholder="Brief summary"'))}
            <div class="form-grid">
              ${UI.field('Category', UI.select('category', [['general', 'General enquiry'], ['complaint', 'Complaint'], ['payment', 'Payment issue'], ['application', 'Application help'], ['account', 'Account'], ['feedback', 'Feedback']], 'general'))}
              ${UI.field('Priority', UI.select('priority', [['low', 'Low'], ['normal', 'Normal'], ['high', 'High'], ['urgent', 'Urgent']], 'normal'))}
            </div>
            ${UI.field('Message', '<textarea name="message" required maxlength="4000" placeholder="Describe the issue in detail…"></textarea>')}
            <div class="alert alert-info small">Your message is recorded and queued for review. Delivery of SMS/email updates depends on provider configuration.</div>
            <div class="m-actions"><button type="button" class="btn btn-ghost" data-close>Cancel</button><button type="submit" class="btn btn-gold">Submit Ticket</button></div>
          </form>`);
        UI.bindForm(m.el.querySelector('#ticket-form'), async data => { const d = await API.post('/api/tickets', data); m.close(); UI.toast(`Ticket ${d.ticket.ref} created ✓`); App.render(); });
      };
      const nb = el.querySelector('#new-ticket'); if (nb) nb.onclick = openNew;
      const nb2 = el.querySelector('#new-ticket-2'); if (nb2) nb2.onclick = openNew;
      el.querySelectorAll('[data-ticket]').forEach(b => b.onclick = async () => {
        const d = await API.get('/api/tickets/' + b.dataset.ticket);
        const t = d.ticket;
        el.querySelector('#ticket-detail').innerHTML = `
          <div class="card card-accent mt-2"><div class="flex-between wrap"><div><h3 class="mb-0">${esc(t.subject)}</h3><div class="tiny muted mono">${esc(t.ref)} · ${esc(t.category)} · ${esc(t.priority)} priority</div></div>${UI.badge(t.status)}</div>
            <div class="chat-log mt-2" style="height:300px;border:1.5px solid var(--line);border-radius:12px;background:var(--canvas)">${d.messages.map(msgHtml).join('')}</div>
            ${t.status !== 'closed' ? `<form class="chat-input mt-1" id="reply-form" style="border:1.5px solid var(--line);border-radius:12px"><input name="message" placeholder="Reply…" required><button class="btn btn-emerald" type="submit">Reply</button></form>
            <div class="flex mt-1"><button class="btn btn-ghost btn-sm" id="close-ticket">✓ Mark resolved & close</button></div>` : '<div class="alert alert-success mt-2">This ticket is closed. Open a new one if you need more help.</div>'}
          </div>`;
        const rf = el.querySelector('#reply-form');
        if (rf) UI.bindForm(rf, async data => { await API.post(`/api/tickets/${t.id}/reply`, data); UI.toast('Reply sent ✓'); b.click(); });
        const ct = el.querySelector('#close-ticket');
        if (ct) ct.onclick = async () => {
          const m = UI.modal(`<h3>Close ticket ${esc(t.ref)}</h3><p class="muted small">How was your support experience?</p>
            <form id="rate-form">${UI.field('Rating', UI.select('rating', [[5, '★★★★★ Excellent'], [4, '★★★★ Good'], [3, '★★★ Okay'], [2, '★★ Poor'], [1, '★ Very poor']], 5))}${UI.field('Feedback (optional)', '<textarea name="feedback" maxlength="500"></textarea>')}<div class="m-actions"><button type="button" class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-emerald" type="submit">Close ticket</button></div></form>`);
          UI.bindForm(m.el.querySelector('#rate-form'), async data => { await API.post(`/api/tickets/${t.id}/close`, data); m.close(); UI.toast('Ticket closed. Thank you for your feedback!'); App.render(); });
        };
        el.querySelector('#ticket-detail').scrollIntoView({ behavior: 'smooth' });
      });
    }
  });
  function ticketCard(t) {
    return `<div class="card" style="padding:16px"><div class="flex-between wrap"><div><b>${esc(t.subject)}</b><div class="tiny muted mono">${esc(t.ref)} · ${esc(t.category)} · ${GFS.fmtDateTime(t.createdAt || t.created_at)}</div></div><div class="flex">${UI.badge(t.priority)}${UI.badge(t.status)}<button class="btn btn-ghost btn-sm" data-ticket="${t.id}">Open →</button></div></div></div>`;
  }

  /* ---------------- NOTIFICATIONS ---------------- */
  App.route('/portal/notifications', {
    title: 'Notifications', layout: 'portal', auth: true, render: async () => {
      const d = await API.get('/api/notifications');
      const inapp = d.notifications.filter(n => n.channel === 'inapp');
      const sms = d.notifications.filter(n => n.channel === 'sms');
      const email = d.notifications.filter(n => n.channel === 'email');
      return head('Notifications', `${d.unread} unread · in-app, SMS and email history`, '<button class="btn btn-ghost btn-sm" id="read-all">✓ Mark all read</button>') + `
      <div class="tabs" id="notif-tabs"><button class="active" data-tab="inapp">🔔 In-app (${inapp.length})</button><button data-tab="sms">📱 SMS history (${sms.length})</button><button data-tab="email">✉️ Email history (${email.length})</button></div>
      <div class="card" style="padding:0" id="notif-panel">${notifList(inapp)}</div>`;
    },
    mount: async el => {
      const d = await API.get('/api/notifications');
      const groups = { inapp: d.notifications.filter(n => n.channel === 'inapp'), sms: d.notifications.filter(n => n.channel === 'sms'), email: d.notifications.filter(n => n.channel === 'email') };
      el.querySelectorAll('#notif-tabs button').forEach(b => b.onclick = () => {
        el.querySelectorAll('#notif-tabs button').forEach(x => x.classList.remove('active')); b.classList.add('active');
        el.querySelector('#notif-panel').innerHTML = notifList(groups[b.dataset.tab]);
        bindItems();
      });
      async function bindItems() {
        el.querySelectorAll('[data-read]').forEach(b => b.onclick = async () => { await API.post(`/api/notifications/${b.dataset.read}/read`); await App.refreshUser(); App.render(); });
      }
      bindItems();
      el.querySelector('#read-all').onclick = async () => { await API.post('/api/notifications/read-all'); await App.refreshUser(); UI.toast('All marked read ✓'); App.render(); };
    }
  });
  function notifList(ns) {
    if (!ns.length) return UI.empty('🔔', 'Nothing here yet', 'Notifications about your loans, payments and account appear here.');
    return ns.map(n => `<div class="notif-item ${!(n.readAt || n.read_at) && n.channel === 'inapp' ? 'unread' : ''}">
      <div class="n-ico">${UI.notifIcon(n.category)}</div>
      <div style="flex:1;min-width:0"><div class="n-title">${esc(n.title)}</div><div class="n-body">${esc(n.body)}</div><div class="n-time mt-1">${GFS.fmtDateTime(n.createdAt || n.created_at)} · ${esc(n.category)}${n.channel !== 'inapp' ? ' · ' + esc((n.delivery_status || 'not_configured').replaceAll('_', ' ')) : ''}</div></div>
      ${!(n.readAt || n.read_at) && n.channel === 'inapp' ? `<button class="btn btn-ghost btn-sm" data-read="${n.id}">Mark read</button>` : ''}
    </div>`).join('');
  }
})();
