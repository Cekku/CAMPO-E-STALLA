// Motori della chat "Chiedi": Claude (API di Anthropic) oppure il modello sul PC (LM Studio tramite il ponte, porta 1235).
// Tutti e due usano gli stessi strumenti (strumenti.js): il modello chiede, l'app calcola nel browser, il modello risponde.
// Claude: con la chiave salvata su questo dispositivo (Impostazioni) va diretto; altrimenti passa dalla funzione Supabase
// "chiedi", che tiene la chiave nei suoi segreti e controlla che chi chiede sia dell'azienda.
import { lsGet } from '../util.js';
import * as store from '../store.js';
import { sync } from '../store.js';
import { strumentiPer, esegui, contesto } from './strumenti.js';

export const MODELLI = [
  { id: 'claude-opus-5-5', nome: 'Claude Opus 5.5', nota: 'il più bravo', prezzo: [4, 20] },
  { id: 'claude-sonnet-5-5', nome: 'Claude Sonnet 5.5', nota: 'quasi uguale, costa la metà', prezzo: [2, 10] },
  { id: 'claude-haiku-5-5', nome: 'Claude Haiku 5.5', nota: 'veloce ed economico, per domande semplici', prezzo: [0.1, 0.5] },
];
const GIRI = 8;   // al massimo 8 giri di strumenti per domanda

/** Come raggiungere Claude da qui: 'chiave' (dispositivo), 'funzione' (Supabase), oppure null con il motivo. */
export function viaClaude() {
  const k = lsGet('ces.ai', null);
  if (k && k.key) return { via: 'chiave' };
  if (store.cloudReady() && sync.user && sync.farm) return { via: 'funzione' };
  return { via: null, motivo: 'Per usare Claude accedi all\'azienda (La mia azienda → Sincronizzazione) oppure salva una chiave API su questo dispositivo.' };
}
const baseLocale = () => String((lsGet('ces.llm', null) || {}).url || 'http://localhost:1235').trim().replace(/\/+$/, '').replace(/\/v1$/, '');
export const localeConfigurato = () => !!lsGet('ces.llm', null);

export function istruzioni(conti, pagine) {
  return `Sei l'assistente di "Campo e Stalla", il gestionale di un'azienda agricola italiana con vacche da latte. Rispondi alle domande del titolare o dei collaboratori.

Regole:
- I dati dell'azienda li hai solo tramite gli strumenti: usali sempre prima di dare un numero. Non inventare mai cifre, nomi o date. Se uno strumento non ha il dato, dillo e spiega dove si carica nell'app.
- Per confronti fra anni chiedi tutti gli anni in una volta sola (es. spese_raggruppate con anni [2024, 2025]).
- Scrivi in italiano semplice, come a un agricoltore: niente gergo tecnico o informatico, niente nomi degli strumenti o dei campi JSON. Frasi brevi. Numeri all'italiana (1.234,5) con l'unità (€, litri, ha). Gli importi delle fatture sono imponibili senza IVA: dillo quando conta.
- Risposte corte: prima il dato richiesto, poi al massimo 2-3 osservazioni utili. Usa elenchi puntati o una tabella piccola solo se aiutano.
- Quando serve, aggiungi in fondo uno o due collegamenti per aprire la pagina dell'app, in questa forma esatta: [testo](#pagina:area/tab/sub). Per una scheda: [nome](#capo:ID), [nome](#campo:ID), [nome](#mezzo:ID), [numero](#fattura:ID) con l'id dato dagli strumenti. Pagine disponibili: ${pagine}.
- Sei in sola lettura: non puoi registrare o cambiare niente. Se ti chiedono di farlo, spiega dove farlo nell'app.
${conti ? '- Hai anche i dati economici (fatture, bilancio, personale, archivio): sono riservati, usali solo per rispondere.' : '- I dati economici (Conti) non sono disponibili per questo utente: se te li chiedono, dillo.'}

Situazione di oggi: ${JSON.stringify(contesto(conti))}`;
}

/* ---------------- Claude ---------------- */
async function chiamaClaude(body) {
  const v = viaClaude(); if (!v.via) throw new Error(v.motivo);
  const beta = { 'anthropic-beta': 'server-side-fallback-2026-07-01' };
  let r;
  try {
    if (v.via === 'chiave') {
      const k = lsGet('ces.ai', null);
      r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': k.key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true', ...beta }, body: JSON.stringify(body) });
    } else {
      const { data } = await store.cloudClient().auth.getSession(); const tok = data && data.session && data.session.access_token;
      if (!tok) throw new Error('Accedi di nuovo all\'azienda per usare Claude');
      const c = store.cloudConfig();
      r = await fetch(c.url + '/functions/v1/chiedi', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + tok, apikey: c.key, ...beta }, body: JSON.stringify({ farm: sync.farm.id, body }) });
    }
  } catch (e) { throw new Error(e.message && !/fetch|network/i.test(e.message) ? e.message : 'Claude non raggiungibile: controlla la connessione'); }
  const j = await r.json().catch(() => ({}));
  if (r.status === 404 && v.via === 'funzione') throw new Error('La funzione "chiedi" non è ancora pubblicata in Supabase');
  if (!r.ok) throw new Error('Claude non ha risposto: ' + ((j.error && j.error.message) || r.status));
  return j;
}

