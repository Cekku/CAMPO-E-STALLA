// Indice di vegetazione NDVI da Sentinel-2 (servizio pubblico Esri "Sentinel-2 Views", 10 m, nuova immagine ogni 2-5 giorni)
import { lsGet, lsSet, fd, isoOf } from './util.js';
import { bbox } from './geo.js';

export const S2 = 'https://sentinel.arcgis.com/arcgis/rest/services/Sentinel2/ImageServer';
const qs = o => Object.entries(o).map(([k, v]) => k + '=' + encodeURIComponent(typeof v === 'string' ? v : JSON.stringify(v))).join('&');
async function getJSON(url) {
  let r; try { r = await fetch(url); } catch (e) { throw new Error('Servizio satellitare non raggiungibile: controlla la connessione.'); }
  const j = await r.json().catch(() => null);
  if (!r.ok || !j || j.error) throw new Error('Il servizio satellitare ha risposto con un errore' + (j && j.error && j.error.message ? ': ' + j.error.message : ''));
  return j;
}

// Immagini disponibili sull'area, dalla più recente, con copertura nuvolosa
export async function scene(geoms, { days = 150, maxCloud = 0.35 } = {}) {
  const b = bbox(geoms); if (!b) return [];
  const key = 'ces.s2:' + b.map(x => x.toFixed(3)).join(',');
  const c = lsGet(key, null); if (c && Date.now() - c.at < 6 * 3600e3) return c.list;
  const base = { geometry: { xmin: b[0], ymin: b[1], xmax: b[2], ymax: b[3], spatialReference: { wkid: 4326 } }, geometryType: 'esriGeometryEnvelope', inSR: '4326', spatialRel: 'esriSpatialRelIntersects', outFields: 'objectid,acquisitiondate,cloudcover', returnGeometry: 'false', f: 'json' };
  let j;
  try { j = await getJSON(S2 + '/query?' + qs(Object.assign({ where: 'cloudcover <= ' + maxCloud, orderByFields: 'acquisitiondate DESC', resultRecordCount: 80 }, base))); }
  catch (e) { j = await getJSON(S2 + '/query?' + qs(Object.assign({ where: '1=1' }, base))); }
  const since = Date.now() - days * 864e5; const byDay = new Map();
  (j.features || []).map(f => f.attributes).filter(a => a && a.acquisitiondate >= since && (a.cloudcover === null || a.cloudcover <= maxCloud))
    .forEach(a => { const d = isoOf(new Date(a.acquisitiondate)); const cur = byDay.get(d); if (!cur || (a.cloudcover ?? 1) < (cur.nuvole ?? 1)) byDay.set(d, { id: a.objectid, data: d, nuvole: a.cloudcover }); });
  const list = [...byDay.values()].sort((x, y) => y.data.localeCompare(x.data)).slice(0, 40);
  lsSet(key, { at: Date.now(), list }); return list;
}

const ringsOf = g => g.type === 'Polygon' ? g.coordinates : g.coordinates.flat();
// NDVI medio, minimo e massimo sul confine del campo per una data immagine
export async function statsCampo(campo, sc) {
  const key = 'ces.ndvi:' + campo.id; const cache = lsGet(key, {});
  const sig = JSON.stringify(campo.geom).length; const k = sc.id + ':' + sig;
  if (cache[k]) return cache[k];
  const j = await getJSON(S2 + '/computeStatisticsHistograms?' + qs({
    geometry: { rings: ringsOf(campo.geom), spatialReference: { wkid: 4326 } }, geometryType: 'esriGeometryPolygon',
    mosaicRule: { mosaicMethod: 'esriMosaicLockRaster', lockRasterIds: [sc.id], ascending: true }, renderingRule: { rasterFunction: 'NDVI Raw' },
    pixelSize: { x: 10, y: 10, spatialReference: { wkid: 3857 } }, f: 'json',
  }));
  const st = j.statistics && j.statistics[0]; if (!st) throw new Error('Nessun dato per questo campo nell\'immagine del ' + fd(sc.data));
  const out = { data: sc.data, mean: st.mean, min: st.min, max: st.max, sd: st.standardDeviation, nuvole: sc.nuvole };
  cache[k] = out; const ks = Object.keys(cache); if (ks.length > 60) delete cache[ks[0]]; lsSet(key, cache); return out;
}
// Serie storica (le ultime n immagini serene)
export async function serieCampo(campo, n = 8) {
  const list = await scene([campo.geom], { maxCloud: 0.2 });
  const out = [];
  for (const sc of list.slice(0, n)) { try { const s = await statsCampo(campo, sc); if (isFinite(s.mean)) out.push(s); } catch (e) { if (!out.length && sc === list[0]) throw e; } }
  return out.sort((a, b) => a.data.localeCompare(b.data));
}
export const ndviLabel = v => v === null || v === undefined || !isFinite(v) ? '—' : v < 0.15 ? 'suolo nudo o acqua' : v < 0.3 ? 'vegetazione scarsa' : v < 0.5 ? 'vegetazione media' : v < 0.7 ? 'buon vigore' : 'vigore elevato';
export const ndviColor = v => v < 0.15 ? '#A8754B' : v < 0.3 ? '#D9B64A' : v < 0.5 ? '#B5CF4A' : v < 0.7 ? '#5DB045' : '#1E7B34';

// Strato della mappa: riquadri ottenuti con exportImage dall'immagine scelta (o mosaico più recente)
export const NdviLayer = window.L ? L.TileLayer.extend({
  initialize(opts) { L.TileLayer.prototype.initialize.call(this, '', Object.assign({ tileSize: 512, opacity: .85, maxZoom: 21, maxNativeZoom: 18, className: 'ndvi-tiles', attribution: 'Sentinel-2 © Copernicus, servizio Esri' }, opts)); this._scene = null; },
  setScene(id) { this._scene = id; this.redraw(); },
  getTileUrl(c) {
    const ts = this.getTileSize(); const crs = this._map.options.crs;
    const nw = crs.project(this._map.unproject(c.scaleBy(ts), c.z)), se = crs.project(this._map.unproject(c.add([1, 1]).scaleBy(ts), c.z));
    const p = { bbox: [nw.x, se.y, se.x, nw.y].map(v => v.toFixed(2)).join(','), bboxSR: '3857', imageSR: '3857', size: ts.x + ',' + ts.y, format: 'png', transparent: 'true', renderingRule: { rasterFunction: 'NDVI Colormap' }, f: 'image' };
    if (this._scene) p.mosaicRule = { mosaicMethod: 'esriMosaicLockRaster', lockRasterIds: [this._scene] };
    else p.mosaicRule = { mosaicMethod: 'esriMosaicAttribute', sortField: 'acquisitiondate', sortValue: '2099/01/01', ascending: true, where: 'cloudcover <= 0.2' };
    return S2 + '/exportImage?' + qs(p);
  },
}) : null;

export function campoNdviCached(c) { const cache = lsGet('ces.ndvi:' + c.id, {}); const v = Object.values(cache).sort((a, b) => a.data.localeCompare(b.data)); return v; }
