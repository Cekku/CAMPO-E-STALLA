// Lettura delle fatture: FatturaPA XML (anche firmate .p7m) e PDF
// (visualizzazione standard dell'Agenzia delle Entrate, stampa TeamSystem/GAMMA, prospetto del latte del caseificio).
import { leggiPdf, righeParole, testo } from './pdftext.js';

export const NOTE_CREDITO = new Set(['TD04', 'TD08']);
const DATA = /^\d{2}-\d{2}-\d{4}$/;
const NUM = /^-?\d{1,3}(\.\d{3})*(,\d+)?$|^-?\d+(,\d+)?$/;
const DATA_SL = /^\d{2}\/\d{2}\/\d{4}$/;

export function numIt(s) {
  s = String(s ?? '').trim(); if (!s) return null;
  const neg = s.startsWith('-') || s.endsWith('-');
  s = s.replace(/^-+|-+$/g, '').replace(/\./g, '').replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const v = parseFloat(s); return neg ? -v : v;
}
const iso = (d, m, y) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const valida = s => { const t = Date.parse(s + 'T00:00:00Z'); return isFinite(t) && new Date(t).toISOString().slice(0, 10) === s ? s : null; };
export const dataIt = s => { const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(String(s).trim()); return m ? valida(iso(m[1], m[2], m[3])) : null; };
export const dataSl = s => { const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(s).trim()); return m ? valida(iso(m[1], m[2], m[3])) : null; };
const r2 = v => Math.round(v * 100) / 100;

function campiAnagrafica(righe, xMin, xMax) {
  const campi = {}; let ultimo = null;
  for (const r of righe) {
    const t = testo(r.filter(w => xMin <= w.x0 && w.x0 < xMax)).trim();
    if (!t) continue;
    const m = /^([A-Za-zàèéìòù /.]+?):\s*(.*)$/.exec(t);
    if (m && m[1].length < 40) { ultimo = m[1].trim().toLowerCase(); campi[ultimo] = m[2].trim(); }
    else if (['denominazione', 'cognome nome', 'nome cognome'].includes(ultimo)) campi[ultimo] += ' ' + t;
  }
  return campi;
}

const INDIRIZZO = /^(VIA|V\.LE|VIALE|PIAZZA|P\.ZZA|LOC\.?|LOCALIT|STRADA|FRAZ|CORSO|C\.SO|BORGO|\d{5})\b/i;
function nomeSuPiuRighe(righeTesto) {
  let nome = '', prec = 0;
  for (const t of righeTesto) {
    if (!t || INDIRIZZO.test(t) || /^(PI|P\.I|CF|C\.F)\b/i.test(t)) break;
    if (nome && prec >= 30) nome += t; else if (nome) nome += ' ' + t; else nome = t;
    prec = t.length;
  }
  return nome.trim();
}
function ancora(riga, txt, lato = 'x1', dopo = null) {
  for (const w of riga) if (w.text === txt && (dopo === null || w.x0 > dopo)) return w[lato];
  return null;
}
function assegnaNumeri(riga, ancore, tol = 30) {
  const out = {}; const keys = Object.keys(ancore);
  for (const w of riga) {
    if (!NUM.test(w.text)) continue;
    const nome = keys.reduce((b, k) => Math.abs(ancore[k] - w.x1) < Math.abs(ancore[b] - w.x1) ? k : b, keys[0]);
    if (Math.abs(ancore[nome] - w.x1) <= tol && !(nome in out)) out[nome] = w;
  }
  return out;
}
const idx = (arr, fn) => { const i = arr.findIndex(fn); return i < 0 ? null : i; };

