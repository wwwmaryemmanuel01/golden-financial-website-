import crypto from 'node:crypto';
import { q, q1, run } from './db.js';
import { SYSTEM_API_URL, INTEGRATION_KEY } from './config.js';
export function enqueue(entity, entityId, payload) {
  const eventId = crypto.randomUUID();
  run(`INSERT INTO integration_outbox(event_id,entity,entity_id,payload) VALUES(?,?,?,?)`, eventId, entity, entityId, JSON.stringify({ eventId, occurredAt: new Date().toISOString(), ...payload }));
  return eventId;
}
export async function flushOutbox() {
  if (!SYSTEM_API_URL || !INTEGRATION_KEY) return { sent: 0, pending: q1(`SELECT COUNT(*) n FROM integration_outbox WHERE status IN ('pending','retry')`).n };
  const url = new URL(SYSTEM_API_URL);
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('The system connector requires an HTTPS endpoint without embedded credentials.');
  let sent = 0;
  for (const e of q(`SELECT * FROM integration_outbox WHERE status IN ('pending','retry') AND attempts<8 ORDER BY id LIMIT 25`)) {
    try {
      const timestamp = String(Math.floor(Date.now() / 1000));
      const signature = crypto.createHmac('sha256', INTEGRATION_KEY).update(`${timestamp}.${e.payload}`).digest('hex');
      const res = await fetch(url, { method: 'POST', redirect: 'error', headers: { 'Content-Type': 'application/json', 'X-GFS-Timestamp': timestamp, 'X-GFS-Signature': `sha256=${signature}`, 'Idempotency-Key': e.event_id }, body: e.payload, signal: AbortSignal.timeout(10000) });
      if (!res.ok) throw new Error(`System returned HTTP ${res.status}`);
      run(`UPDATE integration_outbox SET status='delivered',attempts=attempts+1,delivered_at=datetime('now'),last_error=NULL WHERE id=?`, e.id);
      run(`INSERT INTO integration_state(key,value) VALUES('last_success',datetime('now')) ON CONFLICT(key) DO UPDATE SET value=excluded.value`);
      sent++;
    } catch (err) {
      run(`UPDATE integration_outbox SET status=CASE WHEN attempts>=7 THEN 'failed' ELSE 'retry' END,attempts=attempts+1,last_error=? WHERE id=?`, String(err.message).slice(0, 250), e.id);
    }
  }
  return { sent };
}
