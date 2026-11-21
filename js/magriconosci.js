// Riconoscimento delle righe delle fatture d'acquisto per il magazzino (1.66.0): logica pura, senza archivio né pagina.
// La usa js/magfatture.js; provata in Node con fatture finte (strumenti/prove-magazzino/prove.mjs).
// Regola: una riga entra da sola solo con prodotto CERTO e quantità SICURA; tutto il resto diventa un dubbio con la proposta.
// Prodotto certo = codice articolo del fornitore già imparato, oppure P.IVA del fornitore + descrizione già imparata,
// oppure numero di registrazione del fitofarmaco uguale a quello di un prodotto, oppure parole imparate (una sola
// vincitrice, categoria della riga compatibile). Sul prodotto: codiciFatt ['Fimpronta|CODICE'], descrFatt ['Fimpronta|DESCRIZIONE'] (impronta del fornitore, non la P.IVA),
// paroleFatt 'parole, altre parole', convFatt { 'unità fattura>unità prodotto': fattore }.
import { N, okD } from './util.js';
import { umNorm, convertiQ } from './conti/preventivi.js';

export const NOTE = new Set(['TD04', 'TD08']);
const DA_CLASS = 'Da classificare';
/** Categorie del magazzino caricabili dalle fatture (le stesse di CATEGORIE in domain.js, senza Effluente). */
export const CAT_MAG = ['Fitofarmaco', 'Diserbante', 'Concime', 'Seme', 'Mangime', 'Integratore', 'Foraggio', 'Farmaco veterinario', 'Igiene e mungitura', 'Gasolio', 'Lubrificante', 'AdBlue', 'Ricambio', 'Materiale di consumo', 'Altro'];
const FITO_CAT = ['Fitofarmaco', 'Diserbante'];
/** Categoria dei Conti → categoria del magazzino per un prodotto nuovo, e categorie dei prodotti che possono combaciare. */
export const FAMIGLIE = {
  'Sementi': { cat: 'Seme', ok: ['Seme'] },
  'Concimi': { cat: 'Concime', ok: ['Concime'] },
  'Fitofarmaci': { cat: 'Fitofarmaco', ok: FITO_CAT },
  'Carburanti e lubrificanti': { cat: 'Gasolio', ok: ['Gasolio', 'Lubrificante', 'AdBlue'] },
  'Mangimi e materie prime': { cat: 'Mangime', ok: ['Mangime', 'Foraggio', 'Integratore'] },
  'Integratori e additivi': { cat: 'Integratore', ok: ['Integratore', 'Mangime'] },
  'Farmaci e prodotti veterinari': { cat: 'Farmaco veterinario', ok: ['Farmaco veterinario', 'Igiene e mungitura'] },
  'Igiene e mungitura': { cat: 'Igiene e mungitura', ok: ['Igiene e mungitura', 'Farmaco veterinario'] },
  'Ricambi e manutenzione': { cat: 'Ricambio', ok: ['Ricambio', 'Lubrificante', 'Materiale di consumo'] },
  'Teli, film e reti': { cat: 'Materiale di consumo', ok: ['Materiale di consumo'] },
};
/** Parole che spostano la categoria del prodotto nuovo dentro la stessa famiglia dei Conti. */
const PAROLE_CAT = [
  [/\bAD ?BLUE\b|\bUREA (TECNICA|AUTOTRAZ)/, 'AdBlue', ['Carburanti e lubrificanti']],
  // "filtro olio", "tubo idraulico", "pompa olio" sono ricambi, non lubrificanti
  [/^(?!.*\b(FILTR\w*|TUB[OI]|POMPA|GUARNIZ\w*|TAPP[OI]|ASTINA|RACCORD\w*|CILINDR\w*|VALVOL\w*|PARAOLIO|SENSORE)\b).*(\bOLIO\b|LUBRIF|\bGRASSO\b|\bATF\b|IDRAULIC)/, 'Lubrificante', ['Carburanti e lubrificanti', 'Ricambi e manutenzione']],
  [/\bFIENO\b|\bPAGLIA\b|\bMEDICA\b|\bINSILATO\b|\bFASCIAT|\bLOIESSA\b|\bPOLIFITA\b|\bLOIETTO\b/, 'Foraggio', ['Mangimi e materie prime']],
  [/DISERB|ERBICID|GLIFOS/, 'Diserbante', ['Fitofarmaci']],
  [/\bSPAGO\b|\bRETE\b|\bTELO\b|\bFILM\b/, 'Materiale di consumo', ['Ricambi e manutenzione']],
];
/** Righe di servizio (trasporto, contributi, manodopera…): fuori dal magazzino, come prima. */
export const SERVIZIO = /\b(TRASPORT|CONTRIBUT|NOLO|NOLEGG|SPESE|SPESA|CAUZION|IMBALL|CONAI|SPEDIZ|CONSEGNA|INCASSO|BOLLO|ACCONTO|MANODOPERA|MANO D|INTERVENTO|DIRITTO)/;
/** Sconti e abbuoni: correggono il prezzo, non la quantità. */
export const SCONTO = /\b(SCONT|ABBUON|OMAGGI|PREMIO|BONUS|DIFF(ERENZA)?\.? ?(DI )?PREZZ|STORNO PREZZ|RIDUZIONE PREZZ|ADEGUAMENTO PREZZ)/;
const RESO = /\bRES[OI]\b|\bRESTITUZ/;

