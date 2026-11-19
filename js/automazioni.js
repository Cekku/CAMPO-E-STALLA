// Centro automatico (chiesto da Marco il 19/11/2026): il punto unico da cui partono e si controllano le automazioni
// dell'inserimento dei dati. Contratto completo in .claude/rules/automazioni.md.
// - registra({ id, nome, area, esegui, ... }): ogni automazione si iscrive qui (gli agganci sono in automazioni-agganci.js).
// - Giro automatico all'apertura dell'app (se l'ultimo giro completo ha più di 5 minuti) e poi ogni 30 minuti finché
//   l'app è aperta; avvia(id), avviaArea(area), avviaTutto() per i pulsanti. Un blocco evita due giri insieme.
// - Diario: ogni automazione che ha scritto qualcosa lascia una riga "ad-<giro>-<id>" con i record scritti
//   (raccolta, id, versione di prima e impronta di quella scritta), così il giro si può annullare. Le righe delle
//   automazioni riservate al titolare (Conti, Personale, Archivio, o soloTitolare) stanno in econfig, riservata come le
//   fatture (RLS); le altre in config, che vedono tutti i collaboratori. Si tengono 30 giorni.
// - Dubbi: un dato non sicuro non si salva da solo; va nella lista "Da controllare" con la proposta pronta.
//   Gli scartati non tornano (riga "ad-scarti" in econfig o config).
import { S, UI, bus, COLS } from './state.js';
import * as store from './store.js';
import { lsGet, lsSet } from './util.js';
import { toast } from './ui.js';
import { contiVisibili } from './views/conti.js';
import { RISERVATE as RACC_RISERVATE } from './conti/dati.js';

/** Aree del Centro: [chiave, etichetta, icona]. */
export const AREE = [['conti', 'Conti', 'wallet'], ['personale', 'Personale', 'users'], ['magazzino', 'Magazzino', 'warehouse'], ['stalla', 'Stalla', 'cow'], ['campagna', 'Campagna', 'sprout'], ['archivio', 'Archivio', 'book-open']];
const RISERVATE = new Set(['conti', 'personale', 'archivio']);
export const OGNI = 30 * 60e3;          // ritmo del giro automatico
const APERTURA = 5 * 60e3;              // riaprendo l'app entro 5 minuti dall'ultimo giro non se ne fa un altro
const GIORNI_DIARIO = 30;
const MAX_RIGA = 700e3;                 // caratteri massimi di una riga del diario (oltre, le versioni di prima più grandi si lasciano)
const SCARTI = 'ad-scarti';

const REG = new Map();
const DUBBI = new Map();                // dubbi restituiti dall'ultimo giro di ogni automazione (in memoria)
let ver = 0;                            // cambia quando cambiano iscrizioni o dubbi in memoria
const ridisegna = () => { try { bus.render(); } catch (e) { } };

/* ---------------- iscrizione ---------------- */
/**
 * Iscrive un'automazione. Obbligatori: id, nome, area (una di AREE), esegui(ctx) → { salvati?, dubbi?, note? }.
 * Facoltativi: descr, soloTitolare, raccolte (raccolte che scrive: solo queste vanno nel diario), pronta(ctx)
 * (true/undefined = parti, false = salta in silenzio, testo = salta e spiega perché), dubbi() (dubbi letti dai dati
 * salvati: restano anche dopo aver ricaricato l'app), segui (raccolte, o funzione che dà un elenco di valori: quando
 * cambiano l'automazione riparte da sola), annullato(riga, tolti) (dopo l'annullamento di una sua riga del diario),
 * propri(col, id) (true = record scritto da lei: va nel diario anche mentre si usa l'app a mano).
 */
export function registra(def) {
  if (!def || !def.id || !def.nome || typeof def.esegui !== 'function') throw new Error('registra: servono id, nome ed esegui');
  if (!AREE.some(a => a[0] === def.area)) throw new Error('registra: area sconosciuta "' + def.area + '"');
  const d = Object.assign({ descr: '', raccolte: null, segui: null, pronta: null, dubbi: null, annullato: null, propri: null }, def);
  d.soloTitolare = RISERVATE.has(d.area) || !!def.soloTitolare;
  REG.set(d.id, d); ver++;
  return d;
}
export const elenco = () => [...REG.values()];
export const puoVedere = d => !!d && (!d.soloTitolare || contiVisibili());
export const visibili = () => elenco().filter(puoVedere);
export const areaNome = k => (AREE.find(a => a[0] === k) || [k, k])[1];
/** Dati pronti: caricati e, con l'azienda collegata, scaricati dal cloud senza modifiche in attesa. */
export const pronto = () => UI.loaded && (!store.sync.farm || (store.sync.status === 'ok' && !store.sync.pending));
const colDi = d => (d && d.soloTitolare ? 'econfig' : 'config');

