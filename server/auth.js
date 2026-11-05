/* Authentication & account management: registration, login, OTP, 2FA,
   password reset, sessions, profile, security settings, activity history.
   Customers only ever access their own records (RBAC: role = customer). */
import { q, q1, run, tx, nextSeq, audit, activity, json, nowISO } from './db.js';
import { hashPassword, verifyPassword, newSessionToken, sha256, randomToken, randomCode, rateLimit, clean, cleanNum, encryptText, decryptText } from './security.js';
import { notify } from './notifications.js';
import { HttpError, setCookie, clearCookie } from './http.js';
import { IS_PROD, INTEGRATION_KEY } from './config.js';
import GFS from '../shared/core.mjs';

const SESSION_COOKIE = 'gfs_session';
const SESSION_HOURS = GFS.RULES.sessionHours;

/* ---------------- session middleware ---------------- */
export function sessionUser(req) {
  const auth = req.headers.authorization || '';
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  const cookie = (req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith(SESSION_COOKIE + '='));
  const token = bearer || (cookie ? decodeURIComponent(cookie.split('=')[1]) : null);
  if (!token) return null;
  const s = q1(`SELECT * FROM sessions WHERE token_hash = ? AND revoked = 0`, sha256(token));
  if (!s) return null;
  if (new Date(s.expires_at.replace(' ', 'T') + 'Z') < new Date()) return null;
  const idleMs = GFS.RULES.idleTimeoutMinutes * 60000;
  if (Date.now() - new Date(s.last_seen.replace(' ', 'T') + 'Z').getTime() > idleMs) {
    run(`UPDATE sessions SET revoked = 1 WHERE id = ?`, s.id);
    return null;
  }
  run(`UPDATE sessions SET last_seen = datetime('now') WHERE id = ?`, s.id);
  const u = q1(`SELECT * FROM customers WHERE id = ? AND status != 'closed'`, s.customer_id);
  if (!u) return null;
  u.session_id = s.id;
  return u;
}
export function requireAuth(ctx) {
  if (!ctx.user) throw new HttpError(401, 'Please sign in to continue.', 'AUTH_REQUIRED');
  if (ctx.user.role !== 'customer') throw new HttpError(403, 'This portal is for customers only.');
  return ctx.user;
}
export function publicUser(u) {
  if (!u) return null;
  return {
    id: u.id, customerNo: u.customer_no, email: u.email, phone: u.phone,
    firstName: u.first_name, lastName: u.last_name, name: `${u.first_name} ${u.last_name}`,
    dob: u.dob, gender: u.gender, maritalStatus: u.marital_status,
    idType: u.id_type, nationalId: u.national_id_enc ? maskId(decryptText(u.national_id_enc)) : '',
    district: u.district, city: u.city, area: u.area, addressLine: u.address_line,
    employment: json(u.employment), business: json(u.business),
    monthlyIncome: u.monthly_income, monthlyExpenses: u.monthly_expenses, otherIncome: u.other_income,
    nextOfKin: json(u.next_of_kin), avatarDocId: u.avatar_doc_id,
    kycStatus: u.kyc_status, emailVerified: !!u.email_verified, phoneVerified: !!u.phone_verified,
    twofaEnabled: !!u.twofa_enabled, prefs: json(u.prefs), status: u.status,
    lastLoginAt: u.last_login_at, createdAt: u.created_at, role: u.role
  };
}
const maskId = s => s ? s.slice(0, 2) + '••••' + s.slice(-2) : '';

function createSession(res, customerId, ip, ua) {
  const { secret, hash } = newSessionToken();
  const expires = new Date(Date.now() + SESSION_HOURS * 3600000).toISOString().replace('T', ' ').slice(0, 19);
  run(`INSERT INTO sessions(token_hash, customer_id, ip, user_agent, expires_at) VALUES(?,?,?,?,?)`, hash, customerId, ip, ua, expires);
  setCookie(res, SESSION_COOKIE, secret, { maxAge: SESSION_HOURS * 3600, httpOnly: true });
  return { token: secret, expiresAt: expires };
}

