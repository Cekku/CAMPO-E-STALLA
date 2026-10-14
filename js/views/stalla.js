// Stalla: mandria, riproduzione, latte, razioni, sanitario, scheda del capo
import { S, D, UI, get } from '../state.js';
import { esc, nf, eur, fd, fdShort, sum, byDate, byName, yearOf, N, diff, today, eta, okD, plural, addDays } from '../util.js';
import { ic } from '../icons.js';
import { GEST, capoI, razioneInfo, giac } from '../domain.js';
import { tabs, empty, newBtn, fact, chip, exChip } from '../ui.js';
import { latteChart, spark } from './charts.js';

const STATO = { 'In lattazione': 'ok', 'Asciutta': 'hay', 'Manza': 'info', 'Vitella': 'info', 'Vitello': 'info', 'Maschio': '', 'Uscita': 'ghost' };
const statoChip = s => chip(s, STATO[s] || '');
function gravChip(i) { if (i.gravida === true) return chip('Gravida', 'ok'); if (i.gravida === false) return chip('Vuota', 'warn'); if (i.fec) return chip('Fecondata', ''); return ''; }

export function render() {
  if (UI.detail && UI.detail.type === 'capo') { const c = get('capi', UI.detail.id); if (c) return detail(c); UI.detail = null; }
  const sub = UI.sub.stalla;
  const sosp = S.capi.filter(c => capoI(c).inSospLatte).length;
  const repro = S.capi.filter(c => capoI(c).alerts.some(a => ['fec', 'diag', 'asc', 'parto'].includes(a.k))).length;
  const t = tabs('stalla', [['mandria', 'Mandria'], ['riproduzione', 'Riproduzione', repro || undefined], ['latte', 'Latte'], ['razioni', 'Razioni'], ['sanitario', 'Sanitario', sosp || undefined]], sub);
  const body = { mandria, riproduzione, latte, razioni, sanitario }[sub] || mandria;
  return { title: 'Stalla', html: `<header class="pagehead"><h1>Stalla</h1><div class="btns">${newBtn('eventi', 'Evento')}</div></header>` + t + body() };
}

function sorted() { return [...S.capi].sort((a, b) => (a.matricola || '').localeCompare(b.matricola || '')); }

function mandria() {
  const capi = sorted();
  if (!capi.length) return `<section class="card">${empty('cow', 'La stalla è vuota', 'Inserisci i capi con matricola, razza e data di nascita. Stato riproduttivo, lattazione e sospensioni si aggiornano dagli eventi.', newBtn('capi', 'Aggiungi il primo capo'))}</section>`;
  const st = UI.f.stato || 'attivi', q = (UI.f.q || '').toLowerCase().trim();
  const cnt = {}; capi.forEach(c => { const s = capoI(c).stato; cnt[s] = (cnt[s] || 0) + 1; });
  const att = capi.length - (cnt['Uscita'] || 0);
  const chips = [['attivi', 'Tutti', att], ['In lattazione', 'In lattazione'], ['Asciutta', 'Asciutte'], ['Manza', 'Manze'], ['Vitella', 'Vitelle'], ['Uscita', 'Usciti']].filter(([k, , n]) => n !== undefined || cnt[k]);
  const list = capi.filter(c => { const s = capoI(c).stato; if (st === 'attivi' ? s === 'Uscita' : s !== st) return false; return !q || ((c.matricola || '') + ' ' + (c.nome || '')).toLowerCase().includes(q); });
  return `<div class="toolbar"><div class="search">${ic('search')}<input class="inp" id="capoq" data-filter="q" placeholder="Cerca matricola o nome" value="${esc(UI.f.q || '')}" autocomplete="off"></div><span class="sp"></span>${newBtn('capi', 'Capo', '', '')}</div>
  <div class="chipbar">${chips.map(([k, l, n]) => `<button data-act="chip" data-f="stato" data-v="${k}" aria-pressed="${st === k}">${l}<span class="n">${n !== undefined ? n : cnt[k] || 0}</span></button>`).join('')}</div>
  <section class="card"><div class="list">${list.length ? list.map(capoRow).join('') : empty('search', 'Nessun capo', 'Nessun capo corrisponde al filtro.')}</div></section>`;
}
export function capoRow(c) {
  const i = capoI(c);
  const bits = [esc(c.razza || ''), i.nLatt ? i.nLatt + 'ª lattazione' : '', i.dim !== null ? i.dim + ' gg in latte' : '', i.gravida && i.prevParto ? 'parto ' + fd(i.prevParto) : '', c.sesso !== 'M' && !i.pData && okD(c.nascita) ? eta(c.nascita) : ''].filter(Boolean);
  return `<button class="row" data-act="open" data-type="capo" data-id="${c.id}"><span class="avatar ${i.inSospLatte ? 'bad' : STATO[i.stato] || ''}">${esc((c.nome || c.matricola || '?').slice(0, 1).toUpperCase())}</span><span class="r-main"><b>${esc(c.nome || 'Senza nome')} <span class="mono muted">${esc((c.matricola || '').slice(-6))}</span>${exChip(c)}</b><span>${bits.join(' · ')}</span></span><span class="r-side chips">${statoChip(i.stato)}${gravChip(i)}${i.inSospLatte ? chip('Sospensione', 'bad') : ''}</span></button>`;
}

