// Carico in magazzino dei prodotti comprati, dalle righe delle fatture d'acquisto (1.59.0; tutte le categorie del magazzino dalla 1.66.0).
// Il riconoscimento è in js/magriconosci.js: entra da sola solo una riga con prodotto certo e quantità sicura; le altre diventano
// dubbi del Centro automatico (js/auto-magazzino.js) con la proposta pronta, o si abbinano a mano nella pagina Da fatture.
// Stato in econfig 'mag-fatture' (riservata, come le fatture): { da, fatti: { 'fid:i': idMovimento | 'no' | 'r>fid:i' } }
// ('r>…' = riga di una nota di credito che corregge il prezzo di quel carico). Sul prodotto quello che ha imparato: vedi magriconosci.js.
import { S, get } from './state.js';
import * as store from './store.js';
import { N, okD, uid } from './util.js';
import { righe } from './conti/dati.js';
import { leggiDdt } from './tracciabilita.js';
import { contiVisibili } from './views/conti.js';
import { fitoLookup, fitoMeta } from './fitodb.js';
import { toast } from './ui.js';
import * as MR from './magriconosci.js';

export const ID = 'mag-fatture';
export const CAT_MAG = MR.CAT_MAG;
export const CAT_CAMPAGNA = MR.CAT_MAG;   // nome di prima (1.59.0)
/** Categoria dei Conti → categoria del magazzino per un prodotto nuovo. */
export const CAT_FATT = Object.fromEntries(Object.entries(MR.FAMIGLIE).map(([k, v]) => [k, v.cat]));
export const { paroleDa, unitaPer, categoriaPer, daFatture } = MR;

const norm = MR.norm;
const r3 = x => Math.round(x * 1000) / 1000;
let _ridisegna = () => {};
export const setRender = fn => { _ridisegna = fn; };
const ridisegna = () => { try { _ridisegna(); } catch (e) { console.warn(e); } };

export const stato = () => S.econfig.find(x => x.id === ID) || VUOTO;
const VUOTO = Object.freeze({});   // sempre lo stesso oggetto: il segui del Centro non vede cambiamenti finti
export const daData = () => okD(stato().da) ? stato().da : new Date().getFullYear() + '-01-01';
/** Salva lo stato unendo i segni di fatti letti al momento del salvataggio (niente segni persi fra automatico e tocchi a mano);
 *  la data di partenza si fissa al primo salvataggio, così non scivola al cambio d'anno. */
async function salvaStato(d, via = []) {
  const s = stato(); const { id, ...vec } = s;
  const fatti = Object.assign({}, s.fatti || {}, d.fatti || {}); via.forEach(k => delete fatti[k]);
  await store.put('econfig', ID, Object.assign({ tipo: 'magfatt' }, vec, d, { fatti, da: okD(d.da) ? d.da : daData() })); ridisegna();
}
export const salvaDa = da => salvaStato({ da: okD(da) ? da : daData() });
export const chiave = r => r.fid + ':' + r.i;
export const idMov = k => 'mf-' + String(k).replace(/[^A-Za-z0-9_-]/g, '-');
/** Quantità della riga nell'unità del prodotto (null se non si sa convertire). */
export const quantita = (r, p) => MR.qta(r, p).q;

/** Righe d'acquisto dal giorno scelto: fatte, tolte, doppie (copia della stessa fattura), pronte (sicure) e daFare (dubbi). */
let memo = null;
export function elenco() {
  if (!contiVisibili()) return { da: daData(), fatte: [], tolte: [], doppie: [], daFare: [], pronte: [] };
  const da = daData(); const dep = [S.fatture, S.prodotti, S.movimenti, S.econfig, fitoMeta.n, fitoMeta.versione, da];
  if (memo && dep.every((d, i) => d === memo.dep[i])) return memo.E;
  const E = MR.classifica({ righe: righe(), fatture: S.fatture, prodotti: S.prodotti, movimenti: S.movimenti, fatti: stato().fatti || {}, da,
    fito: n => fitoLookup(n), dataDi: r => leggiDdt(r.ddt, r.data) });
  memo = { dep, E }; return E;
}
let memoP = null;
function prezziTutti() {
  const dep = [S.fatture, S.movimenti, S.econfig]; if (memoP && dep.every((d, i) => d === memoP.dep[i])) return memoP.P;
  const P = MR.prezzi({ fatture: S.fatture, movimenti: S.movimenti, fatti: stato().fatti || {} }); memoP = { dep, P }; return P;
}

