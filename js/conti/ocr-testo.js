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

/** Ritorna per ogni pagina { width, height, words: [{ text, x0, x1, top, bottom }] } in punti PDF. */
export async function ocrPagine(bytes, avanzamento = () => { }) {
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
