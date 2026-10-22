// Lettura dei documenti delle paghe: cedolini (una pagina per dipendente, più l'eventuale pagina "Totali generali")
// e bilancino contabile del mese. Il modulo è quello a moduli fissi dei programmi paghe (es. Data Services):
// le etichette sono stampate sul modulo, nel testo del PDF ci sono solo i valori, quindi si leggono per posizione.
import { leggiPdf, parole } from './pdftext.js';

export const MESI_NOMI = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];
const MESE_RE = /^(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre|tredicesima|quattordicesima|1[34](?:a|ª|°|\^|-?esima|-?ma)|13ma|14ma)$/i;
const meseNum = s => { s = s.toLowerCase(); const i = MESI_NOMI.findIndex(m => m.toLowerCase() === s); if (i >= 0) return i + 1; if (/^(tredicesima|13)/.test(s)) return 13; if (/^(quattordicesima|14)/.test(s)) return 14; return null; };
const pulisci = s => String(s || '').replace(/[\u0000-\u001f]/g, '').trim();
const r2 = v => Math.round(v * 100) / 100;

/** Numero all'italiana: "1.623,00", "12786,00", ",70", "1.177,16-" (meno in coda). */
export function numIt(s) {
  s = pulisci(s); if (!s) return null;
  const neg = /-$/.test(s) || /^-/.test(s); s = s.replace(/-/g, '');
  if (!/^[\d.]*,\d+$|^\d[\d.]*$/.test(s)) return null;
  const v = parseFloat(s.replace(/\./g, '').replace(',', '.'));
  return isFinite(v) ? (neg ? -v : v) : null;
}
const isNum = s => /^-?[\d.]*,\d{2,5}-?$/.test(pulisci(s));
const data = s => { const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(pulisci(s)); if (!m || m[3] === '1900') return null; return `${m[3]}-${m[2]}-${m[1]}`; };

/** Riconosce dal testo se un PDF è un documento paghe. */
export function tipoPaghe(pagine) {
  const ws = pagine.slice(0, 3).flatMap(p => parole(p).map(w => pulisci(w.text)));
  const t = ws.join(' ');
  if (/BILANCINO\s+CONTABILE/i.test(t) && /(NETTO|N E T T O)/i.test(t) && /etribuzione|ontributi/i.test(t)) return 'bilancino';
  // cedolino: codici delle voci (1.0001), un mese con l'anno in fondo alla pagina
  const p0 = pagine[0]; if (!p0) return null;
  const w0 = parole(p0);
  const codici = w0.filter(w => /^\d\.\d{4}$/.test(pulisci(w.text))).length;
  const mese = w0.some(w => MESE_RE.test(pulisci(w.text)) && w.top > p0.height * 0.8);
  return codici >= 2 && mese ? 'cedolino' : null;
}

/* ---------------- cedolino ---------------- */
// coordinate del modulo standard (A4, 595×842): la riga del mese è a 792; tutto si sposta insieme a lei
const Y_MESE = 792.5;
function lettorePagina(p) {
  const ws = parole(p).map(w => Object.assign({}, w, { text: pulisci(w.text) })).filter(w => w.text);
  const mw = ws.filter(w => MESE_RE.test(w.text) && w.top > p.height * 0.8).sort((a, b) => b.top - a.top)[0];
  if (!mw) return null;
  // la riga più bassa del modulo (ferie, ore annuali) sta a 797: è il riferimento più stabile
  const basso = Math.max(...ws.filter(w => w.top > mw.top - 30).map(w => w.top));
  const dy = (basso - mw.top < 8 ? basso - 4.5 : mw.top) - Y_MESE;
  const riga = (top, tol = 2.6) => ws.filter(w => Math.abs(w.top - (top + dy)) <= tol).sort((a, b) => a.x0 - b.x0);
  // numero con il bordo destro in [a, b]
  const n = (top, a, b) => { const w = riga(top).find(w => w.x1 >= a && w.x1 <= b && isNum(w.text)); return w ? numIt(w.text) : null; };
  const nInt = (top, a, b) => { const w = riga(top).find(w => w.x1 >= a && w.x1 <= b && /^\d+([.,]\d+)?$/.test(w.text)); return w ? numIt(w.text.includes(',') ? w.text : w.text + ',0') : null; };
  // testo delle parole che iniziano in [a, b)
  const t = (top, a, b, tol) => riga(top, tol).filter(w => w.x0 >= a && w.x0 < b).map(w => w.text).join(' ');
  return { ws, mw, dy, riga, n, nInt, t };
}

