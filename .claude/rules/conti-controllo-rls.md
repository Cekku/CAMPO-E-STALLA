# Conti: fatture mancanti e reddito lordo standard (dalla 1.16.0)

## Fatture mancanti — `js/conti/elenco.js`, `vMancanti` in `js/views/conti-verifiche.js`
- Elenco annuale delle fatture in Excel (formato del portale fatture: colonne Tipologia, Numero, Data fattura, Partita iva fornitore/cliente, Codice fiscale, Denominazione, Totale IVA compresa, Pagata, Residuo…). `trovaElenco(fogli, nome)` cerca l'intestazione nelle prime 15 righe; tipo da "fornitore/cliente" o dal nome del file (`passiv`/`attiv`), anno dal nome del file o dalle date più frequenti.
- Si carica dalla pagina (input `c-elFile`, salvataggio immediato) o da Carica documenti (`leggiDocumento`: un .xlsx con l'elenco diventa `tipo: 'elenco'`, altrimenti è il vecchio modello del conto economico).
- Archivio: raccolta riservata `econfig`, id `el-<Acquisto|Vendita>-<anno>`. Nessuna modifica allo schema Supabase.
- `confronta(el, fatture)` (dalla 1.32.1 solo fatture dello stesso anno della riga dell'elenco, di solito `el.anno`): abbinamento in ordine P.IVA + numero normalizzato (solo lettere e cifre) → P.IVA + sole cifre del numero → P.IVA + data + totale (±0,02) → numero + data + totale. Ogni fattura caricata si usa una volta. Totale confrontato in valore assoluto (le note di credito nell'app sono negative, nell'elenco positive). Differenza oltre 0,05 € o data diversa = "Da controllare". "Non nell'elenco" = fatture caricate dello stesso tipo e anno non abbinate.
- Panoramica: `mancantiAnno(y)` aggiunge la voce in "Da sistemare".

## Reddito lordo standard — `js/conti/rls.js`, `vRls` in `js/views/conti-verifiche.js`
- Dal corso "Gestione economica dell'azienda agraria", serata 1 (riassunto nel documento claude.ai di Marco del 02/11/2026). Versione del relatore, non la definizione UE.
- PLV = imponibile delle righe di vendita con voce `plv` + corrispettivi (a mano). Spese varie = righe di acquisto con voce `sv`. Affitti = voce `aff` + affitti senza fattura (a mano). Salari = a mano, altrimenti costo del personale B.9 (che usa le paghe se il CE è vuoto). PAC = a mano, altrimenti CE righe 20+21.
- RLS = PLV − spese varie − affitti − salari; RLS con PAC; spese varie / PLV con soglie 25% (media) e 40% (allarme); ROI = RLS / capitale investito (a mano).
- Voce per categoria in `cfg.rlsCat['<tipo>|<categoria>']`; predefinite in `voce()`: acquisti tutto `sv` tranne affitti (`aff`) e materiali edili/investimenti/acquisto bestiame (`inv`); vendite tutto `plv` tranne contributi, rimborsi, indennizzi, plusvalenze, vendita di mezzi (`no`). "Da classificare" e differenze non dettagliate contano come spese varie.
- Valori a mano per anno in `bilanci[anno].rls` (campi `corrisp`, `affitti`, `salari`, `pac`, `capitale`) tramite l'azione generica `c-val` con `data-col="rls"`.
- Provato in Playwright con l'elenco vero (7 fatture, dicembre 2025) e fatture finte: numero con spazi diversi abbinato, nota di credito abbinata, totale diverso segnalato, 2 mancanti, 1 non nell'elenco; RLS, ROI ed esportazione Excel verificati a mano.
