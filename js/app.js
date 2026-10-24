// Avvio, navigazione (menu laterale Campagna/Stalla) e azioni dell'app
import { S, UI, D, bus, get, azienda, COLS } from './state.js';
import { $, $$, esc, N, nf, fd, today, addDays, yearOf, byDate, byName, lsSet, debounce, sum } from './util.js';
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
import { stampaRegistro, registroJSON, registroHTML, righeTrattamenti, scarica } from './registro.js';
import { initFito, importFito, clearFito } from './fitodb.js';
import { parseLocal, parseAI, aiConfig, canDictate, dictate } from './nlp.js';
import { render as vOggi } from './views/oggi.js';
import { render as vCampi } from './views/campi.js';
import { render as vAtt } from './views/attivita.js';
import { render as vNote } from './views/note.js';
import { render as vMeteo } from './views/meteo.js';
import { render as vStalla } from './views/stalla.js';
import { render as vMag } from './views/magazzino.js';
import { render as vMezzi } from './views/mezzi.js';
import { moveSheet, misureImport } from './views/stalle.js';
import { render as vImp, authUI } from './views/impostazioni.js';
import { avviaBlocco, blocca, salvaBloccoDaForm, disattivaDaForm } from './lock.js';
import { render as vConti, onAct as contiAct, onChange as contiChange, onDrop as contiDrop, setRerender, contiVisibili, esportaTutto } from './views/conti.js';

