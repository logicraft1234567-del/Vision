// ============================================================================
// VISION AI — vision-ai.js
// Floating copilot panel + contextual buttons injected into the project
// modal. Talks to POST /api/vision-ai. No page reloads.
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
  initVisionAiPanel();
  initVisionAiProjectPicker();
  initVisionAiModalActions();
});

let vaiSelectedProjectId = null; // builder's chosen project in the panel select
let vaiLastViewedProject = null; // full detail of whatever project modal is open

// --------------------------------------------------------------------------
// Panel open / close
// --------------------------------------------------------------------------
function initVisionAiPanel() {
  const toggle = document.getElementById('visionAiToggle');
  const panel = document.getElementById('visionAiPanel');
  const overlay = document.getElementById('visionAiOverlay');
  const closeBtn = document.getElementById('visionAiClose');
  const form = document.getElementById('visionAiForm');
  const input = document.getElementById('visionAiInput');
  const actionsBar = document.getElementById('visionAiActions');
  if (!panel) return;

  const openPanel = () => {
    panel.classList.add('open');
    overlay.classList.add('open');
    setTimeout(() => input && input.focus(), 200);
  };
  const closePanel = () => {
    panel.classList.remove('open');
    overlay.classList.remove('open');
  };

  if (toggle) toggle.addEventListener('click', openPanel);
  if (closeBtn) closeBtn.addEventListener('click', closePanel);
  if (overlay) overlay.addEventListener('click', closePanel);

  // expose so the modal-injected buttons can open the panel too
  window.__visionAiOpen = openPanel;

  if (actionsBar) {
    actionsBar.addEventListener('click', (e) => {
      const chip = e.target.closest('.vision-ai-chip');
      if (!chip) return;
      const action = chip.dataset.action;

      if (action === 'compare_startups') {
        const select = document.getElementById('visionAiCompareSelect');
        const ids = select ? Array.from(select.selectedOptions).map((o) => o.value) : [];
        if (ids.length < 2) {
          appendVaiMessage('Pick at least two projects in the compare list above (Ctrl/Cmd-click to select more than one).', 'error');
          return;
        }
        runVisionAiAction(action, { project_ids: ids }, 'Compare selected startups');
        return;
      }

      if (chip.dataset.vaiSeed) {
        runVisionAiAction(action, { prompt: chip.dataset.vaiSeed, project_id: vaiSelectedProjectId }, chip.dataset.vaiSeed);
        return;
      }

      runVisionAiAction(action, { project_id: vaiSelectedProjectId });
    });
  }

  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (!text) return;
      input.value = '';
      const role = panel.dataset.role;
      const action = role === 'builder' ? 'startup_chat' : 'universal_chat';
      runVisionAiAction(action, { prompt: text, project_id: vaiSelectedProjectId }, text);
    });
  }
}

// --------------------------------------------------------------------------
// Builder's "which project?" select
// --------------------------------------------------------------------------
function initVisionAiProjectPicker() {
  const select = document.getElementById('visionAiProjectSelect');
  if (!select) return; // company has no project picker

  const panel = document.getElementById('visionAiPanel');
  const role = panel ? panel.dataset.role : null;
  const compareSelect = document.getElementById('visionAiCompareSelect');
  const endpoint = role === 'investor' ? '/api/public-projects' : '/api/my-projects';
  const emptyLabel = role === 'investor' ? 'No public projects yet' : 'No projects yet — publish one first';

  fetch(endpoint)
    .then((r) => r.json())
    .then((projects) => {
      if (!projects.length) {
        select.innerHTML = `<option value="">${emptyLabel}</option>`;
        if (compareSelect) compareSelect.innerHTML = '';
        return;
      }
      const label = (p) => role === 'investor'
        ? `${escapeHtmlVai(p.project_name)} — @${escapeHtmlVai(p.owner_username)}`
        : escapeHtmlVai(p.project_name);

      select.innerHTML = projects.map((p) => `<option value="${p.id}">${label(p)}</option>`).join('');
      vaiSelectedProjectId = projects[0].id;

      if (compareSelect) {
        compareSelect.innerHTML = projects.map((p) => `<option value="${p.id}">${label(p)}</option>`).join('');
      }
    })
    .catch(() => {
      select.innerHTML = '<option value="">Could not load projects</option>';
    });

  select.addEventListener('change', () => {
    vaiSelectedProjectId = select.value || null;
  });
}

