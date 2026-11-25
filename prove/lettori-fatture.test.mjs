// Prove del lettore delle fatture (js/conti/fatture-parse.js) con documenti FINTI di prove/documenti/ (creati da
// genera.mjs, dove ci sono anche i conti fatti a mano): PDF nella visualizzazione dell'Agenzia, stampa del
// gestionale, prospetto del latte, XML FatturaPA (note di credito, ritenute, lotti, ISO-8859-1), P7M.
// I risultati attesi sono scritti a mano qui sotto, non copiati da quello che il lettore restituisce.
// Uso: npm test   oppure   node --import ./prove/avvio.mjs prove/lettori-fatture.test.mjs   (PROVE_TUTTE=1 per tutte)
import './avvio.mjs';
import { t, sezione, fine, uguale } from './aiuto.mjs';
import { documento, modulo } from './lettori.mjs';
import { Pagina, creaPdf } from './documenti/pdf.mjs';
const FP = await modulo('conti/fatture-parse.js');
const RG = await modulo('conti/regole.js');

const errore = async fn => { try { await fn(); return ''; } catch (e) { return e.message; } };
const riga = (r, o) => Object.entries(o).every(([k, v]) => typeof v === 'number' ? uguale(r[k], v) : r[k] === v);

/* ---------------------------------------------------------------- */
sezione("1. PDF della visualizzazione dell'Agenzia: fattura di acquisto");
let [f] = await FP.leggiFatturaPdf(documento('fattura-ade.pdf'));
t('fornitore e partita IVA (senza IT davanti)', f.fornitore === 'MANGIMI FINTI SRL' && f.pivaFornitore === '01234567890', f);
t('cliente con la denominazione su due righe', f.cliente === 'AZIENDA AGRICOLA FINTA S.S.' && f.pivaCliente === '09876543210', f.cliente);
t('tipo, numero e data del documento', f.tipoDoc === 'TD01' && f.numero === '123/A' && f.data === '2025-03-10', [f.tipoDoc, f.numero, f.data]);
t('tre righe lette', f.righe.length === 3, f.righe);
// riga 1: MAN01, 1.000 kg × 0,45 = 450,00 al 22%, descrizione che continua sulla riga sotto, DDT 45 del 05/03
t('riga 1: codice, quantità, unità, prezzo, importo, aliquota', riga(f.righe[0], { codice: 'MAN01', quantita: 1000, um: 'KG', prezzo: 0.45, importo: 450, aliquota: '22,00' }), f.righe[0]);
t('riga 1: la descrizione continua sulla riga sotto', f.righe[0].descrizione === 'MANGIME VACCHE IN LATTAZIONE CONFEZIONE SACCHI DA 25 KG', f.righe[0].descrizione);
t('riga 1: DDT letto dalla riga sopra', f.righe[0].ddt === '45 del 05-03-2025', f.righe[0].ddt);
// riga 2: 10 kg × 60,00 con sconto del 10% = 540,00 al 10%
t('riga 2: sconto in percentuale e aliquota 10', riga(f.righe[1], { codice: 'SEM02', quantita: 10, prezzo: 60, sconto: '10%', aliquota: '10,00', importo: 540 }), f.righe[1]);
t('riga 3 senza codice: trasporto 30,00', riga(f.righe[2], { codice: '', descrizione: 'SPESE DI TRASPORTO', importo: 30, um: '' }), f.righe[2]);
t('riepiloghi IVA: 480,00 + 105,60 al 22% e 540,00 + 54,00 al 10%', f.riepiloghi.length === 2 && riga(f.riepiloghi[0], { aliquota: 22, imponibile: 480, imposta: 105.6 }) && riga(f.riepiloghi[1], { aliquota: 10, imponibile: 540, imposta: 54 }), f.riepiloghi);
t('bollo 2,00 e totale del documento 1.181,60', f.bolloDoc === 2 && uguale(f.totale, 1181.6), [f.bolloDoc, f.totale]);
t('pagamento MP05 con scadenza e importo', f.pagamenti.length === 1 && f.pagamenti[0].modalita.startsWith('MP05 bonifico') && f.pagamenti[0].scadenza === '2025-04-30' && uguale(f.pagamenti[0].importo, 1181.6), f.pagamenti);
t('nessuna autofattura', !f.autofattura);

