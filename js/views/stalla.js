// Stalla: mandria, riproduzione, latte, razioni, sanitario, scheda del capo
import { S, D, UI, get } from '../state.js';
import { esc, nf, eur, fd, fdShort, sum, byDate, byName, yearOf, N, diff, today, eta, okD, plural, addDays } from '../util.js';
import { ic } from '../icons.js';
import { GEST, capoI, razioneInfo, giac, numCapo, nomeCapo, nomeCapoLungo } from '../domain.js';
import { tabs, empty, newBtn, fact, chip, exChip } from '../ui.js';
import { latteChart, spark } from './charts.js';
import { stalle, strutturaDetail, indiciView, capoMisure } from './stalle.js';
import { capoAia } from './aia-view.js';
import { boxOf, benessere } from '../herd.js';
import { tabella, bottoniExport } from '../conti/tabelle.js';

const numInt = c => { const n = parseInt(numCapo(c), 10); return isNaN(n) ? null : n; };
const byNum = (a, b) => { const x = numInt(a), y = numInt(b); if (x !== null && y !== null && x !== y) return x - y; if ((x === null) !== (y === null)) return x === null ? 1 : -1; return (a.matricola || '').localeCompare(b.matricola || ''); };
const avatarTxt = c => numCapo(c) || (c.nome || c.matricola || (c.sesso === 'M' ? 'M' : 'F')).slice(0, 1).toUpperCase();
const ESITO = { inviato: 'ok', "gia' presente": 'info', 'in attesa': '', errore: 'bad', 'non gestito': 'warn' };
const DEST = { moomonitor: 'MooMonitor', sialleva: 'Si@lleva' };

const STATO = { 'In lattazione': 'ok', 'Asciutta': 'hay', 'Manza': 'info', 'Vitella': 'info', 'Vitello': 'info', 'Maschio': '', 'Uscita': 'ghost' };
const statoChip = s => chip(s, STATO[s] || '');
function gravChip(i) { if (i.gravida === true) return chip('Gravida', 'ok'); if (i.gravida === false) return chip('Vuota', 'warn'); if (i.fec) return chip('Fecondata', ''); return ''; }

export function render() {
  if (UI.detail && UI.detail.type === 'capo') { const c = get('capi', UI.detail.id); if (c) return detail(c); UI.detail = null; }
  if (UI.detail && UI.detail.type === 'struttura') { const s = get('strutture', UI.detail.id); if (s) return strutturaDetail(s); UI.detail = null; }
  const sub = UI.sub.stalla;
  const sosp = S.capi.filter(c => capoI(c).inSospLatte).length;
  const coda = S.invii.filter(x => x.stato === 'in attesa' || x.stato === 'errore').length;
  const repro = S.capi.filter(c => capoI(c).alerts.some(a => ['fec', 'diag', 'asc', 'parto'].includes(a.k))).length;
  const ben = S.capi.filter(c => benessere(c).some(a => a.lv !== 'info')).length;
  const t = tabs('stalla', [['mandria', 'Mandria'], ['stalle', 'Stalle e silos'], ['indici', 'Indici e benessere', ben || undefined], ['riproduzione', 'Riproduzione', repro || undefined], ['latte', 'Latte'], ['razioni', 'Razioni'], ['sanitario', 'Sanitario', sosp || undefined], ...(S.invii.length ? [['invii', 'Invii', coda || undefined]] : [])], sub);
  const body = { mandria, riproduzione, latte, razioni, sanitario, stalle, indici: indiciView, invii: inviiView }[sub] || mandria;
  return { title: 'Stalla', html: `<header class="pagehead"><h1>Stalla</h1><div class="btns">${newBtn('eventi', 'Evento')}</div></header>` + t + body() };
}

function sorted() { return [...S.capi].sort(byNum); }

