// Impostazioni: azienda, account e sincronizzazione, installazione, dati
import { S, azienda } from '../state.js';
import { esc, fd, nf } from '../util.js';
import { ic } from '../icons.js';
import { sync, cloudConfig } from '../store.js';
import { canInstall, isStandalone } from '../install.js';
import { VERSION } from '../version.js';

export const authUI = { tab: 'login' };

function cloudSection() {
  const cfg = cloudConfig();
  if (!cfg) return `<section class="card set"><div class="set-h">${ic('cloud-off')}<div><h2>Sincronizzazione</h2><p>Ora i dati restano solo su questo dispositivo. Collega un progetto Supabase gratuito per averli su telefono, computer e collaboratori, sempre allineati.</p></div></div>
    <form class="fgrid" data-form-act="cloudCfg"><label class="fld"><span class="flabel">Project URL</span><div class="inwrap"><input id="cfg_url" placeholder="https://xxxx.supabase.co" autocomplete="off" inputmode="url"></div></label><label class="fld"><span class="flabel">Chiave anon public</span><div class="inwrap"><input id="cfg_key" placeholder="eyJhbGciOi…" autocomplete="off"></div><small>Supabase → Project Settings → API. Vedi la guida nel file LEGGIMI.</small></label><div class="fld"><button class="btn primary" type="submit">${ic('cloud')}Collega</button></div></form></section>`;
  if (!window.supabase) return `<section class="card set"><div class="set-h">${ic('wifi-off')}<div><h2>Sincronizzazione</h2><p>Il modulo cloud non è stato caricato. Controlla la connessione e ricarica l'app.</p></div></div></section>`;
  if (!sync.user) {
    const t = authUI.tab;
    return `<section class="card set"><div class="set-h">${ic('user')}<div><h2>Accedi per sincronizzare</h2><p>Un account per ogni persona. Il titolare crea l'azienda, i collaboratori entrano con il codice di invito.</p></div></div>
    <div class="seg wide"><label><input type="radio" name="authTab" value="login" data-act="authTab"${t === 'login' ? ' checked' : ''}><span>Accedi</span></label><label><input type="radio" name="authTab" value="signup" data-act="authTab"${t === 'signup' ? ' checked' : ''}><span>Crea account</span></label></div>
    <form class="fgrid" data-form-act="${t === 'signup' ? 'signup' : 'login'}"><label class="fld"><span class="flabel">Email</span><div class="inwrap"><input id="au_email" type="email" autocomplete="email" required></div></label><label class="fld"><span class="flabel">Password</span><div class="inwrap"><input id="au_pw" type="password" autocomplete="${t === 'signup' ? 'new-password' : 'current-password'}" minlength="6" required></div>${t === 'signup' ? '<small>Almeno 6 caratteri. Riceverai una mail di conferma.</small>' : ''}</label>
    <div class="fld row-btns"><button class="btn primary" type="submit">${t === 'signup' ? 'Crea account' : 'Accedi'}</button>${t === 'login' ? '<button class="btn ghost" type="button" data-act="resetPw">Password dimenticata</button>' : ''}</div></form>
    <p class="muted small">Collegato a ${esc(cfg.url.replace(/^https?:\/\//, ''))}${cfg.fromConfig ? '' : ' · <button class="linkbtn" data-act="cloudForget">cambia</button>'}</p></section>`;
  }
  if (!sync.farm) return `<section class="card set"><div class="set-h">${ic('building-2')}<div><h2>Collega un'azienda</h2><p>Accesso eseguito come <b>${esc(sync.user.email)}</b>.</p></div></div>
    <div class="grid-2 tight"><form class="subcard" data-form-act="createFarm"><b>Crea la tua azienda</b><p class="muted small">I dati già presenti su questo dispositivo verranno caricati online.</p><div class="inwrap"><input id="farm_name" placeholder="Nome dell'azienda" value="${esc(azienda().nome || '')}"></div><button class="btn primary" type="submit">Crea azienda</button></form>
    <form class="subcard" data-form-act="joinFarm"><b>Entra con un codice</b><p class="muted small">Chiedi al titolare il codice di 8 caratteri. I dati di questo dispositivo verranno sostituiti da quelli dell'azienda.</p><div class="inwrap"><input id="farm_code" placeholder="Es. 7F3A9C21" autocapitalize="characters" class="mono"></div><button class="btn" type="submit">Entra</button></form></div>
    <p><button class="linkbtn" data-act="signOut">Esci dall'account</button></p></section>`;
  const me = sync.members.find(m => m.user_id === sync.user.id); const owner = me && me.role === 'titolare';
  const st = { ok: ['circle-check', 'Sincronizzato'], syncing: ['refresh-cw', 'Sincronizzazione…'], offline: ['wifi-off', 'Offline: le modifiche partiranno al ritorno della rete'], error: ['triangle-alert', 'Errore di sincronizzazione'], idle: ['cloud', 'In attesa'] }[sync.status] || ['cloud', ''];
  return `<section class="card set"><div class="set-h">${ic('cloud')}<div><h2>${esc(sync.farm.name)}</h2><p>Dati condivisi in tempo reale. Accesso come <b>${esc(sync.user.email)}</b>${owner ? ' · titolare' : ''}.</p></div></div>
    <div class="syncbox ${sync.status}">${ic(st[0])}<div><b>${st[1]}</b><span>${sync.pending ? sync.pending + ' modifiche da inviare · ' : ''}${sync.lastSync ? 'ultimo aggiornamento ' + new Date(sync.lastSync).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' }) : 'mai sincronizzato'}${sync.error && sync.status === 'error' ? ' · ' + esc(sync.error) : ''}</span></div><button class="btn sm" data-act="syncNow">${ic('refresh-cw')}Ora</button></div>
    <div class="invite"><div><span class="eyebrow">Codice di invito</span><div class="code mono">${esc(sync.farm.join_code)}</div><p class="muted small">Il collaboratore installa l'app, crea il suo account e inserisce questo codice.</p></div><div class="btns"><button class="btn sm" data-act="copy" data-txt="${esc(sync.farm.join_code)}">${ic('copy')}Copia</button>${owner ? `<button class="btn sm ghost" data-act="newCode">${ic('refresh-cw')}Nuovo codice</button>` : ''}</div></div>
    <div class="card-h"><h3>Persone</h3><span class="count">${sync.members.length}</span></div>
    <div class="list">${sync.members.map(m => `<div class="row static"><span class="avatar">${esc((m.email || '?')[0].toUpperCase())}</span><span class="r-main"><b>${esc(m.email || 'utente')}${m.user_id === sync.user.id ? ' <span class="muted">(tu)</span>' : ''}</b><span>${m.role === 'titolare' ? 'Titolare' : 'Collaboratore'} · dal ${fd((m.joined_at || '').slice(0, 10))}</span></span>${owner && m.role !== 'titolare' ? `<button class="btn sm ghost danger" data-act="removeMember" data-id="${m.user_id}">Rimuovi</button>` : ''}</div>`).join('')}</div>
    <div class="btns"><button class="btn sm ghost" data-act="signOut">${ic('log-out')}Esci</button><button class="btn sm ghost danger" data-act="leaveFarm">Scollega dall'azienda</button></div></section>`;
}

