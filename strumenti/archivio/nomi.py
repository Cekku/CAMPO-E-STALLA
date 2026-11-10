"""Nomi proposti più specifici, ricavati dal CONTENUTO del documento (non dal nome del file).

Forma invariata: AAAA-MM-GG_Tipo_Controparte_Descrizione (massimo ~100 caratteri), per esempio
  2025-07-23_Fattura-elettronica_Ditta-Esempio-Srl_n-SI2514177_Mangime-complementare_5.472EUR.pdf
  2022-06-13_Bonifico_Mario-Rossi_Stipendio-maggio-2022_1.400EUR.pdf
Solo il nome nel catalogo: nessun file viene rinominato sul disco. I contenuti corretti a mano
(classificato_da='utente') non si toccano. Nomi uguali per documenti diversi: suffisso -2, -3…

Qui solo regole generiche sui moduli (fattura elettronica dell'Agenzia, contabili della banca, Modello 4,
cedolini, F24…): nessun nome vero. I nomi dell'azienda vengono da config.json ("nomi_azienda").

Uso: python archivio.py rinomina   (ricalcola tutti i nomi); classifica_tutto lo chiama per i contenuti nuovi.
"""
import datetime as dt
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from classifica import pulisci_nome, nome_proposto, pulisci_descrizione, R  # noqa: E402

MAX_NOME = 100
MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre',
        'novembre', 'dicembre']
RX_MESI = '|'.join(MESI)
IMPORTO = r'(\d{1,3}(?:\.\d{3})*,\d{2})'
BANCHE = R(r'banca|bancater|credito.?cooperativo|credifriuli|credit.?agricole|friuladria|unicredit|intesa|poste')
CF_PERSONA = re.compile(r'\b[A-Z]{6}\d{2}[A-EHLMPRST]\d{2}[A-Z]\d{3}[A-Z]\b')
# descrizioni che non dicono niente: codici dei programmi, mesi da soli, sigle dei file
DEBOLI = R(r'^((' + RX_MESI + r')(-\d{1,4})?|bonificosct|listadettagliodisposizioni|gestionaledistinte|delegaf24|ced|bil|'
           r'fr\d*|mod(ello)?-?4|f24|doc|documento|scansione|scan|stampa|file|nuovo|corretto|definitivo|copia|'
           r'notificapec\w*|bollettacbill|avvisopagamento|avvisatura|'
           r'[a-z]{0,3}\d+|[0-9a-f-]{12,}|.{0,2})$')


# ---------------------------------------------------------------- pezzi comuni

def euro(s):
    """'1.400,00' -> '1.400EUR'; '219,60' -> '219,60EUR'."""
    try:
        v = float(s.replace('.', '').replace(',', '.'))
    except (ValueError, AttributeError):
        return None
    v = abs(v)
    if v >= 1000 or round(v * 100) % 100 == 0:
        return f'{round(v):,}'.replace(',', '.') + 'EUR'
    return f'{v:.2f}'.replace('.', ',') + 'EUR'


def data_it(s):
    """'23-07-2025', '23/07/2025', '23.07.2025' -> '2025-07-23' (o None)."""
    m = re.fullmatch(r'(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})', (s or '').strip())
    if not m:
        return None
    try:
        return dt.date(int(m[3]), int(m[2]), int(m[1])).isoformat()
    except ValueError:
        return None


def un_testo(s):
    return ' '.join((s or '').split())


def parole_utili(s, n=4, togliere=()):
    """Le prime n parole che dicono qualcosa (niente codici, numeri, parole vuote), in minuscolo con iniziale."""
    via = {'per', 'da', 'di', 'del', 'della', 'dei', 'delle', 'e', 'ed', 'il', 'la', 'lo', 'le', 'i', 'gli', 'a', 'al',
           'in', 'con', 'su', 'n', 'nr', 'num', 'cod', 'art', 'tipo', 'rif', 'vs', 'ns', 'kg', 'lt', 'pz', 'nr.',
           'fornitore', 'codice', 'articolo', 'pezzi'}
    via |= {t.lower() for t in togliere}
    out = []
    for p in re.split(r'[\s/,;:()\[\]"\'’+*=_]+|\s-\s|-(?=\s)', s or ''):
        p = p.strip('.-')
        if len(p) < 3 or p.lower() in via or re.search(r'\d', p) or not re.search(r'[A-Za-zÀ-ÿ]{3,}', p) \
                or re.search(r'[a-z][A-Z]', p):            # codici dei programmi tipo "AswArtFor"
            continue
        out.append(p.lower())
        if len(out) >= n:
            break
    if not out:
        return None
    out[0] = out[0][:1].upper() + out[0][1:]
    return '-'.join(out)


