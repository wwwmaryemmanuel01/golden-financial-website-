/* Deployment configuration. Secrets stay on the server, never in public/. */
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, '..');
export const PUBLIC_DIR = path.join(ROOT, 'public');
export const DATA_DIR = path.resolve(process.env.GFS_DATA_DIR || path.join(ROOT, 'data'));
export const UPLOAD_DIR = path.join(DATA_DIR, 'documents');
export const BACKUP_DIR = path.join(DATA_DIR, 'backups');
export const DB_PATH = path.join(DATA_DIR, 'gfs.sqlite');
for (const d of [DATA_DIR, UPLOAD_DIR, BACKUP_DIR]) fs.mkdirSync(d, { recursive: true, mode: 0o700 });

export const NODE_ENV = process.env.NODE_ENV || 'development';
export const IS_PROD = NODE_ENV === 'production';
// A sandbox must be explicitly enabled in production. Never infer it from a URL.
export const DEMO_MODE = process.env.GFS_DEMO_MODE === 'true' || (!IS_PROD && process.env.GFS_DEMO_MODE !== 'false');
const keyFile = path.join(DATA_DIR, '.server-key');
let SERVER_KEY;
if (process.env.GFS_SERVER_KEY) SERVER_KEY = Buffer.from(process.env.GFS_SERVER_KEY, 'hex');
else if (fs.existsSync(keyFile)) SERVER_KEY = Buffer.from(fs.readFileSync(keyFile, 'utf8').trim(), 'hex');
else {
  SERVER_KEY = crypto.randomBytes(32);
  fs.writeFileSync(keyFile, SERVER_KEY.toString('hex'), { mode: 0o600 });
}
if (SERVER_KEY.length !== 32) throw new Error('GFS_SERVER_KEY must contain exactly 32 bytes encoded as 64 hexadecimal characters.');
export { SERVER_KEY };
export const PORT = Number(process.env.PORT || 3000);
export const HOST = process.env.HOST || '0.0.0.0';
export const PUBLIC_BASE_URL = process.env.GFS_PUBLIC_URL || '';
export const ALLOWED_ORIGINS = (process.env.GFS_ALLOWED_ORIGINS || '').split(',').map(x => x.trim()).filter(Boolean);
export const SMS_WEBHOOK = process.env.GFS_SMS_WEBHOOK || '';
export const EMAIL_WEBHOOK = process.env.GFS_EMAIL_WEBHOOK || '';
export const NOTIFICATION_KEY = process.env.GFS_NOTIFICATION_KEY || '';
export const SMS_SENDER = process.env.GFS_SMS_SENDER || 'GFS';
export const INTEGRATION_KEY = process.env.GFS_INTEGRATION_KEY || '';
export const SYSTEM_URL = process.env.GFS_SYSTEM_URL || 'https://wwwmaryemmanuel01.github.io/golden-loan-services/';
export const SYSTEM_API_URL = process.env.GFS_SYSTEM_API_URL || '';
export const AI_API_URL = process.env.GFS_AI_API_URL || '';
export const AI_API_KEY = process.env.GFS_AI_API_KEY || '';
if (IS_PROD && !INTEGRATION_KEY) console.warn('[config] Back-office integration is disabled until GFS_INTEGRATION_KEY is configured.');
