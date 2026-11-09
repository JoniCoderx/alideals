// Facebook post generator: a private page (/admin/fb/) with ready-to-copy posts for today + the next days.
// The owner publishes them manually (the page can't be connected to automation).
// Rotation is deterministic by date, so every build on the same day shows the same posts,
// and over consecutive days it cycles through all approved products and all tips/guides.
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { telegramPosts } from '../src/content/telegram-posts.mjs';

const STORE = 'עליאקספרס';
const SITE_HOST = 'yeshdeal.com';
const FALLBACK_IMG = '/assets/og-share.jpg';
const UPCOMING_DAYS = 6;

const money = (n, cur = 'USD') => (cur === 'ILS' ? `₪${n}` : `$${n}`);
const shortDate = (d) => { const [, m, dd] = d.split('-'); return `${Number(dd)}.${Number(m)}`; };
const addDays = (d, n) => { const t = new Date(`${d}T12:00:00Z`); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const dayIndex = (d) => Math.floor(Date.parse(`${d}T12:00:00Z`) / 86400000);
const weekday = (d) => new Intl.DateTimeFormat('he-IL', { weekday: 'long', timeZone: 'UTC' }).format(new Date(`${d}T12:00:00Z`));
const lines = (arr) => arr.filter((l, i, a) => l !== '' || (i > 0 && a[i - 1] !== '')).join('\n').trim();

async function loadProducts(root) {
  try {
    const j = JSON.parse(await fs.readFile(path.join(root, 'data/v2/telegram-products.json'), 'utf8'));
    return (j.items || []).filter((x) => /^\d{6,20}$/.test(String(x.id)) && x.image && x.title && existsSync(path.join(root, x.image)));
  } catch { return []; }
}

// Tip/guide link: prefer a page on our site over a /go/ affiliate redirect.
function tipLink(post, abs) {
  const own = (post.buttons || []).find(([, p]) => p && p.startsWith('/') && !p.startsWith('/go/'));
  return own ? { label: own[0], url: abs(own[1]) } : { label: '🔥 קודי קופון פעילים', url: abs('/') };
}

function productText(x, abs) {
  return lines([
    `${x.emoji || '🛒'} ${x.title}`,
    ...(x.lines || []).map((l) => `✅ ${l}`),
    '',
    `💡 לפני התשלום, בחרו קוד קופון לפי סכום העגלה באתר ${SITE_HOST}`,
    '👇 לפרטים ולמחיר המעודכן:',
    abs(`/p/?i=${x.id}`),
  ]);
}

function tipText(post, abs) {
  const { label, url } = tipLink(post, abs);
  return lines([`${post.emoji} ${post.title}`, '', post.text, '', `${String(label).replace(/[?:]+$/, '')}:`, url]);
}

const tipCard = (post) => ({ kind: post.type, emoji: post.emoji, title: post.title, points: post.points, site: SITE_HOST });

async function render(renderCard, card) {
  if (!renderCard) return null;
  try { return await renderCard(card); } catch { return null; }
}

/**
 * Builds dist/admin/fb/index.html (+ images in admin/fb/img/).
 * @param site        config/site.json object (uses site.name)
 * @param coupons     active coupons (as in build.mjs)
 * @param today       'YYYY-MM-DD'
 * @param write       build.mjs write(rel, content) – content may be a string or a Buffer
 * @param layout      build.mjs layout()
 * @param esc, abs    build.mjs helpers
 * @param renderCard  from telegram-card.mjs (returns PNG Buffer or null)
 * @param root        repo root (to read data/v2/telegram-products.json and product images)
 * @param event       optional active sale event { slug, name, start, end } → coupon post links to /sale/<slug>/
 */
export async function buildFacebookPage({ site, coupons = [], today, write, layout, esc, abs, renderCard, root, event = null }) {
  const products = await loadProducts(root);
  const tips = telegramPosts.filter((p) => p.type === 'tip' || p.type === 'guide');
  const idx = dayIndex(today);
  const pick = (arr, i) => (arr.length ? arr[((i % arr.length) + arr.length) % arr.length] : null);

  const productImage = async (x) => {
    const rel = `admin/fb/img/${x.id}.jpg`;
    await write(rel, await fs.readFile(path.join(root, x.image)));
    return `/${rel}`;
  };
  const tipImage = async (post, name) => {
    const png = await render(renderCard, tipCard(post));
    if (!png) return FALLBACK_IMG;
    const rel = `admin/fb/img/${name}.png`;
    await write(rel, png);
    return `/${rel}`;
  };

  // ---- Today ----
  const todayPosts = [];
  const prod = pick(products, idx);
  if (prod) todayPosts.push({ kind: 'product', label: '🛒 פוסט מוצר', img: await productImage(prod), file: `yeshdeal-${today}-product.jpg`, text: productText(prod, abs) });

  const real = coupons
    .filter((c) => c.code && !c.sample && (!c.expires || c.expires >= today))
    .sort((a, b) => a.minOrder - b.minOrder);
  if (real.length) {
    const top = [...real].sort((a, b) => b.discount - a.discount)[0];
    const low = real[0];
    const until = [...new Set(real.map((c) => c.expires).filter(Boolean))].sort();
    const saleOn = event && event.slug && event.start <= today && (!event.end || event.end >= today);
    const saleName = saleOn ? event.name.split(' –')[0] : '';
    const link = abs(saleOn ? `/sale/${event.slug}/` : '/');
    const untilLine = until.length === 1 ? `⏳ בתוקף עד ${shortDate(until[0])}` : until.length ? `⏳ הקודים הראשונים פגים ב־${shortDate(until[0])}` : '';
    const png = await render(renderCard, {
      kind: 'spot', bigNumber: money(top.discount, top.currency), bigLabel: `הנחה בקנייה מעל ${money(top.minOrder, top.currency)}`, title: top.code,
      points: ['מדביקים בתשלום, בשדה "קוד מבצע"', until.length === 1 ? `בתוקף עד ${shortDate(until[0])}` : ''].filter(Boolean), site: SITE_HOST,
    });
    if (png) await write('admin/fb/img/codes.png', png);
    todayPosts.push({
      kind: 'codes', label: '🎟️ פוסט קודי קופון', img: png ? '/admin/fb/img/codes.png' : FALLBACK_IMG, file: `yeshdeal-${today}-codes.${png ? 'png' : 'jpg'}`,
      text: lines([
        saleName ? `🔥 ${saleName} ב${STORE}: קודי קופון עד ${money(top.discount, top.currency)} הנחה` : `🔥 קודי קופון ל${STORE}: עד ${money(top.discount, top.currency)} הנחה`,
        real.length > 1 ? `💰 ${real.length} מדרגות, מ־${money(low.discount, low.currency)} הנחה מעל ${money(low.minOrder, low.currency)} ועד ${money(top.discount, top.currency)} הנחה מעל ${money(top.minOrder, top.currency)}` : `💰 ${money(top.discount, top.currency)} הנחה בקנייה מעל ${money(top.minOrder, top.currency)}`,
        '🛒 ממלאים עגלה, ובתשלום מדביקים בשדה "קוד מבצע" את הקוד שמתאים לסכום',
        untilLine,
        '',
        '👇 כל הקודים, ומחשבון שבוחר את הקוד לעגלה שלכם:',
        link,
      ]),
    });
  }

  const tip = pick(tips, idx);
  if (tip) todayPosts.push({ kind: 'tip', label: tip.type === 'guide' ? '📖 פוסט מדריך' : '💡 פוסט טיפ', img: await tipImage(tip, 'tip'), file: `yeshdeal-${today}-tip.png`, text: tipText(tip, abs) });

  // ---- Next days (product + tip) ----
  const upcoming = [];
  for (let d = 1; d <= UPCOMING_DAYS; d++) {
    const date = addDays(today, d);
    const posts = [];
    const p = pick(products, idx + d);
    if (p) posts.push({ kind: 'product', label: '🛒 מוצר', img: await productImage(p), file: `yeshdeal-${date}-product.jpg`, text: productText(p, abs) });
    const t = pick(tips, idx + d);
    if (t) {
      const img = await tipImage(t, `tip-${date}`);
      posts.push({ kind: 'tip', label: t.type === 'guide' ? '📖 מדריך' : '💡 טיפ', img, file: `yeshdeal-${date}-tip.${img === FALLBACK_IMG ? 'jpg' : 'png'}`, text: tipText(t, abs) });
    }
    upcoming.push({ date, posts });
  }

  let n = 0;
  const card = (p) => {
    const id = `fbp${++n}`;
    return `<article class="fbp">
<h3>${esc(p.label)}</h3>
<img src="${esc(p.img)}" alt="" loading="lazy" width="540" height="540">
<a class="btn btn-ghost fbp-dl" href="${esc(p.img)}" download="${esc(p.file)}">⬇️ הורדת תמונה</a>
<textarea id="${id}" readonly dir="rtl" rows="${p.text.split('\n').length + 1}">${esc(p.text)}</textarea>
<button class="btn btn-primary fbp-copy" type="button" data-t="${id}">📋 העתקת טקסט</button>
</article>`;
  };

  const body = `<style>
.fbh h1{margin:0 0 4px}.fbh p{margin:4px 0}
.fbgrid{display:grid;gap:18px;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));margin:18px 0}
.fbp{background:#fff;border:1px solid #eee2dc;border-radius:16px;padding:14px;display:flex;flex-direction:column;gap:10px;box-shadow:0 4px 16px rgba(0,0,0,.05)}
.fbp h3{margin:0;font-size:1.05rem}
.fbp img{width:100%;height:auto;aspect-ratio:1;object-fit:cover;border-radius:12px;background:#f6efeb}
.fbp textarea{width:100%;box-sizing:border-box;font:inherit;font-size:.95rem;line-height:1.5;padding:10px;border:1px solid #e3d6d0;border-radius:10px;resize:vertical;background:#fffaf7;color:inherit;unicode-bidi:plaintext}
.fbp .btn{width:100%}
.fbday{margin:22px 0 6px;font-size:1.15rem}
.fbmore{margin-top:26px;border-top:1px solid #eee2dc;padding-top:14px}
.fbmore summary{cursor:pointer;font-weight:700;font-size:1.1rem}
</style>
<section class="section"><div class="wrap">
<div class="fbh"><h1>פוסטים לפייסבוק</h1>
<p class="muted">${esc(weekday(today))}, ${esc(shortDate(today))} · ${todayPosts.length} פוסטים להיום. מורידים את התמונה, מעתיקים את הטקסט ומפרסמים בעמוד. הפוסטים מתחלפים כל יום.</p></div>
<div class="fbgrid">${todayPosts.map(card).join('')}</div>
${upcoming.some((u) => u.posts.length) ? `<details class="fbmore"><summary>הימים הבאים (${UPCOMING_DAYS}): לתזמון מראש</summary>
${upcoming.map((u) => `<h2 class="fbday">${esc(weekday(u.date))}, ${esc(shortDate(u.date))}</h2><div class="fbgrid">${u.posts.map(card).join('')}</div>`).join('')}
<p class="muted">פוסט הקודים לא מופיע כאן כי הקודים משתנים. מפרסמים אותו מהעמוד הזה ביום עצמו.</p></details>` : ''}
</div></section>
<script>(function(){function fit(t){t.style.height='auto';t.style.height=(t.scrollHeight+4)+'px'}var ts=document.querySelectorAll('.fbp textarea');for(var i=0;i<ts.length;i++)fit(ts[i]);document.addEventListener('toggle',function(){for(var i=0;i<ts.length;i++)fit(ts[i])},true);window.addEventListener('resize',function(){for(var i=0;i<ts.length;i++)fit(ts[i])});document.addEventListener('click',function(e){var b=e.target.closest('.fbp-copy');if(!b)return;var t=document.getElementById(b.getAttribute('data-t'));
function ok(){var o=b.textContent;b.textContent='✓ הועתק';setTimeout(function(){b.textContent=o},1800)}
function legacy(){t.focus();t.select();t.setSelectionRange(0,t.value.length);try{document.execCommand('copy');ok()}catch(_){b.textContent='סמנו והעתיקו ידנית'}}
if(navigator.clipboard&&window.isSecureContext){navigator.clipboard.writeText(t.value).then(ok,legacy)}else legacy()})})();</script>`;

  await write('admin/fb/index.html', layout({
    title: `פוסטים לפייסבוק | ${site.name}`, description: 'כלי פנימי', pathname: '/admin/fb/', noindex: true, body,
  }));
  return { today: todayPosts.length, upcoming: upcoming.reduce((s, u) => s + u.posts.length, 0) };
}
