/* Customer support: live chat (AI assistant + human handoff), support tickets,
   complaints with tracking, feedback. The AI assistant answers from the same
   product/rate data that drives the calculator — never invented figures. */
import { q, q1, run, nextSeq, audit, activity, json } from './db.js';
import { HttpError } from './http.js';
import { clean } from './security.js';
import { requireAuth } from './auth.js';
import { notify } from './notifications.js';
import GFS from '../shared/core.mjs';

/* ---------------- AI assistant ---------------- */
function botAnswer(u, message) {
  const m = String(message || '').toLowerCase();
  const loans = q(`SELECT * FROM loans WHERE customer_id = ? AND status = 'active'`, u.id);
  const apps = q(`SELECT * FROM applications WHERE customer_id = ? ORDER BY id DESC LIMIT 1`, u.id);
  const has = (...words) => words.some(w => m.includes(w));

  if (has('hello', 'hi ', 'hey', 'muli', 'monire', 'good morning', 'good afternoon') || m.trim() === 'hi') {
    return `Hello ${u.first_name}! 👋 I'm the Golden Financial Services assistant. I can help with loan products, rates, your balance, repayments, applications and documents. What would you like to know?`;
  }
  if (has('balance', 'owe', 'outstanding')) {
    if (!loans.length) return 'You have no active loans right now. Would you like to apply? Open Apply for a Loan in your portal.';
    return loans.map(l => `Loan ${l.ref} (${GFS.productById(l.product_id).name}): outstanding balance ${GFS.mk(l.outstanding_principal + l.accrued_interest + l.fees_outstanding + l.penalties)} — principal ${GFS.mk(l.outstanding_principal)}, next instalment ${GFS.mk(l.next_due_amount || 0)} due ${l.next_due_date || '—'}.`).join('\n');
  }
  if (has('next', 'due', 'when') && has('pay', 'repay', 'instal', 'due')) {
    const next = loans.filter(l => l.next_due_date).sort((a, b) => a.next_due_date.localeCompare(b.next_due_date))[0];
    return next ? `Your next payment is ${GFS.mk(next.next_due_amount)} on ${next.next_due_date} for loan ${next.ref}. You can pay now from Loans → Make a payment (TNM Mpamba, Airtel Money, bank or cash).` : 'You have no upcoming payments scheduled.';
  }
  if (has('rate', 'interest')) {
    return 'Our monthly rates on the declining balance: ' + GFS.PRODUCTS.map(p => `${p.name} ${p.rate}%`).join(', ') + '. Arrangement fees are 1.0%–2.5% of the principal, deducted at disbursement. Use the Loan Calculator for an exact quote.';
  }
  if (has('product', 'loan type', 'which loan', 'types of')) {
    return 'We offer 10 products: ' + GFS.PRODUCTS.map(p => p.name).join(', ') + '. Open Loan Products in the menu to compare amounts, terms and requirements, or tell me what you need money for and I will suggest one.';
  }
  for (const p of GFS.PRODUCTS) {
    if (m.includes(p.name.toLowerCase().replace(' loans', '')) || m.includes(p.id.toLowerCase() + ' ')) {
      return `${p.name}: ${GFS.mk(p.min)} – ${GFS.mk(p.max)}, ${p.rate}% per month (declining balance), ${p.fee}% arrangement fee, terms of ${p.terms.join(', ')} months. ${p.blurb} Requirements: ${p.eligibility.slice(0, 3).join('; ')}.`;
    }
  }
  if (has('apply', 'application', 'borrow')) {
    const last = apps[0];
    if (last && ['submitted', 'under_review', 'pending_documents'].includes(last.status)) return `Your latest application ${last.ref} is ${last.status.replace(/_/g, ' ')} (${last.stage}). ${last.decision_reason || ''} Track it under Applications.`;
    if (last && last.status === 'approved') return `Great news — application ${last.ref} is approved! Open Applications → Accept agreement to sign and receive your money.`;
    return 'To apply: open Apply for a Loan, choose a product, amount and term, add your guarantor, upload your ID and proof of income, then submit. You will get a GLS-APP reference and can track every stage. Most complete applications are decided within 24 hours.';
  }
  if (has('repay', 'pay', 'mpamba', 'airtel', 'mobile money', 'bank')) {
    return 'You can repay from your portal with TNM Mpamba (*444#), Airtel Money (*211#), bank transfer (FDH Bank 1000234567 or Standard Bank 9000123456) or cash at any branch. Every verified payment updates your balance instantly and issues a receipt. Open Loans → Make a payment.';
  }
  if (has('settle', 'early', 'clear', 'finish')) {
    return loans.length ? 'You can settle early at any time — you pay only the outstanding principal plus interest accrued to today; all future interest is waived. Open your loan and choose Request settlement statement, then Settle loan.' : 'Early settlement applies when you have an active loan: you pay principal plus accrued interest only, and future interest is waived.';
  }
  if (has('document', 'kyc', 'id', 'upload', 'verify')) {
    return `Your KYC status is ${u.kyc_status.replace(/_/g, ' ')}. Upload your national ID (or passport/driving licence) and proof of income under Profile → Documents. Files are encrypted and only you can see them.`;
  }
  if (has('penalt', 'late', 'overdue', 'miss')) {
    return 'After a 3-day grace period, a late penalty of 2% of the overdue instalment applies per month overdue. You will get SMS and portal reminders. If you are struggling, contact us early — we can discuss restructuring your loan.';
  }
  if (has('top-up', 'topup', 'top up', 'renew', 'another loan', 'again')) {
    return 'You can request a top-up, renewal or refinancing from Loans → Loan requests. Top-ups are available on active loans in good standing, up to 50% of the original principal (within product limits).';
  }
  if (has('human', 'agent', 'person', 'talk to', 'complain', 'complaint')) {
    return 'I can connect you to a human agent. Open Support → New ticket (or type "create ticket" here) and our customer care team will respond — within 2 working days at the latest. For urgent matters call +265 1 770 100.';
  }
  if (has('thank', 'zikomo', 'thanks')) return 'You are welcome! 😊 Is there anything else I can help with?';
  return `I can help with: your balance and next payment, loan products and rates, applying, repaying (Mpamba/Airtel/bank/cash), early settlement, documents and KYC, top-ups and renewals. Try asking “What is my balance?” or “Tell me about business loans”. For anything else, open a support ticket and a human agent will follow up.`;
}

