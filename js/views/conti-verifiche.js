// Conti: controllo delle fatture con l'elenco annuale (fatture mancanti) e reddito lordo standard (corso di gestione)
import { UI } from '../state.js';
import { esc, nf, fd } from '../util.js';
import { ic } from '../icons.js';
import { empty } from '../ui.js';
import { fatture, anniFatture } from '../conti/dati.js';
import { tabella, bottoniExport, fmtVal } from '../conti/tabelle.js';
import { elenco, elenchi, confronta } from '../conti/elenco.js';
import { rls, giudizio, VOCI, SOGLIE } from '../conti/rls.js';

const miniTabs = (f, items, cur) => `<div class="mini-tabs" role="group">${items.map(([v, l]) => `<button data-act="chip" data-f="${f}" data-v="${esc(v)}" aria-pressed="${cur === v}">${esc(l)}</button>`).join('')}</div>`;
const kpi = (l, v, s, cls = '') => `<div class="kpi static"><span class="k-l">${esc(l)}</span><span class="k-v sm ${cls}">${v}</span><span class="k-s">${s}</span></div>`;
const nomeTipo = t => (t === 'Vendita' ? 'emesse' : 'ricevute');

/* ---------------- fatture mancanti ---------------- */
const STATI = { manca: ['circle-x', 'ko', 'Manca'], diversa: ['circle-alert', 'wa', 'Da controllare'], ok: ['circle-check', 'ok', 'Caricata'] };
/** Riepilogo per la panoramica: elenchi con fatture mancanti. */
export function mancantiAnno(y) {
  return ['Acquisto', 'Vendita'].map(t => { const el = elenco(t, y); return el ? Object.assign({ tipo: t }, confronta(el, fatture()).conta) : null; }).filter(Boolean);
}

