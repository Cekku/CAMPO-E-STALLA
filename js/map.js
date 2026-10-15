// Mappa aziendale: satellite, catasto dell'Agenzia delle Entrate, disegno e modifica dei confini dei campi
import { S, UI, get, azienda } from './state.js';
import { $, esc, nf, N, fd, lsGet, lsSet, debounce } from './util.js';
import { ic } from './icons.js';
import { areaHa, centroid, bbox, perimeterM, parseGeoFile } from './geo.js';
import { cropColor, cropColorName, cropOf, campoInfo, campoHa, storicoColture } from './domain.js';
import { getMeteo, wmo } from './meteo.js';
import { openSheet, closeSheet } from './ui.js';
import { diff, today } from './util.js';
import * as store from './store.js';
import { toast } from './ui.js';
import { openEdit } from './forms.js';

const CAT_URL = 'https://wms.cartografia.agenziaentrate.gov.it/inspire/wms/ows01.php';
let map = null, fieldsGroup = null, base = {}, overlays = {}, mode = 'view', selected = null, editLayer = null, editId = null, drawFor = null, gpsMarker = null, gpsCircle = null, clickMarker = null;
const prefs = Object.assign({ base: 'sat', particelle: false, fogli: false, nomi: true, etichette: true, note: true, colorBy: 'coltura' }, lsGet('ces.map', {}));
let notesGroup = null;
const savePrefs = () => lsSet('ces.map', prefs);

// Il WMS catastale accetta solo coordinate geografiche (EPSG:6706, WMS 1.1.1, ordine lon,lat)
const CatastoLayer = window.L ? L.TileLayer.extend({
  initialize(layer, opts) { L.TileLayer.prototype.initialize.call(this, '', opts); this._wmsLayer = layer; },
  getTileUrl(c) {
    const ts = this.getTileSize();
    const nw = this._map.unproject(c.scaleBy(ts), c.z), se = this._map.unproject(c.add([1, 1]).scaleBy(ts), c.z);
    const bb = [nw.lng, se.lat, se.lng, nw.lat].map(v => v.toFixed(7)).join(',');
    return `${CAT_URL}?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&LAYERS=${this._wmsLayer}&STYLES=&SRS=EPSG:6706&BBOX=${bb}&WIDTH=${ts.x}&HEIGHT=${ts.y}&FORMAT=image/png&TRANSPARENT=TRUE`;
  },
}) : null;

function buildMap() {
  map = L.map('map', { zoomControl: false, attributionControl: true, maxZoom: 21, minZoom: 5, tap: true, preferCanvas: false, zoomSnap: 0.5 });
  map.attributionControl.setPrefix('');
  map.createPane('catasto').style.zIndex = 350;
  map.createPane('labels').style.zIndex = 360; map.getPane('labels').style.pointerEvents = 'none';
  base.sat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxNativeZoom: 19, maxZoom: 21, attribution: 'Immagini © Esri, Maxar, Earthstar Geographics' });
  base.osm = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxNativeZoom: 19, maxZoom: 21, attribution: '© OpenStreetMap' });
  base.topo = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', { subdomains: 'abc', maxNativeZoom: 17, maxZoom: 21, attribution: '© OpenStreetMap, SRTM · OpenTopoMap' });
  overlays.nomi = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', { pane: 'labels', maxNativeZoom: 19, maxZoom: 21 });
  overlays.particelle = new CatastoLayer('CP.CadastralParcel', { pane: 'catasto', minZoom: 15, maxZoom: 21, maxNativeZoom: 20, attribution: 'Catasto © Agenzia delle Entrate (CC BY 4.0)', className: 'catasto-tiles' });
  overlays.fogli = new CatastoLayer('CP.CadastralZoning', { pane: 'catasto', minZoom: 12, maxZoom: 21, maxNativeZoom: 20, className: 'catasto-tiles fogli' });
  fieldsGroup = L.featureGroup().addTo(map);
  notesGroup = L.layerGroup().addTo(map);
  applyLayers();
  const v = lsGet('ces.mapview', null);
  if (v) map.setView([v.lat, v.lng], v.z); else fitAll(true);
  map.on('moveend', debounce(() => { const c = map.getCenter(); lsSet('ces.mapview', { lat: c.lat, lng: c.lng, z: map.getZoom() }); }, 400));
  map.on('zoomend', () => { $('#map').classList.toggle('show-labels', map.getZoom() >= 14 && prefs.etichette); updateCatHint(); });
  map.on('click', e => { if (mode !== 'view') return; if (selected) select(null); if (prefs.particelle && map.getZoom() >= 15) queryParcel(e.latlng); });
  map.on('locationfound', e => {
    if (!gpsMarker) { gpsMarker = L.circleMarker(e.latlng, { radius: 7, color: '#fff', weight: 3, fillColor: '#2D7FF9', fillOpacity: 1, pane: 'markerPane' }).addTo(map); gpsCircle = L.circle(e.latlng, { radius: e.accuracy, color: '#2D7FF9', weight: 1, fillOpacity: .08, interactive: false }).addTo(map); }
    else { gpsMarker.setLatLng(e.latlng); gpsCircle.setLatLng(e.latlng).setRadius(e.accuracy); }
  });
  map.on('locationerror', () => toast('Posizione non disponibile: consenti l\'accesso alla posizione al browser.', 'err'));
  setupGeoman();
  drawFields();
  $('#map').classList.toggle('show-labels', map.getZoom() >= 14 && prefs.etichette);
  updateCatHint();
}