function leggiGamma(pagine) {
  const fatt = { righe: [], riepiloghi: [], pagamenti: [], avvisi: [], emessaDaNoi: true };
  const usate = [];
  pagine.forEach((righe, k) => {
    if (usate.length < k) return;
    const iH = idx(righe, r => testo(r).includes('COD.CLIENTE') && testo(r).includes('PAG.'));
    let pag = 1;
    if (iH !== null && iH + 1 < righe.length) {
      const xPag = ancora(righe[iH], 'PAG.', 'x0');
      const vals = righe[iH + 1].filter(w => /^\d+$/.test(w.text) && xPag && w.x0 >= xPag - 10);
      pag = vals.length ? parseInt(vals[0].text) : 1;
    }
    if (k > 0 && pag === 1) return;
    usate.push(righe);
  });
  const p1 = usate[0];
  const iH = idx(p1, r => testo(r).includes('COD.CLIENTE'));
  if (iH === null) throw new Error('intestazione della fattura non trovata');
  const iSp = idx(p1, r => r.some(w => w.text.toUpperCase() === 'SPETT.LE')) ?? 0;
  const wsp = p1[iSp].find(w => w.text.toUpperCase() === 'SPETT.LE'); const xSp = wsp ? wsp.x0 : 300;
  const sinistra = p1.slice(iSp, iH).map(r => testo(r.filter(w => w.x0 < xSp - 5)));
  const destra = p1.slice(iSp + 1, iH).map(r => testo(r.filter(w => w.x0 >= xSp - 5)));
  fatt.fornitore = nomeSuPiuRighe(sinistra.filter(Boolean));
  const m = /PI:\s*(\d{11})/.exec(sinistra.join(' ')); fatt.pivaFornitore = m ? m[1] : '';
  fatt.cliente = nomeSuPiuRighe(destra.filter(Boolean));
  const hdr = p1[iH], val = p1[iH + 1] || [];
  const centri = {};
  for (const [parola, nome] of [['PARTITA', 'piva'], ['NUMERO', 'numero'], ['DATA', 'data'], ['PAG.', 'pag']]) { const w = hdr.find(w => w.text === parola); if (w) centri[nome] = w.x0; }
  const tmp = {};
  for (const w of val) {
    const ks = Object.keys(centri); if (!ks.length) break;
    const d = k => w.x0 >= centri[k] - 15 ? Math.abs(centri[k] - w.x0) : 9999;
    const nome = ks.reduce((b, k) => d(k) < d(b) ? k : b, ks[0]);
    (tmp[nome] = tmp[nome] || []).push(w.text);
  }
  fatt.pivaCliente = (tmp.piva || []).find(t => /^\d{11}$/.test(t)) || '';
  fatt.numero = (tmp.numero || []).join(' ');
  fatt.data = (tmp.data || []).filter(t => DATA_SL.test(t)).map(dataSl)[0] || null;
  const testo1 = p1.map(testo).join('\n');
  fatt.tipoDoc = /NOTA\s+(DI\s+)?CREDITO/i.test(testo1) ? 'TD04' : 'TD01';
  const iCp = idx(p1, r => testo(r).includes('CONDIZIONI') && testo(r).includes('PAGAMENTO'));
  let modo = '';
  if (iCp !== null && iCp + 1 < p1.length) { const xB = ancora(p1[iCp], 'BANCA', 'x0') || 9999; modo = testo(p1[iCp + 1].filter(w => w.x0 < xB - 5)); }
  let ddt = '', voce = null, ultimoTop = null;
  for (const righe of usate) {
    const iT = idx(righe, r => testo(r).includes('ARTICOLO') && testo(r).includes('U.M.'));
    if (iT === null) continue;
    const h = righe[iT];
    const xDesc = (ancora(h, 'ARTICOLO') || 90) + 12;
    const xUm = ancora(h, 'U.M.', 'x0');
    const ancore = {};
    for (const [k, v] of [['qta', ancora(h, "QUANTITA'")], ['pu', ancora(h, 'UNITARIO')], ['sc1', ancora(h, 'SC.1%')], ['sc2', ancora(h, 'SC.2%')], ['tot', ancora(h, 'NETTO')], ['iva', ancora(h, 'IVA', 'x1', xUm)]]) if (v !== null) ancore[k] = v;
    for (const r of righe.slice(iT + 1)) {
      const t = testo(r);
      if (t.includes('IMPONIBILE') && t.includes('AL.IVA')) break;
      if (t.startsWith('*') || t.includes('Copia della fattura') || t.includes('disponibile nella') || t.includes("dell'Agenzia")) { voce = null; continue; }
      const md = /D\.d\.T\.\s*N\.\s*(\S+)\s+del\s+(\d{2}\/\d{2}\/\d{4})/.exec(t);
      if (md) { ddt = `${md[1]} del ${md[2].replace(/\//g, '-')}`; voce = null; continue; }
      const nums = assegnaNumeri(r, ancore); const usati = new Set(Object.values(nums));
      const cod = r.filter(w => !usati.has(w) && w.x0 < xDesc - 3).map(w => w.text);
      const um = r.filter(w => !usati.has(w) && xUm !== null && Math.abs(w.x0 - xUm) < 8).map(w => w.text);
      const desc = r.filter(w => !usati.has(w) && w.x0 >= xDesc - 3 && (xUm === null || w.x0 < xUm - 8)).map(w => w.text);
      if (nums.tot) {
        const sc = ['sc1', 'sc2'].filter(k => nums[k]).map(k => `-${nums[k].text}%`).join(' ');
        voce = { codice: cod.join(' '), descrizione: desc.join(' '), quantita: nums.qta ? numIt(nums.qta.text) : null, um: um.join(' '), prezzo: nums.pu ? numIt(nums.pu.text) : null, sconto: sc, aliquota: nums.iva ? nums.iva.text : '', importo: numIt(nums.tot.text) || 0, ddt };
        fatt.righe.push(voce); ultimoTop = r[0].top;
      } else if (voce && desc.length && ultimoTop !== null && r[0].top - ultimoTop > 0 && r[0].top - ultimoTop < 13) {
        voce.descrizione += ' ' + desc.join(' '); ultimoTop = r[0].top;
      } else voce = null;
    }
  }
  for (const righe of usate) {
    righe.forEach((r, i) => {
      const t = testo(r);
      if (t.includes('IMPONIBILE') && t.includes('AL.IVA')) {
        const anc = {}; const al = ancora(r, 'AL.IVA');
        for (const [k, v] of [['imponibile', ancora(r, 'IMPONIBILE')], ['aliquota', al], ['imposta', ancora(r, 'IVA', 'x1', al || 0)]]) if (v !== null) anc[k] = v;
        fatt.riepiloghi = [];
        for (const r2_ of righe.slice(i + 1)) {
          const t2 = testo(r2_); if (t2.includes('BOLLI') || t2.includes('TOTALE')) break;
          const nums = assegnaNumeri(r2_, anc, 35);
          if (nums.imponibile && nums.aliquota) fatt.riepiloghi.push({ aliquota: numIt(nums.aliquota.text), imponibile: numIt(nums.imponibile.text), imposta: nums.imposta ? numIt(nums.imposta.text) : 0 });
        }
      }
      if (t.trim() === 'SCADENZE') {
        fatt.pagamenti = [];
        for (const r2_ of righe.slice(i + 1, i + 12)) { const mm = /^\d+\)\s+([\d.,]+)\s+(\d{2}\/\d{2}\/\d{4})/.exec(testo(r2_)); if (mm) fatt.pagamenti.push({ modalita: modo, scadenza: dataSl(mm[2]), importo: numIt(mm[1]) }); }
      }
    });
  }
  if (fatt.pagamenti.length) fatt.totale = r2(fatt.pagamenti.reduce((t, p) => t + (p.importo || 0), 0));
  else if (modo) fatt.pagamenti = [{ modalita: modo, scadenza: null, importo: null }];
  return fatt;
}