/** Fattura, DDT, fornitore e prezzo unitario di un movimento venuto da fattura: si leggono dalle fatture (solo il titolare), non stanno nel movimento. */
export function docFattura(m) {
  if (!m || !m.fattRiga || !contiVisibili()) return '';
  const k = String(m.fattRiga); const j = k.lastIndexOf(':'); const f = S.fatture.find(y => y.id === k.slice(0, j)); if (!f) return '';
  const r = (f.righe || [])[+k.slice(j + 1)] || {}; const d = okD(f.data) ? f.data.slice(8, 10) + '/' + f.data.slice(5, 7) + '/' + f.data.slice(0, 4) : '';
  const pu = m.tipo === 'Carico' ? prezziTutti().carico.get(m.id) : (N(m.quantita) > 0 ? Math.abs(MR.importoNetto(r)) / N(m.quantita) : 0);
  const q = pu > 0 ? ' · ' + (Math.round(pu * 100) / 100).toLocaleString('it-IT', { minimumFractionDigits: 2 }) + ' €' : '';
  return [(MR.NOTE.has(f.tipoDoc) ? 'Nota di credito ' : 'Fatt. ') + (f.numero || '') + (d ? ' del ' + d : ''), String(r.ddt || '').trim() ? 'DDT ' + leggiDdt(r.ddt, f.data).num : '', f.controparte || ''].filter(Boolean).join(' · ') + q;
}
/** Solo per il titolare: prezzo dell'ultimo carico di ogni prodotto, a mano (prezzo scritto) o da fattura (importo netto con gli sconti
 *  di riga e di fattura e le note di credito di prezzo, ÷ quantità). Map id prodotto → prezzo. Ai collaboratori Map vuota. */
export function prezziAcquisto() {
  const out = new Map(); if (!contiVisibili()) return out;
  for (const [pid, u] of prezziTutti().ultimo) out.set(pid, u.pu);
  return out;
}
/** Il movimento non porta prezzo, fornitore né numero di fattura: movimenti e prodotti li vedono anche i collaboratori (scelta di Marco, 19/11/2026).
 *  Un reso (nota di credito con quantità) è uno scarico con reso: true. */
function movimento(x, p, q) {
  const m = { tipo: x.tipo === 'reso' ? 'Scarico' : 'Carico', prodottoId: p.id, data: x.data, quantita: r3(q), fattRiga: x.k, note: String(x.r.descrizione || '').slice(0, 200) };
  if (x.tipo === 'reso') { m.reso = true; m.note = ('Reso al fornitore (nota di credito) · ' + m.note).slice(0, 200); } else m.provenienza = 'Comprato';
  return m;
}

/** Carica le righe pronte (prodotto certo e quantità sicura; resi e correzioni di prezzo col carico d'origine sicuro). Ritorna quante. */
export async function caricaPronte() {
  const E = elenco(); if (!E.pronte.length) return 0;
  const rows = []; const fatti = {};
  for (const x of E.pronte) {
    if (x.tipo === 'prezzo') { fatti[x.k] = 'r>' + x.origine; continue; }
    const id = idMov(x.k); rows.push({ col: 'movimenti', id, data: movimento(x, x.prodotto, x.q) }); fatti[x.k] = id;
  }
  if (rows.length) await store.bulkPut(rows);
  await salvaStato({ fatti });
  return E.pronte.length;
}

/** Abbina una riga: a un prodotto che c'è (pid) o a uno nuovo ({ nome, categoria, unita, nReg? }); per una correzione di prezzo
 *  basta il carico d'origine (origine = 'fid:i'). tipo forza 'prezzo' su un reso ("è solo una correzione del prezzo"). */