function riproduzione() {
  const capi = sorted();
  const grp = k => capi.filter(c => capoI(c).alerts.some(a => a.k === k));
  const parti = capi.filter(c => { const i = capoI(c); return i.gravida && i.prevParto && !i.uscita && diff(today(), i.prevParto) <= 120; }).sort((a, b) => capoI(a).prevParto.localeCompare(capoI(b).prevParto));
  const block = (icon, t, arr, s) => `<section class="card"><div class="card-h"><h2>${ic(icon)}${t}</h2><span class="count">${arr.length}</span></div><p class="muted small pad-x">${s}</p><div class="list">${arr.length ? arr.map(capoRow).join('') : '<div class="empty slim">Nessun capo.</div>'}</div></section>`;
  // calendario dei parti: 4 mesi
  const T = today(); const months = []; for (let m = 0; m < 4; m++) { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + m); months.push({ y: d.getFullYear(), m: d.getMonth() }); }
  const ML = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];
  const cal = `<div class="calv">${months.map(({ y, m }) => { const items = parti.filter(c => { const p = capoI(c).prevParto; return +p.slice(0, 4) === y && +p.slice(5, 7) === m + 1; }); return `<div class="cm"><span class="cm-h">${ML[m]} ${y}</span>${items.length ? items.map(c => `<button class="cm-i" data-act="open" data-type="capo" data-id="${c.id}"><b>${+capoI(c).prevParto.slice(8)}</b>${esc(c.nome || c.matricola)}</button>`).join('') : '<span class="cm-0">—</span>'}</div>`; }).join('')}</div>`;
  return `<section class="card"><div class="card-h"><h2>${ic('calendar')}Parti previsti</h2><span class="count">${parti.length}</span></div>${cal}</section>
  <div class="grid-2"><div class="col">${block('heart-pulse', 'Da fecondare', grp('fec'), 'Vacche oltre 50 giorni dal parto e manze da 14-15 mesi senza fecondazione.')}${block('scan-search', 'Diagnosi da fare', grp('diag'), 'Fecondate da almeno 28 giorni senza diagnosi di gravidanza.')}</div>
  <div class="col">${block('history', 'Da mettere in asciutta', grp('asc'), 'Gravide a meno di 67 giorni dal parto ancora in lattazione.')}${block('baby', 'Parto entro 3 settimane', grp('parto'), 'Spostale in preparto e prepara il box parto.')}</div></div>
  <p class="muted small">Gestazione calcolata a ${GEST} giorni dalla fecondazione.</p>`;
}

