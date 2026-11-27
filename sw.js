// Service worker: app disponibile offline, mappe e meteo in copia locale
const VERSION = 'ces-1.81.0';
const SHELL = [
  './', './index.html', './manifest.webmanifest', './css/app.css',
  './js/app.js', './js/state.js', './js/util.js', './js/icons.js', './js/geo.js', './js/confine-fvg.js', './js/domain.js', './js/store.js', './js/config.js', './js/ui.js', './js/forms.js', './js/elenchi.js', './js/map.js', './js/meteo.js', './js/install.js', './js/nativo.js', './js/esempi.js', './js/version.js', './js/checks.js', './js/fitodb.js', './js/fitoabbina.js', './js/registro.js', './js/pcg.js', './js/particelle.js', './js/nlp.js', './js/herd.js', './js/ndvi.js',
  './js/views/oggi.js', './js/views/campi.js', './js/views/stalla.js', './js/views/magazzino.js', './js/views/inventario.js', './js/magfatture.js', './js/views/magfatture.js', './js/magriconosci.js', './js/auto-magazzino.js', './js/views/mezzi.js', './js/nitrati.js', './js/views/nitrati.js', './js/views/carichi.js','./js/views/impostazioni.js', './js/views/charts.js', './js/views/attivita.js', './js/views/note.js', './js/views/meteo.js', './js/views/stalle.js', './js/wizard.js', './js/agenda.js', './js/razauto.js', './js/automazioni.js', './js/automazioni-agganci.js', './js/copia-pc.js', './js/copia-conta.js', './js/views/automatico.js', './js/aia.js', './js/views/aia-view.js', './js/caldo.js', './js/auto-latte.js', './js/latte-fattura.js', './js/report.js', './js/auto-report.js', './js/views/report.js', './js/notizie.js', './js/views/notizie.js', './js/views/sicurezza.js', './js/errori.js', './js/errori-avvio.js', './js/views/errori.js', './supabase/functions/_shared/mercati.js', './supabase/functions/_shared/sicurezza.js',
  './js/views/conti.js', './js/views/conti-centri.js', './js/conti/centri.js', './js/views/conti-sistema.js', './js/views/conti-grafici.js', './js/views/conti-salute.js', './js/conti/salute.js', './js/conti/sistema.js', './js/views/conti-documenti.js', './js/views/conti-sospesi.js', './js/views/conti-preventivi.js', './js/conti/preventivi.js', './js/views/conti-beni.js', './js/conti/beni.js', './js/views/conti-rica.js', './js/conti/rica.js', './js/conti/automatico.js', './js/views/conti-automatico.js', './js/views/conti-regime.js', './js/conti/regime.js', './js/views/conti-terreni.js', './js/conti/terreni.js', './js/conti/originali.js', './js/conti/sospesi.js', './js/views/conti-fatture.js', './js/views/conti-bilancio.js', './js/conti/analisi.js', './js/conti/riferimenti.js', './js/conti/bilancino-parse.js', './js/conti/dati.js', './js/conti/fatture-parse.js', './js/conti/grafici.js', './js/conti/importa.js', './js/conti/iva-parse.js', './js/conti/pdftext.js', './js/conti/regole.js', './js/conti/schema.js', './js/conti/tabelle.js', './js/conti/xlsx.js', './js/conti/zip.js', './js/lock.js', './js/conti/ocr-bilancino.js', './js/conti/alfabeto.js', './js/conti/paghe-parse.js', './js/conti/paghe.js', './js/conti/scarti.js', './js/conti/dubbi.js', './js/views/conti-personale.js', './js/views/conti-verifiche.js', './js/conti/elenco.js', './js/conti/rls.js', './js/conti/bonifici-parse.js', './js/conti/banca.js', './js/conti/ocr-testo.js', './js/catasto.js', './js/catastomappa.js', './data/comuni.json', './js/conti/personale-doc.js', './js/conti/personale-auto.js', './js/auto-personale.js',
  './js/trattori.js', './js/allegati.js', './js/views/libretto.js', './js/trattore3d.js', './js/stalla3d.js', './js/views/progetto3d.js', './js/tracciabilita.js', './js/views/tracciabilita.js', './js/quaderno.js', './js/views/quaderno.js', './js/guida.js', './js/views/guida.js', './js/auto-stalla.js', './js/siallevauto.js', './js/gasolio.js',
  './js/views/archivio.js', './js/views/archivio-dati.js', './js/archivio-link.js', './js/chiedi/strumenti.js', './js/chiedi/motori.js', './js/chiedi/pannello.js', './js/ia-pc.js',
  './vendor/pdfjs/pdf.min.mjs', './vendor/pdfjs/pdf.worker.min.mjs',
  './vendor/leaflet/leaflet.js', './vendor/leaflet/leaflet.css', './vendor/geoman/leaflet-geoman.min.js', './vendor/geoman/leaflet-geoman.css', './vendor/supabase/supabase.js',
  './icons/icon-192.png', './icons/icon-512.png', './icons/maskable-512.png', './icons/apple-touch-icon.png', './icons/favicon-64.png',
  './fonts/fonts.css', './fonts/plex-sans-latin.woff2', './fonts/plex-sans-latin-ext.woff2', './fonts/newsreader-latin.woff2', './fonts/newsreader-latin-ext.woff2',
  './fonts/newsreader-italic-latin.woff2', './fonts/newsreader-italic-latin-ext.woff2', './fonts/plex-mono-500-latin.woff2', './fonts/plex-mono-500-latin-ext.woff2',
  './fonts/plex-mono-600-latin.woff2', './fonts/plex-mono-600-latin-ext.woff2',
];
const TILE_CACHE = 'ces-tiles-2', TILE_MAX = 3000, RT_CACHE = 'ces-runtime', CAT_CACHE = 'ces-catasto-1'; // CAT_CACHE: catasto disegnato (js/catastomappa.js)
const ALL_CACHE = 'ces-allegati-1'; // fatture e foto degli interventi sui mezzi (js/allegati.js): mai cancellata
// librerie grandi e modelli 3D fuori da SHELL (lettura ottica 9 MB, three.js, shapefile, caratteri di pdf.js, modelli/*.glb): restano
// fra una versione e l'altra, così non si riscaricano a ogni rilascio. CAMBIARE IL NOME quando si aggiorna una di queste librerie in vendor/.
const LIB_CACHE = 'ces-librerie-1';