export const norm = s => String(s || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const parole = s => norm(s).split(/[^A-Z0-9%]+/).filter(Boolean);
const VUOTE = new Set(['DI', 'DA', 'DEL', 'DELLA', 'DELLO', 'DEI', 'DEGLI', 'E', 'ED', 'IN', 'PER', 'CON', 'AL', 'ALLA', 'IL', 'LA', 'LO', 'X']);
const r3 = x => Math.round(x * 1000) / 1000;
const r2 = x => Math.round(x * 100) / 100;
const pivaN = s => String(s || '').replace(/\D/g, '');
/** Fornitore: P.IVA (solo cifre) o, senza, il nome. */
export const fornDi = f => pivaN(f && f.piva) || (f && f.controparte ? 'N:' + parole(f.controparte).join(' ') : '');
/** Impronta del fornitore per le chiavi salvate sul prodotto (codiciFatt, descrFatt): la raccolta prodotti la vedono
 *  anche i collaboratori, e dalla P.IVA si risale al fornitore (nascosto dalla 1.59.1). FNV-1a a 32 bit, 'F' + 8 cifre esadecimali. */
export const fornK = r => { const s = fornDi(r); if (!s) return ''; let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return 'F' + h.toString(16).padStart(8, '0'); };
const numN = s => norm(s).replace(/[^A-Z0-9]/g, '').replace(/^0+(?=.)/, '');
const regN = s => { const d = String(s || '').replace(/\D/g, ''); return d ? d.replace(/^0+/, '') || '0' : ''; };
const fidDi = k => String(k).slice(0, String(k).lastIndexOf(':'));
const addD = (d, n) => { const t = new Date(d + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };

/* ---------------- descrizione ---------------- */
/** Descrizione senza lotto, scadenza, date e riferimenti del DDT: è la stessa a ogni fattura dello stesso prodotto. */
export function descrChiave(d) {
  const t = (' ' + norm(d) + ' ')
    .replace(/\b(RIF\.?|RIFERIMENTO)?\s*\b(DDT|D\.D\.T\.?|BOLLA|DOC\.? DI TRASPORTO)\b.*$/, ' ')
    .replace(/\b(LOTTO|LOTT|LOT|PARTITA)\b\.?\s*(N\.?|NR\.?|NUM\.?|N°)?\s*[:.]?\s*[A-Z0-9/-]+/g, ' ')
    .replace(/\bSCAD(ENZA|\.)?\s*[:.]?\s*[0-9/.-]+/g, ' ')
    .replace(/\b\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}\b/g, ' ');
  // decimali tenuti ("2.0 LT"), punti e virgole fuori dai numeri tolti
  return t.replace(/[^A-Z0-9%.,]+/g, ' ').replace(/(^|[^\d])[.,]+|[.,]+(?=[^\d]|$)/g, '$1 ').split(/\s+/).filter(Boolean).join(' ');
}
const UNIT_W = new Set(['SACCHI', 'SACCO', 'SAC', 'SC', 'BIG', 'BAG', 'BIGBAG', 'SFUSO', 'SFUSA', 'SFUSI', 'KG', 'KGS', 'LT', 'L', 'LITRI', 'LITRO', 'ML', 'GR', 'G', 'CONF', 'CONFEZIONE', 'CF', 'BANCALE', 'PALLET', 'DOSE', 'DOSI', 'TANICA', 'TANICHE', 'FUSTO', 'FUSTI', 'CISTERNA', 'Q', 'QLI', 'QUINTALI', 'NR', 'PZ', 'FLACONE', 'SECCHIO', 'BIDONE']);
/** Parole da ricordare: senza numeri puri, pesi ("25KG") e confezioni; i codici con lettere e cifre (P1234, 15W40) restano. */
export const paroleDa = desc => parole(descrChiave(desc)).filter(w => !VUOTE.has(w) && !UNIT_W.has(w) && !/^\d+([.,]\d+)?$/.test(w) && !/^\d+([.,]\d+)?(KG|LT|L|G|GR|ML)$/.test(w)).slice(0, 4).join(' ');
/** Nome proposto per un prodotto nuovo: descrizione senza lotto, confezione e quantità. */
export function nomeDa(desc) {
  const t = descrChiave(desc).replace(/\b\d+([.,]\d+)?\s*(X\s*\d+([.,]\d+)?\s*)?(KG|KGS|LT|L|LITRI|LITRO|ML|GR|G)\b/g, ' ').replace(/\b(KG|LT)\s*\d+([.,]\d+)?\b/g, ' ');
  return parole(t).filter(w => !UNIT_W.has(w)).join(' ').slice(0, 50).trim();
}
/** Punteggio delle parole: 0 = non combacia, altrimenti quante parole (vince il più preciso). Alternative separate dalla virgola. */
export function punteggio(testo, desc) { return migliore(testo, desc).s; }
/** Come punteggio, con il gruppo di parole che ha vinto ({ s, a }). */
function migliore(testo, desc) {
  const ws = parole(desc).flatMap(w => w.includes('%') ? [w, w.replace(/%/g, '')] : [w]); let best = 0, alt = [];   // "46%" vale anche "46"
  for (const a of String(testo || '').split(/[,;]/).map(x => parole(x)).filter(x => x.length)) {
    if (a.length > best && a.every(x => ws.some(w => (x.length >= 3 && !/^\d+$/.test(x)) ? w.startsWith(x) : w === x))) { best = a.length; alt = a; }
  }
  return { s: best, a: alt };
}
/** Numero di registrazione del Ministero scritto nella descrizione ("REG. N. 12345", "N.REG 12345"), senza zeri davanti. */
export function nRegDa(desc) {
  const m = norm(desc).match(/\b(?:N\.?\s*)?REG(?:ISTRAZIONE|\.)?\s*(?:MIN(?:ISTERIALE|\.)?\s*)?(?:N\.?|NR\.?|N°|NUM\.?)?\s*[:.]?\s*(\d{3,6})\b/);
  return m ? regN(m[1]) : '';
}
/** Parole che da sole non dicono quale prodotto è ("CONCIME GRANULARE", "MAIS", "RICAMBI"). */
const GENERICHE = new Set(['CONCIME', 'CONCIMI', 'GRANULARE', 'GRANULATO', 'LIQUIDO', 'POLVERE', 'MAIS', 'SEME', 'SEMI', 'SEMENTE', 'SEMENTI', 'MANGIME', 'MANGIMI', 'FARINA', 'NUCLEO', 'INTEGRATORE', 'OLIO', 'RICAMBI', 'RICAMBIO', 'VARIE', 'VARIO', 'VARI', 'VARIA', 'DIVERSI', 'DIVERSE', 'MATERIALE', 'MATERIALI', 'PRODOTTO', 'PRODOTTI', 'ARTICOLO', 'ARTICOLI', 'MERCE', 'FORNITURA', 'ACQUISTO', 'KIT', 'PEZZI', 'PEZZO', 'GENERICO', 'MINUTERIA', 'ACCESSORI', 'AGRICOLO', 'AGRICOLA', 'FITOFARMACO', 'DISERBANTE', 'FARMACO', 'DETERGENTE', 'FILTRO', 'TIPO', 'NUOVO', 'SPECIALE', 'EXTRA', 'NORMALE', 'VACCHE', 'BOVINI']);
/** Quanto è specifico un gruppo di parole: parole non generiche di 3+ lettere e numeri di 2+ cifre valgono 1, i codici con lettere e cifre 2.
 *  Servono almeno 2 punti perché le parole imparate (o la descrizione) riconoscano un prodotto con certezza. */
export function specifiche(ws) {
  let n = 0;
  for (const w of ws) {
    if (/\d/.test(w) && /[A-Z]/.test(w) && !/^\d+([.,]\d+)?(KG|KGS|LT|L|G|GR|ML)$/.test(w)) n += 2;
    else if (/\d/.test(w) && w.replace(/\D/g, '').length >= 2) n += 1;
    else if (/^[A-Z]{3,}$/.test(w) && !GENERICHE.has(w) && !VUOTE.has(w) && !UNIT_W.has(w)) n += 1;
  }
  return n;
}
/** Parole "contenitore" che non dicono mai quale articolo è, nemmeno dallo stesso fornitore. */
const CONTENITORE = new Set(['VARIE', 'VARIO', 'VARI', 'VARIA', 'DIVERSI', 'DIVERSE', 'RICAMBI', 'RICAMBIO', 'MATERIALE', 'MATERIALI', 'MERCE', 'ARTICOLO', 'ARTICOLI', 'PRODOTTO', 'PRODOTTI', 'MINUTERIA', 'ACCESSORI', 'FORNITURA', 'ACQUISTO', 'KIT', 'PEZZI', 'PEZZO', 'GENERICO', 'GENERICI', 'COME', 'DA', 'VS', 'ORDINE', 'NS']);
const vera = w => (/\d/.test(w) && w.replace(/\D/g, '').length >= 2) || (/^[A-Z]{3,}$/.test(w) && !CONTENITORE.has(w) && !VUOTE.has(w) && !UNIT_W.has(w));
/** Chiavi imparate: codice articolo e descrizione, sempre legate al fornitore. Codici di 1-2 caratteri (numeri di riga) e codici
 *  "contenitore" ("VARIE", "RICAMBI", "ART…") non valgono; la descrizione solo se ha almeno una parola che non sia un contenitore. */
export const codChiave = r => { const c = norm(r.codice).replace(/\s+/g, ''); const f = fornK(r); return f && c.length >= 3 && !/^0+$/.test(c) && (/\d/.test(c) || (c.length >= 4 && !CONTENITORE.has(c) && !/^(ART|COD|SERV|SPESE|DIV)/.test(c))) ? f + '|' + c : ''; };
// descrizione da imparare: almeno una parola non generica, oppure due parole vere ("FARINA DI MAIS" sì, "CONCIME" o "RICAMBI VARI" no)
export const descrK = r => { const d = descrChiave(r.descrizione); const f = fornK(r); const ws = d.split(' '); return f && d.length >= 3 && (specifiche(ws) >= 1 || ws.filter(vera).length >= 2) ? f + '|' + d : ''; };

/* ---------------- quantità ---------------- */
const numIt = s => { s = String(s); if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, ''); return parseFloat(s.replace(',', '.')); };
const UN = { KG: ['peso', 1], KGS: ['peso', 1], G: ['peso', 0.001], GR: ['peso', 0.001], L: ['vol', 1], LT: ['vol', 1], LITRI: ['vol', 1], LITRO: ['vol', 1], ML: ['vol', 0.001] };
/** Peso o volume della confezione scritto nella descrizione ("SACCO 25 KG", "CONF. 4X5 LT", "KG 10").
 *  { fam: 'peso'|'vol', v (kg o litri), unica } — unica = una sola misura diversa trovata (altrimenti non è sicura). */
