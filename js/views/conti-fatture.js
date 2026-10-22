// Conti: fatture, controparti, prodotti, categorie, andamento mensile, latte venduto
import { S, UI, D } from '../state.js';
import { esc, nf, fd, N, yearOf } from '../util.js';
import { ic } from '../icons.js';
import { chip, empty, openSheet } from '../ui.js';
import { fatture, righe, regole, anniFatture, DA_CLASSIFICARE, CAT_LATTE, CAT_PREMI, CAT_RETTIFICA } from '../conti/dati.js';
import { categorie } from '../conti/regole.js';
import { tabella, bottoniExport, fmtVal } from '../conti/tabelle.js';
import { colonne, linee, barre, torta, PALETTE, COL, coloreAnno } from '../conti/grafici.js';
import { statoPagamento } from '../conti/banca.js';

export const MESI = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];
const MESI_L = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];
const tipoF = () => UI.f.cf_tipo || '';
const tipoNome = t => (t === 'Vendita' ? 'Vendite' : t === 'Acquisto' ? 'Acquisti' : 'Tutte');
export const ok = f => String(f.controllo || '').startsWith('OK');
const r2 = v => Math.round(v * 100) / 100;

export function miniTabs(f, items, cur) { return `<div class="mini-tabs" role="group">${items.map(([v, l]) => `<button data-act="chip" data-f="${f}" data-v="${esc(v)}" aria-pressed="${cur === v}">${esc(l)}</button>`).join('')}</div>`; }
export const datalistCat = () => ['Acquisto', 'Vendita'].map(t => { const s = new Set(categorie(regole(), t)); righe().filter(r => r.tipo === t && !r.rett).forEach(r => s.add(r.categoria)); s.add(DA_CLASSIFICARE); return `<datalist id="dlcat-${t}">${[...s].sort((a, b) => a.localeCompare(b, 'it')).map(c => `<option value="${esc(c)}">`).join('')}</datalist>`; }).join('');

