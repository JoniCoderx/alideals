// YeshDeal Visual Design System – "Stage" master template (v1.2).
// One brand system; every image shares: background, logo row, typography, gradient rule, margins and footer.
// Per product only these change: the cut-out photo, a factual Hebrew headline + sub, an optional tag/price, and
// the "curated" footer (only for editor-approved products).
// Three controlled layouts inside the same system (picked from the product's shape, or forced):
//   stage – centred disc behind the product (compact / regular products)
//   split – product large on the left over a half-disc bleeding off the edge, copy on the right (tall products)
//   band  – soft gradient floor band instead of a disc, product spans the width (wide products)
// Photos are scaled uniformly only (no stretch, crop, mirror or redraw of logos).
export const TOKENS = {
  size: { w: 1080, h: 1350 },
  bg: '#fffaf6', ink: '#17161c', mute: '#5e5a66',
  grad: ['#ff7a2f', '#e5122f'],
  margin: 72,
};

export const shapeOf = (aspect) => (aspect < 0.62 ? 'tall' : aspect > 1.45 ? 'wide' : 'compact');
export const layoutFor = (aspect) => ({ tall: 'split', wide: 'band', compact: 'stage' }[shapeOf(aspect)]);

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// product box per layout: max width/height and the y of the product's base
const BOX = {
  stage: { w: 860, h: 820, bottom: 1010, cx: 540 },
  split: { w: 520, h: 1010, bottom: 1150, cx: 330 },
  band: { w: 960, h: 700, bottom: 1110, cx: 540 },
};

function backdrop(layout, T) {
  const g = `linear-gradient(150deg,${T.grad[0]},${T.grad[1]})`;
  const sheen = 'radial-gradient(circle at 35% 28%,rgba(255,255,255,.34),transparent 45%),radial-gradient(circle at 50% 100%,rgba(120,0,20,.22),transparent 55%)';
  if (layout === 'stage') return `<div class="ring" style="left:120px;top:200px;width:840px;height:840px"></div><div class="disc" style="left:150px;top:230px;width:780px;height:780px;background:${sheen},${g}"></div>`;
  if (layout === 'split') return `<div class="ring" style="left:-400px;top:250px;width:1000px;height:1000px"></div><div class="disc" style="left:-370px;top:280px;width:940px;height:940px;background:${sheen},${g}"></div>`;
  return `<div class="floor" style="background:${sheen},${g}"></div><div class="ring" style="left:-80px;top:${BOX.band.bottom - 450}px;width:1240px;height:620px;border-radius:50%"></div>`;
}

