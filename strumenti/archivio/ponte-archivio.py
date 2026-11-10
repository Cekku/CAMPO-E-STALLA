"""Ponte tra l'app Campo e Stalla e l'archivio dei documenti sul PC (catalogo di archivio.py).

Ascolta su http://127.0.0.1:1236, solo su questo computer: dagli altri dispositivi della rete non si raggiunge.
Risponde solo alle pagine dell'app (https://cekku.github.io o il server di prova in locale): un sito qualsiasi
aperto nel browser non può leggere il catalogo né aprire file. I dati non escono dal PC: l'app li mostra e basta.

Richieste (risposte JSON, contratto descritto in CLAUDE.md, sezione "Archivio documenti"):
  GET  /stato                 numeri del catalogo
  GET  /aree                  aree e sottoaree con i conteggi
  GET  /valori                anni, tipi, controparti e persone (per i filtri), con ?area=02 o ?area=02.3
  GET  /documenti             elenco e ricerca: ?q= &area= &anno= &tipo= &controparte= &persona= &stato=
                              &dove=fuori|azienda &ordina=data|-data|nome|aggiornato &limite= &inizio=
  GET  /documenti/<id>        scheda di un documento con copie, testo (inizio) e registro
  GET  /registro              ultime operazioni (?limite=)
  POST /apri                  {"id": 123, "percorso": "...facoltativo", "cartella": false} apre il file originale
  POST /correzioni            {"123": {"a": "02.3", "t": "F24", ...}} come "archivio.py applica", fatte dall'utente

Avvio: doppio clic su "Archivio - ponte.bat" (oppure: python ponte-archivio.py).
"""
import http.server
import json
import os
import re
import socketserver
import subprocess
import sys
import urllib.parse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import archivio as A  # noqa: E402

VERSIONE = 1
PORTA = 1236
ORIGINI = {
    'https://cekku.github.io',
    'http://localhost:8765',
    'http://127.0.0.1:8765',
}
HOST_OK = {f'127.0.0.1:{PORTA}', f'localhost:{PORTA}'}
NON_APRIRE = {'.exe', '.msi', '.bat', '.cmd', '.com', '.ps1', '.vbs', '.vbe', '.js', '.jse', '.wsf', '.wsh', '.hta',
              '.lnk', '.url', '.scr', '.pif', '.cpl', '.jar', '.reg', '.dll', '.sys', '.application', '.appref-ms'}
MAX_LIMITE = 500
TESTO_SCHEDA = 6000


def _config():
    try:
        with open(A.CONFIG, encoding='utf-8') as f:
            c = json.load(f)
    except (OSError, ValueError):
        c = {}
    p = c.get('archivio_principale') or ''
    return A.chiave(p) + os.sep if p else None


def _db():
    if not os.path.exists(A.DB):
        raise Errore(503, f'Catalogo non trovato ({A.DB}): fai prima "archivio.py scansiona"')
    db = A.sqlite3.connect(A.DB, timeout=15)
    db.row_factory = A.sqlite3.Row
    db.execute('PRAGMA busy_timeout=15000')
    A.aggiorna_schema(db)
    return db


class Errore(Exception):
    def __init__(self, codice, testo):
        super().__init__(testo)
        self.codice, self.testo = codice, testo


CODICI = A.codici_aree()                         # '02.3' -> ('02 Fisco e contabilità', 'F24 e F23')
INVERSO = {v: k for k, v in CODICI.items()}       # (area, sotto) -> '02.3'


def codice_di(area, sotto):
    return INVERSO.get((area, sotto)) or INVERSO.get((area, None)) or (area[:2] if area else None)


def _in_archivio(percorso, princ):
    return bool(princ) and A.chiave(percorso).startswith(princ)


def _iso(ts):
    import datetime as dt
    return dt.datetime.fromtimestamp(ts).isoformat(timespec='seconds') if ts else None


# ---------------------------------------------------------------- lettura

def stato(_q):
    db = _db()
    q = lambda s: db.execute(s).fetchone()[0]
    ult = db.execute("SELECT quando FROM registro WHERE azione='scansione' ORDER BY id DESC LIMIT 1").fetchone()
    agg = db.execute("SELECT quando, dettagli FROM registro WHERE azione='aggiornamento' ORDER BY id DESC LIMIT 1").fetchone()
    out = {
        'versione': VERSIONE,
        'contenuti': q('SELECT COUNT(*) FROM contenuti'),
        'file_presenti': q('SELECT COUNT(*) FROM file WHERE presente=1'),
        'file_spariti': q('SELECT COUNT(*) FROM file WHERE presente=0'),
        'per_stato': {r[0] or '': r[1] for r in db.execute('SELECT stato, COUNT(*) FROM contenuti GROUP BY stato')},
        'per_classificato_da': {r[0] or '': r[1] for r in db.execute('SELECT classificato_da, COUNT(*) FROM contenuti GROUP BY 1')},
        'ultima_scansione': ult[0] if ult else None,
        'ultimo_aggiornamento': ({'quando': agg[0], **json.loads(agg[1] or '{}')} if agg else None),
    }
    db.close()
    return out