def nome_breve(s, n=30):
    """Ragione sociale o persona come parte del nome: 'ROSSI MARIO' -> 'Rossi-Mario', senza doppioni di parole."""
    if not s:
        return None
    s = un_testo(re.sub(r'[\\/:*?"<>|]', ' ', s))
    parole = s.split()
    meta = len(parole) // 2
    if meta and parole[:meta] == parole[meta:2 * meta]:          # "RAN BAHADUR RAN BAHADUR"
        parole = parole[:meta]
    s = ' '.join(parole)
    if s.isupper():
        s = s.title()
    return pulisci_nome(s, n) or None


def unisci(*pezzi, n=60):
    v = [p for p in pezzi if p]
    return pulisci_nome('_'.join(v).replace('_', '-'), n) if v else None


# ---------------------------------------------------------------- i moduli

def fattura_elettronica(t, nostri):
    out = {}
    m = re.search(r'TD\d\d\s*\([^)]*\)\s*(\S+)\s+(\d{2}-\d{2}-\d{4})', t)
    if m:
        out['numero'] = m[1]
        out['data'] = data_it(m[2])
    # voce principale: la riga con il "Prezzo totale" più alto nella tabella delle righe
    k = t.find('Cod. articolo')
    fine = t.find('RIEPILOGHI IVA', k)
    if k >= 0 and fine > k:
        blocchi = [b.strip() for b in re.split(r'\n\s*\n', t[k:fine])[1:]]
        voce, migliore, testo_voce = None, -1.0, []
        for b in blocchi:
            if re.match(r'(?i)(DDT|Vs\.?\s?Ord|Contratto|Rif|Documento|Ordine|Normale|Informazioni|\(Codice|fornitore\))', b) or nostri(b):
                continue
            fine_imp = re.search(IMPORTO + r'\s*$', b)
            if fine_imp:
                imp = float(fine_imp[1].replace('.', '').replace(',', '.'))
                # la descrizione può stare sulla stessa riga dei numeri: "MANGIME X 10,00 104,00 pezzi 22,00 1.019,20"
                prima = re.split(r'\s-?\d+(?:[.,]\d+)+\b', b, maxsplit=1)[0]
                descr = ' '.join(testo_voce + ([prima] if re.search(r'[A-Za-zÀ-ÿ]{4,}', prima) else []))
                if descr and imp > migliore:
                    migliore, voce = imp, descr
                testo_voce = []
            else:
                testo_voce.append(b)
        if voce:
            out['voce'] = parole_utili(voce, 3)
    m = re.search(r'Totale documento\s*\n[\s\S]{0,80}?' + IMPORTO + r'\s*(?:\n|$)', t)
    if m:
        out['totale'] = euro(m[1])
    c = re.search(r'Cedente/prestatore[\s\S]{0,300}?(?:Denominazione|Cognome nome)\s*:\s*([^\n]{3,80}?)\s+(?:Regime|Indirizzo|Codice|\n|$)', t)
    if c and not nostri(c[1]):
        out['controparte'] = c[1]
    else:
        c2 = re.search(r'Cessionario/committente[\s\S]{0,300}?(?:Denominazione|Cognome nome)\s*:\s*([^\n]{3,80}?)\s+(?:Regime|Indirizzo|Codice|\n|$)', t)
        if c2:
            out['controparte'] = c2[1]
            out['vendita'] = True
    numero = ('n-' + pulisci_nome(out['numero'], 18)) if out.get('numero') else None
    voce = pulisci_nome(out['voce'], 32) if out.get('voce') else None
    out['descrizione'] = unisci(numero, voce, out.get('totale'), n=75)
    return out


def fattura_generica(t):
    out = {}
    m = re.search(r'(?i)\bFATTURA\b[^\n]{0,30}?\b(?:N\.?|NR\.?|NUM(?:ERO)?\.?)\s*[:°º]?\s*([A-Z0-9][\w/\-.]{0,15})', t[:3000])
    if m and re.search(r'\d', m[1]):
        out['numero'] = m[1].strip('.')
    m = re.search(r'(?i)TOTALE\s+(?:DOCUMENTO|FATTURA|DA\s+PAGARE|A\s+PAGARE|GENERALE)\s*(?:EUR|€)?\s*:?\s*(?:EUR|€)?\s*' + IMPORTO, t)
    if m:
        out['totale'] = euro(m[1])
    out['descrizione'] = unisci(('n-' + pulisci_nome(out['numero'], 18)) if out.get('numero') else None, out.get('totale'))
    return out


