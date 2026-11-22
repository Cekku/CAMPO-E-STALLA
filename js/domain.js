// Regole agronomiche e zootecniche: costanti e dati derivati
import { S, D, UI, get } from './state.js';
import { N, okD, addDays, diff, today, yearOf, sum, byDate, fd, eta, nf, fineDi } from './util.js';
import { areaHa } from './geo.js';
import { isTrattore, riepilogo } from './trattori.js';

export const COLTURE = ['Mais da granella', 'Mais trinciato', 'Frumento tenero', 'Frumento duro', 'Orzo', 'Triticale', 'Soia', 'Erba medica', 'Prato polifita', 'Loiessa', 'Sorgo', 'Girasole', 'Colza', 'Barbabietola', 'Vite', 'Pomodoro da industria', 'Riposo'];
export const TIPI_OP = ['Lavorazione terreno', 'Semina', 'Concimazione', 'Trattamento fitosanitario', 'Diserbo', 'Irrigazione', 'Sfalcio', 'Raccolta', 'Altro'];
export const OP_PROD = ['Semina', 'Concimazione', 'Trattamento fitosanitario', 'Diserbo', 'Irrigazione', 'Altro'];
export const CATEGORIE = ['Fitofarmaco', 'Diserbante', 'Concime', 'Effluente', 'Seme', 'Mangime', 'Integratore', 'Foraggio', 'Farmaco veterinario', 'Igiene e mungitura', 'Gasolio', 'Lubrificante', 'AdBlue', 'Ricambio', 'Materiale di consumo', 'Altro'];
export const UNITA = ['kg', 'l', 'q', 't', 'm³', 'dosi', 'pz'];
// Tipi di mezzo: i primi otto sono quelli di sempre (i record vecchi li usano: 'Trattore' apre il libretto, 'Irroratrice' il controllo funzionale);
// gli altri scelti dalle voci di xFarm utili a una stalla da latte con seminativi (1.67.0)
export const TIPI_MEZZO = ['Trattore', 'Mietitrebbia', 'Carro miscelatore', 'Rimorchio', 'Irroratrice', 'Attrezzo', 'Pick-up', 'Altro',
  'Sollevatore telescopico', 'Pala gommata', 'Carro botte', 'Spandiletame', 'Spandiliquame', 'Interratore di liquame', 'Spandiconcime',
  'Aratro', 'Ripuntatore', 'Erpice rotante', 'Erpice a dischi', 'Erpice a denti', 'Coltivatore', 'Rullo', 'Seminatrice di precisione', 'Seminatrice da cereali', 'Seminatrice su sodo',
  'Sarchiatrice', 'Falciatrice', 'Falciacondizionatrice', 'Voltafieno', 'Ranghinatore', 'Rotopressa', 'Rotopressa con fasciatore', 'Fasciatore', 'Pressa per balloni', 'Carro autocaricante',
  'Trinciatrice', 'Trinciasarmenti', 'Desilatore', 'Cisterna fissa', 'Cisterna mobile', 'Silos', 'Robot di mungitura', 'Impianto di mungitura', 'Robot spingiforaggio', 'Generatore'];
export const TIPI_MAN = ['Tagliando', 'Riparazione', 'Controllo', 'Ingrassaggio', 'Pneumatici', 'Revisione', 'Manutenzione', 'Rottura', 'Usura', 'Taratura', 'Lavaggio della botte', 'Lavaggio del macchinario', 'Controllo funzionale', 'Sanificazione', 'Altro'];
// Tipi di nota (da xFarm, 1.67.0); le note vecchie senza tipo valgono "Nota generica"
export const TIPI_NOTA = ['Nota generica', 'Danni da patogeni', 'Danni da insetti', 'Ristagno idrico', 'Presenza di erbe infestanti', 'Danno generico', 'Campionamento', 'Analisi colturale'];
// Movimenti di magazzino: Inventario = quantità contata; la giacenza da quel giorno riparte da lì (1.67.0)
export const TIPI_MOV = ['Carico', 'Scarico', 'Inventario'];
// Tipologie del prodotto per categoria (da xFarm, 1.67.0): solo descrittive, non cambiano i conti
export const TIPOLOGIE = {
  Fitofarmaco: ['Fungicida', 'Insetticida', 'Acaricida', 'Nematocida', 'Molluschicida', 'Fitoregolatore', 'Coadiuvante', 'Biostimolante', 'Repellente', 'Feromone', 'Altro'],
  Diserbante: ['Pre-semina', 'Pre-emergenza', 'Post-emergenza', 'Totale', 'Altro'],
  Concime: ['Minerale', 'Organico', 'Organo-minerale', 'Fogliare', 'Ammendante', 'Correttivo', 'Biostimolante', 'Inibitore della nitrificazione', 'Altro'],
  Effluente: ['Liquame', 'Letame', 'Digestato', 'Altro'],
  Seme: ['Ibrido', 'Varietà', 'Miscuglio', 'Seme conciato', 'Altro'],
  Mangime: ['Nucleo', 'Concentrato', 'Mangime completo', 'Granella', 'Farina', 'Fiocchi', 'Sottoprodotto', 'Altro'],
  Integratore: ['Minerale', 'Vitaminico', 'Tampone', 'Lievito', 'Altro'],
  Foraggio: ['Fieno', 'Fasciato', 'Insilato di mais', "Insilato d'erba", 'Pastone', 'Paglia', 'Erba verde', 'Altro'],
};
export const RAZZE = ['Frisona', 'Bruna', 'Pezzata Rossa', 'Jersey', 'Simmental', 'Rendena', 'Incrocio', 'Altra'];
export const GRUPPI = ['Alta produzione', 'Media produzione', 'Bassa produzione', 'Fresche', 'Asciutta', 'Preparto', 'Manze', 'Vitelle', 'Vitelli'];
export const TIPI_EV = ['Parto', 'Calore', 'Fecondazione', 'Diagnosi gravidanza', 'Messa in asciutta', 'Trattamento sanitario', 'Vaccinazione', 'Controllo funzionale', 'Uscita', 'Nota'];
export const GEST = 283;

