// Renders branded 1080×1080 images for Telegram posts with headless Chrome (preinstalled on GitHub runners).
// No npm dependencies: writes an HTML card and calls `chrome --headless --screenshot`.
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const money = (n, cur = 'USD') => (cur === 'ILS' ? `₪${n}` : `$${n}`);

const BUBBLE = (fill, mark) => `<svg viewBox="0 0 64 64" width="76" height="76"><path d="M32 4C16.5 4 4 15.2 4 29c0 6.7 3 12.8 7.8 17.3L8 60l15-6.6c2.8.8 5.9 1.2 9 1.2 15.5 0 28-11.2 28-25S47.5 4 32 4z" fill="${fill}"/><path d="M22 39 42 19" stroke="${mark}" stroke-width="5.5" stroke-linecap="round"/><circle cx="23" cy="21" r="5" fill="${mark}"/><circle cx="41" cy="37" r="5" fill="${mark}"/></svg>`;

const THEMES = {
  new: { bg: 'linear-gradient(150deg,#ff7a2f 0%,#e5122f 70%,#b80d2a 100%)', badge: '🔥 קודים חדשים' },
  event: { bg: 'linear-gradient(150deg,#ff7a2f 0%,#e5122f 55%,#7a0b3a 100%)', badge: '🎉 המבצע התחיל' },
  ending: { bg: 'linear-gradient(150deg,#2a1218 0%,#7a0b1f 60%,#e5122f 100%)', badge: '⏰ נגמר מחר' },
  weekly: { bg: 'linear-gradient(150deg,#ffb400 0%,#ff7a2f 45%,#e5122f 100%)', badge: '🏆 הקוד של השבוע' },
};

// Text cards (tips / promotions / features / countdown): light, dark or brand themes for variety in the feed.
const TEXT_THEMES = {
  tip: { bg: 'radial-gradient(900px 600px at 100% 0%,#ffd9c7,transparent 60%),#fffaf7', fg: '#1b1b24', sub: '#4a4a58', accent: '#c8102e', chip: '#fff1ec', badge: '💡 טיפ', brandFill: 'url(#bg1)', brandMark: '#fff', url: ['#c8102e', '#fff'] },
  deal: { bg: 'linear-gradient(150deg,#ff7a2f 0%,#e5122f 70%,#b80d2a 100%)', fg: '#fff', sub: 'rgba(255,255,255,.92)', accent: '#fff', chip: 'rgba(255,255,255,.16)', badge: '🎁 הטבה', brandFill: '#fff', brandMark: '#e5122f', url: ['#fff', '#c8102e'] },
  feature: { bg: 'radial-gradient(800px 600px at 0% 100%,rgba(229,18,47,.35),transparent 60%),#16151b', fg: '#fff', sub: '#cfc9c6', accent: '#ff7a6e', chip: 'rgba(255,255,255,.08)', badge: '✨ באתר', brandFill: 'url(#bg1)', brandMark: '#fff', url: ['#fff', '#16151b'] },
  countdown: { bg: 'linear-gradient(150deg,#16151b 0%,#7a0b3a 55%,#e5122f 100%)', fg: '#fff', sub: 'rgba(255,255,255,.9)', accent: '#ffb400', chip: 'rgba(255,255,255,.12)', badge: '⏳ ספירה לאחור', brandFill: '#fff', brandMark: '#e5122f', url: ['#fff', '#7a0b3a'] },
};

