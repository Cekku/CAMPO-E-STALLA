// Stalle, box, silos, misure dai sistemi di stalla (Alpro, MooMonitor, SCR…) e indici della mandria
import { S, D, get } from './state.js';
import { N, okD, diff, today, addDays, sum, byDate } from './util.js';
import { capoI, giac, razioneInfo, extraAlerts } from './domain.js';

export const FASI_BOX = ['Lattazione', 'Fresche', 'Asciutta', 'Preparto', 'Box parto', 'Infermeria', 'Manze', 'Vitelle', 'Vitelli', 'Ingrasso', 'Altro'];
export const boxKey = (s, b) => s.id + '|' + b.nome;
export function boxOf(c) { if (!c || !c.box) return null; const [sid, nome] = String(c.box).split('|'); const s = get('strutture', sid); if (!s) return null; const b = (s.box || []).find(x => x.nome === nome) || null; return { s, b, nome }; }
export const capiIn = (sid, nome) => S.capi.filter(c => { if (capoI(c).stato === 'Uscita' || !c.box) return false; const [a, b] = String(c.box).split('|'); return a === sid && (nome === undefined || b === nome); });
export function allBoxes() { const out = []; S.strutture.forEach(s => (s.box || []).forEach(b => out.push([boxKey(s, b), s.nome + ' · ' + b.nome]))); return out; }

// Misure giornaliere per capo, indicizzate al volo
let mIdx = null, mLen = -1, mRef = null;
export function misureDi(capoId) {
  if (mRef !== S.misure || mLen !== S.misure.length) {
    // più fonti nello stesso giorno (sala di mungitura + collari) si uniscono in un'unica misura
    const by = new Map(); S.misure.forEach(m => { const k = m.capoId + '|' + m.data; const cur = by.get(k); by.set(k, cur ? Object.assign({}, cur, m, { fonte: cur.fonte === m.fonte ? m.fonte : cur.fonte + ' + ' + m.fonte }) : m); });
    mIdx = new Map(); by.forEach(m => { (mIdx.get(m.capoId) || mIdx.set(m.capoId, []).get(m.capoId)).push(m); }); mIdx.forEach(a => a.sort(byDate)); mLen = S.misure.length; mRef = S.misure;
  }
  return mIdx.get(capoId) || [];
}
// Allarmi di benessere: calo di ruminazione o di latte rispetto alla media dei 7 giorni prima
export function benessere(c) {
  const ms = misureDi(c.id); if (ms.length < 4) return [];
  const last = ms[ms.length - 1]; if (diff(last.data, today()) > 3) return [];
  const prev = ms.filter(m => m.data < last.data && diff(m.data, last.data) <= 7);
  const out = [];
  const chk = (k, l, u, soglia) => {
    const vals = prev.map(m => N(m[k])).filter(v => v > 0); if (vals.length < 3 || !(N(last[k]) > 0)) return;
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length; const drop = (avg - N(last[k])) / avg;
    if (drop >= soglia) out.push({ k, lv: drop >= soglia * 1.6 ? 'bad' : 'warn', t: 'Calo di ' + l, s: Math.round(N(last[k])) + ' ' + u + ' contro ' + Math.round(avg) + ' di media (−' + Math.round(drop * 100) + '%)', data: last.data });
  };
  chk('ruminazione', 'ruminazione', 'min', .2); chk('latte', 'latte', 'kg', .2); chk('attivita', 'attività', '', .35);
  const up = prev.map(m => N(m.attivita)).filter(v => v > 0);
  if (up.length >= 3 && N(last.attivita) > 0) { const avg = up.reduce((a, b) => a + b, 0) / up.length; if (N(last.attivita) >= avg * 1.6 && capoI(c).stato !== 'Uscita' && c.sesso !== 'M') out.push({ k: 'calore', lv: 'info', t: 'Possibile calore', s: 'attività +' + Math.round((N(last.attivita) / avg - 1) * 100) + '% sulla media', data: last.data }); }
  return out;
}

// Consumo giornaliero di un prodotto secondo le razioni attive
export function consumoGiorno(prodottoId) { return sum(S.razioni, r => { const i = razioneInfo(r); const x = i.ing.find(g => g.p && g.p.id === prodottoId); return x ? x.kgTot : 0; }); }
export function siloInfo(s) {
  const p = get('prodotti', s.prodottoId);
  const kg = p ? Math.max(0, giac(p)) * (p.unita === 't' ? 1000 : p.unita === 'q' ? 100 : 1) : N(s.carico) * 1000;
  const cap = N(s.capacita) * 1000; const pct = cap > 0 ? Math.min(100, kg / cap * 100) : null;
  const cons = p ? consumoGiorno(p.id) * (p.unita === 't' ? 1000 : p.unita === 'q' ? 100 : 1) : 0;
  return { p, kg, cap, pct, cons, giorni: cons > 0 ? kg / cons : null };
}

