// Automazioni che c'erano già, iscritte al Centro automatico (js/automazioni.js) con dei contenitori:
// il loro funzionamento dentro non cambia. Le sessioni nuove aggiungono qui (o in un loro file) le loro registra().
import { S } from './state.js';
import * as store from './store.js';
import { nf, fd, okD } from './util.js';
import { registra, controllaPonte, vai } from './automazioni.js';
import { contiVisibili } from './views/conti.js';
import * as AU from './conti/automatico.js';
import * as MF from './magfatture.js';
import { abbinaFitoSeServe } from './fitoabbina.js';
import { fitoMeta } from './fitodb.js';
import { scaricaRazioni } from './razauto.js';
import * as DZ from './conti/dubbi.js';
import * as TR from './tracciabilita.js';

/* ---------- documenti dell'archivio del PC nei Conti (conti/automatico.js) ---------- */
const PAGHE = /^(Busta-paga|Bilancino-paghe)$/;
registra({
  id: 'conti-archivio', nome: "Documenti dall'archivio del PC", area: 'conti',
  descr: 'Fatture, cedolini, bilancini paghe, estratti conto e bonifici nuovi dell\'archivio: salva da solo quello che è sicuro',
  raccolte: ['fatture', 'econfig', 'paghe', 'pagamenti', 'bilanci'],
  async pronta(ctx) {
    if (!contiVisibili()) return false;
    const AD = await import('./views/archivio-dati.js');
    if (AD.conf().prova) return "Con i dati di prova dell'archivio non si carica niente.";
    if (ctx.auto && !AU.attivo()) return false;   // spento nella pagina Dall'archivio del PC
    if (store.sync.mode === 'cloud' && (!store.sync.farm || store.sync.status !== 'ok' || store.sync.pending)) return ctx.auto ? false : "Prima collega l'azienda e aspetta la fine della sincronizzazione.";
    if (AU.STATO.attivo) return "Sta già leggendo i documenti (pagina Dall'archivio del PC).";
    if ((await controllaPonte(!ctx.auto)) !== 'acceso') return ctx.auto ? false : 'Il ponte del PC è spento: i documenti dell\'archivio si leggono solo dal PC con il ponte acceso.';
    return true;
  },
  async esegui() {
    const s = await AU.esegui();
    if (s.errore) throw new Error(s.errore);
    const e = s.esiti;
    const note = s.tot ? [`${s.fatti} documenti letti: ${e.fatto || 0} sistemati`, e.dubbi ? e.dubbi + ' da controllare' : '', e.nonletto ? e.nonletto + ' non letti' : '', e.errori ? e.errori + ' con errori (si riprova al prossimo giro)' : ''].filter(Boolean).join(', ') : 'nessun documento nuovo';
    return { salvati: e.fatto || 0, note };
  },
  dubbi: () => AU.records().filter(r => r.stato === 'dubbi' || r.stato === 'nonletto').map(r => ({
    id: 'au:' + r.impronta, area: PAGHE.test(r.tipoDoc || '') ? 'personale' : 'conti',
    testo: (r.nome || 'Documento') + (r.data ? ' · ' + (String(r.data).length === 10 ? fd(r.data) : r.data) : ''),
    proposta: r.stato === 'nonletto' ? 'Non letto: ' + (r.msg || 'formato non riconosciuto') : r.msg || 'da controllare',
    scarta: () => AU.segnaStato(r.impronta, 'ignorato'),
    // apre la pagina Dall'archivio del PC e la revisione di quel documento
    apri: () => { vai({ area: 'conti', tab: 'conti', sub: 'automatico' }); setTimeout(() => { const b = document.querySelector(`[data-act="c-auRivedi"][data-imp="${CSS.escape(r.impronta)}"]`); if (b) b.click(); }, 350); },
  })),
  // il documento annullato resta conosciuto ("lasciato fuori"), altrimenti il giro dopo lo ricaricherebbe
  async annullato(riga, tolti) {
    const rows = tolti.filter(t => t.c === 'econfig' && String(t.id).startsWith(AU.PRE)).map(t => { const { id, dubbi, ...d } = t.rec; return { col: 'econfig', id: t.id, data: Object.assign(d, { stato: 'ignorato', msg: 'annullato dal Centro automatico · ' + (d.msg || '') }) }; });
    if (rows.length) await store.bulkPut(rows);
  },
});

