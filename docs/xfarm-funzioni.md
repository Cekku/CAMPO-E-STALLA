# Funzioni di xFarm e confronto con Campo e Stalla

Giro fatto il 18/11/2026 sull'app web di xFarm (versione 10.18), in sola lettura, con l'account dell'azienda.
Qui sono descritte solo le **funzioni**: niente nomi di campi, persone, mezzi o quantità dell'azienda (il repository è pubblico).
Le voci segnate "a pagamento" su xFarm mostrano solo una presentazione e non sono state aperte.

Priorità pensata per un'azienda di vacche da latte con seminativi e foraggere:
**Alta** = serve tutti i giorni o è un obbligo di legge; **Media** = utile; **Bassa** = poco utile qui.

Legenda "In Campo e Stalla": **Sì** / **In parte** / **No**.

## Campi e colture

| Funzione su xFarm | Cosa fa | In Campo e Stalla | Dove | Priorità |
|---|---|---|---|---|
| Import dei campi | confini da file | Sì | `js/geo.js`, `js/pcg.js` | — |
| Colori delle colture sulla mappa | legenda per coltura | Sì | `js/map.js` | — |
| Gruppi di campi | es. proprietà / affitto, filtro per gruppo | Sì | `js/views/campi.js` | — |
| Clona colture | copia le colture di un anno sull'anno dopo, per più campi insieme | No | — | Media |
| Configurazione multipla | cambia coltura o dati a più campi insieme | In parte (selezione di più campi sulla mappa) | `js/map.js` | Media |
| Più colture nello stesso anno | coltura principale o di copertura, periodo di inizio (primavera/autunno), "sotto unità" su una parte del campo | No (una coltura per annata) | `js/views/campi.js` | Alta |
| Dati della coltura | varietà, resa prevista, destinazione d'uso, filiera, OGM, tipo di lotta (integrata/biologica) | In parte (varietà, resa) | `js/forms.js` | Media |
| Particelle catastali del campo | elenco particelle collegate | Sì | `js/catasto.js`, `js/catastomappa.js` | — |
| Analisi del suolo | analisi per campo (tessitura, sostanza organica, elementi) | No | — | Media |
| Impianto | sesto, portinnesto, piante/ha (per frutteti e vigneti) | No | — | Bassa |
| Uso del suolo negli ultimi 20 anni | dato per il calcolo della sostenibilità | No | — | Bassa |
| Indicazioni stradali al campo | apre la navigazione verso il campo | da verificare | — | Bassa |

## Attività (quaderno di campagna)

| Funzione su xFarm | Cosa fa | In Campo e Stalla | Dove | Priorità |
|---|---|---|---|---|
| Tipi di attività | primarie (difesa, semina, nutrizione, irrigazione, raccolta), combinate, lavorazioni, interventi colturali, allevamento, tipi personalizzati e sottotipi | Sì | `js/forms.js` | — |
| Attività su più campi e più giorni | blocco di attività, "Fino al" | Sì (1.48.0, 1.50.0) | `js/forms.js` | — |
| Tipo di raccolta e prodotto ottenuto | | Sì (1.50.0) | `js/forms.js` | — |
| "Questa attività chiude il ciclo colturale?" | dopo la raccolta il campo torna libero, oppure resta (medica, secondi tagli) | In parte (campo vuoto dopo la raccolta, 1.47.0, ma senza scelta) | `js/forms.js` | Alta |
| Scelta dei campi con la mappa accanto | il modulo dell'attività ha la mappa a fianco, filtri per coltura, varietà, gruppo | No | — | Media |
| Stato Fatto / Da fare | attività pianificate | Sì | `js/forms.js`, `js/agenda.js` | — |
| Ore e ettari lavorati in testa all'elenco | totali dell'elenco filtrato | In parte (solo ore) | `js/views/attivita.js` | Media |
| Filtri dell'elenco | tipo, operatore, coltura, campo, trattore, attrezzo, fase fenologica, periodo | In parte (campo e tipo) | `js/views/attivita.js` | Media |
| Esporta elenco attività | Excel | In parte | `js/registro.js` | Media |
| Verifica delle attività | il titolare approva le attività scritte dai collaboratori | No | — | Bassa |
| Trattamento: dati di legge | prodotto dal magazzino con n. di registrazione, dose, autorizzazione tecnica, fascia di rispetto, superamento soglia, livello di infestazione, modalità di applicazione, volume d'acqua, efficacia, motivo | In parte (dose, motivo, volume; n. registrazione e carenza sul prodotto) | `js/forms.js` | Alta |
| Meteo automatico nel trattamento | temperatura, vento, umidità, pioggia 24 h compilati da soli per data e luogo | In parte (vento a scelta, meteo a testo) | `js/forms.js` | Alta |
| Fase fenologica | elenco a scelta | Sì (BBCH) | `js/forms.js` | — |
| Allegati all'attività | foto, PDF | da verificare | — | Bassa |
| Attività automatiche (telemetria) | dai trattori collegati | No (a pagamento su xFarm) | — | Bassa |

