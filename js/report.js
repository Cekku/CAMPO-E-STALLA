// Report del mese (chiesto da Marco il 20/11/2026): un riepilogo di un mese di Conti, Personale, Stalla, Magazzino e
// Campagna, con il controllo di completezza in cima. Nota completa in .claude/rules/report.md.
// - prepara(mese, { conti }) → oggetto semplice (solo numeri, testi e tabelle), così si salva com'è come istantanea e
//   si ridisegna uguale anche se i dati cambiano dopo. I numeri vengono dalle funzioni che già li calcolano
//   (righe/fatture dei Conti, statoPagamento, mesiBanca, cedolini, verifica, versamenti, righeTrattamenti, giac…):
//   qui si filtrano per mese e si sommano.
// - Istantanee: config 'rp-AAAA-MM' (senza Conti, Personale e valori: la vedono i collaboratori) ed econfig
//   'rpc-AAAA-MM' (completa, riservata al titolare dalle regole RLS).
// - aggiungiSezione(def): punto di aggancio per le altre parti dell'app (latte dal caseificio, F24, scadenze…).
import { S, D } from './state.js';
import * as store from './store.js';
import { N, okD, today, addDays, yearOf } from './util.js';
import { capoI, cropOf, colturaAlla, campoHa, chiudeColtura, TIPI_EV } from './domain.js';
import { righeTrattamenti } from './registro.js';
import { fatture, righe, litriRiga } from './conti/dati.js';
import { DA_CLASSIFICARE, CAT_LATTE, CAT_PREMI } from './conti/regole.js';
import { mesiBanca } from './conti/sospesi.js';
import { cedolini, bilanciniPaghe, dipendenti, verifica, versamenti, TIPI_PAG } from './conti/paghe.js';
import { contiVisibili } from './views/conti.js';
import { dubbi as dubbiCentro, elenco as automazioni } from './automazioni.js';

export const VER = 1;
export const AUT = 'report-mese';
export const AUT_SQUADRA = 'report-mese-squadra';
const r2 = v => Math.round(N(v) * 100) / 100;
const r1 = v => Math.round(N(v) * 10) / 10;

/* ---------------- mesi ---------------- */
export const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
export const okM = m => typeof m === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(m);
export const nomeMese = m => (okM(m) ? MESI[+m.slice(5, 7) - 1] + ' ' + m.slice(0, 4) : '');
export const soloMese = m => (okM(m) ? MESI[+m.slice(5, 7) - 1] : '');
/** "di ottobre" (sempre "di": è l'italiano più semplice). */
export const diMese = m => 'di ' + soloMese(m);
export const mesePrima = m => { const [y, k] = m.split('-').map(Number); return k === 1 ? `${y - 1}-12` : `${y}-${String(k - 1).padStart(2, '0')}`; };
export const meseDopo = m => { const [y, k] = m.split('-').map(Number); return k === 12 ? `${y + 1}-01` : `${y}-${String(k + 1).padStart(2, '0')}`; };
/** L'ultimo mese finito (a novembre: ottobre). */
export const meseChiuso = (t = today()) => mesePrima(t.slice(0, 7));
const inizio = m => m + '-01';
const fine = m => addDays(meseDopo(m) + '-01', -1);
const nel = (d, m) => okD(d) && d.slice(0, 7) === m;

/* ---------------- aggancio per le altre parti dell'app ---------------- */
const EXTRA = [];
/**
 * Aggiunge una sezione al report (per le altre parti dell'app, senza toccare questo file):
 * aggiungiSezione({ id, dopo: 'stalla', calcola(ctx) → sezione | null, controlli?(ctx) → [controllo] }).
 * ctx = { mese, y, k, ini, fin, rif, mp, conti, oggi }; una sezione riservata la dà solo se ctx.conti è vero.
 * sezione = { id, titolo, icona, area, kpi: [{ l, v, f, u, s }], tabelle: [{ id, title, sheet, cols: [{ k, h, fmt }], rows, tot, note }], note: [] }
 * controllo = { id, testo, ok, dett, go: { area, tab, sub, f, v, anno } }. Tutto deve essere JSON semplice.
 */
export function aggiungiSezione(def) { if (def && def.id && typeof def.calcola === 'function' && !EXTRA.some(x => x.id === def.id)) EXTRA.push(def); }

/* ---------------- sezioni ---------------- */
const kpi = (l, v, f = 'n', extra = {}) => Object.assign({ l, v: v === null || v === undefined ? null : typeof v === 'number' ? r2(v) : v, f }, extra);
const tab = (id, title, cols, rows, extra = {}) => Object.assign({ id, title, sheet: extra.sheet || title.slice(0, 31), cols, rows }, extra);
const confronto = (ora, prima) => (prima ? Math.round((ora - prima) / Math.abs(prima) * 1000) / 10 : null);

