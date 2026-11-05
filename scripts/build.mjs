// Static site generator for אליקוד. Zero dependencies.
// Reads config/site.json + data/coupons.json + data/generated.json → writes dist/
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { faq } from '../src/content/faq.mjs';
import { guides } from '../src/content/guides.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const TZ = 'Asia/Jerusalem';

const site = await readJSON('config/site.json');
const manual = await readJSON('data/coupons.json');
const gen = await readJSON('data/generated.json', {});

const now = new Date();
const today = ymd(now);
const monthYear = new Intl.DateTimeFormat('he-IL', { month: 'long', year: 'numeric', timeZone: TZ }).format(now);
const updatedHe = new Intl.DateTimeFormat('he-IL', { day: 'numeric', month: 'long', year: 'numeric', timeZone: TZ }).format(new Date(gen.updatedAt ?? now));

/* ------------------------------------------------------------------ */
/* Data model                                                          */
/* ------------------------------------------------------------------ */
const links = gen.links || {};
const resolveLink = (item) =>
  item.link || (item.landing && links[item.landing]) || site.affiliate.defaultLink;

export function mergeCoupons(manualList, sheetList, dateStr) {
  const byKey = new Map();
  for (const c of [...manualList, ...(sheetList || [])]) {
    const key = c.id || `${c.code}-${c.discount}-${c.minOrder}`;
    byKey.set(key, { ...(byKey.get(key) || {}), ...c, id: slug(key) });
  }
  const all = [...byKey.values()].filter((c) => c.type !== 'deal');
  const active = all.filter((c) => !c.expires || c.expires >= dateStr).filter((c) => !c.starts || c.starts <= dateStr);
  const expired = all.filter((c) => c.expires && c.expires < dateStr);
  active.sort((a, b) => (a.minOrder ?? 0) - (b.minOrder ?? 0) || (b.discount ?? 0) - (a.discount ?? 0));
  return { active, expired };
}

const { active: coupons, expired } = mergeCoupons(manual.coupons, gen.sheetCoupons, today);
const deals = [...manual.deals, ...(gen.sheetCoupons || []).filter((c) => c.type === 'deal')].map((d) => ({ ...d, id: slug(d.id || d.title) }));
const knownCodes = new Set(coupons.map((c) => c.code));
const community = (gen.community || []).filter((c) => !knownCodes.has(c.code)).map((c) => ({ ...c, id: slug(`r-${c.code}-${c.discount}`) }));
const realCodes = coupons.filter((c) => !c.sample);
const maxDiscount = Math.max(0, ...(realCodes.length ? realCodes : coupons).map((c) => c.discount || 0));
const activeEvent = (manual.events || []).find((e) => e.start <= addDays(today, 7) && e.end >= today);