def aree(_q):
    db = _db(); princ = _config()
    conta = {}
    righe = db.execute("SELECT c.area, c.sotto, c.stato, "
                       "(SELECT GROUP_CONCAT(percorso, char(10)) FROM file f WHERE f.impronta=c.impronta AND f.presente=1) p "
                       "FROM contenuti c WHERE c.area IS NOT NULL").fetchall()
    for r in righe:
        if not r['p']:
            continue
        fuori = not any(_in_archivio(x, princ) for x in r['p'].split('\n'))
        ka, ks = codice_di(r['area'], None), codice_di(r['area'], r['sotto'])
        for k in ({ka, ks}):                             # senza sottoarea conta una volta sola
            n = conta.setdefault(k, {'n': 0, 'da_rivedere': 0, 'fuori': 0})
            n['n'] += 1; n['da_rivedere'] += r['stato'] == 'da_rivedere'; n['fuori'] += fuori
    vuoto = {'n': 0, 'da_rivedere': 0, 'fuori': 0}
    out = []
    for k, (a, s) in CODICI.items():
        if s is None:
            out.append({'codice': k, 'nome': a[3:], **conta.get(k, vuoto), 'sotto': []})
        else:
            out[-1]['sotto'].append({'codice': k, 'nome': s, **conta.get(k, vuoto)})
    senza = db.execute("SELECT COUNT(*) FROM contenuti WHERE area IS NULL").fetchone()[0]
    db.close()
    return {'aree': out, 'senza_area': senza}


def _filtri(q, princ):
    """Condizioni SQL dai parametri dell'indirizzo (sempre con segnaposto, mai testo dentro la richiesta)."""
    w, par = ["EXISTS (SELECT 1 FROM file f WHERE f.impronta=c.impronta AND f.presente=1)"], []
    if q.get('spariti') == '1':
        w = []
    a = q.get('area')
    if a:
        if a not in CODICI:
            raise Errore(400, f'area sconosciuta: {a}')
        area, sotto = CODICI[a]
        w.append('c.area=?'); par.append(area)
        if sotto:
            w.append('c.sotto=?'); par.append(sotto)
    for k, col in (('tipo', 'c.tipo'), ('controparte', 'c.controparte'), ('persona', 'c.persona'),
                   ('stato', 'c.stato'), ('classificato_da', 'c.classificato_da'), ('genere', 'c.genere')):
        v = q.get(k)
        if v == '-':
            w.append(f'{col} IS NULL')
        elif v:
            w.append(f'{col}=?'); par.append(v)
    if q.get('anno'):
        if not re.fullmatch(r'\d{4}|-', q['anno']):
            raise Errore(400, 'anno non valido')
        if q['anno'] == '-':
            w.append('c.anno IS NULL')
        else:
            w.append('c.anno=?'); par.append(int(q['anno']))
    if q.get('dove') in ('fuori', 'azienda') and princ:
        dentro = ("EXISTS (SELECT 1 FROM file f WHERE f.impronta=c.impronta AND f.presente=1 "
                  "AND lower(substr(f.percorso, 1, ?))=?)")
        w.append(dentro if q['dove'] == 'azienda' else 'NOT ' + dentro)
        par += [len(princ), princ.lower()]
    return w, par


def _fts(testo):
    """Parole cercate -> espressione FTS5: tutte le parole, l'ultima anche come inizio di parola."""
    parole = [p for p in re.split(r'[\s"*():^+\-]+', testo) if p]
    if not parole:
        return None
    parti = ['"' + p + '"' for p in parole[:-1]] + ['"' + parole[-1] + '"*']
    return ' '.join(parti)