function mandria() {
  const capi = sorted();
  if (!capi.length) return `<section class="card">${empty('cow', 'La stalla è vuota', 'Inserisci i capi con matricola, razza e data di nascita. Stato riproduttivo, lattazione e sospensioni si aggiornano dagli eventi.', newBtn('capi', 'Aggiungi il primo capo'))}</section>`;
  const st = UI.f.stato || 'attivi', q = (UI.f.q || '').toLowerCase().trim();
  const cnt = {}; capi.forEach(c => { const s = capoI(c).stato; cnt[s] = (cnt[s] || 0) + 1; });
  const att = capi.length - (cnt['Uscita'] || 0);
  const chips = [['attivi', 'Tutti', att], ['In lattazione', 'In lattazione'], ['Asciutta', 'Asciutte'], ['Manza', 'Manze'], ['Vitella', 'Vitelle'], ['Uscita', 'Usciti']].filter(([k, , n]) => n !== undefined || cnt[k]);
  // il numero si cerca intero (296 non deve trovare 1296); matricola e nome anche in parte
  // solo cifre e c'e' una vacca con quel numero: si mostra quella (non le matricole che contengono le stesse cifre)
  const perNumero = /^\d+$/.test(q) && capi.some(c => numCapo(c) === q);
  const list = capi.filter(c => { const s = capoI(c).stato; if (st === 'attivi' ? s === 'Uscita' : s !== st) return false; return !q || numCapo(c) === q || (!perNumero && ((c.matricola || '') + ' ' + (c.nome || '')).toLowerCase().includes(q)); });
  const vista = UI.f.mview === 'tabella' ? 'tabella' : 'lista';
  return `<div class="toolbar"><div class="search">${ic('search')}<input class="inp" id="capoq" data-filter="q" placeholder="Numero, matricola o nome" value="${esc(UI.f.q || '')}" autocomplete="off" inputmode="search"></div><span class="sp"></span><div class="chipbar inline"><button data-act="chip" data-f="mview" data-v="lista" aria-pressed="${vista === 'lista'}">${ic('list')}Elenco</button><button data-act="chip" data-f="mview" data-v="tabella" aria-pressed="${vista === 'tabella'}">${ic('table-2')}Tabella</button></div>${newBtn('capi', 'Capo', '', '')}</div>
  <div class="chipbar">${chips.map(([k, l, n]) => `<button data-act="chip" data-f="stato" data-v="${k}" aria-pressed="${st === k}">${l}<span class="n">${n !== undefined ? n : cnt[k] || 0}</span></button>`).join('')}</div>
  ${vista === 'tabella' ? tabellaCapi(list) : `<section class="card"><div class="list">${list.length ? list.map(capoRow).join('') : empty('search', 'Nessun capo', 'Nessun capo corrisponde al filtro.')}</div></section>`}`;
}

// Tutto sott'occhio: una riga per capo, colonne ordinabili ed esportabili
function tabellaCapi(list) {
  const rows = list.map(c => {
    const i = capoI(c); const m = c.mm || {}; const al = [...i.alerts, ...benessere(c).filter(a => a.lv !== 'info')];
    return { id: c.id, n: numInt(c) ?? numCapo(c), nome: c.nome || '', matr: c.matricola || '', stato: i.stato, latt: i.nLatt || null, dim: i.dim,
      parto: i.pData || '', fec: i.fec ? i.fec.data : '', nfec: i.nFec || null, grav: i.gravida === true ? 'Gravida' : i.gravida === false ? 'Vuota' : i.fec ? 'Fecondata' : '',
      prev: i.gravida && i.prevParto ? i.prevParto : '', rum: m.ruminazione ?? null, att: m.attivita ?? null, alim: m.alimentazione ?? null, rip: m.riposo ?? null,
      calore: m.ultimoCalore || '', allarmi: al.map(a => a.t).join(', '), _al: al };
  });
  const html = tabella('capi', { cols: [
    { k: 'n', h: 'N.', html: r => `<b class="num">${esc(String(r.n))}</b>` }, { k: 'nome', h: 'Nome' }, { k: 'matr', h: 'Matricola', html: r => `<span class="mono muted">${esc(r.matr.slice(-6))}</span>` },
    { k: 'stato', h: 'Stato', html: r => statoChip(r.stato) }, { k: 'latt', h: 'Latt.', fmt: 'num' }, { k: 'dim', h: 'Giorni in latte', fmt: 'num' },
    { k: 'parto', h: 'Ultimo parto', fmt: 'date' }, { k: 'fec', h: 'Ultima fec.', fmt: 'date' }, { k: 'nfec', h: 'N. fec.', fmt: 'num' },
    { k: 'grav', h: 'Gravidanza', html: r => r.grav ? chip(r.grav, r.grav === 'Gravida' ? 'ok' : r.grav === 'Vuota' ? 'warn' : '') : '' }, { k: 'prev', h: 'Parto previsto', fmt: 'date' },
    { k: 'rum', h: 'Ruminazione min', fmt: 'num' }, { k: 'att', h: 'Attività', fmt: 'num' }, { k: 'alim', h: 'Alimentazione min', fmt: 'num' }, { k: 'rip', h: 'Riposo min', fmt: 'num' },
    { k: 'calore', h: 'Ultimo calore', fmt: 'date' }, { k: 'allarmi', h: 'Da fare / allarmi', html: r => r._al.slice(0, 2).map(a => chip(a.t, a.lv)).join('') }],
    rows, tot: { n: plural(rows.length, 'capo', 'capi') },
    rowAttr: r => `data-act="open" data-type="capo" data-id="${r.id}" class="clk"` });
  return `<section class="card flush">${html}<div class="pad-x fl-exp">${bottoniExport(['capi'], 'mandria-' + today())}</div></section>`;
}
export function capoRow(c) {
  const i = capoI(c);
  const bx = boxOf(c); const al = benessere(c).filter(a => a.lv !== 'info');
  const m = c.mm || {};
  const bits = [numCapo(c) && c.nome ? esc(c.nome) : '', bx ? esc(bx.nome) : '', i.nLatt ? i.nLatt + 'ª latt.' : '', i.dim !== null ? i.dim + ' gg in latte' : '', i.fec && !i.gravida ? 'fec. ' + fdShort(i.fec.data) + (i.nFec > 1 ? ' (' + i.nFec + 'ª)' : '') : '', i.gravida && i.prevParto ? 'parto ' + fd(i.prevParto) : '', m.ruminazione != null ? 'rum. ' + m.ruminazione + ' min' : '', c.sesso !== 'M' && !i.pData && okD(c.nascita) ? eta(c.nascita) : ''].filter(Boolean);
  return `<button class="row" data-act="open" data-type="capo" data-id="${c.id}"><span class="avatar numa ${i.inSospLatte ? 'bad' : STATO[i.stato] || ''}">${esc(avatarTxt(c))}</span><span class="r-main"><b>${esc(nomeCapo(c))} <span class="mono muted">${esc((c.matricola || '').slice(-6))}</span>${exChip(c)}</b><span>${bits.join(' · ')}</span></span><span class="r-side chips">${statoChip(i.stato)}${gravChip(i)}${i.inSospLatte ? chip('Sospensione', 'bad') : ''}${al.length ? chip(al[0].t, al[0].lv) : ''}</span></button>`;
}

