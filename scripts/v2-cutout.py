# Usage: python3 -I scripts/v2-cutout.py <in.jpg> <out.png> [<in2> <out2> ...]   (pip install "rembg[cpu]" scipy)
# Product isolation for the YeshDeal visual system (free, local; no paid AI).
# 1) remove background (rembg isnet)  2) keep only the largest connected object (drops seller text/logos)
# 3) score the result (how dominant the main object is) so the engine can pick the cleanest gallery photo.
import sys, json
import numpy as np
from scipy import ndimage
from rembg import remove, new_session
from PIL import Image
sess = new_session('isnet-general-use')
res = []
for src, dst in zip(sys.argv[1::2], sys.argv[2::2]):
    im = Image.open(src).convert('RGB')
    out = remove(im, session=sess, post_process_mask=True)
    a = np.array(out)[:, :, 3] > 40
    lab, n = ndimage.label(ndimage.binary_closing(a, iterations=3))
    if n == 0: res.append({'src': src, 'score': 0}); continue
    sizes = ndimage.sum(a, lab, range(1, n + 1))
    k = int(np.argmax(sizes)) + 1
    keep = lab == k
    total = a.sum(); main = sizes[k - 1]
    arr = np.array(out); arr[:, :, 3] = np.where(keep, arr[:, :, 3], 0)
    o = Image.fromarray(arr); bb = o.getbbox(); o = o.crop(bb)
    o.save(dst)
    w, h = im.size
    res.append({'src': src, 'dst': dst, 'dominance': round(float(main / total), 3), 'coverage': round(float(main / (w * h)), 3), 'parts': n,
                'score': round(float(main / total) * min(1.0, float(main / (w * h)) / 0.12), 3)})
print(json.dumps(res))
