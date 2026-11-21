// Automazioni di stalla e mezzi nel Centro automatico (js/automazioni.js):
//  - sialleva-report: report Si@lleva / AIA in PDF dall'archivio del PC (area 11.2), importati con pianoImport;
//    capi nuovi, conflitti con i dati scritti a mano e vacche forse uscite vanno fra i dubbi;
//  - gasolio-mezzi: scarico del gasolio dei lavori con le ore, dal consumo l/h imparato dai rifornimenti o scritto nel libretto.
import { S } from './state.js';
import * as store from './store.js';
import { fd, nf, uid, today, plural } from './util.js';
import { registra, controllaPonte } from './automazioni.js';
import { capoI } from './domain.js';
import { contiVisibili } from './views/conti.js';
import * as SA from './siallevauto.js';
import * as G from './gasolio.js';

const senzaId = r => { const { id, ...d } = r || {}; return d; };
const cfgDi = id => S.config.find(c => c.id === id) || null;
const nomeCapo = c => (c ? c.nome || (c.numero ? 'n. ' + c.numero : '') || c.matricola || 'capo' : 'capo');
// apre una scheda dell'app come un tocco (data-act open/edit), senza dipendere da app.js
const premi = dati => () => {
  if (typeof document === 'undefined') return;
  const b = document.createElement('button'); b.hidden = true; Object.assign(b.dataset, dati);
  document.body.appendChild(b); b.click(); b.remove();
};
const apriCapo = id => premi({ act: 'open', type: 'capo', id });
const apriMezzo = id => premi({ act: 'open', type: 'mezzo', id });
const dataTxt = d => (d && String(d).length === 10 ? fd(d) : d || '');

/* ---------------- Si@lleva / AIA dall'archivio del PC ---------------- */
const cfgA = () => Object.assign({ fatti: {} }, senzaId(cfgDi(SA.ID)));
// Ogni dubbio e ogni scelta "Tieni i miei" in un record suo (config aia-s-… e aia-t-<capo>): così annullare una conferma
// rimette proprio quel record, anche se nel frattempo se ne sono confermati altri (un record unico sarebbe già cambiato).
const PRE_S = 'aia-s-', PRE_T = 'aia-t-';
const recS = s => PRE_S + String(s.id).replace(/[^A-Za-z0-9-]/g, '-');
const sospesiSalvati = () => S.config.filter(c => String(c.id).startsWith(PRE_S) && c.s).map(c => c.s);
function tenutiSalvati() {
  const t = { ev: {}, num: {} };
  for (const c of S.config) if (String(c.id).startsWith(PRE_T)) { Object.assign(t.ev, c.ev || {}); if (c.num) t.num[c.capoId] = c.num; }
  return t;
}
const RACC = ['sintetico', 'prestampato', 'parametri'];

async function pronto(ctx) {
  if (!contiVisibili()) return false;   // l'archivio del PC è del titolare
  const AD = await import('./views/archivio-dati.js');
  if (AD.conf().prova) return "Con i dati di prova dell'archivio non si legge niente.";
  if (store.sync.mode === 'cloud' && (!store.sync.farm || store.sync.status !== 'ok' || store.sync.pending)) return ctx.auto ? false : "Prima collega l'azienda e aspetta la fine della sincronizzazione.";
  if ((await controllaPonte(!ctx.auto)) !== 'acceso') return ctx.auto ? false : "Il ponte del PC è spento: i report di Si@lleva si leggono solo dal PC con il ponte acceso.";
  return true;
}

