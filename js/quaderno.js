// Quaderno di campagna automatico (1.65.0): dalle operazioni registrate completa da solo i dati sicuri dei trattamenti
// (dose dalla quantità, quantità dagli ettari se non c'è già uno scarico a mano, meteo dell'ora scritta da Open-Meteo)
// e mette fra i dubbi del Centro automatico quello che va deciso.
// Norma: Reg. (UE) 2023/564 (contenuto e formato elettronico), Reg. (UE) 2025/2203 e DM Masaf 30/12/2025: digitale per tutti dal 1° gennaio 2027.
import { S, get } from './state.js';
import * as store from './store.js';
import { fd, nf, N, today, addDays, okD, yearOf } from './util.js';
import { registra } from './automazioni.js';
import { colturaAlla, prodottiOp } from './domain.js';
import { isFitoOp, FITO, operatoreDi, controlliOp } from './checks.js';
import { meteoAlMomento, farmPosition } from './meteo.js';
import { haTrattati, eppoDi } from './registro.js';

const vuoto = x => x === null || x === undefined || x === '';
const METEO = ['temp', 'umidita', 'ventoKmh', 'pioggia24'];
const prodOf = o => get('prodotti', o.prodottoId);
export const isTrattamento = o => isFitoOp(o.tipo) || !!(prodOf(o) && FITO.includes(prodOf(o).categoria));
// trattamenti degli ultimi 400 giorni (l'annata in corso e quella prima, che si conserva)
const recenti = () => { const da = addDays(today(), -400); return S.operazioni.filter(o => okD(o.data) && o.data >= da && isTrattamento(o)); };
const fatto = o => o.stato !== 'Pianificata';
const colturaDi = o => (colturaAlla(get('campi', o.campoId) || {}, o.data) || {}).coltura || '';
const nomeOp = o => `${(get('campi', o.campoId) || {}).nome || 'campo'} il ${fd(o.data)}${prodOf(o) ? ' (' + prodOf(o).nome + ')' : ''}`;
const premi = (form, id) => () => {
  if (typeof document === 'undefined') return;
  const b = document.createElement('button'); b.hidden = true; b.dataset.act = 'edit'; b.dataset.form = form; b.dataset.id = id;
  document.body.appendChild(b); b.click(); b.remove();
};
const apriOp = id => premi('operazioni', id), apriProd = id => premi('prodotti', id);

// record scritti dal quaderno: vanno nel diario (e si annullano) anche se il giro parte subito dopo un salvataggio a mano
const MIEI = new Set();

// Salva l'operazione; lo scarico del magazzino si tocca solo se cambiano quantità o stato, come il salvataggio della scheda (forms.js)
async function salvaOp(o, ch) {
  const cur = get('operazioni', o.id); if (!cur) return false;
  const { id, ...d } = cur; const v = Object.assign(d, ch);
  MIEI.add(id); await store.put('operazioni', id, v);
  if (!('quantita' in ch) && !('stato' in ch)) return true;
  const p = get('prodotti', v.prodottoId), c = get('campi', v.campoId), mov = S.movimenti.find(m => m.opId === id && !m.riga);
  const eff = p && p.categoria === 'Effluente';
  if (!eff && v.prodottoId && N(v.quantita) > 0 && v.stato !== 'Pianificata') { const mid = mov ? mov.id : 'qm-' + id; MIEI.add(mid); await store.put('movimenti', mid, { data: v.data, prodottoId: v.prodottoId, tipo: 'Scarico', quantita: N(v.quantita), note: (v.tipo || '') + ' · ' + (c ? c.nome : ''), opId: id }); }
  else if (mov) { MIEI.add(mov.id); await store.remove('movimenti', mov.id); }
  // altri prodotti della stessa attività (1.68.0): uno scarico ciascuno, con "riga"
  for (const r of prodottiOp(v).filter(x => x.riga)) {
    const q = get('prodotti', r.prodottoId), m2 = S.movimenti.find(m => m.opId === id && m.riga === r.riga);
    if (q && q.categoria !== 'Effluente' && N(r.quantita) > 0 && v.stato !== 'Pianificata') { const mid = m2 ? m2.id : 'qm-' + id + '-' + r.riga; MIEI.add(mid); await store.put('movimenti', mid, { data: v.data, prodottoId: r.prodottoId, tipo: 'Scarico', quantita: N(r.quantita), note: (v.tipo || '') + ' · ' + (c ? c.nome : ''), opId: id, riga: r.riga }); }
    else if (m2) { MIEI.add(m2.id); await store.remove('movimenti', m2.id); }
  }
  return true;
}

