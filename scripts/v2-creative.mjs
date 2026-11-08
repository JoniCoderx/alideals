// Renders a YeshDeal "Stage" image for an approved product (cut-out PNG from scripts/v2-cutout.py).
// Usage: node scripts/v2-creative.mjs <cutout.png> <out.png> "<headline>" "<sub (Hebrew)>" "<spec (LTR)>" ["<tag>"] [--curated] [--price "₪120"]
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { stageHTML, TOKENS, variantFor } from '../src/v2/creative/template.mjs';
import { findChrome } from './telegram-card.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = (n) => { const i = args.indexOf(n); if (i < 0) return null; const v = args[i + 1]; args.splice(i, n === '--curated' ? 1 : 2); return n === '--curated' ? true : v; };
const curated = !!flag('--curated');
const price = flag('--price') || '';
const [cut, out, headline, sub, spec, tag] = args;
const buf = await fs.readFile(cut);
// PNG IHDR: width/height at bytes 16..23 → aspect drives the layout variant
const aspect = buf.readUInt32BE(16) / buf.readUInt32BE(20);
const b64 = async (f) => (await fs.readFile(f)).toString('base64');
const fonts = { he: await b64(path.join(ROOT, 'src/assets/fonts/rubik-hebrew.woff2')), la: await b64(path.join(ROOT, 'src/assets/fonts/rubik-latin.woff2')) };
const html = stageHTML({ productDataUri: `data:image/png;base64,${buf.toString('base64')}`, aspect, headline, sub, spec, tag, price, curated, fonts });
const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'yd-'));
await fs.writeFile(path.join(dir, 'c.html'), html);
const r = spawnSync(findChrome(), ['--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1', `--window-size=${TOKENS.size.w},${TOKENS.size.h}`, '--virtual-time-budget=3000', `--screenshot=${out}`, `file://${path.join(dir, 'c.html')}`], { stdio: 'ignore', timeout: 60000 });
console.log(r.status === 0 ? `✓ ${out} (variant: ${variantFor(aspect)}, aspect ${aspect.toFixed(2)})` : '✗ render failed');
