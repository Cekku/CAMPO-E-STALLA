// Conti: conto economico, stato patrimoniale, cespiti, indici, analisi della stalla, IVA, controlli
import { S, UI } from '../state.js';
import { esc, nf, fd, N } from '../util.js';
import { ic } from '../icons.js';
import { empty } from '../ui.js';
import { CE, SP, CESPITI, INDICI } from '../conti/schema.js';
import { IVA_VOCI } from '../conti/iva-parse.js';
import { DATI, PARAMETRI } from '../conti/analisi.js';
import { calcolaCe } from '../conti/bilancino-parse.js';
import { bilancio, calc, ind, parametri, datiTecnici, anniProspetto, fatture, cfg } from '../conti/dati.js';
import { tabella, bottoniExport, fmtVal } from '../conti/tabelle.js';
import { colonne, linee, COL, coloreAnno } from '../conti/grafici.js';

const num2 = v => (v === null || v === undefined || v === '' ? '' : Number(v).toLocaleString('it-IT', { maximumFractionDigits: 2 }));
const inCell = (col, y, row, v, extra = '') => `<input class="cell-in" inputmode="decimal" data-act="c-val" data-col="${col}" data-y="${y}" data-row="${row}" value="${esc(num2(v))}" aria-label="Importo ${y}"${extra}>`;
const varPct = (a, b) => (a && b != null ? (b - a) / Math.abs(a) : null);
const fonteDot = f => (f === 'bilancino' ? '<i class="src bil" title="Dal bilancino"></i>' : f === 'excel' ? '<i class="src xls" title="Dal file Excel"></i>' : f === 'manuale' ? '<i class="src man" title="Inserito a mano"></i>' : '');
const nessunDato = (icn, t, s) => `<section class="card">${empty(icn, t, s, `<div class="btns"><button class="btn primary" data-act="sub" data-tab="conti" data-sec="conti" data-sub="importa">${ic('file-up')}Carica documenti</button></div>`)}</section>`;
function barraAnni(chiave, anni, extra = '') {
  const ed = UI.f[chiave];
  return `<div class="toolbar"><span class="muted small">Esercizi ${anni.join(', ')}</span><span class="sp"></span>${extra}${ed ? `<button class="btn sm primary" data-act="chip" data-f="${chiave}" data-v="">${ic('check')}Fine modifica</button>` : `<button class="btn sm" data-act="chip" data-f="${chiave}" data-v="${UI.anno}">${ic('pencil')}Modifica il ${UI.anno}</button>`}</div>`;
}

