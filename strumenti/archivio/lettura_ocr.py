r"""Lettura automatica delle scansioni e delle foto: motore veloce su tutto, modello preciso solo dove serve.

  1) il motore veloce (PP-OCR v6 piccolo, sul processore) legge tutte le pagine, più documenti insieme;
  2) ogni pagina riceve un voto senza conoscere il testo giusto (parole conosciute, ripetizioni, lunghezza);
  3) passano al motore preciso (PP-OCR v6 medio, 13 volte più lento) le pagine con il voto basso e quelle con
     importi (i numeri sono quello che il motore veloce sbaglia di più, e il voto non lo vede);
  4) per ogni pagina resta la lettura migliore; il dettaglio è nella tabella ocr_pagine del catalogo.

Prova del 17/11/2026 su 11 pagine sporcate come scansioni (parole / numeri giusti): v6 piccolo 96,2% / 93,8%
(4 s), v6 medio 97,0% / 96,8% (51 s), PaddleOCR-VL 1.6 in LM Studio 93,1% / 93,0% (97 s), Tesseract 89,0% /
85,8%, MiniCPM-V 4.7 1B 77,7% / 73,6%. Un modello di LM Studio si può ancora usare come preciso ("preciso":
"paddle"), ma è più lento e meno preciso. Senza rapidocr installato resta Tesseract.
Mai a nessun motore i contenuti riservati (password in chiaro).

Comandi (da archivio.py):
  python archivio.py ocr                    scansioni nuove (lo fa anche "aggiorna", ogni giorno)
  python archivio.py rileggi-ocr [--minuti N] [--prova N]
                                            rilegge con i motori nuovi le scansioni lette prima con Tesseract,
                                            per N minuti (si riprende da dove era rimasto)
  python archivio.py stato-ocr              quante pagine con quale motore, quante ne restano
Impostazioni nella chiave "ocr" di config.json (vedi OCR_BASE).
"""
import json
import os
import re
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import archivio as A  # noqa: E402
import ocr_modelli as O  # noqa: E402

OCR_BASE = {
    'attivo': True,
    'veloce': 'ppocrv6s',          # motore per tutte le pagine
    'preciso': 'ppocrv6m',         # motore per le pagine dubbie e con importi ('paddle' = modello in LM Studio)
    'importi': True,               # le pagine con importi vanno sempre al motore preciso
    'soglia_note': 0.92,           # sotto questa quota di parole conosciute la pagina va al modello preciso
    'min_caratteri': 60,           # pagine con meno testo di così: al modello preciso
    'pagine': 20,                  # pagine lette per ogni PDF
    'minuti_preciso': 90,          # tempo massimo del modello preciso a ogni passata (il resto alla volta dopo)
    'minuti_arretrati': 60,        # tempo ogni giorno per rileggere le scansioni vecchie
}

CAMBIATI = set()       # contenuti il cui testo è cambiato in questo programma: aggiorna() li riclassifica

SCHEMA_PAGINE = """CREATE TABLE IF NOT EXISTS ocr_pagine (
  impronta TEXT NOT NULL, pagina INTEGER NOT NULL,
  motore TEXT NOT NULL, caratteri INTEGER, note REAL, ripetizioni REAL, secondi REAL,
  testo TEXT, stato TEXT NOT NULL,          -- 'ok' | 'da_modello' | 'modello_fallito'
  veloce_note REAL, letto TEXT NOT NULL,
  PRIMARY KEY (impronta, pagina))"""


def config():
    try:
        with open(A.CONFIG, encoding='utf-8') as f:
            c = json.load(f).get('ocr') or {}
    except (OSError, ValueError):
        c = {}
    out = dict(OCR_BASE); out.update(c)
    if out['veloce'].startswith('ppocr'):
        try:
            import numpy  # noqa: F401
            import rapidocr  # noqa: F401
        except Exception as e:
            print(f'  motore veloce non disponibile ({type(e).__name__}: {str(e)[:150]}): uso Tesseract')
            out['veloce'] = 'tesseract'
            if out.get('preciso', '').startswith('ppocr'):
                out['preciso'] = None
    return out


# --- Pagine --------------------------------------------------------------------------------------------

