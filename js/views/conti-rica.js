// Conti → Bilancio → Bilancino e fatture (dalla 1.40.0): conto economico secondo lo schema RICA del CREA, con il
// confronto voce per voce fra il bilancino del commercialista e le fatture caricate. Calcoli in conti/rica.js.
import { UI } from '../state.js';
import { esc, nf } from '../util.js';
import { ic } from '../icons.js';
import * as store from '../store.js';
import { toast } from '../ui.js';
import { tabella, bottoniExport, fmtVal } from '../conti/tabelle.js';
import { cfg, anniBilancio } from '../conti/dati.js';
import * as R from '../conti/rica.js';

const e0 = v => (v === null || v === undefined ? '—' : fmtVal(v, 'eur'));
const kpi = (l, v, s, cls = '') => `<div class="kpi static"><span class="k-l">${esc(l)}</span><span class="k-v sm ${cls}">${v}</span><span class="k-s">${s}</span></div>`;
const COL_BIL = 'var(--c-diff)', COL_FATT = 'var(--c-acq)';
const voceOpts = sel => R.VOCI_CONTO.map(v => `<option value="${v.k}"${v.k === sel ? ' selected' : ''}>${esc(v.l)}</option>`).join('');
const gruppoDi = k => R.GRUPPI.find(g => g.k === k);

export function vRica() {
  const y = UI.anno; const C = R.confronto(y);
  if (!C.haBil && !C.haFatt) return `<section class="card"><div class="empty">${ic('scale')}<b>Niente da confrontare per il ${y}</b><span>Carica il bilancino e le fatture dell'anno in Carica documenti.</span></div></section>`;
  const intro = `<div class="note-box">${ic('info')}<span>Il conto economico qui è nella forma dei bilanci agricoli del <b>RICA</b> (la rete contabile agricola del CREA, la stessa usata per confrontare le aziende in Italia e in Europa): ricavi totali, costi correnti, valore aggiunto, ammortamenti e lavoro, reddito operativo, reddito netto. Per ogni voce vedi quanto dice il <b style="color:${COL_BIL}">bilancino</b> del commercialista e quanto dicono le <b style="color:${COL_FATT}">fatture</b> caricate, con i conti e le categorie che ci sono finiti dentro.</span></div>`;
  const avvisi = [];
  if (!C.daBilancino) avvisi.push(C.haBil ? `Il conto economico del ${y} non viene da un bilancino letto dall'app: non si vedono i conti uno per uno.` : `Per il ${y} non c'è il bilancino: si vede solo la colonna delle fatture.`);
  if (!C.haFatt) avvisi.push(`Per il ${y} non ci sono fatture caricate.`);
  const av = avvisi.map(t => `<div class="note-box warn">${ic('triangle-alert')}<span>${esc(t)}</span></div>`).join('');
  const T = C.totBil, F = C.totFatt;
  const kp = `<div class="kpis">${kpi('Ricavi totali', e0(T.rta), 'fatture ' + e0(F.rta))}${kpi('Costi correnti', e0(-T.cc), 'fatture ' + e0(-F.cc))}${kpi('Valore aggiunto', e0(T.va), 'ricavi − costi correnti', T.va < 0 ? 't-bad' : '')}${kpi('Reddito operativo', e0(T.ro), 'dopo ammortamenti, salari e affitti', T.ro < 0 ? 't-bad' : '')}${kpi('Reddito netto', e0(T.rn), 'dopo interessi, imposte e aiuti', T.rn < 0 ? 't-bad' : '')}</div>`;
  return intro + av + kp + differenzeCard(C) + grafico(C) + tabellaCe(C, y) + dettaglio(C) + categorieCard(C, y);
}

