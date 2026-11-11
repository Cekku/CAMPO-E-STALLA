"""Archivio dei documenti dell'azienda (Campo e Stalla) - parte che gira sul PC.

Tiene un catalogo dei documenti sparsi nelle cartelle del computer SENZA copiarli né spostarli:
per ogni file salva dove si trova e un'impronta del contenuto (SHA-256). Con l'impronta:
  - riconosce i doppioni anche se hanno nomi diversi;
  - ritrova un file anche se lo sposti o lo rinomini;
  - la classificazione (area, tipo, data, nome proposto) vale per il contenuto, non per la copia.

I dati veri (catalogo, impostazioni con le cartelle, registro) stanno in una cartella del PC
fuori dal repository e fuori da OneDrive: di solito %USERPROFILE%\\ArchivioAzienda
(si cambia con la variabile d'ambiente ARCHIVIO_DATI). Il repository è pubblico: qui solo il codice.

Comandi:
  python archivio.py scansiona   legge le cartelle e aggiorna il catalogo (solo lettura sui file)
  python archivio.py doppioni    riepilogo dei doppioni e foglio Excel "doppioni.xlsx"
  python archivio.py leggi       estrae il testo dei contenuti non ancora letti (una volta per impronta)
  python archivio.py ocr         legge con Tesseract le scansioni e le foto (--prova N per provarne N)
  python archivio.py classifica  area, tipo, data, controparte e nome proposto (cartelle + regole; --tutto rifà anche
                                 quelli già classificati da Claude, dal modello sul PC o a mano)
  python archivio.py lotti / applica N file.json [chi]   revisione a lotti (vedi le funzioni)
  python archivio.py esporta     foglio Excel archivio-classificato.xlsx con la colonna "Correzione"
  python archivio.py correzioni-excel   applica quello che è scritto nella colonna "Correzione" dell'Excel
  python archivio.py llm         il modello sul PC (LM Studio) classifica i documenti a confidenza bassa
                                 (--prova N, --id N); mai i documenti riservati
  python archivio.py aggiorna    file nuovi: scansiona + leggi + ocr + classifica (solo nuovi) + llm
                                 (--log per scrivere in aggiorna-log.txt, --senza-llm)
  python archivio.py nuovi       come aggiorna, ma prima accende LM Studio e carica il modello (ia_locale.py)
  python archivio.py modelli     modelli che LM Studio ha sul PC
  python archivio.py prova-ia N  prova del modello su N documenti già rivisti da Claude: accuratezza e secondi
                                 (--modello NOME, --metodo archivio|fisso, --confronta per la tabella delle prove)
  python archivio.py cerca PAROLE   cerca nel testo e nei nomi dei file (es. cerca parmalat 2024)
  python archivio.py stato       numeri del catalogo
"""
import datetime as dt
import hashlib
import json
import os
import re
import sqlite3
import stat
import sys
import time

DATI = os.environ.get('ARCHIVIO_DATI') or os.path.join(os.path.expanduser('~'), 'ArchivioAzienda')
DB = os.path.join(DATI, 'archivio.db')
CONFIG = os.path.join(DATI, 'config.json')

GENERI = {
    'documento': {'.pdf', '.doc', '.docx', '.odt', '.rtf', '.txt', '.xls', '.xlsx', '.xlsm', '.ods', '.csv',
                  '.p7m', '.xml', '.eml', '.msg', '.ppt', '.pptx', '.pub', '.html', '.htm', '.ics'},
    'immagine': {'.jpg', '.jpeg', '.png', '.heic', '.tif', '.tiff', '.bmp', '.gif', '.webp'},
    'archivio': {'.zip', '.rar', '.7z', '.gz', '.tar'},
}

CONFIG_BASE = {
    'sorgenti': [],                 # [{"nome": "Desktop", "percorso": "C:\\..."}]
    'archivio_principale': '',      # cartella di riferimento per "è già archiviato?"
    'escludi_percorsi': [],         # cartelle intere da saltare
    'escludi_cartelle': ['.git', 'node_modules', '.claude', '.venv', 'venv', '__pycache__', '$RECYCLE.BIN'],
    'escludi_estensioni': ['.exe', '.msi', '.lnk', '.url', '.jnlp', '.bat', '.cmd', '.ps1', '.ini', '.dat',
                           '.tmp', '.crdownload', '.part', '.dll', '.sys'],
    'escludi_nomi': ['desktop.ini', 'thumbs.db', '.ds_store'],
}

# Attributi dei file "solo online" di OneDrive: leggerli farebbe scaricare il file.
SOLO_ONLINE = 0x400000 | 0x40000 | 0x1000   # RECALL_ON_DATA_ACCESS | RECALL_ON_OPEN | OFFLINE

SCHEMA = """
CREATE TABLE IF NOT EXISTS contenuti (
  impronta TEXT PRIMARY KEY,
  dimensione INTEGER NOT NULL,
  genere TEXT NOT NULL,
  primo_visto TEXT NOT NULL,
  area TEXT, tipo TEXT, data_doc TEXT, controparte TEXT, nome_proposto TEXT,
  stato TEXT NOT NULL DEFAULT 'da_leggere',
  classificato_da TEXT, aggiornato TEXT
);
CREATE TABLE IF NOT EXISTS file (
  id INTEGER PRIMARY KEY,
  percorso TEXT NOT NULL UNIQUE,
  sorgente TEXT NOT NULL,
  impronta TEXT NOT NULL REFERENCES contenuti(impronta),
  dimensione INTEGER NOT NULL,
  modificato REAL NOT NULL,
  estensione TEXT NOT NULL,
  presente INTEGER NOT NULL DEFAULT 1,
  visto TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS file_impronta ON file(impronta);
CREATE TABLE IF NOT EXISTS testi (
  impronta TEXT PRIMARY KEY REFERENCES contenuti(impronta),
  esito TEXT NOT NULL,
  metodo TEXT,
  pagine INTEGER,
  caratteri INTEGER NOT NULL DEFAULT 0,
  testo TEXT,
  errore TEXT,
  letto TEXT NOT NULL
);
CREATE VIRTUAL TABLE IF NOT EXISTS ricerca USING fts5(
  impronta UNINDEXED, nomi, testo, tokenize = 'unicode61 remove_diacritics 2'
);
CREATE TABLE IF NOT EXISTS registro (
  id INTEGER PRIMARY KEY,
  quando TEXT NOT NULL,
  chi TEXT NOT NULL,
  azione TEXT NOT NULL,
  impronta TEXT, percorso TEXT, dettagli TEXT
);
"""


def adesso():
    return dt.datetime.now().isoformat(timespec='seconds')


def chiave(p):
    """Percorso confrontabile su Windows (maiuscole/minuscole e barre non contano)."""
    return os.path.normcase(os.path.normpath(p))


def genere(est):
    for g, estensioni in GENERI.items():
        if est in estensioni:
            return g
    return 'altro'


def carica_config():
    if not os.path.exists(CONFIG):
        os.makedirs(DATI, exist_ok=True)
        with open(CONFIG, 'w', encoding='utf-8') as f:
            json.dump(CONFIG_BASE, f, ensure_ascii=False, indent=2)
        sys.exit(f'Ho creato le impostazioni vuote in {CONFIG}: scrivi le cartelle in "sorgenti" e riprova.')
    with open(CONFIG, encoding='utf-8') as f:
        c = json.load(f)
    for k, v in CONFIG_BASE.items():
        c.setdefault(k, v)
    if not c['sorgenti']:
        sys.exit(f'Nessuna cartella in "sorgenti" ({CONFIG}).')
    return c


def apri_db():
    os.makedirs(DATI, exist_ok=True)
    db = sqlite3.connect(DB)
    db.row_factory = sqlite3.Row
    db.execute('PRAGMA journal_mode=WAL')
    db.executescript(SCHEMA)
    return db


def registra(db, azione, impronta=None, percorso=None, chi='scansione', **dettagli):
    db.execute('INSERT INTO registro (quando, chi, azione, impronta, percorso, dettagli) VALUES (?,?,?,?,?,?)',
               (adesso(), chi, azione, impronta, percorso, json.dumps(dettagli, ensure_ascii=False) if dettagli else None))


def impronta_di(percorso):
    with open(percorso, 'rb') as f:
        return hashlib.file_digest(f, 'sha256').hexdigest()


