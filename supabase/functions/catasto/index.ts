// Campo e Stalla — collegamento al catasto dell'Agenzia delle Entrate (funzione Supabase "catasto").
// I servizi cartografici dell'Agenzia non permettono le richieste dirette dalle pagine web (CORS):
// questa funzione le inoltra e aggiunge le intestazioni necessarie. Passano solo dati cartografici pubblici (CC BY 4.0).
// Installazione: Supabase → Edge Functions → Deploy a new function → Via Editor → nome "catasto" → incolla → Deploy.
const AMMESSI = ['wfs.cartografia.agenziaentrate.gov.it', 'wms.cartografia.agenziaentrate.gov.it'];
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'GET, OPTIONS' };

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'GET') return new Response('Metodo non ammesso', { status: 405, headers: CORS });
  let t: URL;
  try { t = new URL(new URL(req.url).searchParams.get('u') || ''); } catch (_) { return new Response('Indirizzo mancante', { status: 400, headers: CORS }); }
  if (t.protocol !== 'https:' || !AMMESSI.includes(t.hostname)) return new Response('Servizio non ammesso', { status: 403, headers: CORS });
  const r = await fetch(t.toString(), { headers: { 'User-Agent': 'CampoEStalla/1.0' } });
  return new Response(r.body, { status: r.status, headers: { ...CORS, 'Content-Type': r.headers.get('Content-Type') || 'text/xml', 'Cache-Control': 'public, max-age=1800' } });
});