def bonifico(t, nostri):
    out = {}
    m = re.search(r'DATI BENEFICIARIO\s+Beneficiario\s+(.+?)\s+(?:IBAN|Indirizzo|Via e numero|Città|Codice Paese)', un_testo(t))
    tt = un_testo(t)
    if m and not nostri(m[1]):
        out['controparte'] = m[1]
    elif m:
        out['controparte'] = ''                  # bonifico verso un nostro conto (giroconto)
    else:
        m = re.search(r'(?:Ordinante|ORDINANTE)\s*:?\s+([A-Z][^\n]{3,60}?)\s+(?:IBAN|Indirizzo|Codice)', tt)
        if m and not nostri(m[1]):
            out['controparte'] = m[1]; out['entrata'] = True
    m = re.search(r'Data esecuzione\s+(\d{2}/\d{2}/\d{4})', tt) or re.search(r'DATA INVIO[\s\S]{0,120}?(\d{2}/\d{2}/\d{4})', tt)
    if m:
        out['data'] = data_it(m[1])
    m = re.search(r'Importo\s*-?\s*' + IMPORTO, tt)
    if m:
        out['importo'] = euro(m[1])
    m = re.search(r'Causale(?!\s+bancaria)\s+(.+?)\s+(?:Transaction ID|Pagina \d|Identificativo|Data/ora|Stato|$)', tt)
    causale = None
    if m:
        c = m[1]
        mm = re.search(r'(?i)(stipendio|salario|anticipo|acconto|saldo|tredicesima|quattordicesima)\b[^\d]{0,15}?(' + RX_MESI + r')?\s*(\d{4})?', c)
        if mm and mm[2]:
            causale = pulisci_nome(f'{mm[1].capitalize()} {mm[2].lower()} {mm[3] or ""}', 30)
        else:
            mf = re.search(r'(?i)fatt(?:ura|\.)?\s*(?:n\.?|nr\.?)?\s*([\w/\-]{1,15})', c)
            causale = pulisci_nome(f'Fatt {mf[1]}', 24) if mf and re.search(r'\d', mf[1]) else parole_utili(c, 4)
    out['descrizione'] = unisci(causale, out.get('importo'))
    return out


def movimento(t, nostri):
    """'Dettagli movimento' della banca (Causale abi, A fav:, RICON., DATI MOVIMENTO): bonifici, F24, altri addebiti."""
    tt = un_testo(t)
    out = {}
    m = re.search(r'Tipo movimento Importo\s+(\d{2}/\d{2}/\d{4})', tt)
    if m:
        out['data'] = data_it(m[1])
    m = re.search(r'(?:Dare|Avere)\s*[-+]?\s*' + IMPORTO, tt)
    imp = euro(m[1]) if m else None
    abi = re.search(r'Causale abi\s+\d+\s*-\s*(.+?)\s+Descrizione operazione', tt)
    abi = abi[1] if abi else ''
    if re.search(r'F24', tt[:700]):
        sc = re.search(r'Scadenza\s*dele\s?ga\s*:?\s*(\d{2})[./](\d{2})[./](\d{4})', tt)
        out['descrizione'] = unisci('Delega-F24', f'scad-{sc[3]}-{sc[2]}-{sc[1]}' if sc else None, imp)
        out['controparte'] = ''
        return out
    fine = r'(?:\s+-\s+[^-]{2,40}?)?\s+(?:IBAN|ID\.MSG|ID\.END|ID Pag|RICON|DATI CONTO)'
    chi = re.search(r'(?i)\bA fav\b:?\s*(.+?)' + fine, tt)
    if not chi:
        chi = re.search(r'(?:Ordinante|ORDINANTE|Ord\.|Da)\s*:\s*(.+?)' + fine, tt)
        if chi:
            out['entrata'] = True
    op = re.search(r'Descrizione operazione\s+(.+?)\s+DATI CONTO', tt)
    op = op[1] if op else ''
    if not chi and re.search(r'(?i)a vostro favore', abi):            # bonifico ricevuto "per ordine e conto"
        chi = re.search(r'ORDINE (?:E )?CONTO\s+(.+?)(?:\s+MAND|\s+N\.|\s+\d|$)', op)
        if chi:
            out['entrata'] = True
    if chi:
        nome = re.split(r'(?i)\s+(?:VIA|V\.LE|VIALE|PIAZZA|P\.ZZA|LOC\.|LOCALIT\w*|STRADA|CORSO|FRAZ\.)\s', chi[1])[0]
        out['controparte'] = '' if nostri(nome) else nome          # giroconto verso un nostro conto: nessuna controparte
    ric = re.search(r'RICON\.\d\.:\s*(.+?)\s+DATI CONTO', tt) or re.search(r'ID Pag\s+\S+\s+(.+?)\s+DATI CONTO', tt)
    if not ric and out.get('entrata') and op:
        ric = re.search(r'(?:MAND\.?\s*N\.?\s*[\d\- ]+)?(.+)', op.split(chi[1])[-1] if chi else op)
    if not chi and not ric and re.match(r'(?i)vs\.?\s?rif', op or '-'):    # addebito senza dettagli (utenze, RID)
        verso = 'Accredito' if re.search(r'\bAvere\b', tt) else 'Addebito'
        out['descrizione'] = unisci(verso, imp)
        return out
    causale = None
    if ric:
        c = ric[1]
        mf = re.search(r'(?i)(?:fatt\w*|fdattura|ft|parcella)\.?\s*(?:n[r°.]*\.?)?\s*([\w/\-]{1,15})', c)
        if mf and re.search(r'\d', mf[1]):
            causale = pulisci_nome(('Parcella ' if 'parcell' in c.lower() else 'Fatt ') + mf[1], 24)
        else:
            mm = re.search(r'(?i)(stipendio|salario|anticipo|acconto|saldo)\b[^\d]{0,15}?(' + RX_MESI + r')?\s*(\d{4})?', c)
            causale = pulisci_nome(f'{mm[1].capitalize()} {(mm[2] or "").lower()} {mm[3] or ""}', 30) if mm else parole_utili(c, 4)
    elif abi and not re.search(r'(?i)disposizion\w* a favore|bonifico', abi):
        causale = parole_utili(abi, 4)
    out['descrizione'] = unisci(causale, imp)
    return out


