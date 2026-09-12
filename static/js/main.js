// ============================================================================
// VISION — main.js
// ============================================================================

let activeReplyTarget = null; // { commentId, username } while replying to a comment, else null

// ----------------------------------------------------------------------------
// Reputation badges (mirrors the reputation_badge() macro in _reputation.html)
// ----------------------------------------------------------------------------
const REPUTATION_ICON_PATHS = {
  'circle-check': '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
  'sparkles': '<path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/><path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/>',
  'crown': '<path d="m2 4 3 12h14l3-12-6 7-4-7-4 7-6-7z"/><path d="M5 21h14"/>',
  'bike': '<circle cx="18.5" cy="17.5" r="3.5"/><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="15" cy="5" r="1"/><path d="M12 17.5V14l-3-3 4-3 2 3h2"/>',
  'car': '<path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/>',
  'sailboat': '<path d="M22 18H2a4 4 0 0 0 4 4h12a4 4 0 0 0 4-4Z"/><path d="M21 14 10 2 3 14Z"/><path d="M10 2v16"/>',
  'plane': '<path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-1 .1-1.3.5l-.7.9c-.4.5-.2 1.2.3 1.5L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.5 1 .7 1.5.3l.9-.7c.4-.3.6-.8.5-1.3Z"/>',
};

/** Renders a reputation badge HTML string from a reputation dict returned by the API. */
function renderReputationBadge(rep) {
  if (!rep) return '';
  const style = `--rep-color: ${rep.color};`;
  if (rep.kind === 'letter') {
    const filledClass = rep.filled ? ' filled' : '';
    return `<span class="reputation-badge" style="${style}" title="${escapeHtml(rep.label || '')}"><span class="reputation-letter${filledClass}">${escapeHtml(rep.letter)}</span></span>`;
  }
  const pathData = REPUTATION_ICON_PATHS[rep.icon] || '';
  return `<span class="reputation-badge" style="${style}" title="${escapeHtml(rep.label || '')}"><svg class="reputation-icon" viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${pathData}</svg></span>`;
}

/** Renders the small colored language-monogram chips next to a name — mirrors
 * the language_badges() macro in _reputation.html. `languages` is the
 * [{name, color, abbr}] array the API already sends. */
function renderLanguageBadges(languages) {
  if (!languages || !languages.length) return '';
  const chips = languages.map((l) => `<span class="lang-badge" style="--lang-color: ${l.color};" title="${escapeAttr(l.name)}">${escapeHtml(l.abbr)}</span>`).join('');
  return `<span class="lang-badge-row">${chips}</span>`;
}

/** Renders the software/hardware/both icon next to a builder's name —
 * mirrors builder_type_badge() in _reputation.html. `builderType` is the
 * {label, color} dict the API sends (null for non-builders). */
function renderBuilderTypeBadge(builderType) {
  if (!builderType) return '';
  return `<span class="builder-type-badge" style="--type-color: ${builderType.color};" title="${escapeAttr(builderType.label)}"><svg class="icon icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 2 10 6-10 6L2 8Z"/><path d="m2 16 10 6 10-6"/></svg></span>`;
}

document.addEventListener('DOMContentLoaded', () => {
  initLoader();
  initNavbar();
  initMobileMenu();
  initMobileSidebar();
  initRevealAnimations();
  initParticles();
  initParallax();
  initFlashAutoHide();
  initSignupFlow();
  initPasswordToggles();
  initToggles();
  initUploadPreviews();
  initDashboardInteractions();
  initLiveProjectCounts();
  initSidebarSettings();
  initProjectFormModal();
  initSmoothAnchors();
  initCollaborationModal();
  initMessageApplicantButtons();
  initTeamChatButtons();
  initMessagesPage();
  initCommentReplies();
  initCollaboratorRemoval();
  initUserSearch();
  initUserProfileModal();
  initNotifications();
});

// --------------------------------------------------------------------------
// Mobile sidebar drawer (hamburger in topbar -> slide-in sidebar)
// --------------------------------------------------------------------------
function initMobileSidebar() {
  const sidebar = document.getElementById('dashSidebar');
  const overlay = document.getElementById('sidebarOverlay');
  const toggleBtn = document.getElementById('sidebarToggle');
  const closeBtn = document.getElementById('sidebarCloseBtn');
  if (!sidebar || !overlay) return;

  const open = () => {
    sidebar.classList.add('mobile-open');
    overlay.classList.add('open');
  };
  const close = () => {
    sidebar.classList.remove('mobile-open');
    overlay.classList.remove('open');
  };

  if (toggleBtn) toggleBtn.addEventListener('click', open);
  if (closeBtn) closeBtn.addEventListener('click', close);
  overlay.addEventListener('click', close);
  sidebar.querySelectorAll('a').forEach((a) => a.addEventListener('click', close));
}

// --------------------------------------------------------------------------
// Page loader
// --------------------------------------------------------------------------
function initLoader() {
  const loader = document.getElementById('pageLoader');
  if (!loader) return;
  window.addEventListener('load', () => {
    setTimeout(() => loader.classList.add('hide'), 250);
  });
  // Fallback in case load already fired
  setTimeout(() => loader.classList.add('hide'), 1500);
}

// --------------------------------------------------------------------------
// Navbar scroll state + mobile menu
// --------------------------------------------------------------------------
function initNavbar() {
  const navbar = document.getElementById('navbar');
  if (!navbar) return;
  const onScroll = () => {
    if (window.scrollY > 30) navbar.classList.add('scrolled');
    else navbar.classList.remove('scrolled');
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

function initMobileMenu() {
  const btn = document.getElementById('hamburgerBtn');
  const links = document.getElementById('navLinks');
  if (!btn || !links) return;
  btn.addEventListener('click', () => {
    const isOpen = links.style.display === 'flex';
    links.style.display = isOpen ? 'none' : 'flex';
    links.style.flexDirection = 'column';
    links.style.position = 'fixed';
    links.style.top = '70px';
    links.style.left = '0';
    links.style.right = '0';
    links.style.background = 'rgba(11,15,25,0.97)';
    links.style.padding = '24px 32px';
    links.style.gap = '18px';
    links.style.borderBottom = '1px solid #1F2937';
  });
}

// --------------------------------------------------------------------------
// Scroll reveal (IntersectionObserver)
// --------------------------------------------------------------------------
function initRevealAnimations() {
  const targets = document.querySelectorAll('.reveal, .reveal-scale, .reveal-left, .reveal-right');
  if (!targets.length) return;
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15 });
  targets.forEach((el) => observer.observe(el));
}

// --------------------------------------------------------------------------
// Floating particles in hero
// --------------------------------------------------------------------------
function initParticles() {
  const container = document.getElementById('particles');
  if (!container) return;
  const count = window.innerWidth < 768 ? 18 : 40;
  for (let i = 0; i < count; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    p.style.left = Math.random() * 100 + '%';
    p.style.top = Math.random() * 100 + '%';
    p.style.opacity = (0.2 + Math.random() * 0.5).toFixed(2);
    const duration = 6 + Math.random() * 10;
    p.style.animation = `floatParticle ${duration}s ease-in-out infinite`;
    p.style.animationDelay = (Math.random() * 6) + 's';
    container.appendChild(p);
  }
  const style = document.createElement('style');
  style.textContent = `
    @keyframes floatParticle {
      0%, 100% { transform: translate(0, 0); }
      50% { transform: translate(${(Math.random() * 30 - 15).toFixed(0)}px, -40px); }
    }
  `;
  document.head.appendChild(style);
}

// --------------------------------------------------------------------------
// Mouse parallax (hero only)
// --------------------------------------------------------------------------
function initParallax() {
  const hero = document.getElementById('hero');
  const orbWrap = document.getElementById('orbWrap');
  const blob1 = document.getElementById('blob1');
  const blob2 = document.getElementById('blob2');
  if (!hero) return;

  hero.addEventListener('mousemove', (e) => {
    const { innerWidth, innerHeight } = window;
    const x = (e.clientX / innerWidth - 0.5) * 2;
    const y = (e.clientY / innerHeight - 0.5) * 2;

    if (orbWrap) orbWrap.style.transform = `translate(${x * 16}px, ${y * 16}px)`;
    if (blob1) blob1.style.transform = `translate(${x * 30}px, ${y * 30}px)`;
    if (blob2) blob2.style.transform = `translate(${-x * 30}px, ${-y * 30}px)`;
  });
}

// --------------------------------------------------------------------------
// Flash messages auto-hide
// --------------------------------------------------------------------------
function initFlashAutoHide() {
  const stack = document.getElementById('flashStack');
  if (!stack) return;
  setTimeout(() => {
    stack.style.transition = 'opacity 0.5s ease';
    stack.style.opacity = '0';
    setTimeout(() => stack.remove(), 500);
  }, 4500);
}

// --------------------------------------------------------------------------
// Signup: role selection + step transition
// --------------------------------------------------------------------------
function initSignupFlow() {
  const roleCards = document.querySelectorAll('.role-card');
  const continueBtn = document.getElementById('continueBtn');
  const step1 = document.getElementById('step1');
  const step2 = document.getElementById('step2');
  const roleInput = document.getElementById('roleInput');
  const backBtn = document.getElementById('backBtn');
  const step2Title = document.getElementById('step2Title');
  if (!roleCards.length) return;

  let selectedRole = null;

  roleCards.forEach((card) => {
    card.addEventListener('click', () => {
      roleCards.forEach((c) => c.classList.remove('selected'));
      card.classList.add('selected');
      selectedRole = card.dataset.role;
      continueBtn.disabled = false;
    });
  });

  continueBtn.addEventListener('click', () => {
    if (!selectedRole) return;
    roleInput.value = selectedRole;
    document.querySelectorAll('.role-fields').forEach((f) => {
      f.style.display = 'none';
      // Disable inputs in hidden role blocks so they are excluded from
      // the submitted form data (fields share names like "username" and
      // "full_name" across roles, and hidden-but-enabled inputs would
      // otherwise overwrite the value from the active role's block).
      f.querySelectorAll('input, select, textarea').forEach((el) => (el.disabled = true));
    });
    // `~=` matches a single token in a space-separated attribute value, so
    // a block can opt into multiple roles with e.g. data-fields="builder investor"
    // — used by the shared programming-languages picker.
    const targets = document.querySelectorAll(`.role-fields[data-fields~="${selectedRole}"]`);
    targets.forEach((target) => {
      target.style.display = 'block';
      target.querySelectorAll('input, select, textarea').forEach((el) => (el.disabled = false));
    });
    step2Title.textContent = `Create your ${selectedRole} account`;
    step1.classList.remove('active');
    step2.classList.add('active');
  });

  backBtn.addEventListener('click', () => {
    step2.classList.remove('active');
    step1.classList.add('active');
  });
}

// --------------------------------------------------------------------------
// Password visibility toggles
// --------------------------------------------------------------------------
function initPasswordToggles() {
  document.querySelectorAll('.password-toggle').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = document.getElementById(btn.dataset.toggleTarget);
      if (!target) return;
      target.type = target.type === 'password' ? 'text' : 'password';
    });
  });
}

// --------------------------------------------------------------------------
// Toggle switches (visual on/off for checkbox inputs)
// --------------------------------------------------------------------------
function initToggles() {
  document.querySelectorAll('.js-toggle').forEach((toggle) => {
    const input = toggle.previousElementSibling ? null : null;
  });

  document.querySelectorAll('.mock-toggle-row').forEach((row) => {
    const checkbox = row.querySelector('.toggle-input');
    const visual = row.querySelector('.js-toggle');
    if (!checkbox || !visual) return;
    visual.classList.toggle('on', checkbox.checked);
    row.addEventListener('click', (e) => {
      if (e.target === checkbox) return;
      checkbox.checked = !checkbox.checked;
      visual.classList.toggle('on', checkbox.checked);
    });
  });
}

// --------------------------------------------------------------------------
// Upload previews (cover image, screenshots, video)
// --------------------------------------------------------------------------
function initUploadPreviews() {
  bindPreview('coverImageInput', 'coverPreview', 'image');
  bindPreview('shotsInput', 'shotsPreview', 'image');
  bindPreview('videoInput', 'videoPreview', 'video');
  bindProfilePicPreview();
}

function bindProfilePicPreview() {
  const input = document.getElementById('profilePicInput');
  const preview = document.getElementById('profilePicPreview');
  const dropText = document.getElementById('profilePicDropText');
  if (!input || !preview) return;

  input.addEventListener('change', () => {
    preview.innerHTML = '';
    const file = input.files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    const thumb = document.createElement('div');
    thumb.className = 'preview-thumb';
    const img = document.createElement('img');
    img.src = url;
    thumb.appendChild(img);
    preview.appendChild(thumb);
    if (dropText) dropText.textContent = `Selected: ${file.name}`;
  });
}

function bindPreview(inputId, previewId, kind) {
  const input = document.getElementById(inputId);
  const preview = document.getElementById(previewId);
  if (!input || !preview) return;

  input.addEventListener('change', () => {
    preview.innerHTML = '';
    Array.from(input.files).forEach((file) => {
      const url = URL.createObjectURL(file);
      const thumb = document.createElement('div');
      thumb.className = 'preview-thumb';
      if (kind === 'image') {
        const img = document.createElement('img');
        img.src = url;
        thumb.appendChild(img);
      } else {
        const video = document.createElement('video');
        video.src = url;
        video.muted = true;
        thumb.appendChild(video);
      }
      preview.appendChild(thumb);
    });
  });
}

