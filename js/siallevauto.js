// Si@lleva / AIA dall'archivio del PC: quali report leggere e divisione del piano di importazione (pianoImport di aia.js)
// fra quello che è sicuro (si salva da solo) e quello che va deciso (capi nuovi, conflitti con i dati scritti a mano).
// Modulo senza interfaccia: si prova anche in Node.
import { pianoImport, normMatr } from './aia.js';

export const ID = 'aia-auto';   // config: { fatti: { impronta: { quando, tipo, data, nome, esito } }, sospesi: [ … ] }
// tipi dati dal catalogo del PC (area 11.2) ai report che si importano
export const TIPI = { 'Sintetico-individuale': 'sintetico', 'Scheda-riepilogo-controllo': 'prestampato', 'Parametri-zootecnici': 'parametri' };
const NOMI_FILE = [[/sintetico\s*individuale/i, 'sintetico'], [/prestampato|riepilogo\s*del\s*controllo/i, 'prestampato'], [/parametri\s*zootecnici/i, 'parametri']];
export const TENTATIVI = 3;   // un PDF che non si legge si riprova al massimo 3 volte
const LIM = { Parto: 150, 'Messa in asciutta': 60 };   // entro questi giorni un evento scritto a mano è lo stesso, con un'altra data
const giorni = (a, b) => Math.abs(Date.parse(a) - Date.parse(b)) / 864e5;
const senzaId = ({ id, ...r }) => r;
const numN = s => String(s ?? '').trim().replace(/^0+(?=\d)/, '');
// a chiavi ordinate: il jsonb di Supabase riordina le chiavi, così un record tornato dal cloud resta uguale
const ordina = x => (Array.isArray(x) ? x.map(ordina) : x && typeof x === 'object' ? Object.fromEntries(Object.keys(x).sort().filter(k => x[k] !== undefined).map(k => [k, ordina(x[k])])) : x);
export const impronta = x => JSON.stringify(ordina(x ?? null));

/** Che report è un documento del catalogo (null = non si importa). */
export function tipoDoc(d) {
  if (String(d.estensione || '').toLowerCase() !== '.pdf') return null;
  if (TIPI[d.tipo]) return TIPI[d.tipo];
  const n = (d.nome_file || '') + ' ' + (d.nome || '');
  const t = NOMI_FILE.find(([re]) => re.test(n));
  return t ? t[1] : null;
}

/** Documenti da scaricare: i nuovi (impronta mai vista) e, per i nuovi sintetici e prestampati, i compagni dello stesso
 *  controllo già importati (la scheda di riepilogo dice quali vacche non erano al controllo: insieme il piano è giusto). */
export function daLeggere(docs, fatti = {}) {
  const uniq = new Map();
  for (const d of docs) { const t = tipoDoc(d); if (t && d.impronta && !uniq.has(d.impronta)) uniq.set(d.impronta, { d, t }); }
  const tutti = [...uniq.values()];
  const nuovi = tutti.filter(x => !fatti[x.d.impronta] || (fatti[x.d.impronta].esito === 'errore' && (fatti[x.d.impronta].tentativi || 0) < TENTATIVI));
  const date = new Set(nuovi.filter(x => x.t !== 'parametri' && x.d.data).map(x => x.d.data));
  const compagni = tutti.filter(x => fatti[x.d.impronta] && fatti[x.d.impronta].esito === 'importato' && x.t !== 'parametri' && date.has(x.d.data));
  return { nuovi, compagni };
}

/** Ultimo controllo AIA già nella stalla. */
export const ultimoControllo = S => S.capi.reduce((m, c) => (c.aia && c.aia.data && c.aia.data > m ? c.aia.data : m), '');

/**
 * Divide i report letti in: salva (ops sicure), sospesi (da decidere), vecchi (report più vecchi dell'ultimo controllo già
 * caricato: non si importano, altrimenti riporterebbero indietro i dati delle vacche).
 */
