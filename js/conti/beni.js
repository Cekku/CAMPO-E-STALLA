// Registro dei beni (dalla 1.38.0): fabbricati, impianti, macchine e bestiame comprati, con la quota di ammortamento
// di ogni anno. Serve quando non c'è il bilancio di fine anno del commercialista (società semplice agricola con il reddito
// catastale): l'app calcola gli ammortamenti e li mette nel conto economico (righe 63-66) e nel registro dei cespiti.
// Se il conto economico caricato ha già gli ammortamenti, vale quello del commercialista.
//
// Un bene = record in `econfig` con id `be-<uid>` (raccolta riservata al titolare, nessuna modifica allo schema):
//   { tipo: 'bene', nome, cat (chiave di CATEGORIE), data 'AAAA-MM-GG' (acquisto o entrata in funzione), costo (€ senza IVA),
//     anni (durata), residuo (valore alla fine, di solito 0), fine 'AAAA-MM-GG' (venduto o eliminato, facoltativo),
//     fatture: [{ fid, righe: [indici] }], mezzo (id del mezzo, facoltativo), note }
// Calcolo a quote costanti, mese per mese: dal mese della data per anni × 12 mesi, fino al mese della fine se c'è.
import { S } from '../state.js';
import { N, okD, yearOf, today, uid } from '../util.js';
import * as store from '../store.js';
import { righe, fatture } from './dati.js';
import { centroCategoria } from './centri.js';

export const CATEGORIE = {
  fabbricati: { nome: 'Fabbricati e costruzioni', esempi: 'stalle, capannoni, tettoie, vasche, concimaie', cesp: 14, ce: 64, anni: 33 },
  impianti: { nome: 'Impianti', esempi: 'mungitura, silos, fotovoltaico, irrigazione, impianto elettrico', cesp: 15, ce: 64, anni: 10 },
  macchine: { nome: 'Trattori, macchine e attrezzi', esempi: 'trattori, carro miscelatore, seminatrici, rimorchi', cesp: 16, ce: 65, anni: 10 },
  automezzi: { nome: 'Automezzi', esempi: 'furgoni, auto, pick-up', cesp: 17, ce: 65, anni: 5 },
  ufficio: { nome: "Computer e mobili d'ufficio", esempi: 'computer, stampanti, mobili', cesp: 18, ce: 65, anni: 5 },
  bestiame: { nome: 'Bestiame comprato', esempi: 'vacche e manze comprate da altri allevamenti', cesp: 19, ce: 66, anni: 5 },
  colture: { nome: 'Colture pluriennali', esempi: 'vigneti, frutteti, pioppeti', cesp: 20, ce: 66, anni: 20 },
  immateriali: { nome: 'Spese pluriennali e software', esempi: 'progetti, pratiche, programmi', cesp: 10, ce: 63, anni: 5 },
  terreni: { nome: 'Terreni', esempi: 'non si ammortizzano', cesp: 13, ce: null, anni: 0 },
};
export const ORDINE = ['fabbricati', 'impianti', 'macchine', 'automezzi', 'ufficio', 'bestiame', 'colture', 'immateriali', 'terreni'];
// durate consigliate dentro una categoria (suggerite nel modulo)
export const DURATE = [
  ['fabbricati', 'Stalle e capannoni', 33], ['fabbricati', 'Tettoie e strutture leggere', 20], ['impianti', 'Fotovoltaico', 20],
  ['impianti', 'Mungitura e refrigerazione', 10], ['macchine', 'Trattori e macchine', 10], ['macchine', 'Attrezzi piccoli', 5],
  ['bestiame', 'Vacche da latte comprate', 5],
];

const r2 = v => Math.round(v * 100) / 100;
export const beni = () => S.econfig.filter(x => x.tipo === 'bene');
export const bene = id => S.econfig.find(x => x.id === id && x.tipo === 'bene') || null;
export const nuovoId = () => 'be-' + uid();
export async function salva(b) { const { id, ...data } = b; await store.put('econfig', id, Object.assign(data, { tipo: 'bene' })); }
export const togli = id => store.remove('econfig', id);

