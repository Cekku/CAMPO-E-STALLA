"""Estrazione del testo dai documenti per l'archivio (solo lettura, nessun file scritto).

estrai(percorso) -> {'esito', 'metodo', 'pagine', 'testo', 'errore'}
  esito: 'ok' | 'da_ocr' (scansione o immagine: serve la lettura ottica) | 'vuoto' | 'non_supportato' | 'errore'

Formati: PDF (PDFium), Word/OpenDocument/PowerPoint nuovi (XML nello zip), Excel (openpyxl),
Word/Excel vecchi .doc/.xls (testo grezzo dal file binario), P7M firmati (contenuto estratto dalla busta),
XML (fatture elettroniche), e-mail .eml, testo/CSV/HTML, ZIP (solo l'elenco dei file contenuti).
"""
import base64
import email
import email.policy
import html
import io
import os
import re
import warnings
import zipfile

warnings.filterwarnings('ignore', module='openpyxl')

MAX_CARATTERI = 200_000
MAX_PAGINE = 40
POCO_TESTO = 25            # caratteri per pagina sotto i quali un PDF è considerato una scansione

IMMAGINI = {'.jpg', '.jpeg', '.png', '.heic', '.tif', '.tiff', '.bmp', '.gif', '.webp'}


CREDENZIALI = re.compile(r'(?i)\b(password|passw|pwd|pin|puk|codice segreto)\b\s*[:=]')


def riservato(testo):
    """Documento con password/PIN in chiaro: il testo non si salva nel catalogo e non si manda a nessun modello."""
    return len(CREDENZIALI.findall(testo or '')) >= 5


def pulisci(t):
    t = t.replace('\x00', ' ').replace('\r', '\n')
    t = re.sub(r'[ \t\f\v\u00a0]+', ' ', t)
    t = re.sub(r'\n\s*\n+', '\n\n', t)
    return t.strip()[:MAX_CARATTERI]


def da_xml(x):
    if isinstance(x, bytes):
        x = x.decode('utf-8', 'replace')
    x = re.sub(r'<(/w:p|/text:p|/a:p|/p|br\s*/?|/tr|/div|/h\d|/li)[^>]*>', '\n', x)
    x = re.sub(r'<[^>]+>', ' ', x)
    return html.unescape(x)


def esito(testo, metodo, pagine=None, scansione=False):
    testo = pulisci(testo or '')
    if riservato(testo):
        return {'esito': 'riservato', 'metodo': metodo, 'pagine': pagine, 'testo': ''}
    if scansione:
        return {'esito': 'da_ocr', 'metodo': metodo, 'pagine': pagine, 'testo': testo}
    return {'esito': 'ok' if testo else 'vuoto', 'metodo': metodo, 'pagine': pagine, 'testo': testo}


# --- PDF -----------------------------------------------------------------------------------------

def pdf(sorgente):
    import pypdfium2 as pdfium
    doc = pdfium.PdfDocument(sorgente)
    try:
        n = len(doc)
        parti = []
        for i in range(min(n, MAX_PAGINE)):
            pg = doc[i]
            tp = pg.get_textpage()
            parti.append(tp.get_text_bounded())
            tp.close(); pg.close()
        testo = '\n\n'.join(parti)
        lette = max(1, min(n, MAX_PAGINE))
        scansione = len(re.sub(r'\s', '', testo)) / lette < POCO_TESTO
        return esito(testo, 'pdf', n, scansione)
    finally:
        doc.close()


# --- Office nuovi (zip con XML) ------------------------------------------------------------------

def office_zip(percorso, est):
    with zipfile.ZipFile(percorso) as z:
        nomi = z.namelist()
        if est in ('.docx', '.docm', '.dotx'):
            parti = [n for n in nomi if re.match(r'word/(document|header\d*|footer\d*)\.xml$', n)]
        elif est in ('.pptx', '.ppsx'):
            parti = sorted(n for n in nomi if re.match(r'ppt/slides/slide\d+\.xml$', n))
        else:  # .odt .ods .odp
            parti = ['content.xml'] if 'content.xml' in nomi else []
        return esito('\n'.join(da_xml(z.read(n)) for n in parti), est[1:])


def excel(percorso):
    from openpyxl import load_workbook
    wb = load_workbook(percorso, read_only=True, data_only=True)
    righe, tot = [], 0
    try:
        for ws in wb.worksheets:
            righe.append(f'[{ws.title}]')
            for r in ws.iter_rows(values_only=True):
                cel = [str(v) for v in r if v not in (None, '')]
                if cel:
                    s = ' | '.join(cel); righe.append(s); tot += len(s)
                if tot > MAX_CARATTERI:
                    break
    finally:
        wb.close()
    return esito('\n'.join(righe), 'xlsx', len(wb.sheetnames))