function sezConti(c) {
  if (!c.conti) return null;
  const R = righe(), F = fatture();
  const perCat = tipo => {
    const map = new Map();
    for (const r of R) {
      if (r.tipo !== tipo || !okD(r.data)) continue; const k = r.data.slice(0, 7); if (k !== c.mese && k !== c.mp) continue;
      const cat = r.categoria || DA_CLASSIFICARE; const o = map.get(cat) || { categoria: cat, mese: 0, prima: 0 };
      if (k === c.mese) o.mese += N(r.importo); else o.prima += N(r.importo); map.set(cat, o);
    }
    const rows = [...map.values()].map(o => ({ categoria: o.categoria, mese: r2(o.mese), prima: r2(o.prima), diff: r2(o.mese - o.prima) })).filter(o => o.mese || o.prima).sort((a, b) => b.mese - a.mese || b.prima - a.prima);
    const tot = { categoria: 'Totale', mese: r2(rows.reduce((t, r) => t + r.mese, 0)), prima: r2(rows.reduce((t, r) => t + r.prima, 0)) }; tot.diff = r2(tot.mese - tot.prima);
    return { rows, tot };
  };
  const A = perCat('Acquisto'), V = perCat('Vendita');
  const fm = F.filter(f => nel(f.data, c.mese));
  const fA = fm.filter(f => f.tipo === 'Acquisto'), fV = fm.filter(f => f.tipo === 'Vendita');
  const ivaA = r2(fA.reduce((t, f) => t + N(f.iva), 0)), ivaV = r2(fV.reduce((t, f) => t + N(f.iva), 0));
  const colsCat = h => [{ k: 'categoria', h }, { k: 'mese', h: nomeMese(c.mese), fmt: 'eur2' }, { k: 'prima', h: nomeMese(c.mp), fmt: 'eur2' }, { k: 'diff', h: 'Differenza', fmt: 'eur2' }];
  // pagamenti fatti nel mese: fatture abbinate ai movimenti della banca e pagamenti del personale
  const pag = [];
  for (const f of F) for (const p of f.pagamentiBanca || []) if (nel(p.data, c.mese)) pag.push({ data: p.data, chi: f.controparte || '', cosa: (f.tipo === 'Vendita' ? 'Incasso fattura ' : 'Fattura ') + (f.numero || ''), uscita: f.tipo === 'Vendita' ? null : r2(Math.abs(N(p.importo))), entrata: f.tipo === 'Vendita' ? r2(Math.abs(N(p.importo))) : null });
  const dipN = new Map(dipendenti().map(d => [d.key, d.nome]));
  for (const p of S.pagamenti) if (nel(p.data, c.mese)) {
    // una rata di prestito tolta dallo stipendio o trattenuta in busta non è un movimento di soldi: conta solo quella restituita
    if (p.tipo === 'rimborso' && p.come !== 'versato') continue;
    const v = r2(Math.abs(N(p.importo))); const ent = p.tipo === 'rimborso'; pag.push({ data: p.data, chi: dipN.get(p.dip) || p.beneficiario || '', cosa: TIPI_PAG[p.tipo] || p.tipo || 'Pagamento', uscita: ent ? null : v, entrata: ent ? v : null }); }
  pag.sort((a, b) => a.data.localeCompare(b.data) || a.chi.localeCompare(b.chi));
  const totPag = { data: '', chi: 'Totale', cosa: '', uscita: r2(pag.reduce((t, r) => t + N(r.uscita), 0)), entrata: r2(pag.reduce((t, r) => t + N(r.entrata), 0)) };
  // da pagare: fatture d'acquisto non ancora abbinate a un pagamento, scadute da meno di 6 mesi o in scadenza entro il mese dopo
  const banca = mesiBanca(); const da = inizio(mesePrima(mesePrima(mesePrima(mesePrima(mesePrima(mesePrima(c.mese))))))), fino = fine(meseDopo(c.mese));
  // come statoPagamento, ma con i pagamenti fatti fino alla fine del mese del report (un mese salvato dopo resta com'era)
  const statoAl = f => { const tot = Math.abs(N(f.totale)); const pg = r2((f.pagamentiBanca || []).filter(p => !okD(p.data) || p.data <= c.rif).reduce((t, p) => t + N(p.importo), 0)); const residuo = r2(tot - pg); return { residuo, stato: residuo <= 0.01 ? 'pagata' : pg > 0 ? 'in parte' : f.scadenza && f.scadenza < c.rif ? 'scaduta' : 'da pagare' }; };
  const aperte = banca.size ? F.filter(f => f.tipo === 'Acquisto' && N(f.totale) > 0 && okD(f.data) && f.data <= c.rif && !/MP01|contant/i.test(f.pagamento || '')).map(f => ({ f, st: statoAl(f), sc: okD(f.scadenza) && f.scadenza >= (f.data || '') ? f.scadenza : f.data }))
    .filter(x => x.st.stato !== 'pagata' && okD(x.sc) && x.sc >= da && x.sc <= fino)
    .map(x => ({ scadenza: x.sc, chi: x.f.controparte || '', numero: x.f.numero || '', totale: r2(Math.abs(N(x.f.totale))), residuo: r2(x.st.residuo), stato: x.st.stato })).sort((a, b) => a.scadenza.localeCompare(b.scadenza)) : [];
  const totAp = { scadenza: '', chi: 'Totale', numero: '', totale: r2(aperte.reduce((t, r) => t + r.totale, 0)), residuo: r2(aperte.reduce((t, r) => t + r.residuo, 0)), stato: '' };
  // latte venduto (fatture di vendita del mese)
  const rl = R.filter(r => r.tipo === 'Vendita' && nel(r.data, c.mese) && (r.categoria === CAT_LATTE || r.categoria === CAT_PREMI));
  const litri = Math.round(rl.filter(r => r.categoria === CAT_LATTE).reduce((t, r) => t + litriRiga(r), 0)), euroL = r2(rl.reduce((t, r) => t + N(r.importo), 0));
  const K = [
    kpi('Acquisti', A.tot.mese, 'eur', { u: fA.length + (fA.length === 1 ? ' fattura' : ' fatture'), d: confronto(A.tot.mese, A.tot.prima), dl: nomeMese(c.mp), peggio: 'su' }),
    kpi('Vendite', V.tot.mese, 'eur', { u: fV.length + (fV.length === 1 ? ' fattura' : ' fatture'), d: confronto(V.tot.mese, V.tot.prima), dl: nomeMese(c.mp), peggio: 'giu' }),
    kpi('Pagamenti fatti', totPag.uscita, 'eur', { s: totPag.entrata ? 'incassati ' + Math.round(totPag.entrata).toLocaleString('it-IT') + ' €' : '' }),
    kpi('Da pagare', banca.size ? totAp.residuo : null, 'eur', { s: banca.size ? aperte.length + (aperte.length === 1 ? ' fattura' : ' fatture') : 'manca l\'estratto conto' }),
  ];
  if (ivaA || ivaV) K.push(kpi('IVA delle fatture', r2(ivaV - ivaA), 'eur', { s: 'vendite ' + Math.round(ivaV).toLocaleString('it-IT') + ' € − acquisti ' + Math.round(ivaA).toLocaleString('it-IT') + ' €' }));
  if (litri || euroL) K.push(kpi('Latte fatturato', litri, 'n', { u: 'litri', s: litri ? Math.round(euroL).toLocaleString('it-IT') + ' € · ' + (euroL / litri).toLocaleString('it-IT', { maximumFractionDigits: 3 }) + ' €/l' : Math.round(euroL).toLocaleString('it-IT') + ' €' }));
  const T = [
    tab('acq', 'Acquisti per categoria', colsCat('Categoria'), A.rows, { tot: A.tot, sheet: 'Acquisti', note: 'Imponibile delle righe delle fatture, confrontato con lo stesso mese dell\'anno prima.' }),
    tab('ven', 'Vendite per categoria', colsCat('Categoria'), V.rows, { tot: V.tot, sheet: 'Vendite' }),
    tab('pag', 'Pagamenti fatti nel mese', [{ k: 'data', h: 'Data', fmt: 'date' }, { k: 'chi', h: 'A chi / da chi' }, { k: 'cosa', h: 'Cosa' }, { k: 'uscita', h: 'Uscite', fmt: 'eur2' }, { k: 'entrata', h: 'Entrate', fmt: 'eur2' }], pag, { tot: totPag, sheet: 'Pagamenti', note: 'Fatture abbinate ai movimenti della banca e pagamenti del personale.' }),
  ];
  if (banca.size) T.push(tab('dapag', 'Fatture da pagare', [{ k: 'scadenza', h: 'Scadenza', fmt: 'date' }, { k: 'chi', h: 'Fornitore' }, { k: 'numero', h: 'Numero' }, { k: 'totale', h: 'Totale', fmt: 'eur2' }, { k: 'residuo', h: 'Da pagare', fmt: 'eur2' }, { k: 'stato', h: 'Stato' }], aperte, { tot: totAp, sheet: 'Da pagare', note: 'Fatture d\'acquisto senza un pagamento abbinato, scadute da meno di 6 mesi o in scadenza entro la fine del mese dopo.' }));
  const note = [];
  if (!banca.size) note.push('Non ci sono estratti conto caricati: non so quali fatture sono già pagate.');
  if (ivaA || ivaV) note.push("L'IVA è quella scritta sulle fatture del mese: la liquidazione vera la fa il commercialista.");
  return { id: 'conti', titolo: 'Conti', icona: 'wallet', area: 'conti', riservata: true, kpi: K, tabelle: T, note };
}

