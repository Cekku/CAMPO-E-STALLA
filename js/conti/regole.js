// Regole predefinite di classificazione delle righe di fattura (parola chiave, parte del nome della controparte, categoria, tipo)
export const REGOLE_PREDEFINITE = [
  ['SPESE INCASSO', '', 'Spese accessorie e contributi', 'Acquisto'],
  ['SPESE DI INCASSO', '', 'Spese accessorie e contributi', 'Acquisto'],
  ['SPESE TRASPORTO', '', 'Spese accessorie e contributi', 'Acquisto'],
  ['SPESE DI TRASPORTO', '', 'Spese accessorie e contributi', 'Acquisto'],
  ['CONTRIBUTO', '', 'Spese accessorie e contributi', 'Acquisto'],
  ['BOLLO', '', 'Spese accessorie e contributi', 'Acquisto'],
  ['GUANT', '', 'Vestiario e DPI', 'Acquisto'],
  ['GREMBIUL', '', 'Vestiario e DPI', 'Acquisto'],
  ['STIVAL', '', 'Vestiario e DPI', 'Acquisto'],
  ['SCARP', '', 'Vestiario e DPI', 'Acquisto'],
  ['CALZAT', '', 'Vestiario e DPI', 'Acquisto'],
  ['DUNLOP', '', 'Vestiario e DPI', 'Acquisto'],
  ['SHORT', '', 'Vestiario e DPI', 'Acquisto'],
  ['GILET', '', 'Vestiario e DPI', 'Acquisto'],
  ['TUTA', '', 'Vestiario e DPI', 'Acquisto'],
  ['GIACC', '', 'Vestiario e DPI', 'Acquisto'],
  ['PANTALON', '', 'Vestiario e DPI', 'Acquisto'],
  ['MAGLI', '', 'Vestiario e DPI', 'Acquisto'],
  ['FELPA', '', 'Vestiario e DPI', 'Acquisto'],
  ['MASCHERIN', '', 'Vestiario e DPI', 'Acquisto'],
  ['AZOTO', '', 'Azoto e fecondazione', 'Acquisto'],
  ['PAILLET', '', 'Azoto e fecondazione', 'Acquisto'],
  ['SEME ANIMALE', '', 'Azoto e fecondazione', 'Acquisto'],
  ['FECONDAZ', '', 'Azoto e fecondazione', 'Acquisto'],
  // cani e gatti: parole intere tra virgolette ("CAT" da sola prendeva CATASTALE, CATRAME, CAT. 1, CATEGORIA…)
  ['GATT', '', 'Animali domestici', 'Acquisto'],
  ['"CANE"', '', 'Animali domestici', 'Acquisto'],
  ['"CANI"', '', 'Animali domestici', 'Acquisto'],
  ['CUCCIOL', '', 'Animali domestici', 'Acquisto'],
  ['CROCCHETT', '', 'Animali domestici', 'Acquisto'],
  ['PET FOOD', '', 'Animali domestici', 'Acquisto'],
  ['"DOG"', '', 'Animali domestici', 'Acquisto'],
  ['SEME BOV', '', 'Azoto e fecondazione', 'Acquisto'],
  ['FARMAC', '', 'Farmaci e prodotti veterinari', 'Acquisto'],
  ['VACCIN', '', 'Farmaci e prodotti veterinari', 'Acquisto'],
  ['ANTIBIOT', '', 'Farmaci e prodotti veterinari', 'Acquisto'],
  ['POMAT', '', 'Farmaci e prodotti veterinari', 'Acquisto'],
  ['PODAL', '', 'Farmaci e prodotti veterinari', 'Acquisto'],
  ['POMAPOD', '', 'Farmaci e prodotti veterinari', 'Acquisto'],
  ['ARNICA', '', 'Farmaci e prodotti veterinari', 'Acquisto'],
  ['VETERIN', '', 'Farmaci e prodotti veterinari', 'Acquisto'],
  ['IODIO', '', 'Farmaci e prodotti veterinari', 'Acquisto'],
  ['SIRING', '', 'Farmaci e prodotti veterinari', 'Acquisto'],
  ['DETERG', '', 'Igiene e mungitura', 'Acquisto'],
  ['DETERSIV', '', 'Igiene e mungitura', 'Acquisto'],
  ['DISINFETT', '', 'Igiene e mungitura', 'Acquisto'],
  ['SANIFIC', '', 'Igiene e mungitura', 'Acquisto'],
  ['LEVADA', '', 'Igiene e mungitura', 'Acquisto'],
  ['ENCORE', '', 'Igiene e mungitura', 'Acquisto'],
  ['DIP', '', 'Igiene e mungitura', 'Acquisto'],
  ['FILTRI LATTE', '', 'Igiene e mungitura', 'Acquisto'],
  ['GASOLIO', '', 'Carburanti e lubrificanti', 'Acquisto'],
  ['BENZINA', '', 'Carburanti e lubrificanti', 'Acquisto'],
  ['ADBLUE', '', 'Carburanti e lubrificanti', 'Acquisto'],
  ['AD BLUE', '', 'Carburanti e lubrificanti', 'Acquisto'],
  ['LUBRIF', '', 'Carburanti e lubrificanti', 'Acquisto'],
  ['OLIO MOTORE', '', 'Carburanti e lubrificanti', 'Acquisto'],
  ['OLIO IDRAUL', '', 'Carburanti e lubrificanti', 'Acquisto'],
  ['YEAST', '', 'Integratori e additivi', 'Acquisto'],
  ['LIEVIT', '', 'Integratori e additivi', 'Acquisto'],
  ['FERMENT', '', 'Integratori e additivi', 'Acquisto'],
  ['DRENCH', '', 'Integratori e additivi', 'Acquisto'],
  ['BOLO', '', 'Integratori e additivi', 'Acquisto'],
  ['CALCIUM', '', 'Integratori e additivi', 'Acquisto'],
  ['MYCODEX', '', 'Integratori e additivi', 'Acquisto'],
  ['MICOTOSS', '', 'Integratori e additivi', 'Acquisto'],
  ['TECNOFAT', '', 'Integratori e additivi', 'Acquisto'],
  ['PREMIO', '', 'Integratori e additivi', 'Acquisto'],
  ['DRY COW', '', 'Integratori e additivi', 'Acquisto'],
  ['NORMOTERM', '', 'Integratori e additivi', 'Acquisto'],
  ['ADISAL', '', 'Integratori e additivi', 'Acquisto'],
  ['INTEGRAT', '', 'Integratori e additivi', 'Acquisto'],
  ['VITAMIN', '', 'Integratori e additivi', 'Acquisto'],
  ['MINERAL', '', 'Integratori e additivi', 'Acquisto'],
  ['NUCLEO', '', 'Integratori e additivi', 'Acquisto'],
  ['TZ DRY', '', 'Integratori e additivi', 'Acquisto'],
  ['MANGIM', '', 'Mangimi e materie prime', 'Acquisto'],
  ['FARINA', '', 'Mangimi e materie prime', 'Acquisto'],
  ['SOIA', '', 'Mangimi e materie prime', 'Acquisto'],
  ['COLZA', '', 'Mangimi e materie prime', 'Acquisto'],
  ['MAIS', '', 'Mangimi e materie prime', 'Acquisto'],
  ['ORZO', '', 'Mangimi e materie prime', 'Acquisto'],
  ['CRUSCA', '', 'Mangimi e materie prime', 'Acquisto'],
  ['POLPE', '', 'Mangimi e materie prime', 'Acquisto'],
  ['FIENO', '', 'Mangimi e materie prime', 'Acquisto'],
  ['PAGLIA', '', 'Mangimi e materie prime', 'Acquisto'],
  ['ERBA MEDICA', '', 'Mangimi e materie prime', 'Acquisto'],
  ['SORGO', '', 'Mangimi e materie prime', 'Acquisto'],
  ['LIN', '', 'Mangimi e materie prime', 'Acquisto'],
  ['GIRASOL', '', 'Mangimi e materie prime', 'Acquisto'],
  ['MELASS', '', 'Mangimi e materie prime', 'Acquisto'],
  ['BICARBONATO', '', 'Mangimi e materie prime', 'Acquisto'],
  ['SEMENT', '', 'Sementi', 'Acquisto'],
  ['IBRID', '', 'Sementi', 'Acquisto'],
  ['CONCIM', '', 'Concimi', 'Acquisto'],
  ['UREA', '', 'Concimi', 'Acquisto'],
  ['NITRAT', '', 'Concimi', 'Acquisto'],
  ['FERTILIZ', '', 'Concimi', 'Acquisto'],
  ['AMMENDANT', '', 'Concimi', 'Acquisto'],
  ['DISERB', '', 'Fitofarmaci', 'Acquisto'],
  ['FUNGIC', '', 'Fitofarmaci', 'Acquisto'],
  ['INSETTIC', '', 'Fitofarmaci', 'Acquisto'],
  ['ERBICID', '', 'Fitofarmaci', 'Acquisto'],
  ['FITOFARM', '', 'Fitofarmaci', 'Acquisto'],
  ['RIPARAZ', '', 'Lavori e riparazioni', 'Acquisto'],
  ['MANUTENZ', '', 'Lavori e riparazioni', 'Acquisto'],
  ['MANODOPERA', '', 'Lavori e riparazioni', 'Acquisto'],
  ['LAVORI', '', 'Lavori e riparazioni', 'Acquisto'],
  ['RCK', '', 'Materiali edili e calcestruzzo', 'Acquisto'],
  ['CALCESTRUZZ', '', 'Materiali edili e calcestruzzo', 'Acquisto'],
  ['AUTOBETONIER', '', 'Materiali edili e calcestruzzo', 'Acquisto'],
  ['CEMENT', '', 'Materiali edili e calcestruzzo', 'Acquisto'],
  ['GHIAI', '', 'Materiali edili e calcestruzzo', 'Acquisto'],
  ['SABBI', '', 'Materiali edili e calcestruzzo', 'Acquisto'],
  ['', 'BETON', 'Materiali edili e calcestruzzo', 'Acquisto'],
  ['RICAMB', '', 'Ricambi e manutenzione', 'Acquisto'],
  ['FILTRO', '', 'Ricambi e manutenzione', 'Acquisto'],
  ['CUSCINETT', '', 'Ricambi e manutenzione', 'Acquisto'],
  ['CINGHI', '', 'Ricambi e manutenzione', 'Acquisto'],
  ['BULLON', '', 'Ricambi e manutenzione', 'Acquisto'],
  ['GUARNIZ', '', 'Ricambi e manutenzione', 'Acquisto'],
  ['PNEUMATIC', '', 'Ricambi e manutenzione', 'Acquisto'],
  ['BATTERI', '', 'Ricambi e manutenzione', 'Acquisto'],
  ['CAV.', '', 'Tubi e materiale idraulico', 'Acquisto'],
  ['TUBO', '', 'Tubi e materiale idraulico', 'Acquisto'],
  ['TUBI', '', 'Tubi e materiale idraulico', 'Acquisto'],
  ['RACCORD', '', 'Tubi e materiale idraulico', 'Acquisto'],
  ['VALVOL', '', 'Tubi e materiale idraulico', 'Acquisto'],
  ['COLLAR', '', 'Attrezzature ed elettronica', 'Acquisto'],
  ['MOOMONITOR', '', 'Attrezzature ed elettronica', 'Acquisto'],
  ['PEDOMETR', '', 'Attrezzature ed elettronica', 'Acquisto'],
  ['SENSOR', '', 'Attrezzature ed elettronica', 'Acquisto'],
  ['', 'TECNOZOO', 'Integratori e additivi', 'Acquisto'],
  // smaltimento degli animali morti e acquisto di bovine per la mandria: dopo tutte le altre, così
  // "MANGIME VACCHE", "INTEGRATORE BOVINI", "VACCINO" restano nelle loro categorie
  ['CARCASS', '', 'Smaltimento carcasse', 'Acquisto'],
  ['MAT. CAT. 1', '', 'Smaltimento carcasse', 'Acquisto'],
  ['BOVIN', '', 'Acquisto bestiame', 'Acquisto'],
  ['MANZ', '', 'Acquisto bestiame', 'Acquisto'],
  ['VACCA', '', 'Acquisto bestiame', 'Acquisto'],
  ['VACCHE', '', 'Acquisto bestiame', 'Acquisto'],
  ['GIOVENC', '', 'Acquisto bestiame', 'Acquisto'],
  ['VITELLA', '', 'Acquisto bestiame', 'Acquisto'],
  ['VITELLE', '', 'Acquisto bestiame', 'Acquisto'],
  ['TORELL', '', 'Acquisto bestiame', 'Acquisto'],
  ['RISTALLO', '', 'Acquisto bestiame', 'Acquisto'],
  ['PREMIO', '', 'Premi e trattenute latte', 'Vendita'],
  ['PREMI', '', 'Premi e trattenute latte', 'Vendita'],
  ['TRATTENUT', '', 'Premi e trattenute latte', 'Vendita'],
  ['PENALE', '', 'Premi e trattenute latte', 'Vendita'],
  ['PENALIT', '', 'Premi e trattenute latte', 'Vendita'],
  ['QUOTA', '', 'Premi e trattenute latte', 'Vendita'],
  ['ANALISI', '', 'Premi e trattenute latte', 'Vendita'],
  ['LATTE', '', 'Latte', 'Vendita'],
  ['VITELL', '', 'Vitelli', 'Vendita'],
  ['BOVIN', '', 'Bovini', 'Vendita'],
  ['VACC', '', 'Bovini', 'Vendita'],
  ['MANZ', '', 'Bovini', 'Vendita'],
  ['TORELL', '', 'Bovini', 'Vendita'],
  ['CEREAL', '', 'Cereali e foraggi', 'Vendita'],
  ['MAIS', '', 'Cereali e foraggi', 'Vendita'],
  ['ORZO', '', 'Cereali e foraggi', 'Vendita'],
  ['FRUMENT', '', 'Cereali e foraggi', 'Vendita'],
  ['GRANO', '', 'Cereali e foraggi', 'Vendita'],
  ['SOIA', '', 'Cereali e foraggi', 'Vendita'],
  ['FORAGG', '', 'Cereali e foraggi', 'Vendita'],
  ['FIENO', '', 'Cereali e foraggi', 'Vendita'],
  ['INSILAT', '', 'Cereali e foraggi', 'Vendita'],
  ['PAGLIA', '', 'Cereali e foraggi', 'Vendita'],
  ['ERBA', '', 'Cereali e foraggi', 'Vendita'],
  ['PRESTAZ', '', 'Servizi e contoterzi', 'Vendita'],
  ['LAVORAZ', '', 'Servizi e contoterzi', 'Vendita'],
  ['SERVIZ', '', 'Servizi e contoterzi', 'Vendita'],
  ['CONTOTERZ', '', 'Servizi e contoterzi', 'Vendita'],
  ['TRINCIAT', '', 'Servizi e contoterzi', 'Vendita'],
  ['ARATUR', '', 'Servizi e contoterzi', 'Vendita'],
  ['SEMINA', '', 'Servizi e contoterzi', 'Vendita'],
  ['RACCOLT', '', 'Servizi e contoterzi', 'Vendita'],
  ['NOLEGG', '', 'Servizi e contoterzi', 'Vendita'],
  ['ENERGIA', '', 'Energia', 'Vendita'],
  ['LETAME', '', 'Altri prodotti', 'Vendita'],
  ['LIQUAME', '', 'Altri prodotti', 'Vendita'],
  ['DIGESTAT', '', 'Altri prodotti', 'Vendita'],
];

