// Telegram channel bot: posts new coupon codes and "ends tomorrow" reminders.
// Runs in CI on every build; idempotent thanks to state kept in data/generated.json (telegram.posted).
//   TELEGRAM_BOT_TOKEN  – from @BotFather
//   TELEGRAM_CHANNEL    – @channelusername (the bot must be an admin with "Post messages")
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mergeCoupons, safeLink, daysBetween } from './lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const money = (n, cur = 'USD') => (cur === 'ILS' ? `₪${n}` : `$${n}`);
const heDate = (d) => { const [y, m, dd] = d.split('-'); return `${Number(dd)}.${Number(m)}`; };
const keyOf = (c) => `${c.code}|${c.expires || ''}`;

/** Pure: decides what to post. Returns { messages, posted } (posted = new state). */
export function planPosts({ coupons, posted = {}, today, siteUrl, siteName, utm = 'utm_source=telegram&utm_medium=social' }) {
  const real = coupons.filter((c) => c.code && !c.sample).sort((a, b) => a.minOrder - b.minOrder);
  const next = { ...posted };
  const messages = [];
  const link = (p) => {
    const [pathPart, hash] = p.split('#');
    return `${siteUrl}${pathPart}${pathPart.includes('?') ? '&' : '?'}${utm}${hash ? `#${hash}` : ''}`;
  };

  // 1) New codes → one batch message
  const fresh = real.filter((c) => !posted[keyOf(c)]);
  if (fresh.length) {
    const lines = fresh.map((c) => `• <b>${money(c.discount, c.currency)}</b> הנחה מעל ${money(c.minOrder, c.currency)}: <code>${esc(c.code)}</code>`);
    const until = [...new Set(fresh.map((c) => c.expires).filter(Boolean))];
    const best = [...fresh].sort((a, b) => b.discount - a.discount)[0];
    messages.push({
      kind: 'new',
      text: [
        `🔥 <b>${fresh.length > 1 ? 'קודי קופון חדשים לאליאקספרס' : 'קוד קופון חדש לאליאקספרס'}</b>`,
        '',
        ...lines,
        '',
        until.length === 1 ? `⏳ בתוקף עד ${heDate(until[0])}` : '',
        '👆 לוחצים על הקוד כדי להעתיק, ומדביקים בשדה "קוד מבצע" בתשלום.',
      ].filter((l, i, a) => l !== '' || a[i - 1] !== '').join('\n').trim(),
      buttons: [
        [{ text: '🛒 לאליאקספרס', url: link(`/go/${best.id}/`) }],
        [{ text: '🧮 איזה קוד מתאים לעגלה שלי?', url: link('/#calc') }],
      ],
    });
    for (const c of fresh) next[keyOf(c)] = { posted: today };
  }

  // 2) Ending tomorrow → one reminder per expiry date
  const ending = real.filter((c) => c.expires && daysBetween(today, c.expires) === 1 && !next[keyOf(c)]?.reminded);
  if (ending.length) {
    const top = [...ending].sort((a, b) => b.discount - a.discount).slice(0, 4);
    messages.push({
      kind: 'ending',
      text: [
        `⏰ <b>נגמר מחר!</b> ${ending.length} קודים לאליאקספרס פגים מחר (${heDate(ending[0].expires)}).`,
        '',
        ...top.map((c) => `• ${money(c.discount, c.currency)} מעל ${money(c.minOrder, c.currency)}: <code>${esc(c.code)}</code>`),
        '',
        'מי שמתכנן להזמין, עכשיו הזמן.',
      ].join('\n'),
      buttons: [[{ text: '🔥 לכל הקודים', url: link('/') }]],
    });
    for (const c of ending) next[keyOf(c)] = { ...(next[keyOf(c)] || { posted: today }), reminded: today };
  }

  // Forget codes that expired long ago so state stays small.
  for (const [k, v] of Object.entries(next)) {
    const exp = k.split('|')[1];
    if (exp && daysBetween(exp, today) > 30) delete next[k];
  }
  return { messages, posted: next };
}

async function send(token, chat, msg) {
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chat,
      text: msg.text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      reply_markup: { inline_keyboard: msg.buttons },
    }),
  });
  const j = await res.json();
  if (!j.ok) throw new Error(`Telegram: ${j.error_code} ${j.description}`);
}

// ---- CLI ----
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const site = JSON.parse(await fs.readFile(path.join(ROOT, 'config/site.json'), 'utf8'));
  const token = process.env.TELEGRAM_BOT_TOKEN;
  // Channel: TELEGRAM_CHANNEL secret, or derived from social.telegram (https://t.me/name → @name).
  const fromSite = (site.social?.telegram || '').match(/t\.me\/([A-Za-z0-9_]{4,})/);
  const chat = (process.env.TELEGRAM_CHANNEL || '').trim() || (fromSite ? `@${fromSite[1]}` : '');
  const dry = process.argv.includes('--dry');
  if (!dry && (!token || !chat)) { console.log(`• Telegram not configured (token: ${token ? 'yes' : 'no'}, channel: ${chat || 'none'}) – skipping`); process.exit(0); }
  const manual = JSON.parse(await fs.readFile(path.join(ROOT, 'data/coupons.json'), 'utf8'));
  const genFile = path.join(ROOT, 'data/generated.json');
  const gen = JSON.parse(await fs.readFile(genFile, 'utf8').catch(() => '{}'));
  if (!safeLink(site.affiliate.defaultLink) || /REPLACE/.test(site.affiliate.defaultLink)) { console.log('• no valid link yet – skipping'); process.exit(0); }

  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date());
  const { active } = mergeCoupons(manual.coupons, (gen.sheetCoupons || []).filter((c) => c.type !== 'deal'), today);
  const { messages, posted } = planPosts({ coupons: active, posted: gen.telegram?.posted || {}, today, siteUrl: site.url, siteName: site.name });

  if (dry) { for (const m of messages) console.log(`--- ${m.kind}\n${m.text}\n${JSON.stringify(m.buttons)}`); process.exit(0); }
  let sent = 0;
  for (const m of messages) {
    try { await send(token, chat, m); sent++; } catch (e) { console.error(`✗ ${e.message}`); process.exitCode = 1; break; }
  }
  if (sent === messages.length) {
    gen.telegram = { posted, lastRun: new Date().toISOString() };
    await fs.writeFile(genFile, JSON.stringify(gen, null, 2) + '\n');
  }
  console.log(`✓ telegram → ${chat}: ${sent}/${messages.length} messages sent`);
}
