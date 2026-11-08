// Real-link Deal Hunter test: calls the live Worker (official AliExpress API) for each case, applies the same
// classifier the UI uses, and saves the raw responses + decisions as evidence (data/v2/hunter-evidence.json).
// Usage: node scripts/v2-hunter-test.mjs
import fs from 'node:fs/promises';
import { classifyMatch } from '../src/v2/logic.mjs';

const API = process.env.V2_API || 'https://yeshdeal-api.joni0000.workers.dev';
const CASES = [
  ['popular, many sellers', 'https://he.aliexpress.com/item/1005009418411818.html'],
  ['popular, branded', 'https://www.aliexpress.com/item/1005010724501614.html'],
  ['cheap cable, many clones', 'https://he.aliexpress.com/item/1005009738330168.html'],
  ['GaN charger', 'https://www.aliexpress.com/item/1005006579895295.html'],
  ['generic car holder', 'https://he.aliexpress.com/item/1005012577847276.html'],
  ['variants (SSD capacities)', 'https://www.aliexpress.com/item/1005005445585329.html'],
  ['earbuds', 'https://he.aliexpress.com/item/1005009084986255.html'],
  ['short affiliate link (s.click)', 'https://s.click.aliexpress.com/e/_c3assid1'],
  ['niche product (expect no match)', 'https://www.aliexpress.com/item/1005012335597217.html'],
  ['link with tracking params + text', 'תראו את זה https://he.aliexpress.com/item/1005007476166643.html?spm=a2g0o.home&pdp_npi=6 שווה?'],
  ['non-existent product id', 'https://www.aliexpress.com/item/1005000000000001.html'],
  ['not AliExpress (must be rejected)', 'https://example.com/item/1005009418411818.html'],
];

const out = [];
for (const [label, url] of CASES) {
  const t0 = Date.now();
  let status = 0, body = null;
  try {
    const r = await fetch(`${API}/api/cheapest?url=${encodeURIComponent(url)}`);
    status = r.status;
    body = await r.json();
  } catch (e) { body = { error: 'network', message: e.message }; }
  const ms = Date.now() - t0;
  const o = body?.original;
  const pool = (body?.pool || body?.alternatives || []).map((c) => {
    const m = classifyMatch({ title: o?.enTitle || o?.title }, { title: c.enTitle || c.title });
    return { id: c.id, title: c.title, enTitle: c.enTitle, price: c.price, usd: c.usd, rating: c.rating, sold: c.sold, shop: c.shop, similarity: c.similarity, level: m.level, reasons: m.reasons, affiliate: /^https:\/\/s\.click\.aliexpress\.com\//.test(c.link || '') };
  });
  const counts = pool.reduce((a, c) => ((a[c.level] = (a[c.level] || 0) + 1), a), {});
  out.push({ label, url, status, ms, error: body?.error || null, message: body?.message || null, original: o ? { id: o.id, title: o.title, enTitle: o.enTitle, price: o.price, usd: o.usd, affiliate: /^https:\/\/s\.click\.aliexpress\.com\//.test(o.link || '') } : null, checked: body?.checked ?? null, counts, pool });
  console.log(`${String(status).padEnd(4)} ${String(ms).padStart(6)}ms  ${label.padEnd(36)} ${o ? `₪${o.price} $${o.usd ?? '?'}` : (body?.error || '')}  candidates=${body?.checked ?? '-'}  exact=${counts.exact || 0} likely=${counts.likely || 0} similar=${counts.similar || 0}`);
  await new Promise((s) => setTimeout(s, 1200));
}
await fs.writeFile('data/v2/hunter-evidence.json', JSON.stringify({ at: new Date().toISOString(), api: API, cases: out }, null, 1));
