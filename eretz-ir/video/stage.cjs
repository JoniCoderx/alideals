// ארץ עיר – סרטון פרומו 4:5 (1080x1350, 30fps). רינדור דטרמיניסטי: render(t) קובע כל אלמנט לפי ציר הזמן,
// Playwright מזיז את הקליפ לזמן המדויק ומצלם כל פריים. בסגנון ה-reel v2 של יש דיל: טלפון תלת-ממדי, כיתובים קינטיים,
// מדבקות, "פאנץ'" זום עדין בלי רעידות, רקע שמכסה את כל הפריים, כיתובים מעל הטלפון.
const { chromium } = require('playwright');
const fs = require('fs'); const http = require('http'); const path = require('path');
const D = __dirname; const FPS = 30, W = 1080, H = 1350;
const M0 = JSON.parse(fs.readFileSync(path.join(D, 'marks.json'), 'utf8'));
const M = Object.fromEntries(Object.entries(M0).map(([k, v]) => [k, v - (M0._offset || 0)]));
const b64 = (f) => fs.readFileSync(path.join(D, f)).toString('base64');
const he = b64('rubik-hebrew.woff2'), la = b64('rubik-latin.woff2');

// ציר זמן (שניות) – חיתוכים על גריד של 120 BPM (חצי שנייה)
const S = [
  { id: 'hook', t0: 0, t1: 3.0 },
  { id: 's1', t0: 3.0, t1: 6.0, c0: M.create - 0.9, step: '1', h: 'פותחים חדר', p: 'בלי הרשמה ובלי הורדה', sticker: { at: 1.3, text: 'בחינם!', x: 70, y: 720 }, ry: [-26, -10] },
  { id: 's2', t0: 6.0, t1: 9.5, c0: M.joined1 - 1.4, step: '2', h: 'שולחים קישור לחברים', p: 'בוואטסאפ, והם בפנים', sticker: { at: 1.4, text: 'עד 16 שחקנים', x: 640, y: 980 }, ry: [24, 10] },
  { id: 's3', t0: 9.5, t1: 12.5, c0: M.play - 2.0, step: '3', h: 'מגרילים אות…', p: 'ומתחילים לכתוב!', punch: 2.0, origin: '50% 18%', ry: [-20, -6] },
  { id: 's4', t0: 12.5, t1: 16.5, c0: M.typed1 - 0.9, step: '4', h: 'כל תשובה נבדקת', p: 'טעות כתיב? מתקנים בלחיצה', sticker: { at: 0.75, text: '✓ במילון', x: 80, y: 600 }, punch: 2.6, origin: '50% 30%', ry: [22, 8] },
  { id: 's5', t0: 16.5, t1: 19.0, c0: M.stop - 0.5, step: '5', h: 'עצור!', p: 'לשאר נשארו 3 שניות', sticker: { at: 0.6, text: '✋ עצור!', x: 650, y: 760 }, ry: [-22, -8] },
  { id: 's6', t0: 19.0, t1: 22.0, c0: M.approve - 0.6, step: '6', h: 'בודקים ביחד', p: '👍 מאשרים · 👎 פוסלים', sticker: { at: 0.85, text: '+10', x: 90, y: 820 }, punch: 0.7, origin: '50% 40%', ry: [20, 6] },
  { id: 's7', t0: 22.0, t1: 25.0, c0: M.final - 0.05, step: '🏆', h: 'ויש מנצח!', p: 'טבלה ופודיום בסוף', sticker: { at: 1.0, text: '65 נקודות 🏆', x: 600, y: 700 }, punch: 1.6, origin: '50% 25%', ry: [-18, -6] },
  { id: 'outro', t0: 25.0, t1: 29.0 },
];
const DUR = S[S.length - 1].t1;
fs.writeFileSync(path.join(D, 'timeline.json'), JSON.stringify({ S, DUR, FPS }));

