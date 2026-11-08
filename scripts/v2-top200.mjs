// Top 10 collections for the /test/ preview, built from the AliExpress "Top 200 products among publishers" CSV.
// The CSV has names + links only. Prices, ratings, sales, Hebrew titles, images and OUR affiliate links come live
// from the official API (Worker /api/products). Junk rows are excluded, nothing is invented.
// Ranking (stated on the page): ships to Israel → positive rating ≥ 85% when known → most sold (API figure).
import fs from 'node:fs/promises';

const API = process.env.V2_API || 'https://yeshdeal-api.joni0000.workers.dev';

export function parseCSV(text) {
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); if (row.some((x) => x.trim())) rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); if (row.some((x) => x.trim())) rows.push(row); }
  return rows;
}

// Clearly not consumer products / not useful for Israeli shoppers.
const JUNK = /make up the difference|additional pay|baler|baling|lawn mower|mower|lucky bag|mystery|fukubukuro|blind box|graphics card fan|self tapping screw|korean plug|cn rom|cn version|\bcn\b|korean type|유원트/i;

export const COLLECTIONS = [
  { slug: 'charging', emoji: '🔋', title: '10 מטענים, כבלים וסוללות שכדאי להכיר', test: /power ?bank|charger|charging station|usb.?c cable|type.?c cable|cable/i,
    intro: 'סוללות ניידות, מטענים מהירים וכבלים מהמותגים שמופיעים הכי הרבה ברשימות המובילות של עליאקספרס. שימו לב לסוג התקע בעמוד המוצר.' },
  { slug: 'audio', emoji: '🎧', title: '10 אוזניות ורמקולים מובילים', test: /earbud|earphone|headphone|headset|speaker|subwoofer|\biem\b|openfit|openrun|opendots/i,
    intro: 'אוזניות אלחוטיות, אוזניות פתוחות לספורט ורמקולים שולחניים, מתוך המוצרים המובילים אצל מפרסמי עליאקספרס.' },
  { slug: 'home', emoji: '🏠', title: '10 מוצרים לבית ולניקיון', test: /vacuum cleaner|robot vacuum|window (robot|cleaning)|cabinet light|night light|coffee grinder|egg cooker|ultrasonic cleaner|oral irrigator|coat rack|watch box|stick vacuum|wet (and|&) dry/i, not: /mini ?pc|blower|jet ?fan|car vacuum/i,
    intro: 'שואבי אבק, רובוטים לניקוי, תאורה לארונות ומוצרי מטבח, מתוך המוצרים המובילים אצל מפרסמי עליאקספרס.' },
  { slug: 'gaming', emoji: '🎮', title: '10 מוצרי גיימינג ומחשבים', test: /switch 2|playstation|ps5 slim|keyboard|\bmouse\b|\bssd\b|portable monitor|\bmonitor\b|mini ?pc|retroid|controller|joypad/i, not: /jet ?fan|blower|vacuum|power ?bank|transmitter|speaker/i,
    intro: 'קונסולות, עכברים, מקלדות, כונני SSD ומסכים ניידים. למוצרים חשמליים כמו קונסולות כדאי לבדוק את גרסת האזור והאחריות בעמוד המוצר.' },
  { slug: 'outdoor-car', emoji: '🚗', title: '10 מוצרים לרכב, לטיולים ולשטח', test: /tire inflator|air compressor|car |camping|fishing|flashlight|picnic|cooler|bicycle|motorcycle|tripod|selfie|luggage|suitcase|heated vest|gloves|jet fan|blower/i,
    intro: 'משאבות צמיגים, ציוד קמפינג ודיג, פנסים ומזוודות, מתוך המוצרים המובילים אצל מפרסמי עליאקספרס.' },
];

const idOf = (url) => (String(url).match(/\/item\/(\d{6,20})\.html/) || [])[1] || null;

async function details(ids) {
  const out = [];
  for (let i = 0; i < ids.length; i += 20) {
    const chunk = ids.slice(i, i + 20);
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const r = await fetch(`${API}/api/products?ids=${chunk.join(',')}`);
        if (r.ok) {
          const j = await r.json();
          for (const p of j.items || []) out.push({ ...p, checkedAt: j.checkedAt });
          break;
        }
      } catch { /* retry */ }
      await new Promise((res) => setTimeout(res, 1500 * (attempt + 1)));
    }
  }
  return out;
}

/** Returns [{ ...collection, items: [product...] }] – each list has up to 10 live, distinct products. */
export async function top200Collections(csvPath) {
  const rows = parseCSV(await fs.readFile(csvPath, 'utf8')).slice(1);
  const pool = rows.map(([name, , url]) => ({ name, id: idOf(url) })).filter((r) => r.id && !JUNK.test(r.name));
  const used = new Set();
  const result = [];
  for (const c of COLLECTIONS) {
    const cand = pool.filter((r) => !used.has(r.id) && c.test.test(r.name) && !(c.not && c.not.test(r.name))).slice(0, 40);
    const live = (await details(cand.map((r) => r.id))).filter((p) => p.image && p.price != null && /^https:\/\/s\.click\.aliexpress\.com\//.test(p.link || ''));
    const rated = live.filter((p) => p.rating == null || p.rating >= 85);
    // Variety: at most 2 products per brand (brand = first latin word in the CSV name) and no near-duplicate titles.
    const brandOf = Object.fromEntries(cand.map((r) => [r.id, (String(r.name).match(/[A-Za-z][A-Za-z0-9]+/) || [''])[0].toLowerCase()]));
    const perBrand = {};
    const seenTitle = new Set();
    const items = [...rated].sort((a, b) => (b.sold || 0) - (a.sold || 0)).filter((p) => {
      const key = String(p.title).slice(0, 28);
      const b = brandOf[p.id] || '';
      if (seenTitle.has(key) || (b && (perBrand[b] || 0) >= 2)) return false;
      seenTitle.add(key);
      perBrand[b] = (perBrand[b] || 0) + 1;
      return true;
    }).slice(0, 10);
    items.forEach((p) => used.add(p.id));
    if (items.length >= 5) result.push({ ...c, title: items.length === 10 ? c.title : c.title.replace(/^10 /, `${items.length} `), items });
  }
  return result;
}
