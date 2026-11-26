# Automazioni di Campo e Stalla

Elenco di **tutto quello che parte da solo**: dove gira, quando, cosa fa e come si ferma.
Chiesto da Marco il 26/11/2026: "voglio sapere quali sono le automazioni che abbiamo impostato".
**Regola: chi crea, cambia o toglie un'automazione aggiorna questo file nella stessa volta.**

Ultimo aggiornamento: 26/11/2026.

## 1. Attività di Claude sul PC (app Claude, sezione "Pianificate" / "Scheduled")

Partono solo se l'app Claude è aperta; se era chiusa, partono alla prima apertura. Ognuna scrive un resoconto e **non cambia niente da sola**: chiede prima a Marco. Le istruzioni sono in `%USERPROFILE%\.claude\scheduled-tasks\<nome>\SKILL.md`; si fermano, si cambiano o si avviano subito ("Esegui ora") dalla sezione Pianificate dell'app.

| Nome | Quando | Cosa fa | Resoconto |
|---|---|---|---|
| Controllo settimanale dell'app e delle pubblicazioni (`controllo-settimanale-app`, dal 26/11/2026) | lunedì alle 8:30 | Pubblicazioni dei 7 giorni (sito e APK riusciti o falliti e perché, sito alla versione giusta, sito nascosto ai motori di ricerca), `npm test` su una copia pulita di main, giro di tutte le pagine del sito pubblicato da computer e da telefono (`strumenti/prove/giro-pagine.mjs`), cause probabili e correzioni proposte | `%USERPROFILE%\ArchivioAzienda\controlli-settimanali\AAAA-MM-GG.md` |
| Ricerca settimanale modelli IA per il PC (`ricerca-modelli-ia-pc`, dal 24/11/2026) | lunedì alle 8:00 | Cerca su siti indipendenti modelli locali migliori per LM Studio; non scarica e non prova niente | `%USERPROFILE%\ArchivioAzienda\prove-ia\ricerca-modelli\AAAA-MM-GG.md` |

## 2. Attività di Windows sul PC (Utilità di pianificazione)

Dell'utente, senza privilegi. Si vedono e si fermano da "Utilità di pianificazione" di Windows.

| Nome | Quando | Cosa fa | Note |
|---|---|---|---|
| Archivio documenti - file nuovi | ogni 2 ore dalle 7 alle 21 | Cerca i documenti nuovi sul PC, li legge e li classifica (`archivio.py nuovi`) | non parte a batteria; registro `ArchivioAzienda\aggiorna-log.txt` (`.claude/rules/archivio-pc.md`) |
| Archivio documenti - scansioni vecchie | 10 minuti dopo l'accesso a Windows | Rilegge con la lettura ottica le scansioni vecchie, al massimo 2 ore | registro `ArchivioAzienda\ocr-avvio-log.txt` |
| Archivio documenti - ponte | all'accesso e poi ogni 15 minuti | Tiene acceso il ponte fra l'app e l'archivio (porta 1236); ogni 10 minuti chiude i programmi rimasti accesi per sbaglio (server delle prove da più di 6 ore, processi orfani) | registro `ArchivioAzienda\ponte-log.txt`; spegnere con `Archivio - ponte spegni.bat` |
| Campo e Stalla - sicurezza del PC | lunedì alle 7:00 | Controlla Python, pacchetti, porte aperte, Defender, firewall, aggiornamenti di Windows e dati a rischio nel repository; manda il risultato al controllo di Supabase | resoconto in app: Archivio → Sicurezza (`.claude/rules/sicurezza.md`) |

## 3. Supabase (nel cloud, anche a PC spento)

Programmate con `pg_cron`; per vederle: `select * from cron.job;` nell'editor SQL di Supabase.

| Nome | Quando | Cosa fa | Dove si vede |
|---|---|---|---|
| `rassegna-mattino` | ogni giorno alle 5:00 UTC (6:00 d'inverno, 7:00 d'estate) | Rassegna del giorno dai portali di settore e prezzi di latte, alimenti, concimi e gasolio (funzione `rassegna`) | app: Notizie e mercati (`supabase/aggiornamento-rassegna.sql`) |
| `sicurezza-lunedi` | lunedì alle 6:30 UTC | Controllo settimanale delle falle: librerie, notizie di sicurezza, consigli di Claude (funzione `sicurezza`) | app: Archivio → Sicurezza (`supabase/aggiornamento-sicurezza.sql`) |

## 4. GitHub (nel cloud)

| Nome | Quando | Cosa fa |
|---|---|---|
| Prove e pubblicazione (`.github/workflows/pubblica.yml`) | a ogni invio su `main` | Fa girare `npm test`; **il sito si pubblica solo se le prove passano**, altrimenti resta com'era e arriva una email |
| APK Android (`.github/workflows/apk.yml`) | a ogni invio che tocca `app-android/`, o a mano | Crea e firma l'app Android e la mette nella Release della versione |

## 5. Dentro l'app (sui dispositivi, mentre l'app è aperta)

| Nome | Quando | Cosa fa |
|---|---|---|
| Centro automatico (pagina Automatico) | all'apertura e ogni 30 minuti | Documenti dell'archivio nei Conti, magazzino dalle fatture, fitofarmaci, scarico delle razioni, controlli di paghe e fatture, report del mese; i dati non sicuri vanno in "Da controllare", ogni passo si può annullare dal diario (`.claude/rules/automazioni.md`) |
| Aggiornamento dell'app | ogni ora e al ritorno sull'app | Scarica la versione nuova e la mette alla prossima apertura (o con "Aggiorna ora") |
| Registro degli errori | sempre | Annota gli errori di ogni dispositivo, ripuliti dai dati; si vedono in Archivio → Errori dell'app |

## 6. Controlli prima di ogni salvataggio del codice (sul PC, per chi lavora al codice)

| Nome | Quando | Cosa fa |
|---|---|---|
| `.githooks/controlla-versione.py` | prima di ogni commit | Ferma il commit se manca il cambio di versione o se `sw.js` non è in ordine |
| `.githooks/prove.py` | prima di ogni commit che tocca il codice | Fa girare `npm test` |
| Promemoria della chat (`.claude/hooks/promemoria.py`) | all'inizio di ogni chat con Claude | Ricorda le regole di lavoro fra i modelli |
