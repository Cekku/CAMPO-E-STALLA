// Installazione come app sul telefono o sul computer
import { bus } from './state.js';
import { ic } from './icons.js';
import { openSheet } from './ui.js';

let deferred = null;
export const isStandalone = () => !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) || window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const canInstall = () => !isStandalone() && (!!deferred || isIOS());

window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; bus.render(); });
window.addEventListener('appinstalled', () => { deferred = null; bus.render(); });

export async function promptInstall() {
  if (deferred) { deferred.prompt(); try { await deferred.userChoice; } catch (e) { } deferred = null; bus.render(); return; }
  if (isIOS()) {
    openSheet('Installa su iPhone o iPad', `<ol class="steps">
      <li><span class="st-n">1</span><div><b>Apri questa pagina con Safari</b><p>L'installazione su iPhone funziona solo da Safari.</p></div></li>
      <li><span class="st-n">2</span><div><b>Tocca il pulsante Condividi</b><p>È il quadrato con la freccia verso l'alto, ${ic('share')} in fondo allo schermo.</p></div></li>
      <li><span class="st-n">3</span><div><b>Scegli "Aggiungi alla schermata Home"</b><p>Scorri l'elenco se non lo vedi subito, poi tocca Aggiungi.</p></div></li>
    </ol><p class="muted">L'app si apre a schermo intero dalla sua icona e funziona anche senza rete.</p>`);
    return;
  }
  openSheet('Installa l\'app', `<ol class="steps">
    <li><span class="st-n">1</span><div><b>Apri il menu del browser</b><p>I tre puntini in alto a destra in Chrome, o il menu in Edge.</p></div></li>
    <li><span class="st-n">2</span><div><b>Scegli "Installa app" o "Aggiungi a schermata Home"</b><p>Il nome cambia da browser a browser.</p></div></li></ol>`);
}