/* ---------------- differenze ---------------- */
function differenzeCard(C) {
  if (!C.haBil || !C.haFatt) return '';
  const D = R.differenze(C).slice(0, 8);
  if (!D.length) return `<div class="note-box ok">${ic('check')}<span>Bilancino e fatture tornano voce per voce (differenze sotto i 2.000 €).</span></div>`;
  return `<section class="card"><div class="card-h"><h2>${ic('scan-search')}Differenze più grandi</h2></div>
    <p class="muted small pad-x">Una differenza vuol dire che il commercialista ha messo una spesa in una voce diversa dalla nostra, oppure che manca qualcosa da una delle due parti. Spostare un conto del bilancino cambia solo dove l'app lo mette nel conto economico: il bilancino resta com'è.</p>
    <div class="alerts">${D.map(d => `<div class="alert warn"><span class="a-ic">${ic('scan-search')}</span><span class="a-tx"><b>${esc(d.l)}: bilancino ${esc(fmtVal(Math.abs(d.bil || 0), 'eur'))}, fatture ${esc(fmtVal(Math.abs(d.fatt || 0), 'eur'))}</b><span>${esc(d.testo)}</span>${d.proposta ? `<span><button class="btn sm" data-act="c-rcSposta" data-chiave="${esc(d.proposta.chiave)}" data-riga="${d.proposta.riga}">${ic('check')}Sposta "${esc(d.proposta.descrizione.slice(0, 60))}" in ${esc(R.VOCE[d.proposta.a].l)}</button></span>` : ''}</span></div>`).join('')}</div></section>`;
}

/* ---------------- grafico a barre doppie ---------------- */
function grafico(C) {
  const L = C.voci.filter(v => Math.abs(v.bil) >= 500 || Math.abs(v.fatt || 0) >= 500);
  if (!L.length) return '';
  // una scala per i ricavi, una per i costi e una per la gestione extra-caratteristica: il latte non schiaccia i costi
  const fam = g => (['plv', 'atco'].includes(g) ? 'r' : g === 'ge' ? 'e' : 'c');
  const MX = {}; for (const v of L) MX[fam(v.g)] = Math.max(MX[fam(v.g)] || 0, Math.abs(v.bil), Math.abs(v.fatt || 0));
  let mx = 1;
  const barra = (v, col) => `<span style="display:block;height:9px;border-radius:2px;background:${col};width:${Math.max(0.5, Math.abs(v || 0) / mx * 100).toFixed(1)}%;${v ? '' : 'opacity:.25'}"></span>`;
  let g0 = '';
  const righe = L.map(v => {
    mx = MX[fam(v.g)] || 1;
    const g = gruppoDi(v.g); const tit = g.k !== g0 ? `<div style="grid-column:1/-1;margin-top:10px;font-weight:700;font-size:13px;color:var(--ink-2)">${esc(g.l)}</div>` : ''; g0 = g.k;
    return `${tit}<div style="min-width:0;font-size:13px;line-height:1.25">${esc(v.l)}</div><div style="display:flex;flex-direction:column;gap:3px;justify-content:center;min-width:0">${barra(v.bil, COL_BIL)}${barra(v.fatt, COL_FATT)}</div><div style="text-align:right;font-family:var(--f-mono);font-size:12px;line-height:1.3;white-space:nowrap"><span style="color:${COL_BIL}">${esc(e0(Math.abs(v.bil)))}</span><br><span style="color:${COL_FATT}">${v.fatt === null ? 'non in fattura' : esc(e0(Math.abs(v.fatt)))}</span></div>`;
  }).join('');
  return `<section class="card"><div class="card-h"><h2>${ic('chart-column')}Voce per voce</h2><span class="muted small"><i style="display:inline-block;width:10px;height:10px;background:${COL_BIL};border-radius:2px"></i> bilancino &nbsp;<i style="display:inline-block;width:10px;height:10px;background:${COL_FATT};border-radius:2px"></i> fatture</span></div>
    <div style="display:grid;grid-template-columns:minmax(0,1.3fr) minmax(0,2fr) auto;gap:6px 12px;align-items:center;padding:4px 16px 14px">${righe}</div></section>`;
}

