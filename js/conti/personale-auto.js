// Personale e scadenze automatici (1.66.0): F24 e contributi letti dai documenti veri e confrontati con quelli
// calcolati dai bilancini, scheda del dipendente costruita dai documenti, scadenziario (contratti, permessi, F24 del 16,
// contributi trimestrali, fondo pensione, rate dei mutui, polizze). Le automazioni del Centro sono in js/auto-personale.js.
//
// Record (tutti in raccolte riservate al titolare):
//  paghe   vq-<impronta>  { tipo: 'versamentoLetto', impronta, docId, nomeFile, tipoDoc, letto, esito: ok|altro|nonletto, motivo, doc, accettato? }
//  paghe   pd-<impronta>  { tipo: 'docPersonale', impronta, docId, nomeFile, tipoDoc, dataDoc, persona, letto, esito, doc, dipScelto? }
//  paghe   ps-<dip>       { tipo: 'schedaScelte', dip, scelte: { campo: { v, firma, quando } } }
//  econfig po-<impronta>  { tipo: 'polizza', impronta, docId, nomeFile, compagnia, dataDoc, letto, esito, doc, scelta? }
//  econfig sm-<chiave>    { tipo: 'pianoRata', chiave, numero, importo, mesi, giorno, fineMese, firma, confermato }
//  pagamenti (esistenti)  + quietanza: 'vq-<impronta>', ripartito: [{ tipo: f24|contributi, periodo, importo }]
// Un dato non sicuro non si salva da solo: diventa un dubbio del Centro con la proposta pronta.
import { S } from '../state.js';
import * as store from '../store.js';
import { N, today, addDays, diff } from '../util.js';
import * as P from './paghe.js';
import * as X from './personale-doc.js';
import { movimentiBanca } from './centri.js';

const r2 = v => Math.round(v * 100) / 100;
const eu = v => (v == null ? '—' : Number(v).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €');
const fdt = d => (d ? d.split('-').reverse().join('/') : '—');
const annoOggi = () => +today().slice(0, 4);
const hash = s => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(36); };
const senza = (r, ...k) => { const o = Object.assign({}, r); delete o.id; for (const x of k) delete o[x]; return o; };

/* ================= lettura dei documenti dall'archivio del PC ================= */
export const TIPI_VERS = ['Avviso-addebito-contributi', 'Avviso-di-pagamento', 'F24', 'F24-modello', 'Ricevuta-F24', 'Addebito-F24'];
export const TIPI_DIP = ['UNILAV', 'Contratto-di-lavoro', 'Permesso-di-soggiorno', 'CU'];
export const TIPI_POL = ['Polizza'];
const MAX_GIRO = 40; // documenti letti al massimo in un giro (il resto al giro dopo)

const letti = (col, pre) => new Map(S[col].filter(x => String(x.id).startsWith(pre)).map(x => [x.impronta, x]));
/** Documenti dei tipi indicati non ancora letti (o non letti da più di 7 giorni), dalla data indicata. */
async function nuovi(tipi, gia, da) {
  const AD = await import('../views/archivio-dati.js');
  const docs = [];
  for (const tipo of tipi) for (let inizio = 0; ; inizio += 500) {
    const r = await AD.aspetta('/documenti' + AD.qs({ tipo, limite: 500, inizio, ordina: '-data' }));
    docs.push(...r.documenti); if (!r.documenti.length || inizio + 500 >= r.totale) break;
  }
  const vecchio = addDays(today(), -7);
  return docs.filter(d => d.impronta && (!d.data || String(d.data) >= da.slice(0, String(d.data).length)))
    .filter(d => { const r = gia.get(d.impronta); return !r || (r.esito === 'nonletto' && String(r.letto || '') < vecchio); })
    .filter((d, i, a) => a.findIndex(x => x.impronta === d.impronta) === i);
}
async function testoDi(d) { const AD = await import('../views/archivio-dati.js'); return AD.testoIntero(d.impronta, { tempo: 20000 }); }
const base = (d, tipo) => ({ tipo, impronta: d.impronta, docId: d.id, nomeFile: d.nome_file || d.nome || '', tipoDoc: d.tipo || '', dataDoc: d.data ? String(d.data) : '', letto: today() });

/** Avvisi del consulente e modelli F24 → record vq-. */
export function classificaVersamento(testo) {
  if (!testo) return { esito: 'nonletto', motivo: 'il documento non ha testo leggibile' };
  const av = X.leggiAvviso(testo);
  if (av && av.data && av.totale) return av.persona ? { esito: 'altro', motivo: 'indirizzato a una persona, non all\'azienda', doc: av } : { esito: 'ok', doc: av };
  const f = X.leggiF24(testo);
  if (f && f.sezioni.length) {
    if (!f.cf) return { esito: 'nonletto', motivo: 'non ho letto il codice fiscale del contribuente', doc: f };
    if (!f.azienda) return { esito: 'altro', motivo: 'F24 di una persona, non dell\'azienda', doc: f };
    if (f.stato && !/esegu|pagat|addebit/.test(f.stato)) return { esito: 'altro', motivo: 'delega non ancora pagata (' + f.stato + ')', doc: f };
    const pt = X.partiF24(f); const paghe = f.sezioni.some(s => s.sez === 'inps') || f.sezioni.some(s => s.righe.some(r => ['1001', '1004', '1012', '3802', '3847', '3848', '1655', '1631', '1701'].includes(r.codice)));
    if (!paghe) return { esito: 'altro', motivo: 'F24 senza ritenute o contributi delle paghe', doc: f, parti: pt };
    if (!f.data) return { esito: 'nonletto', motivo: 'non ho letto la data del versamento', doc: f };
    return { esito: 'ok', doc: f };
  }
  return { esito: 'nonletto', motivo: 'non è un avviso di addebito né un modello F24 che so leggere' };
}
export async function leggiVersamenti(onPasso = () => { }) {
  const docs = (await nuovi(TIPI_VERS, letti('paghe', 'vq-'), `${annoOggi() - 1}-01-01`)).slice(0, MAX_GIRO);
  const rows = [];
  for (const [i, d] of docs.entries()) { onPasso(i, docs.length); const c = classificaVersamento(await testoDi(d)); rows.push({ col: 'paghe', id: 'vq-' + d.impronta, data: Object.assign(base(d, 'versamentoLetto'), c) }); }
  if (rows.length) await store.bulkPut(rows);
  return rows.length;
}