def distinta(t):
    tt = un_testo(t)
    m = re.search(r'NUMERO DISPOSIZIONI IMPORTO\s+\d+\s+(.+?)\s+(\d+)\s+' + IMPORTO, tt)
    if not m:
        return {}
    n, tot = int(m[2]), euro(m[3])
    tipo = parole_utili(m[1], 2) or 'Pagamenti'
    out = {'descrizione': unisci(f'{n}-{tipo.lower()}', tot), 'tipo': 'Distinta-bonifici', 'n': n}
    m = re.search(r'DETTAGLIO DISTINTE RIFERIMENTO DESCR\. RIFERIMENTO IMPORTO TIPOLOGIA\s+([A-Z][A-Z0-9&.\' ]{2,40}?(?:S\.?R\.?L\.?|S\.?P\.?A\.?|S\.?N\.?C\.?|S\.?A\.?S\.?|S\.?S\.?)?)\s', tt)
    out['controparte'] = m[1] if (n == 1 and m) else ''
    return out


def modello4(t, nostri):
    tt = un_testo(t)
    out = {}
    m = re.search(r'Data (?:Modello 4|Documento di accompagnamento)\s*:\s*(?:IT\w+\s+)?(\d{2}/\d{2}/\d{4})', tt) or \
        re.search(r'Modello 4: IT\w+ del (\d{2}/\d{2}/\d{4})', tt) or re.search(r'generato dal CSN il (\d{2}/\d{2}/\d{4})', tt)
    if m:
        out['data'] = data_it(m[1])
    capi = re.search(r'I n\. (\d+) cap[io]', tt)
    det = re.search(r'DETENTORE:\s*(.{3,60}?)\s+CODICE', tt)
    verso = None
    if det:
        verso = 'Uscita' if nostri(det[1]) else 'Entrata'
    dest = None
    md = re.search(r'C\) DESTINAZIONE(.{0,120})', tt)
    if md:
        mx = re.search(r'\bX\s+(Allevamento|Macello|Stalla di sosta|Fiera/Mercato|Pascolo|Altre tipologie)', md[1])
        if mx:
            dest = mx[1].split('/')[0].lower()
    chi = re.search(r'destinati a:.{0,80}?Denominazione:\s*(.{3,50}?)\s+Indirizzo', tt)
    prog = re.search(r'Progressivo di allevamento:\s*(\d+)/(\d{4})', tt)
    doc = 'Modello-4' if 'Modello 4' in tt[:400] else 'Accompagnamento'
    out['tipo'] = doc
    if chi and not nostri(chi[1]):
        out['controparte'] = chi[1]          # a chi vanno i capi
    out['descrizione'] = unisci(verso, f'{capi[1]}-capi' if capi else None, dest, f'n-{prog[1]}' if prog else None)
    return out


def mese_competenza(t):
    """Il mese/anno scritto più spesso ('Ottobre 2022') -> '2022-10'."""
    conta = {}
    for m in re.finditer(r'(?i)\b(' + RX_MESI + r')\W{0,3}(20\d\d|19\d\d)\b', t):
        k = (int(m[2]), MESI.index(m[1].lower()) + 1)
        conta[k] = conta.get(k, 0) + 1
    if not conta:
        return None
    a, mm = max(conta.items(), key=lambda x: x[1])[0]
    return f'{a}-{mm:02}'


