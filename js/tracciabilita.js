// Tracciabilità degli alimenti chiesta dal caseificio: registro degli approvvigionamenti (costruito dalle righe delle fatture
// di acquisto, un foglio per prodotto) e registro degli alimenti autoprodotti. Le correzioni a mano restano salvate
// e le fatture nuove entrano da sole. Raccolta `tracciabilita` (non riservata: niente prezzi né importi).
import { S, get, azienda } from './state.js';
import * as store from './store.js';
import { N, okD, addDays, uid, yearOf, esc, nf, today } from './util.js';
import { cropOf } from './domain.js';
import { righe } from './conti/dati.js';
import { umNorm, convertiQ } from './conti/preventivi.js';
import { scriviXlsx, leggiXlsx, serialeAData } from './conti/xlsx.js';
import { scarica } from './conti/tabelle.js';
import { nativa, stampaHtml } from './nativo.js';
import { contiVisibili } from './views/conti.js';

let _ridisegna = () => {};
/** L'app passa qui la sua funzione di ridisegno (per i cambi che toccano solo `UI`). */
export const setRender = fn => { _ridisegna = fn; };
export const ridisegna = () => _ridisegna();
export const COL = 'tracciabilita';
export const ID_IMP = 'tr-impostazioni';
export const ID_AUTO = 'tr-autoprodotti';
const MANGIMI = /mangim|materie prime|integrat|forag|alimenti/i;
const VUOTE = new Set(['DI', 'DA', 'DEL', 'DELLA', 'DELLO', 'DEI', 'DEGLI', 'E', 'ED', 'IN', 'PER', 'CON', 'AL', 'ALLA', 'IL', 'LA', 'LO']);

const norm = s => String(s || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const parole = s => norm(s).split(/[^A-Z0-9%]+/).filter(Boolean);
const paroleCerca = s => parole(s).filter(w => !VUOTE.has(w));
/** Parole di ricerca proposte dal nome del prodotto ("FARINA DI SOIA" → "FARINA SOIA"). */
export const paroleNome = nome => paroleCerca(nome).join(' ');
/** Numero scritto all'italiana ("6.140", "12,5") → numero, null se vuoto o non valido. */
export function numIt(s) {
  s = String(s ?? '').trim().replace(/\s|kg/gi, ''); if (!s) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.'); else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const v = parseFloat(s); return isFinite(v) ? v : null;
}
/** Data per la stampa: gg/mm/aaaa. */
export const dataL = s => okD(s) ? s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4) : '';

/* ---------------- dati salvati ---------------- */
export const prodotti = () => S[COL].filter(x => x.tipo === 'prodotto').sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'it'));
export const prodotto = id => S[COL].find(x => x.id === id && x.tipo === 'prodotto') || null;
export const impostazioni = () => Object.assign({ programma: 'Milk Collection' }, S[COL].find(x => x.id === ID_IMP) || {});
export async function salvaImpostazioni(d) { await store.put(COL, ID_IMP, Object.assign({}, impostazioni(), d, { tipo: 'impostazioni' })); }
async function salva(p) { const { id, ...d } = p; await store.put(COL, id, JSON.parse(JSON.stringify(d))); }
const copia = p => JSON.parse(JSON.stringify(p));

/** Nuovo prodotto (o aggiornamento di nome, parole di ricerca, silos). Ritorna l'id. */
export async function salvaProdotto({ id, nome, parole: pr, silos }) {
  nome = String(nome || '').trim(); if (!nome) throw new Error('Scrivi il nome del prodotto.');
  const p = id ? copia(prodotto(id) || {}) : { id: 'tr-p-' + uid().slice(0, 8), tipo: 'prodotto', mod: {}, linee: {}, extra: [] };
  if (!id && prodotti().some(x => norm(x.nome) === norm(nome))) throw new Error('C\'è già un prodotto con questo nome.');
  Object.assign(p, { tipo: 'prodotto', nome, parole: String(pr ?? '').trim() || paroleNome(nome), silos: String(silos ?? '').trim() });
  await salva(p); return p.id;
}
export async function eliminaProdotto(id) { await store.remove(COL, id); }

