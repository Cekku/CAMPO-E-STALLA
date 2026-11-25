// Documenti FINTI per le prove dei lettori dei Conti (prove/lettori-*.test.mjs): fatture (visualizzazione
// dell'Agenzia, stampa del gestionale, prospetto del latte, XML FatturaPA, P7M), cedolini, bilancino delle paghe,
// contabili di bonifico, estratti conto, dichiarazione IVA (PDF e telematico), bilancino del commercialista.
// Sono costruiti sul formato dei documenti veri come lo leggono i lettori (posizioni delle colonne, etichette), ma
// TUTTI i dati sono inventati: ditte "FINTE", ROSSI MARIO, partite IVA 01234567890 e simili, l'IBAN di esempio delle
// guide bancarie. Il repository è pubblico: qui non va mai un documento vero dell'archivio.
// Uso: node prove/documenti/genera.mjs   (riscrive i file di questa cartella; lettori-documenti.test.mjs controlla
// che i file nel repository siano uguali a quelli che crea questo programma)
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pagina, creaPdf, larghezza } from './pdf.mjs';

const NOI = { nome: 'AZIENDA AGRICOLA FINTA S.S.', piva: '09876543210' };
const MANGIMI = { nome: 'MANGIMI FINTI SRL', piva: '01234567890' };
const IBAN = 'IT60X0542811101000000123456'; // IBAN di esempio (con le cifre di controllo giuste)

/* ======================= fatture: visualizzazione standard dell'Agenzia delle Entrate ======================= */
// colonne della tabella delle righe come nel foglio di stile dell'Agenzia
function adeTesta(p, ced, ces, tipo, numero, data) {
  p.t(40, 60, 'Cedente/prestatore (fornitore)', { size: 8, font: 'B' });
  p.t(299, 60, 'Cessionario/committente (cliente)', { size: 8, font: 'B' });
  let y = 72;
  for (let i = 0; i < Math.max(ced.length, ces.length); i++, y += 9) { if (ced[i]) p.t(40, y, ced[i]); if (ces[i]) p.t(299, y, ces[i]); }
  y += 10;
  p.t(40, y, 'Tipologia documento'); p.t(125, y, 'Art. 73'); p.t(165, y, 'Numero documento'); p.t(250, y, 'Data documento'); p.t(330, y, 'Codice destinatario');
  y += 9;
  p.t(40, y, tipo); p.t(165, y, numero); p.t(250, y, data); p.t(330, y, '0000000');
  y += 20;
  p.t(40, y, 'Cod. articolo'); p.t(100, y, 'Descrizione'); p.t(300, y, 'Quantità'); p.t(345, y, 'Prezzo unitario'); p.t(410, y, 'UM'); p.t(430, y, 'Sconto o magg.'); p.t(490, y, '%IVA'); p.t(520, y, 'Prezzo totale');
  return y + 11;
}
function adeRiga(p, y, r) {
  if (r.cod) p.t(40, y, r.cod);
  if (r.desc) p.t(100, y, r.desc);
  if (r.qta) p.d(340, y, r.qta);
  if (r.pu) p.d(405, y, r.pu);
  if (r.um) p.t(410, y, r.um);
  if (r.sc) p.d(480, y, r.sc);
  if (r.iva) p.d(510, y, r.iva);
  if (r.tot) p.d(560, y, r.tot);
}
function adeRiepiloghi(p, y, righe) {
  p.t(40, y, 'RIEPILOGHI IVA E TOTALI', { size: 8, font: 'B' }); y += 12;
  p.t(40, y, 'esigibilità iva / riferimenti normativi'); p.d(250, y, '%IVA'); p.d(330, y, 'Spese accessorie'); p.d(380, y, 'Arr.'); p.d(470, y, 'Totale imponibile'); p.d(560, y, 'Totale imposta');
  for (const [al, imp, iva] of righe) { y += 10; p.t(40, y, 'I (esigibilità immediata)'); p.d(250, y, al); p.d(470, y, imp); p.d(560, y, iva); }
  return y + 14;
}
function adeTotaliTesta(p, y) { p.t(40, y, 'Importo bollo'); p.t(200, y, 'Sconto/Maggiorazione'); p.t(330, y, 'Arr.'); p.t(450, y, 'Totale documento'); }
function adePagamento(p, y, modo, scad, imp) {
  p.t(40, y, 'Modalità pagamento'); p.t(150, y, 'IBAN'); p.t(290, y, 'Istituto finanziario'); p.t(400, y, 'Data scadenza'); p.t(500, y, 'Importo');
  y += 10; p.t(40, y, modo); p.t(150, y, IBAN); p.t(290, y, 'BANCA FINTA'); p.t(400, y, scad); p.d(560, y, imp);
  return y + 20;
}
const COPIA = "Copia della fattura elettronica disponibile nella tua area riservata dell'Agenzia delle Entrate";
const cedMangimi = ['Identificativo fiscale ai fini IVA: IT01234567890', 'Codice fiscale: 01234567890', 'Denominazione: MANGIMI FINTI SRL', 'Regime fiscale: RF01 (ordinario)', 'Indirizzo: VIA DELLE PROVE 10', 'Comune: PAESE FINTO Provincia: UD'];
const cesNoi = ['Identificativo fiscale ai fini IVA: IT09876543210', 'Codice fiscale: 09876543210', 'Denominazione: AZIENDA AGRICOLA', 'FINTA S.S.', 'Indirizzo: VIA DEI CAMPI 1'];

// Fattura di acquisto TD01 n. 123/A del 10/03/2025 (la stessa di fattura.xml):
//   mangime 1.000 kg × 0,45 = 450,00 (22%), semente 10 kg × 60,00 − 10% = 540,00 (10%), trasporto 30,00 (22%)
//   imponibile 22% = 480,00, IVA 105,60; imponibile 10% = 540,00, IVA 54,00; bollo 2,00
//   totale = 480 + 105,60 + 540 + 54 + 2 = 1.181,60
function fatturaAde() {
  const p = new Pagina();
  let y = adeTesta(p, cedMangimi, cesNoi, 'TD01 fattura', '123/A', '10-03-2025');
  p.t(100, y, 'DDT 45 del 05-03-2025'); y += 9;
  adeRiga(p, y, { cod: 'MAN01', desc: 'MANGIME VACCHE IN LATTAZIONE', qta: '1.000,00', pu: '0,45000', um: 'KG', iva: '22,00', tot: '450,00' }); y += 9;
  p.t(100, y, 'CONFEZIONE SACCHI DA 25 KG'); y += 11;           // seguito della descrizione sulla riga sotto
  adeRiga(p, y, { cod: 'SEM02', desc: 'SEMENTE ERBA MEDICA', qta: '10,00', pu: '60,00', um: 'KG', sc: '10%', iva: '10,00', tot: '540,00' }); y += 11;
  adeRiga(p, y, { desc: 'SPESE DI TRASPORTO', qta: '1,00', pu: '30,00', iva: '22,00', tot: '30,00' }); y += 20;
  y = adeRiepiloghi(p, y, [['22,00', '480,00', '105,60'], ['10,00', '540,00', '54,00']]);
  adeTotaliTesta(p, y); y += 10; p.d(100, y, '2,00'); p.d(560, y, '1.181,60'); y += 20;
  y = adePagamento(p, y, 'MP05 bonifico', '30-04-2025', '1.181,60');
  p.t(40, y, COPIA);
  return [p];
}

// Autofattura per acquisto da agricoltore esonerato (art. 34 c. 6), nella visualizzazione dell'Agenzia: il cedente
// è già l'agricoltore (persona, solo codice fiscale). Fieno 50 q × 12,00 = 600,00, compensazione 6,4% = 38,40,
// totale 638,40. La frase dell'autofattura sta nella descrizione, su due righe sotto.
function fatturaAdeAutofattura() {
  const p = new Pagina();
  let y = adeTesta(p, ['Codice fiscale: RSSMRA80A01H501U', 'Cognome nome: ROSSI MARIO', 'Regime fiscale: RF01 (ordinario)', 'Indirizzo: VIA DEI PRATI 3'], cesNoi, 'TD01 fattura', '7', '15-06-2025');
  adeRiga(p, y, { desc: 'FORNITURA DI FIENO DI PRATO STABILE', qta: '50,00', pu: '12,00', um: 'QL', iva: '6,40', tot: '600,00' }); y += 9;
  p.t(100, y, 'Autofattura emessa per acquisti da soggetto esonerato'); y += 9;
  p.t(100, y, "a norma dell'art. 34 comma 6 DPR 633/72"); y += 20;
  y = adeRiepiloghi(p, y, [['6,40', '600,00', '38,40']]);
  adeTotaliTesta(p, y); y += 10; p.d(560, y, '638,40'); y += 20;
  y = adePagamento(p, y, 'MP05 bonifico', '15-07-2025', '638,40');
  p.t(40, y, COPIA);
  return [p];
}

