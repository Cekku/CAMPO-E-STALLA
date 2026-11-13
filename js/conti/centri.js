// Centri di costo: ogni riga delle fatture (e i costi che non passano dalle fatture: personale, ammortamenti,
// interessi, spese della banca) va a Stalla, Campagna, Spese generali o Banca e finanza.
//   1. scelta a mano sulla riga (riga.cdc) → 2. scelta per categoria (cfg.cdcCat) → 3. predefinita dal nome della categoria
//   "Mezzi e spese comuni" (gasolio, ricambi, riparazioni, energia…) si divide tra stalla e campagna; prima però le parole
//   della riga possono dire a chi serve (carro miscelatore, mungitura → stalla; seminatrice, aratro → campagna).
//   Spese accessorie e differenze non dettagliate seguono le altre righe della stessa fattura.
import { S } from '../state.js';
import { N, yearOf } from '../util.js';
import { righe, cfg, bilancio, calc, datiTecnici, DA_CLASSIFICARE, CAT_RETTIFICA } from './dati.js';

export const CENTRI = {
  stalla: { nome: 'Stalla', icona: 'cow', colore: '#24507A' },
  campagna: { nome: 'Campagna', icona: 'sprout', colore: '#5B7F2E' },
  generali: { nome: 'Spese generali', icona: 'building-2', colore: '#8A6A3B' },
  finanza: { nome: 'Banca e finanza', icona: 'landmark', colore: '#7A3E6B' },
};
export const FINALI = ['stalla', 'campagna', 'generali', 'finanza'];
// scelte possibili per una categoria o una riga
export const SCELTE = [
  ['stalla', 'Stalla'], ['campagna', 'Campagna'], ['comuni', 'Comune (si divide)'], ['generali', 'Spese generali'],
  ['finanza', 'Banca e finanza'], ['segue', 'Come il resto della fattura'], ['inv', 'Investimento (fuori)'], ['no', 'Non conta'],
];
export const NOME_SCELTA = Object.fromEntries(SCELTE);

/* ---------------- centro predefinito di una categoria ---------------- */
const R_ACQ = [
  ['segue', /spese accessorie|^differenze non dettagliate/i],
  ['finanza', /banc|commission|interess|finanziam|mutu|fideiuss|oneri finanz/i],
  ['inv', /materiali edili|calcestruzz|investiment|cespit|costruzion|acquisto bestiame|macchine nuove|acquisto (di )?(mezzi|macchin|trattor|attrezz)/i],
  ['stalla', /mangim|foragg|integrat|additiv|(?<!fito)farmac|veterin|medicin|fecondaz|azoto|seme anim|igiene|mungit|latte|bestiame|acquisto (di )?(capi|animali|bovin|manz|vacc)|controll[io] funzional|selezione|genetic|lettier|segatur|paglia|attrezzature ed elettronica|collar|podolog|pareggio|smaltimento (carcass|animal)|carcass/i],
  ['campagna', /sement|piantin|concim|ammendant|fertiliz|fitofarm|diserb|antiparassit|contoterz|lavorazion|terzist|affitt.*terren|fitti? (di )?terren|affitti passivi|irrigaz|consorzio di bonifica|bonifica|teli|film|spago|rete per|essicca|stoccaggio cereal/i],
  ['generali', /commercialist|consulen|paghe|elaborazione|telefon|internet|postal|cancelleri|assicuraz|tass|impost|\bimu\b|bollo|associativ|associazion|sindac|abbonament|software|vestiario|dpi|animali domestici|pulizia uffic|spese generali|formazione|corsi|certificaz|pubblicit|rappresentanz/i],
  ['comuni', /rifiut|carburant|gasolio|lubrific|ricamb|manutenz|riparaz|lavori e riparaz|tubi|idraulic|energia|elettric|acqua|gas\b|metano|noleggi|leasing|pneumat|attrezz|ferrament|trasport|officina|utensil|materiale elettric/i],
];
const R_VEN = [
  ['finanza', /interess|banc|proventi finanz/i],
  ['no', /plusvalen|cession|vendita di (mezzi|macchin|attrezz)|rimbors|indennizz|risarc|sopravvenien/i],
  ['stalla', /latte|premi|trattenut|vitell|bovin|vacc|manz|torell|animali|letame|liquame|digestat|stallatico/i],
  ['campagna', /cereal|foragg|mais|orzo|frument|grano|soia|fieno|insilat|paglia|erba|servizi|contoterz|prestaz|lavoraz|noleggi|contribut|\bpac\b|psr|sement/i],
  ['generali', /energia|fotovolt|biogas|altri prodotti|affitt/i],
];
/** Centro predefinito di una categoria (dal nome). */
export function centroPredefinito(tipo, categoria) {
  const c = String(categoria || '');
  if (tipo !== 'Vendita' && (c === CAT_RETTIFICA)) return 'segue';
  if (c === DA_CLASSIFICARE) return 'comuni';
  for (const [v, re] of tipo === 'Vendita' ? R_VEN : R_ACQ) if (re.test(c)) return v;
  return tipo === 'Vendita' ? 'generali' : 'comuni';
}
/** Centro di una categoria: scelta a mano (cfg.cdcCat) o predefinita. */
export const centroCategoria = (tipo, categoria) => ((cfg().cdcCat || {})[tipo + '|' + categoria]) || centroPredefinito(tipo, categoria);

