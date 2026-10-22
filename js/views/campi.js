// Campi: i tuoi campi raggruppati per conduzione, colture per annata, costi e margini, scheda del campo
import { S, UI, get, azienda } from '../state.js';
import { esc, nf, eur, fd, sum, byDate, byName, yearOf, N, addDays, plural } from '../util.js';
import { ic } from '../icons.js';
import { campoInfo, campoHa, cropColor, cropColorName, cropOf, colturaOf, storicoColture, rotazione } from '../domain.js';
import { thumb, perimeterM, satSvg } from '../geo.js';
import { tabs, empty, newBtn, fact, chip, exChip } from '../ui.js';
import { stackBar, spark } from './charts.js';
import { campoNdviCached, ndviLabel, ndviColor } from '../ndvi.js';
import { opRow, noteCard } from './oggi.js';

const d2 = v => Number(v).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export function render() {
  if (UI.detail && UI.detail.type === 'campo') { const c = get('campi', UI.detail.id); if (c) return detail(c); UI.detail = null; }
  const sub = ['costi', 'rotazioni'].includes(UI.sub.campi) ? UI.sub.campi : 'elenco';
  const t = tabs('campi', [['elenco', 'I tuoi campi', S.campi.length], ['rotazioni', 'Piano colturale'], ['costi', 'Costi e margini']], sub);
  return { title: 'Campi', html: t + (sub === 'costi' ? costi() : sub === 'rotazioni' ? rotazioni() : elenco()) };
}

function card(c) {
  const i = campoInfo(c); const col = cropColor(c); const h = campoHa(c); const crop = cropOf(c);
  if (UI.view === 'lista') return `<div class="row fl" data-act="open" data-type="campo" data-id="${c.id}" role="button" tabindex="0"><span class="op-thumb" style="color:${col}">${thumb(c.geom, 40, col)}</span><span class="r-main"><b>${esc(c.nome)}${exChip(c)}</b><span class="op-crop"><i class="dot" style="background:${col}"></i>${esc(crop || 'Nessuna coltura')}${i.carenza ? ' · carenza al ' + fd(i.carenza.fine) : ''}</span></span><span class="r-side"><span class="chip ha num">${nf(h, 2)} ha</span><span class="small muted">${plural(i.ops.length, 'attività', 'attività')}</span></span></div>`;
  return `<article class="fcard"><button class="fc-img" data-act="open" data-type="campo" data-id="${c.id}" style="--c:${col}" aria-label="Apri ${esc(c.nome)}">${c.geom ? satSvg([{ geom: c.geom, color: col }], 256, 192, { fill: .22, stroke: 2.4 }) : thumb(c.geom, 120, col)}<span class="fc-crop-tag">${esc(crop || 'Nessuna coltura')}</span><span class="fc-ha num">${nf(h, 2)} ha</span>${i.carenza ? `<span class="fc-flag" title="Carenza fino al ${fd(i.carenza.fine)}">${ic('shield-check')}</span>` : ''}</button>
  <div class="fc-txt"><b>${esc(c.nome)}</b>${exChip(c)}<small>${i.last ? 'Ultima: ' + esc(i.last.tipo || '') + ' ' + fd(i.last.data) : 'Nessuna attività'}${i.plan.length ? ' · ' + i.plan.length + ' da fare' : ''}</small></div>
  <div class="fc-acts"><button class="btn xs action" data-act="new" data-form="operazioni" data-campo="${c.id}">${ic('notebook-pen')}Attività</button><button class="btn xs ok" data-act="coltura" data-id="${c.id}" data-anno="${UI.anno}">${ic('sprout')}${colturaOf(c) ? 'Coltura' : 'Aggiungi coltura'}</button></div></article>`;
}

