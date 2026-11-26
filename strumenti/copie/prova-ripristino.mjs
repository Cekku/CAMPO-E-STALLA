// Prova di ripristino della copia di sicurezza sul PC (1.80.0). La chiede l'app una volta al mese al ponte
// (POST /copia/prova → strumenti/archivio/copie.py), che lancia questo script; si può lanciare anche a mano.
//
// Prende l'ultima copia di %USERPROFILE%\ArchivioAzienda\copie-sicurezza, la rimette con il vero pulsante
// "Carica copia" dell'app in un Edge (o Chrome) nascosto con un profilo nuovo e vuoto, non collegato
// (Supabase, ponte e IA del PC bloccati), ricarica la pagina e conta le registrazioni di ogni raccolta;
// poi controlla gli allegati salvati (impronta SHA-256 uguale a quella del giorno della copia) e li rimette
// nella memoria dei file dell'app per vedere che tornano interi. Il profilo si cancella alla fine.
//
//   node strumenti/copie/prova-ripristino.mjs [--cartella DIR] [--copia copia-AAAA-MM-GG.json.gz] [--url SITO]
// Scrive ripristino-ultimo.json e una riga in ripristini.jsonl nella cartella. Esce 0 (tutto torna), 1 (qualcosa
// non torna), 2 (la prova non è partita).

import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync, existsSync, writeFileSync, appendFileSync, readdirSync, statSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import net from 'node:net';

const RADICE = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const arg = n => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };
const CARTELLA = arg('--cartella') || process.env.CES_COPIE || join(homedir(), 'ArchivioAzienda', 'copie-sicurezza');
const URL_SITO = arg('--url');
const pausa = ms => new Promise(r => setTimeout(r, ms));
const MASSIMO = 10 * 60e3;   // la prova intera; il ponte la ferma comunque dopo 15 minuti
const { allegatiDi, attesi, confronta } = await import(pathToFileURL(join(RADICE, 'js', 'copia-conta.js')).href);
const COLS = await (async () => { const t = readFileSync(join(RADICE, 'js', 'state.js'), 'utf8'); const m = t.match(/export const COLS = \[([^\]]*)\]/); return m[1].match(/'([a-z]+)'/g).map(x => x.slice(1, -1)); })();

const aperti = []; let profilo = null;
function chiudiTutto() {
  // si aspetta che siano chiusi davvero: un server delle prove ancora vivo sulla stessa porta rovinerebbe la prova dopo
  for (const p of aperti) { try { if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(p.pid), '/t', '/f'], { stdio: 'ignore', windowsHide: true }); else p.kill('SIGKILL'); } catch {} }
  aperti.length = 0;
}
process.on('exit', chiudiTutto);

