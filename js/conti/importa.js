// Importazione dei documenti: fatture (XML, P7M, PDF, ZIP del cassetto fiscale), dichiarazioni IVA, bilancini,
// vecchio file Excel del conto economico. Prima si leggono e si mostra l'anteprima, poi si salvano.
import { S } from '../state.js';
import * as store from '../store.js';
import { leggiFileFattura, controlloTotale } from './fatture-parse.js';
import { leggiDichiarazioneIva, riepilogoIva, IVA_VOCI } from './iva-parse.js';
import { leggiBilancino, interpreta, calcolaCe } from './bilancino-parse.js';
import { leggiPdf, testoPagina } from './pdftext.js';
import { tipoPaghe, leggiCedolini, leggiBilancinoPaghe, MESI_NOMI } from './paghe-parse.js';
import { pareBonifico, leggiBonifici } from './bonifici-parse.js';
import { pareEstratto } from './banca.js';
import { unzip } from './zip.js';
import { leggiXlsx, serialeAData, colLett } from './xlsx.js';
import { classifica, classificaConMemoria, impara, categorie, ricordi, indiceRicordi, esempiPer, chiaveSimile, REGOLE_PREDEFINITE, RETTIFICA, DA_CLASSIFICARE } from './regole.js';
import { cfg, regole, pivaPropria, bilancio } from './dati.js';
import { CE, SP, CESPITI } from './schema.js';
import { DATI } from './analisi.js';
import { trovaElenco } from './elenco.js';