export function textCardBody({ kind, emoji, title, points = [], bigNumber, bigLabel, site, name }) {
  const t = TEXT_THEMES[kind] || TEXT_THEMES.tip;
  const brand = `<svg viewBox="0 0 64 64" width="72" height="72"><defs><linearGradient id="bg1" x1="8" y1="4" x2="56" y2="60" gradientUnits="userSpaceOnUse"><stop stop-color="#ff7a2f"/><stop offset="1" stop-color="#e5122f"/></linearGradient></defs><path d="M32 4C16.5 4 4 15.2 4 29c0 6.7 3 12.8 7.8 17.3L8 60l15-6.6c2.8.8 5.9 1.2 9 1.2 15.5 0 28-11.2 28-25S47.5 4 32 4z" fill="${t.brandFill}"/><path d="M22 39 42 19" stroke="${t.brandMark}" stroke-width="5.5" stroke-linecap="round"/><circle cx="23" cy="21" r="5" fill="${t.brandMark}"/><circle cx="41" cy="37" r="5" fill="${t.brandMark}"/></svg>`;
  const css = `body{background:${t.bg};color:${t.fg};padding:60px 64px 52px;display:flex;flex-direction:column}
.top{display:flex;align-items:center;justify-content:space-between}
.brand{display:flex;align-items:center;gap:14px;font-size:48px;font-weight:800;letter-spacing:-1px}
.badge{background:${t.chip};border:2px solid ${kind === 'tip' ? '#f3d2c7' : 'rgba(255,255,255,.3)'};border-radius:999px;padding:12px 26px;font-size:32px;font-weight:700}
.main{flex:1;display:flex;flex-direction:column;justify-content:center}
.emoji{font-size:150px;line-height:1;margin-bottom:22px}
.big{font-size:300px;font-weight:800;line-height:.9;color:${t.accent};letter-spacing:-8px}
.biglabel{font-size:56px;font-weight:800;margin-top:6px}
h1{font-size:${title.length > 26 ? 72 : 84}px;font-weight:800;line-height:1.08;letter-spacing:-1.5px}
ul{list-style:none;padding:0;margin-top:34px;display:grid;gap:16px}
li{display:flex;align-items:center;gap:18px;font-size:40px;color:${t.sub};font-weight:500}
li b{flex:none;display:grid;place-items:center;width:58px;height:58px;border-radius:50%;background:${t.accent};color:${kind === 'tip' ? '#fff' : kind === 'countdown' ? '#16151b' : '#c8102e'};font-size:32px}
.foot{display:flex;justify-content:flex-start;align-items:center}
.url{background:${t.url[0]};color:${t.url[1]};border-radius:999px;padding:14px 32px;font-size:34px;font-weight:800}`;
  const html = `<div class="top"><div class="brand">${brand}<span>${esc(name)}<span style="color:${kind === 'tip' ? '#e5122f' : 'inherit'}">!</span></span></div><div class="badge">${esc(t.badge)}</div></div>
<div class="main">
  ${bigNumber != null ? `<div class="big">${esc(bigNumber)}</div><div class="biglabel">${esc(bigLabel || '')}</div><h1 style="margin-top:26px">${esc(title)}</h1>` : `<div class="emoji">${emoji || '💡'}</div><h1>${esc(title)}</h1>`}
  ${points.length ? `<ul>${points.slice(0, 4).map((p, i) => `<li><b>${i + 1}</b><span>${esc(p)}</span></li>`).join('')}</ul>` : ''}
</div>
<div class="foot"><span class="url">${esc(site)}</span></div>`;
  return { css, html };
}

