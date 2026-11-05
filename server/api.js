/* API surface — every customer module connects to the same central database
   through these routes. RBAC: customers only; system settings are read-only. */
import { Router, ok, created, sendJSON, HttpError } from './http.js';
import { q, q1, getSetting } from './db.js';
import * as catalog from './catalog.js';
import { DEMO_MODE } from './config.js';
import * as auth from './auth.js';
import * as loans from './loans.js';
import * as payments from './payments.js';
import * as documents from './documents.js';
import * as support from './support.js';
import * as statements from './statements.js';
import * as integration from './integration.js';
import { listNotifications, unreadCount, markRead, markAllRead } from './notifications.js';
import GFS from '../shared/core.mjs';

export const router = new Router();

/* ---------- public: content & tools ---------- */
router.get('/api/health', integration.health);
router.get('/api/config', integration.publicConfig);
router.get('/api/integration/status', integration.status);
router.get('/api/products', async () => ({ products: catalog.products() }));
router.get('/api/branches', async () => ({ branches: getSetting('branches', GFS.BRANCHES) }));
router.get('/api/faqs', async () => ({ faqs: GFS.FAQS }));
router.get('/api/testimonials', async () => ({ testimonials: GFS.TESTIMONIALS }));
router.get('/api/announcements', support.listAnnouncements);
router.get('/api/agreement-clauses', async () => ({ clauses: GFS.AGREEMENT_CLAUSES }));
router.post('/api/calculator', loans.calculator);
router.get('/api/calculator', loans.calculator);
router.post('/api/eligibility', loans.eligibility);
router.get('/api/payment-methods', payments.paymentMethods);

/* ---------- auth ---------- */
router.post('/api/auth/register', auth.register);
router.post('/api/auth/login', auth.login);
router.post('/api/auth/logout', auth.logout);
router.post('/api/auth/verify-otp', auth.verifyOtp);
router.post('/api/auth/resend-otp', auth.resendOtp);
router.post('/api/auth/forgot-password', auth.forgotPassword);
router.post('/api/auth/reset-password', auth.resetPassword);
router.post('/api/auth/verification-challenge', auth.verificationChallenge);
router.post('/api/auth/change-password', auth.changePassword);
router.get('/api/me', async ctx => ({ user: auth.publicUser(ctx.user) }));

/* ---------- profile & security ---------- */
router.put('/api/profile', auth.updateProfile);
router.put('/api/prefs', auth.updatePrefs);
router.put('/api/security/2fa', auth.setTwoFactor);
router.get('/api/security/sessions', auth.listSessions);
router.delete('/api/security/sessions/:id', auth.revokeSession);
router.get('/api/security/activity', auth.activityHistory);

/* ---------- dashboard & loans ---------- */
router.get('/api/dashboard', loans.dashboard);
router.get('/api/loans', loans.listLoans);
router.get('/api/loans/:id', loans.getLoan);
router.get('/api/loans/:id/settlement', loans.getSettlement);
router.get('/api/loans/:id/ledger', async ctx => { const u = auth.requireAuth(ctx); const l = q1(`SELECT id,ref FROM loans WHERE id=? AND customer_id=?`, Number(ctx.params.id), u.id); if (!l) throw new HttpError(404, 'Loan not found.'); return { loan: l, entries: q(`SELECT ref,bucket,delta_cents,description,created_at FROM ledger_entries WHERE loan_id=? ORDER BY id`, l.id) }; });
router.get('/api/applications', loans.listApplications);
router.post('/api/applications', loans.submitApplication);
router.get('/api/applications/:id', loans.getApplication);
router.post('/api/applications/:id/reassess', loans.rerunAssessment);
router.post('/api/applications/:id/cancel', loans.cancelApplication);
router.post('/api/applications/:id/accept-agreement', loans.acceptAgreement);
router.get('/api/requests', loans.listRequests);
router.post('/api/requests', loans.createRequest);

/* ---------- payments ---------- */
router.post('/api/payments/initiate', payments.initiatePayment);
router.post('/api/payments/:id/confirm', payments.confirmPayment);
router.post('/api/payments/:id/proof', payments.submitPaymentProof);
router.get('/api/transactions', payments.listTransactions);
router.get('/api/receipts', payments.listReceipts);
router.get('/api/receipts/:id', payments.getReceipt);
router.post('/api/webhooks/:provider', payments.providerWebhook);

/* ---------- documents, guarantors, collateral ---------- */
router.get('/api/documents', documents.listDocuments);
router.post('/api/documents', documents.uploadDocument);
router.get('/api/documents/:id/file', documents.downloadDocument);
router.delete('/api/documents/:id', documents.deleteDocument);
router.get('/api/guarantors', documents.listGuarantors);
router.post('/api/guarantors', documents.addGuarantor);
router.get('/api/collateral', documents.listCollateral);
router.post('/api/collateral', documents.addCollateral);