const tiles = (word, cls = '') => [...word].map((l, i) => `<span class="tile ${cls}" style="--i:${i}">${l}</span>`).join('');
const html = `<!DOCTYPE html><html dir="rtl" lang="he"><head><meta charset="utf-8"><style>
@font-face{font-family:R;src:url(data:font/woff2;base64,${he}) format('woff2');font-weight:300 900;unicode-range:U+0590-05FF}
@font-face{font-family:R;src:url(data:font/woff2;base64,${la}) format('woff2');font-weight:300 900}
*{margin:0;box-sizing:border-box}
html,body{width:${W}px;height:${H}px;overflow:hidden;position:relative;background:#14111f;font-family:R;color:#fff}
#bg{position:absolute;left:-60px;top:-60px;width:1200px;height:1470px;background:radial-gradient(720px 620px at 78% 18%,rgba(255,107,53,.72),transparent 62%),radial-gradient(760px 680px at 12% 88%,rgba(255,196,0,.45),transparent 62%),radial-gradient(600px 600px at 20% 25%,rgba(120,80,255,.28),transparent 60%),linear-gradient(160deg,#221a33,#100d18)}
#grid{position:absolute;left:-200px;right:-200px;bottom:-140px;height:760px;background-image:linear-gradient(rgba(255,255,255,.07) 2px,transparent 2px),linear-gradient(90deg,rgba(255,255,255,.07) 2px,transparent 2px);background-size:90px 90px;transform-origin:50% 0%;mask-image:linear-gradient(to bottom,transparent,#000 40%)}
#stage{position:absolute;z-index:1;left:0;right:0;top:300px;height:1060px;perspective:1700px;perspective-origin:50% 35%}
#phone{position:absolute;left:50%;top:0;width:430px;height:932px;margin-left:-215px;border-radius:60px;background:linear-gradient(145deg,#2c2c34,#0b0b0e);padding:14px;box-shadow:0 70px 120px rgba(0,0,0,.6),0 0 0 2px rgba(255,255,255,.12),0 0 90px rgba(255,107,53,.30);transform-style:preserve-3d}
#phone:before{content:'';position:absolute;top:22px;left:50%;width:110px;height:30px;margin-left:-55px;border-radius:20px;background:#000;z-index:3}
#phone .scr{position:relative;width:100%;height:100%;border-radius:47px;overflow:hidden;background:#fff8f0}
#phone video{width:100%;height:100%;object-fit:cover;object-position:50% 0%}
#phone .glare{position:absolute;inset:0;border-radius:47px;background:linear-gradient(115deg,rgba(255,255,255,.20),transparent 32%,transparent 72%,rgba(255,255,255,.05));pointer-events:none}
#shadow{position:absolute;left:50%;top:960px;width:420px;height:60px;margin-left:-210px;border-radius:50%;background:radial-gradient(closest-side,rgba(0,0,0,.55),transparent);filter:blur(6px)}
#cap{position:absolute;z-index:5;top:54px;left:40px;right:40px;text-align:center}
#cap .chip{display:inline-block;font-size:28px;font-weight:800;background:#fff;color:#ef5b24;border-radius:999px;padding:6px 22px;margin-bottom:12px}
#cap h1{font-size:80px;font-weight:900;line-height:1.02;letter-spacing:-2px;text-shadow:0 8px 28px rgba(0,0,0,.45)}
#cap p{margin-top:10px;font-size:40px;font-weight:700;color:#ffd9c2}
.sticker{position:absolute;z-index:6;padding:16px 28px;border-radius:22px;font-size:48px;font-weight:900;background:linear-gradient(150deg,#ffe066,#ffb703);color:#2a1300;box-shadow:0 18px 40px rgba(0,0,0,.45),0 0 0 4px #fff;white-space:nowrap;opacity:0}
.tile{display:inline-grid;place-items:center;width:132px;height:146px;margin:0 7px;border-radius:26px;background:#fff;color:#ef5b24;font-size:96px;font-weight:900;box-shadow:0 12px 0 #e7d6c4,0 26px 50px rgba(0,0,0,.45);opacity:0}
.tile.o{background:#ef5b24;color:#fff;box-shadow:0 12px 0 #c9461a,0 26px 50px rgba(0,0,0,.45)}
#hook,#outro{position:absolute;inset:0;display:none;flex-direction:column;justify-content:center;align-items:center;text-align:center;perspective:1200px}
#hook .q{font-size:84px;font-weight:900;letter-spacing:-2px;opacity:0;margin-top:46px;text-shadow:0 10px 40px rgba(0,0,0,.5)}
#hook .q b{color:#ffd166}
#hook .row{display:flex;gap:0}
#outro .row{display:flex}
#outro h2{font-size:104px;font-weight:900;letter-spacing:-3px;margin-top:44px;opacity:0}
#outro h2 span{color:#ff8a50}
#outro .url{margin-top:36px;background:#fff;color:#ef5b24;border-radius:999px;padding:20px 46px;font-size:44px;font-weight:900;direction:ltr;box-shadow:0 20px 50px rgba(0,0,0,.4);opacity:0}
#outro .sub{margin-top:28px;font-size:40px;font-weight:700;color:#ffd9c2;opacity:0}
#flash{position:absolute;inset:0;background:radial-gradient(closest-side,rgba(255,190,130,.55),transparent);opacity:0;pointer-events:none;z-index:7}
.spark{position:absolute;width:14px;height:14px;border-radius:4px;opacity:.0}
</style></head><body>
<div id="bg"></div><div id="grid"></div>
<div id="stage"><div id="shadow"></div><div id="phone"><div class="scr"><video id="v" src="/clips/game-i.webm" muted preload="auto"></video><div class="glare"></div></div></div></div>
<div id="cap"><span class="chip"></span><h1></h1><p></p></div>
<div class="sticker" id="st"></div>
<div id="hook"><div class="row" id="hr">${tiles('ארץ', '')}<span style="width:40px"></span>${tiles('עיר', 'o')}</div><div class="q" id="hq">עם החברים, <b>מכל מקום</b></div></div>
<div id="outro"><div class="row" id="or">${tiles('ארץ', 'o')}<span style="width:40px"></span>${tiles('עיר', '')}</div><h2 id="o2">ארץ עיר <span>אונליין</span></h2><div class="url" id="o3">eretz-ir.joni0000.workers.dev</div><div class="sub" id="o4">בחינם · בלי הרשמה · מהנייד</div></div>
<div id="flash"></div>
<script>
const TL=${JSON.stringify(S)};
const $=(id)=>document.getElementById(id);
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const easeOut=(x)=>1-Math.pow(1-clamp(x),3);
const easeBack=(x)=>{x=clamp(x);const c1=1.6,c3=c1+1;return 1+c3*Math.pow(x-1,3)+c1*Math.pow(x-1,2)};
function tilesIn(root,lt,start,gap){[...root.querySelectorAll('.tile')].forEach((e,i)=>{const at=start+i*gap,k=(lt-at)/0.38;if(lt<at){e.style.opacity=0;return}
  e.style.opacity=easeOut(k*1.6);e.style.transform='translateY('+(-120*(1-easeBack(k)))+'px) rotateX('+(70*(1-easeOut(k)))+'deg) rotate('+((i%2?4:-4)*(1-easeOut(k)))+'deg)';});}
window.render=async(t)=>{
  const s=TL.find(x=>t>=x.t0&&t<x.t1)||TL[TL.length-1]; const lt=t-s.t0;
  $('bg').style.transform='scale(1.08) translate('+(Math.sin(t*0.25)*14)+'px,'+(Math.cos(t*0.2)*10)+'px)';
  $('grid').style.transform='perspective(900px) rotateX(64deg) translateY('+((t*45)%90)+'px)';
  const scene=s.c0!=null;
  $('stage').style.display=scene?'block':'none';$('cap').style.display=scene?'block':'none';
  $('hook').style.display=s.id==='hook'?'flex':'none';$('outro').style.display=s.id==='outro'?'flex':'none';
  $('flash').style.opacity=Math.max(0,0.32-lt*2.2);
  $('st').style.opacity=0;
  if(s.id==='hook'){tilesIn($('hr'),lt,0.15,0.22);const q=$('hq'),k=(lt-1.7)/0.4;q.style.opacity=lt<1.7?0:easeOut(k);q.style.transform='scale('+(1.15-0.15*easeOut(k))+')';}
  if(s.id==='outro'){tilesIn($('or'),lt,0.1,0.12);['o2','o3','o4'].forEach((id,i)=>{const at=0.85+i*0.3,k=(lt-at)/0.4,e=$(id);e.style.opacity=lt<at?0:easeOut(k);e.style.transform='translateY('+(30*(1-easeOut(k)))+'px)';});
    const u=$('o3');if(lt>2.4){const p=1+0.04*Math.sin((lt-2.4)*Math.PI*2);u.style.transform='scale('+p+')';}}
  if(scene){
    const v=$('v'),ct=s.c0+lt;
    if(Math.abs(v.currentTime-ct)>0.001){await new Promise(r=>{v.onseeked=()=>r();v.currentTime=ct;});}
    const kin=easeOut(lt/0.65),[r0,r1]=s.ry;
    let ry=r0*(1-kin)+r1*0.35*kin+Math.sin(t*0.9)*1.5;   // כניסה בסיבוב, ואז ציפה עדינה
    let rx=6*(1-kin)+Math.sin(t*0.7)*1.2;
    let sc=0.9+0.1*kin, ty=70*(1-kin)+Math.sin(t*1.3)*5, origin='50% 50%';
    if(s.punch!=null&&lt>=s.punch){const k=easeOut((lt-s.punch)/0.5);sc*=1+0.09*k;origin=s.origin||'50% 30%';ry*=1-0.6*k;}
    const ph=$('phone');ph.style.transformOrigin=origin;ph.style.transform='translateY('+ty+'px) rotateX('+rx+'deg) rotateY('+ry+'deg) scale('+sc+')';
    $('shadow').style.transform='scale('+(0.85+0.15*kin)+')';$('shadow').style.opacity=0.4+0.6*kin;
    const c=$('cap');c.querySelector('.chip').textContent=/^\\d$/.test(s.step)?'שלב '+s.step:s.step;c.querySelector('h1').textContent=s.h;c.querySelector('p').textContent=s.p;
    const kc=easeOut(lt/0.35),kp=easeOut((lt-0.15)/0.35);c.querySelector('h1').style.transform='translateY('+(-18*(1-kc))+'px) scale('+(1.06-0.06*kc)+')';c.style.opacity=kc;c.querySelector('p').style.opacity=kp;
    if(s.sticker&&lt>=s.sticker.at){const st=$('st'),k=(lt-s.sticker.at)/0.32;st.textContent=s.sticker.text;st.style.left=s.sticker.x+'px';st.style.top=s.sticker.y+'px';st.style.opacity=easeOut(k);st.style.transform='rotate(-5deg) scale('+(0.6+0.4*easeBack(k))+')';}
  }
};
window.ready=new Promise(r=>{const v=$('v');if(v.readyState>=2)r();else v.addEventListener('loadeddata',r,{once:true})}).then(()=>document.fonts.ready);
</script></body></html>`;
fs.writeFileSync(path.join(D, 'stage.html'), html);

