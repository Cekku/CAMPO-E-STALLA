// Registro dei trattamenti e quaderno di campagna (QDCA): documento stampabile / PDF, CSV e JSON leggibile dalle macchine
import { S, get, azienda } from './state.js';
import { esc, nf, fd, N, addDays, yearOf, byDate, byName, today, okD, fineDi, fdPeriodo } from './util.js';
import { campoHa, cropOf, colturaOf, colturaAlla, secondoOf, giac, prodottiOp } from './domain.js';
import { isFitoOp, FITO, operatoreDi, impiegoPer } from './checks.js';
import { sync } from './store.js';
import { nativa, stampaHtml } from './nativo.js';
import { dettagliOp } from './elenchi.js';

const it = (n, d = 2) => n === null || n === undefined || n === '' ? '' : nf(n, d);
const opsAnno = (y, f) => S.operazioni.filter(o => o.stato !== 'Pianificata' && yearOf(o.data) === y && f(o)).sort((a, b) => byDate(a, b) || (a.oraInizio || '').localeCompare(b.oraInizio || ''));
const carenzaOf = (o, p, c) => { const imp = p && c ? impiegoPer(p, (colturaAlla(c, o.data) || {}).coltura, o.avversita) : null; return N(imp && imp.carenza) || N(p && p.carenza); };

// Codici EPPO delle colture (Reg. UE 2023/564, art. 1 par. 3): si cerca dall'inizio del nome; una coltura senza codice resta vuota
const EPPO = [['mais', 'ZEAMX'], ['granoturco', 'ZEAMX'], ['granturco', 'ZEAMX'], ['frumento duro', 'TRZDU'], ['grano duro', 'TRZDU'], ['frumento', 'TRZAX'], ['grano', 'TRZAX'], ['orzo', 'HORVX'], ['triticale', 'TTLSS'], ['soia', 'GLXMA'], ['erba medica', 'MEDSA'], ['medica', 'MEDSA'], ['loiessa', 'LOLMU'], ['loietto', 'LOLMU'], ['sorgo', 'SORVU'], ['girasole', 'HELAN'], ['colza', 'BRSNN'], ['barbabietola', 'BEAVA'], ['vite', 'VITVI'], ['pomodoro', 'LYPES'], ['avena', 'AVESA'], ['segale', 'SECCE'], ['patata', 'SOLTU']];
export const eppoDi = coltura => { const n = String(coltura || '').toLowerCase().trim(); const r = n && EPPO.find(([k]) => n.startsWith(k)); return r ? r[1] : ''; };
// Superficie trattata: quella scritta nell'operazione (se è una parte del campo), altrimenti tutto il campo
export const haTrattati = (o, c) => { const tot = campoHa(c || {}), h = N(o && o.haTrattati); return h > 0 && (!tot || h <= tot + 1e-9) ? h : tot; };

// Una riga per prodotto (1.68.0): ogni prodotto della stessa attività diventa un'attività "virtuale" con lo stesso id,
// prodotto, dose, quantità e avversità suoi (riga 0 = il primo). In un trattamento il concime in botte non va nel registro dei fitofarmaci.
const righeProdotti = (o, filtro) => { const rr = prodottiOp(o); return (rr.length ? rr : [{ riga: 0 }]).filter(r => !filtro || filtro(r)).map(r => r.riga === undefined || (r.riga === 0 && !o.altriProdotti) ? o : Object.assign({}, o, { prodottoId: r.prodottoId, dose: r.dose, quantita: r.quantita, avversita: r.avversita, riga: r.riga })); };
const isFitoRiga = (o, r) => { const p = get('prodotti', r.prodottoId); return p ? FITO.includes(p.categoria) || (isFitoOp(o.tipo) && (r.riga === 0 || !['Concime', 'Effluente', 'Seme'].includes(p.categoria))) : r.riga === 0 && isFitoOp(o.tipo); };
export function righeTrattamenti(y) {
  return opsAnno(y, o => isFitoOp(o.tipo) || prodottiOp(o).some(r => FITO.includes((get('prodotti', r.prodottoId) || {}).categoria))).flatMap(o => righeProdotti(o, r => r.riga === undefined || isFitoRiga(o, r))).map(o => {
    const c = get('campi', o.campoId) || {}, p = get('prodotti', o.prodottoId) || {}, m = get('mezzi', o.mezzoId) || {}, op = operatoreDi(o.operatore);
    const col = colturaAlla(c, o.data) || {}; const car = carenzaOf(o, p, c);
    return { o, c, p, m, op, coltura: col.coltura || '', varieta: col.varieta || '', eppo: eppoDi(col.coltura), ha: haTrattati(o, c), haCampo: campoHa(c), car, raccoltaDal: car ? addDays(fineDi(o), car + 1) : '' };
  });
}

