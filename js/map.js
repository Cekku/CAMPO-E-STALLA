// Mappa aziendale: satellite, catasto dell'Agenzia delle Entrate, disegno e modifica dei confini dei campi
import { S, UI, get, azienda } from './state.js';
import { $, esc, nf, N, fd, lsGet, lsSet, debounce } from './util.js';
import { ic } from './icons.js';
import { areaHa, centroid, bbox, perimeterM, parseGeoFile } from './geo.js';
import { cropColor, cropColorName, cropOf, campoInfo, campoHa, storicoColture } from './domain.js';
import { getMeteo, wmo, farmPosition } from './meteo.js';
import { openSheet, closeSheet } from './ui.js';
import { diff, today } from './util.js';
import * as store from './store.js';
import { toast } from './ui.js';
import { openEdit } from './forms.js';
import { isPCG, pcgImport } from './pcg.js';
import { NdviLayer, scene as s2scene, ndviLabel, ndviColor, campoNdviCached } from './ndvi.js';
import { collegamento } from './catasto.js';
import { CatastoVettoriale, ZOOM_PARTICELLE } from './catastomappa.js';

const CAT_URL = 'https://wms.cartografia.agenziaentrate.gov.it/inspire/wms/ows01.php';
let map = null, fieldsGroup = null, base = {}, overlays = {}, mode = 'view', selected = null, editLayer = null, editId = null, drawFor = null, gpsMarker = null, gpsCircle = null, clickMarker = null;
const prefs = Object.assign({ base: 'fvg', particelle: false, fogli: false, nomi: true, etichette: true, note: true, colorBy: 'coltura', intensita: 40 }, lsGet('ces.map', {}));
if (!prefs.v2) { prefs.v2 = 1; prefs.base = 'sat2'; prefs.lum = 100; prefs.con = 100; prefs.sat = 100; prefs.cal = 0; delete prefs.satFx; try { localStorage.setItem('ces.map', JSON.stringify(prefs)); } catch (e) { } }
// campi meno coprenti (si vede la foto sotto): il vecchio valore predefinito 70 passa a 40
if (!prefs.v3) { prefs.v3 = 1; if (!prefs.intensita || prefs.intensita === 70) prefs.intensita = 40; try { localStorage.setItem('ces.map', JSON.stringify(prefs)); } catch (e) { } }
// 1.13: sfondi solo Ortofoto FVG, Stradale e Rilievo (tolti Satellite, Satellite 2 e Google) e niente più regolazione dei colori a mano
if (!prefs.v4) { prefs.v4 = 1; if (!['fvg', 'osm', 'topo'].includes(prefs.base)) prefs.base = 'fvg'; ['lum', 'con', 'sat', 'cal'].forEach(k => delete prefs[k]); try { localStorage.setItem('ces.map', JSON.stringify(prefs)); } catch (e) { } }
// Colori dell'ortofoto della Regione portati verso quelli di Google Maps (confronto sugli stessi campi di Povoletto, 27/10/2026):
// medie sugli stessi pixel: luminosità 0,522 contro 0,450 di Google, saturazione 0,224 contro 0,265 (contrasto quasi uguale).
// Con il filtro: 0,456 e 0,286. Il filtro si applica una volta sola a ogni tessera, quando la si disegna.
const FILTRO_FVG = 'brightness(0.88) contrast(1.08) saturate(1.18)';
let notesGroup = null, ndviLayer = null, ndviScenes = null;
const FVG_BOUNDS = window.L ? L.latLngBounds([[45.57, 12.30], [46.66, 13.94]]) : null;
const inFVG = (lat, lon) => lat > 45.57 && lat < 46.66 && lon > 12.30 && lon < 13.94;
let sotto = null, esriFuori = null;
// Ortofoto FVG: Esri sotto solo se la vista non sta tutta dentro il riquadro della Regione
const esriSeServe = () => { if (map && esriFuori) { if (FVG_BOUNDS.contains(map.getBounds())) base.fvg.removeLayer(esriFuori); else base.fvg.addLayer(esriFuori); } };
const savePrefs = () => lsSet('ces.map', prefs);