def cammina(cfg):
    """Restituisce (sorgente, percorso) dei file da catalogare, saltando le esclusioni."""
    via_percorsi = {chiave(p) for p in cfg['escludi_percorsi']}
    via_cartelle = {c.lower() for c in cfg['escludi_cartelle']}
    via_est = {e.lower() for e in cfg['escludi_estensioni']}
    via_nomi = {n.lower() for n in cfg['escludi_nomi']}
    for s in cfg['sorgenti']:
        radice = os.path.normpath(s['percorso'])
        if not os.path.isdir(radice):
            print(f'  ATTENZIONE: la cartella {radice} non esiste, la salto')
            continue
        for cart, sotto, nomi in os.walk(radice, onerror=lambda e: print(f'  non leggibile: {e.filename}')):
            sotto[:] = [d for d in sotto
                        if d.lower() not in via_cartelle and chiave(os.path.join(cart, d)) not in via_percorsi]
            for n in nomi:
                nl = n.lower()
                if nl in via_nomi or nl.startswith('~$') or os.path.splitext(nl)[1] in via_est:
                    continue
                yield s['nome'], os.path.join(cart, n)


def scansiona():
    cfg = carica_config()
    db = apri_db()
    noti = {chiave(r['percorso']): r for r in db.execute('SELECT * FROM file')}
    visti = set()
    nuove_impronte = {}          # impronta -> percorso, per riconoscere gli spostamenti
    n = {'file': 0, 'letti': 0, 'invariati': 0, 'nuovi': 0, 'modificati': 0, 'solo_online': 0, 'errori': 0}
    errori = []
    t0 = time.time()
    quando = adesso()
    print(f'Catalogo: {DB}')
    for sorgente, p in cammina(cfg):
        n['file'] += 1
        if n['file'] % 1000 == 0:
            print(f'  ... {n["file"]} file ({time.time() - t0:.0f} s)')
            db.commit()
        try:
            st = os.stat(p)
        except OSError as e:
            n['errori'] += 1; errori.append((p, str(e))); continue
        if getattr(st, 'st_file_attributes', 0) & SOLO_ONLINE:
            n['solo_online'] += 1
            continue
        k = chiave(p)
        visti.add(k)
        r = noti.get(k)
        if r and r['dimensione'] == st.st_size and abs(r['modificato'] - st.st_mtime) < 1:
            n['invariati'] += 1
            if not r['presente']:
                db.execute('UPDATE file SET presente=1, visto=? WHERE id=?', (quando, r['id']))
                registra(db, 'ricomparso', r['impronta'], p)
            else:
                db.execute('UPDATE file SET visto=? WHERE id=?', (quando, r['id']))
            continue
        try:
            imp = impronta_di(p)
        except OSError as e:
            n['errori'] += 1; errori.append((p, str(e))); continue
        n['letti'] += 1
        est = os.path.splitext(p)[1].lower()
        db.execute('INSERT OR IGNORE INTO contenuti (impronta, dimensione, genere, primo_visto) VALUES (?,?,?,?)',
                   (imp, st.st_size, genere(est), quando))
        if r:
            n['modificati'] += 1
            db.execute('UPDATE file SET impronta=?, dimensione=?, modificato=?, presente=1, visto=? WHERE id=?',
                       (imp, st.st_size, st.st_mtime, quando, r['id']))
            registra(db, 'modificato', imp, p, prima=r['impronta'])
        else:
            n['nuovi'] += 1
            db.execute('INSERT INTO file (percorso, sorgente, impronta, dimensione, modificato, estensione, visto) '
                       'VALUES (?,?,?,?,?,?,?)', (p, sorgente, imp, st.st_size, st.st_mtime, est, quando))
            nuove_impronte.setdefault(imp, p)
            if noti:   # alla prima scansione non riempiamo il registro di "nuovo"
                registra(db, 'nuovo', imp, p)

    # File che c'erano e non ci sono più (solo dentro le cartelle scansionate)
    radici = [chiave(s['percorso']) for s in cfg['sorgenti'] if os.path.isdir(s['percorso'])]
    spariti = spostati = 0
    for k, r in noti.items():
        if r['presente'] and k not in visti and any(k.startswith(x + os.sep) for x in radici):
            db.execute('UPDATE file SET presente=0 WHERE id=?', (r['id'],))
            dove = nuove_impronte.get(r['impronta'])
            if dove:
                spostati += 1; registra(db, 'spostato', r['impronta'], r['percorso'], verso=dove)
            else:
                spariti += 1; registra(db, 'sparito', r['impronta'], r['percorso'])
    registra(db, 'scansione', **n, spariti=spariti, spostati=spostati, secondi=round(time.time() - t0))
    db.commit()

    print(f'\nFatto in {time.time() - t0:.0f} s')
    print(f'  file trovati:      {n["file"]}')
    print(f'  nuovi:             {n["nuovi"]}')
    print(f'  modificati:        {n["modificati"]}')
    print(f'  invariati:         {n["invariati"]}')
    print(f'  spostati/rinominati: {spostati}')
    print(f'  spariti:           {spariti}')
    if n['solo_online']:
        print(f'  solo online (saltati, non scaricati): {n["solo_online"]}')
    if errori:
        print(f'  non letti:         {len(errori)}')
        for p, e in errori[:15]:
            print(f'     {p}: {e}')
    db.close()


def doppioni():
    cfg = carica_config()
    db = apri_db()
    princ = chiave(cfg['archivio_principale']) + os.sep if cfg['archivio_principale'] else None
    righe = db.execute('SELECT f.percorso, f.sorgente, f.impronta, f.dimensione, c.genere FROM file f '
                       'JOIN contenuti c USING(impronta) WHERE f.presente=1').fetchall()
    per_imp = {}
    for r in righe:
        per_imp.setdefault(r['impronta'], []).append(r)
    in_princ = lambda r: bool(princ) and chiave(r['percorso']).startswith(princ)

    gruppi = {k: v for k, v in per_imp.items() if len(v) > 1}
    copie_in_piu = sum(len(v) - 1 for v in gruppi.values())
    spreco = sum((len(v) - 1) * v[0]['dimensione'] for v in gruppi.values())

    print(f'File presenti:          {len(righe)}')
    print(f'Contenuti diversi:      {len(per_imp)}')
    print(f'Gruppi di doppioni:     {len(gruppi)}  ({copie_in_piu} copie in più, {spreco / 2**20:.0f} MB)')

    # Per ogni sorgente: quanti file sono già nell'archivio principale, quanti sono doppi altrove, quanti unici
    if princ:
        print(f'\nRispetto a {cfg["archivio_principale"]}:')
        print(f'  {"sorgente":<12} {"file":>6} {"già lì":>8} {"doppi altrove":>14} {"unici":>7}')
        for s in cfg['sorgenti']:
            fs = [r for r in righe if r['sorgente'] == s['nome'] and not in_princ(r)]
            gia = sum(1 for r in fs if any(in_princ(x) for x in per_imp[r['impronta']]))
            # contenuti unici fuori dall'archivio principale (contati una volta sola)
            fuori = {}
            for r in fs:
                if not any(in_princ(x) for x in per_imp[r['impronta']]):
                    fuori.setdefault(r['impronta'], []).append(r)
            altrove = sum(len(v) - 1 for v in fuori.values())
            print(f'  {s["nome"]:<12} {len(fs):>6} {gia:>8} {altrove:>14} {len(fuori):>7}')

    # Contenuti da classificare: non ancora nell'archivio principale, per genere
    da_fare = {}
    for imp, v in per_imp.items():
        if not any(in_princ(x) for x in v):
            g = v[0]['genere']
            da_fare[g] = da_fare.get(g, 0) + 1
    if princ:
        print('\nContenuti fuori dall\'archivio principale (ognuno contato una volta):')
        for g, c in sorted(da_fare.items(), key=lambda x: -x[1]):
            print(f'  {g:<10} {c}')

    scrivi_foglio(gruppi, in_princ)
    db.close()


def scrivi_foglio(gruppi, in_princ):
    righe = []
    for i, (imp, v) in enumerate(sorted(gruppi.items(), key=lambda x: (-len(x[1]), x[1][0]['percorso'])), 1):
        for r in sorted(v, key=lambda r: (not in_princ(r), r['percorso'])):
            righe.append([i, len(v), round(r['dimensione'] / 1024), r['sorgente'], 'sì' if in_princ(r) else '',
                          os.path.basename(r['percorso']), os.path.dirname(r['percorso']), imp[:12]])
    intest = ['Gruppo', 'Copie', 'KB', 'Sorgente', 'Già in archivio', 'Nome file', 'Cartella', 'Impronta']
    try:
        from openpyxl import Workbook
        from openpyxl.styles import Font
    except ImportError:
        import csv
        out = os.path.join(DATI, 'doppioni.csv')
        with open(out, 'w', newline='', encoding='utf-8-sig') as f:
            w = csv.writer(f, delimiter=';'); w.writerow(intest); w.writerows(righe)
    else:
        out = os.path.join(DATI, 'doppioni.xlsx')
        wb = Workbook(); ws = wb.active; ws.title = 'Doppioni'
        ws.append(intest)
        for c in ws[1]:
            c.font = Font(bold=True)
        for r in righe:
            ws.append(r)
        ws.auto_filter.ref = ws.dimensions
        ws.freeze_panes = 'A2'
        for col, larg in zip('ABCDEFGH', (8, 7, 8, 12, 10, 50, 80, 14)):
            ws.column_dimensions[col].width = larg
        wb.save(out)
    print(f'\nElenco dei doppioni: {out}')


