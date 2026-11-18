---
paths:
  - js/nitrati.js
  - js/views/nitrati.js
---

# Azoto e nitrati (1.53.0)

Chiesto da Marco il 18/11/2026: prima delle funzioni prese da xFarm (`docs/xfarm-funzioni.md`, bilancio dei nutrienti e limite N max).

- `js/nitrati.js`: `nitConfig()` legge `config/nitrati` (`zona` ZVN/Ordinaria, `capi` kg N/capo/anno per stato di `capoI(c).stato`, `mas` kg N efficiente/ha per coltura) sopra i valori di partenza `CAPI_DEF`, `MAS_DEF`, `LIMITI` (170/340). I valori sono **indicativi** (vacca 600 kg × 138 kg N/t pv = 83; rimonta 120 kg N/t pv; MAS da DM 25/02/2016 a memoria): il testo regionale FVG (decreto 23776/2024) non era leggibile in rete. Nella pagina c'è sempre l'invito a farli controllare dal tecnico.
- `masDi(coltura)`: nome esatto, poi per somiglianza (mais/granturco, frumento/grano, miscugli come triticale…), altrimenti null = "Coltura senza limite".
- `nutrientiOp(o)`: solo prodotti di categoria `Concime` (titolo % `titN/titP/titK` sul peso; q×100, t×1000, l contati come kg) ed `Effluente` (nuova categoria: `kgN/kgP/kgK` per unità, di solito m³ o t; efficienza `effN`, vuota = 50%). Quantità = `quantita`, altrimenti dose × ettari. Gli effluenti **non** si scaricano dal magazzino (`save` di `operazioni` in `forms.js`).
- `bilancioCampi(anno)`: attività fatte dell'annata (per data di inizio), una riga per campo con coltura o con apporti; stato: oltre il 100% del MAS rosso, oltre il 90% giallo; con MAS 0 (medica, soia) qualsiasi azoto è oltre.
- `azotoStalla(anno)`: capi presenti **oggi** per stato (non la media dell'anno), SAU = somma di `campoHa` di tutti i campi, carico = N prodotto / SAU, ettari minimi = N / limite; `distribuito` = N da effluenti registrato nell'annata.
- Pagina: Campagna → Agronomia → Azoto e nitrati (`tab: 'nitrati'`, sotto-schede `bilancio` / `valori`); tabelle `nit_campi` e `nit_stalla` esportabili con `bottoniExport`. Salvataggio dei valori: submit `data-form-act="nitrati"` → `salvaNitrati($)`; `nitReset` rimette i valori di partenza (tiene la zona).
- Da fare se Marco lo chiede: media dei capi nell'anno, Comunicazione/PUA in PDF, analisi del suolo per il fabbisogno di P e K.
