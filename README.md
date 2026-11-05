# אליקוד · AliKod

אתר קופונים לאליאקספרס לישראלים. הוא מתעדכן לבד כל 3 שעות, וכל לחיצה על קופון עוברת דרך קישור השותפים שלכם.

**השם:** אליקוד (AliKod), דומיין מומלץ: `alikod.co.il`.
"אלי" + "קוד" יושב בדיוק על מילות החיפוש "קוד קופון אליאקספרס". השם קצר, קל לאיות בעברית ובאנגלית, ונשמע כמו מותג ולא כמו דומיין ספאם.

## איך זה עובד

```
מקורות נתונים                       בנייה (כל 3 שעות ב-GitHub Actions)        האתר
───────────────                     ───────────────────────────────────        ─────
data/coupons.json  (ידני)    ┐
Google Sheet (CSV)           ├──►  scripts/fetch.mjs  →  data/generated.json  ┐
AliExpress Affiliate API     │     (מוצרים בשקלים לישראל + לינקי שותפים)     ├─► scripts/build.mjs → dist/ → GitHub Pages
r/AliExpressCode (Reddit)    ┘     (קודים מהקהילה, מסומנים "לא אומת")       ┘
```

* **חשיפת קוד:** לחיצה על "הצג קוד" מעתיקה את הקוד, פותחת את אליאקספרס בלשונית חדשה דרך `/go/<id>/` (קישור השותפים שלכם), ומציגה חלון עם הקוד והוראות.
* **אוטומציה:** קודים שפג תוקפם יורדים לבד. החודש והשנה בכותרת מתעדכנים בכל בנייה. באנר מבצע (11.11, בלאק פריידי) עולה לבד שבוע לפני המבצע.
* **אם API נופל,** האתר ממשיך להציג את הנתונים מהבנייה הקודמת ולא מתרוקן.

## עמודים (SEO)

| נתיב | מטרה |
|---|---|
| `/` | "קוד קופון אליאקספרס [חודש שנה]": קודים, טבלת מדרגות, FAQ, דילים |
| `/deals/<קטגוריה>/` | "קופון אליאקספרס לאלקטרוניקה" וכו' (8 קטגוריות) |
| `/sale/11-11/`, `/sale/black-friday/`... | עמודי מבצעים עונתיים, עם ספירה לאחור |
| `/guides/...` | מדריכים לביטויי זנב ארוך (מכס, Choice, שילוב הנחות...) |

כל עמוד כולל canonical, Open Graph, נתונים מובנים מסוג BreadcrumbList / FAQPage / Article / Event, `sitemap.xml` ו-`robots.txt` (חוסם את `/go/`). קישורי השותפים מסומנים `rel="nofollow sponsored"`, כמו שגוגל דורש.

## הפעלה – צעד אחר צעד

1. **קישור שותפים:** ב-[AliExpress Portals](https://portals.aliexpress.com) צרו קישור כללי (`s.click.aliexpress.com/e/...`) ושימו אותו ב-`config/site.json` תחת `affiliate.defaultLink`. מהרגע הזה כל לחיצה באתר מתויגת.
2. **קודים:** ערכו את `data/coupons.json` עם הקודים העדכניים והסירו `"sample": true`. אפשר גם לנהל אותם בגוגל שיטס (שלב 4).
3. **GitHub Pages:** ‏Settings → Pages → Source: **GitHub Actions**. אחר כך מזגו ל-`main`.
4. **סודות (אופציונלי, אבל מומלץ מאוד):** ‏Settings → Secrets → Actions:
   | Secret | מה זה נותן |
   |---|---|
   | `ALI_APP_KEY`, `ALI_APP_SECRET`, `ALI_TRACKING_ID` | מ-[AliExpress Open Platform](https://openservice.aliexpress.com) (Affiliate API). נותן דילים חמים בשקלים ולינקי שותפים אוטומטיים |
   | `COUPONS_SHEET_CSV_URL` | גוגל שיטס ← קובץ ← שיתוף ← פרסום באינטרנט ← CSV. העמודות מופיעות ב-`data/sheet-template.csv` |
   | `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET` | אפליקציה מסוג script ב-[reddit.com/prefs/apps](https://www.reddit.com/prefs/apps). שואב קודים חדשים מ-r/AliExpressCode |
5. **דומיין:** קנו `alikod.co.il` והפנו רשומת CNAME אל `<user>.github.io`. הקובץ `CNAME` נוצר אוטומטית מתוך `config/site.json`.
6. **אנליטיקס:** שימו את מזהה GA4 ב-`analytics.ga4Id`. האירועים `coupon_reveal`, `outbound_click` ו-`product_click` נשלחים אוטומטית.

## פיתוח מקומי

```bash
cp .env.example .env   # אופציונלי
npm run fetch          # משיכת נתונים
npm run dev            # בנייה + שרת ב-http://localhost:8080
npm test
```

אין תלויות: מספיק Node 20 ומעלה.

## טיפים לדירוג בגוגל

* **רעננות:** האתר נבנה מחדש כל 3 שעות. הכותרת, תאריך "נבדק" וה-sitemap מתעדכנים בכל בנייה.
* **מבצעים:** עמודי `/sale/*` קיימים כל השנה וצוברים סמכות, ובשבוע של המבצע הם קופצים.
* **ערוץ טלגרם / וואטסאפ** (`social` בקונפיג) מביא תנועה חוזרת ואותות מותג. תמיד כדאי שיהיה.
* האתר אינו קשור רשמית לאליאקספרס, וזה מצוין בפוטר ובעמוד "גילוי נאות".
