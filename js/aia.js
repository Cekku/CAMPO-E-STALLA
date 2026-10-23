// Report di Si@lleva (AIA) in PDF: lettura e importazione nella stalla.
// Report riconosciuti:
//  - "Sintetico individuale ultimo controllo": per vacca matricola, n. aziendale, razza, lattazione, data parto,
//    controllo (latte, grasso, proteine, cellule, urea, lattosio, caseina, linear score), stato riproduttivo
//  - "Scheda di riepilogo del controllo" (prestampato): nome, asciutte con data, prossima operazione (parto, asciutta, fecondazione)
//  - "Parametri zootecnici aziendali": andamento mensile della mandria ai controlli
// I PDF sono prodotti da Microsoft Reporting Services con impaginazione fissa: le colonne si riconoscono dal bordo destro delle parole.
import { parole } from './conti/pdftext.js';

const MATR = /^[A-Z]{2}\d{9,13}$/;
const nIt = s => { if (s === undefined || s === null || s === '') return null; const t = String(s).replace(/\s/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.'); const v = parseFloat(t); return isFinite(v) ? v : null; };
const dIt = s => { const m = String(s || '').match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/); return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null; };
export const normMatr = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

function righe(pagina) {
  const ws = parole(pagina, { xTol: 1.5, yTol: 2 }).sort((a, b) => a.top - b.top || a.x0 - b.x0);
  const out = [];
  for (const w of ws) { const r = out[out.length - 1]; if (r && Math.abs(r.top - w.top) < 3) r.ws.push(w); else out.push({ top: w.top, ws: [w] }); }
  out.forEach(r => r.ws.sort((a, b) => a.x0 - b.x0));
  return out;
}
const testoRiga = r => r.ws.map(w => w.text).join(' ');
// assegna le parole alle colonne (bordo destro più vicino, entro la tolleranza)
function colonne(ws, COL, tol = 7) {
  const out = {};
  for (const w of ws) {
    let best = null, bd = tol + 1;
    for (const [k, x] of Object.entries(COL)) { const d = Math.abs(w.x1 - x); if (d < bd) { bd = d; best = k; } }
    if (best && bd <= tol) out[best] = out[best] ? out[best] + ' ' + w.text : w.text;
  }
  return out;
}

export function tipoReport(pagine) {
  const t = pagine.slice(0, 1).map(p => righe(p).slice(0, 25).map(testoRiga).join('\n')).join('\n').toUpperCase();
  if (/SINTETICO INDIVIDUALE/.test(t)) return 'sintetico';
  if (/SCHEDA DI RIEPILOGO DEL CONTROLLO/.test(t)) return 'prestampato';
  if (/PARAMETRI ZOOTECNICI AZIENDALI/.test(t)) return 'parametri';
  if (/SINTETICO COLLETTIVO/.test(t)) return 'collettivo';
  if (/STATISTICA RIPRODUTTIVA/.test(t)) return 'fe01';
  if (/BENESSERE ANIMALE/.test(t)) return 'benessere';
  return null;
}

/* ---------- Sintetico individuale ultimo controllo ---------- */
const COL_SINT = { nAz: 133, etaParto: 155, ascPrec: 178, nLatt: 193, dataParto: 236, paAbt: 260, diffParto: 285, ggLatt: 313, ana: 342, evm: 373, diffCell: 407, latte: 441, grasso: 473, proteine: 506, grPr: 539, cellule: 567, ls: 595, caseina: 628, lattosio: 661, urea: 692, stato: 706, parch: 723, gg1Ins: 755, ggConc: 784, nFec: 811 };
function sintetico(pagine) {
  let data = null; const capi = [];
  for (const p of pagine) {
    for (const r of righe(p)) {
      if (!data && r.top < 70) { const d = r.ws.map(w => dIt(w.text)).find(Boolean); if (d) data = d; }
      const iM = r.ws.findIndex(w => MATR.test(w.text) && w.x0 < 120); if (iM < 0) continue;
      const razza = r.ws.slice(0, iM).map(w => w.text).join('');
      const c = colonne(r.ws.slice(iM + 1), COL_SINT);
      capi.push({
        matricola: r.ws[iM].text, razza, nAz: c.nAz ? String(parseInt(c.nAz, 10)) : '', nLatt: nIt(c.nLatt), dataParto: dIt(c.dataParto), ggLatt: nIt(c.ggLatt),
        etaParto: nIt(c.etaParto), ana: nIt(c.ana), evm: nIt(c.evm), latte: nIt(c.latte), grasso: nIt(c.grasso), proteine: nIt(c.proteine), cellule: nIt(c.cellule),
        ls: nIt(c.ls), caseina: nIt(c.caseina), lattosio: nIt(c.lattosio), urea: nIt(c.urea), stato: (c.stato || '').trim(), parcheggiata: c.parch === 'P',
        gg1Ins: nIt(c.gg1Ins), ggConc: nIt(c.ggConc), nFec: nIt(c.nFec),
      });
    }
  }
  return { tipo: 'sintetico', data, capi };
}

/* ---------- Scheda di riepilogo del controllo (prestampato) ---------- */
const COL_PRE = { nAz: 143, nLatt: 160, latte: 191, grasso: 218, proteine: 246, cellule: 278, giorni: 306, lattEff: 334, evmLatte: 609, opData: 812, op: 826 };
function anno(ddmm, rif) {
  const m = String(ddmm || '').match(/^(\d{1,2})\/(\d{1,2})$/); if (!m || !rif) return null;
  const y = +rif.slice(0, 4); const mk = yy => `${yy}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  const lim = new Date(Date.parse(rif) - 90 * 864e5).toISOString().slice(0, 10);
  return mk(y) < lim ? mk(y + 1) : mk(y);
}
function prestampato(pagine) {
  let data = null; const capi = [];
  for (const p of pagine) {
    let last = null;
    for (const r of righe(p)) {
      if (!data && r.top < 70) { const d = r.ws.filter(w => w.x0 > 600).map(w => dIt(w.text)).find(d => d && d >= '2000'); if (d) data = d; }
      const iM = r.ws.findIndex(w => MATR.test(w.text) && w.x0 < 120);
      if (iM < 0) {
        // riga del nome sotto la matricola
        if (last && r.top - last.top < 16 && r.ws.every(w => w.x1 < 125) && !last.nome) last.nome = testoRiga(r).trim();
        continue;
      }
      const rest = r.ws.slice(iM + 1);
      const mid = rest.filter(w => w.x0 >= 160 && w.x0 < 305); const midT = mid.map(w => w.text).join('');
      let asciutta = null, ultCtrl = null, usa = rest;
      if (/ASCIU/i.test(midT)) { const m = midT.match(/(\d{1,2})\/(\d{1,2})\/?(\d{4})/); asciutta = m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null; usa = rest.filter(w => !mid.includes(w)); }
      else if (/CONTR/i.test(midT)) { const m = midT.match(/(\d{1,2})\/(\d{1,2})(\d{4})/); ultCtrl = m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null; usa = rest.filter(w => !mid.includes(w)); }
      const c = colonne(usa, COL_PRE);
      last = {
        matricola: r.ws[iM].text, razza: r.ws.slice(0, iM).map(w => w.text).join(''), top: r.top, nAz: c.nAz ? String(parseInt(c.nAz, 10)) : '', nLatt: nIt(c.nLatt),
        latte: nIt(c.latte), grasso: nIt(c.grasso), proteine: nIt(c.proteine), cellule: nIt(c.cellule), ggLatt: nIt(c.giorni), lattEff: nIt(c.lattEff),
        asciutta, ultCtrl, opRaw: c.op || '', opDataRaw: c.opData || '', nome: '',
      };
      capi.push(last);
    }
  }
  capi.forEach(c => { c.prossima = c.op || c.opRaw ? { op: c.opRaw, data: anno(c.opDataRaw, data) } : null; delete c.top; });
  return { tipo: 'prestampato', data, capi };
}

/* ---------- Parametri zootecnici aziendali ---------- */
const PAR = ['presenti', 'controllate', 'asciutte', 'latte', 'evm', 'grasso', 'proteine', 'nLatt', 'ggLatt', 'interparto', 'durataAsciutta', 'partoConcepimento', 'etaMedia', 'etaPrimoParto', 'gravidePrimipare', 'gravidePluripare', 'fecGravidanza', 'fecGravPrimipare', 'fecGravPluripare', 'fecArtificiale', 'altro'];
function parametri(pagine) {
  const storia = [];
  for (const p of pagine) for (const r of righe(p)) {
    const t = r.ws.map(w => w.text); const d = dIt(t[0]); if (!d) continue;
    const nums = t.slice(1).map(nIt); if (nums.length < 20 || nums.some(x => x === null)) continue;
    // solo la tabella dei bovini da latte: presenti interi, EVM in kg, grasso e proteine plausibili
    if (!Number.isInteger(nums[0]) || nums[4] < 3000 || nums[5] < 2 || nums[5] > 7 || nums[6] < 2 || nums[6] > 5) continue;
    const o = { data: d }; PAR.forEach((k, i) => { if (i < nums.length) o[k] = nums[i]; }); storia.push(o);
  }
  return { tipo: 'parametri', data: storia.length ? storia[storia.length - 1].data : null, storia };
}

export function leggiReport(pagine) {
  const t = tipoReport(pagine);
  if (t === 'sintetico') return sintetico(pagine);
  if (t === 'prestampato') return prestampato(pagine);
  if (t === 'parametri') return parametri(pagine);
  return { tipo: t, data: null, capi: [] };
}

/* ---------- piano di importazione ---------- */
export const STATI_RIPR = { G: 'Gravida', F: 'Fecondata', NI: 'Non ancora da fecondare', MI: 'Mai fecondata', V: 'Vuota' };
export const OPERAZ = { P: 'Parto', A: 'Messa in asciutta', F: 'Fecondazione', D: 'Diagnosi di gravidanza' };
const RAZZA = { '02': 'Frisona', '00': 'Incrocio' };
const nome = s => s ? s.replace(/\s+/g, ' ').trim() : '';

// S: archivio dell'app; reports: risultati di leggiReport; uid: generatore di id
export function pianoImport(S, reports, uid) {
  const ops = []; const R = { nuovi: 0, aggiornati: 0, controlli: 0, parti: 0, asciutte: 0, storia: 0, dataCF: null, nonTrovati: 0 };
  const sint = reports.filter(r => r.tipo === 'sintetico'), pre = reports.filter(r => r.tipo === 'prestampato'), par = reports.filter(r => r.tipo === 'parametri');
  const byM = new Map();
  const add = (x, k) => { const m = normMatr(x.matricola); const o = byM.get(m) || { matricola: x.matricola }; o[k] = x; byM.set(m, o); };
  sint.forEach(r => r.capi.forEach(x => add(x, 's'))); pre.forEach(r => r.capi.forEach(x => add(x, 'p')));
  const dataS = sint.map(r => r.data).filter(Boolean).sort().pop() || null, dataP = pre.map(r => r.data).filter(Boolean).sort().pop() || null;
  R.dataCF = dataS || dataP;
  const evCapo = new Map(); S.eventi.forEach(e => { if (!evCapo.has(e.capoId)) evCapo.set(e.capoId, []); evCapo.get(e.capoId).push(e); });
  const vicino = (a, b, g) => Math.abs(Date.parse(a) - Date.parse(b)) <= g * 864e5;
  const capiM = new Map(S.capi.map(c => [normMatr(c.matricola), c]));
  for (const [m, x] of byM) {
    const s = x.s || {}, p = x.p || {};
    let c = capiM.get(m); const nuovo = !c;
    const base = c ? (({ id: _id, ...r }) => r)(c) : { matricola: x.matricola, sesso: 'F' };
    const id = c ? c.id : uid();
    if (!base.numero && (s.nAz || p.nAz)) base.numero = s.nAz || p.nAz;
    if (!base.razza && RAZZA[s.razza || p.razza]) base.razza = RAZZA[s.razza || p.razza];
    const nm = nome(p.nome); if (!base.nome && nm) base.nome = nm;
    const ev = evCapo.get(id) || []; const nuoviEv = [];
    const dataParto = s.dataParto || null;
    if (dataParto && !ev.some(e => e.tipo === 'Parto' && vicino(e.data, dataParto, 7))) { nuoviEv.push({ id: 'aia-parto-' + id + '-' + dataParto, data: { capoId: id, data: dataParto, tipo: 'Parto', note: 'da Si@lleva' } }); R.parti++; }
    if (p.asciutta && !ev.some(e => e.tipo === 'Messa in asciutta' && vicino(e.data, p.asciutta, 7))) { nuoviEv.push({ id: 'aia-asc-' + id + '-' + p.asciutta, data: { capoId: id, data: p.asciutta, tipo: 'Messa in asciutta', note: 'da Si@lleva' } }); R.asciutte++; }
    // il sintetico riporta l'ultimo controllo della vacca, che può essere vecchio: il prestampato lo segnala ("ULT. CONTROLLO gg/mm aaaa")
    const dCF = p.ultCtrl || (s.latte !== null && s.latte !== undefined ? dataS : null) || (p.latte !== null && p.latte !== undefined ? dataP : null);
    const q = s.latte !== null && s.latte !== undefined ? s : p;
    if (dCF && !ev.some(e => e.tipo === 'Controllo funzionale' && e.data === dCF)) {
      const d = { capoId: id, data: dCF, tipo: 'Controllo funzionale', kg: q.latte, fonte: 'Si@lleva' };
      ['grasso', 'proteine', 'cellule', 'urea', 'lattosio', 'caseina', 'ls'].forEach(k => { if (q[k] !== null && q[k] !== undefined) d[k] = q[k]; });
      if (q.ggLatt !== null && q.ggLatt !== undefined) d.dim = q.ggLatt;
      nuoviEv.push({ id: 'aia-cf-' + id + '-' + dCF, data: d }); R.controlli++;
    }
    // lattazioni: allinea il conteggio con quello dell'AIA
    const nL = s.nLatt ?? p.nLatt;
    if (nL !== null && nL !== undefined) { const parti = ev.filter(e => e.tipo === 'Parto').length + nuoviEv.filter(e => e.data.tipo === 'Parto').length; const prec = Math.max(0, nL - parti); if (+(base.lattazioniPrecedenti || 0) !== prec) base.lattazioniPrecedenti = prec; }
    base.aia = Object.assign({}, base.aia || {}, {
      data: R.dataCF, parto: dataParto || (base.aia && base.aia.parto) || null, nLatt: nL ?? null,
      ...(x.s ? { stato: s.stato || '', parcheggiata: !!s.parcheggiata, evm: s.evm, ana: s.ana, ls: s.ls, gg1Ins: s.gg1Ins, ggConc: s.ggConc, nFec: s.nFec } : {}),
      ...(x.p ? { prossima: p.prossima && p.prossima.data ? p.prossima : null, nomeAia: p.nome || '' } : {}),
    });
    const { id: _x, ...prima } = c || {};
    if (nuovo || JSON.stringify(prima) !== JSON.stringify(base)) { ops.push({ col: 'capi', id, data: base }); nuovo ? R.nuovi++ : R.aggiornati++; }
    nuoviEv.forEach(e => ops.push({ col: 'eventi', id: e.id, data: e.data }));
  }
  if (par.length) {
    const cfg = S.config.find(c => c.id === 'aia') || {}; const map = new Map((cfg.storia || []).map(s => [s.data, s]));
    par.forEach(r => r.storia.forEach(s => { if (!map.has(s.data)) R.storia++; map.set(s.data, s); }));
    const storia = [...map.values()].sort((a, b) => a.data.localeCompare(b.data));
    const { id: _i, ...resto } = cfg;
    ops.push({ col: 'config', id: 'aia', data: Object.assign(resto, { storia, aggiornato: new Date().toISOString() }) });
  }
  return { ops, R };
}