// --------------------------------------------------------------------------
// Dashboard: like, save, comment, project detail modal
// --------------------------------------------------------------------------
function initDashboardInteractions() {
  document.body.addEventListener('click', (e) => {
    const likeBtn = e.target.closest('.like-btn');
    const saveBtn = e.target.closest('.save-btn');
    const openBtn = e.target.closest('[data-open-project]');
    const editBtn = e.target.closest('.edit-project-btn');

    if (likeBtn) {
      e.preventDefault();
      toggleLike(likeBtn);
    } else if (saveBtn) {
      e.preventDefault();
      toggleSave(saveBtn);
    } else if (editBtn) {
      e.preventDefault();
      openEditProject(editBtn.dataset.projectId);
    } else if (openBtn) {
      e.preventDefault();
      openProjectModal(openBtn.dataset.openProject);
    }
  });

  const closeProjectModal = document.getElementById('closeProjectModal');
  const projectModal = document.getElementById('projectModal');
  if (closeProjectModal && projectModal) {
    closeProjectModal.addEventListener('click', () => {
      projectModal.classList.remove('open');
      activeReplyTarget = null;
    });
    projectModal.addEventListener('click', (e) => {
      if (e.target === projectModal) {
        projectModal.classList.remove('open');
        activeReplyTarget = null;
      }
    });
  }
}

function toggleLike(btn) {
  const id = btn.dataset.projectId;
  fetch(`/api/project/${id}/like`, { method: 'POST' })
    .then((r) => r.json())
    .then((data) => {
      btn.classList.toggle('liked', data.liked);
      const countEl = btn.querySelector('.like-count');
      if (countEl) countEl.textContent = data.like_count;
    })
    .catch(() => {});
}

function toggleSave(btn) {
  const id = btn.dataset.projectId;
  fetch(`/api/project/${id}/save`, { method: 'POST' })
    .then((r) => r.json())
    .then((data) => {
      btn.classList.toggle('saved', data.saved);
    })
    .catch(() => {});
}

// Keeps like counts (and my liked/saved state) current on every visible
// project card — e.g. if someone else likes a project you're both looking
// at — without needing a page refresh. No-ops on pages with no cards.
function initLiveProjectCounts() {
  setInterval(() => {
    if (document.hidden) return;
    const likeBtns = document.querySelectorAll('.like-btn[data-project-id]');
    if (!likeBtns.length) return;
    const ids = [...new Set([...likeBtns].map((b) => b.dataset.projectId))];

    fetch(`/api/projects/counts?ids=${ids.join(',')}`)
      .then((r) => r.json())
      .then((data) => {
        const counts = (data && data.counts) || {};
        Object.entries(counts).forEach(([id, c]) => {
          document.querySelectorAll(`.like-btn[data-project-id="${id}"]`).forEach((btn) => {
            btn.classList.toggle('liked', c.liked);
            const countEl = btn.querySelector('.like-count');
            if (countEl) countEl.textContent = c.like_count;
          });
          document.querySelectorAll(`.save-btn[data-project-id="${id}"]`).forEach((btn) => {
            btn.classList.toggle('saved', c.saved);
          });
          document.querySelectorAll(`[data-comment-count="${id}"]`).forEach((el) => {
            el.textContent = c.comment_count;
          });
        });
      })
      .catch(() => {});
  }, 2000);
}

function openProjectModal(id) {
  const modal = document.getElementById('projectModal');
  const nameEl = document.getElementById('modalProjectName');
  const bodyEl = document.getElementById('modalProjectBody');
  if (!modal) return;

  bodyEl.innerHTML = '<p style="text-align:center; padding:40px 0;">Loading project...</p>';
  modal.classList.add('open');

  fetch(`/api/project/${id}`)
    .then((r) => r.json())
    .then((p) => {
      nameEl.textContent = p.project_name;
      activeReplyTarget = null;

      if (p.locked) {
        renderLockedProjectPanel(p, bodyEl);
        return;
      }

      const badges = [];
      if (p.investment_open) badges.push('Open for Investment');
      if (p.collaboration_open) badges.push('Open for Collaboration');
      if (p.sale_open) badges.push('Up For Sale');
      if (p.team_open) badges.push('Looking for Team');

      const shots = p.screenshots.map((s) => `<div class="preview-thumb" style="width:100px;height:100px;"><img src="${s}"></div>`).join('');

      const commentsHtml = renderCommentThread(p.comments);

      const canApplyToCollaborate = !p.is_owner && p.collaboration_open_for_applicants && !p.collaboration_status;
      let collabActionHtml = '';
      if (canApplyToCollaborate) {
        collabActionHtml = `<button type="button" class="btn btn-outline btn-sm apply-collab-btn" data-project-id="${p.id}">Apply to Collaborate</button>`;
      } else if (!p.is_owner && p.collaboration_status) {
        collabActionHtml = `<span class="chip">${escapeHtml(p.collaboration_status)}</span>`;
      }

      const teamChatHtml = (p.is_team_member && p.team_conversation_id)
        ? `<button type="button" class="btn btn-outline btn-sm open-team-chat-btn" data-conversation-id="${p.team_conversation_id}">💬 Team Chat</button>`
        : '';

      const collaboratorsHtml = (p.collaborators && p.collaborators.length) ? `
        <div style="margin-top:18px;">
          <h5 style="margin-bottom:10px;">Collaborators (${p.collaborators.length})</h5>
          <div style="display:flex; flex-wrap:wrap; gap:8px;">
            ${p.collaborators.map((c) => renderCollaboratorChip(c, p.id, p.is_owner)).join('')}
          </div>
        </div>
      ` : '';

      bodyEl.innerHTML = `
        ${p.cover_image ? `<div class="project-cover" style="border-radius:14px; margin-bottom:18px;"><img src="${p.cover_image}" style="border-radius:14px;"></div>` : ''}
        <div class="project-meta" style="margin-bottom:14px;">by @${escapeHtml(p.owner_username)}${renderReputationBadge(p.owner_reputation)} &middot; ${p.category || ''} &middot; ${p.stage || ''}</div>
        <p style="color:var(--white); margin-bottom:16px;">${escapeHtml(p.overview || '')}</p>
        ${p.problem ? `<h5 style="margin-bottom:6px;">Problem</h5><p style="margin-bottom:14px;">${escapeHtml(p.problem)}</p>` : ''}
        ${p.solution ? `<h5 style="margin-bottom:6px;">Solution</h5><p style="margin-bottom:14px;">${escapeHtml(p.solution)}</p>` : ''}
        ${p.repo_url ? `<h5 style="margin-bottom:6px;">GitHub Repo</h5><p style="margin-bottom:14px;"><a href="${escapeAttr(p.repo_url)}" target="_blank" rel="noopener">${escapeHtml(p.repo_url)}</a></p>` : ''}
        ${p.live_url ? `<h5 style="margin-bottom:6px;">Live / Working Link</h5><p style="margin-bottom:14px;"><a href="${escapeAttr(p.live_url)}" target="_blank" rel="noopener">${escapeHtml(p.live_url)}</a></p>` : ''}
        ${p.challenges ? `<h5 style="margin-bottom:6px;">Challenges</h5><p style="margin-bottom:14px;">${escapeHtml(p.challenges)}</p>` : ''}
        ${p.next_steps ? `<h5 style="margin-bottom:6px;">Moving Forward</h5><p style="margin-bottom:14px;">${escapeHtml(p.next_steps)}</p>` : ''}
        ${badges.length ? `<div class="chip-row" style="margin-bottom:18px;">${badges.map(b => `<span class="chip active software">${b}</span>`).join('')}</div>` : ''}
        ${shots ? `<div class="preview-strip" style="margin-bottom:18px;">${shots}</div>` : ''}
        ${p.demo_video ? `<video src="${p.demo_video}" controls style="width:100%; border-radius:12px; margin-bottom:18px;"></video>` : ''}
        <div style="display:flex; align-items:center; gap:16px; padding-top:14px; border-top:1px solid var(--border);">
          <button class="project-action-btn like-btn ${p.is_liked ? 'liked' : ''}" data-project-id="${p.id}">♥ <span class="like-count">${p.like_count}</span></button>
          <button class="project-action-btn save-btn ${p.is_saved ? 'saved' : ''}" data-project-id="${p.id}">🔖 ${p.is_saved ? 'Saved' : 'Save'}</button>
          ${(collabActionHtml || teamChatHtml) ? `<div style="margin-left:auto; display:flex; gap:10px;">${teamChatHtml}${collabActionHtml}</div>` : ''}
        </div>
        ${collaboratorsHtml}
        <h5 style="margin-top:22px; margin-bottom:0;">Comments</h5>
        <div class="comment-list" id="commentsList">${commentsHtml}</div>
        <form class="comment-form" id="commentForm" data-project-id="${p.id}" style="flex-direction:column; align-items:stretch; gap:8px;">
          <div id="replyIndicator" style="display:none; align-items:center; gap:8px; font-size:12.5px; color:var(--muted);"></div>
          <div style="display:flex; gap:10px;">
            <input class="field-input" type="text" name="comment" placeholder="Write a comment..." required>
            <button type="submit" class="btn btn-primary btn-sm">Send</button>
          </div>
        </form>
      `;

      const commentForm = document.getElementById('commentForm');
      if (commentForm) {
        commentForm.addEventListener('submit', (e) => {
          e.preventDefault();
          const input = commentForm.querySelector('input[name="comment"]');
          const fd = new FormData();
          fd.append('comment', input.value);
          if (activeReplyTarget) fd.append('parent_id', activeReplyTarget.commentId);
          fetch(`/api/project/${p.id}/comment`, { method: 'POST', body: fd })
            .then((r) => r.json())
            .then((data) => {
              if (data.error) return;
              const list = document.getElementById('commentsList');
              const html = renderCommentNode({ ...data, replies: [] });
              if (data.parent_id && list) {
                const parentThread = list.querySelector(`.comment-thread[data-comment-id="${data.parent_id}"]`);
                let repliesContainer = parentThread ? parentThread.querySelector(':scope > .comment-replies') : null;
                if (parentThread && !repliesContainer) {
                  repliesContainer = document.createElement('div');
                  repliesContainer.className = 'comment-replies';
                  parentThread.appendChild(repliesContainer);
                }
                if (repliesContainer) repliesContainer.insertAdjacentHTML('beforeend', html);
              } else if (list) {
                list.insertAdjacentHTML('afterbegin', html);
              }
              input.value = '';
              activeReplyTarget = null;
              updateReplyIndicator();
              document.querySelectorAll(`.comment-count`).forEach(el => {
                const card = el.closest('[data-project-id]');
                if (card && String(card.dataset.projectId) === String(p.id)) el.textContent = data.comment_count;
              });
            });
        });
      }
    });
}

// --------------------------------------------------------------------------
// Private/locked project view: cover + overview only, plus a way to unlock
// with the password or ask the owner for it via chat.
// --------------------------------------------------------------------------
function renderLockedProjectPanel(p, bodyEl) {
  const audienceText = (p.visible_to_labels && p.visible_to_labels.length)
    ? p.visible_to_labels.join(', ')
    : 'a limited audience';

  const restrictedPanel = `
    <div class="icon-badge"><svg class="icon icon-lg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg></div>
    <h4>Not visible to your account type</h4>
    <p>The owner limited this project's full details to: ${escapeHtml(audienceText)}.</p>
  `;

  const passwordPanel = `
    <div class="icon-badge"><svg class="icon icon-lg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></div>
    <h4>This project is private</h4>
    <p>Enter the password to see the full details, or ask the owner for access.</p>
    <form class="project-locked-form" id="projectUnlockForm" data-project-id="${p.id}">
      <input class="field-input" type="text" name="password" placeholder="Password" required>
      <button type="submit" class="btn btn-primary btn-sm">Unlock</button>
    </form>
    <div class="project-locked-error" id="projectUnlockError" style="display:none;"></div>
    <button type="button" class="btn btn-outline btn-sm" id="requestPasswordBtn" data-project-id="${p.id}" style="margin-top:10px;">Request Password</button>
  `;

  bodyEl.innerHTML = `
    ${p.cover_image ? `<div class="project-cover" style="border-radius:14px; margin-bottom:18px;"><img src="${p.cover_image}" style="border-radius:14px;"></div>` : ''}
    <div class="project-meta" style="margin-bottom:14px;">by @${escapeHtml(p.owner_username)}${renderReputationBadge(p.owner_reputation)} &middot; ${p.category || ''}</div>
    <p style="color:var(--white); margin-bottom:10px;">${escapeHtml(p.overview || '')}</p>
    <div class="glass project-locked-panel">
      ${p.role_restricted ? restrictedPanel : passwordPanel}
    </div>
  `;

  if (p.role_restricted) return;

  const unlockForm = document.getElementById('projectUnlockForm');
  const unlockError = document.getElementById('projectUnlockError');
  if (unlockForm) {
    unlockForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(unlockForm);
      fetch(`/api/project/${p.id}/unlock`, { method: 'POST', body: fd })
        .then((r) => r.json().then((data) => ({ ok: r.ok, data })))
        .then(({ ok, data }) => {
          if (!ok) {
            if (unlockError) { unlockError.textContent = data.error || "That password isn't right."; unlockError.style.display = 'block'; }
            return;
          }
          openProjectModal(p.id);
        })
        .catch(() => {
          if (unlockError) { unlockError.textContent = 'Network error — please try again.'; unlockError.style.display = 'block'; }
        });
    });
  }

  const requestBtn = document.getElementById('requestPasswordBtn');
  if (requestBtn) {
    requestBtn.addEventListener('click', () => {
      requestBtn.disabled = true;
      requestBtn.textContent = 'Sending...';
      fetch(`/api/project/${p.id}/request-password`, { method: 'POST' })
        .then((r) => r.json())
        .then((data) => {
          if (data.error) {
            requestBtn.disabled = false;
            requestBtn.textContent = 'Request Password';
            return;
          }
          requestBtn.textContent = 'Request sent ✓';
        })
        .catch(() => {
          requestBtn.disabled = false;
          requestBtn.textContent = 'Request Password';
        });
    });
  }
}
function renderCommentThread(comments) {
  if (!comments || !comments.length) {
    return '<p style="font-size:13px;">No comments yet. Be the first to say something.</p>';
  }
  const byId = new Map();
  comments.forEach((c) => byId.set(c.id, { ...c, replies: [] }));
  const roots = [];
  comments.forEach((c) => {
    const node = byId.get(c.id);
    if (c.parent_id && byId.has(c.parent_id)) {
      byId.get(c.parent_id).replies.push(node);
    } else {
      roots.push(node);
    }
  });
  return roots.map(renderCommentNode).join('');
}

