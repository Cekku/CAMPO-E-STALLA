---
paths:
  - "js/conti/**"
  - "js/views/conti*.js"
  - "supabase/aggiornamento-conti.sql"
---

# Modulo Conti: struttura

(Spostato da CLAUDE.md il 17/11/2026. Si carica da solo quando si lavora su questi file.)

## Modulo Conti (`js/conti/`, viste in `js/views/conti*.js`)

Visibile solo al titolare (`contiVisibili()`); raccolte riservate: `fatture`, `bilanci`, `econfig`, `paghe`, `pagamenti`.
Con il cloud la riservatezza è garantita dalle regole RLS in `supabase/schema.sql` (e `supabase/aggiornamento-conti.sql` per i database vecchi); `ces_schema_version()` = 3, l'app avvisa se il database è più vecchio.

- `pdftext.js`: testo dei PDF con posizioni (equivalente di pdfplumber: `leggiPdf`, `parole`, `righeParole`, `testoPagina`).
- `fatture-parse.js`: fatture XML/P7M/ZIP del cassetto fiscale e PDF (AdE, TeamSystem, prospetti latte). `regole.js`: categorie automatiche.
- `iva-parse.js`: dichiarazioni IVA (telematico o PDF). `bilancino-parse.js` + `ocr-bilancino.js` + `alfabeto.js`: bilancini del commercialista (anche PDF "disegnati" senza testo).
- `schema.js`: conto economico, stato patrimoniale, cespiti, indici (righe come nel vecchio Excel). `analisi.js`: analisi della stalla da latte. `dati.js`: calcoli memorizzati; `calc(y)` usa i costi del personale dalle paghe (B.9 righe 57-59) se il CE non li ha.
- `importa.js`: "Carica documenti" riconosce da solo il tipo di file (fatture, IVA, bilancini, cedolini, bilancini paghe, contabili di bonifico, estratti conto).
- `tabelle.js`: tabelle ordinabili con esportazione **Excel / CSV / stampa-PDF**; `xlsx.js`, `zip.js` scritti a mano.
- Fatture mancanti (`elenco.js`, vista `views/conti-verifiche.js`) e reddito lordo standard (`rls.js`): vedi `.claude/rules/conti-controllo-rls.md`.

## Regime IVA: ordinario o speciale (1.44.0, 17/11/2026) — `conti/regime.js`, `views/conti-regime.js`

- Chiesto da Marco: "mi conviene stare in ordinario o passare al forfettario?". Il forfettario L. 190/2014 non vale per le società semplici e le imposte sul reddito sono già catastali: l'unica scelta vera è l'IVA, regime speciale art. 34 (compensazione) contro ordinario (opzione art. 34 c. 11, vincolo 3 anni). La pagina lo spiega nella scheda "E il forfettario delle imposte?".
- Pagina Conti → `regime` (gruppo Bilancio dopo `iva`, voce in `MENU`). Azioni `c-rg…` in `onAct`/`onChange` di `views/conti.js`.
- Calcolo per anno (`anno(y)`): vendite divise in gruppi dalla categoria delle righe (`GRUPPI`: latte 10%, bovini 7% dal 2023, cereali e foraggi 4%, altro 0%; righe di differenza nel gruppo della prima riga della fattura); compensazione = Σ imponibile × %. IVA vendite/acquisti dalla dichiarazione IVA dell'anno (`ve_iva`, `vf_iva`) se c'è, altrimenti `f.iva` delle fatture. Ordinario = vendite − acquisti; speciale = max(0, vendite − compensazione). IVA degli investimenti = righe con centro `inv` (aliquota × imponibile della riga: l'IVA per riga non è salvata).
- Rettifica (`rettifica(Y)`, art. 19-bis2): beni del registro ≥ 516,46 €, esclusi terreni, comprati prima di Y (e dopo `inizio` se impostato): IVA × anni che restano / 5 (10 per i fabbricati); IVA dalle righe collegate o stimata 22% (bestiame 10%). Un bene che entra in funzione dall'anno Y in poi ma ha fatture di prima di Y (es. stalla nuova costruita prima e messa in funzione dopo) va nella rettifica per intero (10/10 o 5/5); se non ha fatture di prima, la sua IVA conta come persa nell'anno della data (scenari). Entrano anche gli investimenti previsti negli anni prima di Y (`cat` fabbricati = 10 anni) e l'IVA delle scorte scritta a mano. `libero` = primo anno senza beni in controllo: l'esito dice "conviene, ma beni in controllo" (alcuni commentatori dicono che l'uscita non è ammessa: avviso, non blocco). `vincolo`: se c'è `inizio`, prima di `inizio + 3` il cambio non si può fare e lo scenario è escluso.
- Scenari (`scenari`): anno tipo = media degli ultimi 2 anni interi, senza investimenti; per ogni anno di cambio dal prossimo: risparmio dei 3 anni (con gli investimenti previsti) − rettifica. Impostazioni in `econfig` id `regime-iva` (`perc`, `inizio`, `scorte`, `inv`).
- Fonti delle percentuali (da ricontrollare a ogni decreto nuovo): latte 10% DM 26/1/2016; bovini 7% (9,5% non prorogato oltre il 2022); suini 7,3%.