function applyLayers() {
  Object.values(base).forEach(l => map.removeLayer(l));
  (base[prefs.base] || base.sat).addTo(map);
  ['nomi', 'particelle', 'fogli'].forEach(k => { const on = prefs[k] && (k !== 'nomi' || prefs.base === 'sat'); if (on) overlays[k].addTo(map); else map.removeLayer(overlays[k]); });
  $('#map') && $('#map').classList.toggle('show-labels', map.getZoom && map.getZoom() >= 14 && prefs.etichette);
  updateCatHint();
}
function updateCatHint() { const h = $('#catHint'); if (!h || !map) return; h.hidden = !(prefs.particelle && map.getZoom() < 15); }

const COND = { 'Proprietà': '#3E8E5A', 'Affitto': '#D9853B', 'Comodato': '#5B7FC7' };
function lastAge(c) { let last = null; S.operazioni.forEach(o => { if (o.campoId === c.id && o.stato !== 'Pianificata' && (!last || o.data > last)) last = o.data; }); return last ? diff(last, today()) : null; }
function colorFor(c) {
  if (prefs.colorBy === 'conduzione') return COND[c.conduzione] || '#8A958F';
  if (prefs.colorBy === 'attivita') { const a = lastAge(c); return a === null ? '#8A958F' : a <= 7 ? '#2E9E5B' : a <= 30 ? '#E0B12E' : '#D2553C'; }
  if (prefs.colorBy === 'nessuno') return '#F2F2F2';
  return cropColor(c);
}
function legendItems() {
  const items = new Map(); const fs = S.campi.filter(c => c.geom);
  if (prefs.colorBy === 'conduzione') fs.forEach(c => { const k = c.conduzione || 'Non indicata'; items.set(k, { col: COND[c.conduzione] || '#8A958F', ha: (items.get(k)?.ha || 0) + campoHa(c) }); });
  else if (prefs.colorBy === 'attivita') fs.forEach(c => { const a = lastAge(c); const k = a === null ? 'Nessuna attività' : a <= 7 ? 'Ultima settimana' : a <= 30 ? 'Ultimo mese' : 'Oltre un mese'; items.set(k, { col: colorFor(c), ha: (items.get(k)?.ha || 0) + campoHa(c) }); });
  else fs.forEach(c => { const k = cropOf(c) || 'Senza coltura'; items.set(k, { col: cropColor(c), ha: (items.get(k)?.ha || 0) + campoHa(c) }); });
  return [...items.entries()].sort((a, b) => b[1].ha - a[1].ha);
}
function styleFor(c, sel) {
  const col = colorFor(c);
  return sel ? { color: '#F5D547', weight: 3.5, fillColor: col, fillOpacity: .42, dashArray: null } : { color: col, weight: 2.2, fillColor: col, fillOpacity: prefs.base === 'sat' ? .28 : .35 };
}
function drawFields() {
  if (!map) return;
  fieldsGroup.clearLayers();
  S.campi.filter(c => c.geom).forEach(c => {
    if (editId === c.id) return;
    const lyr = L.geoJSON(c.geom, { style: () => styleFor(c, selected === c.id), pmIgnore: true });
    lyr.campoId = c.id;
    lyr.on('click', e => { L.DomEvent.stopPropagation(e); if (mode === 'view') select(c.id); });
    const ct = centroid(c.geom);
    if (ct) L.marker([ct[1], ct[0]], { icon: L.divIcon({ className: 'field-label', html: `<b>${esc(c.nome)}</b><span>${nf(campoHa(c), 2)} ha</span>`, iconSize: null }), interactive: false, pmIgnore: true }).addTo(lyr);
    lyr.addTo(fieldsGroup);
  });
  drawNotes(); renderLegend(); renderWeather();
}
function drawNotes() {
  if (!notesGroup) return; notesGroup.clearLayers(); if (!prefs.note) return;
  S.note.forEach(n => {
    let ll = null; if (n.lat && n.lon) ll = [+n.lat, +n.lon]; else { const c = get('campi', n.campoId); const ct = c && c.geom && centroid(c.geom); if (ct) ll = [ct[1], ct[0]]; }
    if (!ll) return;
    const m = L.marker(ll, { icon: L.divIcon({ className: 'note-pin', html: ic('pencil'), iconSize: [30, 30], iconAnchor: [15, 30] }), pmIgnore: true, title: n.titolo || 'Nota' });
    m.on('click', e => { L.DomEvent.stopPropagation(e); openEdit('note', n.id); });
    m.addTo(notesGroup);
  });
}
function renderWeather() {
  const el = $('#mapWeather'); if (!el) return; const { data } = getMeteo();
  if (!data) { el.hidden = true; return; }
  const c = data.current, d = data.daily; el.hidden = false;
  el.innerHTML = `<button data-act="nav" data-tab="meteo">${ic(wmo(c.weather_code)[0])}<b>${Math.round(c.temperature_2m)}°</b></button><span>${ic('thermometer')}${Math.round(d.temperature_2m_min[0])}°</span><span>${ic('thermometer')}${Math.round(d.temperature_2m_max[0])}°</span>`;
}
export function mapUpdate() { if (map) { drawFields(); if (selected) renderCard(); } }