function renderCommentNode(c) {
  const avatar = c.avatar_url ? `<img src="${c.avatar_url}">` : (c.username ? c.username[0].toUpperCase() : 'V');
  const replies = c.replies || [];
  const repliesHtml = replies.length ? `<div class="comment-replies">${replies.map(renderCommentNode).join('')}</div>` : '';
  return `
    <div class="comment-thread" data-comment-id="${c.id}">
      <div class="comment-item">
        <div class="avatar">${avatar}</div>
        <div class="comment-bubble">
          <div class="cname">${escapeHtml(c.username)}${renderReputationBadge(c.reputation)}</div>
          <p>${escapeHtml(c.comment)}</p>
          <button type="button" class="reply-btn" data-comment-id="${c.id}" data-username="${escapeHtml(c.username)}">Reply</button>
        </div>
      </div>
      ${repliesHtml}
    </div>
  `;
}

function updateReplyIndicator() {
  const el = document.getElementById('replyIndicator');
  if (!el) return;
  if (activeReplyTarget) {
    el.style.display = 'flex';
    el.innerHTML = `Replying to <strong>${escapeHtml(activeReplyTarget.username)}</strong><button type="button" id="cancelReplyBtn">Cancel</button>`;
  } else {
    el.style.display = 'none';
    el.innerHTML = '';
  }
}

function initCommentReplies() {
  document.body.addEventListener('click', (e) => {
    const replyBtn = e.target.closest('.reply-btn');
    if (replyBtn) {
      const commentForm = document.getElementById('commentForm');
      if (!commentForm) return;
      activeReplyTarget = { commentId: replyBtn.dataset.commentId, username: replyBtn.dataset.username };
      updateReplyIndicator();
      const input = commentForm.querySelector('input[name="comment"]');
      if (input) input.focus();
      return;
    }
    const cancelBtn = e.target.closest('#cancelReplyBtn');
    if (cancelBtn) {
      activeReplyTarget = null;
      updateReplyIndicator();
    }
  });
}

// --------------------------------------------------------------------------
// Collaborators strip (accepted collaborators + owner removal)
// --------------------------------------------------------------------------
function renderCollaboratorChip(c, projectId, isOwner) {
  const avatar = c.avatar_url ? `<img src="${c.avatar_url}">` : (c.name ? c.name[0].toUpperCase() : 'V');
  return `
    <div class="collaborator-chip" data-request-id="${c.request_id}">
      <div class="avatar">${avatar}</div>
      <span>${escapeHtml(c.name)}${renderReputationBadge(c.reputation)}</span>
      ${isOwner ? `<button type="button" class="remove-collaborator-btn" data-project-id="${projectId}" data-request-id="${c.request_id}" title="Remove collaborator">&times;</button>` : ''}
    </div>
  `;
}

function initCollaboratorRemoval() {
  document.body.addEventListener('click', (e) => {
    const btn = e.target.closest('.remove-collaborator-btn');
    if (!btn) return;
    if (!confirm('Remove this collaborator from the project?')) return;

    const projectId = btn.dataset.projectId;
    const requestId = btn.dataset.requestId;
    fetch(`/api/project/${projectId}/collaborators/${requestId}/remove`, { method: 'POST' })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          alert(data.error);
          return;
        }
        const chip = btn.closest('.collaborator-chip');
        if (chip) chip.remove();
      });
  });
}

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// --------------------------------------------------------------------------
// Lightweight markdown-ish renderer shared by the VISION AI panel and chat
// message bubbles. Handles headings, bold/italic/inline code, bullet and
// numbered lists, and pipe tables — anything else falls back to plain
// paragraphs so odd input never breaks the layout. Always escapes text
// first, so this is safe to use on user- or model-generated content alike.
// --------------------------------------------------------------------------
function renderMarkdownLite(raw) {
  if (!raw) return '';
  const text = String(raw).replace(/\r\n/g, '\n');
  const lines = text.split('\n');

  const inlineMd = (s) => {
    let out = escapeHtml(s);
    out = out.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    out = out.replace(/(^|[^*])\*([^*\s][^*]*?)\*(?!\*)/g, '$1<em>$2</em>');
    out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
    out = out.replace(/@VISIONAI\b/gi, '<span class="mention-tag">@VISIONAI</span>');
    return out;
  };

  let html = '';
  let inList = null; // 'ul' | 'ol'
  let tableRows = [];

  const closeList = () => {
    if (inList) { html += `</${inList}>`; inList = null; }
  };

  const flushTable = () => {
    if (!tableRows.length) return;
    const parseRow = (l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
    const isSeparator = (l) => /^[\s|:\-]+$/.test(l) && l.includes('-');
    if (tableRows.length > 1 && isSeparator(tableRows[1])) {
      const head = parseRow(tableRows[0]);
      const body = tableRows.slice(2).map(parseRow);
      html += '<table class="md-table"><thead><tr>'
        + head.map((h) => `<th>${inlineMd(h)}</th>`).join('')
        + '</tr></thead><tbody>'
        + body.map((r) => '<tr>' + r.map((c) => `<td>${inlineMd(c)}</td>`).join('') + '</tr>').join('')
        + '</tbody></table>';
    } else {
      tableRows.forEach((l) => { html += `<p>${inlineMd(l)}</p>`; });
    }
    tableRows = [];
  };

  for (const line of lines) {
    if (/^\s*\|.*\|\s*$/.test(line)) {
      tableRows.push(line);
      continue;
    }
    if (tableRows.length) flushTable();

    if (!line.trim()) { closeList(); continue; }

    const heading = line.match(/^\s{0,3}(#{1,4})\s+(.*)$/);
    if (heading) { closeList(); html += `<h5>${inlineMd(heading[2])}</h5>`; continue; }

    const ordered = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (ordered) {
      if (inList !== 'ol') { closeList(); html += '<ol>'; inList = 'ol'; }
      html += `<li>${inlineMd(ordered[1])}</li>`;
      continue;
    }

    const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
    if (bullet) {
      if (inList !== 'ul') { closeList(); html += '<ul>'; inList = 'ul'; }
      html += `<li>${inlineMd(bullet[1])}</li>`;
      continue;
    }

    closeList();
    html += `<p>${inlineMd(line)}</p>`;
  }
  closeList();
  if (tableRows.length) flushTable();

  return html || `<p>${inlineMd(text)}</p>`;
}

// --------------------------------------------------------------------------
// Settings modal open/close (sidebar + mobile bottom nav)
// --------------------------------------------------------------------------
function initSidebarSettings() {
  const openLink = document.getElementById('openSettingsLink');
  const mobileBtn = document.getElementById('mobileSettingsBtn');
  const profileBtn = document.getElementById('openSettingsLinkProfile');
  const modal = document.getElementById('settingsModal');
  const closeBtn = document.getElementById('closeSettingsModal');
  if (!modal) return;

  [openLink, mobileBtn, profileBtn].forEach((el) => {
    if (!el) return;
    el.addEventListener('click', (e) => {
      e.preventDefault();
      modal.classList.add('open');
    });
  });

  if (closeBtn) closeBtn.addEventListener('click', () => modal.classList.remove('open'));
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.remove('open'); });
}

// --------------------------------------------------------------------------
// Create / Edit project modal
// --------------------------------------------------------------------------
function initProjectFormModal() {
  const modal = document.getElementById('projectFormModal');
  if (!modal) return;

  const openBtn = document.getElementById('openCreateProject');
  const mobileCreateBtn = document.getElementById('mobileCreateBtn');
  const closeBtn = document.getElementById('closeProjectFormModal');
  const form = document.getElementById('projectForm');
  const title = document.getElementById('projectFormTitle');

  const openForCreate = (e) => {
    if (e) e.preventDefault();
    form.reset();
    form.action = form.dataset.createUrl || form.getAttribute('action');
    title.textContent = 'Create Project';
    document.querySelectorAll('#projectForm .preview-strip').forEach((s) => (s.innerHTML = ''));
    const superchargeResult = document.getElementById('superchargeResult');
    if (superchargeResult) { superchargeResult.style.display = 'none'; superchargeResult.innerHTML = ''; }
    updateSoftwareFieldsVisibility(form);
    updateVisibilityFieldsState(form, { isEdit: false });
    modal.classList.add('open');
  };

  if (openBtn) openBtn.addEventListener('click', openForCreate);
  if (mobileCreateBtn) mobileCreateBtn.addEventListener('click', openForCreate);
  if (closeBtn) closeBtn.addEventListener('click', () => modal.classList.remove('open'));
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.remove('open'); });

  if (form.category) {
    form.category.addEventListener('change', () => updateSoftwareFieldsVisibility(form));
  }
  form.querySelectorAll('input[name="visibility"]').forEach((radio) => {
    radio.addEventListener('change', () => updateVisibilityFieldsState(form));
  });

  // Remember the original create action so we can restore it after editing
  if (form && !form.dataset.createUrl) {
    form.dataset.createUrl = form.getAttribute('action');
  }

  initSuperchargePitch(form);
}

