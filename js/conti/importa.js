// Importazione dei documenti: fatture (XML, P7M, PDF, ZIP del cassetto fiscale), dichiarazioni IVA, bilancini,
// vecchio file Excel del conto economico. Prima si leggono e si mostra l'anteprima, poi si salvano.
import { S } from '../state.js';
import * as store from '../store.js';
import { leggiFileFattura } from './fatture-parse.js';
import { leggiDichiarazioneIva, riepilogoIva, IVA_VOCI } from './iva-parse.js';
import { leggiBilancino, interpreta, calcolaCe } from './bilancino-parse.js';
import { leggiPdf, testoPagina } from './pdftext.js';
import { unzip } from './zip.js';
import { leggiXlsx, serialeAData, colLett } from './xlsx.js';
import { classifica, REGOLE_PREDEFINITE, RETTIFICA } from './regole.js';
import { cfg, regole, pivaPropria, bilancio } from './dati.js';
import { CE, SP, CESPITI } from './schema.js';
import { DATI } from './analisi.js';

const r2 = v => Math.round(v * 100) / 100;
export function idFattura(chiave) { let h = 0x811c9dc5; for (let i = 0; i < chiave.length; i++) { h ^= chiave.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return 'f' + h.toString(36) + chiave.length.toString(36); }
const lat1 = b => String.fromCharCode(...b.subarray(0, Math.min(b.length, 400)));

/** Riconosce il tipo di documento e lo legge. Ritorna un elenco di esiti { tipo, nome, ... }. */
export async function leggiDocumento(nome, bytes, out = []) {
  bytes = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const low = nome.toLowerCase(); const testa = lat1(bytes);
  try {
    if (testa.startsWith('PK')) {
      if (/\.xlsx$|\.xlsm$/.test(low)) { out.push(Object.assign({ tipo: 'excel', nome }, await leggiExcel(bytes))); return out; }
      const z = await unzip(bytes);
      for (const [n, b] of z) if (b && !n.startsWith('__MACOSX') && /\.(xml|p7m|pdf|txt|iva)$/i.test(n)) await leggiDocumento(n.split('/').pop(), b, out);
      return out;
    }
    if (testa.startsWith('%PDF')) {
      const pagine = await leggiPdf(bytes);
      const t = pagine.slice(0, 2).map(testoPagina).join('\n');
      const vuoto = !pagine.some(p => p.chars.length);
      if (vuoto) {
        // bilancino "disegnato": le lettere sono forme, si riconoscono confrontandole con l'alfabeto
        try { const b = await leggiBilancino(bytes, cfg().contiUtente || {}); if (b.dati.conti.length) { out.push({ tipo: 'bilancino', nome, anno: b.anno, ditta: b.ditta, perRiga: b.perRiga, conti: b.conti, controlli: b.controlli, dati: snellisci(b.dati), ocr: true }); return out; } } catch (e) { console.warn(e); }
        out.push({ tipo: 'errore', nome, errore: 'PDF senza testo (probabilmente una scansione): carica il file Excel già compilato oppure inserisci i valori a mano nel conto economico.' }); return out;
      }
      if (/SITUAZIONE\s+CONTABILE|SITUAZIONE\s+AL|TOTALE\s+COSTI|TOTALE\s+RICAVI/i.test(t) && /\d{2}\/\d{2}\/\d{3}/.test(t)) {
        const b = await leggiBilancino(bytes, cfg().contiUtente || {});
        out.push({ tipo: 'bilancino', nome, anno: b.anno, ditta: b.ditta, perRiga: b.perRiga, conti: b.conti, controlli: b.controlli, dati: snellisci(b.dati) }); return out;
      }
      // dichiarazione IVA: i quadri VE/VF/VL possono stare anche dopo molte pagine di frontespizio
      const tutto = pagine.map(testoPagina).join('\n');
      const nRighi = (tutto.match(/\bV[EFLJX]\s?\d{1,2}\b/g) || []).length;
      const pareIva = !/Cedente\/prestatore/.test(t) && (nRighi >= 5 || (/(dichiarazione\s+(annuale\s+)?i\.?v\.?a|modello\s+iva|IVA\s*20\d\d)/i.test(tutto) && nRighi >= 2));
      if (pareIva) {
        const r = await leggiDichiarazioneIva(nome, bytes);
        if (Object.keys(r.valori).length) { out.push(Object.assign({}, r, riepilogoIva(r.valori), { tipo: 'iva', fonte: r.tipo, nome, anno: r.anno || annoDaNome(nome) })); return out; }
        out.push({ tipo: 'errore', nome, errore: 'Sembra una dichiarazione IVA, ma non ho trovato gli importi dei quadri VE, VF e VL. Prova con il file telematico (.iva o .txt) che ti ha dato il commercialista.', bytes });
        return out;
      }
      try { for (const f of await leggiFileFattura(nome, bytes)) out.push({ tipo: 'fattura', nome, f }); }
      catch (e) { out.push({ tipo: 'errore', nome, errore: 'Non riconosciuto: non sembra né una fattura, né una dichiarazione IVA, né un bilancino. Se sai cos\'è, scegli qui sotto come leggerlo.', bytes, forza: true }); }
      return out;
    }
    if (/<\?xml|FatturaElettronica/.test(testa) || /\.(xml|p7m)$/.test(low) || testa.startsWith('0')) {
      for (const f of await leggiFileFattura(nome, bytes)) out.push({ tipo: 'fattura', nome, f });
      return out;
    }
    // file telematico della dichiarazione IVA
    const txt = new TextDecoder('windows-1252').decode(bytes);
    if (/V[A-Z]\d{6}/.test(txt)) { const r = await leggiDichiarazioneIva(nome, bytes); out.push(Object.assign({}, r, riepilogoIva(r.valori), { tipo: 'iva', fonte: r.tipo, nome, anno: r.anno || annoDaNome(nome) })); return out; }
    out.push({ tipo: 'errore', nome, errore: 'formato non riconosciuto' });
  } catch (e) { out.push({ tipo: 'errore', nome, errore: e.message || String(e), bytes, forza: true }); }
  return out;
}
// "IVA2025", "IVA_2025", "Modello IVA 2025" nel nome del file = anno d'imposta 2024
const annoDaNome = n => { const m = /IVA[\s_-]*(20\d\d)/i.exec(n); return m ? +m[1] - 1 : null; };
/** Rilegge un file scegliendo il tipo (quando non è stato riconosciuto da solo). */
export async function leggiComeTipo(nome, bytes, tipo) {
  if (tipo === 'iva') { const r = await leggiDichiarazioneIva(nome, bytes); if (!Object.keys(r.valori).length) throw new Error('Nessun importo dei quadri VE, VF, VL trovato nel file.'); return Object.assign({}, r, riepilogoIva(r.valori), { tipo: 'iva', fonte: r.tipo, nome, anno: r.anno || annoDaNome(nome) }); }
  if (tipo === 'bilancino') { const b = await leggiBilancino(bytes, cfg().contiUtente || {}); if (!b.dati.conti.length) throw new Error('Nessun conto trovato nel file.'); return { tipo: 'bilancino', nome, anno: b.anno, ditta: b.ditta, perRiga: b.perRiga, conti: b.conti, controlli: b.controlli, dati: snellisci(b.dati) }; }
  throw new Error('Tipo non gestito');
}
const snellisci = d => ({ anno: d.anno, ditta: d.ditta, blocchi: d.blocchi.map(b => ({ numero: b.numero, attivita: b.attivita, totali: b.totali, utile: b.utile })), conti: d.conti.map(c => ({ blocco: c.blocco, sezione: c.sezione, conto: c.conto, descrizione: c.descrizione, valori: c.valori, dubbi: c.dubbi, dettagli: c.dettagli })) });

/* ---------------- fatture ---------------- */
function incompleta(f) { return !f.controparte || (Math.abs(f.imponibile || 0) < 0.005 && Math.abs(f.totale || 0) > 0.005) || !String(f.controllo || '').startsWith('OK'); }

/** Prepara i record delle fatture lette (tipo, controparte, segno, categorie). */
export function preparaFatture(lette) {
  let propria = pivaPropria();
  if (!propria) {
    const em = lette.filter(f => f.emessaDaNoi && f.pivaFornitore).map(f => f.pivaFornitore);
    const conta = {}; (em.length ? em.map(p => [p, 1]) : lette.flatMap(f => [[f.pivaFornitore, 1], [f.pivaCliente, 1.01]])).forEach(([p, w]) => { if (p) conta[p] = (conta[p] || 0) + w; });
    propria = Object.entries(conta).sort((a, b) => b[1] - a[1]).map(x => x[0])[0] || '';
  }
  const reg = regole();
  return {
    propria, records: lette.map(f => {
      const s = f.segno; const vendita = !!propria && f.pivaFornitore === propria;
      const tipo = vendita ? 'Vendita' : 'Acquisto'; const controparte = vendita ? f.cliente : f.fornitore; const piva = vendita ? f.pivaCliente : f.pivaFornitore;
      const scad = f.pagamenti.map(p => p.scadenza).filter(Boolean).sort();
      return {
        id: idFattura(f.chiave), chiave: f.chiave, data: f.data, tipo, controparte, piva, tipoDoc: f.tipoDoc, numero: f.numero,
        imponibile: s * f.imponibile, iva: s * f.iva, totale: s * (f.totale || 0), pagamento: (f.pagamenti[0] || {}).modalita || '', scadenza: scad[scad.length - 1] || null,
        controllo: f.controllo, file: f.file, fonte: f.fonte, caricata: new Date().toISOString().slice(0, 10),
        righe: f.righe.map(r => ({ codice: r.codice, descrizione: r.descrizione, categoria: classifica(r.descrizione, controparte, reg, tipo), quantita: r.quantita != null ? s * r.quantita : null, um: r.um, prezzo: r.prezzo, sconto: r.sconto, aliquota: r.aliquota, importo: s * (r.importo || 0), ddt: r.ddt })),
      };
    }),
  };
}
/** Salva le fatture: salta i doppioni, sostituisce quelle già presenti ma incomplete tenendo le categorie scelte a mano. */
export async function salvaFatture(lette) {
  const { propria, records } = preparaFatture(lette);
  const presenti = new Map(S.fatture.map(f => [f.id, f]));
  const rows = []; let nuove = 0, doppie = 0, corrette = 0; const visti = new Set();
  for (const r of records) {
    if (visti.has(r.id)) { doppie++; continue; } visti.add(r.id);
    const old = presenti.get(r.id);
    if (old) {
      if (incompleta(old) && String(r.controllo).startsWith('OK')) {
        const man = new Map((old.righe || []).filter(x => x.catManuale).map(x => [x.codice + '|' + x.descrizione, x.categoria]));
        r.righe.forEach(x => { const c = man.get(x.codice + '|' + x.descrizione); if (c) { x.categoria = c; x.catManuale = true; } });
        corrette++; rows.push({ col: 'fatture', id: r.id, data: r });
      } else doppie++;
      continue;
    }
    nuove++; rows.push({ col: 'fatture', id: r.id, data: r });
  }
  if (rows.length) await store.bulkPut(rows.map(x => { const { id, ...data } = x.data; return { col: 'fatture', id, data }; }));
  if (propria && !cfg().piva) await store.put('econfig', 'cfg', Object.assign({}, cfg(), { piva: propria }));
  return { nuove, doppie, corrette };
}
/** Riapplica le regole a tutte le righe non corrette a mano. */
export async function riapplicaRegole() {
  const reg = regole(); const rows = []; let n = 0;
  for (const f of S.fatture) {
    let cambiata = false;
    const righe = (f.righe || []).map(r => { if (r.catManuale) return r; const c = classifica(r.descrizione, f.controparte, reg, f.tipo); if (c !== r.categoria) { cambiata = true; n++; return Object.assign({}, r, { categoria: c }); } return r; });
    if (cambiata) { const { id, ...data } = f; rows.push({ col: 'fatture', id, data: Object.assign(data, { righe }) }); }
  }
  if (rows.length) await store.bulkPut(rows);
  return n;
}
/** Ricalcola Acquisto/Vendita dopo aver cambiato la P.IVA dell'azienda. */
export async function ricalcolaTipi(piva) {
  const rows = [];
  for (const f of S.fatture) {
    const [pf] = String(f.chiave || '').split('|');
    const vendita = pf === piva; const tipo = vendita ? 'Vendita' : 'Acquisto';
    if (tipo !== f.tipo) { const { id, ...data } = f; rows.push({ col: 'fatture', id, data: Object.assign(data, { tipo }) }); }
  }
  if (rows.length) await store.bulkPut(rows);
  return rows.length;
}

/* ---------------- bilancino e IVA ---------------- */
const VOCI_BILANCINO = [8, 9, 10, 11, 12, 13, 14, 15, 20, 21, 22, 23, 24, 25, 30, 31, 32, 33, 34, 35, 36, 37, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 52, 53, 54, 55, 57, 58, 59, 61, 63, 64, 65, 66, 73, 74, 75, 76, 77, 84, 85, 87, 88, 89, 90, 102];
async function salvaAnno(y, fn) { const b = bilancio(y) || { anno: y }; const { id, ...data } = b; const nuovo = fn(JSON.parse(JSON.stringify(data))); nuovo.anno = y; await store.put('bilanci', String(y), nuovo); }
export async function salvaBilancino(res, anno) {
  const y = anno || res.anno; if (!y) throw new Error('Anno del bilancino non riconosciuto: indicalo.');
  await salvaAnno(y, b => {
    b.ce = b.ce || {}; b.fonteCe = b.fonteCe || {};
    for (const r of VOCI_BILANCINO) { if (res.perRiga[r] != null) { b.ce[r] = res.perRiga[r]; b.fonteCe[r] = 'bilancino'; } else if (b.fonteCe[r] === 'bilancino' || b.fonteCe[r] === 'excel') { delete b.ce[r]; delete b.fonteCe[r]; } }
    b.bilancino = { file: res.nome, caricato: new Date().toISOString().slice(0, 10), ditta: res.ditta, dati: res.dati, controlli: res.controlli };
    return b;
  });
}
/** Riabbina i conti del bilancino salvato (dopo una modifica dell'abbinamento di un conto). */
export async function riabbinaBilancino(y) {
  const b = bilancio(y); if (!b || !b.bilancino || !b.bilancino.dati) return;
  const { perRiga } = calcolaCe(b.bilancino.dati, cfg().contiUtente || {});
  await salvaAnno(y, x => { for (const r of VOCI_BILANCINO) { if (perRiga[r] != null) { x.ce[r] = perRiga[r]; x.fonteCe[r] = 'bilancino'; } else if (x.fonteCe && x.fonteCe[r] === 'bilancino') { delete x.ce[r]; delete x.fonteCe[r]; } } return x; });
}
export async function salvaIva(res, anno) {
  const y = anno || res.anno; if (!y) throw new Error(`Non ho trovato l'anno della dichiarazione ${res.nome}: scrivilo nella casella "Anno d'imposta" e premi di nuovo Salva.`);
  await salvaAnno(y, b => { b.iva = { righi: res.valori, voci: res.voci, controlli: res.controlli, fonte: res.fonte, file: res.nome, caricato: new Date().toISOString().slice(0, 10), avvisi: res.avvisi }; return b; });
}

/* ---------------- vecchio file Excel ---------------- */
const IVA_RIGHE = { 7: 've_imp', 8: 've_iva', 9: 've_agr', 10: 've_esenti', 11: 've50', 13: 'vf_imp', 14: 'vf_amm', 15: 'vf_esenti', 16: 'vf_iva', 18: 'vl1', 19: 'vl2', 21: 'vl8', 22: 'vx1', 23: 'vx5' };
const numero = v => (typeof v === 'number' && isFinite(v) ? v : null);
async function leggiExcel(bytes) {
  const W = await leggiXlsx(bytes);
  if (!W.CE || !W.Anagrafica) throw new Error('Il file Excel non è il modello di conto economico e stato patrimoniale (mancano i fogli CE e Anagrafica).');
  const A = W.Anagrafica; const y0 = numero(A.C20) || 2023; const anni = [y0, y0 + 1, y0 + 2]; const colAnno = ['D', 'E', 'F'];
  const azienda = {}; const campiAz = { 5: 'nome', 6: 'forma', 7: 'titolare', 8: 'iva', 9: 'cf', 10: 'ateco', 11: 'indirizzo', 12: 'citta', 13: 'telefono', 14: 'email', 15: 'regimeIva', 16: 'regimeContabile', 17: 'commercialista' };
  for (const [r, k] of Object.entries(campiAz)) if (A['C' + r] != null && A['C' + r] !== '') azienda[k] = String(A['C' + r]);
  const anniOut = {};
  anni.forEach((y, j) => {
    const c = colAnno[j]; const b = { ce: {}, sp: {}, cespiti: {}, dim: {}, iva: null };
    for (const x of CE) if (x.in) { const v = numero(W.CE[c + x.row]); if (v !== null && v !== 0) b.ce[x.row] = v; }
    if (W.SP) for (const x of SP) if (x.in) { const v = numero(W.SP[c + x.row]); if (v !== null && v !== 0) b.sp[x.row] = v; }
    if (W.Cespiti) { const base = [3, 7, 11][j]; for (const x of CESPITI) if (x.row && !x.sum) { const o = { c: numero(W.Cespiti[colLett(base) + x.row]), f: numero(W.Cespiti[colLett(base + 1) + x.row]), a: numero(W.Cespiti[colLett(base + 3) + x.row]) }; if (o.c || o.f || o.a) b.cespiti[x.row] = o; } }
    if (W.IVA) { const voci = {}; for (const [r, k] of Object.entries(IVA_RIGHE)) { const v = numero(W.IVA[c + r]); if (v !== null) voci[k] = v; } if (Object.keys(voci).length) b.iva = { voci, fonte: 'Excel', controlli: [] }; }
    for (const [r, k] of [[28, 'ula'], [29, 'sau'], [30, 'capi']]) { const v = numero(A[c + r]); if (v !== null && v !== 0) b.dim[k] = v; }
    const AA = W['Analisi agricola'];
    if (AA) { const lab = {}; for (const [ref, v] of Object.entries(AA)) if (ref.startsWith('C') && typeof v === 'string') lab[v.trim()] = ref.slice(1); const mapL = { "Vacche da latte (numero medio presenti nell'anno)": 'vacche', 'di cui vacche in lattazione (media)': 'vacche_latt', "Latte prodotto nell'anno (litri)": 'latte_prod', 'Latte venduto – correzione manuale (litri)': 'latte_ven', 'di cui superficie a foraggere (ha)': 'sup_for', 'Costo figurativo del lavoro familiare (€)': 'lav_fam', 'Remunerazione figurativa del capitale proprio (%)': 'tasso_cap' }; b.analisi = {}; for (const [l, k] of Object.entries(mapL)) { const r = lab[l]; const v = r ? numero(AA[c + r]) : null; if (v !== null) b.analisi[k] = v; } }
    const pieno = Object.keys(b.ce).length || Object.keys(b.sp).length || Object.keys(b.cespiti).length || b.iva || Object.keys(b.dim).length;
    if (pieno) anniOut[y] = b;
  });
  // fatture e regole salvate nei fogli "Fatture..."
  const fatture = []; let regoleX = null;
  const F = W.Fatture, R = W['Fatture-Righe'], C = W['Fatture-Categorie'];
  const tabella = (sh, chiave) => {
    if (!sh) return [];
    const righe = {}; for (const [ref, v] of Object.entries(sh)) { const m = /^([A-Z]+)(\d+)$/.exec(ref); (righe[m[2]] = righe[m[2]] || {})[m[1]] = v; }
    const nums = Object.keys(righe).map(Number).sort((a, b) => a - b);
    const h = nums.find(n => Object.values(righe[n]).includes(chiave)); if (!h) return [];
    const head = righe[h]; const out = [];
    for (const n of nums.filter(n => n > h)) { const o = {}; for (const [col, name] of Object.entries(head)) o[name] = righe[n][col]; out.push(o); }
    return out;
  };
  const d = v => (typeof v === 'number' ? serialeAData(v) : typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null);
  const per = {};
  for (const g of tabella(F, 'Chiave')) {
    if (!g.Chiave) continue;
    per[g.Chiave] = { id: idFattura(g.Chiave), chiave: g.Chiave, data: d(g.Data), tipo: g.Tipo || 'Acquisto', controparte: g['Fornitore / controparte'] || '', piva: String(g['P.IVA'] || ''), tipoDoc: g['Tipo doc.'] || '', numero: String(g.Numero ?? ''), imponibile: numero(g.Imponibile) || 0, iva: numero(g.IVA) || 0, totale: numero(g['Totale documento']) || 0, pagamento: g.Pagamento || '', scadenza: d(g.Scadenza), controllo: g['Controllo righe'] || '', file: g.File || '', fonte: 'excel', righe: [] };
  }
  const visti = new Set();
  for (const g of tabella(R, 'Chiave fattura')) {
    const f = per[g['Chiave fattura']]; if (!f || String(g.Descrizione || '').startsWith(RETTIFICA)) continue;
    const k = JSON.stringify([g['Chiave fattura'], g.Descrizione, g.Importo, g['Cod. articolo'], g.DDT, g['Quantità']]);
    if (visti.has(k + f.righe.length)) continue; visti.add(k + f.righe.length);
    f.righe.push({ codice: String(g['Cod. articolo'] ?? ''), descrizione: String(g.Descrizione ?? ''), categoria: g.Categoria || 'Da classificare', quantita: numero(g['Quantità']), um: g.UM || '', prezzo: numero(g['Prezzo unitario']), sconto: g.Sconto || '', aliquota: g['% IVA'] ?? '', importo: numero(g.Importo) || 0, ddt: g.DDT || '' });
  }
  fatture.push(...Object.values(per));
  if (C) { const t = tabella(C, 'Parola chiave'); if (t.length) regoleX = t.filter(g => g.Categoria && (g['Parola chiave'] || g['Fornitore o cliente (facoltativo)'] || g['Fornitore (facoltativo)'])).map(g => [String(g['Parola chiave'] || ''), String(g['Fornitore o cliente (facoltativo)'] || g['Fornitore (facoltativo)'] || ''), String(g.Categoria), String(g.Tipo || '')]); }
  return { anni: anniOut, azienda, fatture, regole: regoleX };
}
export async function salvaExcel(res, { sovrascrivi = true } = {}) {
  let n = 0;
  for (const [y, b] of Object.entries(res.anni)) {
    await salvaAnno(+y, x => {
      x.ce = Object.assign({}, sovrascrivi ? {} : x.ce, b.ce); x.sp = Object.assign({}, sovrascrivi ? {} : x.sp, b.sp); x.cespiti = Object.assign({}, x.cespiti || {}, b.cespiti);
      x.fonteCe = Object.assign({}, x.fonteCe || {}); for (const r of Object.keys(b.ce)) x.fonteCe[r] = 'excel';
      if (b.iva && !(x.iva && x.iva.righi)) x.iva = b.iva;
      x.dim = Object.assign({}, x.dim || {}, b.dim); if (b.analisi) x.analisi = Object.assign({}, x.analisi || {}, b.analisi);
      return x;
    }); n++;
  }
  const rows = res.fatture.filter(f => !S.fatture.some(x => x.id === f.id)).map(f => { const { id, ...data } = f; return { col: 'fatture', id, data }; });
  if (rows.length) await store.bulkPut(rows);
  const c = Object.assign({}, cfg());
  if (res.regole && res.regole.length && !(c.regole && c.regole.length)) c.regole = res.regole;
  const piva = String(res.azienda.iva || '').replace(/\D/g, ''); if (piva.length >= 11 && !c.piva) c.piva = piva.slice(-11);
  c.anagrafica = Object.assign({}, res.azienda, c.anagrafica || {});
  await store.put('econfig', 'cfg', c);
  return { anni: n, fatture: rows.length };
}
export { IVA_VOCI, REGOLE_PREDEFINITE, DATI, interpreta };
