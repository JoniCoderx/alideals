import test from 'node:test';
import assert from 'node:assert/strict';
import { planPosts } from './telegram.mjs';

const base = { siteUrl: 'https://yeshdeal.com', siteName: 'יש דיל!' };
const codes = [
  { id: 'a', code: 'ILAFF08', discount: 8, minOrder: 45, expires: '2026-11-18' },
  { id: 'b', code: 'ILAFF20', discount: 20, minOrder: 119, expires: '2026-11-18' },
  { id: 's', code: 'X', discount: 1, minOrder: 1, sample: true },
];

test('posts new real codes once, ignores samples', () => {
  const r1 = planPosts({ ...base, coupons: codes, today: '2026-11-05' });
  assert.equal(r1.messages.length, 1);
  assert.match(r1.messages[0].text, /ILAFF08/);
  assert.doesNotMatch(r1.messages[0].text, /<code>X<\/code>/);
  assert.match(r1.messages[0].buttons[0][0].url, /\/go\/b\/\?utm_source=telegram/);
  assert.equal(r1.messages[0].buttons[1][0].url, 'https://yeshdeal.com/?utm_source=telegram&utm_medium=social#calc');
  const r2 = planPosts({ ...base, coupons: codes, posted: r1.posted, today: '2026-11-06' });
  assert.equal(r2.messages.length, 0);
});

test('reminds once the day before expiry', () => {
  const { posted } = planPosts({ ...base, coupons: codes, today: '2026-11-05' });
  const r = planPosts({ ...base, coupons: codes, posted, today: '2026-11-17' });
  assert.equal(r.messages.length, 1);
  assert.equal(r.messages[0].kind, 'ending');
  const again = planPosts({ ...base, coupons: codes, posted: r.posted, today: '2026-11-17' });
  assert.equal(again.messages.length, 0);
});

test('escapes HTML in codes', () => {
  const r = planPosts({ ...base, coupons: [{ id: 'x', code: 'A<b>', discount: 2, minOrder: 10 }], today: '2026-11-05' });
  assert.match(r.messages[0].text, /A&lt;b&gt;/);
});

test('posts "sale started" once on the start day when codes were already announced', () => {
  const evCodes = codes.map((c) => ({ ...c, event: '11-11' }));
  const events = [{ slug: '11-11', name: '11.11 – יום הרווקים', start: '2026-11-11', end: '2026-11-18' }];
  const { posted } = planPosts({ ...base, coupons: evCodes, events, today: '2026-11-05' });
  const r = planPosts({ ...base, coupons: evCodes, events, posted, today: '2026-11-11' });
  assert.deepEqual(r.messages.map((m) => m.kind), ['event']);
  assert.match(r.messages[0].text, /התחיל/);
  assert.equal(planPosts({ ...base, coupons: evCodes, events, posted: r.posted, today: '2026-11-11' }).messages.length, 0);
});

test('repost re-sends current codes even if already posted', () => {
  const { posted } = planPosts({ ...base, coupons: codes, today: '2026-11-05' });
  assert.equal(planPosts({ ...base, coupons: codes, posted, today: '2026-11-05', repost: true }).messages.length, 1);
});

import { planRegular } from './telegram.mjs';

const lib = [
  { id: 'a', type: 'tip', emoji: '💡', title: 'A', points: [], text: 't', buttons: [['x', '/']] },
  { id: 'b', type: 'deal', emoji: '🎁', title: 'B', points: [], text: 't', buttons: [['y', '/go/coins/']] },
];
const reg = { siteUrl: 'https://yeshdeal.com', library: lib, announcements: [], cats: [], minGapDays: 2 };

test('regular posts only inside a slot, once per slot', () => {
  assert.equal(planRegular({ ...reg, today: '2026-11-06', hour: 7, weekday: 4 }).message, null);
  const r1 = planRegular({ ...reg, today: '2026-11-06', hour: 10, weekday: 4 });
  assert.equal(r1.message.card.title, 'A');
  assert.match(r1.message.buttons[0][0].url, /utm_campaign=a/);
  assert.equal(planRegular({ ...reg, today: '2026-11-06', hour: 11, weekday: 4, regular: r1.regular }).message, null);
  const r2 = planRegular({ ...reg, today: '2026-11-06', hour: 14, weekday: 4, regular: r1.regular });
  assert.equal(r2.message.card.title, 'B');
  assert.equal(planRegular({ ...reg, today: '2026-11-07', hour: 10, weekday: 5, regular: r2.regular }).message, null, 'gap respected');
  assert.equal(planRegular({ ...reg, today: '2026-11-08', hour: 10, weekday: 6, regular: r2.regular }).message.card.title, 'A');
});

