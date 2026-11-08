// Live product data for the /test/ preview, fetched at build time from our Worker (/api/search → official Affiliates API).
// Deterministic pick per editorial slot: needs image + price + affiliate link; prefers well-rated, then most-sold.
// Falls back to null (the caller keeps the labelled preview fixture) on any failure – never invents data.
const API = process.env.V2_API || 'https://yeshdeal-api.joni0000.workers.dev';

async function search(q, { timeoutMs = 25000 } = {}) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(`${API}/api/search?q=${encodeURIComponent(q)}`, { signal: ctl.signal });
    if (!r.ok) return null;
    const j = await r.json();
    return Array.isArray(j.items) ? { items: j.items, at: j.checkedAt } : null;
  } catch { return null; } finally { clearTimeout(t); }
}

export function pickBest(items, exclude = new Set()) {
  const ok = items.filter((p) => p.id && !exclude.has(p.id) && p.image && p.price != null && /^https:\/\/s\.click\.aliexpress\.com\//.test(p.link || ''));
  const rated = ok.filter((p) => p.rating == null || p.rating >= 85);
  const pool = rated.length ? rated : ok;
  return [...pool].sort((a, b) => (b.sold || 0) - (a.sold || 0) || a.price - b.price)[0] || null;
}

/** For each fixture slot, fetch a real product. Returns { byFixtureId: {...product, checkedAt}, live: n }. */
export async function liveProducts(fixtures) {
  const byFixtureId = {};
  const used = new Set();
  for (const f of fixtures) {
    const res = await search(f.en);
    const p = res && pickBest(res.items, used);
    if (!p) continue;
    used.add(p.id);
    byFixtureId[f.id] = { ...p, checkedAt: res.at || new Date().toISOString() };
  }
  return { byFixtureId, live: Object.keys(byFixtureId).length, api: API };
}
