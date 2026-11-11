// Conti: panoramica, caricamento dei documenti, regole delle categorie e azioni del modulo economico
import { S, UI, azienda } from '../state.js';
import { esc, nf, fd, N, $, $$ } from '../util.js';
import { ic } from '../icons.js';
import * as store from '../store.js';
import { sync } from '../store.js';
import { toast, closeSheet, arm, empty, tabs, openSheet } from '../ui.js';
import { fatture, righe, regole, cfg, pivaPropria, anniFatture, anniBilancio, calc, ind, parametri, bilancio, DA_CLASSIFICARE } from '../conti/dati.js';
import { REGOLE_PREDEFINITE } from '../conti/regole.js';
import { tabella, ordina, esporta, fmtVal } from '../conti/tabelle.js';
import { colonne, linee, barre, torta, PALETTE, COL } from '../conti/grafici.js';
import { vFatture, vControparti, vProdotti, vCategorie, vMensile, vLatte, schedaFattura, schedaProdotto, mensili, MESI, ok, miniTabs, datalistCat, IA, daConfermare } from './conti-fatture.js';
import { vCE, vSP, vCespiti, vIndici, vAnalisi, vIva, vControlli } from './conti-bilancio.js';
import { vPersonale, vDipendenti, vCedolini, vPagamenti, vVerifica, vPrestiti, personaleAct, personaleChange, tabellaMovimenti, modificaRiga } from './conti-personale.js';
import { anomalie as anomaliePaghe } from '../conti/paghe.js';
import { vMancanti, vRls, mancantiAnno } from './conti-verifiche.js';
import { vCentri } from './conti-centri.js';

export const SUBS = { panoramica: 'Panoramica', fatture: 'Fatture', mancanti: 'Fatture mancanti', rls: 'Reddito lordo standard', centri: 'Centri di costo', importa: 'Carica documenti', fornitori: 'Fornitori', clienti: 'Clienti', prodotti: 'Prodotti', categorie: 'Categorie', mensile: 'Andamento mensile', latte: 'Latte venduto', ce: 'Conto economico', sp: 'Stato patrimoniale', indici: 'Indici di bilancio', analisi: 'Analisi della stalla', iva: 'Dichiarazioni IVA', cespiti: 'Cespiti', controlli: 'Controlli', personale: 'Personale', dipendenti: 'Dipendenti', cedolini: 'Cedolini e bilancini paghe', pagamenti: 'Pagamenti', prestiti: 'Anticipi e prestiti', verifica: 'Verifica pagamenti', regole: 'Regole delle categorie' };
const GRUPPI = [['fatture', 'mancanti', 'fornitori', 'clienti', 'prodotti', 'categorie', 'mensile', 'latte'], ['ce', 'sp', 'indici', 'centri', 'rls', 'analisi', 'iva', 'cespiti', 'controlli'], ['personale', 'dipendenti', 'cedolini', 'pagamenti', 'prestiti', 'verifica']];
const TAB_NOMI = { rls: 'RLS e spese varie', personale: 'Riepilogo', cedolini: 'Cedolini', prestiti: 'Anticipi e prestiti', verifica: 'Verifica' };

/** Chi può vedere i conti: in locale sempre; con il cloud solo il titolare dell'azienda. */
export function contiVisibili() {
  if (sync.mode !== 'cloud' || !sync.farm || !sync.user) return true;
  const me = (sync.members || []).find(m => m.user_id === sync.user.id);
  if (me) { try { localStorage.setItem('ces.role.' + sync.farm.id, me.role); } catch (e) { } return me.role === 'titolare'; }
  try { return localStorage.getItem('ces.role.' + sync.farm.id) === 'titolare'; } catch (e) { return false; }
}

const PULIZIA = { fatta: false, controlli: false };
export function render() {
  if (!PULIZIA.fatta && S.pagamenti.length && contiVisibili()) { PULIZIA.fatta = true; import('../conti/paghe.js').then(m => m.eliminaDoppi()).then(n => { if (n) toast(n === 1 ? 'Eliminato 1 pagamento doppio (stessa data, stesso nome, stesso importo)' : `Eliminati ${n} pagamenti doppi (stessa data, stesso nome, stesso importo)`); }).catch(e => console.warn(e)); }
  if (!PULIZIA.controlli && S.fatture.length && contiVisibili()) { PULIZIA.controlli = true; import('../conti/importa.js').then(m => m.aggiornaControlli()).then(n => { if (n) toast(n === 1 ? '1 fattura con ritenuta d\'acconto ora risulta corretta' : `${n} fatture con ritenuta d'acconto ora risultano corrette`); }).catch(e => console.warn(e)); }
  const sub = SUBS[UI.sub.conti] ? UI.sub.conti : 'panoramica';
  if (!contiVisibili()) return { title: 'Conti', html: `<section class="card lock">${ic('shield-check', 'huge')}<h2>Area riservata al titolare</h2><p class="muted">Fatture, bilancio e margini sono visibili solo a chi ha creato l'azienda. Chiedi al titolare se ti servono questi dati.</p></section>` };
  const V = { panoramica, fatture: vFatture, mancanti: vMancanti, rls: vRls, centri: vCentri, importa: vImporta, fornitori: () => vControparti('Acquisto'), clienti: () => vControparti('Vendita'), prodotti: vProdotti, categorie: vCategorie, mensile: vMensile, latte: vLatte, ce: vCE, sp: vSP, indici: vIndici, analisi: vAnalisi, iva: vIva, cespiti: vCespiti, controlli: vControlli, personale: vPersonale, dipendenti: vDipendenti, cedolini: vCedolini, pagamenti: vPagamenti, prestiti: vPrestiti, verifica: vVerifica, regole: vRegole };
  const gruppo = GRUPPI.find(g => g.includes(sub)) || null;
  const t = gruppo ? tabs('conti', gruppo.map(k => [k, TAB_NOMI[k] || SUBS[k]]), sub) : '';
  const azioni = sub === 'importa' ? '' : `<div class="btns"><button class="btn sm" data-act="sub" data-tab="conti" data-sec="conti" data-sub="importa">${ic('file-up')}Carica documenti</button></div>`;
  if (sync.mode === 'cloud' && sync.farm && SCHEMA.v === undefined) { SCHEMA.v = null; store.schemaVersion().then(v => { SCHEMA.v = v; if (v && v < 3) rerender(); }); }
  const avviso = SCHEMA.v && SCHEMA.v < 3 ? `<div class="note-box warn">${ic('shield-alert')}<span><b>I conti non sono ancora del tutto riservati.</b> Per fare in modo che solo tu veda fatture, bilancio, cedolini e pagamenti dei dipendenti, apri Supabase → SQL Editor ed esegui una volta il file <i>supabase/aggiornamento-conti.sql</i> del progetto. Fino ad allora i collaboratori collegati all'azienda possono ricevere questi dati.</span></div>` : '';
  return { title: SUBS[sub], html: avviso + `<header class="pagehead"><h1>${esc(SUBS[sub])}</h1>${azioni}</header>${t}${V[sub]()}` };
}

