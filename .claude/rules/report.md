---
paths:
  - "js/report.js"
  - "js/auto-report.js"
  - "js/views/report.js"
---
# Report del mese (20/11/2026, chiesto da Marco)

Riassunto di un mese con il controllo di completezza in cima, salvato da solo il primo del mese come istantanea.

## File

- `js/report.js`: motore. `prepara(mese, { conti })` → oggetto JSON `{ v, mese, conti, quando, finoAl, controlli, sezioni }`; sezione = `{ id, titolo, icona, area, riservata?, kpi: [{ l, v, f, u, s, d, dl, peggio, testo }], tabelle: [{ id, title, sheet, cols: [{ k, h, fmt }], rows, tot, note }], note }` (fmt come `conti/tabelle.js`). Tutto è dati semplici: l'istantanea si salva così e si ridisegna uguale.
- `js/views/report.js`: pagina (tab `report`, voce in "Gestione" di Campagna, Stalla e Conti), azioni `rp-*` (`rpAct`, da `app.js`), `reportCard()` nelle due dashboard. Select del mese `data-filter="rp_m"`; `UI.f.rp_live` = dati di adesso invece dell'istantanea; `UI.f.rp_senzaConti` = titolare senza Conti.
- `js/auto-report.js`: automazioni del Centro `report-mese` (area Conti, solo titolare) e `report-mese-squadra` (area Campagna, parte solo sul dispositivo di un collaboratore).

## Da dove vengono i numeri (non si rifanno i conti)

- Conti (solo `conti` vero): `righe()` per categoria del mese e dello stesso mese dell'anno prima, `fatture()` (IVA del mese = somma `iva`), pagamenti fatti = `pagamentiBanca` delle fatture + `S.pagamenti` nel mese; da pagare = `statoPagamento` delle fatture d'acquisto (scadute da meno di 6 mesi o in scadenza entro il mese dopo, solo se `mesiBanca()` non è vuoto); latte fatturato = righe `CAT_LATTE`/`CAT_PREMI` con `litriRiga`.
- Personale: `cedolini()` del periodo (a dicembre anche `-13`, a giugno `-14`), `verifica()` per il pagato, `bilanciniPaghe()` per il costo; costo per dipendente = lordo + `tfrFondo` + contributi ditta del bilancino divisi in base al lordo (**stima**, detto nella pagina); `versamenti()` F24 del mese, contributi e fondo del trimestre.
- Stalla: `mandriaAl(data)` (presenti, vacche, in lattazione dagli eventi Parto/Messa in asciutta, come `stalla()` di `conti/dati.js`), eventi del mese per tipo (`TIPI_EV`), sanitari e parti, latte giorno per giorno con qualità (`grasso`, `proteine`, `cellule`, `cbt`, `prezzo` se ci sono), razioni = movimenti `razioneId` del mese.
- Magazzino: giacenza a fine mese = iniziale + movimenti fino a quel giorno (come `derive()`), sotto scorta/scadenze come `allAlerts()`; valore (giacenza × prezzo) solo con i Conti.
- Campagna: operazioni fatte nel mese per campo e coltura (`colturaAlla`), per tipo, trattamenti = `righeTrattamenti(y)` del mese (registro/quaderno), raccolte e sfalci (`raccolto` in t), pesate (`carichi.netto`), ore per mezzo, manutenzioni.

## Controllo di completezza (`controlli`)

Dopo la revisione del 20/11: cedolini attesi dai soli cedolini normali (la 13ª e la 14ª, periodo `-13`/`-14`, verrebbero dopo dicembre); dubbi del Centro senza i Conti filtrati per automazione `soloTitolare` (es. `mag-fatture` è in area magazzino ma riservata); giorni senza latte contati dalla prima registrazione del latte; "Da pagare" con i pagamenti fino alla fine del mese del report (non a oggi); contributi e fondo del trimestre solo nel report dell'ultimo mese del trimestre; le rate di prestito trattenute (non `come: 'versato'`) non sono pagamenti. Il riquadro della dashboard usa solo la copia `rp-` (mai i Conti).

