// Originali dei documenti caricati nei Conti (fatture, bilancini, dichiarazioni IVA, cedolini, bilancini paghe,
// contabili ed estratti conto, elenchi delle fatture). Dalla 1.35.0 ogni file letto da "Carica documenti" ha la sua
// impronta SHA-256 (la stessa del catalogo dell'archivio sul PC, strumenti/archivio): la registrazione salvata tiene
// "imp" e l'elenco degli originali sta nella raccolta riservata "econfig" con id "do-<impronta>":
//   { tipo: 'originale', impronta, nome, kb, mime, caricato, copia: true|false, archivio: id del catalogo|null }
// copia = c'è una copia del file nell'app (allegati.js, id "conti/<impronta>": sul dispositivo e, se il titolare ha
// eseguito supabase/aggiornamento-documenti-conti.sql, anche online in una cartella che vede solo il titolare).
// Dal PC lo stesso file si apre dall'archivio con POST /apri e l'impronta.
import { S } from '../state.js';
import * as store from '../store.js';
import { N, today, okD, diff } from '../util.js';

export const PRE = 'do-';
export const idCopia = imp => 'conti/' + imp;
export const originale = imp => (imp && S.econfig.find(x => x.id === PRE + imp)) || null;
export const originali = () => S.econfig.filter(x => String(x.id).startsWith(PRE) && x.impronta);

/** Impronta SHA-256 in esadecimale, come hashlib nel catalogo del PC. */
export async function impronta(bytes) {
  const h = await crypto.subtle.digest('SHA-256', bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
  return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, '0')).join('');
}
const MIME = { pdf: 'application/pdf', xml: 'text/xml', p7m: 'application/pkcs7-mime', zip: 'application/zip', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', csv: 'text/csv', txt: 'text/plain', iva: 'text/plain', dat: 'text/plain', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png' };
export const mimeDi = nome => MIME[(String(nome || '').toLowerCase().match(/\.([a-z0-9]+)$/) || [])[1]] || 'application/octet-stream';

/** Dopo la lettura: segna l'impronta sugli esiti nuovi di un file (dal numero k0 in poi). */
export async function segna(out, k0, nome, bytes) {
  if (out.length <= k0) return;
  const nuovi = out.slice(k0).filter(x => !x.imp && x.tipo !== 'errore'); if (!nuovi.length) return;
  const imp = await impronta(bytes); const orig = { nome, bytes, mime: mimeDi(nome) };
  for (const x of nuovi) {
    x.imp = imp; x.orig = orig;
    if (x.f) x.f.imp = imp;
    if (x.righe && x.tipo === 'bonifici') x.righe.forEach(y => { y.imp = imp; });
  }
}

/** Tiene gli originali dei documenti salvati: copia nell'app (se si può) e riga nell'elenco "do-". */
export async function conserva(esiti) {
  const visti = new Map();
  for (const x of esiti) if (x.imp && x.orig && !visti.has(x.imp)) visti.set(x.imp, x.orig);
  if (!visti.size) return { n: 0, copie: 0 };
  const ALL = await import('../allegati.js');
  const rows = []; let copie = 0;
  for (const [imp, o] of visti) {
    const v = originale(imp);
    let copia = !!(v && v.copia);
    if (!copia) { try { await ALL.conservaRiservato(idCopia(imp), new Blob([o.bytes], { type: o.mime }), o.mime); copia = true; copie++; } catch (e) { console.warn('originale non conservato', e); } }
    if (v && v.copia === copia) continue;
    rows.push({ col: 'econfig', id: PRE + imp, data: Object.assign({}, v || {}, { tipo: 'originale', impronta: imp, nome: (v && v.nome) || o.nome, kb: Math.max(1, Math.round(o.bytes.length / 1024)), mime: o.mime, caricato: (v && v.caricato) || today(), copia, archivio: (v && v.archivio) || null }) });
  }
  if (rows.length) await store.bulkPut(rows.map(r => { const { id, ...data } = r.data; return { col: r.col, id: r.id, data }; }));
  return { n: visti.size, copie };
}

/* ---------------- dove si trovano i documenti nelle registrazioni ---------------- */
/** Ogni registrazione dei Conti che viene da un file: { k, col, id, campo, tipo, titolo, sub, file, imp, anno, data, fatt? }.
 *  campo = dove si scrive l'impronta ('' = sulla registrazione, 'bilancino'/'iva' = dentro bilanci[anno]). */
