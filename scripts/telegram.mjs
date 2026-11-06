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
        `🎉 <b>${esc(ev.name)} ב${STORE} התחיל!</b>`,
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
      card: { kind: 'ending', title: 'נגמר מחר!', subtitle: `${ending.length} קודים ל${STORE} פגים ב-${heDate(ending[0].expires)}`, codes: top4, footer: 'מי שמתכנן להזמין, עכשיו הזמן', site: host },
      text: compactLines([
        `⏰ <b>נגמר מחר!</b> ${ending.length} קודים ל${STORE} פגים מחר (${heDate(ending[0].expires)}).`,
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
export function planRegular({ today, hour, weekday, regular = {}, events = [], coupons = [], siteUrl, library = telegramPosts, announcements = telegramAnnouncements, minGapDays = 10 }) {
  const slot = hour >= 11 && hour < 14 ? 'noon' : hour >= 19 && hour < 22 ? 'evening' : null;
  const state = { lastSlot: regular.lastSlot || '', history: { ...(regular.history || {}) } };
  if (!slot || state.lastSlot === `${today}|${slot}`) return { message: null, regular: state };
  const host = new URL(siteUrl).host;
  const link = (p, campaign) => {
    const [pathPart, hash] = p.split('#');
    return `${siteUrl}${pathPart}?utm_source=telegram&utm_medium=social&utm_campaign=${campaign}${hash ? `#${hash}` : ''}`;
  };
  const done = (id, message) => { state.lastSlot = `${today}|${slot}`; state.history[id] = today; return { message, regular: state }; };
  const real = coupons.filter((c) => c.code && !c.sample);

  // 1) Countdown before a sale (3 days and 1 day before), evening slot.
  if (slot === 'evening') {
    for (const ev of events) {
      const d = daysBetween(today, ev.start);
      const id = `cd|${ev.slug}|${ev.start}|${d}`;
      if ((d === 3 || d === 1) && !state.history[id]) {
        const short = ev.name.split(' –')[0];
        return done(id, {
          kind: 'countdown',
          card: { kind: 'countdown', bigNumber: d, bigLabel: d === 1 ? 'יום אחד!' : 'ימים', title: `עד ${short} בעליאקספרס`, points: ['מוסיפים מוצרים לעגלה כבר עכשיו', 'אוספים קופונים ממרכז הקופונים', 'הקודים יגיעו לכאן ברגע שייצאו'], site: host },
          text: `⏳ <b>${d === 1 ? 'מחר' : `בעוד ${d} ימים`}: ${esc(ev.name)} בעליאקספרס!</b>\n\nמי שמתכונן מראש חוסך יותר. מוסיפים לעגלה עכשיו, כדי לראות כמה המחיר באמת יורד. הקודים של המבצע יפורסמו כאן ברגע שייצאו 🔔`,
          buttons: [[{ text: '📅 עמוד המבצע', url: link(`/sale/${ev.slug}/`, `countdown-${ev.slug}`) }], [{ text: '🎟️ למרכז הקופונים', url: link('/go/coupon-center/', `countdown-${ev.slug}`) }]],
        });
      }
    }
  }

  // 2) Weekly best code – Friday noon.
  const weekKey = `weekly|${today.slice(0, 4)}-${Math.ceil(daysBetween(`${today.slice(0, 4)}-01-01`, today) / 7)}`;
  if (slot === 'noon' && weekday === 5 && real.length && !state.history[weekKey]) {
    const top = [...real].sort((a, b) => b.discount - a.discount).slice(0, 3);
    const mid = [...real].sort((a, b) => a.minOrder - b.minOrder)[Math.floor(real.length / 2)];
    return done(weekKey, {
      kind: 'weekly',
      card: { kind: 'weekly', title: 'הקודים הכי שווים השבוע', subtitle: 'לעליאקספרס · לישראל', codes: top, footer: 'סופ"ש של קניות 🛍️', site: host },
      text: `🏆 <b>הקודים הכי שווים השבוע לעליאקספרס</b>\n\n${top.map(line).join('\n')}\n\n💡 לרוב העגלות הקוד המשתלם הוא <code>${esc(mid.code)}</code> (${money(mid.discount, mid.currency)} מעל ${money(mid.minOrder, mid.currency)}). לא בטוחים? המחשבון יגיד לכם.`,
      buttons: [[{ text: '🧮 איזה קוד מתאים לי?', url: link('/#calc', 'weekly') }], [{ text: '🛒 לעליאקספרס', url: link(`/go/${top[0].id}/`, 'weekly') }]],
    });
  }

  // 3) One-time announcements (each posted once ever).
  const ann = announcements.find((a) => !state.history[a.id]);
  if (ann) {
    return done(ann.id, {
      kind: ann.type,
      card: { kind: ann.type, emoji: ann.emoji, title: ann.title, points: ann.points, badge: ann.badge, site: host },
      text: `${ann.emoji} <b>${esc(ann.title)}</b>\n\n${esc(ann.text)}`,
      buttons: ann.buttons.map(([label, p]) => [{ text: label, url: link(p, ann.id) }]),
    });
  }

  // 4) Evergreen rotation: the post shown least recently (never-shown first), respecting the gap.
  const candidates = library
    .map((p, i) => ({ p, i, last: state.history[p.id] || '' }))
    .filter(({ last }) => !last || daysBetween(last, today) >= minGapDays)
    .sort((a, b) => a.last.localeCompare(b.last) || a.i - b.i);
  if (!candidates.length) return { message: null, regular: state };
  const post = candidates[0].p;
  return done(post.id, {
    kind: post.type,
    card: { kind: post.type, emoji: post.emoji, title: post.title, points: post.points, site: host },
    text: `${post.emoji} <b>${esc(post.title)}</b>\n\n${esc(post.text)}`,
    buttons: post.buttons.map(([label, p]) => [{ text: label, url: link(p, post.id) }]),
  });
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
  // Regular content (tips / promotions / features): only when no code post goes out in this run.
  const tz = (o) => Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', ...o }).format(new Date()));
  const hour = process.env.FORCE_HOUR ? Number(process.env.FORCE_HOUR) : tz({ hour: 'numeric', hour12: false });
  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
  const reg = planRegular({ today, hour, weekday, regular: gen.telegram?.regular, events: manual.events || [], coupons: active, siteUrl: site.url });
  if (!messages.length && reg.message) messages.push(aff(reg.message));

  let sent = 0;
  for (const m of messages) {
    try { const how = await send(token, chat, m); console.log(`  ✓ ${m.kind} (${how})`); sent++; }
    catch (e) { console.error(`✗ ${e.message}`); process.exitCode = 1; break; }
  }
  if (sent === messages.length) {
    gen.telegram = { posted, regular: messages.some((m) => m.kind === reg.message?.kind && m.card === reg.message?.card) ? reg.regular : (gen.telegram?.regular || {}), lastRun: new Date().toISOString() };
    await fs.writeFile(genFile, JSON.stringify(gen, null, 2) + '\n');
  }
  console.log(`✓ telegram → ${chat}: ${sent}/${messages.length} posts`);
}