/* ---------- magazzino dalle fatture (magfatture.js) ---------- */
const pagMag = { area: 'campagna', tab: 'magazzino', sub: 'fatture' };
registra({
  id: 'mag-fatture', nome: 'Magazzino dalle fatture', area: 'magazzino', soloTitolare: true,
  descr: 'Sementi, concimi, fitofarmaci e gasolio comprati: le righe dei prodotti già abbinati entrano da sole in magazzino',
  raccolte: ['movimenti', 'prodotti', 'econfig'], segui: () => [S.fatture, S.prodotti, MF.stato()],
  propri: (c, id) => (c === 'movimenti' && id.startsWith('mf-')) || (c === 'econfig' && id === MF.ID) || c === 'prodotti',
  async pronta() {
    if (!contiVisibili() || !S.fatture.length) return 'Nessuna fattura caricata.';
    if (MF.occupato()) return 'Stai abbinando una riga a mano: riprova fra poco.';
    await MF.pulisciSeServe();   // sistemazione dei carichi della 1.59.0, fuori dal diario: annullando non tornano i prezzi
    return true;
  },
  async esegui() {
    if (!S.prodotti.some(p => p.paroleFatt)) return { salvati: 0, note: 'nessun prodotto ancora abbinato a una riga di fattura' };
    const n = await MF.caricaPronte();
    return { salvati: n, note: n ? (n === 1 ? 'Caricata in magazzino 1 riga di fattura' : `Caricate in magazzino ${n} righe di fattura`) : 'nessuna riga nuova' };
  },
  dubbi() {
    if (!contiVisibili() || !S.fatture.length) return [];
    return MF.elenco().daFare.map(x => {
      const p = x.proposto; const q = x.q !== null && x.q !== undefined ? x.q : x.qProp;
      const testo = String(x.r.descrizione || 'Riga di fattura').slice(0, 140) + (x.data ? ' · ' + fd(x.data) : '');
      const base = { id: 'mf:' + x.k, area: 'magazzino', testo, scarta: () => MF.togli(x.k, true), apri: pagMag };
      if (p && q > 0) return Object.assign(base, { proposta: `Caricare ${nf(q, 3)} ${p.unita || ''} come «${p.nome}» e riconoscerlo da solo nelle prossime fatture`, conferma: () => MF.abbina(x.k, { pid: p.id, q, ricorda: true }) });
      return Object.assign(base, { proposta: p ? `Forse «${p.nome}», ma la quantità non si capisce: apri e scrivila` : 'Da abbinare a un prodotto del magazzino: apri e scegli' });
    });
  },
  // un carico annullato dal giro non torna: la riga va fra le "non caricare" (si rimette a mano nella pagina Da fatture);
  // annullando una conferma la riga torna fra quelle da fare
  async annullato(riga, tolti) {
    const conferma = riga.motivo === 'conferma';
    for (const t of tolti) if (t.c === 'movimenti' && t.rec.fattRiga) await MF.togli(t.rec.fattRiga, !conferma);
  },
});

/* ---------- fitofarmaci abbinati alla banca dati del Ministero (fitoabbina.js) ---------- */
registra({
  id: 'fito-abbina', nome: 'Fitofarmaci dalla banca dati', area: 'magazzino',
  descr: 'I fitofarmaci e i diserbanti senza numero di registrazione prendono dal nome numero, sostanze e scadenza dell\'autorizzazione',
  raccolte: ['prodotti'], segui: () => [S.prodotti, fitoMeta.n, fitoMeta.versione], propri: c => c === 'prodotti',
  pronta: () => (!fitoMeta.n ? 'La banca dati dei fitosanitari non è ancora caricata su questo dispositivo.' : S.prodotti.length ? true : false),
  async esegui() {
    const n = await abbinaFitoSeServe();
    return { salvati: n, note: n ? (n === 1 ? '1 fitofarmaco abbinato alla banca dati del Ministero' : `${n} fitofarmaci abbinati alla banca dati del Ministero`) : 'niente da abbinare' };
  },
  // il prodotto torna senza numero e non si riabbina più (come quando il numero si toglie a mano)
  async annullato(riga, tolti) {
    const rows = [];
    for (const t of tolti) {
      if (t.c !== 'prodotti' || !t.rec.nRegAuto) continue;
      const cur = S.prodotti.find(p => p.id === t.id); if (!cur) continue;
      const { id, ...d } = cur; rows.push({ col: 'prodotti', id, data: Object.assign(d, { nRegAuto: t.rec.nRegAuto }) });
    }
    if (rows.length) await store.bulkPut(rows);
  },
});