export function confezione(desc) {
  const t = ' ' + descrChiave(desc) + ' '; const trov = [];
  for (const m of t.matchAll(/(?<![\d.,])(\d+(?:[.,]\d+)?)\s*(?:X\s*(\d+(?:[.,]\d+)?)\s*)?(KGS|KG|GR|G|ML|LT|LITRI|LITRO|L)\b/g)) {
    const u = UN[m[3]]; const v = numIt(m[1]) * (m[2] ? numIt(m[2]) : 1) * u[1]; if (v > 0) trov.push([u[0], r3(v)]);
    if (/^\s*X\s*\d/.test(t.slice(m.index + m[0].length))) trov.push(['?', 0]);   // "1 LT X 20": 20 bottiglie da 1 l o 1 l? non si sa
  }
  for (const m of t.matchAll(/\b(KG|LT)\s+(\d+(?:[.,]\d+)?)\b(?!\s*(?:X|%|KG|LT|L)\b)/g)) { const u = UN[m[1]]; const v = numIt(m[2]); if (v > 0) trov.push([u[0], r3(v)]); }
  if (!trov.length) return null;
  const div = new Set(trov.map(x => x.join(':')));
  return { fam: trov[0][0], v: trov[0][1], unica: div.size === 1 };
}
/** Unità della fattura che contano pezzi o confezioni (si moltiplicano per la confezione della descrizione). */
const CONTA = new Set(['pz', 'sacco', 'conf', 'tanica', 'taniche', 'fusto', 'fusti', 'bidone', 'flacone', 'fl', 'tan', 'secchio', 'bottiglia', 'bt']);
const umProd = u => u === 'm³' ? 'm3' : umNorm(u);
const FAM_U = { kg: 'peso', q: 'peso', t: 'peso', g: 'peso', l: 'vol', hl: 'vol', m3: 'vol', pz: 'pz', dose: 'dose' };
/** Unità del prodotto nuovo dall'unità della fattura. */
export const unitaPer = um => ({ kg: 'kg', g: 'kg', q: 'q', t: 't', l: 'l', hl: 'l', m3: 'm³', pz: 'pz', dose: 'dosi', sacco: 'pz', conf: 'pz', balla: 'pz', rotolo: 'pz', bancale: 'pz' })[umNorm(um)] || 'kg';
export const chiaveConv = (r, p) => (umNorm(r.um) || '-') + '>' + (p.unita || '');
/** Quantità della riga nell'unità del prodotto: { q, certa, come }. q = null se non si sa. */
export function qta(r, p) {
  const um = umNorm(r.um); const q0 = Math.abs(N(r.quantita)); const pu = umProd(p.unita || 'kg');
  if (!(q0 > 0)) return { q: null, certa: false, come: '' };
  const c = confezione(r.descrizione);
  const f = p.convFatt && N(p.convFatt[chiaveConv(r, p)]);
  if (f > 0) {
    // fattore imparato per i sacchi o le confezioni: se la descrizione dice un'altra confezione, non è più sicuro
    if (CONTA.has(um) && c && c.unica && c.fam === FAM_U[pu]) { const v = convertiQ(c.v, c.fam === 'peso' ? 'kg' : 'l', pu); if (v !== null && Math.abs(v - f) > 0.001 * f) return { q: r3(q0 * v), certa: false, come: 'confezione diversa' }; }
    return { q: r3(q0 * f), certa: true, come: 'imparata' };
  }
  if (um && FAM_U[um] && FAM_U[um] === FAM_U[pu]) { const v = convertiQ(q0, um, pu); if (v !== null) return { q: r3(v), certa: true, come: 'unità' }; }
  if (um === 'dose' && pu === 'dose') return { q: r3(q0), certa: true, come: 'unità' };
  if (c && c.fam === FAM_U[pu] && (CONTA.has(um) || !um)) {
    const v = convertiQ(q0 * c.v, c.fam === 'peso' ? 'kg' : 'l', pu);
    if (v !== null) return { q: r3(v), certa: c.unica && CONTA.has(um), come: 'confezione' };
  }
  if ((CONTA.has(um) || !um) && (FAM_U[pu] === 'pz' || FAM_U[pu] === 'dose')) return { q: r3(q0), certa: false, come: 'pezzi' };
  if (!um) return { q: r3(q0), certa: false, come: 'senza unità' };
  return { q: null, certa: false, come: '' };
}

