// מנוע חדר: כל המצב והחוקים של חדר אחד. לא יודע כלום על HTTP –
// השרת (Node או Cloudflare Durable Object) מחבר אליו "צינורות" (sink) שדרכם נשלחים עדכונים.
// שגיאות מוחזרות כקודים (למשל 'not_host'); הלקוח מתרגם אותם לשפה שלו.

import { LIMITS, LANGS, defaultSettings, sanitizeSettings, scoreRound, pickLetter } from './game.mjs';

const COUNTDOWN_MS = 3500;
const COLLECT_MS = 1500;
const HOST_HANDOFF_MS = 20_000;
const COLORS = ['#e8590c', '#1c7ed6', '#2f9e44', '#c2255c', '#7048e8', '#0c8599', '#f08c00', '#5c940d',
  '#d6336c', '#3b5bdb', '#099268', '#ae3ec9', '#e67700', '#1971c2', '#c92a2a', '#495057'];

const now = () => Date.now();
function rid(bytes = 16) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return [...a].map((b) => b.toString(16).padStart(2, '0')).join('');
}
export const cleanName = (s) => String(s ?? '').replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, LIMITS.maxNameLen);

export class Room {
  constructor(code, lang = 'he') {
    this.code = code;
    this.hostId = null;
    this.players = new Map();
    this.settings = defaultSettings(lang);
    this.phase = 'lobby'; // lobby | countdown | playing | collecting | review | scores | final
    this.round = 0;
    this.roundId = null;
    this.letter = null;
    this.usedLetters = [];
    this.startsAt = 0;
    this.endsAt = 0;
    this.stoppedBy = null;
    this.categories = [];
    this.participants = [];
    this.answers = {};
    this.votes = {};
    this.ready = new Set();
    this.result = null;
    this.history = [];
    this.timer = null;
    this.pending = null;
    this.lastActivity = now();
    this.closed = false;
  }

  // ---------- שחקנים ----------
  addPlayer(name) {
    const used = new Set([...this.players.values()].map((p) => p.color));
    const p = {
      id: rid(5), token: rid(16), name,
      color: COLORS.find((c) => !used.has(c)) || COLORS[this.players.size % COLORS.length],
      score: 0, conns: new Set(), lastSeen: now(), joinedAt: now(),
    };
    this.players.set(p.id, p);
    if (!this.hostId) this.hostId = p.id;
    this.broadcast();
    return p;
  }

  /** הצטרפות חדשה או חזרה עם pid+token. מחזיר {pid, token} או {error}. */
  join({ pid, token, name }) {
    const existing = this.players.get(String(pid || ''));
    if (existing && existing.token === token) {
      const n = cleanName(name); if (n) existing.name = n;
      return { room: this.code, pid: existing.id, token: existing.token };
    }
    const n = cleanName(name);
    if (!n) return { error: 'name_required' };
    if (this.players.size >= LIMITS.maxPlayers) return { error: 'room_full' };
    const p = this.addPlayer(n);
    return { room: this.code, pid: p.id, token: p.token };
  }

  auth(pid, token) {
    const p = this.players.get(String(pid || ''));
    return p && p.token === token ? p : null;
  }

  isOnline(p) { return p.conns.size > 0; }
  get anyoneOnline() { return [...this.players.values()].some((p) => this.isOnline(p)); }

  /** מחבר צינור עדכונים. sink = {send(event, data)}. מחזיר פונקציית ניתוק. */
  connect(me, sink) {
    me.conns.add(sink);
    me.lastSeen = now();
    this.ensureHost();
    sink.send('state', this.viewFor(me));
    this.broadcast();
    return () => {
      if (!me.conns.delete(sink)) return;
      me.lastSeen = now();
      if (this.closed) return;
      this.broadcast();
      if (this.hostId === me.id && !this.isOnline(me)) {
        setTimeout(() => { if (!this.closed && this.ensureHost()) this.broadcast(); }, HOST_HANDOFF_MS + 500);
      }
      // אם כולם ענו "סיימתי לבדוק" חוץ ממי שהתנתק – ממשיכים
      if (this.phase === 'review') this.maybeAutoFinish();
    };
  }

  ensureHost() {
    const host = this.players.get(this.hostId);
    if (host && (this.isOnline(host) || now() - host.lastSeen < HOST_HANDOFF_MS)) return false;
    const next = [...this.players.values()].filter((p) => this.isOnline(p)).sort((a, b) => a.joinedAt - b.joinedAt)[0];
    if (next && next.id !== this.hostId) { this.hostId = next.id; return true; }
    if (!host && !next) this.hostId = [...this.players.keys()][0] || null;
    return false;
  }

