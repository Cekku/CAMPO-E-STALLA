// Stalle con box, silos, indici della mandria, benessere dai sensori e importazione dai sistemi di stalla
import { S, D, UI, get } from '../state.js';
import { esc, nf, eur, fd, byName, N, today, diff, plural } from '../util.js';
import { ic } from '../icons.js';
import { capoI } from '../domain.js';
import { empty, newBtn, chip, exChip, openSheet, closeSheet, toast } from '../ui.js';
import { capiIn, boxKey, siloInfo, indici, benessere, misureDi, CAMPI_MISURE, guessMap, matchCapo, allBoxes } from '../herd.js';
import { parseCSV, decode, isoDate } from '../fitodb.js';
import { spark } from './charts.js';
import * as store from '../store.js';

const STATO_COL = { 'In lattazione': 'var(--ok)', 'Asciutta': 'var(--hay)', 'Manza': 'var(--info)', 'Vitella': '#7FB3DB', 'Vitello': '#7FB3DB', 'Maschio': 'var(--muted)' };
const kpi = (l, v, u, s, cls = '') => `<div class="kpi static"><span class="k-l">${l}</span><span class="k-v ${cls}">${v}${u ? `<small>${u}</small>` : ''}</span>${s ? `<span class="k-s">${s}</span>` : ''}</div>`;
const fmt = (x, d = 0) => x === null || x === undefined ? '—' : nf(x, d);

function composizione(capi) {
  const m = new Map(); capi.forEach(c => { const s = capoI(c).stato; m.set(s, (m.get(s) || 0) + 1); });
  const tot = capi.length || 1;
  return `<div class="comp-bar">${[...m.entries()].map(([k, n]) => `<i style="width:${n / tot * 100}%;background:${STATO_COL[k] || 'var(--line-2)'}" title="${esc(k)}: ${n}"></i>`).join('')}</div><div class="comp-leg">${[...m.entries()].map(([k, n]) => `<span><i style="background:${STATO_COL[k] || 'var(--line-2)'}"></i>${esc(k)} <b>${n}</b></span>`).join('')}</div>`;
}

export function stalle() {
  const ss = [...S.strutture].sort(byName); const sil = [...S.silos].sort(byName);
  const senza = S.capi.filter(c => capoI(c).stato !== 'Uscita' && !(c.box && get('strutture', String(c.box).split('|')[0])));
  const struttCard = s => {
    const capi = capiIn(s.id); const posti = (s.box || []).reduce((t, b) => t + N(b.posti), 0); const I = indici(capi);
    return `<article class="stall-card" data-act="open" data-type="struttura" data-id="${s.id}" role="button" tabindex="0"><div class="sc-h">${ic('layout-grid')}<div><b>${esc(s.nome)}${exChip(s)}</b><span>${esc(s.tipo || '')} · ${plural((s.box || []).length, 'box', 'box')}</span></div><span class="chip ${posti && capi.length > posti ? 'bad' : 'ok'} num">${capi.length}${posti ? ' / ' + posti : ''} capi</span></div>
    ${posti ? `<div class="occ"><i style="width:${Math.min(100, capi.length / posti * 100)}%" class="${capi.length > posti ? 'over' : ''}"></i></div>` : ''}
    ${capi.length ? composizione(capi) : '<p class="muted small">Nessun capo assegnato.</p>'}
    <div class="sc-kpi"><span>DIM medio <b>${fmt(I.dim)}</b></span><span>Gravide <b>${I.gravPct === null ? '—' : fmt(I.gravPct) + '%'}</b></span><span>Benessere <b class="${I.benessere ? 't-bad' : ''}">${I.benessere ? I.benessere + ' allarmi' : 'ok'}</b></span></div>
    <div class="box-chips">${(s.box || []).map(b => { const n = capiIn(s.id, b.nome).length; return `<span class="${N(b.posti) && n > N(b.posti) ? 'over' : ''}">${esc(b.nome)}<em>${esc(b.fase || '')}</em><b>${n}${N(b.posti) ? '/' + nf(b.posti, 0) : ''}</b></span>`; }).join('')}</div></article>`;
  };
  const siloCard = s => {
    const i = siloInfo(s);
    return `<button class="silo" data-act="edit" data-form="silos" data-id="${s.id}"><span class="silo-tank"><i style="height:${i.pct ?? 0}%" class="${i.pct !== null && i.pct < 15 ? 'low' : ''}"></i></span><span class="r-main"><b>${esc(s.nome)}${exChip(s)}</b><span>${esc(s.tipo || '')}${i.p ? ' · ' + esc(i.p.nome) : ''}</span><span class="num">${nf(i.kg / 1000, 1)} t${i.cap ? ' su ' + nf(i.cap / 1000, 0) + ' t' : ''}${i.pct !== null ? ' · ' + nf(i.pct, 0) + '%' : ''}</span></span><span class="r-side">${i.giorni !== null ? chip(nf(i.giorni, 0) + ' giorni', i.giorni < 10 ? 'bad' : i.giorni < 30 ? 'warn' : 'ok') : '<span class="muted small">consumo non noto</span>'}</span></button>`;
  };
  return `<div class="toolbar"><p class="muted small">Disponi i capi nei box: ogni stalla mostra occupazione, composizione e indici.</p><span class="sp"></span>${newBtn('silos', 'Silo', '', '')}${newBtn('strutture', 'Stalla')}</div>
  ${ss.length ? `<div class="stall-grid">${ss.map(struttCard).join('')}</div>` : `<section class="card">${empty('layout-grid', 'Nessuna stalla', 'Crea le stalle con i loro box (lattazione, asciutta, preparto, infermeria…) e assegna i capi: vedrai a colpo d\'occhio chi è dove e quanto è piena ogni stalla.', newBtn('strutture', 'Crea la prima stalla'))}</section>`}
  ${senza.length && ss.length ? `<section class="card"><div class="card-h"><h2>${ic('cow')}Capi senza box</h2><span class="count">${senza.length}</span><button class="btn sm" data-act="moveCapi" data-src="">${ic('repeat-2')}Assegna</button></div></section>` : ''}
  <section class="card"><div class="card-h"><h2>${ic('cylinder')}Silos e depositi</h2><span class="count">${sil.length}</span></div><div class="list">${sil.length ? sil.map(siloCard).join('') : '<div class="empty slim">Aggiungi trincee e silos: collegati al magazzino, mostrano quanti giorni di autonomia restano con le razioni attuali.</div>'}</div></section>`;
}