/* ---------------- importi e prezzi ---------------- */
/** Sconto di riga "-10%", "10%", "10+5%" (a cascata), "+5%" (maggiorazione) → frazione; senza % non si usa. */
export function scontoPerc(s) {
  const t = String(s || '').replace(/\s/g, ''); if (!t.includes('%')) return 0;
  const neg = /^\+/.test(t); let resta = 1;
  for (const x of t.replace(/^[+-]/, '').replace(/%/g, '').split('+')) { const v = parseFloat(x.replace(',', '.')); if (v > 0 && v < 100) resta *= 1 - v / 100; }
  return neg ? -(1 - resta) : 1 - resta;
}
/** Importo della riga senza IVA al netto dello sconto di riga (se l'importo letto è ancora prezzo × quantità). */
export function importoNetto(r) {
  const imp = N(r.importo), q = Math.abs(N(r.quantita)), pr = Math.abs(N(r.prezzo)), sc = scontoPerc(r.sconto);
  if (sc && pr > 0 && q > 0 && Math.abs(Math.abs(imp) - pr * q) <= Math.max(0.02, pr * q * 0.001)) return r2((imp < 0 ? -1 : 1) * pr * q * (1 - sc));
  if (!imp && pr > 0 && q > 0) return r2(pr * q * (1 - sc));
  return imp;
}
/** Sconti e abbuoni scritti come righe negative della fattura: frazione (≤ 0) da spalmare sulle righe di merce. */
export function quotaSconti(f) {
  if (!f || NOTE.has(f.tipoDoc)) return 0;
  let neg = 0, merce = 0;
  for (const r of f.righe || []) { const imp = importoNetto(r); const d = norm(r.descrizione); if (imp < 0 && SCONTO.test(d)) neg += imp; else if (imp > 0 && !SERVIZIO.test(d)) merce += imp; }
  return merce > 0 && neg < 0 ? Math.max(-1, neg / merce) : 0;
}
/** Prezzi dei carichi: Map id movimento → prezzo unitario (importo netto, sconti della fattura, note di credito di prezzo collegate)
 *  e Map prodotto → { pu, data } dell'ultimo carico (a mano o da fattura). */