/* ---------------- parole della riga che dicono a chi serve una spesa comune ---------------- */
const P_STALLA = /MUNG|LATTE|CARRO|UNIFEED|MISCELAT|DESILAT|ROBOT|LETTIER|CUCCETT|ABBEVER|VACC|VITELL|STALLA|RASCHIA|SEPARATOR|TANK|REFRIGER|POMPA (DEL )?VUOTO|GUAIN|TETTAR|PULSATOR|COLLETTOR|SPAZZOL|VENTILATOR|RAFFRESC|NEBULIZZ|AUTOCATTUR|RASTRELLIER|POMPA LIQUAM|LIQUAM|VASCA/;
const P_CAMPAGNA = /SEMINAT|ARATR|ERPIC|TRINCI|FALCIA|ROTOPRESS|PRESSA|ROTOBALL|SPANDICONC|SPANDILET|IRRORAT|BOTTE (DA )?DISERB|COLTIVAT|SARCHIA|RANGHIN|VOLTAFIEN|DISCHI|VOMER|PUNTAL|IRRIGAZ|ROTOLONE|DENTI|FRESA|RIPUNTAT|ESTIRPAT|MIETITREB|TESTATA|CARICAFORAGG|FALCIATRINC/;
export function suggerimento(descrizione) {
  const d = String(descrizione || '').toUpperCase();
  const s = P_STALLA.test(d), c = P_CAMPAGNA.test(d);
  return s && !c ? 'stalla' : c && !s ? 'campagna' : null;
}

/* ---------------- movimenti della banca (spese, interessi, rate) ---------------- */
export const VOCI_BANCA = {
  commissioni: 'Spese e commissioni', bollo: 'Imposta di bollo', interessi: 'Interessi passivi', attivi: 'Interessi attivi',
  rata: 'Rata di mutuo o finanziamento', leasing: 'Canone di leasing',
};
/** Voce proposta per un movimento della banca, dalla descrizione. */
export function voceBanca(m) {
  const d = String(m.descrizione || '').toUpperCase();
  if (/LEASING/.test(d)) return 'leasing';
  if (/RATA|MUTUO|FINANZIAM|AMMORTAMENTO PREST|RIMBORSO PREST/.test(d)) return 'rata';
  if (/INTERESS|COMPETENZ/.test(d)) return m.importo > 0 || m.entrata ? 'attivi' : 'interessi';
  if (/BOLLO/.test(d)) return 'bollo';
  return 'commissioni';
}
/** Il movimento è una spesa della banca o una rata (da proporre come "Banca e finanza")? */
export const pareBanca = m => m.tipoOp === 'spese bancarie' || /\bRATA\b|MUTUO|FINANZIAMENTO|LEASING|COMPETENZE|INTERESSI/i.test(m.descrizione || '');
export const movimentiBanca = () => S.econfig.filter(x => x.tipo === 'banca');
export const datiBanca = r => ({ tipo: 'banca', data: r.data, importo: Math.abs(N(r.importo)), entrata: !!r.entrata, voce: r.voce || voceBanca(r), descrizione: r.descrizione || '', fonte: r.fonte || '', ...(r.imp ? { imp: r.imp } : {}) });