// Indici riproduttivi e produttivi della mandria (o di un sottoinsieme di capi)
export function indici(capi = S.capi) {
  const T = today(); const att = capi.filter(c => capoI(c).stato !== 'Uscita');
  const vacche = att.filter(c => ['In lattazione', 'Asciutta'].includes(capoI(c).stato));
  const latt = att.filter(c => capoI(c).stato === 'In lattazione');
  const dim = latt.map(c => capoI(c).dim).filter(x => x !== null);
  const grav = vacche.filter(c => capoI(c).gravida);
  const aperti = latt.map(c => { const i = capoI(c); return i.gravida && i.fec ? diff(i.pData, i.fec.data) : diff(i.pData, T); }).filter(x => x >= 0);
  const ipp = []; const ep = [];
  att.forEach(c => { const p = (D.evBy[c.id] || []).filter(e => e.tipo === 'Parto' && okD(e.data)); for (let k = 1; k < p.length; k++) ipp.push(diff(p[k - 1].data, p[k].data)); if (p.length && okD(c.nascita) && !N(c.lattazioniPrecedenti)) ep.push(diff(c.nascita, p[0].data) / 30.44); });
  const ipc = grav.map(c => capoI(c).nFec).filter(x => x > 0);
  const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
  const L = D.latte; const ul = L[L.length - 1];
  const vac = ul && N(ul.vacche) ? N(ul.vacche) : latt.length;
  const lCapo = ul && vac ? N(ul.litri) / vac : null;
  // costo alimentare medio delle vacche in lattazione dalle razioni dei gruppi di produzione
  const rz = S.razioni.map(razioneInfo).filter((i, k) => /produzione|fresch|lattaz/i.test(S.razioni[k].gruppo || '') && i.capi > 0);
  const feed = rz.length ? sum(rz, i => i.costoGiorno) / sum(rz, i => i.capi) : null;
  const prezzo = ul ? N(ul.prezzo) : 0;
  const rimonta = att.filter(c => ['Manza', 'Vitella'].includes(capoI(c).stato)).length;
  return {
    capi: att.length, vacche: vacche.length, latt: latt.length, asciutte: vacche.length - latt.length, rimonta, rimontaPct: vacche.length ? rimonta / vacche.length * 100 : null,
    dim: avg(dim), gravPct: vacche.length ? grav.length / vacche.length * 100 : null, giorniAperti: avg(aperti), interparto: avg(ipp), etaPrimoParto: avg(ep), insPerConc: avg(ipc),
    lCapo, feed, iofc: lCapo !== null && feed !== null && prezzo ? lCapo * prezzo - feed : null, prezzo,
    benessere: att.reduce((t, c) => t + benessere(c).filter(a => a.lv !== 'info').length, 0),
  };
}

/* ---------- importazione dai sistemi di stalla ---------- */
export const CAMPI_MISURE = [['capo', 'Animale (matricola, numero o nome)'], ['data', 'Data'], ['latte', 'Latte kg/giorno'], ['ruminazione', 'Ruminazione min/giorno'], ['attivita', 'Attività'], ['conducibilita', 'Conducibilità'], ['mungiture', 'Numero di mungiture'], ['note', 'Note o allarmi']];
const GUESS = { capo: /matric|animal|vacca|numero|^nr|^n\.|^id|collar|marca|resp|cow|tag/, data: /data|date|giorno|day/, latte: /latte|milk|produz|resa|kg|yield/, ruminazione: /rumin|rum/, attivita: /attiv|activ|pass|step/, conducibilita: /conduc|conduct/, mungiture: /mungit|milking|visite/, note: /allarm|alert|note|stato/ };
export function guessMap(head) {
  const h = head.map(x => String(x).toLowerCase()); const used = new Set(); const map = {};
  CAMPI_MISURE.forEach(([k]) => { const i = h.findIndex((x, j) => !used.has(j) && GUESS[k].test(x)); if (i >= 0) { map[k] = i; used.add(i); } });
  return map;
}
export function matchCapo(v) {
  const s = String(v || '').trim(); if (!s) return null; const lo = s.toLowerCase(); const dig = s.replace(/\D/g, '');
  return S.capi.find(c => (c.matricola || '').toLowerCase() === lo) || S.capi.find(c => c.numero && String(c.numero).trim().toLowerCase() === lo)
    || (dig.length >= 4 ? S.capi.find(c => (c.matricola || '').replace(/\D/g, '').endsWith(dig)) : null) || S.capi.find(c => (c.nome || '').toLowerCase() === lo) || null;
}
export { addDays };

extraAlerts.push(() => S.capi.filter(c => capoI(c).stato !== 'Uscita').flatMap(c => benessere(c).filter(a => a.lv !== 'info').map(a => ({ lv: a.lv, area: 'stalla', t: a.t + ': ' + (c.nome || c.matricola), s: a.s, go: { type: 'capo', id: c.id } }))));
extraAlerts.push(() => S.silos.map(s => ({ s, i: siloInfo(s) })).filter(x => x.i.giorni !== null && x.i.giorni < 15).map(x => ({ lv: x.i.giorni < 7 ? 'bad' : 'warn', area: 'stalla', t: 'Silo in esaurimento: ' + x.s.nome, s: 'circa ' + Math.round(x.i.giorni) + ' giorni con le razioni attuali', go: { form: 'movimenti' } })));
