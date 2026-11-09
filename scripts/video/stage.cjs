// YeshDeal reel v2 (4:5, 1080x1350, 30fps): deterministic frame renderer.
// A single HTML stage; render(t) sets every element from the timeline; Playwright seeks the clips and screenshots each frame.
const { chromium } = require('playwright');
const fs = require('fs');
const http = require('http');
const path = require('path');
const D = __dirname, ROOT = '/home/user/alideals';
const FPS = 30, W = 1080, H = 1350;
const M = JSON.parse(fs.readFileSync(path.join(D, '..', 'marks.json'), 'utf8'));
const b64 = (f) => fs.readFileSync(f).toString('base64');
const he = b64(`${ROOT}/src/assets/fonts/rubik-hebrew.woff2`), la = b64(`${ROOT}/src/assets/fonts/rubik-latin.woff2`);
const logo = (s, inv) => `<svg viewBox="0 0 64 64" width="${s}" height="${s}"><defs><linearGradient id="g${inv ? 1 : 0}" x1="8" y1="4" x2="56" y2="60" gradientUnits="userSpaceOnUse"><stop stop-color="#ff7a2f"/><stop offset="1" stop-color="#e5122f"/></linearGradient></defs><path d="M32 4C16.5 4 4 15.2 4 29c0 6.7 3 12.8 7.8 17.3L8 60l15-6.6c2.8.8 5.9 1.2 9 1.2 15.5 0 28-11.2 28-25S47.5 4 32 4z" fill="${inv ? '#fff' : `url(#g0)`}"/><path d="M22 39 42 19" stroke="${inv ? '#e5122f' : '#fff'}" stroke-width="5.5" stroke-linecap="round"/><circle cx="23" cy="21" r="5" fill="${inv ? '#e5122f' : '#fff'}"/><circle cx="41" cy="37" r="5" fill="${inv ? '#e5122f' : '#fff'}"/></svg>`;

// ---- timeline (seconds) – cuts land on the 120 BPM grid (0.5 s) ----
const S = [
  { id: 'hook', t0: 0, t1: 2.5 },
  { id: 'calc', t0: 2.5, t1: 6.5, clip: 'calc', c0: M.calc.start - 0.2, step: '1', h: 'מקלידים כמה יש בעגלה', p: 'והמחשבון בוחר את הקוד', sticker: { at: 1.5, text: '$8 הנחה!', x: 70, y: 700 }, punch: 1.4, ry: [-28, -12] },
  { id: 'copy', t0: 6.5, t1: 9.0, clip: 'copy', c0: M.copy.start - 0.15, step: '2', h: 'הקוד מועתק בלחיצה', p: 'מדביקים בתשלום וזהו', sticker: { at: 0.75, text: 'הועתק ✓', x: 690, y: 820 }, ry: [26, 12] },
  { id: 'hunt1', t0: 9.0, t1: 11.5, clip: 'hunter', c0: M.hunter.start, step: '3', h: 'שולחים לצייד קישור', p: 'מכל מוצר בעליאקספרס', ry: [-24, -10] },
  { id: 'hunt2', t0: 11.5, t1: 15.5, clip: 'hunter', c0: M.hunter.result - 0.2, step: '3', h: 'אתם ציידים!', p: 'המחיר הכי טוב + הקוד שמוריד עוד', sticker: { at: 1.6, text: 'עם קוד: ₪102.9', x: 560, y: 1000 }, punch: 1.3, origin: '50% 62%', ry: [22, 8] },
  { id: 'picks', t0: 15.5, t1: 18.5, clip: 'picks', c0: M.picks.start - 0.1, step: '4', h: 'מוצרים נבחרים', p: 'מחירים חיים, כל שעה', sticker: { at: 0.9, text: '17 מוצרים', x: 80, y: 760 }, ry: [-20, -6] },
  { id: 'outro', t0: 18.5, t1: 21.5 },
];
const DUR = S[S.length - 1].t1;
fs.writeFileSync(path.join(D, 'timeline.json'), JSON.stringify({ S, DUR, FPS }));

const html = `<!DOCTYPE html><html dir="rtl" lang="he"><head><meta charset="utf-8"><style>
@font-face{font-family:R;src:url(data:font/woff2;base64,${he}) format('woff2');font-weight:300 900;unicode-range:U+0590-05FF}
@font-face{font-family:R;src:url(data:font/woff2;base64,${la}) format('woff2');font-weight:300 900}
*{margin:0;box-sizing:border-box}html,body{width:${W}px;height:${H}px;overflow:hidden;background:#0d0a0f;font-family:R;color:#fff}
#bg{position:absolute;inset:-10%;background:radial-gradient(700px 600px at 75% 20%,rgba(255,122,47,.65),transparent 60%),radial-gradient(800px 700px at 15% 90%,rgba(229,18,47,.55),transparent 60%),linear-gradient(160deg,#1c1217,#0b090d)}
#grid{position:absolute;inset:0;background-image:linear-gradient(rgba(255,255,255,.045) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.045) 1px,transparent 1px);background-size:60px 60px;transform-origin:50% 100%}
#stage{position:absolute;z-index:1;left:0;right:0;top:300px;height:1060px;perspective:1600px;perspective-origin:50% 40%}
#phone{position:absolute;left:50%;top:0;width:430px;height:932px;margin-left:-215px;border-radius:58px;background:#0a0a0c;padding:14px;box-shadow:0 60px 110px rgba(0,0,0,.6),0 0 0 2px rgba(255,255,255,.1),0 0 80px rgba(255,90,40,.25);transform-style:preserve-3d}
#phone .scr{position:relative;width:100%;height:100%;border-radius:46px;overflow:hidden;background:#fff}
#phone video{width:100%;height:100%;object-fit:cover;display:none}
#phone .glare{position:absolute;inset:0;border-radius:46px;background:linear-gradient(115deg,rgba(255,255,255,.22),transparent 35%,transparent 70%,rgba(255,255,255,.06));pointer-events:none}
#cap{position:absolute;z-index:5;top:56px;left:40px;right:40px;text-align:center}
#cap .chip{display:inline-block;font-size:28px;font-weight:800;background:#fff;color:#e5122f;border-radius:999px;padding:6px 22px;margin-bottom:12px}
#cap h1{font-size:76px;font-weight:900;line-height:1.02;letter-spacing:-2px;text-shadow:0 8px 28px rgba(0,0,0,.45)}
#cap p{margin-top:10px;font-size:38px;font-weight:700;color:#ffd2bd}
.sticker{position:absolute;z-index:6;padding:16px 28px;border-radius:22px;font-size:46px;font-weight:900;background:linear-gradient(150deg,#ffd84d,#ffb000);color:#2a1300;box-shadow:0 18px 40px rgba(0,0,0,.45),0 0 0 4px #fff;white-space:nowrap;direction:rtl;opacity:0}
#hook,#outro{position:absolute;inset:0;display:none;flex-direction:column;justify-content:center;align-items:center;text-align:center}
#hook .w{font-size:132px;font-weight:900;line-height:1.02;letter-spacing:-4px;opacity:0;text-shadow:0 10px 40px rgba(0,0,0,.5)}
#hook .w.y{color:#ffd84d}
#hook .brand{margin-top:26px;display:flex;align-items:center;gap:18px;font-size:90px;font-weight:900;opacity:0}
#outro .o1{opacity:0}#outro h2{font-size:120px;font-weight:900;letter-spacing:-3px;margin-top:20px}
#outro .url{margin-top:44px;background:#fff;color:#e5122f;border-radius:999px;padding:22px 64px;font-size:70px;font-weight:900;direction:ltr;box-shadow:0 20px 50px rgba(0,0,0,.4)}
#outro .sub{margin-top:30px;font-size:42px;font-weight:700;color:#ffd2bd}
#flash{position:absolute;inset:0;background:radial-gradient(closest-side,rgba(255,180,120,.55),transparent);opacity:0;pointer-events:none}
#wm{position:absolute;bottom:26px;left:0;right:0;display:flex;justify-content:center;align-items:center;gap:12px;font-size:30px;font-weight:800;opacity:.9}
</style></head><body>
<div id="bg"></div><div id="grid"></div>
<div id="stage"><div id="phone"><div class="scr">
 <video id="v-calc" src="/calc.webm" muted preload="auto"></video><video id="v-copy" src="/copy.webm" muted preload="auto"></video>
 <video id="v-hunter" src="/hunter.webm" muted preload="auto"></video><video id="v-picks" src="/picks.webm" muted preload="auto"></video>
 <div class="glare"></div></div></div></div>
<div id="cap"><span class="chip"></span><h1></h1><p></p></div>
<div class="sticker" id="st"></div>
<div id="hook"><div class="w" id="w1">משלמים</div><div class="w" id="w2">יותר מדי</div><div class="w y" id="w3">בעליאקספרס?</div><div class="brand" id="hb">${logo(110)}<span>יש דיל.</span></div></div>
<div id="outro"><div class="o1" id="o1">${logo(170, true)}</div><h2 class="o1" id="o2">יש דיל!</h2><div class="url o1" id="o3">yeshdeal.com</div><div class="sub o1" id="o4">שתפו עם מי שקונה בעליאקספרס</div></div>
<div id="flash"></div>
<div id="wm">${logo(44)}<span>yeshdeal.com</span></div>
<script>
const TL=${JSON.stringify(S)};
const $=(id)=>document.getElementById(id);
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const easeOutBack=(x)=>{x=clamp(x);const c1=1.70158,c3=c1+1;return 1+c3*Math.pow(x-1,3)+c1*Math.pow(x-1,2)};
const easeOut=(x)=>1-Math.pow(1-clamp(x),3);
const beat=(t)=>Math.exp(-((t%0.5))/0.11);
window.render=async(t)=>{
  const s=TL.find(x=>t>=x.t0&&t<x.t1)||TL[TL.length-1]; const lt=t-s.t0;
  // background pulse on the beat + slow drift
  $('bg').style.transform='translate('+(Math.sin(t*0.25)*10)+'px,'+(Math.cos(t*0.2)*8)+'px)';
  $('grid').style.transform='perspective(900px) rotateX(62deg) translateY('+((t*40)%60)+'px)';
  $('grid').style.opacity=0.55;
  const isScene=!!s.clip;
  $('stage').style.display=isScene?'block':'none'; $('cap').style.display=isScene?'block':'none'; $('wm').style.display='none';
  $('hook').style.display=s.id==='hook'?'flex':'none'; $('outro').style.display=s.id==='outro'?'flex':'none';
  $('flash').style.opacity=Math.max(0,0.3-lt*2); // soft light hit on each cut
  $('st').style.opacity=0;
  if(s.id==='hook'){
    [['w1',0],['w2',0.5],['w3',1.0]].forEach(([id,at])=>{const k=(lt-at)/0.22;const e=$(id);if(lt<at){e.style.opacity=0;return}e.style.opacity=1;const sc=1.25-0.25*easeOut(k);e.style.opacity=easeOut(k);e.style.transform='scale('+sc+')'});
    const hb=$('hb');const k=(lt-1.6)/0.3;hb.style.opacity=lt<1.6?0:1;hb.style.transform='scale('+(lt<1.6?0.9:0.9+0.1*easeOut(k))+')';hb.style.opacity=lt<1.6?0:easeOut(k);
  }
  if(s.id==='outro'){
    ['o1','o2','o3','o4'].forEach((id,i)=>{const at=0.15+i*0.25,k=(lt-at)/0.35,e=$(id);e.style.opacity=lt<at?0:1;e.style.transform='translateY('+(24*(1-easeOut(k)))+'px)';e.style.opacity=easeOut(k)});
  }
  if(isScene){
    ['calc','copy','hunter','picks'].forEach(n=>$('v-'+n).style.display=n===s.clip?'block':'none');
    const v=$('v-'+s.clip); const ct=s.c0+lt;
    if(Math.abs(v.currentTime-ct)>0.001){await new Promise(r=>{v.onseeked=()=>r();v.currentTime=ct;});}
    // 3D swing-in, float, beat bounce, zoom punch with shake
    const kin=easeOut(lt/0.6); const [r0]=s.ry;
    let ry=(r0*0.55)*(1-kin);
    let rx=3*(1-kin);
    let sc=0.92+0.08*kin;
    let tx=0, ty=(1-kin)*60;
    let origin='50% 50%';
    if(s.punch!=null&&lt>=s.punch){const k=easeOut((lt-s.punch)/0.5);sc*=1+0.08*k;origin='50% 0%';}
    const ph=$('phone');ph.style.transformOrigin=origin;ph.style.transform='translate('+tx+'px,'+ty+'px) rotateX('+rx+'deg) rotateY('+ry+'deg) scale('+sc+')';
    // caption pop
    const c=$('cap');c.querySelector('.chip').textContent='שלב '+s.step;c.querySelector('h1').textContent=s.h;c.querySelector('p').textContent=s.p;
    const kc=easeOut(lt/0.35);c.style.transform='translateY('+(-14*(1-kc))+'px)';c.style.opacity=kc;
    // sticker
    if(s.sticker&&lt>=s.sticker.at){const st=$('st');const k=(lt-s.sticker.at)/0.32;st.textContent=s.sticker.text;st.style.left=s.sticker.x+'px';st.style.top=s.sticker.y+'px';st.style.opacity=1;st.style.transform='rotate(-4deg) scale('+(0.85+0.15*easeOut(k))+')';st.style.opacity=easeOut(k);}
  }
};
window.ready=Promise.all([...document.querySelectorAll('video')].map(v=>new Promise(r=>{if(v.readyState>=2)r();else v.addEventListener('loadeddata',r,{once:true})}))).then(()=>document.fonts.ready);
</script></body></html>`;
fs.writeFileSync(path.join(D, 'stage.html'), html);

// tiny static server for the clips (videos need http, not file://)
const srv = http.createServer((req, res) => {
  const f = path.join(D, decodeURIComponent(req.url.split('?')[0]));
  if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  const st = fs.statSync(f), type = f.endsWith('.webm') ? 'video/webm' : 'text/html; charset=utf-8';
  const range = req.headers.range;
  if (range) { const [a, b] = range.replace('bytes=', '').split('-'); const s = +a, e = b ? +b : st.size - 1; res.writeHead(206, { 'Content-Range': `bytes ${s}-${e}/${st.size}`, 'Accept-Ranges': 'bytes', 'Content-Length': e - s + 1, 'Content-Type': type }); fs.createReadStream(f, { start: s, end: e }).pipe(res); }
  else { res.writeHead(200, { 'Content-Length': st.size, 'Content-Type': type, 'Accept-Ranges': 'bytes' }); fs.createReadStream(f).pipe(res); }
}).listen(8811);

(async () => {
  const only = process.argv[2] ? process.argv[2].split(',').map(Number) : null; // preview specific times
  fs.mkdirSync(path.join(D, 'frames'), { recursive: true });
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const p = await b.newPage({ viewport: { width: W, height: H } });
  await p.goto('http://localhost:8811/stage.html');
  await p.evaluate(() => window.ready);
  const times = only || Array.from({ length: Math.round(DUR * FPS) }, (_, i) => i / FPS);
  let i = 0;
  for (const t of times) {
    await p.evaluate((tt) => window.render(tt), t);
    await p.screenshot({ path: path.join(D, 'frames', only ? `p_${t}.jpg` : `f_${String(i).padStart(5, '0')}.jpg`), type: 'jpeg', quality: 92 });
    i++;
    if (!only && i % 90 === 0) console.log('frame', i, '/', times.length);
  }
  await b.close(); srv.close();
  console.log('done', i);
})();