export function render() {
  const a = azienda(); const nEx = Object.keys(S).reduce((t, c) => t + S[c].filter(x => x.esempio).length, 0);
  const html = `<header class="pagehead"><h1>Impostazioni</h1></header>
  <section class="card set"><div class="set-h">${ic('house')}<div><h2>La mia azienda</h2><p>Compare nel menu, nella dashboard e nei file esportati. La posizione serve al meteo.</p></div></div>
    <form class="fgrid" data-form-act="azienda"><label class="fld"><span class="flabel">Nome dell'azienda</span><div class="inwrap"><input id="az_nome" value="${esc(a.nome || '')}" placeholder="Azienda agricola…"></div></label>
    <label class="fld half"><span class="flabel">Codice aziendale ASL</span><div class="inwrap"><input id="az_asl" value="${esc(a.asl || '')}" class="mono"></div></label><label class="fld half"><span class="flabel">Partita IVA o CUAA</span><div class="inwrap"><input id="az_iva" value="${esc(a.iva || '')}" class="mono"></div></label>
    <label class="fld"><span class="flabel">Sede aziendale</span><div class="inwrap"><input id="az_ind" value="${esc(a.indirizzo || '')}" placeholder="Via, numero, comune"></div></label>
    <label class="fld half"><span class="flabel">Superficie aziendale totale</span><div class="inwrap"><input id="az_ha" value="${esc(a.ettari ? String(a.ettari).replace('.', ',') : '')}" inputmode="decimal" placeholder="Es. 250"><span class="unit">ha</span></div><small>Serve a mostrare quanti ettari hai già mappato.</small></label><span></span>
    <label class="fld half"><span class="flabel">Latitudine</span><div class="inwrap"><input id="az_lat" value="${esc(a.lat || '')}" inputmode="decimal" placeholder="dai campi"></div></label><label class="fld half"><span class="flabel">Longitudine</span><div class="inwrap"><input id="az_lon" value="${esc(a.lon || '')}" inputmode="decimal" placeholder="dai campi"></div></label>
    <div class="fld row-btns"><button class="btn primary" type="submit">Salva</button><button class="btn ghost" type="button" data-act="gpsAzienda">${ic('locate-fixed')}Usa la mia posizione</button></div></form></section>
  ${cloudSection()}
  <section class="card set"><div class="set-h">${ic('smartphone')}<div><h2>App sul telefono</h2><p>${isStandalone() ? 'Stai usando l\'app installata. Funziona anche senza rete: le modifiche si sincronizzano al ritorno della connessione.' : 'Installala sulla schermata Home: si apre a schermo intero e funziona anche in campagna senza rete.'}</p></div></div>${canInstall() ? `<button class="btn primary" data-act="install">${ic('download')}Installa l'app</button>` : ''}<p class="muted small">Versione ${VERSION}</p></section>
  <section class="card set"><div class="set-h">${ic('history')}<div><h2>Dati</h2><p>Copia di sicurezza completa in un file, da conservare o da caricare su un altro dispositivo.</p></div></div>
    <div class="btns"><button class="btn" data-act="backup">${ic('download')}Scarica copia</button><label class="btn">${ic('file-up')}Carica copia<input type="file" accept=".json,application/json" data-act="restore" hidden></label></div>
    <div class="divider"></div>
    ${nEx ? `<p><b>Dati di esempio</b><br><span class="muted small">${nEx} registrazioni contrassegnate "Esempio".</span></p><button class="btn danger" data-act="delExamples">${ic('trash-2')}Elimina i dati di esempio</button>` : `<p><b>Dati di esempio</b><br><span class="muted small">Carica un'azienda di prova per vedere l'app al lavoro. Si eliminano con un tocco.</span></p><button class="btn" data-act="loadExamples">Carica dati di esempio</button>`}
    <div class="divider"></div><button class="btn ghost danger" data-act="wipe">Cancella tutti i dati da questo dispositivo</button></section>
  <section class="card set credits"><div class="set-h">${ic('info')}<div><h2>Fonti</h2><p>Immagini satellitari Esri World Imagery. Mappa stradale © contributori OpenStreetMap. Rilievo OpenTopoMap. Cartografia catastale © Agenzia delle Entrate, licenza CC BY 4.0. Meteo Open-Meteo.com (CC BY 4.0). Ricerca luoghi Nominatim.</p></div></div></section>`;
  return { title: 'Impostazioni', html };
}

export function renderAltro() {
  const items = [['magazzino', 'package', 'Magazzino', S.prodotti.length + ' prodotti'], ['mezzi', 'tractor', 'Mezzi', S.mezzi.length + ' mezzi e attrezzi'], ['impostazioni', 'settings', 'Impostazioni', sync.farm ? sync.farm.name : 'Azienda, sincronizzazione, dati']];
  return { title: 'Altro', html: `<header class="pagehead"><h1>Altro</h1></header><section class="card"><div class="list">${items.map(([t, i, l, s]) => `<button class="row" data-act="tab" data-tab="${t}"><span class="r-icon">${ic(i)}</span><span class="r-main"><b>${l}</b><span>${esc(s)}</span></span>${ic('chevron-right', 'chev')}</button>`).join('')}</div></section>${canInstall() ? `<section class="card set"><div class="set-h">${ic('smartphone')}<div><h2>Installa l'app</h2><p>Aggiungila alla schermata Home per aprirla a schermo intero, anche senza rete.</p></div></div><button class="btn primary" data-act="install">Installa</button></section>` : ''}` };
}