def _estrai(lavoro):
    """Nel processo di lavoro: prova i percorsi di un contenuto finché uno si legge."""
    from testo import estrai
    imp, percorsi = lavoro
    r = None
    for p in percorsi:
        if os.path.exists(p):
            r = estrai(p)
            if r['esito'] != 'errore':
                break
    return imp, r or {'esito': 'errore', 'metodo': None, 'pagine': None, 'testo': '', 'errore': 'nessun file presente'}


def proteggi(db, imp):
    """Documento con password in chiaro: niente testo nel catalogo, stato 'riservato' (non va a nessun modello)."""
    db.execute("UPDATE testi SET testo=NULL, caratteri=0 WHERE impronta=?", (imp,))
    db.execute('DELETE FROM ricerca WHERE impronta=?', (imp,))
    db.execute("UPDATE contenuti SET stato='riservato', aggiornato=? WHERE impronta=?", (adesso(), imp))
    registra(db, 'testo tolto: password in chiaro', imp, chi='protezione')


def nomi_ricerca(db, imps):
    """Aggiorna i nomi dei file nell'indice di ricerca (dopo nuove copie, spostamenti o nomi cambiati)."""
    n = 0
    for imp in imps:
        t = db.execute("SELECT esito, testo FROM testi WHERE impronta=?", (imp,)).fetchone()
        if not t or t['esito'] == 'riservato':
            continue
        nomi = ' '.join(sorted({os.path.splitext(os.path.basename(r[0]))[0] for r in
                                db.execute('SELECT percorso FROM file WHERE impronta=? AND presente=1', (imp,))}))
        db.execute('DELETE FROM ricerca WHERE impronta=?', (imp,))
        db.execute('INSERT INTO ricerca (impronta, nomi, testo) VALUES (?,?,?)', (imp, nomi, t['testo'] or ''))
        n += 1
    return n


def leggi():
    from concurrent.futures import ProcessPoolExecutor
    riprova = '--riprova' in sys.argv
    db = apri_db()
    cond = "t.impronta IS NULL" + (" OR t.esito = 'errore'" if riprova else '')
    da_leggere = db.execute(
        f"SELECT c.impronta FROM contenuti c LEFT JOIN testi t USING(impronta) "
        f"WHERE c.genere IN ('documento','immagine','archivio') AND ({cond})").fetchall()
    percorsi = {}
    for r in db.execute('SELECT impronta, percorso FROM file WHERE presente=1'):
        percorsi.setdefault(r['impronta'], []).append(r['percorso'])
    lavori = [(r['impronta'], percorsi[r['impronta']]) for r in da_leggere if r['impronta'] in percorsi]
    print(f'Contenuti da leggere: {len(lavori)}')
    if not lavori:
        return
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    t0 = time.time(); conta = {}
    quando = adesso()
    with ProcessPoolExecutor(max_workers=max(1, (os.cpu_count() or 2) - 2)) as ex:
        for i, (imp, r) in enumerate(ex.map(_estrai, lavori, chunksize=8), 1):
            testo = r.get('testo') or ''
            db.execute('INSERT OR REPLACE INTO testi (impronta, esito, metodo, pagine, caratteri, testo, errore, letto) '
                       'VALUES (?,?,?,?,?,?,?,?)', (imp, r['esito'], r.get('metodo'), r.get('pagine'), len(testo),
                                                    testo or None, r.get('errore'), quando))
            nomi = ' '.join(sorted({os.path.splitext(os.path.basename(p))[0] for p in percorsi[imp]}))
            db.execute('DELETE FROM ricerca WHERE impronta=?', (imp,))
            db.execute('INSERT INTO ricerca (impronta, nomi, testo) VALUES (?,?,?)', (imp, nomi, testo))
            if r['esito'] == 'riservato':
                proteggi(db, imp)
            conta[r['esito']] = conta.get(r['esito'], 0) + 1
            if i % 500 == 0:
                db.commit(); print(f'  ... {i}/{len(lavori)} ({time.time() - t0:.0f} s)')
    registra(db, 'lettura testo', chi='lettura', **conta, secondi=round(time.time() - t0))
    db.commit()
    print(f'\nFatto in {time.time() - t0:.0f} s')
    for k, v in sorted(conta.items(), key=lambda x: -x[1]):
        print(f'  {k:<15} {v}')
    db.close()


def _ocr(lavoro):
    from testo import ocr
    imp, percorsi = lavoro
    r = None
    for p in percorsi:
        if os.path.exists(p):
            r = ocr(p)
            if r['esito'] != 'errore':
                break
    return imp, r or {'esito': 'errore', 'metodo': 'ocr', 'pagine': None, 'testo': '', 'errore': 'nessun file presente'}


def leggi_scansioni(solo_nuove=False):
    """OCR dei contenuti segnati 'da_ocr'. Prima quelli fuori dall'archivio principale. --prova N per provarne N.
    solo_nuove: salta quelli già tentati senza successo (es. troppo lenti), per l'aggiornamento automatico."""
    from concurrent.futures import ProcessPoolExecutor
    cfg = carica_config()
    db = apri_db()
    princ = chiave(cfg['archivio_principale']) + os.sep if cfg['archivio_principale'] else '\0'
    percorsi = {}
    for r in db.execute('SELECT impronta, percorso FROM file WHERE presente=1'):
        percorsi.setdefault(r['impronta'], []).append(r['percorso'])
    cond = " AND errore IS NULL" if solo_nuove else ''
    imps = [r['impronta'] for r in db.execute("SELECT impronta FROM testi WHERE esito='da_ocr'" + cond) if r['impronta'] in percorsi]
    imps.sort(key=lambda i: any(chiave(p).startswith(princ) for p in percorsi[i]))
    if '--prova' in sys.argv:
        imps = imps[:int(sys.argv[sys.argv.index('--prova') + 1])]
    lavori = [(i, percorsi[i]) for i in imps]
    print(f'Scansioni da leggere: {len(lavori)}')
    if not lavori:
        return
    t0 = time.time(); conta = {}; pagine = 0
    quando = adesso()
    with ProcessPoolExecutor(max_workers=max(1, (os.cpu_count() or 2) - 2)) as ex:
        for i, (imp, r) in enumerate(ex.map(_ocr, lavori), 1):
            testo = r.get('testo') or ''
            if r['esito'] == 'errore':
                db.execute("UPDATE testi SET errore=?, letto=? WHERE impronta=?", (r.get('errore'), quando, imp))
            else:
                db.execute('UPDATE testi SET esito=?, metodo=?, caratteri=?, testo=?, errore=NULL, letto=? WHERE impronta=?',
                           (r['esito'], r['metodo'], len(testo), testo or None, quando, imp))
                nomi = ' '.join(sorted({os.path.splitext(os.path.basename(p))[0] for p in percorsi[imp]}))
                db.execute('DELETE FROM ricerca WHERE impronta=?', (imp,))
                db.execute('INSERT INTO ricerca (impronta, nomi, testo) VALUES (?,?,?)', (imp, nomi, testo))
                if r['esito'] == 'riservato':
                    proteggi(db, imp)
            pagine += min(r.get('pagine') or 1, 20)
            conta[r['esito']] = conta.get(r['esito'], 0) + 1
            if i % 50 == 0:
                db.commit()
                print(f'  ... {i}/{len(lavori)} ({time.time() - t0:.0f} s, {pagine / (time.time() - t0):.2f} pagine/s)')
    registra(db, 'lettura ottica', chi='ocr', **conta, pagine=pagine, secondi=round(time.time() - t0))
    db.commit()
    dur = time.time() - t0
    print(f'\nFatto in {dur:.0f} s: {pagine} pagine, {pagine / dur:.2f} pagine/s')
    for k, v in sorted(conta.items(), key=lambda x: -x[1]):
        print(f'  {k:<10} {v}')
    db.close()


COLONNE_NUOVE = {'sotto': 'TEXT', 'anno': 'INTEGER', 'persona': 'TEXT', 'descrizione': 'TEXT',
                 'confidenza': 'TEXT', 'fonte': 'TEXT', 'percorso_scelto': 'TEXT'}