def cedolino(t, pagine=1):
    mese = mese_competenza(t)
    cf = set(CF_PERSONA.findall(t))
    out = {'tipo': 'Busta-paga', 'data_mese': mese}
    nome_mese = f'{MESI[int(mese[5:]) - 1]}-{mese[:4]}' if mese else None
    m13 = re.search(r'(?i)\b(tredicesima|13.?esima|13ª|quattordicesima|14.?esima|14ª)\W{0,3}(20\d\d)', t)
    if m13:
        nome_mese = ('quattordicesima-' if re.match(r'(?i)quatt|14', m13[1]) else 'tredicesima-') + m13[2]
    if len(cf) >= 3:                 # con due codici fiscali può essere il dipendente con un familiare a carico
        out['descrizione'] = unisci(nome_mese, f'{len(cf)}-dipendenti')
        out['piu_persone'] = True
    else:
        out['descrizione'] = unisci(nome_mese)
    return out


def bilancino_paghe(t):
    mese = mese_competenza(t[:1500]) or mese_competenza(t)
    return {'tipo': 'Bilancino-paghe', 'data_mese': mese, 'controparte': '',
            'descrizione': unisci(f'{MESI[int(mese[5:]) - 1]}-{mese[:4]}' if mese else None)}


TRIBUTI = [(R(r'\bIMU\b'), 'IMU'), (R(r'\bILIA\b'), 'ILIA'), (R(r'\bIRPEF\b'), 'IRPEF'), (R(r'\bIVA\b'), 'IVA'),
           (R(r'\bINPS\b|\bOT[ID]\b|\bLAS\b'), 'INPS'), (R(r'\bINAIL\b'), 'INAIL'), (R(r'\bACCISE?\b'), 'Accise'),
           (R(r'ADDIZIONAL'), 'Addizionali'), (R(r'\bRITENUT'), 'Ritenute'), (R(r'\bSANZION'), 'Sanzioni')]


def f24(t, nome_file):
    tt = un_testo(t) + ' ' + nome_file.replace('_', ' ')
    nf = nome_file.replace('_', ' ')
    ricevuta = t.lstrip().startswith('Denominazione:')       # ricevuta della banca: niente codici tributo
    trib = []
    for rx, nome in TRIBUTI:                                  # parole: solo dal nome del file (il modulo le stampa sempre)
        if nome not in trib and rx.search(nf):
            trib.append(nome)
    if not ricevuta:
        for codice, nome in ((r'39(12|13|14|16|18|25|30)', 'IMU'), (r'40(01|33|34)', 'IRPEF'), (r'60(0[1-9]|1[0-2]|31|99)', 'IVA'),
                             (r'1001|1012', 'Ritenute-dipendenti'), (r'1040', 'Ritenute-autonomi'), (r'38(01|02|43|44|47|48)', 'Addizionali'),
                             (r'DM10|CXX', 'INPS')):
            if nome not in trib and re.search(r'(?<![\d.,/])(' + codice + r')(?![\d.,/])', t):
                trib.append(nome)
    fase = None
    if re.search(r'(?i)\bacconto\b', nf):        # 'acconto' e 'saldo' il modulo li stampa sempre: solo dal nome del file
        fase = 'acconto'
    elif re.search(r'(?i)\bsaldo\b', nf):
        fase = 'saldo'
    m = re.search(r'Saldo Delega[\s\S]{0,60}?-?\s*' + IMPORTO, tt) or re.search(r'(?i)SALDO FINALE[\s\S]{0,40}?' + IMPORTO, tt) or \
        re.search(r'Conto di addebito\s+\S+\s*-\s*' + IMPORTO, tt)
    return {'descrizione': unisci('-'.join(trib[:2]) or None, fase, euro(m[1]) if m else None), 'f24': True}


def bolletta(t):
    tt = un_testo(t)
    m = re.search(r'(?i)periodo(?: di)? (?:fatturazione|riferimento|consumi?|competenza)\s*:?\s*(?:dal\s*)?(\d{2}[/.]\d{2}[/.]\d{4})\s*(?:al|-|–)\s*(\d{2}[/.]\d{2}[/.]\d{4})', tt)
    per = None
    if m:
        a, b = data_it(m[1].replace('.', '/')), data_it(m[2].replace('.', '/'))
        if a and b:
            ma, mb = MESI[int(a[5:7]) - 1][:3], MESI[int(b[5:7]) - 1][:3]
            if a[:4] == b[:4]:
                per = f'{ma}-{mb}-{b[:4]}' if ma != mb else f'{ma}-{b[:4]}'
            else:
                per = f'{ma}-{a[:4]}-{mb}-{b[:4]}'
    m2 = re.search(r'(?i)totale\s+(?:da\s+pagare|bolletta|fattura|documento|importo da pagare)\s*:?\s*(?:€|EUR)?\s*' + IMPORTO, tt)
    return {'descrizione': unisci(f'consumi-{per}' if per else None, euro(m2[1]) if m2 else None)}