/* ---------- scarico giornaliero delle razioni (razauto.js) ---------- */
registra({
  id: 'razioni', nome: 'Scarico delle razioni', area: 'stalla',
  descr: 'Ogni giorno scarica dal magazzino gli alimenti delle razioni con lo scarico automatico, anche dei giorni in cui l\'app era chiusa',
  raccolte: ['movimenti'],   // l'ultimo giorno fatto della razione (autoFino) resta: uno scarico annullato non torna
  propri: (c, id) => id.startsWith('rz-'),
  segui: ['razioni'],
  pronta: () => (S.razioni.some(r => okD(r.autoDal)) ? true : 'Nessuna razione con lo scarico automatico.'),
  async esegui() {
    const n = await scaricaRazioni();
    return { salvati: n, note: n ? `Razioni: ${n} scarichi registrati in magazzino` : 'niente da scaricare' };
  },
});

/* ---------- controlli di paghe, pagamenti e fatture (conti/dubbi.js, 1.63.0) ---------- */
// Non salvano niente da sole: raccolgono i dubbi (doppioni incerti, cedolini in attesa, mesi ambigui,
// note di credito, fatture che non tornano) con la proposta pronta. Conferma e alternative scrivono, e vanno nel diario.
registra({
  id: 'paghe-controlli', nome: 'Controlli di paghe e pagamenti', area: 'personale', soloTitolare: true,
  descr: 'Pagamenti forse doppi, cedolini arrivati di nuovo, stipendi con il mese incerto: li mette da controllare con la proposta pronta',
  raccolte: ['pagamenti', 'paghe', 'econfig'],
  pronta: () => (contiVisibili() && (S.paghe.length || S.pagamenti.length) ? true : false),
  async esegui() { const n = DZ.dubbiPaghe().length; return { salvati: 0, note: n ? n + ' da controllare' : 'tutto a posto' }; },
  dubbi: () => (contiVisibili() ? DZ.dubbiPaghe() : []),
});
registra({
  id: 'fatture-controlli', nome: 'Controlli delle fatture', area: 'conti', soloTitolare: true,
  descr: 'Note di credito con il segno sbagliato, totali che non tornano, pagamenti forse doppi: li mette da controllare',
  raccolte: ['fatture', 'pagamenti', 'econfig'],
  pronta: () => (contiVisibili() && S.fatture.length ? true : false),
  async esegui() { const n = DZ.dubbiFatture().length; return { salvati: 0, note: n ? n + ' da controllare' : 'tutto a posto' }; },
  dubbi: () => (contiVisibili() ? DZ.dubbiFatture() : []),
});

/* ---------- registro degli alimenti autoprodotti dalla campagna (tracciabilita.js, 1.64.0) ---------- */
// Raccolte, sfalci e pesate dell'anno in corso e di quello prima, tolto il venduto: aggiorna le righe che non sono state
// corrette a mano. Le righe tolte a mano non tornano (anche dopo Annulla).
registra({
  id: 'tracciabilita-autoprodotti', nome: 'Registro degli autoprodotti', area: 'campagna',
  descr: 'Mette nel registro della tracciabilità i raccolti rimasti in azienda (raccolte, sfalci e pesate, tolto il venduto)',
  raccolte: ['tracciabilita'],
  propri: (c, id) => c === 'tracciabilita' && id === TR.ID_AUTO,
  segui: ['operazioni', 'carichi', 'campi', 'silos'],
  pronta: () => (S.operazioni.some(o => ['Raccolta', 'Sfalcio'].includes(o.tipo)) || (S.carichi || []).length || TR.autoprodottiTutti().some(r => r.origine) ? true : 'Nessuna raccolta registrata.'),
  async esegui() {
    const r = await TR.aggiornaDaCampagna();
    const parti = [r.nuove && r.nuove + ' nuove', r.cambiate && r.cambiate + ' aggiornate', r.tolte && r.tolte + ' tolte'].filter(Boolean);
    return { salvati: r.n, note: parti.length ? 'Autoprodotti: righe ' + parti.join(', ') : 'niente da cambiare' };
  },
  async annullato(riga, tolti) { await TR.dopoAnnulla(tolti); },
});