function leggiPaginaCedolino(p) {
  const L = lettorePagina(p); if (!L) return null;
  const { ws, mw, dy, riga, n, nInt, t } = L;
  const meseRiga = ws.filter(w => Math.abs(w.top - mw.top) <= 1.5).sort((a, b) => a.x0 - b.x0);
  const anno = +(meseRiga.find(w => /^20\d\d$/.test(w.text)) || {}).text || null;
  const mese = meseNum(mw.text);
  const nettoW = meseRiga.filter(w => isNum(w.text) && w.x0 > mw.x1).pop();
  const netto = nettoW ? numIt(nettoW.text) : null;
  const totale = ws.some(w => /^Totali$/i.test(w.text)) && ws.some(w => /^generali$/i.test(w.text));
  // totali competenze e trattenute: gli ultimi due numeri della riga
  const rt = riga(Y_MESE - 43.9).filter(w => isNum(w.text));
  const totComp = rt.length >= 2 ? numIt(rt[rt.length - 2].text) : null, totTratt = rt.length ? numIt(rt[rt.length - 1].text) : null;
  const base = { mese, anno, netto, totComp, totTratt };
  if (totale) {
    const rl = riga(Y_MESE - 92.3).filter(w => isNum(w.text));
    const nd = ws.find(w => w.top < 120 + dy && w.top > 90 + dy && w.x0 > 540 && /^\d+$/.test(w.text));
    return Object.assign(base, { totale: true, lordo: rl.length ? numIt(rl[0].text) : null, dipendenti: nd ? +nd.text : null });
  }
  // intestazione del dipendente
  const yCf = 119.5;
  const cf = riga(yCf, 3).filter(w => w.x0 >= 88 && w.x0 < 175).map(w => w.text).join('').replace(/\s/g, '').toUpperCase();
  const nome = t(yCf, 300, 595, 3).replace(/\s+/g, ' ').trim();
  const val = {
    cf: /^[A-Z0-9]{16}$/.test(cf) ? cf : cf || '', nome,
    matricola: t(95.5, 540, 595), livello: t(95.5, 450, 500),
    contratto: t(143.9, 40, 68), qualifica: t(143.9, 68, 228), mansione: t(143.9, 228, 316),
    nascita: data(t(143.9, 490, 545)),
    assunzione: data(t(192.3, 40, 96)), anzianita: data(t(192.3, 96, 150)), prossimoScatto: data(t(192.3, 168, 225)),
    scadPermesso: data(t(192.3, 268, 318)), scadTD: data(t(192.3, 318, 362)), visitaMedica: data(t(192.3, 362, 408)),
    inizioSosp: data(t(192.3, 408, 458)), fineSosp: data(t(192.3, 458, 508)), cessazione: data(t(192.3, 508, 595)),
    pagaBase: n(216.5, 80, 110), retribuzione: n(240.7, 540, 575),
    ore: nInt(264.9, 75, 90), giorni: nInt(264.9, 115, 130), oreContratto: nInt(264.9, 155, 175), giorniInps: nInt(264.9, 265, 280),
    // riquadri in fondo
    impPrev: n(Y_MESE - 164.9, 95, 110), ritPrev: n(Y_MESE - 164.9, 550, 575),
    impFisc: n(Y_MESE - 140.7, 95, 110), irpefLorda: n(Y_MESE - 140.7, 155, 172), detrazioni: n(Y_MESE - 140.7, 215, 232), irpef: n(Y_MESE - 140.7, 550, 575),
    lordo: n(Y_MESE - 92.3, 95, 110),
    retribTfr: n(Y_MESE - 68.1, 95, 110), fondoPensTfr: n(Y_MESE - 68.1, 215, 232), tfrFondo: n(Y_MESE - 68.1, 325, 340), ritNetto: n(Y_MESE - 68.1, 550, 575),
    arrPrec: n(Y_MESE - 19.7, 480, 510), arrCorr: n(Y_MESE - 19.7, 540, 575),
    permessi: { prec: n(Y_MESE - 19.7, 60, 75), mat: n(Y_MESE - 19.7, 95, 110), god: n(Y_MESE - 19.7, 112, 135), saldo: n(Y_MESE - 19.7, 155, 172) },
    ferie: { prec: n(Y_MESE + 4.5, 60, 75), mat: n(Y_MESE + 4.5, 95, 110), god: n(Y_MESE + 4.5, 112, 135), saldo: n(Y_MESE + 4.5, 150, 170), godAnno: n(Y_MESE + 4.5, 185, 205) },
  };
  // voci: righe con il codice a sinistra
  const voci = [];
  for (const w of ws.filter(w => /^\d\.\d{4}$/.test(w.text) && w.x0 < 70 && w.top < Y_MESE - 200 + dy)) {
    const r = riga(w.top - dy, 1.5);
    const desc = r.filter(x => x.x0 > w.x1 && x.x0 < 280 && !isNum(x.text)).map(x => x.text).join(' ');
    const num = (a, b) => { const x = r.find(x => x.x1 >= a && x.x1 <= b && isNum(x.text)); return x ? numIt(x.text) : null; };
    voci.push({ codice: w.text, descrizione: desc, neutro: num(280, 330), tempo: num(335, 375), unitario: num(380, 445), competenza: num(455, 510), trattenuta: num(520, 575) });
  }
  // ritenute per ente (Cimacla, Scau, ...): le etichette sono sopra gli importi
  const enti = {}; riga(Y_MESE - 177).filter(w => /^[A-Za-z]/.test(w.text)).forEach(e => { const v = riga(Y_MESE - 164.9).find(x => isNum(x.text) && x.x1 > e.x0 && x.x1 < e.x0 + 50 && x.x0 > 230 && x.x1 < 520); if (v) enti[e.text] = numIt(v.text); });
  return Object.assign(base, val, { voci, enti });
}

