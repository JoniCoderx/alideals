// Batch: curated catalog → best gallery photo (auto cut-out + quality score) → YeshDeal premium image.
// Usage: node scripts/v2-batch-creatives.mjs [workdir]   (needs rembg, Chrome; free & local)
// Output: src/v2/creative/telegram/<id>.jpg + data/v2/creative-qc.json (scores, chosen photo, reasons)
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const API = 'https://yeshdeal-api.joni0000.workers.dev';
const WORK = process.argv[2] || '/tmp/yd-batch';
const OUT = 'src/v2/creative/telegram';
const copy = JSON.parse(await fs.readFile('data/v2/creative-copy.json', 'utf8'));
const pool = JSON.parse(await fs.readFile('data/v2/pool.json', 'utf8')).pool;
const catalog = JSON.parse(await fs.readFile('data/v2/catalog.json', 'utf8'));
const ACCENT = { phones: 'rgba(255,110,40,.55)', headphones: 'rgba(60,140,255,.5)', home: 'rgba(235,150,60,.5)', gaming: 'rgba(150,70,255,.6)', car: 'rgba(40,190,170,.45)' };
const TAG = { phones: 'טעינה', headphones: 'אוזניות', home: 'לבית', gaming: 'למחשב', car: 'בדרכים' };
await fs.mkdir(WORK, { recursive: true }); await fs.mkdir(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const keys = Object.keys(copy).filter((k) => k !== '_readme');
const items = keys.map((k) => ({ k, p: pool.find((x) => x.id.endsWith(k)), cat: catalog.collections.find((c) => c.items.includes(k))?.cat })).filter((x) => x.p);

// gallery photos (raw fields, ≤3 ids per call)
for (let i = 0; i < items.length; i += 3) {
  const chunk = items.slice(i, i + 3);
  for (let t = 0; t < 3; t++) {
    const j = await (await fetch(`${API}/api/products?raw=1&ids=${chunk.map((x) => x.p.id).join(',')}`)).json().catch(() => ({}));
    if (j.raw) { for (const r of j.raw) { const it = chunk.find((x) => x.p.id === String(r.product_id)); if (it) it.gallery = [r.product_main_image_url, ...(r.product_small_image_urls?.string || [])].filter(Boolean).slice(0, 6); } break; }
    await sleep(1500);
  }
  await sleep(1200);
}

const qc = [];
for (const it of items) {
  const dir = path.join(WORK, it.k); await fs.mkdir(dir, { recursive: true });
  const pairs = [];
  for (const [n, u] of (it.gallery || [it.p.image]).entries()) {
    const f = path.join(dir, `g${n}.jpg`);
    const r = await fetch(u).catch(() => null); if (!r?.ok) continue;
    await fs.writeFile(f, Buffer.from(await r.arrayBuffer())); pairs.push(f, path.join(dir, `c${n}.png`));
  }
  const res = spawnSync('python3', ['-I', 'scripts/v2-cutout.py', ...pairs], { encoding: 'utf8', maxBuffer: 1 << 24 });
  let m = []; try { m = JSON.parse(res.stdout.trim().split('\n').pop()); } catch {}
  // quality: one dominant object, sensible size, not a cropped lifestyle shot
  const scored = m.filter((x) => x.ok !== false).map((x) => {
    const reasons = [];
    if (x.dominance < 0.85) reasons.push('extra objects/text');
    if (x.coverage < 0.08) reasons.push('product too small');
    if (x.coverage > 0.7) reasons.push('fills frame (likely cropped)');
    if (x.parts > 6) reasons.push('fragmented mask');
    return { ...x, reasons, score: reasons.length ? 0 : x.dominance * Math.min(x.coverage, 0.45) };
  }).sort((a, b) => b.score - a.score);
  const best = scored[0];
  const entry = { id: it.p.id, k: it.k, ok: !!(best && best.score > 0), chosen: best?.src, candidates: scored.map(({ src, score, reasons, dominance, coverage, parts }) => ({ src: path.basename(src), score: +score.toFixed(3), reasons, dominance, coverage, parts })) };
  if (entry.ok) {
    const [headline, sub, spec, big] = copy[it.k];
    const sold = it.p.sold, rate = Math.round(it.p.rating);
    const soldTxt = sold >= 1000 ? `${(Math.floor(sold / 1000) * 1000).toLocaleString('en-US')}+ נמכרו` : `${Math.floor(sold / 10) * 10}+ נמכרו`;
    const bigArg = big || (sold >= 5000 ? `${(Math.floor(sold / 1000) * 1000).toLocaleString('en-US')}+|נמכרו` : '');
    const stats = bigArg.includes('נמכרו') ? `${rate}% ביקורות חיוביות` : `${soldTxt} | ${rate}% ביקורות חיוביות`;
    const png = path.join(dir, 'final.png');
    const args = ['scripts/v2-creative.mjs', best.dst, png, headline, sub, spec, TAG[it.cat] || '', '--curated', '--dark', '--stats', stats, '--accent', ACCENT[it.cat] || ACCENT.phones];
    if (bigArg) args.push('--big', bigArg);
    spawnSync('node', args, { stdio: 'ignore' });
    spawnSync('python3', ['-c', `from PIL import Image;Image.open('${png}').convert('RGB').save('${OUT}/${it.p.id}.jpg',quality=84,optimize=True)`]);
    entry.image = `${OUT}/${it.p.id}.jpg`;
  }
  qc.push(entry);
  console.log(`${entry.ok ? '✓' : '✗'} ${it.k} ${copy[it.k][0]} ${entry.ok ? path.basename(best.src) : scored.map((s) => s.reasons.join('/')).join('; ')}`);
}
await fs.writeFile('data/v2/creative-qc.json', JSON.stringify({ at: new Date().toISOString(), items: qc }, null, 1));