export function stageHTML({ productDataUri, aspect = 1, layout, headline, sub, spec = '', tag = '', price = '', stats = '', theme = 'light', curated = false, fonts }) {
  const dark = theme === 'dark';
  const T = dark ? { ...TOKENS, bg: '#111014', ink: '#ffffff', mute: '#b9b3c2' } : TOKENS;
  const L = layout || layoutFor(aspect);
  const lift = stats && L === 'stage' ? 70 : 0;
  const B = { ...BOX[L], bottom: BOX[L].bottom - lift, h: BOX[L].h - lift };
  const pw = Math.min(B.w, B.h * aspect), ph = pw / aspect;
  const top = B.bottom - ph;
  const sw = Math.max(200, pw * 0.82);
  const split = L === 'split';
  const copy = split
    ? `left:600px;right:${T.margin}px;top:330px`
    : `left:${T.margin}px;right:${T.margin}px;top:${L === 'band' ? 210 : 1062 - lift}px`;
  const hsize = split ? (headline.length > 14 ? 60 : 70) : headline.length > 22 ? 66 : 76;
  return `<!DOCTYPE html><html dir="rtl" lang="he"><head><meta charset="utf-8"><style>
@font-face{font-family:R;src:url(data:font/woff2;base64,${fonts.he}) format('woff2');font-weight:400 800;unicode-range:U+0590-05FF}
@font-face{font-family:R;src:url(data:font/woff2;base64,${fonts.la}) format('woff2');font-weight:400 800}
*{box-sizing:border-box;margin:0}
html,body{width:${T.size.w}px;height:${T.size.h}px;overflow:hidden}
body{position:relative;font-family:R,sans-serif;background:${T.bg};color:${T.ink}}
body::before{content:"";position:absolute;inset:0;background:radial-gradient(900px 600px at 100% 0%,rgba(255,122,47,.10),transparent 60%),radial-gradient(800px 600px at 0% 100%,rgba(229,18,47,.06),transparent 60%)}
.disc{position:absolute;border-radius:50%}
.ring{position:absolute;border-radius:50%;border:2px solid rgba(229,18,47,.16)}
.floor{position:absolute;left:-60px;right:-60px;top:${B.bottom - 420}px;height:560px;border-radius:50%}
.contact{position:absolute;left:${B.cx}px;top:${B.bottom - 14}px;width:${sw * 0.7}px;height:26px;margin-left:-${sw * 0.35}px;border-radius:50%;background:radial-gradient(closest-side,rgba(40,0,8,.55),transparent);filter:blur(2px)}
.soft{position:absolute;left:${B.cx}px;top:${B.bottom - 30}px;width:${sw * 1.15}px;height:70px;margin-left:-${sw * 0.575}px;border-radius:50%;background:radial-gradient(closest-side,rgba(60,0,12,.30),transparent);filter:blur(6px)}
.prod{position:absolute;left:${B.cx - pw / 2}px;top:${top}px;width:${pw}px;height:${ph}px}
.prod img{width:100%;height:100%;object-fit:contain;filter:drop-shadow(0 18px 22px rgba(40,0,8,.28)) drop-shadow(0 3px 5px rgba(40,0,8,.22))}
.top{position:absolute;top:${T.margin - 14}px;left:${T.margin}px;right:${T.margin}px;display:flex;justify-content:space-between;align-items:center}
.brand{display:flex;align-items:center;gap:12px;font-size:44px;font-weight:800;letter-spacing:-1px}.brand b{color:${T.grad[1]}}
.tag{font-size:26px;font-weight:700;color:${T.grad[1]};border:2px solid rgba(229,18,47,.35);padding:8px 20px;border-radius:999px;background:rgba(255,255,255,.7)}
.copy{position:absolute;${copy}}
h1{font-size:${hsize}px;font-weight:800;line-height:1.05;letter-spacing:-2px}
.rule{width:110px;height:8px;border-radius:8px;background:linear-gradient(90deg,${T.grad[1]},${T.grad[0]});margin:20px 0 16px}
.sub{font-size:34px;color:${T.mute};font-weight:500;line-height:1.3}.sub .spec{display:inline-block;direction:ltr;unicode-bidi:isolate;color:${T.ink};font-weight:700;margin-right:14px}
.price{font-size:44px;font-weight:800;color:${T.grad[1]};direction:ltr;unicode-bidi:isolate;margin-top:8px}
.foot{position:absolute;left:${T.margin}px;right:${T.margin}px;bottom:${T.margin - 26}px;display:flex;justify-content:space-between;font-size:26px;font-weight:700;color:${T.mute}}
.foot .url{color:${T.ink}}
${dark ? `body::before{background:radial-gradient(760px 640px at ${B.cx}px ${B.bottom - B.h * 0.45}px,rgba(255,96,40,.42),transparent 62%),radial-gradient(1200px 500px at 50% 112%,rgba(229,18,47,.30),transparent 60%)}
.disc{opacity:.9;filter:saturate(1.1)}.ring{border-color:rgba(255,140,90,.28)}
.refl{position:absolute;left:${B.cx - pw / 2}px;top:${B.bottom + 2}px;width:${pw}px;height:${ph}px;transform:scaleY(-1);opacity:.16;-webkit-mask-image:linear-gradient(to top,#000,transparent 28%);pointer-events:none}
.refl img{width:100%;height:100%;object-fit:contain}
.prod img{filter:drop-shadow(0 0 1.5px rgba(255,170,120,.85)) drop-shadow(0 24px 34px rgba(0,0,0,.6))}
.tag{background:rgba(255,255,255,.06);color:#ff8a55;border-color:rgba(255,138,85,.45)}.brand b{color:#ff5a3a}` : ''}
.stats{display:flex;flex-wrap:wrap;gap:10px;margin-top:20px;font-size:${split ? 24 : 28}px;font-weight:800}
.stats span{white-space:nowrap;padding:10px 20px;border-radius:999px;background:linear-gradient(150deg,${T.grad[0]},${T.grad[1]});color:#fff;box-shadow:0 10px 24px rgba(229,18,47,.35)}
.stats span+span{background:${dark ? 'rgba(255,255,255,.08)' : '#fff'};color:${T.ink};border:2px solid rgba(229,18,47,.3);box-shadow:none}
</style></head><body data-layout="${L}">
${backdrop(L, T)}<div class="soft"></div><div class="contact"></div>
${dark && L !== 'split' ? `<div class="refl"><img src="${productDataUri}" alt=""></div>` : ''}<div class="prod"><img src="${productDataUri}" alt=""></div>
<div class="top"><div class="brand"><svg viewBox="0 0 64 64" width="62" height="62"><defs><linearGradient id="g" x1="8" y1="4" x2="56" y2="60" gradientUnits="userSpaceOnUse"><stop stop-color="${T.grad[0]}"/><stop offset="1" stop-color="${T.grad[1]}"/></linearGradient></defs><path d="M32 4C16.5 4 4 15.2 4 29c0 6.7 3 12.8 7.8 17.3L8 60l15-6.6c2.8.8 5.9 1.2 9 1.2 15.5 0 28-11.2 28-25S47.5 4 32 4z" fill="url(#g)"/><path d="M22 39 42 19" stroke="#fff" stroke-width="5.5" stroke-linecap="round"/><circle cx="23" cy="21" r="5" fill="#fff"/><circle cx="41" cy="37" r="5" fill="#fff"/></svg><span>יש דיל<b>!</b></span></div>${tag ? `<div class="tag">${esc(tag)}</div>` : '<span></span>'}</div>
<div class="copy"><h1>${esc(headline)}</h1><div class="rule"></div><div class="sub">${esc(sub)}${spec ? `${split ? '<br>' : ''}<span class="spec" ${split ? 'style="margin-right:0"' : ''}>${esc(spec)}</span>` : ''}</div>${price ? `<div class="price">${esc(price)}</div>` : ''}${stats ? `<div class="stats">${stats.split('|').map((x) => `<span>${esc(x.trim())}</span>`).join('')}</div>` : ''}</div>
<div class="foot"><span class="url">yeshdeal.com</span>${curated ? '<span>נבחר על ידי יש דיל</span>' : '<span></span>'}</div>
</body></html>`;
}
