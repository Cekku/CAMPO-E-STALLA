// Registro dei trattamenti e quaderno di campagna (QDCA): documento stampabile / PDF, CSV e JSON leggibile dalle macchine
import { S, get, azienda } from './state.js';
import { esc, nf, fd, N, addDays, yearOf, byDate, byName, today, okD } from './util.js';
import { campoHa, cropOf, colturaOf, giac } from './domain.js';
import { isFitoOp, FITO, operatoreDi, impiegoPer } from './checks.js';
import { sync } from './store.js';

const it = (n, d = 2) => n === null || n === undefined || n === '' ? '' : nf(n, d);
const opsAnno = (y, f) => S.operazioni.filter(o => o.stato !== 'Pianificata' && yearOf(o.data) === y && f(o)).sort((a, b) => byDate(a, b) || (a.oraInizio || '').localeCompare(b.oraInizio || ''));
const carenzaOf = (o, p, c) => { const imp = p && c ? impiegoPer(p, cropOf(c, yearOf(o.data))) : null; return N(imp && imp.carenza) || N(p && p.carenza); };

export function righeTrattamenti(y) {
  return opsAnno(y, o => isFitoOp(o.tipo) || (get('prodotti', o.prodottoId) && FITO.includes(get('prodotti', o.prodottoId).categoria))).map(o => {
    const c = get('campi', o.campoId) || {}, p = get('prodotti', o.prodottoId) || {}, m = get('mezzi', o.mezzoId) || {}, op = operatoreDi(o.operatore);
    const col = colturaOf(c, yearOf(o.data)) || {}; const car = carenzaOf(o, p, c);
    return { o, c, p, m, op, coltura: col.coltura || '', varieta: col.varieta || '', ha: campoHa(c), car, raccoltaDal: car ? addDays(o.data, car + 1) : '' };
  });
}

function head(a, y, titolo) {
  return `<header class="doc-h"><div><h1>${esc(titolo)}</h1><p>Annata agraria ${y}</p></div><table class="kv"><tr><th>Azienda</th><td>${esc(a.nome || (sync.farm && sync.farm.name) || '')}</td></tr><tr><th>CUAA / P. IVA</th><td>${esc(a.iva || '')}</td></tr><tr><th>Sede</th><td>${esc(a.indirizzo || '')}</td></tr><tr><th>Superficie</th><td>${nf(S.campi.reduce((t, c) => t + campoHa(c), 0), 4)} ha · ${S.campi.length} appezzamenti</td></tr></table></header>`;
}

