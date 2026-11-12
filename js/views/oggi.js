// Dashboard: pianta aziendale, colture, attività, avanzamento, note, magazzino (Campagna) o mandria e latte (Stalla)
import { S, D, UI, azienda, get } from '../state.js';
import { esc, nf, eur, fd, fdShort, fdLong, today, sum, byDate, N, plural, yearOf, diff, okD, addDays } from '../util.js';
import { ic } from '../icons.js';
import { allAlerts, campoHa, capoI, giac, cropColor, cropColorName, cropOf, opCosto, mezzoOre, mezzoTagliando } from '../domain.js';
import { isTrattore, compDi, stato } from '../trattori.js';
import { farmSvg, thumb, satSvg } from '../geo.js';
import { getMeteo, wmo } from '../meteo.js';
import { latteChart, spark, donut, columns } from './charts.js';
import { empty, newBtn, chip } from '../ui.js';
import { canInstall } from '../install.js';
import { capoRow } from './stalla.js';
import { indici, siloInfo, capiIn } from '../herd.js';
import { agendaCard, registroCard } from '../agenda.js';
import { caldoCard } from '../caldo.js';
import { exChip } from '../ui.js';

const AREA = { stalla: ['cow', 'Stalla'], magazzino: ['package', 'Magazzino'], mezzi: ['tractor', 'Mezzi'], campi: ['sprout', 'Campi'], latte: ['milk', 'Latte'], dati: ['history', 'Dati'] };
const NOTE_COL = { verde: '#4FA05A', giallo: '#E0B12E', rossa: '#D2553C', blu: '#3D7DC0' };

function alertsCard(filter, title = 'Da fare') {
  const al = allAlerts().filter(filter);
  return `<section class="card"><div class="card-h"><h2>${ic('triangle-alert')}${title}</h2><span class="count">${al.length}</span></div>
  <div class="alerts">${al.length ? al.slice(0, 10).map(x => { const [ai] = AREA[x.area] || ['info']; return `<button class="alert ${x.lv}" data-act="go" data-go='${esc(JSON.stringify(x.go))}'><span class="a-ic">${ic(ai)}</span><span class="a-tx"><b>${esc(x.t)}</b><span>${esc(x.s)}</span></span>${ic('chevron-right', 'chev')}</button>`; }).join('') + (al.length > 10 ? `<p class="more">e altre ${al.length - 10} segnalazioni</p>` : '') : `<div class="allgood">${ic('circle-check', 'big')}<b>Tutto in regola</b><span>Nessuna scadenza o intervento in sospeso.</span></div>`}</div></section>`;
}
export function saluto() {
  const h = new Date().getHours(); const T = today();
  const s = h < 5 ? 'Buonanotte' : h < 13 ? 'Buongiorno' : h < 18 ? 'Buon pomeriggio' : 'Buonasera';
  const g = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'][new Date().getDay()];
  return `<div class="greet"><h2>${s}</h2><span>${g} ${fdLong(T)}</span></div>`;
}
function meteoMini() {
  const { data } = getMeteo(); if (!data) return '';
  const c = data.current, d = data.daily; const [icn] = wmo(c.weather_code);
  return `<button class="hero-meteo" data-act="nav" data-tab="meteo">${ic(icn)}<b>${Math.round(c.temperature_2m)}°</b><span>${ic('thermometer')}${Math.round(d.temperature_2m_min[0])}° / ${Math.round(d.temperature_2m_max[0])}°</span><span>${ic('droplets')}${nf(d.precipitation_sum[0], 1)} mm</span></button>`;
}

