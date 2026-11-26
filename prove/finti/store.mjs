// Archivio finto al posto di js/store.js: scrive solo in S (js/state.js), in memoria, e tiene l'elenco delle scritture.
import { S } from '../../js/state.js';

// Come quello vero (js/store.js put/bulkPut): senza id ne crea uno nuovo, e l'id passato vince su quello dentro i dati.
export const scritti = [];
let n = 0;
const metti = (col, id, data) => {
  const a = (S[col] || []).filter(x => x.id !== id);
  if (data) a.push(Object.assign({}, data, { id }));
  S[col] = a;
};
export async function put(col, id, data) { const nid = id || 'finto-' + (++n); scritti.push(['put', col, nid]); metti(col, nid, data); return nid; }
export async function remove(col, id) { scritti.push(['remove', col, id]); metti(col, id, null); }
export async function bulkPut(rows) { for (const r of rows) { scritti.push(['put', r.col, r.id]); metti(r.col, r.id, r.data); } }
export const sync = { mode: 'local', farm: null, user: null, members: [] };
export const onSync = () => { };
export const cloudConfig = () => null;
export const puoAllegati = () => !sync.farm;   // come quello vero: senza azienda collegata gli allegati si vedono
export const schemaVersion = () => 0;