if (!realCodes.length) console.warn('⚠  All coupons are samples – edit data/coupons.json or connect a Google Sheet.');
if (/REPLACE/.test(site.affiliate.defaultLink)) console.warn('⚠  affiliate.defaultLink is still a placeholder in config/site.json');

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function slug(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9\u0590-\u05ff]+/g, '-').replace(/^-|-$/g, '');
}
function ymd(d) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d);
}
function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function heDate(dateStr) {
  return new Intl.DateTimeFormat('he-IL', { day: 'numeric', month: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(dateStr + 'T12:00:00Z'));
}
function daysLeft(dateStr) {
  return Math.round((new Date(dateStr + 'T23:59:59Z') - new Date(today + 'T00:00:00Z')) / 86400000);
}
const money = (n, cur = 'USD') => (cur === 'ILS' ? `₪${n}` : `$${n}`);
const abs = (p) => site.url.replace(/\/$/, '') + p;
const jsonLd = (obj) => `<script type="application/ld+json">${JSON.stringify(obj).replace(/</g, '\\u003c')}</script>`;
async function readJSON(rel, fallback) {
  try { return JSON.parse(await fs.readFile(path.join(ROOT, rel), 'utf8')); }
  catch (e) { if (fallback !== undefined) return fallback; throw e; }
}
async function write(rel, content) {
  const f = path.join(DIST, rel);
  await fs.mkdir(path.dirname(f), { recursive: true });
  await fs.writeFile(f, content);
}

/* ------------------------------------------------------------------ */
/* Components                                                          */
/* ------------------------------------------------------------------ */
const ICON = {
  logo: `<svg viewBox="0 0 40 40" aria-hidden="true"><rect width="40" height="40" rx="11" fill="url(#lg)"/><path d="M11 14.5c0-1.4 1.1-2.5 2.5-2.5h13c1.4 0 2.5 1.1 2.5 2.5v2.2a3.3 3.3 0 0 0 0 6.6v2.2c0 1.4-1.1 2.5-2.5 2.5h-13a2.5 2.5 0 0 1-2.5-2.5v-2.2a3.3 3.3 0 0 0 0-6.6z" fill="#fff"/><path d="m17 23.5 6-7" stroke="#ff3d2e" stroke-width="2.2" stroke-linecap="round"/><circle cx="17.3" cy="17" r="1.6" fill="#ff3d2e"/><circle cx="22.7" cy="23" r="1.6" fill="#ff3d2e"/><defs><linearGradient id="lg" x1="0" y1="0" x2="40" y2="40"><stop stop-color="#ff6a2b"/><stop offset="1" stop-color="#e8113a"/></linearGradient></defs></svg>`,
  check: `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 10.5 3.2 3L15 6.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  clock: `<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="7.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M10 6v4.3l2.8 1.7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  copy: `<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M13 4.5H5.5a1 1 0 0 0-1 1V13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  arrow: `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M12 5 7 10l5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
};

function couponCard(c, { compact = false } = {}) {
  const cur = c.currency || 'USD';
  const dl = c.expires ? daysLeft(c.expires) : null;
  const urgency = !c.sample && dl !== null && dl <= 3 ? `<span class="tag tag-hot">${ICON.clock} נגמר ${dl <= 0 ? 'היום' : dl === 1 ? 'מחר' : `בעוד ${dl} ימים`}</span>` : '';
  const title = c.title || `${money(c.discount, cur)} הנחה בקנייה מעל ${money(c.minOrder, cur)}`;
  const hidden = c.sample || !c.code;
  const masked = hidden ? '' : '•'.repeat(Math.max(4, c.code.length - 2)) + `<b>${esc(c.code.slice(-2))}</b>`;
  const isCommunity = c.source === 'community';
  return `
<article class="coupon${c.featured ? ' is-featured' : ''}${isCommunity ? ' is-community' : ''}" id="c-${c.id}" data-id="${c.id}">
  <div class="coupon-value">
    <span class="v-amount">${money(c.discount, cur)}</span>
    <span class="v-label">הנחה</span>
  </div>
  <div class="coupon-body">
    <h3 class="coupon-title">${esc(title)}</h3>
    <div class="coupon-meta">
      ${isCommunity
        ? `<span class="tag tag-muted">מהקהילה · לא אומת</span>`
        : c.sample ? `<span class="tag">דרך מרכז הקופונים</span>`
        : c.verified ? `<span class="tag tag-ok">${ICON.check} נבדק ${heDate(c.verified)}</span>`
        : `<span class="tag tag-ok">${ICON.check} עודכן ${esc(updatedHe)}</span>`}
      ${c.expires && !c.sample ? `<span class="tag">בתוקף עד ${heDate(c.expires)}</span>` : ''}
      ${urgency}
      ${c.featured ? '<span class="tag tag-star">הכי משתלם</span>' : ''}
    </div>
    ${c.note && !compact ? `<p class="coupon-note">${esc(c.note)}</p>` : ''}
  </div>
  <div class="coupon-cta">
    ${hidden
      ? `<a class="btn btn-primary" href="/go/${c.id}/" target="_blank" rel="nofollow sponsored noopener" data-go="${c.id}">לקבלת הקופון ${ICON.arrow}</a>`
      : `<button class="btn btn-reveal" type="button" data-reveal="${c.id}" data-code="${esc(c.code)}" data-title="${esc(title)}">
          <span class="reveal-mask" aria-hidden="true">${masked}</span>
          <span class="reveal-label">הצג קוד</span>
        </button>`}
  </div>
</article>`;
}

function dealCard(d) {
  return `
<article class="deal-tile">
  ${d.badge ? `<span class="tag tag-star">${esc(d.badge)}</span>` : ''}
  <h3>${esc(d.title)}</h3>
  <p>${esc(d.text || '')}</p>
  <a class="btn btn-ghost" href="/go/${d.id}/" target="_blank" rel="nofollow sponsored noopener" data-go="${d.id}">למבצע ${ICON.arrow}</a>
</article>`;
}

function productCard(p) {
  const price = p.price != null ? `₪${p.price.toFixed(2)}` : '';
  const orig = p.originalPrice && p.originalPrice > (p.price || 0) ? `<s>₪${p.originalPrice.toFixed(2)}</s>` : '';
  return `
<a class="product" href="${esc(p.link)}" target="_blank" rel="nofollow sponsored noopener" data-product="${esc(p.id)}">
  <div class="product-img"><img src="${esc(p.image)}_350x350.jpg" alt="${esc(p.title)}" loading="lazy" decoding="async" width="350" height="350"></div>
  ${p.discount ? `<span class="product-off">-${esc(String(p.discount).replace('%', ''))}%</span>` : ''}
  <div class="product-info">
    <h3>${esc(p.title)}</h3>
    <div class="product-price"><strong>${price}</strong>${orig}</div>
    <div class="product-sub">${p.sold ? `${p.sold.toLocaleString('he-IL')} נמכרו` : ''}${p.rating ? ` · ${esc(p.rating)} שביעות רצון` : ''}</div>
  </div>
</a>`;
}

function tierTable(list) {
  const rows = list.filter((c) => c.minOrder != null);
  if (!rows.length) return '';
  return `
<div class="table-wrap">
<table class="tiers">
  <caption>מדרגות קודי ההנחה של אליאקספרס – ${esc(monthYear)}</caption>
  <thead><tr><th>סכום בעגלה</th><th>הנחה</th><th>קוד</th></tr></thead>
  <tbody>
  ${rows.map((c, i) => {
    const next = rows[i + 1];
    const range = next ? `${money(c.minOrder)} עד ${money(+(next.minOrder - 0.01).toFixed(2))}` : `${money(c.minOrder)} ומעלה`;
    return `<tr><td>${range}</td><td><strong>${money(c.discount)}</strong></td><td>${c.sample ? `<a href="/go/${c.id}/" target="_blank" rel="nofollow sponsored noopener" data-go="${c.id}">לקבלת הקוד</a>` : `<button class="code-chip" type="button" data-reveal="${c.id}" data-code="${esc(c.code)}" data-title="${esc(`${money(c.discount)} הנחה מעל ${money(c.minOrder)}`)}">${esc(c.code)}</button>`}</td></tr>`;
  }).join('')}
  </tbody>
</table>
</div>`;
}

function breadcrumbs(items) {
  const all = [{ name: 'ראשי', url: '/' }, ...items];
  return {
    html: `<nav class="crumbs" aria-label="פירורי לחם"><ol>${all.map((b, i) => i === all.length - 1 ? `<li aria-current="page">${esc(b.name)}</li>` : `<li><a href="${b.url}">${esc(b.name)}</a></li>`).join('')}</ol></nav>`,
    ld: { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: all.map((b, i) => ({ '@type': 'ListItem', position: i + 1, name: b.name, item: abs(b.url) })) },
  };
}

/* ------------------------------------------------------------------ */
/* Layout                                                              */
/* ------------------------------------------------------------------ */
function layout({ title, description, pathname, body, ld = [], noindex = false, ogType = 'website' }) {
  const canonical = abs(pathname);
  const ga = site.analytics?.ga4Id;
  const nav = [
    ['/', 'קודי קופון'],
    ['/deals/', 'דילים חמים'],
    ...(activeEvent ? [[`/sale/${activeEvent.slug}/`, activeEvent.name.split(' –')[0]]] : []),
    ['/guides/', 'מדריכים'],
  ];
  return `<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${canonical}">
${noindex ? '<meta name="robots" content="noindex,nofollow">' : '<meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1">'}
<meta property="og:type" content="${ogType}">
<meta property="og:locale" content="${site.locale}">
<meta property="og:site_name" content="${esc(site.name)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${canonical}">
<meta property="og:image" content="${abs('/assets/og.png')}">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#ff3d2e">
<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/assets/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Rubik:wght@400;500;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/style.css?v=${BUILD_ID}">
${ga ? `<script async src="https://www.googletagmanager.com/gtag/js?id=${esc(ga)}"></script><script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','${esc(ga)}');</script>` : ''}
${ld.map(jsonLd).join('\n')}
</head>
<body>
<a class="skip" href="#main">דלג לתוכן</a>
${activeEvent ? `<div class="topbar"><a href="/sale/${activeEvent.slug}/">🔥 ${esc(activeEvent.name)} – כל הקודים של המבצע כבר כאן ←</a></div>` : ''}
<header class="site-header">
  <div class="wrap header-row">
    <a class="brand" href="/" aria-label="${esc(site.name)} – דף הבית">${ICON.logo}<span>${esc(site.name)}</span></a>
    <nav class="main-nav" aria-label="ניווט ראשי">
      ${nav.map(([href, label]) => `<a href="${href}"${href === pathname ? ' aria-current="page"' : ''}>${esc(label)}</a>`).join('')}
    </nav>
  </div>
</header>
<main id="main">
${body}
</main>
<footer class="site-footer">
  <div class="wrap footer-grid">
    <div>
      <a class="brand brand-footer" href="/">${ICON.logo}<span>${esc(site.name)}</span></a>
      <p>${esc(site.tagline)}. האתר אינו קשור רשמית לאליאקספרס או לקבוצת עליבאבא.</p>
    </div>
    <div>
      <h2>קופונים</h2>
      <a href="/">קוד קופון אליאקספרס</a>
      <a href="/deals/">דילים חמים</a>
      ${(manual.events || []).map((e) => `<a href="/sale/${e.slug}/">קופונים ל${esc(e.name.split(' –')[0])}</a>`).join('')}
    </div>
    <div>
      <h2>מדריכים</h2>
      ${guides.slice(0, 5).map((g) => `<a href="/guides/${g.slug}/">${esc(g.title.split(' –')[0])}</a>`).join('')}
    </div>
    <div>
      <h2>האתר</h2>
      <a href="/about/">אודות</a>
      <a href="/disclosure/">גילוי נאות</a>
      <a href="/privacy/">פרטיות</a>
      ${site.social.telegram ? `<a href="${esc(site.social.telegram)}" rel="noopener">ערוץ טלגרם</a>` : ''}
      ${site.social.whatsapp ? `<a href="${esc(site.social.whatsapp)}" rel="noopener">קבוצת וואטסאפ</a>` : ''}
    </div>
  </div>
  <div class="wrap footer-legal">© ${now.getFullYear()} ${esc(site.name)} · חלק מהקישורים הם קישורי שותפים. <a href="/disclosure/">פרטים</a></div>
</footer>
<dialog class="modal" id="code-modal" aria-labelledby="modal-title">
  <form method="dialog"><button class="modal-x" aria-label="סגור">×</button></form>
  <p class="modal-kicker">הקוד הועתק ✓</p>
  <h2 id="modal-title"></h2>
  <div class="modal-code"><code id="modal-code"></code><button class="btn btn-primary" type="button" id="modal-copy">${ICON.copy} העתק</button></div>
  <ol class="modal-steps">
    <li>אליאקספרס נפתחה בלשונית חדשה</li>
    <li>הוסיפו מוצרים לעגלה ועברו לתשלום</li>
    <li>הדביקו את הקוד בשדה <b>"קוד מבצע"</b></li>
  </ol>
  <a class="btn btn-ghost btn-block" id="modal-go" href="#" target="_blank" rel="nofollow sponsored noopener">לא נפתח? לחצו למעבר לאליאקספרס</a>
</dialog>
<script src="/assets/app.js?v=${BUILD_ID}" defer></script>
</body>
</html>`;
}
const BUILD_ID = Date.now().toString(36);

/* ------------------------------------------------------------------ */
/* Pages                                                               */
/* ------------------------------------------------------------------ */
const orgLd = {
  '@context': 'https://schema.org', '@type': 'Organization', name: site.name, alternateName: site.nameEn,
  url: site.url, logo: abs('/assets/apple-touch-icon.png'),
  sameAs: Object.values(site.social).filter(Boolean),
};
const websiteLd = { '@context': 'https://schema.org', '@type': 'WebSite', name: site.name, alternateName: site.nameEn, url: site.url, inLanguage: 'he-IL' };
const faqLd = (items) => ({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: items.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) });

function faqBlock(items) {
  return `<section class="section" id="faq"><div class="wrap narrow">
  <h2 class="section-title">שאלות נפוצות על קופונים לאליאקספרס</h2>
  <div class="faq">${items.map((f) => `<details><summary><h3>${esc(f.q)}</h3></summary><p>${esc(f.a)}</p></details>`).join('')}</div>
</div></section>`;
}

function allProducts() {
  return Object.values(gen.deals || {}).flat();
}

function homePage() {
  const pathname = '/';
  const title = `קוד קופון אליאקספרס ${monthYear} – עד $${maxDiscount} הנחה | ${site.name}`;
  const description = realCodes.length
    ? `${realCodes.length} קודי קופון פעילים לאליאקספרס בישראל, עד $${maxDiscount} הנחה. מתעדכן אוטומטית כל כמה שעות, עודכן לאחרונה ב-${updatedHe}. מעתיקים, מדביקים וחוסכים.`
    : `קודי הקופון וההנחות של אליאקספרס לישראלים, מסודרים לפי סכום ההזמנה. מתעדכן אוטומטית כל כמה שעות, עודכן לאחרונה ב-${updatedHe}.`;
  const featured = coupons.filter((c) => c.featured).slice(0, 3);
  const hotProducts = allProducts().sort((a, b) => b.sold - a.sold).slice(0, 8);
  const bc = breadcrumbs([{ name: 'קוד קופון אליאקספרס', url: '/' }]);

  const body = `
<section class="hero">
  <div class="wrap">
    ${bc.html}
    <h1>קוד קופון אליאקספרס <span class="hl">${esc(monthYear)}</span></h1>
    <p class="lead">${realCodes.length ? `${realCodes.length} קודים פעילים לישראל · עד <strong>$${maxDiscount}</strong> הנחה` : 'קודי ההנחה של אליאקספרס לישראל, לפי סכום ההזמנה'} · עודכן ב-${esc(updatedHe)}</p>
    <ul class="trust">
      <li>${ICON.check} מתעדכן אוטומטית כמה פעמים ביום</li>
      <li>${ICON.check} קודים שפג תוקפם יורדים מיד</li>
      <li>${ICON.check} חינם, בלי הרשמה</li>
    </ul>
    ${featured.length ? `<div class="featured-row">${featured.map((c) => `
      <button class="featured" type="button" ${c.sample ? `data-go-btn="${c.id}"` : `data-reveal="${c.id}" data-code="${esc(c.code)}" data-title="${esc(`${money(c.discount)} הנחה מעל ${money(c.minOrder)}`)}"`}>
        <span class="f-amount">${money(c.discount)}</span>
        <span class="f-min">מעל ${money(c.minOrder)}</span>
        <span class="f-cta">${c.sample ? 'לקבלת הקוד' : 'הצג קוד'}</span>
      </button>`).join('')}</div>` : ''}
  </div>
</section>

<section class="section" id="codes">
  <div class="wrap layout-2">
    <div>
      <div class="section-head">
        <h2 class="section-title">כל קודי ההנחה הפעילים</h2>
        <div class="filters" role="group" aria-label="סינון לפי סכום">
          <button type="button" class="chip is-on" data-filter="all">הכל</button>
          <button type="button" class="chip" data-filter="0-50">עד $50</button>
          <button type="button" class="chip" data-filter="50-150">$50 עד $150</button>
          <button type="button" class="chip" data-filter="150-99999">$150+</button>
        </div>
      </div>
      <div class="coupon-list" id="coupon-list">
        ${coupons.map((c) => couponCard(c).replace('<article ', `<article data-min="${c.minOrder ?? 0}" `)).join('')}
      </div>

      ${community.length ? `
      <div class="section-head" id="community"><h2 class="section-title">קודים חדשים מהקהילה</h2></div>
      <p class="muted">קודים שנאספו אוטומטית מקהילות קונים ברשת בימים האחרונים. עוד לא נבדקו על ידינו – שווה לנסות אם הקודים למעלה לא נכנסו.</p>
      <div class="coupon-list">${community.slice(0, 12).map((c) => couponCard(c, { compact: true })).join('')}</div>` : ''}

      <h2 class="section-title" id="tiers">איזה קוד מתאים לסכום שלי?</h2>
      ${tierTable(coupons)}
      <p class="muted">הסכום נבדק אחרי הנחות החנות ולפני משלוח. אם אתם קרובים למדרגה הבאה – לרוב משתלם להוסיף עוד מוצר קטן.</p>

      <h2 class="section-title">עוד דרכים לחסוך באליאקספרס</h2>
      <div class="deal-grid">${deals.map(dealCard).join('')}</div>
    </div>

    <aside class="sidebar">
      <div class="side-card side-sticky">
        <h2>איך זה עובד?</h2>
        <ol class="steps">
          <li><span><b>לוחצים "הצג קוד"</b> הקוד מועתק אוטומטית</span></li>
          <li><span><b>אליאקספרס נפתחת</b> בלשונית חדשה</span></li>
          <li><span><b>מדביקים בתשלום</b> בשדה "קוד מבצע"</span></li>
        </ol>
        <a class="btn btn-primary btn-block" href="/go/coupon-center/" target="_blank" rel="nofollow sponsored noopener" data-go="coupon-center">למרכז הקופונים ${ICON.arrow}</a>
        ${site.social.telegram || site.social.whatsapp ? `<div class="side-alert"><b>רוצים את הקודים ראשונים?</b><p>הצטרפו לערוץ ונעדכן ברגע שיוצאת סדרה חדשה.</p>${site.social.telegram ? `<a class="btn btn-ghost btn-block" href="${esc(site.social.telegram)}" rel="noopener">טלגרם</a>` : ''}${site.social.whatsapp ? `<a class="btn btn-ghost btn-block" href="${esc(site.social.whatsapp)}" rel="noopener">וואטסאפ</a>` : ''}</div>` : ''}
      </div>
    </aside>
  </div>
</section>

${hotProducts.length ? `
<section class="section section-alt">
  <div class="wrap">
    <div class="section-head"><h2 class="section-title">הדילים הכי נמכרים לישראל עכשיו</h2><a class="more" href="/deals/">לכל הדילים ←</a></div>
    <div class="product-grid">${hotProducts.map(productCard).join('')}</div>
  </div>
</section>` : ''}

<section class="section">
  <div class="wrap narrow prose">
    <h2>איך משתמשים בקוד קופון של אליאקספרס</h2>
    <ol>
      <li>בוחרים קוד מהרשימה לפי הסכום שבעגלה ולוחצים <b>"הצג קוד"</b>. הקוד מועתק ואליאקספרס נפתחת.</li>
      <li>מוסיפים מוצרים לעגלה ועוברים לתשלום.</li>
      <li>בשורה <b>"קוד מבצע"</b> מדביקים את הקוד ולוחצים "החל".</li>
      <li>בודקים שהסכום ירד – ומשלמים.</li>
    </ol>
    <p>למדריך המלא עם צילומי מסך וטיפים: <a href="/guides/how-to-use-aliexpress-coupon/">איך משתמשים בקוד קופון באליאקספרס</a>.</p>

    <h2>למה הקוד לא נכנס?</h2>
    <ul>
      <li><b>הסכום נמוך מהמינימום</b> – הוא נבדק אחרי הנחות חנות. בחרו מדרגה נמוכה יותר.</li>
      <li><b>הקוד כבר נוצל בחשבון</b> – כל קוד תקף פעם אחת למשתמש.</li>
      <li><b>המכסה נגמרה</b> – בימי מבצע הקודים נגמרים מהר. נסו את הקוד החלופי או קוד מהקהילה.</li>
      <li><b>מוצרים שלא משתתפים</b> – חלק מהקטגוריות (למשל מוצרים דיגיטליים) לא נכללות.</li>
    </ul>

    <h2>מתי יוצאים הקודים הכי שווים?</h2>
    <p>הקודים הגבוהים ביותר יוצאים במבצעים הגדולים: יום ההולדת של אליאקספרס במרץ, 11.11 בנובמבר ובלאק פריידי. ראו את <a href="/guides/aliexpress-sales-calendar/">לוח המבצעים המלא</a> ואת המדריך ל<a href="/guides/stacking-aliexpress-discounts/">שילוב כמה הנחות באותה הזמנה</a>.</p>
  </div>
</section>

${faqBlock(faq)}

${expired.length ? `<section class="section"><div class="wrap narrow"><details class="expired"><summary>קודים שפג תוקפם (${expired.length})</summary><ul>${expired.slice(0, 20).map((c) => `<li><s>${esc(c.code)}</s> – ${money(c.discount)} מעל ${money(c.minOrder)} (עד ${heDate(c.expires)})</li>`).join('')}</ul></details></div></section>` : ''}

<section class="section"><div class="wrap narrow"><p class="disclosure">גילוי נאות: חלק מהקישורים באתר הם קישורי שותפים. כשאתם קונים דרכם אנחנו עשויים לקבל עמלה מאליאקספרס – בלי שום תוספת למחיר שלכם. זה מה שמאפשר לנו להחזיק את האתר חינמי ומעודכן.</p></div></section>`;

  const offersLd = {
    '@context': 'https://schema.org', '@type': 'ItemList', name: `קודי קופון אליאקספרס ${monthYear}`,
    itemListElement: coupons.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: `${money(c.discount)} הנחה מעל ${money(c.minOrder)}`, url: abs(`/#c-${c.id}`) })),
  };
  return layout({ title, description, pathname, body, ld: [websiteLd, orgLd, bc.ld, faqLd(faq), offersLd] });
}

