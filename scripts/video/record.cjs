// Records the real yeshdeal.com on a phone viewport, one clip per beat. Writes clips/*.webm + marks.json (trim points).
const { chromium } = require('playwright');
const fs = require('fs');
const OUT = __dirname + '/clips';
fs.mkdirSync(OUT, { recursive: true });
const marks = {};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function clip(name, fn) {
  const b = await chromium.launch();
  const c = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, recordVideo: { dir: OUT, size: { width: 780, height: 1688 } }, permissions: ['clipboard-read', 'clipboard-write'] });
  const p = await c.newPage();
  const t0 = Date.now();
  const mark = (k) => { (marks[name] ||= {})[k] = (Date.now() - t0) / 1000; };
  await fn(p, mark);
  const v = p.video();
  await c.close();
  fs.renameSync(await v.path(), `${OUT}/${name}.webm`);
  await b.close();
  console.log('recorded', name, JSON.stringify(marks[name]));
}

(async () => {
  // 1) calculator
  await clip('calc', async (p, mark) => {
    await p.goto('https://yeshdeal.com/', { waitUntil: 'networkidle' });
    await p.evaluate(() => document.getElementById('calc').scrollIntoView({ block: 'center' }));
    await sleep(900); mark('start');
    await p.click('#calc-amount'); await sleep(300);
    await p.type('#calc-amount', '60', { delay: 260 });
    await sleep(2600); mark('end');
  });
  // 2) copy a code
  await clip('copy', async (p, mark) => {
    await p.goto('https://yeshdeal.com/', { waitUntil: 'networkidle' });
    await p.evaluate(() => { const el = [...document.querySelectorAll('.coupon')][2]; el.scrollIntoView({ block: 'center' }); });
    await sleep(900); mark('start');
    const btn = (await p.$$('.coupon [data-reveal]'))[2];
    await btn.click(); await sleep(2200); mark('end');
  });
  // 3) deal hunter
  await clip('hunter', async (p, mark) => {
    await p.goto('https://yeshdeal.com/finder/', { waitUntil: 'networkidle' });
    await p.evaluate(() => document.getElementById('finder-url').scrollIntoView({ block: 'center' }));
    await sleep(900); mark('start');
    await p.click('#finder-url');
    await p.type('#finder-url', 'https://he.aliexpress.com/item/1005009418411818.html', { delay: 28 });
    await sleep(400); mark('submit');
    await p.click('#finder-go');
    await p.waitForSelector('.verdict', { timeout: 45000 }); mark('result');
    await sleep(300);
    await p.evaluate(() => document.querySelector('.verdict').scrollIntoView({ behavior: 'smooth', block: 'start' }));
    await sleep(3200); mark('end');
  });
  // 4) picks carousel
  await clip('picks', async (p, mark) => {
    await p.goto('https://yeshdeal.com/', { waitUntil: 'networkidle' });
    await p.evaluate(() => document.getElementById('picks').scrollIntoView({ block: 'start' }));
    await p.evaluate(() => window.scrollBy(0, -10));
    await sleep(1200); mark('start');
    for (let i = 0; i < 3; i++) { await p.evaluate(() => { const r = document.querySelector('.picks-row'); r.scrollBy({ left: -r.clientWidth * 0.72, behavior: 'smooth' }); }); await sleep(1300); }
    mark('end');
  });
  fs.writeFileSync(__dirname + '/marks.json', JSON.stringify(marks, null, 1));
})();