// Colori delle colture sulla mappa e nelle miniature
const CROP = [
  // Stessi colori di xFarm per le colture dell'azienda (legenda letta il 06/11/2026). Miscuglio prima di frumento: il nome può contenere entrambi.
  [/miscuglio/i, '#DEB969'], [/mais|granturco/i, '#F0B43F'], [/frumento|grano/i, '#D30B4D'], [/orzo|triticale|avena|segale/i, '#F1CB99'],
  [/medica|trifoglio/i, '#3B63A8'], [/prato|loiessa|erba/i, '#8CD43F'], [/soia/i, '#B9CC1E'],
  [/sorgo/i, '#E8662A'], [/girasole/i, '#FFD400'], [/colza/i, '#F7EC2E'], [/vite|vigneto/i, '#B03A9A'],
  [/barbabietola/i, '#E2366B'], [/pomodoro/i, '#F2452E'], [/riposo/i, '#C3CCC7'],
];
// Coltura non in elenco: colore ricavato dal nome (sempre lo stesso per lo stesso nome, diverso fra nomi diversi)
const coloreDaNome = n => {
  let h = 2166136261; for (const ch of n.trim().toLowerCase()) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619) >>> 0; }
  const hue = h % 360, s = (60 + (h >>> 9) % 25) / 100, l = (42 + (h >>> 17) % 16) / 100;
  const f = k => { const x = (k + hue / 30) % 12, c = l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(x - 3, 9 - x, 1)); return Math.round(c * 255).toString(16).padStart(2, '0'); };
  return '#' + f(0) + f(8) + f(4);
};
export const cropColorName = n => { n = n || ''; if (n === 'Vuoto (raccolto)') return '#A9B4AE'; for (const [re, col] of CROP) if (re.test(n)) return col; return n.trim() ? coloreDaNome(n) : '#A9B4AE'; };
// Suggerimenti per la coltura: l'elenco fisso più quelle già scritte nei campi (senza doppioni di maiuscole)
export function coltureNote() {
  const out = [...COLTURE], vis = new Set(COLTURE.map(x => x.toLowerCase())), extra = [];
  (S.campi || []).forEach(c => [c.coltura, ...(Array.isArray(c.colture) ? c.colture.flatMap(e => e ? [e.coltura, e.secondo && e.secondo.coltura] : []) : [])].forEach(x => {
    x = (x || '').trim(); if (!x || x === 'Vuoto (raccolto)' || vis.has(x.toLowerCase())) return; vis.add(x.toLowerCase()); extra.push(x);
  }));
  return out.concat(extra.sort((a, b) => a.localeCompare(b, 'it')));
}
// Coltura di un campo in una data annata: storico per anno, altrimenti la coltura in atto
export function colturaOf(c, anno = UI.anno) {
  if (!c) return null; const st = Array.isArray(c.colture) ? c.colture : [];
  const e = st.find(x => +x.anno === +anno); if (e) return e;
  if (+anno === new Date().getFullYear()) return c.coltura ? { anno, coltura: c.coltura, varieta: c.varieta || '' } : null;
  return null;
}
export const cropOf = (c, anno) => { if (c && !c.id && c.coltura !== undefined && !c.colture) return c.coltura; const e = colturaOf(c, anno); return e ? e.coltura : ''; };
export const cropColor = (c, anno) => cropColorName(cropOf(c, anno));
// Campo vuoto dopo la raccolta (chiesto da Marco il 18/11/2026): solo per l'annata in corso, se c'è una Raccolta fatta
// e dopo non c'è una Semina. Lo storico per annata (cropOf, Rotazioni, registri) resta com'è.
export const VUOTO = 'Vuoto (raccolto)';
// Seconda coltura dell'annata (1.58.0, da xFarm): secondo raccolto o coltura di copertura, salvata nella stessa riga
// dell'annata come `secondo: { coltura, varieta, semina, resa, destinazione, uso }`. Tutto il resto dell'app continua a
// leggere la coltura principale con colturaOf/cropOf; colturaAlla(c, data) dà quella giusta per un giorno preciso.
export const secondoOf = (c, anno) => { const e = colturaOf(c, anno); return e && e.secondo && e.secondo.coltura ? e.secondo : null; };
export const coltureAnno = (c, anno) => { const e = colturaOf(c, anno); return e ? [e].concat(secondoOf(c, anno) ? [Object.assign({ anno: e.anno }, e.secondo)] : []) : []; };
// Una Raccolta chiude la coltura salvo "No" (es. tagli della medica)
export const chiudeColtura = o => o.tipo === 'Raccolta' && o.chiude !== 'No';
// Prima Raccolta che chiude la coltura principale in un'annata (anche futura rispetto a oggi, per le date dei registri)
// Contano solo le raccolte dopo la semina della principale (data della coltura o prima Semina dell'anno): una loiessa
// seminata l'anno prima e raccolta in aprile, prima del mais, non è la "prima raccolta"
function inizioPrincipale(c, y) {
  const e = colturaOf(c, y); if (e && okD(e.semina)) return e.semina;
  let s = null; for (const o of S.operazioni) if (o.campoId === c.id && o.stato !== 'Pianificata' && o.tipo === 'Semina' && yearOf(o.data) === y && (!s || o.data < s)) s = o.data;
  return s;
}
function primaRaccolta(c, y) { const da = inizioPrincipale(c, y); let r = null; for (const o of S.operazioni) if (o.campoId === c.id && o.stato !== 'Pianificata' && yearOf(o.data) === y && chiudeColtura(o) && (!da || fineDi(o) >= da) && (!r || fineDi(o) < fineDi(r))) r = o; return r; }
// Coltura del campo in un giorno: la seconda dalla sua semina (o, se manca la data, dal giorno dopo la prima raccolta)
export function colturaAlla(c, data) {
  const y = yearOf(data); const e = colturaOf(c, y); const s2 = secondoOf(c, y); if (!e || !s2) return e;
  let da = okD(s2.semina) ? s2.semina : null;
  if (!da) { const r = primaRaccolta(c, y); da = r ? addDays(fineDi(r), 1) : null; }
  return da && data >= da ? Object.assign({ anno: e.anno, secondo: true }, s2) : e;
}
// Raccolte che chiudono la coltura e semine fatte quest'anno (fino a oggi), in ordine; null se l'annata scelta non è quella in corso
function raccoltaSemina(c, anno = UI.anno) {
  const y = new Date().getFullYear(); if (!c || !c.id || +anno !== y) return null;
  const R = [], Se = [];
  for (const o of S.operazioni) {
    if (o.campoId !== c.id || o.stato === 'Pianificata' || yearOf(o.data) !== y || fineDi(o) > today()) continue;
    // raccolta su più giorni: il campo è vuoto dall'ultimo giorno
    if (chiudeColtura(o)) R.push(o); else if (o.tipo === 'Semina') Se.push(o);
  }
  R.sort((a, b) => fineDi(a).localeCompare(fineDi(b))); Se.sort((a, b) => a.data.localeCompare(b.data));
  const r = R[R.length - 1] || null, s = Se[Se.length - 1] || null;
  return { r, s, dopo: !!(r && s && s.data >= fineDi(r)), R, Se };
}
// Raccolta che ha lasciato il campo vuoto (nessuna Semina dopo; a parità di giorno vince la Semina)
export function raccoltaFatta(c, anno) { const x = raccoltaSemina(c, anno); return x && x.r && !x.dopo ? x.r : null; }
// Coltura che c'è adesso nel campo. Con una seconda coltura: dopo la prima raccolta il campo è vuoto finché non c'è
// una Semina, poi c'è la seconda coltura; dopo la sua raccolta di nuovo vuoto, e una Semina ancora dopo porta
// alla coltura dell'annata dopo. Senza seconda coltura: VUOTO dopo la raccolta, poi la coltura dell'annata dopo
// (es. frumento seminato in autunno), se è già scritta, altrimenti quella dell'annata; '' se non ha coltura
export const cropOra = (c, anno) => {
  const k = cropOf(c, anno); const x = raccoltaSemina(c, anno); if (!x || !x.r) return k;
  const y = +anno || UI.anno, s2 = secondoOf(c, y);
  if (s2) {
    const da = inizioPrincipale(c, y), R1 = x.R.filter(o => !da || fineDi(o) >= da);
    if (!R1.length) return k;   // la principale è seminata e non ancora raccolta
    const r1 = R1[0], dopo1 = x.Se.filter(o => o.data >= fineDi(r1));
    if (!dopo1.length) return k ? VUOTO : '';
    const sem2 = dopo1[0], r2 = R1.find(o => fineDi(o) > sem2.data);
    if (!r2) return s2.coltura;
    return x.Se.some(o => o.data >= fineDi(r2)) ? cropOf(c, y + 1) || s2.coltura : VUOTO;
  }
  if (x.dopo) return cropOf(c, y + 1) || k;
  return k ? VUOTO : '';
};
export const cropColorOra = (c, anno) => cropColorName(cropOra(c, anno));
export function storicoColture(c) {
  const m = new Map(); (c.colture || []).forEach(e => m.set(+e.anno, e));
  const y = new Date().getFullYear(); if (c.coltura && !m.has(y)) m.set(y, { anno: y, coltura: c.coltura, varieta: c.varieta || '' });
  return [...m.values()].sort((a, b) => b.anno - a.anno);
}
export const isFatto = o => o.stato !== 'Pianificata';
// Avvicendamento: sui seminativi la stessa coltura per due anni di fila va segnalata (escluse pluriennali, foraggere e riposo)
const NO_ROT = /medica|prato|loiessa|loietto|erbai|trifoglio|vite|vigneto|frutt|pioppo|riposo|maggese|pascol/i;
const famiglia = s => { s = (s || '').toLowerCase(); return /mais/.test(s) ? 'mais' : /frumento tenero|grano tenero/.test(s) ? 'frumento tenero' : /frumento duro|grano duro/.test(s) ? 'frumento duro' : s.replace(/\s*\(.*\)$/, '').trim(); };
export function rotazione(c, anno) {
  const a = cropOf(c, anno), b = cropOf(c, anno - 1); if (!a || !b || NO_ROT.test(a)) return null;
  if (famiglia(a) !== famiglia(b)) return null;
  const c2 = cropOf(c, anno - 2);
  return { coltura: a, anni: c2 && famiglia(c2) === famiglia(a) ? 3 : 2 };
}
export const campoHa = c => N(c.superficie) || (c.geom ? Math.round(areaHa(c.geom) * 10000) / 10000 : 0);