/* ---------------- OTP ---------------- */
function issueOtp(customerId, target, purpose, channel) {
  const code = randomCode();
  const expires = new Date(Date.now() + GFS.RULES.otpTtlMinutes * 60000).toISOString().replace('T', ' ').slice(0, 19);
  run(`UPDATE otp_codes SET consumed = 1 WHERE target = ? AND purpose = ? AND consumed = 0`, target, purpose);
  run(`INSERT INTO otp_codes(customer_id, target, purpose, channel, code_hash, expires_at) VALUES(?,?,?,?,?,?)`,
    customerId, target, purpose, channel, sha256(code), expires);
  // Outbox record so the customer can see the message that was "sent"
  run(`INSERT INTO notifications(customer_id, channel, category, title, body, meta) VALUES(?,?,?,?,?,?)`,
    customerId, channel, 'security', `${purpose === 'login_2fa' ? 'Sign-in' : purpose === 'reset' ? 'Password reset' : 'Verification'} code`,
    `Your Golden Financial Services code is ${code}. It expires in ${GFS.RULES.otpTtlMinutes} minutes. Never share this code.`,
    JSON.stringify({ purpose, otp: !IS_PROD ? code : undefined }));
  return code;
}
function checkOtp(target, purpose, code) {
  const o = q1(`SELECT * FROM otp_codes WHERE target = ? AND purpose = ? AND consumed = 0 ORDER BY id DESC LIMIT 1`, target, purpose);
  if (!o) throw new HttpError(400, 'No active code. Request a new one.');
  if (new Date(o.expires_at.replace(' ', 'T') + 'Z') < new Date()) throw new HttpError(400, 'This code has expired. Request a new one.');
  if (o.attempts >= 5) throw new HttpError(429, 'Too many attempts. Request a new code.');
  if (o.code_hash !== sha256(String(code))) {
    run(`UPDATE otp_codes SET attempts = attempts + 1 WHERE id = ?`, o.id);
    throw new HttpError(400, 'Incorrect code. Please try again.');
  }
  run(`UPDATE otp_codes SET consumed = 1 WHERE id = ?`, o.id);
  return o;
}

/* ---------------- registration ---------------- */
export async function register(ctx) {
  const b = ctx.body;
  const rl = rateLimit(`reg:${ctx.ip}`, 10, 3600000);
  if (!rl.ok) throw new HttpError(429, 'Too many registrations from this device. Try again later.');
  const first = clean(b.firstName, 60), last = clean(b.lastName, 60);
  const email = clean(b.email, 120).toLowerCase(), phone = GFS.normPhone(clean(b.phone, 20));
  if (!first || !last) throw new HttpError(400, 'First and last name are required.');
  if (!GFS.isEmail(email)) throw new HttpError(400, 'Enter a valid email address.');
  if (!GFS.isPhoneMW(phone)) throw new HttpError(400, 'Enter a valid Malawi mobile number (e.g. 0999 123 456).');
  const pwIssues = GFS.passwordIssues(b.password);
  if (pwIssues.length) throw new HttpError(400, 'Password needs ' + pwIssues.join(', ') + '.');
  if (!b.acceptTerms) throw new HttpError(400, 'You must accept the Terms and Privacy Policy to register.');
  if (q1(`SELECT id FROM customers WHERE email = ?`, email)) throw new HttpError(409, 'An account with this email already exists. Sign in instead.');
  if (q1(`SELECT id FROM customers WHERE phone = ?`, phone)) throw new HttpError(409, 'An account with this phone number already exists.');
  const customerNo = GFS.refs.customer(nextSeq('customer'));
  const id = tx(() => {
    const r = run(`INSERT INTO customers(customer_no, email, phone, password_hash, first_name, last_name, dob, gender, district, prefs)
      VALUES(?,?,?,?,?,?,?,?,?,?)`,
      customerNo, email, phone, hashPassword(b.password), first, last, clean(b.dob, 10) || null, clean(b.gender, 20) || null, clean(b.district, 60) || null,
      JSON.stringify({ sms: true, email: true, reminders: true, marketing: false }));
    return Number(r.lastInsertRowid);
  });
  const phoneCode = issueOtp(id, phone, 'verify_phone', 'sms');
  const emailCode = issueOtp(id, email, 'verify_email', 'email');
  notify(id, { category: 'welcome', title: 'Welcome to Golden Financial Services', body: `Hello ${first}, your customer account ${customerNo} is ready. Verify your phone and email, complete your profile, and apply for your first loan.`, channels: ['inapp', 'sms', 'email'] });
  audit('customer', id, 'account.register', 'customer', id, null, { customerNo, email }, ctx.ip, ctx.ua);
  activity(id, 'Account registered', `Customer ${customerNo}`, ctx.ip, ctx.ua);
  return {
    customerId: id, customerNo, phone, email,
    verificationRequired: true,
    ...(IS_PROD ? {} : { devCodes: { phone: phoneCode, email: emailCode }, note: 'Development mode: codes are shown here and in Notifications → SMS/Email history. In production they are delivered by the SMS/email provider.' })
  };
}

