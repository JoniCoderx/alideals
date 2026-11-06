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
const bubbleOG = (s, fill, mark) => `<svg width="${s}" height="${s}" viewBox="0 0 64 64"><path d="M32 4C16.5 4 4 15.2 4 29c0 6.7 3 12.8 7.8 17.3L8 60l15-6.6c2.8.8 5.9 1.2 9 1.2 15.5 0 28-11.2 28-25S47.5 4 32 4z" fill="${fill}"/><path d="M22 39 42 19" stroke="${mark}" stroke-width="5.5" stroke-linecap="round"/><circle cx="23" cy="21" r="5" fill="${mark}"/><circle cx="41" cy="37" r="5" fill="${mark}"/></svg>`;
const ticket = (amt, sub, rot, x, y, z) => `<div style="position:absolute;left:${x}px;top:${y}px;transform:rotate(${rot}deg);z-index:${z};width:300px;height:170px;background:#fff;border-radius:26px;box-shadow:0 24px 60px rgba(80,0,10,.35);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px">
  <div style="position:absolute;top:50%;left:-18px;width:36px;height:36px;border-radius:50%;background:#e01e2f;transform:translateY(-50%)"></div>
  <div style="position:absolute;top:50%;right:-18px;width:36px;height:36px;border-radius:50%;background:#e01e2f;transform:translateY(-50%)"></div>
  <div style="font-size:84px;font-weight:800;color:#c8102e;line-height:1;letter-spacing:-2px">${amt}</div>
  <div style="font-size:28px;color:#4a4a58;font-weight:600">${sub}</div>
  <div style="margin-top:6px;border:3px dashed #e5122f;border-radius:10px;padding:2px 14px;font:800 24px ui-monospace,monospace;color:#c8102e;direction:ltr;letter-spacing:2px">CODE•••</div></div>`;

const OG = `<div style="width:1200px;height:630px;position:relative;overflow:hidden;background:radial-gradient(700px 500px at 15% 20%,#ff8a3d 0%,transparent 60%),linear-gradient(135deg,#ff6a2b 0%,#e5122f 55%,#a80c2c 100%);color:#fff">
  <div style="position:absolute;left:-60px;bottom:-90px;opacity:.10">${bubbleOG(520, '#fff', '#e5122f')}</div>
  ${ticket('%', 'הנחה בתשלום', -10, 70, 120, 1)}${ticket('$', 'לפי סכום העגלה', 8, 250, 300, 2)}
  <div style="position:absolute;right:80px;top:0;bottom:0;width:640px;display:flex;flex-direction:column;justify-content:center">
    <div style="display:flex;align-items:center;gap:18px">${bubbleOG(96, '#fff', '#e5122f')}<span style="font-size:84px;font-weight:800;letter-spacing:-2px">יש דיל!</span></div>
    <div style="font-size:76px;font-weight:800;line-height:1.02;margin-top:30px;letter-spacing:-2px">קוד קופון<br>לעליאקספרס</div>
    <div style="font-size:36px;margin-top:20px;opacity:.95">כל הקודים לישראל, במקום אחד</div>
    <div style="margin-top:30px;display:inline-flex;align-self:flex-start;background:#fff;color:#c8102e;border-radius:999px;padding:14px 32px;font-size:34px;font-weight:800">yeshdeal.com</div>
  </div></div>`;


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
  // Social share image (Open Graph): JPEG to stay well under WhatsApp's ~300KB preview limit.
  {
    const p = await b.newPage({ viewport: { width: 1200, height: 630 } });
    await p.setContent(`<html dir="rtl"><head><style>${FONTS}body{margin:0;font-family:R,sans-serif}</style></head><body>${OG}</body></html>`);
    await p.evaluate(() => document.fonts.ready);
    await p.screenshot({ path: path.join(A, 'og-v2.jpg'), type: 'jpeg', quality: 88 });
    await p.close();
  }
  await b.close();
  console.log('✓ assets written to src/assets');
})();
