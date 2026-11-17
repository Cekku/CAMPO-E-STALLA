// Documenti dall'archivio del PC caricati da soli nei Conti (dalla 1.41.0).
// Il catalogo dell'archivio (strumenti/archivio, ponte sulla porta 1236) trova e classifica ogni giorno i file nuovi;
// quando l'app è aperta sul PC prende quelli dei Conti che non conosce ancora, li legge con gli stessi lettori di
// "Carica documenti" e:
//  - salva da sola quello che è sicuro: fatture XML/P7M, fatture PDF con i totali che tornano e l'anno giusto,
//    cedolini, bilancini paghe, elenchi delle fatture, dichiarazione IVA di un anno che non l'ha ancora, movimenti
//    della banca riconosciuti con certezza (spese, stipendi con il dipendente, F24, fatture per numero o nome e importo);
//  - mette fra i dubbi il resto (bilancini del commercialista, che sostituiscono il conto economico; fatture PDF
//    con controlli che non tornano; omonimi, dipendenti nuovi, fatture trovate solo per importo).
// Gli estratti conto si sovrappongono spesso (lo stesso periodo scaricato più volte): per ogni conto si ricorda il
// periodo già letto e i movimenti di quei giorni si saltano. Le contabili dei bonifici si saltano nei giorni coperti
// da un estratto conto (lo stesso pagamento ci sarebbe due volte).
// Un record per documento nella raccolta riservata econfig, id "au-<impronta>":
//   { tipo: 'automatico', impronta, docId, nome, tipoDoc, data, stato: 'fatto'|'dubbi'|'nonletto'|'ignorato', msg,
//     quando, conto?, da?, a?, dubbi?: [righe di movimenti da rivedere] }
// L'originale resta sul PC: riga "do-<impronta>" con copia: false e il numero del catalogo (si apre dal ponte).
import { S, bus } from '../state.js';
import * as store from '../store.js';
import { today } from '../util.js';

export const PRE = 'au-';
export const record = imp => S.econfig.find(x => x.id === PRE + imp) || null;
export const records = () => S.econfig.filter(x => x.tipo === 'automatico');
const cfgAuto = () => (S.econfig.find(x => x.id === 'cfg') || {}).auto || {};

// tipi del catalogo (strumenti/archivio/classifica.py) che l'app sa leggere; gli altri restano solo nell'archivio
const TIPI = /^(Fattura(-elettronica|-acconto)?|Nota-di-credito|Nota-di-addebito|Busta-paga|Bilancino-paghe|Estratto-conto|Bonifico|Distinta-bonifici|Dichiarazione-IVA|Bilancio|Elenco-fatture(-passive|-attive)?)$/;
const EST = /^\.?(pdf|xml|p7m|zip|xlsx)$/i; // il catalogo scrive l'estensione con il punto (".pdf")
const ORDINE = t => /^Estratto-conto$/.test(t) ? 0 : /^(Fattura|Nota)/.test(t) ? 1 : /^(Busta-paga|Bilancino-paghe)$/.test(t) ? 2 : /^(Bonifico|Distinta-bonifici)$/.test(t) ? 3 : 4;
const r2 = v => Math.round(v * 100) / 100;
const giorni = (a, b) => Math.abs(new Date(a) - new Date(b)) / 864e5;

/** Da quando prendere i documenti: impostazione, altrimenti il primo anno con le fatture. */
export function dataInizio() {
  const c = cfgAuto(); if (c.da) return c.da;
  const anni = S.fatture.map(f => +String(f.data || '').slice(0, 4)).filter(Boolean);
  return (anni.length ? Math.min(...anni) : new Date().getFullYear()) + '-01-01';
}
export const attivo = () => cfgAuto().attivo !== false;

/** Impronte dei documenti che l'app conosce già (registrazioni, originali, documenti già passati di qui). */
async function note() {
  const OR = await import('./originali.js');
  const s = new Set(OR.perFile().map(g => g.imp).filter(Boolean));
  for (const x of S.econfig) { const id = String(x.id); if (id.startsWith('do-')) s.add(id.slice(3)); if (id.startsWith(PRE)) s.add(id.slice(PRE.length)); if (x.imp) s.add(x.imp); }
  for (const f of S.fatture) for (const p of f.pagamentiBanca || []) if (p.imp) s.add(p.imp);
  return s;
}

