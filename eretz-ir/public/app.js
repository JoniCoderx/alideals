'use strict';
// ארץ עיר אונליין – צד לקוח (בלי ספריות). עברית + English.

const LS_KEY = 'eretzir:session';
const LS_NAME = 'eretzir:name';
const LS_MUTE = 'eretzir:mute';
const LS_UI = 'eretzir:ui';
const app = document.getElementById('app');

let session = null;
let es = null;
let S = null;
let prev = null;
let offset = 0;
let meta = null;
let screenKey = '';
let tickTimer = null;
let muted = lsGet(LS_MUTE) === '1';
let ui = (new URLSearchParams(location.search).get('lang') === 'en' ? 'en' : null) || lsGet(LS_UI) || 'he';

// ---------- תרגום ----------
const I = {
  he: {
    appName: 'ארץ עיר', appAccent: 'אונליין',
    tagline: 'פותחים חדר, שולחים קישור לחברים, ומשחקים. בלי הרשמה ובלי הורדות.',
    yourName: 'השם שלך', namePh: 'איך קוראים לך?', needName: 'קודם כתבו שם',
    createRoom: 'פתיחת חדר חדש', orJoin: 'או הצטרפות עם קוד', codePh: 'קוד חדר', join: 'הצטרפות',
    invited: (c) => ['הוזמנת לחדר ', c, ' 🎉'], joinGame: 'הצטרפות למשחק', orNew: 'או פתחו חדר חדש',
    codeBad: 'קוד חדר הוא 4 ספרות',
    howTitle: 'איך משחקים?',
    how: [
      'פותחים חדר ושולחים את הקישור בוואטסאפ.',
      'בכל סיבוב מוגרלת אות. ממלאים מילה שמתחילה בה בכל קטגוריה לפני שהזמן נגמר.',
      'מי שמילא הכול לוחץ "עצור!", ולשאר נשארות כמה שניות.',
      'בודקים ביחד: 👎 על תשובה לא תקינה. רוב השחקנים פוסל.',
      'ניקוד: ייחודי 10, כפול 5, רק את/ה ענית בקטגוריה 15.',
    ],
    otherLang: 'English',
    copyTitle: 'העתקת קישור', leaveQ: 'לצאת מהחדר?', reconnecting: 'מתחבר מחדש…',
    linkCopied: 'הקישור הועתק 📋', copyPrompt: 'העתיקו את הקישור:',
    waText: (u) => `בואו לשחק איתי ארץ עיר! 🌍🏙️🐘\n${u}`,
    roomCode: 'קוד החדר', sendWa: 'שליחה בוואטסאפ', copyLink: 'העתקת קישור', share: 'שיתוף…',
    aloneTitle: 'מחכים לחברים 👋', aloneText: 'שלחו להם את הקישור. מי שלוחץ עליו נכנס ישר לחדר הזה.',
    players: 'שחקנים', you: ' (את/ה)', host: 'מארח/ת', offline: 'לא מחובר/ת', makeHost: 'להעביר ניהול', kick: 'הוצאה מהחדר',
    kickQ: (n) => `להוציא את ${n}?`,
    settings: 'הגדרות המשחק', gameLang: 'שפת המשחק',
    presets: 'בחירה מהירה', presetFast: '⚡ מהיר', presetClassic: '🎯 קלאסי', presetLong: '🐢 רגוע',
    presetSub: (s, r) => `${s} · ${r} סיבובים`,
    categories: (n) => `קטגוריות (${n})`, remove: 'הסרה', addCatPh: 'קטגוריה משלכם…', add: 'הוספה',
    quickAdd: 'להוספה: ', resetDefault: '↺ ברירת מחדל', maxCats: 'מקסימום 14 קטגוריות',
    advanced: 'הגדרות מתקדמות',
    roundTime: '⏱️ זמן לסיבוב', roundsN: '🔁 מספר סיבובים', allLetters: (n) => `${n} (כל האותיות)`,
    stopToggle: 'כפתור "עצור!"', stopHint: '– מי שמילא הכול עוצר לכולם',
    graceLabel: '✋ כמה זמן נשאר לשאר אחרי "עצור!"', graceNone: 'נגמר מיד',
    soloToggle: 'בונוס 15 למי שהיחיד שענה בקטגוריה',
    lettersTitle: (n, tot) => `אותיות במשחק (${n}/${tot})`, lettersHint: ' – לחיצה מוציאה/מחזירה', oneLetter: 'חייבת להישאר לפחות אות אחת',
    secs: (s) => `${s} שניות`, mins: (m) => `${m} דק׳`,
    sumRounds: (n) => (n === 1 ? 'סיבוב אחד' : `${n} סיבובים`), sumStop: (g) => `עצור! (${g} ש׳)`, sumNoStop: 'בלי עצור',
    hostOnly: 'המארח/ת בוחר/ת את ההגדרות',
    startAlone: 'אפשר להתחיל גם לבד, אבל עם חברים זה הרבה יותר כיף.',
    start: (n) => `🎲 יאללה, מתחילים! (${n})`,
    waitHostStart: (n) => `מחכים ש${n} י/תתחיל`,
    round: (r, tot) => `סיבוב ${r} מתוך ${tot}`,
    lateJoin: '⏳ נכנסת באמצע סיבוב.', lateJoin2: 'תצטרפו מהסיבוב הבא. בינתיים אפשר לראות מי כמה מילא.',
    drawing: 'מגרילים אות…', startsIn: (s) => `מתחילים בעוד ${s}…`, go: 'יאללה!',
    mustStart: (l) => `צריך להתחיל ב-${l}`,
    stop: '✋ עצור!', stopMore: (n) => `✋ עצור! (עוד ${n})`, stopTaken: '✋ מישהו כבר עצר',
    endNowQ: 'לסיים את הסיבוב עכשיו לכולם?', endNow: 'סיום הסיבוב עכשיו (מארח)',
    timeUp: '⏰ הזמן נגמר! אוספים תשובות…', youStopped: '✋ עצרת! לשאר נשארו כמה שניות', stoppedBy: (n) => `✋ ${n} עצר/ה! מהר, מהר!`,
    someoneStopped: (n) => `${n} עצר/ה! ✋`, nowHost: 'את/ה המארח/ת עכשיו 👑',
    joined: (n) => `${n} הצטרף/ה 👋`, left: (n) => `${n} יצא/ה`,
    reviewTitle: (r) => `בדיקת תשובות – סיבוב ${r}`,
    reviewHelp: 'לא מסכימים עם תשובה? לחצו 👎. אם רוב השחקנים האחרים פוסלים, היא שווה 0. כשסיימתם, לחצו "סיימתי".',
    stUnique: 'ייחודי', stSolo: 'רק את/ה!', stShared: 'כפול', stEmpty: 'ריק', stLetter: (l) => `לא ב-${l}`, stRejected: 'נפסל',
    unvote: 'ביטול פסילה', vote: 'פסילה', roundPoints: 'ניקוד הסיבוב',
    doneReview: '✓ סיימתי לבדוק', undoReady: 'רגע, עוד לא', readyCount: (a, b) => `${a}/${b} סיימו`,
    hostContinue: 'להמשיך עכשיו (מארח)', waitOthers: 'מחכים לשאר…',
    tableAfter: (r, tot) => `טבלה אחרי סיבוב ${r} מתוך ${tot}`, yourRound: () => 'הרווחת בסיבוב הזה',
    roundAnswers: 'כל התשובות של הסיבוב', nextRound: (n) => `🎲 לסיבוב ${n}`, endGame: 'סיום משחק', endGameQ: 'לסיים את המשחק עכשיו?',
    waitNext: (n) => `מחכים ש${n} י/תתחיל את הסיבוב הבא`,
    gameOver: '🏆 סוף המשחק!', tie: 'תיקו בצמרת!', won: (n, s) => `${n} ניצח/ה עם ${s} נקודות`,
    fullRank: 'הדירוג המלא', byRound: 'סיבוב אחרי סיבוב', letter: 'אות',
    playAgain: '🔄 משחק חדש עם אותם חברים', hostCanRestart: 'המארח/ת יכול/ה לפתוח משחק חדש',
    kicked: 'הוצאת מהחדר על ידי המארח.', leftPlayer: 'שחקן שיצא',
    errors: {
      room_not_found: 'החדר לא קיים או שנסגר. פתחו חדר חדש.', name_required: 'צריך שם', room_full: 'החדר מלא',
      not_host: 'רק המארח/ת יכול/ה', bad_phase: 'אי אפשר עכשיו', fill_all: 'צריך למלא את כל השדות כדי לעצור',
      not_connected: 'לא מחובר לחדר', busy: 'השרת עמוס, נסו שוב', network: 'בעיית חיבור, נסו שוב',
    },
  },
  en: {
    appName: 'Eretz Ir', appAccent: 'Online',
    tagline: 'The classic word game: Country, City, Animal… Open a room, send the link, play. No sign-up, no download.',
    yourName: 'Your name', namePh: 'What should we call you?', needName: 'Type your name first',
    createRoom: 'Create a new room', orJoin: 'or join with a code', codePh: 'Room code', join: 'Join',
    invited: (c) => ['You were invited to room ', c, ' 🎉'], joinGame: 'Join the game', orNew: 'or create a new room',
    codeBad: 'Room codes are 4 digits',
    howTitle: 'How to play',
    how: [
      'Create a room and share the link (WhatsApp works great).',
      'Each round a random letter is drawn. Fill in a word starting with it for every category before time runs out.',
      'Filled everything? Hit "Stop!" and everyone else gets a few seconds left.',
      'Review together: tap 👎 on answers that don\'t count. A majority of the other players rejects it.',
      'Scoring: unique 10, shared 5, the only one who answered a category 15.',
    ],
    otherLang: 'עברית',
    copyTitle: 'Copy link', leaveQ: 'Leave the room?', reconnecting: 'Reconnecting…',
    linkCopied: 'Link copied 📋', copyPrompt: 'Copy the link:',
    waText: (u) => `Come play Eretz Ir with me! 🌍🏙️🐘\n${u}`,
    roomCode: 'Room code', sendWa: 'Send on WhatsApp', copyLink: 'Copy link', share: 'Share…',
    aloneTitle: 'Waiting for friends 👋', aloneText: 'Send them the link. Anyone who opens it lands right in this room.',
    players: 'Players', you: ' (you)', host: 'Host', offline: 'offline', makeHost: 'Make host', kick: 'Remove',
    kickQ: (n) => `Remove ${n}?`,
    settings: 'Game settings', gameLang: 'Game language',
    presets: 'Quick setup', presetFast: '⚡ Fast', presetClassic: '🎯 Classic', presetLong: '🐢 Relaxed',
    presetSub: (s, r) => `${s} · ${r} rounds`,
    categories: (n) => `Categories (${n})`, remove: 'Remove', addCatPh: 'Your own category…', add: 'Add',
    quickAdd: 'Add: ', resetDefault: '↺ Defaults', maxCats: 'Up to 14 categories',
    advanced: 'Advanced settings',
    roundTime: '⏱️ Round time', roundsN: '🔁 Rounds', allLetters: (n) => `${n} (every letter)`,
    stopToggle: '"Stop!" button', stopHint: '– whoever fills everything ends the round',
    graceLabel: '✋ Time left for others after "Stop!"', graceNone: 'Ends immediately',
    soloToggle: '15-point bonus for the only answer in a category',
    lettersTitle: (n, tot) => `Letters in play (${n}/${tot})`, lettersHint: ' – tap to toggle', oneLetter: 'Keep at least one letter',
    secs: (s) => `${s} sec`, mins: (m) => `${m} min`,
    sumRounds: (n) => (n === 1 ? '1 round' : `${n} rounds`), sumStop: (g) => `Stop! (${g}s)`, sumNoStop: 'No Stop!',
    hostOnly: 'The host picks the settings',
    startAlone: 'You can start alone, but it\'s way more fun with friends.',
    start: (n) => `🎲 Let's go! (${n})`,
    waitHostStart: (n) => `Waiting for ${n} to start`,
    round: (r, tot) => `Round ${r} of ${tot}`,
    lateJoin: '⏳ You joined mid-round.', lateJoin2: 'You\'ll play from the next round. Meanwhile, watch everyone\'s progress.',
    drawing: 'Drawing a letter…', startsIn: (s) => `Starting in ${s}…`, go: 'Go!',
    mustStart: (l) => `Must start with ${l}`,
    stop: '✋ Stop!', stopMore: (n) => `✋ Stop! (${n} left)`, stopTaken: '✋ Someone already stopped',
    endNowQ: 'End this round now for everyone?', endNow: 'End round now (host)',
    timeUp: '⏰ Time\'s up! Collecting answers…', youStopped: '✋ You stopped! Others have a few seconds', stoppedBy: (n) => `✋ ${n} stopped! Hurry!`,
    someoneStopped: (n) => `${n} stopped! ✋`, nowHost: 'You\'re the host now 👑',
    joined: (n) => `${n} joined 👋`, left: (n) => `${n} left`,
    reviewTitle: (r) => `Review answers – round ${r}`,
    reviewHelp: 'Disagree with an answer? Tap 👎. If most other players reject it, it scores 0. Tap "Done" when you\'re finished.',
    stUnique: 'unique', stSolo: 'only you!', stShared: 'shared', stEmpty: 'empty', stLetter: (l) => `not ${l}`, stRejected: 'rejected',
    unvote: 'Undo', vote: 'Reject', roundPoints: 'Round points',
    doneReview: '✓ Done reviewing', undoReady: 'Wait, not yet', readyCount: (a, b) => `${a}/${b} done`,
    hostContinue: 'Continue now (host)', waitOthers: 'Waiting for the others…',
    tableAfter: (r, tot) => `Standings after round ${r} of ${tot}`, yourRound: () => 'you scored this round',
    roundAnswers: 'All answers this round', nextRound: (n) => `🎲 Round ${n}`, endGame: 'End game', endGameQ: 'End the game now?',
    waitNext: (n) => `Waiting for ${n} to start the next round`,
    gameOver: '🏆 Game over!', tie: 'It\'s a tie at the top!', won: (n, s) => `${n} wins with ${s} points`,
    fullRank: 'Final standings', byRound: 'Round by round', letter: 'Letter',
    playAgain: '🔄 New game, same friends', hostCanRestart: 'The host can start a new game',
    kicked: 'The host removed you from the room.', leftPlayer: 'Player who left',
    errors: {
      room_not_found: 'That room doesn\'t exist or has closed. Create a new one.', name_required: 'Name required', room_full: 'The room is full',
      not_host: 'Only the host can do that', bad_phase: 'Not right now', fill_all: 'Fill every field to stop',
      not_connected: 'Not connected to the room', busy: 'Server busy, try again', network: 'Connection problem, try again',
    },
  },
};
const t = (k, ...a) => { const v = I[ui][k] ?? I.he[k]; return typeof v === 'function' ? v(...a) : v; };
const errText = (code) => I[ui].errors[code] || I[ui].errors.network;

