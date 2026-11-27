// Prove del magazzino con dati INVENTATI: giacenze con gli inventari (js/domain.js: derive, giac, giacAl, segnoMov),
// scarico automatico delle razioni e avviso "sta per finire" (js/razauto.js: daScaricare, scaricaRazioni, previsione)
// e avvisi del magazzino di allAlerts (giacenza negativa, scorta bassa).
// I risultati attesi sono fatti a mano (scritti nei commenti), non copiati da quello che il codice restituisce.
// Il riconoscimento delle righe delle fatture ha le sue prove in strumenti/prove-magazzino/prove.mjs.
// Uso: npm test   oppure   node --import ./prove/avvio.mjs prove/magazzino.test.mjs  (PROVE_TUTTE=1 per vedere anche quelle che passano)
import './avvio.mjs';
import { t, sezione, uguale, fine } from './aiuto.mjs';
const ROOT = new URL('../js', import.meta.url).href;
const { S } = await import(ROOT + '/state.js');
const D = await import(ROOT + '/domain.js');
const R = await import(ROOT + '/razauto.js');
const { derive, giac, giacAl, segnoMov, kgUnita, razioneInfo, allAlerts } = D;

// Oggi (orologio fermo di avvio.mjs) è il 25/11/2026.
const P = (id, nome, unita, giacenzaIniziale, x = {}) => Object.assign({ id, nome, unita, giacenzaIniziale, categoria: 'Alimento' }, x);
const mov = (id, prodottoId, tipo, quantita, data, x = {}) => Object.assign({ id, prodottoId, tipo, quantita, data }, x);
const prodotti = () => [
  P('fieno', 'Fieno', 'q', 50, { scortaMin: 20 }),
  P('mais', 'Farina di mais', 'kg', 1000),
  P('mais2', 'Mais in granella', 'kg', 0),
  P('soia', 'Soia', 't', 2, { scortaMin: 1.9 }),
  P('paglia', 'Paglia', 'kg', 50),
  P('insilato', 'Insilato', 'kg', 10),
  P('sale', 'Sale', 'kg', 0),
  P('orzo', 'Orzo', 'kg', 150),
  P('avena', 'Avena', 'kg', 0),
  P('minerali', 'Minerali', 'kg', 5, { scortaMin: 10 }),
  P('liquame', 'Liquame', 'm³', 0, { categoria: 'Effluente' }),
];
const movimenti = () => [
  // fieno, senza inventari: 50 + 10 − 5 = 55 q
  mov('f1', 'fieno', 'Carico', 10, '2026-11-01'),
  mov('f2', 'fieno', 'Scarico', 5, '2026-11-10'),
  // mais con inventario. Ordine: senza data prima (1000 + 300 = 1300), +500 = 1800 (1/11), −200 = 1600 (5/11),
  // inventario del 5/11 a fine giornata: contati 1250 → differenza −350, poi −100 (10/11) = 1150
  mov('m4', 'mais', 'Scarico', 100, '2026-11-10'),
  mov('m3', 'mais', 'Inventario', 1250, '2026-11-05'),
  mov('m2', 'mais', 'Scarico', 200, '2026-11-05'),
  mov('m1', 'mais', 'Carico', 500, '2026-11-01'),
  mov('m0', 'mais', 'Carico', 300, ''),
  // mais2: due inventari lo stesso giorno, vale l'ultimo registrato (creato); il carico dello stesso giorno viene prima.
  // 0 + 10 = 10, inventario 40 (differenza +30), inventario 30 (differenza −10) → 30
  mov('i2', 'mais2', 'Inventario', 30, '2026-11-20', { creato: '2026-11-20T09:00:00Z' }),
  mov('i1', 'mais2', 'Inventario', 40, '2026-11-20', { creato: '2026-11-20T08:00:00Z' }),
  mov('i0', 'mais2', 'Carico', 10, '2026-11-20'),
  // avena: solo uno scarico → −3 (giacenza negativa)
  mov('a1', 'avena', 'Scarico', 3, '2026-11-15'),
  // liquame negativo: è un effluente, nessun avviso
  mov('l1', 'liquame', 'Scarico', 8, '2026-11-15'),
  // prodotto che non c'è: non conta
  mov('x1', 'sparito', 'Carico', 99, '2026-11-15'),
];
const capi = () => [
  { id: 'c1', sesso: 'F', nascita: '2020-03-01', gruppo: 'Asciutte' },
  { id: 'c2', sesso: 'F', nascita: '2021-04-01', gruppo: 'Asciutte' },
  { id: 'c3', sesso: 'F', nascita: '2019-05-01', gruppo: 'Asciutte' },   // uscita: non conta nel gruppo
  { id: 'c4', sesso: 'F', nascita: '2020-06-01', gruppo: 'Lattazione' },
];
// Razione delle vacche in lattazione, 20 capi scritti. Al giorno: fieno 10 × 20 = 200 kg = 2 q; mais 9 × 20 = 180 kg;
// soia 1,5 × 20 = 30 kg = 0,03 t; paglia 20 kg; insilato 20 kg; sale 0,1 × 20 = 2 kg; orzo 20 kg (7 alimenti). Prodotto che non c'è e kg 0: saltati.
const R1 = (x = {}) => Object.assign({ id: 'R1', nome: 'Lattazione', capi: 20, ingredienti: [
  { prodottoId: 'fieno', kg: 10 }, { prodottoId: 'mais', kg: 9 }, { prodottoId: 'soia', kg: 1.5 }, { prodottoId: 'paglia', kg: 1 },
  { prodottoId: 'insilato', kg: 1 }, { prodottoId: 'sale', kg: 0.1 }, { prodottoId: 'orzo', kg: 1 }, { prodottoId: 'nessuno', kg: 2 }, { prodottoId: 'mais2', kg: 0 },
] }, x);

