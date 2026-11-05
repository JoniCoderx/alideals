// Pulls fresh data from every configured source and writes data/generated.json.
// Every source is optional and fails soft: the site always builds.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AliExpressClient } from './aliexpress-api.mjs';
import { fetchSheetCoupons, fetchRedditCoupons } from './sources.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = process.env;
await loadDotEnv();

const site = JSON.parse(await fs.readFile(path.join(ROOT, 'config/site.json'), 'utf8'));
const manual = JSON.parse(await fs.readFile(path.join(ROOT, 'data/coupons.json'), 'utf8'));
const outFile = path.join(ROOT, 'data/generated.json');
const previous = await readJSON(outFile, {});

const out = {
  // Keep every key from the previous run (e.g. telegram.posted state) – only the fields below are refreshed.
  ...previous,
  fetchedAt: new Date().toISOString(),
  // Only moves forward when at least one source actually returned data.
  updatedAt: previous.updatedAt ?? null,
  sheetCoupons: previous.sheetCoupons ?? [],
  community: previous.community ?? [],
  deals: previous.deals ?? {},
  promos: previous.promos ?? [],
  links: previous.links ?? {},
  fx: previous.fx ?? null,
  log: [],
};
const log = (m) => { console.log(m); out.log.push(m); };
let ok = 0;
const success = () => { ok++; };

// 1) Google Sheet
if (env.COUPONS_SHEET_CSV_URL) {
  try {
    out.sheetCoupons = await fetchSheetCoupons(env.COUPONS_SHEET_CSV_URL);
    log(`✓ sheet: ${out.sheetCoupons.length} coupons`); success();
  } catch (e) { log(`✗ sheet: ${e.message} (keeping previous)`); }
}

// 2) Reddit community codes
if (env.REDDIT_CLIENT_ID && env.REDDIT_CLIENT_SECRET && env.REDDIT_DISABLED !== '1') {
  try {
    out.community = await fetchRedditCoupons({
      subreddit: env.REDDIT_SUBREDDIT || 'AliExpressCode',
      clientId: env.REDDIT_CLIENT_ID,
      clientSecret: env.REDDIT_CLIENT_SECRET,
    });
    log(`✓ reddit: ${out.community.length} community codes`); success();
  } catch (e) { log(`✗ reddit: ${e.message} (keeping previous)`); }
}

// USD→ILS rate for the cart calculator (free, no key). Keeps the previous rate on failure.
try {
  const r = await fetch('https://open.er-api.com/v6/latest/USD');
  const j = await r.json();
  const ils = Number(j?.rates?.ILS);
  if (ils > 2 && ils < 6) { out.fx = { usdIls: Math.round(ils * 100) / 100, at: out.fetchedAt }; log(`✓ fx: 1 USD = ${out.fx.usdIls} ILS`); }
  else throw new Error('bad rate');
} catch (e) { log(`✗ fx: ${e.message} (keeping previous)`); }

// 3) AliExpress affiliate API
if (env.ALI_APP_KEY && env.ALI_APP_SECRET) {
  const ali = new AliExpressClient({ appKey: env.ALI_APP_KEY, appSecret: env.ALI_APP_SECRET, trackingId: env.ALI_TRACKING_ID });

  for (const cat of site.dealCategories) {
    try {
      const items = [];
      for (const kw of cat.keywords) {
        items.push(...(await ali.searchProducts({ keywords: kw, pageSize: 12 })));
      }
      const uniq = [...new Map(items.map((p) => [p.id, p])).values()]
        .sort((a, b) => b.sold - a.sold)
        .slice(0, 24);
      if (uniq.length) out.deals[cat.slug] = uniq;
      log(`✓ deals/${cat.slug}: ${uniq.length}`); if (uniq.length) success();
    } catch (e) { log(`✗ deals/${cat.slug}: ${e.message}`); }
  }

  try {
    out.promos = (await ali.featuredPromos()).map((p) => ({ name: p.promo_name, desc: p.promo_desc, count: Number(p.product_num) || 0 }));
    log(`✓ promos: ${out.promos.length}`);
  } catch (e) { log(`✗ promos: ${e.message}`); }

  // Convert every landing URL we send people to into a tracked affiliate link.
  try {
    const urls = [
      site.affiliate.couponCenterUrl,
      site.affiliate.homeUrl,
      ...manual.coupons.map((c) => c.landing),
      ...manual.deals.map((d) => d.landing),
      ...out.sheetCoupons.map((c) => c.landing),
    ].filter((u) => u && /aliexpress\./.test(u));
    const map = await ali.generateLinks(urls);
    out.links = { ...out.links, ...Object.fromEntries(map) };
    log(`✓ affiliate links: ${map.size}`);
  } catch (e) { log(`✗ link.generate: ${e.message}`); }
} else {
  log('• AliExpress API keys not set – skipping products (site uses affiliate.defaultLink)');
}

if (ok) out.updatedAt = out.fetchedAt;
if (process.env.FETCH_STRICT === '1' && out.log.some((l) => l.startsWith('✗'))) process.exitCode = 1;
await fs.writeFile(outFile, JSON.stringify(out, null, 2) + '\n');
console.log(`→ wrote ${path.relative(ROOT, outFile)}`);

async function readJSON(f, fallback) {
  try { return JSON.parse(await fs.readFile(f, 'utf8')); } catch { return fallback; }
}
async function loadDotEnv() {
  try {
    const txt = await fs.readFile(path.join(ROOT, '.env'), 'utf8');
    for (const line of txt.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !env[m[1]]) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch { /* no .env */ }
}