// Il WMS catastale accetta solo coordinate geografiche (EPSG:6706, WMS 1.1.1, ordine lon,lat)
// Strato satellitare che non lascia mai buchi: se a quello zoom la foto manca (errore o riquadro grigio
// "dati non disponibili"), ingrandisce la foto del livello superiore, fino a 5 livelli.
const SatLayer = window.L ? L.TileLayer.extend({
  options: { updateWhenZooming: false, keepBuffer: 4 }, // durante lo zoom non scarica i livelli intermedi
  createTile(coords, done) {
    const c = document.createElement('canvas'); const sz = this.getTileSize(); c.width = sz.x; c.height = sz.y;
    this._try(c, coords, 0, true, done); return c;
  },
  _urlFor(x, y, z) { return L.Util.template(this._url, L.extend({ s: this._getSubdomain({ x, y }), x, y, z }, this.options)); },
  _try(c, coords, k, cors, done) {
    // c.complete = true: Leaflet allo zoom butta via le tessere "non complete" (pensate per <img>, un canvas non ha complete)
    // e senza questo scartava anche quelle già disegnate: per un attimo la mappa restava nera
    if (k > 5) { if (cors) this._try(c, coords, 0, false, done); else { c.complete = true; done(null, c); } return; }
    const f = 2 ** k, x = Math.floor(coords.x / f), y = Math.floor(coords.y / f), z = coords.z - k;
    const img = new Image(); if (cors) img.crossOrigin = 'anonymous';
    img.onload = () => {
      const ctx = c.getContext('2d'); const sub = img.naturalWidth / f; ctx.imageSmoothingQuality = 'high';
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.drawImage(img, (coords.x % f) * sub, (coords.y % f) * sub, sub, sub, 0, 0, c.width, c.height);
      if (cors && k < 5 && this._isBlank(ctx, c)) { this._try(c, coords, k + 1, true, done); return; }
      c.complete = true; done(null, c);
    };
    img.onerror = () => { if (cors && k >= 5) this._try(c, coords, 0, false, done); else this._try(c, coords, k + 1, cors, done); };
    img.src = this._urlFor(x, y, z);
  },
  _isBlank(ctx, c) {
    try {
      const d = ctx.getImageData(0, 0, c.width, c.height).data; let n = 0, sum = 0, sum2 = 0;
      for (let yy = 8; yy < c.height; yy += 24) for (let xx = 8; xx < c.width; xx += 24) { const i = (yy * c.width + xx) * 4; const v = (d[i] + d[i + 1] + d[i + 2]) / 3; sum += v; sum2 += v * v; n++; }
      const m = sum / n, sd = Math.sqrt(Math.max(0, sum2 / n - m * m));
      return (m > 185 && sd < 14) || (m < 4 && sd < 3);
    } catch (e) { return false; }
  },
}) : null;
// Ortofoto FVG disegnata su canvas con FILTRO_FVG: un costo per tessera invece di un filtro dal vivo su tutto lo strato,
// che rallentava zoom e spostamenti. Il server non ha CORS: l'immagine si può disegnare (canvas "sporcato") ma non leggere, e non serve.
const filtroCanvas = typeof CanvasRenderingContext2D !== 'undefined' && 'filter' in CanvasRenderingContext2D.prototype;
const FvgLayer = window.L ? L.TileLayer.WMS.extend({
  createTile(coords, done) {
    const c = document.createElement('canvas'), sz = this.getTileSize(); c.width = sz.x; c.height = sz.y;
    const img = new Image();
    img.onload = () => { const ctx = c.getContext('2d'); if (filtroCanvas) ctx.filter = FILTRO_FVG; ctx.drawImage(img, 0, 0, c.width, c.height); c.complete = true; done(null, c); };
    img.onerror = e => { c.complete = true; done(e, c); };
    img.src = this.getTileUrl(coords);
    return c;
  },
}) : null;
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
  // rotella a passi più piccoli e frequenti: zoom più continuo
  map = L.map('map', { zoomControl: false, attributionControl: true, maxZoom: 21, minZoom: 5, tap: true, preferCanvas: false, zoomSnap: 0.25, wheelPxPerZoomLevel: 90, wheelDebounceTime: 20 });
  map.attributionControl.setPrefix('');
  // dal basso: sfondo (200), catasto (350), nomi (360), particella evidenziata (390), campi (400): i campi restano sempre sopra
  map.createPane('catasto').style.zIndex = 350;
  map.createPane('labels').style.zIndex = 360; map.getPane('labels').style.pointerEvents = 'none';
  map.createPane('catSel').style.zIndex = 390; map.getPane('catSel').style.pointerEvents = 'none';
  base.osm = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxNativeZoom: 19, maxZoom: 21, updateWhenZooming: false, keepBuffer: 4, attribution: '© OpenStreetMap' });
  base.topo = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', { subdomains: 'abc', maxNativeZoom: 17, maxZoom: 21, updateWhenZooming: false, keepBuffer: 4, attribution: '© OpenStreetMap, SRTM · OpenTopoMap' });
  // Ortofoto della Regione FVG (true ortofoto 2017-2020, alta risoluzione), sopra al satellite Esri fuori regione
  const CRS900913 = Object.assign({}, L.CRS.EPSG3857, { code: 'EPSG:900913' });
  // tiled=true: le tessere (256 px, allineate alla griglia EPSG:900913) passano dalla cache GeoWebCache della Regione. La prima volta
  // una zona costa 1,3-1,9 s per tessera (il server disegna un blocco 4×4 e lo tiene per tutti), poi 0,2 s. Senza, ogni tessera era
  // ridisegnata sempre (0,3-0,6 s, 1,6 s con 6 richieste insieme). Misurato il 27/10/2026 a 1280×800: 2,5 s per lo schermo, 0,2 s alla seconda visita.
  // Il server risponde no-store e senza CORS: né il browser né il service worker ne possono tenere copia.
  const fvg = new FvgLayer('https://irdat-ortofoto.regione.fvg.it/geoserver/ortofoto/wms', { layers: 'trueorto_FVG_1720', tiled: true, format: 'image/jpeg', transparent: false, version: '1.1.1', crs: CRS900913, maxZoom: 21, maxNativeZoom: 20, bounds: FVG_BOUNDS, updateWhenZooming: false, keepBuffer: 4, zIndex: 2, className: 'sat-tiles' + (filtroCanvas ? '' : ' fvg-css'), attribution: 'Ortofoto © Regione Autonoma Friuli Venezia Giulia' });
  // sotto la foto, una sua copia a bassa risoluzione (tessere da 2048 px di tre livelli di zoom più in basso: 1-4 immagini leggere):
  // allargando o spostando la mappa si vede subito un'immagine sfocata che poi si definisce, mai lo sfondo scuro (come Google Maps)
  sotto = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { tileSize: 2048, zoomOffset: -3, minNativeZoom: 3, maxNativeZoom: 21, maxZoom: 21, zIndex: 0, updateWhenZooming: false, keepBuffer: 2, className: 'sat-tiles' });
  // il satellite Esri serve solo dove la vista esce dal riquadro della Regione: dentro scaricava 20-22 tessere coperte dall'ortofoto
  esriFuori = new SatLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxNativeZoom: 19, maxZoom: 21, zIndex: 1, className: 'sat-tiles', attribution: 'Esri' });
  base.fvg = L.layerGroup([fvg]);
  overlays.nomi = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', { pane: 'labels', maxNativeZoom: 19, maxZoom: 21 });
  overlays.particelle = new CatastoLayer('CP.CadastralParcel', { pane: 'catasto', minZoom: 15, maxZoom: 21, maxNativeZoom: 20, attribution: 'Catasto © Agenzia delle Entrate (CC BY 4.0)', className: 'catasto-tiles' });
  overlays.fogli = new CatastoLayer('CP.CadastralZoning', { pane: 'catasto', minZoom: 12, maxZoom: 21, maxNativeZoom: 20, className: 'catasto-tiles fogli' });
  // con il collegamento al catasto la mappa catastale la disegna l'app (leggibile e fluida); le immagini WMS restano solo senza collegamento
  overlays.catasto = new CatastoVettoriale({ onErrore: avvisoCatasto });
  fieldsGroup = L.featureGroup().addTo(map);
  notesGroup = L.layerGroup().addTo(map);
  applyLayers();
  const v = lsGet('ces.mapview', null);
  if (v) map.setView([v.lat, v.lng], v.z); else fitAll(true);
  esriSeServe(); map.on('moveend', esriSeServe);
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
  if (prefs.base === 'fvg') { if (!map.hasLayer(sotto)) sotto.addTo(map); } else map.removeLayer(sotto);
  (base[prefs.base] || base.fvg).addTo(map);
  if (prefs.ndvi) { if (!ndviLayer) ndviLayer = new NdviLayer(); ndviLayer._scene = prefs.ndviScene || null; if (!map.hasLayer(ndviLayer)) ndviLayer.addTo(map); else ndviLayer.redraw(); ndviBar(); }
  else { if (ndviLayer && map.hasLayer(ndviLayer)) map.removeLayer(ndviLayer); const nb = $('#ndviBar'); if (nb) nb.hidden = true; }
  const vett = !!collegamento();
  ['nomi', 'particelle', 'fogli'].forEach(k => { const on = prefs[k] && (k !== 'nomi' || prefs.base === 'fvg') && (k === 'nomi' || !vett); if (on) overlays[k].addTo(map); else map.removeLayer(overlays[k]); });
  const cv = overlays.catasto;
  if (vett && (prefs.particelle || prefs.fogli)) {
    const cambia = cv.options.particelle !== !!prefs.particelle || cv.options.fogli !== !!prefs.fogli;
    cv.options.particelle = !!prefs.particelle; cv.options.fogli = !!prefs.fogli;
    if (!map.hasLayer(cv)) cv.addTo(map); else if (cambia) cv.redraw();
  } else map.removeLayer(cv);
  map.getPane('catasto').classList.toggle('wms', !vett && !!(prefs.particelle || prefs.fogli));
  $('#map') && $('#map').classList.toggle('show-labels', map.getZoom && map.getZoom() >= 14 && prefs.etichette);
  updateCatHint();
}
function updateCatHint() { const h = $('#catHint'); if (!h || !map) return; h.hidden = !(prefs.particelle && map.getZoom() < (map.hasLayer(overlays.catasto) ? ZOOM_PARTICELLE : 15)); }
let ultimoAvviso = 0;
function avvisoCatasto(e) { if (Date.now() - ultimoAvviso < 60000) return; ultimoAvviso = Date.now(); toast('Catasto: ' + (e && e.message ? e.message : 'il servizio non risponde') + ' Riprovo quando sposti la mappa.', 'err'); }

