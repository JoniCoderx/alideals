// Static site generator for יש דיל. Zero dependencies.
// Reads config/site.json + data/coupons.json + data/generated.json → writes dist/
//
// BUILD_STRICT=1 (set in CI) refuses to build while the site still has sample codes or a placeholder
// affiliate link, so placeholder data can never go live.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { faq } from '../src/content/faq.mjs';
import { guides } from '../src/content/guides.mjs';
import { eventContent } from '../src/content/events.mjs';
import { minifyCSS, minifyHTML } from './minify.mjs';
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
      : `<button class="btn btn-reveal" type="button" ${revealAttrs(c, title)} aria-label="העתק קוד: ${esc(title)}">
          <span class="reveal-mask" aria-hidden="true">${masked}</span>
          <span class="reveal-label" aria-hidden="true">העתק קוד</span>
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
const INLINE_CSS = minifyCSS(await fs.readFile(path.join(ROOT, 'src/assets/style.css'), 'utf8'));
const USD_ILS = Number(gen.fx?.usdIls) || Number(site.fx?.usdIls) || 3.7;
const verification = site.verification || {};

function layout({ title, description, pathname, body, ld = [], noindex = false, ogType = 'website' }) {
  const canonical = abs(pathname);
  const ga = site.analytics?.ga4Id;
  const robots = noindex || SAMPLE_MODE ? 'noindex,nofollow' : 'index,follow,max-image-preview:large,max-snippet:-1';
  const nav = [
    ['/', 'קודי קופון'],
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
<link rel="canonical" href="${canonical}">
<link rel="alternate" hreflang="he-IL" href="${canonical}">
<link rel="alternate" hreflang="x-default" href="${canonical}">
<meta name="robots" content="${robots}">
<meta property="og:type" content="${ogType}">
<meta property="og:locale" content="${site.locale}">
<meta property="og:site_name" content="${esc(site.name)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${canonical}">
<meta property="og:image" content="${abs('/assets/og-v2.jpg')}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${esc(site.name)}: קוד קופון אליאקספרס לישראל">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#ff3d2e">
<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/assets/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<link rel="alternate" type="application/atom+xml" title="${esc(site.name)}: קודים חדשים" href="/feed.xml">
<link rel="preload" href="/assets/fonts/rubik-hebrew.woff2" as="font" type="font/woff2" crossorigin>
<meta name="format-detection" content="telephone=no">
${verification.google ? `<meta name="google-site-verification" content="${esc(verification.google)}">` : ''}
${verification.bing ? `<meta name="msvalidate.01" content="${esc(verification.bing)}">` : ''}
<style>${INLINE_CSS}</style>
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
      <p>${esc(site.tagline)}. האתר עצמאי ואינו קשור לאליאקספרס או לקבוצת עליבאבא.</p>
    </div>
    <div>
      <h2>קופונים</h2>
      <a href="/">קוד קופון אליאקספרס</a>
      ${allProducts().length ? '<a href="/deals/">דילים מאליאקספרס</a>' : ''}
      <a href="/new-user/">קופון למשתמש חדש</a>
      ${(manual.events || []).map((e) => `<a href="/sale/${e.slug}/">קופונים ${esc(le(e.name.split(' –')[0]))}</a>`).join('')}
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
  <form method="dialog"><button type="submit" class="modal-x" aria-label="סגירה">×</button></form>
  <p class="modal-kicker" id="modal-kicker">הקוד הועתק ✓</p>
  <h2 id="modal-title">הקוד שלכם</h2>
  <div class="modal-code"><code id="modal-code"></code><button class="btn btn-primary" type="button" id="modal-copy">${ICON.copy}<span>העתקה</span></button></div>
  <ol class="modal-steps">
    <li>נכנסים לאליאקספרס (האפליקציה תיפתח לבד)</li>
    <li>מוסיפים מוצרים לעגלה ועוברים לתשלום</li>
    <li>מדביקים את הקוד בשדה <b>"קוד מבצע"</b></li>
  </ol>
  <div class="modal-countdown" id="modal-countdown" role="status"><span>פותחים את אליאקספרס בעוד <b id="modal-count">2</b>…</span><i id="modal-bar"></i></div>
  <div class="modal-links"><a id="modal-go" href="/go/home/" ${OUT}>לא נפתח? לחצו כאן</a></div>
  <a class="share-wa" id="modal-share" href="https://wa.me/" target="_blank" rel="noopener">שלחו את הקוד לחבר בוואטסאפ</a>
</dialog>
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

function calcWidget() {
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
  const body = `
