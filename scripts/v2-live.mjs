// Live product data for the /test/ preview, fetched at build time from our Worker (official Affiliates API).
// Relevance first: search in English, keep only listings whose English title contains the slot's key words,
// then fetch Hebrew details for the chosen ids. A slot with no relevant result keeps its labelled fixture.
// Never invents data.
const API = process.env.V2_API || 'https://yeshdeal-api.joni0000.workers.dev';

async function get(pathq, timeoutMs = 25000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(`${API}${pathq}`, { signal: ctl.signal });
    return r.ok ? await r.json() : null;
  } catch { return null; } finally { clearTimeout(t); }
}

const words = (s) => String(s).toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(' ').filter((w) => w.length > 2);

/** Relevant = the English title contains every "must" word (default: the slot query's words). */
export function isRelevant(title, must) {
  const t = String(title).toLowerCase();
  return must.every((w) => t.includes(w));
}

export function pickBest(items, must, exclude = new Set()) {
  const ok = items.slice(0, 12).filter((p) => p.id && !exclude.has(p.id) && p.image && p.price != null
    && /^https:\/\/s\.click\.aliexpress\.com\//.test(p.link || '') && isRelevant(p.title, must));
  const rated = ok.filter((p) => p.rating == null || p.rating >= 85);
  const pool = rated.length ? rated : ok;
  return [...pool].sort((a, b) => (b.sold || 0) - (a.sold || 0) || a.price - b.price)[0] || null;
}

/** For each fixture slot (f.en query, optional f.must words), fetch a real, relevant product. */
export async function liveProducts(fixtures) {
  const chosen = {};
  const used = new Set();
  for (const f of fixtures) {
    const res = await get(`/api/search?lang=EN&q=${encodeURIComponent(f.en)}`);
    const must = f.must || words(f.en).filter((w) => !['car', 'for', 'with', 'pcs', 'portable'].includes(w)).slice(0, 2);
    const p = res && Array.isArray(res.items) ? pickBest(res.items, must, used) : null;
    if (!p) continue;
    used.add(p.id);
    chosen[f.id] = { ...p, enTitle: p.title, checkedAt: res.checkedAt };
  }
  const ids = Object.values(chosen).map((p) => p.id);
  const he = ids.length ? await get(`/api/products?ids=${ids.join(',')}`) : null;
  const heById = Object.fromEntries((he?.items || []).map((p) => [p.id, p]));
  const byFixtureId = {};
  for (const [fid, p] of Object.entries(chosen)) {
    const h = heById[p.id];
    byFixtureId[fid] = h ? { ...p, ...h, enTitle: p.enTitle, checkedAt: he.checkedAt || p.checkedAt } : p;
  }
  return { byFixtureId, live: Object.keys(byFixtureId).length, api: API };
}
