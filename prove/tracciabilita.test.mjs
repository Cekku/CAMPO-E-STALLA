// Prove della tracciabilità per il caseificio con dati INVENTATI (js/tracciabilita.js): numeri e date, DDT,
// righe delle fatture assegnate ai prodotti (parole di ricerca, vince chi ha più parole, righe tolte, non assegnate),
// registro degli approvvigionamenti (righe per DDT, kg, inizio e fine utilizzo, correzioni a mano, righe a mano),
// registro degli autoprodotti (annate, correzioni) e autoprodotti dalla campagna (daCampagna, proposte,
// aggiornamento automatico, righe tolte, dopo Annulla).
// I risultati attesi sono fatti a mano (scritti nei commenti), non copiati da quello che il codice restituisce.
// Uso: npm test   oppure   node --import ./prove/avvio.mjs prove/tracciabilita.test.mjs  (PROVE_TUTTE=1 per vedere anche quelle che passano)
import './avvio.mjs';
import { t, sezione, fine } from './aiuto.mjs';
const ROOT = new URL('../js', import.meta.url).href;
const { S } = await import(ROOT + '/state.js');
const store = await import(ROOT + '/store.js');   // è quello finto (prove/finti/store.mjs)
const T = await import(ROOT + '/tracciabilita.js');
const { COL, ID_AUTO } = T;
const J = x => JSON.stringify(x);
const ko = async f => { try { await f(); return false; } catch (e) { return true; } };

/* ---------------- 1. numeri, date, parole, DDT ---------------- */
sezione('1. Numeri, date, parole e DDT');
t('numIt "6.140" = 6140', T.numIt('6.140') === 6140);
t('numIt "12,5" = 12,5', T.numIt('12,5') === 12.5);
t('numIt "1.234,5" = 1234,5', T.numIt('1.234,5') === 1234.5);
t('numIt "25 kg" = 25', T.numIt('25 kg') === 25);
t('numIt vuoto e testo = null', T.numIt('') === null && T.numIt('abc') === null && T.numIt(null) === null);
t('dataL gg/mm/aaaa', T.dataL('2026-03-05') === '05/03/2026' && T.dataL('') === '' && T.dataL('5/3/26') === '');
t('paroleNome toglie le parole vuote', T.paroleNome('Farina di soia') === 'FARINA SOIA' && T.paroleNome('Mais e orzo per la stalla') === 'MAIS ORZO STALLA');
t('DDT "86 del 02-01-2025"', J(T.leggiDdt('86 del 02-01-2025', '2025-01-10')) === J({ num: '86', data: '2025-01-02' }));
t('DDT con anno a due cifre e barre', J(T.leggiDdt('12 del 3/2/26', '2026-02-10')) === J({ num: '12', data: '2026-02-03' }));
t('DDT con data AAAA-MM-GG', J(T.leggiDdt('A7 del 2026-04-01', '2026-04-10')) === J({ num: 'A7', data: '2026-04-01' }));
t('DDT senza data → data della fattura', J(T.leggiDdt('DDT 5', '2026-04-10')) === J({ num: 'DDT 5', data: '2026-04-10' }));
t('DDT vuoto → numero vuoto e data della fattura', J(T.leggiDdt('', '2026-04-10')) === J({ num: '', data: '2026-04-10' }));

