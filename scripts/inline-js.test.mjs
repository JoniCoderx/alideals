// Every inline <script> in the built site must parse (catches broken template-literal JS like the /p/ page bug).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';

test('all inline scripts in dist/ parse', async () => {
  execFileSync('node', ['scripts/build.mjs'], { stdio: 'ignore', env: { ...process.env, TELEGRAM_BOT_TOKEN: '' } });
  const bad = [];
  async function walk(d) {
    for (const e of await fs.readdir(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (!['assets', 'tg-queue'].includes(e.name)) await walk(p); continue; }
      if (!e.name.endsWith('.html')) continue;
      const h = await fs.readFile(p, 'utf8');
      for (const m of h.matchAll(/<script(?![^>]*\b(?:src|type="application\/(?:ld\+)?json"))[^>]*>([\s\S]*?)<\/script>/g)) {
        try { new vm.Script(m[1]); } catch (err) { bad.push(`${path.relative('dist', p)}: ${err.message}`); }
      }
    }
  }
  await walk('dist');
  assert.deepEqual(bad, []);
});
