/* Vision — theme (dark / light) controller.
   Load synchronously in <head>, BEFORE the stylesheet, so the saved theme is
   applied before first paint (no dark→light flash). Also handles every
   [data-theme-toggle] button on the page via event delegation. */
(function () {
  var KEY = 'vision-theme';
  var root = document.documentElement;

  function read() {
    try { var v = localStorage.getItem(KEY); return v === 'light' || v === 'dark' ? v : null; }
    catch (e) { return null; }
  }
  function write(v) { try { localStorage.setItem(KEY, v); } catch (e) {} }

  function syncUI(theme) {
    var isLight = theme === 'light';
    var btns = document.querySelectorAll('[data-theme-toggle]');
    for (var i = 0; i < btns.length; i++) {
      btns[i].setAttribute('aria-pressed', String(isLight));
      btns[i].setAttribute('title', isLight ? 'Switch to dark mode' : 'Switch to light mode');
      btns[i].setAttribute('aria-label', isLight ? 'Switch to dark mode' : 'Switch to light mode');
    }
    var meta = document.querySelector('meta[name="theme-color"]');
    if (!meta && document.head) {
      meta = document.createElement('meta');
      meta.name = 'theme-color';
      document.head.appendChild(meta);
    }
    if (meta) meta.setAttribute('content', isLight ? '#EAF1FB' : '#0B0F19');
  }

  function apply(theme) {
    root.setAttribute('data-theme', theme);
    syncUI(theme);
  }

  // Default is dark (the original look) unless the user has chosen otherwise.
  // To follow the OS setting instead, change the fallback below to:
  //   (window.matchMedia && matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
  apply(read() || 'dark');

  document.addEventListener('DOMContentLoaded', function () { syncUI(root.getAttribute('data-theme')); });

  document.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest('[data-theme-toggle]');
    if (!btn) return;
    var next = root.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
    root.classList.add('theme-transition');
    apply(next);
    write(next);
    window.setTimeout(function () { root.classList.remove('theme-transition'); }, 450);
  });

  // Keep multiple open tabs in sync
  window.addEventListener('storage', function (e) {
    if (e.key === KEY && (e.newValue === 'light' || e.newValue === 'dark')) apply(e.newValue);
  });
})();