// Conti: valuta un terreno in zona (comprare o prendere in affitto conviene?) — calcolo in js/conti/terreni.js (dalla 1.49.0)
import { UI } from '../state.js';
import { esc, nf, N, uid, today, fd } from '../util.js';
import { ic } from '../icons.js';
import { empty, toast, arm } from '../ui.js';
import { tabella, bottoniExport, fmtVal } from '../conti/tabelle.js';
import * as T from '../conti/terreni.js';

const numIt = v => { const t = String(v ?? '').trim().replace(/\s|€/g, ''); if (!t) return ''; if (t.includes(',')) return N(t.replace(/\./g, '').replace(',', '.')); if (/^\d{1,3}(\.\d{3})+$/.test(t)) return N(t.replace(/\./g, '')); return N(t); };
const eu = v => v === null || v === undefined ? '—' : (Math.abs(v) < 0.5 ? '0 €' : fmtVal(v, 'eur'));
const kpi = (l, v, s, cls = '', icn = '') => `<div class="kpi static"><span class="k-l">${icn ? ic(icn) : ''}${esc(l)}</span><span class="k-v sm ${cls}">${v}</span><span class="k-s">${s}</span></div>`;
const SEM = { verde: ['ok', 'circle-check', 'Conviene'], giallo: ['warn', 'circle-alert', 'Da pensarci'], rosso: ['bad', 'circle-x', 'Non conviene'], manca: ['', 'circle-help', 'Mancano dati'] };
const semaforo = e => { const [c, i, t] = SEM[e] || SEM.manca; return `<span class="chip ${c}">${ic(i)} ${t}</span>`; };
const corrente = () => (UI.f.vt_id && T.valutazione(UI.f.vt_id)) || null;

/** Particella scelta sulla mappa (pulsante "Valuta" della scheda del catasto): crea una valutazione e la apre. */
export async function daParticella(p) {
  const { areaHa } = await import('../geo.js');
  const ref = (p.multi || [p]).map(x => x.ref).join(', ');
  const gia = ref && T.valutazioni().find(x => x.ref === ref);
  if (gia) { UI.f.vt_id = gia.id; return gia; }   // la stessa particella valutata prima: si riapre quella
  const v ={ id: 'vt-' + uid(), tipo: 'valutazione', nome: `${p.comune || ''} Fg. ${p.foglioTxt} mapp. ${p.particella}`.trim(), data: today(), modo: 'acquisto', comune: p.comune || '', foglio: p.foglioTxt || '', particella: p.particella || '', ref: (p.multi || [p]).map(x => x.ref).join(', '), geom: p.geom, ha: Math.round(areaHa(p.geom) * 10000) / 10000, coltura: 'seminativo', agev: true };
  await T.salva(v); UI.f.vt_id = v.id; return v;
}

export function vTerreni() {
  const v = corrente();
  return v ? scheda(v) : elenco();
}

