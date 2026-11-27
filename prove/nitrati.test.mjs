// Prove del bilancio dell'azoto (js/nitrati.js) con dati INVENTATI: MAS per coltura, azoto dei concimi e degli effluenti,
// bilancio per campo (stati), azoto della stalla e valori cambiati dall'utente.
// I risultati attesi sono fatti a mano (scritti nei commenti), non copiati da quello che il codice restituisce.
// Uso: npm test   oppure   node --import ./prove/avvio.mjs prove/nitrati.test.mjs  (PROVE_TUTTE=1 per vedere anche quelle che passano)
import './avvio.mjs';
import { t, sezione, uguale, fine } from './aiuto.mjs';
const ROOT = new URL('../js', import.meta.url).href;
const { S } = await import(ROOT + '/state.js');
const X = await import(ROOT + '/nitrati.js');
const { derive } = await import(ROOT + '/domain.js');

/* ---------------------------------------------------------------- */
sezione('1. Valori di partenza e MAS della coltura');
S.config = [];
let cfg = X.nitConfig();
t('senza impostazioni: zona ZVN', cfg.zona === 'ZVN', cfg.zona);
t('vacca in lattazione 83 kg N', cfg.capi['In lattazione'] === 83);
S.config = [{ id: 'nitrati', zona: 'qualcosa' }];
t('zona sconosciuta → ZVN', X.nitConfig().zona === 'ZVN');
S.config = [];
t('nome esatto: Mais da granella 280', X.masDi('Mais da granella') === 280);
t('granturco → mais trinciato 280', X.masDi('Granturco') === 280);
t('grano duro → frumento 180', X.masDi('Grano duro') === 180);
t('avena → come triticale 150', X.masDi('Avena') === 150);
t('loietto italico → loiessa 210', X.masDi('Loietto italico') === 210);
t('prato stabile → prato 180', X.masDi('Prato stabile') === 180);
t('erba medica 0 (non null)', X.masDi('Erba medica') === 0);
t('patata sconosciuta → null', X.masDi('Patata') === null);
t('coltura vuota → null', X.masDi('') === null && X.masDi(null) === null);

/* ---------------------------------------------------------------- */
// Azienda finta. Oggi (orologio fermo di avvio.mjs) è il 25/11/2026.
S.campi = [
  { id: 'n1', nome: 'Nord', superficie: 10, colture: [{ anno: 2026, coltura: 'Mais da granella' }] },               // MAS 280
  { id: 'n2', nome: 'Sud', superficie: 4, colture: [{ anno: 2026, coltura: 'Frumento tenero', secondo: { coltura: 'Soia' } }] }, // 180 + 0
  { id: 'n3', nome: 'Medica', superficie: 2, colture: [{ anno: 2026, coltura: 'Erba medica' }] },                   // MAS 0
  { id: 'n4', nome: 'Senza superficie', superficie: 0 },
  { id: 'n5', nome: 'Vuoto', superficie: 3 },                                                                        // niente: fuori
  { id: 'n6', nome: 'Patate', superficie: 5, colture: [{ anno: 2026, coltura: 'Patata' }] },                         // senza MAS
  { id: 'n7', nome: 'Loietto', superficie: 1, colture: [{ anno: 2026, coltura: 'Loietto italico' }] },              // MAS 210
  { id: 'n8', nome: 'Due colture', superficie: 2, colture: [{ anno: 2026, coltura: 'Orzo', secondo: { coltura: 'Sorgo' } }] }, // 150 + 220
];
S.prodotti = [
  { id: 'urea', nome: 'Urea', categoria: 'Concime', unita: 'q', titN: 46 },
  { id: 'npk', nome: 'NPK 20-10-10', categoria: 'Concime', unita: 'kg', titN: 20, titP: 10, titK: 10 },
  { id: 'liq', nome: 'Concime liquido', categoria: 'Concime', unita: 'l', titN: 30 },
  { id: 'liquame', nome: 'Liquame', categoria: 'Effluente', unita: 'm³', kgN: 3, kgP: 1, kgK: 4, effN: '' },        // efficienza 50%
  { id: 'letame', nome: 'Letame', categoria: 'Effluente', unita: 't', kgN: 5, effN: 40 },
  { id: 'dig', nome: 'Digestato', categoria: 'Effluente', unita: 'm³', kgN: 4, effN: 0 },
  { id: 'fito', nome: 'Erbicida', categoria: 'Fitofarmaco', unita: 'l' },
];
S.movimenti = []; S.eventi = []; S.latte = [];

