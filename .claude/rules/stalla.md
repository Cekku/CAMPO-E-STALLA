---
paths:
  - "js/caldo.js"
  - "js/meteo.js"
  - "js/views/meteo.js"
  - "js/aia.js"
  - "js/siallevauto.js"
  - "js/auto-stalla.js"
  - "js/views/aia-view.js"
  - "js/domain.js"
  - "js/herd.js"
  - "js/views/stalla.js"
  - "js/views/stalle.js"
---

# Stalla: caldo e AIA

(Spostato da CLAUDE.md il 17/11/2026. Si carica da solo quando si lavora su questi file.)

## Stress da caldo (dalla 1.11.0)

- `js/caldo.js`: THI ora per ora (formula NRC 1971, `thi(t, ur)`) dalle previsioni orarie che `meteo.js` già scarica (`temperature_2m`, `relative_humidity_2m`, 7 giorni, nessuna richiesta in più). `giorniCaldo(data)`: per ogni giorno con almeno 20 ore THI massimo e ora del picco, ore ≥ 68 e ≥ 72, ore fresche (< 68), livello calcolato sul valore arrotondato, così il colore corrisponde al numero mostrato (78,6 → 79 = forte). Livelli: < 68 nessuno, 68-71 lieve, 72-78 moderato, 79-88 forte, ≥ 89 grave. Consigli per livello (`consigli(n)`), ondata = giorni di fila ≥ 72 prima e dopo il giorno, "poche ore fresche" se sono meno di 6.
- `caldoCard({ sempre })`: riquadro con 7 giorni, frase sul giorno peggiore e consigli. In dashboard Stalla (`views/oggi.js`) compare solo se c'è almeno stress lieve; in Meteo (`views/meteo.js`) sempre, con "Nessuno stress" nei giorni freschi. Avviso in `extraAlerts` (area `stalla`) per il giorno peggiore tra oggi e +2 se il livello è almeno moderato, con `go: { tab: 'meteo' }`: `case 'go'` in `app.js` accetta anche `tab`/`sub`. Voce "Meteo e caldo" nel menu Stalla.
- Provato nel browser con una previsione finta di ondata di caldo (cache `ces.meteo` sostituita): colori, ondata di 6 giorni, avviso che apre il Meteo, telefono (i riquadri scorrono di lato senza allargare la pagina) e tema scuro; con il meteo vero di fine ottobre THI 55-62 → nessun riquadro in dashboard.

## Si@lleva / AIA (dalla 1.10.0)

