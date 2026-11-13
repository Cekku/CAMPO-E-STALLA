// Preventivi e contratti di fornitura (dalla 1.36.0): confronto delle offerte di più ditte fra loro, con il contratto
// in corso e con i prezzi pagati davvero (righe delle fatture di acquisto degli ultimi 12 mesi).
// Un confronto sta nella raccolta riservata "econfig" con id "pv-<uid>" (con il cloud lo vede solo il titolare):
//   { tipo: 'confronto', titolo, genere: 'mangimi'|'sementi'|'varie', anno, stato: 'aperto'|'deciso'|'chiuso', tasso, note,
//     creato, scelta: id offerta,
//     voci: [{ id, nome, um, qta (all'anno, in um), confQ, confUm (1 sacco/dose/confezione = confQ confUm), parole, note }],
//     offerte: [{ id, ditta, data, validita, contratto (true = contratto in corso), inizio, fine, preavviso (giorni),
//                 pagamento (giorni), trasporto: 'incluso'|'unita'|'forfait', trValore, trUm, sconto (frazione), condizioni, note,
//                 file: { nome, imp } (copia nell'app, conti/originali.js), archivio: { imp, nome } (documento del PC),
//                 prezzi: { <id voce>: { prezzo, um, pg (proteina % per i mangimi), testo (riga letta) } } }] }
// Niente nomi di ditte o prodotti nel codice: tutto viene dai dati di chi usa l'app.
import { S } from '../state.js';
import * as store from '../store.js';
import { N, today, addDays, okD, uid, diff } from '../util.js';
import { righe } from './dati.js';

export const PRE = 'pv-';
export const GENERI = {
  mangimi: { nome: 'Mangimi e materie prime', icn: 'wheat', um: 'q', cat: /mangim|materie prime|integrat|forag|alimenti/i },
  sementi: { nome: 'Sementi', icn: 'sprout', um: 'dose', cat: /sement/i },
  varie: { nome: 'Forniture varie', icn: 'package', um: 'pz', cat: null },
};
// fuori dalle forniture varie: quello che ha un suo genere e quello che non si compra a preventivo come fornitura
const FUORI_VARIE = /mangim|materie prime|integrat|forag|sement|investiment|bestiame|affitt|personale|consulenz|energia elettrica|differenze non dettagliate|da classificare/i;

export const confronti = () => S.econfig.filter(x => String(x.id).startsWith(PRE) && x.tipo === 'confronto').sort((a, b) => String(b.creato || '').localeCompare(String(a.creato || '')));
export const confronto = id => S.econfig.find(x => x.id === id && x.tipo === 'confronto') || null;
export async function salva(c) { const { id, ...data } = c; await store.put('econfig', id, JSON.parse(JSON.stringify(data))); }
export const nuovoId = () => PRE + uid();
export const nuovaVoce = () => 'v' + uid().slice(0, 8);
export const nuovaOfferta = () => 'o' + uid().slice(0, 8);

/* ---------------- unità di misura ---------------- */
// [gruppo, quante unità di base vale]: peso in kg, volume in litri, pezzi, superficie in m², lunghezza in m.
// Le confezioni (sacco, dose, balla…) valgono 1 di se stesse; se la voce dice quanto pesa una confezione si convertono.
const UM = { g: ['peso', 0.001], kg: ['peso', 1], q: ['peso', 100], t: ['peso', 1000], l: ['vol', 1], hl: ['vol', 100], m3: ['vol', 1000], pz: ['pz', 1], ha: ['ha', 1], m2: ['area', 1], m: ['lung', 1], dose: ['conf', 1], sacco: ['conf', 1], conf: ['conf', 1], balla: ['conf', 1], rotolo: ['conf', 1], bancale: ['conf', 1] };
export const UM_NOMI = { kg: 'kg', q: 'quintale (q)', t: 'tonnellata (t)', g: 'grammo', l: 'litro', hl: 'ettolitro', m3: 'metro cubo', pz: 'pezzo', dose: 'dose', sacco: 'sacco', conf: 'confezione', balla: 'balla', rotolo: 'rotolo', bancale: 'bancale', m: 'metro', m2: 'metro quadro', ha: 'ettaro' };
export const UM_ELENCO = Object.keys(UM_NOMI);
const SIN = [[/^(kg|kgs|chil\w*|kilo\w*)$/, 'kg'], [/^(q|ql|qli|qle|qt|quint\w*)$/, 'q'], [/^(t|tn|ton|tonn\w*)$/, 't'], [/^(g|gr|gramm\w*)$/, 'g'], [/^(l|lt|lit\w*)$/, 'l'], [/^(hl|ettolit\w*)$/, 'hl'], [/^(m3|mc|metri ?cubi|metro ?cubo)$/, 'm3'],
  [/^(pz|pezz\w*|n|nr|num\w*|cad\w*|un|unit\w*)$/, 'pz'], [/^(dos[ei]|unita seme)$/, 'dose'], [/^(sac\w*|sc)$/, 'sacco'], [/^(conf\w*|cf|cnf)$/, 'conf'], [/^(ball[ae]|rotoball[ae])$/, 'balla'], [/^(rot|rotol\w*)$/, 'rotolo'], [/^(banc\w*|pallet)$/, 'bancale'],
  [/^(m|mt|metr[oi]|ml|metri lineari)$/, 'm'], [/^(m2|mq|metri ?quadr\w*)$/, 'm2'], [/^(ha|ettar\w*)$/, 'ha']];
