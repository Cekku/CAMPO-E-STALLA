"""Guardiano del ponte dell'archivio (porta 1236): lo tiene sempre acceso, senza finestre.

Si avvia con pythonw (attività di Windows "Archivio documenti - ponte", all'accesso) oppure con
"Archivio - ponte riaccendi.bat". Cosa fa:
  - un solo guardiano alla volta (mutex di Windows con nome);
  - se la porta 1236 ha già un ponte che risponde (anche aperto a mano con "Archivio - ponte.bat")
    non ne apre un secondo: aspetta e lo riprende quando sparisce;
  - se il ponte si chiude o va in errore lo riaccende (pausa 5 s, che cresce fino a 2 minuti se cade
    subito più volte di fila);
  - controlla ogni 10 secondi; se la porta è occupata ma non risponde per 3 controlli di fila e il ponte è il suo,
    lo chiude e lo riaccende;
  - registro breve in ArchivioAzienda\\ponte-log.txt (avvii, chiusure, errori; le richieste normali
    non si scrivono; si accorcia da solo sopra 300 KB).
Solo libreria standard. Il ponte (ponte-archivio.py) resta lo stesso programma di sempre.
"""
import ctypes
import http.client
import os
import subprocess
import sys
import threading
import time

AQUI = os.path.dirname(os.path.abspath(__file__))
DATI = os.environ.get('ARCHIVIO_DATI') or os.path.join(os.path.expanduser('~'), 'ArchivioAzienda')
LOG = os.path.join(DATI, 'ponte-log.txt')
PORTA = 1236
ORIGINE = 'http://127.0.0.1:8765'          # una delle origini ammesse dal ponte (ORIGINI in ponte-archivio.py)
CONTROLLO_S = 10
GUASTI_MAX = 3
LOG_MAX = 300_000
CREATE_NO_WINDOW = 0x08000000

_log_lock = threading.Lock()


def adesso():
    return time.strftime('%Y-%m-%d %H:%M:%S')