function leggiLatte(pagine) {
  const fatt = { righe: [], riepiloghi: [], pagamenti: [], avvisi: [], emessaDaNoi: true };
  const righe = pagine[0];
  const iSp = idx(righe, r => r.some(w => w.text.toLowerCase() === 'spett.le'));
  const wsp = iSp !== null ? righe[iSp].find(w => w.text.toLowerCase() === 'spett.le') : null; const xSp = wsp ? wsp.x0 : 290;
  let pSx = '', pDx = '';
  for (const r of righe) r.forEach((w, k) => {
    if (['P.I.', 'P.IVA', 'P.I'].includes(w.text) && k + 1 < r.length && /^\d{11}$/.test(r[k + 1].text)) {
      if (w.x0 < xSp - 10 && !pSx) pSx = r[k + 1].text; else if (w.x0 >= xSp - 10 && !pDx) pDx = r[k + 1].text;
    }
  });
  let sinistra = righe.slice(0, iSp || 8).map(r => testo(r.filter(w => w.x0 < xSp - 10)));
  sinistra = sinistra.filter(t => t && !/^\d+-\d+/.test(t));
  fatt.fornitore = nomeSuPiuRighe(sinistra); fatt.pivaFornitore = pSx;
  fatt.cliente = iSp !== null && righe[iSp + 1] ? testo(righe[iSp + 1].filter(w => w.x0 >= xSp - 10)) : '';
  fatt.pivaCliente = pDx;
  const tx = righe.map(testo).join('\n');
  const m = /(Fattura|Nota di credito)\s+n\.\s*(\S+)\s+del\s+(\d{2}\/\d{2}\/\d{4})/i.exec(tx);
  fatt.numero = m ? m[2] : ''; fatt.data = m ? dataSl(m[3]) : null;
  fatt.tipoDoc = m && m[1].toLowerCase().startsWith('nota') ? 'TD04' : 'TD01';
  const iT = idx(righe, r => r.length && r[0].text === 'Descrizione' && testo(r).includes('Imponibile'));
  if (iT === null) throw new Error('tabella delle righe non trovata');
  const h = righe[iT]; const wUm = h.find(w => w.text === 'U.M.');
  const ancore = {};
  for (const [k, v] of [['qta', ancora(h, "Quantita'")], ['pu', ancora(h, 'U.', 'x1', wUm.x1)], ['iva', ancora(h, 'IVA')], ['tot', ancora(h, 'Imponibile')]]) if (v !== null) ancore[k] = v;
  const totali = {};
  for (const r of righe.slice(iT + 1)) {
    const t = testo(r);
    if (t.startsWith('Totale Imponibile')) { totali.imponibile = numIt(r[r.length - 1].text); continue; }
    if (t.startsWith('Totale Iva')) { totali.iva = numIt(r[r.length - 1].text); continue; }
    if (t.toUpperCase().startsWith('TOTALE FATTURA')) { totali.totale = numIt(r[r.length - 1].text); break; }
    const um = r.filter(w => w.x0 >= wUm.x0 - 12 && w.x1 <= wUm.x1 + 12);
    const resto = r.filter(w => !um.includes(w));
    const nums = assegnaNumeri(resto, ancore, 25);
    if (!nums.tot) continue;
    const usati = new Set(Object.values(nums));
    const desc = resto.filter(w => !usati.has(w) && w.x1 < wUm.x0 - 5).map(w => w.text).join(' ');
    let umT = um.map(w => w.text).join(' ');
    let qta = nums.qta ? numIt(nums.qta.text) : null, pu = nums.pu ? numIt(nums.pu.text) : null;
    const mm = /^(\d+)\s*([A-Za-z]+)$/.exec(umT);
    if (mm && parseInt(mm[1]) > 1) { const mult = parseInt(mm[1]); qta = qta !== null ? qta * mult : null; pu = pu !== null ? pu / mult : null; umT = mm[2]; }
    fatt.righe.push({ codice: '', descrizione: desc, quantita: qta, um: umT, prezzo: pu, sconto: '', aliquota: nums.iva ? nums.iva.text : '', importo: numIt(nums.tot.text) || 0, ddt: '' });
  }
  const aliquote = [...new Set(fatt.righe.map(r => r.aliquota))];
  if (totali.imponibile != null) {
    if (aliquote.length === 1) fatt.riepiloghi = [{ aliquota: numIt(aliquote[0]) || 0, imponibile: totali.imponibile, imposta: totali.iva || 0 }];
    else for (const a of aliquote) { const imp = r2(fatt.righe.filter(r => r.aliquota === a).reduce((t, r) => t + r.importo, 0)); fatt.riepiloghi.push({ aliquota: numIt(a) || 0, imponibile: imp, imposta: r2(imp * (numIt(a) || 0) / 100) }); }
  }
  fatt.totale = totali.totale ?? null;
  const mp = /Modalit[àa] pagamento:\s*(.+)/.exec(tx);
  if (mp) fatt.pagamenti = [{ modalita: mp[1].trim(), scadenza: null, importo: totali.totale ?? null }];
  return fatt;
}

