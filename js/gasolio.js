// Gasolio consumato dai mezzi: consumo in litri all'ora imparato dai rifornimenti dalla cisterna (o scritto nel libretto)
// e scarico dal magazzino proposto per le operazioni con le ore. Le ore dei mezzi non cambiano (mezzoOre in domain.js).
// Modulo senza interfaccia: si prova anche in Node (S passato come argomento).
const N = x => { const v = typeof x === 'number' ? x : parseFloat(String(x ?? '').replace(',', '.')); return isFinite(v) ? v : 0; };
const r1 = x => Math.round(x * 10) / 10;

export const ID = 'gasolio-auto';   // config: { dal, prodottoId, fatti: { opId: 'fatto' | 'scartato' | 'annullato' } }
export const PRE = 'gs-';           // id dei movimenti scritti da questa automazione: gs-<id operazione>
// "Sicuro" = almeno 3 misure, 30 ore in tutto e misure che si somigliano (scarto tipo sotto il 25% della media)
export const SICURO = { misure: 3, ore: 30, cv: 0.25 };

export const isGasolio = p => !!p && p.categoria === 'Gasolio';
const prodotto = (S, id) => S.prodotti.find(p => p.id === id);
const fatta = o => o.stato !== 'Pianificata';

/** Rifornimenti di un mezzo: scarichi di gasolio dalla cisterna con il mezzo indicato (campo mezzoId del movimento). */
export function rifornimenti(S, mezzoId) {
  const per = new Map();
  for (const m of S.movimenti) {
    if (m.tipo !== 'Scarico' || m.mezzoId !== mezzoId || m.gasOp || !isGasolio(prodotto(S, m.prodottoId)) || !(N(m.quantita) > 0) || !m.data) continue;
    per.set(m.data, (per.get(m.data) || 0) + N(m.quantita));   // più rifornimenti nello stesso giorno = uno solo
  }
  return [...per].sort((a, b) => a[0].localeCompare(b[0])).map(([data, litri]) => ({ data, litri }));
}

/** Misure del consumo di un mezzo: fra due rifornimenti (a pieno) i litri del secondo diviso le ore lavorate in mezzo;
 *  e le operazioni in cui il gasolio è stato scelto a mano con la quantità. */
export function misure(S, mezzoId) {
  const ops = S.operazioni.filter(o => o.mezzoId === mezzoId && fatta(o) && N(o.ore) > 0 && o.data);
  const out = [];
  const rf = rifornimenti(S, mezzoId);
  for (let i = 1; i < rf.length; i++) {
    const ore = ops.filter(o => o.data > rf[i - 1].data && o.data <= rf[i].data).reduce((t, o) => t + N(o.ore), 0);
    if (ore > 0) out.push({ litri: rf[i].litri, ore, da: rf[i - 1].data, a: rf[i].data, fonte: 'rifornimenti' });
  }
  for (const o of ops) if (isGasolio(prodotto(S, o.prodottoId)) && N(o.quantita) > 0) out.push({ litri: N(o.quantita), ore: N(o.ore), da: o.data, a: o.data, fonte: 'operazione' });
  return out;
}

/** Consumo del mezzo: { lh, fonte: 'imparato' | 'libretto' | null, sicuro, imparato: { lh, n, ore, cv } | null }. */
export function consumo(S, m) {
  const ms = misure(S, m.id);
  let imp = null;
  if (ms.length) {
    const L = ms.reduce((t, x) => t + x.litri, 0), H = ms.reduce((t, x) => t + x.ore, 0);
    const v = ms.map(x => x.litri / x.ore); const med = v.reduce((t, x) => t + x, 0) / v.length;
    const cv = v.length > 1 ? Math.sqrt(v.reduce((t, x) => t + (x - med) ** 2, 0) / (v.length - 1)) / med : null;
    imp = { lh: r1(L / H), n: ms.length, ore: H, cv };
  }
  const sicuro = !!imp && imp.n >= SICURO.misure && imp.ore >= SICURO.ore && imp.cv !== null && imp.cv <= SICURO.cv;
  if (sicuro) return { lh: imp.lh, fonte: 'imparato', sicuro, imparato: imp };
  if (N(m.consumoLh) > 0) return { lh: N(m.consumoLh), fonte: 'libretto', sicuro: false, imparato: imp };
  if (imp && imp.lh > 0) return { lh: imp.lh, fonte: 'imparato', sicuro: false, imparato: imp };
  return { lh: 0, fonte: null, sicuro: false, imparato: imp };
}

