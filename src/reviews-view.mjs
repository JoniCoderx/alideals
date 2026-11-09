// Shared review display rules (site build + Worker API): one review per person, varied avatars.
// The same person can write from two Telegram accounts or change the display name ("דביר פרש" / "דביר דוד פרש"):
// reviews are de-duplicated by first + last name and only the newest is kept.
const AV_ICONS = ['🛍️', '📦', '🎧', '⭐', '🎯', '💳', '🛒', '🎁', '🔥', '💡', '🚚', '📱'];
const AV_COLORS = [['#ff7a2f', '#e5122f'], ['#7b5cff', '#4b2fd1'], ['#18b67a', '#0c8a5a'], ['#ffb000', '#ff7a00'], ['#1aa3ff', '#0a6fd6'], ['#ff4f9a', '#d0216e']];
const hashStr = (s) => { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
const personKey = (name) => {
  const w = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!w.length || /^גולש/.test(w[0])) return null; // anonymous reviews are never merged
  return (w.length > 1 ? `${w[0]} ${w[w.length - 1]}` : w[0]).replace(/\.$/, '');
};
export function publicReviews(list = [], hidden = []) {
  const hide = new Set(hidden.map(String));
  const sorted = list.filter((r) => r && !hide.has(String(r.id)) && r.text && r.stars).sort((a, b) => String(b.d).localeCompare(String(a.d)) || Number(b.id) - Number(a.id));
  const seen = new Set();
  const out = [];
  for (const r of sorted) {
    const k = r.h || personKey(r.name);
    const k2 = personKey(r.name);
    if ((k && seen.has(k)) || (k2 && seen.has('n:' + k2))) continue;
    if (k) seen.add(k);
    if (k2) seen.add('n:' + k2);
    const n = hashStr(r.h || r.id);
    out.push({ id: String(r.id), name: r.name, stars: Number(r.stars), text: r.text, d: r.d, icon: AV_ICONS[n % AV_ICONS.length], colors: AV_COLORS[(n >>> 4) % AV_COLORS.length] });
  }
  return out;
}
