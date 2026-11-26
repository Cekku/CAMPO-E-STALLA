# Sito di prova e uscite raggruppate (proposta del 26/11/2026, da attivare con Marco)

Scopo: le novità si provano prima su un secondo indirizzo; il sito vero (quello che usano tutti, anche l'APK)
cambia **una volta alla settimana**, e subito solo per le correzioni urgenti.

Niente di questa cartella è attivo: i file `.yml` sono bozze. Si attivano copiandoli in `.github/workflows/`
dopo i passi di Marco qui sotto.

## Perché non un secondo repository su GitHub Pages

Un secondo repository dello stesso account finirebbe su `https://cekku.github.io/CAMPO-E-STALLA-PROVA/`:
**stessa origine** del sito vero (`cekku.github.io`). Il browser darebbe ai due siti gli stessi dati locali:

- stesso IndexedDB e stesso `localStorage` (`ces.*`): la versione di prova lavorerebbe sui dati del telefono
  del sito vero, anche prima di sincronizzare;
- stesse cache: all'attivazione `sw.js` cancella le cache `ces-*` di un'altra versione, quindi il sito di prova
  cancellerebbe la copia del sito vero e viceversa (ognuno ricaricherebbe tutto a ogni apertura dell'altro).

Serve un'origine diversa. Proposta: **Cloudflare Pages** (gratis, `https://campo-e-stalla-prova.pages.dev`),
che è anche la strada già scelta per quando il repository diventerà privato (vedi "Repository privato" in
CLAUDE.md): il giorno che si sposta anche il sito vero, l'account c'è già.

## Come funziona dopo

| Cosa | Quando | Dove |
|---|---|---|
| Ogni push su `main` (dopo `npm test`) | subito | **sito di prova** (Cloudflare) |
| Uscita della settimana | lunedì alle 8:00 (ora italiana), prima del controllo settimanale delle 8:30 | **sito vero** (GitHub Pages) |
| Correzione urgente | subito | sito vero: messaggio del commit con `[urgente]`, oppure Actions → "Prove e pubblicazione" → Run workflow |

Il controllo settimanale del lunedì (`controllo-settimanale-app`) verifica così proprio la versione appena uscita.
Se `npm test` non passa, niente esce né sul sito di prova né su quello vero (come oggi).

Regole per chi lavora (da mettere in CLAUDE.md all'attivazione):

- `[urgente]` solo per errori che bloccano il lavoro o rovinano dati; tutto il resto aspetta il lunedì.
- Una novità grossa si prova sul sito di prova almeno un giorno prima del lunedì.
- L'APK non cambia: apre sempre il sito vero.

## Il sito di prova usa gli stessi dati?

Proposta consigliata: **sì, stesso progetto Supabase**, ma il sito di prova lo apre solo Marco (sul PC), e
mostra in alto una fascia "SITO DI PROVA" (`js/app.js`: se `location.hostname` finisce in `.pages.dev` o
contiene `prova`). Il sito di prova ha un'origine sua: si rifà l'accesso una volta e i dati si scaricano dal
cloud; quello che scrive arriva anche al sito vero (è il senso della prova: le novità sui dati veri).
Alternativa più sicura ma più lavoro: un secondo progetto Supabase gratuito con dati finti.

## Passi di Marco (una volta sola)

1. Creare l'account Cloudflare (gratis) e un progetto Pages chiamato `campo-e-stalla-prova` con
   "Direct Upload" (niente collegamento a GitHub).
2. Creare un token API Cloudflare con il permesso "Cloudflare Pages: Edit" e metterlo nei segreti del repository
   GitHub (Settings → Secrets and variables → Actions): `CLOUDFLARE_API_TOKEN` e `CLOUDFLARE_ACCOUNT_ID`.
3. In Supabase → Authentication → URL Configuration aggiungere `https://campo-e-stalla-prova.pages.dev/**`
   fra i Redirect URLs (per la conferma dell'email e il cambio della password).
4. Dire a Claude "attiva il sito di prova": lui fa il resto (sotto).

## Cosa fa Claude all'attivazione

1. Sostituisce `.github/workflows/pubblica.yml` con `pubblica.yml` di questa cartella.
2. Aggiunge `https://campo-e-stalla-prova.pages.dev` a `ORIGINI` di `strumenti/archivio/ponte-archivio.py` e
   `strumenti/ponte-lmstudio.py` (altrimenti dal sito di prova il ponte del PC non risponde: copia sul PC,
   archivio, IA del PC).
3. Fascia "SITO DI PROVA" in `js/app.js` e `css/app.css`, con cambio di versione e scheda nella Guida.
4. Aggiorna CLAUDE.md (righe "Pubblicazione" e "Come lavorare"), `AUTOMAZIONI.md` (uscita del lunedì) e
   `.claude/rules/prove.md`.
5. Primo giro: push di prova, controllo che il sito di prova si apra e che il sito vero **non** cambi;
   poi un `[urgente]` finto (solo un commento) per controllare la strada veloce.
