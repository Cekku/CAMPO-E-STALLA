// Estratto conto della banca in PDF (con testo o scansionato): elenco dei movimenti con data, importo e descrizione,
// riconoscimento di beneficiario/ordinante, IBAN e causale, abbinamento alle fatture e ai pagamenti del personale.
import { S } from '../state.js';
import * as store from '../store.js';
import { N, today } from '../util.js';

const r2 = v => Math.round(v * 100) / 100;
const DATA_RE = /^(\d{2})[/.-](\d{2})[/.-](\d{4})$/;
const IMP_RE = /^[-+]?\d{1,3}(?:\.\d{3})*,\d{2}$|^[-+]?\d+,\d{2}$/;
const iso = s => { const m = DATA_RE.exec(s); return m ? `${m[3]}-${m[2]}-${m[1]}` : null; };
const numIt = s => { const v = parseFloat(String(s).replace(/[^\d,]/g, '').replace(',', '.')); return isFinite(v) ? v : null; };

/* ---------------- IBAN: correzione degli errori tipici della lettura ottica ---------------- */
function ibanValido(s) {
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(s)) return false;
  const r = (s.slice(4) + s.slice(0, 4)).replace(/[A-Z]/g, c => String(c.charCodeAt(0) - 55));
  let m = 0; for (const ch of r) m = (m * 10 + +ch) % 97; return m === 1;
}
export function pulisciIban(s) {
  s = String(s || '').toUpperCase().replace(/[^A-Z0-9$]/g, '').replace(/^1T/, 'IT').replace(/^L T|^LT/, 'IT');
  if (ibanValido(s)) return s;
  // il CIN italiano (5° carattere) è una lettera: la lettura ottica lo scambia con cifre o simboli ($ → S, 5 → S, 0 → O, 1 → I)
  if (s.startsWith('IT') && s.length === 27) {
    for (let c = 65; c <= 90; c++) { const t = s.slice(0, 4) + String.fromCharCode(c) + s.slice(5); if (ibanValido(t)) return t; }
  }
  return s.replace(/\$/g, 'S');
}

/* ---------------- lettura della tabella dei movimenti ---------------- */
/**
 * Dalle parole posizionate delle pagine (dal testo del PDF o dalla lettura ottica) ricava i movimenti.
 * Le righe del movimento si riconoscono dalla data a sinistra; la descrizione è la colonna a destra dell'importo
 * e può occupare più righe, sopra e sotto la riga della data.
 */
