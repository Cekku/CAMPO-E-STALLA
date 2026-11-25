// Controllo dei documenti FINTI di prove/documenti/: i file nel repository devono essere uguali a quelli che crea
// genera.mjs (chi cambia il programma e dimentica di rifarli se ne accorge qui: `node prove/documenti/genera.mjs`),
// e dentro ci devono essere solo le partite IVA e gli IBAN inventati delle prove (il repository è pubblico).
// Uso: npm test   oppure   node --import ./prove/avvio.mjs prove/lettori-documenti.test.mjs
import './avvio.mjs';
import { readdirSync, readFileSync } from 'node:fs';
import { t, fine } from './aiuto.mjs';
import { documenti } from './documenti/genera.mjs';
import { DOMParser } from './finti/dom.mjs';

const CARTELLA = new URL('./documenti/', import.meta.url);
const creati = documenti();
const uguali = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
for (const [nome, b] of Object.entries(creati)) {
  let su; try { su = new Uint8Array(readFileSync(new URL(nome, CARTELLA))); } catch { su = null; }
  t(`${nome} uguale a quello di genera.mjs`, su && uguali(su, b), su ? `${su.length} byte invece di ${b.length}: rifare con node prove/documenti/genera.mjs` : 'manca il file');
}
const inPiu = readdirSync(CARTELLA).filter(n => !n.endsWith('.mjs') && !(n in creati));
t('nessun altro documento nella cartella (solo quelli finti di genera.mjs)', !inPiu.length, inPiu);

// solo numeri inventati: partite IVA, codici fiscali e IBAN ammessi nelle prove (i codici fiscali, tranne l'esempio
// classico RSSMRA80A01H501U, e le partite IVA hanno il carattere di controllo sbagliato: non sono di nessuno)
const PIVA = new Set(['01234567890', '09876543210', '02345678901', '03456789012', '04567890123', '05678901234', '06789012345']);
const IBAN = new Set(['IT60X0542811101000000123456', 'IT60X0542811101000000654321', 'IT60X0542811101000000999999']);
const CF = new Set(['RSSMRA80A01H501U', 'VRDLGU90B15L483Z', 'BNCNNA85C41L483Q', 'NREPLA75A01L483X', 'BNCLCU95E10L483K']);
for (const [nome, b] of Object.entries(creati)) {
  if (nome.includes('base64')) continue; // è lo stesso contenuto di fattura.xml.p7m
  const s = Buffer.from(b).toString('latin1');
  const piva = [...new Set(s.match(/(?<![\dA-Z])\d{11}(?!\d)/g) || [])].filter(x => !PIVA.has(x));
  const iban = [...new Set(s.match(/IT\d\d[A-Z]\d{22}/g) || [])].filter(x => !IBAN.has(x));
  const cf = [...new Set(s.match(/[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]/g) || [])].filter(x => !CF.has(x));
  t(`${nome}: solo partite IVA, codici fiscali e IBAN delle prove`, !piva.length && !iban.length && !cf.length, [piva, iban, cf]);
}

// il DOMParser finto delle prove: quello che serve al lettore delle fatture
const doc = new DOMParser().parseFromString('<?xml version="1.0"?><p:R xmlns:p="x"><A t="1">a &amp; b<![CDATA[ <c> ]]></A><B/></p:R>');
t('DOMParser finto: prefisso, figli, testo con entità e CDATA', doc.documentElement.localName === 'R' && doc.documentElement.nodeName === 'p:R' && doc.getElementsByTagName('*').length === 3 && doc.getElementsByTagName('A')[0].textContent === 'a & b <c> ');
t('DOMParser finto: XML rotto → parsererror', new DOMParser().parseFromString('<A><B></A>').documentElement.nodeName === 'parsererror');

fine('lettori-documenti');