def immagini(percorso, max_pagine=20, dpi=200):
    """(pagine totali, [immagini in scala di grigi])."""
    import testo as T
    est = os.path.splitext(percorso)[1].lower()
    if est in T.IMMAGINI:
        from PIL import Image, ImageOps
        with Image.open(percorso) as im:
            im = ImageOps.exif_transpose(im)
            im.thumbnail((3000, 3000))
            return 1, [im.convert('L')]
    sorgente = percorso
    if est == '.p7m':
        with open(percorso, 'rb') as f:
            sorgente = T.contenuto_p7m(f.read())
    import pypdfium2 as pdfium
    doc = pdfium.PdfDocument(sorgente)
    try:
        n = len(doc); out = []
        for i in range(min(n, max_pagine)):
            pg = doc[i]
            out.append(pg.render(scale=dpi / 72, grayscale=True).to_pil())
            pg.close()
        return n, out
    finally:
        doc.close()


def buona(q, cfg):
    return q['caratteri'] >= cfg['min_caratteri'] and q['note'] >= cfg['soglia_note'] and q['ripetizioni'] < 0.15


IMPORTO = re.compile(r'\d[\d.]*,\d{2}\b')
PAROLE_SOLDI = re.compile(r'(?i)\b(totale|imponibile|iva|importo|iban|euro|netto|lordo|saldo|dare|avere|prezzo|tributo)\b|€')


def con_importi(t):
    n = len(IMPORTO.findall(t or ''))
    return n >= 2 or (n == 1 and bool(PAROLE_SOLDI.search(t or '')))


def da_ripassare(p, cfg):
    return not buona(p, cfg) or (cfg.get('importi', True) and con_importi(p.get('testo')))


def raddrizza(img):
    """Pagina girata di 90/180/270 gradi? La gira (orientamento letto da Tesseract)."""
    import testo as T
    try:
        _, info = T._tesseract(img, psm='0')
    except Exception:
        return img
    m = re.search(r'Rotate: (\d+)', info)
    if m and m.group(1) != '0':
        return img.rotate(-int(m.group(1)), expand=True, fillcolor=255)
    return img


def _peso(q):
    return q['note'] * q['parole'] * (1 - q['ripetizioni'])


def leggi_veloce(lavoro):
    """In un processo a parte: tutte le pagine di un documento con il motore veloce."""
    imp, percorsi, cfg = lavoro
    import testo as T
    err = 'nessun file presente'
    for p in percorsi:
        if not os.path.exists(p):
            continue
        try:
            n, imgs = immagini(p, cfg['pagine'])
            pagine = []
            for img in imgs:
                t, s = O.leggi_pagina(img, cfg['veloce'])
                q = O.qualita(t)
                if not buona(q, cfg):
                    dritta = raddrizza(img)
                    if dritta is not img:
                        t2, s2 = O.leggi_pagina(dritta, cfg['veloce'])
                        q2 = O.qualita(t2)
                        if _peso(q2) > _peso(q):
                            t, q, s = t2, q2, s + s2
                pagine.append({'testo': t, 'secondi': round(s, 2), **q})
            metodo = 'ocr-immagine' if os.path.splitext(p)[1].lower() in T.IMMAGINI else 'ocr-pdf'
            return imp, {'percorso': p, 'pagine': n, 'righe': pagine, 'metodo': metodo}
        except Exception as e:
            err = f'{type(e).__name__}: {e}'[:300]
    return imp, {'errore': err}


# --- Salvataggio ---------------------------------------------------------------------------------------

def _unisci(db, imp):
    return '\n\n'.join(r[0] or '' for r in db.execute(
        'SELECT testo FROM ocr_pagine WHERE impronta=? ORDER BY pagina', (imp,)))


