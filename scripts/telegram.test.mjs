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
const reg = { siteUrl: 'https://yeshdeal.com', library: lib, minGapDays: 2 };

test('regular posts only inside a slot, once per slot', () => {
  assert.equal(planRegular({ ...reg, today: '2026-11-06', hour: 9, weekday: 4 }).message, null);
  const r1 = planRegular({ ...reg, today: '2026-11-06', hour: 12, weekday: 4 });
  assert.equal(r1.message.card.title, 'A');
  assert.match(r1.message.buttons[0][0].url, /utm_campaign=a/);
  assert.equal(planRegular({ ...reg, today: '2026-11-06', hour: 13, weekday: 4, regular: r1.regular }).message, null);
  const r2 = planRegular({ ...reg, today: '2026-11-06', hour: 20, weekday: 4, regular: r1.regular });
  assert.equal(r2.message.card.title, 'B');
  assert.equal(planRegular({ ...reg, today: '2026-11-07', hour: 12, weekday: 5, regular: r2.regular }).message, null, 'gap respected');
  assert.equal(planRegular({ ...reg, today: '2026-11-08', hour: 12, weekday: 6, regular: r2.regular }).message.card.title, 'A');
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