/* ---------------- panoramica ---------------- */
function delta(a, b) { if (!a || b == null) return ''; const d = (b - a) / Math.abs(a); return `<span class="k-delta ${d >= 0 ? 'up' : 'down'}">${d >= 0 ? '+' : ''}${nf(d * 100, 1)}% sul ${''}</span>`; }
function kpi(l, v, s, icn = '', cls = '') { return `<div class="kpi static"><span class="k-l">${icn ? ic(icn) : ''}${esc(l)}</span><span class="k-v sm ${cls}">${v}</span><span class="k-s">${s}</span></div>`; }
function panoramica() {
  const y = UI.anno; const fs = fatture();
  if (!fs.length && !S.bilanci.length && !S.paghe.length) return `<section class="card welcome"><div class="wl-art">${ic('wallet', 'huge')}</div><div class="wl-body"><span class="eyebrow">Conti dell'azienda</span><h2>Fatture, bilancio e margini in un posto solo</h2><p>Carica le fatture elettroniche (XML, P7M o lo ZIP scaricato dal cassetto fiscale), i PDF delle fatture, le dichiarazioni IVA e i bilancini del commercialista, oppure il vecchio file Excel del conto economico. L'app legge tutto da sola e collega i conti ai dati di stalla e campi.</p><div class="btns"><button class="btn action" data-act="sub" data-tab="conti" data-sec="conti" data-sub="importa">${ic('file-up')}Carica i primi documenti</button></div></div></section>`;
  const tot = (yy, t) => fs.filter(f => f.anno === yy && f.tipo === t).reduce((s, f) => s + N(f.imponibile), 0);
  const ven = tot(y, 'Vendita'), acq = tot(y, 'Acquisto'), venP = tot(y - 1, 'Vendita'), acqP = tot(y - 1, 'Acquisto');
  const dl = (a, b) => { if (!b) return ''; const d = (a - b) / Math.abs(b); return `<span class="k-delta ${d >= 0 ? 'up' : 'down'}">${d >= 0 ? '▲' : '▼'} ${nf(Math.abs(d) * 100, 1)}%</span> sul ${y - 1}`; };
  const c = calc(y), I = ind(y), P = parametri(y);
  const anni = [...new Set([...anniFatture(), ...anniBilancio()])].filter(a => a <= y).sort((a, b) => a - b).slice(-5);
  const A = mensili('Acquisto', [y]), Vn = mensili('Vendita', [y]);
  // categorie e fornitori
  const rs = righe().filter(r => r.anno === y && r.tipo === 'Acquisto'); const pc = new Map(); rs.forEach(r => pc.set(r.categoria, (pc.get(r.categoria) || 0) + N(r.importo)));
  const cats = [...pc.entries()].sort((a, b) => b[1] - a[1]); const topCat = cats.slice(0, 7).map(([l, v], k) => ({ label: l, v, color: PALETTE[k] })); const resto = cats.slice(7).reduce((t, x) => t + x[1], 0); if (resto > 0) topCat.push({ label: 'Altre categorie', v: resto, color: '#A9B4AE' });
  const pf = new Map(); fs.filter(f => f.anno === y && f.tipo === 'Acquisto').forEach(f => pf.set(f.controparte, (pf.get(f.controparte) || 0) + N(f.imponibile)));
  const topF = [...pf.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  const daVer = fs.filter(f => !ok(f)).length, daCl = righe().filter(r => r.categoria === DA_CLASSIFICARE).length;
  const todo = [];
  if (daVer) todo.push(['triangle-alert', daVer === 1 ? '1 fattura da verificare' : `${daVer} fatture da verificare`, 'La somma delle righe non coincide con l\'imponibile', 'fatture', 'cf_stato', 'verifica']);
  if (daCl) todo.push(['tags', daCl === 1 ? '1 riga senza categoria' : `${daCl} righe senza categoria`, 'Assegna la categoria o aggiungi una regola', 'fatture', 'cf_stato', 'daclass']);
  for (const m of mancantiAnno(y)) if (m.manca) todo.push(['scan-search', m.manca === 1 ? `1 fattura ${m.tipo === 'Vendita' ? 'emessa' : 'ricevuta'} non caricata` : `${m.manca} fatture ${m.tipo === 'Vendita' ? 'emesse' : 'ricevute'} non caricate`, `Sono nell'elenco del ${y} ma non tra le fatture caricate`, 'mancanti', 'cm_tipo', m.tipo]);
  if (!c.has.ce) todo.push(['scale', `Conto economico ${y} vuoto`, 'Carica il bilancino o inserisci gli importi', 'ce']);
  const ivaScaduta = new Date().toISOString().slice(0, 10) > `${y + 1}-04-30`;
  const ivaAnni = S.bilanci.filter(b => b.iva).map(b => +b.id).sort((a, b) => a - b);
  if (!(bilancio(y) || {}).iva && ivaScaduta) todo.push(['percent', `Dichiarazione IVA dell'anno ${y} non caricata`, `È il Modello IVA ${y + 1}, che riguarda le operazioni del ${y}.${ivaAnni.length ? ' Caricate: anni ' + ivaAnni.join(', ') + '.' : ''}`, 'importa']);
  { const ap = anomaliePaghe().filter(a => a.liv === 'err' && !(cfg().pagheIgnora || []).includes(a.testo)); if (ap.length) todo.push(['users', ap.length === 1 ? '1 irregolarità sul personale' : `${ap.length} irregolarità sul personale`, ap[0].testo, 'verifica']); }
  if (c.has.ce && !P.l_vacca) todo.push(['cow', 'Analisi della stalla incompleta', 'Mancano vacche o litri di latte', 'analisi']);
  const trend = anni.length > 1 ? (anni.some(a => calc(a).has.ce)
    ? colonne(anni.map(String), [{ name: 'Valore della produzione', values: anni.map(a => calc(a).ce[26]), color: COL.ven }, { name: 'Costi della produzione', values: anni.map(a => calc(a).ce[78]), color: COL.acq }, { name: 'Utile', values: anni.map(a => calc(a).ce[105]), color: COL.diff }])
    : colonne(anni.map(String), [{ name: 'Vendite (fatture)', values: anni.map(a => tot(a, 'Vendita')), color: COL.ven }, { name: 'Acquisti (fatture)', values: anni.map(a => tot(a, 'Acquisto')), color: COL.acq }])) : '';
  return `<div class="kpis">${kpi('Vendite ' + y, fmtVal(ven, 'eur'), dl(ven, venP) || 'imponibile delle fatture emesse', 'trending-up')}${kpi('Acquisti ' + y, fmtVal(acq, 'eur'), dl(acq, acqP) || 'imponibile delle fatture ricevute', 'trending-down')}${kpi('EBITDA ' + y, c.has.ce ? fmtVal(I.ebitda, 'eur') : '—', c.has.ce ? 'margine operativo lordo' : 'serve il conto economico', 'gauge')}${kpi('Utile ' + y, c.has.ce ? fmtVal(c.ce[105], 'eur') : '—', c.has.ce ? (I.contr ? 'contributi PAC/PSR ' + fmtVal(I.contr, 'eur') : 'dal conto economico') : 'serve il conto economico', 'wallet', c.has.ce && c.ce[105] < 0 ? 't-bad' : '')}</div>
  ${todo.length ? `<section class="card"><div class="card-h"><h2>${ic('list-checks')}Da sistemare</h2><span class="count">${todo.length}</span></div><div class="alerts">${todo.map(([i, t, s, sub, f, v]) => `<button class="alert warn" data-act="c-go" data-sub="${sub}"${f ? ` data-f="${f}" data-v="${v}"` : ''}><span class="a-ic">${ic(i)}</span><span class="a-tx"><b>${esc(t)}</b><span>${esc(s)}</span></span>${ic('chevron-right', 'chev')}</button>`).join('')}</div></section>` : ''}
  <div class="grid-2"><section class="card"><div class="card-h"><h2>${ic('chart-column')}Acquisti e vendite mese per mese</h2><button class="btn sm ghost" data-act="c-go" data-sub="mensile">Dettaglio</button></div>${colonne(MESI, [{ name: 'Acquisti', values: A[y], color: COL.acq }, { name: 'Vendite', values: Vn[y], color: COL.ven }])}</section>
  <section class="card"><div class="card-h"><h2>${ic('chart-line')}Andamento negli anni</h2><button class="btn sm ghost" data-act="c-go" data-sub="ce">Conto economico</button></div>${trend || '<div class="empty slim">Servono almeno due anni di dati.</div>'}</section></div>
  <div class="grid-2"><section class="card"><div class="card-h"><h2>${ic('chart-pie')}Costi per categoria ${y}</h2><button class="btn sm ghost" data-act="c-go" data-sub="categorie">Tutte</button></div>${torta(topCat, { fmt: v => fmtVal(v, 'eur'), tot: 'acquisti' })}</section>
  <section class="card"><div class="card-h"><h2>${ic('truck')}Principali fornitori ${y}</h2><button class="btn sm ghost" data-act="c-go" data-sub="fornitori">Tutti</button></div>${barre(topF.map(([l, v]) => ({ label: l, v, act: ` data-act="c-goCp" data-cp="${esc(l)}" data-tipo="Acquisto"` })), { fmt: v => fmtVal(v, 'eur') })}</section></div>
  <section class="card"><div class="card-h"><h2>${ic('milk')}Stalla da latte ${y}</h2><button class="btn sm ghost" data-act="c-go" data-sub="analisi">Analisi completa</button></div><div class="kpis pad-x" style="padding-bottom:16px">${kpi('Litri per vacca', P.l_vacca ? nf(P.l_vacca) : '—', "all'anno")}${kpi('Prezzo del latte', fmtVal(P.prezzo_ce ?? P.prezzo_ft, 'eur3') || '—', 'al litro')}${kpi('Costo di produzione', fmtVal(P.costo_l, 'eur3') || '—', 'al litro, senza contributi', '', P.margine_l != null && P.margine_l < 0 ? 't-bad' : '')}${kpi('IOFC', fmtVal(P.iofc_latt_vg, 'eur2') || '—', 'per vacca munta al giorno')}</div></section>`;
}

/* ---------------- carica documenti ---------------- */
const SCHEMA = {};
const IMP = { busy: false, fatti: 0, tot: 0, ris: [], file: '' };
function vImporta() {
  const r = IMP.ris; const fat = r.filter(x => x.tipo === 'fattura'), bil = r.filter(x => x.tipo === 'bilancino'), iva = r.filter(x => x.tipo === 'iva'), xls = r.filter(x => x.tipo === 'excel'), ced = r.filter(x => x.tipo === 'cedolini'), bp = r.filter(x => x.tipo === 'bilpaghe'), bon = r.filter(x => x.tipo === 'bonifici'), err = r.filter(x => x.tipo === 'errore'), elx = r.filter(x => x.tipo === 'elenco');
  const presenti = new Set(S.fatture.map(f => f.id));
  const drop = `<label class="dropzone" id="dropzone">${ic('file-up')}<b>${IMP.busy ? 'Lettura in corso…' : 'Trascina qui i documenti o tocca per sceglierli'}</b><p>${IMP.busy ? `${IMP.fatti} di ${IMP.tot} · ${esc(IMP.file)}` : 'Fatture elettroniche XML o P7M (anche lo ZIP del cassetto fiscale), fatture in PDF, dichiarazioni IVA (file telematico o PDF), bilancini del commercialista in PDF, cedolini e bilancini delle paghe, contabili dei bonifici ed estratti conto in PDF, vecchio file Excel del conto economico.'}</p><input type="file" multiple accept=".xml,.p7m,.pdf,.zip,.txt,.iva,.dat,.xlsx,application/pdf,application/zip,text/xml" data-act="c-files" hidden${IMP.busy ? ' disabled' : ''}></label>`;
  if (!r.length) return `${drop}<section class="card"><div class="card-h"><h2>${ic('info')}Dove trovare i documenti</h2></div><div class="pad-x" style="padding-bottom:16px"><p><b>Fatture elettroniche</b>: sul sito dell'Agenzia delle Entrate, <i>Fatture e Corrispettivi → Consultazione</i>, scarica le fatture ricevute ed emesse (anche tutte insieme con lo ZIP). L'XML è il formato più affidabile; il PDF va bene se non hai altro.</p><p><b>Dichiarazione IVA</b>: il file telematico inviato dal commercialista o il PDF del modello.</p><p><b>Bilancino</b>: la "situazione contabile al 31/12" in PDF che ti dà il commercialista.</p><p><b>Paghe</b>: ogni mese il PDF con i cedolini di tutti i dipendenti e il "bilancino contabile" delle paghe che ti manda il consulente del lavoro.</p><p><b>Vecchio file Excel</b>: <i>Conto_Economico_Stato_Patrimoniale.xlsx</i> con conto economico, stato patrimoniale, IVA, cespiti e fatture già caricate.</p><p class="muted">I file restano sul tuo dispositivo: l'app ne legge i dati e salva solo quelli.</p></div></section>`;
  const nuove = fat.filter(x => !presenti.has(idF(x.f)));
  const rowsF = fat.slice(0, 60).map(x => `<div class="imp-row"><span class="r-icon">${ic(presenti.has(idF(x.f)) ? 'copy' : String(x.f.controllo).startsWith('OK') ? 'receipt' : 'triangle-alert')}</span><span><b>${esc(x.f.fornitore)} → ${esc(x.f.cliente)}</b><span>n. ${esc(x.f.numero)} del ${fd(x.f.data)} · imponibile ${fmtVal(x.f.imponibile, 'eur2')} · ${x.f.righe.length} righe · ${presenti.has(idF(x.f)) ? 'già presente' : esc(x.f.controllo)}</span></span><span class="muted small">${esc(x.f.fonte === 'xml' ? 'XML' : 'PDF')}</span></div>`).join('');
  return `${drop}
  <section class="card"><div class="card-h"><h2>${ic('list-checks')}Documenti letti</h2><span class="sp"></span><button class="btn sm ghost" data-act="c-impCancel">${ic('x')}Annulla</button><button class="btn sm primary" data-act="c-impSave"${IMP.busy ? ' disabled' : ''}>${ic('check')}Salva tutto</button></div>
  ${fat.length ? `<div class="card-h"><h3>${ic('receipt')}Fatture: ${fat.length} lette, ${nuove.length} nuove</h3></div><div class="imp-list">${rowsF}${fat.length > 60 ? `<p class="muted small pad-x">… e altre ${fat.length - 60}</p>` : ''}</div>` : ''}
  ${bil.map((x, i) => `<div class="card-h"><h3>${ic('scale')}Bilancino ${esc(x.nome)}</h3></div><div class="imp-row"><span class="r-icon">${ic('scale')}</span><span><b>${esc(x.ditta || '')}</b><span>${x.conti.length} conti · ricavi ${fmtVal(sumSez(x, 'RICAVI'), 'eur')} · costi ${fmtVal(sumSez(x, 'COSTI'), 'eur')} · controlli: ${x.controlli.every(c => c.esito === 'OK') ? 'tutti OK' : x.controlli.filter(c => c.esito !== 'OK').map(c => c.esito).join(', ')}</span></span><span>Anno <input class="inp yr-in" inputmode="numeric" data-act="c-impAnno" data-k="${r.indexOf(x)}" value="${esc(x.anno || '')}" placeholder="anno"></span></div>`).join('')}
  ${iva.map(x => `<div class="card-h"><h3>${ic('percent')}Dichiarazione IVA ${esc(x.nome)}</h3></div><div class="imp-row"><span class="r-icon">${ic('percent')}</span><span><b>Volume d'affari ${fmtVal(x.voci.ve50, 'eur')} · IVA esigibile ${fmtVal(x.voci.vl1, 'eur')} · detratta ${fmtVal(x.voci.vl2, 'eur')}</b><span>${x.fonte} · ${Object.keys(x.valori).length} righi · controlli: ${x.controlli.every(c => c.esito === 'OK') ? 'tutti OK' : x.controlli.filter(c => c.esito !== 'OK').map(c => c.d + ' ' + c.esito).join('; ')}</span></span><span>Anno d'imposta <input class="inp yr-in" inputmode="numeric" data-act="c-impAnno" data-k="${r.indexOf(x)}" value="${esc(x.anno || '')}" placeholder="anno"><small class="muted" style="display:block">Modello IVA ${x.anno ? x.anno + 1 : '—'}</small></span></div>`).join('')}
  ${xls.map(x => `<div class="card-h"><h3>${ic('file-spreadsheet')}File Excel ${esc(x.nome)}</h3></div><div class="imp-row"><span class="r-icon">${ic('file-spreadsheet')}</span><span><b>${esc(x.azienda.nome || 'Modello di conto economico')}</b><span>Anni ${Object.keys(x.anni).join(', ') || '—'} · ${x.fatture.length} fatture · ${x.regole ? x.regole.length + ' regole delle categorie' : 'regole predefinite'}</span></span><span class="muted small">Sostituisce i valori di quegli anni</span></div>`).join('')}
  ${elx.map(x => `<div class="card-h"><h3>${ic('scan-search')}Elenco delle fatture ${x.tipoF === 'Vendita' ? 'emesse' : 'ricevute'} ${esc(x.nome)}</h3></div><div class="imp-row"><span class="r-icon">${ic('file-spreadsheet')}</span><span><b>${x.righe.length} fatture · totale ${fmtVal(x.righe.reduce((t, f) => t + Math.abs(N(f.totale)), 0), 'eur2')}</b><span>Serve a controllare che tu abbia caricato tutte le fatture: non aggiunge fatture all'archivio.</span></span><span>Anno <input class="inp yr-in" inputmode="numeric" data-act="c-impAnno" data-k="${r.indexOf(x)}" value="${esc(x.anno || '')}" placeholder="anno"></span></div>`).join('')}
  ${ced.map(x => `<div class="card-h"><h3>${ic('users')}Cedolini ${esc(x.nome)}</h3></div><div class="imp-row"><span class="r-icon">${ic('file-text')}</span><span><b>${esc(x.mesePer)} · ${x.cedolini.length} cedolini · netto ${fmtVal(x.cedolini.reduce((t, c) => t + N(c.netto), 0), 'eur2')}</b><span>${esc(x.cedolini.map(c => c.nome).join(', '))} · controlli: ${[...x.controlli, ...x.cedolini.flatMap(c => c.controlli)].every(c => c.esito === 'OK') ? 'tutti OK' : 'alcuni da verificare'}</span></span><span class="muted small">${x.cedolini.filter(c => S.paghe.some(p => p.tipo === 'cedolino' && p.anno === c.anno && p.mese === c.mese && p.nome === c.nome)).length ? 'sostituisce quelli già caricati' : 'nuovi'}</span></div>`).join('')}
  ${bp.map(x => `<div class="card-h"><h3>${ic('file-spreadsheet')}Bilancino paghe ${esc(x.nome)}</h3></div><div class="imp-row"><span class="r-icon">${ic('users')}</span><span><b>${esc(x.mesePer)} · lordo ${fmtVal(x.bil.lordo, 'eur2')} · costo aziendale ${fmtVal(x.bil.costo, 'eur2')}</b><span>Netto ${fmtVal(x.bil.netto, 'eur2')} · contributi ditta ${fmtVal(x.bil.contribDitta, 'eur2')} · IRPEF ${fmtVal(x.bil.irpef, 'eur2')} · controlli: ${x.bil.controlli.every(c => c.esito === 'OK') ? 'tutti OK' : 'da verificare'}</span></span><span class="muted small">${S.paghe.some(p => p.id === 'b-' + x.bil.anno + '-' + String(x.bil.mese).padStart(2, '0')) ? 'sostituisce' : 'nuovo'}</span></div>`).join('')}
  ${bon.map(x => `<div class="card-h"><h3>${ic('banknote')}${esc(x.etichetta || 'Bonifici')} ${esc(x.nome)}</h3><span class="muted small">${x.righe.length} movimenti · ${x.righe.filter(y => !y.altro).length} riconosciuti${x.ocr ? ' · letto con la lettura ottica: controlla gli importi' : ''}</span></div>${tabellaMovimenti(x.righe, r.indexOf(x), x.tutti)}`).join('')}
  ${err.length ? `<div class="card-h"><h3>${ic('triangle-alert')}Non letti: ${err.length}</h3></div>${err.map(x => `<div class="imp-row"><span class="r-icon">${ic('circle-x')}</span><span><b>${esc(x.nome)}</b><span>${esc(x.errore)}</span></span><span>${x.bytes ? `<button class="btn sm ghost" data-act="c-forza" data-k="${r.indexOf(x)}" data-tipo="iva">Leggi come dichiarazione IVA</button><button class="btn sm ghost" data-act="c-forza" data-k="${r.indexOf(x)}" data-tipo="bilancino">Leggi come bilancino</button><button class="btn sm ghost" data-act="c-forza" data-k="${r.indexOf(x)}" data-tipo="cedolini">Leggi come cedolini</button><button class="btn sm ghost" data-act="c-forza" data-k="${r.indexOf(x)}" data-tipo="bilpaghe">Leggi come bilancino paghe</button><button class="btn sm ghost" data-act="c-forza" data-k="${r.indexOf(x)}" data-tipo="bonifici">Leggi come bonifico</button><button class="btn sm ghost" data-act="c-forza" data-k="${r.indexOf(x)}" data-tipo="estratto">Leggi come estratto conto</button>` : ''}</span></div>`).join('')}` : ''}
  </section>`;
}
import { idFattura } from '../conti/importa.js';
const idF = f => idFattura(f.chiave);
const sumSez = (x, s) => x.conti.filter(c => c.sezione === s && c.riga != null).reduce((t, c) => t + N(c.importo), 0);

async function leggiFiles(files) {
  const { leggiDocumento } = await import('../conti/importa.js');
  IMP.busy = true; IMP.tot = files.length; IMP.fatti = 0; IMP.ris = IMP.ris || []; rerender();
  for (const f of files) {
    IMP.file = f.name; rerender();
    try { const b = new Uint8Array(await f.arrayBuffer()); await leggiDocumento(f.name, b, IMP.ris); } catch (e) { IMP.ris.push({ tipo: 'errore', nome: f.name, errore: e.message }); }
    IMP.fatti++;
  }
  // stesso bonifico in due file (contabile ed estratto conto): il secondo non si seleziona
  const tutte = IMP.ris.filter(x => x.tipo === 'bonifici').flatMap(x => x.righe);
  if (tutte.length > 1) { const { segnaDoppi } = await import('../conti/paghe.js'); segnaDoppi(tutte); }
  IMP.busy = false; IMP.file = ''; rerender();
}
async function salvaImport() {
  const M = await import('../conti/importa.js');
  const r = IMP.ris; const msg = [];
  const senzaAnno = r.filter(x => (x.tipo === 'iva' || x.tipo === 'bilancino' || x.tipo === 'elenco') && !+x.anno);
  if (senzaAnno.length) throw new Error(`Manca l'anno per: ${senzaAnno.map(x => x.nome).join(', ')}. Scrivilo nella casella e premi di nuovo Salva.`);
  for (const x of r.filter(x => x.tipo === 'excel')) { const o = await M.salvaExcel(x); msg.push(`Excel: ${o.anni} anni, ${o.fatture} fatture`); }
  const fat = r.filter(x => x.tipo === 'fattura').map(x => x.f);
  const elx = r.filter(x => x.tipo === 'elenco');
  if (elx.length) { const EL = await import('../conti/elenco.js'); for (const x of elx) { x.anno = +x.anno; await EL.salvaElenco(x); msg.push(`elenco fatture ${x.tipoF === 'Vendita' ? 'emesse' : 'ricevute'} ${x.anno}`); } }
  if (fat.length) { const o = await M.salvaFatture(fat); msg.push(`${o.nuove} fatture nuove${o.corrette ? ', ' + o.corrette + ' corrette' : ''}${o.doppie ? ', ' + o.doppie + ' già presenti' : ''}`); }
  for (const x of r.filter(x => x.tipo === 'bilancino')) { await M.salvaBilancino(x, +x.anno || null); msg.push('bilancino ' + x.anno); }
  for (const x of r.filter(x => x.tipo === 'iva')) { await M.salvaIva(x, +x.anno || null); msg.push(`dichiarazione IVA anno d'imposta ${x.anno}`); }
  if (r.some(x => x.tipo === 'cedolini' || x.tipo === 'bilpaghe')) {
    const PG = await import('../conti/paghe.js'); let n = 0, so = 0;
    for (const x of r.filter(x => x.tipo === 'cedolini')) { const o = await PG.salvaCedolini(x); n += o.nuovi; so += o.sostituiti; }
    if (n || so) msg.push(`${n} cedolini nuovi${so ? ', ' + so + ' sostituiti' : ''}`);
    for (const x of r.filter(x => x.tipo === 'bilpaghe')) { await PG.salvaBilancinoPaghe(x); msg.push('bilancino paghe ' + x.mesePer); }
  }
  const bonSel = r.filter(x => x.tipo === 'bonifici').flatMap(x => x.righe.filter(y => y.sel));
  const PG = await import('../conti/paghe.js');
  if (bonSel.some(y => PG.CON_DIP.has(y.tipo) && !y.dip)) throw new Error('Per ogni stipendio, anticipo o prestito scegli il dipendente (o togli la spunta).');
  if (bonSel.some(y => y.tipo === 'fattura' && !(y.fatt || []).length)) throw new Error('Scegli la fattura per ogni pagamento di fattura (o togli la spunta).');
  if (bonSel.length) { const BK = await import('../conti/banca.js'); const o = await BK.salvaRighe(bonSel, ''); if (o.nP) msg.push(o.nP === 1 ? '1 pagamento del personale' : o.nP + ' pagamenti del personale'); if (o.nF) msg.push(o.nF === 1 ? '1 pagamento di fattura' : o.nF + ' pagamenti di fatture'); if (o.nB) msg.push(o.nB === 1 ? '1 movimento di banca e finanza' : o.nB + ' movimenti di banca e finanza'); if (o.nD) msg.push(o.nD === 1 ? '1 doppio eliminato' : o.nD + ' doppi eliminati'); }
  const nonLetti = r.filter(x => x.tipo === 'errore').length;
  IMP.ris = []; toast('Salvato: ' + msg.join(' · ') + (nonLetti ? ` · ${nonLetti} file non letti (non salvati)` : ''));
  const paghe = r.filter(x => x.tipo === 'cedolini' || x.tipo === 'bilpaghe');
  if (elx.length) { UI.f.cm_tipo = elx[elx.length - 1].tipoF; UI.f.cm_stato = ''; }
  UI.sub.conti = elx.length && !fat.length ? 'mancanti' : !paghe.length && bonSel.length && !fat.length ? 'pagamenti' : paghe.length && !fat.length ? 'personale' : fat.length ? 'fatture' : r.some(x => x.tipo === 'bilancino' || x.tipo === 'excel') ? 'ce' : r.some(x => x.tipo === 'iva') ? 'iva' : 'panoramica';
  const yrs = fat.map(f => +String(f.data || '').slice(0, 4)).filter(Boolean); if (yrs.length) UI.anno = Math.max(...yrs);
  else if (elx.length) UI.anno = +elx[elx.length - 1].anno;
  else { const altri = r.filter(x => (x.tipo === 'iva' || x.tipo === 'bilancino') && +x.anno).map(x => +x.anno).concat(paghe.map(x => +(x.anno || (x.bil || {}).anno)).filter(Boolean)).concat(bonSel.map(y => +String(y.data || '').slice(0, 4)).filter(Boolean)); if (altri.length) UI.anno = Math.max(...altri); }
  rerender();
}

/** Elenco annuale delle fatture caricato dalla pagina "Fatture mancanti": si legge e si salva subito. */
async function caricaElenco(file) {
  const [{ leggiXlsx }, EL] = await Promise.all([import('../conti/xlsx.js'), import('../conti/elenco.js')]);
  const W = await leggiXlsx(new Uint8Array(await file.arrayBuffer()));
  const x = EL.trovaElenco(W, file.name);
  if (!x) throw new Error(`${file.name}: non trovo l'elenco delle fatture (servono le colonne Numero, Data fattura e Partita IVA o Denominazione del fornitore o del cliente).`);
  if (!x.anno) throw new Error(`${file.name}: non capisco l'anno. Scrivilo nel nome del file, per esempio passive_2025.xlsx.`);
  await EL.salvaElenco(Object.assign({ nome: file.name }, x));
  UI.anno = x.anno; UI.f.cm_tipo = x.tipoF; UI.f.cm_stato = '';
  toast(`Elenco ${x.tipoF === 'Vendita' ? 'delle fatture emesse' : 'delle fatture ricevute'} ${x.anno}: ${x.righe.length} fatture`);
  rerender();
}

/* ---------------- regole ---------------- */
function vRegole() {
  const reg = regole(); const piva = pivaPropria(); const q = (UI.f.rg_q || '').toLowerCase().trim();
  const nc = new Map(); righe().forEach(r => nc.set(r.categoria, (nc.get(r.categoria) || 0) + 1));
  return `<section class="card"><div class="card-h"><h2>${ic('building-2')}Partita IVA dell'azienda</h2></div><div class="pad-x" style="padding-bottom:16px"><p class="muted small">Serve a distinguere le fatture di vendita (emesse dall'azienda) da quelle di acquisto.</p><div class="toolbar"><input class="inp" id="c_piva" inputmode="numeric" value="${esc(piva)}" placeholder="11 cifre" style="max-width:200px"><button class="btn sm" data-act="c-piva">${ic('check')}Salva e ricalcola</button></div></div></section>
  <section class="card"><div class="card-h"><h2>${ic('list-checks')}Regole delle categorie</h2><span class="count">${reg.length}</span></div>
  <p class="muted small pad-x">Le regole si applicano dall'alto verso il basso: vince la prima che corrisponde. La parola chiave si cerca all'inizio delle parole della descrizione; il nome della controparte, se indicato, deve comparire nel fornitore o cliente. Tipo vuoto = vale per acquisti e vendite.</p>
  <div class="toolbar pad-x"><div class="search">${ic('search')}<input class="inp" id="rgq" data-filter="rg_q" placeholder="Cerca tra le regole" value="${esc(UI.f.rg_q || '')}" autocomplete="off"></div></div>
  <form id="regForm" class="tablewrap etab"><table><thead><tr><th class="t">#</th><th class="t">Parola chiave</th><th class="t">Fornitore o cliente</th><th class="t">Categoria</th><th class="t">Tipo</th><th class="t"></th></tr></thead><tbody>${reg.map((r, i) => `<tr data-i="${i}"${q && !r.join(' ').toLowerCase().includes(q) ? ' hidden' : ''}><td class="t">${i + 1}</td><td class="t"><input class="cell-in wide" name="kw" value="${esc(r[0])}"></td><td class="t"><input class="cell-in wide" name="fo" value="${esc(r[1])}"></td><td class="t"><input class="cell-in wide" name="cat" list="dlcat-${r[3] || 'Acquisto'}" value="${esc(r[2])}"></td><td class="t"><select class="cell-in" name="tp"><option value=""${!r[3] ? ' selected' : ''}>Entrambi</option><option${r[3] === 'Acquisto' ? ' selected' : ''}>Acquisto</option><option${r[3] === 'Vendita' ? ' selected' : ''}>Vendita</option></select></td><td class="t" style="white-space:nowrap"><button type="button" class="iconbtn" data-act="c-regMove" data-i="${i}" data-d="-1" aria-label="Su">${ic('chevron-left', 'rot90')}</button><button type="button" class="iconbtn" data-act="c-regMove" data-i="${i}" data-d="1" aria-label="Giù">${ic('chevron-right', 'rot90')}</button><button type="button" class="iconbtn" data-act="c-regDel" data-i="${i}" aria-label="Elimina">${ic('trash-2')}</button></td></tr>`).join('')}</tbody></table></form>
  <div class="factions pad-x" style="padding-bottom:16px"><button class="btn sm ghost" data-act="c-regAdd">${ic('plus')}Aggiungi regola</button><button class="btn sm ghost" data-act="c-regReset">${ic('rotate-ccw')}Ripristina le predefinite</button><span class="sp"></span><button class="btn sm" data-act="c-regSave">${ic('check')}Salva</button><button class="btn sm primary" data-act="c-regApply">${ic('refresh-cw')}Salva e riapplica a tutte le righe</button></div></section>
  <section class="card"><div class="card-h"><h2>Categorie usate</h2></div>${tabella('catuse', { title: 'Categorie usate', cols: [{ k: 'c', h: 'Categoria' }, { k: 'n', h: 'Righe', fmt: 'int' }], rows: [...nc.entries()].map(([c, n]) => ({ c, n })).sort((a, b) => b.n - a.n) })}</section>${datalistCat()}`;
}
function leggiRegole() { return $$('#regForm tbody tr').map(tr => [tr.querySelector('[name=kw]').value.trim(), tr.querySelector('[name=fo]').value.trim(), tr.querySelector('[name=cat]').value.trim(), tr.querySelector('[name=tp]').value]).filter(r => r[2] && (r[0] || r[1])); }
async function salvaCfg(patch) { await store.put('econfig', 'cfg', Object.assign({}, cfg(), patch)); }

/* ---------------- esportazione completa ---------------- */
export async function esportaTutto(y) {
  const salva = UI.anno; UI.anno = y;
  const f0 = Object.assign({}, UI.f); ['ce_edit', 'sp_edit', 'cs_edit', 'an_edit', 'pc_mese', 'pc_dip', 'pp_tipo'].forEach(k => (UI.f[k] = '')); UI.f.ce_zeri = 'tutte'; UI.f.sp_zeri = 'tutte';
  registro.clear();
  try {
    vCE(); vSP(); vIndici(); vAnalisi(); vIva(); vCespiti(); vControlli(); if (S.paghe.length || S.pagamenti.length) { vPersonale(); vVerifica(); UI.f.pc_vista = ''; vCedolini(); vPagamenti(); vPrestiti(); }
    const fs = fatture().filter(f => f.anno === y);
    tabella('xfatt', { title: 'Fatture ' + y, sheet: 'Fatture ' + y, cols: [{ k: 'data', h: 'Data', fmt: 'date' }, { k: 'tipo', h: 'Tipo' }, { k: 'controparte', h: 'Controparte' }, { k: 'piva', h: 'P.IVA' }, { k: 'numero', h: 'Numero' }, { k: 'tipoDoc', h: 'Tipo doc.' }, { k: 'imponibile', h: 'Imponibile', fmt: 'eur2' }, { k: 'iva', h: 'IVA', fmt: 'eur2' }, { k: 'totale', h: 'Totale', fmt: 'eur2' }, { k: 'pagamento', h: 'Pagamento' }, { k: 'scadenza', h: 'Scadenza', fmt: 'date' }, { k: 'controllo', h: 'Controllo' }, { k: 'file', h: 'File' }], rows: fs, sort: false });
    tabella('xrighe', { title: 'Righe delle fatture ' + y, sheet: 'Righe ' + y, cols: [{ k: 'data', h: 'Data', fmt: 'date' }, { k: 'tipo', h: 'Tipo' }, { k: 'controparte', h: 'Controparte' }, { k: 'numero', h: 'N. fattura' }, { k: 'ddt', h: 'DDT' }, { k: 'codice', h: 'Codice' }, { k: 'descrizione', h: 'Descrizione' }, { k: 'categoria', h: 'Categoria' }, { k: 'quantita', h: 'Quantità', fmt: 'qta' }, { k: 'um', h: 'UM' }, { k: 'prezzo', h: 'Prezzo', fmt: 'eur4' }, { k: 'sconto', h: 'Sconto' }, { k: 'aliquota', h: '% IVA' }, { k: 'importo', h: 'Importo', fmt: 'eur2' }], rows: righe().filter(r => r.anno === y), sort: false });
    await esporta(['ce', 'sp', 'ind', 'anD', 'anP', 'iva', 'cesp', 'ctrl', 'xfatt', 'xrighe', 'pmesi', 'pdip', 'pced', 'pver', 'pvers', 'ppag', 'ppre', 'pant'].filter(id => registroHas(id)), `Conti ${y} – ${azienda().nome || 'azienda'}`, 'xlsx');
  } finally { UI.anno = salva; Object.keys(UI.f).forEach(k => delete UI.f[k]); Object.assign(UI.f, f0); }
}
import { registro } from '../conti/tabelle.js';
const registroHas = id => registro.has(id);

/* ---------------- azioni ---------------- */
let rerender = () => { };
export function setRerender(fn) { rerender = fn; }
const parseIt = s => { s = String(s || '').trim().replace(/\s|€/g, ''); if (!s) return null; if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.'); else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, ''); const v = parseFloat(s); return isFinite(v) ? v : null; };

async function salvaCategoria(fid, i, cat, el) {
  const f = S.fatture.find(x => x.id === fid); if (!f || !cat) return;
  const righe_ = (f.righe || []).map((r, k) => k === i ? Object.assign({}, r, { categoria: cat, catManuale: true }) : r);
  const { id, ...data } = f; await store.put('fatture', fid, Object.assign(data, { righe: righe_ }));
  const r = f.righe[i];
  // impara subito: le righe uguali o quasi uguali classificate in automatico prendono la stessa categoria
  const { propagaCorrezione } = await import('../conti/importa.js'); const prop = await propagaCorrezione(f.tipo, r.descrizione, cat);
  const simili = S.fatture.reduce((t, x) => t + (x.righe || []).filter((y, k) => !(x.id === fid && k === i) && y.descrizione === r.descrizione && y.categoria !== cat).length, 0);
  toast(prop ? `Categoria salvata e applicata anche a ${prop === 1 ? '1 riga simile classificata' : prop + ' righe simili classificate'} in automatico` : 'Categoria salvata');
  const box = $('#catHint');
  if (box && simili) box.innerHTML = `<div class="note-box">${ic('sparkles')}<span>Ci sono altre ${simili} righe con la stessa descrizione. <button class="linkbtn" data-act="c-catAll" data-desc="${esc(r.descrizione)}" data-cat="${esc(cat)}" data-tipo="${f.tipo}">Applica "${esc(cat)}" anche a loro</button> · <button class="linkbtn" data-act="c-catRule" data-desc="${esc(r.descrizione)}" data-cat="${esc(cat)}" data-tipo="${f.tipo}">Crea una regola</button></span></div>`;
}
/** Conferma le righe classificate in automatico che passano il test: diventano scelte tue (esempi per l'IA, mai più cambiate). */
async function confermaRighe(test) {
  const rows = []; let n = 0;
  for (const f of S.fatture) {
    let c = false;
    const rr = (f.righe || []).map((r, i) => { if (!daConfermare(r) || !test(f, r, i)) return r; c = true; n++; return Object.assign({}, r, { catManuale: true, catConfermata: true }); });
    if (c) { const { id, ...data } = f; rows.push({ col: 'fatture', id, data: Object.assign(data, { righe: rr }) }); }
  }
  if (rows.length) await store.bulkPut(rows);
  return n;
}
/** Nuova categoria a tutte le righe con questa descrizione e questa controparte (dalla vista "Da confermare"). */
async function catDesc(tipo, cp, desc, cat) {
  const rows = []; let n = 0;
  for (const f of S.fatture) {
    if (f.tipo !== tipo || (f.controparte || '') !== cp) continue; let c = false;
    const rr = (f.righe || []).map(r => { if (r.descrizione !== desc || (r.catManuale && r.categoria === cat)) return r; c = true; n++; return Object.assign({}, r, { categoria: cat, catManuale: true }); });
    if (c) { const { id, ...data } = f; rows.push({ col: 'fatture', id, data: Object.assign(data, { righe: rr }) }); }
  }
  if (rows.length) await store.bulkPut(rows);
  const { propagaCorrezione } = await import('../conti/importa.js'); const prop = await propagaCorrezione(tipo, desc, cat);
  toast((n === 1 ? 'Corretta 1 riga' : `Corrette ${n} righe`) + (prop ? ` e ${prop === 1 ? '1 riga simile' : prop + ' righe simili'}` : '') + (n === 1 && !prop ? ': ora è un tuo esempio' : ': ora sono tuoi esempi'));
}
const msgConf = n => toast(n ? `${n === 1 ? 'Confermata 1 riga' : `Confermate ${n} righe`}: l'IA le userà come esempi` : 'Niente da confermare');

/** Esito della prova di precisione, con lo storico delle prove e gli errori del modello. */
function schedaProva(es) {
  const pc = v => es.provate ? Math.round(v / es.provate * 100) + '%' : '—';
  const st = (cfg().provaIA || []).slice(-8);
  openSheet('Prova di precisione', `<p>Ho preso <b>${es.provate}</b> righe che avevi già classificato, ho nascosto la categoria e le ho fatte classificare al ${es.motore === 'locale' ? 'modello sul PC' : 'Claude'}, con gli altri tuoi esempi come guida.</p>
  <div class="kpis"><div class="kpi static"><span class="k-l">Giuste</span><span class="k-v sm">${pc(es.giuste)}</span><span class="k-s">${es.giuste} righe</span></div><div class="kpi static"><span class="k-l">Incerte</span><span class="k-v sm">${pc(es.incerte)}</span><span class="k-s">lasciate da classificare</span></div><div class="kpi static"><span class="k-l">Sbagliate</span><span class="k-v sm">${pc(es.sbagliate)}</span><span class="k-s">${es.sbagliate} righe</span></div></div>
  ${st.length > 1 ? `<h3 class="sheet-h">Come sta migliorando</h3><div class="list flat">${st.map(p => `<div class="row static"><span class="r-main"><b>${esc(p.data)} · ${p.provate ? Math.round(p.giuste / p.provate * 100) : 0}% giuste</b><span>${p.sbagliate} sbagliate, ${p.incerte} incerte su ${p.provate}</span></span></div>`).join('')}</div>` : ''}
  ${es.errori.length ? `<h3 class="sheet-h">Dove ha sbagliato</h3><p class="muted small">Se la tua categoria è giusta non serve fare niente: è già un esempio. Se invece aveva ragione il modello, correggi la riga nella fattura.</p><div class="tablewrap etab"><table><thead><tr><th class="t">Controparte</th><th class="t">Descrizione</th><th class="t">Tua categoria</th><th class="t">Modello</th></tr></thead><tbody>${es.errori.slice(0, 100).map(e => `<tr><td class="t">${esc(e.c)}</td><td class="t">${esc(e.d)}</td><td class="t">${esc(e.giusta)}</td><td class="t">${esc(e.modello)}</td></tr>`).join('')}</tbody></table></div>` : ''}
  <p class="muted small">Più righe classifichi o correggi tu, più esempi ha il modello e più la percentuale sale. Rifai la prova ogni tanto per vederlo.</p>
  <div class="factions"><span class="sp"></span><button class="btn" data-act="close">Chiudi</button></div>`, { wide: true });
}
async function catTutte(desc, cat) {
  const rows = []; for (const f of S.fatture) { let c = false; const rr = (f.righe || []).map(r => { if (r.descrizione === desc && r.categoria !== cat) { c = true; return Object.assign({}, r, { categoria: cat, catManuale: true }); } return r; }); if (c) { const { id, ...data } = f; rows.push({ col: 'fatture', id, data: Object.assign(data, { righe: rr }) }); } }
  if (rows.length) await store.bulkPut(rows); toast(`Categoria applicata a ${rows.length} fatture`);
}

export async function onAct(a, b, d) {
  if (a === 'c-pMovTutti' && d.k != null) { const x = IMP.ris[+d.k]; if (x) x.tutti = !x.tutti; return rerender(); }
  if (/^c-p[A-Z]/.test(a)) return personaleAct(a, b, d, rerender);
  switch (a) {
    case 'tsort': ordina(d.id, d.k); return rerender();
    case 'texp': try { await esporta(d.ids.split(','), d.nome, d.fmt); } catch (e) { toast(e.message, 'err'); } return;
    case 'c-go': UI.tab = 'conti'; UI.sub.conti = d.sub; UI.detail = null; if (d.f) UI.f[d.f] = d.v; rerender(); return window.scrollTo(0, 0);
    case 'c-fatt': return schedaFattura(d.id);
    case 'c-fpTogli': { const BK = await import('../conti/banca.js'); await BK.togliPagamentoFattura(d.id, d.mov); toast('Pagamento tolto dalla fattura'); return schedaFattura(d.id); }
    case 'c-delfatt': return arm(b, 'Conferma: elimina la fattura', async () => { await store.remove('fatture', d.id); closeSheet(); toast('Fattura eliminata'); });
    case 'c-goCp': UI.sub.conti = 'fatture'; Object.assign(UI.f, { cf_cp: d.cp, cf_tipo: d.tipo, cf_q: '', cf_cat: '', cf_stato: '', cf_vista: 'fatture' }); rerender(); return window.scrollTo(0, 0);
    case 'c-goCat': UI.sub.conti = 'fatture'; Object.assign(UI.f, { cf_cat: d.cat, cf_tipo: d.tipo, cf_cp: '', cf_q: '', cf_stato: '', cf_vista: 'righe' }); rerender(); return window.scrollTo(0, 0);
    case 'c-prod': return schedaProdotto(d.k, d.tipo);
    case 'c-cfreset': Object.assign(UI.f, { cf_cp: '', cf_cat: '', cf_q: '', cf_mese: '', cf_stato: '' }); return rerender();
    case 'c-catAll': await catTutte(d.desc, d.cat); { const h = $('#catHint'); if (h) h.innerHTML = ''; } return;
    case 'c-catRule': { const kw = d.desc.toUpperCase().split(/\s+/).filter(w => w.length > 3)[0] || d.desc.toUpperCase().slice(0, 12); await salvaCfg({ regole: [[kw, '', d.cat, d.tipo], ...regole()] }); toast(`Regola creata: "${kw}" → ${d.cat}`); closeSheet(); UI.sub.conti = 'regole'; return rerender(); }
    case 'c-impSave': b.disabled = true; try { await salvaImport(); } catch (e) { toast(e.message, 'err'); b.disabled = false; } return;
    case 'c-forza': { const k = +d.k; const x = IMP.ris[k]; if (!x || !x.bytes) return; b.disabled = true; try { const { leggiComeTipo } = await import('../conti/importa.js'); IMP.ris[k] = await leggiComeTipo(x.nome, x.bytes, d.tipo); } catch (e) { toast(x.nome + ': ' + e.message, 'err'); b.disabled = false; return; } return rerender(); }
    case 'c-impCancel': IMP.ris = []; return rerender();
    case 'c-elGo': UI.anno = +d.anno; UI.f.cm_tipo = d.tipo; UI.f.cm_stato = ''; return rerender();
    case 'c-elDel': return arm(b, 'Conferma: togli l\'elenco', async () => { const EL = await import('../conti/elenco.js'); await EL.togliElenco(d.tipo, +d.anno); toast('Elenco tolto (le fatture caricate restano)'); });
    case 'c-piva': { const v = ($('#c_piva').value || '').replace(/\D/g, ''); if (v && v.length !== 11) return toast('La partita IVA ha 11 cifre', 'err'); await salvaCfg({ piva: v }); const { ricalcolaTipi } = await import('../conti/importa.js'); const n = await ricalcolaTipi(v); return toast(n ? `Salvata: ${n} fatture cambiate tra acquisti e vendite` : 'Partita IVA salvata'); }
    case 'c-regAdd': await salvaCfg({ regole: [['', '', '', 'Acquisto'], ...leggiRegoleConVuote()] }); return;
    case 'c-regDel': { const r = leggiRegoleConVuote(); r.splice(+d.i, 1); await salvaCfg({ regole: r }); return; }
    case 'c-regMove': { const r = leggiRegoleConVuote(); const i = +d.i, j = i + +d.d; if (j < 0 || j >= r.length) return; [r[i], r[j]] = [r[j], r[i]]; await salvaCfg({ regole: r }); return; }
    case 'c-regSave': await salvaCfg({ regole: leggiRegole() }); return toast('Regole salvate');
    case 'c-autoCat': { b.disabled = true; try { const { riapplicaRegole } = await import('../conti/importa.js'); const n = await riapplicaRegole(); const resto = righe().filter(r => r.categoria === DA_CLASSIFICARE).length; toast(n ? (n === 1 ? 'Classificata 1 riga' : `Classificate ${n} righe`) + (resto ? (resto === 1 ? ': ne resta 1' : `: ne restano ${resto}`) : '') : 'Nessuna riga in più riconosciuta dalle regole o dalle categorie già date'); } finally { b.disabled = false; } return; }
    case 'c-confRiga': { const n = await confermaRighe((f, r, i) => f.id === d.fid && i === +d.i); msgConf(n); if (b.closest('#sheet')) schedaFattura(d.fid); return; }
    case 'c-confFatt': { const n = await confermaRighe(f => f.id === d.fid); msgConf(n); return schedaFattura(d.fid); }
    case 'c-confGruppo': return msgConf(await confermaRighe((f, r) => f.tipo === d.tipo && (f.controparte || '') === d.cp && r.categoria === d.cat));
    case 'c-confDesc': return msgConf(await confermaRighe((f, r) => f.tipo === d.tipo && (f.controparte || '') === d.cp && r.descrizione === d.desc));
    case 'c-iaCat': case 'c-iaRiguarda': case 'c-iaProva': {
      if (IA.attiva) return;
      const motore = d.motore === 'locale' ? 'locale' : 'claude'; const chi = motore === 'locale' ? 'Il modello sul PC' : 'Claude';
      const lavoro = a === 'c-iaProva' ? 'prova' : a === 'c-iaRiguarda' ? 'riguarda' : 'nuove';
      Object.assign(IA, { attiva: true, motore, lavoro, viste: 0, totale: 0 }); rerender();
      const prog = (viste, totale) => { Object.assign(IA, { viste, totale }); rerender(); };
      try {
        const M = await import('../conti/importa.js');
        if (lavoro === 'prova') { const es = await M.provaPrecisione(prog, motore); IA.attiva = false; rerender(); return schedaProva(es); }
        const r = await M.classificaConIA(prog, motore, lavoro);
        const resto = righe().filter(x => x.categoria === DA_CLASSIFICARE).length;
        const mem = r.memoria ? `La memoria ne ha sistemate ${r.memoria} da sola. ` : '';
        toast(lavoro === 'riguarda'
          ? mem + `${chi} ha ricontrollato le righe classificate in automatico: ${r.cambiate === 1 ? '1 cambiata' : r.cambiate + ' cambiate'}`
          : mem + `${chi} ha classificato ${r.fatte === 1 ? '1 riga' : r.fatte + ' righe'}` + (resto ? `: ne restano ${resto} da guardare a mano` : ''));
      } catch (e) { toast(e.message, 'err'); } finally { IA.attiva = false; rerender(); }
      return;
    }
    case 'c-iaStop': { const { FERMA_IA } = await import('../conti/importa.js'); FERMA_IA.si = true; return toast('Mi fermo dopo il blocco in corso: il lavoro fatto è già salvato'); }
    case 'c-regApply': { await salvaCfg({ regole: leggiRegole() }); const { riapplicaRegole } = await import('../conti/importa.js'); const n = await riapplicaRegole(); return toast(`Regole riapplicate: ${n} righe cambiate (le categorie scelte a mano restano)`); }
    case 'c-bkDel': return arm(b, 'Conferma: togli', async () => { await store.remove('econfig', d.id); toast('Movimento della banca tolto'); });
    case 'c-regReset': return arm(b, 'Conferma: torna alle predefinite', async () => { await salvaCfg({ regole: REGOLE_PREDEFINITE.map(r => [...r]) }); toast('Regole predefinite ripristinate'); });
  }
}
function leggiRegoleConVuote() { return $$('#regForm tbody tr').map(tr => [tr.querySelector('[name=kw]').value.trim(), tr.querySelector('[name=fo]').value.trim(), tr.querySelector('[name=cat]').value.trim(), tr.querySelector('[name=tp]').value]); }

export async function onChange(t) {
  const a = t.dataset.act;
  if (a === 'c-files' && t.files.length) { const fs = [...t.files]; t.value = ''; return leggiFiles(fs); }
  if (a === 'c-elFile' && t.files.length) { const f = t.files[0]; t.value = ''; return caricaElenco(f); }
  if (a === 'c-cdcCat') { const m = Object.assign({}, cfg().cdcCat || {}); m[t.dataset.k] = t.value; await salvaCfg({ cdcCat: m }); return toast('Centro della categoria salvato'); }
  if (a === 'c-cdcRiga') { const f = S.fatture.find(x => x.id === t.dataset.fid); const i = +t.dataset.i; if (!f || !(f.righe || [])[i]) return; const rr = f.righe.map((r, k) => { if (k !== i) return r; const o = Object.assign({}, r); if (t.value) o.cdc = t.value; else delete o.cdc; return o; }); const { id, ...data } = f; await store.put('fatture', f.id, Object.assign(data, { righe: rr })); return; }
  if (a === 'c-bkVoce') { const m = S.econfig.find(x => x.id === t.dataset.id); if (!m) return; const { id, ...data } = m; await store.put('econfig', id, Object.assign(data, { voce: t.value })); return; }
  if (a === 'c-rlsCat') { const m = Object.assign({}, cfg().rlsCat || {}); m[t.dataset.k] = t.value; await salvaCfg({ rlsCat: m }); return; }
  if ((a === 'c-pMovSel' || a === 'c-pMovSet') && t.dataset.k != null) { const x = IMP.ris[+t.dataset.k]; if (x && x.righe) modificaRiga(x.righe, t); return rerender(); }
  if (/^c-p[A-Z]/.test(a || '')) return personaleChange(t, rerender);
  if (a === 'c-cat') return salvaCategoria(t.dataset.fid, +t.dataset.i, t.value.trim(), t);
  if (a === 'c-catDesc') { const v = t.value.trim(); if (v) return catDesc(t.dataset.tipo, t.dataset.cp, t.dataset.desc, v); return; }
  if (a === 'c-impAnno') { const x = IMP.ris[+t.dataset.k]; if (x) x.anno = +t.value || null; return; }
  if (a === 'c-conto') { const cu = Object.assign({}, cfg().contiUtente || {}); cu[t.dataset.conto] = +t.value; await salvaCfg({ contiUtente: cu }); const { riabbinaBilancino } = await import('../conti/importa.js'); for (const y of anniBilancio()) await riabbinaBilancino(y); return toast('Abbinamento salvato e applicato ai bilancini'); }
  if (a === 'c-val') {
    const y = +t.dataset.y, col = t.dataset.col; let v = parseIt(t.value); if (t.value.trim() && v === null) return toast('Scrivi un numero', 'err');
    if (v !== null && t.dataset.pct) v = v / 100;
    const b = bilancio(y) || { anno: y }; const { id, ...data } = JSON.parse(JSON.stringify(b)); data.anno = y;
    if (col === 'ce' || col === 'sp') { data[col] = data[col] || {}; if (v === null) delete data[col][t.dataset.row]; else data[col][t.dataset.row] = v; if (col === 'ce') { data.fonteCe = data.fonteCe || {}; if (v === null) delete data.fonteCe[t.dataset.row]; else data.fonteCe[t.dataset.row] = 'manuale'; } }
    else if (col === 'cespiti') { data.cespiti = data.cespiti || {}; const o = data.cespiti[t.dataset.row] || {}; if (v === null) delete o[t.dataset.campo]; else o[t.dataset.campo] = v; data.cespiti[t.dataset.row] = o; }
    else { data[col] = data[col] || {}; if (v === null) delete data[col][t.dataset.campo]; else data[col][t.dataset.campo] = v; }
    await store.put('bilanci', String(y), data);
  }
}
export function onDrop(e) {
  const z = e.target.closest && e.target.closest('#dropzone'); if (!z) return false;
  e.preventDefault(); z.classList.remove('over');
  if (e.type === 'drop' && e.dataTransfer && e.dataTransfer.files.length && !IMP.busy) leggiFiles([...e.dataTransfer.files]);
  else if (e.type === 'dragover') z.classList.add('over');
  return true;
}
