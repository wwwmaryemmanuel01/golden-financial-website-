/* Interactive editorial experience: published-content refresh, local bookmarks,
   accessible reading controls and varied, user-controlled motion. No invented
   visitor counts, comments, likes or real-time news claims. */
'use strict';
const Experience = (() => {
  const BOOKMARK_KEY = 'gfs_blog_bookmarks_v1', MOTION_KEY = 'gfs_motion_v1';
  const revealObservers = new WeakMap();
  const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
  const write = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; } };
  const storedBookmarks = read(BOOKMARK_KEY, []);
  const bookmarks = new Set(Array.isArray(storedBookmarks) ? storedBookmarks.filter(x => typeof x === 'string') : []);
  const media = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false, addEventListener(){} };
  let motion = read(MOTION_KEY, null);
  if (!['full', 'gentle', 'off'].includes(motion)) motion = media.matches ? 'gentle' : 'full';
  const applyMotion = () => { document.documentElement.dataset.motion = motion; };
  media.addEventListener('change', e => { if (!read(MOTION_KEY, null)) { motion = e.matches ? 'gentle' : 'full'; applyMotion(); document.querySelectorAll('[data-motion-select]').forEach(s => { s.value = motion; }); } });
  applyMotion();
  const controls = () => `<label class="motion-control">${UI.icon('sparkles')}<span>Motion</span><select data-motion-select aria-label="Animation preference">${[['full','Full'],['gentle','Gentle'],['off','Off']].map(([v,l]) => `<option value="${v}" ${motion === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>`;
  const bindControls = (root, signal) => root.querySelectorAll('[data-motion-select]').forEach(select => select.addEventListener('change', () => { motion = select.value; write(MOTION_KEY, motion); applyMotion(); document.querySelectorAll('[data-motion-select]').forEach(s => { s.value = motion; }); }, { signal }));
  function reveal(root, signal) {
    const items = root.querySelectorAll('[data-reveal]');
    if (!('IntersectionObserver' in window) || motion === 'off') { items.forEach(el => el.classList.add('is-visible')); return; }
    const previous = revealObservers.get(root); if (previous) { previous.observer.disconnect(); previous.signal?.removeEventListener('abort', previous.stop); }
    const observer = new IntersectionObserver(entries => entries.forEach(entry => { if (entry.isIntersecting) { entry.target.classList.add('is-visible'); observer.unobserve(entry.target); } }), { threshold: .08, rootMargin: '0px 0px 30px 0px' });
    const stop = () => { observer.disconnect(); revealObservers.delete(root); };
    revealObservers.set(root, { observer, stop, signal });
    items.forEach(el => { el.classList.add('will-reveal'); observer.observe(el); });
    signal?.addEventListener('abort', stop, { once: true });
  }
  function toggleBookmark(slug) {
    if (bookmarks.has(slug)) bookmarks.delete(slug); else bookmarks.add(slug);
    const persisted = write(BOOKMARK_KEY, [...bookmarks]);
    return { saved: bookmarks.has(slug), persisted };
  }
  function paintBookmarks(root) {
    root.querySelectorAll('[data-bookmark]').forEach(button => {
      const saved = bookmarks.has(button.dataset.bookmark);
      button.setAttribute('aria-pressed', String(saved));
      button.setAttribute('aria-label', `${saved ? 'Remove bookmark for' : 'Bookmark'} ${button.dataset.title || 'this article'}`);
      button.classList.toggle('saved', saved);
      const label = button.querySelector('[data-bookmark-label]'); if (label) label.textContent = saved ? 'Saved' : 'Save';
    });
  }
  const syncBookmarks = () => { const value = read(BOOKMARK_KEY, []); bookmarks.clear(); if (Array.isArray(value)) value.filter(x => typeof x === 'string').forEach(x => bookmarks.add(x)); };
  return { controls, bindControls, reveal, toggleBookmark, paintBookmarks, syncBookmarks, bookmarks, get motion() { return motion; } };
})();

const Blog = (() => {
  const esc = UI.esc;
  const ARTS = new Set(['plans', 'interest', 'business', 'agriculture', 'salary', 'emergency', 'security', 'repayments']);
  const date = value => GFS.fmtDate(value);
  const minutes = post => Number(post.readMinutes) || GFS_CONTENT.readingMinutes(post);
  const link = post => '#/blog/' + encodeURIComponent(post.slug);
  const sourceLabel = source => source === 'backend' ? 'Published library' : source === 'device' ? 'Device library' : 'Bundled library';
  function art(type = 'plans', compact = false) {
    const kind = ARTS.has(type) ? type : 'plans';
    const shapes = {
      plans: '<path class="art-line draw-line" d="M42 132 92 92l42 22 66-66"/><circle class="art-dot" cx="42" cy="132" r="6"/><circle class="art-dot delay-dot" cx="200" cy="48" r="8"/><rect class="art-bar" x="57" y="151" width="22" height="35" rx="5"/><rect class="art-bar bar-two" x="99" y="128" width="22" height="58" rx="5"/><rect class="art-bar bar-three" x="141" y="105" width="22" height="81" rx="5"/>',
      interest: '<circle class="art-ring" cx="130" cy="112" r="65"/><path class="art-line draw-line" d="M83 137c20-8 25-41 47-41s27 24 47 10"/><text x="130" y="124" text-anchor="middle" class="art-symbol">%</text><circle class="art-dot" cx="196" cy="82" r="9"/>',
      business: '<rect class="art-panel" x="55" y="86" width="150" height="100" rx="12"/><path class="art-line" d="M95 86V65h70v21M55 122h150"/><rect class="art-dot" x="116" y="111" width="28" height="24" rx="5"/><path class="art-line draw-line" d="m83 53 24-20 25 12 39-25"/>',
      agriculture: '<path class="art-line draw-line" d="M130 188V78"/><path class="art-leaf" d="M130 132c-48 0-62-31-58-57 39-2 58 19 58 57Z"/><path class="art-leaf leaf-two" d="M130 105c4-42 30-58 61-52-1 36-24 54-61 52Z"/><path class="art-line" d="M53 188h154M72 166h36M153 166h36"/>',
      salary: '<rect class="art-panel" x="55" y="54" width="150" height="132" rx="14"/><path class="art-line" d="M55 91h150M91 42v28M169 42v28"/><rect class="art-dot" x="83" y="111" width="22" height="22" rx="5"/><rect class="art-dot delay-dot" x="119" y="111" width="22" height="22" rx="5"/><path class="art-line draw-line" d="m153 151 12 12 24-29"/>',
      emergency: '<path class="art-panel" d="M130 39 207 174H53Z"/><path class="art-line draw-line" d="M130 83v43"/><circle class="art-dot" cx="130" cy="148" r="6"/><path class="art-line" d="M39 83H20M240 83h-19M52 35l15 15M208 35l-15 15"/>',
      security: '<path class="art-shield" d="M130 35 202 62v57c0 40-35 65-72 78-37-13-72-38-72-78V62Z"/><rect class="art-panel" x="99" y="103" width="62" height="51" rx="9"/><path class="art-line draw-line" d="M111 103V88a19 19 0 0 1 38 0v15"/><circle class="art-dot" cx="130" cy="127" r="6"/>',
      repayments: '<circle class="art-ring" cx="130" cy="112" r="70"/><path class="art-line draw-line" d="m94 113 25 25 49-52"/><path class="art-line" d="M183 49h29v29M212 49a91 91 0 0 1 13 88"/>'
    };
    return `<div class="journal-art art-${kind} ${compact ? 'compact' : ''}" aria-hidden="true"><span class="art-orbit"></span><svg viewBox="0 0 260 220" fill="none" xmlns="http://www.w3.org/2000/svg">${shapes[kind]}<circle class="art-spark" cx="222" cy="166" r="4"/><circle class="art-spark spark-two" cx="35" cy="54" r="3"/></svg></div>`;
  }
  function card(post, index = 0, options = {}) {
    const bookmark = options.bookmark !== false;
    return `<article class="journal-card ${options.featured ? 'featured' : ''}" data-reveal style="--i:${Number(index) % 6};--card-accent:${esc(GFS.productById(post.productId)?.colour || '#C9A227')}">
      <a class="journal-card-link" href="${link(post)}"><div class="journal-card-art">${art(post.art, true)}<span class="journal-category">${esc(post.category)}</span></div><div class="journal-card-copy"><div class="journal-meta"><time datetime="${esc(post.publishedAt)}">${date(post.publishedAt)}</time><span>${minutes(post)} min read</span></div><h3>${esc(post.title)}</h3><p>${esc(post.excerpt)}</p><span class="journal-read">Read article ${UI.icon('arrow')}</span></div></a>
      ${bookmark ? `<button class="bookmark-btn" type="button" data-bookmark="${esc(post.slug)}" data-title="${esc(post.title)}" aria-pressed="false" aria-label="Bookmark ${esc(post.title)}">${UI.icon('bookmark')}</button>` : ''}
    </article>`;
  }
  const hero = (eyebrow, title, text, extra = '') => `<section class="journal-hero"><div class="container journal-hero-grid"><div><span class="eyebrow light">${esc(eyebrow)}</span><h1>${esc(title)}</h1><p>${esc(text)}</p>${extra}</div><div class="journal-hero-visual" aria-hidden="true"><div class="hero-page page-back"></div><div class="hero-page page-front"><span class="page-mark">G</span><span class="page-line"></span><span class="page-line short"></span><span class="page-line"></span><span class="page-chart"><i></i><i></i><i></i><i></i></span></div><span class="hero-coin coin-one">K</span><span class="hero-coin coin-two">K</span></div></div></section>`;

  App.route('/blog', { title: 'The Golden journal', nav: '/blog', render: async () => {
    let data, failure = '';
    try { data = await API.get('/api/blog/posts'); }
    catch (e) { failure = e.message; data = { posts: GFS_CONTENT.BLOG_POSTS, source: 'bundled', categories: GFS_CONTENT.CATEGORIES, version: GFS_CONTENT.VERSION, notice: 'Bundled educational library. Automatic updates require the configured backend.' }; }
    const state = { posts: data.posts, source: data.source, checkedAt: data.checkedAt, version: data.version, notice: data.notice, category: App.query().category || '', search: App.query().search || '', saved: false, sort: 'newest', busy: false };
    if (!GFS_CONTENT.CATEGORIES.includes(state.category)) state.category = '';
    return { html: `${hero('The Golden journal', 'Clarity for your next money move.', 'Practical reading on borrowing, business, farming and everyday financial confidence.', '<a class="journal-hero-link" href="#/guides">Find a practical guide ' + UI.icon('arrow') + '</a>')}
      <section class="section journal-library"><div class="container">
        <div class="library-topline"><div class="library-source">${UI.icon('book')}<b>${sourceLabel(state.source)}</b><span id="blog-update-status" role="status">Preparing library…</span></div><div class="flex wrap"><button class="btn btn-ghost btn-sm" id="blog-refresh" type="button">${UI.icon('refresh')} Check for updates</button>${Experience.controls()}</div></div>
        <div id="blog-connection-note" class="alert alert-warn" ${failure ? '' : 'hidden'}>${UI.icon('alert')}<div><b>Showing the bundled educational library.</b> <span id="blog-connection-message">${esc(failure)}</span> Automatic publication requires a reachable configured backend.</div></div>
        <div class="journal-filters"><label class="search-field">${UI.icon('search')}<input id="blog-search" type="search" value="${esc(state.search)}" placeholder="Search articles, topics or questions…" aria-label="Search articles" maxlength="200"></label><label class="journal-sort">Sort by<select id="blog-sort" aria-label="Sort articles"><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="title">Title A–Z</option></select></label><button class="btn btn-ghost saved-filter" id="blog-saved" type="button" aria-pressed="false">${UI.icon('bookmark')} Saved <span id="saved-count">0</span></button></div>
        <div class="journal-chips" role="group" aria-label="Filter by topic"><button class="topic-chip active" data-category="" aria-pressed="true" type="button">All articles</button>${GFS_CONTENT.CATEGORIES.map(c => `<button class="topic-chip" data-category="${esc(c)}" aria-pressed="false" type="button">${esc(c)}</button>`).join('')}</div>
        <div class="library-count"><span id="blog-count" role="status" aria-live="polite"></span><button class="btn-link" id="blog-clear" type="button" hidden>Clear filters</button></div>
        <div id="blog-results" class="journal-grid" aria-busy="false"></div>
        <div class="journal-bottom-note">${UI.icon('info')}<p>Educational content, not a news wire or personalised financial advice. Bookmarks and reading preferences stay on this device. ${state.source === 'backend' ? 'The published library checks for updates every minute while this page is visible.' : 'This library is bundled with the website; it does not claim live publication.'}</p></div>
      </div></section>`, mount: (root) => {
        const controller = new AbortController(), signal = controller.signal;
        const search = root.querySelector('#blog-search'), results = root.querySelector('#blog-results'), status = root.querySelector('#blog-update-status'), refresh = root.querySelector('#blog-refresh');
        let poll;
        const filtered = () => {
          const q = state.search.trim().toLowerCase();
          const list = state.posts.filter(p => (!state.category || p.category === state.category) && (!state.saved || Experience.bookmarks.has(p.slug)) && `${p.title} ${p.excerpt} ${(p.tags || []).join(' ')}`.toLowerCase().includes(q));
          return list.sort((a,b) => state.sort === 'title' ? a.title.localeCompare(b.title) : state.sort === 'oldest' ? a.publishedAt.localeCompare(b.publishedAt) : b.publishedAt.localeCompare(a.publishedAt));
        };
        const paint = () => {
          const list = filtered();
          results.innerHTML = list.length ? list.map((p,i) => card(p, i, { featured: i === 0 && !state.search && !state.category && !state.saved })).join('') : `<div class="journal-empty">${UI.empty(UI.icon(state.saved ? 'bookmark' : 'search'), state.saved ? 'No saved articles here' : 'No articles match', state.saved ? 'Use the bookmark on an article to keep it here. Bookmarks are stored only on this device.' : 'Try another topic or a shorter search.', '<button class="btn btn-ghost" id="empty-clear" type="button">Show all articles</button>')}</div>`;
          root.querySelector('#blog-count').textContent = `${list.length} ${list.length === 1 ? 'article' : 'articles'}${state.category ? ' · ' + state.category : ''}${state.saved ? ' · saved on this device' : ''}`;
          root.querySelector('#saved-count').textContent = Experience.bookmarks.size;
          root.querySelector('#blog-clear').hidden = !state.search && !state.category && !state.saved && state.sort === 'newest';
          root.querySelector('#blog-saved').setAttribute('aria-pressed', String(state.saved));
          root.querySelectorAll('[data-category]').forEach(b => { const active = b.dataset.category === state.category; b.classList.toggle('active', active); b.setAttribute('aria-pressed', String(active)); });
          Experience.paintBookmarks(root); Experience.reveal(results, signal);
          results.querySelector('#empty-clear')?.addEventListener('click', clear, { signal });
        };
        const updateStatus = () => { status.textContent = `${sourceLabel(state.source)} · ${state.checkedAt ? 'checked ' + new Date(state.checkedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'available offline'}`; };
        const load = async (manual = false) => {
          if (state.busy || signal.aborted) return;
          state.busy = true; refresh.disabled = true; refresh.classList.add('is-refreshing'); results.setAttribute('aria-busy', 'true');
          try {
            const next = await API.get('/api/blog/posts'); if (signal.aborted) return;
            const changed = JSON.stringify(next.posts.map(p => [p.slug,p.updatedAt,p.title])) !== JSON.stringify(state.posts.map(p => [p.slug,p.updatedAt,p.title]));
            Object.assign(state, { posts: next.posts, source: next.source, checkedAt: next.checkedAt, version: next.version, notice: next.notice });
            root.querySelector('#blog-connection-note').hidden = true; paint();
            if (manual || changed) UI.toast(changed ? 'The article library has been updated.' : 'Library checked. You have the latest available articles.', 'ok');
          } catch (e) {
            if (signal.aborted) return;
            root.querySelector('#blog-connection-note').hidden = false;
            root.querySelector('#blog-connection-message').textContent = e.message + '. Existing articles remain available.';
            status.textContent = 'Refresh unavailable · existing library retained';
            if (manual) UI.toast('Could not check for updates. Your current library is still available.', 'err');
          } finally { state.busy = false; if (!signal.aborted) { refresh.disabled = false; refresh.classList.remove('is-refreshing'); results.setAttribute('aria-busy', 'false'); updateStatusUnlessFailed(); } }
        };
        const updateStatusUnlessFailed = () => { if (root.querySelector('#blog-connection-note').hidden) updateStatus(); };
        const clear = () => { state.search = ''; state.category = ''; state.saved = false; state.sort = 'newest'; search.value = ''; root.querySelector('#blog-sort').value = 'newest'; paint(); };
        search.addEventListener('input', () => { state.search = search.value; paint(); }, { signal });
        root.querySelector('#blog-sort').addEventListener('change', e => { state.sort = e.target.value; paint(); }, { signal });
        root.querySelector('#blog-saved').addEventListener('click', () => { state.saved = !state.saved; paint(); }, { signal });
        root.querySelector('#blog-clear').addEventListener('click', clear, { signal });
        root.querySelectorAll('[data-category]').forEach(b => b.addEventListener('click', () => { state.category = b.dataset.category; paint(); }, { signal }));
        results.addEventListener('click', e => { const b = e.target.closest('[data-bookmark]'); if (!b) return; const r = Experience.toggleBookmark(b.dataset.bookmark); Experience.paintBookmarks(root); if (state.saved) paint(); UI.toast(r.persisted ? r.saved ? 'Article saved on this device.' : 'Bookmark removed.' : 'Bookmark changed for this visit; device storage is unavailable.', r.persisted ? 'success' : 'info'); }, { signal });
        refresh.addEventListener('click', () => load(true), { signal });
        window.addEventListener('storage', e => { if (e.key === 'gfs_blog_bookmarks_v1') { Experience.syncBookmarks(); paint(); } }, { signal });
        document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && state.source === 'backend') load(); }, { signal });
        Experience.bindControls(root, signal); Experience.paintBookmarks(root); paint(); updateStatus();
        poll = setInterval(() => { if (state.source === 'backend' && document.visibilityState === 'visible') load(); }, 60000);
        return () => { controller.abort(); clearInterval(poll); };
      } };
  } });

  App.route('/blog/:slug', { title: 'Golden journal article', nav: '/blog', render: async ({ slug }) => {
    const data = await API.get('/api/blog/posts/' + encodeURIComponent(slug)), post = data.post;
    const product = GFS.productById(post.productId);
    let textSize = 'standard'; try { const saved = localStorage.getItem('gfs_reader_text_v1'); if (['small','standard','large'].includes(saved)) textSize = saved; } catch {}
    return `${hero(post.category, post.title, post.excerpt, `<div class="article-byline"><span class="author-avatar">G</span><div><b>${esc(post.author)}</b><span><time datetime="${esc(post.publishedAt)}">${date(post.publishedAt)}</time> · ${minutes(post)} min read · Updated <time id="article-updated" datetime="${esc(post.updatedAt)}">${date(post.updatedAt)}</time></span></div></div>`)}
      <div class="article-reading-shell" data-text-size="${textSize}"><div class="reader-toolbar"><div class="container reader-toolbar-inner"><a href="#/blog" class="text-link">${UI.icon('chevron-left')} All articles</a><div class="reader-actions"><label class="reader-size">Text size<select id="reader-size" aria-label="Article text size"><option value="small" ${textSize === 'small' ? 'selected' : ''}>A−</option><option value="standard" ${textSize === 'standard' ? 'selected' : ''}>A</option><option value="large" ${textSize === 'large' ? 'selected' : ''}>A+</option></select></label><button class="btn btn-ghost btn-sm" type="button" data-bookmark="${esc(post.slug)}" data-title="${esc(post.title)}" aria-pressed="false">${UI.icon('bookmark')} <span data-bookmark-label>Save</span></button><button class="icon-btn" id="article-share" type="button" aria-label="Share article">${UI.icon('share')}</button><button class="icon-btn" id="article-print" type="button" aria-label="Print article">${UI.icon('printer')}</button>${Experience.controls()}</div></div><div class="reading-progress" role="progressbar" aria-label="Reading progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span id="reading-progress-fill"></span></div></div>
      <div class="container"><div id="article-update" class="alert alert-info mt-2" hidden>${UI.icon('refresh')}<div>A newer version of this article is available.</div><button class="btn btn-ghost btn-sm" id="article-reload" type="button">Load update</button></div>
      <div class="article-layout"><article class="article-body" id="article-body"><div class="article-takeaway" data-reveal><span>${UI.icon('sparkles')}</span><div><b>The key idea</b><p>${esc(post.takeaway)}</p></div></div>${post.sections.map((section,i) => `<section class="article-section" id="section-${i+1}" data-reveal><span class="section-index">${String(i+1).padStart(2,'0')}</span><h2>${esc(section.title)}</h2>${section.paragraphs.map(p => `<p>${esc(p)}</p>`).join('')}${section.bullets ? `<ul class="article-bullets">${section.bullets.map(b => `<li>${UI.icon('check')}<span>${esc(b)}</span></li>`).join('')}</ul>` : ''}</section>`).join('')}<div class="article-tags">${post.tags.map(t => `<a class="pill" href="#/blog?search=${encodeURIComponent(t)}">${esc(t)}</a>`).join('')}</div><div class="article-disclaimer">${UI.icon('info')}<p>General education, not personalised financial advice. Published product terms and your current agreement take precedence. ${data.source === 'backend' ? 'This article comes from the published customer-backend library.' : 'This article is from the bundled/device library, not a live publication feed.'}</p></div>${product ? `<div class="article-product-cta"><span class="service-icon">${UI.productIcon(product.id)}</span><div><h3>Explore ${esc(product.label || product.name)}</h3><p>Compare the published terms before deciding.</p></div><a class="btn btn-gold btn-sm" href="#/loans/${product.id}">View product ${UI.icon('arrow')}</a></div>` : ''}</article>
      <aside class="article-aside"><div class="article-toc"><span class="eyebrow">In this article</span><nav aria-label="Article contents">${post.sections.map((s,i) => `<a href="#section-${i+1}" data-section="section-${i+1}"><span>${String(i+1).padStart(2,'0')}</span>${esc(s.title)}</a>`).join('')}</nav><div class="toc-progress"><span id="toc-percent">0%</span> read</div></div><div class="article-help-card">${UI.icon('shield')}<h3>Keep your account safe</h3><p>Never share your PIN, password or OTP.</p><a href="#/security-centre" class="text-link">Security centre ${UI.icon('arrow')}</a></div></aside></div>
      <nav class="article-neighbours" aria-label="More articles">${data.previous ? `<a href="${link(data.previous)}"><small>Previous article</small><b>${esc(data.previous.title)}</b></a>` : '<span></span>'}${data.next ? `<a href="${link(data.next)}" class="next"><small>Next article</small><b>${esc(data.next.title)}</b></a>` : ''}</nav>
      ${data.related.length ? `<section class="related-articles"><div class="sec-head"><span class="eyebrow">Keep reading</span><h2>Related ideas</h2></div><div class="journal-grid">${data.related.map((p,i) => card(p,i)).join('')}</div></section>` : ''}</div></div>`;
  }, mount: (root, params) => {
    const controller = new AbortController(), signal = controller.signal, body = root.querySelector('#article-body'), shell = root.querySelector('.article-reading-shell');
    document.title = root.querySelector('h1').textContent + ' — Golden Financial Services';
    const progress = root.querySelector('#reading-progress-fill'), progressBar = root.querySelector('.reading-progress'), percent = root.querySelector('#toc-percent'), tocLinks = [...root.querySelectorAll('[data-section]')], sections = [...body.querySelectorAll('.article-section')];
    let frame = 0, poll;
    const updateProgress = () => {
      frame = 0; if (!body.isConnected) return;
      const rect = body.getBoundingClientRect(), total = Math.max(1, body.offsetHeight - innerHeight * .45), value = Math.max(0, Math.min(100, Math.round((-rect.top + 170) / total * 100)));
      progress.style.width = value + '%'; progressBar.setAttribute('aria-valuenow', String(value)); percent.textContent = value + '%';
      let current = sections[0]?.id; for (const section of sections) if (section.getBoundingClientRect().top <= 220) current = section.id;
      tocLinks.forEach(a => { const active = a.dataset.section === current; a.classList.toggle('active', active); if (active) a.setAttribute('aria-current', 'location'); else a.removeAttribute('aria-current'); });
    };
    const scheduleProgress = () => { if (!frame) frame = requestAnimationFrame(updateProgress); };
    window.addEventListener('scroll', scheduleProgress, { passive: true, signal }); window.addEventListener('resize', scheduleProgress, { passive: true, signal });
    tocLinks.forEach(a => a.addEventListener('click', e => { e.preventDefault(); const target = root.querySelector('#' + a.dataset.section); target.scrollIntoView({ behavior: Experience.motion === 'full' ? 'smooth' : 'auto', block: 'start' }); target.setAttribute('tabindex','-1'); target.focus({ preventScroll: true }); }, { signal }));
    root.querySelector('#reader-size').addEventListener('change', e => { shell.dataset.textSize = e.target.value; try { localStorage.setItem('gfs_reader_text_v1', e.target.value); } catch {} scheduleProgress(); }, { signal });
    root.addEventListener('click', e => { const b = e.target.closest('[data-bookmark]'); if (!b) return; const r = Experience.toggleBookmark(b.dataset.bookmark); Experience.paintBookmarks(root); UI.toast(r.persisted ? r.saved ? 'Article saved on this device.' : 'Bookmark removed.' : 'Bookmark changed for this visit only.', r.persisted ? 'success' : 'info'); }, { signal });
    root.querySelector('#article-print').addEventListener('click', () => window.print(), { signal });
    root.querySelector('#article-share').addEventListener('click', async () => {
      const title = root.querySelector('h1').textContent, url = location.href;
      if (navigator.share) { try { await navigator.share({ title, url }); return; } catch (e) { if (e.name === 'AbortError') return; } }
      try { await navigator.clipboard.writeText(url); UI.toast('Article link copied.', 'ok'); }
      catch { const m = UI.modal(`<h3>Share this article</h3><p class="muted">Copy the link below.</p><input id="share-url" readonly aria-label="Article link"><button class="btn btn-gold mt-2" id="select-share" type="button">Select link</button>`); const input = m.el.querySelector('#share-url'); input.value = url; m.el.querySelector('#select-share').onclick = () => { input.focus(); input.select(); }; }
    }, { signal });
    const checkRevision = async () => {
      if (signal.aborted || document.visibilityState !== 'visible' || API.mode === 'local') return;
      try {
        const next = await API.get('/api/blog/posts/' + encodeURIComponent(params.slug));
        const changed = next.post.title !== root.querySelector('h1').textContent || next.post.updatedAt !== root.querySelector('#article-updated').dateTime;
        if (!signal.aborted && changed) root.querySelector('#article-update').hidden = false;
      } catch { /* Keep the readable article; a failed check is not a new revision. */ }
    };
    root.querySelector('#article-reload').addEventListener('click', () => App.render(), { signal });
    Experience.bindControls(root, signal); Experience.paintBookmarks(root); Experience.reveal(root, signal); updateProgress();
    poll = setInterval(checkRevision, 60000);
    return () => { controller.abort(); clearInterval(poll); cancelAnimationFrame(frame); };
  } });
  return { card, art, sourceLabel };
})();
