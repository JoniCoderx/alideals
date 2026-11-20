// "ארץ עיר" על Cloudflare: ה-Worker מגיש את הקבצים ומנתב כל חדר ל-Durable Object משלו.
// ה-DO מריץ את אותו מנוע חדר (room.mjs) כמו שרת ה-Node, עם אותו פרוטוקול (SSE + POST).

import { Room, cleanName, metaPayload } from './room.mjs';
import { renderIndex, robotsTxt, sitemapXml } from './seo.mjs';

const json = (status, data) => new Response(JSON.stringify(data), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
});

function randomCode() {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return String(1000 + (a[0] % 9000));
}

const text = (body, type) => new Response(body, { headers: { 'Content-Type': type, 'Cache-Control': 'public, max-age=3600' } });
const roomStub = (env, code) => env.ROOMS.get(env.ROOMS.idFromName(code));

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const p = url.pathname;

    if (p === '/api/meta') return json(200, metaPayload());
    if (p === '/healthz') return json(200, { ok: true });

    if (p === '/api/events' && req.method === 'GET') {
      const code = url.searchParams.get('room') || '';
      if (!/^\d{4,5}$/.test(code)) return json(404, { error: 'room_not_found' });
      return roomStub(env, code).fetch(req);
    }

    if (p.startsWith('/api/') && req.method === 'POST') {
      let body;
      try { body = JSON.parse(await req.text() || '{}'); } catch { return json(400, { error: 'bad_json' }); }
      if (p === '/api/create') {
        if (!cleanName(body.name)) return json(400, { error: 'name_required' });
        for (let i = 0; i < 8; i++) {
          const code = randomCode();
          const r = await roomStub(env, code).fetch('https://room/create', { method: 'POST', body: JSON.stringify({ ...body, code }) });
          if (r.status !== 409) return r;
        }
        return json(503, { error: 'busy' });
      }
      const code = String(body.room || '').trim();
      if (!/^\d{4,5}$/.test(code)) return json(404, { error: 'room_not_found' });
      return roomStub(env, code).fetch('https://room' + p, { method: 'POST', body: JSON.stringify(body) });
    }

    if (p.startsWith('/api/')) return json(404, { error: 'not_found' });

    if (p === '/robots.txt') return text(robotsTxt(url.origin), 'text/plain; charset=utf-8');
    if (p === '/sitemap.xml') return text(sitemapXml(url.origin), 'application/xml; charset=utf-8');

    // דף הבית וקישורי חדר (/1234): index.html עם כתובות מלאות ותצוגה מקדימה מותאמת
    const roomMatch = p.match(/^\/(\d{4,5})\/?$/);
    if (p === '/' || p === '/index.html' || roomMatch) {
      const asset = await env.ASSETS.fetch(new Request(new URL('/', url), { method: 'GET' }));
      let room = null;
      if (roomMatch) {
        room = { code: roomMatch[1] };
        try {
          const r = await roomStub(env, roomMatch[1]).fetch('https://room/preview');
          if (r.ok) Object.assign(room, await r.json());
        } catch {}
      }
      const lang = url.searchParams.get('lang') === 'en' || (room && room.lang === 'en' && !url.searchParams.get('lang')) ? 'en' : 'he';
      const html = renderIndex(await asset.text(), { origin: url.origin, lang, room });
      const headers = { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' };
      if (room) headers['X-Robots-Tag'] = 'noindex';
      return new Response(req.method === 'HEAD' ? null : html, { headers });
    }
    return env.ASSETS.fetch(req);
  },
};

export class RoomDO {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    /** @type {Room|null} */
    this.room = null;
  }

  async fetch(req) {
    const url = new URL(req.url);
    const p = url.pathname;

    if (p === '/create') {
      const body = await req.json();
      if (this.room && !this.room.closed && this.room.players.size) return json(409, { error: 'taken' });
      this.room = new Room(body.code, body.lang === 'en' ? 'en' : 'he');
      const pl = this.room.addPlayer(cleanName(body.name));
      return json(200, { room: this.room.code, pid: pl.id, token: pl.token });
    }

    const room = this.room && !this.room.closed ? this.room : null;

    if (p === '/preview') {
      if (!room) return json(404, { error: 'room_not_found' });
      const host = room.players.get(room.hostId);
      return json(200, { host: host ? host.name : null, players: room.players.size, lang: room.settings.lang });
    }

    if (p === '/api/events') {
      if (!room) return json(404, { error: 'room_not_found' });
      const me = room.auth(url.searchParams.get('pid'), url.searchParams.get('token'));
      if (!me) return json(403, { error: 'not_connected' });
      const { readable, writable } = new TransformStream();
      const writer = writable.getWriter();
      const enc = new TextEncoder();
      let disconnect = () => {};
      let ping = null;
      let dead = false;
      const kill = () => {
        if (dead) return;
        dead = true;
        clearInterval(ping);
        disconnect();
        writer.close().catch(() => {});
      };
      const write = (s) => { if (!dead) writer.write(enc.encode(s)).catch(kill); };
      const sink = {
        send: (event, data) => write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        close: kill,
      };
      write('retry: 1500\n\n');
      disconnect = room.connect(me, sink);
      ping = setInterval(() => write(': ping\n\n'), 15_000);
      req.signal?.addEventListener?.('abort', kill);
      return new Response(readable, {
        headers: {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          'X-Accel-Buffering': 'no',
        },
      });
    }

    const body = await req.json().catch(() => ({}));
    if (!room) return json(404, { error: 'room_not_found' });

    if (p === '/api/join') {
      const r = room.join(body);
      return json(r.error ? 400 : 200, r);
    }
    if (p === '/api/action') {
      const me = room.auth(body.pid, body.token);
      if (!me) return json(403, { error: 'not_connected' });
      const err = room.act(me, body);
      return json(err ? 400 : 200, err ? { error: err } : { ok: true });
    }
    return json(404, { error: 'not_found' });
  }
}