export const DA_CLASSIFICARE = 'Da classificare';
export const RETTIFICA = '[Rettifica]';
export const CAT_RETTIFICA = 'Differenze non dettagliate';
export const CAT_LATTE = 'Latte';
export const CAT_PREMI = 'Premi e trattenute latte';

const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Parola chiave → espressione: si cerca all'inizio di una parola; tra virgolette ("CANE") solo come parola intera. */
const RE_KW = new Map();
function reParola(kw) {
  let re = RE_KW.get(kw); if (re) return re;
  const intera = /^"[^"]+"$/.test(kw); const k = intera ? kw.slice(1, -1).trim() : kw;
  re = new RegExp('(?<![A-Z0-9])' + escRe(k) + (intera ? '(?![A-Z0-9])' : '')); RE_KW.set(kw, re); return re;
}
/** Categoria di una riga: vince la prima regola che corrisponde (come nel foglio Fatture-Categorie). */
export function classifica(descrizione, controparte, regole, tipo = 'Acquisto') {
  const d = ' ' + String(descrizione || '').toUpperCase() + ' ';
  const fo = String(controparte || '').toUpperCase();
  for (const r of regole) {
    const [kw0, forn0, cat, tp] = r;
    if (tp && tp.trim().toLowerCase() !== String(tipo || '').toLowerCase()) continue;
    const kw = String(kw0 || '').toUpperCase().trim(), forn = String(forn0 || '').toUpperCase().trim();
    if (forn && !fo.includes(forn)) continue;
    if (kw && !reParola(kw).test(d)) continue;
    if (!kw && !forn) continue;
    return cat;
  }
  return DA_CLASSIFICARE;
}
const normDesc = s => String(s || '').toUpperCase().replace(/\s+/g, ' ').trim();
// parole che non dicono cosa è il prodotto: confezioni, unità di misura, parole di collegamento
const VUOTE = new Set(('DI DA DEL DELLA DELLO DEI DEGLI DELLE AL ALLA ALLO AI AGLI ALLE PER CON SU IN E ED IL LO LA LE GLI UN UNO UNA ' +
  'FUSTO FUSTI TANICA TANICHE SACCO SACCHI SACCHETTO SACCHETTI CONF CONFEZIONE CONFEZIONI SCATOLA SCATOLE CARTONE CARTONI FLACONE FLACONI BOTTIGLIA ' +
  'BIDONE BIDONI SECCHIO SECCHIELLO BUSTA BUSTE BIG BAG BAGS BANCALE PALLET ROTOLO ROTOLI PEZZI PEZZO PZ NR NUM N KG KGS GR G LT LTR L ML MT M CM MM ' +
  'CF CT TON QL QLI X ART COD RIF DDT ARTICOLO ARTICOLI PRODOTTO PRODOTTI MATERIALE MATERIALI VARIE VARI VARIO VOCE CODICE DESCRIZIONE RIGA ' +
  'FORNITURA FORNITURE ACQUISTO VENDITA FATTURA NOSTRO VOSTRO VS NS').split(' '));
