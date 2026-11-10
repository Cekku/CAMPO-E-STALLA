// Archivio documenti (area riservata al titolare): Scaffale con i raccoglitori e la coda da rivedere, Schedario
// (cartelle, elenco, scheda), Cerca (registro con filtri, esportabile), Da rivedere e Collegamento al PC.
// I dati arrivano dal ponte sul PC (archivio-dati.js); i file restano dove sono e si aprono con il loro programma.
import { UI, bus } from '../state.js';
import { esc, nf, fd, debounce } from '../util.js';
import { ic } from '../icons.js';
import { toast, arm, openSheet, sheetOpen } from '../ui.js';
import { tabella, bottoniExport } from '../conti/tabelle.js';
import * as P from './archivio-dati.js';

export const SUBS = { scaffale: 'Scaffale', raccoglitore: 'Raccoglitore', cerca: 'Cerca nei documenti', rivedere: 'Da rivedere', ponte: 'Collegamento al PC' };
const STATI = { da_rivedere: ['wa', 'Da rivedere'], proposto: ['info', 'Proposta automatica'], confermato: ['ok', 'Confermato'], riservato: ['bad', 'Riservato'] };
const DA = { cartella: 'dalla cartella', regole: 'dalle regole', claude: 'da Claude', llm: 'dal modello sul PC', utente: 'da te' };
const f = UI.f;
const stretto = () => window.matchMedia('(max-width: 1099px)').matches;
const dataDoc = d => (d.data && d.data.length === 10 ? fd(d.data) : d.data && d.data.length === 7 ? d.data.slice(5) + '/' + d.data.slice(0, 4) : d.anno || '—');
const evid = s => esc(s || '').replace(/\[([^[\]]*)\]/g, '<mark>$1</mark>');
const chipStato = st => STATI[st] ? `<span class="chip ${STATI[st][0] === 'wa' ? 'warn' : STATI[st][0]}">${STATI[st][1]}</span>` : '';
const nomeArea = d => [d.area, d.sotto].filter(Boolean).join(' › ') + (d.anno && d.codice && d.codice.includes('.') ? ' › ' + d.anno : '');
const attesa = '<div class="loading"><span class="spinner"></span>Chiedo al PC…</div>';
const isLetto = e => !e.carico && !e.err;

export function render() {
  const sub = SUBS[UI.sub.archivio] ? UI.sub.archivio : 'scaffale';
  const V = { scaffale, raccoglitore, cerca, rivedere, ponte };
  const st = P.leggi('/stato');
  const testa = `<header class="pagehead"><h1>${esc(sub === 'raccoglitore' && f.ar_area ? 'Raccoglitore' : sub === 'scaffale' ? 'Archivio documenti' : SUBS[sub])}</h1><div class="btns">${pillola(st)}</div></header>`;
  const titolo = sub === 'scaffale' ? 'Archivio documenti' : sub === 'raccoglitore' ? nomeRaccoglitore() : SUBS[sub];
  return { title: titolo, html: testa + avviso(sub) + V[sub]() };
}

function nomeRaccoglitore() {
  const ar = P.leggi('/aree'); const c = (f.ar_area || '').slice(0, 2);
  const a = isLetto(ar) && (ar.dati.aree.find(x => x.codice === c) || ar.dati.aree[0]);
  return a ? a.codice + ' ' + a.nome : 'Raccoglitore';
}
function pillola(st) {
  const c = P.conf();
  if (c.prova) return `<button class="chip info ar-pill" data-act="nav" data-tab="archivio" data-sub="ponte">${ic('sparkles')}Dati di prova</button>`;
  if (P.stato.v === 'spento') return `<button class="chip bad ar-pill" data-act="ar-riprova">${ic('wifi-off')}Ponte spento · riprova</button>`;
  if (isLetto(st)) return `<button class="chip ok ar-pill" data-act="nav" data-tab="archivio" data-sub="ponte">${ic('circle-check')}PC collegato</button>`;
  return `<span class="chip ar-pill">${ic('refresh-cw')}Collego…</span>`;
}

function avviso(sub) {
  if (P.conf().prova) return `<div class="note-box">${ic('sparkles')}<span><b>Stai guardando dati di prova inventati.</b> Documenti e ditte non esistono: servono per vedere com'è fatto l'archivio. <button class="linkbtn" data-act="ar-prova" data-v="0">Torna al ponte del PC</button></span></div>`;
  if (P.stato.v !== 'spento' || sub === 'ponte') return '';
  const tel = window.matchMedia('(max-width: 899px)').matches;
  return `<section class="card ar-off">${ic(tel ? 'smartphone' : 'wifi-off', 'big')}<div><h2>${tel ? "L'archivio si apre dal computer" : 'Il ponte dell\'archivio non risponde'}</h2>
  <p class="muted">${tel ? "Il catalogo dei documenti sta sul PC dell'ufficio e i file non escono da lì. Dal telefono, collegato alla stessa Wi-Fi, si potrà aprire più avanti." : 'Sul PC fai doppio clic su <b>«Archivio - ponte.bat»</b> (cartella <span class="mono">strumenti\\archivio</span>) e lascia aperta la finestra nera, poi premi Riprova.'}</p>
  <div class="btns">${tel ? '' : `<button class="btn primary sm" data-act="ar-riprova">${ic('refresh-cw')}Riprova</button>`}<button class="btn sm" data-act="ar-prova" data-v="1">${ic('sparkles')}Guarda con dati di prova</button><button class="btn sm ghost" data-act="nav" data-tab="archivio" data-sub="ponte">Collegamento</button></div>
  <p class="muted small">${esc(P.stato.err)}</p></div></section>`;
}