function initSuperchargePitch(form) {
  const btn = document.getElementById('superchargePitchBtn');
  const resultEl = document.getElementById('superchargeResult');
  if (!btn || !form) return;

  btn.addEventListener('click', () => {
    const payload = {
      action: 'supercharge_pitch',
      project_name: form.project_name.value,
      category: form.category ? form.category.value : '',
      overview: form.overview.value,
      problem: form.problem.value,
      solution: form.solution.value,
    };

    btn.disabled = true;
    const originalLabel = btn.innerHTML;
    btn.innerHTML = 'Supercharging...';
    if (resultEl) { resultEl.style.display = 'none'; resultEl.innerHTML = ''; }

    fetch('/api/vision-ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
      .then((r) => r.json().then((data) => ({ ok: r.ok, data })))
      .then(({ ok, data }) => {
        btn.disabled = false;
        btn.innerHTML = originalLabel;

        if (!ok || data.error) {
          if (resultEl) {
            resultEl.style.display = 'block';
            resultEl.innerHTML = `<p class="supercharge-error">${escapeHtml(data.error || "Couldn't supercharge that — try again.")}</p>`;
          }
          return;
        }

        const result = data.result || {};
        if (result.overview) form.overview.value = result.overview;
        if (result.problem) form.problem.value = result.problem;
        if (result.solution) form.solution.value = result.solution;

        if (resultEl) {
          resultEl.style.display = 'block';
          resultEl.innerHTML = `
            ${result.tagline ? `<div class="supercharge-tagline">✨ "${escapeHtml(result.tagline)}"</div>` : ''}
            <p class="supercharge-applied">Applied to your overview, problem, and solution. Click the button again to regenerate.</p>
            ${result.honesty_note ? `<p class="supercharge-honesty">${escapeHtml(result.honesty_note)}</p>` : ''}
          `;
        }
      })
      .catch(() => {
        btn.disabled = false;
        btn.innerHTML = originalLabel;
        if (resultEl) {
          resultEl.style.display = 'block';
          resultEl.innerHTML = `<p class="supercharge-error">Network error — please try again.</p>`;
        }
      });
  });
}

function updateSoftwareFieldsVisibility(form) {
  const section = document.getElementById('softwareOnlyFields');
  if (!section || !form.category) return;
  section.style.display = form.category.value === 'software' ? 'block' : 'none';
}

function updateVisibilityFieldsState(form, { isEdit = false, hasExistingPassword = false } = {}) {
  const passwordField = document.getElementById('viewPasswordField');
  const hint = document.getElementById('viewPasswordHint');
  const isPrivate = form.querySelector('input[name="visibility"]:checked')?.value === 'private';
  if (!passwordField) return;
  passwordField.style.display = isPrivate ? 'block' : 'none';
  if (hint) hint.style.display = (isPrivate && isEdit && hasExistingPassword) ? 'block' : 'none';
}

function openEditProject(projectId) {
  const modal = document.getElementById('projectFormModal');
  const form = document.getElementById('projectForm');
  const title = document.getElementById('projectFormTitle');
  if (!modal || !form) return;

  const superchargeResult = document.getElementById('superchargeResult');
  if (superchargeResult) { superchargeResult.style.display = 'none'; superchargeResult.innerHTML = ''; }

  fetch(`/api/project/${projectId}`)
    .then((r) => r.json())
    .then((p) => {
      form.action = `/dashboard/builder/project/${projectId}/edit`;
      title.textContent = 'Edit Project';

      form.category.value = p.category || 'software';
      form.stage.value = p.stage || 'Idea';
      form.project_name.value = p.project_name || '';
      form.overview.value = p.overview || '';
      form.inspiration.value = p.inspiration || '';
      form.problem.value = p.problem || '';
      form.solution.value = p.solution || '';
      if (form.repo_url) form.repo_url.value = p.repo_url || '';
      if (form.live_url) form.live_url.value = p.live_url || '';
      if (form.challenges) form.challenges.value = p.challenges || '';
      if (form.next_steps) form.next_steps.value = p.next_steps || '';
      form.investment_open.checked = !!p.investment_open;
      form.collaboration_open.checked = !!p.collaboration_open;
      form.sale_open.checked = !!p.sale_open;
      form.team_open.checked = !!p.team_open;
      if (form.max_collaborators) form.max_collaborators.value = p.max_collaborators || 5;

      const visibilityRadio = form.querySelector(`input[name="visibility"][value="${p.is_private ? 'private' : 'public'}"]`);
      if (visibilityRadio) visibilityRadio.checked = true;
      if (form.view_password) form.view_password.value = '';

      const audienceRoles = (p.visible_to_roles && p.visible_to_roles.length) ? p.visible_to_roles : ['builder', 'investor', 'company'];
      form.querySelectorAll('input[name="audience"]').forEach((cb) => {
        cb.checked = audienceRoles.includes(cb.value);
      });

      updateSoftwareFieldsVisibility(form);
      updateVisibilityFieldsState(form, { isEdit: true, hasExistingPassword: !!p.is_private });

      form.querySelectorAll('.mock-toggle-row').forEach((row) => {
        const checkbox = row.querySelector('.toggle-input');
        const visual = row.querySelector('.js-toggle');
        if (checkbox && visual) visual.classList.toggle('on', checkbox.checked);
      });

      modal.classList.add('open');
    });
}

// --------------------------------------------------------------------------
// Collaboration: apply-to-collaborate modal
// --------------------------------------------------------------------------
function initCollaborationModal() {
  const modal = document.getElementById('collaborationModal');
  const form = document.getElementById('collaborationForm');
  const closeBtn = document.getElementById('closeCollaborationModal');
  const errorBox = document.getElementById('collaborationFormError');
  if (!modal || !form) return;

  document.body.addEventListener('click', (e) => {
    const btn = e.target.closest('.apply-collab-btn');
    if (!btn) return;
    form.reset();
    form.dataset.projectId = btn.dataset.projectId;
    if (errorBox) { errorBox.style.display = 'none'; errorBox.textContent = ''; }
    modal.classList.add('open');
  });

  if (closeBtn) closeBtn.addEventListener('click', () => modal.classList.remove('open'));
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.remove('open'); });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const projectId = form.dataset.projectId;
    if (!projectId) return;

    const fd = new FormData(form);
    fetch(`/api/project/${projectId}/collaborate`, { method: 'POST', body: fd })
      .then((r) => r.json().then((data) => ({ ok: r.ok, data })))
      .then(({ ok, data }) => {
        if (!ok) {
          if (errorBox) {
            errorBox.textContent = data.error || 'Something went wrong.';
            errorBox.style.display = 'block';
          }
          return;
        }
        modal.classList.remove('open');
        const btn = document.querySelector(`.apply-collab-btn[data-project-id="${projectId}"]`);
        if (btn) {
          const chip = document.createElement('span');
          chip.className = 'chip';
          chip.style.cssText = 'width:100%; text-align:center;';
          chip.textContent = 'Application pending';
          btn.replaceWith(chip);
        }
      })
      .catch(() => {
        if (errorBox) {
          errorBox.textContent = 'Network error — please try again.';
          errorBox.style.display = 'block';
        }
      });
  });
}

// --------------------------------------------------------------------------
// "Message" buttons on collaboration request cards
// --------------------------------------------------------------------------
function initMessageApplicantButtons() {
  document.body.addEventListener('click', (e) => {
    const btn = e.target.closest('.message-applicant-btn, .message-profile-btn');
    if (!btn) return;
    const userId = btn.dataset.userId;
    if (!userId) return;

    fetch(`/api/conversations/start/${userId}`, { method: 'POST' })
      .then((r) => r.json())
      .then((data) => {
        if (data.conversation_id) {
          window.location.href = `/messages?conversation_id=${data.conversation_id}`;
        }
      });
  });
}

// --------------------------------------------------------------------------
// Team chat buttons (project card + project modal) -> jump into group chat
// --------------------------------------------------------------------------
function initTeamChatButtons() {
  document.body.addEventListener('click', (e) => {
    const btn = e.target.closest('.open-team-chat-btn');
    if (!btn) return;
    const conversationId = btn.dataset.conversationId;
    if (conversationId) {
      window.location.href = `/messages?conversation_id=${conversationId}`;
    }
  });
}

// --------------------------------------------------------------------------
// Messages page
// --------------------------------------------------------------------------

// Small inline icon set for message ticks / edit affordance — stroke
// currentColor so they pick up whatever color the surrounding CSS sets.
const MSG_TICK_SINGLE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
const MSG_TICK_DOUBLE = '<svg viewBox="0 0 28 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 6 6.5 17 2 12.5"/><polyline points="24 6 13.5 17 11 14.5"/></svg>';
const MSG_EDIT_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';
const MSG_TRASH_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';
const MSG_CHECK_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
const MSG_X_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
const MSG_REPLY_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>';
const MSG_SMILE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>';
const MSG_STAR_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>';
const MSG_STAR_ICON_FILLED = '<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>';
const MSG_FORWARD_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 17 20 12 15 7"/><path d="M4 18v-2a4 4 0 0 1 4-4h12"/></svg>';
const MSG_FILE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/></svg>';
const MSG_DOWNLOAD_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';
const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

// Icons for each team "function" — reused in the group sender label and
// the Group Info panel. Keys match member_function()'s `key` in app.py.
const FUNCTION_ICONS = {
  frontend: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>',
  backend: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"/><rect x="2" y="14" width="20" height="8" rx="2" ry="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg>',
  hardware: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/><line x1="20" y1="9" x2="23" y2="9"/><line x1="20" y1="14" x2="23" y2="14"/><line x1="1" y1="9" x2="4" y2="9"/><line x1="1" y1="14" x2="4" y2="14"/></svg>',
  design: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/><path d="M2 2l7.586 7.586"/><circle cx="11" cy="11" r="2"/></svg>',
  data: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>',
  product: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg>',
  investor: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>',
  company: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>',
  builder: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>',
};
function functionIcon(key) {
  return FUNCTION_ICONS[key] || FUNCTION_ICONS.builder;
}

