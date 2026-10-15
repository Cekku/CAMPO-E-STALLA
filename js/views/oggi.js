// Dashboard: pianta aziendale, colture, attività, avanzamento, note, magazzino (Campagna) o mandria e latte (Stalla)
import { S, D, UI, azienda, get } from '../state.js';
import { esc, nf, eur, fd, fdShort, fdLong, today, sum, byDate, N, plural, yearOf, diff } from '../util.js';
import { ic } from '../icons.js';
import { allAlerts, campoHa, capoI, giac, cropColor, cropColorName, cropOf, opCosto } from '../domain.js';
import { farmSvg, thumb } from '../geo.js';
import { getMeteo, wmo } from '../meteo.js';
import { latteChart, spark, donut, columns } from './charts.js';
import { empty, newBtn, chip } from '../ui.js';
import { canInstall } from '../install.js';
import { capoRow } from './stalla.js';

const AREA = { stalla: ['cow', 'Stalla'], magazzino: ['package', 'Magazzino'], mezzi: ['tractor', 'Mezzi'], campi: ['sprout', 'Campi'], latte: ['milk', 'Latte'] };
const NOTE_COL = { verde: '#4FA05A', giallo: '#E0B12E', rossa: '#D2553C', blu: '#3D7DC0' };

function alertsCard(filter, title = 'Da fare') {
  const al = allAlerts().filter(filter);
  return `<section class="card"><div class="card-h"><h2>${ic('triangle-alert')}${title}</h2><span class="count">${al.length}</span></div>
  <div class="alerts">${al.length ? al.slice(0, 10).map(x => { const [ai] = AREA[x.area] || ['info']; return `<button class="alert ${x.lv}" data-act="go" data-go='${esc(JSON.stringify(x.go))}'><span class="a-ic">${ic(ai)}</span><span class="a-tx"><b>${esc(x.t)}</b><span>${esc(x.s)}</span></span>${ic('chevron-right', 'chev')}</button>`; }).join('') + (al.length > 10 ? `<p class="more">e altre ${al.length - 10} segnalazioni</p>` : '') : `<div class="allgood">${ic('circle-check', 'big')}<b>Tutto in regola</b><span>Nessuna scadenza o intervento in sospeso.</span></div>`}</div></section>`;
}
function meteoMini() {
  const { data } = getMeteo(); if (!data) return '';
  const c = data.current, d = data.daily; const [icn] = wmo(c.weather_code);
  return `<button class="hero-meteo" data-act="nav" data-tab="meteo">${ic(icn)}<b>${Math.round(c.temperature_2m)}°</b><span>${ic('thermometer')}${Math.round(d.temperature_2m_min[0])}° / ${Math.round(d.temperature_2m_max[0])}°</span><span>${ic('droplets')}${nf(d.precipitation_sum[0], 1)} mm</span></button>`;
}