## Magazzino, prodotti, carichi, silos

| Funzione su xFarm | Cosa fa | In Campo e Stalla | Dove | Priorità |
|---|---|---|---|---|
| Più magazzini | giacenze per magazzino (fitofarmaci, sementi, vasche insilato…) | In parte (giacenza per prodotto, un magazzino) | `js/views/magazzino.js` | Media |
| Movimenti carico/scarico | con data e documento | Sì | `js/views/magazzino.js` | — |
| Scarico automatico dalle attività | | Sì | `js/forms.js` | — |
| Banca dati dei fitofarmaci | elenco nazionale con n. registrazione, sostanze attive, tipo, stato autorizzato/revocato, filtro per coltura e avversità | In parte (CSV del Ministero caricato a mano) | `js/fitodb.js` | Media |
| Tipi di prodotto | difesa, sementi, nutrizione, medicinali, fecondazione, razione | Sì (in parte divisi fra Campagna e Stalla) | `js/forms.js` | — |
| Carichi del raccolto | quantità, coltura, campi di origine, magazzino di arrivo, persona, n. documento, trasportatore, targa, data, allegato; statistiche per coltura | No (DDT solo sui movimenti di magazzino) | — | Alta |
| Silos e trincee per area | capacità, saldo, quota acquistata e quota autoprodotta in % | In parte (autonomia in giorni, avviso) | `js/herd.js` | Alta |
| Costo medio delle scorte dalle fatture | | In parte (le fatture sono nei Conti) | `js/conti/` | Media |

## Nutrizione e irrigazione

| Funzione su xFarm | Cosa fa | In Campo e Stalla | Dove | Priorità |
|---|---|---|---|---|
| Bilancio dei nutrienti | per campo e coltura: fabbisogno e apporto di N, P₂O₅, K₂O, SO₃, MgO; mappa colorata per % del fabbisogno coperto | No | — | Alta |
| Limite azoto (N max) ed esportazione del piano di nutrizione | per la direttiva nitrati | No | — | Alta |
| Bilancio idrico e consigli irrigui | da satellite o sensori, calendario delle irrigazioni | No | — | Bassa |
| Irrigazione automatica | comando di centraline e valvole | No (a pagamento) | — | Bassa |

## Note, mappa, satellite, sensori

| Funzione su xFarm | Cosa fa | In Campo e Stalla | Dove | Priorità |
|---|---|---|---|---|
| Note per tipo | generica, danni da patogeni, danni da insetti, ristagno, infestanti, danno generico, campionamento, analisi colturale; vista elenco e vista mappa | In parte (note con allegati, senza tipo né punto) | `js/guida.js` (scheda Note) | Media |
| Punto della nota sulla mappa | la nota compare sulla mappa nel punto giusto | No | — | Media |
| Mezzi sulla mappa | posizione dei mezzi | No (serve telemetria) | — | Bassa |
| Satellite NDVI | indici per campo, confronto fra date, istogrammi | Sì | `js/ndvi.js` | — |
| Mappe di prescrizione | dosi variabili da NDVI, esportazione per i monitor dei trattori | No (a pagamento) | — | Bassa |
| Sensori e stazioni meteo | | No | — | Bassa |
| Meteo dell'azienda | condizioni e previsioni | Sì | pagina Meteo | — |

## Mezzi