function elenco() {
  const list = [...S.campi].sort(byName);
  if (!list.length) return `<section class="card">${empty('map', 'Nessun campo', 'Disegna i campi sulla mappa satellitare con il catasto, oppure importa un file KML del fascicolo aziendale.', `<div class="btns center"><button class="btn action" data-act="nav" data-tab="mappa">${ic('map')}Disegna sulla mappa</button><button class="btn" data-act="catSearch">${ic('grid-2x2')}Cerca per foglio e mappale</button>${newBtn('campi', 'Inserisci senza mappa', '', '')}</div>`)}</section>`;
  const ha = sum(list, campoHa); const tot = N(azienda().ettari);
  const crops = new Map(); list.forEach(c => { const k = cropOf(c) || 'Senza coltura'; crops.set(k, (crops.get(k) || 0) + campoHa(c)); });
  const parts = [...crops.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ label: k, v, color: cropColorName(k === 'Senza coltura' ? '' : k) }));
  const groups = {}; list.forEach(c => { const g = c.conduzione || 'Conduzione non indicata'; (groups[g] = groups[g] || []).push(c); });
  const order = ['Proprietà', 'Affitto', 'Comodato'];
  const keys = Object.keys(groups).sort((a, b) => (order.indexOf(a) + 1 || 9) - (order.indexOf(b) + 1 || 9));
  return `<section class="card fields-head"><div class="fh-top"><div><span class="eyebrow">${plural(list.length, 'campo', 'campi')} · annata ${UI.anno}</span><div class="big-num">${nf(ha, 2)}<small>ha registrati${tot ? ' su ' + nf(tot, 2) + ' ha (' + nf(ha / tot * 100, 0) + '%)' : ''}</small></div></div><div class="btns"><button class="btn sm" data-act="nav" data-tab="mappa">${ic('map')}Mappa</button><button class="btn sm" data-act="catSearch">${ic('grid-2x2')}Cerca particella</button><label class="btn sm" title="Shapefile .zip del piano colturale grafico, KML o GeoJSON">${ic('file-up')}Importa piano colturale<input type="file" accept=".zip,.shp,.kml,.geojson,.json,application/zip" data-act="mapImport" hidden></label>${newBtn('campi', 'Campo', '', '')}</div></div>${stackBar(parts)}<div class="crop-legend">${parts.map(p => `<span><i style="background:${p.color}"></i>${esc(p.label)} <em>${nf(p.v, 2)} ha</em></span>`).join('')}</div></section>
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
  return { title: c.nome, html: `<section class="card detail-hero"><div class="dh-thumb${c.geom ? ' sat' : ''}" style="color:${col}">${c.geom ? satSvg([{ geom: c.geom, color: col }], 240, 240, { fill: .22 }) : thumb(c.geom, 120, col)}</div><div class="dh-body"><span class="eyebrow">${esc(c.conduzione || 'Campo')}${c.comune ? ' · ' + esc(c.comune) : ''}</span><h1>${esc(c.nome)}${exChip(c)}</h1><span class="fc-crop"><i style="background:${col}"></i>${esc(cropOf(c) || 'Nessuna coltura nel ' + UI.anno)}</span>
    <div class="btns">${newBtn('operazioni', 'Registra attività', `data-campo="${c.id}"`, 'action')}<button class="btn sm" data-act="mapFocus" data-id="${c.id}">${ic('map')}${c.geom ? 'Sulla mappa' : 'Disegna confine'}</button><button class="btn sm ghost" data-act="edit" data-form="campi" data-id="${c.id}">${ic('pencil')}Modifica</button></div></div></section>
  <dl class="facts">${fact('Superficie', `<span class="num">${nf(h, 4)} ha</span>`)}${fact('Perimetro', c.geom ? `<span class="num">${nf(perimeterM(c.geom), 0)} m</span>` : '—')}${fact('Irriguo', esc(c.irriguo || '—'))}${fact('Catasto', esc(c.catasto || '—'))}${fact('Costi ' + UI.anno, `<span class="num">${eur(i.tot)}</span> <small>${eur(h ? i.tot / h : 0)}/ha</small>`)}${fact('Ricavi ' + UI.anno, `<span class="num">${eur(i.ricavo)}</span>`)}${fact('Tempo di carenza', i.carenza ? chip('fino al ' + fd(i.carenza.fine), 'info') : 'Nessuno')}</dl>
  <section class="card"><div class="card-h"><h2>${ic('sprout')}Colture per annata</h2><button class="btn sm ok" data-act="coltura" data-id="${c.id}" data-anno="${UI.anno}">${ic('plus')}Coltura</button></div><div class="list">${st.length ? st.map(e => `<button class="row" data-act="coltura" data-id="${c.id}" data-anno="${e.anno}"><span class="yr">${e.anno}</span><span class="r-main"><b><i class="dot" style="background:${cropColorName(e.coltura)}"></i> ${esc(e.coltura)}</b><span>${[e.varieta, e.semina ? 'semina ' + fd(e.semina) : '', N(e.resa) ? 'resa attesa ' + nf(e.resa, 1) + ' t/ha' : '', e.destinazione].filter(Boolean).map(esc).join(' · ') || '—'}</span></span><span class="chip ha num">${nf(h, 2)} ha</span></button>`).join('') : '<div class="empty slim">Nessuna coltura registrata.</div>'}</div></section>
  ${ndviCard(c)}
  ${c.note ? `<section class="card note">${esc(c.note)}</section>` : ''}
  <section class="card"><div class="card-h"><h2>${ic('notebook-pen')}Attività</h2><span class="count">${all.length}</span></div><div class="list">${all.length ? all.map(opRow).join('') : empty('notebook-pen', 'Nessuna attività', 'Registra la prima lavorazione di questo campo.')}</div></section>
  <section class="card"><div class="card-h"><h2>${ic('pencil')}Note del campo</h2><button class="btn sm ghost" data-act="new" data-form="note" data-campo="${c.id}">${ic('plus')}Nota</button></div>${note.length ? `<div class="note-strip">${note.map(noteCard).join('')}</div>` : '<div class="empty slim">Nessuna nota.</div>'}</section>` };
}

// Piano colturale su più annate: storico, annata in corso e pianificazione dell'anno prossimo, con controllo della rotazione
function rotazioni() {
  const list = [...S.campi].sort(byName);
  if (!list.length) return `<section class="card">${empty('sprout', 'Nessun campo', 'Importa il piano colturale grafico (shapefile .zip dal tuo CAA) o disegna i campi sulla mappa.', `<label class="btn action">${ic('file-up')}Importa piano colturale<input type="file" accept=".zip,.shp,.kml,.geojson,.json" data-act="mapImport" hidden></label>`)}</section>`;
  const Y = new Date().getFullYear(); const anni = [Y - 3, Y - 2, Y - 1, Y, Y + 1];
  const issues = []; list.forEach(c => anni.forEach(y => { const r = rotazione(c, y); if (r) issues.push({ c, y, r }); }));
  const cell = (c, y) => { const e = colturaOf(c, y); const r = rotazione(c, y); const col = e ? cropColorName(e.coltura) : ''; return `<td><button class="rot-cell${e ? '' : ' empty'}${r ? ' warn' : ''}${y > Y ? ' plan' : ''}" data-act="coltura" data-id="${c.id}" data-anno="${y}" style="${e ? `--c:${col}` : ''}" title="${esc(e ? e.coltura + (e.varieta ? ' · ' + e.varieta : '') : 'Aggiungi la coltura ' + y)}">${e ? `<i></i><span>${esc(e.coltura)}</span>${r ? ic('triangle-alert') : ''}${e.pcg ? '<em>PCG</em>' : ''}` : ic('plus')}</button></td>`; };
  const haY = y => { const m = new Map(); list.forEach(c => { const k = cropOf(c, y); if (k) m.set(k, (m.get(k) || 0) + campoHa(c)); }); return [...m.entries()].sort((a, b) => b[1] - a[1]); };
  return `<section class="card fields-head"><div class="fh-top"><div><span class="eyebrow">Pianificazione colturale</span><h2 style="margin-top:4px">Rotazioni ${Y - 3}–${Y + 1}</h2><p class="muted small">Tocca una cella per inserire o cambiare la coltura. L'ultima colonna è l'annata da pianificare.</p></div><div class="btns"><label class="btn sm">${ic('file-up')}Importa piano colturale<input type="file" accept=".zip,.shp,.kml,.geojson,.json" data-act="mapImport" hidden></label></div></div>
  ${issues.length ? `<div class="rot-warn">${ic('repeat-2')}<span><b>${issues.length} ${issues.length === 1 ? 'ristoppio' : 'ristoppi'} da verificare</b> Stessa coltura sullo stesso campo per più anni di fila: le regole della PAC sull'avvicendamento (BCAA 7) chiedono di cambiarla, salvo deroghe. Verifica con il tuo CAA.</span></div>` : `<div class="rot-ok">${ic('circle-check')}<span>Nessun ristoppio sui seminativi nelle annate mostrate.</span></div>`}</section>
  <section class="card flush"><div class="tablewrap"><table class="rot-table"><thead><tr><th>Campo</th>${anni.map(y => `<th class="${y === Y ? 'cur' : ''}">${y}${y > Y ? ' <small>piano</small>' : ''}</th>`).join('')}</tr></thead><tbody>${list.map(c => `<tr><td><button class="linkbtn rot-name" data-act="open" data-type="campo" data-id="${c.id}">${esc(c.nome)}</button><small>${nf(campoHa(c), 2)} ha</small></td>${anni.map(y => cell(c, y)).join('')}</tr>`).join('')}</tbody></table></div></section>
  <section class="card"><div class="card-h"><h2>${ic('chart-column')}Superfici per annata</h2></div><div class="rot-years">${anni.map(y => { const h = haY(y); const tot = h.reduce((t, x) => t + x[1], 0); return `<div><b>${y}</b>${tot ? stackBar(h.map(([k, v]) => ({ label: k, v, color: cropColorName(k) }))) : '<span class="muted small">nessuna coltura</span>'}<small class="muted">${h.slice(0, 3).map(([k, v]) => esc(k) + ' ' + nf(v, 1) + ' ha').join(' · ')}</small></div>`; }).join('')}</div></section>`;
}

function ndviCard(c) {
  if (!c.geom) return '';
  const v = campoNdviCached(c); const last = v[v.length - 1], prev = v[v.length - 2];
  const delta = last && prev ? last.mean - prev.mean : null;
  const eterog = last && isFinite(last.sd) ? last.sd : null;
  return `<section class="card"><div class="card-h"><h2>${ic('satellite')}Vigore vegetativo (NDVI)</h2><div class="btns"><button class="btn sm ghost" data-act="ndviMap" data-id="${c.id}">${ic('map')}Mappa</button><button class="btn sm" data-act="ndviField" data-id="${c.id}">${ic('refresh-cw')}${v.length ? 'Aggiorna' : 'Calcola dal satellite'}</button></div></div>
  ${last ? `<div class="ndvi-sum"><div class="ndvi-big" style="--c:${ndviColor(last.mean)}"><b>${d2(last.mean)}</b><span>${ndviLabel(last.mean)}</span><small>${fd(last.data)}</small></div>
  <div class="ndvi-side">${v.length > 1 ? `<div class="ndvi-spark">${spark(v.map(x => x.mean), 260, 54)}<span class="muted small">${fd(v[0].data)} → ${fd(last.data)}</span></div>` : ''}
  <div class="chips">${delta !== null ? `<span class="chip ${delta < -0.08 ? 'bad' : delta < -0.03 ? 'warn' : 'ok'}">${delta >= 0 ? '+' : ''}${d2(delta)} dall'immagine prima</span>` : ''}${eterog !== null ? `<span class="chip ${eterog > 0.12 ? 'warn' : ''}">${eterog > 0.12 ? 'Campo disomogeneo' : 'Campo omogeneo'} (σ ${d2(eterog)})</span>` : ''}<span class="chip ghost">min ${d2(last.min)} · max ${d2(last.max)}</span></div></div></div>
  ${delta !== null && delta < -0.08 ? `<p class="ndvi-warn">${ic('triangle-alert')}Calo marcato del vigore: controlla il campo (stress idrico, malattie, danni) o se è avvenuta una raccolta.</p>` : ''}` : `<p class="muted small pad-x" style="padding-bottom:16px">Immagini Sentinel-2 a 10 m, una ogni pochi giorni quando il cielo è sereno. L'indice va da 0 (suolo nudo) a 1 (vegetazione molto vigorosa).</p>`}</section>`;
}