/** Parole che contano di una descrizione: maiuscole, senza accenti, numeri, codici, misure e confezioni. */
export function parole(s) {
  return String(s || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^A-Z0-9]+/)
    .filter(w => w.length >= 3 && !/\d/.test(w) && !VUOTE.has(w));
}
/** Chiave per riconoscere le descrizioni quasi uguali ("OLIO 15W40 FUSTO 20L" e "OLIO 15W40 TANICA 5L" → "OLIO"). */
export const chiaveSimile = s => [...new Set(parole(s))].sort().join(' ');
/** Le righe da cui imparare: scelte a mano o dalle regole (non quelle decise in automatico, per non ripetere un errore a catena).
 *  Con `regole` (più tipo e controparte della fattura) una riga data da una regola conta solo se le regole di oggi le danno
 *  ancora la stessa categoria: così una regola corretta (es. "CAT" → animali domestici) non torna dalla memoria. */
export const daImparare = (r, regole = null, tipo = '', controparte = '') => !!r.categoria && r.categoria !== DA_CLASSIFICARE && (!!r.catManuale || (!r.catAuto && (!regole || classifica(r.descrizione, controparte, regole, tipo) === r.categoria)));

/** Memoria delle categorie già date: stessa descrizione o descrizione quasi uguale → stessa categoria;
 *  fornitore con quasi tutte le righe in una categoria. */
