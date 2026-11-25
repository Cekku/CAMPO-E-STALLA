// Prove del riconoscimento delle righe di fattura per il magazzino (js/magriconosci.js), con dati INVENTATI.
// Uso: npm test (tutte le prove), oppure dalla cartella del progetto:  node --import ./prove/avvio.mjs strumenti/prove-magazzino/prove.mjs
// Parte 1: casi singoli (unità, confezioni, sconti, note di credito, copie, trappole). Parte 2: un anno simulato di fatture
// di 6 fornitori finti, con le conferme di "Marco" ai dubbi: misura quante righe entrano da sole e che nessuna sia sbagliata.
globalThis.window = globalThis.window || {}; globalThis.localStorage = { _d: {}, getItem(k) { return this._d[k] ?? null; }, setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; } };
const R = await import(new URL('../../js/magriconosci.js', import.meta.url).href);

let ok = 0, ko = 0;
const t = (nome, cond, info = '') => { if (cond) ok++; else { ko++; console.log('  NO  ', nome, typeof info === 'string' ? info : JSON.stringify(info)); } };
const uguale = (a, b) => Math.abs(a - b) < 0.001;

/* ---------------- parte 1: casi singoli ---------------- */
console.log('Parte 1: casi singoli');
// confezioni
const cf = d => R.confezione(d);
t('sacco 25 kg', cf('UREA 46% SACCO 25 KG').v === 25 && cf('UREA 46% SACCO 25 KG').unica);
t('conf 4x5 lt = 20 l', cf('IODIO PRE-DIPPING CONF 4X5 LT').v === 20 && cf('IODIO PRE-DIPPING CONF 4X5 LT').fam === 'vol');
t('kg 10 (unità prima)', cf('MICROTHIOL DISPERSS KG 10').v === 10);
t('lt 20 e 2.0 lt: due misure, non sicura', cf('ROUNDUP POWER 2.0 LT 20').unica === false);
t('500 g = 0,5 kg', cf('SEME ERBA MEDICA BUSTA 500 G').v === 0.5);
t('46% non è una confezione', cf('UREA 46%') === null);
t('15W40 non è una confezione', cf('OLIO 15W40') === null);
t('lotto e scadenza tolti', R.descrChiave('UREA 46% LOTTO 23A45 SCAD. 12/2027') === 'UREA 46%');
t('rif. DDT tolto', R.descrChiave('GASOLIO AGRICOLO RIF. DDT 123 DEL 02/03/2026') === 'GASOLIO AGRICOLO');
t('numero di registrazione', R.nRegDa('DECIS EVO LT 1 REG. N. 015432') === '15432' && R.nRegDa('N.REG. 12345 ABC') === '12345' && R.nRegDa('REG.MIN. 9876') === '9876' && R.nRegDa('MAIS 12345') === '');
t('parole: codici con cifre restano, pesi no', R.paroleDa('MAIS P1234 SACCO 50000 SEMI') === 'MAIS P1234 SEMI' && R.paroleDa('UREA 46% SACCO 25KG') === 'UREA 46%');
// sconti
t('sconto -10%', uguale(R.scontoPerc('-10%'), 0.1));
t('sconto a cascata 10+5%', uguale(R.scontoPerc('10+5%'), 1 - 0.9 * 0.95));
t('maggiorazione +5%', uguale(R.scontoPerc('+5%'), -0.05));
t('sconto senza % ignorato', R.scontoPerc('-2,00') === 0);
t('importo non ancora scontato → scontato', R.importoNetto({ prezzo: 20, quantita: 40, sconto: '-10%', importo: 800 }) === 720);
t('importo già netto (XML) resta', R.importoNetto({ prezzo: 20, quantita: 40, sconto: '-10%', importo: 720 }) === 720);
t('senza importo: prezzo × quantità', R.importoNetto({ prezzo: 2, quantita: 5, importo: null }) === 10);
// quantità
const P = (o) => Object.assign({ id: 'p' + Math.random().toString(36).slice(2), nome: 'X', categoria: 'Concime', unita: 'kg' }, o);
const q = (r, p) => R.qta(Object.assign({ quantita: 1, um: '', descrizione: '' }, r), p);
t('q → kg sicura', q({ quantita: 10, um: 'Q.LI' }, P()).q === 1000 && q({ quantita: 10, um: 'Q.LI' }, P()).certa);
t('sacchi × 25 kg sicura', q({ quantita: 40, um: 'SC', descrizione: 'UREA SACCO 25 KG' }, P()).q === 1000 && q({ quantita: 40, um: 'SC', descrizione: 'UREA SACCO 25 KG' }, P()).certa);
t('senza unità: non sicura', q({ quantita: 40, um: '', descrizione: 'UREA SACCO 25 KG' }, P()).certa === false);
t('pezzi in kg senza confezione: non si sa', q({ quantita: 40, um: 'NR', descrizione: 'UREA' }, P()).q === null);
t('confezione in pezzi: proposta non sicura', q({ quantita: 3, um: 'CF', descrizione: 'SYNULOX' }, P({ unita: 'pz' })).certa === false);
t('litri in litri', q({ quantita: 500, um: 'LT' }, P({ unita: 'l' })).certa);
t('fattore imparato', q({ quantita: 3, um: 'CF' }, P({ unita: 'pz', convFatt: { 'conf>pz': 24 } })).q === 72);
t('fattore imparato ma altra confezione: non sicura', q({ quantita: 10, um: 'SC', descrizione: 'UREA SACCO 50 KG' }, P({ convFatt: { 'sacco>kg': 25 } })).certa === false);
t('kg in pezzi: non si sa', q({ quantita: 10, um: 'KG' }, P({ unita: 'pz' })).q === null);