let legendOpen = false;
function renderLegend() {
  const el = $('#mapLegend'); if (!el) return;
  const it = legendItems(); const t = { coltura: 'Colture ' + UI.anno, conduzione: 'Conduzione', attivita: 'Ultima attività', nessuno: 'Campi' }[prefs.colorBy];
  el.innerHTML = `<b>${t}</b>` + it.map(([k, v]) => `<span><i style="background:${v.col}"></i>${esc(k)} <em>${nf(v.ha, 1)} ha</em></span>`).join('');
  el.hidden = !legendOpen || !it.length;
  const btn = document.querySelector('.legend-btn'); if (btn) btn.classList.toggle('open', legendOpen);
}
export function toggleLegend() { legendOpen = !legendOpen; renderLegend(); }

export function select(id) {
  selected = id;
  fieldsGroup.eachLayer(l => { const c = get('campi', l.campoId); if (c) l.setStyle(styleFor(c, l.campoId === id)); if (l.campoId === id) l.bringToFront(); });
  renderCard();
}
function renderCard() {
  const card = $('#mapCard');
  if (mode !== 'view') return;
  const c = selected && get('campi', selected);
  $('#mapView').classList.toggle('has-card', !!c);
  if (!c) { card.hidden = true; card.innerHTML = ''; return; }
  const i = campoInfo(c); const ct = centroid(c.geom); const h = campoHa(c); const st = storicoColture(c).slice(0, 4);
  card.hidden = false;
  card.innerHTML = `<div class="grab" aria-hidden="true"></div><div class="mc-head">${ic('map-pin')}<div class="mc-title"><b>${esc(c.nome)}</b><span>${nf(h, 2)} ha${c.conduzione ? ' · ' + esc(c.conduzione) : ''}${c.catasto ? ' · ' + esc(c.catasto) : ''}</span></div><button class="iconbtn ghost" data-act="mapDeselect" aria-label="Chiudi">${ic('x')}</button></div>
  <div class="mc-hist">${st.length ? st.map(e => `<button data-act="coltura" data-id="${c.id}" data-anno="${e.anno}">${ic('sprout')}<span><b>${e.anno}</b> ${esc(e.coltura)}</span><em class="chip ok num">${nf(h, 2)} ha</em></button>`).join('') : `<button data-act="coltura" data-id="${c.id}" data-anno="${UI.anno}">${ic('plus')}<span>Aggiungi la coltura ${UI.anno}</span></button>`}</div>
  <div class="mc-last">${ic('notebook-pen')}<span>${i.last ? esc(i.last.tipo || 'Attività') + ' il ' + fd(i.last.data) : 'Nessuna attività registrata'}${i.plan.length ? ' · ' + i.plan.length + ' da fare' : ''}${i.carenza ? ' · carenza fino al ' + fd(i.carenza.fine) : ''}</span></div>
  <div class="mc-actions two"><button class="btn sm" data-act="open" data-type="campo" data-id="${c.id}">${ic('list')}Dettagli</button>${ct ? `<a class="btn sm" href="https://www.google.com/maps/dir/?api=1&destination=${ct[1].toFixed(6)},${ct[0].toFixed(6)}" target="_blank" rel="noopener">${ic('navigation')}Indicazioni</a>` : '<span></span>'}</div>
  <button class="btn action wide" data-act="new" data-form="operazioni" data-campo="${c.id}">${ic('plus')}Registra attività</button>
  <div class="mc-actions two"><button class="btn ok sm" data-act="mapNote" data-id="${c.id}">${ic('pencil')}Nuova nota</button><button class="btn sm ghost" data-act="mapEdit" data-id="${c.id}">${ic('pentagon')}Modifica confine</button></div>`;
}

