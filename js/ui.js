// Componenti d'interfaccia: foglio a scomparsa, avvisi, moduli
import { $, $$, esc, N } from './util.js';
import { ic } from './icons.js';

/* ---------- foglio ---------- */
let onCloseCb = null;
export function openSheet(title, html, { wide = false, onClose = null, sub = '' } = {}) {
  const sh = $('#sheet');
  $('#sheetTitle').textContent = title;
  $('#sheetSub').textContent = sub; $('#sheetSub').hidden = !sub;
  $('#sheetBody').innerHTML = html;
  sh.classList.toggle('wide', wide);
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
  if (f.t === 'lines') { const rows = Array.isArray(v) && v.length ? v : [{}]; return `<div class="${cls}" data-k="${f.k}"><span class="flabel">${esc(f.l)}${req}</span><div class="lines" id="lines_${f.k}">${rows.map(r => lineHTML(f, r)).join('')}</div><button type="button" class="btn ghost sm" data-act="lineAdd" data-k="${f.k}">${ic('plus')}Aggiungi alimento</button>${f.hint ? `<small>${esc(f.hint)}</small>` : ''}</div>`; }
  if (f.t === 'seg') { const opts = typeof f.opts === 'function' ? f.opts() : f.opts; return `<div class="${cls}" data-k="${f.k}"><span class="flabel">${esc(f.l)}${req}</span><div class="seg" role="radiogroup">${opts.map(o => { const [val, l] = Array.isArray(o) ? o : [o, o]; return `<label><input type="radio" name="${f.k}" value="${esc(val)}"${String(val) === String(v ?? '') ? ' checked' : ''}><span>${esc(l)}</span></label>`; }).join('')}</div>${f.hint ? `<small id="h_${f.k}">${esc(f.hint)}</small>` : ''}</div>`; }
  let inp;
  if (f.t === 'select') { const opts = typeof f.opts === 'function' ? f.opts() : f.opts; inp = `<select id="${id}" name="${f.k}">${f.blank === false ? '' : `<option value="">${esc(f.blank || '—')}</option>`}${optList(opts, v)}</select>`; }
  else if (f.t === 'textarea') inp = `<textarea id="${id}" name="${f.k}" rows="3" placeholder="${esc(f.ph || '')}">${esc(v ?? '')}</textarea>`;
  else {
    const t = f.t === 'number' ? 'text' : f.t === 'date' ? 'date' : f.t === 'email' ? 'email' : f.t === 'password' ? 'password' : 'text';
    const im = f.t === 'number' ? ' inputmode="decimal"' : '';
    const val = f.t === 'number' && v !== null && v !== undefined && v !== '' ? String(v).replace('.', ',') : (v ?? '');
    inp = `<div class="inwrap">${f.pre ? `<span class="pre">${esc(f.pre)}</span>` : ''}<input id="${id}" name="${f.k}" type="${t}"${im}${f.list ? ` list="dl_${f.k}"` : ''} value="${esc(val)}"${f.ph ? ` placeholder="${esc(f.ph)}"` : ''} autocomplete="${f.ac || 'off'}">${f.unit ? `<span class="unit" id="u_${f.k}">${esc(f.unit)}</span>` : ''}</div>${f.list ? `<datalist id="dl_${f.k}">${f.list.map(x => `<option value="${esc(x)}">`).join('')}</datalist>` : ''}`;
  }
  return `<label class="${cls}" data-k="${f.k}"><span class="flabel">${esc(f.l)}${req}</span>${inp}${f.hint ? `<small id="h_${f.k}">${esc(f.hint)}</small>` : ''}</label>`;
}
function lineHTML(f, r) { const opts = f.opts(); return `<div class="line"><select data-line="prodottoId" aria-label="Alimento"><option value="">Scegli alimento</option>${optList(opts, r.prodottoId)}</select><div class="inwrap"><input data-line="kg" type="text" inputmode="decimal" placeholder="0" aria-label="kg per capo" value="${esc(r.kg ?? '')}"><span class="unit">kg</span></div><button type="button" class="iconbtn" data-act="lineDel" aria-label="Rimuovi">${ic('x')}</button></div>`; }
export function addLine(k) { const f = FORM && FORM.fields.find(x => x.k === k); if (f) document.getElementById('lines_' + k).insertAdjacentHTML('beforeend', lineHTML(f, {})); }

export function readForm() {
  const v = {}; if (!FORM) return v;
  FORM.fields.forEach(f => {
    if (f.t === 'section') return;
    if (f.t === 'lines') { v[f.k] = $$('#lines_' + f.k + ' .line').map(r => ({ prodottoId: r.querySelector('[data-line=prodottoId]').value, kg: r.querySelector('[data-line=kg]').value === '' ? null : N(r.querySelector('[data-line=kg]').value) })).filter(r => r.prodottoId); return; }
    if (f.t === 'seg') { const c = $(`#frm input[name="${f.k}"]:checked`); v[f.k] = c ? c.value : ''; return; }
    const el = document.getElementById('f_' + f.k); if (!el) return; const s = el.value.trim();
    v[f.k] = f.t === 'number' ? (s === '' ? null : N(s)) : s;
  });
  return v;
}
export function setVal(k, val) {
  const f = FORM && FORM.fields.find(x => x.k === k);
  if (f && f.t === 'seg') { $$(`#frm input[name="${k}"]`).forEach(r => (r.checked = r.value === String(val))); return; }
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
      if (f.t === 'section') return;
      const w = $(`#frm [data-k="${f.k}"]`); const vis = !(w && w.hidden);
      if (!vis) { vals[f.k] = f.t === 'lines' ? [] : null; return; }
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
