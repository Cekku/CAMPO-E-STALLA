"""Ponte FINTO dell'archivio per provare nel browser le fatture del latte (nessun documento vero).
Uso:  node strumenti/prove/latte.mjs --json <cartella>/latte-finti.json
      python -I strumenti/prove/ponte-finto-latte.py <cartella>/latte-finti.json [porta=1237]
App anche sulle porte 8766/8767 (origine pulita per un collaudo nuovo). Nell'app: localStorage 'ces.archivio' = {"url": "http://127.0.0.1:1237"} (poi ricarica).
Risponde a /stato, /documenti (con q: documenti che contengono tutte le parole), /documenti/<id>, /testo/<id o impronta>.
"""
import json, sys, re
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs, unquote

DOCS = json.load(open(sys.argv[1], encoding='utf-8'))
PORTA = int(sys.argv[2]) if len(sys.argv) > 2 else 1237
ORIGINI = {'http://localhost:%d' % p for p in (8765, 8766, 8767)} | {'http://127.0.0.1:%d' % p for p in (8765, 8766, 8767)}
senza = lambda d: {k: v for k, v in d.items() if k != 'testo'}

class H(BaseHTTPRequestHandler):
    def _cors(self):
        o = self.headers.get('Origin')
        if o in ORIGINI:
            self.send_header('Access-Control-Allow-Origin', o)
            self.send_header('Access-Control-Allow-Private-Network', 'true')
            self.send_header('Access-Control-Allow-Headers', 'Content-Type')
    def _json(self, code, obj):
        b = json.dumps(obj).encode()
        self.send_response(code); self._cors()
        self.send_header('Content-Type', 'application/json'); self.send_header('Content-Length', str(len(b)))
        self.end_headers(); self.wfile.write(b)
    def do_OPTIONS(self):
        self.send_response(204); self._cors(); self.end_headers()
    def do_GET(self):
        u = urlparse(self.path); q = {k: v[0] for k, v in parse_qs(u.query).items()}
        p = unquote(u.path)
        if p == '/stato': return self._json(200, {'versione': 3, 'contenuti': len(DOCS), 'file_presenti': len(DOCS), 'per_stato': {}, 'finto': True})
        if p == '/documenti':
            ds = DOCS
            if q.get('q'):
                parole = [w.lower() for w in re.findall(r'\w+', q['q'])]
                ds = [d for d in ds if all(w in (d['testo'] + ' ' + d['nome']).lower() for w in parole)]
            ds = sorted(ds, key=lambda d: d.get('data') or '', reverse=q.get('ordina', '-data').startswith('-'))
            return self._json(200, {'totale': len(ds), 'inizio': 0, 'limite': 500, 'documenti': [senza(d) for d in ds]})
        if p.startswith('/file/'): return self._json(410, {'errore': 'documento finto: il file non esiste'})
        m = re.match(r'^/(documenti|testo)/(.+)$', p)
        if m:
            d = next((d for d in DOCS if str(d['id']) == m.group(2) or d['impronta'] == m.group(2)), None)
            if not d: return self._json(404, {'errore': 'documento sconosciuto'})
            if m.group(1) == 'testo': return self._json(200, {'impronta': d['impronta'], 'esito': 'ok', 'metodo': 'pdf', 'pagine': 1, 'caratteri': len(d['testo']), 'testo': d['testo']})
            return self._json(200, senza(d))
        return self._json(404, {'errore': 'richiesta sconosciuta'})
    def log_message(self, *a): pass

print('ponte finto su http://127.0.0.1:%d con %d documenti' % (PORTA, len(DOCS)))
ThreadingHTTPServer(('127.0.0.1', PORTA), H).serve_forever()