/* ---------------- Scaffale ---------------- */
function kpi(l, v, s, cls = '') { return `<div class="kpi static"><span class="k-l">${esc(l)}</span><span class="k-v ${cls}">${v}</span><span class="k-s">${s}</span></div>`; }
function scaffale() {
  const st = P.leggi('/stato'), ar = P.leggi('/aree');
  if (P.stato.v === 'spento') return '';
  if (!isLetto(st) || !isLetto(ar)) return errore(st.err || ar.err) || attesa;
  const s = st.dati, ps = s.per_stato || {};
  const ult = s.ultima_scansione ? fd(s.ultima_scansione.slice(0, 10)) : '—';
  const kp = `<div class="kpis">${kpi('Documenti', nf(s.contenuti), nf(s.file_presenti) + ' file sul PC, non spostati')}${kpi('Da rivedere', nf(ps.da_rivedere || 0), 'proposte incerte da controllare', ps.da_rivedere ? 't-warn' : '')}${kpi('Proposte', nf(ps.proposto || 0), 'classificati in automatico')}${kpi('Ultima scansione', ult, s.file_spariti ? nf(s.file_spariti) + ' file non più trovati' : 'nessun file sparito')}</div>`;
  const i = Math.max(0, +f.ar_rvi || 0);
  const rv = P.leggi('/documenti' + P.qs({ stato: 'da_rivedere', limite: 1, inizio: i }));
  let coda = '';
  if (isLetto(rv) && rv.dati.documenti.length) coda = `<section class="card ar-coda"><div class="card-h"><h2>${ic('list-checks')}Da rivedere</h2><span class="mono muted small">${nf(i + 1)} di ${nf(rv.dati.totale)}</span><button class="btn sm ghost" data-act="nav" data-tab="archivio" data-sub="rivedere">Tutta la coda</button></div>${proposta(rv.dati.documenti[0], { salta: true })}</section>`;
  else if (isLetto(rv) && i && !rv.dati.documenti.length) { f.ar_rvi = 0; }
  else if (isLetto(rv)) coda = `<div class="note-box">${ic('circle-check')}<span><b>Niente di incerto da rivedere.</b>${ps.proposto ? ` ${nf(ps.proposto)} documenti sono classificati in automatico (dalla cartella o dalle regole): puoi confermarli a gruppi in <button class="linkbtn" data-act="ar-set" data-f="ar_rs" data-v="proposto" data-sub="rivedere">Proposte automatiche</button>.` : ''}</span></div>`;
  const rac = ar.dati.aree.map(a => `<button class="ar-bind" data-act="ar-area" data-codice="${a.codice}"><span class="ar-spine">${esc(a.codice)}</span><span class="ar-bb"><b>${esc(a.nome)}</b><span class="ar-ss">${esc(a.sotto.slice(0, 4).map(x => x.nome).join(', ') + (a.sotto.length > 4 ? '…' : ''))}</span><span class="ar-bf"><span class="mono">${nf(a.n)}</span>${a.da_rivedere ? `<span class="chip warn">${nf(a.da_rivedere)} da rivedere</span>` : ''}</span></span></button>`).join('');
  return `${kp}${coda}<section class="ar-shelf-w"><div class="card-h flat"><h2>Raccoglitori</h2><span class="muted small">un clic apre il raccoglitore con le sue cartelle e gli anni</span></div><div class="ar-shelf">${rac}</div>${ar.dati.senza_area ? `<p class="muted small">${nf(ar.dati.senza_area)} documenti non hanno ancora un'area.</p>` : ''}</section>`;
}
function errore(e) { return e && !e.spento ? `<div class="note-box bad">${ic('triangle-alert')}<span>${esc(e.message)}</span></div>` : (e ? '' : null); }

/* proposta da confermare: riquadro della coda (Scaffale) o riga della pagina Da rivedere */
function proposta(d, { salta = false } = {}) {
  if (f.ar_edit === String(d.id)) return modulo(d);
  return `<div class="ar-prop" id="arp-${d.id}"><div class="ar-prop-b"><span class="eyebrow">${esc(d.nome_file)}</span>
  <dl class="ar-dl"><div><dt>Area</dt><dd>${esc(nomeArea(d)) || '<i class="muted">nessuna</i>'}</dd></div><div><dt>Tipo e data</dt><dd>${esc(d.tipo || '—')} · ${esc(dataDoc(d))}</dd></div><div><dt>Controparte</dt><dd>${esc(d.controparte || '—')}${d.persona ? ` · <span class="muted">${esc(d.persona)}</span>` : ''}</dd></div><div><dt>Nome nuovo</dt><dd class="mono ar-nome">${esc(d.nome_proposto || '—')}</dd></div></dl></div>
  <div class="btns"><button class="btn sm ar-ok" data-act="ar-ok" data-id="${d.id}">${ic('check')}Giusto</button><button class="btn sm" data-act="ar-edit" data-id="${d.id}">${ic('pencil')}Correggi</button>${salta ? `<button class="btn sm ghost" data-act="ar-salta">Salta</button>` : ''}<span class="sp"></span><button class="btn sm ghost" data-act="ar-doc" data-id="${d.id}">${ic('file-text')}Scheda</button><button class="btn sm ghost" data-act="ar-open" data-id="${d.id}">${ic('external-link')}Apri</button></div></div>`;
}

