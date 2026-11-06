/* Zero-dependency regression checks for both GitHub Pages publishing layouts:
   branch root (legacy/Jekyll) and the public/ Actions artifact. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import GFS from '../shared/core.mjs';
import CONTENT from '../shared/content.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
let checks = 0;
const check = (name, fn) => { fn(); checks++; console.log(`  ✓ ${name}`); };
const entry = read('index.html');
const site = read('public/index.html');
const workflow = read('.github/workflows/deploy-pages.yml');

check('root homepage exists instead of exposing the repository README', () => {
  assert.match(entry, /<!DOCTYPE html>/i);
  assert.match(entry, /Golden Financial Services/);
  assert.ok(fs.existsSync(path.join(root, '.nojekyll')));
});
check('root metadata refresh opens the actual website', () => {
  const refresh = entry.match(/http-equiv="refresh"\s+content="0;\s*url=([^"]+)"/i);
  assert.ok(refresh);
  assert.ok(fs.existsSync(path.resolve(root, refresh[1], 'index.html')));
});
check('root JavaScript redirect preserves route and query parameters', () => {
  const script = entry.match(/<script>([\s\S]*?)<\/script>/i);
  assert.ok(script);
  let destination;
  const location = { href: 'https://wwwmaryemmanuel01.github.io/golden-financial-website-/?source=nav#/portal/loans', search: '?source=nav', hash: '#/portal/loans', replace(url) { destination = url; } };
  vm.runInNewContext(script[1], { window: { location }, URL });
  assert.equal(destination, 'https://wwwmaryemmanuel01.github.io/golden-financial-website-/public/?source=nav#/portal/loans');
});
check('root fallback link and branding assets resolve', () => {
  assert.match(entry, /href="\.\/public\/"/);
  for (const match of entry.matchAll(/(?:src|href)="([^"]+)"/g)) {
    const target = match[1];
    if (/^(?:https?:|data:|#)/.test(target)) continue;
    assert.ok(fs.existsSync(path.resolve(root, target)), `Missing root asset: ${target}`);
  }
});
check('website loads the base theme, rebuilt interface and dark experience layer', () => {
  assert.match(site, /href="css\/theme\.css"/);
  assert.match(site, /href="css\/rebuild\.css"/);
  assert.match(site, /href="css\/experience\.css"/);
  assert.ok(site.indexOf('css/theme.css') < site.indexOf('css/rebuild.css'));
  assert.ok(site.indexOf('css/rebuild.css') < site.indexOf('css/experience.css'));
});
check('all website scripts, stylesheets, icons and manifest exist', () => {
  for (const match of site.matchAll(/(?:src|href)="([^"]+)"/g)) {
    const target = match[1];
    if (/^(?:https?:|data:|#)/.test(target)) continue;
    assert.ok(fs.existsSync(path.resolve(root, 'public', target)), `Missing website asset: ${target}`);
  }
  assert.match(site, /src="js\/portal-extra\.js"/);
  for (const script of ['js/content.js', 'js/blog.js', 'js/resources.js']) assert.ok(site.includes(`src="${script}"`), `Missing ${script}`);
  assert.ok(site.indexOf('js/content.js') < site.indexOf('js/local.js'));
  assert.ok(site.indexOf('js/blog.js') < site.indexOf('js/public-pages.js'));
  assert.ok(fs.existsSync(path.join(root, 'public/.nojekyll')));
});
check('offline shell precaches only files that actually exist', () => {
  const worker = read('public/sw.js');
  const shell = worker.match(/const SHELL = \[([^\]]+)\]/);
  assert.ok(shell);
  const files = [...shell[1].matchAll(/'([^']+)'/g)].map(match => match[1]);
  assert.ok(files.length > 10);
  for (const asset of ['./css/experience.css', './js/content.js', './js/blog.js', './js/resources.js', './assets/logo-dark.png']) assert.ok(files.includes(asset), `Offline shell missing ${asset}`);
  for (const file of files) assert.ok(fs.existsSync(path.resolve(root, 'public', file)), `Missing offline asset: ${file}`);
});
check('Actions publishes public/ only after checking its entrypoints', () => {
  assert.match(workflow, /branches:\s*\[main\]/);
  assert.match(workflow, /path:\s*public\s*$/m);
  assert.match(workflow, /actions\/deploy-pages@v4/);
  assert.match(workflow, /node tests\/pages-entrypoint\.js/);
});
check('dark header and motion controls are packaged', () => {
  const css = read('public/css/experience.css');
  assert.match(css, /--admin-ink:#0F1115/);
  assert.match(css, /data-motion="off"/);
  assert.match(css, /prefers-reduced-motion:reduce/);
  assert.match(read('public/js/app.js'), /brand\(true\)/);
  assert.match(read('public/js/app.js'), /shellAbort\.abort\(\)/);
});
check('editorial defaults are structured plain text with unique slugs', () => {
  const content = CONTENT;
  assert.ok(content.BLOG_POSTS.length >= 6);
  assert.equal(new Set(content.BLOG_POSTS.map(p => p.slug)).size, content.BLOG_POSTS.length);
  for (const post of content.BLOG_POSTS) {
    assert.ok(post.sections.length >= 3);
    assert.ok(content.CATEGORIES.includes(post.category));
    assert.ok(!/<script|innerHTML|javascript:/i.test(JSON.stringify(post)));
  }
});
check('public catalogue contains exactly the five requested categories', () => {
  const core = GFS;
  assert.deepEqual(core.PRODUCTS.map(p => [p.id, p.name]), [['PL', 'Personal'], ['BL', 'Business'], ['SA', 'Salary Advance'], ['AL', 'Agriculture'], ['EL', 'Emergency']]);
  assert.equal(core.productById('ED'), null);
  assert.ok(core.productById('ED', true));
  assert.ok(!/Compare all ten|Choose from ten|Ten loan products/.test(read('public/js/public-pages.js')));
});
check('the notification layer can never swallow taps on the page', () => {
  const theme = read('public/css/theme.css'), rebuild = read('public/css/rebuild.css');
  const rules = (css, selector) => [...css.matchAll(new RegExp('(?:^|[},])\\s*' + selector.replace(/([.#])/g, '\\$1') + '\\s*{([^}]*)}', 'g'))].map(m => m[1]);
  const toastLayer = [...rules(theme, '#toasts'), ...rules(rebuild, '#toasts')].join(';');
  assert.match(toastLayer, /pointer-events:\s*none/, 'The toast container is fixed and must not intercept pointer events.');
  assert.match(rebuild, /\.toast\{[^}]*pointer-events:\s*none/, 'Toasts are informational and must not intercept taps either.');
  // A fixed layer anchored on both edges stretches over the whole viewport.
  for (const layer of rules(rebuild, '#toasts')) assert.match(layer, /top:\s*auto/, 'The toast layer must not be anchored to both the top and the bottom.');
});
check('the homepage emblem keeps the dark system colour inside the ring only', () => {
  const css = read('public/css/experience.css'), home = read('public/js/public-pages.js');
  const seal = css.match(/\.hero-logo-seal\{([^}]*)\}/)[1], visual = css.match(/\.hero-visual\{([^}]*)\}/)[1];
  assert.match(seal, /border-radius:\s*50%/, 'The dark background must be bounded by the circle.');
  assert.match(seal, /#0F1115|#1B1F27/, 'The emblem ring keeps the system header colour.');
  assert.match(visual, /background:\s*none/, 'The hero card itself must not be filled with the dark colour.');
  const emblem = home.match(/<div class="hero-logo-seal"><img src="assets\/([^"]+)"/);
  assert.ok(emblem);
  const logo = emblem[1];
  const opaque = (() => { try { return fs.readFileSync(path.join(root, 'public/assets', logo)).length; } catch { return 0; } })();
  assert.ok(opaque > 0, `Missing emblem asset: ${logo}`);
  assert.match(home, /hero-logo-seal"><img src="assets\/logo\.png"/, 'The transparent emblem must sit on the dark ring, not an opaque black plate.');
});
console.log(`\n  ${checks} GitHub Pages packaging checks passed.\n`);