/* ---------------- 2. fatture e prodotti ---------------- */
const riga = (descrizione, quantita, um, x = {}) => Object.assign({ descrizione, quantita, um, importo: 100, ddt: '', categoria: 'Mangimi' }, x);
const fatt = (id, data, numero, controparte, righe, x = {}) => Object.assign({ id, data, anno: +data.slice(0, 4), mese: +data.slice(5, 7), tipo: 'Acquisto', numero, controparte, tipoDoc: 'TD01', righe }, x);
const ROSSI = 'MANGIMI ROSSI SRL', BIANCHI = 'AGRI BIANCHI SNC';
const fatture = () => [
  fatt('f1', '2026-03-10', '101', ROSSI, [
    riga('FARINA DI ESTRAZIONE SOIA 44%', 6000, 'kg', { ddt: '50 del 05-03-2026' }),   // p1 (FARINA e SOIA)
    riga('FARINA SOIA', 20, 'q', { ddt: '50 del 05-03-2026' }),                         // p1, 20 q = 2000 kg, stesso DDT → 8000 kg
    riga('SOIA INTEGRALE FIOCCATA', 3, 't', { ddt: '51 del 05-03-2026' }),               // p2 (2 parole) batte p4 "SOIA" (1): 3000 kg
    riga('TRASPORTO', 1, '', { categoria: 'Servizi' }),                                   // niente: né prodotto né mangime
  ]),
  fatt('f2', '2026-04-20', '140', ROSSI, [
    riga('Farina soia decorticata', 5000, 'kg'),                                          // p1, senza DDT: "Fatt. 140" del 20/4
    riga('FARINA DI MAIS', 4000, 'kg', { ddt: '77 del 18-04-2026' }),                    // p3 (MAIS); p1 no (manca SOIA)
    riga('MANGIME VACCHE LATTE', 2000, 'kg', { ddt: '78 del 18-04-2026' }),              // non assegnata (mangime)
    riga('MANGIME VACCHE LATTE', 1000, 'kg', { ddt: '79 del 19-04-2026' }),              // non assegnata (mangime)
  ]),
  fatt('f3', '2026-05-01', 'NC1', ROSSI, [riga('FARINA SOIA', 500, 'kg')], { tipoDoc: 'TD04' }),   // nota di credito: fuori
  fatt('f4', '2026-06-01', '210', BIANCHI, [
    riga('FARINA SOIA', 1000, 'kg', { importo: -100 }),                                   // importo negativo: fuori
    riga('FARINA SOIA', 0, 'kg'),                                                          // quantità 0: fuori
    riga('FARINA SOIA 48', 1500, '', { ddt: '90 del 30-05-2026' }),                      // senza unità: kg con dubbio
  ]),
  fatt('f5', '2026-06-05', 'V1', 'CLIENTE VERDI', [riga('FARINA SOIA', 700, 'kg')], { tipo: 'Vendita' }),   // vendita: fuori
  fatt('f6', '2026-01-05', '5', ROSSI, [riga('FARINA SOIA', 999, 'kg', { ddt: '200 del 28-12-2025' })]),     // arrivo nel 2025
  fatt('f7', '2026-07-01', '300', ROSSI, [
    riga('FARINA SOIA', 2000, 'kg', { ddt: '95 del 01-07-2026' }),
    riga('FARINA SOIA SACCHI', 10, 'pz', { ddt: '95 del 01-07-2026' }),                  // pezzi: riga a parte, fuori dal totale in kg
  ]),
  fatt('f8', '2026-09-01', '400', BIANCHI, [
    riga('NU 3 MINERALE', 100, 'kg', { ddt: '1 del 01-09-2026' }),                       // p5 "NU 3": sigla e numero esatti
    riga('NU 35', 50, 'kg', { ddt: '1 del 01-09-2026', categoria: 'Integratori' }),     // 35 ≠ 3 → non assegnata (integratore)
    riga('NUCLEO 3', 70, 'kg', { ddt: '1 del 01-09-2026', categoria: 'Altro' }),        // NUCLEO ≠ NU → niente
  ]),
];
const prod = (id, nome, x = {}) => Object.assign({ id, tipo: 'prodotto', nome, parole: T.paroleNome(nome), silos: '', mod: {}, linee: {}, extra: [] }, x);
S.fatture = fatture();
S.econfig = [];
S[COL] = [
  prod('p1', 'Farina di soia', { silos: 'S1' }),
  prod('p2', 'Soia integrale', { parole: 'SOIA INTEGRALE, SOIA FIOCCATA' }),
  prod('p3', 'Mais'),
  prod('p4', 'Soia'),
  prod('p5', 'Nucleo', { parole: 'NU 3' }),
];
const P = id => T.prodotto(id);
const REG = (id, anno = 2026) => T.registro(P(id), anno);

sezione('2. Righe delle fatture assegnate ai prodotti');
{
  const A = T.assegna(2026);
  const ks = id => A.per.get(id).map(x => x.k).join(' ');
  t('p1 Farina di soia: f1:0 f1:1 f2:0 f4:2 f7:0 f7:1', ks('p1') === 'f1:0 f1:1 f2:0 f4:2 f7:0 f7:1', ks('p1'));
  t('p2 batte p4 con più parole', ks('p2') === 'f1:2' && ks('p4') === '', [ks('p2'), ks('p4')]);
  t('p3 Mais: f2:1', ks('p3') === 'f2:1', ks('p3'));
  t('p5 sigla e numero esatti: solo f8:0', ks('p5') === 'f8:0', ks('p5'));
  t('non assegnate: i due mangimi e l\'integratore (non trasporto né NUCLEO)', A.libere.map(x => x.k).join(' ') === 'f2:2 f2:3 f8:1', A.libere.map(x => x.k));
  t('stessa risposta dalla memoria', T.assegna(2026) === A);
  t('anno 2025: solo il DDT del 28/12/2025', T.assegna(2025).per.get('p1').map(x => x.k).join(' ') === 'f6:0');
  // collaboratore (non titolare): niente fatture
  Object.assign(store.sync, { mode: 'cloud', farm: { id: 'az' }, user: { id: 'u1' }, members: [{ user_id: 'u1', role: 'membro' }] });
  const B = T.assegna(2026);
  t('collaboratore: nessuna riga dalle fatture', [...B.per.values()].every(a => !a.length) && !B.libere.length);
  Object.assign(store.sync, { mode: 'local', farm: null, user: null, members: [] });
  t('titolare di nuovo: righe tornate', T.assegna(2026).per.get('p1').length === 6);
}

