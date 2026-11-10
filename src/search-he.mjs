// Hebrew → English product search for AliExpress (its affiliate search only understands English keywords).
// Shared by the Worker (/api/search) and tests. Pure, no imports, runs in the Worker runtime.
//
// translateQuery('אוזניות אלחוטיות לאייפון') →
//   { en: 'wireless earbuds iphone', must: [/earbud|earphone|.../], soft: ['iphone'], understood: true, unknown: [] }
// `must`: regexes the English product title has to match (keeps results on topic, e.g. no lamps for "power bank").
// `soft`: extra terms that rank a result higher when its title has them (colour, brand, model, "for kids"...).

const R = (s) => new RegExp(s, 'i');

// Product types (the "head" of a query). Longest Hebrew phrase wins. m = regex the English title must match.
const HEADS = [
  // audio
  [['אוזניות אלחוטיות', 'אוזניות בלוטוס', 'אוזניות בלוטות', 'אוזניות תוך אוזן', 'איירפודס', 'אירפודס'], 'wireless earbuds', 'earbud|earphone|headphone|headset|tws|in-ear|ear buds|airpod', 'tips|hook|wing|foam|silicone cover'],
  [['אוזניות קשת', 'אוזניות מעל האוזן', 'אוזניות על האוזן', 'אוזניות מבטלות רעשים'], 'over ear headphones', 'headphone|headset|over-ear|over ear'],
  [['אוזניות גיימינג'], 'gaming headset', 'headset|headphone'],
  [['אוזניות ספורט', 'אוזניות לריצה'], 'sports earphones', 'earbud|earphone|headphone|headset|tws|bone conduction|open ear'],
  [['אוזניות עצם', 'אוזניות פתוחות'], 'open ear headphones', 'bone conduction|open ear|open-ear|air conduction|earbud|earphone|headphone'],
  [['אוזניות', 'אוזנייה'], 'earbuds', 'earbud|earphone|headphone|headset|tws|airpod', 'tips|hook|wing|foam'],
  [['רמקול בלוטוס', 'רמקול נייד', 'רמקול אלחוטי', 'רמקול'], 'bluetooth speaker', 'speaker|soundbar|boombox'],
  [['סאונדבר', 'מקרן קול'], 'soundbar', 'soundbar|sound bar'],
  [['מיקרופון דש', 'מיקרופון אלחוטי'], 'wireless lavalier microphone', 'microphone|mic\\b|lavalier'],
  [['מיקרופון'], 'microphone', 'microphone|mic\\b|lavalier'],
  // phone
  [['כיסוי לאייפון', 'כיסוי לאיפון', 'קייס לאייפון'], 'iphone case', 'case|cover|shell', 'holder|mount|motorcycle|bike|bicycle|lens|camera protector'],
  [['כיסוי לסמסונג', 'קייס לסמסונג', 'כיסוי לגלקסי'], 'samsung galaxy case', 'case|cover|shell', 'holder|mount|motorcycle|bike|bicycle|lens'],
  [['כיסוי לאוזניות', 'כיסוי לאיירפודס'], 'airpods case', 'case|cover|shell'],
  [['כיסוי לטלפון', 'כיסוי לפלאפון', 'כיסוי לנייד', 'קייס', 'כיסוי'], 'phone case', 'case|cover|shell', 'holder|mount|motorcycle|bike|bicycle'],
  [['מגן מסך', 'זכוכית מגן', 'מגן זכוכית'], 'screen protector', 'screen protector|tempered glass|protective glass|film'],
  [['מטען אלחוטי', 'משטח טעינה'], 'wireless charger', 'wireless charg|magsafe|qi\\b|charging pad|charging stand'],
  [['מטען לרכב'], 'car charger', 'car charger|car charging|cigarette'],
  [['מטען לאייפון', 'מטען לאיפון'], 'iphone fast charger', 'charger|charging head|gan|adapter|plug'],
  [['מטען למחשב נייד', 'מטען ללפטופ', 'מטען למקבוק'], 'laptop charger gan', 'charger|gan|adapter'],
  [['מטען מהיר', 'מטען קיר', 'מטען לטלפון', 'מטען', 'ראש מטען'], 'fast charger', 'charger|charging head|gan|adapter|plug', 'cable|cord|wire|magnetic tip|car|vehicle|cigarette|12-24v|12v'],
  [['כבל לאייפון', 'כבל לאיפון', 'כבל לייטנינג'], 'iphone charging cable', 'cable|cord|wire'],
  [['כבל hdmi', 'כבל לטלוויזיה'], 'hdmi cable', 'hdmi|cable'],
  [['כבל טעינה', 'כבל usb', 'כבל type c', 'כבל טייפ סי', 'כבל'], 'charging cable', 'cable|cord|wire'],
  [['סוללה ניידת', 'סוללת גיבוי', 'מטען נייד', 'פאוורבנק', 'פאוור בנק', 'סוללה חיצונית'], 'power bank', 'power ?bank|powerbank|battery pack|external battery|portable charger', 'case|cover|pouch|cable|bag'],
  [['מחזיק טלפון לרכב', 'מעמד לטלפון לרכב', 'מחזיק לרכב', 'מעמד לרכב', 'תושבת לרכב', 'מחזיק טלפון'], 'car phone holder', 'holder|mount|stand|bracket', 'plate|disc|disk|sticker|filler|gap|organizer|seat'],
  [['מחזיק טלפון לאופניים', 'מחזיק לאופניים', 'מחזיק לאופנוע'], 'bike phone holder', 'holder|mount|bracket'],
  [['מעמד לטלפון', 'מעמד לפלאפון', 'מעמד לטאבלט'], 'phone stand', 'stand|holder|mount'],
  [['מקל סלפי'], 'selfie stick', 'selfie'],
  [['חצובה'], 'tripod', 'tripod'],
  [['טבעת תאורה', 'טבעת לד', 'רינג לייט'], 'ring light', 'ring light|ring lamp|fill light'],
  [['כרטיס זיכרון', 'מיקרו אס די', 'כרטיס sd'], 'micro sd card', 'memory card|micro sd|tf card|sd card'],
  [['דיסק און קי', 'זיכרון נייד', 'דיסק נייד', 'דיסקונקי'], 'usb flash drive', 'flash drive|pen drive|usb stick|u disk|thumb drive'],
  [['דיסק קשיח', 'כונן', 'אס אס די'], 'ssd', 'ssd|nvme|hard drive|hdd|solid state'],
  [['טאבלט'], 'tablet', 'tablet|pad\\b'],
  // computer & gaming
  [['מקלדת מכנית'], 'mechanical keyboard', 'keyboard', 'keycap|key cap|keychain|switch puller|switches|wrist rest|cover|lube'],
  [['מקלדת אלחוטית', 'מקלדת'], 'keyboard', 'keyboard', 'keycap|key cap|keychain|cover|sticker|wrist rest'],
  [['עכבר אלחוטי', 'עכבר גיימינג', 'עכבר'], 'mouse', 'mouse|mice'],
  [['משטח לעכבר', 'פד לעכבר'], 'mouse pad', 'mouse pad|mousepad|desk mat'],
  [['מעמד למחשב נייד', 'מעמד ללפטופ', 'מעמד למחשב'], 'laptop stand', 'stand|holder'],
  [['תיק ללפטופ', 'תיק למחשב נייד', 'תיק למחשב'], 'laptop bag', 'bag|sleeve|case|backpack'],
  [['מפצל usb', 'מפצל', 'רכזת', 'האב'], 'usb hub', 'hub|splitter|docking|dock'],
  [['מצלמת רשת', 'מצלמה למחשב', 'וובקאם'], 'webcam', 'webcam|web camera|pc camera'],
  [['שלט לפלייסטיישן', 'שלט למשחקים', 'ג\'ויסטיק', 'גויסטיק', 'שלט גיימינג', 'בקר משחק', 'שלט'], 'game controller', 'controller|gamepad|joystick'],
  [['מסך מחשב', 'מוניטור', 'מסך נייד'], 'portable monitor', 'monitor|display|screen'],
  [['מחשב מיני', 'מיני פיסי'], 'mini pc', 'mini pc|mini computer'],
  [['מדפסת'], 'printer', 'printer'],
  [['רחפן'], 'drone', 'drone|quadcopter|fpv'],
  [['מצלמת אקסטרים', 'מצלמת אקשן', 'גו פרו'], 'action camera', 'action camera|sports camera|action cam'],
  [['מצלמה'], 'camera', 'camera|cam\\b'],
  // wearables
  [['שעון חכם', 'שעון ספורט', 'סמארטווטש'], 'smart watch', 'smart ?watch|smartwatch', 'band|strap|charger|cable|protector|film|case|box|stand|dock'],
  [['צמיד חכם', 'צמיד כושר', 'צמיד ספורט'], 'smart band', 'band|bracelet|fitness tracker'],
  [['רצועה לאפל ווטש', 'רצועה לשעון אפל'], 'apple watch band', 'band|strap|bracelet'],
  [['רצועה לשעון', 'רצועת שעון', 'רצועה'], 'watch band', 'band|strap|bracelet'],
  [['שעון יד', 'שעון'], 'watch', 'watch'],
  [['משקפי שמש'], 'sunglasses', 'sunglasses|sun glasses'],
  [['משקפיים'], 'glasses', 'glasses|eyewear|spectacles'],
  // home
  [['פס לד', 'פסי לד', 'תאורת לד', 'תאורה לחדר', 'סטריפ לד', 'נורות לד'], 'led strip lights', 'led|strip|light'],
  [['מנורת לילה'], 'night light', 'night light|night lamp'],
  [['מנורת שולחן', 'מנורה לשולחן'], 'desk lamp', 'lamp|light'],
  [['נורה חכמה', 'נורה'], 'smart bulb', 'bulb|lamp'],
  [['מנורה', 'תאורה', 'פנס תלייה'], 'lamp', 'lamp|light|lantern'],
  [['שואב אבק לרכב'], 'car vacuum cleaner', 'vacuum|cleaner'],
  [['שואב אבק רובוטי', 'רובוט שואב'], 'robot vacuum cleaner', 'robot|vacuum'],
  [['שואב אבק נייד', 'שואב אבק אלחוטי', 'שואב אבק', 'שואב'], 'vacuum cleaner', 'vacuum|cleaner'],
  [['מאוורר נייד', 'מאוורר צוואר', 'מאוורר יד'], 'portable fan', 'fan'],
  [['מאוורר'], 'fan', 'fan'],
  [['מכשיר אדים', 'מפזר ריח', 'מפיץ ריח', 'מפזר'], 'humidifier aroma diffuser', 'humidifier|diffuser'],
  [['מטהר אוויר'], 'air purifier', 'purifier'],
  [['מצלמת אבטחה', 'מצלמה לבית', 'מצלמת ביטחון', 'מצלמת תינוק'], 'security camera', 'camera|cam\\b|surveillance'],
  [['פעמון לדלת', 'פעמון חכם', 'פעמון'], 'video doorbell', 'doorbell|door bell'],
  [['שקע חכם', 'מפצל חשמל', 'מאריך חשמל', 'שקע'], 'smart plug', 'plug|socket|outlet|power strip'],
  [['מנעול חכם', 'מנעול'], 'smart lock', 'lock'],
  [['ארגונית', 'קופסת אחסון', 'קופסאות אחסון', 'סלסלה', 'מארגן'], 'storage organizer', 'organizer|storage|box|basket|container'],
  [['מדף', 'מדפים'], 'shelf', 'shelf|rack|shelves'],
  [['מתלה', 'קולב', 'קולבים', 'ווים', 'וו'], 'hanger hooks', 'hanger|hook|rack|holder'],
  [['וילון', 'וילונות'], 'curtain', 'curtain'],
  [['שטיח'], 'rug', 'rug|carpet|mat'],
  [['כרית'], 'pillow', 'pillow|cushion'],
  [['מצעים', 'סדין', 'ציפית'], 'bed sheets', 'sheet|bedding|pillowcase|duvet'],
  [['שמיכה'], 'blanket', 'blanket|throw|quilt'],
  [['מגבת', 'מגבות'], 'towel', 'towel'],
  [['פח אשפה', 'פח'], 'trash can', 'trash|bin|garbage|waste'],
  [['מראה עם תאורה', 'מראת איפור'], 'led makeup mirror', 'mirror'],
  [['מראה'], 'mirror', 'mirror'],
  [['ברז', 'ראש מקלחת', 'מזלף'], 'shower head', 'shower|faucet|tap'],
  [['אביזרים לאמבטיה', 'אמבטיה'], 'bathroom accessories', 'bath|shower|towel|toilet|soap'],
  [['שעון קיר'], 'wall clock', 'clock'],
  [['שעון מעורר'], 'alarm clock', 'clock|alarm'],
  [['מדבקות קיר', 'מדבקה', 'מדבקות'], 'wall stickers', 'sticker|decal'],
  [['מחצלת', 'שטיחון'], 'door mat', 'mat|rug'],
  // kitchen
  [['מטחנת קפה', 'מטחנה'], 'coffee grinder', 'grinder', 'dosing|ring|funnel|brush|distributor|tamper|cleaning'],
  [['מכונת קפה', 'מקציף חלב', 'מקציף'], 'coffee machine', 'coffee|espresso|frother'],
  [['קומקום חשמלי', 'קומקום'], 'electric kettle', 'kettle'],
  [['בלנדר', 'בלנדר נייד', 'מעבד מזון'], 'portable blender', 'blender|juicer|food processor'],
  [['משקל מטבח', 'משקל דיגיטלי', 'משקל'], 'kitchen scale', 'scale'],
  [['סכין', 'סכינים', 'סט סכינים'], 'kitchen knife set', 'knife|knives'],
  [['מחבת', 'מחבתות'], 'frying pan', 'pan|skillet|wok'],
  [['סיר', 'סירים'], 'cooking pot', 'pot|pan|cookware'],
  [['קרש חיתוך'], 'cutting board', 'cutting board|chopping board'],
  [['בקבוק מים', 'בקבוק', 'בקבוק ספורט'], 'water bottle', 'bottle'],
  [['כוס תרמית', 'טרמוס', 'ספל', 'כוס', 'כוסות'], 'thermos cup', 'cup|mug|tumbler|thermos|flask'],
  [['קופסאות לאוכל', 'קופסת אוכל', 'קופסאות', 'קופסה'], 'food storage containers', 'container|box|lunch'],
  [['כלי מטבח', 'גאדג\'טים למטבח', 'אביזרים למטבח', 'מטבח'], 'kitchen gadgets', 'kitchen|cook|bake|food'],
  [['מקלף', 'פומפייה', 'קולפן'], 'vegetable peeler', 'peeler|grater|slicer'],
  [['מצית', 'מצית חשמלי'], 'electric lighter', 'lighter'],
  [['טוסטר', 'סיר טיגון', 'נינג\'ה', 'אייר פרייר'], 'air fryer', 'fryer|toaster'],
  // car
  [['מצלמת רכב', 'מצלמת דרך', 'מצלמה לרכב'], 'dash cam', 'dash ?cam|dashcam|car camera|dvr|recorder', 'holder|mount|bracket|suction|hardwire|power cord|cable'],
  [['מדחס לצמיגים', 'משאבה לצמיגים', 'מדחס', 'משאבת אוויר'], 'tire inflator', 'inflator|air pump|compressor'],
  [['כיסוי למושב', 'כיסויים למושבים', 'כיסוי מושב'], 'car seat cover', 'seat cover|cushion'],
  [['ארגונית לרכב', 'אביזרים לרכב', 'גאדג\'טים לרכב'], 'car accessories', 'car|vehicle|auto'],
  [['ריח לרכב', 'מטהר לרכב', 'בושם לרכב'], 'car air freshener', 'freshener|aroma|perfume|fragrance'],
  [['משדר לרכב', 'משדר בלוטוס לרכב', 'קארפליי', 'אנדרואיד אוטו'], 'wireless carplay adapter', 'carplay|android auto|transmitter|adapter'],
  // tools
  [['מברגה', 'מקדחה', 'מברגה נטענת'], 'cordless drill', 'drill|screwdriver'],
  [['ערכת מברגים', 'סט מברגים', 'מברגים', 'מברג'], 'precision screwdriver set', 'screwdriver'],
  [['ערכת כלים', 'כלי עבודה', 'ארגז כלים', 'כלים'], 'tool set', 'tool|kit|wrench|plier|screwdriver'],
  [['סרט מדידה', 'מטר', 'מד מרחק'], 'tape measure', 'tape measure|measuring|rangefinder|laser distance'],
  [['מלחם'], 'soldering iron', 'solder'],
  [['פנס ראש'], 'headlamp', 'headlamp|head lamp|headlight'],
  [['פנס'], 'flashlight', 'flashlight|torch|lantern'],
  [['אקדח דבק', 'דבק'], 'glue', 'glue|adhesive'],
  [['מולטימטר', 'מודד מתח', 'בודק מתח'], 'multimeter', 'multimeter|tester|voltmeter'],
  // beauty & care
  [['מייבש שיער', 'פן'], 'hair dryer', 'hair dryer|blow dryer|dryer'],
  [['מחליק שיער', 'מחליק'], 'hair straightener', 'straightener|flat iron'],
  [['מסלסל שיער', 'מסלסל', 'בייביליס'], 'hair curler', 'curler|curling'],
  [['מכונת תספורת', 'מכונת תספורת לגבר', 'טרימר'], 'hair clipper', 'clipper|trimmer'],
  [['מכונת גילוח', 'מכונת גילוח חשמלית', 'סכין גילוח'], 'electric shaver', 'shaver|razor|trimmer'],
  [['מברשת שיניים חשמלית', 'מברשת שיניים'], 'electric toothbrush', 'toothbrush'],
  [['מברשות איפור', 'מברשת איפור'], 'makeup brushes', 'brush'],
  [['איפור', 'קוסמטיקה'], 'makeup', 'makeup|cosmetic|lipstick|eyeshadow|foundation|mascara|lip'],
  [['לק ג\'ל', 'מנורת לק', 'לק', 'ציפורניים', 'מניקור'], 'gel nail polish', 'nail|gel|manicure'],
  [['מסכת פנים', 'טיפוח', 'טיפוח פנים'], 'skin care', 'skin|face|facial|serum|cream|mask'],
  [['מסאג\'ר', 'מכשיר עיסוי', 'אקדח עיסוי'], 'massage gun', 'massag'],
  [['פאה', 'פאות', 'תוספות שיער'], 'wig', 'wig|hair extension'],
  [['מברשת שיער', 'מסרק'], 'hair brush', 'brush|comb'],
  // fashion
  [['חולצת טריקו', 'חולצה', 'חולצות', 'טישרט'], 't-shirt', 'shirt|tee|top|blouse'],
  [['קפוצ\'ון', 'קפוצון', 'סווטשירט'], 'hoodie', 'hoodie|sweatshirt|pullover'],
  [['מעיל', 'ז\'קט', 'גקט', 'מעיל חורף', 'מעיל גשם'], 'jacket', 'jacket|coat|parka|windbreaker'],
  [['ג\'ינס', 'גינס'], 'jeans', 'jean|denim'],
  [['מכנסיים קצרים', 'שורטים', 'מכנס קצר'], 'shorts', 'shorts'],
  [['טרנינג', 'מכנסי טרנינג'], 'sweatpants', 'sweatpant|jogger|track pant|trouser|pant'],
  [['מכנסיים', 'מכנס'], 'pants', 'pant|trouser|jogger'],
  [['שמלה', 'שמלות'], 'dress', 'dress', 'pant|trouser|shirt|shoe|suit|sock|boot'],
  [['חצאית'], 'skirt', 'skirt'],
  [['פיג\'מה', 'פיגמה'], 'pajamas', 'pajama|pyjama|sleepwear|nightwear'],
  [['בגד ים', 'ביקיני', 'בגדי ים'], 'swimsuit', 'swim|bikini|beachwear'],
  [['גרביים', 'גרב'], 'socks', 'sock'],
  [['תחתונים', 'בוקסר', 'בוקסרים'], 'underwear', 'underwear|boxer|brief|panties'],
  [['חזייה', 'חזיה'], 'bra', 'bra\\b|bralette|lingerie'],
  [['נעלי ריצה', 'נעלי ספורט', 'נעלי הליכה'], 'running shoes', 'shoe|sneaker|trainer'],
  [['סניקרס', 'נעליים', 'נעל'], 'sneakers', 'shoe|sneaker|trainer|boot|loafer'],
  [['כפכפים', 'כפכף', 'נעלי בית', 'סלייד'], 'slippers', 'slipper|slide|flip flop|sandal'],
  [['סנדלים', 'סנדל'], 'sandals', 'sandal'],
  [['מגפיים', 'מגף'], 'boots', 'boot'],
  [['תיק גב', 'תרמיל'], 'backpack', 'backpack|rucksack', 'pin|badge|keychain|pendant|charm'],
  [['תיק צד', 'תיק כתף', 'פאוץ\''], 'crossbody bag', 'bag|pouch'],
  [['תיק', 'תיקים'], 'bag', 'bag|tote|purse|handbag'],
  [['ארנק', 'מחזיק כרטיסים'], 'wallet', 'wallet|card holder|purse'],
  [['כובע מצחייה', 'כובע בייסבול'], 'baseball cap', 'cap|hat'],
  [['כובע גרב', 'כובע צמר'], 'beanie', 'beanie|knit hat|hat'],
  [['כובע'], 'hat', 'hat|cap|beanie'],
  [['חגורה'], 'belt', 'belt'],
  [['צעיף'], 'scarf', 'scarf|shawl'],
  [['כפפות'], 'gloves', 'glove'],
  [['שרשרת', 'שרשראות'], 'necklace', 'necklace|chain|pendant'],
  [['צמיד', 'צמידים'], 'bracelet', 'bracelet|bangle'],
  [['עגילים', 'עגיל'], 'earrings', 'earring'],
  [['טבעת', 'טבעות'], 'ring', 'ring'],
  [['תכשיטים', 'תכשיט'], 'jewelry', 'jewel|necklace|bracelet|earring|ring|pendant'],
  // kids & toys
  [['לגו', 'אבני בניין', 'קוביות בנייה'], 'building blocks', 'block|brick|lego|building'],
  [['מכונית על שלט', 'רכב על שלט', 'מכונית שלט'], 'rc car', 'rc|remote control|car'],
  [['בובה', 'בובות'], 'doll', 'doll|plush|figure'],
  [['בובת פרווה', 'בובה רכה', 'פלאש'], 'plush toy', 'plush|stuffed|doll'],
  [['פאזל'], 'puzzle', 'puzzle'],
  [['משחק קופסה', 'משחקי קופסה'], 'board game', 'board game|game'],
  [['צעצוע', 'צעצועים', 'משחק', 'משחקים'], 'toys', 'toy|game|puzzle|block|doll|plush|kid|children'],
  [['עגלת תינוק', 'עגלה'], 'baby stroller', 'stroller|pram|pushchair'],
  [['מוצץ', 'בקבוק לתינוק', 'מוצרי תינוקות'], 'baby products', 'baby|infant|newborn|pacifier'],
  // sport & outdoor
  [['אוהל'], 'camping tent', 'tent'],
  [['שק שינה'], 'sleeping bag', 'sleeping bag'],
  [['כיסא מתקפל', 'כיסא קמפינג', 'כסא מתקפל'], 'folding camping chair', 'chair|stool'],
  [['ציוד קמפינג', 'קמפינג'], 'camping gear', 'camping|outdoor|tent|lantern|hiking'],
  [['מזרן יוגה', 'מזרון יוגה'], 'yoga mat', 'yoga|mat'],
  [['משקולות', 'משקולת'], 'dumbbells', 'dumbbell|weight|kettlebell'],
  [['גומיות התנגדות', 'גומיית כושר', 'גומיות'], 'resistance bands', 'resistance|band|elastic'],
  [['חבל קפיצה'], 'jump rope', 'jump rope|skipping rope'],
  [['ציוד כושר', 'כושר'], 'fitness equipment', 'fitness|gym|workout|exercise|training'],
  [['קסדה'], 'helmet', 'helmet'],
  [['אופניים', 'אביזרים לאופניים', 'פנס לאופניים'], 'bike accessories', 'bike|bicycle|cycling'],
  [['קורקינט'], 'scooter accessories', 'scooter'],
  [['חכה', 'דייג', 'ציוד דייג'], 'fishing', 'fishing|fish|lure|rod|reel'],
  [['שעון שחייה', 'משקפת שחייה', 'משקפי שחייה'], 'swimming goggles', 'goggle|swim'],
  [['משקפת'], 'binoculars', 'binocular|telescope|monocular'],
  // pets
  [['רצועה לכלב', 'רצועת כלב'], 'dog leash', 'leash|lead|harness'],
  [['קולר'], 'dog collar', 'collar'],
  [['מיטה לכלב', 'מיטה לחתול', 'מיטה לחיות'], 'pet bed', 'bed|mat|cushion'],
  [['צעצוע לחתול', 'צעצועים לחתול'], 'cat toy', 'toy|teaser|wand'],
  [['צעצוע לכלב', 'צעצועים לכלב'], 'dog toy', 'toy|chew|ball'],
  [['קערה לכלב', 'קערה לחתול', 'מתקן מים לחתול', 'מזרקה לחתול'], 'pet water fountain bowl', 'bowl|feeder|fountain|dispenser'],
  [['מוצרים לכלב', 'לכלב'], 'dog accessories', 'dog|pet|puppy'],
  [['מוצרים לחתול', 'לחתול'], 'cat accessories', 'cat\\b|cats\\b|kitten|pet'],
  // travel & office
  [['מזוודה', 'מזוודות', 'טרולי'], 'suitcase', 'suitcase|luggage|trolley'],
  [['ארגונית למזוודה', 'קוביות אריזה'], 'packing cubes', 'packing|organizer|cube|storage bag'],
  [['מתאם חשמל', 'מתאם לחו"ל', 'מתאם לחול', 'מתאם נסיעות', 'מתאם'], 'travel adapter', 'adapter|adaptor|converter|plug'],
  [['כרית צוואר', 'כרית לטיסה'], 'neck pillow', 'neck pillow|travel pillow|pillow'],
  [['מחברת', 'מחברות', 'יומן'], 'notebook', 'notebook|journal|planner|diary'],
  [['עט', 'עטים', 'עפרונות', 'טושים', 'מרקרים'], 'pens', 'pen\\b|pens\\b|pencil|marker|highlighter'],
  [['ציוד משרדי', 'ציוד לבית ספר', 'קלמר'], 'stationery', 'stationery|pen|pencil|office|school'],
  [['מחשבון'], 'calculator', 'calculator'],
];