registra({
  id: 'sialleva-report', nome: 'Report Si@lleva (AIA)', area: 'stalla',
  descr: "I report in PDF salvati da Si@lleva (Sintetico individuale, Scheda di riepilogo, Parametri zootecnici) arrivati nell'archivio del PC: aggiorna vacche, parti, asciutte e controlli",
  raccolte: ['capi', 'eventi', 'config'],
  propri: (c, id) => (c === 'eventi' && String(id).startsWith('aia-')) || (c === 'config' && (id === SA.ID || id === 'aia' || String(id).startsWith(PRE_S) || String(id).startsWith(PRE_T))),
  pronta: pronto,
  async esegui() {
    const AD = await import('./views/archivio-dati.js');
    const liste = await Promise.all([AD.cerca({ area: '11.2', limite: 500 }), ...Object.keys(SA.TIPI).map(t => AD.cerca({ tipo: t, limite: 200 }))]);
    const docs = liste.flatMap(l => (l && l.documenti) || []);
    const cfg = cfgA(); const fatti = Object.assign({}, cfg.fatti);
    const { nuovi, compagni } = SA.daLeggere(docs, fatti);
    if (!nuovi.length) return { salvati: 0, note: 'nessun report nuovo' };
    const [{ leggiPdf }, A] = await Promise.all([import('./conti/pdftext.js'), import('./aia.js')]);
    let reps = []; const err = []; const quando = new Date().toISOString(); const nonLetti = []; const saltaDate = new Set();
    for (const x of [...nuovi, ...compagni]) {
      const nome = x.d.nome_file || x.d.nome || 'report'; const nuovo = nuovi.includes(x);
      let f;
      try { f = await AD.scaricaFile(x.d.impronta); }
      catch (e) { if (nuovo) err.push(nome); else saltaDate.add(x.d.data); continue; }   // non scaricato: si riprova al prossimo giro
      try {
        const r = A.leggiReport(await leggiPdf(await f.arrayBuffer()));
        Object.assign(r, { file: nome, imp: x.d.impronta, nuovo, dataCat: x.d.data }); reps.push(r);
      } catch (e) {   // PDF che non si legge: al massimo 3 tentativi, poi resta fuori
        if (!nuovo) { saltaDate.add(x.d.data); continue; }
        const t = ((fatti[x.d.impronta] || {}).tentativi || 0) + 1;
        fatti[x.d.impronta] = { quando, tipo: x.t, data: x.d.data || null, nome, esito: t >= SA.TENTATIVI ? 'nonletto' : 'errore', tentativi: t };
        nonLetti.push(nome);
      }
    }
    // il compagno dello stesso controllo non si è scaricato: i nuovi di quel controllo aspettano il prossimo giro
    if (saltaDate.size) {
      reps.filter(r => r.nuovo && saltaDate.has(r.dataCat) && r.tipo !== 'parametri').forEach(r => err.push(r.file));
      reps = reps.filter(r => !(saltaDate.has(r.dataCat) && r.tipo !== 'parametri'));
    }
    const buoni = reps.filter(r => RACC.includes(r.tipo));
    reps.filter(r => r.nuovo && !buoni.includes(r)).forEach(r => { fatti[r.imp] = { quando, tipo: r.tipo || null, nome: r.file, esito: 'altro' }; });
    const div = SA.dividi(S, buoni, uid, tenutiSalvati());
    for (const r of buoni.filter(r => r.nuovo)) fatti[r.imp] = { quando, tipo: r.tipo, data: r.data || null, nome: r.file, esito: div.vecchi.includes(r) ? 'vecchio' : 'importato' };
    const prima = sospesiSalvati(); const sospesi = SA.unisciSospesi(prima, div.sospesi, new Set(div.salva.filter(o => o.col === 'capi').map(o => o.id)));
    const scrivi = sospesi.filter(s => { const v = prima.find(x => x.id === s.id); return !v || SA.impronta(v) !== SA.impronta(s); }).map(s => ({ col: 'config', id: recS(s), data: { tipo: 'aia-sospeso', s } }));
    await store.bulkPut([...div.salva, ...scrivi, { col: 'config', id: SA.ID, data: Object.assign(cfg, { fatti }) }]);
    for (const s of prima) if (!sospesi.some(x => x.id === s.id)) await store.remove('config', recS(s));
    const nCapi = div.salva.filter(o => o.col === 'capi').length, nEv = div.salva.filter(o => o.col === 'eventi').length;
    const nVecchi = div.vecchi.filter(r => r.nuovo).length;
    const note = [
      buoni.filter(r => r.nuovo).length ? plural(buoni.filter(r => r.nuovo).length, 'report letto', 'report letti') + (div.R && div.R.dataCF ? ' (controllo del ' + fd(div.R.dataCF) + ')' : '') : '',
      nCapi ? plural(nCapi, 'vacca aggiornata', 'vacche aggiornate') : '', nEv ? plural(nEv, 'evento', 'eventi') : '',
      div.salva.some(o => o.col === 'config') ? 'andamento della stalla aggiornato' : '',
      div.sospesi.length ? plural(div.sospesi.length, 'da controllare', 'da controllare') : '',
      nVecchi ? plural(nVecchi, 'report più vecchio', 'report più vecchi') + " dell'ultimo controllo lasciati fuori" : '',
      err.length ? plural(err.length, 'report non scaricato', 'report non scaricati') + ' (si riprova)' : '',
      nonLetti.length ? plural(nonLetti.length, 'PDF che non si legge', 'PDF che non si leggono') + ': ' + nonLetti.join(', ') : '',
    ].filter(Boolean).join(', ');
    return { salvati: nCapi + nEv + (div.salva.some(o => o.col === 'config') ? 1 : 0), note: note || 'niente di nuovo' };
  },
  dubbi() {
    const out = []; const sosp = sospesiSalvati();
    for (const s of sosp) out.push(dubbioAia(s));
    const aperti = new Set(sosp.filter(s => s.tipo === 'conflitto').map(s => s.capoId));
    for (const u of SA.forseUscite(S, c => capoI(c).stato, aperti)) out.push({
      id: 'aia:uscita:' + u.c.id + ':' + u.ult, area: 'stalla',
      testo: `${nomeCapo(u.c)} (${u.c.matricola || 'senza matricola'}) non c'è nell'ultimo controllo AIA del ${fd(u.ult)}`,
      proposta: `C'era nel controllo del ${fd(u.prima)}. Forse è uscita (venduta, macellata o morta): apri la vacca e registra l'uscita con il motivo.`,
      apri: apriCapo(u.c.id),
    });
    return out;
  },
  // i report del giro annullato restano conosciuti ("annullato"), altrimenti il giro dopo li reimporterebbe
  async annullato(riga, tolti) {
    const t = tolti.find(x => x.c === 'config' && x.id === SA.ID); if (!t || !t.rec) return;
    const cfg = cfgA(); const fatti = Object.assign({}, cfg.fatti); let cambi = 0;
    for (const [imp, f] of Object.entries(t.rec.fatti || {})) if (!fatti[imp]) { fatti[imp] = Object.assign({}, f, { esito: 'annullato' }); cambi++; }
    if (cambi) await store.put('config', SA.ID, Object.assign(cfg, { fatti }));
  },
});