function sezPersonale(c) {
  if (!c.conti) return null;
  const dip = new Map(dipendenti().map(d => [d.key, d]));
  // il mese, più la tredicesima a dicembre e la quattordicesima a giugno
  const per = [c.mese]; if (c.k === 12) per.push(c.y + '-13'); if (c.k === 6) per.push(c.y + '-14');
  const cs = cedolini().filter(x => per.includes(x.periodo));
  if (!cs.length && !dip.size) return null;
  const bil = bilanciniPaghe().filter(b => per.includes(b.periodo));
  const b = { lordo: r2(bil.reduce((t, x) => t + N(x.lordo), 0)), contrib: r2(bil.reduce((t, x) => t + N(x.contribDitta), 0)), tfr: r2(bil.reduce((t, x) => t + N(x.tfrFpc), 0)), costo: r2(bil.reduce((t, x) => t + N(x.costo), 0)) };
  const sL = cs.reduce((t, x) => t + N(x.lordo), 0);
  const ver = new Map(verifica().map(v => [v.dip + '|' + v.periodo, v]));
  const rows = cs.map(x => {
    const d = dip.get(x.dip) || {}; const v = ver.get(x.dip + '|' + x.periodo) || {};
    // costo per dipendente: lordo + TFR del cedolino + contributi della ditta del bilancino divisi in base al lordo (stima)
    const quota = bil.length && sL > 0 ? b.contrib * N(x.lordo) / sL : null;
    return { nome: (d.nome || x.nome || '') + (x.periodo !== c.mese ? (x.periodo.endsWith('-13') ? ' (tredicesima)' : ' (quattordicesima)') : ''), ore: N(x.ore) || null, lordo: r2(x.lordo), netto: r2(x.netto), tfr: N(x.tfrFondo) ? r2(x.tfrFondo) : null, costo: quota === null ? null : r2(N(x.lordo) + N(x.tfrFondo) + quota), pagato: v.pagato != null ? r2(v.pagato) : null, stato: v.stato || '' };
  }).sort((a, b) => a.nome.localeCompare(b.nome, 'it'));
  const s = k => r2(rows.reduce((t, r) => t + N(r[k]), 0));
  const tot = { nome: 'Totale', ore: s('ore') || null, lordo: s('lordo'), netto: s('netto'), tfr: s('tfr') || null, costo: rows.some(r => r.costo !== null) ? s('costo') : null, pagato: s('pagato'), stato: '' };
  // versamenti di competenza del mese: F24 del mese, contributi e fondo del trimestre
  const q = `${c.y}-T${Math.ceil(c.k / 3)}`;
  const fineTrim = c.k % 3 === 0;   // contributi e fondo del trimestre: solo nel report dell'ultimo mese, con tutti i bilancini
  const vs = versamenti().filter(o => (o.tipo === 'f24' ? per.includes(o.periodo) : fineTrim && o.periodo === q)).map(o => ({ cosa: o.tipoNome + ' · ' + o.nome, scadenza: o.scadenza, dovuto: r2(o.dovuto), pagato: r2(o.pagato), stato: o.stato }));
  const K = [kpi('Dipendenti pagati', new Set(cs.map(x => x.dip)).size, 'n', { u: 'con il cedolino' }), kpi('Stipendi lordi', tot.lordo, 'eur', { s: 'netti ' + Math.round(tot.netto).toLocaleString('it-IT') + ' €' })];
  if (bil.length) K.push(kpi('Costo dell\'azienda', b.costo || r2(b.lordo + b.contrib + b.tfr), 'eur', { s: 'dal bilancino paghe: contributi ' + Math.round(b.contrib).toLocaleString('it-IT') + ' €' }));
  if (vs.length) K.push(kpi('Versamenti', r2(vs.reduce((t, v) => t + v.dovuto, 0)), 'eur', { s: vs.filter(v => v.stato === 'pagato' || v.stato === 'pagato in più').length + ' di ' + vs.length + ' pagati' }));
  const T = [tab('ced', 'Costo del mese per dipendente', [{ k: 'nome', h: 'Dipendente' }, { k: 'ore', h: 'Ore', fmt: 'n' }, { k: 'lordo', h: 'Lordo', fmt: 'eur2' }, { k: 'netto', h: 'Netto', fmt: 'eur2' }, { k: 'tfr', h: 'TFR al fondo', fmt: 'eur2' }, { k: 'costo', h: 'Costo (stima)', fmt: 'eur2' }, { k: 'pagato', h: 'Pagato', fmt: 'eur2' }, { k: 'stato', h: 'Stato' }], rows, { tot, sheet: 'Personale', note: 'Costo = lordo + TFR del cedolino + contributi della ditta del bilancino paghe divisi in base al lordo: è una stima.' })];
  if (vs.length) T.push(tab('vers', 'Versamenti (F24, contributi, fondo)', [{ k: 'cosa', h: 'Cosa' }, { k: 'scadenza', h: 'Scadenza', fmt: 'date' }, { k: 'dovuto', h: 'Dovuto', fmt: 'eur2' }, { k: 'pagato', h: 'Pagato', fmt: 'eur2' }, { k: 'stato', h: 'Stato' }], vs, { sheet: 'Versamenti' }));
  const note = []; if (!cs.length) note.push('Non ci sono cedolini per questo mese.'); if (!fineTrim) note.push("Contributi INPS e fondo pensione si contano nel report dell'ultimo mese del trimestre."); if (cs.length && !bil.length) note.push('Manca il bilancino paghe del mese: il costo dell\'azienda non si può calcolare.');
  return { id: 'personale', titolo: 'Personale', icona: 'users', area: 'personale', riservata: true, kpi: K, tabelle: T, note };
}

