// ⚠️ PREVIEW FIXTURES – NOT REAL PRODUCTS, PRICES OR LINKS.
// Used only by the /test/ preview until the official AliExpress Affiliates API is connected.
// Every page that renders these shows a visible "נתוני תצוגה" label. Prices are illustrative round numbers,
// there are no ratings, no sales counts, no real product images and no affiliate URLs.
export const PREVIEW = true;

export const fixtureProducts = [
  { id: 'fx-car-holder', cat: 'car', emoji: '📱', title: 'מחזיק טלפון מגנטי לרכב', en: 'Magnetic car phone holder for air vent', price: 6.5, shipping: 0, specs: { 'חיבור': 'פתח מיזוג', 'תאימות': 'טלפונים עד 7 אינץ׳' }, why: 'פתרון פשוט שמשאיר את הניווט בגובה העיניים.' },
  { id: 'fx-dashcam', cat: 'car', emoji: '🎥', title: 'מצלמת דרך קדמית עם מסך', en: 'Dash cam 1080p front camera with screen', price: 29, shipping: 3, specs: { 'רזולוציה': '1080p', 'אחסון': 'כרטיס microSD (לא כלול)' }, why: 'תיעוד נסיעה, שימושי במקרה של תאונה.' },
  { id: 'fx-car-vac', cat: 'car', emoji: '🧹', title: 'שואב אבק נטען לרכב', en: 'Cordless handheld car vacuum cleaner', price: 18, shipping: 2, specs: { 'טעינה': 'USB-C' }, why: 'ניקוי פירורים וחול בלי לחפש שקע.' },
  { id: 'fx-trunk-org', cat: 'car', emoji: '🧳', title: 'ארגונית מתקפלת לתא מטען', en: 'Foldable trunk organizer', price: 12, shipping: 2.5, specs: { 'תאים': '3' }, why: 'מסדרת קניות וציוד שלא יתגלגלו בנסיעה.' },
  { id: 'fx-seat-gap', cat: 'car', emoji: '🪢', title: 'אוטם רווח בין המושבים (זוג)', en: 'Car seat gap filler 2 pcs', price: 4.2, shipping: 0, specs: { 'כמות': '2' }, why: 'נגמרו הימים של טלפון שנופל בין המושבים.' },
  { id: 'fx-tire-inflator', cat: 'car', emoji: '🛞', title: 'משאבת אוויר חשמלית לצמיגים', en: 'Portable electric tire inflator', price: 26, shipping: 3, specs: { 'הפעלה': 'סוללה נטענת', 'תצוגה': 'דיגיטלית' }, why: 'בדיקה ומילוי לחץ אוויר בלי לחפש תחנת דלק.' },
  { id: 'fx-sunshade', cat: 'car', emoji: '☀️', title: 'מגן שמש מתקפל לשמשה קדמית', en: 'Foldable windshield sun shade umbrella', price: 9, shipping: 1.5, specs: { 'מידה': 'לבחור לפי הרכב' }, why: 'מוריד את החום ברכב בקיץ הישראלי.' },
  { id: 'fx-hud', cat: 'car', emoji: '🧭', title: 'תצוגת מהירות לשמשה (HUD)', en: 'Car HUD speed display', price: 15, shipping: 2, specs: { 'חיבור': 'OBD2 / GPS – לבדוק בעמוד המוצר' }, why: 'מהירות מול העיניים, פחות מבטים למטה.' },
  { id: 'fx-charger', cat: 'car', emoji: '🔌', title: 'מטען מהיר לרכב USB-C כפול', en: 'Dual USB-C fast car charger', price: 7, shipping: 0, specs: { 'יציאות': '2× USB-C' }, why: 'טעינה מהירה לשני טלפונים בבת אחת.' },
  { id: 'fx-led', cat: 'car', emoji: '💡', title: 'תאורת LED פנימית לרכב', en: 'Car interior LED strip light', price: 8, shipping: 1, specs: { 'הפעלה': 'USB' }, why: 'תאורה נעימה ושימושית בלילה.' },
  { id: 'fx-powerbank', cat: 'electronics', emoji: '🔋', title: 'סוללה ניידת 20000mAh עם טעינה מהירה', en: 'Power bank 20000mAh PD 65W', price: 24, shipping: 0, specs: { 'קיבולת': '20000mAh', 'הספק': '65W' }, why: 'מספיקה ליום שלם, גם ללפטופ קטן.' },
  { id: 'fx-earbuds', cat: 'electronics', emoji: '🎧', title: 'אוזניות אלחוטיות עם ביטול רעשים', en: 'Wireless earbuds ANC', price: 22, shipping: 0, specs: { 'חיבור': 'Bluetooth 5.3' }, why: 'מחיר נגיש לאוזניות עם ביטול רעשים.' },
];

export const fixtureCollections = [
  {
    slug: 'car-accessories', title: '10 אביזרים שימושיים לרכב', cat: 'car', emoji: '🚗',
    intro: 'אביזרים קטנים שפותרים בעיות יומיומיות ברכב: טלפון שנופל, חום בקיץ, ציוד שמתגלגל בתא המטען. בחרנו פריטים שימושיים במחיר נמוך, עם משלוח לישראל.',
    method: 'הרשימה נבחרת לפי שימושיות, מחיר כולל משלוח לישראל ומגוון (בלי שני מוצרים שעושים אותו דבר). אנחנו לא מדרגים לפי "הכי נמכר" כשאין לנו נתון אמין על כך.',
    items: ['fx-car-holder', 'fx-dashcam', 'fx-car-vac', 'fx-trunk-org', 'fx-seat-gap', 'fx-tire-inflator', 'fx-sunshade', 'fx-hud', 'fx-charger', 'fx-led'],
  },
];

// Deal Hunter demo scenario (illustrative, labelled on the page).
export const hunterDemo = {
  base: { title: 'Baseus 20000mAh Power Bank PD 65W BS-P20 Fast Charging', he: 'סוללה ניידת 20000mAh, 65W (המוצר שהודבק)', price: 31, shipping: 0, emoji: '🔋' },
  candidates: [
    { title: 'Baseus BS-P20 20000mAh Power Bank 65W PD Fast Charge', he: 'אותו דגם אצל מוכר אחר', price: 26.5, shipping: 0, seller: 'מוכר א׳' },
    { title: 'Baseus 20000mAh Power Bank PD 65W Fast Charging portable', he: 'נראה זהה, בלי מספר דגם בכותרת', price: 25, shipping: 1.5, seller: 'מוכר ב׳' },
    { title: 'Baseus 10000mAh Power Bank PD 65W BS-P20 Fast Charging', he: 'אותה סדרה, קיבולת קטנה יותר', price: 17, shipping: 0, seller: 'מוכר ג׳' },
  ],
};
