// Telegram channel bot: posts new coupon codes, "sale started" and "ends tomorrow" posts, each with a branded image.
// Runs in CI on every build; idempotent thanks to state kept in data/generated.json (telegram.posted).
//   TELEGRAM_BOT_TOKEN  – from @BotFather (GitHub secret)
//   TELEGRAM_CHANNEL    – optional; defaults to social.telegram in config/site.json (https://t.me/name → @name)
//   TELEGRAM_REPOST=1   – re-post all current codes once (manual run), e.g. after a design change
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mergeCoupons, safeLink, daysBetween } from './lib.mjs';
import { renderCard } from './telegram-card.mjs';
import { telegramPosts, telegramAnnouncements } from '../src/content/telegram-posts.mjs';
import { categories, categoryColors } from '../src/content/categories.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Telegram audience spells it with ע – the site covers both spellings for SEO.
const STORE = 'עליאקספרס';

const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const money = (n, cur = 'USD') => (cur === 'ILS' ? `₪${n}` : `$${n}`);
const heDate = (d) => { const [, m, dd] = d.split('-'); return `${Number(dd)}.${Number(m)}`; };
const keyOf = (c) => `${c.code}|${c.expires || ''}`;
const line = (c) => `• <b>${money(c.discount, c.currency)}</b> הנחה מעל ${money(c.minOrder, c.currency)}: <code>${esc(c.code)}</code>`;
const compactLines = (arr) => arr.filter((l, i, a) => l !== '' || (i > 0 && a[i - 1] !== '')).join('\n').trim();

