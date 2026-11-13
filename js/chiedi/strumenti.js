// Strumenti della chat "Chiedi" (dalla 1.37.0): l'IA non riceve i dati in blocco, chiede all'app quello che le serve.
// Ogni strumento usa i calcoli che l'app ha già (conto economico, centri, salute, stalla, agenda…) e restituisce
// solo un riassunto in JSON. Tutti in sola lettura. Quelli con conti: true esistono solo per il titolare (contiVisibili).
import { S, D, UI, get, azienda } from '../state.js';
import { N, today, yearOf, addDays, okD } from '../util.js';
import { campoHa, cropOf, capoI, giac, mezzoOre, mezzoTagliando, opCosto, allAlerts } from '../domain.js';
import { agenda } from '../agenda.js';

const norm = x => String(x || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const ha = (testo, cerca) => !cerca || norm(testo).includes(norm(cerca));
const r2 = v => Math.round(N(v) * 100) / 100;
const annoDi = a => (+a > 1990 && +a < 2100 ? +a : UI.anno);

/** Riassunto compatto: numeri arrotondati, niente vuoti né funzioni, elenchi e profondità limitati (meno parole da mandare). */
export function compatta(v, prof = 0, max = 60) {
  if (v === null || v === undefined || v === '' || typeof v === 'function') return undefined;
  if (typeof v === 'number') return isFinite(v) ? Math.round(v * 100) / 100 : undefined;
  if (typeof v === 'string') return v.length > 300 ? v.slice(0, 300) + '…' : v;
  if (typeof v !== 'object') return v;
  if (v instanceof Map) v = Object.fromEntries(v); else if (v instanceof Set) v = [...v];
  if (prof > 5) return undefined;
  if (Array.isArray(v)) { const a = v.slice(0, max).map(x => compatta(x, prof + 1, max)).filter(x => x !== undefined); if (v.length > max) a.push(`… altri ${v.length - max}`); return a.length ? a : undefined; }
  const o = {}; for (const [k, x] of Object.entries(v)) { if (k === 'go' || k === 'icn' || k === 'html' || k === 'geom') continue; const c = compatta(x, prof + 1, max); if (c !== undefined) o[k] = c; }
  return Object.keys(o).length ? o : undefined;
}

const P = (props, req = []) => ({ type: 'object', properties: props, required: req, additionalProperties: false });
const ANNO = { type: 'integer', description: 'Anno, es. 2025. Se manca: l\'annata scelta in alto nell\'app.' };
const TESTO = d => ({ type: 'string', description: d });

/* ---------------- campagna ---------------- */
function campi({ anno, cerca } = {}) {
  const y = annoDi(anno);
  const el = S.campi.filter(c => ha([c.nome, c.comune, c.gruppo, c.catasto, cropOf(c, y)].join(' '), cerca)).map(c => ({ id: c.id, nome: c.nome, ettari: r2(campoHa(c)), coltura: cropOf(c, y), comune: c.comune, gruppo: c.gruppo, conduzione: c.conduzione, catasto: c.catasto }));
  const perColtura = {}; el.forEach(c => { const k = c.coltura || 'senza coltura'; perColtura[k] = r2((perColtura[k] || 0) + c.ettari); });
  return { anno: y, campi: el.length, ettari: r2(el.reduce((t, c) => t + c.ettari, 0)), perColtura, elenco: el };
}
function attivita({ anno, campo, tipo, stato, prodotto, limite } = {}) {
  const y = annoDi(anno);
  const el = S.operazioni.filter(o => yearOf(o.data) === y).filter(o => {
    const c = get('campi', o.campoId) || {}, p = get('prodotti', o.prodottoId) || {};
    return ha(c.nome, campo) && ha(o.tipo, tipo) && ha(o.stato || 'Fatto', stato) && ha(p.nome, prodotto);
  }).sort((a, b) => (b.data || '').localeCompare(a.data || ''));
  const perTipo = {}; let costo = 0;
  const righe = el.map(o => { const c = get('campi', o.campoId) || {}, p = get('prodotti', o.prodottoId) || {}, m = get('mezzi', o.mezzoId) || {}; let k = 0; try { k = opCosto(o).tot; } catch (e) { } costo += N(k); perTipo[o.tipo || 'Altro'] = (perTipo[o.tipo || 'Altro'] || 0) + 1; return { data: o.data, tipo: o.tipo, stato: o.stato || 'Fatto', campo: c.nome, campoId: c.id, ettari: r2(campoHa(c)), prodotto: p.nome, dose: o.dose, unita: p.unita, quantita: o.quantita, avversita: o.avversita, mezzo: m.nome, ore: o.ore, operatore: o.operatore, raccolto_t: o.raccolto, costo: r2(k) }; });
  return { anno: y, trovate: el.length, costoStimato: r2(costo), perTipo, elenco: righe.slice(0, Math.min(+limite || 60, 150)) };
}
function magazzino({ cerca, categoria, sotto_scorta } = {}) {
  const el = S.prodotti.filter(p => ha([p.nome, p.nReg, p.sostanze].join(' '), cerca) && ha(p.categoria, categoria)).map(p => ({ id: p.id, nome: p.nome, categoria: p.categoria, giacenza: r2(giac(p)), unita: p.unita, prezzo: p.prezzo, scorta_minima: p.scortaMin || p.minimo, scadenza: p.scadenza, carenza_gg: p.carenza }));
  const out = sotto_scorta ? el.filter(p => N(p.scorta_minima) && p.giacenza < N(p.scorta_minima)) : el;
  return { prodotti: out.length, elenco: out.slice(0, 120) };
}
function mezzi({ cerca } = {}) {
  return { elenco: S.mezzi.filter(m => ha([m.nome, m.tipo, m.modello, m.targa].join(' '), cerca)).map(m => { let ore = null, tag = null; try { ore = mezzoOre(m); } catch (e) { } try { tag = mezzoTagliando(m); } catch (e) { } return { id: m.id, nome: m.nome, tipo: m.tipo, modello: m.modello, targa: m.targa, anno: m.anno, ore, tagliando: compatta(tag), revisione: m.revisione, assicurazione: m.assicurazione, controlloFunzionale: m.controlloFunzionale }; }) };
}
function scadenze({ giorni } = {}) {
  const g = Math.min(Math.max(+giorni || 30, 1), 365);
  return { daOggi: today(), finoAl: addDays(today(), g), voci: agenda(g, 'tutte').map(x => ({ data: x.data, area: x.area, cosa: x.t, dettaglio: x.s, inRitardo: x.late || undefined })) };
}
function avvisi() { return { avvisi: allAlerts().map(a => ({ livello: a.lv, area: a.area, cosa: a.t, dettaglio: a.s })) }; }
async function meteo() {
  const { getMeteo } = await import('../meteo.js'); const { giorniCaldo } = await import('../caldo.js');
  const m = getMeteo(); const j = m && m.data; if (!j) return { errore: 'Previsioni non ancora scaricate: manca la posizione dell\'azienda o la connessione' };
  const dd = j.daily || {};
  const giorni = (dd.time || []).map((t, i) => ({ data: t, min: dd.temperature_2m_min?.[i], max: dd.temperature_2m_max?.[i], pioggia_mm: dd.precipitation_sum?.[i], prob_pioggia: dd.precipitation_probability_max?.[i], vento_max: dd.wind_speed_10m_max?.[i] }));
  let caldo = []; try { caldo = giorniCaldo(j).map(g => ({ data: g.data, thiMax: g.max, livello: g.liv && g.liv.t, oreSopra72: g.h72, oreFresche: g.fresche })); } catch (e) { }
  return { adesso: compatta(j.current), giorni, stressCaldo: caldo };
}

/* ---------------- stalla ---------------- */
function capi({ cerca, stato, gravide, da_fecondare, limite } = {}) {
  const vivi = S.capi.filter(c => capoI(c).stato !== 'Uscita');
  const conteggio = {}; vivi.forEach(c => { const s = capoI(c).stato || '?'; conteggio[s] = (conteggio[s] || 0) + 1; });
  const el = vivi.filter(c => { const i = capoI(c); return ha([c.nome, c.matricola, c.numero].join(' '), cerca) && ha(i.stato, stato) && (!gravide || i.gravida) && (!da_fecondare || (i.alerts || []).some(a => /fecond/i.test(a.t || a))); })
    .map(c => { const i = capoI(c); return { id: c.id, nome: c.nome, matricola: c.matricola, numero: c.numero, razza: c.razza, nascita: c.nascita, stato: i.stato, lattazione: i.nLatt, ultimoParto: i.pData, giorniLatte: i.dim, gravida: i.gravida || undefined, partoPrevisto: i.prevParto, fecondazioni: i.nFec, inSospensioneLatte: i.inSospLatte || undefined, avvisi: (i.alerts || []).map(a => a.t || a).slice(0, 4) }; });
  return { presenti: vivi.length, perStato: conteggio, trovati: el.length, elenco: el.slice(0, Math.min(+limite || 80, 200)) };
}
function latte({ da, a } = {}) {
  const fine = okD(a) ? a : today(), ini = okD(da) ? da : addDays(fine, -30);
  const L = (D.latte || S.latte).filter(l => l.data >= ini && l.data <= fine).sort((x, y) => x.data.localeCompare(y.data));
  const tot = L.reduce((t, l) => t + N(l.litri), 0), conf = L.reduce((t, l) => t + N(l.conferiti), 0);
  return { da: ini, a: fine, giorniRegistrati: L.length, litriProdotti: r2(tot), litriConferiti: r2(conf), mediaGiorno: L.length ? r2(tot / L.length) : null, giorni: L.slice(-40).map(l => ({ data: l.data, litri: l.litri, conferiti: l.conferiti, vacche: l.vacche, grasso: l.grasso, proteine: l.proteine, cellule: l.cellule, prezzo: l.prezzo })) };
}
function controlliAia({ ultimi } = {}) {
  const a = S.config.find(x => x.id === 'aia'); const st = ((a && a.storia) || []).slice().sort((x, y) => String(y.data).localeCompare(String(x.data)));
  if (!st.length) return { errore: 'Nessun controllo funzionale AIA caricato (Stalla → Indici e benessere)' };
  return { controlli: compatta(st.slice(0, Math.min(+ultimi || 6, 24))) };
}

/* ---------------- conti (solo titolare) ---------------- */
async function fattureCerca({ testo, tipo, anno, mese, da, a, limite } = {}) {
  const { fatture } = await import('../conti/dati.js');
  const el = fatture().filter(f => (!anno || f.anno === +anno) && (!mese || f.mese === +mese) && (!da || f.data >= da) && (!a || f.data <= a) && (!tipo || f.tipo === tipo) && ha([f.controparte, f.numero, (f.righe || []).map(r => r.descrizione).join(' ')].join(' '), testo))
    .sort((x, y) => (y.data || '').localeCompare(x.data || ''));
  const somma = k => r2(el.reduce((t, f) => t + N(f[k]), 0));
  return { trovate: el.length, imponibile: somma('imponibile'), totale: somma('totale'), elenco: el.slice(0, Math.min(+limite || 40, 100)).map(f => ({ id: f.id, data: f.data, numero: f.numero, tipo: f.tipo, controparte: f.controparte, imponibile: f.imponibile, totale: f.totale, pagato: (f.pagamentiBanca || []).length ? r2((f.pagamentiBanca || []).reduce((t, p) => t + N(p.importo), 0)) : undefined, righe: (f.righe || []).slice(0, 6).map(r => `${r.descrizione || ''} · ${r2(r.importo)} € · ${r.categoria || ''}`) })) };
}
async function speseRaggruppate({ tipo, anni, per, categoria, controparte, descrizione } = {}) {
  const { righe } = await import('../conti/dati.js');
  const ys = (Array.isArray(anni) && anni.length ? anni : [UI.anno]).map(Number);
  const k = { categoria: r => r.categoria || 'Da classificare', controparte: r => r.controparte || '?', mese: r => String(r.mese || '?').padStart(2, '0'), anno: () => '' }[per || 'categoria'] || (r => r.categoria);
  const G = new Map();
  for (const r of righe()) {
    if (!ys.includes(r.anno) || r.tipo !== (tipo || 'Acquisto')) continue;
    if (!ha(r.categoria, categoria) || !ha(r.controparte, controparte) || !ha(r.descrizione, descrizione)) continue;
    const g = k(r); if (!G.has(g)) G.set(g, { voce: g || 'totale', n: 0 });
    const o = G.get(g); o[r.anno] = r2(N(o[r.anno]) + N(r.importo)); o.n++;
  }
  const out = [...G.values()].sort((x, y) => N(y[ys[ys.length - 1]]) - N(x[ys[ys.length - 1]]));
  const tot = {}; ys.forEach(y => (tot[y] = r2(out.reduce((t, o) => t + N(o[y]), 0))));
  return { tipo: tipo || 'Acquisto', importi: 'imponibile senza IVA, in euro', anni: ys, totale: tot, gruppi: out.slice(0, 80) };
}
async function contoEconomico({ anno } = {}) {
  const { calc } = await import('../conti/dati.js'); const { CE } = await import('../conti/schema.js');
  const y = annoDi(anno); const C = calc(y);
  if (!C.has || !C.has.ce) return { anno: y, errore: 'Conto economico non caricato per questo anno (Conti → Carica documenti: bilancino del commercialista)', personaleDaPaghe: compatta(C.paghe) };
  return { anno: y, voci: CE.filter(x => x.row && N(C.ce[x.row])).map(x => ({ riga: x.row, codice: x.code || undefined, voce: x.l, euro: r2(C.ce[x.row]), totale: x.tot || x.grp || undefined })), personaleDaPaghe: compatta(C.paghe) };
}
async function indici({ anno } = {}) {
  const { parametri, plvAnno, aiaAnno, datiTecnici } = await import('../conti/dati.js'); const { PARAMETRI } = await import('../conti/analisi.js');
  const y = annoDi(anno); const Pm = parametri(y); const out = [];
  for (const [sez, voci] of PARAMETRI) for (const [k, l] of voci) if (Pm[k] !== null && Pm[k] !== undefined) out.push({ sezione: sez, indice: l, valore: r2(Pm[k]) });
  let dt = null; try { dt = compatta(datiTecnici(y).val); } catch (e) { }
  return { anno: y, plv: compatta(plvAnno(y)), datiTecnici: dt, vaccheAia: compatta(aiaAnno(y)), indici: out };
}
async function saluteAzienda({ anno } = {}) {
  const { saluteMemo } = await import('../conti/salute.js'); const s = saluteMemo(annoDi(anno));
  return compatta({ anno: s.y, voto: s.voto, giudizio: s.sem && s.sem.testo, votoParziale: s.pochi ? s.votoParziale : undefined, affidabilita: s.aff, motivi: s.motivi, aree: (s.aree || []).map(a => ({ area: a.nome || a.k, voto: a.voto, indiciContati: a.contati, indiciTotali: a.totali })), migliorare: (s.migliorare || []).slice(0, 8), daTenereDOcchio: (s.occhio || []).slice(0, 8), mancano: s.mancano }, 0, 20);
}
async function centriDiCosto({ anno } = {}) {
  const { centri } = await import('../conti/centri.js'); const c = centri(annoDi(anno));
  return compatta({ anno: c.anno, centri: c.R, totale: c.tot, quote: c.q, unita: c.unita, fuori: c.fuori, daClassificare: c.daClass, conContoEconomico: c.conCe }, 0, 25);
}
async function inSospeso() {
  const { sospesi } = await import('../conti/sospesi.js');
  return { gruppi: sospesi().map(g => ({ gruppo: g.titolo, voci: g.voci.slice(0, 12).map(v => ({ livello: v.liv, cosa: v.t, dettaglio: v.s, quante: v.n })) })) };
}
async function preventivi() {
  const P = await import('../conti/preventivi.js');
  return compatta({ confronti: P.confronti().slice(0, 20).map(c => { let k = null, av = []; try { k = P.calcola(c); av = P.avvisi(c, k); } catch (e) { } return { id: c.id, nome: c.nome || c.titolo, genere: c.genere, creato: c.creato, risultato: k, avvisi: av.map(a => a.t) }; }), scadenze: P.scadenze() }, 0, 30);
}
async function personale({ anno } = {}) {
  const Pg = await import('../conti/paghe.js'); const y = annoDi(anno);
  let ano = []; try { ano = Pg.anomalie(); } catch (e) { }
  const dip = (() => { try { return Pg.dipendenti(); } catch (e) { return []; } })();
  return compatta({ anno: y, costiDalleBustePaga: Pg.costiAnno(y), dipendenti: Array.isArray(dip) ? dip.length : Object.keys(dip || {}).length, irregolarita: ano.length, primeIrregolarita: ano.slice(0, 10).map(a => a.t || a.testo || a.tipo) }, 0, 20);
}
async function archivio({ testo, anno, limite } = {}) {
  const A = await import('../views/archivio-dati.js');
  const q = new URLSearchParams({ q: testo || '', limite: String(Math.min(+limite || 15, 40)) }); if (anno) q.set('anno', anno);
  try { const r = await A.aspetta('/documenti?' + q); return { trovati: r.totale, documenti: (r.documenti || []).map(d => ({ impronta: d.impronta, nome: d.nome, data: d.data, tipo: d.tipo, controparte: d.controparte, area: d.area, estratto: d.estratto })) }; }
  catch (e) { return { errore: 'Archivio del PC non raggiungibile: il ponte dell\'archivio deve essere acceso su questo computer' }; }
}

/* ---------------- elenco ---------------- */
export const STRUMENTI = [
  { name: 'campi', description: 'Campi dell\'azienda: ettari, coltura dell\'anno, comune, gruppo, conduzione, catasto; totale ettari per coltura.', parameters: P({ anno: ANNO, cerca: TESTO('Parte del nome, comune, gruppo o coltura (facoltativo)') }), run: campi },
  { name: 'attivita_campagna', description: 'Lavori fatti o pianificati nei campi (semine, trattamenti, concimazioni, raccolte…) con prodotto, dose, mezzo, operatore e costo stimato.', parameters: P({ anno: ANNO, campo: TESTO('Nome del campo'), tipo: TESTO('Tipo di lavoro, es. Diserbo'), stato: TESTO('Fatto o Pianificata'), prodotto: TESTO('Nome del prodotto'), limite: { type: 'integer' } }), run: attivita },
  { name: 'magazzino', description: 'Prodotti in magazzino (sementi, concimi, fitofarmaci, mangimi, farmaci…) con giacenza, prezzo e scadenza.', parameters: P({ cerca: TESTO('Nome o sostanza'), categoria: TESTO('Categoria'), sotto_scorta: { type: 'boolean', description: 'Solo quelli sotto la scorta minima' } }), run: magazzino },
  { name: 'mezzi', description: 'Trattori e macchinari: ore, tagliando, revisione, assicurazione, controllo funzionale.', parameters: P({ cerca: TESTO('Nome, tipo, modello o targa') }), run: mezzi },
  { name: 'scadenze', description: 'Agenda delle cose da fare nei prossimi giorni: attività pianificate, parti, asciutte, sospensioni, revisioni, patentini, prodotti in scadenza, scadenze dei documenti.', parameters: P({ giorni: { type: 'integer', description: 'Quanti giorni guardare avanti (predefinito 30)' } }), run: scadenze },
  { name: 'avvisi', description: 'Avvisi aperti dell\'app (campagna, stalla, magazzino, dati).', parameters: P({}), run: avvisi },
  { name: 'meteo', description: 'Meteo di oggi e previsioni a 7 giorni dell\'azienda, con lo stress da caldo delle vacche (THI).', parameters: P({}), run: meteo },
  { name: 'capi', description: 'Vacche e altri capi presenti: stato, lattazione, giorni di latte, gravidanza, parto previsto, fecondazioni, avvisi. Con il conteggio per stato.', parameters: P({ cerca: TESTO('Nome, matricola o numero aziendale'), stato: TESTO('Parte dello stato, es. asciutta, lattazione, manza'), gravide: { type: 'boolean' }, da_fecondare: { type: 'boolean' }, limite: { type: 'integer' } }), run: capi },
  { name: 'latte', description: 'Registro del latte giorno per giorno (litri prodotti e conferiti, vacche, qualità) in un periodo.', parameters: P({ da: TESTO('Data di inizio AAAA-MM-GG (predefinito: 30 giorni fa)'), a: TESTO('Data di fine AAAA-MM-GG (predefinito: oggi)') }), run: latte },
  { name: 'controlli_aia', description: 'Ultimi controlli funzionali AIA (Si@lleva): vacche presenti e asciutte, latte medio, grasso, proteine, cellule, indici di fertilità.', parameters: P({ ultimi: { type: 'integer', description: 'Quanti controlli (predefinito 6)' } }), run: controlliAia },
  { conti: true, name: 'cerca_fatture', description: 'Cerca fatture di acquisto o vendita per ditta, numero o descrizione delle righe; dà il totale e l\'elenco.', parameters: P({ testo: TESTO('Ditta, numero o parola delle righe'), tipo: { type: 'string', enum: ['Acquisto', 'Vendita'] }, anno: { type: 'integer' }, mese: { type: 'integer' }, da: TESTO('AAAA-MM-GG'), a: TESTO('AAAA-MM-GG'), limite: { type: 'integer' } }), run: fattureCerca },
  { conti: true, name: 'spese_raggruppate', description: 'Somme delle righe delle fatture (imponibile) raggruppate per categoria, fornitore/cliente o mese, per uno o più anni: per confrontare le spese o i ricavi fra anni.', parameters: P({ tipo: { type: 'string', enum: ['Acquisto', 'Vendita'] }, anni: { type: 'array', items: { type: 'integer' } }, per: { type: 'string', enum: ['categoria', 'controparte', 'mese', 'anno'] }, categoria: TESTO('Filtro sulla categoria, es. mangimi'), controparte: TESTO('Filtro sulla ditta'), descrizione: TESTO('Filtro sulla descrizione della riga') }, ['anni']), run: speseRaggruppate },
  { conti: true, name: 'conto_economico', description: 'Conto economico dell\'anno dal bilancino del commercialista (voci con importo), più il costo del personale dalle buste paga.', parameters: P({ anno: ANNO }), run: contoEconomico },
  { conti: true, name: 'indici_economici', description: 'Indici della stalla e dell\'azienda (latte per vacca, prezzo del latte, costo alimentare, IOFC, PLV, reddito lordo standard, indici di bilancio…) e dati tecnici dell\'anno.', parameters: P({ anno: ANNO }), run: indici },
  { conti: true, name: 'salute_azienda', description: 'Voto di salute dell\'azienda (0-100) per area, cosa migliorare, cosa tenere d\'occhio e dati che mancano.', parameters: P({ anno: ANNO }), run: saluteAzienda },
  { conti: true, name: 'centri_di_costo', description: 'Costi e ricavi divisi fra stalla, campagna, spese generali e banca, con costo della stalla per litro e per vacca.', parameters: P({ anno: ANNO }), run: centriDiCosto },
  { conti: true, name: 'cose_in_sospeso', description: 'Tutto quello che è aperto nei Conti: fatture da classificare o mancanti, documenti, pagamenti non abbinati, personale, bilancio.', parameters: P({}), run: inSospeso },
  { conti: true, name: 'preventivi', description: 'Confronti dei preventivi e contratti dei fornitori, con il risultato del confronto e le scadenze.', parameters: P({}), run: preventivi },
  { conti: true, name: 'personale', description: 'Costo del personale dell\'anno dalle buste paga, numero di dipendenti e irregolarità dei pagamenti (senza dati personali).', parameters: P({ anno: ANNO }), run: personale },
  { conti: true, name: 'cerca_archivio', description: 'Cerca nei documenti dell\'archivio sul PC (testo dei file e nomi). Funziona solo dal computer con il ponte dell\'archivio acceso.', parameters: P({ testo: TESTO('Parole da cercare'), anno: { type: 'integer' }, limite: { type: 'integer' } }, ['testo']), run: archivio },
];

/** Strumenti che può usare chi sta usando il dispositivo. */
export const strumentiPer = conti => STRUMENTI.filter(s => !s.conti || conti);

/** Esegue uno strumento e restituisce il testo JSON da dare al modello (mai un'eccezione: l'errore diventa testo). */
export async function esegui(nome, args, conti) {
  const s = strumentiPer(conti).find(x => x.name === nome);
  if (!s) return { ok: false, testo: JSON.stringify({ errore: 'Strumento non disponibile: ' + nome }) };
  try { const r = await s.run(args || {}); const t = JSON.stringify(compatta(r) ?? { risultato: 'nessun dato' }); return { ok: true, testo: t.length > 60000 ? t.slice(0, 60000) + '…(tagliato)' : t }; }
  catch (e) { console.warn('chiedi', nome, e); return { ok: false, testo: JSON.stringify({ errore: 'Lo strumento ha dato errore: ' + (e.message || e) }) }; }
}

/** Fatti di base messi nelle istruzioni: data, azienda, cosa c'è nell'app (così l'IA sa quali anni chiedere). */
export function contesto(conti) {
  const a = azienda(); const anniF = [...new Set(S.fatture.map(f => yearOf(f.data)).filter(Boolean))].sort();
  return {
    oggi: today(), annataScelta: UI.anno, azienda: a.nome || 'azienda agricola con vacche da latte', comune: a.comune,
    campi: S.campi.length, ettari: r2(S.campi.reduce((t, c) => t + campoHa(c), 0)), capiPresenti: S.capi.filter(c => capoI(c).stato !== 'Uscita').length, mezzi: S.mezzi.length,
    ...(conti ? { anniConFatture: anniF, anniConBilancio: S.bilanci.map(b => +b.id).filter(Boolean).sort() } : {}),
  };
}
