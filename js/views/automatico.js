// Pagina "Automatico": il Centro automatico (js/automazioni.js). Avvia tutto, per area o una sola automazione;
// stato del ponte del PC e ora dell'ultimo giro; lista "Da controllare" per area; diario dei giri con "annulla".
import { UI, bus } from '../state.js';
import { esc, nf } from '../util.js';
import { ic } from '../icons.js';
import { toast, arm, empty } from '../ui.js';
import * as store from '../store.js';
import * as A from '../automazioni.js';
import { contiVisibili } from './conti.js';

const MOTIVI = { apertura: "all'apertura dell'app", ogni30: 'giro dei 30 minuti', pulsante: 'avviato a mano', cambio: 'dati cambiati', conferma: 'conferma di un dubbio' };
const PER_AREA = 20;

export function ora(iso) {
  if (!iso) return '—';
  const d = new Date(iso); if (isNaN(d)) return '—';
  const oggi = new Date(); const ieri = new Date(Date.now() - 864e5);
  const g = d.toDateString() === oggi.toDateString() ? 'oggi' : d.toDateString() === ieri.toDateString() ? 'ieri' : d.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });
  return g + ' alle ' + d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
}
const dati = n => nf(n, 0) + (n === 1 ? ' dato' : ' dati');
const fraMinuti = t => { if (!t) return ''; const m = Math.round((t - Date.now()) / 60e3); return m <= 1 ? 'fra poco' : 'fra ' + m + ' minuti'; };

function statoGiro() {
  const st = A.STATO;
  if (st.attivo) return `<div class="au-st busy"><span class="spinner"></span><span><b>Sto lavorando${st.corrente ? ': ' + esc(st.corrente) : ''}</b><small>Puoi continuare a usare l'app.</small></span></div>`;
  return `<div class="au-st">${ic('history')}<span><b>Ultimo giro: ${esc(A.STATO.ultimo ? ora(A.STATO.ultimo) : 'non ancora su questo dispositivo')}</b><small>${A.STATO.ultimo ? 'Prossimo giro ' + fraMinuti(A.prossimo()) : 'Parte da solo quando i dati sono pronti'}</small></span></div>`;
}

function ponteRiga() {
  if (!contiVisibili()) return '';
  A.controllaPonte();   // al massimo ogni 30 secondi; ridisegna quando risponde
  const s = A.PONTE.stato;
  const [cls, icn, t, sub] = s === 'acceso' ? ['ok', 'circle-check', 'Ponte del PC acceso', "I documenti nuovi dell'archivio entrano da soli nei Conti."]
    : s === 'prova' ? ['warn', 'triangle-alert', "Archivio con i dati di prova", "Con i dati inventati non si carica niente: in Archivio → Collegamento al PC togli la prova."]
    : s === 'spento' ? ['bad', 'triangle-alert', 'Ponte del PC spento', "I documenti dell'archivio non si leggono. Sul PC dell'ufficio il ponte parte da solo all'accensione di Windows: se è spento, riavvia il PC o apri Archivio → Collegamento al PC. Sul telefono è normale: i documenti li legge il PC."]
    : s === 'telefono' ? ['', 'smartphone', 'Ponte del PC: si usa dal computer', "Sul telefono i documenti dell'archivio non si leggono: li legge il PC dell'ufficio, con il ponte acceso. Qui trovi i dati da controllare."]
    : ['', 'refresh-cw', 'Controllo il ponte del PC…', ''];
  return `<div class="au-st au-ponte ${cls}">${ic(icn)}<span><b>${esc(t)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</span>${s === 'spento' || s === 'telefono' ? `<button class="btn sm ghost" data-act="au-ponte">${ic('refresh-cw')}Riprova</button>` : ''}</div>`;
}

