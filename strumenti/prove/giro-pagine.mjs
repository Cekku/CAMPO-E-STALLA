// Giro di tutte le pagine dell'app in un Edge nascosto (o Chrome), senza scaricare niente.
// Apre ogni voce del menu di ogni area, e le schede che compaiono dentro le pagine, prima come
// computer (1280 px, tema chiaro) e poi come telefono (375 px, tema scuro), e annota:
// errori del programma, errori scritti nella console, file dell'app che non arrivano,
// pagine vuote e, sul telefono, pagine più larghe dello schermo.
// Profilo del browser nuovo e vuoto (niente dati veri, niente accesso), cancellato alla fine;
// il ponte dell'archivio e l'IA del PC (porte 1234-1236) sono bloccati.
//
//   node strumenti/prove/giro-pagine.mjs                       → sito sul PC (server locale aperto e chiuso da solo)
//   node strumenti/prove/giro-pagine.mjs --url https://cekku.github.io/CAMPO-E-STALLA/   → sito pubblicato
//   --out risultato.json   salva il risultato completo; --solo computer|telefono
// Esce con 1 se trova problemi, con 2 se il giro non è riuscito a partire.

import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';

const RADICE = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const arg = n => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };
const URL_SITO = arg('--url');
const USCITA = arg('--out');
const SOLO = arg('--solo');
const MAX_PAGINE = 250;
const pausa = ms => new Promise(r => setTimeout(r, ms));

const aperti = [];   // processi da chiudere sempre
let profilo = null;
function chiudiTutto() {
  for (const p of aperti) { try { if (process.platform === 'win32') spawn('taskkill', ['/pid', String(p.pid), '/t', '/f'], { stdio: 'ignore' }); else p.kill('SIGKILL'); } catch {} }
  aperti.length = 0;
}
process.on('exit', chiudiTutto);
process.on('SIGINT', () => { chiudiTutto(); process.exit(2); });

function portaLibera(da, a) {
  return new Promise(async ok => {
    for (let p = da; p <= a; p++) {
      const libera = await new Promise(r => { const s = net.createServer().once('error', () => r(false)).once('listening', () => s.close(() => r(true))).listen(p, '127.0.0.1'); });
      if (libera) return ok(p);
    }
    ok(null);
  });
}

function trovaBrowser() {
  const c = [
    process.env.CES_BROWSER,
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    '/usr/bin/chromium', '/usr/bin/google-chrome',
  ].filter(Boolean);
  return c.find(existsSync) || null;
}

async function avviaServer() {
  const porta = await portaLibera(8790, 8799);
  if (!porta) throw new Error('nessuna porta libera fra 8790 e 8799');
  const py = spawn(process.platform === 'win32' ? 'python' : 'python3', ['-m', 'http.server', String(porta), '--bind', '127.0.0.1'], { cwd: RADICE, stdio: 'ignore', windowsHide: true });
  aperti.push(py);
  for (let i = 0; i < 50; i++) { try { const r = await fetch(`http://127.0.0.1:${porta}/index.html`); if (r.ok) return `http://127.0.0.1:${porta}/`; } catch {} await pausa(200); }
  throw new Error('il server locale non risponde');
}

