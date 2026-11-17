---
paths:
  - "js/conti/paghe-parse.js"
  - "js/conti/paghe.js"
  - "js/conti/bonifici-parse.js"
  - "js/conti/banca.js"
  - "js/conti/ocr-testo.js"
  - "js/conti/sospesi.js"
  - "js/views/conti-personale.js"
  - "js/views/conti-verifiche.js"
---

# Conti: personale (paghe) e banca

(Spostato da CLAUDE.md il 17/11/2026. Si carica da solo quando si lavora su questi file.)

### Documenti della banca e fatture mancanti dall'archivio del PC (1.39.0, 16/11/2026)

- Chiesto da Marco: far cercare all'app, nell'archivio del PC, i documenti che mancano per pagamenti e fatture. Serve il ponte con `GET /file` (sopra): dopo l'aggiornamento il ponte va chiuso e riaperto.
- **Pagamenti** (`views/conti-personale.js`): pulsante "Cerca nell'archivio" (`c-pArch`) → `/documenti?area=04&anno=y` e gennaio di y+1, solo file leggibili (pdf, csv, txt, xls, xlsx) di tipo estratto conto / bonifico / distinta o sottoarea con estratti, bonifici, contabili. Foglio con le spunte: già letti (`giaLetti`: id `do-<imp>` e `imp` di `econfig` e `pagamenti`) senza spunta; con i cedolini spuntati solo i documenti dei mesi con cedolino e senza stipendio registrato e del mese dopo (`mesiScoperti`). "Leggi gli spuntati" (`c-pArchLeggi`): `scaricaFile` uno alla volta, poi `caricaMovimenti(files)` come il pulsante dei file (PDF insieme, al massimo 40; Excel e CSV uno alla volta). Niente si salva prima della revisione.
- **Fatture mancanti** (`views/conti-verifiche.js`): nella colonna "Sul PC" pulsante "Carica" (`c-msCarica`, `data-imps`) e nel riquadro "Carica le N trovate con certezza" (solo `certo`); i file vanno a `leggiDaFile(files)` di `views/conti.js`, che apre Carica documenti e usa `leggiFiles`. Instradamento `/^c-ms[A-Z]/` → `mancantiAct`.
- Provato con un catalogo finto (`ARCHIVIO_DATI` in una cartella temporanea, estratto conto CSV e fattura XML inventati) e il ponte avviato con l'origine di prova aggiunta solo nello script di prova: origine sbagliata 403, documento inesistente 404; dall'app l'estratto conto arriva nella revisione dei movimenti (2 righe) e la fattura in Carica documenti pronta da salvare. Non provato sull'archivio vero.

### Personale (paghe) — `paghe-parse.js`, `paghe.js`, `views/conti-personale.js`

