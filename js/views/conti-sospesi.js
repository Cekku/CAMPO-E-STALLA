// Conti → In sospeso: elenco unico delle cose aperte, con le proposte che l'app sa preparare da sola
// (conti del bilancino da spostare sugli alimenti; fatture non trovate nei movimenti della banca).
import { UI } from '../state.js';
import { esc, nf, fd } from '../util.js';
import { ic } from '../icons.js';
import { toast, arm } from '../ui.js';
import { tabella, bottoniExport, fmtVal } from '../conti/tabelle.js';
import { sospesi, contiAlimenti, applicaAlimenti, nonAbbinate, nomeRiga, RIGA_ALIMENTI, fmtMesi } from '../conti/sospesi.js';
import { anniBilancio } from '../conti/dati.js';

const SS = { no: new Set() };
const LIV = { err: ['circle-alert', 'bad', 'Da fare'], warn: ['triangle-alert', 'warn', 'Da guardare'], info: ['info', '', 'Da sapere'] };

export function vSospesi() {
  const G = sospesi();
  const tutte = G.flatMap(g => g.voci); const nE = tutte.filter(v => v.liv === 'err').length, nW = tutte.filter(v => v.liv === 'warn').length, nI = tutte.filter(v => v.liv === 'info').length;
  const kp = `<div class="kpis"><div class="kpi static"><span class="k-l">Da fare</span><span class="k-v sm${nE ? ' t-bad' : ''}">${nf(nE)}</span><span class="k-s">cose che falsano i conti</span></div><div class="kpi static"><span class="k-l">Da guardare</span><span class="k-v sm${nW ? ' t-warn' : ''}">${nf(nW)}</span><span class="k-s">controlli da fare</span></div><div class="kpi static"><span class="k-l">Da sapere</span><span class="k-v sm">${nf(nI)}</span><span class="k-s">niente di urgente</span></div></div>`;
  const intro = `<div class="note-box">${ic('info')}<span>Qui c'è tutto quello che è ancora aperto nei Conti, di tutti gli anni. Tocca una voce per aprire la pagina dove si sistema. Dove l'app sa sistemare da sola trovi più sotto la proposta con prima e dopo: non cambia niente finché non confermi.</span></div>`;
  const gruppi = G.map(g => `<section class="card"><div class="card-h"><h2>${ic(g.icn)}${esc(g.titolo)}</h2><span class="count">${g.voci.length}</span></div><div class="alerts">${g.voci.map(v => `<button class="alert ${LIV[v.liv][1]}" data-act="c-ssGo" data-go='${esc(JSON.stringify(v.go))}'><span class="a-ic">${ic(LIV[v.liv][0])}</span><span class="a-tx"><b>${esc(v.t)}</b><span>${esc(v.s)}</span></span>${ic('chevron-right', 'chev')}</button>`).join('')}</div></section>`).join('');
  const vuoto = G.length ? '' : `<section class="card"><div class="pad-x" style="padding:18px 16px"><div class="note-box">${ic('circle-check')}<span><b>Niente in sospeso.</b></span></div></div></section>`;
  return `${intro}${kp}${vuoto}${gruppi}${alimenti()}${banca()}`;
}

/* proposta: conti del bilancino da spostare sulla riga degli alimenti */
function alimenti() {
  const L = anniBilancio().sort((a, b) => b - a).flatMap(y => contiAlimenti(y));
  if (!L.length) return '';
  const k = r => r.anno + '|' + r.conto;
  const scelti = L.filter(r => !SS.no.has(k(r)));
  const codici = [...new Set(scelti.map(r => r.conto))];
  const t = tabella('ssalim', {
    title: 'Conti del bilancino da spostare sugli alimenti', sheet: 'Alimenti',
    cols: [
      { k: 'sel', h: 'Sposta', sort: false, html: r => `<input type="checkbox" data-act="c-ssSel" data-k="${esc(k(r))}"${SS.no.has(k(r)) ? '' : ' checked'} aria-label="Sposta questo conto">`, x: r => (SS.no.has(k(r)) ? 'no' : 'sì') },
      { k: 'anno', h: 'Anno', fmt: 'int' }, { k: 'codice', h: 'Conto', cls: 'nw' }, { k: 'descrizione', h: 'Descrizione', cls: 'w' }, { k: 'importo', h: 'Importo', fmt: 'eur2' },
      { k: 'prima', h: 'Prima' }, { k: 'dopo', h: 'Dopo' }, { k: 'criterio', h: 'Abbinato per', cls: 'clip' },
    ],
    rows: L.map(r => Object.assign({ prima: nomeRiga(r.riga), dopo: nomeRiga(RIGA_ALIMENTI) }, r)), tot: { sel: 'Totale', importo: L.reduce((s, r) => s + r.importo, 0) },
  });
  return `<section class="card" id="ss-alim"><div class="card-h"><h2>${ic('wheat')}Proposta: conti del bilancino sugli alimenti</h2>${bottoniExport(['ssalim'], 'Conti del bilancino sugli alimenti')}</div>
    <p class="muted small pad-x">Questi conti del bilancino hanno un nome da alimenti per il bestiame ma oggi finiscono in un'altra voce del conto economico. Spostandoli, la riga "${esc(nomeRiga(RIGA_ALIMENTI))}" si avvicina alle fatture e IOFC e costo alimentare per litro tornano veri. La scelta vale per il conto in tutti gli anni (la cambi quando vuoi nella pagina Conto economico, "Conti del bilancino").</p>${t}
    <div class="factions"><span class="sp"></span><button class="btn action" data-act="c-ssAlim"${codici.length ? '' : ' disabled'}>${ic('check')}Sposta ${codici.length === 1 ? 'il conto scelto' : `i ${nf(codici.length)} conti scelti`}</button></div></section>`;
}