sezione('2. Azoto di una attività');
let x = X.nutrientiOp({ campoId: 'n1', prodottoId: 'urea', quantita: 6 });
// 6 q = 600 kg × 46% = 276 kg N, tutto efficiente, niente da effluenti
t('urea 6 q → 276 kg N efficiente', x && uguale(x.n, 276) && uguale(x.nEff, 276) && x.nZoo === 0, x);
x = X.nutrientiOp({ campoId: 'n1', prodottoId: 'liquame', dose: 30 });
// senza quantità: 30 m³/ha × 10 ha = 300 m³ → N 900, efficiente 50% = 450, P 300, K 1200
t('liquame a dose: 300 m³ → N 900, eff 450, P 300, K 1200', x && uguale(x.n, 900) && uguale(x.nEff, 450) && uguale(x.nZoo, 900) && uguale(x.p, 300) && uguale(x.k, 1200), x);
x = X.nutrientiOp({ campoId: 'n1', prodottoId: 'dig', quantita: 10 });
// efficienza 0 scritta vale 0, non il 50% di partenza: N 40, eff 0
t('efficienza 0 resta 0', x && uguale(x.n, 40) && x.nEff === 0 && uguale(x.nZoo, 40), x);
x = X.nutrientiOp({ campoId: 'n6', prodottoId: 'liq', quantita: 100 });
t('concime in litri contato come kg: 100 l × 30% = 30', x && uguale(x.n, 30), x);
t('fitofarmaco → niente', X.nutrientiOp({ campoId: 'n1', prodottoId: 'fito', quantita: 5 }) === null);
t('prodotto che non c\'è → niente', X.nutrientiOp({ campoId: 'n1', prodottoId: 'zzz', quantita: 5 }) === null);
t('dose su un campo senza superficie → niente', X.nutrientiOp({ campoId: 'n4', prodottoId: 'npk', dose: 100 }) === null);
x = X.nutrientiOp({ campoId: 'n1', prodottoId: 'liquame', dose: 30, altriProdotti: [{ prodottoId: 'npk', quantita: 100 }, { prodottoId: 'fito', quantita: 2 }] });
// liquame + 100 kg NPK (N 20, P 10, K 10): N 920, eff 470, zoo 900, P 310, K 1210
t('più prodotti nella stessa attività si sommano', x && uguale(x.n, 920) && uguale(x.nEff, 470) && uguale(x.nZoo, 900) && uguale(x.p, 310) && uguale(x.k, 1210), x);

