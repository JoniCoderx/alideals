// YeshDeal Visual Design System – "Stage" template (v1).
// ONE layout, fixed tokens. Only the content changes per product: cut-out product photo, short Hebrew headline,
// a factual sub-line (brand + model/spec from the approved catalog title), and an optional small tag.
// No prices, ratings or claims are ever rendered here.
export const TOKENS = {
  size: { w: 1080, h: 1350 },            // 4:5 – Instagram/Facebook feed, also crops well to 1:1
  bg: '#fffaf6',                           // warm off-white
  ink: '#17161c', mute: '#5e5a66',
  grad: ['#ff7a2f', '#e5122f'],            // brand gradient
  stage: { size: 860, top: 150 },          // gradient disc behind the product
  product: { maxW: 700, maxH: 720, top: 220 },
  font: 'Rubik',
  margin: 72,
};

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function stageHTML({ productDataUri, headline, sub, spec = '', tag = '', fonts }) {
  const T = TOKENS;
  return `<!DOCTYPE html><html dir="rtl" lang="he"><head><meta charset="utf-8"><style>
@font-face{font-family:R;src:url(data:font/woff2;base64,${fonts.he}) format('woff2');font-weight:400 800;unicode-range:U+0590-05FF}
@font-face{font-family:R;src:url(data:font/woff2;base64,${fonts.la}) format('woff2');font-weight:400 800}
*{box-sizing:border-box;margin:0}
html,body{width:${T.size.w}px;height:${T.size.h}px;overflow:hidden}
body{position:relative;font-family:R,sans-serif;background:${T.bg};color:${T.ink}}
/* soft paper texture via two very faint radial lights */
body::before{content:"";position:absolute;inset:0;background:radial-gradient(900px 600px at 100% 0%,rgba(255,122,47,.10),transparent 60%),radial-gradient(800px 600px at 0% 100%,rgba(229,18,47,.06),transparent 60%)}
.stage{position:absolute;left:50%;top:${T.stage.top}px;width:${T.stage.size}px;height:${T.stage.size}px;margin-left:-${T.stage.size / 2}px;border-radius:50%;
  background:radial-gradient(circle at 35% 30%,rgba(255,255,255,.35),transparent 45%),linear-gradient(150deg,${T.grad[0]},${T.grad[1]})}
.ring{position:absolute;left:50%;top:${T.stage.top - 26}px;width:${T.stage.size + 52}px;height:${T.stage.size + 52}px;margin-left:-${T.stage.size / 2 + 26}px;border-radius:50%;border:2px solid rgba(229,18,47,.18)}
.floor{position:absolute;left:50%;top:${T.product.top + T.product.maxH - 40}px;width:520px;height:60px;margin-left:-260px;border-radius:50%;background:radial-gradient(closest-side,rgba(60,10,10,.35),transparent)}
.prod{position:absolute;left:0;right:0;top:${T.product.top}px;height:${T.product.maxH}px;display:flex;align-items:flex-end;justify-content:center}
.prod img{max-width:${T.product.maxW}px;max-height:${T.product.maxH}px;object-fit:contain;filter:drop-shadow(0 30px 40px rgba(40,5,5,.35)) drop-shadow(0 6px 10px rgba(40,5,5,.2))}
.top{position:absolute;top:${T.margin - 8}px;left:${T.margin}px;right:${T.margin}px;display:flex;justify-content:space-between;align-items:center}
.brand{display:flex;align-items:center;gap:12px;font-size:44px;font-weight:800;letter-spacing:-1px}.brand b{color:${T.grad[1]}}
.tag{font-size:26px;font-weight:700;color:${T.grad[1]};border:2px solid rgba(229,18,47,.35);padding:8px 20px;border-radius:999px;background:rgba(255,255,255,.6)}
.copy{position:absolute;left:${T.margin}px;right:${T.margin}px;bottom:${T.margin + 64}px}
h1{font-size:${headline.length > 22 ? 70 : 82}px;font-weight:800;line-height:1.05;letter-spacing:-2px}
.rule{width:120px;height:8px;border-radius:8px;background:linear-gradient(90deg,${T.grad[1]},${T.grad[0]});margin:24px 0 18px}
.sub{font-size:34px;color:${T.mute};font-weight:500}.sub .spec{display:inline-block;direction:ltr;unicode-bidi:isolate;color:${T.ink};font-weight:700;margin-right:14px}
.foot{position:absolute;left:${T.margin}px;right:${T.margin}px;bottom:${T.margin - 18}px;display:flex;justify-content:space-between;font-size:26px;font-weight:700;color:${T.mute}}
.foot .url{color:${T.ink}}
</style></head><body>
<div class="ring"></div><div class="stage"></div><div class="floor"></div>
<div class="prod"><img src="${productDataUri}" alt=""></div>
<div class="top"><div class="brand"><svg viewBox="0 0 64 64" width="62" height="62"><defs><linearGradient id="g" x1="8" y1="4" x2="56" y2="60" gradientUnits="userSpaceOnUse"><stop stop-color="${T.grad[0]}"/><stop offset="1" stop-color="${T.grad[1]}"/></linearGradient></defs><path d="M32 4C16.5 4 4 15.2 4 29c0 6.7 3 12.8 7.8 17.3L8 60l15-6.6c2.8.8 5.9 1.2 9 1.2 15.5 0 28-11.2 28-25S47.5 4 32 4z" fill="url(#g)"/><path d="M22 39 42 19" stroke="#fff" stroke-width="5.5" stroke-linecap="round"/><circle cx="23" cy="21" r="5" fill="#fff"/><circle cx="41" cy="37" r="5" fill="#fff"/></svg><span>יש דיל<b>!</b></span></div>${tag ? `<div class="tag">${esc(tag)}</div>` : '<span></span>'}</div>
<div class="copy"><h1>${esc(headline)}</h1><div class="rule"></div><div class="sub">${esc(sub)}${spec ? `<span class="spec">${esc(spec)}</span>` : ""}</div></div>
<div class="foot"><span class="url">yeshdeal.com</span><span>נבחר על ידי יש דיל</span></div>
</body></html>`;
}
