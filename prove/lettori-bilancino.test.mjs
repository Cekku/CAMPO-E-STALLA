// Prove del lettore del bilancino del commercialista (js/conti/bilancino-parse.js: leggiBilancino, interpreta,
// abbina, ripartisci, controlli) con un bilancino FINTO al 31/12/2025 (prove/documenti/bilancino.pdf).
// Le righe del conto economico sono quelle del modello Excel (ROW in js/conti/schema.js). Conti in genera.mjs:
//   ricavi 300.000 + 20.000 + 8.000 = 328.000; costi 80.000 + 6.000 + 4.000 + 1.500 + 1.200 − 500 = 92.200;
//   utile 235.800.
// Uso: npm test   oppure   node --import ./prove/avvio.mjs prove/lettori-bilancino.test.mjs   (PROVE_TUTTE=1 per tutte)
import './avvio.mjs';
import { t, sezione, fine } from './aiuto.mjs';
import { documento, modulo } from './lettori.mjs';
const BL = await modulo('conti/bilancino-parse.js');

const conto = (b, k) => b.conti.find(c => c.chiave === k) || {};

/* ---------------------------------------------------------------- */
sezione('1. Lettura e ripartizione nel conto economico');
const b = await BL.leggiBilancino(documento('bilancino.pdf'));
t('anno dalla situazione al 31/12/2025 e ditta', b.anno === 2025 && b.ditta === 'AZIENDA AGRICOLA FINTA S.S.' && b.blocchi.length === 1, [b.anno, b.ditta, b.blocchi]);
t('10 conti letti (6 di costo e 3 di ricavo, uno diviso in due dettagli)', b.dati.conti.length === 9 && b.conti.length === 10, b.dati.conti.map(c => c.conto));
const latte = b.dati.conti.find(c => c.conto === '58/50/001');
t('colonne %, periodo e progressivo dalla riga di intestazione', latte.valori.perc === 91.46 && latte.valori.periodo === 300000 && latte.valori.progressivo === 300000 && latte.descrizione === 'VENDITA LATTE', latte);
t('importo col meno in coda: resi −500,00', b.dati.conti.find(c => c.conto === '66/99/030').valori.progressivo === -500);
t('parola chiave: VENDITA LATTE → riga 8', conto(b, '58/50/001').riga === 8 && conto(b, '58/50/001').criterio === "parola chiave 'LATTE'", conto(b, '58/50/001'));
t('codice del conto: 58/52/001 → riga 10, 66/54/001 → 30, 68/05/325 → 47', conto(b, '58/52/001').riga === 10 && conto(b, '66/54/001').riga === 30 && conto(b, '68/05/325').riga === 47 && conto(b, '66/54/001').criterio === 'codice conto');
t('dettagli che fanno il totale: vitelli → 9, contributi → 21', conto(b, '58/99/001|VENDITA VITELLI').riga === 9 && conto(b, '58/99/001|VENDITA VITELLI').importo === 5000 && conto(b, '58/99/001|CONTRIBUTI PSR').riga === 21 && conto(b, '58/99/001|CONTRIBUTI PSR').importo === 3000, b.conti.filter(c => c.conto === '58/99/001'));
t('senza parole chiave: acquisti (66) → 37, altri costi → 50', conto(b, '66/99/020').riga === 37 && conto(b, '66/99/020').criterio === 'predefinito acquisti' && conto(b, '70/99/001').riga === 50 && conto(b, '70/99/001').criterio === 'predefinito sezione');
// riga 30 = mangimi 80.000 − resi 500 = 79.500
const atteso = { 8: 300000, 9: 5000, 10: 20000, 21: 3000, 30: 79500, 32: 6000, 37: 4000, 47: 1200, 50: 1500 };
const pr = b.perRiga;
t('somme per riga del conto economico', Object.keys(pr).length === Object.keys(atteso).length && Object.entries(atteso).every(([k, v]) => pr[k] === v), pr);
t('controlli: somme dei ricavi e dei costi, utile fiscale e utile IRAP', b.controlli.length === 4 && b.controlli.every(c => c.esito === 'OK') && b.controlli[0].a === 328000 && b.controlli[1].a === 92200 && b.controlli[3].b === 235800, b.controlli);

sezione('2. Scelte del titolare e controlli che non tornano');
const s = await BL.leggiBilancino(documento('bilancino.pdf'), { '66/99/020': 36, '58/99/001|CONTRIBUTI PSR': 20 });
t('voce scelta per un conto: 66/99/020 → 36 "scelto da te"', conto(s, '66/99/020').riga === 36 && conto(s, '66/99/020').criterio === 'scelto da te' && s.perRiga[36] === 4000 && !(37 in s.perRiga), s.perRiga);
t('voce scelta per un solo dettaglio: contributi → 20, vitelli resta 9', conto(s, '58/99/001|CONTRIBUTI PSR').riga === 20 && s.perRiga[20] === 3000 && s.perRiga[9] === 5000 && !(21 in s.perRiga), s.perRiga);
// totale dei costi stampato sbagliato di 100 €: il controllo deve dare DIFFERENZA
const dati = structuredClone(b.dati);
dati.blocchi[0].totali.COSTI.progressivo = 92300;
const c = BL.controlli(dati);
t('totale dei costi che non torna: DIFFERENZA', c.find(x => /COSTI/.test(x.d)).esito === 'DIFFERENZA' && c.find(x => /RICAVI/.test(x.d)).esito === 'OK', c);
t('abbina senza sezione nota: non abbinato', BL.abbina({ conto: '99/99/999', descrizione: 'VOCE', sezione: 'ALTRO' })[1] === 'non abbinato');

fine('lettori-bilancino');