/** UNILAV, contratti, permessi di soggiorno, CU → record pd-. */
export function classificaPersonale(testo, tipoDoc) {
  if (!testo) return { esito: 'nonletto', motivo: 'il documento non ha testo leggibile' };
  let doc = null;
  if (tipoDoc === 'UNILAV') doc = X.leggiUnilav(testo);
  else if (tipoDoc === 'Contratto-di-lavoro') doc = X.leggiUnilav(testo) || X.leggiContratto(testo);
  else if (tipoDoc === 'Permesso-di-soggiorno') doc = X.leggiPermesso(testo);
  else if (tipoDoc === 'CU') doc = { genere: 'cu', cf: '', cfs: X.codiciFiscali(testo), campi: {} };
  if (!doc) return { esito: 'nonletto', motivo: 'non ho riconosciuto il modulo' };
  return { esito: Object.keys(doc.campi || {}).length || doc.genere === 'cu' ? 'ok' : 'vuoto', doc };
}
export async function leggiPersonale() {
  const docs = (await nuovi(TIPI_DIP, letti('paghe', 'pd-'), `${annoOggi() - 2}-01-01`)).slice(0, MAX_GIRO);
  const rows = [];
  for (const d of docs) rows.push({ col: 'paghe', id: 'pd-' + d.impronta, data: Object.assign(base(d, 'docPersonale'), { persona: d.persona || d.controparte || '' }, classificaPersonale(await testoDi(d), d.tipo)) });
  if (rows.length) await store.bulkPut(rows);
  return rows.length;
}
export async function leggiPolizze() {
  const docs = (await nuovi(TIPI_POL, letti('econfig', 'po-'), `${annoOggi() - 2}-01-01`)).slice(0, MAX_GIRO);
  const rows = [];
  for (const d of docs) {
    const t = await testoDi(d); const doc = t ? X.leggiPolizza(t) : null;
    const esito = !t ? 'nonletto' : doc && (doc.scadenza || doc.scadenze || doc.pagatoFino) ? 'ok' : 'vuoto';
    rows.push({ col: 'econfig', id: 'po-' + d.impronta, data: Object.assign(base(d, 'polizza'), { compagnia: d.controparte || '', esito, doc: doc || {} }) });
  }
  if (rows.length) await store.bulkPut(rows);
  return rows.length;
}

/* ================= F24 e contributi: calcolato contro versato ================= */
const cfPersona = s => /Cod\.?\s*Fiscale\s*:?\s*[A-Z]{6}[0-9L-V]{2}[A-Z][0-9L-V]{2}[A-Z][0-9L-V]{3}[A-Z]\b/i.test(s || '');
// solo i movimenti già segnati come F24 o contributi: un tipo scelto a mano (es. 'altro') si rispetta
const pareF24 = p => ['f24', 'contributi'].includes(p.tipo);
// record che l'automazione sta scrivendo in questo momento (per propri: le modifiche a mano non vanno nel suo diario)
export const IN_SCRITTURA = new Set();
async function scrivi(rows) { rows.forEach(r => IN_SCRITTURA.add(r.id)); try { await store.bulkPut(rows); } finally { rows.forEach(r => IN_SCRITTURA.delete(r.id)); } }
const totaleDi = v => (v.doc.genere === 'avviso' ? v.doc.totale : v.doc.saldo);
const vicini = (a, b, prima, dopo) => { const g = diff(a, b); return g >= -prima && g <= dopo; };
// movimenti della banca possibili per un versamento: stesso importo, da 3 giorni prima a 6 dopo, non di una persona, non già usati
const cerca = (D, tot, id) => { const altri = new Set(S.pagamenti.filter(p => p.quietanza && p.quietanza !== id).map(p => p.id)); return S.pagamenti.filter(p => pareF24(p) && !String(p.id).startsWith('pq-') && !altri.has(p.id) && p.data && Math.abs(N(p.importo) - tot) < 0.01 && vicini(D, p.data, 3, 6) && !cfPersona(p.descrizione)); };
// memoria: si ricalcola solo quando cambiano i dati (o il giorno)
function memo(fn, chiavi) { let k = null, v; return () => { const n = [...chiavi(), today()]; if (!k || n.some((x, i) => x !== k[i])) { k = n; v = fn(); } return v; }; }

