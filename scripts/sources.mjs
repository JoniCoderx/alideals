// Coupon data sources: local JSON, Google Sheets CSV, Reddit community (r/AliExpressCode).

const UA = `web:kodhayom-coupon-bot:1.1 (by /u/${process.env.REDDIT_USERNAME || 'kodhayom'})`;

/* ---------------- CSV (Google Sheets "Publish to web" -> CSV) ---------------- */
export function parseCSV(text) {
  const rows = [];
  let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') q = false;
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((v) => v.trim() !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((v) => v.trim() !== '')) rows.push(row);
  if (!rows.length) return [];
  const head = rows[0].map((h) => h.trim().toLowerCase());
  return rows.slice(1).map((r) => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? '').trim()])));
}

export function sheetRowToCoupon(r) {
  const type = (r.type || 'code').toLowerCase() === 'deal' ? 'deal' : 'code';
  const featured = r.featured ? /^(1|true|yes|כן)$/i.test(r.featured) : undefined;
  return compact({
    id: r.id,
    code: (r.code || '').toUpperCase().replace(/\s+/g, ''),
    title: r.title,
    text: r.text,
    badge: r.badge,
    discount: num(r.discount),
    minOrder: num(r.min_order ?? r.minorder),
    currency: r.currency ? r.currency.toUpperCase() : undefined,
    expires: r.expires,
    starts: r.starts,
    verified: r.verified,
    type,
    link: r.link,
    note: r.note,
    featured,
    sample: false, // anything in the sheet is real data
    source: 'sheet',
  });
}

export async function fetchSheetCoupons(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`Sheet HTTP ${res.status}`);
  const text = await res.text();
  if (/^\s*<(!doctype|html)/i.test(text)) throw new Error('Sheet URL returned HTML – use File → Share → Publish to web → CSV');
  return parseCSV(text).map(sheetRowToCoupon).filter((c) => c.code || c.type === 'deal');
}

function compact(o) {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== ''));
}

/* ---------------- Reddit: r/AliExpressCode ---------------- */
const STOP = new Set([
  'USD', 'US', 'EUR', 'ILS', 'NIS', 'OFF', 'CODE', 'CODES', 'PROMO', 'COUPON', 'ALIEXPRESS', 'CHOICE', 'SALE',
  'FREE', 'SHIPPING', 'ORDER', 'ORDERS', 'NEW', 'USER', 'USERS', 'APP', 'HTTPS', 'HTTP', 'WWW', 'COM', 'EDIT',
  'UPDATE', 'WORKING', 'VALID', 'TODAY', 'GLOBAL', 'ISRAEL', 'NOVEMBER', 'DECEMBER', 'BLACK', 'FRIDAY',
]);
const CODE_RE = /\b(?=[A-Z0-9]*\d)(?=[A-Z0-9]*[A-Z])[A-Z][A-Z0-9]{3,13}\b/g;
// "$5 off $39", "US $5/$39", "5$ off 39$", "$5 discount over $39"
const PAIR_RE = /(?:US\s?)?\$\s?(\d{1,3})(?:\.\d+)?\s*(?:off|\/|discount|-)\s*(?:on|over|orders?|above|for|min\.?|minimum)?\s*(?:US\s?)?\$\s?(\d{1,4})|(\d{1,3})\s?\$\s*(?:off|\/|-)\s*(?:on|over|orders?|above)?\s*(\d{1,4})\s?\$/gi;

export function extractCodesFromText(text) {
  const out = [];
  const lines = String(text).split(/\n+/);
  for (const line of lines) {
    const codes = (line.match(CODE_RE) || []).filter((c) => !STOP.has(c) && !/^\d/.test(c) && !/^(USD|EUR)\d+$/.test(c));
    if (!codes.length) continue;
    PAIR_RE.lastIndex = 0;
    const m = PAIR_RE.exec(line);
    const discount = m ? Number(m[1] || m[3]) : null;
    const minOrder = m ? Number(m[2] || m[4]) : null;
    for (const code of codes) {
      if (discount && minOrder && minOrder > discount) out.push({ code, discount, minOrder });
    }
  }
  return out;
}

async function redditToken(id, secret) {
  const res = await fetch('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': UA,
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) throw new Error(`Reddit auth HTTP ${res.status}`);
  return (await res.json()).access_token;
}

export async function fetchRedditCoupons({ subreddit = 'AliExpressCode', clientId, clientSecret, maxAgeDays = 21 }) {
  let url = `https://www.reddit.com/r/${subreddit}/new.json?limit=100&raw_json=1`;
  const headers = { 'User-Agent': UA };
  if (clientId && clientSecret) {
    headers.Authorization = 'Bearer ' + (await redditToken(clientId, clientSecret));
    url = `https://oauth.reddit.com/r/${subreddit}/new?limit=100&raw_json=1`;
  }
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`Reddit HTTP ${res.status}${clientId ? '' : ' (set REDDIT_CLIENT_ID/SECRET)'}`);
  const json = await res.json();
  const cutoff = Date.now() / 1000 - maxAgeDays * 86400;
  const seen = new Map();
  for (const { data: p } of json?.data?.children ?? []) {
    if (!p || p.created_utc < cutoff || p.removed_by_category || p.over_18) continue;
    const text = `${p.title}\n${p.selftext || ''}`;
    const israeli = /israel|ישראל|\bIL\b/i.test(text);
    for (const c of extractCodesFromText(text)) {
      const key = `${c.code}|${c.discount}|${c.minOrder}`;
      const prev = seen.get(key);
      const score = (p.score || 0) + (israeli ? 25 : 0);
      if (!prev || prev.score < score) {
        seen.set(key, {
          ...c,
          currency: 'USD',
          type: 'code',
          source: 'community',
          verified: false,
          israel: israeli,
          score,
          foundAt: new Date(p.created_utc * 1000).toISOString().slice(0, 10),
          ref: `https://www.reddit.com${p.permalink}`,
        });
      }
    }
  }
  return [...seen.values()].sort((a, b) => b.score - a.score).slice(0, 30);
}

function num(v) {
  const n = parseFloat(String(v ?? '').replace(/[^\d.]/g, ''));
  return Number.isFinite(n) ? n : null;
}