export async function chatSend(ctx) {
  const u = requireAuth(ctx);
  const body = clean(ctx.body.message, 2000);
  if (!body) throw new HttpError(400, 'Type a message first.');
  run(`INSERT INTO chat_messages(customer_id, sender, body) VALUES(?,?,?)`, u.id, 'customer', body);
  let reply;
  if (/create ticket|open ticket|new ticket/i.test(body)) {
    const ref = GFS.refs.ticket(nextSeq('ticket'));
    run(`INSERT INTO tickets(ref, customer_id, subject, category, status) VALUES(?,?,?,?,?)`, ref, u.id, body.slice(0, 120), 'general', 'open');
    reply = `Done — I have opened support ticket ${ref} for you. A human agent will reply in Support → Tickets. Anything else I can help with meanwhile?`;
  } else {
    reply = botAnswer(u, body);
  }
  run(`INSERT INTO chat_messages(customer_id, sender, body) VALUES(?,?,?)`, u.id, 'bot', reply);
  return { reply, sender: 'bot' };
}
export async function chatHistory(ctx) {
  const u = requireAuth(ctx);
  return { messages: q(`SELECT * FROM chat_messages WHERE customer_id = ? ORDER BY id ASC LIMIT 500`, u.id) };
}

/* ---------------- tickets & complaints ---------------- */
export async function createTicket(ctx) {
  const u = requireAuth(ctx);
  const b = ctx.body;
  const subject = clean(b.subject, 150);
  const message = clean(b.message, 4000);
  if (!subject || !message) throw new HttpError(400, 'Subject and message are required.');
  const category = ['general', 'complaint', 'payment', 'application', 'account', 'feedback'].includes(b.category) ? b.category : 'general';
  const priority = ['low', 'normal', 'high', 'urgent'].includes(b.priority) ? b.priority : (category === 'complaint' ? 'high' : 'normal');
  const ref = GFS.refs.ticket(nextSeq('ticket'));
  const r = run(`INSERT INTO tickets(ref, customer_id, subject, category, priority, status) VALUES(?,?,?,?,?,?)`, ref, u.id, subject, category, priority, 'open');
  const id = Number(r.lastInsertRowid);
  run(`INSERT INTO ticket_messages(ticket_id, sender, sender_name, body) VALUES(?,?,?,?)`, id, 'customer', `${u.first_name} ${u.last_name}`, message);
  // Automated acknowledgement + first-line response (human follow-up queued)
  const ack = category === 'complaint'
    ? `Thank you for raising this, ${u.first_name}. Your complaint ${ref} has been logged and escalated to our customer care team. We acknowledge within 2 working days and resolve within 14 working days, in line with our complaints policy. You can track every update here.`
    : `Thank you, ${u.first_name}. Ticket ${ref} is open. Our support team has been notified and will respond shortly. You will receive an SMS and email when there is a reply.`;
  run(`INSERT INTO ticket_messages(ticket_id, sender, sender_name, body) VALUES(?,?,?,?)`, id, 'agent', 'GFS Customer Care', ack);
  notify(u.id, { category: 'support', title: `${category === 'complaint' ? 'Complaint' : 'Ticket'} ${ref} opened`, body: ack, channels: ['inapp', 'sms', 'email'] });
  audit('customer', u.id, `support.ticket_created`, 'ticket', id, null, { ref, category }, ctx.ip, ctx.ua);
  return { ticket: serializeTicket(q1(`SELECT * FROM tickets WHERE id = ?`, id)) };
}
const serializeTicket = t => ({ id: t.id, ref: t.ref, subject: t.subject, category: t.category, priority: t.priority, status: t.status, createdAt: t.created_at, updatedAt: t.updated_at });

