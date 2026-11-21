// Latte dal caseificio (1.66.0): le fatture mensili del latte nell'archivio del PC entrano da sole.
// Due automazioni del Centro (js/automazioni.js), tutte e due nell'area Stalla:
//  - 'latte-caseificio' (la vedono anche i collaboratori): i litri consegnati giorno per giorno nel
//    registro del latte (raccolta `latte`, campo `conferiti`, con `ddt` e `fonte`); memoria in config.
//  - 'latte-caseificio-conti' (solo titolare): prezzo, premi, trattenute, imponibile e analisi del mese
//    in econfig (record `lf-…`, tipo 'latte-fattura'); memoria in econfig.
// Il lettore e i controlli sono in latte-fattura.js. Un dato che non torna non si salva: diventa un dubbio.
import { S } from './state.js';
import * as store from './store.js';
import { nf, fd } from './util.js';
import { registra, controllaPonte } from './automazioni.js';
import { contiVisibili } from './views/conti.js';
import { eFatturaLatte, leggiFatturaLatte } from './latte-fattura.js';

export const MEM_Q = 'latte-fatture';          // config: documenti già visti dall'automazione delle quantità
export const MEM_C = 'latte-fatture-conti';    // econfig: documenti già visti dall'automazione dei prezzi
export const PRE_C = 'lf-';                    // econfig: un record per fattura del latte
const PAGINA = { area: 'stalla', tab: 'stalla', sub: 'latte' };
const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
export const nomeMese = m => (m ? MESI[+m.slice(5, 7) - 1] + ' ' + m.slice(0, 4) : '');
const litri = v => nf(v, 0) + ' l';
const euro = v => (v == null ? '—' : Number(v).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €');
const chiaveF = f => String(f.numero || '').replace(/\D/g, '').replace(/^0+/, '') + '|' + f.data;
const idFattura = f => PRE_C + chiaveF(f).replace('|', '-');

/* ---------- memoria dei documenti visti: { tipo, docs: { impronta: { esito, n, data, mese, … } } } ---------- */
const memRec = (col, id) => S[col].find(r => r.id === id);
const memoria = (col, id) => (memRec(col, id) || {}).docs || {};
async function segna(col, id, agg) {
  const docs = Object.assign({}, memoria(col, id), agg);
  await store.put(col, id, { tipo: 'latte-memoria', docs });
}

/* ---------- documenti dal ponte dell'archivio ---------- */
async function pontePronto(ctx, titolare) {
  if (titolare && !contiVisibili()) return false;
  const AD = await import('./views/archivio-dati.js');
  if (AD.conf().prova) return ctx.auto ? false : "Con i dati di prova dell'archivio non si legge niente.";
  if (store.sync.mode === 'cloud' && (!store.sync.farm || store.sync.status !== 'ok' || store.sync.pending)) return ctx.auto ? false : "Prima collega l'azienda e aspetta la fine della sincronizzazione.";
  if ((await controllaPonte(!ctx.auto)) !== 'acceso') return ctx.auto ? false : "Il ponte del PC è spento: le fatture del latte si leggono solo dal PC con il ponte acceso.";
  return true;
}
// Le fatture del latte dell'archivio (PDF), dalla più vecchia; quelle già viste si saltano.
async function documenti(mem) {
  const AD = await import('./views/archivio-dati.js');
  const r = await AD.cerca({ q: 'latte vaccino crudo', limite: 500, ordina: 'data' });
  return (r.documenti || []).filter(d => String(d.estensione || '').toLowerCase() === '.pdf' && d.impronta && !mem[d.impronta]);
}
async function testo(imp) {
  const AD = await import('./views/archivio-dati.js');
  return AD.testoIntero(imp, { tempo: 20000 });
}
// Legge un documento: null = ponte senza risposta (si riprova al giro dopo), { altro } = non è una fattura del latte.
async function leggiDoc(d) {
  const t = await testo(d.impronta);
  if (t == null) return null;
  if (!eFatturaLatte(t)) return { altro: true };
  return leggiFatturaLatte(t);
}
// niente nome del file: il registro del latte lo vedono anche i collaboratori (il nome dice caseificio e fattura)
const fonte = (f, d) => ({ tipo: 'fattura', numero: f.numero, data: f.data, imp: d.impronta });
// Tabellina dei controlli che non tornano: [voce, valore scritto nella fattura, valore calcolato dalle righe lette].
const IN_EURO = /imponibile|totale/i;
const valC = (c, v) => (v == null ? '—' : IN_EURO.test(c.voce) ? euro(v) : /^Litri/.test(c.voce) ? litri(v) : nf(v, 0));
const dettagliControlli = (f, voci) => f.controlli.filter(c => !c.ok && (!voci || voci.includes(c.voce))).map(c => [c.voce, 'nella fattura: ' + valC(c, c.atteso), 'dalle righe lette: ' + valC(c, c.letto)]);
const VOCI_GIORNI = ['Litri della fattura e somma delle consegne', 'Giorni dentro il periodo e senza doppioni'];

/* ================= 1. quantità: giorni nel registro del latte ================= */

// Giorni della fattura da salvare e giorni in conflitto con quello che c'è già.
function pianoGiorni(f, d) {
  const scrivi = [], conflitti = [];
  const ix = new Map(S.latte.map(l => [l.id, l])); const giaVisti = new Map();
  for (const g of f.giorni) {
    if (giaVisti.has(g.data)) { conflitti.push({ data: g.data, prima: giaVisti.get(g.data), dopo: g.litri, ddt: g.ddt || '', daFattura: 'giorno ripetuto nella stessa fattura' }); continue; }
    giaVisti.set(g.data, g.litri);
    const ex = ix.get(g.data);
    const nuovo = { conferiti: g.litri, ddt: g.ddt || '', fonte: Object.assign(fonte(f, d), { litri: g.litri }) };
    if (!ex) { scrivi.push({ col: 'latte', id: g.data, data: Object.assign({ data: g.data, litri: g.litri, prodStima: true }, nuovo) }); continue; }
    if (ex.fonte && ex.fonte.imp === d.impronta) continue;                          // già fatto
    const conf = ex.conferiti === '' || ex.conferiti == null ? null : Number(ex.conferiti);
    if (conf === g.litri && ex.fonte) continue;                                        // stesso valore da un'altra copia
    if (conf == null && ex.litri !== '' && ex.litri != null && g.litri > Number(ex.litri)) { conflitti.push({ data: g.data, prima: Number(ex.litri), dopo: g.litri, ddt: g.ddt || '', daFattura: 'i prodotti scritti a mano sono meno dei conferiti' }); continue; }
    if (conf != null && conf !== g.litri) { conflitti.push({ data: g.data, prima: conf, dopo: g.litri, ddt: g.ddt || '', daFattura: ex.fonte ? ex.fonte.numero + ' del ' + fd(ex.fonte.data) : '' }); continue; }
    const { id, ...resto } = ex;
    const rec = Object.assign(resto, nuovo);
    if (rec.litri === '' || rec.litri == null) Object.assign(rec, { litri: g.litri, prodStima: true });
    scrivi.push({ col: 'latte', id: g.data, data: rec });
  }
  return { scrivi, conflitti };
}
// id dei giorni che si stanno scrivendo: `propri` li riconosce (il motore lo chiede prima della scrittura)
const scrivendo = new Set();
async function scriviGiorni(rows) {
  if (!rows.length) return 0;
  rows.forEach(r => scrivendo.add(r.id));
  try { await store.bulkPut(rows); } finally { rows.forEach(r => scrivendo.delete(r.id)); }
  return rows.length;
}

// Mette i valori della fattura nei giorni in conflitto (conferma del dubbio).
async function sostituisci(imp) {
  const m = memoria('config', MEM_Q)[imp]; if (!m || !m.conflitti) return false;
  const una = new Map(m.conflitti.map(c => [c.data, c]));
  const rows = [...una.values()].map(c => { const ex = S.latte.find(l => l.id === c.data); const { id, ...resto } = ex || { data: c.data, litri: c.dopo, prodStima: true }; return { col: 'latte', id: c.data, data: Object.assign(resto, { conferiti: c.dopo, ddt: c.ddt, fonte: { tipo: 'fattura', numero: m.n, data: m.data, imp, nome: m.nome || '', litri: c.dopo } }) }; });
  await scriviGiorni(rows);
  const { conflitti, ...resto } = m;
  await segna('config', MEM_Q, { [imp]: Object.assign(resto, { esito: 'fatto', quando: new Date().toISOString() }) });
  return true;
}
async function tieni(imp) {
  const m = memoria('config', MEM_Q)[imp]; if (!m) return false;
  const { conflitti, ...resto } = m;
  await segna('config', MEM_Q, { [imp]: Object.assign(resto, { esito: 'tenuto', quando: new Date().toISOString() }) });
  return true;
}
// Salva i giorni di una fattura i cui litri non tornano (conferma del dubbio): rilegge il testo dal ponte.
async function salvaComunque(imp) {
  const m = memoria('config', MEM_Q)[imp]; if (!m) return false;
  const t = await testo(imp); if (!t) throw new Error('Il ponte del PC non risponde: riprova con il ponte acceso.');
  const f = leggiFatturaLatte(t); const p = pianoGiorni(f, { impronta: imp, nome: m.nome });
  await scriviGiorni(p.scrivi);
  await segna('config', MEM_Q, { [imp]: Object.assign({}, m, { esito: p.conflitti.length ? 'dubbio' : 'fatto', motivo: p.conflitti.length ? 'conflitti' : '', conflitti: p.conflitti.length ? p.conflitti : undefined, quando: new Date().toISOString() }) });
  return true;
}

registra({
  id: 'latte-caseificio', nome: 'Latte dal caseificio', area: 'stalla',
  descr: 'Dalle fatture mensili del latte nell\'archivio del PC: i litri consegnati giorno per giorno entrano nel registro del latte',
  raccolte: ['latte', 'config'],
  propri: (col, id) => (col === 'config' && id === MEM_Q) || (col === 'latte' && scrivendo.has(id)),
  pronta: ctx => pontePronto(ctx, false),
  async esegui() {
    const mem = memoria('config', MEM_Q);
    const docs = await documenti(mem);
    const agg = {}; const visti = new Map();                     // numero|data → impronta, per le copie dello stesso documento
    const inDubbio = new Map();                                  // fatture con i controlli sbagliati: una copia buona le sostituisce
    for (const [imp, m] of Object.entries(mem)) if (m.n) (m.esito === 'dubbio' && m.motivo === 'controlli' ? inDubbio : visti).set(m.n.replace(/\D/g, '').replace(/^0+/, '') + '|' + m.data, { imp, ...m });
    let giorni = 0, fatture = 0, dubbi = 0, nonRisp = 0;
    for (const d of docs) {
      const f = await leggiDoc(d);
      if (!f) { nonRisp++; break; }                              // il ponte non risponde: si riprova al giro dopo
      const quando = new Date().toISOString();
      if (f.altro) { agg[d.impronta] = { esito: 'altro', quando }; continue; }
      const base = { n: f.numero, data: f.data, mese: f.mese, litri: f.litri, quando };   // in config: senza nome del file
      const k = chiaveF(f); const gia = visti.get(k);
      if (gia) {                                                   // la stessa fattura in un altro file (es. una scansione)
        agg[d.impronta] = gia.litri === f.litri ? Object.assign(base, { esito: 'copia', di: gia.imp }) : Object.assign(base, { esito: 'dubbio', motivo: 'copia', di: gia.imp, altriLitri: gia.litri });
        if (gia.litri !== f.litri) dubbi++;
        continue;
      }
      const giorniOk = f.controlli.filter(c => VOCI_GIORNI.includes(c.voce)).every(c => c.ok);
      if (!giorniOk) { if (!inDubbio.has(k)) { agg[d.impronta] = Object.assign(base, { esito: 'dubbio', motivo: 'controlli', dettagli: dettagliControlli(f, VOCI_GIORNI) }); inDubbio.set(k, { imp: d.impronta, ...agg[d.impronta] }); dubbi++; } else agg[d.impronta] = Object.assign(base, { esito: 'copia', di: inDubbio.get(k).imp }); continue; }
      visti.set(k, { imp: d.impronta, ...base });
      const p = pianoGiorni(f, d);
      giorni += await scriviGiorni(p.scrivi);
      fatture++;
      if (p.conflitti.length) { agg[d.impronta] = Object.assign(base, { esito: 'dubbio', motivo: 'conflitti', conflitti: p.conflitti }); dubbi++; }
      else agg[d.impronta] = Object.assign(base, { esito: 'fatto' });
      const vecchia = inDubbio.get(k); if (vecchia) { const { imp: vi, ...vm } = vecchia; if (agg[vi]) dubbi--; agg[vi] = Object.assign(vm, { esito: 'copia', di: d.impronta, motivo: undefined, dettagli: undefined, quando }); inDubbio.delete(k); }
    }
    if (Object.keys(agg).length) await segna('config', MEM_Q, agg);
    const note = [fatture ? `${fatture} fatture del latte lette, ${giorni} giorni salvati` : 'nessuna fattura del latte nuova', dubbi ? dubbi + ' da controllare' : '', nonRisp ? nonRisp + ' senza risposta dal ponte (si riprova)' : ''].filter(Boolean).join(', ');
    return { salvati: giorni, note };
  },
  dubbi() {
    return Object.entries(memoria('config', MEM_Q)).filter(([, m]) => m.esito === 'dubbio').map(([imp, m]) => {
      const t = 'Fattura del latte n. ' + m.n + ' del ' + fd(m.data) + ' (' + nomeMese(m.mese) + ')';
      if (m.motivo === 'conflitti') {
        const c = m.conflitti || [];
        return {
          id: 'lt:' + imp + ':c', area: 'stalla', testo: t,
          proposta: `${c.length === 1 ? 'Un giorno ha' : c.length + ' giorni hanno'} già litri diversi da quelli della fattura (o un giorno ripetuto): metto quelli della fattura?`,
          dettagli: c.slice(0, 12).map(x => [fd(x.data) + (x.daFattura ? ' (fattura ' + x.daFattura + ')' : ''), litri(x.prima), litri(x.dopo)]).concat(c.length > 12 ? [['… e altri ' + (c.length - 12) + ' giorni', '', '']] : []),
          conferma: () => sostituisci(imp),
          alternative: [{ testo: 'Tieni quelli già salvati', conferma: () => tieni(imp) }],
          scarta: () => tieni(imp), apri: PAGINA,
        };
      }
      if (m.motivo === 'copia') return {
        id: 'lt:' + imp + ':d', area: 'stalla', testo: t,
        proposta: 'Lo stesso numero di fattura è già stato letto da un altro file, ma con litri diversi: tengo il primo.',
        dettagli: [['Litri del mese', litri(m.altriLitri), litri(m.litri)]],
        conferma: () => tieni(imp), scarta: () => tieni(imp), apri: PAGINA,
      };
      return {
        id: 'lt:' + imp + ':k', area: 'stalla', testo: t,
        proposta: 'I litri delle consegne lette non tornano con la fattura: i giorni non sono stati salvati. Li salvo così?',
        dettagli: (m.dettagli || []).map(r => [r[0], r[1], r[2]]),
        conferma: () => salvaComunque(imp), scarta: () => tieni(imp), apri: PAGINA,
      };
    });
  },
  // la fattura annullata resta conosciuta, altrimenti il giro dopo la rileggerebbe
  async annullato(riga, tolti) {
    if (riga.motivo === 'conferma' || riga.motivo === 'scarta') return;   // annullando una scelta il dubbio deve tornare
    const memT = tolti.find(t => t.c === 'config' && t.id === MEM_Q);
    const ora = memoria('config', MEM_Q); const agg = {};
    if (memT && memT.rec && memT.rec.docs) for (const [imp, m] of Object.entries(memT.rec.docs)) if (!ora[imp]) agg[imp] = Object.assign({}, m, { esito: 'annullato', conflitti: undefined });
    // anche se la memoria è cambiata dopo il giro (e il motore l'ha lasciata), le fatture dei giorni tolti sono annullate
    for (const t of tolti) { const imp = t.c === 'latte' && t.rec && t.rec.fonte && t.rec.fonte.imp; if (imp && ora[imp] && !agg[imp]) agg[imp] = Object.assign({}, ora[imp], { esito: 'annullato', conflitti: undefined }); }
    if (Object.keys(agg).length) await segna('config', MEM_Q, agg);
  },
});

/* ================= 2. prezzi, premi e qualità (solo titolare) ================= */

// La fattura del latte nei Conti con lo stesso numero e la stessa data: il suo imponibile.
function imponibileConti(f) {
  const k = chiaveF(f);
  const fc = S.fatture.find(x => chiaveF({ numero: x.numero, data: x.data }) === k);
  if (!fc) return null;
  const rp = fc.riepiloghi || [];
  const imp = rp.length ? rp.reduce((t, r) => t + Number(r.imponibile || 0), 0) : (fc.righe || []).reduce((t, r) => t + Number(r.importo || 0), 0);
  return { id: fc.id, imponibile: Math.round(imp * 100) / 100 };
}
function recFattura(f, d) {
  const conti = imponibileConti(f);
  return {
    tipo: 'latte-fattura', mese: f.mese, numero: f.numero, data: f.data, periodo: f.periodo, imp: d.impronta, nome: d.nome || '',
    litri: f.litri, prezzoBase: f.prezzoBase, prezzoMedio: f.prezzoMedio, valoreLatte: f.valoreLatte, premi: f.premi, trattenute: f.trattenute,
    imponibile: f.imponibile, iva: f.iva, totale: f.totale, righe: f.righe, qualita: f.qualita, analisi: f.analisi, mediaGiorno: f.mediaGiorno || null,
    controlli: f.controlli.map(c => ({ voce: c.voce, ok: c.ok })),
    contiDiverso: conti && Math.abs(conti.imponibile - f.imponibile) > 0.011 ? { conti: conti.imponibile, fattura: f.imponibile } : null,
    letto: new Date().toISOString(),
  };
}
const fattureLatte = () => S.econfig.filter(r => r.tipo === 'latte-fattura');
/** Fatture del latte lette (solo titolare), dalla più vecchia. */
export const fattureMese = () => (contiVisibili() ? fattureLatte().sort((a, b) => (a.mese + a.data).localeCompare(b.mese + b.data)) : []);

async function salvaFattura(imp, esito) {
  const m = memoria('econfig', MEM_C)[imp]; if (!m) return false;
  const t = await testo(imp); if (!t) throw new Error('Il ponte del PC non risponde: riprova con il ponte acceso.');
  const f = leggiFatturaLatte(t);
  await store.put('econfig', idFattura(f), recFattura(f, { impronta: imp, nome: m.nome }));
  await segna('econfig', MEM_C, { [imp]: Object.assign({}, m, { esito, dettagli: undefined, quando: new Date().toISOString() }) });
  return true;
}
async function lasciaFuori(imp) {
  const m = memoria('econfig', MEM_C)[imp]; if (!m) return false;
  await segna('econfig', MEM_C, { [imp]: Object.assign({}, m, { esito: 'tenuto', quando: new Date().toISOString() }) });
  return true;
}

registra({
  id: 'latte-caseificio-conti', nome: 'Latte dal caseificio: prezzi e qualità', area: 'stalla', soloTitolare: true,
  descr: 'Dalle stesse fatture: prezzo, premi, trattenute e analisi del mese (grasso, proteine, cellule, carica batterica), con i controlli dei conti',
  raccolte: ['econfig'],
  propri: (col, id) => col === 'econfig' && (id === MEM_C || String(id).startsWith(PRE_C)),
  pronta: ctx => pontePronto(ctx, true),
  async esegui() {
    const mem = memoria('econfig', MEM_C);
    const docs = await documenti(mem);
    const agg = {}; const visti = new Map();
    const inDubbio = new Map();                                  // fatture con i controlli sbagliati: una copia buona le sostituisce
    for (const [imp, m] of Object.entries(mem)) if (m.n) (m.esito === 'dubbio' && m.motivo === 'controlli' ? inDubbio : visti).set(m.n.replace(/\D/g, '').replace(/^0+/, '') + '|' + m.data, { imp, ...m });
    const perMese = new Map(); fattureLatte().forEach(r => perMese.set(r.mese, r));
    let salvate = 0, dubbi = 0, nonRisp = 0;
    for (const d of docs) {
      const f = await leggiDoc(d);
      if (!f) { nonRisp++; break; }                              // il ponte non risponde: si riprova al giro dopo
      const quando = new Date().toISOString();
      if (f.altro) { agg[d.impronta] = { esito: 'altro', quando }; continue; }
      const base = { n: f.numero, data: f.data, mese: f.mese, litri: f.litri, imponibile: f.imponibile, nome: d.nome || '', quando };
      const k = chiaveF(f); const gia = visti.get(k);
      if (gia) {
        const uguale = gia.imponibile === f.imponibile && gia.litri === f.litri;
        agg[d.impronta] = Object.assign(base, uguale ? { esito: 'copia', di: gia.imp } : { esito: 'dubbio', motivo: 'copia', di: gia.imp, dettagli: [['Litri', litri(gia.litri), litri(f.litri)], ['Imponibile', euro(gia.imponibile), euro(f.imponibile)]] });
        if (!uguale) dubbi++;
        continue;
      }
      const contiOk = f.controlli.filter(c => !VOCI_GIORNI.includes(c.voce)).every(c => c.ok);
      if (!contiOk) { if (!inDubbio.has(k)) { agg[d.impronta] = Object.assign(base, { esito: 'dubbio', motivo: 'controlli', dettagli: dettagliControlli(f).filter(r => !VOCI_GIORNI.includes(r[0])) }); inDubbio.set(k, { imp: d.impronta, ...agg[d.impronta] }); dubbi++; } else agg[d.impronta] = Object.assign(base, { esito: 'copia', di: inDubbio.get(k).imp }); continue; }
      visti.set(k, { imp: d.impronta, ...base });
      const altra = perMese.get(f.mese);
      if (altra && chiaveF(altra) !== k) {                        // un'altra fattura per lo stesso mese
        agg[d.impronta] = Object.assign(base, { esito: 'dubbio', motivo: 'mese', dettagli: [['Fattura', altra.numero + ' del ' + fd(altra.data), f.numero + ' del ' + fd(f.data)], ['Litri', litri(altra.litri), litri(f.litri)], ['Imponibile', euro(altra.imponibile), euro(f.imponibile)]] });
        dubbi++; continue;
      }
      const rec = recFattura(f, d);
      await store.put('econfig', idFattura(f), rec);
      perMese.set(f.mese, rec); salvate++;
      agg[d.impronta] = Object.assign(base, { esito: 'fatto' });
      const vecchia = inDubbio.get(k); if (vecchia) { const { imp: vi, ...vm } = vecchia; if (agg[vi]) dubbi--; agg[vi] = Object.assign(vm, { esito: 'copia', di: d.impronta, motivo: undefined, dettagli: undefined, quando }); inDubbio.delete(k); }
    }
    if (Object.keys(agg).length) await segna('econfig', MEM_C, agg);
    const note = [salvate ? `${salvate} mesi con prezzo e qualità salvati` : 'nessuna fattura del latte nuova', dubbi ? dubbi + ' da controllare' : '', nonRisp ? nonRisp + ' senza risposta dal ponte (si riprova)' : ''].filter(Boolean).join(', ');
    return { salvati: salvate, note };
  },
  dubbi() {
    const out = [];
    for (const [imp, m] of Object.entries(memoria('econfig', MEM_C))) {
      if (m.esito !== 'dubbio') continue;
      const t = 'Fattura del latte n. ' + m.n + ' del ' + fd(m.data) + ' (' + nomeMese(m.mese) + ')';
      if (m.motivo === 'copia') out.push({ id: 'lc:' + imp + ':d', area: 'stalla', testo: t, proposta: 'Lo stesso numero di fattura è già stato letto da un altro file, ma con valori diversi: tengo il primo.', dettagli: m.dettagli, conferma: () => lasciaFuori(imp), scarta: () => lasciaFuori(imp), apri: PAGINA });
      else if (m.motivo === 'mese') out.push({ id: 'lc:' + imp + ':m', area: 'stalla', testo: t, proposta: `C'è già un'altra fattura del latte per ${nomeMese(m.mese)}: la salvo anche questa (per esempio una fattura in più dello stesso mese)?`, dettagli: m.dettagli, conferma: () => salvaFattura(imp, 'fatto'), alternative: [{ testo: 'No, è un doppione', conferma: () => lasciaFuori(imp) }], scarta: () => lasciaFuori(imp), apri: PAGINA });
      else out.push({ id: 'lc:' + imp + ':k', area: 'stalla', testo: t, proposta: 'Prezzo × quantità, premi e trattenute non tornano con l\'imponibile della fattura: la salvo così?', dettagli: m.dettagli, conferma: () => salvaFattura(imp, 'fatto'), scarta: () => lasciaFuori(imp), apri: PAGINA });
    }
    // la stessa fattura nei Conti ha un imponibile diverso
    for (const r of fattureLatte()) if (r.contiDiverso) out.push({
      id: 'lc:' + r.id + ':conti:' + r.contiDiverso.conti, area: 'stalla',
      testo: 'Fattura del latte n. ' + r.numero + ' del ' + fd(r.data) + ' (' + nomeMese(r.mese) + ')',
      proposta: 'Nei Conti la stessa fattura ha un imponibile diverso: controlla la fattura nei Conti.',
      dettagli: [['Imponibile', euro(r.contiDiverso.conti) + ' (Conti)', euro(r.contiDiverso.fattura) + ' (fattura del latte)']],
      scarta: async () => { const { id, ...resto } = r; await store.put('econfig', id, Object.assign(resto, { contiDiverso: null })); return true; },
      apri: { area: 'conti', tab: 'conti', sub: 'latte' },
    });
    return out;
  },
  async annullato(riga, tolti) {
    if (riga.motivo === 'conferma' || riga.motivo === 'scarta') return;
    const memT = tolti.find(t => t.c === 'econfig' && t.id === MEM_C);
    const ora = memoria('econfig', MEM_C); const agg = {};
    if (memT && memT.rec && memT.rec.docs) for (const [imp, m] of Object.entries(memT.rec.docs)) if (!ora[imp]) agg[imp] = Object.assign({}, m, { esito: 'annullato' });
    for (const t of tolti) { const imp = t.c === 'econfig' && String(t.id).startsWith(PRE_C) && t.rec && t.rec.imp; if (imp && ora[imp] && !agg[imp]) agg[imp] = Object.assign({}, ora[imp], { esito: 'annullato' }); }
    if (Object.keys(agg).length) await segna('econfig', MEM_C, agg);
  },
});
