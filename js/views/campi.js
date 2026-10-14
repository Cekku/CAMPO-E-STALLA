// Campi: elenco con forme reali, quaderno di campagna, costi e margini, scheda del campo
import { S, UI, get } from '../state.js';
import { esc, nf, eur, fd, sum, byDate, byName, yearOf, N, addDays, plural } from '../util.js';
import { ic } from '../icons.js';
import { TIPI_OP, campoInfo, campoHa, cropColor } from '../domain.js';
import { thumb, perimeterM } from '../geo.js';
import { tabs, empty, newBtn, fact, chip, exChip } from '../ui.js';
import { stackBar } from './charts.js';
import { opRow } from './oggi.js';

export function render() {
  if (UI.detail && UI.detail.type === 'campo') { const c = get('campi', UI.detail.id); if (c) return detail(c); UI.detail = null; }
  const sub = UI.sub.campi;
  const t = tabs('campi', [['elenco', 'Appezzamenti', S.campi.length], ['quaderno', 'Quaderno di campagna'], ['costi', 'Costi e margini']], sub);
  let body = '';
  if (sub === 'quaderno') body = quaderno();
  else if (sub === 'costi') body = costi();
  else body = elenco();
  return { title: 'Campi', html: `<header class="pagehead"><h1>Campi</h1><div class="btns">${newBtn('operazioni', 'Registra lavoro')}</div></header>` + t + body };
}

function elenco() {
  const list = [...S.campi].sort(byName);
  if (!list.length) return `<section class="card">${empty('map', 'Nessun appezzamento', 'Disegna i campi sulla mappa satellitare con il catasto, oppure importa un file KML del fascicolo aziendale.', `<div class="btns center"><button class="btn primary" data-act="tab" data-tab="mappa">${ic('map')}Disegna sulla mappa</button>${newBtn('campi', 'Inserisci senza mappa', '', '')}</div>`)}</section>`;
  const ha = sum(list, campoHa);
  const crops = new Map(); list.forEach(c => { const k = c.coltura || 'Non indicata'; crops.set(k, (crops.get(k) || 0) + campoHa(c)); });
  const parts = [...crops.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ label: k, v, color: cropColor({ coltura: k }) }));
  return `<section class="card summary"><div class="sum-top"><div><span class="eyebrow">Superficie aziendale</span><div class="big-num">${nf(ha, 2)}<small>ha</small></div></div><div class="btns"><button class="btn sm" data-act="tab" data-tab="mappa">${ic('map')}Mappa</button>${newBtn('campi', 'Nuovo', '', '')}</div></div>${stackBar(parts)}<div class="crop-legend">${parts.map(p => `<span><i style="background:${p.color}"></i>${esc(p.label)} <em>${nf(p.v, 2)} ha · ${nf(p.v / ha * 100, 0)}%</em></span>`).join('')}</div></section>
  <div class="field-grid">${list.map(c => { const i = campoInfo(c); const col = cropColor(c); const h = campoHa(c);
    return `<button class="field-card" data-act="open" data-type="campo" data-id="${c.id}"><span class="fc-thumb" style="color:${col}">${thumb(c.geom, 64, col)}</span><span class="fc-body"><b>${esc(c.nome)}${exChip(c)}</b><span class="fc-crop"><i style="background:${col}"></i>${esc(c.coltura || 'Coltura non indicata')}${c.varieta ? ' · ' + esc(c.varieta) : ''}</span><span class="fc-meta"><span class="num">${nf(h, 2)} ha</span><span>${plural(i.ops.length, 'lavoro', 'lavori')} ${UI.anno}</span><span class="num">${eur(h ? i.tot / h : 0)}/ha</span></span>${i.carenza ? `<span class="chip info">${ic('shield-check')}Carenza fino al ${fd(i.carenza.fine)}</span>` : ''}${!c.geom ? `<span class="chip ghost">${ic('pentagon')}Confine da disegnare</span>` : ''}</span>${ic('chevron-right', 'chev')}</button>`; }).join('')}</div>`;
}