/** Pure: decides what to post. Returns { messages, posted } (posted = new state). */
export function planPosts({ coupons, events = [], posted = {}, today, siteUrl, repost = false, utm = 'utm_source=telegram&utm_medium=social' }) {
  const real = coupons.filter((c) => c.code && !c.sample).sort((a, b) => a.minOrder - b.minOrder);
  const next = { ...posted };
  const messages = [];
  const link = (p) => {
    const [pathPart, hash] = p.split('#');
    return `${siteUrl}${pathPart}${pathPart.includes('?') ? '&' : '?'}${utm}${hash ? `#${hash}` : ''}`;
  };
  const best = (arr) => [...arr].sort((a, b) => b.discount - a.discount)[0];
  const host = new URL(siteUrl).host;

  // 1) New codes (or a forced re-post) → one batch post
  const fresh = repost ? real : real.filter((c) => !posted[keyOf(c)]);
  if (fresh.length) {
    const until = [...new Set(fresh.map((c) => c.expires).filter(Boolean))];
    const top = best(fresh);
    messages.push({
      kind: 'new',
      card: {
        kind: 'new',
        title: fresh.length > 1 ? `קודי קופון ל${STORE}` : `קוד קופון ל${STORE}`,
        subtitle: `עד ${money(top.discount, top.currency)} הנחה · לישראל`,
        codes: fresh,
        footer: until.length === 1 ? `בתוקף עד ${heDate(until[0])}` : '',
        site: host,
      },
      text: compactLines([
        `🔥 <b>${fresh.length > 1 ? `קודי קופון חדשים ל${STORE}` : `קוד קופון חדש ל${STORE}`}</b>`,
        '',
        ...fresh.map(line),
        '',
        until.length === 1 ? `⏳ בתוקף עד ${heDate(until[0])}` : '',
        '👆 לחיצה על הקוד מעתיקה אותו. מדביקים בשדה "קוד מבצע" בתשלום.',
      ]),
      buttons: [
        [{ text: `🛒 ל${STORE}`, url: link(`/go/${top.id}/`) }],
        [{ text: '🧮 איזה קוד מתאים לעגלה שלי?', url: link('/#calc') }],
      ],
    });
    for (const c of fresh) next[keyOf(c)] = { ...(next[keyOf(c)] || {}), posted: today };
  }

  // 2) Sale starts today → one post per event (only if it has active codes and wasn't covered by a "new" post today)
  for (const ev of events) {
    const k = `event|${ev.slug}|${ev.start}`;
    if (ev.start !== today || next[k]) continue;
    const evCodes = real.filter((c) => c.event === ev.slug);
    next[k] = { posted: today };
    if (!evCodes.length || fresh.some((c) => c.event === ev.slug)) continue;
    const top = best(evCodes);
    messages.push({
      kind: 'event',
      card: { kind: 'event', title: `${ev.name.split(' –')[0]} התחיל!`, subtitle: `עד ${money(top.discount, top.currency)} הנחה ב${STORE}`, codes: evCodes, footer: ev.end ? `עד ${heDate(ev.end)}` : '', site: host },
      text: compactLines([
        `🎉 <b>${esc(ev.name.split(' –')[0])} ב${STORE} התחיל!</b>`,
        '',
        ...evCodes.map(line),
        '',
        ev.end ? `⏳ המבצע עד ${heDate(ev.end)}. הקודים הגבוהים נגמרים ראשונים.` : '',
      ]),
      buttons: [[{ text: '🔥 לכל הקודים', url: link(`/sale/${ev.slug}/`) }], [{ text: `🛒 ל${STORE}`, url: link(`/go/${top.id}/`) }]],
    });
  }

  // 3) Ending tomorrow → one reminder per expiry date
  const ending = real.filter((c) => c.expires && daysBetween(today, c.expires) === 1 && !next[keyOf(c)]?.reminded);
  if (ending.length) {
    const top4 = [...ending].sort((a, b) => b.discount - a.discount).slice(0, 4);
    messages.push({
      kind: 'ending',
      card: { kind: 'ending', title: 'נגמרים מחר!', subtitle: `${ending.length} קודים ל${STORE} פגים ב-${heDate(ending[0].expires)}`, codes: top4, footer: 'מי שמתכנן להזמין, עכשיו הזמן', site: host },
      text: compactLines([
        `⏰ <b>נגמרים מחר!</b> ${ending.length} קודים ל${STORE} פגים מחר (${heDate(ending[0].expires)}).`,
        '',
        ...top4.map(line),
        '',
        'מי שמתכנן להזמין, עכשיו הזמן.',
      ]),
      buttons: [[{ text: '🔥 לכל הקודים', url: link('/') }]],
    });
    for (const c of ending) next[keyOf(c)] = { ...(next[keyOf(c)] || { posted: today }), reminded: today };
  }

  // Forget entries that expired long ago so state stays small.
  for (const k of Object.keys(next)) {
    const parts = k.split('|');
    const date = parts[0] === 'event' ? parts[2] : parts[1];
    if (date && daysBetween(date, today) > 30) delete next[k];
  }
  return { messages, posted: next };
}

/**
 * Pure: picks at most one "regular" post (tip / promotion / feature / countdown / weekly) for the current time slot.
 * Slots (Israel time): noon 11:00–13:59, evening 19:00–21:59. Returns { message|null, regular } (new state).
 */
// Seven daily slots (Israel time). Each slot has a preferred content type, falling back to the evergreen library,
// so the channel gets a varied rhythm: code in the morning, tips, a category at noon, deals, code again, prime time, guide at night.
export const SLOTS = [
  { id: 'morning', from: 8, to: 10, prefer: ['spot'] },
  { id: 'midmorning', from: 10, to: 12, prefer: [] },
  { id: 'noon', from: 12, to: 14, prefer: ['weekly', 'category'] },
  { id: 'afternoon', from: 14, to: 16, prefer: [] },
  { id: 'evening', from: 17, to: 19, prefer: ['spot'] },
  { id: 'prime', from: 19, to: 21, prefer: ['countdown'] },
  { id: 'night', from: 21, to: 23, prefer: ['category'] },
];

