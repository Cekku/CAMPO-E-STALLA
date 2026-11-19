// Scarico automatico delle razioni dal magazzino e avviso "sta per finire" (1.60.0).
// Ogni razione con "Scarico automatico dal" scarica ogni giorno i kg per capo × i capi (quelli della razione o del gruppo).
// Un movimento al giorno per alimento, con id fisso rz-<razione>-<prodotto>-<data>: due dispositivi non fanno doppioni.
// Recupera i giorni in cui l'app è rimasta chiusa; la razione ricorda l'ultimo giorno fatto (autoFino),
// così uno scarico cancellato a mano non torna. Un giorno già scaricato (anche a mano) non si scarica due volte.
import { S, UI, get } from './state.js';
import { N, nf, today, addDays, diff, okD } from './util.js';
import { giac, kgUnita, razioneInfo, extraAlerts } from './domain.js';
import * as store from './store.js';

const MAX_GIORNI = 31; // recupero massimo: una data scritta per sbaglio molto indietro non svuota il magazzino
export const SOGLIA_GIORNI = 7;

/** Scarichi da fare per una razione, fino a oggi. Restituisce { rows, fino }. */
export function daScaricare(r, T = today()) {
  if (!okD(r.autoDal) || r.autoDal > T) return { rows: [], fino: null };
  let d = okD(r.autoFino) && r.autoFino >= r.autoDal ? addDays(r.autoFino, 1) : r.autoDal;
  if (diff(d, T) >= MAX_GIORNI) d = addDays(T, -(MAX_GIORNI - 1));
  if (d > T) return { rows: [], fino: null };
  const i = razioneInfo(r); const rows = [];
  for (; d <= T; d = addDays(d, 1)) {
    for (const x of i.ing) {
      if (!x.p || !(x.kgTot > 0)) continue;
      if (S.movimenti.some(m => m.razioneId === r.id && m.prodottoId === x.p.id && m.data === d)) continue;
      rows.push({ col: 'movimenti', id: 'rz-' + r.id + '-' + x.p.id + '-' + d, data: { data: d, prodottoId: x.p.id, tipo: 'Scarico', quantita: Math.round(x.kgTot / kgUnita(x.p) * 1000) / 1000, note: 'Razione ' + r.nome + ' (automatico, ' + i.capi + ' capi)', razioneId: r.id, auto: true } });
    }
  }
  return { rows, fino: T };
}

let inCorso = false;
/** Registra gli scarichi mancanti di tutte le razioni automatiche. Restituisce il numero di movimenti scritti. */
export async function scaricaRazioni() {
  if (inCorso || store.soloLettura()) return 0;
  inCorso = true;
  try {
    const T = today(); let n = 0;
    for (const r of [...S.razioni]) {
      const { rows, fino } = daScaricare(r, T); if (!fino) continue;
      if (rows.length) { await store.bulkPut(rows); n += rows.length; }
      const cur = get('razioni', r.id); if (cur && cur.autoFino !== fino) await store.put('razioni', r.id, Object.assign({}, cur, { autoFino: fino }));
    }
    return n;
  } finally { inCorso = false; }
}

/** All'avvio, quando i dati sono pronti (e scaricati dal cloud), poi una volta all'ora per il cambio di giorno. */
export function avviaScaricoRazioni(avvisa) {
  let n = 0;
  // senza azienda condivisa basta il caricamento; con l'azienda si aspetta la fine della sincronizzazione
  const pronto = () => UI.loaded && (!store.sync.farm || (store.sync.status === 'ok' && !store.sync.pending));
  const prova = async () => {
    if (!pronto()) { if (++n <= 30) setTimeout(prova, 10000); return; }
    try { const k = await scaricaRazioni(); if (k && avvisa) avvisa(k); } catch (e) { console.warn('scarico delle razioni', e); if (++n <= 30) setTimeout(prova, 10000); }
  };
  setTimeout(prova, 3000);
  setInterval(() => { n = 0; prova(); }, 3600e3);
}

/** Consumo dalle razioni e giorni che restano per un prodotto. cons in unità del prodotto al giorno. */
export function previsione(p) {
  if (!p) return null; const u = kgUnita(p);
  let kg = 0; const raz = [];
  S.razioni.forEach(r => { const x = razioneInfo(r).ing.find(g => g.p && g.p.id === p.id); if (x && x.kgTot > 0) { kg += x.kgTot; raz.push(r); } });
  if (!(kg > 0)) return null;
  const cons = kg / u, g = giac(p);
  const giorni = g > 0 ? g / cons : 0;
  const min = N(p.scortaMin) > 0 ? N(p.scortaMin) : 0;
  const giorniMin = min && g > min ? (g - min) / cons : min ? 0 : null;
  return { cons, kgGiorno: kg, giorni, giorniMin, raz, auto: raz.some(r => okD(r.autoDal)) };
}

// Avviso nella dashboard: finisce entro 7 giorni, o arriva alla scorta minima entro 7 giorni.
// I prodotti dei silos hanno già il loro avviso ("Silo in esaurimento"); sotto scorta e giacenza negativa li avvisa domain.js.
extraAlerts.push(() => {
  const silo = new Set(S.silos.map(s => s.prodottoId).filter(Boolean)); const out = [];
  S.prodotti.forEach(p => {
    if (silo.has(p.id) || p.categoria === 'Effluente') return;
    const v = previsione(p); if (!v) return; const g = giac(p); if (g <= 0) return;
    const u = p.unita || '', al = ' (' + nf(v.cons, v.cons < 10 ? 2 : 0) + ' ' + u + ' al giorno con le razioni)';
    if (v.giorni < SOGLIA_GIORNI) out.push({ lv: v.giorni < 3 ? 'bad' : 'warn', area: 'magazzino', t: 'Sta per finire: ' + p.nome, s: 'Basta per circa ' + giorniTxt(v.giorni) + al, go: { type: 'prodotto', id: p.id } });
    else if (v.giorniMin !== null && N(p.scortaMin) < g && v.giorniMin < SOGLIA_GIORNI) out.push({ lv: 'warn', area: 'magazzino', t: 'Scorta minima vicina: ' + p.nome, s: 'Ci arriva fra circa ' + giorniTxt(v.giorniMin) + al, go: { type: 'prodotto', id: p.id } });
  });
  return out;
});

export const giorniTxt = x => { const n = Math.floor(x); return n < 1 ? 'meno di un giorno' : n === 1 ? '1 giorno' : n + ' giorni'; };