/** Documenti del catalogo da leggere: tipi giusti, dalla data di inizio, non ancora visti. */
export async function daLeggere() {
  const OR = await import('./originali.js');
  OR.svuotaCatalogo(); const docs = await OR.caricaCatalogo(); const n = await note(); const da = dataInizio();
  return docs.filter(d => TIPI.test(d.tipo || '') && EST.test(d.estensione || '') && d.data && String(d.data) >= da.slice(0, String(d.data).length) && !n.has(d.impronta))
    .sort((a, b) => ORDINE(a.tipo) - ORDINE(b.tipo) || (ORDINE(a.tipo) === 0 ? b.dimensione - a.dimensione : String(a.data).localeCompare(String(b.data))));
}

/* ---------------- periodi già coperti dagli estratti conto ---------------- */
/** Conto (IBAN) e periodo dalla prima pagina dell'estratto conto. */
export async function intestazione(bytes) {
  const { leggiPdf, testoPagina } = await import('./pdftext.js');
  const pg = await leggiPdf(bytes); const t = pg.slice(0, 1).map(testoPagina).join('\n').replace(/\s+/g, ' ');
  const ib = (t.replace(/(IT\s?\d\d)\s?([A-Z])\s?/g, '$1$2').match(/IT\d{2}[A-Z]\d{10}[0-9A-Z]{12}/) || [])[0] || '';
  const p = t.match(/(\d{2})\/(\d{2})\/(\d{4})\s*-\s*(\d{2})\/(\d{2})\/(\d{4})/);
  return { conto: ib, da: p ? `${p[3]}-${p[2]}-${p[1]}` : '', a: p ? `${p[6]}-${p[5]}-${p[4]}` : '' };
}
const periodi = () => records().filter(r => r.da && r.a);
const coperto = (data, conto, escluso) => periodi().some(p => p.impronta !== escluso && (!conto || !p.conto || p.conto === conto) && data >= p.da && data <= p.a);

/* ---------------- cosa è sicuro ---------------- */
const MOTIVI_SICURI = new Set(['numero e importo', 'nome e importo']);
function rigaSicura(r, CON_DIP) {
  if (r.gia || r.altro || r.stessoGiorno || r.doppio) return false;
  if (r.tipo === 'banca') return true;
  if (['f24', 'contributi', 'fondo'].includes(r.tipo)) return true;
  if (CON_DIP.has(r.tipo)) return !!r.dip && !r.ambigui && !r.nuovo;
  if (r.tipo === 'fattura') return (r.fatt || []).length > 0 && MOTIVI_SICURI.has(r.motivo);
  return false;
}
// i campi che servono per rivedere una riga più tardi (tabellaMovimenti e salvaRighe)
const CAMPI_RIGA = ['id', 'data', 'importo', 'entrata', 'descrizione', 'beneficiario', 'iban', 'causale', 'fonte', 'imp', 'tipo', 'dip', 'ambigui', 'nuovo', 'fatt', 'proposte', 'motivo', 'comp', 'modalita', 'voce'];
const snella = r => Object.fromEntries(CAMPI_RIGA.filter(k => r[k] !== undefined && r[k] !== '').map(k => [k, r[k]]));

function fatturaSimile(f) {
  const p = [f.pivaFornitore, f.pivaCliente].filter(Boolean); const tot = Math.abs(+f.totale || 0);
  return S.fatture.find(g => g.piva && p.includes(g.piva) && Math.abs(Math.abs(+g.totale || 0) - tot) <= 0.05 && g.data && f.data && giorni(g.data, f.data) <= 60);
}

/** Il PDF di cortesia (o la copia) di una fattura già caricata dall'XML: si riconosce dai dati del catalogo
 *  (ditta, numero, data, importo nel nome) senza leggerlo, come le "fatture mancanti" (originali.puntiFattura). */
function giaCaricata(d, OR) {
  if (!/^(Fattura|Nota)/.test(d.tipo || '') || !d.data) return null;
  const rif = d.data.length === 10 ? d.data : d.data.length === 7 ? d.data + '-15' : null; if (!rif) return null;
  const sc = S.fatture.filter(f => f.data && giorni(f.data, rif) <= 40)
    .map(f => Object.assign({ f }, OR.puntiFattura({ numero: f.numero, controparte: f.controparte, data: f.data, totale: f.totale }, d)))
    .filter(s => s.p >= 8 && (s.perche.includes('numero') || (s.perche.includes('data') && s.perche.includes('importo')))).sort((a, b) => b.p - a.p);
  if (!sc.length || (sc[1] && sc[1].p >= sc[0].p - 1)) return null;
  return sc[0].f;
}