function applyUiLang() {
  document.documentElement.lang = ui;
  document.documentElement.dir = ui === 'he' ? 'rtl' : 'ltr';
  document.title = ui === 'he' ? 'ארץ עיר אונליין' : 'Eretz Ir Online';
}
function toggleUi() {
  ui = ui === 'he' ? 'en' : 'he';
  lsSet(LS_UI, ui);
  applyUiLang();
  if (!S) return renderHome(codeFromUrl());
  screenKey = '';
  onState(S, true);
}

// ---------- עזר ----------
function lsGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function lsSet(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} }

function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

function toast(msg, ms = 2600) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove('show'), ms);
}

async function api(path, body) {
  let r;
  try { r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) }); }
  catch { const e = new Error(errText('network')); e.code = 'network'; throw e; }
  let data = {};
  try { data = await r.json(); } catch {}
  if (!r.ok) { const e = new Error(errText(data.error)); e.code = data.error || 'network'; throw e; }
  return data;
}

async function action(type, extra) {
  if (!session) return;
  try { await api('/api/action', { ...extra, type, ...session }); }
  catch (e) { toast(e.message); }
}

const serverNow = () => Date.now() + offset;
const isHost = () => S && S.hostId === S.you;
const player = (id) => S.players.find((p) => p.id === id);
const pname = (id) => (player(id) || {}).name || t('leftPlayer');
const pcolor = (id) => (player(id) || {}).color || '#868e96';
const shareUrl = () => `${location.origin}/${S.code}`;
const gameDir = () => (S && S.settings.lang === 'en' ? 'ltr' : 'rtl');
const fmt = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const fmtSecs = (s) => (s < 60 ? t('secs', s) : s % 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : t('mins', s / 60));
const FINALS = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' };
function firstLetterOk(ans, letter) {
  const n = String(ans).normalize('NFKD').replace(/[̀-֑ͯ-ׇ]/g, '').replace(/^[\s"'״׳`’.,\-–—_!?()]+/, '');
  if (!n) return null;
  return (FINALS[n[0]] || n[0]).toLowerCase() === letter.toLowerCase();
}
function avatar(id, size) {
  return h('span', { class: 'av' + (size ? ' av-' + size : ''), style: { background: pcolor(id) }, 'aria-hidden': 'true' }, pname(id).slice(0, 1).toUpperCase());
}
const langInfo = (lang) => (meta && meta.langs && meta.langs[lang]) || null;

// ---------- צלילים ----------
let actx = null;
function beep(freq = 660, dur = 0.12, type = 'sine', vol = 0.15) {
  if (muted) return;
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, actx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + dur);
    o.connect(g).connect(actx.destination);
    o.start(); o.stop(actx.currentTime + dur);
  } catch {}
}
const buzz = () => { beep(220, 0.5, 'sawtooth', 0.12); try { navigator.vibrate && navigator.vibrate([150, 60, 150]); } catch {} };
const chime = () => { beep(784, 0.1, 'triangle', 0.1); setTimeout(() => beep(1046, 0.15, 'triangle', 0.1), 90); };
document.addEventListener('pointerdown', () => { try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); actx.resume(); } catch {} }, { once: true });

