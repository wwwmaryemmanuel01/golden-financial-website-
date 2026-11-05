/* Customer-only authentication. OTPs are keyed hashes bound to a random
   challenge; passwords use scrypt; session secrets are never stored in DB. */
import { q, q1, run, tx, nextSeq, audit, activity, json } from './db.js';
import { hashPassword, verifyPassword, newSessionToken, sha256, hmac, randomToken, randomCode, rateLimit, clean, cleanNum, encryptText } from './security.js';
import { notify, deliverSecurityCode, deliveryConfigured } from './notifications.js';
import { HttpError, setCookie, clearCookie } from './http.js';
import { DEMO_MODE } from './config.js';
import { rules } from './catalog.js';
import GFS from '../shared/core.mjs';
const SESSION_COOKIE = 'gfs_session';
export function publicUser(u) {
  if (!u) return null;
  return { id: u.id, customerNo: u.customer_no, role: 'customer', email: u.email, phone: u.phone, firstName: u.first_name, lastName: u.last_name,
    dob: u.dob, gender: u.gender, maritalStatus: u.marital_status, district: u.district, city: u.city, area: u.area, addressLine: u.address_line,
    nationalIdMasked: u.national_id_enc ? '••••••••' : '', idType: u.id_type, employment: json(u.employment), business: json(u.business), nextOfKin: json(u.next_of_kin),
    monthlyIncome: u.monthly_income, monthlyExpenses: u.monthly_expenses, otherIncome: u.other_income, avatarDocId: u.avatar_doc_id,
    phoneVerified: !!u.phone_verified, emailVerified: !!u.email_verified, kycStatus: u.kyc_status, twofaEnabled: !!u.twofa_enabled,
    status: u.status, prefs: json(u.prefs), createdAt: u.created_at, lastLoginAt: u.last_login_at };
}
export function sessionUser(req) {
  const cookie = (req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith(`${SESSION_COOKIE}=`));
  const bearer = String(req.headers.authorization || '').match(/^Bearer ([a-f0-9]{64})$/i)?.[1];
  const secret = bearer || (cookie ? decodeURIComponent(cookie.slice(SESSION_COOKIE.length + 1)) : '');
  if (!/^[a-f0-9]{64}$/.test(secret)) return null;
  const s = q1(`SELECT s.id session_id,s.customer_id,s.expires_at,s.last_seen_at,c.* FROM sessions s JOIN customers c ON c.id=s.customer_id WHERE s.token_hash=? AND s.revoked=0`, sha256(secret));
  if (!s || s.status !== 'active' || Date.parse(s.expires_at.replace(' ', 'T') + 'Z') <= Date.now() || Date.now() - Date.parse(s.last_seen_at.replace(' ', 'T') + 'Z') > rules().idleTimeoutMinutes * 60000) return null;
  run(`UPDATE sessions SET last_seen_at=datetime('now') WHERE id=?`, s.session_id);
  return s;
}
export function requireAuth(ctx) { if (!ctx.user || ctx.user.role !== 'customer') throw new HttpError(401, 'Please sign in to continue.', 'AUTH_REQUIRED'); return ctx.user; }
function createSession(res, customerId, ip, ua) {
  const { secret, hash } = newSessionToken();
  const hours = rules().sessionHours;
  run(`INSERT INTO sessions(customer_id,token_hash,ip,user_agent,expires_at) VALUES(?,?,?,?,datetime('now',?))`, customerId, hash, ip, ua, `+${hours} hours`);
  setCookie(res, SESSION_COOKIE, secret, { maxAge: hours * 3600, sameSite: 'Lax' });
  return { token: secret };
}
function issueOtp(u, purpose, channel, binding = '') {
  const code = randomCode(), challenge = randomToken(24), ttl = rules().otpTtlMinutes;
  const target = channel === 'email' ? u.email : u.phone;
  tx(() => {
    run(`UPDATE otp_codes SET consumed=1 WHERE customer_id=? AND purpose=? AND consumed=0`, u.id, purpose);
    run(`INSERT INTO otp_codes(customer_id,target,purpose,code_hash,channel,expires_at,challenge_hash,binding_hash) VALUES(?,?,?,?,?,datetime('now',?),?,?)`, u.id, target, purpose, hmac(`${challenge}:${code}`), channel, `+${ttl} minutes`, hmac(challenge), hmac(`${u.id}:${purpose}:${binding}`));
  });
  deliverSecurityCode(u.id, channel, target, code, purpose);
  return { code, challenge };
}
function checkOtp(challenge, code, binding = '') {
  return tx(() => {
    const o = q1(`SELECT * FROM otp_codes WHERE challenge_hash=? AND consumed=0`, hmac(clean(challenge, 64)));
    if (!o || Date.parse(o.expires_at.replace(' ', 'T') + 'Z') <= Date.now()) throw new HttpError(400, 'This code has expired. Request a new one.', 'OTP_EXPIRED');
    if (o.attempts >= 5) { run(`UPDATE otp_codes SET consumed=1 WHERE id=?`, o.id); throw new HttpError(429, 'Too many attempts. Request a new code.'); }
    if (o.binding_hash !== hmac(`${o.customer_id}:${o.purpose}:${binding}`) || o.code_hash !== hmac(`${clean(challenge, 64)}:${clean(code, 6)}`)) {
      run(`UPDATE otp_codes SET attempts=attempts+1 WHERE id=?`, o.id); throw new HttpError(400, 'Incorrect verification code.');
    }
    run(`UPDATE otp_codes SET consumed=1 WHERE id=?`, o.id);
    return o;
  });
}
const devCode = result => DEMO_MODE ? { devCode: result.code, sandbox: true } : {};
export async function register(ctx) {
  const b = ctx.body;
  if (!rateLimit(`reg:${ctx.ip}`, 10, 3600000).ok) throw new HttpError(429, 'Too many registrations. Try again later.');
  const first = clean(b.firstName, 60), last = clean(b.lastName, 60), email = clean(b.email, 120).toLowerCase(), phone = GFS.normPhone(clean(b.phone, 20));
  if (!first || !last || !GFS.isEmail(email) || !GFS.isPhoneMW(phone)) throw new HttpError(400, 'Enter your full name, a valid email and a Malawi mobile number.');
  const issues = GFS.passwordIssues(b.password);
  if (issues.length) throw new HttpError(400, 'Password needs ' + issues.join(', ') + '.');
  if (!b.acceptTerms) throw new HttpError(400, 'Accept the Terms and Privacy Policy to register.');
  if (!DEMO_MODE && (!deliveryConfigured('sms') || !deliveryConfigured('email'))) throw new HttpError(503, 'Account verification is not configured yet. Please contact a branch.', 'VERIFICATION_UNAVAILABLE');
  if (q1(`SELECT id FROM customers WHERE email=? OR phone=?`, email, phone)) throw new HttpError(409, 'An account with these details already exists. Sign in or reset your password.');
  const customerNo = GFS.refs.customer(nextSeq('customer'));
  const id = Number(run(`INSERT INTO customers(customer_no,email,phone,password_hash,first_name,last_name,dob,gender,district,prefs) VALUES(?,?,?,?,?,?,?,?,?,?)`, customerNo, email, phone, hashPassword(b.password), first, last, clean(b.dob, 10) || null, clean(b.gender, 20) || null, clean(b.district, 60) || null, JSON.stringify({ sms: true, email: true, reminders: true, marketing: false })).lastInsertRowid);
  const u = q1(`SELECT * FROM customers WHERE id=?`, id);
  const phoneOtp = issueOtp(u, 'verify_phone', 'sms'), emailOtp = issueOtp(u, 'verify_email', 'email');
  notify(id, { category: 'welcome', title: 'Welcome to Golden Financial Services', body: `Hello ${first}, account ${customerNo} is ready. Verify your contact details and complete your profile.`, channels: ['inapp'] });
  audit('customer', id, 'account.register', 'customer', id, null, { customerNo }, ctx.ip, ctx.ua);
  activity(id, 'Account registered', customerNo, ctx.ip, ctx.ua);
  return { customerId: id, customerNo, phone, email, verificationRequired: true, challenges: { phone: phoneOtp.challenge, email: emailOtp.challenge }, ...(DEMO_MODE ? { devCodes: { phone: phoneOtp.code, email: emailOtp.code }, sandbox: true } : {}) };
}
export async function resendOtp(ctx) {
  const u = requireAuth(ctx), purpose = ctx.body.purpose;
  if (!['verify_phone', 'verify_email'].includes(purpose)) throw new HttpError(400, 'Choose phone or email verification.');
  if (!rateLimit(`otp:${u.id}:${purpose}`, 5, 600000).ok) throw new HttpError(429, 'Please wait before requesting another code.');
  const channel = purpose === 'verify_email' ? 'email' : 'sms';
  if (!DEMO_MODE && !deliveryConfigured(channel)) throw new HttpError(503, 'The verification service is not configured. Contact support.', 'VERIFICATION_UNAVAILABLE');
  const result = issueOtp(u, purpose, channel);
  return { sent: true, channel, challenge: result.challenge, ...devCode(result) };
}
export async function verificationChallenge(ctx) {
  const u = requireAuth(ctx), purpose = ctx.body.purpose === 'login_2fa' ? 'twofa' : 'verify_phone';
  if (purpose === 'verify_phone' && !rateLimit(`otp:${u.id}:phone`, 5, 600000).ok) throw new HttpError(429, 'Please wait before requesting another code.');
  const result = issueOtp(u, purpose, 'sms');
  return { challenge: result.challenge, ...devCode(result) };
}
export async function verifyOtp(ctx) {
  const b = ctx.body, purpose = clean(b.purpose, 30);
  // Password-reset codes are consumed exactly once by /auth/reset-password.
  if (!['verify_phone', 'verify_email', 'login_2fa', 'twofa'].includes(purpose)) throw new HttpError(400, 'Invalid verification purpose.');
  const o = checkOtp(b.challenge, b.code, purpose === 'login_2fa' ? clean(b.loginChallenge, 64) : '');
  if (o.purpose !== purpose) throw new HttpError(400, 'Verification purpose does not match.');
  const u = q1(`SELECT * FROM customers WHERE id=?`, o.customer_id);
  if (purpose === 'verify_phone' || purpose === 'verify_email') {
    run(`UPDATE customers SET ${purpose === 'verify_phone' ? 'phone_verified' : 'email_verified'}=1 WHERE id=?`, u.id);
    activity(u.id, purpose === 'verify_phone' ? 'Phone verified' : 'Email verified', null, ctx.ip, ctx.ua);
    return { verified: true, purpose, user: publicUser(q1(`SELECT * FROM customers WHERE id=?`, u.id)) };
  }
  if (purpose === 'login_2fa') {
    if (u.status !== 'active') throw new HttpError(403, 'This account is not active.');
    const sess = createSession(ctx.res, u.id, ctx.ip, ctx.ua);
    run(`UPDATE customers SET last_login_at=datetime('now'),failed_attempts=0 WHERE id=?`, u.id);
    activity(u.id, 'Signed in (2FA)', null, ctx.ip, ctx.ua);
    audit('customer', u.id, 'auth.login', 'customer', u.id, null, { twofa: true }, ctx.ip, ctx.ua);
    return { verified: true, token: sess.token, user: publicUser(u) };
  }
  if (!verifyPassword(b.password || '', u.password_hash)) throw new HttpError(400, 'Enter your current password to enable two-factor authentication.');
  run(`UPDATE customers SET twofa_enabled=1 WHERE id=?`, u.id);
  audit('customer', u.id, 'security.2fa_enabled', 'customer', u.id, null, null, ctx.ip, ctx.ua);
  return { verified: true, user: publicUser(q1(`SELECT * FROM customers WHERE id=?`, u.id)) };
}
export async function login(ctx) {
  const b = ctx.body, identifier = clean(b.email || b.identifier, 120).toLowerCase(), phone = GFS.normPhone(identifier);
  if (!rateLimit(`login:${ctx.ip}`, 30, 600000).ok) throw new HttpError(429, 'Too many sign-in attempts. Please wait.');
  const u = q1(`SELECT * FROM customers WHERE email=? OR phone=?`, identifier, phone);
  if (!u) { verifyPassword(b.password || '', 'scrypt$00000000000000000000000000000000$' + '00'.repeat(64)); throw new HttpError(401, 'Email/phone or password is incorrect.'); }
  if (u.status === 'suspended') throw new HttpError(403, 'This account is suspended. Contact support.');
  if (u.locked_until && Date.parse(u.locked_until.replace(' ', 'T') + 'Z') > Date.now()) throw new HttpError(423, 'Account temporarily locked after too many attempts. Reset your password or try later.');
  if (!verifyPassword(b.password || '', u.password_hash)) {
    const fails = u.failed_attempts + 1, lock = fails >= rules().maxLoginAttempts;
    run(`UPDATE customers SET failed_attempts=?,locked_until=${lock ? `datetime('now','+${rules().lockoutMinutes} minutes')` : 'NULL'} WHERE id=?`, fails, u.id);
    audit('customer', u.id, 'auth.login_failed', 'customer', u.id, null, { attempt: fails }, ctx.ip, ctx.ua);
    throw new HttpError(lock ? 423 : 401, lock ? 'Account temporarily locked. Reset your password or try later.' : 'Email/phone or password is incorrect.');
  }
  run(`UPDATE customers SET failed_attempts=0,locked_until=NULL WHERE id=?`, u.id);
  if (u.twofa_enabled) {
    if (!DEMO_MODE && !deliveryConfigured('sms')) throw new HttpError(503, 'Two-factor delivery is unavailable. Contact support.', 'VERIFICATION_UNAVAILABLE');
    const loginChallenge = randomToken(24), result = issueOtp(u, 'login_2fa', 'sms', loginChallenge);
    return { twofaRequired: true, loginChallenge, challenge: result.challenge, maskedPhone: u.phone.slice(0, 4) + '•••' + u.phone.slice(-3), ...devCode(result) };
  }
  const sess = createSession(ctx.res, u.id, ctx.ip, ctx.ua);
  run(`UPDATE customers SET last_login_at=datetime('now') WHERE id=?`, u.id);
  activity(u.id, 'Signed in', null, ctx.ip, ctx.ua); audit('customer', u.id, 'auth.login', 'customer', u.id, null, null, ctx.ip, ctx.ua);
  return { token: sess.token, user: publicUser(u) };
}
export async function logout(ctx) {
  if (ctx.user) { run(`UPDATE sessions SET revoked=1 WHERE id=?`, ctx.user.session_id); activity(ctx.user.id, 'Signed out', null, ctx.ip, ctx.ua); }
  clearCookie(ctx.res, SESSION_COOKIE); return { ok: true };
}
export async function forgotPassword(ctx) {
  const target = clean(ctx.body.email || ctx.body.target, 120).toLowerCase(), u = q1(`SELECT * FROM customers WHERE email=? OR phone=?`, target, GFS.normPhone(target));
  if (u && rateLimit(`reset:${u.id}`, 5, 900000).ok && (DEMO_MODE || deliveryConfigured('email'))) {
    const result = issueOtp(u, 'reset', 'email', 'password-reset');
    audit('customer', u.id, 'auth.password_reset_requested', 'customer', u.id, null, null, ctx.ip, ctx.ua);
    return { sent: true, challenge: result.challenge, ...devCode(result) };
  }
  return { sent: true, message: 'If an eligible account exists, a reset code has been sent. If delivery is unavailable, contact support.' };
}
export async function resetPassword(ctx) {
  const b = ctx.body, o = checkOtp(b.challenge || b.resetChallenge, b.code, 'password-reset');
  if (o.purpose !== 'reset') throw new HttpError(400, 'Invalid reset challenge.');
  const issues = GFS.passwordIssues(b.password || b.newPassword);
  if (issues.length) throw new HttpError(400, 'Password needs ' + issues.join(', ') + '.');
  tx(() => { run(`UPDATE customers SET password_hash=?,failed_attempts=0,locked_until=NULL WHERE id=?`, hashPassword(b.password || b.newPassword), o.customer_id); run(`UPDATE sessions SET revoked=1 WHERE customer_id=?`, o.customer_id); });
  notify(o.customer_id, { category: 'security', title: 'Password changed', body: 'Your password was reset and all sessions were signed out. Contact us if this was not you.' });
  audit('customer', o.customer_id, 'auth.password_reset', 'customer', o.customer_id, null, null, ctx.ip, ctx.ua);
  return { ok: true };
}
export async function changePassword(ctx) {
  const u = requireAuth(ctx), b = ctx.body;
  if (!verifyPassword(b.currentPassword || '', u.password_hash)) throw new HttpError(400, 'Current password is incorrect.');
  const issues = GFS.passwordIssues(b.newPassword); if (issues.length) throw new HttpError(400, 'Password needs ' + issues.join(', ') + '.');
  tx(() => { run(`UPDATE customers SET password_hash=? WHERE id=?`, hashPassword(b.newPassword), u.id); run(`UPDATE sessions SET revoked=1 WHERE customer_id=? AND id!=?`, u.id, u.session_id); });
  notify(u.id, { category: 'security', title: 'Password changed', body: 'Your password was changed. Other sessions were signed out.' });
  audit('customer', u.id, 'auth.password_changed', 'customer', u.id, null, null, ctx.ip, ctx.ua); return { ok: true };
}
function objectFields(value, keys, max = 200) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new HttpError(400, 'Expected a details object.');
  return Object.fromEntries(keys.filter(k => value[k] !== undefined).map(k => [k, clean(value[k], max)]));
}
export async function updateProfile(ctx) {
  const u = requireAuth(ctx), b = ctx.body, before = publicUser(u);
  const text = { first_name: ['firstName', 60], last_name: ['lastName', 60], dob: ['dob', 10], gender: ['gender', 20], marital_status: ['maritalStatus', 30], district: ['district', 60], city: ['city', 60], area: ['area', 80], address_line: ['addressLine', 200] };
  const fields = {};
  for (const [col, [key, max]] of Object.entries(text)) if (b[key] !== undefined) fields[col] = clean(b[key], max);
  for (const [col, key] of [['monthly_income', 'monthlyIncome'], ['monthly_expenses', 'monthlyExpenses'], ['other_income', 'otherIncome']]) if (b[key] !== undefined) { const n = Number(b[key]); if (!Number.isFinite(n) || n < 0 || n > 1e10) throw new HttpError(400, 'Enter a valid non-negative amount.'); fields[col] = n; }
  if (fields.dob && (!/^\d{4}-\d{2}-\d{2}$/.test(fields.dob) || Number.isNaN(Date.parse(fields.dob)) || fields.dob > new Date().toISOString().slice(0, 10))) throw new HttpError(400, 'Enter a valid date of birth.');
  if (fields.first_name === '' || fields.last_name === '') throw new HttpError(400, 'First and last name are required.');
  if (b.nationalId && !String(b.nationalId).includes('•')) { fields.national_id_enc = encryptText(clean(b.nationalId, 40)); fields.id_type = clean(b.idType, 30) || u.id_type; }
  if (b.employment !== undefined) fields.employment = JSON.stringify(objectFields(b.employment, ['status', 'employer', 'position', 'employedSince', 'employerPhone', 'payDay', 'salaryAccount']));
  if (b.business !== undefined) fields.business = JSON.stringify(objectFields(b.business, ['name', 'type', 'registrationNo', 'started', 'location', 'monthlyTurnover']));
  if (b.nextOfKin !== undefined) fields.next_of_kin = JSON.stringify(objectFields(b.nextOfKin, ['name', 'relationship', 'phone', 'address']));
  if (!Object.keys(fields).length) throw new HttpError(400, 'No supported profile changes were supplied.');
  run(`UPDATE customers SET ${Object.keys(fields).map(k => `${k}=?`).join(',')},updated_at=datetime('now') WHERE id=?`, ...Object.values(fields), u.id);
  const after = publicUser(q1(`SELECT * FROM customers WHERE id=?`, u.id));
  audit('customer', u.id, 'profile.updated', 'customer', u.id, before, after, ctx.ip, ctx.ua); activity(u.id, 'Profile updated', null, ctx.ip, ctx.ua); return { user: after };
}
export async function updatePrefs(ctx) {
  const u = requireAuth(ctx), prefs = json(u.prefs, {});
  for (const k of ['sms', 'email', 'reminders', 'marketing']) if (ctx.body[k] !== undefined) { if (typeof ctx.body[k] !== 'boolean') throw new HttpError(400, 'Notification preferences must be true or false.'); prefs[k] = ctx.body[k]; }
  for (const k of ['theme', 'language']) if (ctx.body[k] !== undefined) prefs[k] = clean(ctx.body[k], 20);
  run(`UPDATE customers SET prefs=? WHERE id=?`, JSON.stringify(prefs), u.id); audit('customer', u.id, 'prefs.updated', 'customer', u.id, null, prefs, ctx.ip, ctx.ua); return { prefs };
}
export async function setTwoFactor(ctx) {
  const u = requireAuth(ctx), enable = !!ctx.body.enabled;
  if (!verifyPassword(ctx.body.password || '', u.password_hash)) throw new HttpError(400, 'Enter your current password to change two-factor authentication.');
  if (enable) {
    if (!u.phone_verified) throw new HttpError(400, 'Verify your phone first.');
    const o = checkOtp(ctx.body.challenge, ctx.body.code); if (o.purpose !== 'twofa' || o.customer_id !== u.id) throw new HttpError(400, 'Invalid phone challenge.');
    run(`UPDATE customers SET twofa_enabled=1 WHERE id=?`, u.id);
  } else run(`UPDATE customers SET twofa_enabled=0 WHERE id=?`, u.id);
  notify(u.id, { category: 'security', title: `Two-factor authentication ${enable ? 'enabled' : 'disabled'}`, body: 'Your sign-in security settings were changed. Contact support if this was not you.' });
  audit('customer', u.id, enable ? 'security.2fa_enabled' : 'security.2fa_disabled', 'customer', u.id, null, null, ctx.ip, ctx.ua); return { enabled: enable };
}
export async function listSessions(ctx) { const u = requireAuth(ctx); return { sessions: q(`SELECT id,ip,user_agent,created_at,last_seen_at,expires_at,revoked FROM sessions WHERE customer_id=? ORDER BY id DESC LIMIT 50`, u.id).map(s => ({ ...s, current: s.id === u.session_id })) }; }
export async function revokeSession(ctx) { const u = requireAuth(ctx); const r = run(`UPDATE sessions SET revoked=1 WHERE id=? AND customer_id=?`, Number(ctx.params.id), u.id); if (!r.changes) throw new HttpError(404, 'Session not found.'); if (Number(ctx.params.id) === u.session_id) clearCookie(ctx.res, SESSION_COOKIE); audit('customer', u.id, 'security.session_revoked', 'session', ctx.params.id, null, null, ctx.ip, ctx.ua); return { ok: true }; }
export async function activityHistory(ctx) { const u = requireAuth(ctx); return { activity: q(`SELECT id,action,detail,ip,user_agent,created_at FROM activity_log WHERE customer_id=? ORDER BY id DESC LIMIT 200`, u.id) }; }
