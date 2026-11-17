// Facebook post copy built from a planned Telegram queue item (used by the Worker cron and scripts/fb-post.mjs).
const SITE = 'https://yeshdeal.com';
export const FB_HOURS = [10, 12, 14, 19, 21];
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