export function impara(fatture, regole = null) {
  const desc = new Map(), simili = new Map(), forn = new Map();
  const conta = (map, k, cat, peso) => { const v = map.get(k) || new Map(); v.set(cat, (v.get(cat) || 0) + peso); map.set(k, v); };
  for (const f of fatture) for (const r of f.righe || []) {
    if (!daImparare(r, regole, f.tipo, f.controparte)) continue;
    const peso = r.catManuale ? 3 : 1;
    conta(desc, f.tipo + '|' + normDesc(r.descrizione), r.categoria, peso);
    const ks = chiaveSimile(r.descrizione); if (ks) conta(simili, f.tipo + '|' + ks, r.categoria, peso);
    conta(forn, f.tipo + '|' + normDesc(f.controparte), r.categoria, 1);
  }
  const prima = (m, quota, minimo) => { const tot = [...m.values()].reduce((t, n) => t + n, 0); const [c, n] = [...m.entries()].sort((a, b) => b[1] - a[1])[0]; return tot >= minimo && n / tot >= quota ? c : null; };
  return {
    desc: new Map([...desc].map(([k, m]) => [k, prima(m, 0.6, 1)]).filter(x => x[1])),
    simili: new Map([...simili].map(([k, m]) => [k, prima(m, 0.75, 1)]).filter(x => x[1])),
    forn: new Map([...forn].map(([k, m]) => [k, prima(m, 0.8, 3)]).filter(x => x[1])),
  };
}
/** Categoria con le regole e, se nessuna regola corrisponde, con la memoria.
 *  Ritorna { categoria, auto } (auto: 'descrizione' | 'simile' | 'fornitore' | ''). */