function leggiRiepiloghi(righe) {
  const out = []; let cols = null;
  for (const r of righe) {
    const t = testo(r);
    if (cols === null) {
      if (t.includes('imponibile') && t.includes('imposta')) {
        cols = {};
        for (const w of r) {
          if (w.text === '%IVA') cols.aliquota = w.x1; else if (w.text === 'accessorie') cols.spese = w.x1; else if (w.text === 'Arr.') cols.arr = w.x1;
          else if (w.text === 'imponibile') cols.imponibile = w.x1; else if (w.text === 'imposta') cols.imposta = w.x1;
        }
      }
      continue;
    }
    if (t.trim() === 'TOTALI' || t.includes('Importo bollo') || t.startsWith('Copia della fattura')) break;
    const valori = {}; const ks = Object.keys(cols);
    for (const w of r) {
      if (!NUM.test(w.text)) continue;
      const nome = ks.reduce((b, k) => Math.abs(cols[k] - w.x1) < Math.abs(cols[b] - w.x1) ? k : b, ks[0]);
      if (Math.abs(cols[nome] - w.x1) < 40) valori[nome] = numIt(w.text);
    }
    if ('imponibile' in valori) {
      const nat = /\bN\d(\.\d)?\b/.exec(t);
      out.push({ aliquota: valori.aliquota || 0, imponibile: valori.imponibile, imposta: valori.imposta || 0, natura: nat ? nat[0] : '', spese: valori.spese || 0 });
    }
  }
  return out;
}