function latte() {
  const L = D.latte; const T = today(); const ul = L[L.length - 1];
  const last7 = L.filter(l => diff(l.data, T) < 7 && diff(l.data, T) >= 0);
  const prev7 = L.filter(l => diff(l.data, T) >= 7 && diff(l.data, T) < 14);
  const lat = S.capi.filter(c => capoI(c).stato === 'In lattazione').length;
  const m7 = last7.length ? sum(last7, l => l.litri) / last7.length : 0; const p7 = prev7.length ? sum(prev7, l => l.litri) / prev7.length : 0;
  const vacche = ul && N(ul.vacche) ? N(ul.vacche) : lat;
  const anno = L.filter(l => yearOf(l.data) === UI.anno);
  const conf = l => N(l.conferiti !== null && l.conferiti !== undefined && l.conferiti !== '' ? l.conferiti : l.litri);
  const ch = latteChart(30);
  const q = [...L].reverse().find(l => N(l.cellule) || N(l.grasso));
  return `<div class="kpis">
    <div class="kpi static"><span class="k-l">Ultima mungitura</span><span class="k-v">${ul ? nf(ul.litri, 0) : '—'}<small>l</small></span><span class="k-s">${ul ? fdShort(ul.data) + (vacche ? ' · ' + nf(N(ul.litri) / vacche, 1) + ' l/capo' : '') : 'nessun dato'}</span></div>
    <div class="kpi static"><span class="k-l">Media 7 giorni</span><span class="k-v">${nf(m7, 0)}<small>l/g</small></span><span class="k-s">${p7 ? (m7 >= p7 ? '+' : '') + nf((m7 - p7) / p7 * 100, 1) + '% sulla settimana prima' : '—'}</span></div>
    <div class="kpi static"><span class="k-l">Qualità</span><span class="k-v">${q && N(q.cellule) ? nf(q.cellule, 0) : '—'}<small>mila cell.</small></span><span class="k-s">${q ? (N(q.grasso) ? 'G ' + nf(q.grasso, 2) + '% ' : '') + (N(q.proteine) ? 'P ' + nf(q.proteine, 2) + '%' : '') : 'nessuna analisi'}</span></div>
    <div class="kpi static"><span class="k-l">Conferito ${UI.anno}</span><span class="k-v">${nf(sum(anno, conf) / 1000, 1)}<small>mila l</small></span><span class="k-s">${eur(sum(anno, l => conf(l) * N(l.prezzo)))}</span></div></div>
  <section class="card"><div class="card-h"><h2>Andamento</h2><div class="btns"><button class="btn sm ghost" data-act="export" data-what="latte">${ic('download')}CSV</button>${newBtn('latte', 'Registra')}</div></div>${ch ? `<div class="chartbox">${ch.svg}</div><div class="legend"><span><i class="sw conf"></i>conferiti</span><span><i class="sw prod"></i>non conferiti</span></div>` : empty('milk', 'Nessuna registrazione', 'Ogni giorno: litri prodotti, conferiti e scartati, più le analisi.', newBtn('latte', 'Registra il latte di oggi'))}</section>
  ${L.length ? `<section class="card"><div class="card-h"><h2>Registro giornaliero</h2></div><div class="list">${[...L].reverse().slice(0, 60).map(l => `<button class="row" data-act="edit" data-form="latte" data-id="${l.id}"><span class="datebox"><b>${+l.data.slice(8)}</b>${['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'][+l.data.slice(5, 7) - 1]}</span><span class="r-main"><b class="num">${nf(l.litri, 0)} l${exChip(l)}</b><span>${[N(l.vacche) ? l.vacche + ' vacche' : '', N(l.grasso) ? 'G ' + nf(l.grasso, 2) + '%' : '', N(l.proteine) ? 'P ' + nf(l.proteine, 2) + '%' : '', N(l.cellule) ? 'SCC ' + nf(l.cellule, 0) : '', N(l.cbt) ? 'CBT ' + nf(l.cbt, 0) : '', l.note ? esc(l.note) : ''].filter(Boolean).join(' · ')}</span></span><span class="r-side"><span class="num">${eur(conf(l) * N(l.prezzo))}</span>${N(l.scartati) ? chip(nf(l.scartati, 0) + ' l scartati', 'warn') : ''}</span></button>`).join('')}</div></section>` : ''}`;
}

