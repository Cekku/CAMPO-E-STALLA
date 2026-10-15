// Service worker: app disponibile offline, mappe e meteo in copia locale
const VERSION = 'ces-1.2.2';
const SHELL = [
  './', './index.html', './manifest.webmanifest', './css/app.css',
  './js/app.js', './js/state.js', './js/util.js', './js/icons.js', './js/geo.js', './js/domain.js', './js/store.js', './js/config.js', './js/ui.js', './js/forms.js', './js/map.js', './js/meteo.js', './js/install.js', './js/esempi.js', './js/version.js',
  './js/views/oggi.js', './js/views/campi.js', './js/views/stalla.js', './js/views/magazzino.js', './js/views/mezzi.js', './js/views/impostazioni.js', './js/views/charts.js', './js/views/attivita.js', './js/views/note.js', './js/views/meteo.js', './js/wizard.js',
  './vendor/leaflet/leaflet.js', './vendor/leaflet/leaflet.css', './vendor/geoman/leaflet-geoman.min.js', './vendor/geoman/leaflet-geoman.css', './vendor/supabase/supabase.js',
  './icons/icon-192.png', './icons/icon-512.png', './icons/maskable-512.png', './icons/apple-touch-icon.png', './icons/favicon-64.png',
];
const TILE_CACHE = 'ces-tiles-2', TILE_MAX = 3000, RT_CACHE = 'ces-runtime';

self.addEventListener('install', e => { self.skipWaiting(); e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL))); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('ces-') && ![VERSION, TILE_CACHE, RT_CACHE].includes(k)).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('message', e => { if (e.data === 'skipWaiting') self.skipWaiting(); });

async function trim(name, max) { const c = await caches.open(name); const keys = await c.keys(); if (keys.length > max) for (const k of keys.slice(0, keys.length - max)) await c.delete(k); }

self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // dati e autenticazione: sempre dalla rete
  if (url.hostname.endsWith('supabase.co') || url.hostname.includes('nominatim') || url.search.includes('GetFeatureInfo')) return;
  // pezzi di mappa (satellite, stradale, catasto): prima la copia locale, aggiornata in background
  if (/arcgisonline|arcgis\.com|tile\.openstreetmap|opentopomap|cartografia\.agenziaentrate|regione\.fvg/.test(url.hostname)) {
    e.respondWith(caches.open(TILE_CACHE).then(async c => {
      const hit = await c.match(req);
      const net = fetch(req).then(r => { if (r && r.ok) { c.put(req, r.clone()); trim(TILE_CACHE, TILE_MAX); } return r; }).catch(() => hit || Response.error());
      return hit || net;
    }));
    return;
  }
  // meteo e caratteri: rete con ripiego sulla copia
  if (/open-meteo|fonts\.(googleapis|gstatic)/.test(url.hostname)) {
    e.respondWith(caches.open(RT_CACHE).then(async c => { try { const r = await fetch(req); if (r && (r.ok || r.type === 'opaque')) c.put(req, r.clone()); return r; } catch (err) { const hit = await c.match(req); if (hit) return hit; throw err; } }));
    return;
  }
  // app: prima la rete (così gli aggiornamenti arrivano subito), copia locale se offline
  if (url.origin === location.origin) {
    e.respondWith(fetch(req, { cache: 'no-cache' }).then(r => { if (r.ok) { const cp = r.clone(); caches.open(VERSION).then(c => c.put(req, cp)); } return r; })
      .catch(() => caches.match(req, { ignoreSearch: req.mode === 'navigate' }).then(hit => hit || caches.match('./index.html'))));
  }
});
