/* Central database — every customer module reads/writes this one SQLite file.
   Node 22 built-in node:sqlite (no native deps). WAL mode, foreign keys on. */
import { DatabaseSync } from 'node:sqlite';
import { DB_PATH } from './config.js';

export const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA busy_timeout = 5000;');

db.exec(`
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS sequences (
  name TEXT PRIMARY KEY,
  value INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_no TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  phone TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'customer',
  status TEXT NOT NULL DEFAULT 'active',
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  dob TEXT, gender TEXT, marital_status TEXT,
  national_id_enc TEXT, id_type TEXT DEFAULT 'national_id',
  district TEXT, city TEXT, area TEXT, address_line TEXT,
  employment TEXT DEFAULT '{}',
  business TEXT DEFAULT '{}',
  monthly_income REAL DEFAULT 0, monthly_expenses REAL DEFAULT 0, other_income REAL DEFAULT 0,
  next_of_kin TEXT DEFAULT '{}',
  avatar_doc_id INTEGER,
  kyc_status TEXT NOT NULL DEFAULT 'pending',
  email_verified INTEGER NOT NULL DEFAULT 0,
  phone_verified INTEGER NOT NULL DEFAULT 0,
  twofa_enabled INTEGER NOT NULL DEFAULT 0,
  prefs TEXT NOT NULL DEFAULT '{}',
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  last_login_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token_hash TEXT UNIQUE NOT NULL,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  ip TEXT, user_agent TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  revoked INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS otp_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER REFERENCES customers(id) ON DELETE CASCADE,
  target TEXT NOT NULL,
  purpose TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'sms',
  code_hash TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  consumed INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS password_resets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token_hash TEXT UNIQUE NOT NULL,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  used INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS applications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ref TEXT UNIQUE NOT NULL,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL,
  amount REAL NOT NULL,
  term_months INTEGER NOT NULL,
  freq TEXT NOT NULL DEFAULT 'monthly',
  purpose TEXT,
  status TEXT NOT NULL DEFAULT 'submitted',
  stage TEXT NOT NULL DEFAULT 'intake',
  decision_reason TEXT,
  assessment TEXT DEFAULT '{}',
  offer TEXT,
  income REAL DEFAULT 0, expenses REAL DEFAULT 0,
  agreement_accepted_at TEXT, agreement_signature TEXT, agreement_name TEXT, agreement_id_number TEXT,
  disbursement_method TEXT, disbursement_account TEXT,
  timeline TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS loans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ref TEXT UNIQUE NOT NULL,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  application_id INTEGER REFERENCES applications(id),
  product_id TEXT NOT NULL,
  principal REAL NOT NULL,
  rate_monthly REAL NOT NULL,
  fee_pct REAL NOT NULL,
  fee_amount REAL NOT NULL DEFAULT 0,
  term_months INTEGER NOT NULL,
  freq TEXT NOT NULL DEFAULT 'monthly',
  installment REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  disbursed_at TEXT, disbursement_ref TEXT, disbursement_method TEXT, net_disbursed REAL,
  outstanding_principal REAL NOT NULL,
  accrued_interest REAL NOT NULL DEFAULT 0,
  fees_outstanding REAL NOT NULL DEFAULT 0,
  penalties REAL NOT NULL DEFAULT 0,
  credit_balance REAL NOT NULL DEFAULT 0,
  total_repaid REAL NOT NULL DEFAULT 0,
  total_interest_paid REAL NOT NULL DEFAULT 0,
  total_principal_paid REAL NOT NULL DEFAULT 0,
  total_fees_paid REAL NOT NULL DEFAULT 0,
  total_penalties_paid REAL NOT NULL DEFAULT 0,
  next_due_date TEXT, next_due_amount REAL,
  future_interest REAL NOT NULL DEFAULT 0,
  closed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS schedule (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  loan_id INTEGER NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
  no INTEGER NOT NULL,
  due_date TEXT NOT NULL,
  opening REAL NOT NULL,
  installment REAL NOT NULL,
  principal_part REAL NOT NULL,
  interest_part REAL NOT NULL,
  closing REAL NOT NULL,
  paid REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  paid_at TEXT,
  UNIQUE(loan_id, no)
);
CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ref TEXT UNIQUE NOT NULL,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  loan_id INTEGER REFERENCES loans(id),
  type TEXT NOT NULL,
  method TEXT, provider TEXT, provider_ref TEXT,
  amount REAL NOT NULL,
  allocation TEXT DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending',
  receipt_id INTEGER,
  idempotency_key TEXT UNIQUE,
  failure_reason TEXT,
  meta TEXT DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  verified_at TEXT
);
CREATE TABLE IF NOT EXISTS receipts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ref TEXT UNIQUE NOT NULL,
  transaction_id INTEGER NOT NULL REFERENCES transactions(id),
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  loan_id INTEGER REFERENCES loans(id),
  amount REAL NOT NULL,
  method TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ref TEXT UNIQUE NOT NULL,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  application_id INTEGER REFERENCES applications(id),
  kind TEXT NOT NULL,
  filename TEXT NOT NULL,
  mime TEXT, size INTEGER,
  storage_path TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  notes TEXT,
  uploaded_at TEXT NOT NULL DEFAULT (datetime('now')),
  verified_at TEXT
);
CREATE TABLE IF NOT EXISTS guarantors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  application_id INTEGER REFERENCES applications(id),
  loan_id INTEGER REFERENCES loans(id),
  name TEXT NOT NULL, phone TEXT NOT NULL,
  national_id_enc TEXT, relationship TEXT, employer TEXT, address TEXT,
  consent INTEGER NOT NULL DEFAULT 0, consent_at TEXT, signature TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS collateral (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  application_id INTEGER REFERENCES applications(id),
  loan_id INTEGER REFERENCES loans(id),
  type TEXT NOT NULL, description TEXT,
  estimated_value REAL DEFAULT 0, valued_by TEXT, valuation_date TEXT,
  doc_refs TEXT DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'pending',
  released_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  channel TEXT NOT NULL DEFAULT 'inapp',
  category TEXT NOT NULL DEFAULT 'general',
  title TEXT NOT NULL, body TEXT NOT NULL,
  read_at TEXT,
  meta TEXT DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ref TEXT UNIQUE NOT NULL,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  priority TEXT NOT NULL DEFAULT 'normal',
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS ticket_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  sender TEXT NOT NULL,
  sender_name TEXT,
  body TEXT NOT NULL,
  attachment_doc_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  sender TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ref TEXT UNIQUE NOT NULL,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  loan_id INTEGER REFERENCES loans(id),
  type TEXT NOT NULL,
  payload TEXT DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending',
  response TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS announcements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL, body TEXT NOT NULL,
  category TEXT DEFAULT 'general',
  pinned INTEGER NOT NULL DEFAULT 0,
  published_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_type TEXT NOT NULL,
  actor_id INTEGER,
  action TEXT NOT NULL,
  entity TEXT, entity_id TEXT,
  before_json TEXT, after_json TEXT,
  ip TEXT, user_agent TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS activity_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  action TEXT NOT NULL, detail TEXT,
  ip TEXT, user_agent TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS integration_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_loans_customer ON loans(customer_id);
CREATE INDEX IF NOT EXISTS idx_apps_customer ON applications(customer_id);
CREATE INDEX IF NOT EXISTS idx_txn_customer ON transactions(customer_id);
CREATE INDEX IF NOT EXISTS idx_txn_loan ON transactions(loan_id);
CREATE INDEX IF NOT EXISTS idx_notif_customer ON notifications(customer_id);
CREATE INDEX IF NOT EXISTS idx_docs_customer ON documents(customer_id);
CREATE INDEX IF NOT EXISTS idx_schedule_loan ON schedule(loan_id);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity, entity_id);
CREATE INDEX IF NOT EXISTS idx_activity_customer ON activity_log(customer_id);
`);

