/* Read-through access to centrally managed settings. Customer APIs never write here. */
import { getSetting } from './db.js';
import GFS from '../shared/core.mjs';
import CONTENT from '../shared/content.mjs';
import { HttpError } from './http.js';
export const products = () => getSetting('products', GFS.PRODUCTS);
export const product = id => products().find(p => p.id === id);
// Historical-only lookup: never use this for new applications or public discovery.
export const recordProduct = id => product(id) || GFS.productById(id, true);
export const blogPosts = () => getSetting('blog_posts', CONTENT.BLOG_POSTS);
export const rules = () => ({ ...GFS.RULES, ...getSetting('rules', {}) });
export const methods = () => getSetting('payment_methods', GFS.PAYMENT_METHODS);
export const method = id => methods().find(m => m.id === id && m.enabled !== false);
export const company = () => getSetting('company', GFS.COMPANY);
const finite = (n, min, max) => Number.isFinite(Number(n)) && Number(n) >= min && Number(n) <= max;
export function validateSettingsPatch(b) {
  if (!b || typeof b !== 'object' || Array.isArray(b)) throw new HttpError(400, 'Expected a settings object.');
  const allowed = ['company', 'products', 'payment_methods', 'branches', 'theme', 'rules', 'blog_posts'];
  if (Object.keys(b).some(k => !allowed.includes(k))) throw new HttpError(400, 'Unknown system setting.');
  if (b.products !== undefined) {
    if (!Array.isArray(b.products) || b.products.length !== GFS.PRODUCTS.length || new Set(b.products.map(p => p.id)).size !== GFS.PRODUCTS.length) throw new HttpError(400, 'Publish exactly the five supported loan categories, each once.');
    for (const p of b.products) {
      if (!GFS.productById(p.id) || typeof p.name !== 'string' || !p.name.trim() || !finite(p.min, 1, 1e9) || !finite(p.max, Number(p.min), 1e9) || !finite(p.rate, 0, 100) || !finite(p.fee, 0, 100) || !Array.isArray(p.terms) || !p.terms.length || p.terms.length > 30 || !p.terms.every(t => Number.isInteger(t) && t > 0 && t <= 360) || !Array.isArray(p.freqs) || !p.freqs.length || !p.freqs.every(f => Object.hasOwn(GFS.RULES.periodsPerYear, f)) || !Number.isInteger(p.guarantors) || p.guarantors < 0 || p.guarantors > 3) throw new HttpError(400, 'A loan product has invalid terms, rates, limits or repayment frequencies.');
    }
  }
  if (b.blog_posts !== undefined) {
    if (!Array.isArray(b.blog_posts) || b.blog_posts.length > 100 || JSON.stringify(b.blog_posts).length > 700000) throw new HttpError(400, 'Publish at most 100 articles within the content size limit.');
    const slugs = new Set();
    const text = (v, min, max) => typeof v === 'string' && v.trim().length >= min && v.length <= max;
    const date = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v;
    for (const post of b.blog_posts) {
      if (!post || typeof post !== 'object' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(post.slug || '') || post.slug.length > 120 || slugs.has(post.slug) || !text(post.title, 5, 180) || !text(post.excerpt, 10, 600) || !text(post.author, 2, 100) || !CONTENT.CATEGORIES.includes(post.category) || !date(post.publishedAt) || !date(post.updatedAt) || Date.parse(post.updatedAt) < Date.parse(post.publishedAt) || !text(post.takeaway, 5, 1200) || (post.productId != null && !GFS.productById(post.productId)) || !['plans', 'interest', 'business', 'agriculture', 'salary', 'emergency', 'security', 'repayments'].includes(post.art) || !Array.isArray(post.tags) || post.tags.length > 12 || !post.tags.every(t => text(t, 1, 60)) || !Array.isArray(post.sections) || post.sections.length < 1 || post.sections.length > 20) throw new HttpError(400, 'Articles need unique slugs, valid dates and categories, plain text, an allowed illustration and 1–20 sections.');
      slugs.add(post.slug);
      for (const section of post.sections) {
        if (!section || !text(section.title, 3, 160) || !Array.isArray(section.paragraphs) || !section.paragraphs.length || section.paragraphs.length > 20 || !section.paragraphs.every(t => text(t, 1, 6000)) || (section.bullets !== undefined && (!Array.isArray(section.bullets) || section.bullets.length > 20 || !section.bullets.every(t => text(t, 1, 1000))))) throw new HttpError(400, 'Each article section needs a heading and plain-text paragraphs.');
      }
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