function razioni() {
  if (!S.razioni.length) return `<section class="card">${empty('wheat', 'Nessuna razione', 'Componi la razione di ogni gruppo con mangimi e foraggi del magazzino: costo per capo, fabbisogno giornaliero e giorni di autonomia delle scorte.', newBtn('razioni', 'Nuova razione'))}</section>`;
  return `<div class="toolbar"><p class="muted small">Prezzi dal magazzino. Lo scarico giornaliero toglie i kg dalle giacenze.</p><span class="sp"></span>${newBtn('razioni', 'Razione')}</div>` + [...S.razioni].sort(byName).map(r => {
    const i = razioneInfo(r); const fatto = S.movimenti.some(m => m.razioneId === r.id && m.data === today());
    const maxKg = Math.max(1, ...i.ing.map(x => x.kg));
    return `<section class="card ration"><div class="card-h"><div><span class="eyebrow">${esc(r.gruppo || 'Gruppo non indicato')} · ${plural(i.capi, 'capo', 'capi')}</span><h2>${esc(r.nome)}${exChip(r)}</h2></div><div class="btns"><button class="btn sm ${fatto ? '' : 'primary'}" data-act="razScarico" data-id="${r.id}"${fatto || !i.capi ? ' disabled' : ''}>${fatto ? ic('check') + 'Scaricata oggi' : ic('upload') + 'Scarica oggi'}</button><button class="btn sm ghost" data-act="edit" data-form="razioni" data-id="${r.id}">${ic('pencil')}</button></div></div>
    <div class="ration-stats"><div><dt>Per capo</dt><dd>${eur(i.costoCapo, 2)}<small>/giorno</small></dd></div><div><dt>Gruppo</dt><dd>${eur(i.costoGiorno, 0)}<small>/giorno</small></dd></div><div><dt>Tal quale</dt><dd>${nf(i.kgCapo, 1)}<small> kg/capo</small></dd></div><div><dt>Autonomia</dt><dd class="${i.autonomia !== null && i.autonomia < 7 ? 't-bad' : i.autonomia !== null && i.autonomia < 20 ? 't-warn' : ''}">${i.autonomia === null ? '—' : nf(i.autonomia, 0)}<small> giorni</small></dd></div></div>
    <div class="ingr">${i.ing.map(x => `<div class="ig"><span class="ig-n">${esc(x.p ? x.p.nome : 'prodotto eliminato')}</span><span class="ig-bar"><i style="width:${x.kg / maxKg * 100}%"></i></span><span class="ig-v num">${nf(x.kg, 1)} kg</span><span class="ig-a num ${x.autonomia !== null && x.autonomia < 7 ? 't-bad' : ''}">${x.autonomia === null ? '—' : nf(x.autonomia, 0) + ' gg'}</span></div>`).join('')}</div></section>`;
  }).join('');
}

function sanitario() {
  const capi = sorted();
  const tr = S.eventi.filter(e => (e.tipo === 'Trattamento sanitario' || e.tipo === 'Vaccinazione') && yearOf(e.data) === UI.anno).sort(byDate).reverse();
  const sosp = capi.filter(c => { const i = capoI(c); return i.inSospLatte || i.inSospCarne; });
  return `<section class="card ${sosp.length ? 'alarm' : ''}"><div class="card-h"><h2>${ic('triangle-alert')}Sospensioni in corso</h2><span class="count">${sosp.length}</span></div><div class="list">${sosp.length ? sosp.map(c => { const i = capoI(c); return `<button class="row" data-act="open" data-type="capo" data-id="${c.id}"><span class="avatar bad">${esc((c.nome || c.matricola || '?')[0])}</span><span class="r-main"><b>${esc(c.nome || '')} <span class="mono muted">${esc(c.matricola)}</span></b><span>${i.inSospLatte ? 'Latte da scartare fino al ' + fd(i.sospLatte) + ' compreso' : ''}${i.inSospLatte && i.inSospCarne ? ' · ' : ''}${i.inSospCarne ? 'Carne fino al ' + fd(i.sospCarne) : ''}</span></span><span class="r-side chips">${i.inSospLatte ? chip('Latte', 'bad') : ''}${i.inSospCarne ? chip('Carne', 'warn') : ''}</span></button>`; }).join('') : '<div class="empty slim">Nessun capo in sospensione.</div>'}</div></section>
  <section class="card"><div class="card-h"><h2>Registro trattamenti ${UI.anno}</h2><div class="btns"><button class="btn sm ghost" data-act="export" data-what="trattamenti">${ic('download')}CSV</button>${newBtn('eventi', 'Trattamento', 'data-tipo="Trattamento sanitario"')}</div></div>
  <div class="timeline">${tr.length ? tr.map(e => evRow(e, true)).join('') : empty('syringe', 'Nessun trattamento', 'Farmaco, ricetta elettronica e tempi di sospensione per capo.')}</div></section>`;
}

