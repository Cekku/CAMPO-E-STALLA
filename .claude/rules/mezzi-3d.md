---
paths:
  - "js/trattori.js"
  - "js/gasolio.js"
  - "js/auto-stalla.js"
  - "js/views/libretto.js"
  - "js/views/mezzi.js"
  - "js/allegati.js"
  - "js/trattore3d.js"
  - "js/stalla3d.js"
  - "js/views/progetto3d.js"
  - "modelli/**"
  - "strumenti/render-stalla/**"
  - "strumenti/ponte-fatture-trattori.html"
  - "LIBRETTO-TRATTORI.md"
---

# Libretto dei trattori e stalla in 3D

(Spostato da CLAUDE.md il 17/11/2026. Si carica da solo quando si lavora su questi file.)

## Libretto dei trattori (dalla 1.12.0)

Guida completa e di passaggio: **`LIBRETTO-TRATTORI.md`**. In breve:
- `js/trattori.js` (catalogo di 32 pezzi con intervalli in ore e mesi, modelli dell'azienda con il catalogo ricambi John Deere o AGCO, `stato()`), `js/views/libretto.js` (scheda del trattore con le schede Libretto, Interventi, Scadenze, Ricambi e 3D; azioni `data-act="lib-…"` instradate da `app.js`), `js/allegati.js` (fatture e foto: cache `ces-allegati-1` + Supabase Storage `allegati/<azienda>/<id>`), `js/trattore3d.js` (three.js r128 in `vendor/three`, modello `modelli/trattore.glb`, CC BY 4.0).
- I mezzi di tipo Trattore aprono la scheda nuova; gli altri mezzi tengono quella di prima. `mezzoOre` usa la lettura del contaore (`oreLettura` + lavori successivi).
- Fatture lette con Claude: pagina ponte su claude.ai (`strumenti/ponte-fatture-trattori.html`, indirizzo in `PONTE_FATTURE`) → appunti `CAMPOSTALLA-FATTURA:{json}` → l'app compila l'intervento. Se aggiungi un pezzo a `CATALOGO`, aggiornalo anche nella pagina ponte e in `COMP3D`.
- Archivio fatture online: `supabase/aggiornamento-allegati.sql` (versione schema 4), da eseguire una volta nello SQL Editor.

## Progetto della stalla in 3D (dalla 1.29.0, 11/11/2026)

- Origine: render Unreal Engine 5.7 già compilato (scena Twinmotion `CECUTTITOTALE`, da Revit/AutoCAD), senza file sorgenti. Estratto con lo strumento in `strumenti/render-stalla` (passi in `LEGGIMI.md`: mappatura `.usmap` con UE4SS su una copia del render, CUE4Parse, gltfpack `-kn -km` senza `-si`). Programmi e copia del render sul PC in `%USERPROFILE%\Strumenti`; il modello pronto è `modelli/stalla-progetto-3d.glb` (3,5 MB, 1.607 pezzi, ~390.000 triangoli).
- Il modello sta nel repository, in `modelli/stalla-progetto-3d.glb` (dalla 1.29.1: Marco ha scelto di pubblicarlo l'11/11/2026, sapendo che il repository è pubblico). La pagina lo apre da sola. Con "Carica un altro modello" se ne può usare un altro: diventa un allegato privato (`js/allegati.js`), registrato in `config` id `progetto3d` (`{file: {id, nome, tipo, kb}, titolo, caricato}`) e visibile a chi ha `puoAllegati`. "Torna al modello del progetto" lo toglie.
- `js/stalla3d.js`: three.js r128. Le posizioni intere di gltfpack sono **non normalizzate**: la scala sta nel nodo, quindi non vanno divise. Poi tutto passa in coordinate della scena e si unisce per gruppo e materiale: da 1.613 disegni a 28.
  - `GRUPPI`: nuova stalla, cuccette, portoni e cancelli, stalle esistenti, concimaia e vasche, tetti, fotovoltaico, fondazioni (spente all'apertura), terreno. Tetti e fotovoltaico si riconoscono dal materiale (`Roof_covering`, vetro, `AutoCAD_5`/`Matt_chrome_2`), gli altri dal nome del gruppo del disegno.
  - `VISTE`: Insieme, Dall'alto, Nuova stalla (inquadra cuccette, cancelli e fondazioni).
  - Toccando un pezzo si vede il nome del gruppo. Il ciclo di disegno si ferma quando la tela esce dalla pagina.
- Provato nel browser (in locale, modello caricato con un `DataTransfer` sul campo file): caricamento, viste, tetti spenti, tocco, telefono 375 px senza scorrimento di lato. Con il pannello del browser nascosto `requestAnimationFrame` non gira: per le schermate si disegna con un `setInterval`.

## Gasolio dei mezzi (automazione `gasolio-mezzi`, 20/11/2026)

- Logica in `js/gasolio.js`, registrata dal Centro in `js/auto-stalla.js` (area campagna). Parte dal giorno del primo giro (config `gasolio-auto.dal`): i lavori più vecchi non si toccano.
- Per ogni lavoro fatto (non pianificato) con mezzo e ore, senza gasolio scelto a mano, propone uno scarico di ore × consumo l/h: movimento `gs-<id lavoro>` con campi gasOp, gasMezzo, stima, lh, ore.
- `rifornimenti` = scarichi di gasolio con `movimenti.mezzoId` ("Messo nel mezzo"); `misure` = litri del rifornimento (a pieno) diviso le ore dal rifornimento prima, più i lavori con gasolio scelto a mano con quantità; `consumo` sceglie scheda (`mezzi.consumoLh`) o misure; `consumoTesto` scrive la fonte nella riga "Consumo gasolio" (`js/views/mezzi.js`, `js/views/libretto.js`).
- Sicuro (`SICURO`): almeno 3 misure, 30 ore in tutto, scarto sotto il 25%. Allora lo scarico si salva da solo; altrimenti un dubbio per mezzo (Conferma scarica tutti quei lavori, Scarta = non si scaricano più). Mezzo senza consumo: dubbio "scrivi il consumo nella scheda".
- `gasolioDa` sceglie il prodotto (quello in `prodottoId`, o l'unico di categoria Gasolio; con più prodotti un dubbio per scegliere). Mezzo con un rifornimento dal giorno di partenza: il gasolio esce dalla cisterna con i rifornimenti, quindi niente scarichi per lavoro e le stime `gs-` non toccate a mano fino al giorno dell'ultimo rifornimento si tolgono (`togli` con `rifornito`, fatti → `rifornito`), altrimenti si contava due volte (revisione del 20/11/2026). Per quei mezzi le ore servono solo a imparare il consumo.
- `movimento` costruisce lo scarico, `piano` mette insieme salvataggi, dubbi e rimozioni; `PRE` è il prefisso `gs-` degli id. Ore cambiate: scarico aggiornato da solo se il consumo è sicuro e non è stato cambiato a mano; lavoro cancellato: scarico stimato tolto.
- Config `gasolio-auto` = { dal, prodottoId, fatti: opId → fatto | scartato | annullato | rifornito }. Uno scarico tolto a mano o annullato non torna; annullando il primo giro il `dal` resta (`annullato` lo rimette). Le ore del mezzo non cambiano.
- Campi nuovi in `js/forms.js`: `mezzi.consumoLh` (casella "Consumo di gasolio") e `movimenti.mezzoId` (casella "Messo nel mezzo").

Revisione della 1.66.0: in `gasolio.js` `piano()` la stima `gs-<lavoro>` non toccata si toglie anche quando nel lavoro si sceglie poi il gasolio a mano (prodotto del lavoro o movimento `opId` di gasolio): prima uscivano tutti e due. Provato in Node.

## Campi nuovi dei mezzi e tipi (rilascio 4, 22/11/2026)

- Campi: `telaio`, `potenza` + `potenzaU` ('CV'/'kW'), `larghezza` (m), `inAffitto` ('Sì'), `dataImmatricolazione`, `dataAcquisto`, `vitaAnni` (scheda: "fino al" = anno di acquisto + vita). Visibili nella scheda (`views/mezzi.js`), potenza anche nella card; CSV `mezzi` dal pulsante in testa.
- `TIPI_MEZZO` in `domain.js`: i primi 8 invariati, poi i tipi nuovi; `isTrattore` = solo 'Trattore'; `Irroratrice` è usata da `checks.js` e dal registro. `TIPI_MAN` ha tipi nuovi (rottura, usura, taratura, lavaggio della botte, sanificazione); Tagliando invariato.
