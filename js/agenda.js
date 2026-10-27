// Agenda dei prossimi giorni (campagna e stalla insieme) e controllo del registro dei trattamenti digitale
import { S, get } from './state.js';
import { esc, fd, fdShort, weekday, today, addDays, diff, okD, N, nf, yearOf } from './util.js';
import { ic } from './icons.js';
import { capoI, giac, campoInfo, cropOf } from './domain.js';
import { righeTrattamenti } from './registro.js';
import { isTrattore, compDi, stato } from './trattori.js';

// Ogni voce: { data, area: 'campi'|'stalla'|'mezzi'|'magazzino', icn, t, s, go, late }
export function agenda(giorni = 14, area = 'tutte') {
  const T = today(), fine = addDays(T, giorni); const out = [];
  const dentro = d => okD(d) && d >= T && d <= fine;
  const add = (data, ar, icn, t, s, go, late = false) => out.push({ data, area: ar, icn, t, s, go, late });

  // attività pianificate (anche quelle in ritardo)
  S.operazioni.filter(o => o.stato === 'Pianificata' && okD(o.data) && o.data <= fine).forEach(o => {
    const c = get('campi', o.campoId);
    add(o.data < T ? T : o.data, 'campi', 'notebook-pen', (o.tipo || 'Attività') + (c ? ' · ' + c.nome : ''), o.data < T ? 'In ritardo: era per il ' + fd(o.data) : (c ? cropOf(c, yearOf(o.data)) || 'da fare' : 'da fare'), { edit: 'operazioni', id: o.id }, o.data < T);
  });
  // fine della carenza: da quando si può raccogliere
  S.campi.forEach(c => { const i = campoInfo(c, yearOf(T)); if (i.carenza && dentro(addDays(i.carenza.fine, 1))) add(addDays(i.carenza.fine, 1), 'campi', 'sprout', 'Raccolta consentita · ' + c.nome, 'Finita la carenza di ' + i.carenza.prodotto, { type: 'campo', id: c.id }); });

  // stalla: parti, asciutte, fine delle sospensioni
  S.capi.forEach(c => {
    const i = capoI(c); if (!i || i.stato === 'Uscita') return;
    const nome = c.nome || c.matricola || 'Capo';
    if (i.gravida && okD(i.prevParto)) {
      if (dentro(i.prevParto)) add(i.prevParto, 'stalla', 'baby', 'Parto previsto · ' + nome, (c.razza || '') + (i.nLatt ? ' · ' + (i.nLatt + 1) + 'ª lattazione' : ' · primo parto'), { type: 'capo', id: c.id });
      const asc = addDays(i.prevParto, -60);
      if (i.stato === 'In lattazione' && asc <= fine) add(asc < T ? T : asc, 'stalla', 'cow', 'Messa in asciutta · ' + nome, asc < T ? 'Da fare: parto il ' + fd(i.prevParto) : '60 giorni prima del parto (' + fd(i.prevParto) + ')', { type: 'capo', id: c.id }, asc < T);
    }
    const op = c.aia && c.aia.prossima;
    if (op && okD(op.data) && (op.op === 'F' || op.op === 'D') && op.data <= fine && (!i.fec || op.op === 'D')) add(op.data < T ? T : op.data, 'stalla', op.op === 'F' ? 'heart-pulse' : 'scan-search', (op.op === 'F' ? 'Da fecondare · ' : 'Diagnosi di gravidanza · ') + nome, op.data < T ? 'Indicata dall\'AIA per il ' + fd(op.data) : 'Indicata dal controllo funzionale AIA', { type: 'capo', id: c.id }, op.data < T);
    if (i.inSospLatte && okD(i.sospLatte) && dentro(addDays(i.sospLatte, 1))) add(addDays(i.sospLatte, 1), 'stalla', 'milk', 'Latte di nuovo conferibile · ' + nome, 'Finisce la sospensione del farmaco', { type: 'capo', id: c.id });
  });

  // scadenze di mezzi, patentini, prodotti
  S.mezzi.forEach(m => [['scadenzaRevisione', 'Revisione'], ['scadenzaAssicurazione', 'Assicurazione'], ['controlloFunzionale', 'Controllo funzionale']].forEach(([k, l]) => { if (dentro(m[k])) add(m[k], 'mezzi', 'tractor', l + ' · ' + m.nome, 'Scadenza', { type: 'mezzo', id: m.id }); }));
  // libretto dei trattori: altre scadenze del mezzo e pezzi che scadono a data (quelli a ore stanno negli avvisi)
  S.mezzi.forEach(m => (m.scadenze || []).forEach(x => { if (dentro(x.data)) add(x.data, 'mezzi', 'tractor', x.titolo + ' · ' + m.nome, 'Scadenza', { type: 'mezzo', id: m.id }); }));
  S.mezzi.filter(isTrattore).forEach(m => compDi(m).forEach(c => { const st = stato(m, c.id); if (st.prossData && st.prossData <= fine && (st.restOre === null || st.restOre > 0)) add(st.prossData < T ? T : st.prossData, 'mezzi', 'wrench', c.nome + ' · ' + m.nome, st.prossData < T ? 'Scaduto il ' + fd(st.prossData) : 'Manutenzione a calendario', { type: 'mezzo', id: m.id }, st.prossData < T); }));
  S.operatori.forEach(o => { if (dentro(o.scadenzaPatentino)) add(o.scadenzaPatentino, 'campi', 'id-card', 'Patentino · ' + o.nome, 'Scadenza del patentino fitosanitario', { edit: 'operatori', id: o.id }); });
  S.prodotti.forEach(p => { if (dentro(p.scadenza) && giac(p) > 0) add(p.scadenza, 'magazzino', 'package', 'Scade · ' + p.nome, nf(giac(p), 1) + ' ' + (p.unita || '') + ' in magazzino', { type: 'prodotto', id: p.id }); });

  const STALLA = ['stalla'];
  const f = area === 'stalla' ? x => STALLA.includes(x.area) || x.area === 'magazzino' : area === 'campagna' ? x => !STALLA.includes(x.area) : () => true;
  return out.filter(f).sort((a, b) => a.data.localeCompare(b.data) || (b.late - a.late));
}

