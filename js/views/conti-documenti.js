// Conti → Documenti originali: aprire il file da cui viene una fattura, un bilancino, una dichiarazione IVA, un cedolino,
// un pagamento; collegare all'archivio del PC i documenti caricati prima della 1.35.0 (proposte con prima e dopo,
// niente cambia finché il titolare non conferma con due tocchi).
import { S, UI } from '../state.js';
import { esc, nf, fd } from '../util.js';
import { ic } from '../icons.js';
import { sync } from '../store.js';
import { toast, arm, openSheet } from '../ui.js';
import { tabella, bottoniExport } from '../conti/tabelle.js';
import * as OR from '../conti/originali.js';

const DOC = { carico: false, passo: '', err: '', no: new Set(), si: new Set(), letto: false };
// le proposte sicure partono con la spunta, quelle "da controllare" senza
const scelto = p => (p.dubbio ? DOC.si.has(p.key) : !DOC.no.has(p.key));
const kpi = (l, v, s, cls = '') => `<div class="kpi static"><span class="k-l">${esc(l)}</span><span class="k-v sm ${cls}">${v}</span><span class="k-s">${s}</span></div>`;

/** Pulsante "Apri l'originale" accanto al nome di un file (imp = impronta, se c'è). */
export function btnOrig(file, imp, label = 'Apri') {
  if (!file && !imp) return '';
  return `<button class="btn sm ghost orig-btn" data-act="c-orig" data-imp="${esc(imp || '')}" data-file="${esc(file || '')}" title="Apri il documento originale">${ic('file-text')}${esc(label)}</button>`;
}

