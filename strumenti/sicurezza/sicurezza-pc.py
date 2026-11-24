"""Campo e Stalla — controllo della sicurezza del PC (1.74.0).

Lo lancia ogni lunedì l'attività di Windows "Campo e Stalla - sicurezza del PC" (attivita.ps1), oppure a mano:
    py sicurezza-pc.py            controlla, salva il resoconto e lo manda a Supabase
    py sicurezza-pc.py --solo     controlla e salva, senza mandare niente

Controlla:
  - Python: versione ancora seguita e pacchetti installati con falle note (OSV.dev);
  - porte dell'IA (1234 LM Studio, 1235 ponte IA), del ponte dell'archivio (1236) e del server delle prove (8765):
    devono ascoltare solo su questo PC (127.0.0.1), non su tutta la rete;
  - Windows: antivirus (Microsoft Defender) acceso e aggiornato, firewall acceso, ultimi aggiornamenti;
  - il repository del progetto (è PUBBLICO): chiavi segrete, IBAN, codici fiscali e file da non pubblicare,
    nei file di adesso e in tutta la storia dei commit.
Dei valori trovati non scrive mai il valore intero: solo il tipo, il file e le prime lettere (per IBAN e codici fiscali nemmeno quelle).

Resoconto in %LOCALAPPDATA%\\CampoEStalla\\sicurezza-pc.json. Per mandarlo a Supabase serve il file
%LOCALAPPDATA%\\CampoEStalla\\sicurezza.json con {"segreto": "..."} (lo stesso SICUREZZA_SEGRETO della funzione):
sta fuori dal repository apposta. Vedi LEGGIMI.md.
"""
import base64
import datetime as dt
import json
import os
import re
import socket
import subprocess
import sys
import urllib.request

VERSIONE = '1.74.0'
FUNZIONE = 'https://vamcoyvunyjqgzxujsal.supabase.co/functions/v1/sicurezza'
CARTELLA = os.path.join(os.environ.get('LOCALAPPDATA') or os.path.expanduser('~'), 'CampoEStalla')
REPO = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
UA = 'CampoEStalla-Sicurezza/1.0'
NASCOSTO = 0x08000000 if os.name == 'nt' else 0   # CREATE_NO_WINDOW: niente finestre nere con pythonw

problemi, ok = [], []


def P(chiave, gravita, titolo, dettaglio='', rimedio='', fonte=None, chi='Marco'):
    problemi.append({'chiave': chiave, 'gravita': gravita, 'titolo': titolo, 'dettaglio': dettaglio, 'rimedio': rimedio, 'fonte': fonte, 'chi': chi})


def OK(titolo):
    ok.append({'titolo': titolo})


def comando(args, timeout=120):
    r = subprocess.run(args, capture_output=True, timeout=timeout, creationflags=NASCOSTO)
    return r.stdout.decode('utf-8', 'replace')


def powershell(script, timeout=120):
    return comando(['powershell', '-NoProfile', '-NonInteractive', '-Command',
                    '[Console]::OutputEncoding=[Text.Encoding]::UTF8; ' + script], timeout)


def scarica(url, dati=None, intestazioni=None, timeout=30):
    req = urllib.request.Request(url, data=dati, headers={'User-Agent': UA, **(intestazioni or {})})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode('utf-8'))


def prova(nome, fn):
    try:
        fn()
    except Exception as e:   # un controllo che non riesce non ferma gli altri
        P(f'errore:{nome}', 'bassa', f'Controllo "{nome}" non riuscito', f'{type(e).__name__}: {e}', 'Riprovare; se resta, chiedere a Claude Code di guardare sicurezza-pc.py.', chi='Claude Code')


def confronta(a, b):
    pa = [int(x) if x.isdigit() else 0 for x in re.split(r'[.+-]', a)]
    pb = [int(x) if x.isdigit() else 0 for x in re.split(r'[.+-]', b)]
    return (pa > pb) - (pa < pb)