sezione('3. Registro degli approvvigionamenti');
{
  const R = REG('p1'); const r = R.righe;
  // a 5/3 DDT 50 8000 kg · b 20/4 Fatt. 140 5000 · c 30/5 DDT 90 1500 (dubbio) · d 1/7 DDT 95 2000 kg · e 1/7 DDT 95 10 pz
  t('5 righe', r.length === 5, r.length);
  t('N. progressivo', r.map(x => x.n).join() === '1,2,3,4,5');
  t('date di arrivo', r.map(x => x.data).join() === '2026-03-05,2026-04-20,2026-05-30,2026-07-01,2026-07-01', r.map(x => x.data));
  t('DDT', r.map(x => x.ddt).join() === '50,Fatt. 140,90,95,95', r.map(x => x.ddt));
  t('quantità: stesso DDT sommato, quintali e tonnellate in kg', r.map(x => x.qta).join() === '8000,5000,1500,2000,10', r.map(x => x.qta));
  t('unità: pezzi a parte', r.map(x => x.um).join() === 'kg,kg,kg,kg,pz', r.map(x => x.um));
  t('senza unità: dubbio solo sulla riga del 30/5', r.map(x => x.dubbio).join() === 'false,false,true,false,false');
  t('fornitore', r[0].fornitore === ROSSI && r[2].fornitore === BIANCHI);
  t('silos, conforme e accettato', r.every(x => x.silos === 'S1' && x.conforme === 'SI' && x.accettato === 'SI'));
  t('inizio = arrivo + 1 giorno', r.map(x => x.inizio).join() === '2026-03-06,2026-04-21,2026-05-31,2026-07-02,2026-07-02', r.map(x => x.inizio));
  t('fine = inizio dell\'arrivo dopo, l\'ultima vuota', r.map(x => x.fine).join() === '2026-04-21,2026-05-31,2026-07-02,2026-07-02,', r.map(x => x.fine));
  t('totale kg senza i pezzi: 16500', R.totKg === 16500, R.totKg);
  t('chiave della riga', r[1].key === 'MANGIMI ROSSI SRL|FATT. 140|2026-04-20' && r[4].key === 'MANGIMI ROSSI SRL|95|2026-07-01|pz', [r[1].key, r[4].key]);
  t('fatture e descrizioni della riga', J(r[0].fatture) === J(['101']) && r[0].descrizioni.length === 2 && J(r[0].linee) === J(['f1:0', 'f1:1']));
  const R3 = REG('p3');
  t('p3 una riga 18/4 4000 kg, fine vuota', R3.righe.length === 1 && R3.righe[0].qta === 4000 && R3.righe[0].fine === '' && R3.righe[0].silos === '');
  t('p4 vuoto', REG('p4').righe.length === 0 && REG('p4').totKg === 0);
  // in italiano i numeri di 4 cifre non hanno il punto delle migliaia (8000, ma 16.500)
  const H = T.paginaApprovvigionamenti(P('p1'), 2026, T.assegna(2026));
  t('pagina di stampa: data, quantità, prodotto, 11 righe vuote (16 − 5)', H.includes('05/03/2026') && H.includes('>8000<') && H.includes('10 pz') && H.includes('Farina di soia') && (H.match(/class="vuota"/g) || []).length === 11);
}