/* ---------------- stato ---------------- */
export const STATO = {
  attivo: false,                                   // blocco: c'è un giro (o un annullamento, una conferma) in corso
  corrente: '',                                    // nome dell'automazione che sta girando
  ultimo: lsGet('ces.centro.ultimo', null),        // ora dell'ultimo giro completo su questo dispositivo
  esiti: lsGet('ces.centro.esiti', {}) || {},      // ultimo esito di ogni automazione: { quando, salvati, note, errore, saltata }
};
export const prossimo = () => (STATO.ultimo ? new Date(STATO.ultimo).getTime() + OGNI : null);

/* ---------------- impronta stabile di un record (per accorgersi se è cambiato dopo il giro) ---------------- */
function stabile(o) {
  if (o === null || typeof o !== 'object') return JSON.stringify(o === undefined ? null : o);
  if (Array.isArray(o)) return '[' + o.map(stabile).join(',') + ']';
  return '{' + Object.keys(o).filter(k => k !== 'id' && o[k] !== undefined).sort().map(k => JSON.stringify(k) + ':' + stabile(o[k])).join(',') + '}';
}
function impronta(o) { if (!o) return 0; const s = stabile(o); let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0) || 1; }

/* ---------------- cattura delle scritture ---------------- */
// Scritture fatte a mano durante un giro (un tocco, un modulo, un file caricato): non sono dell'automazione e "Annulla"
// non le deve toccare. app.js segna ogni azione a mano (mano() con la promessa dell'azione, segnaMano() per le altre);
// mentre ce n'è una in corso, e per 2 secondi dopo, si registra solo quello che l'automazione dichiara suo (propri).
let manoN = 0, manoFino = 0;
export function mano(p) { manoN++; const fine = () => { manoN--; manoFino = Math.max(manoFino, Date.now() + 2000); }; Promise.resolve(p).then(fine, fine); }
export const segnaMano = () => { manoFino = Math.max(manoFino, Date.now() + 2000); };
const aMano = () => manoN > 0 || Date.now() < manoFino;
// tutto = conferma o scarto toccati da Marco: quello che si scrive in quel momento è la sua scelta, anche se
// pochi secondi prima ha toccato altro (altrimenti con aMano() la riga del diario resterebbe vuota e non si annullerebbe)
function cattura(d, tutto = false) {
  const scritti = new Map(); const cap = { scritti, saltati: 0 };
  const f = (col, id, prima) => {
    if (d.raccolte && !d.raccolte.includes(col)) return;
    if ((col === 'econfig' || col === 'config') && String(id).startsWith('ad-')) return;   // il diario stesso
    if (colDi(d) === 'config' && RACC_RISERVATE.includes(col)) return;                     // niente dati riservati nel diario che vedono i collaboratori
    if (!tutto && (d.propri ? !d.propri(col, String(id)) : aMano())) { cap.saltati++; return; }
    const k = col + '/' + id; if (scritti.has(k)) return;                                  // conta la versione di prima del giro
    if (prima) { const { id: _, ...p } = prima; scritti.set(k, { c: col, id, p }); } else scritti.set(k, { c: col, id, n: 1 });
  };
  store.osservatori.add(f);
  cap.fine = () => store.osservatori.delete(f);
  return cap;
}

