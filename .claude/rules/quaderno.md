---
paths:
  - "js/registro.js"
  - "js/quaderno.js"
  - "js/views/quaderno.js"
---
# Quaderno di campagna (1.65.0, 20/11/2026, chiesto da Marco)

## Norma (controllata il 20/11/2026)

- Reg. di esecuzione (UE) 2023/564: contenuto e formato dei registri dei fitosanitari (art. 67 Reg. 1107/2009). Formato **elettronico leggibile dalle macchine**; registrare "senza indebito ritardo", conversione in elettronico entro 30 giorni dall'uso. Allegato, per l'uso in campo: tipo di utilizzo, prodotto e numero di autorizzazione, data (ora se l'uso è limitato a certe ore), dose per ha, area trattata (parcella della domanda geospaziale GSAA, altrimenti un altro metodo), ettari trattati, coltura con **codice EPPO**, stadio **BBCH** se l'uso è limitato a uno stadio, tipo di superficie. Ambienti chiusi e concia del seme hanno voci proprie (non usate in azienda).
- Reg. (UE) 2025/2203 + DM Masaf 30/12/2025: in Italia l'elettronico è obbligatorio dal **1° gennaio 2027** (2026 di passaggio). Linee guida del Ministero sul formato ancora attese a maggio 2026: quando escono, adattare `registroJSON`.
- Conservazione: almeno 3 anni.

## Dove

- `js/registro.js`: `eppoDi(coltura)` (tabella `EPPO`, si cerca dall'inizio del nome; Prato polifita senza codice), `haTrattati(o, c)` (campo `haTrattati` dell'operazione se è una parte del campo, altrimenti tutto il campo). `righeTrattamenti` dà anche `eppo`, `haCampo`. Stampa: identificativo PCG/catasto, codice EPPO, "su X ha" se parziale, "da Open-Meteo". `registroJSON` versione 2: `tipo_utilizzo`, `tipo_superficie`, `codice_eppo`, `superficie_appezzamento_ha`, `meteo_fonte`.
- `js/quaderno.js`: automazione `quaderno` del Centro automatico (importata da `automazioni-agganci.js`). Trattamenti degli ultimi 400 giorni. **Salva da sola** solo calcoli e misure: dose dalla quantità; quantità dalla dose × ettari trattati solo per trattamenti degli ultimi 30 giorni e senza uno scarico a mano (senza `opId`) dello stesso prodotto entro 3 giorni, altrimenti dubbio `qd-q:` (lo scarico doppio del magazzino era il rischio trovato in revisione); meteo (`meteoAlMomento`, max 40 richieste a giro) solo con l'ora di inizio scritta e già passata, altrimenti dubbio `qd-meteo:` con i valori delle 10:00 (`meteoAuto` = fonte, `'nd'` = giorno senza dati, non si richiede più). `salvaOp` tocca lo scarico solo se cambiano quantità o stato. `propri` = id scritti nel giro (`MIEI`), così Annulla funziona anche se il giro parte subito dopo un salvataggio a mano. **Dubbi** (`qd-…`): trattamento "da fare" con data passata (Conferma = fatto, con `controlliOp`: se un controllo è "bad" solo Apri), avversità, BBCH e operatore mancanti solo per l'annata in corso; avversità e BBCH (proposta solo da trattamenti già registrati: stesso prodotto e coltura / stesso campo entro 3 giorni), operatore mancante (proposta se c'è un solo patentino valido), patentino scaduto o mancante, prodotto senza numero di registrazione, coltura senza codice EPPO (solo avviso).
- `js/views/quaderno.js`: pagina "Quaderno di campagna" in Campagna (legge, completezza `registroCard`, "In automatico", esportazioni, tabella dei trattamenti con "manca").
- `forms.js`: campo `haTrattati` (Superficie trattata) nei trattamenti; la quantità si calcola su quella.
