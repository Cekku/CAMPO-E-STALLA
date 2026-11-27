// Controllo automatico dei tipi di dato dei Conti e dei lettori dei documenti (27/11/2026, piano 10/10 passo 7).
// TypeScript legge i file .js così come sono (checkJs, senza build e senza creare file) e trova per esempio:
// nomi scritti male (variabile o funzione che non esiste), import di una funzione che il modulo non esporta,
// chiamate con troppi argomenti, proprietà che un oggetto non ha, tipi sbagliati nelle operazioni.
// I file vecchi non hanno tipi scritti e TypeScript dà ~100 avvisi che non sono errori (guardati uno per uno il
// 27/11/2026: tipi indovinati male da variabili riempite dopo, parametri con un valore di partenza `() => {}`):
// sono nell'elenco `tipi/conosciuti.json` (file + codice + messaggio, senza il numero di riga) e la prova
// fallisce solo per un avviso NUOVO, o per uno dei conosciuti che compare più volte di prima.
// Cosa si controlla: tipi/tsconfig.json (js/conti/*.js e js/views/conti*.js; degli altri file importati si
// guardano solo i nomi esportati, non gli avvisi). TypeScript è in devDependencies: `npm ci` lo mette in
// node_modules. Senza (PC senza npm ci) la prova lo dice e passa; su GitHub gira sempre (pubblica.yml fa npm ci).
// Rifare l'elenco dopo aver tolto avvisi o dopo un falso allarme controllato: node prove/tipi.test.mjs --aggiorna
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const QUI = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(QUI, '..');
const ELENCO = path.join(QUI, 'tipi', 'conosciuti.json');
const DENTRO = /^js\/(conti\/[^/]+|views\/conti[^/]*)\.js$/;   // file di cui si contano gli avvisi

let ts;
try { ts = createRequire(path.join(ROOT, 'package.json'))('typescript'); }
catch (e) {
  console.log('tipi: TypeScript non installato (npm ci): controllo dei tipi saltato su questo PC, gira su GitHub');
  process.exit(process.env.CI ? 1 : 0);   // su GitHub deve esserci: se manca è un errore
}

const cfgFile = path.join(QUI, 'tipi', 'tsconfig.json');
const letto = ts.readConfigFile(cfgFile, ts.sys.readFile);
const cfg = ts.parseJsonConfigFileContent(letto.config, ts.sys, path.dirname(cfgFile));
const errCfg = [letto.error, ...(cfg.errors || [])].filter(Boolean);
if (errCfg.length) { console.log('tipi: tsconfig.json sbagliato:', errCfg.map(d => ts.flattenDiagnosticMessageText(d.messageText, ' ')).join('; ')); process.exit(1); }
if (!cfg.fileNames.some(f => /js[\/]conti[\/]fatture-parse\.js$/.test(f))) { console.log('tipi: elenco dei file vuoto o sbagliato', cfg.fileNames.length); process.exit(1); }
const prog = ts.createProgram(cfg.fileNames, cfg.options);
const diag = ts.getPreEmitDiagnostics(prog);

// chiave di un avviso: file, codice, messaggio (prima riga, senza numeri di riga)
const conta = {};
const dove = {};
let fuori = 0;
for (const d of diag) {
  if (!d.file) { console.log('tipi: avviso generale', ts.flattenDiagnosticMessageText(d.messageText, '\n')); process.exit(1); }
  const rel = path.relative(ROOT, d.file.fileName).split(path.sep).join('/');
  if (!DENTRO.test(rel)) { fuori++; continue; }
  const msg = ts.flattenDiagnosticMessageText(d.messageText, '\n').split('\n')[0];
  const k = `${rel} TS${d.code} ${msg}`;
  conta[k] = (conta[k] || 0) + 1;
  const { line } = d.file.getLineAndCharacterOfPosition(d.start || 0);
  (dove[k] = dove[k] || []).push(line + 1);
}
const ordinato = o => Object.fromEntries(Object.keys(o).sort().map(k => [k, o[k]]));

if (process.argv.includes('--aggiorna')) {
  writeFileSync(ELENCO, JSON.stringify(ordinato(conta), null, 1) + '\n');
  console.log(`tipi: elenco rifatto, ${Object.values(conta).reduce((a, b) => a + b, 0)} avvisi conosciuti in ${Object.keys(conta).length} gruppi`);
  process.exit(0);
}

const vecchi = existsSync(ELENCO) ? JSON.parse(readFileSync(ELENCO, 'utf8')) : {};
let nuovi = 0, tolti = 0;
for (const [k, n] of Object.entries(conta)) {
  const prima = vecchi[k] || 0;
  if (n > prima) { nuovi += n - prima; console.log(`  NO   avviso nuovo (${n} invece di ${prima}), righe ${dove[k].join(', ')}: ${k}`); }
}
for (const [k, n] of Object.entries(vecchi)) if ((conta[k] || 0) < n) tolti += n - (conta[k] || 0);
const tot = Object.values(conta).reduce((a, b) => a + b, 0);
console.log(`tipi: ${cfg.fileNames.length} file letti, ${tot} avvisi nei Conti (${nuovi} nuovi), ${fuori} negli altri file non contati`);
if (tolti) console.log(`tipi: ${tolti} avvisi conosciuti non ci sono più: si può rifare l'elenco con  node prove/tipi.test.mjs --aggiorna`);
if (nuovi) console.log('tipi: correggere il codice; se è un falso allarme controllato, rifare l\'elenco (--aggiorna) e dirlo nel commit');
process.exit(nuovi ? 1 : 0);