// Nota di credito TD04 n. 5/NC del 15/04/2025 con gli importi NEGATIVI nel documento, su due pagine: i valori dei
// totali sono sulla pagina 2 (dopo "Pagina 2 di 2"). Reso 1 × 100,00 = −100,00 (22%), IVA −22,00, totale −122,00.
// Dopo completa: importi girati in positivo (100, 22, 122) e segno −1.
function fatturaAdeNotaCredito() {
  const p = new Pagina(), q = new Pagina();
  let y = adeTesta(p, cedMangimi, cesNoi, 'TD04 nota di credito', '5/NC', '15-04-2025');
  adeRiga(p, y, { cod: 'MAN01', desc: 'RESO MANGIME NON CONFORME', qta: '-1,00', pu: '100,00', iva: '22,00', tot: '-100,00' }); y += 20;
  y = adeRiepiloghi(p, y, [['22,00', '-100,00', '-22,00']]);
  adeTotaliTesta(p, 790); p.t(270, 820, 'Pagina 1 di 2');
  q.t(270, 40, 'Pagina 2 di 2');
  q.d(560, 55, '-122,00');
  y = adePagamento(q, 80, 'MP05 bonifico', '15-05-2025', '-122,00');
  q.t(40, y, COPIA);
  return [p, q];
}

/* ======================= fatture: stampa del gestionale (GAMMA / TeamSystem) ======================= */
function gammaTesta(p, destra, valori) {
  p.t(40, 40, NOI.nome); p.t(320, 40, 'Spett.le');
  const sx = ['VIA DEI CAMPI 1', '33040 PAESE FINTO (UD)', 'PI: 09876543210 CF: 09876543210'];
  for (let i = 0; i < 4; i++) { if (sx[i]) p.t(40, 49 + 9 * i, sx[i]); if (destra[i]) p.t(320, 49 + 9 * i, destra[i]); }
  p.t(40, 90, 'COD.CLIENTE'); p.t(120, 90, 'PARTITA IVA'); p.t(260, 90, 'NUMERO'); p.t(340, 90, 'DATA'); p.t(420, 90, 'PAG.');
  [40, 120, 260, 340, 420].forEach((x, i) => p.t(x, 99, valori[i]));
  p.t(40, 115, 'CONDIZIONI DI PAGAMENTO'); p.t(300, 115, "BANCA D'APPOGGIO");
  p.t(40, 124, 'BONIFICO 30 GG D.F.'); p.t(300, 124, 'BANCA FINTA ' + IBAN);
  // intestazione della tabella in corpo 6: colonne a destra (bordo destro delle intestazioni)
  const h = { size: 6 };
  p.t(40, 145, 'ARTICOLO', h); p.t(95, 145, 'D E S C R I Z I O N E', h); p.t(280, 145, 'U.M.', h); p.d(330, 145, "QUANTITA'", h);
  p.d(400, 145, 'PREZZO UNITARIO', h); p.d(430, 145, 'SC.1%', h); p.d(460, 145, 'SC.2%', h); p.d(525, 145, 'IMPORTO NETTO', h); p.d(560, 145, 'IVA', h);
}
function gammaRiga(p, y, r) {
  if (r.cod) p.t(40, y, r.cod);
  if (r.desc) p.t(95, y, r.desc);
  if (r.um) p.t(280, y, r.um);
  if (r.qta) p.d(330, y, r.qta);
  if (r.pu) p.d(400, y, r.pu);
  if (r.sc1) p.d(430, y, r.sc1);
  if (r.tot) p.d(525, y, r.tot);
  if (r.iva) p.d(560, y, r.iva);
}
function gammaRiepilogo(p, y, righe, totale, scadenze) {
  p.d(150, y, 'IMPONIBILE'); p.d(200, y, 'AL.IVA'); p.t(230, y, 'DESCRIZIONE'); p.d(380, y, 'IVA');
  for (const [imp, al, desc, iva] of righe) { y += 9; p.d(150, y, imp); p.d(200, y, al); p.t(230, y, desc); p.d(380, y, iva); }
  y += 14; p.t(40, y, 'TOTALE FATTURA'); p.d(380, y, totale);
  y += 18; p.t(40, y, 'SCADENZE');
  for (const s of scadenze) { y += 9; p.t(40, y, s); }
}

// Fattura di VENDITA emessa da noi (TD01 n. 45 del 20/03/2025 a BOVINI FINTI SRL):
//   3 vitelli × 250,00 = 750,00 (10%, IVA 75,00); trasporto 1 × 50,00 − 10% = 45,00 (22%, IVA 9,90)
//   totale = 750 + 75 + 45 + 9,90 = 879,90 in due rate da 439,95
function fatturaGamma() {
  const p = new Pagina();
  gammaTesta(p, ['BOVINI FINTI SRL', 'VIA DEL MERCATO 5', '33100 CITTA FINTA (UD)', 'P.IVA 02345678901'], ['C0042', '02345678901', '45', '20/03/2025', '1']);
  p.t(95, 156, 'D.d.T. N. 12 del 18/03/2025');
  gammaRiga(p, 165, { cod: 'VIT01', desc: 'VITELLI MASCHI DA VITA', um: 'CA', qta: '3,00', pu: '250,00', tot: '750,00', iva: '10' });
  p.t(95, 174, 'RAZZA FRISONA');                                 // seguito della descrizione
  gammaRiga(p, 185, { cod: 'SRV02', desc: 'TRASPORTO', qta: '1,00', pu: '50,00', sc1: '10,00', tot: '45,00', iva: '22' });
  gammaRiepilogo(p, 230, [['750,00', '10', 'VENDITA BOVINI', '75,00'], ['45,00', '22', 'SERVIZI', '9,90']], '879,90', ['1) 439,95 19/04/2025', '2) 439,95 19/05/2025']);
  return [p];
}

// Autofattura stampata dal gestionale: noi in alto come chi emette, l'agricoltore esonerato come "Spett.le".
// È un ACQUISTO: il lettore deve scambiare venditore e compratore. Fieno 40 q × 15,00 = 600,00, 6,4% = 38,40,
// totale 638,40 (TD01 n. 8 del 30/06/2025, P.IVA del venditore 03456789012).
function fatturaGammaAutofattura() {
  const p = new Pagina();
  gammaTesta(p, ['ROSSI MARIO', 'VIA DEI PRATI 3', '33040 PAESE FINTO (UD)', 'C.F. RSSMRA80A01H501U'], ['C0007', '03456789012', '8', '30/06/2025', '1']);
  gammaRiga(p, 165, { cod: 'FIE01', desc: 'FIENO DI PRATO STABILE', um: 'QL', qta: '40,00', pu: '15,00', tot: '600,00', iva: '6,4' });
  p.t(40, 180, "* Autofattura emessa per acquisti da soggetto esonerato a norma dell'art. 34 comma 6 DPR 633/72");
  gammaRiepilogo(p, 230, [['600,00', '6,4', 'COMPENSAZIONE', '38,40']], '638,40', ['1) 638,40 30/07/2025']);
  return [p];
}

