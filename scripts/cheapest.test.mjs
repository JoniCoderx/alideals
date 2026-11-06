import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { parseProductInput, keywordsFromTitle, titleSimilarity, rankAlternatives, normalizeProduct } from './cheapest-lib.mjs';
import worker, { findCheapest, aliCall } from '../worker/src/index.mjs';

test('parses product ids from every common link shape', () => {
  assert.equal(parseProductInput('https://he.aliexpress.com/item/1005006123456789.html?spm=a2g0o').id, '1005006123456789');
  assert.equal(parseProductInput('https://www.aliexpress.com/item/1005006123456789.html').id, '1005006123456789');
  assert.equal(parseProductInput('https://m.aliexpress.com/item/1005006123456789.html').id, '1005006123456789');
  assert.equal(parseProductInput('בדקו את זה https://he.aliexpress.com/item/1005006123456789.html שווה!').id, '1005006123456789');
  assert.equal(parseProductInput('1005006123456789').id, '1005006123456789');
  assert.equal(parseProductInput('https://a.aliexpress.com/_mKzX9Ab').shortUrl, 'https://a.aliexpress.com/_mKzX9Ab');
  assert.equal(parseProductInput('https://evil.com/item/1005006123456789.html').id, null);
  assert.equal(parseProductInput('hello').id, null);
});

test('keywords drop marketing noise; similarity tolerates word order', () => {
  assert.equal(keywordsFromTitle('2026 NEW Hot Sale TWS Wireless Earbuds Bluetooth 5.3 Noise Cancelling Headphones for iPhone'), 'tws wireless earbuds bluetooth noise cancelling headphones');
  assert.ok(titleSimilarity('TWS Wireless Earbuds Bluetooth 5.3', 'Bluetooth 5.3 Wireless TWS Earbuds Sport') > 0.7);
  assert.ok(titleSimilarity('TWS Wireless Earbuds', 'Kitchen Knife Set Steel') < 0.1);
});

test('rankAlternatives keeps close, well-rated, cheaper listings sorted by price', () => {
  const original = { id: '1', title: 'TWS Wireless Earbuds Bluetooth 5.3 Noise Cancelling', price: 100 };
  const c = (id, title, price, rating = 95, sold = 100) => ({ id, title, price, rating, sold, link: 'https://s.click.aliexpress.com/e/_' + id });
  const out = rankAlternatives(original, [
    c('1', original.title, 100),                                        // same product → skipped
    c('2', 'Wireless TWS Earbuds Bluetooth 5.3 Noise Cancelling Sport', 60),
    c('3', 'Bluetooth 5.3 TWS Wireless Earbuds Noise Cancelling', 45),
    c('4', 'Kitchen Knife Set Steel', 10),                              // different product
    c('5', 'TWS Wireless Earbuds Bluetooth 5.3 Noise Cancelling', 30, 60), // bad rating
    c('6', 'TWS Wireless Earbuds Bluetooth 5.3 Noise Cancelling', 20, 95, 0), // no sales
  ]);
  assert.deepEqual(out.map((x) => x.id), ['3', '2']);
  assert.equal(out[0].savings, 55);
  assert.equal(out[0].savingsPct, 55);
});

// ---- Worker end-to-end with a mocked AliExpress gateway ----
const env = { ALI_APP_KEY: '123', ALI_APP_SECRET: 'secret', ALI_TRACKING_ID: 'yeshdeal', ALLOWED_ORIGIN: 'https://yeshdeal.com' };
const P = (id, title, price, extra = {}) => ({ product_id: id, product_title: title, product_main_image_url: `https://ae01.alicdn.com/kf/${id}.jpg`, target_sale_price: String(price), target_original_price: String(price * 2), target_sale_price_currency: 'ILS', evaluate_rate: '96.5%', lastest_volume: 500, shop_name: 'Shop ' + id, first_level_category_id: 44, promotion_link: `https://s.click.aliexpress.com/e/_${id}`, ...extra });