/* ---------------- conto economico ---------------- */
export function vCE() {
  const anni = anniProspetto(UI.anno); const ed = +UI.f.ce_edit || 0; const ultimo = anni[anni.length - 1], prec = anni[anni.length - 2];
  const C = Object.fromEntries(anni.map(y => [y, calc(y)]));
  if (!anni.some(y => C[y].has.ce) && !ed) return nessunDato('scale', 'Conto economico vuoto', 'Carica i bilancini (situazione contabile al 31/12) o il vecchio file Excel, oppure inserisci gli importi a mano con "Modifica".') + barraAnni('ce_edit', anni);
  const soloPieni = UI.f.ce_zeri !== 'tutte' && !ed;
  const rows = [];
  for (const x of CE) {
    if (x.sez) { rows.push({ _sez: x.sez }); continue; }
    const o = { code: x.code || '', voce: x.l, note: x.n || '', _cls: x.tot ? 'tot' : x.grp ? 'grp' : 'det', _ind: x.in && !x.code ? 1 : 0 };
    anni.forEach(y => (o[y] = C[y].ce[x.row]));
    if (soloPieni && x.in && !x.code && anni.every(y => !o[y])) continue;
    if (prec) o.var = varPct(o[prec], o[ultimo]);
    o.inc = C[ultimo].ce[26] ? o[ultimo] / C[ultimo].ce[26] : null;
    o.row = x.row; o.in = x.in;
    rows.push(o);
  }
  const b = bilancio(ed) || {}; const fonti = b.fonteCe || {};
  const cols = [{ k: 'code', h: 'Voce', w: '64px', cls: 'code' }, { k: 'voce', h: 'Descrizione', fmt: 'text', html: r => esc(r.voce) + (r.in && ed ? fonteDot(fonti[r.row]) : '') },
  ...anni.map(y => ({ k: y, h: String(y), fmt: 'eur', html: y === ed ? r => (r.in ? inCell('ce', y, r.row, (bilancio(y) || {}).ce?.[r.row]) : esc(fmtVal(r[y], 'eur'))) : null })),
  ...(prec ? [{ k: 'var', h: `Var. ${String(ultimo).slice(2)}/${String(prec).slice(2)}`, fmt: 'pct' }] : []), { k: 'inc', h: '% su val. prod. ' + ultimo, fmt: 'pct' }];
  cols.forEach(c => { if (!c.html) delete c.html; });
  const t = tabella('ce', { title: 'Conto economico', sheet: 'Conto economico', sub: 'Schema art. 2425 c.c. adattato all\'azienda agricola · esercizi ' + anni.join(', '), cols, rows, sort: false, freeze: 2, note: ['Prospetto gestionale ricostruito dai dati inseriti: non sostituisce il bilancio del commercialista.'] });
  const trend = anni.length > 1 ? `<section class="card"><div class="card-h"><h2>${ic('chart-column')}Valore della produzione, costi e utile</h2></div>${colonne(anni.map(String), [{ name: 'Valore della produzione', values: anni.map(y => C[y].ce[26]), color: COL.ven }, { name: 'Costi della produzione', values: anni.map(y => C[y].ce[78]), color: COL.acq }, { name: 'Utile', values: anni.map(y => C[y].ce[105]), color: COL.diff }])}</section>` : '';
  return `${barraAnni('ce_edit', anni, `<div class="chipbar"><button data-act="chip" data-f="ce_zeri" data-v="${UI.f.ce_zeri === 'tutte' ? '' : 'tutte'}" aria-pressed="${UI.f.ce_zeri === 'tutte'}">Mostra tutte le voci</button></div>`)}
  ${ed ? `<div class="note-box">${ic('info')}<span>Modifica del ${ed}: scrivi gli importi nelle celle gialle (costi e ricavi in positivo). Subtotali e totali si calcolano da soli. Il pallino indica da dove arriva il dato: <i class="src bil"></i> bilancino, <i class="src xls"></i> file Excel, <i class="src man"></i> inserito a mano.</span></div>` : ''}
  <section class="card"><div class="card-h"><h2>${ic('scale')}Conto economico</h2>${bottoniExport(['ce'], 'Conto economico')}</div>${t}</section>${trend}${contiBilancino(UI.anno)}`;
}
function contiBilancino(y) {
  const b = bilancio(y); if (!b || !b.bilancino || !b.bilancino.dati) return '';
  const { conti } = calcolaCe(b.bilancino.dati, cfg().contiUtente || {});
  const opts = CE.filter(x => x.in).map(x => [x.row, (x.code ? x.code + ' ' : '') + x.l]);
  const user = cfg().contiUtente || {};
  const ctrl = (b.bilancino.controlli || []);
  return `<section class="card"><div class="card-h"><h2>${ic('list-checks')}Conti del bilancino ${y}</h2><span class="muted small">${esc(b.bilancino.file || '')} · ${esc(b.bilancino.ditta || '')}</span>${bottoniExport(['bilconti'], 'Conti bilancino ' + y)}</div>
  ${ctrl.length ? `<div class="pad-x">${ctrl.map(c => `<div class="esito ${c.esito === 'OK' ? 'ok' : c.esito === 'DIFFERENZA' ? 'ko' : 'wa'}">${ic(c.esito === 'OK' ? 'circle-check' : 'triangle-alert')}${esc(c.d)}: ${esc(c.esito)}${c.esito !== 'OK' ? ` (${fmtVal(c.a, 'eur2')} / ${fmtVal(c.b, 'eur2')})` : ''}</div>`).join('')}</div>` : ''}
  <p class="muted small pad-x">Ogni conto è stato messo in una voce del conto economico. Se una scelta non ti convince, cambia la voce: vale anche per i bilancini degli altri anni.</p>
  ${tabella('bilconti', { title: 'Conti del bilancino ' + y, sheet: 'Bilancino ' + y, cols: [{ k: 'conto', h: 'Conto' }, { k: 'descrizione', h: 'Descrizione', fmt: 'text' }, { k: 'sezione', h: 'Sezione' }, { k: 'importo', h: 'Importo', fmt: 'eur2' }, { k: 'voce', h: 'Voce del conto economico', fmt: 'text', html: r => `<select class="cell-in" data-act="c-conto" data-conto="${esc(r.conto)}" data-y="${y}">${opts.map(([v, l]) => `<option value="${v}"${+v === +r.riga ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`, x: r => (CE.find(c => c.row === r.riga) || {}).l || '' }, { k: 'criterio', h: 'Criterio', fmt: 'text', html: r => esc(user[r.conto] ? 'scelto da te' : r.criterio) }], rows: conti, sort: false })}</section>`;
}

/* ---------------- stato patrimoniale ---------------- */
export function vSP() {
  const anni = anniProspetto(UI.anno); const ed = +UI.f.sp_edit || 0; const ultimo = anni[anni.length - 1], prec = anni[anni.length - 2];
  const C = Object.fromEntries(anni.map(y => [y, calc(y)]));
  if (!anni.some(y => C[y].has.sp) && !ed) return nessunDato('landmark', 'Stato patrimoniale vuoto', 'Carica il vecchio file Excel oppure inserisci crediti, liquidità, debiti e patrimonio con "Modifica". Le immobilizzazioni arrivano dal registro dei cespiti, l\'utile dal conto economico.') + barraAnni('sp_edit', anni);
  const rows = [];
  for (const x of SP) {
    if (x.sez) { rows.push({ _sez: x.sez }); continue; }
    const o = { code: x.code || '', voce: x.l, _cls: x.tot ? 'tot' : x.grp ? 'grp' : 'det', _ind: x.grp || x.tot || /^[A-E]$/.test(x.code) ? 0 : 1, row: x.row, in: x.in, link: x.link };
    anni.forEach(y => (o[y] = C[y].sp[x.row]));
    if (UI.f.sp_zeri !== 'tutte' && !ed && !x.grp && !x.tot && anni.every(y => !o[y])) continue;
    if (prec) o.var = varPct(o[prec], o[ultimo]);
    const base = x.row < 49 ? C[ultimo].sp[48] : C[ultimo].sp[84]; o.inc = base ? o[ultimo] / base : null;
    rows.push(o);
  }
  const cols = [{ k: 'code', h: 'Voce', w: '84px', cls: 'code' }, { k: 'voce', h: 'Descrizione', fmt: 'text', html: r => esc(r.voce) + (r.link ? `<span class="sub">${esc(r.link)}</span>` : '') },
  ...anni.map(y => { const c = { k: y, h: String(y), fmt: 'eur' }; if (y === ed) c.html = r => (r.in ? inCell('sp', y, r.row, (bilancio(y) || {}).sp?.[r.row]) : esc(fmtVal(r[y], 'eur'))); return c; }),
  ...(prec ? [{ k: 'var', h: `Var. ${String(ultimo).slice(2)}/${String(prec).slice(2)}`, fmt: 'pct' }] : []), { k: 'inc', h: '% sul totale ' + ultimo, fmt: 'pct' }];
  const quad = anni.filter(y => C[y].has.sp && Math.abs(C[y].sp[85]) > 1);
  return `${barraAnni('sp_edit', anni, `<div class="chipbar"><button data-act="chip" data-f="sp_zeri" data-v="${UI.f.sp_zeri === 'tutte' ? '' : 'tutte'}" aria-pressed="${UI.f.sp_zeri === 'tutte'}">Mostra tutte le voci</button></div>`)}
  ${quad.length ? `<div class="note-box bad">${ic('triangle-alert')}<span>Attivo e passivo non quadrano nel ${quad.join(', ')}: controlla le voci inserite (differenza ${quad.map(y => fmtVal(C[y].sp[85], 'eur')).join(', ')}).</span></div>` : ''}
  <section class="card"><div class="card-h"><h2>${ic('landmark')}Stato patrimoniale</h2>${bottoniExport(['sp'], 'Stato patrimoniale')}</div>${tabella('sp', { title: 'Stato patrimoniale', sheet: 'Stato patrimoniale', sub: 'Esercizi ' + anni.join(', '), cols, rows, sort: false, freeze: 2 })}</section>`;
}

/* ---------------- cespiti ---------------- */
export function vCespiti() {
  const y = UI.anno; const ed = +UI.f.cs_edit === y; const c = calc(y); const b = bilancio(y) || {};
  const rows = [];
  for (const x of CESPITI) {
    if (x.sez) { rows.push({ _sez: x.sez }); continue; }
    const v = c.cesp[x.row] || {}; rows.push({ l: x.l, c: v.c, f: v.f, n: v.n, a: v.a, row: x.row, sum: !!x.sum, _cls: x.tot ? 'tot' : x.sum ? 'grp' : 'det', note: x.n || '' });
  }
  const inp = (k) => r => (r.sum || !ed ? esc(fmtVal(r[k], 'eur')) : `<input class="cell-in" inputmode="decimal" data-act="c-val" data-col="cespiti" data-campo="${k}" data-y="${y}" data-row="${r.row}" value="${esc(num2(((b.cespiti || {})[r.row] || {})[k]))}">`);
  const anni = anniProspetto(y);
  const sint = anni.map(a => ({ anno: String(a), c: calc(a).cesp[23]?.c, f: calc(a).cesp[23]?.f, n: calc(a).cesp[23]?.n, a: calc(a).cesp[23]?.a }));
  return `<div class="toolbar"><span class="muted small">Valori al 31/12/${y}</span><span class="sp"></span>${ed ? `<button class="btn sm primary" data-act="chip" data-f="cs_edit" data-v="">${ic('check')}Fine modifica</button>` : `<button class="btn sm" data-act="chip" data-f="cs_edit" data-v="${y}">${ic('pencil')}Modifica il ${y}</button>`}</div>
  ${ed ? `<div class="note-box">${ic('info')}<span>Per ogni categoria inserisci costo storico, fondo ammortamento e acquisti dell'anno (dal registro dei beni ammortizzabili del commercialista). Il valore netto va da solo nello stato patrimoniale.</span></div>` : ''}
  <section class="card"><div class="card-h"><h2>${ic('tractor')}Immobilizzazioni ${y}</h2>${bottoniExport(['cesp', 'cespA'], 'Cespiti ' + y)}</div>${tabella('cesp', { title: 'Immobilizzazioni al 31/12/' + y, sheet: 'Cespiti ' + y, cols: [{ k: 'l', h: 'Categoria', fmt: 'text' }, { k: 'c', h: 'Costo storico', fmt: 'eur', html: inp('c') }, { k: 'f', h: 'Fondo ammortamento', fmt: 'eur', html: inp('f') }, { k: 'n', h: 'Valore netto', fmt: 'eur' }, { k: 'a', h: "Acquisti dell'anno", fmt: 'eur', html: inp('a') }], rows, sort: false })}</section>
  <section class="card"><div class="card-h"><h2>Totale immobilizzazioni per anno</h2></div>${tabella('cespA', { title: 'Totale immobilizzazioni per anno', sheet: 'Per anno', cols: [{ k: 'anno', h: 'Anno' }, { k: 'c', h: 'Costo storico', fmt: 'eur' }, { k: 'f', h: 'Fondo ammortamento', fmt: 'eur' }, { k: 'n', h: 'Valore netto', fmt: 'eur' }, { k: 'a', h: 'Acquisti', fmt: 'eur' }], rows: sint, sort: false })}</section>`;
}

/* ---------------- indici ---------------- */
export function vIndici() {
  const anni = anniProspetto(UI.anno); const I = Object.fromEntries(anni.map(y => [y, ind(y)]));
  if (!anni.some(y => calc(y).has.ce)) return nessunDato('gauge', 'Indici non disponibili', 'Gli indici si calcolano dal conto economico e dallo stato patrimoniale: carica i bilancini o il file Excel.');
  const rows = [];
  for (const [sez, voci] of INDICI) { rows.push({ _sez: sez }); for (const [k, l, , f, n] of voci) { const o = { l, nota: n, _cls: ['ebitda', 'ebit', 'utile', 'va', 'pn', 'pfn'].includes(k) ? 'grp' : 'det', fmt: f }; anni.forEach(y => (o[y] = I[y][k])); rows.push(o); } }
  const cell = y => r => esc(fmtVal(r[y], r.fmt));
  const cols = [{ k: 'l', h: 'Indicatore', fmt: 'text' }, ...anni.map(y => ({ k: y, h: String(y), fmt: 'num2', rowFmt: true, html: cell(y), x: r => (r[y] == null ? '' : r[y]) })), { k: 'nota', h: 'Come si calcola', fmt: 'text', html: r => `<span class="sub">${esc(r.nota)}</span>` }];
  return `<div class="grid-2"><section class="card"><div class="card-h"><h2>${ic('chart-line')}EBITDA e utile</h2></div>${linee(anni.map(String), [{ name: 'EBITDA', values: anni.map(y => I[y].ebitda), color: COL.ven }, { name: 'Utile', values: anni.map(y => I[y].utile), color: COL.diff }, { name: 'Contributi PAC/PSR', values: anni.map(y => I[y].contr), color: COL.acq }], { unit: '€' })}</section>
  <section class="card"><div class="card-h"><h2>${ic('percent')}Redditività</h2></div>${linee(anni.map(String), [{ name: 'ROI', values: anni.map(y => I[y].roi), color: COL.ven }, { name: 'ROE', values: anni.map(y => I[y].roe), color: COL.diff }, { name: 'EBITDA margin', values: anni.map(y => I[y].ebitdam), color: COL.acq }], { fmt: v => nf(v * 100, 0) + '%' })}</section></div>
  <section class="card"><div class="card-h"><h2>${ic('gauge')}Indici di bilancio</h2>${bottoniExport(['ind'], 'Indici di bilancio')}</div>${tabella('ind', { title: 'Indici di bilancio', sheet: 'Indici', sub: 'Esercizi ' + anni.join(', '), cols, rows, sort: false, freeze: 1 })}</section>`;
}

/* ---------------- analisi della stalla ---------------- */
const SRC = { stalla: 'dalla stalla', 'registro del latte': 'dal registro del latte', campi: 'dai campi', fatture: 'dalle fatture', 'registro (conferiti)': 'dai conferiti', inserito: 'inserito' };
export function vAnalisi() {
  const anni = anniProspetto(UI.anno, true); const ed = +UI.f.an_edit || 0;
  const T = Object.fromEntries(anni.map(y => [y, datiTecnici(y)])); const P = Object.fromEntries(anni.map(y => [y, parametri(y)]));
  const dRows = DATI.map(([k, l, f, n]) => { const o = { l, nota: n, k, fmt: f }; anni.forEach(y => { o[y] = T[y].val[k]; o['s' + y] = T[y].da[k]; }); return o; });
  const dCell = y => r => {
    if (y === ed) { const man = T[y].man[r.k]; const auto = T[y].auto[r.k]; const v = man !== undefined && man !== null && man !== '' ? (r.fmt === 'pct' ? man * 100 : man) : ''; return `<input class="cell-in" inputmode="decimal" data-act="c-val" data-col="${['ula', 'sau', 'capi'].includes(r.k) ? 'dim' : 'analisi'}" data-campo="${r.k}" data-y="${y}" data-pct="${r.fmt === 'pct' ? 1 : ''}" value="${esc(num2(v))}" placeholder="${auto != null ? esc(num2(auto)) : ''}">`; }
    const s = r['s' + y]; return `${esc(fmtVal(r[y], r.fmt === 'eur' ? 'eur' : r.fmt))}${s && r[y] != null ? `<span class="sub">${esc(SRC[s] || s)}</span>` : ''}`;
  };
  const dCols = [{ k: 'l', h: 'Dato tecnico', fmt: 'text' }, ...anni.map(y => ({ k: y, h: String(y), fmt: 'num1', rowFmt: true, html: dCell(y), x: r => (r[y] == null ? '' : r[y]) })), { k: 'nota', h: 'Note', fmt: 'text', html: r => `<span class="sub">${esc(r.nota)}</span>` }];
  const pRows = []; for (const [sez, voci] of PARAMETRI) { pRows.push({ _sez: sez }); for (const [k, l, , f, n] of voci) { const o = { l, nota: n, fmt: f, _cls: ['costo_l', 'iofc_vg', 'l_vacca', 'prezzo_ce', 'margine_l', 'costo_pieno'].includes(k) ? 'grp' : 'det' }; anni.forEach(y => (o[y] = P[y][k])); pRows.push(o); } }
  const pCols = [{ k: 'l', h: 'Parametro', fmt: 'text' }, ...anni.map(y => ({ k: y, h: String(y), fmt: 'num2', rowFmt: true, html: r => esc(fmtVal(r[y], r.fmt)), x: r => (r[y] == null ? '' : r[y]) })), { k: 'nota', h: 'Come leggerlo', fmt: 'text', html: r => `<span class="sub">${esc(r.nota)}</span>` }];
  const y = UI.anno; const p = P[y] || {};
  const mancano = !T[y].val.vacche ? 'il numero di vacche' : !(T[y].val.latte_prod || T[y].val.latte_ven) ? 'i litri di latte' : !calc(y).has.ce ? 'il conto economico' : '';
  const inCorso = y === new Date().getFullYear() ? `<div class="note-box">${ic('info')}<span>Anno in corso: latte e capi della stalla arrivano fino a oggi, quindi i valori annui (litri per vacca, costi per litro) sono parziali.</span></div>` : '';
  return `${inCorso}${mancano ? `<div class="note-box warn">${ic('circle-alert')}<span>Per il ${y} manca ${mancano}: molti parametri restano vuoti. I dati della stalla e dei campi arrivano da soli se li registri nell'app; altrimenti premi "Modifica" e scrivili.</span></div>` : ''}
  <div class="kpis"><div class="kpi static"><span class="k-l">${ic('milk')}Litri per vacca</span><span class="k-v sm">${p.l_vacca ? nf(p.l_vacca) : '—'}</span><span class="k-s">all'anno, ${y}</span></div><div class="kpi static"><span class="k-l">Prezzo del latte</span><span class="k-v sm">${fmtVal(p.prezzo_ce ?? p.prezzo_ft, 'eur3') || '—'}</span><span class="k-s">al litro</span></div><div class="kpi static"><span class="k-l">Costo di produzione</span><span class="k-v sm ${p.margine_l != null && p.margine_l < 0 ? 't-bad' : ''}">${fmtVal(p.costo_l, 'eur3') || '—'}</span><span class="k-s">al litro, senza contributi</span></div><div class="kpi static"><span class="k-l">IOFC</span><span class="k-v sm">${fmtVal(p.iofc_vg, 'eur2') || '—'}</span><span class="k-s">per vacca al giorno</span></div></div>
  <div class="grid-2"><section class="card"><div class="card-h"><h2>${ic('chart-column')}Prezzo del latte e costi per litro</h2></div>${colonne(anni.map(String), [{ name: 'Prezzo medio', values: anni.map(a => P[a].prezzo_ce ?? P[a].prezzo_ft), color: COL.ven }, { name: 'Costo alimentare', values: anni.map(a => P[a].alim_l), color: 'var(--c-y1)' }, { name: 'Costo di produzione', values: anni.map(a => P[a].costo_l), color: COL.acq }, { name: 'Costo pieno', values: anni.map(a => P[a].costo_pieno), color: 'var(--c-y4)' }], { fmt: v => nf(v, 2), unit: '€/l' })}</section>
  <section class="card"><div class="card-h"><h2>${ic('chart-line')}Margine sul costo alimentare per vacca al giorno</h2></div>${colonne(anni.map(String), [{ name: 'IOFC €/vacca/giorno', values: anni.map(a => P[a].iofc_vg), color: COL.ven }], { fmt: v => nf(v, 1) })}</section></div>
  <section class="card"><div class="card-h"><h2>${ic('cow')}Dati tecnici</h2>${ed ? `<button class="btn sm primary" data-act="chip" data-f="an_edit" data-v="">${ic('check')}Fine modifica</button>` : `<button class="btn sm" data-act="chip" data-f="an_edit" data-v="${y}">${ic('pencil')}Modifica il ${y}</button>`}${bottoniExport(['anD', 'anP'], 'Analisi azienda da latte')}</div>
  ${ed ? `<p class="muted small pad-x">Lascia vuota una cella per usare il valore automatico (scritto in grigio). La percentuale si scrive come numero (es. 2,5).</p>` : ''}${tabella('anD', { title: 'Dati tecnici', sheet: 'Dati tecnici', cols: dCols, rows: dRows, sort: false })}</section>
  <section class="card"><div class="card-h"><h2>${ic('gauge')}Parametri dell'azienda da latte</h2></div>${tabella('anP', { title: "Parametri dell'azienda da latte", sheet: 'Parametri', sub: 'Esercizi ' + anni.join(', '), cols: pCols, rows: pRows, sort: false, note: ['I valori di riferimento citati nelle note sono indicativi: il confronto più utile è con gli anni precedenti della tua azienda o con i dati dell\'associazione allevatori.'] })}</section>`;
}

