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
