// Magazzino: prodotti con giacenze, movimenti, scheda prodotto
import { S, UI, get } from '../state.js';
import { esc, nf, eur, fd, sum, byDate, byName, yearOf, N, diff, today, okD } from '../util.js';
import { ic } from '../icons.js';
import { CATEGORIE, giac } from '../domain.js';
import { tabs, empty, newBtn, fact, chip, exChip } from '../ui.js';
import { FITO } from '../checks.js';
import { fitoLookup } from '../fitodb.js';

const CAT_IC = { 'Fitofarmaco': 'shield-check', 'Diserbante': 'leaf', 'Concime': 'sprout', 'Seme': 'wheat', 'Mangime': 'wheat', 'Foraggio': 'leaf', 'Farmaco veterinario': 'syringe', 'Gasolio': 'fuel', 'Altro': 'package' };

export function render() {
  if (UI.detail && UI.detail.type === 'prodotto') { const p = get('prodotti', UI.detail.id); if (p) return detail(p); UI.detail = null; }
  const sub = UI.sub.magazzino;
  const t = tabs('magazzino', [['prodotti', 'Prodotti', S.prodotti.length], ['movimenti', 'Movimenti']], sub);
  return { title: 'Magazzino', html: `<header class="pagehead"><h1>Magazzino</h1><div class="btns"><button class="btn sm" data-act="new" data-form="movimenti" data-tipo="Scarico">${ic('upload')}Scarico</button>${newBtn('movimenti', 'Carico', 'data-tipo="Carico"')}</div></header>` + t + (sub === 'movimenti' ? movimenti() : prodotti()) };
}

function chips(p) {
  const g = giac(p); let s = '';
  if (g < 0) s += chip('Negativa', 'bad'); else if (N(p.scortaMin) > 0 && g < N(p.scortaMin)) s += chip('Sotto scorta', 'warn');
  if (okD(p.scadenza) && g > 0) { const d = diff(today(), p.scadenza); if (d < 0) s += chip('Scaduto', 'bad'); else if (d <= 60) s += chip('Scade ' + fd(p.scadenza), 'warn'); }
  if (FITO.includes(p.categoria)) {
    const db = fitoLookup(p.nReg); const aut = p.scadenzaAut || (db && db.scadenza);
    if (db && db.revocato) s += chip('Revocato', 'bad'); else if (okD(aut) && aut < today()) s += chip('Non più autorizzato', 'bad'); else if (okD(aut) && diff(today(), aut) <= 90) s += chip('Autorizzato fino al ' + fd(aut), 'warn');
    if (!(p.impieghi || []).length) s += chip('Etichetta da completare', 'ghost');
  }
  return s;
}
function level(p) { const g = giac(p), m = N(p.scortaMin); if (!m) return ''; const pct = Math.max(0, Math.min(100, g / (m * 3) * 100)); return `<span class="level ${g < m ? 'low' : ''}"><i style="width:${pct}%"></i><b style="left:33.3%"></b></span>`; }