function azienda() {
  S.prodotti = prodotti(); S.movimenti = movimenti(); S.capi = capi();
  S.eventi = [{ id: 'e1', capoId: 'c3', tipo: 'Uscita', data: '2026-10-01' }];
  S.razioni = []; S.silos = [{ id: 's1', nome: 'Trincea', prodottoId: 'insilato' }];
  S.latte = []; S.mezzi = []; S.operatori = []; S.manutenzioni = []; S.operazioni = [];
  derive();
}
const pr = id => S.prodotti.find(p => p.id === id);

/* ---------------------------------------------------------------- */
sezione('1. Unità e giacenze');
azienda();
t('kgUnita: t 1000, q 100, kg 1, senza prodotto 1', kgUnita(pr('soia')) === 1000 && kgUnita(pr('fieno')) === 100 && kgUnita(pr('mais')) === 1 && kgUnita(null) === 1);
t('fieno senza inventari: 55 q', uguale(giac(pr('fieno')), 55), giac(pr('fieno')));
t('mais con inventario: 1150 kg', uguale(giac(pr('mais')), 1150), giac(pr('mais')));
t('due inventari lo stesso giorno: vale l\'ultimo registrato (30)', uguale(giac(pr('mais2')), 30), giac(pr('mais2')));
t('avena: −3', uguale(giac(pr('avena')), -3));
t('soia senza movimenti: la giacenza iniziale (2 t)', uguale(giac(pr('soia')), 2));
t('differenza dell\'inventario del mais: −350', uguale(segnoMov(S.movimenti.find(m => m.id === 'm3')), -350), segnoMov(S.movimenti.find(m => m.id === 'm3')));
t('differenze dei due inventari: +30 e −10', uguale(segnoMov(S.movimenti.find(m => m.id === 'i1')), 30) && uguale(segnoMov(S.movimenti.find(m => m.id === 'i2')), -10));
t('segno di carico e scarico: +500 e −200', segnoMov(S.movimenti.find(m => m.id === 'm1')) === 500 && segnoMov(S.movimenti.find(m => m.id === 'm2')) === -200);

sezione('2. Giacenza a una data');
t('mais al 4/11: 1800 (prima dell\'inventario)', uguale(giacAl(pr('mais'), '2026-11-04'), 1800), giacAl(pr('mais'), '2026-11-04'));
t('mais al 5/11: 1250 (l\'inventario vale a fine giornata)', uguale(giacAl(pr('mais'), '2026-11-05'), 1250), giacAl(pr('mais'), '2026-11-05'));
t('mais al 1/10: 1300 (conta solo il carico senza data)', uguale(giacAl(pr('mais'), '2026-10-01'), 1300), giacAl(pr('mais'), '2026-10-01'));
t('mais senza data limite: come la giacenza (1150)', uguale(giacAl(pr('mais')), 1150));
t('fieno al 9/11: 60', uguale(giacAl(pr('fieno'), '2026-11-09'), 60));
t('mais2 al 19/11: 0', uguale(giacAl(pr('mais2'), '2026-11-19'), 0));

