// לוגיקת המשחק "ארץ עיר" – בלי תלות בשרת, כדי שאפשר יהיה לבדוק אותה ולהריץ אותה גם ב-Node וגם ב-Cloudflare.

export const HEB_LETTERS = 'אבגדהוזחטיכלמנסעפצקרשת'.split('');
export const EN_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

export const LANGS = {
  he: {
    letters: HEB_LETTERS,
    defaultLetters: HEB_LETTERS,
    categories: ['ארץ', 'עיר', 'חי', 'צומח', 'דומם', 'מקצוע', 'שם', 'מפורסם/ת'],
    extras: [
      'מאכל', 'מותג', 'סרט או סדרה', 'שיר', 'זמר/ת', 'קבוצת ספורט', 'ענף ספורט', 'צבע',
      'חלק בגוף', 'כלי נגינה', 'דמות מצוירת', 'תחביב', 'משהו במטבח', 'משקה', 'נהר/ים/הר',
      'דמות מהתנ"ך', 'שם של חיית מחמד', 'תירוץ לאיחור', 'משהו שלוקחים לים', 'רכב',
    ],
  },
  en: {
    letters: EN_LETTERS,
    // Q, U, V, X, Y, Z are off by default (almost impossible in most categories); the host can turn them on.
    defaultLetters: EN_LETTERS.filter((l) => !'QUVXYZ'.includes(l)),
    categories: ['Country', 'City', 'Animal', 'Plant', 'Thing', 'Job', 'Name', 'Famous person'],
    extras: [
      'Food', 'Brand', 'Movie or TV show', 'Song', 'Singer', 'Sports team', 'Sport', 'Color',
      'Body part', 'Instrument', 'Cartoon character', 'Hobby', 'Kitchen item', 'Drink', 'River/Sea/Mountain',
      'Superhero', 'Pet name', 'Excuse for being late', 'Beach item', 'Car brand',
    ],
  },
};

// תאימות לאחור
export const DEFAULT_CATEGORIES = LANGS.he.categories;
export const EXTRA_CATEGORIES = LANGS.he.extras;

export const LIMITS = {
  maxPlayers: 16,
  maxCategories: 14,
  maxCategoryLen: 24,
  maxNameLen: 16,
  maxAnswerLen: 40,
};

import { normalize, startsWithLetter, checkAnswer } from './public/check.mjs';
export { normalize, startsWithLetter, checkAnswer };

/** כמה פסילות צריך כדי לפסול תשובה: רוב רגיל מבין שאר המשתתפים. */
export function rejectThreshold(participantCount) {
  const others = Math.max(0, participantCount - 1);
  return Math.floor(others / 2) + 1;
}

/** כמה אישורים צריך לתשובה שלא נמצאה במילון: לפחות חצי מהשחקנים האחרים (מינימום 1). */
export function approveThreshold(participantCount) {
  return Math.max(1, Math.ceil((participantCount - 1) / 2));
}

/**
 * מחשב ניקוד לסיבוב.
 * תשובה נבדקת: ריקה / לא באות / זבל (אות בודדת, רצף) = 0.
 * נמצאה במילון, או קטגוריה בלי מילון = תקפה (אפשר לפסול ברוב 👎).
 * קטגוריה עם מילון והמילה לא נמצאה (למשל שגיאת כתיב) = 0 עד שהשחקנים האחרים מאשרים 👍.
 * @param {object} p
 * @param {Record<string,string[]>} p.votes  "pid|i" -> מזהי פוסלים
 * @param {Record<string,string[]>} p.approvals  "pid|i" -> מזהי מאשרים
 */
