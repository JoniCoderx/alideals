// אליקוד – reveal codes, copy, open affiliate link, filters, countdown. No dependencies.
(function () {
  'use strict';
  var modal = document.getElementById('code-modal');
  var track = function (name, params) { try { window.gtag && window.gtag('event', name, params || {}); } catch (e) {} };

  function copy(text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text).catch(fallback);
    fallback();
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); } catch (e) {}
      document.body.removeChild(ta);
    }
    return Promise.resolve();
  }

  function toast(msg) {
    var t = document.createElement('div');
    t.className = 'toast'; t.textContent = msg; t.setAttribute('role', 'status');
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 2500);
  }

  function goUrl(id) { return '/go/' + encodeURIComponent(id) + '/'; }

  function openAffiliate(id) {
    var w = window.open(goUrl(id), '_blank');
    if (w) { try { w.opener = null; } catch (e) {} }
    return !!w;
  }

  function reveal(btn) {
    var id = btn.getAttribute('data-reveal');
    var code = btn.getAttribute('data-code');
    var title = btn.getAttribute('data-title') || '';
    copy(code);
    openAffiliate(id);
    track('coupon_reveal', { coupon_id: id, coupon_code: code });

    document.querySelectorAll('[data-reveal="' + id + '"]').forEach(function (b) {
      b.classList.add('is-revealed');
      var mask = b.querySelector('.reveal-mask');
      if (mask) mask.textContent = code;
    });
    try { sessionStorage.setItem('rev:' + id, code); } catch (e) {}

    if (modal && typeof modal.showModal === 'function') {
      document.getElementById('modal-title').textContent = title;
      document.getElementById('modal-code').textContent = code;
      document.getElementById('modal-go').href = goUrl(id);
      document.getElementById('modal-go').dataset.go = id;
      if (!modal.open) modal.showModal();
    } else {
      toast('הקוד ' + code + ' הועתק');
    }
  }

  document.addEventListener('click', function (e) {
    var r = e.target.closest('[data-reveal]');
    if (r) { e.preventDefault(); reveal(r); return; }

    var gb = e.target.closest('[data-go-btn]');
    if (gb) { e.preventDefault(); var gid = gb.getAttribute('data-go-btn'); openAffiliate(gid) || (location.href = goUrl(gid)); track('outbound_click', { target_id: gid }); return; }

    var g = e.target.closest('[data-go]');
    if (g) { track('outbound_click', { target_id: g.getAttribute('data-go') }); return; }

    var p = e.target.closest('[data-product]');
    if (p) { track('product_click', { product_id: p.getAttribute('data-product') }); return; }

    var f = e.target.closest('[data-filter]');
    if (f) {
      document.querySelectorAll('[data-filter]').forEach(function (c) { c.classList.toggle('is-on', c === f); });
      var v = f.getAttribute('data-filter');
      var range = v === 'all' ? null : v.split('-').map(Number);
      document.querySelectorAll('#coupon-list .coupon').forEach(function (card) {
        var min = Number(card.getAttribute('data-min') || 0);
        card.hidden = !!range && !(min >= range[0] && min < range[1]);
      });
    }
  });

  var mc = document.getElementById('modal-copy');
  if (mc) mc.addEventListener('click', function () {
    copy(document.getElementById('modal-code').textContent);
    mc.lastChild.textContent = ' הועתק!';
    setTimeout(function () { mc.lastChild.textContent = ' העתק'; }, 1600);
  });
  if (modal) modal.addEventListener('click', function (e) { if (e.target === modal) modal.close(); });

  // Restore codes revealed earlier in this session.
  document.querySelectorAll('[data-reveal]').forEach(function (b) {
    var id = b.getAttribute('data-reveal'), code = null;
    try { code = sessionStorage.getItem('rev:' + id); } catch (e) {}
    if (code) { b.classList.add('is-revealed'); var m = b.querySelector('.reveal-mask'); if (m) m.textContent = code; }
  });

  // Countdown for upcoming sales.
  document.querySelectorAll('[data-countdown]').forEach(function (el) {
    var target = new Date(el.getAttribute('data-countdown')).getTime();
    function tick() {
      var d = Math.max(0, target - Date.now());
      var parts = [[Math.floor(d / 864e5), 'ימים'], [Math.floor(d / 36e5) % 24, 'שעות'], [Math.floor(d / 6e4) % 60, 'דקות'], [Math.floor(d / 1e3) % 60, 'שניות']];
      el.innerHTML = parts.map(function (p) { return '<span><b>' + p[0] + '</b>' + p[1] + '</span>'; }).join('');
      if (d > 0) setTimeout(tick, 1000);
    }
    tick();
  });
})();