<section class="hero">
  <div class="wrap hero-grid">
    <div class="hero-text">
      <h1>קוד קופון אליאקספרס <span class="hl">${esc(monthYear)}</span></h1>
      <p class="lead">${realCodes.length ? `${realCodes.length} קודים פעילים · עד <strong>$${maxDiscount}</strong> הנחה` : 'כל קודי ההנחה, מסודרים לפי סכום ההזמנה'} · עודכן ב-${esc(updatedHe)}</p>
      <ul class="trust">
        <li>${ICON.check} קודים שפג תוקפם יורדים מהרשימה</li>
        <li>${ICON.check} מסודר לפי סכום העגלה</li>
        <li>${ICON.check} חינם, בלי הרשמה</li>
      </ul>
    </div>
    ${calcWidget()}
    ${featuredCoupons.length ? `<div class="featured-row">${featuredCoupons.map((c) => `
      <button class="featured" type="button" ${revealAttrs(c, `${money(c.discount, c.currency)} הנחה מעל ${money(c.minOrder, c.currency)}`)}>
        <span class="f-amount">${money(c.discount, c.currency)}</span>
        <span class="f-min">מעל ${money(c.minOrder, c.currency)}</span>
        <span class="f-cta">העתק קוד</span>
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
      ${manual.listNote ? `<p class="list-note">${esc(manual.listNote)}</p>` : ''}
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
          <li><span><b>לוחצים "העתק קוד"</b> הקוד מועתק</span></li>
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
      <li>בוחרים קוד מהרשימה לפי הסכום שבעגלה ולוחצים <b>"העתק קוד"</b>. הקוד מועתק ואליאקספרס נפתחת.</li>
      <li>מוסיפים מוצרים לעגלה ועוברים לתשלום.</li>
      <li>בשורה <b>"קוד מבצע"</b> מדביקים את הקוד ולוחצים "החל".</li>
      <li>בודקים שהסכום ירד, ורק אז משלמים.</li>
    </ol>
    <p>המדריך המלא, כולל אפליקציה: <a href="/guides/how-to-use-aliexpress-coupon/">איך משתמשים בקוד קופון באליאקספרס</a>. מזמינים בפעם הראשונה? ראו <a href="/new-user/">קופון אליאקספרס למשתמש חדש</a>.</p>

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

${coupons.length ? `<div class="sticky-cta" id="sticky-cta" hidden><span>עד <b>${money(Math.max(...coupons.map((c) => c.discount)))}</b> הנחה באליאקספרס</span><a class="btn btn-primary" href="#calc">מצאו את הקוד שלכם</a></div>` : ''}
<section class="section"><div class="wrap narrow"><p class="disclosure">גילוי נאות: חלק מהקישורים באתר הם קישורי שותפים. כשקונים דרכם אנחנו עשויים לקבל עמלה מאליאקספרס, בלי תוספת למחיר שלכם. <a href="/disclosure/">עוד פרטים</a></p></div></section>`;

  return layout({ title, description, pathname, body, ld: [websiteLd, orgLd, faqLd(faq)] });
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
  const content = eventContent[ev.slug] || {};
  const bc = breadcrumbs([{ name: `קופונים ${le(short)}`, url: pathname }]);
  const live = ev.start <= today && ev.end >= today;
  const upcoming = ev.start > today;
  const year = ev.start.slice(0, 4);
  const own = coupons.filter((c) => c.event === ev.slug);
  const evCoupons = own.length ? own : coupons;
  const faqItems = content.faq || [];
  const body = `
<section class="hero"><div class="wrap narrow">${bc.html}
  <h1>קוד קופון אליאקספרס ${esc(le(ev.name))} ${year}</h1>
  <p class="lead">${live ? `המבצע פעיל עכשיו, עד ${heDate(ev.end)}.` : upcoming ? `המבצע צפוי להתחיל ב-${heDate(ev.start)}. כשאליאקספרס תפרסם את קודי המבצע, הם יופיעו כאן.` : 'המבצע הסתיים. אלה הקודים הפעילים כרגע.'}</p>
  ${upcoming ? `<div class="countdown" data-countdown="${ev.start}T00:00:00+02:00" role="timer" aria-label="זמן עד תחילת המבצע"></div>` : ''}
</div></section>
<section class="section"><div class="wrap narrow">
  ${content.intro ? `<div class="prose">${content.intro}</div>` : ''}
  <h2 class="section-title">${own.length && live ? `קודי ${esc(short)}` : 'הקודים הפעילים כרגע'}</h2>
  <div class="coupon-list">${evCoupons.map((c) => couponCard(c)).join('')}</div>
  ${evCoupons.length ? `<h2 class="section-title">טבלת מדרגות</h2>${tierTable(evCoupons)}` : ''}
  <div class="prose">
    <h2>איך מתכוננים ${esc(le(short))}</h2>
    <ol>
      <li>מוסיפים לעגלה כבר עכשיו את המוצרים שרוצים. ככה רואים מה המחיר לפני המבצע ומה ההנחה האמיתית.</li>
      <li>אוספים קופונים ממרכז הקופונים של אליאקספרס כשהם נפתחים, ומטבעות באפליקציה.</li>
      <li>בפתיחת המבצע חוזרים לעמוד הזה, בוחרים קוד לפי סכום העגלה ב<a href="/#calc">מחשבון</a> ומשלמים מהר, לפני שהמכסה נגמרת.</li>
    </ol>
    <p>עוד: <a href="/guides/aliexpress-sales-calendar/">לוח המבצעים השנתי</a> · <a href="/guides/stacking-aliexpress-discounts/">איך משלבים הנחות</a> · <a href="/guides/how-to-use-aliexpress-coupon/">איך מפעילים קוד</a></p>
  </div>
  ${faqItems.length ? `<h2 class="section-title">שאלות נפוצות על ${esc(short)}</h2><div class="faq">${faqItems.map((f) => `<details><summary><h3>${esc(f.q)}</h3></summary><p>${esc(f.a)}</p></details>`).join('')}</div>` : ''}
</div></section>`;
  return layout({
    title: `קוד קופון אליאקספרס ${le(short)} ${year} | ${site.name}`,
    description: `קודי הקופון של אליאקספרס ${le(ev.name)} ${year} לקונים מישראל, לפי מדרגות, מתי המבצע מתחיל ואיך מתכוננים כדי לחסוך יותר.`,
    pathname, body, ld: faqItems.length ? [bc.ld, faqLd(faqItems)] : [bc.ld],
  });
}

function newUserPage() {
  const pathname = '/new-user/';
  const bc = breadcrumbs([{ name: 'קופון למשתמש חדש', url: pathname }]);
  const nu = deals.find((d) => d.id === 'new-user');
  const firstTier = coupons.filter((c) => c.code && !c.sample).sort((a, b) => a.minOrder - b.minOrder)[0];
  const items = [
    { q: 'מה מקבלים כמשתמש חדש באליאקספרס?', a: 'אליאקספרס נותנת למצטרפים חדשים הטבות שמשתנות מעת לעת, למשל קופון להזמנה ראשונה או מוצרים במחיר מוזל. ההטבה המדויקת מופיעה באתר אחרי ההרשמה.' },
    { q: 'אפשר לשלב את הטבת ההצטרפות עם קוד קופון?', a: 'בדרך כלל אפשר להשתמש בקוד מבצע אחד בכל הזמנה, ולשלב אותו עם קופונים שנאספים לחשבון. אם ההטבה היא קופון שנאסף לחשבון, לרוב אפשר להוסיף עליו קוד מבצע מהרשימה שלנו.' },
    { q: 'מי נחשב משתמש חדש?', a: 'מי שעדיין לא ביצע הזמנה באליאקספרס. פתיחת חשבון נוסף לאותו אדם עלולה להפר את התנאים של אליאקספרס, ולכן לא כדאי.' },
  ];
  const body = `
<section class="hero hero-sm"><div class="wrap narrow">${bc.html}
  <h1>קופון אליאקספרס למשתמש חדש</h1>
  <p class="lead">מצטרפים לאליאקספרס בפעם הראשונה? כך מוציאים את המקסימום מההזמנה הראשונה.</p>
  <a class="btn btn-primary" href="/go/${nu ? nu.id : 'home'}/" ${OUT} data-go="${nu ? nu.id : 'home'}">להטבות ההצטרפות באליאקספרס ${ICON.arrow}</a>
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
  ${firstTier ? `<h2 class="section-title">קוד שאפשר להוסיף כבר בהזמנה הראשונה</h2><div class="coupon-list">${couponCard(firstTier, { compact: true })}</div><p><a href="/">לכל קודי הקופון ←</a></p>` : ''}
  <h2 class="section-title">שאלות על הזמנה ראשונה</h2>
  <div class="faq">${items.map((f) => `<details><summary><h3>${esc(f.q)}</h3></summary><p>${esc(f.a)}</p></details>`).join('')}</div>
</div></section>`;
  return layout({
    title: `קופון אליאקספרס למשתמש חדש ${monthYear}: הטבות להזמנה ראשונה | ${site.name}`,
    description: 'מה מקבלים בהזמנה ראשונה באליאקספרס, איך משלבים את הטבת ההצטרפות עם קוד קופון, ומה כדאי לדעת לפני שנרשמים.',
    pathname, body, ld: [bc.ld, faqLd(items)],
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
    publisher: { '@type': 'Organization', name: site.name, logo: { '@type': 'ImageObject', url: abs('/assets/icon-512.png') } },
    image: abs('/assets/og-v2.jpg'), mainEntityOfPage: abs(pathname),
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
  return `<!DOCTYPE html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="robots" content="noindex,nofollow">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>מעבר לאליאקספרס…</title>
<meta http-equiv="refresh" content="0;url=${esc(t)}">
<style>body{font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;background:#fffaf7;color:#1b1b24;text-align:center;padding:16px}a{color:#c20c33}</style>
<script>location.replace(${scriptJSON(t)});</script></head>
<body><p>מעבירים אתכם לאליאקספרס…<br><a href="${esc(t)}" rel="nofollow sponsored">לחצו כאן אם המעבר לא קרה</a></p></body></html>`;
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
<p><b>${esc(site.name)}</b> הוא אתר עצמאי שמרכז את קודי הקופון של אליאקספרס לקונים מישראל, במקום אחד ובעברית.</p>
<p>הקודים נאספים ממקורות פומביים ומתוכנית השותפים של אליאקספרס, ונבדקים מול יותר ממקור אחד לפני שהם עולים לאתר. קודים שפג תוקפם יורדים מהרשימה אוטומטית, והכל מסודר לפי סכום ההזמנה כדי שיהיה קל למצוא את הקוד המתאים. קודים שקונים פרסמו בפורומים מוצגים בנפרד ומסומנים "לא נבדק".</p>
<p>יש לכם קוד שעבד ולא מופיע כאן, או קוד שלא עובד? כתבו לנו: <a href="mailto:${esc(site.contactEmail)}">${esc(site.contactEmail)}</a></p>`, `מה זה ${site.name}, מאיפה מגיעים קודי הקופון לאליאקספרס שמופיעים באתר, ואיך פונים אלינו עם קוד חדש או קוד שלא עובד.`));
await page('/disclosure/', staticPage('/disclosure/', 'גילוי נאות', `
<p>${esc(site.name)} משתתף בתוכנית השותפים של אליאקספרס (AliExpress Portals). חלק מהקישורים באתר הם קישורי שותפים: כשלוחצים עליהם וקונים, אנחנו עשויים לקבל עמלה מאליאקספרס.</p>
<p>העמלה לא מייקרת את המחיר שלכם, ולא משפיעה על סדר הקודים. הם מסודרים לפי סכום ההזמנה.</p>
<p>האתר אינו קשור, מאושר או מופעל ע"י AliExpress או Alibaba Group. כל הסימנים המסחריים שייכים לבעליהם.</p>
<p>התנאים של כל קוד נקבעים ע"י אליאקספרס, ואנחנו לא יכולים להבטיח שקוד מסוים יעבוד בכל הזמנה.</p>`, 'גילוי נאות: איך האתר מרוויח מקישורי השותפים של אליאקספרס, ולמה זה לא משנה את המחיר שלכם ולא את סדר הקודים.'));
await page('/privacy/', staticPage('/privacy/', 'מדיניות פרטיות', `
<p>האתר לא דורש הרשמה ולא אוסף פרטים מזהים.</p>
${site.analytics?.ga4Id ? '<p>אנחנו משתמשים ב-Google Analytics כדי להבין באופן אנונימי איך משתמשים באתר.</p>' : ''}
<p>כשעוברים מהאתר לאליאקספרס, אליאקספרס עשויה לשמור עוגייה כדי לשייך את הרכישה לתוכנית השותפים. המדיניות של אליאקספרס חלה באתר שלה.</p>
<p>לשאלות: <a href="mailto:${esc(site.contactEmail)}">${esc(site.contactEmail)}</a></p>`, 'מדיניות הפרטיות של האתר: אילו נתונים נאספים (בלי הרשמה ובלי פרטים מזהים), ומה קורה כשעוברים לאליאקספרס.'));

