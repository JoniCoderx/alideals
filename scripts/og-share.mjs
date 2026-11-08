// Renders the homepage share image (src/assets/og-share.jpg, 1200x630) in the YeshDeal brand system.
import fs from 'node:fs/promises'; import os from 'node:os'; import path from 'node:path';
import { spawnSync } from 'node:child_process'; import { findChrome } from './telegram-card.mjs';
const b = async (f) => (await fs.readFile(f)).toString('base64');
const he = await b('src/assets/fonts/rubik-hebrew.woff2'), la = await b('src/assets/fonts/rubik-latin.woff2');
const logo = `<svg viewBox="0 0 64 64" width="70" height="70"><defs><linearGradient id="g" x1="8" y1="4" x2="56" y2="60" gradientUnits="userSpaceOnUse"><stop stop-color="#ff7a2f"/><stop offset="1" stop-color="#e5122f"/></linearGradient></defs><path d="M32 4C16.5 4 4 15.2 4 29c0 6.7 3 12.8 7.8 17.3L8 60l15-6.6c2.8.8 5.9 1.2 9 1.2 15.5 0 28-11.2 28-25S47.5 4 32 4z" fill="url(#g)"/><path d="M22 39 42 19" stroke="#fff" stroke-width="5.5" stroke-linecap="round"/><circle cx="23" cy="21" r="5" fill="#fff"/><circle cx="41" cy="37" r="5" fill="#fff"/></svg>`;
const item = (n, t, s) => `<div class="it"><b>${n}</b><div><h3>${t}</h3><p>${s}</p></div></div>`;
const html = `<!DOCTYPE html><html dir="rtl" lang="he"><head><meta charset="utf-8"><style>
@font-face{font-family:R;src:url(data:font/woff2;base64,${he}) format('woff2');font-weight:400 800;unicode-range:U+0590-05FF}
@font-face{font-family:R;src:url(data:font/woff2;base64,${la}) format('woff2');font-weight:400 800}
*{margin:0;box-sizing:border-box}html,body{width:1200px;height:630px;overflow:hidden}
body{font-family:R;background:#fffaf6;color:#17161c;position:relative;padding:56px 64px}
.disc{position:absolute;left:-150px;top:-120px;width:760px;height:760px;border-radius:50%;background:radial-gradient(circle at 35% 28%,rgba(255,255,255,.3),transparent 45%),linear-gradient(150deg,#ff7a2f,#e5122f)}
.ring{position:absolute;left:-176px;top:-146px;width:812px;height:812px;border-radius:50%;border:2px solid rgba(229,18,47,.18)}
.brand{display:flex;align-items:center;gap:14px;font-size:46px;font-weight:800;letter-spacing:-1px}.brand b{color:#e5122f}
h1{font-size:58px;font-weight:800;line-height:1.05;letter-spacing:-2px;margin-top:34px;width:600px}
.rule{width:110px;height:8px;border-radius:8px;background:linear-gradient(90deg,#e5122f,#ff7a2f);margin:22px 0}
.sub{font-size:28px;color:#5e5a66;width:600px;font-weight:500}
.card{position:absolute;left:70px;top:105px;width:430px;background:#fff;border-radius:28px;padding:30px 30px 18px;box-shadow:0 30px 60px rgba(60,0,12,.30)}
.it{display:flex;gap:16px;align-items:flex-start;margin-bottom:20px}.it b{flex:none;width:46px;height:46px;border-radius:14px;background:linear-gradient(150deg,#ff7a2f,#e5122f);color:#fff;font-size:24px;display:grid;place-items:center}
h3{font-size:27px;font-weight:800}p{font-size:21px;color:#5e5a66;margin-top:2px}
.url{position:absolute;right:64px;bottom:40px;font-size:28px;font-weight:800}
</style></head><body><div class="ring"></div><div class="disc"></div>
<div class="brand">${logo}<span>יש דיל<b>!</b></span></div>
<h1>קונים בעליאקספרס?<br>יש דיל.</h1><div class="rule"></div>
<div class="sub">כל מה שצריך לפני התשלום, במקום אחד.</div>
<div class="card">${item('1', 'הקוד שמתאים לסל', 'לפי סכום ההזמנה שלך')}${item('2', 'כמה יוצא בסוף', 'מחשבון הנחה בשקלים')}${item('3', 'דילים כל יום', 'בערוץ הטלגרם שלנו')}</div>
<div class="url">yeshdeal.com</div></body></html>`;
const d = await fs.mkdtemp(path.join(os.tmpdir(), 'og-')); await fs.writeFile(`${d}/o.html`, html);
spawnSync(findChrome(), ['--headless=new', '--no-sandbox', '--hide-scrollbars', '--force-device-scale-factor=1', '--window-size=1200,630', `--screenshot=${d}/o.png`, `file://${d}/o.html`], { stdio: 'ignore' });
spawnSync('python3', ['-c', `from PIL import Image;Image.open('${d}/o.png').convert('RGB').save('src/assets/og-share.jpg',quality=88)`]);
console.log('ok');
