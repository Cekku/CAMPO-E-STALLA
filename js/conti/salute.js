// Indice di salute dell'azienda (dalla 1.34.0): un voto da 0 a 100 costruito dagli indici che l'app già calcola.
// Ogni indice prende un voto confrontandolo con le altre stalle (percentili di Campiotti, medie AIA e CREA)
// o con soglie prudenti; gli indici si raggruppano in aree con un peso. Un indice senza dato, o con un dato
// poco affidabile (bilancino senza ammortamenti, alimenti del conto economico che non tornano con le fatture),
// non conta: finisce nell'elenco dei dati che mancano e abbassa l'affidabilità del voto.
import { S } from '../state.js';
import { N, yearOf } from '../util.js';
import { parametri, ind, calc, datiTecnici, plvAnno, cfg, anniFatture, anniBilancio } from './dati.js';
import { rifAnno, RIF_MANDRIA } from './riferimenti.js';
import { PARAMETRI } from './analisi.js';
import { INDICI } from './schema.js';
import { rls } from './rls.js';
import { anomalie } from './paghe.js';
import { fmtVal } from './tabelle.js';
import { mancantiAnno } from '../views/conti-verifiche.js';

/* ---------- aree ---------- */
export const AREE = [
  { k: 'redd', nome: 'Redditività', peso: 25, icona: 'wallet', spiega: "Quanto guadagna l'azienda: utile per vacca, margine operativo, margine sul litro di latte, prezzo del latte che copre i costi e quanto l'utile dipende dai contributi PAC." },
  { k: 'stalla', nome: 'Produttività della stalla', peso: 20, icona: 'milk', spiega: 'Quanto rende la mandria: litri e PLV per vacca, margine sugli alimenti (IOFC) e fertilità dai controlli AIA (interparto, giorni dal parto al concepimento, età al primo parto).' },
  { k: 'costi', nome: 'Costi e alimentazione', peso: 20, icona: 'tags', spiega: 'Quanto costano alimenti, campagna ed energia rispetto a quello che si vende (PLV) o ai litri prodotti.' },
  { k: 'fin', nome: 'Solidità finanziaria e debiti', peso: 20, icona: 'landmark', spiega: 'Quanto pesano debiti, interessi e ammortamenti, e se i soldi in cassa e da incassare bastano per pagare i debiti a breve. Quasi tutto serve dallo stato patrimoniale.' },
  { k: 'lavoro', nome: 'Lavoro e personale', peso: 10, icona: 'users', spiega: 'Quanto produce ogni unità di lavoro (servono le ULA nei dati tecnici) e se cedolini e pagamenti dei dipendenti sono in regola.' },
  { k: 'dati', nome: 'Qualità dei dati', peso: 5, icona: 'list-checks', spiega: "Quanti controlli sui dati sono a posto: conto economico completo, stato patrimoniale, vacche, unità di lavoro, fatture classificate e senza mancanti. Più è basso, meno ci si può fidare degli altri voti." },
];
export const AFF_MIN = 25; // affidabilità minima per dare il voto
export const AREE_MIN = 3; // aree (oltre alla qualità dei dati) che devono avere un voto
export const SEMAFORO = [[70, 'ok', 'Buona salute'], [50, 'warn', 'Da seguire'], [0, 'bad', 'In difficoltà']];
export const semaforo = v => (v == null ? { cls: 'muted', testo: 'Senza voto' } : (([, cls, testo]) => ({ cls, testo }))(SEMAFORO.find(([s]) => v >= s)));

