// YeshDeal 2.0 preview – tiny client (no framework). Uses the same tested logic as the build.
import { parseAmount, toUSD, pickCoupon, parseProductInput, classifyMatch } from './logic.mjs';

const $ = (s, r = document) => r.querySelector(s);
const AFF = document.body.dataset.aff || '';
const usd = (n) => '$' + (Math.round(n * 100) / 100).toLocaleString('en-US');
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* toast after copying: code copied + affiliate link to AliExpress (same attribution as production) */
function toast(code) {
  let t = $('#toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; t.setAttribute('role', 'status'); document.body.append(t); }
  t.innerHTML = `✅ הקוד <b dir="ltr">${esc(code)}</b> הועתק${AFF ? ` · <a href="${esc(AFF)}" rel="nofollow sponsored noopener">לעליאקספרס ←</a>` : ''}`;
  t.classList.add('on');
  clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('on'), 6000);
}
async function copy(code) {
  try { await navigator.clipboard.writeText(code); } catch {
    const ta = document.createElement('textarea'); ta.value = code; document.body.append(ta); ta.select(); try { document.execCommand('copy'); } catch {} ta.remove();
  }
  toast(code);
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-code]');
  if (b && b.tagName === 'BUTTON') { e.preventDefault(); copy(b.dataset.code); }
});

/* coupon calculator */
const calc = $('#calc');
if (calc) {
  const tiers = JSON.parse($('#tiers').textContent || '[]');
  const rate = Number(calc.dataset.rate) || 3.7;
  const input = $('#calc-in'), out = $('#calc-out');
  let cur = 'USD';
  const MSG = { negative: 'סכום לא יכול להיות שלילי.', zero: 'הקלידו סכום גדול מ-0.', invalid: 'הקלידו מספר בלבד, למשל 60 או 45.50', too_large: 'זה סכום גדול מדי לעגלה.' };
  const run = () => {
    const p = parseAmount(input.value);
    if (!p.ok) { out.textContent = p.reason === 'empty' ? 'הקלידו את סכום העגלה.' : MSG[p.reason]; out.classList.toggle('err', p.reason !== 'empty'); return; }
    out.classList.remove('err');
    const v = toUSD(p.value, cur, rate);
    const r = pickCoupon(v, tiers);
    const approx = cur === 'ILS' ? ` (בערך ${usd(v)})` : '';
    let h = r.best
      ? `<div class="best"><span>לעגלה שלכם${approx}: <b>${usd(r.best.d)} הנחה</b> עם <b dir="ltr">${esc(r.best.code)}</b></span><button type="button" class="btn btn-sm" data-code="${esc(r.best.code)}">העתק קוד</button></div>`
      : `<div>הקוד הראשון מתחיל בעגלה מעל ${usd(Math.min(...tiers.map((t) => t.m)))}${approx}.</div>`;
    if (r.upsell && r.next) h += `<p class="up">💡 עוד ${usd(r.gap)} בעגלה ותקבלו ${usd(r.next.d)} הנחה${r.best ? ` במקום ${usd(r.best.d)}` : ''}.</p>`;
    out.innerHTML = h;
  };
  input.addEventListener('input', run);
  calc.querySelectorAll('[data-cur]').forEach((b) => b.addEventListener('click', () => {
    cur = b.dataset.cur;
    calc.querySelectorAll('[data-cur]').forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
    input.placeholder = cur === 'ILS' ? 'למשל 220' : 'למשל 60';
    run();
  }));
}

/* Deal Hunter input: validate locally; live search only when the API is configured */
const form = document.querySelector('form.hunt.big');
const state = $('#h-state');
if (form && state) {
  const q = new URLSearchParams(location.search).get('url');
  const inp = form.querySelector('input');
  if (q) inp.value = q;
  const handle = async () => {
    const r = parseProductInput(inp.value);
    if (!r.ok) {
      state.className = 'h-state err';
      state.textContent = r.reason === 'not_aliexpress' ? 'אפשר להדביק רק קישור לעליאקספרס.' : 'לא מצאנו קישור. הדביקו קישור למוצר מעליאקספרס.';
      return;
    }
    const api = form.dataset.api;
    if (!api) {
      state.className = 'h-state info';
      state.innerHTML = `הקישור תקין${r.id ? ` (מוצר <span dir="ltr">${esc(r.id)}</span>)` : ' (קישור מקוצר)'}. החיפוש החי יופעל כשה-API הרשמי יחובר. <a href="/test/hunter/result/">לראות הדגמה ←</a>`;
      return;
    }
    state.className = 'h-state info'; state.textContent = '🎯 הצייד סורק את המוכרים…';
    const box = document.getElementById('h-results');
    if (box) box.innerHTML = '';
    try {
      const res = await fetch(`${api}/api/cheapest?url=${encodeURIComponent(r.url)}`);
      const j = await res.json();
      if (!res.ok) { state.className = 'h-state err'; state.textContent = j.message || 'החיפוש נכשל. נסו שוב.'; return; }
      state.textContent = '';
      renderResults(j, box);
    } catch { state.className = 'h-state err'; state.textContent = 'החיפוש נכשל. נסו שוב בעוד רגע.'; }
  };
  form.addEventListener('submit', (e) => { e.preventDefault(); history.replaceState(null, '', `?url=${encodeURIComponent(inp.value)}`); handle(); });
  if (q) handle();
}

