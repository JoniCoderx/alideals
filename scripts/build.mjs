// Static site generator for יש דיל. Zero dependencies.
// Reads config/site.json + data/coupons.json + data/generated.json → writes dist/
//
// BUILD_STRICT=1 (set in CI) refuses to build while the site still has sample codes or a placeholder
// affiliate link, so placeholder data can never go live.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { faq } from '../src/content/faq.mjs';
import { guides as baseGuides } from '../src/content/guides.mjs';
import { moreGuides } from '../src/content/guides-more.mjs';
import { israelGuides } from '../src/content/guides-israel.mjs';
const guides = [...baseGuides, ...moreGuides, ...israelGuides];
import { eventContent } from '../src/content/events.mjs';
import { categories, categoryColors } from '../src/content/categories.mjs';
import { minifyCSS, minifyHTML } from './minify.mjs';
import { mergeCoupons, mergeDeals, groupTiers, safeLink, normDate, daysBetween, slug } from './lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const TZ = 'Asia/Jerusalem';
const COMMUNITY_MAX_AGE_DAYS = 21;

const site = await readJSON('config/site.json');
const manual = await readJSON('data/coupons.json');
const gen = await readJSON('data/generated.json', {});

const now = process.env.BUILD_DATE ? new Date(`${process.env.BUILD_DATE}T10:00:00Z`) : new Date(); // BUILD_DATE=YYYY-MM-DD for testing
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
// Sample mode = never had real codes (or no affiliate link). Between sales (all real codes expired) is NOT sample mode:
// the site stays indexable and shows the deals + "next codes" message instead of an empty list.
const hadRealCodes = realCodes.length > 0 || expired.some((c) => !c.sample);
const BETWEEN_SALES = !realCodes.length && hadRealCodes;
const SAMPLE_MODE = !hadRealCodes || placeholderLink;
for (const i of invalid) console.warn(`⚠  coupon "${i.id}" skipped: invalid ${i.field}${i.value ? ` (${i.value})` : ''}`);
if (BETWEEN_SALES) console.warn('ℹ  Between sales: all real codes expired – showing the "next codes" box. Add the next codes to data/coupons.json.');
else if (!realCodes.length) console.warn('⚠  No real coupon codes yet (all are sample) – edit data/coupons.json or connect a Google Sheet.');
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
const le = (w) => (/^[\dA-Za-z]/.test(String(w)) ? `ל-${w}` : `ל${w}`);
const money = (n, cur = 'USD') => (cur === 'ILS' ? `₪${n}` : `$${n}`);
const abs = (p) => site.url.replace(/\/$/, '') + p;
const scriptJSON = (v) => JSON.stringify(v).replace(/[<\u2028\u2029]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
const jsonLd = (obj) => `<script type="application/ld+json">${scriptJSON(obj)}</script>`;
const OUT = 'rel="nofollow sponsored"';
async function readJSON(rel, fallback) {
  try { return JSON.parse(await fs.readFile(path.join(ROOT, rel), 'utf8')); }
  catch (e) { if (fallback !== undefined) return fallback; throw e; }
}
async function write(rel, content) {
  const f = path.join(DIST, rel);
  await fs.mkdir(path.dirname(f), { recursive: true });
  await fs.writeFile(f, rel.endsWith('.html') ? minifyHTML(content) : content);
}

/* ------------------------------------------------------------------ */
/* Components                                                          */
/* ------------------------------------------------------------------ */
const logoMark = (id) => `<svg class="mark" viewBox="0 0 64 64" aria-hidden="true"><defs><linearGradient id="${id}" x1="8" y1="4" x2="56" y2="60" gradientUnits="userSpaceOnUse"><stop stop-color="#ff7a2f"/><stop offset="1" stop-color="#e5122f"/></linearGradient></defs><path d="M32 4C16.5 4 4 15.2 4 29c0 6.7 3 12.8 7.8 17.3L8 60l15-6.6c2.8.8 5.9 1.2 9 1.2 15.5 0 28-11.2 28-25S47.5 4 32 4z" fill="url(#${id})"/><path d="M22 39 42 19" stroke="#fff" stroke-width="5.5" stroke-linecap="round"/><circle cx="23" cy="21" r="5" fill="#fff"/><circle cx="41" cy="37" r="5" fill="#fff"/></svg>`;
const wordmark = () => { const n = esc(site.name); return n.endsWith('!') ? `${n.slice(0, -1)}<span class="bang">!</span>` : n; };
const logo = (id) => `${logoMark(id)}<span class="wordmark">${wordmark()}</span>`;
const ICON = {
  check: `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 10.5 3.2 3L15 6.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  clock: `<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="7.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M10 6v4.3l2.8 1.7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  copy: `<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M13 4.5H5.5a1 1 0 0 0-1 1V13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  arrow: `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M12 5 7 10l5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  telegram: `<svg class="tg-ico" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M21.94 4.3a1.1 1.1 0 0 0-1.5-1.17L2.7 10.1c-.95.38-.9 1.74.07 2.05l4.47 1.4 1.7 5.36c.25.8 1.26 1.04 1.85.45l2.52-2.5 4.53 3.33c.68.5 1.65.12 1.82-.7l2.28-15.2Zm-4.2 3.06-7.6 6.9a.6.6 0 0 0-.19.36l-.33 2.45c-.03.2-.31.22-.37.03l-1.14-3.6a.6.6 0 0 1 .26-.69l9.05-5.6c.2-.13.43.14.32.15Z"/></svg>`,
};
const tgBtn = (label, cls = '') => site.social.telegram ? `<a class="btn btn-tg ${cls}" href="${esc(site.social.telegram)}" rel="noopener" target="_blank"><span>${label}</span>${ICON.telegram}</a>` : '';


// Category cards: each category gets its own colour pair + a big emoji illustration (no image requests).
const CAT_COLORS = categoryColors;
const catStyle = (slug) => { const [a, b] = CAT_COLORS[slug] || ['#ff7a2f', '#e5122f']; return `--c1:${a};--c2:${b}`; };
const catCard = (c, sub) => `<a class="cat cat-art" href="/coupon/${c.slug}/" style="${catStyle(c.slug)}"><i class="cat-emoji" aria-hidden="true">${c.emoji}</i><b>${esc(c.name)}</b><span>${esc(sub)}</span><em>לקופונים ←</em></a>`;

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
  else if (manual.updated) status = `<span class="tag tag-ok" title="הקוד הוצלב מול כמה מקורות בתאריך הזה">${ICON.check} עודכן ${heDate(manual.updated)}</span>`;
  const rep = reports[c.code];
  const flagged = !hidden && rep && rep.recent >= 3;
  const reportLink = !hidden && !isCommunity && BOT ? `<a class="report" href="https://t.me/${BOT}?start=r_${encodeURIComponent(c.code)}" rel="noopener" target="_blank">לא עבד לכם? דווחו</a>` : '';
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
      ${flagged ? '<span class="tag tag-warn">⚠️ חלק מהגולשים דיווחו שלא עבד</span>' : ''}
    </div>
    ${reportLink}
    ${c.note && !compact ? `<p class="coupon-note">${esc(c.note)}</p>` : ''}
  </div>
  <div class="coupon-cta">
    ${hidden
      ? `<a class="btn btn-primary" href="/go/${c.id}/" ${OUT} data-go="${c.id}">למרכז הקופונים ${ICON.arrow}</a>`
      : `<button class="btn btn-reveal" type="button" ${revealAttrs(c, title)}>
          <span class="reveal-mask" aria-hidden="true">${masked}</span>
          <span class="reveal-label">העתק קוד<span class="sr-only">: ${esc(title)}</span></span>
        </button>`}
  </div>
</article>`;
}

const DEAL_ICON = { 'new-user': '🎁', 'coupon-center': '🎟️', coins: '🪙', choice: '🚚' };
// Whole tile is one affiliate link (data-go → direct affiliate URL, same tab, app hand-off).
function dealCard(d) {
  return `
<a class="deal-tile" href="/go/${d.id}/" ${OUT} data-go="${d.id}">
  <span class="deal-ic" aria-hidden="true">${DEAL_ICON[d.id] || '🔥'}</span>
  ${d.badge ? `<span class="tag tag-star">${esc(d.badge)}</span>` : ''}
  <h3>${esc(d.title)}</h3>
  <p>${esc(d.text || '')}</p>
  <span class="deal-cta">למבצע ←</span>
</a>`;
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
  <div class="product-img"><img src="${esc(img)}_350x350.jpg" alt="${esc(p.title)}" loading="lazy" decoding="async" width="350" height="350" onerror="this.onerror=null;this.src=this.src.replace(/_350x350\.jpg$/,'')"></div>
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
  <caption>מדרגות קודי ההנחה של עליאקספרס, ${esc(monthYear)}</caption>
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
    ? `🔥 קודי ${esc(short)} לישראל בתוקף עכשיו${activeEvent.end ? `, עד ${heDate(activeEvent.end)}` : ''}. לכל הקודים`
    : `⏳ ${esc(short)} מתחיל ${days === 1 ? 'מחר' : `בעוד ${days} ימים`}. כך מתכוננים`;
  return `<div class="topbar"><a href="/sale/${activeEvent.slug}/">${text} ←</a></div>`;
}

/* ------------------------------------------------------------------ */
/* Layout                                                              */
/* ------------------------------------------------------------------ */
const BUILD_ID = Date.now().toString(36);
const INLINE_CSS = minifyCSS(await fs.readFile(path.join(ROOT, 'src/assets/style.css'), 'utf8'));
const USD_ILS = Number(gen.fx?.usdIls) || Number(site.fx?.usdIls) || 3.7;
const verification = site.verification || {};

function layout({ title, description, pathname, body, ld = [], noindex = false, ogType = 'website', share = null }) {
  const ogTitle = share?.title || title, ogDesc = share?.description || description, ogImg = share?.image || '/assets/og-v2.jpg';
  const canonical = abs(pathname);
  const ga = site.analytics?.ga4Id;
  const robots = noindex || SAMPLE_MODE ? 'noindex,nofollow' : 'index,follow,max-image-preview:large,max-snippet:-1';
  const nav = [
    ['/', 'קודי קופון'],
    ...(FINDER_API ? [['/finder/', '🎯 צייד הדילים']] : []),
    ['/coupon/', 'קטגוריות'],
    ...(allProducts().length ? [['/deals/', 'דילים']] : []),
    ...(activeEvent ? [[`/sale/${activeEvent.slug}/`, activeEvent.name.split(' –')[0]]] : []),
    ['/guides/', 'מדריכים'],
  ];
  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
${noindex ? '' : `<link rel="canonical" href="${canonical}">`}
<link rel="alternate" hreflang="he-IL" href="${canonical}">
<link rel="alternate" hreflang="x-default" href="${canonical}">
<meta name="robots" content="${robots}">
<meta property="og:type" content="${ogType}">
<meta property="og:locale" content="${site.locale}">
<meta property="og:site_name" content="${esc(site.name)}">
<meta property="og:title" content="${esc(ogTitle)}">
<meta property="og:description" content="${esc(ogDesc)}">
<meta property="og:url" content="${canonical}">
<meta property="og:image" content="${abs(ogImg)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${esc(site.name)}: קוד קופון עליאקספרס לישראל">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#ff3d2e">
<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/assets/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<link rel="alternate" type="application/atom+xml" title="${esc(site.name)}: קודים חדשים" href="/feed.xml">
<link rel="preload" href="/assets/fonts/rubik-hebrew.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/assets/fonts/rubik-latin.woff2" as="font" type="font/woff2" crossorigin>
<meta name="format-detection" content="telephone=no">
${verification.google ? `<meta name="google-site-verification" content="${esc(verification.google)}">` : ''}
${verification.bing ? `<meta name="msvalidate.01" content="${esc(verification.bing)}">` : ''}
<style>${INLINE_CSS}</style>
${site.analytics?.cfBeacon ? `<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='${esc(JSON.stringify({ token: site.analytics.cfBeacon }))}'></script>` : ''}
${ga ? `<script async src="https://www.googletagmanager.com/gtag/js?id=${esc(ga)}"></script><script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config',${scriptJSON(ga)});</script>` : ''}
${ld.map(jsonLd).join('\n')}
</head>
<body>
<a class="skip" href="#main">דלג לתוכן</a>
${SAMPLE_MODE ? '<div class="preview-bar" role="note">תצוגה מקדימה עם נתוני דוגמה. האתר לא יעלה לאוויר עד שיוזנו קודים אמיתיים וקישור שותפים.</div>' : ''}
${topbar()}
<header class="site-header">
  <div class="wrap header-row">
    <a class="brand" href="/" aria-label="${esc(site.name)}, דף הבית">${logo('lg-h')}</a>
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
      <a class="brand brand-footer" href="/">${logo('lg-f')}</a>
      <p>${esc(site.tagline)}. האתר עצמאי ואינו קשור לעליאקספרס או לקבוצת עליבאבא.</p>
    </div>
    <div>
      <h2>קופונים</h2>
      <a href="/">קוד קופון עליאקספרס</a>
      ${allProducts().length ? '<a href="/deals/">דילים מעליאקספרס</a>' : ''}
      <a href="/new-user/">קופון למשתמש חדש</a>
      <a href="/existing-user/">קוד קופון למשתמש קיים</a>
      <a href="/coupon/">קופונים לפי קטגוריה</a>
      ${categories.map((c) => `<a href="/coupon/${c.slug}/">קופון ל${esc(c.short)}</a>`).join('')}
      ${(manual.events || []).map((e) => `<a href="/sale/${e.slug}/">קופונים ${esc(le(e.name.split(' –')[0]))}</a>`).join('')}
    </div>
    <div>
      <h2>מדריכים</h2>
      ${['first-time-aliexpress', 'how-to-use-aliexpress-coupon', 'aliexpress-tracking', 'aliexpress-customs-israel', 'aliexpress-payment', 'is-aliexpress-safe', 'aliexpress-returns', 'aliexpress-customer-service'].map((sl) => guides.find((g) => g.slug === sl)).filter(Boolean).map((g) => `<a href="/guides/${g.slug}/">${esc(g.short || g.title)}</a>`).join('')}
      <a href="/guides/">כל המדריכים ←</a>
    </div>
    <div>
      <h2>האתר</h2>
      <a href="/about/">אודות</a>
      <a href="/disclosure/">גילוי נאות</a>
      <a href="/privacy/">פרטיות</a>
      ${FINDER_API ? '<a href="/finder/">🎯 צייד הדילים</a>' : ''}
      ${site.social.telegram ? `<a class="foot-tg" href="${esc(site.social.telegram)}" rel="noopener" target="_blank">ערוץ טלגרם ${ICON.telegram}</a>` : ''}
      ${site.social.whatsapp ? `<a href="${esc(site.social.whatsapp)}" rel="noopener">ערוץ וואטסאפ</a>` : ''}
      ${site.social.facebook ? `<a class="foot-fb" href="${esc(site.social.facebook)}" rel="noopener" target="_blank">עמוד פייסבוק <svg class="tg-ico" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M24 12a12 12 0 1 0-13.9 11.9v-8.4H7.1V12h3V9.4c0-3 1.8-4.7 4.5-4.7 1.3 0 2.7.2 2.7.2v3h-1.5c-1.5 0-2 .9-2 1.9V12h3.4l-.5 3.5h-2.9v8.4A12 12 0 0 0 24 12z"/></svg></a>` : ''}
    </div>
  </div>
  <div class="wrap footer-legal">© ${now.getFullYear()} ${esc(site.name)} · חלק מהקישורים באתר הם קישורי שותפים. <a href="/disclosure/">פרטים</a></div>
</footer>
<dialog class="modal" id="code-modal" aria-labelledby="modal-title">
  <form method="dialog"><button type="submit" class="modal-x" aria-label="סגירה">×</button></form>
  <p class="modal-kicker" id="modal-kicker">הקוד הועתק ✓</p>
  <h2 id="modal-title">הקוד שלכם</h2>
  <div class="modal-code"><code id="modal-code"></code><button class="btn btn-primary" type="button" id="modal-copy">${ICON.copy}<span>העתקה</span></button></div>
  <ol class="modal-steps">
    <li>נכנסים לעליאקספרס (אם האפליקציה מותקנת, היא אמורה להיפתח)</li>
    <li>מוסיפים מוצרים לעגלה ועוברים לתשלום</li>
    <li>מדביקים את הקוד בשדה <b>"קוד מבצע"</b></li>
  </ol>
  <div class="modal-countdown" id="modal-countdown" role="status"><span>פותחים את עליאקספרס בעוד <b id="modal-count">2</b>…</span><i id="modal-bar"></i></div>
  <div class="modal-links"><a id="modal-go" href="/go/home/" ${OUT}>לא נפתח? לחצו כאן</a></div>
  <a class="share-wa" id="modal-share" href="https://wa.me/" target="_blank" rel="noopener">שלחו את הקוד לחבר בוואטסאפ</a>
</dialog>
${!FINDER_API ? `<aside class="promo-toast" id="promo-toast" hidden aria-label="חדש באתר"><button type="button" class="pt-x" aria-label="סגירה">×</button><b>🎯 בקרוב: צייד הדילים</b><span>אתם שולחים קישור למוצר, הצייד יסרוק את המוכרים ויחפש הצעות זולות יותר.</span><a href="/finder/">להכיר את הצייד ←</a></aside>` : ''}
<script>window.SITE=${scriptJSON({ url: site.url, name: site.name, links: Object.fromEntries(goTargets) })}</script>
<script src="/assets/app.js?v=${BUILD_ID}" defer></script>
</body>
</html>`;
}

/* ------------------------------------------------------------------ */
/* Pages                                                               */
/* ------------------------------------------------------------------ */
const orgLd = {
  '@context': 'https://schema.org', '@type': 'Organization', name: site.name, alternateName: site.nameEn,
  url: site.url, logo: abs('/assets/icon-512.png'),
  ...(Object.values(site.social).some(Boolean) ? { sameAs: Object.values(site.social).filter(Boolean) } : {}),
};
const websiteLd = { '@context': 'https://schema.org', '@type': 'WebSite', name: site.name, alternateName: site.nameEn, url: site.url, inLanguage: 'he-IL' };
const faqLd = (items) => ({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: items.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) });

// Between sales (no active codes): say what happens next instead of showing an empty list.
function nextCodesBox() {
  const next = (manual.events || []).filter((e) => e.start > today).sort((a, b) => a.start.localeCompare(b.start))[0];
  const nshort = next ? next.name.split(' –')[0] : '';
  return `<div class="between">
  <b>⏳ קודי המבצע הקודם הסתיימו</b>
  <p>${next ? `קודי ${esc(nshort)} צפויים לצאת סביב ${heDate(next.start)}. נעדכן כאן ובערוץ הטלגרם זמן קצר אחרי שהם יוצאים.` : 'קודי המבצע הבא יופיעו כאן זמן קצר אחרי שעליאקספרס תפרסם אותם.'} בינתיים אפשר לחסוך עם הקופונים במרכז הקופונים של עליאקספרס.</p>
  <div class="between-cta"><a class="btn btn-primary" href="/go/coupon-center/" ${OUT} data-go="coupon-center">למרכז הקופונים ${ICON.arrow}</a>${tgBtn('קבלו את הקודים בטלגרם')}</div>
</div>`;
}

function calcWidget() {
  if (!realCodes.length) return '';
  const data = coupons.filter((c) => (c.currency || 'USD') === 'USD').map((c) => ({
    id: c.id, d: c.discount, m: c.minOrder, s: c.sample || !c.code ? 1 : 0, code: c.sample ? '' : c.code,
    t: `${money(c.discount)} הנחה מעל ${money(c.minOrder)}`,
  }));
  if (!data.length) return '';
  return `<div class="calc" id="calc" data-rate="${USD_ILS}">
    <label class="calc-label" for="calc-amount">כמה יש לכם בעגלה?</label>
    <div class="calc-row">
      <input id="calc-amount" type="text" inputmode="decimal" autocomplete="off" placeholder="למשל 60" aria-describedby="calc-out">
      <div class="seg" role="group" aria-label="מטבע">
        <button type="button" class="is-on" aria-pressed="true" data-cur="USD">$</button>
        <button type="button" aria-pressed="false" data-cur="ILS">₪</button>
      </div>
    </div>
    <div class="calc-out" id="calc-out" aria-live="polite">הקלידו את סכום העגלה ונציג את הקוד הכי משתלם בשבילכם.</div>
    <script type="application/json" id="calc-data">${scriptJSON(data)}</script>
  </div>`;
}

function faqBlock(items) {
  return `<section class="section" id="faq"><div class="wrap narrow">
  <h2 class="section-title">שאלות נפוצות על קופונים לעליאקספרס</h2>
  <div class="faq">${items.map((f) => `<details><summary><h3>${esc(f.q)}</h3></summary><p>${esc(f.a)}</p></details>`).join('')}</div>
</div></section>`;
}

// Product deals stay OFF in production until explicitly approved (config: productsInProduction). The 2.0 preview at /test/ uses its own data.
const PRODUCTS_ON = site.productsInProduction === true;
const allProducts = () => (PRODUCTS_ON ? Object.values(gen.deals || {}).flat().filter((p) => safeLink(p.link) && safeLink(p.image)) : []);
const catItems = (slugName) => (PRODUCTS_ON ? (gen.deals?.[slugName] || []).filter((p) => safeLink(p.link) && safeLink(p.image)) : []);

// Code reports collected by the Telegram bot (scripts/telegram.mjs → generated.json).
const BOT = gen.telegram?.bot || '';
const reports = Object.fromEntries(Object.entries(gen.telegram?.reports || {}).map(([code, list]) => [code, { recent: new Set((list || []).filter((r) => r && r.d && daysBetween(r.d, today) <= 3).map((r) => r.u)).size }]));

const soonestExpiry = realCodes.map((c) => c.expires).filter(Boolean).sort()[0] || '';
const heShort = (d) => { const [, m, dd] = d.split('-'); return `${Number(dd)}.${Number(m)}`; };

function homePage() {
  const pathname = '/';
  const title = realCodes.length
    ? `קוד קופון עליאקספרס ${monthYear}: קודי הנחה עד $${maxDiscount} | AliExpress`
    : `קוד קופון עליאקספרס ${monthYear}: הקודים לישראל | ${site.name}`;
  const description = realCodes.length
    ? `${realCodes.length} קודי הנחה פעילים לעליאקספרס (עלי אקספרס) לקונים מישראל, מ-$${Math.min(...realCodes.map((c) => c.discount))} ועד $${maxDiscount} לפי סכום ההזמנה. עודכן ב-${updatedHe}, בלי הרשמה.`
    : `קודי הקופון וההנחות של עליאקספרס לקונים מישראל, מסודרים לפי סכום ההזמנה. עודכן ב-${updatedHe}.`;
  const hotProducts = allProducts().sort((a, b) => b.sold - a.sold).slice(0, 8);
  const body = `
<section class="hero hero-home">
  <div class="hero-deco" aria-hidden="true"><span class="fl fl1">%</span><span class="fl fl2">🎟️</span><span class="fl fl3">%</span><span class="fl fl4">💸</span></div>
  <div class="wrap hero-grid">
    <div class="hero-text">
      <h1 class="h1-kicker">קודי קופון לעליאקספרס · ${esc(monthYear)}</h1>
      <p class="slogan">קונים בעליאקספרס?<br><span class="hl">יש דיל.</span></p>
      <p class="lead">קודי הקופון וההנחות לעלי אקספרס במקום אחד. בוחרים קוד לפי העגלה, ומשלמים פחות על כל הזמנה.</p>
      <p class="stats">${realCodes.length ? `<b>${realCodes.length}</b> קודים פעילים · עד <b>$${maxDiscount}</b> הנחה, כ־${Math.round(maxDiscount * USD_ILS)} שקל · ` : ''}עודכן ב-${esc(updatedHe)}</p>
      ${soonestExpiry ? `<p class="urgency" data-until="${soonestExpiry}">⏳ <span>הקודים בתוקף עד ${esc(heShort(soonestExpiry))}</span></p>` : ''}
      <ul class="trust">
        <li>${ICON.check} קודים שפג תוקפם יורדים מהרשימה</li>
        <li>${ICON.check} מסודר לפי סכום העגלה</li>
        <li>${ICON.check} חינם, בלי הרשמה</li>
      </ul>
      <div class="hero-cta">
        <a class="btn btn-primary" href="#codes">לכל הקודים ↓</a>
        ${tgBtn('קודים חדשים בטלגרם')}
      </div>
      ${activeEvent ? `<p class="hero-event"><a href="/sale/${activeEvent.slug}/">🔥 קודי ${esc(activeEvent.name.split(' –')[0])} ←</a></p>` : ''}
    </div>
    ${calcWidget()}
    ${featuredCoupons.length ? `<div class="featured-row">${featuredCoupons.map((c, i) => `
      <button class="featured${i === 1 ? ' is-hot' : ''}" type="button" ${revealAttrs(c, `${money(c.discount, c.currency)} הנחה מעל ${money(c.minOrder, c.currency)}`)}>${i === 1 ? '<span class="f-badge">🔥 מומלץ</span>' : ''}
        <span class="f-amount">${money(c.discount, c.currency)}</span>
        <span class="f-min">מעל ${money(c.minOrder, c.currency)}</span>
        <span class="f-cta">העתק קוד</span>
      </button>`).join('')}</div>` : ''}
    ${site.social.telegram ? `<div class="m-tg">${tgBtn('קודים חדשים ישר לטלפון: הצטרפו לטלגרם', 'btn-block')}</div>` : ''}
  </div>
</section>

${!FINDER_API ? `<section class="section finder-promo"><div class="wrap"><div class="finder-tease hunter">
  <div class="ft-text">
    <span class="ft-badge">🎯 חדש · יוצא לציד בקרוב</span>
    <h2>צייד הדילים</h2>
    <p class="hunter-tag">אתם שולחים קישור. הצייד יוצא לחפש לכם דיל.</p>
    <p>אותו מוצר נמכר בעליאקספרס אצל הרבה מוכרים, לפעמים בהפרשים גדולים. תדביקו קישור, והצייד יסרוק את השטח ויחזיר לכם הצעות זולות יותר לאותו מוצר, אם יש.</p>
    <a class="btn ft-cta" href="/finder/">איך הצייד עובד ←</a>
  </div>
  <div class="ft-visual"><div class="radar" aria-hidden="true">
    <div class="radar-sweep"></div>
    <span class="blip b1"><i>₪89</i></span><span class="blip b2"><i>₪74</i></span><span class="blip b4"><i>₪95</i></span><span class="blip b3 best"><i>₪61 🎯</i></span>
    <div class="radar-core">🎯</div>
  </div><small>המחשה</small></div>
  <ol class="ft-steps">
    <li><b>🎯 נועל מטרה</b><span>מזהה את המוצר מהקישור, גם מהאפליקציה</span></li>
    <li><b>📡 סורק את השטח</b><span>עובר על המוכרים שמוכרים את אותו מוצר</span></li>
    <li><b>🛡️ עוקף מלכודות</b><span>מסנן דירוג נמוך, בלי מכירות או בלי משלוח לישראל</span></li>
    <li><b>🏆 מביא את השלל</b><span>הזול למעלה, במחיר בשקלים. אתם מחליטים</span></li>
  </ol>
  ${site.social.telegram ? `<p class="ft-note">רוצים להיות הראשונים כשהצייד יוצא לדרך? <a href="${esc(site.social.telegram)}" rel="noopener" target="_blank">הצטרפו לטלגרם ${ICON.telegram}</a></p>` : ''}
</div></div></section>` : ''}
${FINDER_API ? `<section class="section finder-promo"><div class="wrap"><a class="finder-banner" href="/finder/"><b>🎯 חדש: צייד הדילים</b><span>אתם שולחים קישור למוצר, הצייד חוזר עם הצעות זולות יותר לאותו מוצר</span><i>שלחו את הצייד ←</i></a></div></section>` : ''}
<section class="section" id="codes">
  <div class="wrap layout-2">
    <div>
      <div class="section-head">
        <h2 class="section-title">כל קודי ההנחה הפעילים</h2>
        ${realCodes.length ? `<div class="filters" role="group" aria-label="סינון לפי סכום ההזמנה">
          <button type="button" class="chip is-on" aria-pressed="true" data-filter="all">הכל</button>
          <button type="button" class="chip" aria-pressed="false" data-filter="0-50">עד $50</button>
          <button type="button" class="chip" aria-pressed="false" data-filter="50-150">$50 עד $150</button>
          <button type="button" class="chip" aria-pressed="false" data-filter="150-99999">מעל $150</button>
        </div>` : ''}
      </div>
      ${manual.listNote && realCodes.length ? `<p class="list-note">${esc(manual.listNote)}</p>` : ''}
      ${!realCodes.length ? nextCodesBox() : ''}
      <div class="coupon-list" id="coupon-list">
        ${coupons.map((c) => couponCard(c)).join('')}
      </div>
      <p class="empty-filter muted" id="empty-filter" hidden>אין קודים בטווח הזה. נסו טווח אחר.</p>
      ${site.social.telegram ? `<div class="m-tg m-tg-list"><b>🔔 רוצים לדעת כשיוצאים קודים חדשים?</b>${tgBtn('הצטרפו לערוץ הטלגרם', 'btn-block')}</div>` : ''}

      ${community.length ? `
      <div class="section-head" id="community"><h2 class="section-title">קודים חדשים מהקהילה</h2></div>
      <p class="muted">קודים שקונים פרסמו בפורומים ברשת בשבועות האחרונים. לא בדקנו אותם, אז שווה לנסות רק אם הקודים למעלה לא נכנסו.</p>
      <div class="coupon-list">${community.slice(0, 12).map((c) => couponCard(c, { compact: true })).join('')}</div>` : ''}

      ${coupons.length ? `<details class="tiers-box" id="tiers"><summary><h2>איזה קוד מתאים לסכום שלי? <span>טבלת כל המדרגות</span></h2></summary>
      ${tierTable(coupons)}
      <p class="muted">הסכום נבדק אחרי הנחות החנות ולפני משלוח. אם חסר לכם מעט למדרגה הבאה, לפעמים משתלם להוסיף מוצר קטן שאתם צריכים בכל מקרה.</p>
      </details>` : ''}

      <h2 class="section-title">עוד דרכים לחסוך בעליאקספרס</h2>
      <div class="deal-grid">${deals.map(dealCard).join('')}</div>
    </div>

    <aside class="sidebar" aria-label="איך זה עובד">
      <div class="side-card side-sticky">
        <h2>איך זה עובד?</h2>
        <ol class="steps">
          <li><span><b>לוחצים "העתק קוד"</b> הקוד מועתק</span></li>
          <li><span><b>עליאקספרס נפתחת</b> אוטומטית</span></li>
          <li><span><b>מדביקים בתשלום</b> בשדה "קוד מבצע"</span></li>
        </ol>
        <a class="btn btn-primary btn-block" href="/go/coupon-center/" ${OUT} data-go="coupon-center">למרכז הקופונים ${ICON.arrow}</a>
        ${site.social.telegram || site.social.whatsapp ? `<div class="side-alert"><b>רוצים לקבל קודים חדשים?</b><p>הצטרפו לערוץ ונשלח הודעה כשיוצאת סדרת קודים חדשה.</p>${tgBtn('הצטרפו לערוץ הטלגרם', 'btn-block')}${site.social.whatsapp ? `<a class="btn btn-ghost btn-block" href="${esc(site.social.whatsapp)}" rel="noopener">וואטסאפ</a>` : ''}</div>` : ''}
      </div>
    </aside>
  </div>
</section>

${hotProducts.length ? `
<section class="section section-alt">
  <div class="wrap">
    <div class="section-head"><h2 class="section-title">הנמכרים ביותר עם משלוח לישראל</h2><a class="more" href="/deals/">לכל הדילים ←</a></div>
    <div class="product-grid">${hotProducts.map(productCard).join('')}</div>
    <p class="muted">המחירים בשקלים כפי שהתקבלו מעליאקספרס ב-${esc(updatedHe)} ועשויים להשתנות.</p>
  </div>
</section>` : ''}

<section class="section">
  <div class="wrap info-grid">
    <div class="info-card"><h2>מתי יוצאים הקודים הכי שווים?</h2>
    <p>הקודים הגבוהים יוצאים בדרך כלל במבצעים הגדולים: יום ההולדת של עליאקספרס בסוף מרץ, 11.11 בנובמבר ובלאק פריידי. ראו את <a href="/guides/aliexpress-sales-calendar/">לוח המבצעים</a> ואת המדריך ל<a href="/guides/stacking-aliexpress-discounts/">שילוב כמה הנחות באותה הזמנה</a>.</p></div>
    <div class="info-card"><h2>מדריכים פופולריים</h2>
    <ul>
      <li><a href="/guides/first-time-aliexpress/">איך קונים בעליאקספרס בפעם הראשונה</a></li>
      <li><a href="/guides/is-aliexpress-safe/">האם עליאקספרס בטוח?</a></li>
      <li><a href="/guides/aliexpress-shipping-israel/">כמה זמן לוקח משלוח לישראל</a></li>
      <li><a href="/guides/aliexpress-vs-temu/">עליאקספרס או טמו: מה עדיף?</a></li>
      <li><a href="/guides/aliexpress-dispute/">איך פותחים מחלוקת ומקבלים החזר</a></li>
    </ul></div>
  </div>
</section>



<section class="section"><div class="wrap">
  <h2 class="section-title">קופונים לעלי אקספרס לפי קטגוריה</h2>
  <div class="cat-grid">${categories.map((c) => catCard(c, `קופון עליאקספרס ל${c.short}`)).join('')}</div>
</div></section>

${faqBlock(faq)}

${expired.length ? `<section class="section"><div class="wrap narrow"><details class="expired"><summary>קודים שפג תוקפם (${expired.length})</summary><ul>${expired.slice(0, 20).map((c) => `<li><s>${esc(c.code)}</s>: ${money(c.discount, c.currency)} מעל ${money(c.minOrder, c.currency)} (עד ${heDate(c.expires)})</li>`).join('')}</ul></details></div></section>` : ''}

${coupons.length ? `<div class="sticky-cta" id="sticky-cta" hidden><span>עד <b>${money(Math.max(...coupons.map((c) => c.discount)))}</b> הנחה בעליאקספרס</span><a class="btn btn-primary" href="#calc">מצאו את הקוד שלכם</a></div>` : ''}
${site.social.telegram || site.social.facebook ? `<section class="section community"><div class="wrap"><div class="comm-box">
  <div class="comm-text"><span class="comm-kicker">הקהילה של יש דיל</span>
  ${gen.telegramMembers?.count >= 100 ? `<p class="comm-count"><b>${Math.floor(gen.telegramMembers.count / 100) * 100 >= 1000 ? (Math.floor(gen.telegramMembers.count / 100) * 100).toLocaleString('en-US') + '+' : gen.telegramMembers.count}</b> חברים בערוץ הטלגרם</p>` : '<p class="comm-count"><b>הצטרפו לקהילה</b></p>'}
  <p>קודים חדשים, דילים נבחרים וטיפים לקנייה בעליאקספרס, ישר לטלפון. בלי ספאם.</p></div>
  <div class="comm-btns">${tgBtn('לערוץ הטלגרם', 'btn-block')}${site.social.facebook ? `<a class="btn btn-fb btn-block" href="${esc(site.social.facebook)}" rel="noopener" target="_blank"><span>לעמוד הפייסבוק</span><svg class="tg-ico" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M24 12a12 12 0 1 0-13.9 11.9v-8.4H7.1V12h3V9.4c0-3 1.8-4.7 4.5-4.7 1.3 0 2.7.2 2.7.2v3h-1.5c-1.5 0-2 .9-2 1.9V12h3.4l-.5 3.5h-2.9v8.4A12 12 0 0 0 24 12z"/></svg></a>` : ''}</div>
</div></div></section>` : ''}
<section class="section"><div class="wrap narrow"><p class="disclosure">גילוי נאות: חלק מהקישורים באתר הם קישורי שותפים. כשקונים דרכם אנחנו עשויים לקבל עמלה מעליאקספרס, בלי תוספת למחיר שלכם. <a href="/disclosure/">עוד פרטים</a></p></div></section>`;

  return layout({ title, description, pathname, body, ld: [websiteLd, orgLd, faqLd(faq)], share: { title: 'יש דיל! לפני שקונים בעליאקספרס, עוברים כאן', description: 'הקוד שמתאים בדיוק לסכום ההזמנה שלך, מחשבון שמראה כמה יוצא בסוף, וערוץ טלגרם עם הדילים של היום. חינם, בעברית, מתעדכן כל שעה.', image: '/assets/og-share.jpg' } });
}

function dealsIndexPage() {
  const pathname = '/deals/';
  const bc = breadcrumbs([{ name: 'דילים', url: pathname }]);
  const cats = site.dealCategories.map((c) => ({ ...c, items: catItems(c.slug) }));
  const any = cats.some((c) => c.items.length);
  const body = `
<section class="hero hero-sm"><div class="wrap">${bc.html}
  <h1>דילים מעליאקספרס עם משלוח לישראל</h1>
  <p class="lead">המוצרים הנמכרים ביותר לפי קטגוריה, במחירים בשקלים. אפשר לשלב עם <a href="/">קוד קופון</a>.</p>
</div></section>
<section class="section"><div class="wrap">
  ${any ? `<h2 class="section-title">קטגוריות</h2><div class="cat-grid">${cats.filter((c) => c.items.length).map((c) => `<a class="cat" href="/deals/${c.slug}/"><b>${esc(c.name)}</b><span>${c.items.length} מוצרים</span></a>`).join('')}</div>` : ''}
  ${cats.filter((c) => c.items.length).map((c) => `
    <div class="section-head"><h2 class="section-title">${esc(c.name)}</h2><a class="more" href="/deals/${c.slug}/">עוד ←</a></div>
    <div class="product-grid">${c.items.slice(0, 4).map(productCard).join('')}</div>`).join('')}
  ${any ? `<p class="muted">המחירים כפי שהתקבלו מעליאקספרס ב-${esc(updatedHe)} ועשויים להשתנות.</p>` : `<div class="empty"><h2>הדילים יופיעו כאן בקרוב</h2><p>בינתיים אפשר לראות את כל המבצעים ישירות בעליאקספרס.</p><a class="btn btn-primary" href="/go/home/" ${OUT} data-go="home">למבצעים בעליאקספרס ${ICON.arrow}</a></div>`}
</div></section>`;
  return layout({
    title: `דילים מעליאקספרס לישראל ${monthYear} | ${site.name}`,
    description: 'המוצרים הנמכרים ביותר בעליאקספרס עם משלוח לישראל ומחירים בשקלים, לפי קטגוריות.',
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
  <h1>דילים מעליאקספרס: ${esc(cat.name)}</h1>
  <p class="lead">המוצרים הנמכרים ביותר ב${esc(cat.name)} עם משלוח לישראל, יחד עם קודי ההנחה העדכניים.</p>
</div></section>
<section class="section"><div class="wrap">
  ${top.length ? `<h2 class="section-title">קודי הנחה שאפשר לשלב</h2><div class="coupon-list coupon-list-inline">${top.map((c) => couponCard(c, { compact: true })).join('')}</div>` : ''}
  <h2 class="section-title">הנמכרים ביותר</h2>
  ${items.length ? `<div class="product-grid">${items.map(productCard).join('')}</div>` : `<div class="empty"><p>אין כרגע מוצרים בקטגוריה.</p><a class="btn btn-primary" href="/go/home/" ${OUT} data-go="home">לחיפוש בעליאקספרס ${ICON.arrow}</a></div>`}
  <p class="muted">המחירים כפי שהתקבלו מעליאקספרס ב-${esc(updatedHe)} ועשויים להשתנות. <a href="/">לכל קודי הקופון ←</a></p>
</div></section>`;
  return layout({
    title: `דילים מעליאקספרס ב${cat.name} עם משלוח לישראל | ${site.name}`,
    description: `המוצרים הנמכרים ביותר ב${cat.name} מעליאקספרס עם משלוח לישראל ומחירים בשקלים, יחד עם קודי הקופון העדכניים.`,
    pathname, body, ld: [bc.ld], noindex: !items.length,
  });
}

function eventPage(ev) {
  const pathname = `/sale/${ev.slug}/`;
  const short = ev.name.split(' –')[0];
  const content = eventContent[ev.slug] || {};
  const bc = breadcrumbs([{ name: `קופונים ${le(short)}`, url: pathname }]);
  const live = ev.start <= today && ev.end >= today;
  const upcoming = ev.start > today;
  const year = ev.start.slice(0, 4);
  const own = coupons.filter((c) => c.event === ev.slug);
  const ownLive = own.filter((c) => c.code && !c.sample && (!c.expires || c.expires >= today));
  const evCoupons = own.length ? own : (coupons.filter((c) => c.featured).length ? coupons.filter((c) => c.featured) : coupons).slice(0, 3);
  const faqItems = content.faq || [];
  const body = `
<section class="hero"><div class="wrap narrow">${bc.html}
  <h1>קוד קופון עליאקספרס ${esc(le(short))} ${year}</h1>
  <p class="lead">${live ? `המבצע פעיל עכשיו, עד ${heDate(ev.end)}.` : upcoming ? `המבצע צפוי להתחיל ב-${heDate(ev.start)}. כשעליאקספרס תפרסם את קודי המבצע, הם יופיעו כאן.` : 'המבצע הסתיים. אלה הקודים הפעילים כרגע.'}</p>
  ${upcoming ? `<div class="countdown" data-countdown="${ev.start}T00:00:00+02:00" role="timer" aria-label="זמן עד תחילת המבצע"></div>` : ''}
</div></section>
<section class="section"><div class="wrap narrow">
  ${content.intro ? `<div class="prose">${content.intro}</div>` : ''}
  ${evCoupons.length ? `<h2 class="section-title">${own.length && live ? `קודי ${esc(short)}` : 'הקודים הפעילים כרגע'}</h2>
  <div class="coupon-list">${evCoupons.map((c) => couponCard(c)).join('')}</div>` : nextCodesBox()}
  ${evCoupons.length ? `<h2 class="section-title">טבלת מדרגות</h2>${tierTable(evCoupons)}` : ''}
  <div class="prose">
    <h2>איך מתכוננים ${esc(le(short))}</h2>
    <ol>
      <li>מוסיפים לעגלה כבר עכשיו את המוצרים שרוצים. ככה רואים מה המחיר לפני המבצע ומה ההנחה האמיתית.</li>
      <li>אוספים קופונים ממרכז הקופונים של עליאקספרס כשהם נפתחים, ומטבעות באפליקציה.</li>
      <li>בפתיחת המבצע חוזרים לעמוד הזה, בוחרים קוד לפי סכום העגלה ב<a href="/#calc">מחשבון</a> ומשלמים מהר, לפני שהמכסה נגמרת.</li>
    </ol>
    <p>עוד: <a href="/guides/aliexpress-sales-calendar/">לוח המבצעים השנתי</a> · <a href="/guides/stacking-aliexpress-discounts/">איך משלבים הנחות</a> · <a href="/guides/how-to-use-aliexpress-coupon/">איך מפעילים קוד</a></p>
  </div>
  ${faqItems.length ? `<h2 class="section-title">שאלות נפוצות על ${esc(short)}</h2><div class="faq">${faqItems.map((f) => `<details><summary><h3>${esc(f.q)}</h3></summary><p>${esc(f.a)}</p></details>`).join('')}</div>` : ''}
</div></section>`;
  return layout({
    title: ownLive.length ? `קוד קופון עליאקספרס ${short} ${year}: עד $${Math.max(...ownLive.map((c) => c.discount))} הנחה לישראל | ${site.name}` : `קוד קופון עליאקספרס ${le(short)} ${year} | ${site.name}`,
    description: ownLive.length
      ? `כל קודי ההנחה של עליאקספרס ${le(short)} לקונים מישראל, מ-$${Math.min(...ownLive.map((c) => c.discount))} ועד $${Math.max(...ownLive.map((c) => c.discount))} לפי סכום העגלה.${ownLive.some((c) => c.expires) ? ` בתוקף עד ${heShort(ownLive.map((c) => c.expires).filter(Boolean).sort().pop())}.` : ''} בוחרים קוד ומעתיקים בקליק.`
      : `קודי הקופון של עליאקספרס ${le(short)} ${year} לקונים מישראל, לפי מדרגות, מתי המבצע מתחיל ואיך מתכוננים כדי לחסוך יותר.`,
    pathname, body, ld: faqItems.length ? [bc.ld, faqLd(faqItems)] : [bc.ld],
  });
}

const FINDER_API = (site.cheapest?.apiUrl || '').replace(/\/$/, '');

function finderPage() {
  const pathname = '/finder/';
  const bc = breadcrumbs([{ name: 'צייד הדילים', url: pathname }]);
  const items = [
    { q: 'איך צייד הדילים עובד?', a: 'מדביקים קישור למוצר מעליאקספרס. הצייד מזהה את המוצר, סורק מוכרים אחרים שמוכרים אותו עם משלוח לישראל, מסנן מוכרים עם דירוג נמוך או בלי מכירות, ומציג את ההצעות הזולות עם דירוג המוכר וכמות המכירות.' },
    { q: 'איך מעתיקים קישור מהאפליקציה של עליאקספרס?', a: 'בעמוד המוצר באפליקציה לוחצים על כפתור השיתוף ובוחרים "העתקת קישור". אחר כך מדביקים כאן בשדה.' },
    { q: 'זה בטוח אותו מוצר?', a: 'הצייד משווה לפי שם המוצר והקטגוריה ומסנן מוכרים עם דירוג נמוך, אבל לפני שקונים חשוב לבדוק בעמוד המוצר שזה בדיוק מה שאתם רוצים: צבע, גרסה, מידה ומפרט.' },
    { q: 'זה עולה משהו?', a: 'לא. השימוש חינם. הקישורים הם קישורי שותפים, ואנחנו עשויים לקבל עמלה מעליאקספרס בלי תוספת למחיר שלכם.' },
  ];
  const body = `
<section class="hero hero-hunter"><div class="wrap narrow">${bc.html}
  <div class="hunter-head"><div><h1>🎯 צייד הדילים</h1>
  <p class="hunter-tag">אתם שולחים קישור. הצייד יוצא לחפש לכם דיל.</p>
  <p class="lead">מדביקים קישור למוצר מעליאקספרס, והצייד מחפש <strong>את אותו מוצר אצל מוכרים זולים יותר</strong>, עם משלוח לישראל. אתם משווים ובוחרים.</p></div>
  <div class="ft-visual"><div class="radar" aria-hidden="true">
    <div class="radar-sweep"></div>
    <span class="blip b1"><i>₪89</i></span><span class="blip b2"><i>₪74</i></span><span class="blip b4"><i>₪95</i></span><span class="blip b3 best"><i>₪61 🎯</i></span>
    <div class="radar-core">🎯</div>
  </div></div></div>
  <form class="finder" id="finder-form" data-api="${esc(FINDER_API)}" autocomplete="off">
    <label for="finder-url" class="calc-label">הקישור למוצר</label>
    <div class="finder-row">
      <input id="finder-url" name="url" type="text" inputmode="url" dir="ltr" placeholder="https://he.aliexpress.com/item/..." required>
      <button class="btn btn-primary" type="submit" id="finder-go"${FINDER_API ? '' : ' disabled'}>🎯 שלחו את הצייד</button>
    </div>
    <p class="muted finder-help">באפליקציה: עמוד המוצר ← שיתוף ← העתקת קישור. עובד גם עם קישורים מקוצרים.</p>
    ${FINDER_API ? '' : `<div class="soon-inline"><b>🎯 הצייד יוצא לדרך ממש בקרוב</b><span>אנחנו בשלבי כיול אחרונים. רוצים לדעת ראשונים כשהוא עולה?</span>${tgBtn('הצטרפו לטלגרם')}<a href="/">בינתיים: כל קודי הקופון ←</a></div>`}
  </form>
</div></section>
<section class="section"><div class="wrap narrow">
  <div id="finder-out" aria-live="polite"></div>
  <div class="prose">
    <h2>למה אותו מוצר עולה אחרת?</h2>
    <p>בעליאקספרס הרבה מוכרים מוכרים את אותו מוצר בדיוק, מאותו מפעל, במחירים שונים. ההבדל יכול להגיע לעשרות אחוזים. צייד הדילים יעשה את החיפוש וההשוואה בשבילכם. ההתאמה נעשית לפי שם המוצר והקטגוריה, אז לפני שקונים כדאי להציץ בתמונות ובמפרט ולוודא שזה בדיוק מה שרציתם.</p>
    <h2>ואחרי שמצאתם: עוד הנחה</h2>
    <p>על המחיר הזול אפשר להוסיף <a href="/#calc">קוד קופון לפי סכום העגלה</a>, קופון של החנות וקופונים ממרכז הקופונים. ראו <a href="/guides/stacking-aliexpress-discounts/">איך משלבים הנחות</a>.</p>
  </div>
  <h2 class="section-title">שאלות נפוצות</h2>
  <div class="faq">${items.map((f) => `<details><summary><h3>${esc(f.q)}</h3></summary><p>${esc(f.a)}</p></details>`).join('')}</div>
</div></section>`;
  return layout({
    title: `צייד הדילים${FINDER_API ? '' : ' (בקרוב)'}: אותו מוצר בעליאקספרס אצל מוכר זול יותר | ${site.name}`,
    description: `צייד הדילים${FINDER_API ? '' : ' (בקרוב)'}: מדביקים קישור למוצר מעליאקספרס, והצייד מחפש הצעות זולות יותר לאותו מוצר אצל מוכרים אחרים, עם משלוח לישראל. חינם, בלי הרשמה.`,
    pathname, body, ld: [bc.ld, faqLd(items)], noindex: !FINDER_API,
  });
}

function categoryHubPage() {
  const pathname = '/coupon/';
  const bc = breadcrumbs([{ name: 'קופונים לפי קטגוריה', url: pathname }]);
  const body = `
<section class="hero hero-sm"><div class="wrap">${bc.html}
  <h1>קופונים לעליאקספרס לפי קטגוריה</h1>
  <p class="lead">קודי המבצע של עליאקספרס עובדים על רוב האתר. בחרו קטגוריה וקבלו את הקודים יחד עם טיפים לקנייה חכמה בתחום.</p>
</div></section>
<section class="section"><div class="wrap">
  <div class="cat-grid">${categories.map((c) => catCard(c, `קופון עליאקספרס ל${c.short}`)).join('')}</div>
  <p class="muted"><a href="/">לכל קודי הקופון ←</a></p>
</div></section>`;
  return layout({
    title: `קופונים לעליאקספרס לפי קטגוריה ${monthYear} | ${site.name}`,
    description: 'קופונים לעלי אקספרס לפי קטגוריה: בגדים, נעליים, טלפונים, אוזניות, בית, ילדים ועוד. קודי מבצע לישראל + טיפים לקנייה חכמה.',
    pathname, body, ld: [bc.ld],
  });
}

function categoryPage(cat) {
  const pathname = `/coupon/${cat.slug}/`;
  const bc = breadcrumbs([{ name: 'קופונים לפי קטגוריה', url: '/coupon/' }, { name: cat.name, url: pathname }]);
  const top = featuredCoupons.length ? featuredCoupons : coupons.slice(0, 3);
  const faqItems = cat.faq.map(([q, a]) => ({ q, a }));
  const related = categories.filter((c) => c.slug !== cat.slug).slice(0, 6);
  const body = `
<section class="hero hero-sm hero-cat" style="${catStyle(cat.slug)}"><div class="wrap narrow"><i class="hero-cat-emoji" aria-hidden="true">${cat.emoji}</i>${bc.html}
  <h1>קופון עליאקספרס ל${esc(cat.name)}</h1>
  <p class="lead">קופונים לעלי אקספרס ל${esc(cat.name)}, ${esc(monthYear)}${realCodes.length ? ` · עד <strong>$${maxDiscount}</strong> הנחה` : ''}</p>
</div></section>
<section class="section"><div class="wrap narrow">
  <div class="prose"><p>${esc(cat.intro)}</p></div>
  ${!realCodes.length ? nextCodesBox() : ''}
  ${top.length ? `<h2 class="section-title">הקודים המומלצים עכשיו</h2>
  ${manual.listNote ? `<p class="list-note">${esc(manual.listNote)}</p>` : ''}
  <div class="coupon-list">${top.map((c) => couponCard(c, { compact: true })).join('')}</div>` : ''}
  ${coupons.length ? `<h2 class="section-title">איזה קוד מתאים לעגלה שלי?</h2>${tierTable(coupons)}
  <p class="muted">לא בטוחים? <a href="/#calc">מחשבון העגלה</a> בוחר את הקוד הכי משתלם לסכום שלכם.</p>` : ''}
  <div class="prose">
    <h2>איך קונים ${esc(cat.buy || cat.name)} בעליאקספרס: ${cat.tips.length} טיפים</h2>
    <ol>${cat.tips.map(([h, t]) => `<li><b>${esc(h)}.</b> ${esc(t)}</li>`).join('')}</ol>
    <h2>איך חוסכים עוד</h2>
    <p>מעבר לקוד המבצע, אפשר לשלב קופון של החנות מעמוד המוצר, קופונים ממרכז הקופונים ומטבעות. ראו <a href="/guides/stacking-aliexpress-discounts/">איך משלבים הנחות</a>, ומי שקונה בפעם הראשונה: <a href="/new-user/">קופון למשתמש חדש</a>.</p>
  </div>
  <h2 class="section-title">שאלות נפוצות: ${esc(cat.name)} בעליאקספרס</h2>
  <div class="faq">${faqItems.map((f) => `<details><summary><h3>${esc(f.q)}</h3></summary><p>${esc(f.a)}</p></details>`).join('')}</div>
  <h2 class="section-title">קופונים לקטגוריות נוספות</h2>
  <div class="cat-grid">${related.map((c) => catCard(c, `קופון עליאקספרס ל${c.short}`)).join('')}</div>
</div></section>`;
  return layout({
    title: `קופון עליאקספרס ל${cat.short} ${monthYear}: קודים וטיפים | ${site.name}`,
    description: `קופונים לעלי אקספרס ל${cat.name}: קודי המבצע הפעילים לישראל לפי סכום העגלה, וטיפים לקנייה חכמה בקטגוריית ${cat.name} בעליאקספרס.`,
    pathname, body, ld: [bc.ld, faqLd(faqItems)],
  });
}

function newUserPage() {
  const pathname = '/new-user/';
  const bc = breadcrumbs([{ name: 'קופון למשתמש חדש', url: pathname }]);
  const nu = deals.find((d) => d.id === 'new-user');
  const firstTier = coupons.filter((c) => c.code && !c.sample).sort((a, b) => a.minOrder - b.minOrder)[0];
  const items = [
    { q: 'מה מקבלים כמשתמש חדש בעליאקספרס?', a: 'עליאקספרס נותנת למצטרפים חדשים הטבות שמשתנות מעת לעת, למשל קופון להזמנה ראשונה או מוצרים במחיר מוזל. ההטבה המדויקת מופיעה באתר אחרי ההרשמה.' },
    { q: 'אפשר לשלב את הטבת ההצטרפות עם קוד קופון?', a: 'בדרך כלל אפשר להשתמש בקוד מבצע אחד בכל הזמנה, ולשלב אותו עם קופונים שנאספים לחשבון. אם ההטבה היא קופון שנאסף לחשבון, לרוב אפשר להוסיף עליו קוד מבצע מהרשימה שלנו.' },
    { q: 'מי נחשב משתמש חדש?', a: 'מי שעדיין לא ביצע הזמנה בעליאקספרס. פתיחת חשבון נוסף לאותו אדם עלולה להפר את התנאים של עליאקספרס, ולכן לא כדאי.' },
  ];
  const body = `
<section class="hero hero-sm"><div class="wrap narrow">${bc.html}
  <h1>קופון עליאקספרס למשתמש חדש</h1>
  <p class="lead">מצטרפים לעליאקספרס בפעם הראשונה? כך מוציאים את המקסימום מההזמנה הראשונה.</p>
  <a class="btn btn-primary" href="/go/${nu ? nu.id : 'home'}/" ${OUT} data-go="${nu ? nu.id : 'home'}">להטבות ההצטרפות בעליאקספרס ${ICON.arrow}</a>
</div></section>
<section class="section"><div class="wrap narrow">
  <div class="prose">
    <h2>3 צעדים להזמנה הראשונה</h2>
    <ol>
      <li><b>נרשמים</b> דרך הכפתור למעלה ובודקים אילו הטבות הצטרפות פעילות כרגע.</li>
      <li><b>ממלאים את העגלה</b> ובוחרים <a href="/#tiers">קוד מבצע לפי סכום העגלה</a>.</li>
      <li><b>מדביקים את הקוד בתשלום</b> ובודקים שההנחה ירדה לפני שמשלמים.</li>
    </ol>
  </div>
  <div class="prose">
    <h2>מה זה בעצם "הטבת משתמש חדש"?</h2>
    <p>עליאקספרס מנסה לשכנע קונים חדשים לבצע הזמנה ראשונה, ולכן מציגה להם הטבות שלא מופיעות לקונים קיימים: לרוב מוצרים נבחרים במחיר מוזל מאוד (לפעמים מסומנים כ"Welcome Deal"), וקופונים שנאספים לחשבון אחרי ההרשמה. ההטבה משתנה מתקופה לתקופה, ולכן כדאי לבדוק מה מוצג לכם בפועל אחרי ההרשמה ולא לסמוך על סכום שראיתם פעם.</p>
    <h2>איך יודעים אם אני נחשב משתמש חדש?</h2>
    <p>מי שעדיין לא השלים הזמנה בחשבון עליאקספרס נחשב בדרך כלל משתמש חדש. אם כבר הזמנתם פעם, גם מחשבון ישן, סביר שההטבות לא יוצגו לכם, ואז הדף הנכון בשבילכם הוא <a href="/existing-user/">קוד קופון למשתמש קיים</a>. פתיחת חשבון נוסף לאותו אדם כדי לקבל שוב את ההטבה עלולה להפר את התנאים של עליאקספרס, ולכן לא ממליצים על זה.</p>
    <h2>אפליקציה או מחשב?</h2>
    <p>חלק מהטבות ההצטרפות מוצגות רק באפליקציה, וחלקן גם באתר. אם לא רואים הטבה במחשב, שווה להיכנס לאותו חשבון באפליקציה ולבדוק שם לפני שמשלמים. קוד מבצע מהרשימה שלנו עובד גם באפליקציה וגם באתר, בשדה "קוד מבצע" במסך התשלום.</p>
    <h2>איך מוסיפים קוד הנחה על ההזמנה הראשונה</h2>
    <ol>
      <li>אוספים את קופוני ההצטרפות לחשבון, אם מוצעים לכם.</li>
      <li>ממלאים עגלה ובודקים את הסכום בדולרים (לפני משלוח).</li>
      <li>בוחרים את הקוד שמתאים לסכום ב<a href="/#calc">מחשבון</a> ומדביקים אותו בתשלום.</li>
      <li>בודקים בסיכום ההזמנה שכל ההנחות ירדו, ורק אז משלמים.</li>
    </ol>
    <p>מי שמזמין בפעם הראשונה ורוצה להבין גם משלוחים, תשלום ומע"מ: <a href="/guides/first-time-aliexpress/">המדריך לקנייה ראשונה בעליאקספרס</a>.</p>
  </div>
  ${firstTier ? `<h2 class="section-title">קוד שאפשר להוסיף כבר בהזמנה הראשונה</h2><div class="coupon-list">${couponCard(firstTier, { compact: true })}</div><p><a href="/">לכל קודי הקופון ←</a></p>` : ''}
  <h2 class="section-title">שאלות על הזמנה ראשונה</h2>
  <div class="faq">${items.map((f) => `<details><summary><h3>${esc(f.q)}</h3></summary><p>${esc(f.a)}</p></details>`).join('')}</div>
</div></section>`;
  return layout({
    title: `קופון עליאקספרס למשתמש חדש והזמנה ראשונה – ${monthYear} | ${site.name}`,
    description: 'נרשמים לעליאקספרס בפעם הראשונה? כך מקבלים את הטבת ההצטרפות ומוסיפים עליה קוד הנחה לישראל. כל השלבים להזמנה הראשונה, בעברית.',
    pathname, body, ld: [bc.ld, faqLd(items)],
  });
}

function existingUserPage() {
  const pathname = '/existing-user/';
  const bc = breadcrumbs([{ name: 'קוד קופון למשתמש קיים', url: pathname }]);
  const top = [...realCodes].sort((a, b) => b.discount - a.discount).slice(0, 3).sort((a, b) => a.minOrder - b.minOrder);
  const items = [
    { q: 'יש קוד קופון לעליאקספרס למשתמש קיים?', a: 'כן. קודי המבצע שברשימה שלנו מיועדים לקונים מישראל ובדרך כלל עובדים גם בחשבונות קיימים, לא רק בחשבונות חדשים. כל קוד תקף בדרך כלל פעם אחת לחשבון, ומעבר לו יש קופוני חנות, מרכז הקופונים ומטבעות.' },
    { q: 'למה הקוד לא עובד בחשבון שלי?', a: 'הסיבות הנפוצות: העגלה מתחת לסכום המינימום אחרי הנחות החנות, הקוד כבר נוצל בחשבון, המכסה שלו נגמרה, או שהמוצרים לא משתתפים במבצע. נסו קוד ממדרגה אחרת.' },
    { q: 'מה ההבדל בין קוד למשתמש חדש לקוד למשתמש קיים?', a: 'הטבות הצטרפות מיועדות רק למי שעוד לא הזמין, וקודי המבצע הכלליים מיועדים לכל הקונים. מי שכבר הזמין בעבר משתמש בקודי המבצע, בקופוני החנות ובמרכז הקופונים.' },
    { q: 'מתי יוצאים הקודים הכי גדולים למשתמשים קיימים?', a: 'במבצעים הגדולים: יום ההולדת של עליאקספרס בסוף מרץ, 11.11 בנובמבר ובלאק פריידי. בערוץ הטלגרם שלנו מודיעים כשיוצאת סדרת קודים חדשה.' },
  ];
  const body = `
<section class="hero hero-sm"><div class="wrap narrow">${bc.html}
  <h1>קוד קופון עליאקספרס למשתמש קיים</h1>
  <p class="lead">כבר הזמנתם בעלי אקספרס בעבר? גם לכם יש קודים. הנה הקודים הפעילים עכשיו, שבדרך כלל עובדים גם בחשבונות קיימים, ועוד 4 דרכים לשלם פחות.</p>
  <a class="btn btn-primary" href="/#codes">לכל הקודים הפעילים ↓</a>
</div></section>
<section class="section"><div class="wrap narrow">
  ${top.length ? `<h2 class="section-title">הקודים הכי משתלמים עכשיו</h2><div class="coupon-list">${top.map((c) => couponCard(c, { compact: true })).join('')}</div>` : ''}
  ${coupons.length ? `<h2 class="section-title">כל המדרגות: איזה קוד מתאים לעגלה שלכם</h2>
  ${tierTable(coupons)}` : nextCodesBox()}
  <div class="prose">
    <h2>4 דרכים נוספות לחסוך כמשתמש קיים</h2>
    <ol>
      <li><b>קופוני חנות:</b> בעמוד המוצר אוספים את קופון החנות, ומוסיפים עליו קוד מבצע בתשלום.</li>
      <li><b>מרכז הקופונים:</b> קופונים שנאספים לחשבון ומצטברים עם הקוד. <a href="/go/coupon-center/" ${OUT} data-go="coupon-center">למרכז הקופונים</a>.</li>
      <li><b>מטבעות:</b> צ'ק־אין יומי באפליקציה נותן עוד הנחה קטנה. ראו <a href="/guides/aliexpress-coins/">המדריך למטבעות</a>.</li>
      <li><b>תזמון:</b> בימי מבצע הקודים גדולים יותר. ראו את <a href="/guides/aliexpress-sales-calendar/">לוח המבצעים</a>.</li>
    </ol>
    <p>איך משלבים הכול באותה הזמנה: <a href="/guides/stacking-aliexpress-discounts/">המדריך לשילוב הנחות</a>. קונים בפעם הראשונה? <a href="/new-user/">קופון למשתמש חדש</a>.</p>
  </div>
  <h2 class="section-title">שאלות נפוצות</h2>
  <div class="faq">${items.map((f) => `<details><summary><h3>${esc(f.q)}</h3></summary><p>${esc(f.a)}</p></details>`).join('')}</div>
</div></section>`;
  return layout({
    title: `קוד קופון עליאקספרס למשתמש קיים ${monthYear} | ${site.name}`,
    description: `קודי קופון לעלי אקספרס שעובדים גם בחשבון קיים${realCodes.length ? `, עד $${maxDiscount} הנחה לפי סכום ההזמנה` : ''}, ועוד דרכים לחסוך למי שכבר הזמין. עודכן ב-${updatedHe}.`,
    pathname, body, ld: [bc.ld, faqLd(items)],
  });
}

function guidesIndexPage() {
  const pathname = '/guides/';
  const bc = breadcrumbs([{ name: 'מדריכים', url: pathname }]);
  const body = `
<section class="hero hero-sm"><div class="wrap">${bc.html}<h1>מדריכים לקנייה חכמה בעליאקספרס</h1><p class="lead">מה שכדאי לדעת כדי לשלם פחות.</p></div></section>
<section class="section"><div class="wrap"><div class="guide-grid">${guides.map((g) => `<a class="guide-card" href="/guides/${g.slug}/"><h2>${esc(g.title)}</h2><p>${esc(g.description)}</p><span>לקריאה ←</span></a>`).join('')}</div></div></section>`;
  return layout({ title: `מדריכים לעליאקספרס בעברית | ${site.name}`, description: 'מדריכים בעברית לקנייה בעליאקספרס: שימוש בקודי קופון, שילוב הנחות, מכס ומע"מ, Choice ולוח המבצעים.', pathname, body, ld: [bc.ld] });
}

function guideFaq(body) {
  const i = body.indexOf('<h2>שאלות נפוצות</h2>');
  if (i < 0) return [];
  const strip = (t) => t.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  return [...body.slice(i).matchAll(/<h3>([\s\S]*?)<\/h3>\s*<p>([\s\S]*?)<\/p>/g)].map((m) => ({ q: strip(m[1]), a: strip(m[2]) }));
}

function guidePage(g) {
  const pathname = `/guides/${g.slug}/`;
  const bc = breadcrumbs([{ name: 'מדריכים', url: '/guides/' }, { name: g.short || g.title, url: pathname }]);
  const top = featuredCoupons.slice(0, 2);
  const idx = guides.findIndex((x) => x.slug === g.slug);
  const others = [1, 2, 3, 4].map((k) => guides[(idx + k) % guides.length]).filter((x) => x.slug !== g.slug);
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
    publisher: { '@type': 'Organization', name: site.name, logo: { '@type': 'ImageObject', url: abs('/assets/icon-512.png') } },
    image: abs('/assets/og-v2.jpg'), mainEntityOfPage: abs(pathname),
  }];
  const gfaq = guideFaq(g.body);
  if (gfaq.length) ld.push(faqLd(gfaq));
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
  return `<!DOCTYPE html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="robots" content="noindex,nofollow">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>מעבר לעליאקספרס…</title>
<meta http-equiv="refresh" content="0;url=${esc(t)}">
<style>body{font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;background:#fffaf7;color:#1b1b24;text-align:center;padding:16px}a{color:#c20c33}</style>
<script>location.replace(${scriptJSON(t)});</script></head>
<body><p>מעבירים אתכם לעליאקספרס…<br><a href="${esc(t)}" rel="nofollow sponsored">לחצו כאן אם המעבר לא קרה</a></p></body></html>`;
}

// Outbound targets (id → affiliate URL). Used by /go/<id>/ pages and embedded in each page so clicks
// navigate straight to AliExpress (one hop fewer = the phone opens the AliExpress app more reliably).
const goTargets = new Map([
  ['home', safeLink(links[site.affiliate.homeUrl], '') || DEFAULT_LINK],
  ['coupon-center', safeLink(links[site.affiliate.couponCenterUrl], '') || DEFAULT_LINK],
]);
for (const c of [...coupons, ...expired]) goTargets.set(c.id, resolveLink(c));
for (const c of community) goTargets.set(c.id, DEFAULT_LINK);
for (const d of deals) goTargets.set(d.id, d.id === 'coupon-center' && !safeLink(d.link) ? goTargets.get('coupon-center') : resolveLink(d));

/* ------------------------------------------------------------------ */
/* Build                                                               */
/* ------------------------------------------------------------------ */
await fs.rm(DIST, { recursive: true, force: true });
await fs.mkdir(DIST, { recursive: true });
await fs.cp(path.join(ROOT, 'src/assets'), path.join(DIST, 'assets'), { recursive: true });
// Files served from the site root as-is (search-engine verification files etc.).
await fs.cp(path.join(ROOT, 'src/root'), DIST, { recursive: true }).catch(() => {});

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
<p><b>${esc(site.name)}</b> הוא אתר עצמאי שמרכז את קודי הקופון של עליאקספרס לקונים מישראל, במקום אחד ובעברית.</p>
<p>הקודים נאספים ממקורות פומביים ומתוכנית השותפים של עליאקספרס, ונבדקים מול יותר ממקור אחד לפני שהם עולים לאתר. קודים שפג תוקפם יורדים מהרשימה אוטומטית, והכל מסודר לפי סכום ההזמנה כדי שיהיה קל למצוא את הקוד המתאים. קודים שקונים פרסמו בפורומים מוצגים בנפרד ומסומנים "לא נבדק".</p>
<p>יש לכם קוד שעבד ולא מופיע כאן, או קוד שלא עובד? כתבו לנו: <a href="mailto:${esc(site.contactEmail)}">${esc(site.contactEmail)}</a></p>`, `מה זה ${site.name}, מאיפה מגיעים קודי הקופון לעליאקספרס שמופיעים באתר, ואיך פונים אלינו עם קוד חדש או קוד שלא עובד.`));
await page('/disclosure/', staticPage('/disclosure/', 'גילוי נאות', `
<p>${esc(site.name)} משתתף בתוכנית השותפים של עליאקספרס (AliExpress Portals). חלק מהקישורים באתר הם קישורי שותפים: כשלוחצים עליהם וקונים, אנחנו עשויים לקבל עמלה מעליאקספרס.</p>
<p>העמלה לא מייקרת את המחיר שלכם, ולא משפיעה על סדר הקודים. הם מסודרים לפי סכום ההזמנה.</p>
<p>האתר אינו קשור, מאושר או מופעל ע"י AliExpress או Alibaba Group. כל הסימנים המסחריים שייכים לבעליהם.</p>
<p>התנאים של כל קוד נקבעים ע"י עליאקספרס, ואנחנו לא יכולים להבטיח שקוד מסוים יעבוד בכל הזמנה.</p>`, 'גילוי נאות: איך האתר מרוויח מקישורי השותפים של עליאקספרס, ולמה זה לא משנה את המחיר שלכם ולא את סדר הקודים.'));
await page('/privacy/', staticPage('/privacy/', 'מדיניות פרטיות', `
<p>האתר לא דורש הרשמה ולא אוסף פרטים מזהים.</p>
${site.analytics?.cfBeacon ? '<p>אנחנו משתמשים ב-Cloudflare Web Analytics כדי לספור ביקורים באופן אנונימי, בלי עוגיות ובלי מעקב אחרי משתמשים.</p>' : ''}
${site.analytics?.ga4Id ? '<p>אנחנו משתמשים ב-Google Analytics כדי להבין באופן אנונימי איך משתמשים באתר.</p>' : ''}
<p>כשעוברים מהאתר לעליאקספרס, עליאקספרס עשויה לשמור עוגייה כדי לשייך את הרכישה לתוכנית השותפים. המדיניות של עליאקספרס חלה באתר שלה.</p>
<p>לשאלות: <a href="mailto:${esc(site.contactEmail)}">${esc(site.contactEmail)}</a></p>`, 'מדיניות הפרטיות של האתר: אילו נתונים נאספים (בלי הרשמה ובלי פרטים מזהים), ומה קורה כשעוברים לעליאקספרס.'));

for (const [id, target] of goTargets) await write(`go/${id}/index.html`, goPage(target));

await page('/new-user/', newUserPage(), { lastmod: dataUpdated });
await page('/existing-user/', existingUserPage(), { lastmod: dataUpdated });
await page('/coupon/', categoryHubPage(), { lastmod: dataUpdated });
await page('/finder/', finderPage(), { lastmod: dataUpdated, index: !!FINDER_API });
for (const c of categories) await page(`/coupon/${c.slug}/`, categoryPage(c), { lastmod: dataUpdated });

// Atom feed of active codes: lets Telegram/WhatsApp bots and feed readers pick up new codes automatically.
await write('feed.xml', `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="he">
  <title>${esc(site.name)}: קודי קופון לעליאקספרס</title>
  <link href="${abs('/')}"/><link rel="self" href="${abs('/feed.xml')}"/>
  <id>${abs('/')}</id><updated>${dataUpdated}T00:00:00Z</updated>
${(SAMPLE_MODE ? [] : realCodes).map((c) => `  <entry><title>${esc(`${couponTitle(c)}: ${c.code}`)}</title><link href="${abs(`/#c-${c.id}`)}"/><id>${abs(`/#c-${c.id}-${c.code}`)}</id><updated>${(c.verified || dataUpdated)}T00:00:00Z</updated><summary>${esc(`קוד ${c.code}: ${couponTitle(c)}${c.expires ? `, בתוקף עד ${heDate(c.expires)}` : ''}`)}</summary></entry>`).join('\n')}
</feed>
`);
await write('site.webmanifest', JSON.stringify({
  name: `${site.name} | קודי קופון לעליאקספרס`, short_name: site.name, lang: 'he', dir: 'rtl', start_url: '/', display: 'standalone',
  background_color: '#fffaf7', theme_color: '#e5122f',
  icons: [{ src: '/assets/icon-192.png', sizes: '192x192', type: 'image/png' }, { src: '/assets/icon-512.png', sizes: '512x512', type: 'image/png' }],
  share_target: { action: '/finder/', method: 'GET', params: { title: 'title', text: 'text', url: 'url' } },
}));

// Product share page + admin link maker (appended to build.mjs).
const PRODUCT_API = site.cheapest?.apiUrl || 'https://yeshdeal-api.joni0000.workers.dev';
await write('p/index.html', layout({
  title: `דיל מעליאקספרס | ${site.name}`, description: 'מוצר שנבחר בשבילכם, במחיר העדכני מעליאקספרס.', pathname: '/p/', noindex: true,
  share: { title: 'שלחו לך דיל מעליאקספרס 🎯', description: 'מוצר שנבחר בשבילך ביש דיל!, עם המחיר העדכני וקוד קופון לפי סכום ההזמנה.', image: '/assets/og-share.jpg' },
  body: `<section class="section pp"><div class="wrap narrow"><div id="pp" class="pp-card pp-loading" aria-live="polite"><div class="pp-img sk"></div><div class="pp-body"><div class="sk sk-line"></div><div class="sk sk-line short"></div><div class="sk sk-btn"></div></div></div>
<div class="pp-more"><p>לפני התשלום: בחרו <a href="/#calc">קוד קופון לפי סכום העגלה</a> וחסכו עוד.</p>${tgBtn('דילים כאלה כל יום בטלגרם')}</div></div></section>
<script>(function(){var box=document.getElementById('pp');var id=(new URLSearchParams(location.search).get('i')||'').replace(/\\D/g,'');
function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
function fail(){box.className='pp-card';box.innerHTML='<div class="pp-body"><h1>הדיל הזה כבר לא זמין</h1><p>אבל יש לנו קודי קופון פעילים לעליאקספרס.</p><a class="btn btn-primary" href="/">לקודי הקופון</a></div>'}
if(!/^\\d{6,20}$/.test(id))return fail();
fetch(${JSON.stringify(PRODUCT_API)}+'/api/products?ids='+id).then(function(r){return r.json()}).then(function(j){var p=j.items&&j.items[0];if(!p||!/^https:\\/\\/s\\.click\\.aliexpress\\.com\\//.test(p.link||''))return fail();
var ils=function(n){return '₪'+(Math.round(n*100)/100).toLocaleString('he-IL')};var off=p.originalPrice>p.price?Math.round((1-p.price/p.originalPrice)*100):0;
box.className='pp-card';box.innerHTML='<a class="pp-img" href="'+esc(p.link)+'" rel="nofollow sponsored noopener"><img src="'+esc(p.image)+'" alt="" width="480" height="480" referrerpolicy="no-referrer"></a><div class="pp-body"><span class="pp-kicker">🎯 נבחר בשבילכם ביש דיל!</span><h1>'+esc(p.title)+'</h1><p class="pp-price"><b>'+ils(p.price)+'</b>'+(off>=5?'<s>'+ils(p.originalPrice)+'</s><span class="pp-off">-'+off+'%</span>':'')+'</p><p class="pp-meta">'+(p.rating?p.rating+'% ביקורות חיוביות':'')+(p.sold?' · '+Number(p.sold).toLocaleString('he-IL')+' נמכרו':'')+'</p><a class="btn btn-primary btn-block pp-buy" href="'+esc(p.link)+'" rel="nofollow sponsored noopener">לקנייה בעליאקספרס ←</a><p class="pp-note">המחיר נבדק עכשיו מול עליאקספרס. משלוח ומע״מ מוצגים בקופה, והמחיר עשוי להשתנות.</p></div>';
document.title=p.title.slice(0,60)+' | ${site.name}';}).catch(fail)})();</script>`,
}));

await write('admin/link/index.html', layout({
  title: `יצירת קישור דיל | ${site.name}`, description: 'כלי פנימי', pathname: '/admin/link/', noindex: true,
  body: `<section class="section"><div class="wrap narrow"><h1>יצירת קישור דיל</h1><p class="muted">מדביקים קישור של מוצר מעליאקספרס (גם מקוצר מהאפליקציה). מקבלים קישור של יש דיל לשליחה, שמוביל דרך קישור השותפים.</p>
<div class="adm"><input id="adm-in" type="url" inputmode="url" placeholder="https://he.aliexpress.com/item/....html" dir="ltr"><button class="btn btn-primary" id="adm-go" type="button">צור קישור</button></div><div id="adm-out" aria-live="polite"></div></div></section>
<script>(function(){var inp=document.getElementById('adm-in'),out=document.getElementById('adm-out');
function show(id){var u=location.origin+'/p/?i='+id;out.innerHTML='<div class="adm-res"><input readonly dir="ltr" value="'+u+'"><div class="adm-btns"><button class="btn btn-primary" id="adm-copy" type="button">העתק</button><a class="btn btn-ghost" target="_blank" href="https://wa.me/?text='+encodeURIComponent('תראה מה מצאתי בעליאקספרס 👇 '+u)+'">שלח בוואטסאפ</a><a class="btn btn-ghost" target="_blank" href="'+u+'">תצוגה</a></div></div>';
document.getElementById('adm-copy').onclick=function(){navigator.clipboard.writeText(u).then(function(){document.getElementById('adm-copy').textContent='הועתק ✓'})}}
document.getElementById('adm-go').onclick=function(){var t=inp.value||'';var m=t.match(/\\/item\\/(\\d{6,20})\\.html/)||t.match(/productId=(\\d{6,20})/);if(m)return show(m[1]);
if(!/https?:\\/\\/(s\\.click|a)\\.aliexpress\\.com\\//.test(t)){out.innerHTML='<p class="muted">זה לא נראה כמו קישור למוצר בעליאקספרס.</p>';return}
out.innerHTML='<p class="muted">פותח קישור מקוצר…</p>';fetch(${JSON.stringify(PRODUCT_API)}+'/api/cheapest?url='+encodeURIComponent(t.trim())).then(function(r){return r.json()}).then(function(j){j.original&&j.original.id?show(j.original.id):out.innerHTML='<p class="muted">לא הצלחנו לזהות את המוצר. נסו את הקישור המלא מהדפדפן.</p>'}).catch(function(){out.innerHTML='<p class="muted">שגיאת רשת. נסו שוב.</p>'})}})();</script>`,
}));

await write('404.html', layout({
  title: `הדף לא נמצא | ${site.name}`, description: 'הדף לא נמצא', pathname: '/404.html', noindex: true,
  body: `<section class="hero"><div class="wrap narrow"><h1>הדף לא נמצא</h1><p class="lead">אבל הקודים כאן.</p><a class="btn btn-primary" href="/">לכל קודי הקופון</a></div></section>`,
}));
await write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${(SAMPLE_MODE ? [] : sitemap).map(([p, lm]) => `  <url><loc>${abs(p)}</loc>${lm ? `<lastmod>${lm}</lastmod>` : ''}</url>`).join('\n')}\n</urlset>\n`);
await write('robots.txt', SAMPLE_MODE ? 'User-agent: *\nDisallow: /\n' : `User-agent: *\nAllow: /\nDisallow: /go/\nDisallow: /telegram-state.json\nDisallow: /tg-queue/\nDisallow: /admin/\nDisallow: /p/\n\nSitemap: ${abs('/sitemap.xml')}\n`);
await write('.nojekyll', '');
if (gen.telegram?.posted) await write('telegram-state.json', JSON.stringify(gen.telegram));
if (site.indexNowKey) await write(`${site.indexNowKey}.txt`, site.indexNowKey);

console.log(`✓ built ${sitemap.length} indexable pages + ${goTargets.size} redirects → dist/  (${realCodes.length} real codes, ${coupons.length - realCodes.length} sample, ${community.length} community, ${allProducts().length} products)${SAMPLE_MODE ? '  [PREVIEW – noindex]' : ''}`);