def salva_testo(db, imp, metodo, pagine, percorsi, quando):
    """Testo del documento = pagine in ordine. Stesse regole di prima: password in chiaro -> riservato.
    Se c'era già un testo letto e quello nuovo è molto peggiore (meno parole conosciute), resta quello di prima."""
    import testo as T
    r = T.esito(_unisci(db, imp), metodo, pagine)
    t = r.get('testo') or ''
    prima = db.execute('SELECT testo FROM testi WHERE impronta=?', (imp,)).fetchone()
    prima = (prima[0] if prima else None) or ''
    if r['esito'] != 'riservato' and prima.strip():
        qp, qn = O.qualita(prima), O.qualita(t)
        if qn['note'] * qn['parole'] < 0.8 * qp['note'] * qp['parole']:
            db.execute('UPDATE testi SET errore=NULL, letto=? WHERE impronta=?', (quando, imp))
            return 'tenuto'
    if t.strip() != prima.strip():
        CAMBIATI.add(imp)
    db.execute('UPDATE testi SET esito=?, metodo=?, caratteri=?, testo=?, errore=NULL, letto=? WHERE impronta=?',
               (r['esito'], r['metodo'], len(t), t or None, quando, imp))
    nomi = ' '.join(sorted({os.path.splitext(os.path.basename(p))[0] for p in percorsi}))
    db.execute('DELETE FROM ricerca WHERE impronta=?', (imp,))
    db.execute('INSERT INTO ricerca (impronta, nomi, testo) VALUES (?,?,?)', (imp, nomi, t))
    if r['esito'] == 'riservato':
        A.proteggi(db, imp)
        db.execute("UPDATE ocr_pagine SET testo=NULL, stato='ok' WHERE impronta=?", (imp,))
    return r['esito']


# --- Le due fasi ---------------------------------------------------------------------------------------

