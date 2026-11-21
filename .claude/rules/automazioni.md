---
paths:
  - "js/automazioni.js"
  - "js/automazioni-agganci.js"
  - "js/views/automatico.js"
  - "js/auto-magazzino.js"
---
# Centro automatico (19/11/2026, chiesto da Marco)

Punto unico da cui partono e si controllano le automazioni dell'inserimento dei dati. Decisioni di Marco: partono da sole all'apertura e ogni 30 minuti finché l'app è aperta, più i pulsanti; **un dato non sicuro non si salva mai da solo** (va fra i dubbi, con la proposta pronta).

## File

- `js/automazioni.js`: motore (iscrizione, giri, blocco, diario, dubbi, scarti, annulla, stato del ponte).
- `js/automazioni-agganci.js`: le automazioni che c'erano già, iscritte con dei contenitori (importato da `app.js`).
- `js/views/automatico.js`: pagina "Automatico" (tab `automatico`, voce in "Gestione" di ogni area, riquadro `autoCard()` nelle due dashboard), azioni `au-*`.
- `js/store.js`: `osservatori` (Set) riceve `(col, id, prima, cancellato)` a ogni scrittura locale (`put`, `remove`, `bulkPut`); le modifiche dal cloud (`applyRemote`) non passano di lì.
- Barra in alto: `#autoBtn` (fulmine con il numero dei dubbi, `autoPill()` in `app.js`); sotto 560 px si vede solo se ci sono dubbi o un giro in corso.

## Contratto `registra`

```js
import { registra } from './automazioni.js';
registra({
  id: 'latte-caseificio',            // unico
  nome: 'Latte dal caseificio',      // come lo legge Marco
  area: 'stalla',                    // conti | personale | magazzino | stalla | campagna | archivio
  descr: 'Una riga su cosa fa',
  soloTitolare: false,               // conti, personale e archivio lo sono sempre
  raccolte: ['latte'],               // raccolte che scrive: SOLO queste vanno nel diario (null = tutte)
  segui: ['invii'],                  // facoltativo: raccolte (o funzione che dà un elenco di valori) — se cambiano riparte da sola
  pronta(ctx) { return true; },      // true/undefined = parti; false = salta in silenzio; testo = salta e spiega (a mano diventa l'avviso)
  async esegui(ctx) {                // ctx = { auto, motivo: 'apertura'|'ogni30'|'pulsante'|'cambio', giro }
    return { salvati: 3, note: '3 giorni di latte salvati', dubbi: [/* … */] };
  },
  dubbi() { return [/* dubbi letti dai dati salvati: restano anche dopo aver ricaricato */]; },
  async annullato(riga, tolti) {},   // dopo l'annullamento di una sua riga del diario; tolti = [{ c, id, rec }] com'erano prima di annullare
  propri: (col, id) => id.startsWith('lt-'),   // consigliato: quali record scrive lei (vanno nel diario anche mentre si lavora a mano)
});
```

- `esegui` salva con `store.put`/`bulkPut`/`remove` come al solito: il motore cattura da solo cosa scrive (raccolta, id, versione di prima) per il diario. `salvati` è il numero da mostrare (se manca: i record scritti). Un errore lanciato finisce nell'esito e nel diario.
- Dubbio: `{ id, area?, testo, proposta, conferma?(), scarta?(), apri? }`. `id` stabile (es. `mf:<riga>`): uno scartato non torna. `conferma` esegue la proposta (quello che scrive va nel diario, motivo `conferma`); senza `conferma` la pagina mostra solo Scarta e Apri. `apri` = funzione oppure `{ area, tab, sub }`. I dubbi da `esegui` restano in memoria fino al giro dopo; quelli che devono durare vanno in `dubbi()` (letti da record salvati).
- **Mai salvare un dato non sicuro**: mettilo fra i dubbi con la proposta pronta.
- Funzioni: `avvia(id)`, `avviaArea(area)`, `avviaTutto()`, `dubbi()`, `numeroDubbi()`, `conferma(id)`, `scarta(id)`, `annulla([idRiga])`, `annullaGiro(giro)`, `controllaPonte(forza)`, `vai({area, tab, sub})`. `STATO` = `{ attivo, corrente, ultimo, esiti }`.

## Ritmo e blocco

