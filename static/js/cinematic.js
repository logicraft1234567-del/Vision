/* ==========================================================================
   VISION — cinematic.js
   Progressive enhancement for cinematic.css. Nothing here is required for the
   app to work: it adds the ambient background layers, pointer-reactive light,
   card tilt, the liquid-button click ripple, and a low-power fallback.

   It never touches existing handlers, forms, fetch calls or app state. Load it
   AFTER main.js (and after vision-ai.js / deal-room.js where present).
   ========================================================================== */
(function () {
  'use strict';

  var doc = document;
  var root = doc.documentElement;
  var mq = function (q) { return window.matchMedia ? window.matchMedia(q).matches : false; };
  var reduceMotion = mq('(prefers-reduced-motion: reduce)');
  var finePointer = mq('(hover: hover) and (pointer: fine)');

  // ------------------------------------------------------------------------
  // 1. Ambient layers (aurora + grid + pointer spotlight)
  // ------------------------------------------------------------------------
  var spot = null;
  function mountAmbient() {
    if (doc.querySelector('.vx-ambient')) { spot = doc.querySelector('.vx-spot'); return; }
    var a = doc.createElement('div');
    a.className = 'vx-ambient';
    a.setAttribute('aria-hidden', 'true');
    a.innerHTML = '<div class="vx-aurora"></div><div class="vx-aurora vx-aurora-b"></div><div class="vx-grid"></div><div class="vx-spot"></div>';
    doc.body.insertBefore(a, doc.body.firstChild);
    spot = a.querySelector('.vx-spot');
    root.classList.add('vx-on');
  }

  // Pause decorative animation while the tab is hidden.
  doc.addEventListener('visibilitychange', function () {
    root.classList.toggle('vx-paused', doc.hidden);
  });

  // ------------------------------------------------------------------------
  // 2. Low-power detection: if the device can't hold ~35fps, switch to .vx-lite
  //    (static background, no backdrop blur). Same look, far cheaper.
  // ------------------------------------------------------------------------
  function enableLiteIfNeeded() {
    var weak = (navigator.deviceMemory && navigator.deviceMemory <= 2) ||
               (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 2);
    if (weak) { root.classList.add('vx-lite'); return; }
    if (reduceMotion || !window.requestAnimationFrame) return;

    var frames = 0, sum = 0, last = 0;
    function tick(t) {
      if (doc.hidden) { return; }                 // don't judge a background tab
      if (last) { sum += t - last; frames++; }
      last = t;
      if (frames < 75) { requestAnimationFrame(tick); return; }
      if (sum / frames > 30) root.classList.add('vx-lite');
    }
    requestAnimationFrame(tick);
  }

  // ------------------------------------------------------------------------
  // 3. Pointer-reactive light, card tilt, spotlight (desktop pointers only)
  // ------------------------------------------------------------------------
  var LIT = '.project-card, .problem-card, .ecosystem-card, .guardian-card, .stat-card, .deal-dash-card, .role-card, .request-card, .badge-guide-card';
  var TILT = '.project-card, .ecosystem-card';

  function initPointerEffects() {
    if (!finePointer || reduceMotion) return;

    var px = 0, py = 0;                          // latest pointer
    var sx = 0, sy = 0;                          // spotlight (eased)
    var current = null, frame = 0, lastEvt = null;

    function resetCard(el) {
      if (!el) return;
      el.classList.remove('vx-tilting');
      el.style.removeProperty('--mx'); el.style.removeProperty('--my');
      el.style.removeProperty('--rx'); el.style.removeProperty('--ry');
    }

    function paint() {
      frame = 0;
      // spotlight eases toward the pointer; loop stops once it has settled
      if (spot) {
        sx += (px - sx) * 0.12; sy += (py - sy) * 0.12;
        spot.style.transform = 'translate3d(' + sx.toFixed(1) + 'px,' + sy.toFixed(1) + 'px,0)';
      }
      if (lastEvt && current) {
        var r = current.getBoundingClientRect();
        var x = lastEvt.clientX - r.left, y = lastEvt.clientY - r.top;
        current.style.setProperty('--mx', x.toFixed(0) + 'px');
        current.style.setProperty('--my', y.toFixed(0) + 'px');
        if (current.matches(TILT) && r.width > 0) {
          var nx = x / r.width - 0.5, ny = y / r.height - 0.5;
          current.style.setProperty('--ry', (nx * 7).toFixed(2) + 'deg');
          current.style.setProperty('--rx', (-ny * 7).toFixed(2) + 'deg');
        }
      }
      if (Math.abs(px - sx) > 0.5 || Math.abs(py - sy) > 0.5) frame = requestAnimationFrame(paint);
    }
    function schedule() { if (!frame) frame = requestAnimationFrame(paint); }

    doc.addEventListener('pointermove', function (e) {
      if (e.pointerType && e.pointerType !== 'mouse' && e.pointerType !== 'pen') return;
      px = e.clientX; py = e.clientY;
      if (spot && !spot.classList.contains('on')) { sx = px; sy = py; spot.classList.add('on'); }
      lastEvt = e;
      var el = e.target && e.target.closest ? e.target.closest(LIT) : null;
      if (el !== current) {
        resetCard(current);
        current = el;
        if (current && current.matches(TILT)) current.classList.add('vx-tilting');
      }
      schedule();
    }, { passive: true });

    doc.addEventListener('pointerleave', function () {
      if (spot) spot.classList.remove('on');
      resetCard(current); current = null; lastEvt = null;
    });
    window.addEventListener('blur', function () { resetCard(current); current = null; });
  }

  // ------------------------------------------------------------------------
  // 4. Liquid-button click ripple (visual only; the click itself is untouched).
  //    The ripple lives in its own fixed overlay clipped to the button's shape,
  //    so the button's DOM is never modified (existing handlers that save and
  //    restore btn.innerHTML keep working exactly as before).
  // ------------------------------------------------------------------------
  function initRipple() {
    if (reduceMotion) return;
    doc.addEventListener('pointerdown', function (e) {
      var btn = e.target && e.target.closest ? e.target.closest('.btn-primary') : null;
      if (!btn || btn.disabled || btn.getAttribute('aria-busy') === 'true') return;
      var r = btn.getBoundingClientRect();
      var wrap = doc.createElement('span');
      wrap.className = 'vx-ripple-wrap';
      wrap.setAttribute('aria-hidden', 'true');
      wrap.style.cssText = 'left:' + r.left + 'px;top:' + r.top + 'px;width:' + r.width + 'px;height:' + r.height + 'px;border-radius:' + getComputedStyle(btn).borderRadius + ';';
      var dot = doc.createElement('span');
      dot.className = 'vx-ripple';
      dot.style.left = (e.clientX - r.left) + 'px';
      dot.style.top = (e.clientY - r.top) + 'px';
      wrap.appendChild(dot);
      doc.body.appendChild(wrap);
      var done = function () { if (wrap.parentNode) wrap.parentNode.removeChild(wrap); };
      dot.addEventListener('animationend', done);
      setTimeout(done, 900);                      // safety net
    }, { passive: true });
  }

  // ------------------------------------------------------------------------
  // Boot
  // ------------------------------------------------------------------------
  function boot() {
    mountAmbient();
    initPointerEffects();
    initRipple();
    // judge performance after the page has settled
    if (doc.readyState === 'complete') setTimeout(enableLiteIfNeeded, 800);
    else window.addEventListener('load', function () { setTimeout(enableLiteIfNeeded, 800); });
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