/** Unità scritta in un qualsiasi modo ("Q.LI", "Kg", "tonn.") → chiave di UM, oppure il testo pulito se non si riconosce. */
export function umNorm(s) {
  const t = String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[.\s]+$/g, '').replace(/\./g, '').replace(/\s+/g, ' ').trim();
  if (!t) return '';
  for (const [re, k] of SIN) if (re.test(t)) return k;
  return t;
}
function base(um, v) {
  const k = umNorm(um); const d = UM[k]; if (!d) return k ? [k, 1] : null;
  if (d[0] === 'conf' && v && N(v.confQ) > 0) { const e = UM[umNorm(v.confUm)]; if (e && e[0] !== 'conf') return [e[0], N(v.confQ) * e[1]]; }
  return d[0] === 'conf' ? [k, 1] : d;
}
/** Prezzo per umDa → prezzo per umA (null se le unità non si confrontano). */
export function converti(prezzo, umDa, umA, v) {
  if (prezzo === null || prezzo === undefined || prezzo === '') return null;
  const a = base(umDa || umA, v), b = base(umA, v); if (!a || !b || a[0] !== b[0]) return null;
  return N(prezzo) * b[1] / a[1];
}
/** Quantità in umDa → quantità in umA. */
export const convertiQ = (q, umDa, umA, v) => { const f = converti(1, umA, umDa, v); return f === null ? null : N(q) * f; };
/** kg in una unità della voce (per il costo della proteina), null se non è un peso. */
export const kgDi = (um, v) => { const b = base(um, v); return b && b[0] === 'peso' ? b[1] : null; };