function mockGateway(calls) {
  return async (url, init) => {
    const params = Object.fromEntries(new URLSearchParams(init.body));
    calls.push(params);
    // verify signature exactly like the real gateway would
    const { sign, ...rest } = params;
    const base = Object.keys(rest).sort().map((k) => k + rest[k]).join('');
    assert.equal(sign, crypto.createHmac('sha256', env.ALI_APP_SECRET).update(base).digest('hex').toUpperCase());
    const wrap = (name, result) => new Response(JSON.stringify({ [`${name}_response`]: { resp_result: { resp_code: 200, result } } }));
    if (params.method === 'aliexpress.affiliate.productdetail.get') {
      const title = params.target_language === 'EN' ? 'TWS Wireless Earbuds Bluetooth 5.3 Noise Cancelling' : 'אוזניות אלחוטיות TWS בלוטות׳ 5.3 ביטול רעשים';
      return wrap('aliexpress_affiliate_productdetail_get', { products: { product: [P('1005000000000001', title, 120)] } });
    }
    if (params.method === 'aliexpress.affiliate.product.query') {
      return wrap('aliexpress_affiliate_product_query', { products: { product: [
        P('1005000000000002', 'Bluetooth 5.3 TWS Wireless Earbuds Noise Cancelling', 49),
        P('1005000000000003', 'Wireless TWS Earbuds Bluetooth 5.3 Noise Cancelling Sport', 79),
        P('1005000000000004', 'Phone Case Silicone', 5),
        P('1005000000000001', 'TWS Wireless Earbuds Bluetooth 5.3 Noise Cancelling', 120),
      ] } });
    }
    throw new Error('unexpected ' + params.method);
  };
}

test('findCheapest: signed calls, Israel/ILS params, cheaper matches with affiliate links', async () => {
  const calls = [];
  const r = await findCheapest(env, 'https://he.aliexpress.com/item/1005000000000001.html', mockGateway(calls));
  assert.equal(r.status, 200);
  assert.equal(r.body.original.price, 120);
  assert.deepEqual(r.body.alternatives.map((a) => a.id), ['1005000000000002', '1005000000000003']);
  assert.match(r.body.alternatives[0].link, /^https:\/\/s\.click\.aliexpress\.com\//);
  const q = calls.find((c) => c.method === 'aliexpress.affiliate.product.query');
  assert.equal(q.ship_to_country, 'IL');
  assert.equal(q.target_currency, 'ILS');
  assert.equal(q.sort, 'SALE_PRICE_ASC');
  assert.equal(q.tracking_id, 'yeshdeal');
  assert.match(q.keywords, /earbuds/);
});

test('worker: bad link → 400, not configured → 503, CORS header set', async () => {
  const req = (u) => new Request('https://api.example/api/cheapest?url=' + encodeURIComponent(u), { headers: { Origin: 'https://yeshdeal.com' } });
  const ctx = { waitUntil() {} };
  const r1 = await worker.fetch(req('https://google.com'), env, ctx);
  assert.equal(r1.status, 400);
  assert.equal(r1.headers.get('Access-Control-Allow-Origin'), 'https://yeshdeal.com');
  const r2 = await worker.fetch(req('https://he.aliexpress.com/item/1005000000000001.html'), {}, ctx);
  assert.equal(r2.status, 503);
});

test('aliCall surfaces gateway errors', async () => {
  const bad = async () => new Response(JSON.stringify({ error_response: { code: 'InvalidAppKey', msg: 'bad key' } }));
  await assert.rejects(() => aliCall(env, 'x', {}, bad), /InvalidAppKey/);
});

test('normalizeProduct parses prices and percentages', () => {
  const n = normalizeProduct(P('9', 'X', 12.5));
  assert.equal(n.price, 12.5);
  assert.equal(n.rating, 96.5);
});
