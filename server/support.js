/* Honest automated assistance + persistent human-support tickets.
   A bot acknowledgement is never labelled as a human agent. */
import { q, q1, run, tx, nextSeq, audit, json } from './db.js';
import { HttpError } from './http.js';
import { clean } from './security.js';
import { requireAuth } from './auth.js';
import { notify } from './notifications.js';
import { enqueue } from './events.js';
import * as catalog from './catalog.js';
import { AI_API_URL, AI_API_KEY } from './config.js';
import GFS from '../shared/core.mjs';
function botAnswer(u, message) {
  const m = message.toLowerCase(), has = (...words) => words.some(w => m.includes(w));
  const loans = q(`SELECT * FROM loans WHERE customer_id=? AND status='active'`, u.id), apps = q(`SELECT * FROM applications WHERE customer_id=? ORDER BY id DESC LIMIT 1`, u.id);
  if (has('balance', 'owe', 'outstanding')) return loans.length ? loans.map(l => `${l.ref}: outstanding ${GFS.mk2(l.outstanding_principal + l.accrued_interest + l.fees_outstanding + l.penalties)}; next instalment ${GFS.mk2(l.next_due_amount || 0)} due ${l.next_due_date || 'not scheduled'}.`).join('\n') : 'You have no active loans. You can explore products and check eligibility before applying.';
  if (has('rate', 'interest', 'fee')) return catalog.products().map(p => `${p.name}: ${p.rate}% monthly declining rate, ${p.fee}% arrangement fee`).join('\n') + '\nActual interest accrues daily on unpaid principal. The calculator shows an illustrative schedule.';
  if (has('apply', 'application', 'status')) { const a = apps[0]; return a ? `Your latest application ${a.ref} is ${a.status.replaceAll('_', ' ')}. ${a.decision_reason || 'Open Applications for the full timeline.'}` : 'Open Apply for a loan, choose a product, complete your details, upload documents and submit. You will receive a tracking reference.'; }
  if (has('settle', 'early', 'payoff')) return 'Open your loan and request a settlement quote. You pay outstanding principal, interest accrued to today, fees and penalties. Future unaccrued interest is waived. The quote is valid for today only.';
  if (has('pay', 'mpamba', 'airtel', 'bank', 'cash')) return 'Open Payments to create a unique reference. Mobile-money confirmations require the configured provider; bank transfers and cashier records require reconciliation. A customer click alone never verifies a live payment.';
  if (has('document', 'kyc', 'identity', 'upload')) return `Your identity-review status is ${u.kyc_status.replaceAll('_', ' ')}. Upload a valid ID and proof of income in Documents. Files are encrypted; an authorised reviewer must verify them separately.`;
  if (has('late', 'penalty', 'overdue')) { const r = catalog.rules(); return `After ${r.graceDays} grace days, the published late charge is ${r.latePenaltyPct}% of the unpaid instalment. Contact support early if you need a restructuring review.`; }
  if (has('top', 'renew', 'refinance', 'restructure')) return 'Open Loan requests to request a top-up, renewal, refinancing or restructuring. A request does not change your loan until an authorised decision is recorded.';
  for (const p of catalog.products()) if (m.includes(p.name.toLowerCase().replace(' loans', ''))) return `${p.name}: ${GFS.mk(p.min)}–${GFS.mk(p.max)}, terms ${p.terms.join(', ')} months. ${p.blurb} Requirements: ${p.eligibility.join('; ')}.`;
  if (has('school', 'education')) return 'Education Loans may fit school or university fees. Compare the published terms and use the eligibility check before applying.';
  if (has('business', 'stock', 'shop')) return 'Business Loans may fit working capital, stock or equipment. Prepare trading records and income evidence; larger amounts may require security.';
  if (has('hello', 'hi', 'muli', 'zikomo', 'thank')) return `Hello ${u.first_name}, zikomo. I’m the automated Golden assistant. Ask about your balance, products, rates, documents, repayments or application status. Choose Human support for a person to review your case.`;
  return 'I can help with balances, products, rates, applications, documents and repayments. For account-specific decisions or complaints, choose Human support to open a tracked ticket.';
}
export async function chatSend(ctx) {
  const u = requireAuth(ctx), message = clean(ctx.body.message, 2000);
  if (!message) throw new HttpError(400, 'Type a message first.');
  if (ctx.body.handoff || /human support|create ticket|open ticket|talk to a person/i.test(message)) {
    const ref = GFS.refs.ticket(nextSeq('ticket'));
    const id = Number(run(`INSERT INTO tickets(ref,customer_id,subject,category,status) VALUES(?,?,?,?,?)`, ref, u.id, message.slice(0, 150), 'general', 'open').lastInsertRowid);
    run(`INSERT INTO ticket_messages(ticket_id,sender,sender_name,body) VALUES(?,?,?,?)`, id, 'customer', `${u.first_name} ${u.last_name}`, message);
    enqueue('ticket', id, { type: 'support.ticket_created', ticketId: id, reference: ref, customerId: u.id });
    const reply = `Ticket ${ref} is open and queued for human review. This is an automated acknowledgement, not a live agent. Track replies in Support.`;
    run(`INSERT INTO chat_messages(customer_id,sender,body) VALUES(?,?,?)`, u.id, 'customer', message);
    run(`INSERT INTO chat_messages(customer_id,sender,body) VALUES(?,?,?)`, u.id, 'bot', reply);
    return { reply, sender: 'bot', ticketId: id, ticketRef: ref };
  }
  let reply = botAnswer(u, message), source = 'rules';
  if (AI_API_URL && AI_API_KEY && ctx.body.aiConsent === true && !/balance|statement|password|national|phone|account number/i.test(message)) {
    try {
      const url = new URL(AI_API_URL); if (url.protocol !== 'https:') throw new Error('HTTPS required');
      const res = await fetch(url, { method: 'POST', redirect: 'error', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${AI_API_KEY}` }, body: JSON.stringify({ question: message, context: { products: catalog.products().map(p => ({ name: p.name, min: p.min, max: p.max, rate: p.rate, fee: p.fee, terms: p.terms })), currency: 'MWK' }, instruction: 'General product guidance only. Do not approve loans or invent account facts.' }), signal: AbortSignal.timeout(10000) });
      if (res.ok) { const data = await res.json(); if (typeof data.answer === 'string' && data.answer.trim()) { reply = clean(data.answer, 4000); source = 'ai'; } }
    } catch { /* Deterministic, account-aware fallback remains available. */ }
  }
  tx(() => { run(`INSERT INTO chat_messages(customer_id,sender,body) VALUES(?,?,?)`, u.id, 'customer', message); run(`INSERT INTO chat_messages(customer_id,sender,body) VALUES(?,?,?)`, u.id, 'bot', reply); });
  return { reply, sender: 'bot', source };
}
export async function chatHistory(ctx) { const u = requireAuth(ctx); return { messages: q(`SELECT id,sender,body,created_at FROM chat_messages WHERE customer_id=? ORDER BY id DESC LIMIT 200`, u.id).reverse(), aiConfigured: !!AI_API_URL && !!AI_API_KEY }; }
const serializeTicket = t => ({ id: t.id, ref: t.ref, subject: t.subject, category: t.category, priority: t.priority, status: t.status, createdAt: t.created_at, updatedAt: t.updated_at });
const ownTicket = ctx => { const u = requireAuth(ctx), t = q1(`SELECT * FROM tickets WHERE id=? AND customer_id=?`, Number(ctx.params.id), u.id); if (!t) throw new HttpError(404, 'Ticket not found.'); return { u, t }; };
export async function createTicket(ctx) {
  const u = requireAuth(ctx), b = ctx.body, subject = clean(b.subject, 150), message = clean(b.message, 5000);
  if (subject.length < 3 || message.length < 10) throw new HttpError(400, 'Enter a subject and at least 10 characters explaining the issue.');
  const category = ['general', 'complaint', 'payment', 'application', 'account', 'feedback'].includes(b.category) ? b.category : 'general';
  const priority = ['low', 'normal', 'high', 'urgent'].includes(b.priority) ? b.priority : category === 'complaint' ? 'high' : 'normal';
  const attachment = b.attachmentDocId ? Number(b.attachmentDocId) : null;
  if (attachment && !q1(`SELECT id FROM documents WHERE id=? AND customer_id=?`, attachment, u.id)) throw new HttpError(400, 'Invalid attachment.');
  const ref = GFS.refs.ticket(nextSeq('ticket'));
  const id = tx(() => { const id = Number(run(`INSERT INTO tickets(ref,customer_id,subject,category,priority,status) VALUES(?,?,?,?,?,?)`, ref, u.id, subject, category, priority, 'open').lastInsertRowid); run(`INSERT INTO ticket_messages(ticket_id,sender,sender_name,body,attachment_doc_id) VALUES(?,?,?,?,?)`, id, 'customer', `${u.first_name} ${u.last_name}`, message, attachment); run(`INSERT INTO ticket_messages(ticket_id,sender,sender_name,body) VALUES(?,?,?,?)`, id, 'bot', 'Automated acknowledgement', `Ticket ${ref} has been recorded and queued for review. No human agent has responded yet.`); enqueue('ticket', id, { type: 'support.ticket_created', ticketId: id, reference: ref, customerId: u.id, category }); return id; });
  audit('customer', u.id, 'support.ticket_created', 'ticket', id, null, { ref, category }, ctx.ip, ctx.ua);
  notify(u.id, { category: 'support', title: `Ticket ${ref} opened`, body: 'Your message is queued for human review. Track replies here.', channels: ['inapp'] });
  return { ticket: serializeTicket(q1(`SELECT * FROM tickets WHERE id=?`, id)) };
}
export async function listTickets(ctx) { const u = requireAuth(ctx); return { tickets: q(`SELECT * FROM tickets WHERE customer_id=? ORDER BY id DESC`, u.id).map(serializeTicket) }; }
export async function getTicket(ctx) { const { t } = ownTicket(ctx); return { ticket: serializeTicket(t), messages: q(`SELECT id,sender,sender_name,body,attachment_doc_id,created_at FROM ticket_messages WHERE ticket_id=? ORDER BY id`, t.id) }; }
export async function replyTicket(ctx) {
  const { u, t } = ownTicket(ctx), message = clean(ctx.body.message, 5000);
  if (t.status === 'closed') throw new HttpError(409, 'This ticket is closed. Open a new one for further help.');
  if (!message) throw new HttpError(400, 'Type a reply first.');
  const attachment = ctx.body.attachmentDocId ? Number(ctx.body.attachmentDocId) : null;
  if (attachment && !q1(`SELECT id FROM documents WHERE id=? AND customer_id=?`, attachment, u.id)) throw new HttpError(400, 'Invalid attachment.');
  tx(() => { run(`INSERT INTO ticket_messages(ticket_id,sender,sender_name,body,attachment_doc_id) VALUES(?,?,?,?,?)`, t.id, 'customer', `${u.first_name} ${u.last_name}`, message, attachment); run(`UPDATE tickets SET status='open',updated_at=datetime('now') WHERE id=?`, t.id); enqueue('ticket', t.id, { type: 'support.customer_replied', ticketId: t.id, customerId: u.id, reference: t.ref }); });
  return { ok: true };
}
export async function closeTicket(ctx) {
  const { u, t } = ownTicket(ctx), rating = Number(ctx.body.rating);
  tx(() => { run(`UPDATE tickets SET status='closed',updated_at=datetime('now') WHERE id=?`, t.id); if (ctx.body.rating !== undefined) { if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new HttpError(400, 'Rating must be from 1 to 5.'); run(`INSERT INTO ticket_messages(ticket_id,sender,sender_name,body) VALUES(?,?,?,?)`, t.id, 'customer', `${u.first_name} ${u.last_name}`, `Feedback ${rating}/5: ${clean(ctx.body.feedback, 1000)}`); } });
  return { ok: true };
}
export async function listAnnouncements() { return { announcements: q(`SELECT id,title,body,category,pinned,published_at FROM announcements ORDER BY pinned DESC,id DESC LIMIT 50`) }; }