/* fatture non trovate nei movimenti della banca */
function banca() {
  const NA = nonAbbinate(); if (!NA.righe.length) return '';
  const rows = NA.righe.map(x => ({ _cls: 'click', id: x.f.id, data: x.f.data, tipo: x.f.tipo, numero: x.f.numero, controparte: x.f.controparte, totale: Math.abs(+x.f.totale || 0), residuo: x.residuo, stato: x.stato, atteso: fmtMesi([x.atteso]), pagamento: x.f.pagamento || '' }));
  const t = tabella('ssbanca', {
    title: 'Fatture senza pagamento in banca', sheet: 'Non abbinate',
    cols: [{ k: 'data', h: 'Data', fmt: 'date' }, { k: 'tipo', h: 'Tipo' }, { k: 'numero', h: 'Numero', cls: 'nw' }, { k: 'controparte', h: 'Ditta', cls: 'w' }, { k: 'totale', h: 'Totale', fmt: 'eur2' }, { k: 'residuo', h: 'Da pagare', fmt: 'eur2' }, { k: 'atteso', h: 'Mese atteso' }, { k: 'pagamento', h: 'Pagamento', cls: 'clip' }],
    rows, rowAttr: r => `data-act="c-fatt" data-id="${esc(r.id)}"`, tot: { data: 'Totale', residuo: rows.reduce((s, r) => s + r.residuo, 0) },
  });
  return `<section class="card" id="ss-banca"><div class="card-h"><h2>${ic('landmark')}Fatture senza pagamento in banca</h2><span class="count">${rows.length}</span>${bottoniExport(['ssbanca'], 'Fatture senza pagamento in banca')}</div>
    <p class="muted small pad-x">Fatture che dovevano essere pagate o incassate in un mese di cui hai caricato i movimenti della banca (${esc(fmtMesi(NA.mesi))}), ma non sono abbinate a nessun movimento. I movimenti che non hai salvato non restano nell'app, quindi non posso abbinarli da qui: ricarica l'estratto conto di quel mese in Carica documenti e l'app ti propone da sola la fattura per ogni movimento (numero nella causale, ditta e importo, più fatture pagate insieme); tu controlli e salvi. Se una fattura è stata pagata in contanti o compensata, lo vedi aprendo la scheda.</p>${t}</section>`;
}

export async function sospesiAct(a, b, d, rerender) {
  if (a === 'c-ssGo') {
    let g = {}; try { g = JSON.parse(d.go || '{}'); } catch (e) { }
    UI.tab = 'conti'; UI.sub.conti = g.sub || 'panoramica'; UI.detail = null;
    if (g.anno) UI.anno = g.anno; if (g.f) UI.f[g.f] = g.v; if (g.f2) UI.f[g.f2] = g.v2;
    rerender();
    if (g.el) setTimeout(() => { const el = document.getElementById(g.el); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 60);
    else window.scrollTo(0, 0);
    return;
  }
  if (a === 'c-ssAlim') {
    const L = anniBilancio().flatMap(y => contiAlimenti(y)).filter(r => !SS.no.has(r.anno + '|' + r.conto));
    const codici = [...new Set(L.map(r => r.conto))]; if (!codici.length) return;
    return arm(b, `Conferma: sposta ${codici.length === 1 ? '1 conto' : codici.length + ' conti'}`, async () => {
      b.disabled = true;
      try { const n = await applicaAlimenti(codici); SS.no.clear(); toast(`Fatto: ${n === 1 ? '1 conto spostato' : n + ' conti spostati'} su "${nomeRiga(RIGA_ALIMENTI)}", bilancini ricalcolati`); rerender(); }
      catch (e) { toast(e.message || 'Non sono riuscito a salvare', 'err'); b.disabled = false; }
    });
  }
}
export function sospesiChange(t, rerender) {
  if (t.dataset.act === 'c-ssSel') { const k = t.dataset.k; if (t.checked) SS.no.delete(k); else SS.no.add(k); return rerender(); }
}