export function planRegular({ today, hour, weekday, regular = {}, events = [], coupons = [], siteUrl, library = telegramPosts, announcements = telegramAnnouncements, cats = categories, minGapDays = 8, spotGapDays = 3, catGapDays = 10 }) {
  const slot = SLOTS.find((s) => hour >= s.from && hour < s.to);
  const state = { lastSlot: regular.lastSlot || '', history: { ...(regular.history || {}) } };
  if (!slot || state.lastSlot === `${today}|${slot.id}`) return { message: null, regular: state };
  const host = new URL(siteUrl).host;
  const link = (p, campaign) => {
    if (/^https?:/.test(p)) return p;
    const [pathPart, hash] = p.split('#');
    return `${siteUrl}${pathPart}?utm_source=telegram&utm_medium=social&utm_campaign=${campaign}${hash ? `#${hash}` : ''}`;
  };
  const done = (id, message) => { state.lastSlot = `${today}|${slot.id}`; state.history[id] = today; return { message, regular: state }; };
  const fresh = (id, gap) => !state.history[id] || daysBetween(state.history[id], today) >= gap;
  const real = coupons.filter((c) => c.code && !c.sample).sort((a, b) => a.minOrder - b.minOrder);

  const makers = {
    // Countdown before a sale (3 days and 1 day before).
    countdown() {
      for (const ev of events) {
        const d = daysBetween(today, ev.start);
        const id = `cd|${ev.slug}|${ev.start}|${d}`;
        if ((d === 3 || d === 1) && !state.history[id]) {
          const short = ev.name.split(' –')[0];
          return [id, {
            kind: 'countdown',
            card: { kind: 'countdown', bigNumber: d, bigLabel: d === 1 ? 'יום אחד!' : 'ימים', title: `עד ${short} בעליאקספרס`, points: ['מוסיפים מוצרים לעגלה כבר עכשיו', 'אוספים קופונים ממרכז הקופונים', 'הקודים יגיעו לכאן זמן קצר אחרי שייצאו'], site: host },
            text: `⏳ <b>${d === 1 ? 'מחר' : `בעוד ${d} ימים`}: ${esc(short)} בעליאקספרס!</b>\n\nמי שמתכונן מראש חוסך יותר. מוסיפים לעגלה עכשיו, כדי לראות כמה המחיר באמת יורד. הקודים של המבצע יפורסמו כאן זמן קצר אחרי שייצאו 🔔`,
            buttons: [[{ text: '📅 עמוד המבצע', url: link(`/sale/${ev.slug}/`, `countdown-${ev.slug}`) }], [{ text: '🎟️ למרכז הקופונים', url: link('/go/coupon-center/', `countdown-${ev.slug}`) }]],
          }];
        }
      }
      return null;
    },
    // Weekly best codes – Friday noon.
    weekly() {
      const weekKey = `weekly|${today.slice(0, 4)}-${Math.ceil(daysBetween(`${today.slice(0, 4)}-01-01`, today) / 7)}`;
      if (weekday !== 5 || !real.length || state.history[weekKey]) return null;
      const top = [...real].sort((a, b) => b.discount - a.discount).slice(0, 3);
      const mid = real[Math.floor(real.length / 2)];
      return [weekKey, {
        kind: 'weekly',
        card: { kind: 'weekly', title: 'הקודים הכי שווים השבוע', subtitle: 'לעליאקספרס · לישראל', codes: top, footer: 'סופ"ש של קניות 🛍️', site: host },
        text: `🏆 <b>הקודים הכי שווים השבוע לעליאקספרס</b>\n\n${top.map(line).join('\n')}\n\n💡 לעגלה ממוצעת, הקוד המשתלם בדרך כלל הוא <code>${esc(mid.code)}</code> (${money(mid.discount, mid.currency)} מעל ${money(mid.minOrder, mid.currency)}). לא בטוחים? המחשבון יגיד לכם.`,
        buttons: [[{ text: '🧮 איזה קוד מתאים לי?', url: link('/#calc', 'weekly') }], [{ text: '🛒 לעליאקספרס', url: link(`/go/${top[0].id}/`, 'weekly') }]],
      }];
    },
    // "Code of the moment": one code, big, with the cart range it fits.
    spot() {
      const pick = real
        .map((c, i) => ({ c, i, id: `spot|${c.code}`, last: state.history[`spot|${c.code}`] || '' }))
        .filter(({ id }) => fresh(id, spotGapDays))
        .sort((a, b) => a.last.localeCompare(b.last) || (b.c.featured ? 1 : 0) - (a.c.featured ? 1 : 0) || a.i - b.i)[0];
      if (!pick) return null;
      const c = pick.c;
      const next = real[pick.i + 1];
      const range = next ? `מ־${money(c.minOrder, c.currency)} עד ${money((next.minOrder - 0.01).toFixed(2), c.currency)}` : `מ־${money(c.minOrder, c.currency)} ומעלה`;
      const until = c.expires ? `בתוקף עד ${heDate(c.expires)}` : '';
      return [pick.id, {
        kind: 'spot',
        card: { kind: 'spot', bigNumber: money(c.discount, c.currency), bigLabel: `הנחה בקנייה מעל ${money(c.minOrder, c.currency)}`, title: c.code, points: ['מדביקים בתשלום, בשדה "קוד מבצע"', until].filter(Boolean), site: host },
        text: compactLines([
          `⚡ <b>הקוד של עכשיו: ${money(c.discount, c.currency)} הנחה מעל ${money(c.minOrder, c.currency)}</b>`,
          '',
          `👉 <code>${esc(c.code)}</code> (לחיצה מעתיקה)`,
          '',
          `מתאים לעגלה ${range}.${until ? ` ${until}.` : ''}`,
          next ? `💡 חסר לכם מעט ל־${money(next.minOrder, next.currency)}? שם מחכה הנחה של ${money(next.discount, next.currency)}.` : '',
        ]),
        buttons: [[{ text: `🛒 לעליאקספרס עם הקוד`, url: link(`/go/${c.id}/`, 'spot') }], [{ text: '🧮 כל הקודים + מחשבון', url: link('/#calc', 'spot') }]],
      }];
    },
    // Category spotlight: buying tip + link to the category coupon page.
    category() {
      const pick = cats
        .map((c, i) => ({ c, i, id: `cat|${c.slug}`, last: state.history[`cat|${c.slug}`] || '' }))
        .filter(({ id }) => fresh(id, catGapDays))
        .sort((a, b) => a.last.localeCompare(b.last) || a.i - b.i)[0];
      if (!pick) return null;
      const c = pick.c;
      const tips = (c.tips || []).slice(0, 3);
      return [pick.id, {
        kind: 'category',
        card: { kind: 'category', emoji: c.emoji, title: `קונים ${c.buy || c.short} בעליאקספרס?`, points: tips.map(([t]) => t), colors: categoryColors[c.slug], badge: `${c.emoji} ${c.name}`, site: host },
        text: compactLines([
          `${c.emoji} <b>קונים ${esc(c.buy || c.short)} בעליאקספרס? ככה עושים את זה נכון</b>`,
          '',
          ...tips.map(([t, d]) => `• <b>${esc(t)}.</b> ${esc(d.split('. ')[0].replace(/\.$/, ''))}.`),
          '',
          'ועל הכול: קוד קופון לפי סכום העגלה 👇',
        ]),
        buttons: [[{ text: `🎟️ קופון ל${c.short}`, url: link(`/coupon/${c.slug}/`, `cat-${c.slug}`) }]],
      }];
    },
  };

  // 1) One-time announcements (each posted once ever) go first.
  const ann = announcements.find((a) => !state.history[a.id]);
  if (ann) {
    return done(ann.id, {
      kind: ann.type,
      card: { kind: ann.type, emoji: ann.emoji, title: ann.title, points: ann.points, badge: ann.badge, site: host },
      text: `${ann.emoji} <b>${esc(ann.title)}</b>\n\n${esc(ann.text)}`,
      buttons: ann.buttons.map(([label, p]) => [{ text: label, url: link(p, ann.id) }]),
    });
  }

  // 2) The slot's preferred content.
  for (const kind of slot.prefer) {
    const r = makers[kind]?.();
    if (r) return done(r[0], r[1]);
  }

  // 3) Evergreen rotation: the post shown least recently (never-shown first), respecting the gap.
  const candidates = library
    .map((p, i) => ({ p, i, last: state.history[p.id] || '' }))
    .filter(({ last }) => !last || daysBetween(last, today) >= minGapDays)
    .sort((a, b) => a.last.localeCompare(b.last) || a.i - b.i);
  if (!candidates.length) {
    // Library exhausted for now: fall back to a code or a category rather than staying silent.
    for (const kind of ['spot', 'category']) { const r = makers[kind](); if (r) return done(r[0], r[1]); }
    return { message: null, regular: state };
  }
  const post = candidates[0].p;
  return done(post.id, {
    kind: post.type,
    card: { kind: post.type, emoji: post.emoji, title: post.title, points: post.points, site: host },
    text: `${post.emoji} <b>${esc(post.title)}</b>\n\n${esc(post.text)}`,
    buttons: post.buttons.map(([label, p]) => [{ text: label, url: link(p, post.id) }]),
  });
}