function prodotti() {
  if (!S.prodotti.length) return `<section class="card">${empty('package', 'Magazzino vuoto', 'Inserisci fitofarmaci, concimi, sementi, mangimi e farmaci con giacenza, prezzo e scorta minima. Gli scarichi da campo e stalla si registrano da soli.', newBtn('prodotti', 'Aggiungi prodotto'))}</section>`;
  const cat = UI.f.cat || '', q = (UI.f.pq || '').toLowerCase().trim();
  const cnt = {}; S.prodotti.forEach(p => (cnt[p.categoria] = (cnt[p.categoria] || 0) + 1));
  const list = [...S.prodotti].filter(p => (!cat || p.categoria === cat) && (!q || (p.nome || '').toLowerCase().includes(q))).sort(byName);
  const valore = sum(S.prodotti, p => Math.max(0, giac(p)) * N(p.prezzo));
  const sotto = S.prodotti.filter(p => N(p.scortaMin) > 0 && giac(p) < N(p.scortaMin)).length;
  return `<div class="kpis three"><div class="kpi static"><span class="k-l">Valore giacenze</span><span class="k-v">${eur(valore)}</span><span class="k-s">al prezzo di carico</span></div><div class="kpi static"><span class="k-l">Prodotti</span><span class="k-v">${S.prodotti.length}</span><span class="k-s">${Object.keys(cnt).length} categorie</span></div><div class="kpi static"><span class="k-l">Sotto scorta</span><span class="k-v ${sotto ? 't-warn' : ''}">${sotto}</span><span class="k-s">${sotto ? 'da riordinare' : 'tutto in regola'}</span></div></div>
  <div class="toolbar"><div class="search">${ic('search')}<input class="inp" id="prodq" data-filter="pq" placeholder="Cerca prodotto" value="${esc(UI.f.pq || '')}" autocomplete="off"></div><span class="sp"></span>${newBtn('prodotti', 'Prodotto', '', '')}</div>
  <div class="chipbar"><button data-act="chip" data-f="cat" data-v="" aria-pressed="${!cat}">Tutti<span class="n">${S.prodotti.length}</span></button>${CATEGORIE.filter(c => cnt[c]).map(c => `<button data-act="chip" data-f="cat" data-v="${c}" aria-pressed="${cat === c}">${c}<span class="n">${cnt[c]}</span></button>`).join('')}</div>
  <section class="card"><div class="list">${list.length ? list.map(p => { const g = giac(p); return `<button class="row" data-act="open" data-type="prodotto" data-id="${p.id}"><span class="r-icon">${ic(CAT_IC[p.categoria] || 'package')}</span><span class="r-main"><b>${esc(p.nome)}${exChip(p)}</b><span>${esc(p.categoria || '')}${p.nReg ? ' · reg. ' + esc(p.nReg) : ''}${N(p.prezzo) ? ' · ' + eur(p.prezzo, 2) + '/' + esc(p.unita || '') : ''}${N(p.carenza) ? ' · carenza ' + p.carenza + ' gg' : ''}</span>${level(p)}</span><span class="r-side"><span class="qty"><b class="num">${nf(g, 1)}</b> ${esc(p.unita || '')}</span><span class="chips">${chips(p)}</span></span></button>`; }).join('') : empty('search', 'Nessun prodotto', 'Nessun prodotto corrisponde al filtro.')}</div></section>`;
}
export function movRow(m) {
  const p = get('prodotti', m.prodottoId); const src = m.opId ? 'dal quaderno' : m.evId ? 'dalla stalla' : m.razioneId ? 'da razione' : '';
  const out = m.tipo === 'Scarico';
  return `<button class="row" data-act="edit" data-form="movimenti" data-id="${m.id}"><span class="r-icon ${out ? 'out' : 'in'}">${ic(out ? 'upload' : 'download')}</span><span class="r-main"><b>${esc(p ? p.nome : 'prodotto eliminato')}${exChip(m)}</b><span>${fd(m.data)}${m.documento ? ' · ' + esc(m.documento) : ''}${src ? ' · ' + src : ''}${m.note ? ' · ' + esc(m.note) : ''}</span></span><span class="r-side"><span class="num ${out ? 't-bad' : 't-ok'}">${out ? '−' : '+'}${nf(m.quantita, 2)} ${esc(p ? p.unita || '' : '')}</span></span></button>`;
}
function movimenti() {
  const mv = [...S.movimenti].filter(m => yearOf(m.data) === UI.anno).sort(byDate).reverse();
  return `<div class="toolbar"><p class="muted small">${mv.length} movimenti nel ${UI.anno}</p><span class="sp"></span><button class="btn sm ghost" data-act="export" data-what="movimenti">${ic('download')}CSV</button></div>
  <section class="card"><div class="list">${mv.length ? mv.map(movRow).join('') : empty('warehouse', 'Nessun movimento', 'I carichi da fattura e gli scarichi da campo e stalla compaiono qui.')}</div></section>`;
}
function detail(p) {
  const g = giac(p); const mv = S.movimenti.filter(m => m.prodottoId === p.id).sort(byDate).reverse();
  return { title: p.nome, html: `<section class="card detail-hero"><div class="big-icon">${ic(CAT_IC[p.categoria] || 'package')}</div><div class="dh-body"><span class="eyebrow">${esc(p.categoria || 'Prodotto')}</span><h1>${esc(p.nome)}${exChip(p)}</h1><div class="big-num">${nf(g, 2)}<small>${esc(p.unita || '')} in magazzino</small></div><div class="chips">${chips(p)}</div><div class="btns"><button class="btn sm" data-act="new" data-form="movimenti" data-tipo="Scarico" data-prodotto="${p.id}">${ic('upload')}Scarico</button>${newBtn('movimenti', 'Carico', `data-tipo="Carico" data-prodotto="${p.id}"`)}<button class="btn sm ghost" data-act="edit" data-form="prodotti" data-id="${p.id}">${ic('pencil')}Modifica</button></div></div></section>
  <dl class="facts">${fact('Prezzo', N(p.prezzo) ? `<span class="num">${eur(p.prezzo, 2)}</span> <small>/${esc(p.unita || '')}</small>` : '—')}${fact('Valore', `<span class="num">${eur(Math.max(0, g) * N(p.prezzo))}</span>`)}${fact('Scorta minima', N(p.scortaMin) ? nf(p.scortaMin) + ' ' + esc(p.unita || '') : '—')}${fact('Scadenza', fd(p.scadenza))}${fact('N. registrazione', esc(p.nReg || '—'))}${FITO.includes(p.categoria) ? fact('Sostanze attive', esc(p.sostanze || '—')) + fact('Autorizzato fino al', fd(p.scadenzaAut || (fitoLookup(p.nReg) || {}).scadenza)) : ''}${fact('Carenza', N(p.carenza) ? p.carenza + ' giorni' : '—')}${p.categoria === 'Farmaco veterinario' ? fact('Sospensione', (N(p.sospLatte) || 0) + ' gg latte · ' + (N(p.sospCarne) || 0) + ' gg carne') : ''}${fact('Fornitore', esc(p.fornitore || '—'))}</dl>
  ${FITO.includes(p.categoria) ? impieghiCard(p) : ''}
  ${p.note ? `<section class="card note">${esc(p.note)}</section>` : ''}
  <section class="card"><div class="card-h"><h2>Movimenti</h2><span class="count">${mv.length}</span></div><div class="list">${mv.length ? mv.map(movRow).join('') : '<div class="empty slim">Nessun movimento: la giacenza è quella iniziale.</div>'}</div></section>` };
}

