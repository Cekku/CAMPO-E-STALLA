# Campo e Stalla — note di progetto per Claude Code

Gestionale dell'azienda agricola e zootecnica (vacche da latte) di Marco, Az. Agr. Cecutti Stefano e Silvano s.s., Povoletto (UD).
App web installabile (PWA), **local-first**, scritta in JavaScript puro (moduli ES, nessun build, nessun framework).
Questo file riassume tutto il lavoro fatto e come proseguire. La guida per l'utente è in `LEGGIMI.md`.

- Repository: `github.com/Cekku/CAMPO-E-STALLA` (ramo `main`; il ramo `conti` è tenuto allineato a `main` con `git branch -f conti main && git push -f origin conti`).
- Pubblicazione: **GitHub Pages** dal ramo `main` (https://cekku.github.io/CAMPO-E-STALLA/). Il sito ha `noindex` e `robots.txt`: non deve comparire sui motori di ricerca.
- Versione attuale: **1.11.0** (`js/version.js`) — a ogni rilascio aggiornare `js/version.js` e `VERSION` in `sw.js` (es. `ces-1.8.0`), e aggiungere i file nuovi alla lista `SHELL` del service worker.
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

## Dashboard e agenda (dalla 1.9.0)

- `js/agenda.js`: `agenda(giorni, area)` raccoglie le scadenze dei prossimi giorni (attività pianificate e in ritardo, parti, asciutte a −60 gg dal parto, fine sospensione latte, fine carenza, revisione/assicurazione/controllo funzionale, patentini, prodotti in scadenza); `agendaCard()` la mostra divisa per giorno. `statoRegistro(y)`/`registroCard(y)`: completezza del registro trattamenti (Reg. UE 2023/564, digitale obbligatorio dal 1/1/2027) sulle righe di `righeTrattamenti`.
- `views/oggi.js`: saluto, KPI di campagna (superficie, attività, costi €/ha, avvisi), avanzamento colture a barre. Sotto 1080 px `.grid-2.dash` diventa una colonna sola con ordine `o1…o7` (agenda, avvisi, registro, attività…).
- Ricerca = palette di comandi (`AZIONI` + voci di `MENU` in `app.js`): Ctrl/⌘+K o `/` aprono, `N` apre Registra, Invio apre il primo risultato.
- Righe con `.r-side.chips` sotto 560 px: le etichette vanno a capo sotto il testo.

## Stress da caldo (dalla 1.11.0)

- `js/caldo.js`: THI ora per ora (formula NRC 1971, `thi(t, ur)`) dalle previsioni orarie che `meteo.js` già scarica (`temperature_2m`, `relative_humidity_2m`, 7 giorni, nessuna richiesta in più). `giorniCaldo(data)`: per ogni giorno con almeno 20 ore THI massimo e ora del picco, ore ≥ 68 e ≥ 72, ore fresche (< 68), livello calcolato sul valore arrotondato, così il colore corrisponde al numero mostrato (78,6 → 79 = forte). Livelli: < 68 nessuno, 68-71 lieve, 72-78 moderato, 79-88 forte, ≥ 89 grave. Consigli per livello (`consigli(n)`), ondata = giorni di fila ≥ 72 prima e dopo il giorno, "poche ore fresche" se sono meno di 6.
- `caldoCard({ sempre })`: riquadro con 7 giorni, frase sul giorno peggiore e consigli. In dashboard Stalla (`views/oggi.js`) compare solo se c'è almeno stress lieve; in Meteo (`views/meteo.js`) sempre, con "Nessuno stress" nei giorni freschi. Avviso in `extraAlerts` (area `stalla`) per il giorno peggiore tra oggi e +2 se il livello è almeno moderato, con `go: { tab: 'meteo' }`: `case 'go'` in `app.js` accetta anche `tab`/`sub`. Voce "Meteo e caldo" nel menu Stalla.
- Provato nel browser con una previsione finta di ondata di caldo (cache `ces.meteo` sostituita): colori, ondata di 6 giorni, avviso che apre il Meteo, telefono (i riquadri scorrono di lato senza allargare la pagina) e tema scuro; con il meteo vero di fine ottobre THI 55-62 → nessun riquadro in dashboard.

## Si@lleva / AIA (dalla 1.10.0)

- `js/aia.js`: lettura dei PDF di Si@lleva (Microsoft Reporting Services, impaginazione fissa: colonne riconosciute dal bordo destro delle parole, `COL_SINT`, `COL_PRE`). `sintetico` (Sintetico individuale ultimo controllo: n. aziendale, razza 02=Frisona/00=Incrocio, n. lattazione, data parto, gg latte, ANA, EVM, latte/grasso/proteine/cellule(×1000)/LS/caseina/lattosio/urea, stato riproduttivo G/F/NI/MI/V, parcheggiata P, gg 1ª insem., gg concepimento, n. fecondazioni), `prestampato` (Scheda di riepilogo del controllo: nome sulla riga sotto la matricola, "ASCIUTTA gg/mm/aaaa", "ULT. CONTROLLO" = la vacca non è stata controllata all'ultimo controllo e il dato del sintetico è vecchio, prossima operazione P/A/F/D con data gg/mm → anno dedotto), `parametri` (Parametri zootecnici aziendali: una riga per controllo, 21 valori, solo la tabella dei bovini da latte). Collettivo, FE01 e Benessere sono riconosciuti ma non importati.
- `pianoImport(S, reports, uid)`: abbina per matricola; crea capi nuovi, aggiunge numero/razza/nome solo se mancano, crea eventi Parto, Messa in asciutta e Controllo funzionale (id `aia-…`, niente doppioni entro 7 giorni o stessa data), allinea `lattazioniPrecedenti` al n. lattazione AIA, salva `capo.aia` (stato, prossima operazione, EVM, ANA, LS…) e lo storico in `config/aia.storia`. Testato in Node con i PDF veri (332 vacche, controllo 29/09/2026) e reimportazione senza modifiche.
- `domain.capoInfo`: se non ci sono fecondazioni nell'app dopo l'ultimo parto usa `capo.aia` riferito a quel parto (G = gravida, parto previsto da prossima operazione P, o A + 60 gg; G/F/parcheggiata tolgono "Da fecondare"; V = vuota). `agenda` aggiunge le operazioni AIA F e D.
- UI: `views/aia-view.js` (scheda in Stalla → Indici e benessere con caricamento di più PDF, anteprima, andamento e tabella esportabile; riquadro "Controllo funzionale AIA" nella scheda del capo).

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
- Visura (1.10.2): pulsante "Visura" nel riquadro della particella (`catVisura` in `map.js`): apre l'area riservata dell'Agenzia (`portale.agenziaentrate.gov.it/PortaleWeb/home`, accesso SPID/CIE/CNS) e copia catasto, comune (sigla, codice), sezione, foglio e particella. Dal 1/1/2025 (D.Lgs. 139/2024) le visure per immobile online sono gratuite anche per immobili di altri; il servizio non ha un'interfaccia per programmi e non accetta i dati nell'indirizzo, quindi l'app non entra al posto dell'utente (non tenere credenziali o sessioni SPID). I proprietari non sono nel WFS.
- **Limiti del WFS vero** (misurati il 22/10/2026): con un riquadro troppo alto in latitudine risponde `numberReturned="0"` senza errore (fogli: ok fino a ~0,07°, zero da 0,075°; particelle: ok fino a 0,016°, zero da 0,018°); larghezza e numero di risultati non contano (1.891 particelle in una richiesta nel centro di Udine). Per questo `wfs()` divide il riquadro (`PASSO`: fogli 0,06° lat × 0,12° lon, particelle 0,015° × 0,02°), 3 richieste alla volta, senza doppioni. Ogni tanto risponde a caso `ServiceException InvalidFormat "Richiesta non valida"`: `wfsUno()` riprova fino a 3 volte con `&_=` per non riusare la risposta in cache. Il WFS non dà la superficie delle particelle (`areaCatasto` resta `null`). Provato dal vivo con la funzione Supabase: Povoletto → 2 richieste per i fogli, foglio 15 = 416 particelle, tocco in mappa → `G949_001500.125`.
- Collegamento: l'indirizzo Supabase salvato è ridotto all'origine (`baseSupabase` in `store.js`), perché "…/rest/v1/" copiato dalla pagina API rompeva catasto e sincronizzazione; `scarica()` mostra l'errore del collegamento, non quello della richiesta diretta (che senza CORS fallisce sempre).
- **Catasto disegnato dall'app** (`js/catastomappa.js`, dalla 1.8.0): con il collegamento la mappa catastale non usa il WMS ma i dati del WFS, scaricati a celle fisse (particelle 0,01° lon × 0,0075° lat da zoom 16, fogli 0,12° × 0,06° da zoom 13, 4 richieste alla volta, prima le ultime chieste, oltre 24 in attesa le più vecchie si scartano) e salvati 30 giorni nella cache `ces-catasto-1` (da tenere nell'elenco di `sw.js`). Una cella pesa 300-850 kB di GML e arriva in ~3 s; le tessere si creano solo a mappa ferma (`updateWhenIdle`, altrimenti lo slancio di uno spostamento metteva in coda centinaia di celle attraversate) e si ridisegnano a ogni cella che arriva. Il tempo massimo di `scarica()` (45 s per le celle) vale anche per la lettura dei dati. Disegno su tessere canvas (`L.GridLayer`): particelle in bianco, fogli in giallo, alone scuro sottile; numeri di particella da zoom 17 e "Fg."/"Foglio" solo se ci stanno nel poligono (punto a metà del tratto interno più lungo sulla riga a metà altezza). Provato su Povoletto: ~100 fotogrammi/s in zoom e spostamenti.
- Perché non il WMS: le particelle hanno un riempimento crema `#FDECBD` con linee nere, i numeri (`codice_plla`) compaiono solo da zoom ~19, la scritta rossa di copyright è stampata sempre, accetta solo immagini 256 px (512 → 400) e blocca per qualche minuto l'IP che fa troppe richieste (HTTP 500 `Rejected by SLM Monitor`; il WFS no). Senza collegamento resta il WMS, con la fusione `multiply` sul riquadro (`.leaflet-catasto-pane.wms`).
- Ordine dei riquadri in `map.js`: catasto 350, nomi 360, particella evidenziata `catSel` 390, campi 400 (sempre sopra). Fluidità: niente filtro `--fx` sugli sfondi quando i colori sono quelli di partenza, `updateWhenZooming: false` sugli sfondi, niente `backdrop-filter` sui riquadri sopra la mappa; campi con intensità predefinita 40 (`prefs.v3` porta il vecchio 70 a 40).
- Zoom senza nero (1.10.1): `SatLayer` disegna su canvas e `TileLayer._abortLoading` di Leaflet, a ogni cambio di livello, scarta le tessere senza `complete` (pensato per `<img>`): scartava anche quelle già disegnate e per 0,1-0,7 s la mappa restava scura. Ora `c.complete = true` quando la tessera è pronta. Sotto la foto c'è `sotto`, copia Esri a bassa risoluzione (tessere 2048 px, `zoomOffset: -3`, 1-4 immagini) per gli sfondi satellitari: allargando o spostando si vede un'immagine sfocata invece del nero. Rotella: `zoomSnap: 0.25`, `wheelPxPerZoomLevel: 90`. Misurato con una sonda a ogni fotogramma (35 punti dello schermo): da 260 fotogrammi con buchi (schermo intero) a 27 (solo bordi, ~0,25 s, allargando di due livelli in un colpo).

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

## Lavori fuori dall'app (sul PC di Marco, 24-25/10/2026)

Cartella `C:\Users\Marco\Desktop\PROGETTO CAMPO E STALLA`: contiene questo repository clonato in `CAMPO-E-STALLA\` (Git installato il 25/10/2026 con winget) e lavori che **non** stanno nel repository.

- **Timestral-209M** (Mistral, previsione di serie temporali, licenza MIT modificata: gratis sotto i 20 M$ di fatturato al mese) in `models\Timestral-209M` (837 MB), con `.venv` (Python 3.14, torch 2.14.1 CPU, libreria `timestral`). Prova: doppio clic su `Avvia prova Timestral.bat`. Non va nel repository: GitHub Pages non esegue Python e i file sopra 100 MB non entrano. Per usarlo nell'app restano tre strade: un server locale sul PC, il modello 5M/28M convertito in ONNX nel browser, oppure un server nel cloud (sconsigliato: i dati escono dall'azienda). Esito delle prove sul meteo: a 1 giorno sbaglia quanto "domani come oggi", e l'estate intera non la prevede. Per il meteo non serve; potrebbe servire per latte, consumi di mangime e silos, fotovoltaico.
- **`meteo-povoletto\`**: temperatura e umidità oraria di Povoletto dal 2016 (Open-Meteo/ERA5), analisi dell'estate 2026 e pagina web (`Apri analisi meteo.bat`, istruzioni in `LEGGIMI.md`). Estate 2026 contro la media 2021-2025: 25,0 °C contro 23,3 di media, 51 giorni sopra 30 °C contro 33, 12 sopra 35 contro 2, 35 notti tropicali contro 19, 1.203 ore con THI > 72 contro 906, picco di 38,2 °C il 6/8. È da qui che nasce l'avviso di stress da caldo della 1.11.
- **Fotovoltaico Fronius (Solar.web)**: non ancora fatto. La strada consigliata è la Solar API locale dell'inverter (gratis, senza password; va attivata nella pagina dell'inverter, Comunicazione → Solar API). L'esportazione da Solar.web è un servizio Premium a pagamento, la Query API è a pagamento. Niente script con la password del sito.

## Idee e punti aperti

- Visura catastale in PDF: leggerla (comune, foglio, particella, intestatari con quote, qualità, classe, superficie, redditi) e collegarla a particella e campo, così il proprietario compare al tocco della particella. Serve un PDF vero dell'Agenzia come esempio prima di scrivere il lettore.
- Estratti conto di altre banche e distinte con più bonifici: adattare i lettori su esempi reali.
- Integrazioni stalla (Alpro, MooMonitor, Si@lleva, SCR, carro miscelatore) per una dashboard unica.
- Sincronizzazione: un nuovo dispositivo dello stesso titolare, dopo l'accesso, vede "Crea la tua azienda" / "Entra con un codice" perché l'azienda collegata è salvata solo in locale. Se per sbaglio sceglie "Crea", nasce un'azienda doppia. Idea: dopo l'accesso cercare in `farm_members` le aziende dell'utente e collegarle da sole. Si potrebbero anche mettere URL e chiave anon in `js/config.js`.
- Fotovoltaico: lettura dalla Solar API dell'inverter Fronius e previsione della produzione con il meteo.
