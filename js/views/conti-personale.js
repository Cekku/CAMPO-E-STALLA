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
import * as B from '../conti/banca.js';

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
  const rowsD = dips.map(d => { const cs = d.ced.filter(c => c.anno === y); const vs = P.verifica().filter(v => v.dip === d.key && v.periodo.startsWith(y + '-')); const s = k => r2(cs.reduce((t, c) => t + N(c[k]), 0)); return { nome: d.nome, qualifica: [d.qualifica, d.mansione].filter(Boolean).join(' · '), mesi: cs.length, ore: s('ore'), lordo: s('lordo'), ritPrev: s('ritPrev'), irpef: s('irpef'), netto: s('netto'), pagato: r2(vs.reduce((t, v) => t + v.pagato, 0)), saldo: r2(vs.reduce((t, v) => t + v.differenza, 0)), stato: d.stato, prestiti: d.residuoPrestiti, _cls: 'click', _k: d.key }; });
  const td = k => r2(rowsD.reduce((t, r) => t + N(r[k]), 0));
  const tD = tabella('pdip', { title: 'Dipendenti ' + y, sheet: 'Dipendenti ' + y, cols: [{ k: 'nome', h: 'Dipendente' }, { k: 'qualifica', h: 'Qualifica', cls: 'clip' }, { k: 'mesi', h: 'Mesi', fmt: 'int' }, { k: 'ore', h: 'Ore', fmt: 'n1' }, { k: 'lordo', h: 'Lordo', fmt: 'eur2' }, { k: 'ritPrev', h: 'Contributi dip.', fmt: 'eur2' }, { k: 'irpef', h: 'IRPEF', fmt: 'eur2' }, { k: 'netto', h: 'Netto dovuto', fmt: 'eur2' }, { k: 'pagato', h: 'Pagato', fmt: 'eur2' }, { k: 'saldo', h: 'Differenza', fmt: 'eur2', html: r => Math.abs(r.saldo) < 0.01 ? `<span class="esito ok">${ic('circle-check')}in pari</span>` : `<b class="${r.saldo > 0 ? 't-bad' : 't-warn'}">${r.saldo > 0 ? 'mancano ' : 'in più '}${eu(Math.abs(r.saldo))}</b>`, x: r => r.saldo }, { k: 'prestiti', h: 'Prestiti da restituire', fmt: 'eur2' }, { k: 'stato', h: 'Stato' }],
    rows: rowsD, rowAttr: r => `data-act="c-pDip" data-k="${esc(r._k)}"`, tot: { nome: 'Totale', ore: td('ore'), lordo: td('lordo'), ritPrev: td('ritPrev'), irpef: td('irpef'), netto: td('netto'), pagato: td('pagato'), saldo: td('saldo') } });
  const graf = colonne(M.map(r => P.meseCorto(r.periodo)), [{ name: 'Netto ai dipendenti', values: M.map(r => r.netto), color: COL.ven }, { name: 'Contributi e IRPEF', values: M.map(r => r2(N(r.ritDip) + N(r.irpef) + N(r.contrib))), color: COL.acq }, { name: 'TFR', values: M.map(r => N(r.tfr)), color: COL.diff }]);
  return `${barra()}<div class="kpis">${kpi('Costo del personale ' + y, fmtVal(costo, 'eur'), conBil ? `costo aziendale · ${M.length} ${M.length === 1 ? 'mese' : 'mesi'}` : 'retribuzioni lorde (manca il bilancino)', 'users')}${kpi('Netto ai dipendenti', fmtVal(tot('netto'), 'eur'), `${dips.length} dipendenti nell'anno`, 'banknote')}${kpi('Ancora da pagare', fmtVal(tot('dapagare'), 'eur'), tot('dapagare') ? 'stipendi non saldati' : 'stipendi tutti pagati', 'hand-coins', tot('dapagare') ? 't-bad' : '')}${kpi('Irregolarità', String(ano.length), gravi ? `${gravi} gravi` : ano.length ? 'da controllare' : 'nessuna', 'shield-alert', gravi ? 't-bad' : '')}</div>
  ${ano.length ? `<section class="card"><div class="card-h"><h2>${ic('shield-alert')}Da controllare</h2><span class="count">${ano.length}</span><span class="sp"></span><button class="btn sm ghost" data-act="c-pIgnoraTutti">${ic('check')}Ignora tutti</button></div>${listaAnomalie(ano, 6)}</section>` : ''}
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

/* ---------------- stessa persona, anticipi e prestiti ---------------- */
function boxUnione(k, nome) {
  const altri = P.dipendenti().filter(d => d.key !== k);
  if (!altri.length) return '';
  return `<div class="subcard" style="margin-top:14px"><b>${ic('users')}È la stessa persona di un altro dipendente?</b><p class="muted small">Se un nome nei cedolini o nei bonifici è scritto in modo diverso ma è la stessa persona, uniscili: cedolini, pagamenti, anticipi e prestiti finiscono in un'unica scheda. Si può annullare.</p><div class="toolbar"><select class="inp" id="pu_dest"><option value="">Scegli il dipendente…</option>${altri.map(d => `<option value="${esc(d.key)}">${esc(d.nome)}${d.cf ? ' · ' + esc(d.cf) : ''}</option>`).join('')}</select><button class="btn sm" data-act="c-pUnisci" data-k="${esc(k)}" data-nome="${esc(nome || '')}">${ic('check')}Unisci</button></div></div>`;
}
const STATO_PRE = { 'restituito': 'ok', 'in restituzione': 'wa', 'da restituire': 'ko' };
function boxPrestiti(k) {
  const pre = P.prestiti().filter(x => x.dip === k); const ant = P.pagamenti().filter(x => x.tipo === 'anticipo' && x.dip === k);
  const res = r2(pre.reduce((t, x) => t + x.residuo, 0));
  const rP = pre.map(x => `<button class="row" data-act="c-pPag" data-id="${esc(x.id)}"><span class="r-icon">${ic('hand-coins')}</span><span class="r-main"><b>Prestito del ${fd(x.data)} · ${eu(x.importo)}</b><span>Restituiti ${eu(x.restituito)}${x.rata ? ' · rata ' + eu(x.rata) : ''}${x.rimborsi.length ? ' · ' + x.rimborsi.length + (x.rimborsi.length === 1 ? ' restituzione' : ' restituzioni') + ', ultima il ' + fd(x.ultimo) : ''}${x.descrizione ? ' · ' + esc(x.descrizione) : ''}</span></span><span class="esito ${STATO_PRE[x.stato]}">${x.residuo > 0.005 ? 'restano ' + eu(x.residuo) : 'restituito'}</span></button>`).join('');
  const rA = ant.map(x => `<button class="row" data-act="c-pPag" data-id="${esc(x.id)}"><span class="r-icon">${ic('banknote')}</span><span class="r-main"><b>Anticipo del ${fd(x.data)} · ${eu(x.importo)}</b><span>Sullo stipendio di ${P.nomeMese(x.comp || x.data.slice(0, 7))} · ${esc(P.RECUPERO[x.recupero || 'stipendio'])}</span></span>${ic('chevron-right', 'chev')}</button>`).join('');
  return `<div class="card-h"><h3>${ic('hand-coins')}Anticipi e prestiti</h3>${res > 0.005 ? `<span class="esito wa">da restituire ${eu(res)}</span>` : ''}</div>
  ${rP || rA ? `<div class="list flat">${rP}${rA}</div>` : '<p class="muted small">Nessun anticipo o prestito.</p>'}
  <div class="btns" style="margin:8px 0 4px"><button class="btn sm" data-act="c-pPag" data-dip="${esc(k)}" data-tipo="anticipo">${ic('plus')}Anticipo</button><button class="btn sm" data-act="c-pPag" data-dip="${esc(k)}" data-tipo="prestito">${ic('plus')}Prestito</button>${pre.some(x => x.residuo > 0.005) ? `<button class="btn sm" data-act="c-pPag" data-dip="${esc(k)}" data-tipo="rimborso">${ic('rotate-ccw')}Restituzione</button>` : ''}</div>`;
}