for (const [id, target] of goTargets) await write(`go/${id}/index.html`, goPage(target));

await page('/new-user/', newUserPage(), { lastmod: dataUpdated });

// Atom feed of active codes: lets Telegram/WhatsApp bots and feed readers pick up new codes automatically.
await write('feed.xml', `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="he">
  <title>${esc(site.name)}: קודי קופון לאליאקספרס</title>
  <link href="${abs('/')}"/><link rel="self" href="${abs('/feed.xml')}"/>
  <id>${abs('/')}</id><updated>${dataUpdated}T00:00:00Z</updated>
${(SAMPLE_MODE ? [] : realCodes).map((c) => `  <entry><title>${esc(`${couponTitle(c)}: ${c.code}`)}</title><link href="${abs(`/#c-${c.id}`)}"/><id>${abs(`/#c-${c.id}-${c.code}`)}</id><updated>${(c.verified || dataUpdated)}T00:00:00Z</updated><summary>${esc(`קוד ${c.code}: ${couponTitle(c)}${c.expires ? `, בתוקף עד ${heDate(c.expires)}` : ''}`)}</summary></entry>`).join('\n')}
</feed>
`);
await write('site.webmanifest', JSON.stringify({
  name: `${site.name} | קודי קופון לאליאקספרס`, short_name: site.name, lang: 'he', dir: 'rtl', start_url: '/', display: 'standalone',
  background_color: '#fffaf7', theme_color: '#e5122f',
  icons: [{ src: '/assets/icon-192.png', sizes: '192x192', type: 'image/png' }, { src: '/assets/icon-512.png', sizes: '512x512', type: 'image/png' }],
}));