Ognuno `{ id, ok, testo, dett, corto, go: { area, tab, sub, f, v, anno } }` (Sistema → `rp-vai`):
cedolini (dipendenti con cedolino il mese prima o dopo e non cessati), righe "Da classificare" del mese (link a Fatture con `cf_stato=daclass`), estratto conto (`mesiBanca().has(mese)`), giorni senza latte (solo se si registra il latte o ci sono vacche in lattazione), dubbi aperti nel Centro (senza quello del report; senza i Conti solo quelli delle aree non riservate). `corto` serve al testo del dubbio ("senza cedolini", "con 3 giorni senza latte").

## Istantanee

- `config` `rp-AAAA-MM` = report senza Conti (`prepara(m, { conti: false })`), lo vedono i collaboratori; `econfig` `rpc-AAAA-MM` = completo, riservato (RLS). Record `{ tipo: 'report', mese, quando, come: 'automatico'|'confermato'|'a mano', completo, mancanze, rep }`.
- `istantanea(m)`: per il titolare quella completa se c'è, altrimenti quella senza Conti (la pagina lo dice). `salva(m, { solo: 'mancanti' })` scrive solo quelle che mancano (Centro); "Rifai il report" le riscrive tutte e due.

## Automazioni `report-mese` e `report-mese-squadra`

- Ogni giro: mese = `meseChiuso()` (il mese prima di oggi). Se le istantanee ci sono già: "Report di ottobre pronto". Se il report è completo le salva; se no un dubbio `<id automazione>:<mese>` "Il report di ottobre è senza cedolini: preparalo lo stesso?" (Conferma = salva com'è, `come: 'confermato'`; Apri = la pagina su quel mese). Quando i dati diventano completi si salva al giro dopo.
- Due iscrizioni (revisione del 20/11): `report-mese` è riservata (area Conti), così diario, dubbi e scarti che parlano di cedolini o fatture stanno in `econfig`; salva `rp-` e `rpc-` e Annulla le toglie tutte e due. `report-mese-squadra` (area Campagna) ha `pronta: () => !contiVisibili()`: dal titolare non parte; dal collaboratore salva solo `rp-` (diario in `config`).
- Senza nessun dato registrato nel mese (`haDati`: operazioni, eventi, latte, movimenti, pesate, manutenzioni, fatture, pagamenti, cedolini) non si salva niente: al collaudo un archivio vuoto aveva un report di ottobre "completo" e vuoto.
- Annulla dal Diario: l'hook `annullato` lascia il segno `rpx-AAAA-MM` (solo il mese) in `config` e, per `report-mese`, anche in `econfig`; il giro dopo non risalva quel mese da solo ma chiede ("era stato annullato: salvarlo di nuovo?"). `salva()` toglie il segno.
- `apriPagina: { tab }` (facoltativo, nuovo): nella pagina Automatico la riga dell'automazione ha anche "Apri" (`views/automatico.js`).
- Un mese passato senza istantanea (app non aperta per tutto il mese dopo) si salva solo a mano dalla pagina.

## Aggancio per le altre parti (`aggiungiSezione`)

`aggiungiSezione({ id, dopo: 'stalla', calcola(ctx) → sezione | null, controlli?(ctx) → [controllo] })` da un proprio file (es. latte dal caseificio, F24, scadenze), senza toccare `report.js`. `ctx = { mese, y, k, ini, fin, rif, mp, conti, oggi }`; una sezione riservata si dà solo con `ctx.conti`. Una sezione che lancia un errore diventa una sezione con la nota dell'errore, il resto del report si prepara lo stesso.

## Esportazione

Excel e CSV con `esporta()` di `conti/tabelle.js` (foglio "Riepilogo" con controlli e numeri, poi un foglio per tabella, `sheet` ≤ 31 caratteri); Stampa/PDF con `stampa()` di `conti/tabelle.js` e un corpo proprio (controlli, numeri a riquadri, tabelle).