def scrivi(testo):
    try:
        os.makedirs(DATI, exist_ok=True)
        with _log_lock:
            if os.path.exists(LOG) and os.path.getsize(LOG) > LOG_MAX:      # tiene l'ultima metà
                with open(LOG, 'rb') as f:
                    f.seek(-LOG_MAX // 2, os.SEEK_END)
                    resto = f.read().split(b'\n', 1)[-1]
                with open(LOG, 'wb') as f:
                    f.write(resto)
            with open(LOG, 'a', encoding='utf-8') as f:
                f.write(f'{adesso()}  {testo}\n')
    except Exception:
        pass


def risponde():
    """True se sulla porta c'è un server HTTP che risponde (qualunque codice); False se non risponde;
    None se la porta è chiusa."""
    try:
        c = http.client.HTTPConnection('127.0.0.1', PORTA, timeout=10)
        c.request('GET', '/stato', headers={'Origin': ORIGINE})
        c.getresponse().read()
        c.close()
        return True
    except ConnectionRefusedError:
        return None
    except Exception:
        return False


def mutex_unico():
    """Un solo guardiano: mutex con nome. Restituisce l'handle (da tenere vivo) o None se già c'è."""
    k = ctypes.windll.kernel32
    k.CreateMutexW.restype = ctypes.c_void_p
    h = k.CreateMutexW(None, False, 'Local\\CampoEStalla-PonteGuardiano')
    if k.GetLastError() == 183:             # ERROR_ALREADY_EXISTS
        return None
    return h


def python_console():
    """python.exe accanto a pythonw.exe (con CREATE_NO_WINDOW non apre finestre e ha i canali standard)."""
    d = os.path.dirname(sys.executable)
    p = os.path.join(d, 'python.exe')
    return p if os.path.exists(p) else sys.executable


def pompa_uscita(proc):
    """Legge l'uscita del ponte: scrive nel registro solo quello che non è una richiesta andata bene."""
    for riga in proc.stdout:
        t = riga.rstrip()
        if not t:
            continue
        # richieste normali: '... "GET /stato HTTP/1.1" 200 -' (anche 2xx, 3xx, 4xx: errori dell'app, non del ponte)
        if '"GET ' in t or '"POST ' in t or '"OPTIONS ' in t:
            if ' 500 ' not in t and ' 503 ' not in t:
                continue
        scrivi('ponte: ' + t[:300])


def avvia_ponte():
    env = dict(os.environ, PYTHONIOENCODING='utf-8', PYTHONUNBUFFERED='1')
    return subprocess.Popen(
        [python_console(), '-u', os.path.join(AQUI, 'ponte-archivio.py')], cwd=AQUI, env=env,
        stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
        creationflags=CREATE_NO_WINDOW, text=True, encoding='utf-8', errors='replace')


# ---------- pulizia dei programmi dimenticati (24/11/2026, chiesto da Marco: "si devono chiudere sempre appena
# finito il lavoro") ----------
# Il 24/11 c'erano sei processi della lettura ottica rimasti senza il programma che li aveva aperti (19 e 21/11) e
# server delle prove delle chat di Claude Code accesi da giorni, due aperti a tutta la rete. La causa dei primi è
# corretta in figli.py; questa è la rete di sicurezza: ogni 10 minuti chiude
#  - i processi di lavoro di Python (multiprocessing) il cui padre non esiste più;
#  - i server delle prove (python -m http.server sulle porte 8765-8799) accesi da più di SERVER_ORE ore.
PULIZIA_S = 600
SERVER_ORE = 6
ELENCO_PS = ("Get-CimInstance Win32_Process -Filter \"Name like 'python%'\" | "
             "Select-Object ProcessId, ParentProcessId, CommandLine, @{n='Ore';e={((Get-Date) - $_.CreationDate).TotalHours}} | "
             "ConvertTo-Json -Compress")


def da_chiudere(processi, server_ore=SERVER_ORE):
    """Dall'elenco dei processi Python sceglie quelli dimenticati: [(pid, motivo)]."""
    import re
    vivi = {p['ProcessId'] for p in processi}
    tutti = set(vivi)
    try:   # tutti i processi accesi, non solo Python: se il numero del padre è stato riusato, non si chiude niente
        lista = subprocess.run(['tasklist', '/fo', 'csv', '/nh'], capture_output=True, text=True, errors='replace',
                               creationflags=CREATE_NO_WINDOW, timeout=60).stdout
        tutti |= {int(x) for x in re.findall(r'^"[^"]*","(\d+)"', lista, re.M)}
    except Exception:
        return []   # senza l'elenco completo non si chiude niente
    scelti = []
    for p in processi:
        cmd = p.get('CommandLine') or ''
        m = re.search(r'spawn_main\(parent_pid=(\d+)', cmd)
        if m and int(m[1]) not in tutti:
            scelti.append((p['ProcessId'], f'processo di lavoro rimasto senza padre (pid {m[1]})'))
            continue
        m = re.search(r'-m\s+http\.server\s+(\d+)', cmd)
        if m and 8765 <= int(m[1]) <= 8799 and (p.get('Ore') or 0) > server_ore:
            scelti.append((p['ProcessId'], f'server delle prove sulla porta {m[1]} acceso da {p["Ore"]:.0f} ore'))
    return scelti


def pulizia():
    import json
    try:
        uscita = subprocess.run(['powershell', '-NoProfile', '-NonInteractive', '-Command', ELENCO_PS], capture_output=True,
                                text=True, encoding='utf-8', errors='replace', creationflags=CREATE_NO_WINDOW, timeout=120).stdout
        processi = json.loads(uscita or '[]')
        processi = processi if isinstance(processi, list) else [processi]
        for pid, motivo in da_chiudere(processi):
            if pid == os.getpid():
                continue
            r = subprocess.run(['taskkill', '/PID', str(pid), '/F'], capture_output=True, text=True, creationflags=CREATE_NO_WINDOW, timeout=30)
            scrivi(f'chiuso {pid}: {motivo}' + ('' if r.returncode == 0 else f' (non riuscito: {r.stdout.strip() or r.stderr.strip()})'))
    except Exception as e:
        scrivi(f'pulizia non riuscita: {type(e).__name__}: {e}')


def giro_pulizia():
    time.sleep(60)
    while True:
        pulizia()
        time.sleep(PULIZIA_S)


def main():
    h = mutex_unico()
    if h is None:
        scrivi('guardiano già acceso: esco')
        return
    scrivi(f'===== guardiano acceso (pid {os.getpid()}, {python_console()}) =====')
    threading.Thread(target=giro_pulizia, daemon=True, name='pulizia').start()
    pausa = 5
    guasti = 0
    proc = None
    while True:
        stato = risponde()
        if stato:                                         # c'è un ponte, mio o aperto a mano
            guasti = 0
            if proc is None or proc.poll() is not None:
                proc = None
            time.sleep(CONTROLLO_S)
            continue
        if stato is False:                                # porta occupata ma silenziosa
            guasti += 1
            if guasti < GUASTI_MAX:
                time.sleep(CONTROLLO_S)
                continue
            if proc is not None and proc.poll() is None:
                scrivi('il ponte non risponde da 3 controlli: lo chiudo e lo riaccendo')
                proc.kill(); proc.wait()
                proc = None
            else:
                scrivi('la porta 1236 è occupata da qualcosa che non risponde e non è mio: aspetto')
                guasti = 0
                time.sleep(120)
                continue
        # porta libera (o ponte mio appena chiuso): accendo
        guasti = 0
        if proc is not None and proc.poll() is None:
            time.sleep(CONTROLLO_S); continue
        if proc is not None:
            scrivi(f'ponte chiuso (codice {proc.returncode})')
        t0 = time.time()
        try:
            proc = avvia_ponte()
        except Exception as e:
            scrivi(f'non riesco ad accendere il ponte: {type(e).__name__}: {e}')
            time.sleep(60)
            continue
        threading.Thread(target=pompa_uscita, args=(proc,), daemon=True).start()
        scrivi(f'ponte acceso (pid {proc.pid})')
        # aspetta che risponda (fino a 60 s) o che si chiuda subito
        for _ in range(30):
            if proc.poll() is not None or risponde():
                break
            time.sleep(2)
        if proc.poll() is not None:
            vita = time.time() - t0
            scrivi(f'ponte uscito dopo {vita:.0f} s (codice {proc.returncode}): riprovo fra {pausa} s')
            time.sleep(pausa)
            pausa = min(pausa * 2, 120) if vita < 60 else 5
            proc = None
        else:
            pausa = 5
            scrivi('ponte risponde')
            # finché è vivo e risponde, il giro in cima lo controlla ogni 10 s
            time.sleep(CONTROLLO_S)


if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        pass
    except Exception as e:
        scrivi(f'guardiano fermato da un errore: {type(e).__name__}: {e}')
        raise
