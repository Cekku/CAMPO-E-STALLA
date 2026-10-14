// Schermata "Oggi": meteo, cose da fare, latte, ultimi lavori
import { S, D, UI, azienda, get } from '../state.js';
import { esc, nf, eur, fd, fdLong, fdShort, weekday, today, sum, byDate, N, plural } from '../util.js';
import { ic } from '../icons.js';
import { allAlerts, campoHa, capoI, giac, cropColor, opCosto } from '../domain.js';
import { getMeteo, wmo, finestraTrattamenti } from '../meteo.js';
import { latteChart, spark } from './charts.js';
import { empty, newBtn } from '../ui.js';
import { sync } from '../store.js';
import { canInstall } from '../install.js';

const AREA = { stalla: ['cow', 'Stalla'], magazzino: ['package', 'Magazzino'], mezzi: ['tractor', 'Mezzi'], campi: ['sprout', 'Campi'], latte: ['milk', 'Latte'] };

function saluto() { const h = new Date().getHours(); return h < 13 ? 'Buongiorno' : h < 18 ? 'Buon pomeriggio' : 'Buonasera'; }

function meteoCard() {
  const { pos, data } = getMeteo();
  if (!pos) return `<section class="card meteo empty-meteo"><div class="mt-empty">${ic('cloud-sun', 'big')}<div><b>Meteo dei tuoi campi</b><p>Disegna i campi sulla mappa o imposta la posizione dell'azienda per vedere le previsioni e i giorni adatti ai trattamenti.</p></div><button class="btn sm" data-act="tab" data-tab="mappa">${ic('map')}Apri la mappa</button></div></section>`;
  if (!data) return `<section class="card meteo"><div class="mt-empty">${ic('cloud', 'big')}<div><b>Previsioni in arrivo</b><p>${navigator.onLine ? 'Sto scaricando il meteo…' : 'Serve la connessione per aggiornare il meteo.'}</p></div></div></section>`;
  const c = data.current, d = data.daily; const [icn, lab] = wmo(c.weather_code);
  const days = d.time.map((t, i) => { const [di] = wmo(d.weather_code[i]); const f = finestraTrattamenti(data, i); return `<div class="mt-day${i === 0 ? ' today' : ''}"><span class="mt-dn">${i === 0 ? 'oggi' : weekday(t)}</span>${ic(di)}<span class="mt-t"><b>${Math.round(d.temperature_2m_max[i])}°</b> ${Math.round(d.temperature_2m_min[i])}°</span><span class="mt-r${d.precipitation_sum[i] >= 1 ? ' wet' : ''}">${nf(d.precipitation_sum[i], 1)} mm</span><span class="mt-w" title="${esc(f.why)}"><i class="${f.ok ? 'ok' : 'no'}"></i>${f.ok ? 'tratt.' : ''}</span></div>`; }).join('');
  const rain7 = d.precipitation_sum.reduce((a, b) => a + b, 0), et7 = d.et0_fao_evapotranspiration.reduce((a, b) => a + b, 0);
  return `<section class="card meteo">
    <div class="mt-now"><div class="mt-big">${ic(icn)}<span>${Math.round(c.temperature_2m)}°</span></div><div class="mt-desc"><b>${esc(lab)}</b><span>${ic('wind')}${Math.round(c.wind_speed_10m)} km/h, raffiche ${Math.round(c.wind_gusts_10m)} · ${ic('droplets')}${c.relative_humidity_2m}%</span><span class="muted">${pos.src === 'campi' ? 'Sui tuoi campi' : 'Sede aziendale'} · Open-Meteo</span></div>
    <div class="mt-sum"><div><dt>Pioggia 7 gg</dt><dd>${nf(rain7, 1)} mm</dd></div><div><dt>ET₀ 7 gg</dt><dd>${nf(et7, 1)} mm</dd></div><div><dt>Bilancio</dt><dd class="${rain7 - et7 < 0 ? 'neg' : 'pos'}">${rain7 - et7 >= 0 ? '+' : ''}${nf(rain7 - et7, 1)} mm</dd></div></div></div>
    <div class="mt-days">${days}</div>
    <p class="mt-legend"><i class="ok"></i>Giorno adatto ai trattamenti: vento sotto 15 km/h, niente pioggia, massima sotto 28 °C</p>
  </section>`;
}