/* ---------- notifications ---------- */
router.get('/api/notifications', async ctx => {
  const u = auth.requireAuth(ctx);
  return { notifications: listNotifications(u.id, { channel: ctx.url.searchParams.get('channel') || undefined }), unread: unreadCount(u.id) };
});
router.post('/api/notifications/:id/read', async ctx => { const u = auth.requireAuth(ctx); markRead(u.id, Number(ctx.params.id)); return { ok: true }; });
router.post('/api/notifications/read-all', async ctx => { const u = auth.requireAuth(ctx); markAllRead(u.id); return { ok: true }; });

/* ---------- support ---------- */
router.get('/api/chat', support.chatHistory);
router.post('/api/chat', support.chatSend);
router.get('/api/tickets', support.listTickets);
router.post('/api/tickets', support.createTicket);
router.get('/api/tickets/:id', support.getTicket);
router.post('/api/tickets/:id/reply', support.replyTicket);
router.post('/api/tickets/:id/close', support.closeTicket);

/* ---------- PDF financial records ---------- */
router.get('/api/receipts/:id/pdf', statements.receiptPDF);
router.get('/api/loans/:id/statement.pdf', statements.loanStatementPDF);
router.get('/api/loans/:id/settlement.pdf', statements.settlementStatementPDF);
router.get('/api/loans/:id/disbursement.pdf', statements.disbursementPDF);
router.get('/api/transactions/statement.pdf', statements.transactionStatementPDF);
router.get('/api/applications/:id/agreement.pdf', statements.agreementPDF);

/* ---------- statements & records overview ---------- */
router.get('/api/statements', async ctx => {
  const u = auth.requireAuth(ctx);
  const ls = q(`SELECT * FROM loans WHERE customer_id = ? ORDER BY id DESC`, u.id);
  const receipts = q(`SELECT * FROM receipts WHERE customer_id = ? ORDER BY id DESC`, u.id);
  return {
    loans: ls.map(l => ({ id: l.id, ref: l.ref, productId: l.product_id, status: l.status, principal: l.principal, outstanding: l.outstanding_principal + l.accrued_interest + l.fees_outstanding + l.penalties, disbursedAt: l.disbursed_at })),
    receipts: receipts.map(r => ({ id: r.id, ref: r.ref, amount: r.amount, createdAt: r.created_at })),
    types: ['Loan statements', 'Repayment statements', 'Payment transaction statements', 'Outstanding balance statements', 'Settlement statements', 'Disbursement confirmations', 'Signed agreements']
  };
});

/* ---------- customer data export (own records only) ---------- */
router.get('/api/export/my-data', async ctx => {
  const u = auth.requireAuth(ctx);
  return {
    exportedAt: new Date().toISOString(),
    profile: auth.publicUser(u),
    applications: q(`SELECT * FROM applications WHERE customer_id = ?`, u.id),
    loans: q(`SELECT * FROM loans WHERE customer_id = ?`, u.id),
    schedule: q(`SELECT s.* FROM schedule s JOIN loans l ON l.id = s.loan_id WHERE l.customer_id = ?`, u.id),
    transactions: q(`SELECT * FROM transactions WHERE customer_id = ?`, u.id),
    receipts: q(`SELECT * FROM receipts WHERE customer_id = ?`, u.id),
    notifications: q(`SELECT * FROM notifications WHERE customer_id = ?`, u.id),
    documents: q(`SELECT id, ref, kind, filename, status, uploaded_at FROM documents WHERE customer_id = ?`, u.id),
    activity: q(`SELECT * FROM activity_log WHERE customer_id = ?`, u.id)
  };
});

/* ---------- system settings: READ-ONLY for customers ---------- */
router.get('/api/settings/system', integration.customerSettings);
const refuseSettingsWrite = async ctx => { auth.requireAuth(ctx); return sendJSON(ctx.res, 403, { error: 'System settings are managed by the back-office and cannot be changed from a customer account.', code: 'SETTINGS_READ_ONLY' }); };
for (const method of ['post', 'put', 'patch', 'delete']) for (const path of ['/api/settings/system', '/api/settings']) router[method](path, refuseSettingsWrite);
/* Server-to-server only; authenticated by timestamped HMAC, never a customer session. */
router.post('/api/integration/settings', integration.pushSettings);
router.post('/api/integration/events', integration.ingest);
router.get('/api/integration/customers', integration.exportCustomers);
router.get('/api/integration/applications', integration.exportApplications);
