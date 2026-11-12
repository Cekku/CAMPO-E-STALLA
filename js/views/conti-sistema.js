// Conti → Sistemazione dei dati: elenco di che cosa cambierebbe nelle fatture già salvate dopo una correzione dell'app,
// con prima e dopo, esportabile. Niente cambia finché il titolare non preme "Applica" (conferma in due tocchi).
import { esc, nf } from '../util.js';
import { ic } from '../icons.js';
import { toast, arm } from '../ui.js';
import { tabella, bottoniExport, fmtVal } from '../conti/tabelle.js';
import { datalistCat } from './conti-fatture.js';
import { proposte, applica, CAT_ANIMALI } from '../conti/sistema.js';

// scelte della pagina (solo in memoria): chiavi tolte dalla selezione e categorie cambiate a mano
const SD = { no: new Set(), dopo: {} };
const kpi = (l, v, s, cls = '') => `<div class="kpi static"><span class="k-l">${esc(l)}</span><span class="k-v sm ${cls}">${v}</span><span class="k-s">${s}</span></div>`;
const spunta = k => `<input type="checkbox" data-act="c-sdSel" data-k="${esc(k)}"${SD.no.has(k) ? '' : ' checked'} aria-label="Cambia questa">`;

/** Numero di proposte, per "Da sistemare" in Panoramica. */
export const daSistemare = () => proposte().n;