/* ---------------------------------------------------------------- */
sezione('3. Capi di una razione e scarichi da fare');
let i = razioneInfo({ id: 'R3', nome: 'Asciutte', gruppo: 'Asciutte', ingredienti: [{ prodottoId: 'fieno', kg: 5 }] });
t('razione di gruppo: 2 capi (la vacca uscita non conta)', i.capi === 2, i.capi);
t('razione di gruppo: fieno 5 × 2 = 10 kg al giorno', uguale(i.ing[0].kgTot, 10));
let x = R.daScaricare(R1({ autoDal: '2026-11-23' }));
// 23, 24 e 25/11 × 7 alimenti = 21 righe
t('dal 23/11 senza giorno fatto: 21 scarichi (3 giorni × 7 alimenti)', x.rows.length === 21 && x.fino === '2026-11-25', x.rows.length);
let r = x.rows.find(r => r.id === 'rz-R1-fieno-2026-11-25');
t('fieno del 25/11: 2 q, Scarico, automatico, con la razione', r && r.col === 'movimenti' && uguale(r.data.quantita, 2) && r.data.tipo === 'Scarico' && r.data.auto === true && r.data.razioneId === 'R1' && r.data.data === '2026-11-25', r);
r = x.rows.find(r => r.id === 'rz-R1-soia-2026-11-23');
t('soia del 23/11: 0,03 t', r && uguale(r.data.quantita, 0.03, 1e-9), r && r.data);
r = x.rows.find(r => r.id === 'rz-R1-mais-2026-11-24');
t('mais del 24/11: 180 kg', r && uguale(r.data.quantita, 180));
t('niente righe per il prodotto che non c\'è e per kg 0', !x.rows.some(r => /nessuno|mais2/.test(r.id)));
t('la nota dice i capi', /20 capi/.test(x.rows[0].data.note));
x = R.daScaricare(R1({ autoDal: '2026-11-23', autoFino: '2026-11-24' }));
t('giorno fatto il 24/11: solo il 25/11 (7 righe)', x.rows.length === 7 && x.rows.every(r => r.data.data === '2026-11-25'), x.rows.length);
x = R.daScaricare(R1({ autoDal: '2026-11-23', autoFino: '2026-11-25' }));
t('già fatto oggi: niente', x.rows.length === 0 && x.fino === null);
x = R.daScaricare(R1({ autoDal: '2026-11-26' }));
t('partenza domani: niente', x.rows.length === 0 && x.fino === null);
x = R.daScaricare(R1({}));
t('senza "scarico automatico dal": niente', x.rows.length === 0 && x.fino === null);
x = R.daScaricare(R1({ autoDal: '2026-09-01' }));
// al massimo 31 giorni: dal 26/10 al 25/11 → 31 × 7 = 217
t('partenza lontana: al massimo 31 giorni (dal 26/10, 217 righe)', x.rows.length === 217 && x.rows.map(r => r.data.data).sort()[0] === '2026-10-26', x.rows.length);
x = R.daScaricare(R1({ autoDal: '2026-11-25', autoFino: '2026-11-10' }));
t('giorno fatto prima della partenza: si parte dalla partenza', x.rows.length === 7 && x.rows.every(r => r.data.data === '2026-11-25'));
S.movimenti = [...movimenti(), mov('man', 'fieno', 'Scarico', 2, '2026-11-24', { razioneId: 'R1' })];
x = R.daScaricare(R1({ autoDal: '2026-11-24' }));
// il fieno del 24/11 è già scaricato a mano con la razione: 14 − 1 = 13
t('giorno già scaricato a mano per un alimento: saltato solo quello (13)', x.rows.length === 13 && !x.rows.some(r => r.id === 'rz-R1-fieno-2026-11-24'), x.rows.length);

sezione('4. Scarico delle razioni registrato');
azienda();
S.movimenti = [...movimenti(), mov('man', 'fieno', 'Scarico', 2, '2026-11-24', { razioneId: 'R1' })];
S.razioni = [R1({ autoDal: '2026-11-24' }), { id: 'R9', nome: 'Futura', capi: 5, autoDal: '2026-12-01', ingredienti: [{ prodottoId: 'fieno', kg: 1 }] }];
let n = await R.scaricaRazioni();
t('13 movimenti scritti', n === 13, n);
t('la razione ricorda il giorno fatto (25/11)', S.razioni.find(r => r.id === 'R1').autoFino === '2026-11-25');
t('la razione che parte dopo resta senza giorno fatto', !S.razioni.find(r => r.id === 'R9').autoFino);
n = await R.scaricaRazioni();
t('il secondo giro non scrive niente', n === 0 && S.movimenti.filter(m => m.auto).length === 13, n);
derive();
// fieno 55 − 2 (a mano il 24/11) − 2 (automatico il 25/11) = 51; mais 1150 − 180 × 2 = 790
t('fieno dopo gli scarichi: 51 q', uguale(giac(pr('fieno')), 51), giac(pr('fieno')));
t('mais dopo gli scarichi: 790 kg', uguale(giac(pr('mais')), 790), giac(pr('mais')));

