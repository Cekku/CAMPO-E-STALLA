"""Ponte tra l'app Campo e Stalla e LM Studio (modello di intelligenza artificiale sul PC).

LM Studio resta com'è (server su http://localhost:1234, senza "Enable CORS"), quindi i siti che visiti
non possono usarlo. Questo ponte ascolta su http://localhost:1235 e lascia passare solo:
  - le richieste che arrivano dall'app (https://cekku.github.io o dal server di prova in locale);
  - solo l'elenco dei modelli e la richiesta di una risposta (niente caricamento o scaricamento di modelli).
Ascolta solo su questo computer (127.0.0.1): dagli altri dispositivi della rete non si raggiunge.

Avvio: doppio clic su "Avvia ponte LM Studio.bat" (oppure: python ponte-lmstudio.py).
"""
import http.server
import socketserver
import sys
import urllib.error
import urllib.request

LM_STUDIO = 'http://127.0.0.1:1234'
PORTA = 1235
ORIGINI = {
    'https://cekku.github.io',
    'http://localhost:8765',
    'http://127.0.0.1:8765',
}
PERCORSI = {('GET', '/v1/models'), ('POST', '/v1/chat/completions')}


class Ponte(http.server.BaseHTTPRequestHandler):
    server_version = 'PonteCampoEStalla/1.0'

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

    def _rifiuta(self, codice, testo):
        corpo = testo.encode('utf-8')
        self.send_response(codice)
        self.send_header('Content-Type', 'text/plain; charset=utf-8')
        self.send_header('Content-Length', str(len(corpo)))
        self.end_headers()
        self.wfile.write(corpo)

    def do_OPTIONS(self):
        origine = self._origine()
        if not origine:
            return self._rifiuta(403, 'Origine non ammessa')
        self.send_response(204)
        self._cors(origine)
        self.end_headers()

    def _inoltra(self, metodo):
        origine = self._origine()
        if not origine:
            return self._rifiuta(403, 'Origine non ammessa')
        percorso = self.path.split('?')[0]
        if (metodo, percorso) not in PERCORSI:
            return self._rifiuta(404, 'Richiesta non ammessa dal ponte')
        dati = None
        if metodo == 'POST':
            n = int(self.headers.get('Content-Length') or 0)
            if n > 2_000_000:
                return self._rifiuta(413, 'Richiesta troppo grande')
            dati = self.rfile.read(n)
        req = urllib.request.Request(LM_STUDIO + percorso, data=dati, method=metodo, headers={'Content-Type': 'application/json'})
        try:
            with urllib.request.urlopen(req, timeout=900) as r:
                corpo, codice, tipo = r.read(), r.status, r.headers.get('Content-Type', 'application/json')
        except urllib.error.HTTPError as e:
            corpo, codice, tipo = e.read(), e.code, e.headers.get('Content-Type', 'application/json')
        except OSError:
            corpo, codice, tipo = '{"error":{"message":"LM Studio non risponde: controlla che il server sia acceso sulla porta 1234"}}'.encode(), 502, 'application/json'
        self.send_response(codice)
        self._cors(origine)
        self.send_header('Content-Type', tipo)
        self.send_header('Content-Length', str(len(corpo)))
        self.end_headers()
        self.wfile.write(corpo)

    def do_GET(self):
        self._inoltra('GET')

    def do_POST(self):
        self._inoltra('POST')

    def log_message(self, fmt, *args):
        sys.stdout.write('%s  %s\n' % (self.log_date_time_string(), fmt % args))


class Server(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True


if __name__ == '__main__':
    print(f'Ponte attivo su http://localhost:{PORTA} -> LM Studio {LM_STUDIO}')
    print('Lascia aperta questa finestra (o avvialo in automatico). Ctrl+C per fermarlo.')
    Server(('127.0.0.1', PORTA), Ponte).serve_forever()
