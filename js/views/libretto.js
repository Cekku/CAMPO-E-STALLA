// Libretto del trattore: stato dei pezzi in ore e mesi, interventi con fatture, scadenze, catalogo ricambi, modello 3D esploso
import { S, UI, get, bus } from '../state.js';
import { esc, nf, eur, fd, sum, byDate, byName, yearOf, N, today, okD, lsGet, lsSet, diff, uid } from '../util.js';
import { ic } from '../icons.js';
import { mezzoOre } from '../domain.js';
import * as store from '../store.js';
import { openSheet, closeSheet, toast, chip, exChip, fact, tabs, FORM, setVal } from '../ui.js';
import { CATALOGO, COMP, GRUPPI_COMP, MODELLI, compDi, intervallo, stato, riepilogo, modelloDi, isTrattore, ultimo, trovaMezzo, JD_CATALOGO, AGCO_PARTS, PONTE_FATTURE } from '../trattori.js';
import * as ALL from '../allegati.js';

const oreTxt = h => nf(h, 0) + ' h';
const trattori = () => S.mezzi.filter(isTrattore).sort(byName);

/* ---------- stato di un pezzo in parole ---------- */
function testoStato(s) {
  if (s.lv === 'free') return ['Senza scadenza', ''];
  if (s.lv === 'none') return ['Da registrare', 'info'];
  const p = [];
  if (s.restOre !== null) p.push(s.restOre < 0 ? 'scaduto da ' + oreTxt(-s.restOre) : 'tra ' + oreTxt(s.restOre));
  if (s.restGg !== null) p.push(s.restGg < 0 ? 'scaduto il ' + fd(s.prossData) : 'entro il ' + fd(s.prossData));
  const t = p.join(' · ');
  return [t.charAt(0).toUpperCase() + t.slice(1), s.lv === 'ok' ? 'ok' : s.lv];
}
const ivTxt = iv => [iv.ore ? 'ogni ' + oreTxt(iv.ore) : '', iv.mesi ? (iv.ore ? 'o ' : 'ogni ') + (iv.mesi % 12 === 0 ? (iv.mesi === 12 ? '1 anno' : iv.mesi / 12 + ' anni') : iv.mesi + ' mesi') : ''].filter(Boolean).join(' ');

/* ---------- scheda del trattore ---------- */
export function detail(m) {
  const ore = mezzoOre(m), mod = modelloDi(m), r = riepilogo(m);
  const man = S.manutenzioni.filter(x => x.mezzoId === m.id).sort((a, b) => byDate(b, a) || N(b.ore) - N(a.ore));
  const sub = UI.sub.mezzo || 'libretto', daFare = r.bad.length + r.warn.length;
  const sel = trattori();
  const selettore = sel.length > 1 ? `<nav class="lib-sel" aria-label="Trattori">${sel.map(t => { const q = riepilogo(t); const lv = q.bad.length ? 'bad' : q.warn.length ? 'warn' : q.none.length && !S.manutenzioni.some(x => x.mezzoId === t.id) ? 'none' : ''; return `<button data-act="open" data-type="mezzo" data-id="${t.id}" aria-current="${t.id === m.id}"><i class="dot ${lv}"></i>${esc(t.nome)}</button>`; }).join('')}</nav>` : '';
  const lettura = N(m.oreLettura) && okD(m.oreLetturaData) ? `lettura del ${fd(m.oreLetturaData)}${ore > N(m.oreLettura) ? ' + lavori registrati' : ''}` : 'ore iniziali + lavori registrati';
  const hero = `<section class="card detail-hero lib-hero"><div class="big-icon">${ic('tractor')}</div><div class="dh-body"><span class="eyebrow">${esc(mod ? mod.marca : m.tipo || 'Trattore')}</span><h1>${esc(m.nome)}${exChip(m)}</h1><span class="muted">${esc([m.modello && m.modello !== m.nome ? m.modello : '', m.targa, m.anno, m.serie ? 'n. serie ' + m.serie : ''].filter(Boolean).join(' · '))}</span>
    <div class="big-num">${nf(ore, 0)}<small>ore motore</small></div><span class="muted small">${esc(lettura)}</span>
    <div class="chips">${r.bad.length ? chip(r.bad.length + (r.bad.length === 1 ? ' manutenzione scaduta' : ' manutenzioni scadute'), 'bad') : ''}${r.warn.length ? chip(r.warn.length + ' in scadenza', 'warn') : ''}${!daFare && !r.none.length ? chip('Tutto in regola', 'ok') : ''}${scadChips(m)}</div>
    <div class="btns"><button class="btn primary sm" data-act="lib-new" data-id="${m.id}">${ic('wrench')}Intervento</button><button class="btn sm" data-act="lib-scan" data-id="${m.id}">${ic('sparkles')}Leggi fattura</button><button class="btn sm" data-act="lib-ore" data-id="${m.id}">${ic('gauge')}Aggiorna ore</button><button class="btn sm ghost" data-act="edit" data-form="mezzi" data-id="${m.id}">${ic('pencil')}Modifica</button></div></div></section>`;
  const t = tabs('mezzo', [['libretto', 'Libretto', daFare || undefined], ['interventi', 'Interventi', man.length], ['scadenze', 'Scadenze'], ['ricambi', 'Ricambi'], ['3d', '3D']], sub);
  let body = '';
  if (sub === 'interventi') body = interventi(m, man);
  else if (sub === 'scadenze') body = scadenze(m, ore);
  else if (sub === 'ricambi') body = ricambi(m, man);
  else if (sub === '3d') { body = `<section class="card lib3d-card"><div id="lib3d" class="lib3d"><div class="loading"><span class="spinner"></span>Carico il modello 3D…</div></div></section>`; setTimeout(() => monta3d(m), 0); }
  else body = libretto(m, ore);
  if (sub !== '3d') import('../trattore3d.js').then(x => x.sospendi()).catch(() => { });
  setTimeout(() => { const b = document.querySelector('.lib-sel [aria-current="true"]'); if (b) b.scrollIntoView({ block: 'nearest', inline: 'center' }); }, 0);
  return { title: m.nome, html: selettore + hero + t + `<div class="lib-body">${body}</div>` };
}
function scadChips(m) {
  let s = '';
  [['scadenzaRevisione', 'Revisione', 30], ['scadenzaAssicurazione', 'Assicurazione', 30]].forEach(([k, l, g]) => { if (okD(m[k])) { const d = diff(today(), m[k]); if (d <= g) s += chip(l + ' ' + fd(m[k]), d < 0 ? 'bad' : 'warn'); } });
  (m.scadenze || []).forEach(x => { if (okD(x.data)) { const d = diff(today(), x.data); if (d <= 30) s += chip(x.titolo + ' ' + fd(x.data), d < 0 ? 'bad' : 'warn'); } });
  return s;
}