/* ---------- disegno ---------- */
function setupGeoman() {
  map.pm.setLang('it');
  map.pm.setGlobalOptions({ snappable: true, snapDistance: 18, allowSelfIntersection: false, templineStyle: { color: '#F5D547', weight: 3 }, hintlineStyle: { color: '#F5D547', dashArray: [6, 6], weight: 2 }, pathOptions: { color: '#F5D547', weight: 3, fillOpacity: .25 }, markerStyle: { draggable: true } });
  map.on('pm:drawstart', ({ workingLayer }) => { workingLayer.on('pm:vertexadded', () => liveArea(workingLayer)); });
  map.on('pm:create', async e => {
    const geom = e.layer.toGeoJSON().geometry; map.removeLayer(e.layer);
    const ha = Math.round(areaHa(geom) * 10000) / 10000;
    const target = drawFor; endMode();
    if (ha <= 0) { toast('Il confine non è valido: servono almeno tre punti.', 'err'); return; }
    if (target) { const c = get('campi', target); if (c) { await store.put('campi', c.id, Object.assign({}, c, { geom, superficie: ha })); toast('Confine salvato: ' + nf(ha, 2) + ' ha'); select(c.id); } }
    else openEdit('campi', null, { geom, superficie: ha });
  });
}
function liveArea(layer) {
  const ll = layer.getLatLngs(); const pts = (Array.isArray(ll[0]) ? ll[0] : ll).map(p => [p.lng, p.lat]);
  const el = $('#drawArea'); if (!el) return;
  if (pts.length < 3) { el.textContent = pts.length + ' punti'; return; }
  const g = { type: 'Polygon', coordinates: [[...pts, pts[0]]] };
  el.textContent = nf(areaHa(g), 2) + ' ha · ' + pts.length + ' punti';
}
function modeBar(html) { const b = $('#mapBar'); b.innerHTML = html; b.hidden = !html; $('#mapCard').hidden = !!html || !selected; $('#map').classList.toggle('drawing', !!html); $('#mapView').classList.toggle('has-bar', !!html); }
export function startDraw(forId = null) {
  if (!map) return; closeSheet();
  endMode(); select(null); mode = 'draw'; drawFor = forId;
  map.pm.enableDraw('Polygon', { finishOn: null, continueDrawing: false });
  const c = forId && get('campi', forId);
  modeBar(`<div class="mb-text"><b>${c ? 'Ridisegna ' + esc(c.nome) : 'Disegna il nuovo campo'}</b><span>Tocca gli angoli del campo uno dopo l'altro, poi tocca il primo punto per chiudere. <em id="drawArea"></em></span></div><div class="mb-actions"><button class="btn sm ghost" data-act="mapUndo">${ic('undo-2')}Punto</button><button class="btn sm" data-act="mapCancel">Annulla</button></div>`);
}
export function startEdit(id) {
  const c = get('campi', id); if (!c || !c.geom) { startDraw(id); return; }
  endMode(); mode = 'edit'; editId = id; drawFields();
  editLayer = L.geoJSON(c.geom, { style: { color: '#F5D547', weight: 3, fillColor: cropColor(c), fillOpacity: .3 } }).getLayers()[0];
  editLayer.addTo(map); editLayer.pm.enable({ allowSelfIntersection: false, snappable: true });
  const upd = () => { const g = editLayer.toGeoJSON().geometry; const el = $('#drawArea'); if (el) el.textContent = nf(areaHa(g), 2) + ' ha'; };
  editLayer.on('pm:edit pm:markerdrag pm:vertexadded pm:vertexremoved', upd);
  map.fitBounds(editLayer.getBounds(), { padding: [40, 40], maxZoom: 18 });
  modeBar(`<div class="mb-text"><b>Modifica il confine di ${esc(c.nome)}</b><span>Trascina i vertici; tocca il punto a metà lato per aggiungerne uno, tieni premuto per toglierlo. <em id="drawArea"></em></span></div><div class="mb-actions"><button class="btn sm" data-act="mapCancel">Annulla</button><button class="btn sm primary" data-act="mapSaveEdit">${ic('check')}Salva</button></div>`);
  upd();
}
export async function saveEdit() {
  if (!editLayer || !editId) return;
  const c = get('campi', editId); const geom = editLayer.toGeoJSON().geometry; const ha = Math.round(areaHa(geom) * 10000) / 10000;
  const id = editId; endMode();
  if (c) { await store.put('campi', id, Object.assign({}, c, { geom, superficie: ha })); toast('Confine aggiornato: ' + nf(ha, 2) + ' ha'); select(id); }
}
export function undoPoint() { try { const d = map.pm.Draw.Polygon; if (d && d._layer && d._layer.getLatLngs().length) d._removeLastVertex(); } catch (e) { } }
export function endMode() {
  if (!map) return;
  map.pm.disableDraw();
  if (editLayer) { editLayer.pm.disable(); map.removeLayer(editLayer); editLayer = null; }
  const had = editId; editId = null; drawFor = null; mode = 'view'; modeBar('');
  if (had) drawFields();
}

