// Cloudflare Worker: "צייד הדילים" API for yeshdeal.com
//   GET /api/cheapest?url=<AliExpress product link or id>
// Secrets (wrangler secret put): ALI_APP_KEY, ALI_APP_SECRET, ALI_TRACKING_ID
// Vars (wrangler.toml): ALLOWED_ORIGIN
import { parseProductInput, extractIdFromUrl, keywordsFromTitle, normalizeProduct, rankAlternatives } from '../../scripts/cheapest-lib.mjs';
import { classifyMatch } from '../../src/v2/logic.mjs';
import { collectReports, uhash, pickDailyDeal, dailyDealPost } from '../../scripts/telegram-bot.mjs';
import { reviewFlow } from '../../scripts/telegram-bot-flow.mjs';
import { publicReviews } from '../../src/reviews-view.mjs';

const GATEWAY = 'https://api-sg.aliexpress.com/sync';
const FIELDS = 'product_id,product_title,product_main_image_url,sale_price,sale_price_currency,original_price,shop_id,sku_id,target_sale_price,target_original_price,target_sale_price_currency,target_app_sale_price,target_app_sale_price_currency,app_sale_price,discount,evaluate_rate,lastest_volume,shop_name,first_level_category_id,second_level_category_id,promotion_link,commission_rate';
const CACHE_TTL = 6 * 3600; // seconds
const RATE = { windowMs: 60_000, max: 12 }; // per IP per minute (per isolate – a soft guard)
const hits = new Map();
// Per-IP, per-endpoint soft limit (per isolate). Old entries are pruned so the map can't grow forever.
function limited(req, bucket, max) {
  const now = Date.now();
  if (hits.size > 5000) for (const [k, v] of hits) if (now - v.t > RATE.windowMs) hits.delete(k);
  const key = `${bucket}:${req.headers.get('CF-Connecting-IP') || 'anon'}`;
  const rec = hits.get(key) || { n: 0, t: now };
  if (now - rec.t > RATE.windowMs) { rec.n = 0; rec.t = now; }
  rec.n++; hits.set(key, rec);
  return rec.n > max;
}
// Edge cache (caches.default): one AliExpress call serves everyone asking the same thing for `ttl` seconds.
async function cachedJSON(ctx, key, ttl, h, fn) {
  const cache = typeof caches !== 'undefined' ? caches.default : null;
  const req = new Request(`https://cache.yeshdeal/${key}`);
  if (cache) { const hit = await cache.match(req); if (hit) { const r = new Response(hit.body, hit); for (const [k, v] of Object.entries(h)) r.headers.set(k, v); r.headers.set('X-Cache', 'HIT'); return r; } }
  const { status, body } = await fn();
  const res = json(body, status, { ...h, 'Cache-Control': status === 200 ? `public, max-age=${ttl}` : 'no-store' });
  if (cache && status === 200) ctx.waitUntil(cache.put(req, res.clone()));
  return res;
}
const RATE_LIMITED = { error: 'rate_limited', message: 'יותר מדי בקשות. נסו שוב בעוד דקה.' };

async function hmacHex(secret, msg) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(msg));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}