// ---------- כניסה ----------
function codeFromUrl() {
  const m = location.pathname.match(/^\/(\d{4,5})\/?$/);
  if (m) return m[1];
  const q = new URLSearchParams(location.search).get('r');
  return q && /^\d{4,5}$/.test(q) ? q : null;
}

async function loadMeta() {
  if (meta) return meta;
  try { meta = await (await fetch('/api/meta')).json(); } catch {}
  return meta;
}

async function boot() {
  applyUiLang();
  loadMeta();
  const code = codeFromUrl();
  const saved = (() => { try { return JSON.parse(lsGet(LS_KEY) || 'null'); } catch { return null; } })();
  if (saved && (!code || saved.room === code)) {
    try { return connect(await api('/api/join', saved)); }
    catch { lsSet(LS_KEY, null); }
  }
  renderHome(code);
}

function langSwitch() {
  return h('button', { class: 'lang-btn', onclick: toggleUi, title: ui === 'he' ? 'Switch to English' : 'מעבר לעברית' }, '🌐 ', t('otherLang'));
}

function renderHome(code, err) {
  stopTick();
  S = null;
  screenKey = 'home';
  document.body.classList.remove('is-host');
  if (es) { es.close(); es = null; }
  const name = h('input', { class: 'inp big', id: 'name', maxlength: 16, placeholder: t('namePh'), value: lsGet(LS_NAME) || '', autocomplete: 'nickname', enterkeyhint: 'go', dir: 'auto' });
  const codeInp = h('input', { class: 'inp big ltr code-inp', id: 'code', inputmode: 'numeric', pattern: '[0-9]*', maxlength: 5, placeholder: t('codePh'), value: code || '' });
  const getName = () => {
    const n = name.value.trim();
    if (!n) { name.focus(); name.classList.add('shake'); setTimeout(() => name.classList.remove('shake'), 500); toast(t('needName')); return null; }
    lsSet(LS_NAME, n);
    return n;
  };
  const create = async (btn) => {
    const n = getName(); if (!n) return;
    btn.disabled = true;
    try { connect(await api('/api/create', { name: n, lang: ui })); } catch (e) { toast(e.message); btn.disabled = false; }
  };
  const join = async (btn) => {
    const n = getName(); if (!n) return;
    const c = (code || codeInp.value).trim();
    if (!/^\d{4,5}$/.test(c)) { toast(t('codeBad')); codeInp.focus(); return; }
    btn.disabled = true;
    try { connect(await api('/api/join', { room: c, name: n })); } catch (e) { toast(e.message); btn.disabled = false; }
  };
  name.addEventListener('keydown', (e) => { if (e.key === 'Enter') (code ? join : create)(e.target); });
  codeInp.addEventListener('keydown', (e) => { if (e.key === 'Enter') join(e.target); });

  const word = ui === 'he' ? 'ארץעיר' : 'ERETZIR';
  const gapAt = ui === 'he' ? 3 : 5;
  app.replaceChildren(h('main', { class: 'home' },
    h('div', { class: 'home-top' }, langSwitch()),
    h('div', { class: 'hero' },
      h('div', { class: 'logo-tiles' }, ...word.split('').map((l, i) => h('span', { class: i === gapAt ? 'gap' : '', style: { animationDelay: i * 70 + 'ms' } }, l))),
      h('h1', null, t('appName'), ' ', h('span', { class: 'accent' }, t('appAccent'))),
      h('p', { class: 'sub' }, t('tagline'))),
    err ? h('div', { class: 'alert' }, err) : null,
    h('div', { class: 'card' },
      h('label', { class: 'lbl', for: 'name' }, t('yourName')),
      name,
      code
        ? h('div', null,
          h('p', { class: 'invite' }, ...t('invited', h('b', { class: 'ltr' }, code))),
          h('button', { class: 'btn primary xl', onclick: (e) => join(e.currentTarget) }, t('joinGame')),
          h('button', { class: 'btn link', onclick: () => { history.replaceState(null, '', '/'); renderHome(null); } }, t('orNew')))
        : h('div', null,
          h('button', { class: 'btn primary xl', onclick: (e) => create(e.currentTarget) }, '➕ ', t('createRoom')),
          h('div', { class: 'or' }, h('span', null, t('orJoin'))),
          h('div', { class: 'row' }, codeInp, h('button', { class: 'btn', onclick: (e) => join(e.currentTarget) }, t('join'))))),
    howToCard()));
  if (!name.value) name.focus();
}

