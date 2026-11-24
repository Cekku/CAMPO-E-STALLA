// Componenti d'interfaccia: foglio a scomparsa, avvisi, moduli
import { $, $$, esc, N } from './util.js';
import { ic } from './icons.js';

/* ---------- foglio ---------- */
let onCloseCb = null;
export function openSheet(title, html, { wide = false, onClose = null, sub = '' } = {}) {
  const sh = $('#sheet');
  $('#sheetTitle').textContent = title;
  $('#sheetSub').textContent = sub; $('#sheetSub').hidden = !sub;
  const body = $('#sheetBody'); body.onclick = body.onchange = body.oninput = null;
  body.innerHTML = html; body.scrollTop = 0;
  sh.classList.toggle('wide', wide);
  finestraApri(sh, wide);
  sh.hidden = false; requestAnimationFrame(() => sh.classList.add('open'));
  document.documentElement.classList.add('locked');
  onCloseCb = onClose;
  return $('#sheetBody');
}
export function closeSheet() {
  const sh = $('#sheet'); if (sh.hidden) return;
  sh.classList.remove('open'); document.documentElement.classList.remove('locked');
  FORM = null; const cb = onCloseCb; onCloseCb = null;
  setTimeout(() => { if (!sh.classList.contains('open')) { sh.hidden = true; $('#sheetBody').innerHTML = ''; } }, 220);
  if (cb) cb();
}
export const sheetOpen = () => !$('#sheet').hidden;

/* ---------- finestra come in Windows (1.75.0) ----------
   Sul computer la finestra si sposta trascinando il titolo, si allarga o stringe dai bordi e dagli angoli,
   si ingrandisce col pulsante o col doppio clic sul titolo. La misura scelta resta per le finestre dopo
   (in localStorage ces.finestra, una per le finestre normali e una per le larghe). Sul telefono solo ingrandisci.
   Barra orizzontale ferma in fondo alla finestra (#sheetX): segue la tabella larga che si vede e la fa scorrere
   di lato senza dover scendere in fondo alla tabella. */
