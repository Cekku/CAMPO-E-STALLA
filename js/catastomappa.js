// Catasto disegnato dall'app sulla mappa: confini e numeri di fogli e particelle presi dal WFS dell'Agenzia delle Entrate
// (gli stessi dati della ricerca) e disegnati su tessere canvas, come fanno i gestionali agricoli.
// Rispetto alle immagini del WMS: numeri leggibili sopra la foto aerea a ogni zoom, linee chiare, nessuna scritta di copyright
// stampata sopra, nessuna fusione di colori da ricalcolare a ogni movimento (mappa fluida).
import { elementiRiquadro } from './catasto.js';

// Celle fisse [longitudine, latitudine], dentro i limiti del WFS: ogni cella si scarica una volta e resta in copia locale.
const CELLA = { p: { tipo: 'CP:CadastralParcel', dx: 0.01, dy: 0.0075, zMin: 16 }, f: { tipo: 'CP:CadastralZoning', dx: 0.12, dy: 0.06, zMin: 13 } };
export const ZOOM_PARTICELLE = CELLA.p.zMin;
const CACHE = 'ces-catasto-1', DURATA = 30 * 864e5;

/* ---------------- dati ---------------- */
const mem = new Map(); // cella -> Promise<elementi>
const coda = []; let attive = 0;
// 4 richieste alla volta; per prime le celle chieste per ultime (quelle che si stanno guardando adesso).
// Le più vecchie oltre le 24 in attesa sono zone già lasciate: si scartano (si richiedono se si torna lì).
function inCoda(fn) { return new Promise((ok, ko) => { coda.push([fn, ok, ko]); avanti(); }); }
function avanti() {
  while (coda.length > 24) coda.shift()[2](Object.assign(new Error('Zona lasciata'), { code: 'ANNULLATA' }));
  while (attive < 4 && coda.length) { const [fn, ok, ko] = coda.pop(); attive++; fn().then(ok, ko).finally(() => { attive--; avanti(); }); }
}

const areaAnello = r => { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]); return a / 2; };
/** Punto per il numero: sulla riga orizzontale a metà del poligono più grande, a metà del tratto interno più lungo. [x, y, larghezza] */
function puntoEtichetta(ps) {
  let best = ps[0], bestA = -1; for (const rs of ps) { const a = Math.abs(areaAnello(rs[0])); if (a > bestA) { bestA = a; best = rs; } }
  let y0 = Infinity, y1 = -Infinity; for (const [, y] of best[0]) { if (y < y0) y0 = y; if (y > y1) y1 = y; }
  const y = (y0 + y1) / 2, xs = [];
  for (const r of best) for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j]; if ((yi > y) !== (yj > y)) xs.push(xi + (y - yi) * (xj - xi) / (yj - yi)); }
  xs.sort((a, b) => a - b); let bx = best[0][0][0], bw = 0;
  for (let i = 0; i + 1 < xs.length; i += 2) if (xs[i + 1] - xs[i] > bw) { bw = xs[i + 1] - xs[i]; bx = (xs[i] + xs[i + 1]) / 2; }
  return [bx, y, bw];
}
const arrot = v => Math.round(v * 1e6) / 1e6;
function compatta(e) {
  const ps = (e.geom.type === 'Polygon' ? [e.geom.coordinates] : e.geom.coordinates).map(rs => rs.map(r => r.map(([x, y]) => [arrot(x), arrot(y)])));
  return { r: e.ref, l: e.label || String(e.ref).split('.').pop(), b: e.bbox, p: ps, c: puntoEtichetta(ps) };
}
function cella(k, i, j) {
  const id = `${k}/${i}/${j}`; if (mem.has(id)) return mem.get(id);
  const C = CELLA[k], bb = [i * C.dx, j * C.dy, (i + 1) * C.dx, (j + 1) * C.dy], url = `https://campo-e-stalla.local/catasto/${id}`;
  const pr = (async () => {
    try { const c = await caches.open(CACHE); const r = await c.match(url); if (r) { const d = await r.json(); if (Date.now() - d.t < DURATA) return d.e; } } catch (e) { }
    const es = (await inCoda(() => elementiRiquadro(C.tipo, bb))).map(compatta);
    try { const c = await caches.open(CACHE); await c.put(url, new Response(JSON.stringify({ t: Date.now(), e: es }), { headers: { 'Content-Type': 'application/json' } })); } catch (e) { }
    return es;
  })();
  mem.set(id, pr); pr.catch(() => mem.delete(id)); // dopo un errore la cella si riprova alla prossima tessera
  return pr;
}
function celle(k, [x0, y0, x1, y1]) {
  const C = CELLA[k], out = [];
  for (let i = Math.floor(x0 / C.dx); i <= Math.floor(x1 / C.dx); i++) for (let j = Math.floor(y0 / C.dy); j <= Math.floor(y1 / C.dy); j++) out.push([i, j]);
  return out;
}
/* ---------------- disegno ---------------- */
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
function disegna(cv, dpr, z, o, box, dati) {
  const ctx = cv.getContext('2d'); ctx.scale(dpr, dpr); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const S = 256 * 2 ** z, X = lon => (lon + 180) / 360 * S - o.x;
  const Y = lat => { const s = Math.sin(lat * Math.PI / 180); return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * S - o.y; };
  const tocca = b => b[2] >= box[0] && b[0] <= box[2] && b[3] >= box[1] && b[1] <= box[3];
  const unici = es => { const v = new Set(); return es.filter(e => tocca(e.b) && !v.has(e.r) && v.add(e.r)); };
  const percorso = es => { const p = new Path2D(); for (const e of es) for (const rs of e.p) for (const r of rs) { r.forEach(([x, y], i) => i ? p.lineTo(X(x), Y(y)) : p.moveTo(X(x), Y(y))); p.closePath(); } return p; };
  const linea = (p, col, w, alone) => { ctx.strokeStyle = alone; ctx.lineWidth = w + 1.6; ctx.stroke(p); ctx.strokeStyle = col; ctx.lineWidth = w; ctx.stroke(p); };
  const parts = unici(dati.p), fogli = unici(dati.f);
  if (parts.length) linea(percorso(parts), 'rgba(255,255,255,.95)', z >= 18 ? 1.7 : z >= 17 ? 1.45 : 1.2, 'rgba(0,0,0,.28)');
  if (fogli.length) linea(percorso(fogli), '#FFD54A', z >= 16 ? 2.6 : 2.2, 'rgba(0,0,0,.4)');
  // numeri: solo se stanno dentro la particella; il contorno scuro li rende leggibili su qualunque foto
  const scrivi = (es, testo, font, col, minH) => {
    ctx.font = font; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineWidth = 2.4; ctx.strokeStyle = 'rgba(0,0,0,.62)'; ctx.fillStyle = col;
    for (const e of es) {
      const [cx, cy, cw] = e.c, t = testo(e), tw = ctx.measureText(t).width;
      if (cw * S / 360 < tw + 6 || Y(e.b[1]) - Y(e.b[3]) < minH) continue;
      const x = X(cx), y = Y(cy); ctx.strokeText(t, x, y); ctx.fillText(t, x, y);
    }
  };
  if (parts.length && z >= 17) scrivi(parts, e => e.l, `700 ${z >= 19 ? 15 : z >= 18 ? 14 : 13}px ${FONT}`, '#fff', 15);
  if (fogli.length) scrivi(fogli, e => (z >= 16 ? 'Foglio ' : 'Fg. ') + e.l, `700 ${z >= 16 ? 16 : 14}px ${FONT}`, '#FFE27A', 18);
}

