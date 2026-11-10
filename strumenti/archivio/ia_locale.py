r"""Intelligenza artificiale sul PC (LM Studio) per l'archivio dei documenti: scelta del modello e avvio.

Il modello gira tutto sul computer: i testi dei documenti non escono dal PC. LM Studio fa da server
compatibile con le API di OpenAI su http://127.0.0.1:1234 (impostazioni in config.json, chiave "llm",
lette da archivio.llm_config: solo indirizzi locali). La classificazione vera dei file nuovi è
archivio.classifica_llm (comando "llm", chiamato anche da "aggiorna"); qui c'è la prova che dice quale
modello conviene e l'avvio di LM Studio.

Comandi (da archivio.py):
  python archivio.py modelli                modelli che LM Studio ha sul PC (accende il server se serve)
  python archivio.py prova-ia N             fa classificare al modello N documenti già rivisti da Claude e
                                            misura quanti ne indovina e quanti secondi ci mette
        --modello NOME   (altrimenti quello in config.json o il primo caricato)
        --seme S         (1: stessi documenti per tutti i modelli, così il confronto è giusto)
        --metodo M       archivio = gli stessi messaggi di classifica_llm (esempi scelti per somiglianza)
                         fisso    = istruzioni ed esempi fissi in testa + 3 simili in fondo (LM Studio riusa
                                    la parte fissa già letta: più veloce sulla CPU)
        --caratteri N    (1500: quanto testo del documento si manda, metodo fisso)
  python archivio.py prova-ia --confronta  tabella di tutte le prove fatte (ArchivioAzienda\prove-ia)
  python archivio.py nuovi                  = archivio.py aggiorna, con LM Studio acceso e il modello caricato prima

Mai al modello: i contenuti con stato 'riservato' e i testi con password/PIN in chiaro (testo.riservato).
Memoria delle scelte: gli esempi dati al modello vengono dalle correzioni a mano (classificato_da='utente',
con più peso) e dalle revisioni di Claude, quindi ogni correzione diventa un esempio per i documenti dopo.
Impostazioni in più nella chiave "llm" di config.json: "contesto" (8192, lunghezza del contesto con cui caricare
il modello), "caratteri" (1500), "esempi_fissi" (14).
"""
import csv
import datetime as dt
import json
import os
import random
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import archivio as A  # noqa: E402

LMS = os.path.join(os.path.expanduser('~'), '.lmstudio', 'bin', 'lms.exe')
PROVE = os.path.join(A.DATI, 'prove-ia')


def arg(nome, base=None, tipo=str):
    if nome in sys.argv:
        i = sys.argv.index(nome)
        if i + 1 < len(sys.argv) and not sys.argv[i + 1].startswith('--'):
            return tipo(sys.argv[i + 1])
    return base


def impostazioni():
    try:
        with open(A.CONFIG, encoding='utf-8') as f:
            cfg = json.load(f)
    except (OSError, ValueError):
        cfg = {}
    l = A.llm_config(cfg)
    c = {'url': l['indirizzo'].rstrip('/') + '/v1', 'modello': arg('--modello', l.get('modello') or ''),
         'contesto': int(l.get('contesto', 8192)), 'caratteri': arg('--caratteri', int(l.get('caratteri', 1500)), int),
         'esempi': int(l.get('esempi_fissi', 14)), 'nomi_azienda': cfg.get('nomi_azienda', [])}
    return c


# --- LM Studio ---------------------------------------------------------------------------------------

def http(url, corpo=None, timeout=600):
    dati = json.dumps(corpo).encode('utf-8') if corpo is not None else None
    req = urllib.request.Request(url, data=dati, method='POST' if dati else 'GET',
                                 headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode('utf-8'))


