// Confronto fra il regime IVA ordinario e il regime speciale agricolo (art. 34 DPR 633/72), dalla 1.44.0.
// Regime ordinario: IVA da versare = IVA delle vendite − IVA degli acquisti (quella vera, fattura per fattura).
// Regime speciale: IVA da versare = IVA delle vendite − compensazione (venduto × percentuale del prodotto);
// l'IVA degli acquisti non si recupera. Quindi il regime speciale conviene quando la compensazione supera l'IVA degli acquisti.
// Passare dall'ordinario allo speciale costa la "rettifica" (art. 19-bis2): si restituisce la parte dell'IVA già detratta
// sui beni ammortizzabili non ancora "consumati" (5 anni, 10 per i fabbricati) e sulle scorte.
//
// Impostazioni in `econfig` id `regime-iva` (raccolta riservata al titolare):
//   { perc: { latte, bovini, cereali, altro } in %, inizio: anno di inizio del regime ordinario (facoltativo),
//     scorte: IVA detratta sulle scorte in magazzino (€, facoltativo), inv: [{ id, anno, nome, imp, aliq, cat }] investimenti previsti
//     (cat 'fabbricati' = 10 anni di controllo, altrimenti 5) }
import { S } from '../state.js';
import { N, yearOf, today } from '../util.js';
import * as store from '../store.js';
import { righe, fatture, bilancio, anniFatture } from './dati.js';
import { beni, CATEGORIE } from './beni.js';
import { centroCategoria } from './centri.js';

// Percentuali di compensazione (DM 12/5/1992 e successivi): latte fresco 10% (DM 26/1/2016), bovini vivi 7% dal 2023
// (non più prorogato il 9,5%), cereali 4%. Si cambiano nella pagina se un decreto nuovo le modifica.
export const GRUPPI = [
  { k: 'latte', nome: 'Latte (con premi e trattenute)', perc: 10, re: /latte/i },
  { k: 'bovini', nome: 'Bovini vivi (vacche, manze, vitelli)', perc: 7, re: /vitell|bovin|vacc|manz|torell|animali viv/i },
  { k: 'cereali', nome: 'Cereali e foraggi', perc: 4, re: /cereal|foragg|mais|orzo|frument|grano|soia|fieno|insilat/i },
  { k: 'altro', nome: 'Altre vendite (servizi, energia, macchine usate, rimborsi…)', perc: 0, re: null },
];
export const SOGLIA_BENE = 516.46; // sotto questo costo il bene non entra nella rettifica

const r2 = v => Math.round(v * 100) / 100;
export const conf = () => S.econfig.find(x => x.id === 'regime-iva') || {};
export async function salvaConf(patch) { const { id, ...c } = conf(); await store.put('econfig', 'regime-iva', Object.assign({}, c, patch)); }
export const perc = k => { const p = (conf().perc || {})[k]; return p === undefined || p === null || p === '' ? GRUPPI.find(g => g.k === k).perc : N(p); };
export const gruppoDi = cat => (GRUPPI.find(g => g.re && g.re.test(String(cat || ''))) || GRUPPI[GRUPPI.length - 1]).k;
const ivaRiga = r => N(r.importo) * N(String(r.aliquota || '').replace(',', '.')) / 100;

