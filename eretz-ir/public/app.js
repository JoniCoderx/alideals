'use strict';
// ארץ עיר אונליין – צד לקוח (בלי ספריות)

const LS_KEY = 'eretzir:session';
const LS_NAME = 'eretzir:name';
const LS_MUTE = 'eretzir:mute';
const app = document.getElementById('app');

let session = null;      // {room, pid, token}
let es = null;           // EventSource
let S = null;            // מצב אחרון מהשרת
let offset = 0;          // serverNow - Date.now()
let meta = null;
let screenKey = '';
let tickTimer = null;
let muted = lsGet(LS_MUTE) === '1';

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
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('show'), ms);
}

async function api(path, body) {
  const r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
  let data = {};
  try { data = await r.json(); } catch {}
  if (!r.ok) throw new Error(data.error || 'שגיאה בחיבור לשרת');
  return data;
}

async function action(type, extra) {
  if (!session) return;
  try { await api('/api/action', { ...extra, type, ...session }); }
  catch (e) { toast(e.message); }
}

const serverNow = () => Date.now() + offset;
const me = () => S && S.players.find((p) => p.id === S.you);
const isHost = () => S && S.hostId === S.you;
const pname = (id) => (S.players.find((p) => p.id === id) || {}).name || 'שחקן שיצא';
const pcolor = (id) => (S.players.find((p) => p.id === id) || {}).color || '#868e96';
const shareUrl = () => `${location.origin}/${S.code}`;
const fmt = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const FINALS = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' };
function firstLetterOk(ans, letter) {
  const n = String(ans).replace(/[֑-ׇ]/g, '').replace(/^[\s"'״׳`.,\-–—_!?()]+/, '');
  if (!n) return null;
  return (FINALS[n[0]] || n[0]) === letter;
}
function avatar(id, size) {
  const n = pname(id);
  return h('span', { class: 'av' + (size ? ' av-' + size : ''), style: { background: pcolor(id) } }, n.slice(0, 1));
}

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
document.addEventListener('pointerdown', () => { try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); actx.resume(); } catch {} }, { once: true });

// ---------- כניסה ----------
function codeFromUrl() {
  const m = location.pathname.match(/^\/(\d{4,5})\/?$/);
  if (m) return m[1];
  const q = new URLSearchParams(location.search).get('r');
  return q && /^\d{4,5}$/.test(q) ? q : null;
}

async function boot() {
  fetch('/api/meta').then((r) => r.json()).then((m) => { meta = m; }).catch(() => {});
  const code = codeFromUrl();
  const saved = (() => { try { return JSON.parse(lsGet(LS_KEY) || 'null'); } catch { return null; } })();
  if (saved && (!code || saved.room === code)) {
    try {
      const r = await api('/api/join', saved);
      return connect(r);
    } catch { lsSet(LS_KEY, null); }
  }
  renderHome(code);
}

