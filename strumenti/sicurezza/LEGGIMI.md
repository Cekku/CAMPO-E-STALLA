# Controllo della sicurezza (1.74.0)

Ogni lunedì Campo e Stalla controlla da solo le falle di sicurezza di tutte le sue parti, legge le notizie
della settimana e scrive come sistemarle. Il resoconto si vede nell'app: **Archivio → Sicurezza** (solo il titolare).

Lavora in due posti:

- **Supabase** (anche a PC spento), funzione `sicurezza`: librerie di `vendor/`, app Android, GitHub Actions,
  regole del database, prove dall'esterno con la chiave pubblica, funzioni, sito, notizie (BleepingComputer,
  The Hacker News, SecurityWeek, Cybersecurity360, SecurityInfo, Chrome Releases, elenco CISA delle falle già
  sfruttate) e, con la chiave di Claude, i consigli in italiano semplice.
- **Questo PC**, `sicurezza-pc.py`: Python e i suoi pacchetti, porte dell'IA e del ponte, antivirus, firewall,
  aggiornamenti di Windows, chiavi e dati personali nel repository pubblico (file di adesso e storia dei commit).
  Manda la sua parte a Supabase prima del controllo del lunedì.

## Da fare una volta

1. **Segreto**: una parola lunga a caso (la stessa in tre posti). Sta in `%LOCALAPPDATA%\CampoEStalla\sicurezza.json`
   nella forma `{"segreto": "..."}`: fuori dal repository, non va mai scritta qui.
2. Supabase → Edge Functions → Secrets → aggiungere `SICUREZZA_SEGRETO` con quel valore e `SICUREZZA_FARM` con il
   codice dell'azienda (lo mostra la pagina Archivio → Sicurezza). Il controllo va solo a quell'azienda: chi si
   registra e crea un'azienda sua non lo vede e non può far partire Claude.
3. Supabase → SQL Editor → incollare `supabase/aggiornamento-sicurezza.sql`, scrivere il segreto al posto di
   `METTI-QUI-IL-SEGRETO` **solo lì** (non nel file del progetto: il repository è pubblico), Run.
4. Nell'app: Archivio → Sicurezza → **Attiva il controllo settimanale**.
5. Sul PC, attività di Windows: `powershell -ExecutionPolicy Bypass -File attivita.ps1 installa` in questa cartella
   (`stato` per vedere quando parte, `togli` per toglierla).

## A mano

- `py -I sicurezza-pc.py` controlla e manda; `--solo` non manda niente.
- Resoconto del PC: `%LOCALAPPDATA%\CampoEStalla\sicurezza-pc.json`, registro breve `sicurezza-log.txt`.
- Dei valori segreti trovati non si scrive mai il valore intero: solo il tipo, il file e le prime 4 lettere.
