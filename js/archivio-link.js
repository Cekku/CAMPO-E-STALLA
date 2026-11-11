// Collegamenti fra i documenti dell'archivio (catalogo sul PC) e le schede dell'app: fatture, mezzi, campi, capi,
// più le scadenze in agenda prese da un documento. Si salvano nella raccolta riservata "econfig" con id "ar-<impronta>"
// (l'impronta SHA-256 non cambia se il file si sposta o si rinomina): con il cloud li vede solo il titolare.
// Ogni record tiene una copia di nome, data, tipo e controparte, così la scheda collegata si legge anche a ponte spento.
import { S, get } from './state.js';
import { put, remove } from './store.js';
import { esc, fd, today, diff, okD } from './util.js';
import { ic } from './icons.js';
import { contiVisibili } from './views/conti.js';

export const TIPI = {
  fatture: { l: 'Fattura', icn: 'receipt', bott: 'A una fattura' },
  mezzi: { l: 'Mezzo', icn: 'tractor', bott: 'A un mezzo' },
  campi: { l: 'Campo', icn: 'map', bott: 'A un campo' },
  capi: { l: 'Capo', icn: 'cow', bott: 'A un capo' },
};

const PRE = 'ar-';
export const recDi = imp => S.econfig.find(x => x.id === PRE + imp) || null;
const tutti = () => S.econfig.filter(x => String(x.id).startsWith(PRE) && x.impronta);
export const collegatiA = (col, id) => tutti().filter(r => (r.link || []).some(l => l.col === col && l.id === id)).sort((a, b) => String(b.data || '').localeCompare(String(a.data || '')));

/* le scritte del catalogo hanno i trattini al posto degli spazi (come in archivio.js) */
export const leggibile = s => (s ? String(s).replace(/(\d)EUR\b/g, '$1 €').replace(/(?<!\d)-|-(?!\d)/g, ' ').replace(/\s+/g, ' ').trim() : '');
const copia = d => ({ impronta: d.impronta, docId: d.id, nome: d.nome_proposto || d.nome_file || d.nome || '', nomeFile: d.nome_file || '', data: d.data || '', tipo: d.tipo || '', controparte: d.controparte || '', persona: d.persona || '', descrizione: d.descrizione || '', estensione: d.estensione || '', codice: d.codice || '' });

async function salva(imp, r) {
  if (!(r.link || []).length && !(r.scad || []).length) return remove('econfig', PRE + imp);
  return put('econfig', PRE + imp, r);
}
/** collega il documento d (oggetto del ponte) a una scheda dell'app */
export async function collega(d, col, id) {
  const r = Object.assign({}, recDi(d.impronta) || { link: [], scad: [] }, copia(d));
  r.link = (r.link || []).filter(l => !(l.col === col && l.id === id)).concat([{ col, id, quando: today() }]);
  await salva(d.impronta, r);
}
export async function scollega(imp, col, id) {
  const v = recDi(imp); if (!v) return;
  await salva(imp, Object.assign({}, v, { link: (v.link || []).filter(l => !(l.col === col && l.id === id)) }));
}
export async function aggiungiScadenza(d, data, testo) {
  const r = Object.assign({}, recDi(d.impronta) || { link: [], scad: [] }, copia(d));
  r.scad = (r.scad || []).concat([{ data, testo }]).sort((a, b) => a.data.localeCompare(b.data));
  await salva(d.impronta, r);
}
export async function togliScadenza(imp, i) {
  const v = recDi(imp); if (!v) return;
  await salva(imp, Object.assign({}, v, { scad: (v.scad || []).filter((_, k) => k !== i) }));
}