const addDays = (d, n) => { const t = new Date(`${d}T12:00:00Z`); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };

/**
 * Pure: plans the regular slots ahead of time so the Cloudflare Worker can publish them on the minute
 * (GitHub's scheduler skips runs). Keeps already-planned items, adds the missing future slots for `days`
 * days, drops the past. Returns the new queue + the advanced rotation state.
 */
export function planQueue({ queue = [], regular = {}, today, hour, days = 2, events = [], coupons = [], siteUrl, affLink, library, announcements, cats }) {
  let reg = regular;
  let keep = queue.filter((q) => q.date > today || (q.date === today && q.hour >= hour));
  // A new one-time announcement jumps the queue: it replaces the next planned slot.
  const annList = announcements || telegramAnnouncements;
  const pending = annList.find((a) => !(reg.history || {})[a.id] && !keep.some((q) => q.annId === a.id));
  if (pending) {
    const next = keep.find((q) => q.date > today || q.hour > hour);
    if (next) {
      const r = planRegular({ today: next.date, hour: next.hour, weekday: new Date(next.date + 'T12:00:00Z').getUTCDay(), regular: { ...reg, lastSlot: '' }, siteUrl, library: [], announcements: [pending], cats: [], coupons: [] });
      reg = { ...reg, history: r.regular.history };
      const m = withAffiliate(r.message, { siteUrl, affLink });
      keep = keep.map((q) => (q === next ? { ...q, annId: pending.id, kind: m.kind, text: m.text, buttons: m.buttons, card: m.card } : q));
    }
  }
  const have = new Set(keep.map((q) => q.key));
  const out = [...keep];
  for (let i = 0; i <= days; i++) {
    const date = addDays(today, i);
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
    const live = coupons.filter((c) => (!c.expires || c.expires >= date) && (!c.starts || c.starts <= date));
    for (const slot of SLOTS) {
      const key = `${date}|${slot.id}`;
      if (have.has(key) || (date === today && slot.from <= hour)) continue;
      const opts = { today: date, hour: slot.from, weekday, regular: reg, events, coupons: live, siteUrl };
      if (library) opts.library = library;
      if (announcements) opts.announcements = announcements;
      if (cats) opts.cats = cats;
      const r = planRegular(opts);
      reg = r.regular;
      if (!r.message) continue;
      const m = withAffiliate(r.message, { siteUrl, affLink });
      out.push({ key, date, hour: slot.from, kind: m.kind, text: m.text, buttons: m.buttons, card: m.card, img: `${date}-${slot.id}.png` });
    }
  }
  out.sort((a, b) => a.date.localeCompare(b.date) || a.hour - b.hour);
  return { queue: out, regular: reg };
}