export async function resendOtp(ctx) {
  const b = ctx.body;
  const purpose = ['verify_phone', 'verify_email'].includes(b.purpose) ? b.purpose : 'verify_phone';
  const target = clean(b.target, 120);
  const u = q1(`SELECT * FROM customers WHERE (email = ? OR phone = ?)`, target.toLowerCase(), GFS.normPhone(target));
  if (!u) throw new HttpError(404, 'Account not found.');
  const rl = rateLimit(`otp:${u.id}:${purpose}`, 5, 600000);
  if (!rl.ok) throw new HttpError(429, 'Please wait before requesting another code.');
  const channel = purpose === 'verify_email' ? 'email' : 'sms';
  const code = issueOtp(u.id, purpose === 'verify_email' ? u.email : u.phone, purpose, channel);
  return { sent: true, channel, ...(IS_PROD ? {} : { devCode: code }) };
}

export async function verifyOtp(ctx) {
  const b = ctx.body;
  const purpose = ['verify_phone', 'verify_email', 'login_2fa', 'reset'].includes(b.purpose) ? b.purpose : 'verify_phone';
  const target = clean(b.target, 120);
  const code = clean(b.code, 6);
  const o = checkOtp(purpose === 'verify_email' ? target.toLowerCase() : (purpose === 'reset' ? target.toLowerCase() : GFS.normPhone(target)), purpose, code);
  if (purpose === 'verify_phone' || purpose === 'verify_email') {
    const u = q1(`SELECT * FROM customers WHERE id = ?`, o.customer_id);
    if (purpose === 'verify_phone') run(`UPDATE customers SET phone_verified = 1 WHERE id = ?`, u.id);
    else run(`UPDATE customers SET email_verified = 1 WHERE id = ?`, u.id);
    const both = q1(`SELECT phone_verified, email_verified FROM customers WHERE id = ?`, u.id);
    if (both.phone_verified && both.email_verified && u.kyc_status === 'pending') {
      // contact verified; KYC still needs documents
    }
    activity(u.id, purpose === 'verify_phone' ? 'Phone verified' : 'Email verified', null, ctx.ip, ctx.ua);
    audit('customer', u.id, `account.${purpose}`, 'customer', u.id, null, null, ctx.ip, ctx.ua);
    return { verified: true, purpose, user: publicUser(q1(`SELECT * FROM customers WHERE id = ?`, u.id)) };
  }
  if (purpose === 'login_2fa') {
    const u = q1(`SELECT * FROM customers WHERE id = ?`, o.customer_id);
    const sess = createSession(ctx.res, u.id, ctx.ip, ctx.ua);
    run(`UPDATE customers SET last_login_at = datetime('now'), failed_attempts = 0 WHERE id = ?`, u.id);
    activity(u.id, 'Signed in (2FA)', null, ctx.ip, ctx.ua);
    return { verified: true, token: sess.token, user: publicUser(u) };
  }
  if (purpose === 'reset') {
    return { verified: true, resetTicket: o.id };
  }
}

