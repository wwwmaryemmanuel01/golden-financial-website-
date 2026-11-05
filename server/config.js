import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, '..');
export const PUBLIC_DIR = path.join(ROOT, 'public');
export const DATA_DIR = process.env.GFS_DATA_DIR || path.join(ROOT, 'data');
export const UPLOAD_DIR = path.join(DATA_DIR, 'documents');
export const BACKUP_DIR = path.join(DATA_DIR, 'backups');
export const DB_PATH = path.join(DATA_DIR, 'gfs.sqlite');

for (const d of [DATA_DIR, UPLOAD_DIR, BACKUP_DIR]) fs.mkdirSync(d, { recursive: true });

const keyFile = path.join(DATA_DIR, '.server-key');
let SERVER_KEY;
if (process.env.GFS_SERVER_KEY) SERVER_KEY = Buffer.from(process.env.GFS_SERVER_KEY, 'hex');
else if (fs.existsSync(keyFile)) SERVER_KEY = Buffer.from(fs.readFileSync(keyFile, 'utf8').trim(), 'hex');
else {
  SERVER_KEY = crypto.getRandomValues(new Uint8Array(32));
  fs.writeFileSync(keyFile, Buffer.from(SERVER_KEY).toString('hex'), { mode: 0o600 });
}
export { SERVER_KEY };

export const PORT = Number(process.env.PORT || 3000);
export const HOST = process.env.HOST || '0.0.0.0';
export const NODE_ENV = process.env.NODE_ENV || 'development';
export const IS_PROD = NODE_ENV === 'production';
// Outbox transport: 'outbox' stores messages for inspection (no external send).
// Set GFS_SMS_WEBHOOK / GFS_EMAIL_WEBHOOK to forward to a real provider gateway.
export const SMS_WEBHOOK = process.env.GFS_SMS_WEBHOOK || '';
export const EMAIL_WEBHOOK = process.env.GFS_EMAIL_WEBHOOK || '';
export const SMS_SENDER = process.env.GFS_SMS_SENDER || 'GFS';
// Server-to-server key for the golden-loan-services back-office sync.
export const INTEGRATION_KEY = process.env.GFS_INTEGRATION_KEY || '';
export const PUBLIC_BASE_URL = process.env.GFS_PUBLIC_URL || '';
