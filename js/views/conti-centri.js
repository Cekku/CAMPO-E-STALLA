// Conti: centri di costo (Stalla, Campagna, Spese generali, Banca e finanza)
import { UI } from '../state.js';
import { esc, nf, fd } from '../util.js';
import { ic } from '../icons.js';
import { empty } from '../ui.js';
import { anniFatture, DA_CLASSIFICARE } from '../conti/dati.js';
import { tabella, bottoniExport, fmtVal } from '../conti/tabelle.js';
import { centri, CENTRI, FINALI, SCELTE, NOME_SCELTA, VOCI_BANCA } from '../conti/centri.js';

const kpi = (l, v, s, cls = '', icn = '') => `<div class="kpi static"><span class="k-l">${icn ? ic(icn) : ''}${esc(l)}</span><span class="k-v sm ${cls}">${v}</span><span class="k-s">${s}</span></div>`;
const eu = v => fmtVal(v, 'eur') || '0 €';
const num2 = v => (v === null || v === undefined || v === '' ? '' : Number(v).toLocaleString('it-IT', { maximumFractionDigits: 2 }));
const campo = (y, k, v, ph, pct) => `<input class="cell-in" inputmode="decimal" data-act="c-val" data-col="cdc" data-campo="${k}" data-y="${y}"${pct ? ' data-pct="1"' : ''} value="${esc(v === undefined || v === null || v === '' ? '' : num2(pct ? v * 100 : v))}" placeholder="${esc(ph ?? '')}" style="max-width:120px">`;
const sel = (act, attrs, cur, opts) => `<select class="cell-in" data-act="${act}" ${attrs}>${opts.map(([v, l]) => `<option value="${esc(v)}"${cur === v ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
const pct = v => (v == null ? '—' : nf(v * 100, 0) + '%');

export function vCentri() {
  const y = UI.anno; const X = centri(y); const R = X.R;
  if (X.vuoto) return `<section class="card">${empty('chart-pie', `Nessuna fattura del ${y}`, 'Carica le fatture dell\'anno (e, se ce l\'hai, il bilancino del commercialista): l\'app divide da sola le spese tra stalla, campagna, spese generali e banca.', `<button class="btn primary" data-act="sub" data-tab="conti" data-sec="conti" data-sub="importa">${ic('file-up')}Carica documenti</button>`)}</section>`;
  const mcls = v => (v < 0 ? 't-bad' : v > 0 ? 't-ok' : '');
  const kp = `<div class="kpis">${FINALI.map(c => kpi(CENTRI[c].nome, eu(R[c].costi), R[c].ricavi ? `costi · ricavi ${eu(R[c].ricavi)} · <span class="${mcls(R[c].margine)}">margine ${eu(R[c].margine)}</span>` : 'costi · nessun ricavo', '', CENTRI[c].icona)).join('')}${kpi('Tutta l\'azienda', eu(X.tot.margine), `ricavi ${eu(X.tot.ricavi)} − costi ${eu(X.tot.costi)}`, mcls(X.tot.margine))}</div>`;
  const avvisi = [];
  if (X.daClass) avvisi.push(`${fmtVal(X.daClass, 'eur')} di righe ancora "Da classificare": per ora sono divise come spese comuni. Dai la categoria (o scegli il centro qui sotto riga per riga).`);
  if (!X.conCe && !X.paghe) avvisi.push(`Manca il conto economico del ${y}: personale, ammortamenti, interessi e PAC non ci sono. Carica il bilancino del commercialista (o i bilancini paghe) per averli.`);
  else if (!X.conCe) avvisi.push(`Il personale arriva dalle paghe; ammortamenti, PAC e interessi del conto economico del ${y} mancano finché non carichi il bilancino.`);
  if (!X.banca.n && !X.banca.fonteComm && !X.banca.fonteInt) avvisi.push('Banca e finanza è vuota: carica l\'estratto conto (Pagamenti o Carica documenti) e segna le spese, gli interessi e le rate come "Banca e finanza", oppure carica il conto economico.');

  // riepilogo per centro
  const rows = FINALI.map(c => ({ centro: CENTRI[c].nome, ricavi: R[c].ricavi, costi: R[c].costi, margine: R[c].margine, quota: X.tot.costi ? R[c].costi / (X.tot.costi + X.trasf) : null }));
  const tRiep = tabella('cdcriep', { title: 'Centri di costo ' + y, sheet: 'Riepilogo', sort: false, cols: [{ k: 'centro', h: 'Centro' }, { k: 'ricavi', h: 'Ricavi', fmt: 'eur' }, { k: 'costi', h: 'Costi', fmt: 'eur' }, { k: 'margine', h: 'Margine', fmt: 'eur' }, { k: 'quota', h: 'Parte dei costi', fmt: 'pct' }], rows, tot: { centro: 'Azienda' + (X.trasf ? ' (senza i foraggi passati alla stalla)' : ''), ricavi: X.tot.ricavi, costi: X.tot.costi, margine: X.tot.margine } });
  const U = X.unita;
  const unit = [
    U.litri ? ['Costo della stalla per litro', fmtVal(U.stallaL, 'eur3') + '/l', `${nf(U.litri, 0)} litri di latte`] : null,
    U.litri ? ['… con la sua parte di spese generali e banca', fmtVal(U.stallaPienoL, 'eur3') + '/l', 'divise come i costi diretti'] : null,
    U.litri ? ['Margine della stalla per litro', fmtVal(U.margineL, 'eur3') + '/l', 'ricavi della stalla − costi della stalla'] : null,
    U.vacche ? ['Costo della stalla per vacca', eu(U.stallaV), `${nf(U.vacche, 0)} vacche in media`] : null,
    U.sau ? ['Costo della campagna per ettaro', eu(U.campagnaHa), `${nf(U.sau, 1)} ha di SAU`] : null,
  ].filter(Boolean);
  const cardRiep = `<section class="card"><div class="card-h"><h2>${ic('chart-pie')}Come si dividono i conti del ${y}</h2>${bottoniExport(['cdcriep', 'cdcvoci', 'cdccat', 'cdcanni'], 'Centri di costo ' + y)}</div>${tRiep}
    ${unit.length ? `<div class="kpis" style="margin:12px 16px 16px">${unit.map(([l, v, s]) => kpi(l, v, s)).join('')}</div>` : ''}</section>`;

  // dettaglio per centro
  const det = FINALI.map(c => ({ c, rs: R[c].voci })).filter(x => x.rs.length);
  const vociRows = det.flatMap(({ c, rs }) => [{ _sez: CENTRI[c].nome }, ...rs.map(v => ({ centro: CENTRI[c].nome, voce: v.voce + (v.nota ? ' (parte)' : ''), ricavo: v.tipo === 'ricavo' ? v.importo : null, costo: v.tipo === 'costo' ? v.importo : null }))]);
  const tVoci = tabella('cdcvoci', { title: 'Voci per centro ' + y, sheet: 'Voci', sort: false, cols: [{ k: 'voce', h: 'Voce', cls: 'w' }, { k: 'ricavo', h: 'Ricavi', fmt: 'eur' }, { k: 'costo', h: 'Costi', fmt: 'eur' }], rows: vociRows });
  const cardVoci = `<section class="card"><div class="card-h"><h2>${ic('list')}Le voci di ogni centro</h2></div>${tVoci}<p class="muted small pad-x">"(parte)" = la quota di una spesa comune (gasolio, ricambi, energia, personale…) data a quel centro.</p></section>`;

  // ripartizione delle spese comuni
  const cardQ = `<section class="card"><div class="card-h"><h2>${ic('chart-pie')}Spese comuni: quanto va alla stalla</h2></div><div class="tablewrap etab"><table><tbody>
    <tr><td class="t">Mezzi e spese comuni (gasolio, ricambi, riparazioni, energia, ammortamenti delle macchine…): <b>${eu(X.comuniTot)}</b></td><td class="n">${campo(y, 'qComuni', X.man.qComuni, nf(X.q.auto * 100, 0), true)} %</td><td class="t muted small">alla stalla, il resto alla campagna · vuoto = ${pct(X.q.auto)}, come i costi diretti</td></tr>
    <tr><td class="t">Personale dipendente${X.pers ? `: <b>${eu(X.pers)}</b>` : ''}</td><td class="n">${campo(y, 'qPers', X.man.qPers, nf(X.q.auto * 100, 0), true)} %</td><td class="t muted small">alla stalla · vuoto = ${pct(X.q.auto)}. Se chi lavora sta quasi sempre in stalla scrivi per esempio 80</td></tr>
    <tr><td class="t">Foraggi e cereali dell'azienda passati alla stalla (facoltativo)</td><td class="n">${campo(y, 'trasf', X.man.trasf, '0')} €</td><td class="t muted small">ricavo per la campagna e costo per la stalla: così la campagna non sembra solo una spesa. Non cambia il risultato dell'azienda</td></tr>
    </tbody></table></div><p class="muted small pad-x">Le percentuali valgono per il ${y}. Usate adesso: spese comuni ${pct(X.q.comuni)} alla stalla, personale ${pct(X.q.pers)}.</p></section>`;

  // categorie
  const catRows = X.cats.map(o => Object.assign({ _k: o.tipo + '|' + o.categoria, tipoT: o.tipo === 'Vendita' ? 'Vendita' : 'Acquisto', centroT: NOME_SCELTA[o.centro] }, o));
  const tCat = tabella('cdccat', {
    title: 'Categorie e centri ' + y, sheet: 'Categorie',
    cols: [{ k: 'categoria', h: 'Categoria', cls: 'w', html: o => `${esc(o.categoria)}${o.manuali || o.suggerite ? `<span class="sub">${[o.manuali ? o.manuali + ' righe scelte a mano' : '', o.suggerite ? o.suggerite + ' righe date dalle parole (es. carro, seminatrice)' : ''].filter(Boolean).join(' · ')}</span>` : ''}` }, { k: 'tipoT', h: 'Tipo' }, { k: 'importo', h: 'Imponibile', fmt: 'eur' }, { k: 'n', h: 'Righe', fmt: 'int' },
      { k: 'centroT', h: 'Centro', html: o => sel('c-cdcCat', `data-k="${esc(o._k)}" aria-label="Centro"`, o.centro, SCELTE.filter(([v]) => o.tipo !== 'Vendita' || !['inv', 'segue', 'comuni'].includes(v))) + (o.scelto ? '' : '<span class="sub">proposta</span>') }],
    rows: catRows,
  });
  const cardCat = `<section class="card"><div class="card-h"><h2>${ic('tags')}Categorie delle fatture ${y}</h2></div>${tCat}<p class="muted small pad-x">La scelta vale per tutti gli anni. "Comune" si divide con la percentuale qui sopra, ma le righe che parlano di carro miscelatore, mungitura, cuccette… vanno da sole alla stalla e quelle di seminatrice, aratro, pressa… alla campagna. "Come il resto della fattura" serve per trasporto, spese di incasso e differenze: seguono le altre righe della stessa fattura. Gli investimenti restano fuori (entrano con gli ammortamenti del conto economico).</p></section>`;

  // righe delle spese comuni, una per una
  const solo = UI.f.cdc_righe || 'tutte';
  const rr = X.daRivedere.filter(r => solo === 'tutte' || (solo === 'dc' ? r.categoria === DA_CLASSIFICARE : solo === 'man' ? !!r.cdc : !r.cdc && !r.sugg));
  const vis = rr.slice(0, 150);
  const chips = `<div class="chipbar">${[['tutte', 'Tutte', X.daRivedere.length], ['div', 'Divise a percentuale', X.daRivedere.filter(r => !r.cdc && !r.sugg).length], ['dc', 'Da classificare', X.daRivedere.filter(r => r.categoria === DA_CLASSIFICARE).length], ['man', 'Scelte a mano', X.daRivedere.filter(r => r.cdc).length]].map(([v, l, n]) => `<button data-act="chip" data-f="cdc_righe" data-v="${v}" aria-pressed="${solo === v}">${l}<span class="n">${n}</span></button>`).join('')}</div>`;
  const tRighe = vis.length ? `<div class="tablewrap etab"><table><thead><tr><th class="t">Data</th><th class="t">Fornitore e riga</th><th class="t">Categoria</th><th class="n">Importo</th><th class="t">Centro</th></tr></thead><tbody>${vis.map(r => `<tr><td class="t nw">${fd(r.data)}</td><td class="t clip" title="${esc(r.descrizione)}">${esc(r.controparte)}<span class="sub">${esc(String(r.descrizione || '').slice(0, 90))}</span></td><td class="t clip">${esc(r.categoria)}</td><td class="n">${esc(fmtVal(r.importo, 'eur2'))}</td><td class="t">${sel('c-cdcRiga', `data-fid="${esc(r.fid)}" data-i="${r.i}" aria-label="Centro della riga"`, r.cdc || '', [['', r.sugg ? `${NOME_SCELTA[r.sugg]} (dalle parole)` : `Come la categoria: ${NOME_SCELTA[r.catCentro]}`], ...SCELTE.filter(([v]) => v !== 'segue')])}</td></tr>`).join('')}</tbody></table></div>${rr.length > vis.length ? `<p class="muted small pad-x">Sono le 150 righe più grandi su ${rr.length}.</p>` : ''}` : `<div class="empty slim">Nessuna riga.</div>`;
  const cardRighe = `<section class="card"><div class="card-h"><h2>${ic('list-checks')}Spese comuni riga per riga</h2></div><div class="pad-x">${chips}</div>${tRighe}<p class="muted small pad-x">Se una riga è di un solo centro (per esempio la riparazione del carro miscelatore) sceglilo qui: vale solo per quella riga.</p></section>`;

  // banca e finanza
  const B = X.banca; const F = R.finanza;
  const intP = F.voci.filter(v => v.tipo === 'costo' && v.voce === 'Interessi passivi').reduce((t, v) => t + v.importo, 0);
  const movRows = X.movimenti.slice().sort((a, b) => (a.data || '').localeCompare(b.data || ''));
  const tMov = movRows.length ? `<div class="tablewrap etab"><table><thead><tr><th class="t">Data</th><th class="t">Descrizione</th><th class="n">Importo</th><th class="t">Voce</th><th class="t"></th></tr></thead><tbody>${movRows.map(m => `<tr><td class="t nw">${fd(m.data)}</td><td class="t clip" title="${esc(m.descrizione)}">${esc(m.descrizione)}</td><td class="n">${m.entrata ? `<span class="t-ok">+${esc(fmtVal(m.importo, 'eur2'))}</span>` : esc(fmtVal(m.importo, 'eur2'))}</td><td class="t">${sel('c-bkVoce', `data-id="${esc(m.id)}" aria-label="Voce"`, m.voce, Object.entries(VOCI_BANCA))}</td><td class="t"><button class="btn sm ghost" data-act="c-bkDel" data-id="${esc(m.id)}" aria-label="Togli">${ic('trash-2')}</button></td></tr>`).join('')}</tbody></table></div>` : `<div class="empty slim">Nessun movimento della banca registrato nel ${y}.</div>`;
  const cardBanca = `<section class="card"><div class="card-h"><h2>${ic('landmark')}Banca e finanza ${y}</h2><span class="count">${eu(F.costi)}</span></div>
    <div class="kpis" style="margin:0 16px 12px">${kpi('Spese, commissioni e bollo', eu(F.costi - intP), B.fonteComm || (F.costi - intP ? 'fatture' : 'nessun dato'))}${kpi('Interessi passivi', eu(intP), B.fonteInt || 'nessun dato')}${kpi('Interessi attivi', eu(F.ricavi), 'ricavi finanziari')}${kpi('Rate di mutui e finanziamenti', eu(B.rata), 'pagate nell\'anno: non sono un costo')}</div>
    ${tMov}
    <p class="muted small pad-x">Per registrare i movimenti carica l'estratto conto (Pagamenti → Importa, o Carica documenti): le spese, il bollo, gli interessi e le rate sono già proposti come "Banca e finanza". Se c'è il conto economico, commissioni e interessi si prendono da lì (è completo) e i movimenti servono da controllo. La rata di un mutuo è quasi tutta restituzione del prestito: il costo vero è solo la parte di interessi, che arriva dal conto economico.</p></section>`;

  // confronto tra gli anni
  const anni = [...new Set([...anniFatture(), y])].filter(a => a <= y).sort((a, b) => a - b).slice(-4);
  const storico = anni.map(a => { const x = a === y ? X : centri(a); const o = { anno: String(a) }; FINALI.forEach(c => { o[c] = x.R[c].costi; }); o.stallaM = x.R.stalla.margine; o.stallaL = x.unita.stallaL; o.tot = x.tot.margine; return o; });
  const tAnni = tabella('cdcanni', { title: 'Centri di costo per anno', sheet: 'Per anno', cols: [{ k: 'anno', h: 'Anno' }, ...FINALI.map(c => ({ k: c, h: 'Costi ' + CENTRI[c].nome.toLowerCase(), fmt: 'eur' })), { k: 'stallaM', h: 'Margine stalla', fmt: 'eur' }, { k: 'stallaL', h: 'Costo stalla €/l', fmt: 'eur3' }, { k: 'tot', h: 'Risultato azienda', fmt: 'eur' }], rows: storico });
  const cardAnni = anni.length > 1 ? `<section class="card"><div class="card-h"><h2>Confronto tra gli anni</h2></div>${tAnni}</section>` : '';

  const fuori = X.fuori.inv || X.fuori.no || X.fuori.noVen ? `<p class="muted small">Fuori dai centri: investimenti ${eu(X.fuori.inv)}${X.fuori.no ? `, acquisti che non contano ${eu(X.fuori.no)}` : ''}${X.fuori.noVen ? `, vendite che non contano ${eu(X.fuori.noVen)}` : ''}.</p>` : '';
  return `${kp}${avvisi.map(a => `<div class="note-box warn">${ic('info')}<span>${esc(a)}</span></div>`).join('')}
  ${cardRiep}<div class="grid-2">${cardQ}${cardVoci}</div>${cardBanca}${cardCat}${cardRighe}${cardAnni}${fuori}`;
}
