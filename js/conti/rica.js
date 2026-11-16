// Conto economico agricolo secondo lo schema RICA del CREA (dalla 1.40.0) e confronto fra bilancino e fatture.
// Fonte delle definizioni: glossario del factsheet RICA del CREA (Ricavi totali aziendali = PLV + attività complementari;
// Costi correnti = fattori di consumo extraziendali + servizi di terzi + altre spese; Valore aggiunto = RTA − CC;
// Reddito operativo = VA − costi pluriennali − redditi distribuiti; Reddito netto = RO ± gestione extra-caratteristica).
// Solo i pagamenti diretti del primo pilastro PAC stanno nei ricavi; gli altri aiuti nella gestione extra-caratteristica.
//
// Ogni voce RICA raccoglie righe del conto economico (CE, numeri di riga di schema.js) e categorie delle fatture.
// Il confronto mostra per voce: quanto dice il bilancino (CE calcolato, con i conti che ci sono finiti) e quanto dicono
// le fatture (righe per categoria). Le scelte del titolare: categoria → voce in cfg.ricaCat ('<tipo>|<categoria>'),
// conto del bilancino → riga del CE in cfg.contiUtente (come la tabella "Conti del bilancino").
import { S } from '../state.js';
import { N } from '../util.js';
import { righe, bilancio, calc, cfg } from './dati.js';
import { calcolaCe } from './bilancino-parse.js';
import { centroCategoria } from './centri.js';
import { CE } from './schema.js';

