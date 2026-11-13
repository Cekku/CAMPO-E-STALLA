// Elenco annuale delle fatture (es. "passive_2025.xlsx" scaricato dal portale fatture):
// si confronta con le fatture caricate per trovare quelle che mancano, quelle in più e gli importi diversi.
import { S } from '../state.js';
import * as store from '../store.js';
import { N, okD, today } from '../util.js';
import { serialeAData } from './xlsx.js';

const r2 = v => Math.round(v * 100) / 100;
const testa = s => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

/** Colonne riconosciute (intestazione normalizzata → campo). */
const CAMPI = [
  ['tipologia', /^(tipologia|tipo documento|tipo doc)$/],
  ['numero', /^(numero|numero fattura|n fattura|numero documento)$/],
  ['data', /^(data fattura|data documento|data emissione|data)$/],
  ['piva', /^partita iva (fornitore|cliente|cedente|cessionario)$|^p ?iva$/],
  ['cf', /^codice fiscale (fornitore|cliente|cedente|cessionario)$/],
  ['nome', /^(denominazione|ragione sociale) (fornitore|cliente|cedente|cessionario)$|^(fornitore|cliente)$/],
  ['totale', /^(totale|totale documento|importo totale|importo)$/],
  ['imponibile', /^imponibile$/],
  ['scadenza', /^data prevista pagamento$/],
  ['pagata', /^pagata$/],
  ['residuo', /^residuo$/],
  ['modalita', /^modalita pagamento$/],
];