test('seven slots a day: code in the morning, category at noon/night, each slot once', () => {
  const cats = [{ slug: 'shoes', name: 'נעליים', short: 'נעליים', emoji: '👟', tips: [['טיפ', 'פירוט. עוד']] }];
  const big = Array.from({ length: 10 }, (_, i) => ({ id: 'p' + i, type: 'tip', emoji: '💡', title: 'T' + i, points: [], text: 't', buttons: [['x', '/']] }));
  let regular = {}; const kinds = [];
  for (const hour of [7, 8, 9, 10, 12, 13, 14, 15, 16, 17, 19, 21, 22, 23]) {
    const r = planRegular({ ...reg, library: big, cats, coupons: codes, today: '2026-11-04', hour, weekday: 3, regular });
    regular = r.regular; if (r.message) kinds.push(r.message.kind);
  }
  assert.equal(kinds.length, 7);
  assert.equal(kinds[0], 'spot');
  assert.equal(kinds[2], 'category');
  assert.equal(kinds[4], 'spot');
});

test('code spotlight shows one code with its cart range and next tier', () => {
  const r = planRegular({ ...reg, coupons: codes, today: '2026-11-04', hour: 8, weekday: 3 });
  assert.equal(r.message.kind, 'spot');
  assert.match(r.message.text, /<code>/);
  assert.match(r.message.buttons[0][0].url, /\/go\//);
});

test('countdown wins the evening slot 3 days and 1 day before a sale', () => {
  const events = [{ slug: 'black-friday', name: 'בלאק פריידי', start: '2026-11-24' }];
  const r = planRegular({ ...reg, today: '2026-11-21', hour: 20, weekday: 6, events });
  assert.equal(r.message.kind, 'countdown');
  assert.equal(r.message.card.bigNumber, 3);
  assert.equal(planRegular({ ...reg, today: '2026-11-22', hour: 20, weekday: 0, events, regular: r.regular }).message.kind, 'tip');
});

test('weekly best code on Friday noon', () => {
  const r = planRegular({ ...reg, today: '2026-11-06', hour: 12, weekday: 5, coupons: codes });
  assert.equal(r.message.kind, 'weekly');
  assert.match(r.message.text, /ILAFF20/);
});

test('one-time announcement goes first, exactly once', () => {
  const ann = [{ id: 'ann1', type: 'feature', emoji: '🔜', title: 'Soon', points: [], text: 't', buttons: [['x', '/finder/']] }];
  const r1 = planRegular({ ...reg, announcements: ann, today: '2026-11-06', hour: 12, weekday: 4 });
  assert.equal(r1.message.card.title, 'Soon');
  const r2 = planRegular({ ...reg, announcements: ann, today: '2026-11-06', hour: 20, weekday: 4, regular: r1.regular });
  assert.equal(r2.message.card.title, 'A');
  const r3 = planRegular({ ...reg, announcements: ann, today: '2026-11-30', hour: 12, weekday: 1, regular: r2.regular });
  assert.notEqual(r3.message?.card.title, 'Soon');
});

import { withAffiliate } from './telegram.mjs';

test('every post carries the affiliate link (direct, not via /go/)', () => {
  const affLink = 'https://s.click.aliexpress.com/e/_abc';
  const siteUrl = 'https://yeshdeal.com';
  const tip = withAffiliate({ text: 'טיפ', buttons: [[{ text: 'מדריך', url: `${siteUrl}/guides/x/?utm_source=telegram` }]] }, { siteUrl, affLink });
  assert.equal(tip.buttons.length, 2);
  assert.equal(tip.buttons[1][0].url, affLink);
  assert.ok(tip.text.endsWith(`<a href="${affLink}">כניסה לעליאקספרס</a>`));
  const code = withAffiliate({ text: 'קוד', buttons: [[{ text: 'לעלי', url: `${siteUrl}/go/c1/?utm_source=telegram` }]] }, { siteUrl, affLink });
  assert.equal(code.buttons.length, 1);
  assert.equal(code.buttons[0][0].url, affLink);
  const long = withAffiliate({ text: 'x'.repeat(995), buttons: [] }, { siteUrl, affLink });
  assert.equal(long.text.length, 995);
  assert.equal(long.buttons[0][0].url, affLink);
});

import { collectReports } from './telegram.mjs';

test('code reports: one per user per day, only active codes, replies for each', () => {
  const up = (id, uid, text) => ({ update_id: id, message: { text, chat: { id: uid }, from: { id: uid } } });
  const { reports, replies } = collectReports([
    up(1, 7, '/start r_ilaff08'), up(2, 7, '/start r_ILAFF08'), up(3, 8, '/start r_ILAFF08'),
    up(4, 9, '/start r_OLDCODE'), up(5, 9, '/start'), up(6, 9, 'hello'),
  ], { codes: ['ILAFF08', 'ILAFF20'], today: '2026-11-07' });
  assert.equal(reports.ILAFF08.length, 2);
  assert.equal(reports.OLDCODE, undefined);
  assert.deepEqual(replies.map((r) => r.kind), ['thanks', 'thanks', 'thanks', 'unknown', 'hello']);
});