// Modifiers: added to the English query and used to rank (not required in the title).
const MODS = {
  'אלחוטי': 'wireless', 'אלחוטית': 'wireless', 'אלחוטיות': 'wireless', 'אלחוטיים': 'wireless', 'בלוטוס': 'bluetooth', 'בלוטות': 'bluetooth',
  'נטען': 'rechargeable', 'נטענת': 'rechargeable', 'נטענים': 'rechargeable', 'נטענות': 'rechargeable',
  'מגנטי': 'magnetic', 'מגנטית': 'magnetic', 'מגנטיים': 'magnetic', 'מגסייף': 'magsafe',
  'עמיד למים': 'waterproof', 'עמידים למים': 'waterproof', 'עמידה למים': 'waterproof',
  'נייד': 'portable', 'ניידת': 'portable', 'ניידים': 'portable', 'מתקפל': 'foldable', 'מתקפלת': 'foldable', 'מתקפלים': 'foldable',
  'חכם': 'smart', 'חכמה': 'smart', 'חכמים': 'smart', 'חשמלי': 'electric', 'חשמלית': 'electric', 'דיגיטלי': 'digital', 'דיגיטלית': 'digital',
  'קטן': 'mini', 'קטנה': 'mini', 'קטנים': 'mini', 'מיני': 'mini', 'גדול': 'large', 'גדולה': 'large', 'גדולים': 'large',
  'לד': 'led', 'מהיר': 'fast', 'מהירה': 'fast', 'שקט': 'quiet', 'שקטה': 'quiet', 'מבטל רעשים': 'noise cancelling', 'ביטול רעשים': 'noise cancelling',
  'שחור': 'black', 'שחורה': 'black', 'שחורים': 'black', 'לבן': 'white', 'לבנה': 'white', 'לבנים': 'white', 'אדום': 'red', 'אדומה': 'red',
  'כחול': 'blue', 'כחולה': 'blue', 'ירוק': 'green', 'ירוקה': 'green', 'ורוד': 'pink', 'ורודה': 'pink', 'אפור': 'gray', 'אפורה': 'gray',
  'סגול': 'purple', 'צהוב': 'yellow', 'כתום': 'orange', 'חום': 'brown', 'בז\'': 'beige', 'זהב': 'gold', 'כסף': 'silver', 'שקוף': 'transparent', 'שקופה': 'transparent',
  'עור': 'leather', 'עץ': 'wooden', 'מעץ': 'wooden', 'מתכת': 'metal', 'נירוסטה': 'stainless steel', 'סיליקון': 'silicone', 'כותנה': 'cotton', 'פלסטיק': 'plastic',
  'לנשים': 'women', 'נשים': 'women', 'לגברים': 'men', 'גברים': 'men', 'לילדים': 'kids', 'ילדים': 'kids', 'לילדות': 'girls', 'לבנים': 'boys', 'לתינוק': 'baby', 'לתינוקות': 'baby',
  'לבית ספר': 'school', 'בית ספר': 'school', 'לבית הספר': 'school', 'לגן': 'kindergarten',
  'לרכב': 'car', 'לבית': 'home', 'למטבח': 'kitchen', 'לחדר': 'room', 'לחדר שינה': 'bedroom', 'למשרד': 'office', 'לגינה': 'garden', 'למרפסת': 'balcony',
  'לטיולים': 'outdoor', 'לטיול': 'outdoor', 'לקמפינג': 'camping', 'לים': 'beach', 'לחורף': 'winter', 'לקיץ': 'summer', 'לחתונה': 'wedding',
  'גיימינג': 'gaming', 'ספורט': 'sports', 'לספורט': 'sports', 'לריצה': 'running', 'לכושר': 'fitness', 'לאופניים': 'bike', 'לאופנוע': 'motorcycle',
  'לאייפון': 'iphone', 'אייפון': 'iphone', 'לאיפון': 'iphone', 'איפון': 'iphone', 'לסמסונג': 'samsung', 'סמסונג': 'samsung', 'גלקסי': 'galaxy',
  'לשיאומי': 'xiaomi', 'שיאומי': 'xiaomi', 'אפל': 'apple', 'לאפל': 'apple', 'אפל ווטש': 'apple watch', 'איירפודס': 'airpods', 'אייפד': 'ipad', 'לאייפד': 'ipad',
  'מקבוק': 'macbook', 'פלייסטיישן': 'ps5', 'לפלייסטיישן': 'ps5', 'אקסבוקס': 'xbox', 'נינטנדו': 'nintendo switch', 'סוויץ\'': 'nintendo switch',
  'בייסוס': 'baseus', 'יוגרין': 'ugreen', 'אנקר': 'anker', 'לנובו': 'lenovo', 'שיאומי רדמי': 'redmi', 'רדמי': 'redmi', 'הואווי': 'huawei', 'וונשן': 'vention',
  'פרו': 'pro', 'מקס': 'max', 'פרו מקס': 'pro max', 'אולטרה': 'ultra', 'פלוס': 'plus', 'לייט': 'lite',
  'טייפ סי': 'type c', 'יו אס בי': 'usb', 'מגה הרץ': 'mhz',
};
// Words that carry no product meaning (dropped).
const STOP = new Set(['של', 'עם', 'בלי', 'ל', 'על', 'את', 'או', 'גם', 'הכי', 'טוב', 'טובה', 'טובים', 'זול', 'זולה', 'זולים', 'איכותי', 'איכותית', 'מומלץ', 'מומלצת', 'חדש', 'חדשה', 'חדשים',
  'מקורי', 'מקורית', 'יפה', 'יפים', 'מגניב', 'מגניבים', 'במבצע', 'מבצע', 'הנחה', 'אחד', 'אחת', 'זוג', 'סט', 'ערכה', 'עבור', 'בשביל', 'אני', 'רוצה', 'מחפש', 'מחפשת', 'צריך', 'צריכה', 'עליאקספרס', 'אליאקספרס', 'אלי', 'אקספרס', 'מאלי']);