/* ---------- voti dei singoli indici ---------- */
// interpolazione su punti [valore, voto] in ordine di valore
function lerp(x, pts) {
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) if (x <= pts[i][0]) { const [a, sa] = pts[i - 1], [b, sb] = pts[i]; return b === a ? sb : sa + (sb - sa) * (x - a) / (b - a); }
  return pts[pts.length - 1][1];
}
/** Punti di voto da un riferimento: percentili 10/25/50/75/90 → 20/40/60/80/95, oppure min/media/max → 40/60/80. */
function puntiRif(r) {
  const alto = r.meglio !== 'basso';
  if (r.q) {
    const [q10, q25, q50, q75, q90] = r.q; const v = alto ? [20, 40, 60, 80, 95] : [95, 80, 60, 40, 20];
    return [[q10 - (q25 - q10), alto ? 5 : 100], [q10, v[0]], [q25, v[1]], [q50, v[2]], [q75, v[3]], [q90, v[4]], [q90 + (q90 - q75), alto ? 100 : 5]];
  }
  const lo = r.min ?? r.media * 0.95, me = r.media ?? (r.min + r.max) / 2, hi = r.max ?? r.media * 1.05;
  const v = alto ? [40, 60, 80] : [80, 60, 40];
  return [[lo - (me - lo) * 1.5, alto ? 10 : 95], [lo, v[0]], [me, v[1]], [hi, v[2]], [hi + (hi - me) * 1.5, alto ? 95 : 10]];
}
const mediana = r => (r.q ? r.q[2] : r.media ?? (r.min + r.max) / 2);

const FMT = Object.fromEntries([...PARAMETRI.flatMap(([, v]) => v), ...INDICI.flatMap(([, v]) => v)].map(([k, l, , f]) => [k, { l, f }]));

