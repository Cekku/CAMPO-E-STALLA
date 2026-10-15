// Campi: i tuoi campi raggruppati per conduzione, colture per annata, costi e margini, scheda del campo
import { S, UI, get, azienda } from '../state.js';
import { esc, nf, eur, fd, sum, byDate, byName, yearOf, N, addDays, plural } from '../util.js';
import { ic } from '../icons.js';
import { campoInfo, campoHa, cropColor, cropColorName, cropOf, colturaOf, storicoColture } from '../domain.js';
import { thumb, perimeterM } from '../geo.js';
import { tabs, empty, newBtn, fact, chip, exChip } from '../ui.js';
import { stackBar } from './charts.js';
import { opRow, noteCard } from './oggi.js';

export function render() {
  if (UI.detail && UI.detail.type === 'campo') { const c = get('campi', UI.detail.id); if (c) return detail(c); UI.detail = null; }
  const sub = UI.sub.campi === 'costi' ? 'costi' : 'elenco';
  const t = tabs('campi', [['elenco', 'I tuoi campi', S.campi.length], ['costi', 'Costi e margini']], sub);
  return { title: 'Campi', html: t + (sub === 'costi' ? costi() : elenco()) };
}

function card(c) {
  const i = campoInfo(c); const col = cropColor(c); const h = campoHa(c); const crop = cropOf(c);
  if (UI.view === 'lista') return `<div class="row fl" data-act="open" data-type="campo" data-id="${c.id}" role="button" tabindex="0"><span class="op-thumb" style="color:${col}">${thumb(c.geom, 40, col)}</span><span class="r-main"><b>${esc(c.nome)}${exChip(c)}</b><span class="op-crop"><i class="dot" style="background:${col}"></i>${esc(crop || 'Nessuna coltura')}${i.carenza ? ' · carenza al ' + fd(i.carenza.fine) : ''}</span></span><span class="r-side"><span class="chip ha num">${nf(h, 2)} ha</span><span class="small muted">${plural(i.ops.length, 'attività', 'attività')}</span></span></div>`;
  return `<article class="fcard"><button class="fc-img" data-act="open" data-type="campo" data-id="${c.id}" style="--c:${col}" aria-label="Apri ${esc(c.nome)}">${thumb(c.geom, 120, col)}<span class="fc-crop-tag">${esc(crop || 'Nessuna coltura')}</span><span class="fc-ha num">${nf(h, 2)} ha</span>${i.carenza ? `<span class="fc-flag" title="Carenza fino al ${fd(i.carenza.fine)}">${ic('shield-check')}</span>` : ''}</button>
  <div class="fc-txt"><b>${esc(c.nome)}</b>${exChip(c)}<small>${i.last ? 'Ultima: ' + esc(i.last.tipo || '') + ' ' + fd(i.last.data) : 'Nessuna attività'}${i.plan.length ? ' · ' + i.plan.length + ' da fare' : ''}</small></div>
  <div class="fc-acts"><button class="btn xs action" data-act="new" data-form="operazioni" data-campo="${c.id}">${ic('notebook-pen')}Attività</button><button class="btn xs ok" data-act="coltura" data-id="${c.id}" data-anno="${UI.anno}">${ic('sprout')}${colturaOf(c) ? 'Coltura' : 'Aggiungi coltura'}</button></div></article>`;
}