/* modulo di correzione: area, tipo, data, controparte, persona, descrizione */
function modulo(d) {
  const va = P.leggi('/valori'); const V = isLetto(va) ? va.dati : { codici: [], tipi: [], controparti: [], persone: [] };
  const dl = (id, arr) => `<datalist id="${id}">${(arr || []).slice(0, 300).map(x => `<option value="${esc(x.v)}">`).join('')}</datalist>`;
  const opts = V.codici.map(c => `<option value="${c.codice}"${c.codice === d.codice ? ' selected' : ''}>${esc(c.codice + ' ' + (c.sotto || c.area.slice(3)))}</option>`).join('');
  const k = d.id;
  return `<div class="ar-form" id="arf-${k}">
  <label class="ar-f2"><span>Area</span><select id="arf-a-${k}">${opts || `<option value="${esc(d.codice || '')}">${esc(d.codice || '')}</option>`}</select></label>
  <label><span>Tipo</span><input id="arf-t-${k}" list="ardl-t" value="${esc(d.tipo || '')}"></label>
  <label><span>Data</span><input id="arf-d-${k}" value="${esc(d.data || '')}" placeholder="AAAA-MM-GG" inputmode="numeric"></label>
  <label><span>Controparte</span><input id="arf-c-${k}" list="ardl-c" value="${esc(d.controparte || '')}"></label>
  <label><span>Persona</span><input id="arf-p-${k}" list="ardl-p" value="${esc(d.persona || '')}" placeholder="solo per i documenti del personale"></label>
  <label class="ar-f2"><span>Descrizione</span><input id="arf-x-${k}" value="${esc(d.descrizione || '')}"></label>
  ${dl('ardl-t', V.tipi)}${dl('ardl-c', V.controparti)}${dl('ardl-p', V.persone)}
  <div class="btns ar-f2"><button type="button" class="btn sm primary" data-act="ar-save" data-id="${k}">${ic('check')}Salva la correzione</button><button type="button" class="btn sm ghost" data-act="ar-edit" data-id="">Annulla</button><span class="muted small">Il nome nuovo si ricalcola da solo. Il file non viene rinominato.</span></div></div>`;
}

/* ---------------- Raccoglitore (Schedario) ---------------- */
function raccoglitore() {
  const ar = P.leggi('/aree');
  if (P.stato.v === 'spento') return '';
  if (!isLetto(ar)) return errore(ar.err) || attesa;
  const cod = f.ar_area || ar.dati.aree[0].codice; const radice = cod.slice(0, 2);
  const A = ar.dati.aree.find(a => a.codice === radice) || ar.dati.aree[0];
  const S = A.sotto.find(s => s.codice === cod);
  const va = P.leggi('/valori' + P.qs({ area: cod })); const anni = isLetto(va) ? va.dati.anni : [];
  const anno = f.ar_anno || '';
  // albero
  const albero = ar.dati.aree.map(a => {
    const aperta = a.codice === radice;
    let h = `<button class="ar-tr${aperta && !S ? ' on' : ''}${aperta ? ' open' : ''}" data-act="ar-area" data-codice="${a.codice}">${ic(aperta ? 'chevron-down' : 'chevron-right')}<span class="mono">${a.codice}</span><span class="ar-tn">${esc(a.nome)}</span><span class="n">${nf(a.n)}</span></button>`;
    if (aperta) h += `<div class="ar-sub">${a.sotto.map(s => `<button class="ar-tr${s.codice === cod ? ' on' : ''}" data-act="ar-area" data-codice="${s.codice}"><span class="ar-tn">${esc(s.nome)}</span>${s.da_rivedere ? `<i class="ar-dot" title="${s.da_rivedere} da rivedere"></i>` : ''}<span class="n">${nf(s.n)}</span></button>${s.codice === cod && anni.length > 1 ? `<div class="ar-sub ar-anni">${anni.map(y => `<button class="ar-tr${String(y.v) === anno ? ' on' : ''}" data-act="ar-anno" data-v="${String(y.v) === anno ? '' : y.v}">${y.v}<span class="n">${nf(y.n)}</span></button>`).join('')}</div>` : ''}`).join('')}</div>`;
    return h;
  }).join('');
  // elenco
  const lim = +f.ar_lim || 60;
  const q = f.ar_rq || '';
  const el = P.leggi('/documenti' + P.qs({ area: cod, anno, q, limite: lim, ordina: q ? '' : '-data' }));
  const briciole = `${A.codice} ${A.nome}${S ? ' › ' + S.nome : ''}${anno ? ' › ' + anno : ''}`;
  const chipsAnni = anni.length > 1 ? `<div class="chipbar ar-anni-chips"><button data-act="ar-anno" data-v="" aria-pressed="${!anno}">Tutti</button>${anni.map(y => `<button data-act="ar-anno" data-v="${y.v}" aria-pressed="${String(y.v) === anno}">${y.v}<span class="n">${nf(y.n)}</span></button>`).join('')}</div>` : '';
  const chipsSotto = A.sotto.length ? `<div class="chipbar ar-sotto-chips"><button data-act="ar-area" data-codice="${A.codice}" aria-pressed="${!S}">Tutto</button>${A.sotto.filter(s => s.n).map(s => `<button data-act="ar-area" data-codice="${s.codice}" aria-pressed="${s.codice === cod}">${esc(s.nome)}<span class="n">${nf(s.n)}</span></button>`).join('')}</div>` : '';
  let righe = attesa, piede = '';
  if (el.err) righe = errore(el.err) || '';
  else if (!el.carico) {
    const D = el.dati.documenti;
    righe = D.length ? D.map(d => riga(d)).join('') : `<div class="empty slim">${q ? 'Nessun documento con queste parole qui dentro.' : 'Nessun documento in questa cartella.'}</div>`;
    piede = `<div class="ar-foot"><span>${nf(D.length)} di ${nf(el.dati.totale)}${q ? '' : ' · dal più recente'}</span><span class="sp"></span>${el.dati.totale > D.length ? `<button class="btn sm ghost" data-act="ar-altri">Mostra altri</button>` : ''}<button class="btn sm ghost" data-act="ar-tabella">${ic('table-2')}Tabella ed esportazione</button></div>`;
  }
  const elenco = `<section class="card ar-list"><div class="ar-lh"><button class="linkbtn ar-back" data-act="nav" data-tab="archivio" data-sub="scaffale">${ic('chevron-left')}Scaffale</button><span class="eyebrow">${esc(briciole)}</span>
  <label class="ar-search">${ic('search')}<input id="ar_rq" data-act="ar-q" data-f="ar_rq" value="${esc(q)}" placeholder="Cerca nel testo di questi documenti…" autocomplete="off"></label>${chipsSotto}${chipsAnni}</div><div class="ar-rows">${righe}</div>${piede}</section>`;
  const scheda = !stretto() && f.ar_doc ? schedaCol(f.ar_doc) : `<section class="card ar-scheda ar-vuota">${ic('file-text', 'big')}<p class="muted">Scegli un documento dall'elenco: qui vedi nome, area, copie e testo, e lo apri sul PC.</p></section>`;
  return `<div class="ar-sched"><aside class="card ar-tree"><div class="card-h flat"><h2>Cartelle</h2></div>${albero}</aside>${elenco}${scheda}</div>`;
}
function riga(d) {
  return `<button class="ar-row${String(d.id) === String(f.ar_doc) ? ' on' : ''}" data-act="ar-doc" data-id="${d.id}"><span class="mono ar-dt">${esc(dataDoc(d))}</span><span class="ar-rm"><b>${esc(d.controparte || d.persona || d.nome_file)}</b><span>${esc(d.descrizione || d.nome_file)} · ${esc((d.estensione || '').slice(1).toUpperCase())}</span>${d.estratto ? `<span class="ar-estr">${evid(d.estratto)}</span>` : ''}</span><span class="ar-rs">${d.copie > 1 ? `<span class="chip info">${d.copie} copie</span>` : ''}${d.stato === 'da_rivedere' ? '<span class="chip warn">da rivedere</span>' : d.stato === 'riservato' ? '<span class="chip bad">riservato</span>' : ''}${d.tipo ? `<span class="chip">${esc(d.tipo)}</span>` : ''}</span></button>`;
}

