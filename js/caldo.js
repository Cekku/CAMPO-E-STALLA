// Stress da caldo per le vacche: THI ora per ora dalle previsioni Open-Meteo (temperatura e umidità), livelli, consigli e avvisi
import { S } from './state.js';
import { esc, nf, weekday, fdShort, today, diff } from './util.js';
import { ic } from './icons.js';
import { getMeteo } from './meteo.js';
import { extraAlerts, capoI } from './domain.js';

// THI (formula NRC 1971), T in °C e umidità relativa in %
export const thi = (t, ur) => (1.8 * t + 32) - (0.55 - 0.0055 * ur) * (1.8 * t - 26);

// Livelli per vacche da latte: da 68 inizia lo stress per le alte produttrici, da 72 è chiaro
const LIVELLI = [
  { da: 89, n: 4, l: 'Stress grave', cls: 'bad' },
  { da: 79, n: 3, l: 'Stress forte', cls: 'bad' },
  { da: 72, n: 2, l: 'Stress moderato', cls: 'warn' },
  { da: 68, n: 1, l: 'Stress lieve', cls: 'hay' },
  { da: -99, n: 0, l: 'Nessuno stress', cls: 'ok' },
];
export const livello = v => LIVELLI.find(x => v >= x.da);

const LIEVE = ['Acqua fresca e pulita sempre a disposizione, controlla che gli abbeveratoi non restino vuoti.', 'Ventilatori accesi nelle ore calde.'];
const MODERATO = ['Ventilatori sempre accesi, docce o nebulizzatori nelle ore più calde.', 'Razione nelle ore fresche (mattina presto e sera) e avvicinamento del cibo più spesso.', 'Più acqua del solito: controlla abbeveratoi e portata.'];
const FORTE = ['Non spostare né trattare gli animali nelle ore calde: fecondazioni, pareggi e trasporti al mattino presto.', 'Tieni d\'occhio vacche fresche di parto, a fine gravidanza e le più produttive: respiro affannoso e bocca aperta sono un segnale di allarme.', 'Parla con il nutrizionista della razione estiva (energia, fibra, sali, tamponi).'];
const CONSIGLI = [[], LIEVE, MODERATO, [...MODERATO, ...FORTE]];
export const consigli = n => CONSIGLI[Math.min(n, 3)];

// Un riepilogo per ogni giorno di previsione con le 24 ore complete
export function giorniCaldo(data) {
  const h = data && data.hourly; if (!h || !h.time || !h.relative_humidity_2m) return [];
  const per = new Map();
  h.time.forEach((t, i) => {
    const T = h.temperature_2m[i], U = h.relative_humidity_2m[i]; if (T == null || U == null) return;
    const d = t.slice(0, 10); if (!per.has(d)) per.set(d, []);
    per.get(d).push({ ora: +t.slice(11, 13), t: T, ur: U, v: thi(T, U) });
  });
  return [...per.entries()].filter(([, ore]) => ore.length >= 20).map(([data, ore]) => {
    const picco = ore.reduce((a, b) => (b.v > a.v ? b : a));
    const max = picco.v, lv = livello(Math.round(max));   // livello sul numero mostrato: 78,6 → 79 = forte
    return { data, ore, max, min: Math.min(...ore.map(o => o.v)), picco, tmax: Math.max(...ore.map(o => o.t)), ore68: ore.filter(o => o.v >= 68).length, ore72: ore.filter(o => o.v >= 72).length, fresche: ore.filter(o => o.v < 68).length, lv };
  });
}

export function caldo() {
  const { data } = getMeteo(); const T = today();
  const giorni = giorniCaldo(data).filter(g => g.data >= T);
  const peggiore = giorni.reduce((a, g) => (!a || g.max > a.max ? g : a), null);
  return { giorni, peggiore, attivo: giorni.some(g => g.lv.n >= 1) };
}

const nomeGiorno = d => { const n = diff(today(), d); if (n === 0) return 'Oggi'; if (n === 1) return 'Domani'; const w = weekday(d); return w[0].toUpperCase() + w.slice(1); };
const GIORNI = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
const quando = d => { const n = diff(today(), d); return n === 0 ? 'oggi' : n === 1 ? 'domani' : GIORNI[new Date(d + 'T12:00').getDay()] + ' ' + fdShort(d); };
const oraTxt = o =>String(o).padStart(2, '0') + ':00';

