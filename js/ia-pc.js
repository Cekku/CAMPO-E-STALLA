// Pulsante "Accendi l'IA sul PC" (1.73.0): chiede al ponte dell'archivio (porta 1236, sempre acceso sul PC)
// di accendere LM Studio con il modello e il ponte dell'IA (porta 1235), poi aspetta che sia pronto.
import { lsGet, lsSet } from './util.js';
import { toast } from './ui.js';
import * as P from './views/archivio-dati.js';

let inCorso = false;
const pausa = ms => new Promise(r => setTimeout(r, ms));

/** Accende l'IA sul PC; `dopo` si chiama quando è pronta (per ridisegnare). Ritorna true se accesa. */
export async function accendiIaPC(btn, dopo = () => { }) {
  if (inCorso) { toast('Sto già accendendo l\'IA sul PC…'); return false; }
  if (P.conf().prova) { toast('L\'archivio è in modalità prova (dati inventati): collega il ponte vero del PC in Archivio', 'err'); return false; }
  inCorso = true; if (btn) btn.disabled = true;
  const conf = lsGet('ces.llm', null) || {};
  try {
    toast('Accendo LM Studio e il ponte: può volerci un minuto…');
    await P.accendiIA(conf.model || '');
    for (let i = 0; i < 160; i++) {
      await pausa(1500);
      let s; try { s = await P.statoIA(); } catch (e) { continue; }
      if (s.fase === 'pronta') {
        lsSet('ces.llm', { url: conf.url || 'http://localhost:1235', model: s.modello || conf.model || '' });
        toast('IA sul PC accesa' + (s.modello ? ': ' + s.modello : '')); dopo(); return true;
      }
      if (s.fase === 'errore') throw new Error(s.messaggio || 'errore sconosciuto');
    }
    throw new Error('ci mette troppo: guarda se LM Studio si è aperto');
  } catch (e) {
    toast(e.spento ? 'Il ponte del PC non risponde: questo pulsante funziona solo sul computer dell\'azienda acceso (se serve, "Archivio - ponte riaccendi")'
      : e.codice === 404 ? 'Il ponte del PC è di una versione vecchia: fai doppio clic su "Archivio - ponte riaccendi" e riprova'
        : 'L\'IA sul PC non si accende: ' + e.message, 'err');
    return false;
  } finally { inCorso = false; if (btn) btn.disabled = false; }
}