// gruppi dello schema, nell'ordine del conto economico RICA
export const GRUPPI = [
  { k: 'plv', l: 'Produzione lorda vendibile', segno: 1 },
  { k: 'atco', l: 'Attività complementari', segno: 1 },
  { k: 'fc', l: 'Fattori di consumo extraziendali', segno: -1 },
  { k: 'st', l: 'Servizi di terzi', segno: -1 },
  { k: 'asc', l: 'Altre spese correnti', segno: -1 },
  { k: 'cp', l: 'Costi pluriennali', segno: -1 },
  { k: 'rd', l: 'Redditi distribuiti', segno: -1 },
  { k: 'ge', l: 'Gestione extra-caratteristica', segno: 1 },
];
// voci: righe del CE (ce: [righe], meno: [righe da togliere]) e categorie delle fatture (cat: espressione, tipo A/V);
// fuori: la voce non passa dalle fatture (salari, ammortamenti, PAC…), rif: riga del CE dove mandare un conto del bilancino
export const VOCI = [
  { k: 'latte', g: 'plv', l: 'Latte e premi del latte', ce: [8], rif: 8, tipo: 'V', cat: /^latte$|premi e trattenute latte|latte/i },
  { k: 'animali', g: 'plv', l: 'Animali venduti (vitelli, vacche, manze)', ce: [9], rif: 9, tipo: 'V', cat: /vitell|bovin|animali|bestiame/i },
  { k: 'vegetali', g: 'plv', l: 'Prodotti dei campi venduti (cereali, foraggi)', ce: [10], rif: 10, tipo: 'V', cat: /cereal|foragg|mais|fieno|paglia|insilat/i },
  { k: 'altriProd', g: 'plv', l: 'Altri prodotti agricoli', ce: [11, 15], rif: 11, tipo: 'V', cat: /altri prodotti|letame|liquame|digestat/i },
  { k: 'scorte', g: 'plv', l: 'Variazione delle scorte di prodotti', ce: [16, 17], rif: 16, fuori: true },
  { k: 'rimonta', g: 'plv', l: 'Rimonta interna e lavori in economia', ce: [18], rif: 18, fuori: true },
  { k: 'pac', g: 'plv', l: 'Pagamenti diretti PAC (primo pilastro)', ce: [20], rif: 20, fuori: true, tipo: 'V', cat: /\bpac\b|domanda unica|agea/i },
  { k: 'contoterziAtt', g: 'atco', l: 'Contoterzismo e servizi fatti ad altri', ce: [12], rif: 12, tipo: 'V', cat: /servizi|contoterz|prestaz|lavoraz|noleggi/i },
  { k: 'connesse', g: 'atco', l: 'Energia e altre attività connesse', ce: [13, 14], rif: 14, tipo: 'V', cat: /energia|fotovolt|biogas|agritur|affitt/i },
  { k: 'sementi', g: 'fc', l: 'Sementi e piantine', ce: [31], rif: 31, tipo: 'A', cat: /sement|piantin/i },
  { k: 'concimi', g: 'fc', l: 'Concimi', ce: [32], rif: 32, tipo: 'A', cat: /concim|fertiliz|ammendant|azoto(?! e fecond)/i },
  { k: 'difesa', g: 'fc', l: 'Difesa delle colture (fitofarmaci, diserbanti)', ce: [33], rif: 33, tipo: 'A', cat: /fitofarm|diserb|antiparass/i },
  { k: 'mangimi', g: 'fc', l: 'Mangimi, integratori e foraggi comprati', ce: [30], rif: 30, tipo: 'A', cat: /mangim|integrat|additiv|foragg|materie prime/i },
  { k: 'meccan', g: 'fc', l: 'Carburanti, lubrificanti e ricambi', ce: [34], rif: 34, tipo: 'A', cat: /carburant|gasolio|lubrific|ricamb|pneumat/i },
  { k: 'energia', g: 'fc', l: 'Energia elettrica, acqua e riscaldamento', ce: [42], rif: 42, tipo: 'A', cat: /energia|elettric|acqua|gas\b|riscald/i },
  { k: 'veterin', g: 'fc', l: 'Veterinario, farmaci e fecondazione', ce: [39, 46], rif: 39, tipo: 'A', cat: /farmac|veterin|fecondaz|controlli funz|anagrafe bovina/i },
  { k: 'altriFc', g: 'fc', l: 'Materiali di consumo, igiene e stalla (teli, tubi, vestiario…)', ce: [36], rif: 36, tipo: 'A', cat: /igiene|mungit|lettier|segatur|teli|film|reti|tubi|idraulic|vestiario|dpi|attrezzature|materiali|animali domestici|consumo/i },
  { k: 'altriAcq', g: 'fc', l: 'Altri acquisti senza voce (conto generico del bilancino)', ce: [37], rif: 37, generica: true, nota: 'Qui il commercialista mette gli acquisti che non ha diviso: guarda i conti e spostali nella voce giusta.' },
  { k: 'bestiame', g: 'fc', l: 'Bestiame comprato', ce: [35], rif: 35, tipo: 'A', cat: /acquisto bestiame/i, nota: 'Nel RICA le vacche e le manze da vita comprate sono un investimento; il bilancino le mette fra i costi e qui restano così per poterlo confrontare.' },
  { k: 'scorteAcq', g: 'fc', l: 'Variazione delle scorte di mangimi e materiali', ce: [69], rif: 69, fuori: true },
  { k: 'contoterzi', g: 'st', l: 'Contoterzisti e noleggi', ce: [40, 53, 54], rif: 40, tipo: 'A', cat: /contoterz|terzist|noleggi|leasing/i },
  { k: 'assicuraz', g: 'st', l: 'Assicurazioni', ce: [43], rif: 43, tipo: 'A', cat: /assicuraz/i },
  { k: 'manutenz', g: 'asc', l: 'Manutenzioni e riparazioni', ce: [41], rif: 41, tipo: 'A', cat: /lavori e riparaz|manutenz|riparaz/i },
  { k: 'consulenze', g: 'asc', l: 'Consulenze, commercialista e paghe', ce: [44, 49], rif: 44, tipo: 'A', cat: /consulen|professional/i },
  { k: 'altreSpese', g: 'asc', l: 'Altre spese (trasporti, telefono, rifiuti, banca, consorzi…)', ce: [45, 47, 48, 55, 74, 77], rif: 45, tipo: 'A', cat: /.*/ },
  { k: 'altriServ', g: 'asc', l: 'Altri servizi senza voce (conto generico del bilancino)', ce: [50], rif: 50, generica: true, nota: 'Qui il commercialista mette i servizi che non ha diviso (contoterzisti, affitti, lavori…): guarda i conti e spostali nella voce giusta.' },
  { k: 'ammort', g: 'cp', l: 'Ammortamenti', ce: [63, 64, 65, 66, 67, 68], rif: 65, fuori: true },
  { k: 'accant', g: 'cp', l: 'TFR e accantonamenti', ce: [59, 70, 71], rif: 59, fuori: true },
  { k: 'salari', g: 'rd', l: 'Salari e oneri sociali', ce: [57, 58, 60, 61], rif: 57, fuori: true },
  { k: 'affitti', g: 'rd', l: 'Affitti di terreni e fabbricati', ce: [52], rif: 52, tipo: 'A', cat: /affitt|fitti/i },
  { k: 'finanza', g: 'ge', l: 'Interessi e oneri finanziari (attivi − passivi)', ce: [82, 83, 91], meno: [86], det: [84, 85, 87, 88, 89, 90], rif: 87, fuori: true },
  { k: 'straord', g: 'ge', l: 'Gestione straordinaria e diversa (plus/minusvalenze, risarcimenti…)', ce: [22, 23, 24, 25, 95], meno: [75, 76, 96], rif: 25, fuori: true },
  { k: 'aiutiAltri', g: 'ge', l: 'Altri aiuti pubblici (PSR, nazionali)', ce: [21], rif: 21, fuori: true },
  { k: 'imposte', g: 'ge', l: 'Imposte e tasse', ce: [], meno: [73, 100], det: [101, 102, 103, 104], rif: 73, fuori: true },
];
export const VOCE = Object.fromEntries(VOCI.map(v => [v.k, v]));
/** Voci in cui si può mandare un conto del bilancino (hanno una riga del CE tutta loro). */
export const VOCI_CONTO = VOCI.filter(v => [...(v.ce || []), ...(v.meno || []), ...(v.det || [])].includes(v.rif));
const GRUPPO = Object.fromEntries(GRUPPI.map(g => [g.k, g]));
// voci per le categorie delle fatture, nell'ordine in cui si provano (le più precise prima)
const ORDINE_ACQ = ['bestiame', 'affitti', 'contoterzi', 'assicuraz', 'sementi', 'difesa', 'concimi', 'veterin', 'mangimi', 'meccan', 'energia', 'manutenz', 'consulenze', 'altriFc', 'altreSpese'];
const ORDINE_VEN = ['latte', 'animali', 'vegetali', 'pac', 'contoterziAtt', 'connesse', 'altriProd'];
const NOME_RIGA = Object.fromEntries(CE.filter(x => x.row).map(x => [x.row, x.l]));
export const nomeRiga = r => NOME_RIGA[r] || ('riga ' + r);
const r2 = v => Math.round(v * 100) / 100;