/**
 * Pure: folds bot updates into the code-report store.
 * Users tap "לא עבד לכם? דווחו" on the site → t.me/<bot>?start=r_CODE → the bot receives "/start r_CODE".
 * Store: { CODE: [{ d: 'YYYY-MM-DD', u: userId }] } – one entry per user per code per day, last 50 kept.
 */
export function collectReports(updates, { reports = {}, codes = [], today }) {
  const next = { ...reports };
  const replies = [];
  const valid = new Set(codes.map((c) => String(c).toUpperCase()));
  for (const u of updates) {
    const msg = u.message;
    const m = (msg?.text || '').trim().match(/^\/start\s+r_([A-Za-z0-9]{3,24})$/);
    if (!m) { if (msg?.chat?.id && /^\/start/.test(msg.text || '')) replies.push({ chat: msg.chat.id, kind: 'hello' }); continue; }
    const code = m[1].toUpperCase();
    if (!valid.has(code)) { replies.push({ chat: msg.chat.id, kind: 'unknown', code }); continue; }
    const list = next[code] ? [...next[code]] : [];
    const uid = msg.from?.id ?? msg.chat.id;
    if (!list.some((r) => r.u === uid && r.d === today)) list.push({ d: today, u: uid });
    next[code] = list.slice(-50);
    replies.push({ chat: msg.chat.id, kind: 'thanks', code });
  }
  return { reports: next, replies };
}