// Indici dell'indice di salute.
//  da: 'P' parametri della stalla, 'I' indici di bilancio, 'H' mandria AIA, 'X' calcolo proprio (fn)
//  voto: 'rif' (riferimenti), punti [[valore, voto]], funzione (v, c) → voto, oppure 'info' (si mostra, non conta)
//  serve: dati necessari, nell'ordine in cui si chiedono; ce: usa il conto economico (dubbio se incompleto)
//  euro: c → quantità per cui moltiplicare la distanza dalla mediana delle altre stalle (quanto vale in euro)
const DEF = [
  // redditività
  { k: 'utile_v', a: 'redd', da: 'P', voto: 'rif', serve: ['ce', 'vacche'], ce: true, euro: c => c.vacche, eTesto: "di utile in meno rispetto alla stalla mediana" },
  { k: 'ebitdam', a: 'redd', da: 'I', voto: [[0, 10], [0.1, 35], [0.2, 60], [0.3, 85], [0.4, 95]], dir: 1, serve: ['ce'], ce: true, rifTesto: '20% sufficiente, 30% buono', nota: 'EBITDA sul valore della produzione: quanto resta prima di ammortamenti, interessi e imposte.' },
  { k: 'margine_l', a: 'redd', da: 'P', voto: [[-0.1, 5], [-0.05, 25], [0, 50], [0.05, 75], [0.1, 92]], dir: 1, serve: ['ce', 'latte'], ce: true, rifTesto: 'sopra 0 il prezzo copre i costi', euro: c => c.lv, eMeta: 0, eTesto: 'per coprire tutti i costi senza i contributi' },
  { k: 'pareggio_contr', a: 'redd', da: 'P', voto: 'rif', serve: ['ce', 'latte'], ce: true, euro: c => c.lv, eTesto: 'di costi in più rispetto alla stalla mediana (sul prezzo di pareggio)' },
  { k: 'contr_utile', a: 'redd', da: 'P', voto: (v, c) => (c.utile <= 0 ? 10 : lerp(v, [[0, 92], [0.5, 75], [1, 40], [2, 15]])), dir: -1, serve: ['ce'], ce: true, rifTesto: 'sotto il 50% buono, sopra il 100% senza PAC si perde' },
  { k: 'rls_plv', a: 'redd', da: 'P', voto: 'info', dir: 1, serve: ['plv'] },
  // produttività della stalla
  { k: 'l_vacca', a: 'stalla', da: 'P', voto: 'rif', serve: ['vacche', 'latte'], euro: c => c.vacche * c.prezzo, eTesto: 'di latte non prodotto rispetto alla media delle stalle controllate (al tuo prezzo)' },
  { k: 'plv_v', a: 'stalla', da: 'P', voto: 'rif', serve: ['plv', 'vacche'], euro: c => c.vacche, eTesto: 'di PLV in meno rispetto alla stalla mediana' },
  { k: 'iofc_tot_vg', a: 'stalla', da: 'P', voto: 'rif', serve: ['ce', 'vacche'], ce: true, euro: c => c.vacche * c.gg, eTesto: 'di margine sugli alimenti in meno rispetto alla stalla mediana' },
  { k: 'interparto', a: 'stalla', da: 'H', l: 'Interparto medio (giorni, controlli AIA)', f: 'n', voto: [[380, 95], [400, 80], [RIF_MANDRIA.interparto, 60], [460, 40], [500, 15]], dir: -1, serve: ['aia'], rifTesto: `obiettivo sotto 400 · media AIA Nord ${RIF_MANDRIA.interparto}` },
  { k: 'giorni_aperti', a: 'stalla', da: 'H', l: 'Giorni dal parto al concepimento (controlli AIA)', f: 'n', voto: [[90, 95], [120, 80], [RIF_MANDRIA.giorniAperti, 60], [180, 40], [220, 15]], dir: -1, serve: ['aia'], rifTesto: `obiettivo sotto 120 · media AIA Nord ${RIF_MANDRIA.giorniAperti}` },
  { k: 'eta_parto', a: 'stalla', da: 'H', l: 'Età al primo parto (mesi, controlli AIA)', f: 'n1', voto: [[22.5, 95], [24, 80], [RIF_MANDRIA.etaPrimoParto, 60], [27, 40], [29, 15]], dir: -1, serve: ['aia'], rifTesto: `obiettivo 24 · media AIA Nord ${String(RIF_MANDRIA.etaPrimoParto).replace('.', ',')}` },
  { k: 'sau_v', a: 'stalla', da: 'P', voto: 'info', serve: ['sau', 'vacche'] },
  // costi e alimentazione
  { k: 'alim_plv', a: 'costi', da: 'P', voto: 'rif', serve: ['plv'], euro: c => c.plv, eTesto: 'di alimenti comprati in più rispetto alle stalle simili (sulla PLV)' },
  { k: 'camp_plv', a: 'costi', da: 'P', voto: 'rif', serve: ['plv'], euro: c => c.plv, eTesto: 'di costi della campagna in più rispetto alla stalla mediana (sulla PLV)' },
  { k: 'alim_l', a: 'costi', da: 'P', voto: 'rif', serve: ['ce', 'latte'], ce: true, euro: c => c.latte, eTesto: 'di alimenti comprati in più rispetto alla media (per litro)' },
  { k: 'en_l', a: 'costi', da: 'P', voto: 'rif', serve: ['ce', 'latte'], ce: true, euro: c => c.latte, eTesto: 'di energia, acqua e gas in più rispetto alla media (per litro)' },
  { k: 'sv_plv', a: 'costi', da: 'P', voto: 'info', dir: -1, serve: ['plv'] },
  // solidità finanziaria
  { k: 'amm_int_plv', a: 'fin', da: 'P', voto: 'rif', serve: ['ce', 'amm', 'plv'], ce: true },
  { k: 'debito_plv', a: 'fin', da: 'P', voto: 'rif', serve: ['sp', 'plv'] },
  { k: 'pfn_v', a: 'fin', da: 'P', voto: 'rif', serve: ['sp', 'vacche'] },
  { k: 'liqc', a: 'fin', da: 'I', voto: [[0.5, 10], [0.8, 35], [1, 55], [1.3, 75], [2, 95]], dir: 1, serve: ['sp'], rifTesto: 'almeno 1' },
  { k: 'auton', a: 'fin', da: 'I', voto: [[0.1, 10], [0.3, 40], [0.5, 70], [0.7, 90]], dir: 1, serve: ['sp'], rifTesto: 'sopra 30% accettabile, sopra 50% buono' },
  { k: 'pfnebitda', a: 'fin', da: 'I', voto: (v, c) => (c.ebitda <= 0 ? 5 : lerp(v, [[0, 95], [1, 90], [3, 60], [5, 30], [8, 10]])), dir: -1, serve: ['ce', 'sp'], ce: true, rifTesto: 'sotto 3 anni buono, oltre 5 pesante' },
  { k: 'copof', a: 'fin', da: 'I', voto: [[1, 15], [2, 40], [3, 60], [6, 85], [10, 95]], dir: 1, serve: ['ce', 'interessi'], ce: true, rifTesto: 'almeno 3 volte gli interessi' },
  // lavoro
  { k: 'vacche_ula', a: 'lavoro', da: 'P', voto: 'rif', serve: ['vacche', 'ula'] },
  { k: 'latte_ula', a: 'lavoro', da: 'P', voto: 'rif', serve: ['latte', 'ula'] },
  { k: 'red_ula', a: 'lavoro', da: 'P', voto: 'rif', serve: ['ce', 'ula'], ce: true },
  { k: 'paghe', a: 'lavoro', da: 'X', l: 'Irregolarità su cedolini e pagamenti', f: 'n', voto: [[0, 95], [1, 70], [2, 55], [4, 35], [8, 10]], dir: -1, serve: ['paghe', 'pagamenti'], rifTesto: 'nessuna', nota: "Irregolarità gravi dell'anno nella pagina Verifica del personale (gli avvisi minori contano un quarto); quelle ignorate non contano." },
];