function elenco() {
  const L = T.valutazioni();
  const nuovo = `<div class="btns"><button class="btn sm primary" data-act="c-vtNuovo" data-modo="acquisto">${ic('plus')}Valuta un acquisto</button><button class="btn sm" data-act="c-vtNuovo" data-modo="affitto">${ic('plus')}Valuta un affitto</button><button class="btn sm ghost" data-act="nav" data-tab="mappa">${ic('map')}Scegli la particella sulla mappa</button></div>`;
  const come = `<section class="card"><div class="card-h"><h2>${ic('info')}Come funziona</h2></div><div class="pad-x">
    <p>Scrivi il prezzo chiesto (o il canone d'affitto) e qualche dato del terreno. L'app lo confronta con il <b>valore di zona</b> e soprattutto con <b>quello che il terreno renderebbe alla tua azienda</b>: il margine dei tuoi campi, il vantaggio per la stalla, meno i viaggi dalla stalla e le spese dell'atto. Alla fine ti dà il <b>prezzo massimo</b> che conviene pagare e un semaforo.</p>
    <p class="muted small">Il modo più comodo: apri la <b>Mappa</b>, tocca la particella (o cercala con foglio e mappale) e premi <b>Valuta</b>: superficie, distanza e confine con i tuoi campi si calcolano da soli. I prezzi e le valutazioni restano riservati al titolare.</p></div></section>`;
  if (!L.length) return `<section class="card">${empty('landmark', 'Nessun terreno valutato', 'Valuta un terreno in vendita o in affitto in zona: ti dico se il prezzo conviene alla tua azienda.', nuovo)}</section>${come}${cardVam()}`;
  const rows = L.map(v => { const R = T.calcola(v); return { id: v.id, nome: v.nome || 'Terreno', data: v.data, modo: v.modo === 'affitto' ? 'Affitto' : 'Acquisto', coltura: T.nomeColtura(R.kc), ha: R.ha, prezzo: v.modo === 'affitto' ? R.canone : R.prezzo, prezzoHa: v.modo === 'affitto' ? N(v.canone) : R.prezzoHa, max: v.modo === 'affitto' ? R.canoneMax : R.maxConsigliato, esito: SEM[R.esito][2], _e: R.esito, conf: R.confina.length ? 'sì' : '' }; });
  const t = tabella('vtlista', {
    title: 'Terreni valutati', sheet: 'Terreni', rows,
    rowAttr: r => `data-act="c-vtApri" data-id="${r.id}" class="clk"`,
    cols: [{ k: 'nome', h: 'Terreno', html: r => `<b>${esc(r.nome)}</b>` }, { k: 'data', h: 'Data', fmt: 'date' }, { k: 'modo', h: 'Tipo' }, { k: 'coltura', h: 'Coltura' }, { k: 'ha', h: 'ha', fmt: 'num2' },
      { k: 'prezzo', h: 'Prezzo o canone', fmt: 'eur' }, { k: 'prezzoHa', h: '€/ha', fmt: 'eur' }, { k: 'max', h: 'Massimo consigliato', fmt: 'eur' }, { k: 'conf', h: 'Confina' },
      { k: 'esito', h: 'Esito', html: r => semaforo(r._e) }],
  });
  return `<section class="card"><div class="card-h"><h2>${ic('landmark')}Terreni valutati</h2><span class="count">${L.length}</span>${bottoniExport(['vtlista'], 'terreni-valutati')}</div>${nuovo.replace('<div class="btns">', '<div class="btns pad-x">')}${t}</section>${come}${cardVam()}`;
}

function cardVam() {
  const c = T.conf();
  const rows = T.COLTURE.map(x => ({ k: x.k, nome: x.nome, vam: T.vam(x.k), def: x.vam }));
  const t = tabella('vtvam', {
    title: 'Valori di zona per ettaro', sheet: 'Valori di zona', sort: false, rows,
    cols: [{ k: 'nome', h: 'Coltura', cls: 'w' }, { k: 'def', h: 'VAM 2025', fmt: 'eur' },
      { k: 'vam', h: 'Valore usato (€/ha)', fmt: 'eur', html: r => `<input class="cell-in" inputmode="decimal" data-act="c-vtVam" data-k="${r.k}" value="${esc(nf(r.vam, 0))}" aria-label="Valore per ettaro ${esc(r.nome)}" style="max-width:110px">` }],
  });
  const set = (k, l, val, u) => `<label class="fld-inline"><span>${esc(l)}</span><input class="cell-in" inputmode="decimal" data-act="c-vtConf" data-k="${k}" value="${esc(val ?? '')}" style="max-width:90px"> ${u}</label>`;
  return `<section class="card"><div class="card-h"><h2>${ic('settings')}Valori di zona e impostazioni</h2>${bottoniExport(['vtvam'], 'valori-di-zona')}</div>${t}
    <div class="pad-x"><p class="muted small">${esc(T.FONTE_VAM)}. Sono i valori ufficiali della Commissione provinciale: spesso stanno vicini ai prezzi veri, ma non sono prezzi di mercato. Se in paese senti prezzi diversi, scrivili qui e la valutazione userà i tuoi.</p>
    <div class="btns">${set('tassoRif', 'Rendimento minimo che vuoi', c.tassoRif ?? 2, '% all\'anno')}${set('notaio', 'Notaio e atto', c.notaio ?? 2500, '€')}${set('costoKm', 'Costo di un km col trattore', c.costoKm ?? T.costoKmMezzi(), '€/km')}${set('passaggi', 'Passaggi all\'anno', c.passaggi ?? 10, 'andata e ritorno')}</div>
    <p class="muted small">Rendimento minimo: la terra tiene il suo valore nel tempo, per questo si accetta un rendimento più basso di un altro investimento (2% è il valore di partenza). Costo per km: media del costo orario dei tuoi mezzi diviso 20 km/h su strada.</p></div></section>`;
}

