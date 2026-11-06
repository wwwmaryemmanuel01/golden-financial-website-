/* Read-through access to centrally managed settings. Customer APIs never write here. */
import { getSetting, setSetting, q, run, tx } from './db.js';
import GFS from '../shared/core.mjs';
import CONTENT from '../shared/content.mjs';
import { HttpError } from './http.js';
export const products = () => getSetting('products', GFS.PRODUCTS);
export const product = id => products().find(p => p.id === id);
// Historical-only lookup: never use this for new applications or public discovery.
export const recordProduct = id => product(id) || GFS.productById(id, true);
export const announcements = () => q(`SELECT slug,title,body,category,pinned,published_at,starts_at,expires_at,updated_at,link_url,link_label,source FROM announcements WHERE status='published' AND (starts_at IS NULL OR starts_at<=datetime('now')) AND (expires_at IS NULL OR expires_at>datetime('now')) ORDER BY pinned DESC,published_at DESC,slug`).map(a => ({ id:a.slug, slug:a.slug, title:a.title, body:a.body, category:a.category, pinned:!!a.pinned, publishedAt:a.published_at, startsAt:a.starts_at, expiresAt:a.expires_at, updatedAt:a.updated_at, linkUrl:a.link_url, linkLabel:a.link_label, source:a.source }));
export function publishAnnouncements(items) {
  return tx(() => {
    const at = new Date().toISOString();
    // The supplied set is authoritative. Omitted notices are withdrawn, never erased.
    run(`UPDATE announcements SET status='withdrawn',updated_at=? WHERE status='published'`, at);
    for (const a of items) run(`INSERT INTO announcements(slug,title,body,category,pinned,published_at,starts_at,expires_at,updated_at,link_url,link_label,status,source) VALUES(?,?,?,?,?,?,?,?,?,?,?,'published','system') ON CONFLICT(slug) DO UPDATE SET title=excluded.title,body=excluded.body,category=excluded.category,pinned=excluded.pinned,published_at=excluded.published_at,starts_at=excluded.starts_at,expires_at=excluded.expires_at,updated_at=excluded.updated_at,link_url=excluded.link_url,link_label=excluded.link_label,status='published',source='system'`, a.id,a.title,a.body,a.category,a.pinned?1:0,a.publishedAt,a.startsAt,a.expiresAt,at,a.linkUrl,a.linkLabel);
    setSetting('announcements_revision', at);
  });
}
export const blogPosts = () => getSetting('blog_posts', CONTENT.BLOG_POSTS);
export const rules = () => ({ ...GFS.RULES, ...getSetting('rules', {}) });
export const methods = () => getSetting('payment_methods', GFS.PAYMENT_METHODS);
export const method = id => methods().find(m => m.id === id && m.enabled !== false);
export const company = () => getSetting('company', GFS.COMPANY);
const finite = (n, min, max) => Number.isFinite(Number(n)) && Number(n) >= min && Number(n) <= max;
export function validateSettingsPatch(b) {
  if (!b || typeof b !== 'object' || Array.isArray(b)) throw new HttpError(400, 'Expected a settings object.');
  const allowed = ['company', 'products', 'payment_methods', 'branches', 'theme', 'rules', 'blog_posts', 'announcements'];
  if (Object.keys(b).some(k => !allowed.includes(k))) throw new HttpError(400, 'Unknown system setting.');
  if (b.announcements !== undefined) {
    if (!Array.isArray(b.announcements) || b.announcements.length > 50) throw new HttpError(400, 'Publish at most 50 announcements.');
    const ids = new Set();
    b.announcements = b.announcements.map(a => {
      if (!a || typeof a !== 'object') throw new HttpError(400, 'Invalid announcement.');
      const id = typeof a.id === 'string' ? a.id.trim() : '', title = typeof a.title === 'string' ? a.title.trim() : '', body = typeof a.body === 'string' ? a.body.trim() : '', category = a.category || 'general';
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) || id.length < 2 || id.length > 100 || ids.has(id)) throw new HttpError(400, 'Each announcement needs a unique lowercase slug (2–100 characters).');
      ids.add(id);
      if (title.length < 3 || title.length > 140 || body.length < 10 || body.length > 4000) throw new HttpError(400, 'Announcement titles need 3–140 characters and messages 10–4000.');
      if (!['general','service','product','security','maintenance','promotion'].includes(category)) throw new HttpError(400, 'Invalid announcement category.');
      const date = (v, label) => { if (v == null || v === '') return null; if (typeof v !== 'string' || !Number.isFinite(Date.parse(v))) throw new HttpError(400, `Invalid ${label}.`); return new Date(v).toISOString(); };
      const publishedAt = date(a.publishedAt || new Date().toISOString(), 'publication date'), startsAt = date(a.startsAt, 'start date'), expiresAt = date(a.expiresAt, 'expiry date');
      if (startsAt && expiresAt && expiresAt <= startsAt) throw new HttpError(400, 'Announcement expiry must follow its start.');
      let linkUrl = a.linkUrl == null ? '' : String(a.linkUrl).trim(), linkLabel = a.linkLabel == null ? 'Read more' : String(a.linkLabel).trim();
      if (linkUrl.length > 600 || linkLabel.length > 60) throw new HttpError(400, 'Announcement link is too long.');
      if (linkUrl) {
        if (/^\/(?!\/)/.test(linkUrl)) { if (/[\\\r\n]/.test(linkUrl) || linkUrl.includes('#')) throw new HttpError(400, 'Internal links must be customer-site paths without fragments.'); }
        else { let u; try { u = new URL(linkUrl); } catch { throw new HttpError(400, 'Announcement links must be internal paths or HTTPS URLs.'); } if (u.protocol !== 'https:' || u.username || u.password) throw new HttpError(400, 'External announcement links must use HTTPS without credentials.'); linkUrl = u.href; }
      }
      return { id, title, body, category, pinned:a.pinned === true, publishedAt, startsAt, expiresAt, linkUrl:linkUrl || null, linkLabel };
    });
  }
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