const COND = { 'Proprietà': '#22C55E', 'Affitto': '#FB923C', 'Comodato': '#3B82F6' };
function lastAge(c) { let last = null; S.operazioni.forEach(o => { if (o.campoId === c.id && o.stato !== 'Pianificata' && (!last || o.data > last)) last = o.data; }); return last ? diff(last, today()) : null; }
function colorFor(c) {
  if (prefs.colorBy === 'conduzione') return COND[c.conduzione] || '#A9B4AE';
  if (prefs.colorBy === 'attivita') { const a = lastAge(c); return a === null ? '#A9B4AE' : a <= 7 ? '#22C55E' : a <= 30 ? '#FACC15' : '#EF4444'; }
  if (prefs.colorBy === 'nessuno') return '#FFFFFF';
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
  const col = colorFor(c); const op = prefs.ndvi ? 0.04 : Math.max(.1, Math.min(.95, (prefs.intensita || 40) / 100));
  return sel ? { color: '#FFFFFF', weight: 4, opacity: 1, fillColor: col, fillOpacity: Math.min(.9, op + .15), dashArray: null }
    : { color: col, weight: 2.6, opacity: 1, fillColor: col, fillOpacity: op };
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
    const m = L.marker(ll, { icon: L.divIcon({ className: 'note-pin', html: ic('pencil'), iconSize: [30, 30], iconAnchor: [-6, 46] }), pmIgnore: true, title: n.titolo || 'Nota' });
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
const d2 = v => Number(v).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
  ${(v => v ? `<div class="mc-last">${ic('satellite')}<span>NDVI <b style="color:${ndviColor(v.mean)}">${d2(v.mean)}</b> · ${ndviLabel(v.mean)} · ${fd(v.data)}</span></div>` : '')(campoNdviCached(c).pop())}
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
  editLayer = L.geoJSON(c.geom, { style: { color: '#FFFFFF', weight: 3, fillColor: colorFor(c), fillOpacity: .45 } }).getLayers()[0];
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

/* ---------- catasto: particella toccata o cercata per foglio e mappale ---------- */
let catLayer = null, catPart = null;
const CAT = () => import('./catasto.js');
function mostraParticella(p, adatta) {
  if (catLayer) map.removeLayer(catLayer);
  catLayer = L.geoJSON(p.geom, { style: { color: '#F5D547', weight: 3, fillColor: '#F5D547', fillOpacity: .18, dashArray: '6 4' }, pane: 'catSel', pmIgnore: true, interactive: false }).addTo(map);
  if (adatta) map.fitBounds(catLayer.getBounds(), { padding: [70, 70], maxZoom: 18 });
}
function cardParticella(p) {
  catPart = p; const box = $('#catCard'); box.hidden = false;
  const ha = Math.round(areaHa(p.geom) * 10000) / 10000; const txt = `Fg. ${p.foglioTxt} mapp. ${p.particella}`;
  const gia = S.campi.filter(c => String(c.catasto || '').replace(/\s/g, '').toLowerCase().includes(txt.replace(/\s/g, '').toLowerCase()) && (!c.comune || !p.comune || c.comune.toLowerCase() === p.comune.toLowerCase()));
  const campi = [...S.campi].sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'it'));
  box.innerHTML = `<div class="cc-row">${ic('grid-2x2')}<div><b>${esc(p.comune)} · Foglio ${esc(p.foglioTxt)} · Particella ${esc(p.particella)}</b><span>${nf(ha, 4)} ha (${nf(ha * 10000, 0)} m²)${(() => { const ar = (p.multi || [p]).reduce((t, x) => t + (x.areaCatasto || 0), 0); return ar ? ' · in catasto ' + nf(ar, 0) + ' m²' : ''; })()} · ${esc((p.multi || [p]).map(x => x.ref).join(', '))}${gia.length ? ' · già nel campo ' + gia.map(c => esc(c.nome)).join(', ') : ''}</span></div><button class="iconbtn ghost" data-act="catClose" aria-label="Chiudi">${ic('x')}</button></div>
  <div class="cc-actions"><button class="btn sm primary" data-act="catNuovo">${ic('plus')}Crea un campo</button>${campi.length ? `<select class="inp sm" id="catCampo" aria-label="Campo"><option value="">Aggiungi al campo…</option>${campi.map(c => `<option value="${c.id}"${c.id === selected ? ' selected' : ''}>${esc(c.nome)}</option>`).join('')}</select><button class="btn sm" data-act="catAggiungi">Aggiungi</button>` : ''}<button class="btn sm" data-act="catVisura" title="Apre l'area riservata dell'Agenzia delle Entrate e copia i dati della particella">${ic('file-text')}Visura</button><button class="btn sm ghost" data-act="catSearch">${ic('search')}Altra particella</button><button class="btn sm ghost" data-act="copy" data-txt="${esc(p.comune + ' ' + txt)}">${ic('copy')}Copia</button></div>`;
}
async function queryParcel(latlng) {
  if (clickMarker) map.removeLayer(clickMarker);
  clickMarker = L.circleMarker(latlng, { radius: 6, color: '#F5D547', weight: 3, fillOpacity: 0 }).addTo(map);
  const box = $('#catCard'); box.hidden = false;
  box.innerHTML = `<div class="cc-row">${ic('scan-search')}<span>Cerco la particella…</span></div>`;
  const coords = latlng.lat.toFixed(6) + ', ' + latlng.lng.toFixed(6);
  try {
    const C = await CAT(); const p = await C.particellaNelPunto(latlng.lng, latlng.lat);
    if (p) { mostraParticella(p, false); cardParticella(p); return; }
    box.innerHTML = `<div class="cc-row">${ic('info')}<div><b>Nessuna particella in questo punto</b><span>${coords}</span></div><button class="iconbtn ghost" data-act="catClose" aria-label="Chiudi">${ic('x')}</button></div>`;
  } catch (e) {
    box.innerHTML = `<div class="cc-row">${ic('info')}<div><b>${e.code === 'NO_PROXY' ? 'Serve il collegamento al catasto' : 'Il catasto non risponde'}</b><span>${esc(e.message)} · ${coords}</span></div><button class="iconbtn ghost" data-act="catClose" aria-label="Chiudi">${ic('x')}</button></div>${e.code === 'NO_PROXY' || e.code === 'PROXY' ? `<div class="cc-actions"><button class="btn sm" data-act="catImposta">${ic('settings')}Imposta il collegamento</button></div>` : ''}`;
  }
}
/** Pannello di ricerca: comune, foglio, particella (mappale). */
export async function cercaPanel() {
  const C = await CAT(); const ult = lsGet('ces.cat.ultimo', {}) || {};
  const comuni = await C.comuni();
  const az = azienda(); const def = ult.comune || '';
  openSheet('Cerca particella catastale', `<div class="fgrid" id="catForm">
    <label class="fld"><span class="flabel">Comune</span><div class="inwrap"><input id="cat_com" list="dlComuni" value="${esc(def)}" placeholder="Es. Povoletto" autocomplete="off"></div><datalist id="dlComuni">${comuni.map(c => `<option value="${esc(c.nome)} (${c.sigla})">`).join('')}</datalist></label>
    <label class="fld half"><span class="flabel">Foglio</span><div class="inwrap"><input id="cat_fg" inputmode="numeric" value="${esc(ult.foglio || '')}" placeholder="Es. 12"></div></label>
    <label class="fld half"><span class="flabel">Particella (mappale)</span><div class="inwrap"><input id="cat_pa" value="" placeholder="Es. 428"></div><small>Anche più numeri separati da virgola: 428, 430, 431</small></label>
    <label class="fld half"><span class="flabel">Sezione</span><div class="inwrap"><input id="cat_sz" value="${esc(ult.sezione || '')}" placeholder="Solo se c'è"></div></label>
    <p class="fld muted small" id="cat_msg">La prima ricerca in un comune scarica i fogli di mappa e può richiedere qualche secondo; poi è veloce.</p></div>
    <div class="factions"><button class="btn" data-act="close">Chiudi</button><span class="sp"></span><button class="btn primary" data-act="catFind">${ic('search')}Cerca</button></div>`);
  setTimeout(() => { const el = $(def ? '#cat_fg' : '#cat_com'); if (el) el.focus(); }, 100);
  void az;
}
const TROVATE = [];
export async function cercaEsegui(btn) {
  const C = await CAT(); const com = $('#cat_com').value.trim(), fg = $('#cat_fg').value.trim(), sz = $('#cat_sz').value.trim();
  const parti = $('#cat_pa').value.split(/[,;\s]+/).map(x => x.trim()).filter(Boolean);
  const msg = $('#cat_msg'); const avanz = t => { if (msg) msg.textContent = t; };
  if (!parti.length) { avanz('Scrivi il numero della particella.'); return; }
  btn.disabled = true; TROVATE.length = 0; const err = [];
  try {
    for (const pa of parti) { try { TROVATE.push(await C.cercaParticella(com, fg, pa, { sezione: sz, avanz })); } catch (e) { if (e.code === 'NO_PROXY' || e.code === 'PROXY' || e.code === 'COMUNE' || e.code === 'FOGLIO' || e.code === 'TIMEOUT') throw e; err.push(e.message); } }
    lsSet('ces.cat.ultimo', { comune: com, foglio: fg, sezione: sz });
    if (!TROVATE.length) throw new Error(err.join(' '));
    closeSheet(); if (UI.tab !== 'mappa' || !map) { const b = document.createElement('button'); b.dataset.act = 'nav'; b.dataset.tab = 'mappa'; b.hidden = true; document.body.appendChild(b); b.click(); b.remove(); for (let i = 0; i < 20 && !map; i++) await new Promise(r => setTimeout(r, 100)); await new Promise(r => setTimeout(r, 300)); }
    const p = TROVATE.length === 1 ? TROVATE[0] : Object.assign({}, TROVATE[0], { particella: TROVATE.map(x => x.particella).join(', '), geom: TROVATE.slice(1).reduce((g, x) => C.unisci(g, x.geom), TROVATE[0].geom), multi: TROVATE.slice() });
    mostraParticella(p, true); cardParticella(p);
    if (err.length) toast(err.join(' '), 'err');
  } catch (e) {
    avanz(e.message); if (e.code === 'NO_PROXY' || e.code === 'PROXY') { const f = $('#catForm'); if (f && !f.querySelector('[data-act=catImposta]')) f.insertAdjacentHTML('beforeend', `<div class="fld"><button class="btn" data-act="catImposta">${ic('settings')}Imposta il collegamento al catasto</button></div>`); }
  } finally { btn.disabled = false; }
}
/** Visura: apre l'area riservata dell'Agenzia delle Entrate (visure per immobile gratuite anche su immobili di altri dal 2025,
 *  accesso con SPID/CIE/CNS) e copia i dati da inserire. Il servizio non accetta i dati nell'indirizzo: vanno incollati. */