/* ---------- catasto: dati della particella toccata ---------- */
async function queryParcel(latlng) {
  if (clickMarker) map.removeLayer(clickMarker);
  clickMarker = L.circleMarker(latlng, { radius: 6, color: '#F5D547', weight: 3, fillOpacity: 0 }).addTo(map);
  const box = $('#catCard'); box.hidden = false;
  box.innerHTML = `<div class="cc-row">${ic('scan-search')}<span>Cerco la particella…</span></div>`;
  const d = 0.00002, bb = [latlng.lng - d, latlng.lat - d, latlng.lng + d, latlng.lat + d].join(',');
  const url = `${CAT_URL}?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetFeatureInfo&LAYERS=CP.CadastralParcel&QUERY_LAYERS=CP.CadastralParcel&STYLES=&SRS=EPSG:6706&BBOX=${bb}&WIDTH=9&HEIGHT=9&X=4&Y=4&INFO_FORMAT=text/html&FEATURE_COUNT=1`;
  let ref = null;
  try { const r = await fetch(url); const t = await r.text(); const m = t.match(/([A-Z]\d{3})_(\d{4})([0-9A-Z]{2})\.([0-9A-Za-z]+)/); if (m) ref = { comuneCod: m[1], foglio: String(parseInt(m[2], 10)), allegato: m[3], particella: m[4], raw: m[0] }; } catch (e) { ref = undefined; }
  let comune = '';
  try { const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=10&accept-language=it&lat=${latlng.lat}&lon=${latlng.lng}`); const j = await r.json(); comune = (j.address && (j.address.city || j.address.town || j.address.village || j.address.municipality)) || ''; } catch (e) { }
  const coords = latlng.lat.toFixed(6) + ', ' + latlng.lng.toFixed(6);
  if (ref) {
    const txt = `Fg. ${ref.foglio} mapp. ${ref.particella}`;
    box.innerHTML = `<div class="cc-row">${ic('grid-2x2')}<div><b>${esc(comune || 'Comune ' + ref.comuneCod)} · Foglio ${esc(ref.foglio)} · Particella ${esc(ref.particella)}</b><span>Codice catastale ${esc(ref.raw)} · ${coords}</span></div><button class="iconbtn ghost" data-act="catClose" aria-label="Chiudi">${ic('x')}</button></div>
    <div class="cc-actions">${selected ? `<button class="btn sm" data-act="catAssign" data-txt="${esc(txt)}" data-comune="${esc(comune)}">Aggiungi a ${esc(get('campi', selected)?.nome || 'campo')}</button>` : ''}<button class="btn sm ghost" data-act="copy" data-txt="${esc((comune ? comune + ' ' : '') + txt)}">${ic('copy')}Copia</button></div>`;
  } else {
    box.innerHTML = `<div class="cc-row">${ic('info')}<div><b>${ref === undefined ? 'Il servizio catastale non risponde da questo dispositivo' : 'Nessuna particella in questo punto'}</b><span>${comune ? esc(comune) + ' · ' : ''}${coords}. Foglio e numero di particella restano leggibili sulla mappa ingrandendo.</span></div><button class="iconbtn ghost" data-act="catClose" aria-label="Chiudi">${ic('x')}</button></div>`;
  }
}
export function closeCat() { $('#catCard').hidden = true; if (clickMarker) { map.removeLayer(clickMarker); clickMarker = null; } }
export async function assignCatasto(txt, comune) {
  const c = selected && get('campi', selected); if (!c) return;
  const cur = (c.catasto || '').trim(); const add = txt.replace(/^Fg\. /, 'Fg. ');
  const next = cur ? (cur.includes(add) ? cur : cur + '; ' + add) : add;
  await store.put('campi', c.id, Object.assign({}, c, { catasto: next, comune: c.comune || comune }));
  toast('Dati catastali aggiunti a ' + c.nome); closeCat();
}

/* ---------- ricerca luogo ---------- */
export async function searchPlace(q) {
  const res = $('#mapResults'); if (!q.trim()) { res.hidden = true; return; }
  const m = q.match(/^\s*(-?\d+(?:[.,]\d+)?)\s*[,; ]\s*(-?\d+(?:[.,]\d+)?)\s*$/);
  if (m) { const lat = N(m[1]), lon = N(m[2]); map.setView([lat, lon], 17); res.hidden = true; return; }
  res.hidden = false; res.innerHTML = '<div class="mr-empty">Ricerca…</div>';
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&countrycodes=it&accept-language=it&q=${encodeURIComponent(q)}`);
    const j = await r.json();
    res.innerHTML = j.length ? j.map(x => `<button data-act="mapGo" data-lat="${x.lat}" data-lon="${x.lon}" data-bb="${(x.boundingbox || []).join(',')}">${ic('map-pin')}<span>${esc(x.display_name)}</span></button>`).join('') : '<div class="mr-empty">Nessun risultato</div>';
  } catch (e) { res.innerHTML = '<div class="mr-empty">Ricerca non disponibile offline</div>'; }
}
export function goPlace(b) {
  const bb = (b.dataset.bb || '').split(',').map(Number);
  if (bb.length === 4 && bb.every(isFinite)) map.fitBounds([[bb[0], bb[2]], [bb[1], bb[3]]], { maxZoom: 17 }); else map.setView([+b.dataset.lat, +b.dataset.lon], 16);
  $('#mapResults').hidden = true; $('#mapSearch').blur();
}