- **Cedolini** (modulo Data Services, un dipendente per pagina + pagina "Totali generali"): lettura per posizione (riferimento: la riga più bassa del modulo a y≈797; la riga del mese a 792). Campi: anagrafica, CF, qualifica, scadenze TD e permesso di soggiorno, ore, lordo, contributi, IRPEF, netto, TFR, voci, ferie/permessi. Mensilità aggiuntive: "13-esima", "14-esima", "tredicesima", "13ª" → mese 13/14 (periodo `AAAA-13`, `AAAA-14`; si pagano da dicembre / da giugno, `pagabileDa`).
- **Bilancino paghe** mensile: lordo, ritenute, netto, contributi ditta/dipendente, INAIL, TFR al fondo, IRPEF, costo aziendale, versamenti.
- **Pagamenti** (raccolta `pagamenti`): stipendio, anticipo (recupero dal bonifico o in busta), prestito, restituzione (dal bonifico / in busta / versata), F24, contributi INPS agricoli (trimestrali), fondo pensione, altro.
- **Abbinamento pagamenti → mesi** (`abbina` in `paghe.js`, testato con `t_abb.mjs`):
  1. mese indicato a mano o **scritto nella causale** (`competenzaDaCausale` in `bonifici-parse.js`: se manca l'anno si usa il mese più vicino alla data del pagamento; "via XX Settembre", "15 marzo" e date non contano) — si contano per primi;
  2. gli altri, in ordine di data, ai mesi già pagabili alla data del pagamento e non saldati (prima quello con residuo uguale all'importo, poi il più vecchio); mai a un mese non ancora maturato salvo che sia l'unico aperto (anticipo);
  3. l'eccedenza va all'ultimo mese pagato; senza cedolino → "senza cedolino" sul mese prima della data.
- **Doppioni**: stesso tipo, stesso dipendente (o beneficiario), stesso importo e **stessa data** = stesso pagamento → `eliminaDoppi()` li cancella in automatico (all'apertura dei Conti e dopo ogni importazione). Date diverse entro 5 giorni → avviso rosso. In importazione `segnaDoppi()` deseleziona i movimenti già registrati.
- **Nomi**: tabella "Nomi nei pagamenti" (Dipendenti) = alias per dipendente (`d-<chiave>` in `paghe`), vince sul riconoscimento automatico anche per i pagamenti già importati (non per quelli assegnati a mano, `dipManuale`). Omonimi (es. due dipendenti con lo stesso nome e CF diversi) mostrati con l'anno di nascita o con il "nome da mostrare"; un bonifico al solo nome comune resta da scegliere. Unione manuale "è la stessa persona" (`u-<chiave>`), annullabile.
- **Controlli/irregolarità**: stipendi non pagati / in parte / in più / in ritardo, pagamenti in contanti (L. 205/2017), anticipi non trattenuti in busta, prestiti non restituiti da cessati, cedolini mancanti, lordi/netti che non tornano con bilancino o totali, F24/contributi/fondo non registrati, contratti a termine e permessi di soggiorno scaduti. "Ignora tutti" (testi in `econfig.cfg.pagheIgnora`).
- Viste: Riepilogo, Dipendenti (+ tabella nomi), Cedolini e bilancini, Pagamenti (import estratto/bonifici), Anticipi e prestiti, Verifica (matrice dipendenti × mesi, versamenti, scadenze).

### Banca — `bonifici-parse.js`, `banca.js`, `ocr-testo.js`

- Contabili di bonifico PDF (BCC Banca 360): beneficiario, IBAN, data esecuzione, importo, causale, causale bancaria SALA, identificativo.
- Estratto conto PDF (con testo o immagine → OCR: dalla 1.45.0 prima PP-OCR sul PC con il ponte, `POST /ocr` in `archivio-ponte.md`; senza ponte Tesseract con soglia bianco/nero 200), CSV/Excel: movimenti con data, valuta, importo con segno, descrizione su più righe; `arricchisci` ricava controparte, IBAN (corretto con il controllo mod-97 per gli errori dell'OCR), causale, tipo operazione.
- Abbinamento alle **fatture** (`candidateFatture`): numero fattura nella causale, controparte + importo, più fatture della stessa controparte pagate insieme (somma esatta); i pagamenti finiscono in `fattura.pagamentiBanca` (colonna "In banca" e filtri nel registro fatture).
- **1.41.0 (17/11/2026)**, dopo il caricamento dei veri estratti 2025-2026 del conto aziendale Banca 360: `movimentiDaParole` scarta le righe dei saldi (descrizione fatta solo di importo, "+ 588.262,49 €", o "SALDO…"), prima lette come entrate. `nonAbbinate` in `sospesi.js` segna `altrove`: `'riba'` (pagamento MP12: la banca addebita le RiBa del mese con un solo movimento "PAGAMENTO EFFETTI/RIBA … ADDEBITO RI.BA." senza numeri di fattura; provato l'abbinamento per somma esatta delle scadenze: con finestre larghe dà somme esatte per caso, quindi niente abbinamento automatico) e `'conto'` (ditta o cliente mai abbinato a un movimento: di solito un altro conto). In sospeso solo le altre sono un avviso; RiBa e "mai vista" sono informazioni, e la tabella `ssbanca` ha la colonna "Perché". Sui dati veri: da 620 + 65 fatture "senza pagamento" a 64 ricevute e 20 emesse da controllare. Il latte (circa 3 milioni l'anno) e i bonifici grossi non passano dal conto aziendale.