  removePlayer(pid) {
    const p = this.players.get(pid);
    if (!p) return;
    for (const sink of p.conns) { try { sink.send('kicked', {}); sink.close?.(); } catch {} }
    p.conns.clear();
    this.players.delete(pid);
    this.participants = this.participants.filter((x) => x !== pid);
    delete this.answers[pid];
    this.ready.delete(pid);
    if (this.hostId === pid) { this.hostId = null; this.ensureHost(); }
    if (!this.players.size) { this.dispose(); return; }
    if (this.phase === 'review') { this.recompute(); this.maybeAutoFinish(); }
    this.broadcast(true);
  }

  dispose() {
    this.closed = true;
    this.clearTimer();
    if (this.pending) clearTimeout(this.pending);
  }

  // ---------- מצב שנשלח ללקוח ----------
  viewFor(me) {
    const playing = this.phase === 'countdown' || this.phase === 'playing' || this.phase === 'collecting';
    const v = {
      serverNow: now(),
      code: this.code,
      you: me.id,
      hostId: this.hostId,
      players: [...this.players.values()].map((p) => ({
        id: p.id, name: p.name, color: p.color, score: p.score,
        online: this.isOnline(p),
        inRound: this.participants.includes(p.id),
        ready: this.ready.has(p.id),
        filled: playing && this.participants.includes(p.id)
          ? (this.answers[p.id] || []).filter((a) => a && a.trim()).length : null,
      })),
      settings: this.settings,
      phase: this.phase,
      round: this.round,
      roundId: this.roundId || null,
      letter: this.phase === 'countdown' ? null : this.letter,
      startsAt: this.startsAt,
      endsAt: this.endsAt,
      stoppedBy: this.stoppedBy,
      categories: this.categories,
      participants: this.participants,
      history: this.history,
    };
    if (playing) v.myAnswers = this.answers[me.id] || [];
    if (this.phase === 'review' || this.phase === 'scores' || this.phase === 'final') {
      v.result = this.result;
      v.votes = this.votes;
    }
    return v;
  }

  broadcastNow() {
    this.pending = null;
    if (this.closed) return;
    for (const p of this.players.values()) {
      if (!p.conns.size) continue;
      const v = this.viewFor(p);
      for (const sink of p.conns) { try { sink.send('state', v); } catch {} }
    }
  }

  broadcast(immediate = false) {
    this.lastActivity = now();
    if (immediate) { if (this.pending) clearTimeout(this.pending); return this.broadcastNow(); }
    if (this.pending) return;
    this.pending = setTimeout(() => this.broadcastNow(), 100);
  }

  // ---------- שלבים ----------
  clearTimer() { if (this.timer) clearTimeout(this.timer); this.timer = null; }

  startRound() {
    this.clearTimer();
    const online = [...this.players.values()].filter((p) => this.isOnline(p));
    if (!online.length) return;
    this.round += 1;
    this.roundId = rid(6); // מזהה ייחודי לסיבוב: לא חוזר גם במשחק חדש באותו חדר
    this.letter = pickLetter(this.settings.letters, this.usedLetters);
    this.usedLetters.push(this.letter);
    this.categories = [...this.settings.categories];
    this.participants = online.map((p) => p.id);
    this.answers = {};
    this.votes = {};
    this.ready = new Set();
    this.result = null;
    this.stoppedBy = null;
    this.phase = 'countdown';
    this.startsAt = now() + COUNTDOWN_MS;
    this.endsAt = this.startsAt + this.settings.roundSeconds * 1000;
    this.timer = setTimeout(() => {
      this.phase = 'playing';
      this.broadcast(true);
      this.scheduleEnd();
    }, COUNTDOWN_MS);
    this.broadcast(true);
  }

  scheduleEnd() {
    this.clearTimer();
    this.timer = setTimeout(() => this.endRound(), Math.max(0, this.endsAt - now()));
  }

  endRound() {
    if (this.phase !== 'playing' && this.phase !== 'countdown') return;
    this.clearTimer();
    this.phase = 'collecting';
    this.endsAt = now();
    this.broadcast(true);
    this.timer = setTimeout(() => {
      this.phase = 'review';
      this.recompute();
      this.broadcast(true);
    }, COLLECT_MS);
  }

  recompute() {
    this.result = scoreRound({
      letter: this.letter, categories: this.categories, participants: this.participants,
      answers: this.answers, votes: this.votes, soloBonus: this.settings.soloBonus,
    });
  }

  maybeAutoFinish() {
    if (this.phase !== 'review') return;
    const online = this.participants.map((id) => this.players.get(id)).filter((p) => p && this.isOnline(p));
    if (online.length && online.every((p) => this.ready.has(p.id))) this.finishReview();
  }