export function render() {
  if (UI.area === 'stalla') return stalla();
  const a = azienda(); const T = today(); const Y = UI.anno;
  const nothing = !S.campi.length && !S.capi.length && !S.prodotti.length && !S.mezzi.length;
  if (nothing) return { title: 'Dashboard', html: `<section class="card welcome"><div class="wl-art">${ic('sprout', 'huge')}</div><div class="wl-body"><span class="eyebrow">Primo avvio</span><h2>Mettiamo in ordine l'azienda</h2><p>Disegna i campi sulla mappa con il catasto sotto gli occhi, poi registra le attività: quaderno di campagna, magazzino e costi si collegano da soli. Dal menu passi alla Stalla per mandria e latte.</p><div class="btns"><button class="btn action" data-act="nav" data-tab="mappa">${ic('map')}Disegna il primo campo</button><button class="btn ghost" data-act="loadExamples">Prova con dati di esempio</button></div></div></section>${canInstall() ? `<button class="btn" data-act="install">${ic('smartphone')}Installa l'app sul telefono</button>` : ''}` };

  const ha = sum(S.campi, campoHa); const totHa = N(a.ettari) || 0;
  const crops = new Map(); S.campi.forEach(c => { const k = cropOf(c, Y) || 'Senza coltura'; crops.set(k, (crops.get(k) || 0) + campoHa(c)); });
  const parts = [...crops.entries()].sort((x, y) => y[1] - x[1]);
  const svg = farmSvg(S.campi.map(c => ({ geom: c.geom, color: cropColor(c, Y), title: c.nome })));
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

  return { title: 'Dashboard', html: `
  <section class="hero-map" data-act="nav" data-tab="mappa" role="button" tabindex="0" aria-label="Apri la mappa">
    ${svg || `<div class="hero-empty">${ic('map', 'big')}<span>Disegna i campi sulla mappa per vedere qui la pianta dell'azienda</span></div>`}
    <div class="hm-top"><div><b>${esc(a.nome || 'La tua azienda')}</b><span>${nf(ha, 2)} ha${totHa ? ' su ' + nf(totHa, 2) + ' ha' : ''} · ${plural(S.campi.length, 'campo', 'campi')}</span>${totHa ? `<span class="hm-bar"><i style="width:${Math.min(100, ha / totHa * 100)}%"></i></span>` : ''}</div>${meteoMini()}</div>
  </section>
  <div class="crop-chips">${parts.map(([k, v]) => `<span style="--c:${cropColorName(k === 'Senza coltura' ? '' : k)}">${esc(k)} <b>${nf(ha ? v / ha * 100 : 0, 0)}%</b></span>`).join('')}</div>
  ${canInstall() ? `<button class="install-strip" data-act="install">${ic('smartphone')}<span><b>Installa Campo e Stalla sul telefono</b><small>Si apre dalla schermata Home e funziona anche senza rete</small></span>${ic('chevron-right')}</button>` : ''}
  <div class="grid-2">
    <div class="col">
      <section class="card"><div class="card-h"><h2>${ic('notebook-pen')}Ultime attività</h2><button class="btn sm ghost" data-act="nav" data-tab="attivita">Vedi tutte</button></div>
        <div class="list">${done.length ? done.map(opRow).join('') : empty('notebook-pen', 'Nessuna attività', 'Registra semine, trattamenti, raccolte.', newBtn('operazioni', 'Nuova attività', '', 'action'))}</div></section>
      ${plan.length ? `<section class="card"><div class="card-h"><h2>${ic('calendar')}Da fare</h2><button class="btn sm ghost" data-act="sub" data-tab="attivita" data-sec="attivita" data-sub="pianificate">Pianificate</button></div><div class="list">${plan.map(opRow).join('')}</div></section>` : ''}
      ${alertsCard(x => x.area !== 'stalla' && x.area !== 'latte', 'Avvisi')}
    </div>
    <div class="col">
      <section class="card"><div class="card-h"><h2>${ic('chart-column')}Colture ${Y}</h2><span class="muted small">ettari</span></div>${parts.length ? `<div class="chartbox">${columns(parts.map(([k, v]) => ({ label: k, v, color: cropColorName(k === 'Senza coltura' ? '' : k) })))}</div>` : empty('chart-column', 'Nessuna coltura', 'Aggiungi la coltura dell\'annata ai tuoi campi.')}</section>
      ${prod.length ? `<section class="card"><div class="card-h"><h2>${ic('sprout')}Produzione colture ${Y}</h2></div><div class="prod-cards">${prod.map(p => `<div class="prod-card" style="--c:${cropColorName(p.k)}"><div class="pc-h"><b>${esc(p.k)}</b><span>${nf(p.v, 2)} ha · ${plural(p.n, 'campo', 'campi')}</span></div><div class="pc-d">${donut(p.sem, 'Semina', cropColorName(p.k))}${donut(p.rac, 'Raccolta', 'var(--action)')}</div></div>`).join('')}</div></section>` : ''}
      <section class="card"><div class="card-h"><h2>${ic('pencil')}Note</h2><button class="btn sm ghost" data-act="nav" data-tab="note">Vedi tutte</button></div>${note.length ? `<div class="note-strip">${note.map(noteCard).join('')}</div>` : empty('pencil', 'Nessuna nota', 'Osservazioni, misure e promemoria, anche legati a un campo.', newBtn('note', 'Nuova nota', '', ''))}</section>
      <section class="card"><div class="card-h"><h2>${ic('warehouse')}Movimenti magazzino</h2><button class="btn sm ghost" data-act="nav" data-tab="magazzino" data-sub="movimenti">Vedi tutti</button></div><div class="list">${mov.length ? mov.map(m => { const p = get('prodotti', m.prodottoId); const out = m.tipo === 'Scarico'; return `<button class="row" data-act="open" data-type="prodotto" data-id="${m.prodottoId}"><span class="r-icon ${out ? 'out' : 'in'}">${ic(out ? 'upload' : 'download')}</span><span class="r-main"><b>${esc(p ? p.nome : '—')}</b><span>${out ? 'Scarico' : 'Carico'} · ${fd(m.data)}</span></span><span class="chip ${out ? 'bad' : 'ok'} num">${out ? '−' : '+'}${nf(m.quantita, 1)} ${esc(p ? p.unita || '' : '')}</span></button>`; }).join('') : '<div class="empty slim">Nessun movimento.</div>'}</div></section>
    </div>
  </div>` };
}

export function noteCard(n) {
  const c = get('campi', n.campoId);
  return `<button class="note-card" data-act="edit" data-form="note" data-id="${n.id}" style="--c:${NOTE_COL[n.colore] || 'var(--line-2)'}"><b>${esc(n.titolo || 'Nota')}</b><small>${fd(n.data)}${c ? ' · ' + esc(c.nome) : ''}</small><p>${esc((n.testo || '').slice(0, 180))}</p>${n.esempio ? '<span class="chip ghost">Esempio</span>' : ''}</button>`;
}

export function opRow(o) {
  const c = get('campi', o.campoId), p = get('prodotti', o.prodottoId), k = opCosto(o); const pl = o.stato === 'Pianificata';
  const col = c ? cropColor(c, yearOf(o.data) || UI.anno) : 'var(--muted)';
  const late = pl && o.data < today();
  return `<div class="row op${pl ? ' plan' : ''}" data-act="edit" data-form="operazioni" data-id="${o.id}" role="button" tabindex="0"><span class="op-thumb" style="color:${col}">${c ? thumb(c.geom, 40, col) : ''}</span><span class="r-main"><b>${esc(c ? c.nome : 'campo eliminato')}${o.gruppo ? ' <span class="chip ghost">gruppo</span>' : ''}</b><span class="op-crop"><i class="dot" style="background:${col}"></i>${esc(c ? cropOf(c, yearOf(o.data)) || 'Nessuna coltura' : '')}</span><span class="op-type">${esc(o.tipo || 'Operazione')}${p ? ' · ' + esc(p.nome) + ' ' + nf(o.quantita, 2) + ' ' + esc(p.unita || '') : ''}${o.avversita ? ' · ' + esc(o.avversita) : ''}</span></span><span class="r-side"><span class="op-date">${fd(o.data)}</span>${pl ? `<span class="chip ${late ? 'bad' : 'warn'}">${late ? 'In ritardo' : 'Da fare'}</span><button class="btn xs" data-act="done" data-id="${o.id}">${ic('check')}Fatta</button>` : `<span class="chip ok">Fatto</span>`}${c ? `<span class="chip ha num">${nf(campoHa(c), 2)} ha</span>` : ''}${!pl && k.tot ? `<span class="num small muted">${eur(k.tot)}</span>` : ''}${o.esempio ? '<span class="chip ghost">Esempio</span>' : ''}</span></div>`;
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
  <div class="kpis">
    <button class="kpi" data-act="nav" data-tab="stalla" data-sub="mandria"><span class="k-l">${ic('cow')}Mandria</span><span class="k-v">${attivi.length}<small>capi</small></span><span class="k-s">${by('In lattazione')} in latte · ${by('Asciutta')} asciutte · ${by('Manza') + by('Vitella')} rimonta</span></button>
    <button class="kpi" data-act="nav" data-tab="stalla" data-sub="latte"><span class="k-l">${ic('milk')}Latte</span><span class="k-v">${ul ? nf(ul.litri, 0) : '—'}<small>litri</small></span><span class="k-s">${ul ? (ul.data === T ? 'oggi' : fdShort(ul.data)) : 'nessuna registrazione'}</span><span class="k-spark">${spark(last14)}</span></button>
    <button class="kpi" data-act="nav" data-tab="stalla" data-sub="riproduzione"><span class="k-l">${ic('heart-pulse')}Gravide</span><span class="k-v">${grav}<small>/ ${by('In lattazione') + by('Asciutta') + by('Manza')}</small></span><span class="k-s">${parti.length} parti nei prossimi 60 giorni</span></button>
    <button class="kpi" data-act="nav" data-tab="stalla" data-sub="sanitario"><span class="k-l">${ic('syringe')}Sospensioni</span><span class="k-v ${attivi.some(c => capoI(c).inSospLatte) ? 't-bad' : ''}">${attivi.filter(c => capoI(c).inSospLatte).length}</span><span class="k-s">capi con latte da scartare</span></button>
  </div>
  <div class="grid-2"><div class="col">${alertsCard(x => ['stalla', 'latte'].includes(x.area) || (x.area === 'magazzino' && x.go && ['Mangime', 'Foraggio', 'Farmaco veterinario'].includes((get('prodotti', x.go.id) || {}).categoria)), 'Da fare in stalla')}
    ${parti.length ? `<section class="card"><div class="card-h"><h2>${ic('baby')}Parti in arrivo</h2></div><div class="list">${parti.map(capoRow).join('')}</div></section>` : ''}</div>
  <div class="col"><section class="card"><div class="card-h"><h2>${ic('milk')}Latte, ultimi 30 giorni</h2>${newBtn('latte', 'Registra', '', 'ghost')}</div>${ch ? `<div class="chartbox">${ch.svg}</div><div class="legend"><span><i class="sw conf"></i>conferiti</span><span><i class="sw prod"></i>non conferiti</span><span class="sp"></span><span>media <b class="num">${nf(ch.avg, 0)} l/giorno</b></span></div>` : empty('milk', 'Nessuna registrazione', 'Registra ogni giorno litri prodotti e conferiti.')}</section>
  ${S.note.length ? `<section class="card"><div class="card-h"><h2>${ic('pencil')}Note</h2><button class="btn sm ghost" data-act="nav" data-tab="note">Vedi tutte</button></div><div class="note-strip">${[...S.note].sort(byDate).reverse().slice(0, 4).map(noteCard).join('')}</div></section>` : ''}</div></div>` };
}