/* ---------------- login ---------------- */
export async function login(ctx) {
  const b = ctx.body;
  const identifier = clean(b.email || b.identifier, 120).toLowerCase();
  const phoneId = GFS.normPhone(identifier);
  const rl = rateLimit(`login:${ctx.ip}`, 30, 600000);
  if (!rl.ok) throw new HttpError(429, 'Too many sign-in attempts. Please wait a few minutes.');
  const u = q1(`SELECT * FROM customers WHERE email = ? OR phone = ?`, identifier, phoneId);
  if (!u) throw new HttpError(401, 'Email/phone or password is incorrect.');
  if (u.status === 'suspended') throw new HttpError(403, 'This account is suspended. Contact support.');
  if (u.locked_until && new Date(u.locked_until.replace(' ', 'T') + 'Z') > new Date()) {
    throw new HttpError(423, `Account locked after too many attempts. Try again after ${u.locked_until.slice(11, 16)} UTC.`);
  }
  if (!verifyPassword(b.password || '', u.password_hash)) {
    const fails = u.failed_attempts + 1;
    const lock = fails >= GFS.RULES.maxLoginAttempts;
    run(`UPDATE customers SET failed_attempts = ?, locked_until = ${lock ? `datetime('now', '+${GFS.RULES.lockoutMinutes} minutes')` : 'NULL'} WHERE id = ?`, fails, u.id);
    audit('customer', u.id, 'auth.login_failed', 'customer', u.id, null, { attempt: fails }, ctx.ip, ctx.ua);
    if (lock) {
      notify(u.id, { category: 'security', title: 'Account locked', body: `Your account was locked for ${GFS.RULES.lockoutMinutes} minutes after ${fails} failed sign-in attempts. If this was not you, reset your password.`, channels: ['inapp', 'sms', 'email'] });
      throw new HttpError(423, `Too many failed attempts. Account locked for ${GFS.RULES.lockoutMinutes} minutes.`);
    }
    throw new HttpError(401, `Email/phone or password is incorrect. ${GFS.RULES.maxLoginAttempts - fails} attempt(s) left.`);
  }
  run(`UPDATE customers SET failed_attempts = 0, locked_until = NULL WHERE id = ?`, u.id);
  if (u.twofa_enabled) {
    const code = issueOtp(u.id, u.phone, 'login_2fa', 'sms');
    return { twofaRequired: true, target: u.phone, maskedPhone: u.phone.slice(0, 4) + '•••' + u.phone.slice(-3), ...(IS_PROD ? {} : { devCode: code }) };
  }
  const sess = createSession(ctx.res, u.id, ctx.ip, ctx.ua);
  run(`UPDATE customers SET last_login_at = datetime('now') WHERE id = ?`, u.id);
  activity(u.id, 'Signed in', null, ctx.ip, ctx.ua);
  audit('customer', u.id, 'auth.login', 'customer', u.id, null, null, ctx.ip, ctx.ua);
  return { token: sess.token, user: publicUser(u) };
}

export async function logout(ctx) {
  if (ctx.user) {
    run(`UPDATE sessions SET revoked = 1 WHERE id = ?`, ctx.user.session_id);
    activity(ctx.user.id, 'Signed out', null, ctx.ip, ctx.ua);
    audit('customer', ctx.user.id, 'auth.logout', 'customer', ctx.user.id, null, null, ctx.ip, ctx.ua);
  }
  clearCookie(ctx.res, SESSION_COOKIE);
  return { ok: true };
}

