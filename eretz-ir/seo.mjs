// התאמת index.html לכל בקשה: כתובות מלאות (canonical / og:url / og:image) לפי הדומיין שבו האתר רץ,
// גרסה באנגלית ל-?lang=en, ותצוגה מקדימה אישית לקישור חדר (/1234) – "יוני מזמין/ה אותך לשחק".
// משותף לשרת Node ול-Cloudflare Worker.

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function setMeta(html, attr, key, value) {
  const re = new RegExp(`(<meta ${attr}="${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}" content=")[^"]*(")`);
  return html.replace(re, `$1${esc(value)}$2`);
}

const EN = {
  title: 'Eretz Ir Online – the Country-City word game with friends, free',
  description: 'Play Eretz Ir (Country, City, Animal… also known as Stop or Categories) online with friends: open a room, share the link, play from your phone. Timer, Stop!, dictionary answer check and automatic scoring. Free, no sign-up.',
  ogTitle: 'Eretz Ir Online – come play with friends!',
  ogDesc: 'Open a room, share the link, play. Timer, Stop! and automatic scoring. Free, no sign-up.',
};

/**
 * @param {string} html  index.html המקורי
 * @param {{origin: string, lang?: 'he'|'en', room?: {code: string, host?: string, lang?: string}|null}} o
 */
export function renderIndex(html, { origin, lang = 'he', room = null }) {
  const en = lang === 'en';
  const home = origin + '/';
  const url = room ? `${origin}/${room.code}` : en ? `${home}?lang=en` : home;
  const image = `${origin}/${en ? 'og-image-en.png' : 'og-image.png'}`;

  let h = html
    .replace('<link rel="canonical" href="/">', `<link rel="canonical" href="${esc(en ? `${home}?lang=en` : home)}">`)
    .replace('<link rel="alternate" hreflang="he" href="/">', `<link rel="alternate" hreflang="he" href="${esc(home)}">`)
    .replace('<link rel="alternate" hreflang="en" href="/?lang=en">', `<link rel="alternate" hreflang="en" href="${esc(home)}?lang=en">`)
    .replace('<link rel="alternate" hreflang="x-default" href="/">', `<link rel="alternate" hreflang="x-default" href="${esc(home)}">`)
    .replace('"url": "/"', `"url": ${JSON.stringify(home)}`)
    .replace('"image": "/og-image.png"', `"image": ${JSON.stringify(`${origin}/og-image.png`)}`);
  h = setMeta(h, 'property', 'og:url', url);
  h = setMeta(h, 'property', 'og:image', image);
  h = setMeta(h, 'name', 'twitter:image', image);

  if (en) {
    h = h.replace('<html lang="he" dir="rtl">', '<html lang="en" dir="ltr">')
      .replace(/<title>[^<]*<\/title>/, `<title>${esc(EN.title)}</title>`);
    h = setMeta(h, 'name', 'description', EN.description);
    h = setMeta(h, 'property', 'og:locale', 'en_US');
    h = setMeta(h, 'property', 'og:locale:alternate', 'he_IL');
    h = setMeta(h, 'property', 'og:title', EN.ogTitle);
    h = setMeta(h, 'property', 'og:description', EN.ogDesc);
    h = setMeta(h, 'property', 'og:image:alt', 'Eretz Ir Online – a word game with friends');
    h = setMeta(h, 'name', 'twitter:title', EN.ogTitle);
    h = setMeta(h, 'name', 'twitter:description', EN.ogDesc);
  }

  if (room) {
    const host = room.host ? String(room.host).slice(0, 20) : '';
    const title = en
      ? (host ? `${host} invited you to play Eretz Ir! 🎲` : 'You\'re invited to play Eretz Ir! 🎲')
      : (host ? `${host} מזמין/ה אותך לשחק ארץ עיר! 🎲` : 'הוזמנת לשחק ארץ עיר! 🎲');
    const desc = en
      ? `Tap to join room ${room.code}. No sign-up, no download.`
      : `לחצו כדי להצטרף לחדר ${room.code}. בלי הרשמה ובלי הורדה, משחקים מהנייד.`;
    h = h.replace(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`);
    h = setMeta(h, 'property', 'og:title', title);
    h = setMeta(h, 'property', 'og:description', desc);
    h = setMeta(h, 'name', 'twitter:title', title);
    h = setMeta(h, 'name', 'twitter:description', desc);
    h = setMeta(h, 'name', 'description', desc);
    // דפי חדרים זמניים: לא לאינדקס, אבל כן לעקוב אחרי הקישורים
    h = h.replace('<meta name="theme-color"', '<meta name="robots" content="noindex, follow">\n  <meta name="theme-color"');
  }
  return h;
}

export function robotsTxt(origin) {
  return `User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${origin}/sitemap.xml\n`;
}

export function sitemapXml(origin) {
  const today = new Date().toISOString().slice(0, 10);
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
  <url>
    <loc>${origin}/</loc>
    <lastmod>${today}</lastmod>
    <xhtml:link rel="alternate" hreflang="he" href="${origin}/"/>
    <xhtml:link rel="alternate" hreflang="en" href="${origin}/?lang=en"/>
  </url>
  <url>
    <loc>${origin}/?lang=en</loc>
    <lastmod>${today}</lastmod>
    <xhtml:link rel="alternate" hreflang="he" href="${origin}/"/>
    <xhtml:link rel="alternate" hreflang="en" href="${origin}/?lang=en"/>
  </url>
</urlset>
`;
}