// dati necessari: testo per chi legge e pagina dei Conti dove si sistemano
export const SERVE = {
  ce: ["il conto economico dell'anno", 'Carica il bilancino o il bilancio del commercialista', 'importa'],
  sp: ['lo stato patrimoniale', 'Viene con il bilancio di fine anno del commercialista', 'sp'],
  vacche: ['il numero di vacche', "Controlli AIA (almeno 3 nell'anno) o i dati tecnici dell'Analisi della stalla", 'analisi'],
  latte: ['i litri di latte', 'Registro del latte, fatture del latte o controlli AIA', 'analisi'],
  plv: ["le fatture di vendita dell'anno", 'Carica le fatture emesse', 'importa'],
  ula: ['le unità di lavoro (ULA)', "Scrivile nei dati tecnici dell'Analisi della stalla (soci + dipendenti a tempo pieno)", 'analisi'],
  sau: ['la superficie dei campi', 'Disegna o importa i campi nella Campagna', 'analisi'],
  aia: ["i parametri zootecnici AIA dell'anno", 'Carica il PDF dei parametri aziendali in Stalla → Indici e benessere', 'analisi'],
  paghe: ['i cedolini e i bilancini paghe', 'Caricali in Carica documenti', 'importa'],
  pagamenti: ['i pagamenti ai dipendenti', "Carica l'estratto conto o le contabili dei bonifici in Personale → Pagamenti: senza, ogni stipendio risulterebbe non pagato", 'pagamenti'],
  amm: ['gli ammortamenti nel conto economico', 'Arrivano con il bilancio di fine anno del commercialista', 'ce'],
  interessi: ['interessi passivi nel conto economico', 'Nessun interesse: l\'indice non serve', ''],
};

/** "Serve lo stato patrimoniale." / "Servono i cedolini…" */
export const serveFrase = k => (!SERVE[k] ? 'Servono altri dati.' : (/^(i|gli|le) /.test(SERVE[k][0]) ? 'Servono ' : 'Serve ') + SERVE[k][0] + '.');

