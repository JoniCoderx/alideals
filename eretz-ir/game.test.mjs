import test from 'node:test';
import assert from 'node:assert/strict';
import { normalize, startsWithLetter, scoreRound, rejectThreshold, sanitizeSettings, defaultSettings, pickLetter } from './game.mjs';

test('normalize: ניקוד, סופיות, פיסוק ורווחים', () => {
  assert.equal(normalize('  שָׁלוֹם  '), 'שלומ');
  assert.equal(normalize('תל-אביב'), normalize('תל  אביב'));
  assert.equal(normalize('צה"ל'), normalize('צה ל'));
});

test('startsWithLetter', () => {
  assert.ok(startsWithLetter('ברזיל', 'ב'));
  assert.ok(!startsWithLetter('אנגליה', 'ב'));
  assert.ok(!startsWithLetter('   ', 'ב'));
  assert.ok(startsWithLetter('"בננה"', 'ב'));
});

test('rejectThreshold: רוב מבין האחרים', () => {
  assert.equal(rejectThreshold(2), 1);
  assert.equal(rejectThreshold(3), 2);
  assert.equal(rejectThreshold(4), 2);
  assert.equal(rejectThreshold(5), 3);
});

test('scoreRound: ייחודי 10, כפול 5, יחיד 15, ריק/אות שגויה 0, פסילה', () => {
  const r = scoreRound({
    letter: 'ב',
    categories: ['ארץ', 'עיר', 'חי'],
    participants: ['a', 'b', 'c'],
    answers: {
      a: ['ברזיל', 'באר שבע', 'ברווז'],
      b: ['בְּרָזִיל', 'בת ים', ''],
      c: ['בלגיה', 'אילת', ''],
    },
    votes: {},
  });
  assert.deepEqual(r.cells.a.map((c) => c.points), [5, 10, 15]);
  assert.deepEqual(r.cells.b.map((c) => c.points), [5, 10, 0]);
  assert.deepEqual(r.cells.c.map((c) => c.points), [10, 0, 0]);
  assert.equal(r.cells.c[1].status, 'letter');
  assert.deepEqual(r.totals, { a: 30, b: 15, c: 10 });

  const r2 = scoreRound({
    letter: 'ב', categories: ['ארץ'], participants: ['a', 'b', 'c'],
    answers: { a: ['בבבב'], b: ['בלגיה'], c: [''] },
    votes: { 'a|0': ['b', 'c'], 'b|0': ['b', 'a'] }, // הצבעה עצמית לא נספרת
  });
  assert.equal(r2.cells.a[0].status, 'rejected');
  assert.equal(r2.cells.b[0].status, 'solo'); // פסילת a משאירה את b יחיד
  assert.equal(r2.cells.b[0].rejects, 1);
});

test('scoreRound: שחקן יחיד לא מקבל בונוס 15', () => {
  const r = scoreRound({ letter: 'א', categories: ['ארץ'], participants: ['a'], answers: { a: ['איטליה'] } });
  assert.equal(r.cells.a[0].points, 10);
});

test('sanitizeSettings מגביל ומנקה', () => {
  const s = sanitizeSettings({ categories: [' ארץ ', 'ארץ', '', 'עיר'], roundSeconds: 5, rounds: 99, letters: ['א', 'Z'] }, defaultSettings());
  assert.deepEqual(s.categories, ['ארץ', 'עיר']);
  assert.equal(s.roundSeconds, 30);
  assert.equal(s.rounds, 26);
  assert.deepEqual(s.letters, ['א']);
});

test('pickLetter לא חוזר על אות עד שנגמרות', () => {
  const used = [];
  for (let i = 0; i < 3; i++) used.push(pickLetter(['א', 'ב', 'ג'], used));
  assert.deepEqual([...used].sort(), ['א', 'ב', 'ג']);
});

test('English: case-insensitive letter check and matching', () => {
  assert.ok(startsWithLetter('brazil', 'B'));
  assert.ok(startsWithLetter('Éclair', 'E'));
  const r = scoreRound({
    letter: 'B', categories: ['Country'], participants: ['a', 'b'],
    answers: { a: ['Brazil'], b: [' brazil '] },
  });
  assert.equal(r.cells.a[0].status, 'shared');
});

test('switching game language resets categories and letters', () => {
  const s = sanitizeSettings({ lang: 'en' }, defaultSettings('he'));
  assert.equal(s.lang, 'en');
  assert.equal(s.categories[0], 'Country');
  assert.ok(!s.letters.includes('Q') && s.letters.includes('A'));
  const s2 = sanitizeSettings({ letters: ['Q', 'א'] }, s);
  assert.deepEqual(s2.letters, ['Q']);
});
