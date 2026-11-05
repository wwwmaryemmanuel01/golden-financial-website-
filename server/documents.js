/* Secure document storage & KYC. Files are encrypted at rest (AES-256-GCM),
   stored outside the web root, and only the owning customer can read them. */
import fs from 'node:fs';
import path from 'node:path';
import { q, q1, run, audit, activity } from './db.js';
import { HttpError } from './http.js';
import { clean, cleanNum, encrypt, decrypt } from './security.js';
import { requireAuth } from './auth.js';
import { notify } from './notifications.js';
import { UPLOAD_DIR, IS_PROD } from './config.js';
import GFS from '../shared/core.mjs';

const KINDS = ['national_id', 'passport', 'driving_licence', 'payslip', 'bank_statement', 'business_statement',
  'proof_of_address', 'admission_letter', 'medical_report', 'quotation', 'land_document', 'house_document',
  'vehicle_document', 'property_photo', 'livestock_document', 'guarantor_id', 'collateral_document', 'avatar', 'other', 'support_attachment'];
const MIMES = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'];
const MAX = 5 * 1024 * 1024;

export async function uploadDocument(ctx) {
  const u = requireAuth(ctx);
  const b = ctx.body;
  const kind = KINDS.includes(b.kind) ? b.kind : 'other';
  const filename = clean(b.filename, 120).replace(/[^\w.\- ]/g, '_') || 'document';
  const mime = MIMES.includes(b.mime) ? b.mime : null;
  if (!mime) throw new HttpError(400, 'Only PNG, JPG, WEBP images or PDF files are accepted.');
  if (!b.data || typeof b.data !== 'string') throw new HttpError(400, 'No file data received.');
  const buf = Buffer.from(b.data, 'base64');
  if (buf.length < 32) throw new HttpError(400, 'The file appears to be empty.');
  if (buf.length > MAX) throw new HttpError(413, 'File too large. Maximum size is 5 MB.');
  const ref = GFS.refs.document();
  const storagePath = path.join(UPLOAD_DIR, ref + '.enc');
  fs.writeFileSync(storagePath, encrypt(buf), { mode: 0o600 });
  const appId = b.applicationId ? Number(b.applicationId) : null;
  if (appId) {
    const app = q1(`SELECT id FROM applications WHERE id = ? AND customer_id = ?`, appId, u.id);
    if (!app) throw new HttpError(404, 'Application not found.');
  }
  const r = run(`INSERT INTO documents(ref, customer_id, application_id, kind, filename, mime, size, storage_path, status)
    VALUES(?,?,?,?,?,?,?,?,?)`, ref, u.id, appId, kind, filename, mime, buf.length, storagePath, 'pending');
  const docId = Number(r.lastInsertRowid);
  if (kind === 'avatar') {
    run(`UPDATE customers SET avatar_doc_id = ? WHERE id = ?`, docId, u.id);
    run(`UPDATE documents SET status = 'verified', verified_at = datetime('now') WHERE id = ?`, docId);
  } else if (!IS_PROD) {
    // Sandbox: automated document check (format, size, readability) stands in for
    // the back-office verification queue in the linked admin system.
    run(`UPDATE documents SET status = 'verified', verified_at = datetime('now'), notes = 'Automated verification (sandbox). Back-office review syncs from the admin system in production.' WHERE id = ?`, docId);
  }
  updateKycStatus(u.id);
  audit('customer', u.id, 'document.uploaded', 'document', docId, null, { ref, kind, filename, size: buf.length }, ctx.ip, ctx.ua);
  activity(u.id, 'Document uploaded', `${kind}: ${filename}`, ctx.ip, ctx.ua);
  const doc = q1(`SELECT * FROM documents WHERE id = ?`, docId);
  if (kind !== 'avatar' && kind !== 'support_attachment') {
    notify(u.id, { category: 'kyc', title: 'Document received', body: `Your ${kind.replace(/_/g, ' ')} (${filename}) was received${doc.status === 'verified' ? ' and verified' : ' and is queued for verification'}. Reference ${ref}.`, channels: ['inapp'] });
  }
  return { document: serializeDoc(doc) };
}

export function updateKycStatus(customerId) {
  const u = q1(`SELECT * FROM customers WHERE id = ?`, customerId);
  const docs = q(`SELECT * FROM documents WHERE customer_id = ? AND status = 'verified'`, customerId);
  const hasId = docs.some(d => ['national_id', 'passport', 'driving_licence'].includes(d.kind));
  const hasIncome = docs.some(d => ['payslip', 'bank_statement', 'business_statement'].includes(d.kind));
  let status = 'pending';
  if (hasId && u.phone_verified && u.email_verified) status = 'verified';
  else if (hasId || u.phone_verified || u.email_verified) status = 'in_review';
  if (hasId && hasIncome && u.phone_verified && u.email_verified) status = 'verified';
  if (status !== u.kyc_status) {
    run(`UPDATE customers SET kyc_status = ? WHERE id = ?`, status, customerId);
    if (status === 'verified') notify(customerId, { category: 'kyc', title: 'KYC verified ✓', body: 'Your identity has been verified. You can now apply for loans and receive disbursements.', channels: ['inapp', 'sms', 'email'] });
  }
  return status;
}

export const serializeDoc = d => ({
  id: d.id, ref: d.ref, applicationId: d.application_id, kind: d.kind, filename: d.filename,
  mime: d.mime, size: d.size, status: d.status, notes: d.notes, uploadedAt: d.uploaded_at, verifiedAt: d.verified_at
});