/* ---------------- scheda del documento ---------------- */
function schedaCol(id) {
  const e = P.leggi('/documenti/' + id);
  if (e.carico) return `<section class="card ar-scheda">${attesa}</section>`;
  if (e.err) return `<section class="card ar-scheda">${errore(e.err) || ''}</section>`;
  return `<section class="card ar-scheda">${schedaHTML(e.dati, true)}</section>`;
}
const PER_CONTI = /fattur|cedolin|busta|bonific|contabil|estratto|f24|bilancin|iva/i;
function schedaHTML(d, chiudi) {
  const ed = f.ar_edit === String(d.id);
  const copie = (d.copie_elenco || []).filter(c => c.presente);
  const t = d.testo || {};
  const testo = t.riservato || t.esito === 'riservato' ? `<p class="muted small">${ic('shield-check')} Documento con password o codici: il testo non si mostra e non si manda a nessun modello.</p>`
    : t.inizio ? `<div class="ar-testo">${esc(t.inizio.slice(0, 1500))}${t.inizio.length > 1500 ? '…' : ''}</div><p class="muted small">${esc([t.metodo === 'ocr' ? 'letto con OCR' : 'testo del file', t.pagine ? nf(t.pagine) + (t.pagine === 1 ? ' pagina' : ' pagine') : '', t.caratteri ? nf(t.caratteri) + ' caratteri' : ''].filter(Boolean).join(' · '))}</p>`
    : `<p class="muted small">Testo non ancora letto${t.esito ? ' (' + esc(t.esito) + ')' : ''}.</p>`;
  const coll = [PER_CONTI.test((d.tipo || '') + ' ' + (d.area || '')) ? 'Manda ai Conti' : '', d.codice && d.codice.startsWith('13') ? 'Al libretto del trattore' : '', d.codice && /^(09|12)/.test(d.codice) ? 'A un campo' : '', 'All\'agenda'].filter(Boolean);
  return `<div class="ar-sh"><div><span class="eyebrow">${esc(d.tipo || 'Documento')} · ${esc(dataDoc(d))}</span><h2>${esc(d.controparte || d.persona || d.nome_file)}</h2>${d.descrizione ? `<p class="ar-desc">${esc(d.descrizione)}</p>` : ''}</div>${chiudi ? `<button class="iconbtn" data-act="ar-doc" data-id="" aria-label="Chiudi la scheda">${ic('x')}</button>` : ''}</div>
  <div class="btns ar-sbtn"><button class="btn primary sm" data-act="ar-open" data-id="${d.id}">${ic('external-link')}Apri il file</button><button class="btn sm" data-act="ar-open" data-id="${d.id}" data-cartella="1">Apri la cartella</button>${d.stato !== 'confermato' && d.stato !== 'riservato' && !ed ? `<button class="btn sm ar-ok" data-act="ar-ok" data-id="${d.id}">${ic('check')}Giusto</button>` : ''}${ed ? '' : `<button class="btn sm ghost" data-act="ar-edit" data-id="${d.id}">${ic('pencil')}Correggi</button>`}</div>
  ${ed ? modulo(d) : `<dl class="ar-dl">
  <div><dt>Nome ora</dt><dd class="mono">${esc(d.nome_file)}</dd></div>
  <div><dt>Nome proposto</dt><dd class="mono ar-nome">${esc(d.nome_proposto || '—')}<button class="iconbtn sm" data-act="copy" data-txt="${esc(d.nome_proposto || '')}" aria-label="Copia il nome proposto">${ic('copy')}</button></dd></div>
  <div><dt>Area</dt><dd>${esc(nomeArea(d)) || '—'}</dd></div>
  <div><dt>Controparte</dt><dd>${esc(d.controparte || '—')}</dd></div>
  ${d.persona ? `<div><dt>Persona</dt><dd>${esc(d.persona)}</dd></div>` : ''}
  <div><dt>Classificato</dt><dd>${chipStato(d.stato)} <span class="muted small">${esc(DA[d.classificato_da] || d.classificato_da || '')}</span></dd></div></dl>`}
  <div class="ar-sec"><span class="eyebrow">${copie.length === 1 ? 'Dove sta' : nf(copie.length) + ' copie uguali'}</span>${copie.map(c => `<div class="ar-copia"><span><b>${esc(c.cartella)}</b>${c.nome !== d.nome_file ? `<small class="mono">${esc(c.nome)}</small>` : ''}</span>${c.in_archivio ? '<span class="chip ok">in AZIENDA</span>' : ''}${copie.length > 1 ? `<button class="btn sm ghost" data-act="ar-open" data-id="${d.id}" data-percorso="${esc(c.percorso)}">Apri</button>` : ''}</div>`).join('') || '<p class="muted small">Nessuna copia trovata: rifai la scansione.</p>'}</div>
  <div class="ar-sec"><span class="eyebrow">Testo</span>${testo}</div>
  <div class="ar-sec"><span class="eyebrow">Collega (in arrivo)</span><div class="btns">${coll.map(c => `<button class="btn sm" disabled title="Arriverà con i collegamenti alle altre sezioni">${esc(c)}</button>`).join('')}</div></div>
  ${(d.registro || []).length ? `<details class="ar-sec"><summary class="eyebrow">Registro (${d.registro.length})</summary>${d.registro.slice(0, 12).map(r => `<div class="ar-reg"><span class="mono">${esc((r.quando || '').slice(0, 16).replace('T', ' '))}</span><span>${esc(r.azione)}${r.chi ? ' · ' + esc(r.chi) : ''}</span></div>`).join('')}</details>` : ''}`;
}