const VIEWS = { oggi: vOggi, campi: vCampi, attivita: vAtt, note: vNote, meteo: vMeteo, stalla: vStalla, magazzino: vMag, mezzi: vMezzi, impostazioni: vImp, conti: vConti };
const TITLES = { oggi: 'Dashboard', mappa: 'Mappa', campi: 'Campi', attivita: 'Attività', note: 'Note', meteo: 'Meteo', stalla: 'Stalla', magazzino: 'Magazzino', mezzi: 'Mezzi', impostazioni: 'La mia azienda', conti: 'Conti' };
const YEARLY = new Set(['oggi', 'mappa', 'campi', 'attivita', 'stalla', 'magazzino', 'mezzi', 'conti']);
// Voci del menu: [tab, sub, icona, etichetta]
const MENU = {
  campagna: [
    ['Principale', [['oggi', null, 'house', 'Dashboard'], ['campi', 'elenco', 'sprout', 'Campi'], ['mappa', null, 'map', 'Mappa'], ['attivita', null, 'notebook-pen', 'Attività'], ['magazzino', 'prodotti', 'warehouse', 'Magazzino'], ['magazzino', 'movimenti', 'package', 'Carichi e scarichi']]],
    ['Agronomia', [['meteo', null, 'cloud-sun', 'Meteo'], ['campi', 'costi', 'euro', 'Costi e margini'], ['note', null, 'pencil', 'Note']]],
    ['Gestione', [['mezzi', null, 'tractor', 'Macchinari'], ['impostazioni', null, 'building-2', 'La mia azienda']]],
  ],
  stalla: [
    ['Principale', [['oggi', null, 'house', 'Dashboard'], ['stalla', 'mandria', 'cow', 'Mandria'], ['stalla', 'stalle', 'layout-grid', 'Stalle e silos'], ['stalla', 'indici', 'gauge', 'Indici e benessere'], ['stalla', 'riproduzione', 'heart-pulse', 'Riproduzione'], ['stalla', 'latte', 'milk', 'Latte']]],
    ['Alimentazione e salute', [['stalla', 'razioni', 'wheat', 'Razioni'], ['stalla', 'sanitario', 'syringe', 'Sanitario'], ['magazzino', 'prodotti', 'warehouse', 'Magazzino']]],
    ['Gestione', [['note', null, 'pencil', 'Note'], ['mezzi', null, 'tractor', 'Macchinari'], ['impostazioni', null, 'building-2', 'La mia azienda']]],
  ],
  conti: [
    ['Principale', [['conti', 'panoramica', 'layout-dashboard', 'Panoramica'], ['conti', 'fatture', 'receipt', 'Fatture'], ['conti', 'importa', 'file-up', 'Carica documenti']]],
    ['Acquisti e vendite', [['conti', 'fornitori', 'truck', 'Fornitori'], ['conti', 'clienti', 'handshake', 'Clienti'], ['conti', 'prodotti', 'package', 'Prodotti e prezzi'], ['conti', 'categorie', 'tags', 'Categorie'], ['conti', 'mensile', 'calendar-range', 'Andamento mensile'], ['conti', 'latte', 'milk', 'Latte venduto']]],
    ['Bilancio', [['conti', 'ce', 'scale', 'Conto economico'], ['conti', 'sp', 'landmark', 'Stato patrimoniale'], ['conti', 'indici', 'gauge', 'Indici di bilancio'], ['conti', 'analisi', 'cow', 'Analisi della stalla'], ['conti', 'iva', 'percent', 'Dichiarazioni IVA'], ['conti', 'cespiti', 'tractor', 'Cespiti'], ['conti', 'controlli', 'shield-check', 'Controlli']]],
    ['Personale', [['conti', 'personale', 'users', 'Riepilogo del personale'], ['conti', 'dipendenti', 'id-card', 'Dipendenti'], ['conti', 'cedolini', 'file-text', 'Cedolini e bilancini paghe'], ['conti', 'pagamenti', 'banknote', 'Pagamenti'], ['conti', 'prestiti', 'hand-coins', 'Anticipi e prestiti'], ['conti', 'verifica', 'shield-check', 'Verifica pagamenti']]],
    ['Gestione', [['conti', 'regole', 'list-checks', 'Regole delle categorie'], ['impostazioni', null, 'building-2', 'La mia azienda']]],
  ],
};
const TAB_OF = { campo: 'campi', capo: 'stalla', prodotto: 'magazzino', mezzo: 'mezzi', struttura: 'stalla' };
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
  const aree = [['campagna', 'sprout', 'Campagna'], ['stalla', 'cow', 'Stalla'], ...(contiVisibili() ? [['conti', 'wallet', 'Conti']] : [])];
  const sottotitolo = UI.area === 'stalla' ? S.capi.filter(c => capoI(c).stato !== 'Uscita').length + ' capi · Stalla' : UI.area === 'conti' ? S.fatture.length + ' fatture · Conti' : nf(ha, 2) + ' ha · Campagna';
  return `<div class="dr-head"><img src="icons/icon-192.png" alt="" width="44" height="44"><div><b>${esc(a.nome || (sync.farm && sync.farm.name) || 'La tua azienda')}</b><span>${sottotitolo}</span></div></div>
  <button class="dr-user" data-act="nav" data-tab="impostazioni"><span class="dr-av">${ic(sync.user ? 'user' : si.icn)}</span><span><b>${esc(sync.user ? sync.user.email : 'Nessun account')}</b><small class="${si.cls}">${esc(si.t)}</small></span>${ic('chevron-right', 'chev')}</button>
  <div class="dr-tiles"><button data-act="syncTile">${ic('refresh-cw')}<span>Sincronizza</span></button><button data-act="nav" data-tab="oggi">${ic('triangle-alert')}<span>Avvisi</span>${nAl ? `<i class="badge">${nAl}</i>` : ''}</button><button data-act="exportSheet">${ic('download')}<span>Esporta</span></button></div>
  <nav class="dr-nav">${MENU[UI.area].map(([sec, items]) => `<div class="dr-sec">${esc(sec)}</div>` + items.map(([t, s, i, l]) => `<button class="dr-i" data-act="nav" data-tab="${t}"${s ? ` data-sub="${s}"` : ''} aria-current="${isCur(t, s) && !(t === 'magazzino' && !s) ? 'page' : 'false'}">${ic(i)}<span>${esc(l)}</span></button>`).join('')).join('')}
  ${canInstall() ? `<button class="dr-i" data-act="install">${ic('smartphone')}<span>Installa l'app</span></button>` : ''}</nav>
  <nav class="dr-areas" aria-label="Area">${aree.map(([k, i, l]) => `<button data-act="area" data-area="${k}" aria-current="${UI.area === k}">${ic(i)}<span>${l}</span></button>`).join('')}</nav>`;
}

// Barra in basso sul telefono, con il pulsante Registra al centro
const BNAV = {
  campagna: [['oggi', null, 'house', 'Home'], ['mappa', null, 'map', 'Mappa'], null, ['attivita', null, 'notebook-pen', 'Attività'], ['campi', 'elenco', 'sprout', 'Campi']],
  stalla: [['oggi', null, 'house', 'Home'], ['stalla', 'mandria', 'cow', 'Mandria'], null, ['stalla', 'latte', 'milk', 'Latte'], ['stalla', 'stalle', 'layout-grid', 'Stalle']],
  conti: [['conti', 'panoramica', 'layout-dashboard', 'Home'], ['conti', 'fatture', 'receipt', 'Fatture'], null, ['conti', 'ce', 'scale', 'Bilancio'], ['conti', 'analisi', 'gauge', 'Analisi']],
};
function bnavHTML() {
  return BNAV[UI.area].map(x => x ? `<button data-act="nav" data-tab="${x[0]}"${x[1] ? ` data-sub="${x[1]}"` : ''} aria-current="${!UI.detail && isCur(x[0], x[1]) ? 'page' : 'false'}">${ic(x[2])}<span>${x[3]}</span></button>` : `<button class="bn-plus" data-act="quick" aria-label="Registra"><span>${ic('plus')}</span></button>`).join('');
}
function render() {
  derive();
  if (UI.area === 'conti' && (!contiVisibili() || !['conti', 'impostazioni'].includes(UI.tab))) { if (!contiVisibili()) UI.area = 'campagna'; else UI.tab = 'conti'; }
  if (UI.area !== 'conti' && UI.tab === 'conti') UI.area = 'conti';
  document.body.dataset.area = UI.area;
  $('#drawer').innerHTML = drawerHTML();
  $('#bnav').innerHTML = bnavHTML();
  syncPill();
  const years = new Set([new Date().getFullYear(), UI.anno]); S.operazioni.forEach(o => { const y = yearOf(o.data); if (y) years.add(y); }); S.eventi.forEach(o => { const y = yearOf(o.data); if (y) years.add(y); }); if (UI.tab === 'conti') { S.fatture.forEach(o => { const y = yearOf(o.data); if (y) years.add(y); }); S.bilanci.forEach(b => { if (+b.id) years.add(+b.id); }); S.paghe.forEach(p => { if (+p.anno) years.add(+p.anno); }); const cy = new Date().getFullYear(); for (let y = Math.min(cy - 4, ...years); y <= cy; y++) years.add(y); }
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
  const t = UI.detail || UI.tab === 'conti' ? r.title : (UI.tab === 'oggi' && UI.area === 'stalla' ? 'Stalla' : TITLES[UI.tab] || r.title);
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
  if (UI.area === 'conti') { setTab('conti', 'importa'); return; }
  const Q = UI.area === 'stalla'
    ? [['ev', 'cow', 'Evento di stalla', 'Parto, fecondazione, diagnosi'], ['tr', 'syringe', 'Trattamento', 'Farmaco e sospensioni'], ['latte', 'milk', 'Latte del giorno', 'Litri e qualità'], ['capo', 'baby', 'Nuovo capo', 'Acquisto o nascita'], ['carico', 'download', 'Carico magazzino', 'Mangimi, farmaci'], ['nota', 'pencil', 'Nota', 'Promemoria e osservazioni']]
    : [['att', 'notebook-pen', 'Nuova attività', 'Su uno o più campi'], ['plan', 'calendar', 'Pianifica attività', 'Da fare nei prossimi giorni'], ['campo', 'pentagon', 'Nuovo campo', 'Disegnalo sulla mappa'], ['carico', 'download', 'Carico magazzino', 'Merce arrivata'], ['nota', 'pencil', 'Nota', 'Promemoria e osservazioni'], ['man', 'wrench', 'Manutenzione', 'Tagliando, riparazione']];
  const ph = UI.area === 'stalla' ? 'Es. "Stella fecondata oggi con toro Alfa" oppure "munti 2.300 litri"' : 'Es. "ieri diserbo su Pradone con Erbicida 1,5 l/ha, Marco"';
  openSheet('Registra', `<form class="nl-bar" id="nlForm"><span class="nl-ic">${ic('sparkles')}</span><textarea id="nlText" rows="1" placeholder="${esc(ph)}" enterkeyhint="send"></textarea>${canDictate() ? `<button type="button" class="iconbtn nl-mic" id="nlMic" aria-label="Detta">${ic('mic')}</button>` : ''}<button type="submit" class="iconbtn nl-go" aria-label="Interpreta">${ic('send')}</button></form>
  <div id="nlOut"></div><p class="nl-tip muted small">${aiConfig() ? 'Interpretazione con Claude attiva.' : 'Scrivi o detta cosa hai fatto: lo trasformo in una registrazione da controllare.'}</p>
  <div class="quick">${Q.map(q => `<button data-act="quickgo" data-k="${q[0]}"><span class="q-ic">${ic(q[1])}</span><b>${q[2]}</b><span>${q[3]}</span></button>`).join('')}</div>`);
  const f = $('#nlForm'), ta = $('#nlText'), mic = $('#nlMic');
  const grow = () => { ta.style.height = 'auto'; ta.style.height = Math.min(140, ta.scrollHeight) + 'px'; };
  ta.addEventListener('input', grow);
  ta.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); f.requestSubmit(); } });
  f.addEventListener('submit', e => { e.preventDefault(); interpreta(ta.value); });
  if (mic) mic.onclick = () => { const on = dictate((txt, fin) => { ta.value = txt; grow(); if (fin) interpreta(txt); }, () => mic.classList.remove('on')); mic.classList.toggle('on', on); };
}
let nlLast = null;
async function interpreta(text) {
  const out = $('#nlOut'); if (!out || !text.trim()) return;
  out.innerHTML = `<div class="nl-res busy"><span class="spinner"></span>Interpreto…</div>`;
  let r = null, aiErr = '';
  if (aiConfig()) { try { r = await parseAI(text); } catch (e) { aiErr = e.message; } }
  if (!r) r = parseLocal(text);
  nlLast = r; if (!$('#nlOut')) return;
  const v = r.values; const lines = [];
  const g = (c, id) => (get(c, id) || {});
  if (r.kind === 'latte') { lines.push(['milk', 'Latte del ' + fd(v.data), nf(v.litri, 0) + ' litri' + (v.conferiti ? ' · ' + nf(v.conferiti, 0) + ' conferiti' : '') + (v.vacche ? ' · ' + v.vacche + ' vacche' : '')]); }
  else if (r.kind === 'evento') { const c = g('capi', v.capoId); lines.push(['cow', v.tipo + ' · ' + (c.nome || c.matricola || ''), fd(v.data) + (v.esito ? ' · ' + v.esito : '') + (v.toro ? ' · toro ' + v.toro : '') + (v.motivo ? ' · ' + v.motivo : '')]); }
  else {
    const campi = (r.campi || []).map(id => g('campi', id).nome).filter(Boolean); const p = g('prodotti', v.prodottoId);
    lines.push(['notebook-pen', (v.tipo || 'Attività da scegliere') + (v.stato === 'Pianificata' ? ' (da fare)' : ''), fd(v.data) + (campi.length ? ' · ' + campi.join(', ') : '')]);
    if (p.nome) lines.push(['package', p.nome, [v.dose ? nf(v.dose, 3) + ' ' + (p.unita || '') + '/ha' : '', v.quantita ? nf(v.quantita, 2) + ' ' + (p.unita || '') + ' in tutto' : ''].filter(Boolean).join(' · ') || 'dose da indicare']);
    const ex = [v.avversita ? 'contro ' + v.avversita : '', v.operatore ? 'operatore ' + v.operatore : '', v.mezzoId ? g('mezzi', v.mezzoId).nome : '', v.ore ? nf(v.ore, 1) + ' ore' : '', v.raccolto ? nf(v.raccolto, 2) + ' t raccolte' : '', v.vento ? 'vento ' + v.vento.toLowerCase() : ''].filter(Boolean);
    if (ex.length) lines.push(['clipboard-list', 'Dettagli', ex.join(' · ')]);
  }
  const miss = r.capire || [];
  out.innerHTML = `<div class="nl-res"><div class="nl-h">${ic(r.ai ? 'sparkles' : 'circle-check')}<b>Ho capito così</b>${r.ai ? '<span class="chip info">Claude</span>' : ''}</div>${lines.map(([i, t, s]) => `<div class="nl-line">${ic(i)}<span><b>${esc(t)}</b><small>${esc(s)}</small></span></div>`).join('')}${miss.length ? `<p class="nl-miss">${ic('circle-alert')}Manca: ${esc(miss.join(', '))}. Lo scegli nel passo successivo.</p>` : ''}${aiErr ? `<p class="nl-miss">${ic('info')}${esc(aiErr)}: uso l'interprete locale.</p>` : ''}<div class="btns"><button class="btn action" data-act="nlApply">${ic('check')}Apri e controlla</button></div></div>`;
}
function nlApply() {
  const r = nlLast; if (!r) return; closeSheet();
  setTimeout(() => {
    if (r.kind === 'latte') return openEdit('latte', null, r.values);
    if (r.kind === 'evento') return openEdit('eventi', null, r.values);
    const { tipo, stato, ...rest } = r.values;
    startWizard({ tipo, stato, campi: r.campi, values: rest });
  }, 230);
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

/* ---------- ricerca e comandi rapidi (Ctrl+K o "/") ---------- */
const AZIONI = [
  ['att', 'notebook-pen', 'Nuova attività', 'campagna'], ['plan', 'calendar', 'Pianifica attività', 'campagna'], ['campo', 'pentagon', 'Nuovo campo', 'campagna'],
  ['carico', 'download', 'Carico magazzino', 'tutte'], ['nota', 'pencil', 'Nuova nota', 'tutte'], ['man', 'wrench', 'Manutenzione', 'campagna'],
  ['ev', 'cow', 'Evento di stalla', 'stalla'], ['tr', 'syringe', 'Trattamento sanitario', 'stalla'], ['latte', 'milk', 'Latte del giorno', 'stalla'], ['capo', 'baby', 'Nuovo capo', 'stalla'],
];
const norm = x => String(x || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
function comandi() {
  const pag = []; const seen = new Set();
  Object.entries(MENU).forEach(([area, secs]) => { if (area === 'conti' && !contiVisibili()) return; secs.forEach(([, items]) => items.forEach(([t, sb, i, l]) => { const k = area + t + sb; if (seen.has(k)) return; seen.add(k); pag.push({ kind: 'pag', area, t, sb, i, l }); })); });
  return [...AZIONI.map(([k, i, l, area]) => ({ kind: 'az', k, i, l, area })), ...pag];
}
const AREA_L = { campagna: 'Campagna', stalla: 'Stalla', conti: 'Conti', tutte: '' };
function cmdRow(c) {
  if (c.kind === 'az') return `<button class="row cmd" data-act="cmdAz" data-k="${c.k}" data-area="${c.area}"><span class="r-icon act">${ic(c.i)}</span><span class="r-main"><b>${esc(c.l)}</b><span>Registra${AREA_L[c.area] ? ' · ' + AREA_L[c.area] : ''}</span></span>${ic('plus', 'chev')}</button>`;
  return `<button class="row cmd" data-act="cmdPag" data-area="${c.area}" data-tab="${c.t}"${c.sb ? ` data-sub="${c.sb}"` : ''}><span class="r-icon">${ic(c.i)}</span><span class="r-main"><b>${esc(c.l)}</b><span>Vai a · ${AREA_L[c.area]}</span></span>${ic('chevron-right', 'chev')}</button>`;
}
function searchSheet() {
  openSheet('Cerca', `<div class="search big">${ic('search')}<input class="inp" id="gq" placeholder="Campi, capi, prodotti… oppure un comando" autocomplete="off" enterkeyhint="search"></div><div id="gres" class="list flat"></div><p class="kbd-tip muted small">${ic('keyboard')}<span><kbd>Ctrl</kbd>+<kbd>K</kbd> o <kbd>/</kbd> cerca · <kbd>N</kbd> registra · <kbd>Invio</kbd> apre il primo risultato</span></p>`);
  searchRun('');
  setTimeout(() => { const i = $('#gq'); if (i) i.focus(); }, 80);
}
function searchRun(q) {
  const out = $('#gres'); if (!out) return;
  const qn = norm(q.trim());
  if (qn.length < 2) {
    const az = comandi().filter(c => c.kind === 'az' && (c.area === UI.area || c.area === 'tutte')).slice(0, 6);
    out.innerHTML = `<div class="dr-sec left">Azioni rapide</div>${az.map(cmdRow).join('')}`; return;
  }
  const hit = (s) => norm(s).includes(qn);
  const cmd = comandi().filter(c => hit(c.l)).sort((a, b) => (b.area === UI.area) - (a.area === UI.area)).slice(0, 6);
  const rows = [
    ...S.campi.filter(c => hit(c.nome) || hit(cropOf(c)) || hit(c.catasto)).map(c => ['campo', c.id, 'sprout', c.nome, cropOf(c) + ' · ' + nf(campoHa(c), 2) + ' ha']),
    ...S.capi.filter(c => hit(c.nome) || hit(c.matricola)).map(c => ['capo', c.id, 'cow', c.nome || c.matricola, c.matricola]),
    ...S.prodotti.filter(p => hit(p.nome) || hit(p.nReg)).map(p => ['prodotto', p.id, 'package', p.nome, p.categoria]),
    ...S.mezzi.filter(m => hit(m.nome) || hit(m.targa)).map(m => ['mezzo', m.id, 'tractor', m.nome, m.tipo]),
    ...S.note.filter(n => hit(n.titolo) || hit(n.testo)).map(n => ['nota', n.id, 'pencil', n.titolo, (n.testo || '').slice(0, 60)]),
    ...(contiVisibili() ? S.fatture.filter(f => hit(f.controparte) || hit(f.numero)).slice(0, 15).map(f => ['fattura', f.id, 'receipt', f.controparte + ' n. ' + f.numero, fd(f.data) + ' · ' + (f.tipo === 'Vendita' ? 'vendita' : 'acquisto')]) : []),
  ].slice(0, 40);
  const dati = rows.map(([t, id, i, l, s]) => `<button class="row" data-act="${t === 'nota' ? 'edit' : t === 'fattura' ? 'c-fatt' : 'open'}" ${t === 'nota' ? `data-form="note" data-id="${id}"` : `data-type="${t}" data-id="${id}"`}><span class="r-icon">${ic(i)}</span><span class="r-main"><b>${esc(l)}</b><span>${esc(s || '')}</span></span>${ic('chevron-right', 'chev')}</button>`).join('');
  out.innerHTML = (rows.length ? `<div class="dr-sec left">Dati</div>${dati}` : '') + (cmd.length ? `<div class="dr-sec left">Comandi</div>${cmd.map(cmdRow).join('')}` : '') || '<div class="empty slim">Nessun risultato.</div>';
}

/* ---------- esportazioni ---------- */
function download(name, text, type = 'text/csv;charset=utf-8') {
  const b = new Blob([text], { type }); const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href = u; a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(u); a.remove(); }, 1000);
}
const csv = (head, rows) => '﻿' + [head, ...rows].map(r => r.map(x => { const s = String(x ?? ''); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(';')).join('\r\n');
const it = n => n === null || n === undefined || n === '' ? '' : String(n).replace('.', ',');
function exportSheet() {
  drawer(false);
  openSheet('Esporta documenti', `<p class="muted">Registri e file dell'annata ${UI.anno}: il PDF si ottiene dalla stampa, i CSV si aprono con Excel.</p><div class="list flat">${[['registro', 'printer', 'Quaderno di campagna (stampa o PDF)', 'Appezzamenti, registro trattamenti, concimazioni, acquisti, giacenze, operatori'], ['registroJson', 'file-text', 'Registro trattamenti in formato dati (JSON)', 'Un record per trattamento con tutti i campi richiesti dal registro elettronico'], ['quaderno', 'file-spreadsheet', 'Quaderno di campagna (CSV)', 'Tutte le operazioni con prodotto, dose, avversità e carenza'], ['trattamenti', 'syringe', 'Registro trattamenti di stalla', 'Farmaci, ricette e fine delle sospensioni'], ['latte', 'milk', 'Registro del latte', 'Litri, conferiti, analisi'], ['movimenti', 'warehouse', 'Movimenti di magazzino', 'Carichi e scarichi'], ...(contiVisibili() ? [['contiAll', 'file-spreadsheet', `Conti ${UI.anno} in Excel`, 'Conto economico, stato patrimoniale, indici, analisi della stalla, IVA, cespiti, fatture e righe']] : []), ['backup', 'history', 'Copia di sicurezza completa', 'Tutti i dati in un file JSON']].map(([k, i, l, s]) => `<button class="row" data-act="${k === 'backup' ? 'backup' : k === 'contiAll' ? 'c-expAll' : 'export'}" data-what="${k}"><span class="r-icon">${ic(i)}</span><span class="r-main"><b>${l}</b><span>${s}</span></span>${ic('download', 'chev')}</button>`).join('')}</div>`);
}
function doExport(what) {
  const y = UI.anno;
  if (what === 'registro') { stampaRegistro(y); closeSheet(); return; }
  if (what === 'registroHtml') { scarica(`quaderno-campagna-${y}.html`, registroHTML(y), 'text/html'); return; }
  if (what === 'registroJson') { download(`registro-trattamenti-${y}.json`, JSON.stringify(registroJSON(y), null, 2), 'application/json'); toast('File pronto'); return; }
  if (what === 'quaderno') { const ops = S.operazioni.filter(o => yearOf(o.data) === y && o.stato !== 'Pianificata').sort(byDate); const car = new Map(righeTrattamenti(y).map(r => [r.o.id, r])); download(`quaderno-campagna-${y}.csv`, csv(['Data', 'Ora', 'Appezzamento', 'Superficie ha', 'Coltura', 'Catasto', 'Operazione', 'Prodotto', 'N. registrazione', 'Sostanze attive', 'Dose/ha', 'Quantità', 'Unità', 'Avversità', 'BBCH', 'Fase', 'Carenza gg', 'Raccolta dal', 'Mezzo', 'Ore', 'Operatore', 'Patentino', 'Note'], ops.map(o => { const c = get('campi', o.campoId) || {}, p = get('prodotti', o.prodottoId) || {}, m = get('mezzi', o.mezzoId) || {}; const r = car.get(o.id); return [o.data, o.oraInizio, c.nome, it(campoHa(c)), cropOf(c, y), c.catasto, o.tipo, p.nome, p.nReg, p.sostanze, it(o.dose), it(o.quantita), p.unita, o.avversita, o.bbch, o.fase, r ? it(r.car) : it(p.carenza), r ? r.raccoltaDal : '', m.nome, it(o.ore), o.operatore, r && r.op ? r.op.patentino : '', o.note]; }))); }
  if (what === 'trattamenti') { const ev = S.eventi.filter(e => (e.tipo === 'Trattamento sanitario' || e.tipo === 'Vaccinazione') && yearOf(e.data) === y).sort(byDate); download(`registro-trattamenti-${y}.csv`, csv(['Data', 'Matricola', 'Nome', 'Tipo', 'Farmaco', 'Diagnosi', 'Quantità', 'Sosp. latte gg', 'Fine sosp. latte', 'Sosp. carne gg', 'Fine sosp. carne', 'Ricetta', 'Veterinario', 'Note'], ev.map(e => { const c = get('capi', e.capoId) || {}, p = get('prodotti', e.prodottoId); return [e.data, c.matricola, c.nome, e.tipo, p ? p.nome : e.farmaco, e.motivo, it(e.quantita), it(e.sospLatte), N(e.sospLatte) ? addDays(e.data, N(e.sospLatte)) : '', it(e.sospCarne), N(e.sospCarne) ? addDays(e.data, N(e.sospCarne)) : '', e.ricetta, e.veterinario, e.note]; }))); }
  if (what === 'latte') { const L = D.latte.filter(l => yearOf(l.data) === y); download(`latte-${y}.csv`, csv(['Data', 'Vacche', 'Litri prodotti', 'Litri conferiti', 'Litri scartati', 'Prezzo €/l', 'Grasso %', 'Proteine %', 'Cellule', 'CBT', 'Note'], L.map(l => [l.data, it(l.vacche), it(l.litri), it(l.conferiti), it(l.scartati), it(l.prezzo), it(l.grasso), it(l.proteine), it(l.cellule), it(l.cbt), l.note]))); }
  if (what === 'movimenti') { const mv = S.movimenti.filter(m => yearOf(m.data) === y).sort(byDate); download(`movimenti-magazzino-${y}.csv`, csv(['Data', 'Prodotto', 'Categoria', 'Tipo', 'Quantità', 'Unità', 'Prezzo', 'Documento', 'Note'], mv.map(m => { const p = get('prodotti', m.prodottoId) || {}; return [m.data, p.nome, p.categoria, m.tipo, it(m.quantita), p.unita, it(m.prezzo), m.documento, m.note]; }))); }
  toast('File pronto');
}

