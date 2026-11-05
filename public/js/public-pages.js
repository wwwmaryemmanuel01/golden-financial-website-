/* Public website — all 30 public pages. Content + interactive tools. */
'use strict';
(() => {
  const C = () => (App.config && App.config.company) || GFS.COMPANY;
  const P = () => (App.config && App.config.products) || GFS.PRODUCTS;
  const esc = UI.esc;

  /* ---------------- 1. HOME ---------------- */
  App.route('/', {
    title: 'Loans in Malawi', nav: '/', render: async () => {
      const anns = (App.config && App.config.announcements) || [];
      return `
      <section class="hero"><div class="container">
        <div>
          <span class="eyebrow">🇲🇼 Licensed lending · Malawi Kwacha</span>
          <h1>Finance your goals with <span class="gold">Golden Financial Services</span></h1>
          <p class="lead">Personal, business, emergency, salary advance, agricultural, education, medical, asset, group and mortgage loans — apply online in minutes, track every step, and repay with TNM Mpamba, Airtel Money or bank transfer.</p>
          <div class="hero-cta"><a href="#/apply" class="btn btn-gold btn-lg">Apply for a Loan →</a><a href="#/calculator" class="btn btn-ghost btn-lg" style="background:rgba(255,255,255,.1);color:#fff;border-color:rgba(255,255,255,.4)">Loan Calculator</a></div>
          <div class="hero-stats"><div class="hs"><b>10</b><span>Loan products</span></div><div class="hs"><b>MK 80M</b><span>Max mortgage</span></div><div class="hs"><b>24 hrs</b><span>Typical decision</span></div><div class="hs"><b>4</b><span>Branches nationwide</span></div></div>
        </div>
        <img class="hero-logo" src="assets/logo.png" alt="Golden Financial Services emblem">
      </div></section>
      ${anns.length ? `<div class="container" style="margin-top:18px"><div class="alert alert-info">📢 <div><b>${esc(anns[0].title)}</b> — ${esc(anns[0].body)} <a href="#/announcements">All announcements →</a></div></div></div>` : ''}
      <section class="section"><div class="container">
        <div class="sec-head"><span class="eyebrow">Loan Products</span><h2>Borrowing made clear, from MK 20,000 to MK 80,000,000</h2><p class="muted">Every product shows its full range, monthly rate on the declining balance, arrangement fee and terms — before you apply.</p></div>
        <div class="grid grid-3">${P().map(p => `
          <a class="product-card" style="--pc:${p.colour};text-decoration:none;color:inherit" href="#/loans/${p.id}">
            <div class="p-icon">${UI.productIcon(p.id)}</div><h3>${esc(p.name)}</h3>
            <div class="p-range">${GFS.mk(p.min)} – ${GFS.mk(p.max)}</div>
            <p class="muted small mb-0">${esc(p.tagline)}</p>
            <div class="p-meta"><span class="pill">${p.rate}%/month</span><span class="pill">${p.fee}% fee</span><span class="pill">${p.terms[p.terms.length - 1]} mo max</span></div>
          </a>`).join('')}</div>
      </div></section>
      <section class="section" style="background:#fff;border-block:1.5px solid var(--line)"><div class="container">
        <div class="sec-head"><span class="eyebrow">How it works</span><h2>From application to money in your account — four steps</h2></div>
        <div class="grid grid-4">
          ${[['1', 'Register & verify', 'Create your account, verify your phone and email, and upload your ID securely.'], ['2', 'Apply online', 'Choose a product, amount and term. Add a guarantor and submit — get a GLS-APP reference instantly.'], ['3', 'Get a decision', 'Automated assessment checks affordability and documents. Most decisions within 24 hours.'], ['4', 'Sign & receive', 'Accept your agreement electronically and receive funds via Mpamba, Airtel Money or bank.']].map(([n, t, b]) => `<div class="step"><div class="s-no">${n}</div><div><h3 style="font-size:15.5px">${t}</h3><p class="muted small mb-0">${b}</p></div></div>`).join('')}
        </div>
        <div class="center mt-3"><a href="#/how-it-works" class="btn btn-emerald">See the full process →</a></div>
      </div></section>
      <section class="section"><div class="container">
        <div class="grid grid-2" style="align-items:center">
          <div><span class="eyebrow">Plan before you borrow</span><h2>Know every kwacha before you sign</h2><p class="muted">Our calculator shows your instalment, total interest, arrangement fee, total repayable and a full amortisation schedule — daily, weekly, fortnightly or monthly. No surprises.</p>
            <div class="feature mb-2"><div class="f-icon">📉</div><div><b>Declining-balance interest</b><p class="muted small mb-0">Interest is charged only on what you still owe, so it falls with every payment.</p></div></div>
            <div class="feature mb-2"><div class="f-icon">🧾</div><div><b>One clear fee</b><p class="muted small mb-0">A single arrangement fee (1.0%–2.5%) deducted at disbursement. No hidden charges.</p></div></div>
            <div class="feature"><div class="f-icon">🕊️</div><div><b>Free early settlement</b><p class="muted small mb-0">Settle anytime and all future interest is waived.</p></div></div>
            <a href="#/calculator" class="btn btn-gold mt-3">Try the calculator →</a></div>
          <div class="card card-accent"><h3>💡 Quick example</h3><p class="muted small">Business loan · MK 1,500,000 · 12 months · 3.5%/month</p><div id="home-calc">${UI.loading('Computing example…')}</div></div>
        </div>
      </div></section>
      <section class="section" style="background:linear-gradient(135deg,var(--emerald-deep),#0A3D30);color:#fff"><div class="container">
        <div class="sec-head"><span class="eyebrow" style="color:var(--gold-light)">Why Golden</span><h2 style="color:#fff">A lender that works the way you do</h2></div>
        <div class="grid grid-3">
          ${[['📱', 'Mobile-first portal', 'Apply, track, repay and download statements from any Android phone, iPhone, tablet or computer.'], ['⚡', 'Instant payment confirmation', 'Verified Mpamba and Airtel Money payments update your balance immediately and issue a receipt.'], ['🔐', 'Bank-grade security', 'Hashed passwords, encrypted documents, two-factor authentication and a full audit trail.'], ['🤝', 'Human support', 'AI assistant for instant answers, plus a real customer care team for everything else.'], ['🌾', 'Built for Malawi', 'Season-aware agricultural loans, group lending, salary advances aligned to payday.'], ['🔗', 'One connected system', 'Your portal is linked to the Golden Loan Services back-office — one record, everywhere.']].map(([i, t, b]) => `<div class="card" style="background:rgba(255,255,255,.06);border-color:rgba(255,255,255,.18)"><div style="font-size:26px">${i}</div><h3 style="color:#fff;font-size:16px">${t}</h3><p style="color:#CFE8DD;font-size:13px" class="mb-0">${b}</p></div>`).join('')}
        </div>
      </div></section>
      <section class="section"><div class="container">
        <div class="sec-head"><span class="eyebrow">Testimonials</span><h2>Trusted across Malawi</h2></div>
        <div class="grid grid-3">${GFS.TESTIMONIALS.slice(0, 3).map(t => `<div class="testimonial"><div class="stars">${'★'.repeat(t.rating)}${'☆'.repeat(5 - t.rating)}</div><blockquote>“${esc(t.text)}”</blockquote><div class="t-who">${esc(t.name)} · ${esc(t.place)}</div><div class="tiny muted">${esc(t.product)}</div></div>`).join('')}</div>
        <div class="center mt-3"><a href="#/testimonials" class="btn btn-ghost">Read more stories →</a></div>
      </div></section>
      <section class="section-tight"><div class="container"><div class="cta-band">
        <div><h2>Ready to grow with Golden?</h2><p>Register in two minutes and check your eligibility instantly — no obligation.</p></div>
        <div class="flex"><a href="#/register" class="btn btn-gold btn-lg">Create Account</a><a href="#/eligibility" class="btn btn-ghost btn-lg" style="background:transparent;color:#fff;border-color:rgba(255,255,255,.5)">Check Eligibility</a></div>
      </div></div></section>`;
    },
    mount: async el => {
      const d = await API.post('/api/calculator', { productId: 'BL', amount: 1500000, term: 12 });
      const s = d.schedule;
      el.querySelector('#home-calc').innerHTML = `
        <div class="stat-row" style="grid-template-columns:1fr 1fr">
          <div class="kpi emerald"><div class="k-label">Monthly instalment</div><div class="k-value">${GFS.mk(s.installment)}</div></div>
          <div class="kpi"><div class="k-label">Total repayable</div><div class="k-value">${GFS.mk(s.totalRepayable)}</div></div>
        </div>
        <div class="mt-2 small muted">Total interest ${GFS.mk(s.totalInterest)} · arrangement fee ${GFS.mk(s.fee)} · net disbursement ${GFS.mk(s.netDisbursement)}</div>
        <a href="#/calculator" class="btn btn-emerald btn-block mt-2">Calculate your own →</a>`;
    }
  });

  /* ---------------- 2. ABOUT ---------------- */
  App.route('/about', { title: 'About Us', nav: '/about', render: async () => `
    <div class="container section">
      <div class="sec-head"><span class="eyebrow">About Us</span><h1>Growing Malawi, one loan at a time</h1>
      <p class="lead muted">Golden Financial Services Limited is a Malawian lending company headquartered in Lilongwe. Since ${C().founded} we have helped traders, farmers, salaried employees, students and families access fair, transparent credit in Malawi Kwacha.</p></div>
      <div class="grid grid-2">
        <div class="card card-accent"><h3>🎯 Our mission</h3><p>To make responsible credit accessible to every Malawian — with clear pricing, fast decisions and a portal that puts customers in control of their borrowing.</p><h3>👁️ Our vision</h3><p class="mb-0">To be Malawi's most trusted digital lender, known for fairness, speed and the success of the businesses and families we finance.</p></div>
        <div class="card"><h3>💎 Our values</h3>
          ${[['Transparency', 'Every rate, fee and penalty is shown before you sign.'], ['Respect', 'We treat every customer fairly, especially in difficulty.'], ['Speed', 'Most complete applications are decided within 24 hours.'], ['Security', 'Your data is encrypted and never sold.'], ['Community', 'We lend to grow Malawian enterprise, not to trap it.']].map(([t, b]) => `<div class="feature mb-1"><div class="f-icon">✓</div><div><b>${t}</b><div class="muted small">${b}</div></div></div>`).join('')}
        </div>
      </div>
      <div class="grid grid-4 mt-3">
        ${[['2018', 'Founded in Lilongwe'], ['4', 'Branches nationwide'], ['10', 'Loan products'], ['MWK', 'All lending in Kwacha']].map(([v, l]) => `<div class="kpi"><div class="k-value">${v}</div><div class="k-sub">${l}</div></div>`).join('')}
      </div>
      <div class="card mt-3"><h3>🔗 One connected platform</h3><p class="mb-0">This website and customer portal are linked to the <a href="${C().adminSystem}" target="_blank" rel="noopener">Golden Loan Services</a> back-office system. Applications, payments and statements share one central record, and system settings — products, rates and fees — are managed by the back-office, never by customers. <a href="#/contact">Talk to us →</a></p></div>
    </div>` });

  /* ---------------- 3. SERVICES ---------------- */
  App.route('/services', { title: 'Our Services', nav: '/services', render: async () => `
    <div class="container section">
      <div class="sec-head"><span class="eyebrow">Our Services</span><h1>More than loans — a full financial service</h1></div>
      <div class="grid grid-3">
        ${[['💰', 'Lending', 'Ten loan products from MK 20,000 emergency cash to MK 80,000,000 mortgages, all priced on the declining balance.', '/loans'],
          ['📱', 'Digital customer portal', 'Apply, track, sign agreements, repay, download statements and receipts — from any device.', '/register'],
          ['💳', 'Payment services', 'Repay with TNM Mpamba, Airtel Money, FDH or Standard Bank transfer, or cash at any branch.', '/repayment-methods'],
          ['🧮', 'Financial tools', 'Loan calculator with full amortisation, eligibility checker and smart product recommendations.', '/calculator'],
          ['🎧', 'Customer support', 'AI assistant for instant answers plus human agents, tickets and complaint tracking.', '/contact'],
          ['📑', 'Records & statements', 'PDF loan statements, payment receipts, settlement statements and signed agreements on demand.', '/login']].map(([i, t, b, h]) => `<a class="product-card" href="#${h}" style="color:inherit"><div class="p-icon">${i}</div><h3>${t}</h3><p class="muted small mb-0">${b}</p><span class="emerald-text small" style="font-weight:700">Learn more →</span></a>`).join('')}
      </div>
    </div>` });

  /* ---------------- 4. LOAN PRODUCTS ---------------- */
  App.route('/loans', { title: 'Loan Products', nav: '/loans', render: async () => `
    <div class="container section">
      <div class="sec-head"><span class="eyebrow">Loan Products</span><h1>Find the right loan for your goal</h1><p class="muted">Compare all ten products. Rates are monthly on the declining balance; the arrangement fee is deducted at disbursement.</p></div>
      <div class="table-wrap mb-2"><table class="tbl"><thead><tr><th>Product</th><th class="num">Minimum</th><th class="num">Maximum</th><th class="num">Rate/mo</th><th class="num">Fee</th><th>Terms (months)</th><th></th></tr></thead>
      <tbody>${P().map(p => `<tr><td><b>${UI.productIcon(p.id)} ${esc(p.name)}</b></td><td class="num">${GFS.mk(p.min)}</td><td class="num">${GFS.mk(p.max)}</td><td class="num">${p.rate}%</td><td class="num">${p.fee}%</td><td>${p.terms.join(', ')}</td><td><a class="btn btn-ghost btn-sm" href="#/loans/${p.id}">Details</a></td></tr>`).join('')}</tbody></table></div>
      <div class="grid grid-3">${P().map(p => `<a class="product-card" style="--pc:${p.colour};color:inherit" href="#/loans/${p.id}"><div class="p-icon">${UI.productIcon(p.id)}</div><h3>${esc(p.name)}</h3><p class="muted small">${esc(p.blurb)}</p><div class="p-range">${GFS.mk(p.min)} – ${GFS.mk(p.max)}</div><div class="p-meta"><span class="pill">${p.rate}%/mo</span><span class="pill">${p.fee}% fee</span></div></a>`).join('')}</div>
    </div>` });

  /* ---------------- 5–14. INDIVIDUAL PRODUCTS ---------------- */
  App.route('/loans/:id', {
    title: 'Loan Product', render: async ({ id }) => {
      const p = GFS.productById(id);
      if (!p) return `<div class="container section">${UI.empty('🔍', 'Product not found', '', '<a class="btn btn-gold" href="#/loans">All products</a>')}</div>`;
      const q = GFS.amortize({ amount: Math.round((p.min + Math.min(p.max, p.min * 6)) / 2), monthlyPct: p.rate, termMonths: p.terms[Math.min(1, p.terms.length - 1)], freq: p.freqs[0], feePct: p.fee });
      return `<div class="container section">
        <a href="#/loans" class="small">← All loan products</a>
        <div class="grid grid-2 mt-2" style="align-items:start">
          <div>
            <span class="eyebrow">${UI.productIcon(p.id)} ${esc(p.name)}</span>
            <h1>${esc(p.tagline)}</h1><p class="lead muted">${esc(p.blurb)}</p>
            <div class="kpis" style="grid-template-columns:1fr 1fr">
              <div class="kpi"><div class="k-label">Amount range</div><div class="k-value" style="font-size:17px">${GFS.mk(p.min)} – ${GFS.mk(p.max)}</div></div>
              <div class="kpi emerald"><div class="k-label">Interest rate</div><div class="k-value">${p.rate}%<span style="font-size:12px">/month</span></div><div class="k-sub">Declining balance</div></div>
              <div class="kpi"><div class="k-label">Arrangement fee</div><div class="k-value">${p.fee}%</div><div class="k-sub">Deducted at disbursement</div></div>
              <div class="kpi emerald"><div class="k-label">Terms</div><div class="k-value" style="font-size:17px">${p.terms.join(', ')} mo</div><div class="k-sub">${p.freqs.join(' · ')}</div></div>
            </div>
            <div class="card mt-2"><h3>What you can use it for</h3><div class="flex wrap">${p.uses.map(u => `<span class="pill">✓ ${esc(u)}</span>`).join('')}</div></div>
            <div class="card"><h3>Eligibility requirements</h3><ul style="margin:0;padding-left:20px">${p.eligibility.map(e => `<li style="margin-bottom:6px">${esc(e)}</li>`).join('')}</ul>
              <div class="divider"></div><div class="small muted">Guarantors required: <b>${p.guarantors}</b> · Collateral: <b>${p.collateral ? 'Required for larger amounts / secured products' : 'Not required'}</b> · Late penalty: <b>2% of overdue instalment per month</b> after a 3-day grace period.</div></div>
            <div class="flex mt-2"><a href="#/portal/apply?product=${p.id}" class="btn btn-gold btn-lg">Apply for ${esc(p.name)} →</a><a href="#/calculator?product=${p.id}" class="btn btn-ghost btn-lg">Calculate</a></div>
          </div>
          <div class="card card-accent" style="position:sticky;top:90px">
            <h3>📊 Example repayment</h3><p class="muted small">${GFS.mk(q.principal)} over ${q.termMonths} months (${q.freq})</p>
            ${UI.table(['Item', 'Amount'], [['Loan amount', GFS.mk(q.principal)], ['Monthly rate', p.rate + '%'], ['Instalment', `<b>${GFS.mk(q.installment)}</b>`], ['Total interest', GFS.mk(q.totalInterest)], ['Arrangement fee', GFS.mk(q.fee)], ['Net disbursement', GFS.mk(q.netDisbursement)], ['Total repayable', `<b>${GFS.mk(q.totalRepayable)}</b>`]], { numCols: [1] })}
            <a href="#/calculator?product=${p.id}" class="btn btn-emerald btn-block mt-2">Customise this quote →</a>
            <div class="divider"></div><h3 style="font-size:14px">Also consider</h3>
            ${P().filter(x => x.id !== p.id).slice(0, 3).map(x => `<a href="#/loans/${x.id}" class="flex small" style="padding:6px 0">${UI.productIcon(x.id)} ${esc(x.name)} <span class="muted">· ${x.rate}%/mo</span></a>`).join('')}
          </div>
        </div></div>`;
    }
  });

  /* ---------------- 15. CALCULATOR ---------------- */
  App.route('/calculator', {
    title: 'Loan Calculator', nav: '/calculator', render: async () => `
    <div class="container section">
      <div class="sec-head"><span class="eyebrow">Loan Calculator</span><h1>Know your repayment before you borrow</h1><p class="muted">Declining-balance interest, equal instalments. Adjust the amount, product, rate, term and frequency — the full amortisation schedule updates instantly.</p></div>
      <div class="grid grid-2" style="align-items:start">
        <div class="card card-accent"><h3>🧮 Your loan</h3>
          <form id="calc-form">
            ${UI.field('Loan type', UI.select('productId', P().map(p => [p.id, p.name]), App.query().product || 'PL'))}
            ${UI.field('Loan amount (MWK)', UI.input('amount', 'type="number" min="10000" step="5000" value="300000" required'))}
            <div class="form-grid">
              ${UI.field('Term (months)', UI.select('term', P()[0].terms.map(t => [t, t + ' months']), 6))}
              ${UI.field('Repayment frequency', UI.select('freq', [['monthly', 'Monthly'], ['fortnightly', 'Fortnightly'], ['weekly', 'Weekly'], ['daily', 'Daily']], 'monthly'))}
              ${UI.field('Interest rate (%/month)', UI.input('rate', 'type="number" step="0.1" min="0" value="3.0"'))}
              ${UI.field('Arrangement fee (%)', UI.input('feePct', 'type="number" step="0.1" min="0" value="2.0"'))}
            </div>
            ${UI.field('Disbursement date', UI.input('startDate', `type="date" value="${GFS.iso(new Date())}"`))}
            <button class="btn btn-gold btn-block" type="submit">Calculate Repayment</button>
          </form>
        </div>
        <div id="calc-results">${UI.loading('Calculating…')}</div>
      </div>
      <div class="card mt-3" id="calc-schedule"></div>
    </div>`,
    mount: async el => {
      const form = el.querySelector('#calc-form');
      const prodSel = form.elements.productId, termSel = form.elements.term, freqSel = form.elements.freq;
      const syncProduct = () => {
        const p = GFS.productById(prodSel.value);
        termSel.innerHTML = p.terms.map(t => `<option value="${t}">${t} months</option>`).join('');
        freqSel.innerHTML = p.freqs.map(f => `<option value="${f}">${f[0].toUpperCase() + f.slice(1)}</option>`).join('');
        form.elements.rate.value = p.rate; form.elements.feePct.value = p.fee;
        form.elements.amount.min = p.min; form.elements.amount.max = p.max;
        if (Number(form.elements.amount.value) < p.min || Number(form.elements.amount.value) > p.max) form.elements.amount.value = Math.round((p.min + Math.min(p.max, p.min * 5)) / 2);
      };
      prodSel.addEventListener('change', () => { syncProduct(); calc(); });
      if (App.query().product) { prodSel.value = App.query().product; }
      syncProduct();
      async function calc() {
        const d = await API.post('/api/calculator', UI.formData(form));
        const s = d.schedule;
        el.querySelector('#calc-results').innerHTML = `
          <div class="kpis" style="grid-template-columns:1fr 1fr">
            <div class="kpi emerald"><div class="k-label">${s.freq} instalment</div><div class="k-value">${GFS.mk(s.installment)}</div><div class="k-sub">${s.periods} payments</div></div>
            <div class="kpi"><div class="k-label">Total repayable</div><div class="k-value">${GFS.mk(s.totalRepayable)}</div><div class="k-sub">Principal + interest</div></div>
            <div class="kpi"><div class="k-label">Total interest</div><div class="k-value">${GFS.mk(s.totalInterest)}</div></div>
            <div class="kpi"><div class="k-label">Arrangement fee</div><div class="k-value">${GFS.mk(s.fee)}</div><div class="k-sub">Deducted at disbursement</div></div>
          </div>
          <div class="card mt-2">${UI.table(['Summary', 'Amount'], [
            ['Net amount you receive', `<b>${GFS.mk(s.netDisbursement)}</b>`], ['Monthly equivalent', GFS.mk(s.equivalents.monthly)], ['Weekly equivalent', GFS.mk(s.equivalents.weekly)], ['Daily equivalent', GFS.mk(s.equivalents.daily)],
            ['First repayment date', GFS.fmtDate(s.startDate ? GFS.addDays(new Date(s.startDate), s.freq === 'monthly' ? 30 : s.freq === 'fortnightly' ? 14 : s.freq === 'weekly' ? 7 : 1) : new Date())],
            ['Repayment start', GFS.fmtDate(s.rows[0].dueDate)], ['Repayment end', GFS.fmtDate(s.endDate)], ['Total cost of credit', GFS.mk(s.totalCost)]], { numCols: [1] })}
          <a href="#/portal/apply?product=${d.product.id}" class="btn btn-gold btn-block mt-2">Apply for this loan →</a></div>`;
        el.querySelector('#calc-schedule').innerHTML = `<h3>📅 Amortisation schedule (${s.rows.length} ${s.freq} payments)</h3>
          ${UI.table(['#', 'Due date', 'Opening balance', 'Instalment', 'Principal', 'Interest', 'Closing balance'], s.rows.map(r => [r.no, GFS.fmtDate(r.dueDate), GFS.mk(r.opening), GFS.mk(r.installment), GFS.mk(r.principal), GFS.mk(r.interest), GFS.mk(r.closing)]), { numCols: [2, 3, 4, 5, 6], foot: ['', 'Totals', '', GFS.mk(s.totalRepayable), GFS.mk(s.principal), GFS.mk(s.totalInterest), ''] })}`;
      }
      form.addEventListener('submit', e => { e.preventDefault(); calc(); });
      form.addEventListener('change', calc);
      await calc();
    }
  });

  /* ---------------- 16. ELIGIBILITY ---------------- */
  App.route('/eligibility', {
    title: 'Loan Eligibility Checker', render: async () => `
    <div class="container section">
      <div class="sec-head"><span class="eyebrow">Eligibility Checker</span><h1>Check what you qualify for — instantly</h1><p class="muted">The same affordability rules our credit team uses: your instalment must fit within 40% of your net monthly income, less existing obligations. No obligation, no credit footprint.</p></div>
      <div class="grid grid-2" style="align-items:start">
        <div class="card card-accent"><form id="elig-form">
          ${UI.field('Loan product', UI.select('productId', P().map(p => [p.id, p.name]), 'PL'))}
          <div class="form-grid">
            ${UI.field('Amount (MWK)', UI.input('amount', 'type="number" value="300000" min="10000" required'))}
            ${UI.field('Term (months)', UI.select('term', [1, 3, 6, 12, 18, 24, 36].map(t => [t, t]), 6))}
            ${UI.field('Gross monthly income (MWK)', UI.input('income', 'type="number" value="600000" min="0" required'))}
            ${UI.field('Monthly expenses (MWK)', UI.input('expenses', 'type="number" value="250000" min="0"'))}
            ${UI.field('Guarantors available', UI.select('guarantors', [0, 1, 2, 3].map(n => [n, n]), 1))}
            ${UI.field('Collateral value (MWK, if any)', UI.input('collateralValue', 'type="number" value="0" min="0"'))}
          </div>
          <label class="check"><input type="checkbox" name="kycVerified" checked> I have a valid national ID, passport or driving licence</label>
          <button class="btn btn-gold btn-block" type="submit">Check My Eligibility</button>
        </form></div>
        <div id="elig-results">${UI.empty('✅', 'Your result appears here', 'Fill the form and check — it takes one second.')}</div>
      </div>
    </div>`,
    mount: async el => {
      const form = el.querySelector('#elig-form');
      async function check() {
        const d = await API.post('/api/eligibility', UI.formData(form));
        const ok = d.eligible;
        el.querySelector('#elig-results').innerHTML = `
          <div class="card" style="border-top:5px solid ${ok ? 'var(--emerald)' : 'var(--red)'}">
            <div class="center"><div style="font-size:44px">${ok ? '🎉' : '🤔'}</div><h2 style="color:${ok ? 'var(--emerald-700)' : 'var(--red)'}">${ok ? 'You likely qualify!' : 'Not quite yet'}</h2>
            <p class="muted">Credit score <b>${d.score}/100</b> · ${d.risk} risk · debt-to-income ${d.dti}%</p></div>
            ${UI.progressBar(d.score)}
            ${ok ? `<div class="alert alert-success mt-2">✓ Based on ${esc(d.product.name)}, ${GFS.mk(Number(form.elements.amount.value))} over ${form.elements.term.value} months. Your estimated instalment is <b>${GFS.mk(d.monthlyInst)}/month</b> against a capacity of ${GFS.mk(d.capacity)}.</div>` : `<div class="alert alert-error mt-2"><div><b>Why not:</b><ul style="margin:6px 0 0;padding-left:18px">${d.reasons.map(r => `<li>${esc(r)}</li>`).join('')}</ul></div></div>`}
            ${d.warnings.length ? `<div class="alert alert-warn"><div><b>Notes:</b><ul style="margin:6px 0 0;padding-left:18px">${d.warnings.map(w => `<li>${esc(w)}</li>`).join('')}</ul></div></div>` : ''}
            ${d.quote ? UI.table(['Quote', 'Amount'], [['Instalment', GFS.mk(d.quote.installment)], ['Total interest', GFS.mk(d.quote.totalInterest)], ['Arrangement fee', GFS.mk(d.quote.fee)], ['Total repayable', GFS.mk(d.quote.totalRepayable)]], { numCols: [1] }) : ''}
            <a href="#/portal/apply?product=${d.product.id}" class="btn ${ok ? 'btn-gold' : 'btn-ghost'} btn-block mt-2">${ok ? 'Start my application →' : 'Adjust and apply anyway →'}</a>
            <p class="tiny muted center mt-1">Indicative only. Final approval depends on verified documents and credit checks.</p>
          </div>`;
      }
      form.addEventListener('submit', e => { e.preventDefault(); check(); });
    }
  });

  /* ---------------- 17. HOW IT WORKS ---------------- */
  App.route('/how-it-works', { title: 'How It Works', nav: '/how-it-works', render: async () => `
    <div class="container section">
      <div class="sec-head"><span class="eyebrow">How It Works</span><h1>Your journey from application to settlement</h1></div>
      <div class="grid grid-2">
        ${[['📝', '1. Register & verify', 'Create your account with your email and Malawi mobile number. Verify both with one-time codes, then complete your profile and upload your ID and proof of income. Documents are encrypted and only you can see them.'],
          ['🧮', '2. Plan with the tools', 'Use the calculator and eligibility checker to choose a product, amount and term that fit your budget. Smart recommendations suggest the best product for your goal.'],
          ['📋', '3. Apply online', 'Complete the application: personal and employment details, income, guarantor, collateral (if needed), and your preferred disbursement account. Accept the terms and submit — you get a GLS-APP reference instantly.'],
          ['🔍', '4. Verification & assessment', 'Your identity, documents, guarantor and collateral are verified, and affordability is assessed automatically (instalment ≤ 40% of net income). Track every stage in your portal.'],
          ['✅', '5. Decision & offer', 'Approved applications receive a full offer: amount, rate, fee, instalment, total repayable and schedule. Rejections always include the reason, so you can adjust and re-apply.'],
          ['✍️', '6. Sign electronically', 'Review the 13-clause loan agreement and sign with a drawn or typed electronic signature. Your signed agreement is stored and downloadable as a PDF.'],
          ['💰', '7. Disbursement', 'The net amount (principal less the arrangement fee) is sent to your TNM Mpamba, Airtel Money or bank account. You receive a disbursement reference and confirmation.'],
          ['💳', '8. Repay & track', 'Pay from the portal by mobile money, bank or cash. Verified payments update your balance instantly, issue a unique receipt, and move your repayment schedule forward.'],
          ['📑', '9. Statements & records', 'Download loan statements, transaction histories, receipts and settlement statements as PDFs anytime. Everything is kept in one central record.'],
          ['🎉', '10. Settle & grow', 'Settle early anytime with future interest waived, release your collateral, and request a top-up, renewal or your next loan.']].map(([i, t, b]) => `<div class="card"><div class="flex"><div style="font-size:26px">${i}</div><h3 class="mb-0">${t}</h3></div><p class="muted small mt-1 mb-0">${b}</p></div>`).join('')}
      </div>
      <div class="cta-band mt-3"><div><h2>Start step one now</h2><p>Registration takes about two minutes.</p></div><a href="#/register" class="btn btn-gold btn-lg">Create Account →</a></div>
    </div>` });

  /* ---------------- 18. REQUIREMENTS ---------------- */
  App.route('/requirements', { title: 'Loan Requirements', render: async () => `
    <div class="container section">
      <div class="sec-head"><span class="eyebrow">Loan Requirements</span><h1>What you need to apply</h1></div>
      <div class="grid grid-2">
        <div class="card card-accent"><h3>📄 Everyone needs</h3><ul>${['Valid national ID, passport or driving licence', 'Active Malawi mobile number (TNM or Airtel)', 'Proof of income — latest payslip or 3 months bank/mobile money statements', 'Proof of residence (utility bill or letter from local authority)', 'A completed profile in the customer portal', 'Verified phone and email'].map(x => `<li style="margin-bottom:7px">${x}</li>`).join('')}</ul></div>
        <div class="card"><h3>🤝 Guarantors & security</h3><ul>${['Most products: one guarantor with a valid ID and phone, who consents in the portal', 'Group loans: two member guarantors per borrower', 'Business loans above MK 2,000,000: collateral valued at ≥ 80% of the amount', 'Asset financing: the financed asset is the security', 'Mortgages: titled property, professional valuation and 30% deposit/equity', 'Salary advance: no guarantor — employer confirmation instead'].map(x => `<li style="margin-bottom:7px">${x}</li>`).join('')}</ul></div>
      </div>
      <div class="card mt-2"><h3>📦 Product-specific documents</h3>
      ${UI.table(['Product', 'Extra documents'], [['Business Loans', 'Business registration, 6 months trading statements, stock/asset quotation'], ['Agricultural Loans', 'Season plan and budget, land access proof, extension-worker reference'], ['Education Loans', 'Admission/enrolment letter, fee structure from the institution'], ['Medical Loans', 'Medical report or quotation from a recognised facility'], ['Asset Financing', 'Supplier quotation/invoice, insurance where relevant'], ['Mortgage Loans', 'Title deed or registered sale agreement, valuation report, deposit proof'], ['Salary Advance', 'Latest payslip, employer confirmation letter, salary account proof'], ['Group Loans', 'Group constitution, savings history, joint liability agreement']])}</div>
      <div class="alert alert-info mt-2">🔐 Upload everything securely in <a href="#/portal/documents">Profile → Documents</a>. Files are encrypted at rest and visible only to you and the verification team.</div>
    </div>` });

  /* ---------------- 19. RATES & FEES ---------------- */
  App.route('/rates', { title: 'Interest Rates & Fees', render: async () => `
    <div class="container section">
      <div class="sec-head"><span class="eyebrow">Interest Rates & Fees</span><h1>Transparent pricing — every kwacha explained</h1><p class="muted">Interest is charged monthly on the <b>declining balance</b>: as you repay principal, your interest falls. The arrangement fee is a one-off percentage deducted from the disbursement.</p></div>
      <div class="table-wrap">${UI.table(['Product', 'Rate / month', 'Arrangement fee', 'Late penalty', 'Early settlement'], P().map(p => [`<b>${UI.productIcon(p.id)} ${esc(p.name)}</b>`, p.rate + '%', p.fee + '% of principal', '2% of overdue instalment / month', 'Future interest waived']))}</div>
      <div class="grid grid-3 mt-3">
        <div class="card"><h3>📉 How declining balance works</h3><p class="small muted">Each instalment covers that period's interest first, then reduces your principal. The next period's interest is computed on the smaller balance — so you pay less interest over time than a flat-rate loan.</p></div>
        <div class="card"><h3>🧾 The arrangement fee</h3><p class="small muted">A one-off fee of ${Math.min(...P().map(p => p.fee))}%–${Math.max(...P().map(p => p.fee))}% of the principal, deducted when the loan is disbursed. Example: MK 1,000,000 at 2% → you receive MK 980,000 and repay MK 1,000,000 plus interest.</p></div>
        <div class="card"><h3>⏰ Late payments</h3><p class="small muted">A 3-day grace period applies. After that, 2% of the overdue instalment is added per month (or part month) overdue. Contact us early if you are struggling — restructuring is available.</p></div>
      </div>
      <div class="alert alert-success mt-2">✓ No application fees. No monthly account fees. No early-settlement penalties. What you see in the calculator is what you pay.</div>
    </div>` });

  /* ---------------- 20. REPAYMENT METHODS ---------------- */
  App.route('/repayment-methods', { title: 'Repayment Methods', render: async () => `
    <div class="container section">
      <div class="sec-head"><span class="eyebrow">Repayment Methods</span><h1>Pay the way that suits you</h1><p class="muted">Every verified payment updates your loan balance immediately and issues a unique receipt you can download.</p></div>
      <div class="grid grid-2">${GFS.PAYMENT_METHODS.map(m => `<div class="card" style="border-left:5px solid ${m.colour}"><div class="flex"><div style="font-size:28px">${m.icon}</div><h3 class="mb-0">${esc(m.name)}</h3></div><p class="muted small mt-1">${esc(m.instructions)}</p><div class="tiny muted">Merchant / account: <span class="mono">${esc(m.merchant)}</span></div></div>`).join('')}</div>
      <div class="card mt-2"><h3>🔁 How payments are applied</h3><p class="small muted mb-0">Payments are allocated in this order: <b>penalties → fees → interest → principal</b>. Extra payments become advance credit and reduce future interest. Partial, advance, daily, weekly, fortnightly and monthly payments are all supported.</p></div>
      <div class="cta-band mt-3"><div><h2>Repay from your portal</h2><p>Sign in, open your loan, and pay in under a minute.</p></div><a href="#/portal/loans" class="btn btn-gold btn-lg">Go to My Loans →</a></div>
    </div>` });

  /* ---------------- 21. FAQ ---------------- */
  App.route('/faq', { title: 'FAQs', render: async () => `
    <div class="container section" style="max-width:860px">
      <div class="sec-head"><span class="eyebrow">FAQs</span><h1>Frequently asked questions</h1></div>
      ${GFS.FAQS.map(f => `<details class="faq-item"><summary>${esc(f.q)}</summary><div class="faq-a">${esc(f.a)}</div></details>`).join('')}
      <div class="card mt-3 center"><h3>Still have a question?</h3><p class="muted small">Our AI assistant answers instantly, and human agents are one ticket away.</p><div class="flex" style="justify-content:center"><a href="#/portal/chat" class="btn btn-emerald">💬 Live Chat</a><a href="#/contact" class="btn btn-ghost">Contact Us</a></div></div>
    </div>` });

  /* ---------------- 22. CONTACT ---------------- */
  App.route('/contact', { title: 'Contact Us', nav: '/contact', render: async () => `
    <div class="container section">
      <div class="sec-head"><span class="eyebrow">Contact Us</span><h1>We are here to help</h1></div>
      <div class="grid grid-2" style="align-items:start">
        <div>
          <div class="card"><h3>📍 Head office</h3><p class="mb-1">${esc(C().address)}</p><p class="mb-1">📞 <a href="tel:${C().phone.replace(/\s/g, '')}">${esc(C().phone)}</a></p><p class="mb-1">💬 WhatsApp: <a href="https://wa.me/${C().whatsapp.replace(/[^0-9]/g, '')}" target="_blank" rel="noopener">${esc(C().whatsapp)}</a></p><p class="mb-1">✉️ <a href="mailto:${C().email}">${esc(C().email)}</a></p><p class="mb-0">🕘 Mon–Fri 08:00–17:00 · Sat 08:00–12:00</p></div>
          <div class="card"><h3>🏢 Our branches</h3>${GFS.BRANCHES.map(b => `<div class="flex-between" style="padding:8px 0;border-bottom:1px solid var(--line-2)"><div><b>${esc(b.city)}</b><div class="tiny muted">${esc(b.address)}</div></div><span class="tiny muted nowrap">${esc(b.phone)}</span></div>`).join('')}<a href="#/branches" class="btn btn-ghost btn-sm mt-2">Branch details →</a></div>
        </div>
        <div class="card card-accent"><h3>✉️ Send us a message</h3>
          ${App.user ? `<form id="contact-form">${UI.field('Subject', UI.input('subject', 'required maxlength="150" placeholder="How can we help?"'))}${UI.field('Category', UI.select('category', [['general', 'General enquiry'], ['complaint', 'Complaint'], ['payment', 'Payment issue'], ['application', 'Application help'], ['account', 'Account'], ['feedback', 'Feedback']], 'general'))}${UI.field('Message', '<textarea name="message" required maxlength="4000" placeholder="Tell us more…"></textarea>')}<button class="btn btn-gold btn-block" type="submit">Send Message</button></form>`
          : `<p class="muted small">Sign in to send a tracked message, or use the contact details on the left.</p><a href="#/login" class="btn btn-emerald btn-block">Sign In to Message</a><div class="divider"></div><p class="small muted mb-0">Prefer email? Write to <a href="mailto:${C().support}">${C().support}</a> — we reply within one working day.</p>`}
        </div>
      </div>
    </div>`,
    mount: async el => {
      const f = el.querySelector('#contact-form');
      if (f) UI.bindForm(f, async data => { const d = await API.post('/api/tickets', data); UI.toast(`Message sent — ticket ${d.ticket.ref} created. We will reply in your portal.`); App.go('/portal/support'); });
    }
  });

  /* ---------------- 23. TESTIMONIALS ---------------- */
  App.route('/testimonials', { title: 'Customer Testimonials', render: async () => `
    <div class="container section">
      <div class="sec-head"><span class="eyebrow">Testimonials</span><h1>Stories from our customers</h1><p class="muted">Real borrowing journeys from across Malawi.</p></div>
      <div class="grid grid-3">${GFS.TESTIMONIALS.map(t => `<div class="testimonial"><div class="stars">${'★'.repeat(t.rating)}${'☆'.repeat(5 - t.rating)}</div><blockquote>“${esc(t.text)}”</blockquote><div class="t-who">${esc(t.name)} · ${esc(t.place)}</div><div class="tiny muted">${esc(t.product)}</div></div>`).join('')}</div>
      <div class="cta-band mt-3"><div><h2>Write your own success story</h2><p>Join thousands of Malawians growing with Golden.</p></div><a href="#/register" class="btn btn-gold btn-lg">Get Started →</a></div>
    </div>` });

  /* ---------------- 24. BRANCHES ---------------- */
  App.route('/branches', { title: 'Branch Locations', render: async () => `
    <div class="container section">
      <div class="sec-head"><span class="eyebrow">Branch Locations</span><h1>Visit us nationwide</h1></div>
      <div class="grid grid-2">${GFS.BRANCHES.map(b => `<div class="card branch-card"><div class="flex-between"><h3 class="mb-0">📍 ${esc(b.city)}</h3><span class="badge ${b.type === 'Head Office' ? 'badge-gold' : 'badge-green'}">${esc(b.type)}</span></div><p class="muted small mt-1 mb-1">${esc(b.address)}</p><p class="small mb-1">📞 ${esc(b.phone)}</p><p class="tiny muted mb-0">🕘 ${esc(b.hours)}</p></div>`).join('')}</div>
      <div class="alert alert-info mt-2">🅿️ All branches offer cash repayment counters, document drop-off and in-person application help. Bring your national ID.</div>
    </div>` });

  /* ---------------- 25. ANNOUNCEMENTS ---------------- */
  App.route('/announcements', { title: 'Company Announcements', render: async () => {
    const d = await API.get('/api/announcements');
    return `<div class="container section" style="max-width:860px">
      <div class="sec-head"><span class="eyebrow">Announcements</span><h1>News from Golden Financial Services</h1></div>
      ${d.announcements.map(a => `<div class="card ${a.pinned ? 'card-accent' : ''}"><div class="flex-between"><h3 class="mb-0">${a.pinned ? '📌 ' : ''}${esc(a.title)}</h3><span class="badge badge-grey">${esc(a.category)}</span></div><p class="muted small mt-1">${esc(a.body)}</p><div class="tiny muted">${GFS.fmtDateTime(a.published_at)}</div></div>`).join('') || UI.empty('📢', 'No announcements yet')}
    </div>`; } });

  /* ---------------- 26. TERMS ---------------- */
  App.route('/terms', { title: 'Terms & Conditions', render: async () => `
    <div class="container section" style="max-width:860px">
      <div class="sec-head"><span class="eyebrow">Legal</span><h1>Terms & Conditions</h1><p class="muted small">Last updated: ${GFS.fmtDate(new Date())}</p></div>
      <div class="card">
        ${[['1. About these terms', 'These terms govern your use of the Golden Financial Services website and customer portal, operated by Golden Financial Services Limited, Lilongwe, Malawi. By registering you accept them.'],
          ['2. Your account', 'You must be 18+ and provide true, current information. You are responsible for keeping your password and OTP codes confidential. Notify us immediately of any unauthorised use.'],
          ['3. Loan agreements', 'Each loan is governed by its own offer and 13-clause loan agreement, which you accept electronically before disbursement. The agreement prevails for that loan.'],
          ['4. Interest and fees', 'Interest is charged on the declining balance at the product rate shown in your offer. The arrangement fee is deducted at disbursement. Late penalties of 2% of the overdue instalment apply per month after a 3-day grace period.'],
          ['5. Repayment', 'You must repay by the schedule in your agreement. Payments are allocated to penalties, fees, interest then principal. Early settlement is allowed at any time with future interest waived.'],
          ['6. Default', 'Missed payments, false information or disposal of security may lead to demand for the full balance, enforcement of security and credit-bureau reporting, after written notice.'],
          ['7. System settings', 'Products, rates, fees and other system settings are managed by the Golden Loan Services back-office. Customer accounts cannot change them.'],
          ['8. Acceptable use', 'Do not misuse the portal, attempt unauthorised access, upload unlawful content, or interfere with the service.'],
          ['9. Liability', 'We provide the service with reasonable care. To the extent permitted by law, our liability is limited to direct losses caused by our negligence.'],
          ['10. Changes', 'We may update these terms with notice in the portal. Existing loan agreements are not varied without your consent.'],
          ['11. Governing law', 'These terms are governed by the laws of the Republic of Malawi. Disputes are subject to the courts of Malawi, and complaints may be referred to the Reserve Bank of Malawi.']].map(([t, b]) => `<h3 style="font-size:15px">${t}</h3><p class="small muted">${b}</p>`).join('')}
      </div>
    </div>` });

  /* ---------------- 27. PRIVACY ---------------- */
  App.route('/privacy', { title: 'Privacy Policy', render: async () => `
    <div class="container section" style="max-width:860px">
      <div class="sec-head"><span class="eyebrow">Legal</span><h1>Privacy Policy</h1><p class="muted small">Your data, protected. Last updated: ${GFS.fmtDate(new Date())}</p></div>
      <div class="card">
        ${[['What we collect', 'Identity and contact details, employment and income information, guarantor and collateral details, loan and payment records, documents you upload, and technical logs (IP, device, activity) for security.'],
          ['Why we collect it', 'To assess and service your loans, verify your identity (KYC), process payments, prevent fraud, meet legal obligations, and communicate with you about your account.'],
          ['How we protect it', 'Passwords are hashed with scrypt. Documents and national ID numbers are encrypted at rest with AES-256-GCM. Sessions expire automatically. Access is role-based — you can only ever see your own records. Every action is written to an audit trail.'],
          ['Who can see it', 'Only you and authorised Golden Financial Services staff (and the linked back-office system) can access your records. We never sell your data. We may share with licensed credit reference bureaus and regulators as the law requires.'],
          ['Your rights', 'Access, correct or export your data anytime from Profile → Settings → Export my data. Request deletion where the law allows (loan records must be retained for regulatory periods). Opt out of marketing messages in Settings.'],
          ['Cookies & storage', 'We use a session cookie to keep you signed in and local storage for your preferences. In GitHub Pages demo mode, data stays on your device only.'],
          ['Retention', 'Loan and transaction records are retained for the period required by Malawian financial regulation (typically 7 years after closure).'],
          ['Contact', 'Questions or complaints about privacy: ' + C().email + ' or ' + C().address + '.']].map(([t, b]) => `<h3 style="font-size:15px">${t}</h3><p class="small muted">${b}</p>`).join('')}
      </div>
    </div>` });

  /* ---------------- 28. APPLY (public entry) ---------------- */
  App.route('/apply', { title: 'Apply for a Loan', render: async () => {
    if (App.user) { App.go('/portal/apply'); return ''; }
    return `<div class="container section">
      <div class="sec-head center" style="margin-inline:auto"><span class="eyebrow">Online Loan Application</span><h1>Apply for a loan in minutes</h1><p class="muted">Create your free account, then complete the guided application. You will get a reference number and can track every stage.</p></div>
      <div class="grid grid-3">
        ${[['1', 'Create account', 'Register with your email and mobile number, verify with one-time codes.'], ['2', 'Complete & apply', 'Fill your profile, upload your ID, choose a product and submit.'], ['3', 'Sign & receive', 'Accept your offer electronically and get funds via mobile money or bank.']].map(([n, t, b]) => `<div class="card center"><div class="s-no" style="margin:0 auto 12px">${n}</div><h3>${t}</h3><p class="muted small mb-0">${b}</p></div>`).join('')}
      </div>
      <div class="center mt-3 flex" style="justify-content:center"><a href="#/register" class="btn btn-gold btn-lg">Create Account & Apply →</a><a href="#/login" class="btn btn-ghost btn-lg">I already have an account</a></div>
      <div class="alert alert-info mt-3" style="max-width:720px;margin-inline:auto">💡 Not sure yet? <a href="#/eligibility">Check your eligibility</a> or <a href="#/calculator">calculate a repayment</a> first — no account needed.</div>
    </div>`; } });
})();