// uno scarico scritto a mano (senza operazione) dello stesso prodotto vicino alla data: la quantità calcolata lo raddoppierebbe
const scaricoAMano = o => S.movimenti.some(m => m.tipo === 'Scarico' && !m.opId && !m.reso && m.prodottoId === o.prodottoId && okD(m.data) && Math.abs((new Date(m.data) - new Date(o.data)) / 864e5) <= 3);
// Calcoli dagli ettari trattati: { dose } è sempre sicuro; { quantita } muove il magazzino
function calcolati(o) {
  const ch = {}; const c = get('campi', o.campoId); const ha = c ? haTrattati(o, c) : 0;
  if (o.prodottoId && ha > 0) {
    if (N(o.dose) > 0 && vuoto(o.quantita)) ch.quantita = Math.round(N(o.dose) * ha * 100) / 100;
    else if (N(o.quantita) > 0 && vuoto(o.dose)) ch.dose = Math.round(N(o.quantita) / ha * 1000) / 1000;
  }
  return ch;
}
const quantitaSicura = o => o.data >= addDays(today(), -30) && !scaricoAMano(o);
const senzaMeteo = o => METEO.every(k => vuoto(o[k])) && !o.meteoAuto && o.data <= today();
// il meteo si salva da solo solo per un'ora scritta e già passata; senza ora l'app guarderebbe le 10:00
const oraPassata = o => { if (!/^\d{1,2}:\d{2}/.test(o.oraInizio || '')) return false; if (o.data < today()) return true; return parseInt(o.oraInizio, 10) < new Date().getHours(); };
const testoMeteo = m => [nf(m.temp, 1) + ' °C', nf(m.umidita, 0) + '% umidità', 'vento ' + nf(m.ventoKmh, 0) + ' km/h', 'pioggia 24 h ' + nf(m.pioggia24, 1) + ' mm'].join(', ');

export async function completa() {
  MIEI.clear();
  const ops = recenti().filter(fatto);
  let dosi = 0, meteo = 0, fetch = 0; const pos = farmPosition(); const dubbi = [];
  for (const o of ops) {
    const ch = {}; const calc = calcolati(o);
    if ('dose' in calc) ch.dose = calc.dose;
    if ('quantita' in calc) {
      if (quantitaSicura(o)) ch.quantita = calc.quantita;
      else dubbi.push({ id: 'qd-q:' + o.id, area: 'campagna',
        testo: `Su ${nome(o)} c'è la dose ma non la quantità totale${scaricoAMano(o) ? ', e in magazzino c\'è già uno scarico a mano di questo prodotto in quei giorni' : ''}.`,
        proposta: `Scrivo ${nf(calc.quantita, 2)} ${(prodOf(o) || {}).unita || ''} (dose × ettari trattati) e lo scarico dal magazzino`,
        conferma: () => salvaOp(o, { quantita: calc.quantita }), apri: apriOp(o.id) });
    }
    if (Object.keys(ch).length) dosi++;
    if (pos && senzaMeteo(o) && fetch < 40) {
      fetch++;
      try {
        const m = await meteoAlMomento(o.data, o.oraInizio);
        const val = m && { temp: m.temp, umidita: m.umidita, ventoKmh: m.ventoKmh, pioggia24: m.pioggia24 };
        if (!m) ch.meteoAuto = 'nd';   // giorno senza dati: non si richiede più
        else if (oraPassata(o)) { Object.assign(ch, val, { meteoAuto: m.fonte }); meteo++; }
        else dubbi.push({ id: 'qd-meteo:' + o.id, area: 'campagna',
          testo: `Su ${nome(o)} manca il meteo del trattamento${o.oraInizio ? '' : ' e anche l\'ora di inizio'}.`,
          proposta: `Meteo delle ${m.ora} da Open-Meteo: ${testoMeteo(m)}`,
          conferma: () => salvaOp(o, Object.assign({}, val, { meteoAuto: m.fonte + (o.oraInizio ? '' : ' ore ' + m.ora) }) ), apri: apriOp(o.id) });
      } catch (e) { /* senza internet: si riprova al giro dopo */ }
    }
    if (Object.keys(ch).length) await salvaOp(o, ch);
  }
  const note = [dosi ? `${dosi} ${dosi === 1 ? 'trattamento' : 'trattamenti'} con quantità o dose calcolata dagli ettari` : '', meteo ? `meteo dell'ora aggiunto a ${meteo} ${meteo === 1 ? 'trattamento' : 'trattamenti'}` : ''].filter(Boolean).join(' · ');
  return { salvati: dosi + meteo, note: note || 'quaderno già completo nei dati calcolabili', dubbi };
}
const nome = nomeOp;