/**
 * Pure: makes sure every post carries the affiliate link (that's what sets the AliExpress cookie).
 * - buttons that point at our /go/ redirect pages become the direct affiliate link (one hop less,
 *   and on phones it opens the AliExpress app straight away);
 * - posts without any AliExpress button get a "🛒 לעליאקספרס" button;
 * - the caption gets a direct affiliate link as its last line (when it still fits Telegram's limit).
 */
export function withAffiliate(msg, { siteUrl, affLink, store = STORE }) {
  if (!msg || !safeLink(affLink)) return msg;
  const isAli = (u) => { try { return /(^|\.)aliexpress\.(com|us|ru)$|^s\.click\.aliexpress\.com$/.test(new URL(u).host); } catch { return false; } };
  const buttons = (msg.buttons || []).map((row) => row.map((b) => (b.url && b.url.startsWith(`${siteUrl}/go/`) ? { ...b, url: affLink } : b)));
  if (!buttons.flat().some((b) => isAli(b.url))) buttons.push([{ text: `🛒 ל${store}`, url: affLink }]);
  const tail = `\n\n🛒 <a href="${affLink}">כניסה ל${store}</a>`;
  const text = msg.text.includes(affLink) || msg.text.length + tail.length > 1000 ? msg.text : msg.text + tail;
  return { ...msg, buttons, text };
}

async function api(token, method, body) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, { method: 'POST', body });
  const j = await res.json();
  if (!j.ok) throw new Error(`Telegram ${method}: ${j.error_code} ${j.description}`);
  return j;
}

async function send(token, chat, msg) {
  const markup = JSON.stringify({ inline_keyboard: msg.buttons });
  const png = msg.card && msg.text.length <= 1024 ? await renderCard(msg.card).catch(() => null) : null;
  if (png) {
    const fd = new FormData();
    fd.set('chat_id', chat);
    fd.set('caption', msg.text);
    fd.set('parse_mode', 'HTML');
    fd.set('reply_markup', markup);
    fd.set('photo', new Blob([png], { type: 'image/png' }), `${msg.kind}.png`);
    await api(token, 'sendPhoto', fd);
    return 'photo';
  }
  await api(token, 'sendMessage', new URLSearchParams({ chat_id: chat, text: msg.text, parse_mode: 'HTML', disable_web_page_preview: 'true', reply_markup: markup }));
  return 'text';
}

