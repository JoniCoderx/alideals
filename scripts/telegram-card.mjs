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

// Text cards (tips / promotions / features / guides / countdown): light, dark or brand themes for variety in the feed.
const TEXT_THEMES = {
  tip: { bg: 'radial-gradient(900px 600px at 100% 0%,#ffd9c7,transparent 60%),#fffaf7', fg: '#1b1b24', sub: '#3a3a46', accent: '#e5122f', numFg: '#fff', chip: '#fff1ec', chipLine: '#f3d2c7', panel: '#fff', panelLine: '#f1e4de', tile: 'linear-gradient(150deg,#fff,#ffe9e0)', deco: 'rgba(229,18,47,.07)', badge: '💡 טיפ', brandFill: 'url(#bg1)', brandMark: '#fff', bang: '#e5122f', url: ['#e5122f', '#fff'], tag: '#e5122f' },
  guide: { bg: 'linear-gradient(160deg,#fffaf7 0%,#fffaf7 62%,#ffe1d6 100%)', fg: '#1b1b24', sub: '#3a3a46', accent: '#16151b', numFg: '#fff', chip: '#16151b', chipFg: '#fff', chipLine: '#16151b', panel: '#fff', panelLine: '#efe3dd', tile: 'linear-gradient(150deg,#ff7a2f,#e5122f)', deco: 'rgba(22,21,27,.05)', badge: '📖 מדריך', brandFill: 'url(#bg1)', brandMark: '#fff', bang: '#e5122f', url: ['#16151b', '#fff'], tag: '#e5122f' },
  deal: { bg: 'linear-gradient(150deg,#ff7a2f 0%,#e5122f 70%,#b80d2a 100%)', fg: '#fff', sub: '#fff', accent: '#fff', numFg: '#c8102e', chip: 'rgba(255,255,255,.16)', chipLine: 'rgba(255,255,255,.35)', panel: 'rgba(255,255,255,.13)', panelLine: 'rgba(255,255,255,.28)', tile: 'rgba(255,255,255,.18)', deco: 'rgba(255,255,255,.08)', badge: '🎁 הטבה', brandFill: '#fff', brandMark: '#e5122f', bang: '#fff', url: ['#fff', '#c8102e'], tag: '#fff' },
  feature: { bg: 'radial-gradient(800px 600px at 0% 100%,rgba(229,18,47,.4),transparent 60%),radial-gradient(600px 500px at 100% 0%,rgba(255,122,47,.25),transparent 60%),#16151b', fg: '#fff', sub: '#e6e1de', accent: '#ff5a4a', numFg: '#fff', chip: 'rgba(255,255,255,.08)', chipLine: 'rgba(255,255,255,.25)', panel: 'rgba(255,255,255,.06)', panelLine: 'rgba(255,255,255,.14)', tile: 'linear-gradient(150deg,#ff7a2f,#e5122f)', deco: 'rgba(255,255,255,.045)', badge: '✨ באתר', brandFill: 'url(#bg1)', brandMark: '#fff', bang: '#ff5a4a', url: ['#fff', '#16151b'], tag: '#ffb400' },
  spot: { bg: 'radial-gradient(700px 500px at 100% 0%,rgba(255,180,0,.45),transparent 60%),linear-gradient(150deg,#ff6a2f 0%,#e5122f 60%,#a80b2a 100%)', fg: '#fff', sub: '#fff', accent: '#fff', numFg: '#c8102e', chip: 'rgba(255,255,255,.16)', chipLine: 'rgba(255,255,255,.35)', panel: 'rgba(255,255,255,.13)', panelLine: 'rgba(255,255,255,.28)', tile: 'rgba(255,255,255,.18)', deco: 'rgba(255,255,255,.08)', badge: '⚡ הקוד של עכשיו', brandFill: '#fff', brandMark: '#e5122f', bang: '#fff', url: ['#fff', '#c8102e'], tag: '#ffe08a', codeTitle: true },
  category: { bg: 'linear-gradient(150deg,#ff7a2f,#e5122f)', fg: '#fff', sub: '#fff', accent: '#fff', numFg: '#16151b', chip: 'rgba(255,255,255,.18)', chipLine: 'rgba(255,255,255,.4)', panel: 'rgba(255,255,255,.14)', panelLine: 'rgba(255,255,255,.3)', tile: 'rgba(255,255,255,.2)', deco: 'rgba(255,255,255,.09)', badge: '🛍️ קטגוריה', brandFill: '#fff', brandMark: '#e5122f', bang: '#fff', url: ['#fff', '#16151b'], tag: '#fff' },
  countdown: { bg: 'linear-gradient(150deg,#16151b 0%,#7a0b3a 55%,#e5122f 100%)', fg: '#fff', sub: '#fff', accent: '#ffb400', numFg: '#16151b', chip: 'rgba(255,255,255,.12)', chipLine: 'rgba(255,255,255,.3)', panel: 'rgba(255,255,255,.1)', panelLine: 'rgba(255,255,255,.22)', tile: 'rgba(255,255,255,.14)', deco: 'rgba(255,255,255,.06)', badge: '⏳ ספירה לאחור', brandFill: '#fff', brandMark: '#e5122f', bang: '#fff', url: ['#fff', '#7a0b3a'], tag: '#ffb400' },
};

