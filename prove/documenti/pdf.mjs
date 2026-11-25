// Scrittore di PDF minimo per le prove (nessuna libreria): pagine A4 con testi messi in una posizione precisa,
// nei caratteri standard Helvetica, Helvetica-Bold e Courier (codifica WinAnsi: à è é ì ò ù € vanno bene).
// Le posizioni si danno come le legge js/conti/pdftext.js: x = bordo sinistro (o destro con dx), top = bordo alto
// del carattere misurato dall'alto della pagina. Le larghezze dichiarate nel PDF sono quelle di pdftext.js, così
// pdf.js rilegge le parole esattamente dove sono state scritte. Uscita sempre uguale a parità di testi.

// larghezze di Helvetica in millesimi (le stesse di HW in js/conti/pdftext.js)
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

const FONT = { H: 'Helvetica', B: 'Helvetica-Bold', C: 'Courier' };
// codice WinAnsi di un carattere (Latin-1 uguale; € e apostrofo curvo a parte)
const codice = ch => { const c = ch.charCodeAt(0); if (c < 256) return c; if (ch === '€') return 0x80; if (ch === '’') return 0x92; return 63; };
const daCodice = c => c === 0x80 ? '€' : c === 0x92 ? '’' : String.fromCharCode(c);
const larghezzaCar = (ch, font) => font === 'C' ? 600 : (HW[ch] || 556);
/** Larghezza di un testo in punti. */
export const larghezza = (testo, size = 7, font = 'H') => [...testo].reduce((t, ch) => t + larghezzaCar(ch, font), 0) * size / 1000;

// pdf.js dà ai caratteri standard una discesa di 0,207 (Helvetica) e 0,157 (Courier): il bordo alto letto
// è la linea di base + (1 − discesa) × corpo
const SALITA = { H: 0.793, B: 0.793, C: 0.843 };

export class Pagina {
  constructor(width = 595, height = 842) { this.width = width; this.height = height; this.testi = []; }
  /** Testo con il bordo sinistro in x (o il destro in dx), bordo alto a top. */
  t(x, top, testo, { size = 7, font = 'H', dx = false } = {}) {
    testo = String(testo);
    const x0 = dx ? x - larghezza(testo, size, font) : x;
    this.testi.push({ x0, y: this.height - top - SALITA[font] * size, testo, size, font });
    return this;
  }
  /** Testo allineato a destra: il bordo destro è x. */
  d(x, top, testo, o = {}) { return this.t(x, top, testo, Object.assign({}, o, { dx: true })); }
}

const n3 = v => (Math.round(v * 1000) / 1000).toString();
const stringa = s => '(' + [...s].map(ch => { const c = codice(ch); if (c === 40 || c === 41 || c === 92) return '\\' + ch; if (c < 32 || c > 126) return '\\' + c.toString(8).padStart(3, '0'); return ch; }).join('') + ')';

/** Costruisce il PDF (Uint8Array) dalle pagine. */
export function creaPdf(pagine) {
  const ogg = []; // testo degli oggetti, numerati da 1
  const nuovo = s => { ogg.push(s); return ogg.length; };
  const catalogo = nuovo(''); const radice = nuovo('');
  const fonts = {};
  for (const [k, nome] of Object.entries(FONT)) {
    const w = []; for (let c = 32; c <= 255; c++) w.push(larghezzaCar(daCodice(c), k));
    fonts[k] = nuovo(`<< /Type /Font /Subtype /Type1 /BaseFont /${nome} /Encoding /WinAnsiEncoding /FirstChar 32 /LastChar 255 /Widths [${w.join(' ')}] >>`);
  }
  const risorse = `<< /Font << ${Object.keys(FONT).map(k => `/F${k} ${fonts[k]} 0 R`).join(' ')} >> >>`;
  const kids = [];
  for (const p of pagine) {
    // in ordine di riga e da sinistra a destra, come li scrive un programma: pdf.js unisce due testi vicini sulla
    // stessa riga con uno spazio finto e allora le posizioni delle lettere si spostano un poco. Due testi dello
    // stesso carattere distanti fra 0,1 e 0,6 volte il corpo sono un errore del modello: scriverli come un testo
    // solo (con lo spazio) o allontanarli.
    const ts = [...p.testi].sort((a, b) => b.y - a.y || a.x0 - b.x0);
    ts.forEach((x, i) => {
      const q = ts[i - 1]; if (!q || q.y !== x.y || q.font !== x.font || q.size !== x.size) return;
      const gap = x.x0 - (q.x0 + larghezza(q.testo, q.size, q.font));
      if (gap > 0.1 * x.size && gap <= 0.6 * x.size) throw new Error(`testi troppo vicini: "${q.testo}" e "${x.testo}" (${gap.toFixed(2)} pt)`);
    });
    const flusso = ts.map(x => `BT /F${x.font} ${n3(x.size)} Tf 1 0 0 1 ${n3(x.x0)} ${n3(x.y)} Tm ${stringa(x.testo)} Tj ET`).join('\n');
    const cont = nuovo(`<< /Length ${flusso.length} >>\nstream\n${flusso}\nendstream`);
    kids.push(nuovo(`<< /Type /Page /Parent ${radice} 0 R /MediaBox [0 0 ${p.width} ${p.height}] /Resources ${risorse} /Contents ${cont} 0 R >>`));
  }
  ogg[catalogo - 1] = `<< /Type /Catalog /Pages ${radice} 0 R >>`;
  ogg[radice - 1] = `<< /Type /Pages /Kids [${kids.map(k => k + ' 0 R').join(' ')}] /Count ${kids.length} >>`;
  let out = '%PDF-1.4\n%âãÏÓ\n'; const pos = [];
  ogg.forEach((s, i) => { pos.push(out.length); out += `${i + 1} 0 obj\n${s}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${ogg.length + 1}\n0000000000 65535 f \n` + pos.map(p => String(p).padStart(10, '0') + ' 00000 n \n').join('');
  out += `trailer\n<< /Size ${ogg.length + 1} /Root ${catalogo} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  const b = new Uint8Array(out.length); for (let i = 0; i < out.length; i++) b[i] = out.charCodeAt(i) & 255;
  return b;
}