/* ---------------- fatture ---------------- */
function filtra() {
  const t = tipoF(), q = (UI.f.cf_q || '').toLowerCase().trim(), cp = UI.f.cf_cp || '', st = UI.f.cf_stato || '', cat = UI.f.cf_cat || '', m = +(UI.f.cf_mese || 0);
  const tutte = UI.f.cf_anni === 'tutti';
  let fs = fatture().filter(f => (tutte || f.anno === UI.anno) && (!t || f.tipo === t) && (!cp || f.controparte === cp) && (!m || f.mese === m));
  if (q) fs = fs.filter(f => [f.controparte, f.numero, f.piva, f.file].some(x => String(x || '').toLowerCase().includes(q)) || (f.righe || []).some(r => String(r.descrizione || '').toLowerCase().includes(q) || String(r.codice || '').toLowerCase().includes(q)));
  if (st === 'verifica') fs = fs.filter(f => !ok(f));
  if (st === 'daclass') fs = fs.filter(f => (f.righe || []).some(r => r.categoria === DA_CLASSIFICARE));
  if (cat) fs = fs.filter(f => (f.righe || []).some(r => r.categoria === cat));
  if (st === 'nonpagate') fs = fs.filter(f => ['da pagare', 'scaduta', 'in parte'].includes(statoPagamento(f).stato));
  if (st === 'pagate') fs = fs.filter(f => ['pagata', 'in parte'].includes(statoPagamento(f).stato));
  return fs;
}
export function vFatture() {
  if (!S.fatture.length) return `<section class="card">${empty('receipt', 'Nessuna fattura caricata', 'Carica le fatture elettroniche (XML o P7M scaricati dal cassetto fiscale, anche in un unico ZIP) oppure i PDF: acquisti e vendite vengono riconosciuti da soli.', `<button class="btn primary" data-act="sub" data-tab="conti" data-sec="conti" data-sub="importa">${ic('file-up')}Carica documenti</button>`)}</section>`;
  const fs = filtra(); const vista = UI.f.cf_vista || 'fatture';
  const cps = [...new Set(fatture().filter(f => !tipoF() || f.tipo === tipoF()).map(f => f.controparte))].sort((a, b) => a.localeCompare(b, 'it'));
  const cats = [...new Set(righe().filter(r => !tipoF() || r.tipo === tipoF()).map(r => r.categoria))].sort((a, b) => a.localeCompare(b, 'it'));
  const tot = k => r2(fs.reduce((t, f) => t + N(f[k]), 0));
  const daVer = fatture().filter(f => !ok(f)).length, daCl = fatture().filter(f => (f.righe || []).some(r => r.categoria === DA_CLASSIFICARE)).length;
  const filtri = `<div class="toolbar">${miniTabs('cf_tipo', [['', 'Tutte'], ['Acquisto', 'Acquisti'], ['Vendita', 'Vendite']], tipoF())}
    <div class="search">${ic('search')}<input class="inp" id="cfq" data-filter="cf_q" placeholder="Controparte, numero, prodotto" value="${esc(UI.f.cf_q || '')}" autocomplete="off"></div>
    <select class="inp" data-filter="cf_cp" aria-label="Controparte"><option value="">Tutte le controparti</option>${cps.map(c => `<option${c === UI.f.cf_cp ? ' selected' : ''}>${esc(c)}</option>`).join('')}</select>
    <select class="inp" data-filter="cf_cat" aria-label="Categoria"><option value="">Tutte le categorie</option>${cats.map(c => `<option${c === UI.f.cf_cat ? ' selected' : ''}>${esc(c)}</option>`).join('')}</select>
    <select class="inp" data-filter="cf_mese" aria-label="Mese"><option value="">Tutti i mesi</option>${MESI_L.map((m, i) => `<option value="${i + 1}"${+UI.f.cf_mese === i + 1 ? ' selected' : ''}>${m}</option>`).join('')}</select></div>
  <div class="chipbar"><button data-act="chip" data-f="cf_anni" data-v="${UI.f.cf_anni === 'tutti' ? '' : 'tutti'}" aria-pressed="${UI.f.cf_anni === 'tutti'}">Tutti gli anni</button><button data-act="chip" data-f="cf_stato" data-v="" aria-pressed="${!UI.f.cf_stato}">Tutte</button><button data-act="chip" data-f="cf_stato" data-v="verifica" aria-pressed="${UI.f.cf_stato === 'verifica'}">Da verificare<span class="n">${daVer}</span></button><button data-act="chip" data-f="cf_stato" data-v="daclass" aria-pressed="${UI.f.cf_stato === 'daclass'}">Righe da classificare<span class="n">${daCl}</span></button>${S.fatture.some(f => (f.pagamentiBanca || []).length) ? `<button data-act="chip" data-f="cf_stato" data-v="pagate" aria-pressed="${UI.f.cf_stato === 'pagate'}">${tipoF() === 'Vendita' ? 'Incassate' : 'Pagate'} in banca</button><button data-act="chip" data-f="cf_stato" data-v="nonpagate" aria-pressed="${UI.f.cf_stato === 'nonpagate'}">Senza ${tipoF() === 'Vendita' ? 'incasso' : 'pagamento'} in banca</button>` : ''}${UI.f.cf_cp || UI.f.cf_cat || UI.f.cf_q || UI.f.cf_mese ? `<button data-act="c-cfreset">${ic('x')}Togli i filtri</button>` : ''}</div>`;
  const kp = `<div class="kpis"><div class="kpi static"><span class="k-l">Fatture</span><span class="k-v sm">${nf(fs.length)}</span><span class="k-s">${UI.f.cf_anni === 'tutti' ? 'tutti gli anni' : UI.anno}</span></div><div class="kpi static"><span class="k-l">Imponibile</span><span class="k-v sm">${fmtVal(tot('imponibile'), 'eur')}</span><span class="k-s">IVA esclusa</span></div><div class="kpi static"><span class="k-l">IVA</span><span class="k-v sm">${fmtVal(tot('iva'), 'eur')}</span><span class="k-s">&nbsp;</span></div><div class="kpi static"><span class="k-l">Totale documenti</span><span class="k-v sm">${fmtVal(tot('totale'), 'eur')}</span><span class="k-s">IVA compresa</span></div></div>`;
  let corpo;
  if (vista === 'righe') corpo = registroRighe(fs);
  else {
    const LIM = UI.f.cf_lim || 200;
    corpo = tabella('fatt', {
      title: 'Registro delle fatture ' + (UI.f.cf_anni === 'tutti' ? '' : UI.anno), sheet: 'Fatture', sub: tipoNome(tipoF()),
      cols: [{ k: 'data', h: 'Data', fmt: 'date' }, { k: 'tipo', h: 'Tipo', cls: 'nw' }, { k: 'controparte', h: 'Controparte', cls: 'w', html: f => `${esc(f.controparte)}<span class="sub">${esc(f.piva || '')}</span>` }, { k: 'numero', h: 'Numero', cls: 'nw' }, { k: 'tipoDoc', h: 'Doc.' },
        { k: 'imponibile', h: 'Imponibile', fmt: 'eur2' }, { k: 'iva', h: 'IVA', fmt: 'eur2' }, { k: 'totale', h: 'Totale', fmt: 'eur2' }, { k: 'statoPag', h: 'In banca', html: f => statoHtml(f), x: f => f.statoPag }, { k: 'nr', h: 'Righe', fmt: 'int' }, { k: 'controllo', h: 'Controllo', html: f => ok(f) ? `<span class="esito ok">${ic('circle-check')}OK</span>` : `<span class="esito ko">${ic('triangle-alert')}${esc(f.controllo)}</span>` }, { k: 'pagamento', h: 'Pagamento', cls: 'clip' }, { k: 'scadenza', h: 'Scadenza', fmt: 'date' }, { k: 'file', h: 'File', cls: 'clip', html: f => `<span class="sub">${esc(f.file || '')}</span>` }],
      rows: fs.slice(0, UI.f.cf_tutte ? 1e9 : LIM).map(f => { const st = statoPagamento(f); return Object.assign({ nr: (f.righe || []).length, _cls: 'click', statoPag: st.stato === 'pagata' ? 'pagata il ' + fd((f.pagamentiBanca || []).map(p => p.data).sort().pop()) : st.stato === 'in parte' ? `in parte (${fmtVal(st.pagato, 'eur2')})` : '' }, f); }),
      tot: { data: 'Totale', imponibile: tot('imponibile'), iva: tot('iva'), totale: tot('totale'), nr: fs.reduce((t, f) => t + (f.righe || []).length, 0) },
      rowAttr: f => `data-act="c-fatt" data-id="${f.id}"`, freeze: 1,
    }) + (fs.length > LIM && !UI.f.cf_tutte ? `<button class="more-btn" data-act="chip" data-f="cf_tutte" data-v="1">Mostra tutte le ${fs.length} fatture</button>` : '');
  }
  return `${filtri}${kp}<section class="card"><div class="card-h"><div>${miniTabs('cf_vista', [['fatture', 'Fatture'], ['righe', 'Righe e prodotti']], vista)}</div>${bottoniExport([vista === 'righe' ? 'righe' : 'fatt'], vista === 'righe' ? 'Righe delle fatture ' + UI.anno : 'Fatture ' + UI.anno)}</div>${corpo}</section>${datalistCat()}`;
}

