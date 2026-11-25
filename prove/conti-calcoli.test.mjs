// Prove dei calcoli dei Conti con dati INVENTATI (nessun dato vero): totali delle fatture, abbinamento dei movimenti
// di banca alle fatture, ammortamenti dei beni, IVA nei due regimi. I risultati attesi sono fatti a mano (scritti nei
// commenti), non copiati da quello che il codice restituisce: se una prova non passa, il conto è cambiato.
// Uso: npm test   oppure   node prove/conti-calcoli.test.mjs  (PROVE_TUTTE=1 per vedere anche quelle che passano)
import './avvio.mjs';
import { t, sezione, fine, uguale } from './aiuto.mjs';
const ROOT = new URL('../js', import.meta.url).href;
const { S } = await import(ROOT + '/state.js');
const FP = await import(ROOT + '/conti/fatture-parse.js');
const B = await import(ROOT + '/conti/banca.js');
const BE = await import(ROOT + '/conti/beni.js');
const RG = await import(ROOT + '/conti/regime.js');

// le funzioni di dati.js tengono in memoria i calcoli finché S.fatture è lo stesso elenco: ogni prova ne mette uno nuovo
const reset = () => { S.fatture = []; S.econfig = []; S.bilanci = []; S.pagamenti = []; S.paghe = []; };

/* ---------------------------------------------------------------- */
sezione('1. Numeri, date e totali delle fatture');
t('numero italiano con migliaia e decimali', FP.numIt('1.234,56') === 1234.56);
t('numero negativo con il meno in fondo (stampe di alcuni gestionali)', FP.numIt('150,00-') === -150);
t('testo che non è un numero', FP.numIt('abc') === null && FP.numIt('') === null);
t('data con il trattino', FP.dataIt('31-01-2025') === '2025-01-31');
t('data con la barra', FP.dataSl('05/03/2025') === '2025-03-05');
t('data impossibile (31 febbraio) scartata', FP.dataSl('31/02/2025') === null);

let c = FP.controlloTotale(1220, 1000, 220);
t('totale = imponibile + IVA: OK', c.controllo === 'OK' && c.ritenuta === 0, c);
c = FP.controlloTotale(1222, 1000, 220);
t('2 € in più (bollo): OK', c.controllo === 'OK', c);
// veterinario: compenso 1.000 + ENPAV 2% = imponibile 1.020; IVA 22% = 224,40; ritenuta 20% sul compenso = 200
// totale = 1.020 + 224,40 − 200 = 1.044,40
c = FP.controlloTotale(1044.40, 1020, 224.40);
t("ritenuta d'acconto del 20% con cassa del 2% riconosciuta", c.controllo.startsWith("OK (ritenuta") && uguale(c.ritenuta, 200), c);
// professionista senza cassa: compenso 500, IVA 110, ritenuta 100 → totale 510
c = FP.controlloTotale(510, 500, 110);
t("ritenuta del 20% senza cassa", c.controllo.startsWith("OK (ritenuta") && uguale(c.ritenuta, 100), c);
c = FP.controlloTotale(1215, 1000, 220, 0, -5);
t('sconto di 5 € scritto nei totali del documento: OK', c.controllo.startsWith('OK (sconto'), c);
c = FP.controlloTotale(1170, 1000, 220);
t('50 € che mancano e non sono una ritenuta: segnalato', c.controllo.startsWith('totale ≠') && c.ritenuta === 0, c);

