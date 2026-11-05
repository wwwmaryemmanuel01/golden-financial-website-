/* Consistent SQLite snapshots + encrypted document copies. The encryption key
   is deliberately NOT included: store it separately in a secret manager. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { backup } from 'node:sqlite';
import { db } from './db.js';
import { BACKUP_DIR, UPLOAD_DIR } from './config.js';
const digest = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
export async function runBackup() {
  const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
  const dir = path.join(BACKUP_DIR, `gfs-${stamp}`);
  fs.mkdirSync(path.join(dir, 'documents'), { recursive: true, mode: 0o700 });
  const dbFile = path.join(dir, 'gfs.sqlite');
  await backup(db, dbFile);
  const files = [{ path: 'gfs.sqlite', sha256: digest(dbFile) }];
  for (const name of fs.readdirSync(UPLOAD_DIR).filter(f => f.endsWith('.enc'))) {
    const target = path.join(dir, 'documents', name); fs.copyFileSync(path.join(UPLOAD_DIR, name), target); fs.chmodSync(target, 0o600);
    files.push({ path: `documents/${name}`, sha256: digest(target) });
  }
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ version: 2, createdAt: new Date().toISOString(), files, keyIncluded: false }, null, 2), { mode: 0o600 });
  const folders = fs.readdirSync(BACKUP_DIR).filter(f => /^gfs-\d/.test(f) && fs.statSync(path.join(BACKUP_DIR, f)).isDirectory()).sort();
  while (folders.length > 14) fs.rmSync(path.join(BACKUP_DIR, folders.shift()), { recursive: true, force: true });
  console.log(`[backup] ${dir}`);
  return dir;
}
if (process.argv[1] && process.argv[1].endsWith('backup.js')) runBackup().catch(e => { console.error(e.message); process.exitCode = 1; });