/** Stato dei capi a una data: presenti, vacche, in lattazione. */
function mandriaAl(rif) {
  let presenti = 0, vacche = 0, latt = 0;
  for (const c of S.capi) {
    const ev = (D.evBy && D.evBy[c.id]) || [];
    const usc = ev.find(e => e.tipo === 'Uscita'); const da = c.ingresso || c.nascita || null;
    if ((da && da > rif) || (usc && okD(usc.data) && usc.data <= rif)) continue;
    presenti++;
    if (c.sesso === 'M') continue;
    const parti = ev.filter(e => e.tipo === 'Parto' && okD(e.data) && e.data <= rif).map(e => e.data).sort();
    if (!parti.length && !(N(c.lattazioniPrecedenti) > 0)) continue;
    vacche++;
    const ult = parti[parti.length - 1];
    if (ult) { if (!ev.some(e => e.tipo === 'Messa in asciutta' && okD(e.data) && e.data > ult && e.data <= rif)) latt++; }
    else { const i = capoI(c); if (i && i.stato === 'In lattazione') latt++; }
  }
  return { presenti, vacche, latt, asciutte: vacche - latt };
}
const nomeCapo = c => (c ? [c.matricola, c.nome].filter(Boolean).join(' · ') : '');

function sezStalla(c) {
  const capi = new Map(S.capi.map(x => [x.id, x]));
  const ev = S.eventi.filter(e => nel(e.data, c.mese));
  const L = S.latte.filter(l => nel(l.data, c.mese));
  const mov = S.movimenti.filter(m => m.razioneId && m.tipo === 'Scarico' && nel(m.data, c.mese));
  if (!S.capi.length && !L.length && !ev.length && !mov.length) return null;
  const M = mandriaAl(c.rif), M0 = mandriaAl(addDays(c.ini, -1));
  const conta = t => ev.filter(e => e.tipo === t).length;
  const entrati = S.capi.filter(x => nel(x.ingresso || x.nascita, c.mese)).length;
  const K = [kpi('Capi presenti', M.presenti, 'n', { s: 'a fine mese · erano ' + M0.presenti, d: null }), kpi('Vacche in lattazione', M.latt, 'n', { s: M.asciutte + ' in asciutta' }), kpi('Parti', conta('Parto'), 'n', { s: conta('Messa in asciutta') + ' messe in asciutta' }), kpi('Eventi sanitari', conta('Trattamento sanitario') + conta('Vaccinazione'), 'n', { s: conta('Trattamento sanitario') + ' trattamenti · ' + conta('Vaccinazione') + ' vaccinazioni' })];
  // latte del mese
  const giorni = new Set(L.filter(l => N(l.litri) > 0).map(l => l.data));
  const litri = L.reduce((t, l) => t + N(l.litri), 0), conf = L.reduce((t, l) => t + (l.conferiti !== undefined && l.conferiti !== '' && l.conferiti !== null ? N(l.conferiti) : N(l.litri)), 0);
  const Lp = S.latte.filter(l => nel(l.data, c.mp)); const litriP = Lp.reduce((t, l) => t + N(l.litri), 0);
  const media = k => { const v = L.filter(l => l[k] !== undefined && l[k] !== null && l[k] !== '' && N(l[k]) > 0); return v.length ? v.reduce((t, l) => t + N(l[k]), 0) / v.length : null; };
  const pz = L.filter(l => N(l.prezzo) > 0); const prezzo = pz.length ? pz.reduce((t, l) => t + N(l.prezzo) * (N(l.conferiti) || N(l.litri)), 0) / (pz.reduce((t, l) => t + (N(l.conferiti) || N(l.litri)), 0) || 1) : null;
  if (L.length) {
    K.push(kpi('Latte prodotto', Math.round(litri), 'n', { u: 'litri', d: confronto(litri, litriP), dl: nomeMese(c.mp), peggio: 'giu', s: giorni.size ? Math.round(litri / giorni.size).toLocaleString('it-IT') + ' litri al giorno · ' + giorni.size + ' giorni' : '' }));
    const q = [['grasso', 'grasso', '%'], ['proteine', 'proteine', '%'], ['cellule', 'cellule', ''], ['cbt', 'carica batterica', '']].map(([k, l, u]) => { const v = media(k); return v === null ? '' : l + ' ' + v.toLocaleString('it-IT', { maximumFractionDigits: u ? 2 : 0 }) + u; }).filter(Boolean);
    if (q.length || prezzo) K.push(kpi('Qualità del latte', prezzo ? Math.round(prezzo * 1000) / 1000 : null, 'eur3', { u: prezzo ? '€/l' : '', s: q.join(' · ') || 'senza analisi', testo: prezzo ? '' : q.length ? 'media del mese' : '' }));
  }
  const T = [];
  const evRows = ev.filter(e => e.tipo !== 'Nota').sort((a, b) => a.data.localeCompare(b.data));
  T.push(tab('ev', 'Eventi del mese per tipo', [{ k: 'tipo', h: 'Evento' }, { k: 'n', h: 'Quanti', fmt: 'n' }], TIPI_EV.filter(t => t !== 'Nota').map(t => ({ tipo: t, n: conta(t) })).filter(r => r.n), { tot: { tipo: 'Totale', n: evRows.length }, sheet: 'Eventi' }));
  const san = evRows.filter(e => e.tipo === 'Trattamento sanitario' || e.tipo === 'Vaccinazione').map(e => { const p = e.prodottoId && S.prodotti.find(x => x.id === e.prodottoId); return { data: e.data, capo: nomeCapo(capi.get(e.capoId)), tipo: e.tipo, cosa: [p && p.nome, e.farmaco, e.diagnosi, e.note].filter(Boolean).join(' · ').slice(0, 160), vet: e.veterinario || '' }; });
  if (san.length) T.push(tab('san', 'Eventi sanitari', [{ k: 'data', h: 'Data', fmt: 'date' }, { k: 'capo', h: 'Capo' }, { k: 'tipo', h: 'Evento' }, { k: 'cosa', h: 'Prodotto e note' }, { k: 'vet', h: 'Veterinario' }], san, { sheet: 'Sanitario' }));
  const parti = evRows.filter(e => e.tipo === 'Parto').map(e => ({ data: e.data, capo: nomeCapo(capi.get(e.capoId)), andamento: e.facilita || '', vitelli: [[e.vitelloSesso, e.vitelloEsito], [e.vitello2Sesso, e.vitello2Esito]].filter(v => v[0]).map(v => (v[0] === 'F' ? 'femmina' : 'maschio') + (v[1] ? ' ' + v[1].toLowerCase() : '')).join(', ') }));
  if (parti.length) T.push(tab('parti', 'Parti', [{ k: 'data', h: 'Data', fmt: 'date' }, { k: 'capo', h: 'Vacca' }, { k: 'andamento', h: 'Andamento' }, { k: 'vitelli', h: 'Vitelli' }], parti, { sheet: 'Parti' }));
  if (L.length) {
    const qual = ['grasso', 'proteine', 'cellule', 'cbt', 'prezzo'].filter(k => L.some(l => N(l[k]) > 0));
    const H = { grasso: ['Grasso %', 'n2'], proteine: ['Proteine %', 'n2'], cellule: ['Cellule', 'n'], cbt: ['Carica batt.', 'n'], prezzo: ['€/l', 'eur3'] };
    const rows = [...L].sort((a, b) => a.data.localeCompare(b.data)).map(l => Object.assign({ data: l.data, vacche: N(l.vacche) || null, litri: r1(l.litri), conferiti: l.conferiti !== undefined && l.conferiti !== '' && l.conferiti !== null ? r1(l.conferiti) : null, scartati: N(l.scartati) || null }, Object.fromEntries(qual.map(k => [k, N(l[k]) || null]))));
    T.push(tab('latte', 'Latte giorno per giorno', [{ k: 'data', h: 'Data', fmt: 'date' }, { k: 'vacche', h: 'Vacche munte', fmt: 'n' }, { k: 'litri', h: 'Litri prodotti', fmt: 'n1' }, { k: 'conferiti', h: 'Conferiti', fmt: 'n1' }, { k: 'scartati', h: 'Scartati', fmt: 'n1' }, ...qual.map(k => ({ k, h: H[k][0], fmt: H[k][1] }))], rows, { tot: { data: 'Totale', litri: r1(litri), conferiti: r1(conf), scartati: r1(L.reduce((t, l) => t + N(l.scartati), 0)) || null }, sheet: 'Latte' }));
  }
  if (mov.length) {
    const per = new Map();
    for (const m of mov) { const o = per.get(m.prodottoId) || { prodotto: (S.prodotti.find(p => p.id === m.prodottoId) || {}).nome || '(prodotto tolto)', unita: (S.prodotti.find(p => p.id === m.prodottoId) || {}).unita || '', q: 0, giorni: new Set() }; o.q += N(m.quantita); o.giorni.add(m.data); per.set(m.prodottoId, o); }
    T.push(tab('raz', 'Razioni scaricate dal magazzino', [{ k: 'prodotto', h: 'Alimento' }, { k: 'q', h: 'Quantità', fmt: 'n2' }, { k: 'unita', h: 'Unità' }, { k: 'giorni', h: 'Giorni', fmt: 'n' }], [...per.values()].map(o => ({ prodotto: o.prodotto, q: r2(o.q), unita: o.unita, giorni: o.giorni.size })).sort((a, b) => b.q - a.q), { sheet: 'Razioni' }));
  }
  const note = []; if (entrati) note.push(entrati + (entrati === 1 ? ' capo entrato' : ' capi entrati') + ' nel mese (nascite e acquisti), ' + conta('Uscita') + ' usciti.');
  return { id: 'stalla', titolo: 'Stalla', icona: 'cow', area: 'stalla', kpi: K, tabelle: T, note };
}

