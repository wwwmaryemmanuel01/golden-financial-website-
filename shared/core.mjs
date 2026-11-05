/* ESM bridge: loads the isomorphic UMD core (shared/core.js) for the Node
   backend. The browser loads core.js directly as a plain <script>. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(__dirname, '../public/js/core.js'), 'utf8');
const mod = { exports: {} };
new Function('module', 'exports', 'self', src)(mod, mod.exports, undefined);
export default mod.exports;
