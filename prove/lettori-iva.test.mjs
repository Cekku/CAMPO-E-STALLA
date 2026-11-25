// Prove del lettore della dichiarazione IVA (js/conti/iva-parse.js: leggiIvaPdf, leggiTelematico,
// leggiDichiarazioneIva, riepilogoIva) con documenti FINTI: PDF del modello IVA 2026 (periodo 2025) e file
// telematico. Gli importi sono inventati e tornano fra loro (conti in genera.mjs):
//   VE24 120.000 / 12.000, VE26 12.000, VE50 120.000; VF9 40.000 / 8.800, VF25 45.000, VF27 8.800, VF29 10.000,
//   VF71 8.800; VL1 12.000, VL2 8.800, VL3 3.200; VX1 3.200.
// Uso: npm test   oppure   node --import ./prove/avvio.mjs prove/lettori-iva.test.mjs   (PROVE_TUTTE=1 per tutte)
import './avvio.mjs';
import { t, sezione, fine } from './aiuto.mjs';
import { documento, modulo } from './lettori.mjs';
import { Pagina, creaPdf } from './documenti/pdf.mjs';
const IV = await modulo('conti/iva-parse.js');

const ATTESI = { 'VE24:1': 120000, 'VE24:2': 12000, 'VE26:1': 12000, 'VE50:1': 120000, 'VF9:1': 40000, 'VF9:2': 8800, 'VF25:1': 45000, 'VF27:1': 8800, 'VF29:1': 10000, 'VF71:1': 8800, 'VL1:1': 12000, 'VL2:1': 8800, 'VL3:1': 3200, 'VX1:1': 3200 };
const diversi = v => Object.entries(ATTESI).filter(([k, x]) => v[k] !== x).map(([k]) => `${k}=${v[k]}`);
// riepilogo atteso: acquisti imponibili = VF1..VF13 + VF21..VF23 − VF24 = 40.000; esenti = VF25 − 40.000 = 5.000
function provaRiepilogo(nome, valori) {
  const r = IV.riepilogoIva(valori);
  const v = r.voci;
  t(`${nome}: voci del riepilogo`, v.ve_imp === 120000 && v.ve_iva === 12000 && v.ve50 === 120000 && v.vf_imp === 40000 && v.vf_amm === 10000 && v.vf_esenti === 5000 && v.vf_iva === 8800 && v.vl1 === 12000 && v.vl2 === 8800 && v.vx1 === 3200 && v.ve_agr === null, v);
  // VE50 = VE24; VL1 = VE26 + VJ19; VL2 = VF71; VL3 − VL4 = VL1 − VL2 (3.200); VE26 = VE24 col. 2
  t(`${nome}: cinque controlli di quadratura OK, nessun rigo essenziale mancante`, r.controlli.length === 5 && r.controlli.every(c => c.esito === 'OK'), r.controlli);
}

/* ---------------------------------------------------------------- */
sezione('1. PDF del modello');
const pdf = await IV.leggiIvaPdf(documento('dichiarazione-iva.pdf'));
t("anno dal \"periodo d'imposta 2025\"", pdf.anno === 2025 && pdf.tipo === 'PDF', pdf.anno);
t('tutti i righi attesi con il valore giusto', !diversi(pdf.valori).length, diversi(pdf.valori));
t('aliquota stampata davanti agli importi scartata (VE21 e VF9)', pdf.valori['VE21:1'] === 120000 && pdf.valori['VE21:2'] === 12000 && !('VE21:3' in pdf.valori) && !('VF9:3' in pdf.valori), pdf.valori);
t('numeri delle colonne piccoli usati per la colonna 2 (VE24)', pdf.valori['VE24:2'] === 12000, pdf.valori);
t('codice del rigo scritto in due pezzi ("VE" "24", "VL" "2") rimesso insieme', 'VE24:1' in pdf.valori && 'VL2:1' in pdf.valori);
t('numeri della descrizione ("righi da 20 a 23") non presi come importi', !Object.values(pdf.valori).some(x => x === 20 || x === 23), pdf.valori);
t('VL1 diverso sulla pagina 2: vale il primo, con l\'avviso', pdf.valori['VL1:1'] === 12000 && pdf.avvisi.length === 1 && /VL1 col\.1: trovati valori diversi \(12000, 12500\) nelle pagine 1, 2/.test(pdf.avvisi[0]), pdf.avvisi);
provaRiepilogo('PDF', pdf.valori);

sezione('2. File telematico');
const tel = IV.leggiTelematico(new TextDecoder('windows-1252').decode(documento('iva-telematico.txt')));
t('anno dal record A ("IVA26" = periodo 2025)', tel.anno === 2025 && tel.tipo === 'Telematico' && !tel.avvisi.length, [tel.anno, tel.avvisi]);
t('tutti i righi attesi con il valore giusto', !diversi(tel.valori).length, diversi(tel.valori));
t('VF9 in due moduli sommato: 30.000 + 10.000 e 6.600 + 2.200', tel.valori['VF9:1'] === 40000 && tel.valori['VF9:2'] === 8800);
t('campi spostati letti cercando il codice (VJ19 = 0)', tel.valori['VJ19:1'] === 0, tel.valori);
t('record Z ignorato (niente 999.999 in VE24)', tel.valori['VE24:1'] === 120000);
provaRiepilogo('telematico', tel.valori);

sezione('3. Scelta del lettore e file che non vanno');
let d = await IV.leggiDichiarazioneIva('iva.pdf', documento('dichiarazione-iva.pdf'));
t('leggiDichiarazioneIva: il PDF va al lettore del PDF', d.tipo === 'PDF' && d.valori['VE50:1'] === 120000);
d = await IV.leggiDichiarazioneIva('iva.txt', documento('iva-telematico.txt'));
t('leggiDichiarazioneIva: il testo va al telematico', d.tipo === 'Telematico' && d.valori['VL3:1'] === 3200);
d = IV.leggiTelematico('A               IVA26\r\nB  un file qualsiasi senza quadri\r\n');
t('testo senza quadri V..: avviso', !Object.keys(d.valori).length && /non sembra un telematico/.test(d.avvisi[0]), d.avvisi);
d = await IV.leggiIvaPdf(creaPdf([new Pagina()]));
t('PDF senza testo: avviso della scansione', /non contiene testo/.test(d.avvisi[0]) && !Object.keys(d.valori).length, d.avvisi);
t('numeri all\'italiana del lettore: 1.234,56 / 1,234.56 / 150- / testo', IV.num('1.234,56') === 1234.56 && IV.num('1,234.56') === 1234.56 && IV.num('150-') === -150 && IV.num('abc') === null);

fine('lettori-iva');