function howToCard() {
  return h('details', { class: 'card rules' },
    h('summary', null, t('howTitle')),
    h('ol', null, ...t('how').map((x) => h('li', null, x))));
}

function connect(r) {
  session = { room: r.room, pid: r.pid, token: r.token };
  lsSet(LS_KEY, JSON.stringify(session));
  if (location.pathname !== '/' + r.room) history.replaceState(null, '', '/' + r.room);
  openStream();
}

function openStream() {
  if (es) es.close();
  es = new EventSource('/api/events?' + new URLSearchParams(session).toString());
  es.addEventListener('state', (ev) => {
    const data = JSON.parse(ev.data);
    offset = data.serverNow - Date.now();
    onState(data);
    setConn(true);
  });
  es.addEventListener('kicked', () => {
    es.close(); es = null; lsSet(LS_KEY, null); session = null;
    history.replaceState(null, '', '/');
    renderHome(null, t('kicked'));
  });
  es.onerror = () => {
    setConn(false);
    if (es && es.readyState === EventSource.CLOSED) {
      setTimeout(async () => {
        if (!session) return;
        try { connect(await api('/api/join', session)); }
        catch (e) {
          if (e.code === 'network' || e.code === 'busy') return openStream();
          lsSet(LS_KEY, null); session = null; history.replaceState(null, '', '/'); renderHome(null, e.message);
        }
      }, 1500);
    }
  };
}

function setConn(ok) { document.body.classList.toggle('offline', !ok); }

async function leave() {
  if (!confirm(t('leaveQ'))) return;
  await action('leave');
  if (es) es.close();
  es = null; session = null;
  lsSet(LS_KEY, null);
  history.replaceState(null, '', '/');
  renderHome(null);
}

// ---------- ניתוב לפי מצב ----------
function onState(data, rerender) {
  if (!rerender) { prev = S; S = data; }
  if (!meta) loadMeta().then(() => { if (screenKey === 'lobby') { lobbySettingsJson = ''; updateLobby(); } });
  const inRound = S.participants.includes(S.you);
  const key = ({
    lobby: 'lobby',
    countdown: 'game:' + S.round + ':' + inRound,
    playing: 'game:' + S.round + ':' + inRound,
    collecting: 'game:' + S.round + ':' + inRound,
    review: 'review:' + S.round,
    scores: 'scores:' + S.round,
    final: 'final:' + S.round,
  })[S.phase];

  if (prev && !rerender) {
    if (prev.phase !== S.phase) {
      if (S.phase === 'playing') beep(880, 0.2, 'triangle');
      if (S.phase === 'collecting') buzz();
    }
    if (!prev.stoppedBy && S.stoppedBy && S.stoppedBy !== S.you) { buzz(); toast(t('someoneStopped', pname(S.stoppedBy))); }
    if (prev.hostId !== S.hostId && S.hostId === S.you) toast(t('nowHost'));
    const before = new Set(prev.players.map((p) => p.id));
    const after = new Set(S.players.map((p) => p.id));
    const newcomer = S.players.find((p) => !before.has(p.id) && p.id !== S.you);
    if (newcomer) { toast(t('joined', newcomer.name)); chime(); }
    const gone = prev.players.find((p) => !after.has(p.id));
    if (gone) toast(t('left', gone.name));
  }

  if (key !== screenKey) {
    screenKey = key;
    stopTick();
    if (S.phase === 'lobby') buildLobby();
    else if (key.startsWith('game')) buildGame();
    else if (S.phase === 'review') buildReview();
    else if (S.phase === 'scores') buildScores();
    else if (S.phase === 'final') buildFinal();
    if (!rerender) window.scrollTo({ top: 0 });
  }
  update();
}

function update() {
  if (screenKey === 'lobby') updateLobby();
  else if (screenKey.startsWith('game')) updateGame();
  else if (screenKey.startsWith('review')) updateReview();
  else if (screenKey.startsWith('scores')) updateScores();
  else if (screenKey.startsWith('final')) updateFinal();
  updateTopbar();
}

function stopTick() { if (tickTimer) cancelAnimationFrame(tickTimer); tickTimer = null; }

// ---------- פס עליון ----------
function topbar() {
  return h('header', { class: 'topbar' },
    h('button', { class: 'chip code ltr', title: t('copyTitle'), onclick: copyLink }, '# ', h('b', { id: 'tb-code' })),
    h('span', { class: 'chip', id: 'tb-online' }),
    h('span', { class: 'spacer' }),
    h('span', { class: 'conn' }, '● ', t('reconnecting')),
    h('button', { class: 'icon-btn lang-mini', title: 'Language / שפה', onclick: toggleUi }, ui === 'he' ? 'EN' : 'עב'),
    h('button', { class: 'icon-btn', id: 'tb-mute', title: '🔊', onclick: () => { muted = !muted; lsSet(LS_MUTE, muted ? '1' : '0'); updateTopbar(); } }),
    h('button', { class: 'icon-btn', title: t('leaveQ'), onclick: leave }, '🚪'));
}
function updateTopbar() {
  const c = document.getElementById('tb-code'); if (c) c.textContent = S.code;
  const o = document.getElementById('tb-online'); if (o) o.textContent = '👥 ' + S.players.filter((p) => p.online).length;
  const m = document.getElementById('tb-mute'); if (m) m.textContent = muted ? '🔇' : '🔊';
}

async function copyLink() {
  try { await navigator.clipboard.writeText(shareUrl()); toast(t('linkCopied')); }
  catch { prompt(t('copyPrompt'), shareUrl()); }
}
function shareWhatsapp() {
  window.open('https://wa.me/?text=' + encodeURIComponent(t('waText', shareUrl())), '_blank', 'noopener');
}
async function shareNative() {
  try { await navigator.share({ title: t('appName'), text: t('waText', ''), url: shareUrl() }); } catch {}
}

// ---------- לובי ----------
let lobbySettingsJson = '';
let lobbyPlayersJson = '';
let advancedOpen = false;
const PRESETS = [
  { key: 'presetFast', roundSeconds: 60, rounds: 3 },
  { key: 'presetClassic', roundSeconds: 120, rounds: 5 },
  { key: 'presetLong', roundSeconds: 180, rounds: 8 },
];