const NIQQUD = /[֑-ׇ]/g;
const norm = (s) => String(s || '').replace(NIQQUD, '').replace(/[״"]/g, '"').replace(/[׳`']/g, '\'').replace(/[־–—]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();

// Index: every Hebrew phrase → head entry, longest first.
const HEAD_INDEX = HEADS.flatMap(([he, en, m, x]) => he.map((p) => [norm(p), { en, m, x }])).sort((a, b) => b[0].split(' ').length - a[0].split(' ').length || b[0].length - a[0].length);
const MOD_INDEX = Object.entries(MODS).map(([he, en]) => [norm(he), en]).sort((a, b) => b[0].split(' ').length - a[0].split(' ').length || b[0].length - a[0].length);

// Lighter forms of a Hebrew word: drop a leading ו/ה/ל/ב/מ/ש/כ (one or two), plural/feminine endings.
function variants(w) {
  const out = new Set([w]);
  const strip = (x) => { const r = []; if (x.length > 3 && /^[והלבמשכ]/.test(x)) r.push(x.slice(1)); if (x.length > 4 && /^(וה|של|מה|לה|בה|וב|ול|כש|שה)/.test(x)) r.push(x.slice(2)); return r; };
  for (const x of [w, ...strip(w)]) {
    out.add(x);
    if (x.length > 4 && /(ים|ות)$/.test(x)) { out.add(x.slice(0, -2)); out.add(x.slice(0, -2) + 'ה'); out.add(x.slice(0, -2) + 'ת'); }
    if (x.length > 3 && /ה$/.test(x)) out.add(x.slice(0, -1));
    if (x.length > 3 && /ית$/.test(x)) out.add(x.slice(0, -1));
  }
  return [...out];
}

/** Hebrew (or mixed) query → English AliExpress keywords + relevance rules. */
export function translateQuery(q) {
  const src = norm(q).replace(/[^\p{L}\p{N}\s.'"+\-]/gu, ' ').replace(/\s+/g, ' ').trim();
  const words = src.split(' ').filter(Boolean);
  const used = new Array(words.length).fill(false);
  let head = null;
  const soft = [];
  const latin = [];
  const parts = []; // [position, english] in query order ("16 פרו" → "16 pro")
  const unknown = [];
  // 1) longest head phrase anywhere in the query (with prefix/plural variants for single words)
  const tryPhrase = (index, onHit, limit = 4) => {
    for (let n = Math.min(limit, words.length); n >= 1; n--) {
      for (let i = 0; i + n <= words.length; i++) {
        if (used.slice(i, i + n).some(Boolean)) continue;
        const chunk = words.slice(i, i + n);
        const forms = n === 1 ? variants(chunk[0]) : [chunk.join(' '), [variants(chunk[0]).slice(1)[0] || chunk[0], ...chunk.slice(1)].join(' ')];
        for (const f of forms) {
          const hit = index.find(([he]) => he === f);
          if (hit) { onHit(hit[1], i, n); for (let k = i; k < i + n; k++) used[k] = true; return true; }
        }
      }
    }
    return false;
  };
  tryPhrase(HEAD_INDEX, (h) => { head = h; });
  // 2) modifiers (repeat until no more matches)
  while (tryPhrase(MOD_INDEX, (en, i) => { if (!soft.includes(en)) { soft.push(en); parts.push([i, en]); } })) { /* keep matching */ }
  // 3) the rest: Latin words/numbers are kept (brands, models, sizes); Hebrew stop words dropped; others unknown
  words.forEach((w, i) => {
    if (used[i]) return;
    if (/^[a-z0-9][a-z0-9.+\-]*$/i.test(w)) { latin.push(w); parts.push([i, w]); }
    else if (!STOP.has(w) && !variants(w).some((v) => STOP.has(v))) unknown.push(w);
  });
  const extra = [...soft, ...latin];
  const en = [head?.en, ...parts.sort((a, b) => a[0] - b[0]).map((x) => x[1])].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  // A query of only Latin words (e.g. "baseus 65w") is already English: the brand/model must appear in the title.
  const must = head ? [R(head.m)] : latin.filter((w) => /[a-z]{3,}/i.test(w)).slice(0, 2).map((w) => R(w.replace(/[.+\-]/g, '\\$&')));
  const not = head?.x ? R(`\\b(${head.x})`) : null;
  return { en, head: head?.en || '', must, not, soft: extra.map((s) => s.toLowerCase()), understood: !!(head || latin.length), unknown };
}

/**
 * Is this listing the product itself (not an accessory for it)? The product type must appear near the start of the
 * English title and before any "for …" ("Cleaning pen for earbuds", "Charger for Galaxy Watch" are accessories).
 */
export function onTopic(title, t) {
  if (!t.must.every((re) => re.test(title))) return false;
  if (!t.must.length) return true;
  if (t.not && t.not.test(title.slice(0, 90))) return false;
  const acc = title.slice(0, 70).match(ACCESSORY);
  if (acc && !t.must[0].test(acc[0])) return false;
  const at = title.search(t.must[0]);
  const forAt = title.search(/\b(for|compatible with|replacement|fits)\b/i);
  if (at > 80 || (forAt >= 0 && at > forAt)) return false;
  // Another product type named before ours means it's that product ("COB LED Work Light ... Power Bank" is a lamp).
  const before = title.slice(0, at).toLowerCase();
  return !OTHER_NOUNS.some((n) => new RegExp(`\\b${n}s?\\b`).test(before) && !t.must[0].test(n));
}
// Strong signs of an accessory/part/toy version of a product (checked at the start of the title).
const ACCESSORY = /\b(cleaning|cleaner|clean pen|ear ?tips|eartips|replacement|spare|parts|keychain|key ?chain|keyring|fidget|stickers?|decals?|skins?|dust plug|anti-?dust plug|dummy|model toy|miniature|toy)\b/i;
const OTHER_NOUNS = ['lamp', 'light', 'flashlight', 'torch', 'lantern', 'fan', 'cable', 'case', 'cover', 'holder', 'mount', 'stand', 'charger', 'strap', 'band',
  'box', 'bag', 'organizer', 'sticker', 'film', 'protector', 'brush', 'pen', 'mat', 'pouch', 'sleeve', 'adapter', 'hub', 'speaker', 'keyboard', 'mouse', 'cleaner', 'kit'];

/**
 * Filters and orders search results: on topic (must), real track record (rating/sold), then
 * more matching soft terms first, then best sellers. `items` need an English title in `en` (or `title`).
 */
export function rankResults(items, t, { minRating = 88, minSold = 50, limit = 20 } = {}) {
  const seen = new Set();
  return items
    .filter((p) => p && p.price > 0 && p.link && (p.rating || 0) >= minRating && (p.sold || 0) >= minSold)
    .filter((p) => onTopic(String(p.en || p.title || ''), t))
    .filter((p) => {
      // one listing per product: same id, or the same opening words (the same item from several sellers)
      const k = String(p.id), k2 = String(p.en || p.title || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ').slice(0, 6).join(' ');
      if (seen.has(k) || seen.has(k2)) return false; seen.add(k); seen.add(k2); return true;
    })
    .map((p) => { const title = String(p.en || p.title || '').toLowerCase(); const score = t.soft.reduce((s, w) => s + (title.includes(w) ? 1 : 0), 0); return { p, score }; })
    .sort((a, b) => b.score - a.score || b.p.sold - a.p.sold)
    .slice(0, limit)
    .map((x) => x.p);
}

/** Popular searches for the UI chips (each one is known to translate well). */
export const SEARCH_CHIPS = [
  ['🎧', 'אוזניות אלחוטיות'], ['⌚', 'שעון חכם'], ['🔋', 'סוללה ניידת'], ['🚗', 'מחזיק טלפון לרכב'], ['💡', 'פס לד'],
  ['⌨️', 'מקלדת מכנית'], ['📱', 'כיסוי לאייפון'], ['🏕️', 'ציוד קמפינג'], ['🧸', 'צעצועים לילדים'], ['🐶', 'מוצרים לכלב'],
];