function elenco() {
  const list = [...S.campi].sort(byName);
  if (!list.length) return `<section class="card">${empty('map', 'Nessun campo', 'Disegna i campi sulla mappa satellitare con il catasto, oppure importa un file KML del fascicolo aziendale.', `<div class="btns center"><button class="btn action" data-act="nav" data-tab="mappa">${ic('map')}Disegna sulla mappa</button>${newBtn('campi', 'Inserisci senza mappa', '', '')}</div>`)}</section>`;
  const ha = sum(list, campoHa); const tot = N(azienda().ettari);
  const crops = new Map(); list.forEach(c => { const k = cropOf(c) || 'Senza coltura'; crops.set(k, (crops.get(k) || 0) + campoHa(c)); });
  const parts = [...crops.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ label: k, v, color: cropColorName(k === 'Senza coltura' ? '' : k) }));
  const groups = {}; list.forEach(c => { const g = c.conduzione || 'Conduzione non indicata'; (groups[g] = groups[g] || []).push(c); });
  const order = ['Proprietà', 'Affitto', 'Comodato'];
  const keys = Object.keys(groups).sort((a, b) => (order.indexOf(a) + 1 || 9) - (order.indexOf(b) + 1 || 9));
  return `<section class="card fields-head"><div class="fh-top"><div><span class="eyebrow">${plural(list.length, 'campo', 'campi')} · annata ${UI.anno}</span><div class="big-num">${nf(ha, 2)}<small>ha registrati${tot ? ' su ' + nf(tot, 2) + ' ha (' + nf(ha / tot * 100, 0) + '%)' : ''}</small></div></div><div class="btns"><button class="btn sm" data-act="nav" data-tab="mappa">${ic('map')}Mappa</button>${newBtn('campi', 'Campo', '', '')}</div></div>${stackBar(parts)}<div class="crop-legend">${parts.map(p => `<span><i style="background:${p.color}"></i>${esc(p.label)} <em>${nf(p.v, 2)} ha</em></span>`).join('')}</div></section>
  <div class="seg view-toggle"><label><input type="radio" name="vt" data-act="view" data-v="griglia"${UI.view !== 'lista' ? ' checked' : ''}><span>${ic('grid-2x2')}Griglia</span></label><label><input type="radio" name="vt" data-act="view" data-v="lista"${UI.view === 'lista' ? ' checked' : ''}><span>${ic('list')}Lista</span></label></div>
  ${keys.map(k => { const closed = UI.f['c_' + k]; const arr = groups[k]; return `<section class="fgroup"><button class="fg-h" data-act="collapse" data-k="${esc(k)}" aria-expanded="${!closed}">${ic('map-pin')}<b>${esc(k.toUpperCase())}</b><span class="muted small">${plural(arr.length, 'campo', 'campi')} · ${nf(sum(arr, campoHa), 2)} ha</span><span class="sp"></span>${ic('chevron-left', closed ? 'rot-d' : 'rot-u')}</button>${closed ? '' : UI.view === 'lista' ? `<div class="card"><div class="list">${arr.map(card).join('')}</div></div>` : `<div class="fgrid-cards">${arr.map(card).join('')}</div>`}</section>`; }).join('')}`;
}

function costi() {
  const rows = [...S.campi].sort(byName).map(c => ({ c, i: campoInfo(c), h: campoHa(c) }));
  if (!rows.length) return `<section class="card">${empty('euro', 'Nessun appezzamento', 'Aggiungi i campi per vedere costi e margini.')}</section>`;
  const T = { ha: sum(rows, r => r.h), prod: sum(rows, r => r.i.prod), mez: sum(rows, r => r.i.mez), extra: sum(rows, r => r.i.extra), tot: sum(rows, r => r.i.tot), ric: sum(rows, r => r.i.ricavo) };
  const maxTot = Math.max(1, ...rows.map(r => r.h ? r.i.tot / r.h : 0));
  return `<div class="kpis three"><div class="kpi static"><span class="k-l">Costi ${UI.anno}</span><span class="k-v">${eur(T.tot)}</span><span class="k-s">${eur(T.ha ? T.tot / T.ha : 0)} per ettaro</span></div><div class="kpi static"><span class="k-l">Ricavi da raccolti</span><span class="k-v">${eur(T.ric)}</span><span class="k-s">dalle raccolte registrate</span></div><div class="kpi static"><span class="k-l">Margine</span><span class="k-v ${T.ric - T.tot < 0 ? 't-bad' : 't-ok'}">${eur(T.ric - T.tot)}</span><span class="k-s">${eur(T.ha ? (T.ric - T.tot) / T.ha : 0)} per ettaro</span></div></div>
  <section class="card"><div class="card-h"><h2>Costo per ettaro</h2><span class="muted small">prodotti · mezzi · extra</span></div><div class="hbars">${rows.map(({ c, i, h }) => { const k = h || 1; return `<button class="hbar" data-act="open" data-type="campo" data-id="${c.id}"><span class="hb-l"><i style="background:${cropColor(c)}"></i>${esc(c.nome)}</span><span class="hb-track"><span class="hb-seg prod" style="width:${i.prod / k / maxTot * 100}%"></span><span class="hb-seg mez" style="width:${i.mez / k / maxTot * 100}%"></span><span class="hb-seg extra" style="width:${i.extra / k / maxTot * 100}%"></span></span><span class="hb-v num">${eur(h ? i.tot / h : 0)}</span></button>`; }).join('')}</div><div class="legend"><span><i class="sw prod2"></i>prodotti</span><span><i class="sw mez"></i>mezzi</span><span><i class="sw extra"></i>contoterzi e altro</span></div></section>
  <section class="card flush"><div class="tablewrap"><table><thead><tr><th>Appezzamento</th><th>ha</th><th>Prodotti</th><th>Mezzi</th><th>Extra</th><th>Totale</th><th>€/ha</th><th>Ricavi</th><th>Margine</th></tr></thead><tbody>${rows.map(({ c, i, h }) => { const m = i.ricavo - i.tot; return `<tr><td>${esc(c.nome)}<small>${esc(c.coltura || '')}</small></td><td>${nf(h, 2)}</td><td>${eur(i.prod)}</td><td>${eur(i.mez)}</td><td>${eur(i.extra)}</td><td>${eur(i.tot)}</td><td>${eur(h ? i.tot / h : 0)}</td><td>${eur(i.ricavo)}</td><td class="${m < 0 ? 't-bad' : 't-ok'}">${eur(m)}</td></tr>`; }).join('')}<tr class="tot"><td>Totale azienda</td><td>${nf(T.ha, 2)}</td><td>${eur(T.prod)}</td><td>${eur(T.mez)}</td><td>${eur(T.extra)}</td><td>${eur(T.tot)}</td><td>${eur(T.ha ? T.tot / T.ha : 0)}</td><td>${eur(T.ric)}</td><td class="${T.ric - T.tot < 0 ? 't-bad' : 't-ok'}">${eur(T.ric - T.tot)}</td></tr></tbody></table></div></section>`;
}

