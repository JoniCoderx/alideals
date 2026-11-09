# YeshDeal – SEO audit, keyword map and roadmap (9.11.2026)

Production: https://yeshdeal.com · Rollback baseline: commit `f1d0a51` (before this SEO round). Rollback = `git revert <commit>` (or reset main to the baseline) and push; GitHub Actions redeploys in ~3 minutes.

## 1. Technical audit (evidence: `node scripts/build.mjs && node scripts/seo-audit.mjs`)

| Check | Result |
|---|---|
| URL inventory | 65 HTML pages built; 52 indexable; 13 noindex by design (/admin/*, /p/, /deals-today/ until ≥3 real drops, /deals/* while API product feeds are off, 404) |
| Sitemap | 52 URLs = exactly the indexable set (0 missing, 0 non-indexable) |
| robots.txt | Disallow: /go/ /admin/ /p/ /tg-queue/ /telegram-state.json; no indexable page blocked |
| Titles / descriptions | All unique; 4 titles over 70 chars were shortened |
| H1 | Exactly one per indexable page |
| Canonical | Absolute self-canonical on every indexable page; none on noindex pages |
| Internal links | 0 broken; every indexable page has ≥2 inlinks |
| Redirects (live) | http→https 301, www→apex 301, missing slash 301, unknown URL 404 |
| Structured data | JSON-LD parses on all pages. Types: Organization, WebSite, BreadcrumbList, Article (guides), FAQPage, ItemList (lists). No Product/Offer/AggregateRating (YeshDeal is not the merchant; no fabricated ratings) |
| Rendering | All SEO content is static HTML; JS only for calculator/hunter/copy |
| Performance (Lighthouse mobile, local) | Performance 99, Accessibility 100, SEO 100, Best practices 100; CLS 0 |
| Mobile | 62 pages × 320/360px: no horizontal overflow (fixed earlier: /top/ price row, homepage info grid) |
| Remaining P2 | Thin by nature: /privacy/, /disclosure/ (legal), /coupon/ hub, /top/ hub – acceptable |

Search Console (owner screenshots, 9.11): 23 indexed / 6 not indexed (2 redirects = http/www variants, 1 robots = /go/, 3 Google-side "crawled/discovered – not indexed"); 10 impressions, 2 clicks, avg position 32.6 (site is 4 days old). Queries seen: "קופון לאלי אקספרס", "קוד קופון אלי אקספרס", "קופונים לאליאקספרס" – i.e. the אלי spelling matters; added to the home description.

Not measurable from here: query volumes (no keyword tool access), analytics (no analytics installed by owner's choice), affiliate conversions (AliExpress portal).

## 2. Keyword / intent map (one primary intent per URL)

| URL | Primary intent | Variants covered |
|---|---|---|
| `/` | קוד קופון עליאקספרס (+ חודש) | קופונים לאליאקספרס, קוד הנחה, עלי/אלי אקספרס, AliExpress |
| `/sale/11-11/` (and other events) | קופונים 11.11 / בלאק פריידי | only in season; off-season shows top 3 codes (no cannibalisation) |
| `/new-user/` | קופון לקנייה ראשונה / משתמש חדש | |
| `/existing-user/` | קוד קופון למשתמש קיים | |
| `/coupon/<category>/` | קופון עליאקספרס ל<קטגוריה> | |
| `/finder/` | השוואת מחירים באליאקספרס / איך למצוא מוצר בזול | |
| `/top/` + 5 lists | מוצרים מומלצים מעליאקספרס (מטענים, אוזניות, בית, גיימינג, רכב) | |
| `/top/under-50/`, `/top/under-100/` | מוצרים מומלצים עד 50 / עד 100 שקל | new, live-data |
| `/deals-today/` | דילים / מבצעים באליאקספרס היום | indexable only with ≥3 real price drops |
| `/guides/*` (20) | informational (מכס ומע"מ, משלוח חינם, החזרים, מקורי/מזויף, תשלום…) | each guide one question |

## 3. Indexing strategy for products
- Product share pages `/p/?i=` stay **noindex** (client-rendered, API copy, no editorial value).
- Products are indexed only **inside curated lists** (ItemList), each with an editorial Hebrew title, live price + check time, quality bar (≥92% positive, ≥300 sales), affiliate link.
- Price-band and "today" lists are noindex automatically below 5 / 3 qualifying items.
- No Product/Offer markup until we have pages that meet Google's product-snippet requirements honestly.

## 4. Implemented in this round (all live, smoke-tested)
- `/top/under-50/`, `/top/under-100/` – new list pages from live API prices.
- Buying checklists on all 5 lists; selection methodology + "not physically tested" statement on `/top/`.
- `/about/` rewritten: features, data sources, what we don't know (shipping/VAT), no fabricated reviews, monetisation, contact.
- Titles shortened; home description includes AliExpress + עלי אקספרס.
- Guides fact-check: VAT threshold history corrected; 13 unverified claims softened.
- Homepage: "נבחרי יש דיל" (premium images, live prices) → "עוד דרכים לחסוך" → guides links; Deal Hunter section with input validation.
- `scripts/seo-audit.mjs` – repeatable audit.

Smoke test (production, after deploy): 13 key URLs 200; sitemap 52; calculator ($60 → $8 code); picks 17 cards all with affiliate links; hunter validation; finder verdict; /go/home → AliExpress.

## 5. Unresolved risks
- No analytics → we can't attribute organic → affiliate conversions (owner decision).
- GitHub Pages: 10-minute cache TTL (cannot set headers) – minor repeat-visit cost.
- AliExpress API has no shipping data; prices shown are before shipping/VAT (stated everywhere).
- Coupon codes expire 18.11 – new codes must be added (reminder set for 17.11).
- Seller images often include marketing text; premium images are hand-approved.

## 6. Next stages (in order)
1. Search Console: request indexing for /finder/, /top/, /top/under-50/, /top/under-100/, /sale/11-11/; re-check coverage in 7 days.
2. 11.11 → Black Friday: update /sale/black-friday/ content when codes are published (page switches to "live" only with codes).
3. Two editorial guides with real data: "איך יודעים אם מוצר באליאקספרס מקורי" (expand existing), "מטענים מומלצים: איך בוחרים הספק ותקע" linked to /top/charging/.
4. Grow curated catalog (+20 products) through the image/QC pipeline, then add "גאדג'טים לבית" and "אביזרי רכב מומלצים" lists.
5. After 2–4 weeks of GSC data: rewrite titles of pages with impressions but low CTR; build pages only for queries we actually appear for.