/* ---------------- diario ---------------- */
async function scriviDiario(d, gid, motivo, cap, es) {
  const scritti = [...cap.scritti.values()];
  if (!scritti.length && !es.errore) return null;
  const ix = {};
  for (const s of scritti) { const m = ix[s.c] || (ix[s.c] = new Map(S[s.c].map(x => [x.id, x]))); s.h = impronta(m.get(s.id)); }
  let tot = JSON.stringify(scritti).length;
  if (tot > MAX_RIGA) for (const s of [...scritti].sort((a, b) => (b.p ? JSON.stringify(b.p).length : 0) - (a.p ? JSON.stringify(a.p).length : 0))) { if (tot <= MAX_RIGA || !s.p) break; tot -= JSON.stringify(s.p).length; delete s.p; }
  const id = 'ad-' + gid + '-' + d.id;
  await store.put(colDi(d), id, Object.assign({ tipo: 'diario', giro: gid, aut: d.id, nome: d.nome, area: d.area, quando: new Date().toISOString(), motivo, salvati: es.salvati, note: es.note || '', errore: es.errore || '', scritti }, cap.saltati ? { aMano: cap.saltati } : {}, es.dubbio ? { dubbio: es.dubbio } : {}));
  return id;
}
const righeDiario = () => [...S.config, ...(contiVisibili() ? S.econfig : [])].filter(x => x.tipo === 'diario' && String(x.id).startsWith('ad-'));
const rigaDiario = id => righeDiario().find(x => x.id === id) || null;
const colRiga = r => (S.econfig.some(x => x.id === r.id) ? 'econfig' : 'config');
/** Il diario diviso per giro, dal più recente: [{ giro, quando, motivo, righe }]. */
export function diario() {
  const g = new Map();
  for (const r of righeDiario()) { const k = r.giro || r.id; if (!g.has(k)) g.set(k, { giro: k, quando: r.quando, motivo: r.motivo, righe: [] }); const x = g.get(k); x.righe.push(r); if (r.quando > x.quando) x.quando = r.quando; }
  return [...g.values()].sort((a, b) => String(b.quando).localeCompare(String(a.quando)));
}
async function pulisciDiario() {
  if (store.soloLettura()) return;
  const lim = new Date(Date.now() - GIORNI_DIARIO * 864e5).toISOString();
  for (const r of righeDiario()) if (String(r.quando || '') < lim) { try { await store.remove(colRiga(r), r.id); } catch (e) { console.warn(e); } }
}

/* ---------------- dubbi ---------------- */
const scartiIn = col => (S[col].find(x => x.id === SCARTI) || {}).ids || {};
async function segnaScartato(d, id) {
  const col = colDi(d); const ids = Object.assign({}, scartiIn(col), { [id]: new Date().toISOString() });
  const k = Object.keys(ids); if (k.length > 3000) k.sort((a, b) => ids[a].localeCompare(ids[b])).slice(0, k.length - 3000).forEach(x => delete ids[x]);
  await store.put(col, SCARTI, { tipo: 'scarti', ids });
}
let cacheD = null;
/** Tutti i dubbi da controllare delle automazioni visibili, senza gli scartati: { id, area, aut, testo, proposta, conferma?, scarta?, apri? }. */
export function dubbi() {
  const deps = [...COLS.map(c => S[c]), ver, contiVisibili()];
  if (cacheD && cacheD.deps.length === deps.length && cacheD.deps.every((x, i) => x === deps[i])) return cacheD.v;
  const out = []; const visti = new Set();
  for (const d of visibili()) {
    let L = [];
    try { L = [...((d.dubbi && d.dubbi()) || []), ...(DUBBI.get(d.id) || [])]; } catch (e) { console.warn('dubbi di ' + d.id, e); }
    const sc = scartiIn(colDi(d));
    for (const x of L) { if (!x || !x.id || visti.has(x.id) || sc[x.id]) continue; visti.add(x.id); out.push(Object.assign({ area: d.area }, x, { aut: d.id })); }
  }
  cacheD = { deps, v: out };
  return out;
}
export const numeroDubbi = () => dubbi().length;
const togliDubbio = (aut, id) => { const L = DUBBI.get(aut); if (L && L.some(x => x.id === id)) { DUBBI.set(aut, L.filter(x => x.id !== id)); ver++; } };