export const CatastoVettoriale = window.L ? L.GridLayer.extend({
  // updateWhenIdle: le tessere (e i download) solo a mappa ferma, non per tutte le zone attraversate durante lo spostamento
  options: { pane: 'catasto', updateWhenIdle: true, updateWhenZooming: false, keepBuffer: 3, maxZoom: 22, particelle: true, fogli: true, onErrore: null, attribution: 'Catasto © Agenzia delle Entrate (CC BY 4.0)' },
  createTile(coords, done) {
    const dpr = Math.min(2, window.devicePixelRatio || 1), sz = this.getTileSize(), z = coords.z, cv = document.createElement('canvas');
    cv.width = sz.x * dpr; cv.height = sz.y * dpr;
    const kinds = []; if (this.options.fogli && z >= CELLA.f.zMin) kinds.push('f'); if (this.options.particelle && z >= CELLA.p.zMin) kinds.push('p');
    if (!kinds.length) { setTimeout(() => done(null, cv)); return cv; }
    // riquadro della tessera con un margine: i numeri a cavallo di due tessere si disegnano in tutte e due
    const o = coords.scaleBy(sz), M = 70, nw = this._map.unproject(o.subtract([M, M]), z), se = this._map.unproject(o.add(sz).add([M, M]), z);
    const box = [nw.lng, se.lat, se.lng, nw.lat];
    // si ridisegna a ogni cella che arriva: le zone compaiono man mano, senza aspettare la cella più lenta
    const dati = { p: [], f: [] }; let pronta = false, err = null;
    const ridisegna = () => { try { const ctx = cv.getContext('2d'); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height); disegna(cv, dpr, z, o, box, dati); } catch (e) { err = err || e; } };
    const att = []; for (const k of kinds) for (const [i, j] of celle(k, box)) att.push(cella(k, i, j).then(es => { dati[k].push(...es); ridisegna(); if (!pronta) { pronta = true; done(null, cv); } }));
    Promise.allSettled(att).then(rs => {
      for (const r of rs) if (r.status === 'rejected' && (!r.reason || r.reason.code !== 'ANNULLATA')) err = err || r.reason;
      if (err && this.options.onErrore) this.options.onErrore(err);
      if (!pronta) { pronta = true; done(null, cv); }
    });
    return cv;
  },
}) : null;