// Giorni di fila con THI massimo da 72 in su, prima e dopo g (dentro i giorni di previsione)
function ondata(giorni, g) {
  const i = giorni.indexOf(g), su = x => x.lv.n >= 2; if (!su(g)) return 0;
  let a = i, b = i; while (a > 0 && su(giorni[a - 1])) a--; while (b < giorni.length - 1 && su(giorni[b + 1])) b++;
  return b - a + 1;
}

function frase(g, giorni) {
  const parti = [`THI fino a <b>${nf(g.max, 0)}</b> verso le ${oraTxt(g.picco.ora)} (${nf(g.picco.t, 0)} °C, umidità ${Math.round(g.picco.ur)}%)`];
  if (g.ore72) parti.push(`${g.ore72} ore sopra 72`);
  if (g.lv.n >= 2 && g.fresche < 6) parti.push(g.fresche ? `solo ${g.fresche} ore fresche per recuperare` : 'nessuna ora fresca, nemmeno di notte');
  const od = ondata(giorni, g); if (od >= 3) parti.push(`${od} giorni di fila sopra 72`);
  return parti.join(' · ');
}

// Riquadro per la dashboard di stalla e per il meteo; vuoto se nei prossimi giorni non c'è stress
export function caldoCard({ sempre = false } = {}) {
  const { giorni, peggiore, attivo } = caldo();
  if (!giorni.length || (!attivo && !sempre)) return '';
  if (!attivo) return `<section class="card caldo"><div class="card-h"><h2>${ic('thermometer')}Caldo per le vacche</h2><span class="chip ok">Nessuno stress</span></div><p class="muted small">Nei prossimi ${giorni.length} giorni il THI resta sotto 68 (massimo ${nf(peggiore.max, 0)}).</p></section>`;
  const lattazione = S.capi.filter(c => capoI(c).stato === 'In lattazione').length;
  const tiles = giorni.map(g => `<div class="cd-day ${g.lv.cls}${g === peggiore ? ' peak' : ''}" title="${esc(g.lv.l)}"><span class="cd-d"><b>${esc(nomeGiorno(g.data))}</b><small>${fdShort(g.data)}</small></span><span class="cd-v num">${nf(g.max, 0)}</span><span class="cd-s">${nf(g.tmax, 0)}° max</span><span class="cd-h">${g.ore72 ? g.ore72 + ' h sopra 72' : g.ore68 ? g.ore68 + ' h sopra 68' : 'nessuna ora calda'}</span></div>`).join('');
  return `<section class="card caldo ${peggiore.lv.n >= 3 ? 'alarm' : ''}"><div class="card-h"><h2>${ic('thermometer')}Caldo per le vacche</h2><span class="chip ${peggiore.lv.cls}">${esc(peggiore.lv.l)}</span></div>
  <div class="cd-days">${tiles}</div>
  <div class="cd-msg ${peggiore.lv.cls}"><p><b>${esc(nomeGiorno(peggiore.data))} ${fdShort(peggiore.data)}: ${esc(peggiore.lv.l.toLowerCase())}.</b> ${frase(peggiore, giorni)}.</p>
  <ul>${consigli(peggiore.lv.n).map(c => `<li>${esc(c)}</li>`).join('')}</ul>
  ${lattazione ? `<p class="muted small">${lattazione} vacche in lattazione. Il calo del latte di solito arriva 1-2 giorni dopo le giornate più calde.</p>` : ''}</div>
  <p class="mt-legend">THI = indice di temperatura e umidità, il numero più alto della giornata. Sotto 68 nessuno stress · 68-71 lieve · 72-78 moderato · 79-88 forte · da 89 grave. Nelle giornate più calde la stalla può essere 1-2 °C più calda della previsione.</p></section>`;
}

// Avviso tra le cose da fare in stalla: il giorno peggiore tra oggi e i prossimi 2, se lo stress è almeno moderato
extraAlerts.push(() => {
  if (!S.capi.length) return [];
  const { giorni } = caldo(); const T = today();
  const vicini = giorni.filter(g => diff(T, g.data) <= 2 && g.lv.n >= 2); if (!vicini.length) return [];
  const g = vicini.reduce((a, b) => (b.max > a.max ? b : a));
  return [{ lv: g.lv.n >= 3 ? 'bad' : 'warn', area: 'stalla', t: g.lv.l + ' per le vacche ' + quando(g.data), s: 'THI fino a ' + nf(g.max, 0) + ' verso le ' + oraTxt(g.picco.ora) + (g.ore72 ? ' · ' + g.ore72 + ' ore sopra 72' : '') + ' — ' + consigli(g.lv.n)[g.lv.n >= 3 ? MODERATO.length : 0].replace(/\.$/, ''), go: { tab: 'meteo' } }];
});