sezione('4. Correzioni a mano');
{
  const kA = 'MANGIMI ROSSI SRL|50|2026-03-05', kB = 'MANGIMI ROSSI SRL|FATT. 140|2026-04-20';
  await T.modifica('p1', kA, 'qta', '7.950');
  let r = REG('p1').righe;
  t('quantità corretta 7950', r[0].qta === 7950 && J(r[0].modificati) === J(['qta']) && r[0].valoriAuto.qta === 8000);
  t('correzione salvata in mod', J(P('p1').mod[kA]) === J({ qta: 7950 }));
  await T.modifica('p1', kA, 'qta', '8000');
  t('valore uguale a quello automatico: correzione tolta', !P('p1').mod[kA] && REG('p1').righe[0].qta === 8000);
  await T.modifica('p1', kB, 'inizio', '2026-04-25');
  r = REG('p1').righe;
  t('inizio cambiato e fine della riga prima che lo segue', r[1].inizio === '2026-04-25' && r[0].fine === '2026-04-25' && r[1].inizioAuto === '2026-04-21', [r[0].fine, r[1].inizio]);
  await T.modifica('p1', kB, 'fine', '2026-05-20');
  r = REG('p1').righe;
  t('fine corretta a mano', r[1].fine === '2026-05-20' && r[1].fineAuto === '2026-05-31');
  await T.modifica('p1', kB, 'silos', 'S2');
  t('silos della riga', REG('p1').righe[1].silos === 'S2' && REG('p1').righe[0].silos === 'S1');
  await T.ripristina('p1', kB);
  r = REG('p1').righe;
  t('ripristina: tutto come dalle fatture', r[1].inizio === '2026-04-21' && r[1].fine === '2026-05-31' && r[1].silos === 'S1' && !P('p1').mod[kB]);
  t('quantità non valida', await ko(() => T.modifica('p1', kA, 'qta', 'abc')));
  t('data non valida', await ko(() => T.modifica('p1', kA, 'data', '5/3/2026')));
  t('campo non valido', await ko(() => T.modifica('p1', kA, 'prezzo', '1')));
  // riga a mano: oggi (orologio fermo) è il 25/11/2026
  await T.aggiungiRiga('p1', 2026); await T.aggiungiRiga('p1', 2025);
  const ex = P('p1').extra;
  t('due righe a mano: oggi e 1/1/2025', ex.length === 2 && ex[0].data === '2026-11-25' && ex[1].data === '2025-01-01', ex);
  await T.modifica('p1', 'x:' + ex[0].id, 'qta', '1.200');
  await T.modifica('p1', 'x:' + ex[0].id, 'fornitore', 'VICINO ROSSI MARIO');
  const R = REG('p1'); r = R.righe;
  t('riga a mano in fondo (6 righe, quella del 2025 no)', r.length === 6 && r[5].extraId === ex[0].id && r[5].auto === false, r.length);
  t('riga a mano: 1200 kg, fornitore, inizio 26/11', r[5].qta === 1200 && r[5].fornitore === 'VICINO ROSSI MARIO' && r[5].inizio === '2026-11-26');
  t('la riga dei pezzi ora finisce il 26/11', r[4].fine === '2026-11-26', r[4].fine);
  t('totale kg 16500 + 1200 = 17700', R.totKg === 17700, R.totKg);
  await T.togliExtra('p1', ex[0].id);
  t('riga a mano tolta', REG('p1').righe.length === 5 && P('p1').extra.length === 1);
}