/* ---------------- Cerca (registro con filtri) ---------------- */
function cerca() {
  if (P.stato.v === 'spento') { P.leggi('/stato'); return ''; }
  const va = P.leggi('/valori' + P.qs({ area: f.ar_sa })); const V = isLetto(va) ? va.dati : null;
  const q = f.ar_sq || '';
  const sel = (k, l, arr, fmt = x => x) => `<label class="ar-sel"><span>${l}</span><select data-act="ar-filtro" data-f="${k}"><option value="">Tutti</option>${(arr || []).map(x => `<option value="${esc(x.v)}"${String(x.v) === String(f[k] || '') ? ' selected' : ''}>${esc(fmt(x.v))} (${nf(x.n)})</option>`).join('')}</select></label>`;
  const selArea = `<label class="ar-sel"><span>Area</span><select data-act="ar-filtro" data-f="ar_sa"><option value="">Tutte</option>${V ? V.codici.map(c => `<option value="${c.codice}"${c.codice === f.ar_sa ? ' selected' : ''}>${esc(c.sotto ? '  ' + c.codice + ' ' + c.sotto : c.area)}</option>`).join('') : ''}</select></label>`;
  const filtri = V ? `<div class="ar-filtri">${selArea}${sel('ar_st', 'Tipo', V.tipi)}${sel('ar_sy', 'Anno', V.anni)}${sel('ar_sc', 'Controparte', V.controparti)}${V.persone.length ? sel('ar_sp', 'Persona', V.persone) : ''}${sel('ar_ss', 'Stato', V.stati, v => (STATI[v] || [, v])[1])}${['ar_sa', 'ar_st', 'ar_sy', 'ar_sc', 'ar_sp', 'ar_ss'].some(k => f[k]) ? `<button class="btn sm ghost" data-act="ar-pulisci">${ic('x')}Togli i filtri</button>` : ''}</div>` : '';
  const par = { q, area: f.ar_sa, tipo: f.ar_st, anno: f.ar_sy, controparte: f.ar_sc, persona: f.ar_sp, stato: f.ar_ss, limite: 200 };
  const el = P.leggi('/documenti' + P.qs(par));
  let corpo = attesa, n = '';
  if (el.err) corpo = errore(el.err) || '';
  else if (!el.carico) {
    const D = el.dati; n = `${nf(D.totale)} documenti`;
    const rows = D.documenti.map(d => Object.assign({ _cls: 'click', areaT: d.codice ? d.codice + ' ' + (d.sotto || (d.area || '').slice(3)) : '—', statoT: (STATI[d.stato] || [, d.stato])[1] }, d));
    corpo = tabella('archivio', {
      title: q ? `Archivio: «${q}»` : 'Archivio documenti', sheet: 'Archivio', sub: [q ? 'ricerca: ' + q : '', f.ar_sa, f.ar_st, f.ar_sy, f.ar_sc].filter(Boolean).join(' · '),
      cols: [
        { k: 'data', h: 'Data', fmt: 'date', cls: 'nw' }, { k: 'tipo', h: 'Tipo', cls: 'nw' },
        { k: 'controparte', h: 'Controparte', cls: 'w', html: r => `${esc(r.controparte || r.persona || '—')}${r.persona && r.controparte ? `<span class="sub">${esc(r.persona)}</span>` : ''}` },
        { k: 'descrizione', h: 'Descrizione', cls: 'w', html: r => `${esc(r.descrizione || r.nome_file)}${r.estratto ? `<span class="sub">${evid(r.estratto)}</span>` : `<span class="sub mono">${esc(r.nome_file)}</span>`}` },
        { k: 'areaT', h: 'Area', cls: 'nw' }, { k: 'statoT', h: 'Stato', cls: 'nw', html: r => chipStato(r.stato) }, { k: 'copie', h: 'Copie', fmt: 'int' },
        { k: 'nome_proposto', h: 'Nome proposto', html: r => `<span class="mono small">${esc(r.nome_proposto || '')}</span>`, cls: 'clip' },
      ],
      rows, rowAttr: r => `data-act="ar-doc" data-id="${r.id}"`, freeze: 1,
    });
    if (D.totale > D.documenti.length) corpo += `<p class="muted small pad-x">Sono mostrati i primi ${nf(D.documenti.length)}: restringi con i filtri o con altre parole.</p>`;
  }
  return `<label class="ar-big">${ic('search')}<input id="ar_sq" data-act="ar-q" data-f="ar_sq" value="${esc(q)}" placeholder="Cerca nel testo di tutti i documenti: gasolio, tagliando, numero di fattura…" autocomplete="off" enterkeyhint="search"><span class="mono muted small">${n}</span></label>
  ${filtri}<section class="card"><div class="card-h"><h2>${ic('table-2')}Risultati</h2>${bottoniExport(['archivio'], 'Archivio documenti')}</div>${corpo}</section>`;
}