const srv = http.createServer((req, res) => {
  const f = path.join(D, decodeURIComponent(req.url.split('?')[0]));
  if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  const st = fs.statSync(f), type = f.endsWith('.webm') ? 'video/webm' : 'text/html; charset=utf-8';
  const range = req.headers.range;
  if (range) { const [a, b] = range.replace('bytes=', '').split('-'); const s = +a, e = b ? +b : st.size - 1; res.writeHead(206, { 'Content-Range': `bytes ${s}-${e}/${st.size}`, 'Accept-Ranges': 'bytes', 'Content-Length': e - s + 1, 'Content-Type': type }); fs.createReadStream(f, { start: s, end: e }).pipe(res); }
  else { res.writeHead(200, { 'Content-Length': st.size, 'Content-Type': type, 'Accept-Ranges': 'bytes' }); fs.createReadStream(f).pipe(res); }
}).listen(8812);

(async () => {
  const only = process.argv[2] ? process.argv[2].split(',').map(Number) : null;
  fs.mkdirSync(path.join(D, 'frames'), { recursive: true });
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: W, height: H } });
  await p.goto('http://localhost:8812/stage.html'); await p.evaluate(() => window.ready);
  const times = only || Array.from({ length: Math.round(DUR * FPS) }, (_, i) => i / FPS);
  let i = 0;
  for (const t of times) {
    await p.evaluate((tt) => window.render(tt), t);
    await p.screenshot({ path: path.join(D, 'frames', only ? `p_${t}.jpg` : `f_${String(i).padStart(5, '0')}.jpg`), type: 'jpeg', quality: 93 });
    if (!only && ++i % 150 === 0) console.log('frame', i, '/', times.length); else if (only) i++;
  }
  await b.close(); srv.close(); console.log('done', i);
})();