export function render() {
  const a = azienda(); const T = today();
  const nothing = !S.campi.length && !S.capi.length && !S.prodotti.length && !S.mezzi.length;
  const head = `<header class="hero"><div><span class="eyebrow">${esc(fdLong(T))}</span><h1>${saluto()}${a.nome ? ',<br><span class="hero-farm">' + esc(a.nome) + '</span>' : ''}</h1></div>${canInstall() ? `<button class="btn sm install-cta" data-act="install">${ic('smartphone')}Installa l'app</button>` : ''}</header>`;
  if (nothing) return { title: 'Oggi', html: head + `<section class="card welcome"><div class="wl-art">${ic('sprout', 'huge')}</div><div class="wl-body"><span class="eyebrow">Primo avvio</span><h2>Mettiamo in ordine l'azienda</h2><p>Disegna i campi sulla mappa, con il catasto sotto gli occhi. Poi aggiungi capi, prodotti e mezzi: quaderno di campagna, registro di stalla e magazzino si collegano da soli.</p><div class="btns"><button class="btn primary" data-act="tab" data-tab="mappa">${ic('map')}Disegna il primo campo</button>${newBtn('capi', 'Aggiungi un capo', '', '')}<button class="btn ghost" data-act="loadExamples">Prova con dati di esempio</button></div></div></section>` + meteoCard() };

  const ha = sum(S.campi, campoHa);
  const attivi = S.capi.filter(c => capoI(c).stato !== 'Uscita');
  const lat = attivi.filter(c => capoI(c).stato === 'In lattazione').length;
  const L = D.latte; const ul = L[L.length - 1];
  const last14 = []; for (let i = 13; i >= 0; i--) { const d = new Date(Date.parse(T) - i * 864e5).toISOString().slice(0, 10); const r = L.find(l => l.data === d); last14.push(r ? N(r.litri) : null); }
  const valore = sum(S.prodotti, p => Math.max(0, giac(p)) * N(p.prezzo));
  const sotto = S.prodotti.filter(p => N(p.scortaMin) > 0 && giac(p) < N(p.scortaMin)).length;
  const al = allAlerts();
  const ch = latteChart(30);
  const ops = [...S.operazioni].sort(byDate).reverse().slice(0, 5);
  const crops = new Map(); S.campi.forEach(c => { const k = c.coltura || 'Altro'; crops.set(k, (crops.get(k) || 0) + campoHa(c)); });

  return { title: 'Oggi', html: head + `
  <div class="kpis">
    <button class="kpi" data-act="tab" data-tab="campi"><span class="k-l">${ic('sprout')}Superficie</span><span class="k-v">${nf(ha, 2)}<small>ha</small></span><span class="k-s">${plural(S.campi.length, 'appezzamento', 'appezzamenti')}</span><span class="k-bar">${[...crops.entries()].map(([k, v]) => `<i style="flex:${v};background:${cropColor({ coltura: k })}"></i>`).join('')}</span></button>
    <button class="kpi" data-act="tab" data-tab="stalla"><span class="k-l">${ic('cow')}Mandria</span><span class="k-v">${lat}<small>in latte</small></span><span class="k-s">${plural(attivi.length, 'capo', 'capi')} in azienda</span></button>
    <button class="kpi" data-act="sub" data-tab="stalla" data-sec="stalla" data-sub="latte"><span class="k-l">${ic('milk')}Latte</span><span class="k-v">${ul ? nf(ul.litri, 0) : '—'}<small>litri</small></span><span class="k-s">${ul ? (ul.data === T ? 'oggi' : fdShort(ul.data)) : 'nessuna registrazione'}</span><span class="k-spark">${spark(last14)}</span></button>
    <button class="kpi" data-act="tab" data-tab="magazzino"><span class="k-l">${ic('package')}Magazzino</span><span class="k-v">${eur(valore)}</span><span class="k-s">${sotto ? `<b class="t-warn">${plural(sotto, 'prodotto', 'prodotti')} sotto scorta</b>` : 'scorte in regola'}</span></button>
  </div>
  <div class="grid-2">
    <div class="col">
      <section class="card"><div class="card-h"><h2>Da fare</h2><span class="count">${al.length}</span></div>
        <div class="alerts">${al.length ? al.slice(0, 12).map(x => { const [ai, an] = AREA[x.area] || ['info', '']; return `<button class="alert ${x.lv}" data-act="go" data-go='${esc(JSON.stringify(x.go))}'><span class="a-ic">${ic(ai)}</span><span class="a-tx"><b>${esc(x.t)}</b><span>${esc(x.s)}</span></span>${ic('chevron-right', 'chev')}</button>`; }).join('') + (al.length > 12 ? `<p class="more">e altre ${al.length - 12} segnalazioni</p>` : '') : `<div class="allgood">${ic('circle-check', 'big')}<b>Tutto in regola</b><span>Nessuna scadenza o intervento in sospeso.</span></div>`}</div></section>
    </div>
    <div class="col">
      ${meteoCard()}
      <section class="card"><div class="card-h"><h2>Latte, ultimi 30 giorni</h2><button class="btn sm ghost" data-act="new" data-form="latte">${ic('plus')}Registra</button></div>
        ${ch ? `<div class="chartbox">${ch.svg}</div><div class="legend"><span><i class="sw conf"></i>conferiti</span><span><i class="sw prod"></i>non conferiti</span><span class="sp"></span><span>media <b class="num">${nf(ch.avg, 0)} l/giorno</b></span></div>` : empty('milk', 'Nessuna registrazione', 'Registra ogni giorno litri prodotti e conferiti per vedere l\'andamento.')}</section>
      <section class="card"><div class="card-h"><h2>Ultimi lavori in campo</h2><button class="btn sm ghost" data-act="sub" data-tab="campi" data-sec="campi" data-sub="quaderno">Quaderno ${ic('chevron-right')}</button></div>
        <div class="list">${ops.length ? ops.map(opRow).join('') : empty('notebook-pen', 'Nessun lavoro registrato', 'Semine, trattamenti e raccolte compaiono qui.')}</div></section>
    </div>
  </div>` };
}

export function opRow(o) {
  const c = get('campi', o.campoId), p = get('prodotti', o.prodottoId), k = opCosto(o);
  return `<button class="row" data-act="edit" data-form="operazioni" data-id="${o.id}"><span class="r-dot" style="background:${c ? cropColor(c) : 'var(--muted)'}"></span><span class="r-main"><b>${esc(o.tipo || 'Operazione')} · ${esc(c ? c.nome : 'campo eliminato')}</b><span>${fd(o.data)}${p ? ' · ' + esc(p.nome) + ' ' + nf(o.quantita, 2) + ' ' + esc(p.unita || '') : ''}${o.avversita ? ' · ' + esc(o.avversita) : ''}${o.operatore ? ' · ' + esc(o.operatore) : ''}</span></span><span class="r-side">${k.tot ? `<span class="num">${eur(k.tot)}</span>` : ''}${k.ricavo ? `<span class="num t-ok">+${eur(k.ricavo)}</span>` : ''}${o.esempio ? '<span class="chip ghost">Esempio</span>' : ''}</span></button>`;
}