/* category filters (preview: price buckets in ILS from the card text) */
document.querySelectorAll('.filters').forEach((f) => f.addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  f.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
  const [lo, hi] = b.textContent.includes('עד') ? [0, 50] : b.textContent.includes('–') ? [50, 150] : [0, Infinity];
  f.parentElement.querySelectorAll('.grid .pc').forEach((c) => {
    const n = Number((c.querySelector('.price b')?.textContent || '').replace(/[^\d]/g, ''));
    c.hidden = !(n >= lo && n <= hi);
  });
}));

/* live Deal Hunter results: classify the pool honestly, show savings only for exact/likely matches */
function renderResults(j, box) {
  if (!box) return;
  const o = j.original || {};
  const ils = (n) => '₪' + (Math.round(n * 100) / 100).toLocaleString('he-IL');
  const when = new Date(j.at || Date.now()).toLocaleString('he-IL', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' });
  const pool = (j.pool || j.alternatives || []).map((c) => ({ ...c, m: classifyMatch({ title: o.enTitle || o.title }, { title: c.enTitle || c.title }) }));
  const groups = [['exact', '✅ התאמה מדויקת', 'אותו דגם, בלי סתירה במאפיינים'], ['likely', '🟡 כנראה אותו מוצר – כדאי לבדוק', 'דומה מאוד. בדקו גרסה, צבע ומפרט לפני שקונים'], ['similar', '🔁 חלופות דומות', 'מוצרים קשורים, לא בהכרח אותו מוצר']];
  const img = (u) => (u ? `<img src="${esc(u)}_220x220.jpg" alt="" loading="lazy" width="110" height="110" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='${esc(u)}'">` : '');
  const card = (c) => {
    const save = o.price != null && c.m.level !== 'similar' ? Math.round((o.price - c.price) * 100) / 100 : null;
    return `<article class="offer lvl-${c.m.level}"><div class="o-img">${img(c.image)}</div><div class="o-main"><b>${esc(c.title)}</b><span class="muted small">${esc(c.shop || '')}${c.rating != null ? ` · ${c.rating}% חיובי` : ''}${c.sold ? ` · ${c.sold.toLocaleString('he-IL')} נמכרו` : ''}</span></div>
<div class="o-act"><b class="o-price">${ils(c.price)}</b>${save > 0 ? `<span class="save">זול ב-${ils(save)}</span>` : ''}<a class="btn btn-sm" href="${esc(c.link)}" rel="nofollow sponsored noopener">לעליאקספרס ←</a></div></article>`;
  };
  let h = `<div class="searched live"><div class="o-img">${img(o.image)}</div><div><span class="muted small">המוצר שחיפשתם</span><h2>${esc(o.title || '')}</h2><p><b>${o.price != null ? ils(o.price) : ''}</b> · משלוח ומע״מ מוצגים בקופה · <a href="${esc(o.link || '')}" rel="nofollow sponsored noopener">לעמוד המוצר ←</a></p><p class="muted small">נבדק מול ה-API הרשמי: ${when}</p></div></div>`;
  const any = groups.map(([lvl, t, sub]) => { const l = pool.filter((c) => c.m.level === lvl).sort((a, b) => a.price - b.price); return l.length ? `<h3 class="grp">${t}</h3><p class="muted small">${sub}</p>${l.map(card).join('')}` : ''; }).join('');
  h += any || '<div class="note">לא מצאנו הצעה אחרת לאותו מוצר. כנראה שהמחיר שבחרתם כבר טוב 👌 אפשר להוסיף עליו <a href="/test/#coupons">קוד קופון לפי סכום העגלה</a>.</div>';
  h += '<div class="note small">ההשוואה מבוססת על שם המוצר ומאפיינים כמו דגם, קיבולת וסוג תקע. מחירים בשקלים לפני משלוח ומע״מ, ועשויים להשתנות עד הקנייה.</div>';
  box.innerHTML = h;
}