function dealsIndexPage() {
  const pathname = '/deals/';
  const bc = breadcrumbs([{ name: 'דילים חמים', url: pathname }]);
  const cats = site.dealCategories.map((c) => ({ ...c, items: gen.deals?.[c.slug] || [] }));
  const body = `
<section class="hero hero-sm"><div class="wrap">${bc.html}
  <h1>דילים חמים מאליאקספרס לישראל <span class="hl">${esc(monthYear)}</span></h1>
  <p class="lead">המוצרים הכי נמכרים עם משלוח לישראל, מחירים בשקלים – מתעדכן אוטומטית. שלבו עם <a href="/">קוד קופון</a> לחיסכון כפול.</p>
</div></section>
<section class="section"><div class="wrap">
  <div class="cat-grid">${cats.map((c) => `<a class="cat" href="/deals/${c.slug}/"><b>${esc(c.name)}</b><span>${c.items.length ? `${c.items.length} דילים` : 'לדילים'}</span></a>`).join('')}</div>
  ${cats.filter((c) => c.items.length).map((c) => `
    <div class="section-head"><h2 class="section-title">${esc(c.name)}</h2><a class="more" href="/deals/${c.slug}/">עוד ←</a></div>
    <div class="product-grid">${c.items.slice(0, 4).map(productCard).join('')}</div>`).join('')}
  ${cats.every((c) => !c.items.length) ? `<div class="empty"><p>הדילים נטענים אוטומטית מאליאקספרס. בינתיים – כל המבצעים מחכים לכם באתר.</p><a class="btn btn-primary" href="/go/home/" target="_blank" rel="nofollow sponsored noopener" data-go="home">למבצעים באליאקספרס ${ICON.arrow}</a></div>` : ''}
</div></section>`;
  return layout({
    title: `דילים חמים מאליאקספרס לישראל ${monthYear} | ${site.name}`,
    description: 'המוצרים הכי נמכרים באליאקספרס עם משלוח לישראל ומחירים בשקלים, לפי קטגוריות. מתעדכן אוטומטית כל כמה שעות.',
    pathname, body, ld: [bc.ld],
  });
}