/** Voce RICA di una riga del CE (con il segno con cui conta: + ricavi, − costi). */
export function voceDiRiga(r) {
  for (const v of VOCI) { if ((v.ce || []).includes(+r) || (v.meno || []).includes(+r) || (v.det || []).includes(+r)) return v; }
  return null;
}
/** Voce RICA predefinita di una categoria delle fatture. */
export function vocePredefinita(tipo, categoria) {
  const c = String(categoria || ''); const ord = tipo === 'Vendita' ? ORDINE_VEN : ORDINE_ACQ;
  for (const k of ord) { const v = VOCE[k]; if (v.cat && v.cat.test(c)) return k; }
  return tipo === 'Vendita' ? 'altriProd' : 'altreSpese';
}
/** Voce RICA di una categoria: scelta del titolare (cfg.ricaCat) o predefinita; null = fuori (investimenti, non conta). */
export function voceCategoria(tipo, categoria) {
  const s = (cfg().ricaCat || {})[tipo + '|' + categoria]; if (s) return s === 'fuori' ? null : s;
  if (tipo !== 'Vendita') { const c = centroCategoria(tipo, categoria); if (c === 'inv' && !/bestiame/i.test(categoria || '')) return null; if (c === 'no') return null; }
  else if (centroCategoria(tipo, categoria) === 'no') return null;
  return vocePredefinita(tipo, categoria);
}

/** Valore (con segno: ricavi +, costi −) di una voce dal conto economico calcolato. */
function valoreCe(v, ce) {
  const g = GRUPPO[v.g]; let t = 0;
  for (const r of v.ce || []) t += N(ce[r]);
  for (const r of v.meno || []) t -= N(ce[r]);
  // i costi si scrivono positivi nel CE: nei gruppi di costo diventano negativi
  return r2(g.segno < 0 ? -t : t);
}