function buildLobby() {
  lobbySettingsJson = ''; lobbyPlayersJson = '';
  app.replaceChildren(topbar(), h('main', { class: 'lobby' },
    h('section', { class: 'card invite-card' },
      h('div', { class: 'invite-head' },
        h('div', null, h('div', { class: 'muted small' }, t('roomCode')), h('div', { class: 'room-code ltr', id: 'lb-code' })),
        h('div', { class: 'share-btns' },
          h('button', { class: 'btn wa', onclick: shareWhatsapp }, '💬 ', t('sendWa')),
          h('button', { class: 'btn', onclick: copyLink }, '🔗 ', t('copyLink')),
          navigator.share ? h('button', { class: 'btn only-touch', onclick: shareNative }, t('share')) : null)),
      h('div', { class: 'link-line ltr', id: 'lb-link', onclick: copyLink }),
      h('div', { class: 'alone', id: 'lb-alone' }, h('b', null, t('aloneTitle')), ' ', t('aloneText'))),
    h('section', { class: 'card' },
      h('h2', null, t('players'), ' ', h('span', { class: 'count', id: 'lb-count' })),
      h('ul', { class: 'players', id: 'lb-players' })),
    h('section', { class: 'card' },
      h('h2', null, t('settings')),
      h('div', { id: 'lb-settings' })),
    howToCard(),
    h('div', { class: 'sticky-cta', id: 'lb-cta' })));
}

function setSettings(patch) {
  S.settings = { ...S.settings, ...patch };
  if (patch.lang) {
    const L = langInfo(patch.lang);
    if (L) { S.settings.categories = [...L.categories]; S.settings.letters = [...L.defaultLetters]; }
  }
  updateLobby();
  action('settings', { settings: patch });
}

function updateLobby() {
  document.getElementById('lb-code').textContent = S.code;
  document.getElementById('lb-link').textContent = shareUrl().replace(/^https?:\/\//, '');
  document.body.classList.toggle('is-host', isHost());
  const online = S.players.filter((p) => p.online).length;
  document.getElementById('lb-alone').classList.toggle('show', S.players.length < 2);

  const pj = JSON.stringify([S.players, S.hostId, ui]);
  if (pj !== lobbyPlayersJson) {
    lobbyPlayersJson = pj;
    document.getElementById('lb-count').textContent = `(${S.players.length})`;
    document.getElementById('lb-players').replaceChildren(...S.players.map((p) => h('li', { class: (p.online ? '' : 'off') + (p.id === S.you ? ' mine' : '') },
      avatar(p.id),
      h('span', { class: 'pn' }, p.name, p.id === S.you ? h('span', { class: 'muted' }, t('you')) : null),
      p.id === S.hostId ? h('span', { class: 'crown', title: t('host') }, '👑') : null,
      !p.online ? h('span', { class: 'muted small' }, t('offline')) : null,
      isHost() && p.id !== S.you ? h('span', { class: 'p-actions' },
        h('button', { class: 'mini', title: t('makeHost'), 'aria-label': t('makeHost'), onclick: () => action('makeHost', { target: p.id }) }, '👑'),
        h('button', { class: 'mini danger', title: t('kick'), 'aria-label': t('kick'), onclick: () => confirm(t('kickQ', p.name)) && action('kick', { target: p.id }) }, '✕')) : null)));
  }

  const sj = JSON.stringify([S.settings, isHost(), ui, !!meta]);
  if (sj !== lobbySettingsJson) { lobbySettingsJson = sj; renderSettings(); }

  document.getElementById('lb-cta').replaceChildren(isHost()
    ? h('div', null,
      online < 2 ? h('p', { class: 'muted small center cta-note' }, t('startAlone')) : null,
      h('button', { class: 'btn primary xl', onclick: (e) => { e.currentTarget.disabled = true; action('start'); } }, t('start', online)))
    : h('div', { class: 'waiting' }, h('span', { class: 'dots' }), t('waitHostStart', pname(S.hostId))));
}

function renderSettings() {
  const st = S.settings, host = isHost();
  const L = langInfo(st.lang);
  const allLetters = L ? L.letters : st.letters;
  const box = document.getElementById('lb-settings');
  const catDir = st.lang === 'en' ? 'ltr' : 'rtl';

  const langSeg = h('div', { class: 'seg' }, ...[['he', '🇮🇱 עברית'], ['en', '🇬🇧 English']].map(([k, label]) =>
    h('button', { class: 'seg-btn' + (st.lang === k ? ' on' : ''), 'aria-pressed': String(st.lang === k), onclick: () => st.lang !== k && setSettings({ lang: k }) }, label)));

  const catChips = h('div', { class: 'chips', dir: catDir }, ...st.categories.map((c, i) => h('span', { class: 'cat-chip' }, c,
    host && st.categories.length > 1 ? h('button', { class: 'x', title: t('remove'), 'aria-label': t('remove') + ' ' + c, onclick: () => setSettings({ categories: st.categories.filter((_, j) => j !== i) }) }, '×') : null)));

  if (!host) {
    box.replaceChildren(
      h('div', { class: 'summary' },
        h('span', { class: 'pill' }, st.lang === 'en' ? '🇬🇧 English' : '🇮🇱 עברית'),
        h('span', { class: 'pill' }, '⏱️ ', fmtSecs(st.roundSeconds)),
        h('span', { class: 'pill' }, '🔁 ', t('sumRounds', st.rounds)),
        h('span', { class: 'pill' }, st.stopEnabled ? '✋ ' + t('sumStop', st.stopGrace) : t('sumNoStop'))),
      h('div', { class: 'sub-h' }, t('categories', st.categories.length)),
      catChips,
      h('p', { class: 'muted small' }, t('hostOnly')));
    return;
  }

  const addInp = h('input', { class: 'inp', maxlength: 24, placeholder: t('addCatPh'), enterkeyhint: 'done', dir: 'auto' });
  const addCat = () => {
    const v = addInp.value.trim(); if (!v) return;
    if (st.categories.length >= 14) return toast(t('maxCats'));
    setSettings({ categories: [...st.categories, v] });
    setTimeout(() => { const n = document.querySelector('.add-cat-row .inp'); if (n) n.focus(); }, 0);
  };
  addInp.addEventListener('keydown', (e) => { if (e.key === 'Enter') addCat(); });

  const select = (label, key, options, fmtFn) => h('label', { class: 'field' },
    h('span', null, label),
    h('select', { class: 'inp', onchange: (e) => setSettings({ [key]: Number(e.target.value) }) },
      ...options.map((o) => h('option', { value: o, selected: o === st[key] }, fmtFn(o)))));
  const toggle = (label, key, hint) => h('label', { class: 'toggle' },
    h('input', { type: 'checkbox', checked: st[key], onchange: (e) => setSettings({ [key]: e.target.checked }) }),
    h('span', { class: 'sw' }), h('span', null, label, hint ? h('small', { class: 'muted' }, ' ' + hint) : null));

  const extras = (L ? L.extras : []).filter((c) => !st.categories.includes(c));
  const defaults = L ? L.categories : [];
  const roundOpts = [1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 15];
  if (allLetters.length && !roundOpts.includes(allLetters.length)) roundOpts.push(allLetters.length);
  if (!roundOpts.includes(st.rounds)) roundOpts.push(st.rounds);
  roundOpts.sort((a, b) => a - b);

  const adv = h('details', { class: 'advanced', open: advancedOpen || null, ontoggle: (e) => { advancedOpen = e.currentTarget.open; } },
    h('summary', null, t('advanced')),
    h('div', { class: 'grid2' },
      select(t('roundTime'), 'roundSeconds', [45, 60, 90, 120, 150, 180, 240, 300], fmtSecs),
      select(t('roundsN'), 'rounds', roundOpts, (n) => (n === allLetters.length ? t('allLetters', n) : String(n)))),
    toggle(t('stopToggle'), 'stopEnabled', t('stopHint')),
    st.stopEnabled ? select(t('graceLabel'), 'stopGrace', [0, 3, 5, 10, 15, 20, 30], (s) => (s ? t('secs', s) : t('graceNone'))) : null,
    toggle(t('soloToggle'), 'soloBonus'),
    h('div', { class: 'sub-h' }, t('lettersTitle', st.letters.length, allLetters.length), h('small', { class: 'muted' }, t('lettersHint'))),
    h('div', { class: 'letters' + (st.lang === 'en' ? ' en' : ''), dir: catDir }, ...allLetters.map((l) => {
      const on = st.letters.includes(l);
      return h('button', { class: 'lt' + (on ? ' on' : ''), 'aria-pressed': String(on), onclick: () => {
        const next = on ? st.letters.filter((x) => x !== l) : allLetters.filter((x) => st.letters.includes(x) || x === l);
        if (!next.length) return toast(t('oneLetter'));
        setSettings({ letters: next });
      } }, l);
    })));

  box.replaceChildren(
    h('div', { class: 'set-row' }, h('div', { class: 'sub-h' }, t('gameLang')), langSeg),
    h('div', { class: 'sub-h' }, t('presets')),
    h('div', { class: 'presets' }, ...PRESETS.map((p) => {
      const on = st.roundSeconds === p.roundSeconds && st.rounds === p.rounds;
      return h('button', { class: 'preset' + (on ? ' on' : ''), 'aria-pressed': String(on), onclick: () => setSettings({ roundSeconds: p.roundSeconds, rounds: p.rounds }) },
        h('b', null, t(p.key)), h('small', null, t('presetSub', fmtSecs(p.roundSeconds), p.rounds)));
    })),
    h('div', { class: 'sub-h' }, t('categories', st.categories.length)),
    catChips,
    h('div', { class: 'add-cat-row' }, addInp, h('button', { class: 'btn', onclick: addCat }, t('add'))),
    h('div', { class: 'suggest', dir: catDir },
      h('span', { class: 'muted small' }, t('quickAdd')),
      ...extras.map((c) => h('button', { class: 'chip-add', onclick: () => (st.categories.length >= 14 ? toast(t('maxCats')) : setSettings({ categories: [...st.categories, c] })) }, '+ ' + c)),
      defaults.length && JSON.stringify(defaults) !== JSON.stringify(st.categories)
        ? h('button', { class: 'chip-add reset', onclick: () => setSettings({ categories: [...defaults] }) }, t('resetDefault')) : null),
    adv);
}

// ---------- משחק ----------
let answers = [];
let sendTimer = null;
const ansKey = () => `eretzir:ans:${S.code}:${S.round}`;

function buildGame() {
  const inRound = S.participants.includes(S.you);
  let local = null;
  try { local = JSON.parse(sessionStorage.getItem(ansKey()) || 'null'); } catch {}
  const server = S.myAnswers || [];
  answers = S.categories.map((_, i) => (local && local[i]) || server[i] || '');
  const dir = gameDir();

  const form = h('form', { class: 'answers', id: 'g-form', autocomplete: 'off', onsubmit: (e) => e.preventDefault() },
    ...S.categories.map((c, i) => {
      const inp = h('input', {
        class: 'inp ans', id: 'a' + i, maxlength: 40, value: answers[i], dir,
        autocomplete: 'off', autocorrect: 'off', autocapitalize: dir === 'ltr' ? 'words' : 'off', spellcheck: 'false',
        enterkeyhint: i === S.categories.length - 1 ? 'done' : 'next',
      });
      inp.addEventListener('input', () => { answers[i] = inp.value; markField(i); queueSend(); });
      inp.addEventListener('blur', () => flush());
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          const empty = S.categories.findIndex((_, j) => j > i && !String(answers[j] || '').trim());
          const nx = document.getElementById('a' + (empty >= 0 ? empty : i + 1));
          nx ? nx.focus() : inp.blur();
        }
      });
      return h('div', { class: 'field-row', id: 'fr' + i },
        h('label', { for: 'a' + i, class: 'cat', dir }, h('span', { class: 'num' }, h('span', { class: 'n' }, i + 1), h('span', { class: 'ck' }, '✓')), c),
        inp,
        h('span', { class: 'hint', id: 'hint' + i }));
    }));

  app.replaceChildren(topbar(), h('main', { class: 'game' },
    h('div', { class: 'game-head' },
      h('div', { class: 'letter-tile', id: 'g-letter' }, '?'),
      h('div', { class: 'gh-mid' },
        h('div', { class: 'gh-top' }, h('span', { class: 'muted small' }, t('round', S.round, S.settings.rounds)), h('span', { class: 'filled ltr', id: 'g-filled' })),
        h('div', { class: 'timer ltr', id: 'g-timer' }, '0:00'),
        h('div', { class: 'bar' }, h('div', { class: 'bar-fill', id: 'g-bar' })))),
    h('div', { class: 'banner', id: 'g-banner' }),
    inRound ? form : h('div', { class: 'card center' }, h('p', null, t('lateJoin')), h('p', { class: 'muted' }, t('lateJoin2'))),
    h('section', { class: 'progress-list', id: 'g-progress' }),
    h('div', { class: 'sticky-cta game-cta', id: 'g-cta' }),
    h('div', { class: 'countdown', id: 'g-count' },
      h('div', { class: 'cd-letter', id: 'g-cd-letter' }, '?'),
      h('div', { class: 'cd-text', id: 'g-cd-text' }, t('drawing')))));
  if (inRound) S.categories.forEach((_, i) => markField(i));
  tick();
}

