// Meteo dei campi: situazione attuale, prossime 48 ore, 7 giorni con finestre per i trattamenti
import { esc, nf, weekday, fdShort } from '../util.js';
import { ic } from '../icons.js';
import { getMeteo, wmo, finestraTrattamenti } from '../meteo.js';
import { empty } from '../ui.js';
import { caldoCard } from '../caldo.js';

function hourlyChart(h) {
  const now = Date.now(); let i0 = h.time.findIndex(t => Date.parse(t) >= now - 3600e3); if (i0 < 0) i0 = 0;
  const idx = []; for (let i = i0; i < Math.min(h.time.length, i0 + 48); i++) idx.push(i);
  if (idx.length < 4) return '';
  const T = idx.map(i => h.temperature_2m[i]), R = idx.map(i => h.precipitation[i]);
  const tmin = Math.floor(Math.min(...T) - 1), tmax = Math.ceil(Math.max(...T) + 1), rmax = Math.max(2, ...R);
  const W = 720, H = 220, L = 34, Rr = 34, Tp = 16, B = 30, pw = W - L - Rr, ph = H - Tp - B, step = pw / (idx.length - 1);
  const yT = v => Tp + ph - (v - tmin) / (tmax - tmin) * ph, yR = v => Tp + ph - v / rmax * ph;
  let g = '';
  [tmin, (tmin + tmax) / 2, tmax].forEach(v => { g += `<line x1="${L}" x2="${W - Rr}" y1="${yT(v)}" y2="${yT(v)}" class="grid"/><text x="${L - 6}" y="${yT(v) + 4}" text-anchor="end" class="ax">${nf(v, 0)}°</text>`; });
  [0, rmax].forEach(v => { g += `<text x="${W - Rr + 6}" y="${yR(v) + 4}" class="ax rain">${nf(v, 1)} mm</text>`; });
  idx.forEach((i, k) => { const r = R[k]; if (r > 0) g += `<rect x="${L + k * step - step * .35}" y="${yR(r)}" width="${step * .7}" height="${Tp + ph - yR(r)}" class="rainbar"><title>${nf(r, 1)} mm</title></rect>`; const hh = h.time[i].slice(11, 13); if (hh === '00' && k > 0) g += `<line x1="${L + k * step}" x2="${L + k * step}" y1="${Tp}" y2="${Tp + ph}" class="midnight"/><text x="${L + k * step + 4}" y="${Tp + 10}" class="ax">${weekday(h.time[i].slice(0, 10))}</text>`; if (+hh % 6 === 0) g += `<text x="${L + k * step}" y="${H - 10}" text-anchor="middle" class="ax">${hh}</text>`; });
  g += `<path d="${idx.map((i, k) => (k ? 'L' : 'M') + (L + k * step).toFixed(1) + ',' + yT(T[k]).toFixed(1)).join('')}" class="templine"/>`;
  return `<div class="chart-scroll"><svg class="chart hourly" viewBox="0 0 ${W} ${H}" style="min-width:560px" role="img" aria-label="Temperatura e pioggia nelle prossime 48 ore">${g}</svg></div>`;
}

export function render() {
  const { pos, data, at } = getMeteo();
  if (!pos) return { title: 'Meteo', html: `<section class="card">${empty('cloud-sun', 'Manca la posizione', 'Disegna almeno un campo sulla mappa oppure inserisci latitudine e longitudine della sede in La mia azienda.', `<div class="btns center"><button class="btn action" data-act="nav" data-tab="mappa">${ic('map')}Apri la mappa</button><button class="btn" data-act="nav" data-tab="impostazioni">La mia azienda</button></div>`)}</section>` };
  if (!data) return { title: 'Meteo', html: `<section class="card">${empty('cloud', 'Previsioni in arrivo', navigator.onLine ? 'Sto scaricando il meteo per i tuoi campi…' : 'Serve la connessione per scaricare le previsioni.')}</section>` };
  const c = data.current, d = data.daily; const [icn, lab] = wmo(c.weather_code);
  const days = d.time.map((t, i) => { const [di, dl] = wmo(d.weather_code[i]); const f = finestraTrattamenti(data, i); return `<div class="md-row${i === 0 ? ' today' : ''}"><span class="md-d"><b>${i === 0 ? 'Oggi' : weekday(t)}</b><small>${fdShort(t)}</small></span><span class="md-ic">${ic(di)}<small>${esc(dl)}</small></span><span class="md-t"><b>${Math.round(d.temperature_2m_max[i])}°</b> ${Math.round(d.temperature_2m_min[i])}°</span><span class="md-r${d.precipitation_sum[i] >= 1 ? ' wet' : ''}">${ic('droplets')}${nf(d.precipitation_sum[i], 1)} mm <small>${d.precipitation_probability_max[i] ?? 0}%</small></span><span class="md-w">${ic('wind')}${Math.round(d.wind_speed_10m_max[i])} km/h</span><span class="md-et">ET₀ ${nf(d.et0_fao_evapotranspiration[i], 1)}</span><span class="chip ${f.ok ? 'ok' : ''}" title="${esc(f.why)}">${f.ok ? 'Trattamenti sì' : esc(f.why)}</span></div>`; }).join('');
  return { title: 'Meteo', html: `<section class="card meteo-hero"><div class="mh-now">${ic(icn)}<div><span class="mh-t">${Math.round(c.temperature_2m)}°</span><b>${esc(lab)}</b><span>${pos.src === 'campi' ? 'Al centro dei tuoi campi' : 'Sede aziendale'} · ${pos.lat.toFixed(3)}, ${pos.lon.toFixed(3)}</span></div></div>
    <div class="mh-facts"><div><dt>Vento</dt><dd>${Math.round(c.wind_speed_10m)} km/h</dd><small>raffiche ${Math.round(c.wind_gusts_10m)}</small></div><div><dt>Umidità</dt><dd>${c.relative_humidity_2m}%</dd></div><div><dt>Oggi</dt><dd>${Math.round(d.temperature_2m_min[0])}° / ${Math.round(d.temperature_2m_max[0])}°</dd></div><div><dt>Pioggia 7 gg</dt><dd>${nf(d.precipitation_sum.reduce((a, b) => a + b, 0), 1)} mm</dd></div></div></section>
  ${caldoCard({ sempre: true })}
  ${data.hourly ? `<section class="card"><div class="card-h"><h2>Prossime 48 ore</h2><span class="muted small">temperatura e pioggia</span></div><div class="chartbox">${hourlyChart(data.hourly)}</div></section>` : ''}
  <section class="card"><div class="card-h"><h2>Prossimi 7 giorni</h2></div><div class="md-list">${days}</div><p class="mt-legend">Trattamenti sì: vento sotto 15 km/h, niente pioggia prevista, massima sotto 28 °C. ET₀ = evapotraspirazione di riferimento in mm.</p></section>
  <p class="muted small">Previsioni Open-Meteo.com${at ? ', aggiornate alle ' + new Date(at).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) : ''}.</p>` };
}