function renderHome(code, err) {
  stopTick();
  screenKey = 'home';
  if (es) { es.close(); es = null; }
  const name = h('input', { class: 'inp big', id: 'name', maxlength: 16, placeholder: 'איך קוראים לך?', value: lsGet(LS_NAME) || '', autocomplete: 'nickname', enterkeyhint: 'go' });
  const codeInp = h('input', { class: 'inp big ltr', id: 'code', inputmode: 'numeric', pattern: '[0-9]*', maxlength: 5, placeholder: 'קוד חדר', value: code || '' });
  const getName = () => {
    const n = name.value.trim();
    if (!n) { name.focus(); name.classList.add('shake'); setTimeout(() => name.classList.remove('shake'), 500); toast('קודם כתבו שם'); return null; }
    lsSet(LS_NAME, n);
    return n;
  };
  const create = async (btn) => {
    const n = getName(); if (!n) return;
    btn.disabled = true;
    try { connect(await api('/api/create', { name: n })); } catch (e) { toast(e.message); btn.disabled = false; }
  };
  const join = async (btn) => {
    const n = getName(); if (!n) return;
    const c = codeInp.value.trim();
    if (!/^\d{4,5}$/.test(c)) { toast('קוד חדר הוא 4 ספרות'); codeInp.focus(); return; }
    btn.disabled = true;
    try { connect(await api('/api/join', { room: c, name: n })); } catch (e) { toast(e.message); btn.disabled = false; }
  };
  name.addEventListener('keydown', (e) => { if (e.key === 'Enter') (code ? join : create)(e.target); });
  codeInp.addEventListener('keydown', (e) => { if (e.key === 'Enter') join(e.target); });

  app.replaceChildren(h('main', { class: 'home' },
    h('div', { class: 'hero' },
      h('div', { class: 'logo-tiles' }, ...'ארץעיר'.split('').map((l, i) => h('span', { style: { animationDelay: i * 80 + 'ms' } }, l))),
      h('h1', null, 'ארץ עיר ', h('span', { class: 'accent' }, 'אונליין')),
      h('p', { class: 'sub' }, 'פותחים חדר, שולחים קישור לחברים, ומשחקים. בלי הרשמה ובלי הורדות.')),
    err ? h('div', { class: 'alert' }, err) : null,
    h('div', { class: 'card' },
      h('label', { class: 'lbl', for: 'name' }, 'השם שלך'),
      name,
      code
        ? h('div', null,
          h('p', { class: 'invite' }, 'הוזמנת לחדר ', h('b', { class: 'ltr' }, code), ' 🎉'),
          h('button', { class: 'btn primary xl', onclick: (e) => join(e.currentTarget) }, 'הצטרפות למשחק'),
          h('div', { style: { display: 'none' } }, codeInp),
          h('button', { class: 'btn link', onclick: () => { history.replaceState(null, '', '/'); renderHome(null); } }, 'או פתחו חדר חדש'))
        : h('div', null,
          h('button', { class: 'btn primary xl', onclick: (e) => create(e.currentTarget) }, '➕ פתיחת חדר חדש'),
          h('div', { class: 'or' }, h('span', null, 'או הצטרפות עם קוד')),
          h('div', { class: 'row' }, codeInp, h('button', { class: 'btn', onclick: (e) => join(e.currentTarget) }, 'הצטרפות')))),
    h('details', { class: 'card rules' },
      h('summary', null, 'איך משחקים?'),
      h('ol', null,
        h('li', null, 'המארח פותח חדר ושולח את הקישור בוואטסאפ.'),
        h('li', null, 'בכל סיבוב מוגרלת אות. ממלאים מילה שמתחילה בה בכל קטגוריה, לפני שהזמן נגמר.'),
        h('li', null, 'מי שמילא הכול יכול ללחוץ "עצור!", ולשאר נשארות כמה שניות.'),
        h('li', null, 'בודקים ביחד: לוחצים 👎 על תשובה לא תקינה. רוב השחקנים פוסל.'),
        h('li', null, 'ניקוד: תשובה ייחודית 10, תשובה שגם מישהו אחר כתב 5, ורק את/ה ענית בקטגוריה 15.'))),
  ));
  if (!name.value) name.focus();
}

function connect(r) {
  session = { room: r.room, pid: r.pid, token: r.token };
  lsSet(LS_KEY, JSON.stringify(session));
  if (location.pathname !== '/' + r.room) history.replaceState(null, '', '/' + r.room);
  openStream();
}

function openStream() {
  if (es) es.close();
  const q = new URLSearchParams(session).toString();
  es = new EventSource('/api/events?' + q);
  es.addEventListener('state', (ev) => {
    const data = JSON.parse(ev.data);
    offset = data.serverNow - Date.now();
    onState(data);
    setConn(true);
  });
  es.addEventListener('kicked', () => {
    es.close(); es = null; lsSet(LS_KEY, null); session = null; S = null;
    renderHome(null, 'הוצאת מהחדר על ידי המארח.');
  });
  es.onerror = () => {
    setConn(false);
    if (es.readyState === EventSource.CLOSED) {
      // השרת סירב (חדר נסגר / שרת הופעל מחדש) – ננסה להתחבר שוב
      setTimeout(async () => {
        if (!session) return;
        try { connect(await api('/api/join', session)); }
        catch (e) { lsSet(LS_KEY, null); session = null; S = null; renderHome(null, e.message); }
      }, 1500);
    }
  };
}

function setConn(ok) { document.body.classList.toggle('offline', !ok); }

async function leave() {
  if (!confirm('לצאת מהחדר?')) return;
  await action('leave');
  if (es) es.close();
  es = null; session = null; S = null;
  lsSet(LS_KEY, null);
  history.replaceState(null, '', '/');
  renderHome(null);
}

