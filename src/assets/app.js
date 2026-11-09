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
  // Codes end at 23:00 Israel time on their expiry day (as the site says), not at midnight.
  var ilHour = (function () { try { return Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', hour: 'numeric', hour12: false }).format(new Date())); } catch (e) { return 0; } })();
  var expired = function (d) { return !!d && (d < today || (d === today && ilHour >= 23)); };

  // Hide codes that expired since the last build (in case a scheduled build was missed).
  (function () {
    var t = document.getElementById('promo-toast');
    if (!t || location.pathname.indexOf('/finder') === 0) return;
    var seen = false;
    try { seen = !!localStorage.getItem('yd-promo-finder'); } catch (e) {}
    if (seen) return;
    var close = function () { t.classList.remove('is-in'); try { localStorage.setItem('yd-promo-finder', '1'); } catch (e) {} setTimeout(function () { t.hidden = true; }, 300); };
    t.querySelector('.pt-x').addEventListener('click', close);
    t.querySelector('a').addEventListener('click', function () { try { localStorage.setItem('yd-promo-finder', '1'); } catch (e) {} });
    setTimeout(function () { t.hidden = false; requestAnimationFrame(function () { t.classList.add('is-in'); }); }, 9000);
  })();
  // Decorative animations run only while visible (saves CPU/battery on phones).
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (en) { en.forEach(function (x) { x.target.classList.toggle('anim-on', x.isIntersecting); }); });
    document.querySelectorAll('.radar,.hero-deco').forEach(function (el) { io.observe(el); });
  } else {
    document.querySelectorAll('.radar,.hero-deco').forEach(function (el) { el.classList.add('anim-on'); });
  }
  document.querySelectorAll('.urgency[data-until]').forEach(function (el) {
    var until = el.getAttribute('data-until');
    var days = Math.round((Date.parse(until + 'T00:00:00Z') - Date.parse(today + 'T00:00:00Z')) / 864e5);
    var span = el.querySelector('span');
    if (days < 0) { el.hidden = true; return; }
    if (days === 0) span.textContent = 'היום האחרון לקודים! מהרו';
    else if (days === 1) span.textContent = 'נשאר יום אחד אחרון לקודים';
    else if (days <= 14) span.textContent = 'נשארו ' + days + ' ימים עד שהקודים פגים';
    if (days <= 3) el.classList.add('is-hot');
  });
  document.querySelectorAll('.coupon[data-expires]').forEach(function (card) {
    if (expired(card.getAttribute('data-expires'))) { card.hidden = true; card.setAttribute('data-expired', ''); }
  });
  (function () {
    var all = document.querySelectorAll('.coupon[data-expires]');
    if (!all.length || [].some.call(all, function (c) { return !c.hidden; })) return;
    var list = all[0].parentElement;
    var note = document.createElement('div');
    note.className = 'between';
    note.innerHTML = '<b>⏳ הקודים של המבצע הסתיימו</b><p>קודים חדשים יעלו כאן ובערוץ הטלגרם זמן קצר אחרי שעליאקספרס תפרסם אותם.</p>';
    list.parentElement.insertBefore(note, list);
    document.querySelectorAll('.featured-row, .tiers-box, #sticky-cta').forEach(function (el) { el.hidden = true; });
  })();

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
  // Direct affiliate URL (embedded by the build). Navigating straight to it in the SAME tab is what lets
  // iOS/Android hand the link to the AliExpress app; new tabs and extra redirects usually stay in the browser.
  function directUrl(id) { var l = (window.SITE && window.SITE.links) || {}; return l[id] || goUrl(id); }
  function goNow(id) { location.href = directUrl(id); }

  var DELAY = 2; // seconds between "code copied" and opening AliExpress
  var timer = null;
  function stopCountdown() {
    if (timer) { clearInterval(timer); timer = null; }
    var box = $('modal-countdown'); if (box) box.classList.add('is-off');
  }
  function startCountdown(id, onTick) {
    stopCountdown();
    var left = DELAY;
    var box = $('modal-countdown');
    if (box) {
      box.classList.remove('is-off');
      var bar = $('modal-bar'); if (bar) { bar.style.animation = 'none'; void bar.offsetWidth; bar.style.animation = ''; }
    }
    onTick(left);
    timer = setInterval(function () {
      left -= 1;
      if (left <= 0) {
        clearInterval(timer); timer = null;
        var box2 = $('modal-countdown'); if (box2) box2.querySelector('span').textContent = '🚀 פותחים את עליאקספרס!';
        track('auto_open', { target_id: id }); goNow(id); return;
      }
      onTick(left);
    }, 1000);
  }

  function markRevealed(id, code) {
    document.querySelectorAll('[data-reveal="' + id + '"]').forEach(function (b) {
      b.classList.add('is-revealed');
      var mask = b.querySelector('.reveal-mask');
      if (mask) mask.textContent = code;
      if (b.classList.contains('btn-reveal')) b.setAttribute('aria-label', 'הקוד ' + code + ', לחצו להעתקה ומעבר לעליאקספרס');
    });
  }

  function reveal(btn) {
    var id = btn.getAttribute('data-reveal');
    var code = btn.getAttribute('data-code');
    var title = btn.getAttribute('data-title') || '';
    var copying = copy(code); // start while the page has focus
    markRevealed(id, code);
    try { sessionStorage.setItem('rev:' + id, code); } catch (e) {}
    track('coupon_reveal', { coupon_id: id, coupon_code: code });

    copying.then(function (copied) {
      if (!modal || typeof modal.showModal !== 'function') {
        toast(copied ? 'הקוד ' + code + ' הועתק. פותחים את עליאקספרס…' : 'הקוד: ' + code);
        setTimeout(function () { goNow(id); }, DELAY * 1000);
        return;
      }
      $('modal-kicker').textContent = copied ? 'הקוד הועתק ✓' : 'זה הקוד שלכם (סמנו והעתיקו):';
      $('modal-title').textContent = title;
      $('modal-code').textContent = code;
      var go = $('modal-go');
      go.href = directUrl(id);
      go.setAttribute('data-go', id);
      var share = $('modal-share');
      if (share) {
        var site = window.SITE || { url: location.origin, name: '' };
        var msg = site.name + ' קוד קופון לעליאקספרס: ' + code + ' (' + title + ')\n' + site.url + '/#c-' + id;
        share.href = 'https://wa.me/?text=' + encodeURIComponent(msg);
        share.setAttribute('data-share', id);
      }
      if (!modal.open) modal.showModal();
      // If the copy failed, don't leave the page automatically – let the user copy by hand first.
      if (copied) startCountdown(id, function (n) { var c = $('modal-count'); if (c) c.textContent = n; });
      else stopCountdown();
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
    if (g) {
      var gid = g.getAttribute('data-go');
      track('outbound_click', { target_id: gid });
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return; // let "open in new tab" work
      e.preventDefault(); stopCountdown(); goNow(gid); return;
    }

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
  tiers = tiers.filter(function (t) { return !expired(t.x); });
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
    if (!out) return;
    if (!tiers.length) { out.textContent = 'הקודים של המבצע הסתיימו. קודים חדשים יעלו כאן ובערוץ הטלגרם.'; return; }
    // same rules as src/v2/logic.mjs parseAmount (unit-tested): decimal comma, thousands, no negatives/1e5
    var typed = String(input.value || '');
    if (/₪/.test(typed) && currency !== 'ILS') return setCurrency('ILS');
    if (/\$/.test(typed) && currency !== 'USD') return setCurrency('USD');
    var s = typed.trim().replace(/[₪$\s]/g, ''), raw = NaN;
    if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) raw = Number(s.replace(/,/g, ''));
    else if (/^\d+,\d{1,2}$/.test(s)) raw = Number(s.replace(',', '.'));
    else if (/^\d+(\.\d+)?$/.test(s)) raw = Number(s);
    if (!s) { out.textContent = 'הקלידו את סכום העגלה ונציג את הקוד הכי משתלם בשבילכם.'; return; }
    if (!(raw > 0) || raw > 1e6) { out.textContent = 'הקלידו סכום חיובי במספרים, למשל 60 או 45.50.'; return; }
    var usd = currency === 'ILS' ? raw / rate : raw;
    usd = Math.round(usd * 100 + 1e-6) / 100;
    var fits = tiers.filter(function (t) { return t.m <= usd; });
    var best = fits.sort(function (a, b) { return b.d - a.d || a.m - b.m; })[0];
    var next = tiers.filter(function (t) { return t.m > usd && (!best || t.d > best.d); }).sort(function (a, b) { return a.m - b.m; })[0];
    var approx = currency === 'ILS' ? ' (בערך ' + fmt(usd) + ')' : '';
    var html = '';
    if (best) {
      var cta = best.s
        ? '<a class="btn btn-primary" href="/go/' + esc(best.id) + '/" target="_blank" rel="nofollow sponsored noopener" data-go="' + esc(best.id) + '">לקבלת הקוד</a>'
        : '<button class="btn btn-primary" type="button" data-reveal="' + esc(best.id) + '" data-code="' + esc(best.code) + '" data-title="' + esc(best.t) + '">העתק את הקוד</button>';
      html += '<div class="best"><span>לעגלה שלכם' + esc(approx) + ': <b>' + fmt(best.d) + ' הנחה</b></span>' + cta + '</div>';
    } else {
      html += '<div>הקוד הראשון מתחיל בהזמנה מעל ' + fmt(tiers.reduce(function (m, t) { return Math.min(m, t.m); }, Infinity)) + esc(approx) + '.</div>';
    }
    if (next) {
      var gap = Math.round((next.m - usd) * 100) / 100;
      if (!best || gap <= Math.max(10, usd * 0.35)) {
        html += '<p class="upsell">💡 הוסיפו עוד ' + fmt(gap) + ' לעגלה וקבלו ' + fmt(next.d) + (best ? ' הנחה במקום ' + fmt(best.d) : ' הנחה') + '.</p>';
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
      if (calc) calc.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
  if (modal) modal.addEventListener('click', function (e) { if (e.target === modal && !timer) modal.close(); });
  if (modal) modal.addEventListener('close', stopCountdown);
  // Coming back with the Back button (bfcache): never resume an old countdown.
  window.addEventListener('pageshow', function () { stopCountdown(); if (modal && modal.open) modal.close(); });

  // Restore codes revealed earlier in this session.
  document.querySelectorAll('[data-reveal]').forEach(function (b) {
    var id = b.getAttribute('data-reveal'), code = null;
    try { code = sessionStorage.getItem('rev:' + id); } catch (e) {}
    if (code && code === b.getAttribute('data-code')) markRevealed(id, code);
  });

  /* ---------- Reviews: fetch the latest from the bot (appear within a minute, not after the next build) ---------- */
  (function () {
    var sec = document.getElementById('reviews');
    var api = sec && sec.getAttribute('data-api');
    if (!api || !window.fetch) return;
    var e = function (t) { return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
    var safeColor = function (c) { return /^#[0-9a-f]{6}$/i.test(c || '') ? c : '#e5122f'; };
    var heD = function (d) { var p = String(d || '').split('-'); return p.length === 3 ? Number(p[2]) + '.' + Number(p[1]) + '.' + p[0] : ''; };
    var stars = function (n) { n = Math.max(1, Math.min(5, Number(n) || 0)); return '<span class="stars" aria-label="' + n + ' מתוך 5">' + '★'.repeat(n) + '<i>' + '★'.repeat(5 - n) + '</i></span>'; };
    fetch(api + '/api/reviews').then(function (r) { return r.json(); }).then(function (j) {
      var list = (j && j.reviews) || [];
      if (!list.length) return;
      var html = list.map(function (r) {
        var c = r.colors || [];
        return '<figure class="rv"><div class="rv-top"><span class="rv-av" aria-hidden="true" style="background:linear-gradient(150deg,' + safeColor(c[0]) + ',' + safeColor(c[1]) + ')">' + e(r.icon) + '</span><div><b>' + e(r.name) + '</b>' + stars(r.stars) + '</div></div><blockquote>' + e(r.text) + '</blockquote><figcaption>' + e(heD(r.d)) + ' · דרך טלגרם</figcaption></figure>';
      }).join('');
      var grid = document.getElementById('rv-grid');
      if (!grid) { var empty = sec.querySelector('.rv-empty'); grid = document.createElement('div'); grid.className = 'rv-grid'; grid.id = 'rv-grid'; if (empty) empty.replaceWith(grid); else sec.querySelector('.wrap').appendChild(grid); }
      grid.innerHTML = html;
      var sum = sec.querySelector('.rv-sum');
      if (sum && list.length >= 3) { var avg = Math.round(list.reduce(function (t, r) { return t + Number(r.stars); }, 0) / list.length * 10) / 10; sum.innerHTML = stars(Math.round(avg)) + ' <b>' + avg + '</b> מתוך 5 · ' + (j.total || list.length) + ' ביקורות · כל ביקורת נשלחת מחשבון טלגרם אמיתי, ומופיעה כמו שנכתבה.'; }
    }).catch(function () {});
  })();

  /* ---------- Deal Hunter input check (homepage form + finder): only AliExpress product links or ids ---------- */
  var isAliInput = function (v) {
    v = String(v || '').trim();
    return /^\d{10,20}$/.test(v) || /(^|\/\/|\s|\.)((?:[a-z0-9-]+\.)*aliexpress\.(com|us|ru)|s\.click\.aliexpress\.com|a\.aliexpress\.com)\//i.test(v);
  };
  var aliHint = 'זה לא קישור של AliExpress. העתיקו את הקישור מעמוד המוצר ונסו שוב.';
  var showHint = function (form, msg) {
    var hint = form.querySelector('.ft-error');
    if (!hint) { hint = document.createElement('p'); hint.className = 'ft-error'; hint.setAttribute('role', 'alert'); form.appendChild(hint); }
    hint.textContent = msg || '';
    hint.hidden = !msg;
  };
  document.querySelectorAll('.ft-form').forEach(function (f) {
    var inp = f.querySelector('input[name="url"]');
    f.addEventListener('submit', function (e) {
      if (!isAliInput(inp.value)) { e.preventDefault(); showHint(f, aliHint); inp.focus(); track('hunter_invalid_input'); }
    });
    inp.addEventListener('input', function () { showHint(f, ''); });
  });

  /* ---------- צייד הדילים: paste a product link → cheapest same product (via the Worker API) ---------- */
  var ff = $('finder-form');
  if (ff) {
    var api = ff.getAttribute('data-api') || '';
    var fin = $('finder-url'), fout = $('finder-out'), fgo = $('finder-go');
    var h = function (t) { return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
    var ils = function (n) { return n == null ? '' : '₪' + Number(n).toLocaleString('he-IL', { maximumFractionDigits: 2 }); };
    var safe = function (u) { return /^https:\/\/([a-z0-9-]+\.)*(aliexpress\.(com|us|ru)|alicdn\.com|aliexpress-media\.com)\//i.test(u || '') ? u : ''; };
    var card = function (p, kind) {
      var img = safe(p.image) ? p.image + '_220x220.jpg' : '';
      var link = safe(p.link) || '#';
      var save = p.savings > 0 ? '<span class="fp-save">חוסכים ' + ils(p.savings) + (p.savingsPct ? ' (' + p.savingsPct + '%)' : '') + '</span>' : '';
      var meta = [p.rating ? '⭐ ' + p.rating + '%' : '', p.sold ? p.sold.toLocaleString('he-IL') + ' נמכרו' : '', p.shop ? h(p.shop) : ''].filter(Boolean).join(' · ');
      return '<div class="fp' + (kind ? ' is-' + kind : '') + '">' + (img ? '<img src="' + h(img) + '" alt="" loading="lazy" onerror="this.onerror=null;this.src=this.src.replace(/_220x220\\.jpg$/,\'\')">' : '<span></span>') +
        '<div><h3>' + h(p.title) + '</h3><div class="fp-price"><strong>' + ils(p.price) + '</strong>' + save + '</div><div class="fp-meta">' + meta + '</div>' +
        '<a class="btn ' + (kind === 'orig' ? 'btn-ghost' : 'btn-primary') + '" href="' + h(link) + '" rel="nofollow sponsored" data-finder="' + h(p.id) + '">' + (kind === 'orig' ? 'למוצר המקורי' : 'לקנייה בעליאקספרס') + '</a></div></div>';
    };
    // Real estimate with our coupon codes: the best code whose minimum the product price meets (codes are checked in USD).
    var fRate = Number(ff.getAttribute('data-rate')) || 3.7, fTiers = [];
    try { fTiers = JSON.parse(ff.getAttribute('data-tiers') || '[]').filter(function (t) { return !expired(t.x); }); } catch (e) {}
    var couponEst = function (priceIls) {
      if (priceIls == null || !fTiers.length) return '';
      var usd = priceIls / fRate;
      var fit = fTiers.filter(function (t) { return t.m <= usd; }).sort(function (a, b) { return b.d - a.d; })[0];
      if (fit) {
        var after = Math.max(0, priceIls - fit.d * fRate);
        return '<div class="coupon-est"><span class="lbl">עם קוד קופון</span><span>עם הקוד <code>' + h(fit.code) + '</code> זה יוצא בערך <b>' + ils(Math.round(after * 100) / 100) + '</b> במקום ' + ils(priceIls) + ' 💰</span><button type="button" data-copy-code="' + h(fit.code) + '">העתקת קוד</button><small class="muted">הערכה לפי שער הדולר: ההנחה של $' + fit.d + ' יורדת בקופה כשהמוצרים בעגלה מעל $' + fit.m + '.</small></div>';
      }
      var first = fTiers.slice().sort(function (a, b) { return a.m - b.m; })[0];
      var gap = Math.ceil((first.m - usd) * fRate);
      return '<div class="coupon-est"><span class="lbl">טיפ</span><span>הוסיפו לעגלה עוד כ־' + ils(gap) + ' ותוכלו להשתמש בקוד <code>' + h(first.code) + '</code> ולקבל $' + first.d + ' הנחה 💡</span></div>';
    };
    document.addEventListener('click', function (e) {
      var b = e.target.closest('[data-copy-code]'); if (!b) return;
      var code = b.getAttribute('data-copy-code');
      copy(code).then(function () { b.textContent = 'הועתק ✓'; });
      track('finder_copy_code', { code: code });
    });
    var status = function (html, err) { fout.innerHTML = '<div class="finder-status' + (err ? ' is-err' : '') + '">' + html + '</div>'; };
    var run = function () {
      var v = (fin.value || '').trim();
      if (!v) { fin.focus(); return; }
      if (!isAliInput(v)) { status(aliHint, true); fin.focus(); return; }
      if (!api) { status('🎯 הצייד יוצא לדרך ממש בקרוב.'); return; }
      fgo.disabled = true;
      status('<span class="finder-spin"></span>מחפשים את אותו מוצר אצל מוכרים אחרים…');
      track('finder_search');
      var ctrl = 'AbortController' in window ? new AbortController() : null;
      var to = setTimeout(function () { if (ctrl) ctrl.abort(); }, 25000);
      fetch(api + '/api/cheapest?url=' + encodeURIComponent(v), ctrl ? { signal: ctrl.signal } : {})
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (res) {
          var j = res.j || {};
          if (!res.ok) { status(h(j.message || 'משהו השתבש. נסו שוב.'), true); return; }
          var o = j.original || {};
          var pool = (j.pool || []).filter(function (c) { return c && c.price != null && safe(c.link); });
          var same = pool.filter(function (c) { return c.level === 'exact' || c.level === 'likely'; }).sort(function (a, b) { return a.price - b.price; });
          var cheaper = same.length && o.price != null && same[0].price < o.price - 0.5 ? same[0] : null;
          track('finder_result', { same: same.length, cheaper: cheaper ? 1 : 0 });
          var html = '';
          if (cheaper) {
            html += '<div class="verdict win"><div><b>מצאנו זול יותר ב־' + ils(Math.round((o.price - cheaper.price) * 100) / 100) + ' 🎯</b><p>' + (cheaper.level === 'exact' ? 'אותו דגם' : 'כנראה אותו מוצר, בדקו גרסה וצבע') + ' אצל ' + h(cheaper.shop || 'מוכר אחר') + ': ' + ils(cheaper.price) + '</p></div><a class="btn btn-primary" href="' + h(safe(cheaper.link)) + '" rel="nofollow sponsored" data-finder="' + h(cheaper.id) + '">לקנייה במחיר הזה</a>' + couponEst(cheaper.price) + '</div>';
          } else if (safe(o.link) && !same.length) {
            html += '<div class="verdict"><div><b>לא מצאנו את אותו מוצר אצל מוכרים אחרים</b><p>אין לנו עם מה להשוות את המחיר הזה, אבל יש דרך לשלם עליו פחות:</p></div><a class="btn btn-primary" href="' + h(safe(o.link)) + '" rel="nofollow sponsored" data-finder="' + h(o.id) + '">לקנייה בעליאקספרס</a>' + couponEst(o.price) + '</div>';
          } else if (safe(o.link)) {
            html += '<div class="verdict king"><div><b>אתם ציידים! זה המחיר הכי טוב שמצאנו 🎯</b><p>השווינו ל' + (same.length === 1 ? 'הצעה נוספת של אותו מוצר, והיא לא זולה יותר.' : '־' + same.length + ' הצעות של אותו מוצר, ואף אחת לא זולה יותר.') + ' ועכשיו מורידים עוד:</p></div><a class="btn btn-primary" href="' + h(safe(o.link)) + '" rel="nofollow sponsored" data-finder="' + h(o.id) + '">לקנייה בעליאקספרס</a>' + couponEst(o.price) + '</div>';
          }
          var groups = [['exact', 'אותו דגם ✅', 'שם דגם זהה, בלי סתירה במאפיינים'], ['likely', 'כנראה אותו מוצר', 'דומה מאוד. בודקים גרסה, צבע ומפרט לפני שקונים'], ['similar', 'חלופות דומות', 'מוצרים קשורים, לא בהכרח אותו מוצר']];
          groups.forEach(function (g) {
            var list = pool.filter(function (c) { return (c.level || 'similar') === g[0]; }).sort(function (a, b) { return a.price - b.price; }).slice(0, g[0] === 'similar' ? 3 : 5);
            if (!list.length) return;
            html += '<h2 class="section-title">' + g[1] + '</h2><p class="muted">' + g[2] + '</p>';
            html += list.map(function (c) { var x = {}; for (var k in c) x[k] = c[k]; x.savings = o.price != null && g[0] !== 'similar' ? Math.round((o.price - c.price) * 100) / 100 : 0; x.savingsPct = 0; return card(x, c === cheaper ? 'best' : ''); }).join('');
          });
          html += '<h2 class="section-title">המוצר שהדבקתם</h2>' + card(o, 'orig');
          html += '<p class="muted">ההשוואה לפי שם הדגם ומאפיינים כמו קיבולת, הספק וסוג תקע. מחירים בשקלים לפני משלוח ומע״מ, ועשויים להשתנות. אל תשכחו להוסיף <a href="/#calc">קוד קופון</a>.</p>';
          fout.innerHTML = html;
          fout.scrollIntoView({ behavior: 'smooth', block: 'start' });
        })
        .catch(function () { status('השרת לא ענה. בדקו את החיבור ונסו שוב.', true); })
        .then(function () { clearTimeout(to); fgo.disabled = !api; });
    };
    ff.addEventListener('submit', function (e) { e.preventDefault(); run(); });
    document.addEventListener('click', function (e) { var a = e.target.closest('[data-finder]'); if (a) track('finder_click', { product_id: a.getAttribute('data-finder') }); });
    // Pre-fill from ?url= / ?text= (shared links, Android share target) and run straight away.
    try {
      var qs = new URLSearchParams(location.search);
      var pre = qs.get('url') || qs.get('text') || '';
      if (pre) { fin.value = pre; run(); }
    } catch (e) {}
  }

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