function riproduzione() {
  const capi = sorted();
  const grp = k => capi.filter(c => capoI(c).alerts.some(a => a.k === k));
  const parti = capi.filter(c => { const i = capoI(c); return i.gravida && i.prevParto && !i.uscita && diff(today(), i.prevParto) <= 120; }).sort((a, b) => capoI(a).prevParto.localeCompare(capoI(b).prevParto));
  const block = (icon, t, arr, s) => `<section class="card"><div class="card-h"><h2>${ic(icon)}${t}</h2><span class="count">${arr.length}</span></div><p class="muted small pad-x">${s}</p><div class="list">${arr.length ? arr.map(capoRow).join('') : '<div class="empty slim">Nessun capo.</div>'}</div></section>`;
  // calendario dei parti: 4 mesi
  const T = today(); const months = []; for (let m = 0; m < 4; m++) { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + m); months.push({ y: d.getFullYear(), m: d.getMonth() }); }
  const ML = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];
  const cal = `<div class="calv">${months.map(({ y, m }) => { const items = parti.filter(c => { const p = capoI(c).prevParto; return +p.slice(0, 4) === y && +p.slice(5, 7) === m + 1; }); return `<div class="cm"><span class="cm-h">${ML[m]} ${y}</span>${items.length ? items.map(c => `<button class="cm-i" data-act="open" data-type="capo" data-id="${c.id}"><b>${+capoI(c).prevParto.slice(8)}</b>${esc(nomeCapoLungo(c))}</button>`).join('') : '<span class="cm-0">—</span>'}</div>`; }).join('')}</div>`;
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
    case 'Parto': { const vit = (s, es, m) => s ? (s === 'F' ? 'femmina' : s === 'M' ? 'maschio' : s.toLowerCase()) + (es === 'Morto' ? (s === 'M' ? ' nato morto' : ' nata morta') : '') + (m ? ' ' + m : '') : '';
      return [e.facilita, e.nVitelli === '2' ? 'gemelli' : '', vit(e.vitelloSesso, e.vitelloEsito, e.vitelloMatricola), e.nVitelli === '2' ? vit(e.vitello2Sesso, e.vitello2Esito, e.vitello2Matricola) : ''].filter(Boolean).join(' · '); }
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
  return `<button class="tl" data-act="edit" data-form="eventi" data-id="${e.id}"><span class="tl-ic t-${(EVI[e.tipo] || 'pencil')}">${ic(EVI[e.tipo] || 'pencil')}</span><span class="r-main"><b>${esc(e.tipo)}${withCapo && c ? ` · ${esc(nomeCapoLungo(c))}` : ''}${exChip(e)}</b><span>${esc(d)}${e.note ? (d ? ' · ' : '') + esc(e.note) : ''}</span></span><span class="tl-d">${fd(e.data)}</span></button>`;
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
  return { title: nomeCapo(c), html: `<section class="card detail-hero capo"><div class="big-avatar numa ${STATO[i.stato] || ''}">${esc(avatarTxt(c))}</div><div class="dh-body"><span class="eyebrow">${esc(c.razza || 'Bovino')} · ${c.sesso === 'M' ? 'maschio' : 'femmina'} · ${esc(c.gruppo || 'nessun gruppo')}</span><h1>${esc(nomeCapo(c))}${numCapo(c) && c.nome ? ` <small class="muted">${esc(c.nome)}</small>` : ''}${exChip(c)}</h1><span class="mono">${esc(c.matricola || '')}</span><div class="chips">${statoChip(i.stato)}${gravChip(i)}${i.inSospLatte ? chip('Latte in sospensione', 'bad') : ''}${i.alerts.filter(a => a.k !== 'sosp').map(a => chip(a.t, a.lv)).join('')}</div></div><button class="btn sm ghost" data-act="edit" data-form="capi" data-id="${c.id}">${ic('pencil')}Scheda</button></section>
  <div class="quick-ev">${quick.map(([t, l, icn]) => `<button data-act="new" data-form="eventi" data-capo="${c.id}" data-tipo="${t}">${ic(icn)}<span>${l}</span></button>`).join('')}</div>
  ${cycle}
  <dl class="facts">${fact('Nascita', okD(c.nascita) ? fd(c.nascita) + ' <small>' + eta(c.nascita) + '</small>' : '—')}${fact('Lattazioni', String(i.nLatt || 0))}${fact('Ultimo parto', i.pData ? fd(i.pData) : '—')}${fact('Ultima fecondazione', i.fec ? fd(i.fec.data) + (i.nFec > 1 ? ' <small>' + i.nFec + 'ª</small>' : '') : '—')}${fact('Parto previsto', i.prevParto ? fd(i.prevParto) + (i.gravida ? '' : ' <small>presunto</small>') : '—')}${fact('Sospensione latte', i.inSospLatte ? chip('fino al ' + fd(i.sospLatte), 'bad') : 'Nessuna')}${fact('Ultimo controllo', i.ctrl ? `<span class="num">${nf(i.ctrl.kg, 1)} kg</span> <small>${fd(i.ctrl.data)}</small>` : '—')}${fact('Madre · padre', esc([c.madre, c.padre].filter(Boolean).join(' · ') || '—'))}${fact('Stalla e box', (b => b ? `<button class="linkbtn" data-act="open" data-type="struttura" data-id="${b.s.id}">${esc(b.s.nome)} · ${esc(b.nome)}</button>` : '—')(boxOf(c)))}${c.numero ? fact('N. aziendale', esc(c.numero)) : ''}</dl>
  ${capoMM(c, i)}
  ${capoAia(c)}
  ${capoMisure(c)}
  ${capoInvii(c)}
  ${ctrls.length >= 2 ? `<section class="card"><div class="card-h"><h2>Controlli funzionali</h2></div><div class="ctrl-spark">${spark(ctrls.map(e => N(e.kg)), 300, 56)}<span class="muted small">${nf(ctrls[0].kg, 1)} → <b>${nf(ctrls[ctrls.length - 1].kg, 1)} kg/giorno</b></span></div></section>` : ''}
  ${c.note ? `<section class="card note">${esc(c.note)}</section>` : ''}
  <section class="card"><div class="card-h"><h2>Storia</h2><span class="count">${i.ev.length}</span></div><div class="timeline">${i.ev.length ? [...i.ev].reverse().map(e => evRow(e, false)).join('') : '<div class="empty slim">Nessun evento registrato.</div>'}</div></section>
  ${figli.length ? `<section class="card"><div class="card-h"><h2>Figli in azienda</h2></div><div class="list">${figli.map(capoRow).join('')}</div></section>` : ''}` };
}