def vicina(data, rif, anni=1):
    """Una data trovata nel testo vale solo se è vicina a quella del documento."""
    if not data or not rif:
        return bool(data)
    return abs(int(data[:4]) - int(rif[:4])) <= anni


def contratto_lavoro(t, rif=None):
    tt = un_testo(t)[:5000]
    if re.search(r'(?i)trasformat\w* a tempo indeterminato|trasformazione del rapporto', tt):
        tipo = 'Trasformazione-TI'
    elif re.search(r'(?i)tempo determinato|a termine', tt):
        tipo = 'Assunzione-TD'
    elif re.search(r'(?i)tempo indeterminato', tt):
        tipo = 'Assunzione-TI'
    elif re.search(r'(?i)dimission|licenziament|cessazione', tt):
        tipo = 'Cessazione'
    elif re.search(r'(?i)proroga', tt):
        tipo = 'Proroga'
    elif re.search(r'(?i)assunzion|assumer', tt):
        tipo = 'Assunzione'
    else:
        tipo = None
    m = re.search(r'(?i)(?:a decorrere dal|con decorrenza(?: dal)?|data (?:di )?inizio|dal giorno|assunt\w+ dal)\s*:?\s*(\d{1,2}[/.\-]\d{1,2}[/.\-]\d{4})', tt)
    inizio = data_it(m[1].replace('.', '/').replace('-', '/')) if m else None
    if not vicina(inizio, rif):
        inizio = None
    return {'descrizione': unisci(tipo, f'dal-{inizio}' if inizio else None)}


TITOLO_NO = R(r'^(pagina|pag\.|page|data|tel|fax|e-?mail|www|http|via |p\.? ?iva|partita|c\.?f\.?|codice|spett|egregi|gent|'
              r'oggetto\s*:?$|n\.|numero|totale|\d)')


TITOLO_INTEST = R(r'^denominazione|societ\w*\s+sempl|\bs\.\s?s\.|az\.?\s?agr|azienda agricola|reg(istro|\.)?\s+(delle\s+)?imprese|'
                  r'capitale sociale|\br\.?e\.?a\.?\b|cciaa|iscritt[ao]|creato il|valido fino|^pag\.?\s|^cliente\b')


def titolo(t, nostri, parole_az=()):
    """Il titolo letto all'inizio del documento: la prima riga 'parlante' che non sia intestazione o indirizzo."""
    for riga in (t or '').split('\n')[:40]:
        r = un_testo(riga)
        if sum(1 for w in parole_az if w in r.upper()) >= 2 or TITOLO_INTEST.search(r) or BANCHE.search(r):
            continue                                              # intestazioni: la nostra, della banca, dell'emittente
        m = re.match(r'(?i)oggetto\s*:\s*(.{6,})', r)
        if m:
            return parole_utili(m[1], 5)
        if len(r) < 8 or len(r) > 90 or TITOLO_NO.match(r) or nostri(r) or len(re.findall(r'[A-Za-zÀ-ÿ]{3,}', r)) < 2:
            continue
        if re.search(r'\b\d{5}\b|\(\w\w\)|@', r):          # indirizzi, CAP, province, posta
            continue
        return parole_utili(r, 5)
    return None


# ---------------------------------------------------------------- decisione per un documento

def debole(d):
    if not d:
        return True
    parti = [p for p in re.split(r'[-_]+', d) if p]
    return DEBOLI.match(d) is not None or all(DEBOLI.match(p) for p in parti)