/* ---------- strati ---------- */
export function layersPanel() {
  const bases = [['sat', 'Satellite'], ['osm', 'Stradale'], ['topo', 'Rilievo']];
  const radio = (k, l) => `<label class="lp-row"><span>${l}</span><input type="radio" name="colorBy" value="${k}"${prefs.colorBy === k ? ' checked' : ''}></label>`;
  const sw = (k, l, s) => `<label class="lp-row"><span>${l}${s ? `<small>${s}</small>` : ''}</span><input type="checkbox" class="switch" name="${k}"${prefs[k] ? ' checked' : ''}></label>`;
  openSheet('Livelli mappa', `<form id="lpForm" class="lp">
    <h3>Sfondo</h3><div class="lm-bases">${bases.map(([k, l]) => `<label><input type="radio" name="base" value="${k}"${prefs.base === k ? ' checked' : ''}><span class="lm-prev ${k}"></span>${l}</label>`).join('')}</div>
    <h3>Colora campi per</h3>${radio('coltura', 'Colture')}${radio('conduzione', 'Conduzione')}${radio('attivita', 'Ultime attività')}${radio('nessuno', 'Nessun colore')}
    <h3>Visualizza</h3>${sw('etichette', 'Nomi dei campi')}${sw('note', 'Note')}${sw('nomi', 'Strade e luoghi', 'Solo sul satellite')}
    <h3>Mostra livelli su mappa</h3>${sw('particelle', 'Catasto: particelle', 'Agenzia delle Entrate, visibili da vicino')}${sw('fogli', 'Catasto: fogli di mappa')}
    <button type="button" class="btn ok wide" data-act="mapApply">Applica</button></form>`);
}
export function applyPanel() {
  const f = $('#lpForm'); if (!f) return;
  prefs.base = (f.querySelector('input[name=base]:checked') || {}).value || 'sat';
  prefs.colorBy = (f.querySelector('input[name=colorBy]:checked') || {}).value || 'coltura';
  ['etichette', 'note', 'nomi', 'particelle', 'fogli'].forEach(k => { prefs[k] = !!f.querySelector(`input[name=${k}]`).checked; });
  savePrefs(); closeSheet(); applyLayers(); drawFields();
}
export function plusMenu() {
  openSheet('Aggiungi sulla mappa', `<div class="quick"><button data-act="mapDraw"><span class="q-ic">${ic('pentagon')}</span><b>Nuovo campo</b><span>Disegna il confine</span></button><button data-act="mapNoteHere"><span class="q-ic">${ic('pencil')}</span><b>Nota qui</b><span>Al centro della mappa</span></button><button data-act="new" data-form="operazioni"><span class="q-ic">${ic('notebook-pen')}</span><b>Attività</b><span>Su uno o più campi</span></button><label><span class="q-ic">${ic('file-up')}</span><b>Importa confini</b><span>File KML o GeoJSON</span><input type="file" accept=".kml,.geojson,.json" data-act="mapImport" hidden></label></div>`);
}
export function noteHere() { closeSheet(); const c = map.getCenter(); setTimeout(() => openEdit('note', null, { lat: +c.lat.toFixed(6), lon: +c.lng.toFixed(6) }), 230); }
export function noteForField(id) { openEdit('note', null, { campoId: id }); }

