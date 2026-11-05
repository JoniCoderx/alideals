// קוד היום: reveal codes, copy, open affiliate link, filters, countdown, client-side expiry. No dependencies.
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var modal = $('code-modal');
  var track = function (name, params) { try { window.gtag && window.gtag('event', name, params || {}); } catch (e) {} };

  // Israel-local YYYY-MM-DD, so a code that expires "today" stays visible until midnight in Israel.
  var today = (function () {
    try { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date()); }
    catch (e) { return new Date().toISOString().slice(0, 10); }
  })();

  // Hide codes that expired since the last build (in case a scheduled build was missed).
  document.querySelectorAll('.coupon[data-expires]').forEach(function (card) {
    if (card.getAttribute('data-expires') < today) { card.hidden = true; card.setAttribute('data-expired', ''); }
  });

  /** Resolves true if the text reached the clipboard. */
  function copy(text) {
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) {}
      document.body.removeChild(ta);
      return ok;
    }
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).then(function () { return true; }, function () { return fallback(); });
    }
    return Promise.resolve(fallback());
  }

  function toast(msg) {
    var t = document.createElement('div');
    t.className = 'toast'; t.textContent = msg; t.setAttribute('role', 'status');
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 2500);
  }

  function goUrl(id) { return '/go/' + encodeURIComponent(id) + '/'; }

  function openAffiliate(id) {
    var w = null;
    try { w = window.open(goUrl(id), '_blank'); } catch (e) {}
    if (w) { try { w.opener = null; } catch (e) {} }
    return !!w;
  }

  function markRevealed(id, code) {
    document.querySelectorAll('[data-reveal="' + id + '"]').forEach(function (b) {
      b.classList.add('is-revealed');
      var mask = b.querySelector('.reveal-mask');
      if (mask) mask.textContent = code;
      if (b.classList.contains('btn-reveal')) b.setAttribute('aria-label', 'הקוד ' + code + ', לחצו להעתקה ומעבר לאליאקספרס');
    });
  }

  function reveal(btn) {
    var id = btn.getAttribute('data-reveal');
    var code = btn.getAttribute('data-code');
    var title = btn.getAttribute('data-title') || '';
    // Start the clipboard write while this page still has focus, then open the tab synchronously
    // inside the same click so popup blockers allow it.
    var copying = copy(code);
    var opened = openAffiliate(id);
    markRevealed(id, code);
    try { sessionStorage.setItem('rev:' + id, code); } catch (e) {}
    track('coupon_reveal', { coupon_id: id, coupon_code: code, tab_opened: opened });

    copying.then(function (copied) {
      if (!modal || typeof modal.showModal !== 'function') {
        toast(copied ? 'הקוד ' + code + ' הועתק' : 'הקוד: ' + code);
        if (!opened) location.href = goUrl(id);
        return;
      }
      $('modal-kicker').textContent = copied ? 'הקוד הועתק ✓' : 'זה הקוד שלכם:';
      $('modal-title').textContent = title;
      $('modal-code').textContent = code;
      $('modal-step1').textContent = opened ? 'אליאקספרס נפתחה בלשונית חדשה' : 'לוחצים על "מעבר לאליאקספרס" למטה';
      var go = $('modal-go');
      go.href = goUrl(id);
      go.textContent = opened ? 'לא נפתח? מעבר לאליאקספרס' : 'מעבר לאליאקספרס';
      go.setAttribute('data-go', id);
      if (!modal.open) modal.showModal();
    });
  }

  document.addEventListener('click', function (e) {
    var r = e.target.closest('[data-reveal]');
    if (r) { e.preventDefault(); reveal(r); return; }

    var g = e.target.closest('[data-go]');
    if (g) { track('outbound_click', { target_id: g.getAttribute('data-go') }); return; }

    var p = e.target.closest('[data-product]');
    if (p) { track('product_click', { product_id: p.getAttribute('data-product') }); return; }

    var f = e.target.closest('[data-filter]');
    if (f) {
      document.querySelectorAll('[data-filter]').forEach(function (c) {
        var on = c === f;
        c.classList.toggle('is-on', on);
        c.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      var v = f.getAttribute('data-filter');
      var range = v === 'all' ? null : v.split('-').map(Number);
      var shown = 0;
      document.querySelectorAll('#coupon-list .coupon').forEach(function (card) {
        if (card.hasAttribute('data-expired')) return;
        var min = Number(card.getAttribute('data-min') || 0);
        var hide = !!range && !(min >= range[0] && min < range[1]);
        card.hidden = hide;
        if (!hide) shown++;
      });
      var empty = $('empty-filter');
      if (empty) empty.hidden = shown > 0;
    }
  });

  var mc = $('modal-copy');
  if (mc) mc.addEventListener('click', function () {
    var label = mc.querySelector('span');
    copy($('modal-code').textContent).then(function (ok) {
      if (!label) return;
      label.textContent = ok ? 'הועתק!' : 'סמנו והעתיקו';
      setTimeout(function () { label.textContent = 'העתקה'; }, 1600);
    });
  });
  if (modal) modal.addEventListener('click', function (e) { if (e.target === modal) modal.close(); });

  // Restore codes revealed earlier in this session.
  document.querySelectorAll('[data-reveal]').forEach(function (b) {
    var id = b.getAttribute('data-reveal'), code = null;
    try { code = sessionStorage.getItem('rev:' + id); } catch (e) {}
    if (code && code === b.getAttribute('data-code')) markRevealed(id, code);
  });

  // Countdown for upcoming sales.
  document.querySelectorAll('[data-countdown]').forEach(function (el) {
    var target = new Date(el.getAttribute('data-countdown')).getTime();
    if (isNaN(target)) return;
    function tick() {
      var d = Math.max(0, target - Date.now());
      var parts = [[Math.floor(d / 864e5), 'ימים'], [Math.floor(d / 36e5) % 24, 'שעות'], [Math.floor(d / 6e4) % 60, 'דקות'], [Math.floor(d / 1e3) % 60, 'שניות']];
      el.innerHTML = parts.map(function (p) { return '<span><b>' + p[0] + '</b>' + p[1] + '</span>'; }).join('');
      if (d > 0) setTimeout(tick, 1000);
    }
    tick();
  });
})();