// dalla 1.76.0 l'app si apre dalla copia di questa versione (prima chiedeva alla rete ogni file a ogni apertura: con poco segnale restava
// ferma). Il service worker nuovo scarica la sua copia e poi aspetta: la pagina lo mette alla prossima apertura o con "Aggiorna" (js/app.js).
// 'no-cache': ogni file si ricontrolla con il server (se non è cambiato risponde 304 e non si riscarica).
self.addEventListener('install', e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'no-cache' }))))); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('ces-') && ![VERSION, TILE_CACHE, RT_CACHE, CAT_CACHE, ALL_CACHE, LIB_CACHE].includes(k)).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('message', e => { if (e.data === 'skipWaiting') self.skipWaiting(); });

async function trim(name, max) { const c = await caches.open(name); const keys = await c.keys(); if (keys.length > max) for (const k of keys.slice(0, keys.length - max)) await c.delete(k); }
// le immagini della mappa cambiano di rado: una copia con meno di 30 giorni si usa senza riscaricarla (prima ogni tessera mostrata
// partiva comunque anche dalla rete, e occupava le 6 connessioni per sito che servono alle tessere nuove). 'x-ces-at' = quando è stata salvata.
const TILE_FRESCA = 30 * 864e5; let salvate = 0;
async function salvaTessera(c, req, r) {
  const h = new Headers({ 'content-type': r.headers.get('content-type') || 'image/jpeg', 'x-ces-at': String(Date.now()) });
  await c.put(req, new Response(await r.blob(), { status: r.status, statusText: r.statusText, headers: h }));
  if (++salvate % 50 === 0) trim(TILE_CACHE, TILE_MAX);   // trim legge l'elenco di tutte le tessere: non a ogni salvataggio
}

