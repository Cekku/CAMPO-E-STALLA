// Automazioni del Centro per il personale e le scadenze (1.66.0): il lavoro vero è in js/conti/personale-auto.js.
// Tutte riservate al titolare. Leggono i documenti nuovi dell'archivio del PC solo con il ponte acceso e i dati
// sincronizzati; confronti, collegamenti e dubbi si rifanno anche senza ponte, con quello che è già stato letto.
import { S } from './state.js';
import * as store from './store.js';
import { registra, controllaPonte } from './automazioni.js';
import { contiVisibili } from './views/conti.js';
import * as PA from './conti/personale-auto.js';
import { movimentiBanca } from './conti/centri.js';

/** Si possono leggere i documenti dell'archivio? (null = sì, altrimenti il motivo) */
async function archivioPronto(ctx) {
  const AD = await import('./views/archivio-dati.js');
  if (AD.conf().prova) return "con i dati di prova dell'archivio non si legge niente";
  if (store.sync.mode === 'cloud' && (!store.sync.farm || store.sync.status !== 'ok' || store.sync.pending)) return "prima collega l'azienda e aspetta la fine della sincronizzazione";
  if ((await controllaPonte(!ctx.auto)) !== 'acceso') return 'ponte del PC spento: niente documenti nuovi';
  return null;
}
const conta = (n, uno, tanti) => (n === 1 ? uno : n + ' ' + tanti);
const propriP = re => (col, id) => col === 'paghe' && re.test(String(id));

registra({
  id: 'f24-contributi', nome: 'F24 e contributi dai documenti', area: 'personale', soloTitolare: true,
  descr: "Legge gli avvisi di addebito del consulente e i modelli F24, li confronta con quello che risulta dai bilancini e li collega al movimento della banca",
  raccolte: ['paghe', 'pagamenti'],
  propri: (col, id) => propriP(/^vq-/)(col, id) || (col === 'pagamenti' && (String(id).startsWith('pq-') || PA.IN_SCRITTURA.has(id))),
  segui: () => [S.pagamenti.filter(p => ['f24', 'contributi'].includes(p.tipo)).length, S.paghe.filter(x => x.tipo === 'bilancino').length],
  pronta: () => (contiVisibili() && S.paghe.some(x => x.tipo === 'bilancino' || x.tipo === 'cedolino') ? true : false),
  async esegui(ctx) {
    const no = await archivioPronto(ctx); const nuovi = no ? 0 : await PA.leggiVersamenti();
    const legati = await PA.collegaVersamenti();
    const tutti = PA.analisiVersamenti(); const ok = tutti.filter(a => a.mov.stato === 'collegato').length;
    return { salvati: nuovi + legati, note: [nuovi ? conta(nuovi, '1 documento letto', 'documenti letti') : no || 'nessun documento nuovo', legati ? conta(legati, '1 versamento collegato alla banca', 'versamenti collegati alla banca') : '', ok ? ok + ' confermati in tutto' : ''].filter(Boolean).join(', ') };
  },
  dubbi: () => (contiVisibili() ? PA.dubbiVersamenti() : []),
});

registra({
  id: 'dipendenti-schede', nome: 'Schede dei dipendenti dai documenti', area: 'personale', soloTitolare: true,
  descr: 'Legge UNILAV, contratti, permessi di soggiorno e CU e completa la scheda di ogni dipendente; se due documenti non coincidono te lo chiede',
  raccolte: ['paghe'],
  propri: propriP(/^(pd|ps)-/),
  segui: () => [S.paghe.filter(x => x.tipo === 'cedolino').length],
  pronta: () => (contiVisibili() && S.paghe.some(x => x.tipo === 'cedolino') ? true : false),
  async esegui(ctx) {
    const no = await archivioPronto(ctx); const nuovi = no ? 0 : await PA.leggiPersonale();
    const n = PA.dubbiSchede().length;
    return { salvati: nuovi, note: [nuovi ? conta(nuovi, '1 documento letto', 'documenti letti') : no || 'nessun documento nuovo', n ? n + ' da controllare' : ''].filter(Boolean).join(', ') };
  },
  dubbi: () => (contiVisibili() ? PA.dubbiSchede() : []),
});

registra({
  id: 'scadenze', nome: 'Scadenziario', area: 'conti', soloTitolare: true,
  descr: 'Contratti e permessi in scadenza, F24 del 16, contributi, rate dei mutui riconosciute dalla banca e polizze: tutto nell\'agenda',
  raccolte: ['econfig'],
  propri: (col, id) => col === 'econfig' && /^(po|sm)-/.test(String(id)),
  segui: () => [movimentiBanca().length],
  pronta: () => (contiVisibili() ? true : false),
  async esegui(ctx) {
    const no = await archivioPronto(ctx); const nuove = no ? 0 : await PA.leggiPolizze();
    const s = PA.scadenze().length; const p = PA.dubbiRate().length;
    return { salvati: nuove, note: [nuove ? conta(nuove, '1 polizza letta', 'polizze lette') : no || 'nessuna polizza nuova', s ? s + ' scadenze nei prossimi 4 mesi' : 'nessuna scadenza nei prossimi 4 mesi', p ? conta(p, '1 piano di rate da confermare', 'piani di rate da confermare') : ''].filter(Boolean).join(', ') };
  },
  dubbi: () => (contiVisibili() ? [...PA.dubbiRate(), ...PA.dubbiPolizze()] : []),
});