/* ---------------- un'automazione ---------------- */
async function esegui1(d, gid, motivo) {
  const ctx = { auto: motivo !== 'pulsante', motivo, giro: gid };
  const quando = new Date().toISOString();
  if (d.pronta) {
    let ok; try { ok = await d.pronta(ctx); } catch (e) { ok = e.message || String(e); }
    if (ok === false || typeof ok === 'string') { const es = { quando, salvati: 0, note: '', errore: '', saltata: typeof ok === 'string' ? ok : 'non serve adesso' }; if (!ctx.auto || !(STATO.esiti[d.id] || {}).quando) STATO.esiti[d.id] = es; return es; }
  }
  STATO.corrente = d.nome; ridisegna();
  const cap = cattura(d); let ris = {}, errore = '';
  try { ris = (await d.esegui(ctx)) || {}; } catch (e) { errore = e.message || String(e); console.warn('automazione ' + d.id, e); }
  finally { cap.fine(); }
  if (Array.isArray(ris.dubbi)) { DUBBI.set(d.id, ris.dubbi); ver++; }
  const salvati = typeof ris.salvati === 'number' ? ris.salvati : Array.isArray(ris.salvati) ? ris.salvati.length : cap.scritti.size;
  const es = { quando, salvati, note: ris.note || '', errore };
  try { es.riga = await scriviDiario(d, gid, motivo, cap, es); } catch (e) { console.warn('diario del Centro automatico', e); }
  STATO.esiti[d.id] = es;
  return es;
}

/* ---------------- giro ---------------- */
const nuovoGiro = () => Date.now().toString(36);
async function giro(lista, motivo, completo = false) {
  if (STATO.attivo) return { occupato: true };
  if (store.soloLettura()) return { solaLettura: true };
  lista = lista.filter(puoVedere);
  if (motivo === 'pulsante') manoFino = 0;   // il tocco su Avvia non è un lavoro a mano da proteggere
  const gid = nuovoGiro(); const prima = numeroDubbi();
  STATO.attivo = true; ridisegna();
  const esiti = [];
  try { for (const d of lista) esiti.push([d, await esegui1(d, gid, motivo)]); }
  finally {
    STATO.attivo = false; STATO.corrente = '';
    if (completo) { STATO.ultimo = new Date().toISOString(); lsSet('ces.centro.ultimo', STATO.ultimo); }
    lsSet('ces.centro.esiti', STATO.esiti);
    ridisegna();
  }
  pulisciDiario().catch(e => console.warn(e));
  if (inAttesa.size) setTimeout(corriCambi, 500);
  return { giro: gid, esiti, salvati: esiti.reduce((t, [, e]) => t + (e.salvati || 0), 0), errori: esiti.filter(([, e]) => e.errore).length, dubbiNuovi: Math.max(0, numeroDubbi() - prima) };
}
export function avvia(id, motivo = 'pulsante') { const d = REG.get(id); if (!puoVedere(d)) return Promise.reject(new Error('Automazione non trovata')); return giro([d], motivo); }
export const avviaArea = (area, motivo = 'pulsante') => giro(visibili().filter(d => d.area === area), motivo);
export const avviaTutto = (motivo = 'pulsante') => giro(visibili(), motivo, true);

/** Giro automatico: un avviso breve solo se ha salvato qualcosa o trovato dubbi nuovi. */
async function automatico(motivo) {
  try {
    const r = await avviaTutto(motivo); if (!r || r.occupato || r.solaLettura) return;
    if (r.salvati || r.dubbiNuovi) toast('Automatico: ' + [r.salvati ? r.salvati + (r.salvati === 1 ? ' dato salvato' : ' dati salvati') : '', r.dubbiNuovi ? r.dubbiNuovi + ' da controllare' : ''].filter(Boolean).join(', '));
  } catch (e) { console.warn('giro automatico', e); }
}

/* ---------------- ripartenza quando cambiano i dati (segui) ---------------- */
const firme = new Map(); const inAttesa = new Set(); let tCambio = 0, partito = false;
const depsDi = d => (typeof d.segui === 'function' ? d.segui() : d.segui.map(c => S[c]));
/** Da chiamare dopo ogni disegno della pagina (app.js): fa ripartire le automazioni con "segui" i cui dati sono cambiati. */
export function dopoDisegno() {
  if (!partito || !pronto() || store.soloLettura()) return;
  for (const d of visibili()) {
    if (!d.segui) continue;
    let dep; try { dep = depsDi(d); } catch (e) { continue; }
    const v = firme.get(d.id); firme.set(d.id, dep);
    if (!v || (v.length === dep.length && v.every((x, i) => x === dep[i]))) continue;
    inAttesa.add(d.id); clearTimeout(tCambio); tCambio = setTimeout(corriCambi, 1500);
  }
}
async function corriCambi() {
  if (!inAttesa.size) return;
  if (STATO.attivo) { clearTimeout(tCambio); tCambio = setTimeout(corriCambi, 3000); return; }
  const L = [...inAttesa].map(id => REG.get(id)).filter(Boolean); inAttesa.clear();
  const r = await giro(L, 'cambio');
  if (r && r.esiti) for (const [, e] of r.esiti) if (e.salvati && e.note) toast(e.note);
}

