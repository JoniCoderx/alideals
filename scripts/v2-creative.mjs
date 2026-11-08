// Renders a YeshDeal "Stage" image for an approved product (cut-out PNG already prepared by scripts/v2-cutout.py).
// Usage: node scripts/v2-creative.mjs <cutout.png> <out.png> "<headline>" "<sub (Hebrew)>" "<spec (brand/model, LTR)>" ["<tag>"]
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { stageHTML, TOKENS } from '../src/v2/creative/template.mjs';
import { findChrome } from './telegram-card.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [cut, out, headline, sub, spec, tag] = process.argv.slice(2);
const b64 = async (f) => (await fs.readFile(f)).toString('base64');
const fonts = { he: await b64(path.join(ROOT, 'src/assets/fonts/rubik-hebrew.woff2')), la: await b64(path.join(ROOT, 'src/assets/fonts/rubik-latin.woff2')) };
const html = stageHTML({ productDataUri: `data:image/png;base64,${await b64(cut)}`, headline, sub, spec, tag, fonts });
const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'yd-'));
await fs.writeFile(path.join(dir, 'c.html'), html);
const chrome = findChrome();
const r = spawnSync(chrome, ['--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1', `--window-size=${TOKENS.size.w},${TOKENS.size.h}`, '--virtual-time-budget=3000', `--screenshot=${out}`, `file://${path.join(dir, 'c.html')}`], { stdio: 'ignore', timeout: 60000 });
console.log(r.status === 0 ? `✓ ${out}` : '✗ render failed');
