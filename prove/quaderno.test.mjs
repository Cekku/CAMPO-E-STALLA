// Prove del quaderno di campagna (js/registro.js e statoRegistro di js/agenda.js) con dati INVENTATI:
// codici EPPO, superficie trattata, righe del registro (solo fitofarmaci, niente concime in botte, niente pianificati),
// completezza dei dati richiesti, controllo dell'annata (1.81.0) e file dati JSON.
// I risultati attesi sono fatti a mano (scritti nei commenti), non copiati da quello che il codice restituisce.
// Uso: npm test   oppure   node --import ./prove/avvio.mjs prove/quaderno.test.mjs  (PROVE_TUTTE=1 per vedere anche quelle che passano)
import './avvio.mjs';
import { t, sezione, fine } from './aiuto.mjs';
const ROOT = new URL('../js', import.meta.url).href;
const { S } = await import(ROOT + '/state.js');
const R = await import(ROOT + '/registro.js');
const { statoRegistro } = await import(ROOT + '/agenda.js');
const { derive } = await import(ROOT + '/domain.js');

/* ---------------------------------------------------------------- */
sezione('1. Codici EPPO e superficie trattata');
t('mais con altre parole → ZEAMX', R.eppoDi('Mais da granella') === 'ZEAMX', R.eppoDi('Mais da granella'));
// "frumento duro" va cercato prima di "frumento"
t('frumento duro → TRZDU', R.eppoDi('Frumento duro') === 'TRZDU', R.eppoDi('Frumento duro'));
t('frumento tenero → TRZAX', R.eppoDi('Frumento tenero') === 'TRZAX', R.eppoDi('Frumento tenero'));
t('prato polifita senza codice', R.eppoDi('Prato polifita') === '', R.eppoDi('Prato polifita'));
t('coltura vuota senza codice', R.eppoDi('') === '' && R.eppoDi(null) === '');
const campo10 = { superficie: 10 };
t('parte del campo: 3 su 10 ha → 3', R.haTrattati({ haTrattati: 3 }, campo10) === 3, R.haTrattati({ haTrattati: 3 }, campo10));
t('più del campo: 12 su 10 ha → tutto il campo (10)', R.haTrattati({ haTrattati: 12 }, campo10) === 10, R.haTrattati({ haTrattati: 12 }, campo10));
t('non scritta → tutto il campo (10)', R.haTrattati({}, campo10) === 10);
t('negativa → tutto il campo (10)', R.haTrattati({ haTrattati: -1 }, campo10) === 10);

/* ---------------------------------------------------------------- */
// Azienda finta: due campi, tre prodotti, un operatore. Oggi (orologio fermo di avvio.mjs) è il 25/11/2026.
S.config = [{ id: 'azienda', nome: 'Azienda di prova' }];
S.campi = [
  { id: 'c1', nome: 'Campo Nord', superficie: 10, colture: [{ anno: 2026, coltura: 'Mais' }] },
  { id: 'c2', nome: 'Campo Sud', superficie: 5, colture: [{ anno: 2026, coltura: 'Prato polifita' }] },
];
S.prodotti = [
  { id: 'p1', nome: 'Erbicida A', categoria: 'Fitofarmaco', nReg: '12345', unita: 'l', carenza: 30, scadenzaAut: '2030-01-01' },
  { id: 'p2', nome: 'Insetticida B', categoria: 'Fitofarmaco', nReg: '', unita: 'l', scadenzaAut: '2026-03-01' },
  { id: 'p3', nome: 'Concime C', categoria: 'Concime', unita: 'kg' },
];
S.operatori = [{ id: 'op1', nome: 'Operatore Uno', patentino: 'PAT-1', scadenzaPatentino: '2030-01-01' }];
S.mezzi = []; S.movimenti = [];
const pieno = { bbch: '14', avversita: 'infestanti', operatore: 'Operatore Uno', stato: 'Fatto' };
S.operazioni = [
  // t1: tutto in ordine (2 l/ha × 10 ha = 20 l); la raccolta del 20/09 è dopo la carenza (dal 10/06)
  Object.assign({ id: 't1', tipo: 'Diserbo', campoId: 'c1', data: '2026-05-10', prodottoId: 'p1', dose: 2, quantita: 20 }, pieno),
  // t2: superficie scritta 12 ha su un campo di 10; 2 l/ha × 10 ha = 20 l ma scritto 30 (+50%); mancano BBCH e avversità
  { id: 't2', tipo: 'Trattamento fitosanitario', campoId: 'c1', data: '2026-06-15', prodottoId: 'p1', dose: 2, quantita: 30, haTrattati: 12, operatore: 'Operatore Uno', stato: 'Fatto' },
  // t4: stesso campo, prodotto e giorno di t2 → doppione
  Object.assign({ id: 't4', tipo: 'Trattamento fitosanitario', campoId: 'c1', data: '2026-06-15', prodottoId: 'p1', dose: 2, quantita: 20 }, pieno),
  // t3: autorizzazione scaduta il 01/03, prodotto senza n. reg., prato senza codice EPPO; il concime in botte non va nel registro
  Object.assign({ id: 't3', tipo: 'Trattamento fitosanitario', campoId: 'c2', data: '2026-04-01', prodottoId: 'p2', dose: 1, quantita: 5, altriProdotti: [{ prodottoId: 'p3', quantita: 100 }] }, pieno),
  // t7: carenza 30 giorni → raccolta dal 01/09 (01/08 + 31), raccolto il 20/08 → errore; prato senza EPPO
  Object.assign({ id: 't7', tipo: 'Trattamento fitosanitario', campoId: 'c2', data: '2026-08-01', prodottoId: 'p1', dose: 2, quantita: 10 }, pieno),
  // t8: segnato fatto il 10/12, dopo oggi
  Object.assign({ id: 't8', tipo: 'Trattamento fitosanitario', campoId: 'c1', data: '2026-12-10', prodottoId: 'p1', dose: 2, quantita: 20 }, pieno),
  // fuori dal registro 2026: pianificato, dell'anno prima, concimazione
  Object.assign({ id: 't5', tipo: 'Trattamento fitosanitario', campoId: 'c1', data: '2026-07-01', prodottoId: 'p1', dose: 2, quantita: 20 }, pieno, { stato: 'Pianificata' }),
  Object.assign({ id: 't6', tipo: 'Trattamento fitosanitario', campoId: 'c1', data: '2025-07-01', prodottoId: 'p1', dose: 2, quantita: 20 }, pieno),
  { id: 'k1', tipo: 'Concimazione', campoId: 'c1', data: '2026-03-01', prodottoId: 'p3', quantita: 500, stato: 'Fatto' },
  // raccolte
  { id: 'r1', tipo: 'Raccolta', campoId: 'c1', data: '2026-09-20', stato: 'Fatto', chiude: 'No' },
  { id: 'r2', tipo: 'Raccolta', campoId: 'c2', data: '2026-08-20', stato: 'Fatto', chiude: 'No' },
];