export function strutturaDetail(s) {
  const capi = capiIn(s.id); const posti = (s.box || []).reduce((t, b) => t + N(b.posti), 0); const I = indici(capi);
  const boxCard = b => { const cs = capiIn(s.id, b.nome).sort((a, b2) => (a.nome || a.matricola || '').localeCompare(b2.nome || b2.matricola || '')); return `<section class="card box-card"><div class="card-h"><div><span class="eyebrow">${esc(b.fase || 'Box')}</span><h2>${esc(b.nome)}</h2></div><span class="chip ${N(b.posti) && cs.length > N(b.posti) ? 'bad' : 'ok'} num">${cs.length}${N(b.posti) ? ' / ' + nf(b.posti, 0) : ''}</span><button class="btn sm ghost" data-act="moveCapi" data-src="${esc(boxKey(s, b))}">${ic('repeat-2')}Sposta</button></div><div class="cow-chips">${cs.length ? cs.map(c => { const i = capoI(c); const al = benessere(c).some(a => a.lv !== 'info'); return `<button data-act="open" data-type="capo" data-id="${c.id}" class="${i.inSospLatte ? 'bad' : al ? 'warn' : ''}"><b>${esc(c.nome || (c.matricola || '').slice(-5))}</b><small>${esc(i.stato)}${i.dim !== null ? ' · ' + i.dim + ' gg' : ''}</small></button>`; }).join('') : '<span class="muted small">Box vuoto</span>'}</div></section>`; };
  return { title: s.nome, html: `<section class="card detail-hero"><div class="big-icon">${ic('layout-grid')}</div><div class="dh-body"><span class="eyebrow">${esc(s.tipo || 'Stalla')}</span><h1>${esc(s.nome)}${exChip(s)}</h1><div class="big-num">${capi.length}<small>${posti ? 'capi su ' + posti + ' posti' : 'capi'}</small></div>${capi.length ? composizione(capi) : ''}<div class="btns"><button class="btn sm" data-act="moveCapi" data-src="">${ic('repeat-2')}Assegna capi</button><button class="btn sm ghost" data-act="edit" data-form="strutture" data-id="${s.id}">${ic('pencil')}Modifica</button></div></div></section>
  <div class="kpis">${kpi('DIM medio', fmt(I.dim), 'giorni', I.latt + ' in lattazione')}${kpi('Gravide', I.gravPct === null ? '—' : fmt(I.gravPct), '%', I.vacche + ' vacche')}${kpi('Giorni aperti', fmt(I.giorniAperti), 'giorni', 'media')}${kpi('Benessere', I.benessere || '0', 'allarmi', 'da ruminazione e latte', I.benessere ? 't-bad' : '')}</div>
  ${(s.box || []).map(boxCard).join('')}
  ${s.note ? `<section class="card note">${esc(s.note)}</section>` : ''}` };
}