// --------------------------------------------------------------------------
// Contextual buttons injected into the existing project modal
// (main.js owns opening/rendering the modal — we just add a bar on top)
// --------------------------------------------------------------------------
function initVisionAiModalActions() {
  document.body.addEventListener('click', (e) => {
    if (e.target.closest('[data-open-project]')) {
      const id = e.target.closest('[data-open-project]').dataset.openProject;
      setTimeout(() => injectVisionAiModalBar(id), 500); // let main.js populate the modal first
    }
  });
}

function injectVisionAiModalBar(projectId) {
  const bodyEl = document.getElementById('modalProjectBody');
  const panel = document.getElementById('visionAiPanel');
  if (!bodyEl || !panel) return;

  const existing = bodyEl.querySelector('.vision-ai-modal-bar');
  if (existing) existing.remove();

  fetch(`/api/project/${projectId}`)
    .then((r) => r.json())
    .then((p) => {
      vaiLastViewedProject = p;
      const role = panel.dataset.role;
      let buttons = '';

      if (role === 'builder' && p.is_owner) {
        buttons = `
          <button type="button" class="vision-ai-modal-btn" data-vai-action="project_review">Review This Project</button>
          <button type="button" class="vision-ai-modal-btn" data-vai-action="improve_pitch">Improve Pitch</button>
          <button type="button" class="vision-ai-modal-btn" data-vai-action="startup_roadmap">Generate Roadmap</button>
        `;
      } else if (role === 'investor' && !p.is_owner) {
        buttons = `
          <button type="button" class="vision-ai-modal-btn" data-vai-action="investment_analysis">Analyze with VISION AI</button>
          <button type="button" class="vision-ai-modal-btn" data-vai-action="due_diligence_questions">Suggest Questions to Ask</button>
        `;
      } else if (role === 'company' && !p.is_owner) {
        buttons = `
          <button type="button" class="vision-ai-modal-btn" data-vai-action="outreach_writer">Draft Outreach Message</button>
        `;
      }

      if (!buttons) return;

      const bar = document.createElement('div');
      bar.className = 'vision-ai-modal-bar';
      bar.innerHTML = `<div class="vision-ai-modal-bar-label">VISION AI</div>${buttons}`;
      bodyEl.prepend(bar);

      bar.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-vai-action]');
        if (!btn) return;
        window.__visionAiOpen && window.__visionAiOpen();
        runVisionAiAction(btn.dataset.vaiAction, { project_id: projectId });
      });
    })
    .catch(() => {});
}

// --------------------------------------------------------------------------
// Core: call the API, show shimmer, render the result
// --------------------------------------------------------------------------
function runVisionAiAction(action, payload, userLabel) {
  const messages = document.getElementById('visionAiMessages');
  if (!messages) return;

  if (userLabel) {
    appendVaiMessage(userLabel, 'user');
  } else {
    appendVaiMessage(vaiActionLabel(action), 'user');
  }

  const shimmerId = appendVaiShimmer();

  fetch('/api/vision-ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action,
      prompt: payload.prompt || '',
      project_id: payload.project_id || null,
      page: document.title,
    }),
  })
    .then((r) => r.json())
    .then((data) => {
      removeVaiShimmer(shimmerId);
      if (data.error) {
        appendVaiMessage(data.error, 'error');
        return;
      }
      renderVisionAiResult(action, data.result);
    })
    .catch(() => {
      removeVaiShimmer(shimmerId);
      appendVaiMessage("VISION AI couldn't reach the server. Please try again.", 'error');
    });
}

