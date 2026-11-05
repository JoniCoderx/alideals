// Regenerates PNG brand assets (app icons + social share image) from the SVG logo.
// Dev-only: needs Playwright + Chromium.  Run: node scripts/dev/make-assets.cjs
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const A = path.join(__dirname, '../../src/assets');
const font = (f) => 'data:font/woff2;base64,' + fs.readFileSync(path.join(A, 'fonts', f)).toString('base64');
const FONTS = `@font-face{font-family:R;src:url(${font('rubik-hebrew.woff2')}) format('woff2');font-weight:400 800;unicode-range:U+0590-05FF}
@font-face{font-family:R;src:url(${font('rubik-latin.woff2')}) format('woff2');font-weight:400 800}`;
const bubble = (size, fill = 'url(#g)', mark = '#fff') => `<svg width="${size}" height="${size}" viewBox="0 0 64 64"><defs><linearGradient id="g" x1="8" y1="4" x2="56" y2="60" gradientUnits="userSpaceOnUse"><stop stop-color="#ff7a2f"/><stop offset="1" stop-color="#e5122f"/></linearGradient></defs><path d="M32 4C16.5 4 4 15.2 4 29c0 6.7 3 12.8 7.8 17.3L8 60l15-6.6c2.8.8 5.9 1.2 9 1.2 15.5 0 28-11.2 28-25S47.5 4 32 4z" fill="${fill}"/><path d="M22 39 42 19" stroke="${mark}" stroke-width="5.5" stroke-linecap="round"/><circle cx="23" cy="21" r="5" fill="${mark}"/><circle cx="41" cy="37" r="5" fill="${mark}"/></svg>`;
// App icon: brand gradient square, white bubble with red %.
const appIcon = (s) => `<div style="width:${s}px;height:${s}px;display:grid;place-items:center;background:linear-gradient(135deg,#ff7a2f,#e5122f)">${bubble(Math.round(s * 0.66), '#fff', '#e5122f')}</div>`;
(async () => {
  const b = await chromium.launch();
  const shot = async (w, h, html, file, transparent = false) => {
    const p = await b.newPage({ viewport: { width: w, height: h } });
    await p.setContent(`<html dir="rtl"><head><style>${FONTS}body{margin:0;font-family:R,sans-serif}</style></head><body>${html}</body></html>`);
    await p.evaluate(() => document.fonts.ready);
    await p.screenshot({ path: path.join(A, file), omitBackground: transparent });
    await p.close();
  };
  await shot(180, 180, appIcon(180), 'apple-touch-icon.png');
  await shot(192, 192, appIcon(192), 'icon-192.png');
  await shot(512, 512, appIcon(512), 'icon-512.png');
  await shot(1200, 630, `<div style="width:1200px;height:630px;box-sizing:border-box;padding:0 96px;display:flex;flex-direction:column;justify-content:center;background:radial-gradient(900px 520px at 100% 0%,#ffd6c2,transparent 60%),radial-gradient(700px 500px at 0% 100%,#ffe3e6,transparent 60%),#fffaf7">
    <div style="display:flex;align-items:center;gap:26px">${bubble(132)}<span style="font-size:118px;font-weight:800;color:#1b1b24;letter-spacing:-2px">יש דיל<span style="color:#e5122f">!</span></span></div>
    <div style="font-size:60px;font-weight:800;margin-top:40px;color:#c8102e">קוד קופון אליאקספרס</div>
    <div style="font-size:38px;color:#4a4a58;margin-top:12px">כל הקודים לישראל, לפי סכום העגלה</div></div>`, 'og.png');
  await b.close();
  console.log('✓ assets written to src/assets');
})();
