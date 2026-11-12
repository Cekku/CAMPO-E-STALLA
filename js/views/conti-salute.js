// Conti → Bilancio → Salute dell'azienda (dalla 1.34.0): voto da 0 a 100 con semaforo, voti per area,
// cosa migliorare (con quanto vale in euro), da tenere d'occhio, dati che mancano e tabella esportabile.
import { UI } from '../state.js';
import { esc, nf } from '../util.js';
import { ic } from '../icons.js';
import { anniProspetto } from '../conti/dati.js';
import { tabella, bottoniExport, fmtVal } from '../conti/tabelle.js';
import { linee, COL } from '../conti/grafici.js';
import { salute, saluteMemo, haDati, serveFrase, AREE, SEMAFORO, semaforo } from '../conti/salute.js';

const card = (titolo, icona, corpo, extra = '') => `<section class="card"><div class="card-h"><h2>${ic(icona)}${esc(titolo)}</h2>${extra}</div>${corpo}</section>`;
const nota = t => `<p class="muted small pad-x">${t}</p>`;
const cls = v => (v == null ? 'muted' : semaforo(v).cls);
const val = (v, f) => (v == null ? '—' : fmtVal(v, f) || nf(v, 2));
const NOME_AREA = Object.fromEntries(AREE.map(a => [a.k, a.nome]));
const STATO = { ok: 'Conta', manca: 'Manca il dato', dubbio: 'Poco affidabile', info: 'Solo informazione', na: 'Non serve' };

/** Cerchio con il voto. */
function anello(v, size = 132) {
  const R = 52, C = 2 * Math.PI * R, l = v == null ? 0 : C * v / 100;
  return `<svg class="sal-ring ${cls(v)}" viewBox="0 0 120 120" width="${size}" height="${size}" role="img" aria-label="Voto ${v == null ? 'non disponibile' : v + ' su 100'}"><circle cx="60" cy="60" r="${R}" class="tr"/><circle cx="60" cy="60" r="${R}" class="vl" stroke-dasharray="${l.toFixed(1)} ${(C - l).toFixed(1)}" transform="rotate(-90 60 60)"/><text x="60" y="64" text-anchor="middle" class="n">${v == null ? '—' : v}</text><text x="60" y="84" text-anchor="middle" class="s">su 100</text></svg>`;
}
const barra = v => `<span class="sal-bar"><i class="${cls(v)}" style="width:${v == null ? 0 : Math.max(2, v)}%"></i></span>`;
function frase(s) {
  if (s.voto == null) return s.pochi && s.votoParziale != null ? `Ci sono troppo pochi dati per dare un voto all'anno: con i pochi indici che hanno il dato verrebbe ${s.votoParziale}, ma non è affidabile.` : "Non ci sono ancora abbastanza dati per dare un voto all'anno.";
  const forti = s.aree.filter(a => a.k !== 'dati' && a.voto != null && a.voto >= 70).map(a => a.nome.toLowerCase());
  const deboli = s.aree.filter(a => a.k !== 'dati' && a.voto != null && a.voto < 50).map(a => a.nome.toLowerCase());
  return [forti.length ? `Va bene in: ${forti.join(', ')}.` : '', deboli.length ? `Da curare: ${deboli.join(', ')}.` : '', !forti.length && !deboli.length ? 'Tutte le aree sono nella media.' : ''].filter(Boolean).join(' ');
}

/** Riquadro sintetico per la Panoramica dei Conti. */
export function saluteCard(y) {
  if (!haDati(y)) return '';
  const s = saluteMemo(y);
  const top = s.migliorare.slice(0, 2);
  return `<section class="card sal-mini"><div class="card-h"><h2>${ic('heart-pulse')}Salute dell'azienda ${y}</h2><button class="btn sm ghost" data-act="c-go" data-sub="salute">Dettaglio</button></div>
  <div class="sal-mini-b"><div class="sal-mini-r">${anello(s.voto, 96)}<div><b class="sal-sem ${s.sem.cls}">${esc(s.sem.testo)}${!s.pochi && s.affLiv.cls === 'bad' ? ' (provvisorio)' : ''}</b><span class="muted small">Affidabilità <b class="t-${s.affLiv.cls}">${esc(s.affLiv.testo)}</b> (${s.aff}%)</span></div></div>
  <div class="sal-mini-a">${s.aree.map(a => `<div class="sal-ar"><span>${esc(a.nome)}</span>${barra(a.voto)}<b class="num">${a.voto == null ? '—' : a.voto}</b></div>`).join('')}</div></div>
  ${top.length ? `<div class="sal-mini-m">${top.map(m => `<span>${ic('chevron-right')}${esc(m.label)}${m.euro ? ` · <b>${esc(fmtVal(m.euro, 'eur'))}</b>` : ''}</span>`).join('')}</div>` : ''}</section>`;
}