function quaderno() {
  const fc = UI.f.qcampo || '', ft = UI.f.qtipo || '';
  const ops = S.operazioni.filter(o => yearOf(o.data) === UI.anno && (!fc || o.campoId === fc) && (!ft || o.tipo === ft)).sort(byDate).reverse();
  const tratt = ops.filter(o => o.tipo === 'Trattamento fitosanitario' || o.tipo === 'Diserbo').length;
  const groups = {}; ops.forEach(o => { const m = o.data.slice(0, 7); (groups[m] = groups[m] || []).push(o); });
  const mesi = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
  return `<div class="toolbar"><select class="inp" id="qcampo" data-filter="qcampo" aria-label="Appezzamento"><option value="">Tutti i campi</option>${[...S.campi].sort(byName).map(c => `<option value="${c.id}"${c.id === fc ? ' selected' : ''}>${esc(c.nome)}</option>`).join('')}</select><select class="inp" id="qtipo" data-filter="qtipo" aria-label="Operazione"><option value="">Tutte le operazioni</option>${TIPI_OP.map(t => `<option${t === ft ? ' selected' : ''}>${t}</option>`).join('')}</select><span class="sp"></span><button class="btn sm ghost" data-act="export" data-what="quaderno">${ic('download')}CSV</button>${newBtn('operazioni', 'Nuovo', fc ? `data-campo="${fc}"` : '')}</div>
  <p class="muted small">${plural(ops.length, 'registrazione', 'registrazioni')} nel ${UI.anno}${tratt ? ', di cui ' + plural(tratt, 'trattamento', 'trattamenti') + ' fitosanitari o diserbi' : ''}. L'esportazione CSV riporta prodotto, n. di registrazione, dose, avversità e tempi di carenza.</p>
  ${ops.length ? Object.entries(groups).map(([m, arr]) => `<section class="card"><div class="card-h"><h2>${mesi[+m.slice(5) - 1]} ${m.slice(0, 4)}</h2><span class="count">${arr.length}</span></div><div class="list">${arr.map(opRow).join('')}</div></section>`).join('') : `<section class="card">${empty('notebook-pen', 'Nessuna registrazione nel ' + UI.anno, 'Le operazioni compaiono qui raggruppate per mese.', newBtn('operazioni', 'Registra un lavoro'))}</section>`}`;
}

function costi() {
  const rows = [...S.campi].sort(byName).map(c => ({ c, i: campoInfo(c), h: campoHa(c) }));
  if (!rows.length) return `<section class="card">${empty('euro', 'Nessun appezzamento', 'Aggiungi i campi per vedere costi e margini.')}</section>`;
  const T = { ha: sum(rows, r => r.h), prod: sum(rows, r => r.i.prod), mez: sum(rows, r => r.i.mez), extra: sum(rows, r => r.i.extra), tot: sum(rows, r => r.i.tot), ric: sum(rows, r => r.i.ricavo) };
  const maxTot = Math.max(1, ...rows.map(r => r.h ? r.i.tot / r.h : 0));
  return `<div class="kpis three"><div class="kpi static"><span class="k-l">Costi ${UI.anno}</span><span class="k-v">${eur(T.tot)}</span><span class="k-s">${eur(T.ha ? T.tot / T.ha : 0)} per ettaro</span></div><div class="kpi static"><span class="k-l">Ricavi da raccolti</span><span class="k-v">${eur(T.ric)}</span><span class="k-s">dalle raccolte registrate</span></div><div class="kpi static"><span class="k-l">Margine</span><span class="k-v ${T.ric - T.tot < 0 ? 't-bad' : 't-ok'}">${eur(T.ric - T.tot)}</span><span class="k-s">${eur(T.ha ? (T.ric - T.tot) / T.ha : 0)} per ettaro</span></div></div>
  <section class="card"><div class="card-h"><h2>Costo per ettaro</h2><span class="muted small">prodotti · mezzi · extra</span></div><div class="hbars">${rows.map(({ c, i, h }) => { const k = h || 1; return `<button class="hbar" data-act="open" data-type="campo" data-id="${c.id}"><span class="hb-l"><i style="background:${cropColor(c)}"></i>${esc(c.nome)}</span><span class="hb-track"><span class="hb-seg prod" style="width:${i.prod / k / maxTot * 100}%"></span><span class="hb-seg mez" style="width:${i.mez / k / maxTot * 100}%"></span><span class="hb-seg extra" style="width:${i.extra / k / maxTot * 100}%"></span></span><span class="hb-v num">${eur(h ? i.tot / h : 0)}</span></button>`; }).join('')}</div><div class="legend"><span><i class="sw prod2"></i>prodotti</span><span><i class="sw mez"></i>mezzi</span><span><i class="sw extra"></i>contoterzi e altro</span></div></section>
  <section class="card flush"><div class="tablewrap"><table><thead><tr><th>Appezzamento</th><th>ha</th><th>Prodotti</th><th>Mezzi</th><th>Extra</th><th>Totale</th><th>€/ha</th><th>Ricavi</th><th>Margine</th></tr></thead><tbody>${rows.map(({ c, i, h }) => { const m = i.ricavo - i.tot; return `<tr><td>${esc(c.nome)}<small>${esc(c.coltura || '')}</small></td><td>${nf(h, 2)}</td><td>${eur(i.prod)}</td><td>${eur(i.mez)}</td><td>${eur(i.extra)}</td><td>${eur(i.tot)}</td><td>${eur(h ? i.tot / h : 0)}</td><td>${eur(i.ricavo)}</td><td class="${m < 0 ? 't-bad' : 't-ok'}">${eur(m)}</td></tr>`; }).join('')}<tr class="tot"><td>Totale azienda</td><td>${nf(T.ha, 2)}</td><td>${eur(T.prod)}</td><td>${eur(T.mez)}</td><td>${eur(T.extra)}</td><td>${eur(T.tot)}</td><td>${eur(T.ha ? T.tot / T.ha : 0)}</td><td>${eur(T.ric)}</td><td class="${T.ric - T.tot < 0 ? 't-bad' : 't-ok'}">${eur(T.ric - T.tot)}</td></tr></tbody></table></div></section>`;
}