/* ---------------------------------------------------------------- */
sezione('2. Righe del registro');
const rr = R.righeTrattamenti(2026), ids = rr.map(r => r.o.id).sort().join(',');
// 6 trattamenti fatti del 2026 (t1 t2 t3 t4 t7 t8), una riga ciascuno: il concime di t3 non conta
t('6 righe: t1 t2 t3 t4 t7 t8', ids === 't1,t2,t3,t4,t7,t8', ids);
const r2 = rr.find(r => r.o.id === 't2'), r7 = rr.find(r => r.o.id === 't7');
t('t2: 12 ha scritti su 10 → 10 ha', r2.ha === 10 && r2.haCampo === 10, [r2.ha, r2.haCampo]);
t('t2: mais → ZEAMX', r2.eppo === 'ZEAMX' && r2.coltura === 'Mais', [r2.coltura, r2.eppo]);
t('t7: raccolta consentita dal 01/09', r7.raccoltaDal === '2026-09-01' && r7.car === 30, [r7.raccoltaDal, r7.car]);
t('2025: solo t6', R.righeTrattamenti(2025).map(r => r.o.id).join(',') === 't6');

/* ---------------------------------------------------------------- */
sezione('3. Completezza');
const st = statoRegistro(2026);
// t2 manca BBCH e avversità, t3 il numero di registrazione: 4 su 6 completi
t('4 completi su 6', st.tot === 6 && st.ok === 4, [st.tot, st.ok]);
const m2 = (st.inc.find(x => x.r.o.id === 't2') || {}).manca || [], m3 = (st.inc.find(x => x.r.o.id === 't3') || {}).manca || [];
t('t2: mancano fase e avversità', m2.join('|') === 'fase (BBCH)|avversità', m2);
t('t3: manca il n. di registrazione', m3.join('|') === 'n. registrazione', m3);