// classificazione di casi costruiti
const FA = '00000000011', FB = '00000000022';
const KA = R.fornK({ piva: FA }), KB = R.fornK({ piva: FB });   // impronte del fornitore usate nelle chiavi del prodotto
let nf = 0;
const fatt = (forn, data, righe, o = {}) => Object.assign({ id: 'f' + (++nf), tipo: 'Acquisto', piva: forn, controparte: 'Fornitore ' + forn.slice(-2), numero: String(nf), data, tipoDoc: 'TD01', fonte: 'xml', segnoOk: true, righe }, o);
const righeDi = fs => fs.flatMap(f => f.righe.map((r, i) => Object.assign({}, r, { fid: f.id, i, data: f.data, tipo: f.tipo, controparte: f.controparte, piva: f.piva, numero: f.numero, tipoDoc: f.tipoDoc })));
// storia: un carico a mano di gennaio con il prezzo, per i prodotti di prova (serve il prezzo di riferimento)
const STORIA = [['urea', 0.8], ['ureaz', 0.8], ['u2', 0.8], ['u3', 0.8], ['decis', 30]].map(([p, pr]) => ({ id: 'h-' + p, tipo: 'Carico', prodottoId: p, data: '2026-01-02', quantita: 1, prezzo: pr }));
const cl = (fs, prodotti, movimenti = [], fatti = {}, fito = null) => R.classifica({ righe: righeDi(fs), fatture: fs, prodotti, movimenti: [...STORIA, ...movimenti], fatti, fito });
const urea = P({ id: 'urea', nome: 'Urea 46%', paroleFatt: 'UREA 46%' });
const ureaZ = P({ id: 'ureaz', nome: 'Urea zootecnica', categoria: 'Mangime', paroleFatt: 'UREA ZOOTECNICA' });
const rUrea = (o = {}) => Object.assign({ descrizione: 'UREA 46% SACCO 25 KG', categoria: 'Concimi', quantita: 40, um: 'SC', prezzo: 20, importo: 800, codice: 'UR46' }, o);
{
  const f1 = fatt(FA, '2026-03-01', [rUrea()]);
  const E = cl([f1], [urea, ureaZ]);
  t('urea con parole e sacchi: pronta 1000 kg', E.pronte.length === 1 && E.pronte[0].prodotto === urea && E.pronte[0].q === 1000, E.daFare.map(x => x.motivo));
  const f2 = fatt(FA, '2026-03-01', [rUrea({ descrizione: 'UREA ZOOTECNICA SACCO 25 KG', categoria: 'Mangimi e materie prime', codice: '' })]);
  const E2 = cl([f2], [urea, ureaZ]);
  t('urea zootecnica fra i mangimi: non diventa concime', E2.pronte.length === 1 && E2.pronte[0].prodotto === ureaZ);
  const f3 = fatt(FA, '2026-03-01', [rUrea({ categoria: 'Da classificare' })]);
  const E3 = cl([f3], [urea]);
  t('riga da classificare con parole: dubbio, non da sola', E3.pronte.length === 0 && E3.daFare.length === 1 && E3.daFare[0].proposto === urea);
  const f4 = fatt(FA, '2026-03-01', [rUrea({ um: 'KG', quantita: 40, importo: 800 })]);
  const E4 = cl([f4], [urea], [{ id: 'm0', tipo: 'Carico', prodottoId: 'urea', data: '2026-01-10', quantita: 1000, prezzo: 0.8 }]);
  t('unità sbagliata in fattura (sacchi scritti kg): il prezzo lo scopre', E4.pronte.length === 0 && /prezzo molto diverso/.test(E4.daFare[0].motivo), E4.daFare.map(x => x.motivo));
  const E5 = cl([f1], [urea], [{ id: 'm1', tipo: 'Carico', prodottoId: 'urea', data: '2026-03-01', quantita: 1000 }]);
  t('carico uguale già scritto a mano: dubbio', E5.pronte.length === 0 && /carico uguale/.test(E5.daFare[0].motivo));
  t('prima volta con la confezione e senza prezzo di riferimento: dubbio', R.classifica({ righe: righeDi([f1]), fatture: [f1], prodotti: [urea] }).pronte.length === 0);
  // revisione del 21/11: parole generiche, codici contenitore, numero messo dall'app, "1 LT X 20", nota scritta positiva, servizi con merce
  const mais = P({ id: 'mais', nome: 'Mais P1234', categoria: 'Seme', unita: 'pz', paroleFatt: 'MAIS' });
  const Em = cl([fatt(FA, '2026-04-01', [{ descrizione: 'MAIS P9999 SACCO 50000 SEMI', categoria: 'Sementi', quantita: 10, um: 'NR', importo: 1700 }])], [mais]);
  t('parole vecchie "MAIS": non certe', Em.pronte.length === 0 && /generiche/.test(Em.daFare[0].motivo));
  t('codice "VARIE" e descrizione "RICAMBI" non si imparano', R.codChiave({ piva: FA, codice: 'VARIE' }) === '' && R.descrK({ piva: FA, descrizione: 'RICAMBI VARI' }) === '' && R.descrK({ piva: FA, descrizione: 'GASOLIO AGRICOLO' }) !== '');
  const cg = P({ id: 'cg', nome: 'Concime granulare', paroleFatt: 'CONCIME GRANULARE' });
  const Ecg = cl([fatt(FB, '2026-04-01', [{ descrizione: 'CONCIME GRANULARE NPK 8-24-24', categoria: 'Concimi', quantita: 1000, um: 'KG', importo: 600 }])], [cg]);
  t('parole "CONCIME GRANULARE" da un altro fornitore: dubbio', Ecg.pronte.length === 0);
  const decA = P({ id: 'decis', nome: 'Decis Evo', categoria: 'Fitofarmaco', unita: 'l', nReg: '15432', nRegAuto: '15432' });
  const Ed = cl([fatt(FB, '2026-05-01', [{ descrizione: 'DECIS EVO 1 LT REG. N. 15432', categoria: 'Fitofarmaci', quantita: 6, um: 'PZ', importo: 180 }])], [decA]);
  t('numero messo dall\'app dal nome: non certo', Ed.pronte.length === 0);
  t('"1 LT X 20": confezione non sicura', R.confezione('DECIS EVO 1 LT X 20 REG. N. 15432').unica === false);
  const fo2 = fatt(FA, '2026-03-01', [rUrea()]); const mo2 = { id: 'mf-' + fo2.id + '-0', tipo: 'Carico', prodottoId: 'urea', data: '2026-03-01', quantita: 1000, fattRiga: fo2.id + ':0' };
  const ncp = fatt(FA, '2026-03-20', [{ descrizione: 'ABBUONO SU PREZZO UREA 46%', categoria: 'Concimi', quantita: null, importo: 20 }], { tipoDoc: 'TD04', segnoOk: false });
  t('nota di credito scritta positiva: toglie lo stesso', uguale(R.prezzi({ fatture: [fo2, ncp], movimenti: [mo2], fatti: { [fo2.id + ':0']: mo2.id, [ncp.id + ':0']: 'r>' + fo2.id + ':0' } }).carico.get(mo2.id), 0.78));
  t('nota di credito scritta positiva non confermata: dubbio', cl([fo2, ncp], [urea], [mo2], { [fo2.id + ':0']: mo2.id }).pronte.length === 0);
  const Es = cl([fatt(FA, '2026-03-01', [rUrea({ descrizione: 'UREA 46% SACCO 25 KG TRASPORTO INCLUSO', codice: '' }), { descrizione: 'TRASPORTO', categoria: 'Concimi', quantita: 1, um: 'NR', importo: 30 }])], [urea]);
  t('merce con "trasporto incluso": dubbio, il trasporto da solo fuori', Es.pronte.length === 0 && Es.daFare.length === 1 && /trasporto/.test(Es.daFare[0].motivo));
  t('riga già caricata ma senza segno in fatti: resta fatta', cl([fo2], [urea], [mo2], {}).fatte.length === 1);
  const d1 = P({ id: 'd1', nome: 'Decis 1 l', categoria: 'Fitofarmaco', unita: 'l', nReg: '15432' }), d5 = P({ id: 'd5', nome: 'Decis 5 l', categoria: 'Fitofarmaco', unita: 'l', nReg: '15432', codiciFatt: [KB + '|DEC5'] });
  const Ed5 = cl([fatt(FB, '2026-05-01', [{ descrizione: 'DECIS EVO 5 LT REG. N. 15432', codice: 'DEC5', categoria: 'Fitofarmaci', quantita: 2, um: 'PZ', importo: 280 }])], [d1, d5], [{ id: 'h-d5', tipo: 'Carico', prodottoId: 'd5', data: '2026-01-02', quantita: 1, prezzo: 28 }]);
  t('due confezioni con lo stesso numero: vince il codice imparato', Ed5.pronte.length === 1 && Ed5.pronte[0].prodotto === d5 && Ed5.pronte[0].q === 10, Ed5.daFare.map(x => x.motivo));
  t('descrizione di una sola parola generica non si impara, "FARINA DI MAIS" sì', R.descrK({ piva: FA, descrizione: 'CONCIME' }) === '' && R.descrK({ piva: FA, descrizione: 'FARINA DI MAIS' }) !== '');
  const Etr = cl([fatt(FA, '2026-03-01', [{ descrizione: 'TRASPORTO', categoria: 'Concimi', quantita: 10, um: 'Q.LI', importo: 30 }, { descrizione: 'TRASPORTO A QUINTALE FRANCO AZIENDA', categoria: 'Concimi', quantita: 10, um: 'Q', importo: 30 }])], [urea]);
  t('trasporto a quintale: fuori', Etr.pronte.length + Etr.daFare.length === 0, Etr.daFare.map(x => x.r.descrizione));
  // collaudo del 20/11: due fatture nello stesso giro, la seconda con i sacchi scritti kg
  const E4b = cl([f1, fatt(FA, '2026-03-02', [rUrea({ um: 'KG', quantita: 40, importo: 800 })])], [urea]);
  t('stesso giro: la riga con i sacchi scritti kg è un dubbio', E4b.pronte.length === 1 && E4b.pronte[0].q === 1000 && E4b.daFare.length === 1 && /prezzo molto diverso/.test(E4b.daFare[0].motivo), E4b.daFare.map(x => x.motivo));
  // scelta di Marco del 25/11/2026: dai ricambi entrano solo filtri, olio, grasso e AdBlue; lampade e il resto no
  t('filtro olio fra i ricambi, olio motore un lubrificante', R.categoriaPer({ categoria: 'Ricambi e manutenzione', descrizione: 'FILTRO OLIO MOTORE 1234' }) === 'Ricambio' && R.categoriaPer({ categoria: 'Ricambi e manutenzione', descrizione: 'CARTUCCIA FILTRANTE IDRAULICA' }) === 'Ricambio' && R.categoriaPer({ categoria: 'Ricambi e manutenzione', descrizione: 'OLIO MOTORE 15W40' }) === 'Lubrificante' && R.categoriaPer({ categoria: 'Ricambi e manutenzione', descrizione: 'ADBLUE TANICA 10 LT' }) === 'AdBlue' && R.categoriaPer({ categoria: 'Carburanti e lubrificanti', descrizione: 'OLIO IDRAULICO FUSTO 20 LT' }) === 'Lubrificante');
  const Efuori = cl([fatt(FA, '2026-03-01', [{ descrizione: 'LAMPADA LED H4 12V', categoria: 'Ricambi e manutenzione', quantita: 2, um: 'PZ', importo: 30 }, { descrizione: 'RETE ROTOPRESS 123 CM', categoria: 'Teli, film e reti', quantita: 2, um: 'PZ', importo: 300 }, { descrizione: 'DETERGENTE MUNGITRICE TANICA 25 KG', categoria: 'Igiene e mungitura', quantita: 2, um: 'NR', importo: 80 }, { descrizione: 'SYNULOX LC 24 SIRINGHE', categoria: 'Farmaci e prodotti veterinari', quantita: 1, um: 'CF', importo: 60 }, { descrizione: 'GRASSO AL LITIO SECCHIO 5 KG', categoria: 'Ricambi e manutenzione', quantita: 1, um: 'NR', importo: 40 }])], []);
  t('ricambi, lampade, reti, igiene e farmaci: fuori; il grasso dal ricambista entra', Efuori.pronte.length + Efuori.daFare.length === 1 && Efuori.daFare[0].r.descrizione.startsWith('GRASSO') && Efuori.daFare[0].nuovo.categoria === 'Lubrificante', Efuori.daFare.map(x => x.r.descrizione));
  const pezzi = ['MOTORE IDRAULICO ORBITALE', 'DISTRIBUTORE IDRAULICO', 'PISTONE IDRAULICO', 'INNESTO RAPIDO IDRAULICO', 'RADIATORE OLIO', 'COPPA OLIO', 'SPIA PRESSIONE OLIO', 'POMPA INGRASSATORE'];
  const oli = ['OLIO IDRAULICO FUSTO 20 LT', 'OLIO MOTORE 15W40', 'GRASSO AL LITIO 5 KG', 'OLIO ATF TANICA 5 LT'];
  t('dal ricambista: i pezzi con "olio" o "idraulico" fuori, oli e grassi dentro', pezzi.every(d => R.categoriaPer({ categoria: 'Ricambi e manutenzione', descrizione: d }) === null) && oli.every(d => R.categoriaPer({ categoria: 'Ricambi e manutenzione', descrizione: d }) === 'Lubrificante'), pezzi.concat(oli).map(d => d + '=' + R.categoriaPer({ categoria: 'Ricambi e manutenzione', descrizione: d })));
  const Efil = cl([fatt(FA, '2026-03-01', [{ descrizione: 'FILTRO GASOLIO 5678', categoria: 'Ricambi e manutenzione', quantita: 2, um: 'PZ', importo: 40, codice: 'FG5678' }])], []);
  t('filtro dal ricambista: proposto come ricambio nuovo', Efil.daFare.length === 1 && Efil.daFare[0].nuovo && Efil.daFare[0].nuovo.categoria === 'Ricambio', Efil.daFare.map(x => x.nuovo));
  const Efil2 = cl([fatt(FA, '2026-04-01', [{ descrizione: 'FILTRO GASOLIO 5678', categoria: 'Ricambi e manutenzione', quantita: 3, um: 'PZ', importo: 60, codice: 'FG5678' }])], [P({ id: 'fg', nome: 'Filtro gasolio', categoria: 'Ricambio', unita: 'pz', codiciFatt: [KA + '|FG5678'] })]);
  t('filtro già imparato: entra da solo', Efil2.pronte.length === 1 && Efil2.pronte[0].q === 3);
  const Ealtro = cl([fatt(FA, '2026-03-01', [{ descrizione: 'LAMPADA LED H4 12V', categoria: 'Da classificare', quantita: 2, um: 'PZ', importo: 30, codice: 'LH4' }])], [P({ id: 'lamp', nome: 'Lampada H4', categoria: 'Ricambio', unita: 'pz', codiciFatt: [KA + '|LH4'] })]);
  t('un ricambio già imparato a mano non entra più dalle fatture', Ealtro.pronte.length + Ealtro.daFare.length === 0);
  // codice imparato vince sulle parole, e due prodotti con lo stesso codice → dubbio
  const u2 = P({ id: 'u2', nome: 'Urea granulare', codiciFatt: [KA + '|UR46'] });
  const E6 = cl([f1], [urea, u2]);
  t('codice del fornitore: certo', E6.pronte.length === 1 && E6.pronte[0].prodotto === u2 && E6.pronte[0].come === 'codice');
  const u3 = P({ id: 'u3', nome: 'Urea bis', descrFatt: [KA + '|UREA 46% SACCO 25 KG'] });
  const E7 = cl([f1], [u2, u3]);
  t('codice e descrizione portano a due prodotti: dubbio', E7.pronte.length === 0 && E7.daFare[0].come === 'conflitto');
  // copie della stessa fattura
  const fx = fatt(FA, '2026-04-02', [rUrea()], { numero: '12/A' }); const fp = fatt(FA, '2026-04-02', [rUrea()], { numero: '12A', fonte: 'pdf' });
  const E8 = cl([fp, fx], [urea]);
  t('XML e PDF della stessa fattura: una sola volta', E8.pronte.length === 1 && E8.pronte[0].r.fid === fx.id && E8.doppie.length === 1);
  // servizi fuori
  const E9 = cl([fatt(FA, '2026-03-01', [{ descrizione: 'TRASPORTO', categoria: 'Concimi', quantita: 1, um: 'NR', importo: 50 }])], [urea]);
  t('trasporto fuori', E9.pronte.length + E9.daFare.length === 0);
  // fitofarmaco: numero di registrazione
  const decis = P({ id: 'decis', nome: 'Decis Evo', categoria: 'Fitofarmaco', unita: 'l', nReg: '15432' });
  const E10 = cl([fatt(FB, '2026-05-01', [{ descrizione: 'DECIS EVO 1 LT REG. N. 15432', categoria: 'Fitofarmaci', quantita: 6, um: 'PZ', importo: 180 }])], [decis]);
  t('fitofarmaco dal numero di registrazione e flacone da 1 l', E10.pronte.length === 1 && E10.pronte[0].prodotto === decis && E10.pronte[0].q === 6);
  const fito = n => (n === '11111' ? { nReg: '11111', nome: 'PRODOTTO FINTO 25 WG', sostanze: 'x' } : null);
  const E11 = cl([fatt(FB, '2026-05-01', [{ descrizione: 'P.FINTO 25WG KG 1 REG.N. 11111', categoria: 'Fitofarmaci', quantita: 2, um: 'CF', importo: 90 }])], [decis], [], {}, fito);
  t('fitofarmaco nuovo: proposta col nome del Ministero', E11.daFare.length === 1 && E11.daFare[0].nuovo && E11.daFare[0].nuovo.nome === 'PRODOTTO FINTO 25 WG' && E11.daFare[0].nuovo.q === 2 && E11.daFare[0].nuovo.unita === 'kg');
  // nota di credito: reso e correzione di prezzo
  const fo = fatt(FA, '2026-03-01', [rUrea()]);
  const mo = { id: 'mf-' + fo.id + '-0', tipo: 'Carico', prodottoId: 'urea', data: '2026-03-01', quantita: 1000, fattRiga: fo.id + ':0' };
  const nc = fatt(FA, '2026-03-20', [rUrea({ quantita: -4, importo: -80 }), { descrizione: 'ABBUONO SU PREZZO UREA 46%', categoria: 'Concimi', quantita: null, importo: -20 }], { tipoDoc: 'TD04' });
  const E12 = cl([fo, nc], [urea], [mo], { [fo.id + ':0']: mo.id });
  const reso = E12.pronte.find(x => x.tipo === 'reso'), pr = E12.pronte.find(x => x.tipo === 'prezzo');
  t('nota di credito con quantità: reso di 100 kg', reso && reso.q === 100 && reso.origine === fo.id + ':0', E12.daFare.map(x => x.motivo));
  t('nota di credito di prezzo: corregge il carico d\'origine', pr && pr.origine === fo.id + ':0');
  const fatti = { [fo.id + ':0']: mo.id, [nc.id + ':1']: 'r>' + fo.id + ':0' };
  const PZ = R.prezzi({ fatture: [fo, nc], movimenti: [mo], fatti });
  t('prezzo del carico con la nota: (800 − 20) / 1000', uguale(PZ.carico.get(mo.id), 0.78));
  const E13 = cl([nc], [urea], [], {});
  t('reso senza carico d\'origine: dubbio', E13.pronte.length === 0 && E13.daFare.length === 2);
  const ncPdf = fatt(FA, '2026-03-20', [rUrea({ quantita: -4, importo: -80 })], { tipoDoc: 'TD04', fonte: 'pdf', segnoOk: false });
  const E14 = cl([fo, ncPdf], [urea], [mo], { [fo.id + ':0']: mo.id });
  t('nota di credito letta da PDF non confermata: dubbio', E14.pronte.length === 0 && /PDF/.test(E14.daFare[0].motivo));
  const grande = fatt(FA, '2026-03-20', [rUrea({ quantita: -80, importo: -1600 })], { tipoDoc: 'TD04' });
  const E15 = cl([fo, grande], [urea], [mo], { [fo.id + ':0']: mo.id });
  t('reso più grande del caricato: dubbio', E15.pronte.length === 0 && /più grande/.test(E15.daFare[0].motivo));
  // sconto scritto come riga della fattura
  const fs = fatt(FA, '2026-03-01', [rUrea(), { descrizione: 'SCONTO IN FATTURA', categoria: 'Concimi', quantita: null, importo: -40 }]);
  const ms = { id: 'ms', tipo: 'Carico', prodottoId: 'urea', data: '2026-03-01', quantita: 1000, fattRiga: fs.id + ':0' };
  t('riga di sconto: non è un dubbio', cl([fs], [urea]).daFare.length === 0);
  t('riga di sconto: entra nel prezzo (760/1000)', uguale(R.prezzi({ fatture: [fs], movimenti: [ms] }).carico.get('ms'), 0.76));
  // sconto di riga non ancora tolto
  const fsr = fatt(FA, '2026-03-01', [rUrea({ sconto: '-10%' })]);
  const msr = { id: 'msr', tipo: 'Carico', prodottoId: 'urea', data: '2026-03-01', quantita: 1000, fattRiga: fsr.id + ':0' };
  t('sconto di riga nel prezzo (720/1000)', uguale(R.prezzi({ fatture: [fsr], movimenti: [msr] }).carico.get('msr'), 0.72));
  // prodotto nuovo dalla riga
  const E16 = cl([fatt(FB, '2026-05-01', [{ descrizione: 'OLIO 15W40 FUSTO 20 LT', categoria: 'Carburanti e lubrificanti', quantita: 2, um: 'NR', importo: 160 }])], []);
  const nv = E16.daFare[0] && E16.daFare[0].nuovo;
  t('prodotto nuovo: olio fra i lubrificanti, 40 l', nv && nv.categoria === 'Lubrificante' && nv.unita === 'l' && nv.q === 40 && nv.nome === 'OLIO 15W40', nv);
  const E17 = cl([fatt(FB, '2026-05-01', [{ descrizione: 'FIENO DI MEDICA IN BALLE', categoria: 'Mangimi e materie prime', quantita: 3000, um: 'KG', importo: 600 }])], []);
  t('prodotto nuovo: fieno fra i foraggi', E17.daFare[0].nuovo && E17.daFare[0].nuovo.categoria === 'Foraggio' && E17.daFare[0].nuovo.q === 3000);
  // impara
  const fi = fatt(FB, '2026-05-01', [{ descrizione: 'PASTA ENERGETICA 24 SIRINGHE LOTTO AB12', categoria: 'Integratori e additivi', quantita: 2, um: 'CF', importo: 120, codice: 'SYN24' }]);
  const syn = P({ id: 'syn', nome: 'Pasta energetica', categoria: 'Integratore', unita: 'pz' });
  const imp = R.impara(syn, righeDi([fi])[0], 48);
  t('impara: codice, descrizione senza lotto, fattore 24', imp.codiciFatt[0] === KB + '|SYN24' && imp.descrFatt[0] === KB + '|PASTA ENERGETICA 24 SIRINGHE' && imp.convFatt['conf>pz'] === 24);
  const fi2 = fatt(FB, '2026-06-01', [{ descrizione: 'PASTA ENERGETICA 24 SIRINGHE LOTTO CD34', categoria: 'Integratori e additivi', quantita: 3, um: 'CF', importo: 180, codice: 'SYN24' }]);
  const E18 = cl([fi2], [imp]);
  t('dopo la prima conferma: entra da sola (72 pz)', E18.pronte.length === 1 && E18.pronte[0].q === 72);
}

