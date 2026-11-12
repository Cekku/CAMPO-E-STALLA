// Conti → Grafici (dalla 1.33.0): PLV, spese varie e reddito lordo standard negli anni, da dove viene la PLV,
// spese per categoria, latte mese per mese, mandria dai controlli AIA e confronto con le altre stalle (percentili).
import { S, UI } from '../state.js';
import { esc, nf, N } from '../util.js';
import { ic } from '../icons.js';
import { righe, anniFatture, parametri, datiTecnici, calc, plvAnno, litriRiga, CAT_LATTE, CAT_PREMI } from '../conti/dati.js';
import { rls } from '../conti/rls.js';
import { PARAMETRI } from '../conti/analisi.js';
import { RIF, FONTI, rifAnno, confronta } from '../conti/riferimenti.js';
import { tabella, bottoniExport, fmtVal } from '../conti/tabelle.js';
import { colonne, linee, barre, torta, fasce, PALETTE, COL, compatto } from '../conti/grafici.js';

const MESI = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];
const kpi = (l, v, s, cls = '') => `<div class="kpi static"><span class="k-l">${esc(l)}</span><span class="k-v sm ${cls}">${v}</span><span class="k-s">${s}</span></div>`;
const card = (titolo, icona, corpo, extra = '') => `<section class="card"><div class="card-h"><h2>${ic(icona)}${esc(titolo)}</h2>${extra}</div>${corpo}</section>`;
const nota = t => `<p class="muted small pad-x">${t}</p>`;
// voci del confronto con le altre stalle, nell'ordine in cui si leggono
const CONFRONTO = ['plv_v', 'l_vacca', 'iofc_tot_vg', 'alim_plv', 'camp_plv', 'sau_v', 'utile_v', 'pareggio_contr', 'amm_int_plv', 'debito_plv', 'pfn_v'];
const FMT = Object.fromEntries(PARAMETRI.flatMap(([, v]) => v.map(([k, l, , f]) => [k, { l, f }])));

/** Dove sta un valore fra le altre stalle (percentili 10, 25, 50, 75, 90; i due estremi possono mancare). */
function posizione(v, q) {
  if (v == null || !isFinite(v)) return '';
  if (q[0] != null && v < q[0]) return 'fra il 10% più basso';
  if (v < q[1]) return q[0] != null ? 'sotto la metà centrale' : 'sotto la fascia';
  if (v <= q[3]) return v < q[2] ? 'nella metà centrale, sotto la mediana' : 'nella metà centrale, sopra la mediana';
  if (q[4] != null && v > q[4]) return 'fra il 10% più alto';
  return q[4] != null ? 'sopra la metà centrale' : 'sopra la fascia';
}
const gruppoPlv = c => (c === CAT_LATTE || c === CAT_PREMI ? 'Latte e premi' : c === 'Vitelli' ? 'Vitelli' : c === 'Bovini' ? 'Vacche e altri bovini' : 'Altre vendite');
const GRUPPI_PLV = ['Latte e premi', 'Vitelli', 'Vacche e altri bovini', 'Altre vendite'];