// con leggiFileFattura passa anche da completa: imponibile 480 + 540 = 1.020,00, IVA 105,60 + 54 = 159,60;
// 1.020 + 159,60 = 1.179,60, i 2 € in più sono il bollo → controllo OK
[f] = await FP.leggiFileFattura('fattura-ade.pdf', documento('fattura-ade.pdf'));
t('completa: imponibile 1.020,00, IVA 159,60, controllo OK', uguale(f.imponibile, 1020) && uguale(f.iva, 159.6) && f.controllo === 'OK' && f.segno === 1, [f.imponibile, f.iva, f.controllo]);
t('completa: aliquote diventano numeri', f.righe[0].aliquota === 22 && f.righe[1].aliquota === 10, f.righe.map(r => r.aliquota));
t('chiave dei doppioni e nome del file', f.chiave === '01234567890|123/A|2025-03-10' && f.file === 'fattura-ade.pdf' && f.fonte === 'pdf', [f.chiave, f.file]);
const chiavePdf = f.chiave;

sezione("2. PDF dell'Agenzia: autofattura da esonerato e nota di credito su due pagine");
[f] = await FP.leggiFileFattura('fattura-ade-autofattura.pdf', documento('fattura-ade-autofattura.pdf'));
// il cedente è già l'agricoltore: niente scambio; senza partita IVA vale il codice fiscale
t('autofattura riconosciuta, venditore = agricoltore', f.autofattura === true && f.fornitore === 'ROSSI MARIO' && f.cliente === 'AZIENDA AGRICOLA FINTA S.S.', [f.autofattura, f.fornitore, f.cliente]);
t('"Cognome nome" e codice fiscale al posto della partita IVA', f.pivaFornitore === 'RSSMRA80A01H501U' && f.pivaCliente === '09876543210', f.pivaFornitore);
t('descrizione senza la frase dell\'autofattura (due righe sotto)', f.righe.length === 1 && f.righe[0].descrizione === 'FORNITURA DI FIENO DI PRATO STABILE', f.righe);
// 50 q × 12,00 = 600,00; compensazione 6,4% = 38,40; totale 638,40
t('aliquota 6,4 e conti dell\'autofattura', f.righe[0].aliquota === 6.4 && uguale(f.imponibile, 600) && uguale(f.iva, 38.4) && uguale(f.totale, 638.4) && f.controllo === 'OK', [f.imponibile, f.iva, f.totale, f.controllo]);

[f] = await FP.leggiFileFattura('fattura-ade-nota-credito.pdf', documento('fattura-ade-nota-credito.pdf'));
// documento: −100,00 / −22,00 / −122,00 → girati una volta sola in positivo, segno −1
t('nota di credito TD04 con numero e data', f.tipoDoc === 'TD04' && f.numero === '5/NC' && f.data === '2025-04-15', [f.tipoDoc, f.numero, f.data]);
t('importi negativi girati: riga 100,00 (quantità 1), imponibile 100, IVA 22', f.righe.length === 1 && f.righe[0].importo === 100 && f.righe[0].quantita === 1 && f.imponibile === 100 && f.iva === 22, f.righe);
t('totale letto sulla pagina 2 (dopo "Pagina 2 di 2") e girato: 122,00', f.totale === 122 && f.controllo === 'OK' && f.segno === -1, [f.totale, f.controllo]);
t('avviso della nota con importi negativi e pagamento girato', f.avvisi.includes('nota di credito con importi negativi nel documento') && f.pagamenti[0].importo === 122, f.avvisi);

