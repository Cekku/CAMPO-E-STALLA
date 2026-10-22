// Lettura del testo dei PDF con posizioni (caratteri, parole, righe), sul modello di pdfplumber.
// La libreria pdf.js si carica solo quando serve.

let LIB = null, BASE = '';
export function setPdfLib(lib) { LIB = lib; }
export async function pdfLibrary() { return pdfLib(); }
async function pdfLib() {
  if (LIB) return LIB;
  const base = new URL('../../vendor/pdfjs/', import.meta.url).href;
  const lib = await import(base + 'pdf.min.mjs');
  lib.GlobalWorkerOptions.workerSrc = base + 'pdf.worker.min.mjs';
  LIB = lib; BASE = base;
  return LIB;
}

// larghezze dei caratteri di Helvetica (millesimi): servono a stimare la posizione di ogni lettera dentro un blocco di testo
const HW = (() => {
  const w = {};
  const set = (chars, v) => { for (const c of chars) w[c] = v; };
  set(' ', 278); set('!', 278); set('"', 355); set('#$%', 556); set('&', 667); set("'", 191); set('()', 333); set('*', 389); set('+', 584); set(',.', 278); set('-', 333); set('/', 278);
  set('0123456789', 556); set(':;', 278); set('<=>', 584); set('?', 556); set('@', 1015);
  Object.assign(w, { A: 667, B: 667, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722, I: 278, J: 500, K: 667, L: 556, M: 833, N: 722, O: 778, P: 667, Q: 778, R: 722, S: 667, T: 611, U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611 });
  Object.assign(w, { a: 556, b: 556, c: 500, d: 556, e: 556, f: 278, g: 556, h: 556, i: 222, j: 222, k: 500, l: 222, m: 833, n: 556, o: 556, p: 556, q: 556, r: 333, s: 500, t: 278, u: 556, v: 500, w: 722, x: 500, y: 500, z: 500 });
  set('[]', 278); set('\\', 278); set('_', 556); set('€', 556); set('%', 889); set('àèéìòù', 556); set('°', 400);
  return w;
})();
const cw = c => HW[c] || 556;

/** Apre un PDF (ArrayBuffer/Uint8Array) e ritorna le pagine con i caratteri posizionati. */
export async function leggiPdf(data) {
  const lib = await pdfLib();
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const opts = { data: new Uint8Array(bytes), isEvalSupported: false, verbosity: 0 };
  if (BASE) { opts.cMapUrl = BASE + 'cmaps/'; opts.cMapPacked = true; opts.standardFontDataUrl = BASE + 'standard_fonts/'; }
  const doc = await lib.getDocument(opts).promise;
  const pagine = [];
  try {
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const vp = page.getViewport({ scale: 1 });
      const H = vp.viewBox[3] - vp.viewBox[1], W = vp.viewBox[2] - vp.viewBox[0];
      const tc = await page.getTextContent({ includeMarkedContent: false });
      const chars = [];
      for (const it of tc.items) {
        const s = it.str; if (!s) continue;
        const [a, b, c, d, e, f] = it.transform;
        const upright = Math.abs(b) < 1e-3 && Math.abs(c) < 1e-3 && a > 0;
        const size = upright ? Math.abs(d) : Math.hypot(c, d);
        const st = tc.styles[it.fontName] || {};
        const desc = Number.isFinite(st.descent) && st.descent < 0 && st.descent > -0.6 ? st.descent : -0.2;
        const y0 = f + desc * size, y1 = y0 + size;
        const top = H - y1 + vp.viewBox[1], bottom = H - y0 + vp.viewBox[1];
        const tot = [...s].reduce((t, ch) => t + cw(ch), 0) || 1;
        const width = upright ? it.width : it.width;
        let x = e - vp.viewBox[0];
        for (const ch of s) {
          const w = (Number.isFinite(width) ? width : s.length * size * 0.55) * cw(ch) / tot;
          chars.push({ text: ch, x0: x, x1: x + w, top, bottom, size, fontname: it.fontName, upright });
          x += w;
        }
      }
      pagine.push({ width: W, height: H, chars });
      page.cleanup();
    }
  } finally { doc.destroy(); }
  return pagine;
}

/** Raggruppa elementi per vicinanza di una coordinata (come cluster_objects di pdfplumber). */
function cluster(items, key, tol) {
  const s = [...items].sort((p, q) => key(p) - key(q));
  const out = []; let cur = null, last = null;
  for (const it of s) {
    const v = key(it);
    if (cur && v - last <= tol) cur.push(it); else { cur = [it]; out.push(cur); }
    last = v;
  }
  return out;
}

/** Parole della pagina (equivalente di page.extract_words di pdfplumber). */
export function parole(pagina, { xTol = 3, yTol = 3, extraUpright = false, attr = false } = {}) {
  const chars = pagina.chars.filter(c => extraUpright ? true : c.upright);
  const out = [];
  for (const riga of cluster(chars, c => c.top, yTol)) {
    riga.sort((p, q) => p.x0 - q.x0);
    let w = null, prev = null;
    for (const c of riga) {
      if (/\s/.test(c.text)) { w = null; prev = null; continue; }
      if (w && prev && c.x0 >= prev.x0 && c.x0 <= prev.x1 + xTol && Math.abs(c.top - prev.top) <= yTol && (!attr || (c.size === w.size && c.fontname === w.fontname))) {
        w.text += c.text; w.x1 = Math.max(w.x1, c.x1); w.top = Math.min(w.top, c.top); w.bottom = Math.max(w.bottom, c.bottom);
      } else {
        w = { text: c.text, x0: c.x0, x1: c.x1, top: c.top, bottom: c.bottom, size: c.size, fontname: c.fontname };
        out.push(w);
      }
      prev = c;
    }
  }
  return out;
}

/** Testo semplice della pagina, riga per riga. */
export function testoPagina(pagina) {
  return righeParole(pagina, 3, 3).map(r => r.map(w => w.text).join(' ')).join('\n');
}

/** Righe di parole come _righe_parole di estrai_fatture (parole vicine in verticale sulla stessa riga). */
export function righeParole(pagina, xTol = 1.5, yTol = 2) {
  const ws = parole(pagina, { xTol, yTol });
  ws.sort((p, q) => (Math.round(p.top) - Math.round(q.top)) || (p.x0 - q.x0));
  const righe = [];
  for (const w of ws) {
    const r = righe[righe.length - 1];
    if (r && Math.abs(r[0].top - w.top) < 2.5) r.push(w); else righe.push([w]);
  }
  return righe.map(r => r.sort((p, q) => p.x0 - q.x0));
}
export const testo = ws => ws.map(w => w.text).join(' ');
