// Tracciabilità degli alimenti per il caseificio: registro approvvigionamenti (dalle fatture) e alimenti autoprodotti.
// La logica è in js/tracciabilita.js; qui ci sono la pagina e le azioni.
import { contiVisibili } from './conti.js';
import { S, UI } from '../state.js';
import { esc, nf, fd } from '../util.js';
import { ic } from '../icons.js';
import { empty, openSheet, closeSheet, toast, arm } from '../ui.js';
import * as T from '../tracciabilita.js';

const att = (o) => Object.entries(o).map(([k, v]) => ` ${k}="${esc(v)}"`).join('');
const siNo = (v, a) => `<select class="inp"${att(a)}>${['SI', 'NO'].map(x => `<option value="${x}"${String(v).toUpperCase() === x ? ' selected' : ''}>${x === 'SI' ? 'Sì' : 'No'}</option>`).join('')}</select>`;
const testo = (v, a, extra = '') => `<input class="inp" type="text" value="${esc(v ?? '')}"${att(a)}${extra}>`;
const data = (v, a) => `<input class="inp" type="date" value="${esc(v || '')}"${att(a)}>`;
const qtaIn = (v, a) => `<input class="inp" type="text" inputmode="decimal" value="${v || v === 0 ? esc(nf(v, 2)) : ''}"${att(a)}>`;

export function render() {
  return UI.f.tr_p && T.prodotto(UI.f.tr_p) ? paginaProdotto(T.prodotto(UI.f.tr_p)) : paginaPrincipale();
}

/* ---------------- pagina principale ---------------- */
function paginaPrincipale() {
  const anno = UI.anno; const A = T.assegna(anno); const ps = T.prodotti(); const imp = T.impostazioni();
  const libere = T.nonAssegnate(anno, A);
  const intro = `<p class="muted">I registri per il caseificio si compilano da soli con le righe delle fatture di acquisto (numero e data del DDT). Puoi correggere ogni casella: la correzione resta anche quando arrivano fatture nuove.</p>`
    + (S.fatture.length === 0 || !contiVisibili() ? `<p class="muted"><b>Le fatture le vede solo il titolare:</b> senza fatture il registro resta vuoto, puoi scrivere le righe a mano.</p>` : '');
  const barra = `<div class="btns" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:8px 0 12px">
    <label style="display:flex;gap:6px;align-items:center">Intestazione <input class="inp" type="text" value="${esc(imp.programma || '')}" data-act="tr-programma" style="width:220px"></label>
    <button class="btn sm" data-act="tr-importa">${ic('upload')}Importa dal vecchio registro Excel</button>
    <input type="file" accept=".xlsx" data-act="tr-file" hidden></div>`;
  const righeP = ps.map(p => {
    const R = T.registro(p, anno, A); const ultimo = R.righe.reduce((m, r) => (r.data && r.data > m ? r.data : m), '');
    return `<tr data-act="tr-apri" data-id="${esc(p.id)}" style="cursor:pointer"><td><b>${esc(p.nome)}</b></td><td class="num">${R.righe.length}</td><td class="num">${nf(R.totKg, 0)}</td><td>${ultimo ? fd(ultimo) : '—'}</td></tr>`;
  }).join('');
  const elenco = ps.length
    ? `<div class="tablewrap etab"><table><thead><tr><th>Prodotto</th><th class="num">Arrivi</th><th class="num">kg nell'anno</th><th>Ultimo arrivo</th></tr></thead><tbody>${righeP}</tbody></table></div>`
    : empty('wheat', 'Nessun prodotto', 'Importa il vecchio registro Excel oppure crea un prodotto: poi le righe delle fatture entrano da sole.', `<button class="btn primary sm" data-act="tr-nuovo">${ic('plus')}Nuovo prodotto</button>`);
  const cardApprov = `<section class="card"><div class="card-h"><h2>${ic('clipboard-list')}Registro approvvigionamenti ${anno}</h2><div class="btns">
    <button class="btn sm" data-act="tr-stampaTutti">${ic('printer')}Stampa / PDF</button>
    <button class="btn sm" data-act="tr-excel">${ic('file-spreadsheet')}Excel</button>
    <button class="btn primary sm" data-act="tr-nuovo">${ic('plus')}Nuovo prodotto</button></div></div>${elenco}</section>`;
  const cardLibere = libere.length ? `<section class="card"><div class="card-h"><h2>${ic('circle-alert')}Righe di mangimi e foraggi senza prodotto</h2></div>
    <div class="tablewrap etab"><table><thead><tr><th>Descrizione</th><th>Fornitori</th><th class="num">Volte</th><th class="num">kg</th><th>Ultima data</th><th></th></tr></thead><tbody>${libere.map(g => `<tr>
      <td>${esc(g.descrizione)}</td><td>${esc(g.fornitori.join(', '))}</td><td class="num">${g.volte}</td><td class="num">${nf(g.kg, 0)}</td><td>${fd(g.ultima)}</td>
      <td style="white-space:nowrap"><select class="inp" data-act="tr-assegna" data-desc="${esc(g.descrizione)}"><option value="">Assegna a…</option>${ps.map(p => `<option value="${esc(p.id)}">${esc(p.nome)}</option>`).join('')}</select>
      <button class="btn sm ghost" data-act="tr-nuovoDa" data-desc="${esc(g.descrizione)}">Nuovo prodotto</button></td></tr>`).join('')}</tbody></table></div></section>` : '';
  return intro + barra + cardApprov + cardLibere + cardAuto(anno);
}