function esitoTxt(e) {
  if (!e || !e.quando) return 'Non ancora partita su questo dispositivo';
  const t = e.errore ? 'Errore: ' + e.errore : e.saltata ? 'Non partita: ' + e.saltata : e.note || (e.salvati ? dati(e.salvati) + ' salvati' : 'niente di nuovo');
  return t + ' · ' + ora(e.quando);
}

function automazioni(lett) {
  const vis = A.visibili(); const dis = lett || A.STATO.attivo ? ' disabled' : '';
  if (!vis.length) return '';
  return `<section class="card"><div class="card-h"><h2>${ic('zap')}Automazioni</h2></div>${A.AREE.filter(([k]) => vis.some(d => d.area === k)).map(([k, l, i]) => `
    <div class="au-area"><div class="au-ah"><h3>${ic(i)}${esc(l)}</h3><button class="btn sm" data-act="au-area" data-area="${k}"${dis}>${ic('refresh-cw')}Avvia ${esc(l)}</button></div>
    <div class="list flat">${vis.filter(d => d.area === k).map(d => { const e = A.STATO.esiti[d.id]; return `<div class="row au-r"><span class="r-main"><b>${esc(d.nome)}</b><span>${esc(d.descr || '')}</span><small class="${e && e.errore ? 't-bad' : 'muted'}">${esc(esitoTxt(e))}</small></span><span class="au-b">${d.apriPagina ? `<button class="btn sm ghost" data-act="nav" data-tab="${esc(d.apriPagina.tab)}"${d.apriPagina.sub ? ` data-sub="${esc(d.apriPagina.sub)}"` : ''}>Apri</button>` : ''}<button class="btn sm ghost" data-act="au-una" data-id="${esc(d.id)}"${dis}>Avvia</button></span></div>`; }).join('')}</div></div>`).join('')}</section>`;
}

function daControllare(lett) {
  const D = A.dubbi(); const dis = lett || A.STATO.attivo ? ' disabled' : '';
  const testa = `<div class="card-h"><h2>${ic('list-checks')}Da controllare</h2>${D.length ? `<span class="chip warn num">${D.length}</span>` : ''}</div>`;
  if (!D.length) return `<section class="card" id="auDubbi">${testa}${empty('circle-check', 'Niente da controllare', 'Quando un dato non è sicuro non si salva da solo: compare qui con la proposta pronta.')}</section>`;
  const per = A.AREE.map(([k, l, i]) => [k, l, i, D.filter(x => x.area === k)]).filter(x => x[3].length);
  const altre = D.filter(x => !A.AREE.some(a => a[0] === x.area)); if (altre.length) per.push(['altro', 'Altro', 'info', altre]);
  return `<section class="card" id="auDubbi">${testa}${per.map(([k, l, i, L]) => {
    const tutti = UI.f['au_' + k]; const vedi = tutti ? L : L.slice(0, PER_AREA);
    return `<div class="au-area"><div class="au-ah"><h3>${ic(i)}${esc(l)} <span class="muted num">${L.length}</span></h3></div><div class="list flat">${vedi.map(x => `
      <div class="row au-d"><span class="r-main"><b>${esc(x.testo || '')}</b>${x.proposta ? `<span>${esc(x.proposta)}</span>` : ''}${Array.isArray(x.dettagli) && x.dettagli.length ? `<table class="au-det"><tr><th></th><th>Già salvato</th><th>Arrivato adesso</th></tr>${x.dettagli.map(r => `<tr><td>${esc(r[0])}</td><td>${esc(r[1])}</td><td>${esc(r[2])}</td></tr>`).join('')}</table>` : ''}</span>
      <span class="au-b">${typeof x.conferma === 'function' ? `<button class="btn sm primary" data-act="au-ok" data-id="${esc(x.id)}"${dis}>${ic('check')}Conferma</button>` : ''}${(x.alternative || []).map((al, i) => typeof al.conferma === 'function' ? `<button class="btn sm" data-act="au-alt" data-id="${esc(x.id)}" data-i="${i}"${dis}>${esc(al.testo || 'Altra scelta')}</button>` : '').join('')}<button class="btn sm ghost" data-act="au-no" data-id="${esc(x.id)}"${dis}>Scarta</button>${x.apri ? `<button class="btn sm ghost" data-act="au-apri" data-id="${esc(x.id)}">Apri</button>` : ''}</span></div>`).join('')}</div>
      ${L.length > PER_AREA ? `<button class="btn sm ghost au-piu" data-act="au-piu" data-area="${k}">${tutti ? 'Mostra meno' : 'Mostra tutti (' + L.length + ')'}</button>` : ''}</div>`;
  }).join('')}</section>`;
}