export function classificaConMemoria(descrizione, controparte, regole, tipo, mem) {
  const c = classifica(descrizione, controparte, regole, tipo);
  if (c !== DA_CLASSIFICARE || !mem) return { categoria: c, auto: '' };
  const d = mem.desc.get(tipo + '|' + normDesc(descrizione)); if (d) return { categoria: d, auto: 'descrizione' };
  const ks = chiaveSimile(descrizione); const s = ks && mem.simili && mem.simili.get(tipo + '|' + ks); if (s) return { categoria: s, auto: 'simile' };
  const f = mem.forn.get(tipo + '|' + normDesc(controparte)); if (f) return { categoria: f, auto: 'fornitore' };
  return { categoria: DA_CLASSIFICARE, auto: '' };
}

/** Esempi già classificati di un tipo (fattura di acquisto o vendita), uno per coppia controparte + descrizione. */
export function ricordi(fatture, tipo, regole = null) {
  const out = new Map();
  for (const f of fatture) if (f.tipo === tipo) for (const r of f.righe || []) {
    if (!daImparare(r, regole, f.tipo, f.controparte)) continue;
    const k = f.controparte + '\u0001' + r.descrizione; const x = out.get(k);
    if (!x || (r.catManuale && !x.manuale)) out.set(k, { k, c: f.controparte || '', d: r.descrizione || '', cat: r.categoria, manuale: !!r.catManuale, w: parole(r.descrizione) });
  }
  return [...out.values()];
}
/** Indice per parola e per controparte degli esempi, per trovare in fretta quelli utili a un blocco di righe. */
export function indiceRicordi(lista) {
  const perParola = new Map(), perForn = new Map();
  for (const e of lista) {
    for (const w of new Set(e.w)) { if (!perParola.has(w)) perParola.set(w, []); perParola.get(w).push(e); }
    const kf = normDesc(e.c); if (!perForn.has(kf)) perForn.set(kf, []); perForn.get(kf).push(e);
  }
  return { perParola, perForn };
}
/** Gli esempi più utili per un blocco di righe [{ c, d }]: stessa controparte e parole in comune, prima quelli scelti a mano.
 *  `escludi` = chiavi da non usare (per la prova di precisione). */
