---
paths:
  - "js/caldo.js"
  - "js/meteo.js"
  - "js/views/meteo.js"
  - "js/aia.js"
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