/* ---------------------------------------------------------------- */
sezione('5. Quanto dura e avvisi');
azienda();
S.razioni = [R1(), { id: 'R3', nome: 'Asciutte', gruppo: 'Asciutte', ingredienti: [{ prodottoId: 'fieno', kg: 5 }] }];
let v = R.previsione(pr('fieno'));
// fieno: 200 + 10 = 210 kg = 2,1 q al giorno; 55 / 2,1 = 26,19 giorni; scorta 20: (55 − 20) / 2,1 = 16,67
t('fieno: 2,1 q al giorno da due razioni', v && uguale(v.cons, 2.1) && uguale(v.kgGiorno, 210) && v.raz.length === 2, v);
t('fieno: 26,19 giorni, alla scorta minima 16,67', v && uguale(v.giorni, 55 / 2.1) && uguale(v.giorniMin, 35 / 2.1), v);
t('fieno: senza scarico automatico', v && v.auto === false);
v = R.previsione(pr('mais'));
t('mais: 1150 / 180 = 6,39 giorni, senza scorta minima', v && uguale(v.giorni, 1150 / 180) && v.giorniMin === null, v);
v = R.previsione(pr('soia'));
// 2 t / 0,03 = 66,7 giorni; (2 − 1,9) / 0,03 = 3,33
t('soia: 66,7 giorni, alla scorta minima 3,33', v && uguale(v.giorni, 2 / 0.03, 0.01) && uguale(v.giorniMin, 0.1 / 0.03, 0.01), v);
v = R.previsione(pr('sale'));
t('sale finito: 0 giorni', v && v.giorni === 0);
t('prodotto senza razioni: nessuna previsione', R.previsione(pr('avena')) === null && R.previsione(null) === null);
t('giorni scritti: meno di un giorno, 1 giorno, 6 giorni', R.giorniTxt(0.5) === 'meno di un giorno' && R.giorniTxt(1.9) === '1 giorno' && R.giorniTxt(6.39) === '6 giorni');

const av = allAlerts().filter(a => a.area === 'magazzino');
const di = (k, nome) => av.filter(a => a.t === k + nome);
t('mais: "Sta per finire", giallo, circa 6 giorni', di('Sta per finire: ', 'Farina di mais').length === 1 && di('Sta per finire: ', 'Farina di mais')[0].lv === 'warn' && /circa 6 giorni/.test(di('Sta per finire: ', 'Farina di mais')[0].s), av.map(a => a.t));
// paglia: 50 / 20 = 2,5 giorni → rosso
t('paglia: "Sta per finire", rosso, circa 2 giorni', di('Sta per finire: ', 'Paglia').length === 1 && di('Sta per finire: ', 'Paglia')[0].lv === 'bad' && /circa 2 giorni/.test(di('Sta per finire: ', 'Paglia')[0].s));
t('soia: "Scorta minima vicina" fra circa 3 giorni', di('Scorta minima vicina: ', 'Soia').length === 1 && /fra circa 3 giorni/.test(di('Scorta minima vicina: ', 'Soia')[0].s));
t('fieno (26 giorni): nessun avviso', !av.some(a => /Fieno/.test(a.t)), av.map(a => a.t));
t('insilato del silo (0,5 giorni): nessun avviso del magazzino', !av.some(a => /Insilato/.test(a.t)));
// orzo: 150 / 20 = 7,5 giorni, appena sopra la soglia di 7
t('orzo (7,5 giorni): nessun avviso', !av.some(a => /Orzo/.test(a.t)));
t('sale finito (giacenza 0): nessun avviso', !av.some(a => /Sale/.test(a.t)));
t('avena −3: "Giacenza negativa", rosso', av.some(a => a.t === 'Giacenza negativa: Avena' && a.lv === 'bad'));
t('minerali 5 con scorta 10: "Scorta bassa"', av.some(a => a.t === 'Scorta bassa: Minerali' && a.lv === 'warn'));
t('effluente negativo: nessun avviso', !av.some(a => /Liquame/.test(a.t)));
t('ogni avviso apre il prodotto', av.every(a => a.go && a.go.type === 'prodotto' && pr(a.go.id)));
t('in tutto 5 avvisi del magazzino', av.length === 5, av.map(a => a.t));

fine('Magazzino');
