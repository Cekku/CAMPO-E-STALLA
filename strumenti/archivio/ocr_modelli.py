r"""Lettura ottica (OCR) con i modelli sul PC: PaddleOCR-VL, Xiaomi-OCR-0, MiniCPM-V e Tesseract.

I modelli girano in LM Studio (server OpenAI-compatibile su 127.0.0.1:1234): le immagini delle pagine non
escono dal PC. Qui ci sono:
  - i "motori" (come si chiede a ogni modello di leggere una pagina e come si pulisce la sua risposta);
  - la misura della qualità di un testo letto (parole italiane conosciute, ripetizioni, caratteri);
  - la prova che confronta i motori su pagine di cui si conosce il testo giusto.

Comandi (da archivio.py):
  python archivio.py prova-ocr N [--motori paddle,xiaomi,minicpm,tesseract] [--seme 1] [--sporca]
        prende N PDF digitali del catalogo (tipi diversi), ne fa l'immagine della prima pagina, la fa leggere
        a ogni motore e confronta con il testo vero del PDF. --sporca rovina l'immagine come una scansione
        (storta, rumore, JPEG). Risultati in ArchivioAzienda\prove-ocr.
  python archivio.py prova-ocr --confronta     tabella di tutte le prove
"""
import base64
import collections
import io
import json
import os
import random
import re
import sqlite3
import subprocess
import sys
import time
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import archivio as A  # noqa: E402

def librerie_utente():
    """rapidocr, onnxruntime e numpy stanno in ArchivioAzienda/librerie nella cartella dell'utente (pip install --target).
    Non con 'pip --user': installati dall'app Claude finivano in una cartella AppData che vedono solo i programmi
    avviati da lì, non le attività di Windows (guasto del 17/11, "No module named 'numpy'")."""
    p = os.path.join(os.path.expanduser('~'), 'ArchivioAzienda', 'librerie')
    if os.path.isdir(p) and p not in sys.path:
        sys.path.insert(0, p)


librerie_utente()


def piena_velocita():
    """Windows 11 mette i programmi in secondo piano "a risparmio" (core lenti): la lettura di una pagina passava
    da 4 a 20 secondi. Qui si chiede di non rallentare questo processo (vale solo per lui, nessuna impostazione
    del sistema cambia)."""
    if os.name != 'nt':
        return False
    try:
        import ctypes
        from ctypes import wintypes as W

        class _PPT(ctypes.Structure):
            _fields_ = [('Version', W.ULONG), ('ControlMask', W.ULONG), ('StateMask', W.ULONG)]
        k = ctypes.WinDLL('kernel32', use_last_error=True)
        k.GetCurrentProcess.restype = W.HANDLE
        k.SetProcessInformation.argtypes = [W.HANDLE, ctypes.c_int, ctypes.c_void_p, W.DWORD]
        s = _PPT(1, 1, 0)       # versione 1, controllo "velocità di esecuzione", stato spento
        return bool(k.SetProcessInformation(k.GetCurrentProcess(), 4, ctypes.byref(s), ctypes.sizeof(s)))
    except Exception:
        return False


piena_velocita()          # ogni processo che carica questo modulo (anche quelli della lettura in parallelo)

LMS = os.path.join(os.path.expanduser('~'), '.lmstudio', 'bin', 'lms.exe')
URL = 'http://127.0.0.1:1234/v1'
PROVE = os.path.join(A.DATI, 'prove-ocr')
VOCABOLARIO = os.path.join(A.DATI, 'vocabolario.txt')

PROMPT_XIAOMI = ('Extract all information from the main body of the document image and represent it in markdown '
                 'format, ignoring headers and footers. Tables should be expressed in OTSL format, formulas in the '
                 'document should be represented using LATEX format, and the parsing should be organized according '
                 'to the reading order.')
PROMPT_MINICPM = ('Trascrivi fedelmente tutto il testo di questa pagina, in ordine di lettura, riga per riga. '
                  'Le tabelle riga per riga con le celle separate da " | ". Non riassumere, non tradurre, non '
                  'aggiungere niente.')