NON_PERSONE = re.compile(r'\d|zzz|attestat|bonific|dichiaraz|residenz|visite|stage|ex dipendenti|quietanz|raccoglit|riepilog', re.I)


def aggiorna_schema(db):
    esistenti = {r['name'] for r in db.execute('PRAGMA table_info(contenuti)')}
    for c, t in COLONNE_NUOVE.items():
        if c not in esistenti:
            db.execute(f'ALTER TABLE contenuti ADD COLUMN {c} {t}')


def carica_mappa(cfg):
    """Mappa locale cartelle -> aree. Ritorna (funzione percorso -> voce, elenco delle persone)."""
    f = os.path.join(DATI, 'mappa-cartelle.json')
    if not os.path.exists(f):
        return (lambda p: None), []
    with open(f, encoding='utf-8') as fh:
        mappa = json.load(fh)['mappa']
    radice = cfg.get('radice_mappa') or os.path.dirname(chiave(cfg['archivio_principale']))
    voci = sorted(((chiave(os.path.join(radice, *k.split('/'))) + os.sep, v) for k, v in mappa.items()),
                  key=lambda x: -len(x[0]))
    persone = set()

    def persona_da(resto):
        parti = [x for x in resto.split(os.sep)[:-1]]
        if parti and parti[0].lower() == 'ex dipendenti':
            parti = parti[1:]
        if parti and not NON_PERSONE.search(parti[0]) and len(parti[0].split()) >= 2:
            return parti[0].strip()
        return None

    # elenco delle persone dalle cartelle dei dipendenti
    for base, v in voci:
        if v['sotto'] == 'Dipendenti' and os.path.isdir(base):
            for d in os.listdir(base):
                sub = os.path.join(base, d)
                if os.path.isdir(sub):
                    if d.lower() == 'ex dipendenti':
                        persone.update(x for x in os.listdir(sub) if os.path.isdir(os.path.join(sub, x)) and not NON_PERSONE.search(x))
                    elif not NON_PERSONE.search(d) and len(d.split()) >= 2:
                        persone.add(d)

    def trova(p):
        k = chiave(p)
        for base, v in voci:
            if k.startswith(base):
                voce = dict(v)
                if v['sotto'] == 'Dipendenti':
                    pers = persona_da(p[len(base):] if len(p) >= len(base) else '')
                    if pers:
                        voce['persona'] = pers
                return voce
        return None
    return trova, sorted(persone, key=lambda s: -len(s))


def classifica_tutto(solo=None):
    """solo: insieme di impronte da classificare (aggiornamento automatico); None = tutte quelle delle regole."""
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from classifica import classifica
    cfg = carica_config()
    db = apri_db(); aggiorna_schema(db)
    trova, persone = carica_mappa(cfg)
    nomi_az = [n.upper() for n in cfg.get('nomi_azienda', [])]
    tutto = '--tutto' in sys.argv
    percorsi, modif = {}, {}
    for r in db.execute('SELECT impronta, percorso, modificato FROM file WHERE presente=1'):
        percorsi.setdefault(r['impronta'], []).append(r['percorso'])
        modif[r['impronta']] = min(modif.get(r['impronta'], r['modificato']), r['modificato'])
    righe = db.execute('SELECT c.impronta, c.genere, c.stato, c.classificato_da, t.testo, t.esito FROM contenuti c '
                       'LEFT JOIN testi t USING(impronta)').fetchall()
    quando = adesso(); conta = {}; n = 0
    for r in righe:
        if r['impronta'] not in percorsi or r['stato'] == 'riservato' or (solo is not None and r['impronta'] not in solo):
            continue
        if not tutto and r['classificato_da'] in ('utente', 'claude', 'llm'):
            continue
        c = classifica({'testo': r['testo'], 'esito': r['esito'], 'genere': r['genere'],
                        'percorsi': percorsi[r['impronta']], 'modificato': modif[r['impronta']]}, trova, persone, nomi_az)
        stato = 'da_rivedere' if c['confidenza'] == 'bassa' else 'proposto'
        db.execute('UPDATE contenuti SET area=?, sotto=?, tipo=?, data_doc=?, anno=?, controparte=?, persona=?, '
                   'descrizione=?, nome_proposto=?, confidenza=?, fonte=?, percorso_scelto=?, stato=?, '
                   'classificato_da=?, aggiornato=? WHERE impronta=?',
                   (c['area'], c['sotto'], c['tipo'], c['data_doc'], c['anno'], c['controparte'], c['persona'],
                    c['descrizione'], c['nome_proposto'], c['confidenza'], c['fonte'], c['percorso_scelto'], stato,
                    'regole', quando, r['impronta']))
        k = (c['fonte'] or 'nessuna').split('-')[0], c['confidenza']
        conta[k] = conta.get(k, 0) + 1; n += 1
    import nomi                                  # nomi dal contenuto e numerazione dei nomi uguali
    nomi.rifai_nomi(db, cfg, persone, solo=set(solo) if solo is not None else None)
    registra(db, 'classificazione', chi='regole', contenuti=n)
    db.commit()
    print(f'Classificati: {n}   (persone riconosciute dalle cartelle: {len(persone)})')
    for (f, c), v in sorted(conta.items()):
        print(f'  {f:<10} {c:<6} {v}')
    if solo is not None:
        db.close()
        return n
    print('\nPer area:')
    for r in db.execute("SELECT area, COUNT(*) n, SUM(confidenza='bassa') b FROM contenuti WHERE area IS NOT NULL GROUP BY area ORDER BY area"):
        print(f'  {r["area"]:<36} {r["n"]:>6}   da rivedere {r["b"]}')
    db.close()


def codici_aree():
    """Codici brevi area.sottoarea (es. 02.3 = Fisco e contabilità / F24 e F23) da aree.json."""
    with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'aree.json'), encoding='utf-8') as f:
        aree = json.load(f)['aree']
    codici = {}
    for a in aree:
        nome_a = f"{a['codice']} {a['nome']}"
        codici[a['codice']] = (nome_a, None)
        for i, s in enumerate(a['sotto'], 1):
            codici[f"{a['codice']}.{i}"] = (nome_a, s['nome'])
    return codici


def legenda_codici():
    righe, ultimo = [], None
    for k, (a, s) in codici_aree().items():
        if s is None:
            righe.append(f'{k} {a[3:]}')
        else:
            righe[-1] += f' | {k} {s}'
    return '\n'.join(righe)


def lotti():
    """Prepara i lotti di revisione (per Claude o per il modello sul PC): i contenuti classificati solo dalle regole.
    --grandezza N (100), --caratteri N (350). Scrive ArchivioAzienda\\lotti\\lotto-NNN.txt e .json (gli id)."""
    db = apri_db(); aggiorna_schema(db)
    arg = lambda k, d: int(sys.argv[sys.argv.index(k) + 1]) if k in sys.argv else d
    grand, car = arg('--grandezza', 100), arg('--caratteri', 350)
    inv = {(a, s): k for k, (a, s) in codici_aree().items()}
    righe = db.execute("SELECT c.rowid id, c.*, t.testo FROM contenuti c LEFT JOIN testi t USING(impronta) "
                       "WHERE c.fonte IS NOT NULL AND c.fonte != 'cartella' AND c.classificato_da = 'regole' "
                       "AND c.stato != 'riservato' ORDER BY c.confidenza = 'bassa' DESC, c.percorso_scelto").fetchall()
    cartella = os.path.join(DATI, 'lotti'); os.makedirs(cartella, exist_ok=True)
    for f in os.listdir(cartella):
        if f.startswith('lotto-'):          # le revisioni (rev-*.json) restano come storico
            os.remove(os.path.join(cartella, f))
    n = 0
    for i in range(0, len(righe), grand):
        n += 1
        pezzo = righe[i:i + grand]; testo = []
        for r in pezzo:
            cod = inv.get((r['area'], r['sotto'])) or inv.get((r['area'], None)) or '99.1'
            prop = ' / '.join(x for x in (cod, r['tipo'], r['data_doc'] or (str(r['anno']) if r['anno'] else ''), r['controparte'], r['persona']) if x)
            dove = os.path.basename(os.path.dirname(r['percorso_scelto']))
            estratto = ' '.join((r['testo'] or '').split())[:car]
            testo.append(f"#{r['id']} | {os.path.basename(r['percorso_scelto'])} | in: {dove} | proposta: {prop} [{r['confidenza']}]\n   {estratto}")
        with open(os.path.join(cartella, f'lotto-{n:03}.txt'), 'w', encoding='utf-8') as f:
            f.write('\n'.join(testo))
        with open(os.path.join(cartella, f'lotto-{n:03}.json'), 'w', encoding='utf-8') as f:
            json.dump([r['id'] for r in pezzo], f)
    with open(os.path.join(cartella, 'codici.txt'), 'w', encoding='utf-8') as f:
        f.write(legenda_codici())
    print(f'{len(righe)} contenuti in {n} lotti: {cartella}')
    db.close()