export function movimentiDaParole(pagine) {
  const out = [];
  for (const pg of pagine) {
    const ws = pg.words.map(w => Object.assign({}, w, { text: String(w.text || '').replace(/[|¦]/g, '').trim() })).filter(w => w.text);
    if (!ws.length) continue;
    const W = pg.width || 595;
    // righe di parole
    const righe = []; for (const w of [...ws].sort((a, b) => a.top - b.top || a.x0 - b.x0)) { const r = righe[righe.length - 1]; if (r && Math.abs(r.top - w.top) < 4.5) { r.w.push(w); r.top = Math.min(r.top, w.top); } else righe.push({ top: w.top, w: [w] }); }
    righe.forEach(r => r.w.sort((a, b) => a.x0 - b.x0));
    // intestazione con le colonne (solo se leggibile)
    const intest = righe.find(r => r.w.some(w => /^DARE$|^USCITE$|^ADDEBITI$/i.test(w.text)) && r.w.some(w => /^AVERE$|^ENTRATE$|^ACCREDITI$/i.test(w.text)));
    const xDare = intest ? ((a => (a.x0 + a.x1) / 2)(intest.w.find(w => /^DARE$|^USCITE$|^ADDEBITI$/i.test(w.text)))) : null;
    const xAvere = intest ? ((a => (a.x0 + a.x1) / 2)(intest.w.find(w => /^AVERE$|^ENTRATE$|^ACCREDITI$/i.test(w.text)))) : null;
    // righe con la data del movimento nella parte sinistra e un importo
    const anc = [];
    for (const r of righe) {
      const date = r.w.filter(w => DATA_RE.test(w.text) && w.x0 < W * 0.45);
      if (!date.length) continue;
      const iImp = r.w.findIndex(w => IMP_RE.test(w.text.replace(/€$/, '')) && w.x0 > date[date.length - 1].x1 && w.x0 < W * 0.75);
      if (iImp < 0) continue;
      const iw = r.w[iImp]; const prima = r.w[iImp - 1];
      let segno = /^\+/.test(iw.text) ? 1 : /^-/.test(iw.text) ? -1 : 0;
      if (!segno && prima && prima.x1 > iw.x0 - 12 && !DATA_RE.test(prima.text)) segno = /\+/.test(prima.text) ? 1 : /[-–—=~"]/.test(prima.text) ? -1 : 0;
      const xImp = (iw.x0 + iw.x1) / 2;
      if (xDare != null && xAvere != null) segno = Math.abs(xImp - xAvere) < Math.abs(xImp - xDare) ? 1 : -1;
      const dopo = r.w.slice(iImp + 1).filter(w => w.text !== '€' && w.x0 > iw.x1 + 4);
      anc.push({ top: r.top, data: iso(date[0].text), valuta: iso((date[1] || date[0]).text), importo: numIt(iw.text), segno, xImp, xDesc: dopo.length ? dopo[0].x0 : null, riga: r });
    }
    if (!anc.length) continue;
    // colonna della descrizione: inizio più frequente delle parole a destra degli importi
    const xs = anc.map(a => a.xDesc).filter(x => x != null).sort((a, b) => a - b);
    const xDesc = xs.length ? xs[Math.floor(xs.length / 2)] - 6 : W * 0.5;
    // segno mancante: due colonne di importi (dare a sinistra, avere a destra) oppure uscita
    const xMin = Math.min(...anc.map(a => a.xImp)), xMax = Math.max(...anc.map(a => a.xImp));
    for (const a of anc) if (!a.segno) a.segno = xMax - xMin > 40 && a.xImp > (xMin + xMax) / 2 ? 1 : -1;
    // righe della descrizione, raggruppate in blocchi separati dagli spazi tra una riga di tabella e l'altra
    const dr = righe.map(r => ({ top: r.top, t: r.w.filter(w => w.x0 >= xDesc).map(w => w.text).join(' ').trim() })).filter(r => r.t);
    const passi = dr.slice(1).map((r, i) => r.top - dr[i].top).filter(d => d > 3).sort((a, b) => a - b);
    const passo = passi.length ? passi[Math.floor(passi.length / 4)] : 10;
    const blocchi = []; for (const r of dr) { const b = blocchi[blocchi.length - 1]; if (b && r.top - b.fine <= passo * 1.6) { b.righe.push(r); b.fine = r.top; } else blocchi.push({ inizio: r.top, fine: r.top, righe: [r] }); }
    // un blocco con più date dentro (tabella senza spazi): si divide alla riga di ogni data
    const finali = [];
    for (const b of blocchi) {
      const dentro = anc.filter(a => a.top >= b.inizio - 3 && a.top <= b.fine + 3);
      if (dentro.length <= 1) { finali.push(b); continue; }
      dentro.forEach((a, i) => { const fino = dentro[i + 1] ? dentro[i + 1].top - 2 : Infinity; finali.push({ inizio: a.top, fine: a.top, righe: b.righe.filter(r => r.top >= (i ? a.top - 2 : -Infinity) && r.top < fino) }); });
    }
    const usati = new Set();
    for (const a of anc) {
      let best = null, bd = Infinity;
      for (const b of finali) { if (usati.has(b)) continue; const d = a.top < b.inizio - 3 ? b.inizio - a.top : a.top > b.fine + 3 ? a.top - b.fine : 0; if (d < bd) { bd = d; best = b; } }
      const desc = best && bd <= passo * 2.5 ? (usati.add(best), best.righe.map(r => r.t).join(' ')) : '';
      out.push({ data: a.data, valuta: a.valuta, importo: r2(a.segno * a.importo), descrizione: desc.replace(/\s+/g, ' ').trim() });
    }
  }
  return out.filter(m => m.data && m.importo);
}

/** Beneficiario o ordinante, IBAN, causale e tipo di operazione dalla descrizione del movimento. */
export function arricchisci(m) {
  const d = m.descrizione || ''; const g = re => { const x = re.exec(d); return x ? x[1].trim() : ''; };
  const controparte = g(/(?:A\s+FAVORE\s+DI|A\s*fav\.?:?|BENEFICIARIO:?)\s*(.+?)(?:\s+-\s+|\s+ID\.MSG|\s+ID\.END|\s+RICON|\s+(?:STIPEND|SALARI|RETRIBU|MENSILIT|ACCONTO|ANTICIPO|SALDO|CAUSALE|PER\s)|\s+(?:IBAN|IT\d\d[A-Z])|$)/i) || g(/Ordinante:\s*(.+?)(?:\s+Causale|\s+IBAN|\s+Data|$)/i) || g(/Benef\.\s*(.+?)(?:\s+Comp\.|\s+Spese|$)/i)
    || g(/CRED\.\s*(.+?)(?:\s+ID\.?\s*MANDATO|\s+RIF\.|$)/i) || g(/PRESSO:\s*(.+?)(?:\s+VIA|\s+CARTA|\s+V\.LE|\s+PIAZZA|$)/i) || g(/Pag\.\s*:\s*(.+)$/i);
  const iban = pulisciIban(g(/(?:Coordinate\s+benef\.?|IBAN\s+ordinante|IBAN\s+benef\w*|IBAN):?\s*([A-Z0-9$]{2}\s?\d{2}[A-Z0-9$ ]{11,34}?)(?=\s|$)/i));
  const causale = g(/RICON\.?\s*1?\.?:?\s*(.+)$/i) || g(/Causale:\s*(.+?)(?:\s+\d{15,}|\s+Data ordine|\s+IBAN|$)/i);
  const tipoOp = /BONIFIC/i.test(d) ? 'bonifico' : /S\.?D\.?D|R\.?I\.?D/i.test(d) ? 'addebito diretto' : /\bPOS\b/i.test(d) ? 'POS' : /ASSEGNO/i.test(d) ? 'assegno' : /\bF24\b|DELEGA/i.test(d) ? 'F24' : /COMMISS|IMPOSTA DI BOLLO|SPESE|CANONE|INTERESS/i.test(d) ? 'spese bancarie' : /PRELIEV|BANCOMAT|ATM/i.test(d) ? 'prelievo' : /Ordinante/i.test(d) ? 'bonifico' : 'altro';
  return Object.assign(m, { controparte: controparte.replace(/\s+/g, ' '), beneficiario: m.importo < 0 && tipoOp !== 'spese bancarie' ? controparte : '', iban: iban.length >= 15 ? iban : '', causale, tipoOp });
}

/* ---------------- lettura del PDF ---------------- */
export const pareEstratto = t => /DARE|AVERE|ADDEBITI|ACCREDITI|USCITE|ENTRATE/i.test(t) && /(DESCRIZIONE|OPERAZIONE|CAUSALE)/i.test(t) && /\d{2}\/\d{2}\/\d{4}/.test(t) && /(ESTRATTO|MOVIMENT|SALDO|VALUTA)/i.test(t);

/** Legge un estratto conto in PDF; se le pagine sono immagini usa la lettura ottica (serve la connessione la prima volta). */
export async function leggiEstrattoPdf(bytes, avanzamento = () => { }) {
  const { leggiPdf, parole } = await import('./pdftext.js');
  const pagine = await leggiPdf(bytes);
  if (pagine.some(p => p.chars.length > 50)) return movimentiDaParole(pagine.map(p => ({ width: p.width, height: p.height, words: parole(p) }))).map(arricchisci);
  const { ocrPagine } = await import('./ocr-testo.js');
  return movimentiDaParole(await ocrPagine(bytes, avanzamento)).map(arricchisci);
}

/* ---------------- abbinamento alle fatture ---------------- */
const VUOTE = new Set(['SRL', 'SPA', 'SNC', 'SAS', 'SS', 'SOC', 'SOCIETA', 'COOP', 'COOPERATIVA', 'AGRICOLA', 'AZIENDA', 'AZ', 'AGR', 'DI', 'DEL', 'DELLA', 'DEI', 'E', 'ED', 'IN', 'ITALIA', 'S', 'R', 'L', 'P', 'A', 'ARL', 'UNIPERSONALE', 'GROUP', 'SERVIZI', 'IMPRESA', 'DITTA', 'FRATELLI', 'F', 'LLI', 'CONSORZIO', 'SOCIALE', 'SEMPLICE']);
const parole = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim().split(' ').filter(w => w.length >= 3 && !VUOTE.has(w));
const numFatt = s => String(s || '').toUpperCase().replace(/^0+/, '').replace(/[^A-Z0-9]/g, '');

/** Stato del pagamento di una fattura dai movimenti abbinati. */
export function statoPagamento(f) {
  const tot = Math.abs(N(f.totale)); const pag = r2((f.pagamentiBanca || []).reduce((t, p) => t + N(p.importo), 0));
  if (!tot) return { pagato: pag, residuo: 0, stato: pag ? 'pagata' : '' };
  const residuo = r2(tot - pag);
  return { pagato: pag, residuo, stato: residuo <= 0.01 ? 'pagata' : pag > 0 ? 'in parte' : f.scadenza && f.scadenza < today() ? 'scaduta' : 'da pagare' };
}
/** Fatture candidate per un movimento: stessa controparte, importo uguale al totale (o alla somma di più fatture), numero nella causale. */
export function candidateFatture(m, gia = new Map()) {
  const tipo = m.importo < 0 ? 'Acquisto' : 'Vendita'; const imp = Math.abs(m.importo);
  const desc = ' ' + String(m.descrizione || '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ') + ' ';
  const descN = String(m.descrizione || '').toUpperCase();
  const aperte = S.fatture.filter(f => f.tipo === tipo && (f.data || '') <= m.data && (f.data || '') >= String(+m.data.slice(0, 4) - 2) + m.data.slice(4)).map(f => { const st = statoPagamento(f); return { f, residuo: r2(st.residuo - (gia.get(f.id) || 0)) }; }).filter(x => x.residuo > 0.01);
  const conNome = aperte.map(x => { const ws = parole(x.f.controparte); const hit = ws.filter(w => desc.includes(' ' + w + ' ')).length; return Object.assign(x, { hit, nomeOk: ws.length && (hit === ws.length || hit >= 2 || (hit === 1 && ws.find(w => desc.includes(' ' + w + ' ')).length >= 5)) }); });
  // numero della fattura scritto nella causale
  const conNumero = conNome.filter(x => { const n = numFatt(x.f.numero); return n.length >= 2 && new RegExp('(?:FATT\\w*|FT|N)\\.?\\s*(?:N\\.?|NR\\.?|NUM\\.?)?\\s*0*' + String(x.f.numero).replace(/^0+/, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![0-9])', 'i').test(descN); });
  const esatti = x => Math.abs(x.residuo - imp) < 0.01;
  let scelta = null, motivo = '';
  const n1 = conNumero.filter(esatti); if (n1.length) { scelta = [n1[0]]; motivo = 'numero e importo'; }
  if (!scelta) { const c = conNome.filter(x => x.nomeOk && esatti(x)).sort((a, b) => (b.f.data || '').localeCompare(a.f.data || '')); if (c.length) { scelta = [c[c.length - 1]]; motivo = 'nome e importo'; } }
  if (!scelta && conNumero.length === 1) { scelta = conNumero; motivo = 'numero nella causale'; }
  if (!scelta) {
    // più fatture della stessa controparte pagate insieme
    const st = conNome.filter(x => x.nomeOk).sort((a, b) => (a.f.data || '').localeCompare(b.f.data || '')).slice(-14);
    const cent = Math.round(imp * 100); const best = somma(st.map(x => Math.round(x.residuo * 100)), cent);
    if (best) { scelta = best.map(i => st[i]); motivo = best.length > 1 ? `${best.length} fatture insieme` : 'nome e importo'; }
  }
  if (!scelta) { const c = conNome.filter(esatti); if (c.length === 1) { scelta = c; motivo = 'solo importo'; } }
  const proposte = [...new Set([...conNumero, ...conNome.filter(x => x.nomeOk), ...conNome.filter(x => Math.abs(x.residuo - imp) <= Math.max(1, imp * 0.03))])].slice(0, 25);
  return { tipo, scelte: scelta ? scelta.map(x => x.f.id) : [], motivo, proposte: proposte.map(x => ({ id: x.f.id, testo: `${x.f.controparte} n. ${x.f.numero} del ${String(x.f.data || '').split('-').reverse().join('/')} · ${x.residuo.toLocaleString('it-IT', { minimumFractionDigits: 2 })} €` })) };
}
// sottoinsieme di importi (in centesimi) che dà esattamente il totale: il più recente possibile, al massimo 14 elementi
function somma(v, t) {
  const n = v.length; if (!n || t <= 0) return null;
  let best = null;
  const rec = (i, s, sel) => { if (best) return; if (s === t) { best = [...sel]; return; } if (i < 0 || s > t) return; sel.push(i); rec(i - 1, s + v[i], sel); sel.pop(); rec(i - 1, s, sel); };
  rec(n - 1, 0, []); return best ? best.sort((a, b) => a - b) : null;
}

/** Registra il pagamento (o l'incasso) sulle fatture scelte, ripartendo l'importo in ordine di data. */
export async function registraSuFatture(m, ids, fonte) {
  let resto = Math.abs(m.importo); const rows = [];
  const fs = ids.map(id => S.fatture.find(f => f.id === id)).filter(Boolean).sort((a, b) => (a.data || '').localeCompare(b.data || ''));
  fs.forEach((f, i) => {
    const st = statoPagamento(f); const v = i === fs.length - 1 ? resto : Math.min(resto, Math.max(0, st.residuo)); resto = r2(resto - v);
    const { id, ...data } = f; const pb = (data.pagamentiBanca || []).filter(p => p.mov !== m.id);
    pb.push({ mov: m.id, data: m.data, importo: r2(v), descrizione: String(m.descrizione || '').slice(0, 160), fonte });
    rows.push({ col: 'fatture', id, data: Object.assign(data, { pagamentiBanca: pb }) });
  });
  if (rows.length) await store.bulkPut(rows);
}
export async function togliPagamentoFattura(fid, mov) {
  const f = S.fatture.find(x => x.id === fid); if (!f) return;
  const { id, ...data } = f; data.pagamentiBanca = (data.pagamentiBanca || []).filter(p => p.mov !== mov);
  await store.put('fatture', id, data);
}
export const idMovimento = m => { const k = [m.data, r2(m.importo), String(m.descrizione || '').replace(/\s/g, '').slice(0, 60)].join('|'); let h = 0x811c9dc5; for (let i = 0; i < k.length; i++) { h ^= k.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return 'm' + h.toString(36); };

/* ---------------- righe da rivedere prima di salvare ---------------- */
export const TIPI_MOV = { stipendio: 'Stipendio', anticipo: 'Anticipo sullo stipendio', prestito: 'Prestito al dipendente', rimborso: 'Restituzione di prestito', f24: 'F24 (ritenute)', contributi: 'Contributi INPS agricoli', fondo: 'Fondo pensione', fattura: 'Fattura', ignora: 'Non registrare' };
/** Dai movimenti dell'estratto conto: righe con il tipo proposto (stipendio di un dipendente, F24, fattura…). */
export async function righeEstratto(movs, file) {
  const P = await import('./paghe.js'); const { competenzaDaCausale } = await import('./bonifici-parse.js');
  const usati = new Set([...S.pagamenti.map(p => p.id), ...S.fatture.flatMap(f => (f.pagamentiBanca || []).map(p => p.mov))]);
  const gia = new Map(); const dips = P.dipendenti();
  return movs.map(m => {
    const id = idMovimento(m); m.id = id;
    const base = { id, data: m.data, importo: Math.abs(m.importo), entrata: m.importo > 0, descrizione: m.descrizione, beneficiario: m.beneficiario, iban: m.iban, causale: m.causale, fonte: file, gia: usati.has(id), modalita: m.tipoOp === 'assegno' ? 'assegno' : m.tipoOp === 'POS' ? 'carta' : 'bonifico', comp: competenzaDaCausale(m.causale || m.descrizione), fatt: [], proposte: [], motivo: '' };
    let r = null;
    if (m.importo < 0 && m.tipoOp !== 'spese bancarie') r = P.riconosci({ descrizione: m.descrizione, beneficiario: m.beneficiario, iban: m.iban }, dips);
    if (r && r.tipo === 'stipendio' && !r.dip && !r.ambigui) r = m.beneficiario ? { tipo: 'stipendio', dip: P.chiaveDip({ nome: m.beneficiario }), nuovo: true } : null;
    if (r) return Object.assign(base, r, { sel: !base.gia && !(P.CON_DIP.has(r.tipo) && !r.dip) });
    const c = m.tipoOp === 'spese bancarie' ? { scelte: [], proposte: [] } : candidateFatture(m, gia);
    base.proposte = c.proposte;
    if (c.scelte.length) {
      let resto = Math.abs(m.importo); for (const fid of c.scelte) { const f = S.fatture.find(x => x.id === fid); const res = statoPagamento(f).residuo - (gia.get(fid) || 0); const v = Math.min(resto, res); gia.set(fid, (gia.get(fid) || 0) + v); resto -= v; }
      return Object.assign(base, { tipo: 'fattura', fatt: c.scelte, motivo: c.motivo, sel: !base.gia });
    }
    return Object.assign(base, { tipo: 'ignora', sel: false, altro: true });
  });
}
/** Salva le righe scelte: pagamenti del personale e pagamenti/incassi delle fatture. */
export async function salvaRighe(sel, fonte) {
  const P = await import('./paghe.js'); let nP = 0, nF = 0;
  const pag = sel.filter(r => r.tipo !== 'fattura' && r.tipo !== 'ignora' && !r.entrata);
  if (pag.length) { await store.bulkPut(pag.map(r => ({ col: 'pagamenti', id: r.id, data: P.datiPagamento(Object.assign({ fonte }, r)) }))); nP = pag.length; await P.imparaNomi(pag); }
  for (const r of sel.filter(r => r.tipo === 'fattura' && r.fatt && r.fatt.length)) { await registraSuFatture({ id: r.id, data: r.data, importo: r.entrata ? r.importo : -r.importo, descrizione: r.descrizione }, r.fatt, r.fonte || fonte); nF++; }
  return { nP, nF };
}
