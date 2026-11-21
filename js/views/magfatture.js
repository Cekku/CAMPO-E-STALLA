// Magazzino → Da fatture: righe delle fatture d'acquisto da caricare in magazzino (solo titolare).
// La logica è in js/magfatture.js (salvataggio) e js/magriconosci.js (riconoscimento); i dubbi sono anche nel Centro automatico.
import { S, get } from '../state.js';
import { esc, nf, eur, fd, N } from '../util.js';
import { ic } from '../icons.js';
import { empty, openSheet, closeSheet, toast } from '../ui.js';
import { UNITA } from '../domain.js';
import * as MF from '../magfatture.js';
import { importoNetto } from '../magriconosci.js';
import { movRow } from './magazzino.js';

const quanti = (n, uno, tanti) => n === 1 ? '1 ' + uno : n + ' ' + tanti;
const info = x => `${fd(x.data)} · ${esc(x.r.controparte || '')} · ${nf(x.r.quantita, 2)} ${esc(x.r.um || '')} · ${eur(importoNetto(x.r), 2)}`;
const TIPO = { reso: ' · <b>reso (nota di credito)</b>', prezzo: ' · <b>correzione di prezzo (nota di credito)</b>', carico: '' };
function riga(x, btns, extra = '') {
  return `<div class="row"><span class="r-icon in">${ic('file-text')}</span><span class="r-main"><b>${esc(x.r.descrizione || '(senza descrizione)')}</b><span>${info(x)}${TIPO[x.tipo] || ''}${extra}</span></span><span class="r-side"><span class="btns">${btns}</span></span></div>`;
}
/** Carico d'origine di una correzione: «prodotto» del gg/mm/aa (fatt. N). */
function descOrig(k) {
  const m = S.movimenti.find(y => y.fattRiga === k && y.tipo === 'Carico'); const p = m && get('prodotti', m.prodottoId);
  const f = S.fatture.find(y => y.id === String(k).slice(0, String(k).lastIndexOf(':')));
  return `${p ? p.nome : 'riga'}${m ? ' del ' + fd(m.data) + ' (' + nf(m.quantita, 2) + ' ' + (p ? p.unita || '' : '') + ')' : ''}${f && f.numero ? ' · fatt. ' + f.numero : ''}`;
}
function proposta(x) {
  if (x.tipo === 'prezzo') return x.origine ? ` · da togliere da <b>${esc(descOrig(x.origine))}</b>` : '';
  if (x.proposto) return ` · forse <b>${esc(x.proposto.nome)}</b>${x.qProp > 0 ? ' (' + nf(x.qProp, 3) + ' ' + esc(x.proposto.unita || '') + ')' : ''}`;
  if (x.nuovo) return ` · proposto nuovo <b>${esc(x.nuovo.nome)}</b> (${esc(x.nuovo.categoria)})`;
  return '';
}

export const contaDaFare = () => MF.elenco().daFare.length;