// ---------- ניתוב לפי מצב ----------
let prev = null;
function onState(data) {
  prev = S;
  S = data;
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

  // אירועים קוליים
  if (prev && prev.phase !== S.phase) {
    if (S.phase === 'playing') beep(880, 0.2, 'triangle');
    if (S.phase === 'collecting') buzz();
  }
  if (prev && !prev.stoppedBy && S.stoppedBy && S.stoppedBy !== S.you) { buzz(); toast(`${pname(S.stoppedBy)} עצר/ה! ✋`); }
  if (prev && prev.hostId !== S.hostId && S.hostId === S.you) toast('את/ה המארח/ת עכשיו 👑');

  if (key !== screenKey) {
    screenKey = key;
    stopTick();
    if (S.phase === 'lobby') buildLobby();
    else if (key.startsWith('game')) buildGame();
    else if (S.phase === 'review') buildReview();
    else if (S.phase === 'scores') buildScores();
    else if (S.phase === 'final') buildFinal();
    window.scrollTo({ top: 0 });
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
    h('button', { class: 'chip code ltr', title: 'העתקת קישור', onclick: copyLink }, '#', h('b', { id: 'tb-code' })),
    h('span', { class: 'chip', id: 'tb-online' }),
    h('span', { class: 'spacer' }),
    h('span', { class: 'conn', title: 'מתחבר מחדש…' }, '● מתחבר מחדש…'),
    h('button', { class: 'icon-btn', id: 'tb-mute', title: 'צליל', onclick: () => { muted = !muted; lsSet(LS_MUTE, muted ? '1' : '0'); updateTopbar(); } }),
    h('button', { class: 'icon-btn', title: 'יציאה', onclick: leave }, '🚪'));
}
function updateTopbar() {
  const c = document.getElementById('tb-code'); if (c) c.textContent = S.code;
  const o = document.getElementById('tb-online'); if (o) o.textContent = `👥 ${S.players.filter((p) => p.online).length}`;
  const m = document.getElementById('tb-mute'); if (m) m.textContent = muted ? '🔇' : '🔊';
}

async function copyLink() {
  try { await navigator.clipboard.writeText(shareUrl()); toast('הקישור הועתק 📋'); }
  catch { prompt('העתיקו את הקישור:', shareUrl()); }
}
function shareWhatsapp() {
  const text = `בואו לשחק ארץ עיר! 🌍🏙️\n${shareUrl()}`;
  window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank', 'noopener');
}
async function shareNative() {
  try { await navigator.share({ title: 'ארץ עיר אונליין', text: 'בואו לשחק ארץ עיר!', url: shareUrl() }); } catch {}
}

// ---------- לובי ----------
let lobbySettingsJson = '';
let lobbyPlayersJson = '';
function buildLobby() {
  lobbySettingsJson = ''; lobbyPlayersJson = '';
  const addInp = h('input', { class: 'inp', id: 'add-cat', maxlength: 24, placeholder: 'קטגוריה משלכם…', enterkeyhint: 'done' });
  const addCat = () => {
    const v = addInp.value.trim(); if (!v) return;
    if (S.settings.categories.length >= 14) return toast('מקסימום 14 קטגוריות');
    setSettings({ categories: [...S.settings.categories, v] });
    addInp.value = '';
  };
  addInp.addEventListener('keydown', (e) => { if (e.key === 'Enter') addCat(); });

  app.replaceChildren(topbar(), h('main', { class: 'lobby' },
    h('section', { class: 'card invite-card' },
      h('div', { class: 'invite-head' },
        h('div', null, h('div', { class: 'muted' }, 'קוד החדר'), h('div', { class: 'room-code ltr', id: 'lb-code' })),
        h('div', { class: 'share-btns' },
          h('button', { class: 'btn wa', onclick: shareWhatsapp }, 'שליחה בוואטסאפ'),
          h('button', { class: 'btn', onclick: copyLink }, 'העתקת קישור'),
          navigator.share ? h('button', { class: 'btn', onclick: shareNative }, 'שיתוף…') : null)),
      h('div', { class: 'link-line ltr', id: 'lb-link', onclick: copyLink })),
    h('section', { class: 'card' },
      h('h2', null, 'שחקנים ', h('span', { class: 'count', id: 'lb-count' })),
      h('ul', { class: 'players', id: 'lb-players' })),
    h('section', { class: 'card' },
      h('h2', null, 'הגדרות ', h('span', { class: 'muted small', id: 'lb-settings-note' })),
      h('div', { id: 'lb-settings' }),
      h('div', { class: 'host-only add-cat-row' }, addInp, h('button', { class: 'btn', onclick: addCat }, 'הוספה'))),
    h('div', { class: 'sticky-cta', id: 'lb-cta' })));
}

