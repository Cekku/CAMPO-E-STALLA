// Magazzino → Inventario di tutti i prodotti in una volta (1.78.2, chiesto da Marco: "non li ho tutti in carico, dammi la possibilità
// di inserire cosa ho"). Per ogni prodotto la giacenza calcolata e la casella "contato": si salvano insieme come movimenti Inventario
// (la giacenza riparte dalla quantità contata, vedi domain.js). Un prodotto lasciato vuoto non cambia, salvo la spunta "a 0".
import { S } from '../state.js';
import * as store from '../store.js';
import { esc, nf, N, uid, today, okD, fd } from '../util.js';
import { ic } from '../icons.js';
import { openSheet, closeSheet, toast } from '../ui.js';
import { CATEGORIE, giacAl } from '../domain.js';

const quanti = (n, uno, tanti) => n === 1 ? '1 ' + uno : n + ' ' + tanti;
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export function apri() {
  if (!S.prodotti.length) return toast('Il magazzino è vuoto: prima aggiungi i prodotti', 'err');
  const oggi = today();
  const ps = [...S.prodotti].sort((a, b) => (a.categoria || '').localeCompare(b.categoria || '', 'it') || (a.nome || '').localeCompare(b.nome || '', 'it'));
  const cats = CATEGORIE.filter(c => ps.some(p => p.categoria === c));
  const righe = ps.map(p => { const g = giacAl(p, oggi);
    return `<div class="inv-r" data-cat="${esc(p.categoria || '')}" data-nome="${esc(norm(p.nome))}"><span class="inv-n"><b>${esc(p.nome)}</b><small class="muted">${esc(p.categoria || '')} · in magazzino per l'app: <span class="num" data-calc="${esc(p.id)}">${nf(g, 2)}</span> ${esc(p.unita || '')}</small></span>
      <label class="inv-q"><input class="inp" type="number" step="any" min="0" inputmode="decimal" data-inv="${esc(p.id)}" placeholder="contato" aria-label="Quantità contata di ${esc(p.nome)}"><span>${esc(p.unita || '')}</span></label></div>`; }).join('');
  openSheet('Inventario: cosa hai in magazzino', `<div class="inv">
    <p class="muted small">Scrivi quanto hai davvero di ogni prodotto. Da quel giorno la giacenza riparte dal numero scritto; i carichi e gli scarichi dopo si aggiungono come sempre. Lascia vuoto quello che non hai contato.</p>
    <div class="inv-top"><label class="fld"><span class="flabel">Contato il</span><input class="inp" type="date" id="invData" value="${oggi}" max="${oggi}"></label>
      <label class="fld"><span class="flabel">Categoria</span><select class="inp" id="invCat"><option value="">Tutte</option>${cats.map(c => `<option>${esc(c)}</option>`).join('')}</select></label>
      <label class="fld"><span class="flabel">Cerca</span><input class="inp" type="search" id="invQ" placeholder="nome del prodotto" autocomplete="off"></label></div>
    <div class="inv-list">${righe}</div>
    <label class="fld chk"><input type="checkbox" id="invZero"> <span>I prodotti di questo elenco lasciati vuoti non li ho: mettili a 0</span></label>
    <div class="factions"><span class="muted small" id="invConta"></span><span class="sp"></span><button class="btn ghost" data-act="close">Annulla</button><button class="btn primary" data-act="inv-salva">${ic('check')}Salva l'inventario</button></div></div>`);
  const box = document.getElementById('sheetBody') || document;
  const filtra = () => {
    const c = (document.getElementById('invCat') || {}).value || ''; const q = norm((document.getElementById('invQ') || {}).value || '').trim();
    box.querySelectorAll('.inv-r').forEach(r => { r.hidden = !((!c || r.dataset.cat === c) && (!q || r.dataset.nome.includes(q))); });
    conta();
  };
  const conta = () => {
    const n = [...box.querySelectorAll('input[data-inv]')].filter(i => i.value !== '').length;
    const el = document.getElementById('invConta'); if (el) el.textContent = n ? quanti(n, 'prodotto contato', 'prodotti contati') : '';
  };
  // la giacenza calcolata segue la data scelta (inventario di un giorno passato)
  const ricalcola = () => {
    const d = (document.getElementById('invData') || {}).value; if (!okD(d)) return;
    box.querySelectorAll('[data-calc]').forEach(s => { const p = S.prodotti.find(y => y.id === s.dataset.calc); if (p) s.textContent = nf(giacAl(p, d), 2); });
  };
  document.getElementById('invCat')?.addEventListener('change', filtra);
  document.getElementById('invQ')?.addEventListener('input', filtra);
  document.getElementById('invData')?.addEventListener('change', ricalcola);
  box.addEventListener('input', e => { if (e.target.dataset && e.target.dataset.inv !== undefined) conta(); });
}

export async function invAct(a, b) {
  if (a !== 'inv-salva') return;
  const box = document.getElementById('sheetBody') || document;
  const data = (document.getElementById('invData') || {}).value;
  if (!okD(data) || data > today()) return toast('Scegli il giorno del conteggio (oggi o prima)', 'err');
  const zero = !!(document.getElementById('invZero') || {}).checked;
  const rows = []; let errati = 0; const creato = new Date().toISOString();
  for (const i of box.querySelectorAll('input[data-inv]')) {
    if (i.validity && i.validity.badInput) { errati++; continue; }   // testo che non è un numero ("12 kg"): non vale come vuoto
    const vuoto = String(i.value).trim() === '';
    if (vuoto && !(zero && !i.closest('.inv-r').hidden)) continue;
    if (vuoto) { const p = S.prodotti.find(y => y.id === i.dataset.inv); if (p && Math.abs(giacAl(p, data)) < 1e-9) continue; }   // già a 0: niente movimento
    const q = vuoto ? 0 : N(i.value); if (!(q >= 0)) { errati++; continue; }
    rows.push({ col: 'movimenti', id: uid(), data: { tipo: 'Inventario', prodottoId: i.dataset.inv, data, quantita: q, creato, note: 'Inventario di tutto il magazzino' } });
  }
  if (errati) return toast('Controlla le quantità: ce n\'è qualcuna non valida', 'err');
  if (!rows.length) return toast('Scrivi almeno una quantità contata', 'err');
  b.disabled = true;
  try { await store.bulkPut(rows); closeSheet(); toast(`Inventario del ${fd(data)} salvato: ${quanti(rows.length, 'prodotto', 'prodotti')}`); }
  finally { b.disabled = false; }
}