export function sezione() {
  const E = MF.elenco();
  const fatte = S.movimenti.filter(m => m.fattRiga && m.data >= E.da).sort((a, b) => b.data.localeCompare(a.data));
  const testa = `<section class="card"><div class="card-h"><h2>${ic('file-down')}Carico dalle fatture</h2><button class="btn sm primary" data-act="mf-controlla">${ic('refresh-cw')}Controlla le fatture</button></div>
    <p class="muted small">Le righe delle fatture d'acquisto (mangimi, foraggi, farmaci, prodotti per la mungitura, ricambi, lubrificanti, teli e reti, sementi, concimi, fitofarmaci, gasolio) entrano in magazzino come carichi. Entra da sola solo una riga con il prodotto riconosciuto con certezza e la quantità sicura; le altre restano qui e fra i dubbi del Centro automatico, con la proposta pronta. Confermata una volta, quel prodotto entra da solo nelle fatture dopo.</p>
    <label class="fld"><span class="flabel">Carica le fatture dal</span><input class="inp" type="date" data-act="mf-da" value="${esc(E.da)}"><small>Le fatture più vecchie non entrano, così non diventano doppi i carichi già scritti a mano.</small></label></section>`;
  const daFare = `<section class="card"><div class="card-h"><h2>Da controllare</h2><span class="count">${E.daFare.length}</span></div><div class="list">${E.daFare.length ? E.daFare.map(x => riga(x,
    `<button class="btn sm primary" data-act="mf-abbina" data-k="${esc(x.k)}">${ic('link')}${x.tipo === 'prezzo' ? 'Correggi' : 'Abbina'}</button><button class="btn sm ghost" data-act="mf-togli" data-k="${esc(x.k)}">Non caricare</button>`,
    proposta(x) + (x.motivo ? `<br><small class="muted">${esc(x.motivo)}</small>` : ''))).join('') : empty('circle-check', 'Niente da controllare', S.fatture.length ? 'Tutte le righe di magazzino dal ' + fd(E.da) + ' sono a posto.' : 'Non ci sono ancora fatture: caricale dai Conti.')}</div></section>`;
  const caricate = `<section class="card"><div class="card-h"><h2>Caricate dalle fatture</h2><span class="count">${fatte.length}</span></div><div class="list">${fatte.length ? fatte.slice(0, 60).map(movRow).join('') : '<div class="empty slim">Ancora nessun carico dalle fatture.</div>'}</div>${fatte.length > 60 ? `<p class="muted small">Le altre sono in Movimenti.</p>` : ''}</section>`;
  const corr = E.fatte.filter(x => String(x.fatto).startsWith('r>'));
  const correzioni = corr.length ? `<section class="card"><div class="card-h"><h2>Correzioni di prezzo</h2><span class="count">${corr.length}</span></div><div class="list">${corr.map(x => riga(x, '', ` · su <b>${esc(descOrig(String(x.fatto).slice(2)))}</b>`)).join('')}</div></section>` : '';
  const tolte = E.tolte.length ? `<section class="card"><div class="card-h"><h2>Non caricate</h2><span class="count">${E.tolte.length}</span></div><div class="list">${E.tolte.map(x => riga(x, `<button class="btn sm ghost" data-act="mf-rimetti" data-k="${esc(x.k)}">${ic('rotate-ccw')}Rimetti</button>`)).join('')}</div></section>` : '';
  const doppie = E.doppie.length ? `<section class="card"><div class="card-h"><h2>Copie della stessa fattura</h2><span class="count">${E.doppie.length}</span></div><p class="muted small">La stessa fattura salvata due volte (per esempio il file XML e il PDF di cortesia): queste righe non entrano, si carica l'altra copia.</p><div class="list">${E.doppie.slice(0, 30).map(x => riga(x, '')).join('')}</div></section>` : '';
  return testa + daFare + caricate + correzioni + tolte + doppie;
}