function vaiActionLabel(action) {
  const labels = {
    project_review: 'Review my project',
    improve_pitch: 'Improve my pitch',
    startup_roadmap: 'Generate a roadmap',
    investment_analysis: 'Analyze this project',
    due_diligence_questions: 'Suggest questions to ask',
    partnership_suggestions: 'Find partnership matches',
    outreach_writer: 'Draft an outreach message',
    startup_score: 'Score my startup',
    find_matches: 'Find matching investors',
    pitch_practice: 'Practice my pitch',
    weekly_advisor: 'Give me this week\u2019s advice',
    compare_startups: 'Compare selected startups',
  };
  return labels[action] || 'Ask VISION AI';
}

// --------------------------------------------------------------------------
// Icon set — small inline feather-style SVGs. They use stroke="currentColor"
// so each one automatically picks up whatever color the card variant sets
// on its <h4>. Keeping these inline (rather than the server-side icon()
// Jinja helper) means this file has zero extra requests and works the same
// inside the JS-built chat panel.
// --------------------------------------------------------------------------
const VAI_ICONS = {
  sparkles: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l1.8 5.4L19 9l-5.2 1.6L12 16l-1.8-5.4L5 9l5.2-1.6L12 2z"/><path d="M19 15l.8 2.3L22 18l-2.2.7L19 21l-.8-2.3L16 18l2.2-.7L19 15z"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.1V12a10 10 0 1 1-5.9-9.1"/><polyline points="22 4 12 14.1 9 11.1"/></svg>',
  alert: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h16.9a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
  info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="11"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
  bulb: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.3h6c0-1 .4-1.8 1-2.3A7 7 0 0 0 12 2z"/></svg>',
  trending: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>',
  help: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
  mail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M22 6l-10 7L2 6"/></svg>',
  users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.9"/><path d="M16 3.1a4 4 0 0 1 0 7.8"/></svg>',
  zap: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
  flag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>',
};

function vaiIcon(name) {
  return VAI_ICONS[name] || '';
}

// --------------------------------------------------------------------------
// Rendering
// --------------------------------------------------------------------------
// Renders free-text (markdown-ish) content for use INSIDE a card — uses the
// shared renderer from main.js when available, else a plain paragraph.
function vaiRenderText(text) {
  if (typeof window.renderMarkdownLite === 'function') {
    return window.renderMarkdownLite(text || '');
  }
  return `<p>${escapeHtmlVai(text || '')}</p>`;
}

// Renders a standalone chat-bubble reply (startup_chat / universal_chat /
// raw fallback) — wraps the rendered markdown in one bubble container so a
// multi-paragraph answer still reads as a single message, not several.
function vaiRenderBubble(text) {
  return `<div class="vision-ai-msg-content">${vaiRenderText(text)}</div>`;
}

