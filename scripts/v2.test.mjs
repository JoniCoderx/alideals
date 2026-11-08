import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAmount, toUSD, pickCoupon, classifyMatch, finalCost, parseProductInput, attributes } from '../src/v2/logic.mjs';

const tiers = [
  { id: 'a', d: 2, m: 15, code: 'ILAFF02' }, { id: 'b', d: 5, m: 29, code: 'ILAFF05' },
  { id: 'c', d: 8, m: 45, code: 'ILAFF08' }, { id: 'd', d: 12, m: 65, code: 'ILAFF12' },
  { id: 'e', d: 160, m: 800, code: 'SUPERIL2' },
];

test('parseAmount edge cases', () => {
  assert.deepEqual(parseAmount('60'), { ok: true, value: 60 });
  assert.deepEqual(parseAmount('45,50'), { ok: true, value: 45.5 });
  assert.deepEqual(parseAmount('1,234.50'), { ok: true, value: 1234.5 });
  assert.deepEqual(parseAmount('₪ 220'), { ok: true, value: 220 });
  assert.deepEqual(parseAmount('$45'), { ok: true, value: 45 });
  assert.equal(parseAmount('-50').reason, 'negative');
  assert.equal(parseAmount('0').reason, 'zero');
  assert.equal(parseAmount('').reason, 'empty');
  assert.equal(parseAmount('abc').reason, 'invalid');
  assert.equal(parseAmount('1e5').reason, 'invalid');
  assert.equal(parseAmount('1.2.3').reason, 'invalid');
  assert.equal(parseAmount('9999999').reason, 'too_large');
});

test('ILS conversion never falls a fraction below a tier', () => {
  const rate = 3.1937;
  assert.equal(toUSD(45 * rate, 'ILS', rate), 45);
  assert.equal(pickCoupon(toUSD(45 * rate, 'ILS', rate), tiers).best.code, 'ILAFF08');
});

test('pickCoupon: inclusive thresholds, boundaries, huge carts, below minimum', () => {
  assert.equal(pickCoupon(44.99, tiers).best.code, 'ILAFF05');
  assert.equal(pickCoupon(45, tiers).best.code, 'ILAFF08');
  assert.equal(pickCoupon(1e6, tiers).best.code, 'SUPERIL2');
  const low = pickCoupon(10, tiers);
  assert.equal(low.best, null);
  assert.equal(low.next.code, 'ILAFF02');
  assert.equal(low.upsell, true);
  const near = pickCoupon(40, tiers);
  assert.equal(near.next.code, 'ILAFF08');
  assert.equal(near.gap, 5);
});

test('matching: exact needs a shared model and no conflicts; capacity/plug conflicts downgrade', () => {
  const base = { title: 'Baseus 20000mAh Power Bank PD 65W BS-P20 Fast Charging' };
  assert.equal(classifyMatch(base, { title: 'Baseus BS-P20 20000mAh Power Bank 65W PD Fast Charge' }).level, 'exact');
  assert.equal(classifyMatch(base, { title: 'Baseus 10000mAh Power Bank PD 65W BS-P20 Fast Charging' }).level, 'similar');
  assert.equal(classifyMatch(base, { title: 'Baseus 20000mAh Power Bank PD 65W Fast Charging portable' }).level, 'likely');
  assert.equal(classifyMatch(base, { title: 'Phone holder for car dashboard' }).level, 'similar');
  assert.equal(classifyMatch({ title: 'Mini Air Fryer EU Plug 2L' }, { title: 'Mini Air Fryer US Plug 2L' }).level, 'similar');
});

test('attributes are conservative', () => {
  assert.deepEqual(attributes('USB C Cable 2m').capacity, undefined);
  assert.deepEqual(attributes('Power Bank 10000 mAh').capacity, ['10000mah']);
});

test('finalCost: coupon on goods value, unknown shipping stays unknown, no taxes invented', () => {
  const r = finalCost({ price: 50, shipping: 2.5 }, tiers);
  assert.equal(r.coupon, 8);
  assert.equal(r.total, 44.5);
  assert.equal(r.taxIncluded, false);
  const u = finalCost({ price: 50 }, tiers);
  assert.equal(u.shippingKnown, false);
});

test('URL input: only AliExpress hosts, ids extracted, short links flagged', () => {
  assert.equal(parseProductInput('look https://he.aliexpress.com/item/1005006123456789.html?spm=x').id, '1005006123456789');
  assert.equal(parseProductInput('https://a.aliexpress.com/_mKq1abc').short, true);
  assert.equal(parseProductInput('https://evil.com/item/1005006123456789.html').reason, 'not_aliexpress');
  assert.equal(parseProductInput('https://aliexpress.com.evil.com/item/1.html').reason, 'not_aliexpress');
  assert.equal(parseProductInput('javascript:alert(1)').reason, 'no_url');
  assert.equal(parseProductInput('http://169.254.169.254/latest').reason, 'not_aliexpress');
});

// Precision on hand-labelled real pairs: "exact"/"likely" must never be shown for a different product.
test('matching: no false positives on labelled real pairs', async () => {
  const { pairs } = JSON.parse(await (await import('node:fs/promises')).readFile(new URL('../data/v2/match-pairs.json', import.meta.url), 'utf8'));
  let tp = 0, fp = 0, fn = 0;
  const fps = [];
  for (const [a, b, same] of pairs) {
    const { level } = classifyMatch({ title: a }, { title: b });
    const pos = level === 'exact' || level === 'likely';
    if (pos && same) tp++; else if (pos && !same) { fp++; fps.push(b); } else if (!pos && same) fn++;
    if (level === 'exact') assert.ok(same, `exact on different product: ${b}`);
  }
  console.log(`# matching precision ${tp}/${tp + fp}, recall ${tp}/${tp + fn}, false positives ${fp}`);
  assert.deepEqual(fps, []);
});