def _doc(r, princ, copie=None):
    p = r['percorso_scelto'] or (copie[0] if copie else '') or ''
    nome_file = os.path.basename(p)
    return {
        'id': r['id'], 'impronta': r['impronta'],
        'nome': r['nome_proposto'] or nome_file, 'nome_proposto': r['nome_proposto'],
        'nome_file': nome_file, 'cartella': os.path.dirname(p), 'estensione': os.path.splitext(nome_file)[1].lower(),
        'genere': r['genere'], 'dimensione': r['dimensione'],
        'codice': codice_di(r['area'], r['sotto']), 'area': r['area'], 'sotto': r['sotto'],
        'tipo': r['tipo'], 'data': r['data_doc'], 'anno': r['anno'], 'controparte': r['controparte'],
        'persona': r['persona'], 'descrizione': r['descrizione'], 'confidenza': r['confidenza'],
        'stato': r['stato'], 'classificato_da': r['classificato_da'], 'aggiornato': r['aggiornato'],
        'copie': len(copie) if copie is not None else None,
        'in_archivio': any(_in_archivio(x, princ) for x in (copie or [])),
    }


ORDINI = {'data': 'c.data_doc IS NULL, c.data_doc, c.anno', '-data': 'c.data_doc IS NULL, c.data_doc DESC, c.anno DESC',
          'nome': 'lower(coalesce(c.nome_proposto, c.percorso_scelto))', 'aggiornato': 'c.aggiornato DESC'}


def documenti(q):
    db = _db(); princ = _config()
    w, par = _filtri(q, princ)
    try:
        limite = max(1, min(MAX_LIMITE, int(q.get('limite') or 50)))
        inizio = max(0, int(q.get('inizio') or 0))
    except ValueError:
        raise Errore(400, 'limite o inizio non validi')
    ordina = q.get('ordina') or '-data'
    if ordina not in ORDINI:
        raise Errore(400, f'ordine sconosciuto: {ordina}')
    fts = _fts(q.get('q') or '')
    if fts:
        base = ("FROM ricerca JOIN contenuti c ON c.impronta=ricerca.impronta WHERE ricerca MATCH ?"
                + ''.join(' AND ' + x for x in w))
        par = [fts] + par
        sel = ("SELECT c.rowid id, c.*, snippet(ricerca, 2, '[', ']', ' … ', 14) estratto, "
               "snippet(ricerca, 1, '[', ']', ' … ', 8) nel_nome ")
        ordine = 'rank' if not q.get('ordina') else ORDINI[ordina]
    else:
        base = 'FROM contenuti c' + (' WHERE ' + ' AND '.join(w) if w else '')
        sel = 'SELECT c.rowid id, c.* '
        ordine = ORDINI[ordina]
    try:
        totale = db.execute('SELECT COUNT(*) ' + base, par).fetchone()[0]
        righe = db.execute(f'{sel}{base} ORDER BY {ordine} LIMIT ? OFFSET ?', par + [limite, inizio]).fetchall()
    except A.sqlite3.OperationalError as e:
        raise Errore(400, f'ricerca non valida: {e}')
    copie = {}
    if righe:
        imps = [r['impronta'] for r in righe]
        for f in db.execute(f"SELECT impronta, percorso FROM file WHERE presente=1 AND impronta IN ({','.join('?' * len(imps))})", imps):
            copie.setdefault(f['impronta'], []).append(f['percorso'])
    out = []
    for r in righe:
        d = _doc(r, princ, copie.get(r['impronta'], []))
        if fts:
            e = ' '.join((r['estratto'] or '').split())
            d['estratto'] = e if '[' in e else None
            d['trovato_nel_nome'] = '[' in (r['nel_nome'] or '')
        out.append(d)
    db.close()
    return {'totale': totale, 'inizio': inizio, 'limite': limite, 'documenti': out}


def valori(q):
    db = _db(); princ = _config()
    w, par = _filtri({k: v for k, v in q.items() if k in ('area', 'dove', 'spariti')}, princ)
    dove = (' WHERE ' + ' AND '.join(w)) if w else ''
    out = {}
    for k, col, lim in (('anni', 'anno', 100), ('tipi', 'tipo', 300), ('controparti', 'controparte', 300), ('persone', 'persona', 300)):
        rows = db.execute(f'SELECT c.{col} v, COUNT(*) n FROM contenuti c{dove}{" AND" if w else " WHERE"} c.{col} IS NOT NULL '
                          f'GROUP BY c.{col} ORDER BY {"v DESC" if col == "anno" else "n DESC, v"} LIMIT {lim}', par).fetchall()
        out[k] = [{'v': r['v'], 'n': r['n']} for r in rows]
    out['stati'] = [{'v': r['v'], 'n': r['n']} for r in
                    db.execute(f'SELECT c.stato v, COUNT(*) n FROM contenuti c{dove} GROUP BY c.stato ORDER BY n DESC', par)]
    out['codici'] = [{'codice': k, 'area': a, 'sotto': s} for k, (a, s) in CODICI.items()]
    db.close()
    return out