sezione('3. Stampa del gestionale (fattura emessa da noi) e autofattura stampata da noi');
[f] = await FP.leggiFileFattura('fattura-gamma.pdf', documento('fattura-gamma.pdf'));
t('vendita: noi in alto come fornitore, cliente dopo "Spett.le"', f.emessaDaNoi === true && f.fornitore === 'AZIENDA AGRICOLA FINTA S.S.' && f.pivaFornitore === '09876543210' && f.cliente === 'BOVINI FINTI SRL' && f.pivaCliente === '02345678901', [f.fornitore, f.cliente, f.pivaCliente]);
t('numero, data e tipo dalla riga sotto COD.CLIENTE', f.numero === '45' && f.data === '2025-03-20' && f.tipoDoc === 'TD01', [f.numero, f.data]);
t('riga 1: 3 capi × 250,00 = 750,00 al 10%, descrizione su due righe, DDT', riga(f.righe[0], { codice: 'VIT01', descrizione: 'VITELLI MASCHI DA VITA RAZZA FRISONA', um: 'CA', quantita: 3, prezzo: 250, importo: 750, aliquota: 10, ddt: '12 del 18-03-2025' }), f.righe[0]);
t('riga 2: sconto 1 del 10% (50,00 → 45,00) al 22%', riga(f.righe[1], { codice: 'SRV02', sconto: '-10,00%', importo: 45, aliquota: 22 }), f.righe[1]);
// 750 + 75 + 45 + 9,90 = 879,90 = due scadenze da 439,95
t('riepiloghi 750/75 e 45/9,90, totale = somma delle scadenze 879,90', f.riepiloghi.length === 2 && uguale(f.riepiloghi[1].imposta, 9.9) && uguale(f.totale, 879.9) && f.controllo === 'OK', [f.riepiloghi, f.totale]);
t('scadenze con la condizione di pagamento', f.pagamenti.length === 2 && f.pagamenti[1].scadenza === '2025-05-19' && f.pagamenti[0].modalita === 'BONIFICO 30 GG D.F.', f.pagamenti);

[f] = await FP.leggiFileFattura('fattura-gamma-autofattura.pdf', documento('fattura-gamma-autofattura.pdf'));
// è un acquisto: venditore e compratore scambiati, così la chiave è quella del venditore (niente doppione con l'Agenzia)
t('autofattura stampata da noi: venditore e compratore scambiati', f.autofattura === true && f.emessaDaNoi === false && f.fornitore === 'ROSSI MARIO' && f.pivaFornitore === '03456789012' && f.cliente === 'AZIENDA AGRICOLA FINTA S.S.' && f.pivaCliente === '09876543210', [f.fornitore, f.pivaFornitore, f.cliente]);
t('chiave con la partita IVA del venditore', f.chiave === '03456789012|8|2025-06-30', f.chiave);
t('40 q × 15,00 = 600,00, IVA 38,40, totale 638,40', uguale(f.imponibile, 600) && uguale(f.iva, 38.4) && uguale(f.totale, 638.4) && f.controllo === 'OK' && f.righe[0].descrizione === 'FIENO DI PRATO STABILE', [f.imponibile, f.iva, f.totale]);

sezione('4. Prospetto del latte del caseificio');
[f] = await FP.leggiFileFattura('fattura-latte.pdf', documento('fattura-latte.pdf'));
t('noi fornitori (senza la riga del codice conferente), caseificio cliente', f.fornitore === 'AZIENDA AGRICOLA FINTA S.S.' && f.pivaFornitore === '09876543210' && f.cliente === 'CASEIFICIO FINTO SPA' && f.pivaCliente === '01234567890', [f.fornitore, f.cliente]);
t('numero e data da "Fattura n. … del …"', f.numero === '0999999/11' && f.data === '2025-11-30' && f.tipoDoc === 'TD01', [f.numero, f.data]);
// "1000 L": 120,000 migliaia di litri × 480,00 €/1000 l → 120.000 litri a 0,48 €/l
t('unità "1000 L" riportata a litri e €/litro', riga(f.righe[0], { quantita: 120000, um: 'L', prezzo: 0.48, importo: 57600, aliquota: 10 }), f.righe[0]);
t('premio qualità 120.000 l × 0,0205 = 2.460,00', riga(f.righe[1], { quantita: 120000, prezzo: 0.0205, importo: 2460 }), f.righe[1]);
t('riepilogo unico al 10% dai totali: 60.060 + 6.006 = 66.066', f.riepiloghi.length === 1 && f.riepiloghi[0].aliquota === 10 && uguale(f.imponibile, 60060) && uguale(f.iva, 6006) && uguale(f.totale, 66066) && f.controllo === 'OK', [f.riepiloghi, f.totale]);
t('modalità di pagamento con il totale', f.pagamenti.length === 1 && f.pagamenti[0].modalita === 'Bonifico Bancario' && uguale(f.pagamenti[0].importo, 66066), f.pagamenti);