// Confronto con il periodo prima: verde se va meglio, rosso se va peggio (per i costi salire è male)
function confronto(cur, prev, testo, salireBene = true) {
  if (!(prev > 0)) return '';
  const p = (cur - prev) / prev * 100, a = Math.abs(p);
  if (a < 0.5) return `<span class="k-cmp"><span class="d">=</span>${esc(testo)}</span>`;
  const bene = p > 0 === salireBene;
  return `<span class="k-cmp"><span class="d ${bene ? 'ok' : 'bad'}">${p > 0 ? '▲' : '▼'} ${nf(a, a < 10 ? 1 : 0)}%</span>${esc(testo)}</span>`;
}
// Periodo di confronto: l'anno prima fino allo stesso giorno, oppure l'anno intero se si guarda un'annata passata
function annoPrima(Y) {
  const T = today(), oggiY = +T.slice(0, 4);
  if (Y > oggiY) return null;
  const lim = Y === oggiY ? T.slice(5) : '12-31';
  return { dentro: d => !!d && +d.slice(0, 4) === Y - 1 && d.slice(5) <= lim, testo: Y === oggiY ? `sul ${Y - 1} alla stessa data` : `sul ${Y - 1}`, mese: Y === oggiY ? +T.slice(5, 7) - 1 : 11, oggiY };
}
// Colonne per mese: mesi passati grigi, quello in corso blu, quelli che devono ancora venire tratteggiati
function colonneMesi(valori, cur) {
  const mx = Math.max(...valori) || 1;
  return `<span class="k-mesi" aria-hidden="true">${valori.map((v, i) => `<i class="${i === cur ? 'cur' : i > cur ? 'fut' : ''}" style="height:${i > cur ? 0 : Math.max(6, v / mx * 100)}%"></i>`).join('')}</span>`;
}