export function vMancanti() {
  const tipo = UI.f.cm_tipo || 'Acquisto'; const y = UI.anno; const el = elenco(tipo, y); const tutti = elenchi();
  const carica = `<label class="btn sm primary">${ic('file-up')}Carica l'elenco (Excel)<input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" data-act="c-elFile" hidden></label>`;
  const bar = `<div class="toolbar">${miniTabs('cm_tipo', [['Acquisto', 'Fatture ricevute'], ['Vendita', 'Fatture emesse']], tipo)}<span class="sp"></span>${carica}</div>`;
  const altri = tutti.length ? `<div class="chipbar">${tutti.map(e => `<button data-act="c-elGo" data-anno="${e.anno}" data-tipo="${e.tipo}" aria-pressed="${e.anno === y && e.tipo === tipo}">${e.tipo === 'Vendita' ? 'Emesse' : 'Ricevute'} ${e.anno}<span class="n">${e.righe.length}</span></button>`).join('')}</div>` : '';
  if (!el) return `${bar}${altri}<section class="card">${empty('scan-search', `Nessun elenco delle fatture ${nomeTipo(tipo)} del ${y}`, "Carica il file Excel con l'elenco di tutte le fatture dell'anno (per esempio passive_2025.xlsx per quelle ricevute): l'app lo confronta con le fatture che hai caricato e ti dice quali mancano, quali hanno un importo o una data diversi e quali hai caricato ma non sono nell'elenco. L'anno si legge dal nome del file o dalle date.")}</section>`;
  const R = confronta(el, fatture()); const C = R.conta;
  const st = UI.f.cm_stato || (C.manca ? 'manca' : '');
  const totEl = el.righe.reduce((t, r) => t + Math.abs(r.totale || 0), 0);
  const kp = `<div class="kpis">${kpi("Nell'elenco", nf(C.tot), fmtVal(totEl, 'eur2') + ' IVA compresa')}${kpi('Caricate', nf(C.ok + C.diversa), C.diversa ? `${C.diversa} da controllare` : 'tutte uguali all\'elenco')}${kpi('Mancanti', nf(C.manca), C.manca ? fmtVal(C.mancaEuro, 'eur2') + ' da caricare' : 'nessuna', C.manca ? 't-bad' : '')}${kpi("Non nell'elenco", nf(C.inPiu), C.inPiu ? `caricate nel ${y}, ${fmtVal(C.inPiuEuro, 'eur2')}` : 'nessuna')}</div>`;
  const esito = C.manca ? `<div class="note-box bad">${ic('triangle-alert')}<span><b>${C.manca === 1 ? 'Manca 1 fattura' : `Mancano ${C.manca} fatture`}</b> dell'elenco ${esc(el.file || '')}. Scaricale dal cassetto fiscale o dal portale e caricale in <button class="linkbtn" data-act="sub" data-tab="conti" data-sec="conti" data-sub="importa">Carica documenti</button>.</span></div>` : `<div class="note-box">${ic('circle-check')}<span><b>Tutte le fatture dell'elenco sono caricate.</b>${C.diversa ? ` ${C.diversa} con importo o data diversi: controllale.` : ''}</span></div>`;
  const chips = `<div class="chipbar"><button data-act="chip" data-f="cm_stato" data-v="tutte" aria-pressed="${st === 'tutte'}">Tutte<span class="n">${C.tot}</span></button><button data-act="chip" data-f="cm_stato" data-v="manca" aria-pressed="${st === 'manca'}">Mancanti<span class="n">${C.manca}</span></button><button data-act="chip" data-f="cm_stato" data-v="diversa" aria-pressed="${st === 'diversa'}">Da controllare<span class="n">${C.diversa}</span></button><button data-act="chip" data-f="cm_stato" data-v="ok" aria-pressed="${st === 'ok'}">Caricate<span class="n">${C.ok}</span></button><button data-act="chip" data-f="cm_stato" data-v="inpiu" aria-pressed="${st === 'inpiu'}">Non nell'elenco<span class="n">${C.inPiu}</span></button></div>`;
  const cp = tipo === 'Vendita' ? 'Cliente' : 'Fornitore';
  let corpo;
  if (st === 'inpiu') {
    corpo = tabella('elpiu', { title: `Fatture ${nomeTipo(tipo)} ${y} caricate ma non nell'elenco`, sheet: "Non nell'elenco", cols: [{ k: 'data', h: 'Data', fmt: 'date' }, { k: 'numero', h: 'Numero', cls: 'nw' }, { k: 'controparte', h: cp, cls: 'w', html: f => `${esc(f.controparte)}<span class="sub">${esc(f.piva || '')}</span>` }, { k: 'piva', h: 'P.IVA', export: true }, { k: 'tipoDoc', h: 'Doc.' }, { k: 'imponibile', h: 'Imponibile', fmt: 'eur2' }, { k: 'totale', h: 'Totale', fmt: 'eur2' }, { k: 'file', h: 'File', cls: 'clip' }].filter(c => c.export !== true), rows: R.inPiu.map(f => Object.assign({ _cls: 'click' }, f)), rowAttr: f => `data-act="c-fatt" data-id="${f.id}"`, tot: { data: 'Totale', imponibile: R.inPiu.reduce((t, f) => t + (+f.imponibile || 0), 0), totale: R.inPiu.reduce((t, f) => t + (+f.totale || 0), 0) } });
    corpo += `<p class="muted small pad-x">Possono essere fatture dell'anno arrivate dopo che hai scaricato l'elenco, doppioni caricati due volte con numeri diversi, oppure fatture con la partita IVA o il numero scritti in modo diverso.</p>`;
  } else {
    const rows = R.righe.filter(r => st === 'tutte' || !st || r.stato === st).map(r => Object.assign({ _cls: r.fid ? 'click' : '', statoT: STATI[r.stato][2], noteT: r.note.join(' · ') }, r));
    corpo = tabella('elenco', {
      title: `Controllo fatture ${nomeTipo(tipo)} ${y}`, sheet: 'Controllo', sub: el.file,
      cols: [{ k: 'statoT', h: 'Esito', html: r => `<span class="esito ${STATI[r.stato][1]}">${ic(STATI[r.stato][0])}${STATI[r.stato][2]}</span>` }, { k: 'data', h: 'Data', fmt: 'date' }, { k: 'numero', h: 'Numero', cls: 'nw' }, { k: 'nome', h: cp, cls: 'w', html: r => `${esc(r.nome)}<span class="sub">${esc(r.piva || r.cf || '')}</span>` }, { k: 'tipologia', h: 'Tipo', cls: 'clip' }, { k: 'totale', h: 'Totale', fmt: 'eur2' }, { k: 'pagata', h: 'Pagata' }, { k: 'noteT', h: 'Note', cls: 'clip' }],
      rows, rowAttr: r => (r.fid ? `data-act="c-fatt" data-id="${r.fid}"` : ''), tot: { statoT: 'Totale', totale: rows.reduce((t, r) => t + (r.totale || 0), 0) }, freeze: 1,
    });
  }
  return `${bar}${altri}${kp}${esito}<section class="card"><div class="card-h">${chips}${bottoniExport([st === 'inpiu' ? 'elpiu' : 'elenco'], `Controllo fatture ${nomeTipo(tipo)} ${y}`)}</div>${corpo}</section>
  <p class="muted small">Elenco: ${esc(el.file || '')}, caricato il ${fd(el.caricato)}, ${el.righe.length} fatture. Si abbinano solo fatture dello stesso anno, per partita IVA e numero (spazi, barre e trattini non contano), poi per partita IVA, data e importo. <button class="linkbtn danger" data-act="c-elDel" data-anno="${y}" data-tipo="${tipo}">Togli questo elenco</button></p>`;
}

