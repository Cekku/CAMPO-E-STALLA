"""Copie di sicurezza dell'app sul PC (dalla 1.80.0), usate dal ponte dell'archivio (ponte-archivio.py).

L'app aperta sul PC del titolare manda una volta alla settimana tutte le registrazioni (POST /copia) e gli allegati
che la cartella non ha ancora (POST /copia/allegato). Qui si salvano, fuori dal repository e fuori da Supabase:

  %USERPROFILE%\\ArchivioAzienda\\copie-sicurezza\\
      copia-AAAA-MM-GG.json.gz     le registrazioni, come il file "Scarica copia" dell'app, più "_copia" (quando, versione, conteggi)
      allegati\\<id>               i file allegati (gli originali dei Conti "conti/<impronta>" → "conti__<impronta>")
      allegati\\indice.json        { id: { tipo, byte, sha256, quando } }
      ripristino-ultimo.json       resoconto dell'ultima prova di ripristino (strumenti/copie/prova-ripristino.mjs)
      ripristini.jsonl             tutti i resoconti, una riga ciascuno

Si tengono le copie più recenti di ognuna delle ultime 8 settimane e di ognuno degli ultimi 12 mesi (da_tenere).
Gli allegati non si cancellano mai (sono pochi e ogni copia li può nominare).

Prova: python copie.py --prova   (cartella temporanea, dati finti; la lancia anche npm test)
"""
import base64
import datetime as dt
import gzip
import hashlib
import json
import os
import re
import subprocess
import sys
import tempfile
import threading
from pathlib import Path

CARTELLA = Path(os.environ.get('CES_COPIE') or (Path.home() / 'ArchivioAzienda' / 'copie-sicurezza'))
SETTIMANE, MESI = 8, 12
MAX_ALLEGATO = 30 * 1024 * 1024
NOME = re.compile(r'^copia-(\d{4}-\d{2}-\d{2})\.json\.gz$')
ID_ALLEGATO = re.compile(r'^(conti/)?[A-Za-z0-9_-]{1,100}$')
_LOCK = threading.Lock()


class Errore(Exception):
    def __init__(self, codice, testo):
        super().__init__(testo)
        self.codice, self.testo = codice, testo


def _cartella():
    (CARTELLA / 'allegati').mkdir(parents=True, exist_ok=True)
    return CARTELLA


def _scrivi(percorso, dati):
    """Scrive in un file accanto e poi lo sostituisce: una copia a metà non prende mai il posto di quella buona."""
    tmp = percorso.with_name(percorso.name + '.tmp')
    tmp.write_bytes(dati)
    os.replace(tmp, percorso)


def file_allegato(id_):
    return _cartella() / 'allegati' / id_.replace('/', '__')


def _indice():
    f = _cartella() / 'allegati' / 'indice.json'
    try:
        return json.loads(f.read_text('utf-8'))
    except (OSError, ValueError):
        return {}


def allegati_di(dati):
    """Allegati nominati dalle registrazioni: campo "allegati" [{id, tipo}] di ogni raccolta e originali dei Conti
    (econfig "do-<impronta>" con copia: true → "conti/<impronta>"). Uguale ad allegatiDi di js/copia-conta.js."""
    visti = {}
    for col, righe in dati.items():
        if not isinstance(righe, list):
            continue
        for r in righe:
            if not isinstance(r, dict):
                continue
            for a in (r.get('allegati') or []) if isinstance(r.get('allegati'), list) else []:
                if isinstance(a, dict) and isinstance(a.get('id'), str) and ID_ALLEGATO.fullmatch(a['id']):
                    visti.setdefault(a['id'], a.get('tipo') or '')
            if col == 'econfig' and str(r.get('id', '')).startswith('do-') and r.get('copia') is True and isinstance(r.get('impronta'), str):
                i = 'conti/' + r['impronta']
                if ID_ALLEGATO.fullmatch(i):
                    visti.setdefault(i, r.get('mime') or '')
    return visti


def da_tenere(date, oggi):
    """Fra le date delle copie (AAAA-MM-GG) quelle da tenere: la più recente di ognuna delle ultime SETTIMANE settimane
    (lunedì-domenica) e di ognuno degli ultimi MESI mesi, contati da oggi. Le date future si tengono."""
    oggi = dt.date.fromisoformat(oggi) if isinstance(oggi, str) else oggi
    lun = oggi - dt.timedelta(days=oggi.weekday())
    settimane = {lun - dt.timedelta(weeks=k) for k in range(SETTIMANE)}
    mesi = set()
    a, m = oggi.year, oggi.month
    for _ in range(MESI):
        mesi.add((a, m))
        a, m = (a, m - 1) if m > 1 else (a - 1, 12)
    tieni, per_sett, per_mese = set(), {}, {}
    for s in sorted(set(date)):
        d = dt.date.fromisoformat(s)
        if d > oggi:
            tieni.add(s)
            continue
        w = d - dt.timedelta(days=d.weekday())
        if w in settimane:
            per_sett[w] = s                     # in ordine: resta la più recente
        if (d.year, d.month) in mesi:
            per_mese[(d.year, d.month)] = s
    return tieni | set(per_sett.values()) | set(per_mese.values())


