// Campo e Stalla — rassegna del giorno e prezzi di mercato (funzione Supabase "rassegna").
//
// Ogni mattina (pg_cron, vedi supabase/aggiornamento-rassegna.sql) e quando un utente preme "Aggiorna adesso":
//  1. legge i prezzi dalle pagine pubbliche di CLAL e Teseo (listini di Borse merci e Camere di commercio);
//  2. per ogni azienda con dei portali (raccolta "fonti") legge i feed e tiene gli articoli nuovi;
//  3. se c'è la chiave di Claude (segreto ANTHROPIC_API_KEY) fa scrivere riassunto, analisi e prospettive;
//  4. scrive nella tabella records: "mercati" (una serie per riga) e "rassegna" (una pagina al giorno, id = data).
// Senza la chiave la pagina del giorno ha solo gli articoli: il riassunto si può fare nell'app con l'IA del PC.
// La funzione scrive con la chiave di servizio (segreto automatico SUPABASE_SERVICE_ROLE_KEY) e tocca solo
// le raccolte fonti (lettura), rassegna e mercati; mai le raccolte riservate dei Conti.
import { SERIE, leggiSerie, leggiFeed, trovaFeed, sembraFeed, riepilogo, SCHEMA, ISTRUZIONI, messaggioUtente, componi } from '../_shared/mercati.js';

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const URL_SB = Deno.env.get('SUPABASE_URL') || '';
const SERVIZIO = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const ANON = Deno.env.get('SUPABASE_ANON_KEY') || '';
const MODELLI = ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'];
const MODELLO = MODELLI.includes(Deno.env.get('RASSEGNA_MODELLO') || '') ? Deno.env.get('RASSEGNA_MODELLO')! : 'claude-opus-5-5';
const PREZZI: Record<string, [number, number]> = { 'claude-opus-5-5': [4, 20], 'claude-sonnet-5-5': [2, 10], 'claude-haiku-5-5': [0.1, 0.5] }; // $ per milione di token
const UA = 'Mozilla/5.0 (compatible; CampoEStalla-Rassegna/1.0)';
const MAX_ARTICOLI = 30, PER_FONTE = 6, GIORNI = 4;

type Rec = { farm_id: string; col: string; id: string; data: Record<string, unknown>; deleted?: boolean };
type Articolo = { titolo: string; link: string; data: string; testo: string; fonte: string; argomento: string };

const oggi = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Rome' }).format(new Date());

