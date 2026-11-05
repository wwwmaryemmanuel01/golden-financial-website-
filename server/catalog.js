/* Read-through access to centrally managed settings. Customer APIs never write here. */
import { getSetting } from './db.js';
import GFS from '../shared/core.mjs';
import { HttpError } from './http.js';
export const products = () => getSetting('products', GFS.PRODUCTS);
export const product = id => products().find(p => p.id === id);
export const rules = () => ({ ...GFS.RULES, ...getSetting('rules', {}) });
export const methods = () => getSetting('payment_methods', GFS.PAYMENT_METHODS);
export const method = id => methods().find(m => m.id === id && m.enabled !== false);
export const company = () => getSetting('company', GFS.COMPANY);
const finite = (n, min, max) => Number.isFinite(Number(n)) && Number(n) >= min && Number(n) <= max;
export function validateSettingsPatch(b) {
  if (!b || typeof b !== 'object' || Array.isArray(b)) throw new HttpError(400, 'Expected a settings object.');
  const allowed = ['company', 'products', 'payment_methods', 'branches', 'theme', 'rules'];
  if (Object.keys(b).some(k => !allowed.includes(k))) throw new HttpError(400, 'Unknown system setting.');
  if (b.products !== undefined) {
    if (!Array.isArray(b.products) || b.products.length !== 10 || new Set(b.products.map(p => p.id)).size !== 10) throw new HttpError(400, 'Publish all ten unique loan products.');
    for (const p of b.products) {
      if (!GFS.productById(p.id) || typeof p.name !== 'string' || !p.name.trim() || !finite(p.min, 1, 1e9) || !finite(p.max, Number(p.min), 1e9) || !finite(p.rate, 0, 100) || !finite(p.fee, 0, 100) || !Array.isArray(p.terms) || !p.terms.length || p.terms.length > 30 || !p.terms.every(t => Number.isInteger(t) && t > 0 && t <= 360) || !Array.isArray(p.freqs) || !p.freqs.length || !p.freqs.every(f => Object.hasOwn(GFS.RULES.periodsPerYear, f)) || !Number.isInteger(p.guarantors) || p.guarantors < 0 || p.guarantors > 3) throw new HttpError(400, 'A loan product has invalid terms, rates, limits or repayment frequencies.');
    }
  }
  if (b.rules) {
    const ranges = { affordabilityCap: [.01, 1], latePenaltyPct: [0, 100], graceDays: [0, 31], maxActiveLoans: [1, 10], maxExposure: [1, 1e10], minAge: [18, 100], maxAge: [18, 100], otpTtlMinutes: [1, 30], sessionHours: [1, 24], idleTimeoutMinutes: [1, 120], maxLoginAttempts: [3, 20], lockoutMinutes: [1, 1440] };
    for (const [k, v] of Object.entries(b.rules)) if (!ranges[k] || !finite(v, ...ranges[k])) throw new HttpError(400, `Invalid rule: ${k}.`);
  }
  if (b.payment_methods && (!Array.isArray(b.payment_methods) || !b.payment_methods.length || b.payment_methods.some(m => !GFS.PAYMENT_METHODS.some(x => x.id === m.id)))) throw new HttpError(400, 'Invalid payment methods.');
  for (const k of ['company', 'branches', 'theme', 'payment_methods']) if (b[k] !== undefined && JSON.stringify(b[k]).includes('secret')) throw new HttpError(400, 'Provider secrets must not be published as website settings.');
  return b;
}
