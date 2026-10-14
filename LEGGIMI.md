# Campo e Stalla

Gestionale per l'azienda agricola e zootecnica, installabile sul telefono e sul computer.

- **Mappa**: campi disegnati sul satellite, superficie calcolata dal confine, particelle e fogli del catasto dell'Agenzia delle Entrate, foglio e particella al tocco, importazione KML/GeoJSON, GPS.
- **Campi**: quaderno di campagna con scarico automatico dei prodotti, tempi di carenza, costi e margini per ettaro.
- **Stalla**: mandria, eventi (parti, fecondazioni, diagnosi, asciutte, trattamenti, controlli), calendario dei parti, latte giornaliero, razioni, registro trattamenti con sospensioni.
- **Magazzino e mezzi**: giacenze, scorte minime, scadenze, ore motore, tagliandi, revisioni.
- **Meteo** a 7 giorni sui campi, con i giorni adatti ai trattamenti.
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

## Installare sul telefono

- **Android (Chrome)**: apri l'indirizzo, tocca *Installa l'app* nella schermata Oggi o dal menu ⋮ → *Installa app*.
- **iPhone (Safari)**: tocca Condividi → *Aggiungi alla schermata Home*.

## Fonti dei dati

Immagini satellitari Esri World Imagery · OpenStreetMap · OpenTopoMap · Cartografia catastale © Agenzia delle Entrate (CC BY 4.0, servizio WMS) · Meteo Open-Meteo.com · Ricerca luoghi Nominatim.
Librerie: Leaflet, Leaflet-Geoman, supabase-js, icone Lucide.

## Aggiornare l'app

Ogni modifica pubblicata sul repository arriva da sola sui dispositivi: alla riapertura compare "Nuova versione disponibile". Quando modifichi i file, aumenta `VERSION` in `sw.js` e in `js/version.js`.