function dealCategoryPage(cat) {
  const pathname = `/deals/${cat.slug}/`;
  const items = gen.deals?.[cat.slug] || [];
  const bc = breadcrumbs([{ name: 'דילים חמים', url: '/deals/' }, { name: cat.name, url: pathname }]);
  const top = coupons.filter((c) => c.featured).slice(0, 2);
  const body = `
<section class="hero hero-sm"><div class="wrap">${bc.html}
  <h1>קופון אליאקספרס ל${esc(cat.name)} <span class="hl">${esc(monthYear)}</span></h1>
  <p class="lead">${items.length ? `${items.length} מוצרים נבחרים` : 'מוצרים נבחרים'} ב${esc(cat.name)} עם משלוח לישראל + קודי הנחה שעובדים עליהם.</p>
</div></section>
<section class="section"><div class="wrap">
  ${top.length ? `<div class="coupon-list coupon-list-inline">${top.map((c) => couponCard(c, { compact: true })).join('')}</div>` : ''}
  ${items.length ? `<div class="product-grid">${items.map(productCard).join('')}</div>` : `<div class="empty"><p>הדילים בקטגוריה מתעדכנים אוטומטית.</p><a class="btn btn-primary" href="/go/home/" target="_blank" rel="nofollow sponsored noopener" data-go="home">לחיפוש באליאקספרס ${ICON.arrow}</a></div>`}
  <p class="muted">המחירים בשקלים כפי שהתקבלו מאליאקספרס בעדכון האחרון (${esc(updatedHe)}) ועשויים להשתנות. <a href="/">לכל קודי הקופון ←</a></p>
</div></section>`;
  const ld = [bc.ld];
  if (items.length) ld.push({ '@context': 'https://schema.org', '@type': 'ItemList', itemListElement: items.slice(0, 20).map((p, i) => ({ '@type': 'ListItem', position: i + 1, name: p.title })) });
  return layout({
    title: `קופון אליאקספרס ל${cat.name} ${monthYear} – דילים לישראל | ${site.name}`,
    description: `דילים חמים ב${cat.name} מאליאקספרס עם משלוח לישראל ומחירים בשקלים, יחד עם קודי הקופון העדכניים. מתעדכן אוטומטית.`,
    pathname, body, ld,
  });
}