// MooMonitor: i valori dell'ultimo giorno scaricato dal ponte, e cosa non torna con lo stato dell'app
function capoMM(c, i) {
  const m = c.mm; if (!m) return '';
  const v = (x, u) => x === null || x === undefined ? '—' : `<span class="num">${nf(x)}</span>${u ? ' <small>' + u + '</small>' : ''}`;
  const diversi = [];
  if (m.gravida !== undefined && i.gravida !== null && !!m.gravida !== !!i.gravida) diversi.push(m.gravida ? 'MooMonitor la segna gravida' : 'MooMonitor non la segna gravida');
  if (m.asciutta !== undefined && !!m.asciutta !== (i.stato === 'Asciutta') && i.stato !== 'Uscita') diversi.push(m.asciutta ? 'MooMonitor la segna asciutta' : 'MooMonitor non la segna asciutta');
  return `<section class="card"><div class="card-h"><h2>${ic('activity')}MooMonitor</h2><span class="muted small">dati del ${fd(m.giorno)}</span></div>
  ${diversi.length ? `<div class="chips pad-x">${diversi.map(t => chip(t, 'warn')).join('')}</div>` : ''}
  <dl class="facts inner">${fact('Ruminazione', v(m.ruminazione, 'min/giorno'))}${fact('Attività', v(m.attivita))}${fact('Alimentazione', v(m.alimentazione, 'min/giorno'))}${fact('Riposo', v(m.riposo, 'min/giorno'))}${fact('Ultimo calore', m.ultimoCalore ? fd(m.ultimoCalore) : '—')}${fact('Giorni in latte (MooMonitor)', v(m.dim))}</dl></section>`;
}