// Il numero aziendale (lo stesso di collari e sala di mungitura) identifica la vacca: viene prima di tutto
export const numCapo = c => { const n = String((c && c.numero) || '').trim(); return n === '0' ? '' : n; };
export function nomeCapo(c) {
  if (!c) return '';
  if (numCapo(c)) return 'N. ' + numCapo(c);
  if (c.nome || c.matricola) return c.nome || c.matricola;
  return (c.sesso === 'M' ? 'Maschio' : 'Femmina') + (okD(c.nascita) ? (c.sesso === 'M' ? ' nato il ' : ' nata il ') + fd(c.nascita) : ' senza numero');
}
// Numero e nome insieme, per elenchi e promemoria: "N. 296 · VITARA"
export const nomeCapoLungo = c => nomeCapo(c) + (numCapo(c) && c.nome ? ' · ' + c.nome : '');

export function capoInfo(c, ev) {
  const T = today();
  const last = (t, after) => { for (let i = ev.length - 1; i >= 0; i--) { const e = ev[i]; if (e.tipo === t && (!after || e.data > after)) return e; } return null; };
  const parto = last('Parto'); const pData = parto ? parto.data : null;
  const uscita = last('Uscita');
  const fec = last('Fecondazione', pData);
  const nFec = ev.filter(e => e.tipo === 'Fecondazione' && (!pData || e.data > pData)).length;
  const diag = fec ? last('Diagnosi gravidanza', fec.data) : null;
  let gravida = diag ? diag.esito === 'Positiva' : null;
  const asc = pData ? last('Messa in asciutta', pData) : null;
  let prevParto = fec && gravida !== false ? addDays(fec.data, GEST) : null;
  // dati del controllo funzionale AIA (Si@lleva) riferiti a questo parto, se nell'app non ci sono fecondazioni
  const A = !fec && c.aia && c.aia.stato && (!pData || !c.aia.parto || c.aia.parto === pData) ? c.aia : null;
  const aiaFec = !!(A && (A.stato === 'G' || A.stato === 'F' || A.parcheggiata));
  if (A && A.stato === 'G') { gravida = true; const op = A.prossima; if (op && okD(op.data)) prevParto = op.op === 'P' ? op.data : op.op === 'A' ? addDays(op.data, 60) : null; }
  else if (A && A.stato === 'V') gravida = false;
  let stato;
  if (uscita) stato = 'Uscita';
  else if (c.sesso === 'M') stato = okD(c.nascita) && diff(c.nascita, T) < 365 ? 'Vitello' : 'Maschio';
  else if (asc) stato = 'Asciutta';
  else if (pData) stato = 'In lattazione';
  else stato = okD(c.nascita) && diff(c.nascita, T) < 365 ? 'Vitella' : 'Manza';
  const dim = stato === 'In lattazione' ? diff(pData, T) : null;
  let sospLatte = null, sospCarne = null;
  ev.forEach(e => {
    if (e.tipo !== 'Trattamento sanitario' && e.tipo !== 'Vaccinazione') return;
    if (N(e.sospLatte) > 0) { const f = addDays(e.data, N(e.sospLatte)); if (!sospLatte || f > sospLatte) sospLatte = f; }
    if (N(e.sospCarne) > 0) { const f = addDays(e.data, N(e.sospCarne)); if (!sospCarne || f > sospCarne) sospCarne = f; }
  });
  const inSospLatte = !!(sospLatte && sospLatte >= T) && !uscita;
  const inSospCarne = !!(sospCarne && sospCarne >= T) && !uscita;
  const ctrl = last('Controllo funzionale');
  const nLatt = N(c.lattazioniPrecedenti) + ev.filter(e => e.tipo === 'Parto').length;
  const alerts = [];
  if (!uscita && c.sesso !== 'M') {
    if (stato === 'In lattazione' && !fec && !aiaFec && dim >= 50) alerts.push({ k: 'fec', lv: 'warn', t: 'Da fecondare', s: dim + ' giorni dal parto' });
    if (stato === 'Manza' && !fec && okD(c.nascita) && diff(c.nascita, T) >= 440) alerts.push({ k: 'fec', lv: 'warn', t: 'Manza da fecondare', s: eta(c.nascita) });
    if (fec && !diag && diff(fec.data, T) >= 28) alerts.push({ k: 'diag', lv: 'info', t: 'Diagnosi di gravidanza', s: 'fecondata il ' + fd(fec.data) });
    if (gravida && stato === 'In lattazione' && prevParto && diff(T, prevParto) <= 67) alerts.push({ k: 'asc', lv: 'warn', t: 'Da mettere in asciutta', s: 'parto previsto il ' + fd(prevParto) });
    if (gravida && prevParto && diff(T, prevParto) <= 21 && diff(T, prevParto) >= -15) alerts.push({ k: 'parto', lv: 'info', t: 'Parto vicino', s: 'previsto il ' + fd(prevParto) });
    if (inSospLatte) alerts.push({ k: 'sosp', lv: 'bad', t: 'Latte da non conferire', s: 'sospensione fino al ' + fd(sospLatte) });
  }
  return { stato, pData, dim, fec, nFec, diag, gravida, prevParto, sospLatte, inSospLatte, sospCarne, inSospCarne, ctrl, nLatt, alerts, ev, uscita, aia: A };
}