/* ---------------- Da rivedere ---------------- */
function rivedere() {
  if (P.stato.v === 'spento') { P.leggi('/stato'); return ''; }
  const ar = P.leggi('/aree'); const st = P.leggi('/stato'); const ps = isLetto(st) ? st.dati.per_stato || {} : {};
  // senza scelta: le incerte se ce ne sono, altrimenti le proposte automatiche
  const quale = f.ar_rs === 'proposto' || (f.ar_rs !== 'da_rivedere' && isLetto(st) && !ps.da_rivedere && ps.proposto) ? 'proposto' : 'da_rivedere';
  const area = f.ar_ra || '';
  const el = P.leggi('/documenti' + P.qs({ stato: quale, area, limite: 30, ordina: 'nome' }));
  const tabs = `<div class="mini-tabs" role="group"><button data-act="ar-set" data-f="ar_rs" data-v="da_rivedere" aria-pressed="${quale === 'da_rivedere'}">Da rivedere <span class="mono">${nf(ps.da_rivedere || 0)}</span></button><button data-act="ar-set" data-f="ar_rs" data-v="proposto" aria-pressed="${quale === 'proposto'}">Proposte automatiche <span class="mono">${nf(ps.proposto || 0)}</span></button></div>`;
  const chips = isLetto(ar) ? `<div class="chipbar"><button data-act="ar-set" data-f="ar_ra" data-v="" aria-pressed="${!area}">Tutte le aree</button>${ar.dati.aree.filter(a => quale === 'proposto' ? a.n : a.da_rivedere).map(a => `<button data-act="ar-set" data-f="ar_ra" data-v="${a.codice}" aria-pressed="${a.codice === area}">${esc(a.codice + ' ' + a.nome)}${quale === 'da_rivedere' ? `<span class="n">${nf(a.da_rivedere)}</span>` : ''}</button>`).join('')}</div>` : '';
  let corpo = attesa, tutti = '';
  if (el.err) corpo = errore(el.err) || '';
  else if (!el.carico) {
    const D = el.dati.documenti;
    corpo = D.length ? D.map(d => `<div class="card ar-rv">${proposta(d)}</div>`).join('') : `<section class="card">${'<div class="empty">' + ic('circle-check', 'big') + '<b>Niente da rivedere qui</b><p>Le proposte di questa scelta sono tutte controllate.</p></div>'}</section>`;
    if (D.length > 1) tutti = `<button class="btn sm" data-act="ar-okTutti" data-ids="${D.map(d => d.id).join(',')}">${ic('check')}Conferma tutti i ${nf(D.length)} in vista</button>`;
    if (el.dati.totale > D.length) corpo += `<p class="muted small">Ne vedi ${nf(D.length)} di ${nf(el.dati.totale)}: confermati questi, arrivano i successivi.</p>`;
  }
  return `<div class="toolbar">${tabs}<span class="sp"></span>${tutti}</div>${chips}<p class="muted small">${ic('info')} Premi <b>Giusto</b> se area, tipo, data e controparte vanno bene; <b>Correggi</b> se c'è qualcosa da cambiare. Le tue scelte diventano esempi per classificare da solo i file nuovi.</p><div class="ar-rvs">${corpo}</div>`;
}