export function textCardBody({ kind, emoji, title, points = [], bigNumber, bigLabel, site, name, badge, colors }) {
  const t = { ...(TEXT_THEMES[kind] || TEXT_THEMES.tip), ...(badge ? { badge } : {}), ...(colors ? { bg: `radial-gradient(700px 500px at 100% 0%,rgba(255,255,255,.22),transparent 60%),linear-gradient(150deg,${colors[0]},${colors[1]})` } : {}) };
  const brand = `<svg viewBox="0 0 64 64" width="70" height="70"><defs><linearGradient id="bg1" x1="8" y1="4" x2="56" y2="60" gradientUnits="userSpaceOnUse"><stop stop-color="#ff7a2f"/><stop offset="1" stop-color="#e5122f"/></linearGradient></defs><path d="M32 4C16.5 4 4 15.2 4 29c0 6.7 3 12.8 7.8 17.3L8 60l15-6.6c2.8.8 5.9 1.2 9 1.2 15.5 0 28-11.2 28-25S47.5 4 32 4z" fill="${t.brandFill}"/><path d="M22 39 42 19" stroke="${t.brandMark}" stroke-width="5.5" stroke-linecap="round"/><circle cx="23" cy="21" r="5" fill="${t.brandMark}"/><circle cx="41" cy="37" r="5" fill="${t.brandMark}"/></svg>`;
  const pts = points.slice(0, 4);
  const long = title.length > 24;
  const css = `body{position:relative;background:${t.bg};color:${t.fg};padding:58px 62px 50px;display:flex;flex-direction:column}
.deco{position:absolute;inset:0;pointer-events:none;overflow:hidden}
.deco .pct{position:absolute;left:-60px;bottom:-150px;font-size:720px;font-weight:800;line-height:1;color:${t.deco}}
.deco .ring{position:absolute;right:-120px;top:240px;width:420px;height:420px;border-radius:50%;border:34px dashed ${t.deco}}
.top,.main,.foot{position:relative}
.top{display:flex;align-items:center;justify-content:space-between}
.brand{display:flex;align-items:center;gap:14px;font-size:48px;font-weight:800;letter-spacing:-1px}
.badge{background:${t.chip};color:${t.chipFg || 'inherit'};border:2px solid ${t.chipLine};border-radius:999px;padding:12px 26px;font-size:32px;font-weight:700}
.main{flex:1;display:flex;flex-direction:column;justify-content:center;gap:0}
.head{display:flex;align-items:center;gap:34px}
.tile{flex:none;width:176px;height:176px;border-radius:44px;background:${t.tile};display:grid;place-items:center;font-size:112px;line-height:1;box-shadow:0 18px 40px rgba(0,0,0,.16)}
.big{font-size:300px;font-weight:800;line-height:.9;color:${t.accent};letter-spacing:-8px}
.biglabel{font-size:56px;font-weight:800;margin-top:6px}
h1{font-size:${long ? 70 : 82}px;font-weight:800;line-height:1.08;letter-spacing:-1.5px}
ul{list-style:none;padding:26px 30px;margin-top:36px;display:grid;gap:18px;background:${t.panel};border:2px solid ${t.panelLine};border-radius:30px;box-shadow:0 14px 40px rgba(0,0,0,.08)}
li{display:flex;align-items:center;gap:20px;font-size:${pts.some((p) => p.length > 30) ? 36 : 40}px;color:${t.sub};font-weight:600;line-height:1.25}
li b{flex:none;display:grid;place-items:center;width:60px;height:60px;border-radius:18px;background:${t.accent};color:${t.numFg};font-size:32px}
.foot{display:flex;justify-content:space-between;align-items:center;gap:20px}
.url{background:${t.url[0]};color:${t.url[1]};border-radius:999px;padding:14px 32px;font-size:34px;font-weight:800}
.tag{font-size:30px;font-weight:700;color:${t.tag}}
.codebox{align-self:flex-start;margin-top:30px;direction:ltr;font-family:ui-monospace,Menlo,monospace;font-weight:800;font-size:76px;letter-spacing:4px;background:#fff;color:#c8102e;border:5px dashed #ffb400;border-radius:24px;padding:14px 34px;box-shadow:0 16px 40px rgba(0,0,0,.2)}`;
  const head = bigNumber != null
    ? `<div class="big">${esc(bigNumber)}</div><div class="biglabel">${esc(bigLabel || '')}</div>${t.codeTitle ? `<div class="codebox">${esc(title)}</div>` : `<h1 style="margin-top:26px">${esc(title)}</h1>`}`
    : `<div class="head"><div class="tile">${emoji || '💡'}</div><h1>${esc(title)}</h1></div>`;
  const html = `<div class="deco"><div class="pct">%</div><div class="ring"></div></div>
<div class="top"><div class="brand">${brand}<span>${esc(name)}<span style="color:${t.bang}">!</span></span></div><div class="badge">${esc(t.badge)}</div></div>
<div class="main">
  ${head}
  ${pts.length ? `<ul>${pts.map((p, i) => `<li><b>${i + 1}</b><span>${esc(p)}</span></li>`).join('')}</ul>` : ''}
</div>
<div class="foot"><span class="url">${esc(site)}</span><span class="tag">קודי קופון לעליאקספרס 🇮🇱</span></div>`;
  return { css, html };
}