export function locate() { map.locate({ setView: true, maxZoom: 17, enableHighAccuracy: true }); }
export function fitAll(silent) {
  const gs = S.campi.filter(c => c.geom).map(c => c.geom); const b = bbox(gs);
  if (b) map.fitBounds([[b[1], b[0]], [b[3], b[2]]], { padding: [50, 50], maxZoom: 17 });
  else { const a = azienda(); if (a.lat && a.lon) map.setView([+a.lat, +a.lon], 15); else if (!silent) toast('Nessun campo disegnato: cerca il comune o usa la tua posizione.'); else map.setView([42.5, 12.5], 6); }
}
export function focusCampo(id) {
  const c = get('campi', id); if (!c) return;
  if (!c.geom) { toast('Il campo non ha ancora un confine: disegnalo sulla mappa.'); startDraw(id); return; }
  const l = L.geoJSON(c.geom); map.fitBounds(l.getBounds(), { padding: [60, 60], maxZoom: 18 }); select(id);
}

/* ---------- importazione file ---------- */
export async function importFile(file) {
  try {
    const items = parseGeoFile(await file.text(), file.name);
    if (!items.length) { toast('Nel file non ci sono poligoni.', 'err'); return; }
    let n = 0;
    for (const it of items) { n++; await store.put('campi', null, { nome: it.nome || ('Campo importato ' + n), geom: it.geom, superficie: Math.round(areaHa(it.geom) * 10000) / 10000, irriguo: 'No', conduzione: 'Proprietà' }); }
    toast(n === 1 ? 'Importato 1 campo' : 'Importati ' + n + ' campi');
    setTimeout(() => fitAll(), 100);
  } catch (e) { toast(e.message || 'File non leggibile', 'err'); }
}

/* ---------- montaggio ---------- */
export function showMap() {
  if (!window.L) { $('#map').innerHTML = '<div class="empty">La mappa non è disponibile.</div>'; return; }
  if (!map) buildMap();
  setTimeout(() => map.invalidateSize(), 60); renderWeather();
}
export const mapInfo = () => ({ mode, selected });
export function perimeterOf(c) { return c.geom ? perimeterM(c.geom) : 0; }
