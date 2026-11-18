// Conti: conviene comprare (o prendere in affitto) un terreno in zona? (dalla 1.49.0)
// Una valutazione = record in `econfig` id `vt-<uid>` (raccolta riservata al titolare, nessuna modifica allo schema):
//   { tipo: 'valutazione', nome, data, modo: 'acquisto'|'affitto', comune, foglio, particella, ref, geom, ha,
//     coltura (chiave di VAM), irriguo, prezzo (€ totali), canone (€/ha all'anno), margine (€/ha all'anno, vuoto = dai tuoi campi),
//     stalla (€/ha all'anno di vantaggio per la stalla), km (vuoto = calcolati), passaggi, forma, accesso,
//     altre (€/anno: IMU, consorzio…), agev (compra come coltivatore diretto o IAP), mediazione %, mutuo: { quota %, tasso %, anni }, note }
// Impostazioni in `econfig` id `terreni-conf`: { vam: {coltura: €/ha}, notaio, tassoRif, costoKm, passaggi }.
// Valori di riferimento: Valori Agricoli Medi 2025 della provincia di Udine, regione agraria n. 11 (comprende Povoletto),
// Commissione provinciale n. 2 del 05/05/2025, BUR n. 23 del 04/06/2025. Sono valori di stima, non prezzi di mercato: si cambiano nella pagina.
import { S } from '../state.js';
import { N } from '../util.js';
import * as store from '../store.js';
import { areaHa, centroid, outerRings, pointInGeom, insidePoint } from '../geo.js';
import { campoHa, campoInfo, cropOf } from '../domain.js';

export const COLTURE = [
  { k: 'seminativo', nome: 'Seminativo', vam: 35000, irr: 'seminativo_irriguo' },
  { k: 'seminativo_irriguo', nome: 'Seminativo irriguo', vam: 37000 },
  { k: 'seminativo_arborato', nome: 'Seminativo arborato', vam: 35000, irr: 'seminativo_arborato_irriguo' },
  { k: 'seminativo_arborato_irriguo', nome: 'Seminativo arborato irriguo', vam: 37000 },
  { k: 'prato', nome: 'Prato', vam: 15000 },
  { k: 'orto', nome: 'Orto', vam: 38000 },
  { k: 'frutteto', nome: 'Frutteto', vam: 43500 },
  { k: 'vigneto', nome: 'Vigneto', vam: 45000 },
  { k: 'vigneto_doc', nome: 'Vigneto DOC', vam: 90000 },
  { k: 'pioppeto', nome: 'Pioppeto', vam: 40000 },
  { k: 'bosco', nome: 'Bosco', vam: 6500 },
  { k: 'incolto', nome: 'Incolto produttivo', vam: 12000 },
];
export const FONTE_VAM = 'Valori Agricoli Medi 2025, provincia di Udine, regione agraria n. 11 (Povoletto)';
const DEF = { notaio: 2500, tassoRif: 2, passaggi: 10 };

export const conf = () => S.econfig.find(x => x.id === 'terreni-conf') || {};
export async function salvaConf(patch) { const { id, ...c } = conf(); await store.put('econfig', 'terreni-conf', Object.assign({}, c, patch)); }
const imp = (k, d) => { const v = conf()[k]; return v === undefined || v === null || v === '' ? d : N(v); };
export const vam = k => { const v = (conf().vam || {})[k]; if (v !== undefined && v !== null && v !== '') return N(v); const c = COLTURE.find(x => x.k === k); return c ? c.vam : 0; };
export const nomeColtura = k => (COLTURE.find(x => x.k === k) || {}).nome || k || '—';

export const valutazioni = () => S.econfig.filter(x => x.tipo === 'valutazione' && String(x.id).startsWith('vt-')).sort((a, b) => String(b.data || '').localeCompare(String(a.data || '')));
export const valutazione = id => S.econfig.find(x => x.id === id && x.tipo === 'valutazione') || null;
export async function salva(v) { const { id, ...r } = v; await store.put('econfig', id, r); }

/** Costo di un km con il trattore: media del costo orario dei mezzi ÷ 20 km/h su strada; senza costi orari 2 €/km. */
export function costoKmMezzi() {
  const c = S.mezzi.map(m => N(m.costoOra)).filter(x => x > 0);
  return c.length ? Math.round(c.reduce((t, x) => t + x, 0) / c.length / 20 * 100) / 100 : 2;
}
export const costoKm = () => imp('costoKm', costoKmMezzi());

