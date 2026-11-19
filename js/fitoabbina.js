// Abbinamento automatico dei fitofarmaci del magazzino alla banca dati del Ministero (1.62.0, chiesto da Marco:
// "deve farlo in automatico il programma"). Un fitofarmaco o diserbante senza numero di registrazione prende dal nome
// il numero (e sostanze, ditta, scadenza dell'autorizzazione se mancano): così la scheda mostra l'etichetta.
// Segna nRegAuto = numero abbinato (la scheda lo dice finché il numero è quello). Se poi il numero viene tolto a mano, il prodotto non si riabbina più.
import { S, UI } from './state.js';
import * as store from './store.js';
import { FITO } from './checks.js';
import { fitoMeta, fitoAbbina } from './fitodb.js';

let firma = '', inCorso = false, attesa = null;
// dati non ancora pronti: si riprova fra poco (un solo tentativo in attesa), senza aspettare il prossimo disegno
const riprova = () => { if (!attesa) attesa = setTimeout(() => { attesa = null; abbinaFitoSeServe(); }, 5000); return 0; };
export async function abbinaFitoSeServe() {
  if (inCorso || !fitoMeta.n || store.soloLettura()) return 0;
  if (!UI.loaded || (store.sync.farm && (store.sync.status !== 'ok' || store.sync.pending))) return riprova(); // prima i dati dell'azienda
  const da = S.prodotti.filter(p => FITO.includes(p.categoria) && !String(p.nReg || '').trim() && !p.nRegAuto);
  const f = fitoMeta.versione + '|' + fitoMeta.n + '|' + da.map(p => p.id + ':' + p.nome).join(',');
  if (f === firma) return 0;
  firma = f; if (!da.length) return 0;
  inCorso = true;
  try {
    const rows = [];
    for (const p of da) {
      const x = fitoAbbina(p.nome); if (!x) continue;
      const d = Object.assign({}, p, { nReg: x.nReg, nRegAuto: x.nReg });
      if (!d.sostanze && x.sostanze) d.sostanze = x.sostanze;
      if (!d.impresa && x.impresa) d.impresa = x.impresa;
      if (!d.scadenzaAut && x.scadenza) d.scadenzaAut = x.scadenza;
      delete d.id; rows.push({ col: 'prodotti', id: p.id, data: d });
    }
    if (rows.length) await store.bulkPut(rows);
    return rows.length;
  } catch (e) { console.warn('abbinamento dei fitofarmaci', e); firma = ''; return 0; } finally { inCorso = false; }
}