const EVI = { 'Parto': 'baby', 'Calore': 'heart-pulse', 'Fecondazione': 'heart-pulse', 'Diagnosi gravidanza': 'scan-search', 'Messa in asciutta': 'history', 'Trattamento sanitario': 'syringe', 'Vaccinazione': 'syringe', 'Controllo funzionale': 'milk', 'Uscita': 'log-out', 'Nota': 'pencil' };
function evDesc(e) {
  const p = get('prodotti', e.prodottoId);
  switch (e.tipo) {
    case 'Parto': return [e.facilita, e.vitelloSesso ? 'vitello ' + e.vitelloSesso : '', e.vitelloMatricola].filter(Boolean).join(' · ');
    case 'Fecondazione': return [e.metodoFec, e.toro ? 'toro ' + e.toro : '', e.operatore].filter(Boolean).join(' · ');
    case 'Diagnosi gravidanza': return [e.esito, e.metodoDiag].filter(Boolean).join(' · ');
    case 'Trattamento sanitario': case 'Vaccinazione': return [p ? p.nome : e.farmaco, e.motivo, N(e.sospLatte) ? 'latte ' + e.sospLatte + ' gg' : '', N(e.sospCarne) ? 'carne ' + e.sospCarne + ' gg' : '', e.ricetta ? 'REV ' + e.ricetta : ''].filter(Boolean).join(' · ');
    case 'Controllo funzionale': return [N(e.kg) ? nf(e.kg, 1) + ' kg' : '', N(e.grasso) ? 'G ' + nf(e.grasso, 2) + '%' : '', N(e.proteine) ? 'P ' + nf(e.proteine, 2) + '%' : '', N(e.cellule) ? 'SCC ' + nf(e.cellule, 0) : ''].filter(Boolean).join(' · ');
    case 'Uscita': return [e.motivoUscita, e.destinatario].filter(Boolean).join(' · ');
    default: return '';
  }
}
function evRow(e, withCapo) {
  const c = get('capi', e.capoId); const d = evDesc(e);
  return `<button class="tl" data-act="edit" data-form="eventi" data-id="${e.id}"><span class="tl-ic t-${(EVI[e.tipo] || 'pencil')}">${ic(EVI[e.tipo] || 'pencil')}</span><span class="r-main"><b>${esc(e.tipo)}${withCapo && c ? ` · ${esc(c.nome || c.matricola)}` : ''}${exChip(e)}</b><span>${esc(d)}${e.note ? (d ? ' · ' : '') + esc(e.note) : ''}</span></span><span class="tl-d">${fd(e.data)}</span></button>`;
}

