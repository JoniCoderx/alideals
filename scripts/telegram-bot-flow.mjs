// Button-driven review conversation for the Telegram bot (runs in the Cloudflare Worker, no Node imports).
//   /review (or the site button) → ⭐ rating buttons → a sentence or two → "which name to show?" buttons → preview.
// Shortcut still works: "5 חסכתי 30 שקל" in one message. One review per person (a new one replaces it).
// State lives in KV: { reviews: [...], flow: { <userHash>: { step, stars, first, last, id, d } }, reports }.
import { BAD, uhash } from './telegram-bot.mjs';

const STARS = (n) => '⭐'.repeat(n);
const cleanName = (s) => String(s || '').replace(/[^\p{L}\s'.-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 20);
const okText = (t) => t.length >= 10 && t.length <= 400 && !/https?:|www\.|t\.me|@\w/.test(t) && !BAD.test(t);

const ask = {
  stars: () => ({ text: '⭐ איך הייתה החוויה עם יש דיל?\nבחרו דירוג:', buttons: [[1, 2, 3, 4, 5].map((n) => ({ text: `${n} ⭐`, callback_data: `rv:s:${n}` })).reverse()] }),
  text: (n) => ({ text: `${STARS(n)} תודה!\n\nעכשיו כתבו במשפט או שניים מה חשבתם ✍️\nלמשל: "חסכתי 30 שקל בהזמנה עם הקוד מהאתר"` }),
  name: (f) => ({
    text: 'כמעט סיימנו 🙌\nבאיזה שם להציג את הביקורת באתר?',
    buttons: [
      [f.first ? { text: f.first, callback_data: 'rv:n:first' } : null, f.first && f.last ? { text: `${f.first} ${f.last[0]}.`, callback_data: 'rv:n:init' } : null].filter(Boolean),
      [{ text: '🙈 בלי שם (אנונימי)', callback_data: 'rv:n:anon' }, { text: '✏️ שם אחר', callback_data: 'rv:n:custom' }],
    ].filter((r) => r.length),
  }),
  custom: () => ({ text: '✏️ כתבו את השם שיופיע (עד 20 תווים):' }),
};

function preview(r, site) {
  return {
    text: `✨ תודה! ככה הביקורת תיראה באתר:\n\n${STARS(r.stars)}\n"${r.text}"\n— ${r.name}\n\nהיא תעלה בעדכון הקרוב (עד שעה). רוצים לשנות? פשוט שלחו /review שוב.`,
    buttons: [[{ text: '⭐ לביקורות באתר', url: `${site}/#reviews` }]],
  };
}

/**
 * Pure: one Telegram update → new state + messages to send.
 * Returns { state, out: [{ chat, text, buttons?, answer? (callback id) }] }
 */
export function reviewFlow(update, state, { today, site = 'https://yeshdeal.com' }) {
  const st = { reviews: [...(state.reviews || [])], flow: { ...(state.flow || {}) }, reports: state.reports || {} };
  const out = [];
  const cb = update.callback_query;
  const msg = update.message;
  const from = cb?.from || msg?.from;
  const chat = cb?.message?.chat || msg?.chat;
  if (!from || !chat || chat.type !== 'private') return { state: st, out, handled: false };
  const h = uhash(from.id);
  const f = st.flow[h] ? { ...st.flow[h] } : null;
  const send = (m) => out.push({ chat: chat.id, ...m });
  const save = (r) => { st.reviews = st.reviews.filter((x) => x.h !== h); st.reviews.push(r); st.reviews = st.reviews.slice(-200); };
  const start = () => { st.flow[h] = { step: 'stars', first: cleanName(from.first_name).split(' ')[0] || '', last: cleanName(from.last_name).split(' ')[0] || '', d: today }; send(ask.stars()); };

  if (cb) {
    const [, kind, val] = String(cb.data || '').split(':');
    out.push({ answer: cb.id });
    if (kind === 'go') { start(); return { state: st, out, handled: true }; }
    if (kind === 's' && /^[1-5]$/.test(val)) {
      st.flow[h] = { ...(f || { first: cleanName(from.first_name).split(' ')[0] || '', last: cleanName(from.last_name).split(' ')[0] || '' }), step: 'text', stars: Number(val), d: today };
      send(ask.text(Number(val)));
    } else if (kind === 'n' && f?.step === 'name') {
      const r = st.reviews.find((x) => x.h === h);
      if (!r) { start(); return { state: st, out, handled: true }; }
      if (val === 'custom') { st.flow[h] = { ...f, step: 'custom' }; send(ask.custom()); }
      else {
        r.name = val === 'init' && f.first && f.last ? `${f.first} ${f.last[0]}.` : val === 'anon' ? 'גולש/ת' : f.first || 'גולש/ת';
        delete st.flow[h];
        send(preview(r, site));
      }
    } else if (kind === 'n') { start(); }
    return { state: st, out, handled: true };
  }

  const text = (msg.text || '').trim();
  if (/^\/(start\s+review|review(@\w+)?)$/i.test(text)) { start(); return { state: st, out, handled: true }; }
  // One-message shortcut: "5 טקסט" or "/review 5 טקסט"
  const quick = text.replace(/^\/review(@\w+)?\s+/i, '').match(/^\s*([1-5])\s*(?:\/\s*5)?\s*[-–:,.]?\s*([\s\S]{2,})$/);
  if (quick && (!f || f.step === 'stars')) {
    const body = quick[2].replace(/\s+/g, ' ').trim();
    if (!okText(body)) { send({ text: 'הטקסט צריך להיות בין 10 ל־400 תווים, בלי קישורים 🙏 נסו שוב.' }); return { state: st, out, handled: true }; }
    const first = cleanName(from.first_name).split(' ')[0] || '';
    save({ id: String(update.update_id), h, name: first || 'גולש/ת', stars: Number(quick[1]), text: body, d: today });
    st.flow[h] = { step: 'name', first, last: cleanName(from.last_name).split(' ')[0] || '', d: today };
    send(ask.name(st.flow[h]));
    return { state: st, out, handled: true };
  }
  if (!f || text.startsWith('/')) return { state: st, out, handled: false };
  if (f.step === 'stars') { send(ask.stars()); return { state: st, out, handled: true }; }
  if (f.step === 'text') {
    const body = text.replace(/\s+/g, ' ').trim();
    if (!okText(body)) { send({ text: body.length < 10 ? 'קצת קצר 🙂 כתבו עוד כמה מילים (לפחות 10 תווים).' : 'הטקסט צריך להיות עד 400 תווים, בלי קישורים או תיוגים 🙏 נסו שוב.' }); return { state: st, out, handled: true }; }
    save({ id: String(update.update_id), h, name: f.first || 'גולש/ת', stars: f.stars, text: body, d: today });
    st.flow[h] = { ...f, step: 'name' };
    send(ask.name(f));
    return { state: st, out, handled: true };
  }
  if (f.step === 'custom') {
    const name = cleanName(text);
    if (name.length < 2 || BAD.test(name)) { send({ text: 'השם צריך להיות 2–20 אותיות 🙂 נסו שוב:' }); return { state: st, out, handled: true }; }
    const r = st.reviews.find((x) => x.h === h);
    if (r) r.name = name;
    delete st.flow[h];
    if (r) send(preview(r, site)); else start();
    return { state: st, out, handled: true };
  }
  if (f.step === 'name') { send(ask.name(f)); return { state: st, out, handled: true }; }
  return { state: st, out, handled: false };
}