// ---- CLI ----
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const site = JSON.parse(await fs.readFile(path.join(ROOT, 'config/site.json'), 'utf8'));
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const fromSite = (site.social?.telegram || '').match(/t\.me\/([A-Za-z0-9_]{4,})/);
  const chat = (process.env.TELEGRAM_CHANNEL || '').trim() || (fromSite ? `@${fromSite[1]}` : '');
  const dry = process.argv.includes('--dry');
  const previewDir = (process.argv.find((a) => a.startsWith('--preview=')) || '').split('=')[1];
  if (!dry && !previewDir && (!token || !chat)) { console.log(`• Telegram not configured (token: ${token ? 'yes' : 'no'}, channel: ${chat || 'none'}) – skipping`); process.exit(0); }

  const manual = JSON.parse(await fs.readFile(path.join(ROOT, 'data/coupons.json'), 'utf8'));
  const genFile = path.join(ROOT, 'data/generated.json');
  const gen = JSON.parse(await fs.readFile(genFile, 'utf8').catch(() => '{}'));
  if (!safeLink(site.affiliate.defaultLink) || /REPLACE/.test(site.affiliate.defaultLink)) { console.log('• no valid link yet – skipping'); process.exit(0); }

  const today = process.env.TODAY || new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date());
  const { active } = mergeCoupons(manual.coupons, (gen.sheetCoupons || []).filter((c) => c.type !== 'deal'), today);
  // Keep bot meta (username, code reports, update offset) across runs, whatever happens below.
  const meta = { bot: gen.telegram?.bot || '', reports: gen.telegram?.reports || {}, updOffset: gen.telegram?.updOffset || 0 };
  if (token && !dry && !previewDir) {
    try {
      const me = await api(token, 'getMe', new URLSearchParams());
      meta.bot = me.result.username || meta.bot;
      const upd = await api(token, 'getUpdates', new URLSearchParams({ offset: String(meta.updOffset + 1), timeout: '0', allowed_updates: JSON.stringify(['message']) }));
      if (upd.result.length) {
        meta.updOffset = upd.result[upd.result.length - 1].update_id;
        const { reports, replies } = collectReports(upd.result, { reports: meta.reports, codes: active.map((c) => c.code), today });
        meta.reports = reports;
        const TXT = {
          thanks: (c) => `תודה על הדיווח! 🙏\nרשמנו שהקוד ${c} לא עבד לכם. אם כמה גולשים מדווחים על אותו קוד, נסמן אותו באתר ונבדוק אותו.\n\nבינתיים כדאי לנסות קוד ממדרגה אחרת: ${site.url}/#codes`,
          unknown: () => `תודה! הקוד הזה כבר לא ברשימה הפעילה שלנו. הקודים העדכניים כאן: ${site.url}/#codes`,
          hello: () => `היי! 👋 אני הבוט של ${site.name}.\nכל הקודים העדכניים לעליאקספרס: ${site.url}\nוהערוץ שלנו: ${site.social.telegram}`,
        };
        for (const r of replies) await api(token, 'sendMessage', new URLSearchParams({ chat_id: String(r.chat), text: TXT[r.kind](r.code), disable_web_page_preview: 'true' })).catch(() => {});
        console.log(`• bot updates: ${upd.result.length}, reports now: ${JSON.stringify(Object.fromEntries(Object.entries(meta.reports).map(([k, v]) => [k, v.length])))}`);
      }
    } catch (e) { console.log(`• bot updates skipped: ${e.message}`); }
  }
  const repost = process.env.TELEGRAM_REPOST === '1' || process.env.TELEGRAM_REPOST === 'true';
  // Safety net: if the CI cache was lost, recover what was already posted from the live site.
  if (!gen.telegram?.posted || !Object.keys(gen.telegram.posted).length) {
    try {
      const r = await fetch(`${site.url}/telegram-state.json`, { headers: { 'Cache-Control': 'no-cache' } });
      if (r.ok) { gen.telegram = await r.json(); console.log(`• recovered telegram state from site (${Object.keys(gen.telegram.posted || {}).length} entries)`); }
    } catch { /* first run */ }
  }
  const aff = (m) => withAffiliate(m, { siteUrl: site.url, affLink: site.affiliate.defaultLink });
  const { messages: planned, posted } = planPosts({ coupons: active, events: manual.events || [], posted: gen.telegram?.posted || {}, today, siteUrl: site.url, repost: repost || !!previewDir });

  const messages = planned.map(aff);
  if (dry || previewDir) {
    for (const m of messages) {
      console.log(`--- ${m.kind} (${m.text.length} chars)\n${m.text}\n${JSON.stringify(m.buttons)}`);
      if (previewDir) {
        const png = await renderCard(m.card);
        if (png) { await fs.mkdir(previewDir, { recursive: true }); await fs.writeFile(path.join(previewDir, `${m.kind}.png`), png); console.log(`  image → ${previewDir}/${m.kind}.png`); }
        else console.log('  (no Chrome – image skipped)');
      }
    }
    process.exit(0);
  }
  // Manual: post a one-time announcement right now (workflow input announce_now).
  const annNow = (process.env.ANNOUNCE_NOW || '').trim();
  if (annNow && token && !dry && !previewDir) {
    const a = telegramAnnouncements.find((x) => x.id === annNow);
    if (a) {
      const r = planRegular({ today, hour: 12, weekday: 1, regular: { history: {} }, siteUrl: site.url, library: [], announcements: [a], cats: [], coupons: [] });
      try {
        console.log('  ✓ announce now:', await send(token, chat, aff(r.message)));
        gen.telegram = { ...(gen.telegram || {}) };
        gen.telegram.regular = { ...(gen.telegram.regular || {}), history: { ...((gen.telegram.regular || {}).history || {}), [a.id]: today } };
        gen.telegram.queue = (gen.telegram.queue || []).filter((q) => q.annId !== a.id);
      } catch (e) { console.error('✗ announce now:', e.message); }
    } else console.log('• unknown announcement id', annNow);
  }
  // Worker mode: plan the next days' slots, render their images into the site (src/root/tg-queue/),
  // and let the Cloudflare Worker publish each one at its slot time. Code posts still go out from here.
  const viaWorker = process.env.TELEGRAM_VIA_WORKER === '1';
  if (viaWorker) {
    const nowHour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', hour: 'numeric', hour12: false }).format(new Date()));
    const q = planQueue({ queue: gen.telegram?.queue || [], regular: gen.telegram?.regular || {}, today, hour: nowHour, events: manual.events || [], coupons: active, siteUrl: site.url, affLink: site.affiliate.defaultLink });
    const dir = path.join(ROOT, 'src/root/tg-queue');
    await fs.rm(dir, { recursive: true, force: true });
    await fs.mkdir(dir, { recursive: true });
    for (const item of q.queue) {
      const png = await renderCard(item.card).catch(() => null);
      if (png) await fs.writeFile(path.join(dir, item.img), png); else item.img = '';
    }
    await fs.writeFile(path.join(dir, 'queue.json'), JSON.stringify({ generated: new Date().toISOString(), items: q.queue.map(({ card, ...pub }) => pub) }));
    gen.telegram = { ...(gen.telegram || {}), ...meta, queue: q.queue, regular: q.regular };
    console.log(`• queued for the Worker: ${q.queue.map((i) => `${i.date} ${i.hour}:00 ${i.kind}`).join(', ')}`);
  }
  // Regular content (tips / promotions / features): only when no code post goes out in this run.
  const tz = (o) => Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', ...o }).format(new Date()));
  const hour = process.env.FORCE_HOUR ? Number(process.env.FORCE_HOUR) : tz({ hour: 'numeric', hour12: false });
  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
  const reg = planRegular({ today, hour, weekday, regular: gen.telegram?.regular, events: manual.events || [], coupons: active, siteUrl: site.url });
  if (!viaWorker && !messages.length && reg.message) messages.push(aff(reg.message));

  let sent = 0;
  for (const m of messages) {
    try { const how = await send(token, chat, m); console.log(`  ✓ ${m.kind} (${how})`); sent++; }
    catch (e) { console.error(`✗ ${e.message}`); process.exitCode = 1; break; }
  }
  if (sent === messages.length) {
    gen.telegram = { ...(gen.telegram || {}), ...meta, posted, regular: viaWorker ? gen.telegram.regular : messages.some((m) => m.kind === reg.message?.kind && m.card === reg.message?.card) ? reg.regular : (gen.telegram?.regular || {}), lastRun: new Date().toISOString() };
    await fs.writeFile(genFile, JSON.stringify(gen, null, 2) + '\n');
  }
  if (sent !== messages.length) { gen.telegram = { ...(gen.telegram || {}), ...meta }; await fs.writeFile(genFile, JSON.stringify(gen, null, 2) + '\n'); }
  console.log(`✓ telegram → ${chat}: ${sent}/${messages.length} posts`);
}
