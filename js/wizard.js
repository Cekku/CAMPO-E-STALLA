// Registrazione guidata di un'attività: tipologia → campi (anche più di uno) → dettagli
import { S, UI, get } from './state.js';
import { esc, nf, N, uid, byName } from './util.js';
import { ic } from './icons.js';
import { TIPI_OP, campoHa, cropOf, cropColor } from './domain.js';
import { thumb } from './geo.js';
import { openSheet, openForm, toast } from './ui.js';
import { SPEC } from './forms.js';

const TIPI = [
  ['Lavorazione terreno', 'tractor', 'Aratura, erpicatura, rullatura'], ['Semina', 'sprout', 'Semina e trapianto'], ['Concimazione', 'leaf', 'Nutrizione e fertilizzanti'],
  ['Trattamento fitosanitario', 'shield-check', 'Difesa da malattie e insetti'], ['Diserbo', 'leaf', 'Controllo delle infestanti'], ['Irrigazione', 'droplets', 'Turni e volumi d\'acqua'],
  ['Sfalcio', 'wheat', 'Fienagione e foraggi'], ['Raccolta', 'wheat', 'Trebbiatura, trinciatura'], ['Altro', 'clipboard-list', 'Qualsiasi altra operazione'],
];
const W = { tipo: null, campi: new Set(), q: '', stato: 'Fatto' };

export function startWizard(pre = {}) {
  W.tipo = pre.tipo || null; W.campi = new Set(pre.campoId ? [pre.campoId] : []); W.q = ''; W.stato = pre.stato || 'Fatto';
  if (!S.campi.length) { toast('Prima aggiungi almeno un campo.', 'err'); return; }
  if (W.tipo && W.campi.size) return step3(); if (W.tipo) return step2();
  step1();
}
const bar = n => `<div class="wz-steps">${[1, 2, 3].map(i => `<i class="${i <= n ? 'on' : ''}"></i>`).join('')}</div>`;

function step1() {
  const b = openSheet('Nuova attività', `${bar(1)}<p class="wz-q">Che lavoro hai fatto o devi fare?</p>
  <div class="seg wide"><label><input type="radio" name="wzStato" value="Fatto"${W.stato === 'Fatto' ? ' checked' : ''}><span>Fatta</span></label><label><input type="radio" name="wzStato" value="Pianificata"${W.stato === 'Pianificata' ? ' checked' : ''}><span>Da pianificare</span></label></div>
  <div class="wz-types">${TIPI.map(([t, i, s]) => `<button data-wz="tipo" data-v="${esc(t)}"><span class="q-ic">${ic(i)}</span><b>${esc(t)}</b><span>${esc(s)}</span></button>`).join('')}</div>`);
  b.onclick = e => { const x = e.target.closest('[data-wz=tipo]'); if (x) { W.tipo = x.dataset.v; step2(); } };
  b.onchange = e => { if (e.target.name === 'wzStato') W.stato = e.target.value; };
}

function campiList() {
  const q = W.q.toLowerCase();
  const list = [...S.campi].filter(c => !q || (c.nome + ' ' + cropOf(c)).toLowerCase().includes(q)).sort(byName);
  return list.map(c => { const col = cropColor(c); return `<label class="wz-field${W.campi.has(c.id) ? ' on' : ''}"><span class="fc-thumb sm" style="color:${col}">${thumb(c.geom, 44, col)}</span><span class="r-main"><b>${esc(c.nome)}</b><span><i class="dot" style="background:${col}"></i>${esc(cropOf(c) || 'Nessuna coltura')}</span></span><span class="chip ok num">${nf(campoHa(c), 2)} ha</span><input type="checkbox" value="${c.id}"${W.campi.has(c.id) ? ' checked' : ''}></label>`; }).join('') || '<div class="empty slim">Nessun campo trovato.</div>';
}
function step2() {
  const b = openSheet(W.tipo, `${bar(2)}<p class="wz-q">Su quali campi?</p>
  <div class="wz-tools"><div class="search">${ic('search')}<input class="inp" id="wzq" placeholder="Cerca campo o coltura" autocomplete="off"></div><label class="wz-all"><span>Tutti</span><input type="checkbox" id="wzAll"></label></div>
  <div class="wz-list" id="wzList">${campiList()}</div>
  <div class="wz-foot"><button class="btn ghost" data-wz="back">${ic('chevron-left')}Indietro</button><span class="sp"></span><span class="muted small" id="wzSum"></span><button class="btn primary" data-wz="next" id="wzNext">Avanti</button></div>`);
  const sum = () => { const ha = [...W.campi].reduce((t, id) => t + campoHa(get('campi', id) || {}), 0); $('#wzSum').textContent = W.campi.size ? `${W.campi.size} ${W.campi.size === 1 ? 'campo' : 'campi'} · ${nf(ha, 2)} ha` : 'Nessun campo scelto'; $('#wzNext').disabled = !W.campi.size; };
  const $ = s => b.querySelector(s);
  b.onclick = e => { const x = e.target.closest('[data-wz]'); if (!x) return; if (x.dataset.wz === 'back') step1(); if (x.dataset.wz === 'next' && W.campi.size) step3(); };
  b.onchange = e => {
    if (e.target.id === 'wzAll') { S.campi.forEach(c => e.target.checked ? W.campi.add(c.id) : W.campi.delete(c.id)); $('#wzList').innerHTML = campiList(); }
    else if (e.target.type === 'checkbox') { e.target.checked ? W.campi.add(e.target.value) : W.campi.delete(e.target.value); e.target.closest('.wz-field').classList.toggle('on', e.target.checked); }
    sum();
  };
  b.oninput = e => { if (e.target.id === 'wzq') { W.q = e.target.value; $('#wzList').innerHTML = campiList(); } };
  sum();
}

