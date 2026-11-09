// Pure Telegram-bot logic shared by the Cloudflare Worker (real-time webhook) and the CI script.
// No Node imports – must run in the Worker runtime.

/**
 * Pure: folds bot updates into the code-report store.
 * Users tap "לא עבד לכם? דווחו" on the site → t.me/<bot>?start=r_CODE → the bot receives "/start r_CODE".
 * Store: { CODE: [{ d: 'YYYY-MM-DD', u: userId }] } – one entry per user per code per day, last 50 kept.
 */
export function collectReports(updates, { reports = {}, codes = [], today }) {
  const next = { ...reports };
  const replies = [];
  const valid = codes ? new Set(codes.map((c) => String(c).toUpperCase())) : null;
  for (const u of updates) {
    const msg = u.message;
    const m = (msg?.text || '').trim().match(/^\/start\s+r_([A-Za-z0-9]{3,24})$/);
    if (!m) { if (msg?.chat?.id && /^\/start/.test(msg.text || '') && !/^\/start\s+review$/.test((msg.text || '').trim())) replies.push({ chat: msg.chat.id, kind: 'hello' }); continue; }
    const code = m[1].toUpperCase();
    if (valid && !valid.has(code)) { replies.push({ chat: msg.chat.id, kind: 'unknown', code }); continue; }
    const list = next[code] ? [...next[code]] : [];
    const uid = msg.from?.id ?? msg.chat.id;
    const hu = uhash(uid); // only a one-way hash is stored (the state file is public)
    if (!list.some((r) => (r.u === hu || r.u === uid) && r.d === today)) list.push({ d: today, u: hu });
    next[code] = list.slice(-50);
    replies.push({ chat: msg.chat.id, kind: 'thanks', code });
  }
  return { reports: next, replies };
}


/**
 * Pure: verified reviews written to the bot. The site links to t.me/<bot>?start=review → the bot asks for
 * a rating + text → the next message from that person becomes a review (one per person; a new one replaces it).
 * Auto-moderation: 1–5 stars required, 10–400 chars, no links/handles, no profanity. The owner can hide any
 * review by id (site.json reviews.hidden). Only a one-way hash of the Telegram user id is stored.
 */
export const BAD = /(זונה|בן זונה|כוס אמא|שרמוט|מניאק|fuck|shit)/i;
export const uhash = (id) => { let h = 2166136261; for (const ch of `yd:${id}`) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };
export function collectReviews(updates, { reviews = [], pending = {}, today }) {
  let list = [...reviews];
  const wait = { ...pending };
  const replies = [];
  for (const u of updates) {
    const msg = u.message;
    if (!msg?.chat?.id || msg.chat.type !== 'private') continue;
    const text = (msg.text || '').trim();
    const h = uhash(msg.from?.id ?? msg.chat.id);
    if (/^\/(start\s+review|review(@\w+)?)$/i.test(text)) { wait[h] = today; replies.push({ chat: msg.chat.id, kind: 'reviewAsk' }); continue; }
    const inline = text.match(/^\/review(?:@\w+)?\s+([\s\S]+)$/i);
    const looksLikeReview = /^\s*[1-5]\s*(\/\s*5)?\s*[-–:,.]?\s*\S/.test(text) || /^⭐/.test(text);
    if (!inline && !wait[h] && !looksLikeReview) continue;
    if (!inline && text.startsWith('/')) continue;
    delete wait[h];
    const body0 = inline ? inline[1] : text;
    const m = body0.match(/^\s*([1-5])\s*(?:\/\s*5)?\s*[-–:,.]?\s*([\s\S]+)$/) || (() => { const st = (body0.match(/⭐/g) || []).length; return st >= 1 && st <= 5 ? [null, String(st), body0.replace(/⭐/g, '').trim()] : null; })();
    const body = m ? m[2].replace(/\s+/g, ' ').trim() : '';
    if (!m || body.length < 10 || body.length > 400 || /https?:|www\.|t\.me|@\w/.test(body) || BAD.test(body)) { replies.push({ chat: msg.chat.id, kind: 'reviewBad' }); continue; }
    const name = String(msg.from?.first_name || '').replace(/[^\p{L}\s'-]/gu, '').trim().split(/\s+/)[0]?.slice(0, 20) || 'גולש';
    list = list.filter((r) => r.h !== h);
    list.push({ id: String(u.update_id), h, name, stars: Number(m[1]), text: body, d: today });
    replies.push({ chat: msg.chat.id, kind: 'reviewThanks' });
  }
  for (const [k, d] of Object.entries(wait)) if (d < today && Date.parse(today) - Date.parse(d) > 3 * 864e5) delete wait[k];
  return { reviews: list.slice(-200), pending: wait, replies };
}