async function ndviField(id, btn) {
  const c = get('campi', id); if (!c || !c.geom) return toast('Disegna prima il confine del campo.', 'err');
  btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>Leggo le immagini…';
  try { const { serieCampo } = await import('./ndvi.js'); const s = await serieCampo(c, 8); toast(s.length ? 'NDVI aggiornato: ' + s.length + ' immagini' : 'Nessuna immagine serena negli ultimi mesi'); }
  catch (e) { toast(e.message, 'err'); }
  render();
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
  const order = ['movimenti', 'operazioni', 'eventi', 'latte', 'misure', 'razioni', 'note', 'manutenzioni', 'silos', 'strutture', 'capi', 'campi', 'prodotti', 'mezzi', 'operatori'];
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
      case 'area': UI.area = d.area; saveUI(); return setTab(d.area === 'conti' ? 'conti' : 'oggi');
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
      case 'nlApply': return nlApply();
      case 'moveCapi': return moveSheet(d.src || '');
      case 'aiForget': try { localStorage.removeItem('ces.ai'); } catch (e) { } toast('Chiave rimossa'); return render();
      case 'search': return searchSheet();
      case 'cmdAz': if (d.area !== 'tutte' && d.area !== UI.area) { UI.area = d.area; saveUI(); setTab('oggi'); } return quickGo(d.k);
      case 'cmdPag': if (UI.area !== d.area) { UI.area = d.area; saveUI(); } closeSheet(); return setTab(d.tab, d.sub);
      case 'close': return closeSheet();
      case 'scrollTo': { const el = document.getElementById(d.target); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
      case 'chip': UI.f[d.f] = d.v; return render();
      case 'view': UI.view = d.v; saveUI(); return render();
      case 'collapse': { const k = 'c_' + d.k; UI.f[k] = !UI.f[k]; return render(); }
      case 'export': return doExport(d.what);
      case 'fitoClear': return arm(b, 'Conferma: rimuovi la banca dati', async () => { await clearFito(); toast('Banca dati rimossa'); });
      case 'exportSheet': return exportSheet();
      case 'razScarico': b.disabled = true; return razScarico(d.id);
      case 'formdel': return formDelete(b);
      case 'lineAdd': return addLine(d.k);
      case 'lineDel': { const l = b.closest('.line'); const par = l.parentElement; if (par.children.length > 1) l.remove(); else l.querySelectorAll('input,select').forEach(x => (x.value = '')); par.dispatchEvent(new Event('input', { bubbles: true })); return; }
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
      case 'catSearch': return MAP.cercaPanel();
      case 'catCopia': { try { const t = await (await fetch('./supabase/functions/catasto/' + d.f, { cache: 'no-cache' })).text(); await navigator.clipboard.writeText(t); toast('Codice copiato: incollalo nell\'editor e premi Deploy'); } catch (e) { toast('Non riesco a copiare: apri il file ' + d.f + ' dal progetto', 'err'); } return; }
      case 'catSalva': { const { salvaCfgCatasto } = await import('./catasto.js'); const u = ($('#cat_url').value || '').trim(); if (u && !/^https:\/\//.test(u)) return toast('L\'indirizzo deve iniziare con https://', 'err'); salvaCfgCatasto({ url: u }); toast('Collegamento salvato'); return render(); }
      case 'catProva': { b.disabled = true; const C = await import('./catasto.js'); const u = ($('#cat_url').value || '').trim(); if (u !== (C.cfgCatasto().url || '')) C.salvaCfgCatasto({ url: u }); try { await C.provaCollegamento(); toast('Il collegamento al catasto funziona'); } catch (e) { toast(e.message, 'err'); } b.disabled = false; return render(); }
      case 'catFind': return MAP.cercaEsegui(b);
      case 'catNuovo': return MAP.catNuovo();
      case 'catAggiungi': return MAP.catAggiungi();
      case 'catVisura': return MAP.catVisura();
      case 'catImposta': closeSheet(); UI.tab = 'impostazioni'; UI.detail = null; render(); return setTimeout(() => { const el = document.getElementById('catastoSez'); if (el) el.scrollIntoView({ behavior: 'smooth' }); }, 200);
      case 'mapNote': return MAP.noteForField(d.id);
      case 'ndviField': return ndviField(d.id, b);
      case 'ndviMap': setTab('mappa'); return setTimeout(() => MAP.showNdvi(d.id), 250);
      case 'mapFocus': setTab('mappa'); return setTimeout(() => MAP.focusCampo(d.id), 250);
      case 'lockNow': return blocca();
      case 'lockOff': try { toast(await disattivaDaForm($)); } catch (err) { toast(err.message, 'err'); } return render();
      case 'c-expAll': drawer(false); closeSheet(); b.disabled = true; try { await esportaTutto(UI.anno); } finally { b.disabled = false; } return;
      default: if (a === 'tsort' || a === 'texp' || a.startsWith('c-')) return contiAct(a, b, d).catch(err => { console.warn(err); toast(err.message || 'Operazione non riuscita', 'err'); });
    }
  } catch (err) { console.warn(err); toast(err.message || 'Operazione non riuscita', 'err'); }
});

