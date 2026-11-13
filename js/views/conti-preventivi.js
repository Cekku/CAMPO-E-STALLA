// Conti → Preventivi e contratti (dalla 1.36.0): confronti delle offerte di fornitura (mangimi, sementi, forniture varie)
// fra più ditte, con il contratto in corso e con i prezzi pagati nelle fatture. Calcoli e lettura dei prezzi in conti/preventivi.js.
import { S, UI } from '../state.js';
import { esc, nf, fd, N, today, diff, okD } from '../util.js';
import { ic } from '../icons.js';
import { toast, arm, openSheet, closeSheet, openForm, setUnit } from '../ui.js';
import { tabella, bottoniExport, fmtVal } from '../conti/tabelle.js';
import { fatture } from '../conti/dati.js';
import * as P from '../conti/preventivi.js';
import { btnOrig } from './conti-documenti.js';
import * as AD from './archivio-dati.js';

const ST = { pc: false, sug: { q: '', sel: new Set(), L: [] } };
const STATI = { aperto: ['Aperto', 'info'], deciso: ['Deciso', 'ok'], chiuso: ['Chiuso', ''] };
const e2 = v => fmtVal(v, 'eur2'), e0 = v => fmtVal(v, 'eur');
const prz = (v, um) => v === null || v === undefined ? '—' : Number(v).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: v < 10 ? 3 : 2 }) + ' €/' + um;
const kpi = (l, v, s, cls = '') => `<div class="kpi static"><span class="k-l">${esc(l)}</span><span class="k-v sm ${cls}">${v}</span><span class="k-s">${s}</span></div>`;
const chip = (t, lv = '') => `<span class="chip ${lv}">${esc(t)}</span>`;
const dmy = s => (okD(s) ? fd(s) : '—');
const segno = v => (v > 0 ? 't-ok' : v < 0 ? 't-bad' : '');
const corrente = () => (UI.f.pv_id && P.confronto(UI.f.pv_id)) || null;
const copia = c => JSON.parse(JSON.stringify(c));
const ditte = () => [...new Set(fatture().filter(f => f.tipo === 'Acquisto' && f.controparte).map(f => f.controparte))].sort((a, b) => a.localeCompare(b, 'it')).slice(0, 400);

export function vPreventivi() { const c = corrente(); return c ? dettaglio(c) : elenco(); }

/* ---------------- elenco dei confronti ---------------- */
function elenco() {
  const L = P.confronti(); const T = today();
  const K = new Map(L.map(c => [c.id, P.calcola(c)]));
  const contr = L.flatMap(c => (c.offerte || []).filter(o => o.contratto && (!okD(o.fine) || o.fine >= T)).map(o => ({ c, o })));
  const sc = P.scadenze().filter(x => x.data >= T && diff(T, x.data) <= 60);
  const aperti = L.filter(c => !c.stato || c.stato === 'aperto');
  const risp = aperti.reduce((t, c) => { const r = K.get(c.id).risparmio; const v = r.contratto ?? r.pagato; return t + (v > 0 ? v : 0); }, 0);
  const intro = `<div class="note-box">${ic('info')}<span>Un <b>confronto</b> è una cosa da comprare (per esempio "Mangime vacche 2027"): ci metti i prodotti con le quantità dell'anno e le offerte delle ditte. L'app porta tutti i prezzi alla stessa unità, aggiunge trasporto e sconti, tiene conto dei giorni di pagamento e li confronta con il contratto in corso e con quello che hai pagato davvero nelle fatture degli ultimi 12 mesi.</span></div>`;
  const kp = `<div class="kpis">${kpi('Confronti aperti', nf(aperti.length), L.length > aperti.length ? `${L.length - aperti.length} decisi o chiusi` : 'da decidere')}${kpi('Contratti in corso', nf(contr.length), contr.length ? 'con la data di fine' : 'segnali nelle offerte')}${kpi('Scadenze', nf(sc.length), 'nei prossimi 60 giorni', sc.length ? 't-warn' : '')}${kpi('Risparmio possibile', risp > 0 ? e0(risp) : '—', "all'anno, sui confronti aperti", risp > 0 ? 't-ok' : '')}</div>`;
  const nuovo = `<div class="btns" style="margin:14px 0"><button class="btn action" data-act="c-pvNuovo">${ic('plus')}Nuovo confronto</button></div>`;
  const lista = L.length ? `<section class="card"><div class="card-h"><h2>${ic('clipboard-list')}Confronti</h2><span class="count">${L.length}</span></div><div class="list flat pad-x">${L.map(c => {
    const k = K.get(c.id); const G = P.GENERI[c.genere] || P.GENERI.varie; const st = STATI[c.stato] || STATI.aperto;
    const r = k.risparmio.contratto ?? k.risparmio.pagato;
    const sub = [G.nome, `${k.voci.length === 1 ? '1 prodotto' : k.voci.length + ' prodotti'}`, `${k.offerte.length === 1 ? '1 offerta' : k.offerte.length + ' offerte'}`, k.migliore ? `migliore ${k.migliore.o.ditta} (${e0(k.costoMigliore)}${k.parziale ? ' sui prodotti in comune' : " all'anno"})` : '', r ? (r > 0 ? `risparmi ${e0(r)}` : `costa ${e0(-r)} in più`) : ''].filter(Boolean).join(' · ');
    return `<button class="row" data-act="c-pvApri" data-id="${esc(c.id)}"><span class="r-icon">${ic(G.icn)}</span><span class="r-main"><b>${esc(c.titolo || 'Confronto')}</b><span>${esc(sub)}</span></span><span class="r-side">${chip(st[0], st[1])}</span>${ic('chevron-right', 'chev')}</button>`;
  }).join('')}</div></section>` : `<section class="card"><div class="pad-x" style="padding:18px 16px"><p><b>Nessun confronto per ora.</b></p><p class="muted">Crea il primo con "Nuovo confronto". Se hai già i preventivi in PDF puoi caricarli nell'offerta: l'app prova a leggere i prezzi da sola e tu controlli.</p></div></section>`;
  const tc = contr.length ? (() => {
    const rows = contr.map(({ c, o }) => { const dd = okD(o.fine) && N(o.preavviso) > 0 ? addD(o.fine, -N(o.preavviso)) : null; return { id: c.id, ditta: o.ditta, cosa: c.titolo, inizio: o.inizio || '', fine: o.fine || '', disdetta: dd || '', giorni: dd ? diff(T, dd) : okD(o.fine) ? diff(T, o.fine) : null }; });
    return `<section class="card"><div class="card-h"><h2>${ic('handshake')}Contratti in corso</h2><span class="count">${rows.length}</span>${bottoniExport(['pvcontr'], 'Contratti di fornitura in corso')}</div>${tabella('pvcontr', { title: 'Contratti di fornitura in corso', sheet: 'Contratti', cols: [{ k: 'ditta', h: 'Ditta', cls: 'w' }, { k: 'cosa', h: 'Confronto' }, { k: 'inizio', h: 'Inizio', fmt: 'date' }, { k: 'fine', h: 'Fine', fmt: 'date' }, { k: 'disdetta', h: 'Disdetta entro', fmt: 'date' }, { k: 'giorni', h: 'Giorni', fmt: 'int', html: r => r.giorni === null ? '' : `<span class="${r.giorni < 0 ? 't-bad' : r.giorni <= 45 ? 't-warn' : ''}">${r.giorni < 0 ? 'passata' : nf(r.giorni)}</span>` }], rows: rows.map(r => Object.assign({ _cls: 'click' }, r)), rowAttr: r => `data-act="c-pvApri" data-id="${esc(r.id)}"` })}</section>`;
  })() : '';
  return intro + kp + nuovo + lista + tc + pcCard(null);
}
const addD = (s, n) => { const t = Date.parse(s + 'T00:00:00Z') + n * 864e5; return new Date(t).toISOString().slice(0, 10); };