DATA_OK = re.compile(r'^(19[9]\d|20\d\d)(-(0[1-9]|1[0-2])(-(0[1-9]|[12]\d|3[01]))?)?$')
CAMPI_CORREZIONE = {'a', 't', 'd', 'c', 'p', 'x', 'n'}


def trova_contenuto(db, id_):
    """Un contenuto per numero (rowid) o per impronta (64 caratteri esadecimali)."""
    s = str(id_).strip()
    if re.fullmatch(r'\d{1,9}', s):
        return db.execute('SELECT rowid id, * FROM contenuti WHERE rowid=?', (int(s),)).fetchone()
    if re.fullmatch(r'[0-9a-f]{64}', s):
        return db.execute('SELECT rowid id, * FROM contenuti WHERE impronta=?', (s,)).fetchone()
    return None


def controlla_correzione(c, codici):
    """Errore (testo) se la correzione non è valida, altrimenti None."""
    if not isinstance(c, dict):
        return 'la correzione deve essere un oggetto'
    if set(c) - CAMPI_CORREZIONE:
        return 'campi sconosciuti: ' + ', '.join(sorted(set(c) - CAMPI_CORREZIONE))
    for k, v in c.items():
        if v is not None and not isinstance(v, str):
            return f'"{k}" deve essere un testo'
        if v and len(v) > 120:
            return f'"{k}" troppo lungo'
    if 'a' in c and c['a'] not in codici:
        return f'codice area sconosciuto: {c["a"]}'
    if c.get('d') and not DATA_OK.match(c['d']):
        return f'data non valida: {c["d"]} (AAAA, AAAA-MM o AAAA-MM-GG)'
    if c.get('d') and len(c['d']) == 10:
        try:
            dt.date.fromisoformat(c['d'])
        except ValueError:
            return f'data inesistente: {c["d"]}'
    return None


def applica_correzioni(db, corr, chi, conferma=(), motivo=None):
    """Applica correzioni nel formato compatto {"id": {"a": "02.3", "t": tipo, "d": data, "c": controparte,
    "p": persona, "x": descrizione, "n": nome proposto scelto a mano}} (id = rowid o impronta).
    Un id con {} o in `conferma` si conferma così com'è. Stato dopo: utente -> 'confermato', llm -> 'da_rivedere',
    altri -> 'proposto'; i riservati restano riservati. Ritorna (rowid aggiornati, {id: errore})."""
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from classifica import nome_proposto, pulisci_nome
    aggiorna_schema(db)
    codici = codici_aree()
    quando = adesso(); fatti, errori = [], {}
    tutti = dict.fromkeys([str(i) for i in conferma], None)
    tutti.update({str(k): v for k, v in corr.items()})
    for i, c in tutti.items():
        r = trova_contenuto(db, i)
        if not r:
            errori[i] = 'documento non trovato'; continue
        c = c or {}
        err = controlla_correzione(c, codici)
        if err:
            errori[i] = err; continue
        area, sotto, tipo = r['area'], r['sotto'], r['tipo']
        data, anno, contro, pers, descr = r['data_doc'], r['anno'], r['controparte'], r['persona'], r['descrizione']
        if 'a' in c:
            area, sotto = codici[c['a']]
        tipo = (c.get('t') or None) if 't' in c else tipo
        if 'd' in c:
            data = c['d'] or None
            anno = int(data[:4]) if data else anno
        contro = (c.get('c') or None) if 'c' in c else contro
        pers = (c.get('p') or None) if 'p' in c else pers
        descr = (c.get('x') or None) if 'x' in c else descr
        d = None
        if data and len(data) == 10:
            try:
                d = dt.date.fromisoformat(data)
            except ValueError:
                d = None
        est = os.path.splitext(r['percorso_scelto'] or '')[1].lower()
        if c.get('n'):          # nome scelto a mano: si tolgono solo i caratteri vietati da Windows
            base = c['n'][:-len(est)] if est and c['n'].lower().endswith(est) else c['n']
            base = re.sub(r'\s+', '-', re.sub(r'[\\/:*?"<>|\x00-\x1f]', ' ', base).strip()).strip('-.')[:120]
            nome = (base + est) if base else None
        else:
            nome = nome_proposto(d, anno if not d else None, tipo, pers if area and area.startswith('05') and pers else contro,
                                 pulisci_nome(descr, 50) if descr else None, est)
            if data and len(data) == 7 and nome:       # solo anno e mese
                nome = data + nome[4:] if nome.startswith(str(anno)) else nome
        if r['stato'] == 'riservato':
            stato = 'riservato'
        else:
            stato = {'utente': 'confermato', 'llm': 'da_rivedere'}.get(chi, 'proposto')
        conf = 'media' if chi == 'llm' else 'alta'
        db.execute('UPDATE contenuti SET area=?, sotto=?, tipo=?, data_doc=?, anno=?, controparte=?, persona=?, '
                   'descrizione=?, nome_proposto=?, confidenza=?, stato=?, classificato_da=?, aggiornato=? WHERE rowid=?',
                   (area, sotto, tipo, data, anno, contro, pers, descr, nome, conf, stato, chi, quando, r['id']))
        prima = {k: r[k] for k in ('area', 'sotto', 'tipo', 'data_doc', 'controparte', 'persona', 'stato', 'classificato_da')}
        extra = {'motivo': motivo} if motivo else {}
        registra(db, 'correzione' if c else 'conferma', r['impronta'], chi=chi, prima=prima, dopo=c, **extra)
        fatti.append(r['id'])
    return fatti, errori


def applica_revisione():
    """python archivio.py applica NUMERO_LOTTO FILE.json [chi]
    FILE.json: {"id": {"a": "02.3", "t": "F24", "d": "2025-01-29", "c": "Controparte", "p": "Persona", "x": "descrizione"}}
    Gli id del lotto non presenti nel file sono confermati come proposti. chi: claude (predefinito), llm, utente."""
    num, file_corr = int(sys.argv[2]), sys.argv[3]
    chi = sys.argv[4] if len(sys.argv) > 4 else 'claude'
    with open(os.path.join(DATI, 'lotti', f'lotto-{num:03}.json'), encoding='utf-8') as f:
        ids = json.load(f)
    with open(file_corr, encoding='utf-8') as f:
        corr = json.load(f)
    db = apri_db()
    corr = {k: v for k, v in corr.items() if int(k) in set(ids)}
    fatti, errori = applica_correzioni(db, corr, chi, conferma=ids)
    registra(db, 'revisione lotto', chi=chi, lotto=num, contenuti=len(ids), corretti=len(corr) - len(errori))
    db.commit(); db.close()
    print(f'Lotto {num}: {len(ids)} contenuti, {len(corr)} corretti')
    for i, e in errori.items():
        print(f'  #{i}: {e}')


# ---------------------------------------------------------------- modello sul PC (LM Studio)

LLM_BASE = {'indirizzo': 'http://127.0.0.1:1234', 'modello': '', 'massimo': 100, 'esempi': 6, 'attivo': True}
LOCALI = {'127.0.0.1', 'localhost', '::1'}


def llm_config(cfg=None):
    if cfg is None:
        try:
            with open(CONFIG, encoding='utf-8') as f:
                cfg = json.load(f)
        except (OSError, ValueError):
            cfg = {}
    c = dict(LLM_BASE); c.update(cfg.get('llm') or {})
    import urllib.parse
    if urllib.parse.urlsplit(c['indirizzo']).hostname not in LOCALI:
        sys.exit(f'Il modello deve stare su questo PC (indirizzo {c["indirizzo"]} non ammesso): i documenti non escono dal computer.')
    return c