function libretto(m, ore) {
  const f = UI.f.libF || 'tutti', comps = compDi(m);
  const st = new Map(comps.map(c => [c.id, stato(m, c.id, ore)]));
  const vis = c => f === 'tutti' || ['bad', 'warn', 'none'].includes(st.get(c.id).lv);
  const filtri = `<div class="chipbar lib-filtri">${[['tutti', 'Tutti i pezzi'], ['dafare', 'Da fare e da registrare']].map(([k, l]) => `<button data-act="chip" data-f="libF" data-v="${k}" aria-pressed="${f === k}">${l}</button>`).join('')}</div>`;
  const nessuno = !S.manutenzioni.some(x => x.mezzoId === m.id) ? `<section class="card note lib-avvio">${ic('info')}<div><b>Il libretto parte dagli interventi.</b> Registra l'ultimo tagliando e gli ultimi lavori che ricordi (anche solo con data e ore): da lì l'app calcola le prossime scadenze di ogni pezzo. Con <b>Leggi fattura</b> li compila Claude dalla foto della fattura.</div></section>` : '';
  const gruppi = GRUPPI_COMP.map(([g, l, i]) => {
    const list = comps.filter(c => c.g === g && vis(c)); if (!list.length) return '';
    return `<section class="card"><div class="card-h"><h2>${ic(i)}${esc(l)}</h2></div><div class="list">${list.map(c => { const s = st.get(c.id), [tx, lv] = testoStato(s); return `<button class="row lib-comp" data-act="lib-comp" data-id="${m.id}" data-c="${c.id}"><span class="r-icon st-${s.lv}">${ic(s.lv === 'bad' ? 'triangle-alert' : s.lv === 'warn' ? 'circle-alert' : s.lv === 'ok' ? 'circle-check' : s.lv === 'none' ? 'history' : 'wrench')}</span><span class="r-main"><b>${esc(c.nome)}</b><span>${s.u ? 'Ultimo ' + [s.u.data ? fd(s.u.data) : '', s.u.ore ? oreTxt(s.u.ore) : ''].filter(Boolean).join(' · ') : 'Nessun intervento registrato'}${ivTxt(s.iv) ? ' · ' + ivTxt(s.iv) : ''}</span></span><span class="r-side chips">${tx ? chip(tx, lv) : ''}</span></button>`; }).join('')}</div></section>`;
  }).join('');
  return nessuno + filtri + (gruppi || `<section class="card">${'<div class="empty slim">Niente da fare: tutti i pezzi con una scadenza sono in regola.</div>'}</section>`);
}

function interventi(m, man) {
  if (store.sync.farm && ALL.stato.archivio === null) ALL.prova().then(v => { if (v === false) bus.render(); }).catch(() => { });
  const avviso = store.sync.farm && ALL.stato.archivio === false ? `<section class="card note lib-avvio">${ic('triangle-alert')}<div><b>Archivio online delle fatture da attivare.</b> Le fatture restano su questo dispositivo finché non attivi l'archivio, una volta sola: in Supabase apri <b>SQL Editor → New query</b>, incolla il codice e premi <b>Run</b>.<div class="btns" style="margin-top:8px"><button class="btn sm" data-act="lib-sql">${ic('copy')}Copia il codice</button></div></div></section>` : '';
  const pend = store.sync.farm && ALL.daInviare() ? `<p class="muted small lib-pad">${ALL.daInviare()} file in attesa di essere caricati online.</p>` : '';
  return avviso + interventiLista(m, man, pend);
}
function interventiLista(m, man, pend) {
  const anni = [...new Set(man.map(x => yearOf(x.data)).filter(Boolean))];
  const tot = sum(man.filter(x => yearOf(x.data) === UI.anno), x => x.costo);
  return `<section class="card"><div class="card-h"><h2>Storico interventi</h2><span class="count">${man.length}</span><div class="btns"><button class="btn sm" data-act="lib-scan" data-id="${m.id}">${ic('sparkles')}Leggi fattura</button><button class="btn primary sm" data-act="lib-new" data-id="${m.id}">${ic('plus')}Intervento</button></div></div>
  ${pend}${anni.length ? `<p class="muted small lib-pad">Spesa ${UI.anno}: <b class="num">${eur(tot)}</b> · totale registrato <b class="num">${eur(sum(man, x => x.costo))}</b></p>` : ''}
  <div class="list">${man.length ? man.map(x => { const comp = (x.componenti || []).map(id => (COMP[id] || {}).nome).filter(Boolean); const na = (x.allegati || []).length;
    return `<button class="row" data-act="edit" data-form="manutenzioni" data-id="${x.id}"><span class="r-icon">${ic(na ? 'file-text' : 'wrench')}</span><span class="r-main"><b>${esc(x.tipo || 'Intervento')}${x.descrizione ? ' · ' + esc(x.descrizione) : ''}${exChip(x)}</b><span>${fd(x.data)}${N(x.ore) ? ' · ' + oreTxt(x.ore) : ''}${x.officina ? ' · ' + esc(x.officina) : ''}${na ? ' · ' + na + (na === 1 ? ' allegato' : ' allegati') : ''}</span>${comp.length ? `<span class="lib-pezzi">${esc(comp.join(', '))}</span>` : ''}</span><span class="r-side num">${N(x.costo) ? eur(x.costo) : ''}</span></button>`; }).join('') : '<div class="empty slim">Nessun intervento registrato.</div>'}</div></section>`;
}