// Controllo dell'annata (1.81.0): errori che i dati mancanti non mostrano e che un controllo della Regione troverebbe.
// Un elenco di { tipo, id (attività da aprire), testo }; si guarda tutta l'annata, non solo l'ultimo trattamento.
export function controlloAnno(y) {
  const out = [], righe = righeTrattamenti(y), oggi = today(), visti = new Set(), doppi = new Map();
  const campoData = r => `${r.c.nome || 'campo'} il ${fd(r.o.data)}`, nome = r => campoData(r) + (r.p.nome ? ' (' + r.p.nome + ')' : '');
  // chiave: errori di tutta l'attività una volta sola (non una per prodotto in botte); EPPO una volta per coltura
  const add = (tipo, r, testo, k = tipo + ':' + r.o.id + ':' + (r.o.riga || 0)) => { if (!visti.has(k)) { visti.add(k); out.push({ tipo, id: r.o.id, testo }); } };
  // raccolte e sfalci del foraggio (non il taglio di capezzagne e fossi)
  const raccolte = S.operazioni.filter(o => (o.tipo === 'Raccolta' || (o.tipo === 'Sfalcio' && !/capezzagn|foss/i.test(o.sottotipo || ''))) && o.stato !== 'Pianificata' && okD(o.data));
  for (const r of righe) {
    const scritto = N(r.o.haTrattati);
    // margine dell'1%: la superficie disegnata sulla mappa può differire di pochi metri quadri
    if (scritto > 0 && r.haCampo > 0 && scritto > r.haCampo * 1.01) add('superficie', r, `${campoData(r)}: superficie trattata ${nf(scritto, 2)} ha, più grande del campo (${nf(r.haCampo, 2)} ha). Nel registro va tutto il campo: correggi la superficie.`, 'superficie:' + r.o.id);
    const dose = N(r.o.dose), q = N(r.o.quantita), atteso = dose * r.ha;
    if (dose > 0 && q > 0 && atteso > 0 && Math.abs(q - atteso) / atteso > 0.15) add('quantita', r, `${nome(r)}: dose e quantità non tornano (${nf(dose, 2)} per ettaro su ${nf(r.ha, 2)} ha fa ${nf(atteso, 2)}, scritto ${nf(q, 2)}).`);
    if (okD(r.p.scadenzaAut) && r.p.scadenzaAut < r.o.data) add('autorizzazione', r, `${nome(r)}: il prodotto aveva l'autorizzazione scaduta (${fd(r.p.scadenzaAut)}). Controlla se era ancora nel periodo di smaltimento.`);
    if (r.o.data > oggi) add('futuro', r, `${campoData(r)}: è segnato come fatto ma la data è nel futuro.`, 'futuro:' + r.o.id);
    if (r.coltura && !r.eppo) add('eppo', r, `La coltura «${r.coltura}» (es. ${campoData(r)}) non ha un codice EPPO conosciuto dall'app: nel registro digitale va scelto dall'elenco del Ministero. È solo un avviso.`, 'eppo:' + r.coltura.toLowerCase());
    if (r.raccoltaDal && r.c.id) {
      const x = raccolte.find(o => o.campoId === r.c.id && o.data > fineDi(r.o) && o.data < r.raccoltaDal);
      if (x) add('carenza', r, `${nome(r)}: ${x.tipo === 'Sfalcio' ? 'sfalcio' : 'raccolta'} il ${fd(x.data)}, prima della fine del tempo di carenza (si poteva dal ${fd(r.raccoltaDal)}).`);
    }
    if (r.c.id && r.p.id) { const k = r.c.id + '|' + r.p.id + '|' + r.o.data; const a = doppi.get(k); if (a && a !== r.o.id) add('doppione', r, `${nome(r)}: c'è già un trattamento con lo stesso prodotto sullo stesso campo e nello stesso giorno. Se è lo stesso, cancellane uno.`); else doppi.set(k, r.o.id); }
  }
  // prima gli errori veri, gli avvisi EPPO in fondo (la scheda ne mostra solo 8)
  const peso = { carenza: 0, autorizzazione: 1, superficie: 2, doppione: 3, quantita: 4, futuro: 5, eppo: 9 };
  return out.map((x, i) => [x, i]).sort((a, b) => peso[a[0].tipo] - peso[b[0].tipo] || a[1] - b[1]).map(x => x[0]);
}

