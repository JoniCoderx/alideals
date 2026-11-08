// Cloudflare Worker: "צייד הדילים" API for yeshdeal.com
//   GET /api/cheapest?url=<AliExpress product link or id>
// Secrets (wrangler secret put): ALI_APP_KEY, ALI_APP_SECRET, ALI_TRACKING_ID
// Vars (wrangler.toml): ALLOWED_ORIGIN
import { parseProductInput, extractIdFromUrl, keywordsFromTitle, normalizeProduct, rankAlternatives } from '../../scripts/cheapest-lib.mjs';

const GATEWAY = 'https://api-sg.aliexpress.com/sync';
const FIELDS = 'product_id,product_title,product_main_image_url,sale_price,sale_price_currency,original_price,shop_id,sku_id,target_sale_price,target_original_price,target_sale_price_currency,target_app_sale_price,target_app_sale_price_currency,app_sale_price,discount,evaluate_rate,lastest_volume,shop_name,first_level_category_id,second_level_category_id,promotion_link';
const CACHE_TTL = 6 * 3600; // seconds
const RATE = { windowMs: 60_000, max: 12 }; // per IP per minute (per isolate – a soft guard)
const hits = new Map();

async function hmacHex(secret, msg) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(msg));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}

export async function aliCall(env, method, biz, fetchImpl = fetch) {
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

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(publishQueued(env).then((r) => console.log('telegram slot', JSON.stringify(r))).catch((e) => console.log('telegram slot error', e.message)));
    ctx.waitUntil(dispatchWorkflow(env).then((r) => console.log('clock dispatch', JSON.stringify(r))).catch((e) => console.log('clock error', e.message)));
  },
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const h = cors(env, req);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });
    if (url.pathname === '/health') return json({ ok: true, configured: !!(env.ALI_APP_KEY && env.ALI_APP_SECRET) }, 200, h);
    // Keyword search (Hebrew/English) – used by the 2.0 preview and for diagnostics. Short, cached, rate-limited by Cloudflare.
    if (url.pathname === '/api/search' && req.method === 'GET') {
      if (!env.ALI_APP_KEY || !env.ALI_APP_SECRET) return json({ error: 'not_configured' }, 503, h);
      const q = (url.searchParams.get('q') || '').trim().slice(0, 80);
      if (q.length < 2) return json({ error: 'bad_query' }, 400, h);
      try {
        const lang = url.searchParams.get('lang') === 'EN' ? 'EN' : 'HE';
        const r = await aliCall(env, 'aliexpress.affiliate.product.query', { target_currency: 'ILS', target_language: lang, tracking_id: env.ALI_TRACKING_ID, fields: FIELDS, keywords: q, ship_to_country: 'IL', page_size: 20, page_no: 1 });
        const items = (r?.products?.product || []).map(normalizeProduct);
        return json({ q, count: items.length, items, checkedAt: new Date().toISOString() }, 200, { ...h, 'Cache-Control': 'public, max-age=1800' });
      } catch (e) { return json({ error: 'api_error', message: String(e.message).slice(0, 200) }, 502, h); }
    }
    // Hebrew details for a short list of product ids (digits only, max 20).
    if (url.pathname === '/api/products' && req.method === 'GET') {
      if (!env.ALI_APP_KEY || !env.ALI_APP_SECRET) return json({ error: 'not_configured' }, 503, h);
      const ids = (url.searchParams.get('ids') || '').split(',').filter((x) => /^\d{6,20}$/.test(x)).slice(0, 20);
      if (!ids.length) return json({ error: 'bad_ids' }, 400, h);
      try {
        const lang = url.searchParams.get('lang') === 'EN' ? 'EN' : 'HE';
        const raw = url.searchParams.get('raw') === '1' && ids.length <= 3; // diagnostics: every field the API returns
        const r = await aliCall(env, 'aliexpress.affiliate.productdetail.get', { target_currency: 'ILS', target_language: lang, tracking_id: env.ALI_TRACKING_ID, ...(raw ? {} : { fields: FIELDS }), product_ids: ids.join(','), country: 'IL' });
        const list = r?.products?.product || [];
        if (raw) return json({ raw: list, checkedAt: new Date().toISOString() }, 200, h);
        return json({ items: list.map(normalizeProduct), checkedAt: new Date().toISOString() }, 200, { ...h, 'Cache-Control': 'public, max-age=1800' });
      } catch (e) { return json({ error: 'api_error', message: String(e.message).slice(0, 200) }, 502, h); }
    }
    if (url.pathname !== '/api/cheapest' || req.method !== 'GET') return json({ error: 'not_found' }, 404, h);
    if (!env.ALI_APP_KEY || !env.ALI_APP_SECRET) return json({ error: 'not_configured', message: 'השירות עוד לא הופעל.' }, 503, h);

    // Soft rate limit per IP.
    const ip = req.headers.get('CF-Connecting-IP') || 'anon';
    const now = Date.now();
    const rec = hits.get(ip) || { n: 0, t: now };
    if (now - rec.t > RATE.windowMs) { rec.n = 0; rec.t = now; }
    rec.n++; hits.set(ip, rec);
    if (rec.n > RATE.max) return json({ error: 'rate_limited', message: 'יותר מדי חיפושים. נסו שוב בעוד דקה.' }, 429, h);

    const input = url.searchParams.get('url') || '';
    if (input.length > 2000) return json({ error: 'bad_link', message: 'הקישור ארוך מדי.' }, 400, h);

    // Cache by product id (or by the raw input for short links).
    const parsed = parseProductInput(input);
    const cacheKey = new Request(`https://cache.yeshdeal/cheapest/v4/${parsed.id || encodeURIComponent(parsed.shortUrl || input)}`);
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