const fattura = o => Object.assign({ tipoDoc: 'TD01', numero: '12', data: '2025-03-10', pivaFornitore: '01234567890', righe: [], riepiloghi: [], avvisi: [], pagamenti: [] }, o);
let f = FP.completa(fattura({ righe: [{ importo: 100, aliquota: '22' }, { importo: 50, aliquota: '22,0' }], riepiloghi: [{ imponibile: 150, imposta: 33 }], totale: 183 }));
t('fattura normale: imponibile e IVA dal riepilogo, controllo OK', f.imponibile === 150 && f.iva === 33 && f.controllo === 'OK' && f.segno === 1, f);
t('aliquota scritta come testo diventa un numero', f.righe[0].aliquota === 22 && f.righe[1].aliquota === 22, f.righe);
t('chiave per riconoscere i doppioni: partita IVA | numero | data', f.chiave === '01234567890|12|2025-03-10', f.chiave);
// totale stampato senza decimali (9.254 invece di 92,54) ma pagamento giusto
f = FP.completa(fattura({ righe: [{ importo: 75.85, aliquota: 22 }], riepiloghi: [{ imponibile: 75.85, imposta: 16.69 }], totale: 9254, pagamenti: [{ importo: 92.54 }] }));
t('totale senza decimali: preso dai pagamenti', f.totale === 92.54 && f.controllo === 'OK' && f.avvisi.some(a => /senza decimali/.test(a)), f);
f = FP.completa(fattura({ righe: [{ importo: 100, aliquota: 22 }], riepiloghi: [{ imponibile: 150, imposta: 33 }], totale: 183 }));
t('righe che non arrivano all\'imponibile: segnalato', f.controllo.startsWith('righe'), f.controllo);
f = FP.completa(fattura({ tipoDoc: 'TD04', righe: [{ importo: -100, aliquota: 22, quantita: -1 }], riepiloghi: [{ imponibile: -100, imposta: -22 }], totale: -122 }));
t('nota di credito tutta negativa: importi girati in positivo e segno −1', f.righe[0].importo === 100 && f.imponibile === 100 && f.iva === 22 && f.totale === 122 && f.segno === -1, f);
f = FP.completa(fattura({ righe: [{ importo: 100, aliquota: 22 }], totale: 122 }));
t('senza riepilogo IVA: imponibile dalle righe e IVA dalla differenza col totale', f.imponibile === 100 && f.iva === 22 && f.controllo.startsWith('OK (imponibile dalle righe'), f);

/* ---------------------------------------------------------------- */
sezione('2. Stato del pagamento di una fattura');
const stato = o => B.statoPagamento(Object.assign({ totale: 1000 }, o));
t('pagata tutta', stato({ pagamentiBanca: [{ importo: 1000 }] }).stato === 'pagata');
let st = stato({ pagamentiBanca: [{ importo: 400 }] });
t('pagata in parte: resta 600', st.stato === 'in parte' && st.residuo === 600, st);
t('niente pagamenti e scadenza passata: scaduta', stato({ scadenza: '2020-01-31' }).stato === 'scaduta');
t('niente pagamenti e scadenza futura: da pagare', stato({ scadenza: '2099-01-31' }).stato === 'da pagare');
st = stato({ totale: -1000, pagamentiBanca: [{ importo: 400 }] });
t('nota di credito (totale negativo): si guarda il valore assoluto, restano 600', st.stato === 'in parte' && st.residuo === 600, st);
// in JavaScript 0,1 + 0,7 fa 0,7999999999999999: senza arrotondamento risulterebbe "in parte"
t('due pagamenti che fanno il totale con i centesimi', stato({ totale: 0.8, pagamentiBanca: [{ importo: 0.1 }, { importo: 0.7 }] }).stato === 'pagata');
st = stato({ totale: 100, pagamentiBanca: [{ importo: 99.98 }] });
t('mancano 2 centesimi: non è pagata', st.stato === 'in parte' && st.residuo === 0.02, st);

