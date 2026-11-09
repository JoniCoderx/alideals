// שרת Node עצמאי ל"ארץ עיר" (לשרת משלכם). Node 20+, בלי חבילות.
// הגרסה החיה רצה על Cloudflare (worker.mjs) עם אותו מנוע חדר ואותו פרוטוקול.

import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { randomInt } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Room, cleanName, metaPayload } from './room.mjs';

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');
const ROOM_TTL_MS = 45 * 60_000;

/** @type {Map<string, Room>} */
const rooms = new Map();

function newCode() {
  for (let i = 0; i < 1000; i++) {
    const c = String(randomInt(1000, 10000));
    if (!rooms.has(c)) return c;
  }
  return String(randomInt(10000, 100000));
}

const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const STATIC = new Set(['/index.html', '/style.css', '/app.js', '/icon.svg', '/manifest.webmanifest']);
const cache = new Map();

async function serveStatic(res, pathname) {
  const file = pathname === '/' || /^\/\d{4,5}\/?$/.test(pathname) ? '/index.html' : pathname;
  if (!STATIC.has(file)) return json(res, 404, { error: 'not_found' });
  let body = cache.get(file);
  if (!body || process.env.NODE_ENV === 'development') {
    body = await readFile(path.join(PUBLIC, file));
    cache.set(file, body);
  }
  res.writeHead(200, {
    'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
    'Cache-Control': 'no-cache',
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
    req.on('data', (c) => { size += c.length; if (size > 32_000) { reject(new Error('too_large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch { reject(new Error('bad_json')); } });
    req.on('error', reject);
  });
}

function openStream(req, res, q) {
  const room = rooms.get(String(q.room || ''));
  if (!room) return json(res, 404, { error: 'room_not_found' });
  const me = room.auth(q.pid, q.token);
  if (!me) return json(res, 403, { error: 'not_connected' });
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write('retry: 1500\n\n');
  const sink = {
    send: (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
    close: () => res.end(),
  };
  const disconnect = room.connect(me, sink);
  const ping = setInterval(() => { try { res.write(': ping\n\n'); } catch {} }, 15_000);
  req.on('close', () => { clearInterval(ping); disconnect(); });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    if (req.method === 'GET' && url.pathname === '/api/events') return openStream(req, res, Object.fromEntries(url.searchParams));
    if (req.method === 'GET' && url.pathname === '/api/meta') return json(res, 200, metaPayload());
    if (req.method === 'GET' && url.pathname === '/healthz') return json(res, 200, { ok: true, rooms: rooms.size });
    if (req.method === 'POST' && url.pathname.startsWith('/api/')) {
      const body = await readBody(req);
      if (url.pathname === '/api/create') {
        const name = cleanName(body.name);
        if (!name) return json(res, 400, { error: 'name_required' });
        const room = new Room(newCode(), body.lang === 'en' ? 'en' : 'he');
        rooms.set(room.code, room);
        const p = room.addPlayer(name);
        return json(res, 200, { room: room.code, pid: p.id, token: p.token });
      }
      if (url.pathname === '/api/join') {
        const room = rooms.get(String(body.room || '').trim());
        if (!room) return json(res, 404, { error: 'room_not_found' });
        const r = room.join(body);
        return json(res, r.error ? 400 : 200, r);
      }
      if (url.pathname === '/api/action') {
        const room = rooms.get(String(body.room || ''));
        if (!room) return json(res, 404, { error: 'room_not_found' });
        const me = room.auth(body.pid, body.token);
        if (!me) return json(res, 403, { error: 'not_connected' });
        const err = room.act(me, body);
        if (room.closed) rooms.delete(room.code);
        return json(res, err ? 400 : 200, err ? { error: err } : { ok: true });
      }
      return json(res, 404, { error: 'not_found' });
    }
    if (req.method === 'GET' || req.method === 'HEAD') return await serveStatic(res, url.pathname);
    json(res, 405, { error: 'method' });
  } catch (e) {
    if (!res.headersSent) json(res, 400, { error: e.message || 'error' });
  }
});

setInterval(() => {
  for (const [code, room] of rooms) {
    if (room.closed || (!room.anyoneOnline && Date.now() - room.lastActivity > ROOM_TTL_MS)) { room.dispose(); rooms.delete(code); }
  }
}, 60_000).unref();

server.keepAliveTimeout = 65_000;
server.requestTimeout = 0;
server.listen(PORT, HOST, () => console.log(`ארץ עיר רץ על http://localhost:${PORT}`));
