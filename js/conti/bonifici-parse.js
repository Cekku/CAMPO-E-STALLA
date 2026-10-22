// Lettura delle contabili di bonifico in PDF (home banking): beneficiario, IBAN, data, importo, causale.
// Una distinta può contenere più disposizioni: ogni "Beneficiario" apre un bonifico nuovo.
import { leggiPdf, testoPagina } from './pdftext.js';
import { MESI_NOMI } from './paghe-parse.js';

const numIt = s => { s = String(s || '').replace(/[^\d.,]/g, ''); if (!s) return null; const v = parseFloat(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s); return isFinite(v) ? v : null; };
const dataIt = s => { const m = /(\d{2})[/.-](\d{2})[/.-](\d{4})/.exec(s || ''); return m ? `${m[3]}-${m[2]}-${m[1]}` : null; };

/** Riconosce il testo di una contabile di bonifico. */
export const pareBonifico = t => /bonific/i.test(t) && /beneficiario/i.test(t) && /\bIBAN\b/i.test(t) && /importo/i.test(t) && !/fattura|cedente\/prestatore/i.test(t);

/** Mese di competenza dalla causale ("stipendio mese Dicembre 2025", "stip. 12/2025", "tredicesima 2025"). */
export function competenzaDaCausale(c) {
  c = String(c || '');
  let m = new RegExp(`\\b(${MESI_NOMI.join('|')})\\b\\.?\\s*(?:\\/|-)?\\s*(20\\d\\d)`, 'i').exec(c);
  if (m) return `${m[2]}-${String(MESI_NOMI.findIndex(x => x.toLowerCase() === m[1].toLowerCase()) + 1).padStart(2, '0')}`;
  m = /\b(tredicesima|13\s*[ªa^°]|quattordicesima|14\s*[ªa^°])\b\D{0,12}(20\d\d)/i.exec(c);
  if (m) return `${m[2]}-${/^(tred|13)/i.test(m[1]) ? '13' : '14'}`;
  m = /(?:stip|mese|mens|paga|salar|retrib)\D{0,25}\b(0?[1-9]|1[0-2])[/.-](20\d\d)\b/i.exec(c);
  if (m) return `${m[2]}-${m[1].padStart(2, '0')}`;
  return '';
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
  const bon = out.filter(b => b.importo).map(b => Object.assign(b, { data: b.data || comune.data, ordinante: comune.ordinante, comp: competenzaDaCausale(b.causale), stipendio: /^SALA$/i.test(b.causaleBancaria) || /stipend|salari|retribu|busta paga|mensilit|tredicesima|quattordicesima/i.test(b.causale) }));
  if (!bon.length) throw new Error('Nella contabile non ho trovato beneficiario e importo del bonifico.');
  return bon;
}