# modello = chiave di LM Studio (o una parte del nome); lato = lato lungo massimo dell'immagine mandata
MOTORI = {
    'paddle': {'modello': 'paddleocr-vl-1.6', 'prompt': 'OCR:', 'lato': 1600},
    'xiaomi': {'modello': 'xiaomi-ocr-0', 'prompt': PROMPT_XIAOMI, 'lato': 1600},
    'minicpm': {'modello': 'minicpm-v-4.7-1b', 'prompt': PROMPT_MINICPM, 'lato': 1600},
    'tesseract': None,
}


# --- LM Studio ---------------------------------------------------------------------------------------

def _http(url, corpo=None, timeout=900):
    dati = json.dumps(corpo).encode('utf-8') if corpo is not None else None
    req = urllib.request.Request(url, data=dati, method='POST' if dati else 'GET',
                                 headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode('utf-8'))


def modelli_lmstudio():
    """{chiave: caricato} dei modelli che LM Studio ha sul PC."""
    d = _http(URL.rsplit('/v1', 1)[0] + '/api/v0/models', timeout=10)
    return {m['id']: m.get('state') == 'loaded' for m in d.get('data', [])}


def chiave_modello(parte):
    for k in modelli_lmstudio():
        if parte.lower() in k.lower():
            return k
    return None


def accendi_server():
    try:
        modelli_lmstudio()
        return True
    except OSError:
        pass
    if os.path.exists(LMS):
        subprocess.run([LMS, 'server', 'start'], capture_output=True, timeout=120)
        for _ in range(30):
            try:
                modelli_lmstudio()
                return True
            except OSError:
                time.sleep(1)
    return False


CARICATI = []


GPU = os.environ.get('OCR_GPU', 'off')      # la scheda grafica integrata va in errore con le immagini grandi
PARALLELO = int(os.environ.get('OCR_PARALLELO', '1'))


def carica(parte, contesto=16384):
    """Carica il modello (se non è già in memoria) e ne ritorna la chiave."""
    k = chiave_modello(parte)
    if not k:
        raise RuntimeError(f'in LM Studio non c\'è il modello "{parte}"')
    if not modelli_lmstudio().get(k):
        r = subprocess.run([LMS, 'load', k, '--context-length', str(contesto * PARALLELO), '--ttl', '1800',
                            '--gpu', GPU, '--parallel', str(PARALLELO), '-y'],
                           capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=600)
        if r.returncode != 0:
            raise RuntimeError(f'non riesco a caricare {k}: ' + (r.stderr or r.stdout).strip()[-300:])
        CARICATI.append(k)
    return k


def scarica(chiavi=None):
    for k in [c for c in (chiavi or list(CARICATI)) if c]:
        subprocess.run([LMS, 'unload', k], capture_output=True, timeout=120)
        if k in CARICATI:
            CARICATI.remove(k)


# --- Immagini ----------------------------------------------------------------------------------------

def png64(img, lato):
    from PIL import Image
    img = img.convert('RGB')
    if max(img.size) > lato:
        img = img.copy()
        img.thumbnail((lato, lato), Image.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, 'PNG')
    return 'data:image/png;base64,' + base64.b64encode(buf.getvalue()).decode('ascii')


def pagina_pdf(percorso, n=0, dpi=200, gris=True):
    import pypdfium2 as pdfium
    doc = pdfium.PdfDocument(percorso)
    try:
        pg = doc[n]
        img = pg.render(scale=dpi / 72, grayscale=gris).to_pil()
        testo = pg.get_textpage().get_text_range()
        pg.close()
        return img, testo, len(doc)
    finally:
        doc.close()


def sporca(img, seme=0):
    """Rovina l'immagine come una scansione o una foto: un po' storta, rumore, risoluzione bassa, JPEG."""
    from PIL import Image, ImageFilter
    rnd = random.Random(seme)
    img = img.convert('L')
    w, h = img.size
    img = img.rotate(rnd.uniform(-1.5, 1.5), expand=True, fillcolor=255, resample=Image.BICUBIC)
    img = img.resize((int(w * 0.7), int(h * 0.7)), Image.BILINEAR).resize((w, h), Image.BILINEAR)
    rumore = Image.effect_noise(img.size, 28).convert('L')
    img = Image.blend(img, rumore, 0.12).filter(ImageFilter.GaussianBlur(0.6))
    buf = io.BytesIO()
    img.save(buf, 'JPEG', quality=35)
    return Image.open(io.BytesIO(buf.getvalue())).convert('L')


# --- Lettura di una pagina ---------------------------------------------------------------------------

