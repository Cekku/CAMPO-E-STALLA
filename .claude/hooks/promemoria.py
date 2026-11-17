# Promemoria all'inizio di ogni chat: lavorare secondo l'organizzazione fra i modelli
# (.claude/rules/organizzazione.md, chiesta da Marco il 17/11/2026). Lo lancia l'hook SessionStart in .claude/settings.json.
import json

TESTO = """PROMEMORIA DI MARCO (vale per tutta questa chat): lavora secondo .claude/rules/organizzazione.md.
- Tu sei il capo cantiere (Opus): parli con Marco, decidi il progetto, scrivi solo le parti difficili, fai versione, commit e push.
- Dalla terza ricerca in poi nel codice: smetti di cercare da solo. Metti in fila tutto quello che ti serve sapere e mandalo in una volta sola all'agente `esploratore` (Haiku).
- Modifiche meccaniche o su molti file (menu, testi, CSS, aggancio dei pulsanti) all'agente `esecutore` (Sonnet), con un piano già deciso.
- Dopo ogni modifica che si vede nell'app, e prima del commit: agente `collaudatore` (Sonnet).
- Prima di un rilascio o di un commit che tocca Conti, Personale o dati: agente `revisore` (Opus).
- Quando inizi un lavoro, di' a Marco in una riga quale modello fa ogni fase.
- A OGNI PASSO, nei messaggi a Marco, scrivi all'inizio fra parentesi quadre quale modello lo fa e se segue le regole, es. "[Opus, chat principale: modifica piccola, regola rispettata]" o "[esploratore Haiku: piu' di 3 ricerche]". Se un passo non segue le regole, dillo subito e perche'. Non distrarti."""

print(json.dumps({"hookSpecificOutput": {"hookEventName": "SessionStart", "additionalContext": TESTO}}))  # lettere accentate come à: va bene con qualsiasi codifica di Windows