/* ---------------- scheda del confronto ---------------- */
function dettaglio(c) {
  const K = P.calcola(c); const G = P.GENERI[c.genere] || P.GENERI.varie; const st = STATI[c.stato] || STATI.aperto;
  const mig = K.migliore, con = K.contratto;
  const testa = `<div class="btns" style="margin-bottom:10px"><button class="btn sm ghost" data-act="c-pvLista">${ic('chevron-left')}Tutti i confronti</button></div>
  <section class="card"><div class="card-h pv-h"><h2>${ic(G.icn)}${esc(c.titolo || 'Confronto')}</h2>${chip(G.nome)}${chip(st[0], st[1])}<button class="btn sm ghost" data-act="c-pvModC">${ic('pencil')}Modifica</button><button class="btn sm ghost danger" data-act="c-pvDelC">${ic('trash-2')}Elimina</button></div>
  ${c.note ? `<p class="muted small pad-x">${esc(c.note)}</p>` : ''}
  <div class="kpis">${kpi('Offerta migliore', mig ? e0(K.costoMigliore) : '—', mig ? esc(mig.o.ditta) + (K.parziale ? ` · sui ${K.comuni.length} prodotti che hanno tutti` : " · costo dell'anno") : 'servono offerte con i prezzi')}${kpi('Contratto in corso', con && (K.parziale ? K.comuni.length : con.completa) ? e0(K.parziale ? con.comuni : con.totale) : '—', con ? esc(con.o.ditta) + (K.parziale ? ' · stessi prodotti' : '') : 'nessuno segnato')}${kpi('Pagato nelle fatture', (K.parziale ? K.pagComuni : K.pagatoTot) !== null ? e0(K.parziale ? K.pagComuni : K.pagatoTot) : '—', (K.parziale ? K.pagComuni : K.pagatoTot) !== null ? 'ai prezzi medi degli ultimi 12 mesi' : 'non tutti i prodotti sono nelle fatture')}${(() => { const r = K.risparmio.contratto ?? K.risparmio.pagato; return kpi('Risparmio', r !== null ? e0(r) : '—', r !== null ? (K.risparmio.contratto !== null ? 'sul contratto, a parità di pagamento' : 'su quanto hai pagato') : 'si calcola con i prezzi', r !== null ? segno(r) : ''); })()}</div></section>`;
  return testa + sintesi(c, K) + vociCard(c, K) + offerteCard(c, K) + confrontoCard(c, K) + avvisiCard(c, K) + pcCard(c);
}
function sintesi(c, K) {
  const m = K.migliore; if (!m) return '';
  if (K.parziale) {
    const p = [`Nessuna offerta ha tutti i prezzi. Sui ${K.comuni.length === 1 ? 'un prodotto che hanno tutte' : K.comuni.length + ' prodotti che hanno tutte'} (${esc(K.comuni.map(v => v.nome).join(', '))}) la più conveniente è <b>${esc(m.o.ditta)}</b>: ${e0(m.comuni)} all'anno${m.gg ? ` con pagamento a ${m.gg} giorni` : ''}.`];
    if (K.risparmio.contratto !== null) p.push(K.risparmio.contratto >= 0 ? `Sugli stessi prodotti il contratto con ${esc(K.contratto.o.ditta)} costa circa ${e0(K.risparmio.contratto)} in più.` : `Sugli stessi prodotti il contratto con ${esc(K.contratto.o.ditta)} resta più conveniente di ${e0(-K.risparmio.contratto)}.`);
    p.push('Chiedi i prezzi che mancano per il confronto completo.');
    return `<div class="note-box warn" style="margin:14px 0">${ic('scale')}<span>${p.join(' ')}</span></div>`;
  }
  const parti = [`<b>${esc(m.o.ditta)}</b> costa ${e0(m.totale)} all'anno${m.gg ? ` con pagamento a ${m.gg} giorni` : ''}.`];
  if (K.risparmio.contratto !== null) parti.push(K.risparmio.contratto >= 0 ? `Rispetto al contratto con ${esc(K.contratto.o.ditta)} risparmi circa <b>${e0(K.risparmio.contratto)}</b> all'anno (confronto fatto riportando i pagamenti a oggi).` : `Il contratto con ${esc(K.contratto.o.ditta)} resta più conveniente di ${e0(-K.risparmio.contratto)}.`);
  if (K.risparmio.pagato !== null) parti.push(`Ai prezzi pagati nelle fatture degli ultimi 12 mesi avresti speso ${e0(K.pagatoTot)}: ${K.risparmio.pagato >= 0 ? 'differenza di ' + e0(K.risparmio.pagato) + ' a favore della nuova offerta' : 'la nuova offerta costa ' + e0(-K.risparmio.pagato) + ' in più'}.`);
  const altre = K.offerte.filter(x => !x.o.contratto && x.completa && !x.scaduta && x !== m).sort((a, b) => a.oggi - b.oggi);
  if (altre.length) parti.push(`Poi: ${altre.slice(0, 3).map(x => `${esc(x.o.ditta)} +${e0(x.oggi - m.oggi)}`).join(', ')}.`);
  return `<div class="note-box" style="margin:14px 0">${ic('sparkles')}<span>${parti.join(' ')}</span></div>`;
}
function vociCard(c, K) {
  const rows = K.voci.map(v => { const p = K.rif[v.id]; const d = p.ditte[0]; return { _cls: 'click', id: v.id, nome: v.nome, qta: N(v.qta) || null, um: v.um, pag: p.prezzo, comprato: p.qta || null, ditta: d ? d.ditta + (p.ditte.length > 1 ? ` e altre ${p.ditte.length - 1}` : '') : '', ultimo: p.ultimo ? p.ultimo.prezzo : null, uData: p.ultimo ? p.ultimo.data : '', righe: p.righe, conf: N(v.confQ) ? `1 conf. = ${nf(v.confQ, 2)} ${v.confUm || ''}` : '' }; });
  const t = tabella('pvvoci', {
    title: 'Prodotti: ' + (c.titolo || ''), sheet: 'Prodotti',
    cols: [{ k: 'nome', h: 'Prodotto', cls: 'w' }, { k: 'qta', h: "Quantità all'anno", fmt: 'num1', html: r => r.qta ? esc(nf(r.qta, 1) + ' ' + r.um) : '<span class="t-warn">da scrivere</span>' }, { k: 'um', h: 'Unità' }, { k: 'conf', h: 'Confezione' },
      { k: 'pag', h: 'Pagato (media 12 mesi)', fmt: 'eur3', html: r => r.pag === null ? '<span class="muted">non nelle fatture</span>' : esc(prz(r.pag, r.um)) }, { k: 'comprato', h: 'Comprato in 12 mesi', fmt: 'num1', html: r => r.comprato ? esc(nf(r.comprato, 1) + ' ' + r.um) : '' },
      { k: 'ditta', h: 'Da chi', cls: 'clip' }, { k: 'ultimo', h: 'Ultimo prezzo', fmt: 'eur3', html: r => r.ultimo === null ? '' : esc(prz(r.ultimo, r.um)) + `<small class="muted" style="display:block">${dmy(r.uData)}</small>` }, { k: 'righe', h: 'Righe', fmt: 'int' }],
    rows, rowAttr: r => `data-act="c-pvVoce" data-v="${esc(r.id)}"`,
  });
  return `<section class="card"><div class="card-h"><h2>${ic('package')}Prodotti da comprare</h2><span class="count">${rows.length}</span><button class="btn sm" data-act="c-pvVoce">${ic('plus')}Aggiungi</button><button class="btn sm ghost" data-act="c-pvSug">${ic('receipt')}Prendi dalle fatture</button>${rows.length ? bottoniExport(['pvvoci'], 'Prodotti ' + (c.titolo || '')) : ''}</div>
  <p class="muted small pad-x">Le quantità sono quelle che ti servono in un anno. "Pagato" è la media delle righe delle fatture di acquisto degli ultimi 12 mesi che contengono le parole del prodotto (imponibile diviso quantità, IVA esclusa). Tocca un prodotto per cambiarlo.</p>${rows.length ? t : ''}</section>`;
}
function offerteCard(c, K) {
  const righe = K.offerte.map(x => {
    const o = x.o; const tag = [];
    if (o.contratto) tag.push(chip(x.finito ? 'Contratto finito' : 'Contratto in corso', x.finito ? '' : 'info'));
    if (K.migliore && K.migliore.o.id === o.id) tag.push(chip('Migliore', 'ok'));
    if (x.scaduta) tag.push(chip('Scaduta', 'warn'));
    if (x.mancanti.length || x.nonConv.length) tag.push(chip('Prezzi mancanti', 'warn'));
    if (c.scelta === o.id) tag.push(chip('Scelta', 'ok'));
    const info = [o.data ? 'del ' + dmy(o.data) : '', o.contratto ? (o.fine ? 'fino al ' + dmy(o.fine) : '') : o.validita ? 'valida fino al ' + dmy(o.validita) : '', o.pagamento !== null && o.pagamento !== undefined && o.pagamento !== '' ? 'pagamento a ' + N(o.pagamento) + ' gg' : '', o.trasporto === 'unita' ? `trasporto ${e2(N(o.trValore))}/${o.trUm || ''}` : o.trasporto === 'forfait' ? `trasporto ${e0(N(o.trValore))} all'anno` : 'trasporto compreso', N(o.sconto) ? 'sconto ' + nf(N(o.sconto) * 100, 1) + '%' : '', x.totale ? (x.completa ? "costo dell'anno " : 'costo parziale (mancano dei prezzi) ') + e0(x.totale) : ''].filter(Boolean).join(' · ');
    const doc = o.file ? btnOrig(o.file.nome, o.file.imp, 'Documento') : o.archivio ? btnOrig(o.archivio.nome, o.archivio.imp, 'Documento') : '';
    const leggi = o.file || o.archivio || o.testo ? `<button class="btn sm ghost" data-act="c-pvLeggi" data-o="${esc(o.id)}">${ic('scan-search')}Leggi i prezzi</button>` : '';
    return `<div class="row static pv-off"><span class="r-icon">${ic(o.contratto ? 'handshake' : 'file-text')}</span><span class="r-main"><b>${esc(o.ditta || 'Senza nome')} ${tag.join(' ')}</b><span>${esc(info)}</span>${o.condizioni ? `<span class="muted small">${esc(o.condizioni)}</span>` : ''}</span>
      <span class="r-side btns"><button class="btn sm" data-act="c-pvPrezzi" data-o="${esc(o.id)}">${ic('euro')}Prezzi</button>${leggi}<label class="btn sm ghost">${ic('file-up')}Carica PDF<input type="file" accept=".pdf,.txt,application/pdf,text/plain" data-act="c-pvFile" data-o="${esc(o.id)}" hidden></label>${doc}<button class="btn sm ghost" data-act="c-pvOff" data-o="${esc(o.id)}">${ic('pencil')}Modifica</button>${!o.contratto && c.scelta !== o.id ? `<button class="btn sm ghost" data-act="c-pvScegli" data-o="${esc(o.id)}">${ic('check')}Scegli</button>` : ''}</span></div>`;
  }).join('');
  return `<section class="card"><div class="card-h"><h2>${ic('clipboard-list')}Offerte</h2><span class="count">${K.offerte.length}</span><button class="btn sm" data-act="c-pvOff">${ic('plus')}Nuova offerta</button><button class="btn sm ghost" data-act="c-pvOff" data-contr="1">${ic('handshake')}Contratto in corso</button></div>
  ${righe ? `<div class="list flat pad-x">${righe}</div>` : `<p class="muted small pad-x">Aggiungi le offerte delle ditte e, se c'è, il contratto che hai adesso: diventa il termine di paragone. Da un'offerta puoi caricare il PDF del preventivo e far leggere i prezzi all'app.</p>`}</section>`;
}
function confrontoCard(c, K) {
  if (!K.voci.length || !K.offerte.length) return '';
  const O = K.offerte;
  const cell = (x, v) => { const y = x.r[v.id]; if (!y || y.manca) return '<span class="muted">—</span>'; if (y.nonConv) return '<span class="t-bad">unità da sistemare</span>'; const best = K.perVoce[v.id] === x.o.id && O.length > 1; return `<span class="${best ? 'pv-best' : ''}">${esc(prz(y.pn, v.um))}</span>${y.costo ? `<small class="muted" style="display:block">${esc(e0(y.costo))}</small>` : ''}${y.pkgPg ? `<small class="muted" style="display:block">${esc(nf(y.pkgPg, 2))} €/kg proteina</small>` : ''}`; };
  const rows = K.voci.map(v => { const r = { _v: v, voce: v.nome, qta: N(v.qta) || null, um: v.um, pag: K.rif[v.id].prezzo }; O.forEach(x => { const y = x.r[v.id]; r['o_' + x.o.id] = y && y.pn !== null ? Math.round(y.pn * 10000) / 10000 : null; }); return r; });
  const somma = (l, f, cls = 'bold') => { const r = { _s: l, voce: l, _cls: cls }; O.forEach(x => { r['o_' + x.o.id] = f(x); }); return r; };
  const pagT = K.pagatoTot;
  const conQ = K.voci.filter(v => N(v.qta) > 0).length;
  if (K.comuni.length && K.comuni.length < conQ) { const r = somma(`Costo sui ${K.comuni.length} prodotti in comune`, x => Math.round(x.comuni)); r.pag = K.pagComuni !== null ? Math.round(K.pagComuni) : null; rows.push(r); }
  rows.push(somma("Costo dell'anno", x => x.completa ? Math.round(x.totale) : null, 'tot'));
  rows.push(somma('di cui trasporto', x => x.tr ? Math.round(x.tr) : null));
  rows.push(somma('Pagamento (giorni)', x => x.gg || 0));
  rows.push(somma('Costo riportato a oggi', x => x.completa ? Math.round(x.oggi) : null));
  if (K.contratto && K.contratto.completa) rows.push(somma('Differenza dal contratto', x => x.completa && x !== K.contratto ? Math.round(K.contratto.oggi - x.oggi) : null));
  if (pagT !== null) rows.push(somma('Differenza da quanto pagato', x => x.completa ? Math.round(pagT - x.totale) : null));
  Object.assign(rows.find(r => r._s === "Costo dell'anno"), { pag: pagT !== null ? Math.round(pagT) : null });
  const fmtS = (r, v) => { if (v === null || v === undefined) return '<span class="muted">—</span>'; if (r._s === 'Pagamento (giorni)') return esc(nf(v)); if (/^Differenza/.test(r._s)) return `<span class="${segno(v)}">${v > 0 ? 'risparmi ' : v < 0 ? 'costa in più ' : ''}${esc(e0(Math.abs(v)) || '0 €')}</span>`; return esc(e0(v)); };
  const cols = [{ k: 'voce', h: 'Prodotto', cls: 'w' }, { k: 'qta', h: 'Quantità', fmt: 'num1', html: r => r._s ? '' : r.qta ? esc(nf(r.qta, 1) + ' ' + r.um) : '<span class="t-warn">—</span>' },
    { k: 'pag', h: 'Pagato (fatture)', fmt: 'eur3', html: r => r._s ? (r.pag ? esc(e0(r.pag)) : '') : r.pag === null ? '<span class="muted">—</span>' : esc(prz(r.pag, r.um)) },
    ...O.map(x => ({ k: 'o_' + x.o.id, h: (x.o.ditta || 'Offerta') + (x.o.contratto ? ' (contratto)' : ''), fmt: 'eur3', html: r => r._s ? fmtS(r, r['o_' + x.o.id]) : cell(x, r._v) }))];
  const t = tabella('pvcfr', { title: 'Confronto: ' + (c.titolo || ''), sheet: 'Confronto', cols, rows, sort: false, note: [`Prezzi IVA esclusa, nelle unità di ogni prodotto, con sconto e trasporto per unità già compresi. Costo riportato a oggi con un tasso del ${nf(K.tasso * 100, 1)}% all'anno: chi fa pagare più tardi vale un po' meno.`] });
  return `<section class="card"><div class="card-h"><h2>${ic('scale')}Confronto</h2>${bottoniExport(['pvcfr', 'pvvoci'], 'Confronto ' + (c.titolo || ''))}</div>
  <p class="muted small pad-x">Prezzi IVA esclusa nelle unità del prodotto, con sconti e trasporto per unità già dentro. In verde il prezzo più basso di ogni prodotto. "Costo riportato a oggi" mette alla pari i giorni di pagamento (tasso ${nf(K.tasso * 100, 1)}% all'anno, si cambia in Modifica).</p>${t}</section>`;
}
function avvisiCard(c, K) {
  const A = P.avvisi(c, K); if (!A.length) return '';
  const L = { err: ['circle-alert', 'bad'], warn: ['triangle-alert', 'warn'], info: ['info', ''] };
  return `<section class="card"><div class="card-h"><h2>${ic('list-checks')}Da controllare</h2><span class="count">${A.length}</span></div><div class="alerts">${A.map(a => `<div class="alert ${L[a.liv][1]}"><span class="a-ic">${ic(L[a.liv][0])}</span><span class="a-tx"><b>${esc(a.t)}</b></span></div>`).join('')}</div></section>`;
}

