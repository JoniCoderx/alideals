import test from 'node:test';
import assert from 'node:assert/strict';
import { normDate, daysBetween, safeLink, mergeCoupons, mergeDeals, groupTiers } from './lib.mjs';

test('normDate handles ISO and Israeli day-first formats, rejects junk', () => {
  assert.equal(normDate('2026-11-30'), '2026-11-30');
  assert.equal(normDate('30/11/2026'), '2026-11-30');
  assert.equal(normDate('1.12.26'), '2026-12-01');
  assert.equal(normDate('31/02/2026'), null);
  assert.equal(normDate('soon'), null);
  assert.equal(normDate(''), null);
});

test('daysBetween: same day 0, next day 1', () => {
  assert.equal(daysBetween('2026-11-05', '2026-11-05'), 0);
  assert.equal(daysBetween('2026-11-05', '2026-11-06'), 1);
  assert.equal(daysBetween('2026-11-05', '2026-11-04'), -1);
});

test('safeLink only allows https AliExpress hosts', () => {
  assert.equal(safeLink('https://s.click.aliexpress.com/e/_abc'), 'https://s.click.aliexpress.com/e/_abc');
  assert.equal(safeLink('https://he.aliexpress.com/item/1.html'), 'https://he.aliexpress.com/item/1.html');
  assert.equal(safeLink('javascript:alert(1)', 'F'), 'F');
  assert.equal(safeLink('http://s.click.aliexpress.com/e/x', 'F'), 'F');
  assert.equal(safeLink('https://evil.com/?aliexpress.com', 'F'), 'F');
  assert.equal(safeLink('https://aliexpress.com.evil.io/', 'F'), 'F');
  assert.equal(safeLink('"></script><script>', 'F'), 'F');
});

test('mergeCoupons: sheet row overrides without wiping, and clears sample', () => {
  const manual = [{ id: 't7', code: 'IL07', discount: 7, minOrder: 49, expires: '2026-11-30', featured: true, sample: true }];
  const sheet = [{ id: 't7', code: 'REAL7', expires: '', featured: undefined, sample: false }];
  const { active } = mergeCoupons(manual, sheet, '2026-11-05');
  assert.equal(active.length, 1);
  assert.equal(active[0].code, 'REAL7');
  assert.equal(active[0].expires, '2026-11-30');
  assert.equal(active[0].featured, true);
  assert.equal(active[0].sample, false);
});

test('mergeCoupons: expiry, start date and invalid dates', () => {
  const list = [
    { id: 'a', code: 'A', discount: 2, minOrder: 15, expires: '2026-11-05' },
    { id: 'b', code: 'B', discount: 4, minOrder: 29, expires: '2026-11-04' },
    { id: 'c', code: 'C', discount: 7, minOrder: 49, starts: '2026-11-11' },
    { id: 'd', code: 'D', discount: 9, minOrder: 69, expires: '30/11/2026' },
    { id: 'e', code: 'E', discount: 9, minOrder: 69, expires: 'next week' },
  ];
  const { active, expired, invalid } = mergeCoupons(list, [], '2026-11-05');
  assert.deepEqual(active.map((c) => c.id), ['a', 'd']);
  assert.equal(active[1].expires, '2026-11-30');
  assert.deepEqual(expired.map((c) => c.id), ['b']);
  assert.equal(invalid[0].id, 'e');
});

test('mergeDeals dedupes by id', () => {
  const d = mergeDeals([{ id: 'new-user', title: 'A', text: 'x' }], [{ id: 'new-user', title: 'B', link: '' }]);
  assert.equal(d.length, 1);
  assert.equal(d[0].title, 'B');
  assert.equal(d[0].text, 'x');
});

test('groupTiers groups two series under one minOrder', () => {
  const t = groupTiers([{ code: 'A', discount: 12, minOrder: 89 }, { code: 'B', discount: 12, minOrder: 89 }, { code: 'C', discount: 7, minOrder: 49 }]);
  assert.equal(t.length, 2);
  assert.equal(t[1].items.length, 2);
});