function impieghiCard(p) {
  const imp = p.impieghi || []; const u = p.unita || '';
  return `<section class="card"><div class="card-h"><h2>${ic('list-checks')}Impieghi autorizzati</h2><button class="btn sm ghost" data-act="edit" data-form="prodotti" data-id="${p.id}">${ic('pencil')}${imp.length ? 'Modifica' : 'Inserisci'}</button></div>
  ${imp.length ? `<div class="tablewrap"><table><thead><tr><th>Coltura</th><th>Dose /ha</th><th>Carenza</th><th>Interventi</th><th>Intervallo</th></tr></thead><tbody>${imp.map(i => `<tr><td>${esc(i.coltura)}</td><td>${N(i.doseMin) ? nf(i.doseMin, 3) + '–' : ''}${N(i.doseMax) ? nf(i.doseMax, 3) + ' ' + esc(u) : '—'}</td><td>${N(i.carenza) ? nf(i.carenza, 0) + ' gg' : '—'}</td><td>${N(i.maxInterventi) ? 'max ' + nf(i.maxInterventi, 0) + '/anno' : '—'}</td><td>${N(i.intervallo) ? nf(i.intervallo, 0) + ' gg' : '—'}</td></tr>`).join('')}</tbody></table></div>` : `<div class="empty slim">Copia dall'etichetta le colture autorizzate con dose massima, carenza e numero di interventi: l'app controllerà ogni trattamento.</div>`}</section>`;
}