/** Confronto completo dell'anno: { voci: [...], gruppi, totali, conti (del bilancino), categorie, haBil, haFatt } */
export function confronto(y) {
  const C = calc(y); const ce = C.ce || {}; const b = bilancio(y) || {};
  const bil = b.bilancino && b.bilancino.dati ? calcolaCe(b.bilancino.dati, cfg().contiUtente || {}) : null;
  // conti del bilancino per voce
  const contiPer = {};
  if (bil) for (const c of bil.conti) {
    if (c.riga == null || c.importo == null) continue; const v = voceDiRiga(c.riga); const k = v ? v.k : 'altreSpese';
    (contiPer[k] = contiPer[k] || []).push({ chiave: c.chiave, conto: c.conto, descrizione: c.descrizione, riga: c.riga, importo: r2(N(c.importo)), sezione: c.sezione, criterio: c.criterio, contenitore: [37, 50, 15].includes(+c.riga) });
  }
  // fatture per voce e categoria
  const catPer = {}; const categorie = new Map(); let fuoriInv = 0;
  for (const r of righe()) {
    if (r.anno !== y || (r.tipo !== 'Acquisto' && r.tipo !== 'Vendita')) continue;
    const k = voceCategoria(r.tipo, r.categoria); const imp = N(r.importo);
    const ck = r.tipo + '|' + (r.categoria || '');
    const o = categorie.get(ck) || { tipo: r.tipo, categoria: r.categoria || '', voce: k, importo: 0, n: 0, scelta: !!(cfg().ricaCat || {})[ck] };
    o.importo += imp; o.n++; categorie.set(ck, o);
    if (!k) { if (r.tipo === 'Acquisto') fuoriInv += imp; continue; }
    const m = catPer[k] = catPer[k] || new Map(); m.set(r.categoria || '', (m.get(r.categoria || '') || 0) + imp);
  }
  const voci = VOCI.map(v => {
    const g = GRUPPO[v.g]; const bilV = valoreCe(v, ce);
    const fatt = catPer[v.k] ? [...catPer[v.k]].map(([categoria, imp]) => ({ categoria, importo: r2(imp) })).sort((a, b2) => Math.abs(b2.importo) - Math.abs(a.importo)) : [];
    const fattTot = r2(fatt.reduce((t, x) => t + x.importo, 0) * (g.segno < 0 ? -1 : 1)) || 0;
    const da = (v.ce || []).concat(v.meno || []);
    const altre = [];
    if (C.paghe && da.some(r => [57, 58, 59].includes(r))) altre.push('dalle paghe');
    if (C.amm && C.amm.ce && v.k === 'ammort') altre.push('dal registro dei beni');
    return { k: v.k, g: v.g, l: v.l, nota: v.nota || '', fuori: !!v.fuori, generica: !!v.generica, rif: v.rif, bil: bilV, fatt: v.fuori && !fatt.length ? null : fattTot, diff: v.fuori && !fatt.length ? null : r2(bilV - fattTot), conti: (contiPer[v.k] || []).sort((a, b2) => Math.abs(b2.importo) - Math.abs(a.importo)), categorie: fatt, altre };
  });
  // totali dello schema
  const somma = (gs, campo) => r2(voci.filter(v => gs.includes(v.g)).reduce((t, v) => t + N(v[campo]), 0));
  const tot = campo => {
    const plv = somma(['plv'], campo), atco = somma(['atco'], campo), rta = r2(plv + atco);
    const cc = somma(['fc', 'st', 'asc'], campo), va = r2(rta + cc);
    const cp = somma(['cp'], campo), rd = somma(['rd'], campo), ro = r2(va + cp + rd);
    const ge = somma(['ge'], campo), rn = r2(ro + ge);
    return { plv, atco, rta, cc, va, cp, rd, ro, ge, rn };
  };
  return {
    anno: y, voci, totBil: tot('bil'), totFatt: tot('fatt'), haBil: !!(C.has && C.has.ce), daBilancino: !!bil, haFatt: categorie.size > 0,
    categorie: [...categorie.values()].map(o => Object.assign(o, { importo: r2(o.importo) })).sort((a, b2) => a.tipo.localeCompare(b2.tipo) || Math.abs(b2.importo) - Math.abs(a.importo)),
    fuoriInv: r2(fuoriInv), paghe: !!C.paghe, ammRegistro: !!(C.amm && C.amm.ce),
  };
}

