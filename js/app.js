// Avvio, navigazione (menu laterale Campagna/Stalla) e azioni dell'app
import { S, UI, D, bus, get, azienda, COLS } from './state.js';
import { $, $$, esc, N, nf, today, addDays, yearOf, byDate, byName, lsSet, debounce, sum } from './util.js';
import { ic } from './icons.js';
import { derive, razioneInfo, allAlerts, campoHa, cropOf, capoI } from './domain.js';
import * as store from './store.js';
import { sync, onSync } from './store.js';
import { openSheet, closeSheet, sheetOpen, toast, arm, addLine, formDelete } from './ui.js';
import { openEdit, openColtura } from './forms.js';
import { startWizard } from './wizard.js';
import * as MAP from './map.js';
import { promptInstall, canInstall } from './install.js';
import { exampleRows } from './esempi.js';
import { render as vOggi } from './views/oggi.js';
import { render as vCampi } from './views/campi.js';
import { render as vAtt } from './views/attivita.js';
import { render as vNote } from './views/note.js';
import { render as vMeteo } from './views/meteo.js';
import { render as vStalla } from './views/stalla.js';
import { render as vMag } from './views/magazzino.js';
import { render as vMezzi } from './views/mezzi.js';
import { render as vImp, authUI } from './views/impostazioni.js';

const VIEWS = { oggi: vOggi, campi: vCampi, attivita: vAtt, note: vNote, meteo: vMeteo, stalla: vStalla, magazzino: vMag, mezzi: vMezzi, impostazioni: vImp };
const TITLES = { oggi: 'Dashboard', mappa: 'Mappa', campi: 'Campi', attivita: 'Attività', note: 'Note', meteo: 'Meteo', stalla: 'Stalla', magazzino: 'Magazzino', mezzi: 'Mezzi', impostazioni: 'La mia azienda' };
const YEARLY = new Set(['oggi', 'mappa', 'campi', 'attivita', 'stalla', 'magazzino', 'mezzi']);
// Voci del menu: [tab, sub, icona, etichetta]
const MENU = {
  campagna: [
    ['Principale', [['oggi', null, 'house', 'Dashboard'], ['campi', 'elenco', 'sprout', 'Campi'], ['mappa', null, 'map', 'Mappa'], ['attivita', null, 'notebook-pen', 'Attività'], ['magazzino', 'prodotti', 'warehouse', 'Magazzino'], ['magazzino', 'movimenti', 'package', 'Carichi e scarichi']]],
    ['Agronomia', [['meteo', null, 'cloud-sun', 'Meteo'], ['campi', 'costi', 'euro', 'Costi e margini'], ['note', null, 'pencil', 'Note']]],
    ['Gestione', [['mezzi', null, 'tractor', 'Macchinari'], ['impostazioni', null, 'building-2', 'La mia azienda']]],
  ],
  stalla: [
    ['Principale', [['oggi', null, 'house', 'Dashboard'], ['stalla', 'mandria', 'cow', 'Mandria'], ['stalla', 'riproduzione', 'heart-pulse', 'Riproduzione'], ['stalla', 'latte', 'milk', 'Latte']]],
    ['Alimentazione e salute', [['stalla', 'razioni', 'wheat', 'Razioni'], ['stalla', 'sanitario', 'syringe', 'Sanitario'], ['magazzino', 'prodotti', 'warehouse', 'Magazzino']]],
    ['Gestione', [['note', null, 'pencil', 'Note'], ['mezzi', null, 'tractor', 'Macchinari'], ['impostazioni', null, 'building-2', 'La mia azienda']]],
  ],
};
const TAB_OF = { campo: 'campi', capo: 'stalla', prodotto: 'magazzino', mezzo: 'mezzi' };
const saveUI = () => lsSet('ces.ui', { sub: UI.sub, area: UI.area, view: UI.view });

/* ---------- render ---------- */
let rq = 0;
const schedule = () => { if (rq) return; rq = requestAnimationFrame(() => { rq = 0; render(); }); };
bus.render = schedule;