def binario_vecchio(b, metodo):
    """Testo grezzo da .doc/.xls (formato OLE): sequenze leggibili in UTF-16 e in Latin-1."""
    u16 = re.findall(rb'(?:[\x20-\x7e\xc0-\xff]\x00){4,}', b)
    l1 = re.findall(rb'[\x20-\x7e\xc0-\xff]{5,}', b)
    pezzi = [x.decode('utf-16-le', 'ignore') for x in u16] + [x.decode('latin-1') for x in l1]
    # scarta i pezzi che sembrano rumore (pochi caratteri alfabetici)
    buoni = [p for p in pezzi if sum(c.isalpha() for c in p) >= 0.6 * len(p)]
    return esito('\n'.join(buoni), metodo)


# --- P7M (busta di firma CAdES) ------------------------------------------------------------------

def _tlv(b, i):
    tag = b[i]; i += 1
    if tag & 0x1f == 0x1f:                     # tag lungo
        while b[i] & 0x80:
            i += 1
        i += 1
    ln = b[i]; i += 1
    if ln == 0x80:
        return tag, i, None                    # lunghezza indefinita
    if ln & 0x80:
        k = ln & 0x7f; ln = int.from_bytes(b[i:i + k], 'big'); i += k
    return tag, i, i + ln


def _ottetti(b, i, fine, out):
    """Percorre la struttura DER e raccoglie il contenuto delle OCTET STRING (anche spezzate)."""
    while i < fine:
        if b[i] == 0 and i + 1 < len(b) and b[i + 1] == 0:   # fine di un blocco a lunghezza indefinita
            return i + 2
        tag, ini, end = _tlv(b, i)
        costruito = tag & 0x20
        if costruito:
            stop = end if end is not None else len(b)
            if tag == 0x24:                    # OCTET STRING spezzata in pezzi
                pezzi = []
                j = _ottetti(b, ini, stop, pezzi)
                out.append(b''.join(pezzi))
            else:
                j = _ottetti(b, ini, stop, out)
            i = end if end is not None else j
        else:
            if end is None:
                return fine
            if tag == 0x04:
                out.append(b[ini:end])
            i = end
    return i


def contenuto_p7m(b):
    if not b.startswith(b'\x30'):
        try:
            b = base64.b64decode(re.sub(rb'-----[^-]+-----|\s', b'', b))
        except Exception:
            pass
    out = []
    try:
        _ottetti(b, 0, len(b), out)
    except IndexError:
        pass
    return max(out, key=len) if out else b''


def p7m(percorso):
    with open(percorso, 'rb') as f:
        dentro = contenuto_p7m(f.read())
    if dentro.startswith(b'%PDF'):
        r = pdf(dentro); r['metodo'] = 'p7m-pdf'; return r
    if b'<' in dentro[:200]:
        return esito(da_xml(dentro), 'p7m-xml')
    return {'esito': 'non_supportato', 'metodo': 'p7m', 'pagine': None, 'testo': ''}


# --- Altri ---------------------------------------------------------------------------------------

def leggi_testo(b):
    for cod in ('utf-8-sig', 'cp1252'):
        try:
            return b.decode(cod)
        except UnicodeDecodeError:
            continue
    return b.decode('latin-1')


def eml(percorso):
    with open(percorso, 'rb') as f:
        m = email.message_from_bytes(f.read(), policy=email.policy.default)
    righe = [f'Oggetto: {m["subject"] or ""}', f'Da: {m["from"] or ""}', f'A: {m["to"] or ""}', f'Data: {m["date"] or ""}', '']
    allegati = []
    for parte in m.walk():
        if parte.is_multipart():
            continue
        nome = parte.get_filename()
        if nome:
            allegati.append(nome)
        elif parte.get_content_type() in ('text/plain', 'text/html'):
            try:
                t = parte.get_content()
            except Exception:
                continue
            righe.append(da_xml(t) if parte.get_content_type() == 'text/html' else t)
    if allegati:
        righe.append('Allegati: ' + ', '.join(allegati))
    return esito('\n'.join(righe), 'eml')


def elenco_zip(percorso):
    with zipfile.ZipFile(percorso) as z:
        return esito('Contenuto dell\'archivio:\n' + '\n'.join(z.namelist()[:500]), 'zip-elenco')


# --- Lettura ottica (Tesseract installato sul PC) ------------------------------------------------

