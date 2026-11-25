// Archivio → Errori dell'app (1.77.0, solo titolare): gli errori di tutti i dispositivi dell'azienda, scritti da js/errori.js
// nella raccolta `errori` (un record per errore e dispositivo); qui lo stesso errore è una riga sola, unita per firma.
import { S, bus } from '../state.js';
import { esc, nf, fd } from '../util.js';
import { ic } from '../icons.js';
import { toast, arm, empty } from '../ui.js';
import * as store from '../store.js';
import { contiVisibili } from './conti.js';
import { tabella, bottoniExport } from '../conti/tabelle.js';
import { gruppi, visti, VISTI, MAX, GIORNI } from '../errori.js';

const TIPO = { errore: 'Errore', promessa: 'Errore in un lavoro in corso', azione: 'Errore di un pulsante', file: 'File non caricato' };
const ora = iso => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }); };
const quando = iso => (iso ? fd(String(iso).slice(0, 10)) + ' ' + ora(iso) : '');
const dove = p => String(p || '').split('/').filter(Boolean).join(' › ');
const testo = g => (g.nome ? g.nome + ': ' : '') + (g.msg || '');

/** Quanti errori diversi non ancora visti (per l'avviso nel cruscotto). */
export const nuovi = () => gruppi(S.errori).filter(g => g.nuovo).length;

export function render() {
  if (!contiVisibili()) return { title: "Errori dell'app", html: `<section class="card lock">${ic('bug', 'huge')}<h2>Pagina riservata al titolare</h2><p class="muted">Gli errori dell'app li vede solo chi ha creato l'azienda.</p></section>` };
  const gg = gruppi(S.errori), n = gg.filter(g => g.nuovo).length;
  let html = `<header class="pagehead"><h1>Errori dell'app</h1></header>
    <section class="card"><div class="card-h"><h2>${ic('bug')}Registro degli errori</h2></div>
    <p class="muted">Quando l'app si blocca o dà un errore su un dispositivo dell'azienda (anche il telefono di un collaboratore), l'errore resta scritto qui. Prima di salvarlo il testo si ripulisce da importi, date, nomi, codici, email e nomi dei file. Restano al massimo ${MAX} righe, per ${GIORNI} giorni.</p>
    <p class="muted small">Chi è in sola lettura non può scrivere: i suoi errori restano sul suo dispositivo.</p>
    <div class="btns"><button class="btn sm" data-act="er-tutti"${n ? '' : ' disabled'}>${ic('check')}Segna tutti come visti</button><button class="btn sm ghost" data-act="er-svuota"${gg.length ? '' : ' disabled'}>${ic('trash-2')}Svuota</button></div></section>`;
  if (!gg.length) return { title: "Errori dell'app", html: html + empty('bug', 'Nessun errore registrato', "Se l'app dà un errore su un dispositivo dell'azienda, compare qui") };
  tabella('erElenco', {
    title: "Errori dell'app", sheet: 'Errori', sort: false, piede: "Registro degli errori di Campo e Stalla: testo ripulito dai dati.",
    cols: [{ k: 'ultima', h: 'Ultima volta' }, { k: 'volte', h: 'Volte', fmt: 'int' }, { k: 'stato', h: 'Stato' }, { k: 'errore', h: 'Errore' }, { k: 'dove', h: 'Dove' }, { k: 'versione', h: 'Versione' }, { k: 'disp', h: 'Dispositivi' }, { k: 'codice', h: 'Nel codice' }, { k: 'prima', h: 'Prima volta' }],
    rows: gg.map(g => ({ ultima: quando(g.ultima), volte: g.volte, stato: g.nuovo ? 'Nuovo' : 'Visto', errore: testo(g), dove: g.pagine.map(dove).join(' / '), versione: g.versioni.join(', '), disp: g.disp.join(' / '), codice: g.pila.join(' / '), prima: quando(g.prima) })),
  });
  html += `<section class="card"><div class="card-h"><h2>${ic('list')}Errori (${gg.length})</h2>${n ? `<span class="sc-grav sc-g-alta">${n} ${n === 1 ? 'nuovo' : 'nuovi'}</span>` : ''}</div>
    ${gg.map(riga).join('')}${bottoniExport(['erElenco'], 'errori-app')}</section>`;
  return { title: "Errori dell'app", html };
}

function riga(g) {
  const meta = [g.volte === 1 ? 'una volta' : nf(g.volte, 0) + ' volte', 'ultima ' + quando(g.ultima), g.pagine.length ? dove(g.pagine[0]) : '', g.versioni.length ? 'versione ' + g.versioni.join(', ') : '', g.disp.join(', ')].filter(Boolean);
  return `<div class="er-riga${g.nuovo ? ' nuovo' : ''}">
    <div class="nz-meta">${g.nuovo ? '<span class="sc-grav sc-g-alta">Nuovo</span> ' : ''}${esc(TIPO[g.tipo] || 'Errore')}</div>
    <p class="er-msg">${esc(testo(g))}</p>
    <div class="nz-meta">${meta.map(esc).join(' · ')}</div>
    <details><summary>Più dettagli</summary>
      ${g.pila.length ? `<p class="small">Nel codice:</p><ul class="er-pila">${g.pila.map(x => `<li><code>${esc(x)}</code></li>`).join('')}</ul>` : ''}
      <p class="muted small">Prima volta: ${esc(quando(g.prima))}${g.pagine.length > 1 ? ' · pagine: ' + esc(g.pagine.map(dove).join(', ')) : ''}${g.ids.length > 1 ? ' · su ' + g.ids.length + ' dispositivi' : ''}</p>
    </details>
    ${g.nuovo ? `<div class="btns"><button class="btn sm ghost" data-act="er-visto" data-firma="${esc(g.firma)}">${ic('check')}Segna come visto</button></div>` : ''}
  </div>`;
}

// "Visto" = fino a quest'ora, in un record solo (config errori-visti, js/errori.js): se l'errore torna dopo, torna nuovo.
// Se l'orologio di un telefono va avanti, la sua ultima volta è "dopo adesso": vale quella, così il visto tiene.
async function segna(firme) {
  const adesso = new Date().toISOString(), gg = gruppi(S.errori, {}), v = Object.assign({}, visti());
  for (const g of gg) if (firme.has(g.firma)) v[g.firma] = g.ultima > adesso ? g.ultima : adesso;
  // via i visti più vecchi di 90 giorni (gli errori così vecchi si tolgono da soli); non quelli degli errori che qui mancano:
  // su un dispositivo appena collegato possono non essere ancora arrivati
  const limite = new Date(Date.now() - GIORNI * 864e5).toISOString();
  for (const f of Object.keys(v)) if (!(typeof v[f] === 'string' && v[f] >= limite)) delete v[f];
  await store.put('config', VISTI, { firme: v });
}

export async function erAct(a, b, d) {
  switch (a) {
    case 'er-visto': await segna(new Set([d.firma])); toast('Segnato come visto'); return bus.render();
    case 'er-tutti': await segna(new Set(gruppi(S.errori).filter(g => g.nuovo).map(g => g.firma))); toast('Tutti segnati come visti'); return bus.render();
    case 'er-svuota': return arm(b, 'Tocca ancora per cancellare tutti gli errori', async () => {
      for (const r of [...S.errori]) await store.remove('errori', r.id);
      if (S.config.some(c => c.id === VISTI)) await store.remove('config', VISTI);
      toast('Registro svuotato'); bus.render();
    });
  }
}