function detail(c) {
  const i = capoI(c); const figli = S.capi.filter(x => x.madre && x.madre === c.matricola);
  const ctrls = i.ev.filter(e => e.tipo === 'Controllo funzionale').slice(-10);
  const quick = [['Fecondazione', 'Fecondazione', 'heart-pulse'], ['Diagnosi gravidanza', 'Diagnosi', 'scan-search'], ['Parto', 'Parto', 'baby'], ['Messa in asciutta', 'Asciutta', 'history'], ['Trattamento sanitario', 'Trattamento', 'syringe'], ['Controllo funzionale', 'Controllo', 'milk']];
  // barra del ciclo: dal parto al parto successivo previsto
  let cycle = '';
  if (i.pData && !i.uscita) {
    const end = i.prevParto || addDays(i.pData, 400); const tot = Math.max(1, diff(i.pData, end)); const pos = Math.min(100, Math.max(0, diff(i.pData, today()) / tot * 100));
    const mk = (d, l) => { if (!d) return ''; const p = Math.min(100, Math.max(0, diff(i.pData, d) / tot * 100)); return `<span class="cy-mk" style="left:${p}%"><i></i><em style="transform:translateX(${p < 8 ? '35%' : p > 92 ? '-35%' : '0'})">${l}</em></span>`; };
    cycle = `<section class="card"><div class="card-h"><h2>Ciclo produttivo</h2><span class="muted small">${i.dim !== null ? i.dim + ' giorni in latte' : esc(i.stato)}</span></div><div class="cycle"><div class="cy-track"><span class="cy-fill" style="width:${pos}%"></span>${mk(i.pData, 'Parto')}${i.fec ? mk(i.fec.data, 'Fec.') : ''}${i.prevParto && i.gravida ? mk(addDays(i.prevParto, -60), 'Asciutta') : ''}${i.prevParto ? mk(i.prevParto, 'Parto prev.') : ''}<span class="cy-now" style="left:${pos}%"></span></div></div></section>`;
  }
  return { title: c.nome || c.matricola, html: `<section class="card detail-hero capo"><div class="big-avatar ${STATO[i.stato] || ''}">${esc((c.nome || c.matricola || '?').slice(0, 1).toUpperCase())}</div><div class="dh-body"><span class="eyebrow">${esc(c.razza || 'Bovino')} · ${c.sesso === 'M' ? 'maschio' : 'femmina'} · ${esc(c.gruppo || 'nessun gruppo')}</span><h1>${esc(c.nome || 'Senza nome')}${exChip(c)}</h1><span class="mono">${esc(c.matricola || '')}</span><div class="chips">${statoChip(i.stato)}${gravChip(i)}${i.inSospLatte ? chip('Latte in sospensione', 'bad') : ''}${i.alerts.filter(a => a.k !== 'sosp').map(a => chip(a.t, a.lv)).join('')}</div></div><button class="btn sm ghost" data-act="edit" data-form="capi" data-id="${c.id}">${ic('pencil')}Scheda</button></section>
  <div class="quick-ev">${quick.map(([t, l, icn]) => `<button data-act="new" data-form="eventi" data-capo="${c.id}" data-tipo="${t}">${ic(icn)}<span>${l}</span></button>`).join('')}</div>
  ${cycle}
  <dl class="facts">${fact('Nascita', okD(c.nascita) ? fd(c.nascita) + ' <small>' + eta(c.nascita) + '</small>' : '—')}${fact('Lattazioni', String(i.nLatt || 0))}${fact('Ultimo parto', i.pData ? fd(i.pData) : '—')}${fact('Ultima fecondazione', i.fec ? fd(i.fec.data) + (i.nFec > 1 ? ' <small>' + i.nFec + 'ª</small>' : '') : '—')}${fact('Parto previsto', i.prevParto ? fd(i.prevParto) + (i.gravida ? '' : ' <small>presunto</small>') : '—')}${fact('Sospensione latte', i.inSospLatte ? chip('fino al ' + fd(i.sospLatte), 'bad') : 'Nessuna')}${fact('Ultimo controllo', i.ctrl ? `<span class="num">${nf(i.ctrl.kg, 1)} kg</span> <small>${fd(i.ctrl.data)}</small>` : '—')}${fact('Madre · padre', esc([c.madre, c.padre].filter(Boolean).join(' · ') || '—'))}</dl>
  ${ctrls.length >= 2 ? `<section class="card"><div class="card-h"><h2>Controlli funzionali</h2></div><div class="ctrl-spark">${spark(ctrls.map(e => N(e.kg)), 300, 56)}<span class="muted small">${nf(ctrls[0].kg, 1)} → <b>${nf(ctrls[ctrls.length - 1].kg, 1)} kg/giorno</b></span></div></section>` : ''}
  ${c.note ? `<section class="card note">${esc(c.note)}</section>` : ''}
  <section class="card"><div class="card-h"><h2>Storia</h2><span class="count">${i.ev.length}</span></div><div class="timeline">${i.ev.length ? [...i.ev].reverse().map(e => evRow(e, false)).join('') : '<div class="empty slim">Nessun evento registrato.</div>'}</div></section>
  ${figli.length ? `<section class="card"><div class="card-h"><h2>Figli in azienda</h2></div><div class="list">${figli.map(capoRow).join('')}</div></section>` : ''}` };
}