/* ---------------- un documento ---------------- */
async function uno(d) {
  const AD = await import('../views/archivio-dati.js'); const M = await import('./importa.js'); const OR = await import('./originali.js');
  const PG = await import('./paghe.js'); const BK = await import('./banca.js');
  const gia = giaCaricata(d, OR);
  if (gia) {
    const LK = await import('../archivio-link.js');
    if (!LK.collegatiA('fatture', gia.id).some(x => x.impronta === d.impronta)) await LK.collega(d, 'fatture', gia.id);
    const rec = { tipo: 'automatico', impronta: d.impronta, docId: d.id, nome: d.nome_file, tipoDoc: d.tipo, data: d.data, quando: today(), stato: 'fatto', msg: `copia della fattura n. ${gia.numero} già caricata: collegata` };
    await store.put('econfig', PRE + d.impronta, rec); return rec;
  }
  const file = await AD.scaricaFile(d.impronta); const nome = file.name || d.nome_file; const bytes = new Uint8Array(await file.arrayBuffer());
  const base = { tipo: 'automatico', impronta: d.impronta, docId: d.id, nome, tipoDoc: d.tipo, data: d.data, quando: today() };
  const ris = []; await M.leggiDocumento(nome, bytes, ris); await OR.segna(ris, 0, nome, bytes);
  const fatti = [], dubbi = [], righeDubbie = []; let salvato = false, extra = {};
  for (const x of ris) {
    if (x.tipo === 'errore') { dubbi.push(x.errore); continue; }
    if (x.tipo === 'fattura') {
      const f = x.f; const ida = M.idFattura(f.chiave);
      if (S.fatture.some(g => g.id === ida)) { await M.salvaFatture([f]); fatti.push('fattura già presente'); continue; } // salva solo l'impronta
      if (f.fonte !== 'xml') {
        const sim = fatturaSimile(f);
        if (sim) { fatti.push(`copia di una fattura già caricata (n. ${sim.numero})`); continue; }
        const annoOk = !!f.data && (!d.data || Math.abs(+String(f.data).slice(0, 4) - +String(d.data).slice(0, 4)) <= 1);
        if (!String(f.controllo || '').startsWith('OK') || !annoOk) { dubbi.push(`fattura${f.numero ? ' n. ' + f.numero : ''}${f.data ? ' del ' + f.data : ''}: ${!f.data ? 'data non letta' : !annoOk ? "l'anno letto non torna con la data del documento" : f.controllo}`); continue; }
      }
      const o = await M.salvaFatture([f]); salvato = true; fatti.push(o.nuove ? `fattura n. ${f.numero}` : 'fattura già presente');
      if (o.ids && o.ids.length) OR.collegaDaSolo(o.ids).catch(() => { });
      continue;
    }
    if (x.tipo === 'cedolini') { if (!x.anno || !x.mese) { dubbi.push('cedolini: mese non letto'); continue; } const o = await PG.salvaCedolini(x); salvato = true; fatti.push(`cedolini ${x.mesePer} (${o.nuovi} nuovi${o.sostituiti ? ', ' + o.sostituiti + ' sostituiti' : ''})`); continue; }
    if (x.tipo === 'bilpaghe') { if (!x.bil || !x.bil.anno) { dubbi.push('bilancino paghe: mese non letto'); continue; } await PG.salvaBilancinoPaghe(x); salvato = true; fatti.push('bilancino paghe ' + x.mesePer); continue; }
    if (x.tipo === 'elenco') { if (!+x.anno) { dubbi.push("elenco delle fatture: anno non letto"); continue; } const EL = await import('./elenco.js'); x.anno = +x.anno; await EL.salvaElenco(x); salvato = true; fatti.push(`elenco fatture ${x.anno}`); continue; }
    if (x.tipo === 'iva') {
      const { bilancio } = await import('./dati.js');
      if (!+x.anno) { dubbi.push("dichiarazione IVA: anno non letto"); continue; }
      if ((bilancio(+x.anno) || {}).iva) { dubbi.push(`dichiarazione IVA ${x.anno}: ce n'è già una, sostituirla?`); continue; }
      await M.salvaIva(x, +x.anno); salvato = true; fatti.push(`dichiarazione IVA ${x.anno}`); continue;
    }
    if (x.tipo === 'bilancino') { dubbi.push(`bilancino ${x.anno || ''}: sostituisce il conto economico dell'anno, va confermato`.replace('  ', ' ')); continue; }
    if (x.tipo === 'excel') { dubbi.push('file Excel del vecchio modello: va confermato'); continue; }
    if (x.tipo === 'bonifici') {
      const estratto = x.etichetta === 'Estratto conto';
      let conto = '';
      // un estratto "filtrato" (per esempio solo commissioni e spese) non copre il periodo: si ricordano solo i periodi
      // degli estratti completi, altrimenti un estratto vero dello stesso anno caricato dopo verrebbe saltato
      const completo = x.righe.length >= 8 && x.righe.filter(r => r.tipo === 'banca').length / x.righe.length < 0.85;
      if (estratto) { const h = await intestazione(bytes); const ds = x.righe.map(r => r.data).filter(Boolean).sort(); conto = h.conto; extra = completo ? { conto: h.conto, da: h.da || ds[0] || '', a: h.a || ds[ds.length - 1] || '' } : { conto: h.conto, parziale: true }; }
      let saltate = 0;
      // spese della banca già salvate (stessa data, importo e verso), anche da un estratto con le descrizioni scritte diverse
      const giaBanca = new Map(); for (const b of S.econfig) if (b.tipo === 'banca') { const k = b.data + '|' + r2(b.importo) + '|' + !!b.entrata; giaBanca.set(k, (giaBanca.get(k) || 0) + 1); }
      const vive = x.righe.filter(r => {
        if (estratto ? coperto(r.data, conto, d.impronta) : coperto(r.data, '', d.impronta)) { saltate++; return false; }
        if (r.tipo === 'banca') { const k = r.data + '|' + r2(r.importo) + '|' + !!r.entrata; const n = giaBanca.get(k) || 0; if (n) { giaBanca.set(k, n - 1); saltate++; return false; } }
        return true;
      });
      const sicure = vive.filter(r => rigaSicura(r, PG.CON_DIP));
      const dub = vive.filter(r => r.tipo !== 'ignora' && !r.altro && !r.gia && !sicure.includes(r));
      if (!estratto && !sicure.length && !dub.length && vive.length) fatti.push('bonifico non riconosciuto: né un dipendente né una fattura caricata');
      if (sicure.length) { const o = await BK.salvaRighe(sicure, nome); salvato = true; fatti.push(`${o.nP} pagamenti del personale, ${o.nF} pagamenti di fatture, ${o.nB} movimenti di banca`); }
      if (saltate) fatti.push(`${saltate} movimenti già letti da un altro estratto`);
      if (dub.length) { righeDubbie.push(...dub.map(snella)); dubbi.push(`${dub.length} movimenti da controllare (omonimi, dipendenti nuovi, fatture trovate solo per importo)`); }
      continue;
    }
  }
  if (salvato) await store.put('econfig', 'do-' + d.impronta, Object.assign({ caricato: today() }, (S.econfig.find(y => y.id === 'do-' + d.impronta)) || {}, { tipo: 'originale', impronta: d.impronta, nome, kb: Math.max(1, Math.round(bytes.length / 1024)), mime: OR.mimeDi(nome), copia: false, archivio: d.id }));
  const nonLetto = ris.length > 0 && ris.every(x => x.tipo === 'errore');
  let stato = nonLetto || !ris.length ? 'nonletto' : dubbi.length ? 'dubbi' : 'fatto';
  // contabile o distinta in un formato che l'app non legge, ma di giorni già coperti da un estratto conto: non serve
  // (le altre contabili in un formato che l'app non legge restano fuori: i pagamenti si prendono dagli estratti conto)
  if (stato === 'nonletto' && /^(Bonifico|Distinta-bonifici)$/.test(d.tipo || '')) { stato = 'ignorato'; dubbi.length = 0; fatti.push(d.data && coperto(String(d.data).slice(0, 10), '', d.impronta) ? "formato non letto, ma quei giorni sono già nell'estratto conto" : "formato di contabile che l'app non sa leggere: il pagamento arriverà dall'estratto conto"); }
  if (stato === 'fatto' && /^(Bonifico|Distinta-bonifici)$/.test(d.tipo || '') && !salvato && fatti.some(t => t.startsWith('bonifico non riconosciuto'))) stato = 'ignorato';
  const rec = Object.assign(base, extra, { stato, msg: [...fatti, ...dubbi].join(' · ') || 'niente da salvare' }, righeDubbie.length ? { dubbi: righeDubbie } : {});
  await store.put('econfig', PRE + d.impronta, rec);
  return rec;
}