function cardAuto(anno) {
  const tutti = !!UI.f.tr_tutti; const rr = T.autoprodotti(anno, tutti);
  const usati = [...new Set(T.autoprodottiTutti().map(r => r.prodotto).filter(Boolean))];
  const zone = [...new Set(['Trincea', ...S.silos.map(s => s.nome).filter(Boolean)])];
  const nProp = T.proposteRaccolte(anno).length;
  const riga = r => `<tr><td class="num">${r.n}</td>
    <td>${testo(r.prodotto, { 'data-act': 'tr-autoCella', 'data-id': r.id, 'data-k': 'prodotto', list: 'trDlProd' })}</td>
    <td>${data(r.data, { 'data-act': 'tr-autoCella', 'data-id': r.id, 'data-k': 'data' })}</td>
    <td>${qtaIn(r.qta, { 'data-act': 'tr-autoCella', 'data-id': r.id, 'data-k': 'qta' })}</td>
    <td>${siNo(r.conforme, { 'data-act': 'tr-autoCella', 'data-id': r.id, 'data-k': 'conforme' })}</td>
    <td>${testo(r.zona, { 'data-act': 'tr-autoCella', 'data-id': r.id, 'data-k': 'zona', list: 'trDlZona' })}</td>
    <td>${testo(r.num, { 'data-act': 'tr-autoCella', 'data-id': r.id, 'data-k': 'num' }, ' style="min-width:48px;width:64px"')}</td>
    <td>${data(r.inizio, { 'data-act': 'tr-autoCella', 'data-id': r.id, 'data-k': 'inizio' })}</td>
    <td>${data(r.fine, { 'data-act': 'tr-autoCella', 'data-id': r.id, 'data-k': 'fine' })}</td>
    <td><button class="iconbtn" data-act="tr-autoTogli" data-id="${esc(r.id)}" aria-label="Togli la riga" title="Togli la riga">${ic('trash-2')}</button></td></tr>`;
  const tab = rr.length ? `<div class="tablewrap etab"><table class="tr-tab"><thead><tr><th>N.</th><th>Prodotto</th><th>Data produzione</th><th>Quantità (q)</th><th>Conforme</th><th>Trincea, silos, zona</th><th>N.</th><th>Inizio utilizzo</th><th>Fine utilizzo</th><th></th></tr></thead><tbody>${rr.map(riga).join('')}</tbody></table></div>
    <datalist id="trDlProd">${usati.map(x => `<option value="${esc(x)}">`).join('')}</datalist><datalist id="trDlZona">${zone.map(x => `<option value="${esc(x)}">`).join('')}</datalist>`
    : empty('wheat', 'Nessuna riga', 'Aggiungi una riga a mano' + (nProp ? ' oppure prendi le raccolte già registrate.' : '.'));
  return `<section class="card"><div class="card-h"><h2>${ic('wheat')}Registro alimenti autoprodotti ${anno}</h2><div class="btns">
    <label class="btn sm ghost" style="display:inline-flex;gap:6px;align-items:center"><input type="checkbox" data-act="tr-autoTutti"${tutti ? ' checked' : ''}>Mostra tutti gli anni</label>
    <button class="btn sm" data-act="tr-autoStampa">${ic('printer')}Stampa / PDF</button>
    ${nProp ? `<button class="btn sm" data-act="tr-autoRaccolte" title="Rimette anche le righe tolte">${ic('download')}Prendi dalle raccolte (${nProp})</button>` : ''}
    <button class="btn primary sm" data-act="tr-autoNuova">${ic('plus')}Aggiungi riga</button></div></div>
    <p class="muted" style="margin:0;padding:0 18px 10px">Le raccolte, gli sfalci e le pesate della Campagna entrano da soli (solo quello che resta in azienda: le pesate e le colture con destinazione di vendita non contano). Quello che correggi a mano resta tuo; una riga tolta non torna.</p>${tab}</section>`;
}

