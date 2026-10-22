// Lettura del bilancino (situazione contabile al 31/12) e ripartizione dei conti nelle voci del conto economico.
// Le voci sono indicate con il numero di riga del modello Excel (vedi ROW in schema.js).
import { leggiPdf } from './pdftext.js';

export const CONTI = {
  '58/51/001': 11, '58/52/001': 10, '58/62/001': 12, '66/25/005': 37, '66/25/010': 34, '66/30/007': 36, '66/30/015': 36, '66/30/025': 36,
  '66/30/491': 37, '66/53/001': 35, '66/54/001': 30, '66/55/003': 31, '68/05/025': 42, '68/05/040': 42, '68/05/055': 41, '68/05/057': 41,
  '68/05/110': 43, '68/05/261': 44, '68/05/407': 50, '68/05/503': 44, '68/05/508': 45, '70/05/010': 52, '70/05/101': 54, '84/10/010': 74,
  '66/30/017': 36, '66/30/036': 34, '66/30/045': 36, '66/30/492': 37, '68/05/021': 40, '68/05/045': 42, '68/05/080': 50, '68/05/090': 50,
  '68/05/325': 47, '68/05/505': 44, '84/05/090': 73, '88/20/035': 90, '58/05/215': 12, '58/10/005': 12,
};
const DETTAGLI = [
  ['RICAVI', ['LATTE'], 8], ['RICAVI', ['BOVIN', 'VITELL', 'MANZ', 'VACC', 'TORELL', 'ANIMALI'], 9],
  ['RICAVI', ['CEREAL', 'MAIS', 'FORAGG', 'ORZO', 'GRANO', 'FRUMENT', 'SOIA', 'FIENO', 'SORGO', 'ERBA', 'PAGLIA', 'INSILAT'], 10],
  ['RICAVI', ['ENERGIA'], 14], ['RICAVI', ['PRESTAZ', 'SERVIZ', 'LAVORAZ', 'NOLEGG'], 12], ['RICAVI', ['CONTRIBUT'], 21],
  ['COSTI', ['SEME ANIMALE', 'FECONDAZ', 'INSEMINAZ'], 46], ['COSTI', ['MANGIM', 'NUCLEO', 'INTEGRATOR'], 30],
  ['COSTI', ['CEREAL', 'MAIS', 'FORAGG', 'ERBA MEDICA', 'SORGO', 'FIENO', 'PAGLIA', 'ORZO', 'SOIA', 'INSILAT'], 30],
  ['COSTI', ['SEMI', 'SEMENT', 'PIANTIN'], 31], ['COSTI', ['CONCIM', 'FERTILIZZ', 'AMMENDANT'], 32],
  ['COSTI', ['FITOFARM', 'ANTIPARASS', 'DISERB', 'FUNGICID', 'INSETTICID', 'ERBICID'], 33], ['COSTI', ['GASOLIO', 'CARBURANT', 'LUBRIFIC'], 34],
  ['COSTI', ['VETERIN', 'DISINFETT', 'SANITARI', 'MEDICINAL'], 39], ['COSTI', ['BOVIN', 'SUIN', 'VITELL', 'ANIMALI'], 35],
  ['COSTI', ['MATERIALI DI CONSUMO', 'RICAMBI', 'IMBALLAGG', 'DETERSIV', 'DETERGENT', 'AURICOL', 'CANCELLER', 'VESTIARIO', 'DIVISE', 'SANIFICAZ', 'MINUTERIA'], 36],
  ['COSTI', ['SERV. AGRIC', 'SERVIZI AGRIC', 'CONTOTERZ', 'LAVORAZIONI DI TERZI'], 40], ['COSTI', ['TELEFON'], 47], ['COSTI', ['ASSICURAZ'], 43],
];
const PAROLE = [
  ['RICAVI', ['LATTE'], 8], ['RICAVI', ['BOVIN', 'VITELL', 'ANIMALI', 'BESTIAME'], 9], ['RICAVI', ['CEREALI', 'FORAGG', 'MAIS', 'GRANO', 'ORZO', 'SOIA', 'FIENO'], 10],
  ['RICAVI', ['SERVIZ', 'LAVORAZ', 'CONTO TERZI', 'C/TERZI'], 12], ['RICAVI', ['AGRITUR', 'CONNESS', 'VENDITA DIRETTA'], 13], ['RICAVI', ['ENERGIA', 'FOTOVOLT', 'BIOGAS'], 14],
  ['RICAVI', ['PAC', 'DOMANDA UNICA', 'AGEA'], 20], ['RICAVI', ['CONTRIBUT', 'PSR'], 21], ['RICAVI', ['RISARCIM', 'INDENNIZ'], 23], ['RICAVI', ['PLUSVAL'], 24],
  ['RICAVI', ['SOPRAVV'], 25], ['RICAVI', ['INTERESSI'], 84],
  ['COSTI', ['MANGIM'], 30], ['COSTI', ['SEMENT', 'PIANTIN', 'FLORO'], 31], ['COSTI', ['CONCIM', 'FERTILIZ', 'AMMENDANT'], 32], ['COSTI', ['FITOFARM', 'DISERB', 'ANTIPARASS', 'ANTICRITTOG'], 33],
  ['COSTI', ['CARBURANT', 'GASOLIO', 'LUBRIFIC', 'CARB.', 'LUB.'], 34], ['COSTI', ['ANIMALI', 'BESTIAME', 'BOVIN'], 35], ['COSTI', ['CEREALI', 'FORAGG', 'FIENO'], 30],
  ['COSTI', ['RICAMBI', 'MATERIAL', 'PULIZIA', 'MINUTERIA', 'CANCELLERIA'], 36], ['COSTI', ['VETERIN', 'MEDICINAL', 'FARMAC'], 39], ['COSTI', ['CONTOTERZ', 'CONTO TERZI', 'LAVORAZ'], 40],
  ['COSTI', ['MANUT', 'RIPARAZ'], 41], ['COSTI', ['ENERGIA', 'ELETTRIC', 'GAS ', 'ACQUA', 'RISCALD'], 42], ['COSTI', ['ASSICURAZ'], 43],
  ['COSTI', ['CONSULEN', 'PROF', 'PAGHE', 'COMMERCIAL', 'NOTAI', 'LEGAL'], 44], ['COSTI', ['TRASPORT', 'SPEDIZ'], 45], ['COSTI', ['CONTROLLI FUNZ', 'ANALISI', 'SELEZIONE', 'FECONDAZ'], 46],
  ['COSTI', ['TELEFON', 'INTERNET', 'POSTAL', 'CELLULAR'], 47], ['COSTI', ['BANCAR', 'COMMISSION'], 48], ['COSTI', ['AMMINISTRATOR', 'SINDACI'], 49], ['COSTI', ['LEASING'], 53],
  ['COSTI', ['NOLEGG'], 54], ['COSTI', ['AFFITT', 'FITTI'], 52], ['COSTI', ['CANON'], 55], ['COSTI', ['SALARI', 'STIPEND', 'RETRIBUZ', 'SALARIO'], 57],
  ['COSTI', ['INPS', 'INAIL', 'PREVIDENZ', 'ONERI SOCIALI'], 58], ['COSTI', ['T.F.R', 'TFR', 'FINE RAPPORTO'], 59], ['COSTI', ['AMMORT'], 65],
  ['COSTI', ['IMU', 'TASSE', 'IMPOSTE', 'IMPOSTA', 'BOLLO', 'TRIBUT'], 73], ['COSTI', ['SINDACAL', 'CONSORZ', 'BONIFICA', 'ASSOCIAT', 'QUOTE'], 74],
  ['COSTI', ['MINUSVAL'], 75], ['COSTI', ['SOPRAVV'], 76], ['COSTI', ['MORA', 'V/FORNITORI'], 90], ['COSTI', ['INTERESSI PASS', 'INT.PASS', 'MUTU', 'FINANZIAM'], 87],
  ['COSTI', ['INTERESSI'], 88], ['COSTI', ['PEDAGG'], 50], ['COSTI', ['IRAP', 'I.R.A.P'], 102],
];
const PREDEF = { RICAVI: 15, COSTI: 50 }, PREDEF_PREF = { 66: 37 };

