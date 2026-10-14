// Grafici SVG disegnati a mano, con colori dai token del tema
import { D } from '../state.js';
import { N, nf, addDays, today, fdShort, sum } from '../util.js';

const niceMax = m => { if (m <= 0) return 10; const p = 10 ** Math.floor(Math.log10(m)); return Math.ceil(m / p * 2) / 2 * p; };

export function latteChart(days = 30) {
  const T = today(); const map = {}; D.latte.forEach(l => (map[l.data] = l));
  const pts = []; for (let i = days - 1; i >= 0; i--) { const d = addDays(T, -i); const r = map[d]; pts.push({ d, v: r ? N(r.litri) : null, c: r ? N(r.conferiti !== null && r.conferiti !== undefined && r.conferiti !== '' ? r.conferiti : r.litri) : null }); }
  const vals = pts.filter(p => p.v !== null);
  if (!vals.length) return null;
  const max = niceMax(Math.max(...vals.map(p => p.v)));
  const W = 640, H = 200, L = 40, R = 6, Tp = 14, B = 26, pw = W - L - R, ph = H - Tp - B, bw = pw / days;
  const y = v => Tp + ph - (v / max) * ph;
  let g = '';
  [0, max / 2, max].forEach(v => { g += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" class="grid"/><text x="${L - 8}" y="${y(v) + 4}" text-anchor="end" class="ax">${nf(v, 0)}</text>`; });
  pts.forEach((p, i) => {
    const x = L + i * bw + bw * .14, w = bw * .72;
    if (p.v === null) { g += `<rect x="${x}" y="${Tp + ph - 2}" width="${w}" height="2" class="miss"/>`; return; }
    g += `<rect x="${x}" y="${y(p.v)}" width="${w}" height="${Tp + ph - y(p.v)}" rx="2" class="prod"><title>${fdShort(p.d)}: ${nf(p.v, 0)} l prodotti</title></rect>`;
    g += `<rect x="${x}" y="${y(p.c)}" width="${w}" height="${Tp + ph - y(p.c)}" rx="2" class="conf${i === pts.length - 1 ? ' last' : ''}"><title>${fdShort(p.d)}: ${nf(p.c, 0)} l conferiti</title></rect>`;
  });
  [0, Math.floor(days / 2), days - 1].forEach(i => { g += `<text x="${L + i * bw + bw / 2}" y="${H - 6}" text-anchor="${i === 0 ? 'start' : i === days - 1 ? 'end' : 'middle'}" class="ax">${fdShort(pts[i].d)}</text>`; });
  const avg = sum(vals, p => p.v) / vals.length;
  return { svg: `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Litri di latte al giorno, ultimi ${days} giorni">${g}</svg>`, avg, n: vals.length };
}

// Barra orizzontale composta (es. ripartizione colture)
export function stackBar(parts) {
  const tot = parts.reduce((t, p) => t + p.v, 0); if (!tot) return '';
  return `<div class="stack" role="img" aria-label="Ripartizione">${parts.map(p => `<span style="flex:${p.v};background:${p.color}" title="${p.label}: ${nf(p.v, 2)}"></span>`).join('')}</div>`;
}

// Mini linea di tendenza
export function spark(values, w = 120, h = 32) {
  const v = values.filter(x => x !== null); if (v.length < 2) return '';
  const mn = Math.min(...v), mx = Math.max(...v), r = mx - mn || 1;
  const pts = values.map((x, i) => x === null ? null : [i / (values.length - 1) * (w - 4) + 2, h - 3 - (x - mn) / r * (h - 6)]).filter(Boolean);
  const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join('');
  const last = pts[pts.length - 1];
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" aria-hidden="true"><path d="${d}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/><circle cx="${last[0]}" cy="${last[1]}" r="2.6" fill="currentColor"/></svg>`;
}
