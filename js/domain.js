// Regole agronomiche e zootecniche: costanti e dati derivati
import { S, D, UI, get } from './state.js';
import { N, okD, addDays, diff, today, yearOf, sum, byDate, fd, eta, nf } from './util.js';
import { areaHa } from './geo.js';

export const COLTURE = ['Mais da granella', 'Mais trinciato', 'Frumento tenero', 'Frumento duro', 'Orzo', 'Triticale', 'Soia', 'Erba medica', 'Prato polifita', 'Loiessa', 'Sorgo', 'Girasole', 'Colza', 'Barbabietola', 'Vite', 'Pomodoro da industria', 'Riposo'];
export const TIPI_OP = ['Lavorazione terreno', 'Semina', 'Concimazione', 'Trattamento fitosanitario', 'Diserbo', 'Irrigazione', 'Sfalcio', 'Raccolta', 'Altro'];
export const OP_PROD = ['Semina', 'Concimazione', 'Trattamento fitosanitario', 'Diserbo', 'Irrigazione', 'Altro'];
export const CATEGORIE = ['Fitofarmaco', 'Diserbante', 'Concime', 'Seme', 'Mangime', 'Foraggio', 'Farmaco veterinario', 'Gasolio', 'Altro'];
export const UNITA = ['kg', 'l', 'q', 't', 'dosi', 'pz'];
export const TIPI_MEZZO = ['Trattore', 'Mietitrebbia', 'Carro miscelatore', 'Rimorchio', 'Irroratrice', 'Attrezzo', 'Pick-up', 'Altro'];
export const TIPI_MAN = ['Tagliando', 'Riparazione', 'Pneumatici', 'Revisione', 'Altro'];
export const RAZZE = ['Frisona', 'Bruna', 'Pezzata Rossa', 'Jersey', 'Simmental', 'Rendena', 'Incrocio', 'Altra'];
export const GRUPPI = ['Alta produzione', 'Media produzione', 'Bassa produzione', 'Fresche', 'Asciutta', 'Preparto', 'Manze', 'Vitelle', 'Vitelli'];
export const TIPI_EV = ['Parto', 'Calore', 'Fecondazione', 'Diagnosi gravidanza', 'Messa in asciutta', 'Trattamento sanitario', 'Vaccinazione', 'Controllo funzionale', 'Uscita', 'Nota'];
export const GEST = 283;

// Colori delle colture sulla mappa e nelle miniature
const CROP = [
  [/mais/i, '#F5B700'], [/frumento|grano/i, '#E89A2C'], [/orzo|triticale|avena|segale/i, '#F2D35B'],
  [/medica|trifoglio/i, '#2DBE4E'], [/prato|loiessa|erba/i, '#8CD43F'], [/soia/i, '#B9CC1E'],
  [/sorgo/i, '#E8662A'], [/girasole/i, '#FFD400'], [/colza/i, '#F7EC2E'], [/vite|vigneto/i, '#B03A9A'],
  [/barbabietola/i, '#E2366B'], [/pomodoro/i, '#F2452E'], [/riposo/i, '#C3CCC7'],
];
export const cropColorName = n => { n = n || ''; for (const [re, col] of CROP) if (re.test(n)) return col; return n ? '#1FB5D0' : '#A9B4AE'; };
// Coltura di un campo in una data annata: storico per anno, altrimenti la coltura in atto
export function colturaOf(c, anno = UI.anno) {
  if (!c) return null; const st = Array.isArray(c.colture) ? c.colture : [];
  const e = st.find(x => +x.anno === +anno); if (e) return e;
  if (+anno === new Date().getFullYear()) return c.coltura ? { anno, coltura: c.coltura, varieta: c.varieta || '' } : null;
  return null;
}
export const cropOf = (c, anno) => { if (c && !c.id && c.coltura !== undefined && !c.colture) return c.coltura; const e = colturaOf(c, anno); return e ? e.coltura : ''; };
export const cropColor = (c, anno) => cropColorName(cropOf(c, anno));
export function storicoColture(c) {
  const m = new Map(); (c.colture || []).forEach(e => m.set(+e.anno, e));
  const y = new Date().getFullYear(); if (c.coltura && !m.has(y)) m.set(y, { anno: y, coltura: c.coltura, varieta: c.varieta || '' });
  return [...m.values()].sort((a, b) => b.anno - a.anno);
}
export const isFatto = o => o.stato !== 'Pianificata';
// Avvicendamento: sui seminativi la stessa coltura per due anni di fila va segnalata (escluse pluriennali, foraggere e riposo)
const NO_ROT = /medica|prato|loiessa|loietto|erbai|trifoglio|vite|vigneto|frutt|pioppo|riposo|maggese|pascol/i;
const famiglia = s => { s = (s || '').toLowerCase(); return /mais/.test(s) ? 'mais' : /frumento tenero|grano tenero/.test(s) ? 'frumento tenero' : /frumento duro|grano duro/.test(s) ? 'frumento duro' : s.replace(/\s*\(.*\)$/, '').trim(); };
export function rotazione(c, anno) {
  const a = cropOf(c, anno), b = cropOf(c, anno - 1); if (!a || !b || NO_ROT.test(a)) return null;
  if (famiglia(a) !== famiglia(b)) return null;
  const c2 = cropOf(c, anno - 2);
  return { coltura: a, anni: c2 && famiglia(c2) === famiglia(a) ? 3 : 2 };
}
export const campoHa = c => N(c.superficie) || (c.geom ? Math.round(areaHa(c.geom) * 10000) / 10000 : 0);