const median = a => { const s = [...a].sort((x, y) => x - y); const n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : 0; };
function inRighe(gl) {
  gl = [...gl].sort((a, b) => (a.top + a.bottom) / 2 - (b.top + b.bottom) / 2);
  const out = [];
  for (const g of gl) {
    const cy = (g.top + g.bottom) / 2; const r = out[out.length - 1];
    if (r && cy - r[r.length - 1]._cy <= 2.6) r.push(g); else out.push([g]);
    g._cy = cy;
  }
  return out.map(r => r.sort((a, b) => a.x0 - b.x0));
}
function segmenti(riga, spazio, colonna) {
  const segs = [];
  for (const g of riga) {
    if (g.ch === ' ') continue;
    const s = segs[segs.length - 1];
    if (s && g.x0 - s.x1 <= colonna) { if (g.x0 - s.x1 > spazio) s.testo += ' '; s.testo += g.ch; s.x1 = g.x1; s.dubbi += g.dubbio || 0; }
    else segs.push({ testo: g.ch, x0: g.x0, x1: g.x1, dubbi: g.dubbio || 0 });
  }
  return segs;
}

export class BilancinoVettoriale extends Error { constructor() { super('Il PDF del bilancino non contiene testo: le lettere sono disegnate come forme.'); this.code = 'VETTORIALE'; } }

