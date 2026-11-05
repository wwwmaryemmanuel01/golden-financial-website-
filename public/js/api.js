/* API transport. Two modes, one interface:
   • server — the secure Node backend (central SQLite database)
   • local  — GitHub Pages device-local adapter (same API, browser storage),
              clearly badged as demo mode; bridges to the admin system's
              shared localStorage keys on the github.io origin. */
'use strict';
const API = (() => {
  let mode = 'unknown';
  let token = sessionStorage.getItem('gfs_token') || '';
  const listeners = [];

  class ApiError extends Error { constructor(msg, status, code) { super(msg); this.status = status; this.code = code; } }

  async function init() {
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 3000);
      const res = await fetch('api/health', { signal: ctl.signal, headers: { 'Accept': 'application/json' } });
      clearTimeout(t);
      if (res.ok) { const j = await res.json(); if (j.status === 'ok') { mode = 'server'; return mode; } }
    } catch (e) { /* backend not reachable → Pages mode */ }
    mode = 'local';
    if (typeof LocalAPI !== "undefined") LocalAPI.init();
    return mode;
  }

  async function request(method, path, body) {
    if (mode === 'unknown') await init();
    if (mode === 'local') return LocalAPI.request(method, path, body);
    const headers = { 'Accept': 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (token) headers['Authorization'] = 'Bearer ' + token;
    let res;
    try {
      res = await fetch(path.replace(/^\//, ''), { method, headers, credentials: 'same-origin', body: body !== undefined ? JSON.stringify(body) : undefined });
    } catch (e) {
      throw new ApiError('Cannot reach the server. Check your connection and try again.', 0, 'NETWORK');
    }
    let data = {};
    try { data = await res.json(); } catch {}
    if (!res.ok) {
      if (res.status === 401) { token = ''; sessionStorage.removeItem('gfs_token'); listeners.forEach(f => f()); }
      throw new ApiError(data.error || `Request failed (${res.status}).`, res.status, data.code);
    }
    return data;
  }

  const get = p => request('GET', p);
  const post = (p, b = {}) => request('POST', p, b);
  const put = (p, b = {}) => request('PUT', p, b);
  const del = p => request('DELETE', p);

  function setToken(t) { token = t || ''; if (t) sessionStorage.setItem('gfs_token', t); else sessionStorage.removeItem('gfs_token'); }
  function onUnauthorized(fn) { listeners.push(fn); }

  /* File downloads: PDFs from the backend; printable documents in Pages mode. */
  async function download(path, filename) {
    if (mode === 'local') return LocalAPI.printDocument(path);
    const res = await fetch(path.replace(/^\//, ''), { headers: token ? { Authorization: 'Bearer ' + token } : {}, credentials: 'same-origin' });
    if (!res.ok) { let d = {}; try { d = await res.json(); } catch {} throw new ApiError(d.error || 'Download failed.', res.status); }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = filename || 'document.pdf';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  /* Fetch a protected file (document preview) as an object URL. */
  async function fileURL(path) {
    if (mode === 'local') return LocalAPI.fileURL(path);
    const res = await fetch(path.replace(/^\//, ''), { headers: token ? { Authorization: 'Bearer ' + token } : {}, credentials: 'same-origin' });
    if (!res.ok) throw new ApiError('Could not load the file.', res.status);
    return URL.createObjectURL(await res.blob());
  }

  return { init, request, get, post, put, del, download, fileURL, setToken, onUnauthorized, get mode() { return mode; }, ApiError };
})();
