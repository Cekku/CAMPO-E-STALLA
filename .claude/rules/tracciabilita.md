---
paths:
  - "js/tracciabilita.js"
  - "js/views/tracciabilita.js"
---

# Tracciabilità degli alimenti (1.42.0, chiesta da Marco per il caseificio)

Stalla → Tracciabilità (anche nel menu "Alimentazione e salute"). Ricrea i due registri Excel del caseificio: **Registro approvvigionamenti** (un foglio per prodotto: N., Fornitore, DDT, Data arrivo, Quantità kg, Conforme, Accettato, Silos/zona, Inizio e Fine utilizzo) e **Registro alimenti autoprodotti** (Prodotto, Data produzione, Quantità in quintali, Conforme, Trincea/silos/zona, N., Inizio e Fine utilizzo). Stampa/PDF A4 orizzontale con intestazione, timbro e righe vuote fino a 16; Excel un foglio per prodotto.

- Logica in `js/tracciabilita.js`, pagina in `js/views/tracciabilita.js` (azioni `tr-`, `setRender` collegato in app.js). Raccolta **`tracciabilita`** (non riservata: niente prezzi né importi): record `tipo:'prodotto'` (nome, parole, silos, `mod` correzioni per riga, `linee` {fid:i → true/false}, `extra` righe a mano), `tr-impostazioni` (intestazione, predefinita "Milk Collection"), `tr-autoprodotti` (tutte le righe, di ogni anno).
- Righe dalle fatture: acquisti, niente note di credito (TD04) né importi negativi; anno = data del DDT ("N del gg-mm-aaaa", altrimenti data della fattura e DDT "Fatt. N"). Prodotto scelto con le parole di ricerca (alternative con la virgola; parole di 3+ lettere anche come inizio, sigle corte e numeri interi esatti): vince quello con più parole che combaciano. Una riga per fornitore+DDT+data (righe dello stesso DDT sommate); quantità in kg da `umNorm`/`convertiQ` (senza unità letta come kg, con "?").
- Inizio utilizzo = arrivo + 1 giorno, fine = inizio dell'arrivo dopo (come le formule del vecchio Excel). Correzioni in `mod[key]` (key = fornitore|DDT|data normalizzati); un valore uguale a quello automatico toglie la correzione. "Non è questo prodotto" = `linee[k]=false` (va fra "Righe tolte" e, se mangime/foraggio, fra le non assegnate); "Assegna a…" aggiunge la descrizione (senza parole con cifre) come alternativa delle parole di ricerca, così le fatture future entrano da sole.
- Autoprodotti dell'anno: prodotti nell'anno o l'anno prima e ancora in uso (fine vuota o ≥ 1 gennaio), come nel registro del caseificio che mescola le annate. "Prendi dalle raccolte": raccolte e sfalci fatti con quantità, uno per coltura, t × 10 = quintali, senza doppioni (`origine`).
- "Importa dal vecchio registro Excel": dai fogli con "Prodotto: …" crea i prodotti (silos dalla colonna H), dal foglio con "Data Produzione" copia le righe; non doppia.
- Provato il 17/11/2026 dal collaudatore con dati finti (11 punti, tutti a posto, anche a 375 px e col tema scuro). Non provati: stampa vera del browser e tema chiaro a 375 px. Le fatture le vede solo il titolare: per i collaboratori il registro degli approvvigionamenti resta vuoto (righe solo a mano).