/* ---------------- parte 2: un anno di fatture finte ---------------- */
console.log('Parte 2: un anno simulato');
let seme = 7; const rnd = () => (seme = (seme * 1103515245 + 12345) % 2147483648) / 2147483648;
const scegli = a => a[Math.floor(rnd() * a.length)];
const lotto = () => (rnd() < 0.5 ? ' LOTTO ' + Math.floor(rnd() * 90000 + 10000) + 'X' : '');
// catalogo: forn, Conti, descrizione (con varianti), codice, um, fattore (unità prodotto per unità fattura), prodotto vero
const F = { CA: '00000000011', MA: '00000000022', VE: '00000000033', RI: '00000000044', TE: '00000000055', NU: '00000000066' };
const C = [
  { f: F.CA, cat: 'Concimi', d: () => 'UREA 46% SACCO 25 KG' + lotto(), cod: 'UR46', um: 'SC', fx: 25, pr: 20, v: { nome: 'Urea 46%', categoria: 'Concime', unita: 'kg' }, q: [40, 80, 120] },
  { f: F.CA, cat: 'Concimi', d: () => 'NITRATO AMMONICO 27 BIG BAG 600 KG', cod: 'NA27', um: 'KG', fx: 1, pr: 0.5, v: { nome: 'Nitrato ammonico 27', categoria: 'Concime', unita: 'kg' }, q: [3000, 6000] },
  { f: F.CA, cat: 'Sementi', d: () => 'MAIS P1234 SACCO 50000 SEMI', cod: 'MP1234', um: 'NR', fx: 1, pr: 180, v: { nome: 'Mais P1234', categoria: 'Seme', unita: 'pz' }, q: [20, 30] },
  { f: F.CA, cat: 'Sementi', d: () => 'MAIS DKC6050 SACCO 50000 SEMI', cod: 'MD6050', um: 'NR', fx: 1, pr: 175, v: { nome: 'Mais DKC6050', categoria: 'Seme', unita: 'pz' }, q: [10, 20] },
  { f: F.CA, cat: 'Fitofarmaci', d: () => 'DECIS EVO 1 LT REG. N. 15432', cod: 'DEC1', um: 'PZ', fx: 1, pr: 30, v: { nome: 'Decis Evo', categoria: 'Fitofarmaco', unita: 'l', nReg: '15432' }, q: [5, 10] },
  { f: F.CA, cat: 'Fitofarmaci', d: () => 'DISERBO MAIS FINTO CONF 4X5 LT', cod: 'DMF', um: 'CF', fx: 20, pr: 200, v: { nome: 'Diserbo mais finto', categoria: 'Diserbante', unita: 'l' }, q: [1, 2, 3] },
  { f: F.CA, cat: 'Carburanti e lubrificanti', d: () => 'GASOLIO AGRICOLO' + (rnd() < 0.5 ? ' RIF. DDT ' + Math.floor(rnd() * 900) + ' DEL 02/03/2026' : ''), cod: '', um: 'LT', fx: 1, pr: 1.1, v: { nome: 'Gasolio agricolo', categoria: 'Gasolio', unita: 'l' }, q: [2000, 3000, 4000] },
  { f: F.MA, cat: 'Mangimi e materie prime', d: () => 'NUCLEO LATTE 35 SFUSO', cod: 'NL35', um: 'Q.LI', fx: 100, pr: 45, v: { nome: 'Nucleo latte 35', categoria: 'Mangime', unita: 'kg' }, q: [50, 80] },
  { f: F.MA, cat: 'Mangimi e materie prime', d: () => 'FARINA DI MAIS', cod: 'FM', um: 'KG', fx: 1, pr: 0.3, v: { nome: 'Farina di mais', categoria: 'Mangime', unita: 'kg' }, q: [10000, 15000] },
  { f: F.MA, cat: 'Mangimi e materie prime', d: () => 'MANGIME VITELLI SACCO 25 KG', cod: 'MV25', um: 'NR', fx: 25, pr: 15, v: { nome: 'Mangime vitelli', categoria: 'Mangime', unita: 'kg' }, q: [20, 40] },
  { f: F.MA, cat: 'Mangimi e materie prime', d: () => 'FIENO DI MEDICA IN BALLE', cod: '', um: 'KG', fx: 1, pr: 0.2, v: { nome: 'Fieno di medica', categoria: 'Foraggio', unita: 'kg' }, q: [5000, 8000] },
  { f: F.MA, cat: 'Integratori e additivi', d: () => 'INTEGRATORE MINERALE VACCHE SACCO 25 KG', cod: 'IMV', um: 'SC', fx: 25, pr: 30, v: { nome: 'Integratore minerale vacche', categoria: 'Integratore', unita: 'kg' }, q: [10, 20] },
  { f: F.VE, cat: 'Farmaci e prodotti veterinari', d: () => 'SYNULOX LC 24 SIRINGHE' + lotto(), fuori: true, cod: 'SYN24', um: 'CF', fx: 24, pr: 60, v: { nome: 'Synulox LC', categoria: 'Farmaco veterinario', unita: 'pz' }, q: [1, 2, 3] },
  { f: F.VE, cat: 'Igiene e mungitura', d: () => 'DETERGENTE ALCALINO MUNGITRICE TANICA 25 KG', fuori: true, cod: 'DAM25', um: 'NR', fx: 25, pr: 40, v: { nome: 'Detergente alcalino mungitrice', categoria: 'Igiene e mungitura', unita: 'kg' }, q: [2, 4] },
  { f: F.VE, cat: 'Igiene e mungitura', d: () => 'IODIO PRE-DIPPING CONF 4X5 LT', fuori: true, cod: 'IOD', um: 'CF', fx: 20, pr: 70, v: { nome: 'Iodio pre-dipping', categoria: 'Igiene e mungitura', unita: 'l' }, q: [1, 2] },
  { f: F.RI, cat: 'Ricambi e manutenzione', d: () => 'FILTRO OLIO MOTORE 1234', cod: 'FO-1234', um: 'PZ', fx: 1, pr: 25, v: { nome: 'Filtro olio motore', categoria: 'Ricambio', unita: 'pz' }, q: [1, 2, 4] },
  { f: F.RI, cat: 'Carburanti e lubrificanti', d: () => 'OLIO 15W40 FUSTO 20 LT', cod: 'OL1540', um: 'NR', fx: 20, pr: 80, v: { nome: 'Olio 15W40', categoria: 'Lubrificante', unita: 'l' }, q: [1, 2] },
  { f: F.RI, cat: 'Carburanti e lubrificanti', d: () => 'ADBLUE TANICA 10 LT', cod: 'ADB10', um: 'PZ', fx: 10, pr: 8, v: { nome: 'AdBlue', categoria: 'AdBlue', unita: 'l' }, q: [4, 8] },
  { f: F.TE, cat: 'Teli, film e reti', d: () => 'RETE ROTOPRESS 123 CM X 3000 M', fuori: true, cod: 'RR3000', um: 'PZ', fx: 1, pr: 150, v: { nome: 'Rete rotopress', categoria: 'Materiale di consumo', unita: 'pz' }, q: [2, 4] },
  { f: F.TE, cat: 'Teli, film e reti', d: () => 'SPAGO PER PRESSA 400 M', fuori: true, cod: 'SP400', um: 'PZ', fx: 1, pr: 12, v: { nome: 'Spago per pressa', categoria: 'Materiale di consumo', unita: 'pz' }, q: [6, 12] },
  // fornitore nuovo a metà anno, senza codici: la stessa urea si riconosce dalle parole
  { f: F.NU, cat: 'Concimi', d: () => 'UREA AGRICOLA 46% SACCO DA 25 KG', cod: '', um: 'SC', fx: 25, pr: 21, v: { nome: 'Urea 46%', categoria: 'Concime', unita: 'kg' }, q: [40, 80], dal: 6 },
];
// trappole: righe che NON devono entrare da sole (o che devono andare a un prodotto preciso)
const TRAPPOLE = [
  // sacchi scritti come kg dal fornitore: la quantità vera sarebbe ×25, il prezzo lo scopre
  { f: F.CA, cat: 'Concimi', d: 'UREA 46% SACCO 25 KG', cod: 'UR46', um: 'KG', qf: 40, imp: 800, deve: 'dubbio' },
  // ibrido mai comprato: non è P1234 anche se è "mais"
  { f: F.CA, cat: 'Sementi', d: 'MAIS P9999 SACCO 50000 SEMI', cod: 'MP9999', um: 'NR', qf: 10, imp: 1700, deve: 'dubbio' },
  // descrizione vaga
  { f: F.NU, cat: 'Concimi', d: 'CONCIME GRANULARE', cod: '', um: 'KG', qf: 1000, imp: 500, deve: 'dubbio' },
  // nucleo in pezzi senza peso della confezione
  { f: F.MA, cat: 'Mangimi e materie prime', d: 'NUCLEO LATTE 35 SFUSO', cod: 'NL35', um: 'NR', qf: 3, imp: 2700, deve: 'dubbio' },
  // gasolio senza unità
  { f: F.CA, cat: 'Carburanti e lubrificanti', d: 'GASOLIO AGRICOLO', cod: '', um: '', qf: 3000, imp: 3300, deve: 'dubbio' },
  // NON trappole: sacco di un'altra misura (la descrizione lo dice) e olio senza categoria ma con la descrizione già imparata dallo stesso fornitore
  { f: F.CA, cat: 'Concimi', d: 'UREA 46% SACCO 50 KG', cod: 'UR46B', um: 'SC', qf: 20, imp: 800, vero: { nome: 'Urea 46%', q: 1000 } },
  // integratore senza unità
  { f: F.MA, cat: 'Integratori e additivi', d: 'INTEGRATORE MINERALE VACCHE SACCO 25 KG', cod: 'IMV', um: '', qf: 10, imp: 300, deve: 'dubbio' },
  // olio senza categoria nei Conti
  { f: F.RI, cat: 'Da classificare', d: 'OLIO 15W40 FUSTO 20 LT', cod: '', um: 'NR', qf: 1, imp: 80, vero: { nome: 'Olio 15W40', q: 20 } },
];