/** Ogni versamento letto (documenti dello stesso giorno e importo uniti), con il confronto e il movimento della banca. */
export const analisiVersamenti = memo(analisi, () => [S.paghe, S.pagamenti, S.econfig]);
function analisi() {
  const vqs = S.paghe.filter(x => x.tipo === 'versamentoLetto' && x.esito === 'ok' && x.doc && x.doc.data && totaleDi(x) != null);
  const grp = new Map();
  for (const v of vqs) { const k = v.doc.data + '|' + r2(totaleDi(v)); grp.set(k, [...(grp.get(k) || []), v]); }
  const calc = P.versamenti().filter(o => o.tipo === 'f24' || o.tipo === 'contributi');
  const out = [];
  for (const docs of grp.values()) {
    docs.sort((a, b) => (a.doc.genere === 'f24' ? 0 : 1) - (b.doc.genere === 'f24' ? 0 : 1) || a.impronta.localeCompare(b.impronta));
    const v = docs[0]; const D = v.doc.data; const tot = r2(totaleDi(v)); const id = 'vq-' + v.impronta;
    const W = calc.filter(o => Math.abs(diff(X.giornoUtile(o.scadenza), D)) <= 4);
    const vicino = calc.filter(o => Math.abs(diff(X.giornoUtile(o.scadenza), D)) <= 25);
    const fs = W.filter(o => o.tipo === 'f24'), cs = W.filter(o => o.tipo === 'contributi');
    // il confronto si fa sempre con la stima dai bilancini (calcolato), anche dopo che Marco ha accettato l'importo versato
    const dov = o => o.calcolato ?? o.dovuto;
    const sF = r2(fs.reduce((t, o) => t + dov(o), 0)), sC = r2(cs.reduce((t, o) => t + dov(o), 0));
    const voce = o => ({ tipo: o.tipo, periodo: o.periodo, importo: dov(o) });
    const a = { id, D, tot, docs, v, fs, cs, sF, sC, caso: 'ok', rip: null, dettagli: [], note: [] };
    const f24 = v.doc.genere === 'f24' ? v.doc : null;
    const pt = f24 ? X.partiF24(f24) : null;
    if (pt && pt.estranei.length) a.note.push('nel modello ci sono anche codici che non sono delle paghe: ' + pt.estranei.map(c => c + (X.NOMI_CODICI[c] ? ' (' + X.NOMI_CODICI[c] + ')' : '')).join(', '));
    const nomeF = fs.map(o => P.nomeMese(o.periodo)).join(', '), nomeC = cs.map(o => o.nome).join(', ');
    if (f24 && !f24.controllo) a.caso = 'nonTorna';
    else if (!W.length) a.caso = vicino.length ? 'lontano' : 'senzaCalcolo';
    else if (f24) {
      // con codici estranei vale solo la parte delle paghe, e solo se torna al centesimo
      const rit = pt.estranei.length ? pt.ritPaghe : pt.ritenute;
      const okF = rit === 0 || Math.abs(rit - sF) < 0.01, okC = pt.inps === 0 || Math.abs(pt.inps - sC) < 0.01;
      if (okF && okC && !pt.altri && (rit || pt.inps)) a.rip = [...(rit ? fs.map(voce) : []), ...(pt.inps ? cs.map(voce) : [])];
      else { a.caso = 'diverso'; a.dettagli = [['F24 ritenute ' + (nomeF || ''), eu(sF), eu(rit)], ['Contributi INPS ' + (nomeC || ''), eu(sC), eu(pt.inps)], ...(pt.altri ? [['Altro (INAIL, altri enti)', eu(0), eu(pt.altri)]] : [])]; a.proposta = pt.estranei.length ? null : proponi(fs, cs, rit, pt.inps); }
    } else if (Math.abs(tot - r2(sF + sC)) < 0.01) a.rip = W.map(voce);
    else if (sF && Math.abs(tot - sF) < 0.01) a.rip = fs.map(voce);
    else if (sC && Math.abs(tot - sC) < 0.01) a.rip = cs.map(voce);
    else { a.caso = 'diverso'; a.dettagli = [['F24 ritenute ' + (nomeF || ''), eu(sF), ''], ['Contributi INPS ' + (nomeC || ''), eu(sC), ''], ['Totale', eu(r2(sF + sC)), eu(tot)]]; a.proposta = proponi(fs, cs, Math.min(tot, sF) || tot, cs.length ? r2(tot - Math.min(tot, sF)) : 0); }
    a.firma = hash([tot, sF, sC, ...W.map(o => o.periodo + ':' + dov(o))].join('|'));
    if (a.caso === 'diverso' && v.accettato && v.accettato.firma === a.firma) { a.caso = 'accettato'; a.rip = v.accettato.rip; }
    // movimento della banca: stesso importo, dal giorno prima a 6 giorni dopo, non un F24 di una persona
    const legato = S.pagamenti.find(p => p.quietanza === id);
    if (legato && !String(legato.id).startsWith('pq-')) a.mov = { stato: 'collegato', p: legato };
    else {
      const tutti = cerca(D, tot, id); const cand = tutti.filter(p => !p.comp);
      // pagamento registrato dall'avviso (pq-) e poi arrivato il movimento vero della banca: si sposta sul movimento
      if (legato) a.mov = cand.length === 1 ? { stato: 'sposta', p: cand[0], pq: legato } : { stato: 'collegato', p: legato };
      else if (tutti.length && !cand.length) a.mov = { stato: 'mano', cand: tutti };   // il mese l'ha già scelto Marco: non si tocca
      else a.mov = cand.length === 1 ? { stato: 'uno', p: cand[0] } : cand.length ? { stato: 'piu', cand } : { stato: 'nessuno' };
    }
    out.push(a);
  }
  return out.sort((x, y) => y.D.localeCompare(x.D));
}
function proponi(fs, cs, rit, inps) {
  const rip = [];
  if (fs.length === 1) rip.push({ tipo: 'f24', periodo: fs[0].periodo, importo: r2(rit) });
  else if (fs.length > 1) { if (Math.abs(rit - r2(fs.reduce((t, o) => t + o.dovuto, 0))) >= 0.01) return null; fs.forEach(o => rip.push({ tipo: 'f24', periodo: o.periodo, importo: o.dovuto })); }
  if (inps > 0) { if (cs.length !== 1) return null; rip.push({ tipo: 'contributi', periodo: cs[0].periodo, importo: r2(inps) }); }
  return rip.length ? rip : null;
}
const stessiRip = (a, b) => JSON.stringify(a || null) === JSON.stringify(b || null);
/** Scritture sicure: collega il movimento della banca e la ripartizione ai versamenti confermati. */
export async function collegaVersamenti() {
  const rows = []; const usati = new Set(); const togli = [];
  for (const a of analisiVersamenti()) {
    if (!a.rip || !(a.caso === 'ok' || a.caso === 'accettato')) continue;
    const p = a.mov.p; if (!p || usati.has(p.id)) continue;
    if (a.mov.stato === 'uno' || a.mov.stato === 'sposta' || (a.mov.stato === 'collegato' && !stessiRip(p.ripartito, a.rip))) { usati.add(p.id); rows.push({ col: 'pagamenti', id: p.id, data: Object.assign(senza(p), { quietanza: a.id, ripartito: a.rip }) }); }
    if (a.mov.stato === 'sposta') togli.push(a.mov.pq.id);
  }
  if (rows.length) await scrivi(rows);
  for (const id of togli) { IN_SCRITTURA.add(id); try { await store.remove('pagamenti', id); } finally { IN_SCRITTURA.delete(id); } }
  return rows.length;
}
const dentroAnno = d => +String(d).slice(0, 4) >= annoOggi();
const vaiVers = { area: 'conti', tab: 'conti', sub: 'verifica' };
export function dubbiVersamenti() {
  const out = [];
  for (const a of analisiVersamenti()) {
    if (!dentroAnno(a.D)) continue;
    const quale = `${a.v.doc.genere === 'avviso' ? 'Avviso del consulente' : 'Modello F24'} del ${fdt(a.D)} (${eu(a.tot)})`;
    const nota = a.note.length ? ' (' + a.note.join('; ') + ')' : '';
    if (a.caso === 'nonTorna') { out.push({ id: `f24-letto-${a.v.impronta}`, area: 'personale', testo: `${quale}: i totali del modello non tornano`, proposta: 'Lo leggo male (forse è una scansione): controlla il modello e registra il versamento a mano.', apri: vaiVers }); continue; }
    if (a.caso === 'lontano') { out.push({ id: `f24-data-${a.v.impronta}`, area: 'personale', testo: `${quale}: è lontano dalla scadenza del 16`, proposta: 'Pagato in ritardo o in anticipo (ravvedimento?): controlla con il consulente e registra il versamento a mano con il mese giusto.', apri: vaiVers }); continue; }
    if (a.caso === 'senzaCalcolo') { out.push({ id: `f24-calc-${a.v.impronta}`, area: 'personale', testo: `${quale}: non so quanto dovevi versare`, proposta: `Manca il bilancino delle paghe di ${P.nomeMese(P.mesePrec(a.D.slice(0, 7)))}: caricalo e il confronto si fa da solo.`, apri: { area: 'conti', tab: 'conti', sub: 'cedolini' } }); continue; }
    if (a.caso === 'diverso') {
      const rip = a.proposta; const testo = `${quale}: il versato non torna con il calcolato${nota}`;
      out.push({
        id: `f24-diff-${a.v.impronta}-${a.firma}`, area: 'personale', testo, dettagli: a.dettagli,
        proposta: rip ? `Prendo per buono il versato: ${rip.map(r => (r.tipo === 'f24' ? 'ritenute ' + P.nomeMese(r.periodo) : 'contributi ' + r.periodo.replace('-T', ', trimestre ')) + ' ' + eu(r.importo)).join(' e ')}. L'INPS calcola da sé i contributi agricoli: se torna con il suo avviso, conferma.` : 'Non riesco a dividere il versato fra i mesi: controlla con il consulente.',
        ...(rip ? { conferma: async () => { const r = S.paghe.find(x => x.id === 'vq-' + a.v.impronta); if (!r) return false; await store.put('paghe', r.id, Object.assign(senza(r), { accettato: { rip: rip.map(x => Object.assign({}, x, { saldo: true })), firma: a.firma, quando: today() } })); await collegaVersamenti(); return true; } } : {}),
        apri: vaiVers,
      });
      continue;
    }
    if (!a.rip) continue;
    if (a.mov.stato === 'piu') out.push({ id: `f24-mov-${a.v.impronta}`, area: 'personale', testo: `${quale}: torna con il calcolato, ma in banca ci sono ${a.mov.cand.length} movimenti uguali`, proposta: 'Scegli il movimento della banca di questo versamento.', alternative: a.mov.cand.map(p => ({ testo: `${fdt(p.data)} · ${eu(p.importo)}`, conferma: async () => { const q = S.pagamenti.find(x => x.id === p.id); if (!q || q.quietanza || S.pagamenti.some(x => x.quietanza === a.id)) return false; await store.put('pagamenti', q.id, Object.assign(senza(q), { quietanza: a.id, ripartito: a.rip })); return true; } })), apri: { area: 'conti', tab: 'conti', sub: 'pagamenti' } });
    if (a.mov.stato === 'nessuno' && today() > addDays(a.D, 10)) out.push({
      id: `f24-nomov-${a.v.impronta}`, area: 'personale', testo: `${quale}: torna con il calcolato, ma non trovo il movimento della banca`,
      proposta: `Registro il pagamento del ${fdt(a.D)} (${eu(a.tot)}) come versato con l'F24? Se l'estratto conto non è ancora caricato, caricalo prima.`,
      conferma: async () => { if (S.pagamenti.some(x => x.quietanza === a.id) || cerca(a.D, a.tot, a.id).length) return false; await store.put('pagamenti', 'pq-' + a.v.impronta, { tipo: a.rip.every(r => r.tipo === 'contributi') ? 'contributi' : 'f24', data: a.D, importo: a.tot, modalita: 'bonifico', fonte: a.v.doc.genere === 'avviso' ? 'avviso del consulente' : 'modello F24', descrizione: quale, quietanza: a.id, ripartito: a.rip }); return true; },
      apri: { area: 'conti', tab: 'conti', sub: 'pagamenti' },
    });
  }
  return out;
}