/* ======================= fatture: prospetto del latte preparato dal caseificio ======================= */
// Fattura n. 0999999/11 del 30/11/2025 emessa da noi al caseificio. Quantità in migliaia di litri ("1000 L"):
//   latte 120,000 × 480,00 = 57.600,00; premio qualità 120,000 × 20,50 = 2.460,00 (tutto al 10%)
//   imponibile 60.060,00, IVA 6.006,00, totale 66.066,00; dopo la lettura: 120.000 litri a 0,48 €/l e 0,0205 €/l
function fatturaLatte() {
  const p = new Pagina();
  p.t(40, 40, '999999-01 (999999)');
  p.t(40, 50, NOI.nome); p.t(40, 59, 'VIA DEI CAMPI 1'); p.t(40, 68, 'P.I. 09876543210');
  p.t(320, 80, 'Spett.le'); p.t(320, 89, 'CASEIFICIO FINTO SPA'); p.t(320, 98, 'VIA DEL LATTE 2'); p.t(320, 107, 'P.I. 01234567890');
  p.t(40, 125, 'Fattura n. 0999999/11 del 30/11/2025');
  p.t(40, 145, 'Descrizione'); p.t(250, 145, 'U.M.'); p.d(330, 145, "Quantita'"); p.d(400, 145, 'Prezzo U.'); p.d(450, 145, 'IVA'); p.d(540, 145, 'Imponibile');
  const riga = (y, d, q, pu, tot) => { p.t(40, y, d); p.t(250, y, '1000 L'); p.d(330, y, q); p.d(400, y, pu); p.d(450, y, '10'); p.d(540, y, tot); };
  riga(156, 'Latte Vaccino Crudo', '120,000', '480,00', '57.600,00');
  riga(167, "PREMIO QUALITA' NOVEMBRE", '120,000', '20,50', '2.460,00');
  p.t(40, 185, 'Totale Imponibile'); p.d(540, 185, '60.060,00');
  p.t(40, 195, 'Totale Iva'); p.d(540, 195, '6.006,00');
  p.t(40, 205, 'TOTALE FATTURA (euro)'); p.d(540, 205, '66.066,00');
  p.t(40, 225, 'Modalità pagamento: Bonifico Bancario');
  return [p];
}

/* ======================= fatture elettroniche XML (FatturaPA 1.2) ======================= */
const anagrafica = (piva, nome, cf) => `<DatiAnagrafici>${piva ? `<IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>${piva}</IdCodice></IdFiscaleIVA>` : ''}${cf ? `<CodiceFiscale>${cf}</CodiceFiscale>` : ''}<Anagrafica>${nome}</Anagrafica><RegimeFiscale>RF01</RegimeFiscale></DatiAnagrafici>`;
const testaXml = (encoding, ced, ces) => `<?xml version="1.0" encoding="${encoding}"?>
<!-- fattura FINTA per le prove -->
<p:FatturaElettronica versione="FPR12" xmlns:ds="http://www.w3.org/2000/09/xmldsig#" xmlns:p="http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <FatturaElettronicaHeader>
    <DatiTrasmissione><IdTrasmittente><IdPaese>IT</IdPaese><IdCodice>01234567890</IdCodice></IdTrasmittente><ProgressivoInvio>00001</ProgressivoInvio><FormatoTrasmissione>FPR12</FormatoTrasmissione><CodiceDestinatario>0000000</CodiceDestinatario></DatiTrasmissione>
    <CedentePrestatore>${ced}<Sede><Indirizzo>VIA DELLE PROVE 10</Indirizzo><CAP>33100</CAP><Comune>PAESE FINTO</Comune><Nazione>IT</Nazione></Sede></CedentePrestatore>
    <CessionarioCommittente>${ces}<Sede><Indirizzo>VIA DEI CAMPI 1</Indirizzo><CAP>33040</CAP><Comune>PAESE FINTO</Comune><Nazione>IT</Nazione></Sede></CessionarioCommittente>
  </FatturaElettronicaHeader>`;
const cesNoiXml = anagrafica(NOI.piva, `<Denominazione>${NOI.nome}</Denominazione>`, NOI.piva);
const fineXml = '\n</p:FatturaElettronica>\n';

// La stessa fattura di fattura-ade.pdf (stessa chiave: niente doppione fra XML e PDF). Due codici articolo (vale
// quello del fornitore), DDT per numero di linea, sconto del 10% sulla linea 2, & e – (UTF-8) nelle descrizioni.
function fatturaXml() {
  return testaXml('UTF-8', anagrafica(MANGIMI.piva, `<Denominazione>${MANGIMI.nome}</Denominazione>`), cesNoiXml) + `
  <FatturaElettronicaBody>
    <DatiGenerali>
      <DatiGeneraliDocumento><TipoDocumento>TD01</TipoDocumento><Divisa>EUR</Divisa><Data>2025-03-10</Data><Numero>123/A</Numero>
        <DatiBollo><BolloVirtuale>SI</BolloVirtuale><ImportoBollo>2.00</ImportoBollo></DatiBollo><ImportoTotaleDocumento>1181.60</ImportoTotaleDocumento></DatiGeneraliDocumento>
      <DatiDDT><NumeroDDT>45</NumeroDDT><DataDDT>2025-03-05</DataDDT><RiferimentoNumeroLinea>1</RiferimentoNumeroLinea></DatiDDT>
      <DatiDDT><NumeroDDT>46</NumeroDDT><DataDDT>2025-03-07</DataDDT><RiferimentoNumeroLinea>2</RiferimentoNumeroLinea></DatiDDT>
    </DatiGenerali>
    <DatiBeniServizi>
      <DettaglioLinee><NumeroLinea>1</NumeroLinea><CodiceArticolo><CodiceTipo>EAN</CodiceTipo><CodiceValore>8000000000001</CodiceValore></CodiceArticolo><CodiceArticolo><CodiceTipo>FORNITORE</CodiceTipo><CodiceValore>MAN01</CodiceValore></CodiceArticolo><Descrizione>MANGIME VACCHE IN LATTAZIONE &amp; ASCIUTTA</Descrizione><Quantita>1000.00</Quantita><UnitaMisura>KG</UnitaMisura><PrezzoUnitario>0.45000</PrezzoUnitario><PrezzoTotale>450.00</PrezzoTotale><AliquotaIVA>22.00</AliquotaIVA></DettaglioLinee>
      <DettaglioLinee><NumeroLinea>2</NumeroLinea><Descrizione>SEMENTE ERBA MEDICA</Descrizione><Quantita>10.00</Quantita><UnitaMisura>KG</UnitaMisura><PrezzoUnitario>60.00</PrezzoUnitario><ScontoMaggiorazione><Tipo>SC</Tipo><Percentuale>10.00</Percentuale></ScontoMaggiorazione><PrezzoTotale>540.00</PrezzoTotale><AliquotaIVA>10.00</AliquotaIVA></DettaglioLinee>
      <DettaglioLinee><NumeroLinea>3</NumeroLinea><Descrizione>SPESE DI TRASPORTO – CONSEGNA IN AZIENDA</Descrizione><PrezzoUnitario>30.00</PrezzoUnitario><PrezzoTotale>30.00</PrezzoTotale><AliquotaIVA>22.00</AliquotaIVA></DettaglioLinee>
      <DatiRiepilogo><AliquotaIVA>22.00</AliquotaIVA><ImponibileImporto>480.00</ImponibileImporto><Imposta>105.60</Imposta><EsigibilitaIVA>I</EsigibilitaIVA></DatiRiepilogo>
      <DatiRiepilogo><AliquotaIVA>10.00</AliquotaIVA><ImponibileImporto>540.00</ImponibileImporto><Imposta>54.00</Imposta><EsigibilitaIVA>I</EsigibilitaIVA></DatiRiepilogo>
    </DatiBeniServizi>
    <DatiPagamento><CondizioniPagamento>TP02</CondizioniPagamento><DettaglioPagamento><ModalitaPagamento>MP05</ModalitaPagamento><DataScadenzaPagamento>2025-04-30</DataScadenzaPagamento><ImportoPagamento>1181.60</ImportoPagamento><IBAN>${IBAN}</IBAN></DettaglioPagamento></DatiPagamento>
  </FatturaElettronicaBody>` + fineXml;
}

