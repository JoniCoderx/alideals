// שרת "ארץ עיר" אונליין. Node 20+ בלבד, בלי חבילות חיצוניות.
// עדכונים חיים: Server-Sent Events (עובר בכל פרוקסי/נייד), פעולות: POST JSON.

import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { randomBytes, randomInt } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LIMITS, DEFAULT_CATEGORIES, EXTRA_CATEGORIES, HEB_LETTERS,
  defaultSettings, sanitizeSettings, scoreRound, pickLetter,
} from './game.mjs';

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, 'public');

const COUNTDOWN_MS = 3500;   // אנימציית הגרלת אות לפני תחילת הסיבוב
const COLLECT_MS = 1500;     // זמן לאסוף תשובות אחרונות אחרי שהזמן נגמר
const HOST_HANDOFF_MS = 20_000;
const ROOM_TTL_MS = 45 * 60_000;
const COLORS = ['#e8590c', '#1c7ed6', '#2f9e44', '#c2255c', '#7048e8', '#0c8599', '#f08c00', '#5c940d',
  '#d6336c', '#3b5bdb', '#099268', '#ae3ec9', '#e67700', '#1971c2', '#c92a2a', '#495057'];

/** @type {Map<string, any>} */
const rooms = new Map();

// ---------- עזר ----------
const now = () => Date.now();
const token = () => randomBytes(16).toString('hex');
const cleanName = (s) => String(s ?? '').replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, LIMITS.maxNameLen);

function newCode() {
  for (let i = 0; i < 1000; i++) {
    const c = String(randomInt(1000, 10000));
    if (!rooms.has(c)) return c;
  }
  return String(randomInt(10000, 100000));
}

function createRoom() {
  const room = {
    code: newCode(),
    hostId: null,
    players: new Map(), // id -> player
    settings: defaultSettings(),
    phase: 'lobby',    // lobby | countdown | playing | collecting | review | scores | final
    round: 0,
    letter: null,
    usedLetters: [],
    startsAt: 0,
    endsAt: 0,
    stoppedBy: null,
    categories: [],    // צילום הקטגוריות של הסיבוב הנוכחי
    participants: [],
    answers: {},       // pid -> string[]
    votes: {},         // "pid|ci" -> pid[]
    result: null,      // תוצאת scoreRound של הסיבוב האחרון
    history: [],       // [{round, letter, totals}]
    timer: null,
    lastActivity: now(),
    pending: null,
  };
  rooms.set(room.code, room);
  return room;
}

function addPlayer(room, name) {
  const used = new Set([...room.players.values()].map((p) => p.color));
  const player = {
    id: token().slice(0, 10),
    token: token(),
    name,
    color: COLORS.find((c) => !used.has(c)) || COLORS[room.players.size % COLORS.length],
    score: 0,
    conns: new Set(),
    lastSeen: now(),
    joinedAt: now(),
  };
  room.players.set(player.id, player);
  if (!room.hostId) room.hostId = player.id;
  return player;
}

const isOnline = (p) => p.conns.size > 0;

// ---------- מצב שנשלח ללקוח ----------
function viewFor(room, me) {
  const playing = room.phase === 'countdown' || room.phase === 'playing' || room.phase === 'collecting';
  const players = [...room.players.values()].map((p) => ({
    id: p.id,
    name: p.name,
    color: p.color,
    score: p.score,
    online: isOnline(p),
    inRound: room.participants.includes(p.id),
    filled: playing && room.participants.includes(p.id)
      ? (room.answers[p.id] || []).filter((a) => a && a.trim()).length : null,
  }));
  const v = {
    serverNow: now(),
    code: room.code,
    you: me.id,
    hostId: room.hostId,
    players,
    settings: room.settings,
    phase: room.phase,
    round: room.round,
    letter: room.phase === 'countdown' ? null : room.letter,
    startsAt: room.startsAt,
    endsAt: room.endsAt,
    stoppedBy: room.stoppedBy,
    categories: room.categories,
    participants: room.participants,
    history: room.history,
  };
  if (playing) v.myAnswers = room.answers[me.id] || [];
  if (room.phase === 'countdown') v.pendingLetter = null; // האות נחשפת רק כשמתחילים
  if (room.phase === 'review' || room.phase === 'scores' || room.phase === 'final') {
    v.result = room.result;
    v.votes = room.votes;
  }
  return v;
}