/* ---------------------------------------------------------------- */
sezione('3. Bilancio per campo');
const F = { stato: 'Fatto' };
S.operazioni = [
  Object.assign({ id: 'o1', tipo: 'Concimazione', campoId: 'n1', data: '2026-03-01', prodottoId: 'urea', quantita: 6 }, F),
  Object.assign({ id: 'o2', tipo: 'Concimazione', campoId: 'n1', data: '2026-04-01', prodottoId: 'liquame', dose: 30, altriProdotti: [{ prodottoId: 'npk', quantita: 100 }] }, F),
  { id: 'o3', tipo: 'Concimazione', campoId: 'n1', data: '2026-05-01', prodottoId: 'urea', quantita: 10, stato: 'Pianificata' }, // fuori
  Object.assign({ id: 'o4', tipo: 'Concimazione', campoId: 'n1', data: '2025-05-01', prodottoId: 'urea', quantita: 10 }, F),   // altro anno
  Object.assign({ id: 'o5', tipo: 'Diserbo', campoId: 'n1', data: '2026-05-10', prodottoId: 'fito', quantita: 5 }, F),           // non conta
  Object.assign({ id: 'o6', tipo: 'Concimazione', campoId: 'n2', data: '2026-02-01', prodottoId: 'letame', quantita: 100 }, F), // N 500, eff 200
  Object.assign({ id: 'o7', tipo: 'Concimazione', campoId: 'n2', data: '2026-03-01', prodottoId: 'urea', quantita: 10 }, F),    // N 460
  Object.assign({ id: 'o8', tipo: 'Concimazione', campoId: 'n3', data: '2026-03-01', prodottoId: 'npk', quantita: 50 }, F),     // N 10
  Object.assign({ id: 'o9', tipo: 'Concimazione', campoId: 'n4', data: '2026-03-01', prodottoId: 'npk', quantita: 50 }, F),
  Object.assign({ id: 'o10', tipo: 'Concimazione', campoId: 'n6', data: '2026-03-01', prodottoId: 'urea', quantita: 5 }, F),   // N 230
  Object.assign({ id: 'o11', tipo: 'Concimazione', campoId: 'n6', data: '2026-04-01', prodottoId: 'liq', quantita: 100 }, F),  // N 30
  Object.assign({ id: 'o12', tipo: 'Concimazione', campoId: 'n7', data: '2026-03-01', prodottoId: 'urea', quantita: 5 }, F),   // N 230
];
S.config = [];
const B = X.bilancioCampi(2026), R = id => B.find(r => r.id === id);
t('campi: tutti meno quello vuoto (7)', B.length === 7 && !R('n5'), B.map(r => r.id));
let r = R('n1');
// N1: o1 + o2 → N 1196, eff 746 → 74,6/ha su 280 = 0,266; zoo 900/10 = 90; P 31; K 121; 2 attività
t('Nord: N totale 1196, efficiente 74,6/ha', r.nTot === 1196 && r.nEffHa === 74.6, r);
t('Nord: da effluenti 90/ha, P 31, K 121', r.nZooHa === 90 && r.pHa === 31 && r.kHa === 121, r);
t('Nord: 2 attività (pianificata, altro anno e fitofarmaco fuori)', r.nOp === 2, r.nOp);
t('Nord: nel limite, quota 0,266', r.stato === 'Nel limite' && uguale(r.quota, 74.6 / 280, 0.0001), r);
r = R('n2');
// N2: 200 + 460 = 660 eff su 4 ha = 165/ha, MAS 180 + soia 0 = 180 → 0,917 → vicino
t('Sud: coltura con la seconda', r.coltura === 'Frumento tenero + Soia', r.coltura);
t('Sud: MAS 180 (frumento + soia 0)', r.mas === 180, r.mas);
t('Sud: 165/ha → vicino al limite', r.nEffHa === 165 && r.stato === 'Vicino al limite', r);
t('Sud: da effluenti 500/4 = 125/ha', r.nZooHa === 125, r.nZooHa);
r = R('n3');
t('Medica: MAS 0 con azoto → oltre il limite, quota vuota', r.mas === 0 && r.stato === 'Oltre il limite' && r.quota === null && r.nEffHa === 5, r);
r = R('n4');
t('Senza superficie: segnalato', r.stato === 'Manca la superficie' && r.coltura === '—' && r.ha === 0, r);
r = R('n6');
// 230 + 30 = 260 su 5 ha = 52/ha, nessun MAS per la patata
t('Patate: coltura senza limite, 52/ha', r.stato === 'Coltura senza limite' && r.mas === null && r.nEffHa === 52, r);
r = R('n7');
// 230 su 1 ha, MAS 210 → 1,095 → oltre
t('Loietto: 230 su 210 → oltre il limite', r.stato === 'Oltre il limite' && r.nEffHa === 230 && uguale(r.quota, 230 / 210, 0.0001), r);
r = R('n8');
// orzo 150 + sorgo 220 = 370, nessun apporto → nel limite, quota 0
t('Due colture: MAS sommato 370', r.mas === 370 && r.quota === 0 && r.stato === 'Nel limite', r);
t('anno senza attività né colture → vuoto', X.bilancioCampi(2024).length === 0, X.bilancioCampi(2024).map(r => r.id));

