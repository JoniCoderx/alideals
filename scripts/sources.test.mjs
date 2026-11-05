import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCSV, extractCodesFromText } from './sources.mjs';
import { sign } from './aliexpress-api.mjs';

test('parseCSV handles quotes, commas and CRLF', () => {
  const rows = parseCSV('code,title,discount\r\nIL07,"7$, on 49$",7\r\nIL12,plain,12\r\n');
  assert.equal(rows.length, 2);
  assert.equal(rows[0].title, '7$, on 49$');
  assert.equal(rows[1].code, 'IL12');
});

test('extractCodesFromText finds code + discount pair on same line', () => {
  const found = extractCodesFromText('New codes!\nAEIL07 - $7 off $49\nUSD20 nothing\nSAVE12 US $12/$89 working');
  assert.deepEqual(found.map((f) => [f.code, f.discount, f.minOrder]), [['AEIL07', 7, 49], ['SAVE12', 12, 89]]);
});

test('extractCodesFromText ignores lines without amounts', () => {
  assert.equal(extractCodesFromText('Try code ABC123 today').length, 0);
});

test('sign is deterministic, sorted and uppercase hex', () => {
  const a = sign({ b: '2', a: '1', sign: 'x' }, 's');
  const b = sign({ a: '1', b: '2' }, 's');
  assert.equal(a, b);
  assert.match(a, /^[0-9A-F]{64}$/);
});
