// Carico in magazzino dei prodotti di campagna comprati (sementi, concimi, fitofarmaci, gasolio) dalle righe delle fatture.
// Funzionamento "misto": la prima riga di un prodotto la abbina il titolare; poi le righe con le stesse parole entrano da sole.
// Stato in econfig 'mag-fatture' (riservata, come le fatture): { da, fatti: { 'fid:i': idMovimento | 'no' } }.
// Sul prodotto (raccolta prodotti): paroleFatt (parole da cercare, alternative con la virgola), convFatt { 'unità fattura>unità prodotto': fattore }.
import { S, get } from './state.js';
import * as store from './store.js';
import { N, okD, uid } from './util.js';
import { righe } from './conti/dati.js';
import { DA_CLASSIFICARE } from './conti/regole.js';
import { umNorm, convertiQ } from './conti/preventivi.js';
import { leggiDdt, paroleNome } from './tracciabilita.js';
import { contiVisibili } from './views/conti.js';
import { toast } from './ui.js';

export const ID = 'mag-fatture';
/** Categoria dei Conti → categoria del magazzino. */
export const CAT_FATT = { 'Sementi': 'Seme', 'Concimi': 'Concime', 'Fitofarmaci': 'Fitofarmaco', 'Carburanti e lubrificanti': 'Gasolio' };
export const CAT_CAMPAGNA = ['Seme', 'Concime', 'Fitofarmaco', 'Diserbante', 'Gasolio', 'Altro'];