const giornoLabel = d => { const T = today(); const n = diff(T, d); if (n === 0) return 'Oggi'; if (n === 1) return 'Domani'; const w = weekday(d); return w[0].toUpperCase() + w.slice(1) + ' ' + fdShort(d); };
const COL = { campi: 'ok', stalla: 'info', mezzi: 'hay', magazzino: 'warn' };

export function agendaCard(area, giorni = 14) {
  const items = agenda(giorni, area);
  const byDay = new Map(); items.forEach(x => { if (!byDay.has(x.data)) byDay.set(x.data, []); byDay.get(x.data).push(x); });
  const days = [...byDay.entries()].slice(0, 7);
  const tot = items.length;
  return `<section class="card agenda-card"><div class="card-h"><h2>${ic('calendar-range')}Prossimi ${giorni} giorni</h2><span class="count">${tot}</span></div>
  ${tot ? `<div class="agenda">${days.map(([d, xs]) => `<div class="ag-day${d === today() ? ' today' : ''}"><div class="ag-date"><b>${esc(giornoLabel(d))}</b>${d !== today() && diff(today(), d) > 1 ? `<span>tra ${diff(today(), d)} giorni</span>` : ''}</div><div class="ag-items">${xs.slice(0, 6).map(x => `<button class="ag-i ${COL[x.area] || ''}${x.late ? ' late' : ''}" data-act="go" data-go='${esc(JSON.stringify(x.go))}'><span class="ag-ic">${ic(x.icn)}</span><span class="ag-tx"><b>${esc(x.t)}</b><small>${esc(x.s)}</small></span></button>`).join('')}${xs.length > 6 ? `<span class="ag-more">e altri ${xs.length - 6}</span>` : ''}</div></div>`).join('')}${byDay.size > 7 ? `<p class="more">e altri ${byDay.size - 7} giorni con impegni</p>` : ''}</div>`
    : `<div class="allgood">${ic('calendar', 'big')}<b>Niente in programma</b><span>Pianifica un'attività o registra fecondazioni e scadenze: compariranno qui.</span></div>`}</section>`;
}

/* ---------- registro dei trattamenti: dati obbligatori ---------- */
// Campi richiesti per ogni trattamento nel registro elettronico (Reg. UE 2023/564)
const RICHIESTI = [
  ['prodotto', 'prodotto', r => !!r.p.nome],
  ['nreg', 'n. registrazione', r => !!r.p.nReg],
  ['dose', 'dose', r => N(r.o.dose) > 0 || N(r.o.quantita) > 0],
  ['coltura', 'coltura', r => !!r.coltura],
  ['superficie', 'superficie', r => r.ha > 0],
  ['fase', 'fase (BBCH)', r => !!(r.o.bbch || r.o.fase)],
  ['avversita', 'avversità', r => !!r.o.avversita],
  ['operatore', 'operatore', r => !!r.o.operatore],
];
export function statoRegistro(y) {
  const righe = righeTrattamenti(y);
  const rows = righe.map(r => ({ r, manca: RICHIESTI.filter(([, , ok]) => !ok(r)).map(([, l]) => l) }));
  const inc = rows.filter(x => x.manca.length);
  return { tot: rows.length, ok: rows.length - inc.length, inc };
}

export function registroCard(y) {
  const st = statoRegistro(y); if (!st.tot) return '';
  const pct = Math.round(st.ok / st.tot * 100);
  return `<section class="card reg-card"><div class="card-h"><h2>${ic('shield-check')}Registro trattamenti ${y}</h2><button class="btn sm ghost" data-act="exportSheet">Esporta</button></div>
  <div class="reg-sum"><div class="reg-pct ${pct === 100 ? 'ok' : pct >= 70 ? 'warn' : 'bad'}"><b>${pct}%</b><span>completo</span></div><div><p><b>${st.ok} su ${st.tot}</b> trattamenti hanno tutti i dati richiesti dal registro digitale.</p><span class="reg-bar"><i style="width:${pct}%"></i></span><p class="muted small">${pct === 100 ? 'Pronto per il registro digitale, obbligatorio dal 1° gennaio 2027.' : 'Il registro dei trattamenti diventa interamente digitale dal 1° gennaio 2027: completa ora i dati mancanti.'}</p></div></div>
  ${st.inc.length ? `<div class="list">${st.inc.slice(0, 5).map(({ r, manca }) => `<button class="row" data-act="edit" data-form="operazioni" data-id="${r.o.id}"><span class="r-icon">${ic('syringe')}</span><span class="r-main"><b>${esc(r.c.nome || 'Campo')} · ${fd(r.o.data)}</b><span>${esc(r.p.nome || r.o.tipo || '')}</span><span class="reg-miss">${manca.map(m => `<i>${esc(m)}</i>`).join('')}</span></span>${ic('chevron-right', 'chev')}</button>`).join('')}${st.inc.length > 5 ? `<p class="more">e altri ${st.inc.length - 5} da completare</p>` : ''}</div>` : ''}</section>`;
}