function scadenze(m, ore) {
  const comps = compDi(m).map(c => ({ c, s: stato(m, c.id, ore) })).filter(x => ['bad', 'warn', 'ok'].includes(x.s.lv));
  const peso = x => Math.min(x.s.restOre !== null ? x.s.restOre * 5 : 1e9, x.s.restGg !== null ? x.s.restGg * 8 : 1e9); // ~5 ore di lavoro al giorno
  comps.sort((a, b) => peso(a) - peso(b));
  const altre = (m.scadenze || []).slice().sort((a, b) => String(a.data).localeCompare(String(b.data)));
  return `<section class="card"><div class="card-h"><h2>Scadenze del mezzo</h2><button class="btn sm" data-act="lib-scad" data-id="${m.id}">${ic('plus')}Aggiungi</button></div>
  <dl class="facts inner">${fact('Revisione', fd(m.scadenzaRevisione))}${fact('Assicurazione', fd(m.scadenzaAssicurazione))}${altre.map(x => fact(x.titolo, fd(x.data) + (x.mesi ? ` <small>ogni ${x.mesi} mesi</small>` : ''))).join('')}</dl>
  ${altre.length ? `<div class="list">${altre.map((x, i) => `<button class="row" data-act="lib-scad" data-id="${m.id}" data-i="${(m.scadenze || []).indexOf(x)}"><span class="r-icon">${ic('calendar')}</span><span class="r-main"><b>${esc(x.titolo)}</b><span>${fd(x.data)}${x.note ? ' · ' + esc(x.note) : ''}</span></span>${ic('pencil', 'chev')}</button>`).join('')}</div>` : ''}
  <p class="muted small lib-pad">Revisione e assicurazione si cambiano da <b>Modifica</b>. Per la revisione delle macchine agricole controlla con l'officina o la motorizzazione le date in vigore per l'anno di immatricolazione.</p></section>
  <section class="card"><div class="card-h"><h2>Prossime manutenzioni</h2><span class="count">${comps.length}</span></div><div class="list">${comps.length ? comps.slice(0, 12).map(({ c, s }) => { const [tx, lv] = testoStato(s); return `<button class="row" data-act="lib-comp" data-id="${m.id}" data-c="${c.id}"><span class="r-icon st-${s.lv}">${ic('wrench')}</span><span class="r-main"><b>${esc(c.nome)}</b><span>${[s.prossOre !== null ? 'a ' + oreTxt(s.prossOre) : '', s.prossData ? 'entro il ' + fd(s.prossData) : ''].filter(Boolean).join(' o ')}</span></span><span class="r-side chips">${chip(tx, lv)}</span></button>`; }).join('') : '<div class="empty slim">Registra gli interventi per vedere le prossime scadenze.</div>'}</div></section>`;
}

