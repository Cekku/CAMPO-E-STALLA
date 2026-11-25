// Prove dei lettori della banca con documenti FINTI: contabili di bonifico (js/conti/bonifici-parse.js: leggiBonifici,
// pareBonifico) ed estratti conto (js/conti/banca.js: leggiEstrattoPdf, movimentiDaParole, arricchisci, pulisciIban,
// pareEstratto). IBAN di esempio delle guide bancarie, nomi inventati. Conti fatti a mano qui e in genera.mjs.
// Uso: npm test   oppure   node --import ./prove/avvio.mjs prove/lettori-banca.test.mjs   (PROVE_TUTTE=1 per tutte)
import './avvio.mjs';
import { t, sezione, fine } from './aiuto.mjs';
import { documento, modulo } from './lettori.mjs';
import { Pagina, creaPdf } from './documenti/pdf.mjs';
const BP = await modulo('conti/bonifici-parse.js');
const B = await modulo('conti/banca.js');
const PT = await modulo('conti/pdftext.js');

const IBAN = 'IT60X0542811101000000123456';
const testo = async nome => (await PT.leggiPdf(documento(nome))).map(PT.testoPagina).join('\n');
const errore = async fn => { try { await fn(); return ''; } catch (e) { return e.message; } };

/* ---------------------------------------------------------------- */
sezione('1. Contabili di bonifico (distinta con tre disposizioni)');
const bon = await BP.leggiBonifici(documento('bonifici.pdf'));
t('tre bonifici, ognuno con l\'ordinante della distinta', bon.length === 3 && bon.every(b => b.ordinante === 'AZIENDA AGRICOLA FINTA S.S.'), bon.length);
const [b1, b2, b3] = bon;
t('1: beneficiario, IBAN, importo 1.180,20', b1.beneficiario === 'ROSSI MARIO' && b1.iban === IBAN && b1.importo === 1180.2, b1);
t('1: data della distinta (27/11/2025) e causale', b1.data === '2025-11-27' && b1.causale === 'STIPENDIO MESE DI NOVEMBRE 2025 ROSSI MARIO', [b1.data, b1.causale]);
t('1: causale bancaria SALA, identificativo e stato', b1.causaleBancaria === 'SALA' && b1.id === '0000123456789012' && b1.stato === 'Eseguito', [b1.causaleBancaria, b1.id, b1.stato]);
t('1: stipendio di novembre 2025 dalla causale', b1.stipendio === true && b1.comp === '2025-11', [b1.stipendio, b1.comp]);
t('2: data sua (28/11) al posto di quella della distinta, CRO', b2.beneficiario === 'VERDI LUIGI' && b2.data === '2025-11-28' && b2.id === 'ABCDEF123456' && b2.importo === 1199, b2);
// "acconto stipendio novembre" senza anno, pagato il 28/11/2025: novembre 2025 (l'unico possibile)
t('2: mese senza anno preso dalla data del pagamento', b2.stipendio === true && b2.comp === '2025-11', b2.comp);
t('3: pagamento di una fattura, non uno stipendio', b3.beneficiario === 'MANGIMI FINTI SRL' && b3.importo === 1181.6 && b3.stipendio === false && b3.comp === '' && b3.data === '2025-11-27', b3);
t('pareBonifico: la contabile è una contabile', BP.pareBonifico(await testo('bonifici.pdf')));
t('pareBonifico: un testo che parla di una fattura no (anche con bonifico, beneficiario, IBAN e importo)', !BP.pareBonifico('Fattura n. 12 - pagamento con bonifico al beneficiario MANGIMI FINTI SRL IBAN ' + IBAN + ' importo 100,00'));
let e = await errore(() => BP.leggiBonifici(creaPdf([new Pagina().t(40, 40, 'Contabile di bonifico').t(40, 60, 'Beneficiario ROSSI MARIO')])));
t('contabile senza importo: errore', /non ho trovato beneficiario e importo/.test(e), e);

sezione('2. Estratto conto con le colonne DARE e AVERE');
const ec = await B.leggiEstrattoPdf(documento('estratto-conto.pdf'));
t('quattro movimenti, il saldo finale scartato', ec.length === 4 && !ec.some(m => /SALDO/.test(m.descrizione)), ec.map(m => m.descrizione));
const [m1, m2, m3, m4] = ec;
t('1: uscita −1.180,20 del 03/11 (colonna DARE)', m1.data === '2025-11-03' && m1.valuta === '2025-11-03' && m1.importo === -1180.2, m1);
t('1: descrizione su tre righe unita', m1.descrizione === `BONIFICO A FAVORE DI ROSSI MARIO IBAN ${IBAN} RICON. STIPENDIO NOVEMBRE 2025`, m1.descrizione);
t('1: beneficiario, IBAN e causale ricavati', m1.controparte === 'ROSSI MARIO' && m1.beneficiario === 'ROSSI MARIO' && m1.iban === IBAN && m1.causale === 'STIPENDIO NOVEMBRE 2025' && m1.tipoOp === 'bonifico', [m1.controparte, m1.iban, m1.causale]);
t('2: entrata +12.345,67 (colonna AVERE) con ordinante e causale', m2.importo === 12345.67 && m2.controparte === 'CASEIFICIO FINTO SPA' && m2.beneficiario === '' && m2.causale === 'LATTE OTTOBRE 2025', m2);
t('3: imposta di bollo = spesa della banca, senza beneficiario', m3.importo === -2.5 && m3.tipoOp === 'spese bancarie' && m3.beneficiario === '', m3);
t('4: addebito diretto con valuta diversa e creditore', m4.data === '2025-11-15' && m4.valuta === '2025-11-14' && m4.importo === -350 && m4.tipoOp === 'addebito diretto' && m4.controparte === 'FINTA ENERGIA SPA', m4);
t('pareEstratto riconosce l\'estratto', B.pareEstratto(await testo('estratto-conto.pdf')));