/* ================= scheda del dipendente dai documenti ================= */
export const CAMPI = { tipo: 'Tipo di contratto', inizio: 'Inizio del rapporto', scadContratto: 'Scadenza del contratto', scadPermesso: 'Scadenza del permesso di soggiorno', ricevutaFino: 'Ricevuta del rinnovo del permesso valida fino al', cessazione: 'Fine del rapporto', qualifica: 'Qualifica', qualificaIstat: 'Qualifica nella comunicazione UNILAV', livello: 'Livello' };
const CONFRONTA = new Set(['tipo', 'inizio', 'scadContratto', 'scadPermesso', 'cessazione']);
const FONTE = { cedolino: 'cedolino', unilav: 'comunicazione UNILAV', contratto: 'contratto di lavoro', permesso: 'permesso di soggiorno', cu: 'CU', scelta: 'scelta da te' };
export const nomeFonte = f => FONTE[f] || f;
export const valoreTxt = (campo, v) => (v == null || v === '' ? '—' : campo === 'tipo' ? (v === 'TD' ? 'a tempo determinato' : 'a tempo indeterminato') : /^\d{4}-\d{2}-\d{2}$/.test(v) ? fdt(v) : String(v));
const parole = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim().split(' ').filter(w => w.length >= 2);

/** A quale dipendente va un documento: per codice fiscale; altrimenti per nome intero, se è uno solo. */
export function dipDi(pd, dips = P.dipendenti()) {
  if (pd.dipScelto) return { dip: pd.dipScelto, come: 'scelta' };
  const doc = pd.doc || {}; const cfs = doc.cf ? [doc.cf] : doc.cfs || [];
  const perCf = dips.filter(d => d.cf && cfs.includes(d.cf));
  if (perCf.length === 1) return { dip: perCf[0].key, come: 'cf' };
  if (perCf.length > 1) return { ambigui: perCf };
  if (doc.cf) return { nessuno: true, motivo: 'codice fiscale di una persona senza cedolini' };
  const nome = ' ' + parole(pd.persona).join(' ') + ' ';
  const hit = dips.filter(d => { const ws = parole(d.nomeCed || d.nome); return ws.length >= 2 && ws.every(w => nome.includes(' ' + w + ' ')); });
  if (hit.length === 1) return { dip: hit[0].key, come: 'nome' };
  if (hit.length > 1) return { ambigui: hit };
  return { nessuno: true };
}
const scelteDi = k => ((S.paghe.find(x => x.id === 'ps-' + k) || {}).scelte) || {};
/** Scheda del dipendente: per ogni campo il valore, da dove viene e se due documenti non coincidono. */
export function scheda(d, dips = P.dipendenti(), pds = docPersonali()) {
  const fonti = [];
  const fine = d.ultimo ? P.finePeriodo(d.ultimo) : '';
  fonti.push({ fonte: 'cedolino', data: fine, id: 'ced', campi: { tipo: d.scadTD ? 'TD' : null, inizio: d.assunzione, scadContratto: d.scadTD, scadPermesso: d.scadPermesso, cessazione: d.cessazione, qualifica: d.qualifica, livello: d.livello } });
  const docs = pds.filter(x => x.esito === 'ok' && (dipDi(x, dips).dip === d.key));
  for (const x of docs) fonti.push({ fonte: x.doc.genere, data: x.doc.data || x.dataDoc || '', id: x.id, nomeFile: x.nomeFile, campi: x.doc.campi || {} });
  const scelte = scelteDi(d.key); const campi = {};
  for (const k of Object.keys(CAMPI)) {
    const c = fonti.filter(f => f.campi[k] != null && f.campi[k] !== '').map(f => ({ v: f.campi[k], fonte: f.fonte, data: f.data || '', id: f.id })).sort((a, b) => b.data.localeCompare(a.data) || (a.fonte === 'cedolino') - (b.fonte === 'cedolino') || a.id.localeCompare(b.id));
    if (!c.length) continue;
    const top = c[0]; let conf = null;
    if (CONFRONTA.has(k)) {
      // un documento senza data non si confronta (non si sa se è più vecchio o più nuovo del cedolino)
      const ced = c.find(x => x.fonte === 'cedolino'), doc = c.find(x => x.fonte !== 'cedolino' && x.data);
      const pari = top.data ? c.find(x => x !== top && x.data === top.data && x.v !== top.v) : null;
      if (ced && doc && ced.v !== doc.v && ced.data >= doc.data) conf = [ced, doc]; else if (pari) conf = [top, pari];
    }
    const o = { v: top.v, fonte: top.fonte, data: top.data, fonti: c };
    if (conf) {
      const firma = k + ':' + [...new Set(conf.map(x => String(x.v)))].sort().join('|'); const s = scelte[k];
      if (s && s.firma === firma) Object.assign(o, { v: s.v, fonte: 'scelta', data: s.quando });
      else Object.assign(o, { conflitto: conf, firma });
    } else { const ced = c.find(x => x.fonte === 'cedolino'); if (ced && top.fonte !== 'cedolino' && ced.v !== top.v && CONFRONTA.has(k)) o.nota = 'il cedolino non lo dice ancora'; }
    campi[k] = o;
  }
  if (campi.tipo && campi.tipo.v === 'TI' && campi.scadContratto && campi.scadContratto.fonte !== 'scelta' && campi.scadContratto.data <= campi.tipo.data) delete campi.scadContratto; // trasformato a tempo indeterminato
  return { dip: d.key, nome: d.nome, campi, docs };
}
export const docPersonali = () => S.paghe.filter(x => x.tipo === 'docPersonale');
export const schede = memo(() => { const dips = P.dipendenti(); const pds = docPersonali(); return dips.map(d => scheda(d, dips, pds)); }, () => [S.paghe, S.pagamenti, S.econfig]);
async function scegli(dip, campo, v, firma) {
  const r = S.paghe.find(x => x.id === 'ps-' + dip) || { tipo: 'schedaScelte', dip, scelte: {} };
  await store.put('paghe', 'ps-' + dip, Object.assign(senza(r), { tipo: 'schedaScelte', dip, scelte: Object.assign({}, r.scelte || {}, { [campo]: { v, firma, quando: today() } }) }));
  return true;
}
export function dubbiSchede() {
  const out = []; const dips = P.dipendenti(); const pds = docPersonali();
  const inForza = d => !(d.cessazione && d.cessazione < addDays(today(), -365));
  for (const d of dips.filter(inForza)) {
    const s = scheda(d, dips, pds);
    for (const [k, o] of Object.entries(s.campi)) {
      if (!o.conflitto) continue;
      const [a, b] = o.conflitto; const valori = [...new Set(o.fonti.filter(x => o.conflitto.some(y => y.v === x.v)).map(x => x.v))];
      out.push({
        id: `sd-${d.key}-${hash(o.firma)}`, area: 'personale', testo: `Scheda di ${d.nome}: ${CAMPI[k].toLowerCase()}, i documenti non coincidono`,
        dettagli: [[CAMPI[k], `${valoreTxt(k, a.v)} (${nomeFonte(a.fonte)}${a.data ? ' del ' + fdt(a.data) : ''})`, `${valoreTxt(k, b.v)} (${nomeFonte(b.fonte)}${b.data ? ' del ' + fdt(b.data) : ''})`]],
        proposta: `Vale ${valoreTxt(k, o.v)} (dal documento più recente)? Se è giusto l'altro, sceglilo; se il cedolino è vecchio, avvisa il consulente.`,
        conferma: () => scegli(d.key, k, o.v, o.firma),
        alternative: valori.filter(v => v !== o.v).map(v => ({ testo: 'Vale ' + valoreTxt(k, v), conferma: () => scegli(d.key, k, v, o.firma) })),
        apri: { area: 'conti', tab: 'conti', sub: 'dipendenti' },
      });
    }
  }
  for (const x of pds.filter(x => x.esito === 'ok')) {
    const r = dipDi(x, dips); if (!r.ambigui) continue;
    out.push({
      id: `pd-chi-${x.impronta}`, area: 'personale', testo: `${x.tipoDoc.replace(/-/g, ' ')} "${x.nomeFile}": di quale dipendente?`,
      proposta: `Ci sono ${r.ambigui.length} dipendenti con questo nome${x.doc.cf ? ' e lo stesso codice fiscale' : ' e nel documento non c\'è il codice fiscale'}: scegli quello giusto.`,
      alternative: r.ambigui.map(d => ({ testo: d.nome + (d.cf ? ' · ' + d.cf.slice(-5) : ''), conferma: async () => { const q = S.paghe.find(y => y.id === x.id); if (!q) return false; await store.put('paghe', q.id, Object.assign(senza(q), { dipScelto: d.key })); return true; } })),
      apri: { area: 'conti', tab: 'conti', sub: 'dipendenti' },
    });
  }
  return out;
}