function diario(lett) {
  const G = A.diario().slice(0, 25); const dis = lett || A.STATO.attivo ? ' disabled' : '';
  const testa = `<div class="card-h"><h2>${ic('history')}Diario</h2><span class="muted small">ultimi 30 giorni</span></div>`;
  if (!G.length) return `<section class="card">${testa}<div class="empty slim">Ancora nessun giro che abbia salvato qualcosa.</div></section>`;
  return `<section class="card">${testa}${G.map(g => {
    const vive = g.righe.filter(r => !r.annullato && (r.scritti || []).length);
    return `<div class="au-g"><div class="au-gh"><span><b>${esc(ora(g.quando))}</b><small class="muted">${esc(MOTIVI[g.motivo] || '')}</small></span>${vive.length > 1 ? `<button class="btn sm ghost" data-act="au-annGiro" data-g="${esc(g.giro)}"${dis}>${ic('undo-2')}Annulla il giro</button>` : ''}</div>
    <div class="list flat">${g.righe.map(r => { const n = (r.scritti || []).length; return `<div class="row au-r${r.annullato ? ' au-x' : ''}"><span class="r-main"><b>${esc(r.nome || r.aut)}</b><span class="${r.errore ? 't-bad' : ''}">${esc(r.errore ? 'Errore: ' + r.errore : r.note || '')}</span><small class="muted">${r.annullato ? 'annullato ' + esc(ora(r.annullato)) + (r.esito ? ' · ' + dati(r.esito.fatti) + ' tolti' + (r.esito.cambiati ? ', ' + r.esito.cambiati + ' lasciati perché cambiati dopo' : '') : r.quanti ? ' · ' + dati(r.quanti) : '') : n ? dati(n) + (n === 1 ? ' scritto' : ' scritti') + (r.aMano ? ' · ' + dati(r.aMano) + (r.aMano === 1 ? ' scritto' : ' scritti') + ' mentre usavi l\'app: non si annullano' : '') : ''}</small></span>${!r.annullato && n ? `<button class="btn sm ghost" data-act="au-ann" data-id="${esc(r.id)}"${dis}>${ic('undo-2')}Annulla</button>` : ''}</div>`; }).join('')}</div></div>`;
  }).join('')}</section>`;
}

export function render() {
  const lett = store.soloLettura(); const dis = lett || A.STATO.attivo ? ' disabled' : '';
  const html = `<header class="pagehead"><h1>Automatico</h1></header>
  <section class="card au-top">
    ${statoGiro()}${ponteRiga()}
    <button class="btn primary au-tutto" data-act="au-tutto"${dis}>${ic('zap')}Avvia tutto</button>
    <p class="muted small">Le automazioni partono da sole all'apertura dell'app e poi ogni 30 minuti finché resta aperta. Un dato non sicuro non si salva mai da solo: lo trovi in <b>Da controllare</b>, con la proposta pronta.</p>
    ${lett ? `<p class="nl-miss">${ic('info')}Sei in sola lettura: puoi guardare, ma le automazioni non partono da questo account.</p>` : ''}
  </section>
  ${daControllare(lett)}${automazioni(lett)}${diario(lett)}`;
  return { title: 'Automatico', html };
}

