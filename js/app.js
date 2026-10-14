// Avvio, navigazione e azioni dell'app
import { S, UI, D, bus, get, azienda, COLS } from './state.js';
import { $, $$, esc, N, today, addDays, yearOf, byDate, lsSet, debounce } from './util.js';
import { ic } from './icons.js';
import { derive, razioneInfo } from './domain.js';
import * as store from './store.js';
import { sync, onSync } from './store.js';
import { openSheet, closeSheet, sheetOpen, toast, arm, addLine, formDelete } from './ui.js';
import { openEdit } from './forms.js';
import * as MAP from './map.js';
import { promptInstall } from './install.js';
import { exampleRows } from './esempi.js';
import { render as vOggi } from './views/oggi.js';
import { render as vCampi } from './views/campi.js';
import { render as vStalla } from './views/stalla.js';
import { render as vMag } from './views/magazzino.js';
import { render as vMezzi } from './views/mezzi.js';
import { render as vImp, renderAltro, authUI } from './views/impostazioni.js';

const VIEWS = { oggi: vOggi, campi: vCampi, stalla: vStalla, magazzino: vMag, mezzi: vMezzi, impostazioni: vImp, altro: renderAltro };
const NAV = [['oggi', 'sun', 'Oggi'], ['mappa', 'map', 'Mappa'], ['campi', 'sprout', 'Campi'], ['stalla', 'cow', 'Stalla'], ['magazzino', 'package', 'Magazzino'], ['mezzi', 'tractor', 'Mezzi']];
const MOBILE = [['oggi', 'sun', 'Oggi'], ['mappa', 'map', 'Mappa'], ['campi', 'sprout', 'Campi'], ['stalla', 'cow', 'Stalla'], ['altro', 'ellipsis', 'Altro']];
const TAB_OF = { campo: 'campi', capo: 'stalla', prodotto: 'magazzino', mezzo: 'mezzi' };
const inAltro = t => ['magazzino', 'mezzi', 'impostazioni', 'altro'].includes(t);

/* ---------- render ---------- */
let rq = 0;
const schedule = () => { if (rq) return; rq = requestAnimationFrame(() => { rq = 0; render(); }); };
bus.render = schedule;

function navHTML(items, mobile) {
  return items.map(([k, i, l]) => { const cur = mobile && k === 'altro' ? inAltro(UI.tab) : UI.tab === k; return `<button class="nav-i" data-act="tab" data-tab="${k}" aria-current="${cur ? 'page' : 'false'}">${ic(i)}<span>${l}</span></button>`; }).join('');
}
function syncPill() {
  const el = $('#syncPill'); if (!el) return;
  let icn = 'cloud-off', t = 'Solo su questo dispositivo', cls = 'local';
  if (sync.mode === 'cloud' && !sync.user) { icn = 'user'; t = 'Accedi per sincronizzare'; cls = 'warn'; }
  else if (sync.mode === 'cloud' && sync.user && !sync.farm) { icn = 'building-2'; t = 'Collega un\'azienda'; cls = 'warn'; }
  else if (sync.farm) {
    if (sync.status === 'syncing') { icn = 'refresh-cw'; t = 'Sincronizzo…'; cls = 'busy'; }
    else if (sync.status === 'offline' || !navigator.onLine) { icn = 'wifi-off'; t = sync.pending ? sync.pending + ' in attesa' : 'Offline'; cls = 'warn'; }
    else if (sync.status === 'error') { icn = 'triangle-alert'; t = 'Errore sync'; cls = 'bad'; }
    else if (sync.pending) { icn = 'cloud-upload'; t = sync.pending + ' da inviare'; cls = 'busy'; }
    else { icn = 'circle-check'; t = 'Sincronizzato'; cls = 'ok'; }
  }
  el.className = 'sync-pill ' + cls; el.innerHTML = ic(icn) + '<span>' + esc(t) + '</span>'; el.title = t;
  const sn = $('#sideSync'); if (sn) { sn.className = 'side-sync ' + cls; sn.innerHTML = ic(icn) + '<span>' + esc(sync.farm ? sync.farm.name + ' · ' + t : t) + '</span>'; }
}
onSync(() => { syncPill(); if (UI.tab === 'impostazioni') schedule(); });