// Defensive client-side cleanup in case a list field ever slips through the
// server-side sanitizer as a lone string (e.g. an older cached response) —
// mirrors the coercion vision_ai.py performs.
function vaiAsList(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const quoted = value.match(/"([^"]+)"/g);
    if (quoted && quoted.length > 1) {
      return quoted.map((q) => q.slice(1, -1).trim()).filter(Boolean);
    }
    return value.split(/\n|;|,/).map((s) => s.trim().replace(/^["'\[\]]+|["'\[\]]+$/g, '')).filter(Boolean);
  }
  return [];
}

function renderVisionAiResult(action, result) {
  const messages = document.getElementById('visionAiMessages');
  if (!messages) return;
  const wrap = document.createElement('div');
  wrap.className = 'vision-ai-msg vision-ai-msg-bot';

  if (result && result.raw) {
    wrap.innerHTML = vaiRenderBubble(result.raw);
  } else if (action === 'project_review') {
    wrap.innerHTML = vaiCard('Summary', vaiRenderText(result.summary), { icon: 'sparkles' })
      + vaiCard('Strengths', vaiList(result.strengths), { icon: 'check', variant: 'green' })
      + vaiCard('Weaknesses', vaiList(result.weaknesses), { icon: 'alert', variant: 'red' })
      + vaiCard('Missing Information', vaiList(result.missing_info), { icon: 'info', variant: 'blue' })
      + vaiCard('Suggestions', vaiList(result.suggestions), { icon: 'bulb', variant: 'amber' });
  } else if (action === 'improve_pitch') {
    const combined = `Overview:\n${result.overview}\n\nProblem:\n${result.problem}\n\nSolution:\n${result.solution}`;
    const pitchInner = `
      <h5>Overview</h5>${vaiRenderText(result.overview)}
      <h5>Problem</h5>${vaiRenderText(result.problem)}
      <h5>Solution</h5>${vaiRenderText(result.solution)}
      ${vaiCopyButton(combined)}
    `;
    wrap.innerHTML = vaiCard('Your Improved Pitch', pitchInner, { icon: 'sparkles' });
  } else if (action === 'startup_roadmap') {
    wrap.innerHTML = `<div class="vision-ai-card"><div class="vision-ai-roadmap">
      ${vaiRoadmapStage('MVP', result.mvp, 'zap')}
      ${vaiRoadmapStage('Beta', result.beta, 'flag')}
      ${vaiRoadmapStage('Launch', result.launch, 'trending')}
    </div></div>`;
  } else if (action === 'investment_analysis') {
    const assessmentInner = `
      <h5>Market Potential</h5>${vaiRenderText(result.market_potential)}
      <h5>Technical Difficulty</h5>${vaiRenderText(result.technical_difficulty)}
      <h5>Revenue Potential</h5>${vaiRenderText(result.revenue_potential)}
    `;
    wrap.innerHTML = vaiCard('Summary', vaiRenderText(result.summary), { icon: 'sparkles' })
      + vaiCard('Assessment', assessmentInner, { icon: 'info', variant: 'blue' })
      + vaiCard('Biggest Risks', vaiList(result.biggest_risks), { icon: 'alert', variant: 'red' })
      + vaiCard('Biggest Opportunities', vaiList(result.biggest_opportunities), { icon: 'trending', variant: 'green' })
      + vaiCard('Suggested Questions', vaiOrderedList(result.suggested_questions), { icon: 'help', variant: 'amber' });
  } else if (action === 'due_diligence_questions') {
    wrap.innerHTML = vaiCard('Questions to Ask', vaiOrderedList(result.questions), { icon: 'help', variant: 'amber' });
  } else if (action === 'partnership_suggestions') {
    const suggestions = result.suggestions || [];
    if (!suggestions.length) {
      wrap.innerHTML = `<p>No strong matches among current public projects right now — check back as more get published.</p>`;
    } else {
      wrap.innerHTML = suggestions.map((s) => vaiCard(
        `${escapeHtmlVai(s.project_name)} — @${escapeHtmlVai(s.owner_username)}`,
        `<span class="vai-match-pill">Suggested Match</span>${vaiRenderText(s.reason)}`,
        { icon: 'users', variant: 'green' }
      )).join('');
    }
  } else if (action === 'startup_score') {
    const scoreInner = `
      <div class="vai-score-dial"><span class="vai-score-number">${escapeHtmlVai(result.score)}</span><span class="vai-score-max">/100</span></div>
      ${vaiRenderText(result.verdict)}
    `;
    wrap.innerHTML = vaiCard('Startup Score', scoreInner, { icon: 'sparkles' })
      + vaiCard('What\u2019s Working', vaiList(result.strengths), { icon: 'check', variant: 'green' })
      + vaiCard('What\u2019s Holding You Back', vaiList(result.weaknesses), { icon: 'alert', variant: 'red' });
  } else if (action === 'pitch_practice') {
    const qs = vaiAsList(result.likely_questions);
    const practiceInner = qs.length
      ? `<ol class="vai-numbered">${qs.map((q) => `<li>${escapeHtmlVai(q)}</li>`).join('')}</ol>`
      : '<p>None noted.</p>';
    wrap.innerHTML = vaiCard('Questions Investors Will Likely Ask', practiceInner, { icon: 'help', variant: 'amber' })
      + vaiCard('Coaching Notes', vaiRenderText(result.coaching_notes), { icon: 'bulb' });
  } else if (action === 'weekly_advisor') {
    wrap.innerHTML = vaiCard('This Week\u2019s Focus', vaiRenderText(result.summary), { icon: 'sparkles' })
      + vaiCard('Recommended Actions', vaiOrderedList(result.recommendations), { icon: 'zap', variant: 'amber' });
  } else if (action === 'compare_startups') {
    const rows = result.comparisons || [];
    const table = rows.length
      ? `<table class="vai-compare-table"><thead><tr><th>Startup</th><th>Verdict</th></tr></thead><tbody>${rows
          .map((r) => `<tr><td>${escapeHtmlVai(r.project_name)}</td><td>${escapeHtmlVai(r.verdict)}</td></tr>`)
          .join('')}</tbody></table>`
      : '<p>Not enough information to compare.</p>';
    wrap.innerHTML = vaiCard('Side-by-Side', table, { icon: 'trending', variant: 'blue' })
      + vaiCard('Recommendation', vaiRenderText(result.recommendation), { icon: 'sparkles' });
  } else if (action === 'outreach_writer') {
    const messageInner = `<div class="vai-message-block">${vaiRenderText(result.message)}</div>${vaiCopyButton(result.message)}`;
    wrap.innerHTML = vaiCard('Draft Message', messageInner, { icon: 'mail', variant: 'blue' });
  } else {
    // startup_chat / universal_chat — free-form text
    wrap.innerHTML = vaiRenderBubble(result.text || '');
  }

  messages.appendChild(wrap);
  messages.scrollTop = messages.scrollHeight;
}

function vaiCard(title, innerHtml, opts) {
  const { icon, variant } = opts || {};
  const variantClass = variant ? ` vision-ai-card--${variant}` : '';
  const iconHtml = icon ? vaiIcon(icon) : '';
  return `<div class="vision-ai-card${variantClass}"><h4>${iconHtml}${escapeHtmlVai(title)}</h4>${innerHtml}</div>`;
}

function vaiList(items) {
  const list = vaiAsList(items);
  if (!list.length) return '<p>None noted.</p>';
  return `<ul>${list.map((i) => `<li>${escapeHtmlVai(i)}</li>`).join('')}</ul>`;
}

function vaiOrderedList(items) {
  const list = vaiAsList(items);
  if (!list.length) return '<p>None noted.</p>';
  return `<ol class="vai-numbered">${list.map((i) => `<li>${escapeHtmlVai(i)}</li>`).join('')}</ol>`;
}

function vaiRoadmapStage(title, items, icon) {
  const iconHtml = icon ? vaiIcon(icon) : '';
  return `<div class="vision-ai-roadmap-stage"><h4>${iconHtml}${escapeHtmlVai(title)}</h4>${vaiList(items)}</div>`;
}

function vaiCopyButton(text) {
  const encoded = encodeURIComponent(text || '');
  return `<button type="button" class="vision-ai-card-copy" onclick="navigator.clipboard.writeText(decodeURIComponent('${encoded}'))">Copy</button>`;
}

function appendVaiMessage(text, kind) {
  const messages = document.getElementById('visionAiMessages');
  if (!messages) return;
  const wrap = document.createElement('div');
  wrap.className = `vision-ai-msg vision-ai-msg-${kind === 'user' ? 'user' : kind === 'error' ? 'error' : 'bot'}`;
  wrap.innerHTML = `<p>${escapeHtmlVai(text)}</p>`;
  messages.appendChild(wrap);
  messages.scrollTop = messages.scrollHeight;
}

let vaiShimmerCounter = 0;
function appendVaiShimmer() {
  const messages = document.getElementById('visionAiMessages');
  if (!messages) return null;
  const id = `vai-shimmer-${vaiShimmerCounter++}`;
  const wrap = document.createElement('div');
  wrap.className = 'vision-ai-msg vision-ai-msg-bot';
  wrap.id = id;
  wrap.innerHTML = '<div class="vision-ai-shimmer"><span></span><span></span><span></span></div>';
  messages.appendChild(wrap);
  messages.scrollTop = messages.scrollHeight;
  return id;
}

function removeVaiShimmer(id) {
  if (!id) return;
  const el = document.getElementById(id);
  if (el) el.remove();
}

function escapeHtmlVai(str) {
  if (str === undefined || str === null) return '';
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}