export function vGrafici() {
  const y = UI.anno;
  const anni = [...new Set([...anniFatture(), y])].filter(a => a <= y).sort((a, b) => a - b).slice(-5);
  const R = Object.fromEntries(anni.map(a => [a, rls(a)]));
  const r = R[y], rp = R[y - 1];
  if (!r || (!r.plv && !r.sv)) return `<section class="card"><div class="empty">${ic('chart-column', 'huge')}<h3>Nessuna fattura del ${y}</h3><p class="muted">I grafici si costruiscono dalle fatture caricate e dai controlli AIA: carica le fatture dell'anno in Carica documenti.</p></div></section>`;
  const P = parametri(y), T = datiTecnici(y);
  const inCorso = y === new Date().getFullYear();
  const delta = (a, b, menoMeglio = false) => { if (!a || !b) return ''; const d = (a - b) / Math.abs(b); const bene = menoMeglio ? d <= 0 : d >= 0; return `<span class="k-delta ${bene ? 'up' : 'down'}">${d >= 0 ? '▲' : '▼'} ${nf(Math.abs(d) * 100, 1)}%</span> sul ${y - 1}`; };

  // numeri in alto
  const kp = `<div class="kpis">${kpi('PLV ' + y, fmtVal(r.plv, 'eur') || '—', delta(r.plv, rp && rp.plv) || 'vendite senza IVA e senza PAC')}${kpi('PLV per vacca', P.plv_v ? fmtVal(P.plv_v, 'eur') : '—', P.plv_v ? `${nf(T.val.vacche, 0)} vacche presenti${T.da.vacche === 'controlli AIA' ? ' (controlli AIA)' : ''}${inCorso ? ', riportata a 12 mesi' : ''}` : 'serve il numero di vacche')}${kpi('Spese varie sulla PLV', r.incSv == null ? '—' : nf(r.incSv * 100, 1) + '%', delta(r.incSv, rp && rp.incSv, true) || 'spese varie ÷ PLV')}${kpi('Reddito lordo standard', fmtVal(r.rls, 'eur') || '0 €', r.plv ? nf(r.rls / r.plv * 100, 1) + '% della PLV' : '', r.rls < 0 ? 't-bad' : '')}</div>`;
  const avvisi = [];
  if (inCorso) avvisi.push(`Il ${y} non è finito: le fatture arrivano fino a oggi (il latte di solito con un mese di ritardo). Confronta con gli anni interi con prudenza.`);
  if (r.daClass > 0.05 * (r.sv || 1)) avvisi.push(`${fmtVal(r.daClass, 'eur')} di righe del ${y} sono ancora "Da classificare": contano come spese varie.`);
  // conto economico incompleto (di solito un bilancino in corso d'anno): gli indici che lo usano vengono troppo buoni
  const C = calc(y), ce = C.ce || {};
  if (C.has && C.has.ce) {
    if (N(ce[62]) < 1) avvisi.push(`Il conto economico del ${y} non ha gli ammortamenti (di solito è un bilancino in corso d'anno): utile per vacca, IOFC e prezzo di pareggio risultano migliori del vero. Carica il bilancio di fine anno.`);
    const fa = plvAnno(y).alimAcq;
    if (fa && N(ce[30]) < fa * 0.7) avvisi.push(`Alimenti acquistati: ${fmtVal(N(ce[30]), 'eur')} nel conto economico, ${fmtVal(fa, 'eur')} nelle fatture (mangimi, materie prime, integratori, foraggi). Probabilmente alcuni conti del bilancino sono abbinati a un'altra voce: controlla in Bilancio → Conto economico. Finché non tornano, IOFC e costo alimentare per litro sono troppo bassi.`);
  }
  const box = avvisi.map(a => `<div class="note-box warn">${ic('info')}<span>${esc(a)}</span></div>`).join('');

  // 1. PLV, spese varie e RLS negli anni
  const g1 = colonne(anni.map(String), [{ name: 'PLV', values: anni.map(a => R[a].plv || null), color: COL.ven }, { name: 'Spese varie', values: anni.map(a => R[a].sv || null), color: COL.acq }, { name: 'Reddito lordo standard', values: anni.map(a => R[a].rls || null), color: COL.diff }]);
  const g1b = linee(anni.map(String), [{ name: 'Spese varie sulla PLV', values: anni.map(a => (R[a].incSv == null ? null : R[a].incSv * 100)), color: COL.acq }, { name: 'Alimenti acquistati sulla PLV', values: anni.map(a => { const p = parametri(a).alim_plv; return p == null ? null : p * 100; }), color: 'var(--c-y4)' }], { fmt: v => nf(v, 0) + '%', unit: '%', h: 200 });

  // 2. da dove viene la PLV
  const perGruppo = a => { const o = Object.fromEntries(GRUPPI_PLV.map(g => [g, 0])); for (const c of R[a].cats) if (c.tipo === 'Vendita' && c.voce === 'plv') o[gruppoPlv(c.categoria)] += c.importo; o['Altre vendite'] += N(R[a].corrisp); return o; };
  const G = Object.fromEntries(anni.map(a => [a, perGruppo(a)]));
  const g2 = colonne(anni.map(String), GRUPPI_PLV.map((g, k) => ({ name: g, values: anni.map(a => G[a][g] || null), color: PALETTE[k] })));
  const g2t = torta(GRUPPI_PLV.map((g, k) => ({ label: g, v: G[y][g], color: PALETTE[k] })), { fmt: v => fmtVal(v, 'eur'), tot: 'PLV ' + y });

  // 3. spese varie per categoria, con l'anno prima
  const catAnno = a => new Map((R[a] ? R[a].cats : []).filter(c => c.tipo === 'Acquisto' && c.voce === 'sv').map(c => [c.categoria, c.importo]));
  const cy = catAnno(y), cp = catAnno(y - 1);
  const g3 = barre([...cy].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([c, v], k) => { const p = cp.get(c); return { label: c, v, color: PALETTE[k % PALETTE.length], sub: p ? `${v >= p ? '+' : '−'}${nf(Math.abs(v - p) / Math.abs(p) * 100, 0)}% sul ${y - 1}` : rp && rp.plv ? `nuova nel ${y}` : '' }; }), { fmt: v => fmtVal(v, 'eur') });

  // 4. latte mese per mese (fatture): litri venduti e prezzo con i premi
  const lat = a => { const l = Array(12).fill(0), e = Array(12).fill(0); for (const x of righe()) { if (x.anno !== a || x.tipo !== 'Vendita' || !x.mese) continue; if (x.categoria === CAT_LATTE) { l[x.mese - 1] += litriRiga(x); e[x.mese - 1] += N(x.importo); } else if (x.categoria === CAT_PREMI) e[x.mese - 1] += N(x.importo); } return { l, e }; };
  const anniL = [y - 1, y].filter(a => anni.includes(a));
  const L = Object.fromEntries(anniL.map(a => [a, lat(a)]));
  const colA = (i, n) => (i === n - 1 ? COL.ven : 'var(--c-y2)');
  const g4 = colonne(MESI, anniL.map((a, i) => ({ name: String(a), values: L[a].l.map(v => v || null), color: colA(i, anniL.length) })), { unit: 'litri' });
  const g4p = linee(MESI, anniL.map((a, i) => ({ name: String(a), values: L[a].l.map((v, m) => (v > 1000 ? L[a].e[m] / v : null)), color: colA(i, anniL.length) })), { fmt: v => nf(v, 3), unit: '€/l', h: 200 });

  // 5. mandria dai controlli AIA (ultimi 24)
  const st = ((S.config.find(x => x.id === 'aia') || {}).storia || []).slice().sort((a, b) => String(a.data).localeCompare(String(b.data))).slice(-24);
  const lab = st.map(c => String(c.data).slice(5, 7) + '/' + String(c.data).slice(2, 4));
  const g5 = st.length >= 2 ? linee(lab, [{ name: 'Vacche presenti', values: st.map(c => N(c.presenti) || null), color: COL.diff }, { name: 'In lattazione', values: st.map(c => (N(c.presenti) ? N(c.presenti) - N(c.asciutte) : null)), color: COL.ven }], { fmt: v => nf(v, 0), unit: 'vacche', h: 200 }) : '';
  const g5l = st.length >= 2 ? linee(lab, [{ name: 'Latte per vacca controllata (kg al giorno)', values: st.map(c => N(c.latte) || null), color: COL.ven }], { fmt: v => nf(v, 1), unit: 'kg', h: 200 }) : '';

  // 6. confronto con le altre stalle
  const voci = CONFRONTO.map(k => {
    const rf = rifAnno(k, y); if (!rf) return null;
    const q = rf.q || (rf.min != null ? [null, rf.min, rf.media, rf.max, null] : null); if (!q) return null;
    const f = (FMT[k] || {}).f || 'n'; const v = P[k]; const c = confronta(k, v, y);
    return { k, label: (FMT[k] || {}).l || k, v, q, fmt: w => fmtVal(w, f) || nf(w, 2), esito: c ? c.esito : '', testo: posizione(v, q), fonti: rf.f.map(x => FONTI[x].breve).join(' · '), nota: rf.n || '' };
  }).filter(Boolean);
  const conDato = voci.filter(o => o.v != null && isFinite(o.v)), senza = voci.filter(o => !(o.v != null && isFinite(o.v)));
  const g6 = fasce(conDato) + (senza.length ? nota(`Mancano i dati per: ${senza.map(o => esc(o.label.replace(/ \(.*\)$/, ''))).join(', ')}. Servono il conto economico (bilancino del commercialista), lo stato patrimoniale o, nei dati tecnici dell'Analisi della stalla, ettari e unità di lavoro.`) : '');
  const t6 = tabella('grCfr', {
    title: `La tua azienda e le altre stalle ${y}`, sheet: 'Confronto', sort: false,
    cols: [{ k: 'label', h: 'Indice', cls: 'w' }, { k: 'tuo', h: 'Tua azienda', fmt: 'text' }, { k: 'p10', h: '10%', fmt: 'text' }, { k: 'p25', h: '25%', fmt: 'text' }, { k: 'p50', h: 'Mediana', fmt: 'text' }, { k: 'p75', h: '75%', fmt: 'text' }, { k: 'p90', h: '90%', fmt: 'text' }, { k: 'testo', h: 'Posizione', fmt: 'text' }, { k: 'fonti', h: 'Fonte', fmt: 'text', cls: 'clip' }],
    rows: voci.map(o => ({ label: o.label, tuo: o.v == null ? '' : o.fmt(o.v), p10: o.q[0] == null ? '' : o.fmt(o.q[0]), p25: o.fmt(o.q[1]), p50: o.fmt(o.q[2]), p75: o.fmt(o.q[3]), p90: o.q[4] == null ? '' : o.fmt(o.q[4]), testo: o.testo, fonti: o.fonti })),
  });
  const fontiUsate = [...new Set(voci.flatMap(o => RIF[o.k].f))].map(f => `<b>${esc(FONTI[f].breve)}</b>: ${esc(FONTI[f].testo)}`).join('<br>');

  return `${box}${kp}
  <div class="grid-2">${card('PLV, spese varie e reddito lordo standard', 'chart-column', g1 + nota('PLV = vendite delle fatture più corrispettivi, senza IVA e senza PAC. Gli investimenti (mezzi, costruzioni, acquisto di bestiame per la mandria) non sono spese varie.'))}
  ${card('Quanto delle vendite se ne va in spese', 'chart-line', g1b + nota('Se la linea sale, le spese crescono più delle vendite. Gli alimenti comprati sono la parte più grande delle spese varie.'))}</div>
  <div class="grid-2">${card('Da dove viene la PLV', 'chart-column', g2)}${card('PLV ' + y + ' per voce', 'chart-pie', g2t)}</div>
  ${card(`Spese varie ${y} per categoria`, 'tags', g3 + nota(`Le 12 categorie più grandi, con la variazione sul ${y - 1}. Tocca "Fatture" per vedere le righe di una categoria.`))}
  ${anniL.length ? `<div class="grid-2">${card('Latte venduto mese per mese (litri)', 'milk', g4 + nota('Dalle fatture del latte, mese della fattura.'))}${card('Prezzo del latte mese per mese, premi compresi (€/l)', 'chart-line', g4p)}</div>` : ''}
  ${g5 ? `<div class="grid-2">${card('Vacche dai controlli AIA', 'cow', g5)}${card('Latte per vacca dai controlli AIA', 'chart-line', g5l + nota('Ultimi 24 controlli funzionali caricati in Stalla → Indici e benessere.'))}</div>` : ''}
  ${card(`La tua azienda e le altre stalle (${y})`, 'scale', g6 + `<div class="pad-x">${t6}</div>` + nota(`Il pallino è la tua azienda (verde se è dalla parte buona, rosso se no); la fascia chiara va dal 10% al 90% delle stalle, quella scura è la metà centrale. Le stalle del confronto hanno in mediana 184 vacche: tu ne hai ${T.val.vacche ? nf(T.val.vacche, 0) : '—'}. I riferimenti sono del 2022-2023, con il latte intorno a 56 €/hl: con prezzi diversi cambiano soprattutto PLV e utile.`) + `<p class="muted small pad-x">${fontiUsate}</p>`, bottoniExport(['grCfr'], 'Confronto con le altre stalle ' + y))}`;
}
export { compatto };
