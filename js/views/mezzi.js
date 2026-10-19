// Mezzi: ore motore, tagliandi, scadenze, costi
import { S, UI, get } from '../state.js';
import { esc, nf, eur, fd, sum, byDate, byName, yearOf, N, diff, today, okD } from '../util.js';
import { ic } from '../icons.js';
import { mezzoOre, mezzoTagliando } from '../domain.js';
import { empty, newBtn, fact, chip, exChip } from '../ui.js';
import { opRow } from './oggi.js';

const costoAnno = m => sum(S.manutenzioni.filter(x => x.mezzoId === m.id && yearOf(x.data) === UI.anno), x => x.costo);
const oreAnno = m => sum(S.operazioni.filter(o => o.mezzoId === m.id && yearOf(o.data) === UI.anno), o => o.ore);
function scad(m) {
  let s = ''; const t = mezzoTagliando(m), ore = mezzoOre(m);
  if (t) { const r = t.prossimo - ore; s += chip(r < 0 ? 'Tagliando superato' : 'Tagliando tra ' + nf(r, 0) + ' h', r < 0 ? 'bad' : r <= 25 ? 'warn' : 'ok'); }
  [['scadenzaRevisione', 'Revisione', 30], ['scadenzaAssicurazione', 'Assicurazione', 30], ['controlloFunzionale', 'Controllo funzionale', 60]].forEach(([k, l, g]) => { if (okD(m[k])) { const d = diff(today(), m[k]); if (d <= g) s += chip(l + ' ' + fd(m[k]), d < 0 ? 'bad' : 'warn'); } });
  if (m.tipo === 'Irroratrice' && !okD(m.controlloFunzionale)) s += chip('Controllo funzionale da inserire', 'warn');
  return s;
}
export function render() {
  if (UI.detail && UI.detail.type === 'mezzo') { const m = get('mezzi', UI.detail.id); if (m) return detail(m); UI.detail = null; }
  const list = [...S.mezzi].sort(byName);
  const head = `<header class="pagehead"><h1>Mezzi</h1><div class="btns"><button class="btn sm" data-act="new" data-form="manutenzioni">${ic('wrench')}Manutenzione</button>${newBtn('mezzi', 'Mezzo')}</div></header>`;
  if (!list.length) return { title: 'Mezzi', html: head + `<section class="card">${empty('tractor', 'Nessun mezzo', 'Aggiungi trattori e attrezzi con ore motore, costo orario e scadenze: le ore dei lavori in campo si sommano da sole.', newBtn('mezzi', 'Aggiungi mezzo'))}</section>` };
  return { title: 'Mezzi', html: head + `<div class="kpis three"><div class="kpi static"><span class="k-l">Ore lavorate ${UI.anno}</span><span class="k-v">${nf(sum(list, oreAnno), 0)}<small>h</small></span><span class="k-s">dai lavori registrati</span></div><div class="kpi static"><span class="k-l">Manutenzioni ${UI.anno}</span><span class="k-v">${eur(sum(list, costoAnno))}</span><span class="k-s">${S.manutenzioni.filter(x => yearOf(x.data) === UI.anno).length} interventi</span></div><div class="kpi static"><span class="k-l">Parco mezzi</span><span class="k-v">${list.length}</span><span class="k-s">mezzi e attrezzi</span></div></div>
  <div class="field-grid">${list.map(m => { const ore = mezzoOre(m), t = mezzoTagliando(m); const pct = t ? Math.max(0, Math.min(100, (ore - t.ult) / (t.prossimo - t.ult) * 100)) : 0;
    return `<button class="field-card mezzo" data-act="open" data-type="mezzo" data-id="${m.id}"><span class="r-icon big">${ic(m.tipo === 'Irroratrice' ? 'droplets' : 'tractor')}</span><span class="fc-body"><b>${esc(m.nome)}${exChip(m)}</b><span class="fc-crop">${esc([m.tipo, m.modello, m.targa].filter(Boolean).join(' · '))}</span><span class="fc-meta"><span class="num">${nf(ore, 0)} h motore</span><span>${nf(oreAnno(m), 1)} h nel ${UI.anno}</span></span>${t ? `<span class="service"><i style="width:${pct}%" class="${pct >= 95 ? 'bad' : pct >= 85 ? 'warn' : ''}"></i></span>` : ''}<span class="chips">${scad(m)}</span></span>${ic('chevron-right', 'chev')}</button>`; }).join('')}</div>` };
}
function detail(m) {
  const ore = mezzoOre(m), t = mezzoTagliando(m);
  const man = S.manutenzioni.filter(x => x.mezzoId === m.id).sort(byDate).reverse();
  const ops = S.operazioni.filter(o => o.mezzoId === m.id && yearOf(o.data) === UI.anno).sort(byDate).reverse();
  return { title: m.nome, html: `<section class="card detail-hero"><div class="big-icon">${ic('tractor')}</div><div class="dh-body"><span class="eyebrow">${esc(m.tipo || 'Mezzo')}</span><h1>${esc(m.nome)}${exChip(m)}</h1><span class="muted">${esc([m.modello, m.targa, m.anno].filter(Boolean).join(' · '))}</span><div class="big-num">${nf(ore, 0)}<small>ore motore</small></div><div class="chips">${scad(m)}</div><div class="btns">${newBtn('manutenzioni', 'Manutenzione', `data-mezzo="${m.id}"`)}<button class="btn sm ghost" data-act="edit" data-form="mezzi" data-id="${m.id}">${ic('pencil')}Modifica</button></div></div></section>
  <dl class="facts">${fact('Costo orario', N(m.costoOra) ? `<span class="num">${eur(m.costoOra, 2)}/h</span>` : '—')}${fact('Prossimo tagliando', t ? `<span class="num">${nf(t.prossimo, 0)} h</span> <small>${t.prossimo - ore < 0 ? 'superato' : 'tra ' + nf(t.prossimo - ore, 0) + ' h'}</small>` : '—')}${fact('Revisione', fd(m.scadenzaRevisione))}${fact('Assicurazione', fd(m.scadenzaAssicurazione))}${m.tipo === 'Irroratrice' || m.controlloFunzionale ? fact('Controllo funzionale', fd(m.controlloFunzionale)) + fact('Regolazione', fd(m.taratura)) : ''}${fact('Ore ' + UI.anno, `<span class="num">${nf(oreAnno(m), 1)} h</span>`)}${fact('Manutenzioni ' + UI.anno, `<span class="num">${eur(costoAnno(m))}</span>`)}</dl>
  ${m.note ? `<section class="card note">${esc(m.note)}</section>` : ''}
  <section class="card"><div class="card-h"><h2>Manutenzioni</h2><span class="count">${man.length}</span></div><div class="list">${man.length ? man.map(x => `<button class="row" data-act="edit" data-form="manutenzioni" data-id="${x.id}"><span class="r-icon">${ic('wrench')}</span><span class="r-main"><b>${esc(x.tipo || 'Intervento')}${x.descrizione ? ' · ' + esc(x.descrizione) : ''}${exChip(x)}</b><span>${fd(x.data)}${N(x.ore) ? ' · ' + nf(x.ore, 0) + ' h' : ''}${x.officina ? ' · ' + esc(x.officina) : ''}</span></span><span class="r-side num">${eur(x.costo)}</span></button>`).join('') : '<div class="empty slim">Nessuna manutenzione registrata.</div>'}</div></section>
  <section class="card"><div class="card-h"><h2>Lavori nel ${UI.anno}</h2><span class="count">${nf(sum(ops, o => o.ore), 1)} h</span></div><div class="list">${ops.length ? ops.map(opRow).join('') : '<div class="empty slim">Nessun lavoro registrato con questo mezzo.</div>'}</div></section>` };
}
