// Sistemazione dei dati già salvati dopo la correzione di un errore dell'app (dalla 1.32.1).
// Qui si prepara solo l'elenco di che cosa cambierebbe, con prima e dopo: niente cambia senza la conferma del titolare.
//   1. righe di acquisto in "Animali domestici" date in automatico dalla vecchia regola "CAT" (CATASTALE, CATRAME, CAT. 1…)
//      o dalla memoria e dall'IA che l'avevano imparata: nuova categoria con le regole di oggi (mai quelle scelte a mano);
//   2. autofatture per acquisti da esonerati (art. 34, c. 6) salvate fra le vendite: si spostano negli acquisti,
//      oppure si tolgono se la stessa fattura c'è già fra gli acquisti (stessa partita IVA, numero e data).
import { S } from '../state.js';
import * as store from '../store.js';
import { N } from '../util.js';
import { regole, pivaPropria, DA_CLASSIFICARE } from './dati.js';
import { classificaConMemoria, impara } from './regole.js';
import { pulisciAutofattura } from './fatture-parse.js';
import { idFattura } from './importa.js';

export const CAT_ANIMALI = 'Animali domestici';
const CAT_BESTIAME = 'Acquisto bestiame', IMPORTO_ALTO = 5000;
const RE_AUTOF = /\bauto\s?fattur/i, RE_ESON = /esonerat|art\.?\s*34\b[^\n]{0,12}(c\.|comma)\s*6\b/i;
const soloCifre = s => String(s || '').replace(/\D/g, '');
const numN = s => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const COME = { '': 'regola', descrizione: 'memoria (stessa descrizione)', simile: 'memoria (descrizione simile)', fornitore: 'memoria (stesso fornitore)', ia: 'IA', regola: 'regola' };

/** È un'autofattura per acquisti da esonerati? (dal segno salvato o dal testo delle righe) */
export const eAutofattura = f => !!f.autofattura || (f.righe || []).some(r => RE_AUTOF.test(r.descrizione || '') && RE_ESON.test(r.descrizione || ''));
/** La stessa fattura fra gli acquisti: stessa partita IVA del venditore, stesso numero, stessa data. */
const gemella = f => S.fatture.find(x => x.id !== f.id && x.tipo === 'Acquisto' && x.data === f.data && numN(x.numero) === numN(f.numero) && soloCifre(x.piva).slice(-11) === soloCifre(f.piva).slice(-11));

/** Record dell'acquisto che prende il posto di un'autofattura salvata come vendita. */
export function comeAcquisto(f, reg = regole(), mem = null) {
  const chiave = `${f.piva || ''}|${f.numero || ''}|${f.data || ''}`;
  const righe = (f.righe || []).map(r => {
    const descrizione = pulisciAutofattura(r.descrizione);
    const c = classificaConMemoria(descrizione, f.controparte, reg, 'Acquisto', mem);
    const x = Object.assign({}, r, { descrizione, categoria: c.categoria }); delete x.catManuale; delete x.catConfermata; delete x.cdc;
    if (c.auto) x.catAuto = c.auto; else delete x.catAuto; return x;
  });
  const { id, ...data } = f;
  return Object.assign({}, data, { id: idFattura(chiave), chiave, tipo: 'Acquisto', autofattura: true, righe });
}

/** Elenco delle proposte: { categorie: [...], autofatture: [...], n }. Si ricalcola solo quando cambiano fatture o configurazione. */
let CACHE = null;
export function proposte() {
  if (CACHE && CACHE.f === S.fatture && CACHE.c === S.econfig) return CACHE.v;
  const v = calcolaProposte(); CACHE = { f: S.fatture, c: S.econfig, v }; return v;
}
function calcolaProposte() {
  const reg = regole(); const mem = impara(S.fatture, reg);
  const categorie = [];
  for (const f of S.fatture) {
    if (f.tipo !== 'Acquisto') continue;
    (f.righe || []).forEach((r, i) => {
      if (r.categoria !== CAT_ANIMALI || r.catManuale || r.catConfermata) return;
      const c = classificaConMemoria(r.descrizione, f.controparte, reg, 'Acquisto', mem);
      if (c.categoria === CAT_ANIMALI) return;
      // importo alto e non bestiame: può essere un mezzo o un'attrezzatura nuova (investimento), la categoria la sceglie il titolare
      const alto = Math.abs(N(r.importo)) >= IMPORTO_ALTO && c.categoria !== CAT_BESTIAME;
      categorie.push({ k: `c|${f.id}|${i}`, fid: f.id, i, data: f.data, numero: f.numero, controparte: f.controparte || '', descrizione: r.descrizione || '', importo: N(r.importo), prima: CAT_ANIMALI, come: COME[r.catAuto || ''] || r.catAuto, dopo: alto ? DA_CLASSIFICARE : c.categoria, auto: alto ? '' : c.auto, nota: alto ? `importo alto: se è un mezzo o un'attrezzatura nuova è un investimento${c.categoria !== DA_CLASSIFICARE ? ' (le regole direbbero "' + c.categoria + '")' : ''}` : '' });
    });
  }
  const propria = pivaPropria(); const autofatture = [];
  for (const f of S.fatture) {
    if (f.tipo !== 'Vendita' || !eAutofattura(f)) continue;
    if (propria && soloCifre(f.piva).slice(-11) === propria) continue;
    const g = gemella(f);
    const nuovo = g ? null : comeAcquisto(f, reg, mem);
    autofatture.push({
      k: `a|${f.id}`, fid: f.id, data: f.data, numero: f.numero, controparte: f.controparte || '', piva: f.piva || '', totale: N(f.totale), file: f.file || '',
      azione: g ? 'togli' : 'sposta', gid: g ? g.id : nuovo.id, nuovo,
      prima: `Vendita · ${[...new Set((f.righe || []).map(r => r.categoria))].join(', ')}`,
      dopo: g ? `Tolta: è già fra gli acquisti${g.file ? ' (' + g.file + ')' : ''}` : `Acquisto · ${[...new Set(nuovo.righe.map(r => r.categoria))].join(', ')}`,
    });
  }
  return { categorie, autofatture, n: categorie.length + autofatture.length };
}