function eventPage(ev) {
  const pathname = `/sale/${ev.slug}/`;
  const bc = breadcrumbs([{ name: `קופונים ל${ev.name.split(' –')[0]}`, url: pathname }]);
  const live = ev.start <= today && ev.end >= today;
  const upcoming = ev.start > today;
  const year = ev.start.slice(0, 4);
  const evCoupons = coupons.filter((c) => !c.event || c.event === ev.slug);
  const body = `
<section class="hero"><div class="wrap">${bc.html}
  <h1>קודי קופון אליאקספרס ל${esc(ev.name)} ${year}</h1>
  <p class="lead">${live ? `המבצע פעיל עכשיו – עד ${heDate(ev.end)}.` : upcoming ? `המבצע מתחיל ב-${heDate(ev.start)}. הקודים יעלו לכאן אוטומטית ברגע שייצאו.` : `המבצע הסתיים. הנה הקודים הפעילים כרגע.`}</p>
  ${upcoming ? `<div class="countdown" data-countdown="${ev.start}T00:00:00+02:00"></div>` : ''}
</div></section>
<section class="section"><div class="wrap narrow">
  <div class="coupon-list">${evCoupons.map((c) => couponCard(c)).join('')}</div>
  ${tierTable(evCoupons)}
  <div class="prose">
    <h2>איך להתכונן ל${esc(ev.name.split(' –')[0])}</h2>
    <ol>
      <li>הוסיפו לעגלה את המוצרים שאתם רוצים כבר עכשיו – כך תראו את ההנחה האמיתית.</li>
      <li>אספו קופונים ממרכז הקופונים ברגע שהם נפתחים.</li>
      <li>בשעת הפתיחה חזרו לעמוד הזה – הקודים מתעדכנים כאן אוטומטית.</li>
    </ol>
    <p>עוד: <a href="/guides/aliexpress-sales-calendar/">לוח המבצעים השנתי</a> · <a href="/guides/stacking-aliexpress-discounts/">איך לשלב הנחות</a></p>
  </div>
</div></section>`;
  const ld = [bc.ld, {
    '@context': 'https://schema.org', '@type': 'Event', name: `${ev.name} באליאקספרס ${year}`, startDate: ev.start, endDate: ev.end,
    eventAttendanceMode: 'https://schema.org/OnlineEventAttendanceMode', eventStatus: 'https://schema.org/EventScheduled',
    location: { '@type': 'VirtualLocation', url: site.affiliate.homeUrl }, organizer: { '@type': 'Organization', name: 'AliExpress', url: 'https://www.aliexpress.com' },
  }];
  return layout({
    title: `קוד קופון אליאקספרס ${ev.name.split(' –')[0]} ${year} – כל הקודים | ${site.name}`,
    description: `כל קודי הקופון של אליאקספרס ל${ev.name} ${year} לישראלים, לפי מדרגות. מתעדכן אוטומטית ברגע שהקודים יוצאים.`,
    pathname, body, ld,
  });
}

