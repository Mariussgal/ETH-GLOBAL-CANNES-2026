
export interface Env {}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET',
        },
      });
    }

    const url = new URL(request.url);
    const parts = url.pathname.split('/').filter(Boolean);

    if (parts.length < 2 || parts[0] !== 'fees') {
      return new Response(
        JSON.stringify({ error: 'Usage: GET /fees/{protocol-slug}' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const slug = decodeURIComponent(parts[1]);

    const cache = caches.default;
    const cacheKey = new Request(`https://ysm-proxy-cache/fees/${slug}`);
    const cached = await cache.match(cacheKey);
    if (cached) {
      const r = cached.clone();

      const headers = new Headers(r.headers);
      headers.set('X-Cache', 'HIT');
      return new Response(r.body, { status: r.status, headers });
    }

    const llamaUrl = `https://api.llama.fi/summary/fees/${slug}?dataType=dailyFees`;
    let llamaResp: Response;
    try {
      llamaResp = await fetch(llamaUrl, {
        headers: { 'Accept': 'application/json' },
        cf: { cacheTtl: 3600 } 
      });
    } catch (e: any) {
      return new Response(
        JSON.stringify({ error: 'DeFiLlama unreachable', detail: e.message }),
        { status: 502, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!llamaResp.ok) {
      return new Response(
        JSON.stringify({ error: `DeFiLlama error ${llamaResp.status}`, slug }),
        { status: 502, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const data: any = await llamaResp.json();

    const chart: [number, number][] = data.totalDataChart || [];
    const n = chart.length;

    if (n === 0) {
      return new Response(
        JSON.stringify({ error: 'No fee data for this protocol', slug }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const values = chart.map(([_, v]) => v);

    const yesterdayFees = values[n - 1] ?? 0;

    const last30 = values.slice(Math.max(0, n - 30));
    const avg30 = last30.reduce((s, v) => s + v, 0) / last30.length;

    const prev60 = values.slice(Math.max(0, n - 90), Math.max(0, n - 30));
    const avg60prev = prev60.length > 0
      ? prev60.reduce((s, v) => s + v, 0) / prev60.length
      : avg30;

    const rScore = avg60prev > 0
      ? Math.min(Math.max(avg30 / avg60prev, 0), 2.0)
      : 1.0;

    const result = {
      slug,

      rScore: Math.round(rScore * 1000) / 1000,       

      avg30: Math.round(avg30),                        
      daysOfData: n,                                   

      yesterdayFees: Math.round(yesterdayFees),        

      avg60prev: Math.round(avg60prev),
      updatedAt: new Date().toISOString(),
    };

    const responseBody = JSON.stringify(result);

    const response = new Response(responseBody, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3600',   
        'Access-Control-Allow-Origin': '*',
        'X-Cache': 'MISS',
        'X-Response-Size': String(responseBody.length),
      },
    });

    ctx.waitUntil(cache.put(cacheKey, response.clone()));

    return response;
  },
};
