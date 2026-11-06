/* ESM bridge: loads the isomorphic editorial library for the Node backend.
   The browser loads public/js/content.js directly as a plain <script>. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(__dirname, '../public/js/content.js'), 'utf8');
const mod = { exports: {} };
new Function('module', 'exports', 'self', src)(mod, mod.exports, undefined);
export default mod.exports;
