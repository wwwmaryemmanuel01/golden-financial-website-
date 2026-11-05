/* Encrypted document storage with ownership checks and real file signatures.
   Storing a file is not identity verification. Only the system connector can
   mark KYC, guarantor identity or collateral valuation as verified. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { q, q1, run, nextSeq, audit, activity } from './db.js';
import { HttpError } from './http.js';
import { clean, encrypt, decrypt, encryptText } from './security.js';
import { requireAuth } from './auth.js';
import { UPLOAD_DIR } from './config.js';
import { notify } from './notifications.js';
import GFS from '../shared/core.mjs';
const KINDS = ['national_id', 'passport', 'driving_licence', 'payslip', 'bank_statement', 'business_statement', 'proof_of_address', 'business_registration', 'admission_letter', 'medical_report', 'supplier_invoice', 'property_title', 'valuation_report', 'guarantor_id', 'guarantor_consent', 'collateral_document', 'other', 'avatar'];
function inspectFile(buffer, mime) {
  if (buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return { mime: 'image/png', image: true };
  if (buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255) return { mime: 'image/jpeg', image: true };
  if (buffer.subarray(0, 5).toString() === '%PDF-' && buffer.subarray(-1024).includes(Buffer.from('%%EOF'))) return { mime: 'application/pdf', image: false };
  throw new HttpError(400, 'Upload a genuine PDF, PNG or JPEG file. Renamed or unsupported files are rejected.');
}
const serialize = d => ({ id: d.id, ref: d.ref, kind: d.kind, filename: d.filename, mime: d.mime, size: d.size, status: d.status, notes: d.notes, applicationId: d.application_id, uploadedAt: d.uploaded_at, verifiedAt: d.verified_at });
export async function listDocuments(ctx) { const u = requireAuth(ctx); return { documents: q(`SELECT * FROM documents WHERE customer_id=? ORDER BY id DESC`, u.id).map(serialize) }; }
export async function uploadDocument(ctx) {
  const u = requireAuth(ctx), b = ctx.body, kind = clean(b.kind, 40);
  if (!KINDS.includes(kind)) throw new HttpError(400, 'Unsupported document type.');
  const applicationId = b.applicationId ? Number(b.applicationId) : null;
  if (applicationId && !q1(`SELECT id FROM applications WHERE id=? AND customer_id=?`, applicationId, u.id)) throw new HttpError(404, 'Application not found.');
  const encoded = String(b.data || '').replace(/^data:[^;]+;base64,/, '');
  if (encoded.length > 11 * 1024 * 1024) throw new HttpError(413, 'Document exceeds the 8 MB limit.');
  const buffer = Buffer.from(encoded, 'base64');
  if (!buffer.length || buffer.length > 8 * 1024 * 1024) throw new HttpError(400, 'Choose a non-empty file up to 8 MB.');
  const type = inspectFile(buffer, b.mime);
  if (kind === 'avatar' && !type.image) throw new HttpError(400, 'Profile photos must be PNG or JPEG images.');
  const ref = GFS.refs.document(), filename = clean(b.filename, 180).replace(/[\\/\x00-\x1f]/g, '_') || `${kind}.${type.image ? 'png' : 'pdf'}`;
  const storagePath = `${ref}.enc`, checksum = crypto.createHash('sha256').update(buffer).digest('hex');
  fs.writeFileSync(path.join(UPLOAD_DIR, storagePath), encrypt(buffer), { mode: 0o600 });
  try {
    const id = Number(run(`INSERT INTO documents(ref,customer_id,application_id,kind,filename,mime,size,storage_path,status,checksum) VALUES(?,?,?,?,?,?,?,?,?,?)`, ref, u.id, applicationId, kind, filename, type.mime, buffer.length, storagePath, kind === 'avatar' ? 'stored' : 'pending', checksum).lastInsertRowid);
    if (kind === 'avatar') {
      const old = u.avatar_doc_id ? q1(`SELECT * FROM documents WHERE id=? AND customer_id=?`, u.avatar_doc_id, u.id) : null;
      run(`UPDATE customers SET avatar_doc_id=? WHERE id=?`, id, u.id);
      if (old) { try { fs.unlinkSync(path.join(UPLOAD_DIR, old.storage_path)); } catch {} run(`DELETE FROM documents WHERE id=?`, old.id); }
    }
    audit('customer', u.id, 'document.uploaded', 'document', id, null, { kind, checksum, size: buffer.length }, ctx.ip, ctx.ua);
    activity(u.id, 'Document uploaded', filename, ctx.ip, ctx.ua);
    if (kind !== 'avatar') notify(u.id, { category: 'document', title: 'Document received', body: `${filename} was securely stored and is awaiting review. Upload alone does not verify your identity.`, channels: ['inapp'] });
    return { document: serialize(q1(`SELECT * FROM documents WHERE id=?`, id)) };
  } catch (e) { try { fs.unlinkSync(path.join(UPLOAD_DIR, storagePath)); } catch {} throw e; }
}
export async function downloadDocument(ctx) {
  const u = requireAuth(ctx), d = q1(`SELECT * FROM documents WHERE id=? AND customer_id=?`, Number(ctx.params.id), u.id);
  if (!d) throw new HttpError(404, 'Document not found.');
  let data; try { data = decrypt(fs.readFileSync(path.join(UPLOAD_DIR, d.storage_path))); } catch { throw new HttpError(500, 'This document could not be decrypted. Contact support.'); }
  if (d.checksum && crypto.createHash('sha256').update(data).digest('hex') !== d.checksum) throw new HttpError(500, 'Document integrity check failed. Contact support.');
  audit('customer', u.id, 'document.downloaded', 'document', d.id, null, null, ctx.ip, ctx.ua);
  ctx.res.writeHead(200, { 'Content-Type': d.mime, 'Content-Length': data.length, 'Content-Disposition': `${d.kind === 'avatar' ? 'inline' : 'attachment'}; filename="${d.ref}.${d.mime === 'application/pdf' ? 'pdf' : d.mime === 'image/png' ? 'png' : 'jpg'}"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox" });
  ctx.res.end(data);
}
export async function deleteDocument(ctx) {
  const u = requireAuth(ctx), d = q1(`SELECT * FROM documents WHERE id=? AND customer_id=?`, Number(ctx.params.id), u.id);
  if (!d) throw new HttpError(404, 'Document not found.');
  if (d.kind === 'avatar' || d.status === 'verified' || (d.application_id && q1(`SELECT status FROM applications WHERE id=?`, d.application_id)?.status === 'disbursed')) throw new HttpError(409, 'This document is part of a retained record and cannot be deleted here.');
  fs.unlinkSync(path.join(UPLOAD_DIR, d.storage_path)); run(`DELETE FROM documents WHERE id=?`, d.id);
  audit('customer', u.id, 'document.deleted', 'document', d.id, { ref: d.ref, filename: d.filename }, null, ctx.ip, ctx.ua); return { ok: true };
}
export async function addGuarantor(ctx) {
  const u = requireAuth(ctx), b = ctx.body, name = clean(b.name, 120), phone = GFS.normPhone(clean(b.phone, 25));
  if (name.length < 3 || !GFS.isPhoneMW(phone)) throw new HttpError(400, 'Enter the guarantor’s full name and a valid Malawi phone number.');
  if (phone === u.phone) throw new HttpError(400, 'You cannot guarantee your own application.');
  const applicationId = b.applicationId ? Number(b.applicationId) : null;
  if (applicationId && !q1(`SELECT id FROM applications WHERE id=? AND customer_id=? AND status NOT IN ('disbursed','cancelled','rejected')`, applicationId, u.id)) throw new HttpError(400, 'Invalid application.');
  const docId = b.consentDocumentId ? Number(b.consentDocumentId) : null;
  if (docId && !q1(`SELECT id FROM documents WHERE id=? AND customer_id=? AND kind='guarantor_consent'`, docId, u.id)) throw new HttpError(400, 'Upload a signed guarantor-consent document first.');
  if (b.identityDocumentId && !q1(`SELECT id FROM documents WHERE id=? AND customer_id=? AND kind='guarantor_id'`, Number(b.identityDocumentId), u.id)) throw new HttpError(400, 'Invalid guarantor identity document.');
  const id = Number(run(`INSERT INTO guarantors(customer_id,application_id,name,phone,national_id_enc,relationship,employer,address,consent,consent_at,status,identity_doc_id,consent_evidence) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`, u.id, applicationId, name, phone, b.nationalId ? encryptText(clean(b.nationalId, 40)) : null, clean(b.relationship, 60), clean(b.employer, 120), clean(b.address, 200), docId ? 1 : 0, docId ? new Date().toISOString() : null, docId ? 'consent_document_received' : 'awaiting_consent', b.identityDocumentId ? Number(b.identityDocumentId) : null, docId ? `document:${docId}` : null).lastInsertRowid);
  audit('customer', u.id, 'guarantor.added', 'guarantor', id, null, { name, applicationId }, ctx.ip, ctx.ua);
  return { guarantor: q1(`SELECT id,name,phone,relationship,employer,consent,status FROM guarantors WHERE id=?`, id), message: 'Guarantor recorded. Independent consent and identity verification are still required.' };
}
export async function listGuarantors(ctx) { const u = requireAuth(ctx); return { guarantors: q(`SELECT id,name,phone,relationship,employer,consent,status,application_id,loan_id,created_at FROM guarantors WHERE customer_id=? ORDER BY id DESC`, u.id) }; }
export async function addCollateral(ctx) {
  const u = requireAuth(ctx), b = ctx.body, type = clean(b.type, 60), description = clean(b.description, 1000), value = Number(b.estimatedValue);
  if (!type || !description || !Number.isFinite(value) || value <= 0 || value > 1e10) throw new HttpError(400, 'Describe the asset and enter a positive estimated value.');
  const applicationId = b.applicationId ? Number(b.applicationId) : null;
  if (applicationId && !q1(`SELECT id FROM applications WHERE id=? AND customer_id=? AND status NOT IN ('disbursed','cancelled','rejected')`, applicationId, u.id)) throw new HttpError(400, 'Invalid application.');
  const docs = Array.isArray(b.documentIds) ? b.documentIds.map(Number) : [];
  if (docs.some(id => !q1(`SELECT id FROM documents WHERE id=? AND customer_id=?`, id, u.id))) throw new HttpError(400, 'A selected document does not belong to your account.');
  const id = Number(run(`INSERT INTO collateral(customer_id,application_id,type,description,estimated_value,doc_refs,status) VALUES(?,?,?,?,?,?,?)`, u.id, applicationId, type, description, value, JSON.stringify(docs), 'awaiting_valuation').lastInsertRowid);
  audit('customer', u.id, 'collateral.added', 'collateral', id, null, { type, estimatedValue: value }, ctx.ip, ctx.ua);
  return { collateral: q1(`SELECT id,type,description,estimated_value,valued_amount,status FROM collateral WHERE id=?`, id), message: 'Asset recorded. A professional valuation is required before it can secure a loan.' };
}
export async function listCollateral(ctx) { const u = requireAuth(ctx); return { collateral: q(`SELECT id,type,description,estimated_value,valued_amount,valued_by,valuation_date,status,application_id,loan_id,released_at FROM collateral WHERE customer_id=? ORDER BY id DESC`, u.id) }; }