def scheda(id_):
    db = _db(); princ = _config()
    r = A.trova_contenuto(db, id_)
    if not r:
        raise Errore(404, 'documento non trovato')
    files = db.execute('SELECT percorso, sorgente, presente, modificato, visto FROM file WHERE impronta=? '
                       'ORDER BY presente DESC, length(percorso)', (r['impronta'],)).fetchall()
    presenti = [f['percorso'] for f in files if f['presente']]
    d = _doc(r, princ, presenti)
    d['copie_elenco'] = [{'percorso': f['percorso'], 'nome': os.path.basename(f['percorso']),
                          'cartella': os.path.dirname(f['percorso']), 'sorgente': f['sorgente'],
                          'presente': bool(f['presente']), 'modificato': _iso(f['modificato']),
                          'in_archivio': _in_archivio(f['percorso'], princ)} for f in files]
    d['fonte'] = r['fonte']; d['primo_visto'] = r['primo_visto']
    t = db.execute('SELECT esito, metodo, pagine, caratteri, testo FROM testi WHERE impronta=?', (r['impronta'],)).fetchone()
    if t and r['stato'] != 'riservato' and t['esito'] != 'riservato':
        d['testo'] = {'esito': t['esito'], 'metodo': t['metodo'], 'pagine': t['pagine'], 'caratteri': t['caratteri'],
                      'inizio': (t['testo'] or '')[:TESTO_SCHEDA]}
    else:
        d['testo'] = {'esito': (t['esito'] if t else None), 'riservato': r['stato'] == 'riservato'}
    d['registro'] = [{'quando': x['quando'], 'chi': x['chi'], 'azione': x['azione'], 'percorso': x['percorso'],
                      'dettagli': json.loads(x['dettagli']) if x['dettagli'] else None}
                     for x in db.execute('SELECT * FROM registro WHERE impronta=? ORDER BY id DESC LIMIT 50', (r['impronta'],))]
    db.close()
    return d


def registro(q):
    db = _db()
    try:
        lim = max(1, min(500, int(q.get('limite') or 50)))
    except ValueError:
        raise Errore(400, 'limite non valido')
    out = []
    for x in db.execute('SELECT r.*, c.rowid cid, c.nome_proposto FROM registro r LEFT JOIN contenuti c USING(impronta) '
                        'ORDER BY r.id DESC LIMIT ?', (lim,)):
        out.append({'quando': x['quando'], 'chi': x['chi'], 'azione': x['azione'], 'id': x['cid'],
                    'nome': x['nome_proposto'], 'percorso': x['percorso'],
                    'dettagli': json.loads(x['dettagli']) if x['dettagli'] else None})
    db.close()
    return {'registro': out}


# ---------------------------------------------------------------- scrittura e apertura

def apri(corpo):
    if not isinstance(corpo, dict) or 'id' not in corpo:
        raise Errore(400, 'manca "id"')
    db = _db()
    r = A.trova_contenuto(db, corpo['id'])
    if not r:
        raise Errore(404, 'documento non trovato')
    presenti = [f[0] for f in db.execute('SELECT percorso FROM file WHERE impronta=? AND presente=1 ORDER BY length(percorso)',
                                         (r['impronta'],))]
    db.close()
    voluto = corpo.get('percorso')
    if voluto:
        scelti = [p for p in presenti if A.chiave(p) == A.chiave(str(voluto))]
        if not scelti:
            raise Errore(404, 'questa copia non è nel catalogo')     # si aprono solo file del catalogo
    else:
        pref = r['percorso_scelto']
        scelti = sorted(presenti, key=lambda p: (A.chiave(p) != A.chiave(pref or ''), len(p)))
    scelti = [p for p in scelti if os.path.isfile(p)]
    if not scelti:
        raise Errore(410, 'il file non c\'è più in quella cartella: rifai la scansione')
    p = scelti[0]
    if os.path.splitext(p)[1].lower() in NON_APRIRE:
        raise Errore(403, 'tipo di file che il ponte non apre')
    if corpo.get('cartella'):
        subprocess.Popen(['explorer', '/select,', os.path.normpath(p)])
    else:
        os.startfile(p)
    return {'aperto': p, 'cartella': bool(corpo.get('cartella'))}