/* ---------------- prezzi pagati: righe delle fatture di acquisto ---------------- */
const norm = s => String(s || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
/** Parole di ricerca della voce: alternative separate da virgola, dentro un'alternativa tutte le parole (anche come inizio di parola). */
export function cerca(v) {
  const alt = String(v.parole || v.nome || '').split(/[,;]/).map(a => norm(a).split(/[^A-Z0-9%]+/).filter(w => w.length >= 2)).filter(a => a.length);
  if (!alt.length) return () => false;
  return desc => { const ws = norm(desc).split(/[^A-Z0-9%]+/).filter(Boolean); return alt.some(a => a.every(p => ws.some(w => w.startsWith(p)))); };
}
/** Prezzo medio pagato per la voce (imponibile ÷ quantità, nelle unità della voce) fra da e a (predefinito: ultimi 12 mesi). */
export function pagato(v, { a = today(), da = null, ditta = '' } = {}) {
  const ini = da || addDays(a, -365); const ok = cerca(v);
  const out = { prezzo: null, qta: 0, spesa: 0, righe: 0, nonConv: 0, ditte: [], ultimo: null, da: ini, a };
  const per = new Map();
  for (const r of righe()) {
    if (r.tipo !== 'Acquisto' || r.rett || !okD(r.data) || r.data < ini || r.data > a || !ok(r.descrizione)) continue;
    if (ditta && norm(r.controparte) !== norm(ditta)) continue;
    const imp = N(r.importo), q = N(r.quantita);
    if (!(imp > 0) || !(q > 0)) continue;
    const qv = convertiQ(q, r.um || v.um, v.um, v);
    if (qv === null || !(qv > 0)) { out.nonConv++; continue; }
    out.qta += qv; out.spesa += imp; out.righe++;
    const d = per.get(r.controparte) || { ditta: r.controparte, qta: 0, spesa: 0 }; d.qta += qv; d.spesa += imp; per.set(r.controparte, d);
    if (!out.ultimo || r.data > out.ultimo.data) out.ultimo = { data: r.data, prezzo: imp / qv, ditta: r.controparte };
  }
  if (out.qta > 0) out.prezzo = out.spesa / out.qta;
  out.ditte = [...per.values()].sort((x, y) => y.spesa - x.spesa).map(d => Object.assign(d, { prezzo: d.spesa / d.qta }));
  return out;
}
/** Prodotti comprati negli ultimi 12 mesi da proporre come voci: per genere (categorie) o per parola cercata. */
export function prodottiComprati(genere, q = '', a = today()) {
  const ini = addDays(a, -365); const G = GENERI[genere] || GENERI.varie; const qq = norm(q).trim();
  const m = new Map();
  for (const r of righe()) {
    if (r.tipo !== 'Acquisto' || r.rett || !okD(r.data) || r.data < ini || r.data > a || !(N(r.importo) > 0)) continue;
    const cat = r.categoria || '';
    if (qq) { if (!norm(r.descrizione).includes(qq) && !norm(r.controparte).includes(qq)) continue; }
    else if (G.cat ? !G.cat.test(cat) : FUORI_VARIE.test(cat)) continue;
    const um = umNorm(r.um) || G.um;
    const k = norm(r.descrizione).replace(/\s+/g, ' ').trim() + '|' + ((UM[um] || [um])[0]);
    const x = m.get(k) || { k, descrizione: String(r.descrizione || '').replace(/\s+/g, ' ').trim(), um, categoria: cat, qta: 0, spesa: 0, ditte: new Set(), righe: 0 };
    const qv = convertiQ(N(r.quantita), r.um || um, x.um, null);
    x.qta += qv || 0; x.spesa += N(r.importo); x.ditte.add(r.controparte || ''); x.righe++; m.set(k, x);
  }
  return [...m.values()].map(x => Object.assign(x, { ditte: [...x.ditte].filter(Boolean), prezzo: x.qta > 0 ? x.spesa / x.qta : null })).sort((a, b) => b.spesa - a.spesa);
}
/** Parole di ricerca proposte da una descrizione di fattura: le prime parole significative, senza numeri e codici. */
export function paroleDa(desc) {
  const ws = norm(desc).split(/[^A-Z%]+/).filter(w => w.length >= 3 && !/^(KG|QLI|PER|CON|DEL|DELLA|DEI|DAL|ALLA|SACCO|SACCHI|BIG|BAG|SFUSO|RINFUSA)$/.test(w));
  return ws.slice(0, 3).join(' ');
}

/* ---------------- calcolo del confronto ---------------- */
/** Costo di ogni offerta sulle quantità dell'anno, nelle unità delle voci.
 *  Ritorna { voci, rif: {vid: pagato}, offerte: [{ o, r: {vid: {pn, costo, pkgPg, nonConv, manca}}, merce, sconto, tr, totale, oggi, mancanti, nonConv, completa, scaduta }],
 *            migliore, contratto, perVoce: {vid: id offerta più conveniente}, risparmio: {contratto, pagato} } */
export function calcola(c, { a = today() } = {}) {
  const voci = (c.voci || []).filter(v => v.nome);
  const tasso = c.tasso === null || c.tasso === undefined || c.tasso === '' ? 0.04 : N(c.tasso);
  const rif = {}; voci.forEach(v => { rif[v.id] = pagato(v, { a }); });
  const offerte = (c.offerte || []).map(o => {
    const r = {}; let merce = 0, tr = 0, mancanti = [], nonConv = [];
    const sc = Math.min(Math.max(N(o.sconto), 0), 0.9);
    for (const v of voci) {
      const p = (o.prezzi || {})[v.id];
      const has = p && p.prezzo !== null && p.prezzo !== undefined && p.prezzo !== '';
      let pn = has ? converti(N(p.prezzo), p.um || v.um, v.um, v) : null;
      const x = { pn: null, costo: null, nonConv: has && pn === null, manca: !has };
      if (pn !== null) {
        pn = pn * (1 - sc);
        if (o.trasporto === 'unita' && N(o.trValore)) { const t = converti(N(o.trValore), o.trUm || v.um, v.um, v); if (t !== null) { x.tr = t; pn += t; } }
        x.pn = pn; x.costo = pn * N(v.qta);
        const kg = kgDi(v.um, v); if (kg && N(p.pg) > 0) x.pkgPg = pn / (kg * N(p.pg) / 100);
        merce += x.costo; if (x.tr) tr += x.tr * N(v.qta);
      }
      if (x.manca && N(v.qta) > 0) mancanti.push(v); if (x.nonConv) nonConv.push(v);
      r[v.id] = x;
    }
    if (o.trasporto === 'forfait') tr += N(o.trValore);
    const totale = merce + (o.trasporto === 'forfait' ? N(o.trValore) : 0);
    // pagare più tardi vale qualcosa: costo riportato a oggi con il tasso del confronto
    const gg = Math.max(0, N(o.pagamento));
    const oggi = totale * (1 - tasso * gg / 365);
    const scaduta = !o.contratto && okD(o.validita) && o.validita < a;
    const finito = o.contratto && okD(o.fine) && o.fine < a;
    return { o, r, merce, tr, totale, oggi, gg, mancanti, nonConv, completa: voci.length > 0 && !mancanti.length && !nonConv.length && totale > 0, scaduta, finito };
  });
  const nuove = offerte.filter(x => !x.o.contratto);
  const contratto = offerte.find(x => x.o.contratto && !x.finito) || offerte.find(x => x.o.contratto) || null;
  // prodotti che hanno un prezzo in tutte le offerte: se a qualcuna manca un prezzo si confronta almeno su questi
  const comuni = offerte.length ? voci.filter(v => N(v.qta) > 0 && offerte.every(x => x.r[v.id].pn !== null)) : [];
  for (const x of offerte) { x.comuni = comuni.reduce((t, v) => t + x.r[v.id].costo, 0) + (x.o.trasporto === 'forfait' ? N(x.o.trValore) : 0); x.comuniOggi = x.comuni * (1 - tasso * x.gg / 365); }
  const valide = nuove.filter(x => x.completa && !x.scaduta);
  let migliore = valide.length ? valide.reduce((m, x) => x.oggi < m.oggi ? x : m) : null, parziale = false;
  const vive = nuove.filter(x => !x.scaduta);
  if (!migliore && comuni.length && vive.length) { migliore = vive.reduce((m, x) => x.comuniOggi < m.comuniOggi ? x : m); parziale = true; }
  const perVoce = {};
  for (const v of voci) { let best = null; for (const x of offerte) { const y = x.r[v.id]; if (y && y.pn !== null && (!x.scaduta || x.o.contratto) && (!best || y.pn < best.pn)) best = { id: x.o.id, pn: y.pn }; } if (best) perVoce[v.id] = best.id; }
  // costo dell'anno ai prezzi pagati (solo se tutte le voci con quantità hanno un prezzo dalle fatture)
  const conQ = voci.filter(v => N(v.qta) > 0);
  const pagatoTot = conQ.length && conQ.every(v => rif[v.id].prezzo !== null) ? conQ.reduce((t, v) => t + rif[v.id].prezzo * N(v.qta), 0) : null;
  const pagComuni = comuni.length && comuni.every(v => rif[v.id].prezzo !== null) ? comuni.reduce((t, v) => t + rif[v.id].prezzo * N(v.qta), 0) : null;
  const risparmio = parziale ? {
    contratto: migliore && contratto && contratto !== migliore ? contratto.comuniOggi - migliore.comuniOggi : null,
    pagato: migliore && pagComuni !== null ? pagComuni - migliore.comuni : null,
  } : {
    contratto: migliore && contratto && contratto.completa ? contratto.oggi - migliore.oggi : null,
    pagato: migliore && pagatoTot !== null ? pagatoTot - migliore.totale : null,
  };
  // costo della migliore come si confronta: tutto l'anno, oppure solo i prodotti in comune
  const costoMigliore = migliore ? (parziale ? migliore.comuni : migliore.totale) : null;
  return { voci, rif, tasso, offerte, migliore, parziale, comuni, costoMigliore, contratto, perVoce, pagatoTot, pagComuni, risparmio };
}

/** Cose da sapere sul confronto: { liv: 'err'|'warn'|'info', t } */
export function avvisi(c, K = calcola(c)) {
  const out = [];
  if (!K.voci.length) out.push({ liv: 'warn', t: 'Aggiungi i prodotti da confrontare (a mano o dalle fatture).' });
  K.voci.filter(v => !(N(v.qta) > 0)).forEach(v => out.push({ liv: 'warn', t: `${v.nome}: manca la quantità dell'anno, quindi non entra nel costo totale.` + (K.rif[v.id].qta ? ` Negli ultimi 12 mesi ne hai comprati ${Math.round(K.rif[v.id].qta)} ${v.um}.` : '') }));
  if (!(c.offerte || []).length) out.push({ liv: 'info', t: 'Nessuna offerta: aggiungila a mano, da un PDF o dai preventivi trovati nell\'archivio del PC.' });
  for (const x of K.offerte) {
    const n = x.o.ditta || 'Offerta senza nome';
    if (x.mancanti.length) out.push({ liv: 'warn', t: `${n} non ha il prezzo di: ${x.mancanti.map(v => v.nome).join(', ')}. Non si può confrontare alla pari.` });
    if (x.nonConv.length) out.push({ liv: 'err', t: `${n}: prezzo in un'unità che non si converte (${x.nonConv.map(v => v.nome).join(', ')}). Scrivi nel prodotto quanto pesa un sacco o una confezione.` });
    if (x.scaduta) out.push({ liv: 'warn', t: `${n}: l'offerta era valida fino al ${x.o.validita.split('-').reverse().join('/')}. Chiedi se vale ancora.` });
    if (x.o.contratto && x.finito) out.push({ liv: 'info', t: `${n}: il contratto è finito il ${x.o.fine.split('-').reverse().join('/')}.` });
    if (/indicizz|listino|borsa|quotazion|variabil|aggiorn/i.test(x.o.condizioni || '')) out.push({ liv: 'info', t: `${n}: il prezzo segue un listino o una quotazione. Il confronto vale ai prezzi di oggi.` });
  }
  if (K.contratto) {
    for (const v of K.voci) {
      const y = K.contratto.r[v.id], p = K.rif[v.id];
      if (y && y.pn !== null && p.prezzo !== null && p.righe >= 2 && p.prezzo > y.pn * 1.03) out.push({ liv: 'warn', t: `${v.nome}: nelle fatture hai pagato in media ${p.prezzo.toFixed(2).replace('.', ',')} € per ${v.um}, più del ${Math.round((p.prezzo / y.pn - 1) * 100)}% sopra il prezzo del contratto. Controlla supplementi, trasporto o aumenti.` });
    }
  }
  return out;
}

/* ---------------- scadenze: agenda e panoramica ---------------- */
/** Date da ricordare: disdetta e fine dei contratti in corso, fine della validità dei preventivi dei confronti aperti. */
export function scadenze() {
  const out = [];
  for (const c of confronti()) {
    for (const o of c.offerte || []) {
      if (o.contratto && okD(o.fine)) {
        const dd = N(o.preavviso) > 0 ? addDays(o.fine, -N(o.preavviso)) : null;
        if (dd) out.push({ data: dd, tipo: 'disdetta', c, o, t: 'Ultimo giorno per la disdetta · ' + (o.ditta || c.titolo), s: `${c.titolo}: il contratto finisce il ${o.fine.split('-').reverse().join('/')}, preavviso di ${N(o.preavviso)} giorni` });
        out.push({ data: o.fine, tipo: 'fine', c, o, t: 'Finisce il contratto · ' + (o.ditta || c.titolo), s: c.titolo });
      } else if (!o.contratto && okD(o.validita) && c.stato !== 'chiuso' && c.stato !== 'deciso') out.push({ data: o.validita, tipo: 'validita', c, o, t: 'Scade il preventivo · ' + (o.ditta || c.titolo), s: c.titolo });
    }
  }
  return out.sort((a, b) => a.data.localeCompare(b.data));
}
/** Voci dell'agenda fra T e fine (la disdetta passata, con il contratto non ancora finito, resta in cima come in ritardo). */
export function vociAgenda(T, fine) {
  return scadenze().filter(x => (x.data >= T && x.data <= fine) || (x.tipo === 'disdetta' && x.data < T && x.o.fine >= T && diff(x.data, T) <= 30))
    .map(x => ({ data: x.data < T ? T : x.data, area: 'conti', icn: x.tipo === 'validita' ? 'file-text' : 'file-signature', t: x.t, s: x.data < T ? 'Era il ' + x.data.split('-').reverse().join('/') + ': ' + x.s : x.s, go: { tab: 'conti', sub: 'preventivi', f: 'pv_id', v: x.c.id }, late: x.data < T }));
}

/* ---------------- lettura dei prezzi dal testo di un preventivo ---------------- */
const NUM = /(?:€\s*)?(\d{1,3}(?:\.\d{3})+,\d{1,4}|\d+,\d{1,4}|\d+\.\d{2,4}|\d+)(?:\s*(?:€|euro|eur)\b)?/gi;
const num = s => { s = String(s); if (/,/.test(s)) s = s.replace(/\./g, '').replace(',', '.'); return parseFloat(s); };
const UM_RE = /(?:€|euro|eur)?\s*(?:\/|al|alla|per|a)\s*(q\.?\s?l[ie]?\.?|qli|quintale|q|t|ton\w*|tn|kg|lt|l|litr\w*|dos[ei]|sacc\w*|conf\w*|pz|cad\w*|balla|rotol\w*|bancale|ha|ettar\w*|m2|mq|m3|mc)\b/i;
const DATA_RE = /(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/;
const isoDa = m => { if (!m) return null; let y = +m[3]; if (y < 100) y += 2000; const mm = String(+m[2]).padStart(2, '0'), dd = String(+m[1]).padStart(2, '0'); const s = `${y}-${mm}-${dd}`; return okD(s) && +mm <= 12 && +dd <= 31 ? s : null; };
/** Trova nel testo i prezzi delle voci (righe con le parole della voce e un numero con i decimali), la data,
 *  la validità e i giorni di pagamento. È una proposta: si controlla sempre prima di salvare. */
export function leggiTesto(testo, voci) {
  const linee = String(testo || '').split(/\r?\n/).map(s => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const out = { prezzi: {}, data: null, validita: null, pagamento: null, trasporto: null };
  for (const v of voci) {
    const ok = cerca(v);
    let trovata = null;
    for (let i = 0; i < linee.length && !trovata; i++) {
      if (!ok(linee[i])) continue;
      // la riga sotto vale solo se c'è il prezzo da solo (niente parole che possano essere un altro prodotto)
      const sotto = linee[i + 1] || ''; const soloPrezzo = sotto && !/[a-zà-ù]{4,}/i.test(sotto.replace(/euro|quintal\w*|tonnell\w*|litr\w*|sacc\w*|confez\w*|cadaun\w*|prezzo|netto|iva esclusa/gi, ''));
      for (const riga of soloPrezzo ? [linee[i], linee[i] + ' ' + sotto] : [linee[i]]) {
        const nums = [...riga.matchAll(NUM)].map(m => ({ s: m[0], v: num(m[1]), dec: /[.,]\d/.test(m[1]), eur: /€|euro|eur/i.test(m[0]), i: m.index }))
          .filter(n => n.v > 0 && !/%/.test(riga.slice(n.i + n.s.length, n.i + n.s.length + 2)));
        const cand = nums.filter(n => n.eur && n.dec)[0] || nums.filter(n => n.dec).slice(-1)[0];
        if (!cand) continue;
        const dopo = riga.slice(cand.i, cand.i + cand.s.length + 24); const mu = dopo.match(UM_RE) || riga.match(UM_RE);
        const pg = riga.match(/(?:prot\w*|p\.?\s?g\.?)\s*(?:grezza)?\s*[:=]?\s*(\d{1,2}(?:[.,]\d)?)\s*%/i) || riga.match(/(\d{1,2}(?:[.,]\d)?)\s*%\s*(?:di\s*)?prot/i);
        trovata = { prezzo: Math.round(cand.v * 10000) / 10000, um: mu ? umNorm(mu[1]) : '', pg: pg ? num(pg[1]) : null, testo: riga.slice(0, 160) };
        break;
      }
    }
    if (trovata) out.prezzi[v.id] = trovata;
  }
  const tutto = linee.join('\n');
  const val = tutto.match(/valid\w*[^\n]{0,40}?(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/i);
  if (val) out.validita = isoDa(val);
  const vg = !out.validita && tutto.match(/valid\w*[^\n]{0,30}?(\d{1,3})\s*(?:gg|giorni)/i);
  const d0 = tutto.match(DATA_RE); out.data = isoDa(d0);
  if (vg) { out.validitaGg = +vg[1]; if (out.data) out.validita = addDays(out.data, +vg[1]); }
  const pag = tutto.match(/pagament\w*[^\n]{0,60}?(\d{2,3})\s*(?:gg|giorni)/i) || tutto.match(/(\d{2,3})\s*(?:gg|giorni)\s*(?:d\.?\s?f\.?|data fattura|fine mese|f\.?\s?m\.?|dffm)/i);
  if (pag) out.pagamento = +pag[1];
  else if (/rimessa diretta|alla consegna|contanti|anticipat/i.test(tutto)) out.pagamento = 0;
  if (/(trasporto|consegna|resa)[^\n]{0,30}(inclus|compres|franco (vs|vostr|azienda|destino))/i.test(tutto)) out.trasporto = 'incluso';
  return out;
}

/** Richiesta per il modello (sul PC o Claude): solo il testo del preventivo e l'elenco dei prodotti cercati. */
export function domandaModello(testo, voci) {
  const sys = `Leggi il preventivo o il contratto di fornitura di un'azienda agricola italiana con vacche da latte. Ti do l'elenco dei prodotti che interessano, con il loro id e l'unità di misura usata dall'azienda.
Rispondi SOLO con un oggetto JSON, senza altro testo, così:
{"ditta": "nome della ditta che fa l'offerta" o null, "data": "AAAA-MM-GG" o null, "validita": "AAAA-MM-GG" (fino a quando vale l'offerta) o null, "pagamento_gg": numero di giorni di pagamento o null, "trasporto": "incluso" o "escluso" o null, "condizioni": "frase breve su prezzo bloccato o legato a un listino, quantità minime, penali" o null,
 "prezzi": [{"id": "id del prodotto dell'elenco", "prezzo": numero IVA esclusa, "um": "unità del prezzo (kg, q, t, l, dose, sacco, conf, pz, ha)", "proteina": percentuale di proteina grezza o null, "testo": "riga del preventivo da cui hai preso il prezzo"}],
 "altri": [{"descrizione": "...", "prezzo": numero, "um": "..."}]}
Metti in "prezzi" solo i prodotti dell'elenco che trovi davvero nel testo; se un prodotto non c'è, non inventarlo. In "altri" i prodotti del preventivo che non sono nell'elenco. Usa il punto per i decimali.`;
  const user = 'PRODOTTI CERCATI:\n' + voci.map(v => `- id ${v.id}: ${v.nome} (${v.um})`).join('\n') + '\n\nTESTO DEL DOCUMENTO:\n' + String(testo || '').slice(0, 12000);
  return { sys, user };
}
/** Risposta del modello → stessa forma di leggiTesto (più ditta, condizioni, altri). */
export function rispostaModello(txt, voci) {
  const m = String(txt || '').match(/\{[\s\S]*\}/); let j = null; try { j = m ? JSON.parse(m[0]) : null; } catch (e) { j = null; }
  if (!j || typeof j !== 'object') throw new Error('La risposta del modello non si legge: riprova o scrivi i prezzi a mano.');
  const ids = new Set(voci.map(v => v.id)); const out = { prezzi: {}, data: okD(j.data) ? j.data : null, validita: okD(j.validita) ? j.validita : null, pagamento: Number.isFinite(+j.pagamento_gg) && j.pagamento_gg !== null ? +j.pagamento_gg : null, trasporto: j.trasporto === 'incluso' ? 'incluso' : null, ditta: j.ditta || null, condizioni: j.condizioni || null, altri: Array.isArray(j.altri) ? j.altri.slice(0, 30) : [] };
  for (const p of Array.isArray(j.prezzi) ? j.prezzi : []) if (p && ids.has(p.id) && +p.prezzo > 0) out.prezzi[p.id] = { prezzo: +p.prezzo, um: umNorm(p.um), pg: +p.proteina > 0 ? +p.proteina : null, testo: String(p.testo || '').slice(0, 160) };
  return out;
}
