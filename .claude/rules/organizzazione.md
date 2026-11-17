# Organizzazione del lavoro (dal 17/11/2026, chiesta da Marco)

Vale in ogni chat di questo progetto. Scopo: spendere meno token e fare bene il lavoro, dando a ogni modello il compito per cui costa meno a parità di risultato.

## Chi fa cosa

| Ruolo | Modello | Compiti |
|---|---|---|
| **Chat principale** (capo cantiere) | Opus | Parla con Marco, capisce cosa vuole, decide il progetto, scrive le parti difficili (conti, abbinamenti, lettori dei PDF), unisce i risultati, aggiorna versione e CLAUDE.md, fa commit e push. |
| `esploratore` | Haiku | Trova nel codice dove sta qualcosa e risponde con `file:riga`. Solo lettura. |
| `esecutore` | Sonnet | Applica un piano già deciso: modifiche meccaniche, ripetitive, su più file, testi, stili. Niente commit. |
| `collaudatore` | Sonnet | Prova nel browser (server locale, telefono 375 px, tema scuro, console) con dati finti. Non corregge. |
| `revisore` | Opus | Rilegge il diff prima del commit: dati privati nel repository pubblico, errori di logica, versione e `sw.js`. |

Gli agenti sono in `.claude/agents/`. Si chiamano con lo strumento Agent e il loro nome (`subagent_type`).

## Quando usare un agente e quando no

Un agente parte da zero e rilegge quello che gli serve: costa. Conviene solo se il lavoro che toglie alla chat principale è più grande del messaggio per spiegarglielo.

- **Fai da solo** (chat principale): una o due ricerche, un file da leggere, una modifica piccola, ogni scelta che va chiesta a Marco.
- **esploratore**: quando servono più di 3 ricerche o bisogna girare molte cartelle per trovare un punto. Gli si dice cosa cercare, non perché.
- **esecutore**: quando il piano è chiaro e la modifica tocca molte righe o molti file (rinominare, aggiungere voci a `MENU`, testi, CSS, una vista nuova da uno schema già deciso). Il messaggio contiene file, funzioni e cosa cambiare: non deve decidere niente. Due esecutori insieme solo su file diversi.
- **collaudatore**: dopo ogni modifica che si vede nell'app, prima del commit. Gli si dice cosa provare, punto per punto.
- **revisore**: prima di ogni rilascio (cambio di versione) o di un commit che tocca i Conti, il Personale o file con dati. Non per ritocchi di testo o di stile.
- Lavori indipendenti fra loro (es. esploratore e collaudatore su cose diverse) partono nello stesso messaggio, in parallelo.

## Giro tipico di una richiesta

1. Chat principale: capisce la richiesta; se c'è una scelta vera la chiede a Marco (una domanda, con la proposta consigliata per prima).
2. `esploratore` se il punto del codice non è già noto da CLAUDE.md.
3. Chat principale: piano breve; scrive lei le parti difficili, passa all'`esecutore` quelle meccaniche.
4. `collaudatore` → se trova difetti, la chat principale li corregge (o li ripassa all'esecutore) e si riprova una volta.
5. `revisore` se è un rilascio.
6. Chat principale: versione (`js/version.js`, `VERSION` in `sw.js`, `SHELL`), CLAUDE.md, commit, push, controllo di GitHub Pages.

## Risparmio di token (regole per tutti)

- Leggere solo le righe che servono (Grep prima, poi Read con offset/limit); mai file grandi interi senza motivo.
- Non rileggere un file appena modificato per controllarlo.
- Risposte degli agenti corte (le loro istruzioni lo dicono): solo il risultato, niente copia del codice.
- Messaggi a Marco brevi e in italiano semplice; il dettaglio tecnico va in CLAUDE.md, non nella chat.
- CLAUDE.md: aggiungere solo quello che serve a chi riprende il lavoro (cosa, dove, perché, cosa è stato provato), in poche righe. Le parti lunghe di un'area vanno in un file di `.claude/rules/` con `paths:` nell'intestazione, così si caricano solo quando si lavora su quei file.
- Una chat per argomento: quando si cambia argomento, una chat nuova (il contesto vecchio si paga a ogni messaggio).