export function capoInfo(c, ev) {
  const T = today();
  const last = (t, after) => { for (let i = ev.length - 1; i >= 0; i--) { const e = ev[i]; if (e.tipo === t && (!after || e.data > after)) return e; } return null; };
  const parto = last('Parto'); const pData = parto ? parto.data : null;
  const uscita = last('Uscita');
  const fec = last('Fecondazione', pData);
  const nFec = ev.filter(e => e.tipo === 'Fecondazione' && (!pData || e.data > pData)).length;
  const diag = fec ? last('Diagnosi gravidanza', fec.data) : null;
  const gravida = diag ? diag.esito === 'Positiva' : null;
  const asc = pData ? last('Messa in asciutta', pData) : null;
  const prevParto = fec && gravida !== false ? addDays(fec.data, GEST) : null;
  let stato;
  if (uscita) stato = 'Uscita';
  else if (c.sesso === 'M') stato = okD(c.nascita) && diff(c.nascita, T) < 365 ? 'Vitello' : 'Maschio';
  else if (asc) stato = 'Asciutta';
  else if (pData) stato = 'In lattazione';
  else stato = okD(c.nascita) && diff(c.nascita, T) < 365 ? 'Vitella' : 'Manza';
  const dim = stato === 'In lattazione' ? diff(pData, T) : null;
  let sospLatte = null, sospCarne = null;
  ev.forEach(e => {
    if (e.tipo !== 'Trattamento sanitario' && e.tipo !== 'Vaccinazione') return;
    if (N(e.sospLatte) > 0) { const f = addDays(e.data, N(e.sospLatte)); if (!sospLatte || f > sospLatte) sospLatte = f; }
    if (N(e.sospCarne) > 0) { const f = addDays(e.data, N(e.sospCarne)); if (!sospCarne || f > sospCarne) sospCarne = f; }
  });
  const inSospLatte = !!(sospLatte && sospLatte >= T) && !uscita;
  const inSospCarne = !!(sospCarne && sospCarne >= T) && !uscita;
  const ctrl = last('Controllo funzionale');
  const nLatt = N(c.lattazioniPrecedenti) + ev.filter(e => e.tipo === 'Parto').length;
  const alerts = [];
  if (!uscita && c.sesso !== 'M') {
    if (stato === 'In lattazione' && !fec && dim >= 50) alerts.push({ k: 'fec', lv: 'warn', t: 'Da fecondare', s: dim + ' giorni dal parto' });
    if (stato === 'Manza' && !fec && okD(c.nascita) && diff(c.nascita, T) >= 440) alerts.push({ k: 'fec', lv: 'warn', t: 'Manza da fecondare', s: eta(c.nascita) });
    if (fec && !diag && diff(fec.data, T) >= 28) alerts.push({ k: 'diag', lv: 'info', t: 'Diagnosi di gravidanza', s: 'fecondata il ' + fd(fec.data) });
    if (gravida && stato === 'In lattazione' && prevParto && diff(T, prevParto) <= 67) alerts.push({ k: 'asc', lv: 'warn', t: 'Da mettere in asciutta', s: 'parto previsto il ' + fd(prevParto) });
    if (gravida && prevParto && diff(T, prevParto) <= 21 && diff(T, prevParto) >= -15) alerts.push({ k: 'parto', lv: 'info', t: 'Parto vicino', s: 'previsto il ' + fd(prevParto) });
    if (inSospLatte) alerts.push({ k: 'sosp', lv: 'bad', t: 'Latte da non conferire', s: 'sospensione fino al ' + fd(sospLatte) });
  }
  return { stato, pData, dim, fec, nFec, diag, gravida, prevParto, sospLatte, inSospLatte, sospCarne, inSospCarne, ctrl, nLatt, alerts, ev, uscita };
}

