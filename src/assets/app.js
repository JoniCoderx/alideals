// יש דיל: reveal codes, copy, open affiliate link, filters, countdown, client-side expiry. No dependencies.
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
      var share = $('modal-share');
      if (share) {
        var site = window.SITE || { url: location.origin, name: '' };
        var msg = site.name + ' קוד קופון לאליאקספרס: ' + code + ' (' + title + ')\n' + site.url + '/#c-' + id;
        share.href = 'https://wa.me/?text=' + encodeURIComponent(msg);
        share.setAttribute('data-share', id);
      }
      if (!modal.open) modal.showModal();
    });
  }

  document.addEventListener('click', function (e) {
    var r = e.target.closest('[data-reveal]');
    if (r) { e.preventDefault(); reveal(r); return; }

    var sh = e.target.closest('[data-share]');
    if (sh) { track('share', { method: 'whatsapp', coupon_id: sh.getAttribute('data-share') }); return; }

    var cur = e.target.closest('[data-cur]');
    if (cur) { setCurrency(cur.getAttribute('data-cur')); return; }

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

  // Whole coupon card is a tap target (bigger hit area on mobile = more reveals).
  document.addEventListener('click', function (e) {
    if (e.defaultPrevented || e.target.closest('a,button,input,summary,dialog')) return;
    var card = e.target.closest('.coupon[data-clickable]');
    if (!card) return;
    var btn = card.querySelector('[data-reveal]') || card.querySelector('[data-go]');
    if (btn) btn.click();
  });
  document.querySelectorAll('.coupon').forEach(function (c) {
    if (c.querySelector('[data-reveal],[data-go]')) c.setAttribute('data-clickable', '');
  });

  /* ---------- Cart calculator: the best code for the amount in the cart ---------- */
  var calc = $('calc'), input = $('calc-amount'), out = $('calc-out');
  var tiers = [];
  try { tiers = JSON.parse(($('calc-data') || {}).textContent || '[]'); } catch (e) {}
  var currency = 'USD';
  try { currency = localStorage.getItem('calc-cur') || 'USD'; } catch (e) {}
  var rate = calc ? Number(calc.getAttribute('data-rate')) || 3.7 : 3.7;
  var esc = function (t) { return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var fmt = function (n) { return '$' + (Math.round(n * 100) / 100).toLocaleString('en-US'); };

  function setCurrency(c) {
    currency = c === 'ILS' ? 'ILS' : 'USD';
    try { localStorage.setItem('calc-cur', currency); } catch (e) {}
    document.querySelectorAll('[data-cur]').forEach(function (b) {
      var on = b.getAttribute('data-cur') === currency;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    if (input) { input.placeholder = currency === 'ILS' ? 'למשל 220' : 'למשל 60'; runCalc(); }
  }

  function runCalc() {
    if (!out || !tiers.length) return;
    var raw = parseFloat(String(input.value).replace(/[^\d.]/g, ''));
    if (!(raw > 0)) { out.textContent = 'הקלידו את סכום העגלה ונציג את הקוד הכי משתלם בשבילכם.'; return; }
    var usd = currency === 'ILS' ? raw / rate : raw;
    var fits = tiers.filter(function (t) { return t.m <= usd; });
    var best = fits.sort(function (a, b) { return b.d - a.d; })[0];
    var next = tiers.filter(function (t) { return t.m > usd && (!best || t.d > best.d); }).sort(function (a, b) { return a.m - b.m; })[0];
    var approx = currency === 'ILS' ? ' (בערך ' + fmt(usd) + ')' : '';
    var html = '';
    if (best) {
      var cta = best.s
        ? '<a class="btn btn-primary" href="/go/' + esc(best.id) + '/" target="_blank" rel="nofollow sponsored noopener" data-go="' + esc(best.id) + '">לקבלת הקוד</a>'
        : '<button class="btn btn-primary" type="button" data-reveal="' + esc(best.id) + '" data-code="' + esc(best.code) + '" data-title="' + esc(best.t) + '">הצג את הקוד</button>';
      html += '<div class="best"><span>לעגלה שלכם' + esc(approx) + ': <b>' + fmt(best.d) + ' הנחה</b></span>' + cta + '</div>';
    } else {
      html += '<div>הקוד הראשון מתחיל בהזמנה מעל ' + fmt(tiers.reduce(function (m, t) { return Math.min(m, t.m); }, Infinity)) + esc(approx) + '.</div>';
    }
    if (next) {
      var gap = next.m - usd;
      if (!best || gap <= Math.max(10, usd * 0.35)) {
        html += '<p class="upsell">💡 הוסיפו עוד ' + fmt(gap) + ' לעגלה וקבלו ' + fmt(next.d) + ' הנחה במקום ' + (best ? fmt(best.d) : '0') + '.</p>';
      }
    }
    out.innerHTML = html;
  }

  if (input) {
    var t;
    input.addEventListener('input', function () { clearTimeout(t); t = setTimeout(runCalc, 120); });
    input.addEventListener('change', function () { track('calc_use', { currency: currency }); });
    setCurrency(currency);
  }

  /* ---------- Sticky mobile CTA: appears after the hero, hides at the calculator/footer ---------- */
  var sticky = $('sticky-cta');
  if (sticky && 'IntersectionObserver' in window) {
    sticky.hidden = false;
    var heroVisible = true, footVisible = false;
    var upd = function () { sticky.classList.toggle('is-on', !heroVisible && !footVisible); };
    new IntersectionObserver(function (en) { heroVisible = en[0].isIntersecting; upd(); }).observe(document.querySelector('.hero'));
    var foot = document.querySelector('.site-footer');
    if (foot) new IntersectionObserver(function (en) { footVisible = en[0].isIntersecting; upd(); }).observe(foot);
    sticky.querySelector('a').addEventListener('click', function (e) {
      e.preventDefault();
      calc.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(function () { input && input.focus({ preventScroll: true }); }, 400);
      track('sticky_cta');
    });
  }

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