export async function cardHTML({ kind, title, subtitle, codes, footer, site = 'yeshdeal.com', name = 'יש דיל' }) {
  const font = async (f) => (await fs.readFile(path.join(ROOT, 'src/assets/fonts', f))).toString('base64');
  const [he, la] = await Promise.all([font('rubik-hebrew.woff2'), font('rubik-latin.woff2')]);
  if (TEXT_THEMES[kind]) {
    const { css, html } = textCardBody({ kind, emoji: arguments[0].emoji, title, points: arguments[0].points, bigNumber: arguments[0].bigNumber, bigLabel: arguments[0].bigLabel, badge: arguments[0].badge, colors: arguments[0].colors, site, name });
    return `<!DOCTYPE html><html dir="rtl" lang="he"><head><meta charset="utf-8"><style>
@font-face{font-family:R;src:url(data:font/woff2;base64,${he}) format('woff2');font-weight:400 800;unicode-range:U+0590-05FF,U+20AA}
@font-face{font-family:R;src:url(data:font/woff2;base64,${la}) format('woff2');font-weight:400 800}
*{box-sizing:border-box;margin:0}html,body{width:1080px;height:1080px;overflow:hidden}body{font-family:R,'Noto Color Emoji',sans-serif}
${css}</style></head><body>${html}</body></html>`;
  }
  const t = THEMES[kind] || THEMES.new;
  const list = (codes || []).slice(0, 10);
  const big = list.length <= 4;
  const mid = !big && list.length <= 6;
  const brandSize = 50;
  return `<!DOCTYPE html><html dir="rtl" lang="he"><head><meta charset="utf-8"><style>
@font-face{font-family:R;src:url(data:font/woff2;base64,${he}) format('woff2');font-weight:400 800;unicode-range:U+0590-05FF,U+20AA}
@font-face{font-family:R;src:url(data:font/woff2;base64,${la}) format('woff2');font-weight:400 800}
*{box-sizing:border-box;margin:0}
html,body{width:1080px;height:1080px;overflow:hidden}
body{position:relative;font-family:R,sans-serif;background:${t.bg};color:#fff;padding:56px 60px 48px;display:flex;flex-direction:column}
.pct{position:absolute;left:-50px;bottom:-170px;font-size:700px;font-weight:800;line-height:1;color:rgba(255,255,255,.07)}
.top,h1,.sub,.grid,.foot{position:relative}
.top{display:flex;align-items:center;justify-content:space-between}
.brand{display:flex;align-items:center;gap:14px;font-size:${brandSize}px;font-weight:800;letter-spacing:-1px}
.badge{background:rgba(255,255,255,.18);border:2px solid rgba(255,255,255,.35);border-radius:999px;padding:12px 26px;font-size:32px;font-weight:700}
h1{font-size:${big ? 80 : 66}px;font-weight:800;line-height:1.05;margin-top:30px;letter-spacing:-1.5px}
.sub{font-size:34px;opacity:.92;margin-top:10px}
.grid{flex:1;min-height:0;display:grid;grid-template-columns:${big ? '1fr' : '1fr 1fr'};gap:${big ? 18 : mid ? 18 : 14}px;align-content:center;margin:24px 0 22px}
.c{background:#fff;color:#1b1b24;border-radius:22px;padding:${big ? '20px 30px' : mid ? '22px 24px' : '13px 22px'};display:flex;align-items:center;justify-content:space-between;gap:14px;box-shadow:0 10px 30px rgba(0,0,0,.18)}
.amt{font-size:${big ? 58 : mid ? 52 : 42}px;font-weight:800;color:#c8102e;line-height:1}
.min{font-size:${big ? 28 : mid ? 26 : 22}px;color:#4a4a58;margin-top:2px}
.code{direction:ltr;font-family:ui-monospace,Menlo,monospace;font-weight:800;font-size:${big ? 40 : mid ? 32 : 28}px;border:3px dashed #e5122f;background:#fff1ec;color:#c8102e;border-radius:14px;padding:8px 14px;white-space:nowrap}
.foot{flex:none;display:flex;justify-content:space-between;align-items:center;font-size:32px;font-weight:700}
.url{background:#fff;color:#c8102e;border-radius:999px;padding:12px 28px}
</style></head><body>
<div class="pct">%</div>
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
