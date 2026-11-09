import test from 'node:test';
import assert from 'node:assert/strict';
import { Room } from './room.mjs';

const sink = () => { const s = { msgs: [], send: (e, d) => s.msgs.push([e, d]) }; return s; };
const last = (s) => s.msgs.filter(([e]) => e === 'state').at(-1)[1];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

test('room: join, play, stop, review with ready auto-finish', async (t) => {
  const room = new Room('1234', 'en');
  t.after(() => room.dispose());
  const a = room.addPlayer('Ann');
  const bj = room.join({ name: 'Bob' });
  const b = room.auth(bj.pid, bj.token);
  assert.ok(b);
  assert.equal(room.join({ pid: bj.pid, token: 'wrong', name: '' }).error, 'name_required');
  const sa = sink(), sb = sink();
  room.connect(a, sa); room.connect(b, sb);
  assert.equal(room.act(b, { type: 'start' }), 'not_host');
  room.act(a, { type: 'settings', settings: { roundSeconds: 30, stopGrace: 0, categories: ['Country', 'City'] } });
  assert.equal(room.act(a, { type: 'start' }), null);
  assert.equal(room.phase, 'countdown');
  assert.equal(last(sb).letter, null); // letter hidden during countdown
  room.phase = 'playing'; room.clearTimer(); // skip the countdown
  const L = room.letter;
  room.act(a, { type: 'answers', answers: [L + 'aaa', L + 'bbb'] });
  room.act(b, { type: 'answers', answers: [L + 'aaa', ''] });
  assert.equal(room.act(b, { type: 'stop' }), 'fill_all');
  assert.equal(room.act(a, { type: 'stop' }), null);
  await wait(1700); // stopGrace 0 + collect 1.5s
  assert.equal(room.phase, 'review');
  const v = last(sb);
  assert.deepEqual(v.result.totals, { [a.id]: 5 + 15, [b.id]: 5 });
  room.act(a, { type: 'ready' });
  assert.equal(room.phase, 'review');
  room.act(b, { type: 'ready' });
  assert.equal(room.phase, 'scores');
  assert.equal(a.score, 20);
});

test('room: kick removes the player and notifies them', (t) => {
  const room = new Room('5555');
  t.after(() => room.dispose());
  const a = room.addPlayer('א');
  const b = room.addPlayer('ב');
  const sb = sink();
  room.connect(b, sb);
  room.act(a, { type: 'kick', target: b.id });
  assert.ok(!room.players.has(b.id));
  assert.ok(sb.msgs.some(([e]) => e === 'kicked'));
});

test('room: bye drops the connection right away', (t) => {
  const room = new Room('7777');
  t.after(() => room.dispose());
  const a = room.addPlayer('A');
  const b = room.addPlayer('B');
  let disconnect;
  const sb = { send() {}, close: () => disconnect() };
  disconnect = room.connect(b, sb);
  room.connect(a, { send() {} });
  assert.ok(room.isOnline(b));
  room.act(b, { type: 'bye' });
  assert.ok(!room.isOnline(b));
  assert.ok(room.isOnline(a));
});

test('room: every round gets a fresh roundId, also after "play again"', (t) => {
  const room = new Room('8888');
  t.after(() => room.dispose());
  const a = room.addPlayer('A');
  room.connect(a, { send() {} });
  room.act(a, { type: 'start' });
  const first = room.roundId;
  assert.equal(room.round, 1);
  room.phase = 'final';
  room.act(a, { type: 'playAgain' });
  assert.equal(room.roundId, null);
  room.act(a, { type: 'start' });
  assert.equal(room.round, 1);
  assert.notEqual(room.roundId, first);
});