function sezMagazzino(c) {
  const P = S.prodotti.filter(p => p.categoria !== 'Effluente');
  if (!P.length) return null;
  const rows = [];
  for (const p of P) {
    let g = N(p.giacenzaIniziale), car = 0, sca = 0, raz = 0, nm = 0;
    for (const m of S.movimenti) {
      if (m.prodottoId !== p.id) continue; const q = N(m.quantita), s = m.tipo === 'Scarico';
      if (!okD(m.data) || m.data <= c.rif) g += s ? -q : q;
      if (nel(m.data, c.mese)) { nm++; if (s) { sca += q; if (m.razioneId) raz += q; } else car += q; }
    }
    const avv = [];
    if (g < 0) avv.push('giacenza negativa'); else if (N(p.scortaMin) > 0 && g < N(p.scortaMin)) avv.push('sotto scorta');
    if (okD(p.scadenza) && g > 0) { if (p.scadenza < c.rif) avv.push('scaduto'); else if (p.scadenza <= addDays(c.rif, 60)) avv.push('scade il ' + p.scadenza.split('-').reverse().join('/')); }
    if (okD(p.scadenzaAut) && g > 0 && p.scadenzaAut <= addDays(c.rif, 90)) avv.push(p.scadenzaAut < c.rif ? 'non più autorizzato' : 'autorizzato fino al ' + p.scadenzaAut.split('-').reverse().join('/'));
    if (!nm && Math.abs(g) < 1e-9 && !avv.length) continue;
    const r = { prodotto: p.nome || '', categoria: p.categoria || '', unita: p.unita || '', carichi: r2(car) || null, scarichi: r2(sca) || null, razioni: r2(raz) || null, giacenza: r2(g), scorta: N(p.scortaMin) || null, avviso: avv.join(', ') };
    if (c.conti) r.valore = N(p.prezzo) > 0 && g > 0 ? r2(g * N(p.prezzo)) : null;
    rows.push(r);
  }
  rows.sort((a, b) => a.categoria.localeCompare(b.categoria, 'it') || a.prodotto.localeCompare(b.prodotto, 'it'));
  const movM = S.movimenti.filter(m => nel(m.data, c.mese));
  const occhio = rows.filter(r => r.avviso);
  const K = [kpi('Carichi', movM.filter(m => m.tipo !== 'Scarico').length, 'n', { u: 'movimenti' }), kpi('Scarichi', movM.filter(m => m.tipo === 'Scarico').length, 'n', { u: 'movimenti', s: movM.filter(m => m.tipo === 'Scarico' && m.razioneId).length + ' dalle razioni' }), kpi('Da tenere d\'occhio', occhio.length, 'n', { s: occhio.filter(r => /scorta|negativa/.test(r.avviso)).length + ' sotto scorta · ' + occhio.filter(r => /scad|autorizz/.test(r.avviso)).length + ' in scadenza' })];
  if (c.conti) K.push(kpi('Valore in magazzino', r2(rows.reduce((t, r) => t + N(r.valore), 0)), 'eur', { s: 'giacenza × prezzo, a fine mese' }));
  const cols = [{ k: 'prodotto', h: 'Prodotto' }, { k: 'categoria', h: 'Categoria' }, { k: 'unita', h: 'Unità' }, { k: 'carichi', h: 'Caricati', fmt: 'n2' }, { k: 'scarichi', h: 'Scaricati', fmt: 'n2' }, { k: 'razioni', h: 'Di cui razioni', fmt: 'n2' }, { k: 'giacenza', h: 'Giacenza a fine mese', fmt: 'n2' }, { k: 'scorta', h: 'Scorta minima', fmt: 'n2' }, ...(c.conti ? [{ k: 'valore', h: 'Valore', fmt: 'eur2' }] : []), { k: 'avviso', h: 'Da sapere' }];
  const T = [tab('mag', 'Giacenze e movimenti', cols, rows, Object.assign({ sheet: 'Magazzino' }, c.conti ? { tot: { prodotto: 'Totale', valore: r2(rows.reduce((t, r) => t + N(r.valore), 0)) } } : {}))];
  if (occhio.length) T.push(tab('occhio', 'Sotto scorta o in scadenza', [{ k: 'prodotto', h: 'Prodotto' }, { k: 'giacenza', h: 'Giacenza', fmt: 'n2' }, { k: 'unita', h: 'Unità' }, { k: 'avviso', h: 'Cosa' }], occhio, { sheet: 'Da tenere d occhio' }));
  return { id: 'magazzino', titolo: 'Magazzino', icona: 'warehouse', area: 'magazzino', kpi: K, tabelle: T, note: [] };
}

