// Impostazioni: azienda, account e sincronizzazione, installazione, dati
import { sezioneBlocco } from '../lock.js';
import { S, azienda } from '../state.js';
import { esc, fd, nf, okD, today, diff, byName } from '../util.js';
import { fitoMeta } from '../fitodb.js';
import { aiConfig } from '../nlp.js';
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
  ${sezioneBlocco()}
  ${operatoriSection()}
  ${fitoSection()}
  ${aiSection()}
  <section class="card set"><div class="set-h">${ic('map')}<div><h2>Mappe</h2><p>In Friuli Venezia Giulia l'app usa le ortofoto ufficiali della Regione, che sono le più nitide. Facoltativo: con una chiave Google Maps hai anche le immagini satellitari di Google (gratis fino a 100.000 riquadri al mese, poi a pagamento).</p></div></div>
    <form class="fgrid" data-form-act="gkey"><label class="fld"><span class="flabel">Chiave API di Google Maps (Map Tiles API)</span><div class="inwrap"><input id="az_gkey" value="${esc(a.gkey || '')}" placeholder="AIza…" autocomplete="off" class="mono"></div><small>Crea la chiave su console.cloud.google.com, attiva "Map Tiles API" e limitala al dominio cekku.github.io. La guida è nel file LEGGIMI.</small></label><div class="fld row-btns"><button class="btn" type="submit">Salva chiave</button></div></form></section>
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

function operatoriSection() {
  const T = today(); const list = [...S.operatori].sort(byName);
  const st = o => !okD(o.scadenzaPatentino) ? ['warn', o.patentino ? 'scadenza non indicata' : 'patentino da inserire'] : o.scadenzaPatentino < T ? ['bad', 'scaduto il ' + fd(o.scadenzaPatentino)] : diff(T, o.scadenzaPatentino) <= 90 ? ['warn', 'scade il ' + fd(o.scadenzaPatentino)] : ['ok', 'valido fino al ' + fd(o.scadenzaPatentino)];
  return `<section class="card set" id="operatori"><div class="set-h">${ic('id-card')}<div><h2>Operatori</h2><p>Chi lavora in azienda, con il patentino per i prodotti fitosanitari. I trattamenti fatti da chi ha il patentino scaduto vengono segnalati.</p></div></div>
  <div class="list">${list.length ? list.map(o => { const [lv, t] = st(o); return `<button class="row" data-act="edit" data-form="operatori" data-id="${o.id}"><span class="avatar">${esc((o.nome || '?')[0].toUpperCase())}</span><span class="r-main"><b>${esc(o.nome)}</b><span>${esc(o.ruolo || '')}${o.patentino ? ' · ' + esc(o.patentino) : ''}</span></span><span class="chip ${lv}">${esc(t)}</span></button>`; }).join('') : '<div class="empty slim">Nessun operatore: aggiungi te stesso e i collaboratori.</div>'}</div>
  <div class="btns"><button class="btn sm" data-act="new" data-form="operatori">${ic('plus')}Aggiungi operatore</button></div></section>`;
}
function fitoSection() {
  return `<section class="card set" id="fitodb"><div class="set-h">${ic('flask-conical')}<div><h2>Banca dati fitofarmaci</h2><p>Carica il file dei prodotti fitosanitari pubblicato dal Ministero della Salute: le schede prodotto si compilano da sole e l'app avvisa se un prodotto è revocato o non più autorizzato. Il file resta su questo dispositivo.</p></div></div>
  ${fitoMeta.n ? `<div class="syncbox ok">${ic('circle-check')}<div><b>${nf(fitoMeta.n, 0)} ${fitoMeta.n === 1 ? 'prodotto' : 'prodotti'} in banca dati</b><span>caricata il ${fitoMeta.at ? new Date(fitoMeta.at).toLocaleDateString('it-IT') : '—'}</span></div></div>` : ''}
  <ol class="steps small"><li>Apri <a href="https://www.dati.salute.gov.it/it/dataset/fitosanitari/" target="_blank" rel="noopener">dati.salute.gov.it → Fitosanitari</a> e scarica il file CSV dei prodotti.</li><li>Caricalo qui sotto. Ripeti ogni qualche mese per avere le revoche aggiornate.</li></ol>
  <div class="btns"><label class="btn ${fitoMeta.n ? '' : 'primary'}">${ic('file-up')}${fitoMeta.n ? 'Aggiorna banca dati' : 'Carica file CSV'}<input type="file" accept=".csv,.txt,text/csv" data-act="fitoImport" hidden></label>${fitoMeta.n ? `<button class="btn ghost danger" data-act="fitoClear">Rimuovi</button>` : ''}<a class="btn ghost" href="https://www.fitosanitari.salute.gov.it/fitosanitariws_new/FitosanitariServlet" target="_blank" rel="noopener">${ic('search')}Etichette sul sito del Ministero</a></div></section>`;
}

function aiSection() {
  const c = aiConfig() || {};
  return `<section class="card set" id="ai"><div class="set-h">${ic('sparkles')}<div><h2>Registrazione a voce e con testo libero</h2><p>Dal pulsante Registra puoi scrivere o dettare frasi come "ieri diserbo su Pradone 1,5 l/ha". Funziona già senza configurare nulla. Facoltativo: con una chiave API di Anthropic le frasi vengono interpretate da Claude, che capisce anche i modi di dire più liberi (costo di pochi centesimi al mese).</p></div></div>
  <form class="fgrid" data-form-act="aiKey"><label class="fld"><span class="flabel">Chiave API Anthropic</span><div class="inwrap"><input id="ai_key" type="password" value="${esc(c.key || '')}" placeholder="sk-ant-…" autocomplete="off" class="mono"></div><small>Si crea su console.anthropic.com → API keys. Resta solo su questo dispositivo e non viene sincronizzata.</small></label>
  <label class="fld half"><span class="flabel">Modello</span><div class="inwrap"><input id="ai_model" value="${esc(c.model || 'claude-haiku-5-5')}" class="mono" autocomplete="off"></div></label><span></span>
  <div class="fld row-btns"><button class="btn" type="submit">Salva</button>${c.key ? '<button class="btn ghost danger" type="button" data-act="aiForget">Rimuovi chiave</button>' : ''}</div></form></section>`;
}