// Catalogo ricambi ufficiale (tavole esplose con i codici) e codici già usati su questo trattore
export function jdCataloghi(m) {
  const mod = modelloDi(m); if (!mod || !mod.jd) return [];
  if (mod.jd.length < 2) return mod.jd.map(x => [...x, true]);
  const n = parseInt(String(m.serie || '').replace(/\D/g, '').slice(-6), 10);   // 7810: il catalogo cambia dal numero di serie 090000
  return mod.jd.map((x, i) => [...x, isFinite(n) ? (i === 0 ? n < 90000 : n >= 90000) : false]);
}
function ricambi(m, man) {
  const mod = modelloDi(m), jd = jdCataloghi(m);
  const codici = new Map();
  Object.entries(m.codici || {}).forEach(([c, cod]) => { if (cod) codici.set(String(cod).toUpperCase(), { cod, desc: (COMP[c] || {}).nome || '', comp: c, data: null }); });
  man.slice().reverse().forEach(x => (x.ricambi || []).forEach(r => { if (!r.codice) return; const k = String(r.codice).toUpperCase(); const o = codici.get(k) || { cod: r.codice, desc: r.descrizione || '' }; o.data = x.data; if (!o.desc) o.desc = r.descrizione || ''; codici.set(k, o); }));
  const cat = mod && mod.jd ? `<p class="lib-pad">Il catalogo ricambi John Deere è gratuito e mostra per ogni gruppo le <b>tavole esplose</b> con i numeri dei pezzi e i codici. Scegli la sezione (motore, organi ausiliari, trasmissione, assali…) e poi la tavola.${m.serie ? '' : ' <b>Inserisci il numero di serie</b> nella scheda del trattore: alcuni codici cambiano da un numero di serie in poi.'}</p>
    <div class="list">${jd.map(([id, l, giusto]) => `<a class="row" href="${JD_CATALOGO(id)}" target="_blank" rel="noopener"><span class="r-icon">${ic('book-open')}</span><span class="r-main"><b>${esc(l)}</b><span>partscatalog.deere.com${giusto && jd.length > 1 ? ' · quello del tuo numero di serie' : ''}</span></span>${ic('external-link', 'chev')}</a>`).join('')}</div>`
    : mod && mod.agco ? `<p class="lib-pad">I ricambi Fendt con le tavole esplose sono nel catalogo <b>AGCO Parts Books</b> (sul computer o nell'app "Books To Go"). Le credenziali le dà il concessionario Fendt: chiedile alla prossima visita.</p><div class="list"><a class="row" href="${AGCO_PARTS}" target="_blank" rel="noopener"><span class="r-icon">${ic('book-open')}</span><span class="r-main"><b>AGCO Parts Books · Fendt</b><span>agcopartsandservice.com</span></span>${ic('external-link', 'chev')}</a></div>`
    : `<p class="lib-pad muted">Scegli il modello in <b>Modifica → Modello per il libretto</b> per collegare il catalogo ricambi.</p>`;
  return `<section class="card"><div class="card-h"><h2>${ic('book-open')}Catalogo ricambi ed esplosi</h2></div>${cat}</section>
  <section class="card"><div class="card-h"><h2>Codici usati su questo trattore</h2><span class="count">${codici.size}</span></div>
  <div class="list">${codici.size ? [...codici.values()].map(o => `<div class="row"><span class="r-icon">${ic('tags')}</span><span class="r-main"><b class="mono">${esc(o.cod)}</b><span>${esc(o.desc || '—')}${o.data ? ' · ' + fd(o.data) : ''}</span></span><button class="btn sm ghost" data-act="copy" data-txt="${esc(o.cod)}">${ic('copy')}Copia</button></div>`).join('') : '<div class="empty slim">I codici arrivano dalle fatture lette da Claude, dalle voci degli interventi o dalla scheda di ogni pezzo.</div>'}</div>
  ${codici.size && mod && mod.jd ? `<p class="muted small lib-pad">Per vedere un pezzo nel catalogo: copia il codice, apri il catalogo e incollalo nella ricerca in alto.</p>` : ''}</section>${pezziTolti(m)}`;
}

/* ---------- 3D ---------- */
async function monta3d(m) {
  const el = document.getElementById('lib3d'); if (!el) return;
  try { const x = await import('../trattore3d.js'); if (el.isConnected) await x.monta(el, m, stati3d(m)); }
  catch (e) { console.warn(e); el.innerHTML = `<div class="empty slim">${esc(e.message || 'Il modello 3D non si è caricato.')}</div>`; }
}
export function stati3d(m) { const ore = mezzoOre(m), o = {}; compDi(m).forEach(c => { o[c.id] = stato(m, c.id, ore).lv; }); return o; }

