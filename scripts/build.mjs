// Static site generator for קוד היום. Zero dependencies.
// Reads config/site.json + data/coupons.json + data/generated.json → writes dist/
//
// BUILD_STRICT=1 (set in CI) refuses to build while the site still has sample codes or a placeholder
// affiliate link, so placeholder data can never go live.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { faq } from '../src/content/faq.mjs';
import { guides } from '../src/content/guides.mjs';
import { mergeCoupons, mergeDeals, groupTiers, safeLink, normDate, daysBetween, slug } from './lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const TZ = 'Asia/Jerusalem';
const COMMUNITY_MAX_AGE_DAYS = 21;

const site = await readJSON('config/site.json');
const manual = await readJSON('data/coupons.json');
const gen = await readJSON('data/generated.json', {});

const now = new Date();
const today = ymd(now);
const monthYear = new Intl.DateTimeFormat('he-IL', { month: 'long', year: 'numeric', timeZone: TZ }).format(now);

/* ------------------------------------------------------------------ */
/* Data model                                                          */
/* ------------------------------------------------------------------ */
const DEFAULT_LINK = site.affiliate.defaultLink;
const links = gen.links || {};
const resolveLink = (item) =>
  safeLink(item.link, '') || safeLink(item.landing && links[item.landing], '') || DEFAULT_LINK;

const sheet = gen.sheetCoupons || [];
const { active: coupons, expired, invalid } = mergeCoupons(manual.coupons, sheet.filter((c) => c.type !== 'deal'), today);
const deals = mergeDeals(manual.deals, sheet.filter((c) => c.type === 'deal'));
const knownCodes = new Set(coupons.map((c) => c.code));
const community = (gen.community || [])
  .filter((c) => c.foundAt && daysBetween(c.foundAt, today) <= COMMUNITY_MAX_AGE_DAYS)
  .filter((c) => !knownCodes.has(c.code))
  .map((c) => ({ ...c, id: slug(`r-${c.code}-${c.discount}`) }));
const realCodes = coupons.filter((c) => !c.sample);
const maxDiscount = Math.max(0, ...realCodes.map((c) => c.discount || 0));
const featuredCoupons = coupons.filter((c) => c.featured && c.code).slice(0, 3);
const activeEvent = (manual.events || []).find((e) => e.start <= addDays(today, 7) && e.end >= today);

// "Updated" = the last time coupon data really changed: manual edit date or a successful fetch.
const dataUpdated = [normDate(manual.updated), gen.updatedAt ? ymd(new Date(gen.updatedAt)) : null].filter(Boolean).sort().pop() || today;
const updatedHe = heLong(dataUpdated);