export async function leggiFatturaPdf(data) {
  const pdf = await leggiPdf(data);
  const pagine = pdf.map(p => righeParole(p));
  if (!pagine.length || !pagine.some(p => p.length)) throw new Error('PDF senza testo (scansione?)');
  const testo1 = pagine[0].map(testo).join('\n');
  if (!testo1.includes('Cedente/prestatore')) {
    let f;
    if (testo1.includes('D E S C R I Z I O N E') || (testo1.includes('ARTICOLO') && testo1.includes('IMPORTO NETTO'))) f = leggiGamma(pagine);
    else if (/(Fattura|Nota di credito)\s+n\./i.test(testo1) && testo1.includes('Totale Imponibile')) f = leggiLatte(pagine);
    else throw new Error('formato di fattura non riconosciuto');
    f.fonte = 'pdf'; return [f];
  }
  const fatt = { righe: [], riepiloghi: [], pagamenti: [], avvisi: [], fonte: 'pdf' };
  const p1 = pagine[0];
  const iCed = idx(p1, r => testo(r).includes('Cedente/prestatore'));
  const iTip = idx(p1, r => testo(r).includes('Tipologia') && testo(r).includes('documento'));
  if (iCed === null || iTip === null) throw new Error('non sembra una fattura elettronica nel formato standard');
  const wc = p1[iCed].find(w => w.text.startsWith('Cessionario')); const xCli = wc ? wc.x0 : 299;
  const blocco = p1.slice(iCed + 1, iTip);
  const ced = campiAnagrafica(blocco, 0, xCli - 2), ces = campiAnagrafica(blocco, xCli - 2, 9999);
  const nome = c => { if (c.denominazione) return c.denominazione; for (const k of ['cognome nome', 'nome cognome', 'cognome e nome', 'nome e cognome']) if (c[k]) return c[k]; return [c.cognome, c.nome].filter(Boolean).join(' '); };
  const piva = c => (c['identificativo fiscale ai fini iva'] || '').replace(/ /g, '').replace(/^[A-Z]{2}/, '') || c['codice fiscale'] || '';
  fatt.fornitore = nome(ced); fatt.pivaFornitore = piva(ced); fatt.cliente = nome(ces); fatt.pivaCliente = piva(ces);
  const hdr = p1[iTip], val = p1[iTip + 1] || [];
  const wn = hdr.find(w => w.text === 'Numero'), wd = hdr.find(w => w.text === 'Data'), wa = hdr.find(w => w.text === '73');
  const xNum = wn ? wn.x0 : null, xDat = wd ? wd.x0 : null, xArt = wa ? wa.x1 : (xNum || 0) - 40;
  fatt.tipoDoc = (val.find(w => /^TD\d\d$/.test(w.text)) || {}).text || '';
  const date = val.filter(w => DATA.test(w.text)); fatt.data = date.length ? dataIt(date[0].text) : null;
  fatt.numero = xNum !== null && xDat !== null ? val.filter(w => xArt + 2 <= (w.x0 + w.x1) / 2 && (w.x0 + w.x1) / 2 < xDat - 2 && !DATA.test(w.text)).map(w => w.text).join(' ').replace(/ \//g, '/').trim() : '';
  let ddt = '', voce = null, ultimoTop = null;
  for (const righe of pagine) {
    const iTab = idx(righe, r => testo(r).includes('Cod.') && testo(r).includes('Quantità'));
    if (iTab === null) continue;
    const h = righe[iTab]; const xs = {};
    const prezzi = h.filter(w => w.text === 'Prezzo');
    for (const w of h) if (['Cod.', 'Quantità', 'UM', 'Sconto', '%IVA'].includes(w.text)) xs[w.text] = w.x0;
    if (prezzi.length < 2 || Object.keys(xs).length < 5) continue;
    const xCodFine = xs['Cod.'] + 58, xQta = xs['Quantità'], xPu = prezzi[0].x0, xUm = xs.UM, xSc = xs.Sconto, xIva = xs['%IVA'], xTot = prezzi[1].x0;
    for (const r of righe.slice(iTab + 1)) {
      const t = testo(r);
      if (t.includes('RIEPILOGHI IVA') || t.startsWith('Copia della fattura elettronica')) break;
      const cod = [], desc = [], campi = {};
      for (const w of r) {
        const { x0, x1, text: s } = w; const numero = NUM.test(s); const perc = /^[-+]?\d+(\.\d+)?%$/.test(s);
        if (x0 < xCodFine) cod.push(s);
        else if (x1 <= xQta + 8) desc.push(s);
        else if (numero && x1 < xPu) campi.qta = s;
        else if (numero && x1 < xUm + 2) campi.pu = s;
        else if (x0 >= xUm - 3 && x1 < xSc + 4 && !numero) campi.um = s;
        else if ((perc || numero) && x0 > xUm + 10 && x1 < xIva - 2) (campi.sconto = campi.sconto || []).push(perc ? s : s + ' €');
        else if (x1 < xTot && (numero || /^N\d(\.\d)?$/.test(s))) campi.iva = s;
        else if (x1 >= xTot && numero) campi.tot = s;
      }
      const td = desc.join(' ').trim();
      const mDdt = /^DDT\s+(\S+)\s+del\s+(\d{2}-\d{2}-\d{4})/.exec(td);
      const vicino = ultimoTop !== null && r[0].top - ultimoTop > 0 && r[0].top - ultimoTop < 11;
      if ('tot' in campi || (cod.length && 'qta' in campi)) {
        const codice = []; for (const c of cod) { if (c.startsWith('(')) break; codice.push(c); }
        voce = { codice: codice.join(' '), descrizione: td, quantita: numIt(campi.qta || ''), um: campi.um || '', prezzo: numIt(campi.pu || ''), sconto: (campi.sconto || []).join(' '), aliquota: campi.iva || '', importo: numIt(campi.tot || '') || 0, ddt };
        fatt.righe.push(voce); ultimoTop = r[0].top;
      } else if (mDdt) { ddt = `${mDdt[1]} del ${mDdt[2]}`; voce = null; ultimoTop = null; }
      else if (voce && vicino) {
        if (td) voce.descrizione = (voce.descrizione + ' ' + td).trim();
        if (campi.sconto) voce.sconto = (voce.sconto + ' ' + campi.sconto.join(' ')).trim();
        ultimoTop = r[0].top;
      } else if (td) { voce = null; ultimoTop = null; }
    }
  }
  for (const righe of pagine) {
    righe.forEach((r, i) => {
      const t = testo(r);
      if (t.includes('RIEPILOGHI IVA')) fatt.riepiloghi.push(...leggiRiepiloghi(righe.slice(i + 1)));
      if (t.includes('Totale documento')) for (const rr of righe.slice(i + 1, i + 4)) { const nums = rr.filter(w => NUM.test(w.text)).map(w => w.text); if (nums.length) { fatt.totale = numIt(nums[nums.length - 1]); break; } }
      if (t.includes('Modalità pagamento')) for (const rr of righe.slice(i + 1, i + 8)) {
        const t2 = testo(rr); if (t2.startsWith('Copia della fattura') || t2.includes('Allegati')) break;
        if (/^(MP\d\d)\b/.test(t2)) {
          const dts = rr.filter(w => DATA.test(w.text)).map(w => w.text); const nums = rr.filter(w => NUM.test(w.text)).map(w => w.text);
          fatt.pagamenti.push({ modalita: t2.replace(/\s+(IBAN|ABI|\d{2}-\d{2}-\d{4}).*$/, '').trim(), scadenza: dts.length ? dataIt(dts[0]) : null, importo: nums.length ? numIt(nums[nums.length - 1]) : null });
        }
      }
    });
  }
  return [fatt];
}

/* ---------------- XML FatturaPA ---------------- */
function latin1(bytes) { let s = ''; for (let i = 0; i < bytes.length; i += 8192) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192)); return s; }
function daLatin1(s) { const b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 255; return b; }