/* ---------------------------------------------------------------- */
sezione('4. Azoto della stalla');
S.capi = [
  { id: 'a1', sesso: 'F', nascita: '2020-01-01' }, { id: 'a2', sesso: 'F', nascita: '2020-01-01' }, { id: 'a3', sesso: 'F', nascita: '2020-01-01' },
  { id: 'a4', sesso: 'F', nascita: '2020-01-01' },   // in asciutta
  { id: 'a5', sesso: 'F', nascita: '2024-05-01' },   // manza (più di un anno)
  { id: 'a6', sesso: 'F', nascita: '2026-06-01' },   // vitella
  { id: 'a7', sesso: 'M', nascita: '2026-09-01' },   // vitello
  { id: 'a8', sesso: 'M', nascita: '2023-01-01' },   // maschio
  { id: 'a9', sesso: 'F', nascita: '2020-01-01' },   // uscita: non conta
];
S.eventi = [
  { id: 'e1', capoId: 'a1', tipo: 'Parto', data: '2025-10-01' }, { id: 'e2', capoId: 'a2', tipo: 'Parto', data: '2026-01-10' },
  { id: 'e3', capoId: 'a3', tipo: 'Parto', data: '2026-03-10' },
  { id: 'e4', capoId: 'a4', tipo: 'Parto', data: '2025-01-01' }, { id: 'e5', capoId: 'a4', tipo: 'Messa in asciutta', data: '2026-10-01' },
  { id: 'e6', capoId: 'a9', tipo: 'Parto', data: '2025-01-01' }, { id: 'e7', capoId: 'a9', tipo: 'Uscita', data: '2026-06-01' },
];
derive();
let st = X.azotoStalla(2026);
const capi = s => (st.righe.find(r => r.stato === s) || {}).capi;
t('capi per stato: 3 in lattazione, 1 per gli altri', capi('In lattazione') === 3 && capi('Asciutta') === 1 && capi('Manza') === 1 && capi('Vitella') === 1 && capi('Vitello') === 1 && capi('Maschio') === 1, st.righe);
t('l\'uscita non è contata', !st.righe.some(r => r.stato === 'Uscita'));
// 3×83 + 83 + 42 + 14 + 14 + 34 = 436 kg N
t('azoto prodotto 436 kg', st.prodotto === 436, st.prodotto);
// SAU = 10 + 4 + 2 + 0 + 3 + 5 + 1 + 2 = 27 ha → 436/27 = 16,148 kg/ha; limite ZVN 170 → 436/170 = 2,565 ha minimi
t('SAU 27 ha, carico 16,148 kg/ha', st.sau === 27 && uguale(st.carico, 436 / 27, 0.0001), st);
t('ZVN: limite 170, ettari minimi 2,565', st.limite === 170 && uguale(st.haMinimi, 436 / 170, 0.0001), st);
// effluenti distribuiti: liquame 900 (Nord) + letame 500 (Sud) = 1400 → 1400/27 = 51,85/ha
t('effluenti distribuiti 1400 kg, 51,85/ha', uguale(st.distribuito, 1400) && uguale(st.distribuitoHa, 1400 / 27, 0.0001), st);

/* ---------------------------------------------------------------- */
sezione('5. Valori cambiati dall\'utente');
S.config = [{ id: 'nitrati', zona: 'Ordinaria', capi: { 'In lattazione': 100 }, mas: { 'Mais da granella': 340 } }];
st = X.azotoStalla(2026);
// 3×100 + 83 + 42 + 14 + 14 + 34 = 487; zona ordinaria 340
t('vacca a 100 kg: prodotto 487, limite 340', st.prodotto === 487 && st.limite === 340 && st.zona === 'Ordinaria', st);
t('gli altri valori restano quelli di partenza', X.nitConfig().capi['Manza'] === 42 && X.nitConfig().mas['Orzo'] === 150);
r = X.bilancioCampi(2026).find(r => r.id === 'n1');
t('MAS del mais cambiato a 340 → quota 74,6/340', r.mas === 340 && uguale(r.quota, 74.6 / 340, 0.0001), r);
t('le colture della tabella dei valori non hanno doppioni', (() => { const c = X.coltureMas().map(s => s.toLowerCase()); return c.length === new Set(c).size && c.includes('mais da granella'); })());

fine('Azoto e nitrati');
