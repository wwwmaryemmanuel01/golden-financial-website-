/* Administration-published service notices. The backend feed is authoritative;
   the static/device adapter is explicitly labelled and never pretends to sync. */
'use strict';
window.Notices = (() => {
  const esc = UI.esc;
  const slug = a => String(a.slug || a.id || '');
  const date = a => a.publishedAt || a.published_at;
  const actionHref = url => {
    if (!url) return '#/announcements/' + encodeURIComponent('');
    if (/^\/(?!\/)[^\s#]*$/.test(url)) return '#' + url;
    try { const u = new URL(url); if (u.protocol === 'https:' && !u.username && !u.password) return u.href; } catch {}
    return '#/announcements';
  };
  const external = url => /^https:\/\//i.test(url || '');
  function card(a) {
    const id = slug(a), href = actionHref(a.linkUrl || '/announcements/' + id), ext = external(a.linkUrl);
    return `<article class="notice-card ${a.pinned ? 'pinned' : ''}" data-notice="${esc(id)}">
      <div class="notice-meta"><span class="notice-category">${UI.icon(a.category === 'security' ? 'shield' : a.category === 'maintenance' ? 'clock' : 'bell')} ${esc(a.category || 'general')}</span>${a.pinned ? `<span class="notice-pin">${UI.icon('pin')} Pinned</span>` : ''}<time datetime="${esc(date(a))}">${GFS.fmtDate(date(a))}</time></div>
      <h3><a href="#/announcements/${encodeURIComponent(id)}">${esc(a.title)}</a></h3><p>${esc(a.body)}</p>
      <a class="notice-action" href="${esc(href)}" ${ext ? 'target="_blank" rel="noopener noreferrer"' : ''}>${esc(a.linkLabel || 'Read notice')} ${UI.icon(ext ? 'external' : 'arrow')}</a>
    </article>`;
  }
  const empty = () => `<div class="notice-empty">${UI.icon('bell')}<div><b>No published notices right now</b><span>New administration updates will appear here automatically.</span></div></div>`;
  function status(d) {
    if (d.source === 'device') return 'Device-local notices · not connected to administration';
    if ((d.announcements || []).some(a => a.source === 'system')) return 'Published by Golden Loan Services administration';
    return d.publishingConfigured ? 'Administration connector ready · awaiting publication' : 'Backend notices · administration connector not configured';
  }
  function section(d, { limit = 3, title = 'Latest announcements', eyebrow = 'From administration', allLink = true } = {}) {
    const admin = d.adminSettingsUrl || new URL('website.html#s3', App.company().adminSystem).href;
    return `<div class="notice-section-head"><div><span class="eyebrow">${esc(eyebrow)}</span><h2>${esc(title)}</h2></div>${allLink ? `<a class="btn btn-ghost btn-sm" href="#/announcements">All notices ${UI.icon('arrow')}</a>` : ''}</div>
      <div class="notice-grid" data-notice-list>${(d.announcements || []).slice(0, limit).map(card).join('') || empty()}</div>
      <div class="notice-source"><span class="notice-status" role="status"><i class="status-dot ${d.source === 'device' ? 'offline' : ''}"></i><span data-notice-status>${esc(status(d))}</span></span><a href="${esc(admin)}" target="_blank" rel="noopener noreferrer">Publishing settings ${UI.icon('external')}</a></div>`;
  }
  function mount(root, initial, options = {}) {
    if (!root) return () => {};
    const controller = new AbortController(); let data = initial, busy = false;
    const paint = () => { if (root.contains(document.activeElement)) return; root.innerHTML = section(data, options); };
    const load = async () => {
      if (busy || controller.signal.aborted || data.source === 'device') return;
      busy = true;
      try { const next = await API.get('/api/announcements'); if (controller.signal.aborted) return; const changed = JSON.stringify(next.announcements) !== JSON.stringify(data.announcements); data = next; App.config.announcements = next.announcements; if (changed) paint(); else { const s = root.querySelector('[data-notice-status]'); if (s) s.textContent = status(data); } }
      catch { const s = root.querySelector('[data-notice-status]'); if (s && !controller.signal.aborted) s.textContent = 'Update check unavailable · showing the last available notices'; }
      finally { busy = false; }
    };
    root.innerHTML = section(data, options);
    const timer = data.source === 'device' ? null : setInterval(() => { if (document.visibilityState === 'visible') load(); }, 30000);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') load(); }, { signal:controller.signal });
    return () => { controller.abort(); if (timer) clearInterval(timer); };
  }
  return { card, section, mount, slug, date, actionHref, status };
})();