// Nota di credito TD04 NC/7 del 15/04/2025 con gli importi POSITIVI (il caso normale): reso 100 kg × 0,45 = 45,00,
// IVA 22% = 9,90, totale 54,90. Dopo completa: segno −1, importi che restano positivi.
function notaCreditoXml() {
  return testaXml('UTF-8', anagrafica(MANGIMI.piva, `<Denominazione>${MANGIMI.nome}</Denominazione>`), cesNoiXml) + `
  <FatturaElettronicaBody>
    <DatiGenerali><DatiGeneraliDocumento><TipoDocumento>TD04</TipoDocumento><Divisa>EUR</Divisa><Data>2025-04-15</Data><Numero>NC/7</Numero><ImportoTotaleDocumento>54.90</ImportoTotaleDocumento></DatiGeneraliDocumento></DatiGenerali>
    <DatiBeniServizi>
      <DettaglioLinee><NumeroLinea>1</NumeroLinea><Descrizione>RESO MANGIME</Descrizione><Quantita>100.00</Quantita><UnitaMisura>KG</UnitaMisura><PrezzoUnitario>0.45</PrezzoUnitario><PrezzoTotale>45.00</PrezzoTotale><AliquotaIVA>22.00</AliquotaIVA></DettaglioLinee>
      <DatiRiepilogo><AliquotaIVA>22.00</AliquotaIVA><ImponibileImporto>45.00</ImponibileImporto><Imposta>9.90</Imposta></DatiRiepilogo>
    </DatiBeniServizi>
  </FatturaElettronicaBody>` + fineXml;
}

// Parcella TD06 n. 12 del 20/05/2025 di un agronomo persona (Cognome e Nome, niente Denominazione) con ritenuta
// d'acconto: compenso 500,00, IVA 22% = 110,00, ritenuta 20% = 100,00, ImportoTotaleDocumento al netto = 510,00.
function ritenutaXml() {
  return testaXml('UTF-8', anagrafica('04567890123', '<Nome>ANNA</Nome><Cognome>BIANCHI</Cognome>', 'BNCNNA85C41L483Q'), cesNoiXml) + `
  <FatturaElettronicaBody>
    <DatiGenerali><DatiGeneraliDocumento><TipoDocumento>TD06</TipoDocumento><Divisa>EUR</Divisa><Data>2025-05-20</Data><Numero>12</Numero>
      <DatiRitenuta><TipoRitenuta>RT01</TipoRitenuta><ImportoRitenuta>100.00</ImportoRitenuta><AliquotaRitenuta>20.00</AliquotaRitenuta><CausalePagamento>A</CausalePagamento></DatiRitenuta>
      <ImportoTotaleDocumento>510.00</ImportoTotaleDocumento></DatiGeneraliDocumento></DatiGenerali>
    <DatiBeniServizi>
      <DettaglioLinee><NumeroLinea>1</NumeroLinea><Descrizione>CONSULENZA PIANO DI CONCIMAZIONE</Descrizione><PrezzoUnitario>500.00</PrezzoUnitario><PrezzoTotale>500.00</PrezzoTotale><AliquotaIVA>22.00</AliquotaIVA><Ritenuta>SI</Ritenuta></DettaglioLinee>
      <DatiRiepilogo><AliquotaIVA>22.00</AliquotaIVA><ImponibileImporto>500.00</ImponibileImporto><Imposta>110.00</Imposta></DatiRiepilogo>
    </DatiBeniServizi>
    <DatiPagamento><CondizioniPagamento>TP02</CondizioniPagamento><DettaglioPagamento><ModalitaPagamento>MP05</ModalitaPagamento><ImportoPagamento>510.00</ImportoPagamento></DettaglioPagamento></DatiPagamento>
  </FatturaElettronicaBody>` + fineXml;
}

// Parcella TD06 V/31 del 30/09/2025 di un veterinario con la cassa previdenziale (ENPAV 2%) scritta come vuole la
// norma, in DatiCassaPrevidenziale e non fra le linee: compenso 1.000,00 + cassa 20,00 = imponibile 1.020,00
// (riepilogo), IVA 22% = 224,40, ritenuta 20% sul solo compenso = 200,00 (il contributo integrativo ENPAV non ha la
// ritenuta: niente <Ritenuta> nella cassa), totale al netto 1.044,40.
// Dalla 1.76.1 il lettore fa della cassa una riga: righe 1.000 + 20 = 1.020 = imponibile (prima "righe ≠ imponibile").
function cassaXml() {
  return testaXml('UTF-8', anagrafica('06789012345', '<Nome>PAOLO</Nome><Cognome>NERI</Cognome>', 'NREPLA75A01L483X'), cesNoiXml) + `
  <FatturaElettronicaBody>
    <DatiGenerali><DatiGeneraliDocumento><TipoDocumento>TD06</TipoDocumento><Divisa>EUR</Divisa><Data>2025-09-30</Data><Numero>V/31</Numero>
      <DatiRitenuta><TipoRitenuta>RT01</TipoRitenuta><ImportoRitenuta>200.00</ImportoRitenuta><AliquotaRitenuta>20.00</AliquotaRitenuta><CausalePagamento>A</CausalePagamento></DatiRitenuta>
      <DatiCassaPrevidenziale><TipoCassa>TC11</TipoCassa><AlCassa>2.00</AlCassa><ImportoContributoCassa>20.00</ImportoContributoCassa><ImponibileCassa>1000.00</ImponibileCassa><AliquotaIVA>22.00</AliquotaIVA></DatiCassaPrevidenziale>
      <ImportoTotaleDocumento>1044.40</ImportoTotaleDocumento></DatiGeneraliDocumento></DatiGenerali>
    <DatiBeniServizi>
      <DettaglioLinee><NumeroLinea>1</NumeroLinea><Descrizione>VISITE E INTERVENTI IN STALLA SETTEMBRE</Descrizione><PrezzoUnitario>1000.00</PrezzoUnitario><PrezzoTotale>1000.00</PrezzoTotale><AliquotaIVA>22.00</AliquotaIVA><Ritenuta>SI</Ritenuta></DettaglioLinee>
      <DatiRiepilogo><AliquotaIVA>22.00</AliquotaIVA><ImponibileImporto>1020.00</ImponibileImporto><Imposta>224.40</Imposta></DatiRiepilogo>
    </DatiBeniServizi>
  </FatturaElettronicaBody>` + fineXml;
}

// Lotto di due fatture (due FatturaElettronicaBody) scritto in ISO-8859-1, con "QUALITÀ" (À = byte C0) e con
// sconto sul totale del documento (ScontoMaggiorazione SC 5,00) e arrotondamento −0,01:
//   1) gasolio 1.000 l × 1,10 = 1.100,00, IVA 22% 242,00, sconto 5,00, arrotondamento −0,01 → totale 1.336,99
//   2) lubrificante 2 × 25,00 = 50,00, IVA 11,00, totale 61,00
function latin1Xml() {
  const corpo = (num, data, righe, riep, tot, extra = '') => `
  <FatturaElettronicaBody>
    <DatiGenerali><DatiGeneraliDocumento><TipoDocumento>TD01</TipoDocumento><Divisa>EUR</Divisa><Data>${data}</Data><Numero>${num}</Numero>${extra}<ImportoTotaleDocumento>${tot}</ImportoTotaleDocumento></DatiGeneraliDocumento></DatiGenerali>
    <DatiBeniServizi>${righe}${riep}</DatiBeniServizi>
  </FatturaElettronicaBody>`;
  return testaXml('ISO-8859-1', anagrafica('05678901234', '<Denominazione>CARBURANTI FINTI SPA</Denominazione>'), cesNoiXml)
    + corpo('G-101', '2025-07-01', '<DettaglioLinee><NumeroLinea>1</NumeroLinea><Descrizione>GASOLIO AGRICOLO QUALITÀ SUPERIORE</Descrizione><Quantita>1000.00</Quantita><UnitaMisura>LT</UnitaMisura><PrezzoUnitario>1.10</PrezzoUnitario><PrezzoTotale>1100.00</PrezzoTotale><AliquotaIVA>22.00</AliquotaIVA></DettaglioLinee>',
      '<DatiRiepilogo><AliquotaIVA>22.00</AliquotaIVA><ImponibileImporto>1100.00</ImponibileImporto><Imposta>242.00</Imposta></DatiRiepilogo>', '1336.99',
      '<ScontoMaggiorazione><Tipo>SC</Tipo><Importo>5.00</Importo></ScontoMaggiorazione><Arrotondamento>-0.01</Arrotondamento>')
    + corpo('G-102', '2025-07-02', '<DettaglioLinee><NumeroLinea>1</NumeroLinea><Descrizione>OLIO LUBRIFICANTE</Descrizione><Quantita>2.00</Quantita><PrezzoUnitario>25.00</PrezzoUnitario><PrezzoTotale>50.00</PrezzoTotale><AliquotaIVA>22.00</AliquotaIVA></DettaglioLinee>',
      '<DatiRiepilogo><AliquotaIVA>22.00</AliquotaIVA><ImponibileImporto>50.00</ImponibileImporto><Imposta>11.00</Imposta></DatiRiepilogo>', '61.00')
    + fineXml;
}