function sezCampagna(c) {
  const ops = S.operazioni.filter(o => o.stato !== 'Pianificata' && nel(o.data, c.mese));
  const pes = S.carichi.filter(k => nel(k.data, c.mese));
  const man = S.manutenzioni.filter(m => nel(m.data, c.mese));
  if (!ops.length && !pes.length && !man.length && !S.campi.length) return null;
  const campi = new Map(S.campi.map(x => [x.id, x])), mezzi = new Map(S.mezzi.map(x => [x.id, x]));
  const coltura = o => { const cp = campi.get(o.campoId); const e = cp ? colturaAlla(cp, o.data) : null; return (e && e.coltura) || (cp ? cropOf(cp, yearOf(o.data)) : '') || ''; };
  // lavori per campo e coltura
  const perC = new Map();
  for (const o of ops) {
    const k = (o.campoId || '') + '|' + coltura(o); const cp = campi.get(o.campoId);
    const r = perC.get(k) || { campo: cp ? cp.nome || '' : '(senza campo)', coltura: coltura(o), ha: cp ? r2(campoHa(cp)) : null, tipi: new Map(), n: 0, ore: 0 };
    r.tipi.set(o.tipo || 'Altro', (r.tipi.get(o.tipo || 'Altro') || 0) + 1); r.n++; r.ore += N(o.ore); perC.set(k, r);
  }
  const rC = [...perC.values()].map(r => ({ campo: r.campo, coltura: r.coltura, ha: r.ha, lavori: [...r.tipi].map(([t, n]) => t + (n > 1 ? ' ×' + n : '')).join(', '), n: r.n, ore: r1(r.ore) || null })).sort((a, b) => a.campo.localeCompare(b.campo, 'it', { numeric: true }));
  const perT = new Map(); for (const o of ops) { const t = o.tipo || 'Altro'; const r = perT.get(t) || { tipo: t, n: 0, ha: 0, ore: 0 }; r.n++; r.ha += N(o.haTrattati) > 0 ? N(o.haTrattati) : campoHa(campi.get(o.campoId) || {}); r.ore += N(o.ore); perT.set(t, r); }
  const rT = [...perT.values()].map(r => ({ tipo: r.tipo, n: r.n, ha: r2(r.ha), ore: r1(r.ore) || null })).sort((a, b) => b.n - a.n);
  // trattamenti (le righe del registro dei trattamenti, quaderno di campagna)
  const tr = righeTrattamenti(c.y).filter(r => nel(r.o.data, c.mese)).map(r => ({ data: r.o.data, campo: r.c.nome || '', coltura: r.coltura, prodotto: r.p.nome || r.o.prodotto || '', dose: N(r.o.dose) || null, quantita: N(r.o.quantita) || null, unita: r.p.unita || '', ha: r2(r.ha), avversita: r.o.avversita || '', raccoltaDal: r.raccoltaDal || '' })).sort((a, b) => a.data.localeCompare(b.data));
  // raccolte e sfalci, pesate
  const rac = ops.filter(o => o.tipo === 'Raccolta' || o.tipo === 'Sfalcio').map(o => ({ data: o.data, campo: (campi.get(o.campoId) || {}).nome || '', coltura: coltura(o), tipo: o.tipo + (chiudeColtura(o) ? '' : o.tipo === 'Raccolta' ? ' (la coltura continua)' : ''), cosa: o.prodottoRaccolto || '', t: N(o.raccolto) || null })).sort((a, b) => a.data.localeCompare(b.data));
  const perP = new Map(); for (const k of pes) { const key = (k.campoId || '') + '|' + (k.prodottoRaccolto || ''); const r = perP.get(key) || { campo: (campi.get(k.campoId) || {}).nome || '', cosa: k.prodottoRaccolto || '', n: 0, kg: 0 }; r.n++; r.kg += N(k.netto); perP.set(key, r); }
  const rP = [...perP.values()].map(r => ({ campo: r.campo, cosa: r.cosa, n: r.n, t: r2(r.kg / 1000) })).sort((a, b) => b.t - a.t);
  // ore dei mezzi
  const perM = new Map(); for (const o of ops) { if (!o.mezzoId) continue; const r = perM.get(o.mezzoId) || { mezzo: (mezzi.get(o.mezzoId) || {}).nome || '(mezzo tolto)', n: 0, ore: 0 }; r.n++; r.ore += N(o.ore); perM.set(o.mezzoId, r); }
  const rM = [...perM.values()].map(r => ({ mezzo: r.mezzo, n: r.n, ore: r1(r.ore) })).sort((a, b) => b.ore - a.ore);
  const rMan = man.map(m => ({ data: m.data, mezzo: (mezzi.get(m.mezzoId) || {}).nome || '', tipo: m.tipo || '', ore: N(m.ore) || null, note: String(m.descrizione || m.note || '').slice(0, 120) })).sort((a, b) => a.data.localeCompare(b.data));
  const tRac = r2(rac.reduce((t, r) => t + N(r.t), 0)), tPes = r2(rP.reduce((t, r) => t + r.t, 0));
  const K = [kpi('Lavori fatti', ops.length, 'n', { s: new Set(ops.map(o => o.campoId).filter(Boolean)).size + ' campi lavorati' }), kpi('Trattamenti', tr.length, 'n', { s: r2(tr.reduce((t, r) => t + r.ha, 0)).toLocaleString('it-IT') + ' ha trattati' }), kpi('Raccolto', tRac || tPes || null, 'n1', { u: 't', s: rac.length + (rac.length === 1 ? ' raccolta o sfalcio' : ' raccolte e sfalci') + (pes.length ? ' · ' + pes.length + ' pesate (' + tPes.toLocaleString('it-IT') + ' t)' : '') }), kpi('Ore dei mezzi', r1(rM.reduce((t, r) => t + r.ore, 0)), 'n1', { u: 'ore', s: rM.length + (rM.length === 1 ? ' mezzo' : ' mezzi') + (man.length ? ' · ' + man.length + ' manutenzioni' : '') })];
  const T = [
    tab('campi', 'Lavori per campo e coltura', [{ k: 'campo', h: 'Campo' }, { k: 'coltura', h: 'Coltura' }, { k: 'ha', h: 'Ettari', fmt: 'n2' }, { k: 'lavori', h: 'Lavori' }, { k: 'ore', h: 'Ore', fmt: 'n1' }], rC, { sheet: 'Lavori per campo' }),
    tab('tipi', 'Lavori per tipo', [{ k: 'tipo', h: 'Lavoro' }, { k: 'n', h: 'Quanti', fmt: 'n' }, { k: 'ha', h: 'Ettari', fmt: 'n2' }, { k: 'ore', h: 'Ore', fmt: 'n1' }], rT, { tot: { tipo: 'Totale', n: ops.length, ha: r2(rT.reduce((t, r) => t + r.ha, 0)), ore: r1(rT.reduce((t, r) => t + N(r.ore), 0)) || null }, sheet: 'Lavori per tipo' }),
  ];
  if (tr.length) T.push(tab('tratt', 'Trattamenti (quaderno di campagna)', [{ k: 'data', h: 'Data', fmt: 'date' }, { k: 'campo', h: 'Campo' }, { k: 'coltura', h: 'Coltura' }, { k: 'prodotto', h: 'Prodotto' }, { k: 'dose', h: 'Dose /ha', fmt: 'n2' }, { k: 'quantita', h: 'Quantità', fmt: 'n2' }, { k: 'unita', h: 'Unità' }, { k: 'ha', h: 'Ettari', fmt: 'n2' }, { k: 'avversita', h: 'Avversità' }, { k: 'raccoltaDal', h: 'Raccolta dal', fmt: 'date' }], tr, { sheet: 'Trattamenti' }));
  if (rac.length) T.push(tab('racc', 'Raccolte e sfalci', [{ k: 'data', h: 'Data', fmt: 'date' }, { k: 'campo', h: 'Campo' }, { k: 'coltura', h: 'Coltura' }, { k: 'tipo', h: 'Lavoro' }, { k: 'cosa', h: 'Cosa' }, { k: 't', h: 'Tonnellate', fmt: 'n2' }], rac, { tot: { data: 'Totale', t: tRac || null }, sheet: 'Raccolte' }));
  if (rP.length) T.push(tab('pes', 'Pesate del raccolto', [{ k: 'campo', h: 'Campo' }, { k: 'cosa', h: 'Cosa' }, { k: 'n', h: 'Pesate', fmt: 'n' }, { k: 't', h: 'Tonnellate nette', fmt: 'n2' }], rP, { tot: { campo: 'Totale', n: pes.length, t: tPes }, sheet: 'Pesate' }));
  if (rM.length) T.push(tab('mezzi', 'Ore dei mezzi', [{ k: 'mezzo', h: 'Mezzo' }, { k: 'n', h: 'Lavori', fmt: 'n' }, { k: 'ore', h: 'Ore', fmt: 'n1' }], rM, { sheet: 'Mezzi' }));
  if (rMan.length) T.push(tab('man', 'Manutenzioni dei mezzi', [{ k: 'data', h: 'Data', fmt: 'date' }, { k: 'mezzo', h: 'Mezzo' }, { k: 'tipo', h: 'Tipo' }, { k: 'ore', h: 'Ore del contatore', fmt: 'n' }, { k: 'note', h: 'Note' }], rMan, { sheet: 'Manutenzioni' }));
  return { id: 'campagna', titolo: 'Campagna', icona: 'sprout', area: 'campagna', kpi: K, tabelle: T, note: [] };
}