const FKEY = 'ces.finestra', FMIN_W = 340, FMIN_H = 220, FBORDO = 8;
const fLeggi = () => { try { return JSON.parse(localStorage.getItem(FKEY)) || {}; } catch { return {}; } };
const fScrivi = (o) => { try { localStorage.setItem(FKEY, JSON.stringify(o)); } catch {} };
const pc = () => matchMedia('(min-width: 641px)').matches;
let fTipo = 'n';
function fLimita(r) {
  const vw = innerWidth, vh = innerHeight;
  r.w = Math.max(FMIN_W, Math.min(r.w, vw - 2 * FBORDO)); r.h = Math.max(FMIN_H, Math.min(r.h, vh - 2 * FBORDO));
  r.x = Math.max(FBORDO - r.w + 120, Math.min(r.x, vw - 120)); r.y = Math.max(FBORDO, Math.min(r.y, vh - 48));
  return r;
}
function fMetti(box, r) { Object.assign(box.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' }); }
function fTogli(box) { box.style.left = box.style.top = box.style.width = box.style.height = ''; }
function fMax(sh, on, salva = true) {
  sh.classList.toggle('max', on);
  const b = $('#sheetMax'); if (b) { b.setAttribute('aria-label', on ? 'Riduci la finestra' : 'Ingrandisci la finestra'); b.title = on ? 'Riduci (doppio clic sul titolo)' : 'Ingrandisci (doppio clic sul titolo)'; }
  if (salva) { const o = fLeggi(); o[fTipo] = { ...(o[fTipo] || {}), max: on }; fScrivi(o); }
  fBarra();
}
function finestraApri(sh, wide) {
  if (!sh.hidden && sh.classList.contains('open') && fTipo === (wide ? 'w' : 'n')) return; // già aperta (scheda aperta dall'interno): resta dov'è
  fTipo = wide ? 'w' : 'n';
  const box = sh.querySelector('.sheet-box'), m = fLeggi()[fTipo] || {};
  sh.classList.remove('free'); fTogli(box);
  if (pc() && m.w && m.h) { // misura scelta l'altra volta, al centro dello schermo
    const r = fLimita({ w: m.w, h: m.h, x: 0, y: 0 }); r.x = Math.round((innerWidth - r.w) / 2); r.y = Math.round((innerHeight - r.h) / 2);
    sh.classList.add('free'); fMetti(box, r);
  }
  fMax(sh, !!m.max, false);
}
function fTrascina(e, box, modo) { // modo: 'sposta' oppure i lati 'n','s','e','w','ne',…
  if (e.button !== 0 || !pc()) return;
  const sh = $('#sheet'); if (sh.classList.contains('max')) { if (modo !== 'sposta') return; }
  e.preventDefault();
  const a = box.getBoundingClientRect(), x0 = e.clientX, y0 = e.clientY;
  let mosso = false;
  const muovi = (ev) => {
    const dx = ev.clientX - x0, dy = ev.clientY - y0;
    if (!mosso) {
      if (Math.abs(dx) + Math.abs(dy) < 4) return;
      mosso = true; document.documentElement.classList.add('sh-drag');
      if (sh.classList.contains('max')) { // trascinando il titolo di una finestra ingrandita torna alla misura di prima, sotto il puntatore
        fMax(sh, false); const b = box.getBoundingClientRect();
        a.x = Math.min(Math.max(FBORDO, x0 - b.width / 2), innerWidth - b.width - FBORDO); a.y = FBORDO; a.width = b.width; a.height = b.height;
      }
      sh.classList.add('free');
    }
    let r = { x: a.x, y: a.y, w: a.width, h: a.height };
    if (modo === 'sposta') { r.x += dx; r.y += dy; }
    else {
      if (modo.includes('e')) r.w = a.width + dx;
      if (modo.includes('s')) r.h = a.height + dy;
      if (modo.includes('w')) { r.w = a.width - dx; r.x = a.x + dx; }
      if (modo.includes('n')) { r.h = a.height - dy; r.y = a.y + dy; }
      const w = Math.max(FMIN_W, Math.min(r.w, innerWidth - 2 * FBORDO)), h = Math.max(FMIN_H, Math.min(r.h, innerHeight - 2 * FBORDO));
      if (modo.includes('w')) r.x += r.w - w; if (modo.includes('n')) r.y += r.h - h;
      r.w = w; r.h = h; r.x = Math.max(FBORDO, r.x); r.y = Math.max(FBORDO, r.y);
      if (r.x + r.w > innerWidth - FBORDO) r.w = innerWidth - FBORDO - r.x;
      if (r.y + r.h > innerHeight - FBORDO) r.h = innerHeight - FBORDO - r.y;
    }
    if (modo === 'sposta') r = fLimita(r);
    fMetti(box, r);
  };
  const fine = () => {
    removeEventListener('pointermove', muovi); removeEventListener('pointerup', fine); removeEventListener('pointercancel', fine);
    document.documentElement.classList.remove('sh-drag');
    if (!mosso) return;
    // il clic che segue il rilascio (anche fuori, sullo sfondo) non deve chiudere la finestra
    const ferma = (ev) => { ev.stopPropagation(); ev.preventDefault(); };
    addEventListener('click', ferma, { capture: true, once: true }); setTimeout(() => removeEventListener('click', ferma, true), 80);
    const b = box.getBoundingClientRect(), o = fLeggi(); o[fTipo] = { w: Math.round(b.width), h: Math.round(b.height), max: false }; fScrivi(o);
    fBarra();
  };
  addEventListener('pointermove', muovi); addEventListener('pointerup', fine); addEventListener('pointercancel', fine);
}
// barra orizzontale ferma in fondo
let fSeg = null, fT = 0;
const LARGHE = '.tablewrap, .ch-tab, .rowsgrid, .chart-scroll, .au-det, .mt-days';
function fBarra() {
  const sh = $('#sheet'), bar = $('#sheetX'); if (!sh || !bar || sh.hidden) return;
  const body = $('#sheetBody'), vb = body.getBoundingClientRect();
  let best = null, area = 0;
  for (const el of body.querySelectorAll(LARGHE)) {
    if (el.scrollWidth <= el.clientWidth + 2) continue;
    const r = el.getBoundingClientRect(), vis = Math.min(r.bottom, vb.bottom) - Math.max(r.top, vb.top);
    if (vis <= 30) continue;
    if (r.bottom <= vb.bottom + 1) continue; // la sua barra si vede già: basta quella
    if (vis * r.width > area) { area = vis * r.width; best = el; }
  }
  fSeg = best;
  if (!best) { bar.hidden = true; return; }
  const r = best.getBoundingClientRect(), bx = bar.parentElement.getBoundingClientRect();
  bar.hidden = false;
  bar.style.marginLeft = Math.max(0, r.left - bx.left) + 'px'; bar.style.width = best.clientWidth + 'px';
  bar.firstElementChild.style.width = best.scrollWidth + 'px';
  if (Math.abs(bar.scrollLeft - best.scrollLeft) > 1) bar.scrollLeft = best.scrollLeft;
}
const fBarraDopo = () => { clearTimeout(fT); fT = setTimeout(fBarra, 60); };
function finestraPronta() {
  const sh = $('#sheet'); if (!sh || sh.dataset.fin) return; sh.dataset.fin = '1';
  const box = sh.querySelector('.sheet-box'), head = sh.querySelector('.sheet-h'), body = $('#sheetBody'), bar = $('#sheetX');
  for (const d of ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']) {
    const h = document.createElement('div'); h.className = 'rz rz-' + d; h.setAttribute('aria-hidden', 'true');
    h.addEventListener('pointerdown', (e) => fTrascina(e, box, d)); box.appendChild(h);
  }
  head.addEventListener('pointerdown', (e) => { if (!e.target.closest('button, a, input, select, textarea')) fTrascina(e, box, 'sposta'); });
  head.addEventListener('dblclick', (e) => { if (!e.target.closest('button, a, input, select, textarea')) fMax(sh, !sh.classList.contains('max')); });
  $('#sheetMax').addEventListener('click', () => fMax(sh, !sh.classList.contains('max')));
  body.addEventListener('scroll', (e) => {
    if (e.target === body) return fBarra();
    if (e.target === fSeg && Math.abs(bar.scrollLeft - fSeg.scrollLeft) > 1) bar.scrollLeft = fSeg.scrollLeft;
  }, { passive: true, capture: true });
  bar.addEventListener('scroll', () => { if (fSeg && Math.abs(bar.scrollLeft - fSeg.scrollLeft) > 1) fSeg.scrollLeft = bar.scrollLeft; }, { passive: true });
  new ResizeObserver(() => { box.style.setProperty('--sb-h', body.clientHeight + 'px'); fBarraDopo(); }).observe(body);
  new MutationObserver(fBarraDopo).observe(body, { childList: true, subtree: true });
  addEventListener('resize', () => {
    if (sh.classList.contains('free') && !sh.hidden) { const b = box.getBoundingClientRect(); fMetti(box, fLimita({ x: b.x, y: b.y, w: b.width, h: b.height })); }
    fBarraDopo();
  }, { passive: true });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', finestraPronta); else finestraPronta();

/* ---------- avvisi ---------- */
let tt = 0;
export function toast(msg, kind = '') {
  const t = $('#toast'); t.innerHTML = (kind === 'err' ? ic('triangle-alert') : ic('circle-check')) + '<span>' + esc(msg) + '</span>';
  t.className = 'toast show' + (kind === 'err' ? ' err' : ''); t.hidden = false;
  clearTimeout(tt); tt = setTimeout(() => { t.classList.remove('show'); setTimeout(() => (t.hidden = true), 250); }, kind === 'err' ? 5200 : 2400);
}

/* ---------- conferma in due tocchi ---------- */
export function arm(btn, label, fn) {
  if (!btn.dataset.armed) {
    btn.dataset.armed = '1'; btn.dataset.orig = btn.innerHTML; btn.innerHTML = esc(label); btn.classList.add('armed');
    setTimeout(() => { if (btn.isConnected && btn.dataset.armed) { delete btn.dataset.armed; btn.innerHTML = btn.dataset.orig; btn.classList.remove('armed'); } }, 4000);
    return;
  }
  delete btn.dataset.armed; fn();
}

/* ---------- moduli ---------- */
export let FORM = null;
const optList = (arr, v) => arr.map(o => { const [val, l] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(val)}"${String(val) === String(v ?? '') ? ' selected' : ''}>${esc(l)}</option>`; }).join('');

function fieldHTML(f, v) {
  const id = 'f_' + f.k, req = f.req ? '<em aria-hidden="true">*</em>' : '';
  const cls = 'fld' + (f.half ? ' half' : '') + (f.third ? ' third' : '');
  if (f.t === 'section') return `<div class="fsec" data-k="${f.k}">${esc(f.l)}</div>`;
  if (f.t === 'box') return `<div class="fld fbox" data-k="${f.k}" id="box_${f.k}"></div>`;
  if (f.t === 'rows') { const rows = Array.isArray(v) && v.length ? v : [{}]; return `<div class="${cls}" data-k="${f.k}"><span class="flabel">${esc(f.l)}${req}</span><div class="rowsgrid${f.stack ? ' stack' : ''}" style="--cols:${f.cols.map(c => c.w || '1fr').join(' ')} 40px"><div class="rg-h">${f.cols.map(c => `<span>${esc(c.l)}${c.unit ? ' <em>' + esc(c.unit) + '</em>' : ''}</span>`).join('')}<span></span></div><div class="lines" id="lines_${f.k}">${rows.map(r => rowLineHTML(f, r)).join('')}</div></div><button type="button" class="btn ghost sm" data-act="lineAdd" data-k="${f.k}">${ic('plus')}${esc(f.addLabel || 'Aggiungi riga')}</button>${f.hint ? `<small>${esc(f.hint)}</small>` : ''}</div>`; }
  if (f.t === 'lines') { const rows = Array.isArray(v) && v.length ? v : [{}]; return `<div class="${cls}" data-k="${f.k}"><span class="flabel">${esc(f.l)}${req}</span><div class="lines" id="lines_${f.k}">${rows.map(r => lineHTML(f, r)).join('')}</div><button type="button" class="btn ghost sm" data-act="lineAdd" data-k="${f.k}">${ic('plus')}Aggiungi alimento</button>${f.hint ? `<small>${esc(f.hint)}</small>` : ''}</div>`; }
  // caselle a scelta multipla, divise in gruppi: opts = [[gruppo, [[valore, etichetta], …]], …]
  if (f.t === 'checks') { const sel = new Set(Array.isArray(v) ? v : []); const groups = typeof f.opts === 'function' ? f.opts() : f.opts; return `<div class="${cls} checks" data-k="${f.k}"><span class="flabel">${esc(f.l)}${req}</span>${groups.map(([gl, items]) => `<div class="ck-g">${gl ? `<span class="ck-h">${esc(gl)}</span>` : ''}<div class="ck-l">${items.map(([val, l]) => `<label class="ck"><input type="checkbox" name="${f.k}" value="${esc(val)}"${sel.has(val) ? ' checked' : ''}><span>${esc(l)}</span></label>`).join('')}</div></div>`).join('')}${f.hint ? `<small id="h_${f.k}">${esc(f.hint)}</small>` : ''}</div>`; }
  if (f.t === 'seg') { const opts = typeof f.opts === 'function' ? f.opts() : f.opts; return `<div class="${cls}" data-k="${f.k}"><span class="flabel">${esc(f.l)}${req}</span><div class="seg" role="radiogroup">${opts.map(o => { const [val, l] = Array.isArray(o) ? o : [o, o]; return `<label><input type="radio" name="${f.k}" value="${esc(val)}"${String(val) === String(v ?? '') ? ' checked' : ''}><span>${esc(l)}</span></label>`; }).join('')}</div>${f.hint ? `<small id="h_${f.k}">${esc(f.hint)}</small>` : ''}</div>`; }
  let inp;
  if (f.t === 'select') { const opts = typeof f.opts === 'function' ? f.opts() : f.opts; inp = `<select id="${id}" name="${f.k}">${f.blank === false ? '' : `<option value="">${esc(f.blank || '—')}</option>`}${optList(opts, v)}</select>`; }
  else if (f.t === 'textarea') inp = `<textarea id="${id}" name="${f.k}" rows="3" placeholder="${esc(f.ph || '')}">${esc(v ?? '')}</textarea>`;
  else {
    const t = f.t === 'number' ? 'text' : f.t === 'date' ? 'date' : f.t === 'time' ? 'time' : f.t === 'email' ? 'email' : f.t === 'password' ? 'password' : 'text';
    const im = f.t === 'number' ? ' inputmode="decimal"' : '';
    const val = f.t === 'number' && v !== null && v !== undefined && v !== '' ? String(v).replace('.', ',') : (v ?? '');
    inp = `<div class="inwrap">${f.pre ? `<span class="pre">${esc(f.pre)}</span>` : ''}<input id="${id}" name="${f.k}" type="${t}"${im}${f.list ? ` list="dl_${f.k}"` : ''} value="${esc(val)}"${f.ph ? ` placeholder="${esc(f.ph)}"` : ''} autocomplete="${f.ac || 'off'}">${f.unit ? `<span class="unit" id="u_${f.k}">${esc(f.unit)}</span>` : ''}</div>${f.list ? `<datalist id="dl_${f.k}">${f.list.map(x => `<option value="${esc(x)}">`).join('')}</datalist>` : ''}`;
  }
  return `<label class="${cls}" data-k="${f.k}"><span class="flabel">${esc(f.l)}${req}</span>${inp}${f.hint ? `<small id="h_${f.k}">${esc(f.hint)}</small>` : ''}</label>`;
}
function lineHTML(f, r) { const opts = f.opts(); return `<div class="line"><select data-line="prodottoId" aria-label="Alimento"><option value="">Scegli alimento</option>${optList(opts, r.prodottoId)}</select><div class="inwrap"><input data-line="kg" type="text" inputmode="decimal" placeholder="0" aria-label="kg per capo" value="${esc(r.kg ?? '')}"><span class="unit">kg</span></div><button type="button" class="iconbtn" data-act="lineDel" aria-label="Rimuovi">${ic('x')}</button></div>`; }
// `stack`: ogni riga è un riquadro con l'etichetta sopra ogni casella (per righe con molte colonne, anche sul telefono)
function rowLineHTML(f, r) {
  return `<div class="line rg">${f.cols.map(c => {
    const val = r[c.k]; let h;
    if (c.t === 'select') { const opts = typeof c.opts === 'function' ? c.opts() : c.opts; h = `<select data-line="${c.k}" aria-label="${esc(c.l)}"><option value="">${esc(c.ph || '—')}</option>${optList(opts, val)}</select>`; }
    else { const num = c.t === 'number'; const sv = num && val !== null && val !== undefined && val !== '' ? String(val).replace('.', ',') : (val ?? '');
      h = `<input data-line="${c.k}" type="text"${num ? ' inputmode="decimal"' : ''}${c.list ? ` list="dlr_${f.k}_${c.k}"` : ''} placeholder="${esc(c.ph || '')}" aria-label="${esc(c.l)}" value="${esc(sv)}">`; }
    return f.stack ? `<label class="rg-c"><span>${esc(c.l)}${c.unit ? ' <em>' + esc(c.unit) + '</em>' : ''}</span>${h}</label>` : h;
  }).join('')}<button type="button" class="iconbtn" data-act="lineDel" aria-label="Rimuovi">${ic('x')}</button>${f.cols.filter(c => c.list).map(c => `<datalist id="dlr_${f.k}_${c.k}">${c.list.map(x => `<option value="${esc(x)}">`).join('')}</datalist>`).join('')}</div>`;
}
export function addLine(k) { const f = FORM && FORM.fields.find(x => x.k === k); if (f) document.getElementById('lines_' + k).insertAdjacentHTML('beforeend', f.t === 'rows' ? rowLineHTML(f, {}) : lineHTML(f, {})); }

export function readForm() {
  const v = {}; if (!FORM) return v;
  FORM.fields.forEach(f => {
    if (f.t === 'section' || f.t === 'box') return;
    if (f.t === 'rows') { v[f.k] = $$('#lines_' + f.k + ' .line').map(r => { const o = {}; f.cols.forEach(c => { const el = r.querySelector(`[data-line="${c.k}"]`); const s = el ? el.value.trim() : ''; o[c.k] = c.t === 'number' ? (s === '' ? null : N(s)) : s; }); return o; }).filter(o => f.cols.some(c => o[c.k] !== null && o[c.k] !== '')); return; }
    if (f.t === 'lines') { v[f.k] = $$('#lines_' + f.k + ' .line').map(r => ({ prodottoId: r.querySelector('[data-line=prodottoId]').value, kg: r.querySelector('[data-line=kg]').value === '' ? null : N(r.querySelector('[data-line=kg]').value) })).filter(r => r.prodottoId); return; }
    if (f.t === 'seg') { const c = $(`#frm input[name="${f.k}"]:checked`); v[f.k] = c ? c.value : ''; return; }
    if (f.t === 'checks') { v[f.k] = $$(`#frm input[name="${f.k}"]:checked`).map(x => x.value); return; }
    const el = document.getElementById('f_' + f.k); if (!el) return; const s = el.value.trim();
    v[f.k] = f.t === 'number' ? (s === '' ? null : N(s)) : s;
  });
  return v;
}
export function setVal(k, val) {
  const f = FORM && FORM.fields.find(x => x.k === k);
  if (f && f.t === 'seg') { $$(`#frm input[name="${k}"]`).forEach(r => (r.checked = r.value === String(val))); return; }
  if (f && f.t === 'checks') { const a = new Set(Array.isArray(val) ? val : []); $$(`#frm input[name="${k}"]`).forEach(r => (r.checked = a.has(r.value))); return; }
  const el = document.getElementById('f_' + k); if (el) el.value = f && f.t === 'number' && val !== null && val !== undefined && val !== '' ? String(val).replace('.', ',') : (val ?? '');
}
export function setHint(k, text) { const h = document.getElementById('h_' + k); if (h) h.textContent = text; }
export function setUnit(k, text) { const h = document.getElementById('u_' + k); if (h) h.textContent = text; }
function update(changed) {
  if (!FORM) return; const v = readForm();
  FORM.fields.forEach(f => { if (!f.show) return; const w = $(`#frm [data-k="${f.k}"]`); if (w) w.hidden = !f.show(v); });
  if (FORM.onChange) FORM.onChange(changed, v);
}
export function openForm(o) {
  FORM = Object.assign({ dirty: new Set() }, o);
  const v = o.values || {};
  const body = openSheet(o.title, `<form id="frm" novalidate><div class="fgrid">${o.fields.map(f => fieldHTML(f, v[f.k])).join('')}</div><div class="formmsg" id="formmsg" role="alert" hidden></div><div class="factions">${o.onDelete ? `<button type="button" class="btn ghost danger" data-act="formdel">${ic('trash-2')}Elimina</button>` : ''}<span class="sp"></span><button type="button" class="btn ghost" data-act="close">Annulla</button><button type="submit" class="btn primary" id="frmSubmit">${esc(o.saveLabel || 'Salva')}</button></div></form>`, { sub: o.sub || '' });
  const frm = $('#frm', body);
  frm.addEventListener('input', e => { const n = e.target.name; if (n) FORM && FORM.dirty.add(n); update(n || 'lines'); });
  frm.addEventListener('change', e => update(e.target.name || 'lines'));
  frm.addEventListener('submit', async e => {
    e.preventDefault(); if (!FORM) return;
    const vals = readForm(); const bad = [];
    FORM.fields.forEach(f => {
      if (f.t === 'section' || f.t === 'box') return;
      const w = $(`#frm [data-k="${f.k}"]`); const vis = !(w && w.hidden);
      if (!vis) { vals[f.k] = f.t === 'lines' || f.t === 'rows' || f.t === 'checks' ? [] : null; return; }
      const miss = f.req && (vals[f.k] === null || vals[f.k] === '' || (Array.isArray(vals[f.k]) && !vals[f.k].length));
      if (w) w.classList.toggle('err', !!miss); if (miss) bad.push(f.l);
    });
    const extra = !bad.length && FORM.validate ? FORM.validate(vals) : null;
    const msg = $('#formmsg');
    if (bad.length || extra) { msg.hidden = false; msg.textContent = extra || 'Da compilare: ' + bad.join(', '); return; }
    const b = $('#frmSubmit'); b.disabled = true; b.textContent = 'Salvataggio…';
    const keep = FORM;
    try { await keep.onSave(vals); closeSheet(); toast(keep.done || 'Salvato'); }
    catch (err) { console.warn(err); b.disabled = false; b.textContent = keep.saveLabel || 'Salva'; msg.hidden = false; msg.textContent = err && err.message ? err.message : 'Salvataggio non riuscito.'; }
  });
  update(null);
  if (window.matchMedia('(min-width: 900px)').matches) setTimeout(() => { const first = frm.querySelector('input:not([type=date]):not([type=radio]),select'); if (first) first.focus(); }, 60);
}
export async function formDelete(btn) {
  if (!FORM || !FORM.onDelete) return;
  arm(btn, 'Conferma eliminazione', async () => {
    btn.disabled = true;
    try { const ok = await FORM.onDelete(); if (ok !== false) { closeSheet(); toast('Eliminato'); } else btn.disabled = false; }
    catch (e) { btn.disabled = false; toast(e.message || 'Eliminazione non riuscita', 'err'); }
  });
}

/* ---------- frammenti ricorrenti ---------- */
export const chip = (t, lv = '') => `<span class="chip ${lv}">${esc(t)}</span>`;
export const exChip = o => o && o.esempio ? '<span class="chip ghost">Esempio</span>' : '';
export const fact = (l, v) => `<div class="fact"><dt>${esc(l)}</dt><dd>${v}</dd></div>`;
export const empty = (icon, t, s, btn = '') => `<div class="empty">${ic(icon, 'big')}<b>${esc(t)}</b><p>${esc(s)}</p>${btn}</div>`;
export const tabs = (sec, items, cur) => `<div class="tabs" role="tablist">${items.map(([k, l, n]) => `<button role="tab" data-act="sub" data-sec="${sec}" data-sub="${k}" aria-selected="${cur === k}">${esc(l)}${n !== undefined ? `<span class="n">${n}</span>` : ''}</button>`).join('')}</div>`;
export const newBtn = (form, label, attrs = '', cls = 'primary') => `<button class="btn ${cls} sm" data-act="new" data-form="${form}" ${attrs}>${ic('plus')}${esc(label)}</button>`;