export function derive() {
  const evBy = {};
  S.eventi.forEach(e => { (evBy[e.capoId] = evBy[e.capoId] || []).push(e); });
  Object.values(evBy).forEach(a => a.sort(byDate));
  const capi = new Map(); S.capi.forEach(c => capi.set(c.id, capoInfo(c, evBy[c.id] || [])));
  const giac = new Map(), delta = new Map(); S.prodotti.forEach(p => giac.set(p.id, N(p.giacenzaIniziale)));
  const conInv = new Set(); S.movimenti.forEach(m => { if (m.tipo === 'Inventario' && giac.has(m.prodottoId)) conInv.add(m.prodottoId); });
  S.movimenti.forEach(m => { if (giac.has(m.prodottoId) && !conInv.has(m.prodottoId)) giac.set(m.prodottoId, giac.get(m.prodottoId) + segnoBase(m)); });
  for (const pid of conInv) { const r = scorri(N(get('prodotti', pid).giacenzaIniziale), S.movimenti.filter(m => m.prodottoId === pid)); giac.set(pid, r.g); r.delta.forEach((v, k) => delta.set(k, v)); }
  const latte = [...S.latte].filter(l => okD(l.data)).sort(byDate);
  Object.assign(D, { evBy, capi, giac, delta, latte });
}
/* Giacenza con gli inventari (1.67.0). Un movimento Inventario porta `quantita` = quantità contata: la giacenza diventa quella
   e la differenza con quella calcolata (D.delta) vale come un carico o uno scarico. Ordine: per data (senza data prima di tutto);
   nello stesso giorno l'inventario vale a fine giornata, dopo carichi e scarichi; due inventari nello stesso giorno: vale l'ultimo
   registrato (`creato`, poi id). `fino`: si ferma alla fine di quel giorno. Carichi, scarichi, fatture, razioni e gasolio non cambiano: restano Carico/Scarico. */