/* ---------------- vista del documento ---------------- */
const leggibile = s => String(s || '').replace(/(?<!\d)-|-(?!\d)/g, ' ').replace(/_/g, ' · ').replace(/\s+/g, ' ').trim();
export async function apriOriginale(imp, file) {
  const v = OR.originale(imp);
  const nome = (v && v.nome) || file || 'Documento';
  const info = [v && v.kb ? nf(v.kb) + ' kB' : '', v && v.caricato ? 'caricato il ' + fd(v.caricato) : ''].filter(Boolean).join(' · ');
  const nell = v && v.copia ? `<div id="origBox" class="orig-box"><p class="muted small">Apro la copia…</p></div>` : `<div class="note-box">${ic('info')}<span>${imp ? "Nell'app non c'è una copia di questo file (era già sul PC quando l'hai collegato, oppure è stato caricato su un altro dispositivo)." : "Questo documento è stato caricato prima della versione 1.35: l'app ne ha letto i dati ma non ha tenuto il file."} Lo apri dall'archivio del PC qui sotto.</span></div>`;
  openSheet('Documento originale', `<p class="muted small">${esc(nome)}${info ? ' · ' + esc(info) : ''}</p>
    <h3 class="sheet-h">${ic('smartphone')}Copia nell'app</h3>${nell}<div id="origOnline"></div>
    <h3 class="sheet-h">${ic('monitor')}Archivio del PC</h3><div id="origPc" class="orig-pc"><p class="muted small">Chiedo al ponte dell'archivio…</p></div>
    <div class="factions"><span class="sp"></span><button class="btn" data-act="close">Chiudi</button></div>`, { wide: true, sub: file && file !== nome ? file : '' });
  if (v && v.copia) mostraCopia(v).catch(e => { const el = document.getElementById('origBox'); if (el) el.innerHTML = `<div class="note-box warn">${ic('triangle-alert')}<span>${esc(e.message || 'Copia non trovata')}</span></div>`; });
  statoOnline(v);
  archivioPc(imp, file);
}
async function statoOnline(v) {
  const el = document.getElementById('origOnline'); if (!el || !v || !v.copia || !sync.farm) return;
  const ALL = await import('../allegati.js'); const ok = await ALL.provaRiservati();
  if (ok === false) el.innerHTML = `<div class="note-box warn">${ic('shield-alert')}<span><b>La copia è solo su questo dispositivo.</b> Per vederla anche dal telefono, una volta sola: Supabase → SQL Editor → New query, incolla il codice e premi Run. Gli originali dei Conti vanno in una cartella che vede solo il titolare.<span class="btns" style="display:flex;margin-top:6px"><button class="btn sm" data-act="c-origSql">${ic('copy')}Copia il codice</button></span></span></div>`;
}
async function mostraCopia(v) {
  const ALL = await import('../allegati.js');
  const a = { id: OR.idCopia(v.impronta), nome: v.nome, tipo: v.mime };
  const el = document.getElementById('origBox'); if (!el) return;
  const tipo = String(v.mime || '');
  if (/pdf|image/.test(tipo)) return ALL.mostra(a, el);
  const blob = await ALL.apri(a); const url = URL.createObjectURL(blob);
  const scarica = `<a class="btn ghost sm" href="${url}" download="${esc(v.nome)}">Scarica il file</a>`;
  if (/xml|pkcs7/.test(tipo) || /\.(xml|p7m)$/i.test(v.nome)) {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let xml = '';
    try { if (/\.p7m$/i.test(v.nome) || /pkcs7/.test(tipo)) { const { xmlDaP7m } = await import('../conti/fatture-parse.js'); xml = xmlDaP7m(bytes); } else xml = new TextDecoder('utf-8').decode(bytes); } catch (e) { xml = ''; }
    const doc = xml ? new DOMParser().parseFromString(xml, 'text/xml') : null;
    if (!doc || doc.querySelector('parsererror')) { el.innerHTML = `<p class="muted small">Non riesco a mostrarlo: scaricalo e aprilo con il programma delle fatture.</p>${scarica}`; return; }
    // fattura elettronica: voci in chiaro, con l'eventuale PDF allegato dal fornitore
    const righe = []; const pdf = [];
    const giro = (n, liv) => {
      for (const c of n.children) {
        const nomeT = c.localName;
        if (nomeT === 'Attachment') { pdf.push(c.textContent.replace(/\s+/g, '')); continue; }
        if (c.children.length) { righe.push(`<div class="xr h" style="padding-left:${liv * 12}px">${esc(spazi(nomeT))}</div>`); giro(c, liv + 1); }
        else righe.push(`<div class="xr" style="padding-left:${liv * 12}px"><span>${esc(spazi(nomeT))}</span><b>${esc(c.textContent.trim())}</b></div>`);
      }
    };
    giro(doc.documentElement, 0);
    el.innerHTML = `${pdf.length ? `<p><button class="btn sm" data-act="c-origAll">${ic('file-text')}Apri il PDF allegato dal fornitore</button></p><div id="origAllBox"></div>` : ''}<div class="xml-vista">${righe.join('')}</div>${scarica}`;
    PDF_ALL.v = pdf;
    return;
  }
  el.innerHTML = `<p class="muted small">Il file non si mostra dentro l'app: scaricalo e aprilo con il programma adatto.</p>${scarica}`;
}
const PDF_ALL = { v: [] };
const spazi = s => String(s).replace(/([a-z])([A-Z])/g, '$1 $2');
async function disegnaPdf(bytes, box) {
  const { pdfLibrary } = await import('../conti/pdftext.js');
  const lib = await pdfLibrary(), pdf = await lib.getDocument({ data: bytes }).promise;
  const w = Math.min(1600, (box.clientWidth || 360) * Math.min(2, devicePixelRatio || 1)); box.innerHTML = '<div class="all-pdf"></div>'; const b = box.firstChild;
  for (let i = 1; i <= Math.min(pdf.numPages, 12) && b.isConnected; i++) {
    const p = await pdf.getPage(i), vp = p.getViewport({ scale: w / p.getViewport({ scale: 1 }).width });
    const c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height); b.appendChild(c);
    await p.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
  }
}
async function archivioPc(imp, file) {
  const el = () => document.getElementById('origPc');
  const AD = await import('./archivio-dati.js');
  const riga = d => `<div class="row"><span class="r-icon">${ic('file-text')}</span><span class="r-main"><b>${esc(leggibile(d.nome_proposto || d.nome_file))}</b><span>${esc(d.nome_file || '')}${d.cartella ? ' · ' + esc(d.cartella) : ''}</span></span><span class="r-side btns"><button class="btn sm" data-act="c-origPc" data-imp="${esc(d.impronta)}">${ic('external-link')}Apri sul PC</button><button class="btn sm ghost" data-act="c-origCartella" data-imp="${esc(d.impronta)}">${ic('folder-open')}Cartella</button></span></div>`;
  const spento = `<div class="note-box">${ic('wifi-off')}<span>Il ponte dell'archivio non risponde. Dal PC dell'azienda avvia <i>Archivio - ponte.bat</i> e riapri: il documento si apre con il programma di Windows. Dal telefono l'archivio del PC non si raggiunge.</span></div>`;
  try {
    if (imp) {
      try { const d = await AD.aspetta('/documenti/' + imp); if (el()) el().innerHTML = `<div class="list flat">${riga(d)}</div>`; return; }
      catch (e) { if (e.spento) { if (el()) el().innerHTML = spento; return; } if (e.codice !== 404) throw e; }
    }
    // senza impronta, o non nel catalogo: si cerca il nome del file
    const q = String(file || '').replace(/\.[a-z0-9]+$/i, '').replace(/[_\-.]+/g, ' ').trim();
    const r = q ? await AD.aspetta('/documenti' + AD.qs({ q, limite: 6 })) : { documenti: [] };
    const trovati = (r.documenti || []).filter(d => String(d.nome_file || '').toLowerCase() === String(file || '').toLowerCase());
    if (!el()) return;
    el().innerHTML = trovati.length ? `<p class="muted small">${imp ? "Il file con questa impronta non è nel catalogo, ma c'è un file con lo stesso nome:" : 'Nel catalogo c\'è un file con lo stesso nome:'}</p><div class="list flat">${trovati.map(riga).join('')}</div><p class="muted small">Per collegarlo una volta per tutte usa la pagina <button class="linkbtn" data-act="c-go" data-sub="documenti">Documenti originali</button>.</p>`
      : `<div class="note-box">${ic('info')}<span>${imp ? 'Questo file non è nel catalogo dell\'archivio del PC: se l\'hai salvato da poco, la passata di ogni giorno (alle 12:30) lo aggiunge.' : 'Nel catalogo non ho trovato un file con questo nome.'} Cercalo dalla pagina <button class="linkbtn" data-act="c-go" data-sub="documenti">Documenti originali</button>.</span></div>`;
  } catch (e) { if (el()) el().innerHTML = e.spento ? spento : `<p class="muted small">${esc(e.message || 'Errore del ponte')}</p>`; }
}

