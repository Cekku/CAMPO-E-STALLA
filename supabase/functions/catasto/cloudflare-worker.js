// Campo e Stalla — collegamento al catasto dell'Agenzia delle Entrate come Cloudflare Worker (alternativa alla funzione Supabase).
// Cloudflare → Workers & Pages → Create → Create Worker → Deploy → Edit code → incolla questo file → Deploy.
// Poi copia l'indirizzo del worker (https://nome.tuo-account.workers.dev) in Campo e Stalla → La mia azienda → Catasto.
const AMMESSI = ['wfs.cartografia.agenziaentrate.gov.it', 'wms.cartografia.agenziaentrate.gov.it'];
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type', 'Access-Control-Allow-Methods': 'GET, OPTIONS' };
export default {
  async fetch(req) {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (req.method !== 'GET') return new Response('Metodo non ammesso', { status: 405, headers: CORS });
    let t;
    try { t = new URL(new URL(req.url).searchParams.get('u') || ''); } catch (e) { return new Response('Indirizzo mancante', { status: 400, headers: CORS }); }
    if (t.protocol !== 'https:' || !AMMESSI.includes(t.hostname)) return new Response('Servizio non ammesso', { status: 403, headers: CORS });
    const r = await fetch(t.toString(), { headers: { 'User-Agent': 'CampoEStalla/1.0' }, cf: { cacheTtl: 1800, cacheEverything: true } });
    const h = new Headers(CORS); h.set('Content-Type', r.headers.get('Content-Type') || 'text/xml'); h.set('Cache-Control', 'public, max-age=1800');
    return new Response(r.body, { status: r.status, headers: h });
  },
};
