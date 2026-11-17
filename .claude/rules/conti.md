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