export async function abbina(k, opz) {
  corre++;   // niente carico automatico a metà: le righe dello stesso prodotto le carica abbina, per contarle
  try { return await abbina1(k, opz); } finally { corre--; ridisegna(); }
}
async function abbina1(k, { pid, nuovo, q, ricorda, paroleR, origine, tipo }) {
  const x = elenco().daFare.find(y => y.k === k); if (!x) throw new Error('Riga non trovata: forse è già stata caricata.');
  const t = tipo || x.tipo;
  if (t === 'prezzo') {
    const o = origine || x.origine; if (!o) throw new Error('Scegli il carico da correggere.');
    await salvaStato({ fatti: { [k]: 'r>' + o } }); return 0;
  }
  q = N(q); if (!(q > 0)) throw new Error('Scrivi la quantità.');
  let p;
  if (nuovo) {
    const nome = String(nuovo.nome || '').trim(); if (!nome) throw new Error('Scrivi il nome del prodotto.');
    const omonimo = S.prodotti.find(y => norm(y.nome) === norm(nome));
    if (omonimo) throw new Error(MR.daFatture(omonimo) ? 'C\'è già un prodotto con questo nome: sceglilo dall\'elenco.' : `C'è già un prodotto con questo nome fra «${omonimo.categoria}», che non si carica dalle fatture: cambia il nome o la sua categoria.`);
    const cat = CAT_MAG.includes(nuovo.categoria) ? nuovo.categoria : MR.categoriaPer(x.r);
    if (!cat) throw new Error('Scegli la categoria.');
    p = { id: uid(), nome, categoria: cat, unita: nuovo.unita || unitaPer(x.r.um), giacenzaIniziale: 0 };
    const fx = nuovo.nReg ? fitoLookup(nuovo.nReg) : null;
    if (fx) { p.nReg = fx.nReg; p.nRegAuto = fx.nReg; if (fx.sostanze) p.sostanze = fx.sostanze; if (fx.impresa) p.impresa = fx.impresa; if (fx.scadenza) p.scadenzaAut = fx.scadenza; }
  } else { p = get('prodotti', pid); if (!p) throw new Error('Scegli il prodotto.'); p = Object.assign({}, p); }
  if (ricorda) p = MR.impara(p, x.r, q, paroleR);
  const m = movimento(Object.assign({}, x, { tipo: t }), p, q); const mid = idMov(k);
  const { id, ...dp } = p;
  await store.bulkPut([{ col: 'prodotti', id, data: dp }, { col: 'movimenti', id: mid, data: m }]);
  await salvaStato({ fatti: { [k]: mid } });
  return ricorda ? caricaPronte() : 0;
}
/** "Non caricare" (o rimetti fra quelle da fare). */
export async function togli(k, si = true) { await (si ? salvaStato({ fatti: { [k]: 'no' } }) : salvaStato({}, [k])); }
/** Per l'annulla del Centro: il prodotto dimentica codice, descrizione e parole imparati dalla riga k, se li ha ancora
 *  e se non li sapeva già prima della conferma (prima = versione del prodotto di prima, dal diario). */
export async function dimentica(pid, k, prima = {}) {
  const p = get('prodotti', pid); if (!p) return;
  const j = String(k).lastIndexOf(':'); const f = S.fatture.find(y => y.id === String(k).slice(0, j)); const r0 = f && (f.righe || [])[+String(k).slice(j + 1)]; if (!r0) return;
  const r = Object.assign({}, r0, { piva: f.piva, controparte: f.controparte });
  const sa = (l, v) => (prima[l] || []).includes(v);
  const ck = sa('codiciFatt', MR.codChiave(r)) ? '' : MR.codChiave(r), dk = sa('descrFatt', MR.descrK(r)) ? '' : MR.descrK(r);
  const w0 = MR.paroleDa(r.descrizione); const w = w0 && String(prima.paroleFatt || '').split(',').some(x => norm(x.trim()) === norm(w0)) ? '' : w0;
  const d = Object.assign({}, p); delete d.id; let cambia = false;
  if (ck && (d.codiciFatt || []).includes(ck)) { d.codiciFatt = d.codiciFatt.filter(x => x !== ck); cambia = true; }
  if (dk && (d.descrFatt || []).includes(dk)) { d.descrFatt = d.descrFatt.filter(x => x !== dk); cambia = true; }
  if (w && d.paroleFatt) { const alt = String(d.paroleFatt).split(',').map(x => x.trim()).filter(Boolean); const resta = alt.filter(x => norm(x) !== norm(w)); if (resta.length !== alt.length) { d.paroleFatt = resta.join(', '); cambia = true; } }
  if (cambia) await store.put('prodotti', p.id, d);
}
/** Rimette in fatti il segno delle righe il cui carico da fattura c'è ancora (dopo un annulla che ha rimesso econfig com'era). */
export async function risegna() {
  const f = stato().fatti || {}; const add = {};
  for (const m of S.movimenti) if (m.fattRiga && String(m.id).startsWith('mf-') && !f[m.fattRiga]) add[m.fattRiga] = m.id;
  if (Object.keys(add).length) await salvaStato({ fatti: add });
}

