// Lettura delle contabili di bonifico in PDF (home banking): beneficiario, IBAN, data, importo, causale.
// Una distinta può contenere più disposizioni: ogni "Beneficiario" apre un bonifico nuovo.
import { leggiPdf, testoPagina } from './pdftext.js';
import { MESI_NOMI } from './paghe-parse.js';

const numIt = s => { s = String(s || '').replace(/[^\d.,]/g, ''); if (!s) return null; const v = parseFloat(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s); return isFinite(v) ? v : null; };
const dataIt = s => { const m = /(\d{2})[/.-](\d{2})[/.-](\d{4})/.exec(s || ''); return m ? `${m[3]}-${m[2]}-${m[1]}` : null; };

/** Riconosce il testo di una contabile di bonifico. */
export const pareBonifico = t => /bonific/i.test(t) && /beneficiario/i.test(t) && /\bIBAN\b/i.test(t) && /importo/i.test(t) && !/fattura|cedente\/prestatore/i.test(t);

/**
 * Mese di competenza dalla causale ("stipendio mese Dicembre 2025", "stip. 12/2025", "tredicesima", "stipendio febbraio").
 * Se l'anno non è scritto si guarda la data del pagamento: valgono solo i mesi da 11 mesi prima a 2 mesi dopo la data
 * (uno stipendio si paga il mese dopo, a volte in anticipo o in ritardo). "Stipendio dicembre" pagato a gennaio è il
 * dicembre prima, "stipendio gennaio" pagato il 28 gennaio è quel gennaio. Per i due mesi dopo la data restano due
 * possibilità ("febbraio" pagato a fine gennaio: il febbraio che viene o quello di 11 mesi prima): competenzeDaCausale
 * le dà tutte e due (la più vicina per prima), competenzaDaCausale nessuna, e sceglie paghe.js guardando i mesi ancora
 * da pagare; se restano tutte e due è un dubbio (1.63). Con rigoroso il mese conta solo se vicino a parole
 * come stipendio, mese, saldo, acconto (serve per le descrizioni lunghe dell'estratto conto, con indirizzi e date).
 */
const MESI_ABBR = { genn: 1, gen: 1, febb: 2, feb: 2, mar: 3, apr: 4, magg: 5, mag: 5, giu: 6, lug: 7, ago: 8, sett: 9, set: 9, ott: 10, nov: 11, dic: 12 };
const PAROLE_STIP = /(stip|mese|mens|paga|salar|retrib|compet|acconto|anticip|saldo|busta|emolum)/i;
// anni possibili per il mese m scritto senza anno: da 11 mesi prima a 2 mesi dopo la data, il più vicino per primo
function anniPossibili(m, data) {
  if (!data) return [];
  const [y, pm] = data.split('-').map(Number); const rif = m === 13 ? 12 : m === 14 ? 6 : m;
  const out = [];
  for (const yy of [y - 1, y, y + 1]) { const d = (yy * 12 + rif) - (y * 12 + pm); if (d >= -11 && d <= 2) out.push([yy, Math.abs(d) + (d > 0 ? 0.1 : 0)]); }
  return out.sort((a, b) => a[1] - b[1]).map(x => x[0]);
}
/** Mese di competenza dalla causale, solo se è sicuro (altrimenti ''). */
export function competenzaDaCausale(c, data = '', rigoroso = false) { const xs = competenzeDaCausale(c, data, rigoroso); return xs.length === 1 ? xs[0] : ''; }
/** Mesi di competenza possibili dalla causale: [] se non c'è un mese, uno se è sicuro, due se manca l'anno e resta il dubbio. */
export function competenzeDaCausale(c, data = '', rigoroso = false) {
  c = String(c || ''); if (!c) return [];
  const fmt = (y, m) => `${y}-${String(m).padStart(2, '0')}`;
  const anni = (m, y) => (y ? [y] : anniPossibili(m, data)).map(yy => fmt(yy, m));
  const vicino = (idx) => !rigoroso || PAROLE_STIP.test(c.slice(Math.max(0, idx - 30), idx + 2));
  const nomi = [...MESI_NOMI.map(x => x.toLowerCase()), ...Object.keys(MESI_ABBR)].sort((a, b) => b.length - a.length).join('|');
  const re = new RegExp(`(^|[^A-Za-z0-9])(${nomi})\\.?(?![A-Za-z])(?:\\s*[-/']?\\s*((?:20)\\d{2})(?!\\d)|\\s*'(\\d{2})(?!\\d))?`, 'gi');
  let x;
  while ((x = re.exec(c))) {
    const prima = c.slice(Math.max(0, x.index - 14), x.index + x[1].length);
    if (/(\bVIA|\bVIALE|\bV\.LE|\bPIAZZA|\bP\.ZZA|\bCORSO|\bC\.SO|\bLARGO|\bXX|\b\d{1,2})\s*$/i.test(prima)) continue; // indirizzi e date ("via XX Settembre", "15 marzo")
    if (!vicino(x.index)) continue;
    const w = x[2].toLowerCase(); const m = MESI_NOMI.findIndex(n => n.toLowerCase() === w) + 1 || MESI_ABBR[w];
    if (!m) continue;
    const xs = anni(m, x[3] ? +x[3] : x[4] ? 2000 + +x[4] : 0);
    if (xs.length) return xs;
  }
  x = /\b(tredicesima|quattordicesima|1[34]\s*-?\s*(?:esima|ma|[ªa^°]))(?![A-Za-z])(?:\D{0,12}?((?:20)\d{2})(?!\d))?/i.exec(c);
  if (x) { const m = /^(tred|13)/i.test(x[1]) ? 13 : 14; const xs = anni(m, x[2] ? +x[2] : 0); if (xs.length) return xs; }
  x = /(?:stip|mese|mens|paga|salar|retrib|compet)\D{0,25}\b(0?[1-9]|1[0-2])[/.-]((?:20)?\d{2})(?![\d/.-])/i.exec(c);
  if (x) { const y = x[2].length === 2 ? 2000 + +x[2] : +x[2]; return [fmt(y, +x[1])]; }
  return [];
}

