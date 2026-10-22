// Lettura dei bilancini in PDF "disegnati" (ogni lettera è una forma vettoriale, senza testo):
// si trovano le forme, si disegna la pagina e si confronta ogni lettera con l'alfabeto di riferimento.
import { pdfLibrary } from './pdftext.js';

const SCALA = 6, GW = 10, GH = 14, MARGINE_DX = 581;
let TPL = null;
async function templates() {
  if (TPL) return TPL;
  const { ALFABETO } = await import('./alfabeto.js');
  const bin = Uint8Array.from(atob(ALFABETO), c => c.charCodeAt(0));
  const txt = await new Response(new Blob([bin]).stream().pipeThrough(new DecompressionStream('deflate'))).text();
  TPL = JSON.parse(txt).map(([c, w, h, db, px]) => ({ c, w, h, db, px: Uint8Array.from(atob(px), x => x.charCodeAt(0)) }));
  return TPL;
}
function distanza(f, t) {
  let s = 0; for (let i = 0; i < f.px.length; i++) s += Math.abs(f.px[i] - t.px[i]);
  return s / (255 * f.px.length) + 0.5 * Math.abs(f.w - t.w) + 0.5 * Math.abs(f.h - t.h) + 0.5 * Math.abs(f.db - t.db);
}
function riconosci(f, T) {
  let cand = T.filter(t => Math.abs(t.w - f.w) < 0.8 && Math.abs(t.h - f.h) < 0.8); if (!cand.length) cand = T;
  let best = null, bd = Infinity; for (const t of cand) { const d = distanza(f, t); if (d < bd) { bd = d; best = t; } }
  return [best.c, bd];
}
const mul = (m, n) => [m[0] * n[0] + m[1] * n[2], m[0] * n[1] + m[1] * n[3], m[2] * n[0] + m[3] * n[2], m[2] * n[1] + m[3] * n[3], m[4] * n[0] + m[5] * n[2] + n[4], m[4] * n[1] + m[5] * n[3] + n[5]];
const ap = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

/** Forme piene piccole (le lettere) della pagina, con riquadro in coordinate pdfplumber (top dall'alto). */
async function forme(page, OPS, H) {
  const ol = await page.getOperatorList();
  let ctm = [1, 0, 0, 1, 0, 0]; const st = []; let pend = []; const out = [];
  const FILL = new Set([OPS.fill, OPS.eoFill, OPS.fillStroke, OPS.eoFillStroke, OPS.closeFillStroke, OPS.closeEOFillStroke]);
  const NOFILL = new Set([OPS.stroke, OPS.closeStroke, OPS.endPath]);
  for (let i = 0; i < ol.fnArray.length; i++) {
    const fn = ol.fnArray[i], a = ol.argsArray[i];
    if (fn === OPS.save) st.push(ctm); else if (fn === OPS.restore) ctm = st.pop() || [1, 0, 0, 1, 0, 0];
    else if (fn === OPS.transform) ctm = mul(a, ctm);
    else if (fn === OPS.constructPath) {
      const [ops, args] = a; let j = 0; const pts = []; let soloRett = true;
      for (const o of ops) {
        if (o === OPS.rectangle) { const [x, y, w, h] = args.slice(j, j + 4); j += 4; pts.push(ap(ctm, x, y), ap(ctm, x + w, y + h), ap(ctm, x + w, y), ap(ctm, x, y + h)); }
        else { soloRett = false; const n = o === OPS.moveTo || o === OPS.lineTo ? 2 : o === OPS.curveTo ? 6 : o === OPS.curveTo2 || o === OPS.curveTo3 ? 4 : 0; for (let k = 0; k < n; k += 2) pts.push(ap(ctm, args[j + k], args[j + k + 1])); j += n; }
      }
      if (pts.length) { const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]); pend.push({ rett: soloRett, x0: Math.min(...xs), x1: Math.max(...xs), top: H - Math.max(...ys), bottom: H - Math.min(...ys) }); }
    } else if (FILL.has(fn)) { out.push(...pend); pend = []; } else if (NOFILL.has(fn)) pend = [];
  }
  return out.map(c => Object.assign(c, { width: c.x1 - c.x0, height: c.bottom - c.top }));
}
function glifi(comp, W) {
  comp = comp.filter(c => (c.rett ? c.width < 6 && c.height < 6 : c.width < 12 && c.height < 12)).sort((a, b) => a.x0 - b.x0);
  const g = [];
  for (const c of comp) {
    const cy = (c.top + c.bottom) / 2; let unito = false;
    for (let k = g.length - 1; k >= Math.max(0, g.length - 40); k--) {
      const x = g[k]; const sovr = Math.min(x.x1, c.x1) - Math.max(x.x0, c.x0);
      if (Math.abs(x.cy - cy) < 4 && sovr > 0.5 * Math.min(c.width, x.x1 - x.x0)) { x.x0 = Math.min(x.x0, c.x0); x.x1 = Math.max(x.x1, c.x1); x.top = Math.min(x.top, c.top); x.bottom = Math.max(x.bottom, c.bottom); unito = true; break; }
    }
    if (!unito) g.push({ x0: c.x0, x1: c.x1, top: c.top, bottom: c.bottom, cy });
  }
  const lim = W - (595 - MARGINE_DX);
  return g.filter(x => x.x0 < lim);
}
// ricampionamento bicubico come Pillow (Image.resize con BICUBIC)
function cub(x) { const a = -0.5; x = Math.abs(x); return x < 1 ? ((a + 2) * x - (a + 3)) * x * x + 1 : x < 2 ? (((x - 5) * x + 8) * x - 4) * a : 0; }
function coeff(inS, outS) {
  const scale = inS / outS, fs = Math.max(scale, 1), sup = 2 * fs, out = [];
  for (let xx = 0; xx < outS; xx++) {
    const c = (xx + 0.5) * scale; const xmin = Math.max(Math.trunc(c - sup + 0.5), 0), xmax = Math.min(Math.trunc(c + sup + 0.5), inS);
    const w = []; let t = 0; for (let x = xmin; x < xmax; x++) { const v = cub((x - c + 0.5) / fs); w.push(v); t += v; }
    out.push([xmin, w.map(v => (t ? v / t : 0))]);
  }
  return out;
}
const clip = v => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));
function ridimensiona(src, w, h, W2, H2) {
  const cx = coeff(w, W2), cy = coeff(h, H2); const tmp = new Float64Array(W2 * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < W2; x++) { const [x0, k] = cx[x]; let s = 0; for (let i = 0; i < k.length; i++) s += src[y * w + x0 + i] * k[i]; tmp[y * W2 + x] = clip(s); }
  const out = new Uint8Array(W2 * H2);
  for (let y = 0; y < H2; y++) { const [y0, k] = cy[y]; for (let x = 0; x < W2; x++) { let s = 0; for (let i = 0; i < k.length; i++) s += tmp[(y0 + i) * W2 + x] * k[i]; out[y * W2 + x] = clip(s); } }
  return out;
}
const median = a => { const s = [...a].sort((x, y) => x - y); const n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };

