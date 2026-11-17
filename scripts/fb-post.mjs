// Post the planned Telegram card for a slot to the Facebook Page (workflow fb-post.yml).
// Reuses the pre-rendered queue on yeshdeal.com/tg-queue/: same image, same honest copy, plain-text links.
// Env: FB_PAGE_ID, FB_PAGE_TOKEN (GitHub Secrets), SLOT=<hour> (default: the current Israel hour), DRY=1 to only print.
const SITE = 'https://yeshdeal.com';
const page = process.env.FB_PAGE_ID;
const token = process.env.FB_PAGE_TOKEN;
const dry = process.env.DRY === '1' || !token;

const now = new Date();
const il = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false }).formatToParts(now);
const get = (t) => il.find((p) => p.type === t).value;
const date = process.env.DATE || `${get('year')}-${get('month')}-${get('day')}`;
const slot = Number(process.env.SLOT || get('hour'));

export function toPlain(html) {
  return html
    .replace(/<a href="([^"]+)">([^<]+)<\/a>/g, '$2: $1')
    .replace(/<\/?(b|i|u|code|strong|em)>/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/\(לחיצה מעתיקה\)/g, '')
    .replace(/utm_source=telegram/g, 'utm_source=facebook')
    .replace(/[ \t]+\n/g, '\n').trim();
}

// Facebook copy: a hook, the honest facts from the card, one clear link, a soft question (no tag-bait), 2 hashtags.
const FB = 'utm_source=facebook';
const fbUrl = (u) => u.replace(/utm_source=telegram/g, FB);
const QUESTIONS = {
  '🔋': 'כמה פעמים השבוע נשארתם בלי סוללה?',
  '🚗': 'גם אצלכם הרכב מלא כבלים ומחזיקים שלא מחזיקים?',
  '🏠': 'מה המוצר הקטן מאלי שהכי שדרג לכם את הבית?',
  '🎮': 'מי פה עובד מהבית?',
  '🎧': 'אוזניות או רמקול, מה אתם יותר?',
  '🖌️': 'מה המוצר ביוטי הכי שווה שקניתם באלי?',
  '💄': 'מה המוצר ביוטי הכי שווה שקניתם באלי?',
};
const hookFor = (item, title) => {
  if (item.kind === 'spot' || item.kind === 'weekly') return 'לפני שמשלמים באלי אקספרס, תעצרו שנייה ⚡';
  const emo = (title.match(/\p{Extended_Pictographic}\uFE0F?$/u) || [''])[0];
  return { '🔋': 'מוצר שכל אחד צריך בתיק', '🚗': 'שדרוג קטן לרכב', '🏠': 'עוד מציאה לבית', '🎮': 'לשולחן העבודה', '🎧': 'לאוהבי סאונד' }[emo] || 'מצאנו לכם משהו שווה';
};
export function fbMessage(item) {
  const plain = toPlain(item.text).replace(/ ?👇\s*$/, '');
  const lines = plain.split('\n');
  const title = lines[0].trim();
  const body = lines.slice(1).join('\n').replace(/^[^\n]*: https?:\/\/\S+[^\n]*$/gm, '').replace(/\n{3,}/g, '\n\n').trim();
  const btn = (item.buttons || []).flat().filter((b) => b.url);
  const buy = btn.find((b) => /aliexpress/.test(b.url));
  const site = btn.find((b) => /yeshdeal\.com/.test(b.url));
  const emo = (title.match(/\p{Extended_Pictographic}\uFE0F?$/u) || [''])[0];
  const isCode = item.kind === 'spot' || item.kind === 'weekly';
  const out = [hookFor(item, title), '', title, '', body, ''];
  if (isCode) {
    if (buy) out.push(`להפעלת הקוד באלי אקספרס: ${buy.url}`);
    out.push(`כל הקודים לפי סכום העגלה + מחשבון: ${site ? fbUrl(site.url) : `${SITE}/?${FB}&utm_medium=social&utm_campaign=spot#calc`}`);
    out.push('', 'שמרו את הפוסט לקנייה הבאה 📌');
  } else {
    if (buy) out.push(`לצפייה במוצר ובמחיר העדכני: ${buy.url}`);
    out.push(`איזה קוד קופון מתאים לעגלה שלכם: ${site ? fbUrl(site.url) : `${SITE}/?${FB}&utm_medium=social&utm_campaign=product#calc`}`);
    out.push('', QUESTIONS[emo] || 'מה הייתם מוסיפים לעגלה?');
  }
  out.push('', '#עליאקספרס #דילים');
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const q = await (await fetch(`${SITE}/tg-queue/queue.json?t=${Date.now()}`)).json();
  const item = q.items.find((i) => i.date === date && i.hour === slot);
  const late = Number(get('hour')) - slot;
  if (process.env.MAX_LATE_H && (late < 0 || late > Number(process.env.MAX_LATE_H))) { console.log(`run is ${late}h off slot ${slot}:00, skipping (GitHub cron delay)`); process.exit(0); }
  if (!item) { console.log(`no planned post for ${date} ${slot}:00`); process.exit(0); }
  if (!['product', 'spot', 'weekly', 'deal'].includes(item.kind)) { console.log(`skip kind ${item.kind}`); process.exit(0); }
  const message = fbMessage(item);
  const img = item.img ? `${SITE}/tg-queue/${item.img}` : null;
  console.log(`${date} ${slot}:00 ${item.kind} img=${img}\n---\n${message}\n---`);
  if (dry) { console.log('dry run (no token or DRY=1)'); process.exit(0); }
  if (!page) { console.error('FB_PAGE_ID missing'); process.exit(1); }
  const body = new URLSearchParams({ access_token: token, ...(img ? { url: img, caption: message } : { message }) });
  const r = await fetch(`https://graph.facebook.com/v21.0/${page}/${img ? 'photos' : 'feed'}`, { method: 'POST', body });
  const j = await r.json();
  if (!r.ok || j.error) { console.error('facebook error:', j.error?.code, j.error?.type, j.error?.message); process.exit(1); }
  console.log('posted', j.post_id || j.id);
}
