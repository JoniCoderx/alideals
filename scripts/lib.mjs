// Pure data helpers shared by fetch + build. Unit-tested in lib.test.mjs.

/** Accepts 2026-11-30, 30/11/2026, 30.11.2026, 30-11-2026 (Israeli day-first). Returns YYYY-MM-DD or null. */
export function normDate(v) {
  if (v == null || v === '') return null;
  const s = String(v).trim();
  let y, m, d;
  let r = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (r) [, y, m, d] = r;
  else if ((r = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})$/))) {
    [, d, m, y] = r;
    if (y.length === 2) y = '20' + y;
  } else return null;
  const dt = new Date(Date.UTC(+y, +m - 1, +d));
  if (dt.getUTCFullYear() !== +y || dt.getUTCMonth() !== +m - 1 || dt.getUTCDate() !== +d) return null;
  return dt.toISOString().slice(0, 10);
}

/** Whole days from `fromDate` to `toDate` (both YYYY-MM-DD). Same day = 0. */
export function daysBetween(fromDate, toDate) {
  return Math.round((Date.parse(toDate + 'T12:00:00Z') - Date.parse(fromDate + 'T12:00:00Z')) / 86400000);
}

const ALLOWED_HOSTS = /(^|\.)(aliexpress\.(com|us|ru)|alicdn\.com|aliexpress-media\.com)$/i;

/** Only https links to AliExpress hosts are allowed out. Anything else → fallback. */
export function safeLink(url, fallback = '') {
  try {
    const u = new URL(String(url || '').trim());
    if (u.protocol === 'https:' && ALLOWED_HOSTS.test(u.hostname)) return u.href;
  } catch { /* invalid */ }
  return fallback;
}

/** Drop undefined/null/'' so partial rows never wipe existing values. */
export function compact(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined && v !== null && v !== ''));
}

export function slug(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9֐-׿]+/g, '-').replace(/^-|-$/g, '');
}

/**
 * Merge manual coupons with Google-Sheet rows (sheet wins field-by-field, empty cells ignored),
 * validate dates, split into active / expired. Returns { active, expired, invalid }.
 */
export function mergeCoupons(manualList = [], sheetList = [], today) {
  const byKey = new Map();
  for (const c of [...manualList, ...sheetList]) {
    const key = c.id || `${c.code}-${c.discount}-${c.minOrder}`;
    byKey.set(key, { ...(byKey.get(key) || {}), ...compact(c), id: slug(key) });
  }
  const active = [], expired = [], invalid = [];
  for (const c of byKey.values()) {
    if (c.type === 'deal') continue;
    for (const f of ['expires', 'starts', 'verified']) {
      if (c[f] == null) continue;
      const n = normDate(c[f]);
      if (!n) { invalid.push({ id: c.id, field: f, value: c[f] }); c._bad = true; }
      else c[f] = n;
    }
    if (c._bad || !c.discount || c.minOrder == null) { if (!c._bad) invalid.push({ id: c.id, field: 'discount/minOrder' }); continue; }
    if (!c.sample && !c.code) { invalid.push({ id: c.id, field: 'code' }); continue; }
    if (c.expires && c.expires < today) expired.push(c);
    else if (!c.starts || c.starts <= today) active.push(c);
  }
  active.sort((a, b) => a.minOrder - b.minOrder || b.discount - a.discount);
  expired.sort((a, b) => (b.expires || '').localeCompare(a.expires || ''));
  return { active, expired, invalid };
}

/** Merge deal tiles by id (sheet overrides manual), keep order of first appearance. */
export function mergeDeals(manualDeals = [], sheetDeals = []) {
  const byId = new Map();
  for (const d of [...manualDeals, ...sheetDeals]) {
    const id = slug(d.id || d.title || '');
    if (!id) continue;
    byId.set(id, { ...(byId.get(id) || {}), ...compact(d), id });
  }
  return [...byId.values()];
}

/** Group coupons into tiers by minOrder (several code series can share a tier). */
export function groupTiers(list) {
  const map = new Map();
  for (const c of list) {
    const k = `${c.currency || 'USD'}|${c.minOrder}`;
    if (!map.has(k)) map.set(k, { minOrder: c.minOrder, currency: c.currency || 'USD', discount: c.discount, items: [] });
    const t = map.get(k);
    t.discount = Math.max(t.discount, c.discount);
    t.items.push(c);
  }
  return [...map.values()].sort((a, b) => a.minOrder - b.minOrder);
}
