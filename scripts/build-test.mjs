// YeshDeal 2.0 preview → dist/test/  (run AFTER scripts/build.mjs)
// Isolation rules: writes ONLY inside dist/test/, never touches production files, sitemap or robots.txt.
// Every page: <meta name="robots" content="noindex,nofollow">, no canonical to production, not in any sitemap.
// robots.txt deliberately does NOT block /test/, so crawlers can actually see the noindex.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mergeCoupons } from './lib.mjs';
import { categories, categoryColors } from '../src/content/categories.mjs';
import { fixtureProducts, fixtureCollections, hunterDemo } from '../src/v2/fixtures.mjs';
import { classifyMatch, finalCost } from '../src/v2/logic.mjs';
import { liveProducts } from './v2-live.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'dist', 'test');
const read = async (p, d) => JSON.parse(await fs.readFile(path.join(ROOT, p), 'utf8').catch(() => JSON.stringify(d)));
const site = await read('config/site.json', {});
const manual = await read('data/coupons.json', {});
const gen = await read('data/generated.json', {});
const today = process.env.BUILD_DATE || new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date());
const RATE = Number(gen.fx?.usdIls) || Number(site.fx?.usdIls) || 3.7;
// Preview uses the Worker directly (production config stays untouched).
const API = process.env.V2_API || 'https://yeshdeal-api.joni0000.workers.dev';
const AFF = site.affiliate.defaultLink; // production affiliate link, unchanged
const { active } = mergeCoupons(manual.coupons || [], [], today);
const codes = active.filter((c) => c.code && !c.sample).sort((a, b) => a.minOrder - b.minOrder);
const tiers = codes.map((c) => ({ id: c.id, d: c.discount, m: c.minOrder, code: c.code }));

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const usd = (n) => `$${(Math.round(n * 100) / 100).toLocaleString('en-US')}`;
const ils = (n) => `₪${Math.round(n * RATE).toLocaleString('he-IL')}`;
const heDate = (d) => { const [y, m, dd] = d.split('-'); return `${Number(dd)}.${Number(m)}.${y}`; };
const OUTLINK = 'rel="nofollow sponsored noopener"';
// Live data from the official API at build time; any slot that fails keeps its labelled fixture.
const LIVE = process.env.V2_OFFLINE ? { byFixtureId: {}, live: 0 } : await liveProducts(fixtureProducts);
const merge = (f) => {
  const l = LIVE.byFixtureId[f.id];
  if (!l) return { ...f, live: false, priceIls: Math.round(f.price * RATE) };
  return { ...f, id: l.id, title: l.title, image: l.image, link: l.link, price: Math.round((l.price / RATE) * 100) / 100, priceIls: l.price, originalIls: l.originalPrice, shipping: null, specs: {}, rating: l.rating, sold: l.sold, shop: l.shop, checkedAt: l.checkedAt, live: true };
};
const byId = Object.fromEntries(fixtureProducts.map((f) => [f.id, merge(f)]));
const allProducts = Object.values(byId);
const ALL_LIVE = allProducts.every((p) => p.live);
const checkedHe = (p) => p.checkedAt ? new Intl.DateTimeFormat('he-IL', { timeZone: 'Asia/Jerusalem', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(p.checkedAt)) : '';
const priceIls = (p) => `₪${(Math.round(p.priceIls * 100) / 100).toLocaleString('he-IL')}`;
const catName = (slug) => categories.find((c) => c.slug === slug)?.name || (slug === 'electronics' ? 'אלקטרוניקה' : slug);
const colors = (slug) => categoryColors[slug] || ['#ff7a2f', '#e5122f'];

const previewChip = '<span class="chip-preview" title="נתוני תצוגה עד חיבור ה-API הרשמי">נתוני תצוגה</span>';

function shell({ title, body, active: nav = '' }) {
  const L = [['/test/', 'ראשי', 'home'], ['/test/hunter/', '🎯 צייד הדילים', 'hunter'], ['/test/top/car-accessories/', 'Top 10', 'top'], ['/test/c/car/', 'קטגוריות', 'cat'], ['/test/#coupons', 'קודי קופון', 'coupons']];
  return `<!DOCTYPE html><html lang="he" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex,nofollow,noarchive">
<title>${esc(title)} · תצוגה מקדימה | יש דיל!</title>
<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
<link rel="preload" href="/assets/fonts/rubik-hebrew.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/test/v2.css?v=${Date.now().toString(36)}">
</head><body data-aff="${esc(AFF)}">
<div class="pv-bar">🧪 גרסת תצוגה מקדימה של יש דיל! 2.0 · לא האתר הרשמי · <a href="/">לאתר הפעיל ←</a></div>
<header class="hd"><div class="wrap hd-row">
  <a class="logo" href="/test/"><svg viewBox="0 0 64 64" width="34" height="34" aria-hidden="true"><defs><linearGradient id="lg" x1="8" y1="4" x2="56" y2="60" gradientUnits="userSpaceOnUse"><stop stop-color="#ff7a2f"/><stop offset="1" stop-color="#e5122f"/></linearGradient></defs><path d="M32 4C16.5 4 4 15.2 4 29c0 6.7 3 12.8 7.8 17.3L8 60l15-6.6c2.8.8 5.9 1.2 9 1.2 15.5 0 28-11.2 28-25S47.5 4 32 4z" fill="url(#lg)"/><path d="M22 39 42 19" stroke="#fff" stroke-width="5.5" stroke-linecap="round"/><circle cx="23" cy="21" r="5" fill="#fff"/><circle cx="41" cy="37" r="5" fill="#fff"/></svg><span>יש דיל<b>!</b></span></a>
  <nav class="nv" aria-label="ניווט">${L.map(([h, t, k]) => `<a href="${h}"${k === nav ? ' aria-current="page"' : ''}>${t}</a>`).join('')}</nav>
</div></header>
<main id="main">${body}</main>
<footer class="ft"><div class="wrap">
  <p><b>יש דיל!</b> · קופונים, דילים ומוצרים שימושיים מעליאקספרס לישראל.</p>
  <p class="muted">גילוי נאות: חלק מהקישורים הם קישורי שותפים. אם קונים דרכם, אנחנו עשויים לקבל עמלה, בלי תוספת למחיר שלכם. האתר עצמאי ואינו קשור לעליאקספרס.</p>
  <p class="muted">גרסת תצוגה מקדימה. מוצרים ומחירים מגיעים מה-API הרשמי של עליאקספרס עם זמן הבדיקה. פריטים המסומנים "נתוני תצוגה" הם להמחשה בלבד.</p>
</div></footer>
<script type="module" src="/test/v2.js?v=${Date.now().toString(36)}"></script>
</body></html>`;
}

const thumb = (p, big = false) => {
  if (p.image) return `<div class="thumb photo${big ? ' big' : ''}"><img src="${esc(p.image)}_${big ? 640 : 350}x${big ? 640 : 350}.jpg" alt="${esc(p.title)}" loading="${big ? 'eager' : 'lazy'}" decoding="async" width="${big ? 640 : 350}" height="${big ? 640 : 350}" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='${esc(p.image)}'"></div>`;
  const [a, b] = colors(p.cat);
  return `<div class="thumb${big ? ' big' : ''}" style="--a:${a};--b:${b}" role="img" aria-label="${esc(p.title)} – תמונה תתווסף מה-API"><span>${p.emoji}</span><small>התמונה האמיתית תגיע מה-API</small></div>`;
};

function productCard(p, rank) {
  return `<article class="pc">
  <a class="pc-link" href="/test/p/${p.id}/">${thumb(p)}${rank ? `<b class="rank">${rank}</b>` : ''}</a>
  <div class="pc-body">
    <h3><a href="/test/p/${p.id}/">${esc(p.title)}</a></h3>
    <p class="why">${esc(p.why)}</p>
    <div class="price"><b>${priceIls(p)}</b><span>${p.live ? `בערך ${usd(p.price)}${p.sold ? ` · ${p.sold.toLocaleString('he-IL')} נמכרו` : ''}` : `${usd(p.price)}${p.shipping ? ` + משלוח ${usd(p.shipping)}` : ' · משלוח חינם'}`}</span></div>
    <div class="pc-foot">${p.live ? `<span class="chk" title="מחיר מה-API הרשמי של עליאקספרס">✓ נבדק ${checkedHe(p)}</span>` : previewChip}<a class="btn btn-sm" href="/test/p/${p.id}/">לפרטים</a></div>
  </div>
</article>`;
}

function calcBlock() {
  if (!tiers.length) return `<div class="calc-box"><b>אין כרגע קודים פעילים</b><p class="muted">הקודים הבאים יופיעו כאן כשיצאו.</p></div>`;
  return `<div class="calc-box" id="calc" data-rate="${RATE}">
  <label for="calc-in"><b>כמה יש לכם בעגלה?</b> <span class="muted">נבחר את הקוד המשתלם ביותר</span></label>
  <div class="calc-row"><input id="calc-in" type="text" inputmode="decimal" autocomplete="off" placeholder="למשל 60" aria-describedby="calc-out">
  <div class="seg" role="group" aria-label="מטבע"><button type="button" class="on" data-cur="USD" aria-pressed="true">$</button><button type="button" data-cur="ILS" aria-pressed="false">₪</button></div></div>
  <div id="calc-out" class="calc-out" aria-live="polite">הקלידו את סכום העגלה.</div>
  <script type="application/json" id="tiers">${JSON.stringify(tiers).replace(/</g, '\\u003c')}</script>
</div>`;
}

function codeList() {
  return codes.map((c) => `<li class="code-row"><span class="amt">${usd(c.discount)}</span><span class="min">מעל ${usd(c.minOrder)}</span>
  <span class="st" title="מקור: פרסום רשמי שהוצלב מול מקור נוסף">פורסם · ${c.expires ? `בתוקף עד ${heDate(c.expires)}` : ''}</span>
  <button type="button" class="copy" data-code="${esc(c.code)}">העתק</button></li>`).join('');
}

function hunterForm(cls = '') {
  return `<form class="hunt ${cls}" action="/test/hunter/" method="get" role="search">
  <label for="h-url" class="sr">קישור למוצר בעליאקספרס</label>
  <input id="h-url" name="url" type="text" inputmode="url" dir="ltr" placeholder="הדביקו קישור למוצר מעליאקספרס" autocomplete="off">
  <button type="submit" class="btn btn-y">🎯 שלחו את הצייד</button>
</form>`;
}

/* ---------------- pages ---------------- */
const pages = {};

pages['index.html'] = shell({ active: 'home', title: 'יש דיל! 2.0', body: `
<section class="hero"><div class="wrap hero-g">
  <div>
    <p class="kick">קופונים · דילים · השוואת מחירים לעליאקספרס</p>
    <h1>קונים בעליאקספרס?<br><span class="g">יש דיל.</span></h1>
    <p class="lead">שלוש דרכים לשלם פחות: הקוד הנכון לעגלה, מוצרים שווים שבחרנו, ובדיקה אם המוצר שאתם רוצים נמכר זול יותר אצל מוכר אחר.</p>
    <div class="paths">
      <a href="#coupons" class="path"><b>🎟️ מצאו קוד</b><span>לפי סכום העגלה</span></a>
      <a href="#deals" class="path"><b>🔥 גלו דילים</b><span>מוצרים שימושיים</span></a>
      <a href="/test/hunter/" class="path"><b>🎯 צייד הדילים</b><span>אותו מוצר, זול יותר?</span></a>
    </div>
  </div>
  <div id="coupons">${calcBlock()}</div>
</div></section>

<section class="sec"><div class="wrap">
  <div class="hunter-card">
    <div><span class="tag-y">🎯 צייד הדילים</span><h2>יש לכם כבר מוצר בעגלה?</h2><p>הדביקו קישור, והצייד יבדוק אם אותו מוצר נמכר זול יותר אצל מוכרים אחרים, ויפריד בין התאמה מדויקת להתאמה שדורשת בדיקה.</p></div>
    ${hunterForm()}
  </div>
</div></section>

<section class="sec" id="deals"><div class="wrap">
  <div class="sec-h"><h2>🔥 דילים שבחרנו</h2>${ALL_LIVE ? '<span class="chk">מחירים חיים מה-API הרשמי</span>' : previewChip}</div>
  <div class="grid">${['fx-powerbank', 'fx-earbuds', 'fx-dashcam', 'fx-tire-inflator'].map((id) => productCard(byId[id])).join('')}</div>
</div></section>

<section class="sec"><div class="wrap">
  <div class="sec-h"><h2>⭐ אוספי Top 10</h2></div>
  <div class="cols">${fixtureCollections.map((c) => `<a class="col" href="/test/top/${c.slug}/" style="--a:${colors(c.cat)[0]};--b:${colors(c.cat)[1]}"><span>${c.emoji}</span><b>${esc(c.title)}</b><i>לאוסף ←</i></a>`).join('')}
  <div class="col soon"><span>🏠</span><b>10 מוצרים שימושיים לבית</b><i>בקרוב</i></div>
  <div class="col soon"><span>✈️</span><b>10 גאדג׳טים לטיול</b><i>בקרוב</i></div></div>
</div></section>

<section class="sec"><div class="wrap">
  <div class="sec-h"><h2>🎟️ כל קודי הקופון</h2><a href="/" class="muted">אותם קודים כמו באתר הפעיל</a></div>
  <ul class="codes">${codeList()}</ul>
</div></section>

<section class="sec"><div class="wrap">
  <h2>קטגוריות</h2>
  <div class="cats">${categories.map((c) => `<a href="/test/c/${c.slug}/" style="--a:${colors(c.slug)[0]};--b:${colors(c.slug)[1]}"><span>${c.emoji}</span>${esc(c.name)}</a>`).join('')}</div>
</div></section>

<section class="sec"><div class="wrap trust">
  <div><b>🧾 שקיפות</b><p>מחיר שמוצג תמיד מגיע עם זמן הבדיקה. מחיר ישן מסומן כישן.</p></div>
  <div><b>🎯 התאמות כנות</b><p>הצייד מפריד בין "התאמה מדויקת", "כנראה אותו מוצר" ו"חלופה דומה".</p></div>
  <div><b>📲 קהילה</b><p>קודים חדשים בערוץ הטלגרם. <a href="${esc(site.social.telegram)}" target="_blank" rel="noopener">הצטרפו ←</a></p></div>
</div></section>` });

pages['hunter/index.html'] = shell({ active: 'hunter', title: 'צייד הדילים', body: `
<section class="hero dark"><div class="wrap narrow">
  <span class="tag-y">🎯 צייד הדילים</span>
  <h1>אותו מוצר, אצל מוכר זול יותר?</h1>
  <p class="lead">מדביקים קישור למוצר מעליאקספרס. הצייד מזהה את המוצר, מחפש הצעות אחרות ומחלק אותן לשלוש רמות ביטחון.</p>
  ${hunterForm('big')}
  <p class="muted small">מקבלים רק קישורים לעליאקספרס. קישורים מקוצרים מהאפליקציה עובדים.</p>
  <div id="h-state" class="h-state" aria-live="polite"></div>
</div></section>
<section class="sec"><div class="wrap narrow"><div id="h-results" aria-live="polite"></div></div></section>
<section class="sec"><div class="wrap narrow">
  <h2>איך זה עובד</h2>
  <ol class="steps">
    <li><b>מזהים את המוצר</b> מהקישור (מספר מוצר), ומושכים פרטים מה-API הרשמי.</li>
    <li><b>מחפשים הצעות</b> של מוכרים אחרים עם משלוח לישראל.</li>
    <li><b>משווים מאפיינים</b>: דגם, קיבולת, סוג תקע, צבע. התאמה מדויקת רק כשהדגם זהה ואין סתירה.</li>
    <li><b>מחשבים מחיר סופי משוער</b>: מוצר + משלוח − קוד קופון מתאים. מסים לא נכללים אלא אם חושבו.</li>
  </ol>
  <p><a class="btn" href="/test/hunter/result/">לראות הדגמה של עמוד תוצאות ←</a></p>
  <div class="note">✅ מחובר ל-API הרשמי של עליאקספרס. החיפוש רץ בזמן אמת.</div>
</div></section>`.replace('<form class="hunt big"', `<form class="hunt big" data-api="${esc(API)}"`) });

// demo results – classified by the real matching engine
{
  const base = hunterDemo.base;
  const rows = hunterDemo.candidates.map((c) => ({ ...c, m: classifyMatch(base, c), cost: finalCost(c, tiers) }));
  const baseCost = finalCost(base, tiers);
  const groups = [['exact', '✅ התאמה מדויקת', 'אותו דגם, בלי סתירה במאפיינים'], ['likely', '🟡 כנראה אותו מוצר – כדאי לבדוק', 'דומה מאוד, אבל אין מספר דגם להשוואה'], ['similar', '🔁 חלופות דומות', 'לא אותו מוצר: שונה במאפיין חשוב']];
  const reasonHe = (r) => r.replace('model:same', 'אותו דגם').replace('capacity:same', 'אותה קיבולת').replace('capacity:different', 'קיבולת שונה').replace('plug:different', 'תקע שונה').replace('model:different', 'דגם שונה').replace('title:similar', 'כותרת כמעט זהה').replace('title:related', 'מוצר קשור');
  const offer = (r) => {
    const save = baseCost.total - r.cost.total;
    return `<article class="offer lvl-${r.m.level}">
  <div class="o-main"><b>${esc(r.he)}</b><span class="muted small" dir="ltr">${esc(r.title)}</span>
  <div class="why-m">${r.m.reasons.map((x) => `<span>${reasonHe(x)}</span>`).join('')}</div></div>
  <dl class="o-cost"><div><dt>מוצר</dt><dd>${usd(r.price)}</dd></div><div><dt>משלוח לישראל</dt><dd>${r.cost.shippingKnown ? (r.shipping ? usd(r.shipping) : 'חינם') : 'לא ידוע'}</dd></div><div><dt>קוד ${esc(r.cost.code || '')}</dt><dd>−${usd(r.cost.coupon)}</dd></div><div class="tot"><dt>סה״כ משוער</dt><dd>${usd(r.cost.total)} <small>(${ils(r.cost.total)})</small></dd></div></dl>
  <div class="o-act">${r.m.level !== 'similar' && save > 0 ? `<span class="save">חיסכון משוער ${usd(save)}</span>` : ''}<span class="btn btn-dis" title="בהדגמה אין קישורים אמיתיים">לעליאקספרס (בהדגמה)</span></div>
</article>`;
  };
  pages['hunter/result/index.html'] = shell({ active: 'hunter', title: 'תוצאות צייד הדילים (הדגמה)', body: `
<section class="sec"><div class="wrap narrow">
  <div class="demo-banner">🧪 <b>הדגמה עם נתוני תצוגה.</b> הסיווג לרמות מחושב על ידי מנוע ההתאמה האמיתי, אבל המוצרים והמחירים להמחשה בלבד.</div>
  <div class="searched">${thumb({ ...base, cat: 'electronics' })}<div><span class="muted small">המוצר שחיפשתם</span><h1>${esc(base.he)}</h1>
  <p>${usd(base.price)} · משלוח ${base.shipping ? usd(base.shipping) : 'חינם'} · עם קוד ${esc(baseCost.code || '')}: <b>${usd(baseCost.total)}</b></p>
  <p class="muted small">נבדק: ${heDate(today)} (נתוני תצוגה)</p></div></div>
  ${groups.map(([lvl, h, sub]) => { const list = rows.filter((r) => r.m.level === lvl); return list.length ? `<h2 class="grp">${h}</h2><p class="muted small">${sub}</p>${list.map(offer).join('')}` : ''; }).join('')}
  <div class="note"><b>איך לקרוא את התוצאות:</b> "סה״כ משוער" = מוצר + משלוח − קוד קופון שמתאים לסכום. מע״מ לא נכלל: הזמנות עד 75$ (ערך הסחורה) פטורות, ומעל זה עליאקספרס מוסיפה מע״מ בקופה. מחיר יכול להשתנות עד הקנייה.</div>
</div></section>` });
}

for (const p of allProducts) {
  const cost = finalCost(p, tiers);
  const coll = fixtureCollections.find((c) => c.items.some((fid) => byId[fid].id === p.id));
  const related = allProducts.filter((x) => x.cat === p.cat && x.id !== p.id).slice(0, 4);
  pages[`p/${p.id}/index.html`] = shell({ title: p.title, body: `
<section class="sec"><div class="wrap">
  <nav class="crumb"><a href="/test/">ראשי</a> ‹ <a href="/test/c/${p.cat}/">${esc(catName(p.cat))}</a></nav>
  <div class="pp">
    ${thumb(p, true)}
    <div class="pp-info">
      ${p.live ? '' : previewChip}
      <h1>${esc(p.title)}</h1>
      <p class="lead">${esc(p.why)}</p>
      <div class="pp-price"><b>${priceIls(p)}</b><span>${p.live ? `בערך ${usd(p.price)}${p.originalIls && p.originalIls > p.priceIls ? ` · מחיר לפני הנחה בעליאקספרס: ₪${p.originalIls}` : ''} · משלוח לישראל: מוצג בעליאקספרס` : `${usd(p.price)} · משלוח לישראל: ${p.shipping ? usd(p.shipping) : 'חינם'}`}</span></div>
      ${cost.code ? `<div class="pp-coupon">🎟️ עם קוד <b>${esc(cost.code)}</b>: ${usd(cost.total)} סה״כ משוער <button class="copy" data-code="${esc(cost.code)}">העתק</button></div>` : `<div class="pp-coupon muted">אין קוד שמתאים לסכום הזה לבד. בעגלה גדולה יותר יש קודים.</div>`}
      <p class="muted small">${p.live ? `מחיר נבדק מול ה-API הרשמי: ${checkedHe(p)} · המחיר הסופי, המשלוח והמע״מ נקבעים בקופה של עליאקספרס` : `מחיר נבדק: ${heDate(today)} (נתוני תצוגה) · המחיר הסופי נקבע בעליאקספרס`}</p>
      ${p.live ? `<a class="btn btn-big" href="${esc(p.link)}" ${OUTLINK}>לרכישה בעליאקספרס ←</a>` : `<span class="btn btn-big btn-dis" title="בתצוגה אין קישור למוצר אמיתי">לרכישה בעליאקספרס (יופעל עם ה-API)</span>`}
      <table class="specs">${(p.live ? [['חנות', p.shop], ['דירוג חיובי', p.rating != null ? `${p.rating}%` : ''], ['נמכרו', p.sold ? p.sold.toLocaleString('he-IL') : '']] : Object.entries(p.specs)).filter(([, v]) => v).map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}</table>
    </div>
  </div>
  ${coll ? `<p class="in-coll">מופיע באוסף: <a href="/test/top/${coll.slug}/">${esc(coll.title)}</a></p>` : ''}
  ${related.length ? `<h2>מוצרים קשורים</h2><div class="grid">${related.map((r) => productCard(r)).join('')}</div>` : ''}
</div></section>` });
}

for (const c of fixtureCollections) {
  pages[`top/${c.slug}/index.html`] = shell({ active: 'top', title: c.title, body: `
<section class="hero coll" style="--a:${colors(c.cat)[0]};--b:${colors(c.cat)[1]}"><div class="wrap narrow">
  <span class="tag-w">⭐ Top 10${ALL_LIVE ? '' : ` · ${previewChip}`}</span>
  <h1>${esc(c.title)}</h1><p class="lead">${esc(c.intro)}</p>
  <p class="small">עודכן: ${heDate(today)}</p>
</div></section>
<section class="sec"><div class="wrap">
  <div class="list10">${c.items.map((id, i) => productCard(byId[id], i + 1)).join('')}</div>
  <div class="note"><b>איך בחרנו:</b> ${esc(c.method)}</div>
</div></section>` });
}

for (const cat of categories.filter((x) => ['car'].includes(x.slug))) {
  const items = allProducts.filter((p) => p.cat === cat.slug);
  pages[`c/${cat.slug}/index.html`] = shell({ active: 'cat', title: cat.name, body: `
<section class="hero coll" style="--a:${colors(cat.slug)[0]};--b:${colors(cat.slug)[1]}"><div class="wrap">
  <h1>${cat.emoji} ${esc(cat.name)}</h1><p class="lead">${esc(cat.intro.split('. ')[0])}.</p>
</div></section>
<section class="sec"><div class="wrap">
  <div class="sec-h"><h2>מוצרים</h2>${ALL_LIVE ? '' : previewChip}</div>
  <div class="filters"><button class="on">הכול</button><button>עד ₪50</button><button>₪50–₪150</button></div>
  <div class="grid">${items.map((p) => productCard(p)).join('')}</div>
  <h2>טיפים לקנייה</h2><ul class="tips">${cat.tips.map(([t, d]) => `<li><b>${esc(t)}.</b> ${esc(d)}</li>`).join('')}</ul>
</div></section>` });
}

await fs.rm(OUT, { recursive: true, force: true });
for (const [rel, html] of Object.entries(pages)) {
  const f = path.join(OUT, rel);
  await fs.mkdir(path.dirname(f), { recursive: true });
  await fs.writeFile(f, html);
}
await fs.copyFile(path.join(ROOT, 'src/v2/v2.css'), path.join(OUT, 'v2.css'));
await fs.copyFile(path.join(ROOT, 'src/v2/v2.js'), path.join(OUT, 'v2.js'));
await fs.copyFile(path.join(ROOT, 'src/v2/logic.mjs'), path.join(OUT, 'logic.mjs'));
console.log(`✓ /test/ preview: ${Object.keys(pages).length} pages (noindex), ${tiers.length} coupon tiers, live products ${LIVE.live}/${fixtureProducts.length}`);