async function togliSospeso(s, ops = [], tieni = false) {
  const righe = [...ops];
  // "Tieni i miei": la scelta resta, così il conflitto non torna a ogni controllo
  if (tieni) {
    const v = senzaId(cfgDi(PRE_T + s.capoId)); const ev = Object.assign({}, v.ev || {}); (s.evIds || []).forEach(e => { ev[e] = true; });
    righe.push({ col: 'config', id: PRE_T + s.capoId, data: { tipo: 'aia-tieni', capoId: s.capoId, ev, num: s.numMio || v.num || null } });
  }
  if (righe.length) await store.bulkPut(righe);
  await store.remove('config', recS(s));
  return true;
}
function dubbioAia(s) {
  if (s.tipo === 'nuovi') return {
    id: s.id, area: 'stalla',
    testo: `${plural(s.capi.length, 'capo nuovo', 'capi nuovi')} nel report Si@lleva del ${dataTxt(s.data)}`,
    proposta: "Aggiungerli alla mandria con i parti, le asciutte e i controlli dell'AIA (le matricole scritte a mano nel frattempo si saltano)",
    dettagli: s.capi.slice(0, 40).map(c => [c.matricola + (c.numero ? ' · n. ' + c.numero : ''), '—', [c.nome, c.razza, c.parto ? 'parto ' + fd(c.parto) : ''].filter(Boolean).join(' · ') || 'nuovo']),
    conferma: () => togliSospeso(s, SA.opsNuovi(S, s)),
    scarta: () => togliSospeso(s),
  };
  const c = S.capi.find(x => x.id === s.capoId);
  return {
    id: s.id, area: 'stalla',
    testo: `${nomeCapo(c)}: i dati del controllo AIA del ${dataTxt(s.data)} non tornano con quelli scritti a mano`,
    proposta: "Tenere i dati dell'AIA (corregge le date e il numero) e aggiornare la vacca; oppure tenere i tuoi (la scelta vale anche per i prossimi controlli) e aggiornare solo il resto",
    dettagli: s.righe.map(r => (r[0] === 'Numero aziendale' ? r : [r[0], fd(r[1]), fd(r[2])])),
    conferma: () => (SA.ancoraUguale(S, s) ? togliSospeso(s, s.ops) : false),
    alternative: [{ testo: 'Tieni i miei', conferma: () => (SA.ancoraUguale(S, s) ? togliSospeso(s, s.alt, true) : false) }],
    scarta: () => togliSospeso(s),
    apri: apriCapo(s.capoId),
  };
}

