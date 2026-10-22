// Grafici del modulo Conti (SVG disegnati a mano, colori dal tema)
import { nf, esc } from '../util.js';

const niceMax = m => { if (m <= 0) return 10; const p = 10 ** Math.floor(Math.log10(m)); for (const k of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (k * p >= m) return k * p; return 10 * p; };
const compatto = v => { const a = Math.abs(v); return a >= 1e6 ? nf(v / 1e6, 1) + ' M' : a >= 1e4 ? nf(v / 1e3, 0) + ' k' : a >= 1000 ? nf(v / 1e3, 1) + ' k' : nf(v, v % 1 ? 2 : 0); };
export const PALETTE = ['#23794C', '#D7A33A', '#3D7DC0', '#C2603A', '#7C9A8A', '#8E5BB5', '#4FB3A9', '#B7B23A', '#D1708F', '#5D6B8A', '#9C7A4E', '#6FAE4E'];
export const COL = { acq: 'var(--c-acq)', ven: 'var(--c-ven)', diff: 'var(--c-diff)' };
export const coloreAnno = (i, n) => { const s = ['var(--c-y1)', 'var(--c-y2)', 'var(--c-y3)', 'var(--c-y4)', 'var(--c-y5)']; return s[Math.max(0, s.length - n + i)] || s[s.length - 1]; };

/** Colonne raggruppate: labels = categorie sull'asse, series = [{ name, values, color }]. */
export function colonne(labels, series, { h = 230, fmt = compatto, unit = '€', min0 = true } = {}) {
  const vals = series.flatMap(s => s.values.filter(v => v != null));
  if (!vals.length || vals.every(v => !v)) return '<div class="empty slim">Nessun dato da mostrare.</div>';
  const mx = niceMax(Math.max(0, ...vals)); const mn = min0 ? Math.min(0, ...vals) : Math.min(...vals); const lo = mn < 0 ? -niceMax(-mn) : 0;
  const W = Math.max(520, labels.length * Math.max(26, series.length * 16 + 14)), L = 54, R = 8, T = 12, B = 30, pw = W - L - R, ph = h - T - B, bw = pw / labels.length;
  const y = v => T + ph - (v - lo) / (mx - lo) * ph;
  let g = '';
  for (let k = 0; k <= 4; k++) { const v = lo + (mx - lo) * k / 4; g += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" class="grid"/><text x="${L - 8}" y="${y(v) + 4}" text-anchor="end" class="ax">${fmt(v)}</text>`; }
  if (lo < 0) g += `<line x1="${L}" x2="${W - R}" y1="${y(0)}" y2="${y(0)}" class="zero"/>`;
  const n = series.length; const gw = bw * 0.78, sw = gw / n;
  labels.forEach((lab, i) => {
    const x0 = L + i * bw + (bw - gw) / 2;
    series.forEach((s, j) => {
      const v = s.values[i]; if (v == null || v === 0) return;
      const yy = y(Math.max(0, v)), hh = Math.abs(y(v) - y(0));
      g += `<rect x="${(x0 + j * sw + 0.5).toFixed(1)}" y="${yy.toFixed(1)}" width="${Math.max(1, sw - 1.5).toFixed(1)}" height="${Math.max(1, hh).toFixed(1)}" rx="2" style="fill:${s.color}"><title>${esc(s.name)} · ${esc(lab)}: ${nf(v, 2)} ${unit}</title></rect>`;
    });
    g += `<text x="${L + i * bw + bw / 2}" y="${h - 10}" text-anchor="middle" class="ax lab">${esc(String(lab).length > 10 ? String(lab).slice(0, 9) + '…' : lab)}</text>`;
  });
  return `<div class="chart-scroll"><svg class="chart cols" viewBox="0 0 ${W} ${h}" style="min-width:${Math.min(W, 560)}px" role="img">${g}</svg></div>` + legenda(series);
}
export const legenda = series => series.length > 1 ? `<div class="legend">${series.map(s => `<span><i class="sw" style="background:${s.color}"></i>${esc(s.name)}</span>`).join('')}</div>` : '';

/** Linee su più anni o mesi: series = [{ name, values, color }]. */
export function linee(labels, series, { h = 220, fmt = compatto, unit = '' } = {}) {
  const vals = series.flatMap(s => s.values.filter(v => v != null));
  if (vals.length < 1) return '<div class="empty slim">Nessun dato da mostrare.</div>';
  let mx = Math.max(...vals), mn = Math.min(...vals); if (mx === mn) { mx += Math.abs(mx) * 0.1 || 1; mn -= Math.abs(mn) * 0.1 || 1; }
  const pad = (mx - mn) * 0.12; mx += pad; mn -= pad; if (mn > 0 && mn < (mx - mn)) mn = 0;
  const W = 560, L = 58, R = 16, T = 14, B = 28, pw = W - L - R, ph = h - T - B;
  const x = i => L + (labels.length === 1 ? pw / 2 : i * pw / (labels.length - 1));
  const y = v => T + ph - (v - mn) / (mx - mn) * ph;
  let g = '';
  for (let k = 0; k <= 4; k++) { const v = mn + (mx - mn) * k / 4; g += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" class="grid"/><text x="${L - 8}" y="${y(v) + 4}" text-anchor="end" class="ax">${fmt(v)}</text>`; }
  labels.forEach((l, i) => { g += `<text x="${x(i)}" y="${h - 8}" text-anchor="middle" class="ax lab">${esc(l)}</text>`; });
  series.forEach(s => {
    const pts = s.values.map((v, i) => v == null ? null : [x(i), y(v), v, i]).filter(Boolean);
    if (pts.length > 1) g += `<path d="${pts.map((p, k) => (k ? 'L' : 'M') + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join('')}" fill="none" style="stroke:${s.color}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>`;
    pts.forEach(p => { g += `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3.6" style="fill:${s.color}" class="pt"><title>${esc(s.name)} · ${esc(labels[p[3]])}: ${nf(p[2], 4)} ${unit}</title></circle>`; });
  });
  return `<div class="chart-scroll"><svg class="chart lines" viewBox="0 0 ${W} ${h}" role="img">${g}</svg></div>` + legenda(series);
}

/** Barre orizzontali con etichetta e valore (classifiche). */
export function barre(items, { fmt = v => nf(v, 0) + ' €', act = '' } = {}) {
  if (!items.length) return '<div class="empty slim">Nessun dato.</div>';
  const mx = Math.max(...items.map(i => Math.abs(i.v))) || 1;
  return `<div class="hbars">${items.map((it, k) => `<${it.act ? 'button' : 'div'} class="hbar"${it.act || ''}><span class="hb-l"><i style="background:${it.color || PALETTE[k % PALETTE.length]}"></i>${esc(it.label)}</span><span class="hb-track"><span class="hb-seg" style="width:${(Math.abs(it.v) / mx * 100).toFixed(1)}%;background:${it.color || PALETTE[k % PALETTE.length]}"></span></span><span class="hb-v num">${fmt(it.v)}${it.sub ? `<small>${esc(it.sub)}</small>` : ''}</span></${it.act ? 'button' : 'div'}>`).join('')}</div>`;
}

/** Ciambella con legenda (ripartizione per categoria). */
export function torta(items, { fmt = v => nf(v, 0) + ' €', tot: totLabel = 'totale' } = {}) {
  const tot = items.reduce((t, i) => t + Math.max(0, i.v), 0); if (!tot) return '<div class="empty slim">Nessun dato.</div>';
  const R = 52, C = 2 * Math.PI * R; let off = 0;
  const segs = items.filter(i => i.v > 0).map((it, k) => { const l = it.v / tot * C; const s = `<circle cx="70" cy="70" r="${R}" fill="none" stroke="${it.color || PALETTE[k % PALETTE.length]}" stroke-width="22" stroke-dasharray="${l.toFixed(2)} ${(C - l).toFixed(2)}" stroke-dashoffset="${(-off).toFixed(2)}" transform="rotate(-90 70 70)"><title>${esc(it.label)}: ${fmt(it.v)} (${nf(it.v / tot * 100, 1)}%)</title></circle>`; off += l; return s; }).join('');
  return `<div class="pie"><svg viewBox="0 0 140 140" class="pie-svg" role="img"><circle cx="70" cy="70" r="${R}" fill="none" stroke="var(--sunk)" stroke-width="22"/>${segs}<text x="70" y="66" text-anchor="middle" class="pie-v">${esc(compatto(tot))}</text><text x="70" y="82" text-anchor="middle" class="pie-l">${esc(totLabel)}</text></svg><ul class="pie-leg">${items.filter(i => i.v > 0).map((it, k) => `<li><i style="background:${it.color || PALETTE[k % PALETTE.length]}"></i><span>${esc(it.label)}</span><b class="num">${nf(it.v / tot * 100, 1)}%</b></li>`).join('')}</ul></div>`;
}
export { compatto };
