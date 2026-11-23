// Pagina "Notizie e mercati" (dalla 1.71.0): schede Rassegna (la pagina del giorno con riassunto, analisi e prospettive),
// Mercati (grafici dei prezzi del latte e delle materie prime, legami fra le serie, analisi) e Portali (quelli da leggere).
// Dati e azioni in js/notizie.js; lettori e calcoli in supabase/functions/_shared/mercati.js. Azioni nz-* (nzAct, da app.js).
import { S, UI, bus } from '../state.js';
import { esc, nf, fd, fdLong, today } from '../util.js';
import { ic } from '../icons.js';
import { toast, arm, tabs, empty, openSheet, closeSheet } from '../ui.js';
import * as store from '../store.js';
import { sync } from '../store.js';
import { contiVisibili } from './conti.js';
import { linee, PALETTE } from '../conti/grafici.js';
import { tabella, bottoniExport } from '../conti/tabelle.js';
import * as N from '../notizie.js';
import { ARGOMENTI, SERIE, meseIt, mesiFra, andamento, latteSuMangime, MIX } from '../../supabase/functions/_shared/mercati.js';

const SCHEDE = [['panoramica', 'Panoramica'], ['rassegna', 'Rassegna'], ['mercati', 'Prezzi e grafici'], ['portali', 'Portali']];
const sub = () => (SCHEDE.some(s => s[0] === UI.sub.notizie) ? UI.sub.notizie : 'panoramica');
const ora = iso => { const d = new Date(iso); return isNaN(d) ? '' : fd(iso.slice(0, 10)) + ' alle ' + d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }); };
const pct = v => (v == null ? '' : `<span class="${v > 0 ? 'nz-su' : v < 0 ? 'nz-giu' : 'muted'}">${v > 0 ? '+' : ''}${nf(v, 1)}%</span>`);
const testo = s => esc(s || '').replace(/\n{2,}/g, '</p><p>').replace(/\n/g, '<br>');
const sicuro = u => (/^https?:\/\//i.test(String(u || '')) ? String(u) : '#');   // niente javascript: nei link salvati
const sito = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return u; } };

export function render() {
  const s = sub();
  const corpo = s === 'mercati' ? mercati() : s === 'portali' ? portali() : s === 'rassegna' ? rassegna() : panoramica();
  return { title: 'Notizie e mercati', html: tabs('notizie', SCHEDE, s) + corpo };
}

/* ================= rassegna ================= */

