// לוגיקת המשחק "ארץ עיר" – בלי תלות ב-HTTP, כדי שאפשר יהיה לבדוק אותה.

export const HEB_LETTERS = 'אבגדהוזחטיכלמנסעפצקרשת'.split('');

export const DEFAULT_CATEGORIES = ['ארץ', 'עיר', 'חי', 'צומח', 'דומם', 'מקצוע', 'שם', 'מפורסם/ת'];

export const EXTRA_CATEGORIES = [
  'מאכל', 'מותג', 'סרט או סדרה', 'שיר', 'זמר/ת', 'קבוצת ספורט', 'ענף ספורט', 'צבע',
  'חלק בגוף', 'כלי נגינה', 'דמות מצוירת', 'תחביב', 'משהו במטבח', 'משקה', 'נהר/ים/הר',
  'דמות מהתנ"ך', 'שם של חיית מחמד', 'תירוץ לאיחור', 'משהו שלוקחים לים', 'רכב',
];

export const LIMITS = {
  maxPlayers: 16,
  maxCategories: 14,
  maxCategoryLen: 24,
  maxNameLen: 16,
  maxAnswerLen: 40,
};

const FINALS = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' };

/** מנרמל תשובה להשוואה: בלי ניקוד, בלי פיסוק, אותיות סופיות כרגילות, רווחים מצומצמים. */
export function normalize(s) {
  return String(s ?? '')
    .normalize('NFC')
    .replace(/[֑-ׇ]/g, '') // ניקוד וטעמים
    .replace(/[״׳"'`.,\-–—_!?()[\]{}:;/\\]/g, ' ')
    .replace(/[ךםןףץ]/g, (c) => FINALS[c])
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** האם התשובה מתחילה באות הנכונה. */
export function startsWithLetter(answer, letter) {
  const n = normalize(answer);
  return n.length > 0 && n[0] === (FINALS[letter] || letter);
}

/** כמה פסילות צריך כדי לפסול תשובה: רוב רגיל מבין שאר המשתתפים. */
export function rejectThreshold(participantCount) {
  const others = Math.max(0, participantCount - 1);
  return Math.floor(others / 2) + 1;
}

/**
 * מחשב ניקוד לסיבוב.
 * @param {object} p
 * @param {string} p.letter
 * @param {string[]} p.categories
 * @param {string[]} p.participants  מזהי שחקנים שהשתתפו
 * @param {Record<string,string[]>} p.answers  pid -> תשובות לפי אינדקס קטגוריה
 * @param {Record<string,string[]>} p.votes  "pid|i" -> מזהי פוסלים
 * @param {boolean} p.soloBonus  15 נקודות למי שהיחיד שענה בקטגוריה
 */
export function scoreRound({ letter, categories, participants, answers, votes = {}, soloBonus = true }) {
  const threshold = rejectThreshold(participants.length);
  const cells = {}; // pid -> [{answer, status, points, rejects}]
  for (const pid of participants) cells[pid] = [];

  categories.forEach((_, ci) => {
    const valid = []; // {pid, norm}
    for (const pid of participants) {
      const answer = String(answers[pid]?.[ci] ?? '').trim();
      const rejects = (votes[`${pid}|${ci}`] || []).filter((v) => v !== pid && participants.includes(v));
      const cell = { answer, status: 'empty', points: 0, rejects: rejects.length };
      if (!answer) cell.status = 'empty';
      else if (!startsWithLetter(answer, letter)) cell.status = 'letter';
      else if (rejects.length >= threshold) cell.status = 'rejected';
      else {
        cell.status = 'ok';
        valid.push({ pid, norm: normalize(answer) });
      }
      cells[pid][ci] = cell;
    }
    const counts = {};
    for (const v of valid) counts[v.norm] = (counts[v.norm] || 0) + 1;
    for (const v of valid) {
      const cell = cells[v.pid][ci];
      if (counts[v.norm] > 1) { cell.status = 'shared'; cell.points = 5; }
      else if (soloBonus && valid.length === 1 && participants.length > 1) { cell.status = 'solo'; cell.points = 15; }
      else { cell.status = 'unique'; cell.points = 10; }
    }
  });

  const totals = {};
  for (const pid of participants) totals[pid] = cells[pid].reduce((s, c) => s + c.points, 0);
  return { cells, totals, threshold };
}

export function pickLetter(enabled, used, rnd = Math.random) {
  const pool = enabled.filter((l) => !used.includes(l));
  const from = pool.length ? pool : enabled;
  return from[Math.floor(rnd() * from.length)];
}

/** מנקה ומאמת הגדרות שמגיעות מהמארח. */
export function sanitizeSettings(input, current) {
  const s = { ...current };
  if (Array.isArray(input.categories)) {
    const seen = new Set();
    const cats = [];
    for (const c of input.categories) {
      const t = String(c ?? '').replace(/\s+/g, ' ').trim().slice(0, LIMITS.maxCategoryLen);
      if (t && !seen.has(t)) { seen.add(t); cats.push(t); }
      if (cats.length >= LIMITS.maxCategories) break;
    }
    if (cats.length) s.categories = cats;
  }
  if (input.roundSeconds != null) s.roundSeconds = clampInt(input.roundSeconds, 30, 600, s.roundSeconds);
  if (input.rounds != null) s.rounds = clampInt(input.rounds, 1, 22, s.rounds);
  if (input.stopGrace != null) s.stopGrace = clampInt(input.stopGrace, 0, 30, s.stopGrace);
  if (input.soloBonus != null) s.soloBonus = !!input.soloBonus;
  if (input.stopEnabled != null) s.stopEnabled = !!input.stopEnabled;
  if (Array.isArray(input.letters)) {
    const ls = HEB_LETTERS.filter((l) => input.letters.includes(l));
    if (ls.length >= 1) s.letters = ls;
  }
  return s;
}

function clampInt(v, min, max, fallback) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function defaultSettings() {
  return {
    categories: [...DEFAULT_CATEGORIES],
    roundSeconds: 120,
    rounds: 5,
    stopEnabled: true,
    stopGrace: 10,
    soloBonus: true,
    letters: [...HEB_LETTERS],
  };
}
