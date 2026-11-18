// Meteo dei campi da Open-Meteo (gratuito, senza chiave), con copia locale per l'uso offline
import { S, azienda, bus } from './state.js';
import { lsGet, lsSet } from './util.js';
import { centroid } from './geo.js';

const WMO = {
  0: ['sun', 'Sereno'], 1: ['sun', 'Poco nuvoloso'], 2: ['cloud-sun', 'Parz. nuvoloso'], 3: ['cloud', 'Coperto'],
  45: ['cloud-fog', 'Nebbia'], 48: ['cloud-fog', 'Nebbia con brina'],
  51: ['cloud-drizzle', 'Pioviggine'], 53: ['cloud-drizzle', 'Pioviggine'], 55: ['cloud-drizzle', 'Pioviggine intensa'],
  56: ['cloud-drizzle', 'Pioviggine gelata'], 57: ['cloud-drizzle', 'Pioviggine gelata'],
  61: ['cloud-rain', 'Pioggia debole'], 63: ['cloud-rain', 'Pioggia'], 65: ['cloud-rain', 'Pioggia forte'],
  66: ['cloud-rain', 'Pioggia gelata'], 67: ['cloud-rain', 'Pioggia gelata'],
  71: ['cloud-snow', 'Neve debole'], 73: ['cloud-snow', 'Neve'], 75: ['cloud-snow', 'Neve forte'], 77: ['cloud-snow', 'Granuli di neve'],
  80: ['cloud-rain', 'Rovesci'], 81: ['cloud-rain', 'Rovesci'], 82: ['cloud-rain', 'Rovesci forti'],
  85: ['cloud-snow', 'Rovesci di neve'], 86: ['cloud-snow', 'Rovesci di neve'],
  95: ['cloud-lightning', 'Temporale'], 96: ['cloud-lightning', 'Temporale con grandine'], 99: ['cloud-lightning', 'Temporale con grandine'],
};
export const wmo = c => WMO[c] || ['cloud', '—'];

export function farmPosition() {
  const a = azienda();
  if (a.lat && a.lon) return { lat: +a.lat, lon: +a.lon, src: 'azienda' };
  const cs = S.campi.filter(c => c.geom).map(c => centroid(c.geom)).filter(Boolean);
  if (cs.length) return { lat: cs.reduce((t, c) => t + c[1], 0) / cs.length, lon: cs.reduce((t, c) => t + c[0], 0) / cs.length, src: 'campi' };
  return null;
}

let inflight = null;
export function getMeteo() {
  const pos = farmPosition(); if (!pos) return { pos: null, data: null };
  const key = 'v2:' + pos.lat.toFixed(2) + ',' + pos.lon.toFixed(2);
  const cache = lsGet('ces.meteo', null);
  const fresh = cache && cache.key === key && Date.now() - cache.at < 3 * 3600e3;
  if (!fresh && !inflight && navigator.onLine) {
    const u = `https://api.open-meteo.com/v1/forecast?latitude=${pos.lat.toFixed(4)}&longitude=${pos.lon.toFixed(4)}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,wind_gusts_10m,precipitation,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,et0_fao_evapotranspiration&hourly=temperature_2m,precipitation,wind_speed_10m,relative_humidity_2m,weather_code&past_days=0&forecast_days=7&timezone=Europe%2FRome&wind_speed_unit=kmh`;
    inflight = fetch(u).then(r => r.ok ? r.json() : Promise.reject(r.status)).then(j => { lsSet('ces.meteo', { key, at: Date.now(), j }); bus.render(); }).catch(() => { }).finally(() => { inflight = null; });
  }
  return { pos, data: cache && cache.key === key ? cache.j : null, at: cache && cache.at };
}

// Finestra utile per i trattamenti: vento sotto 15 km/h, niente pioggia prevista, temperatura sotto 28 °C
export function finestraTrattamenti(d, i) {
  const vento = d.daily.wind_speed_10m_max[i], pioggia = d.daily.precipitation_sum[i], prob = d.daily.precipitation_probability_max[i], tmax = d.daily.temperature_2m_max[i];
  if (pioggia >= 1 || prob >= 60) return { ok: false, why: 'pioggia prevista' };
  if (vento > 15) return { ok: false, why: 'vento ' + Math.round(vento) + ' km/h' };
  if (tmax > 28) return { ok: false, why: 'troppo caldo' };
  return { ok: true, why: 'vento debole, asciutto' };
}

// Meteo al momento di un trattamento (1.54.0): temperatura, umidità e vento all'ora indicata, pioggia delle 24 ore prima.
// Ultimi 2 mesi e prossimi giorni dall'API delle previsioni, prima dall'archivio storico (ERA5, pronto dopo ~5 giorni).
const METEO_ORA = new Map();
export async function meteoAlMomento(data, ora) {
  const pos = farmPosition(); if (!pos || !/^\d{4}-\d{2}-\d{2}$/.test(data || '')) return null;
  const hp = parseInt((ora || '10:00').slice(0, 2), 10); const h = isNaN(hp) ? 10 : Math.min(23, Math.max(0, hp));
  const prima = new Date(data + 'T12:00:00'); prima.setDate(prima.getDate() - 1); const d0 = prima.toISOString().slice(0, 10);
  const giorni = (Date.now() - new Date(data + 'T12:00:00').getTime()) / 864e5;
  if (giorni < -15) return null;   // troppo avanti: niente previsione
  const host = giorni > 60 ? 'https://archive-api.open-meteo.com/v1/archive' : 'https://api.open-meteo.com/v1/forecast';
  const u = `${host}?latitude=${pos.lat.toFixed(4)}&longitude=${pos.lon.toFixed(4)}&hourly=temperature_2m,relative_humidity_2m,wind_speed_10m,precipitation&start_date=${d0}&end_date=${data}&timezone=Europe%2FRome&wind_speed_unit=kmh`;
  let j = METEO_ORA.get(u);
  if (!j) { const r = await fetch(u); if (!r.ok) throw new Error('Meteo non disponibile (' + r.status + ')'); j = await r.json(); METEO_ORA.set(u, j); }
  const t = (j.hourly && j.hourly.time) || []; const i = t.indexOf(data + 'T' + String(h).padStart(2, '0') + ':00');
  if (i < 0) return null;
  const val = (k, d = 1) => { const v = j.hourly[k][i]; return v === null || v === undefined ? null : Math.round(v * 10 ** d) / 10 ** d; };
  let pioggia = 0; for (let k = Math.max(0, i - 23); k <= i; k++) pioggia += j.hourly.precipitation[k] || 0;
  if (val('temperature_2m') === null) return null;
  return { temp: val('temperature_2m'), umidita: val('relative_humidity_2m', 0), ventoKmh: val('wind_speed_10m'), pioggia24: Math.round(pioggia * 10) / 10, ora: String(h).padStart(2, '0') + ':00', fonte: giorni > 60 ? 'archivio' : 'previsioni' };
}