function portaLibera(da, a) {
  return new Promise(async ok => {
    for (let p = da; p <= a; p++) {
      const libera = await new Promise(r => { const s = net.createServer().once('error', () => r(false)).once('listening', () => s.close(() => r(true))).listen(p, '127.0.0.1'); });
      if (libera) return ok(p);
    }
    ok(null);
  });
}
const trovaBrowser = () => [process.env.CES_BROWSER, 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', '/usr/bin/chromium', '/usr/bin/google-chrome'].filter(Boolean).find(existsSync) || null;

async function avviaServer() {
  const porta = await portaLibera(8790, 8799);
  if (!porta) throw new Error('nessuna porta libera fra 8790 e 8799');
  const py = spawn(process.platform === 'win32' ? 'python' : 'python3', ['-m', 'http.server', String(porta), '--bind', '127.0.0.1'], { cwd: RADICE, stdio: 'ignore', windowsHide: true });
  aperti.push(py);
  for (let i = 0; i < 50; i++) { try { const r = await fetch(`http://127.0.0.1:${porta}/index.html`); if (r.ok) return `http://127.0.0.1:${porta}/`; } catch {} await pausa(200); }
  throw new Error('il server locale non risponde');
}
async function avviaBrowser(eseguibile) {
  profilo = mkdtempSync(join(tmpdir(), 'ces-ripristino-'));
  const b = spawn(eseguibile, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profilo}`, '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-sync', 'about:blank'], { stdio: 'ignore', windowsHide: true });
  aperti.push(b);
  const f = join(profilo, 'DevToolsActivePort');
  for (let i = 0; i < 100 && !existsSync(f); i++) await pausa(150);
  if (!existsSync(f)) throw new Error('il browser non è partito');
  await pausa(200);
  const porta = readFileSync(f, 'utf8').split('\n')[0].trim();
  for (let i = 0; i < 30; i++) {
    try { const l = await (await fetch(`http://127.0.0.1:${porta}/json/list`)).json(); const p = l.find(x => x.type === 'page'); if (p) return p.webSocketDebuggerUrl; } catch {}
    await pausa(200);
  }
  throw new Error('nessuna scheda nel browser');
}
function collega(ws) {
  return new Promise((ok, ko) => {
    const s = new WebSocket(ws); let id = 0; const attese = new Map();
    s.onopen = () => ok({ manda: (method, params = {}) => new Promise((r, e) => { const n = ++id; const t = setTimeout(() => { attese.delete(n); e(new Error('il browser non risponde (' + method + ')')); }, 60000); attese.set(n, { r: v => { clearTimeout(t); r(v); }, e: x => { clearTimeout(t); e(x); } }); s.send(JSON.stringify({ id: n, method, params })); }), chiudi: () => { try { s.close(); } catch {} } });
    s.onerror = ko;
    s.onmessage = m => { const d = JSON.parse(m.data); if (d.id && attese.has(d.id)) { const a = attese.get(d.id); attese.delete(d.id); d.error ? a.e(new Error(d.error.message)) : a.r(d.result); } };
  });
}
const valuta = async (cdp, expression) => { const r = await cdp.manda('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };
const CONTA = `import('./js/state.js').then(m => m.UI.loaded ? Object.fromEntries(m.COLS.map(c => [c, m.S[c].length])) : null)`;
async function aspettaApp(cdp, quando, volte = 300) {
  let ultimo = '';
  for (let i = 0; i < volte; i++) { try { const n = await valuta(cdp, CONTA); if (n) return n; ultimo = 'dati non ancora caricati'; } catch (e) { ultimo = e.message; } await pausa(200); }
  throw new Error(`l'app non si è aperta nel browser (${quando}: ${String(ultimo).slice(0, 160)})`);
}

/** Allegati della copia: ci sono tutti nella cartella e sono uguali a quando sono stati salvati? */
function controllaAllegati(dati) {
  const nominati = allegatiDi(dati); let indice = {};
  try { indice = JSON.parse(readFileSync(join(CARTELLA, 'allegati', 'indice.json'), 'utf8')); } catch {}
  const out = { attesi: 0, trovati: 0, mancanti: [], rovinati: [], nonArrivati: [], file: [] };
  for (const id of Object.keys(nominati)) {
    const f = join(CARTELLA, 'allegati', id.replace('/', '__'));
    if (!indice[id]) { out.nonArrivati.push(id); continue; }   // il dispositivo non l'aveva al momento della copia (già contato fra i "non trovati")
    out.attesi++;
    if (!existsSync(f)) { out.mancanti.push(id); continue; }
    const b = readFileSync(f);
    if (createHash('sha256').update(b).digest('hex') !== indice[id].sha256) { out.rovinati.push(id); continue; }
    out.trovati++; out.file.push({ id, tipo: indice[id].tipo || nominati[id] || 'application/octet-stream', byte: b.length, percorso: f });
  }
  return out;
}

async function principale() {
  const t0 = Date.now();
  const nomi = readdirSync(CARTELLA).filter(n => /^copia-\d{4}-\d{2}-\d{2}\.json\.gz$/.test(n)).sort();
  const d0 = new Date(), oggi = d0.getFullYear() + '-' + String(d0.getMonth() + 1).padStart(2, '0') + '-' + String(d0.getDate()).padStart(2, '0'),   // data del PC, come i nomi del ponte
    passate = nomi.filter(n => n.slice(6, 16) <= oggi);   // una copia con la data nel futuro (orologio sbagliato) non si prova
  const nome = arg('--copia') || passate[passate.length - 1] || nomi[nomi.length - 1];
  if (!nome) throw new Error('nessuna copia nella cartella ' + CARTELLA);
  const tutto = JSON.parse(gunzipSync(readFileSync(join(CARTELLA, nome))).toString('utf8'));
  const { _copia: meta, ...dati } = tutto;
  const att = attesi(dati, COLS);
  const all = controllaAllegati(dati);

  const eseguibile = trovaBrowser();
  if (!eseguibile) throw new Error('non trovo Edge né Chrome (si può indicare con CES_BROWSER)');
  const base = URL_SITO || await avviaServer();
  const cdp = await collega(await avviaBrowser(eseguibile));
  await cdp.manda('Network.enable');
  await cdp.manda('Network.setBlockedURLs', { urls: ['*:1234/*', '*:1235/*', '*:1236/*', '*supabase.co*'] });
  await cdp.manda('Runtime.enable'); await cdp.manda('Page.enable'); await cdp.manda('DOM.enable');
  // il Centro automatico non deve partire: scriverebbe registrazioni nuove (razioni, magazzino…) e i conti non tornerebbero
  await cdp.manda('Page.addScriptToEvaluateOnNewDocument', { source: "try { localStorage.setItem('ces.centro.ultimo', JSON.stringify(new Date().toISOString())); } catch (e) {}" });
  await cdp.manda('Page.navigate', { url: base });
  // a volte (circa una su sei, nel browser nascosto con il profilo nuovo) la prima apertura non finisce di leggere
  // l'archivio del browser: si riapre la pagina, al massimo due volte (da capire: vedi archivio-ponte.md)
  let prima = null, riaperture = 0;
  for (; !prima; riaperture++) {
    try { prima = await aspettaApp(cdp, 'prima del ripristino', 100); }
    catch (e) { if (riaperture >= 2) throw e; await cdp.manda('Page.reload', { ignoreCache: true }); await pausa(500); }
  }
  const giaDentro = Object.values(prima).reduce((s, n) => s + n, 0);
  if (giaDentro) throw new Error(`il browser di prova non è vuoto (${giaDentro} registrazioni prima del ripristino)`);

  // il vero pulsante "Carica copia" (input data-act="restore" di La mia azienda → Dati, gestito da app.js)
  const file = join(profilo, 'copia-da-rimettere.json');
  writeFileSync(file, JSON.stringify(dati));
  await valuta(cdp, `(() => { const i = document.createElement('input'); i.type = 'file'; i.dataset.act = 'restore'; i.id = 'provaRipristino'; i.hidden = true; document.body.appendChild(i); return true; })()`);
  const { root } = await cdp.manda('DOM.getDocument', { depth: 1 });
  const { nodeId } = await cdp.manda('DOM.querySelector', { nodeId: root.nodeId, selector: '#provaRipristino' });
  await cdp.manda('DOM.setFileInputFiles', { files: [file], nodeId });
  const totale = Object.values(att).reduce((s, n) => s + n, 0);
  let ora = {}, fermo = 0, ultimo = -1;
  for (let i = 0; i < 300 && fermo < 10; i++) {
    await pausa(300); ora = await valuta(cdp, CONTA) || {};
    const n = Object.values(ora).reduce((s, x) => s + x, 0);
    if (n === ultimo && n > 0) fermo++; else fermo = 0;
    ultimo = n; if (n >= totale) { await pausa(1500); break; }
  }
  // ricaricata la pagina, le registrazioni devono venire dall'archivio del browser (IndexedDB), non dalla memoria
  await valuta(cdp, 'window.__primaDellaRicarica = 1');
  await cdp.manda('Page.reload', { ignoreCache: true });
  for (let i = 0; i < 100; i++) { await pausa(200); try { if (!(await valuta(cdp, 'window.__primaDellaRicarica === 1'))) break; } catch {} }
  if (await valuta(cdp, 'window.__primaDellaRicarica === 1').catch(() => false)) throw new Error('la pagina non si è ricaricata');
  // dopo la ricarica: si conta quando l'app ha finito di leggere l'archivio del browser (tre letture uguali di fila)
  let dopo = await aspettaApp(cdp, 'dopo la ricarica'), uguali = 0;
  for (let i = 0; i < 40 && uguali < 3; i++) { await pausa(700); const n = await valuta(cdp, CONTA).catch(() => null) || {}; if (JSON.stringify(n) === JSON.stringify(dopo)) uguali++; else { uguali = 0; dopo = n; } }
  // e le stesse registrazioni devono esserci in IndexedDB, raccolta per raccolta
  const inIdb = await valuta(cdp, `new Promise(r => { const q = indexedDB.open('campoestalla'); q.onerror = () => r(null); q.onsuccess = () => { const g = q.result.transaction('records').objectStore('records').getAll(); g.onsuccess = () => { const o = {}; for (const x of g.result) if (!x.deleted) o[x.col] = (o[x.col] || 0) + 1; r(o); }; g.onerror = () => r(null); }; })`);
  if (!inIdb) throw new Error("non riesco a leggere l'archivio del browser (IndexedDB)");
  for (const c of Object.keys(att)) if ((inIdb[c] || 0) !== (dopo[c] || 0)) dopo[c] = Math.min(dopo[c] || 0, inIdb[c] || 0);   // conta solo quello che c'è in tutti e due
  const conf = confronta(att, dopo);

  // allegati rimessi nella memoria dei file dell'app (cache "ces-allegati-1", come js/allegati.js) e riletti
  let rimessi = 0;
  for (const a of all.file) {
    const b64 = readFileSync(a.percorso).toString('base64');
    const n = await valuta(cdp, `(async () => { const bin = atob(${JSON.stringify(b64)}); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
      const c = await caches.open('ces-allegati-1'); const k = new URL('./allegati/' + ${JSON.stringify(a.id)}, location.href).href;
      await c.put(k, new Response(new Blob([u], { type: ${JSON.stringify(a.tipo)} }))); const r = await c.match(k); return r ? (await r.blob()).size : -1; })()`);
    if (n === a.byte) rimessi++;
  }
  cdp.chiudi();
  const okAll = !all.mancanti.length && !all.rovinati.length && rimessi === all.file.length;
  return {
    quando: new Date().toISOString(), copia: nome, copiaDel: meta && meta.quando, versioneCopia: meta && meta.versione, sito: base,
    esito: conf.ok && okAll ? 'ok' : 'diverso', riaperture: riaperture - 1,
    registrazioni: { attese: conf.attese, trovate: conf.trovate }, diverse: conf.diverse, raccolte: conf.righe,
    allegati: { attesi: all.attesi, trovati: rimessi, mancanti: all.mancanti, rovinati: all.rovinati, nonArrivati: all.nonArrivati.length },
    errore: conf.ok ? (okAll ? '' : `allegati: ${all.mancanti.length} mancanti, ${all.rovinati.length} rovinati, ${all.file.length - rimessi} non rimessi`) : '',
    secondi: Math.round((Date.now() - t0) / 1000),
  };
}

let codice = 2, r;
let scaduto; const tempo = new Promise((_, ko) => { scaduto = setTimeout(() => ko(new Error('la prova ha superato i 10 minuti')), MASSIMO); });
try { r = await Promise.race([principale(), tempo]); codice = r.esito === 'ok' ? 0 : 1; }
catch (e) { r = { quando: new Date().toISOString(), esito: 'errore', errore: e.message }; }
finally {
  clearTimeout(scaduto); chiudiTutto(); await pausa(1500);
  if (profilo) { for (let i = 0; i < 5; i++) { try { rmSync(profilo, { recursive: true, force: true }); break; } catch { await pausa(1000); } } }
}
try { writeFileSync(join(CARTELLA, 'ripristino-ultimo.json'), JSON.stringify(r, null, 1)); appendFileSync(join(CARTELLA, 'ripristini.jsonl'), JSON.stringify(r) + '\n'); } catch (e) { console.error('resoconto non scritto: ' + e.message); }
console.log(`Prova di ripristino: ${r.esito}` + (r.registrazioni ? ` — ${r.registrazioni.trovate}/${r.registrazioni.attese} registrazioni, ${r.allegati.trovati}/${r.allegati.attesi} allegati, ${r.secondi} s` : '') + (r.errore ? ` — ${r.errore}` : ''));
process.exit(codice);