function detail(c) {
  const i = campoInfo(c); const h = campoHa(c); const col = cropColor(c);
  const all = S.operazioni.filter(o => o.campoId === c.id).sort(byDate).reverse();
  const st = storicoColture(c); const note = S.note.filter(n => n.campoId === c.id).sort(byDate).reverse();
  return { title: c.nome, html: `<section class="card detail-hero"><div class="dh-thumb" style="color:${col}">${thumb(c.geom, 120, col)}</div><div class="dh-body"><span class="eyebrow">${esc(c.conduzione || 'Campo')}${c.comune ? ' · ' + esc(c.comune) : ''}</span><h1>${esc(c.nome)}${exChip(c)}</h1><span class="fc-crop"><i style="background:${col}"></i>${esc(cropOf(c) || 'Nessuna coltura nel ' + UI.anno)}</span>
    <div class="btns">${newBtn('operazioni', 'Registra attività', `data-campo="${c.id}"`, 'action')}<button class="btn sm" data-act="mapFocus" data-id="${c.id}">${ic('map')}${c.geom ? 'Sulla mappa' : 'Disegna confine'}</button><button class="btn sm ghost" data-act="edit" data-form="campi" data-id="${c.id}">${ic('pencil')}Modifica</button></div></div></section>
  <dl class="facts">${fact('Superficie', `<span class="num">${nf(h, 4)} ha</span>`)}${fact('Perimetro', c.geom ? `<span class="num">${nf(perimeterM(c.geom), 0)} m</span>` : '—')}${fact('Irriguo', esc(c.irriguo || '—'))}${fact('Catasto', esc(c.catasto || '—'))}${fact('Costi ' + UI.anno, `<span class="num">${eur(i.tot)}</span> <small>${eur(h ? i.tot / h : 0)}/ha</small>`)}${fact('Ricavi ' + UI.anno, `<span class="num">${eur(i.ricavo)}</span>`)}${fact('Tempo di carenza', i.carenza ? chip('fino al ' + fd(i.carenza.fine), 'info') : 'Nessuno')}</dl>
  <section class="card"><div class="card-h"><h2>${ic('sprout')}Colture per annata</h2><button class="btn sm ok" data-act="coltura" data-id="${c.id}" data-anno="${UI.anno}">${ic('plus')}Coltura</button></div><div class="list">${st.length ? st.map(e => `<button class="row" data-act="coltura" data-id="${c.id}" data-anno="${e.anno}"><span class="yr">${e.anno}</span><span class="r-main"><b><i class="dot" style="background:${cropColorName(e.coltura)}"></i> ${esc(e.coltura)}</b><span>${[e.varieta, e.semina ? 'semina ' + fd(e.semina) : '', N(e.resa) ? 'resa attesa ' + nf(e.resa, 1) + ' t/ha' : '', e.destinazione].filter(Boolean).map(esc).join(' · ') || '—'}</span></span><span class="chip ha num">${nf(h, 2)} ha</span></button>`).join('') : '<div class="empty slim">Nessuna coltura registrata.</div>'}</div></section>
  ${c.note ? `<section class="card note">${esc(c.note)}</section>` : ''}
  <section class="card"><div class="card-h"><h2>${ic('notebook-pen')}Attività</h2><span class="count">${all.length}</span></div><div class="list">${all.length ? all.map(opRow).join('') : empty('notebook-pen', 'Nessuna attività', 'Registra la prima lavorazione di questo campo.')}</div></section>
  <section class="card"><div class="card-h"><h2>${ic('pencil')}Note del campo</h2><button class="btn sm ghost" data-act="new" data-form="note" data-campo="${c.id}">${ic('plus')}Nota</button></div>${note.length ? `<div class="note-strip">${note.map(noteCard).join('')}</div>` : '<div class="empty slim">Nessuna nota.</div>'}</section>` };
}
