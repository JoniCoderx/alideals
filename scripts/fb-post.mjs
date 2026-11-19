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

import { toPlain, fbMessage } from '../src/fb-copy.mjs';
export { toPlain, fbMessage };

if (import.meta.url === `file://${process.argv[1]}` && process.env.STATS === '1') {
  // Engagement of the latest Page posts (no secrets printed).
  const G = 'https://graph.facebook.com/v21.0';
  const tries = [
    `${page}?fields=name,followers_count,fan_count`,
    `${page}/photos?type=uploaded&limit=15&fields=created_time,name,link`,
    `${page}/published_posts?limit=15&fields=created_time,message`,
    `${page}/posts?limit=15&fields=created_time,message,shares,reactions.summary(true).limit(0),comments.summary(true).limit(0)`,
  ];
  for (const t of tries) {
    const j = await (await fetch(`${G}/${t}&access_token=${token}`)).json();
    console.log('==', t.split('?')[0].replace(page, 'PAGE'), j.error ? `error ${j.error.code}: ${j.error.message}` : '');
    if (!j.error) for (const p of j.data || [j]) console.log(JSON.stringify({ t: p.created_time, n: (p.name || p.message || '').split('\n')[0].slice(0, 50), f: p.followers_count, fan: p.fan_count, r: p.reactions?.summary?.total_count, c: p.comments?.summary?.total_count, s: p.shares?.count }));
  }
  process.exit(0);
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const q = await (await fetch(`${SITE}/tg-queue/queue.json?t=${Date.now()}`)).json();
  const item = q.items.find((i) => i.date === date && i.hour === slot);
  const late = Number(get('hour')) - slot;
  if (process.env.MAX_LATE_H && (late < 0 || late > Number(process.env.MAX_LATE_H))) { console.log(`run is ${late}h off slot ${slot}:00, skipping (GitHub cron delay)`); process.exit(0); }
  if (!item) { console.log(`no planned post for ${date} ${slot}:00`); process.exit(0); }
  if (!['product', 'spot', 'weekly', 'deal', 'category', 'tip', 'feature'].includes(item.kind)) { console.log(`skip kind ${item.kind}`); process.exit(0); }
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