function send(res, event, data) {
  try { res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); } catch { /* חיבור נסגר */ }
}

function broadcastNow(room) {
  room.pending = null;
  for (const p of room.players.values()) {
    if (!p.conns.size) continue;
    const v = viewFor(room, p);
    for (const res of p.conns) send(res, 'state', v);
  }
}

function broadcast(room, immediate = false) {
  room.lastActivity = now();
  if (immediate) return broadcastNow(room);
  if (room.pending) return;
  room.pending = setTimeout(() => broadcastNow(room), 120);
}

// ---------- מעברי שלבים ----------
function clearTimer(room) {
  if (room.timer) clearTimeout(room.timer);
  room.timer = null;
}

function startRound(room) {
  clearTimer(room);
  const online = [...room.players.values()].filter(isOnline);
  if (!online.length) return;
  room.round += 1;
  room.letter = pickLetter(room.settings.letters, room.usedLetters);
  room.usedLetters.push(room.letter);
  room.categories = [...room.settings.categories];
  room.participants = online.map((p) => p.id);
  room.answers = {};
  room.votes = {};
  room.result = null;
  room.stoppedBy = null;
  room.phase = 'countdown';
  room.startsAt = now() + COUNTDOWN_MS;
  room.endsAt = room.startsAt + room.settings.roundSeconds * 1000;
  room.timer = setTimeout(() => {
    room.phase = 'playing';
    broadcast(room, true);
    scheduleEnd(room);
  }, COUNTDOWN_MS);
  broadcast(room, true);
}

function scheduleEnd(room) {
  clearTimer(room);
  room.timer = setTimeout(() => endRound(room), Math.max(0, room.endsAt - now()));
}

function endRound(room) {
  if (room.phase !== 'playing' && room.phase !== 'countdown') return;
  clearTimer(room);
  room.phase = 'collecting';
  room.endsAt = now();
  broadcast(room, true);
  room.timer = setTimeout(() => {
    room.phase = 'review';
    recompute(room);
    broadcast(room, true);
  }, COLLECT_MS);
}

function recompute(room) {
  room.result = scoreRound({
    letter: room.letter,
    categories: room.categories,
    participants: room.participants,
    answers: room.answers,
    votes: room.votes,
    soloBonus: room.settings.soloBonus,
  });
}

function finishReview(room) {
  recompute(room);
  for (const [pid, pts] of Object.entries(room.result.totals)) {
    const p = room.players.get(pid);
    if (p) p.score += pts;
  }
  room.history.push({ round: room.round, letter: room.letter, totals: room.result.totals });
  room.phase = room.round >= room.settings.rounds ? 'final' : 'scores';
  broadcast(room, true);
}

function resetGame(room) {
  clearTimer(room);
  for (const p of room.players.values()) p.score = 0;
  Object.assign(room, {
    phase: 'lobby', round: 0, letter: null, usedLetters: [], startsAt: 0, endsAt: 0, stoppedBy: null,
    categories: [], participants: [], answers: {}, votes: {}, result: null, history: [],
  });
  // שחקנים שלא מחוברים יוצאים בין משחקים
  for (const [id, p] of room.players) if (!isOnline(p)) room.players.delete(id);
  ensureHost(room);
  broadcast(room, true);
}

function ensureHost(room) {
  const host = room.players.get(room.hostId);
  if (host && (isOnline(host) || now() - host.lastSeen < HOST_HANDOFF_MS)) return false;
  const next = [...room.players.values()].filter(isOnline).sort((a, b) => a.joinedAt - b.joinedAt)[0];
  if (next && next.id !== room.hostId) { room.hostId = next.id; return true; }
  if (!host && !next) room.hostId = [...room.players.keys()][0] || null;
  return false;
}

function removePlayer(room, pid) {
  const p = room.players.get(pid);
  if (!p) return;
  for (const res of p.conns) { send(res, 'kicked', {}); try { res.end(); } catch {} }
  room.players.delete(pid);
  room.participants = room.participants.filter((x) => x !== pid);
  delete room.answers[pid];
  if (room.hostId === pid) { room.hostId = null; ensureHost(room); }
  if (room.phase === 'review') recompute(room);
  if (!room.players.size) { clearTimer(room); rooms.delete(room.code); return; }
  broadcast(room, true);
}