function syncInfo() {
  let icn = 'cloud-off', t = 'Solo su questo dispositivo', cls = 'local';
  if (sync.mode === 'cloud' && !sync.user) { icn = 'user'; t = 'Accedi per sincronizzare'; cls = 'warn'; }
  else if (sync.mode === 'cloud' && sync.user && !sync.farm) { icn = 'building-2'; t = 'Collega un\'azienda'; cls = 'warn'; }
  else if (sync.farm) {
    if (sync.status === 'syncing') { icn = 'refresh-cw'; t = 'Sincronizzo…'; cls = 'busy'; }
    else if (sync.status === 'offline' || !navigator.onLine) { icn = 'wifi-off'; t = sync.pending ? sync.pending + ' modifiche in attesa' : 'Offline'; cls = 'warn'; }
    else if (sync.status === 'error') { icn = 'triangle-alert'; t = 'Errore di sincronizzazione'; cls = 'bad'; }
    else if (sync.pending) { icn = 'cloud-upload'; t = sync.pending + ' da inviare'; cls = 'busy'; }
    else { icn = 'circle-check'; t = 'Sincronizzato'; cls = 'ok'; }
  }
  return { icn, t, cls };
}
function syncPill() { const el = $('#syncBtn'); if (!el) return; const s = syncInfo(); el.className = 'ab-btn sync ' + s.cls; el.innerHTML = ic(s.icn); el.title = s.t; el.setAttribute('aria-label', s.t); }
onSync(() => { syncPill(); schedule(); });

