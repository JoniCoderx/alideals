// Pings IndexNow (Bing, Yandex, Seznam, Naver…) with every URL in the live sitemap.
// Runs in CI after a deploy that changed content (push / manual run), not on every scheduled rebuild.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const site = JSON.parse(await fs.readFile(path.join(ROOT, 'config/site.json'), 'utf8'));
if (!site.indexNowKey) { console.log('• no indexNowKey – skipping'); process.exit(0); }

const xml = await (await fetch(`${site.url}/sitemap.xml`)).text();
const urlList = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
if (!urlList.length) { console.log('• sitemap empty – skipping'); process.exit(0); }

const res = await fetch('https://api.indexnow.org/indexnow', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify({ host: new URL(site.url).host, key: site.indexNowKey, keyLocation: `${site.url}/${site.indexNowKey}.txt`, urlList }),
});
console.log(`IndexNow: HTTP ${res.status} for ${urlList.length} URLs`);
if (res.status >= 400 && res.status !== 429) process.exitCode = 1;