function markField(i) {
  const row = document.getElementById('fr' + i); if (!row) return;
  const inp = document.getElementById('a' + i);
  if (S.letter && inp) inp.placeholder = S.letter + '…';
  const ok = S.letter ? firstLetterOk(answers[i], S.letter) : null;
  row.classList.toggle('good', ok === true);
  row.classList.toggle('bad', ok === false);
  document.getElementById('hint' + i).textContent = ok === false ? t('mustStart', S.letter) : '';
  updateStopBtn();
}

function queueSend() {
  try { sessionStorage.setItem(ansKey(), JSON.stringify(answers)); } catch {}
  clearTimeout(sendTimer);
  sendTimer = setTimeout(flush, 350);
}
function flush() {
  clearTimeout(sendTimer);
  if (!S || !S.participants.includes(S.you)) return;
  if (!['countdown', 'playing', 'collecting'].includes(S.phase)) return;
  action('answers', { answers });
}

const filledCount = () => S.categories.filter((_, i) => String(answers[i] || '').trim()).length;

function updateStopBtn() {
  const f = document.getElementById('g-filled');
  if (f && S.participants.includes(S.you)) f.textContent = `✍️ ${filledCount()}/${S.categories.length}`;
  const btn = document.getElementById('g-stop'); if (!btn) return;
  const left = S.categories.length - filledCount();
  btn.disabled = left > 0 || S.phase !== 'playing' || !!S.stoppedBy;
  btn.textContent = S.stoppedBy ? t('stopTaken') : left ? t('stopMore', left) : t('stop');
  btn.classList.toggle('ready', !btn.disabled);
}