/** All'avvio (app.js, dopo initStore): giro quando i dati sono pronti, poi ogni 30 minuti finché l'app è aperta. */
export function avviaCentro() {
  let n = 0;
  const prova = () => {
    if (partito) return;
    if (!pronto()) { if (++n <= 120) setTimeout(prova, 5000); return; }
    partito = true; dopoDisegno();
    const u = STATO.ultimo ? Date.now() - new Date(STATO.ultimo).getTime() : Infinity;
    if (!(u < APERTURA)) automatico('apertura'); else ridisegna();
  };
  setTimeout(prova, 3000);
  setInterval(() => {
    if (STATO.attivo || !pronto()) return;
    if (!partito) { partito = true; dopoDisegno(); automatico('apertura'); return; }   // dati pronti tardi (es. rete tornata)
    const u = STATO.ultimo ? Date.now() - new Date(STATO.ultimo).getTime() : Infinity;
    if (u >= OGNI) automatico('ogni30');
  }, 60e3);
}

/* ---------------- conferma, scarta, annulla ---------------- */
/** Conferma un dubbio: esegue la proposta; quello che scrive va nel diario (si può annullare). */
export const conferma = id => confermaCon(id, -1);
/** Sceglie l'altra possibilità di un dubbio (x.alternative[i]): come conferma, va nel diario. */
export const alternativa = (id, i) => confermaCon(id, Number(i));
async function confermaCon(id, i) {
  const x = dubbi().find(y => y.id === id); if (!x) throw new Error("Non c'è più: forse è già stato sistemato.");
  const alt = i >= 0 ? (x.alternative || [])[i] : null;
  const fn = i >= 0 ? alt && alt.conferma : x.conferma;
  if (typeof fn !== 'function') throw new Error('Questo va controllato nella sua pagina: tocca Apri.');
  if (STATO.attivo) throw new Error('Aspetta la fine del giro in corso.');
  const d = REG.get(x.aut); STATO.attivo = true;
  const cap = cattura(d, true); let errore = '';
  try { if ((await fn()) === false) errore = 'Non è cambiato niente: i dati sono cambiati nel frattempo, controlla nella sua pagina.'; } catch (e) { errore = e.message || String(e); } finally { cap.fine(); STATO.attivo = false; }
  if (errore) throw new Error(errore);
  togliDubbio(x.aut, id);
  try { await scriviDiario(d, 'c' + nuovoGiro(), 'conferma', cap, { salvati: cap.scritti.size, note: (alt ? 'Scelto «' + String(alt.testo || '').slice(0, 80) + '»: ' : 'Confermato: ') + String(x.testo || '').slice(0, 160) }); } catch (e) { console.warn(e); }
  ridisegna();
}
/** Scarta un dubbio: non torna più. */
export async function scarta(id) {
  const x = dubbi().find(y => y.id === id); if (!x) return;
  if (STATO.attivo) throw new Error('Aspetta la fine del giro in corso.');
  const d = REG.get(x.aut); STATO.attivo = true;
  // quello che scrive lo scarto (es. un cedolino in attesa tolto) va nel diario: si può annullare
  const cap = cattura(d, true);
  try { if (typeof x.scarta === 'function') await x.scarta(); }
  finally { cap.fine(); }
  try { await segnaScartato(d, id); } finally { STATO.attivo = false; }
  try { await scriviDiario(d, 's' + nuovoGiro(), 'scarta', cap, { salvati: 0, note: 'Scartato: ' + String(x.testo || '').slice(0, 160), dubbio: id }); } catch (e) { console.warn(e); }
  togliDubbio(x.aut, id); ridisegna();
}
/** Annulla righe del diario: toglie i record nuovi e rimette la versione di prima di quelli cambiati.
 *  Un record cambiato ancora dopo il giro (a mano o da un altro dispositivo) resta com'è. */
