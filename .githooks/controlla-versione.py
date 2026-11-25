"""Controllo prima di ogni commit (git pre-commit, attivo con: git config core.hooksPath .githooks).

Dalla 1.76.0 l'app si apre dalla copia della versione installata (sw.js): un file del sito cambiato senza
cambiare VERSION in sw.js non arriva a nessuno. Blocca il commit se:
- cambia un file del sito e VERSION in sw.js è quella di prima;
- js/version.js e sw.js non hanno la stessa versione;
- un file js/ non è nella lista SHELL di sw.js;
- cambia una libreria di vendor/ o un modello 3D fuori da SHELL e LIB_CACHE in sw.js ha il nome di prima.
Per un commit che non deve arrivare agli utenti (solo commenti): CES_SENZA_VERSIONE=1 git commit ...
"""
import os
import re
import subprocess
import sys

SITO = re.compile(r'^(index\.html|manifest\.webmanifest|sw\.js|css/|js/|fonts/|vendor/|icons/|modelli/'
                  r'|data/(?!fitosanitari\.json$)|supabase/functions/_shared/)')


def git(*a):
    r = subprocess.run(['git', *a], capture_output=True, text=True, encoding='utf-8', errors='replace')
    return r.stdout if r.returncode == 0 else ''


def valore(testo, nome):
    m = re.search(r"const\s+" + nome + r"\s*=\s*'([^']+)'", testo)
    return m.group(1) if m else None


def main():
    try:
        sys.stderr.reconfigure(encoding='utf-8')   # le lettere accentate nel terminale di git
    except Exception:
        pass
    if os.environ.get('CES_SENZA_VERSIONE') == '1':
        return 0
    cambiati = [f for f in git('diff', '--cached', '--name-only', '--diff-filter=ACMRD').splitlines() if f]
    sito = [f for f in cambiati if SITO.match(f)]
    if not sito:
        return 0
    sw_ora, sw_prima = git('show', ':sw.js'), git('show', 'HEAD:sw.js')
    errori = []
    v_ora, v_prima = valore(sw_ora, 'VERSION'), valore(sw_prima, 'VERSION')
    if v_ora == v_prima:
        errori.append(f"cambiano file del sito ({', '.join(sito[:5])}{'…' if len(sito) > 5 else ''}) ma VERSION in sw.js "
                      f"è ancora {v_ora}: nessuno riceverebbe la modifica. Cambia la versione in js/version.js e in sw.js.")
    v_js = valore(git('show', ':js/version.js'), 'VERSION')
    if v_ora and v_js and v_ora != 'ces-' + v_js:
        errori.append(f"js/version.js dice {v_js} e sw.js dice {v_ora}: devono essere uguali.")
    shell = set(re.findall(r"'\./([^']+)'", sw_ora.split('];')[0]))
    nel_commit = set(git('ls-files').splitlines())
    mancano = [f for f in nel_commit if f.startswith('js/') and f.endswith('.js') and f not in shell]
    if mancano:
        errori.append('file nuovi da aggiungere alla lista SHELL di sw.js: ' + ', '.join(sorted(mancano)))
    # un file della lista che non c'è fa fallire l'installazione del service worker nuovo: tutti resterebbero sulla versione vecchia
    spariti = sorted(f for f in shell if f not in nel_commit)
    if spariti:
        errori.append('nella lista SHELL di sw.js ci sono file che non esistono (o non sono aggiunti a git): ' + ', '.join(spariti))
    librerie = [f for f in sito if re.match(r'^(vendor|modelli)/', f) and f not in shell]
    if librerie and valore(sw_ora, 'LIB_CACHE') == valore(sw_prima, 'LIB_CACHE'):
        errori.append('cambiano librerie fuori da SHELL (' + ', '.join(librerie[:3]) + '): cambia il nome di LIB_CACHE '
                      'in sw.js, altrimenti chi le ha già in copia tiene quelle vecchie.')
    if not errori:
        return 0
    print('Commit fermato dal controllo della versione (.githooks/controlla-versione.py):', file=sys.stderr)
    for e in errori:
        print(' - ' + e, file=sys.stderr)
    return 1


if __name__ == '__main__':
    sys.exit(main())
