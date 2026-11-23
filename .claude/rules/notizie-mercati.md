---
paths:
  - "js/notizie.js"
  - "js/views/notizie.js"
  - "supabase/functions/rassegna/**"
  - "supabase/functions/_shared/**"
  - "supabase/aggiornamento-rassegna.sql"
---

# Notizie e mercati (1.71.0, 23/11/2026)

Chiesto da Marco: una pagina al giorno con riassunto, analisi e prospettive degli articoli dei portali di settore che sceglie lui (ha indicato CLAL, Teseo, Ruminantia; gli altri li ho consigliati io), e grafici dei prezzi delle materie prime e del latte (stalla, spot, futures) con le correlazioni. Scelte di Marco: lavora **Supabase e PC insieme**, pagina **ogni giorno**, la vedono **tutti in azienda** (il suo prezzo del latte dalle fatture solo il titolare).

## Dove sta

- **Area a parte** `notizie` (1.72.0, Marco: "il menù delle notizie e analisi deve essere separato dalle 4 sezioni"): in `MENU`, `TOP`, `BNAV`, elenco delle aree del cassetto e del menu in alto (per tutti, anche senza Conti), colore della barra `body[data-area="notizie"]`; `render()` tiene nell'area solo `notizie`, `impostazioni`, `guida` e porta nell'area chi apre `notizie`. Pagina `notizie` con le schede `panoramica` (pagina iniziale: rassegna di oggi con gli articoli importanti, numeri, grafici latte e mais/soia e latte/mangime su 24 mesi, analisi, prospettive, mercati, i tre legami più forti), `rassegna`, `mercati` ("Prezzi e grafici"), `portali`. Nella 1.71.0 era una sezione dei menu di Campagna e Stalla. Azioni `nz-*` → `nzAct`; le tendine usano `data-nz` (gestore `change` di `app.js`).
- Raccolte nuove, **non riservate** (nessuna modifica alle RLS): `fonti` `{nome, url, sito?, argomento, attiva}`, `rassegna` (id = `AAAA-MM-GG`), `mercati` (id = serie: `{nome, gruppo, unita, fonte, url, mesi: {'AAAA-MM': v}, sett: [['AAAA-MM-GG', v]], aggiornato}`).
- `supabase/functions/_shared/mercati.js`: JavaScript puro senza import, lo usano la funzione (Deno) e l'app (servito da GitHub Pages, nella `SHELL` del service worker). Dentro: `FONTI_CONSIGLIATE` (feed provati il 23/11/2026), `SERIE`, lettori `leggiFeed` (RSS e Atom con espressioni regolari, niente DOMParser in Deno), `trovaFeed`, `tabelle`/`tabMesi`/`tabSett`/`leggiSerie`, calcoli `mensile`, `andamento`, `anticipo`, `latteSuMangime`, `riepilogo`, e per l'IA `ISTRUZIONI`, `SCHEMA`, `messaggioUtente`, `componi`.
- `supabase/functions/rassegna/index.ts` (`verify_jwt = false`, controlli suoi): pg_cron con l'intestazione `x-rassegna-segreto` = segreto `RASSEGNA_SEGRETO` → tutte le aziende con dei portali; oppure l'app con il token dell'utente e `{farm, rifai: true}` → controllo `is_member`. Risponde subito 202 e lavora dopo (`EdgeRuntime.waitUntil`): la pagina arriva con la sincronizzazione. Scrive con la chiave di servizio solo `mercati` e `rassegna`; legge solo `fonti` e le ultime 12 pagine (`visti` = link già usati, esclusa la pagina di oggi così rifarla la ricompone tutta). Una pagina di Claude si rifà solo a mano e non prima di 15 minuti.
- `supabase/aggiornamento-rassegna.sql`: pg_cron + pg_net, segreto nel Vault (`rassegna_segreto`), ogni giorno alle 5:00 UTC.
- `js/notizie.js`: `prezzoProprio()` (fatture del latte `fattureMese()`, `prezzoMedio` €/1000 l ÷ 10 = €/100 l con premi; null se non titolare), `riepilogoOra(conProprio)`, `aggiungiConsigliate`, `aggiornaAdesso` (chiama la funzione), `riassuntoPC(giorno)` (LM Studio con `response_format` json_schema; se la pagina è già di Claude va in `secondo`).

## Prezzi

- Fonti: pagine pubbliche di **CLAL** (latte: `confronto_latte_lodi` = stalla Lombardia e spot Milano mese per mese; `latte_europa_mmo` = media UE) e **Teseo** (Borsa merci di Bologna: mais zootecnico, farina di soia 44% integrale nazionale, orzo 62/64; Verona: fieno maggengo f.co arrivo; Torino: urea 46%; Milano: gasolio agricolo, solo la tabella mensile perché quella settimanale si riempie con JavaScript). Tabelle "Prezzi medi mensili" (anni in colonna: danno lo storico, alcune dal 2016) e "Data del rilevamento" (min/max settimanali, media; completano il mese in corso). robots.txt di CLAL e Teseo senza divieti; una lettura al giorno.
- **Non usati**: i grafici dei futures di CLAL (indirizzo interno `confronti/single_product.php` con un codice: il permesso è stato negato e non va aggirato); l'API agridata della Commissione UE (il 23/11/2026 "endpoint SUSPENDED", senza CORS); i futures EEX (sul latte liquido esistono ma senza prezzi pubblici giornalieri; i PDF mensili "Final Settlement Prices" danno solo burro, latte in polvere e siero a scadenza: possibile lavoro per il PC).
- Legami (`anticipo`): correlazione di Pearson delle **variazioni mensili** (non dei prezzi), ritardo 0–6 mesi, ultimi 72 mesi, almeno 12 mesi in comune; riferimento = il tuo prezzo se ha almeno 12 mesi, altrimenti stalla Lombardia. Sulle pagine del 23/11/2026: media UE anticipa la Lombardia di 2 mesi (r 0,63), spot di 1 mese (0,44), mais di 4 (0,53, da prendere con cautela).
- Latte/mangime: kg di un mangime indicativo 70% mais + 30% soia (Bologna) pagati da un litro di latte (`MIX`).

## IA

- Claude: modello `RASSEGNA_MODELLO` (predefinito `claude-opus-5-5`, ammessi solo i tre di `MODELLI`), `output_config: {effort: 'low', format: json_schema}`, `fallbacks: 'default'` con la beta `server-side-fallback-2026-07-01`, istruzioni con `cache_control`. Al massimo 30 articoli (6 per portale, ultimi 4 giorni), 1.200 caratteri ciascuno. Gli articoli vanno a Claude numerati e Claude risponde con i numeri: link e titoli li rimette `componi`, così non può inventarli; gli articoli non citati finiscono in "Altri articoli". Costo stimato salvato in `costo` (lo vede solo il titolare).
- A Claude e nella pagina salvata **non va mai** il prezzo del latte delle fatture (la pagina la vedono tutti i membri): `riassuntoPC` usa `riepilogoOra(false)`. Il confronto con il tuo prezzo è calcolato solo nel browser del titolare (grafico, numeri, legami).
- Tempo massimo della funzione: 150 s nel piano gratuito (per questo effort basso e 30 articoli).

## Prove

- Lettori provati con il Node di LM Studio sulle pagine vere salvate in `prova-mercati/` (fuori dal repository, `.gitignore` `prova-*/`): 9 serie su 9, feed di Ruminantia (10) e CLAL (20).
- **Non provato**: la funzione pubblicata (Deno non c'è sul PC: sintassi controllata con `node --experimental-strip-types --check`), pg_cron, Claude vero.