/* ---------------- Collegamento al PC ---------------- */
function ponte() {
  const c = P.conf(); const st = P.leggi('/stato');
  const s = isLetto(st) ? st.dati : null;
  const info = s ? `<dl class="ar-dl"><div><dt>Documenti</dt><dd>${nf(s.contenuti)}</dd></div><div><dt>File sul PC</dt><dd>${nf(s.file_presenti)}${s.file_spariti ? ` · ${nf(s.file_spariti)} non più trovati` : ''}</dd></div><div><dt>Ultima scansione</dt><dd>${s.ultima_scansione ? esc(s.ultima_scansione.replace('T', ' ').slice(0, 16)) : '—'}</dd></div><div><dt>Classificati</dt><dd>${Object.entries(s.per_classificato_da || {}).filter(([k]) => k).map(([k, n]) => esc(DA[k] || k) + ' ' + nf(n)).join(' · ')}</dd></div><div><dt>Versione del ponte</dt><dd>${esc(s.versione)}</dd></div></dl>` : '';
  const esito = c.prova ? `<div class="note-box">${ic('sparkles')}<span>Dati di prova attivi.</span></div>` : P.stato.v === 'spento' ? `<div class="note-box bad">${ic('wifi-off')}<span><b>Il ponte non risponde</b> (${esc(P.stato.err)}).</span></div>` : s ? `<div class="note-box">${ic('circle-check')}<span><b>Collegato al PC.</b></span></div>` : attesa;
  return `<div class="grid-2"><section class="card pad"><h2>Ponte dell'archivio</h2>${esito}${info}
  <label class="fld"><span class="flabel">Indirizzo del ponte</span><input id="ar_url" class="ar-in" value="${esc(c.url)}" placeholder="${P.PONTE_PREDEFINITO}" spellcheck="false"></label>
  <div class="btns"><button class="btn primary sm" data-act="ar-ponteSalva">${ic('refresh-cw')}Salva e prova</button>${c.prova ? `<button class="btn sm" data-act="ar-prova" data-v="0">Usa il ponte del PC</button>` : `<button class="btn sm ghost" data-act="ar-prova" data-v="1">${ic('sparkles')}Usa i dati di prova</button>`}</div></section>
  <section class="card pad ar-help"><h2>Come funziona</h2>
  <p>Il catalogo dei documenti sta solo sul PC (cartella <span class="mono">ArchivioAzienda</span>, fuori da OneDrive). Un piccolo programma, il <b>ponte</b>, lo legge e risponde solo a questa app.</p>
  <ol><li>Sul PC fai doppio clic su <b>«Archivio - ponte.bat»</b> nella cartella <span class="mono">strumenti\\archivio</span> e lascia aperta la finestra.</li><li>Apri l'app sullo stesso PC: l'area <b>Archivio</b> si collega da sola.</li><li><b>Apri il file</b> lo apre con il suo programma (PDF, Excel, Word…); niente viene copiato o spostato.</li></ol>
  <p class="muted small">${ic('smartphone')} Dal telefono, sulla stessa Wi-Fi: in arrivo. Servirà un codice di accesso e una connessione protetta, perché il ponte oggi risponde solo al PC su cui è acceso.</p></section></div>`;
}

/* ---------------- azioni ---------------- */
const rerender = () => { if (bus.render) bus.render(); };

async function scheda(id) {
  if (!id) { f.ar_doc = ''; f.ar_edit = ''; return rerender(); }
  if (!stretto()) { f.ar_doc = String(id); f.ar_edit = ''; return rerender(); }
  const body = openSheet('Documento', attesa, { wide: true });
  try { const d = await P.aspetta('/documenti/' + id); f.ar_doc = String(id); if (sheetOpen() && body.isConnected) { body.innerHTML = schedaHTML(d, false); } }
  catch (e) { body.innerHTML = `<div class="note-box bad">${ic('triangle-alert')}<span>${esc(e.message)}</span></div>`; }
}
function ridisegnaFoglio() {
  // sul telefono la scheda è nel foglio: dopo una correzione si rilegge e si ridisegna
  if (!stretto() || !sheetOpen() || !f.ar_doc) return;
  const id = f.ar_doc; P.aspetta('/documenti/' + id).then(d => { const b = document.getElementById('sheetBody'); if (b && sheetOpen()) b.innerHTML = schedaHTML(d, false); }).catch(() => { });
}