/* ---------------- calcolo dell'anno ---------------- */
const r2 = v => Math.round(v * 100) / 100;
const vuotoC = () => ({ costi: 0, ricavi: 0, perVoce: new Map() });
const haVal = v => v !== undefined && v !== null && v !== '';

/** Tutti i numeri dei centri di costo di un anno. */
export function centri(y) {
  const man = (bilancio(y) || {}).cdc || {};
  const voci = [];   // { centro (anche comuni/pers), tipo: 'costo'|'ricavo', voce, importo, fonte }
  const perCat = new Map(); // tipo|categoria → { tipo, categoria, centro, importo, n, manuali, suggerite }
  const daRivedere = [];    // righe comuni o da classificare (per la scelta riga per riga)
  const fuori = { inv: 0, no: 0, noVen: 0 };
  // righe delle fatture, fattura per fattura (le righe "segue" vanno come le altre)
  const perFatt = new Map();
  for (const r of righe()) { if (r.anno !== y) continue; const a = perFatt.get(r.fid) || []; a.push(r); perFatt.set(r.fid, a); }
  for (const rs of perFatt.values()) {
    const tipo = rs[0].tipo; const segno = tipo === 'Vendita' ? 'ricavo' : 'costo';
    const scelte = rs.map(r => {
      const cat = centroCategoria(tipo, r.categoria);
      let c = r.cdc || cat, sugg = null;
      if (!r.cdc && (c === 'comuni') && tipo !== 'Vendita') { sugg = suggerimento(r.descrizione); if (sugg) c = sugg; }
      const k = tipo + '|' + r.categoria; const o = perCat.get(k) || { tipo, categoria: r.categoria, centro: cat, importo: 0, n: 0, manuali: 0, suggerite: 0 };
      o.importo += N(r.importo); o.n++; if (r.cdc) o.manuali++; if (sugg) o.suggerite++; perCat.set(k, o);
      if (tipo !== 'Vendita' && !r.rett && (cat === 'comuni' || r.categoria === DA_CLASSIFICARE || r.cdc)) daRivedere.push(Object.assign({ centro: c, sugg, catCentro: cat }, r));
      return { r, c };
    });
    // quote delle righe "segue": come le altre righe della fattura, in proporzione agli importi
    const base = new Map(); for (const { r, c } of scelte) if (c !== 'segue') base.set(c, (base.get(c) || 0) + Math.abs(N(r.importo)));
    const totBase = [...base.values()].reduce((t, v) => t + v, 0);
    for (const { r, c } of scelte) {
      const v = N(r.importo); if (!v) continue;
      const parti = c !== 'segue' ? [[c, 1]] : totBase > 0 ? [...base].map(([cc, x]) => [cc, x / totBase]) : [[tipo === 'Vendita' ? 'generali' : r.rett ? 'comuni' : 'generali', 1]];
      for (const [cc, q] of parti) {
        if (cc === 'inv') { fuori.inv += v * q; continue; }
        if (cc === 'no') { if (tipo === 'Vendita') fuori.noVen += v * q; else fuori.no += v * q; continue; }
        voci.push({ centro: cc, tipo: segno, voce: r.categoria, importo: v * q, fonte: 'fatture' });
      }
    }
  }
  // costi che non passano dalle fatture: dal conto economico (e dalle paghe)
  const C = calc(y); const ce = C.ce || {}; const conCe = !!(C.has && C.has.ce);
  const aggiungi = (centro, tipo, voce, importo, fonte) => { if (Math.abs(N(importo)) >= 0.005) voci.push({ centro, tipo, voce, importo: N(importo), fonte }); };
  const pers = conCe || C.paghe ? N(ce[56]) : 0;
  aggiungi('pers', 'costo', 'Personale dipendente', pers, C.paghe ? 'paghe' : 'conto economico');
  const ammReg = !!(C.amm && C.amm.ce); const fAmm = ammReg ? 'registro dei beni' : 'conto economico';
  if (conCe || ammReg) {
    aggiungi('comuni', 'costo', 'Ammortamento fabbricati e impianti', ce[64], fAmm);
    aggiungi('comuni', 'costo', 'Ammortamento macchine e attrezzature', ce[65], fAmm);
    aggiungi('stalla', 'costo', 'Ammortamento del bestiame', ce[66], fAmm);
    aggiungi('generali', 'costo', 'Altri ammortamenti', N(ce[63]) + N(ce[67]) + N(ce[68]), fAmm);
  }
  if (conCe) {
    aggiungi('generali', 'costo', 'IMU, tasse e imposte indirette', ce[73], 'conto economico');
    aggiungi('campagna', 'ricavo', 'Contributi PAC e PSR', N(ce[20]) + N(ce[21]), 'conto economico');
  }
  const affSenza = N(((bilancio(y) || {}).rls || {}).affitti);
  aggiungi('campagna', 'costo', 'Affitti di terreni senza fattura', affSenza, 'scritti a mano');
  // banca e finanza: il conto economico, se c'è, è completo; altrimenti i movimenti dell'estratto conto
  const mov = movimentiBanca().filter(m => yearOf(m.data) === y);
  const sm = v => r2(mov.filter(m => m.voce === v).reduce((t, m) => t + N(m.importo), 0));
  const B = { commissioni: sm('commissioni'), bollo: sm('bollo'), interessi: sm('interessi'), attivi: sm('attivi'), rata: sm('rata'), leasing: sm('leasing'), n: mov.length };
  const ceComm = conCe ? N(ce[48]) : 0, ceInt = conCe ? N(ce[86]) : 0, ceProv = conCe ? N(ce[82]) + N(ce[83]) : 0;
  B.fonteComm = ceComm ? 'conto economico' : B.commissioni + B.bollo ? 'estratto conto' : '';
  B.fonteInt = ceInt ? 'conto economico' : B.interessi ? 'estratto conto' : '';
  if (ceComm) aggiungi('finanza', 'costo', 'Spese e commissioni bancarie', ceComm, 'conto economico');
  else { aggiungi('finanza', 'costo', 'Spese e commissioni bancarie', B.commissioni, 'estratto conto'); aggiungi('finanza', 'costo', 'Imposta di bollo', B.bollo, 'estratto conto'); }
  aggiungi('finanza', 'costo', 'Interessi passivi', ceInt || B.interessi, ceInt ? 'conto economico' : 'estratto conto');
  aggiungi('finanza', 'ricavo', 'Interessi attivi e proventi finanziari', ceProv || B.attivi, ceProv ? 'conto economico' : 'estratto conto');
  aggiungi('comuni', 'costo', 'Canoni di leasing (dalla banca)', B.leasing, 'estratto conto');
  // foraggi e cereali aziendali passati dalla campagna alla stalla (facoltativo)
  const trasf = N(man.trasf);
  if (trasf) { aggiungi('campagna', 'ricavo', 'Foraggi e cereali dati alla stalla', trasf, 'scritto a mano'); aggiungi('stalla', 'costo', 'Foraggi e cereali aziendali', trasf, 'scritto a mano'); }

  // quote di stalla: in proporzione ai costi diretti, se non sono scritte a mano
  const dir = c => voci.filter(v => v.centro === c && v.tipo === 'costo' && v.voce !== 'Foraggi e cereali aziendali').reduce((t, v) => t + v.importo, 0);
  const dS = dir('stalla'), dC = dir('campagna');
  const qAuto = dS + dC > 0 ? dS / (dS + dC) : 0.5;
  const q = { comuni: haVal(man.qComuni) ? N(man.qComuni) : qAuto, pers: haVal(man.qPers) ? N(man.qPers) : qAuto, auto: qAuto, comuniMan: haVal(man.qComuni), persMan: haVal(man.qPers) };
  // risultato per centro
  const R = Object.fromEntries(FINALI.map(c => [c, vuotoC()]));
  const metti = (c, tipo, voce, v, nota) => { const o = R[c]; if (tipo === 'costo') o.costi += v; else o.ricavi += v; const k = tipo + '|' + voce; const x = o.perVoce.get(k) || { tipo, voce, importo: 0, nota }; x.importo += v; o.perVoce.set(k, x); };
  for (const v of voci) {
    if (v.centro === 'comuni' || v.centro === 'pers') {
      const qq = v.centro === 'pers' ? q.pers : q.comuni; const nota = 'parte di una spesa comune';
      metti('stalla', v.tipo, v.voce, v.importo * qq, nota); metti('campagna', v.tipo, v.voce, v.importo * (1 - qq), nota);
    } else if (R[v.centro]) metti(v.centro, v.tipo, v.voce, v.importo, '');
  }
  for (const c of FINALI) { const o = R[c]; o.costi = r2(o.costi); o.ricavi = r2(o.ricavi); o.margine = r2(o.ricavi - o.costi); o.voci = [...o.perVoce.values()].map(x => Object.assign(x, { importo: r2(x.importo) })).filter(x => x.importo).sort((a, b) => b.importo - a.importo); delete o.perVoce; }
  const comuniTot = r2(voci.filter(v => v.centro === 'comuni' && v.tipo === 'costo').reduce((t, v) => t + v.importo, 0));
  const tot = { costi: r2(FINALI.reduce((t, c) => t + R[c].costi, 0) - trasf), ricavi: r2(FINALI.reduce((t, c) => t + R[c].ricavi, 0) - trasf) }; tot.margine = r2(tot.ricavi - tot.costi);
  // dati tecnici per i costi unitari
  const d = datiTecnici(y).val; const litri = d.latte_prod || d.latte_ven || null;
  const unita = {
    litri, vacche: d.vacche || null, sau: d.sau || null,
    stallaL: litri ? R.stalla.costi / litri : null, stallaPienoL: litri ? (R.stalla.costi + (R.generali.costi + R.finanza.costi - R.finanza.ricavi) * (R.stalla.costi / Math.max(1, R.stalla.costi + R.campagna.costi))) / litri : null,
    stallaV: d.vacche ? R.stalla.costi / d.vacche : null, campagnaHa: d.sau ? R.campagna.costi / d.sau : null,
    margineL: litri ? R.stalla.margine / litri : null,
  };
  const cats = [...perCat.values()].map(o => Object.assign(o, { importo: r2(o.importo), scelto: !!((cfg().cdcCat || {})[o.tipo + '|' + o.categoria]) })).sort((a, b) => a.tipo.localeCompare(b.tipo) || b.importo - a.importo);
  return {
    anno: y, R, tot, q, cats, daRivedere: daRivedere.sort((a, b) => N(b.importo) - N(a.importo)), comuniTot, pers, trasf, banca: B, movimenti: mov, conCe, paghe: !!C.paghe,
    fuori: { inv: r2(fuori.inv), no: r2(fuori.no), noVen: r2(fuori.noVen) }, unita, man,
    daClass: r2(cats.filter(o => o.categoria === DA_CLASSIFICARE).reduce((t, o) => t + o.importo, 0)),
    vuoto: !perCat.size && !voci.length,
  };
}