/* ---------------- dalle fatture: righe assegnate ai prodotti ---------------- */
/** "86 del 02-01-2025" → { num: '86', data: '2025-01-02' }; senza data vale quella della fattura. */
export function leggiDdt(s, dataF) {
  const t = String(s || '').trim();
  let m = /^(.*?)\s+del\s+(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/i.exec(t);
  if (m) { let y = +m[4]; if (y < 100) y += 2000; const d = `${y}-${m[3].padStart(2, '0')}-${m[2].padStart(2, '0')}`; return { num: m[1].trim(), data: okD(d) ? d : dataF }; }
  m = /^(.*?)\s+del\s+(\d{4}-\d{2}-\d{2})/i.exec(t);
  if (m) return { num: m[1].trim(), data: m[2] };
  return { num: t, data: dataF };
}
/** Funzione che dà il punteggio di una descrizione per il prodotto: 0 = non è lui, altrimenti quante parole combaciano.
 *  Alternative separate da virgola; parole di 3+ lettere anche come inizio di parola, sigle corte e numeri interi. */
function cercatore(p) {
  const alt = String(p.parole || paroleNome(p.nome)).split(/[,;]/).map(paroleCerca).filter(a => a.length);
  const ok = (x, ws) => ws.some(w => (x.length >= 3 && !/^\d+$/.test(x)) ? w.startsWith(x) : w === x);
  return desc => { const ws = parole(desc); let best = 0; for (const a of alt) if (a.length > best && a.every(x => ok(x, ws))) best = a.length; return best; };
}
const chiaveLinea = r => r.fid + ':' + r.i;

/** Righe di acquisto con data di arrivo nell'anno: per prodotto (vince il prodotto con più parole che combaciano),
 *  quelle tolte a mano da ogni prodotto, e le righe di mangimi e foraggi non assegnate a nessun prodotto. */
export function assegna(anno) {
  const ps = prodotti(); const cerc = ps.map(p => [p, cercatore(p)]);
  const per = new Map(ps.map(p => [p.id, []])); const tolte = new Map(ps.map(p => [p.id, []])); const libere = [];
  for (const r of (contiVisibili() ? righe() : [])) {   // le fatture solo al titolare
    if (r.tipo !== 'Acquisto' || r.rett || r.tipoDoc === 'TD04' || !(N(r.quantita) > 0) || N(r.importo) < 0) continue;
    const a = leggiDdt(r.ddt, r.data); if (yearOf(a.data) !== anno) continue;
    const k = chiaveLinea(r); const x = { r, k, ddt: a.num, data: a.data };
    let scelto = ps.find(p => p.linee && p.linee[k] === true) || null;
    if (!scelto) {
      let best = 0;
      for (const [p, f] of cerc) { const s = f(r.descrizione); if (!s) continue; if (p.linee && p.linee[k] === false) { tolte.get(p.id).push(x); continue; } if (s > best) { best = s; scelto = p; } }
    }
    if (scelto) per.get(scelto.id).push(x); else if (MANGIMI.test(r.categoria || '')) libere.push(x);
  }
  return { per, tolte, libere };
}
/** Quantità della riga in kg quando l'unità è un peso; senza unità si legge come kg ma si segnala. */
function inKg(r) {
  const um = umNorm(r.um); const q = N(r.quantita);
  if (!um) return { q, um: 'kg', dubbio: true };
  const k = convertiQ(q, um, 'kg'); return k === null ? { q, um } : { q: k, um: 'kg' };
}

export const CAMPI = ['fornitore', 'ddt', 'data', 'qta', 'conforme', 'accettato', 'silos', 'inizio', 'fine'];
/** Registro di un prodotto nell'anno: una riga per DDT (stesso fornitore, numero e data), correzioni applicate,
 *  N. progressivo, inizio utilizzo = giorno dopo l'arrivo, fine = inizio dell'arrivo dopo. */
export function registro(p, anno, A = assegna(anno)) {
  const gruppi = new Map();
  for (const x of A.per.get(p.id) || []) {
    const forn = x.r.controparte || ''; const ddt = x.ddt || (x.r.numero ? 'Fatt. ' + x.r.numero : '');
    const q = inKg(x.r);   // unità diverse nello stesso DDT (kg e pezzi) restano su righe separate
    const key = [norm(forn), norm(ddt), x.data].join('|') + (q.um === 'kg' ? '' : '|' + q.um);
    let g = gruppi.get(key);
    if (!g) gruppi.set(key, g = { key, auto: true, fornitore: forn, ddt, data: x.data, qta: 0, um: '', dubbio: false, linee: [], fatture: [], descrizioni: [] });
    g.um = g.um || q.um; g.qta += q.q; g.dubbio = g.dubbio || !!q.dubbio;
    g.linee.push(x.k); if (x.r.numero && !g.fatture.includes(x.r.numero)) g.fatture.push(x.r.numero);
    const d = String(x.r.descrizione || '').trim(); if (d && !g.descrizioni.includes(d)) g.descrizioni.push(d);
  }
  const mod = p.mod || {};
  const base = [...gruppi.values()].map(g => {
    const m = mod[g.key] || {}; const auto = { fornitore: g.fornitore, ddt: g.ddt, data: g.data, qta: Math.round(g.qta * 100) / 100, conforme: 'SI', accettato: 'SI', silos: p.silos || '' };
    const out = Object.assign({}, g, auto, { auto: true, valoriAuto: auto, modificati: [] });
    for (const f of CAMPI) if (m[f] !== undefined) { out[f] = m[f]; out.modificati.push(f); }
    return out;
  });
  for (const e of p.extra || []) {
    if (yearOf(e.data) !== anno) continue;
    base.push(Object.assign({ conforme: 'SI', accettato: 'SI', silos: p.silos || '' }, e, { key: 'x:' + e.id, auto: false, extraId: e.id, qta: N(e.qta), um: e.um || 'kg', linee: [], fatture: [], descrizioni: [], modificati: [] }));
  }
  base.sort((a, b) => String(a.data || '').localeCompare(String(b.data || '')) || String(a.ddt || '').localeCompare(String(b.ddt || ''), 'it', { numeric: true }));
  base.forEach((r, i) => { r.n = i + 1; r.inizioAuto = okD(r.data) ? addDays(r.data, 1) : ''; if (!r.modificati.includes('inizio') && !(r.extraId && r.inizio)) r.inizio = r.inizioAuto; });
  base.forEach((r, i) => { const nx = base[i + 1]; r.fineAuto = nx ? nx.inizio : ''; if (!r.modificati.includes('fine') && !(r.extraId && r.fine !== undefined && r.fine !== '')) r.fine = r.fineAuto; });
  const totKg = base.filter(r => r.um === 'kg').reduce((t, r) => t + N(r.qta), 0);
  return { righe: base, tolte: A.tolte.get(p.id) || [], totKg };
}

/* ---------------- correzioni a mano ---------------- */
/** Cambia un campo di una riga del registro. Per le righe dalle fatture: valore uguale a quello automatico (o null) = torna automatico. */
export async function modifica(pid, key, campo, valore) {
  if (!CAMPI.includes(campo)) throw new Error('Campo non valido.');
  const p = copia(prodotto(pid)); if (!p) throw new Error('Prodotto non trovato.');
  if (campo === 'qta' && valore !== null && valore !== '') { const v = numIt(valore); if (v === null) throw new Error('Quantità non valida.'); valore = v; }
  if (['data', 'inizio'].includes(campo) && valore && !okD(valore)) throw new Error('Data non valida.');
  if (key.startsWith('x:')) {
    const e = (p.extra || []).find(x => x.id === key.slice(2)); if (!e) throw new Error('Riga non trovata.');
    e[campo] = valore ?? ''; await salva(p); return;
  }
  p.mod = p.mod || {}; const m = p.mod[key] || {};
  const anno = yearOf(key.split('|')[2]); const r = anno ? registro(prodotto(pid), anno).righe.find(x => x.key === key) : null;
  const auto = r ? (campo === 'inizio' ? r.inizioAuto : campo === 'fine' ? r.fineAuto : r.valoriAuto[campo]) : undefined;
  if (valore === null || (auto !== undefined && String(valore) === String(auto ?? ''))) delete m[campo]; else m[campo] = valore;
  if (Object.keys(m).length) p.mod[key] = m; else delete p.mod[key];
  await salva(p);
}
/** Tutti i campi di una riga tornano quelli presi dalle fatture. */
export async function ripristina(pid, key) { const p = copia(prodotto(pid)); if (p && p.mod) { delete p.mod[key]; await salva(p); } }
/** Riga scritta a mano (consegna senza fattura, DDT non ancora fatturato). */
export async function aggiungiRiga(pid, anno) {
  const p = copia(prodotto(pid)); if (!p) throw new Error('Prodotto non trovato.');
  const t = today(); const data = yearOf(t) === anno ? t : `${anno}-01-01`;
  (p.extra = p.extra || []).push({ id: uid().slice(0, 8), fornitore: '', ddt: '', data, qta: 0, um: 'kg' });
  await salva(p);
}
export async function togliExtra(pid, id) { const p = copia(prodotto(pid)); if (!p) return; p.extra = (p.extra || []).filter(e => e.id !== id); await salva(p); }
/** Toglie dal prodotto le righe delle fatture di un DDT ("non è questo prodotto"): tornano fra le non assegnate. */
export async function togliLinee(pid, linee) { const p = copia(prodotto(pid)); if (!p) return; p.linee = p.linee || {}; linee.forEach(k => { p.linee[k] = false; }); await salva(p); }
export async function rimettiLinee(pid, linee) { const p = copia(prodotto(pid)); if (!p) return; p.linee = p.linee || {}; linee.forEach(k => { delete p.linee[k]; }); await salva(p); }
/** Assegna al prodotto una descrizione delle fatture: diventa un'alternativa delle parole di ricerca (le fatture future entrano da sole). */
export async function assegnaDescrizione(pid, desc) {
  const p = copia(prodotto(pid)); if (!p) throw new Error('Prodotto non trovato.');
  const alt = paroleCerca(desc).filter(w => !/\d/.test(w)).join(' '); if (!alt) throw new Error('La descrizione non ha parole da cercare.');
  const att = String(p.parole || paroleNome(p.nome)).split(/[,;]/).map(s => s.trim()).filter(Boolean);
  if (!att.some(a => norm(a) === norm(alt))) att.push(alt);
  p.parole = att.join(', '); await salva(p);
}
/** Righe non assegnate raggruppate per descrizione (per proporle ai prodotti). */
export function nonAssegnate(anno, A = assegna(anno)) {
  const m = new Map();
  for (const x of A.libere) {
    const d = String(x.r.descrizione || '').replace(/\s+/g, ' ').trim(); const k = norm(d);
    const g = m.get(k) || { descrizione: d, fornitori: [], volte: 0, kg: 0, ultima: '' };
    if (x.r.controparte && !g.fornitori.includes(x.r.controparte)) g.fornitori.push(x.r.controparte);
    g.volte++; const q = inKg(x.r); if (q.um === 'kg') g.kg += q.q; if (x.data > g.ultima) g.ultima = x.data; m.set(k, g);
  }
  return [...m.values()].sort((a, b) => b.volte - a.volte);
}

/* ---------------- alimenti autoprodotti ---------------- */
export const CAMPI_AUTO = ['prodotto', 'data', 'qta', 'conforme', 'zona', 'num', 'inizio', 'fine'];
export const autoprodottiTutti = () => ((S[COL].find(x => x.id === ID_AUTO) || {}).righe || []).slice();
/** Righe del registro dell'anno: prodotte nell'anno, o l'anno prima e ancora in uso all'inizio dell'anno (come i registri del caseificio). */
export function autoprodotti(anno, tutti = false) {
  return autoprodottiTutti().filter(r => tutti || yearOf(r.data) === anno || (yearOf(r.data) === anno - 1 && (!r.fine || r.fine >= `${anno}-01-01`)))
    .sort((a, b) => String(a.data || '').localeCompare(String(b.data || '')) || String(a.prodotto || '').localeCompare(String(b.prodotto || ''), 'it'))
    .map((r, i) => Object.assign({}, r, { n: i + 1 }));
}
async function salvaAuto(rr) { await store.put(COL, ID_AUTO, { tipo: 'autoprodotti', righe: JSON.parse(JSON.stringify(rr)) }); }
export async function aggiungiAuto(anno, dati = {}) {
  const t = today(); const rr = autoprodottiTutti();
  rr.push(Object.assign({ id: uid().slice(0, 8), prodotto: '', data: yearOf(t) === anno ? t : `${anno}-01-01`, qta: 0, conforme: 'SI', zona: 'Trincea', num: '', inizio: '', fine: '' }, dati));
  await salvaAuto(rr);
}
export async function modificaAuto(id, campo, valore) {
  if (!CAMPI_AUTO.includes(campo)) throw new Error('Campo non valido.');
  if (campo === 'qta') { const v = numIt(valore); valore = v ?? 0; }
  if (['data', 'inizio', 'fine'].includes(campo) && valore && !okD(valore)) throw new Error('Data non valida.');
  const rr = autoprodottiTutti(); const r = rr.find(x => x.id === id); if (!r) throw new Error('Riga non trovata.');
  r[campo] = valore ?? ''; await salvaAuto(rr);
}
export async function togliAuto(id) { await salvaAuto(autoprodottiTutti().filter(r => r.id !== id)); }
/** Proposte dalle raccolte e sfalci fatti nell'anno: una per coltura, quantità in quintali (t × 10), data dell'ultima raccolta. */
export function proposteRaccolte(anno) {
  const g = new Map();
  for (const o of S.operazioni) {
    if (!['Raccolta', 'Sfalcio'].includes(o.tipo) || o.stato === 'Pianificata' || yearOf(o.data) !== anno || !(N(o.raccolto) > 0)) continue;
    const c = get('campi', o.campoId); const coltura = (c && cropOf(c, anno)) || 'Raccolto';
    const x = g.get(coltura) || { prodotto: coltura, data: '', qta: 0, origine: `racc:${anno}:${norm(coltura)}` };
    x.qta += N(o.raccolto) * 10; if (o.data > x.data) x.data = o.data; g.set(coltura, x);
  }
  const gia = new Set(autoprodottiTutti().map(r => r.origine).filter(Boolean));
  return [...g.values()].filter(x => !gia.has(x.origine)).map(x => Object.assign(x, { qta: Math.round(x.qta) }));
}
export async function aggiungiProposte(anno) {
  const pp = proposteRaccolte(anno); if (!pp.length) return 0;
  const rr = autoprodottiTutti();
  pp.forEach(x => rr.push({ id: uid().slice(0, 8), prodotto: x.prodotto, data: x.data, qta: x.qta, conforme: 'SI', zona: 'Trincea', num: '', inizio: '', fine: '', origine: x.origine }));
  await salvaAuto(rr); return pp.length;
}

/* ---------------- dai vecchi registri in Excel ---------------- */
/** Legge i registri del caseificio in Excel: dai fogli "Prodotto: …" crea i prodotti (con il silos della prima riga),
 *  dal foglio degli alimenti autoprodotti copia le righe. Non doppia quello che c'è già. */
export async function importaExcel(file) {
  const fogli = await leggiXlsx(await file.arrayBuffer());
  let prodottiNuovi = 0, righeNuove = 0;
  const rr = autoprodottiTutti(); const gia = new Set(rr.map(r => [norm(r.prodotto), r.data, norm(r.zona), norm(r.num)].join('|')));
  for (const c of Object.values(fogli)) {
    const testi = Object.values(c).filter(v => typeof v === 'string');
    if (testi.some(t => /data\s+produzione/i.test(t))) {
      for (let i = 1; i <= 1000; i++) {
        const prod = String(c['B' + i] ?? '').trim(); const data = serialeAData(c['C' + i]);
        if (!prod || !data || /^prodotto$/i.test(prod)) continue;
        const k = [norm(prod), data, norm(c['F' + i]), norm(c['G' + i])].join('|'); if (gia.has(k)) continue; gia.add(k);
        rr.push({ id: uid().slice(0, 8), prodotto: prod, data, qta: N(c['D' + i]), conforme: String(c['E' + i] ?? 'SI').trim() || 'SI', zona: String(c['F' + i] ?? '').trim(), num: String(c['G' + i] ?? '').trim(), inizio: serialeAData(c['H' + i]) || '', fine: serialeAData(c['I' + i]) || '' });
        righeNuove++;
      }
      continue;
    }
    const t = testi.find(x => /^\s*prodotto\s*:/i.test(x)); if (!t) continue;
    const nome = t.replace(/^\s*prodotto\s*:\s*/i, '').trim(); if (!nome || prodotti().some(p => norm(p.nome) === norm(nome))) continue;
    let silos = ''; for (let i = 10; i < 60 && !silos; i++) if (c['H' + i] !== undefined && c['H' + i] !== '') silos = String(c['H' + i]).trim();
    await salvaProdotto({ nome, silos }); prodottiNuovi++;
  }
  if (righeNuove) await salvaAuto(rr);
  return { prodottiNuovi, righeNuove };
}

/* ---------------- stampa (PDF) ed Excel ---------------- */
const RIGHE_MIN = 16;   // righe vuote in fondo per scrivere a mano, come nel registro di carta
const fq = (q, um) => (q || q === 0) && um ? nf(q, um === 'kg' ? 0 : 2) + (um === 'kg' ? '' : ' ' + um) : '';
function intestazione(titolo, prodottoNome, anno) {
  const az = azienda(); const imp = impostazioni();
  return `<table class="int"><tr><td class="t1">Tracciabilità degli alimenti<br><b>${esc(titolo)}</b> ${anno}</td><td>Azienda: <b>${esc(az.nome || '')}</b>${az.iva ? '<br>P.IVA ' + esc(az.iva) : ''}</td><td rowspan="2" class="timbro">Timbro aziendale:</td></tr>
  <tr><td>${esc(imp.programma || '')}</td><td>${prodottoNome ? `Prodotto: <b>${esc(prodottoNome)}</b>` : ''}</td></tr></table>`;
}
export function paginaApprovvigionamenti(p, anno, A) {
  const R = registro(p, anno, A); const vuote = Math.max(0, RIGHE_MIN - R.righe.length);
  const riga = r => `<tr><td class="c">${r.n}</td><td>${esc(r.fornitore)}</td><td>${esc(r.ddt)}</td><td class="c">${dataL(r.data)}</td><td class="n">${fq(r.qta, r.um)}</td><td class="c">${esc(r.conforme)}</td><td class="c">${esc(r.accettato)}</td><td class="c">${esc(r.silos)}</td><td class="c">${dataL(r.inizio)}</td><td class="c">${dataL(r.fine)}</td></tr>`;
  return `<section class="pag">${intestazione('Registro approvvigionamenti', p.nome, anno)}<table class="reg"><thead><tr><th colspan="7">Arrivo del prodotto</th><th>Stoccaggio</th><th colspan="2">Utilizzo</th></tr>
  <tr><th>N.</th><th>Fornitore</th><th>DDT</th><th>Data arrivo</th><th>Quantità (kg)</th><th>Conforme al controllo visivo</th><th>Accettato Sì/No</th><th>Silos / zona di stoccaggio</th><th>Data inizio utilizzo</th><th>Data fine utilizzo</th></tr></thead>
  <tbody>${R.righe.map(riga).join('')}${('<tr class="vuota">' + '<td></td>'.repeat(10) + '</tr>').repeat(vuote)}</tbody></table></section>`;
}
export function paginaAutoprodotti(anno, tutti = false) {
  const rr = autoprodotti(anno, tutti); const vuote = Math.max(0, RIGHE_MIN - rr.length);
  const riga = r => `<tr><td class="c">${r.n}</td><td>${esc(r.prodotto)}</td><td class="c">${dataL(r.data)}</td><td class="n">${r.qta ? nf(r.qta, 0) : ''}</td><td class="c">${esc(r.conforme)}</td><td>${esc(r.zona)}</td><td class="c">${esc(r.num)}</td><td class="c">${dataL(r.inizio)}</td><td class="c">${dataL(r.fine)}</td></tr>`;
  return `<section class="pag">${intestazione('Registro alimenti autoprodotti', '', anno)}<table class="reg"><thead><tr><th colspan="5">Preparazione</th><th colspan="2">Stoccaggio</th><th colspan="2">Utilizzo</th></tr>
  <tr><th>N.</th><th>Prodotto</th><th>Data produzione</th><th>Quantità (quintali)</th><th>Conforme al controllo visivo</th><th>Trincea, silos, zona</th><th>N.</th><th>Data inizio utilizzo</th><th>Data fine utilizzo</th></tr></thead>
  <tbody>${rr.map(riga).join('')}${('<tr class="vuota">' + '<td></td>'.repeat(9) + '</tr>').repeat(vuote)}</tbody></table></section>`;
}
/** Stampa (o salva in PDF dal dialogo di stampa): una pagina A4 orizzontale per foglio. */
export function stampa(titolo, pagine) {
  const html = `<!doctype html><html lang="it"><head><meta charset="utf-8"><title>${esc(titolo)}</title><style>
  @page { size: A4 landscape; margin: 10mm; }
  body { font: 10.5px/1.3 Arial, Helvetica, sans-serif; color: #111; margin: 0; }
  .pag { break-after: page; } .pag:last-child { break-after: auto; }
  table { border-collapse: collapse; width: 100%; }
  .int td { border: 1px solid #333; padding: 5px 8px; vertical-align: top; font-size: 11px; } .int .t1 { width: 38%; } .int .timbro { width: 24%; height: 44px; }
  .int { margin-bottom: 8px; }
  .reg th { border: 1px solid #333; background: #E8EDEA; padding: 4px; font-size: 9.5px; text-align: center; }
  .reg td { border: 1px solid #333; padding: 3px 5px; height: 17px; } .reg td.c { text-align: center; white-space: nowrap; } .reg td.n { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .reg tr { break-inside: avoid; } thead { display: table-header-group; }
  </style></head><body>${pagine.join('')}</body></html>`;
  if (nativa) return stampaHtml(html, titolo);
  let fr = document.getElementById('printFrame'); if (fr) fr.remove();
  fr = document.createElement('iframe'); fr.id = 'printFrame'; fr.setAttribute('aria-hidden', 'true');
  fr.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  document.body.appendChild(fr);
  fr.onload = () => { try { fr.contentWindow.focus(); fr.contentWindow.print(); } catch (e) { scarica(titolo.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.html', new Blob([html], { type: 'text/html' })); } };
  fr.srcdoc = html;
}
/** Registro approvvigionamenti: un prodotto (pid) o tutti quelli con almeno un arrivo nell'anno. */
export function stampaApprovvigionamenti(anno, pid = null) {
  const A = assegna(anno); const ps = pid ? [prodotto(pid)].filter(Boolean) : prodotti().filter(p => registro(p, anno, A).righe.length);
  if (!ps.length) throw new Error('Nessun prodotto con arrivi nel ' + anno + '.');
  stampa(`Registro approvvigionamenti ${anno}`, ps.map(p => paginaApprovvigionamenti(p, anno, A)));
}
export function stampaAutoprodotti(anno, tutti = false) { stampa(`Registro alimenti autoprodotti ${anno}`, [paginaAutoprodotti(anno, tutti)]); }

/** Excel: un foglio per prodotto (come il registro del caseificio) e, se ci sono, il foglio degli autoprodotti. */
export async function excel(anno, { pid = null, auto = true } = {}) {
  const A = assegna(anno); const az = azienda(); const imp = impostazioni();
  const sub = ['Azienda: ' + (az.nome || ''), imp.programma].filter(Boolean).join('  ·  ');
  const ps = pid ? [prodotto(pid)].filter(Boolean) : prodotti();
  const sheets = [];
  for (const p of ps) {
    const R = registro(p, anno, A); if (!R.righe.length && !pid) continue;
    sheets.push({ name: p.nome, title: `Registro approvvigionamenti ${anno} · Prodotto: ${p.nome}`, subtitle: sub,
      cols: [{ h: 'N.', fmt: 'int', w: 5 }, { h: 'Fornitore', w: 28 }, { h: 'DDT', w: 14 }, { h: 'Data arrivo', fmt: 'date', w: 12 }, { h: 'Quantità (kg)', fmt: 'num', w: 13 }, { h: 'Conforme al controllo visivo', w: 12 }, { h: 'Accettato Sì/No', w: 11 }, { h: 'Silos / zona di stoccaggio', w: 14 }, { h: 'Data inizio utilizzo', fmt: 'date', w: 12 }, { h: 'Data fine utilizzo', fmt: 'date', w: 12 }],
      rows: R.righe.map(r => [r.n, r.fornitore, r.ddt, r.data, r.um === 'kg' ? N(r.qta) : fq(r.qta, r.um), r.conforme, r.accettato, r.silos, r.inizio || '', r.fine || '']) });
  }
  if (auto && !pid) {
    const rr = autoprodotti(anno);
    if (rr.length) sheets.push({ name: 'Alimenti autoprodotti', title: `Registro alimenti autoprodotti ${anno}`, subtitle: sub,
      cols: [{ h: 'N.', fmt: 'int', w: 5 }, { h: 'Prodotto', w: 28 }, { h: 'Data produzione', fmt: 'date', w: 12 }, { h: 'Quantità (quintali)', fmt: 'num', w: 13 }, { h: 'Conforme al controllo visivo', w: 12 }, { h: 'Trincea, silos, zona', w: 16 }, { h: 'N.', w: 6 }, { h: 'Data inizio utilizzo', fmt: 'date', w: 12 }, { h: 'Data fine utilizzo', fmt: 'date', w: 12 }],
      rows: rr.map(r => [r.n, r.prodotto, r.data, N(r.qta), r.conforme, r.zona, r.num, r.inizio || '', r.fine || '']) });
  }
  if (!sheets.length) throw new Error('Niente da esportare per il ' + anno + '.');
  scarica(`tracciabilita-${anno}${pid ? '-' + norm(prodotto(pid).nome).toLowerCase().replace(/[^a-z0-9]+/g, '-') : ''}.xlsx`, await scriviXlsx(sheets));
}