/* ---------------- calcolo ---------------- */
// mese assoluto: anno × 12 + (mese − 1)
const meseDi = d => (okD(d) ? (+d.slice(0, 4)) * 12 + (+d.slice(5, 7)) - 1 : null);
/** Ultimo mese contato per l'anno: dicembre, o il mese di oggi per l'anno in corso. */
const ultimoMese = y => { const t = today(); const m = meseDi(t); return Math.min(y * 12 + 11, m); };

/** Quota dell'anno, fondo e valore a fine anno di un bene. */
export function quote(b, y) {
  const c = CATEGORIE[b.cat] || CATEGORIE.macchine;
  const m0 = meseDi(b.data); const costo = N(b.costo);
  const out = { quota: 0, fondo: 0, netto: 0, costo: 0, acquisto: 0, presente: false, finito: false, mesi: 0 };
  if (m0 === null || !costo) return out;
  const fine = b.fine ? meseDi(b.fine) : null;
  const fineAnno = ultimoMese(y);
  if (m0 > y * 12 + 11 || fineAnno < y * 12) return out; // comprato dopo o anno futuro
  if (yearOf(b.data) === y) out.acquisto = costo;
  if (fine !== null && fine < y * 12) return out; // già venduto prima di quest'anno
  out.presente = fine === null || yearOf(b.fine) > y;
  const anni = N(b.anni) > 0 ? N(b.anni) : c.anni; const daAmm = Math.max(0, costo - N(b.residuo));
  if (!c.ce || !anni) { out.costo = out.presente ? costo : 0; out.netto = out.costo; return out; }
  const tot = Math.round(anni * 12); const alMese = daAmm / tot;
  const ultimoAmm = m0 + tot - 1; // ultimo mese di ammortamento
  const stop = Math.min(fineAnno, ultimoAmm, fine === null ? Infinity : fine);
  const inizio = Math.max(m0, y * 12);
  out.mesi = Math.max(0, stop - inizio + 1);
  out.quota = r2(alMese * out.mesi);
  const fatti = Math.max(0, Math.min(stop, ultimoAmm) - m0 + 1);
  out.fondo = r2(Math.min(daAmm, alMese * fatti));
  out.finito = fineAnno >= ultimoAmm;
  if (out.presente) { out.costo = costo; out.netto = r2(costo - out.fondo); }
  else { out.fondo = 0; } // venduto nell'anno: esce dal registro a fine anno
  return out;
}

/** Ammortamenti e cespiti dell'anno dal registro: { n, ce: {63..66}, cesp: {riga: {c, f, a}}, tot, perCat, righe } */
export function annoRegistro(y) {
  const ce = {}; const cesp = {}; const perCat = {}; const elenco = [];
  for (const b of beni()) {
    const q = quote(b, y); const c = CATEGORIE[b.cat] || CATEGORIE.macchine;
    if (!q.presente && !q.quota && !q.acquisto) continue;
    elenco.push({ b, q });
    if (c.ce && q.quota) ce[c.ce] = r2(N(ce[c.ce]) + q.quota);
    const o = cesp[c.cesp] || { c: 0, f: 0, a: 0 }; o.c = r2(o.c + q.costo); o.f = r2(o.f + q.fondo); o.a = r2(o.a + q.acquisto); cesp[c.cesp] = o;
    const p = perCat[b.cat] || { quota: 0, costo: 0, fondo: 0, netto: 0, n: 0 }; p.quota += q.quota; p.costo += q.costo; p.fondo += q.fondo; p.netto += q.netto; p.n++; perCat[b.cat] = p;
  }
  const tot = r2(Object.values(ce).reduce((t, v) => t + v, 0));
  return { n: elenco.length, ce, cesp, tot, perCat, righe: elenco };
}

