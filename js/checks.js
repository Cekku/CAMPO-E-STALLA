// Controlli automatici sui trattamenti: autorizzazione, coltura in etichetta, dose, numero di interventi,
// intervallo, carenza, giacenza, patentino dell'operatore, controllo funzionale dell'irroratrice, meteo
import { S, get } from './state.js';
import { N, okD, addDays, diff, fd, nf, today, yearOf, esc } from './util.js';
import { ic } from './icons.js';
import { giac, campoHa, cropOf } from './domain.js';
import { getMeteo } from './meteo.js';
import { fitoLookup } from './fitodb.js';

export const FITO = ['Fitofarmaco', 'Diserbante'];
export const isFitoOp = tipo => tipo === 'Trattamento fitosanitario' || tipo === 'Diserbo';

const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
// Famiglie di colture come scritte in etichetta
const FAM = [
  ['mais', /\bmais\b|granoturco|\bzea\b/], ['frumento', /frumento|grano/], ['frumento tenero', /frumento tenero|grano tenero/], ['frumento duro', /frumento duro|grano duro/],
  ['orzo', /\borzo\b/], ['triticale', /triticale/], ['segale', /segale/], ['avena', /avena/], ['soia', /\bsoia\b/], ['sorgo', /sorgo/], ['girasole', /girasole/], ['colza', /colza/],
  ['erba medica', /medica/], ['prato', /prat|loiessa|loietto|graminacee foraggere|foraggere/], ['barbabietola', /barbabietola/], ['vite', /\bvite\b|vigneto|uva/], ['pomodoro', /pomodoro/],
];
const CEREALI = ['frumento', 'frumento tenero', 'frumento duro', 'orzo', 'triticale', 'segale', 'avena'];
function families(s) {
  const n = norm(s); const out = new Set();
  FAM.forEach(([k, re]) => { if (re.test(n)) out.add(k); });
  if (/cereali/.test(n)) CEREALI.forEach(k => out.add(k));
  return out;
}
// L'impiego in etichetta copre la coltura del campo?
export function cropMatch(coltura, impiego) {
  const a = norm(coltura), b = norm(impiego); if (!a || !b) return false;
  if (a === b || a.includes(b) || b.includes(a)) return true;
  const fa = families(a), fb = families(b);
  if (/frumento tenero|grano tenero/.test(b) && /frumento duro|grano duro/.test(a)) return false;
  if (/frumento duro|grano duro/.test(b) && /frumento tenero|grano tenero/.test(a)) return false;
  for (const k of fa) if (fb.has(k)) return true;
  return false;
}
export function impiegoPer(p, coltura) { return (p && Array.isArray(p.impieghi) ? p.impieghi : []).find(i => cropMatch(coltura, i.coltura)) || null; }
export const operatoreDi = nome => { const n = norm(nome); return n ? S.operatori.find(o => norm(o.nome) === n) || null : null; };