# ---------- Python ----------
def python():
    v = '.'.join(map(str, sys.version_info[:3]))
    ciclo = '.'.join(map(str, sys.version_info[:2]))
    d = scarica(f'https://endoflife.date/api/python/{ciclo}.json')
    fine = d.get('eol')
    ultima = d.get('latest')
    if isinstance(fine, str) and fine <= dt.date.today().isoformat():
        P('python:eol', 'alta', f'Python {ciclo} non riceve più correzioni di sicurezza (dal {fine})',
          'Le falle trovate da adesso in poi non verranno più riparate.',
          'Installare la versione nuova da python.org e poi chiedere a Claude Code di controllare che l\'archivio funzioni.',
          'https://endoflife.date/python')
    elif ultima and confronta(ultima, v) > 0:
        P('python:agg', 'media', f'Python {v}: c\'è la {ultima} con correzioni',
          'Le versioni intermedie riparano anche falle di sicurezza.',
          f'Scaricare Python {ultima} da python.org (installatore Windows) e installarlo sopra: i pacchetti restano.',
          'https://www.python.org/downloads/windows/')
    else:
        OK(f'Python {v} aggiornato (seguito fino al {fine})')


def pacchetti():
    elenco = json.loads(comando([sys.executable, '-m', 'pip', 'list', '--format=json', '--disable-pip-version-check']) or '[]')
    # anche le librerie della lettura ottica, installate a parte (pip --target) in ArchivioAzienda\librerie
    extra = os.path.join(os.path.expanduser('~'), 'ArchivioAzienda', 'librerie')
    if os.path.isdir(extra):
        visti = {p['name'].lower() for p in elenco}
        elenco += [p for p in json.loads(comando([sys.executable, '-m', 'pip', 'list', '--format=json', '--disable-pip-version-check', '--path', extra]) or '[]')
                   if p['name'].lower() not in visti]
    if not elenco:
        return
    q = {'queries': [{'package': {'name': p['name'], 'ecosystem': 'PyPI'}, 'version': p['version']} for p in elenco]}
    ris = scarica('https://api.osv.dev/v1/querybatch', json.dumps(q).encode(), {'Content-Type': 'application/json'}, 60)['results']
    trovati = 0
    ordine = {'alta': 0, 'media': 1, 'bassa': 2}
    for p, r in zip(elenco, ris):
        visti, falle, fix = set(), [], []
        for v in (r.get('vulns') or [])[:12]:
            d = scarica(f'https://api.osv.dev/v1/vulns/{v["id"]}')
            ids = {d['id'], *d.get('aliases', [])}
            if d.get('withdrawn') or ids & visti:   # la stessa falla con più nomi (GHSA, PYSEC, CVE)
                continue
            visti |= ids
            dopo = [e['fixed'] for a in d.get('affected', []) if a.get('package', {}).get('name', '').lower() == p['name'].lower()
                    for rg in a.get('ranges', []) for e in rg.get('events', []) if 'fixed' in e and confronta(e['fixed'], p['version']) > 0]
            if dopo:
                fix.append(min(dopo, key=lambda x: [int(y) if y.isdigit() else 0 for y in re.split(r'[.+-]', x)]))
            sev = str((d.get('database_specific') or {}).get('severity', '')).upper()
            grav = 'alta' if sev in ('CRITICAL', 'HIGH') else 'bassa' if sev == 'LOW' else 'media'
            cve = next((a for a in [d['id']] + d.get('aliases', []) if a.startswith('CVE-')), d['id'])
            falle.append((grav, cve, (d.get('summary') or '')[:110], d['id']))
        if not falle:
            continue
        falle.sort(key=lambda f: ordine[f[0]])
        # una voce per pacchetto: la versione che le ripara tutte è la più alta fra le prime riparate
        serve = max(fix, key=lambda x: [int(y) if y.isdigit() else 0 for y in re.split(r'[.+-]', x)]) if fix else None
        P(f'pip:{p["name"]}', falle[0][0], f'Pacchetto Python {p["name"]} {p["version"]}: {len(falle)} {"falla nota" if len(falle) == 1 else "falle note"} ({", ".join(f[1] for f in falle[:4])}{"…" if len(falle) > 4 else ""})',
          ' · '.join(f'{f[1]}: {f[2]}' for f in falle[:6]),
          f'Nel Prompt dei comandi: py -m pip install -U "{p["name"]}>={serve}"' if serve else "Non c'è una versione riparata: chiedere a Claude Code se il pacchetto si può togliere o sostituire.",
          f'https://osv.dev/vulnerability/{falle[0][3]}')
        trovati += 1
    if not trovati:
        OK(f'{len(elenco)} pacchetti Python senza falle note')


# ---------- porte ----------
# i server delle prove delle chat di Claude Code usano le porte dalla 8765 alla 8799 (alcuni restano accesi per giorni)
PORTE = {1234: 'IA sul PC (LM Studio)', 1235: 'ponte dell\'IA', 1236: 'ponte dell\'archivio', **{p: 'server delle prove' for p in range(8765, 8800)}}


