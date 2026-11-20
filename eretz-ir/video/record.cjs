// מקליט את המשחק החי מטלפון של "יוני" (מארח), כשדנה ואבי משחקים ברקע. כותב clips/game.webm + marks.json
const { chromium } = require('playwright'); const fs = require('fs'); const D = __dirname;
const U = 'https://eretz-ir.joni0000.workers.dev';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  fs.mkdirSync(D + '/clips', { recursive: true });
  const b = await chromium.launch();
  const ctxA = await b.newContext({ viewport: { width: 780, height: 1688 }, deviceScaleFactor: 1, hasTouch: true });
  // זום 2 על הדף: הפריסה כמו טלפון ברוחב 390, אבל כל פיקסל אמיתי ברזולוציה 780x1688
  await ctxA.addInitScript(() => { const st = document.createElement('style'); st.textContent = 'html{zoom:2}'; document.addEventListener('DOMContentLoaded', () => document.head.appendChild(st)); });
  const A = await ctxA.newPage(); A.on('dialog', (d) => d.accept());
  // צילום מסך רציף ברזולוציה מלאה (780x1688) במקום מקליט הווידאו המובנה (שמקליט 390 פיקסלים)
  fs.rmSync(D + '/shots', { recursive: true, force: true }); fs.mkdirSync(D + '/shots');
  const cdp = await ctxA.newCDPSession(A); const shots = []; let tFirst = null;
  cdp.on('Page.screencastFrame', async (f) => {
    const ts = f.metadata.timestamp; const name = `s_${String(shots.length).padStart(5, '0')}.jpg`;
    fs.writeFileSync(D + '/shots/' + name, Buffer.from(f.data, 'base64')); shots.push({ name, ts });
    cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 95, maxWidth: 780, maxHeight: 1688, everyNthFrame: 1 });
  const mk = async () => { const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage(); p.on('dialog', (d) => d.accept()); return p; };
  const t0 = Date.now(); const wall0 = Date.now() / 1000; const M = {}; const mark = (k) => { M[k] = (Date.now() - t0) / 1000; console.log(k, M[k]); };
  await A.goto(U, { waitUntil: 'networkidle' }); await A.evaluate(() => localStorage.clear()); await A.reload({ waitUntil: 'networkidle' }); await sleep(1200);
  mark('home');
  await A.tap('#name'); await A.type('#name', 'יוני', { delay: 140 }); await sleep(350);
  mark('create'); await A.tap('.btn.primary'); await A.waitForSelector('#lb-code'); await sleep(300);
  mark('lobby');
  // הגדרות למשחק קצר: סיבוב אחד, אות ב, עצור עם 3 שניות
  await A.evaluate(async () => { const s = JSON.parse(localStorage.getItem('eretzir:session')); await fetch('/api/action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...s, type: 'settings', settings: { letters: ['ב'], rounds: 1, roundSeconds: 90, stopGrace: 3 } }) }); });
  const code = (await A.textContent('#lb-code')).trim();
  await sleep(1500);
  const B = await mk(), C = await mk();
  await B.goto(U + '/' + code); await B.fill('#name', 'דנה'); await B.click('.btn.primary'); await B.waitForSelector('#lb-players li');
  mark('joined1'); await sleep(1300);
  await C.goto(U + '/' + code); await C.fill('#name', 'אבי'); await C.click('.btn.primary'); await C.waitForSelector('#lb-players li');
  mark('joined2'); await sleep(1600);
  mark('start'); await A.tap('#lb-cta .btn.primary');
  await A.waitForFunction(() => document.querySelector('#a0') && !document.querySelector('#a0').disabled, null, { timeout: 10000 });
  mark('play');
  // החברים ממלאים ברקע
  const fill = async (P, arr) => { for (let i = 0; i < arr.length; i++) if (arr[i]) await P.fill('#a' + i, arr[i]); };
  fill(B, ['ברזיל', 'בני ברק', '', 'בננה', 'בקבוק', '', 'בר', '']);
  fill(C, ['בלגיה', 'ב', 'ביבר', '', '', 'בנאי', '', '']);
  const typ = async (i, w) => { await A.tap('#a' + i); await A.type('#a' + i, w, { delay: 75 }); await sleep(260); };
  await typ(0, 'ברזיל'); mark('typed1');
  await typ(1, 'בת יאם'); await sleep(700); mark('typo');
  await A.tap('#hint1 .fix-btn'); await sleep(700); mark('fixed');
  await typ(2, 'ברווז'); await typ(3, 'בננה'); await typ(4, 'בקבוק'); await typ(5, 'בנאי'); await typ(6, 'בן'); await typ(7, 'בר רפאלי');
  await A.evaluate(() => document.activeElement && document.activeElement.blur()); await sleep(600);
  mark('stop'); await A.tap('#g-stop');
  await A.waitForSelector('#rv-cats .ans-row', { timeout: 15000 }); await sleep(500);
  mark('review');
  // גלילה לקטגוריית "חי" ואישור "ביבר" של אבי
  await A.evaluate(() => { const c = document.querySelectorAll('.cat-card')[2]; window.scrollTo({ top: c.getBoundingClientRect().top + scrollY - 160, behavior: 'smooth' }); }); await sleep(1100);
  mark('approve'); await A.locator('.cat-card').nth(2).locator('.vote.up').first().tap(); await sleep(1300);
  await B.click('text=סיימתי לבדוק'); await C.click('text=סיימתי לבדוק'); await sleep(300);
  mark('done'); await A.tap('#rv-cta .btn.primary');
  await A.waitForSelector('.podium', { timeout: 10000 });
  mark('final'); await sleep(4200); mark('end');
  await cdp.send('Page.stopScreencast'); await sleep(300);
  // רשימת פריימים עם משכים לפי זמן אמיתי (ts הוא שעון קיר בשניות)
  let list = ''; for (let i = 0; i < shots.length; i++) { const d = i + 1 < shots.length ? shots[i + 1].ts - shots[i].ts : 0.1; list += `file 'shots/${shots[i].name}'\nduration ${Math.max(0.001, d).toFixed(4)}\n`; }
  fs.writeFileSync(D + '/shots.txt', list);
  M._offset = shots[0].ts - wall0; // הסטה בין תחילת הצילום ל-t0 של הסימונים
  await ctxA.close();
  fs.writeFileSync(D + '/marks.json', JSON.stringify(M, null, 1)); await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
