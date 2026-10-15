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