function isCur(tab, sub) { if (UI.tab !== tab) return false; if (!sub) return true; return UI.sub[tab] === sub; }
function drawerHTML() {
  const a = azienda(); const ha = sum(S.campi, campoHa); const si = syncInfo();
  const nAl = allAlerts().filter(x => UI.area === 'stalla' ? ['stalla', 'latte', 'magazzino'].includes(x.area) : x.area !== 'stalla' && x.area !== 'latte').length;
  const other = UI.area === 'stalla' ? ['campagna', 'sprout', 'Vai alla Campagna'] : ['stalla', 'cow', 'Vai alla Stalla'];
  return `<div class="dr-head"><img src="icons/icon-192.png" alt="" width="44" height="44"><div><b>${esc(a.nome || (sync.farm && sync.farm.name) || 'La tua azienda')}</b><span>${UI.area === 'stalla' ? S.capi.filter(c => capoI(c).stato !== 'Uscita').length + ' capi' : nf(ha, 2) + ' ha'} · ${UI.area === 'stalla' ? 'Stalla' : 'Campagna'}</span></div></div>
  <button class="dr-user" data-act="nav" data-tab="impostazioni"><span class="dr-av">${ic(sync.user ? 'user' : si.icn)}</span><span><b>${esc(sync.user ? sync.user.email : 'Nessun account')}</b><small class="${si.cls}">${esc(si.t)}</small></span>${ic('chevron-right', 'chev')}</button>
  <div class="dr-tiles"><button data-act="syncTile">${ic('refresh-cw')}<span>Sincronizza</span></button><button data-act="nav" data-tab="oggi">${ic('triangle-alert')}<span>Avvisi</span>${nAl ? `<i class="badge">${nAl}</i>` : ''}</button><button data-act="exportSheet">${ic('download')}<span>Esporta</span></button></div>
  <nav class="dr-nav">${MENU[UI.area].map(([sec, items]) => `<div class="dr-sec">${esc(sec)}</div>` + items.map(([t, s, i, l]) => `<button class="dr-i" data-act="nav" data-tab="${t}"${s ? ` data-sub="${s}"` : ''} aria-current="${isCur(t, s) && !(t === 'magazzino' && !s) ? 'page' : 'false'}">${ic(i)}<span>${esc(l)}</span></button>`).join('')).join('')}
  ${canInstall() ? `<button class="dr-i" data-act="install">${ic('smartphone')}<span>Installa l'app</span></button>` : ''}</nav>
  <button class="dr-switch" data-act="area" data-area="${other[0]}">${ic('refresh-cw')}<span>${other[2]}</span>${ic(other[1])}</button>`;
}

function render() {
  derive();
  document.body.dataset.area = UI.area;
  $('#drawer').innerHTML = drawerHTML();
  syncPill();
  const years = new Set([new Date().getFullYear(), UI.anno]); S.operazioni.forEach(o => { const y = yearOf(o.data); if (y) years.add(y); }); S.eventi.forEach(o => { const y = yearOf(o.data); if (y) years.add(y); });
  $('#yearSel').innerHTML = [...years].sort((a, b) => b - a).map(y => `<option value="${y}"${y === UI.anno ? ' selected' : ''}>${y}</option>`).join('');
  const isMap = UI.tab === 'mappa';
  document.body.classList.toggle('on-map', isMap);
  $('#mapView').hidden = !isMap; $('#view').hidden = isMap;
  $('#menuBtn').hidden = !!UI.detail; $('#backBtn').hidden = !UI.detail;
  $('#yearSel').hidden = !!UI.detail || !YEARLY.has(UI.tab);
  if (isMap) { $('#abTitle').textContent = 'Mappa'; MAP.showMap(); MAP.mapUpdate(); return; }
  const ae = document.activeElement; const fid = ae && ae.id && $('#view').contains(ae) ? ae.id : null; const sel = fid && ae.selectionStart != null ? [ae.selectionStart, ae.selectionEnd] : null;
  let r;
  if (!UI.loaded) r = { title: '', html: '<div class="loading"><span class="spinner"></span>Carico i dati…</div>' };
  else r = (VIEWS[UI.tab] || vOggi)();
  const t = UI.detail ? r.title : (UI.tab === 'oggi' && UI.area === 'stalla' ? 'Stalla' : TITLES[UI.tab] || r.title);
  $('#abTitle').textContent = t;
  document.title = (t ? t + ' · ' : '') + 'Campo e Stalla';
  $('#view').innerHTML = r.html;
  if (fid) { const el = document.getElementById(fid); if (el) { el.focus(); if (sel) try { el.setSelectionRange(sel[0], sel[1]); } catch (e) { } } }
}

/* ---------- navigazione ---------- */
const drawer = open => { document.body.classList.toggle('drawer-open', open); };
function setTab(t, sub) {
  if (UI.tab === 'mappa' && t !== 'mappa') MAP.endMode();
  UI.tab = t; if (sub) UI.sub[t] = sub; UI.detail = null; UI.hist = []; saveUI();
  try { history.replaceState(null, '', '#' + t); } catch (e) { }
  drawer(false); render(); window.scrollTo(0, 0);
}
function openDetail(type, id) {
  UI.hist.push({ tab: UI.tab, detail: UI.detail });
  UI.tab = TAB_OF[type]; UI.detail = { type, id };
  try { history.pushState({ d: 1 }, '', '#' + UI.tab); } catch (e) { }
  render(); window.scrollTo(0, 0);
}
function goBack() { const h = UI.hist.pop(); if (h) { UI.tab = h.tab; UI.detail = h.detail; } else UI.detail = null; render(); window.scrollTo(0, 0); }
window.addEventListener('popstate', () => { if (sheetOpen()) { closeSheet(); return; } if (document.body.classList.contains('drawer-open')) { drawer(false); return; } if (UI.detail) goBack(); });
document.addEventListener('ces:deleted', e => { if (UI.detail && UI.detail.id === e.detail.id) goBack(); });

/* ---------- registrazione rapida ---------- */
function quickSheet() {
  const Q = UI.area === 'stalla'
    ? [['ev', 'cow', 'Evento di stalla', 'Parto, fecondazione, diagnosi'], ['tr', 'syringe', 'Trattamento', 'Farmaco e sospensioni'], ['latte', 'milk', 'Latte del giorno', 'Litri e qualità'], ['capo', 'baby', 'Nuovo capo', 'Acquisto o nascita'], ['carico', 'download', 'Carico magazzino', 'Mangimi, farmaci'], ['nota', 'pencil', 'Nota', 'Promemoria e osservazioni']]
    : [['att', 'notebook-pen', 'Nuova attività', 'Su uno o più campi'], ['plan', 'calendar', 'Pianifica attività', 'Da fare nei prossimi giorni'], ['campo', 'pentagon', 'Nuovo campo', 'Disegnalo sulla mappa'], ['carico', 'download', 'Carico magazzino', 'Merce arrivata'], ['nota', 'pencil', 'Nota', 'Promemoria e osservazioni'], ['man', 'wrench', 'Manutenzione', 'Tagliando, riparazione']];
  openSheet('Registra', `<div class="quick">${Q.map(q => `<button data-act="quickgo" data-k="${q[0]}"><span class="q-ic">${ic(q[1])}</span><b>${q[2]}</b><span>${q[3]}</span></button>`).join('')}</div>`);
}
function quickGo(k) {
  closeSheet();
  const later = fn => setTimeout(fn, 230);
  switch (k) {
    case 'att': return later(() => startWizard());
    case 'plan': return later(() => startWizard({ stato: 'Pianificata' }));
    case 'campo': setTab('mappa'); return setTimeout(() => MAP.startDraw(), 300);
    case 'carico': return later(() => openEdit('movimenti', null, { tipo: 'Carico' }));
    case 'nota': return later(() => openEdit('note'));
    case 'man': return later(() => openEdit('manutenzioni'));
    case 'ev': return later(() => openEdit('eventi'));
    case 'tr': return later(() => openEdit('eventi', null, { tipo: 'Trattamento sanitario' }));
    case 'latte': return later(() => openEdit('latte'));
    case 'capo': return later(() => openEdit('capi'));
  }
}

/* ---------- ricerca ---------- */
function searchSheet() {
  openSheet('Cerca', `<div class="search big">${ic('search')}<input class="inp" id="gq" placeholder="Campi, capi, prodotti, mezzi, note" autocomplete="off" enterkeyhint="search"></div><div id="gres" class="list flat"></div>`);
  setTimeout(() => { const i = $('#gq'); if (i) i.focus(); }, 80);
}
function searchRun(q) {
  q = q.toLowerCase().trim(); const out = $('#gres'); if (!out) return;
  if (q.length < 2) { out.innerHTML = '<div class="empty slim">Scrivi almeno due lettere.</div>'; return; }
  const hit = (s) => String(s || '').toLowerCase().includes(q);
  const rows = [
    ...S.campi.filter(c => hit(c.nome) || hit(cropOf(c)) || hit(c.catasto)).map(c => ['campo', c.id, 'sprout', c.nome, cropOf(c) + ' · ' + nf(campoHa(c), 2) + ' ha']),
    ...S.capi.filter(c => hit(c.nome) || hit(c.matricola)).map(c => ['capo', c.id, 'cow', c.nome || c.matricola, c.matricola]),
    ...S.prodotti.filter(p => hit(p.nome) || hit(p.nReg)).map(p => ['prodotto', p.id, 'package', p.nome, p.categoria]),
    ...S.mezzi.filter(m => hit(m.nome) || hit(m.targa)).map(m => ['mezzo', m.id, 'tractor', m.nome, m.tipo]),
    ...S.note.filter(n => hit(n.titolo) || hit(n.testo)).map(n => ['nota', n.id, 'pencil', n.titolo, (n.testo || '').slice(0, 60)]),
  ].slice(0, 40);
  out.innerHTML = rows.length ? rows.map(([t, id, i, l, s]) => `<button class="row" data-act="${t === 'nota' ? 'edit' : 'open'}" ${t === 'nota' ? `data-form="note" data-id="${id}"` : `data-type="${t}" data-id="${id}"`}><span class="r-icon">${ic(i)}</span><span class="r-main"><b>${esc(l)}</b><span>${esc(s || '')}</span></span>${ic('chevron-right', 'chev')}</button>`).join('') : '<div class="empty slim">Nessun risultato.</div>';
}

/* ---------- esportazioni ---------- */
function download(name, text, type = 'text/csv;charset=utf-8') {
  const b = new Blob([text], { type }); const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href = u; a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(u); a.remove(); }, 1000);
}
const csv = (head, rows) => '﻿' + [head, ...rows].map(r => r.map(x => { const s = String(x ?? ''); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(';')).join('\r\n');
const it = n => n === null || n === undefined || n === '' ? '' : String(n).replace('.', ',');
function exportSheet() {
  drawer(false);
  openSheet('Esporta documenti', `<p class="muted">File CSV che si aprono con Excel, per l'annata ${UI.anno}.</p><div class="list flat">${[['quaderno', 'notebook-pen', 'Quaderno di campagna', 'Trattamenti, concimazioni, semine con prodotto, dose, avversità e carenza'], ['trattamenti', 'syringe', 'Registro trattamenti di stalla', 'Farmaci, ricette e fine delle sospensioni'], ['latte', 'milk', 'Registro del latte', 'Litri, conferiti, analisi'], ['movimenti', 'warehouse', 'Movimenti di magazzino', 'Carichi e scarichi'], ['backup', 'history', 'Copia di sicurezza completa', 'Tutti i dati in un file JSON']].map(([k, i, l, s]) => `<button class="row" data-act="${k === 'backup' ? 'backup' : 'export'}" data-what="${k}"><span class="r-icon">${ic(i)}</span><span class="r-main"><b>${l}</b><span>${s}</span></span>${ic('download', 'chev')}</button>`).join('')}</div>`);
}
function doExport(what) {
  const y = UI.anno;
  if (what === 'quaderno') { const ops = S.operazioni.filter(o => yearOf(o.data) === y && o.stato !== 'Pianificata').sort(byDate); download(`quaderno-campagna-${y}.csv`, csv(['Data', 'Appezzamento', 'Superficie ha', 'Coltura', 'Catasto', 'Operazione', 'Prodotto', 'N. registrazione', 'Dose/ha', 'Quantità', 'Unità', 'Avversità', 'Fase', 'Carenza gg', 'Mezzo', 'Ore', 'Operatore', 'Note'], ops.map(o => { const c = get('campi', o.campoId) || {}, p = get('prodotti', o.prodottoId) || {}, m = get('mezzi', o.mezzoId) || {}; return [o.data, c.nome, it(campoHa(c)), cropOf(c, y), c.catasto, o.tipo, p.nome, p.nReg, it(o.dose), it(o.quantita), p.unita, o.avversita, o.fase, it(p.carenza), m.nome, it(o.ore), o.operatore, o.note]; }))); }
  if (what === 'trattamenti') { const ev = S.eventi.filter(e => (e.tipo === 'Trattamento sanitario' || e.tipo === 'Vaccinazione') && yearOf(e.data) === y).sort(byDate); download(`registro-trattamenti-${y}.csv`, csv(['Data', 'Matricola', 'Nome', 'Tipo', 'Farmaco', 'Diagnosi', 'Quantità', 'Sosp. latte gg', 'Fine sosp. latte', 'Sosp. carne gg', 'Fine sosp. carne', 'Ricetta', 'Veterinario', 'Note'], ev.map(e => { const c = get('capi', e.capoId) || {}, p = get('prodotti', e.prodottoId); return [e.data, c.matricola, c.nome, e.tipo, p ? p.nome : e.farmaco, e.motivo, it(e.quantita), it(e.sospLatte), N(e.sospLatte) ? addDays(e.data, N(e.sospLatte)) : '', it(e.sospCarne), N(e.sospCarne) ? addDays(e.data, N(e.sospCarne)) : '', e.ricetta, e.veterinario, e.note]; }))); }
  if (what === 'latte') { const L = D.latte.filter(l => yearOf(l.data) === y); download(`latte-${y}.csv`, csv(['Data', 'Vacche', 'Litri prodotti', 'Litri conferiti', 'Litri scartati', 'Prezzo €/l', 'Grasso %', 'Proteine %', 'Cellule', 'CBT', 'Note'], L.map(l => [l.data, it(l.vacche), it(l.litri), it(l.conferiti), it(l.scartati), it(l.prezzo), it(l.grasso), it(l.proteine), it(l.cellule), it(l.cbt), l.note]))); }
  if (what === 'movimenti') { const mv = S.movimenti.filter(m => yearOf(m.data) === y).sort(byDate); download(`movimenti-magazzino-${y}.csv`, csv(['Data', 'Prodotto', 'Categoria', 'Tipo', 'Quantità', 'Unità', 'Prezzo', 'Documento', 'Note'], mv.map(m => { const p = get('prodotti', m.prodottoId) || {}; return [m.data, p.nome, p.categoria, m.tipo, it(m.quantita), p.unita, it(m.prezzo), m.documento, m.note]; }))); }
  toast('File pronto');
}