function guidesIndexPage() {
  const pathname = '/guides/';
  const bc = breadcrumbs([{ name: 'מדריכים', url: pathname }]);
  const body = `
<section class="hero hero-sm"><div class="wrap">${bc.html}<h1>מדריכים לקנייה חכמה באליאקספרס</h1><p class="lead">כל מה שצריך לדעת כדי לשלם פחות ולקבל יותר.</p></div></section>
<section class="section"><div class="wrap"><div class="guide-grid">${guides.map((g) => `<a class="guide-card" href="/guides/${g.slug}/"><h2>${esc(g.title)}</h2><p>${esc(g.description)}</p><span>לקריאה ←</span></a>`).join('')}</div></div></section>`;
  return layout({ title: `מדריכים לאליאקספרס בעברית | ${site.name}`, description: 'מדריכים בעברית לקנייה באליאקספרס: שימוש בקודי קופון, שילוב הנחות, מכס ומע"מ, Choice ולוח המבצעים.', pathname, body, ld: [bc.ld] });
}

function guidePage(g) {
  const pathname = `/guides/${g.slug}/`;
  const bc = breadcrumbs([{ name: 'מדריכים', url: '/guides/' }, { name: g.title.split(' –')[0], url: pathname }]);
  const top = coupons.filter((c) => c.featured).slice(0, 2);
  const others = guides.filter((x) => x.slug !== g.slug).slice(0, 3);
  const body = `
<section class="hero hero-sm"><div class="wrap narrow">${bc.html}<h1>${esc(g.title)}</h1><p class="byline">צוות ${esc(site.name)} · עודכן ${esc(updatedHe)}</p></div></section>
<section class="section"><div class="wrap narrow">
  <article class="prose">${g.body}</article>
  ${top.length ? `<h2 class="section-title">הקודים הכי משתלמים כרגע</h2><div class="coupon-list">${top.map((c) => couponCard(c, { compact: true })).join('')}</div><p><a href="/">לכל קודי הקופון ←</a></p>` : ''}
  <h2 class="section-title">עוד מדריכים</h2>
  <div class="guide-grid">${others.map((o) => `<a class="guide-card" href="/guides/${o.slug}/"><h3>${esc(o.title)}</h3><span>לקריאה ←</span></a>`).join('')}</div>
</div></section>`;
  const ld = [bc.ld, {
    '@context': 'https://schema.org', '@type': 'Article', headline: g.title, description: g.description, inLanguage: 'he-IL',
    dateModified: new Date(gen.updatedAt ?? now).toISOString(), author: { '@type': 'Organization', name: site.name, url: site.url },
    publisher: orgLd, mainEntityOfPage: abs(pathname),
  }];
  return layout({ title: `${g.title} | ${site.name}`, description: g.description, pathname, body, ld, ogType: 'article' });
}