const utf8 = s => new TextEncoder().encode(s);
const latin1 = s => Uint8Array.from([...s], ch => { const c = ch.charCodeAt(0); if (c > 255) throw new Error('carattere fuori da ISO-8859-1: ' + ch); return c; });
// File firmato .p7m finto: busta binaria come quella dei programmi di firma (CAdES: SignedData, algoritmo SHA-256,
// contenuto "data" in un OCTET STRING a pezzi) con l'XML spezzato in pezzi da 1000 byte, ognuno preceduto
// dall'intestazione 0x04 0x82 0x03 0xE8, e una "firma" finta in fondo (niente certificati veri).
function p7m(xml) {
  const testa = [0x30, 0x80, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x07, 0x02, 0xa0, 0x80, 0x30, 0x80, 0x02, 0x01, 0x01,
    0x31, 0x0f, 0x30, 0x0d, 0x06, 0x09, 0x60, 0x86, 0x48, 0x01, 0x65, 0x03, 0x04, 0x02, 0x01, 0x05, 0x00,
    0x30, 0x80, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x07, 0x01, 0xa0, 0x80, 0x24, 0x80];
  const out = [...testa];
  for (let i = 0; i < xml.length; i += 1000) {
    const pezzo = xml.subarray(i, i + 1000);
    if (pezzo.length === 1000) out.push(0x04, 0x82, 0x03, 0xe8); else out.push(0x04, 0x82, pezzo.length >> 8, pezzo.length & 255);
    out.push(...pezzo);
  }
  out.push(0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xa0, 0x82, 0x01, 0x00, ...utf8('FIRMA FINTA PER LE PROVE'), 0x00, 0x00, 0x00, 0x00);
  return Uint8Array.from(out);
}
const base64 = b => Buffer.from(b).toString('base64').replace(/.{76}/g, '$&\r\n');

/* ======================= cedolini (modulo a moduli fissi, A4) ======================= */
// Le etichette del modulo sono stampate sulla carta: nel PDF ci sono solo i valori, per posizione. La riga del mese è
// a 792,5, quella delle ferie a 797 (la più bassa): così il lettore non sposta niente (dy = 0).
function cedolino(d) {
  const p = new Pagina();
  if (d.livello) p.t(460, 95.5, d.livello);
  if (d.matricola) p.t(545, 95.5, d.matricola);
  if (d.cf) p.t(90, 119.5, d.cf);
  if (d.nome) p.t(320, 119.5, d.nome);
  if (d.contratto) { p.t(40, 143.9, d.contratto); p.t(70, 143.9, d.qualifica); p.t(230, 143.9, d.mansione); p.t(495, 143.9, d.nascita); }
  const date = [['assunzione', 40], ['anzianita', 100], ['scatto', 170], ['permesso', 270], ['scadTD', 320], ['visita', 365], ['cessazione', 510]];
  for (const [k, x] of date) if (d[k]) p.t(x, 192.3, d[k]);
  if (d.pagaBase) { p.d(105, 216.5, d.pagaBase); p.d(570, 240.7, d.pagaBase); }
  if (d.ore) { p.d(85, 264.9, d.ore); p.d(125, 264.9, d.giorni); p.d(170, 264.9, '169'); p.d(275, 264.9, d.giorni); }
  (d.voci || []).forEach((v, i) => {
    const y = 300 + 9 * i; p.t(40, y, v[0]); p.t(75, y, v[1]);
    const [neutro, tempo, unit, comp, tratt] = v.slice(2);
    if (neutro) p.d(325, y, neutro); if (tempo) p.d(370, y, tempo); if (unit) p.d(440, y, unit); if (comp) p.d(505, y, comp); if (tratt) p.d(570, y, tratt);
  });
  if (d.enti) { d.enti.forEach(([e, v], i) => { p.t(240 + 80 * i, 615.5, e); p.d(280 + 80 * i, 627.6, v); }); }
  if (d.impPrev) { p.d(105, 627.6, d.impPrev); p.d(570, 627.6, d.ritPrev); }
  if (d.impFisc) { p.d(105, 651.8, d.impFisc); p.d(168, 651.8, d.irpefLorda); p.d(228, 651.8, d.detrazioni); p.d(570, 651.8, d.irpef); }
  if (d.lordo) p.d(105, 700.2, d.lordo);
  if (d.tfr) { p.d(105, 724.4, d.lordo); p.d(338, 724.4, d.tfr); }
  p.d(505, 748.6, d.totComp); p.d(570, 748.6, d.totTratt);
  if (d.permessi) [72, 105, 130, 170].forEach((x, i) => p.d(x, 772.8, d.permessi[i]));
  if (d.arr) { p.d(505, 772.8, d.arr[0]); p.d(570, 772.8, d.arr[1]); }
  p.t(40, 792.5, d.mese); p.t(90, 792.5, d.anno); p.d(570, 792.5, d.netto);
  if (d.ferie) [72, 105, 130, 168, 200].forEach((x, i) => p.d(x, 797, d.ferie[i]));
  if (d.totali) { p.t(320, 119.5, 'Totali generali'); p.t(550, 100, d.dipendenti); }
  return p;
}
// Novembre 2025, due dipendenti e la pagina dei totali generali.
// ROSSI MARIO: paga 168 h × 10,00 = 1.680,00 + straordinario 10 h × 12,50 = 125,00 → competenze 1.805,00;
//   trattenute: sindacale 15,00 + anticipo 200,00 + contributi 160,00 (INPS 150 + CIMACLA 10) + IRPEF 250,00 = 625,00;
//   netto = 1.805,00 − 625,00 − 0,40 (arrotondamento precedente) + 0,60 (corrente) = 1.180,20
// VERDI LUIGI (tempo determinato fino al 31/12/2025): 150 h × 9,50 = 1.425,00; contributi 126,00 + IRPEF 100,00 = 226,00;
//   netto 1.199,00
// Totali generali: lordo 1.805 + 1.425 = 3.230,00; netto 1.180,20 + 1.199,00 = 2.379,20; 2 dipendenti
function cedolini() {
  const rossi = cedolino({
    livello: '3', matricola: '000012', cf: 'RSSMRA80A01H501U', nome: 'ROSSI MARIO', contratto: 'OTI', qualifica: 'OPERAIO AGRICOLO', mansione: 'MUNGITORE', nascita: '01/01/1980',
    assunzione: '01/03/2020', anzianita: '01/03/2020', scatto: '01/03/2026', visita: '15/06/2026', pagaBase: '1.650,00', ore: '168', giorni: '26',
    voci: [['1.0001', 'PAGA ORARIA', '', '168,00', '10,00000', '1.680,00'], ['1.0050', 'STRAORDINARIO', '', '10,00', '12,50000', '125,00'],
      ['2.0100', 'TRATTENUTA SINDACALE', '', '', '', '', '15,00'], ['3.0001', 'ANTICIPO SU RETRIBUZIONE', '', '', '', '', '200,00'], ['9.0001', 'ORE FERIE GODUTE', '8,00']],
    enti: [['INPS', '150,00'], ['CIMACLA', '10,00']], impPrev: '1.805,00', ritPrev: '160,00', impFisc: '1.645,00', irpefLorda: '390,00', detrazioni: '140,00', irpef: '250,00',
    lordo: '1.805,00', tfr: '133,70', totComp: '1.805,00', totTratt: '625,00', permessi: ['8,00', '8,00', '4,00', '12,00'], arr: ['0,40', '0,60'],
    mese: 'Novembre', anno: '2025', netto: '1.180,20', ferie: ['40,00', '13,33', '8,00', '45,33', '16,00'],
  });
  const verdi = cedolino({
    livello: '2', matricola: '000015', cf: 'VRDLGU90B15L483Z', nome: 'VERDI LUIGI', contratto: 'OTD', qualifica: 'OPERAIO AGRICOLO', mansione: 'TRATTORISTA', nascita: '15/02/1990',
    assunzione: '01/04/2025', anzianita: '01/04/2025', scadTD: '31/12/2025', pagaBase: '1.500,00', ore: '150', giorni: '23',
    voci: [['1.0001', 'PAGA ORARIA', '', '150,00', '9,50000', '1.425,00']],
    enti: [['INPS', '116,00'], ['CIMACLA', '10,00']], impPrev: '1.425,00', ritPrev: '126,00', impFisc: '1.299,00', irpefLorda: '300,00', detrazioni: '200,00', irpef: '100,00',
    lordo: '1.425,00', tfr: '105,56', totComp: '1.425,00', totTratt: '226,00',
    mese: 'Novembre', anno: '2025', netto: '1.199,00', ferie: ['20,00', '13,33', '0,00', '33,33', '0,00'],
  });
  const totali = cedolino({ totali: true, dipendenti: '2', lordo: '3.230,00', totComp: '3.230,00', totTratt: '851,00', mese: 'Novembre', anno: '2025', netto: '2.379,20', ferie: ['60,00', '26,66', '8,00', '78,66', '16,00'] });
  return [rossi, verdi, totali];
}
// Tredicesima 2025 di ROSSI MARIO: rateo 1.650,00; contributi 146,00 + IRPEF 300,00 = 446,00; netto 1.204,00
function cedolinoTredicesima() {
  return [cedolino({
    livello: '3', matricola: '000012', cf: 'RSSMRA80A01H501U', nome: 'ROSSI MARIO', contratto: 'OTI', qualifica: 'OPERAIO AGRICOLO', mansione: 'MUNGITORE', nascita: '01/01/1980',
    voci: [['1.0300', 'RATEO TREDICESIMA', '', '', '', '1.650,00'], ['1.0301', 'MESI DI MATURAZIONE', '12,00']],
    enti: [['INPS', '136,00'], ['CIMACLA', '10,00']], impPrev: '1.650,00', ritPrev: '146,00', impFisc: '1.504,00', irpefLorda: '300,00', detrazioni: '0,00', irpef: '300,00',
    lordo: '1.650,00', totComp: '1.650,00', totTratt: '446,00', mese: 'Tredicesima', anno: '2025', netto: '1.204,00', ferie: ['40,00', '0,00', '0,00', '40,00', '16,00'],
  })];
}