function setSettings(patch) {
  // עדכון אופטימי מקומי כדי שהממשק ירגיש מיידי
  S.settings = { ...S.settings, ...patch };
  updateLobby();
  action('settings', { settings: patch });
}

function updateLobby() {
  document.getElementById('lb-code').textContent = S.code;
  document.getElementById('lb-link').textContent = shareUrl();
  document.body.classList.toggle('is-host', isHost());

  const pj = JSON.stringify([S.players, S.hostId]);
  if (pj !== lobbyPlayersJson) {
    lobbyPlayersJson = pj;
    document.getElementById('lb-count').textContent = `(${S.players.length})`;
    document.getElementById('lb-players').replaceChildren(...S.players.map((p) => h('li', { class: p.online ? '' : 'off' },
      avatar(p.id),
      h('span', { class: 'pn' }, p.name, p.id === S.you ? h('span', { class: 'muted' }, ' (את/ה)') : null),
      p.id === S.hostId ? h('span', { class: 'crown', title: 'מארח/ת' }, '👑') : null,
      !p.online ? h('span', { class: 'muted small' }, 'לא מחובר/ת') : null,
      isHost() && p.id !== S.you ? h('span', { class: 'p-actions' },
        h('button', { class: 'mini', title: 'להעביר ניהול', onclick: () => action('makeHost', { target: p.id }) }, '👑'),
        h('button', { class: 'mini danger', title: 'הוצאה מהחדר', onclick: () => confirm(`להוציא את ${p.name}?`) && action('kick', { target: p.id }) }, '✕')) : null)));
  }

  const sj = JSON.stringify([S.settings, isHost()]);
  if (sj !== lobbySettingsJson) {
    lobbySettingsJson = sj;
    renderSettings();
  }

  const online = S.players.filter((p) => p.online).length;
  document.getElementById('lb-cta').replaceChildren(isHost()
    ? h('div', null,
      online < 2 ? h('p', { class: 'muted small center' }, 'אפשר להתחיל גם לבד, אבל עם חברים זה הרבה יותר כיף. שלחו להם את הקישור.') : null,
      h('button', { class: 'btn primary xl', onclick: (e) => { e.currentTarget.disabled = true; action('start'); } }, `🎲 יאללה, מתחילים! (${online} שחקנים)`))
    : h('div', { class: 'waiting' }, h('span', { class: 'dots' }), `מחכים ש${pname(S.hostId)} י/תתחיל את המשחק`));
}