/* ---------------- pagina di un prodotto ---------------- */
function paginaProdotto(p) {
  const anno = UI.anno; const R = T.registro(p, anno);
  const zone = [...new Set(['Trincea', ...S.silos.map(s => s.nome).filter(Boolean)])];
  const mod = (r, f) => r.modificati.includes(f) ? ' class="mod" title="Corretto a mano"' : '';
  const riga = r => {
    const a = { 'data-act': 'tr-cella', 'data-key': r.key };
    const um = r.um && r.um !== 'kg' ? ` <small>${esc(r.um)}</small>` : '';
    const dub = r.dubbio ? ` <span title="Unità non scritta in fattura: letta come kg" style="cursor:help">?</span>` : '';
    const azioni = r.auto
      ? `<div class="tr-desc">${esc(r.descrizioni.join(' · '))}${r.fatture.length ? '<br>Fatt. ' + esc(r.fatture.join(', ')) : ''}</div>
         ${r.modificati.length ? `<button class="iconbtn" data-act="tr-ripristina" data-key="${esc(r.key)}" title="Torna ai valori della fattura" aria-label="Torna ai valori della fattura">${ic('rotate-ccw')}</button>` : ''}
         <button class="iconbtn" data-act="tr-togli" data-key="${esc(r.key)}" title="Non è questo prodotto" aria-label="Non è questo prodotto">${ic('x')}</button>`
      : `<span class="chip">a mano</span> <button class="iconbtn" data-act="tr-togliExtra" data-id="${esc(r.extraId)}" aria-label="Togli la riga" title="Togli la riga">${ic('trash-2')}</button>`;
    return `<tr><td class="num">${r.n}</td>
      <td${mod(r, 'fornitore')}>${testo(r.fornitore, { ...a, 'data-k': 'fornitore' })}</td>
      <td${mod(r, 'ddt')}>${testo(r.ddt, { ...a, 'data-k': 'ddt' })}</td>
      <td${mod(r, 'data')}>${data(r.data, { ...a, 'data-k': 'data' })}</td>
      <td${mod(r, 'qta')}><div style="display:flex;gap:4px;align-items:center">${qtaIn(r.qta, { ...a, 'data-k': 'qta' })}${um}${dub}</div></td>
      <td${mod(r, 'conforme')}>${siNo(r.conforme, { ...a, 'data-k': 'conforme' })}</td>
      <td${mod(r, 'accettato')}>${siNo(r.accettato, { ...a, 'data-k': 'accettato' })}</td>
      <td${mod(r, 'silos')}>${testo(r.silos, { ...a, 'data-k': 'silos', list: 'trDlZona' })}</td>
      <td${mod(r, 'inizio')}>${data(r.inizio, { ...a, 'data-k': 'inizio' })}</td>
      <td${mod(r, 'fine')}>${data(r.fine, { ...a, 'data-k': 'fine' })}</td>
      <td style="white-space:nowrap">${azioni}</td></tr>`;
  };
  const tab = R.righe.length
    ? `<div class="tablewrap etab"><table class="tr-tab"><thead><tr><th>N.</th><th>Fornitore</th><th>DDT</th><th>Data arrivo</th><th>Quantità kg</th><th>Conforme</th><th>Accettato</th><th>Silos / zona</th><th>Inizio utilizzo</th><th>Fine utilizzo</th><th></th></tr></thead><tbody>${R.righe.map(riga).join('')}</tbody></table></div>
      <datalist id="trDlZona">${zone.map(x => `<option value="${esc(x)}">`).join('')}</datalist>
      <p><b>Totale: ${nf(R.totKg, 0)} kg</b></p>`
    : empty('wheat', 'Nessun arrivo nel ' + anno, 'Le righe delle fatture entrano da sole. Se serve, aggiungi una riga a mano.');
  const tolte = R.tolte.length ? `<h3>Righe tolte da questo prodotto</h3><div class="tablewrap etab"><table><tbody>${R.tolte.map(x => `<tr><td>${esc(x.r.descrizione || '')}</td><td>${esc(x.r.controparte || '')}</td><td>${fd(x.data)}</td><td><button class="btn sm ghost" data-act="tr-rimetti" data-k="${esc(x.k)}">Rimetti</button></td></tr>`).join('')}</tbody></table></div>` : '';
  return `<section class="card"><div class="card-h"><h2><button class="iconbtn" data-act="tr-chiudi" aria-label="Indietro" title="Indietro">${ic('chevron-left')}</button>${esc(p.nome)} · ${anno}</h2><div class="btns">
    <button class="btn sm" data-act="tr-stampaUno">${ic('printer')}Stampa / PDF</button>
    <button class="btn sm" data-act="tr-excelUno">${ic('file-spreadsheet')}Excel</button>
    <button class="btn primary sm" data-act="tr-aggiungi">${ic('plus')}Aggiungi riga a mano</button></div></div>
    <p class="muted">Parole cercate nelle fatture: <b>${esc(p.parole || T.paroleNome(p.nome))}</b>${p.silos ? ' · Silos: <b>' + esc(p.silos) + '</b>' : ''}</p>
    <div class="btns" style="display:flex;gap:8px;margin-bottom:10px"><button class="btn sm ghost" data-act="tr-modProd">${ic('pencil')}Modifica</button><button class="btn sm ghost danger" data-act="tr-elimina">${ic('trash-2')}Elimina prodotto</button></div>
    ${tab}${tolte}</section>`;
}