// Same as escapeHtml, but also escapes quotes so the result is safe to drop
// straight into an HTML attribute (used to stash each bubble's raw text for
// the edit box, since the DOM only otherwise holds the rendered markdown).
function escapeAttr(str) {
  return escapeHtml(str).replace(/"/g, '&quot;');
}

function formatMessageTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  let h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${m} ${ampm}`;
}

function attachmentHtml(att) {
  if (!att) return '';
  if (att.kind === 'image') {
    return `<a href="${att.url}" target="_blank" rel="noopener" class="message-attachment-image"><img src="${att.url}" alt="${escapeAttr(att.original_name || '')}" loading="lazy"></a>`;
  }
  return `
    <a href="${att.url}" target="_blank" rel="noopener" class="message-attachment-file">
      ${MSG_FILE_ICON}
      <span class="message-attachment-name">${escapeHtml(att.original_name || 'File')}</span>
      <span class="message-attachment-download">${MSG_DOWNLOAD_ICON}</span>
    </a>`;
}

function replyQuoteHtml(replyTo) {
  if (!replyTo) return '';
  const snippet = replyTo.is_deleted ? 'This message was deleted.' : (replyTo.content || '').slice(0, 140);
  return `
    <div class="message-reply-quote" data-jump-to-message="${replyTo.id}">
      <span class="message-reply-quote-name">${escapeHtml(replyTo.sender_name || '')}</span>
      <span class="message-reply-quote-text">${escapeHtml(snippet)}</span>
    </div>`;
}

function reactionsHtml(reactions) {
  if (!reactions || !reactions.length) return '';
  return `
    <div class="message-reactions">
      ${reactions.map((r) => `
        <button type="button" class="message-reaction-pill${r.reacted_by_me ? ' mine' : ''}" data-react-emoji="${r.emoji}" title="${r.count} reacted">
          ${r.emoji} <span>${r.count}</span>
        </button>`).join('')}
    </div>`;
}

function messageBubbleInnerHtml(m, isGroup) {
  const isVai = !!m.is_vision_ai;
  const isDeleted = !!m.is_deleted;
  const showLabel = (isGroup || isVai) && !m.is_mine;
  const time = formatMessageTime(m.created_at);
  const isEdited = !!m.edited_at && !isDeleted;
  const editable = m.is_mine && !isVai && !isDeleted;
  const reactable = !isVai && !isDeleted;

  let tick = '';
  if (m.is_mine && !isVai) {
    tick = `<span class="message-tick${m.is_read ? ' read' : ''}">${m.is_read ? MSG_TICK_DOUBLE : MSG_TICK_SINGLE}</span>`;
  }

  const actions = reactable ? `
    <div class="message-actions">
      <button type="button" class="message-action-btn" data-react-message="${m.id}" title="React">${MSG_SMILE_ICON}</button>
      <button type="button" class="message-action-btn" data-reply-message="${m.id}" title="Reply">${MSG_REPLY_ICON}</button>
      <button type="button" class="message-action-btn" data-forward-message="${m.id}" title="Forward">${MSG_FORWARD_ICON}</button>
      <button type="button" class="message-action-btn${m.is_starred ? ' active' : ''}" data-star-message="${m.id}" title="${m.is_starred ? 'Unstar' : 'Star'}">${m.is_starred ? MSG_STAR_ICON_FILLED : MSG_STAR_ICON}</button>
      ${editable ? `<button type="button" class="message-action-btn" data-edit-message="${m.id}" title="Edit message">${MSG_EDIT_ICON}</button>` : ''}
      ${editable ? `<button type="button" class="message-action-btn" data-delete-message="${m.id}" title="Delete message">${MSG_TRASH_ICON}</button>` : ''}
    </div>` : '';

  const contentHtml = isDeleted
    ? '<p class="message-deleted-text">This message was deleted.</p>'
    : renderMarkdownLite(m.content);

  return `
    ${showLabel ? `
      <div class="message-sender-label${isVai ? ' vision-ai-sender-label' : ''}">
        ${isVai ? '<span class="vision-ai-sender-icon">✦</span>' : ''}${escapeHtml(m.sender_name || '')}
      </div>
      ${!isVai && m.sender_function ? `
        <div class="message-sender-function">
          <span class="message-sender-function-icon">${functionIcon(m.sender_function.key)}</span>
          ${escapeHtml(m.sender_function.label)}
        </div>` : ''}` : ''}
    ${actions}
    ${!isDeleted && m.is_forwarded ? '<div class="message-forwarded-tag">' + MSG_FORWARD_ICON + ' Forwarded</div>' : ''}
    ${!isDeleted ? replyQuoteHtml(m.reply_to) : ''}
    ${!isDeleted ? attachmentHtml(m.attachment) : ''}
    <div class="message-bubble-content" data-message-content>${contentHtml}</div>
    ${!isDeleted ? reactionsHtml(m.reactions) : ''}
    <div class="message-bubble-meta">
      ${isEdited ? '<span class="message-edited-tag">edited</span>' : ''}
      <span class="message-time">${time}</span>
      ${tick}
    </div>
  `;
}

function messageRowHtml(m, isGroup, opts) {
  opts = opts || {};
  const isVai = !!m.is_vision_ai;
  const isSent = !!m.is_mine;
  const rowClasses = ['message-row', isSent ? 'sent' : 'received'];
  if (opts.grouped) rowClasses.push('grouped');

  let avatarHtml = '';
  if (!isSent && (isGroup || isVai)) {
    if (opts.showAvatar) {
      const initial = escapeHtml(((m.sender_name || 'V')[0] || 'V').toUpperCase());
      avatarHtml = m.sender_avatar_url
        ? `<div class="message-avatar"><img src="${m.sender_avatar_url}" alt=""></div>`
        : `<div class="message-avatar">${initial}</div>`;
    } else {
      avatarHtml = '<div class="message-avatar-spacer"></div>';
    }
  }

  const bubbleClasses = ['message-bubble', isSent ? 'sent' : 'received'];
  if (isVai) bubbleClasses.push('vision-ai-authored');

  return `
    <div class="${rowClasses.join(' ')}" data-message-row="${m.id}" data-sender-id="${m.sender_id}" data-sender-name="${escapeAttr(m.sender_name || (m.is_mine ? 'You' : ''))}" data-is-vai="${isVai ? '1' : ''}" data-is-deleted="${m.is_deleted ? '1' : ''}" data-raw-content="${escapeAttr(m.content)}">
      ${avatarHtml}
      <div class="${bubbleClasses.join(' ')}">${messageBubbleInnerHtml(m, isGroup)}</div>
    </div>
  `;
}

// Groups consecutive messages from the same sender (WhatsApp-style): the
// avatar/name label only appears on the last bubble of a run, and runs sit
// slightly closer together than separate senders do.
function buildMessagesHtml(messages, isGroup, seenBy) {
  const rows = messages.map((m, i) => {
    const isVai = !!m.is_vision_ai;
    const next = messages[i + 1];
    const prev = messages[i - 1];
    const sameAsNext = !!next && next.sender_id === m.sender_id && !!next.is_vision_ai === isVai;
    const sameAsPrev = !!prev && prev.sender_id === m.sender_id && !!prev.is_vision_ai === isVai;
    return messageRowHtml(m, isGroup, { showAvatar: !sameAsNext, grouped: sameAsPrev });
  }).join('');

  if (isGroup && seenBy && seenBy.length && messages.length) {
    const label = seenBy.length > 2
      ? `Seen by ${seenBy.slice(0, 2).join(', ')} and ${seenBy.length - 2} other${seenBy.length - 2 > 1 ? 's' : ''}`
      : `Seen by ${seenBy.join(' and ')}`;
    return rows + `<div class="message-seen-by">${escapeHtml(label)}</div>`;
  }
  return rows;
}

function initMessagesPage() {
  const shell = document.getElementById('messagesShell');
  if (!shell) return;

  const list = document.getElementById('conversationList');
  const emptyState = document.getElementById('conversationEmptyState');
  const activePanel = document.getElementById('conversationActive');
  const bubbles = document.getElementById('messageBubbles');
  const form = document.getElementById('messageForm');
  const input = document.getElementById('messageInput');
  const blockBtn = document.getElementById('convoBlockBtn');
  const blockedBanner = document.getElementById('convoBlockedBanner');

  const replyPreviewRow = document.getElementById('replyPreviewRow');
  const replyPreviewName = document.getElementById('replyPreviewName');
  const replyPreviewText = document.getElementById('replyPreviewText');
  const attachmentPreviewRow = document.getElementById('attachmentPreviewRow');
  const attachmentPreviewThumb = document.getElementById('attachmentPreviewThumb');
  const attachmentPreviewName = document.getElementById('attachmentPreviewName');
  const attachBtn = document.getElementById('attachBtn');
  const attachmentInput = document.getElementById('attachmentInput');
  const typingIndicatorRow = document.getElementById('typingIndicatorRow');
  const searchBtn = document.getElementById('convoSearchBtn');
  const searchRow = document.getElementById('convoSearchRow');
  const searchInput = document.getElementById('convoSearchInput');
  const searchClose = document.getElementById('convoSearchClose');
  const starredBtn = document.getElementById('convoStarredBtn');
  const groupInfoBtn = document.getElementById('convoGroupInfoBtn');

  let currentConversationId = shell.dataset.activeConversation || null;
  let currentIsGroup = false;
  let currentIsOwner = false;
  let currentOtherUserId = null;
  let currentMembers = [];
  let replyTarget = null;
  let pendingAttachment = null;
  let typingPollTimer = null;
  let lastTypingSentAt = 0;
  let messagePollTimer = null;
  let lastMessageId = 0;

  function chatToast(msg) {
    const t = document.createElement('div');
    t.className = 'flash success';
    t.style.position = 'fixed';
    t.style.bottom = '24px';
    t.style.right = '24px';
    t.style.zIndex = '999';
    t.innerHTML = `<span>${escapeHtml(msg)}</span>`;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3200);
  }

  // ---- Reply / quote ----
  function setReply(row) {
    if (!row) return;
    replyTarget = {
      id: row.dataset.messageRow,
      name: row.dataset.senderName || 'Message',
      text: row.dataset.isDeleted === '1' ? 'This message was deleted.' : (row.dataset.rawContent || ''),
    };
    if (replyPreviewRow) {
      replyPreviewRow.style.display = 'flex';
      replyPreviewName.textContent = replyTarget.name;
      replyPreviewText.textContent = replyTarget.text;
    }
    input.focus();
  }

  function clearReply() {
    replyTarget = null;
    if (replyPreviewRow) replyPreviewRow.style.display = 'none';
  }

  const replyPreviewCloseBtn = document.getElementById('replyPreviewClose');
  if (replyPreviewCloseBtn) replyPreviewCloseBtn.addEventListener('click', clearReply);

  function jumpToMessage(messageId) {
    const target = bubbles.querySelector(`[data-message-row="${messageId}"]`);
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    target.classList.add('jump-highlight');
    setTimeout(() => target.classList.remove('jump-highlight'), 1500);
  }

  // ---- Attachments ----
  function clearAttachment() {
    pendingAttachment = null;
    if (attachmentInput) attachmentInput.value = '';
    if (attachmentPreviewRow) attachmentPreviewRow.style.display = 'none';
  }

  if (attachBtn && attachmentInput) {
    attachBtn.addEventListener('click', () => attachmentInput.click());
    attachmentInput.addEventListener('change', () => {
      const file = attachmentInput.files && attachmentInput.files[0];
      if (!file) return;
      if (file.size > 15 * 1024 * 1024) {
        chatToast('That file is over 15MB — please choose a smaller one.');
        attachmentInput.value = '';
        return;
      }
      pendingAttachment = file;
      attachmentPreviewRow.style.display = 'flex';
      attachmentPreviewName.textContent = file.name;
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = () => { attachmentPreviewThumb.innerHTML = `<img src="${reader.result}">`; };
        reader.readAsDataURL(file);
      } else {
        attachmentPreviewThumb.innerHTML = MSG_FILE_ICON;
      }
    });
  }
  const attachmentPreviewCloseBtn = document.getElementById('attachmentPreviewClose');
  if (attachmentPreviewCloseBtn) attachmentPreviewCloseBtn.addEventListener('click', clearAttachment);

  // ---- Typing indicator ----
  function startTypingPoll() {
    if (typingPollTimer) clearInterval(typingPollTimer);
    typingPollTimer = setInterval(() => {
      if (!currentConversationId || document.hidden) return;
      fetch(`/api/conversations/${currentConversationId}/typing`)
        .then((r) => r.json())
        .then((data) => {
          const names = data.typing || [];
          if (!typingIndicatorRow) return;
          if (!names.length) {
            typingIndicatorRow.style.display = 'none';
            return;
          }
          const label = names.length > 1 ? `${names.join(', ')} are typing` : `${names[0]} is typing`;
          typingIndicatorRow.style.display = 'flex';
          typingIndicatorRow.innerHTML = `${escapeHtml(label)}<span class="typing-indicator-dots"><span></span><span></span><span></span></span>`;
        })
        .catch(() => {});
    }, 2000);
  }

  if (input) {
    input.addEventListener('input', () => {
      if (!currentConversationId) return;
      const now = Date.now();
      if (now - lastTypingSentAt > 2000) {
        lastTypingSentAt = now;
        fetch(`/api/conversations/${currentConversationId}/typing`, { method: 'POST' }).catch(() => {});
      }
    });
  }

  // ---- Search within conversation ----
  function clearSearchHighlights() {
    bubbles.querySelectorAll('.message-row').forEach((row) => {
      row.classList.remove('search-hidden', 'search-match');
    });
  }

  if (searchBtn && searchRow) {
    searchBtn.addEventListener('click', () => {
      const opening = searchRow.style.display === 'none';
      searchRow.style.display = opening ? 'flex' : 'none';
      if (opening) { searchInput.focus(); } else { searchInput.value = ''; clearSearchHighlights(); }
    });
  }
  if (searchClose) {
    searchClose.addEventListener('click', () => {
      searchRow.style.display = 'none';
      searchInput.value = '';
      clearSearchHighlights();
    });
  }
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      const q = searchInput.value.trim().toLowerCase();
      const rows = bubbles.querySelectorAll('.message-row');
      if (!q) { clearSearchHighlights(); return; }
      rows.forEach((row) => {
        const matches = (row.dataset.rawContent || '').toLowerCase().includes(q);
        row.classList.toggle('search-hidden', !matches);
        row.classList.toggle('search-match', matches);
      });
    });
  }

  // ---- Emoji reaction picker ----
  let emojiPopover = null;
  function closeEmojiPopover() {
    if (emojiPopover) { emojiPopover.remove(); emojiPopover = null; }
  }
  function openEmojiPopover(anchorBtn, messageId) {
    closeEmojiPopover();
    const rect = anchorBtn.getBoundingClientRect();
    emojiPopover = document.createElement('div');
    emojiPopover.className = 'emoji-picker-popover';
    emojiPopover.style.top = `${Math.max(8, rect.top - 46)}px`;
    emojiPopover.style.left = `${Math.max(8, rect.left - 90)}px`;
    emojiPopover.innerHTML = QUICK_REACTIONS.map((e) => `<button type="button" data-pick-emoji="${e}">${e}</button>`).join('');
    document.body.appendChild(emojiPopover);
    emojiPopover.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-pick-emoji]');
      if (btn) sendReaction(messageId, btn.dataset.pickEmoji);
      closeEmojiPopover();
    });
    setTimeout(() => {
      document.addEventListener('click', function onDoc(ev) {
        if (emojiPopover && !emojiPopover.contains(ev.target)) { closeEmojiPopover(); }
        document.removeEventListener('click', onDoc);
      });
    }, 0);
  }

  function sendReaction(messageId, emoji) {
    fetch(`/api/conversations/${currentConversationId}/messages/${messageId}/react`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ emoji }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) return;
        const row = bubbles.querySelector(`[data-message-row="${messageId}"]`);
        if (!row) return;
        let reactionsEl = row.querySelector('.message-reactions');
        const html = reactionsHtml(data.reactions);
        if (reactionsEl) {
          if (html) reactionsEl.outerHTML = html; else reactionsEl.remove();
        } else if (html) {
          const contentEl = row.querySelector('[data-message-content]');
          if (contentEl) contentEl.insertAdjacentHTML('afterend', html);
        }
      })
      .catch(() => {});
  }

  // ---- Star ----
  function toggleStar(messageId, btn) {
    fetch(`/api/conversations/${currentConversationId}/messages/${messageId}/star`, { method: 'POST' })
      .then((r) => r.json())
      .then((data) => {
        if (typeof data.starred === 'undefined') return;
        btn.classList.toggle('active', data.starred);
        btn.title = data.starred ? 'Unstar' : 'Star';
        btn.innerHTML = data.starred ? MSG_STAR_ICON_FILLED : MSG_STAR_ICON;
      })
      .catch(() => {});
  }

  // ---- Forward ----
  function openForwardModal(messageId) {
    const overlay = document.createElement('div');
    overlay.className = 'forward-modal-overlay';
    overlay.innerHTML = `
      <div class="forward-modal">
        <div class="chat-panel-head"><h3>Forward message</h3><button class="chat-panel-close" id="fwdClose">&times;</button></div>
        <div id="fwdList"><p class="forward-empty">Loading conversations…</p></div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('#fwdClose').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

    fetch('/api/conversations')
      .then((r) => r.json())
      .then((conversations) => {
        const listEl = overlay.querySelector('#fwdList');
        const targets = (conversations || []).filter((c) => String(c.id) !== String(currentConversationId));
        if (!targets.length) {
          listEl.innerHTML = '<p class="forward-empty">No other conversations to forward to.</p>';
          return;
        }
        listEl.innerHTML = targets.map((c) => {
          const name = c.is_group ? c.title : (c.other_user ? c.other_user.name : 'Conversation');
          return `<div class="forward-target-row" data-target-id="${c.id}"><div class="group-member-avatar">${escapeHtml((name || 'V')[0].toUpperCase())}</div><span>${escapeHtml(name || '')}</span></div>`;
        }).join('');
        listEl.querySelectorAll('.forward-target-row').forEach((row) => {
          row.addEventListener('click', () => {
            fetch(`/api/conversations/${currentConversationId}/messages/${messageId}/forward`, {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ conversation_id: row.dataset.targetId }),
            })
              .then((r) => r.json())
              .then((data) => {
                overlay.remove();
                if (data.error) { chatToast(data.error); return; }
                chatToast('Message forwarded.');
              })
              .catch(() => overlay.remove());
          });
        });
      })
      .catch(() => { overlay.querySelector('#fwdList').innerHTML = '<p class="forward-empty">Couldn\'t load conversations.</p>'; });
  }

  // ---- Group info panel ----
  function groupMemberRowHtml(m) {
    return `
      <div class="group-member-row" data-member-id="${m.id}">
        <div class="group-member-avatar">${m.avatar_url ? `<img src="${m.avatar_url}">` : escapeHtml((m.name || 'V')[0].toUpperCase())}</div>
        <div style="flex:1; min-width:0;">
          <div class="group-member-name">${escapeHtml(m.name || '')}${m.is_owner ? '<span class="group-owner-tag">Leader</span>' : ''}</div>
          ${m.function ? `<div class="group-member-function"><span class="group-member-function-icon">${functionIcon(m.function.key)}</span>${escapeHtml(m.function.label)}</div>` : ''}
        </div>
        ${(currentIsOwner && !m.is_owner) ? `<button type="button" class="group-member-remove-btn" data-remove-member="${m.id}" title="Remove from group">${MSG_X_ICON}</button>` : ''}
      </div>`;
  }

  if (groupInfoBtn) {
    groupInfoBtn.addEventListener('click', () => {
      const overlay = document.createElement('div');
      overlay.className = 'chat-panel-overlay';
      overlay.innerHTML = `
        <div class="chat-side-panel">
          <div class="chat-panel-head"><h3>Group info</h3><button class="chat-panel-close" id="giClose">&times;</button></div>
          ${currentIsOwner ? `
            <div class="group-add-member-row">
              <input type="text" id="giAddMemberInput" placeholder="Add a member by name or username…" autocomplete="off">
              <div id="giAddMemberResults" class="group-add-member-results"></div>
            </div>` : ''}
          <div id="giMemberList">${currentMembers.map(groupMemberRowHtml).join('')}</div>
        </div>`;
      document.body.appendChild(overlay);
      overlay.querySelector('#giClose').addEventListener('click', () => overlay.remove());
      overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

      const memberListEl = overlay.querySelector('#giMemberList');
      memberListEl.addEventListener('click', (e) => {
        const removeBtn = e.target.closest('[data-remove-member]');
        if (!removeBtn) return;
        const memberId = removeBtn.dataset.removeMember;
        const row = removeBtn.closest('.group-member-row');
        const name = row.querySelector('.group-member-name').textContent;
        if (!confirm(`Remove ${name} from the group?`)) return;
        fetch(`/api/conversations/${currentConversationId}/members/${memberId}`, { method: 'DELETE' })
          .then((r) => r.json())
          .then((data) => {
            if (data.error) { chatToast(data.error); return; }
            currentMembers = currentMembers.filter((m) => String(m.id) !== String(memberId));
            row.remove();
            chatToast(`${data.removed_name} removed from the group.`);
          })
          .catch(() => {});
      });

      const addInput = overlay.querySelector('#giAddMemberInput');
      const addResults = overlay.querySelector('#giAddMemberResults');
      if (addInput) {
        let searchTimer = null;
        addInput.addEventListener('input', () => {
          clearTimeout(searchTimer);
          const q = addInput.value.trim();
          if (q.length < 2) { addResults.innerHTML = ''; return; }
          searchTimer = setTimeout(() => {
            fetch(`/api/users/search?q=${encodeURIComponent(q)}`)
              .then((r) => r.json())
              .then((users) => {
                const already = new Set(currentMembers.map((m) => String(m.id)));
                const candidates = (users || []).filter((u) => !already.has(String(u.id)));
                addResults.innerHTML = candidates.length
                  ? candidates.map((u) => `
                      <div class="group-add-candidate" data-add-user-id="${u.id}">
                        <div class="group-member-avatar">${u.avatar_url ? `<img src="${u.avatar_url}">` : escapeHtml((u.name || 'V')[0].toUpperCase())}</div>
                        <span>${escapeHtml(u.name)}</span>
                        <span class="group-add-candidate-role">${escapeHtml(u.role || '')}</span>
                      </div>`).join('')
                  : '<p class="starred-empty">No matching users.</p>';
              })
              .catch(() => {});
          }, 300);
        });
        addResults.addEventListener('click', (e) => {
          const candidate = e.target.closest('[data-add-user-id]');
          if (!candidate) return;
          const userId = candidate.dataset.addUserId;
          fetch(`/api/conversations/${currentConversationId}/members`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: userId }),
          })
            .then((r) => r.json())
            .then((data) => {
              if (data.error) { chatToast(data.error); return; }
              currentMembers.push(data.member);
              memberListEl.insertAdjacentHTML('beforeend', groupMemberRowHtml(data.member));
              addInput.value = '';
              addResults.innerHTML = '';
              chatToast(`${data.member.name} added to the group.`);
            })
            .catch(() => {});
        });
      }
    });
  }

  // ---- Starred messages panel (scoped to the open conversation) ----
  if (starredBtn) {
    starredBtn.addEventListener('click', () => {
      if (!currentConversationId) return;
      const overlay = document.createElement('div');
      overlay.className = 'chat-panel-overlay';
      overlay.innerHTML = `
        <div class="chat-side-panel">
          <div class="chat-panel-head"><h3>Starred messages</h3><button class="chat-panel-close" id="stClose">&times;</button></div>
          <div id="stList"><p class="starred-empty">Loading…</p></div>
        </div>`;
      document.body.appendChild(overlay);
      overlay.querySelector('#stClose').addEventListener('click', () => overlay.remove());
      overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

      fetch('/api/starred-messages')
        .then((r) => r.json())
        .then((data) => {
          const listEl = overlay.querySelector('#stList');
          const mine = (data.starred || []).filter((s) => String(s.conversation_id) === String(currentConversationId));
          if (!mine.length) {
            listEl.innerHTML = '<p class="starred-empty">No starred messages in this conversation yet.</p>';
            return;
          }
          listEl.innerHTML = mine.map((s) => `
            <div class="starred-item" data-jump-id="${s.message.id}">
              <div class="starred-convo">${escapeHtml(s.message.sender_name || 'Message')}</div>
              <div class="starred-content">${escapeHtml((s.message.content || '').slice(0, 140))}</div>
            </div>`).join('');
          listEl.querySelectorAll('.starred-item').forEach((row) => {
            row.addEventListener('click', () => { overlay.remove(); jumpToMessage(row.dataset.jumpId); });
          });
        })
        .catch(() => { overlay.querySelector('#stList').innerHTML = '<p class="starred-empty">Couldn\'t load starred messages.</p>'; });
    });
  }

  function setComposerEnabled(enabled) {
    input.disabled = !enabled;
    const sendBtn = form.querySelector('button[type="submit"]');
    if (sendBtn) sendBtn.disabled = !enabled;
  }

  function updateBlockUi(otherUser) {
    if (!blockBtn || !blockedBanner) return; // defensive guard, both now exist in messages.html
    if (!otherUser) {
      blockBtn.style.display = 'none';
      blockedBanner.style.display = 'none';
      setComposerEnabled(true);
      return;
    }

    currentOtherUserId = otherUser.id;
    blockBtn.style.display = 'flex';
    blockBtn.classList.toggle('is-blocked', !!otherUser.is_blocked_by_me);
    blockBtn.title = otherUser.is_blocked_by_me ? 'Unblock this user' : 'Block this user';

    if (otherUser.is_blocked_by_me) {
      blockedBanner.style.display = 'flex';
      blockedBanner.innerHTML = `You blocked ${escapeHtml(otherUser.name || 'this user')}. <button type="button" class="convo-blocked-action" id="convoUnblockInline">Unblock</button>`;
      setComposerEnabled(false);
    } else if (otherUser.has_blocked_me) {
      blockedBanner.style.display = 'flex';
      blockedBanner.innerHTML = `You can't message ${escapeHtml(otherUser.name || 'this user')} right now.`;
      setComposerEnabled(false);
    } else {
      blockedBanner.style.display = 'none';
      setComposerEnabled(true);
    }
  }

  if (blockBtn) {
    blockBtn.addEventListener('click', () => toggleBlock(currentOtherUserId, blockBtn.classList.contains('is-blocked')));
  }
  if (blockedBanner) {
    blockedBanner.addEventListener('click', (e) => {
      if (e.target.closest('#convoUnblockInline')) toggleBlock(currentOtherUserId, true);
    });
  }

  function toggleBlock(userId, isCurrentlyBlocked) {
    if (!userId) return;
    fetch(`/api/users/${userId}/${isCurrentlyBlocked ? 'unblock' : 'block'}`, { method: 'POST' })
      .then((r) => r.json())
      .then(() => {
        if (currentConversationId) openConversation(currentConversationId);
      })
      .catch(() => {});
  }

  // ---- Live message polling ----
  // The initial GET already renders the full thread. From then on we only
  // ask the server for messages newer than the last one we've rendered
  // (?after_id=...), so an open conversation picks up what the other
  // person sends within ~2s without a manual refresh or re-fetching (and
  // re-scrolling) the whole thread every tick.
  function wasNearBottom() {
    return bubbles.scrollHeight - bubbles.scrollTop - bubbles.clientHeight < 120;
  }

  function appendIncomingMessages(newMessages, isGroup, seenBy) {
    if (!newMessages.length) return;
    const stickToBottom = wasNearBottom();

    const emptyMsg = bubbles.querySelector('p');
    if (bubbles.children.length === 1 && emptyMsg && !emptyMsg.closest('.message-row')) {
      bubbles.innerHTML = '';
    }
    // Drop the previous "Seen by ..." footer, if any — it'll be re-added
    // below the newly appended messages instead.
    const oldSeenBy = bubbles.querySelector('.message-seen-by');
    if (oldSeenBy) oldSeenBy.remove();

    newMessages.forEach((m) => {
      if (bubbles.querySelector(`[data-message-row="${m.id}"]`)) return; // already rendered (e.g. our own optimistic send)
      const lastRow = bubbles.querySelector('.message-row:last-child');
      const grouped = !!lastRow && lastRow.dataset.senderId === String(m.sender_id) && (lastRow.dataset.isVai === '1') === !!m.is_vision_ai;
      const wrap = document.createElement('div');
      wrap.innerHTML = messageRowHtml(m, isGroup, { showAvatar: !grouped, grouped });
      bubbles.appendChild(wrap.firstElementChild);
      lastMessageId = Math.max(lastMessageId, m.id);
    });

    if (isGroup && seenBy && seenBy.length) {
      const label = seenBy.length > 2
        ? `Seen by ${seenBy.slice(0, 2).join(', ')} and ${seenBy.length - 2} other${seenBy.length - 2 > 1 ? 's' : ''}`
        : `Seen by ${seenBy.join(' and ')}`;
      bubbles.insertAdjacentHTML('beforeend', `<div class="message-seen-by">${escapeHtml(label)}</div>`);
    }

    if (stickToBottom) bubbles.scrollTop = bubbles.scrollHeight;
  }

  function stopMessagePoll() {
    if (messagePollTimer) clearInterval(messagePollTimer);
    messagePollTimer = null;
  }

  function startMessagePoll() {
    stopMessagePoll();
    messagePollTimer = setInterval(() => {
      if (!currentConversationId || document.hidden) return;
      fetch(`/api/conversations/${currentConversationId}/messages?after_id=${lastMessageId}`)
        .then((r) => r.json())
        .then((data) => {
          if (!data || !data.messages) return;
          appendIncomingMessages(data.messages, currentIsGroup, data.last_message_seen_by);
        })
        .catch(() => {});
    }, 2000);
  }

  function openConversation(id) {
    currentConversationId = id;
    document.querySelectorAll('.conversation-item').forEach((item) => {
      item.classList.toggle('active', String(item.dataset.conversationId) === String(id));
    });

    clearReply();
    clearAttachment();
    if (searchRow) searchRow.style.display = 'none';
    if (searchInput) searchInput.value = '';
    clearSearchHighlights();

    fetch(`/api/conversations/${id}/messages`)
      .then((r) => r.json())
      .then((data) => {
        emptyState.style.display = 'none';
        activePanel.style.display = 'flex';
        activePanel.dataset.isGroup = data.is_group ? '1' : '';
        currentIsGroup = !!data.is_group;
        currentIsOwner = !!data.is_owner;
        currentMembers = data.members || [];

        if (groupInfoBtn) groupInfoBtn.style.display = data.is_group ? 'flex' : 'none';

        const avatarEl = document.getElementById('convoHeaderAvatar');
        const roleEl = document.getElementById('convoHeaderRole');
        const countryEl = document.getElementById('convoHeaderCountry');

        if (data.is_group) {
          avatarEl.className = 'avatar avatar-group';
          avatarEl.innerHTML = '👥';
          document.getElementById('convoHeaderName').textContent = data.title;
          roleEl.textContent = data.subtitle || '';
          countryEl.textContent = '';
          updateBlockUi(null);
        } else {
          avatarEl.className = 'avatar';
          avatarEl.innerHTML = data.other_user.avatar_url
            ? `<img src="${data.other_user.avatar_url}">`
            : escapeHtml((data.other_user.name || 'V')[0].toUpperCase());
          document.getElementById('convoHeaderName').textContent = data.other_user.name;
          roleEl.innerHTML = renderReputationBadge(data.other_user.reputation);
          countryEl.textContent = data.other_user.country || '';
          updateBlockUi(data.other_user);
        }

        bubbles.innerHTML = data.messages.length
          ? buildMessagesHtml(data.messages, data.is_group, data.last_message_seen_by)
          : '<p style="text-align:center; color:var(--muted); font-size:13px;">No messages yet. Say hello 👋 (tip: type @VISIONAI to bring the copilot into this chat)</p>';

        bubbles.scrollTop = bubbles.scrollHeight;
        lastMessageId = data.messages.length ? Math.max(...data.messages.map((m) => m.id)) : 0;

        const item = document.querySelector(`.conversation-item[data-conversation-id="${id}"] .unread-dot`);
        if (item) item.remove();

        if (window.DealRoom) window.DealRoom.onConversationOpened(id, data);
        startTypingPoll();
        startMessagePoll();
      });
  }

  if (list) {
    list.addEventListener('click', (e) => {
      const item = e.target.closest('.conversation-item');
      if (!item) return;
      openConversation(item.dataset.conversationId);
    });
  }

  // ---- Live conversation list (sidebar previews + unread dots) ----
  // The list itself is server-rendered on page load; this keeps each
  // existing row's preview text and unread indicator current without a
  // full page reload. Brand-new conversations (started elsewhere while
  // this tab is open) still need a reload to appear — everything else on
  // the list updates live.
  function refreshConversationListPreviews() {
    if (!list) return;
    fetch('/api/conversations')
      .then((r) => r.json())
      .then((conversations) => {
        (conversations || []).forEach((convo) => {
          const item = list.querySelector(`.conversation-item[data-conversation-id="${convo.id}"]`);
          if (!item) return; // new conversation — needs a page reload to appear, see note above

          const previewEl = item.querySelector('.conversation-preview');
          if (previewEl) {
            const fallback = convo.is_group ? 'Team chat — say hello 👋' : 'Say hello 👋';
            previewEl.textContent = convo.last_message || fallback;
          }

          const isOpenNow = String(convo.id) === String(currentConversationId);
          let dot = item.querySelector('.unread-dot');
          if (convo.unread_count && !isOpenNow) {
            if (!dot) {
              dot = document.createElement('span');
              dot.className = 'unread-dot';
              item.appendChild(dot);
            }
            dot.dataset.unreadCount = convo.unread_count;
          } else if (dot) {
            dot.remove();
          }
        });
      })
      .catch(() => {});
  }

  setInterval(() => {
    if (!document.hidden) refreshConversationListPreviews();
  }, 2000);

  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (!currentConversationId || (!text && !pendingAttachment)) return;

      const fd = new FormData();
      fd.append('content', text);
      if (replyTarget) fd.append('reply_to_id', replyTarget.id);
      if (pendingAttachment) fd.append('attachment', pendingAttachment, pendingAttachment.name);

      input.value = '';
      hideMentionSuggest();
      clearReply();
      clearAttachment();

      const isTagging = /@vision[\s_-]*ai\b/i.test(text);
      let shimmerEl = null;
      if (isTagging) {
        shimmerEl = document.createElement('div');
        shimmerEl.className = 'message-row received';
        shimmerEl.innerHTML = `
          <div class="message-bubble received vision-ai-authored">
            <div class="message-sender-label vision-ai-sender-label"><span class="vision-ai-sender-icon">✦</span>VISION AI</div>
            <div class="vision-ai-typing"><span></span><span></span><span></span></div>
          </div>
        `;
      }

      // Group the optimistic bubble with the previous one if I'm the one
      // who sent that too — keeps rapid back-to-back sends visually tight.
      const lastRow = bubbles.querySelector('.message-row:last-child');
      const grouped = !!lastRow && lastRow.classList.contains('sent');

      fetch(`/api/conversations/${currentConversationId}/messages`, { method: 'POST', body: fd })
        .then((r) => r.json())
        .then((m) => {
          if (m.error) { chatToast(m.error); if (shimmerEl) shimmerEl.remove(); return; }
          const emptyMsg = bubbles.querySelector('p');
          if (bubbles.children.length === 1 && emptyMsg && !emptyMsg.closest('.message-row')) {
            bubbles.innerHTML = '';
          }
          const row = document.createElement('div');
          row.innerHTML = messageRowHtml(
            { ...m, is_mine: true, is_read: false },
            currentIsGroup,
            { showAvatar: false, grouped }
          );
          bubbles.appendChild(row.firstElementChild);
          lastMessageId = Math.max(lastMessageId, m.id);

          if (isTagging && shimmerEl) bubbles.appendChild(shimmerEl);
          bubbles.scrollTop = bubbles.scrollHeight;

          if (m.ai_reply) {
            if (shimmerEl) shimmerEl.remove();
            const aiRow = document.createElement('div');
            aiRow.innerHTML = messageRowHtml(m.ai_reply, currentIsGroup, { showAvatar: true, grouped: false });
            bubbles.appendChild(aiRow.firstElementChild);
            bubbles.scrollTop = bubbles.scrollHeight;
            lastMessageId = Math.max(lastMessageId, m.ai_reply.id);
          } else if (shimmerEl) {
            shimmerEl.remove();
          }
        })
        .catch(() => {
          if (shimmerEl) shimmerEl.remove();
        });
    });

    initMentionSuggest(input, form);
  }

  // Edit an already-sent message: swap its content area for an inline
  // input, PATCH the new text to the server on save, re-render on success.
  // Delete works the same way, minus the confirmation round-trip — it just
  // asks first, then DELETEs and swaps the bubble for a placeholder.
  //
  // Also handles the newer WhatsApp-style actions: reply, react, star,
  // forward, and jumping to a quoted message.
  if (bubbles) {
    bubbles.addEventListener('click', (e) => {
      const editBtn = e.target.closest('[data-edit-message]');
      if (editBtn) {
        beginEditMessage(editBtn.closest('[data-message-row]'));
        return;
      }
      const saveBtn = e.target.closest('[data-edit-save]');
      if (saveBtn) {
        commitEditMessage(saveBtn.closest('[data-message-row]'));
        return;
      }
      const cancelBtn = e.target.closest('[data-edit-cancel]');
      if (cancelBtn) {
        cancelEditMessage(cancelBtn.closest('[data-message-row]'));
        return;
      }
      const deleteBtn = e.target.closest('[data-delete-message]');
      if (deleteBtn) {
        deleteMessage(deleteBtn.closest('[data-message-row]'));
        return;
      }
      const replyBtn = e.target.closest('[data-reply-message]');
      if (replyBtn) {
        setReply(replyBtn.closest('[data-message-row]'));
        return;
      }
      const reactBtn = e.target.closest('[data-react-message]');
      if (reactBtn) {
        openEmojiPopover(reactBtn, reactBtn.dataset.reactMessage);
        return;
      }
      const pill = e.target.closest('[data-react-emoji]');
      if (pill) {
        sendReaction(pill.closest('[data-message-row]').dataset.messageRow, pill.dataset.reactEmoji);
        return;
      }
      const starBtn = e.target.closest('[data-star-message]');
      if (starBtn) {
        toggleStar(starBtn.dataset.starMessage, starBtn);
        return;
      }
      const forwardBtn = e.target.closest('[data-forward-message]');
      if (forwardBtn) {
        openForwardModal(forwardBtn.dataset.forwardMessage);
        return;
      }
      const quote = e.target.closest('[data-jump-to-message]');
      if (quote) {
        jumpToMessage(quote.dataset.jumpToMessage);
      }
    });
  }

  function deleteMessage(row) {
    if (!row) return;
    if (!window.confirm('Delete this message for everyone?')) return;

    const messageId = row.dataset.messageRow;
    fetch(`/api/conversations/${currentConversationId}/messages/${messageId}`, { method: 'DELETE' })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) return;
        row.dataset.editing = '';
        row.dataset.rawContent = '';
        const contentEl = row.querySelector('[data-message-content]');
        if (contentEl) contentEl.innerHTML = '<p class="message-deleted-text">This message was deleted.</p>';
        const actionsEl = row.querySelector('.message-actions');
        if (actionsEl) actionsEl.remove();
        const editedTag = row.querySelector('.message-edited-tag');
        if (editedTag) editedTag.remove();
      })
      .catch(() => {});
  }

  function beginEditMessage(row) {
    if (!row) return;
    const contentEl = row.querySelector('[data-message-content]');
    if (!contentEl || row.dataset.editing === '1') return;
    row.dataset.editing = '1';
    const raw = row.dataset.rawContent || '';
    contentEl.innerHTML = `
      <div class="message-edit-form">
        <input type="text" class="message-edit-input" value="${escapeAttr(raw)}">
        <div class="message-edit-actions">
          <button type="button" class="message-edit-save" data-edit-save>${MSG_CHECK_ICON}</button>
          <button type="button" class="message-edit-cancel" data-edit-cancel>${MSG_X_ICON}</button>
        </div>
      </div>
    `;
    const editInput = contentEl.querySelector('.message-edit-input');
    editInput.focus();
    editInput.setSelectionRange(editInput.value.length, editInput.value.length);
    editInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); commitEditMessage(row); }
      if (e.key === 'Escape') { e.preventDefault(); cancelEditMessage(row); }
    });
  }

  function cancelEditMessage(row) {
    if (!row) return;
    const contentEl = row.querySelector('[data-message-content]');
    row.dataset.editing = '';
    contentEl.innerHTML = renderMarkdownLite(row.dataset.rawContent || '');
  }

  function commitEditMessage(row) {
    if (!row) return;
    const messageId = row.dataset.messageRow;
    const editInput = row.querySelector('.message-edit-input');
    const newText = (editInput ? editInput.value : '').trim();
    if (!newText) return;

    fetch(`/api/conversations/${currentConversationId}/messages/${messageId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: newText }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) return;
        row.dataset.rawContent = data.content;
        row.dataset.editing = '';
        const contentEl = row.querySelector('[data-message-content]');
        contentEl.innerHTML = renderMarkdownLite(data.content);
        const metaEl = row.querySelector('.message-bubble-meta');
        if (metaEl && !metaEl.querySelector('.message-edited-tag')) {
          metaEl.insertAdjacentHTML('afterbegin', '<span class="message-edited-tag">edited</span>');
        }
      })
      .catch(() => {});
  }

  if (currentConversationId) {
    openConversation(currentConversationId);
  }
}

// --------------------------------------------------------------------------
// "@" mention helper for the message composer — typing "@v" (or similar)
// shows a small tappable suggestion so people don't have to remember the
// exact spelling of the tag.
//
// This is portaled onto <body> and positioned with `fixed` coordinates
// computed from the input's own bounding box, rather than living inside
// the message form. The form sits inside `.messages-shell`, which has
// `overflow: hidden` (to keep the two-column layout's rounded corners
// clean) — an absolutely-positioned popover anchored inside that shell
// gets visually clipped and can end up unclickable, which is exactly the
// bug this replaces. Portaling to <body> means it can never be clipped by
// an ancestor's overflow, no matter how the surrounding layout changes.
//
// Selecting an option is wired to `mousedown` (with preventDefault) rather
// than `click`: mousedown fires before the input's `blur`, so the option
// is chosen before the picker has any chance to hide itself.
// --------------------------------------------------------------------------
let mentionSuggestEl = null;

function hideMentionSuggest() {
  if (mentionSuggestEl) mentionSuggestEl.style.display = 'none';
}

function positionMentionSuggest(input) {
  if (!mentionSuggestEl) return;
  const rect = input.getBoundingClientRect();
  mentionSuggestEl.style.left = `${rect.left}px`;
  mentionSuggestEl.style.top = `${rect.top - 8}px`;
  mentionSuggestEl.style.width = `${Math.max(rect.width, 220)}px`;
  mentionSuggestEl.style.transform = 'translateY(-100%)';
}

function initMentionSuggest(input) {
  if (!input) return;

  if (!mentionSuggestEl) {
    mentionSuggestEl = document.createElement('div');
    mentionSuggestEl.className = 'mention-suggest';
    mentionSuggestEl.style.display = 'none';
    mentionSuggestEl.innerHTML = `
      <button type="button" class="mention-suggest-option">
        <span class="mention-suggest-icon">✦</span>
        <span><strong>VISIONAI</strong><br><small>Bring the startup copilot into this chat</small></span>
      </button>
    `;
    document.body.appendChild(mentionSuggestEl);

    mentionSuggestEl.querySelector('.mention-suggest-option').addEventListener('mousedown', (e) => {
      e.preventDefault(); // keep focus on the input instead of blurring to the button
      const value = input.value;
      const cursor = input.selectionStart || value.length;
      const before = value.slice(0, cursor).replace(/@[a-zA-Z]*$/, '@VISIONAI ');
      input.value = before + value.slice(cursor);
      hideMentionSuggest();
      input.focus();
    });

    window.addEventListener('resize', () => {
      if (mentionSuggestEl.style.display !== 'none') positionMentionSuggest(input);
    });
  }

  const matchesTrigger = () => {
    const value = input.value.slice(0, input.selectionStart || input.value.length);
    const match = value.match(/(^|\s)@(v(i(s(i(o(n(a?i?)?)?)?)?)?)?)?$/i);
    return match ? match[0].trim() : null;
  };

  input.addEventListener('input', () => {
    const trigger = matchesTrigger();
    if (trigger !== null && /^@/.test(trigger)) {
      positionMentionSuggest(input);
      mentionSuggestEl.style.display = 'flex';
    } else {
      hideMentionSuggest();
    }
  });

  input.addEventListener('blur', () => {
    setTimeout(hideMentionSuggest, 150);
  });
}

// --------------------------------------------------------------------------
// Smooth-scroll for in-page anchors
// --------------------------------------------------------------------------
function initSmoothAnchors() {
  document.querySelectorAll('a[href^="#"]').forEach((link) => {
    link.addEventListener('click', (e) => {
      const id = link.getAttribute('href').slice(1);
      const target = document.getElementById(id);
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth' });
      }
    });
  });
}

// --------------------------------------------------------------------------
// Find People: search modal (by name or username)
// --------------------------------------------------------------------------
function initUserSearch() {
  const openBtn = document.getElementById('openUserSearchBtn');
  const modal = document.getElementById('userSearchModal');
  const closeBtn = document.getElementById('closeUserSearchModal');
  const input = document.getElementById('userSearchInput');
  const results = document.getElementById('userSearchResults');
  if (!modal || !input || !results) return;

  if (openBtn) {
    openBtn.addEventListener('click', () => {
      modal.classList.add('open');
      input.value = '';
      results.innerHTML = '';
      setTimeout(() => input.focus(), 50);
    });
  }
  if (closeBtn) closeBtn.addEventListener('click', () => modal.classList.remove('open'));
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.remove('open'); });

  let debounceTimer = null;
  input.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    const q = input.value.trim();
    if (q.length < 2) {
      results.innerHTML = q.length ? '<p class="user-search-hint">Keep typing...</p>' : '';
      return;
    }
    debounceTimer = setTimeout(() => {
      fetch(`/api/users/search?q=${encodeURIComponent(q)}`)
        .then((r) => r.json())
        .then((users) => {
          if (!users.length) {
            results.innerHTML = '<p class="user-search-hint">No people found.</p>';
            return;
          }
          results.innerHTML = users.map(renderUserSearchRow).join('');
        })
        .catch(() => {
          results.innerHTML = '<p class="user-search-hint">Something went wrong.</p>';
        });
    }, 250);
  });
}

function renderUserSearchRow(u) {
  const avatar = u.avatar_url ? `<img src="${u.avatar_url}">` : (u.name ? u.name[0].toUpperCase() : 'V');
  return `
    <div class="user-search-row" data-user-id="${u.id}">
      <div class="avatar">${avatar}</div>
      <div class="user-search-row-info">
        <div class="user-search-row-name">${escapeHtml(u.name)}${renderReputationBadge(u.reputation)}${renderBuilderTypeBadge(u.builder_type)}</div>
        <div class="user-search-row-meta">@${escapeHtml(u.username)} &middot; ${escapeHtml(u.role)}</div>
        ${renderLanguageBadges(u.languages)}
      </div>
    </div>
  `;
}

// --------------------------------------------------------------------------
// User profile card modal (opened from search results)
// --------------------------------------------------------------------------
function initUserProfileModal() {
  const searchResults = document.getElementById('userSearchResults');
  const searchModal = document.getElementById('userSearchModal');
  const profileModal = document.getElementById('userProfileModal');
  const closeBtn = document.getElementById('closeUserProfileModal');
  const body = document.getElementById('userProfileModalBody');
  if (!profileModal || !body) return;

  if (searchResults) {
    searchResults.addEventListener('click', (e) => {
      const row = e.target.closest('.user-search-row');
      if (!row) return;
      if (searchModal) searchModal.classList.remove('open');
      openUserProfile(row.dataset.userId);
    });
  }

  if (closeBtn) closeBtn.addEventListener('click', () => profileModal.classList.remove('open'));
  profileModal.addEventListener('click', (e) => { if (e.target === profileModal) profileModal.classList.remove('open'); });
}

function openUserProfile(userId) {
  const modal = document.getElementById('userProfileModal');
  const body = document.getElementById('userProfileModalBody');
  if (!modal || !body) return;

  body.innerHTML = '<p style="text-align:center; padding:40px 0;">Loading profile...</p>';
  modal.classList.add('open');

  fetch(`/api/users/${userId}/profile`)
    .then((r) => r.json())
    .then((u) => {
      const avatar = u.avatar_url ? `<img src="${u.avatar_url}">` : (u.name ? u.name[0].toUpperCase() : 'V');
      const statsHtml = (u.stats || []).map((s) => `
        <div class="glass stat-card" style="padding:16px;">
          <div class="stat-value" style="font-size:20px;">${s.value}</div>
          <div class="stat-label">${escapeHtml(s.label)}</div>
        </div>
      `).join('');

      body.innerHTML = `
        <div class="profile-card-head">
          <div class="avatar" style="width:64px; height:64px; font-size:22px;">${avatar}</div>
          <div>
            <div class="profile-card-name">${escapeHtml(u.name)}${renderReputationBadge(u.reputation)}${renderBuilderTypeBadge(u.builder_type)}</div>
            <div class="profile-card-meta">@${escapeHtml(u.username)} &middot; ${escapeHtml(u.role)}${u.country ? ' &middot; ' + escapeHtml(u.country) : ''}</div>
            ${renderLanguageBadges(u.languages)}
          </div>
        </div>
        ${u.bio ? `<p style="margin:16px 0;">${escapeHtml(u.bio)}</p>` : ''}
        <div class="stat-grid" style="grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); margin: 18px 0;">${statsHtml}</div>
        <button type="button" class="btn btn-primary btn-block message-profile-btn" data-user-id="${u.id}">Message</button>
      `;
    })
    .catch(() => {
      body.innerHTML = '<p style="text-align:center; padding:40px 0;">Could not load this profile.</p>';
    });
}
// --------------------------------------------------------------------------
// Notifications (bell dropdown, categorized, + badge-congrats toasts)
// --------------------------------------------------------------------------

const NOTIF_ICON_PATHS = {
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  heart: '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>',
  message: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  bookmark: '<path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>',
  'user-search': '<circle cx="10" cy="7" r="4"/><path d="M10.3 15H7a4 4 0 0 0-4 4v2"/><circle cx="17" cy="17" r="3"/><path d="m21 21-1.9-1.9"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  'check-circle': REPUTATION_ICON_PATHS['circle-check'],
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  sparkles: REPUTATION_ICON_PATHS['sparkles'],
  share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>',
};

let notifActiveCategory = 'all';
let notifPollTimer = null;
const notifSeenBadgeIds = new Set(
  JSON.parse(sessionStorage.getItem('visionSeenBadgeToasts') || '[]')
);

function notifIconSvg(type) {
  const path = NOTIF_ICON_PATHS[type] || NOTIF_ICON_PATHS.bell;
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
}

function timeAgo(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const secs = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
  if (secs < 60) return 'just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString();
}

function initNotifications() {
  const wrap = document.getElementById('notifWrap');
  const bellBtn = document.getElementById('notifBellBtn');
  const panel = document.getElementById('notifPanel');
  const markAllBtn = document.getElementById('notifMarkAllBtn');
  if (!wrap || !bellBtn || !panel) return;

  bellBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = panel.classList.toggle('open');
    if (isOpen) loadNotifications(notifActiveCategory);
  });

  document.addEventListener('click', (e) => {
    if (!wrap.contains(e.target)) panel.classList.remove('open');
  });

  if (markAllBtn) {
    markAllBtn.addEventListener('click', () => {
      fetch(`/api/notifications/read-all?category=${encodeURIComponent(notifActiveCategory)}`, { method: 'POST' })
        .then((r) => r.json())
        .then(() => loadNotifications(notifActiveCategory));
    });
  }

  const clearAllBtn = document.getElementById('notifClearAllBtn');
  if (clearAllBtn) {
    clearAllBtn.addEventListener('click', () => {
      const scope = notifActiveCategory === 'all' ? 'all notifications' : 'notifications in this tab';
      if (!confirm(`Clear ${scope}? This can't be undone.`)) return;
      fetch(`/api/notifications/clear?category=${encodeURIComponent(notifActiveCategory)}`, { method: 'POST' })
        .then((r) => r.json())
        .then((data) => {
          updateNotifCountBadge(data.unread_count);
          renderNotifTabs(data.categories);
          renderNotifList([]);
        });
    });
  }

  // Refresh unread badge + check for new achievement badges periodically,
  // independent of whether the panel is open.
  refreshNotificationsQuietly();
  notifPollTimer = setInterval(() => {
    if (document.hidden) return;
    refreshNotificationsQuietly();
  }, 2000);
}

