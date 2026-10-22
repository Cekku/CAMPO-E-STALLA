// Lettura della dichiarazione IVA annuale: file telematico (.txt/.iva) o PDF del modello
import { leggiPdf, parole, testoPagina } from './pdftext.js';

const righi = (p, da, a, col = 1) => { const o = []; for (let n = da; n <= a; n++) o.push([1, `${p}${n}:${col}`]); return o; };
const ACQ_IMP = [...righi('VF', 1, 13), [1, 'VF21:1'], [1, 'VF22:1'], [1, 'VF23:1'], [-1, 'VF24:1']];

// voci del riepilogo IVA dell'app <- righi del modello (validi per i modelli IVA 2024-2026)
export const IVA_VOCI = [
  { k: 've_imp', sez: 'VE', l: 'Operazioni imponibili – imponibile', f: [[1, 'VE24:1']] },
  { k: 've_iva', sez: 'VE', l: 'Operazioni imponibili – imposta', f: [[1, 'VE26:1']] },
  { k: 've_agr', sez: 'VE', l: 'Cessioni di prodotti agricoli in regime speciale (art. 34) – imponibile', f: righi('VE', 1, 11), n: 'Solo se in regime speciale agricolo' },
  { k: 've_esenti', sez: 'VE', l: 'Operazioni non imponibili, esenti e non soggette', f: [[1, 'VE30:1'], [1, 'VE31:1'], [1, 'VE32:1'], [1, 'VE33:1'], [1, 'VE34:1']], n: 'Es. esportazioni, operazioni art. 10' },
  { k: 've50', sez: 'VE', l: "Volume d'affari (rigo VE50)", f: [[1, 'VE50:1']], tot: true },
  { k: 'vf_imp', sez: 'VF', l: 'Acquisti e importazioni – imponibile (totale)', f: ACQ_IMP },
  { k: 'vf_amm', sez: 'VF', l: 'di cui acquisti di beni ammortizzabili – imponibile', f: [[1, 'VF29:1']], n: 'Investimenti: macchine, attrezzature, ecc.', sub: true },
  { k: 'vf_esenti', sez: 'VF', l: 'Acquisti non imponibili, esenti e non soggetti', f: [[1, 'VF25:1'], ...ACQ_IMP.map(([s, c]) => [-s, c])] },
  { k: 'vf_iva', sez: 'VF', l: 'IVA sugli acquisti e importazioni – imposta', f: [[1, 'VF27:1']] },
  { k: 'vl1', sez: 'VL', l: 'IVA esigibile (a debito)', f: [[1, 'VL1:1']] },
  { k: 'vl2', sez: 'VL', l: 'IVA detratta (a credito)', f: [[1, 'VL2:1']] },
  { k: 'saldo', sez: 'VL', l: "Saldo IVA dell'anno: dovuta (+) / a credito (−)", calc: v => (v.vl1 == null && v.vl2 == null) ? null : (v.vl1 || 0) - (v.vl2 || 0), tot: true },
  { k: 'vl8', sez: 'VL', l: "Credito IVA dell'anno precedente", f: [[1, 'VL8:1']] },
  { k: 'vx1', sez: 'VL', l: 'IVA versata a saldo', f: [[1, 'VX1:1']] },
  { k: 'vx5', sez: 'VL', l: "Eccedenza di credito da riportare all'anno successivo", f: [[1, 'VX5:1']], n: 'Lo stesso importo dovrebbe comparire nel credito IVA dello Stato patrimoniale' },
];
const CONTROLLI = [
  ['VE50 = VE24 + VE30..VE38 − VE39 − VE40', [[1, 'VE50:1']], [[1, 'VE24:1'], ...righi('VE', 30, 34), [1, 'VE35:1'], [1, 'VE36:1'], [1, 'VE37:1'], [1, 'VE38:1'], [-1, 'VE39:1'], [-1, 'VE40:1']]],
  ['VL1 = VE26 + VJ19', [[1, 'VL1:1']], [[1, 'VE26:1'], [1, 'VJ19:1']]],
  ['VL2 = VF71', [[1, 'VL2:1']], [[1, 'VF71:1']]],
  ['VL3 − VL4 = VL1 − VL2', [[1, 'VL3:1'], [-1, 'VL4:1']], [[1, 'VL1:1'], [-1, 'VL2:1']]],
  ['VE26 = VE24 col.2 + VE25', [[1, 'VE26:1']], [[1, 'VE24:2'], [1, 'VE25:1']]],
];
const ESSENZIALI = ['VE50:1', 'VL1:1', 'VL2:1'];