function campo(act, k, l, val, { u = '', ph = '', w = 120, hint = '', tipo = 'decimal' } = {}) {
  return `<label class="vt-f"><span>${esc(l)}</span><span class="vt-in"><input class="inp sm" inputmode="${tipo}" data-act="${act}" data-k="${k}" value="${esc(val ?? '')}" placeholder="${esc(ph)}" style="max-width:${w}px">${u ? ` <small>${esc(u)}</small>` : ''}</span>${hint ? `<small class="muted">${hint}</small>` : ''}</label>`;
}
function scelta(k, l, val, opts) {
  return `<label class="vt-f"><span>${esc(l)}</span><select class="inp sm" data-act="c-vtSet" data-k="${k}">${opts.map(([o, t]) => `<option value="${o}"${String(val ?? '') === String(o) ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select></label>`;
}

function scheda(v) {
  const R = T.calcola(v); const aff = v.modo === 'affitto'; const mu = v.mutuo || {};
  const head = `<div class="btns"><button class="btn sm ghost" data-act="c-vtLista">${ic('chevron-left')}Tutti i terreni</button><span class="sp"></span>${semaforo(R.esito)}<button class="btn sm ghost danger" data-act="c-vtDel">${ic('trash-2')}Elimina</button></div>`;
  const dati = `<section class="card"><div class="card-h"><h2>${ic('map-pin')}Il terreno</h2></div><div class="pad-x vt-grid">
    ${campo('c-vtSet', 'nome', 'Nome', v.nome, { tipo: 'text', w: 260 })}
    ${scelta('modo', 'Cosa valuti', v.modo, [['acquisto', 'Acquisto'], ['affitto', 'Affitto']])}
    ${campo('c-vtSet', 'comune', 'Comune', v.comune, { tipo: 'text', w: 160 })}
    ${campo('c-vtSet', 'foglio', 'Foglio', v.foglio, { tipo: 'text', w: 70 })}${campo('c-vtSet', 'particella', 'Particella', v.particella, { tipo: 'text', w: 90 })}
    ${campo('c-vtNum', 'ha', 'Superficie', v.ha, { u: 'ha', w: 90, hint: v.geom ? 'presa dal catasto' : '' })}
    ${scelta('coltura', 'Coltura', v.coltura || 'seminativo', T.COLTURE.filter(x => !/_irriguo$/.test(x.k)).map(x => [x.k, x.nome]))}
    ${scelta('irriguo', 'Irrigazione', v.irriguo ? '1' : '', [['', 'Non irriguo'], ['1', 'Irriguo (consorzio o pozzo)']])}
    ${scelta('forma', 'Forma', v.forma || '', [['', 'Regolare'], ['irregolare', 'Irregolare o stretta (−5% di resa)']])}
    ${scelta('accesso', 'Accesso', v.accesso || '', [['', 'Buono'], ['scomodo', 'Scomodo per i mezzi (−10% di resa)']])}
  </div></section>`;
  const prezzo = aff
    ? `${campo('c-vtNum', 'canone', 'Canone chiesto', v.canone, { u: '€/ha all\'anno', w: 110 })}`
    : `${campo('c-vtNum', 'prezzo', 'Prezzo chiesto', v.prezzo, { u: '€ in tutto', w: 130, hint: R.ha && R.prezzo ? nf(R.prezzoHa, 0) + ' €/ha' : '' })}
       ${scelta('agev', 'Compri come', v.agev ? '1' : '', [['1', 'Coltivatore diretto o IAP (piccola proprietà contadina)'], ['', 'Senza agevolazioni']])}
       ${campo('c-vtNum', 'mediazione', 'Mediatore', v.mediazione, { u: '% del prezzo', w: 70, ph: '0' })}`;
  const mc = R.margineCampi;
  const resa = `<section class="card"><div class="card-h"><h2>${ic('euro')}${aff ? 'Canone e resa' : 'Prezzo e resa'}</h2></div><div class="pad-x vt-grid">
    ${prezzo}
    ${campo('c-vtNum', 'margine', 'Margine della coltura', v.margine, { u: '€/ha all\'anno', w: 100, ph: mc ? nf(mc.ha, 0) : '', hint: mc ? `vuoto = media dei tuoi campi (${nf(mc.ha, 0)} €/ha, ${mc.n} raccolti degli ultimi 3 anni)` : 'ricavi meno costi di semina, concimi, trattamenti, lavori. Nei tuoi campi non ci sono ricavi segnati' })}
    ${campo('c-vtNum', 'stalla', 'Vantaggio per la stalla', v.stalla, { u: '€/ha all\'anno', w: 100, ph: '0', hint: 'foraggio che non compri più, liquame che puoi spandere invece di cederlo' })}
    ${campo('c-vtNum', 'km', 'Distanza dalla stalla', v.km, { u: 'km su strada', w: 80, ph: R.kmCalc !== null ? nf(R.kmCalc, 1) : '', hint: R.kmCalc !== null ? 'vuoto = calcolata dalla mappa' : '' })}
    ${campo('c-vtNum', 'passaggi', 'Passaggi all\'anno', v.passaggi, { w: 70, ph: nf(R.passaggi, 0) })}
    ${campo('c-vtNum', 'altre', 'Altre spese', v.altre, { u: '€ all\'anno', w: 100, ph: '0', hint: 'IMU (se non sei coltivatore diretto), consorzio di bonifica, manutenzione fossi' })}
  </div></section>`;
  const mutuo = aff ? '' : `<section class="card"><div class="card-h"><h2>${ic('landmark')}Mutuo (se serve)</h2></div><div class="pad-x vt-grid">
    ${campo('c-vtMutuo', 'quota', 'Quanto finanzi', mu.quota, { u: '% del costo', w: 70, ph: '0' })}${campo('c-vtMutuo', 'tasso', 'Tasso', mu.tasso, { u: '% all\'anno', w: 70 })}${campo('c-vtMutuo', 'anni', 'Durata', mu.anni, { u: 'anni', w: 60 })}
    ${R.mutuo ? `<p>Rata annua circa <b>${eu(R.mutuo.rata)}</b> su ${eu(R.mutuo.F)} per ${nf(R.mutuo.anni, 0)} anni. ${R.cassa !== undefined ? (R.cassa >= 0 ? `Il terreno paga la rata e avanza <b class="t-ok">${eu(R.cassa)}</b> all'anno.` : `Il reddito del terreno non basta a pagare la rata: mancano <b class="t-bad">${eu(-R.cassa)}</b> all'anno, da coprire con il resto dell'azienda.`) : ''}</p>` : ''}
  </div></section>`;
  return head + risultato(v, R) + dati + resa + mutuo + note(v) + dettaglio(v, R);
}

function risultato(v, R) {
  const aff = v.modo === 'affitto';
  const conf = R.confina.length ? `<p>${ic('grid-2x2')} <b>Confina con ${R.confina.length === 1 ? 'il tuo campo' : 'i tuoi campi'} ${R.confina.map(c => esc(c.nome || '')).join(', ')}</b>: accorpare vale di più (meno spostamenti, lavori più veloci)${aff ? '' : ' e da confinante coltivatore diretto hai il <b>diritto di prelazione</b> se il terreno non è affittato a un altro coltivatore'}.</p>` : '';
  const av = R.avvisi.length ? `<div class="note-box warn">${ic('triangle-alert')}<span>${R.avvisi.map(esc).join(' ')}</span></div>` : '';
  if (aff) {
    const kp = `<div class="kpis">${kpi('Canone chiesto', eu(R.canone), N(v.canone) ? nf(N(v.canone), 0) + ' €/ha all\'anno' : 'scrivi il canone', '', 'receipt')}${kpi('Canone massimo', eu(R.canoneMax), R.canoneMaxHa !== null ? nf(R.canoneMaxHa, 0) + ' €/ha: oltre ci rimetti' : 'serve il margine', '', 'scale')}${kpi('Ti resta all\'anno', eu(R.netto), 'reddito meno canone', R.netto < 0 ? 't-bad' : 't-ok', 'wallet')}${kpi('Canone sul valore', R.canoneSuZona !== null ? nf(R.canoneSuZona, 1) + '%' : '—', 'del valore di zona all\'anno', '', 'percent')}</div>`;
    const frase = R.esito === 'manca' ? '' : R.netto >= 0 ? `<p>Con un canone di <b>${eu(R.canone)}</b> il terreno ti lascia <b class="t-ok">${eu(R.netto)}</b> all'anno. Il canone più alto che puoi pagare senza rimetterci è <b>${eu(R.canoneMax)}</b> (${nf(R.canoneMaxHa, 0)} €/ha).</p>` : `<p>Con un canone di <b>${eu(R.canone)}</b> ci rimetti <b class="t-bad">${eu(-R.netto)}</b> all'anno. Il canone più alto che puoi pagare senza rimetterci è <b>${eu(R.canoneMax)}</b> (${nf(R.canoneMaxHa, 0)} €/ha).</p>`;
    return kp + `<section class="card"><div class="card-h"><h2>${ic('scale')}In breve</h2>${semaforo(R.esito)}</div><div class="pad-x">${av}${frase}${conf}<p class="muted small">Di solito in zona il canone sta fra l'1% e il 2% del valore del terreno all'anno.</p></div></section>`;
  }
  const kp = `<div class="kpis">${kpi('Prezzo chiesto', eu(R.prezzo), R.ha ? nf(R.prezzoHa, 0) + ' €/ha' : '', '', 'receipt')}${kpi('Valore di zona', eu(R.zona), nf(R.vamHa, 0) + ' €/ha · ' + esc(T.nomeColtura(R.kc)), '', 'map')}${kpi('Prezzo massimo consigliato', eu(R.maxConsigliato), R.confina.length ? 'confina: fino al valore di zona' : 'si ripaga con il reddito', R.esito === 'rosso' ? 't-bad' : '', 'scale')}${kpi('Rendimento', R.rendimento !== null ? nf(R.rendimento, 1) + '%' : '—', R.anni ? 'si ripaga in ' + nf(R.anni, 0) + ' anni' : 'all\'anno sul costo', R.rendimento !== null && R.rendimento < R.tassoRif ? 't-bad' : '', 'percent')}</div>`;
  let frase = '';
  if (R.esito !== 'manca') {
    const sz = R.suZona !== null ? (R.suZona > 1.05 ? `il <b>${nf((R.suZona - 1) * 100, 0)}% sopra</b> il valore di zona` : R.suZona < 0.95 ? `il <b>${nf((1 - R.suZona) * 100, 0)}% sotto</b> il valore di zona` : '<b>in linea</b> con il valore di zona') : '';
    frase = `<p>Il prezzo chiesto è ${sz}. Con le spese dell'atto il terreno ti costa <b>${eu(R.costo)}</b> e ti rende circa <b>${eu(R.reddito)}</b> all'anno: il <b>${nf(R.rendimento, 1)}%</b>${R.rendimento < R.tassoRif ? `, meno del ${nf(R.tassoRif, 1)}% che vuoi` : ''}.</p>
    <p>${R.esito === 'verde' ? `${ic('circle-check')} <b>Conviene.</b> ` : R.esito === 'giallo' ? `${ic('circle-alert')} <b>Da pensarci.</b> ` : `${ic('circle-x')} <b>Non conviene a questo prezzo.</b> `}Per avere almeno il ${nf(R.tassoRif, 1)}% dal reddito il prezzo non dovrebbe superare <b>${eu(R.maxReddito)}</b> (${R.ha ? nf(R.maxReddito / R.ha, 0) : '—'} €/ha).${R.confina.length && R.zona > R.maxReddito ? ` Visto che confina, puoi arrivare fino al valore di zona, <b>${eu(R.zona)}</b>.` : ''}${R.prezzo > R.maxConsigliato ? ` Da trattare: <b>${eu(R.prezzo - R.maxConsigliato)}</b> in meno.` : ''}</p>`;
  }
  return kp + `<section class="card"><div class="card-h"><h2>${ic('scale')}In breve</h2>${semaforo(R.esito)}</div><div class="pad-x">${av}${frase}${conf}<p class="muted small">Quasi sempre in Italia la terra si vende a prezzi più alti di quello che rende con le colture: chi compra conta anche sul valore che resta nel tempo. Per questo, se il terreno confina o ti serve per la stalla, un rendimento sotto il minimo può essere accettabile. È una stima: imposte e spese dell'atto vanno confermate dal notaio.</p></div></section>`;
}

function note(v) {
  return `<section class="card"><div class="card-h"><h2>${ic('pencil')}Note</h2></div><div class="pad-x"><textarea class="inp" rows="3" data-act="c-vtSet" data-k="note" placeholder="Chi vende, cosa hai sentito in paese, vincoli del piano regolatore, Natura 2000, affitti in corso…">${esc(v.note || '')}</textarea></div></section>`;
}

function dettaglio(v, R) {
  const aff = v.modo === 'affitto'; const rows = [];
  const r = (voce, imp, note = '') => rows.push({ voce, imp, note });
  if (R.campo !== null) r('Margine della coltura', R.campo, `${nf(R.margine, 0)} €/ha × ${nf(R.ha, 2)} ha${R.corr ? ` − ${nf(R.corr * 100, 0)}% per forma o accesso` : ''}`);
  if (R.stalla) r('Vantaggio per la stalla', R.stalla, `${nf(N(v.stalla), 0)} €/ha`);
  if (R.viaggi) r('Viaggi dalla stalla', -R.viaggi, `${nf(R.km, 1)} km × 2 × ${nf(R.passaggi, 0)} passaggi × ${nf(T.costoKm(), 2)} €/km`);
  if (R.altre) r('Altre spese', -R.altre, '');
  if (R.reddito !== null) r('Reddito del terreno all\'anno', R.reddito, aff ? 'prima del canone' : '');
  if (aff && R.canone) r('Canone', -R.canone, `${nf(N(v.canone), 0)} €/ha`);
  if (!aff && R.prezzo) {
    r('Prezzo', R.prezzo, ''); r('Imposte dell\'atto', R.spese.imposte, v.agev ? 'registro e ipotecaria fisse, catastale 1%' : 'registro 15%, ipotecaria e catastale fisse');
    r('Notaio', R.spese.notaio, 'stima, si cambia sotto'); if (R.spese.mediazione) r('Mediatore', R.spese.mediazione, nf(N(v.mediazione), 1) + '%');
    r('Costo totale', R.costo, '');
  }
  const t = tabella('vtdett', { title: 'Valutazione ' + (v.nome || ''), sheet: 'Valutazione', sort: false, rows,
    cols: [{ k: 'voce', h: 'Voce', cls: 'w' }, { k: 'imp', h: 'Importo', fmt: 'eur', html: x => `<span class="${x.imp < 0 ? 't-bad' : ''}">${esc(eu(x.imp))}</span>` }, { k: 'note', h: 'Come si calcola' }] });
  return `<section class="card"><div class="card-h"><h2>${ic('list')}Il conto voce per voce</h2>${bottoniExport(['vtdett'], 'valutazione-terreno')}</div>${t}</section>`;
}

export async function terreniAct(a, b, d, rerender) {
  const v = corrente();
  switch (a) {
    case 'c-vtNuovo': { const n = { id: 'vt-' + uid(), tipo: 'valutazione', nome: d.modo === 'affitto' ? 'Terreno in affitto' : 'Terreno in vendita', data: today(), modo: d.modo || 'acquisto', coltura: 'seminativo', agev: d.modo !== 'affitto' }; await T.salva(n); UI.f.vt_id = n.id; rerender(); return window.scrollTo(0, 0); }
    case 'c-vtApri': UI.f.vt_id = d.id; rerender(); return window.scrollTo(0, 0);
    case 'c-vtLista': UI.f.vt_id = ''; rerender(); return window.scrollTo(0, 0);
    case 'c-vtDel': return v && arm(b, 'Conferma: elimina', async () => { const { remove } = await import('../store.js'); await remove('econfig', v.id); UI.f.vt_id = ''; toast('Valutazione eliminata'); rerender(); });
  }
}

export async function terreniChange(t, rerender) {
  const a = t.dataset.act, k = t.dataset.k, raw = String(t.value ?? '').trim();
  if (a === 'c-vtVam') { const p = Object.assign({}, T.conf().vam || {}); const n = numIt(raw); if (n === '') delete p[k]; else p[k] = n; await T.salvaConf({ vam: p }); toast('Valore salvato'); return rerender(); }
  if (a === 'c-vtConf') { await T.salvaConf({ [k]: numIt(raw) === '' ? null : numIt(raw) }); toast('Salvato'); return rerender(); }
  const v = corrente(); if (!v) return;
  if (a === 'c-vtSet') { const val = ['irriguo', 'agev'].includes(k) ? raw === '1' : raw; await T.salva(Object.assign({}, v, { [k]: val })); return rerender(); }
  if (a === 'c-vtNum') { await T.salva(Object.assign({}, v, { [k]: numIt(raw) })); return rerender(); }
  if (a === 'c-vtMutuo') { await T.salva(Object.assign({}, v, { mutuo: Object.assign({}, v.mutuo || {}, { [k]: numIt(raw) }) })); return rerender(); }
}