export function vSistema() {
  const P = proposte();
  if (!P.n) return `<section class="card"><div class="pad-x" style="padding:18px 16px"><div class="note-box">${ic('circle-check')}<span><b>Niente da sistemare.</b> Nelle fatture salvate non ci sono righe messe per errore in "${CAT_ANIMALI}" né autofatture fra le vendite.</span></div></div></section>`;
  const C = P.categorie, A = P.autofatture;
  const scelte = [...C, ...A].filter(x => !SD.no.has(x.k)).length;
  const euroC = C.reduce((t, r) => t + r.importo, 0);
  const sposta = A.filter(a => a.azione === 'sposta'), togli = A.filter(a => a.azione === 'togli');
  const kp = `<div class="kpis">${kpi('Righe da riclassificare', nf(C.length), C.length ? fmtVal(euroC, 'eur') + ' oggi in "' + CAT_ANIMALI + '"' : 'nessuna')}${kpi('Autofatture da spostare', nf(sposta.length), sposta.length ? 'dalle vendite agli acquisti' : 'nessuna')}${kpi('Autofatture doppie', nf(togli.length), togli.length ? 'già fra gli acquisti: si tolgono dalle vendite' : 'nessuna')}${kpi('Scelte', nf(scelte), 'su ' + nf(P.n) + ' proposte')}</div>`;
  const intro = `<div class="note-box warn">${ic('info')}<span><b>Controlla prima di applicare.</b> Fino alla versione 1.32.0 l'app aveva due errori: la parola "CAT" mandava in "${CAT_ANIMALI}" anche spese catastali, catrame, ricambi "cat. 2", smaltimento "mat. cat. 1" (e di lì la memoria e l'IA ci hanno messo anche manze, vacche, un trattore…); le autofatture per acquisti da agricoltori esonerati lette dalla stampa del gestionale finivano fra le vendite. Qui sotto c'è che cosa cambierebbe: togli la spunta a quello che non vuoi cambiare. Le righe che hai scelto o confermato a mano non sono nell'elenco e non si toccano.</span></div>`;
  const tC = C.length ? tabella('sdcat', {
    title: `Righe in "${CAT_ANIMALI}" da riclassificare`, sheet: 'Categorie',
    cols: [
      { k: 'sel', h: 'Cambia', sort: false, html: r => spunta(r.k), x: r => (SD.no.has(r.k) ? 'no' : 'sì') },
      { k: 'data', h: 'Data', fmt: 'date' }, { k: 'numero', h: 'Numero', cls: 'nw' },
      { k: 'controparte', h: 'Fornitore', cls: 'clip' }, { k: 'descrizione', h: 'Descrizione', cls: 'w', html: r => `${esc(r.descrizione)}${r.nota ? `<span class="sub t-warn">${esc(r.nota)}</span>` : ''}`, x: r => r.descrizione + (r.nota ? ' (' + r.nota + ')' : '') },
      { k: 'importo', h: 'Importo', fmt: 'eur2' }, { k: 'prima', h: 'Prima' },
      { k: 'dopoV', h: 'Dopo', html: r => `<input class="cell-in cell-cat" list="dlcat-Acquisto" value="${esc(r.dopoV)}" data-act="c-sdDopo" data-k="${esc(r.k)}" aria-label="Nuova categoria">` },
      { k: 'come', h: 'Data da', cls: 'clip' },
    ],
    rows: C.map(r => Object.assign({ dopoV: SD.dopo[r.k] || r.dopo }, r)), tot: { sel: 'Totale', importo: euroC },
  }) : '';
  const tA = A.length ? tabella('sdaut', {
    title: 'Autofatture salvate fra le vendite', sheet: 'Autofatture',
    cols: [
      { k: 'sel', h: 'Cambia', sort: false, html: r => spunta(r.k), x: r => (SD.no.has(r.k) ? 'no' : 'sì') },
      { k: 'data', h: 'Data', fmt: 'date' }, { k: 'numero', h: 'Numero', cls: 'nw' },
      { k: 'controparte', h: 'Venditore', cls: 'clip' }, { k: 'totale', h: 'Totale', fmt: 'eur2' },
      { k: 'prima', h: 'Prima', cls: 'clip' }, { k: 'dopo', h: 'Dopo', cls: 'w' }, { k: 'file', h: 'File', cls: 'clip' },
    ],
    rows: A.map(a => Object.assign({ _cls: 'click' }, a)), rowAttr: a => `data-act="c-fatt" data-id="${esc(a.fid)}"`, tot: { sel: 'Totale', totale: A.reduce((t, a) => t + a.totale, 0) },
  }) : '';
  const tutte = `<button class="btn sm ghost" data-act="c-sdTutte" data-v="${scelte ? 'no' : 'si'}">${ic('square-check')}${scelte ? 'Togli tutte le spunte' : 'Scegli tutte'}</button>`;
  return `${intro}${kp}
  ${C.length ? `<section class="card"><div class="card-h"><h2>${ic('tags')}Categorie da correggere</h2>${bottoniExport(['sdcat', 'sdaut'].filter(id => id === 'sdcat' || A.length), 'Sistemazione dei dati')}</div>${tC}
    <p class="muted small pad-x">"Dopo" è la categoria che danno le regole di oggi; puoi cambiarla qui prima di applicare (la tua scelta conta come fatta a mano). "Da classificare" vuol dire che nessuna regola la riconosce: la sistemi poi dalla pagina Fatture. L'acquisto di bovine (manze, vacche da allevamento) va nella categoria nuova "Acquisto bestiame", lo smaltimento delle carcasse in "Smaltimento carcasse".</p></section>` : ''}
  ${A.length ? `<section class="card"><div class="card-h"><h2>${ic('arrow-right-left')}Autofatture fra le vendite</h2>${C.length ? '' : bottoniExport(['sdaut'], 'Sistemazione dei dati')}</div>${tA}
    <p class="muted small pad-x">Le autofatture le emetti tu per conto di un agricoltore esonerato (art. 34, comma 6), ma sono acquisti. Quando la stessa fattura c'è già fra gli acquisti (stessa partita IVA, numero e data) la copia fra le vendite si toglie; i pagamenti della banca e i collegamenti dell'archivio passano a quella che resta.</p></section>` : ''}
  <div class="factions">${tutte}<span class="sp"></span><button class="btn action" data-act="c-sdApplica"${scelte ? '' : ' disabled'}>${ic('check')}Applica ${scelte === 1 ? 'il cambio scelto' : `i ${nf(scelte)} cambi scelti`}</button></div>${datalistCat()}`;
}

export async function sistemaAct(a, b, d, rerender) {
  if (a === 'c-sdTutte') { if (d.v === 'no') proposte().categorie.concat(proposte().autofatture).forEach(x => SD.no.add(x.k)); else SD.no.clear(); return rerender(); }
  if (a === 'c-sdApplica') {
    const P = proposte(); const sel = [...P.categorie, ...P.autofatture].map(x => x.k).filter(k => !SD.no.has(k));
    if (!sel.length) return;
    return arm(b, `Conferma: cambia ${sel.length === 1 ? '1 voce' : sel.length + ' voci'}`, async () => {
      b.disabled = true;
      try {
        const o = await applica(sel, SD.dopo); SD.no.clear(); SD.dopo = {};
        const p = [o.righe ? (o.righe === 1 ? '1 riga riclassificata' : o.righe + ' righe riclassificate') : '', o.spostate ? (o.spostate === 1 ? '1 autofattura spostata negli acquisti' : o.spostate + ' autofatture spostate negli acquisti') : '', o.tolte ? (o.tolte === 1 ? '1 copia doppia tolta dalle vendite' : o.tolte + ' copie doppie tolte dalle vendite') : ''].filter(Boolean);
        toast('Fatto: ' + p.join(', '));
      } catch (e) { toast(e.message || 'Non sono riuscito a salvare', 'err'); b.disabled = false; }
    });
  }
}
export function sistemaChange(t, rerender) {
  const k = t.dataset.k; if (!k) return;
  if (t.dataset.act === 'c-sdSel') { if (t.checked) SD.no.delete(k); else SD.no.add(k); return rerender(); }
  if (t.dataset.act === 'c-sdDopo') { const v = t.value.trim(); if (v) SD.dopo[k] = v; else delete SD.dopo[k]; }
}