def _date_copie():
    out = {}
    for f in _cartella().iterdir():
        m = NOME.match(f.name)
        if m:
            out[m[1]] = f
    return out


def ruota(oggi=None):
    oggi = oggi or dt.date.today()
    copie = _date_copie()
    tieni = da_tenere(copie.keys(), oggi)
    tolte = []
    for d, f in copie.items():
        if d not in tieni:
            f.unlink()
            tolte.append(f.name)
    return sorted(tolte)


def conteggi(dati):
    return {c: len(v) for c, v in dati.items() if isinstance(v, list) and not c.startswith('_')}


def salva_copia(corpo, oggi=None):
    """POST /copia {dati: {raccolta: [registrazioni]}, versione, quando} → {file, conteggi, registrazioni, allegati, mancanti, tolte}."""
    if not isinstance(corpo, dict) or not isinstance(corpo.get('dati'), dict):
        raise Errore(400, 'serve "dati": { raccolta: [registrazioni] }')
    dati = corpo['dati']
    for c, v in dati.items():
        if not isinstance(c, str) or not re.fullmatch(r'[a-z]{1,30}', c) or not isinstance(v, list):
            raise Errore(400, f'raccolta non valida: {str(c)[:40]}')
    n = conteggi(dati)
    if not sum(n.values()):
        raise Errore(400, 'la copia è vuota')
    oggi = oggi or dt.date.today()
    alleg = allegati_di(dati)
    meta = {'quando': dt.datetime.now().isoformat(timespec='seconds'), 'versione': str(corpo.get('versione') or '')[:20],
            'dispositivo': str(corpo.get('quando') or '')[:40], 'conteggi': n, 'allegati': len(alleg)}
    testo = json.dumps(dict(dati, _copia=meta), ensure_ascii=False, separators=(',', ':')).encode('utf-8')
    nome = f'copia-{oggi.isoformat()}.json.gz'
    with _LOCK:
        _scrivi(_cartella() / nome, gzip.compress(testo, 6))
        tolte = ruota(oggi)
    ind = _indice()
    mancanti = [{'id': i, 'tipo': t} for i, t in alleg.items() if i not in ind or not file_allegato(i).exists()]
    return {'file': nome, 'conteggi': n, 'registrazioni': sum(n.values()), 'allegati': len(alleg), 'mancanti': mancanti, 'tolte': tolte}


def salva_allegato(corpo):
    """POST /copia/allegato {id, tipo, dati: base64} → {id, byte, gia}. Un allegato già salvato non si riscrive."""
    if not isinstance(corpo, dict) or not isinstance(corpo.get('id'), str) or not ID_ALLEGATO.fullmatch(corpo['id']):
        raise Errore(400, 'serve "id" di un allegato')
    id_ = corpo['id']
    with _LOCK:
        ind = _indice()
        f = file_allegato(id_)
        if id_ in ind and f.exists():
            return {'id': id_, 'byte': ind[id_]['byte'], 'gia': True}
        try:
            b = base64.b64decode(corpo.get('dati') or '', validate=True)
        except (ValueError, TypeError):
            raise Errore(400, '"dati" non è base64')
        if not b:
            raise Errore(400, 'allegato vuoto')
        if len(b) > MAX_ALLEGATO:
            raise Errore(413, 'allegato troppo grande')
        _scrivi(f, b)
        ind[id_] = {'tipo': str(corpo.get('tipo') or '')[:100], 'byte': len(b), 'sha256': hashlib.sha256(b).hexdigest(),
                    'quando': dt.datetime.now().isoformat(timespec='seconds')}
        _scrivi(_cartella() / 'allegati' / 'indice.json', json.dumps(ind, ensure_ascii=False, indent=0).encode('utf-8'))
    return {'id': id_, 'byte': len(b), 'gia': False}


def leggi_copia(nome):
    with gzip.open(_cartella() / nome, 'rb') as g:
        return json.loads(g.read().decode('utf-8'))


def _ripristino():
    try:
        return json.loads((_cartella() / 'ripristino-ultimo.json').read_text('utf-8'))
    except (OSError, ValueError):
        return None


_META = {}