/* ---------------- controllo di completezza ---------------- */
const elenco = (a, max = 4) => a.slice(0, max).join(', ') + (a.length > max ? ' e altri ' + (a.length - max) : '');
function controlli(c) {
  const out = [];
  if (c.conti) {
    // cedolini: chi aveva il cedolino nel mese prima (o dopo) e non ha smesso di lavorare deve averlo anche in questo
    const ds = dipendenti();
    if (ds.length) {
      const cs = new Set(cedolini().filter(x => x.periodo === c.mese).map(x => x.dip));
      // primo e ultimo mese dai cedolini normali (la 13ª e la 14ª, "AAAA-13"/"AAAA-14", verrebbero dopo dicembre)
      const attesi = ds.filter(d => {
        const norm = (d.ced || []).filter(x => +String(x.periodo).slice(5) <= 12).map(x => x.periodo).sort(); if (!norm.length) return false;
        const ult = norm[norm.length - 1]; const cess = (d.ced || []).map(x => x.cessazione).filter(okD).sort().pop();
        const finito = cess && cess.slice(0, 7) >= ult && cess < c.ini;   // una cessazione vecchia, prima dell'ultimo cedolino, non conta (riassunto)
        return norm[0] <= c.mese && ult >= mesePrima(c.mese) && !finito;
      });
      const manca = attesi.filter(d => !cs.has(d.key));
      out.push({ id: 'cedolini', ok: !manca.length, testo: manca.length ? (cs.size ? 'Mancano ' + manca.length + (manca.length === 1 ? ' cedolino' : ' cedolini') : 'Mancano i cedolini ' + diMese(c.mese)) : 'Cedolini: ci sono tutti (' + cs.size + ')', dett: manca.length ? elenco(manca.map(d => d.nome)) : '', corto: 'senza cedolini', go: { area: 'conti', tab: 'conti', sub: 'cedolini' } });
    }
    const dc = righe().filter(r => r.categoria === DA_CLASSIFICARE && nel(r.data, c.mese));
    if (S.fatture.length) out.push({ id: 'daclass', ok: !dc.length, testo: dc.length ? dc.length + (dc.length === 1 ? ' riga di fattura' : ' righe di fatture') + ' "Da classificare"' : 'Fatture: tutte con la categoria', dett: dc.length ? 'in ' + new Set(dc.map(r => r.fid)).size + ' fatture' : '', corto: 'con fatture da classificare', go: { area: 'conti', tab: 'conti', sub: 'fatture', f: 'cf_stato', v: 'daclass', anno: c.y } });
    if (S.fatture.length || S.pagamenti.length) { const ok = mesiBanca().has(c.mese); out.push({ id: 'banca', ok, testo: ok ? 'Estratto conto del mese caricato' : 'Manca l\'estratto conto ' + diMese(c.mese), dett: ok ? '' : 'Senza i movimenti della banca non so cosa è pagato.', corto: 'senza estratto conto', go: { area: 'conti', tab: 'conti', sub: 'importa' } }); }
  }
  // latte: un giorno senza latte, con vacche in lattazione, è un giorno dimenticato
  const conLatte = S.latte.length > 0 || mandriaAl(c.rif).latt > 0;
  if (conLatte && c.ini <= c.oggi) {
    const giorni = new Set(S.latte.filter(l => nel(l.data, c.mese) && N(l.litri) > 0).map(l => l.data)); const senza = [];
    // se il latte si registra da pochi giorni, si conta dal primo giorno registrato
    const primo = S.latte.filter(l => okD(l.data) && N(l.litri) > 0).map(l => l.data).sort()[0];
    const da = primo && primo > c.ini ? primo : c.ini;
    for (let d = da; d <= c.rif; d = addDays(d, 1)) if (!giorni.has(d)) senza.push(+d.slice(8));
    out.push({ id: 'latte', ok: !senza.length, testo: senza.length ? (senza.length === 1 ? '1 giorno senza latte' : senza.length + ' giorni senza latte') : 'Latte: registrato tutti i giorni', dett: senza.length ? (senza.length > 12 ? 'dal ' + senza[0] + ' al ' + senza[senza.length - 1] : 'il ' + senza.join(', ')) : '', corto: senza.length === 1 ? 'con 1 giorno senza latte' : 'con ' + senza.length + ' giorni senza latte', go: { area: 'stalla', tab: 'stalla', sub: 'latte' } });
  }
  // dubbi aperti nel Centro automatico (quelli che vede chi guarda; non il dubbio del report stesso)
  // senza i Conti contano solo i dubbi delle automazioni che vedono anche i collaboratori (non quelle soloTitolare)
  let nd = 0; try { const ris = new Set(automazioni().filter(d => d.soloTitolare).map(d => d.id)); nd = dubbiCentro().filter(x => x.aut !== AUT && x.aut !== AUT_SQUADRA && (c.conti || !ris.has(x.aut))).length; } catch (e) { }
  out.push({ id: 'dubbi', ok: !nd, testo: nd ? nd + (nd === 1 ? ' dato da controllare nel Centro automatico' : ' dati da controllare nel Centro automatico') : 'Centro automatico: niente da controllare', dett: '', corto: 'con dati da controllare', go: { tab: 'automatico' } });
  for (const x of EXTRA) if (x.controlli) { try { out.push(...(x.controlli(c) || [])); } catch (e) { console.warn('controlli del report ' + x.id, e); } }
  return out;
}