/** Cerca nel file Excel un foglio con l'elenco delle fatture. Ritorna null se non c'è. */
export function trovaElenco(fogli, nome = '') {
  for (const [foglio, celle] of Object.entries(fogli)) {
    const perRiga = new Map();
    for (const [ref, v] of Object.entries(celle)) { const m = /^([A-Z]+)(\d+)$/.exec(ref); if (!m) continue; const r = +m[2]; if (!perRiga.has(r)) perRiga.set(r, {}); perRiga.get(r)[m[1]] = v; }
    const righe = [...perRiga.keys()].sort((a, b) => a - b);
    const h = righe.slice(0, 15).find(r => { const t = Object.values(perRiga.get(r)).map(testa); return t.some(x => /^(numero|numero fattura|numero documento)$/.test(x)) && t.some(x => /^data/.test(x)) && t.some(x => /fornitore|cliente|cedente|cessionario/.test(x)); });
    if (!h) continue;
    const col = {}; let tipo = null;
    for (const [c, v] of Object.entries(perRiga.get(h))) {
      const t = testa(v); const k = (CAMPI.find(([, re]) => re.test(t)) || [])[0];
      if (k && !col[k]) col[k] = c;
      if (/fornitore|cedente/.test(t)) tipo = tipo || 'Acquisto'; else if (/cliente|cessionario/.test(t)) tipo = tipo || 'Vendita';
    }
    if (!col.numero || !col.data || !(col.piva || col.nome)) continue;
    if (/passiv|acquist|ricevut/i.test(nome)) tipo = 'Acquisto'; else if (/attiv|vendit|emess/i.test(nome)) tipo = tipo || 'Vendita';
    const out = [];
    for (const r of righe.filter(r => r > h)) {
      const x = perRiga.get(r); const g = k => (col[k] ? x[col[k]] : undefined);
      const numero = testoCella(g('numero')); const nomeC = testoCella(g('nome'));
      if (!numero && !nomeC) continue;
      const tipologia = testoCella(g('tipologia'));
      out.push({
        riga: r, tipologia, nc: /nota\s+di\s+credito|^td0?4$/i.test(tipologia), numero, data: dataCella(g('data')), piva: testoCella(g('piva')), cf: testoCella(g('cf')), nome: nomeC,
        totale: numCella(g('totale')), imponibile: col.imponibile ? numCella(g('imponibile')) : null, scadenza: dataCella(g('scadenza')), pagata: testoCella(g('pagata')), residuo: col.residuo ? numCella(g('residuo')) : null, modalita: testoCella(g('modalita')),
      });
    }
    const anni = {}; out.forEach(f => { const y = +String(f.data || '').slice(0, 4); if (y) anni[y] = (anni[y] || 0) + 1; });
    const anno = +(/(20\d\d)/.exec(nome) || [])[1] || +Object.entries(anni).sort((a, b) => b[1] - a[1]).map(x => x[0])[0] || null;
    return { foglio, tipoF: tipo || 'Acquisto', anno, righe: out };
  }
  return null;
}
const testoCella = v => (v === null || v === undefined ? '' : typeof v === 'number' ? (Number.isInteger(v) ? String(v) : String(v)) : String(v).trim());
function numCella(v) {
  if (typeof v === 'number') return v; let s = String(v ?? '').replace(/[€\s]/g, ''); if (!s) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.'); const n = parseFloat(s); return isFinite(n) ? n : null;
}
function dataCella(v) {
  if (typeof v === 'number') return serialeAData(v);
  const s = String(v ?? '').trim(); if (okD(s.slice(0, 10))) return s.slice(0, 10);
  const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/.exec(s); if (!m) return null;
  const y = m[3].length === 2 ? '20' + m[3] : m[3]; return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

/* ---------------- archivio ---------------- */
export const idElenco = (tipo, anno) => `el-${tipo}-${anno}`;
export const elenchi = () => S.econfig.filter(x => String(x.id).startsWith('el-')).sort((a, b) => b.anno - a.anno || a.tipo.localeCompare(b.tipo));
export const elenco = (tipo, anno) => S.econfig.find(x => x.id === idElenco(tipo, anno)) || null;
export async function salvaElenco(x) {
  if (!x.anno) throw new Error(`Non ho capito di che anno è l'elenco ${x.nome}: scrivi l'anno nel nome del file (es. passive_2025.xlsx).`);
  await store.put('econfig', idElenco(x.tipoF, x.anno), { tipo: x.tipoF, anno: x.anno, file: x.nome, ...(x.imp ? { imp: x.imp } : {}), caricato: today(), righe: x.righe });
}
export const togliElenco = (tipo, anno) => store.remove('econfig', idElenco(tipo, anno));

/* ---------------- confronto ---------------- */
const soloCifre = s => String(s || '').replace(/\D/g, '');
/** Partita IVA senza "IT" e senza spazi; se manca, il codice fiscale. */
const chiaveCp = (piva, cf) => { const p = soloCifre(piva); return p.length >= 11 ? p.slice(-11) : String(cf || piva || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); };
/** Numero di fattura senza spazi, barre e trattini: "1257 /FT-A" = "1257FTA". */
export const numNorm = s => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const numCifre = s => soloCifre(s).replace(/^0+/, '');

/**
 * Confronta l'elenco con le fatture caricate dello stesso tipo.
 * Ritorna { righe: [...esiti dell'elenco], inPiu: [...fatture caricate dell'anno che non sono nell'elenco], conta }.
 * Si abbinano solo fatture dello stesso anno della riga dell'elenco (di solito l'anno dell'elenco): i numeri che
 * ricominciano ogni anno (fatture mensili del latte, sezionali come "26/06") non devono prendere la fattura di un altro anno.
 * Abbinamento, in ordine: partita IVA + numero; partita IVA + sole cifre del numero; partita IVA + data + importo;
 * numero + data + importo (partita IVA diversa o mancante).
 */
export function confronta(el, fattureCaricate) {
  const annoDi = d => +String(d || '').slice(0, 4) || null;
  const pool = fattureCaricate.filter(f => f.tipo === el.tipo).map(f => ({ f, anno: annoDi(f.data), cp: chiaveCp(f.piva), n: numNorm(f.numero), c: numCifre(f.numero), tot: Math.abs(N(f.totale)), usata: false }));
  const out = el.righe.map(e => {
    const anno = annoDi(e.data) || el.anno;
    const prova = (e, test) => pool.find(p => !p.usata && p.anno === anno && test(p));
    const cp = chiaveCp(e.piva, e.cf), n = numNorm(e.numero), c = numCifre(e.numero), tot = Math.abs(N(e.totale));
    const stessoImporto = p => p.tot > 0 && Math.abs(p.tot - tot) <= 0.02;
    let p = prova(e, p => cp && p.cp === cp && n && p.n === n);
    if (!p) p = prova(e, p => cp && p.cp === cp && c && p.c === c);
    if (!p) p = prova(e, p => cp && p.cp === cp && p.f.data === e.data && stessoImporto(p));
    if (!p) p = prova(e, p => n && p.n === n && p.f.data === e.data && stessoImporto(p));
    const r = Object.assign({}, e, { fid: null, stato: 'manca', note: [] });
    if (!p) return r;
    p.usata = true; r.fid = p.f.id; r.caricata = p.f; r.stato = 'ok';
    if (p.tot > 0 && Math.abs(p.tot - tot) > 0.05) { r.stato = 'diversa'; r.note.push(`totale caricato ${p.tot.toLocaleString('it-IT', { minimumFractionDigits: 2 })} €`); }
    if (!(p.tot > 0)) r.note.push('totale non letto nella fattura caricata');
    if (p.f.data !== e.data) { r.stato = 'diversa'; r.note.push('data caricata ' + (p.f.data || '—')); }
    if (p.n !== n) r.note.push('numero caricato ' + p.f.numero);
    if (cp && p.cp !== cp) r.note.push('P.IVA caricata ' + (p.f.piva || '—'));
    return r;
  });
  const inPiu = pool.filter(p => !p.usata && p.anno === el.anno).map(p => p.f);
  const somma = a => r2(a.reduce((t, x) => t + Math.abs(N(x.totale)), 0));
  const man = out.filter(r => r.stato === 'manca'), div = out.filter(r => r.stato === 'diversa');
  return { righe: out, inPiu, conta: { tot: out.length, ok: out.filter(r => r.stato === 'ok').length, manca: man.length, mancaEuro: somma(man), diversa: div.length, inPiu: inPiu.length, inPiuEuro: somma(inPiu) } };
}

/* ---------------- spiegazioni per le fatture da controllare e quelle non nell'elenco ---------------- */
const euro = v => Math.abs(N(v)).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
const gg = d => String(d || '').split('-').reverse().join('/');
/** Perché una riga dell'elenco è "da controllare": testo semplice. */
export function spiegaDiversa(r) {
  const f = r.caricata || {}; const out = [];
  const totE = Math.abs(N(r.totale)), totF = Math.abs(N(f.totale));
  if (totF > 0 && Math.abs(totE - totF) > 0.05) {
    const dif = Math.abs(totE - totF);
    if (N(f.ritenuta) && Math.abs(dif - Math.abs(N(f.ritenuta))) <= 0.05) out.push(`la differenza (${euro(dif)}) è la ritenuta d'acconto: l'elenco e la fattura contano il totale uno prima e l'altro dopo la ritenuta. Va bene così.`);
    else if (f.fonte === 'pdf') out.push(`totale diverso (elenco ${euro(totE)}, fattura ${euro(totF)}): la fattura è stata letta da un PDF e il totale può essere letto male. Apri l'originale e, se serve, carica l'XML dal cassetto fiscale.`);
    else if (Math.abs(totE - N(f.imponibile)) <= 0.05) out.push(`nell'elenco c'è l'imponibile senza IVA (${euro(totE)}) al posto del totale: va bene così.`);
    else out.push(`totale diverso (elenco ${euro(totE)}, fattura ${euro(totF)}): può essere una fattura corretta con una nota di credito o un'altra fattura con lo stesso numero. Controlla l'originale.`);
  }
  if (f.data && r.data && f.data !== r.data) out.push(`data diversa (elenco ${gg(r.data)}, fattura ${gg(f.data)}): spesso nell'elenco c'è la data di ricezione al posto di quella del documento. Se il resto torna, va bene così.`);
  return out.join(' ');
}
/** Perché una fattura caricata non è nell'elenco: testo semplice. */
export function spiegaInPiu(f, el, R, tutte = []) {
  const cp = chiaveCp(f.piva), tot = Math.abs(N(f.totale)), c = numCifre(f.numero);
  const libere = R.righe.filter(r => r.stato === 'manca' && chiaveCp(r.piva, r.cf) === cp);
  const stessoImp = libere.find(r => Math.abs(Math.abs(N(r.totale)) - tot) <= 0.02);
  if (stessoImp) return `nell'elenco c'è la n. ${stessoImp.numero} del ${gg(stessoImp.data)} della stessa ditta con lo stesso importo, risultata mancante: probabilmente è questa con il numero scritto in modo diverso.`;
  const doppia = tutte.find(x => x.id !== f.id && x.tipo === f.tipo && chiaveCp(x.piva) === cp && Math.abs(Math.abs(N(x.totale)) - tot) <= 0.02 && x.data === f.data);
  if (doppia) return `probabile doppione: c'è anche la n. ${doppia.numero} della stessa ditta, con la stessa data e lo stesso importo.`;
  const stessoNum = el.righe.find(r => chiaveCp(r.piva, r.cf) === cp && c && numCifre(r.numero) === c);
  if (stessoNum) return `nell'elenco c'è un numero uguale della stessa ditta ma con data o importo diversi (${gg(stessoNum.data)}, ${euro(stessoNum.totale)}).`;
  const ultima = el.righe.map(r => r.data || '').sort().pop();
  if (ultima && (f.data || '') > ultima) return `è più recente dell'ultima fattura dell'elenco (${gg(ultima)}): l'elenco è stato scaricato prima che arrivasse.`;
  if (/^TD0?4$/i.test(f.tipoDoc || '') || N(f.totale) < 0) return 'è una nota di credito: alcuni elenchi le tengono a parte.';
  if (!cp) return 'manca la partita IVA della ditta: non si può abbinare all\'elenco. Controlla l\'originale.';
  return 'la ditta non ha altre fatture mancanti nell\'elenco: forse è una fattura scartata dallo SdI, un documento che non è una fattura, oppure manca dall\'elenco scaricato.';
}
/** Nota per una fattura dell'elenco che manca, quando il tipo di documento spiega qualcosa. */
export function spiegaManca(r) {
  const t = String(r.tipologia || '');
  if (/acconto|anticipo/i.test(t)) return "acconto su fattura (TD02): di solito lo emette a tuo nome chi ritira il prodotto (per esempio la cooperativa per un conferimento). Si scarica dal cassetto fiscale fra le fatture emesse.";
  if (r.nc || /nota\s+di\s+credito/i.test(t)) return 'nota di credito: scaricala dal cassetto fiscale insieme alle fatture.';
  if (/integrazione|autofattura|reverse|TD1[6-9]/i.test(t)) return 'integrazione o autofattura (inversione contabile): la emetti tu per una fattura ricevuta, si scarica dal cassetto fiscale.';
  return '';
}