function updateGame() {
  const inRound = S.participants.includes(S.you);
  const playing = S.phase === 'playing';
  document.getElementById('g-letter').textContent = S.letter || '?';
  document.getElementById('g-count').classList.toggle('show', S.phase === 'countdown');
  document.querySelectorAll('.ans').forEach((inp) => { inp.disabled = !playing; });
  if (playing && prev && prev.phase === 'countdown' && inRound) {
    S.categories.forEach((_, i) => markField(i));
    const lt = document.getElementById('g-letter');
    lt.classList.remove('reveal'); void lt.offsetWidth; lt.classList.add('reveal');
    const first = document.querySelector('.ans');
    if (first) first.focus({ preventScroll: true });
  }
  if (S.phase === 'collecting') { flush(); if (document.activeElement) document.activeElement.blur(); }

  const banner = document.getElementById('g-banner');
  if (S.phase === 'collecting') { banner.className = 'banner show end'; banner.textContent = t('timeUp'); }
  else if (S.stoppedBy) { banner.className = 'banner show stop'; banner.textContent = S.stoppedBy === S.you ? t('youStopped') : t('stoppedBy', pname(S.stoppedBy)); }
  else banner.className = 'banner';

  document.getElementById('g-progress').replaceChildren(
    ...S.participants.filter((id) => id !== S.you).map((id) => {
      const p = player(id); if (!p) return null;
      const pct = Math.round(100 * (p.filled || 0) / S.categories.length);
      return h('div', { class: 'pg' + (p.online ? '' : ' off') }, avatar(id, 'sm'), h('span', { class: 'pg-name' }, p.name),
        h('span', { class: 'pg-bar' }, h('i', { style: { width: pct + '%', background: p.color } })), h('span', { class: 'pg-n ltr' }, `${p.filled || 0}/${S.categories.length}`));
    }));

  const cta = document.getElementById('g-cta');
  const kids = [];
  if (inRound && S.settings.stopEnabled) kids.push(h('button', { class: 'btn stop xl', id: 'g-stop', onclick: () => { flush(); setTimeout(() => action('stop'), 120); } }));
  if (isHost() && playing) kids.push(h('button', { class: 'btn link small', onclick: () => confirm(t('endNowQ')) && action('endNow') }, t('endNow')));
  cta.replaceChildren(...kids);
  updateStopBtn();
  if (!tickTimer) tick();
}

let lastBeepSec = -1;
let cdShuffle = 0;
function tick() {
  if (!screenKey.startsWith('game') || !S) return;
  const now = serverNow();
  const timer = document.getElementById('g-timer'), bar = document.getElementById('g-bar');
  if (!timer) return;
  if (S.phase === 'countdown') {
    const left = S.startsAt - now;
    document.getElementById('g-cd-text').textContent = left > 0 ? t('startsIn', Math.ceil(left / 1000)) : t('go');
    if (++cdShuffle % 4 === 0) {
      const ls = S.settings.letters;
      document.getElementById('g-cd-letter').textContent = ls[Math.floor(Math.random() * ls.length)];
    }
    timer.textContent = fmt(S.settings.roundSeconds * 1000);
    bar.style.width = '100%';
  } else if (S.phase === 'playing') {
    const left = S.endsAt - now;
    const total = S.settings.roundSeconds * 1000;
    timer.textContent = fmt(left);
    bar.style.width = Math.max(0, Math.min(100, 100 * left / total)) + '%';
    const sec = Math.ceil(left / 1000);
    const urgent = sec <= 10;
    timer.classList.toggle('urgent', urgent);
    bar.classList.toggle('urgent', urgent);
    if (urgent && sec > 0 && sec !== lastBeepSec) { lastBeepSec = sec; beep(sec <= 3 ? 990 : 740, 0.08); }
  } else {
    timer.textContent = '0:00';
    bar.style.width = '0%';
  }
  tickTimer = requestAnimationFrame(tick);
}

// ---------- בדיקת תשובות ----------
function statusInfo(c) {
  switch (c.status) {
    case 'unique': return ['10', 'ok', t('stUnique')];
    case 'solo': return ['15', 'solo', t('stSolo')];
    case 'shared': return ['5', 'shared', t('stShared')];
    case 'letter': return ['0', 'zero', t('stLetter', S.letter)];
    case 'rejected': return ['0', 'rej', t('stRejected')];
    default: return ['0', 'zero', t('stEmpty')];
  }
}

function buildReview() {
  app.replaceChildren(topbar(), h('main', { class: 'review' },
    h('div', { class: 'review-head card' },
      h('div', { class: 'letter-tile sm' }, S.letter),
      h('div', null,
        h('h2', null, t('reviewTitle', S.round)),
        h('p', { class: 'muted small' }, t('reviewHelp')))),
    h('div', { id: 'rv-cats' }),
    h('section', { class: 'card' }, h('h2', null, t('roundPoints')), h('div', { id: 'rv-totals' })),
    h('div', { class: 'sticky-cta', id: 'rv-cta' })));
}

function updateReview() {
  const R = S.result; if (!R) return;
  const part = S.participants.filter((id) => R.cells[id]);
  const inRound = S.participants.includes(S.you);
  const dir = gameDir();
  document.getElementById('rv-cats').replaceChildren(...S.categories.map((cat, ci) => h('section', { class: 'card cat-card' },
    h('h3', { dir }, cat),
    h('ul', { class: 'ans-list' }, ...part.map((pid) => {
      const c = R.cells[pid][ci];
      const [pts, cls, label] = statusInfo(c);
      const voted = (S.votes[`${pid}|${ci}`] || []).includes(S.you);
      const canVote = inRound && pid !== S.you && c.answer && c.status !== 'letter';
      return h('li', { class: 'ans-row st-' + cls + (pid === S.you ? ' mine' : '') },
        avatar(pid, 'sm'),
        h('span', { class: 'who' }, pname(pid)),
        h('span', { class: 'what', dir }, c.answer || '—'),
        h('span', { class: 'pts' }, h('b', null, pts), h('small', null, label)),
        canVote
          ? h('button', { class: 'vote' + (voted ? ' on' : ''), title: voted ? t('unvote') : t('vote'), 'aria-label': voted ? t('unvote') : t('vote'), 'aria-pressed': String(voted), onclick: () => action('vote', { target: pid, ci }) }, '👎', c.rejects ? h('small', null, `${c.rejects}/${R.threshold}`) : null)
          : h('span', { class: 'vote-ph' }, c.rejects ? `👎 ${c.rejects}/${R.threshold}` : ''));
    })))));

  const ranked = [...part].sort((a, b) => R.totals[b] - R.totals[a]);
  document.getElementById('rv-totals').replaceChildren(h('ol', { class: 'rank' }, ...ranked.map((pid) => h('li', { class: pid === S.you ? 'mine' : '' },
    avatar(pid, 'sm'), h('span', { class: 'who' }, pname(pid), (player(pid) || {}).ready ? h('span', { class: 'ready-tag' }, ' ✓') : null),
    h('b', { class: 'plus ltr' }, '+' + R.totals[pid])))));

  const onlinePart = part.filter((id) => (player(id) || {}).online);
  const readyN = onlinePart.filter((id) => player(id).ready).length;
  const meReady = (player(S.you) || {}).ready;
  const kids = [];
  if (inRound) {
    kids.push(meReady
      ? h('div', { class: 'row' },
        h('div', { class: 'waiting grow' }, h('span', { class: 'dots' }), t('waitOthers'), ' ', h('b', { class: 'ltr' }, `${readyN}/${onlinePart.length}`)),
        h('button', { class: 'btn', onclick: () => action('ready', { value: false }) }, t('undoReady')))
      : h('button', { class: 'btn primary xl', onclick: () => action('ready', { value: true }) }, t('doneReview'), h('small', { class: 'cta-sub' }, ' · ', t('readyCount', readyN, onlinePart.length))));
  } else {
    kids.push(h('div', { class: 'waiting' }, t('readyCount', readyN, onlinePart.length)));
  }
  if (isHost()) kids.push(h('button', { class: 'btn link small', onclick: (e) => { e.currentTarget.disabled = true; action('finishReview'); } }, t('hostContinue')));
  document.getElementById('rv-cta').replaceChildren(...kids);
}