export async function righeBilancino(bytes) {
  const pagine = await leggiPdf(bytes);
  const righe = []; let vettoriali = 0;
  for (const p of pagine) {
    if (!p.chars.length) { vettoriali++; continue; }
    const chars = p.chars.filter(c => c.upright).map(c => ({ ch: c.text, x0: c.x0, x1: c.x1, top: c.top, bottom: c.bottom }));
    if (!chars.length) continue;
    const size = median(p.chars.map(c => c.size)) || 7;
    for (const r of inRighe(chars)) righe.push(segmenti(r, 0.25 * size, 1.0 * size));
  }
  if (!righe.length && vettoriali) { const { righeVettoriali } = await import('./ocr-bilancino.js'); return righeVettoriali(bytes); }
  return righe;
}

const CONTO = /^\d{2}\/\d{2}\/\d{3}$/;
const IMPORTO = /^-?\d{1,3}(\.\d{3})*,\d{2}-?$/;
const num = s => { const neg = s.endsWith('-') || s.startsWith('-'); const v = parseFloat(s.replace(/^-+|-+$/g, '').replace(/\./g, '').replace(',', '.')); return Math.round((neg ? -v : v) * 100) / 100; };
function nomeColonna(t) {
  const u = t.toUpperCase().replace(/ /g, '');
  if (u.startsWith('%')) return 'perc'; if (u.startsWith('RIC') || u.startsWith('COS')) return 'periodo'; if (u.startsWith('PRO')) return 'progressivo';
  if (u.startsWith('ATT')) return 'attivita'; if (u.startsWith('PAS')) return 'passivita'; if (u.includes('ITAL')) return 'italia'; if (u.includes('EXTRA')) return 'extra'; if (u.includes('CEE')) return 'cee';
  return null;
}
function colonneIntestazione(segs) {
  const cols = segs.slice(2).map(s => [nomeColonna(s.testo), s.x1]);
  if (!cols.some(([n]) => ['periodo', 'progressivo', 'attivita', 'passivita'].includes(n))) {
    const prima = []; for (const s of segs.slice(2)) { if (s.testo.toUpperCase().startsWith('TOTAL')) break; prima.push(s.x1); }
    const nomi = prima.length === 3 ? ['perc', 'periodo', 'progressivo'] : prima.length === 2 ? ['attivita', 'passivita'] : prima.map((_, i) => 'c' + i);
    return prima.map((x, i) => [nomi[i], x]);
  }
  return cols.map(([n, x], i) => [n || 'c' + i, x]);
}