sezione('5. Non è questo prodotto, assegna a…');
{
  await T.togliLinee('p1', ['f1:0', 'f1:1']);
  let A = T.assegna(2026);
  t('righe tolte da p1', A.tolte.get('p1').map(x => x.k).join() === 'f1:0,f1:1' && REG('p1').righe[0].ddt === 'Fatt. 140');
  // tolte da p1, le prende il prodotto dopo che combacia: p4 "SOIA" (1 parola)
  t('le righe tolte vanno a p4 Soia', A.per.get('p4').map(x => x.k).join() === 'f1:0,f1:1' && A.libere.map(x => x.k).join(' ') === 'f2:2 f2:3 f8:1', [A.per.get('p4').map(x => x.k), A.libere.map(x => x.k)]);
  t('p4: una riga del DDT 50 da 8000 kg (6000 kg + 20 q)', REG('p4').righe.length === 1 && REG('p4').righe[0].qta === 8000 && REG('p4').righe[0].ddt === '50');
  const na = T.nonAssegnate(2026);
  // MANGIME VACCHE LATTE 2 volte, 2000 + 1000 = 3000 kg, ultima 19/4; NU 35 una volta 50 kg
  t('non assegnate raggruppate per descrizione', na.length === 2 && na[0].descrizione === 'MANGIME VACCHE LATTE' && na[0].volte === 2 && na[0].kg === 3000 && na[0].ultima === '2026-04-19' && J(na[0].fornitori) === J([ROSSI]) && na[1].kg === 50, na);
  await T.rimettiLinee('p1', ['f1:0', 'f1:1']);
  t('rimesse: di nuovo in p1', REG('p1').righe[0].qta === 8000 && !T.assegna(2026).tolte.get('p1').length);
  // assegnata a mano: linee[k] = true vince sulle parole
  S[COL] = S[COL].map(p => p.id === 'p4' ? Object.assign({}, p, { linee: { 'f2:2': true } }) : p);
  A = T.assegna(2026);
  t('riga assegnata a mano a p4', A.per.get('p4').map(x => x.k).join() === 'f2:2' && A.libere.map(x => x.k).join(' ') === 'f2:3 f8:1');
  S[COL] = S[COL].map(p => p.id === 'p4' ? Object.assign({}, p, { linee: {} }) : p);
  await T.assegnaDescrizione('p3', 'MANGIME VACCHE LATTE 18%');
  t('parole di ricerca: alternativa senza le parole con cifre', P('p3').parole === 'MAIS, MANGIME VACCHE LATTE', P('p3').parole);
  await T.assegnaDescrizione('p3', 'mangime vacche latte');
  t('la stessa alternativa non si doppia', P('p3').parole === 'MAIS, MANGIME VACCHE LATTE');
  const r = REG('p3').righe;
  t('p3: mais e i due mangimi (4000, 2000, 1000)', r.map(x => x.qta).join() === '4000,2000,1000' && r.map(x => x.ddt).join() === '77,78,79', r.map(x => [x.ddt, x.qta]));
  t('niente più mangimi non assegnati', T.nonAssegnate(2026).map(x => x.descrizione).join() === 'NU 35');
  t('descrizione senza parole da cercare', await ko(() => T.assegnaDescrizione('p3', '44 12')));
}

sezione('6. Prodotti');
{
  const id = await T.salvaProdotto({ nome: 'Fieno di prato', silos: 'Fienile' });
  t('prodotto nuovo con parole dal nome', P(id).parole === 'FIENO PRATO' && P(id).silos === 'Fienile' && id.startsWith('tr-p-'));
  t('nome doppio (anche con accenti e maiuscole)', await ko(() => T.salvaProdotto({ nome: 'FIENO DI PRATO' })));
  t('nome vuoto', await ko(() => T.salvaProdotto({ nome: '  ' })));
  t('prodotti in ordine di nome', T.prodotti().map(p => p.nome).join() === 'Farina di soia,Fieno di prato,Mais,Nucleo,Soia,Soia integrale');
  await T.eliminaProdotto(id);
  t('prodotto eliminato', !P(id));
}

/* ---------------- 7. registro degli autoprodotti ---------------- */
sezione('7. Registro degli autoprodotti');
const rec = righe => ({ id: ID_AUTO, tipo: 'autoprodotti', righe, tolte: [] });
const AP = (id, prodotto, data, x = {}) => Object.assign({ id, prodotto, data, qta: 10, conforme: 'SI', zona: 'Trincea', num: '', inizio: '', fine: '' }, x);
S[COL] = S[COL].filter(x => x.id !== ID_AUTO).concat([rec([
  AP('a1', 'Insilato mais', '2026-09-10'),
  AP('a2', 'Fieno', '2025-06-01'),                                   // anno prima, ancora in uso (fine vuota)
  AP('a3', 'Fieno vecchio', '2025-05-01', { fine: '2025-12-20' }),  // finito nel 2025: fuori
  AP('a4', 'Loietto', '2025-04-01', { fine: '2026-02-01' }),        // finito nel 2026: dentro
  AP('a5', 'Mais vecchio', '2024-08-01'),                            // due anni prima: fuori
  AP('a6', 'Erba medica', '2026-05-15', { origine: 'racc:2026:ERBA MEDICA|' }),
])]);
{
  const r = T.autoprodotti(2026);
  t('annata 2026: a4, a2, a6, a1 in ordine di data', r.map(x => x.id).join() === 'a4,a2,a6,a1' && r.map(x => x.n).join() === '1,2,3,4', r.map(x => x.id));
  t('tutte: 6', T.autoprodotti(2026, true).length === 6);
  await T.modificaAuto('a1', 'qta', '12,5');
  t('quantità all\'italiana', T.autoprodottiTutti().find(x => x.id === 'a1').qta === 12.5);
  await T.modificaAuto('a1', 'qta', 'xx');
  t('quantità non valida → 0', T.autoprodottiTutti().find(x => x.id === 'a1').qta === 0);
  t('data non valida', await ko(() => T.modificaAuto('a1', 'data', '1/2/2026')));
  t('campo non valido', await ko(() => T.modificaAuto('a1', 'prezzo', '3')));
  await T.modificaAuto('a6', 'zona', 'Silo 3'); await T.modificaAuto('a6', 'num', '7');
  t('riga dalla campagna: zona toccata, N. no (non si aggiorna da solo)', J(T.autoprodottiTutti().find(x => x.id === 'a6').toccati) === J(['zona']));
  await T.modificaAuto('a1', 'zona', 'Trincea 2');
  t('riga a mano: niente toccati', !T.autoprodottiTutti().find(x => x.id === 'a1').toccati);
  await T.togliAuto('a6');
  const R = S[COL].find(x => x.id === ID_AUTO);
  t('tolta una riga dalla campagna: origine fra le tolte', R.righe.length === 5 && J(R.tolte) === J(['racc:2026:ERBA MEDICA|']));
  await T.togliAuto('a1');
  t('tolta una riga a mano: tolte invariate', J(S[COL].find(x => x.id === ID_AUTO).tolte) === J(['racc:2026:ERBA MEDICA|']));
  const H = T.paginaAutoprodotti(2026);
  t('pagina di stampa: 2 righe e 14 vuote', H.includes('Loietto') && H.includes('01/06/2025') && (H.match(/class="vuota"/g) || []).length === 14);
}

