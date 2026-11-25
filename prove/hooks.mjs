// Gancio di caricamento dei moduli (registrato da avvio.mjs). In Node non ci sono la pagina né IndexedDB:
// - js/store.js  → prove/finti/store.mjs (archivio in memoria su S) più funzioni vuote per gli altri nomi esportati;
// - js/ui.js, js/nativo.js → funzioni vuote con gli stessi nomi (al caricamento usano document e window).
// I nomi si leggono dal file vero, così un'esportazione nuova non rompe le prove.
// Funzione sincrona: va bene sia per module.registerHooks (Node ≥ 22.15) sia per il vecchio module.register.
import { readFileSync } from 'node:fs';

const FINTO_STORE = new URL('./finti/store.mjs', import.meta.url).href;
const VUOTI = ['/js/store.js', '/js/ui.js', '/js/nativo.js'];

function nomiEsportati(src) {
  const n = new Set();
  for (const m of src.matchAll(/^\s*export\s+(?:async\s+)?(?:function\*?|const|let|var|class)\s+([A-Za-z_$][\w$]*)/gm)) n.add(m[1]);
  for (const m of src.matchAll(/^\s*export\s*\{([^}]*)\}/gm))
    for (const p of m[1].split(',')) { const x = p.trim().split(/\s+as\s+/).pop(); if (x) n.add(x); }
  for (const m of src.matchAll(/^\s*export\s+(?:const|let|var)\s+\{([^}]*)\}/gm))
    for (const p of m[1].split(',')) { const x = p.trim().split(/\s*:\s*/).pop(); if (x) n.add(x); }
  return n;
}

export function load(url, ctx, next) {
  const quale = VUOTI.find(v => url.endsWith(v));
  if (!quale) return next(url, ctx);
  const nomi = nomiEsportati(readFileSync(new URL(url), 'utf8'));
  let src = '';
  if (quale === '/js/store.js') {
    for (const x of nomiEsportati(readFileSync(new URL(FINTO_STORE), 'utf8'))) nomi.delete(x);
    src += `export * from ${JSON.stringify(FINTO_STORE)};\n`;
  }
  for (const x of nomi) src += `export const ${x} = () => undefined;\n`;
  return { format: 'module', source: src, shortCircuit: true };
}