/** I conti IVA di un anno nei due regimi. */
export function anno(y) {
  const fs = fatture().filter(f => f.anno === y);
  const ven = fs.filter(f => f.tipo === 'Vendita'), acq = fs.filter(f => f.tipo === 'Acquisto');
  const gr = Object.fromEntries(GRUPPI.map(g => [g.k, { imp: 0, iva: 0 }]));
  const primo = new Map(); // gruppo della fattura (dalla prima riga), per le righe di differenza
  const primoInv = new Map(); // aliquota della prima riga d'investimento della fattura
  let ivaInv = 0, impInv = 0;
  for (const r of righe()) {
    if (r.anno !== y) continue;
    if (r.tipo === 'Vendita') {
      const g = r.rett ? (primo.get(r.fid) || 'altro') : gruppoDi(r.categoria);
      if (!r.rett && !primo.has(r.fid)) primo.set(r.fid, g);
      gr[g].imp += N(r.importo); gr[g].iva += ivaRiga(r);
    } else if (r.rett) {
      if (primoInv.has(r.fid)) { ivaInv += N(r.importo) * primoInv.get(r.fid) / 100; impInv += N(r.importo); }
    } else if (centroCategoria('Acquisto', r.categoria) === 'inv') {
      ivaInv += ivaRiga(r); impInv += N(r.importo);
      if (!primoInv.has(r.fid)) primoInv.set(r.fid, N(String(r.aliquota || '').replace(',', '.')));
    }
  }
  const comp = GRUPPI.reduce((t, g) => t + gr[g.k].imp * perc(g.k) / 100, 0);
  const ivaVenF = ven.reduce((t, f) => t + N(f.iva), 0), ivaAcqF = acq.reduce((t, f) => t + N(f.iva), 0);
  const v = ((bilancio(y) || {}).iva || {}).voci || {};
  const dich = v.vf_iva !== undefined && v.vf_iva !== null && v.ve_iva !== undefined && v.ve_iva !== null;
  const ivaVen = dich ? N(v.ve_iva) : ivaVenF, ivaAcq = dich ? N(v.vf_iva) : ivaAcqF;
  const ord = ivaVen - ivaAcq;               // negativo = credito IVA
  const spec = Math.max(0, ivaVen - comp);   // nel regime speciale non nasce credito (salvo esportazioni)
  return {
    y, n: fs.length, dich, ivaVen, ivaAcq, ivaVenF, ivaAcqF, ivaInv: r2(ivaInv), impInv, gr, comp: r2(comp),
    venAgr: GRUPPI.filter(g => g.k !== 'altro').reduce((t, g) => t + gr[g.k].imp, 0),
    ord: r2(ord), spec: r2(spec),
    vantaggioSpec: r2(ord - spec), // > 0: nel regime speciale si paga meno
  };
}

/** Anni da mostrare: quelli con fatture (al massimo gli ultimi 6). */
export const anni = () => anniFatture().slice(-6);

/** IVA di un bene del registro: dalle righe delle fatture collegate, altrimenti stimata. */
function ivaBene(b) {
  let iva = 0, trovata = false;
  for (const l of b.fatture || []) {
    const f = S.fatture.find(x => x.id === l.fid); if (!f) continue;
    for (const i of l.righe || []) { const r = (f.righe || [])[i]; if (r) { iva += ivaRiga(r); trovata = true; } }
  }
  if (trovata) return { iva: Math.abs(iva), stimata: false };
  const aliq = b.cat === 'bestiame' ? 10 : 22;
  return { iva: N(b.costo) * aliq / 100, stimata: true, aliq };
}

/** Anno della prima fattura collegata a un bene (null se non ha fatture). */
function annoFatture(b) {
  let m = null;
  for (const l of b.fatture || []) { const f = S.fatture.find(x => x.id === l.fid); const y = f ? yearOf(f.data) : null; if (y && (m === null || y < m)) m = y; }
  return m;
}

