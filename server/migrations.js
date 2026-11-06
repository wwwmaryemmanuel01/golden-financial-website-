/* Idempotent migrations for existing customer databases; never discard customer data. */
import { db, q, q1, run, audit, getSetting, setSetting } from './db.js';
import GFS from '../shared/core.mjs';
import CONTENT from '../shared/content.mjs';
export function migrate() {
  const columns = (table, additions) => {
    const existing = new Set(q(`PRAGMA table_info(${table})`).map(c => c.name));
    for (const [name, definition] of Object.entries(additions)) if (!existing.has(name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
  };
  columns('sessions', { last_seen_at: "TEXT NOT NULL DEFAULT '2000-01-01 00:00:00'" });
  if (q(`PRAGMA table_info(sessions)`).some(c => c.name === 'last_seen')) run(`UPDATE sessions SET last_seen_at=last_seen WHERE last_seen_at='2000-01-01 00:00:00'`);
  columns('collateral', { valued_amount: 'REAL' });
  columns('loans', { total_principal_paid: 'REAL NOT NULL DEFAULT 0', interest_accrued_through: 'TEXT', interest_accrued_total: 'REAL NOT NULL DEFAULT 0', environment: "TEXT NOT NULL DEFAULT 'production'" });
  columns('schedule', { principal_paid: 'REAL NOT NULL DEFAULT 0', interest_paid: 'REAL NOT NULL DEFAULT 0', waived: 'REAL NOT NULL DEFAULT 0' });
  columns('transactions', { request_hash: 'TEXT', environment: "TEXT NOT NULL DEFAULT 'production'" });
  columns('notifications', { delivery_status: "TEXT NOT NULL DEFAULT 'not_configured'", provider_message_id: 'TEXT', delivered_at: 'TEXT', delivery_error: 'TEXT' });
  columns('otp_codes', { challenge_hash: 'TEXT', binding_hash: 'TEXT' });
  columns('documents', { checksum: 'TEXT' });
  columns('guarantors', { identity_doc_id: 'INTEGER', consent_evidence: 'TEXT' });
  columns('ticket_messages', { source: "TEXT NOT NULL DEFAULT 'system'" });
  columns('applications', { review_source: 'TEXT', offer_version: 'INTEGER NOT NULL DEFAULT 1' });
  db.exec(`
    CREATE TABLE IF NOT EXISTS ledger_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ref TEXT NOT NULL UNIQUE,
      customer_id INTEGER NOT NULL REFERENCES customers(id),
      loan_id INTEGER NOT NULL REFERENCES loans(id),
      transaction_id INTEGER REFERENCES transactions(id),
      bucket TEXT NOT NULL CHECK(bucket IN ('principal','interest','fees','penalties','interest_waiver')),
      delta_cents INTEGER NOT NULL,
      description TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_ledger_loan ON ledger_entries(loan_id, bucket);
    CREATE TABLE IF NOT EXISTS agreement_acceptances (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      application_id INTEGER NOT NULL UNIQUE REFERENCES applications(id),
      customer_id INTEGER NOT NULL REFERENCES customers(id),
      terms_json TEXT NOT NULL,
      terms_hash TEXT NOT NULL,
      signature_enc TEXT NOT NULL,
      signature_kind TEXT NOT NULL,
      ip TEXT, user_agent TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS integration_events (
      id TEXT PRIMARY KEY,
      payload_hash TEXT NOT NULL,
      event_type TEXT NOT NULL,
      result TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS integration_outbox (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id TEXT NOT NULL UNIQUE,
      entity TEXT NOT NULL,
      entity_id INTEGER NOT NULL,
      payload TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      delivered_at TEXT
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_loan_application ON loans(application_id) WHERE application_id IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_txn_provider ON transactions(provider, provider_ref) WHERE provider_ref IS NOT NULL;
    CREATE TRIGGER IF NOT EXISTS ledger_no_update BEFORE UPDATE ON ledger_entries BEGIN SELECT RAISE(ABORT, 'Ledger entries are append-only'); END;
    CREATE TRIGGER IF NOT EXISTS ledger_no_delete BEFORE DELETE ON ledger_entries BEGIN SELECT RAISE(ABORT, 'Ledger entries are append-only'); END;
    CREATE TRIGGER IF NOT EXISTS audit_no_update BEFORE UPDATE ON audit_log BEGIN SELECT RAISE(ABORT, 'Audit records are append-only'); END;
    CREATE TRIGGER IF NOT EXISTS audit_no_delete BEFORE DELETE ON audit_log BEGIN SELECT RAISE(ABORT, 'Audit records are append-only'); END;
    CREATE TRIGGER IF NOT EXISTS signature_no_update BEFORE UPDATE ON agreement_acceptances BEGIN SELECT RAISE(ABORT, 'Signed agreements are immutable'); END;
    CREATE TRIGGER IF NOT EXISTS signature_no_delete BEFORE DELETE ON agreement_acceptances BEGIN SELECT RAISE(ABORT, 'Signed agreements are immutable'); END;
  `);
  // Older repayments stored a single paid amount. Split it without changing totals.
  run(`UPDATE schedule SET interest_paid = MIN(paid, interest_part), principal_paid = MAX(0, MIN(principal_part, paid - interest_part)) WHERE paid > 0 AND principal_paid = 0 AND interest_paid = 0`);
  for (const l of q(`SELECT * FROM loans WHERE interest_accrued_through IS NULL`)) {
    const date = new Date().toISOString().slice(0, 10);
    const interest = Math.round((l.total_interest_paid + l.accrued_interest) * 100);
    run(`UPDATE loans SET interest_accrued_through = ?, interest_accrued_total = ?, environment = 'sandbox' WHERE id = ?`, date, interest / 100, l.id);
    const entries = [['principal', l.principal, 'Migrated opening principal'], ['interest', interest / 100, 'Migrated accrued interest'], ['fees', l.fees_outstanding, 'Migrated outstanding fees'], ['penalties', l.penalties, 'Migrated penalties'], ['principal', -l.total_repaid + l.total_interest_paid + l.total_fees_paid + l.total_penalties_paid, 'Migrated principal repayments'], ['interest', -l.total_interest_paid, 'Migrated interest repayments'], ['fees', -l.total_fees_paid, 'Migrated fee repayments'], ['penalties', -l.total_penalties_paid, 'Migrated penalty repayments']];
    for (const [bucket, amount, description] of entries) if (Math.round(amount * 100)) run(`INSERT INTO ledger_entries(ref,customer_id,loan_id,bucket,delta_cents,description) VALUES(?,?,?,?,?,?)`, `MIG-${l.id}-${bucket}-${description.replaceAll(' ', '-')}`, l.customer_id, l.id, bucket, Math.round(amount * 100), description);
    audit('system', null, 'migration.ledger_opening', 'loan', l.id, null, { date, interest }, null, null);
  }
  run(`UPDATE notifications SET delivery_status = 'not_configured' WHERE channel != 'inapp' AND delivery_status = 'not_configured'`);
  run(`UPDATE notifications SET delivery_status = 'delivered' WHERE channel = 'inapp'`);
  // Sample passwords and documents must never be mistaken for a live customer book.
  run(`UPDATE transactions SET environment = 'sandbox' WHERE json_extract(meta, '$.sandbox') = 1`);
  // Withdraw retired categories without deleting or rewriting any loan/application.
  const storedProducts = getSetting('products');
  if (Array.isArray(storedProducts)) {
    const published = GFS.PRODUCTS.map(base => {
      const prior = storedProducts.find(p => p.id === base.id);
      return prior ? { ...base, ...prior, id: base.id, name: base.name, label: base.label } : { ...base };
    });
    if (JSON.stringify(storedProducts) !== JSON.stringify(published)) {
      setSetting('products', published);
      setSetting('catalog_version', GFS.CATALOG_VERSION);
      setSetting('config_version', getSetting('config_version', 1) + 1);
      audit('system', null, 'catalog.five_categories', 'settings', 'products', { ids: storedProducts.map(p => p.id) }, { ids: published.map(p => p.id), retainedRecords: true }, null, null);
    }
  }
  if (!getSetting('blog_posts')) setSetting('blog_posts', CONTENT.BLOG_POSTS);
  const theme = getSetting('theme', {});
  const darkHeader = { header: '#0F1115', headerSurface: '#171A21', headerBorder: '#23262E', headerGold: '#E4C264' };
  if (Object.entries(darkHeader).some(([k,v]) => theme[k] !== v)) setSetting('theme', { ...theme, ...darkHeader });
  // A retired pending application needs human guidance, not a broken automatic review.
  const retiredIds = GFS.ARCHIVED_PRODUCTS.map(p => p.id);
  const placeholders = retiredIds.map(() => '?').join(',');
  for (const a of q(`SELECT id,ref,product_id FROM applications WHERE status IN ('submitted','pending_documents','under_review','approved','agreement_accepted') AND product_id IN (${placeholders}) AND (decision_reason IS NULL OR decision_reason NOT LIKE 'This product is no longer available%')`, ...retiredIds)) {
    const reason = 'This product is no longer available for new applications. Your record is retained; contact support to review an available category. No automatic approval or disbursement will be made.';
    run(`UPDATE applications SET status='under_review',stage='verification',decision_reason=?,updated_at=datetime('now') WHERE id=?`, reason, a.id);
    audit('system', null, 'application.product_retired', 'application', a.id, { productId: a.product_id }, { reason }, null, null);
  }
}
