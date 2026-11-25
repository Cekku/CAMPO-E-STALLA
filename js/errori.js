// Registro degli errori dell'app (1.77.0, chiesto da Marco il 25/11/2026): quando l'app dà un errore su un dispositivo
// dell'azienda (anche il telefono di un collaboratore) l'errore resta scritto e il titolare lo vede in Archivio → Errori dell'app.
// Raccolta `errori` (tabella records, regole RLS di sempre: la scrivono titolare e collaboratori, non chi è in sola lettura).
// Un record per errore e per dispositivo (id `er-<firma>-<dispositivo>`): ogni dispositivo scrive solo i suoi, così due
// telefoni con lo stesso errore non si rubano il conteggio; la pagina li unisce per firma.
// Il testo si ripulisce prima di salvarlo (pulisci): niente importi, nomi, codici, email o indirizzi copiati dal messaggio.
// Niente lookbehind nelle espressioni regolari: i Safari vecchi non le leggono e l'app intera non partirebbe.
import { S, UI } from './state.js';
import * as store from './store.js';
import { sync } from './store.js';
import { VERSION } from './version.js';
import { nativa } from './nativo.js';
import { lsGet, lsSet } from './util.js';

export const MAX = 200, GIORNI = 90;
const ATTESA = 3000, PAUSA = 60000;              // prima scrittura dopo 3 s, poi al massimo una al minuto
const CODA = 'ces.errori.coda';                   // errori prima che l'app parta (js/errori-avvio.js), testo grezzo
const SOSPESI = 'ces.errori.attesa';              // errori pronti ma non ancora salvati (app chiusa, sola lettura)
const DISP = 'ces.dispositivo';

/* ---------------- Pulizia del testo ---------------- */
// Sigle e nomi propri che non sono dati: restano scritti
const SIGLE = new Set('JSON HTTP HTTPS URL URI PDF XML CSV API DOM SQL RLS JWT CORS CSP MIME TLS SSL DNS IP UTC GMT UI PIN IVA IBAN OCR ID UTF GPS AIA PAC NDVI WMS WFS KML CPU GPU GL WASM OK IA PC APK SDK HTML CSS SVG PNG JPG JPEG GLB ZIP SW SHA UUID EUR'.split(' '));
const NOMI_OK = new Set('Supabase Claude Chrome Safari Firefox Edge Android Windows Excel Google GitHub Leaflet Tesseract Capacitor Promise Error Window Document Object Array Function Infinity'.split(' '));
// Parole con cui comincia una frase dopo ":" ";" "(" nei messaggi del browser e dell'app: dopo i due punti le altre con la
// maiuscola sono nomi ("Dipendente: Rossi senza cedolino"), queste no ("…: The database connection is closing")
const INIZI = new Set('The This That These Those It There A An No Not None Failed Cannot Could Unable Invalid Unexpected Uncaught Unknown Missing Expected Network Request Response Il Lo La Le Gli Un Una Uno Non Nessun Nessuna Nessuno Impossibile Manca Mancano Serve Servono Prima Controlla Riprova Questo Questa Quel Quella Ci Si Ho Hai Devi Accedi Errore'.split(' '));
const A = '\u0001', B = '\u0002';                // segnaposti interni: diventano [ ] alla fine
const segno = t => A + t + B;
const fuori = (s, f) => s.split(/(\u0001[^\u0002]*\u0002)/).map((p, i) => (i % 2 ? p : f(p))).join('');
const identificatore = x => /^[A-Za-z_$][\w$.\/-]{0,60}$/.test(x);   // 'importo', 'IDBObjectStore', 'js/app.js'

/** Testo dell'errore senza dati: importi e numeri lunghi → #, date → [data], nomi → [nome], codici (fiscale, IBAN…) → [codice],
 *  email → [email], indirizzi → [sito], percorsi e file dell'utente → [percorso]/[file], testi fra virgolette → "…"
 *  (restano i nomi del codice, es. 'importo'). Al massimo 160 caratteri. Restano scoperti i nomi tutti in minuscolo. */