async function razScarico(id) {
  const r = get('razioni', id); if (!r) return; const i = razioneInfo(r);
  for (const x of i.ing) if (x.p && x.kgTot > 0) await store.put('movimenti', null, { data: today(), prodottoId: x.p.id, tipo: 'Scarico', quantita: Math.round(x.kgTot * 100) / 100, note: 'Razione ' + r.nome, razioneId: r.id });
  toast('Scarico della razione registrato');
}
async function restore(file) {
  try {
    const o = JSON.parse(await file.text()); const rows = [];
    COLS.forEach(c => (o[c] || []).forEach(x => { if (x && x.id) { const { id, ...data } = x; rows.push({ col: c, id, data }); } }));
    if (!rows.length) throw new Error('Il file non contiene dati di Campo e Stalla.');
    await store.bulkPut(rows); toast('Caricate ' + rows.length + ' registrazioni');
  } catch (e) { toast(e.message || 'File non valido', 'err'); }
}
async function delExamples() {
  const order = ['movimenti', 'operazioni', 'eventi', 'latte', 'razioni', 'note', 'manutenzioni', 'capi', 'campi', 'prodotti', 'mezzi'];
  for (const c of order) for (const x of S[c].filter(x => x.esempio)) await store.remove(c, x.id);
  toast('Dati di esempio eliminati');
}
async function markDone(id) {
  const o = get('operazioni', id); if (!o) return;
  const { SPEC } = await import('./forms.js');
  await SPEC.operazioni.save(id, Object.assign({}, o, { stato: 'Fatto', data: o.data > today() ? today() : o.data }));
  toast('Attività segnata come fatta');
}

