// Personale: cedolini, bilancini paghe e pagamenti; quanto è dovuto a ogni dipendente, verifica dei pagamenti e controlli
import { S } from '../state.js';
import * as store from '../store.js';
import { N, okD, today, addDays, diff } from '../util.js';
import { MESI_NOMI, verificaCedolino } from './paghe-parse.js';
import { candidateFatture } from './banca.js';
import { competenzaDaCausale, competenzeDaCausale } from './bonifici-parse.js';
import { scartato } from './scarti.js';

const r2 = v => Math.round(v * 100) / 100;
export const periodo = (anno, mese) => `${anno}-${String(mese).padStart(2, '0')}`;
export const nomeMese = p => { const [y, m] = p.split('-').map(Number); return (m === 13 ? 'Tredicesima' : m === 14 ? 'Quattordicesima' : MESI_NOMI[m - 1]) + ' ' + y; };
export const meseCorto = p => { const [y, m] = p.split('-').map(Number); return (m > 12 ? (m === 13 ? '13ª' : '14ª') : MESI_NOMI[m - 1].slice(0, 3)) + ' ' + String(y).slice(2); };
const slug = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '');
export const chiaveDip = c => c.cf && /^[A-Z0-9]{16}$/.test(c.cf) ? c.cf : 'N-' + slug(c.nome);
// fine del periodo: la tredicesima si paga a dicembre, la quattordicesima a giugno/luglio
const finePeriodo = p => { const [y, m] = p.split('-').map(Number); const mm = m === 13 ? 12 : m === 14 ? 6 : m; return addDays(`${mm === 12 ? y + 1 : y}-${String(mm === 12 ? 1 : mm + 1).padStart(2, '0')}-01`, -1); };
const inizioPeriodo = p => { const [y, m] = p.split('-').map(Number); const mm = m === 13 ? 12 : m === 14 ? 6 : m; return `${y}-${String(mm).padStart(2, '0')}-01`; };
// mese reale di pagamento: tredicesima a dicembre, quattordicesima a giugno
const meseRif = p => { const [y, m] = p.split('-').map(Number); return m === 13 ? `${y}-12` : m === 14 ? `${y}-06` : p; };
const meseSucc = p => { const [y, m] = p.split('-').map(Number); return m >= 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`; };
const mesePrec = p => { const [y, m] = p.split('-').map(Number); return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`; };

export const TIPI_PAG = { stipendio: 'Stipendio', anticipo: 'Anticipo sullo stipendio', prestito: 'Prestito al dipendente', rimborso: 'Restituzione di un prestito', f24: 'F24 (ritenute IRPEF)', contributi: 'Contributi INPS agricoli', fondo: 'Fondo pensione (TFR)', altro: 'Altro' };
export const CON_DIP = new Set(['stipendio', 'anticipo', 'prestito', 'rimborso']);
// come si recupera un anticipo / come rientra una rata di prestito
export const RECUPERO = { stipendio: 'Lo tolgo io dal bonifico dello stipendio', busta: 'Lo trattiene il consulente in busta paga' };
export const COME_RIMB = { stipendio: 'Tolta dal bonifico dello stipendio', busta: 'Trattenuta in busta paga', versato: 'Restituita dal dipendente (bonifico o contanti)' };
/** Mese di competenza scritto nella causale; se l'anno manca e restano due mesi possibili, quello scelto dall'abbinamento. */
export const compCausale = p => { dati(); return RIS.get(p.id) || competenzaDaCausale(p.causale, p.data) || competenzaDaCausale(p.descrizione, p.data, true); };
/** I movimenti che contano come stipendio pagato: bonifici, anticipi e rate tolte dal bonifico. */
const contaComeStipendio = p => p.dip && (p.tipo === 'stipendio' || (p.tipo === 'anticipo' && p.recupero !== 'busta') || (p.tipo === 'rimborso' && p.come === 'stipendio'));
// mesi possibili dalla causale (o dalla descrizione dell'estratto): uno se è sicuro, due se manca l'anno ed è ambiguo
const compCand = p => { if (!(p.tipo === 'stipendio' || p.tipo === 'anticipo' || p.tipo === 'rimborso')) return []; const a = competenzeDaCausale(p.causale, p.data); return a.length ? a : competenzeDaCausale(p.descrizione, p.data, true); };
// mese scelto dall'abbinamento per i pagamenti con la causale ambigua (si rifà a ogni calcolo)
let RIS = new Map();
// mese di competenza: quello indicato; altrimenti quello scritto nella causale (se manca l'anno e restano due mesi, quello
// scelto dall'abbinamento); per gli anticipi il mese del pagamento, per le rate tolte dallo stipendio il mese prima
const compRipiego = p => (p.tipo === 'anticipo' ? (p.data || '').slice(0, 7) : p.tipo === 'rimborso' && p.data ? mesePrec(p.data.slice(0, 7)) : '');
const compDi = p => { if (p.comp) return p.comp; const a = compCand(p); return (a.length === 1 ? a[0] : a.length ? RIS.get(p.id) || a[0] : '') || compRipiego(p); };
export const MODALITA = { bonifico: 'Bonifico', assegno: 'Assegno', contanti: 'Contanti', carta: 'Carta / altro mezzo tracciabile' };
export const cfgPaghe = () => Object.assign({ giornoStipendi: 20, giornoF24: 16 }, ((S.econfig.find(x => x.id === 'cfg') || {}).paghe) || {});

/* ---------------- memoria dei calcoli ---------------- */
let C = null, CK = [];
function dati() {
  if (C && CK[0] === S.paghe && CK[1] === S.pagamenti && CK[2] === S.econfig) return C;
  CK = [S.paghe, S.pagamenti, S.econfig]; C = calcola(); return C;
}
export const cedolini = () => dati().ced;
export const bilanciniPaghe = () => dati().bil;
export const dipendenti = () => dati().dip;
export const verifica = () => dati().ver;
export const anomalie = () => dati().ano;
export const periodi = () => dati().per;
export const pagamenti = () => dati().pag;
export const prestiti = () => dati().pre;
/** Pagamenti abbinati agli stipendi in modo non sicuro (eccedenza, mese pagato in parte, mese della causale ambiguo). */
export const dubbiAbbinamento = () => dati().dab;
export const anniPaghe = () => [...new Set(dati().per.map(p => +p.slice(0, 4)))].sort();