// AliExpress allows ~1 call/second per app and answers "ApiCallLimit … ban 1 second" beyond it: wait and retry (max 2).
export async function aliCall(env, method, biz, fetchImpl = fetch) {
  for (let i = 0; ; i++) {
    try { return await aliCallOnce(env, method, biz, fetchImpl); }
    catch (e) { if (i >= 2 || !/ApiCallLimit|call limit|frequency|ban \d/i.test(String(e.message))) throw e; await new Promise((r) => setTimeout(r, 1100 * (i + 1))); }
  }
}
async function aliCallOnce(env, method, biz, fetchImpl = fetch) {
  const params = { method, app_key: String(env.ALI_APP_KEY).trim(), sign_method: 'sha256', timestamp: String(Date.now()) };
  for (const [k, v] of Object.entries(biz)) if (v !== undefined && v !== null && v !== '') params[k] = String(v);
  const base = Object.keys(params).sort().map((k) => k + params[k]).join('');
  params.sign = await hmacHex(String(env.ALI_APP_SECRET).trim(), base);
  const res = await fetchImpl(GATEWAY, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' }, body: new URLSearchParams(params).toString() });
  const json = await res.json();
  if (json.error_response) throw new Error(`${method}: ${json.error_response.code} ${json.error_response.msg || ''}`);
  const key = Object.keys(json).find((k) => k.endsWith('_response'));
  const rr = (key ? json[key] : json).resp_result || {};
  if (rr.resp_code && Number(rr.resp_code) !== 200) throw new Error(`${method}: ${rr.resp_code} ${rr.resp_msg || ''}`);
  return rr.result || {};
}

async function resolveShortLink(url, fetchImpl) {
  let current = url;
  for (let i = 0; i < 5; i++) {
    const r = await fetchImpl(current, { redirect: 'manual', headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' } });
    const loc = r.headers.get('location');
    const id = extractIdFromUrl(loc || '') || extractIdFromUrl(current);
    if (id) return id;
    if (!loc) {
      const html = await r.text().catch(() => '');
      return extractIdFromUrl(html);
    }
    current = new URL(loc, current).href;
  }
  return null;
}

export async function findCheapest(env, input, fetchImpl = fetch) {
  const parsed = parseProductInput(input);
  let id = parsed.id;
  if (!id && parsed.shortUrl) id = await resolveShortLink(parsed.shortUrl, fetchImpl);
  if (!id) return { status: 400, body: { error: 'bad_link', message: 'לא זיהינו קישור למוצר מעליאקספרס. הדביקו קישור לעמוד מוצר.' } };

  const common = { target_currency: 'ILS', target_language: 'HE', tracking_id: env.ALI_TRACKING_ID, fields: FIELDS };
  const detail = await aliCall(env, 'aliexpress.affiliate.productdetail.get', { ...common, product_ids: id, country: 'IL' }, fetchImpl);
  const raw = detail?.products?.product?.[0];
  if (!raw) return { status: 404, body: { error: 'not_found', message: 'המוצר לא נמצא או שאינו זמין למשלוח לישראל.' } };
  const original = normalizeProduct(raw);

  // English title gives far better keyword search than the machine-translated Hebrew one.
  // The API allows ~1 call/second per app ("ApiCallLimit ... ban 1 second"): retry once after a short pause.
  const enCall = () => aliCall(env, 'aliexpress.affiliate.productdetail.get', { ...common, target_language: 'EN', product_ids: id, country: 'IL' }, fetchImpl).catch(() => null);
  let en = await enCall();
  if (!en?.products?.product?.[0]?.product_title) { await new Promise((r) => setTimeout(r, 1100)); en = await enCall(); }
  const enTitle = en?.products?.product?.[0]?.product_title || original.title;

  // AliExpress answers "405 The result is empty" for zero hits – that is a valid "no matches", not an outage.
  // Try the specific query first, then broader ones (fewer keywords, then without the category).
  const query = async (keywords, cat) => {
    try {
      const r = await aliCall(env, 'aliexpress.affiliate.product.query', { ...common, target_language: 'EN', keywords, category_ids: cat || undefined, sort: 'SALE_PRICE_ASC', ship_to_country: 'IL', page_size: 50, page_no: 1 }, fetchImpl);
      return r?.products?.product || [];
    } catch (e) { if (/result is empty/i.test(String(e.message))) return []; throw e; }
  };
  const kw = keywordsFromTitle(enTitle);
  const short = kw.split(' ').slice(0, 4).join(' ');
  let found = await query(kw, original.categoryId);
  if (!found.length && short !== kw) found = await query(short, original.categoryId);
  if (!found.length) found = await query(short, null);
  const candidates = found.map(normalizeProduct);
  // Compare against the English title too (candidates come back in Hebrew/English depending on availability).
  const ranked = rankAlternatives({ ...original, title: `${original.title} ${enTitle}` }, candidates);
  const cheaper = ranked.filter((c) => original.price == null || c.price < original.price);

  // Make sure the original also has an affiliate link.
  if (!original.link) {
    const gen = await aliCall(env, 'aliexpress.affiliate.link.generate', { promotion_link_type: 0, source_values: `https://www.aliexpress.com/item/${id}.html`, tracking_id: env.ALI_TRACKING_ID }, fetchImpl).catch(() => null);
    original.link = gen?.promotion_links?.promotion_link?.[0]?.promotion_link || '';
  }
  // v2: a wider pool (related listings, any price) classified on the sellers' ORIGINAL English titles
  // (machine-translated Hebrew differs per listing). Hebrew titles are attached for display only.
  original.enTitle = enTitle;
  const pool = rankAlternatives({ ...original, title: enTitle }, candidates.filter((c) => c.id !== original.id), { minSimilarity: 0.25, minRating: 0, minSold: 0, limit: 12 })
    .map((c) => ({ ...c, enTitle: c.title }));
  if (pool.length) {
    const he = await aliCall(env, 'aliexpress.affiliate.productdetail.get', { ...common, product_ids: pool.map((c) => c.id).join(','), country: 'IL' }, fetchImpl).catch(() => null);
    const byId = Object.fromEntries((he?.products?.product || []).map((p) => [String(p.product_id), p]));
    for (const c of pool) {
      const h = byId[c.id];
      if (h) { c.title = h.product_title || c.title; c.price = Number(h.target_sale_price) || c.price; c.link = h.promotion_link || c.link; }
    }
  }
  // Confidence on the sellers' English titles: exact (shared model, no conflicts) / likely / similar.
  for (const c of pool) { const m = classifyMatch({ title: enTitle }, { title: c.enTitle || c.title }); c.level = m.level; c.reasons = m.reasons; }
  return { status: 200, body: { original, alternatives: cheaper, pool, checked: candidates.length, at: new Date().toISOString() } };
}

function cors(env, req) {
  const origin = req.headers.get('Origin') || '';
  const allowed = (env.ALLOWED_ORIGIN || 'https://yeshdeal.com').split(',').map((s) => s.trim());
  return {
    'Access-Control-Allow-Origin': allowed.includes(origin) ? origin : allowed[0],
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  };
}

const json = (body, status, headers) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers } });

/** Hourly clock: dispatch the GitHub workflow (site refresh + Telegram slot). */
export async function dispatchWorkflow(env, fetchImpl = fetch) {
  if (!env.GH_DISPATCH_TOKEN || !env.GH_REPO) return { skipped: true };
  const r = await fetchImpl(`https://api.github.com/repos/${env.GH_REPO}/actions/workflows/deploy.yml/dispatches`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.GH_DISPATCH_TOKEN}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'yeshdeal-clock', 'Content-Type': 'application/json' },
    body: JSON.stringify({ ref: 'main', inputs: { source: 'clock' } }),
  });
  return { status: r.status };
}

/** Israel-time date + hour for a given instant. */
export function israelNow(d = new Date()) {
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(d);
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', hour: 'numeric', hour12: false }).format(d)) % 24;
  return { date, hour };
}

/** Hourly: publish the Telegram post planned (by CI) for this Israel-time slot, if any. */
export async function publishQueued(env, now = new Date(), fetchImpl = fetch) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TG_CHAT || !env.SITE_URL) return { skipped: 'not configured' };
  const { date, hour } = israelNow(now);
  const res = await fetchImpl(`${env.SITE_URL}/tg-queue/queue.json?t=${Date.now()}`, { cf: { cacheTtl: 0 } });
  if (!res.ok) return { error: `queue ${res.status}` };
  const { items = [] } = await res.json();
  const item = items.find((i) => i.date === date && i.hour === hour);
  if (!item) return { none: `${date} ${hour}` };
  const api = (method, body) => fetchImpl(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json());
  const markup = { inline_keyboard: item.buttons || [] };
  let r = item.img
    ? await api('sendPhoto', { chat_id: env.TG_CHAT, photo: `${env.SITE_URL}/tg-queue/${item.img}?v=${encodeURIComponent(item.key)}`, caption: item.text, parse_mode: 'HTML', reply_markup: markup })
    : { ok: false };
  if (!r.ok) r = await api('sendMessage', { chat_id: env.TG_CHAT, text: item.text, parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: markup });
  return { posted: item.key, ok: !!r.ok, error: r.ok ? undefined : r.description };
}



/* ---------------- Price tracking (KV) → "today's deals" + price-drop alerts ----------------
 * Every 6 hours: the tracked products (site /tracked.json) get their live price recorded (one point per Israel day,
 * the lowest seen). Every 3 hours: products people asked to watch are checked; a drop of 5%+ sends a bot message. */