/** Registro delle righe a blocchi: ogni fattura un blocco, dati della fattura e DDT in celle unite. */
function registroRighe(fs) {
  const cat = UI.f.cf_cat || '';
  const flat = []; let html = ''; let b = 0; let n = 0; const LIM = UI.f.cf_tutte ? 1e9 : 120;
  const tutte = righe();
  const per = new Map(); tutte.forEach(r => { if (!per.has(r.fid)) per.set(r.fid, []); per.get(r.fid).push(r); });
  for (const f of fs) {
    let rs = per.get(f.id) || []; if (cat) rs = rs.filter(r => r.categoria === cat); if (!rs.length) continue;
    rs.forEach(r => flat.push(Object.assign({ pn: r.quantita ? r.importo / r.quantita : null }, r)));
    if (n++ >= LIM) continue;
    const gruppiDdt = []; rs.forEach((r, i) => { const g = gruppiDdt[gruppiDdt.length - 1]; if (g && (g.ddt || '') === (r.ddt || '')) g.n++; else gruppiDdt.push({ ddt: r.ddt || '', i, n: 1 }); });
    const inizioDdt = new Map(gruppiDdt.map(g => [g.i, g])); const fineDdt = new Set(gruppiDdt.map(g => g.i + g.n - 1));
    rs.forEach((r, i) => {
      const last = i === rs.length - 1; const cls = `b${b % 2}${last ? ' end' : fineDdt.has(i) ? ' dend' : ''}`;
      const head = i === 0 ? `<td class="h" rowspan="${rs.length}">${fd(f.data)}</td><td class="h" rowspan="${rs.length}">${esc(f.controparte)}<small>${esc(f.tipo)} · ${esc(f.piva || '')}</small></td><td class="h" rowspan="${rs.length}">${esc(f.numero)}<small>${esc(f.tipoDoc || '')}</small></td>` : '';
      const g = inizioDdt.get(i); const ddt = g ? `<td class="h rd" rowspan="${g.n}">${esc(g.ddt) || '<span class="muted">—</span>'}</td>` : '';
      const catCell = r.rett ? `<td class="t rett">${esc(r.categoria)}</td>` : `<td class="t"><input class="cell-in cell-cat" list="dlcat-${r.tipo}" value="${esc(r.categoria)}" data-act="c-cat" data-fid="${r.fid}" data-i="${r.i}" aria-label="Categoria"></td>`;
      html += `<tr class="${cls}">${head}${ddt}<td class="t">${esc(r.codice || '')}</td><td class="t${r.rett ? ' rett' : ''}">${esc(r.descrizione)}</td>${catCell}<td class="n">${fmtVal(r.quantita, 'qta')}</td><td class="t">${esc(r.um || '')}</td><td class="n">${fmtVal(r.prezzo, 'eur4')}</td><td class="t">${esc(r.sconto || '')}</td><td class="n">${r.aliquota !== '' && r.aliquota != null ? esc(String(r.aliquota)) : ''}</td><td class="n${r.importo < 0 ? ' neg' : ''}">${fmtVal(r.importo, 'eur2')}</td><td class="n">${fmtVal(r.quantita ? r.importo / r.quantita : null, 'eur4')}</td></tr>`;
    });
    b++;
  }
  tabella('righe', { title: 'Righe delle fatture', sheet: 'Righe', sub: tipoNome(tipoF()), cols: [{ k: 'data', h: 'Data', fmt: 'date' }, { k: 'tipo', h: 'Tipo' }, { k: 'controparte', h: 'Controparte' }, { k: 'piva', h: 'P.IVA' }, { k: 'numero', h: 'N. fattura' }, { k: 'ddt', h: 'DDT' }, { k: 'codice', h: 'Codice' }, { k: 'descrizione', h: 'Descrizione', xw: 50 }, { k: 'categoria', h: 'Categoria' }, { k: 'quantita', h: 'Quantità', fmt: 'qta' }, { k: 'um', h: 'UM' }, { k: 'prezzo', h: 'Prezzo unitario', fmt: 'eur4' }, { k: 'sconto', h: 'Sconto' }, { k: 'aliquota', h: '% IVA' }, { k: 'importo', h: 'Importo', fmt: 'eur2' }, { k: 'pn', h: 'Prezzo netto unitario', fmt: 'eur4' }], rows: flat, tot: { data: 'Totale', importo: r2(flat.reduce((t, r) => t + N(r.importo), 0)) }, sort: false });
  if (!flat.length) return '<div class="empty slim">Nessuna riga con questi filtri.</div>';
  return `<div class="tablewrap etab blk"><table><thead><tr><th class="t">Data</th><th class="t">Controparte</th><th class="t">N. fattura</th><th class="t">DDT</th><th class="t">Codice</th><th class="t">Descrizione</th><th class="t">Categoria</th><th class="n">Quantità</th><th class="t">UM</th><th class="n">Prezzo</th><th class="t">Sconto</th><th class="n">% IVA</th><th class="n">Importo</th><th class="n">Prezzo netto</th></tr></thead><tbody>${html}</tbody><tfoot><tr class="tot"><td colspan="12">Totale righe (${flat.length})</td><td class="n">${fmtVal(r2(flat.reduce((t, r) => t + N(r.importo), 0)), 'eur2')}</td><td></td></tr></tfoot></table></div>${n > LIM ? `<button class="more-btn" data-act="chip" data-f="cf_tutte" data-v="1">Mostra tutte le ${n} fatture</button>` : ''}`;
}