export function vSalute() {
  const y = UI.anno;
  if (!haDati(y)) return `<section class="card"><div class="empty">${ic('heart-pulse', 'huge')}<h3>Nessun dato del ${y}</h3><p class="muted">Il voto si costruisce dalle fatture, dal bilancio del commercialista e dai controlli AIA: carica i documenti dell'anno in Carica documenti.</p></div></section>`;
  const s = salute(y);
  const p = haDati(y - 1) ? saluteMemo(y - 1) : null;
  const dv = p && p.voto != null && s.voto != null ? s.voto - p.voto : null;

  // in alto: voto, semaforo, affidabilità
  const hero = `<section class="card sal-hero"><div class="sal-hero-v">${anello(s.voto)}</div><div class="sal-hero-t">
    <span class="eyebrow">Indice di salute ${y}</span><h2 class="sal-sem ${s.sem.cls}">${esc(s.sem.testo)}${!s.pochi && s.affLiv.cls === 'bad' ? ' <small class="muted">(provvisorio)</small>' : ''}</h2>
    <p>${esc(frase(s))}${dv != null ? ` <span class="k-delta ${dv >= 0 ? 'up' : 'down'}">${dv >= 0 ? '▲' : '▼'} ${Math.abs(dv)}</span> punti sul ${y - 1}${p.affLiv && p.affLiv.cls === 'bad' ? ' (voto del ' + (y - 1) + ' poco affidabile)' : ''}.` : ''}</p>
    <div class="sal-aff"><span>Affidabilità del voto: <b class="t-${s.affLiv.cls}">${esc(s.affLiv.testo)}</b> (${s.aff}%)</span>${barra(s.aff).replace(`class="${cls(s.aff)}"`, `class="${s.affLiv.cls}"`)}</div>
    ${s.motivi.length ? `<ul class="sal-mot">${s.motivi.map(m => `<li>${esc(m)}</li>`).join('')}</ul>` : ''}
    ${s.affLiv.cls === 'bad' ? `<div class="note-box warn">${ic('info')}<span>${s.pochi ? 'Senza voto' : 'Con così pochi dati il voto è solo indicativo'}: guarda soprattutto l'elenco dei dati che mancano.</span></div>` : ''}
  </div></section>`;

  // voti per area
  const aree = card('Voti per area', 'gauge', `<div class="sal-aree">${s.aree.map(a => `<details class="sal-area"><summary><span class="sal-ai">${ic(a.icona)}</span><span class="sal-an"><b>${esc(a.nome)}</b><span class="muted small">peso ${a.peso}% · ${a.k === 'dati' ? `${a.contati} controlli su ${a.totali} a posto` : `${a.contati} indici su ${a.totali} con il dato`}</span></span>${barra(a.voto)}<b class="sal-av num ${cls(a.voto)}">${a.voto == null ? '—' : a.voto}</b></summary>
    <div class="sal-ad"><p class="muted small">${esc(a.spiega)}</p>${a.k === 'dati'
      ? `<ul class="sal-ck">${s.controlli.map(c => `<li class="${c.ok ? 'ok' : 'ko'}">${ic(c.ok ? 'circle-check' : 'circle-x')}<span><b>${esc(c.testo)}</b>${c.ok ? '' : `<span class="muted small">${esc(c.dettaglio || '')}</span>`}</span></li>`).join('')}</ul>`
      : `<ul class="sal-ix">${a.indici.map(i => `<li class="st-${i.stato}"><span><b>${esc(i.label)}</b><span class="muted small">${esc(i.stato === 'ok' ? (i.rif ? 'riferimento ' + i.rif : '') : STATO[i.stato] + '.' + (i.perche ? ' ' + i.perche : ''))}</span></span><span class="num">${esc(val(i.v, i.f))}</span><b class="num ${i.voto == null || i.stato !== 'ok' ? 'muted' : cls(i.voto)}">${i.stato === 'ok' && i.voto != null ? i.voto : i.stato === 'dubbio' && i.voto != null ? '(' + i.voto + ')' : '—'}</b></li>`).join('')}</ul>`}</div></details>`).join('')}</div>` + nota('Tocca un\'area per vedere gli indici che la formano. Il voto dell\'area è la media dei voti degli indici che hanno il dato; il voto finale è la media delle aree, ognuna con il suo peso. Le aree senza nessun dato non contano.'));

  // cosa migliorare
  const mig = s.migliorare.length ? `<div class="alerts">${s.migliorare.slice(0, 8).map(m => `<div class="alert ${m.voto < 35 ? 'bad' : 'warn'}"><span class="a-ic">${ic('trending-down')}</span><span class="a-tx"><b>${esc(m.label)}: ${esc(val(m.v, m.f))}</b><span>${m.euro ? `Vale circa <b>${esc(fmtVal(m.euro, 'eur'))}</b> all'anno ${esc(m.eTesto)}.` : m.rif ? 'Riferimento: ' + esc(m.rif) + '.' : ''} ${esc(NOME_AREA[m.area])}, voto ${m.voto}.</span></span></div>`).join('')}</div>` + nota('Gli importi sono la distanza dalla stalla mediana (o dall\'obiettivo) moltiplicata per le tue vacche, i tuoi litri o la tua PLV: sono un ordine di grandezza, non un risparmio sicuro.')
    : '<div class="empty slim">Nessun indice con il voto sotto 55: niente di urgente da migliorare fra quelli che hanno il dato.</div>';
  // da tenere d'occhio
  const occ = s.occhio.length ? `<div class="alerts">${s.occhio.slice(0, 12).map(o => {
    const corpo = o.tipo === 'peggiora' ? `Da ${val(o.vp, o.f)} nel ${y - 1} a ${val(o.v, o.f)} nel ${y}${o.pct ? ` (${o.d >= 0 ? '+' : '−'}${nf(Math.abs(o.d) * 100, 1)} punti)` : ` (${o.d >= 0 ? '+' : '−'}${nf(Math.abs(o.d) * 100, 0)}%)`}.${o.nota ? ' ' + o.nota : ''}` : o.det || '';
    const tag = o.sub ? 'button' : 'div';
    return `<${tag} class="alert ${o.tipo === 'paghe' ? 'bad' : 'warn'}"${o.sub ? ` data-act="c-go" data-sub="${o.sub}"` : ''}><span class="a-ic">${ic(o.tipo === 'peggiora' ? 'trending-down' : o.tipo === 'paghe' ? 'users' : 'triangle-alert')}</span><span class="a-tx"><b>${esc(o.testo)}</b><span>${esc(corpo)}</span></span>${o.sub ? ic('chevron-right', 'chev') : ''}</${tag}>`;
  }).join('')}</div>` : '<div class="empty slim">Niente da segnalare: nessun indice peggiora più dell\'8% sull\'anno prima e i dati sono coerenti.</div>';

  // dati che mancano
  const man = s.mancano.length ? `<div class="alerts">${s.mancano.map(m => `<button class="alert"${m.sub ? ` data-act="c-go" data-sub="${m.sub}"` : ''}><span class="a-ic">${ic('scan-search')}</span><span class="a-tx"><b>${esc(serveFrase(m.serve).slice(0, -1))}</b><span>${esc(m.come)}. Senza, non contano: ${esc(m.indici.join(', '))}.</span></span>${m.sub ? ic('chevron-right', 'chev') : ''}</button>`).join('')}</div>` + nota('Un indice senza dato non conta né come buono né come cattivo: abbassa solo l\'affidabilità del voto.')
    : '<div class="empty slim">Ci sono tutti i dati che servono.</div>';

  // andamento negli anni
  const anni = anniProspetto(y, true).filter(haDati);
  const S2 = anni.map(a => (a === y ? s : saluteMemo(a)));
  const g = anni.length > 1 ? card('Il voto negli anni', 'chart-line', linee(anni.map(String), [{ name: 'Voto', values: S2.map(x => x.voto), color: COL.ven }, { name: 'Affidabilità', values: S2.map(x => x.aff), color: 'var(--c-y2)' }], { fmt: v => nf(v, 0), unit: '', h: 200 }) + nota('Un voto con affidabilità bassa può salire o scendere solo perché sono arrivati dati nuovi.')) : '';

  // tabelle esportabili
  const tI = tabella('salIdx', {
    title: `Indice di salute ${y}: indici`, sheet: 'Indici',
    cols: [{ k: 'area', h: 'Area', fmt: 'text' }, { k: 'label', h: 'Indice', fmt: 'text', cls: 'w' }, { k: 'valore', h: 'Tua azienda', fmt: 'text' }, { k: 'rif', h: 'Riferimento', fmt: 'text' }, { k: 'voto', h: 'Voto', fmt: 'int' }, { k: 'stato', h: 'Stato', fmt: 'text' }, { k: 'euro', h: 'Vale (€/anno)', fmt: 'eur' }, { k: 'perche', h: 'Nota', fmt: 'text', cls: 'clip' }],
    rows: s.indici.map(i => ({ area: NOME_AREA[i.area], label: i.label, valore: i.v == null ? '' : val(i.v, i.f), rif: i.rif, voto: i.stato === 'ok' ? i.voto : null, stato: STATO[i.stato], euro: i.stato === 'ok' && i.voto != null && i.voto < 55 ? i.euro : null, perche: i.perche || i.nota })),
  });
  const tA = tabella('salAree', {
    title: `Indice di salute ${y}: aree`, sheet: 'Aree', sort: false,
    cols: [{ k: 'nome', h: 'Area', fmt: 'text', cls: 'w' }, { k: 'peso', h: 'Peso %', fmt: 'int' }, { k: 'voto', h: 'Voto', fmt: 'int' }, { k: 'conta', h: 'Con il dato', fmt: 'text' }, { k: 'spiega', h: 'Come si calcola', fmt: 'text', cls: 'clip' }],
    rows: [...s.aree.map(a => ({ nome: a.nome, peso: a.peso, voto: a.voto, conta: a.k === 'dati' ? `${a.contati} di ${a.totali} controlli` : `${a.contati} di ${a.totali} indici`, spiega: a.spiega })), { nome: 'Voto complessivo', peso: 100, voto: s.voto, conta: `affidabilità ${s.affLiv.testo} (${s.aff}%)`, spiega: s.sem.testo, _cls: 'tot' }],
  });

  const come = card('Come si calcola', 'info', `<div class="pad-x sal-come">
    <p><b>Voto di un indice.</b> Ogni indice si confronta con le altre stalle da latte: se è sulla mediana prende 60, al 25% o 75% delle stalle 40 o 80, al 10% o 90% 20 o 95 (dalla parte giusta il voto sale, dall'altra scende). Dove ci sono solo la media e una fascia, la media vale 60 e i due estremi 40 e 80. Per gli indici di bilancio senza riferimenti delle stalle (liquidità, autonomia, debiti sull'EBITDA, copertura degli interessi) si usano soglie prudenti, scritte nella colonna Riferimento.</p>
    <p><b>Voto di un'area e voto finale.</b> L'area è la media dei suoi indici con il dato; il voto finale è la media delle aree, con i pesi: ${AREE.map(a => `${esc(a.nome.toLowerCase())} ${a.peso}%`).join(', ')}.</p>
    <p><b>Semaforo.</b> ${SEMAFORO.map(([s2, , t], i) => `${esc(t)} ${i === 0 ? 'da ' + s2 : i === SEMAFORO.length - 1 ? 'sotto ' + SEMAFORO[i - 1][0] : 'da ' + s2 + ' a ' + (SEMAFORO[i - 1][0] - 1)}`).join(' · ')}.</p>
    <p><b>Affidabilità.</b> È la parte del peso delle aree che ha davvero il dato. Gli indici senza dato non contano; quelli che usano un conto economico incompleto (senza ammortamenti, o con gli alimenti molto più bassi delle fatture) si mostrano fra parentesi ma non contano. Per l'anno non ancora finito l'affidabilità si riduce di un quarto. Sotto il 40% il voto è provvisorio, sotto il 25% non si dà.</p>
    <p><b>Riferimenti.</b> Bilanci 2023 di stalle del Nord Italia (Campiotti, mediana 184 vacche), controlli AIA 2024/25, CREA-RICA. Sono stalle in media più grandi e di anni con il latte intorno a 56 €/hl: servono per capire dove sei, non come giudizio preciso.</p></div>`);

  return `${hero}${aree}
  <div class="grid-2">${card('Cosa migliorare', 'trending-up', mig, `<span class="count">${s.migliorare.length}</span>`)}${card("Da tenere d'occhio", 'triangle-alert', occ, `<span class="count">${s.occhio.length}</span>`)}</div>
  ${card('Dati che mancano', 'scan-search', man, `<span class="count">${s.mancano.length}</span>`)}
  ${g}
  ${card('Tutti gli indici', 'list-checks', `<div class="pad-x">${tA}${tI}</div>`, bottoniExport(['salAree', 'salIdx'], 'Indice di salute ' + y))}
  ${come}`;
}