/** Consumo da mostrare nella scheda del mezzo: { lh, nota } o null. */
export function consumoTesto(S, m) {
  const c = consumo(S, m); if (!(c.lh > 0)) return null;
  const n = c.imparato ? c.imparato.n : 0;
  return { lh: c.lh, nota: c.fonte === 'libretto' ? 'scritto nella scheda' + (n ? `, dalle misure ${String(c.imparato.lh).replace('.', ',')} l/h (ancora incerto)` : '') : c.sicuro ? `imparato da ${n} misure` : `da ${n === 1 ? '1 misura' : n + ' misure'}, ancora incerto` };
}

/** Gasolio da usare per gli scarichi: quello scelto, o l'unico del magazzino. null + elenco se ce n'è più d'uno. */
export function gasolioDa(S, cfg = {}) {
  const tutti = S.prodotti.filter(isGasolio);
  const scelto = tutti.find(p => p.id === cfg.prodottoId);
  if (scelto) return { p: scelto, tutti };
  return { p: tutti.length === 1 ? tutti[0] : null, tutti };
}

/** Il movimento di scarico stimato per un'operazione. */
export function movimento(S, o, p, c) {
  const mz = S.mezzi.find(x => x.id === o.mezzoId) || {}; const campo = S.campi.find(x => x.id === o.campoId);
  const q = r1(N(o.ore) * c.lh);
  return {
    col: 'movimenti', id: PRE + o.id,
    data: { data: o.data, prodottoId: p.id, tipo: 'Scarico', quantita: q, stima: q, gasOp: o.id, gasMezzo: o.mezzoId, lh: c.lh, ore: N(o.ore),
      note: `Gasolio stimato · ${mz.nome || 'mezzo'} · ${String(N(o.ore)).replace('.', ',')} h × ${String(c.lh).replace('.', ',')} l/h · ${o.tipo || 'lavoro'}${campo ? ' ' + campo.nome : ''}` },
  };
}

/**
 * Cosa fare adesso. Operazioni dal giorno `dal`, non pianificate, con mezzo e ore, senza gasolio già scelto a mano.
 * I mezzi con rifornimenti registrati dal `dal` in poi non hanno scarichi per operazione: il gasolio esce dalla cisterna
 * con i rifornimenti (altrimenti si conterebbe due volte); le loro ore servono solo a imparare il consumo.
 * → { auto: ops da salvare subito (consumo sicuro), proposte: per mezzo [{ m, c, ops: [op movimento], lavori }],
 *     senza: [{ m, lavori, ore }] (non so il consumo), togli: ops di rimozione (scarichi stimati di operazioni sparite) }
 */