/* ---------------- gasolio consumato dai mezzi ---------------- */
const cfgG = () => Object.assign({ fatti: {} }, senzaId(cfgDi(G.ID)));
const segna = async (opIds, stato, extra = {}) => {
  const cfg = cfgG(); const fatti = Object.assign({}, cfg.fatti); opIds.forEach(id => { fatti[id] = stato; });
  await store.put('config', G.ID, Object.assign(cfg, extra, { fatti }));
};
const litri = ops => ops.reduce((t, o) => t + (o.data.quantita || 0), 0);

registra({
  id: 'gasolio-mezzi', nome: 'Gasolio dei mezzi', area: 'campagna',
  descr: 'Scarica dal magazzino il gasolio dei lavori con le ore: consumo in litri all\'ora imparato dai rifornimenti dalla cisterna o scritto nel libretto',
  raccolte: ['movimenti', 'config'],
  propri: (c, id) => (c === 'movimenti' && String(id).startsWith(G.PRE)) || (c === 'config' && id === G.ID),
  segui: ['operazioni', 'mezzi'],
  pronta: () => (!S.mezzi.length ? false : S.prodotti.some(G.isGasolio) ? true : "Nel magazzino non c'è un prodotto della categoria Gasolio."),
  async esegui() {
    const cfg = cfgG(); let cambia = false;
    if (!cfg.dal) { cfg.dal = today(); cambia = true; }   // si parte dal primo giorno: i lavori vecchi non si scaricano
    const pl = G.piano(S, cfg);
    const fatti = Object.assign({}, cfg.fatti);
    pl.auto.forEach(o => { fatti[o.data.gasOp] = 'fatto'; });
    pl.togli.forEach(o => { const m = S.movimenti.find(x => x.id === o.id); if (m && m.gasOp) fatti[m.gasOp] = o.rifornito ? 'rifornito' : 'fatto'; });
    if (pl.auto.length || pl.togli.length) cambia = true;
    if (pl.auto.length || cambia) await store.bulkPut([...pl.auto, { col: 'config', id: G.ID, data: Object.assign(cfg, { fatti }) }]);
    for (const o of pl.togli) await store.remove('movimenti', o.id);
    const note = [
      pl.auto.length ? `${plural(pl.auto.length, 'scarico', 'scarichi')} di gasolio (${nf(litri(pl.auto), 1)} l) con il consumo imparato` : '',
      pl.togli.length ? `${plural(pl.togli.length, 'scarico stimato tolto', 'scarichi stimati tolti')} (lavoro cancellato o senza ore, o gasolio già uscito con un rifornimento)` : '',
      pl.proposte.length ? plural(pl.proposte.length, 'mezzo da confermare', 'mezzi da confermare') : '',
      pl.conRif.length ? `${pl.conRif.map(m => m.nome).join(', ')}: il gasolio esce con i rifornimenti dalla cisterna` : '',
    ].filter(Boolean).join(', ');
    return { salvati: pl.auto.length + pl.togli.length, note: note || (cambia ? 'conto del gasolio avviato da oggi' : 'niente da scaricare') };
  },
  dubbi() {
    if (!S.mezzi.length) return [];
    const cfg = cfgG(); if (!cfg.dal) return [];
    const pl = G.piano(S, cfg); const out = [];
    if (!pl.p && pl.tutti.length > 1) {
      const [a, ...b] = pl.tutti;
      out.push({
        id: 'gs:scegli:' + pl.tutti.map(p => p.id).join(','), area: 'campagna',
        testo: 'Nel magazzino ci sono più prodotti di gasolio', proposta: `Per gli scarichi dei mezzi usare «${a.nome}» (o scegline un altro)`,
        conferma: () => segna([], 'fatto', { prodottoId: a.id }).then(() => true),
        alternative: b.map(p => ({ testo: p.nome, conferma: () => segna([], 'fatto', { prodottoId: p.id }).then(() => true) })),
      });
    }
    for (const x of pl.proposte) {
      const ore = x.ops.reduce((t, o) => t + o.data.ore, 0);
      const da = x.c.fonte === 'libretto' ? 'consumo scritto nel libretto' : `consumo imparato da ${plural(x.c.imparato.n, 'misura', 'misure')}, non ancora sicuro`;
      out.push({
        id: 'gs:' + x.m.id + ':' + x.ops.map(o => o.data.gasOp).sort().join(','), area: 'campagna',
        testo: `${x.m.nome}: ${plural(x.ops.length, 'lavoro', 'lavori')} senza scarico del gasolio`,
        proposta: `Scaricare ${nf(litri(x.ops), 1)} l di «${pl.p.nome}»: ${nf(ore, 1)} h × ${nf(x.c.lh, 1)} l/h (${da})`,
        dettagli: x.ops.slice(0, 30).map(o => { const op = S.operazioni.find(y => y.id === o.data.gasOp) || {}; return [`${fd(op.data)} ${op.tipo || 'lavoro'}`, '—', `${nf(o.data.ore, 1)} h → ${nf(o.data.quantita, 1)} l`]; }),
        conferma: async () => { await store.bulkPut(x.ops); await segna(x.ops.map(o => o.data.gasOp), 'fatto'); return true; },
        scarta: () => segna(x.ops.map(o => o.data.gasOp), 'scartato'),
        apri: apriMezzo(x.m.id),
      });
    }
    for (const x of pl.senza) out.push({
      id: 'gs:senza:' + x.m.id, area: 'campagna',
      testo: `${x.m.nome}: ${plural(x.lavori, 'lavoro', 'lavori')} (${nf(x.ore, 1)} h) dal ${fd(cfg.dal)}, ma non so quanto gasolio consuma`,
      proposta: "Scrivi il consumo in litri all'ora nella scheda del mezzo. Oppure registra i rifornimenti dalla cisterna (scarico di gasolio con «Messo nel mezzo»): allora il gasolio esce dal magazzino con quelli e non con i lavori",
      apri: apriMezzo(x.m.id),
    });
    return out;
  },
  // uno scarico annullato dal giro non torna; annullando una conferma il lavoro torna da confermare
  async annullato(riga, tolti) {
    if (riga.motivo === 'conferma') return;
    const ids = tolti.filter(t => t.c === 'movimenti' && String(t.id).startsWith(G.PRE) && t.rec && t.rec.gasOp).map(t => t.rec.gasOp);
    // annullando il primo giro il giorno di partenza resta quello di prima (altrimenti ripartirebbe da oggi)
    const c0 = tolti.find(t => t.c === 'config' && t.id === G.ID); const dal = cfgG().dal || (c0 && c0.rec && c0.rec.dal);
    if (ids.length || (dal && !cfgG().dal)) await segna(ids, 'annullato', dal ? { dal } : {});
  },
});
