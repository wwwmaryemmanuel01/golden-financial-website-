/* Notifications: in-app + SMS + email. Every important loan activity
   notifies the customer. SMS/email go to a stored outbox; if provider
   webhooks are configured they are forwarded there (secure API hook). */
import { run, q, q1, json } from './db.js';
import { SMS_WEBHOOK, EMAIL_WEBHOOK, SMS_SENDER } from './config.js';

async function forward(url, payload) {
  if (!url) return;
  try {
    await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(8000) });
  } catch (e) { console.error('[notify] forward failed:', e.message); }
}

export function notify(customerId, { category = 'general', title, body, channels = ['inapp', 'sms', 'email'], meta = {} }) {
  const c = q1(`SELECT email, phone, prefs FROM customers WHERE id = ?`, customerId);
  if (!c) return;
  const prefs = json(c.prefs, {});
  const sent = [];
  for (const ch of channels) {
    if (ch === 'sms' && prefs.sms === false) continue;
    if (ch === 'email' && prefs.email === false) continue;
    run(`INSERT INTO notifications(customer_id, channel, category, title, body, meta) VALUES(?,?,?,?,?,?)`,
      customerId, ch, category, title, body, JSON.stringify(meta));
    sent.push(ch);
  }
  if (sent.includes('sms')) forward(SMS_WEBHOOK, { to: c.phone, from: SMS_SENDER, message: `${title}: ${body}`, category });
  if (sent.includes('email')) forward(EMAIL_WEBHOOK, { to: c.email, subject: title, text: body, category });
  return sent;
}

export function listNotifications(customerId, { channel, limit = 100, offset = 0 } = {}) {
  const where = channel ? `WHERE customer_id = ? AND channel = ?` : `WHERE customer_id = ?`;
  const params = channel ? [customerId, channel] : [customerId];
  return q(`SELECT * FROM notifications ${where} ORDER BY id DESC LIMIT ? OFFSET ?`, ...params, limit, offset);
}
export const unreadCount = customerId =>
  q1(`SELECT COUNT(*) n FROM notifications WHERE customer_id = ? AND channel = 'inapp' AND read_at IS NULL`, customerId).n;

export function markRead(customerId, id) {
  run(`UPDATE notifications SET read_at = datetime('now') WHERE customer_id = ? AND id = ?`, customerId, id);
}
export function markAllRead(customerId) {
  run(`UPDATE notifications SET read_at = datetime('now') WHERE customer_id = ? AND channel = 'inapp' AND read_at IS NULL`, customerId);
}

/* Scheduled job: repayment reminders + overdue penalties.
   Runs on boot and every 6 hours. Idempotent per loan/day. */
export function runReminderJob() {
  const today = new Date().toISOString().slice(0, 10);
  const loans = q(`SELECT l.*, c.id cid FROM loans l JOIN customers c ON c.id = l.customer_id WHERE l.status = 'active'`);
  let reminders = 0, penalties = 0;
  for (const l of loans) {
    // upcoming reminder (3 days before)
    if (l.next_due_date) {
      const days = Math.round((new Date(l.next_due_date) - new Date(today)) / 86400000);
      const key = `reminded_${l.id}_${l.next_due_date}`;
      const already = q1(`SELECT 1 x FROM integration_state WHERE key = ?`, key);
      if (days >= 0 && days <= 3 && !already) {
        notify(l.cid, { category: 'reminder', title: 'Upcoming repayment', body: `Your instalment of MK ${Math.round(l.next_due_amount).toLocaleString()} on loan ${l.ref} is due on ${l.next_due_date}. Pay from your portal to keep your record clean.`, channels: ['inapp', 'sms', 'email'] });
        run(`INSERT OR REPLACE INTO integration_state(key, value) VALUES(?, ?)`, key, today);
        reminders++;
      }
      // overdue penalty after grace
      if (days < -3) {
        const pkey = `penalty_${l.id}_${l.next_due_date}`;
        const done = q1(`SELECT 1 x FROM integration_state WHERE key = ?`, pkey);
        if (!done) {
          const penalty = Math.round(l.next_due_amount * 0.02 * 100) / 100;
          run(`UPDATE loans SET penalties = penalties + ?, updated_at = datetime('now') WHERE id = ?`, penalty, l.id);
          run(`INSERT INTO transactions(ref, customer_id, loan_id, type, amount, status, meta) VALUES(?,?,?,?,?,?,?)`,
            `PEN-${l.id}-${l.next_due_date.replace(/-/g, '')}`, l.cid, l.id, 'penalty', penalty, 'verified', JSON.stringify({ reason: 'Late payment penalty (2% of overdue instalment)' }));
          notify(l.cid, { category: 'overdue', title: 'Overdue repayment', body: `Instalment due ${l.next_due_date} on loan ${l.ref} is overdue. A late penalty of MK ${penalty.toLocaleString()} has been applied. Please pay or contact support.`, channels: ['inapp', 'sms', 'email'] });
          run(`INSERT OR REPLACE INTO integration_state(key, value) VALUES(?, ?)`, pkey, today);
          penalties++;
        }
      }
    }
  }
  return { reminders, penalties };
}