/** Controlli interni del cedolino. */
export function controlliCedolino(c) {
  const out = [];
  if (c.totComp != null && c.totTratt != null && c.netto != null) {
    const atteso = r2(c.totComp - c.totTratt - (c.arrPrec || 0) + (c.arrCorr || 0));
    out.push({ d: 'Competenze − trattenute ± arrotondamenti = netto', esito: Math.abs(atteso - c.netto) <= 0.02 ? 'OK' : `Differenza ${(c.netto - atteso).toFixed(2).replace('.', ',')} €` });
  }
  const sc = c.voci.reduce((t, v) => t + (v.competenza || 0), 0), st = c.voci.reduce((t, v) => t + (v.trattenuta || 0), 0);
  if (c.voci.length && c.totComp != null) out.push({ d: 'Somma delle voci di competenza = totale competenze', esito: Math.abs(r2(sc) - c.totComp) <= 0.02 ? 'OK' : `Voci ${r2(sc)} / totale ${c.totComp}` });
  if (c.voci.length && c.totTratt != null && c.ritPrev != null && c.irpef != null) { const t = r2(st + (c.ritPrev || 0) + Math.max(0, c.irpef || 0)); out.push({ d: 'Voci di trattenuta + contributi + IRPEF = totale trattenute', esito: Math.abs(t - c.totTratt) <= 0.05 ? 'OK' : 'da verificare' }); }
  return out;
}

/** Legge un PDF di cedolini: { cedolini: [...], totali: {...} | null, mese, anno }. */
export async function leggiCedolini(bytes, pagine) {
  pagine = pagine || await leggiPdf(bytes);
  const ced = [], tot = [];
  for (const p of pagine) {
    const c = leggiPaginaCedolino(p); if (!c) continue;
    if (c.totale) { tot.push(c); continue; }
    if (!c.nome && !c.cf) continue;
    c.controlli = controlliCedolino(c);
    ced.push(c);
  }
  if (!ced.length && !tot.length) throw new Error('Nessun cedolino riconosciuto nel PDF.');
  const mese = (ced[0] || tot[0]).mese, anno = (ced[0] || tot[0]).anno;
  const totali = tot[0] || null;
  const controlli = [];
  if (totali) {
    const sN = r2(ced.reduce((t, c) => t + (c.netto || 0), 0)), sL = r2(ced.reduce((t, c) => t + (c.lordo || 0), 0));
    controlli.push({ d: 'Somma dei netti = totale generale', esito: Math.abs(sN - (totali.netto || 0)) <= 0.02 ? 'OK' : `${sN} invece di ${totali.netto}` });
    if (totali.lordo != null) controlli.push({ d: 'Somma dei lordi = totale generale', esito: Math.abs(sL - totali.lordo) <= 0.02 ? 'OK' : `${sL} invece di ${totali.lordo}` });
    if (totali.dipendenti) controlli.push({ d: 'Numero di cedolini = dipendenti del riepilogo', esito: totali.dipendenti === ced.length ? 'OK' : `${ced.length} invece di ${totali.dipendenti}` });
  }
  return { cedolini: ced, totali, mese, anno, controlli };
}