export function derive() {
  const evBy = {};
  S.eventi.forEach(e => { (evBy[e.capoId] = evBy[e.capoId] || []).push(e); });
  Object.values(evBy).forEach(a => a.sort(byDate));
  const capi = new Map(); S.capi.forEach(c => capi.set(c.id, capoInfo(c, evBy[c.id] || [])));
  const giac = new Map(); S.prodotti.forEach(p => giac.set(p.id, N(p.giacenzaIniziale)));
  S.movimenti.forEach(m => { if (giac.has(m.prodottoId)) giac.set(m.prodottoId, giac.get(m.prodottoId) + (m.tipo === 'Scarico' ? -1 : 1) * N(m.quantita)); });
  const latte = [...S.latte].filter(l => okD(l.data)).sort(byDate);
  Object.assign(D, { evBy, capi, giac, latte });
}

export const giac = p => D.giac.get(p.id) || 0;
export const capoI = c => D.capi.get(c.id);
export function mezzoOre(m) {
  const base = N(m.oreIniziali) + sum(S.operazioni.filter(o => o.mezzoId === m.id), o => o.ore);
  const man = Math.max(0, ...S.manutenzioni.filter(x => x.mezzoId === m.id).map(x => N(x.ore)));
  return Math.max(base, man);
}
export function mezzoTagliando(m) {
  const t = S.manutenzioni.filter(x => x.mezzoId === m.id && x.tipo === 'Tagliando').map(x => N(x.ore));
  const ult = t.length ? Math.max(...t) : N(m.oreUltimoTagliando); const int = N(m.intervallo);
  return int > 0 ? { ult, prossimo: ult + int } : null;
}
export function opCosto(o) {
  const p = get('prodotti', o.prodottoId), m = get('mezzi', o.mezzoId);
  const prod = p ? N(o.quantita) * N(p.prezzo) : 0, mez = m ? N(o.ore) * N(m.costoOra) : 0, extra = N(o.costoExtra);
  return { prod, mez, extra, tot: prod + mez + extra, ricavo: N(o.raccolto) * N(o.prezzoVendita) };
}
export function campoInfo(c, anno = UI.anno) {
  const T = today();
  const ops = S.operazioni.filter(o => o.campoId === c.id && yearOf(o.data) === anno && o.stato !== 'Pianificata').sort(byDate);
  const plan = S.operazioni.filter(o => o.campoId === c.id && o.stato === 'Pianificata').sort(byDate);
  const t = { prod: 0, mez: 0, extra: 0, tot: 0, ricavo: 0 };
  ops.forEach(o => { const k = opCosto(o); for (const x in t) t[x] += k[x]; });
  let carenza = null;
  S.operazioni.forEach(o => {
    if (o.campoId !== c.id || !o.prodottoId || !okD(o.data) || o.stato === 'Pianificata') return;
    const p = get('prodotti', o.prodottoId); if (!p || N(p.carenza) <= 0) return;
    const f = addDays(o.data, N(p.carenza)); if (f >= T && (!carenza || f > carenza.fine)) carenza = { fine: f, prodotto: p.nome };
  });
  const last = [...S.operazioni].filter(o => o.campoId === c.id && o.stato !== 'Pianificata').sort(byDate).pop() || null;
  return { ops, plan, ...t, carenza, last };
}
export const gruppoCapi = g => S.capi.filter(c => c.gruppo === g && capoI(c).stato !== 'Uscita').length;
export function razioneInfo(r) {
  const capi = N(r.capi) > 0 ? N(r.capi) : gruppoCapi(r.gruppo);
  const ing = (r.ingredienti || []).map(i => { const p = get('prodotti', i.prodottoId); const kgTot = N(i.kg) * capi; const g = p ? giac(p) : 0; return { p, kg: N(i.kg), kgTot, costo: p ? N(i.kg) * N(p.prezzo) : 0, autonomia: kgTot > 0 && p ? g / kgTot : null }; });
  const costoCapo = sum(ing, i => i.costo); const auto = ing.filter(i => i.autonomia !== null).map(i => i.autonomia);
  return { capi, ing, costoCapo, costoGiorno: costoCapo * capi, kgCapo: sum(ing, i => i.kg), autonomia: auto.length ? Math.min(...auto) : null };
}