const ilDay = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date());
async function livePrices(env, ids) {
  const out = {};
  for (let i = 0; i < ids.length; i += 20) {
    const chunk = ids.slice(i, i + 20);
    const r = await aliCall(env, 'aliexpress.affiliate.productdetail.get', { target_currency: 'ILS', target_language: 'HE', tracking_id: env.ALI_TRACKING_ID, fields: FIELDS, product_ids: chunk.join(','), country: 'IL' }).catch(() => null);
    for (const p of r?.products?.product || []) { const n = normalizeProduct(p); if (n.price) out[n.id] = n; }
    await new Promise((ok) => setTimeout(ok, 1100));
  }
  return out;
}
async function trackPrices(env) {
  if (!env.BOT) return { skipped: 'no kv' };
  const site = env.SITE_URL || 'https://yeshdeal.com';
  const tracked = await (await fetch(`${site}/tracked.json`, { cf: { cacheTtl: 600 } })).json().catch(() => ({}));
  const ids = (tracked.ids || []).slice(0, 120);
  const titles = tracked.titles || {};
  if (!ids.length) return { skipped: 'no ids' };
  const live = await livePrices(env, ids);
  const hist = (await env.BOT.get('prices', 'json')) || {};
  const day = ilDay();
  for (const [id, p] of Object.entries(live)) {
    const h = (hist[id]?.h || []).filter((x) => x.d !== day || x.p <= p.price);
    if (!h.some((x) => x.d === day)) h.push({ d: day, p: p.price });
    hist[id] = { t: titles[id] || p.title, img: p.image, l: p.link, r: p.rating, s: p.sold, o: p.originalPrice, h: h.slice(-21) };
  }
  await env.BOT.put('prices', JSON.stringify(hist));
  return { tracked: Object.keys(live).length };
}
// Real drops: today's price vs the highest price we recorded in the previous 7 days.
async function dealsToday(env) {
  const hist = (await env.BOT?.get('prices', 'json')) || {};
  const day = ilDay();
  const items = [];
  for (const [id, x] of Object.entries(hist)) {
    const now = x.h.find((p) => p.d === day) || x.h[x.h.length - 1];
    const before = x.h.filter((p) => p.d < now.d).slice(-7);
    if (!before.length) continue;
    const max = Math.max(...before.map((p) => p.p));
    const drop = Math.round((1 - now.p / max) * 100);
    if (drop >= 3) items.push({ id, title: x.t, image: x.img, link: x.l, rating: x.r, sold: x.s, price: now.p, was: max, drop, since: before[0].d });
  }
  return items.sort((a, b) => b.drop - a.drop).slice(0, 24);
}
// "המציאה של היום": at 21:00 Israel time the biggest real drop (re-checked live) replaces the night post.
// At most one a day; the same product isn't posted again for 14 days. No qualifying drop → the regular post goes out.
const DEAL_HOUR = 21;
export async function postDailyDeal(env) {
  if (!env.BOT || !env.TELEGRAM_BOT_TOKEN || !env.TG_CHAT) return { skipped: 'not configured' };
  const today = ilDay();
  const st = (await env.BOT.get('dotd', 'json')) || { posted: {} };
  if (st.last === today) return { skipped: 'already posted today' };
  const list = await dealsToday(env);
  let pick = null;
  for (let i = 0; i < 3; i++) {
    const cand = pickDailyDeal(list, { posted: st.posted, today });
    if (!cand) break;
    const live = (await livePrices(env, [cand.id]))[cand.id];
    if (live && live.price <= cand.price * 1.02 && live.price < cand.was * 0.92) { pick = { ...cand, price: live.price }; break; }
    list.splice(list.indexOf(cand), 1); // the price went back up since it was recorded: try the next one
  }
  if (!pick) return { none: 'no real drop today' };
  const site = env.SITE_URL || 'https://yeshdeal.com';
  const link = await shortAff(env, pick.id, pick.link);
  const post = dailyDealPost({ ...pick, link }, { site, today });
  const api = (method, body) => fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json());
  const markup = { inline_keyboard: post.buttons };
  let r = pick.image ? await api('sendPhoto', { chat_id: env.TG_CHAT, photo: pick.image, caption: post.text, parse_mode: 'HTML', reply_markup: markup }) : { ok: false };
  if (!r.ok) r = await api('sendMessage', { chat_id: env.TG_CHAT, text: post.text, parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: markup });
  if (!r.ok) return { error: r.description };
  const keep = Object.fromEntries(Object.entries(st.posted).filter(([, d]) => d >= new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)));
  await env.BOT.put('dotd', JSON.stringify({ last: today, posted: { ...keep, [pick.id]: today } }));
  return { posted: pick.id, drop: post.drop };
}
async function checkWatches(env) {
  if (!env.BOT || !env.TELEGRAM_BOT_TOKEN) return { skipped: true };
  let watches = (await env.BOT.get('watch', 'json')) || [];
  const day = ilDay();
  watches = watches.filter((w) => w.until >= day);
  if (!watches.length) { await env.BOT.put('watch', '[]'); return { watches: 0 }; }
  const live = await livePrices(env, [...new Set(watches.map((w) => w.id))].slice(0, 100));
  let sent = 0;
  for (const w of watches) {
    const p = live[w.id];
    if (!p || !(p.price <= w.price * 0.95)) continue;
    const link = await shortAff(env, w.id, p.link);
    await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
      chat_id: w.chat, parse_mode: 'HTML', disable_web_page_preview: true,
      text: `<b>המחיר ירד! 🔔</b>\n\n${escH(String(p.title || w.title).slice(0, 90))}\n<b>${ilsT(p.price)}</b> במקום ${ilsT(w.price)} (−${Math.round((1 - p.price / w.price) * 100)}%)\n\nמחירים לפני משלוח ומע״מ. אל תשכחו קוד קופון לפי סכום העגלה.`,
      reply_markup: { inline_keyboard: [[{ text: 'לקנייה במחיר הזה 🛒', url: link }], [{ text: 'להפסיק לעקוב 🔕', callback_data: `al:rm:${w.id}` }]] },
    }) }).catch(() => {});
    w.price = p.price; sent++;
  }
  await env.BOT.put('watch', JSON.stringify(watches));
  return { watches: watches.length, sent };
}

/* ---------------- Telegram bot (real time, via webhook) ----------------
 * Telegram POSTs every message to /tg/webhook (set by the deploy workflow when the BOT KV namespace exists).
 * Reviews and code reports are stored in KV ("state") and the site pulls them from /api/bot-state on each build. */
async function webhookSecret(token) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(token)));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}
const ilToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date());

