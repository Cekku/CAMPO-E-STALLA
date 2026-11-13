// Campo e Stalla — chat "Chiedi" (funzione Supabase "chiedi").
// Passa le domande della chat a Claude (API di Anthropic) senza mettere la chiave nell'app: la chiave sta nei segreti
// della funzione (Supabase → Edge Functions → Secrets → ANTHROPIC_API_KEY). Risponde solo a chi ha fatto l'accesso
// ed è nell'azienda indicata (regola is_member del database). I dati dell'azienda non passano da qui in blocco:
// arrivano solo la domanda e i risultati degli strumenti che l'app ha calcolato nel browser.
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const MODELLI = ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'];
const CAMPI = ['model', 'max_tokens', 'system', 'messages', 'tools', 'tool_choice', 'output_config', 'thinking', 'fallbacks', 'cache_control'];
const BETA = ['server-side-fallback-2026-07-01'];
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const errore = (testo: string, status: number) => json({ type: 'error', error: { type: 'chiedi', message: testo } }, status);

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return errore('Metodo non ammesso', 405);
  const chiave = Deno.env.get('ANTHROPIC_API_KEY');
  if (!chiave) return errore('Manca la chiave di Claude: in Supabase → Edge Functions → Secrets aggiungi ANTHROPIC_API_KEY', 503);
  const auth = req.headers.get('authorization') || '';
  if (!/^Bearer .{20,}/.test(auth)) return errore('Accedi all\'azienda per usare Claude', 401);
  let corpo: { farm?: string; body?: Record<string, unknown> };
  try { corpo = await req.json(); } catch (_) { return errore('Richiesta non leggibile', 400); }
  const farm = String(corpo.farm || '');
  if (!/^[0-9a-f-]{36}$/i.test(farm)) return errore('Azienda mancante', 400);

  // chi chiede deve essere nell'azienda: lo controlla il database con il suo accesso
  const url = Deno.env.get('SUPABASE_URL'), anon = Deno.env.get('SUPABASE_ANON_KEY');
  const r = await fetch(`${url}/rest/v1/rpc/is_member`, { method: 'POST', headers: { apikey: anon || '', authorization: auth, 'content-type': 'application/json' }, body: JSON.stringify({ f: farm }) });
  if (!r.ok || (await r.json()) !== true) return errore('Non fai parte di questa azienda', 403);

  const b = corpo.body || {};
  if (!MODELLI.includes(String(b.model))) return errore('Modello non ammesso', 400);
  const fuori: Record<string, unknown> = {};
  for (const k of CAMPI) if (k in b) fuori[k] = b[k];
  fuori.max_tokens = Math.min(Number(b.max_tokens) || 4000, 8000);
  const beta = (req.headers.get('anthropic-beta') || '').split(',').map(s => s.trim()).filter(s => BETA.includes(s));

  const a = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': chiave, 'anthropic-version': '2023-06-01', 'content-type': 'application/json', ...(beta.length ? { 'anthropic-beta': beta.join(',') } : {}) },
    body: JSON.stringify(fuori),
  });
  return new Response(a.body, { status: a.status, headers: { ...CORS, 'Content-Type': 'application/json' } });
});