function step3() {
  const ids = [...W.campi]; const campi = ids.map(id => get('campi', id)).filter(Boolean);
  const totHa = campi.reduce((t, c) => t + campoHa(c), 0);
  const fields = SPEC.operazioni.fields().filter(f => !['tipo', 'campoId', 'stato'].includes(f.k)).map(f => f.show ? Object.assign({}, f, { show: (sh => v => sh(Object.assign({}, v, { tipo: W.tipo })))(f.show) }) : f);
  const q = fields.find(f => f.k === 'quantita'); if (q) q.hint = campi.length > 1 ? `Totale su ${nf(totHa, 2)} ha, ripartito per superficie` : 'Dose × ettari, si scarica dal magazzino';
  const vals = Object.assign(SPEC.operazioni.defaults(), { tipo: W.tipo, stato: W.stato });
  openForm({
    title: W.tipo, sub: (W.stato === 'Pianificata' ? 'Da fare · ' : '') + (campi.length === 1 ? campi[0].nome + ' · ' + nf(totHa, 2) + ' ha' : campi.length + ' campi · ' + nf(totHa, 2) + ' ha'),
    fields, values: vals, saveLabel: W.stato === 'Pianificata' ? 'Pianifica' : 'Registra',
    onChange(ch, v) {
      const p = get('prodotti', v.prodottoId);
      if (ch === null || ch === 'prodottoId') { const u = document.getElementById('u_dose'); if (u) u.textContent = (p ? p.unita : '') + '/ha'; const u2 = document.getElementById('u_quantita'); if (u2) u2.textContent = p ? p.unita : ''; }
      if (['dose', 'prodottoId'].includes(ch) && v.dose !== null) { const el = document.getElementById('f_quantita'); if (el && !(window.__wzDirty)) el.value = String(Math.round(N(v.dose) * totHa * 100) / 100).replace('.', ','); }
      if (ch === 'quantita') window.__wzDirty = true;
    },
    onSave: async v => {
      window.__wzDirty = false;
      const gruppo = campi.length > 1 ? uid() : null;
      for (const c of campi) {
        const share = totHa ? campoHa(c) / totHa : 1 / campi.length;
        const rec = Object.assign({}, v, { tipo: W.tipo, stato: W.stato, campoId: c.id });
        if (gruppo) rec.gruppo = gruppo;
        if (N(v.quantita) > 0) rec.quantita = Math.round(N(v.quantita) * share * 100) / 100;
        if (N(v.ore) > 0 && campi.length > 1) rec.ore = Math.round(N(v.ore) * share * 100) / 100;
        if (N(v.costoExtra) > 0 && campi.length > 1) rec.costoExtra = Math.round(N(v.costoExtra) * share * 100) / 100;
        if (N(v.raccolto) > 0 && campi.length > 1) rec.raccolto = Math.round(N(v.raccolto) * share * 100) / 100;
        await SPEC.operazioni.save(null, rec);
      }
    },
  });
  window.__wzDirty = false;
  if (campi.length) setTimeout(() => { const f = document.getElementById('frm'); if (f) { const s = document.createElement('div'); s.className = 'wz-picked'; s.innerHTML = bar(3) + campi.map(c => `<span class="chip"><i class="dot" style="background:${cropColor(c)}"></i>${esc(c.nome)}</span>`).join('') + '<button type="button" class="linkbtn" data-wz2="campi">Cambia campi</button>'; f.prepend(s); s.querySelector('[data-wz2]').onclick = () => step2(); } }, 0);
}