/* ---------------- 8. autoprodotti dalla campagna ---------------- */
sezione('8. Autoprodotti dalla campagna');
S.campi = [
  { id: 'c1', nome: 'Campo A', colture: [{ anno: 2026, coltura: 'Mais' }] },
  { id: 'c2', nome: 'Campo B', colture: [{ anno: 2026, coltura: 'Mais' }] },
  { id: 'c3', nome: 'Campo C', colture: [{ anno: 2026, coltura: 'Frumento', destinazione: 'Vendita al consorzio' }] },
  { id: 'c4', nome: 'Campo D', colture: [{ anno: 2026, coltura: 'Loietto', secondo: { coltura: 'Sorgo', semina: '2026-06-01' } }] },
  { id: 'c5', nome: 'Campo E', colture: [{ anno: 2026, coltura: 'Erba medica' }] },
  { id: 'c6', nome: 'Campo F', colture: [{ anno: 2026, coltura: 'Orzo' }] },
];
S.silos = [{ id: 's1', nome: 'Trincea Nord' }, { id: 's2', nome: 'Silo 2' }];
const op = (id, tipo, campoId, data, raccolto, x = {}) => Object.assign({ id, tipo, campoId, data, raccolto, stato: 'Fatta', prodottoRaccolto: '' }, x);
const operazioni = () => [
  op('o1', 'Raccolta', 'c1', '2026-09-10', 50, { prodottoRaccolto: 'insilato' }),
  op('o2', 'Raccolta', 'c1', '2026-09-12', 10),                                          // senza prodotto: prende "insilato" del campo
  op('o3', 'Raccolta', 'c2', '2026-09-20', 40, { prodottoRaccolto: 'Insilato', dataFine: '2026-09-22' }),
  op('o4', 'Raccolta', 'c2', '2026-09-25', 5, { prodottoRaccolto: 'granella', stato: 'Pianificata' }),   // pianificata: fuori
  op('o5', 'Raccolta', 'c2', '2025-09-01', 99, { prodottoRaccolto: 'insilato' }),         // altro anno: fuori
  op('o6', 'Semina', 'c2', '2026-04-10', 1),                                              // non è una raccolta
  op('o7', 'Raccolta', 'c3', '2026-07-01', 30, { prodottoRaccolto: 'granella' }),         // coltura venduta: fuori
  op('o8', 'Sfalcio', 'c4', '2026-05-01', 8, { prodottoRaccolto: 'fieno' }),              // Loietto (prima della semina del sorgo)
  op('o9', 'Raccolta', 'c4', '2026-09-01', 12, { prodottoRaccolto: 'granella' }),         // Sorgo (seconda coltura)
  op('o10', 'Sfalcio', 'c5', '2026-06-10', 0),                                            // niente raccolto: fuori
  op('o11', 'Sfalcio', 'c5', '2026-07-10', 6),                                            // Erba medica senza prodotto
  op('o12', 'Raccolta', 'nessuno', '2026-08-01', 2, { prodottoRaccolto: 'Fieno di prato' }),   // senza campo: "Raccolto"
];
const pes = (id, campoId, data, netto, x = {}) => Object.assign({ id, campoId, data, netto, prodottoRaccolto: '', siloId: '', destinazione: '' }, x);
S.operazioni = operazioni();
S.carichi = [
  pes('k1', 'c1', '2026-09-10', 30000, { prodottoRaccolto: 'insilato', siloId: 's1' }),
  pes('k2', 'c1', '2026-09-11', 25000, { prodottoRaccolto: 'insilato', siloId: 's1' }),
  pes('k3', 'c1', '2026-09-12', 8000, { prodottoRaccolto: 'insilato', destinazione: 'Venduto a un vicino' }),   // venduta
  pes('k4', 'c3', '2026-07-01', 28000, { prodottoRaccolto: 'granella' }),                  // coltura venduta: fuori
  pes('k5', 'c4', '2026-09-01', 14000, { prodottoRaccolto: 'granella', siloId: 's2', destinazione: 'Essiccatoio' }),
  pes('k6', 'c6', '2026-06-20', 5000, { destinazione: 'cliente Rossi' }),                  // tutto venduto
  pes('k7', 'c1', '2025-09-10', 9000, { prodottoRaccolto: 'insilato', siloId: 's1' }),     // altro anno: fuori
];
const MAIS = 'racc:2026:MAIS|INSILATO', LOI = 'racc:2026:LOIETTO|FIENO', SOR = 'racc:2026:SORGO|GRANELLA',
  MED = 'racc:2026:ERBA MEDICA|', RAC = 'racc:2026:RACCOLTO|FIENO DI PRATO', ORZ = 'racc:2026:ORZO|';