const segnoBase = m => m.tipo === 'Scarico' ? -N(m.quantita) : m.tipo === 'Inventario' ? 0 : N(m.quantita);
const ordMov = (a, b) => (okD(a.data) ? a.data : '').localeCompare(okD(b.data) ? b.data : '') || (a.tipo === 'Inventario') - (b.tipo === 'Inventario') || String(a.creato || '').localeCompare(String(b.creato || '')) || String(a.id || '').localeCompare(String(b.id || ''));
function scorri(g0, movs, fino) {
  let g = g0; const delta = new Map();
  for (const m of [...movs].sort(ordMov)) {
    if (fino && okD(m.data) && m.data > fino) break;
    if (m.tipo === 'Inventario') { const d = N(m.quantita) - g; delta.set(m.id, d); g = N(m.quantita); } else g += segnoBase(m);
  }
  return { g, delta };
}
export const giac = p => D.giac.get(p.id) || 0;
/** Quantità con il segno di un movimento: + carico, − scarico; per l'inventario la differenza fra contato e calcolato. */
export const segnoMov = m => m.tipo === 'Inventario' ? (D.delta && D.delta.get(m.id)) || 0 : segnoBase(m);
/** Giacenza di un prodotto alla fine del giorno `data` (AAAA-MM-GG), inventari compresi; i movimenti senza data contano sempre. */
export const giacAl = (p, data, movs = S.movimenti) => scorri(N(p.giacenzaIniziale), movs.filter(m => m.prodottoId === p.id), data).g;
export const capoI = c => D.capi.get(c.id);
export function mezzoOre(m) {
  const ops = S.operazioni.filter(o => o.mezzoId === m.id);
  const base = N(m.oreIniziali) + sum(ops, o => o.ore);
  const man = Math.max(0, ...S.manutenzioni.filter(x => x.mezzoId === m.id).map(x => N(x.ore)));
  // lettura del contaore ("Aggiorna ore" nel libretto): più le ore dei lavori registrati dopo quel giorno
  // vince sui conti fatti con le ore iniziali, che possono essere sbagliate; contano solo gli interventi successivi alla lettura
  if (N(m.oreLettura) && okD(m.oreLetturaData)) {
    const dopo = d => okD(d) && d > m.oreLetturaData;
    return Math.max(N(m.oreLettura) + sum(ops.filter(o => dopo(o.data)), o => o.ore), ...S.manutenzioni.filter(x => x.mezzoId === m.id && dopo(x.data)).map(x => N(x.ore)));
  }
  return Math.max(base, man);
}
export function mezzoTagliando(m) {
  const t = S.manutenzioni.filter(x => x.mezzoId === m.id && x.tipo === 'Tagliando').map(x => N(x.ore));
  const ult = t.length ? Math.max(...t) : N(m.oreUltimoTagliando); const int = N(m.intervallo);
  return int > 0 ? { ult, prossimo: ult + int } : null;
}
// Prodotti di un'attività (1.68.0): il primo nei campi di sempre (prodottoId, dose, quantita, avversita),
// gli altri in altriProdotti [{ prodottoId, dose, quantita, avversita }]; riga 0 = il primo
export function prodottiOp(o) {
  if (!o) return [];
  const out = o.prodottoId ? [{ prodottoId: o.prodottoId, dose: o.dose, quantita: o.quantita, avversita: o.avversita, riga: 0 }] : [];
  (Array.isArray(o.altriProdotti) ? o.altriProdotti : []).forEach((r, i) => { if (r && r.prodottoId) out.push({ prodottoId: r.prodottoId, dose: r.dose, quantita: r.quantita, avversita: r.avversita || o.avversita, riga: i + 1 }); });
  return out;
}
export function opCosto(o) {
  const m = get('mezzi', o.mezzoId);
  const prod = prodottiOp(o).reduce((t, r) => { const p = get('prodotti', r.prodottoId); return t + (p ? N(r.quantita) * N(p.prezzo) : 0); }, 0), mez = m ? N(o.ore) * N(m.costoOra) : 0, extra = N(o.costoExtra);
  return { prod, mez, extra, tot: prod + mez + extra, ricavo: N(o.raccolto) * N(o.prezzoVendita) };
}
export function campoInfo(c, anno = UI.anno) {
  const T = today();
  const ops = S.operazioni.filter(o => o.campoId === c.id && yearOf(o.data) === anno && o.stato !== 'Pianificata').sort(byDate);
  const plan = S.operazioni.filter(o => o.campoId === c.id && o.stato === 'Pianificata').sort(byDate);
  const t = { prod: 0, mez: 0, extra: 0, tot: 0, ricavo: 0 };
  ops.forEach(o => { const k = opCosto(o); for (const x in t) t[x] += k[x]; });
  let carenza = null;
  S.operazioni.forEach(o => {
    if (o.campoId !== c.id || !o.prodottoId || !okD(o.data) || o.stato === 'Pianificata') return;
    const p = get('prodotti', o.prodottoId); if (!p || N(p.carenza) <= 0) return;
    const f = addDays(fineDi(o), N(p.carenza)); if (f >= T && (!carenza || f > carenza.fine)) carenza = { fine: f, prodotto: p.nome };
  });
  const last = [...S.operazioni].filter(o => o.campoId === c.id && o.stato !== 'Pianificata').sort(byDate).pop() || null;
  return { ops, plan, ...t, carenza, last };
}
export const gruppoCapi = g => S.capi.filter(c => c.gruppo === g && capoI(c).stato !== 'Uscita').length;
// kg contenuti in un'unità del prodotto: le razioni sono in kg, il magazzino e i prezzi anche in quintali o tonnellate
export const kgUnita = p => (p && p.unita === 't' ? 1000 : p && p.unita === 'q' ? 100 : 1);
export function razioneInfo(r) {
  const capi = N(r.capi) > 0 ? N(r.capi) : gruppoCapi(r.gruppo);
  const ing = (r.ingredienti || []).map(i => { const p = get('prodotti', i.prodottoId); const kgTot = N(i.kg) * capi; const u = kgUnita(p); const g = p ? giac(p) * u : 0; return { p, kg: N(i.kg), kgTot, costo: p ? N(i.kg) * N(p.prezzo) / u : 0, autonomia: kgTot > 0 && p ? g / kgTot : null }; });
  const costoCapo = sum(ing, i => i.costo); const auto = ing.filter(i => i.autonomia !== null).map(i => i.autonomia);
  return { capi, ing, costoCapo, costoGiorno: costoCapo * capi, kgCapo: sum(ing, i => i.kg), autonomia: auto.length ? Math.min(...auto) : null };
}