/* ---------------------------------------------------------------- */
sezione('3. Movimenti di banca abbinati alle fatture');
reset();
const fatt = (id, o) => Object.assign({ id, tipo: 'Acquisto', controparte: 'MANGIMI FINTI SRL', totale: 0 }, o);
S.fatture = [
  fatt('f1', { numero: '123', data: '2025-03-10', totale: 1220 }),
  fatt('f2', { numero: '130', data: '2025-04-12', totale: 610 }),
  fatt('f3', { controparte: 'OFFICINA MECCANICA BIANCHI', numero: '45/A', data: '2025-02-01', totale: 350 }),
  fatt('f4', { tipo: 'Vendita', controparte: 'LATTERIA SOCIALE DI PROVA', numero: '7', data: '2025-03-31', totale: 25000 }),
  fatt('f5', { numero: '99', data: '2022-01-10', totale: 1220 }),   // più vecchia di due anni: non si propone
  fatt('f6', { controparte: 'VIVAIO VERDI', numero: '8', data: '2025-06-01', totale: 1220 }),  // dopo il movimento
];
const mov = o => Object.assign({ data: '2025-04-15' }, o);
let r = B.candidateFatture(mov({ importo: -1220, descrizione: 'BONIFICO A MANGIMI FINTI SRL SALDO FATT. N. 123' }));
t('numero della fattura nella causale e importo giusto', r.scelte.join() === 'f1' && r.motivo === 'numero e importo', r);
t('… è un acquisto perché il movimento è in uscita', r.tipo === 'Acquisto');
r = B.candidateFatture(mov({ importo: -1830, data: '2025-05-02', descrizione: 'BONIFICO MANGIMI FINTI' }));
t('due fatture dello stesso fornitore pagate insieme (1.220 + 610)', r.scelte.join() === 'f1,f2' && /2 fatture/.test(r.motivo), r);
r = B.candidateFatture(mov({ importo: -350, descrizione: 'PAGAMENTO OFFICINA MECCANICA BIANCHI' }));
t('nome del fornitore e importo', r.scelte.join() === 'f3' && r.motivo === 'nome e importo', r);
r = B.candidateFatture(mov({ importo: 25000, data: '2025-04-30', descrizione: 'ACCREDITO DA LATTERIA SOCIALE' }));
t('incasso abbinato a una fattura di vendita', r.tipo === 'Vendita' && r.scelte.join() === 'f4', r);
r = B.candidateFatture(mov({ importo: -1220, descrizione: 'ADDEBITO SDD 000123987' }));
t('solo l\'importo: va bene se una sola fattura aperta ha quel totale', r.scelte.join() === 'f1' && r.motivo === 'solo importo', r);
t('fattura di più di due anni prima e fattura dopo il movimento non si propongono', !r.proposte.some(p => p.id === 'f5' || p.id === 'f6'), r.proposte);
r = B.candidateFatture(mov({ importo: -1220, descrizione: 'BONIFICO A MANGIMI FINTI SRL SALDO FATT. N. 123' }), new Map([['f1', 1220]]));
t('fattura già pagata da un altro movimento dello stesso estratto: non si abbina di nuovo', !r.scelte.includes('f1'), r);
r = B.candidateFatture(mov({ importo: -999.99, descrizione: 'BONIFICO A SCONOSCIUTO' }));
t('nessuna fattura che torna: nessuna scelta a caso', r.scelte.length === 0, r);

// pagamento registrato su due fatture: si riparte in ordine di data
const m2 = mov({ importo: -1830, data: '2025-05-02', descrizione: 'BONIFICO MANGIMI FINTI' }); m2.id = B.idMovimento(m2);
await B.registraSuFatture(m2, ['f2', 'f1'], 'prova');
const pagato = id => S.fatture.find(x => x.id === id).pagamentiBanca;
t('ripartito in ordine di data: 1.220 alla più vecchia, 610 all\'altra', pagato('f1')[0].importo === 1220 && pagato('f2')[0].importo === 610, [pagato('f1'), pagato('f2')]);
t('… e tutte e due risultano pagate', B.statoPagamento(S.fatture.find(x => x.id === 'f1')).stato === 'pagata' && B.statoPagamento(S.fatture.find(x => x.id === 'f2')).stato === 'pagata');
await B.registraSuFatture(m2, ['f2', 'f1'], 'prova');
t('stesso movimento registrato due volte: non si raddoppia', pagato('f1').length === 1 && pagato('f2').length === 1);
t('id del movimento sempre uguale per gli stessi dati', B.idMovimento(mov({ importo: -1830, data: '2025-05-02', descrizione: 'BONIFICO MANGIMI FINTI' })) === m2.id);
await B.togliPagamentoFattura('f1', m2.id);
t('togliere il pagamento rimette la fattura da pagare', !pagato('f1').length && B.statoPagamento(S.fatture.find(x => x.id === 'f1')).residuo === 1220);
// pagamento che non basta per tutte e due: qui l'ordine conta
S.fatture = S.fatture.map(x => Object.assign({}, x, { pagamentiBanca: [] }));
const m3 = mov({ importo: -1500, data: '2025-05-20', descrizione: 'ACCONTO MANGIMI FINTI' }); m3.id = B.idMovimento(m3);
await B.registraSuFatture(m3, ['f2', 'f1'], 'prova');
t('1.500 su due fatture: prima si salda la più vecchia (1.220), il resto (280) va alla più recente',
  pagato('f1')[0].importo === 1220 && pagato('f2')[0].importo === 280 && B.statoPagamento(S.fatture.find(x => x.id === 'f2')).stato === 'in parte', [pagato('f1'), pagato('f2')]);