// Mezzi con qualcosa in scadenza: cosa, fra quanto e una barra che si riempie
function scadenzeMezzo(m) {
  const T = today(), ore = mezzoOre(m), out = [];
  if (isTrattore(m)) compDi(m).forEach(c => {
    const s = stato(m, c.id, ore); if (s.lv !== 'bad' && s.lv !== 'warn') return;
    let pct = 0, q = '';
    if (s.restOre !== null && (s.restGg === null || s.restOre / Math.max(1, s.iv.ore) <= s.restGg / Math.max(1, s.iv.mesi * 30))) { pct = (ore - s.u.ore) / s.iv.ore * 100; q = s.restOre < 0 ? 'superato di ' + nf(-s.restOre, 0) + ' h' : 'tra ' + nf(s.restOre, 0) + ' h'; }
    else if (s.restGg !== null) { pct = 100 - s.restGg / (s.iv.mesi * 30) * 100; q = quandoGg(s.restGg); }
    out.push({ t: c.nome, q, pct, lv: s.lv });
  });
  else { const t = mezzoTagliando(m); if (t) { const r = t.prossimo - ore; const iv = t.prossimo - t.ult; if (r <= Math.max(25, iv * 0.1)) out.push({ t: 'Tagliando', q: r < 0 ? 'superato di ' + nf(-r, 0) + ' h' : 'tra ' + nf(r, 0) + ' h', pct: (ore - t.ult) / iv * 100, lv: r < 0 ? 'bad' : 'warn' }); } }
  [['scadenzaRevisione', 'Revisione', 30], ['scadenzaAssicurazione', 'Assicurazione', 30], ['controlloFunzionale', 'Controllo funzionale', 60]].forEach(([k, l, g]) => { if (!okD(m[k])) return; const d = diff(T, m[k]); if (d <= g) out.push({ t: l, q: quandoGg(d), pct: d < 0 ? 100 : 100 - d / g * 100, lv: d < 0 ? 'bad' : 'warn' }); });
  (m.scadenze || []).forEach(x => { if (!okD(x.data)) return; const d = diff(T, x.data); if (d <= 30) out.push({ t: x.titolo || 'Scadenza', q: quandoGg(d), pct: d < 0 ? 100 : 100 - d / 30 * 100, lv: d < 0 ? 'bad' : 'warn' }); });
  return out.sort((a, b) => (b.lv === 'bad') - (a.lv === 'bad') || b.pct - a.pct);
}
// media dei litri registrati fra due date (giorni senza registrazione esclusi)
function media(L, da, a) { const v = L.filter(l => l.data >= da && l.data <= a && N(l.litri) > 0).map(l => N(l.litri)); return v.length ? v.reduce((x, y) => x + y, 0) / v.length : 0; }
function quandoGg(d) { return d < 0 ? (d === -1 ? 'scaduta ieri' : 'scaduta da ' + -d + ' giorni') : d === 0 ? 'oggi' : d === 1 ? 'domani' : d < 21 ? 'tra ' + d + ' giorni' : d < 60 ? 'tra ' + Math.round(d / 7) + ' settimane' : 'tra ' + Math.round(d / 30) + ' mesi'; }
function mezziCard() {
  if (!S.mezzi.length) return '';
  const lista = S.mezzi.map(m => ({ m, sc: scadenzeMezzo(m) })).filter(x => x.sc.length).sort((a, b) => (b.sc[0].lv === 'bad') - (a.sc[0].lv === 'bad') || b.sc[0].pct - a.sc[0].pct);
  const urg = lista.filter(x => x.sc.some(s => s.lv === 'bad')).length, ok = S.mezzi.length - lista.length;
  const head = `<div class="card-h"><h2>${ic('tractor')}Mezzi</h2>${lista.length ? `<span class="count">${[urg ? plural(urg, 'urgente', 'urgenti') : '', lista.length - urg ? (lista.length - urg) + ' in scadenza' : ''].filter(Boolean).join(' · ')}</span>` : ''}<button class="btn sm ghost" data-act="nav" data-tab="mezzi">Vedi tutti</button></div>`;
  if (!lista.length) return `<section class="card mz-card">${head}<p class="mz-tutti">${ic('circle-check')}${S.mezzi.length === 1 ? 'Il mezzo è in regola' : `Tutti i ${S.mezzi.length} mezzi sono in regola`}</p></section>`;
  return `<section class="card flush mz-card">${head}<div class="mz">${lista.slice(0, 6).map(({ m, sc }) => { const ore = mezzoOre(m); return `<button class="mz-c" data-act="open" data-type="mezzo" data-id="${m.id}"><span class="mz-top"><span class="r-icon">${ic(m.tipo === 'Irroratrice' ? 'droplets' : m.tipo === 'Rimorchio' ? 'truck' : 'tractor')}</span><span><b>${esc(m.nome)}</b><small>${esc([m.tipo, m.modello !== m.nome ? m.modello : '', m.anno].filter(Boolean).join(' · '))}</small></span></span>${ore ? `<span class="mz-ore"><b>${nf(ore, 0)}</b> h motore</span>` : ''}<span class="mz-next">${sc.slice(0, 2).map(s => `<span class="mz-l ${s.lv}"><b>${esc(s.t)}</b><span>${esc(s.q)}</span></span><span class="mz-bar"><i class="${s.lv}" style="width:${Math.max(4, Math.min(100, s.pct))}%"></i></span>`).join('')}${sc.length > 2 ? `<small class="muted">e altre ${sc.length - 2}</small>` : ''}</span></button>`; }).join('')}</div>${ok || lista.length > 6 ? `<p class="mz-tutti">${ic('circle-check')}${[lista.length > 6 ? 'altri ' + (lista.length - 6) + ' in scadenza nella pagina Mezzi' : '', ok ? (ok === 1 ? '1 mezzo in regola' : ok + ' mezzi in regola') : ''].filter(Boolean).join(' · ')}</p>` : ''}</section>`;
}