function render() {
  derive();
  $('#sideNav').innerHTML = navHTML(NAV, false);
  $('#bottomNav').innerHTML = navHTML(MOBILE, true);
  const a = azienda(); $('#sideFarm').textContent = a.nome || (sync.farm && sync.farm.name) || 'La tua azienda';
  $('#sideSettings').setAttribute('aria-current', UI.tab === 'impostazioni' ? 'page' : 'false');
  syncPill();
  // annata
  const years = new Set([new Date().getFullYear(), UI.anno]); S.operazioni.forEach(o => { const y = yearOf(o.data); if (y) years.add(y); }); S.eventi.forEach(o => { const y = yearOf(o.data); if (y) years.add(y); });
  $('#yearSel').innerHTML = [...years].sort((a, b) => b - a).map(y => `<option value="${y}"${y === UI.anno ? ' selected' : ''}>${y}</option>`).join('');
  const isMap = UI.tab === 'mappa';
  document.body.classList.toggle('on-map', isMap);
  $('#mapView').hidden = !isMap; $('#view').hidden = isMap;
  $('#backBtn').hidden = !UI.detail;
  if (isMap) { $('#topTitle').textContent = 'Mappa'; MAP.showMap(); MAP.mapUpdate(); return; }
  const ae = document.activeElement; const fid = ae && ae.id && $('#view').contains(ae) ? ae.id : null; const sel = fid && ae.selectionStart != null ? [ae.selectionStart, ae.selectionEnd] : null;
  let r;
  if (!UI.loaded) r = { title: '', html: '<div class="loading"><span class="spinner"></span>Carico i dati…</div>' };
  else r = (VIEWS[UI.tab] || vOggi)();
  $('#topTitle').textContent = UI.detail ? r.title : '';
  document.title = (r.title ? r.title + ' · ' : '') + 'Campo e Stalla';
  $('#view').innerHTML = r.html;
  if (fid) { const el = document.getElementById(fid); if (el) { el.focus(); if (sel) try { el.setSelectionRange(sel[0], sel[1]); } catch (e) { } } }
}

/* ---------- navigazione ---------- */
function setTab(t, keepDetail) {
  if (t !== 'mappa') MAP.endMode && UI.tab === 'mappa' && MAP.endMode();
  UI.tab = t; if (!keepDetail) { UI.detail = null; UI.hist = []; }
  try { history.replaceState(null, '', '#' + t); } catch (e) { }
  render(); window.scrollTo(0, 0);
}
function openDetail(type, id) {
  if (UI.detail) UI.hist.push({ tab: UI.tab, detail: UI.detail });
  else UI.hist.push({ tab: UI.tab, detail: null });
  UI.tab = TAB_OF[type]; UI.detail = { type, id };
  try { history.pushState({ d: 1 }, '', '#' + UI.tab); } catch (e) { }
  render(); window.scrollTo(0, 0);
}
function goBack() { const h = UI.hist.pop(); if (h) { UI.tab = h.tab; UI.detail = h.detail; } else UI.detail = null; render(); window.scrollTo(0, 0); }
window.addEventListener('popstate', () => { if (sheetOpen()) { closeSheet(); return; } if (UI.detail) goBack(); });
document.addEventListener('ces:deleted', e => { if (UI.detail && UI.detail.id === e.detail.id) goBack(); });

/* ---------- registrazione rapida ---------- */
const QUICK = [['operazioni', 'notebook-pen', 'Lavoro in campo', 'Semina, trattamento, raccolta'], ['eventi', 'cow', 'Evento di stalla', 'Parto, fecondazione, trattamento'], ['latte', 'milk', 'Latte del giorno', 'Litri e qualità'], ['movimenti', 'download', 'Carico magazzino', 'Merce arrivata', { tipo: 'Carico' }], ['movimenti', 'upload', 'Scarico magazzino', 'Uso fuori dal quaderno', { tipo: 'Scarico' }], ['manutenzioni', 'wrench', 'Manutenzione', 'Tagliando, riparazione'], ['capi', 'baby', 'Nuovo capo', 'Acquisto o nascita'], ['mappa', 'pentagon', 'Nuovo campo', 'Disegnalo sulla mappa']];
function quickSheet() {
  openSheet('Registra', `<div class="quick">${QUICK.map((q, i) => `<button data-act="quickgo" data-i="${i}"><span class="q-ic">${ic(q[1])}</span><b>${q[2]}</b><span>${q[3]}</span></button>`).join('')}</div>`);
}