/* ---------------- bilancino paghe ---------------- */
const VOCI_BIL = [
  ['RETRIBUZIONELORDA', 'lordo'], ['INDENNITATFR', 'tfrLiquidato'], ['RIVALUTAZIONETFR', 'rivalTfr'], ['PRESTAZENTIPREVIDENZ', 'prestazEnti'], ['ANTICIPICENTI', 'anticipiEnti'],
  ['RITENUTEPREVIDENZIALI', 'ritPrev'], ['RITENUTEFISCALI', 'ritFisc'], ['RITENCOMPETSUNETTO', 'ritNetto'], ['ACCONTI', 'acconti'], ['RIMBORSISPESEENTI', 'rimborsiEnti'], ['RIMBORSISPESE', 'rimborsi'],
  ['ARROTONDAMENTOPRECEDENT', 'arrPrec'], ['ARROTONDAMENTOCORRENTE', 'arrCorr'], ['NETTOPAGATO', 'netto'],
  ['CONTRIBUTIINPS', 'inps'], ['PRESTAZIONIINPS', 'prestInps'], ['TOTALEINPS', 'totInps'], ['CONTRIBUTISCAU', 'scau'], ['INAILCONTOSCAU', 'inail'], ['TFRFPC', 'tfrFpc'], ['TOTALEALTRICONTRIBUTI', 'altri'],
  ['DEBITOIRPEF', 'irpefDebito'], ['CREDITOIRPEF', 'irpefCredito'], ['IRPEFSOSTITRIVALUTTFR', 'irpefRivTfr'], ['ADDIZIONALEREGIONALE', 'addReg'], ['ADDIZIONALECOMUNALE', 'addCom'], ['TOTALEIRPEF', 'irpef'],
  ['COSTOTOTALEAZIENDALE', 'costo'], ['VERSAMENTIDICOMPETENZA', 'versamenti'], ['IMPONIBILEPREVIDENZIALE', 'impPrev'], ['IMPONIBILEFISCALE', 'impFisc'], ['FONDOPENSIONI', 'fondoPensioni'],
  ['TFRLIQUIDANNOCORRENTE', 'tfrLiqAnno'], ['TFRLIQUIDANNIPRECED', 'tfrLiqPrec'], ['TFRDATESORANCORRENTE', 'tfrTesAnno'], ['TFRDATESORANNIPRECED', 'tfrTesPrec'],
];
const compatta = s => s.toUpperCase().replace(/[^A-Z0-9]/g, '');