/* ---------- foglio di un pezzo ---------- */
function compSheet(m, cid) {
  const c = COMP[cid]; if (!c) return;
  const s = stato(m, cid), [tx, lv] = testoStato(s), own = (m.intervalli || {})[cid] || {};
  const storia = S.manutenzioni.filter(x => x.mezzoId === m.id && ((x.componenti || []).includes(cid) || (cid === 'olio_motore' && x.tipo === 'Tagliando' && !(x.componenti || []).length))).sort((a, b) => byDate(b, a));
  const mod = modelloDi(m), jd = jdCataloghi(m).find(x => x[2]) || jdCataloghi(m)[0];
  const body = openSheet(c.nome, `<div class="lib-cs">
    <div class="chips">${tx ? chip(tx, lv) : ''}${ivTxt(s.iv) ? chip(ivTxt(s.iv)) : ''}</div>
    <p>${esc(c.d)}</p>
    <form id="cfrm" class="fgrid" novalidate>
      <div class="fsec">Intervallo per questo trattore</div>
      <label class="fld half"><span class="flabel">Ogni</span><div class="inwrap"><input id="c_ore" inputmode="decimal" value="${s.iv.ore || ''}" placeholder="—"><span class="unit">ore</span></div></label>
      <label class="fld half"><span class="flabel">Oppure ogni</span><div class="inwrap"><input id="c_mesi" inputmode="decimal" value="${s.iv.mesi || ''}" placeholder="—"><span class="unit">mesi</span></div></label>
      <label class="fld"><span class="flabel">Codice ricambio</span><div class="inwrap"><input id="c_cod" value="${esc((m.codici || {})[cid] || '')}" placeholder="Es. il codice del filtro" autocomplete="off"></div><small>Valori indicativi: ${own.ore !== undefined || own.mesi !== undefined ? 'li hai cambiati tu' : 'controlla il manuale d\'uso del trattore'}. Vale quello che arriva prima.</small></label>
      <div class="btns lib-cs-act"><button type="submit" class="btn primary sm">Salva</button><span class="sp"></span><button type="button" class="btn ghost danger sm" data-act="lib-togli" data-id="${m.id}" data-c="${cid}">${c.opz ? 'Non c\'è su questo trattore' : 'Togli dal libretto'}</button></div>
    </form>
    <div class="btns"><button class="btn sm" data-act="lib-new" data-id="${m.id}" data-c="${cid}">${ic('wrench')}Registra intervento</button>${UI.sub.mezzo === '3d' ? '' : `<button class="btn sm ghost" data-act="lib-vedi3d" data-id="${m.id}" data-c="${cid}">${ic('box')}Vedi nel 3D</button>`}${jd ? `<a class="btn sm ghost" href="${JD_CATALOGO(jd[0])}" target="_blank" rel="noopener">${ic('book-open')}Esploso: ${esc(c.sez)}</a>` : mod && mod.agco ? `<a class="btn sm ghost" href="${AGCO_PARTS}" target="_blank" rel="noopener">${ic('book-open')}Ricambi Fendt</a>` : ''}</div>
    <div class="fsec">Storico</div>
    <div class="list">${storia.length ? storia.map(x => `<button class="row" data-act="edit" data-form="manutenzioni" data-id="${x.id}"><span class="r-icon">${ic('wrench')}</span><span class="r-main"><b>${esc(x.tipo || 'Intervento')}${x.descrizione ? ' · ' + esc(x.descrizione) : ''}</b><span>${fd(x.data)}${N(x.ore) ? ' · ' + oreTxt(x.ore) : ''}${x.officina ? ' · ' + esc(x.officina) : ''}</span></span><span class="r-side num">${N(x.costo) ? eur(x.costo) : ''}</span></button>`).join('') : '<div class="empty slim">Nessun intervento registrato su questo pezzo.</div>'}</div></div>`, { sub: m.nome });
  body.querySelector('#cfrm').onsubmit = async e => {
    e.preventDefault();
    const o = v => { const t = v.trim(); return t === '' ? 0 : N(t); };
    const iv = Object.assign({}, m.intervalli || {}); const base = intervallo(Object.assign({}, m, { intervalli: {} }), cid);
    const nOre = o(body.querySelector('#c_ore').value), nMesi = o(body.querySelector('#c_mesi').value);
    if (nOre === (base.ore || 0) && nMesi === (base.mesi || 0)) delete iv[cid]; else iv[cid] = { ore: nOre, mesi: nMesi };
    const codici = Object.assign({}, m.codici || {}); const cod = body.querySelector('#c_cod').value.trim(); if (cod) codici[cid] = cod; else delete codici[cid];
    await store.put('mezzi', m.id, Object.assign({}, m, { intervalli: iv, codici })); closeSheet(); toast('Salvato');
  };
}

/* ---------- ore, scadenze, trattori ---------- */
function oreSheet(m) {
  const body = openSheet('Aggiorna ore', `<form id="ofrm" class="fgrid" novalidate><p class="muted" style="grid-column:1/-1;margin:0">Scrivi le ore che leggi sul contaore. Da qui in avanti si sommano le ore dei lavori registrati in campo.</p>
    <label class="fld half"><span class="flabel">Ore sul contaore</span><div class="inwrap"><input id="o_ore" inputmode="decimal" value="${Math.round(mezzoOre(m))}"><span class="unit">h</span></div></label>
    <label class="fld half"><span class="flabel">Letto il</span><input id="o_data" type="date" value="${today()}"></label>
    <div class="formmsg" id="omsg" hidden></div><div class="factions"><span class="sp"></span><button type="button" class="btn ghost" data-act="close">Annulla</button><button type="submit" class="btn primary">Salva</button></div></form>`, { sub: m.nome });
  const i = body.querySelector('#o_ore'); setTimeout(() => { i.focus(); i.select(); }, 80);
  body.querySelector('#ofrm').onsubmit = async e => {
    e.preventDefault(); const v = N(i.value), d = body.querySelector('#o_data').value;
    if (!(v > 0) || !okD(d)) { const msg = body.querySelector('#omsg'); msg.hidden = false; msg.textContent = 'Scrivi le ore e la data della lettura.'; return; }
    await store.put('mezzi', m.id, Object.assign({}, m, { oreLettura: v, oreLetturaData: d })); closeSheet(); toast('Ore aggiornate');
  };
}
function scadSheet(m, i) {
  const l = (m.scadenze || []).slice(), x = i >= 0 ? l[i] : {};
  const body = openSheet(i >= 0 ? 'Modifica scadenza' : 'Nuova scadenza', `<form id="sfrm" class="fgrid" novalidate>
    <label class="fld"><span class="flabel">Che cosa</span><div class="inwrap"><input id="s_t" value="${esc(x.titolo || '')}" list="dl_scad" placeholder="Es. Collaudo caricatore frontale"></div><datalist id="dl_scad">${['Revisione rimorchio', 'Collaudo caricatore frontale', 'Verifica estintore', 'Controllo funzionale', 'Tassa di proprietà', 'Garanzia'].map(s => `<option value="${s}">`).join('')}</datalist></label>
    <label class="fld half"><span class="flabel">Data</span><input id="s_d" type="date" value="${esc(x.data || '')}"></label>
    <label class="fld half"><span class="flabel">Si ripete ogni</span><div class="inwrap"><input id="s_m" inputmode="decimal" value="${x.mesi || ''}" placeholder="—"><span class="unit">mesi</span></div></label>
    <label class="fld"><span class="flabel">Note</span><div class="inwrap"><input id="s_n" value="${esc(x.note || '')}"></div></label>
    <div class="formmsg" id="smsg" hidden></div>
    <div class="factions">${i >= 0 ? `<button type="button" class="btn ghost danger" id="s_del">${ic('trash-2')}Elimina</button>` : ''}<span class="sp"></span><button type="button" class="btn ghost" data-act="close">Annulla</button><button type="submit" class="btn primary">Salva</button></div></form>`, { sub: m.nome });
  const salva = async lista => { await store.put('mezzi', m.id, Object.assign({}, m, { scadenze: lista })); closeSheet(); toast('Salvato'); };
  body.querySelector('#sfrm').onsubmit = e => {
    e.preventDefault(); const t = body.querySelector('#s_t').value.trim(), d = body.querySelector('#s_d').value;
    if (!t || !okD(d)) { const msg = body.querySelector('#smsg'); msg.hidden = false; msg.textContent = 'Scrivi che cosa scade e la data.'; return; }
    const o = { titolo: t, data: d, mesi: N(body.querySelector('#s_m').value) || null, note: body.querySelector('#s_n').value.trim() };
    if (i >= 0) l[i] = o; else l.push(o); salva(l);
  };
  const del = body.querySelector('#s_del'); if (del) del.onclick = () => { l.splice(i, 1); salva(l); };
}
// Più trattori in una volta, dai modelli dell'azienda: poi si completano anno, ore e numero di serie
export function aggiungiTrattori() {
  const presenti = new Set(S.mezzi.map(x => x.catalogo).filter(Boolean));
  const body = openSheet('Aggiungi trattori', `<form id="tfrm" class="fgrid" novalidate><p class="muted" style="grid-column:1/-1;margin:0">Scegli i modelli: ogni trattore nasce con il suo catalogo ricambi e gli intervalli di manutenzione. Anno, ore e numero di serie li aggiungi poi dalla sua scheda.</p>
    <div class="fld checks"><div class="ck-l">${Object.entries(MODELLI).map(([k, x]) => `<label class="ck"><input type="checkbox" name="mod" value="${k}"${presenti.has(k) ? ' disabled' : ''}><span>${esc(x.marca + ' ' + x.modello)}${presenti.has(k) ? ' · già presente' : ''}</span></label>`).join('')}</div></div>
    <div class="factions"><span class="sp"></span><button type="button" class="btn ghost" data-act="close">Annulla</button><button type="submit" class="btn primary">Aggiungi</button></div></form>`);
  body.querySelector('#tfrm').onsubmit = async e => {
    e.preventDefault(); const sel = [...body.querySelectorAll('input[name=mod]:checked')].map(x => x.value); if (!sel.length) return closeSheet();
    const rows = sel.map(k => { const x = MODELLI[k]; return { col: 'mezzi', id: uid(), data: { nome: x.marca + ' ' + x.modello, tipo: 'Trattore', catalogo: k, modello: x.marca + ' ' + x.modello } }; });
    await store.bulkPut(rows); closeSheet(); toast(rows.length === 1 ? 'Trattore aggiunto' : rows.length + ' trattori aggiunti');
  };
}

