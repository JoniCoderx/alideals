// Brand graphics for the reel (1080x1920): background, phone mask, captions (transparent), hook + CTA cards.
const { chromium } = require('playwright');
const fs = require('fs');
const ROOT = '/home/user/alideals';
const b64 = (f) => fs.readFileSync(f).toString('base64');
const he = b64(`${ROOT}/src/assets/fonts/rubik-hebrew.woff2`), la = b64(`${ROOT}/src/assets/fonts/rubik-latin.woff2`);
const PH = { w: 666, h: 1440, x: 207, y: 360 };
fs.writeFileSync(__dirname + '/layout.json', JSON.stringify(PH));
const logo = (s, inv) => `<svg viewBox="0 0 64 64" width="${s}" height="${s}"><defs><linearGradient id="g" x1="8" y1="4" x2="56" y2="60" gradientUnits="userSpaceOnUse"><stop stop-color="#ff7a2f"/><stop offset="1" stop-color="#e5122f"/></linearGradient></defs><path d="M32 4C16.5 4 4 15.2 4 29c0 6.7 3 12.8 7.8 17.3L8 60l15-6.6c2.8.8 5.9 1.2 9 1.2 15.5 0 28-11.2 28-25S47.5 4 32 4z" fill="${inv ? '#fff' : 'url(#g)'}"/><path d="M22 39 42 19" stroke="${inv ? '#e5122f' : '#fff'}" stroke-width="5.5" stroke-linecap="round"/><circle cx="23" cy="21" r="5" fill="${inv ? '#e5122f' : '#fff'}"/><circle cx="41" cy="37" r="5" fill="${inv ? '#e5122f' : '#fff'}"/></svg>`;
const base = (body, bg = 'transparent') => `<!DOCTYPE html><html dir="rtl" lang="he"><head><meta charset="utf-8"><style>
@font-face{font-family:R;src:url(data:font/woff2;base64,${he}) format('woff2');font-weight:300 900;unicode-range:U+0590-05FF}
@font-face{font-family:R;src:url(data:font/woff2;base64,${la}) format('woff2');font-weight:300 900}
*{margin:0;box-sizing:border-box}html,body{width:1080px;height:1920px;overflow:hidden;background:${bg};font-family:R;color:#fff}
.cap{position:absolute;top:96px;left:60px;right:60px;text-align:center}
.cap h1{font-size:78px;font-weight:800;line-height:1.08;letter-spacing:-2px;text-shadow:0 6px 24px rgba(0,0,0,.35)}
.cap p{margin-top:16px;font-size:42px;font-weight:600;color:#ffd2bd}
.step{display:inline-block;margin-bottom:18px;font-size:30px;font-weight:800;background:#fff;color:#e5122f;border-radius:999px;padding:6px 22px}
</style></head><body>${body}</body></html>`;
const bgHtml = `<div style="position:absolute;inset:0;background:radial-gradient(900px 700px at 80% 10%,rgba(255,122,47,.55),transparent 60%),radial-gradient(900px 800px at 10% 95%,rgba(229,18,47,.5),transparent 60%),linear-gradient(160deg,#1a1216,#0e0b10)"></div>
<div style="position:absolute;left:${PH.x - 14}px;top:${PH.y - 14}px;width:${PH.w + 28}px;height:${PH.h + 28}px;border-radius:64px;background:#0b0a0d;box-shadow:0 40px 90px rgba(0,0,0,.55),0 0 0 2px rgba(255,255,255,.08)"></div>
<div style="position:absolute;bottom:52px;left:0;right:0;display:flex;justify-content:center;align-items:center;gap:14px;font-size:34px;font-weight:800">${logo(52)}<span>yeshdeal.com</span></div>`;
const caps = {
  calc: ['1', 'מקלידים כמה יש בעגלה', 'והמחשבון בוחר את הקוד'],
  copy: ['2', 'הקוד מועתק בלחיצה', 'מדביקים בתשלום וזהו'],
  hunt1: ['3', 'שולחים לצייד קישור', 'מכל מוצר בעליאקספרס'],
  hunt2: ['3', 'מקבלים את המחיר הכי טוב', 'וכמה זה יוצא עם קופון'],
  picks: ['4', 'מוצרים נבחרים', 'עם מחירים שמתעדכנים כל שעה'],
};
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1080, height: 1920 } });
  const shot = async (html, f, transparent) => { await p.setContent(html); await p.waitForTimeout(150); await p.screenshot({ path: `${__dirname}/${f}`, omitBackground: !!transparent }); };
  await shot(base(bgHtml, '#0e0b10'), 'bg.png');
  await shot(base(`<div style="position:absolute;left:${PH.x}px;top:${PH.y}px;width:${PH.w}px;height:${PH.h}px;border-radius:52px;background:#fff"></div>`, '#000'), 'mask.png');
  for (const [k, [n, h, s]] of Object.entries(caps)) await shot(base(`<div class="cap"><span class="step">שלב ${n}</span><h1>${h}</h1><p>${s}</p></div>`), `cap-${k}.png`, true);
  await shot(base(`<div style="position:absolute;inset:0;background:radial-gradient(900px 700px at 70% 20%,rgba(255,255,255,.22),transparent 60%),linear-gradient(150deg,#ff7a2f,#e5122f 60%,#b40d27)"></div>
<div style="position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;padding:0 70px">
  ${logo(150, true)}
  <h1 style="margin-top:50px;font-size:104px;font-weight:900;line-height:1.02;letter-spacing:-3px">משלמים יותר מדי<br>בעליאקספרס?</h1>
  <p style="margin-top:34px;font-size:50px;font-weight:700;opacity:.95">ככה חוסכים ב־30 שניות</p>
</div>`), 'hook.png');
  await shot(base(`<div style="position:absolute;inset:0;background:radial-gradient(900px 700px at 70% 20%,rgba(255,255,255,.22),transparent 60%),linear-gradient(150deg,#ff7a2f,#e5122f 60%,#b40d27)"></div>
<div style="position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;padding:0 70px">
  ${logo(170, true)}
  <h1 style="margin-top:40px;font-size:120px;font-weight:900;letter-spacing:-3px">יש דיל!</h1>
  <p style="margin-top:10px;font-size:46px;font-weight:700">קודים, דילים וצייד מחירים לעליאקספרס</p>
  <div style="margin-top:70px;background:#fff;color:#e5122f;border-radius:999px;padding:24px 60px;font-size:64px;font-weight:900;direction:ltr">yeshdeal.com</div>
  <p style="margin-top:40px;font-size:40px;font-weight:700;opacity:.95">חינם · בעברית · קודים חדשים בטלגרם</p>
</div>`), 'cta.png');
  await b.close();
  console.log('cards ok');
})();