def migliora(r, testo, nostri, persone=(), parole_az=()):
    """r: riga di contenuti. Ritorna i campi da cambiare (descrizione, controparte, data_doc, tipo, persona)."""
    t = testo or ''
    nome_file = os.path.basename(r['percorso_scelto'] or '')
    nf = nome_file.lower()
    tipo = r['tipo'] or ''
    chi = r['classificato_da'] or 'regole'
    libero = chi in ('regole', 'llm')                # Claude ha già rivisto area, tipo, data e controparte
    cambi, info = {}, {}
    if 'Cedente/prestatore' in t[:600] or tipo == 'Fattura-elettronica':
        info = fattura_elettronica(t, nostri) if 'Cedente/prestatore' in t[:600] else fattura_generica(t)
    elif re.match(r'listadettagliodisposizioni|gestionaledistinte', nf) or 'NUMERO DISPOSIZIONI IMPORTO' in t[:800]:
        info = distinta(t)
    elif 'DATI MOVIMENTO' in t and ('Causale abi' in t[:500] or 'Descrizione operazione' in t[:600]):
        info = movimento(t, nostri)
    elif tipo == 'Bonifico' or nf.startswith(('bonificosct', 'bonifico')) or 'DATI BENEFICIARIO' in t[:1500]:
        info = bonifico(t, nostri)
    elif 'Modello 4' in t[:600] or 'DOCUMENTO DI ACCOMPAGNAMENTO' in t[:800]:
        info = modello4(t, nostri)
    elif 'BILANCINO CONTABILE' in t[:300]:
        info = bilancino_paghe(t)
    elif tipo == 'Busta-paga' or re.match(r'ced\b|ced[ _\-]?\d', nf) or (CF_PERSONA.search(t[:1500]) and 'Retribuzione' in t[:6000]
                                                                         and re.search(r'(?i)netto|t\.?f\.?r', t[:8000])):
        info = cedolino(t, r['pagine'])
    elif tipo == 'F24' or nf.startswith(('delegaf24', 'f24')):
        info = f24(t, nome_file)
    elif tipo == 'Bolletta':
        info = bolletta(t)
    elif tipo in ('Contratto-di-lavoro', 'UNILAV'):
        info = contratto_lavoro(t, r['data_doc'])
    elif tipo in ('Fattura', 'Nota-di-credito', 'Nota-di-addebito', 'Proforma'):
        info = fattura_generica(t)

    descr = info.get('descrizione')
    attuale = r['descrizione']
    if not descr:
        if debole(attuale):
            ocr = (r['metodo'] or '').startswith('ocr')           # testo letto dalle foto: titoli spesso storpiati
            descr = titolo(t, nostri, parole_az) if t and not ocr else None
            if not descr and attuale and not debole(attuale):
                descr = attuale
        else:
            descr = attuale
    # se la descrizione vecchia (dal nome del file) diceva qualcosa e quella nuova è solo un importo, tienile tutte e due
    if descr and attuale and not debole(attuale) and descr != attuale and re.fullmatch(r'[\d.,]+EUR', descr):
        descr = attuale if attuale.endswith(descr) else unisci(attuale, descr)     # rifatto due volte dà lo stesso
    if descr != attuale:
        cambi['descrizione'] = descr

    c_nuova = info.get('controparte')
    if c_nuova is not None:
        c_nuova = nome_breve(c_nuova) if c_nuova else None
        c_att = r['controparte'] or ''
        if libero or not c_att or BANCHE.search(c_att) or c_att in ('Agenzia-Entrate', 'INPS'):
            if (c_nuova or None) != (r['controparte'] or None):
                cambi['controparte'] = c_nuova
    if info.get('f24') and libero and r['controparte'] and BANCHE.search(r['controparte']):
        cambi['controparte'] = None
    if tipo in ('Bolletta', 'Fattura', 'Nota-di-credito', 'Nota-di-addebito') and (r['controparte'] or '') in ('Agenzia-Entrate', '') and t:
        from classifica import controparte as _contro
        c = _contro(t, [], '03 Fatture')
        if c and c != 'Agenzia-Entrate':
            cambi['controparte'] = c

    # persona: solo se è davvero una persona del documento
    if info.get('piu_persone'):           # cedolini di tutto il mese: nessuna persona sola
        if r['persona']:
            cambi['persona'] = None
        uguale = lambda a, b: (a or '').replace('-', ' ').lower().split() == (b or '').replace('-', ' ').lower().split()
        if r['controparte'] and (uguale(r['controparte'], r['persona']) or (r['area'] or '').startswith('05')):
            cambi['controparte'] = None
    if 'controparte' in cambi and cambi['controparte'] and persone and (r['area'] or '').startswith(('05', '04')):
        cn = cambi['controparte'].replace('-', ' ').upper().split()
        for p in persone:
            if set(p.upper().split()) <= set(cn) or set(cn) <= set(p.upper().split()):
                if libero or not r['persona']:
                    cambi['persona'] = p
                break

    # data: dal modulo, per quelli classificati dalle regole (o senza data)
    d_nuova = info.get('data') or info.get('data_mese')
    if d_nuova and (libero or not r['data_doc']) and d_nuova != r['data_doc']:
        cambi['data_doc'] = d_nuova
    if info.get('tipo') and (libero and (not r['tipo'] or r['tipo'] in ('Bonifico', 'Anagrafe-bovina', 'Movimentazione-animali'))
                             or not r['tipo'] or (r['tipo'] == 'Bonifico' and info['tipo'] == 'Distinta-bonifici')):
        if info['tipo'] != r['tipo']:
            cambi['tipo'] = info['tipo']
    return cambi