export async function cardHTML({ kind, title, subtitle, codes, footer, site = 'yeshdeal.com', name = 'יש דיל' }) {
  const font = async (f) => (await fs.readFile(path.join(ROOT, 'src/assets/fonts', f))).toString('base64');
  const [he, la] = await Promise.all([font('rubik-hebrew.woff2'), font('rubik-latin.woff2')]);
  if (TEXT_THEMES[kind]) {
    const { css, html } = textCardBody({ kind, emoji: arguments[0].emoji, title, points: arguments[0].points, bigNumber: arguments[0].bigNumber, bigLabel: arguments[0].bigLabel, site, name });
    return `<!DOCTYPE html><html dir="rtl" lang="he"><head><meta charset="utf-8"><style>
@font-face{font-family:R;src:url(data:font/woff2;base64,${he}) format('woff2');font-weight:400 800;unicode-range:U+0590-05FF,U+20AA}
@font-face{font-family:R;src:url(data:font/woff2;base64,${la}) format('woff2');font-weight:400 800}
*{box-sizing:border-box;margin:0}html,body{width:1080px;height:1080px;overflow:hidden}body{font-family:R,'Noto Color Emoji',sans-serif}
${css}</style></head><body>${html}</body></html>`;
  }
  const t = THEMES[kind] || THEMES.new;
  const list = (codes || []).slice(0, 10);
  const big = list.length <= 4;
  const brandSize = 50;
  return `<!DOCTYPE html><html dir="rtl" lang="he"><head><meta charset="utf-8"><style>
@font-face{font-family:R;src:url(data:font/woff2;base64,${he}) format('woff2');font-weight:400 800;unicode-range:U+0590-05FF,U+20AA}
@font-face{font-family:R;src:url(data:font/woff2;base64,${la}) format('woff2');font-weight:400 800}
*{box-sizing:border-box;margin:0}
html,body{width:1080px;height:1080px;overflow:hidden}
body{font-family:R,sans-serif;background:${t.bg};color:#fff;padding:56px 60px 48px;display:flex;flex-direction:column}
.top{display:flex;align-items:center;justify-content:space-between}
.brand{display:flex;align-items:center;gap:14px;font-size:${brandSize}px;font-weight:800;letter-spacing:-1px}
.badge{background:rgba(255,255,255,.18);border:2px solid rgba(255,255,255,.35);border-radius:999px;padding:12px 26px;font-size:32px;font-weight:700}
h1{font-size:${big ? 80 : 66}px;font-weight:800;line-height:1.05;margin-top:30px;letter-spacing:-1.5px}
.sub{font-size:34px;opacity:.92;margin-top:10px}
.grid{flex:1;min-height:0;display:grid;grid-template-columns:${big ? '1fr' : '1fr 1fr'};gap:${big ? 18 : 14}px;align-content:center;margin:24px 0 22px}
.c{background:#fff;color:#1b1b24;border-radius:22px;padding:${big ? '20px 30px' : '13px 22px'};display:flex;align-items:center;justify-content:space-between;gap:14px;box-shadow:0 10px 30px rgba(0,0,0,.18)}
.amt{font-size:${big ? 58 : 42}px;font-weight:800;color:#c8102e;line-height:1}
.min{font-size:${big ? 28 : 22}px;color:#4a4a58;margin-top:2px}
.code{direction:ltr;font-family:ui-monospace,Menlo,monospace;font-weight:800;font-size:${big ? 40 : 28}px;border:3px dashed #e5122f;background:#fff1ec;color:#c8102e;border-radius:14px;padding:8px 14px;white-space:nowrap}
.foot{flex:none;display:flex;justify-content:space-between;align-items:center;font-size:32px;font-weight:700}
.url{background:#fff;color:#c8102e;border-radius:999px;padding:12px 28px}
</style></head><body>
<div class="top"><div class="brand">${BUBBLE('#fff', '#e5122f')}<span>${esc(name)}!</span></div><div class="badge">${esc(t.badge)}</div></div>
<h1>${esc(title)}</h1>
${subtitle ? `<div class="sub">${esc(subtitle)}</div>` : ''}
<div class="grid">${list.map((c) => `<div class="c"><div><div class="amt">${money(c.discount, c.currency)}</div><div class="min">מעל ${money(c.minOrder, c.currency)}</div></div><div class="code">${esc(c.code)}</div></div>`).join('')}</div>
<div class="foot"><span>${esc(footer || '')}</span><span class="url">${esc(site)}</span></div>
</body></html>`;
}

export function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser',
    '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome',
  ].filter(Boolean);
  return candidates.find((c) => existsSync(c)) || null;
}

/** Returns a PNG Buffer, or null if no Chrome is available / rendering fails. */
export async function renderCard(data) {
  const chrome = findChrome();
  if (!chrome) return null;
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tgcard-'));
  const html = path.join(dir, 'card.html');
  const png = path.join(dir, 'card.png');
  await fs.writeFile(html, await cardHTML(data));
  const r = spawnSync(chrome, [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
    '--window-size=1080,1080', '--virtual-time-budget=3000', `--screenshot=${png}`, `file://${html}`,
  ], { timeout: 60000, stdio: 'ignore' });
  if (r.status !== 0 || !existsSync(png)) return null;
  return fs.readFile(png);
}