sezione('3. Lista movimenti con una sola colonna IMPORTO e il segno davanti');
const lm = await B.leggiEstrattoPdf(documento('lista-movimenti.pdf'));
t('tre movimenti, il saldo senza descrizione scartato', lm.length === 3, lm);
t('segno "-" staccato davanti all\'importo: uscita', lm[0].importo === -1180.2 && lm[0].controparte === 'ROSSI MARIO' && lm[0].causale === 'STIPENDIO NOVEMBRE 2025', lm[0]);
t('segno "+" attaccato: entrata; "-" attaccato: uscita', lm[1].importo === 12345.67 && lm[2].importo === -2.5 && lm[2].tipoOp === 'spese bancarie', [lm[1].importo, lm[2].importo]);
t('descrizioni giuste anche senza spazi fra un movimento e l\'altro', lm[1].descrizione === 'BONIFICO DA CASEIFICIO FINTO SPA' && lm[2].descrizione === 'COMMISSIONI TENUTA CONTO', lm.map(m => m.descrizione));
t('pareEstratto riconosce la lista (saldo contabile, DATA MOV. VALUTA IMPORTO)', B.pareEstratto(await testo('lista-movimenti.pdf')));
t('pareEstratto: una fattura non è un estratto', !B.pareEstratto(await testo('fattura-ade.pdf')));

sezione('4. Movimenti dalle parole della lettura ottica (senza intestazione delle colonne)');
const w = (text, x0, x1, top) => ({ text, x0, x1, top });
const pg = { width: 595, height: 842, words: [
  w('|12/11/2025', 40, 76, 100), w('12/11/2025', 90, 126, 100), w('100,00', 180, 200, 100), w('PAGAMENTO', 320, 360, 100), w('POS', 363, 375, 100), w('BAR', 378, 392, 100), w('FINTO', 395, 415, 100),
  w('13/11/2025', 40, 76, 115), w('13/11/2025', 90, 126, 115), w('50,00', 265, 285, 115), w('VERSAMENTO', 320, 365, 115), w('CONTANTI', 368, 400, 115),
  w('14/11/2025', 40, 76, 130), w('14/11/2025', 90, 126, 130), w('=', 255, 259, 130), w('20,00', 265, 285, 130), w('PRELIEVO', 320, 352, 130), w('BANCOMAT', 355, 395, 130),
  w('15/11/2025', 40, 76, 145), w('15/11/2025', 90, 126, 145), w('1.000,00', 170, 200, 145), w('BONIFICO A FAVORE DI VERDI LUIGI', 320, 450, 145), w('RICON. ACCONTO NOVEMBRE', 320, 420, 154),
  w('30/11/2025', 40, 76, 175), w('30/11/2025', 90, 126, 175), w('1.234,56', 255, 285, 175), w('SALDO', 320, 345, 175), w('FINALE', 348, 375, 175),
] };
const mo = B.movimentiDaParole([pg]);
// colonne a x ≈ 190 (sinistra = uscite) e ≈ 275 (destra = entrate): distanza 85 > 40
t('quattro movimenti, saldo scartato, "|" della lettura ottica tolto', mo.length === 4 && mo[0].data === '2025-11-12', mo);
t('uscita dalla colonna di sinistra, entrata da quella di destra', mo[0].importo === -100 && mo[1].importo === 50, [mo[0].importo, mo[1].importo]);
t('segno "=" letto al posto del meno: uscita anche nella colonna di destra', mo[2].importo === -20, mo[2]);
t('descrizione su due righe', mo[3].importo === -1000 && mo[3].descrizione === 'BONIFICO A FAVORE DI VERDI LUIGI RICON. ACCONTO NOVEMBRE', mo[3]);

sezione('5. IBAN letti male dalla lettura ottica');
t('"1T" all\'inizio diventa "IT"', B.pulisciIban('1T60X0542811101000000123456') === IBAN);
t('CIN letto come "$" o come cifra: rimesso con il controllo mod-97', B.pulisciIban('IT60$0542811101000000123456') === IBAN && B.pulisciIban('IT6050542811101000000123456') === IBAN);
t('minuscole e spazi tolti', B.pulisciIban('it60 x054 2811 1010 0000 0123 456') === IBAN);
t('IBAN sbagliato non si inventa: resta com\'era', B.pulisciIban('IT61X0542811101000000123456') === 'IT61X0542811101000000123456');

fine('lettori-banca');
