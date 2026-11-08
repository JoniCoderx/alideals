// YeshDeal Visual Design System – "Stage" template (v1.1).
// ONE master layout with fixed tokens. Per product only these change: the cut-out product photo, a short Hebrew
// headline, a factual sub-line (Hebrew type + LTR brand/model), an optional tag, an optional price, and the
// "curated" footer (only for products an editor approved).
// Controlled variants by product shape (aspect = width/height of the cut-out): tall < 0.62 ≤ regular ≤ 1.35 < wide.
// Product photos are scaled uniformly (object-fit: contain) – proportions are never altered.
export const TOKENS = {
  size: { w: 1080, h: 1350 },
  bg: '#fffaf6', ink: '#17161c', mute: '#5e5a66',
  grad: ['#ff7a2f', '#e5122f'],
  margin: 72,
  stage: { size: 900, top: 128 },
  box: {
    tall: { w: 560, h: 880, bottom: 1008 },
    regular: { w: 820, h: 800, bottom: 1000 },
    wide: { w: 920, h: 620, bottom: 930 },
  },
  copyTop: 1062,
};

export const variantFor = (aspect) => (aspect < 0.62 ? 'tall' : aspect > 1.35 ? 'wide' : 'regular');

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function stageHTML({ productDataUri, aspect = 1, headline, sub, spec = '', tag = '', price = '', curated = false, fonts }) {
  const T = TOKENS;
  const v = variantFor(aspect);
  const B = T.box[v];
  const pw = Math.min(B.w, B.h * aspect), ph = pw / aspect;
  const top = B.bottom - ph;
  const shadowW = Math.max(220, pw * 0.8);
  return `<!DOCTYPE html><html dir="rtl" lang="he"><head><meta charset="utf-8"><style>
@font-face{font-family:R;src:url(data:font/woff2;base64,${fonts.he}) format('woff2');font-weight:400 800;unicode-range:U+0590-05FF}
@font-face{font-family:R;src:url(data:font/woff2;base64,${fonts.la}) format('woff2');font-weight:400 800}
*{box-sizing:border-box;margin:0}
html,body{width:${T.size.w}px;height:${T.size.h}px;overflow:hidden}
body{position:relative;font-family:R,sans-serif;background:${T.bg};color:${T.ink}}
body::before{content:"";position:absolute;inset:0;background:radial-gradient(900px 600px at 100% 0%,rgba(255,122,47,.10),transparent 60%),radial-gradient(800px 600px at 0% 100%,rgba(229,18,47,.06),transparent 60%)}
.ring{position:absolute;left:50%;top:${T.stage.top - 24}px;width:${T.stage.size + 48}px;height:${T.stage.size + 48}px;margin-left:-${T.stage.size / 2 + 24}px;border-radius:50%;border:2px solid rgba(229,18,47,.16)}
.stage{position:absolute;left:50%;top:${T.stage.top}px;width:${T.stage.size}px;height:${T.stage.size}px;margin-left:-${T.stage.size / 2}px;border-radius:50%;
  background:radial-gradient(circle at 35% 28%,rgba(255,255,255,.34),transparent 45%),radial-gradient(circle at 50% 100%,rgba(120,0,20,.22),transparent 55%),linear-gradient(150deg,${T.grad[0]},${T.grad[1]})}
.contact{position:absolute;left:50%;top:${B.bottom - 14}px;width:${shadowW * 0.7}px;height:26px;margin-left:-${shadowW * 0.35}px;border-radius:50%;background:radial-gradient(closest-side,rgba(40,0,8,.55),transparent);filter:blur(2px)}
.soft{position:absolute;left:50%;top:${B.bottom - 30}px;width:${shadowW * 1.15}px;height:70px;margin-left:-${shadowW * 0.575}px;border-radius:50%;background:radial-gradient(closest-side,rgba(60,0,12,.30),transparent);filter:blur(6px)}
.prod{position:absolute;left:50%;top:${top}px;width:${pw}px;height:${ph}px;margin-left:-${pw / 2}px}
.prod img{width:100%;height:100%;object-fit:contain;filter:drop-shadow(0 18px 22px rgba(40,0,8,.28)) drop-shadow(0 3px 5px rgba(40,0,8,.22))}
.top{position:absolute;top:${T.margin - 14}px;left:${T.margin}px;right:${T.margin}px;display:flex;justify-content:space-between;align-items:center}
.brand{display:flex;align-items:center;gap:12px;font-size:44px;font-weight:800;letter-spacing:-1px}.brand b{color:${T.grad[1]}}
.tag{font-size:26px;font-weight:700;color:${T.grad[1]};border:2px solid rgba(229,18,47,.35);padding:8px 20px;border-radius:999px;background:rgba(255,255,255,.7)}
.copy{position:absolute;left:${T.margin}px;right:${T.margin}px;top:${T.copyTop}px}
h1{font-size:${headline.length > 22 ? 68 : 78}px;font-weight:800;line-height:1.05;letter-spacing:-2px}
.rule{width:110px;height:8px;border-radius:8px;background:linear-gradient(90deg,${T.grad[1]},${T.grad[0]});margin:20px 0 16px}
.sub{font-size:34px;color:${T.mute};font-weight:500}.sub .spec{display:inline-block;direction:ltr;unicode-bidi:isolate;color:${T.ink};font-weight:700;margin-right:14px}
.price{font-size:44px;font-weight:800;color:${T.grad[1]};direction:ltr;unicode-bidi:isolate;margin-top:8px}
.foot{position:absolute;left:${T.margin}px;right:${T.margin}px;bottom:${T.margin - 26}px;display:flex;justify-content:space-between;font-size:26px;font-weight:700;color:${T.mute}}
.foot .url{color:${T.ink}}
</style></head><body data-variant="${v}">
<div class="ring"></div><div class="stage"></div><div class="soft"></div><div class="contact"></div>
<div class="prod"><img src="${productDataUri}" alt=""></div>
<div class="top"><div class="brand"><svg viewBox="0 0 64 64" width="62" height="62"><defs><linearGradient id="g" x1="8" y1="4" x2="56" y2="60" gradientUnits="userSpaceOnUse"><stop stop-color="${T.grad[0]}"/><stop offset="1" stop-color="${T.grad[1]}"/></linearGradient></defs><path d="M32 4C16.5 4 4 15.2 4 29c0 6.7 3 12.8 7.8 17.3L8 60l15-6.6c2.8.8 5.9 1.2 9 1.2 15.5 0 28-11.2 28-25S47.5 4 32 4z" fill="url(#g)"/><path d="M22 39 42 19" stroke="#fff" stroke-width="5.5" stroke-linecap="round"/><circle cx="23" cy="21" r="5" fill="#fff"/><circle cx="41" cy="37" r="5" fill="#fff"/></svg><span>יש דיל<b>!</b></span></div>${tag ? `<div class="tag">${esc(tag)}</div>` : '<span></span>'}</div>
<div class="copy"><h1>${esc(headline)}</h1><div class="rule"></div><div class="sub">${esc(sub)}${spec ? `<span class="spec">${esc(spec)}</span>` : ''}</div>${price ? `<div class="price">${esc(price)}</div>` : ''}</div>
<div class="foot"><span class="url">yeshdeal.com</span>${curated ? '<span>נבחר על ידי יש דיל</span>' : '<span></span>'}</div>
</body></html>`;
}