/* ---------- esportazioni ---------- */
function download(name, text, type = 'text/csv;charset=utf-8') {
  const b = new Blob([text], { type }); const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href = u; a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(u); a.remove(); }, 1000);
}
const csv = (head, rows) => '﻿' + [head, ...rows].map(r => r.map(x => { const s = String(x ?? ''); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(';')).join('\r\n');
const it = n => n === null || n === undefined || n === '' ? '' : String(n).replace('.', ',');
function doExport(what) {
  const y = UI.anno;
  if (what === 'quaderno') { const ops = S.operazioni.filter(o => yearOf(o.data) === y).sort(byDate); download(`quaderno-campagna-${y}.csv`, csv(['Data', 'Appezzamento', 'Superficie ha', 'Coltura', 'Catasto', 'Operazione', 'Prodotto', 'N. registrazione', 'Dose/ha', 'Quantità', 'Unità', 'Avversità', 'Fase', 'Carenza gg', 'Mezzo', 'Ore', 'Operatore', 'Note'], ops.map(o => { const c = get('campi', o.campoId) || {}, p = get('prodotti', o.prodottoId) || {}, m = get('mezzi', o.mezzoId) || {}; return [o.data, c.nome, it(c.superficie), c.coltura, c.catasto, o.tipo, p.nome, p.nReg, it(o.dose), it(o.quantita), p.unita, o.avversita, o.fase, it(p.carenza), m.nome, it(o.ore), o.operatore, o.note]; }))); }
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
  const order = ['movimenti', 'operazioni', 'eventi', 'latte', 'razioni', 'manutenzioni', 'capi', 'campi', 'prodotti', 'mezzi'];
  for (const c of order) for (const x of S[c].filter(x => x.esempio)) await store.remove(c, x.id);
  toast('Dati di esempio eliminati');
}

/* ---------- clic ---------- */
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-act]');
  if (!b) { if (e.target.id === 'sheet') closeSheet(); if (!e.target.closest('#layerMenu,[data-act=mapLayers]')) { const m = $('#layerMenu'); if (m) m.hidden = true; } if (!e.target.closest('.mapsearch')) { const r = $('#mapResults'); if (r) r.hidden = true; } return; }
  const a = b.dataset.act; const d = b.dataset;
  if (b.tagName === 'INPUT' && (b.type === 'checkbox' || b.type === 'radio' || b.type === 'file')) return; // gestiti da "change"
  try {
    switch (a) {
      case 'tab': return setTab(d.tab);
      case 'sub': if (d.tab && UI.tab !== d.tab) { UI.tab = d.tab; UI.detail = null; UI.hist = []; } UI.sub[d.sec] = d.sub; lsSet('ces.ui', { sub: UI.sub }); render(); return window.scrollTo(0, 0);
      case 'open': return openDetail(d.type, d.id);
      case 'go': { const g = JSON.parse(d.go); if (g.form) return openEdit(g.form); return openDetail(g.type, g.id); }
      case 'back': return history.state && history.state.d ? history.back() : goBack();
      case 'new': { const pre = {}; if (d.campo) pre.campoId = d.campo; if (d.capo) pre.capoId = d.capo; if (d.tipo) pre.tipo = d.tipo; if (d.prodotto) pre.prodottoId = d.prodotto; if (d.mezzo) pre.mezzoId = d.mezzo; return openEdit(d.form, null, pre); }
      case 'edit': return openEdit(d.form, d.id);
      case 'quick': return quickSheet();
      case 'quickgo': { const q = QUICK[+d.i]; closeSheet(); if (q[0] === 'mappa') { setTab('mappa'); setTimeout(() => MAP.startDraw(), 250); return; } return setTimeout(() => openEdit(q[0], null, q[4] || {}), 230); }
      case 'close': return closeSheet();
      case 'chip': UI.f[d.f] = d.v; return render();
      case 'export': return doExport(d.what);
      case 'razScarico': b.disabled = true; return razScarico(d.id);
      case 'formdel': return formDelete(b);
      case 'lineAdd': return addLine(d.k);
      case 'lineDel': { const l = b.closest('.line'); if (l.parentElement.children.length > 1) l.remove(); else { l.querySelector('select').value = ''; l.querySelector('input').value = ''; } return; }
      case 'copy': try { await navigator.clipboard.writeText(d.txt); toast('Copiato'); } catch (err) { toast(d.txt); } return;
      case 'install': return promptInstall();
      case 'loadExamples': await store.bulkPut(exampleRows()); toast('Dati di esempio caricati'); if (UI.tab === 'impostazioni') setTab('oggi'); return;
      case 'delExamples': return arm(b, 'Conferma: elimina gli esempi', delExamples);
      case 'backup': { const o = await store.exportAll(); download(`campo-e-stalla-${today()}.json`, JSON.stringify(o), 'application/json'); return; }
      case 'wipe': return arm(b, 'Conferma: cancella tutto da questo dispositivo', () => store.wipeLocal());
      case 'syncNow': return store.syncNow();
      case 'signOut': await store.signOut(); toast('Disconnesso'); return render();
      case 'leaveFarm': return arm(b, 'Conferma: scollega', async () => { await store.leaveFarm(); toast('Dispositivo scollegato dall\'azienda'); render(); });
      case 'removeMember': return arm(b, 'Conferma', async () => { await store.removeMember(d.id); toast('Persona rimossa'); });
      case 'newCode': return arm(b, 'Conferma: nuovo codice', async () => { try { await store.newJoinCode(); toast('Nuovo codice creato: quello vecchio non funziona più'); } catch (err) { toast(traduci(err), 'err'); } });
      case 'resetPw': { const em = $('#au_email').value.trim(); if (!em) return toast('Scrivi prima la tua email', 'err'); await store.resetPassword(em); return toast('Ti ho inviato una mail per reimpostare la password'); }
      case 'cloudForget': return store.setCloudConfig('');
      case 'gpsAzienda': return gpsAzienda();
      // mappa
      case 'mapDraw': return MAP.startDraw();
      case 'mapEdit': return MAP.startEdit(d.id);
      case 'mapSaveEdit': return MAP.saveEdit();
      case 'mapCancel': return MAP.endMode();
      case 'mapUndo': return MAP.undoPoint();
      case 'mapDeselect': return MAP.select(null);
      case 'mapLayers': return MAP.layerMenu();
      case 'mapBase': return MAP.setBase(d.k);
      case 'mapLocate': return MAP.locate();
      case 'mapFit': return MAP.fitAll();
      case 'mapGo': return MAP.goPlace(b);
      case 'catClose': return MAP.closeCat();
      case 'catAssign': return MAP.assignCatasto(d.txt, d.comune);
      case 'mapFocus': setTab('mappa'); return setTimeout(() => MAP.focusCampo(d.id), 200);
    }
  } catch (err) { console.warn(err); toast(err.message || 'Operazione non riuscita', 'err'); }
});