/* ---------- clic ---------- */
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-act]');
  if (!b) {
    if (e.target.id === 'sheet') closeSheet();
    if (!e.target.closest('#layerMenu,[data-act=mapLayers]')) { const m = $('#layerMenu'); if (m) m.hidden = true; }
    if (!e.target.closest('.mapsearch')) { const r = $('#mapResults'); if (r) r.hidden = true; }
    return;
  }
  const a = b.dataset.act; const d = b.dataset;
  if (b.tagName === 'INPUT' && (b.type === 'checkbox' || b.type === 'radio' || b.type === 'file')) return;
  try {
    switch (a) {
      case 'menu': return drawer(true);
      case 'drawerClose': return drawer(false);
      case 'nav': case 'tab': return setTab(d.tab, d.sub);
      case 'area': UI.area = d.area; saveUI(); return setTab(d.area === 'stalla' ? 'oggi' : 'oggi');
      case 'sub': if (d.tab && UI.tab !== d.tab) { UI.tab = d.tab; UI.detail = null; UI.hist = []; } UI.sub[d.sec] = d.sub; saveUI(); render(); return window.scrollTo(0, 0);
      case 'open': if (sheetOpen()) closeSheet(); return openDetail(d.type, d.id);
      case 'go': { const g = JSON.parse(d.go); if (g.form) return openEdit(g.form); if (g.edit) return openEdit(g.edit, g.id); return openDetail(g.type, g.id); }
      case 'back': return history.state && history.state.d ? history.back() : goBack();
      case 'new': { if (d.form === 'operazioni') return startWizard({ campoId: d.campo, tipo: d.tipo, stato: d.stato }); const pre = {}; if (d.campo) pre.campoId = d.campo; if (d.capo) pre.capoId = d.capo; if (d.tipo) pre.tipo = d.tipo; if (d.prodotto) pre.prodottoId = d.prodotto; if (d.mezzo) pre.mezzoId = d.mezzo; return openEdit(d.form, null, pre); }
      case 'edit': return openEdit(d.form, d.id);
      case 'coltura': return openColtura(d.id, d.anno ? +d.anno : null);
      case 'done': b.disabled = true; return markDone(d.id);
      case 'quick': return quickSheet();
      case 'quickgo': return quickGo(d.k);
      case 'search': return searchSheet();
      case 'close': return closeSheet();
      case 'chip': UI.f[d.f] = d.v; return render();
      case 'view': UI.view = d.v; saveUI(); return render();
      case 'collapse': { const k = 'c_' + d.k; UI.f[k] = !UI.f[k]; return render(); }
      case 'export': return doExport(d.what);
      case 'exportSheet': return exportSheet();
      case 'razScarico': b.disabled = true; return razScarico(d.id);
      case 'formdel': return formDelete(b);
      case 'lineAdd': return addLine(d.k);
      case 'lineDel': { const l = b.closest('.line'); if (l.parentElement.children.length > 1) l.remove(); else { l.querySelector('select').value = ''; l.querySelector('input').value = ''; } return; }
      case 'copy': try { await navigator.clipboard.writeText(d.txt); toast('Copiato'); } catch (err) { toast(d.txt); } return;
      case 'install': drawer(false); return promptInstall();
      case 'loadExamples': await store.bulkPut(exampleRows()); toast('Dati di esempio caricati'); return setTab('oggi');
      case 'delExamples': return arm(b, 'Conferma: elimina gli esempi', delExamples);
      case 'backup': { const o = await store.exportAll(); download(`campo-e-stalla-${today()}.json`, JSON.stringify(o), 'application/json'); return; }
      case 'wipe': return arm(b, 'Conferma: cancella tutto da questo dispositivo', () => store.wipeLocal());
      case 'syncNow': return store.syncNow();
      case 'syncTile': if (sync.farm) { store.syncNow(); toast('Sincronizzazione avviata'); return drawer(false); } return setTab('impostazioni');
      case 'signOut': await store.signOut(); toast('Disconnesso'); return render();
      case 'leaveFarm': return arm(b, 'Conferma: scollega', async () => { await store.leaveFarm(); toast('Dispositivo scollegato dall\'azienda'); render(); });
      case 'removeMember': return arm(b, 'Conferma', async () => { await store.removeMember(d.id); toast('Persona rimossa'); });
      case 'newCode': return arm(b, 'Conferma: nuovo codice', async () => { try { await store.newJoinCode(); toast('Nuovo codice creato: quello vecchio non funziona più'); } catch (err) { toast(traduci(err), 'err'); } });
      case 'resetPw': { const em = $('#au_email').value.trim(); if (!em) return toast('Scrivi prima la tua email', 'err'); await store.resetPassword(em); return toast('Ti ho inviato una mail per reimpostare la password'); }
      case 'cloudForget': return store.setCloudConfig('');
      case 'gpsAzienda': return gpsAzienda();
      // mappa
      case 'mapDraw': return MAP.startDraw(d.id || null);
      case 'mapEdit': return MAP.startEdit(d.id);
      case 'mapSaveEdit': return MAP.saveEdit();
      case 'mapCancel': return MAP.endMode();
      case 'mapUndo': return MAP.undoPoint();
      case 'mapDeselect': return MAP.select(null);
      case 'mapLayers': return MAP.layersPanel();
      case 'mapApply': return MAP.applyPanel();
      case 'mapFx': return MAP.fxPanel();
      case 'fxDone': return MAP.fxDone();
      case 'fxReset': return MAP.fxReset();
      case 'mapLegend': return MAP.toggleLegend();
      case 'mapPlus': return MAP.plusMenu();
      case 'mapNoteHere': return MAP.noteHere();
      case 'mapLocate': return MAP.locate();
      case 'mapFit': return MAP.fitAll();
      case 'mapGo': return MAP.goPlace(b);
      case 'catClose': return MAP.closeCat();
      case 'catAssign': return MAP.assignCatasto(d.txt, d.comune);
      case 'mapNote': return MAP.noteForField(d.id);
      case 'mapFocus': setTab('mappa'); return setTimeout(() => MAP.focusCampo(d.id), 250);
    }
  } catch (err) { console.warn(err); toast(err.message || 'Operazione non riuscita', 'err'); }
});