export function xmlDaP7m(bytes) {
  let s = latin1(bytes);
  const inizio = s.slice(0, 200).trim();
  if (!s.trimStart().startsWith('0') && /^[A-Za-z0-9+/=\r\n]+$/.test(inizio || 'x')) {
    try { s = atob(s.replace(/[\r\n\s]/g, '')); } catch (e) { }
  }
  let i = s.indexOf('<?xml');
  if (i < 0) { i = s.indexOf('FatturaElettronica') - 1; while (i > 0 && s[i] !== '<') i--; }
  const re = /<\/[A-Za-z0-9_]*:?FatturaElettronica>/g; let m, last = null; while ((m = re.exec(s))) last = m;
  if (i < 0 || !last) throw new Error('impossibile estrarre l\'XML dal file firmato');
  let pezzo = s.slice(i, last.index + last[0].length);
  pezzo = pezzo.replace(/\x04\x82[\s\S]{2}|\x04\x81[\s\S]/g, '');
  return daLatin1(pezzo);
}

function decodifica(bytes) {
  const testa = latin1(bytes.subarray(0, 200));
  const enc = /encoding=["']([^"']+)/i.exec(testa);
  const nome = enc ? enc[1].toLowerCase() : 'utf-8';
  try { return new TextDecoder(nome === 'iso-8859-1' || nome === 'latin1' ? 'windows-1252' : nome).decode(bytes); } catch (e) { return new TextDecoder('utf-8').decode(bytes); }
}
const ln = el => el.localName || (el.nodeName || '').split(':').pop();
const kids = el => [...el.childNodes].filter(n => n.nodeType === 1);
const figlio = (el, nome) => el ? kids(el).find(c => ln(c) === nome) || null : null;
const figli = (el, nome) => el ? kids(el).filter(c => ln(c) === nome) : [];
const tutti = (el, nome) => el ? [...el.getElementsByTagName('*')].filter(c => ln(c) === nome) : [];
const T = (el, path) => { for (const p of path.split('/')) { el = figlio(el, p); if (!el) return ''; } return (el.textContent || '').trim(); };
const F = s => { if (s === '' || s == null) return null; const v = parseFloat(s); return isFinite(v) ? v : null; };
const D = s => s && /^\d{4}-\d{2}-\d{2}/.test(s) ? valida(s.slice(0, 10)) : null;
const fmtD = s => { const d = D(s); return d ? d.slice(8, 10) + '-' + d.slice(5, 7) + '-' + d.slice(0, 4) : s; };

let PARSER = null;
export function setDomParser(P) { PARSER = P; }
export function leggiFatturaXml(bytes, p7m = false) {
  if (p7m) bytes = xmlDaP7m(bytes);
  const txt = decodifica(bytes);
  const Dp = PARSER || globalThis.DOMParser;
  const doc = new Dp().parseFromString(txt, 'application/xml');
  const root = doc.documentElement;
  if (!root || ln(root) === 'parsererror' || doc.getElementsByTagName('parsererror').length) throw new Error('XML non valido');
  if (!/FatturaElettronica/.test(ln(root))) throw new Error('non è una fattura elettronica');
  const hdr = figlio(root, 'FatturaElettronicaHeader');
  const anag = b => { const d = figlio(b, 'DatiAnagrafici'); const nome = T(d, 'Anagrafica/Denominazione') || (T(d, 'Anagrafica/Cognome') + ' ' + T(d, 'Anagrafica/Nome')).trim(); return [nome, T(d, 'IdFiscaleIVA/IdCodice') || T(d, 'CodiceFiscale')]; };
  const [fornitore, pivaF] = anag(figlio(hdr, 'CedentePrestatore'));
  const [cliente, pivaC] = anag(figlio(hdr, 'CessionarioCommittente'));
  const out = [];
  for (const body of figli(root, 'FatturaElettronicaBody')) {
    const gen = figlio(figlio(body, 'DatiGenerali'), 'DatiGeneraliDocumento');
    const ddtLinee = {};
    for (const d of tutti(body, 'DatiDDT')) {
      const rif = `${T(d, 'NumeroDDT')} del ${fmtD(T(d, 'DataDDT'))}`;
      const linee = figli(d, 'RiferimentoNumeroLinea').map(x => parseInt(x.textContent)).filter(n => !isNaN(n));
      for (const n of (linee.length ? linee : [0])) ddtLinee[n] = rif;
    }
    const righe = tutti(body, 'DettaglioLinee').map(l => {
      let codice = '';
      for (const c of figli(l, 'CodiceArticolo')) { const tipo = T(c, 'CodiceTipo').toUpperCase(); if (tipo.includes('FOR') || !codice) codice = T(c, 'CodiceValore') || codice; }
      const sc = figli(l, 'ScontoMaggiorazione').filter(s => T(s, 'Percentuale')).map(s => `${T(s, 'Tipo') === 'SC' ? '-' : '+'}${T(s, 'Percentuale')}%`);
      const n = parseInt(T(l, 'NumeroLinea') || '0') || 0;
      return { codice, descrizione: T(l, 'Descrizione'), quantita: F(T(l, 'Quantita')), um: T(l, 'UnitaMisura'), prezzo: F(T(l, 'PrezzoUnitario')), sconto: sc.join(' '), aliquota: T(l, 'AliquotaIVA') || T(l, 'Natura'), importo: F(T(l, 'PrezzoTotale')) || 0, ddt: ddtLinee[n] ?? ddtLinee[0] ?? '' };
    });
    const riep = tutti(body, 'DatiRiepilogo').map(r => ({ aliquota: F(T(r, 'AliquotaIVA')) || 0, imponibile: F(T(r, 'ImponibileImporto')) || 0, imposta: F(T(r, 'Imposta')) || 0, natura: T(r, 'Natura') }));
    const pag = tutti(body, 'DettaglioPagamento').map(p => ({ modalita: T(p, 'ModalitaPagamento'), scadenza: D(T(p, 'DataScadenzaPagamento')), importo: F(T(p, 'ImportoPagamento')) }));
    out.push({ fornitore, pivaFornitore: pivaF, cliente, pivaCliente: pivaC, tipoDoc: T(gen, 'TipoDocumento'), numero: T(gen, 'Numero'), data: D(T(gen, 'Data')), righe, riepiloghi: riep, pagamenti: pag, totale: F(T(gen, 'ImportoTotaleDocumento')), avvisi: [], fonte: 'xml' });
  }
  return out;
}

/** Totali, controllo di quadratura, segno e chiave univoca (come completa() di estrai_fatture). */
export function completa(f) {
  const somma = r2(f.righe.reduce((t, r) => t + (r.importo || 0), 0));
  if (f.riepiloghi.length) { f.imponibile = r2(f.riepiloghi.reduce((t, r) => t + r.imponibile, 0)); f.iva = r2(f.riepiloghi.reduce((t, r) => t + r.imposta, 0)); }
  else { f.imponibile = somma; f.iva = f.totale != null ? r2((f.totale || somma) - somma) : 0; }
  if (f.totale == null) f.totale = r2(f.imponibile + f.iva);
  const eu = v => v.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (!f.riepiloghi.length) f.controllo = f.righe.length ? 'OK (imponibile dalle righe)' : 'riepilogo IVA non trovato';
  else if (Math.abs(somma - f.imponibile) <= 0.05) {
    f.controllo = 'OK';
    const diff = r2((f.totale || 0) - f.imponibile - f.iva);
    if (Math.abs(diff) > 0.05 && Math.abs(Math.abs(diff) - 2) > 0.01) f.controllo = `totale ≠ imponibile + IVA (diff. ${eu(diff)})`;
  } else f.controllo = `righe ${eu(somma)} ≠ imponibile ${eu(f.imponibile)}`;
  for (const r of f.righe) { const a = r.aliquota; if (typeof a === 'string' && /^\d+([.,]\d+)?$/.test(a.trim())) r.aliquota = parseFloat(a.trim().replace(',', '.')); }
  f.segno = NOTE_CREDITO.has(f.tipoDoc) ? -1 : 1;
  f.chiave = `${f.pivaFornitore || ''}|${f.numero || ''}|${f.data || ''}`;
  return f;
}

/** Legge un file (nome, contenuto) e ritorna le fatture contenute. */
export async function leggiFileFattura(nome, bytes) {
  bytes = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const testa = latin1(bytes.subarray(0, 5));
  let fs;
  if (testa.startsWith('%PDF')) fs = await leggiFatturaPdf(bytes);
  else fs = leggiFatturaXml(bytes, /\.p7m$/i.test(nome) || !/<\?xml|<[A-Za-z]/.test(latin1(bytes.subarray(0, 64))));
  fs.forEach(f => { f.file = nome; completa(f); });
  return fs;
}