// Spostamento di più capi in un box
export function moveSheet(src) {
  const [sid, bn] = src ? src.split('|') : [null, null];
  const pool = S.capi.filter(c => capoI(c).stato !== 'Uscita').filter(c => src ? c.box === src : !(c.box && get('strutture', String(c.box).split('|')[0]))).sort((a, b) => (a.nome || a.matricola || '').localeCompare(b.nome || b.matricola || ''));
  const all = src && !pool.length ? [] : pool;
  const list = all.length ? all : S.capi.filter(c => capoI(c).stato !== 'Uscita');
  const boxes = allBoxes();
  if (!boxes.length) { toast('Prima crea una stalla con i suoi box.', 'err'); return; }
  const body = openSheet(src ? 'Sposta da ' + (bn || '') : 'Assegna capi ai box', `<div class="move">
    <label class="fld"><span class="flabel">Box di destinazione</span><select id="mvTo">${boxes.filter(b => b[0] !== src).map(b => `<option value="${esc(b[0])}">${esc(b[1])}</option>`).join('')}</select></label>
    <div class="wz-tools"><span class="muted small">${list.length} capi</span><span class="sp"></span><label class="wz-all"><span>Tutti</span><input type="checkbox" id="mvAll"></label></div>
    <div class="wz-list">${list.map(c => { const i = capoI(c); return `<label class="wz-field"><span class="avatar">${esc((c.nome || c.matricola || '?')[0].toUpperCase())}</span><span class="r-main"><b>${esc(c.nome || 'Senza nome')} <span class="mono muted">${esc((c.matricola || '').slice(-6))}</span></b><span>${esc(i.stato)}${c.box ? ' · ' + esc(String(c.box).split('|')[1] || '') : ''}</span></span><input type="checkbox" value="${c.id}"></label>`; }).join('')}</div>
    <div class="factions"><span class="sp"></span><button class="btn ghost" data-act="close">Annulla</button><button class="btn primary" id="mvGo">Sposta</button></div></div>`);
  body.onchange = e => { if (e.target.id === 'mvAll') body.querySelectorAll('.wz-list input').forEach(x => { x.checked = e.target.checked; x.closest('.wz-field').classList.toggle('on', x.checked); }); else if (e.target.type === 'checkbox') e.target.closest('.wz-field').classList.toggle('on', e.target.checked); };
  body.querySelector('#mvGo').onclick = async () => {
    const to = body.querySelector('#mvTo').value; const ids = [...body.querySelectorAll('.wz-list input:checked')].map(x => x.value);
    if (!ids.length) return toast('Scegli almeno un capo.', 'err');
    const [tsid] = to.split('|'); const ts = get('strutture', tsid); const tb = ts && (ts.box || []).find(b => boxKey(ts, b) === to);
    for (const id of ids) { const c = get('capi', id); if (c) await store.put('capi', id, Object.assign({}, c, { box: to }, tb && tb.fase === 'Asciutta' ? { gruppo: 'Asciutta' } : tb && tb.fase === 'Preparto' ? { gruppo: 'Preparto' } : {})); }
    closeSheet(); toast(plural(ids.length, 'capo spostato', 'capi spostati'));
  };
}