function refreshNotificationsQuietly() {
  fetch('/api/notifications?category=all')
    .then((r) => r.json())
    .then((data) => {
      updateNotifCountBadge(data.unread_count);
      (data.notifications || [])
        .filter((n) => n.type === 'badge' && !n.is_read && !notifSeenBadgeIds.has(n.id))
        .forEach(showBadgeToast);
      const panel = document.getElementById('notifPanel');
      if (panel && panel.classList.contains('open')) {
        renderNotifTabs(data.categories);
        renderNotifList(data.notifications);
      }
    })
    .catch(() => {});
}

function loadNotifications(category) {
  const list = document.getElementById('notifList');
  if (list) list.innerHTML = '<div class="notif-empty">Loading…</div>';

  fetch(`/api/notifications?category=${encodeURIComponent(category)}`)
    .then((r) => r.json())
    .then((data) => {
      updateNotifCountBadge(data.unread_count);
      renderNotifTabs(data.categories);
      renderNotifList(data.notifications);
    })
    .catch(() => {
      if (list) list.innerHTML = '<div class="notif-empty">Couldn\'t load notifications.</div>';
    });
}

function updateNotifCountBadge(count) {
  const el = document.getElementById('notifCountBadge');
  if (!el) return;
  if (count > 0) {
    el.textContent = count > 99 ? '99+' : String(count);
    el.hidden = false;
  } else {
    el.hidden = true;
  }
}

