// Tabelle ordinabili ed esportabili (Excel, CSV, stampa/PDF) usate in tutto il modulo Conti
import { UI, azienda } from '../state.js';
import { esc, nf, fd } from '../util.js';
import { ic } from '../icons.js';
import { scriviXlsx } from './xlsx.js';
import { nativa, stampaHtml } from '../nativo.js';

const REG = new Map();   // tabelle visibili, per l'esportazione
export const registro = REG;

export function fmtVal(v, f) {
  if (v === null || v === undefined || v === '' || (typeof v === 'number' && !isFinite(v))) return '';
  switch (f) {
    case 'eur': return v === 0 ? '–' : nf(v, 0) + ' €';
    case 'eur2': if (v === 0) return '–'; return Number(v).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
    case 'eur3': return Number(v).toLocaleString('it-IT', { minimumFractionDigits: 3, maximumFractionDigits: 3 }) + ' €';
    case 'eur4': return Number(v).toLocaleString('it-IT', { minimumFractionDigits: 4, maximumFractionDigits: 4 }) + ' €';
    case 'num': case 'n': return nf(v, 0); case 'num1': case 'n1': return nf(v, 1); case 'num2': case 'n2': return nf(v, 2); case 'qta': return nf(v, 3);
    case 'pct': return v === 0 ? '–' : nf(v * 100, 1) + '%';
    case 'x2': return nf(v, 2);
    case 'gg': return nf(v, 0) + ' gg';
    case 'date': return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? fd(v) : String(v);
    case 'int': return String(v);
    default: return String(v);
  }
}
const isNumF = f => f && f !== 'text' && f !== 'date';
const xFmt = f => ({ eur: 'eur', eur2: 'eur2', eur3: 'eur3', eur4: 'eur4', num: 'num', num1: 'num1', num2: 'num2', n: 'num', n1: 'num1', n2: 'num2', qta: 'num2', pct: 'pct', x2: 'num2', gg: 'num', date: 'date', int: 'int' }[f] || '');

/**
 * Tabella: id univoco nella vista, def = { title, cols: [{ k, h, fmt, cls, html(r) }], rows, tot, rowAttr(r), sort: true, note }.
 * Le righe possono avere _cls (classe css) e _ind (rientro della prima colonna).
 */
export function tabella(id, def) {
  const s = UI.f['ts_' + id]; let rows = def.rows;
  if (s && def.sort !== false) {
    const [k, dir] = s.split('|'); const c = def.cols.find(x => x.k === k);
    if (c) { const m = dir === 'desc' ? -1 : 1; rows = [...rows].sort((a, b) => { const x = a[k], y = b[k]; if (x == null || x === '') return 1; if (y == null || y === '') return -1; return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'it', { numeric: true })) * m; }); }
  }
  REG.set(id, Object.assign({}, def, { rows }));
  const head = def.cols.map(c => {
    const cur = s && s.startsWith(c.k + '|') ? s.split('|')[1] : '';
    const sortable = def.sort !== false && c.sort !== false;
    return `<th class="${isNumF(c.fmt) ? 'n' : 't'}${c.cls ? ' ' + c.cls : ''}"${c.w ? ` style="width:${c.w}"` : ''}>${sortable ? `<button class="th-s${cur ? ' on' : ''}" data-act="tsort" data-id="${id}" data-k="${c.k}">${esc(c.h)}${cur ? ic(cur === 'asc' ? 'chevron-left' : 'chevron-left', 'srt ' + cur) : ''}</button>` : esc(c.h)}</th>`;
  }).join('');
  const cell = (c, r, tot) => { const v = r[c.k]; const html = c.html && !tot ? c.html(r) : esc(fmtVal(v, c.fmt)); const neg = typeof v === 'number' && v < 0 && isNumF(c.fmt) ? ' neg' : ''; return `<td class="${isNumF(c.fmt) ? 'n' : 't'}${c.cls ? ' ' + c.cls : ''}${neg}">${html}</td>`; };
  const body = rows.map(r => r._sez !== undefined ? `<tr class="sez"><td colspan="${def.cols.length}">${esc(r._sez)}</td></tr>` : `<tr${r._cls ? ` class="${r._cls}"` : ''}${def.rowAttr ? ' ' + def.rowAttr(r) : ''}${r._ind ? ` style="--ind:${r._ind}"` : ''}>${def.cols.map(c => cell(c, r)).join('')}</tr>`).join('');
  const tot = def.tot ? `<tfoot><tr class="tot">${def.cols.map(c => cell(c, def.tot, true)).join('')}</tr></tfoot>` : '';
  return `<div class="tablewrap etab"><table><thead><tr>${head}</tr></thead><tbody>${body || `<tr><td colspan="${def.cols.length}" class="t muted">Nessun dato.</td></tr>`}</tbody>${tot}</table></div>`;
}
export function ordina(id, k) {
  const cur = UI.f['ts_' + id] || ''; const [ck, dir] = cur.split('|');
  UI.f['ts_' + id] = ck === k ? (dir === 'asc' ? k + '|desc' : '') : k + '|' + (/^(controparte|descrizione|categoria|nome|l|label|codice|um|numero)$/.test(k) ? 'asc' : 'desc');
}