document.addEventListener('change', e => {
  const t = e.target;
  if (t.id === 'yearSel') { UI.anno = Number(t.value); return render(); }
  if (t.dataset.filter && t.tagName === 'SELECT') { UI.f[t.dataset.filter] = t.value; return render(); }
  if (t.dataset.act === 'mapImport' && t.files[0]) { MAP.importFile(t.files[0]); t.value = ''; return; }
  if (t.dataset.act === 'restore' && t.files[0]) { restore(t.files[0]); t.value = ''; return; }
  if (t.dataset.act === 'aiaImport' && t.files.length) { const fs = [...t.files]; t.value = ''; import('./views/aia-view.js').then(m => m.aiaImport(fs)).catch(err => toast(err.message || 'File non valido', 'err')); return; }
  if (t.dataset.act === 'misureImport' && t.files[0]) { const f = t.files[0]; t.value = ''; misureImport(f).catch(err => toast(err.message || 'File non valido', 'err')); return; }
  if (t.dataset.act === 'fitoImport' && t.files[0]) { const f = t.files[0]; t.value = ''; toast('Lettura della banca dati…'); importFito(f).then(n => toast('Banca dati caricata: ' + n + ' prodotti')).catch(err => toast(err.message || 'File non valido', 'err')); return; }
  if (t.dataset.act === 'authTab') { authUI.tab = t.value; return render(); }
  if (t.dataset.act === 'view') { UI.view = t.dataset.v; saveUI(); return render(); }
  if (t.dataset.act && t.dataset.act.startsWith('c-')) { contiChange(t).catch(err => toast(err.message || 'Salvataggio non riuscito', 'err')); return; }
});
['dragover', 'dragleave', 'drop'].forEach(ev => document.addEventListener(ev, e => { if (ev === 'dragleave') { const z = e.target.closest && e.target.closest('#dropzone'); if (z) z.classList.remove('over'); return; } contiDrop(e); }));
document.addEventListener('input', e => {
  const t = e.target;
  if (t.dataset.filter && t.tagName === 'INPUT') { UI.f[t.dataset.filter] = t.value; render(); }
  if (t.id === 'mapSearch') searchSoon(t.value);
  if (t.id === 'gq') searchRun(t.value);
});
const searchSoon = debounce(q => MAP.searchPlace(q), 450);
document.addEventListener('keydown', e => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.getAttribute && e.target.getAttribute('role') === 'button' && e.target.dataset.act) { e.preventDefault(); e.target.click(); return; }
  const inField = e.target.closest && e.target.closest('input,textarea,select,[contenteditable="true"]');
  if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); if (!sheetOpen()) searchSheet(); else { const i = $('#gq'); if (i) i.focus(); } return; }
  if (!inField && !e.ctrlKey && !e.metaKey && !e.altKey && !sheetOpen() && !document.documentElement.classList.contains('app-locked')) {
    if (e.key === '/') { e.preventDefault(); return searchSheet(); }
    if ((e.key === 'n' || e.key === 'N') && UI.tab !== 'mappa') { e.preventDefault(); return quickSheet(); }
  }
  if (e.key === 'Enter' && e.target.id === 'gq') { e.preventDefault(); const f = $('#gres [data-act]'); if (f) f.click(); return; }
  if (e.key === 'Escape') { if (sheetOpen()) closeSheet(); else if (document.body.classList.contains('drawer-open')) drawer(false); else if (UI.tab === 'mappa') MAP.endMode(); }
  if (e.key === 'Enter' && e.target.id === 'mapSearch') { e.preventDefault(); MAP.searchPlace(e.target.value); }
});

