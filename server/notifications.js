/* In-app history is authoritative. External messages are queued until an
   authenticated gateway accepts them; delivery requires a signed callback. */
import crypto from 'node:crypto';
import { run, q, q1, json, tx } from './db.js';
import { SMS_WEBHOOK, EMAIL_WEBHOOK, SMS_SENDER, NOTIFICATION_KEY } from './config.js';
import { rules } from './catalog.js';
import { applyLatePenalty, accrueInterest } from './finance.js';
const endpoint = ch => ch === 'sms' ? SMS_WEBHOOK : ch === 'email' ? EMAIL_WEBHOOK : '';
export const deliveryConfigured = ch => !!endpoint(ch) && !!NOTIFICATION_KEY;
async function forward(id, channel, payload) {
  const url = endpoint(channel);
  if (!url || !NOTIFICATION_KEY) return;
  try {
    const body = JSON.stringify({ id, ...payload });
    const res = await fetch(url, { method: 'POST', redirect: 'error', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${NOTIFICATION_KEY}`, 'Idempotency-Key': id }, body, signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`Gateway HTTP ${res.status}`);
    const result = await res.json().catch(() => ({}));
    run(`UPDATE notifications SET delivery_status='accepted',provider_message_id=? WHERE id=?`, String(result.messageId || id).slice(0, 150), id);
  } catch (e) { run(`UPDATE notifications SET delivery_status='failed',delivery_error=? WHERE id=?`, String(e.message).slice(0, 200), id); }
}
export function notify(customerId, { category = 'general', title, body, channels = ['inapp', 'sms', 'email'], meta = {} }) {
  const c = q1(`SELECT email,phone,prefs FROM customers WHERE id=?`, customerId);
  if (!c) return [];
  const prefs = json(c.prefs, {}), jobs = [];
  const wanted = new Set(['inapp', ...channels]);
  if (category === 'marketing' && !prefs.marketing) return [];
  for (const ch of wanted) {
    if (!['inapp', 'sms', 'email'].includes(ch) || (ch !== 'inapp' && prefs[ch] === false) || (category === 'reminder' && ch !== 'inapp' && prefs.reminders === false)) continue;
    const status = ch === 'inapp' ? 'delivered' : deliveryConfigured(ch) ? 'queued' : 'not_configured';
    const id = Number(run(`INSERT INTO notifications(customer_id,channel,category,title,body,meta,delivery_status,delivered_at) VALUES(?,?,?,?,?,?,?,CASE WHEN ?='delivered' THEN datetime('now') ELSE NULL END)`, customerId, ch, category, title, body, JSON.stringify(meta), status, status).lastInsertRowid);
    if (ch !== 'inapp' && status === 'queued') jobs.push(forward(id, ch, ch === 'sms' ? { to: c.phone, from: SMS_SENDER, message: `${title}: ${body}`, category } : { to: c.email, subject: title, text: body, category }));
  }
  // Network work never runs inside a database transaction.
  queueMicrotask(() => Promise.allSettled(jobs));
  return [...wanted];
}
export function deliverSecurityCode(customerId, channel, target, code, purpose) {
  const status = deliveryConfigured(channel) ? 'queued' : 'not_configured';
  const id = Number(run(`INSERT INTO notifications(customer_id,channel,category,title,body,meta,delivery_status) VALUES(?,?,?,?,?,?,?)`, customerId, channel, 'security', 'Your verification code', 'A one-time security code was requested. For your protection the code is not stored in message history.', JSON.stringify({ purpose }), status).lastInsertRowid);
  if (status === 'queued') queueMicrotask(() => forward(id, channel, channel === 'sms' ? { to: target, from: SMS_SENDER, message: `Golden Financial Services: your code is ${code}. It expires in ${rules().otpTtlMinutes} minutes. Never share it.`, category: 'security' } : { to: target, subject: 'Your Golden Financial Services verification code', text: `Your code is ${code}. It expires in ${rules().otpTtlMinutes} minutes. Never share it.`, category: 'security' }));
}
export function listNotifications(customerId, { channel, limit = 100, offset = 0 } = {}) {
  return q(`SELECT * FROM notifications WHERE customer_id=? ${channel ? 'AND channel=?' : ''} ORDER BY id DESC LIMIT ? OFFSET ?`, ...[customerId, ...(channel ? [channel] : []), Math.min(200, Math.max(1, limit)), Math.max(0, offset)]);
}
export const unreadCount = customerId => q1(`SELECT COUNT(*) n FROM notifications WHERE customer_id=? AND channel='inapp' AND read_at IS NULL`, customerId).n;
export function markRead(customerId, id) { run(`UPDATE notifications SET read_at=COALESCE(read_at,datetime('now')) WHERE customer_id=? AND id=?`, customerId, id); }
export function markAllRead(customerId) { run(`UPDATE notifications SET read_at=datetime('now') WHERE customer_id=? AND channel='inapp' AND read_at IS NULL`, customerId); }
export function runReminderJob() {
  const today = new Date().toISOString().slice(0, 10);
  let reminders = 0, penalties = 0;
  for (const l of q(`SELECT l.*,c.id cid FROM loans l JOIN customers c ON c.id=l.customer_id WHERE l.status='active'`)) {
    accrueInterest(l.id);
    const before = q1(`SELECT penalties FROM loans WHERE id=?`, l.id).penalties;
    penalties += applyLatePenalty(l.id);
    const after = q1(`SELECT penalties FROM loans WHERE id=?`, l.id).penalties;
    if (after > before) notify(l.cid, { category: 'overdue', title: 'Overdue repayment', body: `A late-payment charge was applied to ${l.ref}. Review your balance and contact support if you need help.`, channels: ['inapp'] });
    if (l.next_due_date) {
      const days = Math.round((Date.parse(l.next_due_date) - Date.parse(today)) / 86400000);
      const key = `reminded_${l.id}_${l.next_due_date}`;
      if (days >= 0 && days <= 3 && !q1(`SELECT 1 x FROM integration_state WHERE key=?`, key)) {
        tx(() => { notify(l.cid, { category: 'reminder', title: 'Upcoming repayment', body: `${l.ref}: ${GFSmoney(l.next_due_amount)} is due on ${l.next_due_date}.`, meta: { loanId: l.id } }); run(`INSERT INTO integration_state(key,value) VALUES(?,?)`, key, today); });
        reminders++;
      }
    }
  }
  return { reminders, penalties };
}
const GFSmoney = n => `MK ${Number(n).toLocaleString('en-MW', { maximumFractionDigits: 2 })}`;