/** Pulsanti di esportazione per una o più tabelle registrate. */
export const bottoniExport = (ids, nome) => `<div class="exp-btns"><button class="btn sm ghost" data-act="texp" data-ids="${ids.join(',')}" data-nome="${esc(nome)}" data-fmt="xlsx">${ic('file-spreadsheet')}Excel</button><button class="btn sm ghost" data-act="texp" data-ids="${ids.join(',')}" data-nome="${esc(nome)}" data-fmt="csv">${ic('file-down')}CSV</button><button class="btn sm ghost" data-act="texp" data-ids="${ids.join(',')}" data-nome="${esc(nome)}" data-fmt="print">${ic('printer')}Stampa / PDF</button></div>`;

const valoreExport = (c, r) => { if (c.x) return c.x(r); const v = r[c.k]; if (v == null) return ''; return v; };
function righeExport(def) {
  return def.rows.map(r => r._sez !== undefined ? { sez: r._sez } : { cells: def.cols.map(c => valoreExport(c, r)), fmts: def.cols.map(c => (c.rowFmt && r.fmt ? xFmt(r.fmt) || 'num2' : null)), kind: r._cls && /tot/.test(r._cls) ? 'tot' : r._cls && /grp|bold/.test(r._cls) ? 'b' : 'd', ind: r._ind || 0 });
}
function nomeFile(nome, ext) { return (nome || 'export').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '.' + ext; }
export function scarica(name, blob) { const u = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = u; a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(u); a.remove(); }, 1500); }