/** Legge il bilancino contabile mensile delle paghe. */
export async function leggiBilancinoPaghe(bytes, pagine) {
  pagine = pagine || await leggiPdf(bytes);
  const p = pagine[0];
  const ws = parole(p).map(w => Object.assign({}, w, { text: pulisci(w.text) })).filter(w => w.text);
  const righe = []; for (const w of [...ws].sort((a, b) => a.top - b.top || a.x0 - b.x0)) { const r = righe[righe.length - 1]; if (r && Math.abs(r[0].top - w.top) < 3) r.push(w); else righe.push([w]); }
  righe.forEach(r => r.sort((a, b) => a.x0 - b.x0));
  // colonne: bordo destro delle intestazioni "Oneri ditta", "Oneri dipen.", "Oneri enti", "Debito/Cred."
  let col = [280, 386, 465, 567];
  const h = righe.find(r => r.some(w => /^ditta$/i.test(w.text)) && r.some(w => /Debito/i.test(w.text)));
  if (h) { const x = re => (h.find(w => re.test(w.text)) || {}).x1; col = [x(/^ditta$/i) || col[0], x(/^dipen/i) || col[1], x(/^enti$/i) || col[2], x(/Debito/i) || col[3]]; }
  const COLS = ['ditta', 'dip', 'enti', 'debito'];
  const colDi = w => { let b = 0, d = 1e9; col.forEach((c, i) => { const dd = Math.abs(w.x1 - c); if (dd < d) { d = dd; b = i; } }); return COLS[b]; };
  const v = {}; let mese = null, anno = null, ditta = '', nDip = null;
  for (const r of righe) {
    const tx = r.map(w => w.text).join(' ');
    const mm = r.find(w => MESE_RE.test(w.text)); if (mm && !mese && r.some(w => /^20\d\d/.test(w.text))) { mese = meseNum(mm.text); anno = +(r.find(w => /^20\d\d/.test(w.text)).text.slice(0, 4)); }
    if (/^D\s*i\s*t\s*t\s*a/.test(tx)) ditta = r.filter(w => w.x0 > 110 && w.x0 < 460).map(w => w.text).join(' ');
    if (/N\.dip\.forza/.test(tx)) { const n = r.find(w => /^\d+$/.test(w.text) && w.x0 > 530); if (n) nDip = +n.text; }
    // una riga può avere due coppie etichetta/valore (parte bassa del bilancino)
    const parti = [];
    const destra = r.findIndex(w => w.x0 > 300 && /^[A-Za-z]/.test(w.text) && !isNum(w.text));
    if (destra > 0 && r.slice(0, destra).some(w => isNum(w.text))) parti.push([r.slice(0, destra), true], [r.slice(destra), true]); else parti.push([r, false]);
    for (const [ws_, coppia] of parti) {
      const lab = compatta(ws_.filter(w => !isNum(w.text) && !/^[.]+$/.test(w.text)).map(w => w.text).join(''));
      const voce = VOCI_BIL.find(([k]) => lab.startsWith(k)); if (!voce) continue;
      const nums = ws_.filter(w => isNum(w.text)); if (!nums.length) continue;
      const o = {}; nums.forEach(w => { o[coppia ? 'ditta' : colDi(w)] = numIt(w.text); });
      if (!v[voce[1]]) v[voce[1]] = o;
    }
  }
  const g = (k, c) => (v[k] && v[k][c] != null ? v[k][c] : 0);
  const riep = {
    mese, anno, ditta, nDip, voci: v,
    lordo: g('lordo', 'ditta'), netto: g('netto', 'dip') || g('netto', 'debito'),
    ritPrev: -g('ritPrev', 'dip'), ritFisc: -g('ritFisc', 'dip'), ritNetto: -g('ritNetto', 'dip'), acconti: -g('acconti', 'dip'),
    contribDitta: g('altri', 'ditta') - g('tfrFpc', 'ditta') + g('totInps', 'ditta'), contribDip: g('altri', 'dip') + g('totInps', 'dip'),
    contribDebito: g('scau', 'debito') + g('inps', 'debito') + g('totInps', 'debito'), tfrFpc: g('tfrFpc', 'ditta'),
    irpef: g('irpef', 'debito') || g('irpef', 'dip'), costo: g('costo', 'ditta'), versamenti: g('versamenti', 'ditta'),
    impPrev: g('impPrev', 'ditta'), impFisc: g('impFisc', 'ditta'), tfrLiquidato: g('tfrLiquidato', 'ditta'),
  };
  if (!mese || !anno) throw new Error('Nel bilancino delle paghe non ho trovato il mese.');
  if (!riep.lordo && !riep.netto) throw new Error('Nel bilancino delle paghe non ho trovato retribuzione lorda e netto.');
  riep.controlli = [
    { d: 'Lordo − ritenute − trattenute ± arrotondamenti = netto pagato', esito: Math.abs(r2(riep.lordo - riep.ritPrev - riep.ritFisc - riep.ritNetto - riep.acconti + g('arrPrec', 'ditta') + g('arrCorr', 'ditta') + g('rimborsi', 'ditta') + g('tfrLiquidato', 'ditta')) - riep.netto) <= 0.05 ? 'OK' : 'da verificare' },
    { d: 'Lordo + contributi a carico ditta + TFR al fondo = costo totale', esito: !riep.costo ? 'manca il costo' : Math.abs(r2(riep.lordo + riep.contribDitta + riep.tfrFpc) - riep.costo) <= 0.05 ? 'OK' : 'da verificare' },
  ];
  return riep;
}
