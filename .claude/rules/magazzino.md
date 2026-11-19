---
paths:
  - "js/magfatture.js"
  - "js/views/magfatture.js"
  - "js/views/magazzino.js"
---

# Magazzino: carico dalle fatture (1.59.0, chiesto da Marco il 19/11/2026)

Magazzino → scheda **Da fatture** (solo se `contiVisibili()`: legge le fatture). Logica in `js/magfatture.js`, pagina in `js/views/magfatture.js` (azioni `mf-` agganciate in `app.js`, click e change).

- Righe prese: acquisti, niente TD04, rettifiche né importi negativi, quantità > 0, data del DDT (`leggiDdt`, altrimenti della fattura) ≥ "Carica le fatture dal" (predefinita 1/1 dell'anno in corso). Categoria dei Conti in `CAT_FATT` (Sementi→Seme, Concimi→Concime, Fitofarmaci→Fitofarmaco, Carburanti e lubrificanti→Gasolio) oppure riga che combacia con le parole già imparate da un prodotto.
- Scelta di Marco: **misto**. La prima riga di un prodotto si abbina a mano (prodotto che c'è o nuovo dalla riga); con "Ricorda" il prodotto prende `paroleFatt` (alternative con la virgola, tutte le parole nella descrizione, parole di 3+ lettere anche come inizio) e, se la quantità scritta non è la conversione automatica, `convFatt[unità della fattura]` = fattore. Da lì le righe che combaciano e si sanno convertire (`convertiQ`, o il fattore imparato) si caricano da sole.
- Automatico: `autoSeServe()` chiamata a ogni `render()` di `app.js`; lavora solo se sono cambiati `S.fatture`, `S.prodotti` o `S.econfig` e almeno un prodotto ha `paroleFatt`.
- Stato in `econfig` `mag-fatture` (riservata): `da`, `fatti{'fid:i': idMovimento | 'no'}`. Movimento con id fisso `mf-<fid>-<i>` (due dispositivi non fanno doppioni), `fattRiga`, prezzo = importo senza IVA ÷ quantità, documento "Fatt. N del gg/mm/aaaa · DDT … · fornitore", provenienza Comprato. Il prezzo del prodotto diventa quello del carico più recente (`prezzoData`). Un carico cancellato resta in `fatti` e non torna; "Non caricare" = `'no'`, "Rimetti" lo toglie.
- Dopo la revisione: fuori da `CAT_FATT` entrano solo righe senza categoria o "Da classificare" (niente urea zootecnica fra i concimi); righe di servizio (`SERVIZIO`: trasporto, contributo, nolo, spese, cauzione…) mai da sole, solo proposte; `salvaStato` unisce `fatti` al momento del salvataggio e fissa `da` al primo salvataggio (non scivola al cambio d'anno); `corre` è un contatore; fattore imparato con chiave `'unità fattura>unità prodotto'` (cambiando l'unità del prodotto non vale più).
- Provato il 19/11/2026 dal collaudatore con dati finti (tre giri, tutto a posto, anche 375 px e tema scuro). Non provati: tema chiaro, sincronizzazione con Supabase. Una fattura scritta dalla console non fa ridisegnare la pagina (entra al disegno dopo); dall'app sì.
- Dubbio lasciato a Marco: i collaboratori vedono nei movimenti prezzo, fornitore e numero di fattura (come già per i carichi scritti a mano).