/** Righe di segmenti di testo (come leggi_pdf di estrai_bilancino per i PDF senza testo). */
export async function righeVettoriali(bytes) {
  const lib = await pdfLibrary(); const T = await templates();
  const doc = await lib.getDocument({ data: new Uint8Array(bytes), isEvalSupported: false, verbosity: 0 }).promise;
  const righe = [];
  try {
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n); const vp = page.getViewport({ scale: 1 }); const H = vp.viewBox[3], W = vp.viewBox[2];
      const gl = glifi(await forme(page, lib.OPS, H), W); if (!gl.length) continue;
      const v6 = page.getViewport({ scale: SCALA });
      const cv = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(Math.ceil(v6.width), Math.ceil(v6.height)) : Object.assign(document.createElement('canvas'), { width: Math.ceil(v6.width), height: Math.ceil(v6.height) });
      const ctx = cv.getContext('2d', { willReadFrequently: true }); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
      await page.render({ canvasContext: ctx, viewport: v6 }).promise;
      const img = ctx.getImageData(0, 0, cv.width, cv.height).data; const CW = cv.width, CH = cv.height;
      const grigio = (x, y) => { if (x < 0 || y < 0 || x >= CW || y >= CH) return 0; const i = (y * CW + x) * 4; return (img[i] * 299 + img[i + 1] * 587 + img[i + 2] * 114) / 1000; };
      // righe di glifi
      const ord = [...gl].sort((a, b) => (a.top + a.bottom) / 2 - (b.top + b.bottom) / 2); const rr = [];
      for (const g of ord) { const cy = (g.top + g.bottom) / 2; const r = rr[rr.length - 1]; if (r && cy - r[r.length - 1]._cy <= 2.6) r.push(g); else rr.push([g]); g._cy = cy; }
      for (let r of rr) {
        r = r.sort((a, b) => a.x0 - b.x0);
        const alti = r.filter(g => g.bottom - g.top > 3).map(g => g.bottom);
        const base = alti.length ? median(alti) : Math.max(...r.map(g => g.bottom));
        for (const g of r) {
          const bx0 = Math.trunc(g.x0 * SCALA) - 1, by0 = Math.trunc(g.top * SCALA) - 1, bx1 = Math.trunc(g.x1 * SCALA) + 2, by1 = Math.trunc(g.bottom * SCALA) + 2;
          const w = bx1 - bx0, h = by1 - by0; const src = new Float64Array(w * h);
          for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) src[y * w + x] = Math.round(grigio(bx0 + x, by0 + y));
          const px = ridimensiona(src, w, h, GW, GH);
          const f = { w: Math.round((g.x1 - g.x0) * 100) / 100, h: Math.round((g.bottom - g.top) * 100) / 100, db: Math.round((base - g.bottom) * 100) / 100, px };
          const [ch, d] = riconosci(f, T); g.ch = ch; g.dubbio = d > 0.8 ? 1 : 0;
        }
        const segs = [];
        for (const g of r) { const s = segs[segs.length - 1]; if (s && g.x0 - s.x1 <= 6) { if (g.x0 - s.x1 > 1.6) s.testo += ' '; s.testo += g.ch; s.x1 = g.x1; s.dubbi += g.dubbio; } else segs.push({ testo: g.ch, x0: g.x0, x1: g.x1, dubbi: g.dubbio }); }
        righe.push(segs);
      }
      page.cleanup();
    }
  } finally { doc.destroy(); }
  return righe;
}