/** Riferimenti a una fattura da spostare su un altro id: pagamenti abbinati e collegamenti dell'archivio. */
function riferimenti(vecchio, nuovo) {
  const rows = [];
  for (const p of S.pagamenti) if ((p.fatt || []).includes(vecchio)) { const { id, ...data } = p; rows.push({ col: 'pagamenti', id, data: Object.assign(data, { fatt: [...new Set(p.fatt.map(x => (x === vecchio ? nuovo : x)))] }) }); }
  for (const x of S.econfig) if (String(x.id).startsWith('ar-') && (x.link || []).some(l => l.col === 'fatture' && l.id === vecchio)) {
    const { id, ...data } = x; const visti = new Set();
    data.link = x.link.map(l => (l.col === 'fatture' && l.id === vecchio ? Object.assign({}, l, { id: nuovo }) : l)).filter(l => { const k = l.col + '|' + l.id; if (visti.has(k)) return false; visti.add(k); return true; });
    rows.push({ col: 'econfig', id, data });
  }
  return rows;
}
/** Unisce i pagamenti della banca della vendita sbagliata a quelli dell'acquisto (senza doppioni dello stesso movimento). */
const unisciBanca = (a, b) => { const out = [...(a || [])]; for (const p of b || []) if (!out.some(x => x.mov === p.mov)) out.push(p); return out; };

/** Applica le proposte scelte. `scelte` = chiavi selezionate; `dopo` = categorie cambiate a mano nella tabella (chiave → categoria).
 *  Ritorna { righe, spostate, tolte }. */
export async function applica(scelte, dopo = {}) {
  const P = proposte(); const sel = new Set(scelte);
  const perFattura = new Map(); let nRighe = 0, spostate = 0, tolte = 0;
  for (const c of P.categorie) {
    if (!sel.has(c.k)) continue;
    const f = perFattura.get(c.fid) || S.fatture.find(x => x.id === c.fid); if (!f) continue;
    const cat = String(dopo[c.k] || c.dopo).trim() || DA_CLASSIFICARE; const aMano = !!dopo[c.k] && dopo[c.k] !== c.dopo;
    const rr = f.righe.map((r, i) => {
      if (i !== c.i) return r;
      const x = Object.assign({}, r, { categoria: cat });
      if (aMano) { x.catManuale = true; delete x.catAuto; } else if (c.auto && cat !== DA_CLASSIFICARE) x.catAuto = c.auto; else delete x.catAuto;
      return x;
    });
    perFattura.set(c.fid, Object.assign({}, f, { righe: rr })); nRighe++;
  }
  const rows = [...perFattura.values()].map(f => { const { id, ...data } = f; return { col: 'fatture', id, data }; });
  const togli = [];
  for (const a of P.autofatture) {
    if (!sel.has(a.k)) continue;
    const f = S.fatture.find(x => x.id === a.fid); if (!f) continue;
    if (a.azione === 'togli') {
      const g = S.fatture.find(x => x.id === a.gid);
      if (g && (f.pagamentiBanca || []).length) { const { id, ...data } = g; rows.push({ col: 'fatture', id, data: Object.assign(data, { pagamentiBanca: unisciBanca(g.pagamentiBanca, f.pagamentiBanca) }) }); }
      tolte++;
    } else {
      const { id, ...data } = a.nuovo; rows.push({ col: 'fatture', id, data }); spostate++;
    }
    rows.push(...riferimenti(f.id, a.gid)); togli.push(f.id);
  }
  if (rows.length) await store.bulkPut(rows);
  for (const id of togli) await store.remove('fatture', id);
  return { righe: nRighe, spostate, tolte };
}

/** Nel salvataggio delle fatture: la vendita sbagliata che corrisponde a un'autofattura appena letta come acquisto. */
export function venditaSbagliata(rec, propria) {
  if (!rec.autofattura || rec.tipo !== 'Acquisto') return null;
  return S.fatture.find(x => x.tipo === 'Vendita' && x.id !== rec.id && x.data === rec.data && numN(x.numero) === numN(rec.numero) && soloCifre(x.piva).slice(-11) === soloCifre(rec.piva).slice(-11) && (!propria || String(x.chiave || '').startsWith(propria + '|'))) || null;
}
export { riferimenti, unisciBanca };