export function piano(S, cfg = {}) {
  const out = { auto: [], proposte: [], senza: [], togli: [], conRif: [], p: null, tutti: [] };
  const { p, tutti } = gasolioDa(S, cfg); out.p = p; out.tutti = tutti;
  const dal = cfg.dal; if (!dal) return out;
  const fatti = cfg.fatti || {};
  const movOp = new Map(S.movimenti.filter(m => m.opId).map(m => [m.opId, m]));
  const miei = new Map(S.movimenti.filter(m => m.gasOp).map(m => [m.gasOp, m]));
  const ops = new Map(S.operazioni.map(o => [o.id, o]));
  // scarichi stimati la cui operazione non c'è più (o non ha più ore o mezzo): si tolgono se nessuno li ha cambiati
  for (const [opId, mv] of miei) {
    const o = ops.get(opId);
    // … o se poi nel lavoro si è scelto il gasolio a mano: altrimenti dal magazzino uscirebbero tutti e due
    const m0 = o && movOp.get(o.id);
    const aMano = o && (isGasolio(prodotto(S, o.prodottoId)) || (m0 && m0.id !== mv.id && isGasolio(prodotto(S, m0.prodottoId))));
    if ((!o || !fatta(o) || !(N(o.ore) > 0) || !o.mezzoId || aMano) && N(mv.quantita) === N(mv.stima)) out.togli.push({ col: 'movimenti', id: mv.id, del: true });
  }
  // mezzo con un rifornimento dal giorno di partenza: il gasolio dei lavori fino a quel giorno è già uscito con il
  // rifornimento (a pieno), quindi le stime di quei lavori si tolgono (se nessuno le ha cambiate), altrimenti conterebbe due volte
  for (const [, mv] of miei) {
    if (out.togli.some(x => x.id === mv.id)) continue;
    const ult = rifornimenti(S, mv.gasMezzo).filter(r => r.data >= dal).map(r => r.data).pop();
    if (ult && mv.data <= ult && N(mv.quantita) === N(mv.stima)) out.togli.push({ col: 'movimenti', id: mv.id, del: true, rifornito: true });
  }
  if (!p) return out;
  const perMezzo = new Map();
  for (const o of S.operazioni) {
    if (!fatta(o) || !o.mezzoId || !(N(o.ore) > 0) || !o.data || o.data < dal) continue;
    // scartato o annullato: non torna; "rifornito" torna solo se il mezzo non ha più rifornimenti (cancellato o sul mezzo sbagliato)
    if (fatti[o.id] === 'rifornito' ? rifornimenti(S, o.mezzoId).some(r => r.data >= dal) : fatti[o.id] && fatti[o.id] !== 'fatto') continue;
    if (isGasolio(prodotto(S, o.prodottoId))) continue;             // gasolio già scelto a mano nell'operazione
    const m0 = movOp.get(o.id); if (m0 && isGasolio(prodotto(S, m0.prodottoId))) continue;
    if (!perMezzo.has(o.mezzoId)) perMezzo.set(o.mezzoId, []);
    perMezzo.get(o.mezzoId).push(o);
  }
  for (const [mid, lista] of perMezzo) {
    const m = S.mezzi.find(x => x.id === mid); if (!m) continue;
    if (rifornimenti(S, mid).some(r => r.data >= dal)) { out.conRif.push(m); continue; }   // il gasolio esce con i rifornimenti (sopra: stime tolte)
    const c = consumo(S, m);
    if (!(c.lh > 0)) { const da = lista.filter(o => !miei.has(o.id)); if (da.length) out.senza.push({ m, lavori: da.length, ore: da.reduce((t, o) => t + N(o.ore), 0) }); continue; }
    const nuovi = [];
    for (const o of lista) {
      const mv = miei.get(o.id); const op = movimento(S, o, p, c);
      if (mv) {
        // ore cambiate: si aggiorna da solo solo uno scarico non toccato a mano e con il consumo sicuro
        if (c.sicuro && N(mv.quantita) === N(mv.stima) && (N(mv.ore) !== N(o.ore) || mv.data !== o.data) ) out.auto.push(op);
        continue;
      }
      if (fatti[o.id] === 'fatto') continue;                         // scaricato e poi tolto a mano: non si rifà
      nuovi.push(op);
    }
    if (!nuovi.length) continue;
    if (c.sicuro) out.auto.push(...nuovi);
    else out.proposte.push({ m, c, ops: nuovi, lavori: nuovi.map(x => ops.get(x.data.gasOp)) });
  }
  return out;
}
