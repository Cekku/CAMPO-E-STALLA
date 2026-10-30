// App Android (Capacitor): le funzioni che il browser fa da solo e la WebView no.
// Nel sito tutto resta com'era: queste funzioni lavorano solo dentro l'APK.
import { $ } from './util.js';
import { ic } from './icons.js';
import { toast } from './ui.js';

const CAP = window.Capacitor;
export const nativa = !!(CAP && CAP.isNativePlatform && CAP.isNativePlatform());
const P = nativa ? CAP.Plugins : {};
export const SITO = 'https://cekku.github.io/CAMPO-E-STALLA/';
const RILASCI = 'https://github.com/Cekku/CAMPO-E-STALLA/releases/latest';

/** Indirizzo per i collegamenti nelle mail (conferma account, nuova password): nell'app è quello del sito. */
export const indirizzoPubblico = () => nativa ? SITO : location.origin + location.pathname;

const base64 = blob => new Promise((ok, ko) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1] || ''); r.onerror = () => ko(r.error); r.readAsDataURL(blob); });

function avvisoFisso(testo, bottone, azione) {
  const t = $('#toast'); t.innerHTML = ic('circle-check') + `<span>${testo}</span><button class="btn sm" id="tstBtn">${bottone}</button>`;
  t.className = 'toast show sticky'; t.hidden = false;
  const chiudi = () => { t.classList.remove('show'); setTimeout(() => (t.hidden = true), 250); };
  $('#tstBtn').onclick = () => { chiudi(); azione(); };
  setTimeout(chiudi, 9000);
}

/** Salva un file nella cartella Documenti/Campo e Stalla del telefono; se non si può, apre subito Condividi. */
export async function salvaFile(nome, blob) {
  const data = await base64(blob);
  try {
    const { uri } = await P.Filesystem.writeFile({ path: 'Campo e Stalla/' + nome, data, directory: 'DOCUMENTS', recursive: true });
    avvisoFisso(`Salvato in Documenti › Campo e Stalla`, 'Condividi', () => P.Share.share({ title: nome, files: [uri] }).catch(() => { }));
  } catch (e) {
    try {
      const { uri } = await P.Filesystem.writeFile({ path: nome, data, directory: 'CACHE' });
      await P.Share.share({ title: nome, files: [uri] });
    } catch (e2) { if (!/cancel/i.test(String(e2 && e2.message))) toast('Non riesco a salvare il file: ' + (e2.message || e2), 'err'); }
  }
}

/** Stampa (o salva in PDF dal dialogo di Android) una pagina HTML completa. */
export function stampaHtml(html, titolo) {
  return P.Stampa.html({ html, titolo: titolo || 'Campo e Stalla', orizzontale: /size:\s*A4\s+landscape/i.test(html) }).catch(e => toast('Stampa non riuscita: ' + (e.message || e), 'err'));
}

/** Tasto Indietro di Android: `gestisci(puoTornare)` restituisce true se ha fatto qualcosa, altrimenti l'app va in secondo piano. */
export function alTastoIndietro(gestisci) {
  if (!nativa) return;
  P.App.addListener('backButton', ({ canGoBack }) => { if (!gestisci(canGoBack)) P.App.minimizeApp(); });
}

const piuNuova = (a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); } return false; };
/** Controlla su GitHub se è uscito un APK più nuovo di quello installato. */
export async function controllaAggiornamento(versione) {
  if (!nativa || !navigator.onLine) return;
  try {
    const r = await fetch('https://api.github.com/repos/Cekku/CAMPO-E-STALLA/releases/latest', { cache: 'no-store' }); if (!r.ok) return;
    const nuova = String((await r.json()).tag_name || '').replace(/^v/, '');
    if (nuova && piuNuova(nuova, versione)) avvisoFisso(`C'è l'app nuova (${nuova})`, 'Scarica', () => window.open(RILASCI, '_blank'));
  } catch (e) { }
}

// I file preparati dall'app (Excel, CSV, PDF, copie, allegati) passano tutti da un <a download> con un indirizzo blob:
// la WebView di Android non li scarica, quindi li prendo qui e li salvo con le funzioni del telefono.
if (nativa) document.addEventListener('click', e => {
  const a = e.target.closest && e.target.closest('a[download]'); if (!a || !/^blob:/.test(a.href)) return;
  e.preventDefault();
  fetch(a.href).then(r => r.blob()).then(b => salvaFile(a.getAttribute('download') || 'file', b)).catch(err => toast('Non riesco a salvare il file: ' + err.message, 'err'));
}, true);