// Cedolino di novembre 2025 senza la riga delle ferie e dei permessi in fondo (non stampate): BIANCHI LUCA, 80 h × 9,50
// = 760,00; contributi 67,00 (INPS 57 + CIMACLA 10), IRPEF 0; netto 693,00. Fino alla 1.76.0 la pagina si scartava.
function cedolinoSenzaFerie() {
  return [cedolino({
    livello: '1', matricola: '000020', cf: 'BNCLCU95E10L483K', nome: 'BIANCHI LUCA', contratto: 'OTD', qualifica: 'OPERAIO AGRICOLO', mansione: 'AIUTO STALLA', nascita: '10/05/1995',
    assunzione: '01/11/2025', anzianita: '01/11/2025', scadTD: '30/11/2025', pagaBase: '1.500,00', ore: '80', giorni: '12',
    voci: [['1.0001', 'PAGA ORARIA', '', '80,00', '9,50000', '760,00'], ['1.0010', 'GIORNI LAVORATI', '12,00']],
    enti: [['INPS', '57,00'], ['CIMACLA', '10,00']], impPrev: '760,00', ritPrev: '67,00', impFisc: '693,00', irpefLorda: '120,00', detrazioni: '120,00', irpef: '0,00',
    lordo: '760,00', totComp: '760,00', totTratt: '67,00', mese: 'Novembre', anno: '2025', netto: '693,00',
  })];
}

/* ======================= bilancino contabile delle paghe ======================= */
// Novembre 2025 (gli stessi due cedolini): lordo 3.230,00; ritenute previdenziali 286,00 (160 + 126), fiscali 350,00
// (250 + 100), su netto 215,00 (sindacale + anticipo), arrotondamenti −0,40 e +0,60:
//   netto = 3.230 − 286 − 350 − 215 − 0,40 + 0,60 = 2.379,20
//   contributi ditta = altri 290,00 − TFR al fondo 230,00 + INPS 800,00 = 860,00
//   costo = 3.230 + 860 + 230 = 4.320,00; versamenti = INPS 1.086,00 + IRPEF 350,00 = 1.436,00
function bilancinoPaghe() {
  const p = new Pagina();
  p.t(200, 40, 'BILANCINO CONTABILE', { size: 9, font: 'B' });
  p.t(40, 55, 'Ditta'); p.t(120, 55, NOI.nome);
  p.t(40, 65, 'Mese'); p.t(120, 65, 'Novembre 2025');
  p.t(40, 75, 'N.dip.forza'); p.t(550, 75, '2');
  p.t(40, 95, 'Descrizione'); p.d(280, 95, 'Oneri ditta'); p.d(386, 95, 'Oneri dipen.'); p.d(465, 95, 'Oneri enti'); p.d(567, 95, 'Debito/Cred.');
  const col = { ditta: 280, dip: 386, enti: 465, debito: 567 };
  const righe = [
    ['RETRIBUZIONE LORDA', { ditta: '3.230,00' }], ['RITENUTE PREVIDENZIALI', { dip: '286,00-' }], ['RITENUTE FISCALI', { dip: '350,00-' }],
    ['RITEN. COMPET. SU NETTO', { dip: '215,00-' }], ['ARROTONDAMENTO PRECEDENTE', { ditta: '0,40-' }], ['ARROTONDAMENTO CORRENTE', { ditta: '0,60' }],
    ['NETTO PAGATO', { dip: '2.379,20' }], ['TOTALE INPS', { ditta: '800,00', dip: '286,00', debito: '1.086,00' }], ['TFR F.P.C.', { ditta: '230,00' }],
    ['TOTALE ALTRI CONTRIBUTI', { ditta: '290,00' }], ['TOTALE IRPEF', { debito: '350,00' }], ['COSTO TOTALE AZIENDALE', { ditta: '4.320,00' }],
    ['VERSAMENTI DI COMPETENZA', { ditta: '1.436,00' }],
  ];
  let y = 110;
  for (const [lab, v] of righe) { p.t(40, y, lab); for (const [k, x] of Object.entries(v)) p.d(col[k], y, x); y += 9; }
  // parte bassa: due coppie etichetta/valore sulla stessa riga
  y += 6; p.t(40, y, 'IMPONIBILE PREVIDENZIALE'); p.d(280, y, '3.230,00'); p.t(320, y, 'IMPONIBILE FISCALE'); p.d(567, y, '2.944,00');
  return [p];
}

/* ======================= contabili di bonifico (home banking) ======================= */
// Distinta con tre bonifici del 27/11/2025: stipendio di ROSSI MARIO 1.180,20 (causale bancaria SALA), acconto a
// VERDI LUIGI 1.199,00 eseguito il 28/11 (data sua), saldo di una fattura a MANGIMI FINTI SRL 1.181,60.
function bonifici() {
  const p = new Pagina();
  p.t(40, 40, 'Contabile di bonifico SEPA', { size: 10, font: 'B' });
  let y = 60;
  const r = (a, b) => { p.t(40, y, a, { size: 8 }); if (b) p.t(180, y, b, { size: 8 }); y += 10; };
  r('Denominazione Ordinante', NOI.nome); r('Data esecuzione', '27/11/2025'); y += 10;
  r('Beneficiario', 'ROSSI MARIO'); r('IBAN beneficiario', IBAN); r('Importo', 'EUR 1.180,20'); r('Causale', 'STIPENDIO MESE DI NOVEMBRE 2025 ROSSI MARIO');
  r('Causale bancaria', 'SALA'); r('Identificativo disposizione', '0000123456789012'); r('Stato', 'Eseguito'); y += 10;
  r('Beneficiario', 'VERDI LUIGI'); r('IBAN beneficiario', 'IT60X0542811101000000654321'); r('Data esecuzione', '28/11/2025'); r('Importo', 'EUR 1.199,00');
  r('Causale', 'acconto stipendio novembre'); r('CRO', 'ABCDEF123456'); y += 10;
  r('Beneficiario', MANGIMI.nome); r('IBAN beneficiario', 'IT60X0542811101000000999999'); r('Importo', 'EUR 1.181,60'); r('Causale', 'SALDO FT 123/A DEL 10/03/2025');
  return [p];
}

