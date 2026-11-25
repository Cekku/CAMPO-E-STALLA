// Aiuto comune dei file di prova: t(nome, condizione, info) conta i controlli e stampa quelli che non passano
// (tutti con PROVE_TUTTE=1); fine(nome) scrive il riassunto ed esce con 1 se qualcosa non è passato, così
// `node --test` (npm test) segna il file come fallito.
let ok = 0, ko = 0;
const tutte = process.env.PROVE_TUTTE === '1';

export function t(nome, cond, info = '') {
  if (cond) { ok++; if (tutte) console.log('  ok  ', nome); return true; }
  ko++; console.log('  NO  ', nome, typeof info === 'string' ? info : JSON.stringify(info));
  return false;
}
export const sezione = titolo => { if (tutte) console.log(titolo); };
export const uguale = (a, b, tolleranza = 0.005) => Math.abs(a - b) <= tolleranza;
export function fine(nome) {
  console.log(`${nome}: ${ok} prove passate, ${ko} non passate`);
  process.exit(ko ? 1 : 0);
}