/* ---------------- helpers ---------------- */
export const q = (sql, ...params) => db.prepare(sql).all(...params);
export const q1 = (sql, ...params) => db.prepare(sql).get(...params);
export const run = (sql, ...params) => db.prepare(sql).run(...params);
export const nowISO = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
let txDepth = 0;
export const tx = fn => {
  if (txDepth > 0) return fn();           // nested calls join the outer transaction
  txDepth++;
  db.exec('BEGIN');
  try { const r = fn(); db.exec('COMMIT'); return r; }
  catch (e) { db.exec('ROLLBACK'); throw e; }
  finally { txDepth--; }
};

export function nextSeq(name) {
  run(`INSERT INTO sequences(name, value) VALUES(?, 1) ON CONFLICT(name) DO UPDATE SET value = value + 1`, name);
  return q1(`SELECT value FROM sequences WHERE name = ?`, name).value;
}
export function getSetting(key, fallback = null) {
  const row = q1(`SELECT value FROM settings WHERE key = ?`, key);
  if (!row) return fallback;
  try { return JSON.parse(row.value); } catch { return row.value; }
}
export function setSetting(key, value) {
  run(`INSERT INTO settings(key, value, updated_at) VALUES(?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`, key, JSON.stringify(value));
}
export function audit(actorType, actorId, action, entity, entityId, before, after, ip, ua) {
  run(`INSERT INTO audit_log(actor_type, actor_id, action, entity, entity_id, before_json, after_json, ip, user_agent)
       VALUES(?,?,?,?,?,?,?,?,?)`,
    actorType, actorId ?? null, action, entity ?? null, entityId != null ? String(entityId) : null,
    before ? JSON.stringify(before) : null, after ? JSON.stringify(after) : null, ip ?? null, ua ?? null);
}
export function activity(customerId, action, detail, ip, ua) {
  run(`INSERT INTO activity_log(customer_id, action, detail, ip, user_agent) VALUES(?,?,?,?,?)`,
    customerId, action, detail ?? null, ip ?? null, ua ?? null);
}
export const json = (s, fallback = {}) => { try { const v = JSON.parse(s); return v == null ? fallback : v; } catch { return fallback; } };