/* ======================= estratti conto ======================= */
// Estratto con le colonne DARE e AVERE (novembre 2025): descrizioni su più righe, una spesa della banca, un addebito
// diretto con la valuta diversa dalla data, la riga del saldo finale (da scartare; saldo iniziale zero:
// −1.180,20 + 12.345,67 − 2,50 − 350,00 = 10.812,97).
//   03/11 −1.180,20 stipendio a ROSSI MARIO (IBAN e "RICON." nelle righe sotto)
//   05/11 +12.345,67 latte dal CASEIFICIO FINTO SPA (Ordinante, Causale)
//   10/11 −2,50 imposta di bollo; 15/11 (valuta 14/11) −350,00 SDD di FINTA ENERGIA SPA
function estrattoConto() {
  const p = new Pagina();
  p.t(40, 40, 'ESTRATTO CONTO CORRENTE', { size: 9, font: 'B' });
  p.t(40, 52, 'BANCA FINTA - Conto n. 000000001234');
  p.t(40, 62, 'Periodo dal 01/11/2025 al 30/11/2025');
  p.t(40, 75, 'DATA'); p.t(90, 75, 'VALUTA'); p.t(190, 75, 'DARE'); p.t(250, 75, 'AVERE'); p.t(310, 75, 'DESCRIZIONE OPERAZIONE');
  const mov = (y, data, val, dare, avere, desc) => {
    p.t(40, y, data); p.t(90, y, val); if (dare) p.d(220, y, dare); if (avere) p.d(285, y, avere);
    desc.forEach((d, i) => p.t(310, y + 9 * i, d));
  };
  mov(95, '03/11/2025', '03/11/2025', '1.180,20', '', ['BONIFICO A FAVORE DI ROSSI MARIO', 'IBAN ' + IBAN, 'RICON. STIPENDIO NOVEMBRE 2025']);
  mov(128, '05/11/2025', '05/11/2025', '', '12.345,67', ['BONIFICO DA CASEIFICIO FINTO SPA', 'Ordinante: CASEIFICIO FINTO SPA Causale: LATTE OTTOBRE 2025']);
  mov(152, '10/11/2025', '10/11/2025', '2,50', '', ['IMPOSTA DI BOLLO']);
  mov(167, '15/11/2025', '14/11/2025', '350,00', '', ['ADDEBITO SDD CORE FINTA ENERGIA SPA', 'CRED. FINTA ENERGIA SPA ID.MANDATO 0000123']);
  mov(195, '30/11/2025', '30/11/2025', '', '10.812,97', ['SALDO FINALE']);
  return [p];
}
// "Lista movimenti" con una sola colonna IMPORTO e il segno davanti (staccato o attaccato) e il saldo contabile in
// testa; l'ultima riga è il saldo, senza descrizione (saldo iniziale zero: −1.180,20 + 12.345,67 − 2,50 = 11.162,97).
//   03/11 −1.180,20 (segno "-" staccato), 05/11 +12.345,67, 10/11 −2,50 commissioni
function listaMovimenti() {
  const p = new Pagina();
  p.t(40, 40, 'LISTA MOVIMENTI', { size: 9, font: 'B' });
  p.t(40, 52, 'SALDO CONTABILE + 11.162,97 €');
  p.t(40, 65, 'DATA MOV.'); p.t(90, 65, 'VALUTA'); p.t(200, 65, 'IMPORTO'); p.t(310, 65, 'DESCRIZIONE');
  const mov = (y, data, segno, imp, desc) => {
    p.t(40, y, data); p.t(90, y, data);
    if (segno) p.t(192, y, segno);
    p.d(230, y, imp); p.t(235, y, '€');
    desc.forEach((d, i) => p.t(310, y + 9 * i, d));
  };
  mov(95, '03/11/2025', '-', '1.180,20', ['BONIFICO A FAVORE DI ROSSI MARIO', 'RICON. STIPENDIO NOVEMBRE 2025']);
  mov(119, '05/11/2025', '', '+12.345,67', ['BONIFICO DA CASEIFICIO FINTO SPA']);
  mov(134, '10/11/2025', '', '-2,50', ['COMMISSIONI TENUTA CONTO']);
  mov(170, '30/11/2025', '', '+11.162,97', []);
  return [p];
}

/* ======================= dichiarazione IVA annuale ======================= */
// Modello IVA 2026, periodo d'imposta 2025. Codici dei righi in grassetto a sinistra (VE24 e VL2 scritti in due
// pezzi, "VE" e "24", come in alcuni programmi), descrizioni in Helvetica, numeri delle colonne piccoli (corpo 5),
// importi in Courier. Valori:
//   VE21 aliquota 10: 120.000 / 12.000 (l'aliquota stampata davanti va scartata); VE24 120.000 / 12.000;
//   VE26 12.000; VE50 120.000; VF9 aliquota 22: 40.000 / 8.800; VF25 45.000; VF27 8.800; VF29 10.000; VF71 8.800;
//   VL1 12.000; VL2 8.800; VL3 3.200 (12.000 − 8.800); VX1 3.200. Sulla pagina 2 VL1 ripetuto con 12.500: avviso.
function dichiarazioneIva() {
  const p = new Pagina(), q = new Pagina();
  p.t(40, 40, 'Modello IVA 2026 - Dichiarazione IVA', { size: 9, font: 'B' });
  p.t(40, 52, "Dati della dichiarazione per il periodo d'imposta 2025 - AZIENDA AGRICOLA FINTA S.S.");
  const rigo = (pg, y, cod, desc, valori, etichette = false, diviso = false) => {
    if (diviso) { pg.t(40, y, cod.slice(0, 2), { size: 8, font: 'B' }); pg.t(40 + larghezza(cod.slice(0, 2), 8, 'B') + 1, y, cod.slice(2), { size: 7, font: 'B' }); }
    else pg.t(40, y, cod, { size: 8, font: 'B' });
    pg.t(70, y, desc, { size: 8 });
    const [al, c1, c2] = valori;
    if (al) pg.t(300, y, al, { size: 9, font: 'C' });
    if (etichette) { pg.t(330, y, '1', { size: 5 }); if (c2) pg.t(440, y, '2', { size: 5 }); }
    if (c1) pg.d(420, y, c1, { size: 9, font: 'C' });
    if (c2) pg.d(540, y, c2, { size: 9, font: 'C' });
  };
  p.t(40, 75, 'QUADRO VE - OPERAZIONI ATTIVE', { size: 8, font: 'B' });
  rigo(p, 95, 'VE21', 'Cessioni con aliquota', ['10', '120.000', '12.000']);
  rigo(p, 113, 'VE24', 'Totale righi da 20 a 23', ['', '120.000', '12.000'], true, true);
  rigo(p, 131, 'VE26', 'Totale imposta', ['', '12.000']);
  rigo(p, 149, 'VE50', "Volume d'affari", ['', '120.000']);
  p.t(40, 175, 'QUADRO VF - OPERAZIONI PASSIVE', { size: 8, font: 'B' });
  rigo(p, 195, 'VF9', 'Acquisti con aliquota', ['22', '40.000', '8.800']);
  rigo(p, 213, 'VF25', 'Totale acquisti e importazioni', ['', '45.000'], true);
  rigo(p, 231, 'VF27', 'Totale imposta sugli acquisti', ['', '8.800']);
  rigo(p, 249, 'VF29', 'Beni ammortizzabili', ['', '10.000']);
  rigo(p, 267, 'VF71', 'Imposta ammessa in detrazione', ['', '8.800']);
  p.t(40, 293, "QUADRO VL - LIQUIDAZIONE DELL'IMPOSTA ANNUALE", { size: 8, font: 'B' });
  rigo(p, 313, 'VL1', 'Imposta a debito', ['', '12.000']);
  rigo(p, 331, 'VL2', 'Imposta detraibile', ['', '8.800'], false, true);
  rigo(p, 349, 'VL3', 'Imposta dovuta', ['', '3.200']);
  p.t(40, 375, 'QUADRO VX - DETERMINAZIONE DEL CREDITO O DEL DEBITO', { size: 8, font: 'B' });
  rigo(p, 395, 'VX1', 'Importo da versare', ['', '3.200']);
  q.t(40, 40, 'Segue quadro VL', { size: 8, font: 'B' });
  rigo(q, 60, 'VL1', 'Imposta a debito', ['', '12.500']);
  return [p, q];
}
// Telematico (record da 1.900 caratteri): A con "IVA26" (anno 2025), B senza quadri, due D (moduli 1 e 2) con i
// campi a partire dalla colonna 90 in blocchi da 24 (codice 8 + valore 16), una riga con i campi spostati (si cerca
// il codice ovunque), Z da ignorare. VF9 è in tutti e due i moduli: 30.000 + 10.000 = 40.000, 6.600 + 2.200 = 8.800.
function telematico() {
  const rec = s => (s.length > 1897 ? s.slice(0, 1897) : s.padEnd(1897)) + 'A\r\n';
  const campi = cs => cs.map(([c, v]) => c + String(v).padStart(16)).join('');
  const d = (mod, cs) => rec('D' + NOI.piva.padEnd(16) + String(mod).padStart(8, '0') + ' '.repeat(64) + campi(cs));
  return rec('A' + ' '.repeat(14) + 'IVA26' + '10' + NOI.piva.padEnd(16))
    + rec('B' + NOI.piva.padEnd(16) + '00000001' + ' '.repeat(20) + NOI.nome)
    + d(1, [['VE024001', 120000], ['VE024002', 12000], ['VE026001', 12000], ['VE050001', 120000], ['VF009001', 30000], ['VF009002', 6600]])
    + d(2, [['VF009001', 10000], ['VF009002', 2200], ['VF025001', 45000], ['VF027001', 8800], ['VF029001', 10000], ['VF071001', 8800], ['VL001001', 12000], ['VL002001', 8800], ['VL003001', 3200], ['VX001001', 3200]])
    + rec('D' + NOI.piva.padEnd(16) + '00000003' + ' '.repeat(25) + campi([['VJ019001', 0]]))
    + rec('Z' + ' '.repeat(14) + campi([['VE024001', 999999]]));
}