const per = (calc, o) => calc.find(x => x.origine === o);
{
  const c = T.daCampagna(2026);
  t('6 righe (una per coltura e prodotto)', c.length === 6 && [MAIS, LOI, SOR, MED, RAC, ORZ].every(o => per(c, o)), c.map(x => x.origine));
  // Campo A: attività 50 + 10 = 60 t, pesate 30 + 25 + 8 = 63 t → 63 − 8 vendute = 55 t; Campo B: 40 t → 95 t = 950 q
  const m = per(c, MAIS);
  t('mais: 950 q, 80 q venduti', m.qta === 950 && m.venduto === 80, m);
  t('mais: nome, data dell\'ultimo giorno, zona del silo', m.prodotto === 'Mais – insilato' && m.data === '2026-09-22' && m.zona === 'Trincea Nord', m);
  const l = per(c, LOI), s = per(c, SOR);
  t('loietto (prima coltura): 80 q in trincea', l.qta === 80 && l.zona === 'Trincea' && l.prodotto === 'Loietto – fieno' && l.data === '2026-05-01', l);
  t('sorgo (seconda coltura): pesate 14 t > attività 12 t → 140 q nel silo 2', s.qta === 140 && s.zona === 'Silo 2' && s.venduto === 0, s);
  t('erba medica senza prodotto: 60 q', per(c, MED).qta === 60 && per(c, MED).prodotto === 'Erba medica');
  t('senza campo: Raccolto – fieno di prato 20 q', per(c, RAC).qta === 20 && per(c, RAC).prodotto === 'Raccolto – fieno di prato');
  t('orzo tutto venduto: 0 q, 50 venduti', per(c, ORZ).qta === 0 && per(c, ORZ).venduto === 50);
  t('frumento venduto: nessuna riga', !c.some(x => x.coltura === 'Frumento'));
  // 2025: i campi non hanno la coltura di quell'anno → "Raccolto"; Campo A pesata 9 t + Campo B attività 99 t = 1080 q
  t('2025: raccolto senza coltura dell annata, 1080 q', J(T.daCampagna(2025).map(x => [x.origine, x.qta])) === J([['racc:2025:RACCOLTO|INSILATO', 1080]]), T.daCampagna(2025));
}

