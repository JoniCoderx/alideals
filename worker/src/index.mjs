// Cloudflare Worker: "צייד הדילים" API for yeshdeal.com
//   GET /api/cheapest?url=<AliExpress product link or id>
// Secrets (wrangler secret put): ALI_APP_KEY, ALI_APP_SECRET, ALI_TRACKING_ID
// Vars (wrangler.toml): ALLOWED_ORIGIN
import { parseProductInput, extractIdFromUrl, keywordsFromTitle, normalizeProduct, rankAlternatives } from '../../scripts/cheapest-lib.mjs';

const GATEWAY = 'https://api-sg.aliexpress.com/sync';
const FIELDS = 'product_id,product_title,product_main_image_url,target_sale_price,target_original_price,target_sale_price_currency,evaluate_rate,lastest_volume,shop_name,first_level_category_id,second_level_category_id,promotion_link';
const CACHE_TTL = 6 * 3600; // seconds
const RATE = { windowMs: 60_000, max: 12 }; // per IP per minute (per isolate – a soft guard)
const hits = new Map();

async function hmacHex(secret, msg) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(msg));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}

export async function aliCall(env, method, biz, fetchImpl = fetch) {
  const params = { method, app_key: env.ALI_APP_KEY, sign_method: 'sha256', timestamp: String(Date.now()) };
  for (const [k, v] of Object.entries(biz)) if (v !== undefined && v !== null && v !== '') params[k] = String(v);
  const base = Object.keys(params).sort().map((k) => k + params[k]).join('');
  params.sign = await hmacHex(env.ALI_APP_SECRET, base);
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
  const en = await aliCall(env, 'aliexpress.affiliate.productdetail.get', { ...common, target_language: 'EN', product_ids: id, country: 'IL' }, fetchImpl).catch(() => null);
  const enTitle = en?.products?.product?.[0]?.product_title || original.title;

  const search = await aliCall(env, 'aliexpress.affiliate.product.query', {
    ...common,
    keywords: keywordsFromTitle(enTitle),
    category_ids: original.categoryId || undefined,
    sort: 'SALE_PRICE_ASC',
    ship_to_country: 'IL',
    page_size: 50,
    page_no: 1,
  }, fetchImpl);
  const candidates = (search?.products?.product || []).map(normalizeProduct);
  // Compare against the English title too (candidates come back in Hebrew/English depending on availability).
  const ranked = rankAlternatives({ ...original, title: `${original.title} ${enTitle}` }, candidates);
  const cheaper = ranked.filter((c) => original.price == null || c.price < original.price);

  // Make sure the original also has an affiliate link.
  if (!original.link) {
    const gen = await aliCall(env, 'aliexpress.affiliate.link.generate', { promotion_link_type: 0, source_values: `https://www.aliexpress.com/item/${id}.html`, tracking_id: env.ALI_TRACKING_ID }, fetchImpl).catch(() => null);
    original.link = gen?.promotion_links?.promotion_link?.[0]?.promotion_link || '';
  }
  return { status: 200, body: { original, alternatives: cheaper, checked: candidates.length, at: new Date().toISOString() } };
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

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const h = cors(env, req);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });
    if (url.pathname === '/health') return json({ ok: true, configured: !!(env.ALI_APP_KEY && env.ALI_APP_SECRET) }, 200, h);
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
    const cacheKey = new Request(`https://cache.yeshdeal/cheapest/${parsed.id || encodeURIComponent(parsed.shortUrl || input)}`);
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
