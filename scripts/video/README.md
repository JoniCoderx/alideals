# Promo reel (free, local)
Vertical 1080×1920 tutorial reel recorded from the live site.
1. `node scripts/video/record.cjs` – records 4 phone-size scenes from yeshdeal.com (Playwright) → `clips/*.webm` + `marks.json`
   (`rec2.cjs` re-records only the picks scene)
2. `node scripts/video/cards.cjs` – brand background, phone mask, Hebrew captions, hook + CTA cards (HTML → PNG, RTL-correct)
3. `python3 scripts/video/edit.py` – trims by marks, composites, concatenates → `yeshdeal-reel.mp4` (H.264, faststart)
Run all three from a scratch folder copy (they write next to the script).