// nome confrontabile: parole maiuscole in ordine alfabetico ("Rossi Mario" = "MARIO ROSSI")
export const nomeChiave = n => String(n || '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim().split(' ').filter(Boolean).sort().join(' ');
/** Nome di un dipendente dalla chiave, anche se non ha ancora cedolini (dal beneficiario dei bonifici). */
export function nomeDi(k) {
  const d = dipendenti().find(x => x.key === k); if (d) return d.nome;
  const p = S.pagamenti.find(x => x.dip === k && x.beneficiario); if (p) return p.beneficiario;
  return String(k || '').replace(/^N-/, '').replace(/-/g, ' ');
}
const periodoOk = p => /^\d{4}-(0[1-9]|1[0-4])$/.test(p || '');
/** Scadenza nell'anno in corso (o dopo): solo lì si controlla se manca da pagare qualcosa. */
export const inCorso = scad => String(scad || '').slice(0, 4) >= today().slice(0, 4);
function calcola() {
  RIS = new Map();
  // "è la stessa persona": le chiavi unite a mano puntano al dipendente scelto
  const unioni = new Map(S.paghe.filter(x => x.tipo === 'unione').map(x => [x.da, x.a]));
  const mk = k => { let n = 0; while (k && unioni.has(k) && n++ < 10) k = unioni.get(k); return k; };
  const ced = S.paghe.filter(x => x.tipo === 'cedolino').map(c => Object.assign({}, c, { periodo: periodo(c.anno, c.mese), dip: mk(c.dip || chiaveDip(c)), dipOrig: c.dip || chiaveDip(c) })).sort((a, b) => a.periodo.localeCompare(b.periodo) || (a.nome || '').localeCompare(b.nome || ''));
  const scartati = ced.filter(c => !periodoOk(c.periodo)); for (let i = ced.length - 1; i >= 0; i--) if (!periodoOk(ced[i].periodo)) ced.splice(i, 1);
  const bil = S.paghe.filter(x => x.tipo === 'bilancino').map(b => Object.assign({}, b, { periodo: periodo(b.anno, b.mese) })).filter(b => periodoOk(b.periodo)).sort((a, b) => a.periodo.localeCompare(b.periodo));
  const tot = S.paghe.filter(x => x.tipo === 'totali').map(b => Object.assign({}, b, { periodo: periodo(b.anno, b.mese) })).filter(b => periodoOk(b.periodo));
  const extra = new Map(); for (const x of S.paghe.filter(x => x.tipo === 'dipendente')) { const k = mk(x.dip); const o = extra.get(k); extra.set(k, o ? Object.assign({}, o, { alias: [o.alias, x.alias].filter(Boolean).join(', ') }) : x); }
  const per = [...new Set([...ced.map(c => c.periodo), ...bil.map(b => b.periodo)])].sort();
  // anagrafica dall'ultimo cedolino
  const dip = new Map();
  for (const c of ced) {
    const d = dip.get(c.dip) || { key: c.dip, ced: [], primo: c.periodo };
    Object.assign(d, { nome: c.nome, cf: c.cf, matricola: c.matricola, qualifica: c.qualifica, mansione: c.mansione, livello: c.livello, assunzione: c.assunzione, scadTD: c.scadTD, scadPermesso: c.scadPermesso, cessazione: c.cessazione, nascita: c.nascita, ultimo: c.periodo, ferie: c.ferie, permessi: c.permessi });
    d.ced.push(c); dip.set(c.dip, d);
  }
  for (const d of dip.values()) { const e = extra.get(d.key) || {}; d.alias = e.alias || ''; d.nota = e.nota || ''; d.uniti = [...unioni.keys()].filter(k => mk(k) === d.key).map(k => ({ key: k, nome: (ced.find(c => c.dipOrig === k) || {}).nome || (S.pagamenti.find(p => p.dip === k && p.beneficiario) || {}).beneficiario || k.replace(/^N-/, '').replace(/-/g, ' ') })); d.td = /T\.?DET|\bTD\b|OTD|STAGION/i.test(d.qualifica || '') || !!d.scadTD; }
  // pagamenti a dipendenti non ancora nei cedolini (chiave dal nome) o riconoscibili dall'IBAN: si collegano alla scheda giusta
  // nomi uguali (omonimi): si distinguono con il nome da mostrare o con l'anno di nascita
  const perCed = new Map(); for (const d of dip.values()) { d.nomeCed = d.nome; const k = nomeChiave(d.nome); perCed.set(k, [...(perCed.get(k) || []), d]); }
  for (const d of dip.values()) { const e = extra.get(d.key) || {}; d.omonimo = perCed.get(nomeChiave(d.nomeCed)).length > 1; d.etichetta = e.etichetta || ''; d.nome = e.etichetta || (d.omonimo ? `${d.nomeCed} (${d.nascita ? 'nato nel ' + d.nascita.slice(0, 4) : 'matr. ' + (d.matricola || '?')})` : d.nomeCed); }
  const perNome = new Map([...perCed].filter(([, ds]) => ds.length === 1).map(([k, ds]) => [k, ds[0].key]));
  for (const d of dip.values()) for (const a of String(d.alias || '').split(',')) if (a.trim()) perNome.set(nomeChiave(a), d.key);
  // IBAN usato per un solo dipendente (un conto cointestato a due dipendenti non riconosce nessuno)
  const perIban0 = new Map(); for (const p of S.pagamenti) if (p.iban && p.dip && dip.has(p.dip)) perIban0.set(p.iban, (perIban0.get(p.iban) || new Set()).add(p.dip));
  const perIban = new Map([...perIban0].filter(([, ks]) => ks.size === 1).map(([i, ks]) => [i, [...ks][0]]));
  // la tabella dei nomi vince sui pagamenti importati (non su quelli assegnati a mano dalla scheda del pagamento)
  const tok = n => String(n || '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim().split(' ').filter(Boolean);
  const alias = [...dip.values()].flatMap(d => aliasDi(d).map(a => ({ k: nomeChiave(a), ws: tok(a), key: d.key })));
  const daTabella = p => {
    if (!alias.length || !CON_DIP.has(p.tipo) || p.dipManuale || p.fonte === 'a mano') return null;
    if (p.beneficiario) { const ks = [...new Set(alias.filter(a => a.k === nomeChiave(p.beneficiario)).map(a => a.key))]; if (ks.length === 1) return ks[0]; if (ks.length) return null; }
    const d = ' ' + tok([p.beneficiario, p.descrizione].filter(Boolean).join(' ')).join(' ') + ' ';
    const hit = alias.filter(a => a.ws.length >= 2 && a.ws.every(w => d.includes(' ' + w + ' ')));
    if (!hit.length) return null; const max = Math.max(...hit.map(a => a.ws.length)); const ks = [...new Set(hit.filter(a => a.ws.length === max).map(a => a.key))];
    return ks.length === 1 ? ks[0] : null;
  };
  const pag = [...S.pagamenti].map(p => {
    const t = daTabella(p); if (t && t !== p.dip) return Object.assign({}, p, { dip: t, daTabella: true });
    if (!p.dip) return p;
    const u = mk(p.dip); if (dip.has(u) || !CON_DIP.has(p.tipo)) return u === p.dip ? p : Object.assign({}, p, { dip: u });
    const k = perNome.get(nomeChiave(p.beneficiario || u.replace(/^N-/, ''))) || (p.iban && perIban.get(p.iban));
    return Object.assign({}, p, { dip: k || u });
  }).sort((a, b) => (a.data || '').localeCompare(b.data || ''));
  const dab = []; const ver = abbina(ced, pag, dab);
  const pre = calcolaPrestiti(pag);
  const ano = controlli(ced, bil, tot, pag, ver, dip, per, pre);
  for (const a of S.paghe.filter(x => x.tipo === 'cedolinoAttesa')) ano.unshift({ anno: +String(a.periodo || '').slice(0, 4) || +today().slice(0, 4), liv: 'warn', testo: `Cedolino da controllare: ${(a.cedolino || {}).nome || ''}, ${periodoOk(a.periodo) ? nomeMese(a.periodo) : ''}`, det: a.motivo === 'diverso' ? "Ne è arrivato uno diverso da quello salvato per lo stesso mese: confrontali e scegli in Da controllare." : `Non passa i controlli (${(a.problemi || []).join('; ')}): confermalo o scartalo in Da controllare.`, dip: a.dip, periodo: a.periodo });
  for (const c of scartati) ano.unshift({ anno: +today().slice(0, 4), liv: 'err', testo: `Cedolino senza mese o anno: ${c.nome || 'dipendente non letto'}`, det: `Nel file ${c.file || ''} non ho letto il mese. Eliminalo da Cedolini e ricaricalo, oppure mandami il PDF.`, cid: c.id });
  for (const d of dip.values()) {
    const v = ver.filter(x => x.dip === d.key);
    Object.assign(d, { mesi: d.ced.length, ore: r2(d.ced.reduce((t, c) => t + N(c.ore), 0)), lordo: r2(d.ced.reduce((t, c) => t + N(c.lordo), 0)), netto: r2(d.ced.reduce((t, c) => t + N(c.netto), 0)), irpef: r2(d.ced.reduce((t, c) => t + N(c.irpef), 0)), ritPrev: r2(d.ced.reduce((t, c) => t + N(c.ritPrev), 0)), pagato: r2(v.reduce((t, x) => t + x.pagato, 0)), dovuto: r2(v.reduce((t, x) => t + x.dovuto, 0)) });
    // "da pagare": solo gli stipendi con scadenza nell'anno in corso (gli anni passati non si controllano più)
    d.saldo = r2(v.filter(x => inCorso(x.scadenza)).reduce((t, x) => t + Math.max(0, x.differenza), 0));
    const ps = pre.filter(x => x.dip === d.key); d.prestiti = ps; d.residuoPrestiti = r2(ps.reduce((t, x) => t + x.residuo, 0));
    d.anticipi = pag.filter(x => x.tipo === 'anticipo' && x.dip === d.key);
    d.anomalie = ano.filter(a => a.dip === d.key);
    d.stato = d.cessazione && d.cessazione < today() ? 'Cessato' : d.scadTD && d.scadTD < today() ? 'Termine scaduto' : 'In forza';
  }
  return { ced, bil, tot, per, dip: [...dip.values()].sort((a, b) => (a.nome || '').localeCompare(b.nome || '')), pag, ver, ano, pre, dab };
}

/* ---------------- prestiti ai dipendenti ---------------- */
// Ogni restituzione va al prestito indicato; se non è indicato, al prestito più vecchio ancora aperto dello stesso dipendente.
function calcolaPrestiti(pag) {
  const pre = pag.filter(p => p.tipo === 'prestito' && p.dip).map(p => ({ id: p.id, dip: p.dip, data: p.data, importo: r2(N(p.importo)), modalita: p.modalita, rata: N(p.rata) || null, descrizione: p.descrizione || '', rimborsi: [], restituito: 0 }));
  for (const r of pag.filter(p => p.tipo === 'rimborso' && p.dip)) {
    let x = r.prestito && pre.find(p => p.id === r.prestito);
    if (!x) x = pre.filter(p => p.dip === r.dip && p.data <= (r.data || '9999') && p.restituito < p.importo - 0.005)[0] || pre.filter(p => p.dip === r.dip).pop();
    if (!x) continue;
    x.rimborsi.push({ id: r.id, data: r.data, importo: r2(N(r.importo)), come: r.come }); x.restituito = r2(x.restituito + N(r.importo));
  }
  for (const x of pre) { x.residuo = r2(Math.max(0, x.importo - x.restituito)); x.stato = x.residuo < 0.01 ? 'restituito' : x.restituito ? 'in restituzione' : 'da restituire'; x.ultimo = x.rimborsi.map(y => y.data).sort().pop() || null; }
  return pre;
}

/* ---------------- pagamenti doppi ---------------- */
const giorni = (a, b) => Math.abs(diff(a, b));
// documento da cui viene un pagamento: l'impronta del file, altrimenti il nome del file (non per quelli scritti a mano)
const origine = p => p.imp || (p.fonte && p.fonte !== 'a mano' ? p.fonte : '');
const idSenzaSpazi = s => String(s || '').replace(/\s/g, '').toUpperCase();
/** Due pagamenti uguali sono di sicuro lo stesso movimento: stesso identificativo della banca (CRO/TRN), oppure
 *  l'identificativo della contabile è scritto nella descrizione dell'estratto conto. */
export function stessoMovimento(a, b) {
  if (a.idBanca && b.idBanca) return idSenzaSpazi(a.idBanca) === idSenzaSpazi(b.idBanca);
  const dentro = (x, y) => idSenzaSpazi(x.idBanca).length >= 8 && idSenzaSpazi([y.descrizione, y.causale].join(' ')).includes(idSenzaSpazi(x.idBanca));
  return dentro(a, b) || dentro(b, a);
}
/** Due pagamenti uguali sono di sicuro due pagamenti veri: righe diverse dello stesso documento (lo stesso estratto
 *  o la stessa distinta li elenca tutti e due), oppure identificativi della banca diversi. */
export const pagamentiDistinti = (a, b) => (a.id !== b.id && !!origine(a) && origine(a) === origine(b)) || (!!a.idBanca && !!b.idBanca && idSenzaSpazi(a.idBanca) !== idSenzaSpazi(b.idBanca));
/** Codice di una coppia di pagamenti forse doppi (lo stesso in qualunque ordine). */
export const idCoppia = (a, b) => 'pg-doppio-' + [a.id, b.id].sort().join('+');
/** Coppie di pagamenti che sembrano lo stesso movimento: stesso tipo e dipendente, stesso importo, date entro 5 giorni, fonti diverse o stessa data. */
export function doppi(pag) {
  const out = []; const ps = pag.filter(p => p.dip && CON_DIP.has(p.tipo) && p.data).sort((a, b) => a.data.localeCompare(b.data));
  for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) {
    const a = ps[i], b = ps[j]; if (giorni(a.data, b.data) > 5) break;
    if (a.tipo !== b.tipo || a.dip !== b.dip || Math.abs(N(a.importo) - N(b.importo)) > 0.01) continue;
    if (a.comp && b.comp && a.comp !== b.comp) continue;
    if (pagamentiDistinti(a, b) || scartato(idCoppia(a, b))) continue; // due pagamenti veri (anche detto da te in Da controllare)
    if (a.data === b.data || (a.fonte || 'a mano') !== (b.fonte || 'a mano') || (a.idBanca && a.idBanca === b.idBanca)) out.push([a, b]);
  }
  return out;
}
/** Segna come "già registrato" le righe da importare che corrispondono a un pagamento già salvato o a un'altra riga dello stesso caricamento. */
export function segnaDoppi(righe) {
  const dips = dipendenti(); const salvati = pagamenti();
  const stesso = (r, p) => Math.abs(N(r.importo) - N(p.importo)) < 0.01 && r.data && p.data && giorni(r.data, p.data) <= 5 && (
    (r.dip && p.dip && r.dip === p.dip) || (r.iban && p.iban && r.iban === p.iban) || (r.beneficiario && p.beneficiario && nomeChiave(r.beneficiario) === nomeChiave(p.beneficiario)));
  const visti = [];
  for (const r of righe) {
    if (r.entrata || r.tipo === 'fattura' || r.tipo === 'ignora') { visti.push(r); continue; }
    // due righe dello stesso documento sono due pagamenti veri (1.63): non si segnano come doppie
    const stessoDoc = (a, b) => !!origine(a) && origine(a) === origine(b);
    const giaP = !r.gia && salvati.find(p => p.id !== r.id && CON_DIP.has(p.tipo) && stesso(r, p) && !stessoDoc(r, p) && !pagamentiDistinti(r, p));
    const giaR = visti.find(x => !x.entrata && stesso(r, x) && !stessoDoc(r, x));
    if (giaP || giaR) { r.gia = true; r.sel = false; r.stessoGiorno = (giaP || giaR).data === r.data; r.doppio = giaP ? `già registrato il ${String(giaP.data).split('-').reverse().join('/')} da ${giaP.fonte || 'inserimento a mano'}` : 'uguale a un altro movimento di questo caricamento'; }
    visti.push(r);
  }
  for (const r of righe.filter(r => r.tipo === 'fattura' && !r.gia)) {
    const f = S.fatture.find(f => (r.fatt || []).includes(f.id) && (f.pagamentiBanca || []).some(x => x.mov !== r.id && Math.abs(Math.abs(N(x.importo)) - N(r.importo)) < 0.01 && giorni(x.data, r.data) <= 5));
    if (f) { r.gia = true; r.sel = false; r.doppio = `fattura ${f.numero} già segnata come pagata con un movimento uguale`; }
  }
  return righe;
}

/* ---------------- abbinamento dei pagamenti agli stipendi ---------------- */
// Da quando uno stipendio si può pagare: dal mese dopo; la tredicesima da dicembre, la quattordicesima da giugno.
export const pagabileDa = p => { const [y, m] = p.split('-').map(Number); if (m === 13) return `${y}-12-01`; if (m === 14) return `${y}-06-01`; return meseSucc(p) + '-01'; };
// 1) I pagamenti con il mese indicato (a mano, dalla causale, anticipi) vanno a quel mese, e si contano per primi.
// 1b) Quelli con il mese nella causale ma senza l'anno, quando restano due mesi possibili (1.63): vale il mese ancora da
//     pagare. Un mese è possibile se ha il cedolino non ancora saldato, oppure se non ha il cedolino ma viene dopo l'ultimo
//     cedolino del dipendente (non è ancora arrivato). Se restano tutti e due, il più vicino alla data, ed è un dubbio.
// 2) Gli altri, in ordine di data, vanno ai mesi già maturati alla data del pagamento e non ancora saldati:
//    prima quello con il residuo uguale all'importo, poi dal più vecchio. Un pagamento non va mai a un mese
//    che alla sua data non era ancora pagabile, salvo che non ci sia nient'altro da saldare (anticipo).
// 3) Quello che avanza va all'ultimo mese saldato con quel pagamento (pagato in più).
// In `dubbi` (1.63) i pagamenti abbinati in modo non sicuro: eccedenza messa su un mese, mese lasciato pagato in parte
// o mese della causale ambiguo; solo per le scadenze dell'anno in corso, e non quelli confermati (`abbOk` = firma).
const scadDi = (periodo, g = cfgPaghe().giornoStipendi) => `${meseSucc(meseRif(periodo))}-${String(Math.min(28, g)).padStart(2, '0')}`;
const firmaAbb = mesi => mesi.map(m => `${m.periodo}:${r2(m.v)}`).join(',');
function abbina(ced, pag, dubbi = []) {
  const nuoveRighe = () => { const righe = []; for (const c of ced) { const o = righe.find(r => r.dip === c.dip && r.periodo === c.periodo); if (o) { o.dovuto = r2(o.dovuto + N(c.netto)); continue; } righe.push({ dip: c.dip, nome: c.nome, periodo: c.periodo, dovuto: r2(N(c.netto)), pagato: 0, pag: [], cid: c.id }); } return righe; };
  const ord = (a, b) => pagabileDa(a.periodo).localeCompare(pagabileDa(b.periodo)) || a.periodo.localeCompare(b.periodo);
  const aperta = r => r.pagato < r.dovuto - 0.005;
  const perData = (a, b) => (a.data || '').localeCompare(b.data || '') || String(a.id).localeCompare(String(b.id));
  const sp = pag.filter(contaComeStipendio);
  const cand = new Map(sp.map(p => [p.id, p.comp ? [p.comp] : compCand(p)]));
  const conMese = sp.filter(p => cand.get(p.id).length === 1 || (!cand.get(p.id).length && compRipiego(p)));
  const ambigui = sp.filter(p => cand.get(p.id).length > 1).sort(perData);
  const auto = sp.filter(p => !cand.get(p.id).length && !compRipiego(p)).sort(perData);
  const ultimoCed = new Map(); for (const c of ced) if (!ultimoCed.has(c.dip) || c.periodo > ultimoCed.get(c.dip)) ultimoCed.set(c.dip, c.periodo);
  // un giro di abbinamento sulle righe date; `scelte` = mese deciso per i pagamenti con il mese ambiguo
  const giro = (righe, lista, scelte) => {
    const extra = [], tracce = [];
    const senza = (p, periodo, v, voce) => { const o = extra.find(e => e.dip === p.dip && e.periodo === periodo); if (o) { o.pagato = r2(o.pagato + v); o.pag.push(voce(v)); } else extra.push({ dip: p.dip, nome: p.beneficiario || '', periodo, dovuto: 0, pagato: v, pag: [voce(v)], senzaCedolino: true }); };
    for (const p of lista) {
      let resto = r2(N(p.importo)); if (resto <= 0) continue;
      const voce = v => ({ id: p.id, data: p.data, importo: v, modalita: p.modalita, tot: N(p.importo), tipo: p.tipo });
      const t = { p, mesi: [], eccedenza: 0 };
      const metti = (r, v) => { r.pagato = r2(r.pagato + v); r.pag.push(voce(v)); resto = r2(resto - v); t.mesi.push({ r, periodo: r.periodo, v }); };
      const cs = cand.get(p.id); let comp = '';
      if (cs.length === 1) comp = cs[0];
      else if (cs.length > 1) { const s = scelte.get(p.id); comp = s.comp; if (!s.sicuro) t.mese = { cand: cs, scelta: comp }; }
      else if (compRipiego(p)) comp = compRipiego(p);
      if (comp) { const r = righe.find(r => r.dip === p.dip && r.periodo === comp); if (r) metti(r, resto); else senza(p, comp, resto, voce); if (t.mese) tracce.push(t); continue; }
      const data = p.data || today();
      const mie = righe.filter(r => r.dip === p.dip).sort(ord);
      const maturate = mie.filter(r => pagabileDa(r.periodo) <= data && aperta(r));
      let lista2;
      if (maturate.length) { const es = maturate.find(r => Math.abs(r2(r.dovuto - r.pagato) - resto) < 0.01); lista2 = es ? [es, ...maturate.filter(r => r !== es)] : maturate; }
      else { const prossima = mie.find(r => aperta(r) && pagabileDa(r.periodo) > data); lista2 = prossima ? [prossima] : []; }
      let ultima = null;
      for (const r of lista2) { if (resto <= 0.005) break; metti(r, Math.min(resto, r2(r.dovuto - r.pagato))); ultima = r; }
      if (resto > 0.005) {
        // nessun mese da saldare: è lo stipendio del mese prima della data (se il suo cedolino non c'è, "senza cedolino")
        const naturale = mesePrec(data.slice(0, 7));
        const dove = ultima || mie.find(r => r.periodo === naturale);
        if (dove) { t.eccedenza = resto; metti(dove, resto); } else senza(p, naturale, resto, voce);
      }
      if (t.mesi.length) tracce.push(t);
    }
    return { extra, tracce };
  };
  // mese ambiguo: prima un giro di prova senza quei pagamenti, per sapere quali mesi restano davvero da pagare;
  // sicuro solo se resta un mese possibile ed è il più vicino alla data (altrimenti è un dubbio)
  const scelte = new Map();
  if (ambigui.length) {
    const prova = nuoveRighe(); giro(prova, [...conMese, ...auto], scelte);
    for (const p of ambigui) {
      const cs = cand.get(p.id); const ultimo = ultimoCed.get(p.dip) || '';
      const poss = cs.filter(P => { const r = prova.find(r => r.dip === p.dip && r.periodo === P); return r ? aperta(r) : P > ultimo; });
      const comp = poss[0] || cs[0]; scelte.set(p.id, { comp, sicuro: poss.length === 1 && comp === cs[0] }); RIS.set(p.id, comp);
    }
  }
  const righe = nuoveRighe();
  const { extra, tracce } = giro(righe, [...conMese, ...ambigui, ...auto], scelte);
  const g = cfgPaghe().giornoStipendi;
  // abbinamenti non sicuri: si guardano alla fine, quando tutti i pagamenti sono al loro posto
  for (const t of tracce) {
    // un mese per riga (l'eccedenza messa sullo stesso mese si somma)
    const mesi = []; for (const m of t.mesi) { const o = mesi.find(x => x.periodo === m.periodo); if (o) o.v = r2(o.v + m.v); else mesi.push({ periodo: m.periodo, v: m.v }); }
    const tipo = t.mese ? 'mese' : t.eccedenza > 0.005 ? 'eccedenza' : t.mesi.some(m => m.r.pagato < m.r.dovuto - 0.005) ? 'parziale' : '';
    if (!tipo) continue;
    const periodoP = t.mese ? t.mese.scelta : t.mesi[t.mesi.length - 1].periodo;
    if (!(t.mese ? t.mese.cand : [periodoP]).some(x => inCorso(scadDi(x, g)))) continue; // mese ambiguo: basta che uno dei due sia dell'anno in corso
    const firma = t.mese ? 'mese:' + t.mese.cand.join('|') : firmaAbb(mesi);
    if (t.p.abbOk && t.p.abbOk === firma) continue;
    const r = t.mesi.find(m => m.periodo === periodoP);
    dubbi.push({ tipo, pid: t.p.id, dip: t.p.dip, data: t.p.data, importo: r2(N(t.p.importo)), mesi, eccedenza: r2(t.eccedenza), firma, periodo: periodoP, residuo: r ? r2(r.r.dovuto - r.r.pagato) : null, ...(t.mese ? { cand: t.mese.cand, scelta: t.mese.scelta } : {}) });
  }
  const out = [...righe, ...extra].map(r => {
    const diffV = r2(r.dovuto - r.pagato);
    const scad = scadDi(r.periodo, g);
    const ultimo = r.pag.map(x => x.data).sort().pop() || null;
    let stato;
    if (r.senzaCedolino || (r.dovuto === 0 && r.pagato > 0)) stato = 'senza cedolino';
    else if (Math.abs(diffV) < 0.01) stato = 'pagato';
    else if (diffV < 0) stato = 'pagato in più';
    else if (r.pagato > 0) stato = 'pagato in parte';
    else stato = today() > scad ? 'non pagato' : 'da pagare';
    return Object.assign(r, { differenza: diffV, scadenza: scad, ultimo, stato, ritardo: ultimo && ultimo > scad ? diff(scad, ultimo) : stato === 'non pagato' ? diff(scad, today()) : 0 });
  });
  return out.sort((a, b) => a.periodo.localeCompare(b.periodo) || (a.nome || '').localeCompare(b.nome || ''));
}

/* ---------------- controlli e irregolarità ---------------- */
function controlli(ced, bil, tot, pag, ver, dip, per, pre) {
  const A = []; const add = (liv, testo, det, o = {}) => A.push(Object.assign({ liv, testo, det }, o));
  const nomeDi = k => (dip.get(k) || {}).nome || (S.pagamenti.find(x => x.dip === k && x.beneficiario) || {}).beneficiario || String(k || '').replace(/^N-/, '').replace(/-/g, ' ');
  const t = today(); const eu = v => Number(v).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
  // cedolini: controlli interni
  for (const c of ced) {
    for (const k of (c.controlli || []).filter(k => k.esito !== 'OK')) add('warn', `Cedolino di ${(dip.get(c.dip) || c).nome}, ${nomeMese(c.periodo)}: ${k.d.toLowerCase()}`, k.esito, { dip: c.dip, periodo: c.periodo });
    if (N(c.netto) <= 0) add('err', `Netto a zero o negativo per ${(dip.get(c.dip) || c).nome} a ${nomeMese(c.periodo)}`, 'Controlla il cedolino con il consulente del lavoro.', { dip: c.dip, periodo: c.periodo });
    const fine = finePeriodo(c.periodo), ini = inizioPeriodo(c.periodo);
    if (c.scadTD && c.scadTD < ini && !c.cessazione) add('err', `Contratto a termine scaduto: ${(dip.get(c.dip) || c).nome}`, `Il termine era il ${c.scadTD.split('-').reverse().join('/')}, ma c'è il cedolino di ${nomeMese(c.periodo)}. Serve una proroga o una trasformazione a tempo indeterminato.`, { dip: c.dip, periodo: c.periodo });
    if (c.scadPermesso && c.scadPermesso < fine) add('warn', `Permesso di soggiorno scaduto: ${(dip.get(c.dip) || c).nome}`, `Scadenza indicata sul cedolino di ${nomeMese(c.periodo)}: ${c.scadPermesso.split('-').reverse().join('/')}. Verifica di avere la ricevuta della domanda di rinnovo e fai aggiornare la data al consulente.`, { dip: c.dip, periodo: c.periodo });
  }
  // contratti e permessi in scadenza: dalla 1.66.0 li segnala lo scadenziario (conti/personale-auto.js), con le date
  // prese anche da UNILAV, contratti e permessi e le scelte fatte nel Centro; qui restano solo i mesi mancanti
  for (const d of dip.values()) {
    if (d.cessazione && d.cessazione < t) continue;
    // mesi mancanti: dipendente presente prima e dopo, ma non in un mese caricato
    const suoi = new Set(d.ced.map(c => c.periodo));
    const mesiNorm = per.filter(p => +p.slice(5) <= 12 && p >= d.primo && p <= d.ultimo);
    for (const p of mesiNorm) if (!suoi.has(p) && ced.some(c => c.periodo === p)) add('warn', `Manca il cedolino di ${d.nome} per ${nomeMese(p)}`, 'Il dipendente ha cedolini prima e dopo questo mese. Se era in aspettativa o non ha lavorato, ignora l\'avviso.', { dip: d.key, periodo: p });
  }
  // pagamenti degli stipendi
  for (const v of ver) {
    const nome = (dip.get(v.dip) || {}).nome || v.nome || nomeDi(v.dip);
    const ora = inCorso(v.scadenza); // anni passati: non si controlla più cosa manca da pagare
    if (v.stato === 'non pagato' && ora) add('err', `Stipendio non pagato: ${nome}, ${nomeMese(v.periodo)}`, `Netto ${eu(v.dovuto)}, scadenza ${v.scadenza.split('-').reverse().join('/')}.`, { dip: v.dip, periodo: v.periodo, ver: true });
    if (v.stato === 'pagato in parte' && ora) add('warn', `Stipendio pagato in parte: ${nome}, ${nomeMese(v.periodo)}`, `Netto ${eu(v.dovuto)}, pagato ${eu(v.pagato)}: mancano ${eu(v.differenza)}.`, { dip: v.dip, periodo: v.periodo, ver: true });
    if (v.stato === 'pagato in più') add('warn', `Pagato più del netto: ${nome}, ${nomeMese(v.periodo)}`, `Netto ${eu(v.dovuto)}, pagato ${eu(v.pagato)} (${eu(-v.differenza)} in più). Se era un anticipo del mese dopo, indica il mese sul pagamento.`, { dip: v.dip, periodo: v.periodo, ver: true });
    if (v.stato === 'senza cedolino') add('warn', `Pagamento senza cedolino: ${nome}, ${nomeMese(v.periodo)}`, `${eu(v.pagato)} pagati, ma non c'è un cedolino per quel mese.`, { dip: v.dip, periodo: v.periodo, ver: true });
    if (v.ultimo && v.ritardo > 0 && v.stato !== 'non pagato') add('info', `Stipendio pagato in ritardo: ${nome}, ${nomeMese(v.periodo)}`, `Pagato il ${v.ultimo.split('-').reverse().join('/')}, ${v.ritardo} giorni dopo il giorno ${cfgPaghe().giornoStipendi} del mese successivo.`, { dip: v.dip, periodo: v.periodo });
  }
  for (const p of pag) {
    if (p.tipo === 'anticipo' && p.modalita === 'contanti') add('err', `Anticipo sullo stipendio in contanti: ${(dip.get(p.dip) || {}).nome || nomeDi(p.dip)} il ${(p.data || '').split('-').reverse().join('/')}`, 'Anche gli anticipi della retribuzione vanno pagati con mezzi tracciabili (legge 205/2017).', { dip: p.dip, pid: p.id });
    if (p.tipo === 'prestito' && p.modalita === 'contanti' && N(p.importo) >= 5000) add('err', `Prestito in contanti oltre il limite: ${(dip.get(p.dip) || {}).nome || nomeDi(p.dip)}`, `${eu(N(p.importo))} in contanti: il limite per i pagamenti in contanti è 4.999,99 €. Fai un bonifico o un assegno non trasferibile.`, { dip: p.dip, pid: p.id });
    if (CON_DIP.has(p.tipo) && p.tipo !== 'stipendio' && !p.dip) add('warn', `${TIPI_PAG[p.tipo]} senza dipendente`, `${eu(N(p.importo))} del ${(p.data || '').split('-').reverse().join('/')}: indica a chi è andato.`, { pid: p.id });
    if (p.tipo === 'anticipo' && p.recupero === 'busta' && p.dip) { const comp = compDi(p); const c = ced.find(c => c.dip === p.dip && c.periodo === comp); if (c && !(c.voci || []).some(v => v.trattenuta && /accont|anticip|prestit/i.test(v.descrizione || '')) && !N(c.acconti)) add('warn', `Anticipo non trattenuto in busta: ${c.nome}, ${nomeMese(comp)}`, `Hai dato ${eu(N(p.importo))} il ${(p.data || '').split('-').reverse().join('/')}, ma nel cedolino di ${nomeMese(comp)} non c'è una trattenuta per acconti o anticipi. Avvisa il consulente, oppure segna che lo togli tu dal bonifico.`, { dip: p.dip, pid: p.id }); }
    if (p.tipo === 'stipendio' && p.modalita === 'contanti') add('err', `Stipendio pagato in contanti: ${(dip.get(p.dip) || {}).nome || ''} il ${(p.data || '').split('-').reverse().join('/')}`, 'Dal 1° luglio 2018 retribuzioni e anticipi si pagano solo con mezzi tracciabili (bonifico, assegno, pagamento elettronico): legge 205/2017, sanzione da 1.000 a 5.000 €.', { dip: p.dip, pid: p.id });
    if (p.tipo === 'stipendio' && !p.dip) add('warn', 'Pagamento di stipendio senza dipendente', `${eu(N(p.importo))} del ${(p.data || '').split('-').reverse().join('/')}: indica a chi è andato.`, { pid: p.id });
  }
  for (const x of pre) { const d = dip.get(x.dip); if (x.residuo > 0.005 && d && d.cessazione && d.cessazione < t) add('warn', `Prestito non restituito: ${d.nome}`, `Il rapporto è cessato il ${d.cessazione.split('-').reverse().join('/')} e restano ${eu(x.residuo)} del prestito del ${(x.data || '').split('-').reverse().join('/')}.`, { dip: x.dip, pid: x.id }); }
  // doppioni: stesso dipendente, stesso importo, date a pochi giorni (es. la contabile del bonifico e poi l'estratto conto)
  for (const [a, b] of doppi(pag)) add('err', `Stesso pagamento registrato due volte: ${(dip.get(a.dip) || {}).nome || nomeDi(a.dip) || ''}`.trim(), `${eu(N(a.importo))} il ${(a.data || '').split('-').reverse().join('/')} (${a.fonte || 'a mano'}) e il ${(b.data || '').split('-').reverse().join('/')} (${b.fonte || 'a mano'}). Se è lo stesso bonifico eliminane uno da Pagamenti, altrimenti ignora l'avviso.`, { pid: b.id, dip: a.dip });
  // bilancino contro cedolini
  for (const b of bil) {
    const cs = ced.filter(c => c.periodo === b.periodo);
    if (!cs.length) { add('warn', `Bilancino paghe di ${nomeMese(b.periodo)} senza cedolini`, 'Carica il PDF dei cedolini del mese per avere il dettaglio per dipendente e controllare i pagamenti.', { periodo: b.periodo }); continue; }
    const sL = r2(cs.reduce((t, c) => t + N(c.lordo), 0)), sN = r2(cs.reduce((t, c) => t + N(c.netto), 0));
    if (Math.abs(sL - N(b.lordo)) > 0.05) add('warn', `${nomeMese(b.periodo)}: i lordi dei cedolini non tornano con il bilancino`, `Cedolini ${eu(sL)}, bilancino ${eu(N(b.lordo))}. Forse manca un cedolino.`, { periodo: b.periodo });
    if (Math.abs(sN - N(b.netto)) > 0.05) add('warn', `${nomeMese(b.periodo)}: i netti dei cedolini non tornano con il bilancino`, `Cedolini ${eu(sN)}, netto pagato nel bilancino ${eu(N(b.netto))}.`, { periodo: b.periodo });
    for (const k of (b.controlli || []).filter(k => k.esito !== 'OK')) add('warn', `Bilancino paghe di ${nomeMese(b.periodo)}: ${k.d.toLowerCase()}`, k.esito, { periodo: b.periodo });
  }
  for (const p of [...new Set(ced.map(c => c.periodo))]) if (+p.slice(5) <= 12 && !bil.some(b => b.periodo === p)) add('info', `Manca il bilancino paghe di ${nomeMese(p)}`, 'Senza bilancino non si conoscono i contributi a carico dell\'azienda e il costo totale del mese.', { periodo: p });
  for (const tt of tot) { const cs = ced.filter(c => c.periodo === tt.periodo); const sN = r2(cs.reduce((t, c) => t + N(c.netto), 0)); if (tt.netto != null && Math.abs(sN - tt.netto) > 0.05) add('warn', `${nomeMese(tt.periodo)}: mancano cedolini rispetto ai totali generali`, `Somma dei netti ${eu(sN)}, totale generale ${eu(tt.netto)}${tt.dipendenti ? ` (${tt.dipendenti} dipendenti)` : ''}.`, { periodo: tt.periodo }); }
  // versamenti: F24 delle ritenute entro il 16 del mese dopo, contributi agricoli per trimestre
  for (const v of versamenti(bil, pag)) {
    if ((v.stato === 'non pagato' || v.stato === 'pagato in parte') && !inCorso(v.scadenza)) continue;
    if (v.stato === 'non pagato') add('err', `${v.tipoNome} di ${v.nome} non registrato`, `Dovuti ${eu(v.dovuto)} entro il ${v.scadenza.split('-').reverse().join('/')}. Se l'hai pagato, registra il pagamento.`, { periodo: v.periodo, vers: true });
    else if (v.stato === 'pagato in parte') add('warn', `${v.tipoNome} di ${v.nome} pagato in parte`, `Dovuti ${eu(v.dovuto)}, registrati ${eu(v.pagato)}.`, { periodo: v.periodo, vers: true });
    else if (v.ritardo > 0) add('info', `${v.tipoNome} di ${v.nome} pagato in ritardo`, `Pagato il ${v.ultimo.split('-').reverse().join('/')}, scadenza ${v.scadenza.split('-').reverse().join('/')}: verifica il ravvedimento.`, { periodo: v.periodo });
  }
  // anno di ogni avviso: dal mese del cedolino, dalla data del pagamento, altrimenti l'anno in corso
  const annoOggi = +t.slice(0, 4);
  for (const a of A) { const pd = a.pid && (pag.find(p => p.id === a.pid) || {}).data; a.anno = a.periodo ? +String(a.periodo).slice(0, 4) : pd ? +pd.slice(0, 4) : annoOggi; }
  const ord = { err: 0, warn: 1, info: 2 };
  return A.sort((a, b) => b.anno - a.anno || ord[a.liv] - ord[b.liv] || String(b.periodo || '').localeCompare(String(a.periodo || '')));
}

/** Versamenti dovuti (F24 mensile delle ritenute, contributi agricoli per trimestre, TFR al fondo) e pagamenti registrati. */
export function versamenti(bil = bilanciniPaghe(), pag = pagamenti()) {
  const out = []; const g = cfgPaghe().giornoF24; const t = today();
  // F24: ritenute IRPEF e addizionali del mese, entro il 16 del mese successivo
  for (const b of bil) if (N(b.irpef) > 0) out.push({ tipo: 'f24', tipoNome: 'F24 ritenute', periodo: b.periodo, nome: nomeMese(b.periodo), dovuto: r2(N(b.irpef)), scadenza: `${meseSucc(meseRif(b.periodo))}-${String(g).padStart(2, '0')}` });
  // contributi agricoli (operai): l'INPS li chiede per trimestre; scadenze 16/9, 16/12, 16/3, 16/6
  const trim = new Map();
  for (const b of bil) { const [y, m] = meseRif(b.periodo).split('-').map(Number); const q = Math.ceil(m / 3); const k = `${y}-T${q}`; const o = trim.get(k) || { tipo: 'contributi', tipoNome: 'Contributi INPS agricoli', periodo: k, nome: `${q}° trimestre ${y}`, dovuto: 0, mesi: [] }; o.dovuto = r2(o.dovuto + N(b.contribDebito)); o.mesi.push(b.periodo); trim.set(k, o); }
  const SC = { 1: [0, '09-16'], 2: [0, '12-16'], 3: [1, '03-16'], 4: [1, '06-16'] };
  for (const o of trim.values()) { if (!o.dovuto) continue; const [y, q] = [+o.periodo.slice(0, 4), +o.periodo.slice(-1)]; o.scadenza = `${y + SC[q][0]}-${SC[q][1]}`; out.push(o); }
  // TFR al fondo pensione: per trimestre
  const fondo = new Map();
  for (const b of bil) { if (!N(b.tfrFpc)) continue; const [y, m] = meseRif(b.periodo).split('-').map(Number); const q = Math.ceil(m / 3); const k = `${y}-T${q}`; const o = fondo.get(k) || { tipo: 'fondo', tipoNome: 'TFR al fondo pensione', periodo: k, nome: `${q}° trimestre ${y}`, dovuto: 0 }; o.dovuto = r2(o.dovuto + N(b.tfrFpc)); fondo.set(k, o); }
  for (const o of fondo.values()) { const [y, q] = [+o.periodo.slice(0, 4), +o.periodo.slice(-1)]; o.scadenza = q === 4 ? `${y + 1}-01-20` : `${y}-${String(q * 3 + 1).padStart(2, '0')}-20`; out.push(o); }
  // abbinamento: pagamento con periodo indicato, altrimenti il più vecchio aperto dello stesso tipo
  for (const o of out) Object.assign(o, { pagato: 0, pag: [] });
  // da quando si può versare: F24 dal mese dopo; contributi e fondo dalla fine del trimestre
  for (const o of out) { if (o.tipo === 'f24') o.da = meseSucc(meseRif(o.periodo)) + '-01'; else { const [y, q] = [+o.periodo.slice(0, 4), +o.periodo.slice(-1)]; o.da = q === 4 ? `${y + 1}-01-01` : `${y}-${String(q * 3 + 1).padStart(2, '0')}-01`; } }
  // 1.66.0: un movimento collegato a una quietanza (avviso del consulente o modello F24 letti dall'archivio) si divide
  // come dice il documento (ritenute del mese e contributi del trimestre). Gli altri F24 dello stesso giorno sono altri
  // tributi (IVA, IMU…), e un F24 con il codice fiscale di una persona non è delle paghe dell'azienda: non si contano.
  const vp = []; const giorniQ = pag.filter(p => p.quietanza && Array.isArray(p.ripartito) && p.ripartito.some(x => x.tipo === 'f24') && p.data).map(p => p.data);
  for (const p of pag.filter(p => ['f24', 'contributi', 'fondo'].includes(p.tipo))) {
    if (Array.isArray(p.ripartito) && p.ripartito.length) { for (const x of p.ripartito) vp.push(Object.assign({}, p, { tipo: x.tipo, comp: x.periodo, importo: x.importo, confermato: true, saldo: !!x.saldo })); continue; }
    if (p.tipo === 'f24' && !p.comp && (/Cod\.?\s*Fiscale\s*:?\s*[A-Z]{6}[0-9L-V]{2}[A-Z][0-9L-V]{2}[A-Z][0-9L-V]{3}[A-Z]\b/i.test(p.descrizione || '') || giorniQ.some(d => Math.abs(diff(d, p.data || d)) <= 3))) continue;
    vp.push(p);
  }
  for (const p of [...vp.filter(p => p.comp), ...vp.filter(p => !p.comp).sort((a, b) => (a.data || '').localeCompare(b.data || ''))]) {
    let resto = r2(N(p.importo)); const metti = (o, v) => { o.pagato = r2(o.pagato + v); o.pag.push({ id: p.id, data: p.data, importo: v, ...(p.confermato ? { confermato: true, quietanza: p.quietanza, ...(p.saldo ? { saldo: true } : {}) } : {}) }); resto = r2(resto - v); };
    const stessi = out.filter(o => o.tipo === p.tipo).sort((a, b) => a.scadenza.localeCompare(b.scadenza)); if (!stessi.length) continue;
    if (p.comp) { const o = stessi.find(o => o.periodo === p.comp); if (o) { metti(o, resto); continue; } }
    const data = p.data || today(); const aperte = stessi.filter(o => o.pagato < o.dovuto - 0.005);
    const maturi = aperte.filter(o => o.da <= data);
    const es = maturi.find(o => Math.abs(r2(o.dovuto - o.pagato) - resto) < 0.01);
    const lista = maturi.length ? (es ? [es, ...maturi.filter(o => o !== es)] : maturi) : aperte.slice(0, 1);
    let ultima = null; for (const o of lista) { if (resto <= 0.005) break; metti(o, Math.min(resto, r2(o.dovuto - o.pagato))); ultima = o; }
    if (resto > 0.005) metti(ultima || stessi.filter(o => o.da <= data).pop() || stessi[0], resto);
  }
  for (const o of out) {
    // importo accettato da Marco (es. i contributi agricoli calcolati dall'INPS, diversi dalla stima dei bilancini): vale quello versato
    if (o.pag.length && o.pag.every(x => x.confermato) && o.pag.some(x => x.saldo)) { o.calcolato = o.dovuto; o.dovuto = o.pagato; }
    o.differenza = r2(o.dovuto - o.pagato); o.ultimo = o.pag.map(x => x.data).sort().pop() || null;
    // il dovuto F24 è solo la parte stipendi: se si paga di più (altri tributi nello stesso F24) va bene
    o.stato = o.pagato >= o.dovuto - 0.01 ? (o.tipo !== 'f24' && o.pagato > o.dovuto + 0.01 ? 'pagato in più' : 'pagato') : o.pagato > 0 ? 'pagato in parte' : t > o.scadenza ? 'non pagato' : 'da pagare';
    o.ritardo = o.ultimo && o.ultimo > o.scadenza ? diff(o.scadenza, o.ultimo) : 0;
    // pagato e confermato: tutto il dovuto viene da movimenti collegati a un documento letto
    o.confermato = o.stato === 'pagato' && o.pag.length > 0 && o.pag.every(x => x.confermato);
  }
  return out.sort((a, b) => a.scadenza.localeCompare(b.scadenza));
}

/* ---------------- costi per il conto economico ---------------- */
/** Costi del personale di un anno dalle paghe: { salari, oneri, tfr, mesi, fonte } o null. */
export function costiAnno(y) {
  const bs = bilanciniPaghe().filter(b => b.anno === y);
  if (bs.length) return { salari: r2(bs.reduce((t, b) => t + N(b.lordo), 0)), oneri: r2(bs.reduce((t, b) => t + N(b.contribDitta), 0)), tfr: r2(bs.reduce((t, b) => t + N(b.tfrFpc), 0)), costo: r2(bs.reduce((t, b) => t + N(b.costo), 0)), mesi: new Set(bs.map(b => Math.min(12, b.mese))).size, fonte: 'bilancini paghe' };
  const cs = cedolini().filter(c => c.anno === y);
  if (cs.length) return { salari: r2(cs.reduce((t, c) => t + N(c.lordo), 0)), oneri: null, tfr: r2(cs.reduce((t, c) => t + N(c.tfrFondo), 0)), costo: null, mesi: new Set(cs.map(c => Math.min(12, c.mese))).size, fonte: 'cedolini' };
  return null;
}

/* ---------------- salvataggio ---------------- */
// numeri che dicono se due cedolini sono lo stesso (lo stesso PDF caricato due volte)
const NUMERI_CED = ['netto', 'lordo', 'totComp', 'totTratt', 'ore', 'irpef', 'ritPrev'];
const ugualeCed = (a, b) => (a.cf || '') === (b.cf || '') && NUMERI_CED.every(k => Math.abs(N(a[k]) - N(b[k])) < 0.005);
const cedDelMese = per => S.paghe.filter(p => p.tipo === 'cedolino' && periodo(p.anno, p.mese) === per);
/**
 * I cedolini di un mese contro il bilancino paghe dello stesso mese: true se lordi e netti tornano, false se non tornano
 * e i cedolini sono tanti quanti i dipendenti del bilancino, null se non si può dire (niente bilancino, cedolini mancanti).
 */
export function quadraBilancino(per, cs) {
  const b = S.paghe.find(x => x.tipo === 'bilancino' && periodo(x.anno, x.mese) === per); if (!b) return null;
  const sN = r2(cs.reduce((t, c) => t + N(c.netto), 0)), sL = r2(cs.reduce((t, c) => t + N(c.lordo), 0));
  const ok = (!N(b.netto) || Math.abs(sN - N(b.netto)) <= 0.05) && (!N(b.lordo) || Math.abs(sL - N(b.lordo)) <= 0.05);
  if (ok) return true;
  return b.nDip && cs.length === b.nDip ? false : null;
}
/** Cedolini arrivati ma non salvati: diversi da quello già salvato per lo stesso mese, o che non passano i controlli. */
export const cedoliniInAttesa = () => S.paghe.filter(x => x.tipo === 'cedolinoAttesa');
/**
 * Salva i cedolini letti (1.63: senza perdere né rovinare quelli già salvati).
 * - lo stesso cedolino già salvato (stessi numeri): niente da fare;
 * - un cedolino diverso per lo stesso dipendente e mese lo sostituisce solo se passa i controlli (verificaCedolino) ed è
 *   davvero un rifacimento: quello salvato non li passava, oppure con il nuovo il mese torna con il bilancino paghe e con
 *   il vecchio no. Altrimenti resta "in attesa" (paghe, id ca-<mese>-<dipendente>) con i due a confronto in Da controllare;
 * - un cedolino nuovo si salva; con { auto: true } (automatico dei documenti) solo se passa i controlli e il mese non
 *   litiga con il bilancino, altrimenti resta in attesa.
 * Ritorna { nuovi, sostituiti, uguali, inAttesa }.
 */
export async function salvaCedolini(x, { auto = false } = {}) {
  const rows = []; let uguali = 0; const attesa = []; const togli = new Set();
  const presenti = new Map(S.paghe.filter(p => p.tipo === 'cedolino').map(p => [p.id, p]));
  const scelte = [];
  for (const c of x.cedolini) {
    const dip = chiaveDip(c); const per = periodo(c.anno, c.mese); const id = `c-${per}-${dip}`;
    const old = presenti.get(id); const v = verificaCedolino(c);
    const data = Object.assign({ tipo: 'cedolino', dip, file: x.nome, ...(x.imp ? { imp: x.imp } : {}), caricato: today() }, c);
    const s = { id, dip, per, c: data, old, v };
    // lo stesso cedolino: i numeri non cambiano, si aggiornano solo gli altri campi letti (scadenze, voci, impronta)
    if (old && ugualeCed(old, c)) { uguali++; const { id: _i, ...vecchi } = old; rows.push({ col: 'paghe', id, data: Object.assign(vecchi, data, { caricato: old.caricato || data.caricato, ...(old.imp && !x.imp ? { imp: old.imp } : {}) }) }); togli.add(`ca-${per}-${dip}`); continue; }
    if (old) {
      // il mese con il nuovo al posto del vecchio, e con il vecchio
      const altri = cedDelMese(per).filter(p => p.id !== id);
      const conNuovo = quadraBilancino(per, [...altri, data]), conVecchio = quadraBilancino(per, [...altri, old]);
      const rifacimento = v.ok && (!verificaCedolino(old).ok || (conNuovo === true && conVecchio !== true));
      if (rifacimento) scelte.push(Object.assign(s, { sost: true })); else attesa.push(Object.assign(s, { motivo: 'diverso' }));
      continue;
    }
    if (v.ok || !auto) scelte.push(s); else attesa.push(Object.assign(s, { motivo: 'controlli' }));
  }
  // automatico: se con i nuovi il mese non torna con il bilancino (e ci sono tutti), niente di quel mese si salva da solo
  if (auto) for (const per of [...new Set(scelte.map(s => s.per))]) {
    const delMese = scelte.filter(s => s.per === per); const ids = new Set(delMese.map(s => s.id));
    if (quadraBilancino(per, [...cedDelMese(per).filter(p => !ids.has(p.id)), ...delMese.map(s => s.c)]) !== false) continue;
    for (const s of delMese) { scelte.splice(scelte.indexOf(s), 1); attesa.push(Object.assign(s, { motivo: s.old ? 'diverso' : 'controlli', bilancino: true })); }
  }
  for (const s of scelte) { rows.push({ col: 'paghe', id: s.id, data: s.c }); togli.add(`ca-${s.per}-${s.dip}`); }
  for (const s of attesa) {
    const problemi = [...s.v.problemi, ...(s.bilancino ? ['i totali dei cedolini del mese non tornano con il bilancino paghe'] : [])];
    rows.push({ col: 'paghe', id: `ca-${s.per}-${s.dip}`, data: { tipo: 'cedolinoAttesa', dip: s.dip, periodo: s.per, motivo: s.motivo, problemi, avvisi: s.v.avvisi, vecchio: s.old ? s.id : '', vecchioNum: s.old ? Object.fromEntries([...NUMERI_CED, 'cf'].map(k => [k, s.old[k] ?? null])) : null, file: x.nome, ...(x.imp ? { imp: x.imp } : {}), caricato: today(), cedolino: s.c } });
  }
  // i totali generali del PDF solo se almeno un suo cedolino è salvato (o era già uguale)
  if (x.totali && (scelte.length || uguali)) rows.push({ col: 'paghe', id: `t-${periodo(x.totali.anno, x.totali.mese)}`, data: Object.assign({ tipo: 'totali', file: x.nome, ...(x.imp ? { imp: x.imp } : {}) }, x.totali) });
  // un cedolino salvato chiude l'attesa dello stesso dipendente e mese (non deve poterlo sovrascrivere dopo)
  for (const s of attesa) togli.delete(`ca-${s.per}-${s.dip}`);
  if (rows.length) await store.bulkPut(rows);
  for (const id of togli) if (S.paghe.some(p => p.id === id)) await store.remove('paghe', id);
  return { nuovi: scelte.filter(s => !s.sost).length, sostituiti: scelte.filter(s => s.sost).length, uguali, inAttesa: attesa.length };
}
/** Conferma un cedolino in attesa: prende il posto di quello salvato per lo stesso dipendente e mese. */
export async function confermaCedolino(idAttesa) {
  const a = S.paghe.find(x => x.id === idAttesa && x.tipo === 'cedolinoAttesa'); if (!a || !a.cedolino) return false;
  // solo se il cedolino salvato è ancora quello di quando è nata l'attesa (nessuno, o lo stesso di allora)
  const ora = S.paghe.find(x => x.id === `c-${a.periodo}-${a.dip}` && x.tipo === 'cedolino');
  if (a.vecchio ? !ora || !a.vecchioNum || !ugualeCed(ora, a.vecchioNum) : !!ora) return false;
  await store.put('paghe', `c-${a.periodo}-${a.dip}`, a.cedolino); await store.remove('paghe', idAttesa); return true;
}
/** Scarta un cedolino in attesa: resta quello già salvato. */
export async function scartaCedolino(idAttesa) { await store.remove('paghe', idAttesa); }
export async function salvaBilancinoPaghe(x) {
  const { voci, ...b } = x.bil;
  await store.put('paghe', `b-${periodo(b.anno, b.mese)}`, Object.assign({ tipo: 'bilancino', file: x.nome, ...(x.imp ? { imp: x.imp } : {}), caricato: today(), voci }, b));
}

/* ---------------- movimenti bancari (CSV o Excel della banca) ---------------- */
const parseImp = s => { if (typeof s === 'number') return s; s = String(s ?? '').trim().replace(/\s|€|EUR/gi, ''); if (!s) return null; let neg = false; if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); } if (/-$/.test(s)) { neg = true; s = s.slice(0, -1); } if (/^[+-]/.test(s)) { neg = s[0] === '-'; s = s.slice(1); } if (s.includes(',') && s.includes('.')) s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, ''); else if (s.includes(',')) s = s.replace(',', '.'); else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, ''); const v = parseFloat(s); return isFinite(v) ? (neg ? -v : v) : null; };
const parseData = v => {
  if (typeof v === 'number' && v > 20000 && v < 80000) return new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 864e5).toISOString().slice(0, 10);
  const s = String(v ?? '').trim(); let m;
  if ((m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/.exec(s))) { const y = m[3].length === 2 ? '20' + m[3] : m[3]; return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; }
  if ((m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s))) return `${m[1]}-${m[2]}-${m[3]}`;
  return null;
};
function splitCsv(txt) {
  const prima = txt.split(/\r?\n/).slice(0, 20).join('\n');
  const sep = [';', '\t', ',', '|'].map(c => [c, (prima.match(new RegExp(c === '|' ? '\\|' : c, 'g')) || []).length]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = []; let r = [], f = '', q = false;
  for (let i = 0; i < txt.length; i++) {
    const ch = txt[i];
    if (q) { if (ch === '"') { if (txt[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += ch; continue; }
    if (ch === '"') q = true; else if (ch === sep) { r.push(f); f = ''; } else if (ch === '\n' || ch === '\r') { if (ch === '\r' && txt[i + 1] === '\n') i++; r.push(f); rows.push(r); r = []; f = ''; } else f += ch;
  }
  if (f || r.length) { r.push(f); rows.push(r); }
  return rows.filter(r => r.some(x => String(x).trim()));
}
/** Estrae i movimenti in uscita da una tabella di righe (intestazione riconosciuta da sola).
 *  Con { tutti: true } anche le entrate, con l'importo col segno (uscite negative): estratto conto da Carica documenti (1.45.1). */
export function movimentiDaRighe(rows, { tutti = false } = {}) {
  const low = r => r.map(x => String(x ?? '').toLowerCase().trim());
  const hi = rows.slice(0, 40).findIndex(r => { const l = low(r); return l.some(x => /^data|data (contabile|operazione|valuta)/.test(x)) && l.some(x => /importo|uscit|dare|addebit|avere|entrat|accredit|ammontare/.test(x)); });
  if (hi < 0) throw new Error('Non trovo le colonne: servono almeno "Data" e "Importo" (oppure "Uscite"/"Dare").');
  const h = low(rows[hi]);
  const iData = h.findIndex(x => /data (contabile|operazione)/.test(x)) >= 0 ? h.findIndex(x => /data (contabile|operazione)/.test(x)) : h.findIndex(x => /^data/.test(x));
  const iUsc = h.findIndex(x => /uscit|^dare|addebit/.test(x)), iEnt = h.findIndex(x => /entrat|^avere|accredit/.test(x)), iImp = h.findIndex(x => /importo|ammontare/.test(x));
  // la colonna del codice ABI della causale ("26") non serve nella descrizione
  const iDesc = h.map((x, i) => (/descri|causal|benefic|dettagl|operazion|note|ordinante|controparte|motivo/.test(x) && !/\babi\b|_abi/.test(x) && i !== iData && !/^data/.test(x) ? i : -1)).filter(i => i >= 0);
  const out = [];
  for (const r of rows.slice(hi + 1)) {
    const data = parseData(r[iData]); if (!data) continue;
    const descrizione = iDesc.map(i => String(r[i] ?? '').trim()).filter(Boolean).join(' · ').replace(/\s+/g, ' ');
    // righe del saldo iniziale e finale (es. "Saldo iniziale" nella colonna Avere): non sono movimenti
    // (solo i saldi veri: "Saldo fattura 45" o "Saldo stipendio" sono movimenti)
    if (/^saldo\s+(iniziale|finale|contabile|disponibile|liquido|precedente|al\b)/i.test(descrizione)) continue;
    let v = null;
    if (tutti) {
      const u = iUsc >= 0 ? parseImp(r[iUsc]) : null, e = iEnt >= 0 ? parseImp(r[iEnt]) : null;
      if (u) v = -Math.abs(u); else if (e) v = Math.abs(e); else if (iImp >= 0) v = parseImp(r[iImp]);
      if (!v) continue;
      out.push({ data, importo: r2(v), descrizione }); continue;
    }
    if (iUsc >= 0) { const u = parseImp(r[iUsc]); if (u) v = Math.abs(u); else continue; }
    else if (iImp >= 0) { const x = parseImp(r[iImp]); if (x == null || x >= 0) continue; v = -x; }
    if (!v) continue;
    out.push({ data, importo: r2(v), descrizione });
  }
  return out;
}
/** Movimenti con il segno (entrate e uscite) da un CSV di estratto conto; errore se non ha le colonne di un estratto. */
export function movimentiCsv(bytes) {
  let txt = new TextDecoder('utf-8').decode(bytes); if (txt.includes('�')) txt = new TextDecoder('windows-1252').decode(bytes);
  return movimentiDaRighe(splitCsv(txt.replace(/^﻿/, '')), { tutti: true });
}
export async function leggiMovimenti(nome, bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (b[0] === 0x50 && b[1] === 0x4b) {
    const { leggiXlsx } = await import('./xlsx.js');
    const W = await leggiXlsx(b); let err;
    for (const sh of Object.values(W)) {
      const rows = []; for (const [ref, v] of Object.entries(sh)) { const m = /^([A-Z]+)(\d+)$/.exec(ref); if (!m) continue; const ci = [...m[1]].reduce((t, c) => t * 26 + c.charCodeAt(0) - 64, 0) - 1; const ri = +m[2] - 1; (rows[ri] = rows[ri] || [])[ci] = v; }
      try { const mv = movimentiDaRighe(rows.filter(Boolean).map(r => Array.from(r, x => x ?? ''))); if (mv.length) return mv; } catch (e) { err = e; }
    }
    throw err || new Error('Nessun movimento in uscita trovato nel file Excel.');
  }
  let txt = new TextDecoder('utf-8').decode(b); if (txt.includes('�')) txt = new TextDecoder('windows-1252').decode(b);
  return movimentiDaRighe(splitCsv(txt.replace(/^﻿/, '')));
}
export const aliasDi = d => String((d && d.alias) || '').split(',').map(a => a.trim()).filter(Boolean);
// codice fiscale di una persona scritto in una causale o in una descrizione
const CF_RE = /\b[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]\b/g;
/**
 * Riconosce dalla descrizione a chi o a cosa va un movimento (1.63: mai un dipendente a caso).
 * Il codice fiscale scritto nel movimento vince su tutto. Più dipendenti possibili → `ambigui` (da scegliere);
 * nome trovato solo in parte nella descrizione, o codice fiscale di un'altra persona → `incerto` (da controllare).
 */
export function riconosci(m, dips = dipendenti()) {
  const amb = ds => ({ tipo: 'stipendio', dip: '', ambigui: [...new Set(ds.map(d => d.key || d))] });
  const nc = d => nomeChiave(d.nomeCed || d.nome);
  // 0) codice fiscale del dipendente nella causale o nella descrizione
  const cfs = [...new Set(String([m.beneficiario, m.descrizione, m.causale].filter(Boolean).join(' ')).toUpperCase().match(CF_RE) || [])];
  if (cfs.length) { const ds = dips.filter(d => d.cf && cfs.includes(d.cf)); if (ds.length === 1) return { tipo: 'stipendio', dip: ds[0].key, daCf: true }; if (ds.length > 1) return amb(ds); }
  // c'è un codice fiscale che non è di nessun dipendente: il nome da solo non basta per esserne sicuri
  const ok = r => (r && r.dip && cfs.length ? Object.assign(r, { incerto: true }) : r);
  // 1) nome scritto esattamente come uno dei nomi associati nella tabella (vince sempre)
  if (m.beneficiario) {
    const k = nomeChiave(m.beneficiario);
    const a = dips.filter(d => aliasDi(d).some(x => nomeChiave(x) === k)); if (a.length === 1) return ok({ tipo: 'stipendio', dip: a[0].key }); if (a.length > 1) return amb(a);
  }
  // 2) IBAN già usato per un solo dipendente, e il nome non è di un altro dipendente
  if (m.iban) {
    const ks = [...new Set(S.pagamenti.filter(x => x.iban === m.iban && x.dip && x.tipo === 'stipendio').map(p => (dips.find(d => d.key === p.dip) || dips.find(d => !d.omonimo && nc(d) === nomeChiave(p.beneficiario)) || {}).key).filter(Boolean))];
    const altro = m.beneficiario && dips.some(d => !ks.includes(d.key) && nc(d) === nomeChiave(m.beneficiario));
    if (ks.length === 1 && !altro) return ok({ tipo: 'stipendio', dip: ks[0] });
    if (ks.length > 1) { const n = m.beneficiario ? ks.filter(k => { const d = dips.find(d => d.key === k); return d && !d.omonimo && nc(d) === nomeChiave(m.beneficiario); }) : []; return n.length === 1 ? ok({ tipo: 'stipendio', dip: n[0] }) : amb(ks); }
  }
  // 3) nome uguale a quello del cedolino
  if (m.beneficiario) { const k = nomeChiave(m.beneficiario); const n = dips.filter(d => nc(d) === k); if (n.length === 1) return ok({ tipo: 'stipendio', dip: n[0].key }); if (n.length > 1) return amb(n); }
  // 3b) nome già usato in un pagamento registrato (anche di chi non ha ancora cedolini): solo se sempre per la stessa persona
  if (m.beneficiario) {
    const k = nomeChiave(m.beneficiario); const ks = [...new Set(S.pagamenti.filter(x => x.dip && CON_DIP.has(x.tipo) && x.beneficiario && nomeChiave(x.beneficiario) === k).map(x => x.dip))];
    if (ks.length === 1 && !(dips.find(d => d.key === ks[0]) || {}).omonimo) return ok({ tipo: 'stipendio', dip: ks[0] });
    if (ks.length > 1) return amb(ks);
  }
  // 4) nome dentro la descrizione: i nomi della tabella contano anche le iniziali (es. "ROSSI MARIO G")
  const d = ' ' + String([m.beneficiario, m.descrizione].filter(Boolean).join(' ')).toUpperCase().replace(/[^A-Z0-9]+/g, ' ') + ' ';
  const parole = (n, min) => String(n || '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim().split(' ').filter(w => w.length >= min);
  const punti = new Map();
  for (const p of dips) {
    let sc = 0;
    for (const ws of aliasDi(p).map(a => parole(a, 1))) if (ws.length && ws.every(w => d.includes(' ' + w + ' '))) sc = Math.max(sc, 30 + ws.length);
    const ws = parole(p.nomeCed || p.nome, 2); const hit = ws.filter(w => d.includes(' ' + w + ' ')).length;
    sc = Math.max(sc, hit === ws.length && ws.length ? 10 + hit : hit >= 2 ? hit : 0);
    if (sc) punti.set(p, sc);
  }
  const max = Math.max(0, ...punti.values()); const migliori = [...punti].filter(([, v]) => v === max).map(([p]) => p);
  // nome intero (o della tabella) = sicuro; solo alcune parole del nome = da controllare
  if (migliori.length === 1) return ok(Object.assign({ tipo: 'stipendio', dip: migliori[0].key }, max < 10 ? { incerto: true } : {}));
  if (migliori.length > 1) return amb(migliori);
  if (/\bF24\b|DELEGA|AGENZIA ENTRATE|TRIBUT/.test(d)) return { tipo: 'f24' };
  if (/\bINPS\b|CONTRIBUT|PAGOPA.*INPS/.test(d)) return { tipo: 'contributi' };
  if (/FONDO PENS|PREVID|ALLEATA|\bTFR\b/.test(d)) return { tipo: 'fondo' };
  if (/STIPEND|SALARI|EMOLUM|RETRIBUZ|BUSTA PAGA/.test(d)) return { tipo: 'stipendio' };
  return null;
}
export const idPagamento = p => { const k = [p.data, r2(N(p.importo)), String(p.descrizione || '').slice(0, 80)].join('|'); let h = 0x811c9dc5; for (let i = 0; i < k.length; i++) { h ^= k.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return 'p' + h.toString(36); };
export { mesePrec, meseSucc, inizioPeriodo, finePeriodo };

/** Pagamenti da registrare a partire dalle contabili di bonifico lette. */
export function righeBonifici(bon, file) { return segnaDoppi(righeBonifici0(bon, file)); }
function righeBonifici0(bon, file) {
  const presenti = new Set([...S.pagamenti.map(p => p.id), ...S.fatture.flatMap(f => (f.pagamentiBanca || []).map(p => p.mov))]); const dips = dipendenti(); const gia = new Map(); const visti = new Set();
  return bon.map(b => {
    const m = { data: b.data, importo: r2(b.importo), descrizione: [b.beneficiario, b.causale].filter(Boolean).join(' · '), beneficiario: b.beneficiario, iban: b.iban };
    let r = riconosci(m, dips);
    if ((!r || (r.tipo === 'stipendio' && !r.dip && !r.ambigui)) && b.stipendio) r = { tipo: 'stipendio', dip: 'N-' + slug(b.beneficiario) };
    // due bonifici uguali nella stessa distinta (senza identificativo) sono due righe: il secondo ha una x in fondo
    let id = b.id ? 'b' + idPagamento({ data: b.id, importo: 0, descrizione: '' }).slice(1) : idPagamento(m); while (visti.has(id)) id += 'x'; visti.add(id);
    let fatt = [], proposte = [], motivo = '';
    if (!r) { const c = candidateFatture({ id, data: b.data || today(), importo: -b.importo, descrizione: [b.beneficiario, b.causale].join(' ') }, gia); proposte = c.proposte; if (c.scelte.length) { r = { tipo: 'fattura' }; fatt = c.scelte; motivo = c.motivo; c.scelte.forEach(f => gia.set(f, (gia.get(f) || 0) + b.importo)); } }
    if (!r) r = { tipo: 'ignora' };
    return Object.assign(m, r, { id, comp: b.comp || '', modalita: 'bonifico', idBanca: b.id || '', fonte: file, gia: presenti.has(id), sel: !presenti.has(id) && r.tipo !== 'ignora' && !(r.ambigui && !r.dip) && !r.incerto, causale: b.causale, fatt, proposte, motivo, nuovo: r.dip && r.dip.startsWith('N-') && !dips.some(d => d.key === r.dip) });
  });
}
/** Campi del pagamento da salvare. */
export const datiPagamento = r => ({ data: r.data, importo: r.importo, tipo: r.tipo, dip: CON_DIP.has(r.tipo) ? r.dip : '', comp: r.comp || '', modalita: r.modalita || 'bonifico', descrizione: r.descrizione, fonte: r.fonte, ...(r.causale ? { causale: r.causale } : {}), ...(r.beneficiario ? { beneficiario: r.beneficiario } : {}), ...(r.iban ? { iban: r.iban } : {}), ...(r.idBanca ? { idBanca: r.idBanca } : {}), ...(r.imp ? { imp: r.imp } : {}) });

/** "È la stessa persona": unisce il dipendente (o il nome dei bonifici) `da` a quello `a`. Il nome unito diventa un nome alternativo. */
export async function unisci(da, a, nomeDa) {
  if (!da || !a || da === a) return;
  const rows = [{ col: 'paghe', id: 'u-' + da, data: { tipo: 'unione', da, a, quando: today() } }];
  if (nomeDa) {
    const { id: _o, ...e } = S.paghe.find(x => x.id === 'd-' + a) || {};
    const al = String(e.alias || '').split(',').map(x => x.trim()).filter(Boolean);
    if (!al.some(x => nomeChiave(x) === nomeChiave(nomeDa))) al.push(nomeDa);
    rows.push({ col: 'paghe', id: 'd-' + a, data: Object.assign(e, { tipo: 'dipendente', dip: a, alias: al.join(', ') }) });
  }
  await store.bulkPut(rows);
}
export async function separa(da) { await store.remove('paghe', 'u-' + da); }

/** Tabella dei nomi: salva per ogni dipendente i nomi con cui compare nei pagamenti e il nome da mostrare. */
export async function salvaNomi(righe, etichette = null) {
  const per = new Map(); for (const [nome, k] of righe) { if (!nome || !k) continue; per.set(k, [...(per.get(k) || []), nome]); }
  const keys = new Set([...dipendenti().map(d => d.key), ...per.keys(), ...S.paghe.filter(x => x.tipo === 'dipendente').map(x => x.dip)]);
  const rows = [];
  for (const k of keys) {
    const { id: _o, ...e } = S.paghe.find(x => x.id === 'd-' + k) || {};
    const alias = [...new Set(per.get(k) || [])].join(', ');
    const et = etichette && k in etichette ? etichette[k] : e.etichetta || '';
    if ((e.alias || '') === alias && (e.etichetta || '') === et) continue;
    rows.push({ col: 'paghe', id: 'd-' + k, data: Object.assign(e, { tipo: 'dipendente', dip: k, alias, etichetta: et }) });
  }
  if (rows.length) await store.bulkPut(rows);
  return rows.length;
}
/** Dopo aver scelto a mano il dipendente di un pagamento: il nome del beneficiario si ricorda per la prossima volta. */
export async function imparaNomi(righe) {
  const dips = dipendenti(); const nuove = [];
  for (const r of righe) {
    if (!r.beneficiario || !r.dip || !CON_DIP.has(r.tipo)) continue;
    const d = dips.find(x => x.key === r.dip); if (!d) continue;
    const k = nomeChiave(r.beneficiario);
    if (nomeChiave(d.nomeCed) === k && !d.omonimo) continue;
    if (dips.some(x => x.key !== d.key && !x.omonimo && nomeChiave(x.nomeCed) === k)) continue;
    if (dips.some(x => x.key !== d.key && aliasDi(x).some(a => nomeChiave(a) === k))) continue;
    if (d.omonimo && nomeChiave(d.nomeCed) === k) continue; // il nome del cedolino è di due persone: non si può ricordare
    if (!aliasDi(d).some(a => nomeChiave(a) === k)) nuove.push([r.beneficiario, d.key]);
  }
  if (!nuove.length) return 0;
  const tutte = dips.flatMap(d => aliasDi(d).map(a => [a, d.key])).concat(nuove);
  await salvaNomi(tutte); return nuove.length;
}

/**
 * Pagamenti forse doppi (1.63): stesso tipo, stesso dipendente (o stesso beneficiario), stesso importo e stessa data.
 * - certi: lo stesso movimento (stessoMovimento: stesso CRO/TRN, o il CRO della contabile nella descrizione dell'estratto)
 *   → si tiene quello inserito a mano o con il mese indicato, altrimenti il primo, con i dati che mancano presi dall'altro;
 * - due pagamenti veri (pagamentiDistinti: righe diverse dello stesso documento, CRO diversi) → si tengono tutti e due;
 * - gli altri → dubbi, da confermare in Da controllare (scartato = sono due pagamenti veri, non si ripropone).
 * Sulle fatture: lo stesso movimento segnato due volte (stesso `mov`) è certo; due movimenti diversi con la stessa data e lo
 * stesso importo sono un dubbio.
 */
export function analizzaDoppi() {
  const risolti = new Map(pagamenti().map(p => [p.id, p]));
  const chiave = p => { const r = risolti.get(p.id) || p; const chi = CON_DIP.has(p.tipo) ? (r.dip || nomeChiave(p.beneficiario)) : ''; return CON_DIP.has(p.tipo) && !chi ? null : [p.tipo, chi, r2(N(p.importo)), p.data].join('|'); };
  const peso = p => (p.dipManuale || p.fonte === 'a mano' ? 0 : 2) + (p.comp ? 0 : 1);
  const gruppi = new Map(); for (const p of S.pagamenti) { if (!p.data) continue; const k = chiave(p); if (!k) continue; gruppi.set(k, [...(gruppi.get(k) || []), p]); }
  const certi = [], dubbi = [];
  for (const g of gruppi.values()) {
    if (g.length < 2) continue;
    g.sort((a, b) => peso(a) - peso(b) || String(a.id).localeCompare(String(b.id)));
    const tieni = [g[0]];
    for (const x of g.slice(1)) {
      const t = tieni.find(t => stessoMovimento(t, x)); if (t) { certi.push({ tieni: t, via: x }); continue; }
      const altro = tieni.find(t => !pagamentiDistinti(t, x));
      if (altro) { const id = idCoppia(altro, x); if (!scartato(id)) dubbi.push({ id, tieni: altro, via: x, dip: (risolti.get(x.id) || x).dip }); }
      tieni.push(x);
    }
  }
  const fatCerte = [], fatDubbi = [];
  for (const f of S.fatture) {
    const pb = f.pagamentiBanca || []; if (pb.length < 2) continue;
    const visti = new Set(); const tieni = pb.filter(x => { if (!x.mov) return true; if (visti.has(x.mov)) return false; visti.add(x.mov); return true; });
    if (tieni.length < pb.length) fatCerte.push({ f, tieni });
    for (let i = 0; i < tieni.length; i++) for (let j = i + 1; j < tieni.length; j++) {
      const a = tieni[i], b = tieni[j];
      if (a.data !== b.data || Math.abs(Math.abs(N(a.importo)) - Math.abs(N(b.importo))) > 0.005) continue;
      const id = `ft-doppio-${f.id}-${[a.mov || i, b.mov || j].sort().join('+')}`;
      if (!scartato(id)) fatDubbi.push({ id, f, a, b });
    }
  }
  return { certi, dubbi, fatCerte, fatDubbi };
}
/** Tiene `tieni` e toglie `via` (lo stesso pagamento registrato due volte): i dati che mancano si prendono da `via`. */
export async function unisciPagamenti(tieniId, viaId) {
  const a = S.pagamenti.find(p => p.id === tieniId), b = S.pagamenti.find(p => p.id === viaId); if (!a || !b || a === b) return false;
  const { id, ...data } = a; let cambiato = false;
  for (const k of ['idBanca', 'iban', 'causale', 'beneficiario', 'imp', 'comp']) if (!data[k] && b[k]) { data[k] = b[k]; cambiato = true; }
  if (cambiato) await store.put('pagamenti', id, data);
  await store.remove('pagamenti', b.id); return true;
}
/** Toglie da una fattura il pagamento di banca `x` segnato due volte: quello con lo stesso movimento, o l'ultimo con la stessa data e importo. */
export async function togliPagamentoFattura(fid, x) {
  const f = S.fatture.find(y => y.id === fid); if (!f || !x) return false;
  const pb = f.pagamentiBanca || []; const uguale = y => y.data === x.data && Math.abs(Math.abs(N(y.importo)) - Math.abs(N(x.importo))) < 0.005 && (!x.mov || y.mov === x.mov);
  const conta = pb.filter(y => y.data === x.data && Math.abs(Math.abs(N(y.importo)) - Math.abs(N(x.importo))) < 0.005).length; if (conta < 2) return false;
  let i = -1; for (let j = pb.length - 1; j >= 0; j--) if (uguale(pb[j])) { i = j; break; } if (i < 0) return false;
  const { id, ...data } = f; await store.put('fatture', id, Object.assign(data, { pagamentiBanca: pb.filter((_, j) => j !== i) })); return true;
}
/** Elimina solo i pagamenti doppi certi (vedi analizzaDoppi); gli altri restano e sono dubbi. Ritorna quanti ne ha tolti. */
export async function eliminaDoppi() {
  const { certi, fatCerte } = analizzaDoppi(); let n = 0;
  for (const c of certi) if (await unisciPagamenti(c.tieni.id, c.via.id)) n++;
  const rows = [];
  for (const { f, tieni } of fatCerte) { n += (f.pagamentiBanca || []).length - tieni.length; const { id, ...data } = f; rows.push({ col: 'fatture', id, data: Object.assign(data, { pagamentiBanca: tieni }) }); }
  if (rows.length) await store.bulkPut(rows);
  return n;
}