export function interpreta(righe) {
  const dati = { anno: null, ditta: null, conti: [], blocchi: [], avvisi: [] };
  let sezione = null, colonne = [], ultimo = null, numero = null, attivita = null, blocco = null;
  const cambia = () => {
    const ch = (numero || '') + '|' + (attivita || '');
    const i = dati.blocchi.findIndex(b => b.chiave === ch);
    if (i >= 0) { if (i !== blocco) { sezione = null; ultimo = null; } blocco = i; return; }
    dati.blocchi.push({ chiave: ch, numero, attivita, totali: {}, utile: null }); blocco = dati.blocchi.length - 1; sezione = null; ultimo = null;
  };
  for (const segs of righe) {
    if (!segs.length) continue;
    const testi = segs.map(s => s.testo); const up = testi.join(' ').toUpperCase(); const tu = testi.map(t => t.toUpperCase());
    if (testi[0].toLowerCase().startsWith('ditta') && testi.length > 1) dati.ditta = dati.ditta || testi[1];
    tu.forEach((t, i) => {
      if (t.startsWith('CODICE ATTIVIT') && i + 1 < testi.length) attivita = testi[i + 1];
      if (t.startsWith('CODICE FISCALE') && /^\d{1,6}$/.test(testi[0])) numero = testi[0];
    });
    if (testi[0].toLowerCase().startsWith('ditta') || tu.some(t => t.startsWith('CODICE ATTIVIT') || t.startsWith('CODICE FISCALE') || t.startsWith('PARTITA IVA')) || up.startsWith('ELABORATO DA')) continue;
    if (up.includes('SITUAZIONE') || up.includes('RIDETERMINAZIONE')) {
      if (dati.anno === null) { const m = /AL\s*31\/12\/(\d{4})/.exec(up) || /\b31\/12\/(20\d\d)\b/.exec(up); if (m) dati.anno = parseInt(m[1]); }
      const prima = blocco; cambia();
      if (up.includes('RIDETERMINAZIONE')) sezione = 'IRAP'; else if (sezione === 'IRAP' || prima !== blocco) sezione = null;
      ultimo = null; continue;
    }
    if (blocco === null) cambia();
    const bl = dati.blocchi[blocco];
    if (sezione === 'IRAP') { if (up.startsWith('UTILE') && IMPORTO.test(testi[testi.length - 1])) bl.utile = num(testi[testi.length - 1]); continue; }
    if (segs.length === 1 && ['RICAVI', 'COSTI', 'ALTRO'].includes(up)) { sezione = up; ultimo = null; continue; }
    if (tu[0] === 'CONTO' && segs.length >= 4) { colonne = colonneIntestazione(segs); continue; }
    const importi = segs.filter(s => IMPORTO.test(s.testo.replace(/ /g, '')));
    const valori = {};
    for (const s of importi) {
      const nome = colonne.length ? colonne.reduce((b, c) => Math.abs(c[1] - s.x1) < Math.abs(b[1] - s.x1) ? c : b)[0] : 'c' + Object.keys(valori).length;
      if (!(nome in valori)) valori[nome] = num(s.testo.replace(/ /g, ''));
    }
    const dubbi = importi.reduce((t, s) => t + s.dubbi, 0) + segs[0].dubbi;
    const limite = colonne.length ? Math.min(...colonne.map(c => c[1])) - 25 : 1e9;
    const txt = segs.filter(s => !importi.includes(s) && s.x0 < limite).map(s => s.testo).join(' ');
    if (CONTO.test(testi[0].replace(/ /g, ''))) {
      const descr = segs.slice(1).filter(s => !importi.includes(s) && s.x0 < limite).map(s => s.testo).join(' ');
      ultimo = { blocco, sezione, conto: testi[0].replace(/ /g, ''), descrizione: descr, valori, dubbi, dettagli: [] };
      dati.conti.push(ultimo);
    } else if (up.startsWith('TOTALE') && sezione) { bl.totali[sezione] = valori; ultimo = null; }
    else if (up.startsWith('UTILE FISCALE')) { bl.totali['UTILE FISCALE'] = valori; ultimo = null; }
    else if (ultimo && importi.length && txt.trim() && ultimo.sezione === sezione) ultimo.dettagli.push({ descrizione: txt.trim(), valori, dubbi });
  }
  return dati;
}

export const valoreEconomico = c => { const v = c.valori; for (const k of ['progressivo', 'periodo']) if (k in v) return v[k]; return null; };
const valoreDettaglio = d => { const v = d.valori; if ('periodo' in v) return v.periodo; for (const k of ['attivita', 'passivita']) if (k in v) return v[k]; return null; };

