// Magazzino → Da fatture: righe delle fatture di sementi, concimi, fitofarmaci e gasolio da caricare (solo titolare).
// La logica è in js/magfatture.js.
import { S, get } from '../state.js';
import { esc, nf, eur, fd, N } from '../util.js';
import { ic } from '../icons.js';
import { empty, openSheet, closeSheet, toast } from '../ui.js';
import { UNITA } from '../domain.js';
import * as MF from '../magfatture.js';
import { movRow } from './magazzino.js';

const quanti = (n, uno, tanti) => n === 1 ? '1 ' + uno : n + ' ' + tanti;
const info = x => `${fd(x.data)} · ${esc(x.r.controparte || '')} · ${nf(x.r.quantita, 2)} ${esc(x.r.um || '')} · ${eur(x.r.importo, 2)}`;
function riga(x, btns, extra = '') {
  return `<div class="row"><span class="r-icon in">${ic('file-text')}</span><span class="r-main"><b>${esc(x.r.descrizione || '(senza descrizione)')}</b><span>${info(x)}${extra}</span></span><span class="r-side"><span class="btns">${btns}</span></span></div>`;
}

export const contaDaFare = () => MF.elenco().daFare.length;

export function sezione() {
  const E = MF.elenco();
  const fatte = S.movimenti.filter(m => m.fattRiga && m.data >= E.da).sort((a, b) => b.data.localeCompare(a.data));
  const testa = `<section class="card"><div class="card-h"><h2>${ic('file-down')}Carico dalle fatture</h2><button class="btn sm primary" data-act="mf-controlla">${ic('refresh-cw')}Controlla le fatture</button></div>
    <p class="muted small">Le righe delle fatture di sementi, concimi, fitofarmaci e gasolio entrano in magazzino come carichi. La prima volta abbini tu la riga a un prodotto (o ne crei uno nuovo): dalle fatture dopo, quel prodotto si carica da solo.</p>
    <label class="fld"><span class="flabel">Carica le fatture dal</span><input class="inp" type="date" data-act="mf-da" value="${esc(E.da)}"><small>Le fatture più vecchie non entrano, così non diventano doppi i carichi già scritti a mano.</small></label></section>`;
  const daFare = `<section class="card"><div class="card-h"><h2>Da abbinare</h2><span class="count">${E.daFare.length}</span></div><div class="list">${E.daFare.length ? E.daFare.map(x => riga(x,
    `<button class="btn sm primary" data-act="mf-abbina" data-k="${esc(x.k)}">${ic('link')}Abbina</button><button class="btn sm ghost" data-act="mf-togli" data-k="${esc(x.k)}">Non caricare</button>`,
    x.proposto ? ` · forse <b>${esc(x.proposto.nome)}</b>` : '')).join('') : empty('circle-check', 'Niente da abbinare', S.fatture.length ? 'Tutte le righe di sementi, concimi, fitofarmaci e gasolio dal ' + fd(E.da) + ' sono a posto.' : 'Non ci sono ancora fatture: caricale dai Conti.')}</div></section>`;
  const caricate = `<section class="card"><div class="card-h"><h2>Caricate dalle fatture</h2><span class="count">${fatte.length}</span></div><div class="list">${fatte.length ? fatte.slice(0, 60).map(movRow).join('') : '<div class="empty slim">Ancora nessun carico dalle fatture.</div>'}</div>${fatte.length > 60 ? `<p class="muted small">Le altre sono in Movimenti.</p>` : ''}</section>`;
  const tolte = E.tolte.length ? `<section class="card"><div class="card-h"><h2>Non caricate</h2><span class="count">${E.tolte.length}</span></div><div class="list">${E.tolte.map(x => riga(x, `<button class="btn sm ghost" data-act="mf-rimetti" data-k="${esc(x.k)}">${ic('rotate-ccw')}Rimetti</button>`)).join('')}</div></section>` : '';
  return testa + daFare + caricate + tolte;
}