/** Legge una contabile o una distinta di bonifici: ritorna l'elenco dei bonifici. */
export async function leggiBonifici(bytes, pagine) {
  pagine = pagine || await leggiPdf(bytes);
  const righe = pagine.map(testoPagina).join('\n').split('\n').map(s => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const comune = { data: null, ordinante: '' };
  const out = []; let cur = null;
  const val = (r, re) => { const m = re.exec(r); return m ? m[1].trim() : null; };
  for (const r of righe) {
    let v;
    if ((v = val(r, /^Denominazione Ordinante\s+(.+)$/i))) comune.ordinante = v;
    if ((v = val(r, /^Beneficiario\s*:?\s+(.+)$/i)) && !/^(IBAN|BIC)/i.test(v)) { cur = { beneficiario: v.replace(/\s+IBAN.*$/i, ''), iban: '', importo: null, data: null, causale: '', causaleBancaria: '', id: '', stato: '' }; out.push(cur); continue; }
    if (!cur) { const d = val(r, /Data (?:esecuzione|valuta|addebito)\s*:?\s*(\d{2}[/.-]\d{2}[/.-]\d{4})/i); if (d) comune.data = dataIt(d); continue; }
    if ((v = val(r, /\bIBAN(?: beneficiario)?\s*:?\s*([A-Z]{2}\d{2}[A-Z0-9 ]{10,32})/i))) cur.iban = v.replace(/\s/g, '').toUpperCase();
    if ((v = val(r, /Data (?:esecuzione|valuta|addebito|regolamento)\s*:?\s*(\d{2}[/.-]\d{2}[/.-]\d{4})/i))) cur.data = dataIt(v);
    if ((v = val(r, /^Importo(?: bonifico| disposizione)?\s*:?\s*-?\s*(?:EUR|€)?\s*([\d.]+,\d{2})/i))) cur.importo = numIt(v);
    if ((v = val(r, /^Causale bancaria\s+(.+)$/i))) cur.causaleBancaria = v;
    else if ((v = val(r, /^(?:Causale|Descrizione|Motivazione)(?: del bonifico| pagamento)?\s*:?\s+(.+)$/i))) cur.causale = (cur.causale ? cur.causale + ' ' : '') + v;
    if ((v = val(r, /^(?:Identificativo disposizione|CRO|TRN|Transaction ID|Codice riferimento)\s*:?\s*(\S+)/i)) && !cur.id) cur.id = v;
    if ((v = val(r, /^Stato\s+(.+)$/i))) cur.stato = v;
  }
  const bon = out.filter(b => b.importo).map(b => Object.assign(b, { data: b.data || comune.data, ordinante: comune.ordinante, comp: competenzaDaCausale(b.causale, b.data || comune.data), stipendio: /^SALA$/i.test(b.causaleBancaria) || /stipend|salari|retribu|busta paga|mensilit|tredicesima|quattordicesima/i.test(b.causale) }));
  if (!bon.length) throw new Error('Nella contabile non ho trovato beneficiario e importo del bonifico.');
  return bon;
}