export function registrazioni() {
  const out = [];
  for (const f of S.fatture) if (f.file && f.fonte !== 'excel') out.push({ k: 'fatture|' + f.id, col: 'fatture', id: f.id, campo: '', tipo: 'Fattura', titolo: `${f.tipo === 'Vendita' ? 'Vendita' : 'Acquisto'} n. ${f.numero || '—'}`, sub: f.controparte || '', file: f.file, imp: f.imp || '', anno: +String(f.data || '').slice(0, 4) || null, data: f.data, fatt: f });
  for (const b of S.bilanci) {
    if (b.bilancino && b.bilancino.file) out.push({ k: 'bilanci|' + b.id + '|bilancino', col: 'bilanci', id: b.id, campo: 'bilancino', tipo: 'Bilancino', titolo: 'Bilancino ' + b.id, sub: b.bilancino.ditta || '', file: b.bilancino.file, imp: b.bilancino.imp || '', anno: +b.id, data: null });
    if (b.iva && b.iva.file) out.push({ k: 'bilanci|' + b.id + '|iva', col: 'bilanci', id: b.id, campo: 'iva', tipo: 'Dichiarazione IVA', titolo: "Dichiarazione IVA, anno d'imposta " + b.id, sub: b.iva.fonte || '', file: b.iva.file, imp: b.iva.imp || '', anno: +b.id, data: null });
  }
  for (const p of S.paghe) if (p.file && (p.tipo === 'cedolino' || p.tipo === 'totali' || p.tipo === 'bilancino')) out.push({ k: 'paghe|' + p.id, col: 'paghe', id: p.id, campo: '', tipo: p.tipo === 'bilancino' ? 'Bilancino paghe' : 'Cedolini', titolo: (p.tipo === 'bilancino' ? 'Bilancino paghe ' : p.tipo === 'totali' ? 'Totali dei cedolini ' : 'Cedolino ') + periodoT(p), sub: p.tipo === 'cedolino' ? p.nome || '' : '', file: p.file, imp: p.imp || '', anno: +p.anno || null, mese: +p.mese || null, data: null });
  for (const p of S.pagamenti) if (p.fonte && /\.(pdf|csv|xlsx?)$/i.test(p.fonte)) out.push({ k: 'pagamenti|' + p.id, col: 'pagamenti', id: p.id, campo: '', tipo: 'Pagamento', titolo: 'Pagamento del ' + (p.data || ''), sub: p.beneficiario || p.descrizione || '', file: p.fonte, imp: p.imp || '', anno: +String(p.data || '').slice(0, 4) || null, data: p.data });
  for (const e of S.econfig) {
    if (String(e.id).startsWith('el-') && e.file) out.push({ k: 'econfig|' + e.id, col: 'econfig', id: e.id, campo: '', tipo: 'Elenco fatture', titolo: `Elenco fatture ${e.tipo === 'Vendita' ? 'emesse' : 'ricevute'} ${e.anno}`, sub: '', file: e.file, imp: e.imp || '', anno: +e.anno || null, data: null });
    if (String(e.id).startsWith('bk-') && e.fonte && /\.(pdf|csv|xlsx?)$/i.test(e.fonte)) out.push({ k: 'econfig|' + e.id, col: 'econfig', id: e.id, campo: '', tipo: 'Movimento di banca', titolo: 'Movimento del ' + (e.data || ''), sub: e.descrizione || '', file: e.fonte, imp: e.imp || '', anno: +String(e.data || '').slice(0, 4) || null, data: e.data });
  }
  return out;
}
const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre', 'tredicesima', 'quattordicesima'];
const periodoT = p => (p.mese ? MESI[p.mese - 1] + ' ' : '') + (p.anno || '');

/** Le registrazioni raggruppate per file: un file (es. i cedolini di un mese) vale per più registrazioni. */
export function perFile() {
  const g = new Map();
  for (const r of registrazioni()) {
    const key = r.imp ? 'i:' + r.imp : 'f:' + r.tipo + '|' + r.file + '|' + (r.col === 'fatture' ? r.id : r.anno || '');
    if (!g.has(key)) g.set(key, { key, file: r.file, imp: r.imp, tipo: r.tipo, regs: [] });
    g.get(key).regs.push(r);
  }
  // file con lo stesso nome e senza impronta (es. "cedolini.pdf" di mesi diversi) restano separati per anno; i pagamenti per file
  return [...g.values()];
}