function staticPage(pathname, h1, html, description) {
  const bc = breadcrumbs([{ name: h1, url: pathname }]);
  return layout({
    title: `${h1} | ${site.name}`, description, pathname, ld: [bc.ld],
    body: `<section class="hero hero-sm"><div class="wrap narrow">${bc.html}<h1>${esc(h1)}</h1></div></section><section class="section"><div class="wrap narrow prose">${html}</div></section>`,
  });
}

function goPage(id, target) {
  // Interstitial redirect: noindex, fast meta refresh + JS. Every outbound affiliate click flows through /go/<id>/.
  return `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="robots" content="noindex,nofollow">
<meta name="referrer" content="no-referrer-when-downgrade"><title>מעבירים אתכם לאליאקספרס…</title>
<meta http-equiv="refresh" content="0;url=${esc(target)}"><link rel="canonical" href="${abs('/')}">
<style>body{font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;background:#fff7f4;color:#222}a{color:#e8113a}</style>
<script>location.replace(${JSON.stringify(target)});</script></head>
<body><p>מעבירים אתכם לאליאקספרס… <a href="${esc(target)}" rel="nofollow sponsored">לחצו כאן אם לא הועברתם</a></p></body></html>`;
}

/* ------------------------------------------------------------------ */
/* Build                                                               */
/* ------------------------------------------------------------------ */
await fs.rm(DIST, { recursive: true, force: true });
await fs.mkdir(DIST, { recursive: true });
await fs.cp(path.join(ROOT, 'src/assets'), path.join(DIST, 'assets'), { recursive: true });