const RAD = Math.PI / 180;
function kmAria(lat1, lon1, lat2, lon2) {
  const a = Math.sin((lat2 - lat1) * RAD / 2) ** 2 + Math.cos(lat1 * RAD) * Math.cos(lat2 * RAD) * Math.sin((lon2 - lon1) * RAD / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
/** Distanza dal centro aziendale (La mia azienda → posizione), su strada ≈ in linea d'aria × 1,3. */
export function kmDaAzienda(geom) {
  const a = S.config.find(x => x.id === 'azienda') || {}; const lat = N(a.lat), lon = N(a.lon);
  const c = geom && centroid(geom); if (!c || !lat || !lon) return null;
  return Math.round(kmAria(lat, lon, c[1], c[0]) * 1.3 * 10) / 10;
}

// Confine: un vertice di un poligono a meno di `soglia` metri da un lato dell'altro (coordinate in metri attorno al punto di partenza)
function aMetri(geom, o) { const k = Math.cos(o[1] * RAD); return outerRings(geom).map(r => r.map(([x, y]) => [(x - o[0]) * 111320 * k, (y - o[1]) * 110540])); }
function distSeg(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], l = dx * dx + dy * dy;
  const t = l ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}
function vicini(A, B, soglia) {
  for (const ra of A) for (const p of ra) for (const rb of B) for (let i = 0; i < rb.length - 1; i++) if (distSeg(p, rb[i], rb[i + 1]) <= soglia) return true;
  return false;
}
/** Campi dell'azienda che confinano con il terreno (entro 10 m: i confini disegnati non combaciano mai al centimetro). */
export function confinanti(geom, soglia = 10) {
  const o = geom && centroid(geom); if (!o) return [];
  const A = aMetri(geom, o), dentro = insidePoint(geom);
  // un tuo campo che contiene già il terreno (es. lo hai in affitto) non è un confinante
  return S.campi.filter(c => c.geom && !pointInGeom(dentro, c.geom)).filter(c => { const B = aMetri(c.geom, o); return vicini(A, B, soglia) || vicini(B, A, soglia); });
}

const PRATO = /prat|erb|medic|loiess|loglio|festuc|trifogl|pascol/i;
/** Margine medio per ettaro dei tuoi campi dello stesso tipo (seminativo o prato) negli ultimi 3 anni, solo dove hai segnato i ricavi. */
export function margineCampi(coltura, oggi = new Date().getFullYear()) {
  const prato = coltura === 'prato';
  let ric = 0, cos = 0, ha = 0, n = 0;
  for (let y = oggi - 3; y < oggi; y++) for (const c of S.campi) {
    const cr = cropOf(c, y) || ''; if (!cr || PRATO.test(cr) !== prato) continue;
    const i = campoInfo(c, y); if (!(i.ricavo > 0)) continue;
    ric += i.ricavo; cos += i.tot; ha += campoHa(c); n++;
  }
  return ha ? { ha: (ric - cos) / ha, n } : null;
}

/** Imposte e spese dell'atto (stima: da confermare con il notaio). */
export function speseAcquisto(prezzo, agev, notaio = imp('notaio', DEF.notaio), mediazione = 0) {
  const P = N(prezzo);
  const imposte = agev ? 200 + 200 + P * 0.01 : Math.max(1000, P * 0.15) + 50 + 50;
  return { imposte, notaio: N(notaio), mediazione: P * N(mediazione) / 100, tot: imposte + N(notaio) + P * N(mediazione) / 100 };
}
/** Prezzo più alto per cui prezzo + spese = valore V (inverso di speseAcquisto). */
function prezzoDaValore(V, agev, notaio, med) {
  const m = N(med) / 100;
  if (agev) return Math.max(0, (V - 400 - notaio) / (1.01 + m));
  const p = (V - 100 - notaio) / (1.15 + m);
  return Math.max(0, p * 0.15 >= 1000 ? p : (V - 1100 - notaio) / (1 + m));
}
const rata = (F, tasso, anni) => { const i = N(tasso) / 100, n = N(anni); if (!F || !n) return 0; return i ? F * i / (1 - Math.pow(1 + i, -n)) : F / n; };

/** Il calcolo di una valutazione: tutto quello che mostra la pagina. */
export function calcola(v) {
  const ha = N(v.ha) || (v.geom ? Math.round(areaHa(v.geom) * 10000) / 10000 : 0);
  const col = COLTURE.find(x => x.k === v.coltura) || COLTURE[0];
  const kc = v.irriguo && col.irr ? col.irr : col.k;
  const vamHa = vam(kc), zona = vamHa * ha;
  const mc = margineCampi(col.k);
  const margine = v.margine !== undefined && v.margine !== null && v.margine !== '' ? N(v.margine) : mc ? mc.ha : null;
  const corr = (v.forma === 'irregolare' ? 0.05 : 0) + (v.accesso === 'scomodo' ? 0.10 : 0);
  const kmCalc = kmDaAzienda(v.geom);
  const km = v.km !== undefined && v.km !== null && v.km !== '' ? N(v.km) : kmCalc;
  const passaggi = v.passaggi !== undefined && v.passaggi !== null && v.passaggi !== '' ? N(v.passaggi) : imp('passaggi', DEF.passaggi);
  const viaggi = (km || 0) * 2 * passaggi * costoKm();
  const stalla = N(v.stalla) * ha, altre = N(v.altre);
  const campo = margine === null ? null : margine * (1 - corr) * ha;
  const reddito = campo === null ? null : campo + stalla - viaggi - altre;
  const confina = v.geom ? confinanti(v.geom) : [];
  const tassoRif = Math.max(0.5, imp('tassoRif', DEF.tassoRif)), notaio = imp('notaio', DEF.notaio);
  const R = { ha, kc, vamHa, zona, margine, margineCampi: mc, corr, km, kmCalc, passaggi, viaggi, stalla, altre, campo, reddito, confina, tassoRif, avvisi: [] };
  if (!ha) R.avvisi.push('Manca la superficie.');
  if (margine === null) R.avvisi.push('Manca il margine per ettaro: scrivilo tu (nei tuoi campi non ci sono ricavi segnati da usare).');
  if (km === null) R.avvisi.push('Distanza dalla stalla non calcolata: segna la posizione dell\'azienda in La mia azienda o scrivi i km.');

  if (v.modo === 'affitto') {
    const canone = N(v.canone) * ha;
    // senza il canone: quanto rende il terreno all'anno; il canone massimo è quello che lascia zero
    R.canone = canone; R.canoneMax = reddito === null ? null : Math.max(0, reddito); R.canoneMaxHa = reddito === null || !ha ? null : Math.max(0, reddito / ha);
    R.netto = reddito === null ? null : reddito - canone;
    R.canoneSuZona = zona ? canone / zona * 100 : null;
    R.esito = reddito === null || !N(v.canone) ? 'manca' : R.netto >= 0.2 * Math.max(reddito, 1) ? 'verde' : R.netto >= 0 ? 'giallo' : 'rosso';
    return R;
  }
  const prezzo = N(v.prezzo);
  const sp = speseAcquisto(prezzo, v.agev, notaio, v.mediazione);
  R.prezzo = prezzo; R.prezzoHa = ha ? prezzo / ha : 0; R.spese = sp; R.costo = prezzo + sp.tot;
  R.suZona = zona ? prezzo / zona : null;
  R.rendimento = reddito !== null && R.costo ? reddito / R.costo * 100 : null;
  R.anni = reddito > 0 && R.costo ? R.costo / reddito : null;
  R.valoreReddito = reddito > 0 && tassoRif ? reddito / (tassoRif / 100) : reddito === null ? null : 0;
  R.maxReddito = R.valoreReddito === null ? null : prezzoDaValore(R.valoreReddito, v.agev, notaio, v.mediazione);
  // prezzo massimo consigliato: quello che si ripaga con il reddito; se confina, fino al valore di zona (accorpamento e prelazione)
  R.maxConsigliato = R.maxReddito === null ? null : confina.length ? Math.max(R.maxReddito, zona) : R.maxReddito;
  const mu = v.mutuo || {}; const F = R.costo * N(mu.quota) / 100;
  R.mutuo = F ? { F, rata: rata(F, mu.tasso, mu.anni), anni: N(mu.anni) } : null;
  if (R.mutuo && reddito !== null) R.cassa = reddito - R.mutuo.rata;
  R.esito = !prezzo || R.maxReddito === null ? 'manca' : prezzo <= R.maxConsigliato ? 'verde' : prezzo <= Math.max(zona * 1.1, R.maxConsigliato * 1.15) ? 'giallo' : 'rosso';
  return R;
}