export function abbina(c, contiUtente = {}) {
  if (contiUtente[c.conto]) return [contiUtente[c.conto], 'scelto da te'];
  if (CONTI[c.conto]) return [CONTI[c.conto], 'codice conto'];
  const d = ' ' + c.descrizione.toUpperCase() + ' ';
  for (const [sez, parole, riga] of PAROLE) if (sez === c.sezione) for (const p of parole) if (d.includes(p)) return [riga, `parola chiave '${p.trim()}'`];
  if (c.sezione === 'COSTI' && PREDEF_PREF[c.conto.slice(0, 2)]) return [PREDEF_PREF[c.conto.slice(0, 2)], 'predefinito acquisti'];
  if (PREDEF[c.sezione]) return [PREDEF[c.sezione], 'predefinito sezione'];
  return [null, 'non abbinato'];
}
export function ripartisci(c, contiUtente = {}) {
  const tot = valoreEconomico(c);
  const [rc, cc] = abbina(c, contiUtente);
  const det = c.dettagli.map(d => [d, valoreDettaglio(d)]).filter(([, v]) => v !== null);
  if (det.length > 1 && tot !== null && Math.abs(det.reduce((t, [, v]) => t + v, 0) - tot) < 0.015 && !contiUtente[c.conto]) {
    return det.map(([d, v]) => {
      const t = ' ' + d.descrizione.toUpperCase() + ' ';
      for (const [sez, parole, r] of DETTAGLI) if (sez === c.sezione) { const p = parole.find(p => t.includes(p)); if (p) return [r, v, d.descrizione, `dettaglio '${p}'`]; }
      return [rc, v, d.descrizione, cc + ' (dettaglio senza parola chiave)'];
    });
  }
  return [[rc, tot, '', cc]];
}
export function controlli(dati, contiUtente = {}) {
  const es = []; const multi = dati.blocchi.length > 1;
  dati.blocchi.forEach((bl, i) => {
    const nome = multi ? `[${bl.numero || ''} ${bl.attivita || ''}] ` : '';
    const conti = dati.conti.filter(c => c.blocco === i); const somme = {};
    for (const sez of ['RICAVI', 'COSTI']) {
      const cs = conti.filter(c => c.sezione === sez); const tot = bl.totali[sez] || {};
      const rif = 'progressivo' in tot ? tot.progressivo : ('periodo' in tot ? tot.periodo : null);
      const somma = Math.round(cs.reduce((t, c) => t + (valoreEconomico(c) || 0), 0) * 100) / 100; somme[sez] = somma;
      if (!cs.length && rif === null) continue;
      es.push({ d: `${nome}Somma conti ${sez} = TOTALE ${sez}`, a: somma, b: rif ?? '', esito: rif !== null && Math.abs(somma - rif) < 0.015 ? 'OK' : (rif === null ? 'DA VERIFICARE' : 'DIFFERENZA') });
    }
    let uf = bl.totali['UTILE FISCALE'];
    if (uf) {
      uf = 'progressivo' in uf ? uf.progressivo : 'periodo' in uf ? uf.periodo : Object.values(uf)[0];
      if (uf != null) {
        const fis = Math.round((conti.filter(c => c.sezione === 'RICAVI').reduce((t, c) => t + (c.valori.periodo || 0), 0) - conti.filter(c => c.sezione === 'COSTI').reduce((t, c) => t + (c.valori.periodo || 0), 0)) * 100) / 100;
        es.push({ d: `${nome}Ricavi − costi (colonna periodo) = UTILE FISCALE`, a: fis, b: uf, esito: Math.abs(fis - uf) < 0.015 ? 'OK' : 'DIFFERENZA' });
      }
    }
    if (bl.utile !== null) {
      const diff = Math.round(((somme.RICAVI || 0) - (somme.COSTI || 0)) * 100) / 100;
      es.push({ d: `${nome}Ricavi − costi = Utile/Perdita (pag. IRAP)`, a: diff, b: bl.utile, esito: Math.abs(diff - bl.utile) < 0.015 ? 'OK' : 'DIFFERENZA' });
    }
  });
  const dubbi = dati.conti.reduce((t, c) => t + c.dubbi, 0);
  if (dubbi) es.push({ d: 'Caratteri letti con incertezza negli importi/codici', a: dubbi, b: 0, esito: 'DA VERIFICARE' });
  return es;
}
/** Somma per riga del CE; ritorna anche l'elenco dei conti con l'abbinamento usato. */
export function calcolaCe(dati, contiUtente = {}) {
  const perRiga = {}; const conti = [];
  for (const c of dati.conti) {
    if (!['RICAVI', 'COSTI'].includes(c.sezione)) continue;
    for (const [riga, imp, det, crit] of ripartisci(c, contiUtente)) {
      conti.push({ conto: c.conto, descrizione: c.descrizione + (det ? ' – ' + det : ''), sezione: c.sezione, riga, importo: imp, criterio: crit, blocco: c.blocco });
      if (riga === null || imp === null) continue;
      perRiga[riga] = (perRiga[riga] || 0) + imp;
    }
  }
  for (const k in perRiga) perRiga[k] = Math.round(perRiga[k] * 100) / 100;
  return { perRiga, conti };
}

export async function leggiBilancino(bytes, contiUtente = {}) {
  const righe = await righeBilancino(bytes);
  const dati = interpreta(righe);
  const { perRiga, conti } = calcolaCe(dati, contiUtente);
  return { anno: dati.anno, ditta: dati.ditta, blocchi: dati.blocchi.map(b => ({ numero: b.numero, attivita: b.attivita })), perRiga, conti, controlli: controlli(dati, contiUtente), dati };
}