def elenco(_q=None):
    """GET /copie → {cartella, copie: [{file, data, byte, quando, registrazioni, allegati}], allegati_salvati, ripristino, prova_in_corso}."""
    out = []
    for d, f in sorted(_date_copie().items(), reverse=True):
        try:
            st = f.stat()
        except OSError:                             # tolta in questo momento dalla rotazione
            continue
        chiave = (f.name, st.st_mtime_ns)
        meta = _META.get(chiave)
        if meta is None:
            try:
                with gzip.open(f, 'rb') as g:      # "_copia" è in fondo: si legge tutta una volta, poi resta in memoria
                    meta = json.loads(g.read().decode('utf-8')).get('_copia') or {}
            except (OSError, ValueError, EOFError):
                meta = {'rovinata': True}
            _META[chiave] = meta
        out.append({'file': f.name, 'data': d, 'byte': st.st_size, 'quando': meta.get('quando'),
                    'registrazioni': sum((meta.get('conteggi') or {}).values()), 'allegati': meta.get('allegati'), 'rovinata': bool(meta.get('rovinata'))})
    return {'cartella': str(_cartella()), 'copie': out, 'allegati_salvati': len(_indice()), 'ripristino': _ripristino(),
            'prova_in_corso': _PROVA['in_corso']}


# ---------------------------------------------------------------- prova di ripristino (una al mese, chiesta dall'app)
_PROVA = {'in_corso': False}
RADICE = Path(__file__).resolve().parents[2]
SCRIPT = RADICE / 'strumenti' / 'copie' / 'prova-ripristino.mjs'


def trova_node():
    import shutil
    for c in (os.environ.get('CES_NODE'), shutil.which('node'),
              str(Path(os.environ.get('LOCALAPPDATA', '')) / 'Programs' / 'LM Studio' / 'resources' / 'app' / '.webpack' / 'bin' / 'node.exe')):
        if c and Path(c).exists():
            return c
    return None


