// Attività: completate e pianificate, filtri per campo e tipologia, quaderno esportabile
import { S, UI } from '../state.js';
import { esc, nf, sum, byDate, byName, yearOf, today } from '../util.js';
import { ic } from '../icons.js';
import { TIPI_OP, campoHa, cropOf } from '../domain.js';
import { tabs, empty, newBtn } from '../ui.js';
import { opRow } from './oggi.js';

const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];

export function render() {
  const sub = UI.sub.attivita === 'pianificate' ? 'pianificate' : 'completate';
  const fc = UI.f.qcampo || '', ft = UI.f.qtipo || '', fcol = UI.f.qcol || '';
  const isPlan = o => o.stato === 'Pianificata';
  const base = S.operazioni.filter(o => (!fc || o.campoId === fc) && (!ft || o.tipo === ft) && (!fcol || cropOf(S.campi.find(c => c.id === o.campoId), yearOf(o.data)) === fcol));
  const done = base.filter(o => !isPlan(o) && yearOf(o.data) === UI.anno);
  const plan = base.filter(isPlan);
  const list = (sub === 'pianificate' ? plan.sort(byDate) : done.sort(byDate).reverse());
  const ore = sum(done, o => o.ore);
  const haTot = sum([...new Set(done.map(o => o.campoId))].map(id => S.campi.find(c => c.id === id) || {}), campoHa);
  const colture = [...new Set(S.campi.map(c => cropOf(c)).filter(Boolean))].sort();
  const groups = {}; list.forEach(o => { const m = (o.data || '').slice(0, 7); (groups[m] = groups[m] || []).push(o); });
  const head = `<div class="act-head"><div><span class="eyebrow">Attività ${UI.anno}</span><div class="act-stats"><span><b>${done.length}</b> completate</span><span><b>${plan.length}</b> pianificate</span><span><b>${nf(ore, 0)}</b> ore di lavoro</span><span><b>${nf(haTot, 1)}</b> ha lavorati</span></div></div><div class="btns"><button class="btn sm ghost" data-act="export" data-what="registro">${ic('printer')}Registro PDF</button><button class="btn sm ghost" data-act="export" data-what="quaderno">${ic('download')}CSV</button>${newBtn('operazioni', 'Nuova attività', '', 'action')}</div></div>`;
  const filters = `<div class="toolbar"><select class="inp" id="qcampo" data-filter="qcampo" aria-label="Campo"><option value="">Tutti i campi</option>${[...S.campi].sort(byName).map(c => `<option value="${c.id}"${c.id === fc ? ' selected' : ''}>${esc(c.nome)}</option>`).join('')}</select><select class="inp" id="qcol" data-filter="qcol" aria-label="Coltura"><option value="">Tutte le colture</option>${colture.map(c => `<option${c === fcol ? ' selected' : ''}>${esc(c)}</option>`).join('')}</select><select class="inp" id="qtipo" data-filter="qtipo" aria-label="Tipologia"><option value="">Tutte le tipologie</option>${TIPI_OP.map(t => `<option${t === ft ? ' selected' : ''}>${t}</option>`).join('')}</select></div>`;
  const body = list.length ? Object.entries(groups).map(([m, arr]) => `<section class="card"><div class="card-h"><h2>${m ? MESI[+m.slice(5) - 1] + ' ' + m.slice(0, 4) : 'Senza data'}</h2><span class="count">${arr.length}</span></div><div class="list">${arr.map(opRow).join('')}</div></section>`).join('')
    : `<section class="card">${sub === 'pianificate' ? empty('calendar', 'Niente da fare in programma', 'Pianifica lavorazioni, trattamenti e raccolte: compariranno tra gli avvisi quando si avvicina la data.', newBtn('operazioni', 'Pianifica attività', 'data-stato="Pianificata"', 'action')) : empty('notebook-pen', 'Nessuna attività nel ' + UI.anno, 'Registra la prima attività: puoi farla su più campi insieme.', newBtn('operazioni', 'Nuova attività', '', 'action'))}</section>`;
  return { title: 'Attività', html: head + tabs('attivita', [['completate', 'Completate', done.length], ['pianificate', 'Pianificate', plan.length]], sub) + filters + body };
}