OCR_PAGINE = 20            # pagine lette con l'OCR per ogni PDF scansionato
OCR_DPI = 200
TESSERACT = os.environ.get('TESSERACT') or r'C:\Program Files\Tesseract-OCR\tesseract.exe'
TESSDATA = os.path.join(os.environ.get('ARCHIVIO_DATI') or os.path.join(os.path.expanduser('~'), 'ArchivioAzienda'), 'tessdata')


def _tesseract(img, psm='3'):
    import subprocess
    buf = io.BytesIO(); img.save(buf, 'PNG')
    env = dict(os.environ, OMP_THREAD_LIMIT='1')   # un processo = un core: si lavora in parallelo da fuori
    r = subprocess.run([TESSERACT, 'stdin', 'stdout', '--tessdata-dir', TESSDATA, '-l', 'ita', '--psm', psm],
                       input=buf.getvalue(), capture_output=True, env=env, timeout=180,
                       creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
    return r.stdout.decode('utf-8', 'replace'), r.stderr.decode('utf-8', 'replace')


def _ocr_immagine(img):
    """OCR di una pagina; se esce poco testo prova a capire se è ruotata e rilegge."""
    from PIL import Image
    img = img.convert('L')
    testo, _ = _tesseract(img)
    if len(re.sub(r'\W', '', testo)) < 40:
        _, info = _tesseract(img, psm='0')
        m = re.search(r'Rotate: (\d+)', info)
        if m and m.group(1) != '0':
            ruotata = img.rotate(-int(m.group(1)), expand=True, fillcolor=255)
            t2, _ = _tesseract(ruotata)
            if len(t2) > len(testo):
                testo = t2
    return testo


def ocr(percorso):
    est = os.path.splitext(percorso)[1].lower()
    try:
        if est in IMMAGINI:
            from PIL import Image, ImageOps
            with Image.open(percorso) as im:
                im = ImageOps.exif_transpose(im)
                im.thumbnail((3000, 3000))
                return esito(_ocr_immagine(im), 'ocr-immagine', 1)
        sorgente = percorso
        if est == '.p7m':
            with open(percorso, 'rb') as f:
                sorgente = contenuto_p7m(f.read())
        import pypdfium2 as pdfium
        doc = pdfium.PdfDocument(sorgente)
        try:
            n = len(doc); parti = []
            for i in range(min(n, OCR_PAGINE)):
                pg = doc[i]
                img = pg.render(scale=OCR_DPI / 72, grayscale=True).to_pil()
                pg.close()
                parti.append(_ocr_immagine(img))
            return esito('\n\n'.join(parti), 'ocr-pdf', n)
        finally:
            doc.close()
    except Exception as e:
        return {'esito': 'errore', 'metodo': 'ocr', 'pagine': None, 'testo': '', 'errore': f'{type(e).__name__}: {e}'[:300]}


def estrai(percorso):
    est = os.path.splitext(percorso)[1].lower()
    try:
        if est == '.pdf':
            return pdf(percorso)
        if est in IMMAGINI:
            return {'esito': 'da_ocr', 'metodo': 'immagine', 'pagine': 1, 'testo': ''}
        if est in ('.docx', '.docm', '.dotx', '.pptx', '.ppsx', '.odt', '.ods', '.odp'):
            return office_zip(percorso, est)
        if est in ('.xlsx', '.xlsm'):
            return excel(percorso)
        if est in ('.doc', '.xls', '.ppt'):
            with open(percorso, 'rb') as f:
                return binario_vecchio(f.read(), est[1:] + '-grezzo')
        if est == '.p7m':
            return p7m(percorso)
        if est == '.eml':
            return eml(percorso)
        if est in ('.xml', '.html', '.htm'):
            with open(percorso, 'rb') as f:
                return esito(da_xml(leggi_testo(f.read())), est[1:])
        if est in ('.txt', '.csv', '.ics', '.json', '.md', '.rtf'):
            with open(percorso, 'rb') as f:
                t = leggi_testo(f.read())
            if est == '.rtf':
                t = re.sub(r'\\[a-z]+-?\d* ?|[{}]', ' ', t)
            return esito(t, est[1:])
        if est in ('.zip',):
            return elenco_zip(percorso)
        return {'esito': 'non_supportato', 'metodo': est[1:] or '?', 'pagine': None, 'testo': ''}
    except Exception as e:
        return {'esito': 'errore', 'metodo': est[1:] or '?', 'pagine': None, 'testo': '',
                'errore': f'{type(e).__name__}: {e}'[:300]}
