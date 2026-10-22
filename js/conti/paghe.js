// Personale: cedolini, bilancini paghe e pagamenti; quanto è dovuto a ogni dipendente, verifica dei pagamenti e controlli
import { S } from '../state.js';
import * as store from '../store.js';
import { N, okD, today, addDays, diff } from '../util.js';
import { MESI_NOMI } from './paghe-parse.js';
import { candidateFatture } from './banca.js';

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
/** I movimenti che contano come stipendio pagato: bonifici, anticipi e rate tolte dal bonifico. */
const contaComeStipendio = p => p.dip && (p.tipo === 'stipendio' || (p.tipo === 'anticipo' && p.recupero !== 'busta') || (p.tipo === 'rimborso' && p.come === 'stipendio'));
const compDi = p => p.comp || (p.tipo === 'anticipo' ? (p.data || '').slice(0, 7) : p.tipo === 'rimborso' && p.data ? mesePrec(p.data.slice(0, 7)) : '');
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
export const anniPaghe = () => [...new Set(dati().per.map(p => +p.slice(0, 4)))].sort();

// nome confrontabile: parole maiuscole in ordine alfabetico ("Singh Gurinder" = "GURINDER SINGH")
export const nomeChiave = n => String(n || '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim().split(' ').filter(Boolean).sort().join(' ');
/** Nome di un dipendente dalla chiave, anche se non ha ancora cedolini (dal beneficiario dei bonifici). */
export function nomeDi(k) {
  const d = dipendenti().find(x => x.key === k); if (d) return d.nome;
  const p = S.pagamenti.find(x => x.dip === k && x.beneficiario); if (p) return p.beneficiario;
  return String(k || '').replace(/^N-/, '').replace(/-/g, ' ');
}
const periodoOk = p => /^\d{4}-(0[1-9]|1[0-4])$/.test(p || '');
function calcola() {
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
  const perIban = new Map(); for (const p of S.pagamenti) if (p.iban && p.dip && dip.has(p.dip)) perIban.set(p.iban, p.dip);
  const pag = [...S.pagamenti].map(p => {
    if (!p.dip) return p;
    const u = mk(p.dip); if (dip.has(u) || !CON_DIP.has(p.tipo)) return u === p.dip ? p : Object.assign({}, p, { dip: u });
    const k = perNome.get(nomeChiave(p.beneficiario || u.replace(/^N-/, ''))) || (p.iban && perIban.get(p.iban));
    return Object.assign({}, p, { dip: k || u });
  }).sort((a, b) => (a.data || '').localeCompare(b.data || ''));
  const ver = abbina(ced, pag);
  const pre = calcolaPrestiti(pag);
  const ano = controlli(ced, bil, tot, pag, ver, dip, per, pre);
  for (const c of scartati) ano.unshift({ liv: 'err', testo: `Cedolino senza mese o anno: ${c.nome || 'dipendente non letto'}`, det: `Nel file ${c.file || ''} non ho letto il mese. Eliminalo da Cedolini e ricaricalo, oppure mandami il PDF.`, cid: c.id });
  for (const d of dip.values()) {
    const v = ver.filter(x => x.dip === d.key);
    Object.assign(d, { mesi: d.ced.length, ore: r2(d.ced.reduce((t, c) => t + N(c.ore), 0)), lordo: r2(d.ced.reduce((t, c) => t + N(c.lordo), 0)), netto: r2(d.ced.reduce((t, c) => t + N(c.netto), 0)), irpef: r2(d.ced.reduce((t, c) => t + N(c.irpef), 0)), ritPrev: r2(d.ced.reduce((t, c) => t + N(c.ritPrev), 0)), pagato: r2(v.reduce((t, x) => t + x.pagato, 0)), dovuto: r2(v.reduce((t, x) => t + x.dovuto, 0)) });
    d.saldo = r2(d.dovuto - d.pagato);
    const ps = pre.filter(x => x.dip === d.key); d.prestiti = ps; d.residuoPrestiti = r2(ps.reduce((t, x) => t + x.residuo, 0));
    d.anticipi = pag.filter(x => x.tipo === 'anticipo' && x.dip === d.key);
    d.anomalie = ano.filter(a => a.dip === d.key);
    d.stato = d.cessazione && d.cessazione < today() ? 'Cessato' : d.scadTD && d.scadTD < today() ? 'Termine scaduto' : 'In forza';
  }
  return { ced, bil, tot, per, dip: [...dip.values()].sort((a, b) => (a.nome || '').localeCompare(b.nome || '')), pag, ver, ano, pre };
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
/** Coppie di pagamenti che sembrano lo stesso movimento: stesso tipo e dipendente, stesso importo, date entro 5 giorni, fonti diverse o stessa data. */
export function doppi(pag) {
  const out = []; const ps = pag.filter(p => p.dip && CON_DIP.has(p.tipo) && p.data).sort((a, b) => a.data.localeCompare(b.data));
  for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) {
    const a = ps[i], b = ps[j]; if (giorni(a.data, b.data) > 5) break;
    if (a.tipo !== b.tipo || a.dip !== b.dip || Math.abs(N(a.importo) - N(b.importo)) > 0.01) continue;
    if (a.comp && b.comp && a.comp !== b.comp) continue;
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
    const giaP = !r.gia && salvati.find(p => p.id !== r.id && CON_DIP.has(p.tipo) && stesso(r, p));
    const giaR = visti.find(x => !x.entrata && stesso(r, x));
    if (giaP || giaR) { r.gia = true; r.sel = false; r.doppio = giaP ? `già registrato il ${String(giaP.data).split('-').reverse().join('/')} da ${giaP.fonte || 'inserimento a mano'}` : 'uguale a un altro movimento di questo caricamento'; }
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
// 2) Gli altri, in ordine di data, vanno ai mesi già maturati alla data del pagamento e non ancora saldati:
//    prima quello con il residuo uguale all'importo, poi dal più vecchio. Un pagamento non va mai a un mese
//    che alla sua data non era ancora pagabile, salvo che non ci sia nient'altro da saldare (anticipo).
// 3) Quello che avanza va all'ultimo mese saldato con quel pagamento (pagato in più).
function abbina(ced, pag) {
  const righe = [];
  for (const c of ced) { const o = righe.find(r => r.dip === c.dip && r.periodo === c.periodo); if (o) { o.dovuto = r2(o.dovuto + N(c.netto)); continue; } righe.push({ dip: c.dip, nome: c.nome, periodo: c.periodo, dovuto: r2(N(c.netto)), pagato: 0, pag: [], cid: c.id }); }
  const ord = (a, b) => pagabileDa(a.periodo).localeCompare(pagabileDa(b.periodo)) || a.periodo.localeCompare(b.periodo);
  const extra = [];
  const senza = (p, periodo, v, voce) => { const o = extra.find(e => e.dip === p.dip && e.periodo === periodo); if (o) { o.pagato = r2(o.pagato + v); o.pag.push(voce(v)); } else extra.push({ dip: p.dip, nome: p.beneficiario || '', periodo, dovuto: 0, pagato: v, pag: [voce(v)], senzaCedolino: true }); };
  const sp = pag.filter(contaComeStipendio);
  const conMese = sp.filter(p => compDi(p)), auto = sp.filter(p => !compDi(p)).sort((a, b) => (a.data || '').localeCompare(b.data || '') || String(a.id).localeCompare(String(b.id)));
  for (const p of [...conMese, ...auto]) {
    let resto = r2(N(p.importo)); if (resto <= 0) continue; const comp = compDi(p);
    const voce = v => ({ id: p.id, data: p.data, importo: v, modalita: p.modalita, tot: N(p.importo), tipo: p.tipo });
    const metti = (r, v) => { r.pagato = r2(r.pagato + v); r.pag.push(voce(v)); resto = r2(resto - v); };
    if (comp) { const r = righe.find(r => r.dip === p.dip && r.periodo === comp); if (r) metti(r, resto); else senza(p, comp, resto, voce); continue; }
    const data = p.data || today();
    const mie = righe.filter(r => r.dip === p.dip).sort(ord);
    const aperta = r => r.pagato < r.dovuto - 0.005;
    const maturate = mie.filter(r => pagabileDa(r.periodo) <= data && aperta(r));
    let lista;
    if (maturate.length) { const es = maturate.find(r => Math.abs(r2(r.dovuto - r.pagato) - resto) < 0.01); lista = es ? [es, ...maturate.filter(r => r !== es)] : maturate; }
    else { const prossima = mie.find(r => aperta(r) && pagabileDa(r.periodo) > data); lista = prossima ? [prossima] : []; }
    let ultima = null;
    for (const r of lista) { if (resto <= 0.005) break; metti(r, Math.min(resto, r2(r.dovuto - r.pagato))); ultima = r; }
    if (resto > 0.005) {
      // nessun mese da saldare: è lo stipendio del mese prima della data (se il suo cedolino non c'è, "senza cedolino")
      const naturale = mesePrec(data.slice(0, 7));
      const dove = ultima || mie.find(r => r.periodo === naturale);
      if (dove) metti(dove, resto); else senza(p, naturale, resto, voce);
    }
  }
  const g = cfgPaghe().giornoStipendi;
  const out = [...righe, ...extra].map(r => {
    const diffV = r2(r.dovuto - r.pagato);
    const scad = `${meseSucc(meseRif(r.periodo))}-${String(Math.min(28, g)).padStart(2, '0')}`;
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
  // stesso dipendente, permesso o termine in scadenza nei prossimi 60 giorni (dall'ultimo cedolino)
  for (const d of dip.values()) {
    if (d.cessazione && d.cessazione < t) continue;
    if (d.scadTD && d.scadTD >= t && diff(t, d.scadTD) <= 45) add('info', `Contratto a termine in scadenza: ${d.nome}`, `Termine il ${d.scadTD.split('-').reverse().join('/')}: decidi se prorogare.`, { dip: d.key });
    if (d.scadPermesso && d.scadPermesso >= t && diff(t, d.scadPermesso) <= 60) add('info', `Permesso di soggiorno in scadenza: ${d.nome}`, `Scade il ${d.scadPermesso.split('-').reverse().join('/')}.`, { dip: d.key });
    // mesi mancanti: dipendente presente prima e dopo, ma non in un mese caricato
    const suoi = new Set(d.ced.map(c => c.periodo));
    const mesiNorm = per.filter(p => +p.slice(5) <= 12 && p >= d.primo && p <= d.ultimo);
    for (const p of mesiNorm) if (!suoi.has(p) && ced.some(c => c.periodo === p)) add('warn', `Manca il cedolino di ${d.nome} per ${nomeMese(p)}`, 'Il dipendente ha cedolini prima e dopo questo mese. Se era in aspettativa o non ha lavorato, ignora l\'avviso.', { dip: d.key, periodo: p });
  }
  // pagamenti degli stipendi
  for (const v of ver) {
    const nome = (dip.get(v.dip) || {}).nome || v.nome || nomeDi(v.dip);
    if (v.stato === 'non pagato') add('err', `Stipendio non pagato: ${nome}, ${nomeMese(v.periodo)}`, `Netto ${eu(v.dovuto)}, scadenza ${v.scadenza.split('-').reverse().join('/')}.`, { dip: v.dip, periodo: v.periodo, ver: true });
    if (v.stato === 'pagato in parte') add('warn', `Stipendio pagato in parte: ${nome}, ${nomeMese(v.periodo)}`, `Netto ${eu(v.dovuto)}, pagato ${eu(v.pagato)}: mancano ${eu(v.differenza)}.`, { dip: v.dip, periodo: v.periodo, ver: true });
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
  for (const p of [...new Set(ced.map(c => c.periodo))]) if (!bil.some(b => b.periodo === p)) add('info', `Manca il bilancino paghe di ${nomeMese(p)}`, 'Senza bilancino non si conoscono i contributi a carico dell\'azienda e il costo totale del mese.', { periodo: p });
  for (const tt of tot) { const cs = ced.filter(c => c.periodo === tt.periodo); const sN = r2(cs.reduce((t, c) => t + N(c.netto), 0)); if (tt.netto != null && Math.abs(sN - tt.netto) > 0.05) add('warn', `${nomeMese(tt.periodo)}: mancano cedolini rispetto ai totali generali`, `Somma dei netti ${eu(sN)}, totale generale ${eu(tt.netto)}${tt.dipendenti ? ` (${tt.dipendenti} dipendenti)` : ''}.`, { periodo: tt.periodo }); }
  // versamenti: F24 delle ritenute entro il 16 del mese dopo, contributi agricoli per trimestre
  for (const v of versamenti(bil, pag)) {
    if (v.stato === 'non pagato') add('err', `${v.tipoNome} di ${v.nome} non registrato`, `Dovuti ${eu(v.dovuto)} entro il ${v.scadenza.split('-').reverse().join('/')}. Se l'hai pagato, registra il pagamento.`, { periodo: v.periodo, vers: true });
    else if (v.stato === 'pagato in parte') add('warn', `${v.tipoNome} di ${v.nome} pagato in parte`, `Dovuti ${eu(v.dovuto)}, registrati ${eu(v.pagato)}.`, { periodo: v.periodo, vers: true });
    else if (v.ritardo > 0) add('info', `${v.tipoNome} di ${v.nome} pagato in ritardo`, `Pagato il ${v.ultimo.split('-').reverse().join('/')}, scadenza ${v.scadenza.split('-').reverse().join('/')}: verifica il ravvedimento.`, { periodo: v.periodo });
  }
  const ord = { err: 0, warn: 1, info: 2 };
  return A.sort((a, b) => ord[a.liv] - ord[b.liv] || String(b.periodo || '').localeCompare(String(a.periodo || '')));
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
  const vp = pag.filter(p => ['f24', 'contributi', 'fondo'].includes(p.tipo));
  for (const p of [...vp.filter(p => p.comp), ...vp.filter(p => !p.comp).sort((a, b) => (a.data || '').localeCompare(b.data || ''))]) {
    let resto = r2(N(p.importo)); const metti = (o, v) => { o.pagato = r2(o.pagato + v); o.pag.push({ id: p.id, data: p.data, importo: v }); resto = r2(resto - v); };
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
    o.differenza = r2(o.dovuto - o.pagato); o.ultimo = o.pag.map(x => x.data).sort().pop() || null;
    // il dovuto F24 è solo la parte stipendi: se si paga di più (altri tributi nello stesso F24) va bene
    o.stato = o.pagato >= o.dovuto - 0.01 ? (o.tipo !== 'f24' && o.pagato > o.dovuto + 0.01 ? 'pagato in più' : 'pagato') : o.pagato > 0 ? 'pagato in parte' : t > o.scadenza ? 'non pagato' : 'da pagare';
    o.ritardo = o.ultimo && o.ultimo > o.scadenza ? diff(o.scadenza, o.ultimo) : 0;
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
export async function salvaCedolini(x) {
  const rows = []; const nuovi = [], sostituiti = [];
  const presenti = new Set(S.paghe.map(p => p.id));
  for (const c of x.cedolini) {
    const dip = chiaveDip(c); const id = `c-${periodo(c.anno, c.mese)}-${dip}`;
    (presenti.has(id) ? sostituiti : nuovi).push(c.nome);
    rows.push({ col: 'paghe', id, data: Object.assign({ tipo: 'cedolino', dip, file: x.nome, caricato: today() }, c) });
  }
  if (x.totali) rows.push({ col: 'paghe', id: `t-${periodo(x.totali.anno, x.totali.mese)}`, data: Object.assign({ tipo: 'totali', file: x.nome }, x.totali) });
  if (rows.length) await store.bulkPut(rows);
  return { nuovi: nuovi.length, sostituiti: sostituiti.length };
}
export async function salvaBilancinoPaghe(x) {
  const { voci, ...b } = x.bil;
  await store.put('paghe', `b-${periodo(b.anno, b.mese)}`, Object.assign({ tipo: 'bilancino', file: x.nome, caricato: today(), voci }, b));
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
/** Estrae i movimenti in uscita da una tabella di righe (intestazione riconosciuta da sola). */
export function movimentiDaRighe(rows) {
  const low = r => r.map(x => String(x ?? '').toLowerCase().trim());
  const hi = rows.slice(0, 40).findIndex(r => { const l = low(r); return l.some(x => /^data|data (contabile|operazione|valuta)/.test(x)) && l.some(x => /importo|uscit|dare|addebit|avere|entrat|accredit|ammontare/.test(x)); });
  if (hi < 0) throw new Error('Non trovo le colonne: servono almeno "Data" e "Importo" (oppure "Uscite"/"Dare").');
  const h = low(rows[hi]);
  const iData = h.findIndex(x => /data (contabile|operazione)/.test(x)) >= 0 ? h.findIndex(x => /data (contabile|operazione)/.test(x)) : h.findIndex(x => /^data/.test(x));
  const iUsc = h.findIndex(x => /uscit|^dare|addebit/.test(x)), iEnt = h.findIndex(x => /entrat|^avere|accredit/.test(x)), iImp = h.findIndex(x => /importo|ammontare/.test(x));
  const iDesc = h.map((x, i) => (/descri|causal|benefic|dettagl|operazion|note|ordinante|controparte|motivo/.test(x) && i !== iData && !/^data/.test(x) ? i : -1)).filter(i => i >= 0);
  const out = [];
  for (const r of rows.slice(hi + 1)) {
    const data = parseData(r[iData]); if (!data) continue;
    let v = null;
    if (iUsc >= 0) { const u = parseImp(r[iUsc]); if (u) v = Math.abs(u); else continue; }
    else if (iImp >= 0) { const x = parseImp(r[iImp]); if (x == null || x >= 0) continue; v = -x; }
    if (!v) continue;
    out.push({ data, importo: r2(v), descrizione: iDesc.map(i => String(r[i] ?? '').trim()).filter(Boolean).join(' · ').replace(/\s+/g, ' ') });
  }
  return out;
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
/** Riconosce dalla descrizione a chi o a cosa va un movimento. */
export const aliasDi = d => String((d && d.alias) || '').split(',').map(a => a.trim()).filter(Boolean);
export function riconosci(m, dips = dipendenti()) {
  const amb = ds => ({ tipo: 'stipendio', dip: '', ambigui: ds.map(d => d.key) });
  const nc = d => nomeChiave(d.nomeCed || d.nome);
  // 1) nome scritto esattamente come uno dei nomi associati nella tabella (vince sempre)
  if (m.beneficiario) {
    const k = nomeChiave(m.beneficiario);
    const a = dips.filter(d => aliasDi(d).some(x => nomeChiave(x) === k)); if (a.length === 1) return { tipo: 'stipendio', dip: a[0].key };
  }
  // 2) IBAN già usato per un dipendente (solo se il nome non è di un omonimo diverso)
  if (m.iban) { const p = S.pagamenti.find(x => x.iban === m.iban && x.dip && x.tipo === 'stipendio'); if (p) { const d = dips.find(d => d.key === p.dip) || dips.find(d => !d.omonimo && nc(d) === nomeChiave(p.beneficiario)); if (d) return { tipo: 'stipendio', dip: d.key }; } }
  // 3) nome uguale a quello del cedolino
  if (m.beneficiario) { const k = nomeChiave(m.beneficiario); const n = dips.filter(d => nc(d) === k); if (n.length === 1) return { tipo: 'stipendio', dip: n[0].key }; if (n.length > 1) return amb(n); }
  // 3b) nome già usato in un pagamento registrato (anche di chi non ha ancora cedolini)
  if (m.beneficiario) { const k = nomeChiave(m.beneficiario); const p = S.pagamenti.find(x => x.dip && CON_DIP.has(x.tipo) && x.beneficiario && nomeChiave(x.beneficiario) === k); if (p && !(dips.find(d => d.key === p.dip) || {}).omonimo) return { tipo: 'stipendio', dip: p.dip }; }
  // 4) nome dentro la descrizione: i nomi della tabella contano anche le iniziali (es. "SINGH AMARJIT G")
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
  if (migliori.length === 1) return { tipo: 'stipendio', dip: migliori[0].key };
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
  const presenti = new Set([...S.pagamenti.map(p => p.id), ...S.fatture.flatMap(f => (f.pagamentiBanca || []).map(p => p.mov))]); const dips = dipendenti(); const gia = new Map();
  return bon.map(b => {
    const m = { data: b.data, importo: r2(b.importo), descrizione: [b.beneficiario, b.causale].filter(Boolean).join(' · '), beneficiario: b.beneficiario, iban: b.iban };
    let r = riconosci(m, dips);
    if ((!r || (r.tipo === 'stipendio' && !r.dip && !r.ambigui)) && b.stipendio) r = { tipo: 'stipendio', dip: 'N-' + slug(b.beneficiario) };
    const id = b.id ? 'b' + idPagamento({ data: b.id, importo: 0, descrizione: '' }).slice(1) : idPagamento(m);
    let fatt = [], proposte = [], motivo = '';
    if (!r) { const c = candidateFatture({ id, data: b.data || today(), importo: -b.importo, descrizione: [b.beneficiario, b.causale].join(' ') }, gia); proposte = c.proposte; if (c.scelte.length) { r = { tipo: 'fattura' }; fatt = c.scelte; motivo = c.motivo; c.scelte.forEach(f => gia.set(f, (gia.get(f) || 0) + b.importo)); } }
    if (!r) r = { tipo: 'ignora' };
    return Object.assign(m, r, { id, comp: b.comp || '', modalita: 'bonifico', idBanca: b.id || '', fonte: file, gia: presenti.has(id), sel: !presenti.has(id) && r.tipo !== 'ignora' && !(r.ambigui && !r.dip), causale: b.causale, fatt, proposte, motivo, nuovo: r.dip && r.dip.startsWith('N-') && !dips.some(d => d.key === r.dip) });
  });
}
/** Campi del pagamento da salvare. */
export const datiPagamento = r => ({ data: r.data, importo: r.importo, tipo: r.tipo, dip: CON_DIP.has(r.tipo) ? r.dip : '', comp: r.comp || '', modalita: r.modalita || 'bonifico', descrizione: r.descrizione, fonte: r.fonte, ...(r.beneficiario ? { beneficiario: r.beneficiario } : {}), ...(r.iban ? { iban: r.iban } : {}), ...(r.idBanca ? { idBanca: r.idBanca } : {}) });

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