export function esempiPer(blocco, idx, max = 30, escludi = null) {
  const punti = new Map();
  const add = (e, p) => { if (escludi && escludi.has(e.k)) return; punti.set(e, (punti.get(e) || 0) + p); };
  for (const v of blocco) {
    for (const e of (idx.perForn.get(normDesc(v.c)) || []).slice(0, 40)) add(e, 2);
    const ws = new Set(parole(v.d));
    for (const w of ws) { const l = idx.perParola.get(w) || []; for (const e of l.slice(0, 60)) add(e, (normDesc(e.c) === normDesc(v.c) ? 2 : 1) * (l.length > 200 ? 0.3 : 1)); }
  }
  const scelti = [...punti.entries()].map(([e, p]) => [e, p + (e.manuale ? 1 : 0)]).sort((a, b) => b[1] - a[1]);
  // varietà: al massimo 8 esempi con la stessa categoria e la stessa controparte
  const out = [], quanti = new Map();
  for (const [e] of scelti) { const q = e.c + '|' + e.cat; if ((quanti.get(q) || 0) >= 8) continue; quanti.set(q, (quanti.get(q) || 0) + 1); out.push(e); if (out.length >= max) break; }
  return out;
}
/** Elenco delle categorie usate dalle regole, per tipo. */
export function categorie(regole, tipo) {
  const s = new Set(regole.filter(r => !r[3] || r[3] === tipo).map(r => r[2]));
  return [...s].sort((a, b) => a.localeCompare(b, 'it'));
}
