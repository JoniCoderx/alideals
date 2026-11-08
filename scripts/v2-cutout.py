# YeshDeal product cut-out (free, local, no paid AI). Usage:
#   python3 -I scripts/v2-cutout.py <in.jpg> <out.png> [<in2> <out2> ...]
#   needs: pip install "rembg[cpu]" scipy   (models download once, then run offline)
#
# Pipeline (designed to keep the product 100% original – only background pixels are removed):
#  1. Segment with BiRefNet (best edge quality for cables/hoses); fallback ISNet.
#  2. Clean the mask: drop thin attached strokes (seller text/arrows) with a small morphological opening,
#     keep only the largest connected object, fill interior holes.
#  3. Restore soft edges: use the model's own alpha only inside a 2px band around the cleaned mask (no halo, no jaggies).
#  4. Trim to content + tiny padding. Report quality metrics so the engine can rank gallery photos.
import sys, json
import numpy as np
from scipy import ndimage
from rembg import remove, new_session
from PIL import Image

def session():
    for name in ('birefnet-general-lite', 'isnet-general-use'):
        try:
            return name, new_session(name)
        except Exception:
            continue
    raise SystemExit('no segmentation model available')

MODEL, SESS = session()
out = []
for src, dst in zip(sys.argv[1::2], sys.argv[2::2]):
    im = Image.open(src).convert('RGB')
    w, h = im.size
    cut = remove(im, session=SESS)
    alpha = np.array(cut)[:, :, 3].astype(np.float32) / 255
    hard = alpha > 0.5
    k = max(2, round(min(w, h) / 220))                       # stroke size relative to image
    opened = ndimage.binary_opening(hard, structure=np.ones((k, k)))
    lab, n = ndimage.label(opened)
    if n == 0:
        out.append({'src': src, 'ok': False, 'reason': 'empty'}); continue
    sizes = ndimage.sum(opened, lab, range(1, n + 1))
    main = lab == (int(np.argmax(sizes)) + 1)
    main = ndimage.binary_fill_holes(ndimage.binary_dilation(main, iterations=k))  # give back the edge the opening took
    band = ndimage.binary_dilation(main, iterations=2) & ~ndimage.binary_erosion(main, iterations=2)
    a = np.where(main & ~band, 1.0, 0.0)
    a = np.where(band, alpha * ndimage.binary_dilation(main, iterations=2), a)
    rgba = np.dstack([np.array(im), (np.clip(a, 0, 1) * 255).astype(np.uint8)])
    o = Image.fromarray(rgba, 'RGBA')
    bb = o.getbbox()
    pad = round(0.01 * max(w, h))
    o = o.crop((max(0, bb[0] - pad), max(0, bb[1] - pad), min(w, bb[2] + pad), min(h, bb[3] + pad)))
    o.save(dst)
    total = hard.sum()
    kept = float(main.sum())
    out.append({'src': src, 'dst': dst, 'model': MODEL, 'size': o.size, 'dominance': round(kept / max(total, 1), 3),
                'coverage': round(kept / (w * h), 3), 'aspect': round(o.size[0] / o.size[1], 3), 'parts': int(n)})
print(json.dumps(out))
