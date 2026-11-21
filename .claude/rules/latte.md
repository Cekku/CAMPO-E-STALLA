---
paths:
  - "js/latte-fattura.js"
  - "js/auto-latte.js"
  - "js/views/stalla.js"
  - "strumenti/prove/latte.mjs"
  - "strumenti/prove/ponte-finto-latte.py"
---

# Latte dal caseificio (20/11/2026, sessione E della seconda ondata del Centro automatico)

Il latte consegnato al caseificio entra da solo dalle **fatture mensili del latte** che sono nell'archivio del PC (ponte, `.claude/rules/archivio-ponte.md`).

## Cosa c'è nell'archivio (guardato il 20/11/2026, niente copiato)

- Una fattura in PDF al mese (testo vero; una sola copia è una scansione letta con l'OCR), dal 2019 a oggi: 104 file, compresa una copia doppia dello stesso mese. Numero della forma `NNNNNNN/MM`, "Periodo: gg/mm/aa - gg/mm/aa".
- Righe: `<descrizione> 1000 L <quantità in migliaia di litri> <prezzo per 1000 L> <IVA> <imponibile>`. Descrizioni viste: "Latte Vaccino Crudo", "… A.Q.", "Latte in esubero rispetto a <anno>" (sono latte: i litri del mese sono la loro somma), "PREMIO QUALITÀ", "PREMIO CERT.BENESSERE", "Adeguamento come da contratto", "RECUPERO QUALITÀ CBT <mese>" (positivo). Trattenute negative non ancora viste: il lettore accetta `-` davanti o dietro.
- Analisi (dal 2022): riga "Mese di <Mmm> <aaaa> <date dei prelievi> Media Premio/penale", poi `grasso`, `proteine`, `carica batterica`, `cellule somatiche` (valori dei prelievi, media, premio), `premio quantità <media/gg> <premio>`, `PREMIO CERT.A.Q. … <premio>`. **Un prelievo può mancare** senza segno: l'ultimo numero è il premio, il penultimo la media, i valori si legano alle date solo se ci sono tutti. La somma dei premi delle voci fa il "PREMIO QUALITÀ" per 1000 L dal 2025; nel 2024 no (il premio quantità non è nella tabella), quindi non è un controllo.
- Unità nelle analisi: grasso e proteine in %, cellule somatiche e carica batterica in cellule (o UFC) per ml interi (es. 6 cifre per le cellule): la vista li divide per 1000 ("mila/ml", come il modulo del latte).
- Consegne: tre colonne "data n.doc. L" per riga, `g/mm/aa <n. documento> <litri>`; **il n. del documento a volte manca** (2 fatture su 104). Poi "media/gg".
- Prova sui 104 testi veri (in locale, fuori dal repository): 104 su 104 con tutti i controlli giusti.
- Analisi separate (ASUFC, IZS, inibenti) sono pochi controlli straordinari: non si leggono.

## File

- `js/latte-fattura.js`: `eFatturaLatte(testo)`, `leggiFatturaLatte(testo)` → `{ numero, data, mese, periodo, righe: [{descr, tipo: latte|premio|adeguamento|recupero|trattenuta|altro, q, prezzo, iva, imp}], imponibile, iva, totale, litri, prezzoBase, prezzoMedio, valoreLatte, premi, trattenute, giorni: [{data, ddt, litri}], mediaGiorno, qualita: {grasso, proteine, cbt, cellule: {media, premio, valori?}, quantita, cert}, analisi: [date], controlli: [{voce, atteso, letto, ok}], ok }`. Controlli: litri della fattura = somma delle consegne; righe = totale imponibile; quantità × prezzo di ogni riga (±0,02 €); imponibile + IVA = totale; giorni nel periodo e senza doppioni.
- `js/auto-latte.js` (importato da `app.js`), due automazioni del Centro, area **stalla**:
  - `latte-caseificio` (anche i collaboratori): legge dal ponte (`cerca` con `q: 'latte vaccino crudo'`, solo PDF, `testoIntero`) e scrive nel registro `latte` (id = data): `conferiti`, `ddt`, `fonte: { tipo: 'fattura', numero, data, imp, nome, litri }`. Giorno nuovo → `litri` (prodotti) = conferiti e `prodStima: true` (il modulo lo toglie quando i prodotti cambiano). Giorno già scritto a mano con `conferiti` diversi → dubbio (Conferma = valori della fattura, alternativa/Scarta = tieni quelli salvati); con `conferiti` vuoto o uguale si aggiunge la fonte e i prodotti restano. Memoria in `config/latte-fatture` `{ docs: { impronta: { esito: fatto|copia|altro|dubbio|tenuto|annullato, n, data, mese, litri, motivo?, conflitti?, dettagli? } } }`: i dubbi durano perché `dubbi()` li legge da lì.
  - `latte-caseificio-conti` (`soloTitolare`): un record per fattura in `econfig` `lf-<numero senza zeri>-<data>` (tipo `latte-fattura`: litri, prezzo base e medio, valore del latte, premi, trattenute, imponibile, IVA, righe, qualità, date delle analisi). Memoria in `econfig/latte-fatture-conti`. Dubbi: controlli dei conti che non tornano (Conferma = salva così), un'altra fattura per lo stesso mese (Conferma = salvala anche, alternativa = doppione), stessa fattura in due file con valori diversi, imponibile diverso dalla stessa fattura nei Conti (`contiDiverso`, solo Scarta e Apri → Conti → Latte venduto).
  - Doppioni: stessa fattura (numero + data) in un altro file → `copia` (in silenzio se uguale, dubbio se diversa); lo stesso giorno da un'altra fattura con litri diversi → dubbio.
  - Annullare un giro: i documenti che quel giro aveva aggiunto alla memoria restano con esito `annullato` (non si rileggono, come l'archivio dei Conti); annullando una conferma o uno scarto il documento torna com'era (il dubbio ricompare). `propri` per `latte` = gli id che `scriviGiorni` sta scrivendo (il motore lo chiede prima della scrittura, quando il record nuovo non c'è ancora).
  - Copie: una fattura in dubbio per i controlli non blocca un'altra copia dello stesso numero e data; se la copia torna si salva e la prima diventa `copia`. Se il ponte non risponde il giro si ferma subito (si riprova al giro dopo).
  - Altri dubbi dei giorni: un giorno ripetuto nella stessa fattura, e un giorno scritto a mano con i prodotti ma senza conferiti quando la fattura dà più litri dei prodotti.
- `js/views/stalla.js`: nel registro giornaliero "dalla fattura n. … del …" (o "cambiato a mano (… l nella fattura …)" se i conferiti non sono più quelli della fattura) e "prodotti = conferiti"; riquadro **Mese per mese** (`latteMesi`): colonne dei litri consegnati del registro per mese; per il titolare anche litri della fattura, linee grasso/proteine e cellule/carica batterica, tabella con prezzo base, premi, trattenute, imponibile, €/l con premi, esportabile (`latteMesi`).

## Prove

- `node strumenti/prove/latte.mjs`: fatture finte costruite sul formato (prelievo mancante, penale negativa, n. documento mancante, giorno storpiato, imponibile sbagliato, righe A.Q./esubero/recupero/trattenuta, senza analisi, documenti non del latte).
- Nel browser: `node strumenti/prove/latte.mjs --json <file>` + `python -I strumenti/prove/ponte-finto-latte.py <file> 1237`, poi nell'app `localStorage['ces.archivio'] = '{"url":"http://127.0.0.1:1237"}'`. Documenti finti: luglio con imponibile sbagliato, agosto con un giorno storpiato, settembre senza un n. documento, ottobre e una sua copia, una fattura di mangime.
- Node sul PC di Marco: non c'è un Node installato; si usa quello di LM Studio (`%LOCALAPPDATA%\Programs\LM Studio\resources\app\.webpack\bin\node.exe`).
