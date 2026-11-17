---
paths:
  - "index.html"
  - "css/**"
  - "js/app.js"
  - "js/ui.js"
  - "js/icons.js"
  - "js/views/oggi.js"
  - "js/agenda.js"
  - "manifest.webmanifest"
---

# Interfaccia, menu, dashboard e agenda

(Spostato da CLAUDE.md il 17/11/2026. Si carica da solo quando si lavora su questi file.)

## Stile "Quaderno" e menu in alto (dalla 1.14.0)

- Scelto da Marco il 30/10/2026 tra tre proposte (Cruscotto, Quaderno, Bento), disegnate su una tela claude.ai per telefono e PC.
- Aspetto (`css/app.css`, gettoni in `:root`): carta `--bg` #F3EFE4 a righe (`--rule`, sfondo di `body`), inchiostro `--ink` #1C2530, schede `--surface` più chiare con filetto sottile e senza ombra, angoli 4-8 px. Titoli Newsreader (con le grazie), testo IBM Plex Sans, numeri ed etichette IBM Plex Mono (Google Fonts in `index.html`). `--accent` blu penna #24507A per collegamenti e dettagli, `--action`/`--fab` rosso matita #B33A26 per Registra; `--bad` resta il rosso degli errori. `--cover` = testata scura del menu laterale. Tema scuro "notturno": fondo #15191E, testo crema. Le righe di KPI (`.kpis`) sono un registro: filetti tra le celle fatti con l'ombra a sinistra e sopra di ogni `.kpi`, tagliata dal bordo (`overflow: hidden`, `gap: 1px`), così funziona con qualsiasi numero di celle.
- Computer (≥ 900 px): niente menu laterale. Sotto la testata (`.appbar`: titolo, annata, cerca, sincronizzazione, Registra) c'è `#topnav` (`topnavHTML()` in `app.js`): aree Campagna/Stalla/Conti/Archivio, poi le voci di `TOP`, la tendina "Gestione" (ultima sezione di `MENU`; `.tn-dd`, azione `tnMenu`, si chiude con un clic fuori o Esc), Installa ed Esporta a destra. Un `ResizeObserver` scrive l'altezza del menu in `--tn-h`, che sposta in basso la mappa a tutto schermo (`.mapview`). Contenuto centrato con `--wide` 1360 px e `--pad-x`.
- **Menu in alto su una riga, senza doppioni (1.32.0, 12/11/2026)**. Prima le voci della prima sezione di `MENU` stavano tutte in vista: a 1440 px Stalla e Conti andavano su due righe e sotto c'erano di nuovo le stesse pagine nelle schede della vista. Ora `TOP` (in `app.js`) ha una voce per pagina o per gruppo di pagine, e le pagine del gruppo sono solo le schede `tabs()` della vista: Campagna = Dashboard, Campi, Mappa, Attività, Magazzino, Meteo, Note; Stalla = Dashboard, "Mandria e latte" (le 8 schede della vista Stalla), Meteo e caldo, Magazzino; Conti = Panoramica, Fatture, Bilancio, Personale (i tre `GRUPPI` di `views/conti.js`, la voce riapre l'ultima pagina vista del gruppo, `ultimaConti`), Carica documenti; Archivio = le quattro pagine. `MENU` resta com'era per menu laterale del telefono e ricerca. Se aggiungi una pagina: mettila in `MENU` e, se non è la scheda di una vista già in `TOP`, anche in `TOP`. Misurato: una riga in tutte le aree da 900 a 1440 px (sotto 1240 px Esporta e Installa solo icona, sotto 1060 e 960 px margini e caratteri più stretti). `scrollbar-gutter: stable` su `html` (non sulla mappa): il menu non si sposta più fra pagine con e senza barra di scorrimento né quando si apre un foglio.
- Telefono: come prima menu laterale (`#drawer`) e barra in basso (`.bnav`), ristilizzati.
- **Ritocchi di impaginazione (1.39.1, 16/11/2026)**, blocco in fondo a `css/app.css` e `barre()` in `app.js` (chiamata alla fine di `render()`). Difetti trovati passando tutte le pagine con una sonda (testi tagliati, elementi fuori dal riquadro, caselle orfane) a 375, ~970 e 1280 px sui dati veri in sola lettura:
  - Schede `.tabs`: sul computer vanno a capo (il Bilancio ne ha 12 e ne mostrava 7, le altre erano fuori a destra senza barra di scorrimento); sul telefono scorrono, la scheda scelta torna al centro a ogni ridisegno (prima la barra ripartiva dall'inizio) e una sfumatura ai lati (`.piu-s`/`.piu-d`) dice che ce ne sono altre. Lo stesso per `.chipbar` e `.mini-tabs`, che sul computer scorrono anche con la rotella.
  - Telefono: titolo della pagina su due righe (prima "Panora…"), annata più stretta; `.mini-tabs` dei Pagamenti non allarga più la pagina; riga dei collaboratori in La mia azienda con la tendina sotto (prima l'email andava una lettera per riga).
  - `.kpis`: con 5 caselle l'ultima prende tutta la riga, con 3 si usano 3 colonne; sul telefono l'ultima dispari prende tutta la riga. Icona staccata dal testo nei pulsanti `.chipbar` (Elenco / Tabella della mandria).
  - Restano: etichette troncate con i puntini nelle barre orizzontali (`.hb-l`, 180 px) e nel riquadro Salute della Panoramica; tabelle dei Conti che scorrono di lato sotto ~1300 px.
- `theme-color` e manifest color carta; `apple-mobile-web-app-status-bar-style` = `default` (con la carta chiara il testo bianco di `black-translucent` non si leggeva).

## Dashboard e agenda (dalla 1.9.0)

- `js/agenda.js`: `agenda(giorni, area)` raccoglie le scadenze dei prossimi giorni (attività pianificate e in ritardo, parti, asciutte a −60 gg dal parto, fine sospensione latte, fine carenza, revisione/assicurazione/controllo funzionale, patentini, prodotti in scadenza); `agendaCard()` la mostra divisa per giorno. `statoRegistro(y)`/`registroCard(y)`: completezza del registro trattamenti (Reg. UE 2023/564, digitale obbligatorio dal 1/1/2027) sulle righe di `righeTrattamenti`.
- `views/oggi.js`: saluto, KPI di campagna (superficie, attività, costi €/ha, avvisi), avanzamento colture a barre. Sotto 1080 px `.grid-2.dash` diventa una colonna sola con ordine `o1…o7` (agenda, avvisi, registro, attività…).
- **Ritocchi della 1.31.0** (idee da Dribbble provate prima in `prova-cruscotto.html`, pagina fuori dal repository):
  - Numeri con il confronto (`confronto`, `annoPrima`, `colonneMesi` in `views/oggi.js`): attività e costi contro l'anno prima alla stessa data (annata passata = anno intero), verde se va meglio e rosso se peggio (per i costi salire è male); colonne per mese sotto le attività (mese in corso blu, futuri tratteggiati); costi a zero → casella `.kpi.zero` "Ancora niente" con il dato dell'anno prima; Avvisi mostra il primo urgente; latte: media degli ultimi 7 giorni contro i 7 prima (solo se ci sono registrazioni recenti).
  - Agenda come elenco di cose da fare (`agendaCard`): vuota = una riga (`.ag-slim`, Pianifica / Evento); piena = gruppi Oggi, Domani, Questa settimana, Settimana prossima, Più avanti (`gruppo`), in ritardo in cima, attività di campagna fatte oggi barrate, pallino che segna fatta un'attività pianificata (`data-act="done"`), etichetta dell'area; al massimo 10 righe.
  - Riquadro Mezzi in dashboard Campagna (`mezziCard`, `scadenzeMezzo`): solo i mezzi con qualcosa in scadenza o scaduto (pezzi del libretto bad/warn, tagliando, revisione, assicurazione, controllo funzionale, scadenze del mezzo), con cosa, fra quanto e una barra; gli altri "in regola" in una riga. Ordine `o2` sul telefono, dopo gli Avvisi.
- Ricerca = palette di comandi (`AZIONI` + voci di `MENU` in `app.js`): Ctrl/⌘+K o `/` aprono, `N` apre Registra, Invio apre il primo risultato.
- Righe con `.r-side.chips` sotto 560 px: le etichette vanno a capo sotto il testo.
