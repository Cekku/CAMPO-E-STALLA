"""Prima di ogni commit (dopo controlla-versione.py): se il commit tocca il codice o le prove, fa girare `npm test`
(le prove in prove/ e in strumenti/prove*), e ferma il commit se una non passa.

Node: quello installato (node nel PATH) o, se manca, quello dentro LM Studio. Senza Node avvisa e lascia passare:
le prove girano comunque su GitHub prima della pubblicazione (.github/workflows/pubblica.yml).
Per saltarle una volta sola: CES_SENZA_PROVE=1 git commit ...
"""
import json
import os
import re
import shlex
import shutil
import subprocess
import sys

TOCCA = re.compile(r'^(js/|prove/|strumenti/prove|package\.json$|supabase/functions/_shared/)')


def trova_node():
    n = shutil.which('node')
    if n:
        return n
    for p in (os.path.expandvars(r'%ProgramFiles%\nodejs\node.exe'),
              os.path.expandvars(r'%LOCALAPPDATA%\Programs\LM Studio\resources\app\.webpack\bin\node.exe')):
        if os.path.isfile(p):
            return p
    return None


def main():
    try:
        sys.stdout.reconfigure(encoding='utf-8'); sys.stderr.reconfigure(encoding='utf-8')
    except Exception:
        pass
    if os.environ.get('CES_SENZA_PROVE') == '1':
        return 0
    r = subprocess.run(['git', 'diff', '--cached', '--name-only'], capture_output=True, text=True, encoding='utf-8')
    if not any(TOCCA.match(f) for f in r.stdout.splitlines()):
        return 0
    node = trova_node()
    if not node:
        print('Prove non fatte: Node non trovato sul PC (le farà GitHub prima di pubblicare).', file=sys.stderr)
        return 0
    radice = subprocess.run(['git', 'rev-parse', '--show-toplevel'], capture_output=True, text=True).stdout.strip()
    with open(os.path.join(radice, 'package.json'), encoding='utf-8') as f:
        cmd = shlex.split(json.load(f)['scripts']['test'])
    if cmd[0] == 'node':
        cmd[0] = node
    # le prove girano sui file come sono sul disco (non solo su quelli aggiunti al commit): GitHub le rifà sul commit vero
    try:
        p = subprocess.run(cmd, cwd=radice, capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=180)
    except subprocess.TimeoutExpired:
        print('Commit fermato: le prove non sono finite in 3 minuti (una prova bloccata, senza fine()?).', file=sys.stderr)
        return 1
    uscita = (p.stdout or '') + (p.stderr or '')
    if p.returncode == 0:
        m = re.search(r'pass (\d+)', uscita)
        print(f'Prove passate ({m.group(1) if m else "tutti i"} file).', file=sys.stderr)
        return 0
    print('Commit fermato: alcune prove non passano (npm test). Righe con NO o ✖:', file=sys.stderr)
    righe = [l for l in uscita.splitlines() if re.search(r'^\s*NO\s|✖|Error|non passate', l)]
    print('\n'.join(righe[:40]) or uscita[-3000:], file=sys.stderr)
    return 1


if __name__ == '__main__':
    sys.exit(main())