const prodotti = [ // prodotti scritti a mano prima delle fatture (senza nulla di imparato)
  { id: 'm-urea', nome: 'Urea 46%', categoria: 'Concime', unita: 'kg' },
  { id: 'm-gas', nome: 'Gasolio agricolo', categoria: 'Gasolio', unita: 'l' },
  { id: 'm-nuc', nome: 'Nucleo latte 35', categoria: 'Mangime', unita: 'kg' },
];
const movimenti = []; const fatti = {}; const fatture = [];
const vero = new Map();   // k → { nome, q } (prodotto e quantità giusti) oppure { dubbio: true }
const idDi = nome => (prodotti.find(p => p.nome === nome) || {}).id;
let auto = 0, dubbi = 0, errori = 0, trappoleOk = 0, trappoleTot = 0, primaVolta = 0; const perMese = [];
const applica = (x, p, q, tipo) => { const id = 'mf-' + x.k; movimenti.push({ id, tipo: tipo === 'reso' ? 'Scarico' : 'Carico', reso: tipo === 'reso' || undefined, prodottoId: p.id, data: x.data, quantita: q, fattRiga: x.k }); fatti[x.k] = id; };
for (let mese = 1; mese <= 12; mese++) {
  const data = `2026-${String(mese).padStart(2, '0')}-15`;
  const nuove = [];
  for (const forn of Object.values(F)) {
    const items = C.filter(c => c.f === forn && (!c.dal || mese >= c.dal) && rnd() < 0.6);
    const trapQui = mese >= 3 && TRAPPOLE[(mese - 3) % TRAPPOLE.length].f === forn;
    if (!items.length && !trapQui) continue;
    const righe = items.map(c => { const qf = scegli(c.q); return { _c: c, descrizione: c.d(), categoria: c.cat, codice: c.cod, quantita: qf, um: c.um, prezzo: c.pr, importo: Math.round(qf * c.pr * 100) / 100 }; });
    // ogni mese da marzo una trappola, a turno (così ognuna capita almeno una volta)
    const tr = mese >= 3 ? TRAPPOLE[(mese - 3) % TRAPPOLE.length] : null; if (tr && tr.f === forn) righe.push({ _t: tr, descrizione: tr.d, categoria: tr.cat, codice: tr.cod, quantita: tr.qf, um: tr.um, importo: tr.imp });
    if (rnd() < 0.2) righe.push({ descrizione: 'TRASPORTO', categoria: 'Trasporti e pedaggi', quantita: 1, um: 'NR', importo: 50 });
    const f = fatt(forn, data, righe.map(({ _c, _t, ...r }) => r));
    righe.forEach((r, i) => { const k = f.id + ':' + i; if (r._c) vero.set(k, { nome: r._c.v.nome, q: r.quantita * r._c.fx, v: r._c.v, fuori: r._c.fuori }); else if (r._t) vero.set(k, r._t.vero ? Object.assign({ v: {} }, r._t.vero) : { dubbio: true, t: r._t }); });
    fatture.push(f); nuove.push(f);
    if (rnd() < 0.15) fatture.push(Object.assign({}, f, { id: 'pdf-' + f.id, fonte: 'pdf', numero: f.numero + '/' })); // PDF di cortesia della stessa fattura
  }
  // una nota di credito di reso dal consorzio a giugno e una di prezzo a settembre
  if (mese === 6 || mese === 9) {
    const orig = movimenti.filter(m => m.prodottoId === idDi('Urea 46%') && m.tipo === 'Carico' && fatture.find(f => f.id === m.fattRiga.split(':')[0]).piva === F.CA).pop();
    if (orig) {
      const r = mese === 6 ? { descrizione: 'UREA 46% SACCO 25 KG RESO', categoria: 'Concimi', codice: 'UR46', quantita: -4, um: 'SC', prezzo: 20, importo: -80 } : { descrizione: 'ABBUONO SU PREZZO UREA 46%', categoria: 'Concimi', codice: '', quantita: null, um: '', importo: -30 };
      const nc = fatt(F.CA, data, [r], { tipoDoc: 'TD04' }); fatture.push(nc);
      vero.set(nc.id + ':0', mese === 6 ? { nome: 'Urea 46%', q: 100, reso: true } : { prezzo: true, origine: orig.fattRiga });
    }
  }
  // giro automatico: le pronte si caricano, poi Marco risponde ai dubbi
  let E = R.classifica({ righe: righeDi(fatture), fatture, prodotti, movimenti, fatti });
  let a = 0, dd = 0;
  for (const x of E.pronte) {
    const v = vero.get(x.k);
    if (v && v.fuori) { errori++; console.log('  ERRORE: riga fuori dal magazzino entrata', x.r.descrizione); }
    else if (!v || v.dubbio) { errori++; console.log('  ERRORE: trappola entrata da sola', x.r.descrizione, x.prodotto.nome, x.q); }
    else if (v.prezzo) { if (x.origine !== v.origine) { errori++; console.log('  ERRORE: correzione sul carico sbagliato'); } }
    else if (x.prodotto.nome !== v.nome || !uguale(x.q, v.q) || (x.tipo === 'reso') !== !!v.reso) { errori++; console.log('  ERRORE', x.r.descrizione, '→', x.prodotto.nome, x.q, 'invece di', v.nome, v.q); }
    if (x.tipo === 'prezzo') fatti[x.k] = 'r>' + x.origine; else applica(x, x.prodotto, x.q, x.tipo);
    a++;
  }
  for (const x of E.daFare) {
    dd++; const v = vero.get(x.k); if (process.env.VERBOSE && mese > 2) console.log("   dubbio", mese, x.tipo, x.r.descrizione, "|", x.motivo, v && v.dubbio ? "(trappola)" : "");
    if (!v) { console.log('  riga senza verità', x.r.descrizione); continue; }
    if (v.fuori) { errori++; console.log('  ERRORE: riga fuori dal magazzino fra i dubbi', x.r.descrizione); continue; }
    if (v.dubbio) { trappoleOk++; trappoleTot++; fatti[x.k] = 'no'; continue; }   // Marco scarta (o sistema a mano)
    if (v.prezzo) { fatti[x.k] = 'r>' + v.origine; continue; }
    let p = prodotti.find(y => y.nome === v.nome);
    if (!p) { p = Object.assign({ id: 'p-' + prodotti.length }, v.v); prodotti.push(p); primaVolta++; }
    const i = prodotti.indexOf(p); prodotti[i] = R.impara(p, x.r, v.q); applica(x, prodotti[i], v.q, v.reso ? 'reso' : 'carico');
  }
  for (const x of E.pronte) { const v = vero.get(x.k); if (v && v.dubbio) trappoleTot++; }
  auto += a; dubbi += dd; perMese.push(`${mese}: ${a} da sole, ${dd} dubbi`);
}
const tot = auto + dubbi;
console.log('  ' + perMese.join(' | '));
console.log(`  Righe di magazzino: ${tot}. Entrate da sole: ${auto} (${Math.round(auto / tot * 100)}%). Dubbi: ${dubbi} (${Math.round(dubbi / tot * 100)}%), di cui ${trappoleOk} trappole fermate su ${trappoleTot} e ${primaVolta} prodotti nuovi creati alla prima volta.`);
const dopo = perMese.slice(3).map(s => s.match(/(\d+) da sole, (\d+) dubbi/)).reduce((t, m) => [t[0] + +m[1], t[1] + +m[2]], [0, 0]);
console.log(`  Da aprile a dicembre (prodotti già imparati): ${dopo[0]} da sole su ${dopo[0] + dopo[1]} (${Math.round(dopo[0] / (dopo[0] + dopo[1]) * 100)}%).`);
t('nessuna riga entrata da sola è sbagliata', errori === 0, errori + ' errori');
t('tutte le trappole fermate', trappoleOk === trappoleTot, `${trappoleOk}/${trappoleTot}`);
t('nessun doppione dalle copie PDF', !movimenti.some(m => m.fattRiga.startsWith('pdf-')));
t('ogni riga caricata una volta sola', new Set(movimenti.map(m => m.fattRiga)).size === movimenti.length);
// controllo finale: la giacenza dell'urea = carichi − resi
const gUrea = movimenti.filter(m => m.prodottoId === idDi('Urea 46%')).reduce((s, m) => s + (m.tipo === 'Scarico' ? -1 : 1) * m.quantita, 0);
const atteso = [...vero.entries()].filter(([k, v]) => v.nome === 'Urea 46%' && !fatture.find(f => f.id === k.split(':')[0]).id.startsWith('pdf-')).reduce((s, [, v]) => s + (v.reso ? -v.q : v.q), 0);
t('giacenza dell\'urea giusta (carichi meno il reso)', uguale(gUrea, atteso), { gUrea, atteso });

console.log(`\n${ok} prove passate, ${ko} fallite`);
process.exit(ko ? 1 : 0);