/* ---------------- catalogo dell'archivio sul PC (solo lettura) ---------------- */
// Aree del catalogo dove stanno i documenti dei Conti (strumenti/archivio/aree.json): fisco, fatture, banche, personale
export const AREE_CONTI = ['02', '03', '04', '05'];
const CAT = { docs: null, quando: 0, prova: null };
export const catalogoPronto = () => CAT.docs;
/** Scarica dal ponte l'elenco dei documenti delle aree dei Conti (pagine da 500). onPasso(n, totale). */
export async function caricaCatalogo(onPasso = () => { }) {
  const AD = await import('../views/archivio-dati.js');
  const prova = !!AD.conf().prova;
  if (CAT.docs && CAT.prova === prova && Date.now() - CAT.quando < 10 * 60e3) return CAT.docs;
  const docs = []; let fatti = 0, tot = 0;
  for (const area of AREE_CONTI) {
    for (let inizio = 0; ; inizio += 500) {
      const r = await AD.aspetta('/documenti' + AD.qs({ area, limite: 500, inizio, ordina: 'data', spariti: '' }));
      if (inizio === 0) tot += r.totale;
      docs.push(...r.documenti); fatti += r.documenti.length; onPasso(fatti, tot);
      if (!r.documenti.length || inizio + 500 >= r.totale) break;
    }
  }
  Object.assign(CAT, { docs, quando: Date.now(), prova });
  return docs;
}
export const svuotaCatalogo = () => { CAT.docs = null; };

/* ---------------- abbinamento fra registrazioni e documenti del catalogo ---------------- */
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const compatto = s => norm(s).replace(/ /g, '');
const VUOTE = new Set(['srl', 'spa', 'snc', 'sas', 'ss', 'soc', 'societa', 'coop', 'cooperativa', 'agricola', 'azienda', 'agr', 'di', 'e', 'del', 'della', 'dei', 'and', 'srls', 'sc', 'arl', 'scarl', 'ditta', 'esempio', 'fattura', 'fatt', 'eur', 'pdf', 'xml', 'p7m']);
const parole = s => new Set(norm(s).split(' ').filter(w => w.length >= 3 && !VUOTE.has(w) && !/^\d+$/.test(w)));
const importiDi = s => [...String(s || '').matchAll(/(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)\s?(?:EUR|€)/gi)].map(m => +m[1].replace(/\.(?=\d{3}\b)/g, '').replace(',', '.'));
const testoDoc = d => [d.nome_proposto, d.nome_file, d.descrizione].filter(Boolean).join(' ');
const nomeBase = s => String(s || '').toLowerCase().replace(/\.(pdf|xml|p7m|zip|xlsx?|csv|txt)$/g, '');

/** Punti di somiglianza fra una fattura (numero, controparte, data, totale) e un documento del catalogo, con i motivi. */
export function puntiFattura(x, d) {
  const T = testoDoc(d); let p = 0; const perche = [];
  const pc = parole(x.controparte || x.nome), pd = parole([d.controparte, d.nome_proposto].join(' '));
  const comuni = [...pc].filter(w => pd.has(w)).length; if (comuni) { p += 2 + Math.min(comuni, 3); perche.push('ditta'); }
  // il numero si cerca senza date e importi, che hanno cifre anche loro
  const senza = T.replace(/(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)\s?(?:EUR|€)/gi, ' ').replace(/\b\d{4}-\d{2}(-\d{2})?\b/g, ' ').replace(/\b\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}\b/g, ' ');
  const num = compatto(x.numero), pezzi = norm(x.numero).split(' ').filter(Boolean), tratti = norm(senza).replace(/ /g, '-');
  const come = pezzi.length > 1 ? pezzi.map((q, i) => (i ? q : q.replace(/^0+(?=.)/, ''))).join('[^0-9a-z]+') : num.replace(/^0+/, '');
  if (num.replace(/^0+/, '') && (new RegExp('(^|[^0-9a-z])0*' + come + '($|[^0-9a-z])').test(tratti) || (num.length >= 5 && compatto(senza).includes(num)))) { p += 5; perche.push('numero'); }
  if (okD(x.data) && d.data) { if (d.data.length === 10) { const g = Math.abs(diff(x.data, d.data)); if (g === 0) { p += 3; perche.push('data'); } else if (g <= 5) { p += 1; perche.push('data vicina'); } } else if (x.data.startsWith(d.data)) p += 1; }
  const tot = Math.abs(N(x.totale)); if (tot && importiDi(T).some(v => Math.abs(v - tot) <= 0.02)) { p += 3; perche.push('importo'); }
  // contabili, DDT e altri documenti dell'area fatture non sono la fattura
  if (d.tipo ? !/fattur|nota|parcell|ricevut|scontrin/i.test(d.tipo) : !String(d.codice || '').startsWith('03')) p -= 2;
  return { p, perche };
}