/** Tipo di spesa di un conto del bilancino dal nome: merci (acquisti) o servizi. */
const tipoConto = d => (/SERVIZ|PRESTAZ|COMPENS|CONSULEN|NOLEGG|AFFITT|FITTI|ASSICUR/i.test(d) ? 'servizi' : /MERCI|ACQ|MATER|MAT\.|PRODOTT|CARBUR/i.test(d) ? 'merci' : '');
const GRUPPI_TIPO = { merci: ['fc'], servizi: ['st', 'asc', 'rd'] };
/** Differenze da guardare, le più grosse prima, con una spiegazione e (se c'è) il conto generico del bilancino da spostare.
 *  Un conto generico si propone una volta sola, per una voce dello stesso tipo (merci → materiali, servizi → servizi)
 *  e solo se il suo importo è fra 0,4 e 1,6 volte quello che manca. */
export function differenze(R, soglia = 2000) {
  const costo = v => GRUPPO[v.g].segno < 0;
  const generici = R.voci.filter(v => v.generica).flatMap(v => v.conti.filter(c => c.sezione === 'COSTI' && c.importo > soglia).map(c => Object.assign({ voce: v.k, tipo: tipoConto(c.descrizione) }, c)));
  // voci di costo dove il bilancino ha meno delle fatture (diff > 0: il costo del bilancino è meno negativo)
  const mancanti = R.voci.filter(v => costo(v) && !v.generica && v.diff != null && v.diff >= soglia).map(v => ({ v, manca: v.diff }));
  const coppie = [];
  for (const c of generici) for (const m of mancanti) {
    if (!c.tipo || !GRUPPI_TIPO[c.tipo].includes(m.v.g)) continue;
    const q = c.importo / m.manca; if (q < 0.4 || q > 1.6) continue;
    coppie.push({ c, m, err: Math.abs(Math.log(q)) });
  }
  coppie.sort((a, b) => a.err - b.err);
  const usati = new Set(), proposta = new Map();
  for (const { c, m } of coppie) { if (usati.has(c.chiave) || proposta.has(m.v.k)) continue; usati.add(c.chiave); proposta.set(m.v.k, { chiave: c.chiave, descrizione: c.descrizione, importo: c.importo, da: c.voce, a: m.v.k, riga: m.v.rif }); }
  const out = [];
  for (const v of R.voci) {
    if (v.diff == null || Math.abs(v.diff) < soglia) continue;
    let testo; const p = proposta.get(v.k) || null; const d = Math.abs(v.diff);
    if (v.generica) testo = `Il bilancino ha ${eur(d)} in un conto generico, senza dire cosa sono. Nelle nostre fatture queste spese stanno nelle loro voci: per questo altre voci del bilancino risultano più basse.`;
    else if (costo(v) && v.diff > 0) testo = `Nelle fatture ci sono ${eur(d)} in più che nel bilancino.` + (p ? ` Probabilmente il commercialista li ha messi nel conto generico "${p.descrizione}" (${eur(p.importo)}).` : ` Forse il commercialista li ha messi in un conto generico o in un'altra voce.`);
    else if (costo(v)) testo = `Il bilancino ha ${eur(d)} in più delle fatture: ci sono conti che raccolgono spese di altre voci, oppure costi senza fattura (assicurazioni, spese della banca, scontrini).`;
    else if (v.diff < 0) testo = `Le fatture di vendita hanno ${eur(d)} in più del bilancino: il commercialista le ha messe in un'altra voce.`;
    else testo = `Il bilancino ha ${eur(d)} di ricavi in più delle fatture caricate: probabilmente mancano fatture di vendita, o sono vendite senza fattura.`;
    out.push({ voce: v.k, l: v.l, diff: v.diff, bil: v.bil, fatt: v.fatt, testo, proposta: p });
  }
  return out.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
}
const eur = v => Math.round(v).toLocaleString('it-IT') + ' €';
export const anniConfronto = () => [...new Set(S.bilanci.map(b => +b.id).filter(Boolean))].sort();