export function render() {
  if (UI.area === 'stalla') return stalla();
  const a = azienda(); const T = today(); const Y = UI.anno;
  const nothing = !S.campi.length && !S.capi.length && !S.prodotti.length && !S.mezzi.length;
  if (nothing) return { title: 'Dashboard', html: `<section class="card welcome"><div class="wl-art">${ic('sprout', 'huge')}</div><div class="wl-body"><span class="eyebrow">Primo avvio</span><h2>Mettiamo in ordine l'azienda</h2><p>Disegna i campi sulla mappa con il catasto sotto gli occhi, poi registra le attività: quaderno di campagna, magazzino e costi si collegano da soli. Dal menu passi alla Stalla per mandria e latte.</p><div class="btns"><button class="btn action" data-act="nav" data-tab="mappa">${ic('map')}Disegna il primo campo</button><button class="btn ghost" data-act="loadExamples">Prova con dati di esempio</button></div></div></section>${canInstall() ? `<button class="btn" data-act="install">${ic('smartphone')}Installa l'app sul telefono</button>` : ''}` };

  const ha = sum(S.campi, campoHa); const totHa = N(a.ettari) || 0;
  const crops = new Map(); S.campi.forEach(c => { const k = cropOf(c, Y) || 'Senza coltura'; crops.set(k, (crops.get(k) || 0) + campoHa(c)); });
  const parts = [...crops.entries()].sort((x, y) => y[1] - x[1]);
  const svg = satSvg(S.campi.map(c => ({ geom: c.geom, color: cropColor(c, Y), title: c.nome })), 900, 360, { fill: .45, stroke: 2, fit: .5 });
  const done = S.operazioni.filter(o => o.stato !== 'Pianificata').sort(byDate).reverse().slice(0, 5);
  const plan = S.operazioni.filter(o => o.stato === 'Pianificata').sort(byDate).slice(0, 4);
  const note = [...S.note].sort(byDate).reverse().slice(0, 6);
  const mov = [...S.movimenti].sort(byDate).reverse().slice(0, 3);
  // avanzamento per coltura: campi seminati e raccolti nell'annata
  const prod = parts.filter(([k]) => k !== 'Senza coltura').slice(0, 6).map(([k, v]) => {
    const cs = S.campi.filter(c => cropOf(c, Y) === k);
    const sem = cs.filter(c => S.operazioni.some(o => o.campoId === c.id && o.stato !== 'Pianificata' && yearOf(o.data) === Y && /Semina/.test(o.tipo || '')) || (c.colture || []).some(e => +e.anno === Y && e.semina));
    const rac = cs.filter(c => S.operazioni.some(o => o.campoId === c.id && o.stato !== 'Pianificata' && yearOf(o.data) === Y && /Raccolta|Sfalcio/.test(o.tipo || '')));
    return { k, v, n: cs.length, sem: cs.length ? sem.length / cs.length * 100 : 0, rac: cs.length ? rac.length / cs.length * 100 : 0 };
  });

  const doneY = S.operazioni.filter(o => o.stato !== 'Pianificata' && yearOf(o.data) === Y);
  const costoY = doneY.reduce((t, o) => t + opCosto(o).tot, 0);
  const haLav = doneY.reduce((t, o) => { const c = get('campi', o.campoId); return t + (c ? campoHa(c) : 0); }, 0);
  const alC = allAlerts().filter(x => x.area !== 'stalla' && x.area !== 'latte');
  const urg = alC.filter(x => x.lv === 'bad').length, att = alC.filter(x => x.lv === 'warn').length;
  const daFare = S.operazioni.filter(o => o.stato === 'Pianificata').length;
  // confronto con l'anno prima e attività per mese
  const AP = annoPrima(Y);
  const doneP = AP ? S.operazioni.filter(o => o.stato !== 'Pianificata' && AP.dentro(o.data)) : [];
  const costoP = doneP.reduce((t, o) => t + opCosto(o).tot, 0);
  const perMese = Array(12).fill(0); doneY.forEach(o => { const m = +String(o.data).slice(5, 7) - 1; if (m >= 0 && m < 12) perMese[m]++; });
  const primoUrg = alC.find(x => x.lv === 'bad');
  return { title: 'Dashboard', html: `
  ${saluto()}
  <section class="hero-map" data-act="nav" data-tab="mappa" role="button" tabindex="0" aria-label="Apri la mappa">
    ${svg || `<div class="hero-empty">${ic('map', 'big')}<span>Disegna i campi sulla mappa per vedere qui la pianta dell'azienda</span></div>`}
    <div class="hm-top"><div><b>${esc(a.nome || 'La tua azienda')}</b><span>${nf(ha, 2)} ha${totHa ? ' su ' + nf(totHa, 2) + ' ha' : ''} · ${plural(S.campi.length, 'campo', 'campi')}</span>${totHa ? `<span class="hm-bar"><i style="width:${Math.min(100, ha / totHa * 100)}%"></i></span>` : ''}</div>${meteoMini()}</div>
    <div class="crop-chips over">${parts.map(([k, v]) => `<span style="--c:${cropColorName(k === 'Senza coltura' ? '' : k)}">${esc(k)} <b>${nf(ha ? v / ha * 100 : 0, 0)}%</b></span>`).join('')}</div>
  </section>
  <div class="kpis">
    <button class="kpi" data-act="nav" data-tab="campi" data-sub="elenco"><span class="k-l">${ic('sprout')}Superficie</span><span class="k-v">${nf(ha, 1)}<small>ha</small></span><span class="k-s">${plural(S.campi.length, 'campo', 'campi')} · ${plural(parts.filter(([k]) => k !== 'Senza coltura').length, 'coltura', 'colture')}</span><span class="k-bar">${parts.map(([k, v]) => `<i style="flex:${v};background:${cropColorName(k === 'Senza coltura' ? '' : k)}"></i>`).join('')}</span></button>
    <button class="kpi" data-act="nav" data-tab="attivita"><span class="k-l">${ic('notebook-pen')}Attività ${Y}</span><span class="k-v">${doneY.length}<small>fatte</small></span>${AP ? confronto(doneY.length, doneP.length, AP.testo) : ''}<span class="k-s">${nf(haLav, 0)} ha lavorati · ${daFare} da fare</span>${doneY.length && AP ? colonneMesi(perMese, AP.mese) : ''}</button>
    ${costoY || !AP ? `<button class="kpi" data-act="nav" data-tab="campi" data-sub="costi"><span class="k-l">${ic('euro')}Costi ${Y}</span><span class="k-v sm">${eur(costoY)}</span>${AP ? confronto(costoY, costoP, AP.testo, false) : ''}<span class="k-s">${ha ? eur(costoY / ha) + ' per ettaro' : 'prodotti, mezzi e lavori'}</span></button>`
      : `<button class="kpi zero" data-act="nav" data-tab="campi" data-sub="costi"><span class="k-l">${ic('euro')}Costi ${Y}</span><span class="k-v">Ancora niente</span><span class="k-s">${costoP ? `nel ${Y - 1}${Y === AP.oggiY ? ' alla stessa data' : ''}: <b class="num">${eur(costoP)}</b>` : 'prodotti, mezzi e lavori'}</span></button>`}
    <button class="kpi" data-act="scrollTo" data-target="avvisi"><span class="k-l">${ic('triangle-alert')}Avvisi</span><span class="k-v ${urg ? 't-bad' : att ? 't-warn' : 't-ok'}">${alC.length}</span><span class="k-s">${urg ? `<b class="t-bad">${plural(urg, 'urgente', 'urgenti')}</b> · ${esc(primoUrg.t)}` : alC.length ? [att ? att + ' da controllare' : '', alC.length - att ? plural(alC.length - att, 'informazione', 'informazioni') : ''].filter(Boolean).join(' · ') : 'tutto in regola'}</span></button>
  </div>
  ${canInstall() ? `<button class="install-strip" data-act="install">${ic('smartphone')}<span><b>Installa Campo e Stalla sul telefono</b><small>Si apre dalla schermata Home e funziona anche senza rete</small></span>${ic('chevron-right')}</button>` : ''}
  <div class="grid-2 dash">
    <div class="col">
      <div class="o1">${agendaCard('campagna')}</div>
      <section class="card o4"><div class="card-h"><h2>${ic('notebook-pen')}Ultime attività</h2><button class="btn sm ghost" data-act="nav" data-tab="attivita">Vedi tutte</button></div>
        <div class="list">${done.length ? done.map(opRow).join('') : empty('notebook-pen', 'Nessuna attività', 'Registra semine, trattamenti, raccolte.', newBtn('operazioni', 'Nuova attività', '', 'action'))}</div></section>
      <section class="card o6"><div class="card-h"><h2>${ic('warehouse')}Movimenti magazzino</h2><button class="btn sm ghost" data-act="nav" data-tab="magazzino" data-sub="movimenti">Vedi tutti</button></div><div class="list">${mov.length ? mov.map(m => { const p = get('prodotti', m.prodottoId); const out = m.tipo === 'Scarico'; return `<button class="row" data-act="open" data-type="prodotto" data-id="${m.prodottoId}"><span class="r-icon ${out ? 'out' : 'in'}">${ic(out ? 'upload' : 'download')}</span><span class="r-main"><b>${esc(p ? p.nome : '—')}</b><span>${out ? 'Scarico' : 'Carico'} · ${fd(m.data)}</span></span><span class="chip ${out ? 'bad' : 'ok'} num">${out ? '−' : '+'}${nf(m.quantita, 1)} ${esc(p ? p.unita || '' : '')}</span></button>`; }).join('') : '<div class="empty slim">Nessun movimento.</div>'}</div></section>
    </div>
    <div class="col">
      <div id="avvisi" class="o2">${alertsCard(x => x.area !== 'stalla' && x.area !== 'latte', 'Avvisi')}</div>
      ${(() => { const mz = mezziCard(); return mz ? `<div class="o2">${mz}</div>` : ''; })()}
      <div class="o3">${registroCard(Y)}</div>
      <section class="card o5"><div class="card-h"><h2>${ic('chart-column')}Colture ${Y}</h2><span class="muted small">ettari</span></div>${parts.length ? `<div class="chartbox">${columns(parts.map(([k, v]) => ({ label: k, v, color: cropColorName(k === 'Senza coltura' ? '' : k) })))}</div>` : empty('chart-column', 'Nessuna coltura', 'Aggiungi la coltura dell\'annata ai tuoi campi.')}
      ${prod.length ? `<div class="prog-list"><div class="pl-h"><span></span><span>Semina</span><span>Raccolta</span></div>${prod.map(p => `<div class="pl-row" style="--c:${cropColorName(p.k)}"><span class="pl-n"><i class="dot"></i><b>${esc(p.k)}</b><small>${nf(p.v, 2)} ha · ${plural(p.n, 'campo', 'campi')}</small></span>${progBar(p.sem)}${progBar(p.rac, true)}</div>`).join('')}</div>` : ''}</section>
      <section class="card o7"><div class="card-h"><h2>${ic('pencil')}Note</h2><button class="btn sm ghost" data-act="nav" data-tab="note">Vedi tutte</button></div>${note.length ? `<div class="note-strip">${note.map(noteCard).join('')}</div>` : empty('pencil', 'Nessuna nota', 'Osservazioni, misure e promemoria, anche legati a un campo.', newBtn('note', 'Nuova nota', '', ''))}</section>
    </div>
  </div>` };
}
const progBar = (pct, alt = false) => `<span class="pl-bar${alt ? ' alt' : ''}" title="${nf(pct, 0)}%"><i style="width:${Math.max(0, Math.min(100, pct))}%"></i><b class="num">${nf(pct, 0)}%</b></span>`;

export function noteCard(n) {
  const c = get('campi', n.campoId);
  return `<button class="note-card" data-act="edit" data-form="note" data-id="${n.id}" style="--c:${NOTE_COL[n.colore] || 'var(--line-2)'}"><b>${esc(n.titolo || 'Nota')}</b><small>${fd(n.data)}${c ? ' · ' + esc(c.nome) : ''}</small><p>${esc((n.testo || '').slice(0, 180))}</p>${n.esempio ? '<span class="chip ghost">Esempio</span>' : ''}</button>`;
}

export function opRow(o) {
  const c = get('campi', o.campoId), p = get('prodotti', o.prodottoId), k = opCosto(o); const pl = o.stato === 'Pianificata';
  const col = c ? cropColor(c, yearOf(o.data) || UI.anno) : 'var(--muted)';
  const late = pl && o.data < today();
  const meta = [c ? nf(campoHa(c), 2) + ' ha' : '', !pl && k.tot ? eur(k.tot) : '', o.operatore ? esc(o.operatore) : ''].filter(Boolean);
  return `<div class="row op${pl ? ' plan' : ''}${late ? ' late' : ''}" data-act="edit" data-form="operazioni" data-id="${o.id}" role="button" tabindex="0"><span class="op-thumb" style="color:${col}">${c ? thumb(c.geom, 40, col) : ''}</span><span class="r-main"><b>${esc(c ? c.nome : 'campo eliminato')}${o.gruppo ? ' <span class="chip ghost">gruppo</span>' : ''}${exChip(o)}</b><span class="op-type">${esc(o.tipo || 'Operazione')}${p ? ' · ' + esc(p.nome) + ' ' + nf(o.quantita, 2) + ' ' + esc(p.unita || '') : ''}${o.avversita ? ' · ' + esc(o.avversita) : ''}</span><span class="op-crop"><i class="dot" style="background:${col}"></i>${esc(c ? cropOf(c, yearOf(o.data)) || 'Nessuna coltura' : '')}${meta.length ? '<span class="op-meta num">' + meta.join(' · ') + '</span>' : ''}</span></span><span class="r-side"><span class="op-date">${fd(o.data)}</span>${pl ? `<span class="chip ${late ? 'bad' : 'warn'}">${late ? 'In ritardo' : 'Da fare'}</span><button class="btn xs" data-act="done" data-id="${o.id}">${ic('check')}Fatta</button>` : `<span class="chip ok">${ic('check')}Fatto</span>`}</span></div>`;
}

function stalla() {
  const T = today();
  const attivi = S.capi.filter(c => capoI(c).stato !== 'Uscita');
  if (!S.capi.length) return { title: 'Stalla', html: `<section class="card welcome"><div class="wl-art">${ic('cow', 'huge')}</div><div class="wl-body"><span class="eyebrow">Stalla</span><h2>Registro di stalla e latte</h2><p>Inserisci i capi con matricola e data di nascita: lattazioni, gravidanze, asciutte e sospensioni dei farmaci si calcolano dagli eventi che registri.</p><div class="btns">${newBtn('capi', 'Aggiungi il primo capo', '', 'action')}<button class="btn ghost" data-act="loadExamples">Prova con dati di esempio</button></div></div></section>` };
  const by = s => attivi.filter(c => capoI(c).stato === s).length;
  const L = D.latte; const ul = L[L.length - 1];
  const last14 = []; for (let i = 13; i >= 0; i--) { const d = new Date(Date.parse(T) - i * 864e5).toISOString().slice(0, 10); const r = L.find(l => l.data === d); last14.push(r ? N(r.litri) : null); }
  const grav = attivi.filter(c => capoI(c).gravida).length;
  const ch = latteChart(30);
  const parti = attivi.filter(c => { const i = capoI(c); return i.gravida && i.prevParto && diff(T, i.prevParto) <= 60; }).sort((a, b) => capoI(a).prevParto.localeCompare(capoI(b).prevParto));
  return { title: 'Stalla', html: `
  ${saluto()}
  <div class="kpis">
    <button class="kpi" data-act="nav" data-tab="stalla" data-sub="mandria"><span class="k-l">${ic('cow')}Mandria</span><span class="k-v">${attivi.length}<small>capi</small></span><span class="k-s">${by('In lattazione')} in latte · ${by('Asciutta')} asciutte · ${by('Manza') + by('Vitella')} rimonta</span></button>
    <button class="kpi" data-act="nav" data-tab="stalla" data-sub="latte"><span class="k-l">${ic('milk')}Latte</span><span class="k-v">${ul ? nf(ul.litri, 0) : '—'}<small>litri</small></span>${(() => { const m = media(L, addDays(T, -6), T); return m ? confronto(m, media(L, addDays(T, -13), addDays(T, -7)), 'media sulla settimana prima') : ''; })()}<span class="k-s">${ul ? (ul.data === T ? 'oggi' : fdShort(ul.data)) : 'nessuna registrazione'}</span><span class="k-spark">${spark(last14)}</span></button>
    <button class="kpi" data-act="nav" data-tab="stalla" data-sub="riproduzione"><span class="k-l">${ic('heart-pulse')}Gravide</span><span class="k-v">${grav}<small>/ ${by('In lattazione') + by('Asciutta') + by('Manza')}</small></span><span class="k-s">${parti.length} parti nei prossimi 60 giorni</span></button>
    <button class="kpi" data-act="nav" data-tab="stalla" data-sub="sanitario"><span class="k-l">${ic('syringe')}Sospensioni</span><span class="k-v ${attivi.some(c => capoI(c).inSospLatte) ? 't-bad' : ''}">${attivi.filter(c => capoI(c).inSospLatte).length}</span><span class="k-s">capi con latte da scartare</span></button>
  </div>
  ${caldoCard()}
  ${(() => { const I = indici(); const ss = [...S.strutture]; const sil = [...S.silos]; if (!ss.length && !sil.length && !S.misure.length) return ''; return `<section class="card"><div class="card-h"><h2>${ic('layout-grid')}Stalle e silos</h2><button class="btn sm ghost" data-act="nav" data-tab="stalla" data-sub="stalle">Apri</button></div><div class="mini-stalls">${ss.map(s => { const n = capiIn(s.id).length, p = (s.box || []).reduce((t, b) => t + N(b.posti), 0); return `<button data-act="open" data-type="struttura" data-id="${s.id}"><b>${esc(s.nome)}</b><span class="num">${n}${p ? '/' + p : ''} capi</span>${p ? `<span class="occ"><i style="width:${Math.min(100, n / p * 100)}%" class="${n > p ? 'over' : ''}"></i></span>` : ''}</button>`; }).join('')}${sil.map(x => { const i = siloInfo(x); return `<button data-act="nav" data-tab="stalla" data-sub="stalle"><b>${ic('cylinder')}${esc(x.nome)}</b><span class="num">${i.pct !== null ? nf(i.pct, 0) + '%' : nf(i.kg / 1000, 1) + ' t'}${i.giorni !== null ? ' · ' + nf(i.giorni, 0) + ' gg' : ''}</span><span class="occ silo-l"><i style="width:${i.pct ?? 0}%" class="${i.giorni !== null && i.giorni < 10 ? 'over' : ''}"></i></span></button>`; }).join('')}<button data-act="nav" data-tab="stalla" data-sub="indici"><b>${ic('activity')}Benessere</b><span class="${I.benessere ? 't-bad' : ''}">${I.benessere ? I.benessere + ' allarmi' : 'tutto nella norma'}</span><span class="muted small">DIM ${I.dim === null ? '—' : nf(I.dim, 0)} · IOFC ${I.iofc === null ? '—' : eur(I.iofc, 2)}</span></button></div></section>`; })()}
  <div class="grid-2"><div class="col">${agendaCard('stalla')}${alertsCard(x => ['stalla', 'latte'].includes(x.area) || (x.area === 'magazzino' && x.go && ['Mangime', 'Foraggio', 'Farmaco veterinario'].includes((get('prodotti', x.go.id) || {}).categoria)), 'Da fare in stalla')}
    ${parti.length ? `<section class="card"><div class="card-h"><h2>${ic('baby')}Parti in arrivo</h2></div><div class="list">${parti.map(capoRow).join('')}</div></section>` : ''}</div>
  <div class="col"><section class="card"><div class="card-h"><h2>${ic('milk')}Latte, ultimi 30 giorni</h2>${newBtn('latte', 'Registra', '', 'ghost')}</div>${ch ? `<div class="chartbox">${ch.svg}</div><div class="legend"><span><i class="sw conf"></i>conferiti</span><span><i class="sw prod"></i>non conferiti</span><span class="sp"></span><span>media <b class="num">${nf(ch.avg, 0)} l/giorno</b></span></div>` : empty('milk', 'Nessuna registrazione', 'Registra ogni giorno litri prodotti e conferiti.')}</section>
  ${S.note.length ? `<section class="card"><div class="card-h"><h2>${ic('pencil')}Note</h2><button class="btn sm ghost" data-act="nav" data-tab="note">Vedi tutte</button></div><div class="note-strip">${[...S.note].sort(byDate).reverse().slice(0, 4).map(noteCard).join('')}</div></section>` : ''}</div></div>` };
}