/* ---------------- reddito lordo standard ---------------- */
const num2 = v => (v === null || v === undefined || v === '' ? '' : Number(v).toLocaleString('it-IT', { maximumFractionDigits: 2 }));
const campo = (y, k, v, ph) => `<input class="cell-in" inputmode="decimal" data-act="c-val" data-col="rls" data-campo="${k}" data-y="${y}" value="${esc(num2(v))}" placeholder="${esc(ph ?? '')}" style="max-width:150px">`;

export function vRls() {
  const y = UI.anno; const R = rls(y);
  const anni = [...new Set([...anniFatture(), y])].filter(a => a <= y).sort((a, b) => a - b).slice(-4);
  const G = giudizio(R.incSv);
  const cls = { ok: '', wa: 't-warn', ko: 't-bad', muted: '' }[G.cls];
  const kp = `<div class="kpis">${kpi('PLV ' + y, fmtVal(R.plv, 'eur'), 'vendite senza IVA e senza PAC')}${kpi('Spese varie', fmtVal(R.sv, 'eur'), 'acquisti che finiscono nell\'anno')}${kpi('Spese varie / PLV', R.incSv == null ? '—' : nf(R.incSv * 100, 1) + '%', `<span class="esito ${G.cls}">${esc(G.testo)}</span>`, cls)}${kpi('Reddito lordo standard', fmtVal(R.rls, 'eur') || '0 €', R.pac ? `con la PAC ${fmtVal(R.rlsPac, 'eur')}` : 'senza PAC', R.rls < 0 ? 't-bad' : '')}</div>`;
  const avvisi = [];
  if (!R.plvFatture && !R.corrisp) avvisi.push(`Non ci sono fatture di vendita del ${y}: carica le fatture emesse (latte, animali, prodotti) o scrivi qui sotto i corrispettivi.`);
  if (R.daClass) avvisi.push(`${fmtVal(R.daClass, 'eur')} di righe ancora "Da classificare": sono contate come spese varie. Assegna la categoria per un calcolo più preciso.`);
  if (R.affCe && !R.affitti) avvisi.push(`Nel conto economico ci sono ${fmtVal(R.affCe, 'eur')} di affitti di terreni: se li paghi senza fattura scrivili nella riga "Affitti pagati senza fattura".`);
  const barra = R.incSv == null ? '' : (() => { const p = Math.min(R.incSv, 0.6) / 0.6 * 100; return `<div class="pad-x" style="padding-bottom:14px"><div style="position:relative;height:12px;border-radius:6px;background:linear-gradient(90deg,var(--ok) 0 41.6%,var(--warn) 41.6% 66.6%,var(--bad) 66.6% 100%);opacity:.8"><span style="position:absolute;left:calc(${p}% - 2px);top:-4px;width:4px;height:20px;background:var(--ink);border-radius:2px"></span></div><div class="muted small" style="display:flex;justify-content:space-between;margin-top:4px"><span>0%</span><span style="margin-left:15%">25% media</span><span>40% allarme</span><span>60%+</span></div></div>`; })();
  const riga = (l, v, nota, bold) => `<tr${bold ? ' class="tot"' : ''}><td class="t">${l}</td><td class="n${v < 0 ? ' neg' : ''}">${typeof v === 'number' ? esc(fmtVal(v, 'eur2') || '–') : v}</td><td class="t muted small">${nota || ''}</td></tr>`;
  const calcolo = `<div class="tablewrap etab"><table><thead><tr><th class="t">Voce</th><th class="n">${y}</th><th class="t">Da dove arriva</th></tr></thead><tbody>
    ${riga('Vendite dalle fatture (imponibile)', R.plvFatture, 'fatture emesse, categorie segnate "Produzione (PLV)"')}
    ${riga('+ Corrispettivi e vendite senza fattura', campo(y, 'corrisp', R.man.corrisp, '0'), 'registro dei corrispettivi, vendita diretta')}
    ${riga('= PLV (produzione lorda vendibile)', R.plv, 'senza IVA, senza PAC né contributi', true)}
    ${riga('− Spese varie', -R.sv, 'fatture ricevute, categorie segnate "Spesa varia"')}
    ${riga('− Affitti di terreni con fattura', -R.affFatture, 'categorie segnate "Affitto di terreni"')}
    ${riga('− Affitti pagati senza fattura', campo(y, 'affitti', R.man.affitti, R.affCe ? num2(R.affCe) + ' nel CE' : '0'), 'scrivili a mano')}
    ${riga('− Salari pagati (costo pieno)', campo(y, 'salari', R.man.salari, num2(R.salariAuto) || '0'), R.salariFonte === 'inserito' ? 'inserito a mano' : R.salariAuto ? 'vuoto = costo del personale B.9 (' + (R.salariFonte || 'conto economico') + '): ' + esc(fmtVal(R.salariAuto, 'eur')) : 'carica i bilancini paghe o scrivilo a mano')}
    ${riga('= Reddito lordo standard (RLS)', R.rls, R.incRls != null ? nf(R.incRls * 100, 1) + '% della PLV' : '', true)}
    ${riga('+ PAC e contributi in conto esercizio', campo(y, 'pac', R.man.pac, num2(R.pacAuto) || '0'), R.pacFonte === 'inserito' ? 'inserito a mano' : R.pacAuto ? 'vuoto = contributi PAC e PSR del conto economico' : 'scrivili a mano')}
    ${riga('= RLS con la PAC', R.rlsPac, 'serve a vedere quanto l\'azienda dipende dai contributi', true)}
    ${riga('Capitale investito (facoltativo)', campo(y, 'capitale', R.man.capitale, '0'), 'es. terreno o stalla da acquistare')}
    ${R.roi != null ? riga('ROI = RLS ÷ capitale', nf(R.roi * 100, 1) + '%', R.anniRientro ? 'circa ' + nf(R.anniRientro, 0) + ' anni per rientrare' : '') : ''}
    </tbody></table></div>`;
  const storico = anni.map(a => { const x = a === y ? R : rls(a); return { anno: String(a), plv: x.plv, sv: x.sv, affitti: x.affitti, salari: x.salari, rls: x.rls, incSv: x.incSv, rlsPac: x.rlsPac, inv: x.inv }; });
  const tAnni = tabella('rlsanni', { title: 'Reddito lordo standard per anno', sheet: 'Per anno', cols: [{ k: 'anno', h: 'Anno' }, { k: 'plv', h: 'PLV', fmt: 'eur' }, { k: 'sv', h: 'Spese varie', fmt: 'eur' }, { k: 'incSv', h: 'Spese varie / PLV', fmt: 'pct' }, { k: 'affitti', h: 'Affitti', fmt: 'eur' }, { k: 'salari', h: 'Salari', fmt: 'eur' }, { k: 'rls', h: 'RLS', fmt: 'eur' }, { k: 'rlsPac', h: 'RLS con PAC', fmt: 'eur' }, { k: 'inv', h: 'Investimenti (esclusi)', fmt: 'eur' }], rows: storico, sort: false });
  const tabAnni = anni.length > 1 ? `<section class="card"><div class="card-h"><h2>Confronto tra gli anni</h2></div>${tAnni}</section>` : '';
  const sel = (o) => `<select class="cell-in" data-act="c-rlsCat" data-k="${esc(o.tipo + '|' + o.categoria)}" aria-label="Voce">${VOCI[o.tipo].map(([v, l]) => `<option value="${v}"${o.voce === v ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  const tCat = (tipo, id, titolo) => { const rows = R.cats.filter(o => o.tipo === tipo); if (!rows.length) return `<div class="empty slim">Nessuna fattura ${tipo === 'Vendita' ? 'di vendita' : 'di acquisto'} nel ${y}.</div>`; return tabella(id, { title: titolo, sheet: titolo, cols: [{ k: 'categoria', h: 'Categoria' }, { k: 'importo', h: 'Imponibile', fmt: 'eur2' }, { k: 'n', h: 'Righe', fmt: 'int' }, { k: 'voceT', h: 'Nel calcolo conta come', html: sel }], rows: rows.map(o => Object.assign({ voceT: (VOCI[tipo].find(v => v[0] === o.voce) || [])[1] }, o)), tot: { categoria: 'Totale', importo: rows.reduce((t, o) => t + o.importo, 0) } }); };
  return `${kp}${avvisi.map(a => `<div class="note-box warn">${ic('info')}<span>${esc(a)}</span></div>`).join('')}
  <div class="grid-2"><section class="card"><div class="card-h"><h2>${ic('gauge')}Calcolo ${y}</h2>${bottoniExport(['rlsanni', 'rlsacq', 'rlsven'], 'Reddito lordo standard ' + y)}</div>${barra}${calcolo}</section>
  <section class="card"><div class="card-h"><h2>${ic('info')}Come si legge</h2></div><div class="pad-x" style="padding-bottom:16px">
  <p><b>RLS = PLV − spese varie − affitti dei terreni − salari pagati.</b> È il numero che chiedono la banca e il piano d'impresa.</p>
  <p><b>Spese varie / PLV</b>: intorno al ${nf(SOGLIE.media * 100, 0)}% è la media osservata (aziende apistiche, viticole, cerealicole, suinicole); <b>oltre il ${nf(SOGLIE.allarme * 100, 0)}%</b> le sole spese varie si mangiano quasi metà dell'attivo e l'azienda è già in difficoltà.</p>
  <p><b>PLV</b>: imponibile delle fatture di vendita dal 1° gennaio al 31 dicembre più i corrispettivi, senza IVA e <b>senza PAC</b> né contributi straordinari. Valuta sempre l'azienda con e senza PAC.</p>
  <p><b>Spese varie</b>: concimi, sementi, mangimi, carburanti, fitofarmaci, contoterzi, assicurazioni, canoni di leasing, tasse fisse. <b>Non</b> gli investimenti (una trattrice, una seminatrice, una costruzione): segnali come "Investimento" nella tabella delle categorie.</p>
  <p class="muted small">Dal corso "Gestione economica dell'azienda agraria", serata 1. È la versione del relatore: la definizione ufficiale UE del reddito lordo standard toglie dalla PLV solo i costi specifici, e dal 2010 la UE misura la dimensione aziendale con la Produzione Standard.</p></div></section></div>
  ${tabAnni}
  <div class="grid-2"><section class="card"><div class="card-h"><h2>Fatture ricevute ${y} per categoria</h2></div>${tCat('Acquisto', 'rlsacq', 'Acquisti per categoria ' + y)}<p class="muted small pad-x">La scelta vale per tutti gli anni. Le righe "Da classificare" e le differenze non dettagliate contano come spese varie finché non le sistemi.</p></section>
  <section class="card"><div class="card-h"><h2>Fatture emesse ${y} per categoria</h2></div>${tCat('Vendita', 'rlsven', 'Vendite per categoria ' + y)}<p class="muted small pad-x">Segna "Non conta" per quello che non è produzione dell'anno: vendita di un mezzo usato, rimborsi, contributi.</p></section></div>`;
}