/* ---------------- pagina Documenti originali ---------------- */
export function vDocumenti() {
  const gruppi = OR.perFile(); const conImp = gruppi.filter(g => g.imp); const senza = gruppi.filter(g => !g.imp);
  const tenuti = OR.originali(); const copie = tenuti.filter(o => o.copia).length;
  const docs = OR.catalogoPronto();
  const P = docs ? OR.proposteArchivio(docs) : null;
  const kp = `<div class="kpis">${kpi('Documenti caricati', nf(gruppi.length), 'file da cui vengono fatture, bilanci, paghe e pagamenti')}${kpi("Con l'originale", nf(conImp.length), copie ? `${nf(copie)} con la copia nell'app` : 'apribili dall\'archivio del PC')}${kpi('Caricati prima della 1.35', nf(senza.length), senza.length ? 'senza originale: da collegare' : 'nessuno', senza.length ? 't-warn' : '')}${kpi("Nell'archivio del PC", docs ? nf(OR.nelCatalogo(docs) + (P ? P.length : 0)) : '—', docs ? `${nf(docs.length)} documenti dei conti nel catalogo` : 'premi "Cerca nell\'archivio del PC"')}</div>`;
  const intro = `<div class="note-box">${ic('info')}<span><b>Da dove si aprono i documenti.</b> Da questa versione ogni file caricato in <button class="linkbtn" data-act="sub" data-tab="conti" data-sec="conti" data-sub="importa">Carica documenti</button> resta nell'app: lo apri con il pulsante <i>Apri</i> accanto al nome del file (scheda della fattura, conti del bilancino, dichiarazione IVA, cedolini, pagamenti, elenco delle fatture). Dal PC si apre anche l'originale nell'archivio documenti, se il ponte è acceso. I documenti caricati prima non hanno il file: qui sotto l'app li cerca nell'archivio del PC per nome del file, numero, ditta, data e importo e ti propone il collegamento.</span></div>`;
  let prop;
  if (DOC.carico) prop = `<div class="pad-x" style="padding-bottom:16px"><p>${ic('search')}Leggo il catalogo dell'archivio… ${esc(DOC.passo)}</p></div>`;
  else if (!docs) prop = `<div class="pad-x" style="padding-bottom:16px">${DOC.err ? `<div class="note-box warn">${ic('wifi-off')}<span>${esc(DOC.err)}</span></div>` : ''}<p>L'app chiede al ponte dell'archivio (sul PC) l'elenco dei documenti di fisco, fatture, banche e personale e li confronta con i ${nf(senza.length)} documenti caricati senza originale. Non cambia niente: prima vedi le proposte.</p><button class="btn primary" data-act="c-docCerca"${senza.length ? '' : ' disabled'}>${ic('search')}Cerca nell'archivio del PC</button></div>`;
  else {
    const scelte = P.filter(scelto).length; const dubbi = P.filter(p => p.dubbio).length;
    const regsN = P.reduce((t, p) => t + p.g.regs.length, 0);
    const rows = P.map(p => { const r0 = p.g.regs[0]; return { p, dubbio: p.dubbio, key: p.key, tipo: p.g.tipo, reg: p.g.regs.length > 1 ? `${r0.titolo} e altre ${p.g.regs.length - 1}` : r0.titolo, sub: r0.sub, file: p.g.file, doc: p.d.nome_proposto || p.d.nome_file, nomeFile: p.d.nome_file, cartella: p.d.cartella, come: p.come, imp: p.d.impronta, n: p.g.regs.length }; });
    const t = rows.length ? tabella('docprop', {
      title: 'Documenti da collegare all\'archivio del PC', sheet: 'Proposte',
      cols: [
        { k: 'sel', h: 'Collega', sort: false, html: r => `<input type="checkbox" data-act="c-docSel" data-k="${esc(r.key)}" data-dubbio="${r.dubbio ? 1 : ''}"${scelto(r.p) ? ' checked' : ''} aria-label="Collega questo">`, x: r => (scelto(r.p) ? 'sì' : 'no') },
        { k: 'tipo', h: 'Tipo' }, { k: 'reg', h: 'Nell\'app', cls: 'w', html: r => `${esc(r.reg)}<span class="sub">${esc(r.sub || '')}</span>` },
        { k: 'file', h: 'File caricato', cls: 'clip' },
        { k: 'doc', h: 'Documento sul PC (dopo)', cls: 'w', html: r => `${esc(leggibile(r.doc))}<span class="sub">${esc(r.nomeFile)}${r.cartella ? ' · ' + esc(r.cartella) : ''}</span>` },
        { k: 'come', h: 'Trovato per', cls: 'clip', html: r => `${esc(r.come)}${r.dubbio ? '<span class="sub t-warn">da controllare: la fattura e il file hanno pochi dati in comune</span>' : ''}`, x: r => r.come + (r.dubbio ? ' (da controllare)' : '') },
        { k: 'apri', h: '', sort: false, html: r => `<button class="btn sm ghost" data-act="c-origPc" data-imp="${esc(r.imp)}" title="Apri sul PC per controllare">${ic('external-link')}Apri</button>`, x: () => '' },
      ], rows,
    }) : `<div class="empty slim">Nel catalogo non ho trovato nessuno dei documenti caricati prima. Puoi collegarli a mano dalla scheda della fattura ("Cerca nell'archivio").</div>`;
    const nonTrovati = senza.length - P.length;
    prop = `${rows.length ? `<p class="muted small pad-x">Prima: la registrazione ha solo il nome del file. Dopo: si apre il documento sul PC (e la fattura compare collegata nell'archivio). ${nf(regsN)} registrazioni in ${nf(rows.length)} documenti. Controlla quelli trovati "per contenuto" aprendoli.${dubbi ? ` ${nf(dubbi)} sono "da controllare" (il nome del file è uguale, ma ditta, numero, data o importo non si ritrovano nel nome del documento): partono senza spunta, aprili e mettila tu se sono giusti.` : ''}</p>` : ''}${t}
      ${nonTrovati > 0 ? `<p class="muted small pad-x">${nf(nonTrovati)} documenti non trovati: di solito sono le fatture scaricate dallo ZIP del cassetto fiscale (sul PC c'è lo ZIP, non il singolo file) o file che non sono nell'archivio.</p>` : ''}
      <div class="factions"><button class="btn sm ghost" data-act="c-docRileggi">${ic('refresh-cw')}Rileggi il catalogo</button><button class="btn sm ghost" data-act="c-docTutte" data-v="${scelte ? 'no' : 'si'}">${ic('square-check')}${scelte ? 'Togli tutte le spunte' : 'Scegli tutti'}</button><span class="sp"></span><button class="btn action" data-act="c-docApplica"${scelte ? '' : ' disabled'}>${ic('link')}Collega ${scelte === 1 ? 'il documento scelto' : `i ${nf(scelte)} documenti scelti`}</button></div>`;
  }
  const ten = tenuti.length ? tabella('docten', {
    title: 'Originali tenuti', sheet: 'Originali',
    cols: [{ k: 'nome', h: 'File', cls: 'w' }, { k: 'caricato', h: 'Caricato', fmt: 'date' }, { k: 'kb', h: 'kB', fmt: 'n' }, { k: 'copiaT', h: "Copia nell'app" }, { k: 'regs', h: 'Registrazioni', fmt: 'n' }, { k: 'apri', h: '', sort: false, html: r => btnOrig(r.nome, r.impronta), x: () => '' }],
    rows: tenuti.map(o => Object.assign({}, o, { copiaT: o.copia ? 'sì' : 'no (sul PC)', regs: (gruppi.find(g => g.imp === o.impronta) || { regs: [] }).regs.length })).sort((a, b) => String(b.caricato).localeCompare(String(a.caricato))),
  }) : `<div class="empty slim">Ancora nessuno: carica un documento e lo ritrovi qui.</div>`;
  return `${intro}${kp}
  <section class="card"><div class="card-h"><h2>${ic('link')}Collega i documenti caricati prima</h2>${docs && P.length ? bottoniExport(['docprop'], 'Documenti da collegare') : ''}</div>${prop}</section>
  <section class="card"><div class="card-h"><h2>${ic('file-text')}Originali tenuti</h2><span class="count">${tenuti.length || ''}</span>${tenuti.length ? bottoniExport(['docten'], 'Originali dei documenti') : ''}</div>${ten}</section>`;
}

async function cercaCatalogo(rerender) {
  DOC.carico = true; DOC.err = ''; DOC.passo = ''; rerender();
  try { await OR.caricaCatalogo((n, t) => { DOC.passo = `${nf(n)} di ${nf(t)}`; rerender(); }); }
  catch (e) { DOC.err = e.spento ? "Il ponte dell'archivio non risponde: dal PC dell'azienda avvia \"Archivio - ponte.bat\" e riprova." : (e.message || 'Errore del ponte'); }
  DOC.carico = false; rerender();
}

export async function documentiAct(a, b, d, rerender) {
  const AD = await import('./archivio-dati.js');
  switch (a) {
    case 'c-orig': return apriOriginale(d.imp || '', d.file || '');
    case 'c-origPc': case 'c-origCartella':
      try { await AD.apri(d.imp, null, a === 'c-origCartella'); toast(a === 'c-origCartella' ? 'Cartella aperta sul PC' : 'Documento aperto sul PC'); }
      catch (e) { toast(e.spento ? "Il ponte dell'archivio non risponde (si apre solo dal PC)" : e.codice === 404 ? "Il documento non è nel catalogo dell'archivio" : e.codice === 410 ? 'Il file non c\'è più sul PC' : (e.message || 'Non riesco ad aprirlo'), 'err'); }
      return;
    case 'c-origAll': { const box = document.getElementById('origAllBox'); if (!box || !PDF_ALL.v.length) return; try { const bin = atob(PDF_ALL.v[0]); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); await disegnaPdf(u8, box); } catch (e) { box.innerHTML = `<p class="muted small">Il PDF allegato non si apre.</p>`; } return; }
    case 'c-origSql': try { const t = await (await fetch('supabase/aggiornamento-documenti-conti.sql', { cache: 'no-store' })).text(); await navigator.clipboard.writeText(t); toast('Codice copiato: incollalo nello SQL Editor di Supabase'); } catch (e) { toast('Non riesco a copiarlo: il file è supabase/aggiornamento-documenti-conti.sql del progetto', 'err'); } return;
    case 'c-docCerca': return cercaCatalogo(rerender);
    case 'c-docRileggi': OR.svuotaCatalogo(); AD.svuota(); return cercaCatalogo(rerender);
    case 'c-docTutte': { const P = OR.proposteArchivio(OR.catalogoPronto() || []); if (d.v === 'no') { P.forEach(p => DOC.no.add(p.key)); DOC.si.clear(); } else { DOC.no.clear(); P.filter(p => p.dubbio).forEach(p => DOC.si.add(p.key)); } return rerender(); }
    case 'c-docApplica': {
      const P = OR.proposteArchivio(OR.catalogoPronto() || []).filter(scelto); if (!P.length) return;
      return arm(b, `Conferma: collega ${P.length === 1 ? '1 documento' : P.length + ' documenti'}`, async () => {
        b.disabled = true;
        try { const n = await OR.applicaArchivio(P); DOC.no.clear(); DOC.si.clear(); toast(`Fatto: ${n === 1 ? '1 registrazione collegata' : n + ' registrazioni collegate'} all'archivio del PC`); rerender(); }
        catch (e) { toast(e.message || 'Non sono riuscito a salvare', 'err'); b.disabled = false; }
      });
    }
  }
}
export function documentiChange(t, rerender) {
  if (t.dataset.act === 'c-docSel') { const k = t.dataset.k; if (t.dataset.dubbio) { if (t.checked) DOC.si.add(k); else DOC.si.delete(k); } else if (t.checked) DOC.no.delete(k); else DOC.no.add(k); return rerender(); }
}