/** Estratti conto caricati a mano prima: si ricorda solo il periodo (niente di nuovo da salvare). */
async function periodoDiUnoGiaCaricato(d) {
  const AD = await import('../views/archivio-dati.js');
  const file = await AD.scaricaFile(d.impronta); const h = await intestazione(new Uint8Array(await file.arrayBuffer()));
  if (!h.da) return null;
  const rec = { tipo: 'automatico', impronta: d.impronta, docId: d.id, nome: file.name, tipoDoc: d.tipo, data: d.data, quando: today(), stato: 'fatto', msg: 'caricato prima a mano: ricordato solo il periodo', conto: h.conto, da: h.da, a: h.a };
  await store.put('econfig', PRE + d.impronta, rec); return rec;
}

/* ---------------- il giro completo ---------------- */
export const STATO = { attivo: false, fatti: 0, tot: 0, doc: '', esiti: { fatto: 0, dubbi: 0, nonletto: 0, errori: 0 }, fine: null, errore: '', fermo: false };
const avvisa = () => { try { if (bus.render) bus.render(); } catch (e) { } };

/** Legge tutti i documenti nuovi. onPasso() a ogni documento. Si può fermare con ferma(). */
export async function esegui(onPasso = avvisa) {
  if (STATO.attivo) return STATO;
  const AD = await import('../views/archivio-dati.js');
  if (AD.conf().prova) throw new Error('Con i dati di prova dell\'archivio non si carica niente.');
  Object.assign(STATO, { attivo: true, fatti: 0, tot: 0, doc: 'cerco i documenti nuovi…', esiti: { fatto: 0, dubbi: 0, nonletto: 0, errori: 0 }, fine: null, errore: '', fermo: false }); onPasso();
  try {
    // prima gli estratti conto già caricati a mano senza periodo ricordato
    const OR = await import('./originali.js'); const docs = await OR.caricaCatalogo(); const n = await note();
    for (const d of docs.filter(d => d.tipo === 'Estratto-conto' && /pdf$/i.test(d.estensione || '') && n.has(d.impronta) && !record(d.impronta))) { try { await periodoDiUnoGiaCaricato(d); } catch (e) { console.warn(e); } }
    const L = await daLeggere(); STATO.tot = L.length; onPasso();
    for (const d of L) {
      if (STATO.fermo) break;
      STATO.doc = d.nome_file || d.nome; onPasso();
      try { const r = await uno(d); STATO.esiti[r.stato] = (STATO.esiti[r.stato] || 0) + 1; }
      catch (e) {
        STATO.esiti.errori++; console.warn(d.nome_file, e);
        // file sparito, cambiato o riservato: si riprova la prossima volta (niente record), salvo i riservati
        if (/riservat/i.test(e.message || '')) await store.put('econfig', PRE + d.impronta, { tipo: 'automatico', impronta: d.impronta, docId: d.id, nome: d.nome_file, tipoDoc: d.tipo, data: d.data, quando: today(), stato: 'ignorato', msg: 'documento riservato: non si legge' });
      }
      STATO.fatti++; onPasso();
    }
  } catch (e) { STATO.errore = e.message || String(e); }
  finally { STATO.attivo = false; STATO.doc = ''; STATO.fine = new Date().toISOString(); try { localStorage.setItem('ces.auto.ultimo', STATO.fine); } catch (e) { } onPasso(); }
  return STATO;
}
export const ferma = () => { STATO.fermo = true; };