await write('404.html', layout({
  title: `הדף לא נמצא | ${site.name}`, description: 'הדף לא נמצא', pathname: '/404.html', noindex: true,
  body: `<section class="hero"><div class="wrap narrow"><h1>הדף לא נמצא</h1><p class="lead">אבל הקודים כאן.</p><a class="btn btn-primary" href="/">לכל קודי הקופון</a></div></section>`,
}));
await write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${(SAMPLE_MODE ? [] : sitemap).map(([p, lm]) => `  <url><loc>${abs(p)}</loc>${lm ? `<lastmod>${lm}</lastmod>` : ''}</url>`).join('\n')}\n</urlset>\n`);
await write('robots.txt', SAMPLE_MODE ? 'User-agent: *\nDisallow: /\n' : `User-agent: *\nAllow: /\nDisallow: /go/\nDisallow: /telegram-state.json\n\nSitemap: ${abs('/sitemap.xml')}\n`);
await write('.nojekyll', '');
if (gen.telegram?.posted) await write('telegram-state.json', JSON.stringify(gen.telegram));
if (site.indexNowKey) await write(`${site.indexNowKey}.txt`, site.indexNowKey);

console.log(`✓ built ${sitemap.length} indexable pages + ${goTargets.size} redirects → dist/  (${realCodes.length} real codes, ${coupons.length - realCodes.length} sample, ${community.length} community, ${allProducts().length} products)${SAMPLE_MODE ? '  [PREVIEW – noindex]' : ''}`);