// v: valori dell'operazione; campi: elenco dei campi coinvolti; opId: id dell'operazione in modifica (da escludere dai conteggi)
export function controlliOp(v, campi, opId = null) {
  const out = []; const add = (lv, t, s = '') => out.push({ lv, t, s });
  if (!campi.length) return out;
  const data = okD(v.data) ? v.data : today();
  const p = get('prodotti', v.prodottoId);
  const fito = isFitoOp(v.tipo) || (p && FITO.includes(p.categoria));
  const totHa = campi.reduce((t, c) => t + campoHa(c), 0);

  if (p) {
    const db = fitoLookup(p.nReg);
    if (fito) {
      if (!p.nReg) add('warn', 'Numero di registrazione mancante', 'Inseriscilo nella scheda di ' + p.nome + ': è obbligatorio nel registro dei trattamenti.');
      else if (db && db.revocato) add('bad', 'Prodotto revocato o non più autorizzato', 'Banca dati del Ministero: ' + (db.stato || 'revocato') + (db.scadenza ? ' (' + fd(db.scadenza) + ')' : ''));
      const scadAut = p.scadenzaAut || (db && db.scadenza);
      if (okD(scadAut) && scadAut < data) add('bad', 'Autorizzazione scaduta', p.nome + ' era autorizzato fino al ' + fd(scadAut) + '.');
    }
    if (okD(p.scadenza) && p.scadenza < data) add('bad', 'Prodotto scaduto', 'Il lotto in magazzino è scaduto il ' + fd(p.scadenza) + '.');
    const g = giac(p) + (opId ? N((S.movimenti.find(m => m.opId === opId) || {}).quantita) : 0);
    if (v.stato !== 'Pianificata' && N(v.quantita) > 0 && N(v.quantita) > g + 1e-9) add('warn', 'Giacenza insufficiente', 'In magazzino ' + nf(g, 2) + ' ' + (p.unita || '') + ', ne servono ' + nf(v.quantita, 2) + '. Registra il carico mancante.');

    if (fito) {
      const hasImp = Array.isArray(p.impieghi) && p.impieghi.length;
      if (!hasImp) add('warn', 'Impieghi in etichetta non inseriti', 'Aggiungi in ' + p.nome + ' le colture autorizzate con dose massima, carenza e numero di interventi: i controlli diventano completi.');
      campi.forEach(c => {
        const col = cropOf(c, yearOf(data));
        const pre = campi.length > 1 ? c.nome + ': ' : '';
        if (!col) { add('warn', pre + 'Coltura non indicata', 'Aggiungi la coltura dell\'annata ' + yearOf(data) + ' al campo per verificare l\'etichetta.'); return; }
        if (!hasImp) return;
        const imp = impiegoPer(p, col);
        if (!imp) { add('bad', pre + 'Non autorizzato su ' + col, 'In etichetta: ' + p.impieghi.map(i => i.coltura).filter(Boolean).join(', ') + '.'); return; }
        if (N(imp.doseMax) > 0 && N(v.dose) > 0 && N(v.dose) > N(imp.doseMax) + 1e-9) add('bad', pre + 'Dose oltre il massimo', nf(v.dose, 3) + ' ' + (p.unita || '') + '/ha contro un massimo di ' + nf(imp.doseMax, 3) + ' su ' + col + '.');
        if (N(imp.doseMin) > 0 && N(v.dose) > 0 && N(v.dose) < N(imp.doseMin) - 1e-9) add('warn', pre + 'Dose sotto il minimo di etichetta', 'Minimo ' + nf(imp.doseMin, 3) + ' ' + (p.unita || '') + '/ha: rischio di efficacia ridotta e resistenze.');
        const prev = S.operazioni.filter(o => o.id !== opId && o.campoId === c.id && o.prodottoId === p.id && o.stato !== 'Pianificata' && okD(o.data) && yearOf(o.data) === yearOf(data)).sort((a, b) => a.data.localeCompare(b.data));
        if (N(imp.maxInterventi) > 0 && prev.length >= N(imp.maxInterventi)) add('bad', pre + 'Numero massimo di interventi raggiunto', prev.length + ' su ' + nf(imp.maxInterventi, 0) + ' consentiti nell\'anno su ' + col + '.');
        const before = prev.filter(o => o.data <= data).pop();
        if (N(imp.intervallo) > 0 && before) { const gg = diff(before.data, data); if (gg < N(imp.intervallo)) add('bad', pre + 'Intervallo troppo breve', 'Ultimo intervento il ' + fd(before.data) + ' (' + gg + ' giorni fa), servono almeno ' + nf(imp.intervallo, 0) + ' giorni.'); }
        const car = N(imp.carenza) || N(p.carenza);
        if (car > 0) {
          const fine = addDays(data, car);
          const rac = S.operazioni.find(o => o.campoId === c.id && /Raccolta|Sfalcio/.test(o.tipo || '') && okD(o.data) && o.data >= data && o.data <= fine);
          if (rac) add('bad', pre + 'Raccolta dentro il tempo di carenza', (rac.stato === 'Pianificata' ? 'Pianificata' : 'Registrata') + ' il ' + fd(rac.data) + ', si può raccogliere dal ' + fd(addDays(fine, 1)) + '.');
        }
      });
    }
  } else if (fito) add('warn', 'Nessun prodotto scelto', 'Per il registro servono prodotto, dose e quantità.');

  if (fito) {
    if (N(v.dose) <= 0 && p) add('warn', 'Dose per ettaro mancante', 'Indica la dose: serve al registro e ai controlli.');
    const op = operatoreDi(v.operatore);
    if (!v.operatore) add('warn', 'Operatore non indicato', 'Chi distribuisce deve avere il patentino (certificato di abilitazione all\'uso).');
    else if (!op) add('warn', 'Patentino di ' + v.operatore + ' non registrato', 'Aggiungi l\'operatore con numero e scadenza del patentino in La mia azienda → Operatori.');
    else if (!op.patentino) add('warn', 'Numero di patentino mancante per ' + op.nome, 'Completalo in La mia azienda → Operatori.');
    else if (okD(op.scadenzaPatentino) && op.scadenzaPatentino < data) add('bad', 'Patentino scaduto', op.nome + ': scaduto il ' + fd(op.scadenzaPatentino) + '.');
    else if (okD(op.scadenzaPatentino) && diff(data, op.scadenzaPatentino) <= 60) add('warn', 'Patentino in scadenza', op.nome + ': scade il ' + fd(op.scadenzaPatentino) + '.');
    const m = get('mezzi', v.mezzoId);
    const irr = m && (m.tipo === 'Irroratrice' || m.controlloFunzionale) ? m : null;
    if (m && irr) {
      if (!okD(irr.controlloFunzionale)) add('warn', 'Controllo funzionale dell\'irroratrice non indicato', 'Inserisci la scadenza del controllo in ' + irr.nome + '.');
      else if (irr.controlloFunzionale < data) add('bad', 'Controllo funzionale scaduto', irr.nome + ': scaduto il ' + fd(irr.controlloFunzionale) + '.');
    } else if (!m || m.tipo !== 'Irroratrice') add('info', 'Irroratrice non indicata', 'Scegli come mezzo l\'irroratrice usata: il registro riporta il controllo funzionale.');
    if (v.vento === 'Forte') add('bad', 'Vento forte', 'Con vento forte la deriva è elevata: rimanda il trattamento.');
    else if (v.vento === 'Moderato') add('warn', 'Vento moderato', 'Usa ugelli antideriva e rispetta le fasce di rispetto.');
    const { data: met } = getMeteo();
    if (met && met.daily) {
      const i = met.daily.time.indexOf(data);
      if (i >= 0) {
        const w = met.daily.wind_speed_10m_max[i], r = met.daily.precipitation_sum[i], pr = met.daily.precipitation_probability_max[i];
        if (w > 15) add('warn', 'Previsto vento a ' + Math.round(w) + ' km/h', 'Sopra i 15 km/h aumenta la deriva: scegli le ore più calme.');
        if (r >= 1 || pr >= 60) add('warn', 'Prevista pioggia', nf(r, 1) + ' mm, probabilità ' + Math.round(pr) + '%: il prodotto può essere dilavato.');
      }
    }
    if (!v.bbch && !v.fase) add('info', 'Fase fenologica non indicata', 'Il registro elettronico chiede lo stadio BBCH della coltura.');
    if (!v.avversita) add('warn', 'Avversità non indicata', 'Scrivi il motivo del trattamento (malattia, insetto, infestanti).');
  }
  if (!out.some(x => x.lv === 'bad' || x.lv === 'warn') && fito) add('ok', 'Tutti i controlli superati', p ? p.nome + ' su ' + nf(totHa, 2) + ' ha' : '');
  return out;
}