function renderSettings() {
  const st = S.settings, host = isHost();
  document.getElementById('lb-settings-note').textContent = host ? '' : '(רק המארח/ת משנה)';
  const dis = !host;
  const select = (label, key, options, fmtFn) => h('label', { class: 'field' },
    h('span', null, label),
    h('select', { class: 'inp', disabled: dis, onchange: (e) => setSettings({ [key]: Number(e.target.value) }) },
      ...options.map((o) => h('option', { value: o, selected: o === st[key] }, fmtFn(o)))));
  const toggle = (label, key, hint) => h('label', { class: 'toggle' },
    h('input', { type: 'checkbox', checked: st[key], disabled: dis, onchange: (e) => setSettings({ [key]: e.target.checked }) }),
    h('span', { class: 'sw' }), h('span', null, label, hint ? h('small', { class: 'muted' }, ' ' + hint) : null));

  const extras = (meta?.extras || []).filter((c) => !st.categories.includes(c));
  const allLetters = meta?.letters || 'אבגדהוזחטיכלמנסעפצקרשת'.split('');
  const defaults = meta?.defaults || [];

  document.getElementById('lb-settings').replaceChildren(
    h('div', { class: 'sub-h' }, `קטגוריות (${st.categories.length})`),
    h('div', { class: 'chips' }, ...st.categories.map((c, i) => h('span', { class: 'cat-chip' }, c,
      host && st.categories.length > 1 ? h('button', { class: 'x', title: 'הסרה', onclick: () => setSettings({ categories: st.categories.filter((_, j) => j !== i) }) }, '×') : null))),
    host ? h('div', { class: 'suggest' },
      h('span', { class: 'muted small' }, 'להוספה מהירה: '),
      ...extras.slice(0, 20).map((c) => h('button', { class: 'chip-add', onclick: () => st.categories.length >= 14 ? toast('מקסימום 14 קטגוריות') : setSettings({ categories: [...st.categories, c] }) }, '+ ' + c)),
      defaults.length && JSON.stringify(defaults) !== JSON.stringify(st.categories)
        ? h('button', { class: 'chip-add reset', onclick: () => setSettings({ categories: [...defaults] }) }, '↺ ברירת מחדל') : null) : null,
    h('div', { class: 'grid2' },
      select('⏱️ זמן לסיבוב', 'roundSeconds', [45, 60, 90, 120, 150, 180, 240, 300], (s) => s < 60 ? `${s} שניות` : s % 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} דק׳` : `${s / 60} דק׳`),
      select('🔁 מספר סיבובים', 'rounds', [1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 15, 22], (n) => n === 22 ? '22 (כל האותיות)' : String(n))),
    toggle('כפתור "עצור!"', 'stopEnabled', '– מי שמילא הכול עוצר לכולם'),
    st.stopEnabled ? select('✋ כמה זמן נשאר לשאר אחרי "עצור!"', 'stopGrace', [0, 3, 5, 10, 15, 20, 30], (s) => s ? `${s} שניות` : 'נגמר מיד') : null,
    toggle('בונוס 15 למי שהיחיד שענה בקטגוריה', 'soloBonus'),
    h('div', { class: 'sub-h' }, `אותיות במשחק (${st.letters.length}/22)`, host ? h('small', { class: 'muted' }, ' – לחיצה מוציאה/מחזירה') : null),
    h('div', { class: 'letters' }, ...allLetters.map((l) => {
      const on = st.letters.includes(l);
      return h('button', { class: 'lt' + (on ? ' on' : ''), disabled: dis, onclick: () => {
        const next = on ? st.letters.filter((x) => x !== l) : allLetters.filter((x) => st.letters.includes(x) || x === l);
        if (!next.length) return toast('חייבת להישאר לפחות אות אחת');
        setSettings({ letters: next });
      } }, l);
    })),
  );
}

// ---------- משחק ----------
let answers = [];
let sendTimer = null;
const ansKey = () => `eretzir:ans:${S.code}:${S.round}`;

function buildGame() {
  const inRound = S.participants.includes(S.you);
  answers = S.categories.map((_, i) => '');
  try {
    const local = JSON.parse(sessionStorage.getItem(ansKey()) || 'null');
    const server = S.myAnswers || [];
    answers = S.categories.map((_, i) => (local && local[i]) || server[i] || '');
  } catch {}

  const form = h('form', { class: 'answers', id: 'g-form', autocomplete: 'off', onsubmit: (e) => e.preventDefault() },
    ...S.categories.map((c, i) => {
      const inp = h('input', {
        class: 'inp ans', id: 'a' + i, 'data-i': i, maxlength: 40, value: answers[i],
        autocomplete: 'off', autocorrect: 'off', autocapitalize: 'off', spellcheck: 'false',
        enterkeyhint: i === S.categories.length - 1 ? 'done' : 'next', dir: 'rtl',
      });
      inp.addEventListener('input', () => { answers[i] = inp.value; markField(i); queueSend(); });
      inp.addEventListener('blur', () => flush());
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); const nx = document.getElementById('a' + (i + 1)); nx ? nx.focus() : inp.blur(); }
      });
      return h('div', { class: 'field-row', id: 'fr' + i },
        h('label', { for: 'a' + i, class: 'cat' }, h('span', { class: 'num' }, i + 1), c),
        inp,
        h('span', { class: 'hint', id: 'hint' + i }));
    }));

  app.replaceChildren(topbar(), h('main', { class: 'game' },
    h('div', { class: 'game-head' },
      h('div', { class: 'letter-tile', id: 'g-letter' }, '?'),
      h('div', { class: 'gh-mid' },
        h('div', { class: 'muted' }, `סיבוב ${S.round} מתוך ${S.settings.rounds}`),
        h('div', { class: 'timer', id: 'g-timer' }, '0:00'),
        h('div', { class: 'bar' }, h('div', { class: 'bar-fill', id: 'g-bar' })))),
    h('div', { class: 'banner', id: 'g-banner' }),
    inRound ? form : h('div', { class: 'card center' }, h('p', null, '⏳ נכנסת באמצע סיבוב.'), h('p', { class: 'muted' }, 'תצטרפו לסיבוב הבא. בינתיים אפשר לראות מי כמה מילא.')),
    h('section', { class: 'progress-list', id: 'g-progress' }),
    h('div', { class: 'sticky-cta game-cta', id: 'g-cta' }),
    h('div', { class: 'countdown', id: 'g-count' }, h('div', { class: 'cd-letter', id: 'g-cd-letter' }, 'א'), h('div', { class: 'cd-text', id: 'g-cd-text' }, 'מגרילים אות…'))));
  S.categories.forEach((_, i) => inRound && markField(i));
  tick();
}

function markField(i) {
  const row = document.getElementById('fr' + i); if (!row || !S.letter) return;
  const ok = firstLetterOk(answers[i], S.letter);
  row.classList.toggle('good', ok === true);
  row.classList.toggle('bad', ok === false);
  document.getElementById('hint' + i).textContent = ok === false ? `צריך להתחיל ב-${S.letter}` : '';
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

function allFilled() { return S.categories.every((_, i) => String(answers[i] || '').trim()); }

function updateStopBtn() {
  const btn = document.getElementById('g-stop'); if (!btn) return;
  const ok = allFilled();
  btn.disabled = !ok || S.phase !== 'playing' || !!S.stoppedBy;
  btn.textContent = S.stoppedBy ? '✋ מישהו כבר עצר' : ok ? '✋ עצור!' : `✋ עצור! (מלאו עוד ${S.categories.filter((_, i) => !String(answers[i] || '').trim()).length})`;
}

function updateGame() {
  const inRound = S.participants.includes(S.you);
  const playing = S.phase === 'playing';
  document.getElementById('g-letter').textContent = S.letter || '?';
  document.getElementById('g-count').classList.toggle('show', S.phase === 'countdown');
  document.querySelectorAll('.ans').forEach((inp) => { inp.disabled = S.phase !== 'playing'; });
  if (playing && prev && prev.phase === 'countdown' && inRound) {
    S.categories.forEach((_, i) => markField(i));
    const first = document.querySelector('.ans');
    if (first && matchMedia('(pointer:fine)').matches) first.focus();
  }
  if (S.phase === 'collecting') { flush(); document.activeElement && document.activeElement.blur(); }

  const banner = document.getElementById('g-banner');
  if (S.phase === 'collecting') { banner.className = 'banner show end'; banner.textContent = '⏰ הזמן נגמר! אוספים תשובות…'; }
  else if (S.stoppedBy) { banner.className = 'banner show stop'; banner.textContent = S.stoppedBy === S.you ? '✋ עצרת! לשאר נשארו כמה שניות' : `✋ ${pname(S.stoppedBy)} עצר/ה! מהר, מהר!`; }
  else banner.className = 'banner';

  document.getElementById('g-progress').replaceChildren(
    ...S.participants.map((id) => {
      const p = S.players.find((x) => x.id === id); if (!p) return null;
      const pct = Math.round(100 * (p.filled || 0) / S.categories.length);
      return h('div', { class: 'pg' + (p.online ? '' : ' off') }, avatar(id, 'sm'), h('span', { class: 'pg-name' }, p.name),
        h('span', { class: 'pg-bar' }, h('i', { style: { width: pct + '%', background: p.color } })), h('span', { class: 'pg-n' }, `${p.filled || 0}/${S.categories.length}`));
    }));

  const cta = document.getElementById('g-cta');
  const kids = [];
  if (inRound && S.settings.stopEnabled) kids.push(h('button', { class: 'btn stop xl', id: 'g-stop', onclick: () => { flush(); setTimeout(() => action('stop'), 120); } }));
  if (isHost() && playing) kids.push(h('button', { class: 'btn link small', onclick: () => confirm('לסיים את הסיבוב עכשיו לכולם?') && action('endNow') }, 'סיום הסיבוב עכשיו (מארח)'));
  cta.replaceChildren(...kids);
  updateStopBtn();
  if (!tickTimer) tick();
}

let lastBeepSec = -1;
let cdShuffle = 0;
function tick() {
  if (!screenKey.startsWith('game')) return;
  const t = serverNow();
  const timer = document.getElementById('g-timer'), bar = document.getElementById('g-bar');
  if (S.phase === 'countdown') {
    const left = S.startsAt - t;
    document.getElementById('g-cd-text').textContent = left > 0 ? `מתחילים בעוד ${Math.ceil(left / 1000)}…` : 'יאללה!';
    if (++cdShuffle % 4 === 0) {
      const ls = S.settings.letters;
      document.getElementById('g-cd-letter').textContent = ls[Math.floor(Math.random() * ls.length)];
    }
    timer.textContent = fmt(S.settings.roundSeconds * 1000);
    bar.style.width = '100%';
  } else if (S.phase === 'playing') {
    const left = S.endsAt - t;
    const total = S.stoppedBy ? Math.max(left, 1) : S.settings.roundSeconds * 1000;
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
const STATUS = {
  unique: (c) => ['10', 'ok', 'ייחודי'],
  solo: (c) => ['15', 'solo', 'רק את/ה!'],
  shared: (c) => ['5', 'shared', 'כפול'],
  empty: (c) => ['0', 'zero', 'ריק'],
  letter: (c) => ['0', 'zero', `לא ב-${S.letter}`],
  rejected: (c) => ['0', 'rej', 'נפסל'],
};

function buildReview() {
  app.replaceChildren(topbar(), h('main', { class: 'review' },
    h('div', { class: 'review-head card' },
      h('div', { class: 'letter-tile sm' }, S.letter),
      h('div', null,
        h('h2', null, `בדיקת תשובות – סיבוב ${S.round}`),
        h('p', { class: 'muted small' }, 'לא מסכימים עם תשובה? לחצו 👎. אם רוב השחקנים האחרים פוסלים, היא שווה 0. לחיצה נוספת מבטלת.'))),
    h('div', { id: 'rv-cats' }),
    h('section', { class: 'card' }, h('h2', null, 'ניקוד הסיבוב'), h('div', { id: 'rv-totals' })),
    h('div', { class: 'sticky-cta', id: 'rv-cta' })));
}

function updateReview() {
  const R = S.result; if (!R) return;
  const part = S.participants.filter((id) => R.cells[id]);
  const inRound = S.participants.includes(S.you);
  document.getElementById('rv-cats').replaceChildren(...S.categories.map((cat, ci) => h('section', { class: 'card cat-card' },
    h('h3', null, cat),
    h('ul', { class: 'ans-list' }, ...part.map((pid) => {
      const c = R.cells[pid][ci];
      const [pts, cls, label] = STATUS[c.status](c);
      const voted = (S.votes[`${pid}|${ci}`] || []).includes(S.you);
      const canVote = inRound && pid !== S.you && c.answer && c.status !== 'letter';
      return h('li', { class: 'ans-row st-' + cls + (pid === S.you ? ' mine' : '') },
        avatar(pid, 'sm'),
        h('span', { class: 'who' }, pname(pid)),
        h('span', { class: 'what' }, c.answer || '—'),
        h('span', { class: 'pts' }, h('b', null, pts), h('small', null, label)),
        canVote
          ? h('button', { class: 'vote' + (voted ? ' on' : ''), title: voted ? 'ביטול פסילה' : 'פסילה', onclick: () => action('vote', { target: pid, ci }) }, '👎', c.rejects ? h('small', null, `${c.rejects}/${R.threshold}`) : null)
          : h('span', { class: 'vote-ph' }, c.rejects ? `👎 ${c.rejects}/${R.threshold}` : ''));
    })))));

  const ranked = [...part].sort((a, b) => R.totals[b] - R.totals[a]);
  document.getElementById('rv-totals').replaceChildren(h('ol', { class: 'rank' }, ...ranked.map((pid) => h('li', { class: pid === S.you ? 'mine' : '' },
    avatar(pid, 'sm'), h('span', { class: 'who' }, pname(pid)), h('b', { class: 'plus ltr' }, '+' + R.totals[pid])))));

  document.getElementById('rv-cta').replaceChildren(isHost()
    ? h('button', { class: 'btn primary xl', onclick: (e) => { e.currentTarget.disabled = true; action('finishReview'); } }, '✅ סיימנו לבדוק – לניקוד')
    : h('div', { class: 'waiting' }, h('span', { class: 'dots' }), `כש${pname(S.hostId)} י/תאשר, ממשיכים`));
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
  app.replaceChildren(topbar(), h('main', { class: 'scores' },
    h('section', { class: 'card' },
      h('h2', null, `טבלה אחרי סיבוב ${S.round} מתוך ${S.settings.rounds}`),
      h('div', { id: 'sc-table' })),
    h('details', { class: 'card' }, h('summary', null, 'התשובות של הסיבוב'), h('div', { id: 'sc-answers' })),
    h('div', { class: 'sticky-cta', id: 'sc-cta' })));
}
function updateScores() {
  document.getElementById('sc-table').replaceChildren(rankingTable(true));
  document.getElementById('sc-answers').replaceChildren(answersGrid());
  document.getElementById('sc-cta').replaceChildren(isHost()
    ? h('div', { class: 'row' },
      h('button', { class: 'btn primary xl grow', onclick: (e) => { e.currentTarget.disabled = true; action('start'); } }, `🎲 לסיבוב ${S.round + 1}`),
      h('button', { class: 'btn', onclick: () => confirm('לסיים את המשחק עכשיו?') && action('endGame') }, 'סיום משחק'))
    : h('div', { class: 'waiting' }, h('span', { class: 'dots' }), `מחכים ש${pname(S.hostId)} י/תתחיל את הסיבוב הבא`));
}

function answersGrid() {
  const R = S.result; if (!R) return h('div');
  const part = S.participants.filter((id) => R.cells[id]);
  return h('div', { class: 'grid-wrap' }, h('table', { class: 'agrid' },
    h('thead', null, h('tr', null, h('th', null, ''), ...part.map((pid) => h('th', null, pname(pid))))),
    h('tbody', null, ...S.categories.map((cat, ci) => h('tr', null, h('th', null, cat),
      ...part.map((pid) => { const c = R.cells[pid][ci]; const [pts, cls] = STATUS[c.status](c); return h('td', { class: 'st-' + cls }, c.answer || '—', h('small', null, pts)); }))))));
}

// ---------- סיום ----------
function buildFinal() {
  const ranked = [...S.players].sort((a, b) => b.score - a.score);
  const podium = [ranked[1], ranked[0], ranked[2]];
  app.replaceChildren(topbar(), h('main', { class: 'final' },
    h('canvas', { id: 'confetti' }),
    h('h1', { class: 'center' }, '🏆 סוף המשחק!'),
    ranked[0] ? h('p', { class: 'center big-win' }, ranked.filter((p) => p.score === ranked[0].score).length > 1 ? 'תיקו בצמרת!' : `${ranked[0].name} ניצח/ה עם ${ranked[0].score} נקודות`) : null,
    h('div', { class: 'podium' }, ...podium.map((p, i) => p ? h('div', { class: 'pod p' + [2, 1, 3][i] },
      avatar(p.id, 'lg'), h('div', { class: 'pod-name' }, p.name), h('div', { class: 'pod-score' }, p.score),
      h('div', { class: 'pod-block' }, ['🥈', '🥇', '🥉'][i])) : h('div', { class: 'pod empty' }))),
    h('section', { class: 'card' }, h('h2', null, 'הדירוג המלא'), h('div', { id: 'fn-table' })),
    h('section', { class: 'card' }, h('h2', null, 'סיבוב אחרי סיבוב'), h('div', { id: 'fn-hist' })),
    h('div', { class: 'sticky-cta', id: 'fn-cta' })));
  confetti();
}
function updateFinal() {
  document.getElementById('fn-table').replaceChildren(rankingTable(false));
  const ids = [...S.players].sort((a, b) => b.score - a.score).map((p) => p.id);
  document.getElementById('fn-hist').replaceChildren(h('div', { class: 'grid-wrap' }, h('table', { class: 'agrid' },
    h('thead', null, h('tr', null, h('th', null, 'אות'), ...ids.map((id) => h('th', null, pname(id))))),
    h('tbody', null, ...S.history.map((r) => h('tr', null, h('th', null, `${r.round}. ${r.letter}`),
      ...ids.map((id) => h('td', null, r.totals[id] != null ? r.totals[id] : '–'))))))));
  document.getElementById('fn-cta').replaceChildren(isHost()
    ? h('button', { class: 'btn primary xl', onclick: () => action('playAgain') }, '🔄 משחק חדש עם אותם חברים')
    : h('div', { class: 'waiting' }, h('span', { class: 'dots' }), 'המארח/ת יכול/ה לפתוח משחק חדש'));
}

function confetti() {
  const cv = document.getElementById('confetti'); if (!cv) return;
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

// כשחוזרים לטאב – מוודאים שהחיבור חי
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && session && (!es || es.readyState === EventSource.CLOSED)) openStream();
});
window.addEventListener('pagehide', () => flush());

boot();