document.addEventListener('change', e => {
  const t = e.target;
  if (t.id === 'yearSel') { UI.anno = Number(t.value); return render(); }
  if (t.dataset.filter && t.tagName === 'SELECT') { UI.f[t.dataset.filter] = t.value; return render(); }
  if (t.dataset.act === 'mapImport' && t.files[0]) { MAP.importFile(t.files[0]); t.value = ''; return; }
  if (t.dataset.act === 'restore' && t.files[0]) { restore(t.files[0]); t.value = ''; return; }
  if (t.dataset.act === 'authTab') { authUI.tab = t.value; return render(); }
  if (t.dataset.act === 'view') { UI.view = t.dataset.v; saveUI(); return render(); }
});
document.addEventListener('input', e => {
  const t = e.target;
  if (t.dataset.filter && t.tagName === 'INPUT') { UI.f[t.dataset.filter] = t.value; render(); }
  if (t.id === 'mapSearch') searchSoon(t.value);
  if (t.id === 'gq') searchRun(t.value);
});
const searchSoon = debounce(q => MAP.searchPlace(q), 450);
document.addEventListener('keydown', e => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.getAttribute && e.target.getAttribute('role') === 'button' && e.target.dataset.act) { e.preventDefault(); e.target.click(); return; }
  if (e.key === 'Escape') { if (sheetOpen()) closeSheet(); else if (document.body.classList.contains('drawer-open')) drawer(false); else if (UI.tab === 'mappa') MAP.endMode(); }
  if (e.key === 'Enter' && e.target.id === 'mapSearch') { e.preventDefault(); MAP.searchPlace(e.target.value); }
});