/* ======================= bilancino del commercialista (situazione al 31/12) ======================= */
// Colonne: %, periodo ("RICAVI/COSTI PERIODO"), progressivo. Ricavi 328.000,00, costi 92.200,00, utile 235.800,00.
//   RICAVI: 58/50/001 VENDITA LATTE 300.000 (parola LATTE → riga 8); 58/52/001 VENDITA CEREALI 20.000 (codice → 10);
//           58/99/001 ALTRI RICAVI 8.000 diviso in VENDITA VITELLI 5.000 (→ 9) e CONTRIBUTI PSR 3.000 (→ 21)
//   COSTI:  66/54/001 ACQUISTO MANGIMI 80.000 (codice → 30); 66/99/010 CONCIMI 6.000 (→ 32); 66/99/020 SPESE VARIE
//           4.000 (predefinito acquisti 66 → 37); 70/99/001 ONERI DIVERSI 1.500 (predefinito costi → 50);
//           68/05/325 SPESE TELEFONICHE 1.200 (codice → 47); 66/99/030 RESI SU ACQUISTI MANGIMI −500 (→ 30)
//   riga 30 = 80.000 − 500 = 79.500
function bilancino() {
  const p = new Pagina();
  p.t(40, 40, 'Ditta'); p.t(80, 40, NOI.nome);
  p.t(40, 50, 'Partita IVA'); p.t(100, 50, NOI.piva);
  p.t(200, 65, 'SITUAZIONE CONTABILE AL 31/12/2025', { size: 9, font: 'B' });
  p.t(40, 80, 'CONTO'); p.t(100, 80, 'DESCRIZIONE'); p.d(360, 80, '%'); p.d(470, 80, 'RICAVI/COSTI PERIODO'); p.d(560, 80, 'PROGRESSIVO');
  let y = 95;
  const sez = s => { p.t(40, y, s); y += 12; };
  const conto = (c, d, v, perc) => { p.t(40, y, c); p.t(100, y, d); if (perc) p.d(360, y, perc); p.d(470, y, v); p.d(560, y, v); y += 10; };
  const dett = (d, v) => { p.t(110, y, d); p.d(470, y, v); y += 10; };
  const tot = (d, v) => { y += 3; p.t(100, y, d); p.d(470, y, v); p.d(560, y, v); y += 12; };
  sez('RICAVI');
  conto('58/50/001', 'VENDITA LATTE', '300.000,00', '91,46');
  conto('58/52/001', 'VENDITA CEREALI', '20.000,00');
  conto('58/99/001', 'ALTRI RICAVI', '8.000,00'); dett('VENDITA VITELLI', '5.000,00'); dett('CONTRIBUTI PSR', '3.000,00');
  tot('TOTALE RICAVI', '328.000,00');
  sez('COSTI');
  conto('66/54/001', 'ACQUISTO MANGIMI', '80.000,00');
  conto('66/99/010', 'CONCIMI E FERTILIZZANTI', '6.000,00');
  conto('66/99/020', 'SPESE VARIE DI STALLA', '4.000,00');
  conto('70/99/001', 'ONERI DIVERSI', '1.500,00');
  conto('68/05/325', 'SPESE TELEFONICHE', '1.200,00');
  conto('66/99/030', 'RESI SU ACQUISTI MANGIMI', '500,00-');
  tot('TOTALE COSTI', '92.200,00');
  tot('UTILE FISCALE', '235.800,00');
  y += 10; p.t(40, y, 'ELABORATO DA STUDIO FINTO');
  y += 15; p.t(100, y, 'RIDETERMINAZIONE DEL RISULTATO AI FINI IRAP', { size: 9, font: 'B' });
  y += 12; p.t(100, y, "UTILE (PERDITA) DELL'ESERCIZIO"); p.d(560, y, '235.800,00');
  return [p];
}

/* ======================= elenco dei file ======================= */
export function documenti() {
  const xml = utf8(fatturaXml());
  const firmato = p7m(xml);
  return {
    'fattura-ade.pdf': creaPdf(fatturaAde()),
    'fattura-ade-autofattura.pdf': creaPdf(fatturaAdeAutofattura()),
    'fattura-ade-nota-credito.pdf': creaPdf(fatturaAdeNotaCredito()),
    'fattura-gamma.pdf': creaPdf(fatturaGamma()),
    'fattura-gamma-autofattura.pdf': creaPdf(fatturaGammaAutofattura()),
    'fattura-latte.pdf': creaPdf(fatturaLatte()),
    'fattura.xml': xml,
    'fattura.xml.p7m': firmato,
    'fattura-base64.xml.p7m': utf8(base64(firmato)),
    'nota-credito.xml': utf8(notaCreditoXml()),
    'parcella-ritenuta.xml': utf8(ritenutaXml()),
    'parcella-cassa.xml': utf8(cassaXml()),
    'lotto-latin1.xml': latin1(latin1Xml()),
    'cedolini.pdf': creaPdf(cedolini()),
    'cedolino-tredicesima.pdf': creaPdf(cedolinoTredicesima()),
    'cedolino-senza-ferie.pdf': creaPdf(cedolinoSenzaFerie()),
    'bilancino-paghe.pdf': creaPdf(bilancinoPaghe()),
    'bonifici.pdf': creaPdf(bonifici()),
    'estratto-conto.pdf': creaPdf(estrattoConto()),
    'lista-movimenti.pdf': creaPdf(listaMovimenti()),
    'dichiarazione-iva.pdf': creaPdf(dichiarazioneIva()),
    'iva-telematico.txt': latin1(telematico()),
    'bilancino.pdf': creaPdf(bilancino()),
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  for (const [nome, b] of Object.entries(documenti())) writeFileSync(new URL(nome, import.meta.url), b);
  console.log('documenti finti riscritti in prove/documenti/');
}