/* ================= rate di mutui e finanziamenti ================= */
const PERIODI = [1, 2, 3, 4, 6, 12];
const ultimoGiorno = iso => iso === X.piuMesi(iso, 0, null, true);
/** Piani delle rate riconosciuti dai movimenti della banca: numero del mutuo, ogni quanti mesi, che giorno, importo. */
export const pianiRate = memo(rate, () => [S.econfig]);
function rate() {
  const mov = movimentiBanca().filter(m => !m.entrata && m.data).map(m => ({ m, r: X.rataMutuo(m.descrizione) })).filter(x => x.r);
  const grp = new Map();
  for (const x of mov) {
    const k = x.r.numero ? 'N' + x.r.numero.replace(/[^A-Z0-9]/gi, '') : 'I' + Math.round(N(x.m.importo) / 10) * 10;
    grp.set(k, [...(grp.get(k) || []), x]);
  }
  const out = [];
  for (const [chiave, xs0] of grp) {
    const xs = xs0.map(x => Object.assign({ quando: x.r.scadenza || x.m.data }, x)).sort((a, b) => a.quando.localeCompare(b.quando)).filter((x, i, a) => i === 0 || x.quando !== a[i - 1].quando);
    if (xs.length < 2) continue;
    const conNumero = chiave.startsWith('N');
    if (!conNumero && xs.length < 3) continue; // senza il numero del mutuo servono almeno tre rate uguali
    let mesi = null; const passi = [];
    for (let i = 1; i < xs.length; i++) { const g = X.mesiFra(xs[i - 1].quando, xs[i].quando); const dn = xs[i].r.rata && xs[i - 1].r.rata ? xs[i].r.rata - xs[i - 1].r.rata : 1; if (dn <= 0 || g % dn) { passi.push(null); continue; } passi.push(g / dn); }
    if (passi.some(p => p === null) || new Set(passi).size !== 1 || !PERIODI.includes(passi[0])) continue;
    mesi = passi[0];
    // mutuo finito (o estratti conto non caricati da tempo): due rate saltate e niente più proposta né scadenze
    if (X.piuMesi(xs[xs.length - 1].quando, Math.max(2 * mesi, 4)) < today()) continue;
    const imp = xs.map(x => r2(N(x.m.importo))); const ult = xs[xs.length - 1];
    if (!conNumero && Math.max(...imp) - Math.min(...imp) > 0.02 * Math.max(...imp)) continue;
    const giorni = xs.map(x => +x.quando.slice(8));
    const fineMese = xs.every(x => ultimoGiorno(x.quando));
    if (!fineMese && Math.max(...giorni) - Math.min(...giorni) > 3) continue;
    const giorno = fineMese ? null : +ult.quando.slice(8);
    const firma = `${chiave}|${mesi}|${fineMese ? 'f' : giorno}`;
    out.push({ chiave, numero: ult.r.numero || '', mesi, giorno, fineMese, importo: imp[imp.length - 1], variabile: Math.max(...imp) - Math.min(...imp) > 0.01, ultima: ult.quando, ultimaRata: ult.r.rata || null, residuo: ult.r.residuo ?? null, rate: xs.length, descrizione: ult.m.descrizione.slice(0, 80), firma, prossima: X.piuMesi(ult.quando, mesi, giorno, fineMese) });
  }
  return out.sort((a, b) => a.prossima.localeCompare(b.prossima));
}
export const pianiConfermati = () => S.econfig.filter(x => x.tipo === 'pianoRata');
const OGNI = { 1: 'ogni mese', 2: 'ogni due mesi', 3: 'ogni tre mesi', 4: 'ogni quattro mesi', 6: 'ogni sei mesi', 12: 'una volta l\'anno' };
export const ritmo = p => `${OGNI[p.mesi] || 'ogni ' + p.mesi + ' mesi'}, ${p.fineMese ? "l'ultimo giorno del mese" : 'il giorno ' + p.giorno}`;
export function dubbiRate() {
  const conf = new Map(pianiConfermati().map(x => [x.chiave, x]));
  return pianiRate().filter(p => !(conf.get(p.chiave) && conf.get(p.chiave).firma === p.firma)).map(p => ({
    id: `mu-${p.chiave}-${hash(p.firma)}`, area: 'conti', testo: `Rate di ${p.numero ? 'un mutuo, n. ' + p.numero : 'un mutuo o finanziamento'}: ${eu(p.importo)} ${ritmo(p)}`,
    proposta: `Le ho trovate ${p.rate} volte in banca (ultima il ${fdt(p.ultima)}${p.ultimaRata ? ', rata n. ' + p.ultimaRata : ''}${p.residuo != null ? ', importo scritto dalla banca accanto: ' + eu(p.residuo) : ''}). Metto nello scadenziario la prossima, il ${fdt(p.prossima)}${p.variabile ? ' (l\'importo cambia un po\' a ogni rata)' : ''}?`,
    conferma: async () => { await store.put('econfig', 'sm-' + p.chiave, { tipo: 'pianoRata', chiave: p.chiave, numero: p.numero, importo: p.importo, mesi: p.mesi, giorno: p.giorno, fineMese: p.fineMese, firma: p.firma, descrizione: p.descrizione, confermato: today() }); return true; },
    apri: { area: 'conti', tab: 'conti', sub: 'personale', el: 'pScad' },
  }));
}