export function dividi(S, reps, uid, tenuti = {}) {
  // un controllo alla volta: pianoImport mescolerebbe i dati di date diverse (latte di un mese, data dell'altro);
  // si tiene solo il più recente, quelli prima restano fuori come "vecchi"
  const ult = ultimoControllo(S);
  const maxR = reps.filter(r => r.tipo !== 'parametri' && r.data).map(r => r.data).sort().pop() || '';
  const lim = [ult, maxR].sort().pop();
  const vecchi = reps.filter(r => r.tipo !== 'parametri' && (!r.data || (lim && r.data < lim)));
  const usa = reps.filter(r => !vecchi.includes(r));
  const out = { salva: [], sospesi: [], vecchi, R: null };
  if (!usa.length) return out;
  const { ops, R } = pianoImport(S, usa, uid); out.R = R;
  const capiId = new Map(S.capi.map(c => [c.id, c]));
  // riga dell'AIA per matricola (numero aziendale)
  const aiaM = new Map(); usa.forEach(r => (r.capi || []).forEach(x => { const m = normMatr(x.matricola); const o = aiaM.get(m) || {}; if (x.nAz && !o.nAz) o.nAz = x.nAz; aiaM.set(m, o); }));
  // ops raggruppate per capo
  const gruppi = new Map(); const gr = id => { if (!gruppi.has(id)) gruppi.set(id, { capo: null, ev: [] }); return gruppi.get(id); };
  for (const o of ops) {
    if (o.col === 'capi') gr(o.id).capo = o;
    else if (o.col === 'eventi') gr(o.data.capoId).ev.push(o);
    else if (o.col === 'config') {
      const cfg = S.config.find(c => c.id === o.id) || {};
      if (impronta(cfg.storia || []) !== impronta(o.data.storia)) out.salva.push(o);   // niente da scrivere se l'andamento è uguale
    }
  }
  const nuovi = [];
  for (const [id, g] of gruppi) {
    const c = capiId.get(id);
    if (!c) { nuovi.push(g); continue; }
    const m = normMatr(c.matricola); const a = aiaM.get(m) || {};
    const conf = conflitti(S, c, g.ev, a);
    if (!conf.length) { if (g.capo) out.salva.push(g.capo); out.salva.push(...g.ev); continue; }
    const sp = sospesoConflitto(S, c, conf, a, usa, uid, R.dataCF);
    // conflitti già decisi con "Tieni i miei": si aggiorna il resto da solo, senza chiedere di nuovo
    const aperti = conf.filter(x => (x.ev ? !(tenuti.ev || {})[x.ev.id] : (tenuti.num || {})[c.id] !== x.mio));
    if (aperti.length) out.sospesi.push(sp); else out.salva.push(...sp.alt);
  }
  if (nuovi.length) {
    const capi = nuovi.map(g => g.capo.data);
    out.sospesi.push({
      id: 'aia:nuovi:' + (R.dataCF || 'senza-data'), tipo: 'nuovi', data: R.dataCF,
      capi: capi.map(d => ({ matricola: d.matricola, numero: d.numero || '', razza: d.razza || '', nome: d.nome || '', parto: (d.aia && d.aia.parto) || null })),
      ops: nuovi.flatMap(g => [g.capo, ...g.ev]),
    });
  }
  return out;
}

// Un parto o un'asciutta dell'AIA a una data diversa da quella scritta a mano (oltre i 7 giorni in cui pianoImport li
// considera lo stesso), o un numero aziendale diverso.
function conflitti(S, c, nuoviEv, a) {
  const out = []; const ev = S.eventi.filter(e => e.capoId === c.id);
  for (const n of nuoviEv) {
    const t = n.data.tipo; if (!LIM[t]) continue;
    const e = ev.filter(e => e.tipo === t && okData(e.data) && giorni(e.data, n.data.data) <= LIM[t]).sort((x, y) => giorni(x.data, n.data.data) - giorni(y.data, n.data.data))[0];
    if (e) out.push({ tipo: t, ev: e, aia: n.data.data });
  }
  if (c.numero && a.nAz && numN(c.numero) !== numN(a.nAz)) out.push({ tipo: 'numero', mio: String(c.numero), aia: a.nAz });
  return out;
}
const okData = d => /^\d{4}-\d{2}-\d{2}$/.test(String(d || ''));

