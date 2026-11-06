/* Live homepage band: administration notices and journal messages rendered as
   image cards. Cards rotate through the published pool and pick new animations
   automatically; every automatic change can be paused and respects the visitor's
   motion preference. Photography is decorative and labelled as illustrative. */
'use strict';
window.LiveFeed = (() => {
  const esc = UI.esc;
  const MOTIONS = ['tilt', 'spin', 'swap', 'flap', 'flip', 'rotate', 'breathe', 'twinkle'];
  const IMAGES = {
    business: 'assets/live/live-business.jpg',
    agriculture: 'assets/live/live-agriculture.jpg',
    salary: 'assets/live/live-salary.jpg',
    personal: 'assets/live/live-personal.jpg',
    plans: 'assets/live/live-personal.jpg',
    interest: 'assets/live/live-salary.jpg',
    emergency: 'assets/live/live-personal.jpg',
    repayments: 'assets/live/live-branch.jpg',
    security: 'assets/live/live-branch.jpg'
  };
  const NOTICE_IMAGES = {
    security: 'assets/live/live-branch.jpg',
    product: 'assets/live/live-business.jpg',
    service: 'assets/live/live-branch.jpg',
    general: 'assets/live/live-personal.jpg',
    maintenance: 'assets/live/live-salary.jpg',
    promotion: 'assets/live/live-agriculture.jpg'
  };
  const FALLBACK = 'assets/live/live-branch.jpg';
  const imageFor = (art, category) => IMAGES[art] || NOTICE_IMAGES[category] || FALLBACK;
  const random = list => list[Math.floor(Math.random() * list.length)];
  const perView = () => (window.innerWidth >= 1000 ? 3 : window.innerWidth >= 640 ? 2 : 1);

  function items(data) {
    const notices = (data.announcements || []).map(a => {
      const id = Notices.slug(a);
      return {
        kind: 'notice', id: 'notice:' + id, title: a.title, message: a.body,
        href: Notices.actionHref(a.linkUrl || '/announcements/' + id),
        external: /^https:\/\//i.test(a.linkUrl || ''),
        date: Notices.date(a), category: a.category || 'general', art: 'notice',
        pinned: a.pinned === true, accent: '#0E9F6E',
        label: a.linkLabel || 'Read notice'
      };
    });
    const posts = (data.posts || []).map(p => ({
      kind: 'article', id: 'article:' + p.slug, title: p.title, message: p.excerpt,
      href: '#/blog/' + encodeURIComponent(p.slug), external: false,
      date: p.publishedAt, category: p.category, art: p.art, pinned: false,
      accent: (GFS.productById(p.productId) || {}).colour || '#C9A227',
      label: 'Read article', minutes: Number(p.readMinutes) || (window.GFS_CONTENT ? GFS_CONTENT.readingMinutes(p) : 0)
    }));
    return [...notices.filter(n => n.pinned), ...posts, ...notices.filter(n => !n.pinned)];
  }

  function card(item) {
    const icon = item.kind === 'notice'
      ? (item.category === 'security' ? 'shield' : item.category === 'maintenance' ? 'clock' : 'bell')
      : 'book';
    const meta = item.kind === 'notice'
      ? `${UI.icon(icon)} Notice · ${esc(item.category)}`
      : `${UI.icon(icon)} Journal · ${esc(item.category)}${item.minutes ? ` · ${item.minutes} min read` : ''}`;
    return `<article class="live-card" data-live-card style="--card-accent:${esc(item.accent)}">
      <a class="live-card-link" href="${esc(item.href)}" ${item.external ? 'target="_blank" rel="noopener noreferrer"' : ''}>
        <span class="live-figure">
          <img src="${esc(imageFor(item.art, item.category))}" alt="" width="1200" height="900" loading="lazy" decoding="async">
          <span class="live-shine" aria-hidden="true"></span>
          <span class="live-sparks" aria-hidden="true"><i></i><i></i><i></i></span>
        </span>
        <span class="live-body">
          <span class="live-meta"><span class="live-kind ${item.kind}">${meta}</span>${item.pinned ? `<span class="live-pin">${UI.icon('pin')} Pinned</span>` : ''}</span>
          <h3>${esc(item.title)}</h3>
          <p>${esc(item.message)}</p>
          <span class="live-foot"><time datetime="${esc(item.date || '')}">${GFS.fmtDate(item.date)}</time><span class="live-cta">${esc(item.label)} ${UI.icon(item.external ? 'external' : 'arrow')}</span></span>
        </span>
      </a>
    </article>`;
  }

  function section(data, options = {}) {
    const list = items(data);
    const admin = data.adminSettingsUrl || new URL('website.html#s3', App.company().adminSystem).href;
    if (!list.length) {
      return `<div class="live-empty">${UI.icon('bell')}<div><b>Nothing published yet</b><span>Administration notices and journal articles appear here as soon as they are published.</span></div></div>
        <div class="live-source"><span class="notice-status" role="status"><i class="status-dot ${data.source === 'device' ? 'offline' : ''}"></i><span>${esc(Notices.status(data))}</span></span><a href="${esc(admin)}" target="_blank" rel="noopener noreferrer">Publishing settings ${UI.icon('external')}</a></div>`;
    }
    return `${options.head || ''}
      <div class="live-grid" data-live-grid>${list.slice(0, options.perView || 3).map(card).join('')}</div>
      <div class="live-controls">
        <button class="btn btn-ghost btn-sm" type="button" data-live-pause aria-pressed="false">${UI.icon('pause')}<span data-live-pause-label>Pause rotation</span></button>
        <div class="live-dots" role="tablist" aria-label="Live notice and article rotation" data-live-dots></div>
        <div class="flex wrap" style="margin-left:auto"><a class="btn btn-ghost btn-sm" href="#/announcements">All notices ${UI.icon('arrow')}</a><a class="btn btn-ghost btn-sm" href="#/blog">Read the journal ${UI.icon('arrow')}</a></div>
      </div>
      <div class="live-source"><span class="notice-status" role="status"><i class="status-dot ${data.source === 'device' ? 'offline' : ''}"></i><span data-live-status>${esc(Notices.status(data))}</span></span><a href="${esc(admin)}" target="_blank" rel="noopener noreferrer">Publishing settings ${UI.icon('external')}</a></div>
      <p class="tiny muted mt-2">${UI.icon('info')} Photography is illustrative. Notices are published by administration; journal articles are educational and are not personalised financial advice.</p>`;
  }

  function mount(root, initial, options = {}) {
    if (!root) return () => {};
    const controller = new AbortController(), signal = controller.signal;
    const every = Number(options.rotateMs) || 7000, motionEvery = Number(options.motionMs) || 5200;
    let data = initial, list = items(data), index = 0, view = perView();
    let paused = false, hovering = false, motionTimer, rotateTimer, pollTimer;

    const motionAllowed = () => Experience.motion !== 'off' && !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    const shuffled = () => { let next = random(MOTIONS); return next; };

    const paintDots = () => {
      const dots = root.querySelector('[data-live-dots]'); if (!dots) return;
      const pages = Math.max(1, Math.ceil(list.length / view)), current = Math.floor(index / view) % pages;
      dots.innerHTML = Array.from({ length: pages }, (_, i) => `<button type="button" class="live-dot ${i === current ? 'active' : ''}" role="tab" aria-selected="${i === current}" aria-label="Show ${i === current ? 'current' : 'set ' + (i + 1)} of ${pages}" data-live-page="${i}"></button>`).join('');
    };

    const paint = () => {
      const grid = root.querySelector('[data-live-grid]'); if (!grid) return;
      const window_ = Array.from({ length: view }, (_, i) => list[(index + i) % list.length]);
      grid.innerHTML = window_.map(card).join('');
      grid.querySelectorAll('[data-live-card]').forEach(el => { el.dataset.cardMotion = shuffled(); el.classList.add('is-entering'); });
      requestAnimationFrame(() => grid.querySelectorAll('.is-entering').forEach(el => el.classList.remove('is-entering')));
      paintDots();
    };

    const cycleMotion = () => {
      if (!motionAllowed()) return;
      root.querySelectorAll('[data-live-card]').forEach(el => {
        const current = el.dataset.cardMotion;
        let next = random(MOTIONS);
        if (next === current) next = MOTIONS[(MOTIONS.indexOf(current) + 1 + Math.floor(Math.random() * (MOTIONS.length - 1))) % MOTIONS.length];
        el.dataset.cardMotion = next;
      });
    };

    const advance = () => { if (list.length <= view) return; index = (index + view) % list.length; paint(); };
    const running = () => !paused && !hovering && document.visibilityState === 'visible' && motionAllowed() && list.length > view;

    const setPause = value => {
      paused = value;
      const button = root.querySelector('[data-live-pause]');
      if (button) {
        button.setAttribute('aria-pressed', String(paused));
        const label = button.querySelector('[data-live-pause-label]');
        if (label) label.textContent = paused ? 'Resume rotation' : 'Pause rotation';
        button.innerHTML = `${UI.icon(paused ? 'play' : 'pause')}<span data-live-pause-label>${paused ? 'Resume rotation' : 'Pause rotation'}</span>`;
      }
    };

    const refresh = async () => {
      if (data.source === 'device') return;
      try {
        const next = await API.get('/api/announcements');
        if (signal.aborted) return;
        data = { ...data, ...next };
        if (App.config) App.config.announcements = next.announcements;
        list = items(data); index = 0; paint();
        const status = root.querySelector('[data-live-status]');
        if (status) status.textContent = Notices.status(data);
      } catch {
        const status = root.querySelector('[data-live-status]');
        if (status && !signal.aborted) status.textContent = 'Update check unavailable · showing the last published items';
      }
    };

    view = perView();
    root.innerHTML = section(data, { ...options, perView: view });
    paint();
    setPause(!motionAllowed());

    root.addEventListener('pointerenter', () => { hovering = true; }, { signal });
    root.addEventListener('pointerleave', () => { hovering = false; }, { signal });
    root.addEventListener('focusin', () => { hovering = true; }, { signal });
    root.addEventListener('focusout', () => { hovering = false; }, { signal });
    root.addEventListener('click', event => {
      const pause = event.target.closest('[data-live-pause]'); if (pause) { setPause(!paused); return; }
      const dot = event.target.closest('[data-live-page]');
      if (dot) { index = (Number(dot.dataset.livePage) * view) % list.length; paint(); }
    }, { signal });

    rotateTimer = setInterval(() => { if (running()) advance(); }, every);
    motionTimer = setInterval(cycleMotion, motionEvery);
    if (data.source !== 'device') pollTimer = setInterval(() => { if (document.visibilityState === 'visible') refresh(); }, 30000);
    const onResize = () => { const next = perView(); if (next === view) return; view = next; index = 0; paint(); };
    window.addEventListener('resize', onResize, { signal });

    return () => { controller.abort(); clearInterval(rotateTimer); clearInterval(motionTimer); if (pollTimer) clearInterval(pollTimer); };
  }

  return { items, card, section, mount, motions: MOTIONS };
})();