def porte():
    righe = comando(['netstat', '-ano', '-p', 'TCP']).splitlines() + comando(['netstat', '-ano', '-p', 'TCPv6']).splitlines()
    viste = {}
    for r in righe:
        c = r.split()
        if len(c) >= 4 and c[0].upper().startswith('TCP') and 'LISTEN' in c[3].upper():
            ind, _, porta = c[1].rpartition(':')
            if porta.isdigit() and int(porta) in PORTE:
                viste.setdefault(int(porta), set()).add(ind)
    for porta, nome in PORTE.items():
        ind = viste.get(porta)
        if not ind:
            continue
        aperti = [i for i in ind if i not in ('127.0.0.1', '[::1]')]
        if aperti:
            prove = porta >= 8765
            rim = ('In LM Studio: scheda Developer (Sviluppatore) → Settings → togliere "Serve on Local Network".' if porta == 1234
                   else 'Chiudere il server delle prove quando non serve e avviarlo con: py -m http.server %d --bind 127.0.0.1 (così fa già .claude/launch.json).' % porta if prove
                   else 'Chiedere a Claude Code: "il programma sulla porta %d deve ascoltare solo su 127.0.0.1".' % porta)
            P(f'porta:{porta}', 'media' if prove else 'alta', f'Il {nome} (porta {porta}) si raggiunge da tutta la rete',
              ('Chiunque sia collegato alla stessa rete (anche il Wi-Fi) può leggere i file della cartella del progetto, anche quelli non pubblicati.' if prove
               else 'Chiunque sia collegato alla stessa rete (anche il Wi-Fi) potrebbe usarlo.'), rim, chi='Claude Code' if porta not in (1234,) and not prove else 'Marco')
        else:
            OK(f'{nome[0].upper() + nome[1:]} (porta {porta}): solo su questo PC')


# ---------- Windows ----------
def windows():
    d = json.loads(powershell('Get-MpComputerStatus | Select-Object AntivirusEnabled,RealTimeProtectionEnabled,AntivirusSignatureAge | ConvertTo-Json') or '{}')
    if d:
        if not d.get('AntivirusEnabled') or not d.get('RealTimeProtectionEnabled'):
            P('win:defender', 'alta', 'Antivirus di Windows spento', 'Il PC non è protetto dai programmi dannosi.',
              'Start → Sicurezza di Windows → Protezione da virus e minacce → attivare la Protezione in tempo reale.')
        elif (d.get('AntivirusSignatureAge') or 0) > 7:
            P('win:firme', 'media', f'Antivirus non aggiornato da {d["AntivirusSignatureAge"]} giorni', 'Non riconosce i programmi dannosi più nuovi.',
              'Start → Sicurezza di Windows → Protezione da virus e minacce → Aggiornamenti della protezione → Verifica disponibilità aggiornamenti.')
        else:
            OK('Antivirus di Windows acceso e aggiornato')
    f = json.loads(powershell('Get-NetFirewallProfile | Select-Object Name,Enabled | ConvertTo-Json') or '[]')
    f = f if isinstance(f, list) else [f]
    spenti = [x['Name'] for x in f if not x.get('Enabled')]
    if spenti:
        P('win:firewall', 'alta', f'Firewall di Windows spento ({", ".join(spenti)})', 'Il PC accetta collegamenti dalla rete che dovrebbe bloccare.',
          'Start → Sicurezza di Windows → Firewall e protezione rete → attivare tutte e tre le reti.')
    elif f:
        OK('Firewall di Windows acceso')
    u = powershell("(Get-HotFix | Where-Object InstalledOn | Sort-Object InstalledOn -Descending | Select-Object -First 1).InstalledOn.ToString('yyyy-MM-dd')").strip()
    if re.fullmatch(r'\d{4}-\d{2}-\d{2}', u):
        giorni = (dt.date.today() - dt.date.fromisoformat(u)).days
        if giorni > 45:
            P('win:update', 'media', f'Windows non si aggiorna da {giorni} giorni (ultimo aggiornamento {u})',
              'Ogni mese Microsoft ripara falle anche gravi.', 'Start → Impostazioni → Windows Update → Verifica disponibilità aggiornamenti, poi riavviare.')
        else:
            OK(f'Windows aggiornato (ultimo aggiornamento {u})')
    ver = powershell("$v=Get-ItemProperty 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion'; \"$($v.EditionID)|$($v.DisplayVersion)|$($v.CurrentBuild)\"").strip().split('|')
    if len(ver) == 3 and ver[2].isdigit():
        # il registro scrive "Windows 10" anche su Windows 11: si riconosce dal numero di build
        OK(f'Sistema: Windows {11 if int(ver[2]) >= 22000 else 10} {ver[0]} {ver[1]} (build {ver[2]})')