export function allAlerts() {
  const T = today(); const out = [];
  S.capi.forEach(c => { capoI(c).alerts.forEach(a => out.push({ lv: a.lv, area: 'stalla', t: a.t, s: (c.nome ? c.nome + ' · ' : '') + (c.matricola || '') + ' — ' + a.s, go: { type: 'capo', id: c.id } })); });
  S.prodotti.forEach(p => {
    const g = giac(p), u = p.unita || '';
    if (g < 0) out.push({ lv: 'bad', area: 'magazzino', t: 'Giacenza negativa: ' + p.nome, s: 'Registra il carico mancante (' + nf(g, 2) + ' ' + u + ')', go: { type: 'prodotto', id: p.id } });
    else if (N(p.scortaMin) > 0 && g < N(p.scortaMin)) out.push({ lv: 'warn', area: 'magazzino', t: 'Scorta bassa: ' + p.nome, s: nf(g, 1) + ' ' + u + ' rimasti, minimo ' + nf(p.scortaMin) + ' ' + u, go: { type: 'prodotto', id: p.id } });
    if (okD(p.scadenza) && g > 0) { const d = diff(T, p.scadenza); if (d < 0) out.push({ lv: 'bad', area: 'magazzino', t: 'Scaduto: ' + p.nome, s: 'Scaduto il ' + fd(p.scadenza), go: { type: 'prodotto', id: p.id } }); else if (d <= 60) out.push({ lv: 'warn', area: 'magazzino', t: 'In scadenza: ' + p.nome, s: 'Scade il ' + fd(p.scadenza), go: { type: 'prodotto', id: p.id } }); }
  });
  S.mezzi.forEach(m => {
    const t = mezzoTagliando(m), ore = mezzoOre(m);
    if (t && t.prossimo - ore <= 25) out.push({ lv: t.prossimo - ore < 0 ? 'bad' : 'warn', area: 'mezzi', t: 'Tagliando ' + m.nome, s: t.prossimo - ore < 0 ? 'Superato di ' + nf(ore - t.prossimo, 0) + ' ore' : 'Tra ' + nf(t.prossimo - ore, 0) + ' ore di lavoro', go: { type: 'mezzo', id: m.id } });
    [['scadenzaRevisione', 'Revisione'], ['scadenzaAssicurazione', 'Assicurazione']].forEach(([k, l]) => { if (okD(m[k])) { const d = diff(T, m[k]); if (d <= 30) out.push({ lv: d < 0 ? 'bad' : 'warn', area: 'mezzi', t: l + ' ' + m.nome, s: (d < 0 ? 'Scaduta il ' : 'Scade il ') + fd(m[k]), go: { type: 'mezzo', id: m.id } }); } });
  });
  S.operatori.forEach(o => { if (!okD(o.scadenzaPatentino)) return; const d = diff(T, o.scadenzaPatentino); if (d <= 60) out.push({ lv: d < 0 ? 'bad' : 'warn', area: 'campi', t: 'Patentino ' + o.nome, s: (d < 0 ? 'Scaduto il ' : 'Scade il ') + fd(o.scadenzaPatentino), go: { edit: 'operatori', id: o.id } }); });
  S.mezzi.forEach(m => { if (!okD(m.controlloFunzionale)) return; const d = diff(T, m.controlloFunzionale); if (d <= 60) out.push({ lv: d < 0 ? 'bad' : 'warn', area: 'mezzi', t: 'Controllo funzionale ' + m.nome, s: (d < 0 ? 'Scaduto il ' : 'Scade il ') + fd(m.controlloFunzionale), go: { type: 'mezzo', id: m.id } }); });
  S.prodotti.forEach(p => { if (!okD(p.scadenzaAut) || giac(p) <= 0) return; const d = diff(T, p.scadenzaAut); if (d <= 90) out.push({ lv: d < 0 ? 'bad' : 'warn', area: 'magazzino', t: 'Autorizzazione ' + p.nome, s: (d < 0 ? 'Non più autorizzato dal ' : 'Autorizzato fino al ') + fd(p.scadenzaAut) + ' · ' + nf(giac(p), 1) + ' ' + (p.unita || '') + ' in magazzino', go: { type: 'prodotto', id: p.id } }); });
  const Y = new Date().getFullYear();
  [Y, Y + 1].forEach(y => S.campi.forEach(c => { const r = rotazione(c, y); if (r) out.push({ lv: 'warn', area: 'campi', t: 'Rotazione: ' + c.nome, s: r.coltura + ' per ' + r.anni + ' anni di fila (' + y + '): verifica l\'avvicendamento richiesto dalla PAC', go: { type: 'campo', id: c.id } }); }));
  S.campi.forEach(c => { const i = campoInfo(c); if (i.carenza) out.push({ lv: 'info', area: 'campi', t: 'Carenza in corso: ' + c.nome, s: 'Raccolta dal ' + fd(addDays(i.carenza.fine, 1)) + ' · ' + i.carenza.prodotto, go: { type: 'campo', id: c.id } }); });
  S.operazioni.filter(o => o.stato === 'Pianificata' && okD(o.data)).forEach(o => { const c = get('campi', o.campoId); const d = diff(T, o.data); if (d < 0) out.push({ lv: 'warn', area: 'campi', t: 'In ritardo: ' + (o.tipo || 'attività') + (c ? ' · ' + c.nome : ''), s: 'Pianificata per il ' + fd(o.data), go: { edit: 'operazioni', id: o.id } }); else if (d <= 3) out.push({ lv: 'info', area: 'campi', t: (o.tipo || 'Attività') + (c ? ' · ' + c.nome : ''), s: d === 0 ? 'Pianificata per oggi' : 'Pianificata per il ' + fd(o.data), go: { edit: 'operazioni', id: o.id } }); });
  const inLatt = S.capi.filter(c => capoI(c).stato === 'In lattazione').length;
  if (inLatt && !S.latte.some(l => l.data === T)) out.push({ lv: 'info', area: 'latte', t: 'Registra il latte di oggi', s: inLatt + ' vacche in lattazione', go: { form: 'latte' } });
  const rank = { bad: 0, warn: 1, info: 2 };
  return out.sort((a, b) => rank[a.lv] - rank[b.lv]);
}