export function num(s) {
  s = String(s).trim().replace(/ /g, ''); if (!s) return null;
  const neg = s.startsWith('-') || s.endsWith('-'); s = s.replace(/^-+|-+$/g, '');
  let v;
  if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(s) || /^\d+(,\d{1,2})?$/.test(s)) v = parseFloat(s.replace(/\./g, '').replace(',', '.'));
  else if (/^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(s)) v = parseFloat(s.replace(/,/g, ''));
  else return null;
  v = neg ? -v : v; return Number.isInteger(v) ? v : Math.round(v * 100) / 100;
}

export function leggiTelematico(text) {
  const righe = text.split(/\r?\n/);
  const valori = {}; const avvisi = []; let anno = null, n = 0;
  const COD = /^(V[A-Z])(\d{3})(\d{3})$/;
  for (const riga of righe) {
    if (!riga) continue;
    const tipo = riga[0];
    if (tipo === 'A' && anno === null) { const m = /IVA(\d{2})/.exec(riga.slice(0, 60)); if (m) anno = 2000 + parseInt(m[1]) - 1; }
    if (tipo === 'A' || tipo === 'Z') continue;
    let blocchi = [];
    const start = 89;
    if (COD.test(riga.slice(start, start + 8))) {
      for (let p = start; p < riga.length - 23; p += 24) {
        const cod = riga.slice(p, p + 8), val = riga.slice(p + 8, p + 24);
        if (!COD.test(cod)) { if (cod.trim()) continue; break; }
        blocchi.push([cod, val]);
      }
    } else { const re = /V[A-Z]\d{6}(?=.{16})/g; let m; while ((m = re.exec(riga))) blocchi.push([m[0], riga.slice(m.index + 8, m.index + 24)]); }
    for (const [cod, val] of blocchi) {
      const m = COD.exec(cod); const v = num(val); if (v === null) continue;
      const k = `${m[1]}${parseInt(m[2])}:${parseInt(m[3])}`;
      valori[k] = (valori[k] || 0) + v; n++;
    }
  }
  if (!n) avvisi.push('Nessun campo dei quadri V.. trovato: il file non sembra un telematico IVA.');
  return { tipo: 'Telematico', valori, anno, avvisi };
}