/* ---------------------------------------------------------------- */
sezione("4. Controllo dell'annata");
const pp = R.controlloAnno(2026);
const di = (tipo, id) => pp.filter(x => x.tipo === tipo && (!id || x.id === id));
// attesi a mano: superficie t2, quantità t2, autorizzazione t3, EPPO una volta per il prato (t3, il primo), carenza t7, futuro t8, un doppione fra t2 e t4 = 7
t('7 errori in tutto', pp.length === 7, pp.map(x => x.tipo + ':' + x.id));
t('superficie più grande del campo su t2', di('superficie', 't2').length === 1 && di('superficie').length === 1);
t('dose e quantità che non tornano solo su t2', di('quantita', 't2').length === 1 && di('quantita').length === 1);
t('autorizzazione scaduta su t3', di('autorizzazione', 't3').length === 1 && di('autorizzazione').length === 1);
t('coltura senza EPPO: un avviso solo per il prato', di('eppo').length === 1 && di('eppo')[0].id === 't3', di('eppo'));
t('prima gli errori veri, EPPO in fondo', pp[0].tipo === 'carenza' && pp[pp.length - 1].tipo === 'eppo', pp.map(x => x.tipo));
t('raccolta prima della carenza su t7', di('carenza', 't7').length === 1 && di('carenza').length === 1);
t('data nel futuro su t8', di('futuro', 't8').length === 1 && di('futuro').length === 1);
t('un solo doppione, fra t2 e t4', di('doppione').length === 1 && ['t2', 't4'].includes(di('doppione')[0].id), di('doppione'));
t('t1 senza errori', !pp.some(x => x.id === 't1'));
const tc = (di('carenza')[0] || {}).testo || '';
t('testo con il nome del campo e la data', tc.includes('Campo Sud') && tc.includes('01/09/26'), tc);
// quantità entro il 15%: 2 l/ha × 10 ha = 20, scritto 22 (+10%) → nessun errore
S.operazioni.find(o => o.id === 't4').quantita = 22;
t('quantità +10% non è un errore', !R.controlloAnno(2026).some(x => x.tipo === 'quantita' && x.id === 't4'));
S.operazioni.find(o => o.id === 't4').quantita = 20;
t('annata senza trattamenti: nessun errore', R.controlloAnno(2024).length === 0);
// superficie 10,05 su un campo di 10 (+0,5%, dentro il margine dell'1%) → nessun errore; 10,2 (+2%) sì
const o1 = S.operazioni.find(o => o.id === 't1');
o1.haTrattati = 10.05; t('superficie +0,5%: nessun errore', !R.controlloAnno(2026).some(x => x.tipo === 'superficie' && x.id === 't1'));
o1.haTrattati = 10.2; t('superficie +2%: errore', R.controlloAnno(2026).some(x => x.tipo === 'superficie' && x.id === 't1'));
// tre prodotti in botte con superficie sbagliata: l'errore della superficie esce una volta sola
o1.altriProdotti = [{ prodottoId: 'p1', dose: 2, quantita: 20.4 }, { prodottoId: 'p1', dose: 2, quantita: 20.4 }]; o1.quantita = 20.4;
t('più prodotti: superficie una volta sola', R.controlloAnno(2026).filter(x => x.tipo === 'superficie' && x.id === 't1').length === 1);
delete o1.haTrattati; delete o1.altriProdotti; o1.quantita = 20;
// sfalcio del prato il 25/08 su c2 dopo t7 (raccolta dal 01/09) conta come raccolta; il taglio dei fossi no
S.operazioni = S.operazioni.filter(o => o.id !== 'r2').concat([{ id: 's1', tipo: 'Sfalcio', sottotipo: 'Fossi', campoId: 'c2', data: '2026-08-25', stato: 'Fatto' }]);
t('taglio dei fossi: non è una raccolta', !R.controlloAnno(2026).some(x => x.tipo === 'carenza'));
S.operazioni.find(o => o.id === 's1').sottotipo = '';
t('sfalcio prima della carenza: errore', R.controlloAnno(2026).some(x => x.tipo === 'carenza' && x.id === 't7' && x.testo.includes('sfalcio il 25/08/26')), R.controlloAnno(2026).filter(x => x.tipo === 'carenza'));

/* ---------------------------------------------------------------- */
sezione('5. File dati e stampa');
const J = R.registroJSON(2026);
t('JSON versione 2, norma, 6 trattamenti', J.versione === 2 && J.norma === 'Reg. (UE) 2023/564' && J.trattamenti.length === 6, [J.versione, J.trattamenti.length]);
const j2 = J.trattamenti.find(x => x.data === '2026-06-15' && x.quantita === 30), j3 = J.trattamenti.find(x => x.data === '2026-04-01');
t('JSON t2: 10 ha, EPPO ZEAMX, n. reg.', j2 && j2.superficie_ha === 10 && j2.superficie_appezzamento_ha === 10 && j2.codice_eppo === 'ZEAMX' && j2.numero_registrazione === '12345', j2);
t('JSON t3: senza EPPO (null), dose 1', j3 && j3.codice_eppo === null && j3.dose_ha === 1 && j3.prodotto === 'Insetticida B', j3);
t('JSON: azienda', J.azienda.nome === 'Azienda di prova' && J.annata === 2026);
derive();   // giacenze del magazzino per la sezione 6 della stampa
const H = R.registroHTML(2026);
t('stampa: titolo e codice EPPO', H.includes('<title>Quaderno di campagna 2026</title>') && H.includes('(ZEAMX)'));
// il concime in botte di t3 sta solo nelle concimazioni/altre sezioni, non nel registro dei fitofarmaci (sezione 2)
const sez2 = H.slice(H.indexOf('2. Registro dei trattamenti'), H.indexOf('3. Concimazioni'));
t('stampa: concime fuori dal registro dei fitofarmaci', !sez2.includes('Concime C') && sez2.includes('Insetticida B'));

fine('Quaderno di campagna');
