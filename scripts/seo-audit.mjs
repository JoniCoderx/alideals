// SEO audit of the built site (dist/): URL inventory + technical checks with evidence.
// Usage: node scripts/build.mjs && node scripts/seo-audit.mjs [--json out.json]
import fs from 'node:fs/promises';
import path from 'node:path';

const DIST = path.resolve('dist');
const SITE = 'https://yeshdeal.com';
const files = [];
async function walk(d) { for (const e of await fs.readdir(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) { if (!['assets', 'tg-queue', 'go', 'test'].includes(e.name)) await walk(p); } else if (e.name === 'index.html') files.push(p); } }
await walk(DIST);
const sitemap = new Set([...(await fs.readFile(path.join(DIST, 'sitemap.xml'), 'utf8')).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].replace(SITE, '')));
const robots = await fs.readFile(path.join(DIST, 'robots.txt'), 'utf8');
const disallow = [...robots.matchAll(/^Disallow: (.+)$/gm)].map((m) => m[1].trim());
const text = (h) => h.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/g, ' ').replace(/\s+/g, ' ').trim();
const pages = [];
for (const f of files) {
  const h = await fs.readFile(f, 'utf8');
  const url = '/' + path.relative(DIST, f).replace(/index\.html$/, '').replace(/\\/g, '/');
  const g = (re) => (h.match(re) || [])[1] || '';
  const robotsMeta = g(/<meta name="robots" content="([^"]+)"/);
  const redirect = /http-equiv="refresh"/.test(h);
  const main = (h.match(/<main[\s\S]*?<\/main>/) || [h])[0];
  const ld = [...h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => { try { const j = JSON.parse(m[1]); return [].concat(j).map((x) => x['@type']).join('+'); } catch { return 'INVALID'; } });
  const links = [...h.matchAll(/href="(\/[^"#?]*)/g)].map((m) => m[1]);
  pages.push({
    url, redirect, index: !redirect && !/noindex/.test(robotsMeta), inSitemap: sitemap.has(url),
    title: g(/<title>([^<]*)<\/title>/), desc: g(/<meta name="description" content="([^"]*)"/),
    canonical: g(/<link rel="canonical" href="([^"]+)"/), h1: (h.match(/<h1[\s>]/g) || []).length,
    h1text: text(g(/<h1[^>]*>([\s\S]*?)<\/h1>/)), words: text(main).split(' ').length, ld,
    imgsNoAlt: [...h.matchAll(/<img(?![^>]*\balt=)[^>]*>/g)].length, links,
  });
}
const idx = pages.filter((p) => p.index);
const inlinks = {};
for (const p of pages) for (const l of new Set(p.links)) inlinks[l] = (inlinks[l] || 0) + (l === p.url ? 0 : 1);
const issues = [];
const add = (sev, url, what, ev) => issues.push({ sev, url, what, ev });
const dupT = {}, dupD = {};
for (const p of idx) { (dupT[p.title] ||= []).push(p.url); (dupD[p.desc] ||= []).push(p.url); }
for (const p of idx) {
  if (!p.title) add('P0', p.url, 'missing title', '');
  else if (p.title.length > 70) add('P2', p.url, `title ${p.title.length} chars (may be truncated)`, p.title);
  if (!p.desc) add('P1', p.url, 'missing description', '');
  else if (p.desc.length > 165 || p.desc.length < 70) add('P2', p.url, `description ${p.desc.length} chars`, p.desc.slice(0, 80));
  if (p.h1 !== 1) add('P1', p.url, `${p.h1} h1 elements`, '');
  if (p.canonical !== SITE + p.url) add('P0', p.url, 'canonical mismatch', p.canonical);
  if (!p.inSitemap) add('P1', p.url, 'indexable but not in sitemap', '');
  if (p.ld.includes('INVALID')) add('P0', p.url, 'invalid JSON-LD', '');
  if (p.imgsNoAlt) add('P2', p.url, `${p.imgsNoAlt} <img> without alt`, '');
  if ((inlinks[p.url] || 0) < 2 && p.url !== '/') add('P1', p.url, `weak internal linking (${inlinks[p.url] || 0} inlinks)`, '');
  if (p.words < 250) add('P2', p.url, `thin main content (${p.words} words)`, p.h1text);
  if (disallow.some((d) => p.url.startsWith(d))) add('P0', p.url, 'indexable page blocked by robots.txt', '');
}
for (const [t, u] of Object.entries(dupT)) if (u.length > 1) add('P1', u.join(' '), 'duplicate title', t);
for (const [d, u] of Object.entries(dupD)) if (u.length > 1) add('P1', u.join(' '), 'duplicate description', d.slice(0, 80));
for (const u of sitemap) { const p = pages.find((x) => x.url === u); if (!p) add('P0', u, 'sitemap URL has no page', ''); else if (!p.index) add('P0', u, 'non-indexable URL in sitemap', ''); }
const broken = new Set();
for (const p of pages) for (const l of p.links) { const f = path.join(DIST, l.replace(/^\//, ''), l.endsWith('/') ? 'index.html' : ''); try { await fs.access(l.endsWith('/') || !path.extname(l) ? (l.endsWith('/') ? f : f + '/index.html') : f); } catch { if (!l.startsWith('/go/')) broken.add(`${p.url} → ${l}`); } }
for (const b of broken) add('P0', b.split(' → ')[0], 'broken internal link', b);
const order = { P0: 0, P1: 1, P2: 2 };
issues.sort((a, b) => order[a.sev] - order[b.sev]);
console.log(`pages: ${pages.length} · indexable: ${idx.length} · in sitemap: ${sitemap.size} · redirects: ${pages.filter((p) => p.redirect).length}`);
console.log(`schema types: ${[...new Set(idx.flatMap((p) => p.ld))].join(', ')}`);
const c = issues.reduce((a, i) => ((a[i.sev] = (a[i.sev] || 0) + 1), a), {});
console.log(`issues: ${JSON.stringify(c)}`);
for (const i of issues) console.log(`${i.sev} ${i.url} — ${i.what}${i.ev ? ` | ${i.ev}` : ''}`);
const out = process.argv.indexOf('--json');
if (out > 0) await fs.writeFile(process.argv[out + 1], JSON.stringify({ pages: pages.map(({ links, ...p }) => ({ ...p, inlinks: inlinks[p.url] || 0 })), issues }, null, 1));
