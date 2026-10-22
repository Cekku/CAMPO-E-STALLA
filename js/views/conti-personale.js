// Conti → Personale: riepilogo, dipendenti, cedolini, pagamenti, verifica dei pagamenti e irregolarità
import { S, UI } from '../state.js';
import { esc, nf, fd, N, $, $$, today } from '../util.js';
import { ic } from '../icons.js';
import * as store from '../store.js';
import { toast, openSheet, closeSheet, arm, empty } from '../ui.js';
import { tabella, bottoniExport, fmtVal } from '../conti/tabelle.js';
import { colonne, COL } from '../conti/grafici.js';
import { miniTabs } from './conti-fatture.js';
import * as P from '../conti/paghe.js';

const r2 = v => Math.round(v * 100) / 100;
const eu = v => fmtVal(v, 'eur2') || '0,00 €';
const cfg = () => S.econfig.find(x => x.id === 'cfg') || {};
const ignorate = () => new Set(cfg().pagheIgnora || []);
const anomalieAttive = () => { const ig = ignorate(); return P.anomalie().filter(a => !ig.has(a.testo)); };
const nomeDip = k => (k ? P.nomeDi(k) : '');
const STATO_CLS = { 'pagato': 'ok', 'pagato in parte': 'wa', 'pagato in più': 'wa', 'non pagato': 'ko', 'da pagare': 'muted', 'senza cedolino': 'wa' };
const STATO_IC = { 'pagato': 'circle-check', 'pagato in parte': 'circle-alert', 'pagato in più': 'circle-alert', 'non pagato': 'circle-x', 'da pagare': 'calendar', 'senza cedolino': 'circle-alert' };
const stato = s => `<span class="esito ${STATO_CLS[s] || ''}">${ic(STATO_IC[s] || 'info')}${esc(s)}</span>`;
const vuoto = () => `<section class="card welcome"><div class="wl-art">${ic('users', 'huge')}</div><div class="wl-body"><span class="eyebrow">Personale</span><h2>Cedolini, costi e pagamenti dei dipendenti</h2><p>Ogni mese carica il PDF dei <b>cedolini</b> e il <b>bilancino delle paghe</b> che ti manda il consulente: l'app legge netto, lordo, contributi e IRPEF di ogni dipendente, calcola quanto devi pagare e porta il costo del personale nel conto economico. Poi registra i <b>pagamenti</b> (a mano o con l'estratto conto della banca in Excel o CSV) e l'app controlla se manca qualcosa.</p><div class="btns"><button class="btn action" data-act="sub" data-tab="conti" data-sec="conti" data-sub="importa">${ic('file-up')}Carica cedolini e bilancino</button><button class="btn" data-act="c-pPag">${ic('banknote')}Registra un pagamento</button></div></div></section>`;
const kpi = (l, v, s, icn, cls = '') => `<div class="kpi static"><span class="k-l">${icn ? ic(icn) : ''}${esc(l)}</span><span class="k-v sm ${cls}">${v}</span><span class="k-s">${s}</span></div>`;

function listaAnomalie(lista, max = 1e9) {
  if (!lista.length) return `<div class="allgood">${ic('circle-check', 'huge')}<b>Nessuna irregolarità</b><span>Cedolini, bilancini e pagamenti tornano.</span></div>`;
  const cls = { err: 'bad', warn: 'warn', info: '' }, icn = { err: 'octagon-x', warn: 'triangle-alert', info: 'info' };
  return `<div class="alerts">${lista.slice(0, max).map(a => `<div class="alert ${cls[a.liv]}"><span class="a-ic">${ic(icn[a.liv])}</span><span class="a-tx"><b>${esc(a.testo)}</b><span>${esc(a.det || '')}</span></span><span class="btns nowrap">${a.dip && a.periodo && a.ver ? `<button class="btn sm ghost" data-act="c-pCella" data-dip="${esc(a.dip)}" data-p="${esc(a.periodo)}">Dettaglio</button>` : a.pid ? `<button class="btn sm ghost" data-act="c-pPag" data-id="${esc(a.pid)}">Apri</button>` : a.dip ? `<button class="btn sm ghost" data-act="c-pDip" data-k="${esc(a.dip)}">Dipendente</button>` : ''}<button class="iconbtn" data-act="c-pIgnora" data-t="${esc(a.testo)}" aria-label="Ignora" title="Ignora questo avviso">${ic('x')}</button></span></div>`).join('')}${lista.length > max ? `<button class="more-btn" data-act="c-go" data-sub="verifica">Vedi tutti i ${lista.length} avvisi</button>` : ''}</div>`;
}