export function prezzi({ fatture, movimenti, fatti = {} }) {
  const fat = new Map(fatture.map(f => [f.id, f])); const quota = new Map(); const corr = new Map();
  const riga = k => { const f = fat.get(fidDi(k)); return f ? [f, (f.righe || [])[+String(k).slice(String(k).lastIndexOf(':') + 1)]] : [null, null]; };
  for (const [k, v] of Object.entries(fatti)) if (typeof v === 'string' && v.startsWith('r>')) { const [, r] = riga(k); if (r) corr.set(v.slice(2), (corr.get(v.slice(2)) || 0) - Math.abs(importoNetto(r))); }   // una nota toglie sempre, anche scritta positiva
  const carico = new Map(), ultimo = new Map();
  for (const m of movimenti) {
    if (m.tipo !== 'Carico' || !m.prodottoId || !(N(m.quantita) > 0) || m.autoprodotto) continue;
    let pu = 0;
    if (m.fattRiga) {
      const k = String(m.fattRiga); const [f, r] = riga(k);
      if (r) { if (!quota.has(f.id)) quota.set(f.id, quotaSconti(f)); const imp = importoNetto(r); pu = (imp * (1 + quota.get(f.id)) + (corr.get(k) || 0)) / N(m.quantita); }
    } else pu = N(m.prezzo);
    if (!(pu > 0)) continue;
    carico.set(m.id, pu);
    const d = m.data || ''; const u = ultimo.get(m.prodottoId);
    if (!u || d >= u.data) ultimo.set(m.prodottoId, { pu, data: d });
  }
  return { carico, ultimo };
}

/* ---------------- copie della stessa fattura ---------------- */
/** XML e PDF di cortesia della stessa fattura salvati come due fatture: Map id della copia → id di quella tenuta.
 *  Si tiene quella che ha già righe caricate, poi l'XML, poi la prima. */
export function copieDoppie(fatture, fatti = {}) {
  const gr = new Map(); const conFatti = new Set(Object.keys(fatti).map(fidDi));
  for (const f of fatture) {
    if (f.tipo !== 'Acquisto' || !numN(f.numero) || !okD(f.data) || !fornDi(f)) continue;
    const k = fornDi(f) + '|' + numN(f.numero) + '|' + f.data + '|' + (NOTE.has(f.tipoDoc) ? 'nc' : 'f');
    if (!gr.has(k)) gr.set(k, []); gr.get(k).push(f);
  }
  const fuori = new Map();
  for (const fs of gr.values()) if (fs.length > 1) {
    const t = fs.find(f => conFatti.has(f.id)) || fs.find(f => f.fonte === 'xml') || [...fs].sort((a, b) => (a.id < b.id ? -1 : 1))[0];
    for (const f of fs) if (f !== t) fuori.set(f.id, t.id);
  }
  return fuori;
}