/** Documento del catalogo per un gruppo di registrazioni (stesso file): per impronta, poi per nome del file, poi per contenuto.
 *  Ritorna { d, come, punti } oppure null. */
export function trovaNelCatalogo(g, docs, idx = indice(docs)) {
  if (g.imp) { const d = idx.imp.get(g.imp); return d ? { d, come: 'stessa impronta', punti: 99 } : null; }
  const r0 = g.regs[0];
  const stessi = (idx.nome.get(nomeBase(g.file)) || []);
  const unici = [...new Map(stessi.map(d => [d.impronta, d])).values()];
  if (unici.length === 1) return { d: unici[0], come: 'stesso nome del file', punti: 20 };
  if (unici.length > 1) {
    // più file con lo stesso nome: si sceglie con l'anno (o la fattura)
    const sc = unici.map(d => ({ d, p: r0.fatt ? puntiFattura(r0.fatt, d).p : (r0.anno && String(d.data || d.anno || '').startsWith(String(r0.anno)) ? 3 : 0) + (r0.mese && String(d.data || '').slice(5, 7) === String(r0.mese).padStart(2, '0') ? 2 : 0) })).sort((a, b) => b.p - a.p);
    if (sc[0].p > 0 && (sc.length < 2 || sc[0].p > sc[1].p)) return { d: sc[0].d, come: 'stesso nome del file e ' + (r0.fatt ? 'stessi dati' : 'stesso periodo'), punti: 15 };
    return null;
  }
  if (!r0.fatt) return null;
  const sc = idx.fatture.map(d => Object.assign({ d }, puntiFattura(r0.fatt, d))).filter(x => x.p >= 9 && x.perche.includes('numero')).sort((a, b) => b.p - a.p);
  if (!sc.length || (sc.length > 1 && sc[1].p >= sc[0].p - 1)) return null;
  return { d: sc[0].d, come: sc[0].perche.join(', '), punti: sc[0].p };
}
export function indice(docs) {
  const imp = new Map(), nome = new Map(); const fatture = [];
  for (const d of docs) {
    imp.set(d.impronta, d);
    const k = nomeBase(d.nome_file); if (!nome.has(k)) nome.set(k, []); nome.get(k).push(d);
    if (/^03/.test(d.codice || '') || /fattur/i.test(d.tipo || '')) fatture.push(d);
  }
  return { imp, nome, fatture };
}

/** Proposte di collegamento per le registrazioni senza originale: [{ key, g, d, come, punti }]. */
export function proposteArchivio(docs) {
  const idx = indice(docs); const out = []; const usati = new Set();
  const gruppi = perFile().filter(g => !g.imp).sort((a, b) => (a.regs[0].fatt ? 1 : 0) - (b.regs[0].fatt ? 1 : 0));
  for (const g of gruppi) {
    const t = trovaNelCatalogo(g, docs, idx); if (!t) continue;
    const f = g.regs[0].fatt;
    // somiglianza fra la fattura e il documento: sotto 5 punti (per esempio solo il nome del file) va controllato
    const sim = f ? puntiFattura(f, t.d) : null;
    // lo stesso documento non va a due fatture diverse, salvo un PDF con più fatture (stesso nome, stessa ditta)
    if (f && usati.has(t.d.impronta) && !(t.come === 'stesso nome del file' && sim.p >= 5)) continue;
    if (f) usati.add(t.d.impronta);
    out.push(Object.assign({ key: g.key, g, dubbio: !!(f && sim.p < 5) }, t));
  }
  return out;
}
/** Registrazioni con impronta che il catalogo conosce (per contare quante si aprono dal PC). */
export const nelCatalogo = docs => { const idx = indice(docs); return perFile().filter(g => g.imp && idx.imp.has(g.imp)).length; };