async function avviaBrowser(eseguibile) {
  profilo = mkdtempSync(join(tmpdir(), 'ces-giro-'));
  const b = spawn(eseguibile, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profilo}`, '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-sync', '--disable-features=Translate', 'about:blank'], { stdio: 'ignore', windowsHide: true });
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

// collegamento minimo al protocollo del browser (CDP)
function collega(ws) {
  return new Promise((ok, ko) => {
    const s = new WebSocket(ws); let id = 0; const attese = new Map(); const asc = [];
    s.onopen = () => ok({
      manda: (method, params = {}) => new Promise((r, e) => { const n = ++id; attese.set(n, { r, e }); s.send(JSON.stringify({ id: n, method, params })); }),
      su: f => asc.push(f),
      chiudi: () => { try { s.close(); } catch {} },
    });
    s.onerror = ko;
    s.onmessage = m => {
      const d = JSON.parse(m.data);
      if (d.id && attese.has(d.id)) { const a = attese.get(d.id); attese.delete(d.id); d.error ? a.e(new Error(d.error.message)) : a.r(d.result); }
      else if (d.method) asc.forEach(f => f(d.method, d.params));
    };
  });
}

async function giro(cdp, base, modo) {
  const problemi = []; let pagina = 'avvio';
  const origine = new URL(base).origin;
  const aggiungi = (tipo, testo) => { testo = String(testo || '').replace(/\s+/g, ' ').slice(0, 400); if (!problemi.some(p => p.tipo === tipo && p.testo === testo && p.pagina === pagina)) problemi.push({ modo, pagina, tipo, testo }); };
  const esterni = new Set();
  cdp.su((m, p) => {
    if (m === 'Runtime.exceptionThrown') { const e = p.exceptionDetails; aggiungi('errore del programma', (e.exception?.description || e.text) + (e.url ? ` (${e.url.replace(origine, '')}:${e.lineNumber + 1})` : '')); }
    else if (m === 'Runtime.consoleAPICalled' && p.type === 'error') aggiungi('errore nella console', p.args.map(a => a.value ?? a.description ?? '').join(' '));
    else if (m === 'Network.responseReceived' && p.response.status >= 400) { if (p.response.url.startsWith(origine)) aggiungi('file che non arriva', `${p.response.status} ${p.response.url.replace(origine, '')}`); else esterni.add(new URL(p.response.url).host); }
    else if (m === 'Network.loadingFailed' && !p.canceled && p.blockedReason == null) { if ((p.__url || '').startsWith(origine)) aggiungi('file che non arriva', p.errorText); }
  });
  const urls = new Map();
  cdp.su((m, p) => { if (m === 'Network.requestWillBeSent') urls.set(p.requestId, p.request.url); if (m === 'Network.loadingFailed') { const u = urls.get(p.requestId) || ''; if (u.startsWith(origine) && !p.canceled && !p.blockedReason) aggiungi('file che non arriva', `${p.errorText} ${u.replace(origine, '')}`); else if (u && !u.startsWith(origine) && !p.blockedReason) esterni.add(new URL(u).host); } });

  const valuta = async espr => (await cdp.manda('Runtime.evaluate', { expression: espr, awaitPromise: true, returnByValue: true })).result?.value;

  if (modo === 'telefono') {
    await cdp.manda('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 2, mobile: true });
    await cdp.manda('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] });
  } else {
    await cdp.manda('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
    await cdp.manda('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] });
  }
  // niente finestre di stampa; app nuova ogni volta
  await cdp.manda('Page.addScriptToEvaluateOnNewDocument', { source: "try{localStorage.setItem('ces.prova.nostampa','1')}catch(e){}" });
  // controprova del giro: CES_GIRO_GUASTO=1 mette tre guasti finti, che devono comparire fra i problemi
  if (process.env.CES_GIRO_GUASTO) await cdp.manda('Page.addScriptToEvaluateOnNewDocument', { source: "setTimeout(()=>{console.error('guasto di prova');fetch('./js/manca-di-prova.js');setTimeout(()=>{throw new TypeError('guasto di prova')},10)},4000)" });
  await cdp.manda('Page.navigate', { url: base });
  let pronta = false;
  for (let i = 0; i < 100 && !pronta; i++) { await pausa(200); pronta = await valuta("!!document.querySelector('[data-act=area]')").catch(() => false); }
  if (!pronta) { aggiungi('app che non parte', 'dopo 20 secondi il menu non c\'è'); return { problemi, pagine: [], esterni: [...esterni] }; }
  await pausa(2500);

  // clic come fa l'utente: un pulsante con data-act messo nella pagina (lo gestisce il dispatcher di app.js)
  const premi = (act, dati) => valuta(`(()=>{const b=document.createElement('button');b.hidden=true;b.dataset.act=${JSON.stringify(act)};Object.assign(b.dataset,${JSON.stringify(dati)});document.body.appendChild(b);b.click();b.remove();return true})()`);
  const vociVisibili = () => valuta(`[...document.querySelectorAll('[data-act=nav],[data-act=tab]')].map(b=>[b.dataset.tab||'',b.dataset.sub||'']).filter(x=>x[0])`);
  const stato = () => valuta(`(()=>{const m=document.querySelector('main')||document.body;const t=(m.innerText||'').trim();const d=document.documentElement;return {testo:t.length,largo:d.scrollWidth>window.innerWidth+2?d.scrollWidth:0,titolo:(document.querySelector('h1,.top-title,#title')||{}).textContent||''}})()`);

  const aree = await valuta(`[...new Set([...document.querySelectorAll('[data-act=area]')].map(b=>b.dataset.area))]`) || [];
  const fatte = new Set(); const pagine = [];
  for (const area of aree) {
    pagina = `${area}`;
    await premi('area', { area }); await pausa(900);
    const coda = (await vociVisibili() || []).map(([t, s]) => [area, t, s]);
    while (coda.length && pagine.length < MAX_PAGINE) {
      const [ar, tab, sub] = coda.shift();
      const chiave = `${ar}/${tab}/${sub}`;
      if (fatte.has(chiave)) continue; fatte.add(chiave);
      pagina = `${ar} → ${tab}${sub ? ' / ' + sub : ''}`;
      await premi('area', { area: ar }); await pausa(150);
      await premi('nav', sub ? { tab, sub } : { tab });
      await pausa(tab === 'mappa' ? 2500 : 900);
      const s = await stato().catch(e => ({ errore: e.message }));
      if (s?.errore) aggiungi('pagina che non risponde', s.errore);
      else {
        if (s.testo < 20 && tab !== 'mappa') aggiungi('pagina vuota', `${s.testo} caratteri di testo`);
        if (modo === 'telefono' && s.largo) aggiungi('più larga dello schermo', `${s.largo} px su 375`);
      }
      pagine.push(pagina);
      // le schede dentro la pagina (es. i gruppi dei Conti) entrano nel giro
      for (const [t2, s2] of await vociVisibili() || []) if (!fatte.has(`${ar}/${t2}/${s2}`)) coda.push([ar, t2, s2]);
      // un foglio rimasto aperto si chiude
      await valuta(`document.querySelector('.sheet.open,[data-act=closeSheet]')&&document.querySelector('[data-act=closeSheet]')?.click()`).catch(() => {});
    }
  }
  return { problemi, pagine, esterni: [...esterni] };
}

async function principale() {
  const eseguibile = trovaBrowser();
  if (!eseguibile) throw new Error('non trovo Edge né Chrome (si può indicare con CES_BROWSER)');
  const base = URL_SITO || await avviaServer();
  const ws = await avviaBrowser(eseguibile);
  const modi = SOLO ? [SOLO] : ['computer', 'telefono'];
  const risultato = { quando: new Date().toISOString(), sito: base, browser: eseguibile.split(/[\\/]/).pop(), modi: {} };
  for (const modo of modi) {
    const cdp = await collega(ws);
    await cdp.manda('Network.enable');
    await cdp.manda('Network.setBlockedURLs', { urls: ['*:1234/*', '*:1235/*', '*:1236/*'] });
    await cdp.manda('Network.setCacheDisabled', { cacheDisabled: true });
    await cdp.manda('Network.clearBrowserCookies');
    await cdp.manda('Storage.clearDataForOrigin', { origin: new URL(base).origin, storageTypes: 'all' }).catch(() => {});
    await cdp.manda('Runtime.enable'); await cdp.manda('Page.enable'); await cdp.manda('Log.enable');
    const versione = { };
    risultato.modi[modo] = await giro(cdp, base, modo);
    risultato.modi[modo].versione = await cdp.manda('Runtime.evaluate', { expression: "import('./js/version.js').then(m=>m.VERSION).catch(()=> '')", awaitPromise: true, returnByValue: true }).then(r => r.result?.value || '').catch(() => '');
    cdp.chiudi();
  }
  return risultato;
}

let codice = 0;
try {
  const r = await principale();
  const tutti = Object.values(r.modi).flatMap(m => m.problemi);
  if (USCITA) writeFileSync(USCITA, JSON.stringify(r, null, 2));
  console.log(`Giro delle pagine — ${r.sito} (${r.browser})`);
  for (const [modo, m] of Object.entries(r.modi)) console.log(`  ${modo}: versione ${m.versione || '?'}, ${m.pagine.length} pagine aperte, ${m.problemi.length} problemi` + (m.esterni.length ? `; siti esterni che non hanno risposto: ${m.esterni.join(', ')}` : ''));
  for (const p of tutti) console.log(`  - [${p.modo}] ${p.pagina}: ${p.tipo} — ${p.testo}`);
  if (!tutti.length) console.log('  Nessun problema trovato.');
  codice = tutti.length ? 1 : 0;
} catch (e) {
  console.error('Il giro non è riuscito: ' + e.message);
  codice = 2;
} finally {
  chiudiTutto();
  await pausa(1500);
  if (profilo) { for (let i = 0; i < 5; i++) { try { rmSync(profilo, { recursive: true, force: true }); break; } catch { await pausa(1000); } } }
}
process.exit(codice);