/** Media dei parametri AIA dell'anno (interparto, giorni aperti, età al primo parto). */
function mandriaAia(y) {
  const st = ((S.config.find(x => x.id === 'aia') || {}).storia || []).filter(x => yearOf(x.data) === y);
  const m = k => { const v = st.map(x => N(x[k])).filter(x => x > 0); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  let eta = m('etaPrimoParto'); if (eta && eta > 60) eta = eta / 30.44; // in giorni nei PDF più vecchi
  return { interparto: m('interparto'), giorni_aperti: m('partoConcepimento'), eta_parto: eta, controlli: st.length };
}

/** Problemi del conto economico dell'anno che rendono poco affidabili gli indici che lo usano. */
export function problemiCe(y) {
  const C = calc(y), ce = C.ce || {}; const out = [];
  if (!C.has || !C.has.ce) return out;
  if (N(ce[62]) < 1) out.push(`Il conto economico del ${y} non ha gli ammortamenti (di solito è un bilancino in corso d'anno): utile, margini e prezzo di pareggio vengono migliori del vero.`);
  const fa = plvAnno(y).alimAcq;
  if (fa && N(ce[30]) < fa * 0.7) out.push(`Gli alimenti acquistati del conto economico del ${y} sono molto più bassi di quelli delle fatture: alcuni conti del bilancino sono finiti in un'altra voce.`);
  return out;
}

/** Tutti gli indici dell'anno con valore, voto e stato: 'ok' (conta), 'manca', 'dubbio', 'info', 'na'. */
export function valuta(y) {
  const P = parametri(y), I = ind(y), C = calc(y), DT = datiTecnici(y), T = DT.val, F = plvAnno(y), H = mandriaAia(y);
  const ce = C.ce || {}; const hasCe = !!(C.has && C.has.ce), hasSp = !!(C.has && C.has.sp);
  const latte = T.latte_prod || T.latte_ven || null, lv = T.latte_ven || T.latte_prod || null;
  const pCe = problemiCe(y);
  // vacche contate dal registro dei capi quando ci sono controlli AIA di altri anni: il registro è stato
  // compilato da poco, quindi per gli anni passati conta le vacche di oggi (o quelle registrate fin qui)
  const aiaTutti = ((S.config.find(x => x.id === 'aia') || {}).storia || []).length;
  const vaccheReg = DT.da.vacche === 'stalla' && aiaTutti > 0 ? `Il numero di vacche del ${y} (${Math.round(T.vacche)}) viene dal registro dei capi, compilato da poco: per gli anni senza controlli AIA non è affidabile. Scrivilo nei dati tecnici dell'Analisi della stalla.` : '';
  // irregolarità del personale: senza i pagamenti caricati quasi tutte sarebbero "stipendio non pagato"
  const ign = new Set(cfg().pagheIgnora || []);
  const conPaghe = S.paghe.length > 0 && S.pagamenti.length > 0;
  const ano = conPaghe ? anomalie().filter(a => !ign.has(a.testo) && (!a.periodo || String(a.periodo).startsWith(String(y)))) : [];
  const paghe = conPaghe ? ano.filter(a => a.liv === 'err').length + ano.filter(a => a.liv === 'warn').length * 0.25 : null;
  const c = { vacche: T.vacche, latte, lv, plv: F.plv, gg: 365, prezzo: P.prezzo_ft || P.prezzo_ce || 0.5, utile: N(ce[105]), ebitda: N(I.ebitda) };
  const ha = {
    ce: hasCe, sp: hasSp, vacche: !!T.vacche, latte: !!latte, plv: !!F.plv, ula: !!T.ula, sau: !!T.sau,
    aia: H.interparto != null || H.giorni_aperti != null || H.eta_parto != null, paghe: S.paghe.length > 0, pagamenti: S.pagamenti.length > 0,
    interessi: !hasCe || N(ce[86]) >= 1, amm: !hasCe || N(ce[62]) >= 1,
  };
  const out = DEF.map(d => {
    const fm = FMT[d.k] || {}; const r = d.voto === 'rif' ? rifAnno(d.k, y) : null;
    const v0 = d.da === 'P' ? P[d.k] : d.da === 'I' ? (hasCe || ['liqc', 'auton'].includes(d.k) ? I[d.k] : null) : d.da === 'H' ? H[d.k] : d.k === 'paghe' ? paghe : null;
    // indici di bilancio che usano solo lo stato patrimoniale: senza SP restano vuoti
    const v = (d.serve.includes('sp') && !hasSp) || v0 == null || !isFinite(v0) ? null : v0;
    const o = { k: d.k, area: d.a, label: d.l || fm.l || d.k, f: d.f || fm.f || 'n', v, voto: null, stato: 'manca', serve: null, perche: '', nota: d.nota || (r && r.n) || '', rif: '', mediana: null, dir: d.dir ?? (r ? (r.meglio === 'alto' ? 1 : r.meglio === 'basso' ? -1 : 0) : 0), euro: null, eTesto: d.eTesto || '', info: d.voto === 'info' };
    const fv = x => fmtVal(x, o.f) || String(x);
    if (r) { o.mediana = mediana(r); o.rif = r.q ? `mediana ${fv(r.q[2])} (metà delle stalle fra ${fv(r.q[1])} e ${fv(r.q[3])})` : r.min != null ? `${fv(r.min)} – ${fv(r.max)}${r.media != null ? ', media ' + fv(r.media) : ''}` : `media ${fv(r.media)}`; } else o.rif = d.rifTesto || '';
    const manca = d.serve.find(s => !ha[s]);
    if (manca === 'interessi') { o.stato = 'na'; o.perche = 'Nessun interesse passivo: non serve.'; return o; }
    if (v == null) { o.serve = manca || null; o.perche = manca ? serveFrase(manca) : 'Non si può calcolare con i dati di oggi.'; return o; }
    if (d.voto === 'info') { o.stato = 'info'; return o; }
    const dubbi = [...(d.ce ? pCe : []), ...(vaccheReg && d.serve.includes('vacche') ? [vaccheReg] : [])];
    if (dubbi.length) { o.stato = 'dubbio'; o.perche = dubbi.join(' '); o.vacche = !!vaccheReg && d.serve.includes('vacche'); o.daCe = !!d.ce && pCe.length > 0; }
    else o.stato = 'ok';
    const vt = d.voto === 'rif' ? (r ? lerp(v, puntiRif(r)) : null) : typeof d.voto === 'function' ? d.voto(v, c) : lerp(v, d.voto);
    o.voto = vt == null ? null : Math.round(Math.max(0, Math.min(100, vt)));
    if (o.voto == null && o.stato === 'ok') o.stato = 'info';
    // quanto vale in euro: distanza dalla mediana (o dall'obiettivo) per la quantità dell'azienda
    if (d.euro && o.dir) {
      const meta = d.eMeta ?? o.mediana; const q = d.euro(c);
      if (meta != null && q && isFinite(q)) { const gap = (meta - v) * o.dir; if (gap > 0) o.euro = Math.round(gap * q); }
    }
    return o;
  });
  return { y, indici: out, ha, pCe, vaccheReg, H, ano, T, F, P, C, inCorso: y === new Date().getFullYear() };
}

/** Controlli sulla qualità dei dati dell'anno: [{ testo, ok, sub, dettaglio, tipo: 'manca' | 'incoerente' }]. */
function controlliDati(y, V) {
  const { C, T, F, P, H } = V; const ce = C.ce || {}; const ch = [];
  const add = (ok, testo, dettaglio, sub, tipo = 'manca') => ch.push({ ok: !!ok, testo, dettaglio, sub, tipo });
  add(C.has.ce, `Conto economico ${y}`, 'Carica il bilancino o il bilancio del commercialista.', 'importa');
  if (C.has.ce) add(N(ce[62]) >= 1, 'Conto economico con gli ammortamenti', V.pCe.find(t => /ammortamenti/.test(t)) || '', 'ce', 'incoerente');
  const fa = F.alimAcq; if (C.has.ce && fa) add(N(ce[30]) >= fa * 0.7, 'Alimenti del conto economico uguali a quelli delle fatture', V.pCe.find(t => /alimenti/.test(t)) || '', 'ce', 'incoerente');
  add(C.has.sp, `Stato patrimoniale ${y}`, 'Serve per debiti, liquidità e autonomia finanziaria: viene con il bilancio di fine anno.', 'sp');
  add(T.vacche && !V.vaccheReg, 'Numero di vacche', V.vaccheReg || SERVE.vacche[1], 'analisi');
  if (S.paghe.length) add(S.pagamenti.length, 'Pagamenti ai dipendenti caricati', SERVE.pagamenti[1] + '.', 'pagamenti');
  add(T.ula, 'Unità di lavoro (ULA)', SERVE.ula[1], 'analisi');
  add(T.sau, 'Superficie dei campi', SERVE.sau[1], 'analisi');
  add(T.latte_prod || T.latte_ven, 'Litri di latte', SERVE.latte[1], 'analisi');
  add(H.controlli >= 3, `Controlli AIA del ${y} (almeno 3)`, SERVE.aia[1], 'analisi');
  const r = rls(y); if (r.sv) add(r.daClass <= 0.05 * r.sv, 'Righe delle fatture classificate', `Ancora ${Math.round(r.daClass).toLocaleString('it-IT')} € di righe "Da classificare": contano come spese varie.`, 'fatture', 'incoerente');
  const daVer = S.fatture.filter(f => yearOf(f.data) === y && !String(f.controllo || '').startsWith('OK')).length;
  if (S.fatture.some(f => yearOf(f.data) === y)) add(!daVer, 'Fatture lette senza differenze', `${daVer === 1 ? '1 fattura' : daVer + ' fatture'} con la somma delle righe diversa dall'imponibile.`, 'fatture', 'incoerente');
  for (const m of mancantiAnno(y)) add(!m.manca, `Fatture ${m.tipo === 'Vendita' ? 'emesse' : 'ricevute'} tutte caricate`, `${m.manca} fatture sono nell'elenco del ${y} ma non sono state caricate.`, 'mancanti', 'incoerente');
  if (P.prezzo_ce && P.prezzo_ft) add(Math.abs(P.prezzo_ce - P.prezzo_ft) / P.prezzo_ft <= 0.06, 'Prezzo del latte uguale fra conto economico e fatture', `Conto economico ${P.prezzo_ce.toFixed(3).replace('.', ',')} €/l, fatture ${P.prezzo_ft.toFixed(3).replace('.', ',')} €/l: manca qualche fattura o il latte è in un'altra voce.`, 'analisi', 'incoerente');
  return ch;
}

/** Indice di salute dell'anno, con aree, affidabilità ed elenchi. */
export function salute(y) {
  const V = valuta(y); const ch = controlliDati(y, V);
  const aree = AREE.map(a => {
    if (a.k === 'dati') { const ok = ch.filter(x => x.ok).length; return Object.assign({}, a, { voto: ch.length ? Math.round(ok / ch.length * 100) : null, contati: ok, totali: ch.length, copertura: 1, indici: [] }); }
    const ix = V.indici.filter(i => i.area === a.k); const conta = ix.filter(i => i.stato === 'ok' && i.voto != null);
    const valutabili = ix.filter(i => i.stato !== 'info' && i.stato !== 'na' && !i.info);
    return Object.assign({}, a, { voto: conta.length ? Math.round(conta.reduce((t, i) => t + i.voto, 0) / conta.length) : null, contati: conta.length, totali: valutabili.length, copertura: valutabili.length ? conta.length / valutabili.length : 0, indici: ix });
  });
  const conVoto = aree.filter(a => a.voto != null);
  const pesi = conVoto.reduce((t, a) => t + a.peso, 0);
  const voto = pesi ? Math.round(conVoto.reduce((t, a) => t + a.voto * a.peso, 0) / pesi) : null;
  // affidabilità: quanta parte del peso delle aree ha davvero dei dati, ridotta per l'anno non finito
  const pesoTot = AREE.filter(a => a.k !== 'dati').reduce((t, a) => t + a.peso, 0);
  let aff = aree.filter(a => a.k !== 'dati').reduce((t, a) => t + a.peso * a.copertura, 0) / pesoTot * 100;
  const motivi = [];
  if (V.inCorso) { aff *= 0.75; motivi.push(`Il ${y} non è finito: fatture e controlli arrivano fino a oggi.`); }
  V.pCe.forEach(t => motivi.push(t));
  const nd = V.indici.filter(i => i.stato === 'manca' && !i.info).length; if (nd) motivi.push(`${nd === 1 ? '1 indice' : nd + ' indici'} senza dato: non contano.`);
  aff = Math.round(aff);
  const affLiv = aff >= 65 ? { cls: 'ok', testo: 'alta' } : aff >= 40 ? { cls: 'warn', testo: 'media' } : { cls: 'bad', testo: 'bassa' };

  // cosa migliorare: indici con voto basso, prima quelli che valgono di più in euro
  const migliorare = V.indici.filter(i => i.stato === 'ok' && i.voto != null && i.voto < 55)
    .map(i => ({ k: i.k, label: i.label, area: i.area, voto: i.voto, v: i.v, f: i.f, rif: i.rif, euro: i.euro, eTesto: i.eTesto }))
    .sort((a, b) => (b.euro || 0) - (a.euro || 0) || a.voto - b.voto);

  // da tenere d'occhio: indici che peggiorano rispetto all'anno prima, dati poco affidabili, incoerenze
  const occhio = [];
  const prima = haDati(y - 1) ? valuta(y - 1) : null;
  if (prima) for (const i of V.indici) {
    const p = prima.indici.find(x => x.k === i.k); if (!p || i.v == null || p.v == null || !i.dir || i.stato === 'dubbio' || p.stato === 'dubbio' || i.stato === 'na') continue;
    const pct = i.f === 'pct'; const d = pct ? i.v - p.v : (i.v - p.v) / Math.abs(p.v || 1);
    if (d * i.dir < (pct ? -0.03 : -0.08)) occhio.push({ tipo: 'peggiora', k: i.k, label: i.label, f: i.f, v: i.v, vp: p.v, d, pct, testo: `${i.label}: peggiora rispetto al ${y - 1}`, nota: V.inCorso ? `Il ${y} non è finito e le fatture del latte arrivano con un mese di ritardo: il calo può dipendere anche da questo.` : '' });
  }
  // dati poco affidabili, in una voce per causa
  const nomi = l => l.map(i => i.label.replace(/ \(.*\)$/, '')).join(', ');
  const dCe = V.indici.filter(x => x.stato === 'dubbio' && x.daCe), dVa = V.indici.filter(x => x.stato === 'dubbio' && x.vacche && !x.daCe);
  if (dCe.length) occhio.push({ tipo: 'dubbio', label: 'Conto economico incompleto', testo: `${dCe.length === 1 ? '1 indice' : dCe.length + ' indici'} del conto economico ${dCe.length === 1 ? 'poco affidabile: non conta' : 'poco affidabili: non contano'}`, det: `${V.pCe.join(' ')} Indici: ${nomi(dCe)}.`, sub: 'ce' });
  if (dVa.length) occhio.push({ tipo: 'dubbio', label: 'Numero di vacche incerto', testo: `${dVa.length === 1 ? '1 indice' : dVa.length + ' indici'} per vacca ${dVa.length === 1 ? 'poco affidabile: non conta' : 'poco affidabili: non contano'}`, det: `${V.vaccheReg} Indici: ${nomi(dVa)}.`, sub: 'analisi' });
  // i controlli del conto economico sono già nella voce qui sopra
  for (const x of ch.filter(x => !x.ok && x.tipo === 'incoerente' && x.sub !== 'ce')) occhio.push({ tipo: 'incoerente', label: x.testo, testo: x.testo + ': da controllare', det: x.dettaglio, sub: x.sub });
  for (const a of V.ano.filter(a => a.liv === 'err').slice(0, 3)) occhio.push({ tipo: 'paghe', label: a.testo, testo: a.testo, det: a.det, sub: 'verifica' });

  // dati che mancano: raggruppati per cosa serve
  const gruppi = new Map();
  for (const i of V.indici.filter(x => x.stato === 'manca')) { const s = i.serve || 'altro'; if (!gruppi.has(s)) gruppi.set(s, []); gruppi.get(s).push(i.label); }
  const mancano = [...gruppi].map(([s, labels]) => ({ serve: s, cosa: SERVE[s] ? SERVE[s][0] : 'altri dati', come: SERVE[s] ? SERVE[s][1] : '', sub: SERVE[s] ? SERVE[s][2] : '', indici: labels }));
  // il voto non si dà sotto il 25% di affidabilità o con meno di 3 aree valutate: sarebbe costruito su pochi indici
  const nAree = aree.filter(a => a.k !== 'dati' && a.voto != null).length;
  const pochi = aff < AFF_MIN || nAree < AREE_MIN;
  if (nAree < AREE_MIN) motivi.push(`Solo ${nAree === 1 ? '1 area su 5 ha' : nAree + ' aree su 5 hanno'} dati sufficienti: per il voto complessivo ne servono almeno ${AREE_MIN}.`);
  return { y, voto: pochi ? null : voto, votoParziale: voto, pochi, sem: pochi ? { cls: 'muted', testo: 'Dati insufficienti' } : semaforo(voto), aff, affLiv, motivi, aree, indici: V.indici, controlli: ch, migliorare, occhio, mancano, inCorso: V.inCorso, V };
}
/** C'è qualcosa da valutare per l'anno? (fatture, bilancio o controlli AIA) */
export const haDati = y => anniFatture().includes(y) || anniBilancio().includes(y);
// voto e affidabilità di un anno (riquadro della Panoramica, confronti negli anni), con la memoria dei calcoli
const BREVI = new Map();
export function saluteMemo(y) {
  const key = [S.fatture, S.bilanci, S.paghe, S.pagamenti, S.config, S.capi, S.eventi, S.latte, S.campi, S.econfig];
  const c = BREVI.get(y); if (c && c.key.every((k, i) => k === key[i])) return c.v;
  const v = salute(y); BREVI.set(y, { key, v }); return v;
}