/* ================= polizze ================= */
/** Polizze dai documenti e dalle fatture: una per numero (la più recente), con la prossima scadenza. */
export const polizze = memo(pol, () => [S.econfig, S.fatture]);
function pol() {
  const L = [];
  for (const x of S.econfig.filter(x => x.tipo === 'polizza' && x.esito === 'ok')) {
    const d = x.doc || {}; const sc = x.scelta || d.scadenza || null;
    L.push({ id: x.id, fonte: 'documento', numero: d.numero || '', compagnia: x.compagnia || '', decorrenza: d.decorrenza || null, scadenza: sc, pagatoFino: d.pagatoFino || null, tacito: d.tacito, premio: d.premio ?? null, incerta: !sc && d.scadenze ? d.scadenze : null, data: d.decorrenza || x.dataDoc || '', nomeFile: x.nomeFile });
  }
  for (const f of S.fatture || []) for (const r of f.righe || []) {
    const p = X.polizzaDaRiga(r.descrizione); if (!p || !p.al) continue;
    L.push({ id: 'ft-' + f.id, fonte: 'fattura', numero: p.numero, compagnia: f.controparte || '', decorrenza: p.dal, scadenza: null, pagatoFino: p.al, data: p.dal || f.data || '', nomeFile: 'fattura ' + (f.numero || '') });
  }
  const per = new Map();
  for (const p of L) { const k = p.numero ? 'n' + p.numero.replace(/[^A-Z0-9]/gi, '').toUpperCase() : 'c' + p.compagnia + '|' + (p.pagatoFino || p.scadenza); const o = per.get(k); if (!o || p.data > o.data) per.set(k, p); }
  const T = today();
  return [...per.values()].map(p => {
    let prossima = [p.pagatoFino, p.scadenza].filter(d => d && d >= T).sort()[0] || null;
    if (!prossima && p.tacito && p.scadenza) { let d = p.scadenza; for (let i = 0; i < 30 && d < T; i++) d = X.piuMesi(d, 12); prossima = d; p.rinnovata = true; }
    return Object.assign(p, { prossima });
  });
}
export function dubbiPolizze() {
  return S.econfig.filter(x => x.tipo === 'polizza' && x.esito === 'ok' && !x.scelta && x.doc && !x.doc.scadenza && Array.isArray(x.doc.scadenze)).map(x => ({
    id: `po-scad-${x.impronta}`, area: 'conti', testo: `Polizza ${x.doc.numero ? 'n. ' + x.doc.numero : '"' + x.nomeFile + '"'}${x.compagnia ? ' (' + x.compagnia + ')' : ''}: ho letto più scadenze`,
    proposta: 'Scegli la scadenza della polizza da mettere nello scadenziario.',
    alternative: x.doc.scadenze.map(d => ({ testo: fdt(d), conferma: async () => { const q = S.econfig.find(y => y.id === x.id); if (!q) return false; await store.put('econfig', q.id, Object.assign(senza(q), { scelta: d })); return true; } })),
    apri: { area: 'conti', tab: 'conti', sub: 'personale', el: 'pScad' },
  }));
}