- `js/aia.js`: lettura dei PDF di Si@lleva (Microsoft Reporting Services, impaginazione fissa: colonne riconosciute dal bordo destro delle parole, `COL_SINT`, `COL_PRE`). `sintetico` (Sintetico individuale ultimo controllo: n. aziendale, razza 02=Frisona/00=Incrocio, n. lattazione, data parto, gg latte, ANA, EVM, latte/grasso/proteine/cellule(×1000)/LS/caseina/lattosio/urea, stato riproduttivo G/F/NI/MI/V, parcheggiata P, gg 1ª insem., gg concepimento, n. fecondazioni), `prestampato` (Scheda di riepilogo del controllo: nome sulla riga sotto la matricola, "ASCIUTTA gg/mm/aaaa", "ULT. CONTROLLO" = la vacca non è stata controllata all'ultimo controllo e il dato del sintetico è vecchio, prossima operazione P/A/F/D con data gg/mm → anno dedotto), `parametri` (Parametri zootecnici aziendali: una riga per controllo, 21 valori, solo la tabella dei bovini da latte). Collettivo, FE01 e Benessere sono riconosciuti ma non importati.
- `pianoImport(S, reports, uid)`: abbina per matricola; crea capi nuovi, aggiunge numero/razza/nome solo se mancano, crea eventi Parto, Messa in asciutta e Controllo funzionale (id `aia-…`, niente doppioni entro 7 giorni o stessa data), allinea `lattazioniPrecedenti` al n. lattazione AIA, salva `capo.aia` (stato, prossima operazione, EVM, ANA, LS…) e lo storico in `config/aia.storia`. Testato in Node con i PDF veri (332 vacche, controllo 29/09/2026) e reimportazione senza modifiche.
- `domain.capoInfo`: se non ci sono fecondazioni nell'app dopo l'ultimo parto usa `capo.aia` riferito a quel parto (G = gravida, parto previsto da prossima operazione P, o A + 60 gg; G/F/parcheggiata tolgono "Da fecondare"; V = vuota). `agenda` aggiunge le operazioni AIA F e D.
- UI: `views/aia-view.js` (scheda in Stalla → Indici e benessere con caricamento di più PDF, anteprima, andamento e tabella esportabile; riquadro "Controllo funzionale AIA" nella scheda del capo).

## Silos: prodotto in azienda e comprato (1.57.0)

- `quotaSilo(s)` in `herd.js`: per i silos collegati a un prodotto del magazzino divide il contenuto in prodotto in azienda, comprato e non indicato (kg e quote 0-1). Il contenuto è un mucchio mescolato: gli scarichi tolgono in proporzione alle quote del momento; quando il silo si svuota il conto riparte da zero. Nello stesso giorno prima gli scarichi se la giacenza li copriva (svuotato e ricaricato), altrimenti prima i carichi; con giacenza del magazzino a zero o sotto niente quote. La giacenza iniziale conta come non indicata.
- `isAuto(m)`: un carico è prodotto in azienda se ha `caricoId` (da una pesata), `autoprodotto` o `provenienza === 'Prodotto in azienda'`; altrimenti è comprato.
- Campo `provenienza` (Comprato / Prodotto in azienda, vuoto = Comprato) nei movimenti di tipo Carico (`SPEC.movimenti` in `forms.js`).
- `siloCard` (`views/stalle.js`) mostra la barretta a due colori e il testo; la dashboard Stalla (`views/oggi.js`) aggiunge "in azienda X%" accanto a ogni silo. Stili `.silo-quota`, `.sq-bar` in fondo a `css/app.css`.

## Si@lleva dall'archivio del PC (automazione `sialleva-report`, 20/11/2026)

- File: `js/auto-stalla.js` (registra l'automazione, area stalla) e `js/siallevauto.js` (logica); il piano di import è `pianoImport` di `js/aia.js`.
- Dal catalogo del ponte si prendono i PDF Si@lleva: area 11.2, oppure tipo Sintetico-individuale / Scheda-riepilogo-controllo / Parametri-zootecnici, oppure dal nome del file (`tipoDoc`, `daLeggere`). `dividi` separa i report da importare da quelli da saltare.
- Ogni report una volta sola: impronta SHA-256 del catalogo in config `aia-auto.fatti` con esito importato / vecchio / altro / annullato. Annullando un giro i report restano "annullato" e non si reimportano.
- Scheda di riepilogo nuova: si rilegge anche il sintetico dello stesso controllo già importato (insieme il piano è giusto); se quel compagno non si scarica, i nuovi dello stesso controllo aspettano il giro dopo. Un PDF che non si legge si riprova al massimo 3 volte (`TENTATIVI`, esito `errore` → `nonletto`).
- **Un controllo alla volta** (revisione del 20/11/2026): `pianoImport` con sintetici di date diverse mescola i dati (latte di un mese, data dell'altro), quindi `dividi` tiene solo i sintetici/prestampati della data più recente (e non più vecchi dell'ultimo controllo in stalla); gli altri sono "vecchio". I Parametri si uniscono sempre.
- Sicuro, si salva da solo: vacche già in stalla senza conflitti (aggiornamento, parti, asciutte, controlli funzionali) e l'andamento della stalla (config `aia`, solo se cambia).
- In Da controllare (un record per dubbio: config `aia-s-<id>` = { tipo: 'aia-sospeso', s }, così Annulla di una conferma lo rimette anche se nel frattempo se ne sono confermati altri): capi nuovi (un dubbio per controllo; Conferma con `opsNuovi` li aggiunge saltando le matricole scritte a mano nel frattempo); vacche che c'erano in un controllo AIA e non nell'ultimo (`forseUscite`, escluse quelle con un conflitto aperto; Apri sulla vacca, l'uscita si registra a mano). `unisciSospesi`: un conflitto nuovo di un capo toglie quelli vecchi dello stesso capo, i capi nuovi di un controllo tolgono le stesse matricole dai sospesi prima.
- Conflitti con i dati a mano: parto dell'AIA a più di 7 e fino a 150 giorni da uno scritto a mano, asciutta fino a 60 giorni, numero aziendale diverso. Conferma = tieni i dati dell'AIA (corregge data evento e numero); "Tieni i miei" = lascia date e numero e aggiorna il resto, e la scelta resta in config `aia-t-<capoId>` ({ tipo: 'aia-tieni', capoId, ev: {idEvento: true}, num }): ai controlli dopo quella vacca si aggiorna da sola senza chiedere. Il piano dei conflitti si calcola con l'evento spostato alla data AIA, così non nasce un parto doppio e le lattazioni tornano. `ancoraUguale` (impronta a chiavi ordinate, come `stabile` di `store.js`: il jsonb riordina le chiavi) ferma la conferma se nel frattempo vacca o evento sono cambiati.
- Solo per il titolare (`contiVisibili()` in `pronta`): l'archivio del PC è suo.
- Provato in Node con PDF finti costruiti con le colonne di COL_SINT (59 prove con quelle del gasolio) e nel browser con un ponte finto sulla porta 1239 (la 1237 la usa la sessione del latte). Report veri nel catalogo il 20/11/2026: area 11.2, tipi Sintetico-individuale, Scheda-riepilogo-controllo, Parametri-zootecnici, file salvati in Download.
- In attesa di Marco: CSV dei sensori (nessun export nell'archivio) e ricette veterinarie REV (nell'archivio: una prescrizione del 2022 dal portale Vetinfo, PDF di testo con medicinale, AIC, quantità, posologia, capo per marca auricolare, tempi di attesa carne/latte/organi; e la stampa 'Trattamenti negli ultimi 90 giorni' per capo).