/* ---------- moduli nelle impostazioni ---------- */
document.addEventListener('submit', async e => {
  const f = e.target; const k = f.dataset.formAct; if (!k) return; e.preventDefault();
  const btn = f.querySelector('[type=submit]'); if (btn) btn.disabled = true;
  try {
    if (k === 'azienda') { const a = azienda(); await store.put('config', 'azienda', Object.assign({}, a, { nome: $('#az_nome').value.trim(), asl: $('#az_asl').value.trim(), iva: $('#az_iva').value.trim(), indirizzo: ($('#az_ind') || {}).value?.trim?.() || a.indirizzo || '', lat: $('#az_lat').value.trim().replace(',', '.'), lon: $('#az_lon').value.trim().replace(',', '.'), ettari: ($('#az_ha') || {}).value ? N($('#az_ha').value) : a.ettari || null })); toast('Dati aziendali salvati'); }
    if (k === 'gkey') { const a = azienda(); await store.put('config', 'azienda', Object.assign({}, a, { gkey: $('#az_gkey').value.trim() })); try { localStorage.removeItem('ces.gses'); } catch (e) { } toast($('#az_gkey').value.trim() ? 'Chiave salvata: scegli "Google" in Livelli mappa' : 'Chiave rimossa'); }
    if (k === 'cloudCfg') { const u = $('#cfg_url').value.trim(), key = $('#cfg_key').value.trim(); if (!/^https:\/\/.+/.test(u) || key.length < 20) throw new Error('Controlla URL e chiave: li trovi in Supabase → Project Settings → API.'); store.setCloudConfig(u, key); }
    if (k === 'login') { await store.signIn($('#au_email').value.trim(), $('#au_pw').value); toast('Accesso eseguito'); }
    if (k === 'signup') { const r = await store.signUp($('#au_email').value.trim(), $('#au_pw').value); toast(r && r.session ? 'Account creato' : 'Account creato: conferma dalla mail che ti ho inviato, poi accedi.'); authUI.tab = 'login'; }
    if (k === 'createFarm') { await store.createFarm($('#farm_name').value.trim()); const a = azienda(); if (!a.nome) await store.put('config', 'azienda', Object.assign({}, a, { nome: sync.farm.name })); toast('Azienda creata: i dati sono online'); }
    if (k === 'joinFarm') { await store.joinFarm($('#farm_code').value.trim()); toast('Sei entrato nell\'azienda ' + sync.farm.name); }
  } catch (err) { toast(traduci(err), 'err'); }
  if (btn && btn.isConnected) btn.disabled = false; render();
});
function traduci(err) {
  const m = (err && err.message) || String(err);
  if (/Invalid login credentials/i.test(m)) return 'Email o password non corretti.';
  if (/Email not confirmed/i.test(m)) return 'Conferma prima l\'indirizzo email dalla mail ricevuta.';
  if (/already registered/i.test(m)) return 'Esiste già un account con questa email: accedi.';
  if (/Password should be/i.test(m)) return 'La password deve avere almeno 6 caratteri.';
  if (/Failed to fetch|NetworkError/i.test(m)) return 'Nessuna connessione con il server.';
  return m;
}
function gpsAzienda() {
  if (!navigator.geolocation) return toast('Posizione non disponibile su questo dispositivo', 'err');
  navigator.geolocation.getCurrentPosition(p => { $('#az_lat').value = p.coords.latitude.toFixed(5); $('#az_lon').value = p.coords.longitude.toFixed(5); toast('Posizione rilevata: ricordati di salvare'); }, () => toast('Consenti l\'accesso alla posizione', 'err'), { enableHighAccuracy: true, timeout: 15000 });
}