def _otsl_in_righe(t):
    """Tabelle OTSL (<fcel>, <ecel>, <nl>…) → righe con celle separate da ' | '."""
    if '<fcel>' not in t and '<ecel>' not in t and '<otsl>' not in t:
        return t
    t = re.sub(r'</?otsl>', '\n', t)
    t = re.sub(r'<nl>', '\n', t)
    t = re.sub(r'<(fcel|ched|rhed|srow)>', ' | ', t)
    t = re.sub(r'<(ecel|lcel|ucel|xcel)>', ' | ', t)
    return re.sub(r'(\s*\|\s*)+', ' | ', t)


def pulisci_uscita(t):
    t = t or ''
    t = re.sub(r'<think>.*?</think>', '', t, flags=re.S)
    t = _otsl_in_righe(t)
    t = re.sub(r'<[^>\n]{1,20}>', ' ', t)                 # altri segni dei modelli
    t = re.sub(r'(?m)^\s*#{1,6}\s*', '', t)               # titoli markdown
    t = re.sub(r'\*\*|__', '', t)
    t = re.sub(r'(?m)^\s*\|?\s*:?-{3,}.*$', '', t)        # righe di separazione delle tabelle markdown
    t = re.sub(r'\\\(|\\\)|\$', '', t)
    return re.sub(r'\n{3,}', '\n\n', t).strip()


def ripetizioni(t):
    """Quota del testo fatta di righe ripetute (i modelli a volte vanno in loop)."""
    righe = [r.strip() for r in t.splitlines() if len(r.strip()) > 3]
    if len(righe) < 6:
        return 0.0
    c = collections.Counter(righe)
    rip = sum(n - 1 for r, n in c.items() if n > 2)
    return rip / len(righe)


_RAPID = {}


def _rapid(tipo):
    """PP-OCR di PaddlePaddle (rilevamento + lettura delle righe) con onnxruntime, sul processore."""
    if tipo not in _RAPID:
        from rapidocr import RapidOCR, OCRVersion, ModelType, LangRec, LangDet
        if tipo.startswith('v6'):
            mt = {'v6t': ModelType.TINY, 'v6s': ModelType.SMALL}.get(tipo, ModelType.MEDIUM)
            par = {'Det.ocr_version': OCRVersion.PPOCRV6, 'Det.model_type': mt, 'Det.lang_type': LangDet.CH,
                   'Rec.ocr_version': OCRVersion.PPOCRV6, 'Rec.model_type': mt, 'Rec.lang_type': LangRec.CH}
        else:
            par = {'Det.ocr_version': OCRVersion.PPOCRV5, 'Rec.ocr_version': OCRVersion.PPOCRV5,
                   'Rec.lang_type': LangRec.LATIN, 'Det.model_type': ModelType.MOBILE, 'Rec.model_type': ModelType.MOBILE}
        par['Global.log_level'] = 'error'
        par['EngineConfig.onnxruntime.intra_op_num_threads'] = int(os.environ.get('OCR_FILI', '-1'))
        par['EngineConfig.onnxruntime.inter_op_num_threads'] = 1
        _RAPID[tipo] = RapidOCR(params=par)
    return _RAPID[tipo]