/* ---------------- foglio del prodotto ---------------- */
function foglioProdotto(p = {}, nomeIniziale = '') {
  openSheet(p.id ? 'Modifica prodotto' : 'Nuovo prodotto', `<div class="fgrid">
    <label class="fld"><span class="flabel">Nome</span><input class="inp" id="trNome" type="text" value="${esc(p.nome || nomeIniziale)}" autocomplete="off"></label>
    <label class="fld"><span class="flabel">Parole da cercare nelle fatture</span><input class="inp" id="trParole" type="text" value="${esc(p.parole || '')}" autocomplete="off"><small>Separate da virgola se il prodotto ha più nomi. Se vuoto: le parole del nome.</small></label>
    <label class="fld"><span class="flabel">Silos / zona predefinito</span><input class="inp" id="trSilos" type="text" value="${esc(p.silos || '')}" autocomplete="off"></label>
    <div class="factions"><span class="sp"></span><button class="btn ghost" data-act="close">Annulla</button><button class="btn primary" data-act="tr-salvaProd"${p.id ? ` data-id="${esc(p.id)}"` : ''}>Salva</button></div></div>`);
}

/* ---------------- azioni ---------------- */
const val = id => (document.getElementById(id) || {}).value || '';
const pid = () => UI.f.tr_p;