function barraPagina(pp, p) {
  const i = pp.indexOf(p);
  const prec = pp[i + 1], succ = pp[i - 1];
  return `<div class="nz-bar">
    <button class="btn sm ghost" data-act="nz-giorno" data-g="${prec ? prec.id : ''}"${prec ? '' : ' disabled'} aria-label="Giorno prima">${ic('chevron-left')}</button>
    <select class="nz-sel" data-nz="nz-sceltaGiorno" aria-label="Scegli il giorno">${pp.slice(0, 60).map(x => `<option value="${x.id}"${x.id === p.id ? ' selected' : ''}>${esc(fdLong(x.id))}</option>`).join('')}</select>
    <button class="btn sm ghost" data-act="nz-giorno" data-g="${succ ? succ.id : ''}"${succ ? '' : ' disabled'} aria-label="Giorno dopo">${ic('chevron-right')}</button>
    <span class="sp"></span>
    ${azioniAggiorna(p)}
  </div>`;
}
function azioniAggiorna(p) {
  const online = !!(sync.farm && store.cloudReady());
  return `${online ? `<button class="btn sm" data-act="nz-aggiorna">${ic('refresh-cw')}Aggiorna adesso</button>` : ''}
    ${p && N.pcConfigurato() && (p.articoli || []).length ? `<button class="btn sm ghost" data-act="nz-pc" data-g="${p.id}">${ic('cpu')}${p.motore === 'claude' ? 'Seconda opinione (IA del PC)' : 'Riassunto con l\'IA del PC'}</button>` : ''}`;
}
function articoloHTML(a) {
  const imp = a.importanza === 'alta' ? '<span class="chip warn">Importante</span>' : '';
  return `<li class="nz-art"><a href="${esc(sicuro(a.link))}" target="_blank" rel="noopener noreferrer">${esc(a.titolo)}${ic('external-link', 'nz-ext')}</a>
    <div class="nz-meta">${esc(a.fonte || sito(a.link))}${a.data ? ' · ' + esc(fd(a.data.slice(0, 10))) : ''} ${imp}</div>
    ${a.sintesi ? `<p>${esc(a.sintesi)}</p>` : ''}</li>`;
}
function contenuto(c, motore) {
  if (!c || !(c.argomenti || []).length && !c.analisi) return '';
  return `${c.titolo || c.sintesi ? `<section class="card nz-sintesi">${c.titolo ? `<h2>${esc(c.titolo)}</h2>` : ''}${c.sintesi ? `<p>${testo(c.sintesi)}</p>` : ''}</section>` : ''}
  ${(c.argomenti || []).map(g => `<section class="card"><div class="card-h"><h2>${ic('newspaper')}${esc(g.nome)}</h2><span class="chip num">${g.articoli.length}</span></div>
    ${g.riassunto ? `<p class="nz-rias">${testo(g.riassunto)}</p>` : ''}<ul class="nz-arts">${g.articoli.map(articoloHTML).join('')}</ul></section>`).join('')}
  ${c.analisi ? `<section class="card"><div class="card-h"><h2>${ic('lightbulb')}Cosa vuol dire per noi</h2></div><p>${testo(c.analisi)}</p></section>` : ''}
  ${(c.prospettive || []).length ? `<section class="card"><div class="card-h"><h2>${ic('telescope')}Prospettive</h2></div><ul class="nz-punti">${c.prospettive.map(x => `<li>${esc(x)}</li>`).join('')}</ul></section>` : ''}
  ${c.mercati ? analisiMercati(c.mercati) : ''}
  <p class="muted small">Scritto da ${motore === 'pc' ? 'l\'IA del PC' : 'Claude'}${c.modello ? ' (' + esc(c.modello) + ')' : ''}: è un riassunto automatico, per le decisioni leggi l'articolo originale.</p>`;
}
function analisiMercati(m) {
  return `<section class="card"><div class="card-h"><h2>${ic('trending-up')}Mercati</h2><button class="btn sm ghost" data-act="sub" data-sec="notizie" data-sub="mercati">Grafici${ic('chevron-right')}</button></div>
    ${m.commento ? `<p>${testo(m.commento)}</p>` : ''}${m.correlazioni ? `<p>${testo(m.correlazioni)}</p>` : ''}
    ${(m.idee || []).length ? `<h3 class="nz-h3">Idee</h3><ul class="nz-punti">${m.idee.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}</section>`;
}

function rassegna() {
  if (!S.fonti.length) return `<section class="card">${empty('rss', 'Nessun portale da leggere', 'Ogni mattina l\'app legge i portali scelti, tiene gli articoli nuovi e scrive il riassunto con l\'analisi. Comincia con i portali consigliati (CLAL, Teseo, Ruminantia e altri sei), poi aggiungi o togli quelli che vuoi.', `<button class="btn primary" data-act="nz-consigliate">${ic('plus')}Aggiungi i portali consigliati</button>`)}</section>`;
  const pp = N.pagine();
  if (!pp.length) return `<section class="card">${empty('newspaper', 'La prima rassegna non c\'è ancora', sync.farm ? 'La prima pagina arriva domattina, oppure premi "Aggiorna adesso" (ci vuole un minuto o due).' : 'Per leggere i portali ogni mattina serve la sincronizzazione online (La mia azienda → Sincronizzazione).', azioniAggiorna(null))}</section>`;
  const p = pp.find(x => x.id === UI.f.nz_g) || pp[0];
  const art = p.articoli || [];
  let html = barraPagina(pp, p);
  if (p.motore === 'claude' || p.motore === 'pc') html += contenuto(p, p.motore);
  else {
    html += `<section class="card nz-avviso"><p>${p.erroreIA ? `Il riassunto non è riuscito: ${esc(p.erroreIA)}.` : 'Per oggi ci sono gli articoli ma non il riassunto: su Supabase manca la chiave di Claude (vedi LEGGIMI, "Rassegna e mercati: collegare Supabase").'} ${N.pcConfigurato() ? 'Puoi farlo con l\'IA del PC.' : ''}</p></section>`;
    if (art.length) html += `<section class="card"><div class="card-h"><h2>${ic('newspaper')}Articoli nuovi</h2><span class="chip num">${art.length}</span></div><ul class="nz-arts">${art.map(a => articoloHTML(Object.assign({}, a, { sintesi: (a.testo || '').slice(0, 220) + ((a.testo || '').length > 220 ? '…' : '') }))).join('')}</ul></section>`;
  }
  if (p.secondo) html += `<details class="card nz-secondo"><summary>${ic('cpu')}Seconda opinione dell'IA del PC</summary>${contenuto(p.secondo, 'pc')}</details>`;
  const err = Object.entries(p.erroriFonti || {});
  html += `<p class="muted small">Pagina del ${esc(fdLong(p.id))}${p.creato ? ', fatta il ' + esc(ora(p.creato)) : ''} · ${art.length} articoli nuovi${contiVisibili() && p.costo ? ' · costo di Claude circa ' + nf(p.costo, 3) + ' $' : ''}${err.length ? ` · non letti: ${err.map(([n, e]) => esc(n) + ' (' + esc(e) + ')').join(', ')}` : ''}</p>`;
  return html;
}

