/* Customer registration, login, OTP verification, password reset. */
'use strict';
(() => {
  const esc = UI.esc;
  const authShell = (title, sub, inner, wide) => `
    <div class="auth-wrap">
      <a class="auth-back" href="#/">← Back to website</a>
      <div class="auth-card" ${wide ? 'style="max-width:620px"' : ''}>
        <img class="auth-logo" src="assets/logo.png" alt="Golden Financial Services logo">
        <h2 class="auth-title">${title}</h2><p class="auth-sub">${sub}</p>
        ${inner}
      </div>
      <p style="color:#9DBFB1;font-size:11.5px;margin-top:18px">🔐 Secured by Golden Financial Services · ${GFS.COMPANY.legal}</p>
    </div>`;

  /* ---------------- 29. REGISTRATION ---------------- */
  App.route('/register', {
    title: 'Create Account', layout: 'auth', render: async () => authShell('Create your account', 'Join Golden Financial Services — it takes two minutes', `
      ${API.mode === 'local' ? '<div class="alert alert-warn small">Device-local demo mode: your account is stored on this device only. Connect the secure backend for a live account.</div>' : ''}
      <form id="reg-form">
        <div class="form-grid">
          ${UI.field('First name', UI.input('firstName', 'required maxlength="60" autocomplete="given-name"'))}
          ${UI.field('Last name', UI.input('lastName', 'required maxlength="60" autocomplete="family-name"'))}
        </div>
        ${UI.field('Email address', UI.input('email', 'type="email" required autocomplete="email" placeholder="you@example.com"'))}
        ${UI.field('Mobile number', UI.input('phone', 'type="tel" required placeholder="0999 123 456" autocomplete="tel"'), 'TNM or Airtel — we send your verification code here')}
        <div class="form-grid">
          ${UI.field('Date of birth', UI.input('dob', 'type="date"'))}
          ${UI.field('District', UI.select('district', ['', 'Lilongwe', 'Blantyre', 'Mzuzu', 'Zomba', 'Mangochi', 'Kasungu', 'Salima', 'Dedza', 'Ntcheu', 'Mchinji', 'Other'].map(d => [d, d || 'Select…']), ''))}
        </div>
        ${UI.field('Password', UI.input('password', 'type="password" required minlength="8" autocomplete="new-password"'), 'At least 8 characters with upper & lower case and a number')}
        ${UI.field('Confirm password', UI.input('confirmPassword', 'type="password" required autocomplete="new-password"'))}
        <label class="check"><input type="checkbox" name="acceptTerms" required> I accept the <a href="#/terms" target="_blank">Terms & Conditions</a> and <a href="#/privacy" target="_blank">Privacy Policy</a>, and consent to identity and credit checks.</label>
        <button class="btn btn-gold btn-block btn-lg" type="submit">Create Account →</button>
      </form>
      <p class="auth-alt">Already registered? <a href="#/login">Sign in</a></p>`),
    mount: async el => {
      const f = el.querySelector('#reg-form');
      UI.bindForm(f, async data => {
        if (data.password !== data.confirmPassword) throw new Error('Passwords do not match.');
        const d = await API.post('/api/auth/register', data);
        sessionStorage.setItem('gfs_verify', JSON.stringify({ phone: d.phone, email: d.email, devCodes: d.devCodes || null, name: data.firstName }));
        UI.toast(`Account ${d.customerNo} created! Verify your phone and email.`);
        App.go('/verify');
      });
    }
  });

  /* ---------------- verification (email + phone OTP) ---------------- */
  App.route('/verify', {
    title: 'Verify Your Account', layout: 'auth', render: async () => {
      const v = JSON.parse(sessionStorage.getItem('gfs_verify') || 'null');
      if (!v) { App.go('/register'); return ''; }
      return authShell('Verify your account', `We sent codes to your phone and email, ${esc(v.name || '')}`, `
        ${v.devCodes ? `<div class="demo-box"><b>Development mode codes</b> (delivered by SMS/email in production):<br>📱 Phone: <b class="mono">${v.devCodes.phone}</b> · ✉️ Email: <b class="mono">${v.devCodes.email}</b><br><span class="tiny">Also saved in Notifications → SMS/Email history.</span></div>` : ''}
        <form id="phone-form" class="mb-2">
          ${UI.field(`Phone code (sent to ${esc(v.phone)})`, UI.input('code', 'class="otp-input" maxlength="6" inputmode="numeric" placeholder="••••••" required'))}
          <input type="hidden" name="purpose" value="verify_phone"><input type="hidden" name="target" value="${esc(v.phone)}">
          <button class="btn btn-emerald btn-block" type="submit">Verify Phone</button>
          <button class="btn-link" type="button" id="resend-phone">Resend phone code</button>
        </form>
        <hr class="divider">
        <form id="email-form">
          ${UI.field(`Email code (sent to ${esc(v.email)})`, UI.input('code', 'class="otp-input" maxlength="6" inputmode="numeric" placeholder="••••••" required'))}
          <input type="hidden" name="purpose" value="verify_email"><input type="hidden" name="target" value="${esc(v.email)}">
          <button class="btn btn-emerald btn-block" type="submit">Verify Email</button>
          <button class="btn-link" type="button" id="resend-email">Resend email code</button>
        </form>
        <p class="auth-alt"><a href="#/login">Continue to sign in →</a></p>`);
    },
    mount: async el => {
      const v = JSON.parse(sessionStorage.getItem('gfs_verify') || '{}');
      const bind = (id, purpose) => {
        const f = el.querySelector(id);
        UI.bindForm(f, async data => {
          const d = await API.post('/api/auth/verify-otp', data);
          UI.toast(purpose === 'verify_phone' ? 'Phone verified ✓' : 'Email verified ✓');
          f.querySelector('button[type=submit]').textContent = 'Verified ✓'; f.querySelector('button[type=submit]').disabled = true;
          if (d.user) { App.user = d.user; }
        });
      };
      bind('#phone-form', 'verify_phone'); bind('#email-form', 'verify_email');
      const resend = async (purpose, target) => { const d = await API.post('/api/auth/resend-otp', { purpose, target }); UI.toast(d.devCode ? `New code: ${d.devCode} (dev mode)` : 'New code sent.'); };
      el.querySelector('#resend-phone').onclick = () => resend('verify_phone', v.phone);
      el.querySelector('#resend-email').onclick = () => resend('verify_email', v.email);
    }
  });

  /* ---------------- 30. LOGIN ---------------- */
  App.route('/login', {
    title: 'Sign In', layout: 'auth', render: async () => authShell('Welcome back', 'Sign in to your customer portal', `
      ${API.mode === 'server' ? `<div class="demo-box"><b>Try the demo account</b><br>Email: <b>demo@goldenfinancial.mw</b> · Password: <b>Demo@1234</b><br><button class="btn-link" id="fill-demo" type="button">Fill demo credentials →</button></div>` : `<div class="demo-box"><b>Device-local demo</b> — Email: <b>demo@goldenfinancial.mw</b> · Password: <b>Demo@1234</b> <button class="btn-link" id="fill-demo" type="button">Fill →</button></div>`}
      <form id="login-form">
        ${UI.field('Email or phone number', UI.input('email', 'required autocomplete="username" placeholder="you@example.com or 0999…"'))}
        ${UI.field('Password', UI.input('password', 'type="password" required autocomplete="current-password"'))}
        <div class="flex-between mb-2"><label class="check" style="margin:0"><input type="checkbox" name="remember" checked> Keep me signed in</label><a href="#/forgot-password" class="small">Forgot password?</a></div>
        <button class="btn btn-gold btn-block btn-lg" type="submit">Sign In →</button>
      </form>
      <p class="auth-alt">New to Golden? <a href="#/register">Create an account</a></p>`),
    mount: async el => {
      const f = el.querySelector('#login-form');
      const fd = el.querySelector('#fill-demo');
      if (fd) fd.onclick = () => { f.elements.email.value = 'demo@goldenfinancial.mw'; f.elements.password.value = 'Demo@1234'; };
      UI.bindForm(f, async data => {
        const d = await API.post('/api/auth/login', data);
        if (d.twofaRequired) {
          sessionStorage.setItem('gfs_2fa', JSON.stringify({ target: d.target, devCode: d.devCode || null }));
          App.go('/login-2fa'); return;
        }
        API.setToken(d.token); App.user = d.user;
        UI.toast(`Welcome back, ${d.user.firstName}!`);
        const next = App.query().next;
        App.go(next && next.startsWith('/portal') ? next : '/portal');
      });
    }
  });

  /* ---------------- two-factor ---------------- */
  App.route('/login-2fa', {
    title: 'Two-Factor Authentication', layout: 'auth', render: async () => {
      const t = JSON.parse(sessionStorage.getItem('gfs_2fa') || 'null');
      if (!t) { App.go('/login'); return ''; }
      return authShell('Two-factor authentication', `Enter the code sent to ${esc(t.target)}`, `
        ${t.devCode ? `<div class="demo-box">Dev code: <b class="mono">${t.devCode}</b></div>` : ''}
        <form id="twofa-form">
          ${UI.field('Authentication code', UI.input('code', 'class="otp-input" maxlength="6" inputmode="numeric" required'))}
          <input type="hidden" name="purpose" value="login_2fa"><input type="hidden" name="target" value="${esc(t.target)}">
          <button class="btn btn-gold btn-block btn-lg" type="submit">Verify & Sign In</button>
        </form>`);
    },
    mount: async el => {
      UI.bindForm(el.querySelector('#twofa-form'), async data => {
        const d = await API.post('/api/auth/verify-otp', data);
        API.setToken(d.token); App.user = d.user; sessionStorage.removeItem('gfs_2fa');
        UI.toast('Signed in securely ✓'); App.go('/portal');
      });
    }
  });

  /* ---------------- forgot / reset password ---------------- */
  App.route('/forgot-password', {
    title: 'Forgot Password', layout: 'auth', render: async () => authShell('Reset your password', 'Enter your email and we will send a reset code', `
      <form id="forgot-form">
        ${UI.field('Email address', UI.input('email', 'type="email" required placeholder="you@example.com"'))}
        <button class="btn btn-gold btn-block" type="submit">Send Reset Code</button>
      </form><p class="auth-alt"><a href="#/login">← Back to sign in</a></p>`),
    mount: async el => {
      UI.bindForm(el.querySelector('#forgot-form'), async data => {
        const d = await API.post('/api/auth/forgot-password', data);
        sessionStorage.setItem('gfs_reset', JSON.stringify({ email: data.email, devCode: d.devCode || null }));
        UI.toast('If the account exists, a reset code has been sent.'); App.go('/reset-password');
      });
    }
  });
  App.route('/reset-password', {
    title: 'Reset Password', layout: 'auth', render: async () => {
      const r = JSON.parse(sessionStorage.getItem('gfs_reset') || '{}');
      return authShell('Choose a new password', 'Enter the code we sent and your new password', `
        ${r.devCode ? `<div class="demo-box">Dev reset code: <b class="mono">${r.devCode}</b></div>` : ''}
        <form id="reset-form">
          ${UI.field('Email', UI.input('email', `type="email" required value="${esc(r.email || '')}"`))}
          ${UI.field('Reset code', UI.input('code', 'class="otp-input" maxlength="6" inputmode="numeric" required'))}
          ${UI.field('New password', UI.input('password', 'type="password" required minlength="8"'))}
          ${UI.field('Confirm new password', UI.input('confirm', 'type="password" required'))}
          <button class="btn btn-gold btn-block" type="submit">Reset Password</button>
        </form><p class="auth-alt"><a href="#/login">← Back to sign in</a></p>`);
    },
    mount: async el => {
      UI.bindForm(el.querySelector('#reset-form'), async data => {
        if (data.password !== data.confirm) throw new Error('Passwords do not match.');
        await API.post('/api/auth/reset-password', data);
        sessionStorage.removeItem('gfs_reset');
        UI.toast('Password reset ✓ Please sign in.'); App.go('/login');
      });
    }
  });
})();