// ---------- פעולות ----------
function act(room, me, a) {
  const isHost = room.hostId === me.id;
  switch (a.type) {
    case 'settings': {
      if (!isHost || room.phase !== 'lobby') return 'רק המארח יכול לשנות הגדרות';
      room.settings = sanitizeSettings(a.settings || {}, room.settings);
      break;
    }
    case 'start': {
      if (!isHost) return 'רק המארח יכול להתחיל';
      if (room.phase !== 'lobby' && room.phase !== 'scores') return 'אי אפשר להתחיל עכשיו';
      startRound(room);
      return null;
    }
    case 'answers': {
      if (!['countdown', 'playing', 'collecting'].includes(room.phase)) return null;
      if (!room.participants.includes(me.id) || !Array.isArray(a.answers)) return null;
      room.answers[me.id] = room.categories.map((_, i) =>
        String(a.answers[i] ?? '').replace(/[\u0000-\u001f]/g, '').slice(0, LIMITS.maxAnswerLen));
      break;
    }
    case 'stop': {
      if (room.phase !== 'playing' || !room.settings.stopEnabled) return null;
      if (!room.participants.includes(me.id) || room.stoppedBy) return null;
      const mine = room.answers[me.id] || [];
      if (room.categories.some((_, i) => !String(mine[i] ?? '').trim())) return 'צריך למלא את כל השדות כדי לעצור';
      room.stoppedBy = me.id;
      room.endsAt = Math.min(room.endsAt, now() + room.settings.stopGrace * 1000);
      scheduleEnd(room);
      broadcast(room, true);
      return null;
    }
    case 'endNow': {
      if (!isHost || room.phase !== 'playing') return null;
      endRound(room);
      return null;
    }
    case 'vote': {
      if (room.phase !== 'review' || !room.participants.includes(me.id)) return null;
      const target = String(a.target), ci = Number(a.ci);
      if (target === me.id || !room.participants.includes(target) || !(ci >= 0 && ci < room.categories.length)) return null;
      const key = `${target}|${ci}`;
      const list = new Set(room.votes[key] || []);
      if (list.has(me.id)) list.delete(me.id); else list.add(me.id);
      room.votes[key] = [...list];
      recompute(room);
      break;
    }
    case 'finishReview': {
      if (!isHost || room.phase !== 'review') return null;
      finishReview(room);
      return null;
    }
    case 'endGame': {
      if (!isHost || room.phase !== 'scores') return null;
      room.phase = 'final';
      break;
    }
    case 'playAgain': {
      if (!isHost || (room.phase !== 'final' && room.phase !== 'scores')) return null;
      resetGame(room);
      return null;
    }
    case 'kick': {
      if (!isHost || String(a.target) === me.id) return null;
      removePlayer(room, String(a.target));
      return null;
    }
    case 'makeHost': {
      if (!isHost || !room.players.has(String(a.target))) return null;
      room.hostId = String(a.target);
      break;
    }
    case 'leave': {
      removePlayer(room, me.id);
      return null;
    }
    case 'rename': {
      const n = cleanName(a.name);
      if (n) me.name = n;
      break;
    }
    default:
      return 'פעולה לא מוכרת';
  }
  broadcast(room);
  return null;
}

// ---------- HTTP ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const STATIC = new Set(['/index.html', '/style.css', '/app.js', '/icon.svg', '/manifest.webmanifest']);
const cache = new Map();

async function serveStatic(req, res, pathname) {
  const file = pathname === '/' || /^\/\d{4,5}\/?$/.test(pathname) ? '/index.html' : pathname;
  if (!STATIC.has(file)) return json(res, 404, { error: 'לא נמצא' });
  let body = cache.get(file);
  if (!body || process.env.NODE_ENV === 'development') {
    body = await readFile(path.join(PUBLIC, file));
    cache.set(file, body);
  }
  res.writeHead(200, {
    'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
    'Cache-Control': file === '/index.html' ? 'no-cache' : 'public, max-age=300',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(body);
}

function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > 32_000) { reject(new Error('גדול מדי')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch { reject(new Error('JSON לא תקין')); } });
    req.on('error', reject);
  });
}