/** Scheda di una fattura con le righe e le categorie modificabili. */
export function schedaFattura(id) {
  const f = S.fatture.find(x => x.id === id); if (!f) return;
  const rs = righe().filter(r => r.fid === id);
  const fact = (l, v) => `<div><dt>${esc(l)}</dt><dd>${v}</dd></div>`;
  openSheet(`${f.tipo === 'Vendita' ? 'Fattura di vendita' : 'Fattura di acquisto'} n. ${f.numero}`, `
  <dl class="inv-head">${fact(f.tipo === 'Vendita' ? 'Cliente' : 'Fornitore', esc(f.controparte))}${fact('P.IVA', esc(f.piva || '—'))}${fact('Data', fd(f.data))}${fact('Tipo documento', esc(f.tipoDoc || '—'))}${fact('Imponibile', fmtVal(f.imponibile, 'eur2'))}${fact('IVA', fmtVal(f.iva, 'eur2'))}${fact('Totale', fmtVal(f.totale, 'eur2'))}${fact('Pagamento', esc(f.pagamento || '—'))}${fact('Scadenza', fd(f.scadenza))}${fact('Controllo', ok(f) ? `<span class="esito ok">${ic('circle-check')}OK</span>` : `<span class="esito ko">${esc(f.controllo)}</span>`)}${fact('File', esc(f.file || '—'))}${fact('Letta da', esc(f.fonte === 'xml' ? 'XML fattura elettronica' : f.fonte === 'pdf' ? 'PDF' : f.fonte === 'excel' ? 'file Excel' : '—'))}</dl>
  <div class="tablewrap etab blk"><table><thead><tr><th class="t">DDT</th><th class="t">Codice</th><th class="t">Descrizione</th><th class="t">Categoria</th><th class="n">Quantità</th><th class="t">UM</th><th class="n">Prezzo</th><th class="t">Sconto</th><th class="n">% IVA</th><th class="n">Importo</th></tr></thead><tbody>${rs.map(r => `<tr><td class="t">${esc(r.ddt || '')}</td><td class="t">${esc(r.codice || '')}</td><td class="t${r.rett ? ' rett' : ''}">${esc(r.descrizione)}</td><td class="t">${r.rett ? esc(r.categoria) : `<input class="cell-in cell-cat" list="dlcat-${f.tipo}" value="${esc(r.categoria)}" data-act="c-cat" data-fid="${f.id}" data-i="${r.i}" data-sheet="1" aria-label="Categoria">`}</td><td class="n">${fmtVal(r.quantita, 'qta')}</td><td class="t">${esc(r.um || '')}</td><td class="n">${fmtVal(r.prezzo, 'eur4')}</td><td class="t">${esc(r.sconto || '')}</td><td class="n">${esc(String(r.aliquota ?? ''))}</td><td class="n">${fmtVal(r.importo, 'eur2')}</td></tr>`).join('')}</tbody></table></div>
  ${(f.pagamentiBanca || []).length ? `<h3 class="sheet-h">${f.tipo === 'Vendita' ? 'Incassi' : 'Pagamenti'} dall'estratto conto</h3><div class="list flat">${f.pagamentiBanca.map(p => `<div class="row"><span class="r-icon">${ic('landmark')}</span><span class="r-main"><b>${fd(p.data)} · ${fmtVal(p.importo, 'eur2')}</b><span>${esc(p.descrizione || '')}</span></span><button class="btn sm ghost" data-act="c-fpTogli" data-id="${f.id}" data-mov="${esc(p.mov)}">${ic('x')}Togli</button></div>`).join('')}</div><p class="muted small">${(s => s.stato === 'pagata' ? (f.tipo === 'Vendita' ? 'Incassata' : 'Pagata') + ' per intero.' : 'Restano ' + fmtVal(s.residuo, 'eur2') + '.')(statoPagamento(f))}</p>` : ''}
  <div id="catHint"></div>${datalistCat()}
  <p class="muted small">La categoria che scegli qui resta anche se rileggi la fattura. Per correggere tutte le righe simili usa le <button class="linkbtn" data-act="sub" data-tab="conti" data-sec="conti" data-sub="regole">regole delle categorie</button>.</p>
  <div class="factions"><button class="btn ghost danger" data-act="c-delfatt" data-id="${f.id}">${ic('trash-2')}Elimina fattura</button><span class="sp"></span><button class="btn" data-act="close">Chiudi</button></div>`, { wide: true });
}

function statoHtml(f) {
  const st = statoPagamento(f); if (!(f.pagamentiBanca || []).length) return '';
  const ult = (f.pagamentiBanca || []).map(p => p.data).sort().pop();
  return st.stato === 'pagata' ? `<span class="esito ok">${ic('circle-check')}${fd(ult)}</span>` : `<span class="esito wa">${ic('circle-alert')}${fmtVal(st.pagato, 'eur2')}</span>`;
}

/* ---------------- controparti ---------------- */
export function vControparti(tipo) {
  const fs = fatture().filter(f => f.tipo === tipo); const anni = anniFatture().filter(y => fs.some(f => f.anno === y));
  if (!fs.length) return `<section class="card">${empty(tipo === 'Vendita' ? 'handshake' : 'truck', tipo === 'Vendita' ? 'Nessuna fattura di vendita' : 'Nessuna fattura di acquisto', 'Carica le fatture per vedere qui il riepilogo per ' + (tipo === 'Vendita' ? 'cliente' : 'fornitore') + '.')}</section>`;
  const per = new Map();
  for (const f of fs) { const k = f.controparte || '(senza nome)'; const o = per.get(k) || { controparte: k, piva: f.piva, n: 0, ultima: '' }; o[f.anno] = (o[f.anno] || 0) + N(f.imponibile); o.n++; o.tot = (o.tot || 0) + N(f.imponibile); if ((f.data || '') > o.ultima) o.ultima = f.data; per.set(k, o); }
  const rows = [...per.values()].sort((a, b) => N(b[UI.anno]) - N(a[UI.anno]) || b.tot - a.tot);
  const totY = UI.anno in Object.fromEntries(anni.map(a => [a, 1])) ? rows.reduce((t, r) => t + N(r[UI.anno]), 0) : 0;
  rows.forEach(r => { r.quota = totY ? N(r[UI.anno]) / totY : null; r._cls = 'click'; });
  const tot = { controparte: 'Totale', n: fs.length, tot: rows.reduce((t, r) => t + r.tot, 0) }; anni.forEach(y => (tot[y] = rows.reduce((t, r) => t + N(r[y]), 0)));
  const top = rows.filter(r => N(r[UI.anno])).slice(0, 10);
  const nome = tipo === 'Vendita' ? 'Clienti' : 'Fornitori';
  return `<div class="grid-2"><section class="card"><div class="card-h"><h2>${ic(tipo === 'Vendita' ? 'handshake' : 'truck')}Primi 10 ${nome.toLowerCase()} del ${UI.anno}</h2></div>${barre(top.map(r => ({ label: r.controparte, v: N(r[UI.anno]), sub: r.quota != null ? nf(r.quota * 100, 1) + '%' : '', act: ` data-act="c-goCp" data-cp="${esc(r.controparte)}" data-tipo="${tipo}"` })), { fmt: v => fmtVal(v, 'eur') })}</section>
  <section class="card"><div class="card-h"><h2>${ic('chart-column')}Andamento per anno</h2></div>${colonne(anni.map(String), [{ name: tipo === 'Vendita' ? 'Vendite' : 'Acquisti', values: anni.map(y => tot[y]), color: tipo === 'Vendita' ? COL.ven : COL.acq }])}</section></div>
  <section class="card"><div class="card-h"><h2>${nome} per anno</h2>${bottoniExport(['cp'], nome)}</div>${tabella('cp', { title: nome + ' – imponibile per anno', sheet: nome, cols: [{ k: 'controparte', h: tipo === 'Vendita' ? 'Cliente' : 'Fornitore', html: r => `${esc(r.controparte)}<span class="sub">${esc(r.piva || '')}</span>` }, { k: 'piva', h: 'P.IVA', export: true, html: r => esc(r.piva || '') }, ...anni.map(y => ({ k: y, h: String(y), fmt: 'eur' })), { k: 'tot', h: 'Totale', fmt: 'eur' }, { k: 'quota', h: '% ' + UI.anno, fmt: 'pct' }, { k: 'n', h: 'N. fatture', fmt: 'int' }, { k: 'ultima', h: 'Ultima fattura', fmt: 'date' }].filter(c => c.k !== 'piva'), rows, tot, rowAttr: r => `data-act="c-goCp" data-cp="${esc(r.controparte)}" data-tipo="${tipo}"`, freeze: 1 })}</section>`;
}

/* ---------------- prodotti ---------------- */
const chiaveProd = r => r.piva + '|' + (String(r.codice || '').trim() || String(r.descrizione || '').toUpperCase().replace(/\s+/g, ' ').trim().slice(0, 60));
export function prodotti(tipo, anno) {
  const rs = righe().filter(r => !r.rett && r.tipo === tipo && (anno === 'tutti' || r.anno === anno));
  const per = new Map();
  for (const r of [...rs].sort((a, b) => (a.data || '').localeCompare(b.data || ''))) {
    const k = chiaveProd(r); const o = per.get(k) || { key: k, descrizione: r.descrizione, codice: r.codice, controparte: r.controparte, categoria: r.categoria, n: 0, qta: 0, importo: 0, um: r.um, prezzi: [] };
    o.n++; o.qta += N(r.quantita); o.importo += N(r.importo); o.categoria = r.categoria; o.descrizione = r.descrizione || o.descrizione;
    if (r.quantita && r.importo) o.prezzi.push({ d: r.data, p: r.importo / r.quantita, q: r.quantita });
    per.set(k, o);
  }
  return [...per.values()].map(o => { const ps = o.prezzi.map(x => x.p); return Object.assign(o, { medio: o.qta ? o.importo / o.qta : null, min: ps.length ? Math.min(...ps) : null, max: ps.length ? Math.max(...ps) : null, ultimo: ps.length ? ps[ps.length - 1] : null, var: ps.length > 1 && ps[0] ? ps[ps.length - 1] / ps[0] - 1 : null, ultima: o.prezzi.length ? o.prezzi[o.prezzi.length - 1].d : null }); });
}
export function vProdotti() {
  const tipo = UI.f.cp_tipo || 'Acquisto'; const anno = UI.f.cp_anni === 'tutti' ? 'tutti' : UI.anno;
  const q = (UI.f.cp_q || '').toLowerCase().trim(); const cat = UI.f.cp_cat || '';
  let ps = prodotti(tipo, anno).filter(p => (!q || [p.descrizione, p.codice, p.controparte].some(x => String(x || '').toLowerCase().includes(q))) && (!cat || p.categoria === cat)).sort((a, b) => b.importo - a.importo);
  const cats = [...new Set(prodotti(tipo, anno).map(p => p.categoria))].sort((a, b) => a.localeCompare(b, 'it'));
  ps.forEach(p => (p._cls = 'click'));
  const tot = { descrizione: 'Totale', importo: ps.reduce((t, p) => t + p.importo, 0), n: ps.reduce((t, p) => t + p.n, 0) };
  return `<div class="toolbar">${miniTabs('cp_tipo', [['Acquisto', 'Prodotti acquistati'], ['Vendita', 'Prodotti venduti']], tipo)}<div class="search">${ic('search')}<input class="inp" id="cpq" data-filter="cp_q" placeholder="Cerca prodotto, codice, fornitore" value="${esc(UI.f.cp_q || '')}" autocomplete="off"></div><select class="inp" data-filter="cp_cat"><option value="">Tutte le categorie</option>${cats.map(c => `<option${c === cat ? ' selected' : ''}>${esc(c)}</option>`).join('')}</select></div>
  <div class="chipbar"><button data-act="chip" data-f="cp_anni" data-v="" aria-pressed="${anno !== 'tutti'}">${UI.anno}</button><button data-act="chip" data-f="cp_anni" data-v="tutti" aria-pressed="${anno === 'tutti'}">Tutti gli anni</button></div>
  <section class="card"><div class="card-h"><h2>${ic('package')}${ps.length} prodotti</h2>${bottoniExport(['prod'], 'Prodotti ' + (anno === 'tutti' ? '' : anno))}</div>${ps.length ? tabella('prod', { title: (tipo === 'Vendita' ? 'Prodotti venduti ' : 'Prodotti acquistati ') + (anno === 'tutti' ? '(tutti gli anni)' : anno), sheet: 'Prodotti', cols: [{ k: 'descrizione', h: 'Prodotto', html: p => `${esc(p.descrizione)}<span class="sub">${esc([p.codice, p.controparte].filter(Boolean).join(' · '))}</span>` }, { k: 'codice', h: 'Codice', export: true, html: p => esc(p.codice || '') }, { k: 'controparte', h: tipo === 'Vendita' ? 'Cliente' : 'Fornitore', export: true, html: p => esc(p.controparte) }, { k: 'categoria', h: 'Categoria' }, { k: 'n', h: 'Volte', fmt: 'int' }, { k: 'qta', h: 'Quantità', fmt: 'qta' }, { k: 'um', h: 'UM' }, { k: 'importo', h: 'Importo', fmt: 'eur2' }, { k: 'medio', h: 'Prezzo medio', fmt: 'eur4' }, { k: 'min', h: 'Min', fmt: 'eur4' }, { k: 'max', h: 'Max', fmt: 'eur4' }, { k: 'ultimo', h: 'Ultimo prezzo', fmt: 'eur4' }, { k: 'var', h: 'Variazione', fmt: 'pct' }, { k: 'ultima', h: 'Ultima volta', fmt: 'date' }].filter(c => !(c.export === true && c.k !== 'descrizione' && false)), rows: ps, tot, rowAttr: p => `data-act="c-prod" data-k="${esc(p.key)}" data-tipo="${tipo}"`, freeze: 1 }) : empty('package', 'Nessun prodotto', 'Nessuna riga di fattura con questi filtri.')}</section>`;
}
export function schedaProdotto(key, tipo) {
  const rs = righe().filter(r => !r.rett && r.tipo === tipo && chiaveProd(r) === key).sort((a, b) => (a.data || '').localeCompare(b.data || ''));
  if (!rs.length) return;
  const pts = rs.filter(r => r.quantita && r.importo);
  const tab = tabella('prodstor', { title: 'Storico ' + rs[rs.length - 1].descrizione, cols: [{ k: 'data', h: 'Data', fmt: 'date' }, { k: 'numero', h: 'Fattura' }, { k: 'controparte', h: tipo === 'Vendita' ? 'Cliente' : 'Fornitore' }, { k: 'quantita', h: 'Quantità', fmt: 'qta' }, { k: 'um', h: 'UM' }, { k: 'prezzo', h: 'Prezzo', fmt: 'eur4' }, { k: 'sconto', h: 'Sconto' }, { k: 'pn', h: 'Prezzo netto', fmt: 'eur4' }, { k: 'importo', h: 'Importo', fmt: 'eur2' }], rows: rs.map(r => Object.assign({ pn: r.quantita ? r.importo / r.quantita : null }, r)), sort: false });
  openSheet(rs[rs.length - 1].descrizione, `${pts.length > 1 ? `<section class="card"><div class="card-h"><h2>${ic('chart-line')}Prezzo netto unitario</h2></div>${linee(pts.map(r => fd(r.data)), [{ name: 'Prezzo netto', values: pts.map(r => r.importo / r.quantita), color: tipo === 'Vendita' ? COL.ven : COL.acq }], { fmt: v => nf(v, 2), unit: '€' })}</section>` : ''}<section class="card" style="margin-top:12px"><div class="card-h"><h2>${rs.length} ${rs.length === 1 ? 'riga' : 'righe'}</h2>${bottoniExport(['prodstor'], 'Storico prodotto')}</div>${tab}</section>`, { wide: true, sub: [rs[0].codice, rs[0].controparte, rs[rs.length - 1].categoria].filter(Boolean).join(' · ') });
}

/* ---------------- categorie ---------------- */
export function vCategorie() {
  const tipo = UI.f.cc_tipo || 'Acquisto';
  const rs = righe().filter(r => r.tipo === tipo); const anni = [...new Set(rs.map(r => r.anno).filter(Boolean))].sort();
  if (!rs.length) return `<div class="toolbar">${miniTabs('cc_tipo', [['Acquisto', 'Costi per categoria'], ['Vendita', 'Ricavi per categoria']], tipo)}</div><section class="card">${empty('tags', 'Nessuna riga', 'Carica le fatture per vedere la ripartizione per categoria.')}</section>`;
  const per = new Map();
  for (const r of rs) { const o = per.get(r.categoria) || { categoria: r.categoria, n: 0, tot: 0 }; o[r.anno] = (o[r.anno] || 0) + N(r.importo); o.tot += N(r.importo); o.n++; per.set(r.categoria, o); }
  const rows = [...per.values()].sort((a, b) => N(b[UI.anno]) - N(a[UI.anno]) || b.tot - a.tot);
  const totY = rows.reduce((t, r) => t + N(r[UI.anno]), 0); rows.forEach((r, k) => { r.quota = totY ? N(r[UI.anno]) / totY : null; r._cls = 'click'; r.color = r.categoria === DA_CLASSIFICARE ? '#A9B4AE' : r.categoria === CAT_RETTIFICA ? '#C9D3CE' : PALETTE[k % PALETTE.length]; });
  const tot = { categoria: 'Totale', tot: rows.reduce((t, r) => t + r.tot, 0), n: rs.length }; anni.forEach(y => (tot[y] = rows.reduce((t, r) => t + N(r[y]), 0)));
  // mese per categoria nell'anno scelto
  const mesi = rows.filter(r => N(r[UI.anno])).map(r => { const o = { categoria: r.categoria, tot: 0 }; for (let m = 1; m <= 12; m++) o['m' + m] = 0; rs.filter(x => x.anno === UI.anno && x.categoria === r.categoria).forEach(x => { if (x.mese) { o['m' + x.mese] += N(x.importo); o.tot += N(x.importo); } }); return o; });
  const totM = { categoria: 'Totale', tot: 0 }; for (let m = 1; m <= 12; m++) { totM['m' + m] = mesi.reduce((t, o) => t + o['m' + m], 0); totM.tot += totM['m' + m]; }
  return `<div class="toolbar">${miniTabs('cc_tipo', [['Acquisto', 'Costi per categoria'], ['Vendita', 'Ricavi per categoria']], tipo)}<span class="sp"></span><button class="btn sm" data-act="sub" data-tab="conti" data-sec="conti" data-sub="regole">${ic('list-checks')}Regole delle categorie</button></div>
  <div class="grid-2"><section class="card"><div class="card-h"><h2>${ic('chart-pie')}Ripartizione ${UI.anno}</h2></div>${torta(rows.filter(r => N(r[UI.anno]) > 0).map(r => ({ label: r.categoria, v: N(r[UI.anno]), color: r.color })), { fmt: v => fmtVal(v, 'eur'), tot: tipo === 'Vendita' ? 'ricavi' : 'costi' })}</section>
  <section class="card"><div class="card-h"><h2>${ic('chart-column')}Prime categorie per anno</h2></div>${colonne(rows.slice(0, 6).map(r => r.categoria), anni.slice(-4).map((y, i, a) => ({ name: String(y), values: rows.slice(0, 6).map(r => N(r[y])), color: coloreAnno(i, a.length) })))}</section></div>
  <section class="card"><div class="card-h"><h2>Categorie per anno</h2>${bottoniExport(['cat', 'catm'], 'Categorie ' + (tipo === 'Vendita' ? 'ricavi' : 'costi'))}</div>${tabella('cat', { title: (tipo === 'Vendita' ? 'Ricavi' : 'Costi') + ' per categoria', sheet: 'Per anno', cols: [{ k: 'categoria', h: 'Categoria', html: r => `<span class="dot" style="background:${r.color};display:inline-block;width:9px;height:9px;border-radius:3px;margin-right:8px"></span>${esc(r.categoria)}` }, ...anni.map(y => ({ k: y, h: String(y), fmt: 'eur' })), { k: 'tot', h: 'Totale', fmt: 'eur' }, { k: 'quota', h: '% ' + UI.anno, fmt: 'pct' }, { k: 'n', h: 'Righe', fmt: 'int' }], rows, tot, rowAttr: r => `data-act="c-goCat" data-cat="${esc(r.categoria)}" data-tipo="${tipo}"`, freeze: 1 })}</section>
  <section class="card"><div class="card-h"><h2>Mese per mese – ${UI.anno}</h2></div>${tabella('catm', { title: 'Categorie mese per mese ' + UI.anno, sheet: 'Per mese', cols: [{ k: 'categoria', h: 'Categoria' }, ...MESI.map((m, i) => ({ k: 'm' + (i + 1), h: m, fmt: 'eur' })), { k: 'tot', h: 'Totale', fmt: 'eur' }], rows: mesi, tot: totM, freeze: 1 })}</section>`;
}

/* ---------------- mensile ---------------- */
export function mensili(tipo, anni) {
  const out = {}; for (const y of anni) out[y] = Array(12).fill(0);
  for (const f of fatture()) if (f.tipo === tipo && out[f.anno] && f.mese) out[f.anno][f.mese - 1] += N(f.imponibile);
  return out;
}
export function vMensile() {
  const anni = anniFatture(); if (!anni.length) return `<section class="card">${empty('calendar-range', 'Nessuna fattura', 'Carica le fatture per vedere acquisti e vendite mese per mese.')}</section>`;
  const A = mensili('Acquisto', anni), V = mensili('Vendita', anni); const y = anni.includes(UI.anno) ? UI.anno : anni[anni.length - 1];
  const tab = (id, titolo, M) => { const rows = MESI_L.map((m, i) => { const o = { mese: m }; anni.forEach(a => (o[a] = M[a][i])); return o; }); const tot = { mese: 'Totale' }; anni.forEach(a => (tot[a] = M[a].reduce((t, v) => t + v, 0))); return tabella(id, { title: titolo, sheet: titolo, cols: [{ k: 'mese', h: 'Mese' }, ...anni.map(a => ({ k: a, h: String(a), fmt: 'eur' }))], rows, tot, sort: false }); };
  const D_ = {}; anni.forEach(a => (D_[a] = V[a].map((v, i) => v - A[a][i])));
  return `<section class="card"><div class="card-h"><h2>${ic('chart-column')}Acquisti e vendite ${y}</h2></div>${colonne(MESI, [{ name: 'Acquisti', values: A[y], color: COL.acq }, { name: 'Vendite', values: V[y], color: COL.ven }, { name: 'Differenza', values: D_[y], color: COL.diff }], { min0: true })}</section>
  ${anni.length > 1 ? `<div class="grid-2"><section class="card"><div class="card-h"><h2>Acquisti: confronto tra anni</h2></div>${linee(MESI, anni.slice(-4).map((a, i, arr) => ({ name: String(a), values: A[a], color: coloreAnno(i, arr.length) })), { unit: '€' })}</section><section class="card"><div class="card-h"><h2>Vendite: confronto tra anni</h2></div>${linee(MESI, anni.slice(-4).map((a, i, arr) => ({ name: String(a), values: V[a], color: coloreAnno(i, arr.length) })), { unit: '€' })}</section></div>` : ''}
  <section class="card"><div class="card-h"><h2>Imponibile mese per mese</h2>${bottoniExport(['mA', 'mV', 'mD'], 'Andamento mensile')}</div><div class="card-h"><h3>Acquisti</h3></div>${tab('mA', 'Acquisti', A)}<div class="card-h"><h3>Vendite</h3></div>${tab('mV', 'Vendite', V)}<div class="card-h"><h3>Differenza (vendite − acquisti)</h3></div>${tab('mD', 'Differenza', D_)}</section>`;
}

/* ---------------- latte venduto ---------------- */
export function vLatte() {
  const anni = anniFatture(); const y = UI.anno;
  const rs = righe().filter(r => r.tipo === 'Vendita' && r.anno === y && (r.categoria === CAT_LATTE || r.categoria === CAT_PREMI));
  const prod = Array(12).fill(0); let haProd = false;
  (D.latte || []).filter(l => yearOf(l.data) === y).forEach(l => { prod[+l.data.slice(5, 7) - 1] += N(l.litri); haProd = true; });
  const rows = MESI_L.map((m, i) => { const r = rs.filter(x => x.mese === i + 1); const lit = r.filter(x => x.categoria === CAT_LATTE).reduce((t, x) => t + N(x.quantita), 0); const eL = r.filter(x => x.categoria === CAT_LATTE).reduce((t, x) => t + N(x.importo), 0); const eP = r.filter(x => x.categoria === CAT_PREMI).reduce((t, x) => t + N(x.importo), 0); return { mese: m, litri: lit || null, latte: eL || null, premi: eP || null, tot: eL + eP || null, prezzo: lit ? eL / lit : null, prezzoP: lit ? (eL + eP) / lit : null, prodotti: haProd ? prod[i] || null : null }; });
  const S_ = k => rows.reduce((t, r) => t + N(r[k]), 0);
  const tot = { mese: 'Totale', litri: S_('litri'), latte: S_('latte'), premi: S_('premi'), tot: S_('tot'), prezzo: S_('litri') ? S_('latte') / S_('litri') : null, prezzoP: S_('litri') ? S_('tot') / S_('litri') : null, prodotti: haProd ? S_('prodotti') : null };
  if (!rs.length && !haProd) return `<section class="card">${empty('milk', 'Nessun dato sul latte nel ' + y, 'Carica le fatture o i prospetti del caseificio: le righe "Latte" e "Premi e trattenute latte" si sommano qui, con i litri e il prezzo al litro. I litri prodotti arrivano dal registro del latte della stalla.')}</section>`;
  // prezzo medio per anno
  const perAnno = anni.map(a => { const r = righe().filter(x => x.tipo === 'Vendita' && x.anno === a); const lit = r.filter(x => x.categoria === CAT_LATTE).reduce((t, x) => t + N(x.quantita), 0); const e = r.filter(x => x.categoria === CAT_LATTE || x.categoria === CAT_PREMI).reduce((t, x) => t + N(x.importo), 0); return lit ? e / lit : null; });
  return `<div class="kpis"><div class="kpi static"><span class="k-l">${ic('milk')}Litri venduti</span><span class="k-v sm">${nf(tot.litri)}</span><span class="k-s">dalle fatture del ${y}</span></div><div class="kpi static"><span class="k-l">Ricavo latte e premi</span><span class="k-v sm">${fmtVal(tot.tot, 'eur')}</span><span class="k-s">premi ${fmtVal(tot.premi, 'eur')}</span></div><div class="kpi static"><span class="k-l">Prezzo medio</span><span class="k-v sm">${fmtVal(tot.prezzoP, 'eur4')}</span><span class="k-s">al litro, premi compresi</span></div><div class="kpi static"><span class="k-l">Litri prodotti</span><span class="k-v sm">${haProd ? nf(tot.prodotti) : '—'}</span><span class="k-s">${haProd && tot.litri ? 'venduto ' + nf(tot.litri / tot.prodotti * 100, 1) + '%' : 'dal registro del latte'}</span></div></div>
  <div class="grid-2"><section class="card"><div class="card-h"><h2>${ic('chart-column')}Litri per mese</h2></div>${colonne(MESI, [{ name: 'Venduti', values: rows.map(r => r.litri), color: COL.ven }, ...(haProd ? [{ name: 'Prodotti', values: rows.map(r => r.prodotti), color: 'var(--chart-prod)' }] : [])], { unit: 'l' })}</section>
  <section class="card"><div class="card-h"><h2>${ic('chart-line')}Prezzo al litro</h2></div>${linee(MESI, [{ name: 'Latte', values: rows.map(r => r.prezzo), color: COL.diff }, { name: 'Con premi', values: rows.map(r => r.prezzoP), color: COL.ven }], { fmt: v => nf(v, 3), unit: '€/l' })}</section></div>
  ${anni.length > 1 ? `<section class="card"><div class="card-h"><h2>Prezzo medio per anno (premi compresi)</h2></div>${linee(anni.map(String), [{ name: '€/litro', values: perAnno, color: COL.ven }], { fmt: v => nf(v, 3), unit: '€/l' })}</section>` : ''}
  <section class="card"><div class="card-h"><h2>Mese per mese – ${y}</h2>${bottoniExport(['latte'], 'Latte venduto ' + y)}</div>${tabella('latte', { title: 'Latte venduto ' + y, sheet: 'Latte', cols: [{ k: 'mese', h: 'Mese' }, { k: 'litri', h: 'Litri venduti', fmt: 'num' }, ...(haProd ? [{ k: 'prodotti', h: 'Litri prodotti', fmt: 'num' }] : []), { k: 'latte', h: 'Latte €', fmt: 'eur' }, { k: 'premi', h: 'Premi e trattenute €', fmt: 'eur' }, { k: 'tot', h: 'Totale €', fmt: 'eur' }, { k: 'prezzo', h: '€/l latte', fmt: 'eur4' }, { k: 'prezzoP', h: '€/l con premi', fmt: 'eur4' }], rows, tot, sort: false })}</section>`;
}