def correzioni(corpo):
    if not isinstance(corpo, dict) or not corpo:
        raise Errore(400, 'servono le correzioni: {"id": {"a": "02.3", ...}}')
    if len(corpo) > 1000:
        raise Errore(413, 'troppe correzioni in una volta (massimo 1000)')
    db = _db(); princ = _config()
    try:
        fatti, errori = A.applica_correzioni(db, corpo, 'utente')
        if fatti:
            A.registra(db, 'correzioni dall\'app', chi='utente', contenuti=len(fatti), errori=len(errori))
        db.commit()
        aggiornati = []
        for i in fatti:
            r = db.execute('SELECT rowid id, * FROM contenuti WHERE rowid=?', (i,)).fetchone()
            copie = [f[0] for f in db.execute('SELECT percorso FROM file WHERE impronta=? AND presente=1', (r['impronta'],))]
            aggiornati.append(_doc(r, princ, copie))
    finally:
        db.close()
    return {'aggiornati': aggiornati, 'errori': errori}


# ---------------------------------------------------------------- server

LETTURE = {'/stato': stato, '/aree': aree, '/valori': valori, '/documenti': documenti, '/registro': registro}
SCRITTURE = {'/apri': apri, '/correzioni': correzioni}


class Ponte(http.server.BaseHTTPRequestHandler):
    server_version = 'PonteArchivio/1.0'

    def _origine(self):
        o = self.headers.get('Origin')
        return o if o in ORIGINI else None

    def _cors(self, origine):
        self.send_header('Access-Control-Allow-Origin', origine)
        self.send_header('Vary', 'Origin')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'content-type')
        self.send_header('Access-Control-Allow-Private-Network', 'true')
        self.send_header('Access-Control-Max-Age', '600')

    def _json(self, codice, dati, origine=None):
        corpo = json.dumps(dati, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
        self.send_response(codice)
        if origine:
            self._cors(origine)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Content-Length', str(len(corpo)))
        self.end_headers()
        self.wfile.write(corpo)

    def _controlli(self):
        if self.headers.get('Host') not in HOST_OK:          # contro il "DNS rebinding"
            self._json(403, {'errore': 'Host non ammesso'}); return None
        origine = self._origine()
        if not origine:
            self._json(403, {'errore': 'Origine non ammessa'}); return None
        return origine

    def do_OPTIONS(self):
        origine = self._controlli()
        if not origine:
            return
        self.send_response(204)
        self._cors(origine)
        self.send_header('Content-Length', '0')
        self.end_headers()

    def _esegui(self, origine, fn, arg):
        try:
            self._json(200, fn(arg), origine)
        except Errore as e:
            self._json(e.codice, {'errore': e.testo}, origine)
        except Exception as e:                              # niente traccia completa verso il browser
            self.log_message('ERRORE %s: %s', type(e).__name__, e)
            self._json(500, {'errore': f'{type(e).__name__}: {e}'}, origine)

    def do_GET(self):
        origine = self._controlli()
        if not origine:
            return
        u = urllib.parse.urlsplit(self.path)
        q = {k: v[-1] for k, v in urllib.parse.parse_qs(u.query).items()}
        m = re.fullmatch(r'/documenti/([0-9a-f]{64}|\d{1,9})', u.path)
        if m:
            return self._esegui(origine, scheda, m[1])
        fn = LETTURE.get(u.path)
        if not fn:
            return self._json(404, {'errore': 'richiesta sconosciuta'}, origine)
        self._esegui(origine, fn, q)

    def do_POST(self):
        origine = self._controlli()
        if not origine:
            return
        fn = SCRITTURE.get(urllib.parse.urlsplit(self.path).path)
        if not fn:
            return self._json(404, {'errore': 'richiesta sconosciuta'}, origine)
        if not (self.headers.get('Content-Type') or '').lower().startswith('application/json'):
            return self._json(415, {'errore': 'serve Content-Type: application/json'}, origine)
        n = int(self.headers.get('Content-Length') or 0)
        if n > 2_000_000:
            return self._json(413, {'errore': 'richiesta troppo grande'}, origine)
        try:
            corpo = json.loads(self.rfile.read(n) or b'null')
        except ValueError:
            return self._json(400, {'errore': 'JSON non valido'}, origine)
        self._esegui(origine, fn, corpo)

    def log_message(self, fmt, *args):
        sys.stdout.write('%s  %s\n' % (self.log_date_time_string(), fmt % args))


class Server(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = False


if __name__ == '__main__':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass
    try:
        srv = Server(('127.0.0.1', PORTA), Ponte)
    except OSError:
        sys.exit(f'La porta {PORTA} è già in uso: il ponte è forse già acceso.')
    print(f'Ponte dell\'archivio attivo su http://127.0.0.1:{PORTA}  (catalogo: {A.DB})')
    print('Lascia aperta questa finestra mentre usi l\'archivio nell\'app. Ctrl+C per fermarlo.')
    srv.serve_forever()
