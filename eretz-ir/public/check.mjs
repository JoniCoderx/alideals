// בדיקת תשובות: אות ראשונה, זבל (אות בודדת / רצף אותיות), מילון לפי קטגוריה, והצעה לתיקון שגיאת כתיב.
// אותו קובץ רץ בשרת (ניקוד) ובדפדפן (משוב בזמן הקלדה), כך שמה שהשחקן רואה זה מה שנספר.

import { DICT } from './dict-data.mjs';

const FINALS = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' };

/** נרמול להשוואה: בלי ניקוד/דיאקריטים/פיסוק, סופיות כרגילות, אותיות קטנות, רווחים מצומצמים. */
export function normalize(s) {
  return String(s ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .normalize('NFC')
    .replace(/[֑-ׇ]/g, '')
    .replace(/[״׳"'`’.,\-–—_!?()[\]{}:;/\\]/g, ' ')
    .replace(/[ךםןףץ]/g, (c) => FINALS[c])
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** מפתח קומפקטי למילון: בלי רווחים, וו/יי כפולים כיחידים (כתיב מלא/חסר). */
export function compactKey(s) {
  return normalize(s).replace(/\s+/g, '').replace(/וו/g, 'ו').replace(/יי/g, 'י');
}

export function startsWithLetter(answer, letter) {
  const n = normalize(answer);
  return n.length > 0 && n[0] === normalize(letter)[0];
}

// שמות קטגוריות (מנורמלים) -> מזהה מילון
const LABELS = {
  country: ['ארץ', 'מדינה', 'ארצות', 'country', 'countries'],
  city: ['עיר', 'ערים', 'יישוב', 'city', 'cities', 'town'],
  animal: ['חי', 'חיה', 'בעל חיים', 'בעלי חיים', 'animal', 'animals'],
  plant: ['צומח', 'צמח', 'פרי או ירק', 'plant', 'plants', 'fruit or vegetable'],
  object: ['דומם', 'חפץ', 'thing', 'things', 'object', 'objects'],
  job: ['מקצוע', 'מקצועות', 'job', 'jobs', 'profession', 'occupation'],
  name: ['שם', 'שם פרטי', 'שם של ילד', 'שם של ילדה', 'שם של ילד ה', 'שם ילד', 'שם ילדה', 'שם ילד ה', 'name', 'names', 'first name', 'boy name', 'girl name'],
  food: ['מאכל', 'אוכל', 'food', 'dish'],
  color: ['צבע', 'צבעים', 'color', 'colour', 'colors'],
  body: ['חלק בגוף', 'איבר', 'איבר בגוף', 'body part', 'body parts'],
  instrument: ['כלי נגינה', 'instrument', 'musical instrument'],
  sport: ['ענף ספורט', 'ספורט', 'sport', 'sports'],
  drink: ['משקה', 'שתייה', 'drink', 'beverage', 'drinks'],
};
const LABEL_TO_ID = new Map();
for (const [id, labels] of Object.entries(LABELS)) for (const l of labels) LABEL_TO_ID.set(normalize(l), id);

export function categoryId(label) {
  return LABEL_TO_ID.get(normalize(label)) || null;
}

let INDEX = null;
function index() {
  if (INDEX) return INDEX;
  INDEX = {};
  for (const [cat, text] of Object.entries(DICT)) {
    const keys = new Map();   // key -> canonical
    const byFirst = new Map(); // first char -> keys[]
    for (const entry of text.split(/[,\n]/)) {
      const forms = entry.split('=').map((f) => f.trim()).filter(Boolean);
      if (!forms.length) continue;
      const canon = forms[0];
      for (const f of forms) {
        const k = compactKey(f);
        if (!k || keys.has(k)) continue;
        keys.set(k, canon);
        if (!byFirst.has(k[0])) byFirst.set(k[0], []);
        byFirst.get(k[0]).push(k);
      }
    }
    INDEX[cat] = { keys, byFirst };
  }
  return INDEX;
}

function lookup(idx, k) {
  if (idx.keys.has(k)) return idx.keys.get(k);
  // רבים: ענבים->ענב, apples->apple
  for (const suf of ['ים', 'ות', 'es', 's']) {
    if (k.length > suf.length + 1 && k.endsWith(suf) && idx.keys.has(k.slice(0, -suf.length))) return idx.keys.get(k.slice(0, -suf.length));
  }
  return null;
}

function lev(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (cur[j] < best) best = cur[j];
    }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

function suggest(idx, k) {
  const max = k.length >= 7 ? 2 : k.length >= 4 ? 1 : 0;
  if (!max) return null;
  let best = null, bestD = max + 1;
  for (const cand of idx.byFirst.get(k[0]) || []) {
    const d = lev(k, cand, max);
    if (d < bestD) { bestD = d; best = cand; if (d === 1 && max === 1) break; }
  }
  return best && bestD <= max ? idx.keys.get(best) : null;
}

function isJunk(k) {
  const letters = k.replace(/[^\p{L}]/gu, '');
  if (letters.length < 2) return true;          // אות אחת / מספרים
  if (/^(.)\1+$/u.test(letters)) return true;    // בבבב
  if (/^(..)\1+$/u.test(letters) && letters.length >= 4) return true; // אבאבאב
  return false;
}

/**
 * בודק תשובה אחת.
 * status: 'empty' | 'letter' (אות שגויה) | 'junk' | 'ok' | 'unknown' (קטגוריה עם מילון, המילה לא נמצאה)
 * check: 'dict' (נמצא במילון) | 'open' (אין מילון לקטגוריה) | 'unknown'
 */
export function checkAnswer(answer, letter, categoryLabel) {
  const raw = String(answer ?? '').trim();
  if (!raw) return { status: 'empty' };
  if (letter && !startsWithLetter(raw, letter)) return { status: 'letter' };
  const k = compactKey(raw);
  const cat = categoryId(categoryLabel);
  const idx = cat ? index()[cat] : null;
  if (idx) {
    const hit = lookup(idx, k);
    if (hit) return { status: 'ok', check: 'dict', canon: hit, key: compactKey(hit) };
  }
  if (isJunk(k)) return { status: 'junk' };
  if (!idx) return { status: 'ok', check: 'open', key: k };
  // בקטגוריה עם מילון: מילה של 2 אותיות שלא במילון היא כנראה ניחוש
  if (k.replace(/[^\p{L}]/gu, '').length <= 2) return { status: 'junk' };
  return { status: 'unknown', check: 'unknown', key: k, suggest: suggest(idx, k) };
}

export function hasDictionary(categoryLabel) {
  return !!categoryId(categoryLabel);
}