/* ---------- a cosa è collegato: etichetta e azione per aprire la scheda ---------- */
export function bersaglio(col, id) {
  const x = get(col, id); if (!x) return null;
  if (col === 'fatture') return { t: `Fattura n. ${x.numero || '—'}`, s: [x.controparte, fd(x.data), x.totale != null ? (+x.totale).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €' : ''].filter(Boolean).join(' · '), act: `data-act="c-fatt" data-id="${esc(id)}"` };
  if (col === 'mezzi') return { t: x.nome, s: [x.tipo, x.modello, x.targa].filter(Boolean).join(' · '), act: `data-act="open" data-type="mezzo" data-id="${esc(id)}"` };
  if (col === 'campi') return { t: x.nome, s: [x.comune, x.catasto].filter(Boolean).join(' · '), act: `data-act="open" data-type="campo" data-id="${esc(id)}"` };
  if (col === 'capi') return { t: x.numero ? 'N. ' + x.numero + (x.nome ? ' ' + x.nome : '') : x.nome || x.matricola, s: [x.matricola, x.razza].filter(Boolean).join(' · '), act: `data-act="open" data-type="capo" data-id="${esc(id)}"` };
  return null;
}

/* ---------- proposte: quali schede somigliano al documento ---------- */
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const compatto = s => norm(s).replace(/ /g, '');
const VUOTE = new Set(['srl', 'spa', 'snc', 'sas', 'ss', 'soc', 'societa', 'coop', 'cooperativa', 'agricola', 'azienda', 'agr', 'di', 'e', 'del', 'della', 'dei', 'the', 'and', 'srls', 'sc', 'arl', 'scarl', 'ditta', 'esempio']);
const parole = s => new Set(norm(s).split(' ').filter(w => w.length >= 3 && !VUOTE.has(w)));
const importi = s => [...String(s || '').matchAll(/(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?|\d+(?:,\d{1,2})?)EUR/g)].map(m => +m[1].replace(/\./g, '').replace(',', '.'));
const testoDi = d => [d.nome_proposto, d.nome_file, d.controparte, d.descrizione, d.testo && d.testo.inizio].filter(Boolean).join(' ');

function punti(col, x, d, T) {
  if (col === 'fatture') {
    let p = 0;
    const pc = parole(d.controparte), pf = parole(x.controparte);
    const comuni = [...pc].filter(w => pf.has(w)).length; if (comuni) p += 2 + comuni;
    const num = compatto(x.numero);
    if (num.length >= 3 && T.compatto.includes(num)) p += 5;
    if (okD(x.data) && d.data && d.data.length === 10) { const g = Math.abs(diff(x.data, d.data)); if (g <= 3) p += 2; else if (g <= 31) p += 1; }
    const tot = Math.abs(+x.totale || 0); if (tot && T.importi.some(v => Math.abs(v - tot) <= 0.02)) p += 3;
    return p;
  }
  const dentro = s => { const n = norm(s); return n.length >= 4 && (' ' + T.norm + ' ').includes(' ' + n + ' '); };
  if (col === 'mezzi') return (dentro(x.nome) ? 4 : 0) + (dentro(x.modello) ? 3 : 0) + (x.targa && T.compatto.includes(compatto(x.targa)) ? 5 : 0) + (x.serie && compatto(x.serie).length >= 5 && T.compatto.includes(compatto(x.serie)) ? 5 : 0);
  if (col === 'campi') return (dentro(x.nome) ? 4 : 0);
  if (col === 'capi') return (x.matricola && compatto(x.matricola).length >= 8 && T.compatto.includes(compatto(x.matricola)) ? 6 : 0) + (x.nome && dentro(x.nome) ? 1 : 0);
  return 0;
}
const cercabile = (col, x) => col === 'fatture' ? [x.controparte, x.numero, x.data, x.tipo].join(' ') : col === 'mezzi' ? [x.nome, x.tipo, x.modello, x.targa].join(' ') : col === 'campi' ? [x.nome, x.comune, x.catasto, x.gruppo].join(' ') : [x.numero, x.nome, x.matricola, x.razza].join(' ');

/** schede da proporre per il documento d: con q le cerca per parole, altrimenti le più simili (e, se poche, le altre) */
export function scelte(col, d, q, max = 12) {
  const giaQui = new Set(((recDi(d.impronta) || {}).link || []).filter(l => l.col === col).map(l => l.id));
  const testo = testoDi(d);
  const T = { norm: norm(testo), compatto: compatto(testo), importi: importi(d.nome_proposto) };
  let L = (S[col] || []).filter(x => !giaQui.has(x.id) && !(col === 'capi' && x.uscita));
  const qq = norm(q).split(' ').filter(Boolean);
  if (qq.length) L = L.filter(x => { const s = norm(cercabile(col, x)); return qq.every(w => s.includes(w)); });
  const conPunti = L.map(x => ({ x, p: punti(col, x, d, T) }));
  conPunti.sort((a, b) => b.p - a.p || String(b.x.data || '').localeCompare(String(a.x.data || '')) || String(a.x.nome || '').localeCompare(String(b.x.nome || '')));
  // senza ricerca e con una lista lunga (fatture, capi) si mostrano solo quelle che somigliano
  const lunghe = !qq.length && (col === 'fatture' || col === 'capi');
  return conPunti.filter(c => !lunghe || c.p >= 3).slice(0, max).map(c => ({ id: c.x.id, p: c.p, ...bersaglio(col, c.x.id) }));
}

/* ---------- riquadro "Documenti dell'archivio" nelle schede dell'app ---------- */
const dataTxt = d => (d && d.length === 10 ? fd(d) : d && d.length === 7 ? d.slice(5) + '/' + d.slice(0, 4) : d || '');
export function docRiga(r, col, id) {
  const tit = leggibile(r.controparte || r.persona) || r.nomeFile || 'Documento';
  const sot = [dataTxt(r.data), leggibile(r.tipo), leggibile(r.descrizione)].filter(Boolean).join(' · ');
  const go = esc(JSON.stringify({ ar: r.impronta, c: r.codice || '' }));
  return `<div class="row ar-lk"><span class="r-icon">${ic('file-text')}</span><button class="r-main linkrow" data-act="go" data-go='${go}' title="Apri la scheda nell'archivio"><b>${esc(tit)}</b><span>${esc(sot || r.nome)}</span></button><span class="r-side btns"><button class="btn sm" data-act="ar-open" data-id="${esc(r.impronta)}" title="Apri il file sul PC">${ic('external-link')}Apri</button><button class="iconbtn sm" data-act="ar-scollega" data-imp="${esc(r.impronta)}" data-col="${col}" data-tid="${esc(id)}" aria-label="Togli il collegamento">${ic('x')}</button></span></div>`;
}
/** riquadro con i documenti collegati a una scheda (solo per il titolare); vuoto = pulsante per cercarli */
export function docsCard(col, id, { foglio = false } = {}) {
  if (!contiVisibili()) return '';
  const L = collegatiA(col, id);
  const cerca = `<button class="btn sm ghost" data-act="ar-cercaPer" data-col="${col}" data-tid="${esc(id)}">${ic('search')}Cerca nell'archivio</button>`;
  const corpo = L.length ? `<div class="list${foglio ? ' flat' : ''}">${L.map(r => docRiga(r, col, id)).join('')}</div>` : `<div class="empty slim">Nessun documento collegato. Cercalo nell'archivio del PC e collegalo: lo trovi qui con un clic.</div>`;
  if (foglio) return `<h3 class="sheet-h">${ic('book-open')}Documenti dell'archivio <span class="sp"></span>${cerca}</h3>${corpo}`;
  return `<section class="card ar-docs"><div class="card-h"><h2>${ic('book-open')}Documenti dell'archivio</h2><span class="count">${L.length || ''}</span>${cerca}</div>${corpo}</section>`;
}

/** testo da cercare nell'archivio per trovare i documenti di una scheda */
export function ricercaPer(col, id) {
  const x = get(col, id); if (!x) return '';
  if (col === 'fatture') return String(x.numero || x.controparte || '');
  if (col === 'mezzi') return x.targa || x.nome || '';
  if (col === 'campi') return x.nome || '';
  if (col === 'capi') return x.matricola || x.nome || '';
  return '';
}

/* ---------- agenda: scadenze prese dai documenti ---------- */
export function vociAgenda(T, fine) {
  if (!contiVisibili()) return [];
  const out = [];
  tutti().forEach(r => (r.scad || []).forEach(s => {
    if (!okD(s.data) || s.data < T || s.data > fine) return;
    out.push({ data: s.data, area: 'archivio', icn: 'calendar', t: s.testo || 'Scadenza del documento', s: [leggibile(r.controparte), leggibile(r.tipo), dataTxt(r.data)].filter(Boolean).join(' · ') || r.nome, go: { ar: r.impronta, c: r.codice || '' }, late: false });
  }));
  return out;
}
