// One-off editorial tool: builds the candidate pool for the curated /test/ catalog.
// Source ids: AliExpress Top-200-publishers CSV (minus junk) + targeted searches. Pulls EN + HE details from the
// official API (via our Worker) and applies the published quality criteria. Output: data/v2/pool.json
// Usage: node scripts/v2-pool.mjs
import fs from 'node:fs/promises';
import { parseCSV } from './v2-top200.mjs';

const API = process.env.V2_API || 'https://yeshdeal-api.joni0000.workers.dev';
const get = async (q) => { for (let a = 0; a < 3; a++) { try { const r = await fetch(API + q); if (r.ok) return r.json(); } catch {} await new Promise((s) => setTimeout(s, 1500 * (a + 1))); } return null; };
const JUNK = /make up the difference|additional pay|baler|baling|lawn mower|mower|lucky bag|mystery|fukubukuro|blind box|graphics card fan|self tapping screw|korean plug|cn rom|cn version|\bcn\b|korean type|유원트|processor|cpu|ryzen/i;

// Published criteria (also shown on every collection page)
export const CRITERIA = { minRating: 92, minSold: 300, minDiscountSanity: 0 };

const rows = parseCSV(await fs.readFile('data/v2/top200-publishers.csv', 'utf8')).slice(1);
const ids = new Set(rows.filter(([n]) => !JUNK.test(n)).map((r) => (r[2].match(/\/item\/(\d+)\.html/) || [])[1]).filter(Boolean));
const QUERIES = ['car phone holder magnetic', 'dash cam', 'car vacuum cleaner', 'trunk organizer', 'car seat gap filler', 'tire inflator', 'car charger usb c', 'car interior led', 'windshield sun shade', 'kitchen gadgets', 'storage organizer', 'cable organizer', 'desk lamp led', 'travel adapter', 'luggage scale', 'packing cubes travel', 'neck pillow travel', 'phone case magsafe', 'screen protector iphone', 'wireless charger magnetic', 'usb c hub', 'mechanical keyboard', 'smart watch', 'bluetooth speaker', 'electric toothbrush', 'hair clipper'];
for (const q of QUERIES) {
  const r = await get(`/api/search?lang=EN&q=${encodeURIComponent(q)}`);
  for (const p of (r?.items || []).slice(0, 8)) ids.add(p.id);
}
const all = [...ids];
const en = {}, he = {};
for (let i = 0; i < all.length; i += 20) {
  const chunk = all.slice(i, i + 20).join(',');
  const a = await get(`/api/products?lang=EN&ids=${chunk}`);
  const b = await get(`/api/products?ids=${chunk}`);
  for (const p of a?.items || []) en[p.id] = p;
  for (const p of b?.items || []) he[p.id] = p;
}
const pool = Object.values(en).map((p) => ({
  id: p.id, en: p.title, heRaw: he[p.id]?.title || '', image: p.image, ils: p.price, ilsOrig: p.originalPrice,
  rating: p.rating, sold: p.sold, shop: p.shop, link: p.link,
  pass: !!(p.image && p.price != null && /^https:\/\/s\.click\.aliexpress\.com\//.test(p.link || '') && p.rating != null && p.rating >= CRITERIA.minRating && p.sold >= CRITERIA.minSold),
}));
await fs.mkdir('data/v2', { recursive: true });
await fs.writeFile('data/v2/pool.json', JSON.stringify({ at: new Date().toISOString(), criteria: CRITERIA, pool }, null, 1));
console.log(`pool ${pool.length}, pass ${pool.filter((p) => p.pass).length}`);