/* ---------------- IVA ---------------- */
export function vIva() {
  const anni = S.bilanci.filter(b => b.iva).map(b => +b.id).filter(Boolean).sort((a, b) => a - b).slice(-6);
  if (!anni.length) return nessunDato('percent', 'Nessuna dichiarazione IVA', 'Carica il file telematico della dichiarazione IVA o il PDF del modello: i quadri VE, VF e VL vengono letti da soli.');
  const V = Object.fromEntries(anni.map(y => { const v = Object.assign({}, bilancio(y).iva.voci || {}); v.saldo = v.vl1 == null && v.vl2 == null ? null : N(v.vl1) - N(v.vl2); return [y, v]; }));
  const rows = []; let sez = '';
  const NOMI = { VE: 'OPERAZIONI ATTIVE (QUADRO VE)', VF: 'OPERAZIONI PASSIVE (QUADRO VF)', VL: 'LIQUIDAZIONE ANNUALE (QUADRO VL)' };
  for (const x of IVA_VOCI) { if (x.sez !== sez) { sez = x.sez; rows.push({ _sez: NOMI[sez] }); } const o = { q: x.sez, l: x.l, n: x.n || '', _cls: x.tot ? 'grp' : 'det', _ind: x.sub ? 1 : 0 }; anni.forEach(y => (o[y] = V[y][x.k])); rows.push(o); }
  const y = anni.includes(UI.anno) ? UI.anno : anni[anni.length - 1]; const iv = bilancio(y).iva;
  const righi = Object.entries(iv.righi || {}).sort((a, b) => a[0].localeCompare(b[0], 'it', { numeric: true })).map(([k, v]) => ({ rigo: k.replace(':', ' col. '), v }));
  return `<section class="card"><div class="card-h"><h2>${ic('percent')}Dichiarazioni IVA</h2><span class="muted small">Colonne per anno d'imposta: il Modello IVA presentato l'anno dopo</span>${bottoniExport(['iva', 'ivaR'], 'Dichiarazioni IVA')}</div>${tabella('iva', { title: 'Dati delle dichiarazioni IVA', sheet: 'IVA', cols: [{ k: 'q', h: 'Quadro' }, { k: 'l', h: 'Descrizione', fmt: 'text' }, ...anni.map(a => ({ k: a, h: `${a} (mod. ${a + 1})`, fmt: 'eur' })), { k: 'n', h: 'Note', fmt: 'text', html: r => `<span class="sub">${esc(r.n)}</span>` }], rows, sort: false })}</section>
  <div class="grid-2"><section class="card"><div class="card-h"><h2>Controlli ${y}</h2><span class="muted small">${esc(iv.fonte || '')} · ${esc(iv.file || '')}</span></div><div class="pad-x">${(iv.controlli || []).length ? iv.controlli.map(c => `<div class="esito ${c.esito === 'OK' ? 'ok' : 'ko'}">${ic(c.esito === 'OK' ? 'circle-check' : 'triangle-alert')}${esc(c.d)}: ${esc(c.esito)}${c.esito === 'DIFFERENZA' ? ` (${fmtVal(c.a, 'eur')} / ${fmtVal(c.b, 'eur')})` : ''}</div>`).join('') : '<p class="muted">Nessun controllo disponibile.</p>'}${(iv.avvisi || []).map(a => `<p class="esito wa">${ic('circle-alert')}${esc(a)}</p>`).join('')}</div></section>
  <section class="card"><div class="card-h"><h2>Righi letti ${y}</h2></div>${righi.length ? tabella('ivaR', { title: 'Righi del modello IVA ' + y, sheet: 'Righi ' + y, cols: [{ k: 'rigo', h: 'Rigo' }, { k: 'v', h: 'Valore', fmt: 'eur2' }], rows: righi, sort: false }) : '<div class="empty slim">Dati importati dal file Excel: righi non disponibili.</div>'}</section></div>`;
}