// Il dubbio di un capo con conflitti: "tieni l'AIA" corregge le date (e il numero) e aggiorna il capo; "tieni i miei" lascia
// le date e il numero scritti a mano e aggiorna il resto (controlli, stato riproduttivo…). Tutti e due calcolati adesso.
function sospesoConflitto(S, c, conf, a, usa, uid, dataCF) {
  const m = normMatr(c.matricola);
  const sposta = new Map(conf.filter(x => x.ev).map(x => [x.ev.id, x.aia]));
  const cMod = Object.assign({}, c); const num = conf.find(x => x.tipo === 'numero'); if (num) cMod.numero = num.aia;
  const Smod = { capi: [cMod], eventi: S.eventi.map(e => (sposta.has(e.id) ? Object.assign({}, e, { data: sposta.get(e.id) }) : e)), config: S.config };
  const repsM = usa.filter(r => r.tipo !== 'parametri').map(r => Object.assign({}, r, { capi: r.capi.filter(x => normMatr(x.matricola) === m) }));
  const base = pianoImport(Smod, repsM, uid).ops.filter(o => o.col === 'capi' || o.col === 'eventi');
  const capoOp = base.find(o => o.col === 'capi');
  const resto = base.filter(o => o.col !== 'capi');
  const correzioni = [...sposta].map(([id, d]) => { const e = S.eventi.find(x => x.id === id); return { col: 'eventi', id, data: Object.assign(senzaId(e), { data: d, note: [e.note, 'data corretta da Si@lleva'].filter(Boolean).join(' · ') }) }; });
  const capoCon = numero => { const d = Object.assign({}, capoOp ? capoOp.data : senzaId(c)); if (numero !== undefined) d.numero = numero; return { col: 'capi', id: c.id, data: d }; };
  const opsAia = [capoCon(num ? num.aia : undefined), ...resto, ...correzioni];
  const opsMiei = [capoCon(num ? c.numero : undefined), ...resto];
  return {
    id: 'aia:conf:' + c.id + ':' + (dataCF || ''), tipo: 'conflitto', capoId: c.id, data: dataCF,
    righe: conf.map(x => (x.tipo === 'numero' ? ['Numero aziendale', x.mio, x.aia] : [x.tipo, x.ev.data, x.aia])),
    numMio: num ? String(c.numero) : null, evIds: conf.filter(x => x.ev).map(x => x.ev.id), h: impronta([c, ...conf.filter(x => x.ev).map(x => x.ev)]),
    ops: opsAia, alt: opsMiei,
  };
}

/** Unisce i sospesi salvati con quelli nuovi: un conflitto nuovo di un capo toglie quelli vecchi dello stesso capo,
 *  i capi nuovi di un controllo tolgono le stesse matricole dai controlli prima; aggiornati = capi che il giro ha
 *  aggiornato da soli (il conflitto vecchio è stato risolto a mano nel frattempo). */
export function unisciSospesi(vecchi, nuovi, aggiornati = new Set()) {
  const capi = new Set([...nuovi.filter(s => s.tipo === 'conflitto').map(s => s.capoId), ...aggiornati]);
  const matr = new Set(nuovi.filter(s => s.tipo === 'nuovi').flatMap(s => s.capi.map(c => normMatr(c.matricola))));
  const ids = new Set(nuovi.map(s => s.id));
  const resto = [];
  for (const s of vecchi) {
    if (ids.has(s.id) || (s.tipo === 'conflitto' && capi.has(s.capoId))) continue;
    if (s.tipo === 'nuovi' && s.capi.some(c => matr.has(normMatr(c.matricola)))) {
      const via = new Set(s.ops.filter(o => o.col === 'capi' && matr.has(normMatr(o.data.matricola))).map(o => o.id));
      const t = Object.assign({}, s, { capi: s.capi.filter(c => !matr.has(normMatr(c.matricola))), ops: s.ops.filter(o => !(o.col === 'capi' ? via.has(o.id) : via.has(o.data.capoId))) });
      if (t.capi.length) resto.push(t);
      continue;
    }
    resto.push(s);
  }
  return [...resto, ...nuovi];
}

/** Il capo e gli eventi in conflitto sono ancora come quando è stato fatto il piano? */
export function ancoraUguale(S, sosp) {
  const c = S.capi.find(x => x.id === sosp.capoId); if (!c) return false;
  return impronta([c, ...(sosp.evIds || []).map(id => S.eventi.find(e => e.id === id))]) === sosp.h;
}

/** Ops dei capi nuovi ancora da aggiungere (salta le matricole che nel frattempo sono state scritte a mano). */
export function opsNuovi(S, sosp) {
  const ci = new Set(S.capi.map(c => normMatr(c.matricola)));
  const via = new Set(sosp.ops.filter(o => o.col === 'capi' && ci.has(normMatr(o.data.matricola))).map(o => o.id));
  return sosp.ops.filter(o => !(o.col === 'capi' ? via.has(o.id) : via.has(o.data.capoId)));
}

/** Vacche che c'erano in un controllo AIA e non nell'ultimo: forse uscite (vendute, morte). */
export function forseUscite(S, statoDi, aperti = new Set()) {
  const ult = ultimoControllo(S); if (!ult) return [];
  return S.capi.filter(c => c.aia && c.aia.data && c.aia.data < ult && statoDi(c) !== 'Uscita' && !aperti.has(c.id)).map(c => ({ c, ult, prima: c.aia.data }));
}
