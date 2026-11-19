"""Scarica la banca dati dei prodotti fitosanitari del Ministero della Salute e le etichette autorizzate.

Cosa fa:
1. scarica l'elenco open data (CSV) da dati.salute.gov.it;
2. per ogni prodotto ancora autorizzato cerca nella banca dati del Ministero l'ultima etichetta e la scarica in PDF;
3. scrive data/fitosanitari.json, che l'app carica da sola all'avvio (prodotti + numero dell'etichetta).

Uso:  python -I scarica_fitosanitari.py [--etichette CARTELLA] [--solo-elenco] [--pausa 0.7]
Si può interrompere e rilanciare: le etichette già scaricate non si riscaricano.
Il sito del Ministero manda un'intestazione HTTP spezzata che curl e urllib rifiutano: per questo la connessione è fatta a mano.
"""
import argparse, csv, html, io, json, os, re, socket, ssl, subprocess, sys, time, urllib.parse, urllib.request
from datetime import date, datetime

QUI = os.path.dirname(os.path.abspath(__file__))
PROGETTO = os.path.normpath(os.path.join(QUI, '..', '..'))
USCITA = os.path.join(PROGETTO, 'data', 'fitosanitari.json')
CACHE = os.path.join(QUI, 'etichette-indice.json')  # numero di registrazione -> etichetta trovata (per riprendere)
DATASET = 'https://www.dati.salute.gov.it/dati/dettaglioDataset.jsp?menu=dati&idPag=6'
HOST = 'www.fitosanitari.salute.gov.it'
BASE = '/fitosanitariws_new/'
UA = 'Mozilla/5.0 (CampoEStalla; aggiornamento banca dati fitosanitari)'
FUORI = re.compile(r'revoc|scadut|sospes', re.I)


COOKIE = {}  # la ricerca vuole la sessione aperta dalla pagina del modulo


def http(path, body=None, tentativi=3):
    """Richiesta HTTP/1.0 a mano: restituisce (intestazioni, corpo)."""
    if body and not COOKIE:
        http(BASE + 'FitosanitariServlet')
    for t in range(tentativi):
        try:
            ctx = ssl.create_default_context()
            s = ctx.wrap_socket(socket.create_connection((HOST, 443), timeout=60), server_hostname=HOST)
            m = 'POST' if body else 'GET'
            req = f'{m} {path} HTTP/1.0\r\nHost: {HOST}\r\nUser-Agent: {UA}\r\nAccept: */*\r\n'
            if COOKIE:
                req += 'Cookie: ' + '; '.join(f'{k}={v}' for k, v in COOKIE.items()) + '\r\n'
            if body:
                req += f'Referer: https://{HOST}{BASE}FitosanitariServlet\r\n'
            if body:
                req += f'Content-Type: application/x-www-form-urlencoded\r\nContent-Length: {len(body)}\r\n'
            s.sendall((req + '\r\n').encode() + (body.encode() if body else b''))
            parti = []
            while True:
                c = s.recv(65536)
                if not c:
                    break
                parti.append(c)
            s.close()
            h, _, b = b''.join(parti).partition(b'\r\n\r\n')
            for k, v in re.findall(rb'(?im)^set-cookie:\s*([^=;\s]+)=([^;\r\n]*)', h):
                COOKIE[k.decode('latin-1')] = v.decode('latin-1')
            if not h.startswith(b'HTTP/1.') or b' 200' not in h.split(b'\r\n', 1)[0]:
                raise IOError('risposta ' + h.split(b'\r\n', 1)[0].decode('latin-1', 'replace'))
            return h.decode('latin-1', 'replace'), b
        except Exception as e:
            if t == tentativi - 1:
                raise
            time.sleep(5 * (t + 1))


def leggi_url(url):
    """dati.salute.gov.it a volte chiude la connessione a Python: in quel caso si usa curl di Windows."""
    try:
        return urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'}), timeout=120).read()
    except Exception:
        return subprocess.run(['curl', '-sL', '--fail', '-A', 'Mozilla/5.0', url], capture_output=True, check=True, timeout=300).stdout