const r2 = v => Math.round(v * 100) / 100;
export function idFattura(chiave) { let h = 0x811c9dc5; for (let i = 0; i < chiave.length; i++) { h ^= chiave.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return 'f' + h.toString(36) + chiave.length.toString(36); }
const lat1 = b => String.fromCharCode(...b.subarray(0, Math.min(b.length, 400)));

/** Riconosce il tipo di documento e lo legge. Ritorna un elenco di esiti { tipo, nome, ... }. */
export async function leggiDocumento(nome, bytes, out = []) {
  bytes = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const low = nome.toLowerCase(); const testa = lat1(bytes);
  try {
    if (testa.startsWith('PK')) {
      if (/\.xlsx$|\.xlsm$/.test(low)) {
        // elenco annuale delle fatture (es. passive_2025.xlsx) oppure vecchio modello del conto economico
        const W = await leggiXlsx(bytes); const el = trovaElenco(W, nome);
        if (el) { out.push(Object.assign({ tipo: 'elenco', nome }, el)); return out; }
        out.push(Object.assign({ tipo: 'excel', nome }, await leggiExcel(bytes, W))); return out;
      }
      const z = await unzip(bytes);
      for (const [n, b] of z) if (b && !n.startsWith('__MACOSX') && /\.(xml|p7m|pdf|txt|iva)$/i.test(n)) await leggiDocumento(n.split('/').pop(), b, out);
      return out;
    }
    if (testa.startsWith('%PDF')) {
      const pagine = await leggiPdf(bytes);
      const t = pagine.slice(0, 2).map(testoPagina).join('\n');
      const vuoto = !pagine.some(p => p.chars.length);
      if (vuoto) {
        // bilancino "disegnato": le lettere sono forme, si riconoscono confrontandole con l'alfabeto
        try { const b = await leggiBilancino(bytes, cfg().contiUtente || {}); if (b.dati.conti.length) { out.push({ tipo: 'bilancino', nome, anno: b.anno, ditta: b.ditta, perRiga: b.perRiga, conti: b.conti, controlli: b.controlli, dati: snellisci(b.dati), ocr: true }); return out; } } catch (e) { console.warn(e); }
        // estratto conto scansionato o oscurato: lettura ottica
        try { const r = await esitoEstratto(nome, bytes); if (r.righe.length) { out.push(r); return out; } } catch (e) { console.warn(e); }
        out.push({ tipo: 'errore', nome, errore: 'PDF senza testo (probabilmente una scansione) e non riconosciuto. Se è un bilancio carica il file Excel già compilato o inserisci i valori a mano; se è un estratto conto prova "Leggi come estratto conto".', bytes, forza: true }); return out;
      }
      // paghe: cedolini dei dipendenti o bilancino contabile del mese
      const tp = tipoPaghe(pagine);
      if (tp === 'cedolino') { out.push(esitoCedolini(nome, await leggiCedolini(null, pagine))); return out; }
      if (tp === 'bilancino') { out.push(esitoBilPaghe(nome, await leggiBilancinoPaghe(null, pagine))); return out; }
      // contabile di bonifico (pagamento di uno stipendio o di altro)
      if (pareBonifico(t)) { out.push(await esitoBonifici(nome, await leggiBonifici(null, pagine))); return out; }
      if (pareEstratto(t) && !/Cedente\/prestatore|SITUAZIONE\s+CONTABILE|TOTALE\s+COSTI/i.test(t)) { const r = await esitoEstratto(nome, bytes); if (r.righe.length) { out.push(r); return out; } }
      if (/SITUAZIONE\s+CONTABILE|SITUAZIONE\s+AL|TOTALE\s+COSTI|TOTALE\s+RICAVI/i.test(t) && /\d{2}\/\d{2}\/\d{3}/.test(t)) {
        const b = await leggiBilancino(bytes, cfg().contiUtente || {});
        out.push({ tipo: 'bilancino', nome, anno: b.anno, ditta: b.ditta, perRiga: b.perRiga, conti: b.conti, controlli: b.controlli, dati: snellisci(b.dati) }); return out;
      }
      // dichiarazione IVA: i quadri VE/VF/VL possono stare anche dopo molte pagine di frontespizio
      const tutto = pagine.map(testoPagina).join('\n');
      const nRighi = (tutto.match(/\bV[EFLJX]\s?\d{1,2}\b/g) || []).length;
      const pareIva = !/Cedente\/prestatore/.test(t) && (nRighi >= 5 || (/(dichiarazione\s+(annuale\s+)?i\.?v\.?a|modello\s+iva|IVA\s*20\d\d)/i.test(tutto) && nRighi >= 2));
      if (pareIva) {
        const r = await leggiDichiarazioneIva(nome, bytes);
        if (Object.keys(r.valori).length) { out.push(Object.assign({}, r, riepilogoIva(r.valori), { tipo: 'iva', fonte: r.tipo, nome, anno: r.anno || annoDaNome(nome) })); return out; }
        out.push({ tipo: 'errore', nome, errore: 'Sembra una dichiarazione IVA, ma non ho trovato gli importi dei quadri VE, VF e VL. Prova con il file telematico (.iva o .txt) che ti ha dato il commercialista.', bytes });
        return out;
      }
      try { for (const f of await leggiFileFattura(nome, bytes)) out.push({ tipo: 'fattura', nome, f }); }
      catch (e) { out.push({ tipo: 'errore', nome, errore: 'Non riconosciuto: non sembra né una fattura, né una dichiarazione IVA, né un bilancino. Se sai cos\'è, scegli qui sotto come leggerlo.', bytes, forza: true }); }
      return out;
    }
    if (/<\?xml|FatturaElettronica/.test(testa) || /\.(xml|p7m)$/.test(low) || testa.startsWith('0')) {
      for (const f of await leggiFileFattura(nome, bytes)) out.push({ tipo: 'fattura', nome, f });
      return out;
    }
    // file telematico della dichiarazione IVA
    const txt = new TextDecoder('windows-1252').decode(bytes);
    if (/V[A-Z]\d{6}/.test(txt)) { const r = await leggiDichiarazioneIva(nome, bytes); out.push(Object.assign({}, r, riepilogoIva(r.valori), { tipo: 'iva', fonte: r.tipo, nome, anno: r.anno || annoDaNome(nome) })); return out; }
    out.push({ tipo: 'errore', nome, errore: 'formato non riconosciuto' });
  } catch (e) { out.push({ tipo: 'errore', nome, errore: e.message || String(e), bytes, forza: true }); }
  return out;
}
// "IVA2025", "IVA_2025", "Modello IVA 2025" nel nome del file = anno d'imposta 2024
const annoDaNome = n => { const m = /IVA[\s_-]*(20\d\d)/i.exec(n); return m ? +m[1] - 1 : null; };
/** Rilegge un file scegliendo il tipo (quando non è stato riconosciuto da solo). */
export async function leggiComeTipo(nome, bytes, tipo) {
  if (tipo === 'iva') { const r = await leggiDichiarazioneIva(nome, bytes); if (!Object.keys(r.valori).length) throw new Error('Nessun importo dei quadri VE, VF, VL trovato nel file.'); return Object.assign({}, r, riepilogoIva(r.valori), { tipo: 'iva', fonte: r.tipo, nome, anno: r.anno || annoDaNome(nome) }); }
  if (tipo === 'bilancino') { const b = await leggiBilancino(bytes, cfg().contiUtente || {}); if (!b.dati.conti.length) throw new Error('Nessun conto trovato nel file.'); return { tipo: 'bilancino', nome, anno: b.anno, ditta: b.ditta, perRiga: b.perRiga, conti: b.conti, controlli: b.controlli, dati: snellisci(b.dati) }; }
  if (tipo === 'cedolini') return esitoCedolini(nome, await leggiCedolini(bytes));
  if (tipo === 'bonifici') return esitoBonifici(nome, await leggiBonifici(bytes));
  if (tipo === 'estratto') { const r = await esitoEstratto(nome, bytes); if (!r.righe.length) throw new Error('Nessun movimento trovato: servono le colonne con data, importo e descrizione.'); return r; }
  if (tipo === 'bilpaghe') return esitoBilPaghe(nome, await leggiBilancinoPaghe(bytes));
  throw new Error('Tipo non gestito');
}
const mesePer = (m, y) => (m > 12 ? (m === 13 ? 'Tredicesima' : 'Quattordicesima') : MESI_NOMI[m - 1]) + ' ' + y;
const esitoCedolini = (nome, r) => Object.assign({ tipo: 'cedolini', nome, mesePer: r.mese && r.anno ? mesePer(r.mese, r.anno) : 'mese non letto' }, r);
const esitoBonifici = async (nome, bon) => { const { righeBonifici } = await import('./paghe.js'); return { tipo: 'bonifici', nome, righe: righeBonifici(bon, nome) }; };
const esitoEstratto = async (nome, bytes) => { const B = await import('./banca.js'); const { leggiPdf } = await import('./pdftext.js'); const ocr = !(await leggiPdf(bytes)).some(p => p.chars.length > 50); const movs = await B.leggiEstrattoPdf(bytes); return { tipo: 'bonifici', etichetta: 'Estratto conto', nome, ocr, righe: await B.righeEstratto(movs, nome) }; };
const esitoBilPaghe = (nome, b) => ({ tipo: 'bilpaghe', nome, anno: b.anno, mesePer: mesePer(b.mese, b.anno), bil: b });
const snellisci = d => ({ anno: d.anno, ditta: d.ditta, blocchi: d.blocchi.map(b => ({ numero: b.numero, attivita: b.attivita, totali: b.totali, utile: b.utile })), conti: d.conti.map(c => ({ blocco: c.blocco, sezione: c.sezione, conto: c.conto, descrizione: c.descrizione, valori: c.valori, dubbi: c.dubbi, dettagli: c.dettagli })) });

/* ---------------- fatture ---------------- */
function incompleta(f) { return !f.controparte || (Math.abs(f.imponibile || 0) < 0.005 && Math.abs(f.totale || 0) > 0.005) || !String(f.controllo || '').startsWith('OK'); }

/** Prepara i record delle fatture lette (tipo, controparte, segno, categorie). */
export function preparaFatture(lette) {
  let propria = pivaPropria();
  if (!propria) {
    const em = lette.filter(f => f.emessaDaNoi && f.pivaFornitore).map(f => f.pivaFornitore);
    const conta = {}; (em.length ? em.map(p => [p, 1]) : lette.flatMap(f => [[f.pivaFornitore, 1], [f.pivaCliente, 1.01]])).forEach(([p, w]) => { if (p) conta[p] = (conta[p] || 0) + w; });
    propria = Object.entries(conta).sort((a, b) => b[1] - a[1]).map(x => x[0])[0] || '';
  }
  const reg = regole(); const mem = impara(S.fatture);
  return {
    propria, records: lette.map(f => {
      const s = f.segno; const vendita = !!propria && f.pivaFornitore === propria;
      const tipo = vendita ? 'Vendita' : 'Acquisto'; const controparte = vendita ? f.cliente : f.fornitore; const piva = vendita ? f.pivaCliente : f.pivaFornitore;
      const scad = f.pagamenti.map(p => p.scadenza).filter(Boolean).sort();
      return {
        id: idFattura(f.chiave), chiave: f.chiave, data: f.data, tipo, controparte, piva, tipoDoc: f.tipoDoc, numero: f.numero,
        imponibile: s * f.imponibile, iva: s * f.iva, totale: s * (f.totale || 0), ...(f.ritenuta ? { ritenuta: s * f.ritenuta } : {}), pagamento: (f.pagamenti[0] || {}).modalita || '', scadenza: scad[scad.length - 1] || null,
        controllo: f.controllo, file: f.file, fonte: f.fonte, caricata: new Date().toISOString().slice(0, 10),
        righe: f.righe.map(r => { const c = classificaConMemoria(r.descrizione, controparte, reg, tipo, mem); return { codice: r.codice, descrizione: r.descrizione, categoria: c.categoria, ...(c.auto ? { catAuto: c.auto } : {}), quantita: r.quantita != null ? s * r.quantita : null, um: r.um, prezzo: r.prezzo, sconto: r.sconto, aliquota: r.aliquota, importo: s * (r.importo || 0), ddt: r.ddt }; }),
      };
    }),
  };
}
/** Rifà il controllo dei totali sulle fatture già salvate (es. ritenuta d'acconto riconosciuta dopo). Ritorna quante sono diventate OK. */
export async function aggiornaControlli() {
  const rows = [];
  for (const f of S.fatture) {
    if (!String(f.controllo || '').startsWith('totale ≠')) continue;
    const s = (f.imponibile || 0) < 0 || (f.totale || 0) < 0 ? -1 : 1;
    const c = controlloTotale(s * (f.totale || 0), s * (f.imponibile || 0), s * (f.iva || 0), s * (f.ritenuta || 0));
    if (!c.controllo.startsWith('OK')) continue;
    const { id, ...data } = f; rows.push({ col: 'fatture', id, data: Object.assign(data, { controllo: c.controllo, ritenuta: s * c.ritenuta }) });
  }
  if (rows.length) await store.bulkPut(rows);
  return rows.length;
}
/** Salva le fatture: salta i doppioni, sostituisce quelle già presenti ma incomplete tenendo le categorie scelte a mano. */
export async function salvaFatture(lette) {
  const { propria, records } = preparaFatture(lette);
  const presenti = new Map(S.fatture.map(f => [f.id, f]));
  const rows = []; let nuove = 0, doppie = 0, corrette = 0; const visti = new Set();
  for (const r of records) {
    if (visti.has(r.id)) { doppie++; continue; } visti.add(r.id);
    const old = presenti.get(r.id);
    if (old) {
      if (incompleta(old) && String(r.controllo).startsWith('OK')) {
        const man = new Map((old.righe || []).filter(x => x.catManuale).map(x => [x.codice + '|' + x.descrizione, x.categoria]));
        r.righe.forEach(x => { const c = man.get(x.codice + '|' + x.descrizione); if (c) { x.categoria = c; x.catManuale = true; } });
        corrette++; rows.push({ col: 'fatture', id: r.id, data: r });
      } else doppie++;
      continue;
    }
    nuove++; rows.push({ col: 'fatture', id: r.id, data: r });
  }
  if (rows.length) await store.bulkPut(rows.map(x => { const { id, ...data } = x.data; return { col: 'fatture', id, data }; }));
  if (propria && !cfg().piva) await store.put('econfig', 'cfg', Object.assign({}, cfg(), { piva: propria }));
  return { nuove, doppie, corrette };
}
/** Riapplica le regole (e la memoria delle categorie già date) a tutte le righe non corrette a mano.
 *  Le righe classificate dall'IA restano se nessuna regola le cambia. */
export async function riapplicaRegole() {
  const reg = regole(); const mem = impara(S.fatture); const rows = []; let n = 0;
  for (const f of S.fatture) {
    let cambiata = false;
    const righe = (f.righe || []).map(r => {
      if (r.catManuale) return r;
      const c = classificaConMemoria(r.descrizione, f.controparte, reg, f.tipo, mem);
      if (c.categoria === DA_CLASSIFICARE && r.catAuto === 'ia') return r;
      if (c.categoria === r.categoria) return r;
      cambiata = true; n++; const x = Object.assign({}, r, { categoria: c.categoria }); if (c.auto) x.catAuto = c.auto; else delete x.catAuto; return x;
    });
    if (cambiata) { const { id, ...data } = f; rows.push({ col: 'fatture', id, data: Object.assign(data, { righe }) }); }
  }
  if (rows.length) await store.bulkPut(rows);
  return n;
}

/* ---------------- classificazione con un modello di linguaggio ---------------- */
// 'claude': API di Anthropic con la chiave di Impostazioni. 'locale': modello sul PC (LM Studio, Ollama: API compatibile OpenAI).
export const llmLocale = () => { try { return JSON.parse(localStorage.getItem('ces.llm') || 'null'); } catch (e) { return null; } };
const togliThink = s => String(s || '').replace(/<think>[\s\S]*?<\/think>/g, '');
// Di solito si passa dal ponte (strumenti/ponte-lmstudio.py, porta 1235), che lascia entrare solo l'app: LM Studio resta senza CORS.
const baseLocale = url => String(url || 'http://localhost:1235').trim().replace(/\/+$/, '').replace(/\/v1$/, '');
const NON_RISPONDE = 'Il modello sul PC non risponde: controlla che LM Studio sia aperto con il server acceso e che il ponte sia avviato (file "Avvia ponte LM Studio" nella cartella strumenti)';
/** Modelli disponibili sul server locale (senza quelli per gli embedding). */
export async function modelliLocali(url) {
  let r; try { r = await fetch(baseLocale(url) + '/v1/models'); } catch (e) { throw new Error(NON_RISPONDE); }
  const j = await r.json().catch(() => ({})); return (j.data || []).map(m => m.id).filter(id => !/embed/i.test(id));
}
async function chiediModello(motore, sys, testo) {
  if (motore === 'locale') {
    const c = llmLocale() || {}; const model = c.model || (await modelliLocali(c.url))[0];
    if (!model) throw new Error('Nessun modello caricato in LM Studio');
    let r; try {
      r = await fetch(baseLocale(c.url) + '/v1/chat/completions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model, temperature: 0, reasoning_effort: 'none', max_tokens: 3000, messages: [{ role: 'system', content: sys }, { role: 'user', content: testo }] }) });
    } catch (e) { throw new Error(NON_RISPONDE); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error('Il modello sul PC ha dato errore: ' + ((j.error && (j.error.message || j.error)) || r.status));
    return togliThink(((j.choices || [])[0] || {}).message?.content);
  }
  const { aiConfig } = await import('../nlp.js'); const ai = aiConfig();
  if (!ai || !ai.key) throw new Error('Manca la chiave API di Anthropic (Impostazioni → Registrazione a voce e con testo libero)');
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': ai.key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
    body: JSON.stringify({ model: ai.model || 'claude-haiku-5-5', max_tokens: 4096, system: sys, messages: [{ role: 'user', content: testo }] }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('Claude non ha risposto: ' + ((j.error && j.error.message) || r.status));
  return (j.content || []).map(c => c.text || '').join('');
}

export const FERMA_IA = { si: false, attiva: false };
const K = (c, d) => c + '\u0001' + d;
const categorieTipo = (reg, tipo) => { const cats = new Set(categorie(reg, tipo)); S.fatture.forEach(f => { if (f.tipo === tipo) (f.righe || []).forEach(r => { if (r.categoria && r.categoria !== DA_CLASSIFICARE) cats.add(r.categoria); }); }); return cats; };

/** Chiede al modello un blocco di righe [{ c, d }], mostrandogli gli esempi più simili già classificati.
 *  Ritorna un array di categorie (DA_CLASSIFICARE se incerto) o null se la risposta non è utilizzabile. */
async function chiediBlocco(motore, tipo, cats, blocco, idx, escludi = null) {
  const elenco = [...cats].sort((a, b) => a.localeCompare(b, 'it'));
  const esempi = esempiPer(blocco, idx, 30, escludi);
  const chi = tipo === 'Vendita' ? 'cliente' : 'fornitore';
  const sys = `Classifichi le righe delle fatture di ${tipo === 'Vendita' ? 'vendita' : 'acquisto'} di un'azienda agricola italiana con vacche da latte. Tra parentesi quadre c'è il nome del ${chi}.
Per ogni riga scegli UNA categoria da questo elenco, scritta esattamente così: ${JSON.stringify(elenco)}.
${esempi.length ? 'Ti do degli esempi già classificati dall\'agricoltore: seguili, perché mostrano come vuole lui le categorie (stesso prodotto o stesso ' + chi + ' → di solito stessa categoria).\n' : ''}Se nessuna categoria va bene o non sei sicuro, usa "${DA_CLASSIFICARE}". Rispondi SOLO con un array JSON di ${blocco.length} stringhe, una per riga da classificare, nello stesso ordine, senza altro testo.`;
  const testo = (esempi.length ? 'ESEMPI GIÀ CLASSIFICATI:\n' + esempi.map(e => `- [${e.c}] ${e.d} → ${e.cat}`).join('\n') + '\n\n' : '') +
    'RIGHE DA CLASSIFICARE:\n' + blocco.map((v, k) => `${k + 1}. [${v.c}] ${v.d}`).join('\n');
  const txt = await chiediModello(motore, sys, testo);
  const m = txt.match(/\[[\s\S]*\]/); let arr = null; try { arr = m ? JSON.parse(m[0]) : null; } catch (e) { arr = null; }
  if (!Array.isArray(arr) || arr.length !== blocco.length) return null; // risposta incompleta: meglio non rischiare abbinamenti sbagliati
  return arr.map(c => typeof c === 'string' && cats.has(c) ? c : DA_CLASSIFICARE);
}

/** Classifica con un modello di linguaggio le righe "Da classificare" (modo 'nuove') o ripassa quelle già decise dal modello
 *  con gli esempi più recenti (modo 'riguarda'). Prima applica regole e memoria (gratis e immediate).
 *  Al modello vanno solo descrizione della riga, nome della controparte, l'elenco delle categorie e gli esempi
 *  (descrizione → categoria): niente importi, partite IVA o altri dati. Salva dopo ogni blocco.
 *  Ritorna { fatte, cambiate, memoria }: righe classificate, righe che hanno cambiato categoria, righe sistemate dalla memoria. */
export async function classificaConIA(onProgresso = () => { }, motore = 'claude', modo = 'nuove') {
  const reg = regole(); let fatte = 0, cambiate = 0; const passo = motore === 'locale' ? 40 : 120;
  FERMA_IA.si = false; FERMA_IA.attiva = true;
  try {
    const memoria = await riapplicaRegole();
    const lavoro = [];
    for (const tipo of ['Acquisto', 'Vendita']) {
      const cats = categorieTipo(reg, tipo); const idx = indiceRicordi(ricordi(S.fatture, tipo));
      const voci = new Map();
      for (const f of S.fatture) if (f.tipo === tipo) for (const r of f.righe || []) {
        if (r.catManuale) continue;
        if (modo === 'riguarda' ? r.catAuto !== 'ia' : r.categoria !== DA_CLASSIFICARE) continue;
        const k = K(f.controparte, r.descrizione); if (!voci.has(k)) voci.set(k, { k, c: f.controparte || '', d: r.descrizione || '' });
      }
      // righe dello stesso fornitore insieme: gli esempi scelti per il blocco sono più mirati
      const tutte = [...voci.values()].sort((a, b) => a.c.localeCompare(b.c, 'it') || a.d.localeCompare(b.d, 'it'));
      for (let i = 0; i < tutte.length; i += passo) lavoro.push({ tipo, cats, idx, blocco: tutte.slice(i, i + passo) });
    }
    const totale = lavoro.reduce((t, x) => t + x.blocco.length, 0); let viste = 0;
    for (const { tipo, cats, idx, blocco } of lavoro) {
      if (FERMA_IA.si) break;
      onProgresso(viste, totale);
      const arr = await chiediBlocco(motore, tipo, cats, blocco, idx);
      viste += blocco.length;
      if (!arr) continue;
      const scelte = new Map(blocco.map((v, n) => [v.k, arr[n]]));
      const rows = [];
      for (const f of S.fatture) {
        if (f.tipo !== tipo) continue; let cambiata = false;
        const righe = (f.righe || []).map(r => {
          if (r.catManuale) return r;
          const c = scelte.get(K(f.controparte, r.descrizione)); if (!c) return r;
          if (modo === 'riguarda') {
            if (r.catAuto !== 'ia' || c === r.categoria) return r;
            cambiata = true; cambiate++;
            if (c === DA_CLASSIFICARE) { const x = Object.assign({}, r, { categoria: DA_CLASSIFICARE }); delete x.catAuto; return x; }
            return Object.assign({}, r, { categoria: c, catAuto: 'ia' });
          }
          if (r.categoria !== DA_CLASSIFICARE || c === DA_CLASSIFICARE) return r;
          cambiata = true; fatte++; return Object.assign({}, r, { categoria: c, catAuto: 'ia' });
        });
        if (cambiata) { const { id, ...data } = f; rows.push({ col: 'fatture', id, data: Object.assign(data, { righe }) }); }
      }
      if (rows.length) await store.bulkPut(rows);
    }
    onProgresso(viste, totale);
    return { fatte, cambiate, memoria };
  } finally { FERMA_IA.attiva = false; }
}

/** Prova di precisione: prende fino a `n` righe classificate a mano (o, se sono poche, dalle regole), nasconde la categoria,
 *  le fa classificare al modello con gli altri esempi e confronta. Non cambia nessuna fattura.
 *  Salva l'esito nello storico (cfg.provaIA) per vedere se migliora. */
export async function provaPrecisione(onProgresso = () => { }, motore = 'locale', n = 100) {
  const reg = regole(); const passo = motore === 'locale' ? 40 : 120;
  FERMA_IA.si = false; FERMA_IA.attiva = true;
  try {
    let giuste = 0, incerte = 0, provate = 0; const errori = [];
    const campioni = [];
    for (const tipo of ['Acquisto', 'Vendita']) {
      const tutti = ricordi(S.fatture, tipo); const man = tutti.filter(e => e.manuale);
      const base = man.length >= 20 ? man : tutti;
      // campione sparso: un po' da ogni controparte, in ordine fisso (così due prove sono confrontabili)
      const per = new Map(); base.forEach(e => { if (!per.has(e.c)) per.set(e.c, []); per.get(e.c).push(e); });
      const giri = [...per.values()].map(l => l.sort((a, b) => a.d.localeCompare(b.d, 'it')));
      const scelti = []; for (let i = 0; scelti.length < n && giri.some(l => l.length > i); i++) for (const l of giri) if (l[i] && scelti.length < n) scelti.push(l[i]);
      if (scelti.length) campioni.push({ tipo, cats: categorieTipo(reg, tipo), idx: indiceRicordi(tutti), scelti });
    }
    // dividi n tra acquisti e vendite in proporzione
    const tot = campioni.reduce((t, x) => t + x.scelti.length, 0); if (!tot) throw new Error('Per la prova servono righe già classificate da te o dalle regole');
    campioni.forEach(x => { x.scelti = x.scelti.slice(0, Math.max(1, Math.round(n * x.scelti.length / tot))); });
    const totale = campioni.reduce((t, x) => t + x.scelti.length, 0);
    for (const { tipo, cats, idx, scelti } of campioni) {
      const escludi = new Set(scelti.map(e => e.k));
      for (let i = 0; i < scelti.length; i += passo) {
        if (FERMA_IA.si) break;
        onProgresso(provate, totale);
        const blocco = scelti.slice(i, i + passo);
        const arr = await chiediBlocco(motore, tipo, cats, blocco, idx, escludi);
        provate += blocco.length; if (!arr) { incerte += blocco.length; continue; }
        blocco.forEach((e, k) => { const c = arr[k]; if (c === e.cat) giuste++; else if (c === DA_CLASSIFICARE) incerte++; else errori.push({ tipo, c: e.c, d: e.d, giusta: e.cat, modello: c }); });
      }
    }
    onProgresso(provate, totale);
    const esito = { data: new Date().toISOString().slice(0, 16).replace('T', ' '), motore, provate, giuste, incerte, sbagliate: errori.length };
    if (provate) { const st = (cfg().provaIA || []).concat([esito]).slice(-20); await store.put('econfig', 'cfg', Object.assign({}, cfg(), { provaIA: st })); }
    return Object.assign({ errori }, esito);
  } finally { FERMA_IA.attiva = false; }
}

/** Quando correggi a mano una riga, l'app corregge subito anche le righe con descrizione uguale o quasi uguale
 *  classificate in automatico (dalla memoria o dal modello), mai quelle scelte a mano. Ritorna quante ne ha cambiate. */
export async function propagaCorrezione(tipo, descrizione, cat) {
  const ks = chiaveSimile(descrizione); const d0 = String(descrizione || '').toUpperCase().trim(); if (!ks && !d0) return 0;
  const rows = []; let n = 0;
  for (const f of S.fatture) {
    if (f.tipo !== tipo) continue; let cambiata = false;
    const righe = (f.righe || []).map(r => {
      if (r.catManuale || r.categoria === cat || !(r.catAuto || r.categoria === DA_CLASSIFICARE)) return r;
      const uguale = String(r.descrizione || '').toUpperCase().trim() === d0 || (ks && chiaveSimile(r.descrizione) === ks);
      if (!uguale) return r;
      cambiata = true; n++; return Object.assign({}, r, { categoria: cat, catAuto: 'simile' });
    });
    if (cambiata) { const { id, ...data } = f; rows.push({ col: 'fatture', id, data: Object.assign(data, { righe }) }); }
  }
  if (rows.length) await store.bulkPut(rows);
  return n;
}
/** Ricalcola Acquisto/Vendita dopo aver cambiato la P.IVA dell'azienda. */
export async function ricalcolaTipi(piva) {
  const rows = [];
  for (const f of S.fatture) {
    const [pf] = String(f.chiave || '').split('|');
    const vendita = pf === piva; const tipo = vendita ? 'Vendita' : 'Acquisto';
    if (tipo !== f.tipo) { const { id, ...data } = f; rows.push({ col: 'fatture', id, data: Object.assign(data, { tipo }) }); }
  }
  if (rows.length) await store.bulkPut(rows);
  return rows.length;
}

/* ---------------- bilancino e IVA ---------------- */
const VOCI_BILANCINO = [8, 9, 10, 11, 12, 13, 14, 15, 20, 21, 22, 23, 24, 25, 30, 31, 32, 33, 34, 35, 36, 37, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 52, 53, 54, 55, 57, 58, 59, 61, 63, 64, 65, 66, 73, 74, 75, 76, 77, 84, 85, 87, 88, 89, 90, 102];
async function salvaAnno(y, fn) { const b = bilancio(y) || { anno: y }; const { id, ...data } = b; const nuovo = fn(JSON.parse(JSON.stringify(data))); nuovo.anno = y; await store.put('bilanci', String(y), nuovo); }
export async function salvaBilancino(res, anno) {
  const y = anno || res.anno; if (!y) throw new Error('Anno del bilancino non riconosciuto: indicalo.');
  await salvaAnno(y, b => {
    b.ce = b.ce || {}; b.fonteCe = b.fonteCe || {};
    for (const r of VOCI_BILANCINO) { if (res.perRiga[r] != null) { b.ce[r] = res.perRiga[r]; b.fonteCe[r] = 'bilancino'; } else if (b.fonteCe[r] === 'bilancino' || b.fonteCe[r] === 'excel') { delete b.ce[r]; delete b.fonteCe[r]; } }
    b.bilancino = { file: res.nome, caricato: new Date().toISOString().slice(0, 10), ditta: res.ditta, dati: res.dati, controlli: res.controlli };
    return b;
  });
}
/** Riabbina i conti del bilancino salvato (dopo una modifica dell'abbinamento di un conto). */
export async function riabbinaBilancino(y) {
  const b = bilancio(y); if (!b || !b.bilancino || !b.bilancino.dati) return;
  const { perRiga } = calcolaCe(b.bilancino.dati, cfg().contiUtente || {});
  await salvaAnno(y, x => { for (const r of VOCI_BILANCINO) { if (perRiga[r] != null) { x.ce[r] = perRiga[r]; x.fonteCe[r] = 'bilancino'; } else if (x.fonteCe && x.fonteCe[r] === 'bilancino') { delete x.ce[r]; delete x.fonteCe[r]; } } return x; });
}
export async function salvaIva(res, anno) {
  const y = anno || res.anno; if (!y) throw new Error(`Non ho trovato l'anno della dichiarazione ${res.nome}: scrivilo nella casella "Anno d'imposta" e premi di nuovo Salva.`);
  await salvaAnno(y, b => { b.iva = { righi: res.valori, voci: res.voci, controlli: res.controlli, fonte: res.fonte, file: res.nome, caricato: new Date().toISOString().slice(0, 10), avvisi: res.avvisi }; return b; });
}

/* ---------------- vecchio file Excel ---------------- */
const IVA_RIGHE = { 7: 've_imp', 8: 've_iva', 9: 've_agr', 10: 've_esenti', 11: 've50', 13: 'vf_imp', 14: 'vf_amm', 15: 'vf_esenti', 16: 'vf_iva', 18: 'vl1', 19: 'vl2', 21: 'vl8', 22: 'vx1', 23: 'vx5' };
const numero = v => (typeof v === 'number' && isFinite(v) ? v : null);
async function leggiExcel(bytes, W0) {
  const W = W0 || await leggiXlsx(bytes);
  if (!W.CE || !W.Anagrafica) throw new Error('Il file Excel non è il modello di conto economico e stato patrimoniale (mancano i fogli CE e Anagrafica).');
  const A = W.Anagrafica; const y0 = numero(A.C20) || 2023; const anni = [y0, y0 + 1, y0 + 2]; const colAnno = ['D', 'E', 'F'];
  const azienda = {}; const campiAz = { 5: 'nome', 6: 'forma', 7: 'titolare', 8: 'iva', 9: 'cf', 10: 'ateco', 11: 'indirizzo', 12: 'citta', 13: 'telefono', 14: 'email', 15: 'regimeIva', 16: 'regimeContabile', 17: 'commercialista' };
  for (const [r, k] of Object.entries(campiAz)) if (A['C' + r] != null && A['C' + r] !== '') azienda[k] = String(A['C' + r]);
  const anniOut = {};
  anni.forEach((y, j) => {
    const c = colAnno[j]; const b = { ce: {}, sp: {}, cespiti: {}, dim: {}, iva: null };
    for (const x of CE) if (x.in) { const v = numero(W.CE[c + x.row]); if (v !== null && v !== 0) b.ce[x.row] = v; }
    if (W.SP) for (const x of SP) if (x.in) { const v = numero(W.SP[c + x.row]); if (v !== null && v !== 0) b.sp[x.row] = v; }
    if (W.Cespiti) { const base = [3, 7, 11][j]; for (const x of CESPITI) if (x.row && !x.sum) { const o = { c: numero(W.Cespiti[colLett(base) + x.row]), f: numero(W.Cespiti[colLett(base + 1) + x.row]), a: numero(W.Cespiti[colLett(base + 3) + x.row]) }; if (o.c || o.f || o.a) b.cespiti[x.row] = o; } }
    if (W.IVA) { const voci = {}; for (const [r, k] of Object.entries(IVA_RIGHE)) { const v = numero(W.IVA[c + r]); if (v !== null) voci[k] = v; } if (Object.keys(voci).length) b.iva = { voci, fonte: 'Excel', controlli: [] }; }
    for (const [r, k] of [[28, 'ula'], [29, 'sau'], [30, 'capi']]) { const v = numero(A[c + r]); if (v !== null && v !== 0) b.dim[k] = v; }
    const AA = W['Analisi agricola'];
    if (AA) { const lab = {}; for (const [ref, v] of Object.entries(AA)) if (ref.startsWith('C') && typeof v === 'string') lab[v.trim()] = ref.slice(1); const mapL = { "Vacche da latte (numero medio presenti nell'anno)": 'vacche', 'di cui vacche in lattazione (media)': 'vacche_latt', "Latte prodotto nell'anno (litri)": 'latte_prod', 'Latte venduto – correzione manuale (litri)': 'latte_ven', 'di cui superficie a foraggere (ha)': 'sup_for', 'Costo figurativo del lavoro familiare (€)': 'lav_fam', 'Remunerazione figurativa del capitale proprio (%)': 'tasso_cap' }; b.analisi = {}; for (const [l, k] of Object.entries(mapL)) { const r = lab[l]; const v = r ? numero(AA[c + r]) : null; if (v !== null) b.analisi[k] = v; } }
    const pieno = Object.keys(b.ce).length || Object.keys(b.sp).length || Object.keys(b.cespiti).length || b.iva || Object.keys(b.dim).length;
    if (pieno) anniOut[y] = b;
  });
  // fatture e regole salvate nei fogli "Fatture..."
  const fatture = []; let regoleX = null;
  const F = W.Fatture, R = W['Fatture-Righe'], C = W['Fatture-Categorie'];
  const tabella = (sh, chiave) => {
    if (!sh) return [];
    const righe = {}; for (const [ref, v] of Object.entries(sh)) { const m = /^([A-Z]+)(\d+)$/.exec(ref); (righe[m[2]] = righe[m[2]] || {})[m[1]] = v; }
    const nums = Object.keys(righe).map(Number).sort((a, b) => a - b);
    const h = nums.find(n => Object.values(righe[n]).includes(chiave)); if (!h) return [];
    const head = righe[h]; const out = [];
    for (const n of nums.filter(n => n > h)) { const o = {}; for (const [col, name] of Object.entries(head)) o[name] = righe[n][col]; out.push(o); }
    return out;
  };
  const d = v => (typeof v === 'number' ? serialeAData(v) : typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null);
  const per = {};
  for (const g of tabella(F, 'Chiave')) {
    if (!g.Chiave) continue;
    per[g.Chiave] = { id: idFattura(g.Chiave), chiave: g.Chiave, data: d(g.Data), tipo: g.Tipo || 'Acquisto', controparte: g['Fornitore / controparte'] || '', piva: String(g['P.IVA'] || ''), tipoDoc: g['Tipo doc.'] || '', numero: String(g.Numero ?? ''), imponibile: numero(g.Imponibile) || 0, iva: numero(g.IVA) || 0, totale: numero(g['Totale documento']) || 0, pagamento: g.Pagamento || '', scadenza: d(g.Scadenza), controllo: g['Controllo righe'] || '', file: g.File || '', fonte: 'excel', righe: [] };
  }
  const visti = new Set();
  for (const g of tabella(R, 'Chiave fattura')) {
    const f = per[g['Chiave fattura']]; if (!f || String(g.Descrizione || '').startsWith(RETTIFICA)) continue;
    const k = JSON.stringify([g['Chiave fattura'], g.Descrizione, g.Importo, g['Cod. articolo'], g.DDT, g['Quantità']]);
    if (visti.has(k + f.righe.length)) continue; visti.add(k + f.righe.length);
    f.righe.push({ codice: String(g['Cod. articolo'] ?? ''), descrizione: String(g.Descrizione ?? ''), categoria: g.Categoria || 'Da classificare', quantita: numero(g['Quantità']), um: g.UM || '', prezzo: numero(g['Prezzo unitario']), sconto: g.Sconto || '', aliquota: g['% IVA'] ?? '', importo: numero(g.Importo) || 0, ddt: g.DDT || '' });
  }
  fatture.push(...Object.values(per));
  if (C) { const t = tabella(C, 'Parola chiave'); if (t.length) regoleX = t.filter(g => g.Categoria && (g['Parola chiave'] || g['Fornitore o cliente (facoltativo)'] || g['Fornitore (facoltativo)'])).map(g => [String(g['Parola chiave'] || ''), String(g['Fornitore o cliente (facoltativo)'] || g['Fornitore (facoltativo)'] || ''), String(g.Categoria), String(g.Tipo || '')]); }
  return { anni: anniOut, azienda, fatture, regole: regoleX };
}
export async function salvaExcel(res, { sovrascrivi = true } = {}) {
  let n = 0;
  for (const [y, b] of Object.entries(res.anni)) {
    await salvaAnno(+y, x => {
      x.ce = Object.assign({}, sovrascrivi ? {} : x.ce, b.ce); x.sp = Object.assign({}, sovrascrivi ? {} : x.sp, b.sp); x.cespiti = Object.assign({}, x.cespiti || {}, b.cespiti);
      x.fonteCe = Object.assign({}, x.fonteCe || {}); for (const r of Object.keys(b.ce)) x.fonteCe[r] = 'excel';
      if (b.iva && !(x.iva && x.iva.righi)) x.iva = b.iva;
      x.dim = Object.assign({}, x.dim || {}, b.dim); if (b.analisi) x.analisi = Object.assign({}, x.analisi || {}, b.analisi);
      return x;
    }); n++;
  }
  const rows = res.fatture.filter(f => !S.fatture.some(x => x.id === f.id)).map(f => { const { id, ...data } = f; return { col: 'fatture', id, data }; });
  if (rows.length) await store.bulkPut(rows);
  const c = Object.assign({}, cfg());
  if (res.regole && res.regole.length && !(c.regole && c.regole.length)) c.regole = res.regole;
  const piva = String(res.azienda.iva || '').replace(/\D/g, ''); if (piva.length >= 11 && !c.piva) c.piva = piva.slice(-11);
  c.anagrafica = Object.assign({}, res.azienda, c.anagrafica || {});
  await store.put('econfig', 'cfg', c);
  return { anni: n, fatture: rows.length };
}
export { IVA_VOCI, REGOLE_PREDEFINITE, DATI, interpreta };