const urls = [];
const page = async (p, html, priority = '0.7') => { await write(p === '/' ? 'index.html' : `${p.replace(/^\//, '')}index.html`, html); urls.push([p, priority]); };

await page('/', homePage(), '1.0');
await page('/deals/', dealsIndexPage(), '0.8');
for (const c of site.dealCategories) await page(`/deals/${c.slug}/`, dealCategoryPage(c), '0.7');
for (const e of manual.events || []) await page(`/sale/${e.slug}/`, eventPage(e), e === activeEvent ? '0.9' : '0.6');
await page('/guides/', guidesIndexPage(), '0.6');
for (const g of guides) await page(`/guides/${g.slug}/`, guidePage(g), '0.6');
await page('/about/', staticPage('/about/', 'אודות', `
<p><b>${esc(site.name)}</b> נולד מתוך תסכול פשוט: חיפשנו קוד קופון לאליאקספרס ומצאנו רשימות ישנות, קודים שלא עובדים ואתרים עמוסים בפרסומות.</p>
<p>אז בנינו מערכת שמושכת את הקודים והמבצעים העדכניים כמה פעמים ביום, מסירה אוטומטית קודים שפג תוקפם, ומסדרת הכל לפי סכום ההזמנה – כדי שתמצאו את הקוד הנכון בעשר שניות.</p>
<p>יש לכם קוד שעבד ולא מופיע אצלנו? כתבו לנו: <a href="mailto:${esc(site.contactEmail)}">${esc(site.contactEmail)}</a></p>`, `מי אנחנו ואיך ${site.name} עובד.`));
await page('/disclosure/', staticPage('/disclosure/', 'גילוי נאות', `
<p>${esc(site.name)} משתתף בתוכנית השותפים של אליאקספרס (AliExpress Portals). חלק מהקישורים באתר הם קישורי שותפים: כאשר אתם לוחצים עליהם ומבצעים רכישה, אנו עשויים לקבל עמלה מאליאקספרס.</p>
<p>העמלה לא מייקרת את המחיר שלכם בשום צורה, ואינה משפיעה על סדר הצגת הקודים – הם מסודרים לפי סכום ההזמנה וגובה ההנחה.</p>
<p>האתר אינו קשור, מאושר או מופעל ע"י AliExpress או Alibaba Group. כל הסימנים המסחריים שייכים לבעליהם.</p>
<p>הקודים מוצגים כפי שהם ואנו לא יכולים להבטיח שכל קוד יעבוד בכל הזמנה – תנאי הקודים נקבעים ע"י אליאקספרס.</p>`, 'גילוי נאות על קישורי שותפים באתר.'), '0.3');
await page('/privacy/', staticPage('/privacy/', 'מדיניות פרטיות', `
<p>האתר אינו דורש הרשמה ואינו אוסף פרטים מזהים.</p>
<p>אנו עשויים להשתמש בכלי אנליטיקה (כגון Google Analytics) לצורך מדידת שימוש אנונימית, ובעוגיות של אליאקספרס לצורך שיוך רכישות לתוכנית השותפים לאחר מעבר לאתר שלה.</p>
<p>לשאלות: <a href="mailto:${esc(site.contactEmail)}">${esc(site.contactEmail)}</a></p>`, 'מדיניות הפרטיות של האתר.'), '0.3');

// Outbound redirect pages
const goTargets = new Map([
  ['home', links[site.affiliate.homeUrl] || site.affiliate.defaultLink],
  ['coupon-center', links[site.affiliate.couponCenterUrl] || site.affiliate.defaultLink],
]);
for (const c of [...coupons, ...expired, ...community]) goTargets.set(c.id, c.source === 'community' ? site.affiliate.defaultLink : resolveLink(c));
for (const d of deals) goTargets.set(d.id, d.id === 'coupon-center' && !d.link ? goTargets.get('coupon-center') : resolveLink(d));
for (const [id, target] of goTargets) await write(`go/${id}/index.html`, goPage(id, target));
await write('assets/links.json', JSON.stringify(Object.fromEntries(goTargets)));

await write('404.html', layout({
  title: `הדף לא נמצא | ${site.name}`, description: 'הדף לא נמצא', pathname: '/404.html', noindex: true,
  body: `<section class="hero"><div class="wrap narrow"><h1>אופס, הדף לא נמצא</h1><p class="lead">אבל הקודים כן 🙂</p><a class="btn btn-primary" href="/">לכל קודי הקופון</a></div></section>`,
}));
await write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(([p, pr]) => `  <url><loc>${abs(p)}</loc><lastmod>${today}</lastmod><priority>${pr}</priority></url>`).join('\n')}\n</urlset>\n`);
await write('robots.txt', `User-agent: *\nAllow: /\nDisallow: /go/\n\nSitemap: ${abs('/sitemap.xml')}\n`);
await write('CNAME', site.domain + '\n');
await write('.nojekyll', '');

console.log(`✓ built ${urls.length} pages + ${goTargets.size} redirects → dist/  (${coupons.length} coupons, ${community.length} community, ${allProducts().length} products)`);
