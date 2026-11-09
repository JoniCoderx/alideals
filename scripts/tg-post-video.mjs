// Post a video to the Telegram channel with a caption + buttons, then pin it (manual workflow tg-video.yml).
import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';

const token = process.env.TELEGRAM_BOT_TOKEN;
const chat = process.env.TELEGRAM_CHANNEL || '@yeshdeall';
const file = process.env.FILE || 'media/yeshdeal-reel.mp4';
const pin = process.env.PIN !== 'false';
if (!token) { console.error('no bot token'); process.exit(1); }

const caption = `<b>מדריך של 20 שניות: איך לא לשלם יותר מדי באלי אקספרס</b> 🎬

1. מחשבון הקופונים מראה איזה קוד הכי משתלם לסכום העגלה שלכם
2. העתקה בלחיצה אחת ומעבר ישר לאלי אקספרס
3. צייד הדילים: מדביקים קישור למוצר ובודקים אם יש אותו דבר בזול יותר אצל מוכר אחר 🎯

והכי נוח: שולחים קישור למוצר ישר לבוט שלנו, ומקבלים תשובה בטלגרם 🤖

בלאק פריידיי ב־27.11. זה הזמן להכין רשימה ולבדוק מחירים 🔥`;
const keyboard = { inline_keyboard: [
  [{ text: 'לאתר ולקודים 🔥', url: 'https://yeshdeal.com/?utm_source=telegram&utm_medium=channel&utm_campaign=video-guide' }],
  [{ text: 'צייד הדילים בבוט 🎯', url: 'https://t.me/yeshdeall_bot' }],
] };

const api = (m) => `https://api.telegram.org/bot${token}/${m}`;
const pinMsg = async (id) => {
  const p = await (await fetch(api('pinChatMessage'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chat, message_id: Number(id), disable_notification: true }) })).json();
  console.log(`pin ${id}:`, p.ok ? 'ok' : `${p.error_code} ${p.description}`);
  return p.ok;
};
// Pin-only mode: PIN_ID=<message id> pins an existing post and exits.
if (process.env.PIN_ID) process.exit((await pinMsg(process.env.PIN_ID)) ? 0 : 1);
const buf = await readFile(file);
console.log(`video ${file}: ${(buf.length / 1e6).toFixed(1)} MB`);
const fd = new FormData();
fd.set('chat_id', chat);
fd.set('video', new Blob([buf], { type: 'video/mp4' }), basename(file));
fd.set('caption', caption);
fd.set('parse_mode', 'HTML');
fd.set('supports_streaming', 'true');
fd.set('width', '1080');
fd.set('height', '1920');
fd.set('reply_markup', JSON.stringify(keyboard));
const r = await (await fetch(api('sendVideo'), { method: 'POST', body: fd })).json();
if (!r.ok) { console.error('sendVideo failed:', r.error_code, r.description); process.exit(1); }
console.log('posted message', r.result.message_id);
if (pin) await pinMsg(r.result.message_id);