export function scoreRound({ letter, categories, participants, answers, votes = {}, approvals = {}, soloBonus = true }) {
  const n = participants.length;
  const threshold = rejectThreshold(n);
  const approveNeed = approveThreshold(n);
  const cells = {};
  for (const pid of participants) cells[pid] = [];

  categories.forEach((cat, ci) => {
    const valid = [];
    for (const pid of participants) {
      const answer = String(answers[pid]?.[ci] ?? '').trim();
      const others = (list) => (list || []).filter((v) => v !== pid && participants.includes(v));
      const rejects = others(votes[`${pid}|${ci}`]);
      const ups = others(approvals[`${pid}|${ci}`]);
      const ch = checkAnswer(answer, letter, cat);
      const cell = { answer, status: ch.status, points: 0, rejects: rejects.length, approvals: ups.length, check: ch.check || null, suggest: ch.suggest || null };
      let ok = ch.status === 'ok';
      if (ch.status === 'unknown') {
        if (n === 1) { ok = true; cell.check = 'open'; }               // לבד: אין מי שיאשר
        else if (ups.length >= approveNeed) { ok = true; cell.check = 'approved'; }
        else cell.status = 'unverified';
      }
      if (ok) {
        if (rejects.length >= threshold) cell.status = 'rejected';
        else { cell.status = 'ok'; valid.push({ pid, norm: ch.key }); }
      }
      cells[pid][ci] = cell;
    }
    const counts = {};
    for (const v of valid) counts[v.norm] = (counts[v.norm] || 0) + 1;
    for (const v of valid) {
      const cell = cells[v.pid][ci];
      if (counts[v.norm] > 1) { cell.status = 'shared'; cell.points = 5; }
      else if (soloBonus && valid.length === 1 && n > 1) { cell.status = 'solo'; cell.points = 15; }
      else { cell.status = 'unique'; cell.points = 10; }
    }
  });

  const totals = {};
  for (const pid of participants) totals[pid] = cells[pid].reduce((s, c) => s + c.points, 0);
  return { cells, totals, threshold, approveNeed };
}

export function pickLetter(enabled, used, rnd = Math.random) {
  const pool = enabled.filter((l) => !used.includes(l));
  const from = pool.length ? pool : enabled;
  return from[Math.floor(rnd() * from.length)];
}

/** מנקה ומאמת הגדרות שמגיעות מהמארח. החלפת שפה מאפסת קטגוריות ואותיות לברירת המחדל של השפה. */
export function sanitizeSettings(input, current) {
  const s = { ...current };
  if (input.lang && LANGS[input.lang] && input.lang !== s.lang) {
    s.lang = input.lang;
    s.categories = [...LANGS[s.lang].categories];
    s.letters = [...LANGS[s.lang].defaultLetters];
  }
  const L = LANGS[s.lang] || LANGS.he;
  if (Array.isArray(input.categories)) {
    const seen = new Set();
    const cats = [];
    for (const c of input.categories) {
      const t = String(c ?? '').replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, LIMITS.maxCategoryLen);
      if (t && !seen.has(t.toLowerCase())) { seen.add(t.toLowerCase()); cats.push(t); }
      if (cats.length >= LIMITS.maxCategories) break;
    }
    if (cats.length) s.categories = cats;
  }
  if (input.roundSeconds != null) s.roundSeconds = clampInt(input.roundSeconds, 30, 600, s.roundSeconds);
  if (input.rounds != null) s.rounds = clampInt(input.rounds, 1, 26, s.rounds);
  if (input.stopGrace != null) s.stopGrace = clampInt(input.stopGrace, 0, 30, s.stopGrace);
  if (input.soloBonus != null) s.soloBonus = !!input.soloBonus;
  if (input.stopEnabled != null) s.stopEnabled = !!input.stopEnabled;
  if (Array.isArray(input.letters)) {
    const ls = L.letters.filter((l) => input.letters.includes(l));
    if (ls.length >= 1) s.letters = ls;
  }
  return s;
}

function clampInt(v, min, max, fallback) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function defaultSettings(lang = 'he') {
  const L = LANGS[lang] || LANGS.he;
  return {
    lang: LANGS[lang] ? lang : 'he',
    categories: [...L.categories],
    roundSeconds: 120,
    rounds: 5,
    stopEnabled: true,
    stopGrace: 10,
    soloBonus: true,
    letters: [...L.defaultLetters],
  };
}
