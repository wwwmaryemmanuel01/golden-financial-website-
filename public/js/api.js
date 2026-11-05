/* Transport with an explicit boundary: authoritative backend OR device-local
   sandbox. A backend outage never silently switches accounts into demo mode. */
'use strict';
const API = (() => {
  let mode = 'unknown', token = '', base = '', explicitBackend = false, connectionError = '';
  const listeners = [];
  class ApiError extends Error { constructor(message, status, code) { super(message); this.status = status; this.code = code; } }
  const url = path => { const clean = String(path).replace(/^\//, ''); return base ? new URL(clean, base).href : clean; };
  async function init() {
    connectionError = '';
    try {
      const res = await fetch('runtime-config.json', { cache: 'no-store', headers: { Accept: 'application/json' } });
      if (res.ok && (res.headers.get('content-type') || '').includes('json')) {
        const cfg = await res.json();
        if (cfg.apiBaseUrl) {
          const parsed = new URL(cfg.apiBaseUrl, location.href);
          if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password || ['localhost', '127.0.0.1', '0.0.0.0'].includes(parsed.hostname)) throw new Error('Invalid backend URL configuration.');
          base = parsed.href.endsWith('/') ? parsed.href : parsed.href + '/'; explicitBackend = true;
        }
      }
    } catch (e) { if (explicitBackend) { connectionError = e.message; mode = 'unavailable'; return mode; } }
    try {
      const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 4000);
      const res = await fetch(url('api/health'), { signal: ctl.signal, headers: { Accept: 'application/json' }, cache: 'no-store' });
      clearTimeout(timer);
      const health = res.ok ? await res.json() : null;
      if (health?.status === 'ok' && health.service === 'golden-financial-customer-api') { mode = 'server'; return mode; }
      if (explicitBackend) throw new Error('The configured backend did not identify itself as the Golden customer API.');
    } catch (e) {
      if (explicitBackend) { connectionError = e.message || 'Configured backend is unavailable.'; mode = 'unavailable'; return mode; }
    }
    // Only a static host without a configured backend enters the sandbox.
    if (location.hostname.endsWith('.github.io') || location.protocol === 'file:' || document.documentElement.dataset.staticDemo === 'true') {
      mode = 'local'; await LocalAPI.init(); return mode;
    }
    connectionError = 'The secure backend is unavailable. No account data has been switched to demo storage.'; mode = 'unavailable'; return mode;
  }
  async function request(method, path, body) {
    if (mode === 'unknown') await init();
    if (mode === 'unavailable') throw new ApiError(connectionError, 0, 'BACKEND_UNAVAILABLE');
    if (mode === 'local') return LocalAPI.request(method, path, body);
    const headers = { Accept: 'application/json', 'X-GFS-Request': 'website' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (token) headers.Authorization = `Bearer ${token}`;
    let res;
    try { res = await fetch(url(path), { method, headers, credentials: base ? 'omit' : 'same-origin', body: body !== undefined ? JSON.stringify(body) : undefined }); }
    catch { throw new ApiError('Cannot reach the server. Check your connection and try again.', 0, 'NETWORK'); }
    let data = {}; try { data = await res.json(); } catch {}
    if (!res.ok) { if (res.status === 401) { token = ''; listeners.forEach(f => f()); } throw new ApiError(data.error || `Request failed (${res.status}).`, res.status, data.code); }
    return data;
  }
  const get = p => request('GET', p), post = (p, b = {}) => request('POST', p, b), put = (p, b = {}) => request('PUT', p, b), del = p => request('DELETE', p);
  function setToken(t) { token = t || ''; } // Memory only; never persist bearer secrets.
  function onUnauthorized(fn) { listeners.push(fn); }
  async function fileResponse(path) {
    if (mode === 'unknown') await init();
    const res = await fetch(url(path), { headers: token ? { Authorization: `Bearer ${token}` } : {}, credentials: base ? 'omit' : 'same-origin' });
    if (!res.ok) { let d = {}; try { d = await res.json(); } catch {} throw new ApiError(d.error || 'Download failed.', res.status); }
    return res;
  }
  async function download(path, filename) {
    if (mode === 'local') return LocalAPI.printDocument(path);
    const res = await fileResponse(path), blob = await res.blob(), objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = objectUrl; a.download = filename || 'document.pdf'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(objectUrl), 4000);
  }
  async function fileURL(path) { if (mode === 'local') return LocalAPI.fileURL(path); return URL.createObjectURL(await (await fileResponse(path)).blob()); }
  return { init, request, get, post, put, del, download, fileURL, setToken, onUnauthorized, get mode() { return mode; }, get connectionError() { return connectionError; }, ApiError };
})();