/* ================= mercati ================= */

function serieGrafico(ids, mesi, extra = []) {
  const ser = ids.map((id, i) => ({ id, s: SERIE.find(x => x.id === id), m: N.mesiDi(id), c: PALETTE[i % PALETTE.length] })).filter(x => Object.keys(x.m).length);
  for (const e of extra) ser.push(e);
  return ser.map(x => ({ name: x.s ? x.s.nome : x.nome, color: x.c, values: mesi.map(k => x.m[k] ?? null) }));
}
function grafico(titolo, icona, ids, unita, { extra = [], nota = '', mesiFissi = 0 } = {}) {
  const per = mesiFissi || Number(UI.f.nz_per) || 36;
  const fine = today().slice(0, 7);
  const [y, m] = fine.split('-').map(Number); const d = new Date(Date.UTC(y, m - per, 1));
  const mesi = mesiFra(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`, fine);
  const series = serieGrafico(ids, mesi, extra);
  if (!series.length) return '';
  return `<section class="card"><div class="card-h"><h2>${ic(icona)}${esc(titolo)}</h2><span class="muted small">${esc(unita)}</span></div>
    ${linee(mesi.map(meseIt), series, { h: 240, unit: unita, ogni: per > 36 ? 12 : per > 18 ? 6 : 3, fmt: v => nf(v, Math.abs(v) < 10 ? 2 : 0) })}${nota ? `<p class="muted small">${nota}</p>` : ''}</section>`;
}

function mercati() {
  if (!S.mercati.length) return `<section class="card">${empty('trending-up', 'Nessun prezzo ancora', 'I prezzi del latte, dei mangimi, dei concimi e del gasolio arrivano ogni mattina insieme alla rassegna (servono la sincronizzazione online e la funzione "rassegna" su Supabase).', azioniAggiorna(null))}</section>`;
  const R = N.riepilogoOra(true);
  const proprio = N.prezzoProprio();
  const per = Number(UI.f.nz_per) || 36;
  const scelta = `<div class="nz-bar"><span class="muted small">Periodo</span>${[[12, '1 anno'], [36, '3 anni'], [60, '5 anni'], [120, '10 anni']].map(([v, l]) => `<button class="btn sm ${per === v ? 'primary' : 'ghost'}" data-act="nz-per" data-v="${v}">${l}</button>`).join('')}</div>`;

  // numeri in alto
  const kpi = R.prezzi.filter(p => p.id !== 'proprio').map(p => `<div class="kpi"><span class="k-l">${esc(p.nome)}</span><span class="k-v">${nf(p.andamento.valore, p.andamento.valore < 10 ? 3 : 2)}<small>${esc(p.unita)}</small></span><span class="k-c">${esc(meseIt(p.andamento.mese))} · mese ${pct(p.andamento.suMese)} · anno ${pct(p.andamento.suAnno)}</span></div>`).join('');
  const kp = proprio ? (() => { const a = andamento(proprio.mesi); return a ? `<div class="kpi"><span class="k-l">Il tuo latte (fatture)</span><span class="k-v">${nf(a.valore, 2)}<small>€/100 l</small></span><span class="k-c">${esc(meseIt(a.mese))} · mese ${pct(a.suMese)} · anno ${pct(a.suAnno)} · solo titolare</span></div>` : ''; })() : '';

  const extraLatte = proprio ? [{ nome: 'Il tuo latte (fatture)', m: proprio.mesi, c: 'var(--ink, #222)' }] : [];
  const lsm = (() => {
    const l = N.mesiDi('latte-lomb'), ma = N.mesiDi('mais'), so = N.mesiDi('soia');
    const out = [{ nome: 'Latte Lombardia', m: latteSuMangime(l, ma, so), c: PALETTE[0] }];
    if (proprio) out.push({ nome: 'Il tuo latte', m: latteSuMangime(proprio.mesi, ma, so), c: PALETTE[2] });
    return out;
  })();

  // legami: cosa anticipa il prezzo alla stalla
  const legami = R.legami.map(l => ({ da: l.da, a: l.a, ritardo: l.ritardo, forza: l.forza, r: l.r, n: l.n }));
  const tabLegami = legami.length ? tabella('nzLegami', {
    title: 'Cosa anticipa il prezzo del latte', cols: [
      { k: 'da', h: 'Serie' }, { k: 'a', h: 'Anticipa' }, { k: 'ritardo', h: 'Mesi prima', fmt: 'int' }, { k: 'forza', h: 'Legame' }, { k: 'r', h: 'Correlazione', fmt: 'n2' }, { k: 'n', h: 'Mesi in comune', fmt: 'int' }],
    rows: legami,
  }) : '<p class="muted">Servono almeno 12 mesi in comune per calcolare i legami.</p>';

  // tabella dei prezzi mese per mese (esportabile)
  const fine = today().slice(0, 7); const [y, m] = fine.split('-').map(Number); const d0 = new Date(Date.UTC(y, m - per, 1));
  const mesi = mesiFra(`${d0.getUTCFullYear()}-${String(d0.getUTCMonth() + 1).padStart(2, '0')}`, fine).reverse();
  const colSerie = SERIE.filter(s => N.serieDi(s.id));
  const righe = mesi.map(k => { const r = { mese: meseIt(k), _k: k }; for (const s of colSerie) r[s.id] = N.mesiDi(s.id)[k] ?? null; if (proprio) r.proprio = proprio.mesi[k] ?? null; return r; }).filter(r => colSerie.some(s => r[s.id] != null) || r.proprio != null);
  const tabPrezzi = tabella('nzPrezzi', {
    title: 'Prezzi mese per mese', sheet: 'Prezzi', sort: false,
    cols: [{ k: 'mese', h: 'Mese' }, ...colSerie.map(s => ({ k: s.id, h: `${s.nome} (${s.unita})`, fmt: 'n2' })), ...(proprio ? [{ k: 'proprio', h: 'Il tuo latte (€/100 l)', fmt: 'n2' }] : [])],
    rows: righe,
  });

  const ultima = N.pagine().find(p => p.mercati && (p.motore === 'claude' || p.motore === 'pc'));
  const fonti = colSerie.map(s => { const r = N.serieDi(s.id); return `<li><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.nome)}</a> — ${esc(s.fonte)}${r && r.aggiornato ? ' · letto il ' + esc(ora(r.aggiornato)) : ''}</li>`; }).join('');

  return `${scelta}
  <div class="kpis nz-kpis">${kp}${kpi}</div>
  ${grafico('Prezzo del latte', 'milk', ['latte-lomb', 'latte-spot', 'latte-ue'], '€/100 l', { extra: extraLatte, nota: 'Lombardia e media UE: prezzo alla stalla (la media UE è per 100 kg, circa il 3% in meno che per 100 litri). Spot: latte venduto senza contratto, si muove prima e di più.' + (proprio ? ' Il tuo latte: imponibile della fattura diviso i litri (con premi), lo vedi solo tu.' : '') })}
  ${grafico('Alimenti e foraggi', 'wheat', ['mais', 'soia', 'orzo', 'fieno'], '€/t')}
  ${grafico('Concimi', 'leaf', ['urea'], '€/t')}
  ${grafico('Gasolio agricolo', 'fuel', ['gasolio'], '€/l', { nota: 'Media mensile del listino di Milano.' })}
  ${grafico('Quanto mangime paga un litro di latte', 'scale', [], 'kg/l', { extra: lsm, nota: `Kg di un mangime indicativo (${nf(MIX.mais * 100, 0)}% mais e ${nf(MIX.soia * 100, 0)}% farina di soia, prezzi di Bologna) che si comprano con un litro di latte. Più alto è, meglio va la stalla. Non è la tua razione: serve a vedere la tendenza.` })}
  <section class="card"><div class="card-h"><h2>${ic('git-compare')}Legami fra i prezzi</h2></div>
    <p class="muted small">Si confrontano le variazioni da un mese all'altro, non i prezzi: due prezzi che salgono tutti e due col tempo sembrerebbero legati anche se non lo sono. "Mesi prima" = di quanti mesi la serie anticipa il prezzo alla stalla; legame forte da 0,6 in su, medio da 0,35. Un legame non è una certezza.${proprio && Object.keys(proprio.mesi).length >= 12 ? ' Il confronto è con il tuo prezzo delle fatture.' : ''}</p>
    ${tabLegami}${legami.length ? bottoniExport(['nzLegami'], 'legami-prezzi') : ''}</section>
  ${ultima ? `<p class="muted small nz-da">Analisi della rassegna del ${esc(fdLong(ultima.id))}:</p>${analisiMercati(ultima.mercati)}` : ''}
  <section class="card"><div class="card-h"><h2>${ic('table')}Prezzi mese per mese</h2></div>${tabPrezzi}${bottoniExport(['nzPrezzi'], 'prezzi-mercato')}</section>
  <section class="card"><div class="card-h"><h2>${ic('link')}Da dove vengono i prezzi</h2></div><ul class="nz-fonti">${fonti}</ul>
    <p class="muted small">Pagine pubbliche di CLAL e Teseo, che riportano i listini delle Borse merci e delle Camere di commercio. I futures sul latte (borsa EEX) non hanno prezzi pubblici gratuiti giorno per giorno: per questo qui non ci sono.</p></section>`;
}

/* ================= panoramica (pagina iniziale dell'area) ================= */

function kpiProprio(proprio) {
  const a = proprio && andamento(proprio.mesi);
  return a ? `<div class="kpi"><span class="k-l">Il tuo latte (fatture)</span><span class="k-v">${nf(a.valore, 2)}<small>€/100 l</small></span><span class="k-c">${esc(meseIt(a.mese))} · mese ${pct(a.suMese)} · anno ${pct(a.suAnno)} · solo titolare</span></div>` : '';
}
function seriePerLitro(proprio) {
  const l = N.mesiDi('latte-lomb'), ma = N.mesiDi('mais'), so = N.mesiDi('soia');
  const out = [{ nome: 'Latte Lombardia', m: latteSuMangime(l, ma, so), c: PALETTE[0] }];
  if (proprio) out.push({ nome: 'Il tuo latte', m: latteSuMangime(proprio.mesi, ma, so), c: PALETTE[2] });
  return out;
}

function panoramica() {
  if (!S.fonti.length && !S.mercati.length) return rassegna();
  const pp = N.pagine(), p = pp[0];
  const proprio = N.prezzoProprio();
  const R = S.mercati.length ? N.riepilogoOra(true) : null;
  const scelti = ['latte-lomb', 'latte-spot', 'latte-ue', 'mais', 'soia', 'urea'];
  const kpi = R ? kpiProprio(proprio) + R.prezzi.filter(x => scelti.includes(x.id)).map(x => `<div class="kpi"><span class="k-l">${esc(x.nome)}</span><span class="k-v">${nf(x.andamento.valore, 2)}<small>${esc(x.unita)}</small></span><span class="k-c">${esc(meseIt(x.andamento.mese))} · anno ${pct(x.andamento.suAnno)}</span></div>`).join('') : '';
  const fatto = p && (p.motore === 'claude' || p.motore === 'pc');
  const importanti = fatto ? (p.argomenti || []).flatMap(g => g.articoli).filter(a => a.importanza === 'alta').slice(0, 5) : [];
  const legami = R ? R.legami.filter(l => l.r != null).sort((a, b) => b.r - a.r).slice(0, 3) : [];
  const m = (pp.find(x => x.mercati && (x.motore === 'claude' || x.motore === 'pc')) || {}).mercati;

  return `${p ? `<section class="card nz-sintesi"><div class="card-h"><h2>${ic('newspaper')}${esc(fatto && p.titolo ? p.titolo : 'Rassegna del ' + fdLong(p.id))}</h2><button class="btn sm ghost" data-act="sub" data-sec="notizie" data-sub="rassegna">Leggi tutto${ic('chevron-right')}</button></div>
      <p class="muted small">${esc(fdLong(p.id))} · ${(p.articoli || []).length} articoli nuovi</p>
      ${fatto && p.sintesi ? `<p>${testo(p.sintesi)}</p>` : '<p class="muted">Il riassunto di oggi non c’è ancora.</p>'}
      ${importanti.length ? `<h3 class="nz-h3">Da non perdere</h3><ul class="nz-arts">${importanti.map(articoloHTML).join('')}</ul>` : ''}</section>` : `<section class="card">${empty('newspaper', 'La prima rassegna non c’è ancora', 'Arriva domattina, oppure apri Rassegna e premi "Aggiorna adesso".')}</section>`}
  ${kpi ? `<div class="kpis nz-kpis">${kpi}</div>` : ''}
  ${R ? grafico('Prezzo del latte', 'milk', ['latte-lomb', 'latte-spot', 'latte-ue'], '€/100 l', { mesiFissi: 24, extra: proprio ? [{ nome: 'Il tuo latte (fatture)', m: proprio.mesi, c: 'var(--ink, #222)' }] : [] }) : ''}
  ${R ? grafico('Mais e soia', 'wheat', ['mais', 'soia'], '€/t', { mesiFissi: 24 }) : ''}
  ${R ? grafico('Quanto mangime paga un litro di latte', 'scale', [], 'kg/l', { mesiFissi: 24, extra: seriePerLitro(proprio), nota: 'Più alto è, meglio va la stalla.' }) : ''}
  ${fatto && p.analisi ? `<section class="card"><div class="card-h"><h2>${ic('lightbulb')}Cosa vuol dire per noi</h2></div><p>${testo(p.analisi)}</p></section>` : ''}
  ${fatto && (p.prospettive || []).length ? `<section class="card"><div class="card-h"><h2>${ic('telescope')}Prospettive</h2></div><ul class="nz-punti">${p.prospettive.map(x => `<li>${esc(x)}</li>`).join('')}</ul></section>` : ''}
  ${m ? analisiMercati(m) : ''}
  ${legami.length ? `<section class="card"><div class="card-h"><h2>${ic('git-compare')}Cosa anticipa il prezzo del latte</h2><button class="btn sm ghost" data-act="sub" data-sec="notizie" data-sub="mercati">Tutti i grafici${ic('chevron-right')}</button></div>
    <ul class="nz-punti">${legami.map(l => `<li><b>${esc(l.da)}</b>: ${l.ritardo ? `di solito si muove ${l.ritardo} ${l.ritardo === 1 ? 'mese' : 'mesi'} prima` : 'si muove insieme'} — legame ${esc(l.forza)} (${nf(l.r, 2)}, ${l.n} mesi)</li>`).join('')}</ul></section>` : ''}`;
}

/* ================= portali ================= */

function portali() {
  const ff = [...S.fonti].sort((a, b) => (a.argomento || '').localeCompare(b.argomento || '') || (a.nome || '').localeCompare(b.nome || '', 'it'));
  const ci = new Set(ff.map(f => String(f.url || '').toLowerCase()));
  const mancano = N.FONTI_CONSIGLIATE.filter(f => !ci.has(f.url.toLowerCase()));
  const sel = (f) => `<select data-nz="nz-argomento" data-id="${esc(f.id)}" aria-label="Argomento">${Object.entries(ARGOMENTI).map(([k, l]) => `<option value="${k}"${f.argomento === k ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  return `<section class="card"><div class="card-h"><h2>${ic('rss')}Portali da leggere</h2><button class="btn sm primary" data-act="nz-nuova">${ic('plus')}Aggiungi</button></div>
    ${ff.length ? `<ul class="nz-portali">${ff.map(f => `<li class="${f.attiva === false ? 'off' : ''}">
      <label class="nz-on"><input type="checkbox" data-act="nz-attiva" data-id="${esc(f.id)}"${f.attiva === false ? '' : ' checked'}><span><b>${esc(f.nome || sito(f.url))}</b><small>${esc(f.url)}</small></span></label>
      ${sel(f)}<button class="btn sm ghost" data-act="nz-togli" data-id="${esc(f.id)}" aria-label="Togli ${esc(f.nome || '')}">${ic('trash-2')}</button></li>`).join('')}</ul>` : '<p class="muted">Nessun portale.</p>'}
    <p class="muted small">Si leggono gli articoli dei feed RSS dei portali (quasi tutti i siti di notizie li hanno). Se scrivi l'indirizzo del sito, l'app cerca da sola il suo feed; se non lo trova, la rassegna lo dice sotto la pagina del giorno.</p></section>
  ${mancano.length ? `<section class="card"><div class="card-h"><h2>${ic('sparkles')}Consigliati</h2>${mancano.length > 1 ? `<button class="btn sm" data-act="nz-consigliate">Aggiungi tutti</button>` : ''}</div>
    <ul class="nz-portali">${mancano.map(f => `<li><span><b>${esc(f.nome)}</b><small>${esc(ARGOMENTI[f.argomento] || '')} · <a href="${esc(sicuro(f.sito))}" target="_blank" rel="noopener noreferrer">${esc(sito(f.sito))}</a></small></span><button class="btn sm ghost" data-act="nz-aggiungi" data-url="${esc(f.url)}">${ic('plus')}Aggiungi</button></li>`).join('')}</ul></section>` : ''}`;
}

function schedaNuova() {
  openSheet('Nuovo portale', `<div class="fgrid">
    <label class="fld"><span class="flabel">Nome</span><div class="inwrap"><input id="nz_nome" maxlength="80" placeholder="Es. Stalle da latte"></div></label>
    <label class="fld"><span class="flabel">Indirizzo del sito o del feed</span><div class="inwrap"><input id="nz_url" type="url" inputmode="url" autocomplete="off" placeholder="https://…"></div></label>
    <label class="fld"><span class="flabel">Argomento</span><div class="inwrap"><select id="nz_arg">${Object.entries(ARGOMENTI).map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join('')}</select></div></label>
    <div class="fld"><button class="btn primary" data-act="nz-salvaNuova">${ic('check')}Salva</button></div></div>`);
}

/* ================= azioni ================= */

export async function nzAct(a, b, d) {
  const rifai = () => bus.render();
  switch (a) {
    case 'nz-giorno': if (d.g) { UI.f.nz_g = d.g; rifai(); window.scrollTo(0, 0); } return;
    case 'nz-sceltaGiorno': UI.f.nz_g = b.value; return rifai();
    case 'nz-per': UI.f.nz_per = Number(d.v) || 36; return rifai();
    case 'nz-consigliate': { const n = await N.aggiungiConsigliate(); toast(n ? `Aggiunti ${n} portali` : 'Ci sono già tutti'); return rifai(); }
    case 'nz-aggiungi': {
      const f = N.FONTI_CONSIGLIATE.find(x => x.url === d.url); if (!f) return;
      await store.put('fonti', null, { nome: f.nome, url: f.url, sito: f.sito, argomento: f.argomento, attiva: true }); toast('Aggiunto ' + f.nome); return rifai();
    }
    case 'nz-nuova': return schedaNuova();
    case 'nz-salvaNuova': {
      const val = id => String((document.getElementById(id) || {}).value || '').trim();
      const url = val('nz_url');
      if (!/^https?:\/\/[^\s/]+\.[^\s]+$/i.test(url)) return toast('Scrivi un indirizzo che comincia con https://', 'err');
      if (S.fonti.some(f => String(f.url || '').toLowerCase() === url.toLowerCase())) return toast('Questo portale c\'è già', 'err');
      await store.put('fonti', null, { nome: val('nz_nome') || sito(url), url, argomento: val('nz_arg') || 'altro', attiva: true });
      closeSheet(); toast('Portale aggiunto: lo leggo dalla prossima rassegna'); return rifai();
    }
    case 'nz-attiva': { const f = S.fonti.find(x => x.id === d.id); if (!f) return; const { id, ...dati } = f; await store.put('fonti', id, Object.assign(dati, { attiva: !!b.checked })); return rifai(); }
    case 'nz-argomento': { const f = S.fonti.find(x => x.id === d.id); if (!f) return; const { id, ...dati } = f; await store.put('fonti', id, Object.assign(dati, { argomento: b.value })); return rifai(); }
    case 'nz-togli': return arm(b, 'Tocca ancora per togliere', async () => { await store.remove('fonti', d.id); toast('Portale tolto'); rifai(); });
    case 'nz-aggiorna': {
      b.disabled = true;
      try { await N.aggiornaAdesso(); toast('Sto leggendo i portali: la pagina di oggi arriva fra un minuto o due'); }
      finally { b.disabled = false; }
      return;
    }
    case 'nz-pc': {
      b.disabled = true; const t = b.innerHTML; b.innerHTML = ic('loader') + 'L\'IA del PC sta scrivendo…';
      try { await N.riassuntoPC(d.g); toast('Riassunto dell\'IA del PC salvato'); rifai(); }
      finally { b.disabled = false; b.innerHTML = t; }
      return;
    }
  }
}