def elenco_modelli(url):
    """[(id, tipo, caricato)] - con le API di LM Studio se ci sono, altrimenti quelle di OpenAI."""
    radice = url.rsplit('/v1', 1)[0]
    try:
        d = http(radice + '/api/v0/models', timeout=10)
        return [(m['id'], m.get('type', 'llm'), m.get('state') == 'loaded') for m in d.get('data', [])]
    except (OSError, ValueError):
        d = http(url + '/models', timeout=10)
        return [(m['id'], 'embeddings' if 'embed' in m['id'] else 'llm', True) for m in d.get('data', [])]


def acceso(url):
    try:
        elenco_modelli(url)
        return True
    except (OSError, ValueError):
        return False


def accendi(c):
    """Accende il server di LM Studio (se serve) e carica il modello scelto. Ritorna il nome del modello o None."""
    if not acceso(c['url']) and os.path.exists(LMS):
        print('LM Studio: accendo il server...')
        subprocess.run([LMS, 'server', 'start'], capture_output=True, timeout=120)
        for _ in range(30):
            if acceso(c['url']):
                break
            time.sleep(1)
    if not acceso(c['url']):
        print(f'LM Studio non risponde su {c["url"]}: aprilo e accendi il server (scheda Developer -> Start Server).')
        return None
    modelli = [m for m in elenco_modelli(c['url']) if m[1] in ('llm', 'vlm')]
    if not modelli:
        print('In LM Studio non c\'è nessun modello di testo: scaricane uno (vedi CLAUDE.md, "IA sul PC").')
        return None
    nome = c['modello']
    if nome:
        trovato = next((m for m in modelli if m[0] == nome), None) or next((m for m in modelli if nome.lower() in m[0].lower()), None)
        if not trovato:
            print(f'Il modello "{nome}" non c\'è in LM Studio. Ci sono: ' + ', '.join(m[0] for m in modelli))
            return None
    else:
        trovato = next((m for m in modelli if m[2]), None) or modelli[0]
    nome, _, caricato = trovato
    if not caricato and os.path.exists(LMS):
        print(f'LM Studio: carico {nome} (contesto {c["contesto"]})...')
        r = subprocess.run([LMS, 'load', nome, '--context-length', str(c['contesto']), '--ttl', '1800', '-y'],
                           capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=600)
        if r.returncode != 0:
            print('  non riesco a caricarlo:', (r.stderr or r.stdout).strip()[-300:])
    return nome


# --- La domanda al modello ---------------------------------------------------------------------------

ISTRUZIONI = """Sei l'archivista di un'azienda agricola con stalla di vacche da latte in Friuli (Italia).
Per ogni documento ricevi: nome del file, cartella in cui si trova, proposta delle regole automatiche (può essere sbagliata), estratto del testo e a volte documenti simili già archiviati.
Rispondi SOLO con un oggetto JSON con queste chiavi:
 "a": codice area.sottoarea preso dalla legenda (es. "03.1"; solo l'area, es. "15", se non ha sottoaree)
 "t": tipo di documento, una-tre parole unite dal trattino (es. Fattura, Bonifico, Busta-paga, Visura-catastale)
 "d": data del documento AAAA-MM-GG (o AAAA-MM, o AAAA); "" se non si capisce
 "c": chi ha emesso il documento o l'altra parte (ditta, ente, banca, professionista), nome breve unito dal trattino; "" se non si capisce
 "x": descrizione breve, 1-5 parole unite dal trattino; "" se il tipo basta
Regole:
- la data è quella in cui il documento è stato emesso o firmato: non scadenze, date di nascita, leggi citate o periodi lontani;
- fatture e note di credito: 03.1 se l'azienda compra, 03.2 se è l'azienda che emette; DDT e proforma 03.3;
- l'azienda stessa ({azienda}) non è mai la controparte;
- una banca è la controparte solo nei documenti bancari (non quando compare solo l'IBAN per il pagamento);
- documenti personali dei soci e della famiglia (spese mediche, casa, auto privata): 16;
- se non si capisce di cosa si tratta: 99.1; foto che non sono documenti: 99.2;
- usa i tipi e i nomi delle controparti già usati negli esempi quando vanno bene, scritti allo stesso modo.

Legenda delle aree:
{legenda}

Tipi più usati nell'archivio: {tipi}

Esempi (documento -> risposta):
{esempi}"""