def componi(data, anno, tipo, contro, descr, est):
    d = None
    if data and len(data) == 10:
        try:
            d = dt.date.fromisoformat(data)
        except ValueError:
            d = None
    a = anno if not d else None
    if data and len(data) in (4, 7):
        a = int(data[:4])
    nome = nome_proposto(d, a, tipo, contro, descr, '')
    if nome and data and len(data) == 7 and nome.startswith(data[:4]):
        nome = data + nome[4:]
    if not nome:
        return None
    while len(nome) > MAX_NOME and descr and descr.count('-') >= 2:
        parti = descr.split('-')             # accorcia la voce in mezzo: il numero all'inizio e l'importo in fondo restano
        descr = '-'.join(parti[:-2] + parti[-1:])
        nome = nome_proposto(d, a, tipo, contro, descr, '') or nome
        if data and len(data) == 7 and nome.startswith(data[:4]):
            nome = data + nome[4:]
    return nome[:MAX_NOME].rstrip('-_.')


def numera(nomi):
    """{rowid: (base, est, fisso)} -> {rowid: nome finale}: i nomi uguali (senza badare a maiuscole) prendono -2, -3…
    I nomi 'fissi' (scelti o corretti a mano) tengono il loro."""
    usati, out = set(), {}
    ordine = sorted(nomi.items(), key=lambda x: (not x[1][2], x[0]))
    for i, (base, est, fisso) in ordine:
        if not base:
            out[i] = None
            continue
        n, cand = 1, base + est
        while cand.lower() in usati and not fisso:
            n += 1
            cand = f'{base}-{n}{est}'
        usati.add(cand.lower())
        out[i] = cand
    return out


def rifai_nomi(db, cfg, persone=(), solo=None, prova=False):
    """Ricalcola descrizione e nome proposto dal contenuto. solo = insieme di impronte (gli altri tengono i loro dati,
    ma contano per i doppioni). prova=True non scrive. Ritorna (cambiati, righe dei cambi per controllo)."""
    nomi_az = [n.upper().replace(' ', '') for n in cfg.get('nomi_azienda', [])]

    def nostri(s):
        s = (s or '').upper().replace(' ', '').replace("'", '')
        return any(n.replace("'", '') in s or (len(s) > 12 and s in n) for n in nomi_az)

    parole_az = {w for n in cfg.get('nomi_azienda', []) for w in re.split(r'\W+', n.upper()) if len(w) >= 4}
    righe = db.execute("SELECT c.rowid id, c.*, t.testo, t.metodo, t.pagine FROM contenuti c LEFT JOIN testi t USING(impronta) "
                       "WHERE c.area IS NOT NULL").fetchall()
    nuovi, campi = {}, {}
    for r in righe:
        est = os.path.splitext(r['percorso_scelto'] or '')[1].lower()
        fisso = r['classificato_da'] == 'utente' or r['stato'] == 'riservato'
        tocca = not fisso and (solo is None or r['impronta'] in solo)
        cambi = migliora(r, r['testo'], nostri, persone, parole_az) if tocca else {}
        v = {k: r[k] for k in ('descrizione', 'controparte', 'data_doc', 'tipo', 'persona', 'anno')}
        v.update(cambi)
        if 'data_doc' in cambi and cambi['data_doc']:
            v['anno'] = int(cambi['data_doc'][:4])
        if tocca:
            contro = v['persona'] if (r['area'] or '').startswith('05') and v['persona'] else v['controparte']
            base = componi(v['data_doc'], v['anno'], v['tipo'], contro, v['descrizione'], est)
        else:                                       # non toccati: tengono il nome che hanno
            vecchio = r['nome_proposto'] or ''
            base = (vecchio[:-len(est)] if est and vecchio.lower().endswith(est) else vecchio) or None
        nuovi[r['id']] = (base, est, fisso or not tocca)
        campi[r['id']] = (r, v, tocca)
    finali = numera(nuovi)
    cambiati, elenco = 0, []
    for i, nome in finali.items():
        r, v, tocca = campi[i]
        diff = {k: v[k] for k in ('descrizione', 'controparte', 'data_doc', 'tipo', 'persona', 'anno') if v[k] != r[k]}
        if nome != r['nome_proposto']:
            diff['nome_proposto'] = nome
        if not diff:
            continue
        cambiati += 1
        elenco.append((i, r['nome_proposto'], nome, diff))
        if not prova:
            sets = ', '.join(f'{k}=?' for k in diff)
            db.execute(f'UPDATE contenuti SET {sets} WHERE rowid=?', list(diff.values()) + [i])
    return cambiati, elenco
