// Minimal client for the AliExpress Open Platform (Affiliate / Portals API).
// Docs: https://openservice.aliexpress.com  – gateway: https://api-sg.aliexpress.com/sync
// Zero dependencies: uses Node's built-in fetch + crypto.
import crypto from 'node:crypto';

const GATEWAY = 'https://api-sg.aliexpress.com/sync';

export function sign(params, secret) {
  const base = Object.keys(params)
    .filter((k) => k !== 'sign' && params[k] !== undefined && params[k] !== null && params[k] !== '')
    .sort()
    .map((k) => k + params[k])
    .join('');
  return crypto.createHmac('sha256', secret).update(base, 'utf8').digest('hex').toUpperCase();
}

export class AliExpressClient {
  constructor({ appKey, appSecret, trackingId, timeoutMs = 20000 }) {
    if (!appKey || !appSecret) throw new Error('Missing ALI_APP_KEY / ALI_APP_SECRET');
    this.appKey = String(appKey).trim();
    this.appSecret = String(appSecret).trim(); // secrets pasted with a trailing space/newline break the HMAC signature
    this.trackingId = trackingId ? String(trackingId).trim() : trackingId;
    this.timeoutMs = timeoutMs;
  }

  async call(method, bizParams = {}) {
    const params = {
      method,
      app_key: this.appKey,
      sign_method: 'sha256',
      timestamp: String(Date.now()),
      ...Object.fromEntries(Object.entries(bizParams).filter(([, v]) => v !== undefined && v !== null && v !== '')),
    };
    params.sign = sign(params, this.appSecret);

    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      const res = await fetch(GATEWAY, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' },
        body: new URLSearchParams(params).toString(),
        signal: ctrl.signal,
      });
      const json = await res.json();
      if (json.error_response) {
        throw new Error(`${method}: ${json.error_response.code} ${json.error_response.msg || ''}`.trim());
      }
      const key = Object.keys(json).find((k) => k.endsWith('_response'));
      const resp = key ? json[key] : json;
      const rr = resp.resp_result || resp.result || resp;
      if (rr.resp_code && Number(rr.resp_code) !== 200) {
        throw new Error(`${method}: resp_code ${rr.resp_code} ${rr.resp_msg || ''}`.trim());
      }
      return rr.result ?? rr;
    } finally {
      clearTimeout(t);
    }
  }

  /** Products shipped to Israel, priced in ILS, titles in Hebrew. */
  async searchProducts({ keywords, pageSize = 20, hot = true }) {
    const params = {
      keywords,
      page_no: 1,
      page_size: pageSize,
      sort: 'LAST_VOLUME_DESC',
      target_currency: 'ILS',
      target_language: 'HE',
      ship_to_country: 'IL',
      tracking_id: this.trackingId,
      fields:
        'product_id,product_title,product_main_image_url,target_sale_price,target_original_price,discount,promotion_link,evaluate_rate,lastest_volume,first_level_category_name,shop_name',
    };
    let result;
    try {
      result = await this.call(hot ? 'aliexpress.affiliate.hotproduct.query' : 'aliexpress.affiliate.product.query', params);
    } catch (e) {
      if (!hot) throw e;
      result = await this.call('aliexpress.affiliate.product.query', params);
    }
    const list = result?.products?.product ?? [];
    return list.map(normalizeProduct).filter((p) => p.link && p.image);
  }

  /** Turn any AliExpress URL into a tracked affiliate link. Returns Map(source -> promoLink). */
  async generateLinks(urls) {
    const out = new Map();
    const unique = [...new Set(urls.filter(Boolean))];
    for (let i = 0; i < unique.length; i += 20) {
      const chunk = unique.slice(i, i + 20);
      const result = await this.call('aliexpress.affiliate.link.generate', {
        promotion_link_type: 0,
        source_values: chunk.join(','),
        tracking_id: this.trackingId,
      });
      for (const l of result?.promotion_links?.promotion_link ?? []) {
        if (l.promotion_link) out.set(l.source_value, l.promotion_link);
      }
    }
    return out;
  }

  /** Official featured promotions (campaign names such as 11.11, Choice Day…). */
  async featuredPromos() {
    const result = await this.call('aliexpress.affiliate.featuredpromo.get', {
      fields: 'promo_name,promo_desc,product_num',
    });
    return result?.promos?.promo ?? [];
  }
}

function normalizeProduct(p) {
  const sale = parseFloat(p.target_sale_price);
  const orig = parseFloat(p.target_original_price);
  return {
    id: String(p.product_id),
    title: (p.product_title || '').trim(),
    image: p.product_main_image_url,
    price: Number.isFinite(sale) ? sale : null,
    originalPrice: Number.isFinite(orig) ? orig : null,
    discount: p.discount || (sale && orig && orig > sale ? Math.round((1 - sale / orig) * 100) + '%' : ''),
    rating: p.evaluate_rate || '',
    sold: Number(p.lastest_volume) || 0,
    category: p.first_level_category_name || '',
    shop: p.shop_name || '',
    link: p.promotion_link,
  };
}
