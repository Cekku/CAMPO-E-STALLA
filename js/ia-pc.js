// Pulsante "Accendi l'IA sul PC" (1.73.0): chiede al ponte dell'archivio (porta 1236, sempre acceso sul PC)
// di accendere LM Studio con il modello e il ponte dell'IA (porta 1235), poi aspetta che sia pronto.
import { lsGet, lsSet } from './util.js';
import { toast } from './ui.js';
import * as P from './views/archivio-dati.js';

let inCorso = false;
const pausa = ms => new Promise(r => setTimeout(r, ms));

/** Accende LM Studio (modello con memoria grande per la chat) e il ponte; ritorna il nome del modello o lancia l'errore. */
export async function preparaIaPC(modello) {
  if (P.conf().prova) throw new Error('l\'archivio è in modalità prova (dati inventati): collega il ponte vero del PC in Archivio');
  const conf = lsGet('ces.llm', null) || {};
  await P.accendiIA(modello || conf.model || '');
  for (let i = 0; i < 200; i++) {
    await pausa(1500);
    let s; try { s = await P.statoIA(); } catch (e) { continue; }
    if (s.fase === 'pronta') { lsSet('ces.llm', { url: conf.url || 'http://localhost:1235', model: s.modello || conf.model || '' }); return s.modello; }
    if (s.fase === 'errore') throw new Error(s.messaggio || 'errore sconosciuto');
  }
  throw new Error('ci mette troppo: guarda se LM Studio si è aperto');
}

/** Pulsante: accende l'IA sul PC; `dopo` si chiama quando è pronta (per ridisegnare). Ritorna true se accesa. */
export async function accendiIaPC(btn, dopo = () => { }) {
  if (inCorso) { toast('Sto già accendendo l\'IA sul PC…'); return false; }
  inCorso = true; if (btn) btn.disabled = true;
  try {
    toast('Accendo LM Studio e il ponte: può volerci un minuto…');
    const m = await preparaIaPC();
    toast('IA sul PC accesa' + (m ? ': ' + m : '')); dopo(); return true;
  } catch (e) {
    toast(e.spento ? 'Il ponte del PC non risponde: questo pulsante funziona solo sul computer dell\'azienda acceso (se serve, "Archivio - ponte riaccendi")'
      : e.codice === 404 ? 'Il ponte del PC è di una versione vecchia: fai doppio clic su "Archivio - ponte riaccendi" e riprova'
        : 'L\'IA sul PC non si accende: ' + e.message, 'err');
    return false;
  } finally { inCorso = false; if (btn) btn.disabled = false; }
}
