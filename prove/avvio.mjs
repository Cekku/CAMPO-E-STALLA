// Avvio delle prove in Node: un localStorage finto e js/store.js sostituito da un archivio finto in memoria
// (prove/finti/store.mjs), perché quello vero apre IndexedDB e Supabase. Va importato per primo nei file di prova,
// prima degli import dinamici dei moduli dell'app.
import * as modulo from 'node:module';
import { load } from './hooks.mjs';

globalThis.localStorage = {
  _d: {},
  getItem(k) { return Object.prototype.hasOwnProperty.call(this._d, k) ? this._d[k] : null; },
  setItem(k, v) { this._d[k] = String(v); },
  removeItem(k) { delete this._d[k]; },
  clear() { this._d = {}; },
};
if (modulo.registerHooks) modulo.registerHooks({ load });   // Node ≥ 22.15: nello stesso processo, senza avvisi
else modulo.register('./hooks.mjs', import.meta.url);        // Node più vecchi

// Orologio fermo: il codice confronta scadenze e anni con la data di oggi (today() in util.js, inCorso() delle paghe…),
// quindi senza questo le prove con date scritte cambierebbero risultato col passare del tempo (dal 2027 quelle delle
// paghe fallivano). Oggi, per le prove, è sempre il 25/11/2026 a mezzogiorno UTC; per provarne un altro: PROVE_OGGI=AAAA-MM-GG.
const ORA = Date.parse((process.env.PROVE_OGGI || '2026-11-25') + 'T12:00:00Z');
const DataVera = Date;
class DataFerma extends DataVera {
  constructor(...a) { if (a.length) super(...a); else super(ORA); }
  static now() { return ORA; }
}
globalThis.Date = DataFerma;
