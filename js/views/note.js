// Note: osservazioni, misure, promemoria, anche legate a un campo
import { S, UI } from '../state.js';
import { esc, byDate, byName } from '../util.js';
import { ic } from '../icons.js';
import { empty, newBtn } from '../ui.js';
import { TIPI_NOTA } from '../domain.js';
import { noteCard } from './oggi.js';

export function render() {
  const q = (UI.f.nq || '').toLowerCase().trim(), fc = UI.f.ncampo || '', ft = UI.f.ntipo || '';
  const list = [...S.note].filter(n => (!fc || n.campoId === fc) && (!ft || (n.tipoNota || 'Nota generica') === ft) && (!q || ((n.titolo || '') + ' ' + (n.testo || '') + ' ' + (n.tipoNota || 'Nota generica')).toLowerCase().includes(q))).sort(byDate).reverse();
  return { title: 'Note', html: `<div class="toolbar"><div class="search">${ic('search')}<input class="inp" id="nq" data-filter="nq" placeholder="Cerca nelle note" value="${esc(UI.f.nq || '')}" autocomplete="off"></div><select class="inp" id="ncampo" data-filter="ncampo" aria-label="Campo"><option value="">Tutti i campi</option>${[...S.campi].sort(byName).map(c => `<option value="${c.id}"${c.id === fc ? ' selected' : ''}>${esc(c.nome)}</option>`).join('')}</select><select class="inp" id="ntipo" data-filter="ntipo" aria-label="Tipo di nota"><option value="">Tutti i tipi</option>${TIPI_NOTA.map(t => `<option${t === ft ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select><span class="sp"></span><button class="btn sm ghost" data-act="export" data-what="note">${ic('download')}CSV</button>${newBtn('note', 'Nuova nota', '', 'action')}</div>
  ${list.length ? `<div class="note-grid">${list.map(noteCard).join('')}</div>` : `<section class="card">${empty('pencil', S.note.length ? 'Nessuna nota trovata' : 'Nessuna nota', 'Annota prove, misure, problemi visti in campo o promemoria. Dalla mappa puoi creare una nota su un campo.', S.note.length ? '' : newBtn('note', 'Scrivi la prima nota', '', 'action'))}</section>`}` };
}