/* ---------- avvio ---------- */
(function boot() {
  $('#mapControls').innerHTML = `
    <div class="mapsearch">${ic('search')}<input id="mapSearch" placeholder="Cerca comune, località o coordinate" autocomplete="off" enterkeyhint="search"><div id="mapResults" class="map-results" hidden></div></div>
    <div id="mapWeather" class="map-weather" hidden></div>
    <div class="map-tools"><button class="mtool" data-act="mapDraw" aria-label="Disegna un campo" title="Disegna un campo">${ic('pentagon')}</button><button class="mtool" data-act="mapLayers" aria-label="Livelli mappa" title="Livelli mappa">${ic('layers')}</button><button class="mtool" data-act="mapLocate" aria-label="La mia posizione" title="La mia posizione">${ic('navigation')}</button><button class="mtool" data-act="mapFit" aria-label="Mostra tutti i campi" title="Mostra tutti i campi">${ic('scan-search')}</button><label class="mtool" aria-label="Importa KML o GeoJSON" title="Importa confini da KML, GeoJSON o shapefile">${ic('file-up')}<input type="file" accept=".kml,.geojson,.json,.zip,.shp,application/vnd.google-earth.kml+xml,application/geo+json,application/zip" data-act="mapImport" hidden></label></div>
    <div id="catHint" class="cat-hint" hidden>${ic('grid-2x2')}Avvicinati per vedere le particelle</div>
    <button class="legend-btn" data-act="mapLegend">Legenda ${ic('chevron-left', 'rot')}</button>
    <div id="mapLegend" class="map-legend" hidden></div>
    <button class="map-plus" data-act="mapPlus" aria-label="Aggiungi">${ic('plus')}</button>
    <div id="mapBar" class="map-bar" hidden></div>
    <div id="fxPanel" class="fx-panel" hidden></div>
    <div id="catCard" class="cat-card" hidden></div>
    <div id="mapCard" class="map-card" hidden></div>`;
  const h = (location.hash || '').slice(1); if (VIEWS[h] || h === 'mappa') UI.tab = h;
  const q = new URLSearchParams(location.search).get('azione');
  render();
  store.initStore().then(() => { if (q === 'operazione') startWizard(); else if (q === 'latte') openEdit('latte'); else if (q === 'evento') openEdit('eventi'); });
  window.addEventListener('online', () => { syncPill(); schedule(); });
  window.addEventListener('offline', () => { syncPill(); schedule(); });
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('./sw.js').then(reg => {
      reg.addEventListener('updatefound', () => { const w = reg.installing; if (!w) return; w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) showUpdate(w); }); });
    }).catch(() => { });
    let reloaded = false; navigator.serviceWorker.addEventListener('controllerchange', () => { if (reloaded) return; reloaded = true; location.reload(); });
  }
})();
function showUpdate(worker) {
  const t = $('#toast'); t.innerHTML = ic('refresh-cw') + '<span>Nuova versione disponibile</span><button class="btn sm" id="updBtn">Aggiorna</button>'; t.className = 'toast show sticky'; t.hidden = false;
  $('#updBtn').onclick = () => worker.postMessage('skipWaiting');
}
