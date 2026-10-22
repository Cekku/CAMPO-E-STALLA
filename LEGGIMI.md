# Campo e Stalla

Gestionale per l'azienda agricola e zootecnica, installabile sul telefono e sul computer.

- **Mappa**: campi disegnati sul satellite, superficie calcolata dal confine, particelle e fogli del catasto dell'Agenzia delle Entrate, foglio e particella al tocco, importazione KML/GeoJSON, GPS.
- **Campi**: quaderno di campagna con scarico automatico dei prodotti, tempi di carenza, costi e margini per ettaro.
- **Stalla**: mandria, eventi (parti, fecondazioni, diagnosi, asciutte, trattamenti, controlli), calendario dei parti, latte giornaliero, razioni, registro trattamenti con sospensioni.
- **Magazzino e mezzi**: giacenze, scorte minime, scadenze, ore motore, tagliandi, revisioni.
- **Meteo** a 7 giorni sui campi, con i giorni adatti ai trattamenti.
- **Controlli automatici sui trattamenti**: coltura autorizzata in etichetta, dose massima, numero di interventi, intervallo, carenza rispetto alla raccolta, giacenza, patentino dell'operatore, controllo funzionale dell'irroratrice, vento e pioggia previsti.
- **Quaderno di campagna (QDCA)** stampabile o in PDF, CSV per Excel e registro dei trattamenti in formato dati (JSON).
- **Banca dati fitofarmaci** del Ministero della Salute: si carica il CSV open data e le schede prodotto si compilano da sole; i prodotti revocati vengono segnalati.
- **Piano Colturale Grafico**: importa lo shapefile (.zip) del CAA; gli appezzamenti si associano ai campi già disegnati, gli altri diventano campi nuovi. Vista **Piano colturale** su cinque annate con avviso dei ristoppi.
- **Registrazione a voce o con testo libero** dal pulsante Registra ("ieri diserbo su Pradone 1,5 l/ha"): interprete locale, oppure Claude con una chiave API Anthropic salvata sul dispositivo.
- **Stalle, box e silos**: capi assegnati ai box, occupazione, autonomia dei silos con le razioni; **indici della mandria** (DIM, giorni aperti, interparto, IOFC) e **allarmi di benessere** dai dati importati da Alpro, MooMonitor e altri sistemi (CSV).
- **NDVI Sentinel-2**: vigore vegetativo sulla mappa per data e andamento per ogni campo.
- **Conti** (area riservata al titolare): carica fatture elettroniche (XML, P7M, ZIP del cassetto fiscale, PDF dell'Agenzia, stampe TeamSystem, prospetti del latte del caseificio), dichiarazioni IVA (telematico o PDF), bilancini del commercialista in PDF (anche quelli "disegnati" senza testo) e il vecchio file Excel del conto economico. Registro delle fatture a blocchi con categorie modificabili e regole, fornitori, clienti, prodotti con storico dei prezzi, categorie, andamento mensile, latte venduto; conto economico, stato patrimoniale, cespiti, indici di bilancio, analisi della stalla da latte (costo di produzione per litro, IOFC, prezzo di pareggio) con i dati presi da stalla, campi e fatture, controlli di coerenza. Ogni tabella si scarica in Excel, CSV o PDF.
- **Personale** (nei Conti, riservato al titolare): legge ogni mese il PDF dei cedolini e il bilancino contabile delle paghe del consulente; calcola il netto da pagare a ogni dipendente, registra i pagamenti (a mano o dall'estratto conto della banca in Excel/CSV, con i bonifici riconosciuti dal nome) e tiene anticipi sullo stipendio e prestiti ai dipendenti con le restituzioni, permette di unire nomi diversi della stessa persona e segnala stipendi non pagati o pagati in parte, pagamenti in contanti, doppioni, cedolini mancanti, totali che non tornano con il bilancino, F24 e contributi agricoli non registrati, contratti a termine e permessi di soggiorno scaduti. Salari, oneri sociali e TFR vanno nel conto economico (B.9) finché non c'è il bilancino di fine anno.
- Funziona **senza rete**; le modifiche si sincronizzano al ritorno della connessione.

## Attivare la sincronizzazione (una volta sola, circa 5 minuti)

Senza questo passaggio l'app funziona lo stesso, ma i dati restano sul singolo dispositivo.

1. Vai su [supabase.com](https://supabase.com), crea un account gratuito e un nuovo progetto (regione: *Central EU (Frankfurt)*). Annota la password del database.
2. Nel progetto apri **SQL Editor → New query**, incolla tutto il contenuto di [`supabase/schema.sql`](supabase/schema.sql) e premi **Run**.
3. Apri **Authentication → URL Configuration** e in **Site URL** metti l'indirizzo dell'app (ad esempio `https://TUONOME.github.io/campo-e-stalla/`).
4. Apri **Project Settings → API** e copia **Project URL** e la chiave **anon public**.
5. Nell'app: **Impostazioni → Sincronizzazione**, incolla i due valori e premi **Collega**. In alternativa inseriscili in `js/config.js`, così nessun dispositivo li deve digitare.
6. Crea il tuo account, conferma la mail, poi **Crea la tua azienda**: i dati già inseriti vengono caricati online.
7. Per i collaboratori: installano l'app, creano l'account e inseriscono il **codice di invito** che trovi in Impostazioni.

La chiave *anon* è pensata per stare nelle app: i dati sono protetti dalle regole di accesso del database, per cui ogni utente vede solo le aziende di cui fa parte.

### Aggiornamento per i Conti (database creati prima della versione 1.5)

Fatture, bilancio, cedolini e pagamenti dei dipendenti devono essere visibili solo al titolare. Se il database esisteva già (anche se avevi eseguito l'aggiornamento della versione 1.4), apri **SQL Editor → New query**, incolla il contenuto di [`supabase/aggiornamento-conti.sql`](supabase/aggiornamento-conti.sql) e premi **Run** (una volta sola). Finché non lo fai, l'app mostra un avviso nell'area Conti.

## Riservatezza

- I dati **non stanno nel sito**: restano nel browser di ogni dispositivo e, se attivi la sincronizzazione, nel tuo database Supabase, leggibile solo dopo l'accesso. Chi apre l'indirizzo dell'app vede un'app vuota.
- **Blocco con codice** (La mia azienda → Blocco con codice): l'app chiede il codice all'apertura e dopo qualche minuto di inattività.
- Il sito non viene indicizzato dai motori di ricerca (`robots.txt` e meta `noindex`).

## Installare sul telefono

- **Android (Chrome)**: apri l'indirizzo, tocca *Installa l'app* nella schermata Oggi o dal menu ⋮ → *Installa app*.
- **iPhone (Safari)**: tocca Condividi → *Aggiungi alla schermata Home*.

## Dati da Alpro, MooMonitor e altri sistemi di stalla

Esporta dal programma della sala di mungitura o dei collari un file CSV con una riga per vacca e per giorno (numero o matricola, data, latte, ruminazione, attività). In **Stalla → Indici e benessere → Importa CSV** l'app riconosce le colonne e abbina gli animali per matricola, **numero aziendale** (da inserire nella scheda del capo) o nome.

## Fonti dei dati

Immagini satellitari Esri World Imagery · NDVI Sentinel-2 © Copernicus tramite il servizio Esri Sentinel-2 Views · Banca dati prodotti fitosanitari © Ministero della Salute · OpenStreetMap · OpenTopoMap · Cartografia catastale © Agenzia delle Entrate (CC BY 4.0, servizio WMS) · Meteo Open-Meteo.com · Ricerca luoghi Nominatim.
Librerie: Leaflet, Leaflet-Geoman, supabase-js, pdf.js (Mozilla, Apache 2.0), icone Lucide.

## Aggiornare l'app

Ogni modifica pubblicata sul repository arriva da sola sui dispositivi: alla riapertura compare "Nuova versione disponibile". Quando modifichi i file, aumenta `VERSION` in `sw.js` e in `js/version.js`.

## Immagini della mappa

- **Ortofoto FVG** (predefinita in Friuli Venezia Giulia): true ortofoto 2017-2020 della Regione, servizio WMS pubblico. Fuori regione sotto c'è il satellite Esri.
- **Google** (facoltativo): su [console.cloud.google.com](https://console.cloud.google.com) crea un progetto, attiva **Map Tiles API**, crea una **chiave API** e limitala ai siti `https://cekku.github.io/*`. Incollala in *La mia azienda → Mappe*. Google regala 100.000 riquadri al mese, poi addebita circa 0,60 $ ogni 1.000: serve un account di fatturazione, imposta un limite di spesa.