/**
 * Una domanda con Claude. msgs = storia nel formato dell'API (si allunga qui dentro: le risposte complete,
 * con i blocchi di ragionamento, vanno rimandate così come sono). Ritorna { testo, strumenti, uso, costo }.
 */
export async function domandaClaude({ msgs, modello, conti, pagine, onPasso = () => { }, ferma = { si: false } }) {
  const tools = strumentiPer(conti).map(s => ({ name: s.name, description: s.description, input_schema: s.parameters }));
  tools[tools.length - 1].cache_control = { type: 'ephemeral' };
  const system = [{ type: 'text', text: istruzioni(conti, pagine), cache_control: { type: 'ephemeral' } }];
  const uso = { in: 0, out: 0, letti: 0, scritti: 0 }; const usati = [];
  for (let giro = 0; giro < GIRI; giro++) {
    if (ferma.si) throw new Error('Fermato');
    const j = await chiamaClaude({ model: modello, max_tokens: 6000, system, tools, messages: msgs, fallbacks: 'default' });
    const u = j.usage || {}; uso.in += N0(u.input_tokens); uso.out += N0(u.output_tokens); uso.letti += N0(u.cache_read_input_tokens); uso.scritti += N0(u.cache_creation_input_tokens);
    msgs.push({ role: 'assistant', content: j.content || [] });
    if (j.stop_reason === 'refusal') return fine('Claude non può rispondere a questa domanda. Prova a chiederla in un altro modo.', usati, uso, j.model || modello);
    const chiamate = (j.content || []).filter(c => c.type === 'tool_use');
    if (j.stop_reason !== 'tool_use' || !chiamate.length) {
      const testo = (j.content || []).filter(c => c.type === 'text').map(c => c.text).join('\n').trim();
      return fine(testo + (j.stop_reason === 'max_tokens' ? '\n\n_(risposta interrotta perché troppo lunga)_' : ''), usati, uso, j.model || modello);
    }
    onPasso(chiamate.map(c => c.name));
    const ris = await Promise.all(chiamate.map(async c => { usati.push(c.name); const e = await esegui(c.name, c.input, conti); return { type: 'tool_result', tool_use_id: c.id, content: e.testo, ...(e.ok ? {} : { is_error: true }) }; }));
    msgs.push({ role: 'user', content: ris });
  }
  return fine('Ho fatto troppi passaggi senza arrivare a una risposta: prova a fare una domanda più precisa.', usati, uso, modello);
}
const N0 = v => Number(v) || 0;
function fine(testo, strumenti, uso, modello) {
  const m = MODELLI.find(x => modello && modello.startsWith(x.id)) || MODELLI[0]; const [pi, po] = m.prezzo;
  const costo = (uso.in * pi + uso.out * po + uso.letti * pi * 0.05 + uso.scritti * pi * 1.25) / 1e6;
  return { testo: testo || '(nessuna risposta)', strumenti: [...new Set(strumenti)], uso, costo, modello: m.nome };
}

/* ---------------- modello sul PC ---------------- */
const togliThink = s => String(s || '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();
export async function domandaLocale({ msgs, conti, pagine, onPasso = () => { }, ferma = { si: false } }) {
  const c = lsGet('ces.llm', null) || {}; const base = baseLocale();
  let model = c.model;
  if (!model) { try { const j = await (await fetch(base + '/v1/models')).json(); model = ((j.data || []).map(m => m.id).filter(id => !/embed/i.test(id)))[0]; } catch (e) { } }
  if (!model) throw new Error('Il modello sul PC non risponde: accendi LM Studio e il ponte (file "Avvia ponte LM Studio" nella cartella strumenti)');
  const tools = strumentiPer(conti).map(s => ({ type: 'function', function: { name: s.name, description: s.description, parameters: s.parameters } }));
  const sys = { role: 'system', content: istruzioni(conti, pagine) };
  const usati = [];
  for (let giro = 0; giro < GIRI; giro++) {
    if (ferma.si) throw new Error('Fermato');
    let r; try {
      r = await fetch(base + '/v1/chat/completions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model, temperature: 0.2, reasoning_effort: 'none', max_tokens: 2500, tools, tool_choice: 'auto', messages: [sys, ...msgs] }) });
    } catch (e) { throw new Error('Il modello sul PC non risponde: controlla che LM Studio e il ponte siano accesi'); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error('Il modello sul PC ha dato errore: ' + ((j.error && (j.error.message || j.error)) || r.status));
    const m = ((j.choices || [])[0] || {}).message || {};
    const calls = m.tool_calls || [];
    msgs.push({ role: 'assistant', content: m.content || '', ...(calls.length ? { tool_calls: calls } : {}) });
    if (!calls.length) return { testo: togliThink(m.content) || '(nessuna risposta)', strumenti: [...new Set(usati)], costo: 0, modello: model };
    onPasso(calls.map(x => x.function && x.function.name));
    for (const t of calls) {
      let args = {}; try { args = JSON.parse((t.function && t.function.arguments) || '{}'); } catch (e) { args = {}; }
      usati.push(t.function.name); const e = await esegui(t.function.name, args, conti);
      msgs.push({ role: 'tool', tool_call_id: t.id, content: e.testo });
    }
  }
  return { testo: 'Ho fatto troppi passaggi senza arrivare a una risposta: prova a fare una domanda più precisa.', strumenti: [...new Set(usati)], costo: 0, modello: model };
}