/* ---------------- riconoscimento del prodotto ---------------- */
function riconosci(r, ps, fam, fito) {
  const out = { p: null, come: '', certo: false, cand: [], fito: null, nreg: '' };
  const ck = codChiave(r), dk = descrK(r), nr = nRegDa(r.descrizione);
  out.nreg = nr; out.fito = nr && fito ? fito(nr) : null;
  const perCod = ck ? ps.filter(p => (p.codiciFatt || []).includes(ck)) : [];
  const perDes = dk ? ps.filter(p => (p.descrFatt || []).includes(dk)) : [];
  const perReg = nr ? ps.filter(p => FITO_CAT.includes(p.categoria) && regN(p.nReg) === nr) : [];
  const okCat = p => !fam || fam.ok.includes(p.categoria) || p.categoria === 'Altro';
  const sc = []; for (const p of ps) { if (!p.paroleFatt || !okCat(p)) continue; const m = migliore(p.paroleFatt, r.descrizione); if (m.s > 0) sc.push([m.s, p, m.a]); }
  sc.sort((a, b) => b[0] - a[0]); const best = sc.length ? sc[0][0] : 0; const tops = sc.filter(z => z[0] === best).map(z => z[1]);
  // codice e descrizione imparati vincono sul numero di registrazione (due confezioni dello stesso fitofarmaco hanno lo stesso numero)
  const forti = new Map(); for (const [come, l] of [['codice', perCod], ['descrizione', perDes]]) for (const p of l) if (!forti.has(p.id)) forti.set(p.id, [p, come]);
  if (!forti.size) for (const p of perReg) forti.set(p.id, [p, 'registrazione']);
  if (forti.size > 1) { out.come = 'conflitto'; out.cand = [...forti.values()].map(z => z[0]); return out; }
  if (forti.size === 1) {
    const [p, come] = [...forti.values()][0];
    // un numero messo dall'abbinamento dal nome (nRegAuto) non basta: lo conferma Marco la prima volta
    Object.assign(out, { p, come, certo: !(come === 'registrazione' && p.nRegAuto && regN(p.nRegAuto) === regN(p.nReg)) });
    out.cand = sc.map(z => z[1]).filter(q => q !== p).slice(0, 3); return out;
  }
  if (tops.length === 1) { const gen = specifiche(sc[0][2]) < 2; Object.assign(out, { p: tops[0], come: 'parole', certo: !!fam && !gen, generiche: gen }); out.cand = sc.slice(1).map(z => z[1]).slice(0, 3); return out; }
  if (tops.length > 1) { out.come = 'pari'; out.cand = tops.slice(0, 4); return out; }
  // solo per proporre: il nome del prodotto dentro la descrizione
  const nm = []; for (const p of ps) { if (!okCat(p)) continue; const s = punteggio(parole(p.nome).filter(w => !VUOTE.has(w) && !UNIT_W.has(w)).join(' '), r.descrizione); if (s > 0) nm.push([s, p]); }
  nm.sort((a, b) => b[0] - a[0]); if (nm.length) { out.come = 'nome'; out.cand = nm.filter(z => z[0] === nm[0][0]).map(z => z[1]).concat(nm.filter(z => z[0] < nm[0][0]).map(z => z[1])).slice(0, 4); }
  return out;
}
/** Categoria del magazzino per un prodotto nuovo dalla riga (null se la riga non ha una categoria del magazzino). */
export function categoriaPer(r) {
  const fam = FAMIGLIE[r.categoria]; if (!fam) return null;
  const d = norm(r.descrizione);
  for (const [re, cat, fams] of PAROLE_CAT) if (fams.includes(r.categoria) && re.test(d)) return cat;
  return fam.cat;
}

/* ---------------- classificazione ---------------- */
const FMT = v => (Math.round(v * 100) / 100).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/**
 * Divide le righe d'acquisto dal giorno `da` in: fatte (già caricate), tolte ("non caricare"), doppie (copia della stessa fattura),
 * pronte (sicure: si caricano da sole) e daFare (dubbi con la proposta).
 * Ogni voce: { r, k, data, ddt, tipo: 'carico'|'reso'|'prezzo', prodotto (sicuro), q, proposto, qProp, motivo, come,
 *              alt: [{ p, q }], nuovo: { nome, categoria, unita, q, nReg? } | null, origine, origini: [k] }.
 */