export async function annulla(ids) {
  if (STATO.attivo) throw new Error('Aspetta la fine del giro in corso.');
  STATO.attivo = true; const tot = { fatti: 0, cambiati: 0, persi: 0 };
  try {
    for (const rid of ids) {
      const v = rigaDiario(rid); if (!v || v.annullato) continue;
      const d = REG.get(v.aut); if (d && !puoVedere(d)) continue;
      const rimetti = [], togli = [], tolti = []; const ix = {}; const qui = { fatti: 0, cambiati: 0, persi: 0 };
      for (const s of [...(v.scritti || [])].reverse()) {
        const m = ix[s.c] || (ix[s.c] = new Map(S[s.c].map(x => [x.id, x])));
        const cur = m.get(s.id) || null;
        if (impronta(cur) !== s.h) { qui.cambiati++; continue; }
        if (s.n) { if (cur) { togli.push(s); tolti.push({ c: s.c, id: s.id, rec: cur }); } qui.fatti++; }
        else if (s.p) { rimetti.push({ col: s.c, id: s.id, data: s.p }); if (cur) tolti.push({ c: s.c, id: s.id, rec: cur }); qui.fatti++; }
        else qui.persi++;
      }
      if (rimetti.length) await store.bulkPut(rimetti);
      for (const s of togli) await store.remove(s.c, s.id);
      // annullando uno scarto il dubbio torna in Da controllare
      if (v.motivo === 'scarta' && v.dubbio && d) { const col = colDi(d); const ids = Object.assign({}, scartiIn(col)); if (ids[v.dubbio]) { delete ids[v.dubbio]; await store.put(col, SCARTI, { tipo: 'scarti', ids }); } ver++; }
      if (d && d.annullato) { try { await d.annullato(v, tolti); } catch (e) { console.warn('annullamento di ' + v.aut, e); } }
      const { id, scritti, ...resto } = v;
      for (const k in qui) tot[k] += qui[k];
      await store.put(colRiga(v), rid, Object.assign(resto, { scritti: [], quanti: (scritti || []).length, annullato: new Date().toISOString(), esito: qui }));
    }
  } finally { STATO.attivo = false; ridisegna(); }
  return tot;
}
export const annullaGiro = gid => annulla(righeDiario().filter(r => r.giro === gid && !r.annullato).map(r => r.id));

/* ---------------- ponte dell'archivio sul PC ---------------- */
/** Stato del ponte (porta 1236): 'acceso', 'spento', 'prova' (dati inventati), 'telefono' (non si chiede: il ponte è sul PC)
 *  o 'ignoto'. Chiede al ponte al massimo ogni 30 secondi; forza = chiedi adesso (anche dal telefono). */
export const PONTE = { stato: 'ignoto', quando: 0 };
let inVolo = null;
export function controllaPonte(forza = false) {
  if (inVolo) return inVolo;
  if (!forza && Date.now() - PONTE.quando < 30e3 && PONTE.stato !== 'ignoto') return Promise.resolve(PONTE.stato);
  inVolo = chiediPonte(forza).finally(() => { inVolo = null; });
  return inVolo;
}
async function chiediPonte(forza) {
  const AD = await import('./views/archivio-dati.js'); const c = AD.conf();
  if (c.prova) { PONTE.stato = 'prova'; PONTE.quando = Date.now(); ridisegna(); return PONTE.stato; }
  if (!forza && !AD.pcVicino() && PONTE.stato !== 'acceso') { PONTE.stato = 'telefono'; PONTE.quando = Date.now(); ridisegna(); return PONTE.stato; }
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 3000);
  try { const r = await fetch(String(c.url || AD.PONTE_PREDEFINITO).replace(/\/+$/, '') + '/stato', { cache: 'no-store', signal: ctl.signal }); PONTE.stato = r.ok ? 'acceso' : 'spento'; }
  catch (e) { PONTE.stato = 'spento'; }
  finally { clearTimeout(t); PONTE.quando = Date.now(); }
  ridisegna();
  return PONTE.stato;
}

/* ---------------- navigazione (la imposta app.js) ---------------- */
let naviga = () => {};
export const setNaviga = fn => { naviga = fn; };
/** Apre una pagina dell'app: { area, tab, sub }. */
export const vai = dest => naviga(dest);
/** Apre la pagina di un dubbio: apri è una funzione oppure { area, tab, sub }. */
export function apri(id) {
  const x = dubbi().find(y => y.id === id); if (!x || !x.apri) return;
  if (typeof x.apri === 'function') return x.apri();
  naviga(x.apri);
}