const RIGO = /^(V[A-Z])(\d{1,2})$/;
const ALIQUOTE = new Set(['2', '4', '5', '6.4', '7', '7.3', '7.5', '8.3', '8.5', '8.8', '10', '12.3', '22']);
const IMPORTO = /^-?(\d{1,3}(\.\d{3})+|\d+)(,\d{2})?-?$/;
function annoDaTesto(t) {
  let m = /periodo\s+d['’]\s*imposta\s*(20\d\d)/i.exec(t); if (m) return parseInt(m[1]);
  m = /\bIVA\s*\/?\s*(20\d\d)\b/.exec(t); if (m) return parseInt(m[1]) - 1;
  return null;
}
const median = a => { const s = [...a].sort((x, y) => x - y); const n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };

export async function leggiIvaPdf(bytes) {
  const pagine = await leggiPdf(bytes);
  const trovati = {}; const avvisi = [];
  const inizio = pagine.slice(0, 3).map(testoPagina).join('\n');
  const anno = annoDaTesto(inizio);
  if (!inizio.trim()) avvisi.push('Il PDF non contiene testo (probabilmente è una scansione): serve il file telematico o un PDF generato dal software.');
  pagine.forEach((pag, ip) => {
    let ws = parole(pag, { attr: true });
    if (!ws.length) return;
    const uniti = [];
    for (const w of ws) {
      const u = uniti[uniti.length - 1];
      if (u && /^V[A-Z]$/.test(u.text) && /^\d{1,2}$/.test(w.text) && Math.abs(w.top - u.top) < 2 && w.x0 - u.x1 >= 0 && w.x0 - u.x1 < 4) uniti[uniti.length - 1] = Object.assign({}, u, { text: u.text + w.text, x1: w.x1 });
      else uniti.push(w);
    }
    ws = uniti; ws.forEach(w => (w.cy = (w.top + w.bottom) / 2));
    const codici = ws.filter(w => RIGO.test(w.text) && w.x0 < pag.width * 0.22).sort((a, b) => a.cy - b.cy);
    if (!codici.length) return;
    const numerici = ws.filter(w => IMPORTO.test(w.text) || w.text === ',00' || w.text === ',');
    const alfa = {}; let totA = 0;
    for (const w of ws) if (/[A-Za-z]{3,}/.test(w.text)) { alfa[w.fontname] = (alfa[w.fontname] || 0) + 1; totA++; }
    totA = totA || 1;
    const dim = numerici.filter(w => w.text.replace(/^[,-]+|[,-]+$/g, '').length >= 3).map(w => w.size);
    const tip = dim.length ? median(dim) : 8;
    codici.forEach((c, i) => {
      let su = i > 0 ? (codici[i - 1].cy + c.cy) / 2 : c.cy - 10;
      let giu = i + 1 < codici.length ? (codici[i + 1].cy + c.cy) / 2 : c.cy + 10;
      su = Math.max(su, c.cy - 12); giu = Math.min(giu, c.cy + 12);
      const banda = numerici.filter(w => su <= w.cy && w.cy < giu && w.x0 > c.x1);
      const etich = banda.filter(w => /^\d{1,2}$/.test(w.text) && w.size < tip * 0.8).sort((a, b) => a.x0 - b.x0);
      let importi = banda.filter(w => !etich.includes(w));
      const riga = ws.filter(w => su <= w.cy && w.cy < giu).sort((a, b) => a.x0 - b.x0);
      const inDescr = w => {
        if (/[.,]\d{3}/.test(w.text) || w.text.length > 4) return false;
        const prec = riga.filter(p => p.x1 <= w.x0 + 0.5), succ = riga.filter(p => p.x0 >= w.x1 - 0.5);
        if (succ.length && succ[0].text.startsWith('%') && succ[0].x0 - w.x1 < 4) return true;
        return !!(prec.length && /[A-Za-z]/.test(prec[prec.length - 1].text) && w.x0 - prec[prec.length - 1].x1 < 8);
      };
      importi = importi.filter(w => !inDescr(w));
      const fd = importi.filter(w => (alfa[w.fontname] || 0) / totA < 0.15);
      if (fd.length && fd.length < importi.length) importi = fd;
      importi.sort((a, b) => a.x0 - b.x0);
      const fusi = [];
      for (const w of importi) { if (w.text === ',00' || w.text === ',') continue; fusi.push(w); }
      const rigo = c.text; const nr = parseInt(rigo.slice(2));
      let lst = fusi;
      if (!etich.length && lst.length === 3 && ((rigo.slice(0, 2) === 'VE' && nr <= 23) || (rigo.slice(0, 2) === 'VF' && nr <= 13)) && ALIQUOTE.has(lst[0].text.replace(',', '.'))) lst = lst.slice(1);
      lst.forEach((w, k) => {
        const v = num(w.text); if (v === null) return;
        let col;
        if (etich.length) { const prima = etich.filter(e => e.x0 <= w.x0 + 3); col = prima.length ? parseInt(prima[prima.length - 1].text) : 1; } else col = k + 1;
        (trovati[`${rigo}:${col}`] = trovati[`${rigo}:${col}`] || []).push([v, ip + 1]);
      });
    });
  });
  const valori = {};
  for (const [k, lista] of Object.entries(trovati)) {
    valori[k] = lista[0][0];
    const dist = [...new Set(lista.map(x => x[0]))];
    if (dist.length > 1) avvisi.push(`${k.replace(':', ' col.')}: trovati valori diversi (${dist.join(', ')}) nelle pagine ${lista.map(x => x[1]).join(', ')}: usato il primo, verificare.`);
  }
  if (!Object.keys(valori).length && !avvisi.length) avvisi.push('Nessun rigo dei quadri V.. riconosciuto nel PDF.');
  return { tipo: 'PDF', valori, anno, avvisi };
}

export async function leggiDichiarazioneIva(nome, bytes) {
  bytes = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (String.fromCharCode(...bytes.subarray(0, 4)) === '%PDF') return leggiIvaPdf(bytes);
  return leggiTelematico(new TextDecoder('windows-1252').decode(bytes));
}

function calcola(f, v) { let t = 0, ok = false; for (const [s, k] of f) if (k in v) { ok = true; t += s * v[k]; } return ok ? Math.round(t * 100) / 100 : null; }
/** Valori del riepilogo IVA e controlli di quadratura a partire dai righi letti. */
export function riepilogoIva(valori) {
  const out = {};
  for (const x of IVA_VOCI) if (x.f) out[x.k] = calcola(x.f, valori);
  const controlli = [];
  for (const [d, sx, dx] of CONTROLLI) {
    let a = calcola(sx, valori), b = calcola(dx, valori);
    if (a === null && b === null) continue;
    a = a || 0; b = b || 0;
    controlli.push({ d, a, b, esito: Math.abs(a - b) <= 1 ? 'OK' : 'DIFFERENZA' });
  }
  for (const k of ESSENZIALI) if (!(k in valori)) controlli.push({ d: `Rigo ${k.split(':')[0]} presente`, a: '', b: '', esito: 'MANCANTE' });
  return { voci: out, controlli };
}