sezione('5. XML FatturaPA');
[f] = await FP.leggiFileFattura('fattura.xml', documento('fattura.xml'));
t('stessa fattura del PDF: stessa chiave (niente doppione)', f.chiave === chiavePdf && f.fonte === 'xml', [f.chiave, chiavePdf]);
t('codice articolo: vale quello del fornitore, non l\'EAN', f.righe[0].codice === 'MAN01', f.righe[0].codice);
t('entità &amp; e lineetta in UTF-8 nelle descrizioni', f.righe[0].descrizione === 'MANGIME VACCHE IN LATTAZIONE & ASCIUTTA' && f.righe[2].descrizione === 'SPESE DI TRASPORTO – CONSEGNA IN AZIENDA', f.righe.map(r => r.descrizione));
t('DDT per numero di linea (45 alla 1, 46 alla 2, nessuno alla 3)', f.righe[0].ddt === '45 del 05-03-2025' && f.righe[1].ddt === '46 del 07-03-2025' && f.righe[2].ddt === '', f.righe.map(r => r.ddt));
t('sconto della linea dal campo ScontoMaggiorazione', f.righe[1].sconto === '-10.00%' && f.righe[1].importo === 540, f.righe[1]);
t('quantità mancante = vuota, non zero', f.righe[2].quantita === null && f.righe[2].prezzo === 30, f.righe[2]);
t('totali uguali al PDF: 1.020 + 159,60 + bollo = 1.181,60, controllo OK', uguale(f.imponibile, 1020) && uguale(f.iva, 159.6) && uguale(f.totale, 1181.6) && f.controllo === 'OK', [f.imponibile, f.iva, f.totale, f.controllo]);
t('pagamento MP05 al 30/04/2025', f.pagamenti.length === 1 && f.pagamenti[0].modalita === 'MP05' && f.pagamenti[0].scadenza === '2025-04-30', f.pagamenti);

[f] = await FP.leggiFileFattura('nota-credito.xml', documento('nota-credito.xml'));
// importi positivi nel documento (il caso normale): restano positivi, la nota la fa il segno −1
t('nota di credito TD04 con importi positivi: segno −1, nessun avviso', f.tipoDoc === 'TD04' && f.segno === -1 && f.imponibile === 45 && uguale(f.iva, 9.9) && uguale(f.totale, 54.9) && !f.avvisi.length && f.controllo === 'OK', f);

[f] = await FP.leggiFileFattura('parcella-ritenuta.xml', documento('parcella-ritenuta.xml'));
// 500 + 110 − ritenuta 100 = 510 = ImportoTotaleDocumento
t('persona con Cognome e Nome: "BIANCHI ANNA"', f.fornitore === 'BIANCHI ANNA' && f.pivaFornitore === '04567890123', f.fornitore);
t('parcella TD06 (non è una nota di credito)', f.tipoDoc === 'TD06' && f.segno === 1);
t("ritenuta d'acconto letta (100,00) e controllo OK con la ritenuta", f.ritenuta === 100 && f.controllo === "OK (ritenuta d'acconto 100,00)", [f.ritenuta, f.controllo]);

[f] = await FP.leggiFileFattura('parcella-cassa.xml', documento('parcella-cassa.xml'));
// veterinario: compenso 1.000 + cassa ENPAV 2% = 20 (in DatiCassaPrevidenziale, non fra le linee) = imponibile 1.020;
// IVA 224,40; ritenuta 200 sul compenso; totale 1.044,40. Dalla 1.76.1 la cassa è una riga e i conti tornano.
t('cassa previdenziale diventa una riga da 20,00 al 22%', f.righe.length === 2 && riga(f.righe[1], { descrizione: 'CONTRIBUTO CASSA PREVIDENZIALE TC11 2%', importo: 20, prezzo: 20, aliquota: 22, quantita: null }), f.righe);
t('righe 1.000 + 20 = imponibile 1.020: controllo OK con la ritenuta di 200,00', uguale(f.imponibile, 1020) && uguale(f.iva, 224.4) && uguale(f.totale, 1044.4) && f.ritenuta === 200 && f.controllo === "OK (ritenuta d'acconto 200,00)", [f.imponibile, f.iva, f.totale, f.controllo]);
t('la riga della cassa va nelle spese accessorie (seguono le altre righe della fattura)', RG.classifica(f.righe[1]?.descrizione, f.fornitore, RG.REGOLE_PREDEFINITE) === 'Spese accessorie e contributi', RG.classifica(f.righe[1]?.descrizione, f.fornitore, RG.REGOLE_PREDEFINITE));
t('fattura senza cassa: nessuna riga in più', (await FP.leggiFileFattura('parcella-ritenuta.xml', documento('parcella-ritenuta.xml')))[0].righe.length === 1);