/* ---------------- conto economico RICA ---------------- */
function tabellaCe(C, y) {
  const rows = []; const T = C.totBil, F = C.totFatt;
  const tot = (l, k, cls = 'tot') => rows.push({ l, bil: T[k], fatt: F[k], diff: Math.round((T[k] - F[k]) * 100) / 100, _cls: cls });
  const gruppo = k => { const g = gruppoDi(k); rows.push({ _sez: g.l }); C.voci.filter(v => v.g === k).forEach(v => rows.push({ l: v.l, bil: v.bil, fatt: v.fatt, diff: v.diff, nota: [v.fuori ? 'non passa dalle fatture' : '', ...v.altre].filter(Boolean).join(', '), _cls: 'det' })); };
  gruppo('plv'); tot('Produzione lorda vendibile', 'plv', 'grp'); gruppo('atco'); tot('RICAVI TOTALI AZIENDALI', 'rta');
  gruppo('fc'); gruppo('st'); gruppo('asc'); tot('COSTI CORRENTI', 'cc'); tot('VALORE AGGIUNTO', 'va');
  gruppo('cp'); gruppo('rd'); tot('REDDITO OPERATIVO', 'ro'); gruppo('ge'); tot('REDDITO NETTO', 'rn');
  return `<section class="card"><div class="card-h"><h2>${ic('scale')}Conto economico RICA ${y}</h2>${bottoniExport(['rica'], 'Conto economico RICA ' + y)}</div>
    <p class="muted small pad-x">Ricavi in positivo, costi in negativo. La colonna del bilancino comprende anche gli ammortamenti del registro dei beni e i salari delle paghe quando il bilancino non li ha.</p>
    ${tabella('rica', { title: 'Conto economico RICA ' + y, sheet: 'RICA ' + y, sort: false, rows, freeze: 1, cols: [{ k: 'l', h: 'Voce', fmt: 'text' }, { k: 'bil', h: 'Bilancino', fmt: 'eur' }, { k: 'fatt', h: 'Fatture', fmt: 'eur' }, { k: 'diff', h: 'Differenza', fmt: 'eur' }, { k: 'nota', h: 'Note', fmt: 'text', cls: 'clip' }] })}</section>`;
}

/* ---------------- dettaglio per voce: conti del bilancino e categorie delle fatture affiancati ---------------- */
function dettaglio(C) {
  const L = C.voci.filter(v => v.conti.length || v.categorie.length);
  if (!L.length) return '';
  const blocco = v => {
    const conti = v.conti.map(c => `<div style="display:grid;grid-template-columns:minmax(0,1fr) auto;gap:4px 8px;padding:6px 0;border-bottom:1px solid var(--line)"><span style="min-width:0;font-size:13px">${esc(c.descrizione)}${c.contenitore ? ' <span class="chip warn">contenitore</span>' : ''}</span><span style="font-family:var(--f-mono);font-size:12.5px;text-align:right">${esc(e0(c.importo))}</span><label style="grid-column:1/-1;font-size:12px;color:var(--muted);display:flex;gap:6px;align-items:center;min-width:0">va in <select class="cell-in" style="min-width:0;flex:1" data-act="c-rcConto" data-chiave="${esc(c.chiave)}">${voceOpts(v.k)}</select></label></div>`).join('');
    const cats = v.categorie.map(c => `<div style="display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;padding:6px 0;border-bottom:1px solid var(--line)"><span style="min-width:0;font-size:13px">${esc(c.categoria || '(senza categoria)')}</span><span style="font-family:var(--f-mono);font-size:12.5px;text-align:right">${esc(e0(c.importo))}</span></div>`).join('');
    return `<details class="card" style="padding:0"><summary style="display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:center;padding:12px 16px;cursor:pointer"><span style="min-width:0"><b>${esc(v.l)}</b><br><span class="muted small">${esc(gruppoDi(v.g).l)}</span></span><span style="text-align:right;font-family:var(--f-mono);font-size:12.5px;white-space:nowrap"><span style="color:${COL_BIL}">${esc(e0(Math.abs(v.bil)))}</span> · <span style="color:${COL_FATT}">${v.fatt === null ? '—' : esc(e0(Math.abs(v.fatt)))}</span>${v.diff ? `<br><span class="${Math.abs(v.diff) >= 2000 ? 't-bad' : 'muted'}">diff. ${esc(e0(v.diff))}</span>` : ''}</span></summary>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:4px 24px;padding:0 16px 14px">
        <div style="min-width:0"><div style="font-weight:700;font-size:12.5px;color:${COL_BIL};margin:4px 0">Conti del bilancino</div>${conti || `<p class="muted small">${C.daBilancino ? 'Nessun conto.' : 'Bilancino non letto dall\'app.'}${v.altre.length ? ' Importo ' + esc(v.altre.join(', ')) + '.' : ''}</p>`}</div>
        <div style="min-width:0"><div style="font-weight:700;font-size:12.5px;color:${COL_FATT};margin:4px 0">Categorie delle fatture</div>${cats || `<p class="muted small">${v.fuori ? 'Questa voce non passa dalle fatture.' : 'Nessuna categoria.'}</p>`}</div>
      </div>${v.nota ? `<p class="muted small" style="padding:0 16px 12px">${esc(v.nota)}</p>` : ''}</details>`;
  };
  return `<h2 style="font-family:var(--f-display);font-size:20px;margin:22px 0 4px">Voce per voce: come l'abbiamo organizzato noi e come il bilancino</h2>
    <p class="muted small" style="margin:0 0 10px">Tocca una voce per vedere i conti del bilancino e le nostre categorie che ci sono finiti dentro. "Va in" sposta un conto del bilancino in un'altra voce (vale per tutti gli anni).</p>
    <div style="display:flex;flex-direction:column;gap:8px">${L.map(blocco).join('')}</div>`;
}

