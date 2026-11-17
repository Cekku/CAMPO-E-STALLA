---
paths:
  - "strumenti/archivio/**"
  - "js/views/archivio*.js"
  - "js/archivio-link.js"
  - "js/conti/originali.js"
  - "js/conti/automatico.js"
  - "js/conti/preventivi.js"
  - "js/views/conti-personale.js"
  - "js/views/conti-verifiche.js"
---

# Ponte archivio: contratto per l'app

(Spostato da CLAUDE.md il 17/11/2026. Si carica da solo quando si lavora su questi file.)

### Ponte archivio (`strumenti/archivio/ponte-archivio.py`, porta 1236) — contratto per l'app

- Avvio: `Archivio - ponte.bat`. Ascolta solo su 127.0.0.1; risponde solo se `Origin` è nell'elenco `ORIGINI` (come `ponte-lmstudio.py`: `https://cekku.github.io`, `http://localhost:8765`, `http://127.0.0.1:8765`) e se `Host` è `127.0.0.1:1236` o `localhost:1236` (contro il DNS rebinding); risponde anche alle richieste preliminari con `Access-Control-Allow-Private-Network`. POST solo con `Content-Type: application/json`. Errori: `{"errore": "testo"}` con 400/403/404/410/413/415/500; 503 se manca il catalogo. Legge il catalogo a ogni richiesta (connessione nuova, WAL): vede subito quello che fa `aggiorna`.
- Documento (oggetto `doc`, in elenchi e risposte): `id` (rowid, numero), `impronta` (SHA-256, stabile: usarla per i collegamenti salvati), `nome` (nome proposto, o quello del file), `nome_proposto`, `nome_file`, `cartella`, `estensione`, `genere` (documento/immagine/archivio/altro), `dimensione` (byte), `codice` ("02.3", o "02" senza sottoarea), `area` ("02 Fisco e contabilità"), `sotto`, `tipo`, `data` ("AAAA-MM-GG", "AAAA-MM" o null), `anno`, `controparte`, `persona`, `descrizione`, `confidenza` (alta/media/bassa), `stato`, `classificato_da` (regole/claude/llm/utente), `aggiornato`, `copie` (numero di copie presenti), `in_archivio` (almeno una copia in AZIENDA).
- `GET /stato` → `{versione: 1, contenuti, file_presenti, file_spariti, per_stato: {stato: n}, per_classificato_da: {…}, ultima_scansione, ultimo_aggiornamento: {quando, contenuti_nuovi, cambiati, classificati, modello, secondi} | null}`.
- `GET /aree` → `{aree: [{codice: "02", nome, n, da_rivedere, fuori, sotto: [{codice: "02.3", nome, n, da_rivedere, fuori}]}], senza_area}` (tutte le aree di `aree.json`, anche vuote; `fuori` = senza copie in AZIENDA).
- `GET /valori?area=02|02.3&dove=` → `{anni, tipi, controparti, persone, stati: [{v, n}], codici: [{codice, area, sotto}]}` per i menu dei filtri.
- `GET /documenti` con `q` (ricerca FTS5 nel testo e nei nomi dei file: tutte le parole, l'ultima anche come inizio di parola; i simboli si ignorano), `area` (codice), `anno` (o `-` = senza), `tipo`, `controparte`, `persona`, `stato`, `classificato_da`, `genere` (`-` = vuoto), `dove=fuori|azienda`, `spariti=1` (anche contenuti senza copie presenti), `ordina=-data` (predefinito; con `q` l'ordine è per pertinenza se non si indica) `|data|nome|aggiornato`, `limite` (50, massimo 500), `inizio` → `{totale, inizio, limite, documenti: [doc + (con q) estratto ("… parole [trovate] …" o null), trovato_nel_nome]}`. I riservati non hanno testo né nomi nell'indice: con `q` non escono mai.
- `GET /documenti/<id o impronta>` → `doc` + `copie_elenco: [{percorso, nome, cartella, sorgente, presente, modificato, in_archivio}]`, `fonte`, `primo_visto`, `testo: {esito, metodo, pagine, caratteri, inizio (primi 6.000 caratteri)}` (per i riservati solo `{esito, riservato: true}`), `registro: [{quando, chi, azione, percorso, dettagli}]` (ultimi 50).
- `GET /registro?limite=50` → `{registro: [{quando, chi, azione, id, nome, percorso, dettagli}]}`.
- `POST /apri` `{"id": 123, "percorso": "facoltativo, una delle copie", "cartella": false}` → apre il file con il programma di Windows (`os.startfile`), oppure con `cartella: true` apre Esplora file con il file selezionato. Solo percorsi del catalogo con il file ancora presente (404 se la copia non è del documento, 410 se il file non c'è più); niente eseguibili e script (`NON_APRIRE`). → `{aperto, cartella}`.
- `POST /correzioni` `{"123": {"a": "02.3", "t": "F24", "d": "2025-01", "c": "…", "p": "…", "x": "…", "n": "nome a mano"}, "456": {}}` (chiave vuota `{}` = conferma; `""` in un campo lo svuota; massimo 1.000) → `{aggiornati: [doc], errori: {id: testo}}`; le correzioni valide si salvano anche se altre hanno errori. `classificato_da='utente'`, stato `confermato`, registro con prima e dopo.
- `GET /file/<id o impronta>` (dalla 1.39.0, `VERSIONE = 2` del ponte) → il contenuto del file (prima copia presente, preferita `percorso_scelto`), `Content-Type` dall'estensione e nome in `X-Nome-File` (codificato, esposto con `Access-Control-Expose-Headers`). Solo `DA_LEGGERE` (pdf, xml, p7m, zip, xlsx, xls, csv, txt, jpg, png), al massimo 30 MB; 403 per i riservati, 410 file sparito, 409 se lo SHA-256 non è più quello del catalogo (file cambiato: rifare la scansione), 415 tipo non ammesso. Nell'app `scaricaFile(imp)` di `archivio-dati.js` restituisce un `File` (con un ponte vecchio il 404 "richiesta sconosciuta" diventa "chiudi e riapri il ponte"); `cerca(filtri)` = `/documenti` senza la memoria della vista.
- Provato con curl il 10/11/2026 su una copia del catalogo: origine/host sbagliati 403, ricerca ~0,15 s su 11.600 contenuti, correzioni valide e sbagliate (codice, data inesistente, campo sconosciuto), riservato senza testo, apertura della cartella.