/* ---------------- report ---------------- */
const BASE = [['conti', sezConti], ['personale', sezPersonale], ['stalla', sezStalla], ['magazzino', sezMagazzino], ['campagna', sezCampagna]];
export function contesto(mese, conti) {
  const [y, k] = mese.split('-').map(Number); const oggi = today(); const fin = fine(mese);
  return { mese, y, k, ini: inizio(mese), fin, rif: fin < oggi ? fin : oggi, mp: `${y - 1}-${String(k).padStart(2, '0')}`, conti: !!conti, oggi };
}
/** Prepara il report di un mese ("AAAA-MM"). conti = con Conti, Personale e valori (solo per il titolare). */
export function prepara(mese, { conti = contiVisibili() } = {}) {
  if (!okM(mese)) throw new Error('Mese non valido');
  const c = contesto(mese, conti && contiVisibili());
  const sez = [];
  const metti = (id, fn) => { try { const s = fn(c); if (s) sez.push(s); } catch (e) { console.warn('sezione ' + id + ' del report', e); sez.push({ id, titolo: id, icona: 'triangle-alert', kpi: [], tabelle: [], note: ['Questa parte non si è potuta preparare: ' + (e.message || e)] }); } };
  for (const [id, fn] of BASE) { metti(id, fn); for (const x of EXTRA.filter(x => x.dopo === id)) metti(x.id, x.calcola); }
  for (const x of EXTRA.filter(x => !BASE.some(b => b[0] === x.dopo))) metti(x.id, x.calcola);
  const ctr = controlli(c);
  return { v: VER, mese, conti: c.conti, quando: new Date().toISOString(), finoAl: c.rif, controlli: ctr, sezioni: sez };
}
/** C'è almeno un dato registrato nel mese? (senza dati il Centro non salva un report vuoto) */
export function haDati(m) {
  const d = x => nel(x.data, m);
  if (['operazioni', 'eventi', 'latte', 'movimenti', 'carichi', 'manutenzioni', 'fatture', 'pagamenti'].some(c => S[c].some(d))) return true;
  return S.paghe.some(x => x.tipo === 'cedolino' && x.anno && `${x.anno}-${String(x.mese).padStart(2, '0')}` === m);
}
/** Le parti mancanti di un report, in breve (per il dubbio del Centro): ["senza cedolini", "con 3 giorni senza latte"]. */
export const mancanze = rep => (rep.controlli || []).filter(x => !x.ok).map(x => x.corto || x.testo);

/* ---------------- istantanee ---------------- */
export const idPub = m => 'rp-' + m;
export const idRis = m => 'rpc-' + m;
/** Segno "report annullato dal Centro" (config o econfig, come il diario dell'automazione): il giro non lo risalva da solo. */
export const idAnn = m => 'rpx-' + m;
export const annullato = (m, col) => S[col].some(x => x.id === idAnn(m));
const isRp = (x, ris) => x && x.tipo === 'report' && okM(x.mese) && String(x.id) === (ris ? idRis(x.mese) : idPub(x.mese));
/** L'istantanea di un mese che può vedere chi guarda: completa (econfig) per il titolare se c'è, altrimenti quella senza Conti. */
export function istantanea(m, conConti = contiVisibili()) {
  const r = conConti && contiVisibili() ? S.econfig.find(x => x.id === idRis(m) && isRp(x, true)) : null;
  return r || S.config.find(x => x.id === idPub(m) && isRp(x, false)) || null;
}
/** Mesi con un'istantanea visibile, dal più recente. */
export function mesiSalvati() {
  const s = new Set(S.config.filter(x => isRp(x, false)).map(x => x.mese));
  if (contiVisibili()) S.econfig.filter(x => isRp(x, true)).forEach(x => s.add(x.mese));
  return [...s].sort().reverse();
}
export const ultima = () => { const m = mesiSalvati()[0]; return m ? istantanea(m) : null; };
/** Salva l'istantanea di un mese: quella senza Conti in config e, per il titolare, quella completa in econfig.
 *  solo = 'mancanti' per scrivere solo quelle che non ci sono ancora (il Centro automatico). Ritorna quante ne ha scritte. */
export async function salva(m, { solo = '', come = 'a mano' } = {}) {
  if (store.soloLettura()) throw new Error('Con il permesso di sola lettura non si salva.');
  const tit = contiVisibili(); let n = 0;
  for (const col of tit ? ['config', 'econfig'] : ['config']) if (annullato(m, col)) await store.remove(col, idAnn(m));   // salvato di nuovo: il segno non serve più
  const rec = rep => ({ tipo: 'report', mese: m, quando: rep.quando, come, completo: !mancanze(rep).length, mancanze: mancanze(rep), rep });
  if (!(solo === 'mancanti' && S.config.some(x => x.id === idPub(m)))) { await store.put('config', idPub(m), rec(prepara(m, { conti: false }))); n++; }
  if (tit && !(solo === 'mancanti' && S.econfig.some(x => x.id === idRis(m)))) { await store.put('econfig', idRis(m), rec(prepara(m, { conti: true }))); n++; }
  return n;
}
/** Toglie le istantanee di un mese (il report torna a mostrare i dati di adesso). */
export async function togli(m) {
  if (S.config.some(x => x.id === idPub(m))) await store.remove('config', idPub(m));
  if (contiVisibili() && S.econfig.some(x => x.id === idRis(m))) await store.remove('econfig', idRis(m));
}