export async function arAct(a, b, d) {
  switch (a) {
    case 'ar-riprova': P.svuota(); toast('Riprovo il collegamento…'); return rerender();
    case 'ar-prova': P.salvaConf({ prova: d.v === '1' }); f.ar_doc = ''; toast(d.v === '1' ? 'Dati di prova: documenti inventati' : 'Torno al ponte del PC'); return rerender();
    case 'ar-ponteSalva': { const u = (document.getElementById('ar_url').value || '').trim().replace(/\/+$/, '') || P.PONTE_PREDEFINITO; if (!/^https?:\/\/[^/\s]+$/.test(u)) return toast("L'indirizzo è del tipo http://127.0.0.1:1236", 'err'); P.salvaConf({ url: u, prova: false }); toast('Provo il collegamento…'); return rerender(); }
    case 'ar-area': UI.sub.archivio = 'raccoglitore'; if (f.ar_area !== d.codice) { f.ar_anno = ''; f.ar_lim = ''; f.ar_rq = ''; } f.ar_area = d.codice; if (UI.tab !== 'archivio') UI.tab = 'archivio'; rerender(); return window.scrollTo(0, 0);
    case 'ar-anno': f.ar_anno = d.v || ''; f.ar_lim = ''; return rerender();
    case 'ar-altri': f.ar_lim = String((+f.ar_lim || 60) + 60); return rerender();
    case 'ar-tabella': f.ar_sa = f.ar_area || ''; f.ar_sy = f.ar_anno || ''; f.ar_sq = f.ar_rq || ''; f.ar_st = f.ar_sc = f.ar_sp = f.ar_ss = ''; UI.sub.archivio = 'cerca'; rerender(); return window.scrollTo(0, 0);
    case 'ar-doc': return scheda(d.id);
    case 'ar-set': f[d.f] = d.v || ''; if (d.sub) { UI.sub.archivio = d.sub; window.scrollTo(0, 0); } return rerender();
    case 'ar-pulisci': ['ar_sa', 'ar_st', 'ar_sy', 'ar_sc', 'ar_sp', 'ar_ss'].forEach(k => (f[k] = '')); return rerender();
    case 'ar-salta': f.ar_rvi = String((+f.ar_rvi || 0) + 1); return rerender();
    case 'ar-edit': f.ar_edit = d.id ? String(d.id) : ''; rerender(); return ridisegnaFoglioSubito(d.id);
    case 'ar-open': {
      b.disabled = true;
      try { const r = await P.apri(+d.id, d.percorso, d.cartella === '1'); toast(r.prova ? 'Con i dati di prova non si apre niente: sul PC si aprirebbe il file' : d.cartella === '1' ? 'Cartella aperta sul PC' : 'File aperto sul PC'); }
      catch (e) { toast(e.spento ? 'Il ponte del PC non risponde: il file si apre solo dal PC con il ponte acceso' : e.message, 'err'); }
      finally { if (b.isConnected) b.disabled = false; }
      return;
    }
    case 'ar-ok': return salva({ [d.id]: {} }, b, 'Confermato');
    case 'ar-okTutti': return arm(b, `Conferma: ${d.ids.split(',').length} documenti giusti`, () => salva(Object.fromEntries(d.ids.split(',').map(i => [i, {}])), b, 'Confermati'));
    case 'ar-save': {
      const id = d.id; const v = k => { const el = document.getElementById(`arf-${k}-${id}`); return el ? el.value.trim() : undefined; };
      const doc = trovaDoc(id) || {};
      const c = {}; const metti = (k, nuovo, vecchio) => { if (nuovo !== undefined && nuovo !== (vecchio || '')) c[k] = nuovo; };
      metti('a', v('a'), doc.codice); metti('t', v('t'), doc.tipo); metti('d', v('d'), doc.data); metti('c', v('c'), doc.controparte); metti('p', v('p'), doc.persona); metti('x', v('x'), doc.descrizione);
      if (c.d && !/^\d{4}(-\d{2}(-\d{2})?)?$/.test(c.d)) return toast('La data va scritta AAAA-MM-GG (oppure AAAA-MM o solo l\'anno)', 'err');
      return salva({ [id]: c }, b, Object.keys(c).length ? 'Correzione salvata' : 'Confermato così');
    }
  }
}
function ridisegnaFoglioSubito(id) {
  if (!stretto() || !sheetOpen()) return;
  const doc = trovaDoc(id || f.ar_doc); const bd = document.getElementById('sheetBody');
  if (doc && bd) bd.innerHTML = schedaHTML(doc, false);
}
/* il documento già letto (scheda o elenchi in memoria), per confrontare la correzione con i valori di prima */
function trovaDoc(id) {
  const e = P.leggi('/documenti/' + id); if (isLetto(e)) return e.dati;
  return null;
}
async function salva(corr, b, msg) {
  if (b) b.disabled = true;
  try {
    const r = await P.correggi(corr); const err = Object.entries(r.errori || {});
    if (err.length) toast(err.length === 1 ? err[0][1] : `${err.length} documenti non aggiornati: ${err[0][1]}`, 'err');
    else toast(msg + (r.aggiornati.length > 1 ? ` (${r.aggiornati.length})` : ''));
    f.ar_edit = '';
  } catch (e) { toast(e.spento ? 'Il ponte del PC non risponde: correzione non salvata' : e.message, 'err'); }
  finally { if (b && b.isConnected) b.disabled = false; }
  rerender(); ridisegnaFoglio();
}

const cercaPresto = debounce(() => rerender(), 300);
export function arInput(t) { if (t.dataset.f) { f[t.dataset.f] = t.value; if (t.dataset.f === 'ar_rq') f.ar_lim = ''; cercaPresto(); } }
export function arChange(t) { if (t.dataset.act === 'ar-filtro') { f[t.dataset.f] = t.value; if (t.dataset.f === 'ar_sa') { f.ar_st = f.ar_sc = f.ar_sp = ''; } rerender(); } }