self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // dati e autenticazione: sempre dalla rete
  if (url.hostname.endsWith('supabase.co') || url.hostname.includes('nominatim') || url.search.includes('GetFeatureInfo') || url.hostname.includes('anthropic.com')) return;
  // indice di vegetazione: le interrogazioni sempre dalla rete, le immagini in copia locale
  if (url.hostname.startsWith('sentinel.') && !url.pathname.endsWith('/exportImage')) return;
  // ortofoto della Regione FVG: risponde senza CORS e con no-store, quindi non si può tenere in copia; passa diretta al browser
  if (url.hostname.endsWith('regione.fvg.it')) return;
  // ponte dell'archivio sul PC (porta 1236): mai dalla copia
  if (url.port === '1236') return;
  // pezzi di mappa (satellite, stradale, catasto): prima la copia locale; dalla rete solo se manca o ha più di 30 giorni
  if (/arcgisonline|arcgis\.com|tile\.openstreetmap|opentopomap|cartografia\.agenziaentrate/.test(url.hostname)) {
    e.respondWith(caches.open(TILE_CACHE).then(async c => {
      const hit = await c.match(req);
      if (hit && Date.now() - +(hit.headers.get('x-ces-at') || 0) < TILE_FRESCA) return hit;
      const net = fetch(req);
      // il salvataggio si registra subito (prima che la risposta arrivi alla pagina), così il service worker non viene fermato a metà
      e.waitUntil(net.then(r => r && r.ok ? salvaTessera(c, req, r.clone()) : null).catch(() => { }));
      return hit || net.catch(() => Response.error());
    }));
    return;
  }
  // caratteri: dalla copia (il foglio dei caratteri bloccava la pagina finché la rete non rispondeva); la prima volta dalla rete,
  // il foglio di Google si rinfresca dietro le quinte
  if (/fonts\.(googleapis|gstatic)/.test(url.hostname)) {
    e.respondWith(caches.open(RT_CACHE).then(async c => {
      const hit = await c.match(req);
      const net = fetch(req).then(r => r && (r.ok || r.type === 'opaque') ? c.put(req, r.clone()).then(() => r) : r);
      if (!hit) return net;
      if (url.hostname.startsWith('fonts.googleapis')) e.waitUntil(net.catch(() => { }));
      return hit;
    }));
    return;
  }
  // meteo: rete con ripiego sulla copia
  if (/open-meteo/.test(url.hostname)) {
    e.respondWith(caches.open(RT_CACHE).then(async c => { try { const r = await fetch(req); if (r && (r.ok || r.type === 'opaque')) c.put(req, r.clone()); return r; } catch (err) { const hit = await c.match(req); if (hit) return hit; throw err; } }));
    return;
  }
  if (url.origin !== location.origin) return;
  // dati che cambiano senza una versione nuova (data/fitosanitari.json, scritto dallo script del PC e letto con fetch e cache 'no-cache'):
  // prima la rete, copia in ces-runtime (resta fra le versioni). Solo le letture fatte con fetch (destination vuota): pagine, moduli, fogli
  // di stile e caratteri restano dalla copia anche quando il browser li chiede 'no-cache' ricaricando (Firefox lo fa anche per i moduli)
  const dati = req.destination === '' && (req.cache === 'no-cache' || req.cache === 'reload' || req.cache === 'no-store');
  if (dati || url.pathname.endsWith('/data/fitosanitari.json')) {
    e.respondWith(caches.open(RT_CACHE).then(c => fetch(req).then(r => { if (r.ok) { const cp = r.clone(); e.waitUntil(c.put(req, cp)); } return r; })
      .catch(err => caches.match(req).then(hit => { if (hit) return hit; throw err; }))));
    return;
  }
  // app: dalla copia di questa versione, anche con la rete (si apre subito); un file che manca si prende dalla rete e si tiene
  e.respondWith((async () => {
    const nav = req.mode === 'navigate';
    const hit = await caches.match(req, { cacheName: VERSION, ignoreSearch: nav });
    if (hit) return hit;
    const lib = /\/(vendor|modelli)\//.test(url.pathname);
    if (lib) { const v = await caches.match(req, { cacheName: LIB_CACHE }); if (v) return v; }
    try {
      const r = await fetch(req);
      if (r.ok && r.type === 'basic') { const cp = r.clone(); e.waitUntil(caches.open(lib ? LIB_CACHE : VERSION).then(c => c.put(req, cp))); }
      return r;
    } catch (err) {
      const old = await caches.match(req, { ignoreSearch: nav }) || (nav && await caches.match('./index.html', { cacheName: VERSION }));
      if (old) return old;
      throw err;
    }
  })());
});
