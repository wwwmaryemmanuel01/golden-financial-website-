/* Non-destructive catalogue migration checks in an isolated SQLite database. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gfs-catalog-test-'));
process.env.GFS_DATA_DIR = dir;
process.env.GFS_DEMO_MODE = 'true';
process.env.GFS_SERVER_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const { db, q, q1, run, getSetting, setSetting } = await import('../server/db.js');
const { seedSettings, seedIfEmpty } = await import('../server/seed.js');
const { migrate } = await import('../server/migrations.js');
const catalog = await import('../server/catalog.js');
const { serializeLoan, serializeApp } = await import('../server/loans.js');
const GFS = (await import('../shared/core.mjs')).default;
const CONTENT = (await import('../shared/content.mjs')).default;
let checks = 0;
const check = (name, fn) => { fn(); checks++; console.log(`  ✓ ${name}`); };
try {
  seedSettings(); migrate(); seedIfEmpty();
  const customer = q1(`SELECT id FROM customers ORDER BY id LIMIT 1`);
  // Simulate a persisted ten-product catalogue and historical retired records.
  setSetting('products', [...GFS.PRODUCTS, ...GFS.ARCHIVED_PRODUCTS]);
  const appId = Number(run(`INSERT INTO applications(ref,customer_id,product_id,amount,term_months,purpose,status,stage) VALUES(?,?,?,?,?,?,?,?)`,
    'GLS-APP-LEGACY', customer.id, 'ED', 120000, 12, 'Historical education application', 'submitted', 'intake').lastInsertRowid);
  const loanId = Number(run(`INSERT INTO loans(ref,customer_id,application_id,product_id,principal,rate_monthly,fee_pct,fee_amount,term_months,installment,status,outstanding_principal,disbursed_at,environment) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'),?)`,
    'LN-LEGACY-ED', customer.id, appId, 'ED', 120000, 2, 1.5, 1800, 12, 11200, 'active', 100000, 'sandbox').lastInsertRowid);
  const counts = () => ({ customers: q1(`SELECT COUNT(*) n FROM customers`).n, applications: q1(`SELECT COUNT(*) n FROM applications`).n, loans: q1(`SELECT COUNT(*) n FROM loans`).n, transactions: q1(`SELECT COUNT(*) n FROM transactions`).n });
  const before = counts();
  check('legacy fixture starts with ten persisted products', () => assert.equal(catalog.products().length, 10));
  migrate();
  check('migration publishes exactly the five requested categories', () => assert.deepEqual(catalog.products().map(p => [p.id, p.name]), [['PL', 'Personal'], ['BL', 'Business'], ['SA', 'Salary Advance'], ['AL', 'Agriculture'], ['EL', 'Emergency']]));
  check('customer, application, loan and transaction records are preserved', () => assert.deepEqual(counts(), before));
  check('retired pending application is held for support, not auto-approved', () => { const a = q1(`SELECT * FROM applications WHERE id=?`, appId); assert.equal(a.status, 'under_review'); assert.match(a.decision_reason, /retired|no longer available/i); });
  check('historical retired loan remains serialisable', () => { const l = serializeLoan(q1(`SELECT * FROM loans WHERE id=?`, loanId)); assert.equal(l.productId, 'ED'); assert.equal(l.productName, 'Education Loans'); assert.ok(l.outstanding >= 0); });
  check('historical retired application remains serialisable', () => { const a = serializeApp(q1(`SELECT * FROM applications WHERE id=?`, appId)); assert.equal(a.productName, 'Education Loans'); });
  check('active catalogue rejects retired product lookup', () => assert.equal(catalog.product('ED'), undefined));
  check('record lookup can resolve archived definitions', () => assert.equal(catalog.recordProduct('ED').id, 'ED'));
  check('editorial defaults and dark header are seeded without touching loans', () => { assert.equal(getSetting('blog_posts').length, CONTENT.BLOG_POSTS.length); assert.equal(getSetting('theme').header, '#0F1115'); assert.deepEqual(counts(), before); });
  const retiredAudits = () => q1(`SELECT COUNT(*) n FROM audit_log WHERE action='application.product_retired'`).n;
  const firstAudits = retiredAudits();
  migrate();
  check('migration is idempotent', () => { assert.equal(catalog.products().length, 5); assert.deepEqual(counts(), before); assert.equal(retiredAudits(), firstAudits); });
  check('settings validation accepts the editorial library', () => assert.ok(catalog.validateSettingsPatch({ blog_posts: CONTENT.BLOG_POSTS })));
  check('settings validation rejects duplicate article slugs', () => assert.throws(() => catalog.validateSettingsPatch({ blog_posts: [CONTENT.BLOG_POSTS[0], CONTENT.BLOG_POSTS[0]] })));
  check('settings validation rejects retired product publication', () => assert.throws(() => catalog.validateSettingsPatch({ products: [...GFS.PRODUCTS, GFS.ARCHIVED_PRODUCTS[0]] })));
  console.log(`\n  ${checks} catalogue migration checks passed.\n`);
} finally {
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
}