const norm = s => String(s || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const parole = s => norm(s).split(/[^A-Z0-9%]+/).filter(Boolean);
const r3 = x => Math.round(x * 1000) / 1000;

let _ridisegna = () => {};
export const setRender = fn => { _ridisegna = fn; };
const ridisegna = () => { try { _ridisegna(); } catch (e) { console.warn(e); } };
const VIA = new Set(['SACCHI', 'SACCO', 'SAC', 'SC', 'BIG', 'BAG', 'BIGBAG', 'SFUSO', 'SFUSA', 'SFUSI', 'KG', 'LT', 'LITRI', 'CONF', 'CONFEZIONE', 'BANCALE', 'PALLET', 'DOSE', 'DOSI', 'TANICA', 'FUSTO', 'FUSTI', 'CISTERNA', 'Q', 'QLI', 'QUINTALI', 'NR', 'PZ']);

export const stato = () => S.econfig.find(x => x.id === ID) || {};
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

/** Parole da ricordare dalla descrizione: senza parole con cifre (lotti, pesi, date). */
export const paroleDa = desc => paroleNome(desc).split(' ').filter(w => w && !/\d/.test(w) && !VIA.has(w)).slice(0, 3).join(' ');
/** Unità del prodotto (elenco UNITA) → chiave di umNorm. */
const umProd = u => u === 'm³' ? 'm3' : umNorm(u);
/** Unità della fattura → unità per un prodotto nuovo. */
export const unitaPer = um => ({ kg: 'kg', g: 'kg', q: 'q', t: 't', l: 'l', hl: 'l', m3: 'm³', pz: 'pz', dose: 'dosi', sacco: 'pz', conf: 'pz', balla: 'pz', rotolo: 'pz', bancale: 'pz' })[umNorm(um)] || 'kg';

/** Punteggio della descrizione per le parole: 0 = non combacia, altrimenti quante parole (vince il più preciso). */
function punteggio(testo, desc) {
  const ws = parole(desc).flatMap(w => w.includes('%') ? [w, w.replace(/%/g, '')] : [w]); let best = 0;   // "46%" vale anche "46"
  for (const a of String(testo || '').split(/[,;]/).map(x => parole(x)).filter(x => x.length)) {
    if (a.length > best && a.every(x => ws.some(w => (x.length >= 3 && !/^\d+$/.test(x)) ? w.startsWith(x) : w === x))) best = a.length;
  }
  return best;
}
const campagna = () => S.prodotti.filter(p => CAT_CAMPAGNA.includes(p.categoria));
/** Prodotto che ha già imparato queste parole (abbinato almeno una volta). */
function imparato(desc, ps = campagna()) { let best = 0, sc = null; for (const p of ps) { const s = punteggio(p.paroleFatt, desc); if (s > best) { best = s; sc = p; } } return sc; }
/** Solo per proporre: prodotto con il nome nella descrizione. */
function somiglia(desc, ps = campagna()) { let best = 0, sc = null; for (const p of ps) { const s = punteggio(paroleNome(p.nome), desc); if (s > best) { best = s; sc = p; } } return sc; }

/** Fattore imparato: per unità della fattura e unità del prodotto (se il prodotto cambia unità il fattore vecchio non vale più). */
const chiaveConv = (r, p) => (umNorm(r.um) || '-') + '>' + (p.unita || '');
/** Righe di servizio (trasporto, contributi…): mai caricate da sole, solo proposte. */
const SERVIZIO = /\b(TRASPORT|CONTRIBUT|NOLO|NOLEGG|SPESE|SPESA|CAUZION|IMBALL|RESO|CONAI|SPEDIZ|CONSEGNA)/;
/** Quantità della riga nell'unità del prodotto (null se non si sa convertire). */
export function quantita(r, p) {
  const um = umNorm(r.um); const q = N(r.quantita);
  const f = p.convFatt && N(p.convFatt[chiaveConv(r, p)]); if (f > 0) return r3(q * f);
  if (!um) return null;
  const v = convertiQ(q, um, umProd(p.unita)); return v === null ? null : r3(v);
}

/** Righe di acquisto dal giorno scelto, divise fra caricate, tolte e da fare. */
export function elenco() {
  if (!contiVisibili()) return { da: daData(), fatte: [], tolte: [], daFare: [], pronte: [] };
  const st = stato(); const fatti = st.fatti || {}; const da = daData(); const ps = campagna();
  const out = { da, fatte: [], tolte: [], daFare: [], pronte: [] };
  for (const r of righe()) {
    if (r.tipo !== 'Acquisto' || r.rett || r.tipoDoc === 'TD04' || !(N(r.quantita) > 0) || N(r.importo) < 0) continue;
    const a = leggiDdt(r.ddt, r.data); if (!okD(a.data) || a.data < da) continue;
    const p = imparato(r.descrizione, ps);
    // fuori dalle categorie di campagna solo righe senza categoria o da classificare (niente "urea zootecnica" fra i concimi)
    if (!CAT_FATT[r.categoria] && !(p && (!r.categoria || r.categoria === DA_CLASSIFICARE))) continue;
    const k = chiave(r); const x = { r, k, data: a.data, ddt: a.num, prodotto: p, q: p ? quantita(r, p) : null };
    if (fatti[k] === 'no') out.tolte.push(x);
    else if (fatti[k]) out.fatte.push(x);
    else if (p && x.q !== null && x.q > 0 && !SERVIZIO.test(norm(r.descrizione))) out.pronte.push(x);
    else { x.proposto = p || somiglia(r.descrizione, ps); if (x.proposto && x.q === null) x.qProp = quantita(r, x.proposto); out.daFare.push(x); }
  }
  const ord = (a, b) => b.data.localeCompare(a.data);
  out.fatte.sort(ord); out.tolte.sort(ord); out.daFare.sort(ord);
  return out;
}

/** Fattura, DDT e fornitore di un carico venuto da fattura: si leggono dalle fatture (solo il titolare), non stanno nel movimento. */
export function docFattura(m) {
  if (!m || !m.fattRiga || !contiVisibili()) return '';
  const k = String(m.fattRiga); const j = k.lastIndexOf(':'); const f = S.fatture.find(y => y.id === k.slice(0, j)); if (!f) return '';
  const r = (f.righe || [])[+k.slice(j + 1)] || {}; const d = okD(f.data) ? f.data.slice(8, 10) + '/' + f.data.slice(5, 7) + '/' + f.data.slice(0, 4) : '';
  const q = N(m.quantita) > 0 && N(r.importo) > 0 ? ' · ' + (Math.round(N(r.importo) / N(m.quantita) * 100) / 100).toLocaleString('it-IT', { minimumFractionDigits: 2 }) + ' €' : '';
  return ['Fatt. ' + (f.numero || '') + (d ? ' del ' + d : ''), String(r.ddt || '').trim() ? 'DDT ' + leggiDdt(r.ddt, f.data).num : '', f.controparte || ''].filter(Boolean).join(' · ') + q;
}
/** Solo per il titolare: prezzo dell'ultimo carico di ogni prodotto, a mano (prezzo scritto) o da fattura (importo senza IVA ÷ quantità).
 *  Map id prodotto → prezzo. Ai collaboratori Map vuota: resta il prezzo scritto sul prodotto. */
export function prezziAcquisto() {
  const out = new Map(); if (!contiVisibili()) return out;
  const fat = new Map(S.fatture.map(f => [f.id, f])); const ult = new Map();
  for (const m of S.movimenti) {
    if (m.tipo !== 'Carico' || !m.prodottoId || !(N(m.quantita) > 0)) continue;
    let pr = 0;
    if (m.fattRiga) { const k = String(m.fattRiga); const j = k.lastIndexOf(':'); const f = fat.get(k.slice(0, j)); const r = f && (f.righe || [])[+k.slice(j + 1)]; if (r) pr = N(r.importo) / N(m.quantita); }
    else pr = N(m.prezzo);
    if (!(pr > 0)) continue;
    const d = m.data || ''; const u = ult.get(m.prodottoId);
    if (!u || d >= u) { ult.set(m.prodottoId, d); out.set(m.prodottoId, pr); }
  }
  return out;
}
/** Il movimento non porta prezzo, fornitore né numero di fattura: movimenti e prodotti li vedono anche i collaboratori (scelta di Marco, 19/11/2026). */
function movimento(x, p, q) {
  return { tipo: 'Carico', prodottoId: p.id, data: x.data, quantita: r3(q), provenienza: 'Comprato', fattRiga: x.k, note: String(x.r.descrizione || '').slice(0, 200) };
}

/** Carica le righe pronte (prodotto già abbinato e quantità chiara). Ritorna quante. */
export async function caricaPronte() {
  const E = elenco(); if (!E.pronte.length) return 0;
  const rows = []; const fatti = {};
  for (const x of E.pronte) { const id = idMov(x.k); rows.push({ col: 'movimenti', id, data: movimento(x, x.prodotto, x.q) }); fatti[x.k] = id; }
  await store.bulkPut(rows);
  await salvaStato({ fatti });
  return E.pronte.length;
}

/** Abbina a mano una riga: a un prodotto che c'è (pid) o a uno nuovo ({ nome, categoria, unita }). */
export async function abbina(k, opz) {
  corre++;   // niente carico automatico a metà: le righe dello stesso prodotto le carica abbina, per contarle
  try { return await abbina1(k, opz); } finally { corre--; ridisegna(); }
}
async function abbina1(k, { pid, nuovo, q, ricorda, paroleR }) {
  const x = elenco().daFare.find(y => y.k === k); if (!x) throw new Error('Riga non trovata: forse è già stata caricata.');
  q = N(q); if (!(q > 0)) throw new Error('Scrivi la quantità.');
  let p;
  if (nuovo) {
    const nome = String(nuovo.nome || '').trim(); if (!nome) throw new Error('Scrivi il nome del prodotto.');
    if (S.prodotti.some(y => norm(y.nome) === norm(nome))) throw new Error('C\'è già un prodotto con questo nome: sceglilo dall\'elenco.');
    const id = uid(); p = { id, nome, categoria: nuovo.categoria || CAT_FATT[x.r.categoria] || 'Altro', unita: nuovo.unita || unitaPer(x.r.um), giacenzaIniziale: 0 };
  } else { p = get('prodotti', pid); if (!p) throw new Error('Scegli il prodotto.'); p = Object.assign({}, p); }
  if (ricorda) {
    const w = String(paroleR || '').trim() || paroleDa(x.r.descrizione);
    if (w && !punteggio(p.paroleFatt, x.r.descrizione)) p.paroleFatt = [p.paroleFatt, w].filter(Boolean).join(', ');
    const ck = chiaveConv(x.r, p); const auto = quantita(x.r, Object.assign({}, p, { convFatt: {} })); const cf = Object.assign({}, p.convFatt || {});
    if (auto === null || Math.abs(auto - q) > 0.001) cf[ck] = q / N(x.r.quantita); else delete cf[ck];
    p.convFatt = cf;
  }
  const m = movimento(x, p, q); const mid = idMov(k);
  const { id, ...dp } = p;
  await store.bulkPut([{ col: 'prodotti', id, data: dp }, { col: 'movimenti', id: mid, data: m }]);
  await salvaStato({ fatti: { [k]: mid } });
  return ricorda ? caricaPronte() : 0;
}
/** "Non caricare" (o rimetti fra quelle da fare). */
export async function togli(k, si = true) { await (si ? salvaStato({ fatti: { [k]: 'no' } }) : salvaStato({}, [k])); }

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
  if (!S.prodotti.some(p => p.paroleFatt)) return;
  const dep = [S.fatture, S.prodotti, S.econfig]; if (ultimo && dep.every((d, i) => d === ultimo[i])) return; ultimo = dep;
  corre++;
  caricaPronte().then(n => { if (n) ridisegna(); if (n) toast(n === 1 ? 'Caricata in magazzino 1 riga di fattura' : `Caricate in magazzino ${n} righe di fattura`); })
    .catch(e => console.warn(e)).finally(() => { corre--; });
}
