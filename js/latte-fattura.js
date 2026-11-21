// Lettore della fattura mensile del latte consegnato al caseificio (1.66.0).
// Il caseificio manda ogni mese una fattura in PDF (testo vero, a volte una scansione letta con l'OCR)
// che contiene: le righe della fattura (latte crudo, premi, adeguamenti, recuperi; quantità in migliaia
// di litri e prezzo per 1000 L), le analisi del mese (grasso, proteine, carica batterica, cellule
// somatiche con media e premio o penale) e le consegne di ogni giorno (data, n. documento, litri).
// Qui solo la lettura e i controlli: niente salvataggi. Si prova in Node (strumenti/prove/latte.mjs).

const num = (s) => {
  if (s == null) return null;
  let t = String(s).trim();
  let neg = false;
  if (/^-/.test(t)) { neg = true; t = t.slice(1); }
  if (/-$/.test(t)) { neg = true; t = t.slice(0, -1); }
  if (!/^\d[\d.]*(,\d+)?$/.test(t)) return null;
  const v = Number(t.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(v) ? (neg ? -v : v) : null;
};
const r2 = (v) => Math.round(v * 100) / 100;
const anno4 = (a) => (a.length === 2 ? '20' + a : a);
const isoGMA = (g, m, a) => `${anno4(a)}-${m.padStart(2, '0')}-${g.padStart(2, '0')}`;

// La fattura del latte si riconosce da: "Fattura n." + almeno una riga "Latte ... 1000 L" + la tabella
// delle consegne ("data n.doc. L").
export function eFatturaLatte(testo) {
  const t = String(testo || '');
  return /Fattura\s+n\.?\s*[\w/.-]+\s+del\s+\d{1,2}\/\d{1,2}\/\d{2,4}/i.test(t)
    && /^\s*Latte\b.*\b1000\s*L\b/im.test(t)
    && /data\s+n\.\s*doc\.?\s+L\b/i.test(t);
}

// Tipo di una riga della fattura dalla descrizione.
function tipoRiga(d) {
  const s = d.toLowerCase();
  if (/^latte\b/.test(s)) return 'latte';          // latte crudo, "A.Q.", "in esubero"
  if (/^premio\b/.test(s)) return 'premio';
  if (/adeguament/.test(s)) return 'adeguamento';
  if (/recuper/.test(s)) return 'recupero';
  if (/tratten|penal|contribut|quota|spes/.test(s)) return 'trattenuta';
  return 'altro';
}

const PARAM = [
  ['grasso', /^grasso\b/i],
  ['proteine', /^proteine\b/i],
  ['cbt', /^carica\s+batterica\b/i],
  ['cellule', /^cellule\s+somatiche\b/i],
  ['quantita', /^premio\s+quantit/i],
];

// Legge il testo (righe separate da a capo, come lo danno il ponte dell'archivio o pdftext.js).
// Restituisce { numero, data, mese, periodo, righe, imponibile, iva, totale, litri, giorni, qualita,
// analisi, controlli: [{ voce, atteso, letto, ok }], ok, errore? }.
export function leggiFatturaLatte(testo) {
  const t = String(testo || '').replace(/\r/g, '');
  const righeTesto = t.split('\n').map((r) => r.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const out = { numero: null, data: null, mese: null, periodo: null, righe: [], imponibile: null, iva: null,
    totale: null, litri: 0, giorni: [], qualita: {}, analisi: [], controlli: [], ok: false };

  const mN = t.match(/Fattura\s+n\.?\s*([\w/.-]+)\s+del\s+(\d{1,2})\/(\d{1,2})\/(\d{2,4})/i);
  if (!mN) return { ...out, errore: 'manca il numero della fattura' };
  out.numero = mN[1];
  out.data = isoGMA(mN[2], mN[3], mN[4]);
  const mP = t.match(/Periodo:?\s*(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s*-\s*(\d{1,2})\/(\d{1,2})\/(\d{2,4})/i);
  if (mP) out.periodo = { dal: isoGMA(mP[1], mP[2], mP[3]), al: isoGMA(mP[4], mP[5], mP[6]) };
  out.mese = (out.periodo?.dal || out.data).slice(0, 7);

  // Righe della fattura: "<descrizione> 1000 L <quantità> <prezzo> <IVA> <imponibile>"
  const reRiga = /^(.+?)\s+1000\s*L\s+(-?[\d.,]+-?)\s+(-?[\d.,]+-?)\s+(\d{1,2})\s+(-?[\d.,]+-?)$/;
  for (const r of righeTesto) {
    const m = r.match(reRiga);
    if (!m) continue;
    const descr = m[1].replace(/\s*\d{1,2}\/\d{1,2}\/\d{2,4}\s*-\s*\d{1,2}\/\d{1,2}\/\d{2,4}\s*/, ' ').trim();
    const q = num(m[2]), prezzo = num(m[3]), imp = num(m[5]);
    if (q == null || prezzo == null || imp == null) continue;
    out.righe.push({ descr, tipo: tipoRiga(descr), q, prezzo, iva: Number(m[4]), imp });
  }
  const mI = t.match(/Totale\s+Imponibile\s+(-?[\d.,]+-?)/i);
  const mV = t.match(/Totale\s+Iva\s+(-?[\d.,]+-?)/i);
  const mT = t.match(/TOTALE\s+FATTURA[^\d-]*(-?[\d.,]+-?)/i);
  out.imponibile = mI ? num(mI[1]) : null;
  out.iva = mV ? num(mV[1]) : null;
  out.totale = mT ? num(mT[1]) : null;

  const righeLatte = out.righe.filter((x) => x.tipo === 'latte');
  out.litri = Math.round(righeLatte.reduce((s, x) => s + x.q, 0) * 1000);
  const base = righeLatte.slice().sort((a, b) => b.q - a.q)[0];
  out.prezzoBase = base ? base.prezzo : null;                     // €/1000 L della riga di latte più grande
  out.valoreLatte = r2(righeLatte.reduce((s, x) => s + x.imp, 0));
  out.premi = r2(out.righe.filter((x) => x.tipo !== 'latte' && x.imp > 0).reduce((s, x) => s + x.imp, 0));
  out.trattenute = r2(-out.righe.filter((x) => x.tipo !== 'latte' && x.imp < 0).reduce((s, x) => s + x.imp, 0));
  out.prezzoMedio = out.litri && out.imponibile != null ? r2(out.imponibile / out.litri * 1000) : null;

  // Consegne: "<g/mm/aa> [<n. doc>] <litri>", tre colonne per riga (il n. del documento a volte manca).
  const iTab = t.search(/data\s+n\.\s*doc\.?\s+L\b/i);
  if (iTab >= 0) {
    const tab = t.slice(iTab).split(/media\s*\/\s*gg|Prot\./i)[0];
    const reG = /(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s+(?:(\d+)\s+)?(\d+)(?=\s|$)/g;
    let m;
    while ((m = reG.exec(tab))) {
      out.giorni.push({ data: isoGMA(m[1], m[2], m[3]), ddt: m[4] || null, litri: Number(m[5]) });
    }
    const mMed = t.match(/media\s*\/\s*gg\s+(\d+)/i);
    if (mMed) out.mediaGiorno = Number(mMed[1]);
  }

  // Analisi del mese: "Mese di Ott 2026 05/10/26 08/10/26 … Media Premio/penale", poi una riga per voce.
  const mA = t.match(/Mese\s+di\s+\S+\s+\d{4}\s+((?:\d{1,2}\/\d{1,2}\/\d{2,4}\s*)+)Media/i);
  if (mA) {
    out.analisi = [...mA[1].matchAll(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/g)].map((x) => isoGMA(x[1], x[2], x[3]));
    for (const r of righeTesto) {
      if (/1000\s*L/.test(r)) continue;                              // è una riga della fattura
      const p = PARAM.find(([, re]) => re.test(r));
      if (p) {
        const n = (r.replace(p[1], '').match(/-?[\d.,]+-?/g) || []).map(num).filter((v) => v != null);
        if (!n.length) continue;
        const v = { premio: n[n.length - 1] };
        if (n.length >= 2) v.media = n[n.length - 2];
        const valori = n.slice(0, -2);
        // I valori dei singoli prelievi si legano alle date solo se ci sono tutti (altrimenti non si sa quale manca)
        if (valori.length && valori.length === out.analisi.length) v.valori = valori;
        out.qualita[p[0]] = v;
        continue;
      }
      const mc = r.match(/^PREMIO\s+CERT[^0-9-]*?(-?[\d.,]+-?)$/i);
      if (mc) out.qualita.cert = { premio: num(mc[1]) };
    }
  }

  // Controlli
  const c = out.controlli;
  const giorniTot = out.giorni.reduce((s, g) => s + g.litri, 0);
  c.push({ voce: 'Litri della fattura e somma delle consegne', atteso: out.litri, letto: giorniTot, ok: out.litri > 0 && out.litri === giorniTot });
  const sommaRighe = r2(out.righe.reduce((s, x) => s + x.imp, 0));
  c.push({ voce: 'Righe della fattura e totale imponibile', atteso: out.imponibile, letto: sommaRighe,
    ok: out.imponibile != null && Math.abs(sommaRighe - out.imponibile) <= 0.011 });
  const storte = out.righe.filter((x) => Math.abs(r2(x.q * x.prezzo) - x.imp) > 0.02);
  c.push({ voce: 'Quantità × prezzo di ogni riga', atteso: out.righe.length, letto: out.righe.length - storte.length,
    ok: out.righe.length > 0 && !storte.length, storte: storte.map((x) => x.descr) });
  if (out.iva != null && out.totale != null && out.imponibile != null) {
    const tot = r2(out.imponibile + out.iva);
    c.push({ voce: 'Imponibile + IVA e totale della fattura', atteso: out.totale, letto: tot, ok: Math.abs(tot - out.totale) <= 0.011 });
  }
  const fuori = out.periodo ? out.giorni.filter((g) => g.data < out.periodo.dal || g.data > out.periodo.al) : [];
  const doppi = out.giorni.length - new Set(out.giorni.map((g) => g.data)).size;
  c.push({ voce: 'Giorni dentro il periodo e senza doppioni', atteso: 0, letto: fuori.length + doppi, ok: !fuori.length && !doppi });
  out.ok = c.every((x) => x.ok);
  return out;
}