def _http_json(url, dati=None, timeout=30):
    import urllib.request
    req = urllib.request.Request(url, data=json.dumps(dati).encode('utf-8') if dati is not None else None,
                                 method='POST' if dati is not None else 'GET', headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.load(r)


def llm_modello(c):
    """Nome del modello da usare, o None se LM Studio non risponde."""
    try:
        modelli = [m['id'] for m in _http_json(c['indirizzo'].rstrip('/') + '/v1/models', timeout=5).get('data', [])]
    except Exception:
        return None
    modelli = [m for m in modelli if 'embed' not in m.lower()]
    if c['modello']:
        return c['modello'] if (c['modello'] in modelli or not modelli) else None
    return modelli[0] if modelli else None


PAROLA = re.compile(r'[a-zà-ÿ]{4,}')


def _parole(nome, testo):
    return set(PAROLA.findall((nome + ' ' + ' '.join((testo or '')[:600].split())).lower()))


def _estratto(testo, n):
    return ' '.join((testo or '').split())[:n]


def _risposta_esempio(r, inv):
    return json.dumps({'a': inv.get((r['area'], r['sotto'])) or inv.get((r['area'], None)) or '99.1',
                       't': r['tipo'] or '', 'd': r['data_doc'] or (str(r['anno']) if r['anno'] else ''),
                       'c': r['controparte'] or '', 'p': r['persona'] or '', 'x': r['descrizione'] or '', 'sicuro': True},
                      ensure_ascii=False)


SCHEMA_LLM = {'type': 'object', 'additionalProperties': False,
              'required': ['a', 't', 'd', 'c', 'p', 'x', 'sicuro'],
              'properties': {'a': {'type': 'string'}, 't': {'type': 'string'}, 'd': {'type': 'string'},
                             'c': {'type': 'string'}, 'p': {'type': 'string'}, 'x': {'type': 'string'},
                             'sicuro': {'type': 'boolean'}}}


def _da_risposta(testo, codici):
    """JSON del modello -> correzione compatta valida (o errore)."""
    m = re.search(r'\{[\s\S]*\}', testo or '')
    if not m:
        return None, 'risposta senza JSON'
    try:
        j = json.loads(m.group(0))
    except ValueError:
        return None, 'JSON non valido'
    corr = {}
    a = str(j.get('a') or '').strip()
    if a not in codici:
        return None, f'codice area sconosciuto: {a!r}'
    corr['a'] = a
    d = str(j.get('d') or '').strip()
    m = re.fullmatch(r'(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})', d)
    if m:
        d = f'{m[3]}-{int(m[2]):02}-{int(m[1]):02}'
    if d and DATA_OK.match(d):
        corr['d'] = d
    for k in ('t', 'c', 'p', 'x'):
        v = str(j.get(k) or '').strip()
        if v and v.lower() not in ('null', 'none', 'nessuno', 'nessuna', '-', 'n/a'):
            corr[k] = v[:80]
    err = controlla_correzione(corr, codici)
    if err:
        return None, err
    return corr, bool(j.get('sicuro', False))


def esempi_llm(db):
    """Esempi per il modello: revisioni di Claude (file rev-*.json, peso 1,2), altri rivisti da Claude (1,0) e
    correzioni a mano (1,5). Ritorna [(riga, parole, peso)]."""
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from testo import riservato
    rivisti = set()
    cart = os.path.join(DATI, 'lotti')
    if os.path.isdir(cart):
        for f in os.listdir(cart):
            if f.startswith('rev-') and f.endswith('.json'):
                try:
                    rivisti.update(int(k) for k in json.load(open(os.path.join(cart, f), encoding='utf-8')))
                except (ValueError, OSError):
                    pass
    esempi = []
    for r in db.execute("SELECT c.rowid id, c.*, t.testo FROM contenuti c JOIN testi t USING(impronta) "
                        "WHERE c.classificato_da IN ('claude','utente') AND c.stato != 'riservato' AND t.esito='ok' "
                        "AND c.area IS NOT NULL"):
        if riservato(r['testo'] or ''):
            continue
        nome = os.path.basename(r['percorso_scelto'] or '')
        peso = 1.5 if r['classificato_da'] == 'utente' else (1.2 if r['id'] in rivisti else 1.0)
        esempi.append((r, _parole(nome, r['testo']), peso))
    return esempi


def sistema_llm(nomi_az):
    legenda = legenda_codici()
    return (
        "Sei l'archivista di un'azienda agricola con stalla da vacche da latte in Friuli. Classifichi un documento alla volta "
        "e rispondi solo con un oggetto JSON con questi campi:\n"
        '"a": codice area.sottoarea preso dalla legenda (es. "02.3"); se non capisci usa "99.1";\n'
        '"t": tipo di documento, breve, parole unite da trattini (es. "Fattura", "F24", "Busta-paga", "Contratto-di-affitto");\n'
        '"d": data del documento AAAA-MM-GG (oppure AAAA-MM o AAAA, "" se non si capisce): la data di emissione, non nascite o scadenze;\n'
        '"c": chi ha emesso il documento o l\'altra parte (ditta o ente), breve con trattini, "" se non si capisce;\n'
        '"p": nome e cognome della persona (dipendente o socio) se il documento riguarda una persona, altrimenti "";\n'
        '"x": una descrizione di 1-4 parole; "sicuro": true se sei sicuro, false se tiri a indovinare.\n'
        + (f"L'azienda stessa è {', '.join(nomi_az)}: non è mai la controparte (nelle fatture di vendita la controparte è il cliente).\n" if nomi_az else '')
        + "\nLegenda delle aree:\n" + legenda)


def messaggi_llm(r, esempi, sistema, inv, n=6):
    """Messaggi per un documento: sistema, n esempi più simili (al massimo 2 per sottoarea, il più simile per ultimo),
    poi il documento con la proposta delle regole (area, sotto, tipo di r)."""
    nome = os.path.basename(r['percorso_scelto'] or '')
    cartella = os.path.basename(os.path.dirname(r['percorso_scelto'] or ''))
    mie = _parole(nome, r['testo'])
    scelti, per_area = [], {}
    for e, par_e, peso in sorted(esempi, key=lambda x: -(len(mie & x[1]) / (len(mie | x[1]) or 1)) * x[2]):
        k = (e['area'], e['sotto'])
        if per_area.get(k, 0) >= 2 or e['impronta'] == r['impronta']:
            continue
        scelti.append(e); per_area[k] = per_area.get(k, 0) + 1
        if len(scelti) >= n:
            break
    msg = [{'role': 'system', 'content': sistema}]
    for e in reversed(scelti):          # il più simile per ultimo, vicino alla domanda
        en = os.path.basename(e['percorso_scelto'] or '')
        msg.append({'role': 'user', 'content': f"Nome del file: {en}\nCartella: {os.path.basename(os.path.dirname(e['percorso_scelto'] or ''))}\n"
                                               f"Testo: {_estratto(e['testo'], 400)}"})
        msg.append({'role': 'assistant', 'content': _risposta_esempio(e, inv)})
    prop = inv.get((r['area'], r['sotto'])) or ''
    msg.append({'role': 'user', 'content': f"Nome del file: {nome}\nCartella: {cartella}\n"
                                           f"Proposta delle regole automatiche (spesso sbagliata): {prop} {r['tipo'] or ''}\n"
                                           f"Testo: {_estratto(r['testo'], 1500) or '(nessun testo leggibile)'}"})
    return msg


def classifica_llm(solo=None, cfg=None):
    """Manda al modello sul PC i documenti rimasti a confidenza bassa (mai quelli riservati).
    Opzioni: --prova N (solo N documenti), --id N (un documento preciso). Risultato: classificato_da='llm', da_rivedere."""
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from testo import riservato
    c = llm_config(cfg)
    try:
        conf_az = cfg if cfg is not None else json.load(open(CONFIG, encoding='utf-8'))
    except (OSError, ValueError):
        conf_az = {}
    nomi_az = conf_az.get('nomi_azienda', [])
    codici = codici_aree(); inv = {v: k for k, v in codici.items()}
    db = apri_db(); aggiorna_schema(db)
    cond = ("c.classificato_da='regole' AND c.confidenza='bassa'")
    par = []
    if '--id' in sys.argv:
        cond = 'c.rowid=?'; par = [int(sys.argv[sys.argv.index('--id') + 1])]
    righe = db.execute("SELECT c.rowid id, c.*, t.testo, t.esito FROM contenuti c JOIN testi t USING(impronta) "
                       f"WHERE {cond} AND c.stato != 'riservato' AND t.esito != 'riservato' "
                       "ORDER BY c.primo_visto DESC", par).fetchall()
    righe = [r for r in righe if (solo is None or r['impronta'] in solo) and not riservato(r['testo'] or '')]
    lim = int(sys.argv[sys.argv.index('--prova') + 1]) if '--prova' in sys.argv else int(c['massimo'])
    righe = righe[:lim]
    if not righe:
        print('Modello sul PC: nessun documento da classificare.')
        db.close(); return 0
    try:                                         # accende LM Studio e carica il modello solo se c'è lavoro
        import ia_locale
        ia_locale.accendi(ia_locale.impostazioni())
    except Exception as e:
        print(f'LM Studio: {e}')
    modello = llm_modello(c)
    if not modello:
        print(f'Modello sul PC non raggiungibile ({c["indirizzo"]}): apri LM Studio, carica un modello e accendi il server.')
        db.close(); return 0
    print(f'Modello: {modello}   documenti da classificare: {len(righe)}')

    esempi = esempi_llm(db)
    sistema = sistema_llm(nomi_az)
    quando = adesso(); fatti = errori = 0; t0 = time.time(); fatte = set()
    url = c['indirizzo'].rstrip('/') + '/v1/chat/completions'
    usa_schema = True
    for i, r in enumerate(righe, 1):
        nome = os.path.basename(r['percorso_scelto'] or '')
        cartella = os.path.basename(os.path.dirname(r['percorso_scelto'] or ''))
        msg = messaggi_llm(r, esempi, sistema, inv, int(c['esempi']))
        dati = {'model': modello, 'messages': msg, 'temperature': 0.1, 'max_tokens': 300, 'stream': False,
                'reasoning_effort': 'none'}     # senza: i modelli che "ragionano" finiscono i token prima della risposta
        if usa_schema:
            dati['response_format'] = {'type': 'json_schema', 'json_schema': {'name': 'classificazione', 'strict': True, 'schema': SCHEMA_LLM}}
        try:
            try:
                risp = _http_json(url, dati, timeout=900)
            except Exception as e:
                if usa_schema and getattr(e, 'code', None) == 400:     # modello o server senza risposta "a schema"
                    usa_schema = False; dati.pop('response_format')
                    risp = _http_json(url, dati, timeout=900)
                else:
                    raise
            testo_r = risp['choices'][0]['message'].get('content') or ''
        except Exception as e:
            errori += 1
            print(f'  #{r["id"]} {nome}: errore del modello ({type(e).__name__}: {e})')
            continue
        corr, sicuro = _da_risposta(testo_r, codici)
        if corr is None:
            errori += 1
            print(f'  #{r["id"]} {nome}: {sicuro}')
            continue
        applica_correzioni(db, {r['id']: corr}, 'llm', motivo=modello)
        if not sicuro:
            db.execute("UPDATE contenuti SET confidenza='bassa' WHERE rowid=?", (r['id'],))
        db.commit(); fatti += 1; fatte.add(r['impronta'])
        print(f'  [{i}/{len(righe)}] #{r["id"]} {nome} -> {corr.get("a")} {corr.get("t", "")} {corr.get("d", "")}'
              f' {"" if sicuro else "(incerto)"}  {time.time() - t0:.0f} s')
    if fatte:                                    # nomi dal contenuto e numerazione dei nomi uguali (come classifica_tutto)
        import nomi
        _, persone = carica_mappa(conf_az)
        nomi.rifai_nomi(db, conf_az, persone, solo=fatte)
    registra(db, 'classificazione llm', chi='llm', modello=modello, contenuti=fatti, errori=errori, secondi=round(time.time() - t0))
    db.commit(); db.close()
    print(f'Fatto: {fatti} classificati dal modello, {errori} non riusciti, {time.time() - t0:.0f} s')
    return fatti


# ---------------------------------------------------------------- aggiornamento automatico (file nuovi)

def aggiorna():
    """Scansione -> testo -> lettura ottica -> classificazione dei soli contenuti nuovi o cambiati -> modello sul PC.
    --log scrive in ArchivioAzienda\\aggiorna-log.txt (per l'Utilità di pianificazione); --senza-llm salta il modello."""
    if '--log' in sys.argv:
        os.makedirs(DATI, exist_ok=True)
        f = open(os.path.join(DATI, 'aggiorna-log.txt'), 'a', encoding='utf-8', buffering=1)
        sys.stdout = sys.stderr = f
    print(f'\n===== Aggiornamento {adesso()} =====')
    blocco = os.path.join(DATI, 'aggiorna.lock')
    if os.path.exists(blocco) and time.time() - os.path.getmtime(blocco) < 6 * 3600:
        print('Un altro aggiornamento è in corso (o si è interrotto da meno di 6 ore): esco.')
        return
    open(blocco, 'w').write(str(os.getpid()))
    t0 = time.time()
    try:
        db = apri_db(); aggiorna_schema(db)
        inizio = db.execute('SELECT COALESCE(MAX(id), 0) FROM registro').fetchone()[0]
        prima = db.execute('SELECT COUNT(*) FROM contenuti').fetchone()[0]
        db.close()
        print('\n--- 1. Scansione'); scansiona()
        print('\n--- 2. Testo'); leggi()
        print('\n--- 3. Lettura ottica'); leggi_scansioni(solo_nuove=True)
        db = apri_db()
        cambiati = {r[0] for r in db.execute(
            "SELECT DISTINCT impronta FROM registro WHERE id > ? AND impronta IS NOT NULL "
            "AND azione IN ('nuovo','modificato','spostato','ricomparso')", (inizio,))}
        senza = {r[0] for r in db.execute("SELECT impronta FROM contenuti WHERE area IS NULL AND stato != 'riservato'")}
        nomi_ricerca(db, cambiati); db.commit()
        nuovi = db.execute('SELECT COUNT(*) FROM contenuti').fetchone()[0] - prima
        db.close()
        da_fare = cambiati | senza
        print(f'\n--- 4. Classificazione ({len(da_fare)} contenuti nuovi o cambiati)')
        classificati = classifica_tutto(solo=da_fare) if da_fare else 0
        al_modello = 0
        if '--senza-llm' not in sys.argv and llm_config().get('attivo', True):
            print('\n--- 5. Modello sul PC')
            al_modello = classifica_llm(solo=da_fare) if da_fare else 0
        db = apri_db()
        registra(db, 'aggiornamento', chi='aggiorna', contenuti_nuovi=nuovi, cambiati=len(cambiati),
                 classificati=classificati, modello=al_modello, secondi=round(time.time() - t0))
        db.commit(); db.close()
        print(f'\nAggiornamento finito in {time.time() - t0:.0f} s: {nuovi} contenuti nuovi, {classificati} classificati, '
              f'{al_modello} dal modello sul PC.')
    finally:
        try:
            os.remove(blocco)
        except OSError:
            pass


# ---------------------------------------------------------------- correzioni scritte nell'Excel

CHIAVI_EXCEL = {'area': 'a', 'a': 'a', 'codice': 'a', 'tipo': 't', 't': 't', 'data': 'd', 'd': 'd',
                'controparte': 'c', 'ditta': 'c', 'c': 'c', 'persona': 'p', 'dipendente': 'p', 'p': 'p',
                'descrizione': 'x', 'x': 'x', 'nome': 'n', 'n': 'n'}


def leggi_correzione_excel(testo, codici):
    """Testo libero della colonna "Correzione" -> correzione compatta.
    Esempi: "ok" | "02.3" | "02.3; data 29/01/2025" | "tipo: F24; controparte: Banca-360" | "IVA" (nome di sottoarea)."""
    t = str(testo).strip()
    if re.fullmatch(r'(?i)ok|sì|si|giusto|va bene|confermo|v', t):
        return {}, None
    nomi_sotto = {}
    for k, (a, s) in codici.items():
        nomi_sotto.setdefault((s or a[3:]).lower(), k)
    corr = {}
    for pezzo in re.split(r'[;\n]+', t):
        p = pezzo.strip()
        if not p:
            continue
        m = re.match(r'(?i)^([a-zàèéìòù]+)\s*[:=]?\s+(.+)$|^([a-zàèéìòù]+)\s*[:=]\s*(.+)$', p)
        k = v = None
        if m:
            k, v = (m[1], m[2]) if m[1] else (m[3], m[4])
            k = CHIAVI_EXCEL.get(k.lower())
        if not k:
            k, v = None, p
            if re.fullmatch(r'\d{1,2}(\.\d{1,2})?', p):
                k = 'a'
            elif re.fullmatch(r'\d{1,2}/\d{1,2}/\d{4}|\d{1,2}/\d{4}|\d{4}(-\d{2}(-\d{2})?)?', p):
                k = 'd'
            elif p.lower() in nomi_sotto:
                k, v = 'a', nomi_sotto[p.lower()]
            else:
                return None, f'non capisco "{p}"'
        v = v.strip()
        if k == 'a' and v.lower() in nomi_sotto:
            v = nomi_sotto[v.lower()]
        if k == 'a' and re.fullmatch(r'\d(\.\d{1,2})?', v):
            v = '0' + v
        if k == 'd':
            m2 = re.fullmatch(r'(\d{1,2})/(\d{1,2})/(\d{4})', v) or None
            m3 = re.fullmatch(r'(\d{1,2})/(\d{4})', v)
            if m2:
                v = f'{m2[3]}-{int(m2[2]):02}-{int(m2[1]):02}'
            elif m3:
                v = f'{m3[2]}-{int(m3[1]):02}'
        corr[k] = v
    err = controlla_correzione(corr, codici)
    return (None, err) if err else (corr, None)


def correzioni_excel():
    """Legge la colonna "Correzione (scrivi qui)" di archivio-classificato.xlsx e la applica come correzioni dell'utente."""
    from openpyxl import load_workbook
    f = sys.argv[2] if len(sys.argv) > 2 else os.path.join(DATI, 'archivio-classificato.xlsx')
    if not os.path.exists(f):
        sys.exit(f'Non trovo {f}: fai prima "archivio.py esporta".')
    wb = load_workbook(f, read_only=True, data_only=True)
    codici = codici_aree(); corr, errori = {}, []
    for ws in wb.worksheets:
        intest = None
        for riga in ws.iter_rows(values_only=True):
            if intest is None:
                intest = [str(x or '') for x in riga]
                if 'Id' not in intest or not any(x.startswith('Correzione') for x in intest):
                    break
                ci, cc = intest.index('Id'), next(i for i, x in enumerate(intest) if x.startswith('Correzione'))
                continue
            if len(riga) <= cc or riga[cc] in (None, '') or riga[ci] is None:
                continue
            c, err = leggi_correzione_excel(riga[cc], codici)
            if err:
                errori.append((ws.title, riga[ci], riga[cc], err))
            else:
                corr[str(riga[ci])] = c
    wb.close()
    print(f'Correzioni trovate: {len(corr) + len(errori)}  (da applicare: {len(corr)}, non capite: {len(errori)})')
    for foglio, i, t, e in errori:
        print(f'  {foglio} riga Id {i}: "{t}" -> {e}')
    if not corr:
        return
    db = apri_db()
    fatti, err2 = applica_correzioni(db, corr, 'utente', motivo='excel')
    registra(db, 'correzioni dall\'Excel', chi='utente', contenuti=len(fatti), errori=len(err2) + len(errori))
    db.commit(); db.close()
    print(f'Applicate: {len(fatti)}')
    for i, e in err2.items():
        print(f'  Id {i}: {e}')
    print('Rifai "archivio.py esporta" per avere il foglio aggiornato (la colonna Correzione riparte vuota).')


def rinomina():
    """Ricalcola descrizioni e nomi proposti dal contenuto dei documenti (nomi.py); --prova non scrive.
    Solo nel catalogo: nessun file viene rinominato sul disco. I corretti a mano non si toccano."""
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import nomi
    cfg = carica_config()
    _, persone = carica_mappa(cfg)
    db = apri_db(); aggiorna_schema(db)
    prova = '--prova' in sys.argv
    n, elenco = nomi.rifai_nomi(db, cfg, persone, prova=prova)
    if not prova:
        registra(db, 'nomi dal contenuto', chi='regole', contenuti=n)
        db.commit()
    db.close()
    print(f'Nomi ricalcolati: {n}' + (' (prova: niente salvato)' if prova else ''))


def esporta():
    """Foglio Excel di revisione: ArchivioAzienda\\archivio-classificato.xlsx (una riga per contenuto)."""
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill
    cfg = carica_config()
    db = apri_db(); aggiorna_schema(db)
    princ = chiave(cfg['archivio_principale']) + os.sep if cfg['archivio_principale'] else '\0'
    copie = {r[0]: r[1] for r in db.execute('SELECT impronta, COUNT(*) FROM file WHERE presente=1 GROUP BY impronta')}
    righe = db.execute("SELECT rowid id, * FROM contenuti WHERE area IS NOT NULL AND stato != 'riservato' "
                       "ORDER BY area, sotto, data_doc").fetchall()
    wb = Workbook()
    testa = PatternFill('solid', fgColor='DDE6EE'); g = Font(bold=True)
    intest = ['Id', 'Area', 'Sottoarea', 'Nome proposto', 'Tipo', 'Data', 'Controparte', 'Persona',
              'Nome attuale', 'Cartella attuale', 'Copie', 'Classificato da', 'Correzione (scrivi qui)']
    fogli = {'nuovi': wb.active}
    fogli['nuovi'].title = 'Fuori da AZIENDA'
    fogli['azienda'] = wb.create_sheet('Già in AZIENDA')
    for ws in fogli.values():
        ws.append(intest)
        for c in ws[1]:
            c.font = g; c.fill = testa
        for col, w in zip('ABCDEFGHIJKLM', (7, 30, 30, 60, 24, 11, 24, 20, 45, 60, 6, 12, 30)):
            ws.column_dimensions[col].width = w
        ws.freeze_panes = 'A2'
    for r in righe:
        p = r['percorso_scelto'] or ''
        dove = 'azienda' if chiave(p).startswith(princ) else 'nuovi'
        fogli[dove].append([r['id'], r['area'], r['sotto'] or '', r['nome_proposto'] or '', r['tipo'] or '',
                            r['data_doc'] or (str(r['anno']) if r['anno'] else ''), r['controparte'] or '',
                            r['persona'] or '', os.path.basename(p), os.path.dirname(p), copie.get(r['impronta'], 0),
                            r['classificato_da'] or '', ''])
    for ws in fogli.values():
        ws.auto_filter.ref = ws.dimensions
    ws = wb.create_sheet('Riepilogo', 0)
    ws.append(['Area', 'Sottoarea', 'Documenti', 'di cui fuori da AZIENDA'])
    for c in ws[1]:
        c.font = g; c.fill = testa
    conta = {}
    for r in righe:
        k = (r['area'], r['sotto'] or '')
        n, f = conta.get(k, (0, 0))
        conta[k] = (n + 1, f + (0 if chiave(r['percorso_scelto'] or '').startswith(princ) else 1))
    for (a, s), (n, f) in sorted(conta.items()):
        ws.append([a, s, n, f])
    ws.column_dimensions['A'].width = 36; ws.column_dimensions['B'].width = 36
    out = os.path.join(DATI, 'archivio-classificato.xlsx')
    wb.save(out)
    print(f'{len(righe)} contenuti -> {out}')
    db.close()


def cerca():
    parole = [p for p in sys.argv[2:] if p.strip()]
    if not parole:
        sys.exit('Scrivi cosa cercare, es.: python archivio.py cerca parmalat 2024')
    db = apri_db()
    q = ' '.join('"' + p.replace('"', '') + '"' for p in parole)
    righe = db.execute("SELECT impronta, snippet(ricerca, 2, '[', ']', ' … ', 12) pezzo FROM ricerca "
                       "WHERE ricerca MATCH ? ORDER BY rank LIMIT 25", (q,)).fetchall()
    for r in righe:
        f = db.execute('SELECT percorso FROM file WHERE impronta=? AND presente=1 ORDER BY length(percorso) LIMIT 1',
                       (r['impronta'],)).fetchone()
        print(f'- {f["percorso"] if f else "(non più presente)"}')
        print(f'    {" ".join(r["pezzo"].split())}')
    print(f'\n{len(righe)} risultati' + (' (mostro i primi 25)' if len(righe) == 25 else ''))
    db.close()


def stato_catalogo():
    db = apri_db()
    q = lambda s: db.execute(s).fetchone()[0]
    print(f'Catalogo: {DB}')
    print(f'  file presenti:   {q("SELECT COUNT(*) FROM file WHERE presente=1")}')
    print(f'  file spariti:    {q("SELECT COUNT(*) FROM file WHERE presente=0")}')
    print(f'  contenuti:       {q("SELECT COUNT(*) FROM contenuti")}')
    for r in db.execute('SELECT stato, COUNT(*) n FROM contenuti GROUP BY stato'):
        print(f'    {r["stato"]:<14} {r["n"]}')
    ult = db.execute("SELECT quando, dettagli FROM registro WHERE azione='scansione' ORDER BY id DESC LIMIT 1").fetchone()
    if ult:
        print(f'  ultima scansione: {ult["quando"]}')
    db.close()


if __name__ == '__main__':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass
    comandi = {'scansiona': scansiona, 'doppioni': doppioni, 'leggi': leggi, 'ocr': leggi_scansioni,
               'classifica': classifica_tutto, 'lotti': lotti, 'applica': applica_revisione, 'esporta': esporta, 'rinomina': rinomina,
               'cerca': cerca, 'stato': stato_catalogo, 'aggiorna': aggiorna, 'llm': classifica_llm,
               'correzioni-excel': correzioni_excel,
               'modelli': lambda: __import__('ia_locale').mostra_modelli(),
               'prova-ia': lambda: __import__('ia_locale').comando_prova(),
               'nuovi': lambda: __import__('ia_locale').nuovi()}
    if len(sys.argv) < 2 or sys.argv[1] not in comandi:
        print(__doc__)
        sys.exit(1)
    comandi[sys.argv[1]]()