const AREA_RISERVATA_ADE = 'https://portale.agenziaentrate.gov.it/PortaleWeb/home';
export function catVisura() {
  const p = catPart; if (!p) return;
  window.open(AREA_RISERVATA_ADE, '_blank', 'noopener'); // subito, prima di ogni attesa: altrimenti il browser blocca la finestra
  const txt = (p.multi || [p]).map(x => `Catasto Terreni · ${x.comune}${x.sigla ? ' (' + x.sigla + ')' : ''} · codice ${x.codice}${x.sezione ? ' · Sezione ' + x.sezione : ''} · Foglio ${x.foglioTxt} · Particella ${x.particella}`).join('\n');
  const guida = 'In Area riservata: Servizi → Consultazioni visure, planimetrie e ispezioni ipotecarie → visura per immobile.';
  navigator.clipboard.writeText(txt).then(() => toast('Dati della particella copiati. ' + guida), () => toast(txt + ' — ' + guida));
}
/** Crea un campo nuovo con la particella (o le particelle) trovate. */
export function catNuovo() {
  const p = catPart; if (!p) return;
  const ha = Math.round(areaHa(p.geom) * 10000) / 10000;
  const txt = (p.multi || [p]).map(x => `Fg. ${x.foglioTxt} mapp. ${x.particella}`).join('; ');
  closeCat(); openEdit('campi', null, { geom: p.geom, superficie: ha, catasto: txt, comune: p.comune, nome: `${p.comune} Fg. ${p.foglioTxt} mapp. ${p.particella}` });
}
/** Aggiunge la particella a un campo esistente: confine, superficie e dati catastali. */
export async function catAggiungi() {
  const p = catPart; const id = ($('#catCampo') || {}).value; if (!p || !id) return toast('Scegli il campo', 'err');
  const c = get('campi', id); if (!c) return; const C = await CAT();
  const geom = c.geom ? C.unisci(c.geom, p.geom) : p.geom; const ha = Math.round(areaHa(geom) * 10000) / 10000;
  const add = (p.multi || [p]).map(x => `Fg. ${x.foglioTxt} mapp. ${x.particella}`);
  const cur = (c.catasto || '').trim(); const next = [cur, ...add.filter(a => !cur.includes(a))].filter(Boolean).join('; ');
  await store.put('campi', c.id, Object.assign({}, c, { geom, superficie: ha, catasto: next, comune: c.comune || p.comune }));
  toast(`${add.length === 1 ? 'Particella aggiunta' : add.length + ' particelle aggiunte'} a ${c.nome}: ora ${nf(ha, 2)} ha`); closeCat(); select(c.id);
}
export function closeCat() { $('#catCard').hidden = true; if (clickMarker) { map.removeLayer(clickMarker); clickMarker = null; } if (catLayer) { map.removeLayer(catLayer); catLayer = null; } catPart = null; }
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
  const bases = [['fvg', 'Ortofoto FVG'], ['osm', 'Stradale'], ['topo', 'Rilievo']];
  const radio = (k, l) => `<label class="lp-row"><span>${l}</span><input type="radio" name="colorBy" value="${k}"${prefs.colorBy === k ? ' checked' : ''}></label>`;
  const sw = (k, l, s) => `<label class="lp-row"><span>${l}${s ? `<small>${s}</small>` : ''}</span><input type="checkbox" class="switch" name="${k}"${prefs[k] ? ' checked' : ''}></label>`;
  openSheet('Livelli mappa', `<form id="lpForm" class="lp">
    <h3>Sfondo</h3><div class="lm-bases">${bases.map(([k, l]) => `<label><input type="radio" name="base" value="${k}"${prefs.base === k ? ' checked' : ''}><span class="lm-prev ${k}"></span>${l}</label>`).join('')}</div>
    <h3>Colora campi per</h3>${radio('coltura', 'Colture')}${radio('conduzione', 'Conduzione')}${radio('attivita', 'Ultime attività')}${radio('nessuno', 'Nessun colore')}
    <h3>Colori dei campi</h3>
    <label class="lp-row slider"><span>Intensità dei colori<small>Più alta = campi più pieni, meno foto visibile</small></span><input type="range" name="intensita" min="20" max="90" step="5" value="${prefs.intensita || 40}"></label>
    <h3>Visualizza</h3>${sw('etichette', 'Nomi dei campi')}${sw('note', 'Note')}${sw('nomi', 'Strade e luoghi', 'Solo sull\'ortofoto')}
    <h3>Mostra livelli su mappa</h3>${sw('ndvi', 'Vigore vegetativo (NDVI)', 'Satellite Sentinel-2, scegli la data in basso')}${sw('particelle', 'Catasto: particelle', 'Agenzia delle Entrate, visibili da vicino')}${sw('fogli', 'Catasto: fogli di mappa')}
    <button type="button" class="btn ok wide" data-act="mapApply">Applica</button></form>`);
}
// Barra delle date delle immagini satellitari, con legenda dei colori
async function ndviBar() {
  const el = $('#ndviBar'); if (!el) return; el.hidden = false;
  const leg = `<span class="nd-leg"><i></i><em>basso</em><em>alto</em></span>`;
  const gs = S.campi.filter(c => c.geom).map(c => c.geom);
  if (!gs.length) { const c = map.getBounds(); gs.push({ type: 'Polygon', coordinates: [[[c.getWest(), c.getSouth()], [c.getEast(), c.getSouth()], [c.getEast(), c.getNorth()], [c.getWest(), c.getNorth()], [c.getWest(), c.getSouth()]]] }); }
  if (!ndviScenes) { el.innerHTML = `<b>${ic('satellite')}NDVI</b><span class="muted small">Cerco le immagini…</span>${leg}`; try { ndviScenes = await s2scene(gs); } catch (e) { el.innerHTML = `<b>${ic('satellite')}NDVI</b><span class="small t-bad">${esc(e.message)}</span>`; ndviScenes = null; return; } }
  el.innerHTML = `<b>${ic('satellite')}NDVI</b><div class="nd-dates"><button data-scene="" class="${!prefs.ndviScene ? 'on' : ''}">Più recente</button>${ndviScenes.map(x => `<button data-scene="${x.id}" class="${prefs.ndviScene === x.id ? 'on' : ''}">${fd(x.data)}${x.nuvole !== null && x.nuvole !== undefined ? `<small>${Math.round(x.nuvole * 100)}% nuvole</small>` : ''}</button>`).join('') || '<span class="muted small">Nessuna immagine serena negli ultimi mesi</span>'}</div>${leg}`;
  el.onclick = e => { const b = e.target.closest('[data-scene]'); if (!b) return; prefs.ndviScene = b.dataset.scene ? +b.dataset.scene : null; savePrefs(); ndviLayer.setScene(prefs.ndviScene); el.querySelectorAll('[data-scene]').forEach(x => x.classList.toggle('on', x === b)); };
}
export function showNdvi(id) { prefs.ndvi = true; savePrefs(); if (map) { applyLayers(); drawFields(); } if (id) setTimeout(() => focusCampo(id), 200); }
export function applyPanel() {
  const f = $('#lpForm'); if (!f) return;
  prefs.base = (f.querySelector('input[name=base]:checked') || {}).value || 'fvg';
  prefs.colorBy = (f.querySelector('input[name=colorBy]:checked') || {}).value || 'coltura';
  prefs.intensita = +(f.querySelector('input[name=intensita]') || {}).value || 40;
  ['etichette', 'note', 'nomi', 'particelle', 'fogli', 'ndvi'].forEach(k => { prefs[k] = !!f.querySelector(`input[name=${k}]`).checked; });
  savePrefs(); closeSheet(); applyLayers(); drawFields();
}
export function plusMenu() {
  openSheet('Aggiungi sulla mappa', `<div class="quick"><button data-act="mapDraw"><span class="q-ic">${ic('pentagon')}</span><b>Nuovo campo</b><span>Disegna il confine</span></button><button data-act="mapNoteHere"><span class="q-ic">${ic('pencil')}</span><b>Nota qui</b><span>Al centro della mappa</span></button><button data-act="new" data-form="operazioni"><span class="q-ic">${ic('notebook-pen')}</span><b>Attività</b><span>Su uno o più campi</span></button><label><span class="q-ic">${ic('file-up')}</span><b>Importa confini</b><span>KML, GeoJSON o shapefile</span><input type="file" accept=".kml,.geojson,.json,.zip,.shp" data-act="mapImport" hidden></label></div>`);
}
export function noteHere() { closeSheet(); const c = map.getCenter(); setTimeout(() => openEdit('note', null, { lat: +c.lat.toFixed(6), lon: +c.lng.toFixed(6) }), 230); }
export function noteForField(id) { openEdit('note', null, { campoId: id }); }