/* ---------------- password reset ---------------- */
export async function forgotPassword(ctx) {
  const target = clean(ctx.body.email || ctx.body.target, 120).toLowerCase();
  const u = q1(`SELECT * FROM customers WHERE email = ? OR phone = ?`, target, GFS.normPhone(target));
  // Do not reveal whether the account exists
  if (u) {
    const rl = rateLimit(`reset:${u.id}`, 5, 900000);
    if (rl.ok) {
      const code = issueOtp(u.id, u.email, 'reset', 'email');
      notify(u.id, { category: 'security', title: 'Password reset requested', body: 'A password reset was requested for your account. If this was not you, contact support immediately.', channels: ['inapp', 'email'] });
      audit('customer', u.id, 'auth.password_reset_requested', 'customer', u.id, null, null, ctx.ip, ctx.ua);
      return { sent: true, target: u.email, ...(IS_PROD ? {} : { devCode: code }) };
    }
  }
  return { sent: true, target };
}

export async function resetPassword(ctx) {
  const b = ctx.body;
  const target = clean(b.email || b.target, 120).toLowerCase();
  const u = q1(`SELECT * FROM customers WHERE email = ? OR phone = ?`, target, GFS.normPhone(target));
  if (!u) throw new HttpError(400, 'Invalid reset request.');
  checkOtp(u.email, 'reset', clean(b.code, 6));
  const issues = GFS.passwordIssues(b.password);
  if (issues.length) throw new HttpError(400, 'Password needs ' + issues.join(', ') + '.');
  run(`UPDATE customers SET password_hash = ?, failed_attempts = 0, locked_until = NULL WHERE id = ?`, hashPassword(b.password), u.id);
  run(`UPDATE sessions SET revoked = 1 WHERE customer_id = ?`, u.id);
  notify(u.id, { category: 'security', title: 'Password changed', body: 'Your password was reset successfully. All other sessions were signed out. If this was not you, contact support immediately.', channels: ['inapp', 'sms', 'email'] });
  audit('customer', u.id, 'auth.password_reset', 'customer', u.id, null, null, ctx.ip, ctx.ua);
  activity(u.id, 'Password reset', null, ctx.ip, ctx.ua);
  return { ok: true };
}

export async function changePassword(ctx) {
  const u = requireAuth(ctx);
  const b = ctx.body;
  if (!verifyPassword(b.currentPassword || '', u.password_hash)) throw new HttpError(400, 'Current password is incorrect.');
  const issues = GFS.passwordIssues(b.newPassword);
  if (issues.length) throw new HttpError(400, 'Password needs ' + issues.join(', ') + '.');
  run(`UPDATE customers SET password_hash = ? WHERE id = ?`, hashPassword(b.newPassword), u.id);
  run(`UPDATE sessions SET revoked = 1 WHERE customer_id = ? AND id != ?`, u.id, u.session_id);
  notify(u.id, { category: 'security', title: 'Password changed', body: 'Your password was changed. Other sessions were signed out.', channels: ['inapp', 'sms', 'email'] });
  audit('customer', u.id, 'auth.password_changed', 'customer', u.id, null, null, ctx.ip, ctx.ua);
  activity(u.id, 'Password changed', null, ctx.ip, ctx.ua);
  return { ok: true };
}

