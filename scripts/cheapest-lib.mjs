// "מוצא הזול" – pure logic shared by the Cloudflare Worker and the tests (no Node/Worker-specific APIs).
// Given an AliExpress product, find the same product from other sellers and rank by price.

const ALI_HOST = /(^|\.)aliexpress\.(com|us|ru)$/i;

/** Extracts an AliExpress product id from a pasted text/URL. Returns { id, shortUrl } (either may be null). */
export function parseProductInput(text) {
  const raw = String(text || '').trim();
  if (!raw) return { id: null, shortUrl: null };
  if (/^\d{8,20}$/.test(raw)) return { id: raw, shortUrl: null };
  const urlMatch = raw.match(/https?:\/\/[^\s"'<>]+/i);
  if (!urlMatch) return { id: null, shortUrl: null };
  let u;
  try { u = new URL(urlMatch[0]); } catch { return { id: null, shortUrl: null }; }
  if (!ALI_HOST.test(u.hostname)) return { id: null, shortUrl: null };
  const id = extractIdFromUrl(u.href);
  if (id) return { id, shortUrl: null };
  // Short/share links (a.aliexpress.com/_xxx, s.click.aliexpress.com/e/_xxx) must be resolved by following redirects.
  if (/^(a|s\.click|click)\.aliexpress\./i.test(u.hostname) || /^\/(e\/)?_/.test(u.pathname)) return { id: null, shortUrl: u.href };
  return { id: null, shortUrl: null };
}

export function extractIdFromUrl(href) {
  const s = String(href || '');
  const m = s.match(/\/item\/(?:[^/]*?\/)?(\d{8,20})\.html/i)
    || s.match(/[?&](?:productId|product_id|itemId|objectId)=(\d{8,20})/i)
    || s.match(/\/i\/(\d{8,20})\.html/i)
    || s.match(/[?&]redirectUrl=[^&]*?item%2F(\d{8,20})/i);
  return m ? m[1] : null;
}

const STOP = new Set(['for', 'with', 'and', 'the', 'new', 'hot', 'sale', '2024', '2025', '2026', 'pcs', 'piece', 'set', 'free', 'shipping', 'original', 'high', 'quality', 'best', 'top', 'fashion', 'style', 'women', 'men', 'mens', 'womens', 'of', 'in', 'to', 'a', 'an', 'on', 'by', 'from']);

export function tokens(title) {
  return String(title || '').toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/).filter((t) => t.length > 1 && !STOP.has(t));
}

/** Search keywords from a product title: the most specific words, capped to keep the search focused. */
export function keywordsFromTitle(title, max = 7) {
  const seen = new Set();
  const out = [];
  for (const t of tokens(title)) {
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= max) break;
  }
  return out.join(' ');
}

/** Token-set similarity (0..1) – Dice coefficient, robust to word order and extra marketing words. */
export function titleSimilarity(a, b) {
  const A = new Set(tokens(a)), B = new Set(tokens(b));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return (2 * inter) / (A.size + B.size);
}

const num = (v) => { const n = parseFloat(String(v ?? '').replace(/[^\d.]/g, '')); return Number.isFinite(n) ? n : null; };
const pct = (v) => { const n = num(v); return n == null ? null : n; };

export function normalizeProduct(p) {
  return {
    id: String(p.product_id ?? p.id ?? ''),
    title: (p.product_title ?? p.title ?? '').trim(),
    image: p.product_main_image_url ?? p.image ?? '',
    price: num(p.target_sale_price ?? p.sale_price ?? p.price),
    originalPrice: num(p.target_original_price ?? p.original_price),
    currency: p.target_sale_price_currency ?? p.currency ?? 'ILS',
    rating: pct(p.evaluate_rate ?? p.rating),
    sold: Number(p.lastest_volume ?? p.sold ?? 0) || 0,
    shop: p.shop_name ?? '',
    categoryId: p.first_level_category_id ?? p.second_level_category_id ?? null,
    link: p.promotion_link ?? p.link ?? '',
  };
}

/**
 * Ranks candidate products against the original: keeps only close matches (title similarity),
 * drops poorly rated / unsold listings, sorts by price ascending.
 */
export function rankAlternatives(original, candidates, { minSimilarity = 0.45, minRating = 85, minSold = 5, limit = 6 } = {}) {
  const seen = new Set([original.id]);
  const out = [];
  for (const c of candidates) {
    if (!c.id || seen.has(c.id) || c.price == null || !c.link) continue;
    seen.add(c.id);
    const similarity = titleSimilarity(original.title, c.title);
    if (similarity < minSimilarity) continue;
    if (c.rating != null && c.rating < minRating) continue;
    if (c.sold < minSold) continue;
    out.push({ ...c, similarity: Math.round(similarity * 100) / 100 });
  }
  out.sort((a, b) => a.price - b.price || b.sold - a.sold);
  return out.slice(0, limit).map((c) => ({
    ...c,
    savings: original.price != null ? Math.round((original.price - c.price) * 100) / 100 : null,
    savingsPct: original.price ? Math.round((1 - c.price / original.price) * 100) : null,
  }));
}