  finishReview() {
    if (this.phase !== 'review') return;
    this.recompute();
    for (const [pid, pts] of Object.entries(this.result.totals)) {
      const p = this.players.get(pid);
      if (p) p.score += pts;
    }
    this.history.push({ round: this.round, letter: this.letter, totals: this.result.totals });
    this.phase = this.round >= this.settings.rounds ? 'final' : 'scores';
    this.broadcast(true);
  }

  resetGame() {
    this.clearTimer();
    for (const p of this.players.values()) p.score = 0;
    Object.assign(this, {
      phase: 'lobby', round: 0, roundId: null, letter: null, usedLetters: [], startsAt: 0, endsAt: 0, stoppedBy: null,
      categories: [], participants: [], answers: {}, votes: {}, ready: new Set(), result: null, history: [],
    });
    for (const [id, p] of this.players) if (!this.isOnline(p)) this.players.delete(id);
    this.ensureHost();
    this.broadcast(true);
  }

  // ---------- פעולות ----------
  /** מחזיר קוד שגיאה או null. */
  act(me, a) {
    me.lastSeen = now();
    const isHost = this.hostId === me.id;
    switch (a.type) {
      case 'settings': {
        if (!isHost) return 'not_host';
        if (this.phase !== 'lobby') return 'bad_phase';
        this.settings = sanitizeSettings(a.settings || {}, this.settings);
        break;
      }
      case 'start': {
        if (!isHost) return 'not_host';
        if (this.phase !== 'lobby' && this.phase !== 'scores') return 'bad_phase';
        this.startRound();
        return null;
      }
      case 'answers': {
        if (!['countdown', 'playing', 'collecting'].includes(this.phase)) return null;
        if (!this.participants.includes(me.id) || !Array.isArray(a.answers)) return null;
        this.answers[me.id] = this.categories.map((_, i) =>
          String(a.answers[i] ?? '').replace(/[\u0000-\u001f]/g, '').slice(0, LIMITS.maxAnswerLen));
        break;
      }
      case 'stop': {
        if (this.phase !== 'playing' || !this.settings.stopEnabled) return null;
        if (!this.participants.includes(me.id) || this.stoppedBy) return null;
        const mine = this.answers[me.id] || [];
        if (this.categories.some((_, i) => !String(mine[i] ?? '').trim())) return 'fill_all';
        this.stoppedBy = me.id;
        this.endsAt = Math.min(this.endsAt, now() + this.settings.stopGrace * 1000);
        this.scheduleEnd();
        this.broadcast(true);
        return null;
      }
      case 'endNow': {
        if (!isHost || this.phase !== 'playing') return null;
        this.endRound();
        return null;
      }
      case 'vote': {
        if (this.phase !== 'review' || !this.participants.includes(me.id)) return null;
        const target = String(a.target), ci = Number(a.ci);
        if (target === me.id || !this.participants.includes(target) || !(ci >= 0 && ci < this.categories.length)) return null;
        const key = `${target}|${ci}`;
        const list = new Set(this.votes[key] || []);
        if (list.has(me.id)) list.delete(me.id); else list.add(me.id);
        this.votes[key] = [...list];
        this.recompute();
        break;
      }
      case 'ready': {
        if (this.phase !== 'review' || !this.participants.includes(me.id)) return null;
        if (a.value === false) this.ready.delete(me.id); else this.ready.add(me.id);
        this.maybeAutoFinish();
        break;
      }
      case 'finishReview': {
        if (!isHost || this.phase !== 'review') return null;
        this.finishReview();
        return null;
      }
      case 'endGame': {
        if (!isHost || this.phase !== 'scores') return null;
        this.phase = 'final';
        break;
      }
      case 'playAgain': {
        if (!isHost || (this.phase !== 'final' && this.phase !== 'scores')) return null;
        this.resetGame();
        return null;
      }
      case 'kick': {
        if (!isHost || String(a.target) === me.id) return null;
        this.removePlayer(String(a.target));
        return null;
      }
      case 'makeHost': {
        if (!isHost || !this.players.has(String(a.target))) return null;
        this.hostId = String(a.target);
        break;
      }
      case 'leave': {
        this.removePlayer(me.id);
        return null;
      }
      case 'bye': {
        // הדף נסגר: מנתקים מיד את החיבורים במקום לחכות שהחיבור יתגלה כמת
        for (const sink of [...me.conns]) { try { sink.close?.(); } catch {} }
        return null;
      }
      case 'rename': {
        const n = cleanName(a.name);
        if (n) me.name = n;
        break;
      }
      default:
        return 'unknown_action';
    }
    this.broadcast();
    return null;
  }
}

export function metaPayload() {
  return {
    langs: Object.fromEntries(Object.entries(LANGS).map(([k, v]) => [k, { letters: v.letters, defaultLetters: v.defaultLetters, categories: v.categories, extras: v.extras }])),
    limits: LIMITS,
  };
}
