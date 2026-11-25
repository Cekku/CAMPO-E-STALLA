---
paths:
  - "js/store.js"
  - "js/config.js"
  - "js/lock.js"
  - "js/views/impostazioni.js"
  - "supabase/**"
---

# Supabase e protezione dei dati

(Spostato da CLAUDE.md il 17/11/2026. Si carica da solo quando si lavora su questi file.)

## Supabase

- Progetto: `vamcoyvunyjqgzxujsal` (URL `https://vamcoyvunyjqgzxujsal.supabase.co`). Collegato al repository con l'integrazione GitHub (Deploy to production, working directory `.`, ramo `main`).
- Prima configurazione: eseguire `supabase/schema.sql` nello SQL Editor; per database vecchi `supabase/aggiornamento-conti.sql`.
- Nell'app: La mia azienda → Sincronizzazione (Project URL + chiave anon/publishable; mai la service_role). Dalla 1.11.2 URL e chiave **anon** (ruolo `anon`, verificato decodificando il token) sono in `js/config.js`. Sono pubblici per natura: i dati li proteggono le regole RLS. I dispositivi non devono più incollarli, e `ces.cloud` in localStorage, se c'è, ha ancora la precedenza.
- **Azienda trovata dopo l'accesso** (1.11.1, `findFarms` in `store.js`): se il dispositivo non ha un'azienda collegata (`meta.farm`), dopo l'accesso cerca in `farm_members` le aziende dell'utente e poi le legge da `farms`. Le regole RLS esistenti bastano: `members_select`/`farms_select` con `is_member`. `sync.found` vale `null` (non cercate o errore, si vedono i moduli classici), `'cerco'` oppure l'elenco con il ruolo, titolare per primo. `sync.locali` conta le registrazioni vere del dispositivo (`datoVero`: non cancellate, non `config`, non `esempio`).
  - Una sola azienda e `locali` = 0: collegamento automatico (`attachFarm(id, false)`, che svuota e scarica).
  - Altrimenti l'elenco in Impostazioni: "Collega e unisci" (`attachExisting(id, 'unisci')`, che carica solo `datoVero` e toglie dal dispositivo esempi e `config`, così vincono quelli dell'azienda) oppure "Usa solo i dati dell'azienda" (conferma in due tocchi se ci sono dati locali).
  - "Crea un'altra azienda" ed "Entra con un codice" restano in "Altre possibilità", con l'avviso dei dati divisi.
  - `attachFarm(farmId, uploadLocal)`: `uploadLocal` può essere `true` (tutto, per l'azienda appena creata) o un filtro.
  - Provato nel browser con un finto Supabase in memoria (pagina di prova non nel repository): solo esempi → collegamento automatico; un dato locale → scelta, e l'unione carica il dato e scarica quello online; due aziende → scelta; "usa solo" → conferma, poi solo i dati dell'azienda scelta.

## Protezione dei dati sul dispositivo (dalla 1.32.0)

- Archiviazione permanente (`proteggiDati` in `store.js`): all'avvio e dopo la prima registrazione vera chiede `navigator.storage.persist()`, una volta per apertura e solo se ci sono dati non di esempio (Firefox mostra una domanda). `protezione.stato` = `null`/`true`/`false`; Chrome la concede da solo se l'app è installata o usata spesso, altrimenti resta `false` e La mia azienda → Dati lo dice.
- Promemoria della copia di sicurezza: `segnaCopia()` scrive la data in localStorage `ces.copia` e, per il titolare con la sincronizzazione, in `config` id `copia` (così il promemoria non torna su ogni suo dispositivo). `copiaDaFare()`: solo titolare o azienda non collegata; mai fatta → da 20 registrazioni vere; poi ogni 14 giorni senza sincronizzazione, ogni 60 con. Avviso in dashboard Campagna (`extraAlerts` in `app.js`, area `dati`) che apre La mia azienda alla sezione Dati (`go` con `el`). La copia non contiene gli allegati.
- `.gitignore`: `xfarm-*.csv`, `xfarm-*.geojson`, `prova-*.html`, `campo-e-stalla-*.json` (dati veri e copie di sicurezza finiti nella cartella del progetto non si pubblicano).
- Provato nel browser in locale con esempi e 22 note finte (poi cancellati): nessun promemoria con i soli esempi, avviso con i dati veri, sparisce dopo lo scarico, torna con una copia di 20 giorni; telefono 375 px senza scorrimento di lato. Qui Node non è installato: la sintassi si controlla caricando l'app nel browser.
- `applyRemote` (1.64.2): un record dal cloud identico a quello in memoria (confronto `stabile`, chiavi ordinate perché jsonb le riordina; cancellato e già assente) si salta: niente scrittura in IndexedDB né ridisegno. Prima ogni salvataggio tornava indietro dal cloud e faceva ridisegnare la pagina due volte.
- **Raccolte nuove** (1.77.0, `pull` in `store.js`): `meta 'cols'` ricorda le raccolte conosciute dal dispositivo; quelle nuove si scaricano una volta dall'inizio (`scarica(since, cols)`), perché la versione di prima ne saltava le righe ma andava avanti con `lastSync`. Basta aggiungere la raccolta a `COLS`. Dettagli in `errori.md`.