def spazi(s):
    return ' '.join((s or '').split())


def scheda(r, testo, caratteri, regole=None):
    """Come si presenta un documento al modello (stessa forma per gli esempi e per le domande)."""
    p = r['percorso_scelto'] or ''
    righe = [f'FILE: {os.path.basename(p)}', f'CARTELLA: {os.path.basename(os.path.dirname(p))}']
    if regole:
        righe.append(f'PROPOSTA DELLE REGOLE: {regole}')
    righe.append('TESTO: ' + (spazi(testo)[:caratteri] or '(nessun testo leggibile)'))
    return '\n'.join(righe)


def risposta_di(r, inv):
    """La classificazione salvata di un contenuto, nel formato della risposta."""
    cod = inv.get((r['area'], r['sotto'])) or inv.get((r['area'], None)) or '99.1'
    return {'a': cod, 't': r['tipo'] or '', 'd': r['data_doc'] or '', 'c': r['controparte'] or '', 'x': r['descrizione'] or ''}


def proposta_regole(r, inv):
    if not r:
        return None
    cod = inv.get((r['area'], r['sotto'])) or inv.get((r['area'], None)) or '99.1'
    return ' / '.join(x for x in (cod, r['tipo'], r['data_doc'] or (str(r['anno']) if r['anno'] else ''), r['controparte'], r['persona']) if x)