/* ---------------- riepilogo ---------------- */
function mesiAnno(y) {
  const ced = P.cedolini().filter(c => c.anno === y), bil = P.bilanciniPaghe().filter(b => b.anno === y), ver = P.verifica().filter(v => v.periodo.startsWith(y + '-'));
  const vers = P.versamenti().filter(v => v.periodo.startsWith(String(y)));
  return [...new Set([...ced.map(c => c.periodo), ...bil.map(b => b.periodo)])].sort().map(p => {
    const cs = ced.filter(c => c.periodo === p), b = bil.find(x => x.periodo === p) || null, vs = ver.filter(v => v.periodo === p);
    const s = k => r2(cs.reduce((t, c) => t + N(c[k]), 0));
    return { periodo: p, mese: P.nomeMese(p), dip: cs.length || null, ore: s('ore'), lordo: b ? N(b.lordo) : s('lordo'), contrib: b ? N(b.contribDitta) : null, tfr: b ? N(b.tfrFpc) : s('tfrFondo'), costo: b ? N(b.costo) : null, ritDip: b ? r2(N(b.ritPrev)) : s('ritPrev'), irpef: b ? N(b.irpef) : s('irpef'), netto: b ? N(b.netto) : s('netto'), pagato: r2(vs.reduce((t, v) => t + v.pagato, 0)), dapagare: r2(vs.reduce((t, v) => t + Math.max(0, v.differenza), 0)), f24: (vers.find(v => v.tipo === 'f24' && v.periodo === p) || {}).dovuto ?? null, _cls: 'click', _p: p };
  });
}
export function vPersonale() {
  if (!S.paghe.length && !S.pagamenti.length) return vuoto();
  const y = UI.anno; const M = mesiAnno(y);
  const tot = k => r2(M.reduce((t, r) => t + N(r[k]), 0));
  const dips = P.dipendenti().filter(d => d.ced.some(c => c.anno === y));
  const ano = anomalieAttive(); const gravi = ano.filter(a => a.liv === 'err').length;
  const conBil = M.filter(r => r.costo != null).length;
  const costo = conBil ? tot('costo') : tot('lordo');
  if (!M.length) return `${barra()}<section class="card">${empty('users', `Nessun cedolino del ${y}`, 'Scegli un altro anno in alto o carica i cedolini di quest\'anno.', `<button class="btn primary" data-act="sub" data-tab="conti" data-sec="conti" data-sub="importa">${ic('file-up')}Carica documenti</button>`)}</section>${ano.length ? `<section class="card"><div class="card-h"><h2>${ic('shield-alert')}Da controllare</h2><span class="count">${ano.length}</span></div>${listaAnomalie(ano, 6)}</section>` : ''}`;
  const tM = tabella('pmesi', {
    title: 'Personale mese per mese ' + y, sheet: 'Mesi ' + y, sub: 'Dai bilancini paghe e dai cedolini',
    cols: [{ k: 'mese', h: 'Mese' }, { k: 'dip', h: 'Dipendenti', fmt: 'int' }, { k: 'ore', h: 'Ore lavorate', fmt: 'n1' }, { k: 'lordo', h: 'Retribuzione lorda', fmt: 'eur2' }, { k: 'contrib', h: 'Contributi a carico azienda', fmt: 'eur2' }, { k: 'tfr', h: 'TFR al fondo', fmt: 'eur2' }, { k: 'costo', h: 'Costo aziendale', fmt: 'eur2' }, { k: 'ritDip', h: 'Contributi dipendenti', fmt: 'eur2' }, { k: 'irpef', h: 'IRPEF trattenuta', fmt: 'eur2' }, { k: 'netto', h: 'Netto da pagare', fmt: 'eur2' }, { k: 'pagato', h: 'Netto pagato', fmt: 'eur2' }, { k: 'dapagare', h: 'Ancora da pagare', fmt: 'eur2', html: r => r.dapagare ? `<b class="t-bad">${eu(r.dapagare)}</b>` : '–' }, { k: 'f24', h: 'F24 ritenute', fmt: 'eur2' }],
    rows: M, sort: false, rowAttr: r => `data-act="c-pMese" data-p="${r._p}"`,
    tot: { mese: 'Totale ' + y, ore: tot('ore'), lordo: tot('lordo'), contrib: conBil ? tot('contrib') : null, tfr: tot('tfr'), costo: conBil ? tot('costo') : null, ritDip: tot('ritDip'), irpef: tot('irpef'), netto: tot('netto'), pagato: tot('pagato'), dapagare: tot('dapagare'), f24: tot('f24') },
    note: conBil < M.length ? ['Contributi e costo aziendale si conoscono solo per i mesi con il bilancino delle paghe.'] : [],
  });
  const rowsD = dips.map(d => { const cs = d.ced.filter(c => c.anno === y); const vs = P.verifica().filter(v => v.dip === d.key && v.periodo.startsWith(y + '-')); const s = k => r2(cs.reduce((t, c) => t + N(c[k]), 0)); return { nome: d.nome, qualifica: [d.qualifica, d.mansione].filter(Boolean).join(' · '), mesi: cs.length, ore: s('ore'), lordo: s('lordo'), ritPrev: s('ritPrev'), irpef: s('irpef'), netto: s('netto'), pagato: r2(vs.reduce((t, v) => t + v.pagato, 0)), saldo: r2(vs.reduce((t, v) => t + v.differenza, 0)), stato: d.stato, _cls: 'click', _k: d.key }; });
  const td = k => r2(rowsD.reduce((t, r) => t + N(r[k]), 0));
  const tD = tabella('pdip', { title: 'Dipendenti ' + y, sheet: 'Dipendenti ' + y, cols: [{ k: 'nome', h: 'Dipendente' }, { k: 'qualifica', h: 'Qualifica', cls: 'clip' }, { k: 'mesi', h: 'Mesi', fmt: 'int' }, { k: 'ore', h: 'Ore', fmt: 'n1' }, { k: 'lordo', h: 'Lordo', fmt: 'eur2' }, { k: 'ritPrev', h: 'Contributi dip.', fmt: 'eur2' }, { k: 'irpef', h: 'IRPEF', fmt: 'eur2' }, { k: 'netto', h: 'Netto dovuto', fmt: 'eur2' }, { k: 'pagato', h: 'Pagato', fmt: 'eur2' }, { k: 'saldo', h: 'Differenza', fmt: 'eur2', html: r => Math.abs(r.saldo) < 0.01 ? `<span class="esito ok">${ic('circle-check')}in pari</span>` : `<b class="${r.saldo > 0 ? 't-bad' : 't-warn'}">${r.saldo > 0 ? 'mancano ' : 'in più '}${eu(Math.abs(r.saldo))}</b>`, x: r => r.saldo }, { k: 'stato', h: 'Stato' }],
    rows: rowsD, rowAttr: r => `data-act="c-pDip" data-k="${esc(r._k)}"`, tot: { nome: 'Totale', ore: td('ore'), lordo: td('lordo'), ritPrev: td('ritPrev'), irpef: td('irpef'), netto: td('netto'), pagato: td('pagato'), saldo: td('saldo') } });
  const graf = colonne(M.map(r => P.meseCorto(r.periodo)), [{ name: 'Netto ai dipendenti', values: M.map(r => r.netto), color: COL.ven }, { name: 'Contributi e IRPEF', values: M.map(r => r2(N(r.ritDip) + N(r.irpef) + N(r.contrib))), color: COL.acq }, { name: 'TFR', values: M.map(r => N(r.tfr)), color: COL.diff }]);
  return `${barra()}<div class="kpis">${kpi('Costo del personale ' + y, fmtVal(costo, 'eur'), conBil ? `costo aziendale · ${M.length} ${M.length === 1 ? 'mese' : 'mesi'}` : 'retribuzioni lorde (manca il bilancino)', 'users')}${kpi('Netto ai dipendenti', fmtVal(tot('netto'), 'eur'), `${dips.length} dipendenti nell'anno`, 'banknote')}${kpi('Ancora da pagare', fmtVal(tot('dapagare'), 'eur'), tot('dapagare') ? 'stipendi non saldati' : 'stipendi tutti pagati', 'hand-coins', tot('dapagare') ? 't-bad' : '')}${kpi('Irregolarità', String(ano.length), gravi ? `${gravi} gravi` : ano.length ? 'da controllare' : 'nessuna', 'shield-alert', gravi ? 't-bad' : '')}</div>
  ${ano.length ? `<section class="card"><div class="card-h"><h2>${ic('shield-alert')}Da controllare</h2><span class="count">${ano.length}</span></div>${listaAnomalie(ano, 6)}</section>` : ''}
  <div class="grid-2"><section class="card"><div class="card-h"><h2>${ic('chart-column')}Dove vanno i soldi, mese per mese</h2></div>${graf}</section>
  <section class="card"><div class="card-h"><h2>${ic('scale')}Nel conto economico ${y}</h2></div>${ceBox(y)}</section></div>
  <section class="card"><div class="card-h"><h2>${ic('calendar-range')}Mese per mese</h2>${bottoniExport(['pmesi'], 'Personale mese per mese ' + y)}</div>${tM}</section>
  <section class="card"><div class="card-h"><h2>${ic('users')}Per dipendente</h2>${bottoniExport(['pdip'], 'Dipendenti ' + y)}</div>${tD}</section>`;
}
function ceBox(y) {
  const p = P.costiAnno(y); if (!p) return '<div class="empty slim">Nessun dato.</div>';
  const b = (S.bilanci.find(x => x.id === String(y)) || {}).ce || {};
  const manuale = [57, 58, 59].some(r => N(b[r]));
  const riga = (l, v, c) => `<div class="imp-row"><span class="r-icon">${ic('scale')}</span><span><b>${esc(l)}</b><span>${manuale ? 'nel conto economico: ' + fmtVal(N(c), 'eur2') : 'preso dalle paghe'}</span></span><b>${v == null ? '—' : eu(v)}</b></div>`;
  return `${riga('B.9 a) Salari e stipendi', p.salari, b[57])}${riga('B.9 b) Oneri sociali', p.oneri, b[58])}${riga('B.9 c) Trattamento di fine rapporto', p.tfr, b[59])}<p class="muted small pad-x">${manuale ? 'Il conto economico ha già i costi del personale (dal bilancino o inseriti a mano): restano quelli; il confronto è nei Controlli.' : `Il conto economico usa questi importi da ${esc(p.fonte)} (${p.mesi} ${p.mesi === 1 ? 'mese' : 'mesi'}), finché non carichi il bilancino di fine anno.`}${p.mesi < 12 ? ' Mancano dei mesi: il costo dell\'anno è parziale.' : ''}</p>`;
}
const barra = () => `<div class="toolbar"><span class="sp"></span><button class="btn sm" data-act="c-pPag">${ic('plus')}Registra pagamento</button></div>`;

/* ---------------- dipendenti ---------------- */
export function vDipendenti() {
  const ds = P.dipendenti(); if (!ds.length) return vuoto();
  const filtro = UI.f.pd_stato || '';
  const rows = ds.filter(d => !filtro || (filtro === 'forza' ? d.stato === 'In forza' : d.stato !== 'In forza')).map(d => ({ nome: d.nome, cf: d.cf, matricola: d.matricola, qualifica: d.qualifica, mansione: d.mansione, assunzione: d.assunzione, scadTD: d.scadTD, scadPermesso: d.scadPermesso, cessazione: d.cessazione, primo: P.nomeMese(d.primo), ultimo: P.nomeMese(d.ultimo), mesi: d.mesi, netto: d.netto, saldo: d.saldo, avvisi: d.anomalie.filter(a => !ignorate().has(a.testo)).length, stato: d.stato, _cls: 'click', _k: d.key }));
  const t = tabella('panag', { title: 'Anagrafica dei dipendenti', sheet: 'Dipendenti', cols: [{ k: 'nome', h: 'Dipendente', html: r => `${esc(r.nome)}<span class="sub">${esc(r.cf || '')}</span>` }, { k: 'matricola', h: 'Matr.' }, { k: 'qualifica', h: 'Qualifica', cls: 'clip' }, { k: 'mansione', h: 'Mansione', cls: 'clip' }, { k: 'assunzione', h: 'Assunto il', fmt: 'date' }, { k: 'scadTD', h: 'Termine contratto', fmt: 'date', html: r => r.scadTD ? `<span class="${r.scadTD < today() ? 't-bad' : ''}">${fd(r.scadTD)}</span>` : '–' }, { k: 'scadPermesso', h: 'Permesso di soggiorno', fmt: 'date', html: r => r.scadPermesso ? `<span class="${r.scadPermesso < today() ? 't-bad' : ''}">${fd(r.scadPermesso)}</span>` : '–' }, { k: 'ultimo', h: 'Ultimo cedolino' }, { k: 'mesi', h: 'Cedolini', fmt: 'int' }, { k: 'netto', h: 'Netto totale', fmt: 'eur2' }, { k: 'saldo', h: 'Da pagare', fmt: 'eur2' }, { k: 'avvisi', h: 'Avvisi', fmt: 'int', html: r => r.avvisi ? `<span class="esito wa">${ic('triangle-alert')}${r.avvisi}</span>` : '–' }, { k: 'stato', h: 'Stato' }],
    rows, rowAttr: r => `data-act="c-pDip" data-k="${esc(r._k)}"`, freeze: 1 });
  return `${barra()}<div class="chipbar">${[['', 'Tutti'], ['forza', 'In forza'], ['fuori', 'Cessati o con termine scaduto']].map(([v, l]) => `<button data-act="chip" data-f="pd_stato" data-v="${v}" aria-pressed="${filtro === v}">${l}</button>`).join('')}</div><section class="card"><div class="card-h"><h2>${ic('id-card')}Dipendenti</h2><span class="count">${rows.length}</span>${bottoniExport(['panag'], 'Anagrafica dipendenti')}</div>${t}<p class="muted small pad-x">I dati arrivano dall'ultimo cedolino di ogni dipendente. Tocca una riga per vedere i mesi, i pagamenti e gli avvisi.</p></section>`;
}
export function schedaDipendente(k) {
  const d = P.dipendenti().find(x => x.key === k);
  if (!d) { const ps = P.pagamenti().filter(p => p.dip === k); return openSheet(P.nomeDi(k), `<div class="note-box">${ic('info')}<span>Per questo dipendente ci sono pagamenti ma nessun cedolino caricato. Carica i cedolini del periodo: i pagamenti si collegano da soli quando il nome coincide.</span></div><div class="list flat">${ps.map(p => `<button class="row" data-act="c-pPag" data-id="${esc(p.id)}"><span class="r-icon">${ic('banknote')}</span><span class="r-main"><b>${fd(p.data)} · ${eu(p.importo)}</b><span>${esc(p.comp ? P.nomeMese(p.comp) : 'competenza automatica')}${p.descrizione ? ' · ' + esc(p.descrizione) : ''}</span></span>${ic('chevron-right', 'chev')}</button>`).join('')}</div><div class="factions"><span class="sp"></span><button class="btn" data-act="close">Chiudi</button></div>`); }
  const fact = (l, v) => `<div><dt>${esc(l)}</dt><dd>${v}</dd></div>`;
  const vs = P.verifica().filter(v => v.dip === k);
  const rows = vs.map(v => { const c = d.ced.find(c => c.periodo === v.periodo) || {}; return { periodo: v.periodo, mese: P.nomeMese(v.periodo), ore: c.ore, giorni: c.giorni, lordo: c.lordo, ritPrev: c.ritPrev, irpef: c.irpef, netto: v.dovuto, pagato: v.pagato, differenza: v.differenza, date: v.pag.map(p => fd(p.data) + (p.modalita ? ' ' + p.modalita : '')).join(', '), stato: v.stato, _cls: 'click', _p: v.periodo }; });
  const s = key => r2(rows.reduce((t, r) => t + N(r[key]), 0));
  const t = tabella('pschd', { title: 'Mesi di ' + d.nome, sheet: 'Mesi', cols: [{ k: 'mese', h: 'Mese' }, { k: 'ore', h: 'Ore', fmt: 'n1' }, { k: 'giorni', h: 'Giorni', fmt: 'n1' }, { k: 'lordo', h: 'Lordo', fmt: 'eur2' }, { k: 'ritPrev', h: 'Contributi', fmt: 'eur2' }, { k: 'irpef', h: 'IRPEF', fmt: 'eur2' }, { k: 'netto', h: 'Netto dovuto', fmt: 'eur2' }, { k: 'pagato', h: 'Pagato', fmt: 'eur2' }, { k: 'differenza', h: 'Differenza', fmt: 'eur2' }, { k: 'date', h: 'Pagamenti', cls: 'clip' }, { k: 'stato', h: 'Stato', html: r => stato(r.stato) }], rows, sort: false, rowAttr: r => `data-act="c-pCella" data-dip="${esc(k)}" data-p="${r._p}"`, tot: { mese: 'Totale', ore: s('ore'), giorni: s('giorni'), lordo: s('lordo'), ritPrev: s('ritPrev'), irpef: s('irpef'), netto: s('netto'), pagato: s('pagato'), differenza: s('differenza') } });
  const fp = (l, o) => o && (o.saldo != null || o.prec != null) ? fact(l, `${nf(o.saldo ?? 0, 2)} ore <span class="muted small">(maturate ${nf(o.mat ?? 0, 2)})</span>`) : '';
  const ano = d.anomalie.filter(a => !ignorate().has(a.testo));
  openSheet(d.nome, `<dl class="inv-head">${fact('Codice fiscale', esc(d.cf || '—'))}${fact('Matricola', esc(d.matricola || '—'))}${fact('Qualifica', esc(d.qualifica || '—'))}${fact('Mansione', esc(d.mansione || '—'))}${fact('Livello', esc(d.livello || '—'))}${fact('Nato il', fd(d.nascita))}${fact('Assunto il', fd(d.assunzione))}${fact('Termine del contratto', d.scadTD ? `<span class="${d.scadTD < today() ? 't-bad' : ''}">${fd(d.scadTD)}</span>` : 'tempo indeterminato')}${fact('Permesso di soggiorno', d.scadPermesso ? `<span class="${d.scadPermesso < today() ? 't-bad' : ''}">scade il ${fd(d.scadPermesso)}</span>` : '—')}${fact('Cessazione', fd(d.cessazione))}${fp('Ferie residue', d.ferie)}${fp('Permessi residui', d.permessi)}${fact('Stato', esc(d.stato))}</dl>
  ${ano.length ? `<h3 class="sheet-h">Avvisi</h3>${listaAnomalie(ano)}` : ''}
  <div class="card-h"><h3>Mese per mese</h3>${bottoniExport(['pschd'], 'Dipendente ' + d.nome)}</div>${t}
  <label class="fld" style="margin-top:14px"><span class="flabel">Altri nomi con cui compare nei bonifici</span><div class="inwrap"><input id="pd_alias" value="${esc(d.alias || '')}" placeholder="Es. SINGH A., AMARJIT"></div><small>Separati da virgola: servono a riconoscere i bonifici nell'estratto conto.</small></label>
  <div class="factions"><button class="btn ghost" data-act="c-pAlias" data-k="${esc(k)}">${ic('check')}Salva i nomi</button><span class="sp"></span><button class="btn" data-act="c-pPag" data-dip="${esc(k)}">${ic('banknote')}Registra pagamento</button><button class="btn" data-act="close">Chiudi</button></div>`, { wide: true, sub: [d.qualifica, d.mansione].filter(Boolean).join(' · ') });
}