/* ---------------------------------------------------------------- */
sezione('4. Ammortamenti dei beni');
// trattore 100.000 € in 10 anni (120 mesi) dal 15/07/2024: 833,33 € al mese
const trattore = { tipo: 'bene', id: 'be-t', nome: 'Trattore', cat: 'macchine', data: '2024-07-15', costo: 100000, anni: 10 };
let q = BE.quote(trattore, 2024);
t('anno di acquisto: 6 mesi (luglio-dicembre) = 5.000 €', q.mesi === 6 && q.quota === 5000 && q.fondo === 5000 && q.netto === 95000 && q.acquisto === 100000, q);
q = BE.quote(trattore, 2025);
t('anno intero: 10.000 €, fondo 15.000, valore 85.000', q.quota === 10000 && q.fondo === 15000 && q.netto === 85000 && q.acquisto === 0, q);
t('anni futuri: non si calcolano (il registro conta fino al mese di oggi)', BE.quote(trattore, 2034).quota === 0);
// computer 1.200 € in 5 anni (60 mesi) dal 15/07/2019: 20 € al mese, ultimo mese giugno 2024
const pc = { cat: 'ufficio', data: '2019-07-15', costo: 1200, anni: 5 };
q = BE.quote(pc, 2024);
t('ultimo anno: 6 mesi fino a giugno (120 €), fondo pieno, finito', q.quota === 120 && q.fondo === 1200 && q.netto === 0 && q.finito, q);
q = BE.quote(pc, 2025);
t('dopo la fine: niente quota, resta nel registro a valore 0', q.quota === 0 && q.netto === 0 && q.fondo === 1200 && q.presente, q);
q = BE.quote(trattore, 2023);
t('anno prima dell\'acquisto: niente', q.quota === 0 && !q.presente && q.acquisto === 0, q);
q = BE.quote(Object.assign({}, trattore, { fine: '2025-03-20' }), 2025);
t('venduto a marzo 2025: 3 mesi di quota (2.500) ed esce dal registro', q.quota === 2500 && !q.presente && q.costo === 0 && q.fondo === 0, q);
q = BE.quote(Object.assign({}, trattore, { fine: '2025-03-20' }), 2026);
t('… e l\'anno dopo non c\'è più', q.quota === 0 && !q.presente, q);
// furgone 10.000 € con valore finale 1.000 in 5 anni: (10.000 − 1.000) / 60 = 150 € al mese
q = BE.quote({ cat: 'automezzi', data: '2023-01-10', costo: 10000, residuo: 1000, anni: 5 }, 2023);
t('valore finale escluso dall\'ammortamento: 12 × 150 = 1.800', q.quota === 1800, q);
// stalla 396.000 € senza durata scritta: 33 anni della categoria = 396 mesi = 1.000 € al mese
q = BE.quote({ cat: 'fabbricati', data: '2020-01-01', costo: 396000 }, 2025);
t('durata della categoria se manca (fabbricati 33 anni): 12.000 €, fondo 72.000', q.quota === 12000 && q.fondo === 72000, q);
q = BE.quote({ cat: 'terreni', data: '2020-05-01', costo: 50000 }, 2025);
t('terreni: non si ammortizzano, restano al costo', q.quota === 0 && q.costo === 50000 && q.netto === 50000, q);
t('bene senza data o senza costo: niente', BE.quote({ cat: 'macchine', costo: 1000 }, 2025).quota === 0 && BE.quote({ cat: 'macchine', data: '2025-01-01' }, 2025).quota === 0);