// Proposte: si prendono da trattamenti già registrati, mai inventate
const ultimoCon = (o, k, f) => recenti().filter(x => x.id !== o.id && fatto(x) && !vuoto(x[k]) && f(x)).sort((a, b) => b.data.localeCompare(a.data))[0];
const patentinoOk = (op, data) => op && op.patentino && (!okD(op.scadenzaPatentino) || op.scadenzaPatentino >= data);

export function dubbiQuaderno() {
  const out = []; const oggi = today(); const anno = yearOf(oggi); const prodSenza = new Map();
  for (const o of recenti()) {
    const p = prodOf(o);
    if (!fatto(o)) {
      if (o.data >= oggi) continue;
      const c = get('campi', o.campoId); const v = Object.assign({}, o, { stato: 'Fatto' });
      const calc = calcolati(v); if ('quantita' in calc && !quantitaSicura(v)) delete calc.quantita;
      Object.assign(v, calc);
      const ctr = controlliOp(v, c ? [c] : [], o.id); const bad = ctr.filter(x => x.lv === 'bad');
      out.push({
        id: 'qd-fatto:' + o.id, area: 'campagna',
        testo: `Trattamento previsto su ${nome(o)}: l'hai fatto? Finché resta "da fare" non entra nel quaderno di campagna.${bad.length ? ' Attenzione: ' + bad.map(x => x.t).join('; ') + '.' : ''}`,
        proposta: bad.length ? 'Aprilo e controlla prima di segnarlo come fatto' : `Sì, segnalo come fatto il ${fd(o.data)}${p && N(v.quantita) > 0 ? ' e scarico ' + nf(N(v.quantita), 2) + ' ' + (p.unita || '') + ' dal magazzino' : ''}`,
        conferma: bad.length ? undefined : () => salvaOp(o, Object.assign({ stato: 'Fatto', controlli: null, controllato: isFitoOp(o.tipo) ? today() : null }, calc)),
        apri: apriOp(o.id),
      });
      continue;
    }
    if (p && !p.nReg) prodSenza.set(p.id, p);
    if (yearOf(o.data) < anno) continue;   // per l'annata passata solo prodotti e patentini
    const col = colturaDi(o);
    if (vuoto(o.avversita)) {
      const x = o.prodottoId && ultimoCon(o, 'avversita', x => x.prodottoId === o.prodottoId && colturaDi(x) === col);
      out.push({ id: 'qd-avv:' + o.id, area: 'campagna', testo: `Manca l'avversità (il motivo del trattamento) su ${nome(o)}.`,
        proposta: x ? `Uguale all'ultima volta con questo prodotto su ${col || 'questa coltura'}: «${x.avversita}»` : 'Aprilo e scrivi contro cosa hai trattato',
        conferma: x ? () => salvaOp(o, { avversita: x.avversita }) : undefined, apri: apriOp(o.id) });
    }
    if (vuoto(o.bbch) && vuoto(o.fase)) {
      // stesso campo entro 3 giorni (miscela o passaggio vicino): stessa fase della coltura
      const x = ultimoCon(o, 'bbch', x => x.campoId === o.campoId && Math.abs((new Date(x.data) - new Date(o.data)) / 864e5) <= 3);
      out.push({ id: 'qd-bbch:' + o.id, area: 'campagna', testo: `Manca lo stadio della coltura (BBCH) su ${nome(o)}.`,
        proposta: x ? `Stesso stadio del trattamento del ${fd(x.data)} sullo stesso campo: BBCH ${x.bbch}` : 'Aprilo e scrivi lo stadio (es. 32 = secondo nodo)',
        conferma: x ? () => salvaOp(o, { bbch: x.bbch }) : undefined, apri: apriOp(o.id) });
    }
    if (vuoto(o.operatore)) {
      const abil = S.operatori.filter(op => patentinoOk(op, o.data));
      out.push({ id: 'qd-op:' + o.id, area: 'campagna', testo: `Manca chi ha fatto il trattamento su ${nome(o)}.`,
        proposta: abil.length === 1 ? `Probabilmente ${abil[0].nome}: è l'unico con il patentino valido in quella data` : 'Aprilo e scegli l\'operatore con il patentino',
        conferma: abil.length === 1 ? () => salvaOp(o, { operatore: abil[0].nome }) : undefined, apri: apriOp(o.id) });
    } else {
      const op = operatoreDi(o.operatore);
      if (!patentinoOk(op, o.data)) out.push({ id: 'qd-pat:' + o.id + ':' + o.operatore, area: 'campagna',
        testo: `${o.operatore} ha fatto il trattamento su ${nome(o)} ma ${!op ? 'non è fra gli operatori' : !op.patentino ? 'non ha il numero del patentino' : 'aveva il patentino scaduto (' + fd(op.scadenzaPatentino) + ')'}.`,
        proposta: 'Controlla l\'operatore o il patentino', apri: { area: 'campagna', tab: 'impostazioni' } });
    }
    if (col && !eppoDi(col)) out.push({ id: 'qd-eppo:' + col, area: 'campagna',
      testo: `La coltura «${col}» non ha un codice EPPO conosciuto dall'app: nel registro digitale andrà scelto il codice dall'elenco del Ministero.`,
      proposta: 'Nessuna azione: è solo un avviso' });
  }
  for (const p of prodSenza.values()) out.push({ id: 'qd-nreg:' + p.id, area: 'campagna',
    testo: `${p.nome} è usato nei trattamenti ma non ha il numero di registrazione del Ministero, che va nel quaderno.`,
    proposta: 'Apri il prodotto e scrivi il numero (si trova in etichetta)', apri: apriProd(p.id) });
  // un avviso per coltura, non uno per trattamento
  const visti = new Set(); return out.filter(d => !d.id.startsWith('qd-eppo:') || (!visti.has(d.id) && visti.add(d.id)));
}

registra({
  id: 'quaderno', nome: 'Quaderno di campagna', area: 'campagna',
  descr: 'Completa i trattamenti con i dati calcolabili (dose e quantità dagli ettari, meteo dell\'ora) e segnala cosa manca per il registro digitale',
  raccolte: ['operazioni', 'movimenti'], propri: (col, id) => MIEI.has(id) || id.startsWith('qm-'),   // id dello scarico deciso prima di scriverlo, così entra nel diario
  segui: () => [S.operazioni.length, S.operazioni.filter(o => isTrattamento(o) && fatto(o) && (senzaMeteo(o) || Object.keys(calcolati(o)).length)).length],
  pronta: () => S.operazioni.some(isTrattamento),
  esegui: () => completa(),
  dubbi: () => dubbiQuaderno(),
});
