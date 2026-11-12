// Reddito lordo standard e incidenza delle spese varie (corso "Gestione economica dell'azienda agraria", serata 1).
//   PLV = imponibile delle fatture di vendita dell'anno + corrispettivi, senza IVA e senza PAC
//   Spese varie = beni e servizi che si esauriscono nell'anno (niente investimenti)
//   RLS = PLV − spese varie − affitti dei terreni − salari pagati
//   Spese varie / PLV: intorno al 25% nella media; oltre il 40% l'azienda è in difficoltà
import { N } from '../util.js';
import { righe, cfg, bilancio, calc, DA_CLASSIFICARE } from './dati.js';

export const VOCI = {
  Acquisto: [['sv', 'Spesa varia'], ['inv', 'Investimento'], ['aff', 'Affitto di terreni'], ['no', 'Non conta']],
  Vendita: [['plv', 'Produzione (PLV)'], ['no', 'Non conta']],
};
export const SOGLIE = { media: 0.25, allarme: 0.40 };

/** Voce del calcolo per una categoria: scelta a mano (cfg.rlsCat) o predefinita dal nome. */
export function voce(tipo, categoria) {
  const m = cfg().rlsCat || {}; const v = m[tipo + '|' + categoria]; if (v) return v;
  const c = String(categoria || '');
  if (tipo === 'Vendita') return /contribut|\bpac\b|psr|rimbors|indennizz|risarc|plusvalen|cession|vendita di (mezzi|macchin|attrezz)/i.test(c) ? 'no' : 'plv';
  if (c === DA_CLASSIFICARE) return 'sv';
  if (/affitt|\bfitti?\b/i.test(c)) return 'aff';
  // l'acquisto di bovine per la mandria (manze, vacche da allevamento) è capitale, come un trattore: non è una spesa dell'anno
  if (/materiali edili|calcestruzz|investiment|cespit|costruzion|bestiame/i.test(c)) return 'inv';
  return 'sv';
}

const r2 = v => Math.round(v * 100) / 100;
/** Tutti i numeri del calcolo per un anno. */
export function rls(y) {
  const per = new Map();
  for (const r of righe()) {
    if (r.anno !== y) continue;
    const k = r.tipo + '|' + r.categoria; const o = per.get(k) || { tipo: r.tipo, categoria: r.categoria, importo: 0, n: 0, voce: voce(r.tipo, r.categoria) };
    o.importo += N(r.importo); o.n++; per.set(k, o);
  }
  const cats = [...per.values()].map(o => Object.assign(o, { importo: r2(o.importo) })).sort((a, b) => b.importo - a.importo);
  const somma = (tipo, v) => r2(cats.filter(o => o.tipo === tipo && o.voce === v).reduce((t, o) => t + o.importo, 0));
  const man = (bilancio(y) || {}).rls || {}; const c = calc(y); const ce = c.ce || {};
  const has = k => man[k] !== undefined && man[k] !== null && man[k] !== '';
  const plvFatture = somma('Vendita', 'plv'), corrisp = N(man.corrisp);
  const sv = somma('Acquisto', 'sv'), inv = somma('Acquisto', 'inv'), affFatture = somma('Acquisto', 'aff');
  const affSenza = N(man.affitti);
  const salariAuto = r2(N(ce[56]));
  const salari = has('salari') ? N(man.salari) : salariAuto;
  const pacAuto = r2(N(ce[20]) + N(ce[21]));
  const pac = has('pac') ? N(man.pac) : pacAuto;
  const plv = r2(plvFatture + corrisp); const affitti = r2(affFatture + affSenza);
  const valore = r2(plv - sv - affitti - salari);
  const capitale = N(man.capitale);
  return {
    anno: y, cats, plvFatture, corrisp, plv, sv, inv, affFatture, affSenza, affitti, salari, salariAuto, salariFonte: has('salari') ? 'inserito' : c.paghe ? 'paghe' : salariAuto ? 'conto economico (B.9)' : '',
    pac, pacAuto, pacFonte: has('pac') ? 'inserito' : pacAuto ? 'conto economico (A.5)' : '', affCe: N(ce[52]),
    rls: valore, rlsPac: r2(valore + pac), incSv: plv > 0 ? sv / plv : null, incRls: plv > 0 ? valore / plv : null,
    capitale: capitale || null, roi: capitale > 0 ? valore / capitale : null, anniRientro: capitale > 0 && valore > 0 ? capitale / valore : null,
    noVen: somma('Vendita', 'no'), noAcq: somma('Acquisto', 'no'), daClass: r2(cats.filter(o => o.categoria === DA_CLASSIFICARE).reduce((t, o) => t + o.importo, 0)),
    vuoto: !cats.length && !corrisp, man,
  };
}
/** Giudizio sull'incidenza delle spese varie. */
export function giudizio(inc) {
  if (inc == null) return { cls: 'muted', testo: 'Serve la PLV (fatture di vendita o corrispettivi)' };
  if (inc <= SOGLIE.media) return { cls: 'ok', testo: 'In linea con la media (circa 25%)' };
  if (inc <= SOGLIE.allarme) return { cls: 'wa', testo: 'Sopra la media: da tenere d\'occhio' };
  return { cls: 'ko', testo: 'Campanello d\'allarme: oltre il 40%' };
}