const placeholderLink = !safeLink(DEFAULT_LINK) || /REPLACE/i.test(DEFAULT_LINK);
const SAMPLE_MODE = !realCodes.length || placeholderLink;
for (const i of invalid) console.warn(`⚠  coupon "${i.id}" skipped: invalid ${i.field}${i.value ? ` (${i.value})` : ''}`);
if (!realCodes.length) console.warn('⚠  No real coupon codes yet (all are sample) – edit data/coupons.json or connect a Google Sheet.');
if (placeholderLink) console.warn('⚠  affiliate.defaultLink in config/site.json is not a valid AliExpress affiliate link yet.');
if (SAMPLE_MODE && process.env.BUILD_STRICT === '1') {
  console.error('✗ BUILD_STRICT: refusing to publish sample data. Add real codes + your Portals link (see README).');
  process.exit(1);
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
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
function heLong(dateStr) {
  return new Intl.DateTimeFormat('he-IL', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(dateStr + 'T12:00:00Z'));
}
const money = (n, cur = 'USD') => (cur === 'ILS' ? `₪${n}` : `$${n}`);
const abs = (p) => site.url.replace(/\/$/, '') + p;
const scriptJSON = (v) => JSON.stringify(v).replace(/[<\u2028\u2029]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
const jsonLd = (obj) => `<script type="application/ld+json">${scriptJSON(obj)}</script>`;
const OUT = 'target="_blank" rel="nofollow sponsored noopener"';
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
const logo = (id) => `<svg viewBox="0 0 40 40" aria-hidden="true"><defs><linearGradient id="${id}" x1="0" y1="0" x2="40" y2="40"><stop stop-color="#ff6a2b"/><stop offset="1" stop-color="#e8113a"/></linearGradient></defs><rect width="40" height="40" rx="11" fill="url(#${id})"/><path d="M11 14.5c0-1.4 1.1-2.5 2.5-2.5h13c1.4 0 2.5 1.1 2.5 2.5v2.2a3.3 3.3 0 0 0 0 6.6v2.2c0 1.4-1.1 2.5-2.5 2.5h-13a2.5 2.5 0 0 1-2.5-2.5v-2.2a3.3 3.3 0 0 0 0-6.6z" fill="#fff"/><path d="m17 23.5 6-7" stroke="#ff3d2e" stroke-width="2.2" stroke-linecap="round"/><circle cx="17.3" cy="17" r="1.6" fill="#ff3d2e"/><circle cx="22.7" cy="23" r="1.6" fill="#ff3d2e"/></svg>`;
const ICON = {
  check: `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 10.5 3.2 3L15 6.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  clock: `<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="7.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M10 6v4.3l2.8 1.7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  copy: `<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M13 4.5H5.5a1 1 0 0 0-1 1V13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  arrow: `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M12 5 7 10l5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
};

const couponTitle = (c) => c.title || `${money(c.discount, c.currency)} הנחה בקנייה מעל ${money(c.minOrder, c.currency)}`;

function revealAttrs(c, title = couponTitle(c)) {
  return `data-reveal="${c.id}" data-code="${esc(c.code)}" data-title="${esc(title)}"`;
}

function couponCard(c, { compact = false } = {}) {
  const cur = c.currency || 'USD';
  const dl = c.expires ? daysBetween(today, c.expires) : null;
  const urgency = !c.sample && dl !== null && dl <= 3
    ? `<span class="tag tag-hot">${ICON.clock} ${dl <= 0 ? 'נגמר היום' : dl === 1 ? 'נגמר מחר' : `נגמר בעוד ${dl} ימים`}</span>` : '';
  const title = couponTitle(c);
  const hidden = c.sample || !c.code;
  const masked = hidden ? '' : '•'.repeat(Math.max(4, c.code.length - 2)) + `<b>${esc(c.code.slice(-2))}</b>`;
  const isCommunity = c.source === 'community';
  let status = '';
  if (isCommunity) status = `<span class="tag tag-muted">מהקהילה · לא נבדק${c.foundAt ? ` · ${heDate(c.foundAt)}` : ''}</span>`;
  else if (c.sample) status = `<span class="tag tag-muted">דוגמה</span>`;
  else if (c.verified) status = `<span class="tag tag-ok">${ICON.check} נבדק ${heDate(c.verified)}</span>`;
  return `
<article class="coupon${c.featured ? ' is-featured' : ''}${isCommunity ? ' is-community' : ''}" id="c-${c.id}" data-min="${c.minOrder ?? 0}"${c.expires ? ` data-expires="${c.expires}"` : ''}>
  <div class="coupon-value" aria-hidden="true">
    <span class="v-amount">${money(c.discount, cur)}</span>
    <span class="v-label">הנחה</span>
  </div>
  <div class="coupon-body">
    <h3 class="coupon-title">${esc(title)}</h3>
    <div class="coupon-meta">
      ${status}
      ${c.expires && !c.sample ? `<span class="tag">בתוקף עד ${heDate(c.expires)}</span>` : ''}
      ${urgency}
      ${c.featured && !c.sample ? '<span class="tag tag-star">מומלץ</span>' : ''}
    </div>
    ${c.note && !compact ? `<p class="coupon-note">${esc(c.note)}</p>` : ''}
  </div>
  <div class="coupon-cta">
    ${hidden
      ? `<a class="btn btn-primary" href="/go/${c.id}/" ${OUT} data-go="${c.id}">למרכז הקופונים ${ICON.arrow}</a>`
      : `<button class="btn btn-reveal" type="button" ${revealAttrs(c, title)} aria-label="הצג קוד: ${esc(title)}">
          <span class="reveal-mask" aria-hidden="true">${masked}</span>
          <span class="reveal-label" aria-hidden="true">הצג קוד</span>
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
  <a class="btn btn-ghost" href="/go/${d.id}/" ${OUT} data-go="${d.id}">למבצע ${ICON.arrow}</a>
</article>`;
}

function productCard(p) {
  const link = safeLink(p.link, '');
  const img = safeLink(p.image, '');
  if (!link || !img) return '';
  const price = p.price != null ? `₪${p.price.toFixed(2)}` : '';
  const orig = p.originalPrice && p.originalPrice > (p.price || 0) ? `<s>₪${p.originalPrice.toFixed(2)}</s>` : '';
  const off = parseInt(String(p.discount || ''), 10);
  return `
<a class="product" href="${esc(link)}" ${OUT} data-product="${esc(p.id)}">
  <div class="product-img"><img src="${esc(img)}_350x350.jpg" alt="${esc(p.title)}" loading="lazy" decoding="async" width="350" height="350"></div>
  ${off > 0 && off < 100 ? `<span class="product-off">-${off}%</span>` : ''}
  <div class="product-info">
    <h3>${esc(p.title)}</h3>
    <div class="product-price"><strong>${price}</strong>${orig}</div>
    <div class="product-sub">${p.sold ? `${Number(p.sold).toLocaleString('he-IL')} נמכרו` : ''}${p.rating ? ` · ${esc(p.rating)} שביעות רצון` : ''}</div>
  </div>
</a>`;
}

function tierTable(list) {
  const tiers = groupTiers(list.filter((c) => c.minOrder != null));
  if (!tiers.length) return '';
  return `
<div class="table-wrap">
<table class="tiers">
  <caption>מדרגות קודי ההנחה של אליאקספרס, ${esc(monthYear)}</caption>
  <thead><tr><th scope="col">סכום בעגלה</th><th scope="col">הנחה</th><th scope="col">קוד</th></tr></thead>
  <tbody>
  ${tiers.map((t, i) => {
    const next = tiers.slice(i + 1).find((n) => n.currency === t.currency);
    const range = next ? `${money(t.minOrder, t.currency)} עד ${money(+(next.minOrder - 0.01).toFixed(2), t.currency)}` : `${money(t.minOrder, t.currency)} ומעלה`;
    const cell = t.items.map((c) => c.sample || !c.code
      ? `<a href="/go/${c.id}/" ${OUT} data-go="${c.id}">למרכז הקופונים</a>`
      : `<button class="code-chip" type="button" ${revealAttrs(c, `${money(c.discount, c.currency)} הנחה מעל ${money(c.minOrder, c.currency)}`)} aria-label="העתק קוד ${esc(c.code)}">${esc(c.code)}</button>`).join(' ');
    return `<tr><td>${range}</td><td><strong>${money(t.discount, t.currency)}</strong></td><td>${cell}</td></tr>`;
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

function topbar() {
  if (!activeEvent) return '';
  const live = activeEvent.start <= today;
  const short = activeEvent.name.split(' –')[0];
  const days = daysBetween(today, activeEvent.start);
  const text = live
    ? `🔥 ${esc(activeEvent.name)}: המבצע פעיל עכשיו, הקודים כאן`
    : `⏳ ${esc(short)} מתחיל ${days === 1 ? 'מחר' : `בעוד ${days} ימים`}. כך מתכוננים`;
  return `<div class="topbar"><a href="/sale/${activeEvent.slug}/">${text} ←</a></div>`;
}

/* ------------------------------------------------------------------ */
/* Layout                                                              */
/* ------------------------------------------------------------------ */
const BUILD_ID = Date.now().toString(36);

function layout({ title, description, pathname, body, ld = [], noindex = false, ogType = 'website' }) {
  const canonical = abs(pathname);
  const ga = site.analytics?.ga4Id;
  const robots = noindex || SAMPLE_MODE ? 'noindex,nofollow' : 'index,follow,max-image-preview:large,max-snippet:-1';
  const nav = [
    ['/', 'קודי קופון'],
    ['/deals/', 'דילים'],
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
<meta name="robots" content="${robots}">
<meta property="og:type" content="${ogType}">
<meta property="og:locale" content="${site.locale}">
<meta property="og:site_name" content="${esc(site.name)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${canonical}">
<meta property="og:image" content="${abs('/assets/og.png')}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#ff3d2e">
<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/assets/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Rubik:wght@400;500;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/style.css?v=${BUILD_ID}">
${ga ? `<script async src="https://www.googletagmanager.com/gtag/js?id=${esc(ga)}"></script><script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config',${scriptJSON(ga)});</script>` : ''}
${ld.map(jsonLd).join('\n')}
</head>
<body>
<a class="skip" href="#main">דלג לתוכן</a>
${SAMPLE_MODE ? '<div class="preview-bar" role="note">תצוגה מקדימה עם נתוני דוגמה. האתר לא יעלה לאוויר עד שיוזנו קודים אמיתיים וקישור שותפים.</div>' : ''}
${topbar()}
<header class="site-header">
  <div class="wrap header-row">
    <a class="brand" href="/" aria-label="${esc(site.name)}, דף הבית">${logo('lg-h')}<span>${esc(site.name)}</span></a>
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
      <a class="brand brand-footer" href="/">${logo('lg-f')}<span>${esc(site.name)}</span></a>
      <p>${esc(site.tagline)}. האתר עצמאי ואינו קשור לאליאקספרס או לקבוצת עליבאבא.</p>
    </div>
    <div>
      <h2>קופונים</h2>
      <a href="/">קוד קופון אליאקספרס</a>
      <a href="/deals/">דילים מאליאקספרס</a>
      ${(manual.events || []).map((e) => `<a href="/sale/${e.slug}/">קופונים ל${esc(e.name.split(' –')[0])}</a>`).join('')}
    </div>
    <div>
      <h2>מדריכים</h2>
      ${guides.slice(0, 5).map((g) => `<a href="/guides/${g.slug}/">${esc(g.short || g.title)}</a>`).join('')}
    </div>
    <div>
      <h2>האתר</h2>
      <a href="/about/">אודות</a>
      <a href="/disclosure/">גילוי נאות</a>
      <a href="/privacy/">פרטיות</a>
      ${site.social.telegram ? `<a href="${esc(site.social.telegram)}" rel="noopener">ערוץ טלגרם</a>` : ''}
      ${site.social.whatsapp ? `<a href="${esc(site.social.whatsapp)}" rel="noopener">ערוץ וואטסאפ</a>` : ''}
    </div>
  </div>
  <div class="wrap footer-legal">© ${now.getFullYear()} ${esc(site.name)} · חלק מהקישורים באתר הם קישורי שותפים. <a href="/disclosure/">פרטים</a></div>
</footer>
<dialog class="modal" id="code-modal" aria-labelledby="modal-title">
  <form method="dialog"><button class="modal-x" aria-label="סגירה">×</button></form>
  <p class="modal-kicker" id="modal-kicker">הקוד הועתק ✓</p>
  <h2 id="modal-title"></h2>
  <div class="modal-code"><code id="modal-code"></code><button class="btn btn-primary" type="button" id="modal-copy">${ICON.copy}<span>העתקה</span></button></div>
  <ol class="modal-steps">
    <li id="modal-step1">אליאקספרס נפתחה בלשונית חדשה</li>
    <li>מוסיפים מוצרים לעגלה ועוברים לתשלום</li>
    <li>מדביקים את הקוד בשדה <b>"קוד מבצע"</b></li>
  </ol>
  <a class="btn btn-ghost btn-block" id="modal-go" href="/go/home/" ${OUT}>מעבר לאליאקספרס</a>
</dialog>
<script src="/assets/app.js?v=${BUILD_ID}" defer></script>
</body>
</html>`;
}

/* ------------------------------------------------------------------ */
/* Pages                                                               */
/* ------------------------------------------------------------------ */
const orgLd = {
  '@context': 'https://schema.org', '@type': 'Organization', name: site.name, alternateName: site.nameEn,
  url: site.url, logo: abs('/assets/apple-touch-icon.png'),
  ...(Object.values(site.social).some(Boolean) ? { sameAs: Object.values(site.social).filter(Boolean) } : {}),
};
const websiteLd = { '@context': 'https://schema.org', '@type': 'WebSite', name: site.name, alternateName: site.nameEn, url: site.url, inLanguage: 'he-IL' };
const faqLd = (items) => ({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: items.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) });

function faqBlock(items) {
  return `<section class="section" id="faq"><div class="wrap narrow">
  <h2 class="section-title">שאלות נפוצות על קופונים לאליאקספרס</h2>
  <div class="faq">${items.map((f) => `<details><summary><h3>${esc(f.q)}</h3></summary><p>${esc(f.a)}</p></details>`).join('')}</div>
</div></section>`;
}

const allProducts = () => Object.values(gen.deals || {}).flat().filter((p) => safeLink(p.link) && safeLink(p.image));
const catItems = (slugName) => (gen.deals?.[slugName] || []).filter((p) => safeLink(p.link) && safeLink(p.image));

function homePage() {
  const pathname = '/';
  const title = realCodes.length
    ? `קוד קופון אליאקספרס ${monthYear}: עד $${maxDiscount} הנחה | ${site.name}`
    : `קוד קופון אליאקספרס ${monthYear}: כל הקודים לישראל | ${site.name}`;
  const description = realCodes.length
    ? `${realCodes.length} קודי קופון פעילים לאליאקספרס לקונים מישראל, עד $${maxDiscount} הנחה, מסודרים לפי סכום ההזמנה. עודכן ב-${updatedHe}.`
    : `קודי הקופון וההנחות של אליאקספרס לקונים מישראל, מסודרים לפי סכום ההזמנה. עודכן ב-${updatedHe}.`;
  const hotProducts = allProducts().sort((a, b) => b.sold - a.sold).slice(0, 8);
  const bc = breadcrumbs([{ name: 'קוד קופון אליאקספרס', url: '/' }]);

  const body = `
<section class="hero">
  <div class="wrap">
    ${bc.html}
    <h1>קוד קופון אליאקספרס <span class="hl">${esc(monthYear)}</span></h1>
    <p class="lead">${realCodes.length ? `${realCodes.length} קודים פעילים · עד <strong>$${maxDiscount}</strong> הנחה` : 'כל קודי ההנחה, מסודרים לפי סכום ההזמנה'} · עודכן ב-${esc(updatedHe)}</p>
    <ul class="trust">
      <li>${ICON.check} קודים שפג תוקפם יורדים מהרשימה</li>
      <li>${ICON.check} מסודר לפי סכום העגלה</li>
      <li>${ICON.check} חינם, בלי הרשמה</li>
    </ul>
    ${featuredCoupons.length ? `<div class="featured-row">${featuredCoupons.map((c) => `
      <button class="featured" type="button" ${revealAttrs(c, `${money(c.discount, c.currency)} הנחה מעל ${money(c.minOrder, c.currency)}`)}>
        <span class="f-amount">${money(c.discount, c.currency)}</span>
        <span class="f-min">מעל ${money(c.minOrder, c.currency)}</span>
        <span class="f-cta">הצג קוד</span>
      </button>`).join('')}</div>` : ''}
  </div>
</section>

<section class="section" id="codes">
  <div class="wrap layout-2">
    <div>
      <div class="section-head">
        <h2 class="section-title">כל קודי ההנחה הפעילים</h2>
        <div class="filters" role="group" aria-label="סינון לפי סכום ההזמנה">
          <button type="button" class="chip is-on" aria-pressed="true" data-filter="all">הכל</button>
          <button type="button" class="chip" aria-pressed="false" data-filter="0-50">עד $50</button>
          <button type="button" class="chip" aria-pressed="false" data-filter="50-150">$50 עד $150</button>
          <button type="button" class="chip" aria-pressed="false" data-filter="150-99999">מעל $150</button>
        </div>
      </div>
      <div class="coupon-list" id="coupon-list">
        ${coupons.map((c) => couponCard(c)).join('')}
      </div>
      <p class="empty-filter muted" id="empty-filter" hidden>אין קודים בטווח הזה. נסו טווח אחר.</p>

      ${community.length ? `
      <div class="section-head" id="community"><h2 class="section-title">קודים חדשים מהקהילה</h2></div>
      <p class="muted">קודים שקונים פרסמו בפורומים ברשת בשבועות האחרונים. לא בדקנו אותם, אז שווה לנסות רק אם הקודים למעלה לא נכנסו.</p>
      <div class="coupon-list">${community.slice(0, 12).map((c) => couponCard(c, { compact: true })).join('')}</div>` : ''}

      <h2 class="section-title" id="tiers">איזה קוד מתאים לסכום שלי?</h2>
      ${tierTable(coupons)}
      <p class="muted">הסכום נבדק אחרי הנחות החנות ולפני משלוח. אם חסר לכם מעט למדרגה הבאה, לפעמים משתלם להוסיף מוצר קטן שאתם צריכים בכל מקרה.</p>

      <h2 class="section-title">עוד דרכים לחסוך באליאקספרס</h2>
      <div class="deal-grid">${deals.map(dealCard).join('')}</div>
    </div>

    <aside class="sidebar" aria-label="איך זה עובד">
      <div class="side-card side-sticky">
        <h2>איך זה עובד?</h2>
        <ol class="steps">
          <li><span><b>לוחצים "הצג קוד"</b> הקוד מועתק</span></li>
          <li><span><b>אליאקספרס נפתחת</b> בלשונית חדשה</span></li>
          <li><span><b>מדביקים בתשלום</b> בשדה "קוד מבצע"</span></li>
        </ol>
        <a class="btn btn-primary btn-block" href="/go/coupon-center/" ${OUT} data-go="coupon-center">למרכז הקופונים ${ICON.arrow}</a>
        ${site.social.telegram || site.social.whatsapp ? `<div class="side-alert"><b>רוצים לקבל קודים חדשים?</b><p>הצטרפו לערוץ ונשלח הודעה כשיוצאת סדרת קודים חדשה.</p>${site.social.telegram ? `<a class="btn btn-ghost btn-block" href="${esc(site.social.telegram)}" rel="noopener">טלגרם</a>` : ''}${site.social.whatsapp ? `<a class="btn btn-ghost btn-block" href="${esc(site.social.whatsapp)}" rel="noopener">וואטסאפ</a>` : ''}</div>` : ''}
      </div>
    </aside>
  </div>
</section>

${hotProducts.length ? `
<section class="section section-alt">
  <div class="wrap">
    <div class="section-head"><h2 class="section-title">הנמכרים ביותר עם משלוח לישראל</h2><a class="more" href="/deals/">לכל הדילים ←</a></div>
    <div class="product-grid">${hotProducts.map(productCard).join('')}</div>
    <p class="muted">המחירים בשקלים כפי שהתקבלו מאליאקספרס ב-${esc(updatedHe)} ועשויים להשתנות.</p>
  </div>
</section>` : ''}

<section class="section">
  <div class="wrap narrow prose">
    <h2>איך משתמשים בקוד קופון של אליאקספרס</h2>
    <ol>
      <li>בוחרים קוד מהרשימה לפי הסכום שבעגלה ולוחצים <b>"הצג קוד"</b>. הקוד מועתק ואליאקספרס נפתחת.</li>
      <li>מוסיפים מוצרים לעגלה ועוברים לתשלום.</li>
      <li>בשורה <b>"קוד מבצע"</b> מדביקים את הקוד ולוחצים "החל".</li>
      <li>בודקים שהסכום ירד, ורק אז משלמים.</li>
    </ol>
    <p>המדריך המלא, כולל אפליקציה: <a href="/guides/how-to-use-aliexpress-coupon/">איך משתמשים בקוד קופון באליאקספרס</a>.</p>

    <h2>למה הקוד לא נכנס?</h2>
    <ul>
      <li><b>הסכום נמוך מהמינימום.</b> הוא נבדק אחרי הנחות החנות, אז כדאי לבחור מדרגה נמוכה יותר.</li>
      <li><b>הקוד כבר נוצל בחשבון.</b> בדרך כלל כל קוד תקף פעם אחת למשתמש.</li>
      <li><b>המכסה נגמרה.</b> בימי מבצע קודים נגמרים מהר. נסו קוד אחר מאותה מדרגה.</li>
      <li><b>המוצרים לא משתתפים.</b> יש קטגוריות שלא נכללות במבצע.</li>
    </ul>

    <h2>מתי יוצאים הקודים הכי שווים?</h2>
    <p>הקודים הגבוהים יוצאים בדרך כלל במבצעים הגדולים: יום ההולדת של אליאקספרס בסוף מרץ, 11.11 בנובמבר ובלאק פריידי. ראו את <a href="/guides/aliexpress-sales-calendar/">לוח המבצעים</a> ואת המדריך ל<a href="/guides/stacking-aliexpress-discounts/">שילוב כמה הנחות באותה הזמנה</a>.</p>
  </div>
</section>

${faqBlock(faq)}

${expired.length ? `<section class="section"><div class="wrap narrow"><details class="expired"><summary>קודים שפג תוקפם (${expired.length})</summary><ul>${expired.slice(0, 20).map((c) => `<li><s>${esc(c.code)}</s>: ${money(c.discount, c.currency)} מעל ${money(c.minOrder, c.currency)} (עד ${heDate(c.expires)})</li>`).join('')}</ul></details></div></section>` : ''}

<section class="section"><div class="wrap narrow"><p class="disclosure">גילוי נאות: חלק מהקישורים באתר הם קישורי שותפים. כשקונים דרכם אנחנו עשויים לקבל עמלה מאליאקספרס, בלי תוספת למחיר שלכם. <a href="/disclosure/">עוד פרטים</a></p></div></section>`;

  return layout({ title, description, pathname, body, ld: [websiteLd, orgLd, bc.ld, faqLd(faq)] });
}

function dealsIndexPage() {
  const pathname = '/deals/';
  const bc = breadcrumbs([{ name: 'דילים', url: pathname }]);
  const cats = site.dealCategories.map((c) => ({ ...c, items: catItems(c.slug) }));
  const any = cats.some((c) => c.items.length);
  const body = `
<section class="hero hero-sm"><div class="wrap">${bc.html}
  <h1>דילים מאליאקספרס עם משלוח לישראל</h1>
  <p class="lead">המוצרים הנמכרים ביותר לפי קטגוריה, במחירים בשקלים. אפשר לשלב עם <a href="/">קוד קופון</a>.</p>
</div></section>
<section class="section"><div class="wrap">
  ${any ? `<h2 class="section-title">קטגוריות</h2><div class="cat-grid">${cats.filter((c) => c.items.length).map((c) => `<a class="cat" href="/deals/${c.slug}/"><b>${esc(c.name)}</b><span>${c.items.length} מוצרים</span></a>`).join('')}</div>` : ''}
  ${cats.filter((c) => c.items.length).map((c) => `
    <div class="section-head"><h2 class="section-title">${esc(c.name)}</h2><a class="more" href="/deals/${c.slug}/">עוד ←</a></div>
    <div class="product-grid">${c.items.slice(0, 4).map(productCard).join('')}</div>`).join('')}
  ${any ? `<p class="muted">המחירים כפי שהתקבלו מאליאקספרס ב-${esc(updatedHe)} ועשויים להשתנות.</p>` : `<div class="empty"><h2>הדילים יופיעו כאן בקרוב</h2><p>בינתיים אפשר לראות את כל המבצעים ישירות באליאקספרס.</p><a class="btn btn-primary" href="/go/home/" ${OUT} data-go="home">למבצעים באליאקספרס ${ICON.arrow}</a></div>`}
</div></section>`;
  return layout({
    title: `דילים מאליאקספרס לישראל ${monthYear} | ${site.name}`,
    description: 'המוצרים הנמכרים ביותר באליאקספרס עם משלוח לישראל ומחירים בשקלים, לפי קטגוריות.',
    pathname, body, ld: [bc.ld], noindex: !any,
  });
}

function dealCategoryPage(cat) {
  const pathname = `/deals/${cat.slug}/`;
  const items = catItems(cat.slug);
  const bc = breadcrumbs([{ name: 'דילים', url: '/deals/' }, { name: cat.name, url: pathname }]);
  const top = featuredCoupons.slice(0, 2);
  const body = `
<section class="hero hero-sm"><div class="wrap">${bc.html}
  <h1>דילים מאליאקספרס: ${esc(cat.name)}</h1>
  <p class="lead">המוצרים הנמכרים ביותר ב${esc(cat.name)} עם משלוח לישראל, יחד עם קודי ההנחה העדכניים.</p>
</div></section>
<section class="section"><div class="wrap">
  ${top.length ? `<h2 class="section-title">קודי הנחה שאפשר לשלב</h2><div class="coupon-list coupon-list-inline">${top.map((c) => couponCard(c, { compact: true })).join('')}</div>` : ''}
  <h2 class="section-title">הנמכרים ביותר</h2>
  ${items.length ? `<div class="product-grid">${items.map(productCard).join('')}</div>` : `<div class="empty"><p>אין כרגע מוצרים בקטגוריה.</p><a class="btn btn-primary" href="/go/home/" ${OUT} data-go="home">לחיפוש באליאקספרס ${ICON.arrow}</a></div>`}
  <p class="muted">המחירים כפי שהתקבלו מאליאקספרס ב-${esc(updatedHe)} ועשויים להשתנות. <a href="/">לכל קודי הקופון ←</a></p>
</div></section>`;
  return layout({
    title: `דילים מאליאקספרס ב${cat.name} עם משלוח לישראל | ${site.name}`,
    description: `המוצרים הנמכרים ביותר ב${cat.name} מאליאקספרס עם משלוח לישראל ומחירים בשקלים, יחד עם קודי הקופון העדכניים.`,
    pathname, body, ld: [bc.ld], noindex: !items.length,
  });
}

function eventPage(ev) {
  const pathname = `/sale/${ev.slug}/`;
  const short = ev.name.split(' –')[0];
  const bc = breadcrumbs([{ name: `קופונים ל${short}`, url: pathname }]);
  const live = ev.start <= today && ev.end >= today;
  const upcoming = ev.start > today;
  const year = ev.start.slice(0, 4);
  const evCoupons = coupons.filter((c) => !c.event || c.event === ev.slug);
  const body = `
<section class="hero"><div class="wrap">${bc.html}
  <h1>קוד קופון אליאקספרס ל${esc(ev.name)} ${year}</h1>
  <p class="lead">${live ? `המבצע פעיל עכשיו, עד ${heDate(ev.end)}.` : upcoming ? `המבצע צפוי להתחיל ב-${heDate(ev.start)}. נעדכן כאן את הקודים כשאליאקספרס תפרסם אותם. בינתיים, אלה הקודים הפעילים.` : 'המבצע הסתיים. אלה הקודים הפעילים כרגע.'}</p>
  ${upcoming ? `<div class="countdown" data-countdown="${ev.start}T00:00:00+02:00" aria-label="זמן עד תחילת המבצע"></div>` : ''}
</div></section>
<section class="section"><div class="wrap narrow">
  <h2 class="section-title">${live ? 'קודי המבצע' : 'הקודים הפעילים כרגע'}</h2>
  <div class="coupon-list">${evCoupons.map((c) => couponCard(c)).join('')}</div>
  <h2 class="section-title">טבלת מדרגות</h2>
  ${tierTable(evCoupons)}
  <div class="prose">
    <h2>איך מתכוננים ל${esc(short)}</h2>
    <ol>
      <li>מוסיפים לעגלה כבר עכשיו את המוצרים שרוצים. ככה רואים מה המחיר לפני המבצע ומה ההנחה האמיתית.</li>
      <li>אוספים קופונים ממרכז הקופונים של אליאקספרס כשהם נפתחים.</li>
      <li>בפתיחת המבצע חוזרים לעמוד הזה, בוחרים קוד לפי סכום העגלה ומשלמים.</li>
    </ol>
    <p>עוד: <a href="/guides/aliexpress-sales-calendar/">לוח המבצעים השנתי</a> · <a href="/guides/stacking-aliexpress-discounts/">איך משלבים הנחות</a></p>
  </div>
</div></section>`;
  return layout({
    title: `קוד קופון אליאקספרס ל${short} ${year} | ${site.name}`,
    description: `קודי הקופון של אליאקספרס ל${ev.name} ${year} לקונים מישראל, לפי מדרגות, וטיפים להתכונן למבצע.`,
    pathname, body, ld: [bc.ld],
  });
}

function guidesIndexPage() {
  const pathname = '/guides/';
  const bc = breadcrumbs([{ name: 'מדריכים', url: pathname }]);
  const body = `
<section class="hero hero-sm"><div class="wrap">${bc.html}<h1>מדריכים לקנייה חכמה באליאקספרס</h1><p class="lead">מה שכדאי לדעת כדי לשלם פחות.</p></div></section>
<section class="section"><div class="wrap"><div class="guide-grid">${guides.map((g) => `<a class="guide-card" href="/guides/${g.slug}/"><h2>${esc(g.title)}</h2><p>${esc(g.description)}</p><span>לקריאה ←</span></a>`).join('')}</div></div></section>`;
  return layout({ title: `מדריכים לאליאקספרס בעברית | ${site.name}`, description: 'מדריכים בעברית לקנייה באליאקספרס: שימוש בקודי קופון, שילוב הנחות, מכס ומע"מ, Choice ולוח המבצעים.', pathname, body, ld: [bc.ld] });
}

function guidePage(g) {
  const pathname = `/guides/${g.slug}/`;
  const bc = breadcrumbs([{ name: 'מדריכים', url: '/guides/' }, { name: g.short || g.title, url: pathname }]);
  const top = featuredCoupons.slice(0, 2);
  const others = guides.filter((x) => x.slug !== g.slug).slice(0, 3);
  const body = `
<section class="hero hero-sm"><div class="wrap narrow">${bc.html}<h1>${esc(g.title)}</h1><p class="byline">${esc(site.name)} · עודכן ${esc(heLong(g.updated))}</p></div></section>
<section class="section"><div class="wrap narrow">
  <article class="prose">${g.body}</article>
  ${top.length ? `<h2 class="section-title">הקודים המומלצים כרגע</h2><div class="coupon-list">${top.map((c) => couponCard(c, { compact: true })).join('')}</div><p><a href="/">לכל קודי הקופון ←</a></p>` : ''}
  <h2 class="section-title">עוד מדריכים</h2>
  <div class="guide-grid">${others.map((o) => `<a class="guide-card" href="/guides/${o.slug}/"><h3>${esc(o.title)}</h3><span>לקריאה ←</span></a>`).join('')}</div>
</div></section>`;
  const ld = [bc.ld, {
    '@context': 'https://schema.org', '@type': 'Article', headline: g.title, description: g.description, inLanguage: 'he-IL',
    datePublished: g.published, dateModified: g.updated, author: { '@type': 'Organization', name: site.name, url: site.url },
    publisher: { '@type': 'Organization', name: site.name, logo: { '@type': 'ImageObject', url: abs('/assets/apple-touch-icon.png') } },
    image: abs('/assets/og.png'), mainEntityOfPage: abs(pathname),
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

function goPage(target) {
  // Interstitial redirect: noindex. Every outbound affiliate click flows through /go/<id>/.
  const t = safeLink(target, DEFAULT_LINK);
  return `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="robots" content="noindex,nofollow">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>מעבר לאליאקספרס…</title>
<meta http-equiv="refresh" content="0;url=${esc(t)}">
<style>body{font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;background:#fffaf7;color:#1b1b24;text-align:center;padding:16px}a{color:#c20c33}</style>
<script>location.replace(${scriptJSON(t)});</script></head>
<body><p>מעבירים אתכם לאליאקספרס…<br><a href="${esc(t)}" rel="nofollow sponsored">לחצו כאן אם המעבר לא קרה</a></p></body></html>`;
}

/* ------------------------------------------------------------------ */
/* Build                                                               */
/* ------------------------------------------------------------------ */
await fs.rm(DIST, { recursive: true, force: true });
await fs.mkdir(DIST, { recursive: true });
await fs.cp(path.join(ROOT, 'src/assets'), path.join(DIST, 'assets'), { recursive: true });

const sitemap = [];
const page = async (p, html, { lastmod, index = true } = {}) => {
  await write(p === '/' ? 'index.html' : `${p.replace(/^\//, '')}index.html`, html);
  if (index) sitemap.push([p, lastmod]);
};

await page('/', homePage(), { lastmod: dataUpdated });
await page('/deals/', dealsIndexPage(), { index: allProducts().length > 0, lastmod: allProducts().length ? dataUpdated : undefined });
for (const c of site.dealCategories) {
  const has = catItems(c.slug).length > 0;
  await page(`/deals/${c.slug}/`, dealCategoryPage(c), { index: has, lastmod: has ? dataUpdated : undefined });
}
for (const e of manual.events || []) await page(`/sale/${e.slug}/`, eventPage(e), { lastmod: dataUpdated });
await page('/guides/', guidesIndexPage(), { lastmod: guides.map((g) => g.updated).sort().pop() });
for (const g of guides) await page(`/guides/${g.slug}/`, guidePage(g), { lastmod: g.updated });
await page('/about/', staticPage('/about/', 'אודות', `
<p><b>${esc(site.name)}</b> הוא אתר עצמאי שמרכז את קודי הקופון של אליאקספרס לקונים מישראל, במקום אחד ובעברית.</p>
<p>הקודים נאספים ממקורות רשמיים של אליאקספרס ומתוכנית השותפים שלה ומוזנים לאתר. קודים שפג תוקפם יורדים מהרשימה אוטומטית, והכל מסודר לפי סכום ההזמנה כדי שיהיה קל למצוא את הקוד המתאים. קודים שקונים פרסמו בפורומים מוצגים בנפרד ומסומנים "לא נבדק".</p>
<p>יש לכם קוד שעבד ולא מופיע כאן, או קוד שלא עובד? כתבו לנו: <a href="mailto:${esc(site.contactEmail)}">${esc(site.contactEmail)}</a></p>`, `מה זה ${site.name} ואיך האתר עובד.`));
await page('/disclosure/', staticPage('/disclosure/', 'גילוי נאות', `
<p>${esc(site.name)} משתתף בתוכנית השותפים של אליאקספרס (AliExpress Portals). חלק מהקישורים באתר הם קישורי שותפים: כשלוחצים עליהם וקונים, אנחנו עשויים לקבל עמלה מאליאקספרס.</p>
<p>העמלה לא מייקרת את המחיר שלכם, ולא משפיעה על סדר הקודים. הם מסודרים לפי סכום ההזמנה.</p>
<p>האתר אינו קשור, מאושר או מופעל ע"י AliExpress או Alibaba Group. כל הסימנים המסחריים שייכים לבעליהם.</p>
<p>התנאים של כל קוד נקבעים ע"י אליאקספרס, ואנחנו לא יכולים להבטיח שקוד מסוים יעבוד בכל הזמנה.</p>`, 'גילוי נאות על קישורי השותפים באתר.'));
await page('/privacy/', staticPage('/privacy/', 'מדיניות פרטיות', `
<p>האתר לא דורש הרשמה ולא אוסף פרטים מזהים.</p>
${site.analytics?.ga4Id ? '<p>אנחנו משתמשים ב-Google Analytics כדי להבין באופן אנונימי איך משתמשים באתר.</p>' : ''}
<p>כשעוברים מהאתר לאליאקספרס, אליאקספרס עשויה לשמור עוגייה כדי לשייך את הרכישה לתוכנית השותפים. המדיניות של אליאקספרס חלה באתר שלה.</p>
<p>לשאלות: <a href="mailto:${esc(site.contactEmail)}">${esc(site.contactEmail)}</a></p>`, 'מדיניות הפרטיות של האתר.'));

// Outbound redirect pages
const goTargets = new Map([
  ['home', safeLink(links[site.affiliate.homeUrl], '') || DEFAULT_LINK],
  ['coupon-center', safeLink(links[site.affiliate.couponCenterUrl], '') || DEFAULT_LINK],
]);
for (const c of [...coupons, ...expired]) goTargets.set(c.id, resolveLink(c));
for (const c of community) goTargets.set(c.id, DEFAULT_LINK);
for (const d of deals) goTargets.set(d.id, d.id === 'coupon-center' && !safeLink(d.link) ? goTargets.get('coupon-center') : resolveLink(d));
for (const [id, target] of goTargets) await write(`go/${id}/index.html`, goPage(target));

await write('404.html', layout({
  title: `הדף לא נמצא | ${site.name}`, description: 'הדף לא נמצא', pathname: '/404.html', noindex: true,
  body: `<section class="hero"><div class="wrap narrow"><h1>הדף לא נמצא</h1><p class="lead">אבל הקודים כאן.</p><a class="btn btn-primary" href="/">לכל קודי הקופון</a></div></section>`,
}));
await write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${(SAMPLE_MODE ? [] : sitemap).map(([p, lm]) => `  <url><loc>${abs(p)}</loc>${lm ? `<lastmod>${lm}</lastmod>` : ''}</url>`).join('\n')}\n</urlset>\n`);
await write('robots.txt', SAMPLE_MODE ? 'User-agent: *\nDisallow: /\n' : `User-agent: *\nAllow: /\nDisallow: /go/\n\nSitemap: ${abs('/sitemap.xml')}\n`);
await write('.nojekyll', '');

console.log(`✓ built ${sitemap.length} indexable pages + ${goTargets.size} redirects → dist/  (${realCodes.length} real codes, ${coupons.length - realCodes.length} sample, ${community.length} community, ${allProducts().length} products)${SAMPLE_MODE ? '  [PREVIEW – noindex]' : ''}`);
