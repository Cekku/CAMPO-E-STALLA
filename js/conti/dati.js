// Dati del modulo Conti: configurazione, fatture con righe, bilanci per anno, dati tecnici automatici
import { S, D, azienda } from '../state.js';
import { N, okD, diff, yearOf, addDays, today } from '../util.js';
import { campoHa, cropOf } from '../domain.js';
import { REGOLE_PREDEFINITE, RETTIFICA, CAT_RETTIFICA, CAT_LATTE, CAT_PREMI, DA_CLASSIFICARE } from './regole.js';
import { calcolaAnno, indici } from './schema.js';
import { DATI, calcolaParametri } from './analisi.js';

export const RISERVATE = ['fatture', 'bilanci', 'econfig'];
export const cfg = () => S.econfig.find(x => x.id === 'cfg') || {};
export const regole = () => (cfg().regole && cfg().regole.length ? cfg().regole : REGOLE_PREDEFINITE);
export const pivaPropria = () => { const c = cfg(); const a = String(azienda().iva || '').replace(/\D/g, ''); return c.piva || (a.length >= 11 ? a.slice(-11) : ''); };

// memoria dei calcoli: si ricalcola solo quando cambiano le raccolte usate
const cache = new Map();
function memo(key, deps, fn) {
  const c = cache.get(key); if (c && c.deps.length === deps.length && c.deps.every((d, i) => d === deps[i])) return c.v;
  const v = fn(); cache.set(key, { deps, v }); return v;
}

/** Fatture ordinate per data, con i campi derivati. */
export const fatture = () => memo('fatture', [S.fatture], () => [...S.fatture].map(f => Object.assign({}, f, { anno: yearOf(f.data), mese: okD(f.data) ? +f.data.slice(5, 7) : null })).sort((a, b) => (a.data || '').localeCompare(b.data || '') || (a.controparte || '').localeCompare(b.controparte || '')));

/** Tutte le righe, con le righe di rettifica (differenza tra imponibile e somma delle righe lette). */
export const righe = () => memo('righe', [S.fatture], () => {
  const out = [];
  for (const f of fatture()) {
    let somma = 0;
    (f.righe || []).forEach((r, i) => { somma += N(r.importo); out.push(Object.assign({}, r, { fid: f.id, i, data: f.data, anno: f.anno, mese: f.mese, tipo: f.tipo, controparte: f.controparte, piva: f.piva, numero: f.numero, tipoDoc: f.tipoDoc })); });
    const d = Math.round((N(f.imponibile) - somma) * 100) / 100;
    if (Math.abs(d) >= 0.01) out.push({ fid: f.id, i: -1, rett: true, data: f.data, anno: f.anno, mese: f.mese, tipo: f.tipo, controparte: f.controparte, piva: f.piva, numero: f.numero, tipoDoc: f.tipoDoc, codice: '', descrizione: `${RETTIFICA} Differenza tra imponibile e righe lette (spese accessorie, arrotondamenti o righe non lette)`, categoria: CAT_RETTIFICA, quantita: null, um: '', prezzo: null, sconto: '', aliquota: '', importo: d, ddt: '' });
  }
  return out;
});

export const anniFatture = () => memo('anniF', [S.fatture], () => [...new Set(fatture().map(f => f.anno).filter(Boolean))].sort());
export const bilancio = y => S.bilanci.find(b => b.id === String(y)) || null;
export const anniBilancio = () => memo('anniB', [S.bilanci], () => S.bilanci.map(b => +b.id).filter(Boolean).sort());
export const calc = y => memo('calc' + y, [S.bilanci], () => calcolaAnno(bilancio(y) || {}));

