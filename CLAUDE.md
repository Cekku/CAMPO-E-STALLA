# Campo e Stalla — note di progetto per Claude Code

Gestionale dell'azienda agricola e zootecnica (vacche da latte) di Marco, Az. Agr. Cecutti Stefano e Silvano s.s., Povoletto (UD).
App web installabile (PWA), **local-first**, scritta in JavaScript puro (moduli ES, nessun build, nessun framework).
Questo file riassume tutto il lavoro fatto e come proseguire. La guida per l'utente è in `LEGGIMI.md`.

**Organizzazione del lavoro fra i modelli**: `.claude/rules/organizzazione.md` (chat principale Opus; agenti `esploratore` Haiku, `esecutore` e `collaudatore` Sonnet, `revisore` Opus in `.claude/agents/`). Seguirla in ogni chat: all'inizio di ognuna l'hook `SessionStart` (`.claude/settings.json` → `.claude/hooks/promemoria.py`) la ricorda in breve.

- Repository: `github.com/Cekku/CAMPO-E-STALLA` (ramo `main`; il ramo `conti` è tenuto allineato a `main` con `git branch -f conti main && git push -f origin conti`).
- Pubblicazione: **GitHub Pages** dal ramo `main` (https://cekku.github.io/CAMPO-E-STALLA/). Il sito ha `noindex` e `robots.txt`: non deve comparire sui motori di ricerca.
- Versione attuale: **1.53.0** (`js/version.js`) — a ogni rilascio aggiornare `js/version.js` e `VERSION` in `sw.js` (es. `ces-1.8.0`), e aggiungere i file nuovi alla lista `SHELL` del service worker.
- Lingua dell'interfaccia e dei testi: **italiano semplice**, rivolto a un agricoltore, niente gergo tecnico.

## Architettura

- `index.html` + `css/app.css` + `js/app.js` (router, menu per area, azioni globali con `data-act`, eventi `click/change/submit`).
- Stato: `js/state.js` (`S` = raccolte in memoria, `UI` = filtri e navigazione, `COLS` = elenco delle raccolte).
- Archivio: `js/store.js` — IndexedDB locale (un'unica tabella `records`), sincronizzazione facoltativa con **Supabase** (tabella `records` con RLS). Funzioni: `put`, `remove`, `bulkPut`, `cloudConfig`, `schemaVersion`.
- UI: `js/ui.js` (`openSheet`, `closeSheet`, `toast`, `arm` conferma in due tocchi, `tabs`, `empty`), `js/icons.js` (Lucide).
- **Guida** d'uso nell'app (dalla 1.43.0): `js/guida.js` (testi, una scheda per pagina: `cosa`, `passi`, `consigli`, `parole`, `vai`) e `js/views/guida.js` (ricerca senza accenti, scelta dell'area, `guVai` apre la pagina nella sua area); voce "Guida" in fondo a ogni area del menu. Pulsante ? nella barra in alto (`#helpBtn`, azione `guApri`): apre la scheda della pagina aperta, scelta da `schedaDi(tab, sub, area)` in base a `vai` (una pagina nuova senza scheda non ha il ?). Schede di Conti e Archivio solo per il titolare.
- Aree: **Campagna** (campi, mappa, attività, magazzino, mezzi, meteo, note), **Stalla** (capi, eventi, latte, razioni, box/silos), **Conti** e **Archivio** (documenti sul PC, dalla 1.27.0; tutte e due riservate al titolare).
- Mappa: `js/map.js` (Leaflet + Geoman, sfondi Ortofoto FVG / Stradale / Rilievo, catasto AdE WMS, NDVI Sentinel-2), `js/geo.js` (aree, centroidi, import KML/GeoJSON/shapefile).
- Blocco con codice: `js/lock.js` (PIN con PBKDF2 in localStorage `ces.lock`).
- Librerie in `vendor/`: leaflet, geoman, supabase-js 2.117.3 (build UMD da npm), **pdf.js 4.10.38 legacy** (`vendor/pdfjs`), **Tesseract.js 6** con lingua italiana (`vendor/tesseract`, lettura ottica in locale), **three.js r128** (`vendor/three`, con GLTFLoader, OrbitControls e RoomEnvironment: solo per il 3D del libretto dei trattori).

## Dove sono le note di ogni area

Le note lunghe di ogni area sono in `.claude/rules/`: ognuna si carica da sola quando si leggono i file di quell'area (`paths:` in testa al file). Se serve un'area senza aver ancora aperto i suoi file, leggi la nota direttamente.

| Area | Nota | Cosa c'è |
|---|---|---|
| Interfaccia | `interfaccia.md` | stile Quaderno, menu in alto (`TOP`/`MENU`), ritocchi di impaginazione, dashboard e agenda |
| Mappa e catasto | `mappa-catasto.md` | import dei confini, elenco campi, aspetto e selezione dei campi, catasto WFS/WMS, sfondi e ortofoto |
| Chiedi | `chiedi.md` | chat con Claude e IA sul PC, strumenti, funzione Supabase `chiedi` |
| Mezzi e 3D | `mezzi-3d.md` | libretto dei trattori, stalla del progetto in 3D |
| Stalla | `stalla.md` | stress da caldo (THI), Si@lleva / AIA |
| Azoto e nitrati | `nitrati.md` | bilancio dell'azoto per campo e della stalla, limiti ZVN, valori di riferimento (1.53.0) |
| Tracciabilità | `tracciabilita.md` | registri per il caseificio: approvvigionamenti dalle fatture e alimenti autoprodotti (1.42.0) |
| Conti | `conti.md` | struttura del modulo, file e raccolte riservate, regime IVA, valuta un terreno (1.49.0, 1.51.0, 1.52.0) |
| Conti: bilancio | `conti-bilancio.md` | RICA, registro dei beni e ammortamenti, grafici, salute, centri di costo |
| Conti: fatture | `conti-fatture.md` | regole e lettore delle fatture, preventivi, originali, fatture mancanti, in sospeso, sistemazione |
| Conti: controlli | `conti-controllo-rls.md` | elenco delle fatture e reddito lordo standard |
| Conti: personale e banca | `conti-banca-paghe.md` | cedolini, pagamenti e abbinamenti, estratti conto, documenti della banca dall'archivio |
| Conti: automatico | `conti-automatico.md` | documenti dell'archivio caricati da soli (1.41.0) |
| Supabase e dati | `supabase-dati.md` | progetto Supabase, azienda dopo l'accesso, archiviazione permanente, copia di sicurezza |
| Archivio sul PC | `archivio-pc.md` | catalogo Python, OCR, classificazione, nomi, IA sul PC (LM Studio), lavori fuori dall'app |
| Ponte archivio | `archivio-ponte.md` | contratto delle richieste alla porta 1236 |
| Archivio nell'app | `archivio-app.md` | pagine dell'Archivio e collegamenti dei documenti |
| Organizzazione | `organizzazione.md` | chi fa cosa fra i modelli (sempre caricata) |

Quando aggiungi una funzione nuova: le note vanno nel file della sua area (e i file nuovi nei suoi `paths:`); qui solo se cambia qualcosa che vale per tutto il progetto. **E aggiorna sempre la Guida** (`js/guida.js`, chiesto da Marco il 17/11/2026): una scheda nuova per una pagina nuova, i passi cambiati per una funzione nuova o cambiata, parole chiave per la ricerca. Un'area nuova = un file nuovo in `.claude/rules/` e una riga in questa tabella.

Supabase in breve: progetto `vamcoyvunyjqgzxujsal`, URL e chiave anon in `js/config.js`, i dati li proteggono le regole RLS (dettagli in `supabase-dati.md`).


## Sicurezza

- **Il repository è pubblico** (GitHub Pages gratuito): niente nomi di dipendenti, codici fiscali, IBAN, importi o dati veri in questi file, nei commenti o negli esempi. Il nome di un dipendente comparso in CLAUDE.md è stato tolto nella 1.11.3 (resta nella storia dei commit).
- Controllo del 26/10/2026: regole RLS corrette, nella storia git solo la chiave anon, librerie in `vendor/` senza problemi noti dopo l'aggiornamento di supabase-js (prima 2.45.4 con auth-js 2.65.0, avviso GHSA-8r88-6cj9-9fh5). La nuova build UMD è un solo file (`591.supabase.js` tolto) e crea lo stesso `window.supabase`.
- Le librerie in `vendor/` si aggiornano a mano: scegliere versioni uscite da almeno due settimane e confrontare il file con il pacchetto npm (integrità sha512).
- Controllo settimanale automatico delle vulnerabilità sul PC di Marco: `Desktop\CONTROLLO SICUREZZA\` (avviso su Telegram). Se aggiungi o aggiorni una libreria in `vendor/`, aggiorna anche l'elenco in `controllo_sicurezza.py`.
- Codice di invito dell'azienda: vale finché il titolare non lo rigenera; rigenerarlo quando un collaboratore lascia l'azienda.

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

## Lavori fuori dall'app

Timestral (previsioni), analisi del meteo di Povoletto, fotovoltaico Fronius e l'archivio dei documenti in Python: vedi `.claude/rules/archivio-pc.md`.


## Idee e punti aperti

- Visura catastale in PDF: leggerla (comune, foglio, particella, intestatari con quote, qualità, classe, superficie, redditi) e collegarla a particella e campo, così il proprietario compare al tocco della particella. Serve un PDF vero dell'Agenzia come esempio prima di scrivere il lettore.
- Estratti conto di altre banche e distinte con più bonifici: adattare i lettori su esempi reali.
- Integrazioni stalla (Alpro, MooMonitor, Si@lleva, SCR, carro miscelatore) per una dashboard unica.
- Fotovoltaico: lettura dalla Solar API dell'inverter Fronius e previsione della produzione con il meteo.