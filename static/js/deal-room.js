/* ==========================================================================
   VISION — Deal Room frontend
   Talks to /api/conversations/<id>/deal* and renders everything inside
   #dealRoomPanel on the Messages page. Depends on escapeHtml() from main.js.
   ========================================================================== */

(function () {
  // Feather/Lucide-style stroke icons, matching the site's own icon() macro
  // (base.html/_icons.html) — same viewBox, stroke, and currentColor
  // conventions, just usable from plain JS since this file builds HTML
  // strings rather than rendering Jinja.
  const ICON_PATHS = {
    sparkles: '<path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/><path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/>',
    'file-text': '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>',
    compass: '<circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/>',
    'edit-3': '<path d="M12 20h9"/><path d="M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838a.5.5 0 0 1-.62-.62l.838-2.872a2 2 0 0 1 .506-.854z"/>',
    history: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
    'check-circle': '<path d="M21.801 10A10 10 0 1 1 17 3.335"/><path d="m9 11 3 3L22 4"/>',
    'x-circle': '<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    lock: '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    'thumbs-up': '<path d="M7 10v12"/><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2h0a3.13 3.13 0 0 1 3 3.88Z"/>',
    'alert-triangle': '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
    flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/>',
    star: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
    'arrow-left': '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
    'dollar-sign': '<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    tag: '<path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42Z"/><circle cx="7.5" cy="7.5" r=".5" fill="currentColor"/>',
    target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
    wrench: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
    zap: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
    'building-2': '<path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/>',
    shield: '<path d="M20 13c0 5-3.5 7.5-7.35 8.95a1 1 0 0 1-1.3 0C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.5 3.8 17 5 19 5a1 1 0 0 1 1 1z"/>',
    'refresh-cw': '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
    'trending-up': '<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>',
    gift: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13"/><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5C11 3 12 8 12 8"/><path d="M16.5 8a2.5 2.5 0 0 0 0-5C13 3 12 8 12 8"/>',
    landmark: '<line x1="3" y1="22" x2="21" y2="22"/><line x1="6" y1="18" x2="6" y2="11"/><line x1="10" y1="18" x2="10" y2="11"/><line x1="14" y1="18" x2="14" y2="11"/><line x1="18" y1="18" x2="18" y2="11"/><polygon points="12 2 20 7 4 7"/>',
    send: '<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>',
  };

  function icon(name, cls) {
    const paths = ICON_PATHS[name] || ICON_PATHS['file-text'];
    return `<svg class="icon ${cls || 'icon-sm'}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
  }

  const DEAL_TYPE_META = {
    equity_investment: { icon: 'dollar-sign', desc: 'Straightforward cash-for-equity investment.' },
    safe: { icon: 'file-text', desc: 'Simple Agreement for Future Equity.' },
    convertible_note: { icon: 'refresh-cw', desc: 'Debt that converts to equity later.' },
    grant: { icon: 'gift', desc: 'Non-dilutive funding, no equity given up.' },
    revenue_share: { icon: 'trending-up', desc: 'Investor takes a cut of future revenue.' },
    loan: { icon: 'landmark', desc: 'Repayable loan with interest terms.' },
    partnership: { icon: 'users', desc: 'Joint work with shared responsibilities.' },
    sponsorship: { icon: 'tag', desc: 'Brand sponsorship in exchange for funding.' },
    pilot: { icon: 'target', desc: 'Time-boxed trial before a bigger commitment.' },
    licensing: { icon: 'file-text', desc: 'License your product/tech for a fee.' },
    service: { icon: 'wrench', desc: 'One party delivers a defined service.' },
    api_partnership: { icon: 'zap', desc: 'Technical integration between products.' },
    acquisition: { icon: 'building-2', desc: 'Company proposes to acquire the startup.' },
    nda: { icon: 'shield', desc: 'Mutual confidentiality before deeper talks.' },
  };

  const SEVERITY_LABEL = { green: 'Good For You', yellow: 'Warning', red: 'Warning' };

  const state = {
    conversationId: null,
    isGroup: false,
    deal: null,
    activeTab: 'messages',
    view: 'home',
    versions: null,
    activeVersionDetail: null,
    myRole: (document.getElementById('messagesShell') && document.getElementById('messagesShell').dataset.role) || null,
    myUserId: (document.getElementById('messagesShell') && Number(document.getElementById('messagesShell').dataset.userId)) || null,
  };

  function $(id) { return document.getElementById(id); }
  function esc(s) { return (window.escapeHtml ? window.escapeHtml(s) : String(s == null ? '' : s)); }

  function api(path, opts) {
    opts = opts || {};
    opts.headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
    return fetch(path, opts).then((r) => r.json().then((data) => ({ ok: r.ok, data })));
  }

  function money(amount, currency) {
    if (amount === null || amount === undefined || amount === '') return '—';
    const n = Number(amount);
    if (Number.isNaN(n)) return String(amount);
    return `${currency || 'USD'} ${n.toLocaleString()}`;
  }

  function toast(msg, isError) {
    const t = document.createElement('div');
    t.className = 'flash ' + (isError ? 'error' : 'success');
    t.style.position = 'fixed';
    t.style.bottom = '24px';
    t.style.right = '24px';
    t.style.zIndex = '999';
    t.innerHTML = `<span>${esc(msg)}</span>`;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3800);
  }

  // ---------------------------------------------------------------------
  // Tabs
  // ---------------------------------------------------------------------

  function initTabs() {
    const tabs = $('convoTabs');
    if (!tabs) return;
    tabs.addEventListener('click', (e) => {
      const btn = e.target.closest('.convo-tab');
      if (!btn) return;
      switchTab(btn.dataset.tab);
    });
  }

  function switchTab(tab) {
    state.activeTab = tab;
    document.querySelectorAll('.convo-tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    const bubbles = $('messageBubbles');
    const form = $('messageForm');
    const panel = $('dealRoomPanel');
    if (!panel) return;
    if (tab === 'dealroom') {
      if (bubbles) bubbles.style.display = 'none';
      if (form) form.style.display = 'none';
      panel.style.display = 'block';
      renderCurrentView();
    } else {
      if (bubbles) bubbles.style.display = '';
      if (form) form.style.display = '';
      panel.style.display = 'none';
    }
  }

  function onConversationOpened(conversationId, data) {
    data = data || {};
    state.conversationId = conversationId;
    state.isGroup = !!data.is_group;
    state.otherUser = data.other_user || null;
    state.groupTitle = data.title || null;
    state.deal = null;
    state.view = 'home';
    const dealTabBtn = $('dealRoomTabBtn');
    if (dealTabBtn) dealTabBtn.style.display = state.isGroup ? 'none' : '';
    switchTab('messages');
    if (!state.isGroup) fetchDeal();
  }

  function fetchDeal() {
    if (!state.conversationId) return;
    api(`/api/conversations/${state.conversationId}/deal`).then(({ data }) => {
      state.deal = data.deal;
      const dealTabBtn = $('dealRoomTabBtn');
      if (dealTabBtn) dealTabBtn.classList.toggle('has-deal', !!(state.deal && state.deal.status !== 'Signed' && state.deal.status !== 'Completed'));
      if (state.activeTab === 'dealroom') renderCurrentView();
    });
  }

  function renderCurrentView() {
    if (!state.deal) {
      renderHome();
      return;
    }
    switch (state.view) {
      case 'contract': renderContract(); break;
      case 'risk': renderRisk(); break;
      case 'history': renderHistory(); break;
      default: renderHome();
    }
  }

  // ---------------------------------------------------------------------
  // Home
  // ---------------------------------------------------------------------

  function renderHome() {
    const panel = $('dealRoomPanel');
    if (!panel) return;

    if (!state.deal) {
      const showRequestInvestment = state.myRole === 'builder' && state.otherUser && state.otherUser.role === 'investor';
      panel.innerHTML = `
        <div class="dr-empty">
          <div class="icon-badge" style="margin:0 auto;">${icon('sparkles', 'icon-lg')}</div>
          <h4>No deal yet in this conversation</h4>
          <p>Turn this conversation into a structured, AI-drafted agreement — equity, partnership, sponsorship, and more.</p>
          <div style="display:flex; gap:10px; justify-content:center; flex-wrap:wrap;">
            <button class="btn btn-primary" id="drCreateBtn">Create AI Contract</button>
            ${showRequestInvestment ? '<button class="btn btn-outline" id="drRequestInvestmentBtn">Request Investment</button>' : ''}
          </div>
        </div>`;
      $('drCreateBtn').addEventListener('click', openWizard);
      const reqBtn = $('drRequestInvestmentBtn');
      if (reqBtn) reqBtn.addEventListener('click', openRequestInvestmentModal);
      return;
    }

    const d = state.deal;
    const v = d.current_version;
    panel.innerHTML = `
      <div class="dr-status-card">
        <div>
          <div style="font-family:'Inter',sans-serif; font-size:12px; color:var(--muted); margin-bottom:6px;">${esc(d.deal_type_label)}</div>
          <div style="font-family:'Inter',sans-serif; font-weight:700; font-size:17px; color:var(--white);">${esc(d.title)}</div>
        </div>
        <span class="dr-status-pill dr-status-${d.status}">${esc(d.status)}</span>
      </div>

      ${(d.can_start_new || ['Cancelled','Completed'].includes(d.status)) ? `
        <div class="dr-section" style="border-color: rgba(16,185,129,0.35); display:flex; align-items:center; justify-content:space-between; gap:14px; flex-wrap:wrap;">
          <div>
            <h4 style="margin-bottom:4px;">${d.status === 'Cancelled' ? 'This deal was cancelled' : 'This deal is complete'}</h4>
            <p style="font-size:13px; margin:0;">It stays here in your history — start a brand new contract in this conversation whenever you're ready.</p>
          </div>
          <button class="btn btn-primary btn-sm" id="drRedraftBtn">${icon('sparkles')} Start New Deal</button>
        </div>` : ''}

      ${(v && ['Pending','Negotiating'].includes(d.status) && v.created_by && v.created_by.id !== state.myUserId && v.decision !== 'accepted') ? `
        <div class="dr-section" style="border-color: rgba(59,130,246,0.35); display:flex; align-items:center; justify-content:space-between; gap:14px; flex-wrap:wrap;">
          <div>
            <h4 style="color:var(--investor); margin-bottom:4px;">Awaiting your review</h4>
            <p style="font-size:13px; margin:0;">${esc(v.created_by.name)} sent you Version ${v.version_number} — review it and accept, or send back a counter-offer.</p>
          </div>
          <button class="btn btn-primary btn-sm" id="drReviewBtn">${icon('check-circle')} Review &amp; Decide</button>
        </div>` : ''}

      <div class="dr-summary-grid">
        <div class="dr-summary-item"><div class="label">Startup</div><div class="value">${esc(d.startup_name || '—')}</div></div>
        <div class="dr-summary-item"><div class="label">${d.is_group ? 'Team' : 'Other Party'}</div><div class="value">${esc(d.other_party_name || '—')}</div></div>
        <div class="dr-summary-item"><div class="label">Investment</div><div class="value">${money(d.investment_amount, d.currency)}</div></div>
        <div class="dr-summary-item"><div class="label">Equity</div><div class="value">${d.equity_percentage != null ? d.equity_percentage + '%' : '—'}</div></div>
        <div class="dr-summary-item"><div class="label">Version</div><div class="value">V${d.current_version_number}</div></div>
        <div class="dr-summary-item"><div class="label">Fairness</div><div class="value">${d.fairness ? d.fairness.overall + '/100' : '—'}</div></div>
      </div>

      <div class="dr-actions">
        <button class="btn btn-primary btn-sm" id="drViewContractBtn">${icon('file-text')} View Contract</button>
        <button class="btn btn-outline btn-sm" id="drAnalyzeBtn">${icon('compass')} Analyze Deal</button>
        <button class="btn btn-outline btn-sm" id="drNegotiateBtn" ${['Signed','Completed','Cancelled'].includes(d.status) ? 'disabled' : ''}>${icon('edit-3')} Negotiate</button>
        <button class="btn btn-outline btn-sm" id="drHistoryBtn">${icon('history')} Version History</button>
        <button class="btn btn-outline btn-sm" id="drPdfBtn">${icon('download')} Generate PDF</button>
        ${d.status === 'Signed' ? `<button class="btn btn-outline btn-sm" id="drCompleteBtn">${icon('check-circle')} Mark Completed</button>` : ''}
        ${!['Signed','Completed','Cancelled'].includes(d.status) ? '<button class="btn btn-ghost btn-sm" id="drCancelBtn" style="color:var(--danger);">Cancel Deal</button>' : ''}
      </div>

      ${d.status === 'Accepted' || d.status === 'Signed' ? renderSignBlock(d) : ''}

      ${v && v.change_summary && v.change_summary.length ? `
        <div class="dr-section" style="border-color: rgba(6,182,212,0.3);">
          <h4 style="color:var(--cyan);">${icon('sparkles')} Smart Change Summary — V${v.version_number}</h4>
          ${v.change_summary.map((c) => `<p>• ${esc(c)}</p>`).join('')}
        </div>` : ''}

      ${renderActivity(d.activities)}
    `;

    $('drViewContractBtn').addEventListener('click', () => { state.view = 'contract'; renderCurrentView(); });
    $('drAnalyzeBtn').addEventListener('click', runAnalysis);
    $('drNegotiateBtn').addEventListener('click', openNegotiateModal);
    $('drHistoryBtn').addEventListener('click', () => { state.view = 'history'; renderCurrentView(); });
    $('drPdfBtn').addEventListener('click', () => window.open(`/deal-room/${state.conversationId}/print`, '_blank'));
    const completeBtn = $('drCompleteBtn');
    if (completeBtn) completeBtn.addEventListener('click', () => setStatus('Completed'));
    const cancelBtn = $('drCancelBtn');
    if (cancelBtn) cancelBtn.addEventListener('click', () => { if (confirm('Cancel this deal?')) setStatus('Cancelled'); });
    const redraftBtn = $('drRedraftBtn');
    if (redraftBtn) redraftBtn.addEventListener('click', openWizard);
    const reviewBtn = $('drReviewBtn');
    if (reviewBtn) reviewBtn.addEventListener('click', () => openVersionDetail(d.current_version_number));

    const signBtn = $('drSignBtn');
    if (signBtn) signBtn.addEventListener('click', signDeal);
  }

  function renderSignBlock(d) {
    const sigs = d.signatures || [];
    const signedIds = new Set(sigs.map((s) => s.user_id));
    const members = d.members && d.members.length ? d.members : [{ id: state.myUserId, name: 'You' }];
    const partyLabel = d.is_group ? 'the team' : 'both parties';
    return `
      <div class="dr-section">
        <h4>${icon('edit-3')} Digital Signing</h4>
        <div class="dr-sign-grid">
          ${members.map((m) => {
            const isMe = m.id === state.myUserId;
            const sig = sigs.find((s) => s.user_id === m.id);
            return `
              <div class="dr-sign-card ${sig ? 'signed' : ''}">
                <div class="name">${esc(isMe ? 'You' : m.name)}</div>
                <div class="status">${sig ? 'Signed ' + new Date(sig.signed_at).toLocaleDateString() : 'Awaiting signature'}</div>
              </div>`;
          }).join('')}
        </div>
        ${!d.i_have_signed ? '<button class="btn btn-primary btn-sm" id="drSignBtn">Sign This Contract</button>' : ''}
        ${d.status === 'Signed' ? `<p style="color:var(--primary); font-size:13px;">${icon('lock')} Contract locked — ${partyLabel} have signed.</p>` : ''}
      </div>`;
  }

  function renderActivity(activities) {
    if (!activities || !activities.length) return '';
    return `
      <div class="dr-activity-list">
        ${activities.slice().reverse().map((a) => `
          <div class="dr-activity-row">
            <span>${esc(a.actor)} — ${esc((a.detail || a.action).replace(/_/g, ' '))}</span>
            <span>${new Date(a.created_at).toLocaleDateString()}</span>
          </div>`).join('')}
      </div>`;
  }

  function setStatus(status) {
    api(`/api/conversations/${state.conversationId}/deal/status`, { method: 'POST', body: JSON.stringify({ status }) })
      .then(({ ok, data }) => {
        if (!ok) return toast(data.error || 'Could not update status.', true);
        state.deal = Object.assign(state.deal, data.deal);
        toast(`Deal marked ${status}.`);
        renderHome();
      });
  }

  function signDeal() {
    api(`/api/conversations/${state.conversationId}/deal/sign`, { method: 'POST' }).then(({ ok, data }) => {
      if (!ok) return toast(data.error || 'Could not sign.', true);
      fetchDeal();
      toast('Signed!');
      setTimeout(renderHome, 150);
    });
  }

  function runAnalysis() {
    const btn = $('drAnalyzeBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Analyzing…'; }
    api(`/api/conversations/${state.conversationId}/deal/analyze`, { method: 'POST' }).then(({ ok, data }) => {
      if (!ok) { toast(data.error || 'Analysis failed.', true); if (btn) { btn.disabled = false; btn.innerHTML = icon('compass') + ' Analyze Deal'; } return; }
      state.deal.risk_analysis = data.risk_analysis;
      state.deal.fairness_breakdown = data.fairness.breakdown;
      state.deal.fairness = { overall: data.fairness.overall, builder: data.fairness.builder, other_party: data.fairness.other_party, explanation: data.fairness.explanation };
      state.view = 'risk';
      renderCurrentView();
    });
  }

  // ---------------------------------------------------------------------
  // Contract view
  // ---------------------------------------------------------------------

  function backBtn() {
    return `<button class="btn btn-ghost btn-sm" id="drBackBtn" style="margin-bottom:14px;">&larr; Back to Deal Room</button>`;
  }

  function bindBack() {
    const b = $('drBackBtn');
    if (b) b.addEventListener('click', () => { state.view = 'home'; renderCurrentView(); });
  }

  function renderContract() {
    const panel = $('dealRoomPanel');
    const v = state.deal.current_version;
    if (!v) { state.view = 'home'; return renderHome(); }

    panel.innerHTML = `
      ${backBtn()}
      <div class="dr-contract-title">${esc(v.contract_title)}</div>
      <div class="dr-contract-meta">${esc(state.deal.deal_type_label)} &middot; Version ${v.version_number}</div>

      ${(v.sections || []).map((s) => `
        <div class="dr-section">
          <h4>${esc(s.heading)}</h4>
          <p>${esc(s.body)}</p>
        </div>`).join('')}

      <div class="dr-clause-toggle">
        <h3 style="font-size:16px;">${icon('compass')} AI Contract Explainer</h3>
        <p style="font-size:13px;">Legal clause on the left, plain English on the right. Tap an action to have VISION AI rework a clause.</p>
      </div>
      ${(v.clauses || []).map((c, i) => renderClauseRow(c, i)).join('')}
    `;
    bindBack();
    bindClauseActions();
  }

  function renderClauseRow(c, i) {
    return `
      <div class="dr-clause-row" data-clause-index="${i}">
        <div class="dr-clause-legal">
          <div class="dr-clause-label">Legal Clause</div>
          <div class="dr-clause-title">${esc(c.clause_title)}</div>
          <div class="dr-clause-text">${esc(c.clause_text)}</div>
        </div>
        <div class="dr-clause-plain">
          <div class="dr-clause-label">Explain Like I'm a Founder</div>
          <div class="dr-clause-text">${esc(c.plain_english)}</div>
          <div class="dr-clause-actions">
            <button class="dr-clause-action-btn" data-action="simplify">Simplify</button>
            <button class="dr-clause-action-btn" data-action="rewrite_professional">Rewrite Professionally</button>
            <button class="dr-clause-action-btn" data-action="founder_friendly">Founder-Friendly</button>
            <button class="dr-clause-action-btn" data-action="investor_friendly">Investor-Friendly</button>
            <button class="dr-clause-action-btn" data-action="counter_offer">Counter-Offer</button>
            <button class="dr-clause-action-btn" data-action="is_fair">Is This Fair?</button>
          </div>
        </div>
        <div class="dr-clause-reply" id="drClauseReply${i}"></div>
      </div>`;
  }

  function bindClauseActions() {
    document.querySelectorAll('.dr-clause-row').forEach((row) => {
      const idx = row.dataset.clauseIndex;
      const clause = state.deal.current_version.clauses[idx];
      row.querySelectorAll('.dr-clause-action-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          const replyBox = $(`drClauseReply${idx}`);
          replyBox.classList.add('show');
          replyBox.textContent = 'VISION AI is thinking…';
          api(`/api/conversations/${state.conversationId}/deal/clause-action`, {
            method: 'POST',
            body: JSON.stringify({ action: btn.dataset.action, clause_text: clause.clause_text }),
          }).then(({ ok, data }) => {
            replyBox.textContent = ok ? data.reply : (data.error || 'Something went wrong.');
          });
        });
      });
    });
  }

  // ---------------------------------------------------------------------
  // Risk analysis + fairness score
  // ---------------------------------------------------------------------

  function gaugeSvg(score, color, size) {
    size = size || 96;
    const r = (size - 12) / 2;
    const c = size / 2;
    const circumference = 2 * Math.PI * r;
    const pct = Math.max(0, Math.min(100, score || 0)) / 100;
    return `
      <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
        <circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="var(--border)" stroke-width="8"/>
        <circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${color}" stroke-width="8"
          stroke-linecap="round" stroke-dasharray="${circumference}"
          stroke-dashoffset="${circumference * (1 - pct)}"
          transform="rotate(-90 ${c} ${c})"/>
        <text x="${c}" y="${c + 6}" text-anchor="middle" font-family="Inter, sans-serif" font-weight="800" font-size="20" fill="var(--white)">${score != null ? score : '—'}</text>
      </svg>`;
  }

  function renderRisk() {
    const panel = $('dealRoomPanel');
    const ra = state.deal.risk_analysis;
    const fairness = state.deal.fairness;
    const breakdown = state.deal.fairness_breakdown || {};

    if (!ra) {
      panel.innerHTML = `${backBtn()}<div class="dr-empty"><h4>No analysis yet</h4><p>Run the AI Risk Analyzer to see fairness, warnings, and missing clauses.</p><button class="btn btn-primary" id="drRunAnalysis">Analyze Deal</button></div>`;
      bindBack();
      $('drRunAnalysis').addEventListener('click', runAnalysis);
      return;
    }

    panel.innerHTML = `
      ${backBtn()}
      <div class="dr-fairness-wrap">
        <h3 style="font-size:16px; text-align:center; margin-bottom:16px;">${icon('star')} AI Fairness Score</h3>
        <div class="dr-fairness-gauges">
          <div class="dr-gauge">${gaugeSvg(fairness.builder, 'var(--primary)')}<div class="dr-gauge-label">Builder Fairness</div></div>
          <div class="dr-gauge">${gaugeSvg(fairness.overall, 'var(--cyan)', 116)}<div class="dr-gauge-label">Overall Deal Score</div></div>
          <div class="dr-gauge">${gaugeSvg(fairness.other_party, 'var(--investor)')}<div class="dr-gauge-label">${esc(state.deal.other_party_name || 'Other Party')} Fairness</div></div>
        </div>
        <p class="dr-fairness-explanation">${esc(fairness.explanation || '')}</p>
        <div class="dr-breakdown">
          ${Object.keys(breakdown).map((k) => `
            <div class="dr-breakdown-item">
              <div class="label"><span>${esc(k.replace(/_/g, ' '))}</span><span>${breakdown[k]}</span></div>
              <div class="dr-breakdown-bar"><div class="dr-breakdown-fill" style="width:${breakdown[k]}%"></div></div>
            </div>`).join('')}
        </div>
      </div>

      <div class="dr-risk-grid">
        <div class="dr-risk-card good">
          <h4>${icon('thumbs-up')} Good For You</h4>
          ${(ra.good_for_you || []).map(riskItem).join('') || '<p style="font-size:12px;color:var(--muted);">Nothing flagged.</p>'}
        </div>
        <div class="dr-risk-card warn">
          <h4>${icon('alert-triangle')} Warnings</h4>
          ${(ra.warnings || []).map(riskItem).join('') || '<p style="font-size:12px;color:var(--muted);">No warnings.</p>'}
        </div>
        <div class="dr-risk-card missing">
          <h4>${icon('flag')} Missing Clauses</h4>
          ${(ra.missing_clauses || []).map(riskItem).join('') || '<p style="font-size:12px;color:var(--muted);">Nothing obviously missing.</p>'}
        </div>
      </div>
      <button class="btn btn-outline btn-sm" id="drReanalyze">${icon('refresh-cw')} Re-analyze</button>
    `;
    bindBack();
    $('drReanalyze').addEventListener('click', runAnalysis);
  }

  function riskItem(item) {
    const sev = ['green', 'yellow', 'red'].includes(item.severity) ? item.severity : 'yellow';
    return `<div class="dr-risk-item"><span class="dr-severity-dot dr-severity-${sev}"></span><span>${esc(item.text)}</span></div>`;
  }

  // ---------------------------------------------------------------------
  // Version history
  // ---------------------------------------------------------------------

  function renderHistory() {
    const panel = $('dealRoomPanel');
    panel.innerHTML = `${backBtn()}<div class="dr-loading"><div class="loader-orb"></div></div>`;
    bindBack();
    api(`/api/conversations/${state.conversationId}/deal/versions`).then(({ data }) => {
      state.versions = data.versions;
      panel.innerHTML = `
        ${backBtn()}
        <h3 style="font-size:16px; margin-bottom:16px;">${icon('history')} Version History</h3>
        <div class="dr-version-timeline">
          ${data.versions.slice().reverse().map((v) => `
            <div class="dr-version-item" data-version="${v.version_number}">
              <div class="dr-version-card">
                <span class="dr-version-tag">V${v.version_number}</span>
                ${v.decision ? `<span class="dr-decision-badge dr-decision-${v.decision}">${v.decision}</span>` : ''}
                <div class="dr-version-summary">${v.change_summary && v.change_summary.length ? esc(v.change_summary[0]) : 'Original offer'}</div>
                <div class="dr-version-meta">by ${esc(v.created_by ? v.created_by.name : 'VISION AI')} &middot; ${new Date(v.created_at).toLocaleString()}</div>
              </div>
            </div>`).join('')}
        </div>
      `;
      bindBack();
      panel.querySelectorAll('.dr-version-item').forEach((item) => {
        item.addEventListener('click', () => openVersionDetail(item.dataset.version));
      });
    });
  }

  function openVersionDetail(versionNumber) {
    api(`/api/conversations/${state.conversationId}/deal/versions/${versionNumber}`).then(({ data }) => {
      const v = data.version;
      const isLatest = state.deal.current_version_number === v.version_number;
      const canDecide = isLatest
        && ['Pending', 'Negotiating'].includes(state.deal.status)
        && v.created_by && v.created_by.id !== state.myUserId
        && v.decision !== 'accepted';
      const modal = document.createElement('div');
      modal.className = 'dr-modal-overlay open';
      modal.innerHTML = `
        <div class="dr-modal">
          <div class="dr-modal-head">
            <h3>${esc(v.contract_title)} — V${v.version_number}</h3>
            <button class="dr-modal-close">&times;</button>
          </div>
          ${v.change_summary && v.change_summary.length ? `<div class="dr-section" style="border-color:rgba(6,182,212,0.3);"><h4 style="color:var(--cyan);">Changes in this version</h4>${v.change_summary.map((c) => `<p>• ${esc(c)}</p>`).join('')}</div>` : ''}
          ${(v.sections || []).map((s) => `<div class="dr-section"><h4>${esc(s.heading)}</h4><p>${esc(s.body)}</p></div>`).join('')}
          ${canDecide ? `
            <div class="dr-modal-nav">
              <button class="btn btn-outline" id="drRejectVersion">Reject / Counter</button>
              <button class="btn btn-primary" id="drAcceptVersion">Accept This Version</button>
            </div>` : ''}
        </div>`;
      document.body.appendChild(modal);
      modal.querySelector('.dr-modal-close').addEventListener('click', () => modal.remove());
      modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

      const accept = modal.querySelector('#drAcceptVersion');
      const reject = modal.querySelector('#drRejectVersion');
      if (accept) accept.addEventListener('click', () => decideVersion(v.version_number, 'accept', modal));
      if (reject) reject.addEventListener('click', () => decideVersion(v.version_number, 'reject', modal));
    });
  }

  function decideVersion(versionNumber, decision, modal) {
    api(`/api/conversations/${state.conversationId}/deal/versions/${versionNumber}/decision`, {
      method: 'POST', body: JSON.stringify({ decision }),
    }).then(({ ok, data }) => {
      if (!ok) return toast(data.error || 'Could not update.', true);
      modal.remove();
      toast(decision === 'accept' ? 'Version accepted!' : 'Marked for renegotiation.');
      fetchDeal();
      setTimeout(() => { state.view = 'home'; renderCurrentView(); }, 150);
    });
  }

  // ---------------------------------------------------------------------
  // Create AI Contract wizard
  // ---------------------------------------------------------------------

  let wizard = { step: 1, dealType: null, groups: null };

  function ensureWizardOverlay() {
    let overlay = $('drWizardOverlay');
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.id = 'drWizardOverlay';
    overlay.className = 'dr-modal-overlay';
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeWizard(); });
    return overlay;
  }

  function closeWizard() {
    const overlay = $('drWizardOverlay');
    if (overlay) overlay.classList.remove('open');
  }

  function openWizard() {
    wizard = { step: 1, dealType: null, groups: null };
    const overlay = ensureWizardOverlay();
    overlay.classList.add('open');
    overlay.innerHTML = `<div class="dr-modal"><div class="dr-loading"><div class="loader-orb"></div></div></div>`;
    api('/api/deal-types').then(({ data }) => {
      wizard.groups = data;
      renderWizardStep1();
    });
  }

  function wizardShell(innerHtml) {
    const overlay = $('drWizardOverlay');
    overlay.innerHTML = `
      <div class="dr-modal">
        <div class="dr-modal-head">
          <h3>Create AI Contract</h3>
          <button class="dr-modal-close" id="drWizardClose">&times;</button>
        </div>
        <div class="dr-steps">
          <div class="dr-step-dot ${wizard.step >= 1 ? 'done' : ''} ${wizard.step === 1 ? 'active' : ''}"></div>
          <div class="dr-step-dot ${wizard.step >= 2 ? 'done' : ''} ${wizard.step === 2 ? 'active' : ''}"></div>
          <div class="dr-step-dot ${wizard.step >= 3 ? 'active' : ''}"></div>
        </div>
        ${innerHtml}
      </div>`;
    $('drWizardClose').addEventListener('click', closeWizard);
  }

  function renderWizardStep1() {
    const g = wizard.groups || { investor: [], company: [] };
    function typeCard(t) {
      const meta = DEAL_TYPE_META[t.id] || { icon: 'file-text', desc: '' };
      return `
        <button type="button" class="dr-type-card ${wizard.dealType === t.id ? 'selected' : ''}" data-type="${t.id}">
          <div class="dr-type-icon">${icon(meta.icon, 'icon-lg')}</div>
          <div class="dr-type-name">${esc(t.label)}</div>
          <div class="dr-type-desc">${esc(meta.desc)}</div>
        </button>`;
    }
    wizardShell(`
      <div class="dr-type-group-label">Investor Deals</div>
      <div class="dr-type-grid">${g.investor.map(typeCard).join('')}</div>
      <div class="dr-type-group-label">Company Deals</div>
      <div class="dr-type-grid">${g.company.map(typeCard).join('')}</div>
      <div class="dr-modal-nav">
        <span></span>
        <button class="btn btn-primary" id="drStep1Next" ${wizard.dealType ? '' : 'disabled'}>Next: Deal Info</button>
      </div>
    `);
    document.querySelectorAll('.dr-type-card').forEach((card) => {
      card.addEventListener('click', () => {
        wizard.dealType = card.dataset.type;
        renderWizardStep1();
      });
    });
    const next = $('drStep1Next');
    if (next) next.addEventListener('click', () => { wizard.step = 2; renderWizardStep2(); });
  }

  function field(id, label, opts) {
    opts = opts || {};
    const tag = opts.textarea ? 'textarea' : 'input';
    const type = opts.type || 'text';
    return `
      <div class="dr-field">
        <label for="${id}">${esc(label)}</label>
        ${tag === 'textarea'
          ? `<textarea id="${id}" placeholder="${esc(opts.placeholder || '')}">${esc(opts.value || '')}</textarea>`
          : `<input id="${id}" type="${type}" value="${esc(opts.value || '')}" placeholder="${esc(opts.placeholder || '')}">`}
      </div>`;
  }

  function renderWizardStep2() {
    const typeLabel = ([...(wizard.groups.investor || []), ...(wizard.groups.company || [])].find((t) => t.id === wizard.dealType) || {}).label || '';
    const other = (state.deal || {}).other_party_name;
    wizardShell(`
      <p style="font-size:13px; margin-bottom:14px;">${esc(typeLabel)} — fill in what you know. Leave anything blank and VISION AI will mark it "to be agreed" for now.</p>

      <div class="dr-form-section-title">Basic Information</div>
      <div class="dr-form-grid">
        ${field('drStartupName', 'Startup Name')}
        ${field('drDealTitle', 'Deal Title', { placeholder: `e.g. ${typeLabel}` })}
        ${field('drBuilderName', 'Builder Name')}
        ${field('drOtherPartyName', state.isGroup ? 'Other Party / Team' : 'Investor / Company Name', { value: other || '', placeholder: state.isGroup ? 'Leave blank to use everyone in this chat' : '' })}
      </div>

      <div class="dr-form-section-title">Financial Terms</div>
      <div class="dr-form-grid">
        ${field('drAmount', 'Investment / Deal Amount', { type: 'number' })}
        ${field('drCurrency', 'Currency', { value: 'USD' })}
        ${field('drEquity', 'Equity Percentage', { type: 'number' })}
        ${field('drValuation', 'Valuation', { type: 'number' })}
      </div>
      <div class="dr-form-grid">
        ${field('drPaymentSchedule', 'Payment Schedule', { placeholder: 'e.g. Lump sum on signing' })}
        ${field('drMilestonePayments', 'Milestone Payments', { placeholder: 'e.g. 50% on MVP, 50% on launch' })}
      </div>

      <div class="dr-form-section-title">Conditions</div>
      <div class="dr-checkbox-row"><input type="checkbox" id="drCondFounderCeo" checked> <label for="drCondFounderCeo">Founder remains CEO</label></div>
      <div class="dr-checkbox-row"><input type="checkbox" id="drCondBoardSeat"> <label for="drCondBoardSeat">Board seat for other party</label></div>
      <div class="dr-checkbox-row"><input type="checkbox" id="drCondExclusivity"> <label for="drCondExclusivity">Exclusivity</label></div>
      <div class="dr-form-grid">
        ${field('drReportingFrequency', 'Reporting Frequency', { placeholder: 'e.g. Quarterly' })}
        ${field('drVesting', 'Vesting Terms', { placeholder: 'e.g. 4 years, 1 year cliff' })}
      </div>
      ${field('drCustomClauses', 'Custom Clauses / Notes', { textarea: true })}

      <div class="dr-form-section-title">Timeline</div>
      <div class="dr-form-grid">
        ${field('drStartDate', 'Start Date', { type: 'date' })}
        ${field('drEndDate', 'End Date', { type: 'date' })}
      </div>
      ${field('drMilestones', 'Milestones', { textarea: true, placeholder: 'One per line' })}
      ${field('drDeliverables', 'Deliverables', { textarea: true, placeholder: 'One per line' })}

      <div class="dr-modal-nav">
        <button class="btn btn-outline" id="drStep2Back">Back</button>
        <button class="btn btn-primary" id="drStep2Next">Generate Contract with AI ${icon('sparkles')}</button>
      </div>
    `);
    $('drStep2Back').addEventListener('click', () => { wizard.step = 1; renderWizardStep1(); });
    $('drStep2Next').addEventListener('click', submitWizard);
  }

  function submitWizard() {
    const terms = {
      deal_type: wizard.dealType,
      startup_name: $('drStartupName').value,
      deal_title: $('drDealTitle').value,
      builder_name: $('drBuilderName').value,
      other_party_name: $('drOtherPartyName').value,
      investment_amount: $('drAmount').value || null,
      currency: $('drCurrency').value || 'USD',
      equity_percentage: $('drEquity').value || null,
      valuation: $('drValuation').value || null,
      payment_schedule: $('drPaymentSchedule').value,
      milestone_payments: $('drMilestonePayments').value,
      conditions: {
        founder_remains_ceo: $('drCondFounderCeo').checked,
        board_seat: $('drCondBoardSeat').checked,
        exclusivity: $('drCondExclusivity').checked,
        reporting_frequency: $('drReportingFrequency').value,
        vesting: $('drVesting').value,
      },
      custom_clauses: $('drCustomClauses').value,
      start_date: $('drStartDate').value,
      end_date: $('drEndDate').value,
      milestones: $('drMilestones').value,
      deliverables: $('drDeliverables').value,
    };

    wizard.step = 3;
    wizardShell(`
      <div class="dr-loading">
        <div class="loader-orb"></div>
        <p style="margin-top:14px;">VISION AI is drafting your agreement…</p>
      </div>`);

    api(`/api/conversations/${state.conversationId}/deal/create`, { method: 'POST', body: JSON.stringify(terms) })
      .then(({ ok, data }) => {
        if (!ok) {
          wizardShell(`<div class="dr-empty"><h4>Couldn't generate the contract</h4><p>${esc(data.error || 'Please try again.')}</p><button class="btn btn-primary" id="drWizardRetry">Back</button></div>`);
          $('drWizardRetry').addEventListener('click', () => { wizard.step = 2; renderWizardStep2(); });
          return;
        }
        closeWizard();
        state.deal = Object.assign(data.deal, { current_version: data.version, signatures: [], i_have_signed: false });
        state.view = 'contract';
        switchTab('dealroom');
        toast('Contract drafted! Review it with your counterpart.');
        const dealTabBtn = $('dealRoomTabBtn');
        if (dealTabBtn) dealTabBtn.classList.add('has-deal');
      });
  }

  // ---------------------------------------------------------------------
  // Negotiate modal
  // ---------------------------------------------------------------------

  function openNegotiateModal() {
    const v = state.deal.current_version;
    const t = v.terms || {};
    const overlay = ensureWizardOverlay();
    overlay.classList.add('open');
    overlay.innerHTML = `
      <div class="dr-modal">
        <div class="dr-modal-head"><h3>Negotiate — propose Version ${state.deal.current_version_number + 1}</h3><button class="dr-modal-close" id="drNegClose">&times;</button></div>
        <p style="font-size:13px; margin-bottom:14px;">Change only what you want to renegotiate — VISION AI will regenerate the contract and summarize what changed.</p>
        <div class="dr-form-grid">
          ${field('drNegAmount', 'Investment / Deal Amount', { type: 'number', value: t.investment_amount })}
          ${field('drNegEquity', 'Equity Percentage', { type: 'number', value: t.equity_percentage })}
          ${field('drNegValuation', 'Valuation', { type: 'number', value: t.valuation })}
          ${field('drNegPaymentSchedule', 'Payment Schedule', { value: t.payment_schedule })}
        </div>
        ${field('drNegMilestonePayments', 'Milestone Payments', { value: t.milestone_payments })}
        <div class="dr-checkbox-row"><input type="checkbox" id="drNegBoardSeat" ${t.conditions && t.conditions.board_seat ? 'checked' : ''}> <label for="drNegBoardSeat">Board seat for other party</label></div>
        <div class="dr-checkbox-row"><input type="checkbox" id="drNegExclusivity" ${t.conditions && t.conditions.exclusivity ? 'checked' : ''}> <label for="drNegExclusivity">Exclusivity</label></div>
        ${field('drNegNote', 'What changed / why (optional note to VISION AI)', { textarea: true })}
        <div class="dr-modal-nav">
          <span></span>
          <button class="btn btn-primary" id="drNegSubmit">Generate New Version ${icon('sparkles')}</button>
        </div>
      </div>`;
    $('drNegClose').addEventListener('click', () => overlay.classList.remove('open'));
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.classList.remove('open'); }, { once: true });
    $('drNegSubmit').addEventListener('click', () => submitNegotiation(overlay));
  }

  function submitNegotiation(overlay) {
    const updates = {
      investment_amount: $('drNegAmount').value || null,
      equity_percentage: $('drNegEquity').value || null,
      valuation: $('drNegValuation').value || null,
      payment_schedule: $('drNegPaymentSchedule').value,
      milestone_payments: $('drNegMilestonePayments').value,
      conditions: {
        board_seat: $('drNegBoardSeat').checked,
        exclusivity: $('drNegExclusivity').checked,
      },
    };
    const note = $('drNegNote').value;
    if (note) updates.negotiation_note = note;

    overlay.querySelector('.dr-modal').innerHTML = `<div class="dr-loading"><div class="loader-orb"></div><p style="margin-top:14px;">VISION AI is preparing the new version…</p></div>`;

    api(`/api/conversations/${state.conversationId}/deal/negotiate`, { method: 'POST', body: JSON.stringify({ terms: updates }) })
      .then(({ ok, data }) => {
        overlay.classList.remove('open');
        if (!ok) return toast(data.error || 'Could not negotiate.', true);
        state.deal = Object.assign(state.deal, data.deal, { current_version: data.version });
        toast(`Version ${data.version.version_number} sent!`);
        state.view = 'home';
        renderCurrentView();
      });
  }

  // ---------------------------------------------------------------------
  // Request Investment (Builder Starts a Deal)
  // ---------------------------------------------------------------------

  function openRequestInvestmentModal() {
    const overlay = ensureWizardOverlay();
    overlay.classList.add('open');
    overlay.innerHTML = `
      <div class="dr-modal">
        <div class="dr-modal-head"><h3>Request Investment</h3><button class="dr-modal-close" id="drReqClose">&times;</button></div>
        <p style="font-size:13px; margin-bottom:14px;">VISION AI will turn this into a structured proposal and send it to ${esc(state.otherUser ? state.otherUser.name : 'this investor')}.</p>
        <div class="dr-form-grid">
          ${field('drReqAmount', 'Amount Needed', { placeholder: 'e.g. $150,000' })}
          ${field('drReqStage', 'Startup Stage', { placeholder: 'e.g. Pre-seed, MVP live' })}
        </div>
        ${field('drReqUseOfFunds', 'Use of Funds', { textarea: true })}
        <div class="dr-form-grid">
          ${field('drReqEquity', 'Equity Offered', { placeholder: 'e.g. 8%' })}
          ${field('drReqMilestones', 'Milestones', { placeholder: 'e.g. Launch, 1k users' })}
        </div>
        ${field('drReqPitch', 'Pitch Summary', { textarea: true })}
        <div class="dr-modal-nav">
          <span></span>
          <button class="btn btn-primary" id="drReqSubmit">Send Proposal ${icon('sparkles')}</button>
        </div>
      </div>`;
    $('drReqClose').addEventListener('click', () => overlay.classList.remove('open'));
    $('drReqSubmit').addEventListener('click', () => submitInvestmentRequest(overlay));
  }

  function submitInvestmentRequest(overlay) {
    if (!state.otherUser) return toast('No investor selected.', true);
    const payload = {
      investor_id: state.otherUser.id,
      amount_needed: $('drReqAmount').value,
      stage: $('drReqStage').value,
      use_of_funds: $('drReqUseOfFunds').value,
      equity_offered: $('drReqEquity').value,
      milestones: $('drReqMilestones').value,
      pitch_summary: $('drReqPitch').value,
    };
    overlay.querySelector('.dr-modal').innerHTML = `<div class="dr-loading"><div class="loader-orb"></div><p style="margin-top:14px;">VISION AI is drafting your proposal…</p></div>`;
    api('/api/investment-proposal', { method: 'POST', body: JSON.stringify(payload) }).then(({ ok, data }) => {
      overlay.classList.remove('open');
      if (!ok) return toast(data.error || 'Could not send proposal.', true);
      toast('Proposal sent!');
      switchTab('messages');
      const item = document.querySelector(`.conversation-item[data-conversation-id="${data.conversation_id}"]`);
      if (item) item.click();
    });
  }

  // ---------------------------------------------------------------------
  // Init
  // ---------------------------------------------------------------------

  document.addEventListener('DOMContentLoaded', initTabs);

  window.DealRoom = { onConversationOpened };
})();