const esitoChip = (d, e) => chip(DEST[d] + ': ' + (e ? e.stato : 'in attesa'), ESITO[e ? e.stato : 'in attesa'] || '');
function invioRow(x, conCapo) {
  const c = get('capi', x.capoId);
  const es = x.esiti || {};
  const msg = Object.entries(es).filter(([, e]) => e && e.stato !== 'inviato').map(([d, e]) => DEST[d] + ': ' + (e.messaggio || e.stato)).join(' · ');
  return `<div class="row static"><span class="avatar numa ${x.stato === 'errore' ? 'bad' : x.stato === 'inviato' ? 'ok' : ''}">${ic(x.stato === 'inviato' ? 'check' : x.stato === 'errore' ? 'triangle-alert' : 'history')}</span><span class="r-main"><b>${esc(x.tipo || '')}${conCapo && c ? ' · ' + esc(nomeCapo(c)) : ''} <span class="muted">${fd(x.data)}</span></b><span>${msg ? esc(msg) : x.stato === 'in attesa' ? 'Il ponte lo manderà alla prossima esecuzione' : 'Inviato ' + (x.elaborato ? fd(x.elaborato.slice(0, 10)) : '')}</span></span><span class="r-side chips">${(x.destinazioni || []).map(d => esitoChip(d, es[d])).join('')}</span></div>`;
}
function capoInvii(c) {
  const l = S.invii.filter(x => x.capoId === c.id).sort((a, b) => String(b.creato).localeCompare(String(a.creato)));
  return l.length ? `<section class="card"><div class="card-h"><h2>${ic('send')}Invii a MooMonitor e Si@lleva</h2><span class="count">${l.length}</span></div><div class="list">${l.map(x => invioRow(x, false)).join('')}</div></section>` : '';
}
function inviiView() {
  const l = [...S.invii].sort((a, b) => String(b.creato).localeCompare(String(a.creato)));
  const att = l.filter(x => x.stato === 'in attesa'), err = l.filter(x => x.stato === 'errore'), ok = l.filter(x => x.stato !== 'in attesa' && x.stato !== 'errore');
  const blocco = (t, arr, s) => arr.length ? `<section class="card"><div class="card-h"><h2>${t}</h2><span class="count">${arr.length}</span></div>${s ? `<p class="muted small pad-x">${s}</p>` : ''}<div class="list">${arr.map(x => invioRow(x, true)).join('')}</div></section>` : '';
  return blocco('Da controllare', err, 'Il ponte non è riuscito a mandarli, oppure il servizio non li accetta: leggi il motivo.') + blocco('In attesa', att, 'Partono quando il ponte è acceso sul computer dell\'ufficio.') + blocco('Inviati', ok.slice(0, 100), '') || `<section class="card">${empty('send', 'Nessun invio', 'Quando registri un evento, spunta "Invia anche a" per mandarlo a MooMonitor o Si@lleva.')}</section>`;
}