def fase_veloce(db, imps, percorsi, cfg):
    """Motore veloce su tutti i documenti indicati. Ritorna {esito: n}."""
    from concurrent.futures import ProcessPoolExecutor
    db.execute(SCHEMA_PAGINE)
    lavori = [(i, percorsi[i], cfg) for i in imps]
    if not lavori:
        return {}
    fili = 4 if cfg['veloce'].startswith('ppocr') else 1   # misurato: 3 processi x 4 fili = 2,4 s a pagina
    os.environ['OCR_FILI'] = str(fili)          # ereditato dai processi
    processi = max(1, ((os.cpu_count() or 4) - 4) // fili)
    O.vocabolario()                              # preparato qui, prima dei processi (non tutti insieme)
    t0 = time.time(); conta = {}; quando = A.adesso(); pag = 0
    def salva(k, imp, r):
        nonlocal pag
        if 'errore' in r:
            db.execute('UPDATE testi SET errore=?, letto=? WHERE impronta=?', (r['errore'], quando, imp))
            conta['errore'] = conta.get('errore', 0) + 1
            return
        db.execute('DELETE FROM ocr_pagine WHERE impronta=?', (imp,))
        for i, p in enumerate(r['righe']):
            db.execute('INSERT INTO ocr_pagine VALUES (?,?,?,?,?,?,?,?,?,?,?)',
                       (imp, i, cfg['veloce'], p['caratteri'], p['note'], p['ripetizioni'], p['secondi'], p['testo'],
                        'da_modello' if cfg.get('preciso') and da_ripassare(p, cfg) else 'ok', p['note'], quando))
        pag += len(r['righe'])
        e = salva_testo(db, imp, r['metodo'], r['pagine'], percorsi[imp], quando)
        conta[e] = conta.get(e, 0) + 1
        if k % 25 == 0:
            db.commit()
            print(f'  ... {k}/{len(lavori)} ({time.time() - t0:.0f} s, {pag / (time.time() - t0):.2f} pagine/s)')

    try:
        with ProcessPoolExecutor(max_workers=processi) as ex:
            futuri = [(ex.submit(leggi_veloce, lav), lav[0]) for lav in lavori]
            for k, (f, imp) in enumerate(futuri, 1):
                try:
                    _, r = f.result()
                except Exception as e:      # processo caduto (memoria, file strano): il documento si segna e si va avanti
                    r = {'errore': f'lettura interrotta: {type(e).__name__}'}
                salva(k, imp, r)
    except Exception as e:
        print(f'  lettura veloce interrotta: {type(e).__name__}: {str(e)[:150]}')
    db.commit()
    dur = max(1.0, time.time() - t0)
    print(f'  lettura veloce ({cfg["veloce"]}): {len(lavori)} documenti, {pag} pagine in {dur:.0f} s')
    A.registra(db, 'lettura ottica', chi='ocr-' + cfg['veloce'], **conta, pagine=pag, secondi=round(dur))
    db.commit()
    return conta


def leggi_precisa(lavoro):
    """In un processo a parte: le pagine indicate di un documento con il motore preciso."""
    imp, percorsi, pagine, motore = lavoro
    out = {}
    p = next((x for x in percorsi if os.path.exists(x)), None)
    if not p:
        return imp, {'errore': 'nessun file presente'}
    try:
        _, imgs = immagini(p, max(pagine) + 1)
        for i in pagine:
            img = imgs[i]
            t, s = O.leggi_pagina(img, motore)
            q = O.qualita(t)
            if q['caratteri'] < 40:                       # pagina girata? riprova dritta
                dritta = raddrizza(img)
                if dritta is not img:
                    t2, s2 = O.leggi_pagina(dritta, motore)
                    q2 = O.qualita(t2)
                    if _peso(q2) > _peso(q):
                        t, q, s = t2, q2, s + s2
            out[i] = {'testo': t, 'secondi': round(s, 1), **q}
    except Exception as e:
        return imp, {'errore': f'{type(e).__name__}: {e}'[:300], 'fatte': out}
    return imp, {'fatte': out}


def fase_precisa(db, percorsi, cfg, minuti=None, solo=None):
    """Pagine 'da_modello' -> motore preciso, finché c'è tempo. Ritorna (fatte, rimaste, documenti toccati)."""
    db.execute(SCHEMA_PAGINE)
    minuti = cfg['minuti_preciso'] if minuti is None else minuti
    righe = [r for r in db.execute(
        "SELECT p.impronta, p.pagina, p.caratteri, p.note FROM ocr_pagine p JOIN contenuti c USING(impronta) "
        "WHERE p.stato='da_modello' AND c.stato!='riservato' ORDER BY p.letto, p.impronta, p.pagina")
        if r[0] in percorsi and (solo is None or r[0] in solo)]
    motore = cfg.get('preciso')
    if not righe or not motore or minuti <= 0:
        return 0, len(righe), set()
    vecchie = {(r[0], r[1]): (r[2], r[3]) for r in righe}
    per_doc = {}
    for r in righe:
        per_doc.setdefault(r[0], []).append(r[1])
    in_lmstudio = bool(O.MOTORI.get(motore))
    if in_lmstudio and not O.accendi_server():
        print('  motore preciso: LM Studio non risponde, le pagine si riprovano alla prossima passata')
        return 0, len(righe), set()
    print(f'  motore preciso ({motore}): {len(righe)} pagine dubbie o con importi in {len(per_doc)} documenti')
    t0 = time.time(); fatte = 0; toccati = set(); quando = A.adesso()

    def registra_doc(imp, r):
        nonlocal fatte
        for i, q in (r.get('fatte') or {}).items():
            car, note = vecchie[(imp, i)]
            # si tiene la lettura precisa se non è andata in loop e non ha perso testo né parole conosciute
            tiene = q['ripetizioni'] < 0.3 and q['caratteri'] >= 0.6 * (car or 0) and q['note'] >= (note or 0) - 0.03
            if tiene:
                db.execute("UPDATE ocr_pagine SET motore=?, caratteri=?, note=?, ripetizioni=?, secondi=?, testo=?, "
                           "stato='ok', letto=? WHERE impronta=? AND pagina=?",
                           (motore, q['caratteri'], q['note'], q['ripetizioni'], q['secondi'], q['testo'], quando, imp, i))
            else:
                db.execute("UPDATE ocr_pagine SET stato='ok', letto=? WHERE impronta=? AND pagina=?", (quando, imp, i))
            fatte += 1; toccati.add(imp)
        if r.get('errore'):
            print(f'    documento non letto del tutto: {r["errore"][:120]}')
            for i in per_doc[imp]:
                if i not in (r.get('fatte') or {}):
                    db.execute("UPDATE ocr_pagine SET stato='modello_fallito', letto=? WHERE impronta=? AND pagina=?",
                               (quando, imp, i))

    try:
        lavori = [(imp, percorsi[imp], pag, motore) for imp, pag in per_doc.items()]
        if in_lmstudio:                                  # un modello solo in memoria: un documento alla volta
            for lav in lavori:
                if time.time() - t0 > minuti * 60:
                    break
                registra_doc(*leggi_precisa(lav))
                db.commit()
        else:
            from concurrent.futures import ProcessPoolExecutor, FIRST_COMPLETED, wait
            os.environ['OCR_FILI'] = '4'
            processi = max(1, ((os.cpu_count() or 4) - 4) // 4)
            with ProcessPoolExecutor(max_workers=processi) as ex:
                coda = iter(lavori); in_corso = set(); ultimo = 0; attesi = {}
                while True:
                    while len(in_corso) < processi and time.time() - t0 < minuti * 60:
                        lav = next(coda, None)
                        if lav is None:
                            break
                        fut = ex.submit(leggi_precisa, lav)
                        attesi[fut] = lav[0]; in_corso.add(fut)
                    if not in_corso:
                        break
                    finiti, in_corso = wait(in_corso, return_when=FIRST_COMPLETED)
                    for f in finiti:
                        try:
                            registra_doc(*f.result())
                        except Exception as e:       # processo caduto: le pagine si segnano e non si riprovano
                            imp = attesi.get(f)
                            if imp:
                                registra_doc(imp, {'errore': f'lettura interrotta: {type(e).__name__}', 'fatte': {}})
                            if 'Broken' in type(e).__name__:
                                in_corso = set(); break
                    db.commit()
                    if fatte - ultimo >= 20:
                        ultimo = fatte
                        print(f'    ... {fatte} pagine ({time.time() - t0:.0f} s)')
    finally:
        for imp in toccati:
            r = db.execute('SELECT metodo, pagine FROM testi WHERE impronta=?', (imp,)).fetchone()
            base = (r[0] or 'ocr-pdf').split('+')[0]
            salva_testo(db, imp, base + '+' + motore, r[1], percorsi[imp], quando)
        db.commit()
        if in_lmstudio:
            O.scarica()
    dur = time.time() - t0
    A.registra(db, 'lettura ottica precisa', chi='ocr-' + motore, pagine=fatte,
               rimaste=len(righe) - fatte, secondi=round(dur))
    db.commit()
    print(f'  motore preciso: {fatte} pagine in {dur:.0f} s, ne restano {len(righe) - fatte}')
    return fatte, len(righe) - fatte, toccati


# --- Comandi -------------------------------------------------------------------------------------------

def _percorsi(db):
    out = {}
    for r in db.execute('SELECT impronta, percorso FROM file WHERE presente=1'):
        out.setdefault(r[0], []).append(r[1])
    return out


def scansioni_nuove(solo_nuove=False):
    """Al posto della lettura con solo Tesseract: contenuti 'da_ocr' -> fase veloce -> fase precisa.
    Ritorna l'insieme dei contenuti il cui testo è cambiato."""
    cfg = config()
    db = A.apri_db(); db.execute(SCHEMA_PAGINE)
    percorsi = _percorsi(db)
    cond = ' AND errore IS NULL' if solo_nuove else ''
    imps = [r[0] for r in db.execute("SELECT impronta FROM testi WHERE esito='da_ocr'" + cond) if r[0] in percorsi]
    if '--prova' in sys.argv:
        imps = imps[:int(sys.argv[sys.argv.index('--prova') + 1])]
    print(f'Scansioni da leggere: {len(imps)}')
    fase_veloce(db, imps, percorsi, cfg)
    _, _, toccati = fase_precisa(db, percorsi, cfg)
    db.close()
    return set(imps) | toccati


def rileggi(minuti=None, riclassifica=True):
    """Scansioni lette prima solo con Tesseract -> motori nuovi, per 'minuti' (si riprende da dove era rimasto).
    Prima i documenti con il testo peggiore. Alla fine riclassifica quelli cambiati (le scelte a mano restano)."""
    cfg = config()
    if minuti is None:
        minuti = float(O.A_arg('--minuti', cfg['minuti_arretrati']))
    db = A.apri_db(); db.execute(SCHEMA_PAGINE)
    percorsi = _percorsi(db)
    if cfg['veloce'] == 'tesseract':
        print("Scansioni vecchie: il motore veloce manca, rileggerle con Tesseract non serve")
        db.close()
        return set()
    fatti = {r[0] for r in db.execute("SELECT DISTINCT impronta FROM ocr_pagine WHERE motore != 'tesseract'")}
    righe = db.execute("""SELECT t.impronta, t.caratteri, COALESCE(t.pagine, 1) FROM testi t JOIN contenuti c USING(impronta)
                          WHERE t.metodo LIKE 'ocr%' AND t.esito IN ('ok', 'vuoto') AND c.stato != 'riservato'
                          AND t.errore IS NULL""").fetchall()
    imps = [r[0] for r in sorted(righe, key=lambda r: (r[1] or 0) / r[2]) if r[0] in percorsi and r[0] not in fatti]
    if '--prova' in sys.argv:
        imps = imps[:int(sys.argv[sys.argv.index('--prova') + 1])]
    print(f'Scansioni vecchie da rileggere: {len(imps)} (tempo {minuti:.0f} minuti)')
    t0 = time.time()
    in_attesa = db.execute("SELECT COUNT(*) FROM ocr_pagine WHERE stato='da_modello'").fetchone()[0]
    quota = 0.0 if in_attesa > 300 else 0.5            # troppe pagine in attesa del motore preciso: prima quelle
    for i in range(0, len(imps), 40):                   # a gruppi: si ferma quando finisce il tempo
        if time.time() - t0 > minuti * 60 * quota:      # metà del tempo alla lettura veloce, il resto al preciso
            break
        fase_veloce(db, imps[i:i + 40], percorsi, cfg)
    resto = max(0.0, minuti - (time.time() - t0) / 60)
    fase_precisa(db, percorsi, cfg, minuti=resto)      # anche le pagine rimaste dalle volte prima
    db.close()
    cambiati = set(CAMBIATI)                            # solo dove il testo è cambiato davvero
    if cambiati and riclassifica:
        print(f'Riclassifico {len(cambiati)} documenti con il testo nuovo (le scelte di Claude e a mano restano)')
        A.classifica_tutto(solo=cambiati)
    return cambiati


def priorita_bassa():
    """I tuoi programmi prima di questo: priorità 'sotto il normale' (la ereditano anche i processi di lettura)."""
    if os.name == 'nt':
        try:
            import ctypes
            k = ctypes.windll.kernel32
            k.GetCurrentProcess.restype = ctypes.c_void_p
            k.SetPriorityClass(ctypes.c_void_p(k.GetCurrentProcess()), 0x4000)   # BELOW_NORMAL_PRIORITY_CLASS
        except Exception:
            pass


def all_avvio():
    """Per l'attività di Windows all'accesso: scansioni vecchie per --minuti (120), con registro in
    ArchivioAzienda\\ocr-avvio-log.txt, priorità bassa e lo stesso blocco di 'aggiorna' (mai due giri insieme).
    Quando non resta niente da rileggere esce subito."""
    os.makedirs(A.DATI, exist_ok=True)
    f = open(os.path.join(A.DATI, 'ocr-avvio-log.txt'), 'a', encoding='utf-8', buffering=1)
    sys.stdout = sys.stderr = f
    print(f'\n===== Scansioni vecchie all\'avvio {A.adesso()} =====')
    blocco = os.path.join(A.DATI, 'aggiorna.lock')
    if os.path.exists(blocco) and time.time() - os.path.getmtime(blocco) < 6 * 3600:
        print('Un aggiornamento è in corso: riprovo al prossimo avvio.')
        return
    cfg = config()
    if not cfg['attivo'] or cfg['veloce'] == 'tesseract':
        print('Lettura nuova spenta o motore veloce mancante: niente da fare.')
        return
    open(blocco, 'w').write(str(os.getpid()))
    try:
        priorita_bassa()
        rileggi(float(O.A_arg('--minuti', '120')))
        stato()
    finally:
        try:
            os.remove(blocco)
        except OSError:
            pass


def stato():
    db = A.apri_db(); db.execute(SCHEMA_PAGINE)
    print('Pagine lette per motore e stato:')
    for r in db.execute('SELECT motore, stato, COUNT(*), ROUND(AVG(note), 3), ROUND(AVG(secondi), 1) FROM ocr_pagine '
                        'GROUP BY motore, stato ORDER BY 3 DESC'):
        print(f'  {r[0]:<10} {r[1]:<16} {r[2]:>6} pagine   parole conosciute {r[3] or 0:.1%}   {r[4] or 0} s/pagina')
    fatti = {r[0] for r in db.execute("SELECT DISTINCT impronta FROM ocr_pagine WHERE motore != 'tesseract'")}
    vecchi = sum(1 for (i,) in db.execute("SELECT impronta FROM testi WHERE metodo LIKE 'ocr%' AND esito IN ('ok','vuoto')")
                 if i not in fatti)
    print(f'Scansioni ancora lette solo con Tesseract: {vecchi}')
    db.close()