/* ---------------- proposte dalle fatture ---------------- */
const CAT_DA = [
  ['bestiame', /bestiame|bovin|manz[ae]|vacc[ah]e?\b|giovenc|torell|ristallo/i],
  ['fabbricati', /edil|calcestruz|cemento|costruz|capannon|tettoi|muratur|copertur|fondazion|carpenter|prefabbric|pavimentaz|scavo|ferro per c\.?a/i],
  ['impianti', /fotovolt|impiant|accumul|inverter|videosorv|telecamer|mungitur|mungi|silos|tank|refrigerat|irrigaz|ventilator|raffrescam/i],
  ['automezzi', /autovettur|furgone|autocarro|pick.?up|automezz/i],
  ['ufficio', /computer|notebook|stampante|\bpc\b|mobili|arred|software/i],
  ['macchine', /trattor|macchin|attrezz|carro|rimorch|seminat|aratr|erpic|press|falcia|trincia|spandi|irrorat|botte|caricator|ruspa|sollevator/i],
];
export function categoriaDa(testo) { for (const [k, re] of CAT_DA) if (re.test(testo || '')) return k; return 'macchine'; }

/** Righe delle fatture di acquisto con il centro "Investimento" non ancora nel registro, una proposta per fattura. */
export function proposte() {
  const usate = new Set(); for (const b of beni()) for (const x of b.fatture || []) for (const i of x.righe || []) usate.add(x.fid + '#' + i);
  const scartate = new Set(((S.econfig.find(x => x.id === 'cfg') || {}).beniNo) || []);
  const per = new Map();
  for (const r of righe()) {
    if (r.tipo !== 'Acquisto' || r.rett || r.i < 0) continue;
    const c = r.cdc || centroCategoria(r.tipo, r.categoria); if (c !== 'inv') continue;
    if (usate.has(r.fid + '#' + r.i) || scartate.has(r.fid)) continue;
    const p = per.get(r.fid) || { fid: r.fid, data: r.data, controparte: r.controparte, numero: r.numero, righe: [], importo: 0, testo: '' };
    p.righe.push(r.i); p.importo += N(r.importo); p.testo += ' ' + (r.categoria || '') + ' ' + (r.descrizione || ''); per.set(r.fid, p);
  }
  return [...per.values()].filter(p => Math.abs(p.importo) >= 1).map(p => {
    const f = fatture().find(x => x.id === p.fid) || {}; const desc = (f.righe || [])[p.righe[0]] || {};
    const cat = categoriaDa(p.testo);
    return Object.assign(p, { importo: r2(p.importo), cat, anni: cat === 'impianti' && /fotovolt/i.test(p.testo) ? 20 : CATEGORIE[cat].anni, nome: nomeDa(desc.descrizione, p.controparte), nota: Math.abs(p.importo) < 516.46 ? 'piccolo' : '' });
  }).sort((a, b) => (b.data || '').localeCompare(a.data || ''));
}
function nomeDa(d, ditta) {
  const t = String(d || '').replace(/\s+/g, ' ').trim();
  const corto = t.length > 60 ? t.slice(0, 57).replace(/\s+\S*$/, '') + '…' : t;
  return corto || ('Acquisto da ' + (ditta || 'fornitore'));
}
/** Crea i beni dalle proposte scelte: [{ fid, righe, nome, cat, anni, importo, data }]. */
export async function creaDaProposte(sel) {
  const L = sel.map(p => ({ id: nuovoId(), tipo: 'bene', nome: p.nome, cat: p.cat, data: p.data, costo: p.importo, anni: N(p.anni) || CATEGORIE[p.cat].anni, residuo: 0, fatture: [{ fid: p.fid, righe: p.righe }], creato: today() }));
  if (!L.length) return 0;
  await store.bulkPut(L.map(b => { const { id, ...data } = b; return { col: 'econfig', id, data }; }));
  return L.length;
}
/** Le proposte di queste fatture non sono beni (restano fuori). */
export async function scarta(fids) {
  const c = S.econfig.find(x => x.id === 'cfg') || {}; const { id, ...data } = c;
  const no = [...new Set([...(c.beniNo || []), ...fids])];
  await store.put('econfig', 'cfg', Object.assign({}, data, { beniNo: no }));
}

/** Anni da mostrare: dal primo bene a oggi (al massimo 8). */
export function anniRegistro(fino) {
  const a = beni().map(b => yearOf(b.data)).filter(Boolean); const da = a.length ? Math.min(...a) : fino;
  const out = []; for (let y = Math.max(da, fino - 7); y <= fino; y++) out.push(y); return out;
}