/* ---------------- dipendenti ---------------- */
/* ---------------- tabella dei nomi ---------------- */
const optDip = (sel, dips) => `<option value="">— da associare —</option>${dips.map(d => `<option value="${esc(d.key)}"${sel === d.key ? ' selected' : ''}>${esc(d.nome)}${d.omonimo && d.cf ? ' · ' + esc(d.cf) : ''}</option>`).join('')}`;
const rigaNome = (nome, k, nota, dips) => `<tr data-nome><td class="t"><input class="cell-in wide" name="pn_nome" value="${esc(nome)}" placeholder="Nome come compare nel bonifico"></td><td class="t"><select class="cell-in wide" name="pn_dip">${optDip(k, dips)}</select></td><td class="t"><span class="sub">${esc(nota || '')}</span></td><td class="t"><button type="button" class="iconbtn" data-act="c-pNomeDel" aria-label="Togli">${ic('trash-2')}</button></td></tr>`;
function tabellaNomi() {
  const dips = P.dipendenti(); const noti = new Set(dips.map(d => d.key));
  const uso = n => P.pagamenti().filter(p => p.beneficiario && P.nomeChiave(p.beneficiario) === P.nomeChiave(n)).length;
  const righe = dips.flatMap(d => P.aliasDi(d).map(a => [a, d.key, uso(a) ? `${uso(a)} pagamenti` : '']));
  const visti = new Set(righe.map(r => P.nomeChiave(r[0])));
  for (const p of P.pagamenti()) if (P.CON_DIP.has(p.tipo) && p.dip && !noti.has(p.dip)) { const n = p.beneficiario || P.nomeDi(p.dip); if (!visti.has(P.nomeChiave(n))) { visti.add(P.nomeChiave(n)); righe.push([n, '', `${uso(n) || 1} pagamenti senza dipendente`]); } }
  const omo = dips.filter(d => d.omonimo);
  return `<section class="card"><div class="card-h"><h2>${ic('list-checks')}Nomi nei pagamenti</h2><span class="count">${righe.length}</span></div>
  <p class="muted small pad-x">Qui associ a un dipendente i nomi con cui compare nei bonifici e nell'estratto conto quando sono scritti diversamente dal cedolino (es. "SINGH GURINDER." o "SINGH AMARJIT G"). Un nome scritto qui vince sempre sul riconoscimento automatico. Anche quando scegli a mano il dipendente di un bonifico, il nome viene aggiunto qui da solo.</p>
  ${omo.length ? `<div class="note-box warn" style="margin:0 16px 12px">${ic('users')}<span><b>Dipendenti con lo stesso nome:</b> ${[...new Set(omo.map(d => d.nomeCed))].map(n => esc(n) + ' (' + omo.filter(d => d.nomeCed === n).length + ')').join(', ')}. Nei pagamenti il solo nome non basta: usa un nome diverso (es. con una lettera in più) e associalo qui, oppure scegli il dipendente a mano. Puoi anche dare a ognuno un nome da mostrare.</span></div>
  <div class="tablewrap etab"><table><thead><tr><th class="t">Dipendente</th><th class="t">Codice fiscale</th><th class="t">Nato il</th><th class="t">Nome da mostrare nell'app</th></tr></thead><tbody>${omo.map(d => `<tr><td class="t">${esc(d.nomeCed)}</td><td class="t">${esc(d.cf || '')}</td><td class="t">${fd(d.nascita)}</td><td class="t"><input class="cell-in wide" name="pn_et" data-k="${esc(d.key)}" value="${esc(d.etichetta || '')}" placeholder="${esc(d.nome)}"></td></tr>`).join('')}</tbody></table></div>` : ''}
  <form id="nomiForm" class="tablewrap etab" onsubmit="return false"><table><thead><tr><th class="t">Nome nel pagamento</th><th class="t">È il dipendente</th><th class="t"></th><th class="t"></th></tr></thead><tbody>${righe.map(r => rigaNome(r[0], r[1], r[2], dips)).join('')}</tbody></table></form>
  <div class="factions pad-x" style="padding-bottom:16px"><button class="btn sm ghost" data-act="c-pNomeAdd">${ic('plus')}Aggiungi un nome</button><span class="sp"></span><button class="btn sm primary" data-act="c-pNomiSave">${ic('check')}Salva la tabella</button></div></section>`;
}
export function vDipendenti() {
  const ds = P.dipendenti(); if (!ds.length) return vuoto();
  const filtro = UI.f.pd_stato || '';
  const rows = ds.filter(d => !filtro || (filtro === 'forza' ? d.stato === 'In forza' : d.stato !== 'In forza')).map(d => ({ nome: d.nome, cf: d.cf, matricola: d.matricola, qualifica: d.qualifica, mansione: d.mansione, assunzione: d.assunzione, scadTD: d.scadTD, scadPermesso: d.scadPermesso, cessazione: d.cessazione, primo: P.nomeMese(d.primo), ultimo: P.nomeMese(d.ultimo), mesi: d.mesi, netto: d.netto, saldo: d.saldo, avvisi: d.anomalie.filter(a => !ignorate().has(a.testo)).length, stato: d.stato, _cls: 'click', _k: d.key }));
  const t = tabella('panag', { title: 'Anagrafica dei dipendenti', sheet: 'Dipendenti', cols: [{ k: 'nome', h: 'Dipendente', html: r => `${esc(r.nome)}<span class="sub">${esc(r.cf || '')}</span>` }, { k: 'matricola', h: 'Matr.' }, { k: 'qualifica', h: 'Qualifica', cls: 'clip' }, { k: 'mansione', h: 'Mansione', cls: 'clip' }, { k: 'assunzione', h: 'Assunto il', fmt: 'date' }, { k: 'scadTD', h: 'Termine contratto', fmt: 'date', html: r => r.scadTD ? `<span class="${r.scadTD < today() ? 't-bad' : ''}">${fd(r.scadTD)}</span>` : '–' }, { k: 'scadPermesso', h: 'Permesso di soggiorno', fmt: 'date', html: r => r.scadPermesso ? `<span class="${r.scadPermesso < today() ? 't-bad' : ''}">${fd(r.scadPermesso)}</span>` : '–' }, { k: 'ultimo', h: 'Ultimo cedolino' }, { k: 'mesi', h: 'Cedolini', fmt: 'int' }, { k: 'netto', h: 'Netto totale', fmt: 'eur2' }, { k: 'saldo', h: 'Da pagare', fmt: 'eur2' }, { k: 'avvisi', h: 'Avvisi', fmt: 'int', html: r => r.avvisi ? `<span class="esito wa">${ic('triangle-alert')}${r.avvisi}</span>` : '–' }, { k: 'stato', h: 'Stato' }],
    rows, rowAttr: r => `data-act="c-pDip" data-k="${esc(r._k)}"`, freeze: 1 });
  return `${barra()}<div class="chipbar">${[['', 'Tutti'], ['forza', 'In forza'], ['fuori', 'Cessati o con termine scaduto']].map(([v, l]) => `<button data-act="chip" data-f="pd_stato" data-v="${v}" aria-pressed="${filtro === v}">${l}</button>`).join('')}</div><section class="card"><div class="card-h"><h2>${ic('id-card')}Dipendenti</h2><span class="count">${rows.length}</span>${bottoniExport(['panag'], 'Anagrafica dipendenti')}</div>${t}<p class="muted small pad-x">I dati arrivano dall'ultimo cedolino di ogni dipendente. Tocca una riga per vedere i mesi, i pagamenti e gli avvisi.</p></section>${tabellaNomi()}`;
}
export function schedaDipendente(k) {
  const d = P.dipendenti().find(x => x.key === k);
  if (!d) { const ps = P.pagamenti().filter(p => p.dip === k); const nome = P.nomeDi(k); return openSheet(nome, `<div class="note-box">${ic('info')}<span>Non c'è nessun cedolino con questo nome. Se è un dipendente che conosci con un nome diverso, associalo qui sotto; altrimenti carica i suoi cedolini e i pagamenti si collegheranno da soli.</span></div>${boxUnione(k, nome)}<h3 class="sheet-h">Movimenti</h3><div class="list flat">${ps.map(p => `<button class="row" data-act="c-pPag" data-id="${esc(p.id)}"><span class="r-icon">${ic('banknote')}</span><span class="r-main"><b>${fd(p.data)} · ${eu(p.importo)} · ${esc(P.TIPI_PAG[p.tipo] || p.tipo)}</b><span>${esc(p.comp ? P.nomeMese(p.comp) : 'competenza automatica')}${p.descrizione ? ' · ' + esc(p.descrizione) : ''}</span></span>${ic('chevron-right', 'chev')}</button>`).join('')}</div><div class="factions"><span class="sp"></span><button class="btn" data-act="close">Chiudi</button></div>`); }
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
  ${boxPrestiti(k)}
  ${d.uniti.length ? `<p class="muted small" style="margin-top:12px">Uniti a questa scheda: ${d.uniti.map(u => `${esc(u.nome)} <button class="linkbtn" data-act="c-pSepara" data-k="${esc(u.key)}">separa</button>`).join(' · ')}</p>` : ''}
  ${boxUnione(k, '')}
  <div class="fgrid" style="margin-top:14px"><label class="fld half"><span class="flabel">Nomi con cui compare nei bonifici</span><div class="inwrap"><input id="pd_alias" value="${esc(d.alias || '')}" placeholder="Es. SINGH AMARJIT G"></div><small>Separati da virgola. Li trovi anche nella tabella "Nomi nei pagamenti".</small></label><label class="fld half"><span class="flabel">Nome da mostrare nell'app</span><div class="inwrap"><input id="pd_et" value="${esc(d.etichetta || '')}" placeholder="${esc(d.nome)}"></div><small>${d.omonimo ? 'C\'è un altro dipendente con lo stesso nome: dai a ognuno un nome diverso.' : 'Facoltativo.'}</small></label></div>
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
      rows: cs.map(c => Object.assign({ mese: P.nomeMese(c.periodo), ctrl: (c.controlli || []).every(k => k.esito === 'OK') ? 'OK' : 'da verificare', ok: (c.controlli || []).every(k => k.esito === 'OK'), _cls: 'click' }, c, { nome: P.nomeDi(c.dip) })), rowAttr: r => `data-act="c-pCed" data-id="${esc(r.id)}"`,
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
  <div class="subcard" style="margin-top:14px"><b>${ic('users')}Questo cedolino è di un altro dipendente?</b><p class="muted small">Se ${esc(c.nome)} è la stessa persona di un altro dipendente (nome scritto in modo diverso, codice fiscale corretto dopo), scegli quale: tutti i cedolini con questo nome vanno nella sua scheda.</p><div class="toolbar"><select class="inp" id="pu_dest"><option value="">Scegli il dipendente…</option>${P.dipendenti().filter(d => d.key !== c.dip).map(d => `<option value="${esc(d.key)}">${esc(d.nome)}</option>`).join('')}</select><button class="btn sm" data-act="c-pUnisci" data-k="${esc(c.dipOrig || c.dip)}" data-nome="${esc(c.nome)}">${ic('check')}Assegna</button></div></div>
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
const PIMP = { righe: null, file: '', altri: 0, busy: '' };
let rerenderP = () => { };
export function vPagamenti() {
  const y = UI.anno; const tp = UI.f.pp_tipo || '';
  const ps = P.pagamenti().filter(p => (p.data || '').startsWith(y + '-') && (!tp || p.tipo === tp));
  const tot = r2(ps.filter(p => p.tipo !== 'rimborso').reduce((t, p) => t + N(p.importo), 0));
  const imp = PIMP.righe || PIMP.busy ? anteprimaMov() : '';
  const t = tabella('ppag', { title: 'Pagamenti ' + y, sheet: 'Pagamenti ' + y, cols: [{ k: 'data', h: 'Data', fmt: 'date' }, { k: 'tipoN', h: 'Tipo' }, { k: 'chi', h: 'Dipendente o descrizione', cls: 'w' }, { k: 'compN', h: 'Competenza' }, { k: 'modN', h: 'Modalità', html: r => r.modalita === 'contanti' && r.tipo === 'stipendio' ? `<span class="esito ko">${ic('octagon-x')}contanti</span>` : esc(r.modN) }, { k: 'importo', h: 'Importo', fmt: 'eur2', html: r => r.tipo === 'rimborso' ? `<span class="t-ok">+${eu(r.importo)}</span>` : eu(r.importo) }, { k: 'fonte', h: 'Inserito da', cls: 'clip' }],
    rows: ps.map(p => Object.assign({ tipoN: P.TIPI_PAG[p.tipo] || p.tipo, chi: p.dip ? nomeDip(p.dip) || p.descrizione : p.descrizione || '', compN: p.tipo === 'prestito' ? '—' : p.comp ? (/T\d$/.test(p.comp) ? p.comp.replace('-T', ' · trimestre ') : P.nomeMese(p.comp)) : p.tipo === 'stipendio' && P.compCausale(p) ? P.nomeMese(P.compCausale(p)) + ' (dalla causale)' : 'automatica', modN: p.tipo === 'rimborso' ? (P.COME_RIMB[p.come] || '') : P.MODALITA[p.modalita] || '', _cls: 'click' }, p)), rowAttr: r => `data-act="c-pPag" data-id="${esc(r.id)}"`, tot: { data: 'Totale', importo: tot } });
  return `<div class="toolbar">${miniTabs('pp_tipo', [['', 'Tutti'], ...Object.entries(P.TIPI_PAG).map(([k, l]) => [k, l.split(' (')[0]])], tp)}<span class="sp"></span><button class="btn sm" data-act="c-pPag">${ic('plus')}Registra pagamento</button><label class="btn sm">${ic('file-up')}Estratto conto o bonifici (PDF, Excel, CSV)<input type="file" accept=".csv,.txt,.xlsx,.pdf" multiple data-act="c-pMovFile" hidden></label></div>
  ${imp}<section class="card"><div class="card-h"><h2>${ic('banknote')}Pagamenti ${y}</h2><span class="count">${ps.length}</span>${bottoniExport(['ppag'], 'Pagamenti personale ' + y)}</div>${ps.length ? t : empty('banknote', 'Nessun pagamento registrato', 'Registra gli stipendi pagati, gli F24 e i contributi, oppure carica l\'estratto conto della banca: i bonifici ai dipendenti si riconoscono dal nome.')}</section>
  <p class="muted small pad-x">Gli anticipi che togli tu dal bonifico e le rate di prestito tolte dallo stipendio contano come stipendio pagato di quel mese. Le restituzioni (in verde) non sono uscite e non entrano nel totale. Lo stipendio pagato va al mese indicato; se scegli "automatica" va al mese più vecchio ancora da saldare. Gli F24 coprono le ritenute IRPEF del mese prima, i contributi INPS agricoli si pagano per trimestre.</p>`;
}
/** Tabella di revisione dei movimenti o dei bonifici letti (k = indice del documento in "Carica documenti"). */
export function tabellaMovimenti(R, k = '', tutti = false) {
  const dips = P.dipendenti(); const dk = k !== '' ? ` data-k="${k}"` : '';
  const nAltri = R.filter(r => r.altro && !r.sel).length;
  const vis = R.map((r, i) => [r, i]).filter(([r]) => tutti || !r.altro || r.sel);
  const compOpt = r => `<option value="">automatica</option>${[...new Set([...P.periodi(), ...(r.comp ? [r.comp] : [])])].sort().map(p => `<option value="${p}"${r.comp === p ? ' selected' : ''}>${P.nomeMese(p)}</option>`).join('')}`;
  const dipOpt = r => `<option value="">—</option>${dips.map(d => `<option value="${esc(d.key)}"${r.dip === d.key ? ' selected' : ''}>${esc(d.nome)}</option>`).join('')}${r.dip && !dips.some(d => d.key === r.dip) ? `<option value="${esc(r.dip)}" selected>${esc(r.beneficiario || P.nomeDi(r.dip))} (senza cedolini)</option>` : ''}`;
  const fattOpt = r => { const auto = r.fatt && r.fatt.length > 1 ? `<option value="${esc(r.fatt.join(','))}" selected>${r.fatt.length} fatture insieme: ${esc(r.fatt.map(id => (S.fatture.find(f => f.id === id) || {}).numero).join(', '))}</option>` : ''; return `<option value="">— scegli la fattura —</option>${auto}${(r.proposte || []).map(o => `<option value="${esc(o.id)}"${r.fatt && r.fatt.length === 1 && r.fatt[0] === o.id ? ' selected' : ''}>${esc(o.testo)}</option>`).join('')}`; };
  const tipi = r => Object.entries(B.TIPI_MOV).filter(([t]) => !r.entrata || t === 'fattura' || t === 'ignora');
  const cella = (r, i) => r.tipo === 'fattura' ? `<select class="cell-in wide" data-act="c-pMovSet" data-i="${i}"${dk} data-f="fatt">${fattOpt(r)}</select>${r.motivo ? `<span class="sub">trovata per ${esc(r.motivo)}</span>` : ''}` : P.CON_DIP.has(r.tipo) ? `<select class="cell-in" data-act="c-pMovSet" data-i="${i}"${dk} data-f="dip">${dipOpt(r)}</select>` : '<span class="muted">—</span>';
  return `<div class="tablewrap etab"><table><thead><tr><th class="t"></th><th class="t">Data</th><th class="t">Descrizione</th><th class="n">Importo</th><th class="t">Tipo</th><th class="t">Dipendente o fattura</th><th class="t">Competenza</th></tr></thead><tbody>${vis.map(([r, i]) => `<tr${r.gia ? ' class="muted"' : ''}><td class="t"><input type="checkbox" data-act="c-pMovSel" data-i="${i}"${dk}${r.sel ? ' checked' : ''}></td><td class="t nw">${fd(r.data)}</td><td class="t clip" title="${esc(r.descrizione)}">${esc(r.beneficiario || r.descrizione)}<span class="sub">${r.ambigui && !r.dip ? `<b class="t-warn">${r.ambigui.length} dipendenti con questo nome: scegli quale</b>` : r.doppio ? `<b class="t-warn">${esc(r.doppio)}</b>` : r.gia ? 'già registrato' : esc(r.causale || (r.beneficiario ? '' : '') || (r.nuovo ? 'non è ancora nei cedolini caricati' : r.descrizione.slice(0, 90)))}</span></td><td class="n">${r.entrata ? `<span class="t-ok">+${eu(r.importo)}</span>` : eu(r.importo)}</td><td class="t"><select class="cell-in" data-act="c-pMovSet" data-i="${i}"${dk} data-f="tipo">${tipi(r).map(([t, l]) => `<option value="${t}"${r.tipo === t ? ' selected' : ''}>${esc(t === 'fattura' ? (r.entrata ? 'Incasso fattura' : 'Pagamento fattura') : l)}</option>`).join('')}</select></td><td class="t">${cella(r, i)}</td><td class="t">${P.CON_DIP.has(r.tipo) || ['f24', 'contributi', 'fondo'].includes(r.tipo) ? `<select class="cell-in" data-act="c-pMovSet" data-i="${i}"${dk} data-f="comp">${compOpt(r)}</select>` : '<span class="muted">—</span>'}</td></tr>`).join('')}</tbody></table></div>${nAltri ? `<button class="more-btn" data-act="c-pMovTutti"${dk}>${tutti ? 'Nascondi' : 'Mostra'} gli altri ${nAltri} movimenti non riconosciuti</button>` : ''}`;
}
/** Applica una modifica fatta nella tabella di revisione. */
export function modificaRiga(R, t) {
  const r = R[+t.dataset.i]; if (!r) return;
  if (t.dataset.act === 'c-pMovSel') { r.sel = t.checked; return; }
  const f = t.dataset.f;
  if (f === 'fatt') r.fatt = t.value ? t.value.split(',') : [];
  else r[f] = t.value;
  if (f === 'tipo' && !P.CON_DIP.has(t.value)) r.dip = '';
  if (f === 'tipo' && t.value === 'fattura' && !(r.fatt || []).length && (r.proposte || []).length === 1) r.fatt = [r.proposte[0].id];
  r.sel = r.tipo === 'ignora' ? false : r.tipo === 'fattura' ? !!(r.fatt || []).length : P.CON_DIP.has(r.tipo) ? !!r.dip : true;
}
function anteprimaMov() {
  if (PIMP.busy) return `<section class="card"><div class="empty slim">${ic('scan-search')}<b>${esc(PIMP.busy)}</b></div></section>`;
  const R = PIMP.righe; const sel = R.filter(r => r.sel).length; const ric = R.filter(r => !r.altro).length;
  return `<section class="card"><div class="card-h"><h2>${ic(PIMP.pdf ? 'file-text' : 'file-spreadsheet')}${PIMP.estratto ? 'Estratto conto' : PIMP.pdf ? 'Bonifici' : 'Movimenti'} · ${esc(PIMP.file)}</h2><span class="sp"></span><button class="btn sm ghost" data-act="c-pMovCancel">${ic('x')}Annulla</button><button class="btn sm primary" data-act="c-pMovSave"${sel ? '' : ' disabled'}>${ic('check')}Salva ${sel}</button></div>
  <p class="muted small pad-x">${R.length} movimenti letti${PIMP.ocr ? ' con la lettura ottica (controlla gli importi)' : ''}: ${ric} riconosciuti come stipendi, F24, contributi o fatture${PIMP.altri ? `, altre ${PIMP.altri} uscite ignorate` : ''}. Il dipendente si riconosce dal nome o dall'IBAN, la fattura dalla controparte, dall'importo o dal numero nella causale. Controlla prima di salvare; quelli già registrati non sono selezionati.</p>
  ${tabellaMovimenti(R, '', PIMP.tutti)}</section>`;
}
async function caricaMovimenti(files) {
  const pdf = files.filter(f => /\.pdf$/i.test(f.name)), altriF = files.filter(f => !/\.pdf$/i.test(f.name));
  if (pdf.length) {
    const { leggiBonifici, pareBonifico } = await import('../conti/bonifici-parse.js'); const B2 = await import('../conti/banca.js'); const { leggiPdf, testoPagina } = await import('../conti/pdftext.js');
    const righe = []; const err = []; let est = false, ocr = false;
    for (const f of pdf) {
      try {
        const bytes = new Uint8Array(await f.arrayBuffer()); const pg = await leggiPdf(bytes); const t = pg.slice(0, 2).map(testoPagina).join('\n');
        if (pareBonifico(t)) { righe.push(...P.righeBonifici(await leggiBonifici(null, pg), f.name)); continue; }
        est = true; if (!pg.some(p => p.chars.length > 50)) { ocr = true; PIMP.busy = `Lettura ottica di ${f.name}… (la prima volta scarica circa 6 MB)`; rerenderP(); }
        const movs = await B2.leggiEstrattoPdf(bytes, p => { PIMP.busy = `Lettura ottica di ${f.name}: ${Math.round(p * 100)}%`; rerenderP(); });
        if (!movs.length) throw new Error('nessun movimento trovato (servono le colonne data, importo e descrizione)');
        righe.push(...await B2.righeEstratto(movs, f.name));
      } catch (e) { err.push(f.name + ': ' + e.message); }
    }
    PIMP.busy = '';
    if (err.length) toast(err.join(' · '), 'err');
    if (righe.length > 1) P.segnaDoppi(righe.map(r => Object.assign(r, r.doppio && r.doppio.startsWith('uguale') ? { gia: false, doppio: '' } : {})));
    if (righe.length) Object.assign(PIMP, { righe, file: pdf.length === 1 ? pdf[0].name : pdf.length + ' file', altri: 0, pdf: true, estratto: est, ocr, tutti: false });
    return;
  }
  const file = altriF[0];
  const mv = await P.leggiMovimenti(file.name, new Uint8Array(await file.arrayBuffer()));
  const B2 = await import('../conti/banca.js');
  const righe = await B2.righeEstratto(mv.map(m => B2.arricchisci(Object.assign({}, m, { importo: -m.importo }))), file.name);
  if (!righe.length) throw new Error('Nel file non ci sono movimenti in uscita.');
  Object.assign(PIMP, { righe, file: file.name, altri: 0, pdf: false, estratto: true, ocr: false, tutti: false });
}
export function schedaPagamento(id, pre = {}) {
  const p = id ? (P.pagamenti().find(x => x.id === id) || S.pagamenti.find(x => x.id === id)) : null; const v = Object.assign({ data: today(), tipo: 'stipendio', modalita: 'bonifico', recupero: 'stipendio', come: 'stipendio' }, p || {}, pre);
  const dips = P.dipendenti(); const vers = P.versamenti();
  const trim = [...new Set(vers.filter(x => /T\d$/.test(x.periodo)).map(x => x.periodo))];
  // mesi: quelli dei cedolini più gli ultimi 14 e il prossimo (per anticipi di mesi non ancora in busta)
  const mesi = new Set(P.periodi()); let m = P.meseSucc(today().slice(0, 7)); for (let n = 0; n < 16; n++) { mesi.add(m); m = P.mesePrec(m); } if (v.comp && !/T\d$/.test(v.comp)) mesi.add(v.comp); { const yy = +today().slice(0, 4); for (const y of [yy, yy - 1]) { mesi.add(y + '-13'); mesi.add(y + '-14'); } }
  const dipNoti = dips.some(d => d.key === v.dip);
  const preAperti = P.prestiti().filter(x => x.residuo > 0.005 || x.id === v.prestito);
  openSheet(p ? (P.TIPI_PAG[v.tipo] || 'Pagamento') : 'Registra pagamento o anticipo', `<div class="fgrid" id="pgForm">
  <label class="fld half"><span class="flabel">Tipo</span><div class="inwrap"><select id="pg_tipo">${Object.entries(P.TIPI_PAG).map(([k, l]) => `<option value="${k}"${v.tipo === k ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></div></label>
  <label class="fld half" data-per="stipendio anticipo prestito rimborso"><span class="flabel">Dipendente</span><div class="inwrap"><select id="pg_dip"><option value="">—</option>${dips.map(d => `<option value="${esc(d.key)}"${v.dip === d.key ? ' selected' : ''}>${esc(d.nome)}</option>`).join('')}${v.dip && !dipNoti ? `<option value="${esc(v.dip)}" selected>${esc(P.nomeDi(v.dip))} (senza cedolini)</option>` : ''}</select></div></label>
  <label class="fld half"><span class="flabel">Data</span><div class="inwrap"><input id="pg_data" type="date" value="${esc(v.data || '')}"></div></label>
  <label class="fld half"><span class="flabel">Importo (€)</span><div class="inwrap"><input id="pg_imp" inputmode="decimal" value="${v.importo != null ? esc(String(v.importo).replace('.', ',')) : ''}" placeholder="0,00"></div></label>
  <label class="fld half" data-per="stipendio anticipo prestito f24 contributi fondo altro"><span class="flabel">Modalità</span><div class="inwrap"><select id="pg_mod">${Object.entries(P.MODALITA).map(([k, l]) => `<option value="${k}"${v.modalita === k ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></div></label>
  <label class="fld half" data-per="rimborso"><span class="flabel">Come è stato restituito</span><div class="inwrap"><select id="pg_come">${Object.entries(P.COME_RIMB).map(([k, l]) => `<option value="${k}"${v.come === k ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></div></label>
  <label class="fld half" data-per="rimborso"><span class="flabel">Prestito</span><div class="inwrap"><select id="pg_pre"><option value="">il più vecchio ancora aperto</option>${preAperti.map(x => `<option value="${esc(x.id)}" data-dip="${esc(x.dip)}"${v.prestito === x.id ? ' selected' : ''}>${esc(P.nomeDi(x.dip))} · ${fd(x.data)} · restano ${eu(x.residuo)}</option>`).join('')}</select></div></label>
  <label class="fld half" data-per="anticipo"><span class="flabel">Come lo recuperi</span><div class="inwrap"><select id="pg_rec">${Object.entries(P.RECUPERO).map(([k, l]) => `<option value="${k}"${v.recupero === k ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></div></label>
  <label class="fld half" data-per="prestito"><span class="flabel">Rata prevista al mese (€)</span><div class="inwrap"><input id="pg_rata" inputmode="decimal" value="${v.rata != null ? esc(String(v.rata).replace('.', ',')) : ''}" placeholder="facoltativa"></div></label>
  <label class="fld half" data-per="stipendio anticipo rimborso f24 contributi fondo altro"><span class="flabel" id="pg_compL">Competenza</span><div class="inwrap"><select id="pg_comp"><option value="">automatica</option><optgroup label="Mesi">${[...mesi].sort().reverse().map(x => `<option value="${x}"${v.comp === x ? ' selected' : ''}>${P.nomeMese(x)}</option>`).join('')}</optgroup>${trim.length ? `<optgroup label="Trimestri (contributi e fondo)">${trim.map(x => `<option value="${x}"${v.comp === x ? ' selected' : ''}>${x.replace('-T', ' · trimestre ')}</option>`).join('')}</optgroup>` : ''}</select></div></label>
  <label class="fld"><span class="flabel">Descrizione</span><div class="inwrap"><input id="pg_desc" value="${esc(v.descrizione || '')}" placeholder="Causale, motivo del prestito, numero dell'F24…"></div></label>
  <p class="fld muted small" id="pg_help"></p></div>
  <div class="factions">${p ? `<button class="btn ghost danger" data-act="c-pPagDel" data-id="${esc(p.id)}">${ic('trash-2')}Elimina</button>` : ''}<span class="sp"></span><button class="btn" data-act="close">Annulla</button><button class="btn primary" data-act="c-pPagSave" data-id="${esc(p ? p.id : '')}">${ic('check')}Salva</button></div>`);
  const HELP = { stipendio: 'Il netto pagato va al mese scelto; con "automatica" al mese più vecchio ancora da saldare.', anticipo: 'Soldi dati prima dello stipendio. Se lo togli tu dal bonifico, conta come stipendio pagato del mese scelto (di solito quello in corso). Se lo trattiene il consulente in busta, il netto del cedolino è già più basso: l\'app controlla che la trattenuta ci sia.', prestito: 'Soldi prestati da restituire nel tempo. Registra poi ogni restituzione: l\'app tiene il conto di quanto manca.', rimborso: 'Rata del prestito. Se la togli dal bonifico dello stipendio conta come stipendio pagato del mese scelto; se è trattenuta in busta o versata dal dipendente riduce solo il debito.', f24: 'Ritenute IRPEF dei dipendenti, del mese scelto.', contributi: 'Contributi INPS agricoli, di solito per trimestre.', fondo: 'Quote di TFR versate al fondo pensione.', altro: '' };
  const agg = () => {
    const t = $('#pg_tipo').value; $$('#pgForm [data-per]').forEach(el => { el.hidden = !el.dataset.per.split(' ').includes(t); });
    $('#pg_compL').textContent = t === 'anticipo' ? 'Stipendio da cui si scala' : t === 'rimborso' ? 'Stipendio da cui è tolta' : 'Competenza';
    const come = $('#pg_come').value; if (t === 'rimborso') $('#pg_comp').closest('[data-per]').hidden = come !== 'stipendio';
    if (t === 'anticipo') $('#pg_comp').closest('[data-per]').hidden = false;
    $('#pg_help').textContent = HELP[t] || '';
  };
  $('#pg_tipo').onchange = agg; $('#pg_come').onchange = agg;
  $('#pg_pre').onchange = () => { const o = $('#pg_pre').selectedOptions[0]; if (o && o.dataset.dip) $('#pg_dip').value = o.dataset.dip; };
  agg();
}

/* ---------------- anticipi e prestiti ---------------- */
export function vPrestiti() {
  const y = UI.anno; const pre = P.prestiti(); const ant = P.pagamenti().filter(p => p.tipo === 'anticipo' && (p.data || '').startsWith(y + '-'));
  const aperti = pre.filter(x => x.residuo > 0.005); const res = r2(aperti.reduce((t, x) => t + x.residuo, 0));
  const erog = r2(pre.filter(x => (x.data || '').startsWith(y + '-')).reduce((t, x) => t + x.importo, 0));
  const rest = r2(pre.flatMap(x => x.rimborsi).filter(r => (r.data || '').startsWith(y + '-')).reduce((t, r) => t + r.importo, 0));
  const totA = r2(ant.reduce((t, p) => t + N(p.importo), 0));
  const tP = tabella('ppre', { title: 'Prestiti ai dipendenti', sheet: 'Prestiti', cols: [{ k: 'nome', h: 'Dipendente' }, { k: 'data', h: 'Data', fmt: 'date' }, { k: 'importo', h: 'Prestato', fmt: 'eur2' }, { k: 'rata', h: 'Rata prevista', fmt: 'eur2' }, { k: 'restituito', h: 'Restituito', fmt: 'eur2' }, { k: 'residuo', h: 'Da restituire', fmt: 'eur2', html: r => r.residuo > 0.005 ? `<b class="t-warn">${eu(r.residuo)}</b>` : '–' }, { k: 'n', h: 'Restituzioni', fmt: 'int' }, { k: 'ultimo', h: 'Ultima', fmt: 'date' }, { k: 'descrizione', h: 'Note', cls: 'clip' }, { k: 'stato', h: 'Stato', html: r => `<span class="esito ${STATO_PRE[r.stato]}">${esc(r.stato)}</span>` }],
    rows: pre.map(x => Object.assign({ nome: P.nomeDi(x.dip), n: x.rimborsi.length, _cls: 'click' }, x)), rowAttr: r => `data-act="c-pPag" data-id="${esc(r.id)}"`, tot: { nome: 'Totale', importo: r2(pre.reduce((t, x) => t + x.importo, 0)), restituito: r2(pre.reduce((t, x) => t + x.restituito, 0)), residuo: res } });
  const rR = pre.flatMap(x => x.rimborsi.map(r => ({ id: r.id, data: r.data, nome: P.nomeDi(x.dip), prestito: fd(x.data) + ' · ' + eu(x.importo), importo: r.importo, come: P.COME_RIMB[r.come] || '', _cls: 'click' }))).sort((a, b) => (b.data || '').localeCompare(a.data || ''));
  const tR = tabella('prim', { title: 'Restituzioni dei prestiti', sheet: 'Restituzioni', cols: [{ k: 'data', h: 'Data', fmt: 'date' }, { k: 'nome', h: 'Dipendente' }, { k: 'prestito', h: 'Prestito' }, { k: 'importo', h: 'Importo', fmt: 'eur2' }, { k: 'come', h: 'Come' }], rows: rR, rowAttr: r => `data-act="c-pPag" data-id="${esc(r.id)}"` });
  const tA = tabella('pant', { title: 'Anticipi sullo stipendio ' + y, sheet: 'Anticipi ' + y, cols: [{ k: 'data', h: 'Data', fmt: 'date' }, { k: 'nome', h: 'Dipendente' }, { k: 'importo', h: 'Importo', fmt: 'eur2' }, { k: 'mese', h: 'Stipendio da cui si scala' }, { k: 'rec', h: 'Recupero' }, { k: 'modN', h: 'Modalità', html: r => r.modalita === 'contanti' ? `<span class="esito ko">${ic('octagon-x')}contanti</span>` : esc(r.modN) }],
    rows: ant.map(p => Object.assign({ nome: P.nomeDi(p.dip), mese: P.nomeMese(p.comp || p.data.slice(0, 7)), rec: P.RECUPERO[p.recupero || 'stipendio'], modN: P.MODALITA[p.modalita] || '', _cls: 'click' }, p)), rowAttr: r => `data-act="c-pPag" data-id="${esc(r.id)}"`, tot: { data: 'Totale', importo: totA } });
  return `<div class="toolbar"><span class="sp"></span><button class="btn sm" data-act="c-pPag" data-tipo="anticipo">${ic('plus')}Anticipo</button><button class="btn sm" data-act="c-pPag" data-tipo="prestito">${ic('plus')}Prestito</button><button class="btn sm" data-act="c-pPag" data-tipo="rimborso"${aperti.length ? '' : ' disabled'}>${ic('rotate-ccw')}Restituzione</button></div>
  <div class="kpis">${kpi('Prestiti da restituire', fmtVal(res, 'eur'), aperti.length ? `${aperti.length} ${aperti.length === 1 ? 'prestito aperto' : 'prestiti aperti'}` : 'nessun prestito aperto', 'hand-coins', res ? 't-warn' : '')}${kpi('Prestato nel ' + y, fmtVal(erog, 'eur'), 'nuovi prestiti', 'banknote')}${kpi('Restituito nel ' + y, fmtVal(rest, 'eur'), 'rate e restituzioni', 'rotate-ccw')}${kpi('Anticipi ' + y, fmtVal(totA, 'eur'), `${ant.length} anticipi sullo stipendio`, 'coins')}</div>
  <section class="card"><div class="card-h"><h2>${ic('hand-coins')}Prestiti</h2><span class="count">${pre.length}</span>${bottoniExport(['ppre', 'prim'], 'Prestiti ai dipendenti')}</div>${pre.length ? tP : empty('hand-coins', 'Nessun prestito', 'Registra i soldi prestati ai dipendenti e le restituzioni: l\'app tiene il conto di quanto manca per ognuno.')}</section>
  ${rR.length ? `<section class="card"><div class="card-h"><h2>${ic('rotate-ccw')}Restituzioni</h2></div>${tR}</section>` : ''}
  <section class="card"><div class="card-h"><h2>${ic('coins')}Anticipi sullo stipendio ${y}</h2>${bottoniExport(['pant'], 'Anticipi ' + y)}</div>${ant.length ? tA : empty('coins', 'Nessun anticipo nel ' + y, 'Un anticipo conta come stipendio pagato del mese da cui lo scali, così la verifica dei pagamenti torna.')}</section>`;
}

/* ---------------- verifica ---------------- */
export function vVerifica() {
  if (!S.paghe.length) return vuoto();
  const y = UI.anno; const ver = P.verifica().filter(v => v.periodo.startsWith(y + '-'));
  const per = [...new Set(ver.map(v => v.periodo))].sort((a, b) => P.pagabileDa(a).localeCompare(P.pagabileDa(b)) || a.localeCompare(b));
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
  return `<section class="card"><div class="card-h"><h2>${ic('shield-check')}Irregolarità e controlli</h2><span class="count">${ano.length}</span><span class="sp"></span>${ano.length ? `<button class="btn sm ghost" data-act="c-pIgnoraTutti">${ic('check')}Ignora tutti</button>` : ''}${ign ? `<button class="btn sm ghost" data-act="c-pIgnoraReset">${ic('rotate-ccw')}Mostra di nuovo i ${ign} ignorati</button>` : ''}</div>${listaAnomalie(ano)}</section>
  <section class="card"><div class="card-h"><h2>${ic('users')}Stipendi ${y}: dovuto e pagato</h2>${bottoniExport(['pver', 'pvers'], 'Verifica pagamenti personale ' + y)}</div>${matrice}</section>
  <section class="card"><div class="card-h"><h2>${ic('list-checks')}Dettaglio stipendi</h2></div>${tV}</section>
  <section class="card"><div class="card-h"><h2>${ic('landmark')}F24, contributi e fondo pensione</h2></div>${vers.length ? tS : '<div class="empty slim">Servono i bilancini delle paghe per sapere quanto versare.</div>'}</section>
  <section class="card"><div class="card-h"><h2>${ic('calendar')}Scadenze usate nei controlli</h2></div><div class="toolbar pad-x" style="padding-bottom:16px"><label>Stipendi entro il giorno <input class="inp yr-in" id="pg_gs" style="width:64px" inputmode="numeric" value="${cp.giornoStipendi}"> del mese dopo</label><label>F24 entro il giorno <input class="inp yr-in" id="pg_gf" style="width:64px" inputmode="numeric" value="${cp.giornoF24}"></label><button class="btn sm" data-act="c-pCfg">${ic('check')}Salva</button></div></section>`;
}
function schedaCella(dk, p) {
  const v = P.verifica().find(x => x.dip === dk && x.periodo === p); if (!v) return;
  const c = P.cedolini().find(x => x.dip === dk && x.periodo === p);
  openSheet(`${nomeDip(dk)} · ${P.nomeMese(p)}`, `<dl class="inv-head"><div><dt>Netto dovuto</dt><dd>${eu(v.dovuto)}</dd></div><div><dt>Pagato</dt><dd>${eu(v.pagato)}</dd></div><div><dt>Differenza</dt><dd class="${v.differenza > 0.005 ? 't-bad' : v.differenza < -0.005 ? 't-warn' : 't-ok'}">${eu(v.differenza)}</dd></div><div><dt>Scadenza</dt><dd>${fd(v.scadenza)}</dd></div><div><dt>Esito</dt><dd>${stato(v.stato)}</dd></div></dl>
  <h3 class="sheet-h">Pagamenti abbinati</h3>${v.pag.length ? `<div class="list flat">${v.pag.map(x => `<button class="row" data-act="c-pPag" data-id="${esc(x.id)}"><span class="r-icon">${ic('banknote')}</span><span class="r-main"><b>${fd(x.data)} · ${eu(x.importo)}</b><span>${x.tipo && x.tipo !== 'stipendio' ? esc(P.TIPI_PAG[x.tipo]) + ' · ' : ''}${x.tot !== x.importo ? `parte di un pagamento di ${eu(x.tot)} · ` : ''}${esc(P.MODALITA[x.modalita] || '')}</span></span>${ic('chevron-right', 'chev')}</button>`).join('')}</div>` : '<p class="muted">Nessun pagamento per questo mese.</p>'}
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
      if (!data) throw new Error('Scrivi la data.'); if (!imp || imp <= 0) throw new Error('Scrivi l\'importo.');
      if (P.CON_DIP.has(tipo) && !dip) throw new Error('Scegli il dipendente.');
      const id = d.id || 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      const { id: _o, ...old } = S.pagamenti.find(x => x.id === id) || {}; const modalita = $('#pg_mod').value;
      const rec = Object.assign(old, { data, importo: r2(imp), tipo, dip: P.CON_DIP.has(tipo) ? dip : '', comp: tipo === 'prestito' || (tipo === 'rimborso' && $('#pg_come').value !== 'stipendio') ? '' : $('#pg_comp').value, modalita: tipo === 'rimborso' ? '' : modalita, descrizione: $('#pg_desc').value.trim(), fonte: old.fonte || 'a mano', dipManuale: P.CON_DIP.has(tipo) && (!old.fonte || old.fonte === 'a mano' || old.dip !== dip || !!old.dipManuale) });
      for (const k of ['recupero', 'come', 'prestito', 'rata']) delete rec[k];
      if (tipo === 'anticipo') rec.recupero = $('#pg_rec').value;
      if (tipo === 'rimborso') { rec.come = $('#pg_come').value; rec.prestito = $('#pg_pre').value || ''; }
      if (tipo === 'prestito') { const rt = parseIt($('#pg_rata').value); if (rt) rec.rata = r2(rt); }
      await store.put('pagamenti', id, rec);
      closeSheet(); toast((tipo === 'stipendio' || tipo === 'anticipo') && modalita === 'contanti' ? 'Salvato. Attenzione: stipendi e anticipi non si possono pagare in contanti.' : 'Salvato'); return;
    }
    case 'c-pNomeAdd': { const tb = $('#nomiForm tbody'); if (tb) { tb.insertAdjacentHTML('beforeend', rigaNome('', '', '', P.dipendenti())); tb.lastElementChild.querySelector('input').focus(); } return; }
    case 'c-pNomeDel': { const tr = b.closest('tr'); if (tr) tr.remove(); return; }
    case 'c-pNomiSave': {
      const righe = $$('#nomiForm tr[data-nome]').map(tr => [tr.querySelector('[name=pn_nome]').value.trim(), tr.querySelector('[name=pn_dip]').value]).filter(r => r[0]);
      const senza = righe.filter(r => !r[1]).length;
      const dop = new Map(); for (const [n, k] of righe.filter(r => r[1])) { const c = P.nomeChiave(n); if (dop.has(c) && dop.get(c) !== k) throw new Error(`"${n}" è associato a due dipendenti diversi.`); dop.set(c, k); }
      const et = {}; $$('[name=pn_et]').forEach(i => (et[i.dataset.k] = i.value.trim()));
      await P.salvaNomi(righe.filter(r => r[1]), et); return toast(senza ? `Tabella salvata (${senza} nomi ancora da associare)` : 'Tabella dei nomi salvata');
    }
    case 'c-pUnisci': { const a = $('#pu_dest') && $('#pu_dest').value; if (!a) throw new Error('Scegli il dipendente.'); await P.unisci(d.k, a, d.nome); closeSheet(); toast('Uniti: ora è un solo dipendente'); return; }
    case 'c-pSepara': await P.separa(d.k); closeSheet(); return toast('Separati');
    case 'c-pPagDel': return arm(b, 'Conferma: elimina', async () => { await store.remove('pagamenti', d.id); closeSheet(); toast('Pagamento eliminato'); });
    case 'c-pDelDoc': return arm(b, 'Conferma: elimina', async () => { await store.remove('paghe', d.id); closeSheet(); toast('Documento eliminato'); });
    case 'c-pAlias': { const id = 'd-' + d.k; const { id: _o, ...old } = S.paghe.find(x => x.id === id) || {}; await store.put('paghe', id, Object.assign(old, { tipo: 'dipendente', dip: d.k, alias: $('#pd_alias').value.trim(), etichetta: $('#pd_et') ? $('#pd_et').value.trim() : old.etichetta || '' })); closeSheet(); return toast('Nomi salvati'); }
    case 'c-pIgnora': await salvaCfg({ pagheIgnora: [...new Set([...(cfg().pagheIgnora || []), d.t])] }); return toast('Avviso nascosto');
    case 'c-pIgnoraTutti': { const t = anomalieAttive().map(a => a.testo); await salvaCfg({ pagheIgnora: [...new Set([...(cfg().pagheIgnora || []), ...t])] }); return toast(`${t.length} avvisi nascosti: ricompaiono solo i problemi nuovi`); }
    case 'c-pIgnoraReset': await salvaCfg({ pagheIgnora: [] }); return toast('Avvisi ripristinati');
    case 'c-pCfg': { const gs = Math.min(31, Math.max(1, parseInt($("#pg_gs").value) || 20)), gf = Math.min(31, Math.max(1, parseInt($('#pg_gf').value) || 16)); await salvaCfg({ paghe: Object.assign({}, cfg().paghe || {}, { giornoStipendi: gs, giornoF24: gf }) }); return toast('Scadenze salvate'); }
    case 'c-pMovCancel': PIMP.righe = null; return rerender();
    case 'c-pMovSave': {
      const sel = PIMP.righe.filter(r => r.sel); if (sel.some(r => P.CON_DIP.has(r.tipo) && !r.dip)) throw new Error('Per ogni stipendio, anticipo o prestito scegli il dipendente (o togli la spunta).');
      if (sel.some(r => r.tipo === 'fattura' && !(r.fatt || []).length)) throw new Error('Scegli la fattura per ogni pagamento di fattura (o togli la spunta).');
      const o = await B.salvaRighe(sel, PIMP.file); PIMP.righe = null; toast(`Salvati: ${o.nP} pagamenti del personale, ${o.nF} pagamenti di fatture`); return rerender();
    }
    case 'c-pMovTutti': if (d.k == null) { PIMP.tutti = !PIMP.tutti; return rerender(); } return;
  }
}
export async function personaleChange(t, rerender) {
  const a = t.dataset.act;
  if (a === 'c-pMovFile' && t.files.length) { const f = [...t.files]; t.value = ''; rerenderP = rerender; try { await caricaMovimenti(f); } catch (e) { toast(e.message, 'err'); } return rerender(); }
  if ((a === 'c-pMovSel' || a === 'c-pMovSet') && PIMP.righe) { modificaRiga(PIMP.righe, t); return rerender(); }
}
