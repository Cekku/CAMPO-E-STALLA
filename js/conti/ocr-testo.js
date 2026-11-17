// Lettura ottica (OCR) delle pagine di un PDF fatto di immagini, con Tesseract in locale (vendor/tesseract).
// Le pagine si disegnano con pdf.js, si portano in bianco e nero (il testo grigio su fondo grigio diventa nero su bianco)
// e si leggono parola per parola con la posizione: il risultato ha la stessa forma delle parole del testo dei PDF.
import { pdfLibrary } from './pdftext.js';

const SCALA = 2.5, SOGLIA = 200;
let WORKER = null;
async function worker(avanzamento) {
  if (WORKER) return WORKER;
  const base = new URL('../../vendor/tesseract/', import.meta.url).href;
  const T = await import(base + 'tesseract.esm.min.js');
  const createWorker = T.createWorker || (T.default && T.default.createWorker);
  WORKER = await createWorker('ita', 1, {
    workerPath: base + 'worker.min.js', corePath: base + 'core/', langPath: base + 'lang', gzip: true, workerBlobURL: false,
    logger: m => { if (m && m.status === 'recognizing text') avanzamento(m.progress); },
  });
  return WORKER;
}

/** Ritorna per ogni pagina { width, height, words: [{ text, x0, x1, top, bottom }] } in punti PDF.
 *  Prima prova il PC (ponte dell'archivio con PP-OCR, più preciso: 1.45.0); se il ponte è spento (telefono) o non
 *  riesce, legge qui con Tesseract. L'array ha `motore` = 'ppocr…' o 'tesseract'. */
export async function ocrPagine(bytes, avanzamento = () => { }) {
  const pc = await sulPC(bytes, avanzamento);
  if (pc) { avanzamento(1); return pc; }
  const out = await ocrQui(bytes, avanzamento); out.motore = 'tesseract'; return out;
}

let AVVISATO = false;   // l'avviso del ponte che non legge si mostra una volta sola
async function sulPC(bytes, avanzamento) {
  let AD;
  try { AD = await import('../views/archivio-dati.js'); } catch (e) { return null; }
  if (!AD.pcVicino()) return null;   // telefono: niente richieste al PC (Chrome chiederebbe il permesso per la rete locale)
  const { toast } = await import('../ui.js');
  const avvisa = t => { if (!AVVISATO) { AVVISATO = true; toast(t); } };
  // avanzamento stimato (il PC risponde solo alla fine): circa 4 secondi a pagina, al massimo 95%
  let tic = null;
  try {
    const lib = await pdfLibrary(); const d = await lib.getDocument({ data: new Uint8Array(bytes).slice(), isEvalSupported: false, verbosity: 0 }).promise;
    const n = d.numPages; d.destroy(); const t0 = Date.now();
    tic = setInterval(() => avanzamento(Math.min(0.95, (Date.now() - t0) / (4000 * n + 3000))), 1000);
  } catch (e) { }
  try {
    const r = await AD.ocrSulPC(bytes);
    if (!r) return null;
    if (r.vecchio) { avvisa('Il ponte dell\'archivio è di una versione vecchia: chiudilo e riaprilo con "Archivio - ponte.bat" per la lettura ottica più precisa sul PC. Ora leggo qui.'); return null; }
    if (!Array.isArray(r.pagine)) return null;
    const out = r.pagine.map(p => ({ width: +p.width, height: +p.height, words: (p.words || []).filter(w => w && w.text) }));
    if (!out.some(p => p.words.length)) return null;   // il PC non ha trovato niente: si prova qui
    out.motore = r.motore || 'ppocr'; return out;
  } catch (e) {
    console.warn('Lettura ottica sul PC non riuscita:', e);
    avvisa('La lettura ottica sul PC non è riuscita: leggo qui, meno preciso.');
    return null;
  } finally { if (tic) clearInterval(tic); }
}

async function ocrQui(bytes, avanzamento) {
  const lib = await pdfLibrary();
  const doc = await lib.getDocument({ data: new Uint8Array(bytes), isEvalSupported: false, verbosity: 0 }).promise;
  const out = [];
  try {
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n); const vp = page.getViewport({ scale: SCALA }); const vp1 = page.getViewport({ scale: 1 });
      const cv = document.createElement('canvas'); cv.width = Math.ceil(vp.width); cv.height = Math.ceil(vp.height);
      const ctx = cv.getContext('2d', { willReadFrequently: true }); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
      const im = ctx.getImageData(0, 0, cv.width, cv.height); const d = im.data;
      for (let i = 0; i < d.length; i += 4) { const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; const v = g < SOGLIA ? 0 : 255; d[i] = d[i + 1] = d[i + 2] = v; }
      ctx.putImageData(im, 0, 0);
      const w = await worker(p => avanzamento((n - 1 + p) / doc.numPages));
      const r = await w.recognize(cv, {}, { blocks: true });
      const words = (r.data.blocks || []).flatMap(b => b.paragraphs.flatMap(p => p.lines.flatMap(l => l.words))).map(x => ({ text: x.text, x0: x.bbox.x0 / SCALA, x1: x.bbox.x1 / SCALA, top: x.bbox.y0 / SCALA, bottom: x.bbox.y1 / SCALA }));
      out.push({ width: vp1.width, height: vp1.height, words });
      page.cleanup(); cv.width = cv.height = 0;
    }
  } finally { doc.destroy(); }
  return out;
}
