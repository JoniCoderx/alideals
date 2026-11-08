// YeshDeal 2.0 – pure, framework-free logic shared by the /test/ preview (browser) and the tests (Node).
// No DOM, no network. Every function here is unit-tested in scripts/v2.test.mjs.

/**
 * Parses what a shopper typed into the cart field.
 * Accepts "60", "60.5", "60,50" (decimal comma), "1,234.50" (thousands), "₪ 220", "$45".
 * Rejects negatives, scientific notation, empty and non-numeric input.
 * Returns { ok: true, value } or { ok: false, reason }.
 */
export function parseAmount(input) {
  const s = String(input ?? '').trim().replace(/[₪$\s]/g, '');
  if (!s) return { ok: false, reason: 'empty' };
  if (/^-/.test(s)) return { ok: false, reason: 'negative' };
  if (/[eE]/.test(s)) return { ok: false, reason: 'invalid' };
  let n;
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) n = Number(s.replace(/,/g, '')); // 1,234.50
  else if (/^\d+,\d{1,2}$/.test(s)) n = Number(s.replace(',', '.')); // 45,50
  else if (/^\d+(\.\d+)?$/.test(s)) n = Number(s);
  else return { ok: false, reason: 'invalid' };
  if (!Number.isFinite(n)) return { ok: false, reason: 'invalid' };
  if (n === 0) return { ok: false, reason: 'zero' };
  if (n > 1e6) return { ok: false, reason: 'too_large' };
  return { ok: true, value: n };
}

/** Converts to USD cents-rounded, so a ₪ amount exactly at a tier never falls a fraction short. */
export function toUSD(value, currency, rate) {
  const usd = currency === 'ILS' ? value / rate : value;
  return Math.round(usd * 100 + 1e-6) / 100;
}

/**
 * Picks the best code for a cart (same rule as production: the biggest discount whose minimum the cart
 * meets – minimum is inclusive) and the next tier worth mentioning.
 * tiers: [{ id, d: discount, m: minOrder, code }]
 */
export function pickCoupon(usd, tiers) {
  const fits = tiers.filter((t) => t.m <= usd);
  const best = [...fits].sort((a, b) => b.d - a.d || a.m - b.m)[0] || null;
  const next = tiers.filter((t) => t.m > usd && (!best || t.d > best.d)).sort((a, b) => a.m - b.m)[0] || null;
  const gap = next ? Math.round((next.m - usd) * 100) / 100 : null;
  const upsell = !!(next && (!best || gap <= Math.max(10, usd * 0.35)));
  return { best, next, gap, upsell };
}

/* ---------------- Deal Hunter: product matching ---------------- */

const STOP = new Set(['the', 'and', 'for', 'with', 'new', 'hot', 'sale', '2024', '2025', '2026', 'free', 'shipping', 'original', 'high', 'quality', 'pcs', 'set', 'of', 'a', 'in', 'to']);

const GENERIC = new Set(['new', 'mini', 'portable', 'original', 'global', 'version', 'hot', 'for', 'the', 'upgraded', 'magnetic', 'wireless', 'fast', 'type', 'usb', 'car', 'smart', 'brand', 'ccc', 'pd', 'qi2', 'gan']);
const UNITS = { mah: 'mah', w: 'w', gb: 'gb', tb: 'tb', mm: 'mm', inch: 'inch', '"': 'inch', ml: 'ml', l: 'l', hz: 'hz' };
const CAPACITY = new Set(['mah', 'gb', 'tb', 'ml', 'l']);

/**
 * Comparable attributes from a seller's (English) title: brand, technical specs per unit, model codes,
 * plug type, and whether the listing bundles several variants (e.g. "1TB 2TB 4TB").
 */