document.addEventListener('ces:fit', () => { if (map) setTimeout(() => fitAll(), 150); });
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
function loadScript(src) { return new Promise((res, rej) => { const el = document.createElement('script'); el.src = src; el.onload = res; el.onerror = () => rej(new Error('Lettore shapefile non disponibile offline')); document.head.appendChild(el); }); }
export async function importFile(file) {
  try {
    let items;
    if (/\.(zip|shp)$/i.test(file.name)) {
      if (!window.shp) await loadScript('vendor/shpjs/shp.min.js');
      const buf = await file.arrayBuffer();
      let gj = /\.shp$/i.test(file.name) ? { type: 'FeatureCollection', features: window.shp.parseShp(buf).map(g => ({ type: 'Feature', geometry: g, properties: {} })) } : await window.shp(buf);
      if (Array.isArray(gj)) gj = { type: 'FeatureCollection', features: gj.flatMap(x => x.features || []) };
      items = parseGeoFile(JSON.stringify(gj), file.name);
    } else items = parseGeoFile(await file.text(), file.name);
    if (!items.length) { toast('Nel file non ci sono poligoni.', 'err'); return; }
    const first = items[0].geom.type === 'Polygon' ? items[0].geom.coordinates[0][0] : items[0].geom.coordinates[0][0][0];
    if (Math.abs(first[0]) > 180 || Math.abs(first[1]) > 90) { toast('Il file usa coordinate in metri senza indicare il sistema: nello zip dello shapefile includi anche il file .prj.', 'err'); return; }
    if (items.some(it => isPCG(it.props))) { pcgImport(items); return; }
    const exist = new Set(S.campi.map(c => (c.nome || '').toLowerCase()));
    let n = 0, dup = 0;
    for (const it of items) {
      n++; const nome = it.nome || ('Campo importato ' + n);
      if (exist.has(nome.toLowerCase())) { const c = S.campi.find(x => (x.nome || '').toLowerCase() === nome.toLowerCase()); if (c && !c.geom) { await store.put('campi', c.id, Object.assign({}, c, { geom: it.geom, superficie: N(c.superficie) || Math.round(areaHa(it.geom) * 10000) / 10000 })); dup++; continue; } }
      const p = it.props || {};
      await store.put('campi', null, { nome, geom: it.geom, superficie: Math.round(areaHa(it.geom) * 10000) / 10000, coltura: p.coltura || p.COLTURA || p.crop || '', irriguo: 'No', conduzione: /affitt/i.test(p.conduzione || p.CONDUZIONE || '') ? 'Affitto' : 'Proprietà', catasto: p.catasto || p.particella || p.PARTICELLA || '' });
    }
    toast(`Importati ${n - dup} campi${dup ? ', ' + dup + ' confini aggiunti a campi esistenti' : ''}`);
    closeSheet(); setTimeout(() => { if (map) fitAll(); }, 150);
  } catch (e) { console.warn(e); toast(e.message || 'File non leggibile', 'err'); }
}

/* ---------- montaggio ---------- */
export function showMap() {
  if (!window.L) { $('#map').innerHTML = '<div class="empty">La mappa non è disponibile.</div>'; return; }
  if (!map) buildMap();
  setTimeout(() => map.invalidateSize(), 60); renderWeather();
}
export const mapInfo = () => ({ mode, selected });
export function perimeterOf(c) { return c.geom ? perimeterM(c.geom) : 0; }