- `avviaCentro()` (dal boot di `app.js`, dopo `initStore`): aspetta i dati pronti (`UI.loaded` e, con l'azienda collegata, sincronizzazione `ok` senza modifiche in attesa), poi giro completo se l'ultimo ha più di 5 minuti; poi controlla ogni minuto e rifà il giro dopo 30 minuti (`ces.centro.ultimo` in localStorage, per dispositivo). `dopoDisegno()` (in `render()`) fa ripartire, 1,5 s dopo, le automazioni con `segui` i cui dati sono cambiati.
- `segui` (1.64.1): due valori sono uguali anche se sono oggetti semplici nuovi con lo stesso contenuto (`uguale` in `automazioni.js`). Prima `MF.stato()` senza record dava un `{}` nuovo a ogni disegno: il giro ripartiva ogni ~2 s e la pagina lampeggiava (le caselle perdevano il cursore). Un `segui` deve dare valori stabili fra un disegno e l'altro.
- Un solo giro alla volta (`STATO.attivo`), anche per conferma e annulla. Sola lettura (`lettore`): niente parte.
- Ha sostituito: `avviaArchivioConti` (15 s e poi ogni 20 s, in `app.js`), `autoSeServe` e `abbinaFitoSeServe` a ogni disegno, `avviaScaricoRazioni` (ogni ora). Le funzioni restano nei loro file. Il controllo dei 30 minuti di `conti/automatico.js` (`avvia`, `ces.auto.ultimo`) non si usa più: il contenitore chiama `esegui` con le stesse condizioni (attivo, sincronizzato, niente dati di prova, ponte acceso).

## Diario

- Una riga per automazione e giro: id `ad-<giro>-<automazione>`, `{ tipo: 'diario', giro, aut, nome, area, quando, motivo, salvati, note, errore, scritti: [{ c, id, n?: 1 (nuovo) | p: versione di prima, h: impronta di quella scritta }] }`. Solo se ha scritto qualcosa o c'è un errore.
- Dove: `econfig` (riservata al titolare dalle regole RLS, come le fatture) per le automazioni `soloTitolare`; `config` (la vedono i collaboratori) per le altre. Si tengono 30 giorni. Una riga oltre ~700 000 caratteri lascia fuori le versioni di prima più grandi (quei record non si rimettono).
- **Scritture a mano durante un giro**: `app.js` segna ogni azione a mano (`mano(promessa)` per i clic che non sono `au-`, `segnaMano()` per change/input/submit/drop); mentre ce n'è una in corso e per 2 s dopo, si registra solo quello che l'automazione dichiara suo con `propri(col, id)`. Senza `propri` (oggi solo l'archivio dei Conti) quelle scritture si saltano e la riga dice quante (`aMano`): Annulla non le tocca. Un'automazione non riservata non può mettere nel diario (in `config`) record delle raccolte riservate (`RISERVATE` di `conti/dati.js`).
- Annulla: toglie i record nuovi e rimette la versione di prima; un record che dopo il giro è cambiato (impronta diversa, chiavi ordinate, quindi uguale anche dopo il giro dal cloud) resta com'è. La riga resta con `annullato`, `quanti` ed `esito` `{ fatti, cambiati, persi }`.
- Annullare una riga sola di un giro può lasciare effetti legati (es. carichi in magazzino delle fatture appena lette): la Guida consiglia "Annulla il giro".
- Scarti: `ad-scarti` `{ tipo: 'scarti', ids: { idDubbio: quando } }` in `econfig` o `config`, massimo 3000.

## Agganci (`automazioni-agganci.js`)

| id | area | cosa | annullare |
|---|---|---|---|
| `conti-archivio` | conti | `conti/automatico.js` `esegui`; dubbi = documenti `dubbi`/`nonletto` (cedolini e bilancini paghe in area personale), Apri porta a "Dall'archivio del PC" e apre la revisione (`c-auRivedi`), Scarta = `segnaStato(…,'ignorato')`; niente Conferma (la revisione è nella pagina) | il documento resta `ignorato` ("annullato dal Centro"), così non si rilegge |
| `mag-fatture` | magazzino (solo titolare) | **dalla 1.66.0 in `js/auto-magazzino.js`** (vedi `magazzino.md`): `pulisciSeServe` in `pronta` + `caricaPronte` (solo righe certe); dubbi = `elenco().daFare` con proposta (prodotto e quantità, o crea nuovo), alternative, resi e correzioni di prezzo delle note di credito | le righe caricate dal giro (e le correzioni di prezzo `r>`) vanno fra le "non caricare" (`togli`); annullando una conferma la riga torna da fare |
| `fito-abbina` | magazzino | `abbinaFitoSeServe`; segue prodotti e banca dati | il prodotto torna senza numero e con `nRegAuto`: non si riabbina |
| `razioni` | stalla | `scaricaRazioni`; segue razioni | `autoFino` non è nel diario: lo scarico annullato non torna |
| `paghe-controlli` | personale | `dubbiPaghe()` di `conti/dubbi.js` (doppioni incerti, cedolini in attesa `ca-…`, abbinamenti incerti); `esegui` non salva, conta | conferma/alternativa nel diario |
| `fatture-controlli` | conti | `dubbiFatture()` (segno delle note di credito, righe che non tornano, pagamenti doppi) | conferma/alternativa nel diario |

Dalla 1.63.0 (revisione): una `conferma()` che restituisce `false` (dati cambiati nel frattempo) è un errore, non "Confermato"; `scarta()` gira dentro `cattura` e scrive una riga di diario (motivo `scarta`, campo `dubbio`): annullandola torna quello che lo scarto ha tolto (es. il cedolino in attesa `ca-…`) e l'id esce da `ad-scarti`, così il dubbio ricompare. Conferma, alternativa e scarto usano `cattura(d, true)`: registrano tutto quello che si scrive in quel momento, anche entro i 2 s di un'azione a mano (prima la riga restava vuota e non si annullava).

Dubbi con più scelte (1.63.0): facoltativi `alternative: [{ testo, conferma() }]` (pulsanti accanto a Conferma, azione `au-alt`, funzione `alternativa(id, i)`: va nel diario come una conferma) e `dettagli: [[voce, già salvato, arrivato adesso]]` (tabellina `.au-det` sotto il testo).

In `magfatture.js` aggiunte solo `pulisciSeServe()` e `occupato()` (per il contenitore).

## Provato

Vedi il collaudo del 19/11/2026 nel commit: pulsanti Avvia tutto, area, singola, Conferma, Scarta, Annulla, anche da collaboratore; 375 px e tema scuro.