document.addEventListener('change', e => {
  const t = e.target;
  if (t.id === 'yearSel') { UI.anno = Number(t.value); return render(); }
  if (t.dataset.filter && t.tagName === 'SELECT') { UI.f[t.dataset.filter] = t.value; return render(); }
  if (t.dataset.act === 'mapToggle') return MAP.toggleLayer(t.dataset.k, t.checked);
  if (t.dataset.act === 'mapImport' && t.files[0]) { MAP.importFile(t.files[0]); t.value = ''; return; }
  if (t.dataset.act === 'restore' && t.files[0]) { restore(t.files[0]); t.value = ''; return; }
  if (t.dataset.act === 'authTab') { authUI.tab = t.value; return render(); }
});
document.addEventListener('input', e => {
  const t = e.target;
  if (t.dataset.filter && t.tagName === 'INPUT') { UI.f[t.dataset.filter] = t.value; render(); }
  if (t.id === 'mapSearch') searchSoon(t.value);
});
const searchSoon = debounce(q => MAP.searchPlace(q), 450);
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { if (sheetOpen()) closeSheet(); else if (UI.tab === 'mappa') MAP.endMode(); }
  if (e.key === 'Enter' && e.target.id === 'mapSearch') { e.preventDefault(); MAP.searchPlace(e.target.value); }
});

/* ---------- moduli nelle impostazioni ---------- */
document.addEventListener('submit', async e => {
  const f = e.target; const k = f.dataset.formAct; if (!k) return; e.preventDefault();
  const btn = f.querySelector('[type=submit]'); if (btn) btn.disabled = true;
  try {
    if (k === 'azienda') { const a = azienda(); await store.put('config', 'azienda', Object.assign({}, a, { nome: $('#az_nome').value.trim(), asl: $('#az_asl').value.trim(), iva: $('#az_iva').value.trim(), lat: $('#az_lat').value.trim().replace(',', '.'), lon: $('#az_lon').value.trim().replace(',', '.') })); toast('Dati aziendali salvati'); }
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
    <div class="map-tools"><button class="mtool" data-act="mapLayers" aria-label="Livelli e sfondo">${ic('layers')}</button><button class="mtool" data-act="mapLocate" aria-label="La mia posizione">${ic('locate-fixed')}</button><button class="mtool" data-act="mapFit" aria-label="Tutti i campi">${ic('scan-search')}</button><label class="mtool" aria-label="Importa KML o GeoJSON" title="Importa KML o GeoJSON">${ic('file-up')}<input type="file" accept=".kml,.geojson,.json,application/vnd.google-earth.kml+xml,application/geo+json" data-act="mapImport" hidden></label></div>
    <div id="layerMenu" class="layer-menu" hidden></div>
    <div id="catHint" class="cat-hint" hidden>${ic('grid-2x2')}Avvicinati per vedere le particelle catastali</div>
    <button class="draw-fab" data-act="mapDraw">${ic('pentagon')}<span>Disegna campo</span></button>
    <div id="mapLegend" class="map-legend" hidden></div>
    <div id="mapBar" class="map-bar" hidden></div>
    <div id="catCard" class="cat-card" hidden></div>
    <div id="mapCard" class="map-card" hidden></div>`;
  const h = (location.hash || '').slice(1); if (VIEWS[h] || h === 'mappa') UI.tab = h;
  const q = new URLSearchParams(location.search).get('azione');
  render();
  store.initStore().then(() => { if (q === 'operazione') openEdit('operazioni'); else if (q === 'latte') openEdit('latte'); else if (q === 'evento') openEdit('eventi'); });
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