const lotto = await FP.leggiFileFattura('lotto-latin1.xml', documento('lotto-latin1.xml'));
t('lotto: due fatture dallo stesso file, stesso fornitore', lotto.length === 2 && lotto.every(x => x.fornitore === 'CARBURANTI FINTI SPA' && x.file === 'lotto-latin1.xml') && lotto[1].numero === 'G-102', lotto.map(x => x.numero));
t('ISO-8859-1: "QUALITÀ" letta giusta', lotto[0].righe[0].descrizione === 'GASOLIO AGRICOLO QUALITÀ SUPERIORE', lotto[0].righe[0].descrizione);
// 1.100 + 242 = 1.342; sconto −5,00 e arrotondamento −0,01 → 1.336,99
t('sconto e arrotondamento sul totale del documento', lotto[0].scontoDoc === -5 && lotto[0].arrDoc === -0.01 && uguale(lotto[0].aggiustamento, -5.01) && lotto[0].controllo.startsWith('OK (sconto o arrotondamento'), [lotto[0].scontoDoc, lotto[0].arrDoc, lotto[0].controllo]);
t('seconda fattura del lotto: 50 + 11 = 61, OK', uguale(lotto[1].totale, 61) && lotto[1].controllo === 'OK' && !('scontoDoc' in lotto[1]));

sezione('6. File firmati .p7m');
const xmlChiaro = new TextDecoder().decode(documento('fattura.xml'));
const estratto = new TextDecoder().decode(FP.xmlDaP7m(documento('fattura.xml.p7m')));
t('xmlDaP7m toglie busta, intestazioni dei pezzi e firma: resta l\'XML uguale', estratto === xmlChiaro.trimEnd(), estratto.length + ' / ' + xmlChiaro.length);
[f] = await FP.leggiFileFattura('fattura.xml.p7m', documento('fattura.xml.p7m'));
t('p7m binario letto come l\'XML', f.chiave === chiavePdf && f.righe.length === 3 && uguale(f.totale, 1181.6) && f.controllo === 'OK', f.chiave);
[f] = await FP.leggiFileFattura('fattura-base64.xml.p7m', documento('fattura-base64.xml.p7m'));
t('p7m in base64 (a righe da 76) letto come l\'XML', f.chiave === chiavePdf && f.righe[2].descrizione === 'SPESE DI TRASPORTO – CONSEGNA IN AZIENDA', f.chiave);
[f] = await FP.leggiFileFattura('fattura.xml', documento('fattura-base64.xml.p7m'));
t('p7m in base64 con il nome sbagliato (.xml): riconosciuto dal contenuto', f.chiave === chiavePdf);

sezione('7. Documenti che non vanno');
let e = await errore(() => FP.leggiFileFattura('rotta.xml', new TextEncoder().encode('<?xml version="1.0"?><p:FatturaElettronica><A></B></p:FatturaElettronica>')));
t('XML rotto: errore "XML non valido"', e === 'XML non valido', e);
e = await errore(() => FP.leggiFileFattura('altro.xml', new TextEncoder().encode('<?xml version="1.0"?><Ordine><Numero>1</Numero></Ordine>')));
t('XML che non è una fattura: errore', e === 'non è una fattura elettronica', e);
e = await errore(() => FP.leggiFileFattura('vuoto.pdf', creaPdf([new Pagina()])));
t('PDF senza testo (scansione): errore', e === 'PDF senza testo (scansione?)', e);
e = await errore(() => FP.leggiFileFattura('lettera.pdf', creaPdf([new Pagina().t(40, 40, 'Gentile cliente, le scriviamo per un aggiornamento.')])));
t('PDF con testo di un altro formato: errore', e === 'formato di fattura non riconosciuto', e);
e = await errore(() => FP.xmlDaP7m(new TextEncoder().encode('0123 niente fattura qui dentro')));
t('p7m senza fattura dentro: errore', /impossibile estrarre/.test(e), e);

fine('lettori-fatture');