/* ================= scadenziario ================= */
// { data, genere: contratto|permesso|f24|contributi|fondo|mutuo|polizza, titolo, testo, importo?, dip?, go }
const goPers = { tab: 'conti', sub: 'personale', el: 'pScad' };
const SCAD = { k: null, v: null };
export function scadenze({ da = today(), a = addDays(today(), 120) } = {}) {
  const k = [S.paghe, S.pagamenti, S.econfig, S.fatture, da, a];
  if (SCAD.k && k.every((x, i) => x === SCAD.k[i])) return SCAD.v;
  SCAD.k = k; SCAD.v = calcolaScadenze(da, a); return SCAD.v;
}
function calcolaScadenze(da, a) {
  const out = []; const dentro = d => d && d >= da && d <= a;
  const add = o => { if (dentro(o.data)) out.push(Object.assign({ go: goPers }, o)); };
  // contratti a termine e permessi di soggiorno (dipendenti con un cedolino negli ultimi 4 mesi)
  const recente = P.mesePrec(P.mesePrec(P.mesePrec(P.mesePrec(today().slice(0, 7)))));
  for (const s of schede()) {
    const d = P.dipendenti().find(x => x.key === s.dip); if (!d || (d.ultimo || '') < recente) continue;
    const c = s.campi; if (c.cessazione && c.cessazione.v <= today()) continue;
    if (c.scadContratto && !(c.tipo && c.tipo.v === 'TI' && c.tipo.data >= c.scadContratto.data)) add({ data: c.scadContratto.v, genere: 'contratto', titolo: 'Scade il contratto a termine · ' + s.nome, testo: `Da ${nomeFonte(c.scadContratto.fonte)}: decidi se prorogare o chiudere il rapporto.`, dip: s.dip, go: { tab: 'conti', sub: 'dipendenti' } });
    const ric = c.ricevutaFino && (!c.scadPermesso || c.ricevutaFino.v > c.scadPermesso.v) ? c.ricevutaFino : null;
    if (ric) add({ data: ric.v, genere: 'permesso', titolo: 'Scade la ricevuta del rinnovo del permesso · ' + s.nome, testo: 'Il permesso è in rinnovo: serve quello nuovo o una ricevuta aggiornata.', dip: s.dip, go: { tab: 'conti', sub: 'dipendenti' } });
    else if (c.scadPermesso) add({ data: c.scadPermesso.v, genere: 'permesso', titolo: 'Scade il permesso di soggiorno · ' + s.nome, testo: `Da ${nomeFonte(c.scadPermesso.fonte)}: il rinnovo va chiesto prima della scadenza.`, dip: s.dip, go: { tab: 'conti', sub: 'dipendenti' } });
  }
  // F24 del 16, contributi trimestrali, fondo pensione: dai bilancini; senza bilancino la data con l'importo da sapere
  const vers = P.versamenti();
  for (const v of vers) if (v.stato !== 'pagato' && v.stato !== 'pagato in più') add({ data: X.giornoUtile(v.scadenza), genere: v.tipo, titolo: (v.tipo === 'f24' ? 'F24 delle paghe · ritenute di ' : v.tipo === 'contributi' ? 'Contributi INPS agricoli · ' : 'TFR al fondo pensione · ') + v.nome, testo: v.stato === 'pagato in parte' ? `Dovuti ${eu(v.dovuto)}, registrati ${eu(v.pagato)}.` : `Da versare ${eu(v.dovuto)}.`, importo: r2(v.dovuto - v.pagato) });
  const ced = P.cedolini(); if (ced.length && ced.some(c => c.periodo >= recente)) {
    for (let m = da.slice(0, 7); m <= a.slice(0, 7); m = P.meseSucc(m)) {
      const sc = m + '-16'; const prec = P.mesePrec(m);
      if (!vers.some(v => v.tipo === 'f24' && v.scadenza.slice(0, 7) === m) && !P.bilanciniPaghe().some(b => b.periodo === prec)) add({ data: X.giornoUtile(sc), genere: 'f24', titolo: 'F24 delle paghe · ritenute di ' + P.nomeMese(prec), testo: `L'importo si sa quando arriva il bilancino delle paghe di ${P.nomeMese(prec)}.`, importo: null });
      const q = { '09': 1, '12': 2, '03': 3, '06': 4 }[m.slice(5)];
      if (q) { const y = +m.slice(0, 4) - (q >= 3 ? 1 : 0); const per = `${y}-T${q}`; if (!vers.some(v => v.tipo === 'contributi' && v.periodo === per)) add({ data: X.giornoUtile(sc), genere: 'contributi', titolo: `Contributi INPS agricoli · ${q}° trimestre ${y}`, testo: "L'importo lo calcola l'INPS: si sa con i bilancini del trimestre o con il suo avviso.", importo: null }); }
    }
  }
  // rate dei mutui confermate
  const trov = new Map(pianiRate().map(p => [p.chiave, p]));
  for (const c of pianiConfermati()) {
    const p = trov.get(c.chiave); let d = p ? p.prossima : null; if (!d) continue;
    for (let i = 0; i < 400 && d < da; i++) d = X.piuMesi(d, c.mesi, c.giorno, c.fineMese);
    for (let i = 0; i < 24 && d <= a; i++) { add({ data: d, genere: 'mutuo', titolo: `Rata del mutuo${c.numero ? ' n. ' + c.numero : ''}`, testo: `Circa ${eu(p.importo)}, ${ritmo(c)}.`, importo: p.importo }); d = X.piuMesi(d, c.mesi, c.giorno, c.fineMese); }
  }
  // polizze
  for (const p of polizze()) if (p.prossima) add({ data: p.prossima, genere: 'polizza', titolo: `Polizza${p.numero ? ' n. ' + p.numero : ''}${p.compagnia ? ' · ' + p.compagnia.replace(/-/g, ' ') : ''}`, testo: p.prossima === p.pagatoFino ? 'Finisce il periodo pagato: arriva la rata del premio.' : p.rinnovata ? 'Scadenza annuale (tacito rinnovo).' : 'Scade la polizza: rinnovala o disdici.', importo: p.premio ?? null });
  return out.sort((x, y) => x.data.localeCompare(y.data));
}
const ICONA = { contratto: 'file-text', permesso: 'id-card', f24: 'landmark', contributi: 'landmark', fondo: 'wallet', mutuo: 'banknote', polizza: 'shield-check' };
export const iconaScadenza = g => ICONA[g] || 'calendar';
/** Voci per l'agenda: le scadenze del giorno e, per contratti e permessi, gli avvisi a 60, 30 e 7 giorni (polizze a 30). */
export function vociAgenda(T, fine) {
  const out = [];
  for (const s of scadenze({ da: T, a: addDays(fine, 60) })) {
    const prima = s.genere === 'contratto' || s.genere === 'permesso' ? [60, 30, 7] : s.genere === 'polizza' ? [30] : [];
    const voce = (data, t, sub) => { if (data >= T && data <= fine) out.push({ data, area: 'personale', icn: iconaScadenza(s.genere), t, s: sub, go: s.go, late: false }); };
    voce(s.data, s.titolo, s.importo ? eu(s.importo) + ' · ' + s.testo : s.testo);
    for (const g of prima) voce(addDays(s.data, -g), `Fra ${g} giorni · ${s.titolo}`, 'Il ' + fdt(s.data) + ': ' + s.testo);
  }
  return out;
}