reset();
S.econfig = [trattore, { tipo: 'bene', id: 'be-s', nome: 'Stalla', cat: 'fabbricati', data: '2020-01-01', costo: 396000 }];
const R25 = BE.annoRegistro(2025);
t('registro 2025: fabbricati nella riga 64 (12.000), macchine nella 65 (10.000), totale 22.000', R25.ce[64] === 12000 && R25.ce[65] === 10000 && R25.tot === 22000, R25.ce);
t('… cespiti: stalla costo 396.000 fondo 72.000, trattore costo 100.000 fondo 15.000', R25.cesp[14].c === 396000 && R25.cesp[14].f === 72000 && R25.cesp[16].c === 100000 && R25.cesp[16].f === 15000, R25.cesp);

/* ---------------------------------------------------------------- */
sezione('5. IVA: regime ordinario e regime speciale agricolo');
reset();
const ven = (id, imp, aliq, categoria) => ({ id, tipo: 'Vendita', data: '2025-05-10', controparte: 'CLIENTE ' + id, numero: id, imponibile: imp, iva: imp * aliq / 100, totale: imp * (1 + aliq / 100), righe: [{ importo: imp, aliquota: aliq, categoria }] });
S.fatture = [
  ven('v1', 100000, 10, 'Latte'),             // compensazione 10%  → 10.000
  ven('v2', 20000, 10, 'Vendita bovini'),     // compensazione 7%   →  1.400
  ven('v3', 5000, 4, 'Mais'),                 // compensazione 4%   →    200
  ven('v4', 1000, 22, 'Servizi a terzi'),     // niente compensazione
  { id: 'a1', tipo: 'Acquisto', data: '2025-06-01', controparte: 'FORNITORE', numero: 'a1', imponibile: 40909.09, iva: 9000, totale: 49909.09, righe: [{ importo: 40909.09, aliquota: 22, categoria: 'Mangimi' }] },
  { id: 'x1', tipo: 'Vendita', data: '2024-05-10', controparte: 'ALTRO ANNO', numero: 'x1', imponibile: 5000, iva: 500, totale: 5500, righe: [{ importo: 5000, aliquota: 10, categoria: 'Latte' }] },
];
let A = RG.anno(2025);
// IVA delle vendite 10.000 + 2.000 + 200 + 220 = 12.420; acquisti 9.000
t('compensazione: 10.000 + 1.400 + 200 = 11.600', A.comp === 11600, A.comp);
t('IVA delle vendite e degli acquisti dalle fatture dell\'anno (l\'altro anno escluso)', uguale(A.ivaVen, 12420) && uguale(A.ivaAcq, 9000) && !A.dich, [A.ivaVen, A.ivaAcq]);
t('ordinario: 12.420 − 9.000 = 3.420 da versare', A.ord === 3420, A.ord);
t('speciale: 12.420 − 11.600 = 820 da versare', A.spec === 820, A.spec);
t('il regime speciale fa pagare 2.600 in meno', A.vantaggioSpec === 2600, A.vantaggioSpec);
t('vendite agricole 125.000 (i servizi no)', A.venAgr === 125000 && A.gr.altro.imp === 1000, A.venAgr);
S.econfig = [{ id: 'regime-iva', perc: { latte: 8.8 } }]; S.fatture = [...S.fatture];
A = RG.anno(2025);
t('percentuale del latte cambiata da un decreto (8,8%): compensazione 10.400', A.comp === 10400, A.comp);
S.econfig = []; S.bilanci = [{ id: '2025', iva: { voci: { vl1: 13000, vl2: 9500 } } }]; S.fatture = [...S.fatture];
A = RG.anno(2025);
t('con la dichiarazione IVA caricata valgono VL1 e VL2: ordinario 3.500, speciale 1.400', A.dich && A.ord === 3500 && A.spec === 1400, A);
// senza i servizi l'IVA delle vendite è 12.200; con il latte al 12% la compensazione (12.000 + 1.400 + 200 = 13.600) la supera
S.bilanci = []; S.econfig = [{ id: 'regime-iva', perc: { latte: 12 } }];
S.fatture = S.fatture.filter(x => x.id !== 'v4').map(x => x.id === 'a1' ? Object.assign({}, x, { iva: 20000 }) : x);
A = RG.anno(2025);
t('nel regime speciale non nasce un credito: 0, non negativo (12.200 − 13.600)', A.comp === 13600 && A.spec === 0, A);
t('… mentre nell\'ordinario c\'è un credito: 12.200 − 20.000 = −7.800', A.ord === -7800, A.ord);

fine('conti-calcoli');