def scarica_csv():
    pagina = leggi_url(DATASET).decode('utf-8', 'replace')
    m = re.search(r'href="([^"]*PROD_FTS_[^"]*\.csv)"', pagina, re.I)
    if not m:
        sys.exit('Non trovo il CSV dei prodotti nella pagina del dataset.')
    url = urllib.parse.urljoin(DATASET, m.group(1))
    dati = leggi_url(url)
    try:
        testo = dati.decode('utf-8-sig')
    except UnicodeDecodeError:
        testo = dati.decode('windows-1252')
    print('Elenco:', url, len(dati) // 1024, 'kB', flush=True)
    return url, list(csv.DictReader(io.StringIO(testo), delimiter=';'))


def ripara(s):
    """Alcuni nomi nel CSV del Ministero sono codificati due volte (COÃ\x96PERATIEF): si rimettono a posto."""
    if 'Ã' in s or 'Â' in s:
        for cod in ('cp1252', 'latin-1'):
            try:
                return s.encode(cod).decode('utf-8')
            except UnicodeError:
                pass
    return s


def iso(s):
    m = re.match(r'(\d{1,2})/(\d{1,2})/(\d{4})', (s or '').strip())
    return f'{m[3]}-{int(m[2]):02d}-{int(m[1]):02d}' if m else ''


def cerca_etichetta(nreg):
    """None = il prodotto c'è ma senza etichetta; errore se la pagina non è un risultato (sessione scaduta, guasto)."""
    corpo = urllib.parse.urlencode({'ACTION': 'cercaProdotti', 'FROM': '0', 'TO': '49', 'PROVENIENZA': 'RICERCA', 'NUMERO_REGISTRAZIONE': nreg})
    for giro in range(2):
        _, b = http(BASE + 'FitosanitariServlet', corpo)
        t = b.decode('latin-1', 'replace')
        if 'EtichettaServlet' in t or (nreg.lstrip('0') in t and "verificato un errore" not in t):
            break
        COOKIE.clear()  # sessione scaduta: se ne apre una nuova e si riprova
    else:
        raise IOError('la banca dati non ha dato il risultato (sessione o errore del sito)')
    trovate = [(int(i), iso(d)) for i, d in re.findall(r'EtichettaServlet\?id=(\d+)[^>]*>\s*Etichetta\s+del\s+([\d/]+)', t)]
    if not trovate:
        trovate = [(int(i), '') for i in re.findall(r'EtichettaServlet\?id=(\d+)', t)]
    if not trovate:
        return None
    i, d = max(trovate, key=lambda x: (x[1], x[0]))
    return {'id': i, 'data': d}


def nome_file(nreg, nome, data):
    pulito = re.sub(r'[^A-Za-z0-9 ._+-]', '', html.unescape(nome)).strip()[:60].strip(' .') or 'prodotto'
    return f'{nreg}_{pulito}_{data or "senza-data"}.pdf'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--etichette', default=os.path.join(os.path.expanduser('~'), 'Etichette fitosanitari'))  # fuori da OneDrive: circa 1 GB
    ap.add_argument('--solo-elenco', action='store_true', help='non cerca né scarica le etichette')
    ap.add_argument('--pausa', type=float, default=0.7, help='secondi fra una richiesta e l\'altra (per non pesare sul sito)')
    ap.add_argument('--prova', type=int, default=0, help='solo i primi N prodotti autorizzati (non scrive il JSON)')
    a = ap.parse_args()

    url, righe = scarica_csv()
    indice = json.load(open(CACHE, encoding='utf-8')) if os.path.exists(CACHE) else {}
    prodotti = []
    for r in righe:
        nreg = (r.get('num_registrazione') or '').strip()
        if not nreg:
            continue
        g = lambda k: '' if (r.get(k) or '').strip() == '-' else ripara((r.get(k) or '').strip())
        prodotti.append({
            'nReg': nreg, 'nome': g('denominazione_prodotto'), 'impresa': g('ragione_sociale'),
            'scadenza': iso(g('data_scadenza_autorizzazione')), 'stato': g('stato_amministrativo'),
            'sostanze': ', '.join(x.strip() for x in g('sostanze_attive').split('|') if x.strip()), 'attivita': g('attivita'), 'formulazione': g('descrizione_formulazione'),
            'dataReg': iso(g('data_registrazione')), 'pericolo': g('indicazioni_di_pericolo'),
        })
    attivi = [p for p in prodotti if not FUORI.search(p['stato'])]
    print(f'Prodotti: {len(prodotti)}, ancora autorizzati: {len(attivi)}', flush=True)
    if a.prova:
        attivi = attivi[:a.prova]

    if not a.solo_elenco:
        os.makedirs(a.etichette, exist_ok=True)
        fatti = errori = nuovi = 0
        for n, p in enumerate(attivi, 1):
            k = p['nReg']
            try:
                e = indice.get(k)
                if e is None or not e.get('id') or e.get('controllata') != str(date.today()):
                    time.sleep(a.pausa)
                    e = cerca_etichetta(k) or {}
                    e['controllata'] = str(date.today())
                    indice[k] = e
                if e.get('id'):
                    f = os.path.join(a.etichette, nome_file(k, p['nome'], e.get('data')))
                    if not os.path.exists(f):
                        time.sleep(a.pausa)
                        h, b = http(BASE + f'EtichettaServlet?id={e["id"]}')
                        if not b.startswith(b'%PDF'):
                            raise IOError('non è un PDF')
                        with open(f + '.tmp', 'wb') as o:
                            o.write(b)
                        os.replace(f + '.tmp', f)
                        nuovi += 1
                    e['file'] = os.path.basename(f)
                fatti += 1
            except Exception as ex:
                errori += 1
                print(f'  errore {k} {p["nome"]}: {ex}', flush=True)
            if n % 50 == 0 or n == len(attivi):
                json.dump(indice, open(CACHE, 'w', encoding='utf-8'), ensure_ascii=False)
                print(f'{datetime.now():%H:%M} {n}/{len(attivi)}  etichette nuove {nuovi}  errori {errori}', flush=True)

    if a.prova:
        print(json.dumps({p['nReg']: indice.get(p['nReg']) for p in attivi}, ensure_ascii=False, indent=1))
        return
    for p in prodotti:
        e = indice.get(p['nReg']) or {}
        if e.get('id'):
            p['etichetta'] = {'id': e['id'], 'data': e.get('data', '')}
    # più leggero per il telefono: niente campi vuoti, e dei prodotti non più autorizzati solo quello che serve agli avvisi
    for i, p in enumerate(prodotti):
        if FUORI.search(p['stato']):
            p = {k: p[k] for k in ('nReg', 'nome', 'impresa', 'scadenza', 'stato', 'sostanze')}
        prodotti[i] = {k: v for k, v in p.items() if v not in ('', None)}
    out = {'fonte': url, 'aggiornato': datetime.now().isoformat(timespec='seconds'), 'n': len(prodotti), 'prodotti': prodotti}
    os.makedirs(os.path.dirname(USCITA), exist_ok=True)
    with open(USCITA, 'w', encoding='utf-8') as o:
        json.dump(out, o, ensure_ascii=False, separators=(',', ':'))
    print('Scritto', USCITA, os.path.getsize(USCITA) // 1024, 'kB', flush=True)


if __name__ == '__main__':
    main()
