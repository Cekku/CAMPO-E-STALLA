// Guida d'uso: una scheda per pagina (testi in js/guida.js), barra di ricerca e scelta dell'area.
// La ricerca ignora maiuscole e accenti e guarda titolo, testi e parole chiave; con una ricerca le schede si aprono da sole.
import { UI } from '../state.js';
import { esc } from '../util.js';
import { ic } from '../icons.js';
import { GUIDA, AREE_GUIDA } from '../guida.js';
import { contiVisibili } from './conti.js';

const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const testo = g => norm([g.titolo, g.cosa, ...(g.passi || []), ...(g.consigli || []), g.parole].join(' '));

function scheda(g, aperta) {
  const vai = g.vai ? `<button class="btn sm" data-act="guVai" data-area="${g.area === 'generale' ? UI.area : g.area}" data-tab="${g.vai[0]}"${g.vai[1] ? ` data-sub="${g.vai[1]}"` : ''}>Apri la pagina ${ic('chevron-right')}</button>` : '';
  return `<details class="card gu-s" id="gu-${esc(g.id)}"${aperta ? ' open' : ''}><summary>${ic(g.icona || 'info')}<b>${esc(g.titolo)}</b><span class="gu-cosa">${esc(g.cosa)}</span>${ic('chevron-down', 'gu-chev')}</summary>
  <div class="gu-b">${g.passi && g.passi.length ? `<ol>${g.passi.map(p => `<li>${esc(p)}</li>`).join('')}</ol>` : ''}
  ${g.consigli && g.consigli.length ? `<ul class="gu-tip">${g.consigli.map(p => `<li>${esc(p)}</li>`).join('')}</ul>` : ''}${vai}</div></details>`;
}

export function render() {
  const aree = AREE_GUIDA.filter(([k]) => contiVisibili() || (k !== 'conti' && k !== 'archivio'));
  const ok = new Set(aree.map(a => a[0]));
  const ar = ok.has(UI.sub.guida) ? UI.sub.guida : 'tutte';
  const parole = norm(UI.f.guq).split(/\s+/).filter(Boolean);
  const lista = GUIDA.filter(g => ok.has(g.area) && (ar === 'tutte' || g.area === ar) && (!parole.length || parole.every(p => testo(g).includes(p))));
  const gruppi = aree.map(([k, nome, i]) => [nome, i, lista.filter(g => g.area === k)]).filter(x => x[2].length);
  const chip = (k, l) => `<button data-act="sub" data-tab="guida" data-sec="guida" data-sub="${k}" aria-pressed="${ar === k}">${esc(l)}</button>`;
  return {
    title: 'Guida', html: `<div class="toolbar gu-bar"><div class="search">${ic('search')}<input class="inp" id="guq" data-filter="guq" type="search" placeholder="Cerca nella guida: fatture, latte, mappa…" value="${esc(UI.f.guq || '')}" autocomplete="off" aria-label="Cerca nella guida"></div>
  <div class="chipbar">${chip('tutte', 'Tutte')}${aree.map(([k, l]) => chip(k, l)).join('')}</div></div>
  ${parole.length ? `<p class="gu-n">${lista.length ? lista.length + (lista.length === 1 ? ' scheda trovata' : ' schede trovate') : 'Nessuna scheda trovata: prova con un\'altra parola.'}</p>` : ''}
  ${gruppi.map(([nome, i, gs]) => `<h2 class="gu-h">${ic(i)}${esc(nome)}</h2>${gs.map(g => scheda(g, parole.length > 0 && lista.length <= 6)).join('')}`).join('')}`
  };
}