function auth(q) {
  const room = rooms.get(String(q.room || ''));
  if (!room) return { error: 'החדר לא קיים (אולי נסגר). פתחו חדר חדש.' };
  const me = room.players.get(String(q.pid || ''));
  if (!me || me.token !== q.token) return { error: 'לא מחובר לחדר', room };
  return { room, me };
}

function openStream(req, res, q) {
  const { room, me, error } = auth(q);
  if (error) return json(res, 403, { error });
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write('retry: 1500\n\n');
  me.conns.add(res);
  me.lastSeen = now();
  ensureHost(room);
  send(res, 'state', viewFor(room, me));
  broadcast(room);
  const ping = setInterval(() => { try { res.write(`: ping\n\n`); } catch {} }, 15_000);
  req.on('close', () => {
    clearInterval(ping);
    me.conns.delete(res);
    me.lastSeen = now();
    if (!rooms.has(room.code)) return;
    broadcast(room);
    if (room.hostId === me.id && !isOnline(me)) {
      setTimeout(() => { if (rooms.has(room.code) && ensureHost(room)) broadcast(room); }, HOST_HANDOFF_MS + 500);
    }
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    const q = Object.fromEntries(url.searchParams);
    if (req.method === 'GET' && url.pathname === '/api/events') return openStream(req, res, q);
    if (req.method === 'GET' && url.pathname === '/api/meta') {
      return json(res, 200, { defaults: DEFAULT_CATEGORIES, extras: EXTRA_CATEGORIES, letters: HEB_LETTERS, limits: LIMITS });
    }
    if (req.method === 'GET' && url.pathname === '/healthz') return json(res, 200, { ok: true, rooms: rooms.size });
    if (req.method === 'POST' && url.pathname.startsWith('/api/')) {
      const body = await readBody(req);
      if (url.pathname === '/api/create') {
        const name = cleanName(body.name);
        if (!name) return json(res, 400, { error: 'צריך שם' });
        const room = createRoom();
        const p = addPlayer(room, name);
        return json(res, 200, { room: room.code, pid: p.id, token: p.token });
      }
      if (url.pathname === '/api/join') {
        const room = rooms.get(String(body.room || '').trim());
        if (!room) return json(res, 404, { error: 'אין חדר עם הקוד הזה' });
        const existing = room.players.get(String(body.pid || ''));
        if (existing && existing.token === body.token) {
          const n = cleanName(body.name); if (n) existing.name = n;
          return json(res, 200, { room: room.code, pid: existing.id, token: existing.token });
        }
        const name = cleanName(body.name);
        if (!name) return json(res, 400, { error: 'צריך שם' });
        if (room.players.size >= LIMITS.maxPlayers) return json(res, 409, { error: 'החדר מלא' });
        const p = addPlayer(room, name);
        broadcast(room);
        return json(res, 200, { room: room.code, pid: p.id, token: p.token });
      }
      if (url.pathname === '/api/action') {
        const { room, me, error } = auth(body);
        if (error) return json(res, 403, { error });
        me.lastSeen = now();
        const err = act(room, me, body);
        return json(res, err ? 400 : 200, err ? { error: err } : { ok: true });
      }
      return json(res, 404, { error: 'לא נמצא' });
    }
    if (req.method === 'GET' || req.method === 'HEAD') return await serveStatic(req, res, url.pathname);
    json(res, 405, { error: 'שיטה לא נתמכת' });
  } catch (e) {
    if (!res.headersSent) json(res, 400, { error: e.message || 'שגיאה' });
  }
});

// ניקוי חדרים נטושים
setInterval(() => {
  for (const [code, room] of rooms) {
    const anyone = [...room.players.values()].some(isOnline);
    if (!anyone && now() - room.lastActivity > ROOM_TTL_MS) { clearTimer(room); rooms.delete(code); }
  }
}, 60_000).unref();

server.keepAliveTimeout = 65_000;
server.requestTimeout = 0; // SSE חי לאורך זמן
server.listen(PORT, HOST, () => {
  console.log(`ארץ עיר רץ על http://localhost:${PORT}`);
});
