// Notizie e mercati: dati e azioni (la pagina è js/views/notizie.js).
// Raccolte: fonti (portali scelti dall'azienda), rassegna (una pagina al giorno, id = data, scritta dalla funzione
// Supabase "rassegna" o dall'IA del PC), mercati (una serie di prezzi per riga, scritta dalla funzione).
// Il prezzo del latte dalle fatture del caseificio entra nei calcoli solo per il titolare e non va mai a Supabase né a Claude.
import { S } from './state.js';
import * as store from './store.js';
import { sync } from './store.js';
import { lsGet } from './util.js';
import { contiVisibili } from './views/conti.js';
import { fattureMese } from './auto-latte.js';
import { baseLocale } from './chiedi/motori.js';
import { SERIE, FONTI_CONSIGLIATE, mensile, riepilogo, SCHEMA, ISTRUZIONI, messaggioUtente, componi } from '../supabase/functions/_shared/mercati.js';

export { SERIE, FONTI_CONSIGLIATE };

/** Pagine della rassegna dalla più recente. */
export const pagine = () => S.rassegna.filter(r => /^\d{4}-\d{2}-\d{2}$/.test(r.id)).sort((a, b) => b.id.localeCompare(a.id));
export const serieDi = id => S.mercati.find(r => r.id === id) || null;
/** Prezzi mese per mese di una serie salvata: { 'AAAA-MM': valore }. */
export const mesiDi = id => { const r = serieDi(id); return r ? mensile(r) : {}; };

/** Il prezzo del latte delle fatture del caseificio (€/100 l con premi e trattenute), solo per il titolare. */
export function prezzoProprio() {
  if (!contiVisibili()) return null;
  // più fatture nello stesso mese (rettifiche): media pesata sui litri
  const somma = {};
  for (const f of fattureMese()) { const v = Number(f.prezzoMedio), l = Number(f.litri) || 0; if (!f.mese || !(v > 0)) continue; const s = somma[f.mese] = somma[f.mese] || { v: 0, l: 0, n: 0, sv: 0 }; s.v += v * l; s.l += l; s.n++; s.sv += v; }
  const mesi = {};
  for (const [k, s] of Object.entries(somma)) mesi[k] = Math.round((s.l > 0 ? s.v / s.l : s.sv / s.n) / 10 * 100) / 100;
  return Object.keys(mesi).length ? { nome: 'Il tuo latte (fatture)', unita: '€/100 l', mesi } : null;
}
/** Riepilogo per la pagina e per l'IA del PC; con conProprio anche il tuo prezzo del latte (solo titolare). */
export function riepilogoOra(conProprio = true) {
  const serie = {}; for (const s of SERIE) { const r = serieDi(s.id); if (r) serie[s.id] = r; }
  const p = conProprio ? prezzoProprio() : null;
  return riepilogo(serie, p ? { proprio: p } : {});
}

/** Aggiunge i portali consigliati che mancano. */
export async function aggiungiConsigliate(soloMarco = false) {
  const ci = new Set(S.fonti.map(f => String(f.url || '').toLowerCase()));
  let n = 0;
  for (const f of FONTI_CONSIGLIATE) {
    if (soloMarco && f.consigliata) continue;
    if (ci.has(f.url.toLowerCase())) continue;
    await store.put('fonti', null, { nome: f.nome, url: f.url, sito: f.sito, argomento: f.argomento, attiva: true });
    n++;
  }
  return n;
}

/** Chiede alla funzione Supabase di rifare la rassegna di oggi (la pagina arriva con la sincronizzazione). */
export async function aggiornaAdesso() {
  if (!sync.farm || !store.cloudReady()) throw new Error('Per leggere i portali serve la sincronizzazione online: La mia azienda → Sincronizzazione.');
  const c = store.cloudConfig();
  const { data } = await store.cloudClient().auth.getSession(); const tok = data && data.session && data.session.access_token;
  if (!tok) throw new Error('Accedi all\'azienda per aggiornare la rassegna.');
  const r = await fetch(c.url + '/functions/v1/rassegna', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + tok, apikey: c.key }, body: JSON.stringify({ farm: sync.farm.id, rifai: true }) });
  const j = await r.json().catch(() => ({}));
  if (r.status === 404) throw new Error('La funzione "rassegna" non è ancora pubblicata su Supabase.');
  if (!r.ok) throw new Error(j.errore || 'La funzione della rassegna non ha risposto (' + r.status + ')');
  return j;
}

export const pcConfigurato = () => !!lsGet('ces.llm', null);

/**
 * Riassunto della pagina del giorno con l'IA del PC (LM Studio tramite il ponte, come la chat Chiedi).
 * Se la pagina ha già il riassunto di Claude, quello del PC va in "secondo" (seconda opinione) e non lo sostituisce.
 */
export async function riassuntoPC(giorno) {
  const p = S.rassegna.find(r => r.id === giorno);
  if (!p) throw new Error('Pagina non trovata');
  const articoli = (p.articoli || []).slice(0, 25);
  const base = baseLocale(); const conf = lsGet('ces.llm', null) || {};
  let model = conf.model;
  try { if (!model) { const j = await (await fetch(base + '/v1/models')).json(); model = ((j.data || []).map(m => m.id).filter(id => !/embed/i.test(id)))[0]; } }
  catch (e) { throw new Error('L\'IA del PC non risponde: accendi LM Studio e il ponte (file "Avvia ponte LM Studio" nella cartella strumenti).'); }
  if (!model) throw new Error('In LM Studio non c\'è un modello caricato.');
  const corpo = {
    model, temperature: 0.2, max_tokens: 6000, reasoning_effort: 'none',
    response_format: { type: 'json_schema', json_schema: { name: 'pagina_del_giorno', strict: true, schema: SCHEMA } },
    // senza il tuo prezzo del latte: la pagina salvata la vedono tutti i membri dell'azienda
    messages: [{ role: 'system', content: ISTRUZIONI }, { role: 'user', content: messaggioUtente(articoli, riepilogoOra(false), giorno) }],
  };
  let r; try { r = await fetch(base + '/v1/chat/completions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corpo) }); }
  catch (e) { throw new Error('L\'IA del PC non risponde: controlla che LM Studio e il ponte siano accesi.'); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('L\'IA del PC ha dato un errore: ' + ((j.error && (j.error.message || j.error)) || r.status));
  const testo = String((((j.choices || [])[0] || {}).message || {}).content || '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  let uscita; try { uscita = JSON.parse(testo.replace(/^```(?:json)?\s*|\s*```$/g, '')); } catch (e) { throw new Error('L\'IA del PC non ha risposto nel formato giusto: riprova o cambia modello.'); }
  const fatto = Object.assign(componi(uscita, articoli), { motore: 'pc', modello: model, quando: new Date().toISOString() });
  const { id, ...dati } = p;
  if (p.motore === 'claude') await store.put('rassegna', giorno, Object.assign({}, dati, { secondo: fatto }));
  else await store.put('rassegna', giorno, Object.assign({}, dati, fatto, { erroreIA: null }));
  return fatto;
}
