/* Database backups: WAL checkpoint + consistent file copy, kept 14 days.
   Run daily by the server, or manually: npm run backup */
import fs from 'node:fs';
import path from 'node:path';
import { db } from './db.js';
import { DB_PATH, BACKUP_DIR } from './config.js';

export function runBackup() {
  db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
  const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
  const dest = path.join(BACKUP_DIR, `gfs-${stamp}.sqlite`);
  fs.copyFileSync(DB_PATH, dest);
  // retain 14 days
  const files = fs.readdirSync(BACKUP_DIR).filter(f => f.startsWith('gfs-') && f.endsWith('.sqlite')).sort();
  while (files.length > 14) { const old = files.shift(); try { fs.unlinkSync(path.join(BACKUP_DIR, old)); } catch {} }
  console.log(`[backup] ${dest}`);
  return dest;
}

if (process.argv[1] && process.argv[1].endsWith('backup.js')) runBackup();