function head(a, y, titolo) {
  return `<header class="doc-h"><div><h1>${esc(titolo)}</h1><p>Annata agraria ${y}</p></div><table class="kv"><tr><th>Azienda</th><td>${esc(a.nome || (sync.farm && sync.farm.name) || '')}</td></tr><tr><th>CUAA / P. IVA</th><td>${esc(a.iva || '')}</td></tr><tr><th>Sede</th><td>${esc(a.indirizzo || '')}</td></tr><tr><th>Superficie</th><td>${nf(S.campi.reduce((t, c) => t + campoHa(c), 0), 4)} ha · ${S.campi.length} appezzamenti</td></tr></table></header>`;
}

const vuotoNull = x => x === null || x === undefined || x === '' ? null : N(x);
const meteoTesto = o => [vuotoNull(o.temp) !== null ? nf(o.temp, 0) + ' °C' : '', vuotoNull(o.umidita) !== null ? nf(o.umidita, 0) + '%' : '', vuotoNull(o.ventoKmh) !== null ? nf(o.ventoKmh, 0) + ' km/h' : '', vuotoNull(o.pioggia24) !== null ? nf(o.pioggia24, 1) + ' mm' : ''].filter(Boolean).join(' · ');
const sceltaTesto = o => [o.sottotipo, o.motivoInt, o.cielo ? 'cielo ' + o.cielo.toLowerCase() : '', o.modoApplicazione, o.livelloInfestazione ? 'infestazione ' + o.livelloInfestazione.toLowerCase() : '', o.sogliaSuperata ? 'soglia superata: ' + o.sogliaSuperata : '', o.autTecnica ? 'tecnico: ' + o.autTecnica : '', o.fasciaRispetto ? 'fascia di rispetto: ' + o.fasciaRispetto : '', o.efficacia ? 'efficacia ' + o.efficacia.toLowerCase() : ''].filter(Boolean).join(' · ');
export function registroHTML(y) {
  const a = azienda();
  const camp = [...S.campi].sort(byName);
  const tr = righeTrattamenti(y);
  const conc = opsAnno(y, o => o.tipo === 'Concimazione').flatMap(o => righeProdotti(o));
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
  ${sec('1. Appezzamenti e colture', ['Appezzamento', 'Comune', 'Riferimenti catastali', 'Superficie ha', 'Coltura ' + y, 'Varietà', 'Conduzione', 'Irriguo'], camp.map(c => { const k = colturaOf(c, y) || {}; return `<tr><td>${esc(c.nome)}</td><td>${esc(c.comune || '')}</td><td>${esc(c.catasto || '')}</td><td class="n">${nf(campoHa(c), 4)}</td><td>${esc((k.coltura || '') + (secondoOf(c, y) ? ' poi ' + secondoOf(c, y).coltura : ''))}</td><td>${esc(k.varieta || '')}</td><td>${esc(c.conduzione || '')}</td><td>${esc(c.irriguo || '')}</td></tr>`; }), 'Nessun appezzamento.')}
  ${sec('2. Registro dei trattamenti con prodotti fitosanitari', ['Data e ora', 'Appezzamento e identificativo', 'Coltura e varietà (cod. EPPO)', 'BBCH / fase', 'Sup. trattata ha', 'Prodotto commerciale', 'N. reg.', 'Sostanze attive', 'Dose /ha', 'Quantità', 'Avversità', 'Raccolta dal', 'Operatore e patentino', 'Irroratrice', 'Meteo (temp. · umidità · vento · pioggia 24 h)', 'Distribuzione e scelte', 'Note'], tr.map(r => `<tr><td>${fdPeriodo(r.o)}${r.o.oraInizio ? ' ' + esc(r.o.oraInizio) : ''}</td><td>${esc(r.c.nome || '')}${r.c.pcgId || r.c.catasto ? '<br><span class="muted">' + esc(r.c.pcgId ? 'PCG ' + r.c.pcgId : r.c.catasto) + '</span>' : ''}</td><td>${esc(r.coltura)}${r.varieta ? ' · ' + esc(r.varieta) : ''}${r.eppo ? ' <span class="muted">(' + r.eppo + ')</span>' : ''}</td><td>${esc([r.o.bbch, r.o.fase].filter(Boolean).join(' · '))}</td><td class="n">${nf(r.ha, 4)}${r.ha < r.haCampo - 1e-9 ? '<br><span class="muted">su ' + nf(r.haCampo, 4) + ' ha</span>' : ''}</td><td>${esc(r.p.nome || '')}</td><td>${esc(r.p.nReg || '')}</td><td>${esc(r.p.sostanze || '')}</td><td class="n">${it(r.o.dose, 3)} ${esc(r.p.unita || '')}</td><td class="n">${it(r.o.quantita, 3)} ${esc(r.p.unita || '')}</td><td>${esc(r.o.avversita || '')}</td><td>${r.raccoltaDal ? fd(r.raccoltaDal) : ''}</td><td>${esc(r.o.operatore || '')}${r.op && r.op.patentino ? '<br><span class="muted">' + esc(r.op.patentino) + '</span>' : ''}</td><td>${esc(r.m.nome || '')}</td><td>${esc(meteoTesto(r.o))}${r.o.meteoAuto && r.o.meteoAuto !== 'nd' ? '<br><span class="muted">da Open-Meteo' + esc(r.o.meteoAuto.includes('ore') ? ', ' + r.o.meteoAuto.slice(r.o.meteoAuto.indexOf('ore')) : '') + '</span>' : ''}</td><td>${esc(sceltaTesto(r.o))}</td><td>${esc([r.o.vento ? 'vento ' + r.o.vento.toLowerCase() : '', r.o.meteo, r.o.volumeAcqua ? nf(r.o.volumeAcqua, 0) + ' l/ha acqua' : '', r.o.note].filter(Boolean).join(' · '))}${r.o.controlli && r.o.controlli.length ? '<br><span class="warn">Confermato con: ' + esc(r.o.controlli.join('; ')) + '</span>' : ''}</td></tr>`), 'Nessun trattamento registrato nell\'annata.')}
  ${sec('3. Concimazioni', ['Data', 'Appezzamento', 'Coltura', 'Sup. ha', 'Prodotto', 'Dose /ha', 'Quantità', 'Fase', 'Operatore', 'Note'], conc.map(o => { const c = get('campi', o.campoId) || {}, p = get('prodotti', o.prodottoId) || {}; return `<tr><td>${fdPeriodo(o)}</td><td>${esc(c.nome || '')}</td><td>${esc((colturaAlla(c, o.data) || {}).coltura || '')}</td><td class="n">${nf(campoHa(c), 4)}</td><td>${esc(p.nome || '')}</td><td class="n">${it(o.dose, 3)} ${esc(p.unita || '')}</td><td class="n">${it(o.quantita, 3)} ${esc(p.unita || '')}</td><td>${esc([o.bbch, o.fase].filter(Boolean).join(' · '))}</td><td>${esc(o.operatore || '')}</td><td>${esc([o.sottotipo, ...dettagliOp(o), o.note].filter(Boolean).join(' · '))}</td></tr>`; }), 'Nessuna concimazione registrata.')}
  ${sec('4. Altre operazioni colturali', ['Data', 'Appezzamento', 'Coltura', 'Operazione', 'Prodotto / quantità', 'Raccolto', 'Mezzo', 'Ore', 'Operatore', 'Note'], altre.map(o => { const c = get('campi', o.campoId) || {}, p = get('prodotti', o.prodottoId), m = get('mezzi', o.mezzoId); return `<tr><td>${fdPeriodo(o)}</td><td>${esc(c.nome || '')}</td><td>${esc((colturaAlla(c, o.data) || {}).coltura || '')}</td><td>${esc([o.tipo, o.sottotipo, o.modoRaccolta, o.prodottoRaccolto, ...dettagliOp(o, id => (get('mezzi', id) || {}).nome)].filter(Boolean).join(' · '))}</td><td>${prodottiOp(o).map(r => { const q = get('prodotti', r.prodottoId); return q ? esc(q.nome) + ' ' + it(r.quantita, 2) + ' ' + esc(q.unita || '') : ''; }).filter(Boolean).join(', ')}</td><td class="n">${N(o.raccolto) ? nf(o.raccolto, 2) + ' t' : ''}</td><td>${esc(m ? m.nome : '')}</td><td class="n">${it(o.ore, 1)}</td><td>${esc(o.operatore || '')}</td><td>${esc(o.note || '')}</td></tr>`; }), 'Nessuna altra operazione.')}
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
    formato: 'campo-e-stalla/registro-trattamenti', versione: 2, norma: 'Reg. (UE) 2023/564', generato: new Date().toISOString(),
    azienda: { nome: a.nome || '', cuaa: a.iva || '', sede: a.indirizzo || '' }, annata: y,
    trattamenti: righeTrattamenti(y).map(r => ({
      tipo_utilizzo: 'Applicazione in campo', tipo_superficie: 'Terreno agricolo', data: r.o.data, data_fine: r.o.dataFine || null, ora_inizio: r.o.oraInizio || null, appezzamento: r.c.nome || '', comune: r.c.comune || '', riferimento_catastale: r.c.catasto || '', id_appezzamento_pcg: r.c.pcgId || null,
      superficie_ha: +r.ha.toFixed(4), superficie_appezzamento_ha: +r.haCampo.toFixed(4), coltura: r.coltura, codice_eppo: r.eppo || null, varieta: r.varieta, bbch: r.o.bbch || null, fase: r.o.fase || null,
      prodotto: r.p.nome || '', numero_registrazione: r.p.nReg || '', sostanze_attive: r.p.sostanze || '', dose_ha: N(r.o.dose) || null, quantita: N(r.o.quantita) || null, unita: r.p.unita || '',
      avversita: r.o.avversita || '', carenza_giorni: r.car || null, raccolta_consentita_dal: r.raccoltaDal || null,
      meteo_fonte: r.o.meteoAuto && r.o.meteoAuto !== 'nd' ? 'Open-Meteo' : null, temperatura_c: vuotoNull(r.o.temp), umidita_pct: vuotoNull(r.o.umidita), vento_kmh: vuotoNull(r.o.ventoKmh), pioggia_24h_mm: vuotoNull(r.o.pioggia24),
      modo_distribuzione: r.o.modoApplicazione || null, livello_infestazione: r.o.livelloInfestazione || null, soglia_superata: r.o.sogliaSuperata || null, autorizzazione_tecnico: r.o.autTecnica || null, fascia_rispetto: r.o.fasciaRispetto || null, efficacia: r.o.efficacia || null, stato_cielo: r.o.cielo || null, motivo_intervento: r.o.motivoInt || null,
      operatore: r.o.operatore || '', patentino: r.op ? r.op.patentino || '' : '', attrezzatura: r.m.nome || '', vento: r.o.vento || null, volume_acqua_l_ha: N(r.o.volumeAcqua) || null, note: r.o.note || '',
      controlli_non_superati: r.o.controlli || [],
    })),
  };
}

// Stampa tramite iframe nascosto (funziona anche nell'app installata), con file scaricabile come ripiego
export function stampaRegistro(y) {
  const html = registroHTML(y);
  if (nativa) return stampaHtml(html, `Quaderno di campagna ${y}`);
  let fr = document.getElementById('printFrame'); if (fr) fr.remove();
  fr = document.createElement('iframe'); fr.id = 'printFrame'; fr.setAttribute('aria-hidden', 'true');
  fr.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  document.body.appendChild(fr);
  fr.onload = () => { try { fr.contentWindow.focus(); if (!localStorage.getItem('ces.prova.nostampa')) fr.contentWindow.print(); } catch (e) { scarica(`quaderno-campagna-${y}.html`, html, 'text/html'); } };
  fr.srcdoc = html;
}
export function scarica(name, text, type) {
  const b = new Blob([text], { type }); const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href = u; a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(u); a.remove(); }, 1000);
}