/** Applica i collegamenti scelti: impronta sulle registrazioni, riga "do-" con il documento dell'archivio, collegamento della fattura. */
export async function applicaArchivio(scelte) {
  const LK = await import('../archivio-link.js');
  const rows = []; const bil = new Map(); let n = 0;
  for (const s of scelte) {
    const imp = s.d.impronta;
    for (const r of s.g.regs) {
      if (r.col === 'bilanci') { const b = bil.get(r.id) || JSON.parse(JSON.stringify(S.bilanci.find(x => x.id === r.id) || {})); if (b[r.campo]) b[r.campo].imp = imp; bil.set(r.id, b); n++; continue; }
      const x = (S[r.col] || []).find(y => y.id === r.id); if (!x) continue;
      const { id, ...data } = x; rows.push({ col: r.col, id, data: Object.assign(data, { imp }) }); n++;
    }
    const v = originale(imp);
    rows.push({ col: 'econfig', id: PRE + imp, data: Object.assign({ copia: false, caricato: today() }, v || {}, { tipo: 'originale', impronta: imp, nome: (v && v.nome) || s.d.nome_file, kb: Math.max(1, Math.round(N(s.d.dimensione) / 1024)), mime: mimeDi(s.d.nome_file), archivio: s.d.id }) });
  }
  for (const [id, b] of bil) { const { id: _, ...data } = b; rows.push({ col: 'bilanci', id, data }); }
  if (rows.length) await store.bulkPut(rows);
  for (const s of scelte) for (const r of s.g.regs) if (r.col === 'fatture' && !LK.collegatiA('fatture', r.id).some(x => x.impronta === s.d.impronta)) await LK.collega(s.d, 'fatture', r.id);
  return n;
}

/** Dopo un caricamento: se il ponte dell'archivio risponde, collega da solo le fatture al documento del catalogo con la stessa impronta. */
export async function collegaDaSolo(fids) {
  try {
    const AD = await import('../views/archivio-dati.js'); if (AD.conf().prova) return 0;
    const LK = await import('../archivio-link.js'); let n = 0;
    const per = new Map(); for (const id of fids) { const f = S.fatture.find(x => x.id === id); if (f && f.imp) { if (!per.has(f.imp)) per.set(f.imp, []); per.get(f.imp).push(f.id); } }
    for (const [imp, ids] of per) {
      let d; try { d = await AD.aspetta('/documenti/' + imp); } catch (e) { if (e.spento) return n; continue; }
      for (const id of ids) if (!LK.collegatiA('fatture', id).some(x => x.impronta === imp)) { await LK.collega(d, 'fatture', id); n++; }
    }
    return n;
  } catch (e) { console.warn(e); return 0; }
}

/** Per le fatture dell'elenco che mancano: il documento dell'archivio del PC che le somiglia di più.
 *  Ritorna Map(riga dell'elenco → { d, p, perche, altri, certo }). Solo lettura. */
export function proposteMancanti(mancanti, docs) {
  const idx = indice(docs); const caricate = new Set(S.fatture.map(f => f.imp).filter(Boolean)); const out = new Map();
  const pool = idx.fatture.filter(d => !caricate.has(d.impronta));
  for (const r of mancanti) {
    const x = { numero: r.numero, controparte: r.nome, data: r.data, totale: r.totale };
    // basta il numero con la ditta, oppure data esatta e importo, oppure ditta e data esatta (nomi senza numero né importo: "certo" no)
    const buona = s => (s.p >= 8 && (s.perche.includes('numero') || (s.perche.includes('data') && s.perche.includes('importo')))) || (s.p >= 6 && s.perche.includes('ditta') && s.perche.includes('data'));
    const sc = pool.map(d => Object.assign({ d }, puntiFattura(x, d))).filter(buona).sort((a, b) => b.p - a.p);
    if (sc.length) out.set(r.riga, { d: sc[0].d, p: sc[0].p, perche: sc[0].perche, altri: sc.length - 1, certo: sc[0].p >= 8 && (sc.length === 1 || sc[1].p < sc[0].p - 1) });
  }
  return out;
}