export function indiciView() {
  const I = indici(); const T = today();
  const att = S.capi.filter(c => capoI(c).stato !== 'Uscita');
  const al = att.flatMap(c => benessere(c).map(a => Object.assign({ c }, a))).sort((a, b) => ({ bad: 0, warn: 1, info: 2 }[a.lv] - { bad: 0, warn: 1, info: 2 }[b.lv]));
  const nMis = S.misure.length; const lastM = nMis ? S.misure.reduce((m, x) => x.data > m ? x.data : m, '') : null;
  return `<div class="kpis">${kpi('Latte per capo', fmt(I.lCapo, 1), 'l/giorno', I.latt + ' vacche in lattazione')}${kpi('IOFC', I.iofc === null ? '—' : eur(I.iofc, 2), '', I.iofc === null ? 'servono latte, prezzo e razioni' : 'ricavo latte meno alimentazione, per capo al giorno')}${kpi('DIM medio', fmt(I.dim), 'giorni', 'ideale 150–180')}${kpi('Gravide', I.gravPct === null ? '—' : fmt(I.gravPct), '%', 'sulle vacche')}</div>
  <section class="card"><div class="card-h"><h2>${ic('gauge')}Indici della mandria</h2></div><dl class="facts inner">
    ${[['Capi presenti', fmt(I.capi)], ['Vacche in lattazione', fmt(I.latt)], ['Asciutte', fmt(I.asciutte)], ['Rimonta', fmt(I.rimonta) + (I.rimontaPct !== null ? ' <small>' + fmt(I.rimontaPct) + '% delle vacche</small>' : '')], ['Giorni aperti medi', fmt(I.giorniAperti) + ' <small>obiettivo &lt; 120</small>'], ['Interparto medio', I.interparto === null ? '—' : fmt(I.interparto) + ' gg <small>obiettivo &lt; 400</small>'], ['Inseminazioni per gravidanza', fmt(I.insPerConc, 1)], ['Età al primo parto', I.etaPrimoParto === null ? '—' : fmt(I.etaPrimoParto, 1) + ' mesi'], ['Costo alimentare', I.feed === null ? '—' : eur(I.feed, 2) + ' <small>per vacca al giorno</small>'], ['Prezzo del latte', I.prezzo ? eur(I.prezzo, 3) + '/l' : '—']].map(([l, v]) => `<div class="fact"><dt>${l}</dt><dd>${v}</dd></div>`).join('')}</dl></section>
  <section class="card ${al.some(a => a.lv === 'bad') ? 'alarm' : ''}"><div class="card-h"><h2>${ic('activity')}Benessere e allarmi</h2><span class="count">${al.length}</span></div><p class="muted small pad-x">Calcolati dalle misure giornaliere importate (ruminazione, latte, attività): un calo marcato rispetto alla settimana precedente è spesso il primo segno di un problema.</p>
  <div class="list">${al.length ? al.map(a => `<button class="row" data-act="open" data-type="capo" data-id="${a.c.id}"><span class="avatar ${a.lv}">${esc((a.c.nome || a.c.matricola || '?')[0])}</span><span class="r-main"><b>${esc(a.t)} · ${esc(a.c.nome || a.c.matricola)}</b><span>${esc(a.s)} · ${fd(a.data)}</span></span>${chip(a.lv === 'bad' ? 'Urgente' : a.lv === 'warn' ? 'Da controllare' : 'Info', a.lv)}</button>`).join('') : `<div class="empty slim">${nMis ? 'Nessun allarme: tutte le vacche nella norma.' : 'Importa i dati della sala di mungitura o dei collari per avere gli allarmi.'}</div>`}</div></section>
  <section class="card set"><div class="set-h">${ic('file-spreadsheet')}<div><h2>Dati dai sistemi di stalla</h2><p>Esporta in CSV o Excel (salvato come CSV) i dati giornalieri per vacca da Alpro, MooMonitor, SCR, Lely, Afimilk… e caricali qui: l'app riconosce le colonne, abbina gli animali per matricola, numero aziendale o nome e calcola allarmi e grafici.</p></div></div>
  ${nMis ? `<div class="syncbox ok">${ic('circle-check')}<div><b>${nf(nMis, 0)} misure caricate</b><span>ultima del ${fd(lastM)}${lastM ? ' · ' + diff(lastM, T) + ' giorni fa' : ''}</span></div></div>` : ''}
  <div class="btns"><label class="btn primary">${ic('file-up')}Importa CSV<input type="file" accept=".csv,.txt,text/csv" data-act="misureImport" hidden></label></div></section>`;
}