/* ---------- moduli nelle impostazioni ---------- */
document.addEventListener('submit', async e => {
  const f = e.target; const k = f.dataset.formAct; if (!k) return; e.preventDefault();
  const btn = f.querySelector('[type=submit]'); if (btn) btn.disabled = true;
  try {
    if (k === 'lockSet') { toast(await salvaBloccoDaForm($)); }
    if (k === 'azienda') { const a = azienda(); await store.put('config', 'azienda', Object.assign({}, a, { nome: $('#az_nome').value.trim(), asl: $('#az_asl').value.trim(), iva: $('#az_iva').value.trim(), indirizzo: ($('#az_ind') || {}).value?.trim?.() || a.indirizzo || '', lat: $('#az_lat').value.trim().replace(',', '.'), lon: $('#az_lon').value.trim().replace(',', '.'), ettari: ($('#az_ha') || {}).value ? N($('#az_ha').value) : a.ettari || null })); toast('Dati aziendali salvati'); }
    if (k === 'gkey') { const a = azienda(); await store.put('config', 'azienda', Object.assign({}, a, { gkey: $('#az_gkey').value.trim() })); try { localStorage.removeItem('ces.gses'); } catch (e) { } toast($('#az_gkey').value.trim() ? 'Chiave salvata: scegli "Google" in Livelli mappa' : 'Chiave rimossa'); }
    if (k === 'aiKey') { const key = $('#ai_key').value.trim(); if (key) lsSet('ces.ai', { key, model: $('#ai_model').value.trim() || 'claude-haiku-5-5' }); else try { localStorage.removeItem('ces.ai'); } catch (e) { } toast(key ? 'Chiave salvata su questo dispositivo' : 'Chiave rimossa'); }
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

setRerender(() => render());

/* ---------- avvio ---------- */
(function boot() {
  avviaBlocco();
  $('#mapControls').innerHTML = `
    <div class="mapsearch">${ic('search')}<input id="mapSearch" placeholder="Cerca comune, località o coordinate" autocomplete="off" enterkeyhint="search"><div id="mapResults" class="map-results" hidden></div></div>
    <div id="mapWeather" class="map-weather" hidden></div>
    <div class="map-tools"><button class="mtool" data-act="mapDraw" aria-label="Disegna un campo" title="Disegna un campo">${ic('pentagon')}</button><button class="mtool" data-act="mapLayers" aria-label="Livelli mappa" title="Livelli mappa">${ic('layers')}</button><button class="mtool" data-act="catSearch" aria-label="Cerca particella catastale" title="Cerca particella (foglio e mappale)">${ic('grid-2x2')}</button><button class="mtool" data-act="mapLocate" aria-label="La mia posizione" title="La mia posizione">${ic('navigation')}</button><button class="mtool" data-act="mapFit" aria-label="Mostra tutti i campi" title="Mostra tutti i campi">${ic('scan-search')}</button><label class="mtool" aria-label="Importa KML o GeoJSON" title="Importa confini da KML, GeoJSON o shapefile">${ic('file-up')}<input type="file" accept=".kml,.geojson,.json,.zip,.shp,application/vnd.google-earth.kml+xml,application/geo+json,application/zip" data-act="mapImport" hidden></label></div>
    <div id="catHint" class="cat-hint" hidden>${ic('grid-2x2')}Avvicinati per vedere le particelle</div>
    <button class="legend-btn" data-act="mapLegend">Legenda ${ic('chevron-left', 'rot')}</button>
    <div id="mapLegend" class="map-legend" hidden></div>
    <button class="map-plus" data-act="mapPlus" aria-label="Aggiungi">${ic('plus')}</button>
    <div id="mapBar" class="map-bar" hidden></div>
    <div id="ndviBar" class="ndvi-bar" hidden></div>
    <div id="fxPanel" class="fx-panel" hidden></div>
    <div id="catCard" class="cat-card" hidden></div>
    <div id="mapCard" class="map-card" hidden></div>`;
  const h = (location.hash || '').slice(1); if (VIEWS[h] || h === 'mappa') UI.tab = h;
  if (UI.area === 'conti' && UI.tab === 'oggi') UI.tab = 'conti';
  const q = new URLSearchParams(location.search).get('azione');
  render();
  initFito();
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