/** All'apertura dell'app sul PC: una volta ogni 30 minuti, solo con i dati già scaricati e il ponte acceso. */
export async function avvia() {
  if (STATO.attivo || !attivo()) return;
  try { const u = localStorage.getItem('ces.auto.ultimo'); if (u && Date.now() - new Date(u) < 30 * 60e3) return; } catch (e) { }
  const { sync } = await import('../store.js');
  if (sync.mode === 'cloud' && (!sync.farm || sync.status !== 'ok' || sync.pending)) return;
  const AD = await import('../views/archivio-dati.js'); if (AD.conf().prova) return;
  try { await AD.aspetta('/stato'); } catch (e) { return; } // ponte spento o telefono: niente
  return esegui();
}

/** Dopo un salvataggio a mano da "Carica documenti": i documenti con dubbi di quei file sono sistemati. */
export async function chiudi(imps) {
  const rows = []; for (const imp of new Set(imps.filter(Boolean))) { const r = record(imp); if (r && (r.stato === 'dubbi' || r.stato === 'nonletto')) { const { id, ...data } = r; delete data.dubbi; rows.push({ col: 'econfig', id: PRE + imp, data: Object.assign(data, { stato: 'fatto', msg: (data.msg || '') + ' · rivisto a mano' }) }); } }
  if (rows.length) await store.bulkPut(rows);
  return rows.length;
}
export async function segnaStato(imp, stato) { const r = record(imp); if (!r) return; const { id, ...data } = r; if (stato !== 'dubbi') delete data.dubbi; await store.put('econfig', PRE + imp, Object.assign(data, { stato })); }
export async function impostazioni(patch) { const c = S.econfig.find(x => x.id === 'cfg') || {}; const { id, ...data } = c; await store.put('econfig', 'cfg', Object.assign({}, data, { auto: Object.assign({}, data.auto || {}, patch) })); }
