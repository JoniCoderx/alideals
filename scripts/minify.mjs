// Tiny, safe minifiers (no dependencies). They only remove comments and collapse whitespace,
// never rewrite code, so output behaves exactly like the input.

export function minifyCSS(css) {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*([{}:;,>~])\s*/g, '$1')
    .replace(/;}/g, '}')
    .trim();
}

/** Collapses whitespace in HTML, leaving <script>, <style>, <pre> and <textarea> untouched. */
export function minifyHTML(html) {
  const keep = [];
  const masked = html.replace(/<(script|style|pre|textarea)\b[\s\S]*?<\/\1>/gi, (m) => {
    keep.push(m);
    return `\u0000${keep.length - 1}\u0000`;
  });
  return masked
    .replace(/<!--(?!\[if)[\s\S]*?-->/g, '')
    .replace(/\s+/g, ' ')
    .replace(/>\s+</g, '> <')
    .replace(/\u0000(\d+)\u0000/g, (_, i) => keep[Number(i)])
    .trim();
}