sezione('9. Proposte e aggiornamento automatico');
{
  // registro: una riga a mano che nomina l'erba medica e una riga del vecchio pulsante per il loietto (senza "|")
  S[COL] = S[COL].filter(x => x.id !== ID_AUTO).concat([rec([
    AP('m1', 'Erba medica 1° taglio', '2026-06-12'),
    AP('v1', 'Loietto', '2026-05-01', { origine: 'racc:2026:LOIETTO', qta: 70 }),
  ])]);
  const pp = T.proposteRaccolte(2026).map(x => x.origine);
  t('proposte: mais, loietto, sorgo, raccolto (medica coperta, orzo a 0)', J(pp) === J([MAIS, LOI, SOR, RAC]), pp);
  let e = await T.aggiornaDaCampagna([2026]);
  t('primo giro: 4 nuove, 0 cambiate, tolta la riga vecchia', e.n === 5 && e.nuove === 4 && e.cambiate === 0 && e.tolte === 1, e);
  const tutte = () => T.autoprodottiTutti();
  const di = o => tutte().find(x => x.origine === o);
  t('righe dopo il giro: a mano + 4 dalla campagna', tutte().length === 5 && !tutte().some(x => x.origine === 'racc:2026:LOIETTO') && di(MAIS).qta === 950 && di(LOI).qta === 80);
  e = await T.aggiornaDaCampagna([2026]);
  t('secondo giro: niente da fare', e.n === 0, e);
  // correzione a mano della quantità; poi la raccolta di Campo B cambia (45 t, finita il 24/9)
  await T.modificaAuto(di(MAIS).id, 'qta', '900');
  S.operazioni = S.operazioni.map(o => o.id === 'o3' ? Object.assign({}, o, { raccolto: 45, dataFine: '2026-09-24' }) : o);
  e = await T.aggiornaDaCampagna([2026]);
  t('quantità corretta a mano resta, la data si aggiorna', e.cambiate === 1 && di(MAIS).qta === 900 && di(MAIS).data === '2026-09-24', di(MAIS));
  // riga tolta col cestino: non torna da sola
  await T.togliAuto(di(SOR).id);
  e = await T.aggiornaDaCampagna([2026]);
  t('riga tolta non torna', e.n === 0 && !di(SOR), e);
  // la raccolta senza campo viene cancellata: la riga non toccata se ne va
  S.operazioni = S.operazioni.filter(o => o.id !== 'o12');
  e = await T.aggiornaDaCampagna([2026]);
  t('raccolta cancellata: riga tolta', e.tolte === 1 && e.n === 1 && !di(RAC), e);
  // il pulsante rimette la riga tolta
  t('proposta: solo il sorgo tolto', J(T.proposteRaccolte(2026).map(x => x.origine)) === J([SOR]));
  t('aggiungiProposte: 1', await T.aggiungiProposte(2026) === 1 && di(SOR).qta === 140 && !(S[COL].find(x => x.id === ID_AUTO).tolte || []).includes(SOR));
  t('niente più da proporre', T.proposteRaccolte(2026).length === 0 && await T.aggiungiProposte(2026) === 0);
}
{
  // vecchia riga del loietto corretta a mano: la coltura è coperta e non si aggiunge niente
  S[COL] = S[COL].filter(x => x.id !== ID_AUTO).concat([rec([AP('v1', 'Loietto', '2026-05-01', { origine: 'racc:2026:LOIETTO', qta: 70, toccati: ['qta'] })])]);
  const e = await T.aggiornaDaCampagna([2026]);
  t('vecchia riga corretta: resta e il loietto non si doppia', e.nuove === 3 && T.autoprodottiTutti().some(x => x.origine === 'racc:2026:LOIETTO') && !T.autoprodottiTutti().some(x => x.origine === LOI), e);
}

sezione('10. Dopo Annulla nel diario');
{
  // prima dell'annullamento c'erano A (qta 100) e B; ora (rimesso lo stato di prima) c'è A con qta 80 e una riga a mano
  const A0 = AP('ra', 'Mais – insilato', '2026-09-22', { origine: MAIS, qta: 100 }), B0 = AP('rb', 'Sorgo – granella', '2026-09-01', { origine: SOR });
  S[COL] = S[COL].filter(x => x.id !== ID_AUTO).concat([rec([Object.assign({}, A0, { qta: 80 }), AP('rm', 'Fieno a mano', '2026-06-01')])]);
  await T.dopoAnnulla([{ c: 'altra', id: 'x' }]);
  t('annullamento di un\'altra raccolta: niente', !T.autoprodottiTutti().some(x => x.toccati));
  await T.dopoAnnulla([{ c: COL, id: ID_AUTO, rec: { righe: [A0, B0] } }]);
  const R = S[COL].find(x => x.id === ID_AUTO);
  t('la riga che l\'annullamento ha tolto va fra le tolte', J(R.tolte) === J([SOR]), R.tolte);
  t('il valore rimesso diventa correzione a mano', J(R.righe.find(x => x.id === 'ra').toccati) === J(['qta']));
  t('riga a mano senza toccati', !R.righe.find(x => x.id === 'rm').toccati);
}

fine('tracciabilita');