export function classifica({ righe, fatture, prodotti, movimenti = [], fatti = {}, da = '0000-00-00', fito = null, dataDi = r => ({ data: r.data, num: '' }) }) {
  const out = { da, fatte: [], tolte: [], doppie: [], pronte: [], daFare: [] };
  const doppie = copieDoppie(fatture, fatti);
  const ps = prodotti.filter(p => CAT_MAG.includes(p.categoria));
  const pid = new Map(prodotti.map(p => [p.id, p]));
  const fat = new Map(fatture.map(f => [f.id, f]));
  const PZ = prezzi({ fatture, movimenti, fatti });
  const daFattura = movimenti.filter(m => m.fattRiga && m.prodottoId);
  const conMov = new Map(daFattura.map(m => [String(m.fattRiga), m.id]));
  const giaPrese = new Map();   // righe pronte in questo giro: contano per i resi e i carichi uguali
  const puGiro = new Map();     // prezzo unitario dei carichi pronti in questo giro (controllo del prezzo fra fatture dello stesso giro)
  for (const r of righe) {
    if (r.tipo !== 'Acquisto' || r.rett || !(r.i >= 0)) continue;
    const a = dataDi(r); if (!okD(a.data) || a.data < da) continue;
    const d = norm(r.descrizione); const servizio = SERVIZIO.test(d);
    const f = fat.get(r.fid) || {}; const nota = NOTE.has(r.tipoDoc);
    const imp = importoNetto(r); const q0 = Math.abs(N(r.quantita));
    let tipo;
    if (nota || imp < 0) {
      if (!(Math.abs(imp) > 0)) continue;
      tipo = q0 > 0 && !SCONTO.test(d) ? 'reso' : 'prezzo';
      if (!nota && tipo === 'prezzo') continue;   // sconto scritto nella fattura: entra nel prezzo da solo (quotaSconti)
    } else { if (!(q0 > 0) || !(imp > 0)) continue; tipo = 'carico'; }
    const fam = FAMIGLIE[r.categoria];
    const ric = riconosci(r, ps, fam, fito);
    const forte = ['codice', 'descrizione'].includes(ric.come);
    // parole di servizio (trasporto, consegna…): fuori, salvo merce vera (peso, litri, confezione o prodotto riconosciuto) che diventa un dubbio
    // ("TRASPORTO" a quintale resta fuori: tolte le parole di servizio non resta niente)
    const resto = servizio ? parole(descrChiave(r.descrizione)).filter(w => !SERVIZIO.test(w) && vera(w) && !/^(INCLUS|COMPRES|QUINTAL|AZIENDA|FRANCO|DOMICILIO|PORTO)/.test(w)) : [];
    if (servizio && !forte && (!resto.length || !(ric.p || ['peso', 'vol'].includes(FAM_U[umNorm(r.um)]) || confezione(r.descrizione)))) continue;
    if (!fam) {   // fuori dalle categorie del magazzino: solo righe già riconosciute
      if (!forte && ric.come !== 'registrazione' && !(ric.come === 'parole' && (!r.categoria || r.categoria === DA_CLASS))) continue;
    }
    const k = r.fid + ':' + r.i;
    const x = { r, k, data: a.data, ddt: a.num, tipo, prodotto: null, q: null, proposto: ric.p || ric.cand[0] || null, qProp: null, motivo: '', come: ric.come, alt: [], nuovo: null, origine: '', origini: [] };
    const v = fatti[k];
    if (v === 'no') { out.tolte.push(x); continue; }
    if (v) { x.fatto = v; out.fatte.push(x); continue; }
    if (conMov.has(k)) { x.fatto = conMov.get(k); out.fatte.push(x); continue; }   // segno perso in fatti (annulla, due dispositivi): il movimento c'è
    if (doppie.has(r.fid)) { x.copiaDi = doppie.get(r.fid); out.doppie.push(x); continue; }
    const p = x.proposto; const qq = p ? qta(r, p) : { q: null, certa: false };
    x.qProp = qq.q;
    const perche = [];
    if (!ric.p) perche.push(ric.come === 'conflitto' ? 'il codice o la descrizione portano a più prodotti' : ric.come === 'pari' ? 'le parole vanno bene per più prodotti'
      : ric.come === 'nome' ? 'riconosciuto solo dal nome' : tipo === 'prezzo' ? 'non so a quale prodotto va la correzione' : 'prodotto mai caricato da una fattura');
    else if (!ric.certo) perche.push(ric.generiche ? 'le parole imparate sono troppo generiche' : ric.come === 'registrazione' ? "numero di registrazione messo dall'app dal nome: confermalo la prima volta" : 'la riga non ha una categoria del magazzino nei Conti');
    if (servizio && !forte) perche.push('la descrizione parla anche di trasporto o servizi');
    if (nota && imp > 0 && !f.segnoOk) perche.push('nota di credito con importi positivi: va sistemata nei Conti');
    if (p && tipo !== 'prezzo' && !qq.certa) perche.push(qq.q === null ? `quantità non chiara (${N(r.quantita)} ${r.um || 'senza unità'} in ${p.unita || ''})` : `quantità da controllare (${N(r.quantita)} ${r.um || 'senza unità'} → ${qq.q} ${p.unita || ''})`);
    if (nota && f.fonte && !['xml', 'excel'].includes(f.fonte) && !f.segnoOk) perche.push('nota di credito letta da un PDF: va confermata nei Conti');
    if (tipo === 'carico') {
      if (RESO.test(d)) perche.push('la descrizione parla di un reso');
      if (p && qq.q > 0) {
        const pu = imp * (1 + quotaSconti(f)) / qq.q; const u = PZ.ultimo.get(p.id); const rif = puGiro.has(p.id) ? puGiro.get(p.id) : u ? u.pu : N(p.prezzo);   // anche i carichi pronti di questo giro
        if (!(rif > 0) && qq.come === 'confezione') perche.push('prima volta con questa confezione: controlla la quantità');
        if (rif > 0 && (pu / rif > 2.5 || pu / rif < 0.4)) perche.push(`prezzo molto diverso dall'ultima volta (${FMT(pu)} € contro ${FMT(rif)} € per ${p.unita || 'unità'}): controlla la quantità`);
        // carico uguale lo stesso giorno: scritto a mano, o da un'altra fattura dello stesso fornitore (o senza P.IVA: forse una copia)
        const altroForn = m => { const g = fat.get(fidDi(m.fattRiga)); return g && pivaN(g.piva) && pivaN(r.piva) && pivaN(g.piva) !== pivaN(r.piva); };
        const ug = m => m.tipo === 'Carico' && m.prodottoId === p.id && (m.data === x.data || m.data === r.data) && Math.abs(N(m.quantita) - qq.q) < 0.001 && (!m.fattRiga || (fidDi(m.fattRiga) !== r.fid && !altroForn(m)));
        if (movimenti.some(m => ug(m) && !m.autoprodotto) || [...giaPrese.values()].some(ug)) perche.push("c'è già un carico uguale lo stesso giorno");
      }
    } else {
      // reso o correzione di prezzo: il carico d'origine dello stesso fornitore, prima della nota
      const fr = fornDi(r); const lim = addD(x.data, tipo === 'reso' ? -365 : -180);
      const carichi = [...daFattura, ...giaPrese.values()].filter(m => m.tipo === 'Carico' && (!p || m.prodottoId === p.id) && fidDi(m.fattRiga) !== r.fid
        && fornDi(fat.get(fidDi(m.fattRiga))) === fr && m.data <= x.data && m.data >= lim).sort((y, z) => z.data.localeCompare(y.data));
      x.origini = carichi.map(m => String(m.fattRiga)).slice(0, 4); x.origine = x.origini[0] || '';
      x.qOrig = carichi.length ? N(carichi[0].quantita) : 0; x.pOrig = carichi.length ? pid.get(carichi[0].prodottoId) || null : null;
      if (!carichi.length) perche.push(p ? `non trovo il carico di «${p.nome}» dallo stesso fornitore prima della nota` : 'non trovo il carico d\'origine');
      if (tipo === 'reso' && p && carichi.length && qq.q > 0) {
        const resi = [...daFattura, ...giaPrese.values()].filter(m => m.tipo === 'Scarico' && m.reso && m.prodottoId === p.id && fornDi(fat.get(fidDi(m.fattRiga))) === fr).reduce((t, m) => t + N(m.quantita), 0);
        if (carichi.reduce((t, m) => t + N(m.quantita), 0) - resi < qq.q - 0.001) perche.push('il reso è più grande di quanto caricato da questo fornitore');
      }
      if (tipo === 'prezzo' && carichi.length > 1) perche.push('più carichi possibili da correggere');
    }
    if (!perche.length && p) {
      x.prodotto = p; x.q = qq.q; out.pronte.push(x);
      if (tipo === 'carico') puGiro.set(p.id, imp * (1 + quotaSconti(f)) / qq.q);
      if (tipo !== 'prezzo') giaPrese.set(k, { tipo: tipo === 'reso' ? 'Scarico' : 'Carico', reso: tipo === 'reso', prodottoId: p.id, quantita: qq.q, data: x.data, fattRiga: k });
      continue;
    }
    x.motivo = perche.join('; ');
    for (const c of [...(ric.p ? [ric.p] : []), ...ric.cand]) if (c !== p && !x.alt.some(y => y.p === c) && x.alt.length < 3) x.alt.push({ p: c, q: qta(r, c).q });
    if (tipo === 'carico' && !ric.p) {   // proposta di un prodotto nuovo dalla riga
      const cat = ric.fito ? (FITO_CAT.includes(categoriaPer(r)) ? categoriaPer(r) : 'Fitofarmaco') : categoriaPer(r);
      const nome = ric.fito ? ric.fito.nome : nomeDa(r.descrizione);
      if (cat && nome && !prodotti.some(y => norm(y.nome) === norm(nome))) {
        const c = confezione(r.descrizione); const um = umNorm(r.um);
        const unita = c && (CONTA.has(um) || !um) ? (c.fam === 'peso' ? 'kg' : 'l') : unitaPer(r.um);
        x.nuovo = { nome, categoria: cat, unita, q: qta(r, { unita }).q, nReg: ric.fito ? ric.fito.nReg : '' };
      }
    }
    out.daFare.push(x);
  }
  const ord = (y, z) => z.data.localeCompare(y.data);
  out.fatte.sort(ord); out.tolte.sort(ord); out.daFare.sort(ord); out.doppie.sort(ord);
  return out;
}
/** Il prodotto impara la riga confermata: codice, descrizione del fornitore, parole e fattore di conversione. Ritorna una copia. */
export function impara(p0, r, q, paroleR = '') {
  const p = Object.assign({}, p0); const add = (l, v) => v && !(l || []).includes(v) ? [...(l || []), v].slice(-20) : l;
  const ck = codChiave(r); if (ck) p.codiciFatt = add(p.codiciFatt, ck);
  const dk = descrK(r); if (dk) p.descrFatt = add(p.descrFatt, dk);
  const w = String(paroleR || '').trim() || paroleDa(r.descrizione);
  if (w && !punteggio(p.paroleFatt, r.descrizione)) p.paroleFatt = [p.paroleFatt, w].filter(Boolean).join(', ');
  const ck2 = chiaveConv(r, p); const auto = qta(r, Object.assign({}, p, { convFatt: {} })); const cf = Object.assign({}, p.convFatt || {});
  if (!(auto.certa && auto.q !== null && Math.abs(auto.q - q) <= 0.001)) cf[ck2] = r3(q / Math.abs(N(r.quantita)) * 1e6) / 1e6; else delete cf[ck2];
  p.convFatt = cf;
  return p;
}