// Importazione con riconoscimento delle colonne e anteprima
export async function misureImport(file) {
  const rows = parseCSV(decode(await file.arrayBuffer()));
  // salta le righe di intestazione del programma finché non trova una riga con più colonne
  let h = 0; while (h < Math.min(10, rows.length - 1) && rows[h].filter(x => String(x).trim()).length < 3) h++;
  const head = rows[h] || []; const data = rows.slice(h + 1).filter(r => r.some(x => String(x).trim()));
  if (!data.length) { toast('Il file non contiene righe di dati.', 'err'); return; }
  const map = guessMap(head);
  const sel = (k) => `<select data-map="${k}"><option value="">— non presente —</option>${head.map((x, i) => `<option value="${i}"${map[k] === i ? ' selected' : ''}>${esc(x || 'colonna ' + (i + 1))}</option>`).join('')}</select>`;
  const body = openSheet('Importa dati di stalla', `<div class="pcg"><p class="muted small">${data.length} righe in <b>${esc(file.name)}</b>. Controlla a quale colonna corrisponde ogni dato.</p>
    <div class="fgrid">${CAMPI_MISURE.map(([k, l]) => `<label class="fld half"><span class="flabel">${esc(l)}${k === 'capo' ? '<em>*</em>' : ''}</span>${sel(k)}</label>`).join('')}
    <label class="fld half"><span class="flabel">Data, se manca nel file</span><div class="inwrap"><input type="date" id="misData" value="${today()}"></div></label>
    <label class="fld half"><span class="flabel">Origine dei dati</span><div class="inwrap"><input id="misFonte" value="${esc(/moo/i.test(file.name) ? 'MooMonitor' : /alpro|delaval/i.test(file.name) ? 'Alpro' : '')}" placeholder="Es. Alpro"></div></label></div>
    <div id="misPrev"></div>
    <div class="factions"><span class="sp"></span><button class="btn ghost" data-act="close">Annulla</button><button class="btn primary" id="misGo">Importa</button></div></div>`, { wide: true });
  const read = () => { const m = {}; body.querySelectorAll('[data-map]').forEach(s => { if (s.value !== '') m[s.dataset.map] = +s.value; }); return m; };
  const build = () => {
    const m = read(); const def = body.querySelector('#misData').value; const fonte = body.querySelector('#misFonte').value.trim() || 'import';
    const recs = []; let miss = 0; const unk = new Set();
    data.forEach(r => {
      if (m.capo === undefined) return; const c = matchCapo(r[m.capo]); if (!c) { miss++; unk.add(String(r[m.capo]).trim()); return; }
      const d = m.data !== undefined ? isoDate(r[m.data]) || def : def; if (!d) return;
      const rec = { capoId: c.id, data: d, fonte };
      ['latte', 'ruminazione', 'attivita', 'conducibilita', 'mungiture'].forEach(k => { if (m[k] !== undefined && String(r[m[k]]).trim() !== '') { const v = N(r[m[k]]); if (isFinite(v)) rec[k] = v; } });
      if (m.note !== undefined && String(r[m.note]).trim()) rec.note = String(r[m.note]).trim();
      if (Object.keys(rec).length > 3) recs.push(rec);
    });
    return { recs, miss, unk: [...unk].filter(Boolean).slice(0, 8) };
  };
  const prev = () => { const b = build(); body.querySelector('#misPrev').innerHTML = `<div class="syncbox ${b.recs.length ? 'ok' : 'error'}">${ic(b.recs.length ? 'circle-check' : 'triangle-alert')}<div><b>${b.recs.length} misure pronte da importare</b><span>${b.miss ? b.miss + ' righe con animali non trovati' + (b.unk.length ? ': ' + esc(b.unk.join(', ')) : '') + '. Inserisci il numero aziendale nella scheda del capo.' : 'tutti gli animali riconosciuti'}</span></div></div>`; };
  body.onchange = prev; body.oninput = prev; prev();
  body.querySelector('#misGo').onclick = async e => {
    const b = build(); if (!b.recs.length) return toast('Nessuna misura da importare: controlla la colonna dell\'animale.', 'err');
    e.target.disabled = true;
    await store.bulkPut(b.recs.map(r => ({ col: 'misure', id: r.capoId + '_' + r.data + '_' + r.fonte.toLowerCase().replace(/\W+/g, ''), data: r })));
    closeSheet(); toast('Importate ' + b.recs.length + ' misure');
  };
}

// Grafico delle misure nella scheda del capo
export function capoMisure(c) {
  const ms = misureDi(c.id).slice(-30); if (ms.length < 2) return '';
  const al = benessere(c);
  const serie = (k, l, u, d = 0) => { const v = ms.map(m => m[k] === undefined ? null : N(m[k])); if (v.filter(x => x !== null).length < 2) return ''; const last = [...v].reverse().find(x => x !== null); return `<div class="ms-row"><span class="ms-l">${l}</span>${spark(v, 260, 44)}<b class="num">${nf(last, d)} <small>${u}</small></b></div>`; };
  return `<section class="card"><div class="card-h"><h2>${ic('activity')}Sensori e sala di mungitura</h2><span class="muted small">ultimi ${ms.length} giorni · ${esc(ms[ms.length - 1].fonte || '')}</span></div>${al.length ? `<div class="chips pad-x">${al.map(a => chip(a.t + ': ' + a.s, a.lv)).join('')}</div>` : ''}<div class="ms">${serie('latte', 'Latte', 'kg', 1)}${serie('ruminazione', 'Ruminazione', 'min')}${serie('attivita', 'Attività', '')}${serie('conducibilita', 'Conducibilità', '', 1)}</div></section>`;
}