/* ---------------- preventivi e contratti dall'archivio del PC ---------------- */
const usati = () => new Set(P.confronti().flatMap(c => (c.offerte || []).flatMap(o => [o.file && o.file.imp, o.archivio && o.archivio.imp]).filter(Boolean)));
function pcCard(c) {
  const h = `<div class="card-h"><h2>${ic('monitor')}Preventivi e contratti sul PC</h2>`;
  if (!ST.pc) return `<section class="card">${h}<button class="btn sm" data-act="c-pvPc">${ic('scan-search')}Cerca nell'archivio</button></div><p class="muted small pad-x">L'archivio del PC riconosce da solo i preventivi e i contratti di fornitura (anche quelli arrivati per email e salvati in una cartella dell'archivio). Da qui li aggiungi come offerta con un tocco e l'app ne legge il testo. Funziona dal PC con il ponte dell'archivio acceso.</p></section>`;
  const q = t => '/documenti' + AD.qs({ tipo: t, limite: 200 });
  const A = AD.leggi(q('Preventivo')), B = AD.leggi(q('Contratto'));
  let corpo;
  if (A.carico || B.carico) corpo = `<p class="muted small pad-x">Chiedo al ponte dell'archivio…</p>`;
  else if ((A.err && A.err.spento) || (B.err && B.err.spento)) corpo = `<div class="note-box" style="margin:0 18px 16px">${ic('wifi-off')}<span>Il ponte dell'archivio non risponde. Dal PC dell'azienda avvia <i>Archivio - ponte.bat</i> e riprova.</span></div>`;
  else if (A.err || B.err) corpo = `<div class="note-box warn" style="margin:0 18px 16px">${ic('triangle-alert')}<span>${esc((A.err || B.err).message)}</span></div>`;
  else {
    const U = usati(); const y0 = new Date().getFullYear() - 3;
    const docs = [...((A.dati || {}).documenti || []), ...((B.dati || {}).documenti || [])].filter(d => !U.has(d.impronta) && (!d.anno || d.anno >= y0)).sort((a, b) => String(b.data || '').localeCompare(String(a.data || ''))).slice(0, 40);
    corpo = docs.length ? `<p class="muted small pad-x">${docs.length === 1 ? '1 documento' : docs.length + ' documenti'} degli ultimi anni non ancora in un confronto, i più recenti per primi.</p><div class="list flat pad-x">${docs.map(d => `<div class="row static pv-off"><span class="r-icon">${ic(d.tipo === 'Contratto' ? 'handshake' : 'file-text')}</span><span class="r-main"><b>${esc(leggi(d.controparte) || leggi(d.nome))}</b><span>${esc([d.tipo, d.data ? dmy(String(d.data).length === 10 ? d.data : d.data + '-01') : '', leggi(d.descrizione)].filter(Boolean).join(' · '))}</span></span><span class="r-side btns"><button class="btn sm" data-act="c-pvDaPc" data-imp="${esc(d.impronta)}" data-ditta="${esc(leggi(d.controparte))}" data-data="${esc(String(d.data || '').length === 10 ? d.data : '')}" data-tipo="${esc(d.tipo)}" data-nome="${esc(d.nome_file || d.nome || '')}">${ic('plus')}${c ? 'Aggiungi come offerta' : 'Aggiungi a un confronto'}</button><button class="btn sm ghost" data-act="c-pvPcApri" data-imp="${esc(d.impronta)}">${ic('external-link')}Apri</button></span></div>`).join('')}</div>` : `<p class="muted small pad-x">Nessun preventivo o contratto nuovo nell'archivio: quelli che ci sono sono già nei confronti.</p>`;
  }
  return `<section class="card">${h}<button class="btn sm ghost" data-act="c-pvPcRi">${ic('refresh-cw')}Aggiorna</button></div>${corpo}</section>`;
}
const leggi = s => (s ? String(s).replace(/(\d)EUR\b/g, '$1 €').replace(/(?<!\d)-|-(?!\d)/g, ' ').replace(/_/g, ' · ').replace(/\s+/g, ' ').trim() : '');