/* ---------------- cedolini e bilancini ---------------- */
export function vCedolini() {
  if (!S.paghe.length) return vuoto();
  const y = UI.anno; const vista = UI.f.pc_vista || 'ced';
  const per = P.periodi().filter(p => p.startsWith(y + '-'));
  const m = UI.f.pc_mese && per.includes(UI.f.pc_mese) ? UI.f.pc_mese : ''; const dk = UI.f.pc_dip || '';
  let corpo;
  if (vista === 'bil') {
    const bs = P.bilanciniPaghe().filter(b => b.anno === y);
    const s = k => r2(bs.reduce((t, b) => t + N(b[k]), 0));
    corpo = tabella('pbil', { title: 'Bilancini paghe ' + y, sheet: 'Bilancini ' + y, cols: [{ k: 'mese', h: 'Mese' }, { k: 'lordo', h: 'Retribuzione lorda', fmt: 'eur2' }, { k: 'ritPrev', h: 'Ritenute previdenziali', fmt: 'eur2' }, { k: 'ritFisc', h: 'Ritenute fiscali', fmt: 'eur2' }, { k: 'acconti', h: 'Acconti', fmt: 'eur2' }, { k: 'netto', h: 'Netto pagato', fmt: 'eur2' }, { k: 'contribDitta', h: 'Contributi ditta', fmt: 'eur2' }, { k: 'contribDebito', h: 'Contributi da versare', fmt: 'eur2' }, { k: 'tfrFpc', h: 'TFR al fondo', fmt: 'eur2' }, { k: 'irpef', h: 'IRPEF da versare', fmt: 'eur2' }, { k: 'versamenti', h: 'Versamenti di competenza', fmt: 'eur2' }, { k: 'costo', h: 'Costo aziendale', fmt: 'eur2' }, { k: 'ctrl', h: 'Controlli', html: r => r.ok ? `<span class="esito ok">${ic('circle-check')}OK</span>` : `<span class="esito wa">${ic('triangle-alert')}da verificare</span>` }],
      rows: bs.map(b => Object.assign({ mese: P.nomeMese(b.periodo), ctrl: (b.controlli || []).every(c => c.esito === 'OK') ? 'OK' : 'da verificare', ok: (b.controlli || []).every(c => c.esito === 'OK'), _cls: 'click' }, b)), sort: false, rowAttr: r => `data-act="c-pBil" data-id="${esc(r.id)}"`,
      tot: { mese: 'Totale', lordo: s('lordo'), ritPrev: s('ritPrev'), ritFisc: s('ritFisc'), acconti: s('acconti'), netto: s('netto'), contribDitta: s('contribDitta'), contribDebito: s('contribDebito'), tfrFpc: s('tfrFpc'), irpef: s('irpef'), versamenti: s('versamenti'), costo: s('costo') } });
  } else {
    const cs = P.cedolini().filter(c => c.anno === y && (!m || c.periodo === m) && (!dk || c.dip === dk));
    const s = k => r2(cs.reduce((t, c) => t + N(c[k]), 0));
    corpo = tabella('pced', { title: 'Cedolini ' + y, sheet: 'Cedolini ' + y, cols: [{ k: 'mese', h: 'Mese' }, { k: 'nome', h: 'Dipendente' }, { k: 'ore', h: 'Ore', fmt: 'n1' }, { k: 'giorni', h: 'Giorni', fmt: 'n1' }, { k: 'totComp', h: 'Competenze', fmt: 'eur2' }, { k: 'lordo', h: 'Lordo', fmt: 'eur2' }, { k: 'ritPrev', h: 'Contributi', fmt: 'eur2' }, { k: 'irpef', h: 'IRPEF', fmt: 'eur2' }, { k: 'totTratt', h: 'Trattenute', fmt: 'eur2' }, { k: 'netto', h: 'Netto', fmt: 'eur2' }, { k: 'tfrFondo', h: 'TFR al fondo', fmt: 'eur2' }, { k: 'ctrl', h: 'Controllo', html: r => r.ok ? `<span class="esito ok">${ic('circle-check')}OK</span>` : `<span class="esito wa">${ic('triangle-alert')}da verificare</span>` }],
      rows: cs.map(c => Object.assign({ mese: P.nomeMese(c.periodo), ctrl: (c.controlli || []).every(k => k.esito === 'OK') ? 'OK' : 'da verificare', ok: (c.controlli || []).every(k => k.esito === 'OK'), _cls: 'click' }, c)), rowAttr: r => `data-act="c-pCed" data-id="${esc(r.id)}"`,
      tot: { mese: 'Totale', ore: s('ore'), giorni: s('giorni'), totComp: s('totComp'), lordo: s('lordo'), ritPrev: s('ritPrev'), irpef: s('irpef'), totTratt: s('totTratt'), netto: s('netto'), tfrFondo: s('tfrFondo') }, freeze: 2 });
  }
  const dips = P.dipendenti().filter(d => d.ced.some(c => c.anno === y));
  return `${barra()}<div class="toolbar">${miniTabs('pc_vista', [['ced', 'Cedolini'], ['bil', 'Bilancini paghe']], vista)}${vista === 'ced' ? `<select class="inp" data-filter="pc_mese" aria-label="Mese"><option value="">Tutti i mesi</option>${per.map(p => `<option value="${p}"${p === m ? ' selected' : ''}>${P.nomeMese(p)}</option>`).join('')}</select><select class="inp" data-filter="pc_dip" aria-label="Dipendente"><option value="">Tutti i dipendenti</option>${dips.map(d => `<option value="${esc(d.key)}"${d.key === dk ? ' selected' : ''}>${esc(d.nome)}</option>`).join('')}</select>` : ''}</div>
  <section class="card"><div class="card-h"><h2>${ic('file-text')}${vista === 'bil' ? 'Bilancini delle paghe' : 'Cedolini'} ${y}</h2>${bottoniExport([vista === 'bil' ? 'pbil' : 'pced'], (vista === 'bil' ? 'Bilancini paghe ' : 'Cedolini ') + y)}</div>${corpo}</section>`;
}
export function schedaCedolino(id) {
  const c = P.cedolini().find(x => x.id === id); if (!c) return;
  const fact = (l, v) => `<div><dt>${esc(l)}</dt><dd>${v}</dd></div>`;
  const e = v => fmtVal(v, 'eur2') || '–';
  openSheet(`Cedolino ${P.nomeMese(c.periodo)}`, `<dl class="inv-head">${fact('Ore lavorate', nf(c.ore, 2))}${fact('Giorni lavorati', nf(c.giorni, 2))}${fact('Totale competenze', e(c.totComp))}${fact('Lordo', e(c.lordo))}${fact('Imponibile previdenziale', e(c.impPrev))}${fact('Contributi del dipendente', e(c.ritPrev) + (c.enti && Object.keys(c.enti).length ? `<span class="muted small"> (${Object.entries(c.enti).map(([k, v]) => k + ' ' + nf(v, 2)).join(', ')})</span>` : ''))}${fact('Imponibile fiscale', e(c.impFisc))}${fact('IRPEF lorda', e(c.irpefLorda))}${fact('Detrazioni', e(c.detrazioni))}${fact('IRPEF trattenuta', e(c.irpef))}${fact('Totale trattenute', e(c.totTratt))}${fact('Arrotondamenti', `${nf(c.arrPrec || 0, 2)} / ${nf(c.arrCorr || 0, 2)}`)}${fact('Netto in busta', `<b>${e(c.netto)}</b>`)}${fact('TFR al fondo', e(c.tfrFondo))}${fact('File', esc(c.file || '—'))}</dl>
  <div class="pad-x">${(c.controlli || []).map(k => `<div class="esito ${k.esito === 'OK' ? 'ok' : 'wa'}">${ic(k.esito === 'OK' ? 'circle-check' : 'triangle-alert')}${esc(k.d)}: ${esc(k.esito)}</div>`).join('')}</div>
  <div class="tablewrap etab blk"><table><thead><tr><th class="t">Codice</th><th class="t">Voce</th><th class="n">Ore/giorni</th><th class="n">Unitario</th><th class="n">Competenze</th><th class="n">Trattenute</th></tr></thead><tbody>${(c.voci || []).map(v => `<tr><td class="t">${esc(v.codice)}</td><td class="t">${esc(v.descrizione)}</td><td class="n">${v.tempo != null ? nf(v.tempo, 2) : ''}</td><td class="n">${v.unitario != null ? nf(v.unitario, 5) : ''}</td><td class="n">${fmtVal(v.competenza, 'eur2')}</td><td class="n">${fmtVal(v.trattenuta, 'eur2')}</td></tr>`).join('')}</tbody></table></div>
  <div class="factions"><button class="btn ghost danger" data-act="c-pDelDoc" data-id="${esc(c.id)}">${ic('trash-2')}Elimina cedolino</button><span class="sp"></span><button class="btn" data-act="c-pDip" data-k="${esc(c.dip)}">Scheda del dipendente</button><button class="btn" data-act="close">Chiudi</button></div>`, { wide: true, sub: c.nome });
}
export function schedaBilancino(id) {
  const b = P.bilanciniPaghe().find(x => x.id === id); if (!b) return;
  const NOMI = { lordo: 'Retribuzione lorda', ritPrev: 'Ritenute previdenziali', ritFisc: 'Ritenute fiscali', ritNetto: 'Ritenute e competenze su netto', acconti: 'Acconti', arrPrec: 'Arrotondamento precedente', arrCorr: 'Arrotondamento corrente', netto: 'NETTO PAGATO', inps: 'Contributi INPS', totInps: 'Totale INPS', scau: 'Contributi agricoli (SCAU)', inail: 'INAIL conto SCAU', tfrFpc: 'TFR al fondo pensione', altri: 'Totale altri contributi', irpefDebito: 'Debito IRPEF 1001', irpefCredito: 'Credito IRPEF 1001', irpefRivTfr: 'IRPEF sostitutiva rivalutazione TFR', addReg: 'Addizionale regionale', addCom: 'Addizionale comunale', irpef: 'TOTALE IRPEF', costo: 'COSTO TOTALE AZIENDALE', versamenti: 'Versamenti di competenza', impPrev: 'Imponibile previdenziale', impFisc: 'Imponibile fiscale', fondoPensioni: 'Fondo pensioni', tfrLiquidato: 'Indennità TFR', rimborsi: 'Rimborsi spese' };
  const e = v => (v == null ? '' : fmtVal(v, 'eur2'));
  openSheet(`Bilancino paghe ${P.nomeMese(b.periodo)}`, `<div class="pad-x">${(b.controlli || []).map(k => `<div class="esito ${k.esito === 'OK' ? 'ok' : 'wa'}">${ic(k.esito === 'OK' ? 'circle-check' : 'triangle-alert')}${esc(k.d)}: ${esc(k.esito)}</div>`).join('')}</div>
  <div class="tablewrap etab blk"><table><thead><tr><th class="t">Voce</th><th class="n">Oneri ditta</th><th class="n">Oneri dipendente</th><th class="n">Oneri enti</th><th class="n">Debito/credito</th></tr></thead><tbody>${Object.entries(b.voci || {}).map(([k, o]) => `<tr><td class="t">${esc(NOMI[k] || k)}</td><td class="n">${e(o.ditta)}</td><td class="n">${e(o.dip)}</td><td class="n">${e(o.enti)}</td><td class="n">${e(o.debito)}</td></tr>`).join('')}</tbody></table></div>
  <p class="muted small">${esc(b.file || '')}</p><div class="factions"><button class="btn ghost danger" data-act="c-pDelDoc" data-id="${esc(b.id)}">${ic('trash-2')}Elimina bilancino</button><span class="sp"></span><button class="btn" data-act="close">Chiudi</button></div>`, { wide: true, sub: b.ditta || '' });
}

