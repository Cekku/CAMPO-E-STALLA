// Geometria dei campi: superficie geodetica, centro, miniature SVG, import KML/GeoJSON
const R = 6378137;
const rad = d => d * Math.PI / 180;

function ringArea(coords) {
  // area sferica (stessa formula di Turf) in m²
  let a = 0; const n = coords.length;
  if (n < 3) return 0;
  for (let i = 0; i < n; i++) {
    const p1 = coords[i], p2 = coords[(i + 1) % n], p3 = coords[(i + 2) % n];
    a += (rad(p3[0]) - rad(p1[0])) * Math.sin(rad(p2[1]));
  }
  return Math.abs(a * R * R / 2);
}
function polyArea(rings) { if (!rings.length) return 0; let a = ringArea(rings[0]); for (let i = 1; i < rings.length; i++) a -= ringArea(rings[i]); return a; }
export function areaHa(geom) {
  if (!geom) return 0;
  if (geom.type === 'Polygon') return polyArea(geom.coordinates) / 1e4;
  if (geom.type === 'MultiPolygon') return geom.coordinates.reduce((t, p) => t + polyArea(p), 0) / 1e4;
  return 0;
}
export function outerRings(geom) {
  if (!geom) return [];
  if (geom.type === 'Polygon') return [geom.coordinates[0]];
  if (geom.type === 'MultiPolygon') return geom.coordinates.map(p => p[0]);
  return [];
}
export function bbox(geoms) {
  let a = [Infinity, Infinity, -Infinity, -Infinity];
  geoms.forEach(g => outerRings(g).forEach(r => r.forEach(([x, y]) => { a[0] = Math.min(a[0], x); a[1] = Math.min(a[1], y); a[2] = Math.max(a[2], x); a[3] = Math.max(a[3], y); })));
  return isFinite(a[0]) ? a : null;
}
export function centroid(geom) {
  const r = outerRings(geom)[0]; if (!r) return null;
  let x = 0, y = 0, a = 0;
  for (let i = 0, n = r.length - 1; i < n; i++) { const [x0, y0] = r[i], [x1, y1] = r[i + 1]; const f = x0 * y1 - x1 * y0; a += f; x += (x0 + x1) * f; y += (y0 + y1) * f; }
  if (Math.abs(a) < 1e-12) { const b = bbox([geom]); return [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]; }
  return [x / (3 * a), y / (3 * a)];
}
export function perimeterM(geom) {
  let t = 0;
  outerRings(geom).forEach(r => { for (let i = 0; i < r.length - 1; i++) t += hav(r[i], r[i + 1]); });
  return t;
}
function hav(a, b) { const dLat = rad(b[1] - a[1]), dLon = rad(b[0] - a[0]); const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLon / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); }

// Miniatura SVG del contorno del campo, proiettata in modo locale (equirettangolare corretta per latitudine)
export function thumb(geom, size = 44, color = 'currentColor') {
  const rings = outerRings(geom);
  if (!rings.length) return `<svg class="thumb empty" viewBox="0 0 ${size} ${size}" aria-hidden="true"><rect x="6" y="6" width="${size - 12}" height="${size - 12}" rx="6" fill="none" stroke="currentColor" stroke-dasharray="3 3" opacity=".5"/></svg>`;
  const b = bbox([geom]); const k = Math.cos(rad((b[1] + b[3]) / 2));
  const w = (b[2] - b[0]) * k || 1e-9, h = (b[3] - b[1]) || 1e-9; const s = (size - 8) / Math.max(w, h);
  const ox = (size - w * s) / 2, oy = (size - h * s) / 2;
  const d = rings.map(r => 'M' + r.map(([x, y]) => ((x - b[0]) * k * s + ox).toFixed(1) + ',' + ((b[3] - y) * s + oy).toFixed(1)).join('L') + 'Z').join('');
  return `<svg class="thumb" viewBox="0 0 ${size} ${size}" aria-hidden="true"><path d="${d}" fill="${color}" fill-opacity=".28" stroke="${color}" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
}

// Import: GeoJSON (FeatureCollection/Feature/Geometry) o KML. Restituisce [{nome, geom}]
export function parseGeoFile(text, name = '') {
  const t = text.trim();
  if (t.startsWith('{') || t.startsWith('[')) {
    const j = JSON.parse(t); const out = [];
    const add = (g, props = {}) => { if (!g) return; if (g.type === 'Polygon' || g.type === 'MultiPolygon') out.push({ nome: props.name || props.nome || props.NOME || props.Name || '', geom: g, props }); else if (g.type === 'GeometryCollection') g.geometries.forEach(x => add(x, props)); };
    if (j.type === 'FeatureCollection') j.features.forEach(f => add(f.geometry, f.properties || {}));
    else if (j.type === 'Feature') add(j.geometry, j.properties || {});
    else add(j);
    return out;
  }
  if (t.startsWith('<')) {
    const xml = new DOMParser().parseFromString(t, 'text/xml');
    const out = [];
    xml.querySelectorAll('Placemark').forEach(pm => {
      const nome = pm.querySelector('name')?.textContent?.trim() || '';
      const polys = [...pm.querySelectorAll('Polygon')].map(p => {
        const ring = el => el ? el.textContent.trim().split(/\s+/).map(c => c.split(',').map(Number)).filter(c => c.length >= 2 && isFinite(c[0]) && isFinite(c[1])).map(c => [c[0], c[1]]) : null;
        const outer = ring(p.querySelector('outerBoundaryIs coordinates'));
        const inner = [...p.querySelectorAll('innerBoundaryIs coordinates')].map(ring);
        return outer ? [outer, ...inner] : null;
      }).filter(Boolean);
      if (polys.length === 1) out.push({ nome, geom: { type: 'Polygon', coordinates: polys[0] } });
      else if (polys.length > 1) out.push({ nome, geom: { type: 'MultiPolygon', coordinates: polys } });
    });
    return out;
  }
  throw new Error('Formato non riconosciuto: usa un file .geojson, .json o .kml');
}