/* ---------------- foglio per abbinare una riga ---------------- */
let aperta = null;   // riga del foglio aperto
const opt = (v, t, sel) => `<option value="${esc(v)}"${sel ? ' selected' : ''}>${esc(t)}</option>`;
function foglio(k) {
  const x = MF.elenco().daFare.find(y => y.k === k); if (!x) return toast('Riga non trovata: forse è già stata caricata.', 'err');
  aperta = x;
  const ps = S.prodotti.filter(p => MF.CAT_CAMPAGNA.includes(p.categoria)).sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'it'));
  const sel = x.proposto ? x.proposto.id : '__nuovo';
  const uNuovo = MF.unitaPer(x.r.um); const cat = MF.CAT_FATT[x.r.categoria] || 'Altro';
  const qNuovo = MF.quantita(x.r, { unita: uNuovo });
  const q = x.proposto ? (x.qProp ?? '') : (qNuovo ?? N(x.r.quantita));
  openSheet('Carica in magazzino', `<div class="fgrid">
    <div class="fld"><span class="flabel">Riga della fattura</span><b>${esc(x.r.descrizione || '')}</b><small>${info(x)}${x.r.numero ? ' · fatt. ' + esc(x.r.numero) : ''}</small></div>
    <label class="fld"><span class="flabel">Prodotto del magazzino</span><select class="inp" id="mfProd" data-act="mf-scegli">${opt('__nuovo', '+ Prodotto nuovo', sel === '__nuovo')}${ps.map(p => opt(p.id, `${p.nome} (${p.unita || ''})`, p.id === sel)).join('')}</select></label>
    <div id="mfNuovo" class="fgrid"${sel === '__nuovo' ? '' : ' hidden'}>
      <label class="fld"><span class="flabel">Nome del prodotto nuovo</span><input class="inp" id="mfNome" type="text" value="${esc(String(x.r.descrizione || '').slice(0, 60))}" autocomplete="off"></label>
      <label class="fld half"><span class="flabel">Categoria</span><select class="inp" id="mfCat">${MF.CAT_CAMPAGNA.map(c => opt(c, c, c === cat)).join('')}</select></label>
      <label class="fld half"><span class="flabel">Unità di misura</span><select class="inp" id="mfUm" data-act="mf-scegli">${UNITA.map(u => opt(u, u, u === uNuovo)).join('')}</select></label>
    </div>
    <label class="fld"><span class="flabel">Quantità da caricare (<span id="mfUnita">${esc(x.proposto ? x.proposto.unita || '' : uNuovo)}</span>)</span><input class="inp" id="mfQ" type="number" step="any" min="0" value="${q === '' ? '' : esc(String(q))}"><small>In fattura: ${nf(x.r.quantita, 2)} ${esc(x.r.um || 'senza unità')}. Se la fattura conta sacchi o confezioni, scrivi quanti kg, litri o dosi sono in tutto.</small></label>
    <label class="fld chk"><input type="checkbox" id="mfRic" checked> <span>Ricorda: le prossime fatture con queste parole si caricano da sole</span></label>
    <label class="fld"><span class="flabel">Parole da cercare nelle fatture</span><input class="inp" id="mfParole" type="text" value="${esc(MF.paroleDa(x.r.descrizione))}" autocomplete="off"><small>Tutte devono esserci nella descrizione. Più nomi: separali con la virgola.</small></label>
    <div class="factions"><span class="sp"></span><button class="btn ghost" data-act="close">Annulla</button><button class="btn primary" data-act="mf-salva" data-k="${esc(k)}">${ic('download')}Carica</button></div></div>`);
}
const val = id => (document.getElementById(id) || {}).value || '';

export async function mfAct(a, b, d) {
  switch (a) {
    case 'mf-controlla': {
      b.disabled = true;
      try {
        const n = await MF.controllaOra(); const resta = MF.elenco().daFare.length;
        return toast((n ? 'Caricate in magazzino ' + quanti(n, 'riga', 'righe') + ' di fattura' : 'Nessuna riga nuova da caricare') + (resta ? ' · ' + quanti(resta, 'riga', 'righe') + ' da abbinare a mano' : ''));
      } finally { b.disabled = false; }
    }
    case 'mf-abbina': return foglio(d.k);
    case 'mf-togli': await MF.togli(d.k, true); return toast('Riga tolta: non entra in magazzino');
    case 'mf-rimetti': await MF.togli(d.k, false); return toast('Riga rimessa fra quelle da abbinare');
    case 'mf-salva': {
      const pid = val('mfProd'); const ric = !!(document.getElementById('mfRic') || {}).checked;
      b.disabled = true;
      try {
        const n = await MF.abbina(d.k, { pid: pid === '__nuovo' ? null : pid, nuovo: pid === '__nuovo' ? { nome: val('mfNome'), categoria: val('mfCat'), unita: val('mfUm') } : null, q: val('mfQ'), ricorda: ric, paroleR: val('mfParole') });
        closeSheet(); toast('Caricato in magazzino' + (n ? ' (e altre ' + quanti(n, 'riga', 'righe') + ' dello stesso prodotto)' : ''));
      } finally { b.disabled = false; }
      return;
    }
  }
}
export async function mfChange(t) {
  if (t.dataset.act === 'mf-da') { await MF.salvaDa(t.value); return toast('Data salvata'); }
  if (t.dataset.act === 'mf-scegli') {
    const pid = val('mfProd'); const nuovo = pid === '__nuovo';
    const box = document.getElementById('mfNuovo'); if (box) box.hidden = !nuovo;
    const p = nuovo ? null : get('prodotti', pid);
    const u = document.getElementById('mfUnita'); if (u) u.textContent = nuovo ? val('mfUm') : (p ? p.unita || '' : '');
    const q = document.getElementById('mfQ');   // quantità ricalcolata nell'unità scelta (vuota se non si sa convertire)
    if (q && aperta) { const v = MF.quantita(aperta.r, nuovo ? { unita: val('mfUm') } : (p || {})); q.value = v === null ? '' : String(v); }
  }
}