# ---------- repository pubblico ----------
SEGRETI = [
    ('Chiave di Claude', re.compile(r'sk-ant-[A-Za-z0-9_-]{20,}'), 'alta'),
    ('Chiave privata', re.compile(r'-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----'), 'alta'),
    ('Token di GitHub', re.compile(r'\bgh[pousr]_[A-Za-z0-9]{30,}\b|\bgithub_pat_[A-Za-z0-9_]{40,}'), 'alta'),
    ('Token di Telegram', re.compile(r'\b\d{8,10}:AA[A-Za-z0-9_-]{30,}\b'), 'alta'),
    ('Chiave segreta di Supabase', re.compile(r'\bsb_secret_[A-Za-z0-9_-]{20,}'), 'alta'),
    ('Chiave di Google', re.compile(r'\bAIza[0-9A-Za-z_-]{35}\b'), 'media'),
    ('IBAN', re.compile(r'\bIT\d{2}[A-Z]\d{10}[0-9A-Z]{12}\b'), 'media'),
    ('Codice fiscale', re.compile(r'\b[A-Z]{6}\d{2}[A-EHLMPR-T]\d{2}[A-Z]\d{3}[A-Z]\b'), 'media'),
]
JWT = re.compile(r'eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}')
FILE_A_RISCHIO = re.compile(r'(^|/)(\.env(\..*)?|.*\.(jks|keystore|p12|pfx|pem|key|db|sqlite|sqlite3|xlsx|xls|mdb))$', re.I)
SALTA = re.compile(r'^(vendor|modelli|icons)/|\.(png|jpe?g|gif|webp|ico|pdf|zip|wasm|glb|gltf|bin|woff2?|ttf|traineddata|gz|jar)$', re.I)


def ruolo(t):
    try:
        p = t.split('.')[1]
        return json.loads(base64.urlsafe_b64decode(p + '=' * (-len(p) % 4))).get('role')
    except Exception:
        return None


PERSONALI = ('IBAN', 'Codice fiscale')


def coperto(v, nome=''):
    if nome in PERSONALI:
        return f'un valore di {len(v)} caratteri (non riportato)'
    return v[:4] + '…' + str(len(v)) + ' caratteri'


def cerca(testo):
    for nome, re_, grav in SEGRETI:
        for m in re_.finditer(testo):
            yield nome, grav, m.group(0)
    for m in JWT.finditer(testo):
        if ruolo(m.group(0)) == 'service_role':
            yield 'Chiave di servizio di Supabase (service_role)', 'alta', m.group(0)


def git(*args, timeout=300):
    return comando(['git', '-C', REPO, *args], timeout)


