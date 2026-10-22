# Campo e Stalla — note di progetto per Claude Code

Gestionale dell'azienda agricola e zootecnica (vacche da latte) di Marco, Az. Agr. Cecutti Stefano e Silvano s.s., Povoletto (UD).
App web installabile (PWA), **local-first**, scritta in JavaScript puro (moduli ES, nessun build, nessun framework).
Questo file riassume tutto il lavoro fatto e come proseguire. La guida per l'utente è in `LEGGIMI.md`.

- Repository: `github.com/Cekku/CAMPO-E-STALLA` (ramo `main`; il ramo `conti` è tenuto allineato a `main` con `git branch -f conti main && git push -f origin conti`).
- Pubblicazione: **GitHub Pages** dal ramo `main` (https://cekku.github.io/CAMPO-E-STALLA/). Il sito ha `noindex` e `robots.txt`: non deve comparire sui motori di ricerca.
- Versione attuale: **1.7.3** (`js/version.js`) — a ogni rilascio aggiornare `js/version.js` e `VERSION` in `sw.js` (es. `ces-1.7.3`), e aggiungere i file nuovi alla lista `SHELL` del service worker.
- Lingua dell'interfaccia e dei testi: **italiano semplice**, rivolto a un agricoltore, niente gergo tecnico.

## Architettura

- `index.html` + `css/app.css` + `js/app.js` (router, menu per area, azioni globali con `data-act`, eventi `click/change/submit`).
- Stato: `js/state.js` (`S` = raccolte in memoria, `UI` = filtri e navigazione, `COLS` = elenco delle raccolte).
- Archivio: `js/store.js` — IndexedDB locale (un'unica tabella `records`), sincronizzazione facoltativa con **Supabase** (tabella `records` con RLS). Funzioni: `put`, `remove`, `bulkPut`, `cloudConfig`, `schemaVersion`.
- UI: `js/ui.js` (`openSheet`, `closeSheet`, `toast`, `arm` conferma in due tocchi, `tabs`, `empty`), `js/icons.js` (Lucide).
- Aree: **Campagna** (campi, mappa, attività, magazzino, mezzi, meteo, note), **Stalla** (capi, eventi, latte, razioni, box/silos), **Conti** (riservata al titolare).
- Mappa: `js/map.js` (Leaflet + Geoman, ortofoto FVG, satellite, catasto AdE WMS, NDVI Sentinel-2), `js/geo.js` (aree, centroidi, import KML/GeoJSON/shapefile).
- Blocco con codice: `js/lock.js` (PIN con PBKDF2 in localStorage `ces.lock`).
- Librerie in `vendor/`: leaflet, geoman, supabase-js, **pdf.js 4.10.38 legacy** (`vendor/pdfjs`), **Tesseract.js 6** con lingua italiana (`vendor/tesseract`, lettura ottica in locale).

## Modulo Conti (`js/conti/`, viste in `js/views/conti*.js`)

Visibile solo al titolare (`contiVisibili()`); raccolte riservate: `fatture`, `bilanci`, `econfig`, `paghe`, `pagamenti`.
Con il cloud la riservatezza è garantita dalle regole RLS in `supabase/schema.sql` (e `supabase/aggiornamento-conti.sql` per i database vecchi); `ces_schema_version()` = 3, l'app avvisa se il database è più vecchio.

- `pdftext.js`: testo dei PDF con posizioni (equivalente di pdfplumber: `leggiPdf`, `parole`, `righeParole`, `testoPagina`).
- `fatture-parse.js`: fatture XML/P7M/ZIP del cassetto fiscale e PDF (AdE, TeamSystem, prospetti latte). `regole.js`: categorie automatiche.
- `iva-parse.js`: dichiarazioni IVA (telematico o PDF). `bilancino-parse.js` + `ocr-bilancino.js` + `alfabeto.js`: bilancini del commercialista (anche PDF "disegnati" senza testo).
- `schema.js`: conto economico, stato patrimoniale, cespiti, indici (righe come nel vecchio Excel). `analisi.js`: analisi della stalla da latte. `dati.js`: calcoli memorizzati; `calc(y)` usa i costi del personale dalle paghe (B.9 righe 57-59) se il CE non li ha.
- `importa.js`: "Carica documenti" riconosce da solo il tipo di file (fatture, IVA, bilancini, cedolini, bilancini paghe, contabili di bonifico, estratti conto).
- `tabelle.js`: tabelle ordinabili con esportazione **Excel / CSV / stampa-PDF**; `xlsx.js`, `zip.js` scritti a mano.

### Personale (paghe) — `paghe-parse.js`, `paghe.js`, `views/conti-personale.js`

- **Cedolini** (modulo Data Services, un dipendente per pagina + pagina "Totali generali"): lettura per posizione (riferimento: la riga più bassa del modulo a y≈797; la riga del mese a 792). Campi: anagrafica, CF, qualifica, scadenze TD e permesso di soggiorno, ore, lordo, contributi, IRPEF, netto, TFR, voci, ferie/permessi. Mensilità aggiuntive: "13-esima", "14-esima", "tredicesima", "13ª" → mese 13/14 (periodo `AAAA-13`, `AAAA-14`; si pagano da dicembre / da giugno, `pagabileDa`).
- **Bilancino paghe** mensile: lordo, ritenute, netto, contributi ditta/dipendente, INAIL, TFR al fondo, IRPEF, costo aziendale, versamenti.
- **Pagamenti** (raccolta `pagamenti`): stipendio, anticipo (recupero dal bonifico o in busta), prestito, restituzione (dal bonifico / in busta / versata), F24, contributi INPS agricoli (trimestrali), fondo pensione, altro.
- **Abbinamento pagamenti → mesi** (`abbina` in `paghe.js`, testato con `t_abb.mjs`):
  1. mese indicato a mano o **scritto nella causale** (`competenzaDaCausale` in `bonifici-parse.js`: se manca l'anno si usa il mese più vicino alla data del pagamento; "via XX Settembre", "15 marzo" e date non contano) — si contano per primi;
  2. gli altri, in ordine di data, ai mesi già pagabili alla data del pagamento e non saldati (prima quello con residuo uguale all'importo, poi il più vecchio); mai a un mese non ancora maturato salvo che sia l'unico aperto (anticipo);
  3. l'eccedenza va all'ultimo mese pagato; senza cedolino → "senza cedolino" sul mese prima della data.
- **Doppioni**: stesso tipo, stesso dipendente (o beneficiario), stesso importo e **stessa data** = stesso pagamento → `eliminaDoppi()` li cancella in automatico (all'apertura dei Conti e dopo ogni importazione). Date diverse entro 5 giorni → avviso rosso. In importazione `segnaDoppi()` deseleziona i movimenti già registrati.
- **Nomi**: tabella "Nomi nei pagamenti" (Dipendenti) = alias per dipendente (`d-<chiave>` in `paghe`), vince sul riconoscimento automatico anche per i pagamenti già importati (non per quelli assegnati a mano, `dipManuale`). Omonimi (es. due SINGH AMARJIT con CF diversi) mostrati con l'anno di nascita o con il "nome da mostrare"; un bonifico al solo nome comune resta da scegliere. Unione manuale "è la stessa persona" (`u-<chiave>`), annullabile.
- **Controlli/irregolarità**: stipendi non pagati / in parte / in più / in ritardo, pagamenti in contanti (L. 205/2017), anticipi non trattenuti in busta, prestiti non restituiti da cessati, cedolini mancanti, lordi/netti che non tornano con bilancino o totali, F24/contributi/fondo non registrati, contratti a termine e permessi di soggiorno scaduti. "Ignora tutti" (testi in `econfig.cfg.pagheIgnora`).
- Viste: Riepilogo, Dipendenti (+ tabella nomi), Cedolini e bilancini, Pagamenti (import estratto/bonifici), Anticipi e prestiti, Verifica (matrice dipendenti × mesi, versamenti, scadenze).

### Banca — `bonifici-parse.js`, `banca.js`, `ocr-testo.js`

- Contabili di bonifico PDF (BCC Banca 360): beneficiario, IBAN, data esecuzione, importo, causale, causale bancaria SALA, identificativo.
- Estratto conto PDF (con testo o immagine → OCR Tesseract con soglia bianco/nero 200), CSV/Excel: movimenti con data, valuta, importo con segno, descrizione su più righe; `arricchisci` ricava controparte, IBAN (corretto con il controllo mod-97 per gli errori dell'OCR), causale, tipo operazione.
- Abbinamento alle **fatture** (`candidateFatture`): numero fattura nella causale, controparte + importo, più fatture della stessa controparte pagate insieme (somma esatta); i pagamenti finiscono in `fattura.pagamentiBanca` (colonna "In banca" e filtri nel registro fatture).

## Catasto (`js/catasto.js`)

- Ricerca per comune + foglio + mappale (anche più mappali e sezione): riquadro del comune da Nominatim → fogli `CP:CadastralZoning` → particelle `CP:CadastralParcel` del foglio, filtro per riferimento (`G949_002400.428`). Tocco sulla mappa → particella con confine. Azioni: crea campo, aggiungi a un campo (geometria unita in MultiPolygon, superficie e "Fg. x mapp. y").
- Il WFS dell'Agenzia (`wfs.cartografia.agenziaentrate.gov.it/inspire/wfs/owfs01.php`) **non ha CORS** e accetta solo BBOX: serve un inoltro. Funzione Supabase `supabase/functions/catasto/index.ts` (pubblicata dall'integrazione GitHub di Supabase grazie a `supabase/config.toml`, `verify_jwt = false`, solo host AdE ammessi) oppure Cloudflare Worker `supabase/functions/catasto/cloudflare-worker.js`. Indirizzo in La mia azienda → Catasto (vuoto = `<progetto Supabase>/functions/v1/catasto`).
- Elenco comuni: `data/comuni.json` (ISTAT via matteocontrini/comuni-json, MIT).
- **Limiti del WFS vero** (misurati il 22/10/2026): con un riquadro troppo alto in latitudine risponde `numberReturned="0"` senza errore (fogli: ok fino a ~0,07°, zero da 0,075°; particelle: ok fino a 0,016°, zero da 0,018°); larghezza e numero di risultati non contano (1.891 particelle in una richiesta nel centro di Udine). Per questo `wfs()` divide il riquadro (`PASSO`: fogli 0,06° lat × 0,12° lon, particelle 0,015° × 0,02°), 3 richieste alla volta, senza doppioni. Ogni tanto risponde a caso `ServiceException InvalidFormat "Richiesta non valida"`: `wfsUno()` riprova fino a 3 volte con `&_=` per non riusare la risposta in cache. Il WFS non dà la superficie delle particelle (`areaCatasto` resta `null`). Provato dal vivo con la funzione Supabase: Povoletto → 2 richieste per i fogli, foglio 15 = 416 particelle, tocco in mappa → `G949_001500.125`.
- Collegamento: l'indirizzo Supabase salvato è ridotto all'origine (`baseSupabase` in `store.js`), perché "…/rest/v1/" copiato dalla pagina API rompeva catasto e sincronizzazione; `scarica()` mostra l'errore del collegamento, non quello della richiesta diretta (che senza CORS fallisce sempre).

## Supabase

- Progetto: `vamcoyvunyjqgzxujsal` (URL `https://vamcoyvunyjqgzxujsal.supabase.co`). Collegato al repository con l'integrazione GitHub (Deploy to production, working directory `.`, ramo `main`).
- Prima configurazione: eseguire `supabase/schema.sql` nello SQL Editor; per database vecchi `supabase/aggiornamento-conti.sql`.
- Nell'app: La mia azienda → Sincronizzazione (Project URL + chiave anon/publishable; mai la service_role).

## Come lavorare

- Server locale per le prove: `python3 -m http.server 8765` nella cartella del progetto.
- Prove nel browser con Playwright (Chromium headless): caricare file con `set_input_files` sull'input `data-act=c-files` (Carica documenti) o `c-pMovFile` (Pagamenti); azioni simulate creando un bottone con `data-act`. Moduli testabili anche in Node (pdf.js da `pdfjs-dist/legacy`, `globalThis.localStorage` finto, `S` da `js/state.js`).
- Controllo sintassi: `node --input-type=module --check < file.js`.
- Commit con `git -c user.name="Claude" -c user.email="noreply@anthropic.com"` e righe finali `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; dopo il push su `main` attendere la pubblicazione di GitHub Pages (`gh api repos/Cekku/CAMPO-E-STALLA/actions/runs?per_page=1`).
- Dopo un rilascio l'utente aggiorna con Ctrl+Shift+R (computer) o chiudendo e riaprendo l'app (telefono).

## Preferenze dell'utente

- Vuole tutto in un unico software (sostituisce i vecchi file Excel di conto economico e gli estrattori Python).
- I dati economici e del personale devono restare privati (solo titolare, sito non pubblico).
- Ogni tabella esportabile in Excel, CSV e PDF.
- I controlli non devono dare incongruenze: abbinamenti dei pagamenti per data e causale, niente doppioni.

## Idee e punti aperti

- Estratti conto di altre banche e distinte con più bonifici: adattare i lettori su esempi reali.
- Integrazioni stalla (Alpro, MooMonitor, Si@lleva, SCR, carro miscelatore) per una dashboard unica.