export function pulisci(testo) {
  let s = String(testo == null ? '' : testo).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 600);
  // indirizzi prima delle email: di https://utente:parola@sito/… resta solo il sito
  s = s.replace(/\b[a-z][a-z0-9+.-]*:\/\/([^\/\s'"<>()?#]*)[^\s'"<>()]*/gi, (m, host) => segno(host.replace(/^[^@]*@/, '').replace(/[^\w.:-]/g, '').slice(0, 60) || 'sito'));
  s = fuori(s, p => p.replace(/[\w.+:-]+@[\w-]+(?:\.[\w-]+)+/g, () => segno('email')));   // anche utente:parola@sito
  // percorsi di Windows e nomi di file dell'utente (fatture, foto, fogli): il nome del file può essere un nome di persona
  s = fuori(s, p => p.replace(/\b[A-Za-z]:[\\\/][^\s'"<>|]*/g, () => segno('percorso')));
  // (non i nomi del codice: "r.json is not a function", "res.json(…)")
  s = fuori(s, p => p.replace(/[^\s'"<>\/\\:]{2,}\.(?:pdf|xlsx?|xlsm|ods|csv|xml|p7m|json|zip|rar|7z|jpe?g|png|gif|heic|webp|tiff?|docx?|odt|txt|kml|kmz|geojson|shp|dbf|eml|msg)\b(?!\s*\(|\s+is\s)/gi, () => segno('file')));
  s = fuori(s, p => p.replace(/(["“«`])([^"”»`]{0,200}?)(["”»`])/g, (m, a, x, b) => (identificatore(x) ? m : a + '…' + b)));
  // apostrofo dentro una parola (l'archivio, dell'app) non è una virgoletta
  s = fuori(s, p => p.replace(/(^|[^\wÀ-ÿ])['‘]([^'’]{0,200}?)['’](?![\wÀ-ÿ])/g, (m, pre, x) => (identificatore(x) ? m : pre + "'…'")));
  s = fuori(s, p => p.replace(/(?=[A-Za-z0-9]*\d)(?=[A-Za-z0-9]*[A-Za-z])\b[A-Za-z0-9]{8,}\b/g, () => segno('codice')));
  s = fuori(s, p => p.replace(/\b\d{4}-\d{2}-\d{2}(?:[T ][\d:.]+Z?)?|\b\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}\b/g, () => segno('data')));
  // numeri con separatori o da 3 cifre in su, e anche quelli piccoli accanto all'euro (45 €, € 5)
  s = fuori(s, p => p.replace(/\d+(?:[.,'’]\d+)+|\d{3,}/g, '#').replace(/(€\s*)\d+/g, '$1#').replace(/\d+(?=\s*(?:€|eur\b|euro\b))/gi, '#'));
  // la parola prima di srl, spa, snc, sas, ss è il nome di una ditta, anche in minuscolo
  s = fuori(s, p => p.replace(/(^|[^A-Za-zÀ-ÿ])([A-Za-zÀ-ÿ][\wÀ-ÿ'’&-]*)(\s+)(s\.?r\.?l\.?|s\.?p\.?a\.?|s\.?n\.?c\.?|s\.?a\.?s\.?|s\.?s\.?)(?![A-Za-z])/gi, (m, pre, w, sp, f) => pre + segno('nome') + sp + f));
  // tutte maiuscole → [nome], salvo le sigle e le costanti con il trattino basso (net::ERR_INTERNET_DISCONNECTED: serve a ignora)
  s = fuori(s, p => p.replace(/(^|[^A-Za-zÀ-ÿ_0-9])([A-ZÀ-Ý]{2,}(?:['’][A-ZÀ-Ý]+)?)(?![A-Za-zÀ-ÿ_0-9])/g, (m, pre, w) => (SIGLE.has(w) ? m : pre + segno('nome'))));
  // Parole con la maiuscola (Mario, Rossi) → [nome]. Restano: i pezzi di un nome del codice (IndexedDB), NOMI_OK,
  // la prima parola di una frase se dopo viene una parola minuscola, una virgoletta, "(" o ":" ("Cannot read…",
  // "Importo di # …", "Dipendente: …"), e dopo ": ; ( -" solo le parole di INIZI ("…: The database is…").
  // Non bastano una virgola, un numero, un segnaposto o la fine: "Rossi, scadenza…", "Bianchi 1.250,00", "Sig. Rossi"
  // sono nomi (trovati nel collaudo e nella revisione del 25/11).
  // Si guarda tutto il testo intorno alla parola, non solo il pezzo fra due segnaposti (dopo "[nome] " non comincia una frase).
  s = s.replace(/([A-ZÀ-Ý][a-zà-ÿ]+)(?![A-Za-zÀ-ÿ])/g, (m, w, i, tutto) => {
    const prima = tutto.slice(0, i), dopo = tutto.slice(i + w.length);
    if (prima.lastIndexOf(A) > prima.lastIndexOf(B)) return m;   // dentro un segnaposto
    if (/[A-Za-zÀ-ÿ0-9_$]$/.test(prima) || NOMI_OK.has(w)) return m;
    if (/(^|[.!?])\s*$/.test(prima)) return /^(?:\s*[:;]|\s*[a-zà-ÿ'"“«‘(…\[])/.test(dopo) ? m : segno('nome');
    if (/[:;(—–-]\s*$/.test(prima)) return INIZI.has(w) ? m : segno('nome');
    return segno('nome');
  });
  s = s.replace(new RegExp(A + 'nome' + B + '(?:\\s+' + A + 'nome' + B + ')+', 'g'), segno('nome'));
  s = s.replace(/\u0001/g, '[').replace(/\u0002/g, ']').trim();
  return s.length > 160 ? s.slice(0, 159) + '…' : s;
}

/** Percorso del file dentro l'app (js/views/conti.js), senza sito, domande (?v=…) né caratteri strani. */
export function percorso(u) {
  const s = String(u || '').split(/[?#]/)[0];
  const m = s.match(/\/((?:js|vendor|css|fonts|modelli|data|supabase)\/[\w.\/-]+)$/);
  return (m ? m[1] : s.split('/').pop() || '').replace(/[^\w.\/-]/g, '').slice(0, 80);
}

/** Pezzo corto della pila: al massimo `max` righe "funzione file:riga" (Chrome "at f (url:1:2)", Firefox/Safari "f@url:1:2"). */
export function pila(stack, max = 4) {
  const out = [];
  for (const riga of String(stack || '').split('\n')) {
    // solo le righe della pila (Chrome "at …", Firefox/Safari "…@url", url da solo), non quella col messaggio
    if (!/^\s*at\s|@|^\s*[a-z][a-z0-9+.-]*:\/\//i.test(riga)) continue;
    const m = riga.match(/((?:[a-z][a-z0-9+.-]*:\/\/|\/)[^\s()@]*?|[\w.-]+\.m?js)(?::(\d+))(?::\d+)?\)?\s*$/i);
    if (!m) continue;
    const file = percorso(m[1]); if (!file || !/\.m?js$/.test(file)) continue;
    const n = (riga.match(/^\s*at\s+(?:async\s+)?([^\s(]+)\s+\(/) || riga.match(/^\s*([^@\s]*)@/) || [])[1] || '';
    const nome = n.split(/[*\/]/).pop().replace(/[^\w$.<>]/g, '').slice(0, 40);
    out.push((nome && nome !== 'anonymous' ? nome + ' ' : '') + file + ':' + m[2]);
    if (out.length >= max) break;
  }
  return out;
}

// FNV-1a a 32 bit: 8 cifre esadecimali
const hash = t => { let h = 0x811c9dc5; for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(16).padStart(8, '0'); };
/** Stesso errore = stesso testo ripulito e stesso primo punto del codice (senza il nome della funzione). */
export const firma = (nome, msg, p) => hash([nome || '', msg || '', ((p || [])[0] || '').split(' ').pop()].join('|'));

const ESTENSIONI = /(chrome|moz|safari(-web)?|ms-browser)-extension:/i;
/** Errore preso dal browser → { firma, nome, msg, pila, tipo } già ripulito; null se è da lasciar perdere. */
export function voce(err, tipo = 'errore', ctx = {}) {
  const e = err && typeof err === 'object' ? err : { message: err };
  const stack = String(e.stack || '') || (ctx.file ? 'at ' + ctx.file + ':' + (ctx.riga || 0) : '');
  if (ESTENSIONI.test(stack) || ESTENSIONI.test(ctx.file || '')) return null;   // estensioni del browser: non sono nostri
  const nome = /^[A-Za-z]{2,40}$/.test(e.name || '') && e.name !== 'Error' ? e.name : '';
  const f = percorso(ctx.file);   // solo i file dell'app (script e fogli di stile), non quelli di altri siti
  const msg = tipo === 'file' ? 'File non caricato: ' + (/^(js|vendor|css|fonts|modelli|data)\/[\w.\/-]+$/.test(f) ? f : 'file di un altro sito') : pulisci(e.message != null ? e.message : e.reason != null ? e.reason : String(err));
  const p = pila(stack);
  if (!msg && !p.length) return null;
  return { firma: firma(nome, msg, p), nome, msg, pila: p, tipo };
}

/** Errori che non sono guasti dell'app: avvisi del browser, pagine di altri siti, operazioni annullate, rete che manca o va
 *  a singhiozzo (anche con navigator.onLine vero: poco segnale, ponte del PC spento), file che non arrivano senza rete. */
export function ignora(o, ora = {}) {
  if (!o) return true;
  if (/ResizeObserver loop/i.test(o.msg)) return true;
  if (/^Script error\.?$/i.test(o.msg) && !o.pila.length) return true;
  if (o.nome === 'AbortError' || o.nome === 'FunctionsFetchError') return true;
  if (/Failed to fetch|NetworkError|Load failed|network error|Failed to send a request|ERR_[A-Z_]{4,}/i.test(o.msg)) return true;
  if (ora.offline && o.tipo === 'file') return true;
  return false;
}

/** Errori presi dai pulsanti (dispatcher di app.js): solo i guasti veri (TypeError, errori del database…), non gli avvisi
 *  scritti apposta per l'utente con new Error('…'), le risposte dell'accesso (password sbagliata) né un file sbagliato
 *  dato dall'utente (PDF rovinato o con password per pdf.js, file di OneDrive non scaricato, permesso negato). */
const NON_GUASTI = /^Auth|^AbortError$|^(InvalidPDF|MissingPDF|Password|UnexpectedResponse)Exception$|^FormatError$|^NotReadableError$|^NotAllowedError$/;
export const sembraGuasto = err => { const n = (err && err.name) || ''; return !!n && n !== 'Error' && !NON_GUASTI.test(n); };

/* ---------------- Dispositivo ---------------- */
export function dispositivo(ua = '', { nativa: nat = false, installata = false } = {}) {
  const tablet = /iPad|Tablet/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua));
  const tipo = tablet ? 'tablet' : /Mobi|iPhone|iPod|Android/i.test(ua) ? 'telefono' : 'computer';
  const sistema = /Android/i.test(ua) ? 'Android' : /iPhone|iPad|iPod/i.test(ua) ? 'iOS' : /Windows/i.test(ua) ? 'Windows' : /CrOS/.test(ua) ? 'ChromeOS' : /Macintosh|Mac OS X/i.test(ua) ? 'Mac' : /Linux/i.test(ua) ? 'Linux' : '';
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /SamsungBrowser/.test(ua) ? 'Samsung Internet' : /Firefox|FxiOS/.test(ua) ? 'Firefox' : /Chrome|CriOS/.test(ua) ? 'Chrome' : /Safari/.test(ua) ? 'Safari' : '';
  return { tipo, sistema, browser, app: nat ? 'app Android' : installata ? 'app installata' : 'sito' };
}
const TIPI = { telefono: 'Telefono', tablet: 'Tablet', computer: 'Computer' };
/** "Telefono Android · app Android" oppure "Computer Windows · Chrome" */
export const etichettaDisp = d => !d ? '' : [TIPI[d.tipo] || 'Dispositivo', d.sistema].filter(Boolean).join(' ') + ' · ' + (d.app && d.app !== 'sito' ? d.app : d.browser || 'browser');

/* ---------------- Conteggio, pulizia delle vecchie, gruppi ---------------- */
/** Unisce due registrazioni dello stesso errore sullo stesso dispositivo: volte sommate, prima e ultima volta, ultime 3 pagine;
 *  testo, pila, versione, dispositivo e ruolo dalla più nuova (b). */
export function unisci(a, b) {
  if (!a) return Object.assign({}, b);
  const r = Object.assign({}, a, b);
  r.volte = (+a.volte || 0) + (+b.volte || 0);
  r.prima = [a.prima, b.prima].filter(x => typeof x === 'string' && x).sort()[0] || '';
  r.ultima = [a.ultima, b.ultima].filter(x => typeof x === 'string' && x).sort().pop() || '';
  r.pagine = [...new Set([...lista(b.pagine), ...lista(a.pagine)])].filter(Boolean).slice(0, 3);
  r.versione = b.versione || a.versione || '';   // un errore di prima dell'avvio (versione non nota) non cancella quella salvata
  delete r.visto;   // fino alla prova del 25/11 "visto" stava qui: ora è in config `errori-visti`
  return r;
}

/** Id dei record da togliere: quelli fermi da più di `giorni` giorni e, oltre `max` righe, i più vecchi. */
export function daTogliere(elenco, ora = Date.now(), max = MAX, giorni = GIORNI) {
  const limite = new Date(ora - giorni * 864e5).toISOString();
  const u = r => (typeof r.ultima === 'string' ? r.ultima : '');
  const vecchi = elenco.filter(r => !u(r) || u(r) < limite);
  const resto = elenco.filter(r => u(r) && u(r) >= limite).sort((x, y) => u(y).localeCompare(u(x)) || String(x.id).localeCompare(String(y.id)));
  return [...vecchi, ...resto.slice(max)].map(r => r.id);
}

// "Visto" in un record solo, del titolare (config `errori-visti` = { firme: { firma: fino a quando } }): i record `er-*`
// li scrive solo il loro dispositivo, così il visto non si perde quando un telefono rimanda la sua copia e il titolare
// non riscrive i conteggi degli altri. Nuovo = successo dopo l'ultimo "visto" di quella firma.
export const VISTI = 'errori-visti';
export const visti = () => { const r = (S.config || []).find(c => c.id === VISTI); return (r && r.firme && typeof r.firme === 'object') ? r.firme : {}; };
export const nuovo = (r, v = {}) => { const x = v[r.firma]; return !(typeof x === 'string' && x) || (typeof r.ultima === 'string' ? r.ultima : '') > x; };
const lista = x => (Array.isArray(x) ? x.filter(y => typeof y === 'string') : []);
const testoDi = x => (typeof x === 'string' ? x : '');
/** Errori uniti per firma (lo stesso errore su più dispositivi è una riga): nuovi prima, poi dal più recente.
 *  Un record rovinato (da un'altra versione o da un dispositivo modificato) non deve bloccare la pagina: campi controllati. */
export function gruppi(elenco, v = visti()) {
  const m = new Map();
  for (const r of elenco || []) {
    if (!r || typeof r.firma !== 'string' || !r.firma) continue;
    const ultima = testoDi(r.ultima), prima = testoDi(r.prima), pila = lista(r.pila).slice(0, 4);
    const g = m.get(r.firma) || { firma: r.firma, nome: testoDi(r.nome), msg: testoDi(r.msg), pila, tipo: testoDi(r.tipo), volte: 0, prima: '', ultima: '', pagine: [], versioni: [], disp: [], ids: [], nuovo: false };
    g.volte += +r.volte || 0;
    if (prima && (!g.prima || prima < g.prima)) g.prima = prima;
    if (ultima > g.ultima) { g.ultima = ultima; g.nome = testoDi(r.nome); g.msg = testoDi(r.msg); g.pila = pila; }
    g.pagine = [...new Set([...g.pagine, ...lista(r.pagine)])];
    const ver = testoDi(r.versione); if (ver && !g.versioni.includes(ver)) g.versioni.push(ver);
    const d = (r.disp && typeof r.disp === 'object' ? etichettaDisp(r.disp) : '') + (r.ruolo && r.ruolo !== 'titolare' ? ' (collaboratore)' : '');
    if (d && !g.disp.includes(d)) g.disp.push(d);
    g.ids.push(r.id);
    m.set(r.firma, g);
  }
  const out = [...m.values()]; out.forEach(g => (g.nuovo = nuovo(g, v)));
  return out.sort((x, y) => (y.nuovo - x.nuovo) || y.ultima.localeCompare(x.ultima));
}

/* ---------------- Raccolta ---------------- */
const coda = new Map();          // id → registrazione da scrivere
const presi = new Set();         // errori diversi presi in questa apertura (al massimo NUOVI)
const NUOVI = 20;
let timer = 0, ultimoScritto = 0, dentro = false, disp = '';

// tenuto anche in memoria: senza localStorage (navigazione privata di alcuni browser) non cambia a ogni errore
const idDispositivo = () => { if (disp) return disp; let d = lsGet(DISP, ''); if (!/^[a-z0-9]{6,12}$/.test(d)) { d = Math.random().toString(36).slice(2, 10).padEnd(6, '0'); lsSet(DISP, d); } return (disp = d); };
const pagina = () => [UI.area, UI.tab, UI.sub && UI.sub[UI.tab]].filter(x => typeof x === 'string' && x).map(x => x.replace(/[^\w-]/g, '').slice(0, 30)).join('/');
const ruolo = () => (!sync.farm ? 'titolare' : (sync.perm && sync.perm.role) || '');
const installata = () => { try { return !!(window.matchMedia && window.matchMedia('(display-mode: standalone)').matches); } catch (e) { return false; } };
const offline = () => typeof navigator !== 'undefined' && navigator.onLine === false;

/** Registra un errore (si scrive poco dopo, insieme agli altri). ctx: { file, riga, quando, versione }. → id del record o null. */
export function registra(err, tipo = 'errore', ctx = {}) {
  if (dentro) return null;
  try {
    const o = voce(err, tipo, ctx);
    if (ignora(o, { offline: offline() })) return null;
    const id = 'er-' + o.firma + '-' + idDispositivo();
    // un guasto che cambia testo a ogni volta non deve riempire il registro e spingere fuori gli errori degli altri
    if (!presi.has(id)) { if (presi.size >= NUOVI) return null; presi.add(id); }
    const quando = ctx.quando || new Date().toISOString();
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
    // versione: quella di adesso, salvo gli errori di prima dell'avvio (js/errori-avvio.js), di una versione che non si sa
    const r = Object.assign(o, { volte: 1, prima: quando, ultima: quando, pagine: [pagina()].filter(Boolean), versione: ctx.versione != null ? ctx.versione : VERSION, disp: dispositivo(ua, { nativa: nativa === true, installata: installata() }) });
    coda.set(id, unisci(coda.get(id) || null, r));
    programma();
    return id;
  } catch (e) { return null; }
}

function programma() {
  if (timer) return;
  timer = setTimeout(() => { scrivi(); }, Math.max(ATTESA, ultimoScritto + PAUSA - Date.now()));
  if (timer && timer.unref) timer.unref();   // nelle prove in Node non tiene acceso il processo
}
const salvaSospesi = () => { const o = {}; [...coda].slice(-50).forEach(([id, r]) => (o[id] = r)); if (coda.size) lsSet(SOSPESI, o); else try { localStorage.removeItem(SOSPESI); } catch (e) { } };

/** Scrive gli errori in coda nella raccolta `errori` e toglie i vecchi. Con `pulizia` toglie i vecchi anche senza errori nuovi. → quanti scritti */
export async function scrivi(pulizia = false) {
  if (timer) clearTimeout(timer);
  timer = 0;
  if (!coda.size && !pulizia) return 0;
  if (!UI.loaded) { salvaSospesi(); if (coda.size) programma(); return 0; }   // archivio non ancora pronto
  if (store.soloLettura && store.soloLettura()) { salvaSospesi(); return 0; }  // in sola lettura restano sul dispositivo
  dentro = true; let n = 0;
  try {
    for (const [id, r] of [...coda]) {
      const prima = S.errori.find(x => x.id === id) || null;
      // il ruolo si legge adesso, ad archivio pronto: prima dell'avvio l'azienda collegata non si sa ancora
      await store.put('errori', id, Object.assign(unisci(prima, r), { ruolo: ruolo() })); coda.delete(id); n++;
      salvaSospesi();   // dopo ogni scrittura riuscita: se la prossima non riesce, quella già scritta non si conta due volte
    }
    for (const id of daTogliere(S.errori)) await store.remove('errori', id);
  } catch (e) { console.warn('registro degli errori', e); }
  finally { dentro = false; ultimoScritto = Date.now(); salvaSospesi(); }
  return n;
}

/** Svuota la coda in memoria (solo per le prove). */
export const _azzera = () => { coda.clear(); presi.clear(); if (timer) clearTimeout(timer); timer = 0; ultimoScritto = 0; dentro = false; };

/** Ascolta gli errori della pagina (chiamata una volta, nel browser): errori, promesse senza catch, file che non si caricano;
 *  riprende quelli presi da js/errori-avvio.js prima che l'app partisse e quelli rimasti da salvare l'ultima volta. */
export function avvia() {
  if (typeof window === 'undefined' || window.cesErroriPronto) return;
  window.cesErroriPronto = true;
  window.addEventListener('error', e => {
    const t = e.target;
    if (t && t !== window && t.tagName) { if (t.tagName === 'SCRIPT' || (t.tagName === 'LINK' && /stylesheet/i.test(t.rel || ''))) registra({}, 'file', { file: t.src || t.href }); return; }
    registra(e.error || { message: e.message }, 'errore', { file: e.filename, riga: e.lineno });
  }, true);
  window.addEventListener('unhandledrejection', e => registra(e.reason, 'promessa'));
  // la chiave si toglie subito: con due finestre aperte (app installata e scheda del browser) non si contano due volte;
  // la rimette salvaSospesi quando la pagina si chiude o si nasconde
  const sospesi = lsGet(SOSPESI, {}); try { localStorage.removeItem(SOSPESI); } catch (e) { }
  Object.entries(sospesi && typeof sospesi === 'object' ? sospesi : {}).slice(0, 50).forEach(([id, r]) => { if (/^er-[0-9a-f]{8}-[a-z0-9]+$/.test(id) && r && typeof r.firma === 'string') coda.set(id, unisci(coda.get(id) || null, r)); });
  const grezzi = lsGet(CODA, []); try { localStorage.removeItem(CODA); } catch (e) { }
  (Array.isArray(grezzi) ? grezzi : []).slice(0, 20).forEach(g => g && registra({ name: g.nome, message: g.msg, stack: g.pila }, g.tipo || 'errore', { file: g.file, riga: g.riga, quando: g.quando, versione: '' }));
  const via = () => { if (document.visibilityState === 'hidden') salvaSospesi(); };
  window.addEventListener('pagehide', salvaSospesi);
  document.addEventListener('visibilitychange', via);
  // una volta dopo l'avvio: scrive quelli in attesa e toglie i vecchi di 90 giorni anche se oggi non ci sono errori
  const dopo = () => (UI.loaded ? scrivi(true) : setTimeout(dopo, 2000));
  setTimeout(dopo, 5000);
}
// Nel browser parte da solo appena il modulo si carica: app.js lo importa per primo, così sente anche gli errori
// degli altri moduli mentre partono. Nelle prove in Node (senza window) no.
if (typeof window !== 'undefined' && typeof document !== 'undefined') avvia();