def repository():
    if not os.path.isdir(os.path.join(REPO, '.git')):
        return
    file = [f for f in git('ls-files', '-z').split('\0') if f]
    rischio = [f for f in file if FILE_A_RISCHIO.search(f)]
    for f in rischio:
        P(f'repo:file:{f}', 'media', f'File da non pubblicare nel repository: {f}',
          'Il repository è pubblico: chiunque può scaricare questo file.',
          f'Chiedere a Claude Code: "togli {f} dal repository e mettilo nel .gitignore", poi valutare se cambiare quello che contiene.', chi='Marco con Claude Code')
    adesso = {}
    for f in file:
        if SALTA.search(f):
            continue
        p = os.path.join(REPO, f)
        try:
            if os.path.getsize(p) > 3_000_000:
                continue
            with open(p, encoding='utf-8', errors='ignore') as h:
                for n, riga in enumerate(h, 1):
                    for nome, grav, v in cerca(riga):
                        adesso.setdefault((nome, f), (grav, n, v))
        except OSError:
            continue
    for (nome, f), (grav, n, v) in adesso.items():
        P(f'repo:ora:{nome}:{f}', grav, f'{nome} nel repository pubblico: {f} riga {n}', f'Valore: {coperto(v, nome)}.',
          ('Subito: rigenerare la chiave nel servizio che l\'ha data (così quella pubblicata non vale più), poi chiedere a Claude Code di toglierla dal file.'
           if grav == 'alta' else f'Chiedere a Claude Code: "togli il dato da {f} riga {n}". Se è un dato vero, resta anche nella storia: vedi la voce della storia.'),
          chi='Marco con Claude Code')
    # storia: solo le righe aggiunte, cartelle vendor e modelli escluse
    storia, commit, nomefile = {}, '', ''
    proc = subprocess.Popen(['git', '-C', REPO, 'log', '--all', '-p', '--no-color', '-U0', '--format=@@commit %h %ad', '--date=short',
                             '--', '.', ':(exclude)vendor', ':(exclude)modelli'], stdout=subprocess.PIPE, creationflags=NASCOSTO)
    for b in proc.stdout:
        riga = b.decode('utf-8', 'ignore')
        if riga.startswith('@@commit '):
            commit = riga[9:].strip()
        elif riga.startswith('+++ '):
            nomefile = riga[6:].strip() if riga.startswith('+++ b/') else ''
        elif riga.startswith('+') and nomefile and not SALTA.search(nomefile):
            for nome, grav, v in cerca(riga):
                if (nome, nomefile) not in adesso:
                    storia.setdefault((nome, v), (grav, nomefile, commit))
    proc.wait()
    for (nome, v), (grav, f, c) in list(storia.items())[:30]:
        P(f'repo:storia:{nome}:{f}:{c.split()[0]}', grav, f'{nome} nella storia del repository: {f} (commit {c})',
          f'Tolto dai file di adesso, ma resta nelle versioni vecchie, che chiunque può leggere. Valore: {coperto(v, nome)}.',
          ('Rigenerare la chiave nel servizio che l\'ha data: è l\'unico rimedio sicuro, perché il repository può essere già stato copiato.'
           if grav == 'alta' else 'Se è un dato vero di una persona: chiedere a Claude Code se conviene riscrivere la storia (git filter-repo) o lasciarlo.'),
          chi='Marco con Claude Code')
    if not rischio and not adesso and not storia:
        OK(f'Repository pubblico: nessuna chiave, IBAN o codice fiscale in {len(file)} file e nella storia dei commit (i nomi delle persone non si possono cercare in automatico)')


def main():
    solo = '--solo' in sys.argv
    os.makedirs(CARTELLA, exist_ok=True)
    for nome, fn in [('Python', python), ('pacchetti Python', pacchetti), ('porte', porte), ('Windows', windows), ('repository', repository)]:
        prova(nome, fn)
    dati = {'versione': VERSIONE, 'computer': socket.gethostname(), 'creato': dt.datetime.now(dt.timezone.utc).isoformat(), 'problemi': problemi, 'ok': ok}
    with open(os.path.join(CARTELLA, 'sicurezza-pc.json'), 'w', encoding='utf-8') as h:
        json.dump(dati, h, ensure_ascii=False, indent=1)
    esito = 'non mandato (--solo)'
    if not solo:
        try:
            with open(os.path.join(CARTELLA, 'sicurezza.json'), encoding='utf-8') as h:
                segreto = json.load(h).get('segreto', '')
            if not segreto:
                raise FileNotFoundError
            r = scarica(FUNZIONE, json.dumps({'pc': dati}).encode(), {'Content-Type': 'application/json', 'x-sicurezza-segreto': segreto}, 60)
            esito = f'mandato a Supabase ({r.get("salvato", 0)} aziende)'
        except FileNotFoundError:
            esito = 'non mandato: manca il segreto in ' + os.path.join(CARTELLA, 'sicurezza.json')
        except Exception as e:
            esito = f'non mandato: {type(e).__name__}: {e}'
    riga = f'{dt.datetime.now():%Y-%m-%d %H:%M}  {len(problemi)} problemi, {len(ok)} controlli a posto, {esito}\n'
    with open(os.path.join(CARTELLA, 'sicurezza-log.txt'), 'a', encoding='utf-8') as h:
        h.write(riga)
    if sys.stdout:
        try:
            sys.stdout.reconfigure(encoding='utf-8')
        except Exception:
            pass
        for p in problemi:
            print(f'[{p["gravita"]}] {p["titolo"]}\n      → {p["rimedio"]}')
        for o in ok:
            print(f'[ok] {o["titolo"]}')
        print(riga.strip())


if __name__ == '__main__':
    main()