| Funzione su xFarm | Cosa fa | In Campo e Stalla | Dove | Priorità |
|---|---|---|---|---|
| Scheda del mezzo | tipo (trattore, attrezzo, cisterna fissa o mobile), marca, modello, larghezza di lavoro, potenza, anno, targa, telaio, responsabile, in affitto | In parte (manca potenza, telaio, larghezza) | `js/forms.js` | Media |
| Date importanti | immatricolazione, acquisto, revisione, controllo tecnico | In parte (tagliando) | `js/forms.js` | Media |
| Manutenzioni | registro delle manutenzioni | Sì (libretto dei trattori) | `js/views/` mezzi | — |
| Documenti del mezzo | allegati | In parte | | Bassa |

## Altre voci

| Funzione su xFarm | Cosa fa | In Campo e Stalla | Dove | Priorità |
|---|---|---|---|---|
| Dashboard: produzione per coltura | per ogni coltura ettari, % seminata e % raccolta | In parte (barre senza %) | `js/views/oggi.js` | Media |
| Esportazioni | fascicolo aziendale, lista trattamenti, piano colturale, appezzamenti e particelle, attività, magazzino, biologico, GlobalGap, finanza, piano di nutrizione, limite N max | In parte (quaderno e tabelle) | `js/registro.js` | Media |
| Importazioni | piano colturale grafico, QDCA | In parte (piano colturale grafico) | `js/pcg.js` | Media |
| Import dello storico da xFarm | dall'esportazione "Lista delle attività" | No | — | Media |
| Lotti di produzione | dal campo al prodotto venduto | No (registri per il caseificio dalla 1.42.0) | — | Bassa |
| Sostenibilità | impronta di carbonio per coltura, agricoltura rigenerativa, Cool Farm Tool | No | — | Bassa |
| Pianificazione colturale | rotazioni pluriennali, confronto di costi | No (a pagamento) | — | Bassa |
| Allerte | avvisi personalizzati via SMS, email, notifica | In parte (avvisi fissi) | `js/app.js` | Bassa |
| Finanze | costi e ricavi per coltura e campo, costo orario di mezzi e manodopera | Sì (Conti, costi e margini dei campi) | `js/conti/`, `js/views/campi.js` | — |
| Piano di lavoro e gestione operativa | compiti per persona e mezzo, giorno/settimana | In parte (agenda) | `js/agenda.js` | Bassa |
| Controlli sui trattamenti | dosi consentite, sospensione, tempi di rientro, avvisi se non conforme | In parte (controlli in `js/checks.js`) | `js/checks.js` | Media |
| Insetti e trappole | catture e soglie | No (a pagamento) | — | Bassa |
| Difesa previsionale | rischio di malattie | No (a pagamento) | — | Bassa |
| Stalle | solo come punto sulla mappa | Sì (area Stalla molto più ampia) | `js/views/` stalla | — |

## Mancanti, in ordine di priorità

**Alta**
1. Bilancio dell'azoto e degli altri nutrienti per campo, con limite N max ed esportazione (nitrati), contando anche liquame e letame della stalla.
2. Trattamenti completi per il quaderno: meteo automatico (temperatura, vento, umidità, pioggia), autorizzazione tecnica, fascia di rispetto, superamento soglia, modalità di applicazione.
3. Carichi e pesate del raccolto: dai campi alla trincea o al silo, con documento, trasportatore e targa, totali per coltura e resa per ettaro.
4. Silos e trincee con la capacità, il saldo e la quota acquistata o prodotta in azienda.
5. Più colture nello stesso anno (secondo raccolto, coltura di copertura) e la domanda "questa raccolta chiude la coltura?".

**Media**
6. Copia delle colture all'anno dopo.
7. Note per tipo con il punto sulla mappa.
8. Mappa accanto al modulo dell'attività per scegliere i campi.
9. Filtri e totali dell'elenco attività (trattore, attrezzo, operatore, ettari).
10. Analisi del suolo per campo (serve anche al bilancio dei nutrienti).
11. Import dello storico delle attività dall'esportazione di xFarm.
12. Scheda dei mezzi più completa (potenza, telaio, revisione, controllo tecnico).
13. Più magazzini (contenitori) e % seminata/raccolta in dashboard.

**Bassa**: sostenibilità, lotti di produzione, allerte personalizzate, bilancio idrico, sensori, telemetria, mappe di prescrizione, verifica delle attività dei collaboratori, impianto dei frutteti.