export function registroHTML(y) {
  const a = azienda();
  const camp = [...S.campi].sort(byName);
  const tr = righeTrattamenti(y);
  const conc = opsAnno(y, o => o.tipo === 'Concimazione');
  const altre = opsAnno(y, o => !isFitoOp(o.tipo) && o.tipo !== 'Concimazione');
  const fito = [...S.prodotti].filter(p => FITO.includes(p.categoria)).sort(byName);
  const carichi = S.movimenti.filter(m => m.tipo === 'Carico' && yearOf(m.data) === y && fito.some(p => p.id === m.prodottoId)).sort(byDate);
  const operatori = [...S.operatori].sort(byName);
  const irr = S.mezzi.filter(m => m.tipo === 'Irroratrice' || m.controlloFunzionale);
  const css = `@page{size:A4 landscape;margin:12mm}*{box-sizing:border-box}body{font:10.5px/1.35 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1b241e;margin:0;padding:18px}
  h1{font-size:19px;margin:0 0 2px}h2{font-size:13px;margin:22px 0 6px;padding-bottom:4px;border-bottom:2px solid #2f6b45;color:#2f6b45;text-transform:uppercase;letter-spacing:.04em}p{margin:0}
  .doc-h{display:flex;justify-content:space-between;gap:20px;align-items:flex-start;border-bottom:3px solid #2f6b45;padding-bottom:10px}.doc-h p{color:#5b665f;font-size:12px}
  table{border-collapse:collapse;width:100%}th,td{border:1px solid #c9d2cc;padding:3px 5px;text-align:left;vertical-align:top}thead th{background:#eef3ef;font-size:9.5px;text-transform:uppercase;letter-spacing:.02em}
  td.n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}.kv{width:auto;min-width:300px}.kv th{background:#eef3ef;width:120px}tr{page-break-inside:avoid}
  .warn{color:#a3330f;font-weight:600}.muted{color:#5b665f}.empty{color:#5b665f;font-style:italic;padding:6px 0}.sign{display:flex;gap:60px;margin-top:30px}.sign div{flex:1;border-top:1px solid #1b241e;padding-top:4px}
  .bar{position:sticky;top:0;background:#fff;padding:8px 0 12px;display:flex;gap:8px}.bar button{font:inherit;font-size:13px;padding:8px 14px;border-radius:8px;border:1px solid #2f6b45;background:#2f6b45;color:#fff;cursor:pointer}.bar button.g{background:#fff;color:#2f6b45}
  @media print{.bar{display:none}body{padding:0}}`;
  const sec = (t, h, rows, empty) => `<h2>${t}</h2>${rows.length ? `<table><thead><tr>${h.map(x => `<th>${x}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>` : `<p class="empty">${empty}</p>`}`;
  const html = `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Quaderno di campagna ${y}</title><style>${css}</style></head><body>
  <div class="bar"><button onclick="print()">Stampa o salva in PDF</button></div>
  ${head(a, y, 'Quaderno di campagna e registro dei trattamenti')}
  ${sec('1. Appezzamenti e colture', ['Appezzamento', 'Comune', 'Riferimenti catastali', 'Superficie ha', 'Coltura ' + y, 'Varietà', 'Conduzione', 'Irriguo'], camp.map(c => { const k = colturaOf(c, y) || {}; return `<tr><td>${esc(c.nome)}</td><td>${esc(c.comune || '')}</td><td>${esc(c.catasto || '')}</td><td class="n">${nf(campoHa(c), 4)}</td><td>${esc(k.coltura || '')}</td><td>${esc(k.varieta || '')}</td><td>${esc(c.conduzione || '')}</td><td>${esc(c.irriguo || '')}</td></tr>`; }), 'Nessun appezzamento.')}
  ${sec('2. Registro dei trattamenti con prodotti fitosanitari', ['Data e ora', 'Appezzamento', 'Coltura e varietà', 'BBCH / fase', 'Sup. trattata ha', 'Prodotto commerciale', 'N. reg.', 'Sostanze attive', 'Dose /ha', 'Quantità', 'Avversità', 'Raccolta dal', 'Operatore e patentino', 'Irroratrice', 'Note'], tr.map(r => `<tr><td>${fd(r.o.data)}${r.o.oraInizio ? ' ' + esc(r.o.oraInizio) : ''}</td><td>${esc(r.c.nome || '')}</td><td>${esc(r.coltura)}${r.varieta ? ' · ' + esc(r.varieta) : ''}</td><td>${esc([r.o.bbch, r.o.fase].filter(Boolean).join(' · '))}</td><td class="n">${nf(r.ha, 4)}</td><td>${esc(r.p.nome || '')}</td><td>${esc(r.p.nReg || '')}</td><td>${esc(r.p.sostanze || '')}</td><td class="n">${it(r.o.dose, 3)} ${esc(r.p.unita || '')}</td><td class="n">${it(r.o.quantita, 3)} ${esc(r.p.unita || '')}</td><td>${esc(r.o.avversita || '')}</td><td>${r.raccoltaDal ? fd(r.raccoltaDal) : ''}</td><td>${esc(r.o.operatore || '')}${r.op && r.op.patentino ? '<br><span class="muted">' + esc(r.op.patentino) + '</span>' : ''}</td><td>${esc(r.m.nome || '')}</td><td>${esc([r.o.vento ? 'vento ' + r.o.vento.toLowerCase() : '', r.o.meteo, r.o.volumeAcqua ? nf(r.o.volumeAcqua, 0) + ' l/ha acqua' : '', r.o.note].filter(Boolean).join(' · '))}${r.o.controlli && r.o.controlli.length ? '<br><span class="warn">Confermato con: ' + esc(r.o.controlli.join('; ')) + '</span>' : ''}</td></tr>`), 'Nessun trattamento registrato nell\'annata.')}
  ${sec('3. Concimazioni', ['Data', 'Appezzamento', 'Coltura', 'Sup. ha', 'Prodotto', 'Dose /ha', 'Quantità', 'Fase', 'Operatore', 'Note'], conc.map(o => { const c = get('campi', o.campoId) || {}, p = get('prodotti', o.prodottoId) || {}; return `<tr><td>${fd(o.data)}</td><td>${esc(c.nome || '')}</td><td>${esc(cropOf(c, y))}</td><td class="n">${nf(campoHa(c), 4)}</td><td>${esc(p.nome || '')}</td><td class="n">${it(o.dose, 3)} ${esc(p.unita || '')}</td><td class="n">${it(o.quantita, 3)} ${esc(p.unita || '')}</td><td>${esc([o.bbch, o.fase].filter(Boolean).join(' · '))}</td><td>${esc(o.operatore || '')}</td><td>${esc(o.note || '')}</td></tr>`; }), 'Nessuna concimazione registrata.')}
  ${sec('4. Altre operazioni colturali', ['Data', 'Appezzamento', 'Coltura', 'Operazione', 'Prodotto / quantità', 'Raccolto', 'Mezzo', 'Ore', 'Operatore', 'Note'], altre.map(o => { const c = get('campi', o.campoId) || {}, p = get('prodotti', o.prodottoId), m = get('mezzi', o.mezzoId); return `<tr><td>${fd(o.data)}</td><td>${esc(c.nome || '')}</td><td>${esc(cropOf(c, y))}</td><td>${esc(o.tipo || '')}</td><td>${p ? esc(p.nome) + ' ' + it(o.quantita, 2) + ' ' + esc(p.unita || '') : ''}</td><td class="n">${N(o.raccolto) ? nf(o.raccolto, 2) + ' t' : ''}</td><td>${esc(m ? m.nome : '')}</td><td class="n">${it(o.ore, 1)}</td><td>${esc(o.operatore || '')}</td><td>${esc(o.note || '')}</td></tr>`; }), 'Nessuna altra operazione.')}
  ${sec('5. Prodotti fitosanitari: acquisti dell\'annata', ['Data', 'Prodotto', 'N. reg.', 'Quantità', 'Documento (DDT / fattura)', 'Fornitore'], carichi.map(m => { const p = get('prodotti', m.prodottoId) || {}; return `<tr><td>${fd(m.data)}</td><td>${esc(p.nome || '')}</td><td>${esc(p.nReg || '')}</td><td class="n">${it(m.quantita, 3)} ${esc(p.unita || '')}</td><td>${esc(m.documento || '')}</td><td>${esc(p.fornitore || '')}</td></tr>`; }), 'Nessun acquisto registrato.')}
  ${sec('6. Giacenze dei prodotti fitosanitari', ['Prodotto', 'N. reg.', 'Sostanze attive', 'Giacenza', 'Autorizzazione fino al', 'Scadenza lotto'], fito.map(p => `<tr><td>${esc(p.nome)}</td><td>${esc(p.nReg || '')}</td><td>${esc(p.sostanze || '')}</td><td class="n">${nf(giac(p), 3)} ${esc(p.unita || '')}</td><td>${fd(p.scadenzaAut)}</td><td>${fd(p.scadenza)}</td></tr>`), 'Nessun prodotto fitosanitario in magazzino.')}
  ${sec('7. Operatori abilitati e attrezzature', ['Operatore', 'Ruolo', 'Patentino', 'Valido fino al'], operatori.map(o => `<tr><td>${esc(o.nome)}</td><td>${esc(o.ruolo || '')}</td><td>${esc(o.patentino || '')}</td><td class="${okD(o.scadenzaPatentino) && o.scadenzaPatentino < today() ? 'warn' : ''}">${fd(o.scadenzaPatentino)}</td></tr>`).concat(irr.map(m => `<tr><td>${esc(m.nome)}</td><td>Irroratrice ${esc(m.modello || '')}</td><td>${esc(m.targa || '')}</td><td class="${okD(m.controlloFunzionale) && m.controlloFunzionale < today() ? 'warn' : ''}">Controllo funzionale: ${fd(m.controlloFunzionale)}</td></tr>`)), 'Nessun operatore registrato.')}
  <div class="sign"><div>Data ${fd(today())}</div><div>Firma del titolare</div></div>
  <p class="muted" style="margin-top:14px">Generato con Campo e Stalla. Verifica i dati prima di firmare: la responsabilità della registrazione resta dell'utilizzatore.</p>
  </body></html>`;
  return html;
}

// Dati strutturati dei trattamenti (contenuto richiesto dal Reg. UE 2023/564): un record per trattamento
export function registroJSON(y) {
  const a = azienda();
  return {
    formato: 'campo-e-stalla/registro-trattamenti', versione: 1, generato: new Date().toISOString(),
    azienda: { nome: a.nome || '', cuaa: a.iva || '', sede: a.indirizzo || '' }, annata: y,
    trattamenti: righeTrattamenti(y).map(r => ({
      data: r.o.data, ora_inizio: r.o.oraInizio || null, appezzamento: r.c.nome || '', comune: r.c.comune || '', riferimento_catastale: r.c.catasto || '', id_appezzamento_pcg: r.c.pcgId || null,
      superficie_ha: +r.ha.toFixed(4), coltura: r.coltura, varieta: r.varieta, bbch: r.o.bbch || null, fase: r.o.fase || null,
      prodotto: r.p.nome || '', numero_registrazione: r.p.nReg || '', sostanze_attive: r.p.sostanze || '', dose_ha: N(r.o.dose) || null, quantita: N(r.o.quantita) || null, unita: r.p.unita || '',
      avversita: r.o.avversita || '', carenza_giorni: r.car || null, raccolta_consentita_dal: r.raccoltaDal || null,
      operatore: r.o.operatore || '', patentino: r.op ? r.op.patentino || '' : '', attrezzatura: r.m.nome || '', vento: r.o.vento || null, volume_acqua_l_ha: N(r.o.volumeAcqua) || null, note: r.o.note || '',
      controlli_non_superati: r.o.controlli || [],
    })),
  };
}

// Stampa tramite iframe nascosto (funziona anche nell'app installata), con file scaricabile come ripiego
export function stampaRegistro(y) {
  const html = registroHTML(y);
  let fr = document.getElementById('printFrame'); if (fr) fr.remove();
  fr = document.createElement('iframe'); fr.id = 'printFrame'; fr.setAttribute('aria-hidden', 'true');
  fr.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  document.body.appendChild(fr);
  fr.onload = () => { try { fr.contentWindow.focus(); fr.contentWindow.print(); } catch (e) { scarica(`quaderno-campagna-${y}.html`, html, 'text/html'); } };
  fr.srcdoc = html;
}
export function scarica(name, text, type) {
  const b = new Blob([text], { type }); const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href = u; a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(u); a.remove(); }, 1000);
}