/* ---------------- moduli ---------------- */
function formConfronto(c) {
  const nuovo = !c;
  openForm({
    title: nuovo ? 'Nuovo confronto' : 'Modifica il confronto', saveLabel: nuovo ? 'Crea' : 'Salva',
    values: c ? Object.assign({}, c, { tasso: c.tasso === undefined || c.tasso === null ? 4 : N(c.tasso) * 100 }) : { genere: 'mangimi', anno: new Date().getFullYear() + 1, tasso: 4, stato: 'aperto' },
    fields: [
      { k: 'titolo', l: 'Che cosa compri', req: true, ph: 'Mangime vacche 2027' },
      { k: 'genere', l: 'Tipo di fornitura', t: 'seg', opts: [['mangimi', 'Mangimi'], ['sementi', 'Sementi'], ['varie', 'Forniture varie']] },
      { k: 'anno', l: 'Anno', t: 'number', half: true },
      { k: 'stato', l: 'Stato', t: 'select', half: true, blank: false, opts: [['aperto', 'Aperto: sto decidendo'], ['deciso', 'Deciso'], ['chiuso', 'Chiuso']] },
      { k: 'tasso', l: 'Valore dei giorni di pagamento', t: 'number', unit: "% all'anno", hint: "Mette alla pari chi ti fa pagare a 30 e chi a 90 giorni: con il 4% pagare 60 giorni più tardi vale lo 0,66% del prezzo. Metti il tasso che paghi sul fido." },
      { k: 'note', l: 'Note', t: 'textarea' },
    ],
    onSave: async v => {
      const o = c ? copia(c) : { id: P.nuovoId(), tipo: 'confronto', creato: today(), voci: [], offerte: [] };
      Object.assign(o, { titolo: v.titolo, genere: v.genere || 'varie', anno: v.anno ? Math.round(v.anno) : null, stato: v.stato || 'aperto', tasso: v.tasso === null ? null : v.tasso / 100, note: v.note || '' });
      await P.salva(o); if (nuovo) UI.f.pv_id = o.id;
    },
    done: nuovo ? 'Confronto creato: aggiungi i prodotti e le offerte' : 'Confronto salvato',
  });
}
const umOpts = () => P.UM_ELENCO.map(k => [k, P.UM_NOMI[k]]);
function formVoce(c, v) {
  const G = P.GENERI[c.genere] || P.GENERI.varie; const nuovo = !v;
  openForm({
    title: nuovo ? 'Nuovo prodotto' : v.nome, saveLabel: 'Salva',
    values: v || { um: G.um },
    fields: [
      { k: 'nome', l: 'Prodotto', req: true, ph: c.genere === 'mangimi' ? 'Farina di mais' : c.genere === 'sementi' ? 'Mais classe 600' : 'Film per insilato' },
      { k: 'um', l: 'Unità per il confronto', t: 'select', blank: false, opts: umOpts(), half: true },
      { k: 'qta', l: "Quantità all'anno", t: 'number', unit: (v && v.um) || G.um, half: true },
      { k: 's1', t: 'section', l: 'Se i prezzi arrivano a sacchi, dosi o confezioni' },
      { k: 'confQ', l: '1 sacco o confezione =', t: 'number', half: true, hint: 'Per esempio 25 per un sacco da 25 kg. Serve solo se le ditte scrivono il prezzo in unità diverse.' },
      { k: 'confUm', l: 'Unità', t: 'select', opts: umOpts(), half: true },
      { k: 'parole', l: 'Parole per trovarlo nelle fatture', hint: "Tutte le parole devono esserci nella riga della fattura (anche come inizio di parola). Più modi di scriverlo separati da virgola: \"farina mais, mais farina\". Vuoto = il nome del prodotto." },
      { k: 'note', l: 'Note', t: 'textarea', ph: 'Caratteristiche richieste (proteina, umidità, classe FAO…)' },
      { k: 'info', t: 'box' },
    ],
    onChange: (k, vv) => { if (k === 'um') setUnit('qta', vv.um); if (['nome', 'parole', 'um', 'confQ', 'confUm', null].includes(k)) suggerimento(vv); },
    onSave: async vv => {
      const o = copia(c); o.voci = o.voci || [];
      const x = Object.assign(v ? o.voci.find(y => y.id === v.id) : { id: P.nuovaVoce() }, { nome: vv.nome, um: vv.um || G.um, qta: vv.qta, confQ: vv.confQ, confUm: vv.confQ ? vv.confUm : '', parole: vv.parole || '', note: vv.note || '' });
      if (!v) o.voci.push(x); await P.salva(o);
    },
    onDelete: v ? async () => { const o = copia(c); o.voci = o.voci.filter(y => y.id !== v.id); (o.offerte || []).forEach(f => { if (f.prezzi) delete f.prezzi[v.id]; }); await P.salva(o); } : null,
    done: 'Prodotto salvato',
  });
}
function suggerimento(vv) {
  const el = document.getElementById('box_info'); if (!el) return;
  if (!vv.nome && !vv.parole) { el.innerHTML = ''; return; }
  const p = P.pagato({ nome: vv.nome, parole: vv.parole, um: vv.um, confQ: vv.confQ, confUm: vv.confUm });
  el.innerHTML = p.righe ? `<div class="note-box">${ic('receipt')}<span>Nelle fatture degli ultimi 12 mesi: <b>${p.righe === 1 ? '1 riga' : p.righe + ' righe'}</b>, ${esc(nf(p.qta, 1) + ' ' + vv.um)} comprati, prezzo medio <b>${esc(prz(p.prezzo, vv.um))}</b>${p.ditte[0] ? ', soprattutto da ' + esc(p.ditte[0].ditta) : ''}.${p.nonConv ? ` ${p.nonConv} righe hanno un'unità che non si converte: scrivi quanto pesa una confezione.` : ''} <button type="button" class="linkbtn" data-act="c-pvQta" data-q="${Math.round(p.qta * 10) / 10}">Usa ${esc(nf(p.qta, 1))} come quantità</button></span></div>`
    : `<p class="muted small">Nessuna riga delle fatture degli ultimi 12 mesi con queste parole.${p.nonConv ? ` (${p.nonConv} con un'unità che non si converte.)` : ''}</p>`;
}
function formOfferta(c, o, contr) {
  const nuovo = !o; const vals = o ? Object.assign({}, o, { contratto: o.contratto ? 'si' : 'no', sconto: N(o.sconto) ? N(o.sconto) * 100 : null, trasporto: o.trasporto || 'incluso' }) : { contratto: contr ? 'si' : 'no', trasporto: 'incluso', data: today() };
  openForm({
    title: nuovo ? (contr ? 'Contratto in corso' : 'Nuova offerta') : (o.ditta || 'Offerta'), saveLabel: 'Salva',
    values: vals,
    fields: [
      { k: 'ditta', l: 'Ditta', req: true, list: ditte() },
      { k: 'contratto', l: 'Che cos\'è', t: 'seg', opts: [['no', 'Preventivo'], ['si', 'Contratto in corso']] },
      { k: 'data', l: 'Data del documento', t: 'date', half: true },
      { k: 'validita', l: "Valida fino al", t: 'date', half: true, show: v => v.contratto !== 'si' },
      { k: 'inizio', l: 'Inizio del contratto', t: 'date', half: true, show: v => v.contratto === 'si' },
      { k: 'fine', l: 'Fine del contratto', t: 'date', half: true, show: v => v.contratto === 'si' },
      { k: 'preavviso', l: 'Preavviso per la disdetta', t: 'number', unit: 'giorni', show: v => v.contratto === 'si', hint: "Se c'è, l'agenda ti ricorda l'ultimo giorno per disdire." },
      { k: 'pagamento', l: 'Pagamento', t: 'number', unit: 'giorni', half: true, hint: '0 = alla consegna' },
      { k: 'sconto', l: 'Sconto su tutto', t: 'number', unit: '%', half: true },
      { k: 'trasporto', l: 'Trasporto', t: 'seg', opts: [['incluso', 'Compreso'], ['unita', 'A parte, per unità'], ['forfait', "A parte, all'anno"]] },
      { k: 'trValore', l: 'Costo del trasporto', t: 'number', unit: '€', half: true, show: v => v.trasporto !== 'incluso' },
      { k: 'trUm', l: 'Per ogni', t: 'select', opts: umOpts(), half: true, show: v => v.trasporto === 'unita' },
      { k: 'condizioni', l: 'Condizioni', t: 'textarea', ph: 'Prezzo bloccato per 6 mesi, poi legato al listino; minimo 20 t; penale se…' },
      { k: 'note', l: 'Note', t: 'textarea' },
    ],
    onSave: async v => {
      const x = copia(c); x.offerte = x.offerte || [];
      const y = o ? x.offerte.find(z => z.id === o.id) : { id: P.nuovaOfferta(), prezzi: {} };
      Object.assign(y, { ditta: v.ditta, contratto: v.contratto === 'si', data: v.data || '', validita: v.validita || '', inizio: v.inizio || '', fine: v.fine || '', preavviso: v.preavviso, pagamento: v.pagamento, sconto: v.sconto ? v.sconto / 100 : null, trasporto: v.trasporto || 'incluso', trValore: v.trValore, trUm: v.trUm || '', condizioni: v.condizioni || '', note: v.note || '' });
      if (!o) x.offerte.push(y);
      await P.salva(x);
      if (!o && (x.voci || []).length) setTimeout(() => formPrezzi(P.confronto(x.id), y.id), 260);
    },
    onDelete: o ? async () => { const x = copia(c); x.offerte = x.offerte.filter(z => z.id !== o.id); if (x.scelta === o.id) x.scelta = null; await P.salva(x); } : null,
    done: 'Offerta salvata',
  });
}
/** Prezzi di un'offerta, uno per prodotto; con `letto` (dalla lettura del documento) i campi vuoti arrivano già compilati. */
function formPrezzi(c, oid, letto = null) {
  const o = (c.offerte || []).find(z => z.id === oid); if (!o) return;
  const voci = c.voci || []; if (!voci.length) return toast('Prima aggiungi i prodotti da confrontare', 'err');
  const mang = c.genere === 'mangimi'; const L = (letto && letto.prezzi) || {};
  const vals = {}; const fields = [];
  if (letto) fields.push({ k: 'letto', t: 'box' });
  for (const v of voci) {
    const p = (o.prezzi || {})[v.id] || {}; const l = L[v.id] || {};
    const has = p.prezzo !== null && p.prezzo !== undefined && p.prezzo !== '';
    // il prezzo appena letto dal documento vince su quello salvato prima (che resta scritto nel suggerimento)
    const usaLetto = l.prezzo !== null && l.prezzo !== undefined;
    vals['p_' + v.id] = usaLetto ? l.prezzo : has ? p.prezzo : null; vals['u_' + v.id] = (usaLetto ? l.um : p.um) || v.um; vals['g_' + v.id] = usaLetto ? (l.pg ?? p.pg ?? null) : (p.pg ?? null);
    const pag = P.pagato(v);
    const hint = [l.testo ? 'Letto: "' + l.testo + '"' : '', usaLetto && has && N(p.prezzo) !== N(l.prezzo) ? `prima ${nf(p.prezzo, 3)} €/${p.um || v.um}` : '', pag.prezzo !== null ? 'pagato in media ' + prz(pag.prezzo, v.um) : ''].filter(Boolean).join(' · ');
    fields.push({ k: 's_' + v.id, t: 'section', l: v.nome + (N(v.qta) ? ` · ${nf(v.qta, 1)} ${v.um} all'anno` : '') });
    fields.push({ k: 'p_' + v.id, l: 'Prezzo IVA esclusa', t: 'number', unit: '€', third: true, hint });
    fields.push({ k: 'u_' + v.id, l: 'per ogni', t: 'select', blank: false, opts: umOpts(), third: true });
    if (mang) fields.push({ k: 'g_' + v.id, l: 'Proteina grezza', t: 'number', unit: '%', third: true });
  }
  openForm({
    title: 'Prezzi · ' + (o.ditta || 'offerta'), saveLabel: 'Salva i prezzi', values: vals, fields,
    onSave: async v => {
      const x = copia(P.confronto(c.id)); const y = x.offerte.find(z => z.id === oid); y.prezzi = y.prezzi || {};
      for (const vc of voci) { const pr = v['p_' + vc.id]; if (pr === null) { delete y.prezzi[vc.id]; continue; } y.prezzi[vc.id] = { prezzo: pr, um: v['u_' + vc.id] || vc.um, pg: mang ? v['g_' + vc.id] : null, testo: (L[vc.id] && L[vc.id].prezzo === pr ? L[vc.id].testo : (y.prezzi[vc.id] || {}).testo) || '' }; }
      if (letto) {
        if (letto.data && !y.data) y.data = letto.data;
        if (letto.validita && !y.validita && !y.contratto) y.validita = letto.validita;
        if (!letto.validita && letto.validitaGg && okD(y.data) && !y.validita && !y.contratto) y.validita = addD(y.data, letto.validitaGg);
        if (letto.pagamento !== null && letto.pagamento !== undefined && (y.pagamento === null || y.pagamento === undefined || y.pagamento === '')) y.pagamento = letto.pagamento;
        if (letto.trasporto && !y.trasporto) y.trasporto = letto.trasporto;
        if (letto.condizioni && !y.condizioni) y.condizioni = letto.condizioni;
      }
      await P.salva(x);
    },
    done: 'Prezzi salvati',
  });
  if (letto) {
    const n = Object.keys(L).length; const extra = [letto.data ? 'data ' + dmy(letto.data) : '', letto.validita ? 'valida fino al ' + dmy(letto.validita) : letto.validitaGg ? `valida ${letto.validitaGg} giorni` : '', letto.pagamento !== null && letto.pagamento !== undefined ? 'pagamento a ' + letto.pagamento + ' giorni' : '', letto.trasporto ? 'trasporto compreso' : ''].filter(Boolean);
    const el = document.getElementById('box_letto');
    if (el) el.innerHTML = `<div class="note-box${n ? '' : ' warn'}">${ic(n ? 'sparkles' : 'triangle-alert')}<span>${n ? `Ho trovato il prezzo di <b>${n === 1 ? '1 prodotto' : n + ' prodotti'}</b> su ${voci.length}: controlla ogni numero e l'unità prima di salvare.` : 'Non ho trovato i prezzi dei prodotti nel testo: scrivili a mano oppure prova con il modello.'}${extra.length ? ' Ho letto anche: ' + esc(extra.join(', ')) + ' (si salvano solo se nell\'offerta mancano).' : ''}${letto.altri && letto.altri.length ? `<br>Altri prodotti nel documento: ${esc(letto.altri.slice(0, 8).map(a => `${a.descrizione} ${a.prezzo} €/${a.um || ''}`).join('; '))}.` : ''}</span></div>`;
  }
}

/* ---------------- prodotti dalle fatture ---------------- */
function apriSug(c) {
  const S_ = ST.sug; S_.L = P.prodottiComprati(c.genere, S_.q).slice(0, 60);
  const giaNomi = new Set((c.voci || []).map(v => String(v.nome).toUpperCase()));
  const rows = S_.L.map((x, i) => `<tr><td class="t"><input type="checkbox" data-act="c-pvSugSel" data-k="${i}"${S_.sel.has(x.k) ? ' checked' : ''}${giaNomi.has(x.descrizione.toUpperCase()) ? ' disabled' : ''} aria-label="Scegli"></td><td class="t">${esc(x.descrizione)}<small class="muted" style="display:block">${esc(x.categoria)}</small></td><td class="t clip">${esc(x.ditte.join(', '))}</td><td class="n">${esc(nf(x.qta, 1) + ' ' + x.um)}</td><td class="n">${esc(e0(x.spesa))}</td><td class="n">${esc(x.prezzo !== null ? prz(x.prezzo, x.um) : '')}</td></tr>`).join('');
  openSheet('Prodotti dalle fatture', `<p class="muted small">Righe delle fatture di acquisto degli ultimi 12 mesi${S_.q ? ` che contengono "${esc(S_.q)}"` : c.genere === 'varie' ? ' (senza mangimi, sementi e investimenti)' : ' di ' + esc((P.GENERI[c.genere] || {}).nome || '')}, raggruppate per descrizione, le più grandi per prime. Spunta quelle da mettere nel confronto: quantità e parole di ricerca arrivano da sole e le cambi dopo.</p>
  <label class="fld"><span class="flabel">Cerca una parola (descrizione o ditta), poi Invio</span><input type="text" data-act="c-pvSugQ" value="${esc(S_.q)}" placeholder="film, rete, ricambi, mais…"></label>
  ${rows ? `<div class="tablewrap etab"><table><thead><tr><th class="t"></th><th class="t">Descrizione</th><th class="t">Ditte</th><th class="n">Quantità</th><th class="n">Spesa</th><th class="n">Prezzo medio</th></tr></thead><tbody>${rows}</tbody></table></div>` : `<p class="muted">Nessuna riga: carica le fatture in Carica documenti oppure aggiungi i prodotti a mano.</p>`}
  <div class="factions"><span class="sp"></span><button class="btn" data-act="close">Annulla</button><button class="btn primary" data-act="c-pvSugAdd"${S_.sel.size ? '' : ' disabled'}>${ic('plus')}Aggiungi ${S_.sel.size === 1 ? '1 prodotto' : S_.sel.size + ' prodotti'}</button></div>`, { wide: true });
}

/* ---------------- lettura del documento ---------------- */
async function testoFile(file) {
  const b = new Uint8Array(await file.arrayBuffer());
  if (!/\.pdf$/i.test(file.name) && !/pdf/.test(file.type)) return { b, testo: new TextDecoder().decode(b) };
  const { leggiPdf, testoPagina } = await import('../conti/pdftext.js');
  const pp = await leggiPdf(b); let testo = pp.map(testoPagina).join('\n');
  if (testo.replace(/\s/g, '').length < 40 * Math.max(1, pp.length)) {
    toast('PDF fatto di immagini: lo leggo con la lettura ottica, ci vuole qualche secondo');
    const { ocrPagine } = await import('../conti/ocr-testo.js'); const oc = await ocrPagine(b);
    testo = oc.map(pg => { const ws = [...pg.words].sort((x, y) => x.top - y.top || x.x0 - y.x0); const L = []; for (const w of ws) { const l = L[L.length - 1]; if (l && Math.abs(l.top - w.top) < 4) l.w.push(w); else L.push({ top: w.top, w: [w] }); } return L.map(l => l.w.sort((x, y) => x.x0 - y.x0).map(w => w.text).join(' ')).join('\n'); }).join('\n');
  }
  return { b, testo };
}
async function caricaFile(c, oid, file) {
  toast('Leggo ' + file.name + '…');
  const { b, testo } = await testoFile(file);
  const OR = await import('../conti/originali.js');
  const imp = await OR.impronta(b); await OR.conserva([{ imp, orig: { nome: file.name, bytes: b, mime: OR.mimeDi(file.name) } }]);
  const x = copia(P.confronto(c.id)); const y = x.offerte.find(z => z.id === oid); if (!y) return;
  y.file = { nome: file.name, imp }; y.testo = String(testo || '').slice(0, 15000);
  await P.salva(x);
  formPrezzi(P.confronto(c.id), oid, P.leggiTesto(y.testo, x.voci || []));
}
async function testoOfferta(o) {
  if (o.testo) return o.testo;
  if (o.archivio && o.archivio.imp) { const d = await AD.aspetta('/documenti/' + o.archivio.imp); const t = (d.testo && d.testo.inizio) || ''; if (!t) throw new Error(d.testo && d.testo.riservato ? 'Il documento è segnato come riservato nell\'archivio: il testo non si legge.' : 'L\'archivio non ha il testo di questo documento (forse è una foto non ancora letta).'); return t; }
  throw new Error('Carica prima il PDF del preventivo');
}
async function sceltaLettura(c, o) {
  const { llmLocale } = await import('../conti/importa.js'); const { aiConfig } = await import('../nlp.js');
  const loc = llmLocale(), ai = aiConfig();
  openSheet('Leggi i prezzi', `<p class="muted small">${esc(o.ditta || '')}: l'app cerca nel testo del documento i prodotti del confronto e propone i prezzi. Tu li controlli prima di salvare.</p>
  <div class="list flat"><button class="row" data-act="c-pvLeggiCon" data-o="${esc(o.id)}" data-m="auto"><span class="r-icon">${ic('scan-search')}</span><span class="r-main"><b>Leggi da solo</b><span>Subito, sul dispositivo. Va bene per i preventivi scritti a righe ordinate.</span></span></button>
  <button class="row" data-act="c-pvLeggiCon" data-o="${esc(o.id)}" data-m="locale"${loc ? '' : ' disabled'}><span class="r-icon">${ic('monitor')}</span><span class="r-main"><b>Con il modello sul PC</b><span>${loc ? 'Più preciso con i preventivi scritti a modo loro. Il testo resta sul PC.' : 'Da collegare in Conti → Regole delle categorie (modello sul PC).'}</span></span></button>
  <button class="row" data-act="c-pvLeggiCon" data-o="${esc(o.id)}" data-m="claude"${ai && ai.key ? '' : ' disabled'}><span class="r-icon">${ic('sparkles')}</span><span class="r-main"><b>Con Claude</b><span>${ai && ai.key ? 'Il testo del documento (con i prezzi) va ad Anthropic per la lettura.' : 'Serve la chiave in La mia azienda.'}</span></span></button></div>
  <div class="factions"><span class="sp"></span><button class="btn" data-act="close">Chiudi</button></div>`);
}
async function leggiCon(c, oid, modo, b) {
  const o = (c.offerte || []).find(z => z.id === oid); if (!o) return;
  if (b) { b.disabled = true; b.querySelector('b').textContent = 'Leggo…'; }
  try {
    const testo = await testoOfferta(o);
    if (!o.testo) { const x = copia(c); x.offerte.find(z => z.id === oid).testo = String(testo).slice(0, 15000); await P.salva(x); }
    let letto;
    if (modo === 'auto') letto = P.leggiTesto(testo, c.voci || []);
    else {
      const { chiediModello } = await import('../conti/importa.js'); const q = P.domandaModello(testo, c.voci || []);
      letto = P.rispostaModello(await chiediModello(modo, q.sys, q.user), c.voci || []);
    }
    closeSheet(); setTimeout(() => formPrezzi(P.confronto(c.id), oid, letto), 240);
  } catch (e) { toast(e.message || 'Lettura non riuscita', 'err'); if (b) { b.disabled = false; } }
}

/* ---------------- azioni ---------------- */
export async function preventiviAct(a, b, d, rerender) {
  const c = corrente();
  switch (a) {
    case 'c-pvNuovo': return formConfronto(null);
    case 'c-pvApri': UI.f.pv_id = d.id; rerender(); return window.scrollTo(0, 0);
    case 'c-pvLista': UI.f.pv_id = ''; rerender(); return window.scrollTo(0, 0);
    case 'c-pvModC': return c && formConfronto(c);
    case 'c-pvDelC': return c && arm(b, 'Conferma: elimina il confronto', async () => { const { remove } = await import('../store.js'); await remove('econfig', c.id); UI.f.pv_id = ''; toast('Confronto eliminato (i documenti restano)'); rerender(); });
    case 'c-pvVoce': return c && formVoce(c, d.v ? (c.voci || []).find(v => v.id === d.v) : null);
    case 'c-pvQta': { const el = document.getElementById('f_qta'); if (el) el.value = String(d.q).replace('.', ','); return; }
    case 'c-pvOff': return c && formOfferta(c, d.o ? (c.offerte || []).find(o => o.id === d.o) : null, !!d.contr);
    case 'c-pvPrezzi': return c && formPrezzi(c, d.o);
    case 'c-pvScegli': { if (!c) return; const x = copia(c); x.scelta = d.o; x.stato = 'deciso'; await P.salva(x); return toast('Offerta scelta: confronto segnato come deciso'); }
    case 'c-pvLeggi': { const o = c && (c.offerte || []).find(z => z.id === d.o); return o && sceltaLettura(c, o); }
    case 'c-pvLeggiCon': return c && leggiCon(c, d.o, d.m, b);
    case 'c-pvSug': if (!c) return; ST.sug.sel.clear(); ST.sug.q = ''; return apriSug(c);
    case 'c-pvSugAdd': {
      if (!c) return; const G = P.GENERI[c.genere] || P.GENERI.varie; const x = copia(c); x.voci = x.voci || [];
      const scelte = ST.sug.L.filter(y => ST.sug.sel.has(y.k));
      for (const y of scelte) x.voci.push({ id: P.nuovaVoce(), nome: y.descrizione.charAt(0) + y.descrizione.slice(1).toLowerCase(), um: P.UM_NOMI[y.um] ? y.um : G.um, qta: y.qta ? Math.round(y.qta * 10) / 10 : null, parole: P.paroleDa(y.descrizione), note: '' });
      await P.salva(x); ST.sug.sel.clear(); closeSheet(); return toast(scelte.length === 1 ? 'Aggiunto 1 prodotto: controlla quantità e parole' : `Aggiunti ${scelte.length} prodotti: controlla quantità e parole`);
    }
    case 'c-pvPc': ST.pc = true; return rerender();
    case 'c-pvPcRi': AD.svuota(); ST.pc = true; return rerender();
    case 'c-pvPcApri': try { await AD.apri(d.imp); } catch (e) { toast(e.message, 'err'); } return;
    case 'c-pvDaPc': {
      const off = { id: P.nuovaOfferta(), ditta: d.ditta || '', data: d.data || '', contratto: d.tipo === 'Contratto', trasporto: 'incluso', prezzi: {}, archivio: { imp: d.imp, nome: d.nome || '' } };
      if (c) { const x = copia(c); x.offerte = x.offerte || []; x.offerte.push(off); await P.salva(x); toast('Offerta aggiunta: ora leggi i prezzi'); return sceltaLettura(P.confronto(c.id), off); }
      const L = P.confronti().filter(z => !z.stato || z.stato === 'aperto');
      ST.daPc = off;
      return openSheet('Aggiungi a un confronto', `<p class="muted small">${esc(d.ditta || d.nome || 'Documento')}: scegli il confronto, oppure creane uno nuovo.</p><div class="list flat">${L.map(z => `<button class="row" data-act="c-pvDaPcIn" data-id="${esc(z.id)}"><span class="r-icon">${ic((P.GENERI[z.genere] || P.GENERI.varie).icn)}</span><span class="r-main"><b>${esc(z.titolo)}</b><span>${(z.offerte || []).length} offerte</span></span></button>`).join('')}<button class="row" data-act="c-pvDaPcIn" data-id=""><span class="r-icon">${ic('plus')}</span><span class="r-main"><b>Nuovo confronto</b><span>Poi aggiungi i prodotti e leggi i prezzi</span></span></button></div><div class="factions"><span class="sp"></span><button class="btn" data-act="close">Annulla</button></div>`);
    }
    case 'c-pvDaPcIn': {
      const off = ST.daPc; if (!off) return; ST.daPc = null;
      let x = d.id ? copia(P.confronto(d.id)) : { id: P.nuovoId(), tipo: 'confronto', creato: today(), titolo: 'Preventivi ' + (off.ditta || ''), genere: 'varie', stato: 'aperto', voci: [], offerte: [] };
      x.offerte = x.offerte || []; x.offerte.push(off); await P.salva(x); UI.f.pv_id = x.id; closeSheet(); rerender(); window.scrollTo(0, 0);
      return toast(d.id ? 'Offerta aggiunta al confronto' : 'Confronto creato: cambia nome e tipo con Modifica, poi aggiungi i prodotti');
    }
  }
}
export async function preventiviChange(t, rerender) {
  const a = t.dataset.act; const c = corrente();
  if (a === 'c-pvFile' && t.files && t.files.length) { const f = t.files[0]; t.value = ''; if (!c) return; try { await caricaFile(c, t.dataset.o, f); } catch (e) { toast(e.message || 'Non sono riuscito a leggere il file', 'err'); } return; }
  if (a === 'c-pvSugSel') { const x = ST.sug.L[+t.dataset.k]; if (!x) return; if (t.checked) ST.sug.sel.add(x.k); else ST.sug.sel.delete(x.k); const btn = document.querySelector('[data-act="c-pvSugAdd"]'); if (btn) { btn.disabled = !ST.sug.sel.size; btn.lastChild.textContent = `Aggiungi ${ST.sug.sel.size === 1 ? '1 prodotto' : ST.sug.sel.size + ' prodotti'}`; } return; }
  if (a === 'c-pvSugQ') { ST.sug.q = t.value.trim(); return c && apriSug(c); }
}
/** Scadenze vicine per la Panoramica dei Conti: disdette e fine dei contratti nei prossimi 45 giorni. */
export function scadenzeVicine() { const T = today(); return P.scadenze().filter(x => x.tipo !== 'validita' && x.data >= T && diff(T, x.data) <= 45); }
