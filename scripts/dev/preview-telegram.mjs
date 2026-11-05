// Renders every Telegram post type to PNG + prints its caption, for design review.
// Usage: node scripts/dev/preview-telegram.mjs <outDir>
import fs from 'node:fs/promises';
import path from 'node:path';
import { planRegular } from '../telegram.mjs';
import { renderCard } from '../telegram-card.mjs';
import { telegramPosts } from '../../src/content/telegram-posts.mjs';

const out = process.argv[2] || 'tg-preview';
await fs.mkdir(out, { recursive: true });
const coupons = JSON.parse(await fs.readFile('data/coupons.json', 'utf8')).coupons;
const siteUrl = 'https://yeshdeal.com';
const msgs = [];
let regular = {};
for (let i = 0; i < telegramPosts.length; i++) {
  const r = planRegular({ today: `2026-12-${String(i + 1).padStart(2, '0')}`, hour: 12, weekday: 1, regular, siteUrl });
  regular = r.regular; msgs.push(r.message);
}
msgs.push(planRegular({ today: '2026-11-21', hour: 20, weekday: 6, events: [{ slug: 'black-friday', name: 'בלאק פריידי', start: '2026-11-24' }], siteUrl }).message);
msgs.push(planRegular({ today: '2026-11-06', hour: 12, weekday: 5, coupons, siteUrl }).message);
for (const m of msgs) {
  const name = `${m.kind}-${(m.buttons[0][0].url.match(/utm_campaign=([^&#]+)/) || [])[1]}`;
  const png = await renderCard(m.card);
  if (png) await fs.writeFile(path.join(out, `${name}.png`), png);
  console.log(`--- ${name} (${m.text.length} chars)\n${m.text}\n${m.buttons.map((b) => `[${b[0].text}]`).join(' ')}\n`);
}