function renderNotifTabs(categories) {
  const tabsEl = document.getElementById('notifTabs');
  if (!tabsEl || !categories) return;
  tabsEl.innerHTML = categories.map((cat) => `
    <button type="button" class="notif-tab ${cat.id === notifActiveCategory ? 'active' : ''}" data-category="${cat.id}">
      ${escapeHtml(cat.label)}${cat.count > 0 ? `<span class="notif-tab-count">${cat.count}</span>` : ''}
    </button>
  `).join('');

  tabsEl.querySelectorAll('.notif-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      notifActiveCategory = btn.dataset.category;
      loadNotifications(notifActiveCategory);
    });
  });
}

function renderNotifList(notifications) {
  const list = document.getElementById('notifList');
  if (!list) return;

  if (!notifications || notifications.length === 0) {
    list.innerHTML = '<div class="notif-empty">Nothing here yet.</div>';
    return;
  }

  list.innerHTML = notifications.map((n) => `
    <div class="notif-item ${n.is_read ? '' : 'unread'}" data-id="${n.id}" data-link="${escapeAttr(n.link || '')}" data-type="${n.type}" data-actor-id="${n.actor ? n.actor.id : ''}">
      <div class="notif-item-icon type-${n.type}">${notifIconSvg(n.icon)}</div>
      <div class="notif-item-body">
        <div class="notif-item-text">${escapeHtml(n.text)}</div>
        <div class="notif-item-time">${timeAgo(n.created_at)}</div>
      </div>
      ${n.type === 'badge' ? `<button type="button" class="notif-item-share-btn" title="Share">${notifIconSvg('share')}</button>` : ''}
    </div>
  `).join('');

  list.querySelectorAll('.notif-item-share-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const item = btn.closest('.notif-item');
      const text = item.querySelector('.notif-item-text').textContent;
      const shareData = { title: 'New badge on Vision', text: `${text} on Vision 🚀`, url: `${window.location.origin}/help/badges` };
      if (navigator.share) {
        navigator.share(shareData).catch(() => {});
      } else if (navigator.clipboard) {
        navigator.clipboard.writeText(`${shareData.text} ${shareData.url}`);
        btn.title = 'Copied!';
        setTimeout(() => { btn.title = 'Share'; }, 2000);
      }
    });
  });

  list.querySelectorAll('.notif-item').forEach((item) => {
    item.addEventListener('click', () => {
      const id = item.dataset.id;
      const type = item.dataset.type;
      const actorId = item.dataset.actorId;
      const link = item.dataset.link;

      if (item.classList.contains('unread')) {
        item.classList.remove('unread');
        fetch(`/api/notifications/${id}/read`, { method: 'POST' })
          .then((r) => r.json())
          .then((data) => updateNotifCountBadge(data.unread_count))
          .catch(() => {});
      }

      document.getElementById('notifPanel').classList.remove('open');

      if (type === 'profile_view' && actorId) {
        openUserProfile(actorId);
      } else if (link) {
        window.location.href = link;
      }
    });
  });
}