/* ---------------- pagamenti ---------------- */
const PIMP = { righe: null, file: '', altri: 0 };
export function vPagamenti() {
  const y = UI.anno; const tp = UI.f.pp_tipo || '';
  const ps = P.pagamenti().filter(p => (p.data || '').startsWith(y + '-') && (!tp || p.tipo === tp));
  const tot = r2(ps.reduce((t, p) => t + N(p.importo), 0));
  const imp = PIMP.righe ? anteprimaMov() : '';
  const t = tabella('ppag', { title: 'Pagamenti ' + y, sheet: 'Pagamenti ' + y, cols: [{ k: 'data', h: 'Data', fmt: 'date' }, { k: 'tipoN', h: 'Tipo' }, { k: 'chi', h: 'Dipendente o descrizione', cls: 'w' }, { k: 'compN', h: 'Competenza' }, { k: 'modN', h: 'Modalità', html: r => r.modalita === 'contanti' && r.tipo === 'stipendio' ? `<span class="esito ko">${ic('octagon-x')}contanti</span>` : esc(r.modN) }, { k: 'importo', h: 'Importo', fmt: 'eur2' }, { k: 'fonte', h: 'Inserito da', cls: 'clip' }],
    rows: ps.map(p => Object.assign({ tipoN: P.TIPI_PAG[p.tipo] || p.tipo, chi: p.dip ? nomeDip(p.dip) || p.descrizione : p.descrizione || '', compN: p.comp ? (/T\d$/.test(p.comp) ? p.comp.replace('-T', ' · trimestre ') : P.nomeMese(p.comp)) : 'automatica', modN: P.MODALITA[p.modalita] || '', _cls: 'click' }, p)), rowAttr: r => `data-act="c-pPag" data-id="${esc(r.id)}"`, tot: { data: 'Totale', importo: tot } });
  return `<div class="toolbar">${miniTabs('pp_tipo', [['', 'Tutti'], ...Object.entries(P.TIPI_PAG).map(([k, l]) => [k, l.split(' (')[0]])], tp)}<span class="sp"></span><button class="btn sm" data-act="c-pPag">${ic('plus')}Registra pagamento</button><label class="btn sm">${ic('file-up')}Estratto conto o contabili di bonifico<input type="file" accept=".csv,.txt,.xlsx,.pdf" multiple data-act="c-pMovFile" hidden></label></div>
  ${imp}<section class="card"><div class="card-h"><h2>${ic('banknote')}Pagamenti ${y}</h2><span class="count">${ps.length}</span>${bottoniExport(['ppag'], 'Pagamenti personale ' + y)}</div>${ps.length ? t : empty('banknote', 'Nessun pagamento registrato', 'Registra gli stipendi pagati, gli F24 e i contributi, oppure carica l\'estratto conto della banca: i bonifici ai dipendenti si riconoscono dal nome.')}</section>
  <p class="muted small pad-x">Lo stipendio pagato va al mese indicato; se scegli "automatica" va al mese più vecchio ancora da saldare. Gli F24 coprono le ritenute IRPEF del mese prima, i contributi INPS agricoli si pagano per trimestre.</p>`;
}
/** Tabella di revisione dei movimenti o dei bonifici letti (k = indice del documento in "Carica documenti"). */
export function tabellaMovimenti(R, k = '') {
  const dips = P.dipendenti(); const dk = k !== '' ? ` data-k="${k}"` : '';
  const compOpt = r => `<option value="">automatica</option>${[...new Set([...P.periodi(), ...(r.comp ? [r.comp] : [])])].sort().map(p => `<option value="${p}"${r.comp === p ? ' selected' : ''}>${P.nomeMese(p)}</option>`).join('')}`;
  const dipOpt = r => `<option value="">—</option>${dips.map(d => `<option value="${esc(d.key)}"${r.dip === d.key ? ' selected' : ''}>${esc(d.nome)}</option>`).join('')}${r.dip && !dips.some(d => d.key === r.dip) ? `<option value="${esc(r.dip)}" selected>${esc(r.beneficiario || P.nomeDi(r.dip))} (senza cedolini)</option>` : ''}`;
  return `<div class="tablewrap etab"><table><thead><tr><th class="t"></th><th class="t">Data</th><th class="t">Descrizione</th><th class="n">Importo</th><th class="t">Tipo</th><th class="t">Dipendente</th><th class="t">Competenza</th></tr></thead><tbody>${R.map((r, i) => `<tr${r.gia ? ' class="muted"' : ''}><td class="t"><input type="checkbox" data-act="c-pMovSel" data-i="${i}"${dk}${r.sel ? ' checked' : ''}></td><td class="t nw">${fd(r.data)}</td><td class="t clip" title="${esc(r.descrizione)}">${esc(r.descrizione)}${r.gia ? ' <span class="sub">già registrato</span>' : r.nuovo ? ' <span class="sub">non è ancora nei cedolini caricati</span>' : ''}</td><td class="n">${eu(r.importo)}</td><td class="t"><select class="cell-in" data-act="c-pMovSet" data-i="${i}"${dk} data-f="tipo">${Object.entries(P.TIPI_PAG).map(([t, l]) => `<option value="${t}"${r.tipo === t ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></td><td class="t"><select class="cell-in" data-act="c-pMovSet" data-i="${i}"${dk} data-f="dip"${r.tipo === 'stipendio' ? '' : ' disabled'}>${dipOpt(r)}</select></td><td class="t"><select class="cell-in" data-act="c-pMovSet" data-i="${i}"${dk} data-f="comp">${compOpt(r)}</select></td></tr>`).join('')}</tbody></table></div>`;
}
/** Applica una modifica fatta nella tabella di revisione. */
export function modificaRiga(R, t) {
  const r = R[+t.dataset.i]; if (!r) return;
  if (t.dataset.act === 'c-pMovSel') { r.sel = t.checked; return; }
  r[t.dataset.f] = t.value; if (t.dataset.f === 'tipo' && t.value !== 'stipendio') r.dip = '';
  if (t.dataset.f === 'dip' || t.dataset.f === 'tipo') r.sel = r.tipo !== 'stipendio' || !!r.dip;
}
function anteprimaMov() {
  const R = PIMP.righe; const sel = R.filter(r => r.sel).length;
  return `<section class="card"><div class="card-h"><h2>${ic(PIMP.pdf ? 'file-text' : 'file-spreadsheet')}${PIMP.pdf ? 'Bonifici' : 'Movimenti'} da ${esc(PIMP.file)}</h2><span class="sp"></span><button class="btn sm ghost" data-act="c-pMovCancel">${ic('x')}Annulla</button><button class="btn sm primary" data-act="c-pMovSave"${sel ? '' : ' disabled'}>${ic('check')}Salva ${sel} pagamenti</button></div>
  <p class="muted small pad-x">${PIMP.pdf ? `Ho letto ${R.length} ${R.length === 1 ? 'bonifico' : 'bonifici'}: il dipendente si riconosce dal nome del beneficiario (o dall'IBAN già usato), il mese dalla causale.` : `Ho riconosciuto ${R.length} uscite che sembrano stipendi, F24, contributi o fondo pensione${PIMP.altri ? ` (altre ${PIMP.altri} uscite ignorate)` : ''}.`} Controlla tipo e dipendente prima di salvare. Quelli già registrati sono segnati e non selezionati.</p>
  ${tabellaMovimenti(R)}</section>`;
}
async function caricaMovimenti(files) {
  const pdf = files.filter(f => /\.pdf$/i.test(f.name)), altriF = files.filter(f => !/\.pdf$/i.test(f.name));
  if (pdf.length) {
    const { leggiBonifici } = await import('../conti/bonifici-parse.js'); const righe = []; const err = [];
    for (const f of pdf) { try { righe.push(...P.righeBonifici(await leggiBonifici(new Uint8Array(await f.arrayBuffer())), f.name)); } catch (e) { err.push(f.name + ': ' + e.message); } }
    if (err.length) toast(err.join(' · '), 'err');
    if (righe.length) Object.assign(PIMP, { righe, file: pdf.length === 1 ? pdf[0].name : pdf.length + ' contabili', altri: 0, pdf: true });
    return;
  }
  const file = altriF[0];
  const mv = await P.leggiMovimenti(file.name, new Uint8Array(await file.arrayBuffer()));
  const presenti = new Set(S.pagamenti.map(p => p.id));
  const righe = []; let altri = 0;
  for (const m of mv) { const r = P.riconosci(m); if (!r) { altri++; continue; } const id = P.idPagamento(m); righe.push(Object.assign({}, m, r, { id, gia: presenti.has(id), sel: !presenti.has(id) && (r.tipo !== 'stipendio' || !!r.dip), modalita: 'bonifico', comp: '' })); }
  if (!righe.length) throw new Error(`Nel file ci sono ${mv.length} uscite, ma nessuna sembra uno stipendio, un F24 o un contributo. Puoi registrare i pagamenti a mano.`);
  Object.assign(PIMP, { righe, file: file.name, altri, pdf: false });
}
export function schedaPagamento(id, pre = {}) {
  const p = id ? S.pagamenti.find(x => x.id === id) : null; const v = Object.assign({ data: today(), tipo: 'stipendio', modalita: 'bonifico' }, p || {}, pre);
  const dips = P.dipendenti(); const vers = P.versamenti();
  const trim = [...new Set(vers.filter(x => /T\d$/.test(x.periodo)).map(x => x.periodo))];
  openSheet(p ? 'Pagamento' : 'Registra pagamento', `<div class="fgrid">
  <label class="fld half"><span class="flabel">Data</span><div class="inwrap"><input id="pg_data" type="date" value="${esc(v.data || '')}"></div></label>
  <label class="fld half"><span class="flabel">Importo (€)</span><div class="inwrap"><input id="pg_imp" inputmode="decimal" value="${v.importo != null ? esc(String(v.importo).replace('.', ',')) : ''}" placeholder="0,00"></div></label>
  <label class="fld half"><span class="flabel">Tipo</span><div class="inwrap"><select id="pg_tipo">${Object.entries(P.TIPI_PAG).map(([k, l]) => `<option value="${k}"${v.tipo === k ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></div></label>
  <label class="fld half"><span class="flabel">Modalità</span><div class="inwrap"><select id="pg_mod">${Object.entries(P.MODALITA).map(([k, l]) => `<option value="${k}"${v.modalita === k ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></div></label>
  <label class="fld half"><span class="flabel">Dipendente (per gli stipendi)</span><div class="inwrap"><select id="pg_dip"><option value="">—</option>${dips.map(d => `<option value="${esc(d.key)}"${v.dip === d.key ? ' selected' : ''}>${esc(d.nome)}</option>`).join('')}</select></div></label>
  <label class="fld half"><span class="flabel">Competenza</span><div class="inwrap"><select id="pg_comp"><option value="">automatica</option><optgroup label="Mesi (stipendi e F24)">${P.periodi().map(x => `<option value="${x}"${v.comp === x ? ' selected' : ''}>${P.nomeMese(x)}</option>`).join('')}</optgroup>${trim.length ? `<optgroup label="Trimestri (contributi e fondo)">${trim.map(x => `<option value="${x}"${v.comp === x ? ' selected' : ''}>${x.replace('-T', ' · trimestre ')}</option>`).join('')}</optgroup>` : ''}</select></div></label>
  <label class="fld"><span class="flabel">Descrizione</span><div class="inwrap"><input id="pg_desc" value="${esc(v.descrizione || '')}" placeholder="Causale del bonifico, numero dell'F24…"></div></label></div>
  <div class="factions">${p ? `<button class="btn ghost danger" data-act="c-pPagDel" data-id="${esc(p.id)}">${ic('trash-2')}Elimina</button>` : ''}<span class="sp"></span><button class="btn" data-act="close">Annulla</button><button class="btn primary" data-act="c-pPagSave" data-id="${esc(p ? p.id : '')}">${ic('check')}Salva</button></div>`);
}

/* ---------------- verifica ---------------- */
export function vVerifica() {
  if (!S.paghe.length) return vuoto();
  const y = UI.anno; const ver = P.verifica().filter(v => v.periodo.startsWith(y + '-'));
  const per = [...new Set(ver.map(v => v.periodo))].sort();
  const dips = [...new Set(ver.map(v => v.dip))].map(k => P.dipendenti().find(d => d.key === k) || { key: k, nome: P.nomeDi(k) }).sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
  const cella = (d, p) => { const v = ver.find(x => x.dip === d.key && x.periodo === p); if (!v) return `<td class="pm-c"></td>`; const c = { 'pagato': 'ok', 'pagato in parte': 'wa', 'pagato in più': 'wa', 'non pagato': 'ko', 'da pagare': 'nd', 'senza cedolino': 'wa' }[v.stato]; return `<td class="pm-c"><button class="pm ${c}" data-act="c-pCella" data-dip="${esc(d.key)}" data-p="${p}" title="${esc(v.stato)}">${ic(STATO_IC[v.stato])}<span>${v.stato === 'pagato' ? nf(v.dovuto, 0) : v.stato === 'da pagare' || v.stato === 'non pagato' ? nf(v.dovuto, 0) : (v.differenza > 0 ? '−' : '+') + nf(Math.abs(v.differenza), 0)}</span></button></td>`; };
  const matrice = per.length ? `<div class="tablewrap pmat"><table><thead><tr><th class="t">Dipendente</th>${per.map(p => `<th class="n">${esc(P.meseCorto(p))}</th>`).join('')}</tr></thead><tbody>${dips.map(d => `<tr><td class="t"><button class="linkbtn" data-act="c-pDip" data-k="${esc(d.key)}">${esc(d.nome)}</button></td>${per.map(p => cella(d, p)).join('')}</tr>`).join('')}</tbody></table></div><div class="pm-leg"><span class="pm ok">${ic('circle-check')}pagato</span><span class="pm wa">${ic('circle-alert')}differenza</span><span class="pm ko">${ic('circle-x')}non pagato e scaduto</span><span class="pm nd">${ic('calendar')}da pagare</span></div>` : empty('users', 'Nessun cedolino in quest\'anno', '');
  const tV = tabella('pver', { title: 'Verifica stipendi ' + y, sheet: 'Stipendi ' + y, cols: [{ k: 'mese', h: 'Mese' }, { k: 'nome', h: 'Dipendente' }, { k: 'dovuto', h: 'Netto dovuto', fmt: 'eur2' }, { k: 'pagato', h: 'Pagato', fmt: 'eur2' }, { k: 'differenza', h: 'Differenza', fmt: 'eur2' }, { k: 'date', h: 'Date dei pagamenti' }, { k: 'scadenza', h: 'Scadenza', fmt: 'date' }, { k: 'stato', h: 'Esito', html: r => stato(r.stato) }],
    rows: ver.map(v => ({ mese: P.nomeMese(v.periodo), nome: nomeDip(v.dip), dovuto: v.dovuto, pagato: v.pagato, differenza: v.differenza, date: v.pag.map(p => fd(p.data)).join(', '), scadenza: v.scadenza, stato: v.stato, _cls: 'click', _d: v.dip, _p: v.periodo })), rowAttr: r => `data-act="c-pCella" data-dip="${esc(r._d)}" data-p="${r._p}"`,
    tot: { mese: 'Totale', dovuto: r2(ver.reduce((t, v) => t + v.dovuto, 0)), pagato: r2(ver.reduce((t, v) => t + v.pagato, 0)), differenza: r2(ver.reduce((t, v) => t + v.differenza, 0)) } });
  const vers = P.versamenti().filter(v => v.periodo.startsWith(String(y)));
  const tS = tabella('pvers', { title: 'Versamenti ' + y, sheet: 'Versamenti ' + y, cols: [{ k: 'tipoNome', h: 'Versamento' }, { k: 'nome', h: 'Periodo' }, { k: 'dovuto', h: 'Dovuto', fmt: 'eur2' }, { k: 'pagato', h: 'Registrato', fmt: 'eur2' }, { k: 'scadenza', h: 'Scadenza', fmt: 'date' }, { k: 'date', h: 'Pagato il' }, { k: 'stato', h: 'Esito', html: r => stato(r.stato) + (r.ritardo ? ` <span class="muted small">${r.ritardo} gg di ritardo</span>` : '') }, { k: 'az', h: '', export: false, sort: false, html: r => r.stato !== 'pagato' && r.stato !== 'pagato in più' ? `<button class="btn sm ghost" data-act="c-pPag" data-tipo="${r.tipo}" data-comp="${r.periodo}" data-imp="${Math.max(0, r.differenza)}">${ic('plus')}Registra</button>` : '' }],
    rows: vers.map(v => Object.assign({ date: v.pag.map(p => fd(p.data)).join(', ') }, v)), sort: false, note: ['F24: ritenute IRPEF e addizionali trattenute in busta, da versare entro il 16 del mese dopo (con il codice 1001 e le addizionali). Contributi agricoli: li calcola l\'INPS per trimestre. TFR al fondo pensione: versato al fondo di solito ogni trimestre.'] });
  const ano = anomalieAttive(); const ign = (cfg().pagheIgnora || []).length; const cp = P.cfgPaghe();
  return `<section class="card"><div class="card-h"><h2>${ic('shield-check')}Irregolarità e controlli</h2><span class="count">${ano.length}</span>${ign ? `<button class="btn sm ghost" data-act="c-pIgnoraReset">${ic('rotate-ccw')}Mostra anche i ${ign} ignorati</button>` : ''}</div>${listaAnomalie(ano)}</section>
  <section class="card"><div class="card-h"><h2>${ic('users')}Stipendi ${y}: dovuto e pagato</h2>${bottoniExport(['pver', 'pvers'], 'Verifica pagamenti personale ' + y)}</div>${matrice}</section>
  <section class="card"><div class="card-h"><h2>${ic('list-checks')}Dettaglio stipendi</h2></div>${tV}</section>
  <section class="card"><div class="card-h"><h2>${ic('landmark')}F24, contributi e fondo pensione</h2></div>${vers.length ? tS : '<div class="empty slim">Servono i bilancini delle paghe per sapere quanto versare.</div>'}</section>
  <section class="card"><div class="card-h"><h2>${ic('calendar')}Scadenze usate nei controlli</h2></div><div class="toolbar pad-x" style="padding-bottom:16px"><label>Stipendi entro il giorno <input class="inp yr-in" id="pg_gs" style="width:64px" inputmode="numeric" value="${cp.giornoStipendi}"> del mese dopo</label><label>F24 entro il giorno <input class="inp yr-in" id="pg_gf" style="width:64px" inputmode="numeric" value="${cp.giornoF24}"></label><button class="btn sm" data-act="c-pCfg">${ic('check')}Salva</button></div></section>`;
}
function schedaCella(dk, p) {
  const v = P.verifica().find(x => x.dip === dk && x.periodo === p); if (!v) return;
  const c = P.cedolini().find(x => x.dip === dk && x.periodo === p);
  openSheet(`${nomeDip(dk)} · ${P.nomeMese(p)}`, `<dl class="inv-head"><div><dt>Netto dovuto</dt><dd>${eu(v.dovuto)}</dd></div><div><dt>Pagato</dt><dd>${eu(v.pagato)}</dd></div><div><dt>Differenza</dt><dd class="${v.differenza > 0.005 ? 't-bad' : v.differenza < -0.005 ? 't-warn' : 't-ok'}">${eu(v.differenza)}</dd></div><div><dt>Scadenza</dt><dd>${fd(v.scadenza)}</dd></div><div><dt>Esito</dt><dd>${stato(v.stato)}</dd></div></dl>
  <h3 class="sheet-h">Pagamenti abbinati</h3>${v.pag.length ? `<div class="list flat">${v.pag.map(x => `<button class="row" data-act="c-pPag" data-id="${esc(x.id)}"><span class="r-icon">${ic('banknote')}</span><span class="r-main"><b>${fd(x.data)} · ${eu(x.importo)}</b><span>${x.tot !== x.importo ? `parte di un pagamento di ${eu(x.tot)} · ` : ''}${esc(P.MODALITA[x.modalita] || '')}</span></span>${ic('chevron-right', 'chev')}</button>`).join('')}</div>` : '<p class="muted">Nessun pagamento per questo mese.</p>'}
  <div class="factions">${c ? `<button class="btn ghost" data-act="c-pCed" data-id="${esc(c.id)}">${ic('file-text')}Cedolino</button>` : ''}<span class="sp"></span><button class="btn" data-act="close">Chiudi</button>${v.differenza > 0.005 ? `<button class="btn primary" data-act="c-pPag" data-dip="${esc(dk)}" data-comp="${p}" data-imp="${v.differenza}">${ic('plus')}Registra ${eu(v.differenza)}</button>` : ''}</div>`);
}
function schedaMese(p) {
  const cs = P.cedolini().filter(c => c.periodo === p); const b = P.bilanciniPaghe().find(x => x.periodo === p);
  openSheet('Personale · ' + P.nomeMese(p), `${b ? `<button class="row" data-act="c-pBil" data-id="${esc(b.id)}"><span class="r-icon">${ic('file-spreadsheet')}</span><span class="r-main"><b>Bilancino paghe</b><span>Lordo ${eu(b.lordo)} · costo aziendale ${eu(b.costo)} · versamenti ${eu(b.versamenti)}</span></span>${ic('chevron-right', 'chev')}</button>` : '<p class="muted">Bilancino paghe non caricato.</p>'}
  <div class="list flat">${cs.map(c => { const v = P.verifica().find(x => x.dip === c.dip && x.periodo === p) || {}; return `<button class="row" data-act="c-pCella" data-dip="${esc(c.dip)}" data-p="${p}"><span class="r-icon">${ic('file-text')}</span><span class="r-main"><b>${esc(c.nome)}</b><span>Netto ${eu(c.netto)} · lordo ${eu(c.lordo)} · ${nf(c.ore, 1)} ore</span></span>${stato(v.stato || '')}</button>`; }).join('')}</div>
  <div class="factions"><span class="sp"></span><button class="btn" data-act="close">Chiudi</button></div>`);
}

/* ---------------- azioni ---------------- */
async function salvaCfg(patch) { await store.put('econfig', 'cfg', Object.assign({}, cfg(), patch)); }
const parseIt = s => { s = String(s || '').trim().replace(/\s|€/g, ''); if (!s) return null; if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.'); const v = parseFloat(s); return isFinite(v) ? v : null; };
export async function personaleAct(a, b, d, rerender) {
  switch (a) {
    case 'c-pDip': return schedaDipendente(d.k);
    case 'c-pCed': return schedaCedolino(d.id);
    case 'c-pBil': return schedaBilancino(d.id);
    case 'c-pMese': return schedaMese(d.p);
    case 'c-pCella': return schedaCella(d.dip, d.p);
    case 'c-pPag': return schedaPagamento(d.id || null, d.id ? {} : Object.assign({}, d.dip ? { dip: d.dip, tipo: 'stipendio' } : {}, d.tipo ? { tipo: d.tipo } : {}, d.comp ? { comp: d.comp } : {}, d.imp ? { importo: r2(+d.imp) } : {}));
    case 'c-pPagSave': {
      const imp = parseIt($('#pg_imp').value); const data = $('#pg_data').value; const tipo = $('#pg_tipo').value; const dip = $('#pg_dip').value;
      if (!data) throw new Error('Scrivi la data del pagamento.'); if (!imp || imp <= 0) throw new Error('Scrivi l\'importo pagato.');
      if (tipo === 'stipendio' && !dip) throw new Error('Scegli il dipendente pagato.');
      const id = d.id || 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      const { id: _o, ...old } = S.pagamenti.find(x => x.id === id) || {}; const modalita = $('#pg_mod').value;
      await store.put('pagamenti', id, Object.assign(old, { data, importo: r2(imp), tipo, dip: tipo === 'stipendio' ? dip : '', comp: $('#pg_comp').value, modalita, descrizione: $('#pg_desc').value.trim(), fonte: old.fonte || 'a mano' }));
      closeSheet(); toast(tipo === 'stipendio' && modalita === 'contanti' ? 'Salvato. Attenzione: gli stipendi non si possono pagare in contanti.' : 'Pagamento salvato'); return;
    }
    case 'c-pPagDel': return arm(b, 'Conferma: elimina', async () => { await store.remove('pagamenti', d.id); closeSheet(); toast('Pagamento eliminato'); });
    case 'c-pDelDoc': return arm(b, 'Conferma: elimina', async () => { await store.remove('paghe', d.id); closeSheet(); toast('Documento eliminato'); });
    case 'c-pAlias': { const id = 'd-' + d.k; const { id: _o, ...old } = S.paghe.find(x => x.id === id) || {}; await store.put('paghe', id, Object.assign(old, { tipo: 'dipendente', dip: d.k, alias: $('#pd_alias').value.trim() })); return toast('Nomi salvati'); }
    case 'c-pIgnora': await salvaCfg({ pagheIgnora: [...new Set([...(cfg().pagheIgnora || []), d.t])] }); return toast('Avviso nascosto');
    case 'c-pIgnoraReset': await salvaCfg({ pagheIgnora: [] }); return toast('Avvisi ripristinati');
    case 'c-pCfg': { const gs = Math.min(31, Math.max(1, parseInt($("#pg_gs").value) || 20)), gf = Math.min(31, Math.max(1, parseInt($('#pg_gf').value) || 16)); await salvaCfg({ paghe: Object.assign({}, cfg().paghe || {}, { giornoStipendi: gs, giornoF24: gf }) }); return toast('Scadenze salvate'); }
    case 'c-pMovCancel': PIMP.righe = null; return rerender();
    case 'c-pMovSave': {
      const sel = PIMP.righe.filter(r => r.sel); if (sel.some(r => r.tipo === 'stipendio' && !r.dip)) throw new Error('Per ogni stipendio scegli il dipendente (o togli la spunta).');
      await store.bulkPut(sel.map(r => ({ col: 'pagamenti', id: r.id, data: P.datiPagamento(Object.assign({ fonte: PIMP.file }, r)) })));
      PIMP.righe = null; toast(`${sel.length} pagamenti salvati`); return rerender();
    }
  }
}
export async function personaleChange(t, rerender) {
  const a = t.dataset.act;
  if (a === 'c-pMovFile' && t.files.length) { const f = [...t.files]; t.value = ''; try { await caricaMovimenti(f); } catch (e) { toast(e.message, 'err'); } return rerender(); }
  if ((a === 'c-pMovSel' || a === 'c-pMovSet') && PIMP.righe) { modificaRiga(PIMP.righe, t); return rerender(); }
}