/* ---------------- Deal Hunter inside the bot: send a product link, get the verdict + affiliate link ---------------- */
const escH = (t) => String(t ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const ilsT = (n) => `₪${Number(n).toLocaleString('he-IL', { maximumFractionDigits: 2 })}`;
async function liveCodes(env) {
  try {
    const r = await fetch(`${env.SITE_URL || 'https://yeshdeal.com'}/codes.json`, { cf: { cacheTtl: 600 } });
    const j = await r.json();
    const now = new Date();
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(now);
    const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', hour: 'numeric', hour12: false }).format(now));
    return (j.codes || []).filter((c) => !c.x || c.x > today || (c.x === today && hour < 23));
  } catch { return []; }
}
async function shortAff(env, id, fallback) {
  try {
    const r = await aliCall(env, 'aliexpress.affiliate.link.generate', { promotion_link_type: 0, source_values: `https://www.aliexpress.com/item/${id}.html`, tracking_id: env.ALI_TRACKING_ID });
    const l = r?.promotion_links?.promotion_link?.[0]?.promotion_link;
    return /^https:\/\/s\.click\.aliexpress\.com\//.test(l || '') ? l : fallback;
  } catch { return fallback; }
}
export async function hunterReply(env, text) {
  const site = env.SITE_URL || 'https://yeshdeal.com';
  const { status, body } = await findCheapest(env, text);
  if (status !== 200 || !body?.original) return { text: `${escH(body?.message || 'לא הצלחנו לזהות את המוצר. שלחו קישור מלא לעמוד המוצר בעליאקספרס.')}` };
  const o = body.original;
  const pool = (body.pool || []).filter((c) => c.price != null && c.link);
  const same = pool.filter((c) => c.level === 'exact' || c.level === 'likely').sort((a, b) => a.price - b.price);
  const cheaper = same.length && o.price != null && same[0].price < o.price - 0.5 ? same[0] : null;
  const t = cheaper || o;
  const link = await shortAff(env, t.id, t.link);
  const title = escH(String(o.title || '').slice(0, 90));
  let msg;
  if (cheaper) msg = `<b>מצאנו זול יותר ב־${ilsT(Math.round((o.price - cheaper.price) * 100) / 100)}! 🎯</b>\n\n${title}\n${cheaper.level === 'exact' ? 'אותו דגם' : 'כנראה אותו מוצר (בדקו גרסה וצבע)'} אצל ${escH(cheaper.shop || 'מוכר אחר')}: <b>${ilsT(cheaper.price)}</b> במקום ${ilsT(o.price)}`;
  else if (same.length) msg = `<b>אתם ציידים! זה המחיר הכי טוב שמצאנו 🎯</b>\n\n${title}\n<b>${ilsT(o.price)}</b> · השווינו ל${same.length === 1 ? 'הצעה נוספת של אותו מוצר' : `־${same.length} הצעות של אותו מוצר`}, ואף אחת לא זולה יותר.`;
  else msg = `<b>לא מצאנו את אותו מוצר אצל מוכרים אחרים</b>\n\n${title}\n<b>${ilsT(o.price)}</b> · אבל יש דרך לשלם עליו פחות:`;
  // Real coupon estimate: the best code whose minimum the price meets (codes are checked in USD)
  const codes = await liveCodes(env);
  const rate = o.usd ? o.price / o.usd : 3.2;
  const usd = t.usd || (t.price / rate);
  const fit = codes.filter((c) => c.m <= usd).sort((a, b) => b.d - a.d)[0];
  if (fit) msg += `\n\nעם הקוד <code>${escH(fit.code)}</code> זה יוצא בערך <b>${ilsT(Math.max(0, Math.round((t.price - fit.d * rate) * 100) / 100))}</b> 💰\n(ההנחה של $${fit.d} יורדת בקופה. לחיצה על הקוד מעתיקה אותו)`;
  else if (codes.length) { const first = codes.slice().sort((a, b) => a.m - b.m)[0]; msg += `\n\nהוסיפו לעגלה עוד כ־${ilsT(Math.ceil((first.m - usd) * rate))} ותוכלו להשתמש בקוד <code>${escH(first.code)}</code> ($${first.d} הנחה) 💡`; }
  msg += '\n\nמחירים לפני משלוח ומע״מ, ועשויים להשתנות.';
  return { text: msg, html: true, buttons: [[{ text: cheaper ? 'לקנייה במחיר הזה 🛒' : 'לקנייה בעליאקספרס 🛒', url: link }], [{ text: 'תודיעו לי כשהמחיר יורד 🔔', callback_data: `al:add:${t.id}:${Math.round(t.price * 100)}` }], [{ text: 'כל התוצאות באתר 🔎', url: `${site}/finder/?url=${encodeURIComponent(`https://www.aliexpress.com/item/${o.id}.html`)}` }]] };
}

async function handleBot(req, env, ctx) {
  if (!env.BOT || !env.TELEGRAM_BOT_TOKEN) return new Response('off', { status: 503 });
  if (req.headers.get('X-Telegram-Bot-Api-Secret-Token') !== await webhookSecret(env.TELEGRAM_BOT_TOKEN)) return new Response('forbidden', { status: 403 });
  const update = await req.json().catch(() => null);
  if (!update?.message && !update?.callback_query) return new Response('ok');
  const today = ilToday();
  const site = env.SITE_URL || 'https://yeshdeal.com';
  const state = (await env.BOT.get('state', 'json')) || { reviews: [], flow: {}, reports: {} };
  var tg = (method, body) => fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => {});
  // 0) a product link → Deal Hunter (answered in the background so Telegram gets its 200 at once)
  const mtext = (update.message?.text || '').trim();
  const flowStep = state.flow?.[uhash(update.message?.from?.id ?? 0)]?.step;
  if (update.message?.chat?.type === 'private' && /aliexpress\.|^\d{10,20}$/i.test(mtext) && flowStep !== 'text' && flowStep !== 'custom') {
    const chatId = update.message.chat.id;
    const work = (async () => {
      await tg('sendMessage', { chat_id: chatId, text: 'הצייד יצא לציד 🎯 סורק מוכרים, כמה שניות…' });
      const r = await hunterReply(env, mtext).catch(() => ({ text: 'עליאקספרס לא ענתה כרגע. נסו שוב בעוד דקה 🙏' }));
      await tg('sendMessage', { chat_id: chatId, text: r.text, disable_web_page_preview: true, ...(r.html ? { parse_mode: 'HTML' } : {}), ...(r.buttons ? { reply_markup: { inline_keyboard: r.buttons } } : {}) });
    })();
    if (ctx?.waitUntil) ctx.waitUntil(work); else await work;
    return new Response('ok');
  }
  // 0b) price-alert buttons
  const cbd = update.callback_query?.data || '';
  if (/^al:(add|rm):\d{6,20}/.test(cbd)) {
    const [, act, id, cents] = cbd.split(':');
    const chatId = update.callback_query.message?.chat?.id;
    let watches = (await env.BOT.get('watch', 'json')) || [];
    let note;
    if (act === 'add') {
      const mine = watches.filter((w) => w.chat === chatId);
      if (mine.some((w) => w.id === id)) note = 'כבר עוקבים אחרי המוצר הזה 👍';
      else if (mine.length >= 10) note = 'אפשר לעקוב אחרי עד 10 מוצרים בו זמנית.';
      else {
        const until = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
        watches.push({ chat: chatId, id, price: Number(cents) / 100, until });
        note = 'סגור! נודיע לכם כאן אם המחיר יורד ב־5% או יותר (מעקב ל־30 יום) 🔔';
      }
    } else { watches = watches.filter((w) => !(w.chat === chatId && w.id === id)); note = 'הפסקנו לעקוב אחרי המוצר 🔕'; }
    await env.BOT.put('watch', JSON.stringify(watches));
    await tg('answerCallbackQuery', { callback_query_id: update.callback_query.id });
    if (chatId) await tg('sendMessage', { chat_id: chatId, text: note });
    return new Response('ok');
  }
  // 1) the review conversation (buttons + text)
  const rf = reviewFlow(update, state, { today, site });
  let next = rf.state;
  const out = [...rf.out];
  // 2) "לא עבד לכם? דווחו" links (/start r_CODE) and a friendly reply to anything else
  if (!rf.handled && update.message) {
    const rep = collectReports([update], { reports: next.reports || {}, codes: null, today });
    next = { ...next, reports: rep.reports };
    const TXT = {
      thanks: (c) => `תודה על הדיווח! 🙏\nרשמנו שהקוד ${c} לא עבד לכם. אם כמה גולשים מדווחים על אותו קוד, נסמן אותו באתר ונבדוק אותו.\n\nבינתיים כדאי לנסות קוד ממדרגה אחרת 👇`,
      unknown: () => 'תודה! הקודים העדכניים באתר 👇',
      hello: () => 'היי! 👋 אני הבוט של יש דיל!\n\n🎯 שלחו לי קישור למוצר מעליאקספרס, ואבדוק אם יש אותו זול יותר וכמה הוא יוצא עם קוד קופון.\n✍️ או כתבו לנו ביקורת.',
    };
    const r = rep.replies[0] || (update.message.chat?.type === 'private' ? { chat: update.message.chat.id, kind: 'hello' } : null);
    if (r) out.push({ chat: r.chat, text: TXT[r.kind](r.code), buttons: [[{ text: '🔥 כל הקודים', url: `${site}/#codes` }], [{ text: '✍️ כתיבת ביקורת', callback_data: 'rv:go' }]] });
  }
  await env.BOT.put('state', JSON.stringify({ ...next, at: new Date().toISOString() }));
  for (const o of out.slice(0, 3)) {
    if (o.answer) { await tg('answerCallbackQuery', { callback_query_id: o.answer }); continue; }
    await tg('sendMessage', { chat_id: o.chat, text: o.text, disable_web_page_preview: true, ...(o.buttons ? { reply_markup: { inline_keyboard: o.buttons } } : {}) });
  }
  return new Response('ok');
}

export default {
  async scheduled(event, env, ctx) {
    const ilHour = israelNow(new Date(event.scheduledTime || Date.now())).hour;
    const deal = ilHour === DEAL_HOUR ? postDailyDeal(env).catch((e) => ({ error: e.message })) : Promise.resolve(null);
    ctx.waitUntil(deal.then((d) => { if (d) console.log('daily deal', JSON.stringify(d)); return d?.posted ? { replacedBy: 'daily deal' } : publishQueued(env); })
      .then((r) => console.log('telegram slot', JSON.stringify(r))).catch((e) => console.log('telegram slot error', e.message)));
    ctx.waitUntil(dispatchWorkflow(env).then((r) => console.log('clock dispatch', JSON.stringify(r))).catch((e) => console.log('clock error', e.message)));
    const hr = new Date(event.scheduledTime || Date.now()).getUTCHours();
    if (hr % 6 === 3) ctx.waitUntil(trackPrices(env).then((r) => console.log('prices', JSON.stringify(r))).catch((e) => console.log('prices error', e.message)));
    if (hr % 3 === 1) ctx.waitUntil(checkWatches(env).then((r) => console.log('watches', JSON.stringify(r))).catch((e) => console.log('watch error', e.message)));
  },
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const h = cors(env, req);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });
    if (url.pathname === '/tg/webhook' && req.method === 'POST') return handleBot(req, env, ctx);
    if (url.pathname === '/api/deals-today' && req.method === 'GET') return json({ items: await dealsToday(env), at: new Date().toISOString() }, 200, { ...h, 'Cache-Control': 'no-store' });
    if (url.pathname === '/api/track-now' && req.method === 'POST') {
      if (!env.TELEGRAM_BOT_TOKEN || req.headers.get('X-Key') !== await webhookSecret(env.TELEGRAM_BOT_TOKEN)) return json({ error: 'forbidden' }, 403, h);
      return json(await trackPrices(env), 200, h);
    }
    // Preview of the bot's Deal Hunter answer (same text/buttons the bot sends) – for QA.
    if (url.pathname === '/api/hunter-preview' && req.method === 'GET') {
      if (limited(req, 'cheapest', RATE.max)) return json(RATE_LIMITED, 429, h);
      try { return json(await hunterReply(env, url.searchParams.get('url') || ''), 200, h); }
      catch (e) { return json({ error: 'api_error', message: String(e.message).slice(0, 200) }, 502, h); }
    }
    // Public, de-duplicated reviews for the site (refreshed on page load, so a new review shows within a minute)
    if (url.pathname === '/api/reviews' && req.method === 'GET') {
      if (!env.BOT) return json({ reviews: [] }, 200, h);
      const st = (await env.BOT.get('state', 'json')) || {};
      return json({ reviews: publicReviews(st.reviews || []).slice(0, 9), total: publicReviews(st.reviews || []).length }, 200, { ...h, 'Cache-Control': 'public, max-age=60' });
    }
    // Reviews + code reports for the site build (public data only: first names, texts, hashes).
    if (url.pathname === '/api/bot-state' && req.method === 'GET') {
      if (!env.BOT) return json({ error: 'off' }, 503, h);
      const st = (await env.BOT.get('state', 'json')) || {};
      return json({ reviews: st.reviews || [], reports: st.reports || {}, at: st.at || null }, 200, { ...h, 'Cache-Control': 'no-store' });
    }
    if (url.pathname === '/health') return json({ ok: true, configured: !!(env.ALI_APP_KEY && env.ALI_APP_SECRET) }, 200, h);
    // Keyword search (Hebrew/English) – used by the 2.0 preview and for diagnostics. Short, cached, rate-limited by Cloudflare.
    if (url.pathname === '/api/search' && req.method === 'GET') {
      if (!env.ALI_APP_KEY || !env.ALI_APP_SECRET) return json({ error: 'not_configured' }, 503, h);
      const q = (url.searchParams.get('q') || '').trim().slice(0, 80);
      if (q.length < 2) return json({ error: 'bad_query' }, 400, h);
      if (limited(req, 'search', 20)) return json(RATE_LIMITED, 429, h);
      const lang = url.searchParams.get('lang') === 'EN' ? 'EN' : 'HE';
      try {
        // sort=volume: best sellers first, and only listings with a real track record (88%+ positive reviews, 50+ sold).
        const best = url.searchParams.get('sort') === 'volume';
        return await cachedJSON(ctx, `search/v2/${lang}/${best ? 'best' : 'all'}/${encodeURIComponent(q.toLowerCase())}`, 1800, h, async () => {
          const r = await aliCall(env, 'aliexpress.affiliate.product.query', { target_currency: 'ILS', target_language: lang, tracking_id: env.ALI_TRACKING_ID, fields: FIELDS, keywords: q, ship_to_country: 'IL', page_size: best ? 50 : 20, page_no: 1, ...(best ? { sort: 'LAST_VOLUME_DESC' } : {}) });
          let items = (r?.products?.product || []).map(normalizeProduct);
          if (best) items = items.filter((p) => p.price > 0 && p.link && (p.rating || 0) >= 88 && p.sold >= 50).slice(0, 20);
          return { status: 200, body: { q, count: items.length, items, checkedAt: new Date().toISOString() } };
        });
      } catch (e) { return json({ error: 'api_error', message: String(e.message).slice(0, 200) }, 502, h); }
    }
    // Hebrew details for a short list of product ids (digits only, max 20).
    if (url.pathname === '/api/products' && req.method === 'GET') {
      if (!env.ALI_APP_KEY || !env.ALI_APP_SECRET) return json({ error: 'not_configured' }, 503, h);
      const ids = (url.searchParams.get('ids') || '').split(',').filter((x) => /^\d{6,20}$/.test(x)).slice(0, 20);
      if (!ids.length) return json({ error: 'bad_ids' }, 400, h);
      if (limited(req, 'products', 40)) return json(RATE_LIMITED, 429, h);
      const lang = url.searchParams.get('lang') === 'EN' ? 'EN' : 'HE';
      const raw = url.searchParams.get('raw') === '1' && ids.length <= 3; // diagnostics: every field the API returns
      const call = () => aliCall(env, 'aliexpress.affiliate.productdetail.get', { target_currency: 'ILS', target_language: lang, tracking_id: env.ALI_TRACKING_ID, ...(raw ? {} : { fields: FIELDS }), product_ids: ids.join(','), country: 'IL' });
      try {
        if (raw) { const r = await call(); return json({ raw: r?.products?.product || [], checkedAt: new Date().toISOString() }, 200, h); }
        return await cachedJSON(ctx, `products/v2/${lang}/${[...ids].sort().join(',')}`, 1800, h, async () => {
          let r = await call().catch(() => null);
          if (!r) { await new Promise((ok) => setTimeout(ok, 1100)); r = await call(); } // 1 call/s API limit: retry once
          return { status: 200, body: { items: (r?.products?.product || []).map(normalizeProduct), checkedAt: new Date().toISOString() } };
        });
      } catch (e) { return json({ error: 'api_error', message: String(e.message).slice(0, 200) }, 502, h); }
    }
    // Short affiliate link (s.click.aliexpress.com/e/_xxx) for a product id – long /s/ links look suspicious in Telegram/Facebook.
    if (url.pathname === '/api/shortlink' && req.method === 'GET') {
      const id = (url.searchParams.get('id') || '').trim();
      if (!/^\d{6,20}$/.test(id)) return json({ error: 'bad_id' }, 400, h);
      if (!env.ALI_APP_KEY || !env.ALI_APP_SECRET) return json({ error: 'not_configured' }, 503, h);
      if (limited(req, 'shortlink', 30)) return json(RATE_LIMITED, 429, h);
      try {
        return await cachedJSON(ctx, `shortlink/v1/${id}`, 7 * 86400, h, async () => {
          const r = await aliCall(env, 'aliexpress.affiliate.link.generate', { promotion_link_type: 0, source_values: `https://www.aliexpress.com/item/${id}.html`, tracking_id: env.ALI_TRACKING_ID });
          const link = r?.promotion_links?.promotion_link?.[0]?.promotion_link || '';
          return /^https:\/\/s\.click\.aliexpress\.com\//.test(link) ? { status: 200, body: { id, link } } : { status: 502, body: { error: 'no_link' } };
        });
      } catch (e) { return json({ error: 'api_error', message: String(e.message).slice(0, 200) }, 502, h); }
    }
    // Light short-link → product id resolver (the admin link maker). No AliExpress API call.
    if (url.pathname === '/api/resolve' && req.method === 'GET') {
      if (limited(req, 'resolve', 30)) return json(RATE_LIMITED, 429, h);
      const parsed = parseProductInput(url.searchParams.get('url') || '');
      if (!parsed.id && !parsed.shortUrl) return json({ error: 'bad_link' }, 400, h);
      const id = parsed.id || (parsed.shortUrl ? await resolveShortLink(parsed.shortUrl, fetch).catch(() => null) : null);
      return id ? json({ id }, 200, { ...h, 'Cache-Control': 'public, max-age=86400' }) : json({ error: 'not_found' }, 404, h);
    }
    if (url.pathname !== '/api/cheapest' || req.method !== 'GET') return json({ error: 'not_found' }, 404, h);
    if (!env.ALI_APP_KEY || !env.ALI_APP_SECRET) return json({ error: 'not_configured', message: 'השירות עוד לא הופעל.' }, 503, h);

    // Soft rate limit per IP.
    if (limited(req, 'cheapest', RATE.max)) return json({ error: 'rate_limited', message: 'יותר מדי חיפושים. נסו שוב בעוד דקה.' }, 429, h);

    const input = url.searchParams.get('url') || '';
    if (input.length > 2000) return json({ error: 'bad_link', message: 'הקישור ארוך מדי.' }, 400, h);

    // Cache by product id (or by the raw input for short links).
    const parsed = parseProductInput(input);
    const cacheKey = new Request(`https://cache.yeshdeal/cheapest/v5/${parsed.id || encodeURIComponent(parsed.shortUrl || input)}`);
    const cache = typeof caches !== 'undefined' ? caches.default : null;
    if (cache) { const hit = await cache.match(cacheKey); if (hit) { const r = new Response(hit.body, hit); for (const [k, v] of Object.entries(h)) r.headers.set(k, v); return r; } }

    try {
      const { status, body } = await findCheapest(env, input);
      const res = json(body, status, { ...h, 'Cache-Control': status === 200 ? `public, max-age=${CACHE_TTL}` : 'no-store' });
      if (cache && status === 200) ctx.waitUntil(cache.put(cacheKey, res.clone()));
      return res;
    } catch (e) {
      return json({ error: 'upstream', message: 'עליאקספרס לא ענתה כרגע. נסו שוב בעוד רגע.', detail: String(e.message).slice(0, 200) }, 502, h);
    }
  },
};
