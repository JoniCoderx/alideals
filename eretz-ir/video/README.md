# סרטון פרומו (חינם, מקומי)

סרטון 4:5 לפייסבוק ולאינסטגרם, בגודל 1080×1350, 29 שניות, 30fps. הסגנון לקוח מה-reel v2 של יש דיל:
* טלפון תלת-ממדי עם תנועה רגועה (כניסה רכה וזום של 9% בלי רעידות)
* כיתובים קינטיים מעל הטלפון, ומדבקות
* רקע שמכסה את כל הפריים, עם רצפת גריד תלת-ממדית
* ביט מקורי שנבנה מאפס ב-120 BPM: whoosh בכל חיתוך, pop על כל מדבקה, ו-hit על כל זום

1. `node record.cjs` מקליט את המשחק החי מטלפון של המארח, כששני חברים משחקים ברקע. הצילום הוא צילום מסך רציף ב-780×1688 (זום 2 על הדף), כי המקליט המובנה של Playwright מקליט רק 390 פיקסלים. הוא כותב `shots/`, `shots.txt` ו-`marks.json`.
2. בונים את הקליפ:
   ```
   ffmpeg -f concat -safe 0 -i shots.txt -vf "fps=30,format=yuv420p" -c:v libvpx -g 1 -crf 4 -b:v 25M -an clips/game-i.webm
   ```
3. `node stage.cjs` מרנדר את כל הפריימים ל-`frames/`. צריך גם את `rubik-hebrew.woff2` ואת `rubik-latin.woff2`, מ-`src/assets/fonts` בענף `main`.
4. `python3 music.py` כותב `music.wav`, ואז מחברים הכול:
   ```
   ffmpeg -framerate 30 -i frames/f_%05d.jpg -i music.wav -filter_complex "[1:a]loudnorm=I=-14:TP=-1.5[a]" -map 0:v -map "[a]" -c:v libx264 -crf 16 -pix_fmt yuv420p -c:a aac -b:a 192k -movflags +faststart eretz-ir-promo.mp4
   ```