// Riquadro dei controlli dentro il modulo; con errori bloccanti chiede conferma esplicita
export function checksHTML(list) {
  if (!list.length) return '';
  const bad = list.filter(x => x.lv === 'bad').length, warn = list.filter(x => x.lv === 'warn').length;
  const icn = { bad: 'octagon-x', warn: 'triangle-alert', info: 'info', ok: 'circle-check' };
  const head = bad ? `${bad} ${bad === 1 ? 'problema bloccante' : 'problemi bloccanti'}` : warn ? `${warn} ${warn === 1 ? 'avviso' : 'avvisi'}` : 'Controlli superati';
  return `<div class="checks ${bad ? 'bad' : warn ? 'warn' : 'ok'}"><div class="ck-h">${ic(bad ? 'shield-alert' : warn ? 'shield-check' : 'badge-check')}<b>Controlli automatici</b><span>${head}</span></div>
  <ul>${list.map(x => `<li class="${x.lv}">${ic(icn[x.lv])}<span><b>${esc(x.t)}</b>${x.s ? `<small>${esc(x.s)}</small>` : ''}</span></li>`).join('')}</ul>
  ${bad ? `<label class="ck-force"><input type="checkbox" id="chkForce"><span>Ho verificato: registro comunque sotto la mia responsabilità</span></label>` : ''}</div>`;
}
export function forceOk(list) {
  if (!list.some(x => x.lv === 'bad')) return null;
  const f = document.getElementById('chkForce');
  return f && f.checked ? null : 'Ci sono controlli non superati: correggi i dati oppure spunta la conferma nel riquadro dei controlli.';
}
