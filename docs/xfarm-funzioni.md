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
| Più colture nello stesso anno | coltura principale o di copertura, periodo di inizio (primavera/autunno), "sotto unità" su una parte del campo | Sì (1.58.0: seconda coltura dell'annata, secondo raccolto o copertura) | `js/domain.js`, `js/forms.js` | Alta |
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
| "Questa attività chiude il ciclo colturale?" | dopo la raccolta il campo torna libero, oppure resta (medica, secondi tagli) | Sì (1.58.0: domanda nella Raccolta, No per medica e prati) | `js/forms.js` | Alta |
| Scelta dei campi con la mappa accanto | il modulo dell'attività ha la mappa a fianco, filtri per coltura, varietà, gruppo | No | — | Media |
| Stato Fatto / Da fare | attività pianificate | Sì | `js/forms.js`, `js/agenda.js` | — |
| Ore e ettari lavorati in testa all'elenco | totali dell'elenco filtrato | In parte (solo ore) | `js/views/attivita.js` | Media |
| Filtri dell'elenco | tipo, operatore, coltura, campo, trattore, attrezzo, fase fenologica, periodo | In parte (campo e tipo) | `js/views/attivita.js` | Media |
| Esporta elenco attività | Excel | In parte | `js/registro.js` | Media |
| Verifica delle attività | il titolare approva le attività scritte dai collaboratori | No | — | Bassa |
| Trattamento: dati di legge | prodotto dal magazzino con n. di registrazione, dose, autorizzazione tecnica, fascia di rispetto, superamento soglia, livello di infestazione, modalità di applicazione, volume d'acqua, efficacia, motivo | Sì (1.54.0) | `js/forms.js`, `js/registro.js` | Alta |
| Meteo automatico nel trattamento | temperatura, vento, umidità, pioggia 24 h compilati da soli per data e luogo | Sì (1.54.0, da Open-Meteo) | `js/meteo.js`, `js/forms.js` | Alta |
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
| Carichi del raccolto | quantità, coltura, campi di origine, magazzino di arrivo, persona, n. documento, trasportatore, targa, data, allegato; statistiche per coltura | Sì (1.56.0: Pesate del raccolto) | `js/views/carichi.js` | Alta |
| Silos e trincee per area | capacità, saldo, quota acquistata e quota autoprodotta in % | Sì (1.57.0) | `js/herd.js`, `js/views/stalle.js` | Alta |
| Costo medio delle scorte dalle fatture | | In parte (le fatture sono nei Conti) | `js/conti/` | Media |

## Nutrizione e irrigazione

| Funzione su xFarm | Cosa fa | In Campo e Stalla | Dove | Priorità |
|---|---|---|---|---|
| Bilancio dei nutrienti | per campo e coltura: fabbisogno e apporto di N, P₂O₅, K₂O, SO₃, MgO; mappa colorata per % del fabbisogno coperto | Sì (1.53.0: Azoto e nitrati) | `js/nitrati.js` | Alta |
| Limite azoto (N max) ed esportazione del piano di nutrizione | per la direttiva nitrati | Sì (1.53.0) | `js/views/nitrati.js` | Alta |
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

Fatte il 18-19/11/2026, scelte da Marco: le 5 di priorità Alta (1.53.0 azoto e nitrati, 1.54.0 trattamenti con meteo, 1.56.0 pesate del raccolto, 1.57.0 silos comprato/prodotto, 1.58.0 due colture nello stesso anno). Restano le Medie e le Basse.

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

## Moduli di inserimento (secondo giro, 21/11/2026)

Aperti uno per uno senza salvare (controllato: nessuna scrittura partita verso xFarm). Cosa chiede ogni modulo e le voci degli elenchi, per rifarli in Campo e Stalla.

### Attività: passi e campi comuni
1. **Tipo** (vedi elenco sotto) → 2. **Colture** (finestra con filtri per campo, coltura, varietà, periodo, filiera, tipo di gestione, gruppo, lotto; griglia o elenco; "Seleziona tutto"; poi "Modifica quantità" per gli ettari lavorati di ogni campo) → 3. **Dettagli**.
- Informazioni principali: Fatto / Da fare, data di inizio* e di fine*, ora di inizio e di fine, ore lavorate per utente, titolo, note.
- Operazioni e risorse: **macchinari** (per ogni trattore: attrezzo collegato, % di utilizzo, tipo di energia; attrezzi e cisterne senza attrezzo collegato) e **utenti** (con il ruolo, es. collaboratore).
- Informazioni addizionali: "Questa attività chiude il ciclo colturale?", fase fenologica, allegati (png, jpg, dxf, zip, pdf).
- Dati meteo: compilazione automatica oppure a mano: stato del cielo (sereno, nuvoloso, variabile, molto nuvoloso, coperto, nebbia, coperto con pioggia, rovesci, temporale, neve, pioggia mista a neve), temperatura, vento medio, umidità, pioggia nelle 24 ore.

### Attività: campi specifici per tipo
- **Difesa**: prodotti (solo quelli autorizzati sulla coltura scelta; schede "Disponibile" = in magazzino, "Non disponibile" = dalla banca dati; "Crea un nuovo prodotto"). Per ogni prodotto: dose per ettaro* (kg/ha, l/ha, unità/ha), dose totale*, **avversità** (solo quelle in etichetta per quella coltura), tempo di carenza e data di fine carenza, intervallo di rientro, "Visualizza dati e dosaggi", "Aggiungi un altro prodotto". Poi: autorizzazione tecnica, fascia di rispetto, superamento soglia (sì/no), livello di infestazione (molto basso … molto alto), modalità di applicazione (atomizzatore, irrorazione, microgranulatore, polverizzatore, sistema per serre, tubo flessibile), volume d'acqua l/ha e consumo totale, efficacia (scarsa, regolare, buona), motivo (condizione predisponente, superamento della soglia).
  - Dati dell'etichetta per prodotto e coltura: per ogni avversità dose minima e massima con unità, numero massimo di trattamenti all'anno, fase della coltura e dell'avversità in cui si può usare.
- **Semina**: prodotti (semente) con dose, "si tratta di una trasemina?".
- **Nutrizione**: prodotti con dose, "concimazione di fondo?", metodo di distribuzione (a spaglio, al terreno, barra, fertirrigazione nelle sue forme, fogliare, iniezione profonda, localizzato, piatto deviatore, rasoterra in banda anche con deflettori, rotolone a bassa pressione, sotto-superficiale a dischi / assolcatore / ripper), volume d'acqua.
- **Irrigazione**: "irrigazione antibrina?", capacità (l/s, l/min, l/h, m³/h, mm), durata, volume calcolato, metodo (a goccia, a solchi, micro-sprinkler, scorrimento, pivot, rainger, rotolo, sprinkler, spruzzatori sottochioma, subirrigazione), motivo.
- **Raccolta**: colture raccolte (scelta multipla), destinazione dei residui (rimossi per uso, rimossi per vendita, lasciati sul campo, bruciati), magazzino di destinazione.

### Tipi di attività (circa 140)
- Primarie: Difesa, Irrigazione, Nutrizione, Raccolta, Semina, Trapianto (con "Aggiungi sottotipo").
- Combinate: Difesa+Nutrizione, Difesa+Nutrizione+Semina, Difesa+Nutrizione+Trapianto, Difesa+Semina, Difesa+Trapianto, Rincalzatura+Nutrizione, Sarchiatura+Nutrizione, Semina+Erpicatura, Semina+Nutrizione, Trapianto+Nutrizione.
- Lavorazioni del terreno: aratura, assolcatura, baulatura, discatura, erpicatura, falsa semina, fresatura, lavorazione a strisce, lavorazione del suolo, livellamento laser, livellatura, minima lavorazione, rincalzatura, ripuntatura, rullatura, sarchiatura, scalzatura, sovescio, tracciatura.
- Interventi colturali: 30 voci (cimatura, diradamenti, potature, legature, messa a dimora, sostituzione fallanze, spollonatura…; quasi tutte per frutteti e vigneti).
- Manutenzione terreni: diserbo elettrico, diserbo meccanico, falciatura, fienagione, formazione e mantenimento del prato, manutenzione stradelli, pirodiserbo, pulizia fossi, pulizia foglie, ranghinatura, rastrellatura, rimozione piante secche e residui di potatura, siepi, stralcio sarmenti, taglio erba interfilare, trinciatura, trinciatura sarmenti, vangatura, zappatura.
- Impianto: 24 voci (bonifica, decespugliamento, dissodamento, drenaggi, manichette, scasso, scavatura fossi, spietramento, teli…).
- Altro: accrescimento calibro, affinamento, altro, analisi residui, formazione, lavaggio, logistica personale, movimentazione e trasporto materiale, osservazione, perimetrazione, protezione non chimica, pulizia azienda.
- Allevamento: alimentazione bestiame, cura bestiame, movimentazione animali, movimentazione letame, preparazione lettiera, pulizia stalla.
- Personalizzato: tipi creati dall'utente.

### Coltura di un campo (Aggiungi coltura)
Anno colturale (2021-2028), coltura*, colture pluriennali, periodo di inizio (non specificato, primavera, inverno), OGM sì/no, nota colturale, superficie, tipologia di lotta (integrata volontaria, integrata obbligatoria, biologico), regione, lotto, resa prevista (kg/ha, q/ha, t/ha), **destinazione d'uso, qualità, uso** (voci del fascicolo/PAC: insilato, fieno, trinciato, pastone, da foraggio, granella…), filiera di destinazione, sotto unità.

### Particella catastale del campo
Identificativo, nazione, comune, foglio, particella, sotto particella, area catastale, **proprietario**, area utilizzata, **tipo di gestione** (proprietà, preso in affitto, comproprietà, concessioni, condivisione del profitto, preso da permuta, dato in affitto, dato in permuta, comodato d'uso), **qualità catastale** (31 voci: seminativo, seminativo irriguo, seminativo arborato, prato, prato irriguo, pascolo, bosco ceduo, vigneto, frutteto, incolto produttivo…), riportato in PAC sì/no.

### Magazzino e prodotti
- **Nuovo magazzino**: nome*, superficie m², foglio, particella, subalterno, indirizzo*.
- **Nuovo prodotto in magazzino**: magazzino, "abilita scarico dalle attività", prodotto (dalla banca dati o nuovo), unità (unità, kg, l), saldo iniziale, descrizione.
- **Nuovo movimento**: magazzino, prodotto, tipo (carico, utilizzo, inventario), categoria (acquisto, autoprodotto, vendita), data, quantità, codice di trasporto, fornitore (con "aggiungi fornitore"), descrizione, nota, bolla (pdf/jpg/png), "continua a creare movimenti dopo aver salvato".
- **Nuovo prodotto** (sette famiglie: difesa, nutrizione, semente e piantine, medicinali e disinfettanti, fecondazione, razione, altro). Comuni: nome*, tipologia*, biologico sì/no, numero di registro, produttore, colture, descrizione.
  - Difesa: indicazioni di pericolo, formulazione, principi attivi, contenuto in % o g/l; tipologie: bagnante, coadiuvante, repellente, adiuvante, nematocida, acaricida, antideriva, attrattivo, diserbante, molluschicida, mezzo biologico, sostanza di crescita, antiriscaldo, geodisinfestante, fungicida, aficida, antidoto, antigermogliante, diradante, feromone, fitoregolatore, sinergizzante, insetticida, biopesticida, altro.
  - Nutrizione: composizione N, P, K, Mg, S in %; categoria (minerali, organico palabile, organico non palabile, altro); tipologie: concime minerale, di fondo, annuale, fogliare, organico, organo-minerale, biostimolante, inibitore, fissatore di azoto, correttivo, reflui zootecnici, matrici e substrati, biochar, altri apporti organici, foraggi, altro.
  - Semente e piantine: tipologia (piante, sementi, altro), giorni del ciclo, classe FAO, coltura*.
  - Razione: tipologia (foraggi, concentrati, integratori), sottotipo (fieno, fasciato, insilato, residuo colturale, fresco, paglia, sottoprodotto, cereali, radici, fioccato, farina, granella, macinato, panello, seme, nucleo, mangime, mangime complementare, melasso, integratore, pastone, altro), nutrienti (fibre, proteine, energia e combinazioni, minerali), "senza deforestazione" sì/no.

### Altri moduli
- **Nota**: titolo, tipologia (nota generica, danni da patogeni, danni da insetti, ristagno idrico, presenza di erbe infestanti, danno generico, campionamento, analisi colturale), descrizione, data, fino a 10 allegati; il punto si mette sulla mappa.
- **Carico**: quantità e unità (t, kg, l), coltura, origine (campi e descrizione), destinazione (prodotto di magazzino e descrizione), persona, numero di documento, trasportatore, targa, data, nota, allegato.
- **Campo nuovo**: si disegna sulla mappa.
- **Modifica campo**: nome*, gruppo, affaccio su strada o area pubblica (sì/no), ecoschema PAC (1-5), tipo di copertura (nessuna, serra, serra stagionale, serra tunnel, tunnel, tettoia, rete antigrandine, agrotessile, campane/cappucci), metodo di irrigazione (pivot, rotolo, a goccia, subirrigazione, scorrimento, sprinkler, a solchi, micro-sprinkler, rainger, spruzzatori sottochioma, non irrigato), fonte (pozzo, invaso, corpo idrico superficiale, consorzio), energia (elettricità, diesel con biocarburante, diesel minerale, per gravità), capacità dell'impianto (l/s, m³/h, l/min, l/h, mm), area (m², ha), nota. La scheda Suolo è vuota per l'azienda.
- **Lavorazioni**: l'aratura chiede la profondità (meno di 20 cm, 20-40 cm, oltre 40 cm); erpicatura, sovescio, trinciatura, fienagione, movimentazione letame non hanno campi propri. Le combinate uniscono i campi dei tipi che le compongono. Trapianto: solo prodotti.
- **Nuovo macchinario**: tipo (91 voci: trattore, carro miscelatore anche semovente, carro botte, spandiletame, spandiliquame, interratore di liquami, falciacondizionatrice, rotopressa anche con fasciatore, ranghinatore/andanatore, voltafieno, trinciatrice, seminatrici di vari tipi, erpici, ripuntatore, aratro, polverizzatori, atomizzatori, rimorchio, robot di mungitura, silos, cisterne fissa e mobile, drone…), nome, descrizione, marca, modello, larghezza di lavoro (m), potenza (kW o CV), anno, targa, telaio, ID taratura, responsabile, in locazione, date di immatricolazione, acquisto, revisione e controllo tecnico, durata di vita (anni), allegati (libretto, assicurazione, manuale, generico, altri).
- **Attività del macchinario**: macchinario, tipo (manutenzione, rottura, usura, taratura, lavaggio botte, lavaggio macchinario, controllo funzionale, sanificazione), data, ore del trattore, descrizione, pezzi sostituiti, ore e minuti lavorati, costo totale, persone, fornitore.
- **Lotto di produzione**: nome e stato (aperto, chiuso).

### Cosa manca in Campo e Stalla per questi moduli (confronto del 21/11/2026)
- Attività: attrezzo collegato al trattore, % di utilizzo di più mezzi, ora di fine, ore per persona, titolo; tipi e sottotipi (oggi 9 tipi fissi), attività combinate e personalizzate.
- Difesa: avversità ammesse per prodotto e coltura con dose min/max e trattamenti massimi dall'etichetta, scelta solo fra i prodotti autorizzati sulla coltura; tempo di rientro; efficacia e volume d'acqua.
- Nutrizione, irrigazione, raccolta: metodo di distribuzione, concimazione di fondo, dati dell'irrigazione, destinazione dei residui.
- Coltura: tipologia di lotta, periodo di inizio, OGM, destinazione/qualità/uso del fascicolo, resa prevista con unità.
- Particelle: proprietario, tipo di gestione per particella, qualità catastale, area utilizzata, riportato in PAC.
- Magazzino: tipo "inventario", categoria acquisto/autoprodotto/vendita, fornitore, codice di trasporto, bolla allegata; più magazzini con dati catastali.
- Prodotti: tipologie e composizione N-P-K-Mg-S dei concimi fatti a mano, classe FAO e ciclo delle sementi, sottotipi degli alimenti della razione.
- Note: tipologia, punto sulla mappa, allegati.
