/* Portal account modules: profile, documents & KYC, guarantors, collateral,
   security, settings (personal prefs + READ-ONLY system settings), activity. */
'use strict';
(() => {
  const esc = UI.esc;
  const head = (t, s, a = '') => `<div class="page-head"><div><h1>${t}</h1>${s ? `<div class="sub">${s}</div>` : ''}</div><div class="flex wrap">${a}</div></div>`;
  const DISTRICTS = ['Lilongwe', 'Blantyre', 'Mzuzu', 'Zomba', 'Mangochi', 'Kasungu', 'Salima', 'Dedza', 'Ntcheu', 'Mchinji', 'Nkhotakota', 'Karonga', 'Other'];

  /* ---------------- PROFILE ---------------- */
  App.route('/portal/profile', {
    title: 'My Profile', layout: 'portal', auth: true, render: async () => {
      const u = App.user;
      const e = u.employment || {}, b = u.business || {}, k = u.nextOfKin || {};
      return head('My Profile', `Customer ${esc(u.customerNo)} · KYC ${UI.badge(u.kycStatus)}`) + `
      <div class="grid grid-2" style="align-items:start">
        <div class="card card-accent"><h3>👤 Personal information</h3>
          <div class="flex mb-2"><div class="avatar" style="width:64px;height:64px;border-radius:50%;background:linear-gradient(135deg,var(--gold-2),var(--gold));display:flex;align-items:center;justify-content:center;font:800 22px var(--font);color:var(--gold-ink);overflow:hidden" id="avatar-box">${u.avatarDocId ? `<img src="api/documents/${u.avatarDocId}/file" style="width:100%;height:100%;object-fit:cover" alt="">` : UI.initials(u.firstName, u.lastName)}</div>
            <div><b>${esc(u.firstName)} ${esc(u.lastName)}</b><div class="tiny muted">${esc(u.email)} · ${esc(u.phone)}</div><label class="btn btn-ghost btn-sm mt-1" style="cursor:pointer">📷 Change photo<input type="file" id="avatar-input" accept="image/png,image/jpeg" hidden></label></div></div>
          <form id="personal-form">
            <div class="form-grid">
              ${UI.field('First name', UI.input('firstName', `value="${esc(u.firstName)}" required`))}
              ${UI.field('Last name', UI.input('lastName', `value="${esc(u.lastName)}" required`))}
              ${UI.field('Date of birth', UI.input('dob', `type="date" value="${esc(u.dob || '')}"`))}
              ${UI.field('Gender', UI.select('gender', [['', 'Select…'], ['Female', 'Female'], ['Male', 'Male'], ['Other', 'Other']], u.gender || ''))}
              ${UI.field('Marital status', UI.select('maritalStatus', [['', 'Select…'], ['Single', 'Single'], ['Married', 'Married'], ['Divorced', 'Divorced'], ['Widowed', 'Widowed']], u.maritalStatus || ''))}
              ${UI.field('ID type', UI.select('idType', [['national_id', 'National ID'], ['passport', 'Passport'], ['driving_licence', 'Driving licence']], u.idType || 'national_id'))}
            </div>
            ${UI.field('ID number', UI.input('nationalId', `value="${esc(u.nationalIdMasked || '')}" placeholder="e.g. 123456/78/9"`), 'Encrypted at rest. Shown masked after saving.')}
            <button class="btn btn-emerald" type="submit">Save personal info</button>
          </form>
        </div>
        <div class="card"><h3>🏠 Residential address</h3>
          <form id="address-form">
            <div class="form-grid">
              ${UI.field('District', UI.select('district', DISTRICTS.map(d => [d, d]), u.district || ''))}
              ${UI.field('City / town', UI.input('city', `value="${esc(u.city || '')}"`))}
              ${UI.field('Area', UI.input('area', `value="${esc(u.area || '')}" placeholder="e.g. Area 47"`))}
            </div>
            ${UI.field('Physical address', UI.input('addressLine', `value="${esc(u.addressLine || '')}" placeholder="House no., street"`))}
            <button class="btn btn-emerald" type="submit">Save address</button>
          </form>
          <hr class="divider"><h3>👪 Next of kin</h3>
          <form id="kin-form">
            <div class="form-grid">
              ${UI.field('Full name', UI.input('kName', `value="${esc(k.name || '')}"`))}
              ${UI.field('Relationship', UI.input('kRelationship', `value="${esc(k.relationship || '')}"`))}
              ${UI.field('Phone', UI.input('kPhone', `value="${esc(k.phone || '')}"`))}
            </div>
            ${UI.field('Address', UI.input('kAddress', `value="${esc(k.address || '')}"`))}
            <button class="btn btn-emerald" type="submit">Save next of kin</button>
          </form>
        </div>
      </div>
      <div class="grid grid-2 mt-2" style="align-items:start">
        <div class="card"><h3>💼 Employment information</h3>
          <form id="employ-form">
            ${UI.field('Employment status', UI.select('status', [['', 'Select…'], ['Employed — salaried', 'Employed — salaried'], ['Self-employed', 'Self-employed'], ['Business owner', 'Business owner'], ['Farmer', 'Farmer'], ['Student', 'Student'], ['Other', 'Other']], e.status || ''))}
            <div class="form-grid">
              ${UI.field('Employer / business name', UI.input('employer', `value="${esc(e.employer || '')}"`))}
              ${UI.field('Role / position', UI.input('position', `value="${esc(e.position || e.role || '')}"`))}
              ${UI.field('Employed since', UI.input('employedSince', `type="date" value="${esc(e.employedSince || '')}"`))}
              ${UI.field('Pay day (day of month)', UI.input('payDay', `type="number" min="1" max="31" value="${e.payDay || ''}"`))}
            </div>
            <button class="btn btn-emerald" type="submit">Save employment</button>
          </form>
        </div>
        <div class="card"><h3>🏪 Business information</h3>
          <form id="business-form">
            <div class="form-grid">
              ${UI.field('Business name', UI.input('name', `value="${esc(b.name || '')}"`))}
              ${UI.field('Sector / type', UI.input('type', `value="${esc(b.type || '')}"`))}
              ${UI.field('Registration no.', UI.input('registrationNo', `value="${esc(b.registrationNo || b.regNo || '')}"`))}
              ${UI.field('Trading since', UI.input('started', `value="${esc(b.started || '')}" placeholder="e.g. 2020"`))}
            </div>
            
            <button class="btn btn-emerald" type="submit">Save business</button>
          </form>
          <hr class="divider"><h3>💵 Monthly income</h3>
          <form id="income-form">
            <div class="form-grid">
              ${UI.field('Gross monthly income (MWK)', UI.input('monthlyIncome', `type="number" min="0" value="${u.monthlyIncome || 0}"`))}
              ${UI.field('Other income (MWK)', UI.input('otherIncome', `type="number" min="0" value="${u.otherIncome || 0}"`))}
              ${UI.field('Monthly expenses (MWK)', UI.input('monthlyExpenses', `type="number" min="0" value="${u.monthlyExpenses || 0}"`))}
            </div>
            <button class="btn btn-emerald" type="submit">Save income</button>
          </form>
        </div>
      <div class="card mt-2"><div class="card-title-row"><div><h3>Contact verification</h3><p>Verify the phone and email used for security codes and account recovery.</p></div><span class="badge badge-gold">Account security</span></div><div class="grid grid-2"><div class="contact-verify-row">${UI.icon('phone')}<div><b>${esc(u.phone)}</b><span>${u.phoneVerified ? 'Verified' : 'Not verified'}</span></div>${u.phoneVerified ? UI.badge('verified') : '<button class="btn btn-ghost btn-sm" id="verify-phone-btn">Verify phone</button>'}</div><div class="contact-verify-row">${UI.icon('mail')}<div><b>${esc(u.email)}</b><span>${u.emailVerified ? 'Verified' : 'Not verified'}</span></div>${u.emailVerified ? UI.badge('verified') : '<button class="btn btn-ghost btn-sm" id="verify-email-btn">Verify email</button>'}</div></div></div>
      </div>`;
    },
    mount: async el => {
      const save = async (form, map) => { const d = await API.put('/api/profile', map(UI.formData(form))); App.user = d.user; UI.toast('Saved ✓'); };
      UI.bindForm(el.querySelector('#personal-form'), d => save(el.querySelector('#personal-form'), x => x));
      UI.bindForm(el.querySelector('#address-form'), d => save(el.querySelector('#address-form'), x => x));
      UI.bindForm(el.querySelector('#kin-form'), d => save(el.querySelector('#kin-form'), x => ({ nextOfKin: { name: x.kName, relationship: x.kRelationship, phone: x.kPhone, address: x.kAddress } })));
      UI.bindForm(el.querySelector('#employ-form'), d => save(el.querySelector('#employ-form'), x => ({ employment: x })));
      UI.bindForm(el.querySelector('#business-form'), d => save(el.querySelector('#business-form'), x => ({ business: x })));
      UI.bindForm(el.querySelector('#income-form'), d => save(el.querySelector('#income-form'), x => ({ monthlyIncome: Number(x.monthlyIncome), otherIncome: Number(x.otherIncome), monthlyExpenses: Number(x.monthlyExpenses) })));
      const av = el.querySelector('#avatar-input');
      av.onchange = async () => {
        const file = av.files[0]; if (!file) return;
        if (file.size > 2 * 1024 * 1024) return UI.toast('Photo must be under 2 MB.', 'err');
        const data = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result.split(',')[1]); fr.readAsDataURL(file); });
        try { const d = await API.post('/api/documents', { kind: 'avatar', filename: file.name, mime: file.type, data }); App.user.avatarDocId = d.document.id; UI.toast('Photo updated ✓'); App.render(); } catch (e) { UI.toast(e.message, 'err'); }
      };
      const verifyContact = async purpose => {
        try {
          const ch = await API.post('/api/auth/resend-otp', { purpose });
          const m = UI.modal(`<h3>${purpose === 'verify_phone' ? 'Verify phone' : 'Verify email'}</h3>${ch.devCode ? `<div class="demo-box"><b>Sandbox code:</b> <span class="mono">${esc(ch.devCode)}</span></div>` : '<p class="muted">Enter the code sent to your contact address.</p>'}<form id="contact-otp-form">${UI.field('Verification code', UI.input('code', 'maxlength="6" inputmode="numeric" required'))}<button class="btn btn-gold btn-block" type="submit">Verify</button></form>`);
          UI.bindForm(m.el.querySelector('#contact-otp-form'), async data => { const r = await API.post('/api/auth/verify-otp', { purpose, challenge: ch.challenge, code: data.code }); App.user = r.user; m.close(); UI.toast('Contact verified.'); App.render(); });
        } catch (e) { UI.toast(e.message, 'err'); }
      };
      el.querySelector('#verify-phone-btn')?.addEventListener('click', () => verifyContact('verify_phone'));
      el.querySelector('#verify-email-btn')?.addEventListener('click', () => verifyContact('verify_email'));
    }
  });

  /* ---------------- DOCUMENTS & KYC ---------------- */
  const DOC_KINDS = [['national_id', 'National ID'], ['passport', 'Passport'], ['driving_licence', 'Driving licence'], ['payslip', 'Payslip'], ['bank_statement', 'Bank statement'], ['business_statement', 'Business statement'], ['proof_of_address', 'Proof of address'], ['business_registration', 'Business registration'], ['admission_letter', 'Admission letter'], ['medical_report', 'Medical report'], ['supplier_invoice', 'Supplier invoice'], ['property_title', 'Property title'], ['valuation_report', 'Valuation report'], ['guarantor_id', 'Guarantor ID'], ['guarantor_consent', 'Guarantor consent'], ['collateral_document', 'Collateral document'], ['other', 'Other']];
  App.route('/portal/documents', {
    title: 'Documents & KYC', layout: 'portal', auth: true, render: async () => {
      const d = await API.get('/api/documents');
      const u = App.user;
      const hasId = d.documents.some(x => ['national_id', 'passport', 'driving_licence'].includes(x.kind));
      const hasIncome = d.documents.some(x => ['payslip', 'bank_statement', 'business_statement'].includes(x.kind));
      const steps = [['Phone verified', u.phoneVerified], ['Email verified', u.emailVerified], ['ID uploaded', hasId], ['Income evidence uploaded', hasIncome], ['Identity review', u.kycStatus === 'verified']];
      const done = steps.filter(s => s[1]).length;
      return head('Documents & KYC', 'Secure, encrypted document storage — only you can see your files') + `
      <div class="card card-accent"><div class="flex-between wrap"><div><h3 class="mb-0">🪪 KYC status: ${UI.badge(u.kycStatus)}</h3><div class="muted small mt-1">${done}/5 readiness steps complete</div></div><div style="min-width:220px;flex:1;max-width:340px">${UI.progressBar(done / 5 * 100)}</div></div>
        <div class="grid grid-5 mt-2">${steps.map(([l, ok]) => `<div class="pill" style="border-color:${ok ? 'var(--emerald)' : 'var(--line)'};color:${ok ? 'var(--emerald-700)' : 'var(--muted)'}">${ok ? '✓' : '○'} ${l}</div>`).join('')}</div>
        ${(!u.phoneVerified || !u.emailVerified) ? `<div class="alert alert-warn mt-2 small">Verify your phone and email from your profile. Uploads still require separate identity review. <a href="#/portal/profile">Profile →</a></div>` : ''}
      </div>
      <div class="grid grid-2 mt-2" style="align-items:start">
        <div class="card"><h3>📤 Upload a document</h3>
          <form id="doc-form">
            ${UI.field('Document type', UI.select('kind', DOC_KINDS, 'national_id'))}
            ${UI.field('Link to application (optional)', UI.input('applicationId', 'placeholder="Application ID (optional)"'))}
            <div class="upload-zone" id="drop-zone"><div style="font-size:30px">📎</div><b>Tap to choose a file</b><div class="tiny muted">PNG, JPG or PDF · max 8 MB · encrypted in backend mode</div><input type="file" id="doc-file" accept="image/png,image/jpeg,application/pdf" hidden></div>
            <div id="doc-chosen" class="small mt-1 muted"></div>
            <button class="btn btn-gold btn-block mt-2" type="submit" id="doc-submit" disabled>Upload Securely 🔐</button>
          </form>
        </div>
        <div class="card"><h3>🗂️ Your documents (${d.documents.length})</h3>
          ${d.documents.length ? d.documents.map(doc => `<div class="doc-tile mb-1"><div class="d-ico">${doc.mime === 'application/pdf' ? '📄' : '🖼️'}</div><div style="flex:1;min-width:0"><div class="d-name">${esc(doc.filename)}</div><div class="tiny muted">${esc((DOC_KINDS.find(k => k[0] === doc.kind) || ['', doc.kind])[1])} · ${GFS.fmtDate(doc.uploadedAt)} · ${(doc.size / 1024).toFixed(0)} KB</div></div>${UI.badge(doc.status)}<div class="flex"><button class="btn btn-ghost btn-sm" data-view="${doc.id}">👁</button><button class="btn btn-danger btn-sm" data-del="${doc.id}">🗑</button></div></div>`).join('') : UI.empty('🗂️', 'No documents yet', 'Upload your ID and proof of income to get verified.')}
        </div>
      </div>`;
    },
    mount: async el => {
      const zone = el.querySelector('#drop-zone'), fileInput = el.querySelector('#doc-file'), chosen = el.querySelector('#doc-chosen'), submit = el.querySelector('#doc-submit');
      let file = null;
      const pick = f => { if (!f) return; if (f.size > 8 * 1024 * 1024) return UI.toast('File too large (max 8 MB).', 'err'); file = f; chosen.innerHTML = `📎 <b>${esc(f.name)}</b> (${(f.size / 1024).toFixed(0)} KB)`; submit.disabled = false; };
      zone.onclick = () => fileInput.click();
      fileInput.onchange = () => pick(fileInput.files[0]);
      zone.ondragover = e => { e.preventDefault(); zone.classList.add('drag'); };
      zone.ondragleave = () => zone.classList.remove('drag');
      zone.ondrop = e => { e.preventDefault(); zone.classList.remove('drag'); pick(e.dataTransfer.files[0]); };
      UI.bindForm(el.querySelector('#doc-form'), async data => {
        if (!file) throw new Error('Choose a file first.');
        const b64 = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result.split(',')[1]); fr.readAsDataURL(file); });
        await API.post('/api/documents', { kind: data.kind, applicationId: data.applicationId || undefined, filename: file.name, mime: file.type, data: b64 });
        UI.toast(API.mode === 'local' ? 'Sandbox metadata recorded; file content discarded.' : 'Document uploaded and encrypted; awaiting review.'); await App.refreshUser(); App.render();
      });
      el.querySelectorAll('[data-view]').forEach(b => b.onclick = async () => { try { const url = await API.fileURL(`/api/documents/${b.dataset.view}/file`); window.open(url, '_blank'); } catch (e) { UI.toast(e.message, 'warn'); } });
      el.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => { if (await UI.confirmDialog('Delete document?', 'This file will be permanently removed.', { confirmText: 'Delete', danger: true })) { await API.del(`/api/documents/${b.dataset.del}`); UI.toast('Document deleted.'); App.render(); } });
    }
  });

  /* ---------------- GUARANTORS ---------------- */
  App.route('/portal/guarantors', {
    title: 'Guarantors', layout: 'portal', auth: true, render: async () => {
      const [d, docs] = await Promise.all([API.get('/api/guarantors'), API.get('/api/documents')]);
      const consentDocs = docs.documents.filter(x => x.kind === 'guarantor_consent').map(x => [x.id, x.filename]);
      const idDocs = docs.documents.filter(x => x.kind === 'guarantor_id').map(x => [x.id, x.filename]);
      return head('Guarantors', 'People who stand behind your loans — with their consent') + `
      <div class="grid grid-2" style="align-items:start">
        <div class="card card-accent"><h3>🤝 Add a guarantor</h3>
          <form id="g-form">
            <div class="form-grid">
              ${UI.field('Full name', UI.input('name', 'required maxlength="80"'))}
              ${UI.field('Phone', UI.input('phone', 'required placeholder="0999…"'))}
              ${UI.field('Relationship', UI.input('relationship', 'placeholder="e.g. Brother"'))}
              ${UI.field('Employer', UI.input('employer', ''))}
            </div>
            ${UI.field('Address', UI.input('address', ''))}
            <div class="alert alert-info small">Optional: upload guarantor ID and signed consent documents first, then select them here. Independent verification is still required.</div>
            <div class="form-grid">${UI.field('Consent document (optional)', UI.select('consentDocumentId', [['', 'None'], ...consentDocs], ''))}${UI.field('Guarantor ID document (optional)', UI.select('identityDocumentId', [['', 'None'], ...idDocs], ''))}</div>
            <label class="check"><input type="checkbox" name="consent" required> I confirm the guarantor has agreed to be contacted. Independent consent and identity verification are still required.</label>
            <button class="btn btn-gold btn-block" type="submit">Add Guarantor</button>
          </form>
        </div>
        <div class="card"><h3>📋 Your guarantors (${d.guarantors.length})</h3>
          ${d.guarantors.length ? d.guarantors.map(g => `<div class="doc-tile mb-1"><div class="d-ico">🤝</div><div style="flex:1"><div class="d-name">${esc(g.name)}</div><div class="tiny muted">${esc(g.phone)} · ${esc(g.relationship || '—')} ${g.loan_ref ? '· loan ' + esc(g.loan_ref) : g.app_ref ? '· app ' + esc(g.app_ref) : ''}</div></div>${UI.badge(g.status)}<span class="badge ${g.consent ? 'badge-green' : 'badge-amber'}">${g.consent ? 'Consented' : 'No consent'}</span></div>`).join('') : UI.empty('🤝', 'No guarantors yet', 'Add a guarantor when applying for most loan products.')}
        </div>
      </div>`;
    },
    mount: async el => { UI.bindForm(el.querySelector('#g-form'), async data => { await API.post('/api/guarantors', data); UI.toast('Guarantor added ✓'); App.render(); }); }
  });

  /* ---------------- COLLATERAL ---------------- */
  App.route('/portal/collateral', {
    title: 'Collateral', layout: 'portal', auth: true, render: async () => {
      const d = await API.get('/api/collateral');
      const types = [['land', '🌍 Land'], ['house', '🏠 House'], ['vehicle', '🚗 Vehicle'], ['household_property', '🛋️ Household property'], ['livestock', '🐄 Livestock'], ['equipment', '⚙️ Equipment'], ['other', '📦 Other']];
      return head('Collateral & Security', 'Assets pledged against your loans — valuation and release require authorised records') + `
      <div class="grid grid-2" style="align-items:start">
        <div class="card card-accent"><h3>🏠 Add collateral</h3>
          <form id="c-form">
            ${UI.field('Type', UI.select('type', types, 'vehicle'))}
            ${UI.field('Description', UI.input('description', 'required placeholder="e.g. Toyota Hiace, reg BL 4821"'))}
            <div class="form-grid">
              ${UI.field('Estimated value (MWK)', UI.input('estimatedValue', 'type="number" min="0" required'))}
              ${UI.field('Valued by', UI.input('valuedBy', 'placeholder="Valuer name"'))}
            </div>
            <div class="alert alert-info small">📎 Upload supporting documents (title deed, logbook, photos) in <a href="#/portal/documents">Documents</a> and link them to your application.</div>
            <button class="btn btn-gold btn-block" type="submit">Add Collateral</button>
          </form>
        </div>
        <div class="card"><h3>📋 Pledged assets (${d.collateral.length})</h3>
          ${d.collateral.length ? d.collateral.map(c => `<div class="doc-tile mb-1"><div class="d-ico">${(types.find(t => t[0] === c.type) || ['', '📦'])[1].split(' ')[0]}</div><div style="flex:1"><div class="d-name">${esc(c.description || c.type)}</div><div class="tiny muted">${esc(c.type)} · ${GFS.mk(c.estimated_value)} ${c.loan_ref ? '· loan ' + esc(c.loan_ref) : ''} ${c.released_at ? '· released ' + GFS.fmtDate(c.released_at) : ''}</div></div>${UI.badge(c.status)}</div>`).join('') : UI.empty('🏠', 'No collateral pledged', 'Secured products (business, asset finance, mortgage) require collateral.')}
        </div>
      </div>`;
    },
    mount: async el => { UI.bindForm(el.querySelector('#c-form'), async data => { await API.post('/api/collateral', data); UI.toast('Collateral added ✓'); App.render(); }); }
  });

  /* ---------------- SECURITY ---------------- */
  App.route('/portal/security', {
    title: 'Security', layout: 'portal', auth: true, render: async () => {
      const u = App.user;
      const [sess, act] = await Promise.all([API.get('/api/security/sessions'), API.get('/api/security/activity')]);
      return head('Account Security', 'Protect your account — passwords, two-factor authentication and sessions') + `
      <div class="grid grid-2" style="align-items:start">
        <div>
          <div class="card card-accent"><h3>🔑 Change password</h3>
            <form id="pw-form">
              ${UI.field('Current password', UI.input('currentPassword', 'type="password" required autocomplete="current-password"'))}
              ${UI.field('New password', UI.input('newPassword', 'type="password" required minlength="8" autocomplete="new-password"'), '8+ characters, upper & lower case, a number')}
              ${UI.field('Confirm new password', UI.input('confirm', 'type="password" required'))}
              <button class="btn btn-emerald" type="submit">Change Password</button>
            </form>
          </div>
          <div class="card"><div class="flex-between"><div><h3 class="mb-0">📱 Two-factor authentication</h3><div class="muted small">Require a one-time code from your phone at every sign-in.</div></div>
            <button class="btn ${u.twofaEnabled ? 'btn-danger' : 'btn-gold'}" id="twofa-toggle">${u.twofaEnabled ? 'Disable 2FA' : 'Enable 2FA'}</button></div>
            <div class="mt-1">${UI.badge(u.twofaEnabled ? 'verified' : 'pending')} ${u.twofaEnabled ? '2FA is active on your account.' : '2FA is off. We strongly recommend enabling it.'}</div>
            ${!u.phoneVerified ? '<div class="alert alert-warn small mt-2">Verify your phone first to enable 2FA.</div>' : ''}
          </div>
          <div class="card"><h3>🛡️ Security summary</h3>
            ${UI.table(['Protection', 'Status'], [['Password hashing', '✓ scrypt (salted)'], ['Documents', '✓ AES-256-GCM encrypted at rest'], ['Sessions', '✓ Auto-expiry + idle timeout (' + GFS.RULES.idleTimeoutMinutes + ' min)'], ['Login attempts', '✓ Lockout after ' + GFS.RULES.maxLoginAttempts + ' failures'], ['Audit trail', '✓ Every action recorded'], ['Access control', '✓ You see only your own records']])}
          </div>
        </div>
        <div>
          <div class="card"><h3>💻 Active sessions</h3>
            ${sess.sessions.map(s => `<div class="doc-tile mb-1"><div class="d-ico">💻</div><div style="flex:1"><div class="d-name">${s.current ? 'This device' : esc(s.ip || 'Device')}</div><div class="tiny muted">${esc((s.user_agent || '').slice(0, 60))}… · last seen ${GFS.fmtDateTime(s.last_seen_at || s.last_seen)}</div></div>${s.current ? '<span class="badge badge-green">Current</span>' : `<button class="btn btn-danger btn-sm" data-revoke="${s.id}">Revoke</button>`}</div>`).join('')}
          </div>
          <div class="card"><h3>🕘 Recent security activity</h3>
            ${act.activity.slice(0, 12).map(a => `<div class="flex-between" style="padding:8px 0;border-bottom:1px solid var(--line-2)"><div class="small"><b>${esc(a.action)}</b>${a.detail ? `<div class="tiny muted">${esc(a.detail)}</div>` : ''}</div><div class="tiny muted nowrap">${GFS.fmtDateTime(a.created_at || a.createdAt)}</div></div>`).join('') || '<p class="muted small">No activity yet.</p>'}
            <a href="#/portal/activity" class="small">Full activity history →</a>
          </div>
        </div>
      </div>`;
    },
    mount: async el => {
      UI.bindForm(el.querySelector('#pw-form'), async data => { if (data.newPassword !== data.confirm) throw new Error('Passwords do not match.'); await API.post('/api/auth/change-password', data); UI.toast('Password changed ✓ Other sessions signed out.'); });
      el.querySelector('#twofa-toggle').onclick = async () => {
        const enable = !App.user.twofaEnabled;
        try {
          let challenge = null, devCode = null;
          if (enable) { const ch = await API.post('/api/auth/verification-challenge', { purpose: 'login_2fa' }); challenge = ch.challenge; devCode = ch.devCode; }
          const m = UI.modal(`<h3>${enable ? 'Enable' : 'Disable'} two-factor authentication</h3>${devCode ? `<div class="demo-box"><b>Sandbox phone code:</b> <span class="mono">${esc(devCode)}</span></div>` : ''}<form id="twofa-settings-form">${UI.field('Current password', UI.input('password', 'type="password" required autocomplete="current-password"'))}${enable ? UI.field('Phone verification code', UI.input('code', 'maxlength="6" inputmode="numeric" required')) : ''}<button class="btn btn-gold btn-block" type="submit">${enable ? 'Enable 2FA' : 'Disable 2FA'}</button></form>`);
          UI.bindForm(m.el.querySelector('#twofa-settings-form'), async data => { await API.put('/api/security/2fa', { enabled: enable, password: data.password, challenge, code: data.code }); await App.refreshUser(); m.close(); UI.toast(`2FA ${enable ? 'enabled' : 'disabled'}.`); App.render(); });
        } catch (e) { UI.toast(e.message, 'err'); }
      };
      el.querySelectorAll('[data-revoke]').forEach(b => b.onclick = async () => { await API.del(`/api/security/sessions/${b.dataset.revoke}`); UI.toast('Session revoked.'); App.render(); });
    }
  });

  /* ---------------- SETTINGS (personal prefs + READ-ONLY system) ---------------- */
  App.route('/portal/settings', {
    title: 'Settings', layout: 'portal', auth: true, render: async () => {
      const u = App.user;
      const sys = await API.get('/api/settings/system');
      const ist = await API.get('/api/integration/status');
      const prefs = u.prefs || {};
      const adminBase = ist.url || GFS.COMPANY.adminSystem;
      return head('Settings', 'Your preferences — system settings are managed by the back-office and are read-only') + `
      <div class="grid grid-2" style="align-items:start">
        <div>
          <div class="card card-accent"><h3>🔔 Notification preferences</h3>
            <form id="prefs-form">
              ${[['sms', 'SMS notifications', 'Payment confirmations, reminders and security codes by SMS'], ['email', 'Email notifications', 'Statements, decisions and receipts by email'], ['reminders', 'Repayment reminders', 'Upcoming and overdue payment alerts'], ['marketing', 'Product updates & offers', 'News about new products and promotions']].map(([k, t, b]) => `<label class="check"><input type="checkbox" name="${k}" ${prefs[k] !== false && (k !== 'marketing' || prefs.marketing) ? 'checked' : ''}><span><b>${t}</b><div class="tiny muted">${b}</div></span></label>`).join('')}
              <button class="btn btn-emerald" type="submit">Save Preferences</button>
            </form>
          </div>
          <div class="card"><h3>🎨 Display</h3>
            <form id="theme-form">${UI.field('Theme', UI.select('theme', [['light', 'Light (default)'], ['system', 'Match device']], prefs.theme || 'light'))}
            <button class="btn btn-ghost" type="submit">Save</button></form>
            <p class="tiny muted mt-1">The gold & emerald brand theme follows the company logo and cannot be changed per customer.</p>
          </div>
          <div class="card"><h3>📦 Your data</h3>
            <p class="small muted">Export everything we hold about you — profile, loans, payments, documents and activity.</p>
            <button class="btn btn-ghost" id="export-data">⬇️ Export my data (JSON)</button>
          </div>
        </div>
        <div>
          <div class="card"><div class="flex-between"><h3 class="mb-0">🏢 System settings</h3><span class="badge badge-gold">🔒 Read-only</span></div>
            <div class="alert alert-info small mt-1">These settings are owned by the <b>${esc(sys.ownedBy)}</b> and published to this portal when the authenticated connector is configured. Customer accounts cannot change them.</div>
            ${UI.table(['Setting', 'Value'], [['Currency', esc(sys.currency)], ['Company', esc(sys.company.name)], ['Support email', esc(sys.company.support)], ['Products', sys.products.length + ' configured'], ['Affordability cap', (sys.rules.affordabilityCap * 100) + '% of net income'], ['Late penalty', sys.rules.latePenaltyPct + '% / month'], ['Grace period', sys.rules.graceDays + ' days'], ['Max active loans', sys.rules.maxActiveLoans], ['Session timeout', sys.rules.idleTimeoutMinutes + ' min idle']])}
            <details class="mt-2"><summary class="small" style="cursor:pointer;font-weight:700">View configured product rates</summary>
              ${UI.table(['Product', 'Rate/mo', 'Fee', 'Range'], sys.products.map(p => [esc(p.name), p.rate + '%', p.fee + '%', `${GFS.mk(p.min)}–${GFS.mk(p.max)}`]))}
            </details>
          </div>
          <div class="card"><div class="card-title-row"><h3>System connection</h3><span class="badge ${ist.connected ? 'badge-green' : 'badge-amber'}">${ist.connected ? 'Connected' : 'Not connected'}</span></div>
            <p class="small muted">Golden Loan Services is the separate administration repository. Its public GitHub Pages version currently uses sample/browser-local data; it is not a live shared database.</p>
            ${UI.table(['Connection', 'Detail'], [['Customer backend', API.mode === 'server' ? 'Connected to this website’s backend' : 'Device-local sandbox'], ['Admin connector', ist.connectorConfigured ? 'Configured — awaiting verified events' : 'Not configured'], ['Repository', `<a href="${esc(ist.repository || GFS.COMPANY.adminRepo)}" target="_blank" rel="noopener">golden-loan-services</a>`], ['Last successful sync', ist.lastSuccess ? GFS.fmtDateTime(ist.lastSuccess) : 'Never']])}
            <div class="alert alert-info small mt-2">${esc(ist.note || 'A link alone does not synchronise databases.')}</div>
            <div class="admin-settings-links"><a href="${esc(adminBase)}settings.html#s15" target="_blank" rel="noopener noreferrer" class="btn btn-ghost btn-sm">${UI.icon('settings')} Integration settings ${UI.icon('external')}</a><a href="${esc(adminBase)}website.html#s3" target="_blank" rel="noopener noreferrer" class="btn btn-ghost btn-sm">${UI.icon('bell')} Announcements & content ${UI.icon('external')}</a><a href="${esc(adminBase)}notifications.html" target="_blank" rel="noopener noreferrer" class="btn btn-ghost btn-sm">${UI.icon('mail')} Notification settings ${UI.icon('external')}</a></div>
            <p class="tiny muted mt-2">These links open the separate administration portal. Its public version is a prototype; publishing requires the deployed signed connector.</p>
          </div>
        </div>
      </div>`;
    },
    mount: async el => {
      UI.bindForm(el.querySelector('#prefs-form'), async data => { await API.put('/api/prefs', { sms: !!data.sms, email: !!data.email, reminders: !!data.reminders, marketing: !!data.marketing }); await App.refreshUser(); UI.toast('Preferences saved ✓'); });
      UI.bindForm(el.querySelector('#theme-form'), async data => { await API.put('/api/prefs', { theme: data.theme }); UI.toast('Display preference saved ✓'); });
      el.querySelector('#export-data').onclick = async () => {
        const d = await API.get('/api/export/my-data');
        const blob = new Blob([JSON.stringify(d, null, 2)], { type: 'application/json' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'gfs-my-data.json'; a.click(); UI.toast('Data exported ✓');
      };
    }
  });

  /* ---------------- ACTIVITY HISTORY ---------------- */
  App.route('/portal/activity', {
    title: 'Security history', layout: 'portal', auth: true, render: async () => {
      const d = await API.get('/api/security/activity');
      return head('Security & account history', 'Sign-ins, profile changes and recorded account actions') + `
        <div class="card">${d.activity.length ? UI.table(['When', 'Action', 'Detail'], d.activity.map(a => [GFS.fmtDateTime(a.created_at || a.createdAt), `<b>${esc(a.action)}</b>`, esc(a.detail || '—')])) : UI.empty('🕘', 'No activity recorded yet')}</div>`;
    }
  });
})();