async function db(percorso: string, init: RequestInit = {}) {
  const r = await fetch(`${URL_SB}/rest/v1/${percorso}`, { ...init, headers: { apikey: SERVIZIO, authorization: `Bearer ${SERVIZIO}`, 'content-type': 'application/json', ...(init.headers || {}) } });
  if (!r.ok) throw new Error(`database ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.status === 204 || init.method === 'POST' ? null : r.json();
}
const scrivi = (righe: Rec[]) => righe.length ? db('records?on_conflict=farm_id,col,id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(righe.map(r => ({ ...r, deleted: false }))) }) : null;

async function scarica(url: string, ms = 10000): Promise<string> {
  const r = await fetch(url, { headers: { 'user-agent': UA, accept: 'text/html,application/rss+xml,application/atom+xml,application/xml;q=0.9,*/*;q=0.8' }, redirect: 'follow', signal: AbortSignal.timeout(ms) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return await r.text();
}

/* ---------- prezzi ---------- */
async function leggiPrezzi() {
  const pagine: Record<string, Promise<string>> = {};
  for (const s of SERIE) pagine[s.url] = pagine[s.url] || scarica(s.url, 15000);
  const serie: Record<string, { mesi: Record<string, number>; sett: [string, number][] }> = {}, errori: Record<string, string> = {};
  for (const s of SERIE) {
    try {
      const v = leggiSerie(s, await pagine[s.url]);
      if (Object.keys(v.mesi).length || v.sett.length) serie[s.id] = v; else errori[s.id] = 'tabella non trovata (la pagina è cambiata?)';
    } catch (e) { errori[s.id] = String((e as Error).message || e); }
  }
  return { serie, errori };
}

/* ---------- articoli ---------- */
async function leggiFonte(f: { url: string }) {
  const t = await scarica(f.url);
  if (sembraFeed(t)) return leggiFeed(t);
  const alt = trovaFeed(t, f.url) || new URL('/feed/', f.url).href;
  const t2 = await scarica(alt);
  if (!sembraFeed(t2)) throw new Error('nessun feed RSS trovato in questo indirizzo');
  return leggiFeed(t2);
}

/* ---------- Claude ---------- */
async function chiediClaude(chiave: string, articoli: Articolo[], mercati: unknown) {
  const corpo = {
    model: MODELLO, max_tokens: 16000,
    system: [{ type: 'text', text: ISTRUZIONI, cache_control: { type: 'ephemeral' } }],
    // effort basso: il lavoro è riassumere, e la funzione ha un tempo massimo (150 s nel piano gratuito)
    output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
    fallbacks: 'default',
    messages: [{ role: 'user', content: messaggioUtente(articoli, mercati, oggi()) }],
  };
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST', signal: AbortSignal.timeout(100000),   // 15 s prezzi + 20 s feed + 100 s Claude: sotto i 150 s
    headers: { 'x-api-key': chiave, 'anthropic-version': '2023-06-01', 'anthropic-beta': 'server-side-fallback-2026-07-01', 'content-type': 'application/json' },
    body: JSON.stringify(corpo),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(`Claude ${r.status}: ${d?.error?.message || ''}`);
  if (d.stop_reason === 'refusal') throw new Error('Claude non ha voluto rispondere su questi articoli');
  if (d.stop_reason === 'max_tokens') throw new Error('risposta di Claude troppo lunga, interrotta');
  const testo = (d.content || []).filter((b: { type: string }) => b.type === 'text').map((b: { text: string }) => b.text).join('');
  const u = d.usage || {}, p = PREZZI[d.model] || PREZZI[MODELLO];
  const costo = ((u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) * 1.25 + (u.cache_read_input_tokens || 0) * 0.1) / 1e6 * p[0] + (u.output_tokens || 0) / 1e6 * p[1];
  return { uscita: JSON.parse(testo), modello: d.model || MODELLO, costo: Math.round(costo * 1000) / 1000 };
}

/* ---------- un giro ---------- */
async function giro(soloFarm: string | null, rifai: boolean) {
  const giorno = oggi();
  const { serie, errori: erroriPrezzi } = await leggiPrezzi();
  const mercati = riepilogo(serie);
  const fonti = (await db(`records?col=eq.fonti&deleted=eq.false&select=farm_id,id,data${soloFarm ? `&farm_id=eq.${soloFarm}` : ''}`)) as Rec[];
  const perFarm = new Map<string, Rec[]>();
  for (const f of fonti) if (f.data && f.data.attiva !== false && /^https?:\/\//.test(String(f.data.url || ''))) perFarm.set(f.farm_id, [...(perFarm.get(f.farm_id) || []), f]);
  if (soloFarm && !perFarm.has(soloFarm)) perFarm.set(soloFarm, []);

  // tutti i feed insieme, ognuno una volta sola: il giro deve stare nel tempo massimo della funzione
  const urls = [...new Set([...perFarm.values()].flat().map(f => String(f.data.url)))];
  const letti = new Map<string, { ok: boolean; a?: ReturnType<typeof leggiFeed>; e?: string }>();
  await Promise.all(urls.map(u => leggiFonte({ url: u }).then(a => letti.set(u, { ok: true, a }), e => letti.set(u, { ok: false, e: String((e as Error).message || e) }))));
  const chiave = Deno.env.get('ANTHROPIC_API_KEY');
  const esiti: Record<string, unknown> = {};
  for (const [farm, ff] of perFarm) {
    // prezzi: una riga per serie
    await scrivi(SERIE.filter(s => serie[s.id]).map(s => ({ farm_id: farm, col: 'mercati', id: s.id, data: { id: s.id, nome: s.nome, gruppo: s.gruppo, unita: s.unita, fonte: s.fonte, url: s.url, mesi: serie[s.id].mesi, sett: serie[s.id].sett, aggiornato: new Date().toISOString() } })));
    // senza portali: solo i prezzi, niente pagina
    if (!ff.length) { esiti[farm] = 'nessun portale: solo i prezzi'; continue; }

    const prima = ((await db(`records?farm_id=eq.${farm}&col=eq.rassegna&deleted=eq.false&select=id,data&order=id.desc&limit=13`)) || []) as Rec[];
    const diOggi = prima.find(r => r.id === giorno);
    const dOggi = (diOggi ? diOggi.data : {}) as Record<string, any>;
    // ogni giro costa: quello del mattino solo se oggi Claude non l'ha già fatta; quelli a mano non prima di 15 minuti
    // dall'ultimo tentativo, qualunque sia stato l'esito (il segno "giro" si scrive prima di chiamare Claude)
    const segno = prima.find(r => r.id === 'giro');
    const ultimo = segno ? Date.parse(String((segno.data as any).inizio || 0)) : 0;
    if (!rifai && dOggi.motore === 'claude') { esiti[farm] = 'già fatta oggi'; continue; }
    if (rifai && Date.now() - ultimo < 15 * 60000) { esiti[farm] = 'aggiornata da poco: riprova fra qualche minuto'; continue; }
    await scrivi([{ farm_id: farm, col: 'rassegna', id: 'giro', data: { inizio: new Date().toISOString(), aMano: rifai } }]);

    const visti = new Set<string>(prima.filter(r => /^\d{4}-\d{2}-\d{2}$/.test(r.id) && r.id !== giorno).flatMap(r => ((r.data as any).visti || []) as string[]));
    const limite = Date.now() - GIORNI * 864e5;
    const articoli: Articolo[] = [], erroriFonti: Record<string, string> = {};
    for (const f of ff) {
      const url = String(f.data.url), l = letti.get(url);
      if (!l || !l.ok) { erroriFonti[String(f.data.nome || url)] = (l && l.e) || 'non letto'; continue; }
      const nuovi = l.a!.filter(a => !visti.has(a.link) && (!a.data || Date.parse(a.data) >= limite)).slice(0, PER_FONTE);
      for (const a of nuovi) articoli.push({ ...a, fonte: String(f.data.nome || new URL(url).hostname), argomento: String(f.data.argomento || 'altro') });
    }
    articoli.sort((a, b) => b.data.localeCompare(a.data));
    const scelti = articoli.slice(0, MAX_ARTICOLI);
    const pagina: Record<string, unknown> = {
      giorno, creato: new Date().toISOString(), visti: scelti.map(a => a.link),   // gli avanzati restano per domani
      articoli: scelti.map(a => ({ titolo: a.titolo, link: a.link, fonte: a.fonte, argomento: a.argomento, data: a.data, testo: a.testo.slice(0, 1200) })),
      mercati: null, motore: 'nessuno', erroriFonti, erroriPrezzi,
    };
    // il riassunto dell'IA del PC già fatto oggi non si perde: diventa la seconda opinione
    if (dOggi.motore === 'pc') pagina.secondo = { titolo: dOggi.titolo, sintesi: dOggi.sintesi, argomenti: dOggi.argomenti, analisi: dOggi.analisi, prospettive: dOggi.prospettive, mercati: dOggi.mercati, motore: 'pc', modello: dOggi.modello };
    else if (dOggi.secondo) pagina.secondo = dOggi.secondo;
    // senza articoli nuovi: una pagina con i soli mercati, una volta al giorno
    if (!scelti.length && diOggi) { esiti[farm] = 'nessun articolo nuovo'; continue; }
    if (chiave) {
      try { const c = await chiediClaude(chiave, scelti, mercati); Object.assign(pagina, componi(c.uscita, scelti), { motore: 'claude', modello: c.modello, costo: c.costo }); }
      catch (e) { pagina.erroreIA = String((e as Error).message || e); }
    }
    await scrivi([{ farm_id: farm, col: 'rassegna', id: giorno, data: pagina }]);
    esiti[farm] = { articoli: scelti.length, motore: pagina.motore, errore: pagina.erroreIA || null };
  }
  return { giorno, serie: Object.keys(serie).length, erroriPrezzi, aziende: esiti };
}

// lavoro dopo la risposta (EdgeRuntime.waitUntil di Supabase); gli errori finiscono nei log della funzione
declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;
function dopo(p: Promise<unknown>) {
  const q = p.then(r => console.log('rassegna', JSON.stringify(r)), e => console.error('rassegna', String((e as Error)?.message || e)));
  if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime) EdgeRuntime.waitUntil(q);
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ errore: 'Metodo non ammesso' }, 405);
  let corpo: { farm?: string; rifai?: boolean } = {};
  try { corpo = await req.json(); } catch (_) { /* corpo vuoto */ }
  const segreto = Deno.env.get('RASSEGNA_SEGRETO');
  try {
    // giro del mattino: lo chiama pg_cron con il segreto, per tutte le aziende
    // (lavora dopo la risposta: il giro può durare più di un minuto)
    if (segreto && req.headers.get('x-rassegna-segreto') === segreto) { dopo(giro(null, false)); return json({ avviato: true }, 202); }
    // "Aggiorna adesso" dall'app: chi chiede deve poter scrivere nell'azienda (titolare o membro, non i lettori)
    const auth = req.headers.get('authorization') || '';
    const farm = String(corpo.farm || '');
    if (!/^Bearer .{20,}/.test(auth) || !/^[0-9a-f-]{36}$/i.test(farm)) return json({ errore: 'Accedi all\'azienda per aggiornare la rassegna' }, 401);
    const r = await fetch(`${URL_SB}/rest/v1/rpc/can_write`, { method: 'POST', headers: { apikey: ANON, authorization: auth, 'content-type': 'application/json' }, body: JSON.stringify({ f: farm }) });
    if (!r.ok || (await r.json()) !== true) return json({ errore: 'Non puoi aggiornare la rassegna di questa azienda' }, 403);
    // l'app non aspetta: la pagina arriva con la sincronizzazione
    dopo(giro(farm, !!corpo.rifai));
    return json({ avviato: true }, 202);
  } catch (e) {
    return json({ errore: String((e as Error).message || e) }, 500);
  }
});