def righe_da_caselle(caselle, testi):
    """Mette in righe le caselle di testo trovate (in alto prima, poi da sinistra a destra)."""
    el = []
    for b, t in zip(caselle, testi):
        ys = [p[1] for p in b]; xs = [p[0] for p in b]
        el.append(((min(ys) + max(ys)) / 2, max(ys) - min(ys), min(xs), t))
    if not el:
        return ''
    alt = sorted(e[1] for e in el)[len(el) // 2] or 10
    el.sort()
    righe, cor, y0 = [], [], None
    for y, h, x, t in el:
        if y0 is not None and y - y0 > alt * 0.55:
            righe.append(cor); cor = []
        if not cor:
            y0 = y
        cor.append((x, t))
    righe.append(cor)
    return '\n'.join('  '.join(t for _, t in sorted(r)) for r in righe)


def leggi_pagina(img, motore, max_token=4096):
    """(testo, secondi) della pagina letta con il motore indicato."""
    t0 = time.time()
    if motore == 'tesseract':
        import testo as T
        return T._ocr_immagine(img), time.time() - t0
    if motore.startswith('ppocr'):
        import numpy as np
        r = _rapid(motore[5:] or 'v6m')(np.array(img.convert('RGB')))
        if r.boxes is None:
            return '', time.time() - t0
        return righe_da_caselle(r.boxes.tolist(), r.txts), time.time() - t0
    m = MOTORI[motore]
    k = carica(m['modello'])
    corpo = {'model': k, 'temperature': 0, 'max_tokens': max_token, 'stream': False,
             'messages': [{'role': 'user', 'content': [
                 {'type': 'image_url', 'image_url': {'url': png64(img, m['lato'])}},
                 {'type': 'text', 'text': m['prompt']}]}]}
    r = _http(URL + '/chat/completions', corpo)
    testo = r['choices'][0]['message'].get('content') or ''
    return pulisci_uscita(testo), time.time() - t0


# --- Misure ------------------------------------------------------------------------------------------

def parole(t):
    return re.findall(r'[a-zàèéìòóù]{2,}', (t or '').lower())


def numeri(t):
    return [n.strip('.,') for n in re.findall(r'\d[\d.,/:-]*\d|\d', t or '')]


def f1(vero, letto):
    v, l = collections.Counter(vero), collections.Counter(letto)
    if not v:
        return None
    comuni = sum((v & l).values())
    p = comuni / max(1, sum(l.values()))
    r = comuni / sum(v.values())
    return 0.0 if p + r == 0 else 2 * p * r / (p + r)


_VOC = None


def vocabolario():
    """Parole conosciute: quelle che compaiono almeno 3 volte nei PDF digitali del catalogo (resta sul PC)."""
    global _VOC
    if _VOC is not None:
        return _VOC
    if not os.path.exists(VOCABOLARIO):
        db = sqlite3.connect(f'file:{A.DB}?mode=ro', uri=True)
        c = collections.Counter()
        for (t,) in db.execute("SELECT testo FROM testi WHERE metodo='pdf' AND esito='ok' AND testo IS NOT NULL"):
            c.update(set(w for w in parole(t[:20000]) if len(w) >= 3))
        db.close()
        tmp = f'{VOCABOLARIO}.{os.getpid()}.tmp'    # prima in un file a parte, poi al suo posto in un colpo
        with open(tmp, 'w', encoding='utf-8') as f:
            f.write('\n'.join(sorted(w for w, n in c.items() if n >= 3)))
        os.replace(tmp, VOCABOLARIO)
    with open(VOCABOLARIO, encoding='utf-8') as f:
        _VOC = set(f.read().split())
    return _VOC


def qualita(t):
    """Misura senza conoscere il testo giusto: quota di parole conosciute, ripetizioni, lunghezza."""
    ws = [w for w in parole(t) if len(w) >= 3]
    voc = vocabolario()
    note = sum(1 for w in ws if w in voc) / len(ws) if ws else 0.0
    return {'caratteri': len(t or ''), 'parole': len(ws), 'note': round(note, 3), 'ripetizioni': round(ripetizioni(t or ''), 3)}


# --- Prova -------------------------------------------------------------------------------------------

ESCLUSI = {'Documento-identita', 'Permesso-di-soggiorno', 'Referto-medico', 'Idoneita'}


def campione(n, seme):
    """N PDF digitali di tipi diversi (prima pagina con 300-5000 caratteri), mai riservati né dati sanitari."""
    db = sqlite3.connect(f'file:{A.DB}?mode=ro', uri=True)
    db.row_factory = sqlite3.Row
    righe = db.execute("""SELECT t.impronta, c.tipo, (SELECT percorso FROM file f WHERE f.impronta=t.impronta AND presente=1 LIMIT 1) p
                          FROM testi t JOIN contenuti c USING(impronta)
                          WHERE t.metodo='pdf' AND t.esito='ok' AND c.stato!='riservato'""").fetchall()
    db.close()
    per_tipo = collections.defaultdict(list)
    for r in righe:
        if r['p'] and r['tipo'] not in ESCLUSI and os.path.exists(r['p']):
            per_tipo[r['tipo'] or '-'].append(r)
    rnd = random.Random(seme)
    tipi = sorted(per_tipo, key=lambda t: -len(per_tipo[t]))
    for t in tipi:
        rnd.shuffle(per_tipo[t])
    scelti = []
    giro = 0
    while len(scelti) < n and giro < 50:
        for t in tipi[:25]:
            if len(scelti) >= n:
                break
            while per_tipo[t]:
                r = per_tipo[t].pop()
                try:
                    img, vero, _ = pagina_pdf(r['p'])
                except Exception:
                    continue
                if 300 <= len(vero.strip()) <= 5000:
                    scelti.append((r['impronta'], r['tipo'], r['p']))
                    break
        giro += 1
    return scelti


def prova():
    n = int(next((a for a in sys.argv[2:] if a.isdigit()), '20'))
    seme = int(A_arg('--seme', '1'))
    motori = A_arg('--motori', 'paddle,xiaomi,minicpm,tesseract').split(',')
    sp = '--sporca' in sys.argv
    if A_arg('--lato', None):
        for m in MOTORI.values():
            if m:
                m['lato'] = int(A_arg('--lato', None))
    os.makedirs(PROVE, exist_ok=True)
    if any(m != 'tesseract' for m in motori) and not accendi_server():
        print('LM Studio non risponde'); return
    docs = campione(n, seme)
    print(f'{len(docs)} pagine, motori: {", ".join(motori)}{" (immagini sporcate)" if sp else ""}')
    pagine = []
    for i, (imp, tipo, p) in enumerate(docs):
        img, vero, _ = pagina_pdf(p)
        if sp:
            img = sporca(img, seme * 1000 + i)
        pagine.append((imp, tipo, img, vero))
    nome = (time.strftime('%Y%m%d-%H%M') + f'-n{len(docs)}-s{seme}{"-sporca" if sp else ""}'
            + (f'-lato{A_arg("--lato", "")}' if A_arg('--lato', None) else ''))
    ris = []
    for m in motori:                      # un motore alla volta: un solo modello in memoria
        for imp, tipo, img, vero in pagine:
            try:
                letto, sec = leggi_pagina(img, m)
                err = None
            except Exception as e:
                letto, sec, err = '', 0, f'{type(e).__name__}: {e}'[:200]
            q = qualita(letto)
            ris.append({'motore': m, 'impronta': imp, 'tipo': tipo, 'secondi': round(sec, 1), 'errore': err,
                        'parole_f1': f1(parole(vero), parole(letto)), 'numeri_f1': f1(numeri(vero), numeri(letto)),
                        **q, 'letto': letto[:3000]})
            r = ris[-1]
            print(f'  {m:<9} {tipo or "-":<22} parole {r["parole_f1"] or 0:.2f}  numeri {r["numeri_f1"] or 0:.2f}  '
                  f'{sec:5.1f} s {"ERRORE " + err if err else ""}')
        if MOTORI.get(m):
            scarica([chiave_modello(MOTORI[m]['modello'])])
        _salva(ris, nome)
    riepilogo(ris, nome)


def _salva(ris, nome):
    with open(os.path.join(PROVE, nome + '.json'), 'w', encoding='utf-8') as f:
        json.dump(ris, f, ensure_ascii=False, indent=1)


def _media(xs):
    xs = [x for x in xs if x is not None]
    return sum(xs) / len(xs) if xs else 0


def riepilogo(ris, nome=''):
    print(f'\n{nome}\n{"motore":<10} {"parole":>7} {"numeri":>7} {"note":>6} {"s/pag":>6} {"errori":>6}')
    for m in dict.fromkeys(r['motore'] for r in ris):
        rr = [r for r in ris if r['motore'] == m]
        print(f'{m:<10} {_media(r["parole_f1"] for r in rr):7.1%} {_media(r["numeri_f1"] for r in rr):7.1%} '
              f'{_media(r["note"] for r in rr):6.1%} {_media(r["secondi"] for r in rr):6.1f} '
              f'{sum(1 for r in rr if r["errore"]):6}')


def confronta():
    for f in sorted(os.listdir(PROVE)):
        if f.endswith('.json'):
            with open(os.path.join(PROVE, f), encoding='utf-8') as fh:
                riepilogo(json.load(fh), f[:-5])


def A_arg(nome, base):
    if nome in sys.argv:
        i = sys.argv.index(nome)
        if i + 1 < len(sys.argv):
            return sys.argv[i + 1]
    return base


def comando_prova():
    if '--confronta' in sys.argv:
        confronta()
    else:
        prova()