function detail(c) {
  const i = campoInfo(c); const h = campoHa(c); const col = cropColor(c);
  const all = S.operazioni.filter(o => o.campoId === c.id).sort(byDate).reverse();
  return { title: c.nome, html: `<section class="card detail-hero"><div class="dh-thumb" style="color:${col}">${thumb(c.geom, 120, col)}</div><div class="dh-body"><span class="eyebrow">Appezzamento</span><h1>${esc(c.nome)}${exChip(c)}</h1><span class="fc-crop"><i style="background:${col}"></i>${esc(c.coltura || 'Coltura non indicata')}${c.varieta ? ' · ' + esc(c.varieta) : ''}</span>
    <div class="btns">${newBtn('operazioni', 'Registra lavoro', `data-campo="${c.id}"`)}<button class="btn sm" data-act="mapFocus" data-id="${c.id}">${ic('map')}${c.geom ? 'Sulla mappa' : 'Disegna confine'}</button><button class="btn sm ghost" data-act="edit" data-form="campi" data-id="${c.id}">${ic('pencil')}Modifica</button></div></div></section>
  <dl class="facts">${fact('Superficie', `<span class="num">${nf(h, 4)} ha</span>`)}${fact('Perimetro', c.geom ? `<span class="num">${nf(perimeterM(c.geom), 0)} m</span>` : '—')}${fact('Irriguo', esc(c.irriguo || '—'))}${fact('Conduzione', esc(c.conduzione || '—'))}${fact('Comune', esc(c.comune || '—'))}${fact('Catasto', esc(c.catasto || '—'))}${fact('Costi ' + UI.anno, `<span class="num">${eur(i.tot)}</span> <small>${eur(h ? i.tot / h : 0)}/ha</small>`)}${fact('Ricavi ' + UI.anno, `<span class="num">${eur(i.ricavo)}</span>`)}${fact('Tempo di carenza', i.carenza ? chip('fino al ' + fd(i.carenza.fine), 'info') : 'Nessuno')}</dl>
  ${c.note ? `<section class="card note">${esc(c.note)}</section>` : ''}
  <section class="card"><div class="card-h"><h2>Storia del campo</h2><span class="count">${all.length}</span></div><div class="list">${all.length ? all.map(opRow).join('') : empty('notebook-pen', 'Nessun lavoro registrato', 'Registra la prima lavorazione di questo campo.')}</div></section>` };
}