/** Toglie prezzo, fornitore e numero di fattura dai carichi fatti con la 1.59.0 (e il prezzo dei prodotti preso allora dalle fatture). */
let pulito = false;
async function pulisci() {
  if (pulito) return; pulito = true;
  const rows = []; const daF = S.movimenti.filter(m => m.fattRiga);
  const fornDi = m => { const k = String(m.fattRiga); const f = S.fatture.find(y => y.id === k.slice(0, k.lastIndexOf(':'))); return f ? f.controparte || '' : ''; };
  // prodotti prima dei movimenti: serve il prezzo dei carichi vecchi per capire se il prezzo del prodotto viene da una fattura
  for (const p of S.prodotti) {
    const miei = daF.filter(m => m.prodottoId === p.id); if (!miei.length && !p.prezzoData) continue;
    const d = Object.assign({}, p); delete d.id; let cambia = false;
    if (p.prezzoData) {
      delete d.prezzoData; cambia = true;
      if (miei.some(m => m.data === p.prezzoData && N(m.prezzo) === N(p.prezzo))) {   // prezzo preso da una fattura: torna quello dell'ultimo carico a mano, se c'è
        const mano = S.movimenti.filter(m => !m.fattRiga && m.prodottoId === p.id && m.tipo === 'Carico' && N(m.prezzo) > 0).sort((a, b) => (b.data || '').localeCompare(a.data || ''))[0];
        if (mano) d.prezzo = N(mano.prezzo); else delete d.prezzo;
      }
    }
    if (p.fornitore && miei.some(m => fornDi(m) && fornDi(m) === p.fornitore)) { delete d.fornitore; cambia = true; }
    if (cambia) rows.push({ col: 'prodotti', id: p.id, data: d });
  }
  for (const m of daF) if (m.prezzo !== undefined || m.documento !== undefined) { const { id, prezzo, documento, ...d } = m; rows.push({ col: 'movimenti', id, data: d }); }
  if (rows.length) await store.bulkPut(rows);
}

/* ---------------- automatico ---------------- */
let corre = 0, ultimo = null;
/** Pulsante "Controlla le fatture": scarica le novità dal cloud (se collegato) e carica le righe pronte. Ritorna quante. */
export async function controllaOra() {
  if (corre) throw new Error('Sto già controllando: aspetta un momento.');
  corre++;
  try {
    try { await store.syncNow(); } catch (e) { console.warn(e); }   // senza rete si controlla quello che c'è sul dispositivo
    return await caricaPronte();
  } finally { corre--; ultimo = null; ridisegna(); }
}
/** Da chiamare a ogni disegno della pagina: se sono cambiate fatture, prodotti o impostazioni, carica le righe pronte. */
export function autoSeServe() {
  if (corre || !contiVisibili() || !S.fatture.length) return;
  if (!pulito) { corre++; pulisci().catch(e => { pulito = false; console.warn(e); }).finally(() => { corre--; ridisegna(); }); return; }
  const dep = [S.fatture, S.prodotti, S.econfig]; if (ultimo && dep.every((d, i) => d === ultimo[i])) return; ultimo = dep;
  corre++;
  caricaPronte().then(n => { if (n) ridisegna(); if (n) toast(n === 1 ? 'Caricata in magazzino 1 riga di fattura' : `Caricate in magazzino ${n} righe di fattura`); })
    .catch(e => console.warn(e)).finally(() => { corre--; });
}
/** Per il Centro automatico (js/automazioni-agganci.js): la sistemazione dei carichi della 1.59.0 (una volta sola)
 *  e se c'è un abbinamento a mano in corso. */
export async function pulisciSeServe() { if (!pulito) await pulisci().catch(e => { pulito = false; throw e; }); }
export const occupato = () => corre > 0;