/** Rettifica da pagare se dal 1° gennaio dell'anno Y si passa al regime speciale. */
export function rettifica(Y) {
  const c = conf(); const inizio = N(c.inizio) || 0;
  const righeB = [];
  for (const b of beni()) {
    if (b.cat === 'terreni' || N(b.costo) < SOGLIA_BENE) continue;
    const ya = yearOf(b.data); if (!ya) continue;
    const per = b.cat === 'fabbricati' ? 10 : 5;
    let res;
    if (ya >= Y) {
      // entra in funzione dopo il cambio ma è stato fatturato (e l'IVA detratta) prima: si restituisce tutta
      const af = annoFatture(b); if (!af || af >= Y) continue;
      if (inizio && af < inizio) continue;
      res = per;
    } else {
      if (b.fine && yearOf(b.fine) < Y) continue;          // già venduto
      if (inizio && ya < inizio) continue;                  // comprato quando l'IVA non si detraeva
      res = per - (Y - ya); if (res <= 0) continue;
    }
    const x = ivaBene(b);
    righeB.push({ id: b.id, nome: b.nome, cat: (CATEGORIE[b.cat] || {}).nome || b.cat, anno: ya, per, residui: res, iva: r2(x.iva), stimata: x.stimata, quota: r2(x.iva * res / per), libero: ya + per });
  }
  // investimenti previsti negli anni prima di Y: anche loro entrano nella rettifica
  for (const i of c.inv || []) {
    const ya = Math.round(N(i.anno)); if (!ya || ya >= Y || N(i.imp) < SOGLIA_BENE) continue;
    const per = i.cat === 'fabbricati' ? 10 : 5; const res = per - (Y - ya); if (res <= 0) continue;
    const iva = N(i.imp) * N(i.aliq) / 100;
    righeB.push({ id: i.id, nome: (i.nome || 'Investimento') + ' (previsto)', cat: (CATEGORIE[i.cat] || CATEGORIE.macchine).nome, anno: ya, per, residui: res, iva: r2(iva), stimata: false, quota: r2(iva * res / per), libero: ya + per });
  }
  const scorte = N(c.scorte);
  const tot = r2(righeB.reduce((t, r) => t + r.quota, 0) + scorte);
  return { Y, righe: righeB.sort((a, b) => b.quota - a.quota), scorte, tot, libero: righeB.reduce((m, r) => Math.max(m, r.libero), 0) };
}

/** Anno "tipo" su cui fare le previsioni: l'ultimo anno intero con fatture, senza gli investimenti. */
export function base() {
  const oggi = yearOf(today());
  const as = anniFatture().filter(a => a < oggi);
  const ys = as.length ? as.slice(-2) : anniFatture().slice(-1);
  if (!ys.length) return null;
  const A = ys.map(anno);
  const m = k => A.reduce((t, a) => t + a[k], 0) / A.length;
  return { anni: ys, parziale: !as.length, comp: m('comp'), ivaVen: m('ivaVen'), ivaAcqCorr: A.reduce((t, a) => t + a.ivaAcq - a.ivaInv, 0) / A.length };
}

/** Se passi al regime speciale dal 1° gennaio di Y: vantaggio nei 3 anni del vincolo, meno la rettifica. */
export function scenario(Y, B = base()) {
  if (!B) return null;
  const inv = conf().inv || [];
  const anniS = [Y, Y + 1, Y + 2].map(a => {
    // investimenti di quell'anno: scritti qui come previsti, oppure già nel registro dei beni con la data di quell'anno
    // e senza fatture di prima del cambio (quelli già fatturati prima vanno nella rettifica)
    const ivaInvP = inv.filter(i => N(i.anno) === a).reduce((t, i) => t + N(i.imp) * N(i.aliq) / 100, 0)
      + beni().filter(b => b.cat !== 'terreni' && yearOf(b.data) === a && !((annoFatture(b) || a) < Y)).reduce((t, b) => t + ivaBene(b).iva, 0);
    const ivaAcq = B.ivaAcqCorr + ivaInvP;
    const ord = B.ivaVen - ivaAcq, spec = Math.max(0, B.ivaVen - B.comp);
    return { anno: a, ivaInvP: r2(ivaInvP), ord: r2(ord), spec: r2(spec), vantaggio: r2(ord - spec) };
  });
  const R = rettifica(Y);
  const vant = r2(anniS.reduce((t, a) => t + a.vantaggio, 0));
  const inizio = Math.round(N(conf().inizio)) || 0;
  const vincolo = inizio && Y < inizio + 3 ? inizio + 2 : 0; // l'opzione per l'ordinario vale almeno 3 anni
  return { Y, anni: anniS, vantaggio3: vant, rettifica: R.tot, netto: r2(vant - R.tot), controllo: R.libero > Y, libero: R.libero, vincolo, R };
}

/** I prossimi anni possibili per il cambio, con il conto di ognuno. */
export function scenari(n = 8) {
  const B = base(); if (!B) return { B: null, S: [] };
  const da = yearOf(today()) + 1;
  return { B, S: Array.from({ length: n }, (_, i) => scenario(da + i, B)) };
}
