// Renders the homepage share image (src/assets/og-share.jpg, 1200x630) in the YeshDeal brand system.
import fs from 'node:fs/promises'; import os from 'node:os'; import path from 'node:path';
import { spawnSync } from 'node:child_process'; import { findChrome } from './telegram-card.mjs';
const b = async (f) => (await fs.readFile(f)).toString('base64');
const he = await b('src/assets/fonts/rubik-hebrew.woff2'), la = await b('src/assets/fonts/rubik-latin.woff2');
const logo = `<svg viewBox="0 0 64 64" width="70" height="70"><defs><linearGradient id="g" x1="8" y1="4" x2="56" y2="60" gradientUnits="userSpaceOnUse"><stop stop-color="#ff7a2f"/><stop offset="1" stop-color="#e5122f"/></linearGradient></defs><path d="M32 4C16.5 4 4 15.2 4 29c0 6.7 3 12.8 7.8 17.3L8 60l15-6.6c2.8.8 5.9 1.2 9 1.2 15.5 0 28-11.2 28-25S47.5 4 32 4z" fill="url(#g)"/><path d="M22 39 42 19" stroke="#fff" stroke-width="5.5" stroke-linecap="round"/><circle cx="23" cy="21" r="5" fill="#fff"/><circle cx="41" cy="37" r="5" fill="#fff"/></svg>`;
const img = async (f) => `data:image/png;base64,${await b('src/assets/share/' + f)}`;
const pb = await img('powerbank.png'), gr = await img('grinder.png');
const bubble = `<svg viewBox="0 0 64 64" width="96" height="96"><path d="M32 4C16.5 4 4 15.2 4 29c0 6.7 3 12.8 7.8 17.3L8 60l15-6.6c2.8.8 5.9 1.2 9 1.2 15.5 0 28-11.2 28-25S47.5 4 32 4z" fill="#fff"/><path d="M22 39 42 19" stroke="#e5122f" stroke-width="5.5" stroke-linecap="round"/><circle cx="23" cy="21" r="5" fill="#e5122f"/><circle cx="41" cy="37" r="5" fill="#e5122f"/></svg>`;
const html = `<!DOCTYPE html><html dir="rtl" lang="he"><head><meta charset="utf-8"><style>
@font-face{font-family:R;src:url(data:font/woff2;base64,${he}) format('woff2');font-weight:400 800;unicode-range:U+0590-05FF}
@font-face{font-family:R;src:url(data:font/woff2;base64,${la}) format('woff2');font-weight:400 800}
*{margin:0;box-sizing:border-box}html,body{width:1200px;height:630px;overflow:hidden}
body{font-family:R;color:#fff;position:relative;padding:58px 64px;background:radial-gradient(700px 500px at 85% 0%,rgba(255,255,255,.22),transparent 60%),linear-gradient(135deg,#ff7a2f 0%,#f2402c 45%,#d40f2c 100%)}
.brand{display:flex;align-items:center;gap:18px;font-size:52px;font-weight:800;letter-spacing:-1px}
h1{font-size:76px;font-weight:800;line-height:1.02;letter-spacing:-2.5px;margin-top:36px;width:640px;text-shadow:0 4px 18px rgba(80,0,10,.25)}
h1 span{color:#ffe0a6}
.sub{font-size:29px;font-weight:500;margin-top:22px;width:600px;opacity:.95}
.pill{position:absolute;right:64px;bottom:52px;display:flex;gap:12px}
.pill b{background:#fff;color:#d40f2c;font-size:25px;font-weight:800;padding:11px 22px;border-radius:999px;box-shadow:0 10px 24px rgba(80,0,10,.25)}
.pill i{font-style:normal;border:2px solid rgba(255,255,255,.7);font-size:25px;font-weight:700;padding:9px 22px;border-radius:999px}
.stage{position:absolute;left:40px;top:60px;width:470px;height:510px}
.glow{position:absolute;left:30px;top:40px;width:420px;height:420px;border-radius:50%;background:rgba(255,255,255,.16);border:2px solid rgba(255,255,255,.28)}
.p{position:absolute;filter:drop-shadow(0 26px 30px rgba(60,0,10,.45))}
.p1{left:10px;top:80px;height:390px;transform:rotate(-6deg)}
.p2{left:265px;top:30px;height:470px}
</style></head><body>
<div class="stage"><div class="glow"></div><img class="p p1" src="${pb}"><img class="p p2" src="${gr}"></div>
<div class="brand">${bubble}<span>יש דיל!</span></div>
<h1>לפני שקונים,<br>בודקים אם <span>יש דיל!</span></h1>
<div class="sub">קופונים, מחשבון הנחה ודילים נבחרים מעליאקספרס. בעברית ובחינם.</div>
<div class="pill"><b>yeshdeal.com</b><i>+9,000 בטלגרם</i></div>
</body></html>`;
const d = await fs.mkdtemp(path.join(os.tmpdir(), 'og-')); await fs.writeFile(`${d}/o.html`, html);
spawnSync(findChrome(), ['--headless=new', '--no-sandbox', '--hide-scrollbars', '--force-device-scale-factor=1', '--window-size=1200,630', `--screenshot=${d}/o.png`, `file://${d}/o.html`], { stdio: 'ignore' });
spawnSync('python3', ['-c', `from PIL import Image;Image.open('${d}/o.png').convert('RGB').save('src/assets/og-share.jpg',quality=88)`]);
console.log('ok');