/** Riquadro piccolo per la dashboard. */
export function autoCard() {
  const n = A.numeroDubbi(); const st = A.STATO;
  if (!A.visibili().length) return '';
  return `<section class="card au-card"><div class="card-h"><h2>${ic('zap')}Automatico</h2><button class="btn sm ghost" data-act="nav" data-tab="automatico">Apri</button></div>
  <div class="au-st${st.attivo ? ' busy' : ''}">${st.attivo ? '<span class="spinner"></span>' : ic(n ? 'list-checks' : 'circle-check')}<span><b>${st.attivo ? 'Sto lavorando' + (st.corrente ? ': ' + esc(st.corrente) : '') : n ? n + (n === 1 ? ' dato da controllare' : ' dati da controllare') : 'Niente da controllare'}</b><small>Ultimo giro: ${esc(st.ultimo ? ora(st.ultimo) : 'non ancora')}</small></span>${n && !st.attivo ? `<button class="btn sm" data-act="nav" data-tab="automatico">Controlla</button>` : ''}</div></section>`;
}

function esitoGiro(r) {
  if (!r) return;
  if (r.occupato) return toast("C'è già un giro in corso: aspetta che finisca.", 'err');
  if (r.solaLettura) return toast('Sei in sola lettura: le automazioni non partono.', 'err');
  if (r.esiti && r.esiti.length === 1) { const e = r.esiti[0][1]; return toast(e.errore ? e.errore : e.saltata ? e.saltata : e.note || 'Fatto', e.errore || e.saltata ? 'err' : ''); }
  const n = A.numeroDubbi();
  toast(`Giro finito: ${r.salvati ? dati(r.salvati) + ' salvati' : 'niente di nuovo da salvare'}${n ? ', ' + n + ' da controllare' : ''}${r.errori ? ', ' + r.errori + ' con errori' : ''}`, r.errori ? 'err' : '');
}
const msgAnnulla = t => `Annullato: ${dati(t.fatti)}${t.cambiati ? `, ${t.cambiati} lasciati perché cambiati dopo il giro` : ''}${t.persi ? `, ${t.persi} troppo grandi per il diario: lasciati` : ''}`;

// per le conferme in due tocchi: arm() non aspetta la funzione, gli errori si mostrano qui
const prova = (b, fn) => async () => { b.disabled = true; try { await fn(); } catch (e) { console.warn(e); b.disabled = false; toast(e.message || 'Operazione non riuscita', 'err'); } };
export async function auAct(a, b, d) {
  switch (a) {
    case 'au-tutto': b.disabled = true; return esitoGiro(await A.avviaTutto());
    case 'au-area': b.disabled = true; return esitoGiro(await A.avviaArea(d.area));
    case 'au-una': b.disabled = true; return esitoGiro(await A.avvia(d.id));
    case 'au-ok': b.disabled = true; try { await A.conferma(d.id); toast('Confermato e salvato'); } catch (e) { b.disabled = false; throw e; } return;
    case 'au-alt': b.disabled = true; try { await A.alternativa(d.id, d.i); toast('Scelta salvata'); } catch (e) { b.disabled = false; throw e; } return;
    case 'au-no': return arm(b, 'Sicuro? Scarta', prova(b, async () => { await A.scarta(d.id); toast('Scartato: non tornerà più'); }));
    case 'au-apri': return A.apri(d.id);
    case 'au-ann': return arm(b, 'Conferma: annulla', prova(b, async () => toast(msgAnnulla(await A.annulla([d.id])))));
    case 'au-annGiro': return arm(b, 'Conferma: annulla il giro', prova(b, async () => toast(msgAnnulla(await A.annullaGiro(d.g)))));
    case 'au-ponte': { b.disabled = true; const s = await A.controllaPonte(true); return toast(s === 'acceso' ? 'Il ponte del PC risponde' : 'Il ponte del PC non risponde ancora', s === 'acceso' ? '' : 'err'); }
    case 'au-piu': UI.f['au_' + d.area] = !UI.f['au_' + d.area]; return bus.render();
  }
}
