/* Zero-dependency regression checks for both GitHub Pages publishing layouts:
   branch root (legacy/Jekyll) and the public/ Actions artifact. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
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
check('website loads both base theme and rebuilt responsive interface', () => {
  assert.match(site, /href="css\/theme\.css"/);
  assert.match(site, /href="css\/rebuild\.css"/);
  assert.ok(site.indexOf('css/theme.css') < site.indexOf('css/rebuild.css'));
});
check('all website scripts, stylesheets, icons and manifest exist', () => {
  for (const match of site.matchAll(/(?:src|href)="([^"]+)"/g)) {
    const target = match[1];
    if (/^(?:https?:|data:|#)/.test(target)) continue;
    assert.ok(fs.existsSync(path.resolve(root, 'public', target)), `Missing website asset: ${target}`);
  }
  assert.match(site, /src="js\/portal-extra\.js"/);
  assert.ok(fs.existsSync(path.join(root, 'public/.nojekyll')));
});
check('offline shell precaches only files that actually exist', () => {
  const worker = read('public/sw.js');
  const shell = worker.match(/const SHELL = \[([^\]]+)\]/);
  assert.ok(shell);
  const files = [...shell[1].matchAll(/'([^']+)'/g)].map(match => match[1]);
  assert.ok(files.length > 10);
  for (const file of files) {
    assert.ok(fs.existsSync(path.resolve(root, 'public', file)), `Missing offline asset: ${file}`);
  }
});
check('Actions publishes public/ only after checking its entrypoints', () => {
  assert.match(workflow, /branches:\s*\[main\]/);
  assert.match(workflow, /path:\s*public\s*$/m);
  assert.match(workflow, /actions\/deploy-pages@v4/);
  assert.match(workflow, /node tests\/pages-entrypoint\.js/);
});
console.log(`\n  ${checks} GitHub Pages packaging checks passed.\n`);