export function attributes(title = '', props = {}) {
  const t = ` ${String(title).toLowerCase().replace(/[【】[\]()]/g, ' ')} `;
  const a = { specs: {} };
  const words = t.trim().split(/\s+/).filter((w) => /^[a-z][a-z0-9-]+$/.test(w) && !GENERIC.has(w));
  if (words[0]) a.brand = words[0];
  for (const m of t.matchAll(/(\d+(?:\.\d+)?)\s?(mah|tb|gb|mm|inch|ml|hz|w|l|")(?![a-z])/g)) {
    const unit = UNITS[m[2]];
    (a.specs[unit] = a.specs[unit] || new Set()).add(String(Number(m[1])));
  }
  for (const k of Object.keys(a.specs)) a.specs[k] = [...a.specs[k]].sort();
  if (Object.keys(a.specs).length) a.capacity = Object.entries(a.specs).flatMap(([u, v]) => v.map((x) => x + u)).sort();
  a.multiVariant = Object.entries(a.specs).some(([u, v]) => v.length > 1 && CAPACITY.has(u));
  const plug = t.match(/\b(eu|us|uk|au|il)\s?plug\b/);
  if (plug) a.plug = plug[1];
  const model = (t.match(/\b([a-z]{1,5}-?\d{2,5}[a-z]{0,3})\b/g) || []).filter((m) => !/^(\d|mah|gb|tb|pd|qc|usb|bt|iphone|galaxy)/.test(m) && !/^s\d/.test(m));
  if (model.length) a.model = [...new Set(model)].sort();
  for (const [k, v] of Object.entries(props || {})) if (v) a[k.toLowerCase()] = String(v).toLowerCase();
  return a;
}

export function tokens(title = '') {
  return String(title).toLowerCase().replace(/[^a-z0-9֐-׿]+/g, ' ').split(' ').filter((w) => w.length > 1 && !STOP.has(w));
}

export function similarity(a, b) {
  const A = new Set(tokens(a)), B = new Set(tokens(b));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter++;
  return (2 * inter) / (A.size + B.size);
}

/**
 * Classifies a candidate against the product the shopper pasted.
 * exact  – same model/identifier AND no conflicting capacity/plug AND high title similarity
 * likely – high similarity, no conflicts, but no shared identifier (verification needed)
 * similar – related product, or any attribute conflict (different capacity/plug/model)
 * Returns { level, reasons[] }. Never upgrades on price.
 */
export function classifyMatch(base, cand) {
  const ba = attributes(base.title, base.props), ca = attributes(cand.title, cand.props);
  const sim = similarity(base.title, cand.title);
  const reasons = [];
  const conflicts = [];
  const label = (u) => (CAPACITY.has(u) ? 'capacity' : u === 'w' ? 'power' : u);
  for (const u of new Set([...Object.keys(ba.specs), ...Object.keys(ca.specs)])) {
    const x = ba.specs[u], y = ca.specs[u];
    if (!x || !y) continue;
    const multi = x.length > 1 || y.length > 1;
    const ok = multi ? x.some((v) => y.includes(v)) : x.join() === y.join();
    (ok ? reasons : conflicts).push(ok ? `${label(u)}:same` : label(u));
  }
  if (ba.plug && ca.plug && ba.plug !== ca.plug) conflicts.push('plug');
  for (const k of ['color', 'variant']) if (ba[k] && ca[k] && ba[k] !== ca[k]) conflicts.push(k);
  const sameBrand = !!(ba.brand && ca.brand && ba.brand === ca.brand);
  const sharedModel = !!(ba.model && ca.model && ba.model.some((m) => ca.model.includes(m)));
  if (sameBrand && ba.model && ca.model && !sharedModel) conflicts.push('model');
  if (conflicts.length) return { level: 'similar', reasons: [...new Set(conflicts)].map((k) => `${k}:different`), sim };
  if (sameBrand) reasons.unshift('brand:same');
  if (sharedModel) reasons.unshift('model:same');
  const multi = ba.multiVariant || ca.multiVariant;
  if (sameBrand && sharedModel && sim >= 0.5 && !multi) return { level: 'exact', reasons, sim };
  if ((sameBrand && sim >= 0.4) || (sharedModel && sim >= 0.4) || (!ba.brand && sim >= 0.6)) {
    if (multi) reasons.push('variant:choose');
    return { level: 'likely', reasons: reasons.length ? reasons : ['title:similar'], sim };
  }
  return { level: 'similar', reasons: [sameBrand ? 'title:related' : 'brand:different'], sim };
}

/**
 * Final estimated cost in USD for one offer + the best code for that amount.
 * Keeps confirmed vs estimated parts separate; never invents taxes.
 */
export function finalCost({ price, shipping = null }, tiers) {
  const ship = shipping == null ? null : shipping;
  const subtotal = Math.round((price + (ship || 0)) * 100) / 100;
  const { best } = pickCoupon(price, tiers); // codes are checked on goods value (before shipping)
  const coupon = best ? best.d : 0;
  const total = Math.round((subtotal - coupon) * 100) / 100;
  return { price, shipping: ship, shippingKnown: ship != null, coupon, code: best?.code || null, total, taxIncluded: false };
}

/* ---------------- URL safety (mirror of the Worker's allow-list) ---------------- */

const ALLOWED = /(^|\.)aliexpress\.(com|us|ru)$|^a\.aliexpress\.com$|^s\.click\.aliexpress\.com$/;
export function parseProductInput(text) {
  const m = String(text || '').match(/https?:\/\/[^\s"'<>]+/);
  if (!m) return { ok: false, reason: 'no_url' };
  let u;
  try { u = new URL(m[0]); } catch { return { ok: false, reason: 'bad_url' }; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return { ok: false, reason: 'bad_url' };
  if (!ALLOWED.test(u.hostname)) return { ok: false, reason: 'not_aliexpress' };
  const id = (u.pathname.match(/\/item\/(\d{6,20})\.html/) || [])[1] || u.searchParams.get('productId') || null;
  return { ok: true, url: u.toString(), id, short: !id };
}