/* ---------------- categorie delle fatture e voce RICA ---------------- */
function categorieCard(C, y) {
  if (!C.categorie.length) return '';
  const rows = C.categorie.map(c => ({ tipo: c.tipo, categoria: c.categoria || '(senza categoria)', importo: c.importo, voce: c.voce ? R.VOCE[c.voce].l : 'Fuori (investimento o non conta)', _c: c }));
  const sel = r => { const c = r._c; const opts = `<option value="fuori"${!c.voce ? ' selected' : ''}>Fuori (investimento o non conta)</option>` + R.VOCI.filter(v => v.tipo === (c.tipo === 'Vendita' ? 'V' : 'A')).map(v => `<option value="${v.k}"${v.k === c.voce ? ' selected' : ''}>${esc(v.l)}</option>`).join(''); return `<select class="cell-in" data-act="c-rcCat" data-k="${esc(c.tipo + '|' + c.categoria)}">${opts}</select>${c.scelta ? ' <span class="chip">scelta tua</span>' : ''}`; };
  return `<section class="card" style="margin-top:18px"><div class="card-h"><h2>${ic('tags')}Le nostre categorie nelle voci RICA ${y}</h2>${bottoniExport(['ricaCat'], 'Categorie e voci RICA ' + y)}</div>
    <p class="muted small pad-x">Dove va ogni categoria delle fatture. Gli investimenti (fabbricati, impianti, macchine) restano fuori: entrano negli ammortamenti dal registro dei beni. Le scelte valgono per tutti gli anni.${C.fuoriInv ? ` Fuori quest'anno: ${esc(e0(C.fuoriInv))}.` : ''}</p>
    ${tabella('ricaCat', { title: 'Categorie e voci RICA ' + y, sheet: 'Categorie', rows, cols: [{ k: 'tipo', h: 'Tipo', fmt: 'text' }, { k: 'categoria', h: 'Categoria', fmt: 'text' }, { k: 'importo', h: 'Importo ' + y, fmt: 'eur' }, { k: 'voce', h: 'Voce RICA', fmt: 'text', html: sel }] })}</section>`;
}

/* ---------------- azioni ---------------- */
async function salvaCfg(patch) { await store.put('econfig', 'cfg', Object.assign({}, cfg(), patch)); }
async function spostaConto(chiave, riga) {
  const cu = Object.assign({}, cfg().contiUtente || {}); cu[chiave] = +riga; await salvaCfg({ contiUtente: cu });
  const { riabbinaBilancino } = await import('../conti/importa.js'); for (const y of anniBilancio()) await riabbinaBilancino(y);
}
export async function ricaAct(a, b, d, rerender) {
  if (a === 'c-rcSposta') { b.disabled = true; try { await spostaConto(d.chiave, d.riga); toast('Conto spostato: il conto economico è stato ricalcolato'); } catch (e) { toast(e.message, 'err'); b.disabled = false; } return rerender(); }
}
export async function ricaChange(t, rerender) {
  const a = t.dataset.act;
  if (a === 'c-rcConto') { const v = R.VOCE[t.value]; if (!v) return; await spostaConto(t.dataset.chiave, v.rif); toast(`Conto spostato in ${v.l}`); return rerender(); }
  if (a === 'c-rcCat') { const m = Object.assign({}, cfg().ricaCat || {}); m[t.dataset.k] = t.value; await salvaCfg({ ricaCat: m }); toast('Voce della categoria salvata'); return rerender(); }
}
