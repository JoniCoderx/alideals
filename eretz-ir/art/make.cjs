const { chromium } = require('playwright'); const path = require('path');
(async () => {
  const b = await chromium.launch(); const dir = process.argv[2]; const out = process.argv[3];
  const p = await b.newPage({ viewport: { width: 1200, height: 630 } });
  await p.goto('file://' + path.join(dir, 'og.html')); await p.waitForTimeout(1500); await p.evaluate(() => document.fonts.ready);
  await p.screenshot({ path: out + '/og-image.png' });
  await p.goto('file://' + path.join(dir, 'og-en.html')); await p.waitForTimeout(1200); await p.evaluate(() => document.fonts.ready);
  await p.screenshot({ path: out + '/og-image-en.png' });
  const q = await b.newPage({ viewport: { width: 512, height: 512 } });
  await q.goto('file://' + path.join(dir, 'icon.html')); await q.evaluate(() => document.fonts.ready); await q.waitForTimeout(800);
  await q.screenshot({ path: out + '/icon-512.png', omitBackground: true });
  // maskable / apple: full-bleed square (no rounded corners, safe zone)
  await q.addStyleTag({ content: '.i{--r:0;--f:280px}' }); await q.waitForTimeout(200);
  await q.screenshot({ path: out + '/icon-maskable-512.png' });
  for (const [s, name, css] of [[192, 'icon-192.png', '.i{--r:112px;--f:330px}'], [180, 'apple-touch-icon.png', '.i{--r:0;--f:300px}'], [32, 'favicon-32.png', '.i{--r:112px;--f:380px}']]) {
    const r = await b.newPage({ viewport: { width: 512, height: 512 }, deviceScaleFactor: s / 512 });
    await r.goto('file://' + path.join(dir, 'icon.html')); await r.addStyleTag({ content: css }); await r.evaluate(() => document.fonts.ready); await r.waitForTimeout(500);
    await r.screenshot({ path: out + '/' + name, omitBackground: true });
  }
  await b.close();
})();