/* ---------- dati tecnici automatici (stalla, campi, fatture) ---------- */
const fineAnno = y => { const f = `${y}-12-31`; const t = today(); return t < f ? t : f; };
function presenza(da, a, y) {
  const i = `${y}-01-01`, f = fineAnno(y);
  const s = !da || da < i ? i : da, e = !a || a > f ? f : a;
  if (s > e) return 0; return diff(s, e) + 1;
}
function stalla(y) {
  const gA = Math.max(1, diff(`${y}-01-01`, fineAnno(y)) + 1); let vacche = 0, latt = 0, capi = 0;
  for (const c of S.capi) {
    const ev = (D.evBy && D.evBy[c.id]) || [];
    const usc = ev.find(e => e.tipo === 'Uscita'); const fine = usc ? usc.data : null;
    const inizio = c.ingresso || c.nascita || null;
    capi += presenza(inizio, fine, y);
    if (c.sesso === 'M') continue;
    const parti = ev.filter(e => e.tipo === 'Parto').map(e => e.data).sort();
    const vaccaDa = N(c.lattazioniPrecedenti) > 0 ? (inizio || parti[0] || null) : parti[0] || null;
    if (vaccaDa || N(c.lattazioniPrecedenti) > 0) vacche += presenza(vaccaDa && inizio && vaccaDa < inizio ? inizio : vaccaDa, fine, y);
    // lattazione: da ogni parto alla messa in asciutta successiva (o al parto successivo, o all'uscita)
    const asc = ev.filter(e => e.tipo === 'Messa in asciutta').map(e => e.data).sort();
    parti.forEach((p, k) => {
      const prossimo = parti[k + 1] || null; const a = asc.find(x => x > p && (!prossimo || x < prossimo));
      let f = a ? addDays(a, -1) : prossimo ? addDays(prossimo, -1) : fine; if (fine && (!f || f > fine)) f = fine;
      latt += presenza(p, f, y);
    });
  }
  const latte = S.latte.filter(l => yearOf(l.data) === y);
  return {
    vacche: vacche ? Math.round(vacche / gA * 10) / 10 : null, vacche_latt: latt ? Math.round(latt / gA * 10) / 10 : null, capi: capi ? Math.round(capi / gA * 10) / 10 : null,
    latte_prod: latte.length ? Math.round(latte.reduce((t, l) => t + N(l.litri), 0)) : null,
    latte_conf: latte.some(l => N(l.conferiti)) ? Math.round(latte.reduce((t, l) => t + N(l.conferiti), 0)) : null,
  };
}
const FORAGGERE = /trinciat|insil|erba|medica|prat|loiess|foragg|sorgo|erbai|fieno|pascol|trifoglio/i;
function campi(y) {
  if (!S.campi.length) return { sau: null, sup_for: null };
  const sau = S.campi.reduce((t, c) => t + campoHa(c), 0);
  const fo = S.campi.filter(c => FORAGGERE.test(cropOf(c, y) || '')).reduce((t, c) => t + campoHa(c), 0);
  return { sau: Math.round(sau * 100) / 100, sup_for: fo ? Math.round(fo * 100) / 100 : null };
}
/** Riepilogo delle vendite di latte, vitelli e bovini dalle fatture. */
export function fattureStalla(y) {
  const rs = righe().filter(r => r.anno === y && r.tipo === 'Vendita');
  const s = (cat, campo) => rs.filter(r => r.categoria === cat).reduce((t, r) => t + N(r[campo]), 0);
  const lit = s(CAT_LATTE, 'quantita');
  return { latteLitri: lit || null, latteEuro: s(CAT_LATTE, 'importo') + s(CAT_PREMI, 'importo'), vitelli: s('Vitelli', 'quantita') || null, bovini: s('Bovini', 'quantita') || null };
}
/** Dati tecnici di un anno: { auto, man, val, src } per ogni voce. */
export function datiTecnici(y) {
  return memo('tec' + y, [S.capi, S.eventi, S.latte, S.campi, S.fatture, S.bilanci], () => {
    const st = stalla(y), ca = campi(y), fa = fattureStalla(y);
    const b = bilancio(y) || {}; const man = Object.assign({}, b.dim || {}, b.analisi || {});
    const auto = { vacche: st.vacche, vacche_latt: st.vacche_latt, capi: st.capi, latte_prod: st.latte_prod, latte_ven: fa.latteLitri || st.latte_conf, sau: ca.sau, sup_for: ca.sup_for, vitelli: fa.vitelli, bovini: fa.bovini };
    const src = { vacche: 'stalla', vacche_latt: 'stalla', capi: 'stalla', latte_prod: 'registro del latte', latte_ven: fa.latteLitri ? 'fatture' : st.latte_conf ? 'registro (conferiti)' : '', sau: 'campi', sup_for: 'campi', vitelli: 'fatture', bovini: 'fatture' };
    const val = {}, da = {};
    for (const [k] of DATI) {
      if (man[k] !== undefined && man[k] !== null && man[k] !== '') { val[k] = N(man[k]); da[k] = 'inserito'; }
      else if (auto[k] != null) { val[k] = auto[k]; da[k] = src[k] || 'automatico'; }
      else { val[k] = null; da[k] = ''; }
    }
    return { auto, man, val, da, F: fa };
  });
}
export const dim = y => { const d = datiTecnici(y).val; return { sau: d.sau, ula: d.ula, capi: d.capi }; };
export const ind = y => memo('ind' + y, [S.bilanci, S.capi, S.eventi, S.campi, S.latte, S.fatture], () => indici(calc(y), dim(y)));
export const parametri = y => memo('par' + y, [S.bilanci, S.capi, S.eventi, S.campi, S.latte, S.fatture], () => { const t = datiTecnici(y); return calcolaParametri(calc(y), ind(y), t.val, t.F); });

/** Anni da mostrare nei prospetti: quelli con dati, fino all'anno scelto (al massimo 5). */
export function anniProspetto(fino, conFatture = false) {
  const tutti = [...new Set([...anniBilancio(), ...(conFatture ? anniFatture() : []), fino])].filter(y => y <= fino).sort((a, b) => a - b);
  const out = tutti.slice(-5); if (!out.length) out.push(fino);
  return out;
}
export { DA_CLASSIFICARE, CAT_LATTE, CAT_PREMI, CAT_RETTIFICA };