def prova_ripristino(_corpo=None):
    """POST /copia/prova → avvia strumenti/copie/prova-ripristino.mjs in un altro processo (2-3 minuti);
    il resoconto arriva in ripristino-ultimo.json e in GET /copie."""
    node = trova_node()
    if not node:
        raise Errore(503, 'Node non è installato sul PC: serve per la prova di ripristino')
    if not SCRIPT.exists():
        raise Errore(503, 'manca strumenti/copie/prova-ripristino.mjs')
    with _LOCK:
        if _PROVA['in_corso']:
            return {'avviata': False, 'in_corso': True}
        _PROVA['in_corso'] = True

    def lavora():
        p = None
        try:
            p = subprocess.Popen([node, str(SCRIPT), '--cartella', str(_cartella())], cwd=str(RADICE),
                                 stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                                 creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
            p.wait(timeout=900)
        except subprocess.TimeoutExpired:          # chiude anche il browser e il server aperti dallo script
            if os.name == 'nt':
                subprocess.run(['taskkill', '/pid', str(p.pid), '/t', '/f'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                               creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
            else:
                p.kill()
        except Exception:
            pass
        finally:
            _PROVA['in_corso'] = False
    threading.Thread(target=lavora, daemon=True).start()
    return {'avviata': True, 'in_corso': True}


# ---------------------------------------------------------------- prove con dati finti
def _prove():
    global CARTELLA
    falliti = []

    def t(nome, cond, info=''):
        if not cond:
            falliti.append(nome)
            print(f'  NO  {nome} {info}')

    # rotazione: oggi giovedì 26/11/2026 (settimana dal lunedì 23/11)
    date = ['2026-11-26', '2026-11-24', '2026-11-19', '2026-11-12', '2026-10-01', '2026-09-30', '2026-09-03',
            '2025-12-31', '2025-11-30', '2025-11-02', '2027-01-01']
    k = da_tenere(date, '2026-11-26')
    # settimane 23/11 → 26; 16/11 → 19; 9/11 → 12; 28/9 → 1/10 (30/9 stessa settimana, più vecchia)
    # mesi da dic 2025 a nov 2026: nov 26, ott 1/10, set 30/9, dic 2025 31/12; nov 2025 è il 13° mese: fuori; futura tenuta
    t('rotazione', k == {'2026-11-26', '2026-11-19', '2026-11-12', '2026-10-01', '2026-09-30', '2025-12-31', '2027-01-01'}, sorted(k))
    t('rotazione vuota', da_tenere([], '2026-11-26') == set())
    # 20 settimane di fila (una copia ogni lunedì): 8 settimanali + i mesi più vecchi
    lunedi = [(dt.date(2026, 11, 23) - dt.timedelta(weeks=i)).isoformat() for i in range(20)]
    k2 = da_tenere(lunedi, '2026-11-26')
    # le ultime 8 (dal 5/10 al 23/11) + l'ultima di settembre (28/9), agosto (31/8), luglio (27/7; 6/7 è la ventesima)
    t('rotazione 20 settimane', sorted(k2) == sorted(lunedi[:8] + ['2026-09-28', '2026-08-31', '2026-07-27']), sorted(k2))

    finti = {'campi': [{'id': 'c1', 'nome': 'Campo di prova', 'allegati': [{'id': 'a1', 'tipo': 'image/jpeg'}]}],
             'note': [{'id': 'n1', 'testo': 'x', 'allegati': [{'id': 'a1'}, {'id': 'a2', 'tipo': 'application/pdf'}, {'id': '../male'}]}],
             'econfig': [{'id': 'do-ab12', 'impronta': 'ab12', 'copia': True, 'mime': 'application/pdf'}, {'id': 'do-cd34', 'impronta': 'cd34', 'copia': False}],
             'fatture': []}
    al = allegati_di(finti)
    t('allegati nominati', sorted(al) == ['a1', 'a2', 'conti/ab12'], sorted(al))
    t('tipo del primo', al['a1'] == 'image/jpeg')

    with tempfile.TemporaryDirectory() as d:
        CARTELLA = Path(d)
        r = salva_copia({'dati': finti, 'versione': '9.9.9'}, oggi=dt.date(2026, 11, 26))
        t('copia salvata', (Path(d) / 'copia-2026-11-26.json.gz').exists())
        t('conteggi', r['conteggi'] == {'campi': 1, 'note': 1, 'econfig': 2, 'fatture': 0} and r['registrazioni'] == 4, r)
        t('mancanti tutti', sorted(x['id'] for x in r['mancanti']) == ['a1', 'a2', 'conti/ab12'])
        dati = leggi_copia('copia-2026-11-26.json.gz')
        t('copia uguale', dati['campi'] == finti['campi'] and dati['_copia']['versione'] == '9.9.9')
        b = b'%PDF-finto'
        s = salva_allegato({'id': 'conti/ab12', 'tipo': 'application/pdf', 'dati': base64.b64encode(b).decode()})
        t('allegato salvato', s == {'id': 'conti/ab12', 'byte': len(b), 'gia': False} and (Path(d) / 'allegati' / 'conti__ab12').read_bytes() == b)
        t('allegato già presente', salva_allegato({'id': 'conti/ab12', 'dati': 'xx'})['gia'] is True)
        t('sha nell indice', _indice()['conti/ab12']['sha256'] == hashlib.sha256(b).hexdigest())
        r2 = salva_copia({'dati': finti}, oggi=dt.date(2026, 11, 26))
        t('mancanti dopo', sorted(x['id'] for x in r2['mancanti']) == ['a1', 'a2'])
        (Path(d) / 'allegati' / 'conti__ab12').rename(Path(d) / 'spostato')        # file sparito: torna fra i mancanti
        t('mancante se sparito', 'conti/ab12' in [x['id'] for x in salva_copia({'dati': finti}, oggi=dt.date(2026, 11, 26))['mancanti']])
        (Path(d) / 'spostato').rename(Path(d) / 'allegati' / 'conti__ab12')
        for cattivo in ({'id': '../x', 'dati': 'eA=='}, {'id': 'a3', 'dati': 'non base64!'}, {'id': 'a3', 'dati': ''}):
            try:
                salva_allegato(cattivo)
                t('allegato rifiutato ' + cattivo['id'], False)
            except Errore as e:
                t('allegato rifiutato ' + cattivo['id'], e.codice == 400)
        for cattivo in ({}, {'dati': []}, {'dati': {'campi': []}}, {'dati': {'Campi!': []}}, {'dati': {'campi': {}}}):
            try:
                salva_copia(cattivo)
                t('copia rifiutata ' + str(cattivo), False)
            except Errore as e:
                t('copia rifiutata ' + str(cattivo), e.codice == 400)
        # rotazione sulla cartella: una copia vecchia di 2 anni si toglie, la settimana prima resta
        for v in ('2024-11-20', '2026-11-19'):
            _scrivi(Path(d) / f'copia-{v}.json.gz', gzip.compress(b'{"campi":[{"id":"x"}]}'))
        r3 = salva_copia({'dati': finti}, oggi=dt.date(2026, 11, 26))
        t('rotazione nella cartella', r3['tolte'] == ['copia-2024-11-20.json.gz'] and (Path(d) / 'copia-2026-11-19.json.gz').exists(), r3['tolte'])
        e = elenco()
        t('elenco', [c['data'] for c in e['copie']] == ['2026-11-26', '2026-11-19'] and e['copie'][0]['registrazioni'] == 4 and e['allegati_salvati'] == 1, e)
        t('niente file a metà', not list(Path(d).glob('*.tmp')))
    print(f'Copie di sicurezza: {"tutte le prove passano" if not falliti else str(len(falliti)) + " prove non passano"}')
    return not falliti


if __name__ == '__main__':
    if '--prova' in sys.argv:
        sys.exit(0 if _prove() else 1)
    print(__doc__)