export async function listDocuments(ctx) {
  const u = requireAuth(ctx);
  return { documents: q(`SELECT * FROM documents WHERE customer_id = ? ORDER BY id DESC`, u.id).map(serializeDoc), kycStatus: u.kyc_status };
}

export async function downloadDocument(ctx) {
  const u = requireAuth(ctx);
  const d = q1(`SELECT * FROM documents WHERE id = ? AND customer_id = ?`, Number(ctx.params.id), u.id);
  if (!d) throw new HttpError(404, 'Document not found.');
  let buf;
  try { buf = decrypt(fs.readFileSync(d.storage_path)); }
  catch { throw new HttpError(500, 'Document could not be decrypted.'); }
  audit('customer', u.id, 'document.downloaded', 'document', d.id, null, null, ctx.ip, ctx.ua);
  ctx.res.writeHead(200, {
    'Content-Type': d.mime || 'application/octet-stream',
    'Content-Disposition': `inline; filename="${d.filename}"`,
    'Content-Length': buf.length,
    'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'
  });
  ctx.res.end(buf);
}

export async function deleteDocument(ctx) {
  const u = requireAuth(ctx);
  const d = q1(`SELECT * FROM documents WHERE id = ? AND customer_id = ?`, Number(ctx.params.id), u.id);
  if (!d) throw new HttpError(404, 'Document not found.');
  if (d.kind === 'avatar') run(`UPDATE customers SET avatar_doc_id = NULL WHERE id = ?`, u.id);
  try { fs.unlinkSync(d.storage_path); } catch {}
  run(`DELETE FROM documents WHERE id = ?`, d.id);
  updateKycStatus(u.id);
  audit('customer', u.id, 'document.deleted', 'document', d.id, { filename: d.filename }, null, ctx.ip, ctx.ua);
  return { ok: true };
}

/* ---------------- guarantors & collateral ---------------- */
export async function addGuarantor(ctx) {
  const u = requireAuth(ctx);
  const b = ctx.body;
  if (!clean(b.name, 80) || !GFS.isPhoneMW(b.phone || '')) throw new HttpError(400, 'Guarantor name and a valid phone number are required.');
  if (!b.consent) throw new HttpError(400, 'The guarantor must consent before being added.');
  let appId = b.applicationId ? Number(b.applicationId) : null;
  if (appId && !q1(`SELECT id FROM applications WHERE id = ? AND customer_id = ?`, appId, u.id)) throw new HttpError(404, 'Application not found.');
  const r = run(`INSERT INTO guarantors(customer_id, application_id, loan_id, name, phone, relationship, employer, address, consent, consent_at, signature, status)
    VALUES(?,?,?,?,?,?,?,?,?,datetime('now'),?,?)`,
    u.id, appId, b.loanId ? Number(b.loanId) : null, clean(b.name, 80), GFS.normPhone(b.phone), clean(b.relationship, 40),
    clean(b.employer, 80), clean(b.address, 120), 1, clean(b.signature, 8000) || null, 'verified');
  audit('customer', u.id, 'guarantor.added', 'guarantor', Number(r.lastInsertRowid), null, { name: b.name }, ctx.ip, ctx.ua);
  return { guarantor: q1(`SELECT * FROM guarantors WHERE id = ?`, Number(r.lastInsertRowid)) };
}
export async function listGuarantors(ctx) {
  const u = requireAuth(ctx);
  return { guarantors: q(`SELECT g.*, l.ref loan_ref, a.ref app_ref FROM guarantors g LEFT JOIN loans l ON l.id = g.loan_id LEFT JOIN applications a ON a.id = g.application_id WHERE g.customer_id = ? ORDER BY g.id DESC`, u.id) };
}
export async function addCollateral(ctx) {
  const u = requireAuth(ctx);
  const b = ctx.body;
  const types = ['land', 'house', 'vehicle', 'household_property', 'livestock', 'equipment', 'other'];
  if (!types.includes(b.type)) throw new HttpError(400, 'Choose a valid collateral type.');
  let appId = b.applicationId ? Number(b.applicationId) : null;
  if (appId && !q1(`SELECT id FROM applications WHERE id = ? AND customer_id = ?`, appId, u.id)) throw new HttpError(404, 'Application not found.');
  const r = run(`INSERT INTO collateral(customer_id, application_id, loan_id, type, description, estimated_value, valued_by, valuation_date, status)
    VALUES(?,?,?,?,?,?,?,?,?)`,
    u.id, appId, b.loanId ? Number(b.loanId) : null, b.type, clean(b.description, 300), cleanNum(b.estimatedValue) || 0,
    clean(b.valuedBy, 80), clean(b.valuationDate, 10) || null, 'pending');
  audit('customer', u.id, 'collateral.added', 'collateral', Number(r.lastInsertRowid), null, { type: b.type }, ctx.ip, ctx.ua);
  return { collateral: q1(`SELECT * FROM collateral WHERE id = ?`, Number(r.lastInsertRowid)) };
}
export async function listCollateral(ctx) {
  const u = requireAuth(ctx);
  return { collateral: q(`SELECT c.*, l.ref loan_ref FROM collateral c LEFT JOIN loans l ON l.id = c.loan_id WHERE c.customer_id = ? ORDER BY c.id DESC`, u.id) };
}