// ---------- ניקוד ----------
function rankingTable(withRound) {
  const last = S.history[S.history.length - 1];
  const ranked = [...S.players].sort((a, b) => b.score - a.score);
  let place = 0, prevScore = null;
  return h('ol', { class: 'rank big' }, ...ranked.map((p, i) => {
    if (p.score !== prevScore) { place = i + 1; prevScore = p.score; }
    const plus = last && last.totals[p.id] != null ? last.totals[p.id] : null;
    return h('li', { class: p.id === S.you ? 'mine' : '' },
      h('span', { class: 'place' }, place === 1 ? '🥇' : place === 2 ? '🥈' : place === 3 ? '🥉' : place),
      avatar(p.id, 'sm'), h('span', { class: 'who' }, p.name),
      withRound && plus != null ? h('span', { class: 'plus ltr' }, '+' + plus) : null,
      h('b', { class: 'score' }, p.score));
  }));
}

function buildScores() {
  const last = S.history[S.history.length - 1];
  const mine = last && last.totals[S.you];
  app.replaceChildren(topbar(), h('main', { class: 'scores' },
    mine != null ? h('div', { class: 'you-scored' }, h('span', { class: 'big-num ltr' }, '+' + mine), h('span', null, t('yourRound'))) : null,
    h('section', { class: 'card' },
      h('h2', null, t('tableAfter', S.round, S.settings.rounds)),
      h('div', { id: 'sc-table' })),
    h('details', { class: 'card' }, h('summary', null, t('roundAnswers')), h('div', { id: 'sc-answers' })),
    h('div', { class: 'sticky-cta', id: 'sc-cta' })));
}
function updateScores() {
  document.getElementById('sc-table').replaceChildren(rankingTable(true));
  document.getElementById('sc-answers').replaceChildren(answersGrid());
  document.getElementById('sc-cta').replaceChildren(isHost()
    ? h('div', { class: 'row' },
      h('button', { class: 'btn primary xl grow', onclick: (e) => { e.currentTarget.disabled = true; action('start'); } }, t('nextRound', S.round + 1)),
      h('button', { class: 'btn', onclick: () => confirm(t('endGameQ')) && action('endGame') }, t('endGame')))
    : h('div', { class: 'waiting' }, h('span', { class: 'dots' }), t('waitNext', pname(S.hostId))));
}

function answersGrid() {
  const R = S.result; if (!R) return h('div');
  const part = S.participants.filter((id) => R.cells[id]);
  const dir = gameDir();
  return h('div', { class: 'grid-wrap' }, h('table', { class: 'agrid' },
    h('thead', null, h('tr', null, h('th', null, S.letter), ...part.map((pid) => h('th', null, pname(pid))))),
    h('tbody', null, ...S.categories.map((cat, ci) => h('tr', null, h('th', { dir }, cat),
      ...part.map((pid) => { const c = R.cells[pid][ci]; const [pts, cls] = statusInfo(c); return h('td', { class: 'st-' + cls, dir }, c.answer || '—', h('small', null, pts)); }))))));
}

// ---------- סיום ----------
function buildFinal() {
  const ranked = [...S.players].sort((a, b) => b.score - a.score);
  const podium = [ranked[1], ranked[0], ranked[2]];
  app.replaceChildren(topbar(), h('main', { class: 'final' },
    h('canvas', { id: 'confetti' }),
    h('h1', { class: 'center' }, t('gameOver')),
    ranked[0] ? h('p', { class: 'center big-win' }, ranked.filter((p) => p.score === ranked[0].score).length > 1 ? t('tie') : t('won', ranked[0].name, ranked[0].score)) : null,
    h('div', { class: 'podium', dir: 'ltr' }, ...podium.map((p, i) => (p ? h('div', { class: 'pod p' + [2, 1, 3][i] },
      avatar(p.id, 'lg'), h('div', { class: 'pod-name' }, p.name), h('div', { class: 'pod-score' }, p.score),
      h('div', { class: 'pod-block' }, ['🥈', '🥇', '🥉'][i])) : h('div', { class: 'pod empty' })))),
    h('section', { class: 'card' }, h('h2', null, t('fullRank')), h('div', { id: 'fn-table' })),
    h('section', { class: 'card' }, h('h2', null, t('byRound')), h('div', { id: 'fn-hist' })),
    h('div', { class: 'sticky-cta', id: 'fn-cta' })));
  confetti();
}
function updateFinal() {
  document.getElementById('fn-table').replaceChildren(rankingTable(false));
  const ids = [...S.players].sort((a, b) => b.score - a.score).map((p) => p.id);
  document.getElementById('fn-hist').replaceChildren(h('div', { class: 'grid-wrap' }, h('table', { class: 'agrid' },
    h('thead', null, h('tr', null, h('th', null, t('letter')), ...ids.map((id) => h('th', null, pname(id))))),
    h('tbody', null, ...S.history.map((r) => h('tr', null, h('th', null, `${r.round}. ${r.letter}`),
      ...ids.map((id) => h('td', null, r.totals[id] != null ? r.totals[id] : '–'))))))));
  document.getElementById('fn-cta').replaceChildren(isHost()
    ? h('button', { class: 'btn primary xl', onclick: () => action('playAgain') }, t('playAgain'))
    : h('div', { class: 'waiting' }, h('span', { class: 'dots' }), t('hostCanRestart')));
}

function confetti() {
  const cv = document.getElementById('confetti'); if (!cv) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const ctx = cv.getContext('2d');
  const W = cv.width = innerWidth, H = cv.height = innerHeight;
  const cols = ['#ff6b35', '#ffd23f', '#3bceac', '#0ead69', '#5f6fff', '#ee4266'];
  const ps = Array.from({ length: 160 }, () => ({ x: Math.random() * W, y: -Math.random() * H, r: 4 + Math.random() * 6, c: cols[Math.floor(Math.random() * cols.length)], vy: 2 + Math.random() * 3, vx: -1 + Math.random() * 2, a: Math.random() * 6 }));
  const end = Date.now() + 5000;
  (function frame() {
    ctx.clearRect(0, 0, W, H);
    for (const p of ps) { p.y += p.vy; p.x += p.vx; p.a += 0.1; ctx.fillStyle = p.c; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a); ctx.fillRect(-p.r / 2, -p.r / 4, p.r, p.r / 2); ctx.restore(); }
    if (Date.now() < end && document.getElementById('confetti')) requestAnimationFrame(frame); else ctx.clearRect(0, 0, W, H);
  })();
  beep(523, 0.15, 'triangle'); setTimeout(() => beep(659, 0.15, 'triangle'), 150); setTimeout(() => beep(784, 0.3, 'triangle'), 300);
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && session && (!es || es.readyState === EventSource.CLOSED)) openStream();
});
window.addEventListener('pagehide', () => flush());

boot();