export async function esporta(ids, nome, fmt) {
  const defs = ids.map(id => REG.get(id)).filter(Boolean);
  if (!defs.length) throw new Error('Nessuna tabella da esportare.');
  const az = azienda();
  if (fmt === 'xlsx') {
    const sheets = defs.map(d => ({ name: d.sheet || d.title || nome, title: d.title || nome, subtitle: [az.nome, d.sub].filter(Boolean).join('  ·  '), freezeCols: d.freeze || 0, cols: d.cols.filter(c => c.export !== false).map(c => ({ h: c.h, fmt: xFmt(c.fmt), w: c.xw })), rows: righeExport(Object.assign({}, d, { cols: d.cols.filter(c => c.export !== false) })).concat(d.tot ? [{ cells: d.cols.filter(c => c.export !== false).map(c => valoreExport(c, d.tot)), kind: 'tot' }] : []), note: d.note ? [].concat(d.note) : [] }));
    scarica(nomeFile(nome, 'xlsx'), await scriviXlsx(sheets));
  } else if (fmt === 'csv') {
    const q = s => { s = String(s ?? ''); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const it = (v, f) => typeof v === 'number' ? String(f === 'pct' ? Math.round(v * 10000) / 100 : v).replace('.', ',') : v;
    const parti = defs.map(d => { const cols = d.cols.filter(c => c.export !== false); const rr = righeExport(Object.assign({}, d, { cols })); const tot = d.tot ? [cols.map(c => valoreExport(c, d.tot))] : []; return [(defs.length > 1 ? [d.title || ''] : []), cols.map(c => c.h), ...rr.map(r => r.sez !== undefined ? [r.sez] : r.cells.map((v, i) => it(v, cols[i].fmt))), ...tot.map(r => r.map((v, i) => it(v, cols[i].fmt)))].filter(x => x.length).map(r => r.map(q).join(';')).join('\r\n'); });
    scarica(nomeFile(nome, 'csv'), new Blob(['﻿' + parti.join('\r\n\r\n')], { type: 'text/csv;charset=utf-8' }));
  } else stampa(nome, defs.map(d => `<h2>${esc(d.title || '')}</h2>${d.sub ? `<p class="sub">${esc(d.sub)}</p>` : ''}${tabellaStampa(d)}${d.note ? [].concat(d.note).map(n => `<p class="nota">${esc(n)}</p>`).join('') : ''}`).join(''));
}
function tabellaStampa(d) {
  const cols = d.cols.filter(c => c.export !== false);
  const td = (c, r) => { const v = valoreExport(c, r); const s = typeof v === 'number' ? fmtVal(v, c.fmt) : esc(v); return `<td class="${isNumF(c.fmt) ? 'n' : ''}">${s}</td>`; };
  return `<table><thead><tr>${cols.map(c => `<th class="${isNumF(c.fmt) ? 'n' : ''}">${esc(c.h)}</th>`).join('')}</tr></thead><tbody>${d.rows.map(r => r._sez !== undefined ? `<tr class="sez"><td colspan="${cols.length}">${esc(r._sez)}</td></tr>` : `<tr class="${r._cls || ''}" style="--ind:${r._ind || 0}">${cols.map(c => td(c, r)).join('')}</tr>`).join('')}${d.tot ? `<tr class="tot">${cols.map(c => td(c, d.tot)).join('')}</tr>` : ''}</tbody></table>`;
}
/** Stampa (o salva in PDF dal dialogo di stampa) un documento impaginato. */
export function stampa(titolo, corpo) {
  const az = azienda();
  const html = `<!doctype html><html lang="it"><head><meta charset="utf-8"><title>${esc(titolo)}</title><style>
  @page { size: A4 landscape; margin: 12mm 10mm 14mm; }
  body { font: 10px/1.35 Arial, Helvetica, sans-serif; color: #16201B; margin: 0; }
  header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #1E4D3A; padding-bottom: 6px; margin-bottom: 10px; }
  header h1 { font-size: 17px; color: #1E4D3A; margin: 0; } header span { color: #6B7A72; font-size: 10px; }
  h2 { font-size: 12.5px; color: #1E4D3A; margin: 14px 0 4px; break-after: avoid; } .sub, .nota { color: #6B7A72; font-style: italic; margin: 2px 0 6px; }
  table { border-collapse: collapse; width: 100%; break-inside: auto; } tr { break-inside: avoid; }
  th { background: #1E4D3A; color: #fff; font-weight: 700; text-align: left; padding: 4px 6px; font-size: 9px; } th.n { text-align: right; }
  td { padding: 3px 6px; border-bottom: 0.5px solid #C9D3CE; vertical-align: top; } td.n { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  td:first-child { padding-left: calc(6px + var(--ind, 0) * 12px); }
  tr.sez td { background: #3F7D5A; color: #fff; font-weight: 700; } tr.tot td { background: #CFE3D6; font-weight: 700; border-top: 0.5px solid #9DBFA9; } tr.grp td, tr.bold td { font-weight: 700; }
  thead { display: table-header-group; } footer { margin-top: 12px; color: #6B7A72; font-size: 8.5px; }
  </style></head><body><header><div><h1>${esc(titolo)}</h1><span>${esc(az.nome || '')}${az.iva ? ' · P.IVA ' + esc(az.iva) : ''}</span></div><span>Campo e Stalla · ${new Date().toLocaleDateString('it-IT')}</span></header>${corpo}<footer>Prospetto gestionale: non sostituisce il bilancio redatto dal commercialista.</footer></body></html>`;
  if (nativa) return stampaHtml(html, titolo);
  let fr = document.getElementById('printFrame'); if (fr) fr.remove();
  fr = document.createElement('iframe'); fr.id = 'printFrame'; fr.setAttribute('aria-hidden', 'true');
  fr.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  document.body.appendChild(fr);
  fr.onload = () => { try { fr.contentWindow.focus(); fr.contentWindow.print(); } catch (e) { scarica(nomeFile(titolo, 'html'), new Blob([html], { type: 'text/html' })); } };
  fr.srcdoc = html;
}
