/* Verified account activity received from the signed administration connector.
   This ledger is read-only for customers. It never initiates or invents money
   movement; it records what an authorised back-office system reports. */
import { q, q1, run, activity } from './db.js';
import { HttpError } from './http.js';
import { clean } from './security.js';
import { requireAuth } from './auth.js';
import { notify } from './notifications.js';
import { cents, money } from './finance.js';
import { DEMO_MODE } from './config.js';
import GFS from '../shared/core.mjs';

export const ACTIVITY_TYPES = Object.freeze({
  deposit: { label: 'Deposit', category: 'deposit' },
  withdrawal: { label: 'Withdrawal', category: 'withdrawal' },
  savings_deposit: { label: 'Savings deposit', category: 'savings' },
  savings_withdrawal: { label: 'Savings withdrawal', category: 'savings' },
  savings_interest: { label: 'Savings interest', category: 'savings' }
});
const serialize = a => ({ id:a.id, type:a.type, label:ACTIVITY_TYPES[a.type]?.label || a.type, amount:a.amount, reference:a.reference, status:a.status, accountRef:a.account_ref, balanceAfter:a.balance_after, description:a.description, source:a.source, environment:a.environment, occurredAt:a.occurred_at, createdAt:a.created_at });
export function recordAccountActivity(customerId, p) {
  const type = clean(p.activity || p.activityType, 40), info = ACTIVITY_TYPES[type];
  if (!info) throw new HttpError(400, 'Unsupported account activity. Use deposit, withdrawal, savings_deposit, savings_withdrawal or savings_interest.');
  const reference = clean(p.reference, 150), status = p.status || 'completed';
  if (reference.length < 3) throw new HttpError(400, 'An activity reference of at least 3 characters is required.');
  if (!['completed','rejected','pending'].includes(status)) throw new HttpError(400, 'Activity status must be completed, rejected or pending.');
  const amount = money(p.amount);
  if (!Number.isFinite(amount) || cents(amount) <= 0 || cents(amount) > 1e14) throw new HttpError(400, 'Activity amount must be greater than zero.');
  const occurredAt = p.occurredAt ? new Date(p.occurredAt) : new Date();
  if (!Number.isFinite(occurredAt.getTime()) || occurredAt.getTime() > Date.now() + 300000) throw new HttpError(400, 'Activity date is invalid or in the future.');
  const balanceAfter = p.balanceAfter == null || p.balanceAfter === '' ? null : Number(p.balanceAfter);
  if (balanceAfter != null && (!Number.isFinite(balanceAfter) || Math.abs(balanceAfter) > 1e12)) throw new HttpError(400, 'Invalid reported balance.');
  const accountRef = clean(p.accountRef, 100) || null, description = clean(p.description, 1000) || null;
  const prior = q1(`SELECT * FROM account_activities WHERE source='system' AND reference=? AND status=?`, reference, status);
  if (prior) {
    if (prior.customer_id !== customerId || prior.type !== type || cents(prior.amount) !== cents(amount)) throw new HttpError(409, 'Activity reference was already used for different details.');
    return { activityId:prior.id, reference, status, duplicate:true };
  }
  const id = Number(run(`INSERT INTO account_activities(customer_id,type,amount,reference,status,account_ref,balance_after,description,source,environment,occurred_at) VALUES(?,?,?,?,?,?,?,?,'system',?,?)`, customerId,type,amount,reference,status,accountRef,balanceAfter,description,DEMO_MODE?'sandbox':'production',occurredAt.toISOString()).lastInsertRowid);
  const verb = status === 'completed' ? 'confirmed' : status === 'rejected' ? 'rejected' : 'received for review';
  const prefix = DEMO_MODE ? 'Sandbox · ' : '';
  notify(customerId, { category:info.category, title:`${prefix}${info.label} ${verb}`, body:`${prefix}${GFS.mk2(amount)} · ${reference}. ${description || (status === 'completed' ? 'Recorded by the administration system.' : status === 'rejected' ? 'The administration system rejected this activity.' : 'Awaiting administration confirmation; no balance change is implied.')}`, meta:{ activityId:id, reference, type, amount, status, link:'/portal/account-activity' }, eventKey:`account:${reference}:${status}` });
  activity(customerId, `${info.label} ${verb}`, `${reference} · ${GFS.mk2(amount)}`, null, 'administration-connector');
  return { activityId:id, reference, status };
}
export async function listAccountActivity(ctx) {
  const u = requireAuth(ctx), type = ctx.url.searchParams.get('type'), status = ctx.url.searchParams.get('status');
  let sql = `SELECT * FROM account_activities WHERE customer_id=?`; const params = [u.id];
  if (type) { if (!ACTIVITY_TYPES[type]) throw new HttpError(400, 'Unknown activity type.'); sql += ` AND type=?`; params.push(type); }
  if (status) { if (!['completed','rejected','pending'].includes(status)) throw new HttpError(400, 'Unknown activity status.'); sql += ` AND status=?`; params.push(status); }
  return { activities:q(sql + ` ORDER BY occurred_at DESC,id DESC LIMIT 300`, ...params).map(serialize), source:'backend', sandbox:DEMO_MODE, note:'Read-only records reported by the signed administration connector. Pending or rejected items do not confirm a balance change.' };
}