class Archivio:
    """Dati dell'archivio che servono per preparare le domande."""

    def __init__(self, db, c):
        self.db, self.c = db, c
        self.codici = A.codici_aree()
        self.inv = {v: k for k, v in self.codici.items()}
        self.rif = {r['id']: r for r in db.execute(
            "SELECT c.rowid id, c.*, t.testo FROM contenuti c LEFT JOIN testi t USING(impronta) "
            "WHERE c.classificato_da IN ('utente','claude') AND c.stato != 'riservato' AND c.area IS NOT NULL")}
        self.per_cartella = {}
        for r in self.rif.values():
            k = os.path.dirname(A.chiave(r['percorso_scelto'] or ''))
            self.per_cartella.setdefault(k, []).append(r['id'])
        tipi = {}
        for r in db.execute("SELECT tipo, COUNT(*) n FROM contenuti WHERE tipo IS NOT NULL AND stato != 'riservato' "
                            "GROUP BY tipo ORDER BY n DESC LIMIT 70"):
            tipi[r['tipo']] = r['n']
        self.tipi = ', '.join(tipi)

    def esempi_fissi(self, n, escludi=(), seme=7):
        """Prima le correzioni a mano (le più recenti), poi le revisioni di Claude, un po' per ogni area."""
        utente = sorted((r for r in self.rif.values() if r['classificato_da'] == 'utente' and r['id'] not in escludi),
                        key=lambda r: r['aggiornato'] or '', reverse=True)
        scelti = utente[:n // 2]
        corretti = set()
        for f in sorted(os.listdir(os.path.join(A.DATI, 'lotti'))) if os.path.isdir(os.path.join(A.DATI, 'lotti')) else []:
            if f.startswith('rev-') and f.endswith('.json'):
                with open(os.path.join(A.DATI, 'lotti', f), encoding='utf-8') as fh:
                    corretti.update(int(k) for k in json.load(fh) if k.isdigit())
        caso = random.Random(seme)
        per_area = {}
        for i in sorted(corretti):
            r = self.rif.get(i)
            if r and r['classificato_da'] == 'claude' and i not in escludi and len(spazi(r['testo'])) >= 80:
                per_area.setdefault(r['area'][:2], []).append(r)
        for v in per_area.values():
            caso.shuffle(v)
        aree = sorted(per_area)
        while len(scelti) < n and any(per_area.values()):
            for a in aree:
                if per_area[a] and len(scelti) < n:
                    scelti.append(per_area[a].pop())
        return scelti

    def simili(self, r, n=3, escludi=()):
        """Documenti già archiviati simili a questo: stessa cartella, poi parole del nome del file."""
        via = set(escludi) | {r['id']}
        trovati = []
        cart = os.path.dirname(A.chiave(r['percorso_scelto'] or ''))
        stessa = self.per_cartella.get(cart, [])
        if len(stessa) > 30:           # cartelle "di passaggio" (Download, Desktop): stare lì non dice niente
            stessa = []
        vicini = [self.rif[i] for i in stessa if i not in via]
        vicini.sort(key=lambda x: (x['classificato_da'] != 'utente', x['aggiornato'] or ''))
        trovati += vicini[:2]
        parole = [w for w in re.findall(r'[A-Za-zÀ-ÿ]{4,}', os.path.splitext(os.path.basename(r['percorso_scelto'] or ''))[0])
                  if w.lower() not in A_PAROLE_VUOTE][:4]
        if parole and len(trovati) < n:
            q = ' OR '.join(f'nomi : "{w}"' for w in parole)
            try:
                righe = self.db.execute('SELECT c.rowid id FROM ricerca JOIN contenuti c USING(impronta) WHERE ricerca MATCH ? '
                                        "AND c.classificato_da IN ('utente','claude') ORDER BY rank LIMIT 12", (q,)).fetchall()
            except Exception:
                righe = []
            for x in righe:
                if x['id'] not in via and x['id'] in self.rif and all(x['id'] != t['id'] for t in trovati):
                    trovati.append(self.rif[x['id']])
                    if len(trovati) >= n:
                        break
        return trovati[:n]

    def sistema(self, esempi):
        testo_es = '\n\n'.join(scheda(e, e['testo'], 300) + '\n-> ' + json.dumps(risposta_di(e, self.inv), ensure_ascii=False)
                               for e in esempi)
        return ISTRUZIONI.format(azienda=', '.join(self.c.get('nomi_azienda') or ['l\'azienda']),
                                 legenda=A.legenda_codici(), tipi=self.tipi, esempi=testo_es)

    def domanda(self, r, testo, regole=None, simili=()):
        parti = []
        if simili:
            parti.append('DOCUMENTI SIMILI GIÀ ARCHIVIATI:\n' + '\n'.join(
                f'- {os.path.basename(s["percorso_scelto"] or "")} -> ' + json.dumps(risposta_di(s, self.inv), ensure_ascii=False)
                for s in simili))
        parti.append('DOCUMENTO DA CLASSIFICARE:\n' + scheda(r, testo, self.c['caratteri'], regole))
        return '\n\n'.join(parti)


A_PAROLE_VUOTE = {'scan', 'scansione', 'documento', 'file', 'copia', 'nuovo', 'signed', 'firmato', 'image', 'immagine',
                  'whatsapp', 'download', 'fattura', 'pdf'}


def formato(codici):
    return {'type': 'json_schema', 'json_schema': {'name': 'classificazione', 'strict': True, 'schema': {
        'type': 'object', 'additionalProperties': False, 'required': ['a', 't', 'd', 'c', 'x'],
        'properties': {'a': {'type': 'string', 'enum': sorted(codici)}, 't': {'type': 'string'}, 'd': {'type': 'string'},
                       'c': {'type': 'string'}, 'x': {'type': 'string'}}}}}


class Modello:
    """Una domanda a LM Studio: messaggi + schema della risposta; se lo schema non è accettato si riprova senza."""

    def __init__(self, c, nome):
        self.c, self.nome, self.schema_ok = c, nome, True

    def chiedi(self, messaggi, schema=None, temperatura=0):
        corpo = {'model': self.nome, 'temperature': temperatura, 'max_tokens': 300, 'stream': False, 'messages': messaggi}
        if schema and self.schema_ok:
            corpo['response_format'] = schema
        t0 = time.time()
        try:
            d = http(self.c['url'] + '/chat/completions', corpo, timeout=900)
        except urllib.error.HTTPError as e:
            msg = e.read().decode('utf-8', 'replace')[:400]
            if 'response_format' in corpo and e.code == 400 and 'context' not in msg.lower():
                self.schema_ok = False
                return self.chiedi(messaggi, schema, temperatura)
            raise RuntimeError(f'LM Studio ha risposto {e.code}: {msg}')
        testo = d['choices'][0]['message'].get('content') or ''
        return re.sub(r'<think>[\s\S]*?</think>', '', testo), time.time() - t0, d.get('usage') or {}


def leggi_risposta(testo, codici):
    """Dal testo del modello alla correzione compatta {a, t, d, c, x} (solo i campi validi)."""
    m = re.search(r'\{[\s\S]*\}', testo or '')
    if not m:
        return None
    try:
        j = json.loads(m[0])
    except ValueError:
        return None
    out = {}
    a = str(j.get('a') or '').strip()
    if a in codici:
        out['a'] = a
    elif a[:2] in codici:                       # sottoarea inventata: resta l'area
        out['a'] = a[:2]
    d = str(j.get('d') or '').strip()
    if d and A.DATA_OK.match(d):
        try:
            if len(d) == 10:
                dt.date.fromisoformat(d)
            out['d'] = d
        except ValueError:
            pass
    for k in ('t', 'c', 'x'):
        v = re.sub(r'[\\/:*?"<>|]', ' ', str(j.get(k) or '')).strip()
        out[k] = re.sub(r'\s+', '-', v).strip('-.')[:60]
    return out


# --- Prova sul campo: il modello contro le revisioni di Claude ---------------------------------------

def norm(s):
    return re.sub(r'[^a-z0-9]', '', (s or '').lower())


def stesso_nome(a, b):
    a, b = norm(a), norm(b)
    if not a or not b:
        return a == b
    return a == b or (min(len(a), len(b)) >= 4 and (a in b or b in a))


def confronta_risposta(vero, dato):
    """vero e dato: {a, t, d, c}. Ritorna i giudizi per campo."""
    dato = dato or {}
    g = {
        'area': dato.get('a') == vero['a'],
        'area_princ': (dato.get('a') or '')[:2] == vero['a'][:2],
        'tipo': stesso_nome(vero['t'], dato.get('t')),
        'data': (vero['d'] or '') == (dato.get('d') or ''),
        'contro': stesso_nome(vero['c'], dato.get('c')),
    }
    g['tutto'] = g['area'] and g['data'] and g['contro']
    return g


def rifai_regole(db, ids):
    """La proposta che le regole facevano prima della revisione di Claude (ricalcolata adesso)."""
    from classifica import classifica
    cfg = A.carica_config()
    trova, persone = A.carica_mappa(cfg)
    nomi_az = [n.upper() for n in cfg.get('nomi_azienda', [])]
    out = {}
    for i in ids:
        r = db.execute('SELECT c.impronta, c.genere, t.testo, t.esito FROM contenuti c LEFT JOIN testi t USING(impronta) '
                       'WHERE c.rowid=?', (i,)).fetchone()
        f = db.execute('SELECT percorso, modificato FROM file WHERE impronta=? AND presente=1', (r['impronta'],)).fetchall()
        if not f:
            continue
        x = classifica({'testo': r['testo'], 'esito': r['esito'], 'genere': r['genere'], 'percorsi': [p['percorso'] for p in f],
                        'modificato': min(p['modificato'] for p in f)}, trova, persone, nomi_az)
        out[i] = x
    return out


class MetodoFisso:
    """Istruzioni + esempi fissi in testa (sempre uguali: LM Studio li legge una volta), simili e documento in fondo."""
    nome = 'fisso'
    temperatura = 0

    def __init__(self, db, c, escludi):
        self.ar = Archivio(db, c)
        self.esempi = self.ar.esempi_fissi(c['esempi'], escludi=escludi)
        self.escludi = set(escludi)
        self.sistema = self.ar.sistema(self.esempi)
        self.schema = formato(self.ar.codici)

    def esclusi(self):
        return {e['id'] for e in self.esempi}

    def messaggi(self, r, prop):
        sim = self.ar.simili(r, escludi=self.escludi) if r.get('id') else []
        regole = proposta_regole(prop, self.ar.inv) if prop else None
        return [{'role': 'system', 'content': self.sistema},
                {'role': 'user', 'content': self.ar.domanda(r, r['testo'], regole, sim)}]

    def leggi(self, testo):
        return leggi_risposta(testo, self.ar.codici)


class MetodoArchivio:
    """Gli stessi messaggi di archivio.classifica_llm (esempi scelti per somiglianza a ogni documento)."""
    nome = 'archivio'
    temperatura = 0.1              # come classifica_llm

    def __init__(self, db, c, escludi):
        self.codici = A.codici_aree(); self.inv = {v: k for k, v in self.codici.items()}
        self.esempi = [e for e in A.esempi_llm(db) if e[0]['id'] not in escludi]
        self.sistema = A.sistema_llm(c['nomi_azienda'])
        self.n = int(A.llm_config().get('esempi', 6))
        self.schema = {'type': 'json_schema', 'json_schema': {'name': 'classificazione', 'strict': True, 'schema': A.SCHEMA_LLM}}

    def esclusi(self):
        return set()

    def messaggi(self, r, prop):
        if prop:      # la proposta delle regole, non la risposta di Claude già salvata
            r = dict(r); r.update({k: prop[k] for k in ('area', 'sotto', 'tipo')})
        return A.messaggi_llm(r, self.esempi, self.sistema, self.inv, self.n)

    def leggi(self, testo):
        corr, _ = A._da_risposta(testo, self.codici)
        return corr


PESI = ('area', 'area_princ', 'tipo', 'data', 'contro', 'tutto')


def prova():
    c = impostazioni()
    n = arg('--prova', 30, int)
    seme = arg('--seme', 1, int)
    pronto = all(hasattr(A, f) for f in ('esempi_llm', 'sistema_llm', 'messaggi_llm'))
    metodo = arg('--metodo', 'archivio' if pronto else 'fisso')
    if metodo == 'archivio' and not pronto:
        print('archivio.py non ha ancora esempi_llm/sistema_llm/messaggi_llm: uso il metodo "fisso".'); metodo = 'fisso'
    nome = accendi(c)
    if not nome:
        return
    db = A.apri_db(); A.aggiorna_schema(db)
    candidati = sorted(r[0] for r in db.execute(
        "SELECT c.rowid FROM contenuti c WHERE c.classificato_da='claude' AND c.stato != 'riservato' AND c.area IS NOT NULL "
        "AND EXISTS (SELECT 1 FROM file f WHERE f.impronta=c.impronta AND f.presente=1)"))
    prove = random.Random(seme).sample(candidati, min(len(candidati), n + 40))
    M = (MetodoFisso if metodo == 'fisso' else MetodoArchivio)(db, c, set(prove))
    prove = [i for i in prove if i not in M.esclusi()][:n]
    codici = A.codici_aree(); inv = {v: k for k, v in codici.items()}
    righe_db = {r['id']: dict(r) for r in db.execute(
        f"SELECT c.rowid id, c.*, t.testo FROM contenuti c LEFT JOIN testi t USING(impronta) "
        f"WHERE c.rowid IN ({','.join('?' * len(prove))})", prove)}
    regole = rifai_regole(db, prove)
    mod = Modello(c, nome)
    print(f'Modello: {nome}   metodo: {metodo}   documenti: {len(prove)} (seme {seme})')
    print('Avvio (il modello legge le istruzioni la prima volta)...', end=' ', flush=True)
    finto = {'id': 0, 'percorso_scelto': 'Download\\prova.pdf', 'testo': '', 'area': None, 'sotto': None, 'tipo': None,
             'impronta': '', 'data_doc': None, 'anno': None, 'controparte': None, 'persona': None, 'descrizione': None}
    try:
        _, sec0, _ = mod.chiedi(M.messaggi(finto, None), M.schema, M.temperatura)
    except (RuntimeError, OSError) as e:
        print(f'\n{e}'); db.close(); return
    print(f'{sec0:.1f} s')
    tot = {k: 0 for k in PESI}; reg = {k: 0 for k in PESI}
    righe, secondi, tok_in, tok_out = [], [], 0, 0
    for k, i in enumerate(prove, 1):
        r = righe_db[i]
        vero = risposta_di(r, inv)
        rr = regole.get(i)
        try:
            grezzo, sec, uso = mod.chiedi(M.messaggi(r, rr), M.schema, M.temperatura)
            dato = M.leggi(grezzo)
        except (RuntimeError, OSError) as e:
            print(f'  #{i}: errore {e}'); dato, sec, uso, grezzo = None, 0, {}, str(e)
        g = confronta_risposta(vero, dato)
        gr = confronta_risposta(vero, {'a': inv.get((rr['area'], rr['sotto'])) or inv.get((rr['area'], None)) or '',
                                       't': rr['tipo'], 'd': rr['data_doc'] or '', 'c': rr['controparte']} if rr else None)
        for x in PESI:
            tot[x] += g[x]; reg[x] += gr[x]
        secondi.append(sec); tok_in += uso.get('prompt_tokens', 0); tok_out += uso.get('completion_tokens', 0)
        segno = 'ok' if g['tutto'] else ('area ok' if g['area'] else 'NO')
        print(f'  {k:>3}/{len(prove)}  #{i:<6} {sec:5.1f} s  {segno:<8} Claude {vero["a"]:<5} {vero["t"][:22]:<22} | '
              f'modello {(dato or {}).get("a", "?"):<5} {(dato or {}).get("t", "")[:22]}')
        righe.append({'id': i, 'file': os.path.basename(r['percorso_scelto'] or ''), 'claude': vero, 'modello': dato,
                      'regole': proposta_regole(rr, inv) if rr else None, 'giudizio': g, 'secondi': round(sec, 2),
                      'grezzo': (grezzo or '')[:500]})
    m = len(righe) or 1
    media = sum(secondi) / m
    print(f'\nRisultato su {len(righe)} documenti (uguale a Claude):')
    print(f'  {"":<22}{"modello":>9}{"regole":>9}')
    nomi = {'area': 'area e sottoarea', 'area_princ': 'area principale', 'tipo': 'tipo', 'data': 'data',
            'contro': 'controparte', 'tutto': 'area+data+contr.'}
    for x in PESI:
        print(f'  {nomi[x]:<22}{tot[x] / m:>8.0%}{reg[x] / m:>9.0%}')
    print(f'  secondi per documento: {media:.1f} (avvio {sec0:.0f} s); token letti in media {tok_in / m:.0f}, scritti {tok_out / m:.0f}')
    os.makedirs(PROVE, exist_ok=True)
    quando = dt.datetime.now().strftime('%Y%m%d-%H%M')
    with open(os.path.join(PROVE, f'{quando}_{metodo}_{re.sub(r"[^A-Za-z0-9.-]", "_", nome)}.json'), 'w', encoding='utf-8') as f:
        json.dump({'modello': nome, 'metodo': metodo, 'seme': seme, 'caratteri': c['caratteri'], 'righe': righe},
                  f, ensure_ascii=False, indent=1)
    riep = os.path.join(PROVE, 'riepilogo.csv')
    nuovo = not os.path.exists(riep)
    with open(riep, 'a', newline='', encoding='utf-8-sig') as f:
        w = csv.writer(f, delimiter=';')
        if nuovo:
            w.writerow(['quando', 'modello', 'metodo', 'documenti', 'seme', 'area', 'area_princ', 'tipo', 'data', 'controparte',
                        'tutto', 'secondi_doc', 'avvio_s', 'token_letti', 'regole_area', 'regole_tutto'])
        w.writerow([quando, nome, metodo, len(righe), seme] + [round(tot[x] / m, 3) for x in PESI] +
                   [round(media, 1), round(sec0), round(tok_in / m), round(reg['area'] / m, 3), round(reg['tutto'] / m, 3)])
    print(f'Dettagli: {PROVE}')
    A.registra(db, 'prova ia', chi='llm', modello=nome, metodo=metodo, documenti=len(righe),
               area=round(tot['area'] / m, 3), tutto=round(tot['tutto'] / m, 3), secondi=round(media, 1))
    db.commit(); db.close()


def confronta():
    riep = os.path.join(PROVE, 'riepilogo.csv')
    if not os.path.exists(riep):
        print('Nessuna prova ancora: python archivio.py prova-ia 30'); return
    with open(riep, encoding='utf-8-sig') as f:
        righe = list(csv.DictReader(f, delimiter=';'))
    print(f'{"quando":<14}{"modello":<38}{"doc":>4}{"area":>6}{"princ":>7}{"tipo":>6}{"data":>6}{"contr":>7}{"tutto":>7}{"s/doc":>7}')
    for r in righe:
        p = lambda k: f'{float(r[k]):.0%}'
        print(f'{r["quando"]:<14}{(r["modello"] + " " + r.get("metodo", ""))[:37]:<38}{r["documenti"]:>4}{p("area"):>6}{p("area_princ"):>7}{p("tipo"):>6}'
              f'{p("data"):>6}{p("controparte"):>7}{p("tutto"):>7}{float(r["secondi_doc"]):>7.1f}')


def mostra_modelli():
    c = impostazioni()
    if not acceso(c['url']):
        print(f'LM Studio non risponde su {c["url"]}.')
        if os.path.exists(LMS):
            print('Lo accendo con: lms server start'); accendi(dict(c, modello=''))
        if not acceso(c['url']):
            return
    for nome, tipo, caricato in elenco_modelli(c['url']):
        print(f'  {nome:<50} {tipo:<11} {"caricato" if caricato else ""}')


def comando_prova():
    """prova-ia N | prova-ia --confronta"""
    if '--confronta' in sys.argv:
        return confronta()
    if len(sys.argv) > 2 and sys.argv[2].isdigit() and '--prova' not in sys.argv:
        sys.argv[2:3] = ['--prova', sys.argv[2]]
    prova()


# --- File nuovi --------------------------------------------------------------------------------------

def nuovi():
    """archivio.py aggiorna, ma prima accende LM Studio e carica il modello scelto (per l'avvio a orario).
    --log: tutto in ArchivioAzienda\\aggiorna-log.txt (serve con pythonw, che non ha finestra)."""
    if '--log' in sys.argv:
        os.makedirs(A.DATI, exist_ok=True)
        sys.stdout = sys.stderr = open(os.path.join(A.DATI, 'aggiorna-log.txt'), 'a', encoding='utf-8', buffering=1)
        sys.argv.remove('--log')
    if '--senza-llm' not in sys.argv:
        try:
            accendi(impostazioni())
        except Exception as e:          # se LM Studio non va, l'aggiornamento senza modello si fa lo stesso
            print(f'LM Studio: {e}')
    A.aggiorna()