function showBadgeToast(notif) {
  notifSeenBadgeIds.add(notif.id);
  sessionStorage.setItem('visionSeenBadgeToasts', JSON.stringify([...notifSeenBadgeIds]));

  const stack = document.getElementById('badgeToastStack');
  if (!stack) return;

  const toast = document.createElement('div');
  toast.className = 'badge-toast';
  toast.innerHTML = `
    <div class="badge-toast-confetti"></div>
    <div class="badge-toast-icon">${notifIconSvg('sparkles')}</div>
    <div class="badge-toast-body">
      <div class="badge-toast-title">Level up! 🎉</div>
      <div class="badge-toast-sub">${escapeHtml(notif.text.replace(/\s*🎉\s*$/, ''))}</div>
      <div class="badge-toast-actions">
        <button type="button" class="badge-toast-share-btn">Share</button>
        <a href="/help/badges" class="badge-toast-link">See all badges</a>
      </div>
    </div>
    <button type="button" class="badge-toast-close">${notifIconSvg('x')}</button>
  `;

  // Small confetti burst behind the icon — pure CSS/JS, no external assets.
  const confettiColors = ['#10B981', '#FBBF24', '#3B82F6', '#F472B6', '#8B5CF6'];
  const confettiEl = toast.querySelector('.badge-toast-confetti');
  for (let i = 0; i < 14; i++) {
    const piece = document.createElement('span');
    piece.className = 'confetti-piece';
    piece.style.setProperty('--confetti-color', confettiColors[i % confettiColors.length]);
    piece.style.setProperty('--confetti-x', `${(Math.random() - 0.5) * 140}px`);
    piece.style.setProperty('--confetti-delay', `${Math.random() * 0.15}s`);
    piece.style.left = `${40 + Math.random() * 20}%`;
    confettiEl.appendChild(piece);
  }

  toast.querySelector('.badge-toast-close').addEventListener('click', () => toast.remove());

  const shareBtn = toast.querySelector('.badge-toast-share-btn');
  shareBtn.addEventListener('click', () => {
    const shareData = {
      title: 'New badge on Vision',
      text: notif.text.replace(/\s*🎉\s*$/, '') + ' on Vision 🚀',
      url: `${window.location.origin}/help/badges`,
    };
    if (navigator.share) {
      navigator.share(shareData).catch(() => {});
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(`${shareData.text} ${shareData.url}`).then(() => {
        shareBtn.textContent = 'Copied!';
        setTimeout(() => { shareBtn.textContent = 'Share'; }, 2000);
      });
    }
  });
  stack.appendChild(toast);

  let dismissTimer = setTimeout(() => toast.remove(), 12000);
  toast.addEventListener('mouseenter', () => clearTimeout(dismissTimer));
  toast.addEventListener('mouseleave', () => { dismissTimer = setTimeout(() => toast.remove(), 4000); });
}