export async function trAct(a, b, d) {
  switch (a) {
    case 'tr-importa': { const f = document.querySelector('[data-act="tr-file"]'); if (f) f.click(); return; }
    case 'tr-stampaTutti': return T.stampaApprovvigionamenti(UI.anno);
    case 'tr-excel': return T.excel(UI.anno);
    case 'tr-nuovo': return foglioProdotto();
    case 'tr-nuovoDa': return foglioProdotto({}, d.desc || '');
    case 'tr-apri': UI.f.tr_p = d.id; return T.ridisegna();
    case 'tr-chiudi': UI.f.tr_p = null; return T.ridisegna();
    case 'tr-modProd': return foglioProdotto(T.prodotto(pid()) || {});
    case 'tr-elimina': return arm(b, 'Tocca ancora per eliminare', async () => { const id = pid(); UI.f.tr_p = null; await T.eliminaProdotto(id); T.ridisegna(); toast('Prodotto eliminato'); });
    case 'tr-salvaProd': {
      const id = await T.salvaProdotto({ id: d.id || undefined, nome: val('trNome'), parole: val('trParole'), silos: val('trSilos') });
      closeSheet(); UI.f.tr_p = id; T.ridisegna(); return;
    }
    case 'tr-stampaUno': return T.stampaApprovvigionamenti(UI.anno, pid());
    case 'tr-excelUno': return T.excel(UI.anno, { pid: pid() });
    case 'tr-aggiungi': return T.aggiungiRiga(pid(), UI.anno);
    case 'tr-ripristina': return T.ripristina(pid(), d.key);
    case 'tr-togli': {
      const r = T.registro(T.prodotto(pid()), UI.anno).righe.find(x => x.key === d.key); if (!r) return;
      await T.togliLinee(pid(), r.linee); return toast('Righe tolte da questo prodotto');
    }
    case 'tr-togliExtra': return arm(b, 'Tocca ancora per togliere', () => T.togliExtra(pid(), d.id));
    case 'tr-rimetti': return T.rimettiLinee(pid(), [d.k]);
    case 'tr-autoStampa': return T.stampaAutoprodotti(UI.anno, !!UI.f.tr_tutti);
    case 'tr-autoNuova': return T.aggiungiAuto(UI.anno);
    case 'tr-autoRaccolte': { const n = await T.aggiungiProposte(UI.anno); return toast(n ? 'Righe aggiunte: ' + n : 'Niente da aggiungere'); }
    case 'tr-autoTogli': return arm(b, 'Tocca ancora per togliere', () => T.togliAuto(d.id));
  }
}

export async function trChange(t) {
  const a = t.dataset.act; const d = t.dataset;
  switch (a) {
    case 'tr-programma': return T.salvaImpostazioni({ programma: t.value.trim() });
    case 'tr-file': {
      const f = t.files && t.files[0]; t.value = ''; if (!f) return;
      toast('Leggo il registro…'); const r = await T.importaExcel(f);
      return toast('Prodotti nuovi: ' + r.prodottiNuovi + ' · righe autoprodotti: ' + r.righeNuove);
    }
    case 'tr-assegna': {
      if (!t.value) return; await T.assegnaDescrizione(t.value, d.desc); return toast('Fatto: le fatture simili entrano da sole');
    }
    case 'tr-autoTutti': UI.f.tr_tutti = t.checked; return T.ridisegna();
    case 'tr-cella': return T.modifica(pid(), d.key, d.k, t.value);
    case 'tr-autoCella': return T.modificaAuto(d.id, d.k, t.value);
  }
}
