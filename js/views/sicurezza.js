// Sicurezza: resoconto del controllo settimanale scritto dalla funzione Supabase "sicurezza" (solo titolare).
// Raccolta `sicurezza`: un resoconto al giorno (id AAAA-MM-GG), `attivo` (lo scrive l'app), `pc` e `giro` (segni interni).
import { S, UI, bus } from '../state.js';
import { esc, nf, fd } from '../util.js';
import { ic } from '../icons.js';
import { toast, arm, empty } from '../ui.js';
import * as store from '../store.js';
import { sync } from '../store.js';
import { contiVisibili } from './conti.js';
import { tabella, bottoniExport } from '../conti/tabelle.js';
import { STATI, GRAVITA } from '../../supabase/functions/_shared/sicurezza.js';

const SCHEMA = {};   // versione dello schema Supabase (una sola richiesta)
const ORDINE = { alta: 0, media: 1, bassa: 2 };
const sicuro = u => (/^https:\/\//i.test(String(u || '')) ? String(u) : '');   // solo link https
const resoconti = () => S.sicurezza.filter(r => /^\d{4}-\d{2}-\d{2}$/.test(r.id)).sort((a, b) => b.id.localeCompare(a.id));
const attivo = () => { const r = S.sicurezza.find(x => x.id === 'attivo'); return !!(r && r.attivo); };
const link = (u, t) => { const h = sicuro(u); return h ? `<a href="${esc(h)}" target="_blank" rel="noopener noreferrer">${esc(t)}</a>` : ''; };

/** Resoconto più recente e numero di problemi gravi (per l'avviso nel cruscotto). */
export const ultimoResoconto = () => resoconti()[0] || null;
export const gravi = r => ((r && r.falle) || []).filter(f => f.gravita === 'alta').length;

export function render() {
  if (!contiVisibili()) return { title: 'Sicurezza', html: `<section class="card lock">${ic('shield-check', 'huge')}<h2>Pagina riservata al titolare</h2><p class="muted">Il controllo di sicurezza lo vede solo chi ha creato l'azienda.</p></section>` };
  const cloud = !!(sync.mode === 'cloud' && sync.farm && store.cloudReady());
  // se il database non risponde si riprova dopo 30 secondi, invece di lasciare i pulsanti spenti fino al ricaricamento
  if (cloud && SCHEMA.v === undefined) { SCHEMA.v = null; SCHEMA.letto = false; store.schemaVersion().then(v => { SCHEMA.v = v; SCHEMA.letto = true; if (v == null) setTimeout(() => { SCHEMA.v = undefined; bus.render(); }, 30000); bus.render(); }); }
  const vecchio = cloud && SCHEMA.v != null && SCHEMA.v < 7;
  const blocca = !cloud || SCHEMA.v == null || vecchio;
  let html = `<header class="pagehead"><h1>Sicurezza</h1></header>`;
  if (!cloud) html += `<section class="card sc-avviso"><p>${ic('shield-alert')} Il controllo gira su Supabase: serve l'azienda collegata online (La mia azienda → Sincronizzazione).</p></section>`;
  if (cloud && SCHEMA.letto && SCHEMA.v == null) html += `<div class="note-box warn">${ic('shield-alert')}<span>Non riesco a leggere la versione del database: riprovo fra poco.</span></div>`;
  if (vecchio) html += `<div class="note-box warn">${ic('shield-alert')}<span><b>Prima un passo su Supabase.</b> Esegui il file <i>supabase/aggiornamento-sicurezza.sql</i> in Supabase (vedi <i>strumenti/sicurezza/LEGGIMI.md</i>): così i resoconti restano riservati al titolare.</span></div>`;
  const on = attivo(); const d = blocca ? ' disabled' : '';
  html += `<section class="card"><div class="card-h"><h2>${ic('shield-check')}Controllo settimanale</h2></div>
    <p class="muted">${on ? 'Controllo ogni lunedì mattina.' : 'Il controllo non è attivo.'}</p>
    ${cloud ? `<p class="muted small">Codice dell'azienda da mettere in Supabase nel segreto SICUREZZA_FARM: <code>${esc(sync.farm.id)}</code></p>` : ''}
    <div class="btns">${on ? `<button class="btn sm ghost" data-act="sc-sospendi"${d}>Sospendi</button>` : `<button class="btn sm action" data-act="sc-attiva"${d}>Attiva il controllo settimanale</button>`}
    <button class="btn sm" data-act="sc-ora"${d}>${ic('refresh-cw')}Controlla adesso</button></div></section>`;
  const rr = resoconti();
  if (!rr.length) return { title: 'Sicurezza', html: html + empty('shield', 'Nessun resoconto ancora', 'Attiva il controllo o premi Controlla adesso') };
  const r = rr.find(x => x.id === UI.scGiorno) || rr[0];
  html += `<div class="btns"><select class="nz-sel" data-sc="giorno" aria-label="Scegli il resoconto">${rr.slice(0, 60).map(x => `<option value="${esc(x.id)}"${x.id === r.id ? ' selected' : ''}>${esc(fd(x.id))}</option>`).join('')}</select></div>`;
  return { title: 'Sicurezza', html: html + resoconto(r) };
}

function resoconto(r) {
  const st = ['verde', 'giallo', 'rosso'].includes(r.stato) ? r.stato : 'giallo';
  const falle = [...(r.falle || [])].sort((a, b) => (ORDINE[a.gravita] ?? 3) - (ORDINE[b.gravita] ?? 3));
  const notizie = r.notizie || [];
  const ci = notizie.filter(n => n.riguarda === 'si' || n.riguarda === 'forse'), altre = notizie.filter(n => !(n.riguarda === 'si' || n.riguarda === 'forse'));
  const ok = [...(r.ok || []), ...((r.pc && r.pc.ok) || [])];
  const errori = Object.entries(r.errori || {});
  let h = `<section class="card sc-stato sc-${st}"><div class="card-h"><h2><span class="sc-pallino"></span>${esc(STATI[st] || st)}</h2><span class="muted small">${esc(fd(r.giorno || r.id))}</span></div>
    ${r.titolo ? `<p><b>${esc(r.titolo)}</b></p>` : ''}${r.sintesi ? `<p>${esc(r.sintesi)}</p>` : ''}
    <p class="muted small">${r.motore === 'claude' ? 'Scritto da Claude' + (r.modello ? ' (' + esc(r.modello) + ')' : '') : 'Resoconto automatico'}${r.costo ? ' · costo circa ' + nf(r.costo, 3) + ' $' : ''}</p>
    ${r.erroreIA ? `<p class="muted small">Claude non ha risposto: ${esc(r.erroreIA)}</p>` : ''}</section>`;
  if (falle.length) tabella('scFalle', { title: 'Sicurezza: da sistemare', sheet: 'Sicurezza', sort: false, piede: 'Controllo della sicurezza di Campo e Stalla: resoconto automatico, da verificare prima di agire.', cols: [{ k: 'gravita', h: 'Gravità' }, { k: 'parte', h: 'Parte' }, { k: 'titolo', h: 'Cosa' }, { k: 'rimedio', h: 'Come sistemarlo' }, { k: 'chi', h: 'Chi lo fa' }, { k: 'fonte', h: 'Dettagli' }], rows: falle.map(f => ({ gravita: GRAVITA[f.gravita] || f.gravita || '', parte: f.parte || '', titolo: f.titolo || '', rimedio: (f.rimedio || []).join(' / '), chi: f.chi || '', fonte: /^https:\/\//.test(f.fonte || '') ? f.fonte : '' })) });
  h += `<section class="card"><div class="card-h"><h2>${ic('shield-alert')}Da sistemare (${falle.length})</h2></div>${falle.length ? falle.map(falla).join('') : '<p class="muted">Nessun problema trovato.</p>'}
    ${falle.length ? bottoniExport(['scFalle'], 'sicurezza-da-sistemare') : ''}</section>`;
  if (notizie.length) h += `<section class="card"><div class="card-h"><h2>${ic('newspaper')}Notizie della settimana</h2></div>${ci.length ? `<ul class="nz-punti">${ci.map(notizia).join('')}</ul>` : '<p class="muted">Nessuna notizia che ti riguarda.</p>'}
    ${altre.length ? `<details><summary>Altre notizie (${altre.length})</summary><ul class="nz-punti">${altre.map(notizia).join('')}</ul></details>` : ''}</section>`;
  if ((r.consigli || []).length) h += `<section class="card"><div class="card-h"><h2>${ic('info')}Consigli</h2></div><ul class="nz-punti">${r.consigli.map(x => `<li>${esc(x)}</li>`).join('')}</ul></section>`;
  h += `<section class="card"><details><summary>Controlli a posto (${ok.length})</summary><ul class="nz-punti">${ok.map(o => `<li><b>${esc(o.parte || '')}</b> ${esc(o.titolo || '')}</li>`).join('')}</ul></details></section>`;
  h += `<section class="card"><div class="card-h"><h2>${ic('monitor')}Parte del PC</h2></div>${r.pc ? `<p>Controllo del ${esc(fd(String(r.pc.creato || '').slice(0, 10)))}${r.pc.computer ? ' sul computer ' + esc(r.pc.computer) : ''}.</p>${r.pc.vecchio ? '<p class="muted">Il controllo del PC è vecchio: rifallo.</p>' : ''}` : '<p class="muted">Il PC non ha ancora mandato il suo controllo: vedi strumenti/sicurezza/LEGGIMI.md</p>'}</section>`;
  if (errori.length) h += `<section class="card"><details><summary>Controlli non riusciti (${errori.length})</summary><ul class="nz-punti">${errori.map(([n, m]) => `<li><b>${esc(n)}</b>: ${esc(m)}</li>`).join('')}</ul></details></section>`;
  return h;
}

function falla(f) {
  const l = link(f.fonte, 'Dettagli');
  return `<div class="sc-falla"><div class="nz-meta"><span class="sc-grav sc-g-${esc(f.gravita)}">${esc(GRAVITA[f.gravita] || f.gravita || '')}</span> ${esc(f.parte || '')}</div>
    <p><b>${esc(f.titolo || '')}</b></p>${f.cosa ? `<p>${esc(f.cosa)}</p>` : ''}
    ${(f.rimedio || []).length ? `<ol>${f.rimedio.map(x => `<li>${esc(x)}</li>`).join('')}</ol>` : ''}
    ${f.chi ? `<p class="muted small">Chi lo fa: ${esc(f.chi)}</p>` : ''}${l ? `<p class="small">${l}</p>` : ''}
    ${f.dettaglio ? `<details><summary>Più dettagli</summary><p>${esc(f.dettaglio)}</p></details>` : ''}</div>`;
}

function notizia(n) {
  const t = link(n.link, n.titolo || n.link) || esc(n.titolo || '');
  return `<li>${n.riguarda === 'si' ? '<span class="sc-grav sc-g-alta">Ci riguarda</span> ' : n.riguarda === 'forse' ? '<span class="sc-grav sc-g-media">Forse</span> ' : ''}<b>${t}</b>
    <div class="nz-meta">${esc(n.fonte || '')}${n.data ? ' · ' + esc(fd(String(n.data).slice(0, 10))) : ''}</div>
    ${n.perche ? `<p>${esc(n.perche)}</p>` : ''}${n.cosa_fare ? `<p><b>Cosa fare:</b> ${esc(n.cosa_fare)}</p>` : ''}</li>`;
}

export async function scAct(a, b, d) {
  switch (a) {
    case 'sc-giorno': UI.scGiorno = b.value; return bus.render();
    case 'sc-attiva': await store.put('sicurezza', 'attivo', { attivo: true, da: new Date().toISOString() }); toast('Controllo settimanale attivato'); return bus.render();
    case 'sc-sospendi': return arm(b, 'Tocca ancora per sospendere', async () => { await store.put('sicurezza', 'attivo', { attivo: false, da: new Date().toISOString() }); toast('Controllo sospeso'); bus.render(); });
    case 'sc-ora': {
      if (!sync.farm || !store.cloudReady()) throw new Error('Serve l\'azienda collegata online (La mia azienda → Sincronizzazione).');
      if (!attivo()) await store.put('sicurezza', 'attivo', { attivo: true, da: new Date().toISOString() });
      const c = store.cloudConfig();
      const { data } = await store.cloudClient().auth.getSession(); const tok = data && data.session && data.session.access_token;
      if (!tok) throw new Error('Accedi all\'azienda per avviare il controllo.');
      const r = await fetch(c.url + '/functions/v1/sicurezza', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + tok, apikey: c.key }, body: JSON.stringify({ farm: sync.farm.id }) });
      const j = await r.json().catch(() => ({}));
      if (r.status === 404) return toast('La funzione sicurezza non è ancora pubblicata su Supabase', 'err');
      if (r.status === 202) return toast('Controllo avviato: il resoconto arriva fra un paio di minuti');
      return toast(j.errore || 'La funzione non ha risposto (' + r.status + ')', 'err');
    }
  }
}
