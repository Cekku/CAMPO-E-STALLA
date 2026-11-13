# Campo e Stalla

Gestionale per l'azienda agricola e zootecnica, installabile sul telefono e sul computer.

- **Mappa**: campi disegnati sul satellite, superficie calcolata dal confine, particelle e fogli del catasto dell'Agenzia delle Entrate, foglio e particella al tocco, importazione KML/GeoJSON, GPS.
- **Più campi insieme sulla mappa**: tocca il pulsante con la spunta (o "Seleziona più campi" nella scheda di un campo, o Ctrl + clic sul computer), tocca i campi che ti servono oppure "Prendi tutti" una coltura, poi registra un'attività, metti la coltura dell'annata o cambia gruppo e conduzione a tutti in una volta.
- **Campi**: quaderno di campagna con scarico automatico dei prodotti, tempi di carenza, costi e margini per ettaro.
- **Stalla**: mandria, eventi (parti, fecondazioni, diagnosi, asciutte, trattamenti, controlli), calendario dei parti, latte giornaliero, razioni, registro trattamenti con sospensioni.
- **Magazzino e mezzi**: giacenze, scorte minime, scadenze, ore motore, tagliandi, revisioni.
- **Progetto della stalla in 3D** (Stalla → Progetto 3D): il render del progetto da girare con il dito o il mouse, con le viste Insieme, Dall'alto e Nuova stalla, i gruppi da accendere e spegnere (tetti, fotovoltaico, cuccette, cancelli…) e il nome del gruppo toccando un pezzo. Il modello si apre da solo; con "Carica un altro modello" puoi usarne uno nuovo, che resta privato come gli allegati.
- **Libretto dei trattori**: per ogni trattore lo stato di ogni pezzo in ore e mesi, gli interventi con le fatture allegate (lette anche da Claude), il catalogo ricambi con le tavole esplose e un modello 3D esploso.
- **Meteo** a 7 giorni sui campi, con i giorni adatti ai trattamenti e l'**avviso di stress da caldo** per le vacche (THI).
- **Controlli automatici sui trattamenti**: coltura autorizzata in etichetta, dose massima, numero di interventi, intervallo, carenza rispetto alla raccolta, giacenza, patentino dell'operatore, controllo funzionale dell'irroratrice, vento e pioggia previsti.
- **Quaderno di campagna (QDCA)** stampabile o in PDF, CSV per Excel e registro dei trattamenti in formato dati (JSON).
- **Banca dati fitofarmaci** del Ministero della Salute: si carica il CSV open data e le schede prodotto si compilano da sole; i prodotti revocati vengono segnalati.
- **Piano Colturale Grafico**: importa lo shapefile (.zip) del CAA; gli appezzamenti si associano ai campi già disegnati, gli altri diventano campi nuovi. Vista **Piano colturale** su cinque annate con avviso dei ristoppi.
- **Chiedi** (pulsante in alto, o Ctrl+K e scrivi la domanda): fai domande sui dati dell'azienda ("quali vacche partoriscono questo mese?", "quanto ho speso di mangimi nel 2025 rispetto al 2024?") e l'assistente risponde guardando i dati dell'app, con i pulsanti per aprire la pagina giusta. Non cambia niente nell'app. Scegli chi risponde: **Claude** (a pagamento, funziona anche dal telefono; riceve solo la domanda e i numeri che servono) oppure **Sul PC** (il modello di LM Studio: gratis, i dati non escono dal computer, ma è lento). Le domande su fatture, bilancio, personale e archivio le può fare solo il titolare. Sotto ogni risposta c'è il costo indicativo.
- **Registrazione a voce o con testo libero** dal pulsante Registra ("ieri diserbo su Pradone 1,5 l/ha"): interprete locale, oppure Claude con una chiave API Anthropic salvata sul dispositivo.
- **Stalle, box e silos**: capi assegnati ai box, occupazione, autonomia dei silos con le razioni; **indici della mandria** (DIM, giorni aperti, interparto, IOFC) e **allarmi di benessere** dai dati importati da Alpro, MooMonitor e altri sistemi (CSV).
- **NDVI Sentinel-2**: vigore vegetativo sulla mappa per data e andamento per ogni campo.
- **Conti** (area riservata al titolare): carica fatture elettroniche (XML, P7M, ZIP del cassetto fiscale, PDF dell'Agenzia, stampe TeamSystem, prospetti del latte del caseificio), dichiarazioni IVA (telematico o PDF), bilancini del commercialista in PDF (anche quelli "disegnati" senza testo) e il vecchio file Excel del conto economico. Registro delle fatture a blocchi con categorie modificabili e regole, fornitori, clienti, prodotti con storico dei prezzi, categorie, andamento mensile, latte venduto; conto economico, stato patrimoniale, cespiti, indici di bilancio, analisi della stalla da latte (costo di produzione per litro, IOFC, prezzo di pareggio, dall'IOFC al reddito netto per vacca munta) con i dati presi da stalla, campi e fatture e il confronto con le medie di altre aziende da latte, controlli di coerenza. Ogni tabella si scarica in Excel, CSV o PDF.
- **Personale** (nei Conti, riservato al titolare): legge ogni mese il PDF dei cedolini e il bilancino contabile delle paghe del consulente; calcola il netto da pagare a ogni dipendente, registra i pagamenti (a mano o dall'estratto conto della banca in Excel/CSV, con i bonifici riconosciuti dal nome) e tiene anticipi sullo stipendio e prestiti ai dipendenti con le restituzioni, permette di unire nomi diversi della stessa persona e segnala stipendi non pagati o pagati in parte, pagamenti in contanti, doppioni, cedolini mancanti, totali che non tornano con il bilancino, F24 e contributi agricoli non registrati, contratti a termine e permessi di soggiorno scaduti. Salari, oneri sociali e TFR vanno nel conto economico (B.9) finché non c'è il bilancino di fine anno.
- **Estratto conto della banca** (PDF con testo o scansionato/oscurato, Excel, CSV): legge i movimenti, riconosce stipendi, anticipi, F24 e contributi dei dipendenti (dal nome o dall'IBAN) e i pagamenti e gli incassi delle fatture (controparte, importo, numero nella causale, anche più fatture pagate insieme); le fatture mostrano la data del pagamento in banca. La lettura ottica usa Tesseract in locale (`vendor/tesseract`).
- **Ricerca catastale**: cerca una o più particelle per comune, foglio e mappale (anche sezione), mostra il confine sulla mappa e lo trasforma in un campo nuovo o lo aggiunge a un campo esistente (confine, superficie e dati catastali); toccando la mappa con il livello particelle acceso si ottiene la particella con il suo confine. I dati vengono dal WFS dell'Agenzia delle Entrate (CC BY 4.0) attraverso un piccolo collegamento dell'utente: vedi sotto.
- Funziona **senza rete**; le modifiche si sincronizzano al ritorno della connessione.

## Novità della versione 1.38: ammortamenti senza il bilancio di fine anno

Si trova in **Conti → Bilancio → Beni e ammortamenti**. Serve quando il commercialista non fa il bilancio di fine anno (società semplice agricola con il reddito catastale): senza ammortamenti utile, margini e prezzo di pareggio vengono migliori del vero.

1. In alto ci sono gli **investimenti trovati nelle fatture** (righe con il centro "Investimento": lavori edili, impianti, macchine, bestiame comprato), uno per fattura. Controlla nome, tipo di bene e anni di vita, spunta quelli giusti e premi **Aggiungi**. Quelli che non sono beni li togli con **Non sono beni**.
2. I beni comprati prima delle fatture caricate li aggiungi con **Nuovo bene**: nome, tipo, data, costo senza IVA e anni di vita (di solito stalle 33 anni, fotovoltaico 20, mungitura e trattori 10, vacche comprate 5).
3. L'app divide il costo per gli anni di vita, a partire dal mese dell'acquisto, e mette la quota di ogni anno nel conto economico, nei centri di costo, nei grafici e nella salute dell'azienda. Quando vendi o elimini un bene, scrivi la data in **Venduto o eliminato il**: da quel mese non conta più.
4. Se carichi un conto economico che ha già gli ammortamenti del commercialista, per quell'anno vale quello. Se il bilancino mette già un acquisto fra i costi dell'anno, non aggiungerlo al registro, altrimenti si conta due volte.

Sono numeri per capire i costi veri dell'azienda, non per le tasse.

## Novità della versione 1.36: preventivi e contratti di fornitura

Si trova in **Conti → Fatture → Preventivi** (anche nel menu "Acquisti e vendite"). Serve a confrontare le offerte di più ditte per mangimi, sementi e forniture varie.

1. **Nuovo confronto**: scrivi che cosa compri (per esempio "Mangime vacche 2027") e il tipo di fornitura.
2. **Prodotti**: aggiungili a mano oppure con **Prendi dalle fatture**, che mostra quello che hai comprato negli ultimi 12 mesi con quantità e prezzo medio. Per ogni prodotto scrivi la quantità che ti serve in un anno. Se le ditte danno il prezzo a sacco o a dose, scrivi quanto pesa un sacco.
3. **Offerte**: una per ditta, con validità, giorni di pagamento, trasporto e sconto. Se hai un contratto in corso, aggiungilo con **Contratto in corso** (data di fine e giorni di preavviso): diventa il termine di paragone e l'agenda ti ricorda l'ultimo giorno per la disdetta.
4. **Prezzi**: scrivili a mano, oppure carica il PDF del preventivo con **Carica PDF**. L'app cerca da sola i prezzi dei prodotti (anche nei PDF scansionati), la validità e i giorni di pagamento, e tu controlli prima di salvare. Per i preventivi scritti in modo disordinato puoi farli leggere al modello sul PC (il testo resta sul PC) oppure a Claude.
5. **Confronto**: tutti i prezzi vengono portati alla stessa unità (€/kg, €/q, €/t), con trasporto e sconto compresi. Vedi il costo dell'anno di ogni offerta, quanto costa il contratto e quanto avresti speso ai prezzi delle fatture. Il **costo riportato a oggi** mette alla pari chi ti fa pagare a 30 e chi a 90 giorni. Per i mangimi, se scrivi la proteina grezza, vedi anche il costo per kg di proteina. Se a una ditta manca un prezzo, il confronto si fa sui prodotti che hanno tutte. La tabella si scarica in Excel, CSV o PDF.

**Preventivi dal PC**: l'archivio del PC riconosce da solo i preventivi e i contratti. In fondo alla pagina, **Cerca nell'archivio** li elenca. Con un tocco diventano un'offerta e l'app ne legge il testo. Se i preventivi ti arrivano per email, salva gli allegati in una cartella che l'archivio controlla: dopo il controllo di ogni giorno (alle 12:30) li trovi qui. Funziona dal PC dell'azienda, con il ponte dell'archivio acceso.

## Novità della versione 1.25: la vacca si riconosce dal numero

- **Prima il numero**: in Stalla ogni vacca si chiama con il suo numero aziendale (lo stesso dei collari e della sala di mungitura), in elenco, nella scheda, nel modulo degli eventi e nei promemoria. La mandria è ordinata per numero e scrivendo solo il numero nella ricerca compare quella vacca.
- **Tabella della mandria**: in Mandria il pulsante **Tabella** mostra una riga per vacca con stato, lattazioni, giorni in latte, ultimo parto e ultima fecondazione, gravidanza, parto previsto, ruminazione, attività, alimentazione, riposo, ultimo calore e cose da fare. Si ordina toccando le colonne e si esporta in Excel, CSV o PDF.
- **MooMonitor nella scheda**: quando il programma ponte carica i dati dei collari, la scheda mostra ruminazione, attività, alimentazione, riposo e ultimo calore, e avvisa se MooMonitor non è d'accordo con l'app (per esempio una vacca gravida che MooMonitor non segna gravida).
- **Parto con i vitelli**: si indica se sono gemelli e, per ogni vitello, sesso, vivo o morto e matricola. Si crea la scheda di ogni vitello nato vivo.
- **Invia anche a MooMonitor e Si@lleva** (in prova): nel modulo di fecondazione, diagnosi, asciutta e parto si può spuntare dove mandare l'evento. Lo manda il programma ponte, acceso sul computer dell'ufficio; in **Stalla → Invii** si vede cosa è partito e cosa va controllato. Se un invio non va, si corregge l'evento e si salva di nuovo. Per ora il ponte lavora solo su servizi di prova.

## Novità della versione 1.16: fatture mancanti e reddito lordo standard

- **Conti → Fatture mancanti**: carichi il file Excel con l'elenco di tutte le fatture dell'anno (per esempio `passive_2025.xlsx` per quelle ricevute; va bene anche quello delle emesse) e l'app lo confronta con le fatture che hai caricato. Ti dice quali **mancano**, quali hanno un **totale o una data diversi** e quali hai caricato ma **non sono nell'elenco**. Le fatture si abbinano per partita IVA e numero: spazi, barre e trattini non contano ("1257 /FT-A" = "1257/FT-A"). Le fatture mancanti compaiono anche in Panoramica, tra le cose da sistemare. L'elenco serve solo al controllo: non aggiunge fatture all'archivio.
- **Conti → Bilancio → Centri di costo**: divide i costi e i ricavi dell'anno tra **Stalla**, **Campagna**, **Spese generali** e **Banca e finanza**, con il margine di ognuno, il costo della stalla per litro e per vacca e quello della campagna per ettaro. Ogni categoria di fattura ha un centro proposto (mangimi e farmaci → stalla, sementi e concimi → campagna, commercialista → generali…) che puoi cambiare. Gasolio, ricambi, riparazioni ed energia sono **spese comuni**: si dividono con una percentuale (vuota = come i costi diretti), ma le righe che parlano di carro miscelatore o mungitura vanno da sole alla stalla e quelle di seminatrice o aratro alla campagna; puoi anche scegliere il centro riga per riga. Trasporto e spese di incasso seguono il resto della fattura. Personale, ammortamenti, PAC, interessi e commissioni arrivano dal conto economico (o dalle paghe). **Banca e finanza**: carica l'estratto conto e le spese, il bollo, gli interessi e le rate sono già segnati come "Banca e finanza"; le rate dei mutui si vedono ma non contano come costo (il costo è solo l'interesse).
- **Conti → Bilancio → RLS e spese varie**: il calcolo del corso "Gestione economica dell'azienda agraria". **PLV** = vendite senza IVA e senza PAC (fatture emesse + corrispettivi); **reddito lordo standard** = PLV − spese varie − affitti dei terreni − salari pagati; **spese varie / PLV** con la media del 25% e l'allarme oltre il 40%; RLS con e senza PAC; ROI se scrivi il capitale investito. Per ogni categoria di fattura scegli se è spesa varia, investimento (escluso), affitto o se non conta.

## Novità della versione 1.15: app Android vera

Campo e Stalla esiste anche come **app Android** da installare (file APK), con l'icona nuova della Frisona.
Si scarica dalla pagina principale del progetto su GitHub (pulsante *Scarica l'app Android*): vedi **Installare sul telefono**.
Dentro l'app:
- i file esportati (Excel, CSV, copie di sicurezza, allegati) finiscono in **Documenti › Campo e Stalla** del telefono, con il pulsante *Condividi* per mandarli su WhatsApp, mail o Drive;
- *Stampa / PDF* apre la stampa di Android, dove si sceglie la stampante oppure **Salva come PDF**;
- il tasto **Indietro** chiude prima il foglio aperto o il menu, poi torna alla pagina precedente;
- quando esce una versione nuova dell'app compare l'avviso *C'è l'app nuova* con il pulsante *Scarica*.

## Novità della versione 1.12: libretto dei trattori

In **Macchinari → Trattori dell'azienda** scegli i tuoi trattori (John Deere 7530 Premium, 7810, 6420S, 5080M, 6800, 6900 e Fendt 724 Vario Profi Plus). Ogni scheda ha:

- **Libretto**: i pezzi da tenere d'occhio, dall'olio motore all'ingrassaggio, divisi per gruppo. Per ognuno vedi quando è stato fatto l'ultima volta e quando va rifatto, a ore o a mesi (vale quello che arriva prima). Toccando un pezzo puoi cambiarne l'intervallo, scrivere il codice del ricambio e vedere lo storico. Gli intervalli di partenza sono indicativi: controllali sul manuale d'uso.
- **Aggiorna ore**: scrivi le ore del contaore; da lì si aggiungono da sole le ore dei lavori registrati con quel trattore.
- **Interventi**: tagliandi e riparazioni, con i pezzi cambiati, le voci della fattura e la fattura stessa in foto o PDF.
- **Leggi fattura**: si apre la pagina di Claude su claude.ai. Fotografi la fattura, Claude legge data, ore, officina, pezzi, codici e totale, tu tocchi **Copia e torna all'app** e l'intervento si compila da solo. Controlli e salvi.
- **Scadenze**: revisione, assicurazione e altre scadenze tue, come il collaudo del caricatore o l'estintore.
- **Ricambi**: il catalogo ricambi ufficiale con le tavole esplose (John Deere gratuito; Fendt con le credenziali del concessionario) e i codici già usati sul trattore.
- **3D**: un trattore esploso. Tocca un gruppo per vedere i suoi pezzi e il loro stato; da un pezzo del libretto, "Vedi nel 3D" lo evidenzia.

**Archivio delle fatture online (una volta sola):** finché non lo attivi, le foto delle fatture restano sul dispositivo dove le hai caricate. Nella scheda Interventi tocca **Copia il codice**, poi in Supabase apri **SQL Editor → New query**, incolla e premi **Run**.

## Novità della versione 1.11: avviso di stress da caldo

L'app calcola ora per ora il **THI** (indice di temperatura e umidità) dei prossimi 7 giorni dalle previsioni meteo, nella posizione della sede o dei campi.

- **Dashboard della Stalla**: quando è previsto caldo compare il riquadro "Caldo per le vacche". Per ogni giorno mostra il THI più alto, la temperatura massima e le ore sopra 72. Per il giorno peggiore indica a che ora arriva il picco, se di notte ci sono abbastanza ore fresche e quanti giorni di fila dura il caldo. Sotto ci sono i consigli pratici: ventilatori, docce, acqua, razione nelle ore fresche, animali da non spostare.
- **Da fare in stalla**: se oggi, domani o dopodomani lo stress è almeno moderato (THI 72 o più), compare un avviso. Toccandolo si apre il meteo.
- **Meteo**: il riquadro c'è sempre. Nei giorni freschi dice solo "Nessuno stress". Si apre anche dal menu della Stalla, alla voce **Meteo e caldo**.
- **Livelli**: sotto 68 nessuno stress · 68-71 lieve · 72-78 moderato · 79-88 forte · da 89 grave. Nelle giornate più calde la stalla può essere 1-2 °C più calda della previsione.

## Novità della versione 1.10: dati da Si@lleva

In Si@lleva genera e salva in PDF il **Sintetico individuale ultimo controllo**, la **Scheda di riepilogo del controllo** e i **Parametri zootecnici aziendali**. In Campo e Stalla vai in Stalla → Indici e benessere → **Carica report Si@lleva (PDF)** e selezionali insieme. Vedi un riepilogo prima di salvare: l'app aggiunge i capi che mancano, parti, asciutte, controlli funzionali, stato riproduttivo e l'andamento mese per mese. Ricaricare gli stessi report non crea doppioni. Ripeti dopo ogni controllo funzionale.

## Novità della versione 1.9

- **Dashboard "cosa c'è da fare"**: saluto con la data, riquadri con superficie, attività e costi dell'annata, avvisi; sul telefono vengono prima agenda e avvisi, poi lo storico.
- **Prossimi 14 giorni**: un'agenda unica con attività pianificate (anche quelle in ritardo), parti e asciutte previste, fine delle sospensioni del latte e delle carenze, scadenze di revisioni, assicurazioni, controlli funzionali, patentini e prodotti.
- **Registro trattamenti digitale**: per ogni annata l'app controlla che ogni trattamento abbia prodotto, n. di registrazione, dose, coltura, superficie, fase, avversità e operatore, e mostra cosa manca. Il registro diventa interamente digitale dal 1° gennaio 2027.
- **Cerca e comandi**: dal pulsante Cerca, oppure con <kbd>Ctrl</kbd>+<kbd>K</kbd> o <kbd>/</kbd> sul computer, trovi dati, pagine e azioni ("latte", "nuovo capo"…). <kbd>N</kbd> apre Registra.
- Elenchi più leggibili sul telefono: le etichette vanno sotto il nome invece di schiacciarlo.

## Attivare la sincronizzazione (una volta sola, circa 5 minuti)

Senza questo passaggio l'app funziona lo stesso, ma i dati restano sul singolo dispositivo.

1. Vai su [supabase.com](https://supabase.com), crea un account gratuito e un nuovo progetto (regione: *Central EU (Frankfurt)*). Annota la password del database.
2. Nel progetto apri **SQL Editor → New query**, incolla tutto il contenuto di [`supabase/schema.sql`](supabase/schema.sql) e premi **Run**.
3. Apri **Authentication → URL Configuration** e in **Site URL** metti l'indirizzo dell'app (ad esempio `https://TUONOME.github.io/campo-e-stalla/`).
4. Apri **Project Settings → API** e copia **Project URL** e la chiave **anon public**.
5. Nell'app: **Impostazioni → Sincronizzazione**, incolla i due valori e premi **Collega**. In alternativa inseriscili in `js/config.js`, così nessun dispositivo li deve digitare. **Nell'app dell'azienda Cecutti sono già inseriti (dalla 1.11.2)**: si apre direttamente "Accedi per sincronizzare".
6. Crea il tuo account, conferma la mail, poi **Crea la tua azienda**: i dati già inseriti vengono caricati online. Fallo sul dispositivo dove hai i dati.
7. **Sugli altri tuoi dispositivi** (telefono, secondo computer) inserisci gli stessi due valori e accedi con lo **stesso account**: l'app trova da sola la tua azienda e la collega, senza codice (dalla 1.11.1). Se su quel dispositivo ci sono dati non ancora online, chiede se **unirli** all'azienda o **usare solo i dati dell'azienda**. I dati di esempio e le impostazioni del dispositivo non contano: vincono quelle dell'azienda. Se il tuo account fa parte di più aziende, scegli tu quale collegare.
8. Per i collaboratori: installano l'app, creano il **loro** account e inseriscono il **codice di invito** che trovi in Impostazioni.
9. **Permessi delle persone** (dalla 1.26.0): in **Impostazioni → Persone**, accanto a ogni persona scegli tu (solo il titolare) cosa può fare:
   - **Collaboratore**: registra campagna e stalla e vede fattura e foto degli interventi sui mezzi (come prima);
   - **Collaboratore senza allegati**: registra, ma non vede fattura e foto degli interventi;
   - **Solo lettura**: guarda campagna e stalla e non registra niente (per esempio un programma che legge i dati per te).
   I conti li vede sempre solo il titolare. Chi entra con il codice parte come Collaboratore. Il codice di invito lo vedi solo tu. Chi ha permessi ridotti non può togliersi da solo dall'azienda: lo togli tu, poi crea un **nuovo codice di invito**.

La chiave *anon* è pensata per stare nelle app: i dati sono protetti dalle regole di accesso del database, per cui ogni utente vede solo le aziende di cui fa parte.

### Aggiornamento per i permessi delle persone (database creati prima della versione 1.26)

Per poter scegliere i permessi (Collaboratore, senza allegati, Solo lettura) apri **SQL Editor → New query**, incolla il contenuto di [`supabase/aggiornamento-ruoli.sql`](supabase/aggiornamento-ruoli.sql) e premi **Run** (una volta sola), poi in Impostazioni crea un **nuovo codice di invito**. Finché non lo fai, cambiando un permesso l'app ti avvisa che il database va aggiornato. Prima aggiorna l'app su tutti i dispositivi (Ctrl+Shift+R sul computer, chiudi e riapri sul telefono): le versioni prima della 1.26.0 non funzionano più con il database aggiornato.

### Aggiornamento per i Conti (database creati prima della versione 1.5)

Fatture, bilancio, cedolini e pagamenti dei dipendenti devono essere visibili solo al titolare. Se il database esisteva già (anche se avevi eseguito l'aggiornamento della versione 1.4), apri **SQL Editor → New query**, incolla il contenuto di [`supabase/aggiornamento-conti.sql`](supabase/aggiornamento-conti.sql) e premi **Run** (una volta sola). Finché non lo fai, l'app mostra un avviso nell'area Conti.

### Collegamento al catasto (per la ricerca delle particelle)

I servizi dell'Agenzia delle Entrate non accettano richieste dirette dalle pagine web, quindi serve un piccolo inoltro gratuito, da installare una volta:

- **Supabase** (se usi la sincronizzazione): progetto → *Edge Functions* → *Deploy a new function* → *Via Editor*, nome `catasto`, incolla [`supabase/functions/catasto/index.ts`](supabase/functions/catasto/index.ts) → *Deploy*. Nell'app lascia vuoto l'indirizzo in *La mia azienda → Catasto* e premi *Prova*.
- **Cloudflare** (senza Supabase): *Workers & Pages → Create → Create Worker → Deploy → Edit code*, incolla [`supabase/functions/catasto/cloudflare-worker.js`](supabase/functions/catasto/cloudflare-worker.js) → *Deploy*; copia l'indirizzo `…workers.dev` in *La mia azienda → Catasto* e premi *Prova*.

Dal collegamento passano solo richieste di cartografia catastale pubblica. L'elenco dei comuni (`data/comuni.json`) viene da ISTAT tramite matteocontrini/comuni-json (MIT).

## Riservatezza

- I dati **non stanno nel sito**: restano nel browser di ogni dispositivo e, se attivi la sincronizzazione, nel tuo database Supabase, leggibile solo dopo l'accesso. Chi apre l'indirizzo dell'app vede un'app vuota.
- **Blocco con codice** (La mia azienda → Blocco con codice): l'app chiede il codice all'apertura e dopo qualche minuto di inattività.
- Il sito non viene indicizzato dai motori di ricerca (`robots.txt` e meta `noindex`).

## Installare sul telefono

- **Android, app vera (consigliata)**: dal telefono apri la pagina del progetto su GitHub e tocca *Scarica l'app Android*, poi apri il file `Campo-e-Stalla.apk`. La prima volta Android chiede di permettere l'installazione "da questa fonte" (Chrome o File): consentila e torna indietro. Per gli aggiornamenti si scarica e si apre il file nuovo nello stesso modo: i dati restano.
  - I dati dell'app non sono gli stessi della versione aperta da Chrome: accedi con il tuo account per scaricarli dalla sincronizzazione, oppure usa *La mia azienda → Scarica copia* in Chrome e *Carica copia* nell'app.
  - Sui telefoni vecchi (Android 8, per esempio il Mi 5) aggiorna prima **Android System WebView** dal Play Store: l'app la usa per mostrare le pagine.
- **Android (Chrome), senza installare file**: apri l'indirizzo, tocca *Installa l'app* nella schermata Oggi o dal menu ⋮ → *Installa app*.
- **iPhone (Safari)**: tocca Condividi → *Aggiungi alla schermata Home*.

## Dati da Alpro, MooMonitor e altri sistemi di stalla

Esporta dal programma della sala di mungitura o dei collari un file CSV con una riga per vacca e per giorno (numero o matricola, data, latte, ruminazione, attività). In **Stalla → Indici e benessere → Importa CSV** l'app riconosce le colonne e abbina gli animali per matricola, **numero aziendale** (da inserire nella scheda del capo) o nome.

## Fonti dei dati

Immagini satellitari Esri World Imagery · NDVI Sentinel-2 © Copernicus tramite il servizio Esri Sentinel-2 Views · Banca dati prodotti fitosanitari © Ministero della Salute · OpenStreetMap · OpenTopoMap · Cartografia catastale © Agenzia delle Entrate (CC BY 4.0, servizio WMS) · Meteo Open-Meteo.com · Ricerca luoghi Nominatim.
Librerie: Leaflet, Leaflet-Geoman, supabase-js, pdf.js (Mozilla, Apache 2.0), three.js (MIT), icone Lucide. Modello 3D del trattore: "John Deere 8360r" di Miamux02 su Sketchfab (CC BY 4.0), ricolorato e diviso in gruppi.

## Aggiornare l'app

Ogni modifica pubblicata sul repository arriva da sola sui dispositivi: alla riapertura compare "Nuova versione disponibile". Quando modifichi i file, aumenta `VERSION` in `sw.js` e in `js/version.js`.

## Immagini della mappa

- **Ortofoto FVG** (predefinita in Friuli Venezia Giulia): true ortofoto 2017-2020 della Regione, servizio WMS pubblico. Fuori regione sotto c'è il satellite Esri. Dalla 1.13 i colori sono ritoccati per somigliare a Google Maps: la foto della Regione era più chiara e più spenta. Dalla 1.11.4 usa la copia già pronta della Regione: la prima volta che guardi una zona ci mette qualche secondo, poi si apre in un attimo (circa 0,2 s), anche per i giorni dopo.
- **Stradale** (OpenStreetMap) e **Rilievo** (OpenTopoMap). Dalla 1.13 non ci sono più Satellite, Satellite 2, Google e la regolazione dei colori a mano.
- **Colori dei campi** (dalla 1.23): come su xFarm, il bordo è marcato e ha il colore della coltura, l'interno è velato, così si vede la foto. I campi senza coltura nell'annata sono grigio scuro. Dalla 1.24 l'importazione dei confini legge anche coltura, varietà e annata dal file: ai campi già presenti aggiunge solo la coltura che manca, senza cambiare quelle già scritte. In Livelli puoi cambiare l'intensità del riempimento. Dalla 1.23.1 i nomi non compaiono più sopra i campi: si vedono toccando il campo, e si possono riaccendere da Livelli con "Nomi dei campi".

## Chiedi: collegare Claude (una volta sola)

La chiave di Claude non sta nell'app (il codice è pubblico): sta nei segreti di Supabase, e la funzione "chiedi" la usa solo per chi ha fatto l'accesso all'azienda.

1. Su **console.anthropic.com** crea un account per le API (è a parte rispetto all'abbonamento di claude.ai), aggiungi un metodo di pagamento e, in **Limits**, metti un tetto di spesa mensile (per esempio 20 $).
2. In **API Keys** crea una chiave e copiala (si vede una volta sola).
3. In **Supabase** → il progetto → **Edge Functions** → **Secrets** → **Add new secret**: nome `ANTHROPIC_API_KEY`, valore la chiave. Salva.
4. La funzione `chiedi` si pubblica da sola con l'integrazione GitHub (file `supabase/functions/chiedi/index.ts`). Se non compare in Edge Functions: **Deploy a new function** → Via Editor → nome `chiedi` → incolla il file → Deploy.
5. Nell'app apri **Chiedi** e fai una domanda con Claude. Se dice "funzione non ancora pubblicata", manca il passo 4; se dice "manca la chiave", il passo 3.

In alternativa, su un solo dispositivo, si può salvare la chiave in La mia azienda → Registrazione a voce e con testo libero: la chat la usa al posto della funzione.

Per **Sul PC** basta quello che serve già per le fatture: LM Studio aperto con il server acceso, il ponte avviato (`strumenti/Avvia ponte LM Studio.bat`) e il modello collegato in La mia azienda → Modello sul PC. Funziona solo da quel computer.