/* ---------------- controlli ---------------- */
export function vControlli() {
  const anni = anniProspetto(UI.anno, true); const C = Object.fromEntries(anni.map(y => [y, calc(y)]));
  const toll = 0.15; const rows = [];
  const add = (sez, d, f, nota, tipo = 'zero') => { rows.push({ _sez: sez }); };
  const riga = (d, vals, nota, valuta) => { const o = { d, nota }; anni.forEach(y => { const v = vals(y); o[y] = v; o['e' + y] = valuta(v, y); }); rows.push(o); };
  const zero = v => (v == null ? '' : Math.abs(v) <= 1 ? 'OK' : 'ERRORE'); const scost = v => (v == null ? '' : Math.abs(v) <= toll ? 'OK' : 'Verificare');
  const pct = (a, b) => (!b ? (!a ? null : 1) : (a - b) / b);
  add('1. QUADRATURA DEI PROSPETTI');
  riga('Totale attivo − totale passivo e patrimonio netto', y => (C[y].has.sp ? C[y].sp[85] : null), 'Deve essere zero (tolleranza 1 €)', zero);
  riga('Categorie di cespiti con valore netto negativo', y => (C[y].has.cesp ? Object.entries(C[y].cesp).filter(([r, v]) => +r !== 11 && +r !== 22 && +r !== 23 && v.n < 0).length : null), 'Il fondo non può superare il costo storico', v => (v == null ? '' : v ? 'ERRORE' : 'OK'));
  add('2. COERENZA TRA CONTO ECONOMICO E STATO PATRIMONIALE');
  riga('Rimanenze di materie prime: variazione SP (C.I.1) + voce B.11 del CE', y => { const p = calc(y - 1); return C[y].has.sp && p.has.sp ? (C[y].sp[29] - p.sp[29]) + C[y].ce[69] : null; }, 'Deve essere zero; serve lo stato patrimoniale dell\'anno prima', zero);
  riga('Rimanenze di prodotti: variazione SP (C.I.2–C.I.4) − (A.2 + A.3)', y => { const p = calc(y - 1); return C[y].has.sp && p.has.sp ? (C[y].sp[30] + C[y].sp[31] + C[y].sp[32] - p.sp[30] - p.sp[31] - p.sp[32]) - (C[y].ce[16] + C[y].ce[17]) : null; }, 'Deve essere zero', zero);
  add('3. RICONCILIAZIONE CON LA DICHIARAZIONE IVA (scostamento massimo 15%)');
  const iv = y => ((bilancio(y) || {}).iva || {}).voci || null;
  riga("Ricavi (CE A.1) rispetto al volume d'affari (VE50)", y => (iv(y) && C[y].has.ce ? pct(C[y].ce[7], N(iv(y).ve50)) : null), "Il volume d'affari comprende anche cessioni di cespiti e operazioni non di competenza", scost);
  riga('Acquisti e servizi (CE B.6+B.7+B.8) rispetto agli acquisti IVA senza beni ammortizzabili', y => (iv(y) && C[y].has.ce ? pct(C[y].ce[29] + C[y].ce[38] + C[y].ce[51], N(iv(y).vf_imp) - N(iv(y).vf_amm)) : null), 'Il CE è per competenza e comprende costi senza IVA (affitti, assicurazioni…)', scost);
  riga('Acquisti di cespiti rispetto ai beni ammortizzabili (VF)', y => (iv(y) && C[y].has.cesp ? pct(C[y].cesp[23].a, N(iv(y).vf_amm)) : null), 'Dovrebbero coincidere, salvo beni comprati da privati o in leasing', scost);
  add('4. FATTURE CARICATE RISPETTO AL CONTO ECONOMICO');
  const fx = (y, t) => { const fs = fatture().filter(f => f.anno === y && f.tipo === t); return fs.length ? fs.reduce((s, f) => s + N(f.imponibile), 0) : null; };
  riga('Vendite da fatture rispetto ai ricavi (CE A.1)', y => (fx(y, 'Vendita') != null && C[y].has.ce ? pct(fx(y, 'Vendita'), C[y].ce[7]) : null), 'Se molto più basso, mancano fatture di vendita', scost);
  riga('Acquisti da fatture rispetto a B.6 + B.7 + B.8', y => (fx(y, 'Acquisto') != null && C[y].has.ce ? pct(fx(y, 'Acquisto'), C[y].ce[29] + C[y].ce[38] + C[y].ce[51]) : null), 'Le fatture comprendono anche gli investimenti; il CE alcuni costi senza fattura', scost);
  const rowsC = rows.map(r => r._sez !== undefined ? r : Object.assign({}, r, Object.fromEntries(anni.map(y => ['v' + y, r[y]]))));
  const cell = y => r => { const e = r['e' + y]; const v = r[y]; if (v == null) return '<span class="muted">—</span>'; const isPct = /rispetto/.test(r.d); return `<span class="esito ${e === 'OK' ? 'ok' : e === 'ERRORE' ? 'ko' : 'wa'}">${ic(e === 'OK' ? 'circle-check' : 'triangle-alert')}${esc(isPct ? fmtVal(v, 'pct') : fmtVal(v, Number.isInteger(v) && Math.abs(v) < 50 ? 'int' : 'eur'))}</span>`; };
  const daVer = fatture().filter(f => !String(f.controllo || '').startsWith('OK'));
  const bil = anni.map(y => [y, (bilancio(y) || {}).bilancino]).filter(([, b]) => b && b.controlli);
  return `<section class="card"><div class="card-h"><h2>${ic('shield-check')}Controlli di coerenza</h2>${bottoniExport(['ctrl'], 'Controlli')}</div>${tabella('ctrl', { title: 'Controlli di coerenza', sheet: 'Controlli', cols: [{ k: 'd', h: 'Verifica', fmt: 'text' }, ...anni.map(y => ({ k: y, h: String(y), fmt: 'num2', rowFmt: true, html: cell(y), x: r => (r[y] == null ? '' : r[y]) })), { k: 'nota', h: 'Note', fmt: 'text', html: r => `<span class="sub">${esc(r.nota)}</span>` }], rows: rowsC, sort: false, note: ['La riconciliazione con l\'IVA è indicativa: le differenze possono dipendere da competenza, costi senza IVA, cessioni di beni.'] })}</section>
  <div class="grid-2"><section class="card"><div class="card-h"><h2>${ic('receipt')}Fatture da verificare</h2><span class="count">${daVer.length}</span></div>${daVer.length ? `<div class="list">${daVer.slice(0, 15).map(f => `<button class="row" data-act="c-fatt" data-id="${f.id}"><span class="r-icon">${ic('triangle-alert')}</span><span class="r-main"><b>${esc(f.controparte)} n. ${esc(f.numero)}</b><span>${fd(f.data)} · ${esc(f.controllo)}</span></span>${ic('chevron-right', 'chev')}</button>`).join('')}</div>` : `<div class="allgood">${ic('circle-check', 'big')}<b>Tutte le fatture quadrano</b><span>La somma delle righe coincide con l'imponibile.</span></div>`}</section>
  <section class="card"><div class="card-h"><h2>${ic('list-checks')}Bilancini caricati</h2></div><div class="pad-x">${bil.length ? bil.map(([y, b]) => `<p><b>${y}</b> · ${esc(b.file || '')}</p>${b.controlli.map(c => `<div class="esito ${c.esito === 'OK' ? 'ok' : c.esito === 'DIFFERENZA' ? 'ko' : 'wa'}">${ic(c.esito === 'OK' ? 'circle-check' : 'triangle-alert')}${esc(c.d)}: ${esc(c.esito)}</div>`).join('')}`).join('') : '<p class="muted">Nessun bilancino caricato per questi anni.</p>'}</div></section></div>`;
}