/* ---------- allegati nel modulo dell'intervento ---------- */
const kb = n => n >= 1024 ? nf(n / 1024, 1) + ' MB' : n + ' kB';
export function boxAllegati() {
  const box = document.getElementById('box_allegati'); if (!box || !FORM) return;
  if (!FORM.allegati) FORM.allegati = ((FORM.values || {}).allegati || []).slice();
  const draw = () => {
    const att = lsGet('ces.scan', null), attesa = att && Date.now() - att.t < 3 * 3600e3;
    box.innerHTML = `<span class="flabel">Fattura e foto</span>${FORM.allegati.length ? `<div class="all-list">${FORM.allegati.map(a => `<div class="all-it"><button type="button" class="all-open" data-all="apri" data-id="${a.id}">${ic(/pdf/.test(a.tipo) ? 'file-text' : 'camera')}<span><b>${esc(a.nome)}</b><small>${kb(a.kb || 0)}</small></span></button><button type="button" class="iconbtn" data-all="via" data-id="${a.id}" aria-label="Togli ${esc(a.nome)}">${ic('x')}</button></div>`).join('')}</div>` : ''}
    <div class="btns"><label class="btn sm">${ic('camera')}Fotografa<input type="file" accept="image/*" capture="environment" hidden data-all="file"></label><label class="btn sm">${ic('paperclip')}Scegli file<input type="file" accept="image/*,application/pdf,.pdf" multiple hidden data-all="file"></label><button type="button" class="btn sm ghost" data-all="scan">${ic('sparkles')}Leggi con Claude</button>${attesa ? `<button type="button" class="btn sm primary" data-all="incolla">${ic('clipboard-paste')}Incolla i dati letti</button>` : ''}</div><div class="all-view" hidden></div>`;
  };
  draw();
  box.onclick = async e => {
    const b = e.target.closest('[data-all]'); if (!b || b.tagName === 'INPUT') return;
    const k = b.dataset.all;
    if (k === 'via') { FORM.allegati = FORM.allegati.filter(a => a.id !== b.dataset.id); return draw(); }
    if (k === 'apri') { const a = FORM.allegati.find(x => x.id === b.dataset.id), v = box.querySelector('.all-view'); v.hidden = false; v.innerHTML = '<div class="loading"><span class="spinner"></span>Apro il file…</div>'; try { await ALL.mostra(a, v); v.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch (err) { v.innerHTML = `<p class="muted">${esc(err.message)}</p>`; } return; }
    if (k === 'scan') { const v = (await import('../ui.js')).readForm(); return avviaScansione(v.mezzoId || ''); }
    if (k === 'incolla') return incolla(true);
  };
  box.onchange = async e => {
    const t = e.target; if (t.dataset.all !== 'file' || !t.files.length) return;
    const fs = [...t.files]; t.value = '';
    for (const f of fs) { try { FORM.allegati.push(await ALL.aggiungi(f)); } catch (err) { toast(err.message, 'err'); } }
    draw();
  };
  FORM.redrawAllegati = draw;
}
export async function salvaAllegati(id, v) {
  const prima = id ? ((get('manutenzioni', id) || {}).allegati || []) : [];
  const ora = (FORM && FORM.allegati) || prima;
  v.allegati = ora;
  const cod = v._codici; delete v._codici;
  await store.put('manutenzioni', id, v);
  prima.filter(a => !ora.some(b => b.id === a.id)).forEach(a => ALL.elimina(a.id));
  // codici ricambio letti dalla fattura: riempiono la scheda dei pezzi che non ne hanno ancora uno
  const m = get('mezzi', v.mezzoId);
  if (m && cod && Object.keys(cod).length) { const codici = Object.assign({}, cod, m.codici || {}); if (JSON.stringify(codici) !== JSON.stringify(m.codici || {})) await store.put('mezzi', m.id, Object.assign({}, m, { codici })); }
}

/* ---------- lettura delle fatture con Claude (pagina ponte su claude.ai) ---------- */
const PREFIX = 'CAMPOSTALLA-FATTURA:';
export function avviaScansione(mezzoId) {
  lsSet('ces.scan', { mezzoId, t: Date.now() });
  const w = window.open(PONTE_FATTURE, '_blank', 'noopener');
  if (!w) location.href = PONTE_FATTURE;
  if (FORM && FORM.redrawAllegati) FORM.redrawAllegati();
}
// Al ritorno nell'app: prova a leggere gli appunti; se il telefono non lo permette senza un tocco, compare "Incolla i dati letti"
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') setTimeout(() => incolla(false), 350); });
window.addEventListener('focus', () => setTimeout(() => incolla(false), 350));
let leggo = false;
async function incolla(tocco) {
  const att = lsGet('ces.scan', null);
  if (!att || Date.now() - att.t > 3 * 3600e3 || leggo) return;
  leggo = true;
  try {
    let txt = '';
    try { txt = await navigator.clipboard.readText(); } catch (e) { txt = ''; }
    if (txt.startsWith(PREFIX)) return await applica(txt, att.mezzoId);
    if (tocco || !document.getElementById('frm')) incollaSheet(att.mezzoId, !!txt);
  } finally { leggo = false; }
}
function incollaSheet(mezzoId, altro) {
  if (document.getElementById('pfrm')) return;
  if (FORM) { if (FORM.redrawAllegati) FORM.redrawAllegati(); return; }
  const body = openSheet('Dati della fattura', `<form id="pfrm" class="fgrid" novalidate><p style="grid-column:1/-1;margin:0">${altro ? 'Negli appunti c\'è altro: nella pagina di Claude tocca di nuovo <b>Copia e torna all\'app</b>.' : 'Tocca <b>Incolla</b> per portare qui i dati letti da Claude. Se il telefono non lo permette, tieni premuto nel riquadro e scegli Incolla.'}</p>
    <label class="fld"><textarea id="p_txt" rows="3" placeholder="Dati copiati dalla pagina di Claude"></textarea></label>
    <div class="formmsg" id="pmsg" hidden></div><div class="factions"><button type="button" class="btn ghost" id="p_no">Non ho letto nessuna fattura</button><span class="sp"></span><button type="button" class="btn" id="p_inc">${ic('clipboard-paste')}Incolla</button><button type="submit" class="btn primary">Usa questi dati</button></div></form>`);
  const ta = body.querySelector('#p_txt'), msg = body.querySelector('#pmsg');
  body.querySelector('#p_inc').onclick = async () => { try { ta.value = await navigator.clipboard.readText(); if (ta.value.startsWith(PREFIX)) body.querySelector('#pfrm').requestSubmit(); } catch (e) { msg.hidden = false; msg.textContent = 'Il telefono non mi lascia leggere gli appunti: tieni premuto nel riquadro e scegli Incolla.'; } };
  body.querySelector('#p_no').onclick = () => { try { localStorage.removeItem('ces.scan'); } catch (e) { } closeSheet(); };
  body.querySelector('#pfrm').onsubmit = async e => { e.preventDefault(); if (!ta.value.trim().startsWith(PREFIX)) { msg.hidden = false; msg.textContent = 'Questi non sono i dati di una fattura letta da Claude.'; return; } closeSheet(); setTimeout(() => applica(ta.value.trim(), mezzoId), 260); };
}
async function applica(txt, mezzoId) {
  let o; try { o = JSON.parse(txt.slice(PREFIX.length)); } catch (e) { toast('Dati della fattura non leggibili: rifai la copia', 'err'); return; }
  try { localStorage.removeItem('ces.scan'); } catch (e) { }
  try { await navigator.clipboard.writeText(''); } catch (e) { }   // la stessa fattura non si importa due volte
  const d = o.data || {};
  let foto = null; if (o.image && o.image.b64) try { foto = await ALL.aggiungi(ALL.daBase64(o.image.b64, o.image.type, o.image.name)); } catch (e) { console.warn(e); }
  const comps = (Array.isArray(d.components) ? d.components : []).filter(id => COMP[id]);
  const ricambi = (Array.isArray(d.items) ? d.items : []).map(r => ({ codice: r.code || '', descrizione: r.description || '', qta: N(r.qty) || null, importo: typeof r.amount === 'number' ? r.amount : null })).filter(r => r.codice || r.descrizione);
  const codici = {}; (Array.isArray(d.items) ? d.items : []).forEach(r => { if (r.code && COMP[r.component] && !codici[r.component]) codici[r.component] = r.code; });
  const v = { data: okD(d.date) ? d.date : today(), ore: N(d.hours) || null, costo: typeof d.total === 'number' ? d.total : null, officina: d.workshop || '', fattura: d.invoiceNumber || '', descrizione: d.title || '', componenti: comps, ricambi, note: [d.notes, d.confidence === 'bassa' ? 'Lettura incerta: controlla i dati con la fattura.' : ''].filter(Boolean).join('\n'), tipo: comps.includes('olio_motore') ? 'Tagliando' : comps.length ? 'Riparazione' : 'Altro' };
  // modulo dell'intervento già aperto (lettura avviata da lì): si riempiono i campi vuoti
  if (FORM && document.getElementById('frm') && FORM.redrawAllegati) {
    Object.entries(v).forEach(([k, val]) => { if (val === null || val === '' || (Array.isArray(val) && !val.length)) return; if (!FORM.dirty.has(k)) setVal(k, val); });
    if (ricambi.length) { const { addLine } = await import('../ui.js'); document.getElementById('lines_ricambi').innerHTML = ''; ricambi.forEach(() => addLine('ricambi')); [...document.querySelectorAll('#lines_ricambi .line')].forEach((l, i) => Object.entries(ricambi[i]).forEach(([k, val]) => { const el = l.querySelector(`[data-line="${k}"]`); if (el && val !== null) el.value = typeof val === 'number' ? String(val).replace('.', ',') : val; })); }
    if (foto) FORM.allegati.push(foto); FORM.values._codici = codici; FORM.redrawAllegati();
    toast('Dati della fattura inseriti: controlla e salva'); return;
  }
  const mid = trovaMezzo(d, mezzoId);
  const { openEdit } = await import('../forms.js');
  openEdit('manutenzioni', null, Object.assign(v, { mezzoId: mid || '', allegati: foto ? [foto] : [], _codici: codici }));
  toast(mid ? 'Controlla i dati letti e salva' : 'Scegli il trattore, controlla i dati e salva');
}

/* ---------- azioni (data-act="lib-…") ---------- */
export async function libAct(a, b, d) {
  const m = get('mezzi', d.id);
  switch (a) {
    case 'lib-comp': return m && compSheet(m, d.c);
    case 'lib-new': { if (sheetIsOpen()) closeSheet(); const { openEdit } = await import('../forms.js'); return setTimeout(() => openEdit('manutenzioni', null, Object.assign({ mezzoId: d.id }, d.c ? { componenti: [d.c], tipo: d.c === 'olio_motore' ? 'Tagliando' : d.c === 'ingrassaggio' ? 'Ingrassaggio' : 'Riparazione' } : {})), sheetIsOpen() ? 240 : 0); }
    case 'lib-scan': return avviaScansione(d.id || '');
    case 'lib-ore': return m && oreSheet(m);
    case 'lib-scad': return m && scadSheet(m, d.i !== undefined ? +d.i : -1);
    case 'lib-togli': { if (!m) return; const c = COMP[d.c]; const upd = Object.assign({}, m); if (c.opz) upd.presenti = (m.presenti || []).filter(x => x !== d.c); upd.tolti = [...new Set([...(m.tolti || []), d.c])]; await store.put('mezzi', m.id, upd); closeSheet(); return toast(c.nome + ': tolto dal libretto. Lo rimetti da Ricambi → Pezzi tolti.'); }
    case 'lib-rimetti': { if (!m) return; const upd = Object.assign({}, m, { tolti: (m.tolti || []).filter(x => x !== d.c) }); if (COMP[d.c].opz) upd.presenti = [...new Set([...(m.presenti || []), d.c])]; await store.put('mezzi', m.id, upd); return toast('Rimesso nel libretto'); }
    case 'lib-vedi3d': closeSheet(); UI.sub.mezzo = '3d'; UI.f.lib3dComp = d.c; bus.render(); return window.scrollTo(0, 0);
    case 'lib-trattori': return aggiungiTrattori();
    case 'lib-sql': { const t = await (await fetch('./supabase/aggiornamento-allegati.sql', { cache: 'no-cache' })).text(); await navigator.clipboard.writeText(t); ALL.stato.archivio = null; return toast('Codice copiato: incollalo in Supabase → SQL Editor e premi Run'); }
  }
}
const sheetIsOpen = () => !document.getElementById('sheet').hidden;
// pezzi tolti e facoltativi da aggiungere: in fondo alla scheda Ricambi
export function pezziTolti(m) {
  const mod = modelloDi(m) || {}, pres = new Set([...(mod.opz || []), ...(m.presenti || [])]);
  const l = CATALOGO.filter(c => (m.tolti || []).includes(c.id) || (c.opz && !pres.has(c.id)));
  return l.length ? `<section class="card"><div class="card-h"><h2>Pezzi non nel libretto</h2></div><div class="list">${l.map(c => `<button class="row" data-act="lib-rimetti" data-id="${m.id}" data-c="${c.id}"><span class="r-icon">${ic('plus')}</span><span class="r-main"><b>${esc(c.nome)}</b><span>${c.opz && !(m.tolti || []).includes(c.id) ? 'Solo su alcuni trattori: aggiungilo se il tuo ce l\'ha' : 'Tolto a mano'}</span></span></button>`).join('')}</div></section>` : '';
}