export const extraAlerts = [];
export function allAlerts() {
  const T = today(); const out = [];
  extraAlerts.forEach(f => { try { out.push(...f()); } catch (e) { } });
  S.capi.forEach(c => { capoI(c).alerts.forEach(a => out.push({ lv: a.lv, area: 'stalla', t: a.t, s: (c.nome ? c.nome + ' · ' : '') + (c.matricola || '') + ' — ' + a.s, go: { type: 'capo', id: c.id } })); });
  S.prodotti.forEach(p => {
    if (p.categoria === 'Effluente') return;   // prodotti in stalla, senza giacenza
    const g = giac(p), u = p.unita || '';
    if (g < 0) out.push({ lv: 'bad', area: 'magazzino', t: 'Giacenza negativa: ' + p.nome, s: 'Registra il carico mancante (' + nf(g, 2) + ' ' + u + ')', go: { type: 'prodotto', id: p.id } });
    else if (N(p.scortaMin) > 0 && g < N(p.scortaMin)) out.push({ lv: 'warn', area: 'magazzino', t: 'Scorta bassa: ' + p.nome, s: nf(g, 1) + ' ' + u + ' rimasti, minimo ' + nf(p.scortaMin) + ' ' + u, go: { type: 'prodotto', id: p.id } });
    if (okD(p.scadenza) && g > 0) { const d = diff(T, p.scadenza); if (d < 0) out.push({ lv: 'bad', area: 'magazzino', t: 'Scaduto: ' + p.nome, s: 'Scaduto il ' + fd(p.scadenza), go: { type: 'prodotto', id: p.id } }); else if (d <= 60) out.push({ lv: 'warn', area: 'magazzino', t: 'In scadenza: ' + p.nome, s: 'Scade il ' + fd(p.scadenza), go: { type: 'prodotto', id: p.id } }); }
  });
  S.mezzi.forEach(m => {
    // trattori: un avviso per mezzo con i pezzi del libretto scaduti o in scadenza (il tagliando è il pezzo "olio motore")
    if (isTrattore(m)) { const r = riepilogo(m), l = r.bad.length ? r.bad : r.warn; if (l.length) out.push({ lv: r.bad.length ? 'bad' : 'warn', area: 'mezzi', t: (r.bad.length ? 'Manutenzione scaduta: ' : 'Manutenzione in scadenza: ') + m.nome, s: l.slice(0, 3).map(c => c.nome).join(', ') + (l.length > 3 ? ' e altri ' + (l.length - 3) : ''), go: { type: 'mezzo', id: m.id } }); }
    const t = isTrattore(m) ? null : mezzoTagliando(m), ore = mezzoOre(m);
    if (t && t.prossimo - ore <= 25) out.push({ lv: t.prossimo - ore < 0 ? 'bad' : 'warn', area: 'mezzi', t: 'Tagliando ' + m.nome, s: t.prossimo - ore < 0 ? 'Superato di ' + nf(ore - t.prossimo, 0) + ' ore' : 'Tra ' + nf(t.prossimo - ore, 0) + ' ore di lavoro', go: { type: 'mezzo', id: m.id } });
    [['scadenzaRevisione', 'Revisione'], ['scadenzaAssicurazione', 'Assicurazione']].forEach(([k, l]) => { if (okD(m[k])) { const d = diff(T, m[k]); if (d <= 30) out.push({ lv: d < 0 ? 'bad' : 'warn', area: 'mezzi', t: l + ' ' + m.nome, s: (d < 0 ? 'Scaduta il ' : 'Scade il ') + fd(m[k]), go: { type: 'mezzo', id: m.id } }); } });
  });
  S.operatori.forEach(o => { if (!okD(o.scadenzaPatentino)) return; const d = diff(T, o.scadenzaPatentino); if (d <= 60) out.push({ lv: d < 0 ? 'bad' : 'warn', area: 'campi', t: 'Patentino ' + o.nome, s: (d < 0 ? 'Scaduto il ' : 'Scade il ') + fd(o.scadenzaPatentino), go: { edit: 'operatori', id: o.id } }); });
  S.mezzi.forEach(m => { if (!okD(m.controlloFunzionale)) return; const d = diff(T, m.controlloFunzionale); if (d <= 60) out.push({ lv: d < 0 ? 'bad' : 'warn', area: 'mezzi', t: 'Controllo funzionale ' + m.nome, s: (d < 0 ? 'Scaduto il ' : 'Scade il ') + fd(m.controlloFunzionale), go: { type: 'mezzo', id: m.id } }); });
  S.prodotti.forEach(p => { if (!okD(p.scadenzaAut) || giac(p) <= 0) return; const d = diff(T, p.scadenzaAut); if (d <= 90) out.push({ lv: d < 0 ? 'bad' : 'warn', area: 'magazzino', t: 'Autorizzazione ' + p.nome, s: (d < 0 ? 'Non più autorizzato dal ' : 'Autorizzato fino al ') + fd(p.scadenzaAut) + ' · ' + nf(giac(p), 1) + ' ' + (p.unita || '') + ' in magazzino', go: { type: 'prodotto', id: p.id } }); });
  const Y = new Date().getFullYear();
  [Y, Y + 1].forEach(y => S.campi.forEach(c => { const r = rotazione(c, y); if (r) out.push({ lv: 'warn', area: 'campi', t: 'Rotazione: ' + c.nome, s: r.coltura + ' per ' + r.anni + ' anni di fila (' + y + '): verifica l\'avvicendamento richiesto dalla PAC', go: { type: 'campo', id: c.id } }); }));
  S.campi.forEach(c => { const i = campoInfo(c); if (i.carenza) out.push({ lv: 'info', area: 'campi', t: 'Carenza in corso: ' + c.nome, s: 'Raccolta dal ' + fd(addDays(i.carenza.fine, 1)) + ' · ' + i.carenza.prodotto, go: { type: 'campo', id: c.id } }); });
  S.operazioni.filter(o => o.stato === 'Pianificata' && okD(o.data)).forEach(o => { const c = get('campi', o.campoId); const d = diff(T, o.data); if (d < 0) out.push({ lv: 'warn', area: 'campi', t: 'In ritardo: ' + (o.tipo || 'attività') + (c ? ' · ' + c.nome : ''), s: 'Pianificata per il ' + fd(o.data), go: { edit: 'operazioni', id: o.id } }); else if (d <= 3) out.push({ lv: 'info', area: 'campi', t: (o.tipo || 'Attività') + (c ? ' · ' + c.nome : ''), s: d === 0 ? 'Pianificata per oggi' : 'Pianificata per il ' + fd(o.data), go: { edit: 'operazioni', id: o.id } }); });
  const inLatt = S.capi.filter(c => capoI(c).stato === 'In lattazione').length;
  if (inLatt && !S.latte.some(l => l.data === T)) out.push({ lv: 'info', area: 'latte', t: 'Registra il latte di oggi', s: inLatt + ' vacche in lattazione', go: { form: 'latte' } });
  const rank = { bad: 0, warn: 1, info: 2 };
  return out.sort((a, b) => rank[a.lv] - rank[b.lv]);
}
