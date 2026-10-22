// Blocco dell'app con codice: all'apertura e dopo un periodo di inattività serve il codice per vedere i dati.
// Il codice non viene salvato: sul dispositivo resta solo la sua impronta (PBKDF2).
import { lsGet, lsSet, esc } from './util.js';
import { ic } from './icons.js';

const KEY = 'ces.lock';
export const lockCfg = () => lsGet(KEY, null);
export const lockAttivo = () => !!(lockCfg() && lockCfg().hash);
let ultimo = Date.now(), bloccata = false, nascosta = 0;

const hex = b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
async function impronta(codice, salt, iter) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(codice), 'PBKDF2', false, ['deriveBits']);
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode(salt), iterations: iter }, k, 256));
}
export async function verifica(codice) { const c = lockCfg(); if (!c) return true; return (await impronta(codice, c.salt, c.iter)) === c.hash; }
export async function impostaCodice(codice, minuti) {
  if (!/^.{4,}$/.test(codice)) throw new Error('Il codice deve avere almeno 4 caratteri.');
  const salt = hex(crypto.getRandomValues(new Uint8Array(16))); const iter = 200000;
  lsSet(KEY, { salt, iter, hash: await impronta(codice, salt, iter), minuti: minuti || 10 });
}
export function togliCodice() { try { localStorage.removeItem(KEY); } catch (e) { } }
export function impostaMinuti(m) { const c = lockCfg(); if (c) { c.minuti = m; lsSet(KEY, c); } }

export function blocca() {
  if (!lockAttivo()) return;
  bloccata = true; document.documentElement.classList.add('app-locked');
  let el = document.getElementById('lockScreen');
  if (!el) { el = document.createElement('div'); el.id = 'lockScreen'; document.body.appendChild(el); }
  el.innerHTML = `<form class="lock-box" id="lockForm" autocomplete="off"><img src="icons/icon-192.png" alt="" width="64" height="64"><h1>Campo e Stalla</h1><p>Inserisci il codice per aprire l'app.</p><input id="lockPin" type="password" inputmode="numeric" autocomplete="current-password" aria-label="Codice" placeholder="Codice"><p class="lock-err" id="lockErr" hidden></p><button class="btn primary" type="submit">${ic('check')}Sblocca</button><details class="lock-forgot"><summary>Hai dimenticato il codice?</summary><p>Il codice non si può recuperare. Puoi cancellare i dati di questo dispositivo e ripartire: se usi la sincronizzazione, dopo l'accesso i dati tornano dal cloud; altrimenti servirà una copia di sicurezza.</p><button class="btn ghost danger" type="button" id="lockWipe">${ic('trash-2')}Cancella i dati da questo dispositivo</button></details></form>`;
  el.hidden = false;
  const inp = document.getElementById('lockPin'); setTimeout(() => inp && inp.focus(), 50);
  document.getElementById('lockForm').onsubmit = async e => {
    e.preventDefault(); const err = document.getElementById('lockErr');
    if (await verifica(inp.value)) { sblocca(); } else { err.textContent = 'Codice errato.'; err.hidden = false; inp.value = ''; inp.focus(); }
  };
  let armato = false;
  document.getElementById('lockWipe').onclick = async ev => {
    const b = ev.currentTarget; if (!armato) { armato = true; b.textContent = 'Conferma: cancella tutto'; return; }
    togliCodice(); const { wipeLocal } = await import('./store.js'); wipeLocal();
  };
}
function sblocca() { bloccata = false; ultimo = Date.now(); document.documentElement.classList.remove('app-locked'); const el = document.getElementById('lockScreen'); if (el) { el.hidden = true; el.innerHTML = ''; } }
export const isBloccata = () => bloccata;

export function avviaBlocco() {
  if (lockAttivo()) blocca();
  ['pointerdown', 'keydown', 'scroll', 'touchstart'].forEach(ev => window.addEventListener(ev, () => { if (!bloccata) ultimo = Date.now(); }, { passive: true, capture: true }));
  setInterval(() => { const c = lockCfg(); if (c && !bloccata && Date.now() - ultimo > (c.minuti || 10) * 60000) blocca(); }, 20000);
  document.addEventListener('visibilitychange', () => {
    const c = lockCfg(); if (!c) return;
    if (document.visibilityState === 'hidden') nascosta = Date.now();
    else if (nascosta && Date.now() - nascosta > Math.min(c.minuti || 10, 2) * 60000) blocca();
  });
}

/** Sezione delle impostazioni. */
export function sezioneBlocco() {
  const c = lockCfg();
  return `<section class="card set" id="blocco"><div class="set-h">${ic('shield-check')}<div><h2>Blocco con codice</h2><p>${c ? 'Attivo: l\'app chiede il codice all\'apertura e dopo ' + (c.minuti || 10) + ' minuti di inattività.' : 'Chiedi un codice all\'apertura dell\'app e dopo qualche minuto di inattività, così chi prende in mano il telefono o il computer non vede i tuoi dati.'} Il codice vale solo su questo dispositivo.</p></div></div>
  <form class="fgrid" data-form-act="lockSet">${c ? `<label class="fld half"><span class="flabel">Codice attuale</span><div class="inwrap"><input id="lk_old" type="password" inputmode="numeric" autocomplete="current-password"></div></label><span></span>` : ''}
  <label class="fld half"><span class="flabel">${c ? 'Nuovo codice' : 'Codice'}</span><div class="inwrap"><input id="lk_new" type="password" inputmode="numeric" autocomplete="new-password" placeholder="almeno 4 cifre"></div></label>
  <label class="fld half"><span class="flabel">Blocca dopo</span><select id="lk_min">${[2, 5, 10, 30, 60].map(m => `<option value="${m}"${(c ? c.minuti || 10 : 10) === m ? ' selected' : ''}>${m} minuti di inattività</option>`).join('')}</select></label>
  <div class="fld row-btns"><button class="btn primary" type="submit">${c ? 'Salva' : 'Attiva il blocco'}</button>${c ? `<button class="btn ghost danger" type="button" data-act="lockOff">Disattiva</button><button class="btn ghost" type="button" data-act="lockNow">${ic('shield-check')}Blocca adesso</button>` : ''}</div></form></section>`;
}
export async function salvaBloccoDaForm($) {
  const c = lockCfg(); const nuovo = $('#lk_new').value; const min = +$('#lk_min').value || 10;
  if (c) {
    if (!(await verifica($('#lk_old').value))) throw new Error('Il codice attuale non è corretto.');
    if (nuovo) await impostaCodice(nuovo, min); else impostaMinuti(min);
    return nuovo ? 'Codice cambiato' : 'Impostazione salvata';
  }
  await impostaCodice(nuovo, min); return 'Blocco attivato: ricordati il codice';
}
export async function disattivaDaForm($) {
  if (!(await verifica(($('#lk_old') || {}).value || ''))) throw new Error('Scrivi il codice attuale per disattivare il blocco.');
  togliCodice(); return 'Blocco disattivato';
}
