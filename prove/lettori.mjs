// Aiuto comune delle prove dei lettori: mette pdf.js (vendor/pdfjs, build legacy 4.10.38) dentro js/conti/pdftext.js
// con setPdfLib e il DOMParser minimo (finti/dom.mjs) dentro fatture-parse.js con setDomParser, poi legge i documenti
// FINTI di prove/documenti/ (creati da prove/documenti/genera.mjs). Va importato dopo avvio.mjs.
import { readFileSync } from 'node:fs';
import { DOMParser } from './finti/dom.mjs';

const BASE = new URL('../', import.meta.url);
// al caricamento pdf.js avvisa che in Node manca @napi-rs/canvas (serve solo per disegnare le pagine, non per il testo)
const log = console.log, warn = console.warn;
const zitto = (...a) => { if (!/^Warning: Cannot (load|polyfill)/.test(String(a[0]))) log(...a); };
console.log = console.warn = zitto;
const pdfjs = await import(new URL('vendor/pdfjs/pdf.min.mjs', BASE).href);
console.log = log; console.warn = warn;
pdfjs.GlobalWorkerOptions.workerSrc = new URL('vendor/pdfjs/pdf.worker.min.mjs', BASE).href;

/** Modulo dell'app (percorso dentro js/). */
export const modulo = p => import(new URL('js/' + p, BASE).href);
(await modulo('conti/pdftext.js')).setPdfLib(pdfjs);
(await modulo('conti/fatture-parse.js')).setDomParser(DOMParser);

/** Byte di un documento finto di prove/documenti/. */
export const documento = nome => new Uint8Array(readFileSync(new URL('prove/documenti/' + nome, BASE)));
