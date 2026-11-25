---
paths:
  - "prove/**"
  - ".githooks/**"
  - ".github/workflows/pubblica.yml"
  - "package.json"
  - "strumenti/prove/**"
  - "strumenti/prove-magazzino/**"
---

# Prove automatiche (dal 25/11/2026, chiesto da Marco: "più professionale")

- **`npm test`** (o il comando di `scripts.test` in `package.json` con un Node qualsiasi): `node --import ./prove/avvio.mjs --test "prove/*.test.mjs" strumenti/prove/latte.mjs strumenti/prove-magazzino/prove.mjs`. Ogni file gira in un processo suo; un file che esce con codice ≠ 0 è fallito. Dura ~0,5 s.
- **Quando girano**: prima di ogni commit che tocca `js/`, `prove/`, `strumenti/prove*`, `package.json` o `supabase/functions/_shared/` (`.githooks/prove.py`, dopo `controlla-versione.py`; `git config core.hooksPath .githooks`); e su GitHub a ogni push su `main` (`.github/workflows/pubblica.yml`): **il sito si pubblica solo se le prove passano** (Pages con Source = GitHub Actions dal 25/11/2026; prima "Deploy from a branch"). Se falliscono il sito resta com'era e GitHub manda una email. Senza Node sul PC il controllo prima del commit avvisa e lascia passare. Saltarle una volta: `CES_SENZA_PROVE=1 git commit …` (solo se Marco lo chiede).
- **Node sul PC**: quello installato (winget `OpenJS.NodeJS.LTS`, 25/11/2026) o, se manca, quello di LM Studio (`%LOCALAPPDATA%\Programs\LM Studio\resources\app\.webpack\bin\node.exe`, v25).
- **Impianto** (`prove/`):
  - `avvio.mjs`: `localStorage` finto, registrazione di `hooks.mjs` (`module.registerHooks`, il vecchio `module.register` solo se manca) e **orologio fermo al 25/11/2026 12:00 UTC** (`Date` senza argomenti e `Date.now()`; un altro giorno con `PROVE_OGGI=AAAA-MM-GG`). Senza, le prove con date scritte cambiavano esito col tempo: il revisore ha visto che dal 1/1/2027 quelle delle paghe fallivano (`inCorso()` guarda l'anno di oggi) e avrebbero bloccato ogni pubblicazione. Va importato per primo; i moduli dell'app si caricano poi con `await import(ROOT + '/…')` (con gli import statici il gancio arriverebbe tardi).
  - `hooks.mjs` (funzione `load` sincrona): `js/store.js` → `finti/store.mjs` (scrive in `S` in memoria come quello vero: id nuovo se manca, l'id passato vince; tiene `scritti`) più funzioni vuote per gli altri nomi esportati; `js/ui.js` e `js/nativo.js` → funzioni vuote (al caricamento usano `document`/`window`). I nomi si leggono dal file vero: un'esportazione nuova non rompe le prove. Se un modulo nuovo usa il browser al caricamento, aggiungerlo a `VUOTI`.
  - `aiuto.mjs`: `t(nome, condizione, info)`, `sezione`, `uguale`, `fine(nome)` (esce con 1 se qualcosa non passa). `PROVE_TUTTE=1` stampa anche quelle che passano.
  - `dati.js` tiene in memoria i calcoli finché `S.fatture` è lo stesso elenco: nelle prove assegnare sempre un elenco nuovo (`S.fatture = [...]`).
- **Cosa c'è**:
  - `conti-paghe.test.mjs` (70): le prove delle paghe della 1.6x, prima fuori dal repository: controlli del cedolino, salvataggio automatico e dubbi, mese dalla causale, abbinamento non esatto, doppioni (CRO, stesse righe, fonti diverse), riconoscimento del dipendente (CF, nome, IBAN condiviso, omonimi), note di credito, TD02, elenco.
  - `conti-calcoli.test.mjs` (64): numeri e date italiani, `controlloTotale` (bollo, ritenuta con e senza cassa, sconto), `completa` (riepilogo, totale senza decimali, nota di credito, senza riepilogo), `statoPagamento`, `candidateFatture` (numero, nome, più fatture insieme, solo importo, fatture vecchie o future, già pagata), `registraSuFatture` (ordine di data, niente doppi), `quote` e `annoRegistro` degli ammortamenti, `regime.anno` (compensazioni, dichiarazione, niente credito nello speciale).
  - `strumenti/prove/latte.mjs` (lettore delle fatture del latte) e `strumenti/prove-magazzino/prove.mjs` (71: riconoscimento delle righe per il magazzino; dal 25/11 non partiva più perché `magriconosci.js` carica `ui.js`: ora gira con `avvio.mjs`).
- **Mancano ancora**: lettori dei PDF (fatture, cedolini, estratti conto, bilancini: servono PDF finti, pdf.js si inietta con `setPdfLib`), XML FatturaPA (in Node manca `DOMParser`: `setDomParser`), `regole.classifica`, `rls`, `rica`, `sospesi`, `nitrati` (bilancio dell'azoto).
- **Regole per scrivere una prova**: solo dati inventati (repository pubblico): nomi tipo ROSSI MARIO, codici fiscali ed IBAN di esempio. Il risultato atteso si calcola a mano e si scrive nel commento, non si copia da quello che il codice restituisce. Dopo una prova nuova, controprova: rompere apposta il calcolo (es. `sed` su una riga), vedere che la prova fallisce, rimettere il file con `git checkout --`. Il 25/11 la controprova ha trovato un caso che non vedeva l'ordine della ripartizione dei pagamenti (pagamento che copriva esattamente tutte le fatture).