/* ---------------- profile ---------------- */
export async function updateProfile(ctx) {
  const u = requireAuth(ctx);
  const b = ctx.body;
  const before = publicUser(u);
  const fields = {
    first_name: b.firstName !== undefined ? clean(b.firstName, 60) : u.first_name,
    last_name: b.lastName !== undefined ? clean(b.lastName, 60) : u.last_name,
    dob: b.dob !== undefined ? clean(b.dob, 10) : u.dob,
    gender: b.gender !== undefined ? clean(b.gender, 20) : u.gender,
    marital_status: b.maritalStatus !== undefined ? clean(b.maritalStatus, 20) : u.marital_status,
    district: b.district !== undefined ? clean(b.district, 60) : u.district,
    city: b.city !== undefined ? clean(b.city, 60) : u.city,
    area: b.area !== undefined ? clean(b.area, 80) : u.area,
    address_line: b.addressLine !== undefined ? clean(b.addressLine, 200) : u.address_line,
    monthly_income: b.monthlyIncome !== undefined ? cleanNum(b.monthlyIncome) : u.monthly_income,
    monthly_expenses: b.monthlyExpenses !== undefined ? cleanNum(b.monthlyExpenses) : u.monthly_expenses,
    other_income: b.otherIncome !== undefined ? cleanNum(b.otherIncome) : u.other_income
  };
  if (b.nationalId !== undefined && b.nationalId && !b.nationalId.includes('•')) {
    fields.national_id_enc = encryptText(clean(b.nationalId, 40));
    fields.id_type = clean(b.idType, 20) || u.id_type;
  }
  if (b.employment !== undefined) fields.employment = JSON.stringify(b.employment || {});
  if (b.business !== undefined) fields.business = JSON.stringify(b.business || {});
  if (b.nextOfKin !== undefined) fields.next_of_kin = JSON.stringify(b.nextOfKin || {});
  const sets = Object.keys(fields).map(k => `${k} = ?`).join(', ');
  run(`UPDATE customers SET ${sets}, updated_at = datetime('now') WHERE id = ?`, ...Object.values(fields), u.id);
  const after = publicUser(q1(`SELECT * FROM customers WHERE id = ?`, u.id));
  audit('customer', u.id, 'profile.updated', 'customer', u.id, before, after, ctx.ip, ctx.ua);
  activity(u.id, 'Profile updated', null, ctx.ip, ctx.ua);
  return { user: after };
}

export async function updatePrefs(ctx) {
  const u = requireAuth(ctx);
  const allowed = ['sms', 'email', 'reminders', 'marketing', 'theme', 'language'];
  const prefs = json(u.prefs, {});
  for (const k of allowed) if (ctx.body[k] !== undefined) prefs[k] = typeof ctx.body[k] === 'boolean' ? ctx.body[k] : clean(ctx.body[k], 20);
  run(`UPDATE customers SET prefs = ? WHERE id = ?`, JSON.stringify(prefs), u.id);
  audit('customer', u.id, 'prefs.updated', 'customer', u.id, null, prefs, ctx.ip, ctx.ua);
  return { prefs };
}

export async function setTwoFactor(ctx) {
  const u = requireAuth(ctx);
  const enable = !!ctx.body.enabled;
  if (enable && !u.phone_verified) throw new HttpError(400, 'Verify your phone number before enabling two-factor authentication.');
  run(`UPDATE customers SET twofa_enabled = ? WHERE id = ?`, enable ? 1 : 0, u.id);
  notify(u.id, { category: 'security', title: `Two-factor authentication ${enable ? 'enabled' : 'disabled'}`, body: `2FA was ${enable ? 'enabled' : 'disabled'} on your account. ${enable ? 'You will need a code from your phone at each sign-in.' : 'If this was not you, contact support immediately.'}`, channels: ['inapp', 'sms', 'email'] });
  audit('customer', u.id, 'auth.2fa_changed', 'customer', u.id, null, { enabled: enable }, ctx.ip, ctx.ua);
  return { twofaEnabled: enable };
}

export async function listSessions(ctx) {
  const u = requireAuth(ctx);
  return { sessions: q(`SELECT id, ip, user_agent, created_at, last_seen, expires_at, (id = ?) current FROM sessions WHERE customer_id = ? AND revoked = 0 AND expires_at > datetime('now') ORDER BY last_seen DESC`, u.session_id, u.id) };
}
export async function revokeSession(ctx) {
  const u = requireAuth(ctx);
  run(`UPDATE sessions SET revoked = 1 WHERE id = ? AND customer_id = ?`, Number(ctx.params.id), u.id);
  audit('customer', u.id, 'auth.session_revoked', 'session', ctx.params.id, null, null, ctx.ip, ctx.ua);
  return { ok: true };
}
export async function activityHistory(ctx) {
  const u = requireAuth(ctx);
  return { activity: q(`SELECT * FROM activity_log WHERE customer_id = ? ORDER BY id DESC LIMIT 200`, u.id) };
}