/* ---------------- foglio per abbinare una riga ---------------- */
let aperta = null;   // riga del foglio aperto
const opt = (v, t, sel) => `<option value="${esc(v)}"${sel ? ' selected' : ''}>${esc(t)}</option>`;
function foglio(k) {
  const x = MF.elenco().daFare.find(y => y.k === k); if (!x) return toast('Riga non trovata: forse è già stata caricata.', 'err');
  aperta = x;
  const testa = `<div class="fld"><span class="flabel">Riga della fattura</span><b>${esc(x.r.descrizione || '')}</b><small>${info(x)}${x.r.numero ? ' · fatt. ' + esc(x.r.numero) : ''}${x.motivo ? '<br>' + esc(x.motivo) : ''}</small></div>`;
  if (x.tipo === 'prezzo') {
    const o = x.origini;
    return openSheet('Correggi il prezzo', `<div class="fgrid">${testa}
      ${o.length ? `<label class="fld"><span class="flabel">Carico da correggere (${eur(Math.abs(importoNetto(x.r)), 2)} in meno)</span><select class="inp" id="mfOrig">${o.map((k2, i) => opt(k2, descOrig(k2), i === 0)).join('')}</select><small>Il prezzo del carico scelto scende dell'importo della nota di credito. La quantità in magazzino non cambia.</small></label>`
        : '<p class="muted small">Non trovo carichi dallo stesso fornitore negli ultimi 6 mesi da correggere. Se la nota non riguarda il magazzino, usa "Non caricare".</p>'}
      <div class="factions"><span class="sp"></span><button class="btn ghost" data-act="close">Annulla</button>${o.length ? `<button class="btn primary" data-act="mf-salva" data-k="${esc(k)}">${ic('check')}Correggi</button>` : ''}</div></div>`);
  }
  const ps = S.prodotti.filter(p => MF.CAT_MAG.includes(p.categoria)).sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'it'));
  const sel = x.proposto ? x.proposto.id : '__nuovo';
  const nv = x.nuovo || {};
  const uNuovo = nv.unita || MF.unitaPer(x.r.um); const cat = nv.categoria || MF.categoriaPer(x.r) || 'Altro';
  const qNuovo = nv.q ?? MF.quantita(x.r, { unita: uNuovo });
  const q = x.proposto ? (x.qProp ?? '') : (qNuovo ?? Math.abs(N(x.r.quantita)));
  const reso = x.tipo === 'reso';
  openSheet(reso ? 'Scarica il reso' : 'Carica in magazzino', `<div class="fgrid">${testa}
    <label class="fld"><span class="flabel">Prodotto del magazzino</span><select class="inp" id="mfProd" data-act="mf-scegli">${reso ? (x.proposto ? '' : opt('', 'Scegli il prodotto', true)) : opt('__nuovo', '+ Prodotto nuovo', sel === '__nuovo')}${ps.map(p => opt(p.id, `${p.nome} (${p.unita || ''})`, p.id === sel)).join('')}</select></label>
    <div id="mfNuovo" class="fgrid"${sel === '__nuovo' && !reso ? '' : ' hidden'}>
      <label class="fld"><span class="flabel">Nome del prodotto nuovo</span><input class="inp" id="mfNome" type="text" value="${esc(nv.nome || String(x.r.descrizione || '').slice(0, 60))}" autocomplete="off"></label>
      <label class="fld half"><span class="flabel">Categoria</span><select class="inp" id="mfCat">${MF.CAT_MAG.map(c => opt(c, c, c === cat)).join('')}</select></label>
      <label class="fld half"><span class="flabel">Unità di misura</span><select class="inp" id="mfUm" data-act="mf-scegli">${UNITA.map(u => opt(u, u, u === uNuovo)).join('')}</select></label>
    </div>
    <label class="fld"><span class="flabel">Quantità da ${reso ? 'scaricare' : 'caricare'} (<span id="mfUnita">${esc(x.proposto ? x.proposto.unita || '' : uNuovo)}</span>)</span><input class="inp" id="mfQ" type="number" step="any" min="0" value="${q === '' || q === null ? '' : esc(String(q))}"><small>In fattura: ${nf(x.r.quantita, 2)} ${esc(x.r.um || 'senza unità')}. Se la fattura conta sacchi o confezioni, scrivi quanti kg, litri o pezzi sono in tutto.</small></label>
    <label class="fld chk"><input type="checkbox" id="mfRic" checked> <span>Ricorda: le prossime fatture con questo articolo si caricano da sole</span></label>
    <label class="fld"><span class="flabel">Parole da cercare nelle fatture</span><input class="inp" id="mfParole" type="text" value="${esc(MF.paroleDa(x.r.descrizione))}" autocomplete="off"><small>Tutte devono esserci nella descrizione. Più nomi: separali con la virgola. Il codice dell'articolo e la descrizione di questo fornitore si ricordano da soli.</small></label>
    <div class="factions"><span class="sp"></span><button class="btn ghost" data-act="close">Annulla</button><button class="btn primary" data-act="mf-salva" data-k="${esc(k)}">${ic(reso ? 'upload' : 'download')}${reso ? 'Scarica' : 'Carica'}</button></div></div>`);
}
const val = id => (document.getElementById(id) || {}).value || '';

export async function mfAct(a, b, d) {
  switch (a) {
    case 'mf-controlla': {
      b.disabled = true;
      try {
        const n = await MF.controllaOra(); const resta = MF.elenco().daFare.length;
        return toast((n ? 'Caricate in magazzino ' + quanti(n, 'riga', 'righe') + ' di fattura' : 'Nessuna riga nuova da caricare') + (resta ? ' · ' + quanti(resta, 'riga', 'righe') + ' da controllare' : ''));
      } finally { b.disabled = false; }
    }
    case 'mf-abbina': return foglio(d.k);
    case 'mf-togli': await MF.togli(d.k, true); return toast('Riga tolta: non entra in magazzino');
    case 'mf-rimetti': await MF.togli(d.k, false); return toast('Riga rimessa fra quelle da controllare');
    case 'mf-salva': {
      b.disabled = true;
      try {
        if (aperta && aperta.k === d.k && aperta.tipo === 'prezzo') { await MF.abbina(d.k, { origine: val('mfOrig') }); closeSheet(); return toast('Prezzo del carico corretto'); }
        const pid = val('mfProd'); const ric = !!(document.getElementById('mfRic') || {}).checked;
        const nuovo = pid === '__nuovo' ? { nome: val('mfNome'), categoria: val('mfCat'), unita: val('mfUm'), nReg: aperta && aperta.k === d.k && aperta.nuovo ? aperta.nuovo.nReg : '' } : null;
        const n = await MF.abbina(d.k, { pid: pid === '__nuovo' ? null : pid, nuovo, q: val('mfQ'), ricorda: ric, paroleR: val('mfParole') });
        closeSheet(); toast((aperta && aperta.tipo === 'reso' ? 'Reso scaricato dal magazzino' : 'Caricato in magazzino') + (n ? ' (e altre ' + quanti(n, 'riga', 'righe') + ' riconosciute)' : ''));
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