export async function listTickets(ctx) {
  const u = requireAuth(ctx);
  return { tickets: q(`SELECT * FROM tickets WHERE customer_id = ? ORDER BY id DESC`, u.id).map(serializeTicket) };
}
export async function getTicket(ctx) {
  const u = requireAuth(ctx);
  const t = q1(`SELECT * FROM tickets WHERE id = ? AND customer_id = ?`, Number(ctx.params.id), u.id);
  if (!t) throw new HttpError(404, 'Ticket not found.');
  return { ticket: serializeTicket(t), messages: q(`SELECT * FROM ticket_messages WHERE ticket_id = ? ORDER BY id ASC`, t.id) };
}
export async function replyTicket(ctx) {
  const u = requireAuth(ctx);
  const t = q1(`SELECT * FROM tickets WHERE id = ? AND customer_id = ?`, Number(ctx.params.id), u.id);
  if (!t) throw new HttpError(404, 'Ticket not found.');
  if (t.status === 'closed') throw new HttpError(400, 'This ticket is closed. Open a new one if you need more help.');
  const body = clean(ctx.body.message, 4000);
  if (!body) throw new HttpError(400, 'Type a reply first.');
  run(`INSERT INTO ticket_messages(ticket_id, sender, sender_name, body) VALUES(?,?,?,?)`, t.id, 'customer', `${u.first_name} ${u.last_name}`, body);
  run(`UPDATE tickets SET status = 'open', updated_at = datetime('now') WHERE id = ?`, t.id);
  const auto = `Thanks for the update — it has been added to ticket ${t.ref}. An agent will review it and respond. If your issue is urgent, call +265 1 770 100.`;
  run(`INSERT INTO ticket_messages(ticket_id, sender, sender_name, body) VALUES(?,?,?,?)`, t.id, 'agent', 'GFS Customer Care', auto);
  return { ok: true, reply: auto };
}
export async function closeTicket(ctx) {
  const u = requireAuth(ctx);
  const t = q1(`SELECT * FROM tickets WHERE id = ? AND customer_id = ?`, Number(ctx.params.id), u.id);
  if (!t) throw new HttpError(404, 'Ticket not found.');
  run(`UPDATE tickets SET status = 'closed', updated_at = datetime('now') WHERE id = ?`, t.id);
  if (ctx.body.rating) {
    run(`INSERT INTO ticket_messages(ticket_id, sender, sender_name, body) VALUES(?,?,?,?)`, t.id, 'customer', `${u.first_name} ${u.last_name}`, `Feedback: rated this support ${cleanNumRating(ctx.body.rating)}/5. ${clean(ctx.body.feedback, 500)}`);
  }
  return { ok: true };
}
const cleanNumRating = v => Math.max(1, Math.min(5, Number(v) || 5));

/* ---------------- announcements (public) ---------------- */
export async function listAnnouncements(ctx) {
  return { announcements: q(`SELECT * FROM announcements ORDER BY pinned DESC, id DESC LIMIT 50`) };
}
